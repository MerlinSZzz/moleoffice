// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOORS OF A READINESS CHECKLIST, from wave 13u round 13. The rule,
 * the gated operations and the gate are in src/server/lib/readiness.ts.
 *
 *   GET  /api/readiness                          the newest checklists, at most 25, of one state or of all
 *   GET  /api/readiness/waiting-for              the checklists waiting for one signer: the caller, or ?signer=
 *   GET  /api/readiness/:id                      one checklist, its signers and who has signed
 *   POST /api/readiness                          raise one for a gated operation, or sign the one already waiting
 *   POST /api/readiness/:id/sign                 an agent signs, for itself, proved by its own key
 *   POST /api/readiness/:id/sign-as-the-person   the person signs; nobody else may press it
 *   POST /api/readiness/:id/withdraw             a signer takes its signature back before it runs
 *   POST /api/readiness/:id/cancel               the person, or whoever raised it, cancels it; nothing runs
 *
 * THE DOORS THAT CAN RUN A GATED OPERATION ARE KEPT TO THIS MACHINE, as the gated doors themselves are: the last
 * signature runs it.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { READINESS_STATES } from '@shared/readiness-checklists.ts'
import { actorFrom, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import {
  GATED_OPERATIONS,
  READINESS_MINUTES,
  cancelAChecklist,
  raiseOrSign,
  signAsAnAgent,
  signAsThePerson,
  theCallerAsASigner,
  theChecklistsWaitingFor,
  theNewestChecklists,
  theReadinessChecklist,
  withdrawASignature,
  type ASignerRef,
  type ThroughTheGate,
} from '../lib/readiness.ts'
import { PanelError } from '../lib/panel-error.ts'
import { THE_PERSON } from '@shared/person.ts'
import { sqlite } from '../db/client.ts'
import { theOneAgentAStringNames } from '../lib/agent-references.ts'

const OPERATIONS = Object.keys(GATED_OPERATIONS).map((name) => `"${name}"`).join(' and ')

const RAISE_NOTE =
  `Raise a readiness checklist for one gated operation, or sign the one already waiting on it. Body {"operation": ${OPERATIONS}, ` +
  '"inputs": that operation\'s inputs, "because"?: your own words, "withinMinutes"?: how long it waits for signatures, ' +
  `${String(READINESS_MINUTES.least)} to ${String(READINESS_MINUTES.most)}, ${String(READINESS_MINUTES.unsaid)} when unsaid}. "harnesses.install" takes ` +
  '{"harnesses": agent tool ids} and only the person raises it. The office ' +
  'works out the signers from who the operation affects, and the caller cannot choose them. The caller signs where it is one ' +
  'of them. When that makes everyone, the office runs the operation now and the reply says what it did. Raised by the person ' +
  'or by an agent proved by its own key.'

const LIST_NOTE = 'The newest readiness checklists, at most 25. Query ?state= one of ' + `${READINESS_STATES.join(', ')}, and ?limit= at most 25.`

const WAITING_NOTE =
  'The readiness checklists that wait for one signer\'s signature, oldest first. With no query it is the caller: the person, ' +
  'or an agent proved by its own key. ?signer=person or ?signer=agent:<id or handle> reads another signer\'s.'

const READ_NOTE = 'One readiness checklist: the operation, the sentence its signers read, its level, every signer with why and when they signed, and where it stands.'

const SIGN_NOTE =
  'An agent signs a readiness checklist, for itself, proved by its own key. It must be one of the signers. When that makes ' +
  'everyone, the office runs the operation now and the reply says what it did. Takes no body.'

const PERSON_NOTE =
  'The person signs a readiness checklist. Only the person may press it, and never in a test world. When that makes ' +
  'everyone, the office runs the operation now and the reply says what it did. Takes no body.'

const WITHDRAW_NOTE = 'A signer takes its own signature back while the checklist still waits. Takes no body.'

const CANCEL_NOTE = 'The person, or whoever raised it, cancels a readiness checklist that still waits, and nothing runs. Takes no body.'

const raiseBody = z.strictObject({
  operation: z.string(),
  inputs: z.unknown(),
  because: z.string().max(2000).optional(),
  withinMinutes: z.number().int().optional(),
})
const whichOne = z.strictObject({ id: z.string().min(1) })
const listQuery = z.strictObject({
  state: z.enum(READINESS_STATES).optional(),
  limit: z.coerce.number().int().min(1).max(25).optional(),
})
const waitingQuery = z.strictObject({ signer: z.string().min(1).optional() })

/** What a press that can run the operation answers: the checklist, and what ran when it ran. */
function answered(gate: ThroughTheGate): Record<string, unknown> {
  return gate.ran ? { checklist: gate.checklist, ran: true, said: gate.did.said, reply: gate.did.reply } : { checklist: gate.checklist, ran: false }
}

/** The signer `?signer=` names, read loosely and shown back in the reply. */
function theSignerNamed(said: string): ASignerRef {
  if (said === 'person') return { kind: 'person', id: THE_PERSON }
  if (said.startsWith('agent:') && said.length > 'agent:'.length) {
    const agent = theOneAgentAStringNames(sqlite, said.slice('agent:'.length))
    if (agent === null) throw new PanelError(`No agent on the registry is "${said.slice('agent:'.length)}".`, 404)
    return { kind: 'agent', id: agent.id }
  }
  throw new PanelError(`?signer= is "person" or "agent:" and an agent's id or handle; "${said}" is neither.`, 400)
}

export async function readinessRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/readiness',
    route('readiness.raise', 'local', { because: 'acts-on-this-machine', act: 'Raising a readiness checklist' }, RAISE_NOTE),
    async (req, reply) => {
      const body = parse(raiseBody, req.body ?? {}, 'The checklist')
      const gate = await raiseOrSign({
        operation: body.operation,
        inputs: body.inputs,
        because: body.because ?? null,
        minutes: body.withinMinutes ?? null,
        actor: actorFrom(req),
        workspaceId: workspaceOf(req),
      })
      void reply.code(gate.ran ? 200 : 201)
      return answered(gate)
    },
  )

  app.get('/readiness', route('readiness.list', 'remote', LIST_NOTE), async (req) => {
    const query = parse(listQuery, req.query ?? {}, 'The list asked for')
    return { checklists: theNewestChecklists(query.limit ?? 25, query.state ?? null) }
  })

  app.get('/readiness/waiting-for', route('readiness.waiting-for', 'remote', WAITING_NOTE), async (req) => {
    const query = parse(waitingQuery, req.query ?? {}, 'The signer asked for')
    const signer = query.signer === undefined ? theCallerAsASigner(actorFrom(req)) : theSignerNamed(query.signer)
    if (signer === null) {
      throw new PanelError('This request is neither the person nor an agent proved by its own key, so it waits for nothing. Name a signer with ?signer=.', 400)
    }
    return { signer, checklists: theChecklistsWaitingFor(signer) }
  })

  app.get('/readiness/:id', route('readiness.read', 'remote', READ_NOTE), async (req) => {
    const which = parse(whichOne, req.params, 'The checklist asked for')
    return { checklist: theReadinessChecklist(which.id) }
  })

  app.post(
    '/readiness/:id/sign',
    route('readiness.sign', 'local', { because: 'acts-on-this-machine', act: 'Signing a readiness checklist' }, SIGN_NOTE),
    async (req) => {
      takesNoInput(req, 'POST /api/readiness/:id/sign', 'The checklist is named in the path.')
      const which = parse(whichOne, req.params, 'The checklist asked for')
      return answered(await signAsAnAgent(which.id, actorFrom(req)))
    },
  )

  app.post(
    '/readiness/:id/sign-as-the-person',
    route('readiness.sign-as-the-person', 'local', { because: 'acts-on-this-machine', act: 'Signing a readiness checklist as the person' }, PERSON_NOTE),
    async (req) => {
      takesNoInput(req, 'POST /api/readiness/:id/sign-as-the-person', 'The checklist is named in the path.')
      const which = parse(whichOne, req.params, 'The checklist asked for')
      return answered(await signAsThePerson(which.id, actorFrom(req)))
    },
  )

  app.post('/readiness/:id/withdraw', route('readiness.withdraw', 'remote', WITHDRAW_NOTE), async (req) => {
    takesNoInput(req, 'POST /api/readiness/:id/withdraw', 'The checklist is named in the path.')
    const which = parse(whichOne, req.params, 'The checklist asked for')
    return { checklist: withdrawASignature(which.id, actorFrom(req)) }
  })

  app.post('/readiness/:id/cancel', route('readiness.cancel', 'remote', CANCEL_NOTE), async (req) => {
    takesNoInput(req, 'POST /api/readiness/:id/cancel', 'The checklist is named in the path.')
    const which = parse(whichOne, req.params, 'The checklist asked for')
    return { checklist: cancelAChecklist(which.id, actorFrom(req)) }
  })
}
