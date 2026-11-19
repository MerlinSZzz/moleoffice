// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ANSWERS TO THE QUESTIONS IN A REPORT, OVER HTTP.
 *
 *   PUT  /api/records/:id/answers/:blockId   the person keeps an answer to one choice or fill-in box, not sent yet
 *   POST /api/records/:id/answers/send       the person sends what a box, a button or the whole report has not sent
 *
 * The rules are in src/server/lib/answers.ts; what is here is the door. Both are the person's own acts, and an agent's
 * request is refused there, before anything is read or written, except a secretary holding the person's grant keeping
 * a draft where this office's list of what the grant carries says the grant presses it.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { keepAnAnswer, sendAnswers } from '../lib/answers.ts'

const KEEP_NOTE =
  'KEEP THE PERSON\'S ANSWER TO ONE QUESTION IN A REPORT, NOT SENT YET. Body {answer: {chosen?: [option ids], words?: ' +
  'string}}. The block is a choice or a fill-in box of the report; chosen ids are the choice\'s own options, a choice of ' +
  'one takes at most one, and the words are at most 4000 characters. An empty answer takes the kept answer away. A ' +
  'button keeps no answer: it is sent by its own press. Only the person answers; the secretary card keeps it for them, ' +
  'so a raise carries it only where this office\'s list of what the grant carries says the grant presses it, and then ' +
  'the report\'s revision names the secretary and the grant. Any other agent is refused and nothing is written. The ' +
  'reply is the report\'s answers after the write.'

const SEND_NOTE =
  'SEND THE ANSWERS A PRESS COVERS THAT HAVE NOT BEEN SENT. Body {press: {scope: "box", id} | {scope: "button", id} | ' +
  '{scope: "report"}}. A box sends the questions inside it; a button sends its own press, once; the whole report sends ' +
  'every choice and fill-in box, in a box or not. Each answer goes to the agent its box or button names, or else to the ' +
  'report\'s writer, and each agent gets ONE message with its answers and a lead back to the report. Each choice is ' +
  'recorded as the person\'s decision, linked to the report; a choice about a proposal settles it, and one about a ' +
  'decision replaces it. A send with nothing unsent is refused with 409. The person may send, or a secretary holding ' +
  'their grant may send for them where this office\'s list of what the grant carries says the grant presses it. Sending ' +
  'under the grant, the message names the secretary and the grant, and the report\'s sent answer names them beside who ' +
  'chose it. Each decision is still recorded as the person\'s decision: a send under the grant cites the grant as its ' +
  'authority, and the person\'s own send cites the report. Any other agent is refused and nothing is written. The reply ' +
  'is {messages: [{id, to}], decisions: [ids], answers}.'

const whichReport = z.object({ id: z.string().min(1) }).strict()
const whichQuestion = z.object({ id: z.string().min(1), blockId: z.string().min(1) }).strict()
const keepBody = z
  .object({
    answer: z
      .object({
        chosen: z.array(z.string().min(1)).max(4).optional(),
        words: z.string().optional(),
      })
      .strict(),
  })
  .strict()
const sendBody = z
  .object({
    press: z.discriminatedUnion('scope', [
      z.object({ scope: z.literal('box'), id: z.string().min(1) }).strict(),
      z.object({ scope: z.literal('button'), id: z.string().min(1) }).strict(),
      z.object({ scope: z.literal('report') }).strict(),
    ]),
  })
  .strict()

export async function answerRoutes(app: FastifyInstance): Promise<void> {
  app.put('/records/:id/answers/:blockId', route('answer.keep', 'remote', KEEP_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id, blockId } = parse(whichQuestion, req.params, 'The question to answer:')
    const { answer } = parse(keepBody, req.body ?? {}, 'The answer to keep:')
    const kept: { chosen?: string[]; words?: string } = {}
    if (answer.chosen !== undefined) kept.chosen = answer.chosen
    if (answer.words !== undefined) kept.words = answer.words
    return keepAnAnswer(id, blockId, kept, workspaceId, actorFrom(req))
  })

  app.post('/records/:id/answers/send', route('answer.send', 'remote', SEND_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichReport, req.params, 'The report whose answers to send:')
    const { press } = parse(sendBody, req.body ?? {}, 'The press:')
    const sent = sendAnswers(id, press, workspaceId, actorFrom(req))
    reply.status(201)
    return sent
  })
}
