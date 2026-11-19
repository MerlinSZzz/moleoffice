// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REASON A SECRETARY GIVES FOR PRESSING A DOOR FOR THE PERSON, taken off the request before the door reads it.
 *
 * Under the person's grant a secretary may press a door for them, and each press gives its reason. The reason travels
 * in one field, the way a warrant does:
 *
 *     "forThePerson": { "reason": "…" }
 *
 * in the body, or, on a request with no body (a DELETE, since the office tool sends a body only on POST, PUT and
 * PATCH), as `forThePerson.reason=…` in the query.
 *
 * IT IS TAKEN OFF HERE, AND NO DOOR'S SCHEMA CHANGES. Every door reads its body with its own `parse()`, most of them
 * strict, so a field one door did not name would be refused by it. This hook runs before every door's handler, takes
 * the field off the body or the query, checks it, and puts the reason on the request's press (`thePressOf` in
 * lib/http.ts). `mayPressForThePerson` in lib/records/own-words.ts reads it there.
 *
 * WHAT IT REFUSES, with 400 and nothing done:
 *   - a field that is not an object holding one `reason`, or a reason that is empty or longer than the limit;
 *   - a reason in both the body and the query, because Mole Office would have to choose one;
 *   - a reason on a request that is not an agent's. The person presses their own doors, and a reason written on the
 *     person's request would read as a secretary's press. A warrant on the person's request is refused for the same
 *     reason (`actorWithTheWordsItActsOn` in lib/http.ts).
 *
 * A REASON FROM AN AGENT THAT HOLDS NO GRANT IS NOT REFUSED. It is kept on the request and nothing reads it, because
 * only a press under the grant is written down.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { actorFrom, explain, resolvedActorOf, resolvedWorkspaceOf, thePressOf } from './http.ts'
import { THE_LONGEST_REASON_FOR_THE_PERSON, writeDownAPressOutsideTheLog } from './records.ts'
import { PanelError } from './panel-error.ts'

/** The field's name in the body. */
const THE_FIELD = 'forThePerson'

/** Its name in the query, for a request with no body. */
const THE_QUERY_KEY = 'forThePerson.reason'

const THE_REASON = z.strictObject({
  reason: z.string().trim().min(1).max(THE_LONGEST_REASON_FOR_THE_PERSON),
})

/**
 * Take the reason off one request, check it and put it on the request's press. Nothing happens to a request that
 * carries none.
 */
export function takeTheReasonForThePerson(req: FastifyRequest): void {
  const inTheBody = takeItOffTheBody(req)
  const inTheQuery = takeItOffTheQuery(req)
  if (inTheBody === undefined && inTheQuery === undefined) return
  if (inTheBody !== undefined && inTheQuery !== undefined) {
    throw new PanelError(
      `This request gives a reason for the person both in its body (${THE_FIELD}) and in its query (${THE_QUERY_KEY}). ` +
        'Nothing was done. Give it once: in the body, or in the query where the request has no body.',
    )
  }
  const read = THE_REASON.safeParse(inTheBody ?? { reason: inTheQuery })
  if (!read.success) {
    throw new PanelError(
      `The reason for the person is not usable: ${explain(read.error)} Nothing was done. Send ${THE_FIELD}: ` +
        `{"reason": "…"}, up to ${String(THE_LONGEST_REASON_FOR_THE_PERSON)} characters saying why you press this for ` +
        'the person.',
    )
  }
  if (actorFrom(req, { whoOnly: true }).type !== 'agent') {
    throw new PanelError(
      `This request is the person's own, and it carries a reason for the person (${THE_FIELD}). Nothing was done. A ` +
        "reason is a secretary's, given when it presses a door for the person under their grant. The person's own " +
        'press needs none, so send it without one.',
    )
  }
  thePressOf(req).reason = read.data.reason
}

/** The field the body carried, taken off it, or undefined where it carried none. */
function takeItOffTheBody(req: FastifyRequest): unknown {
  const body = req.body
  if (body === null || typeof body !== 'object' || Array.isArray(body) || !Object.hasOwn(body, THE_FIELD)) return undefined
  const said = (body as Record<string, unknown>)[THE_FIELD]
  delete (body as Record<string, unknown>)[THE_FIELD]
  return said
}

/**
 * The reason the query carried, taken off it, or undefined where it carried none. Any other key that starts with the
 * field's name is refused, so a reason spelt another way is not quietly left for the door to refuse in other words.
 */
function takeItOffTheQuery(req: FastifyRequest): unknown {
  const query = req.query
  if (query === null || typeof query !== 'object') return undefined
  const keys = Object.keys(query).filter((key) => key.startsWith(THE_FIELD))
  if (keys.length === 0) return undefined
  const misspelt = keys.filter((key) => key !== THE_QUERY_KEY)
  if (misspelt.length > 0) {
    throw new PanelError(
      `The query names ${misspelt.map((key) => `"${key}"`).join(', ')}. A reason for the person goes in the query as ` +
        `${THE_QUERY_KEY}=…, once. Nothing was done.`,
    )
  }
  const said = (query as Record<string, unknown>)[THE_QUERY_KEY]
  delete (query as Record<string, unknown>)[THE_QUERY_KEY]
  if (Array.isArray(said)) {
    throw new PanelError(`The query gives ${THE_QUERY_KEY} ${String(said.length)} times. Give it once. Nothing was done.`)
  }
  return said
}

/**
 * Install it above every route group, before any door reads its body. A hook registered after a route group does not
 * run for that group's routes, and a door there would refuse the field in its own words or, worse, store it.
 */
export function takeTheReasonForThePersonOffEveryRequest(app: FastifyInstance): void {
  app.addHook('preValidation', async (req) => {
    takeTheReasonForThePerson(req)
  })
}

/**
 * WRITE DOWN EVERY PRESS UNDER THE GRANT, IN ONE PLACE FOR EVERY ROUTE. Wave 13s round 2a.
 *
 * The change log writes a press row beside the first change row a press under the grant writes (`logChange` in
 * lib/records.ts). A door that keeps what it changed outside the change log, such as the office scene, writes no
 * change row, and so its press was written down nowhere. This hook writes that row after the door answered: the same
 * insert, by the same function (`writeDownAPressOutsideTheLog`). Where the change log wrote the row already, it does
 * nothing, so a press is still one row.
 *
 * A READ ASKS THE CHECK AND WRITES NO PRESS ROW. Reading is not pressing: only a write made under the grant is a
 * press. Some reads ask the check to say whether the caller could change what they read, and the grant marks the
 * actor there; this hook leaves those unrecorded, because no act of the person's was done.
 *
 * ONLY ON A 2XX. A refused or failed request did nothing, so it writes no row, even where the check said yes before
 * something after it refused.
 *
 * BEFORE THE REPLY IS SENT, in `onSend`, and not in `onResponse`. A caller told 2xx can then count on the row being
 * there. If the row cannot be written, the caller is told so with a 500 that says the act was done, instead of a 2xx
 * over a press nobody can see. What this cannot cover: a crash after the door's own write and before this hook leaves
 * the act done and its press unwritten, with no reason anywhere. Only a door outside the change log is open to that,
 * because a change row and its press row are written by one transaction.
 *
 * Above every route group, for the reason every hook in buildApp is: a hook registered after a route group does not
 * run for that group's routes.
 */
export function writeDownEveryPressUnderTheGrant(app: FastifyInstance): void {
  app.addHook('onSend', async (req, reply, payload) => {
    if (reply.statusCode < 200 || reply.statusCode >= 300) return payload
    const actor = resolvedActorOf(req)
    if (actor === undefined || actor.press?.underTheGrant === undefined) return payload
    if (actor.press.aRead) return payload
    try {
      writeDownAPressOutsideTheLog(actor, resolvedWorkspaceOf(req)?.id ?? null)
    } catch (error) {
      throw new PanelError(
        `This was done under the person's grant, but its press could not be written down: ${String(error)} The act ` +
          'stands, and its reason is in no record. This is a fault in Mole Office.',
        500,
      )
    }
    return payload
  })
}
