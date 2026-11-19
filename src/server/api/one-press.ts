// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOORS OF A REQUEST FOR ONE PRESS, from wave 13n round 45. The rule and the known acts
 * are in src/server/lib/one-press.ts.
 *
 *   POST /api/one-press                 an agent files a request, proved by its own key
 *   GET  /api/one-press                 the newest requests, at most 25, of one state or of all
 *   GET  /api/one-press/:id             one request
 *   POST /api/one-press/:id/agree       the person agrees, and the act runs once
 *   POST /api/one-press/:id/refuse      the person refuses, and nothing runs
 *   POST /api/one-press/:id/withdraw    its asker withdraws it while it waits, proved by its own key
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { actorFrom, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import {
  KNOWN_ACTS,
  ONE_PRESS_STATES,
  agreeToARequest,
  fileARequest,
  refuseARequest,
  theNewestRequests,
  theOnePressRequest,
  withdrawARequest,
} from '../lib/one-press.ts'

const FILE_NOTE =
  'An agent asks the person to agree to one known act. Body {"act": one of ' +
  `${Object.keys(KNOWN_ACTS).map((name) => `"${name}"`).join(', ')}, "inputs": that act's fixed inputs, "because"?: the ` +
  'agent\'s own words}. "change-a-setting" takes {"panel": a panel of the Settings page, "setting": a setting in it, ' +
  '"value": a value it accepts}; "answer-an-ask-at-the-door" takes {"request": a role request id, "answer": "grant" or ' +
  '"refuse"}; "mark-a-rule-only-for-this-office" takes {"chapter": a chapter record id, "rule": a rule id, ' +
  '"only": true or false}; "change-what-the-grant-carries" takes {"changes": [{"door": a door on the list of what the ' +
  'person\'s grant carries, "answer": "kept", "ask-first", "may-press" or "default"}]}, and only the person\'s own press ' +
  'agrees to it. The office checks the inputs and writes the sentence the person reads. An act outside the list, or a ' +
  'setting a request may not change, is refused in words. Only an agent proved by its own key may file one.'

const LIST_NOTE =
  'The newest requests for one press, at most 25. Query ?state= one of waiting, done, could-not, refused, withdrawn, ' +
  'and ?limit= at most 25.'

const READ_NOTE = 'One request for one press: the act, its inputs, the sentence the person reads, and where it stands.'

const AGREE_NOTE =
  'The person agrees, and the office runs the act once, as the one who pressed. The reply says what the act did, or ' +
  'why it could not run. Only the person may press it, or a secretary holding their grant where this office\'s list of ' +
  'what the grant carries says the grant presses both this door and the door of the act the request runs; the ' +
  'secretary card keeps this door for the person, and never lets the grant agree to a request the same secretary ' +
  'filed. A request to change what the grant carries is agreed to only by the person\'s own press. Never in a test ' +
  'world. Takes no body.'

const REFUSE_NOTE =
  'The person refuses, and nothing runs. Only the person may press it, or a secretary holding their grant where this ' +
  'office\'s list of what the grant carries says the grant presses it; the secretary card keeps it for the person, and ' +
  'the answer then names the secretary. Never in a test world. Takes no body.'

const WITHDRAW_NOTE = 'The agent that asked takes its request back while it waits, proved by its own key. Takes no body.'

const fileBody = z.strictObject({ act: z.string(), inputs: z.unknown(), because: z.string().max(2000).optional() })
const whichOne = z.strictObject({ id: z.string().min(1) })
const listQuery = z.strictObject({
  state: z.enum(ONE_PRESS_STATES).optional(),
  limit: z.coerce.number().int().min(1).max(25).optional(),
})

export async function onePressRoutes(app: FastifyInstance): Promise<void> {
  app.post('/one-press', route('one-press.file', 'remote', FILE_NOTE), async (req, reply) => {
    const body = parse(fileBody, req.body ?? {}, 'The request')
    const filed = fileARequest({ act: body.act, inputs: body.inputs, because: body.because ?? null, actor: actorFrom(req), workspaceId: workspaceOf(req) })
    void reply.code(201)
    return { request: filed }
  })

  app.get('/one-press', route('one-press.list', 'remote', LIST_NOTE), async (req) => {
    const query = parse(listQuery, req.query ?? {}, 'The list asked for')
    return { requests: theNewestRequests(query.limit ?? 25, query.state ?? null) }
  })

  app.get('/one-press/:id', route('one-press.read', 'remote', READ_NOTE), async (req) => {
    const which = parse(whichOne, req.params, 'The request asked for')
    return { request: theOnePressRequest(which.id) }
  })

  app.post('/one-press/:id/agree', route('one-press.agree', 'remote', AGREE_NOTE), async (req) => {
    takesNoInput(req, 'POST /api/one-press/:id/agree', 'The request is named in the path.')
    const which = parse(whichOne, req.params, 'The request asked for')
    return { request: agreeToARequest(which.id, actorFrom(req)) }
  })

  app.post('/one-press/:id/refuse', route('one-press.refuse', 'remote', REFUSE_NOTE), async (req) => {
    takesNoInput(req, 'POST /api/one-press/:id/refuse', 'The request is named in the path.')
    const which = parse(whichOne, req.params, 'The request asked for')
    return { request: refuseARequest(which.id, actorFrom(req)) }
  })

  app.post('/one-press/:id/withdraw', route('one-press.withdraw', 'remote', WITHDRAW_NOTE), async (req) => {
    takesNoInput(req, 'POST /api/one-press/:id/withdraw', 'The request is named in the path.')
    const which = parse(whichOne, req.params, 'The request asked for')
    return { request: withdrawARequest(which.id, actorFrom(req)) }
  })
}
