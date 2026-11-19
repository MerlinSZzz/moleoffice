// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE'S MARKED PARTS KEEP THEIR WORDS, AND A PRESS NAMES ONE PART (wave 14d, DB-1, cases p, q and r).
 *
 *   (p) a change of words that would leave a part not matching the words at its place is refused, with a sentence
 *       naming the part by its words and its flag, and nothing is written.
 *   (q) a change that keeps every part's words at its place is allowed, and the parts are unchanged.
 *   (r) "Mark broken" may name one part by its place. The problem's words and `extra.intentMarkBroken` name that part,
 *       its words, its flag and the instruction it was handed with. A place with no part is refused. A press naming no
 *       part works as it did.
 *
 * The words, the agent and the label are made up for this test.
 *
 * MUTATIONS, each after a green control run, then restored (logs in out/wave-14d-db-r1):
 *   - the change-of-words check taken out: case p goes red;
 *   - the check refusing every change of body: case q goes red;
 *   - the press ignoring `part`: case r goes red;
 *   - the press allowing a place with no part: case r's refusal goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import {
  theChangeOfWordsThatBreaksAPart,
  theFlagsOf,
  theNameOfTheMark,
  THE_MARKED_PARTS_ARE_SET_WHEN_WRITTEN,
  THE_PART_NAMED_IS_NOT_ON_THE_MESSAGE,
} from '../src/shared/intent-mark.ts'
import { type LiveApp, liveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

const BODY = 'Made-up words. Please read the whole table. Then answer the question.'
const ASKED = 'Please read the whole table.'
const ASKED_FROM = BODY.indexOf(ASKED)
const ASKED_TO = ASKED_FROM + ASKED.length
const OTHER = 'Then answer the question.'
const OTHER_FROM = BODY.indexOf(OTHER)
const OTHER_TO = OTHER_FROM + OTHER.length
const OWN = { text: 'Read carefully', colour: 'green' as const, instruction: 'Read every word before you answer.' }

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

let app: LiveApp
let agentId = ''

async function ask(method: 'GET' | 'POST' | 'PATCH', path: string, headers: Record<string, string>, body?: unknown) {
  const reply = await fetch(`${app.api}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  let json: Record<string, unknown> = {}
  try {
    json = (await reply.json()) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.status, json, text: JSON.stringify(json) }
}

async function send(extra: Record<string, unknown> = {}, body = BODY): Promise<string> {
  const data = { body, to: [{ kind: 'agent', id: agentId }], ...extra }
  const filed = await ask('POST', '/api/records', AS_THE_PERSON, { kind: 'message', title: 'Made-up marked message', data })
  expect(filed.status, filed.text).toBe(theAnswerToAWriteInATestOffice(AS_THE_PERSON, { kind: 'message', data }))
  return (filed.json['record'] as { id: string }).id
}

async function readMessage(id: string): Promise<Record<string, unknown>> {
  const read = await ask('GET', `/api/messages/${id}`, AS_THE_PERSON)
  expect(read.status, read.text).toBe(200)
  return read.json['message'] as Record<string, unknown>
}

async function howManyProblems(): Promise<number> {
  const read = await ask('GET', '/api/records?kind=problem&limit=200', AS_THE_PERSON)
  expect(read.status, read.text).toBe(200)
  return ((read.json['records'] ?? []) as unknown[]).length
}

async function theReply(): Promise<string> {
  const filed = await ask('POST', '/api/records', asAgent('made-up-builder'), {
    kind: 'message',
    title: 'A made-up reply',
    data: { body: 'A made-up reply that did not do what the mark asked.', to: [{ kind: 'person', id: THE_PERSON }] },
  })
  expect(filed.status, filed.text).toBe(201)
  return (filed.json['record'] as { id: string }).id
}

const ONE_PART = [{ from: ASKED_FROM, to: ASKED_TO, quote: ASKED, intent: 'just-ask' }]

beforeAll(async () => {
  app = await liveApp({ name: 'marked-parts-kept', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const filed = await ask('POST', '/api/records', AS_THE_PERSON, {
    kind: 'agent',
    title: 'Made-up Builder',
    data: { handle: 'made-up-builder', runtime: 'claude-code', state: 'active' },
  })
  expect(filed.status, filed.text).toBe(201)
  const listed = await ask('GET', '/api/participants', AS_THE_PERSON)
  expect(listed.status, listed.text).toBe(200)
  agentId =
    ((listed.json['agents'] ?? []) as { handle?: string; id: string }[]).find((one) => one.handle === 'made-up-builder')?.id ?? ''
  expect(agentId, 'made-up-builder has no registry row').not.toBe('')
  const labels = await ask('PATCH', `/api/participants/person/${THE_PERSON}`, AS_THE_PERSON, { chatLabels: [OWN] })
  expect(labels.status, labels.text).toBe(200)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a change of the message words', () => {
  it('(p) that would break a part is refused with a sentence naming the part and its flag, and nothing is written', async () => {
    const id = await send({ markedParts: ONE_PART })
    const changed = `${BODY.slice(0, ASKED_FROM)}Please read the small table.${BODY.slice(ASKED_TO)}`
    const reply = await ask('PATCH', `/api/records/${id}`, AS_THE_PERSON, { dataPatch: { body: changed } })
    expect(reply.status, reply.text).toBe(400)
    const flagName = theNameOfTheMark('just-ask', theFlagsOf(null, null))
    const said = reply.json['error'] as string
    expect(said).toBe(theChangeOfWordsThatBreaksAPart([{ quote: ASKED, name: flagName }]))
    expect(said).toContain(ASKED)
    expect(said).toContain(flagName)
    const message = await readMessage(id)
    expect(message['body']).toBe(BODY)
    expect(message['markedParts']).toHaveLength(1)
  })

  it('(q) that keeps every part at its place is allowed, and the parts are unchanged', async () => {
    const id = await send({ markedParts: ONE_PART })
    const changed = `${BODY} A made-up sentence after the part.`
    const reply = await ask('PATCH', `/api/records/${id}`, AS_THE_PERSON, { dataPatch: { body: changed } })
    expect(reply.status, reply.text).toBe(200)
    const message = await readMessage(id)
    expect(message['body']).toBe(changed)
    const parts = message['markedParts'] as { from: number; to: number; quote: string }[]
    expect(parts).toHaveLength(1)
    expect(parts[0]!.quote).toBe(ASKED)
    expect(parts[0]!.from).toBe(ASKED_FROM)
    expect(parts[0]!.to).toBe(ASKED_TO)
  })

  it('a later write still may not change the parts themselves', async () => {
    const id = await send({ markedParts: ONE_PART })
    const read = await ask('GET', `/api/records/${id}`, AS_THE_PERSON)
    expect(read.status, read.text).toBe(200)
    const data = (read.json['record'] as { data: Record<string, unknown> }).data
    const same = await ask('PATCH', `/api/records/${id}`, AS_THE_PERSON, { data })
    expect(same.status, same.text).toBe(200)
    const taken = await ask('PATCH', `/api/records/${id}`, AS_THE_PERSON, { dataPatch: { markedParts: [] } })
    expect(taken.status, taken.text).toBe(403)
    expect(taken.json['error']).toBe(THE_MARKED_PARTS_ARE_SET_WHEN_WRITTEN)
  })
})

describe('the mark-broken press names one part', () => {
  it('(r) names the part, its words, its flag and the instruction it was handed with', async () => {
    const parts = [
      { from: ASKED_FROM, to: ASKED_TO, quote: ASKED, intent: 'just-ask' },
      { from: OTHER_FROM, to: OTHER_TO, quote: OTHER, label: { text: OWN.text, colour: OWN.colour } },
    ]
    const id = await send({ markedParts: parts })
    const replyId = await theReply()
    const pressed = await ask('POST', `/api/messages/${replyId}/mark-broken`, AS_THE_PERSON, { markedMessage: id, part: 1 })
    expect(pressed.status, pressed.text).toBe(200)
    const problem = pressed.json['problem'] as string
    const read = await ask('GET', `/api/records/${problem}`, AS_THE_PERSON)
    expect(read.status, read.text).toBe(200)
    const record = read.json['record'] as { title: string; data: Record<string, unknown> }
    const data = record.data
    const extra = data['extra'] as { intentMarkBroken: { part: { index: number; from: number; to: number; quote: string; name: string; asks: string } } }
    expect(extra.intentMarkBroken.part.index).toBe(1)
    expect(extra.intentMarkBroken.part.from).toBe(OTHER_FROM)
    expect(extra.intentMarkBroken.part.to).toBe(OTHER_TO)
    expect(extra.intentMarkBroken.part.quote).toBe(OTHER)
    expect(extra.intentMarkBroken.part.name).toBe(OWN.text)
    expect(extra.intentMarkBroken.part.asks).toBe(OWN.instruction)
    const symptom = data['symptom'] as string
    expect(symptom).toContain(OTHER)
    expect(symptom).toContain(OWN.text)
    expect(symptom).toContain(OWN.instruction)
    expect(record.title).toContain(OWN.text)
  })

  it('(r) refuses a place with no part, and a press naming no part still works', async () => {
    const id = await send({ markedParts: ONE_PART })
    const replyId = await theReply()
    const before = await howManyProblems()
    const wrong = await ask('POST', `/api/messages/${replyId}/mark-broken`, AS_THE_PERSON, { markedMessage: id, part: 9 })
    expect(wrong.status, wrong.text).toBe(400)
    expect(wrong.json['error']).toBe(THE_PART_NAMED_IS_NOT_ON_THE_MESSAGE)
    expect(await howManyProblems()).toBe(before)
    const whole = await send({ intent: 'proposal-first' })
    const secondReply = await theReply()
    const pressed = await ask('POST', `/api/messages/${secondReply}/mark-broken`, AS_THE_PERSON, { markedMessage: whole })
    expect(pressed.status, pressed.text).toBe(200)
    expect(pressed.json['filed']).toBe(true)
  })
})
