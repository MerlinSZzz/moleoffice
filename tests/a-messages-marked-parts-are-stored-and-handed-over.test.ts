// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE'S MARKED PARTS ARE STORED, READ AND HANDED OVER (wave 14d, DB-1, cases l, n and o).
 *
 * A marked part is a run of the person's own words with a flag of its own. The message is still one message, and a
 * message with no parts is exactly what it was before parts existed: no field on the wire and no new line in a
 * hand-over.
 *
 * WHAT THIS FILE PROVES, against a real office:
 *   (l) one part is stored and read with its words and flag, and the envelope names it in one line with the
 *       person's instruction, and names the words no part covers.
 *   (n) each fault in a part is refused with its own sentence, and nothing is written: the quote is not the words at
 *       its place, the run is outside the words, it is empty, it holds only spaces, it starts with a space, it carries
 *       two flags or none, two parts share a character, and parts sit beside a flag on the whole message.
 *   (o) no part leaves the wire and the envelope byte-for-byte as they were.
 *   AND ONLY THE PERSON puts parts on a message: an agent's message is refused, and no later write sets, changes or
 *       takes them off.
 *
 * The words, the agent and the label are made up for this test.
 *
 * MUTATIONS, each after a green control run, then restored (logs in out/wave-14d-db-r1):
 *   - the create check taken out: case n goes red;
 *   - the later-write refusal taken out: the later-write case goes red;
 *   - `theMarkedPartsOnTheWire` answering undefined: cases l and m go red;
 *   - `deliveryEnvelope` never printing a part: cases l and m go red;
 *   - the no-part guard removed: case o goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { DELIVERY_ENVELOPE, deliveryEnvelope } from '../src/shared/messages.ts'
import { whatIsNotCovered, type WrittenPiece } from '../src/shared/intent.ts'
import {
  A_MARKED_PART_HAS_NO_SPACE_AT_EITHER_END,
  A_MARKED_PART_HOLDS_ONE_FLAG,
  A_MARKED_PART_HOLDS_ONE_ASKING_MARK,
  A_MARKED_PART_HOLDS_VISIBLE_WORDS,
  aMarkedPartLabelIsNotOne,
  readTheMarkedParts,
  A_MARKED_PART_IS_A_RUN_OF_THE_WORDS,
  MARKED_PARTS_AND_A_WHOLE_FLAG,
  MARKED_PARTS_DO_NOT_OVERLAP,
  THE_MARKED_PARTS_ARE_SET_WHEN_WRITTEN,
  THE_MARKED_PARTS_ARE_THE_PERSONS,
  theFlagsOf,
  theNameOfTheMark,
  whatTheMarkAsks,
} from '../src/shared/intent-mark.ts'
import { validateData } from '../src/shared/kinds.ts'
import { readMessageLabel } from '../src/shared/message-label.ts'
import { formatValidationErrors } from '../src/shared/validation-errors.ts'
import { type LiveApp, liveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

const BODY = 'Made-up words. Please read the whole table. Then answer the question.'
const ASKED = 'Please read the whole table.'
const ASKED_FROM = BODY.indexOf(ASKED)
const ASKED_TO = ASKED_FROM + ASKED.length
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

/** File one message. A person's message to an agent answers this test office's status and is still written. */
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

async function storedData(id: string): Promise<Record<string, unknown>> {
  const read = await ask('GET', `/api/records/${id}`, AS_THE_PERSON)
  expect(read.status, read.text).toBe(200)
  return (read.json['record'] as { data: Record<string, unknown> }).data
}

async function howManyMessages(): Promise<number> {
  const read = await ask('GET', '/api/records?kind=message&limit=200', AS_THE_PERSON)
  expect(read.status, read.text).toBe(200)
  return ((read.json['records'] ?? []) as unknown[]).length
}

/** A refused write, with the sentence its rule gives and nothing written. */
async function refused(parts: unknown, sentence: string, extra: Record<string, unknown> = {}, body = BODY): Promise<void> {
  const before = await howManyMessages()
  const reply = await ask('POST', '/api/records', AS_THE_PERSON, {
    kind: 'message',
    title: 'Made-up refused message',
    data: { body, to: [{ kind: 'agent', id: agentId }], markedParts: parts, ...extra },
  })
  expect(reply.status, reply.text).toBe(400)
  expect(reply.json['error']).toBe(sentence)
  expect(await howManyMessages()).toBe(before)
}

/** The sentence the message kind gives for this data, read from the one check the door asks. */
function theKindsSentence(data: Record<string, unknown>): string {
  const checked = validateData('message', data)
  expect(checked.ok, 'the message kind accepted this made-up data, so the case would prove nothing').toBe(false)
  return formatValidationErrors('message', checked.ok ? [] : checked.errors)
}

/** A refused write whose sentence is the message kind's, with nothing written. */
async function refusedByTheKind(parts: unknown, body = BODY): Promise<void> {
  const data = { body, to: [{ kind: 'agent', id: agentId }], markedParts: parts }
  const sentence = theKindsSentence(data)
  const before = await howManyMessages()
  const reply = await ask('POST', '/api/records', AS_THE_PERSON, { kind: 'message', title: 'Made-up refused message', data })
  expect(reply.status, reply.text).toBe(400)
  expect(reply.json['error']).toBe(sentence)
  expect(await howManyMessages()).toBe(before)
}

/** The runs of the words that no part covers, as a part with the given run holds them. */
function theRest(body: string, from: number, to: number): string[] {
  const piece: WrittenPiece = { id: 'one', from, to, quote: body.slice(from, to), reading: '', intents: [], artefacts: [] }
  return whatIsNotCovered(body, [piece]).map((run) => body.slice(run.from, run.to))
}

beforeAll(async () => {
  app = await liveApp({ name: 'marked-parts-stored', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const filed = await ask('POST', '/api/records', AS_THE_PERSON, {
    kind: 'agent',
    title: 'Made-up Builder',
    data: { handle: 'made-up-builder', runtime: 'claude-code', state: 'active' },
  })
  expect(filed.status, filed.text).toBe(201)
  const listed = await ask('GET', '/api/participants', AS_THE_PERSON)
  expect(listed.status, listed.text).toBe(200)
  const agents = ((listed.json['agents'] ?? []) as { handle?: string; id: string }[])
  agentId = agents.find((one) => one.handle === 'made-up-builder')?.id ?? ''
  expect(agentId, 'made-up-builder has no registry row').not.toBe('')
  const labels = await ask('PATCH', `/api/participants/person/${THE_PERSON}`, AS_THE_PERSON, { chatLabels: [OWN] })
  expect(labels.status, labels.text).toBe(200)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a message with one marked part', () => {
  it('(l) is stored and read with its words and flag, and the envelope names it and the rest', async () => {
    const id = await send({ markedParts: [{ from: ASKED_FROM, to: ASKED_TO, quote: ASKED, intent: 'just-ask' }] })
    const message = await readMessage(id)
    const parts = message['markedParts'] as { from: number; to: number; quote: string; intent?: string; name: string; whatItAsks?: string }[]
    expect(parts).toHaveLength(1)
    expect(parts[0]!.from).toBe(ASKED_FROM)
    expect(parts[0]!.to).toBe(ASKED_TO)
    expect(parts[0]!.quote).toBe(ASKED)
    expect(parts[0]!.intent).toBe('just-ask')
    const flags = theFlagsOf(null, null)
    expect(parts[0]!.name).toBe(theNameOfTheMark('just-ask', flags))
    expect(parts[0]!.whatItAsks).toBe(whatTheMarkAsks('just-ask', flags))
    expect(message['noMarkName']).toBe(flags.noMark.name)
    expect(Object.hasOwn(message, 'intent')).toBe(false)
    expect(Object.hasOwn(message, 'label')).toBe(false)
    const envelope = deliveryEnvelope({
      from: 'Mole Office',
      message: id,
      body: BODY,
      markedParts: message['markedParts'] as never,
      noMarkName: message['noMarkName'] as string,
    })
    expect(envelope).toContain(DELIVERY_ENVELOPE.aMarkedPart(parts[0] as never))
    const rest = theRest(BODY, ASKED_FROM, ASKED_TO)
    expect(rest.length).toBeGreaterThan(0)
    expect(envelope).toContain(DELIVERY_ENVELOPE.theWordsWithNoFlag(rest, message['noMarkName'] as string))
  })

  it('(l) a message whose every word is in a part has no line for the rest', async () => {
    const id = await send({ markedParts: [{ from: 0, to: ASKED.length, quote: ASKED, intent: 'just-ask' }] }, ASKED)
    const message = await readMessage(id)
    const envelope = deliveryEnvelope({
      from: 'Mole Office',
      message: id,
      body: ASKED,
      markedParts: message['markedParts'] as never,
      noMarkName: message['noMarkName'] as string,
    })
    expect(envelope.some((line) => line.startsWith('MARKED PART: ')), envelope.join('\n')).toBe(true)
    expect(envelope.some((line) => line.startsWith('THE WORDS NOT IN A MARKED PART: ')), envelope.join('\n')).toBe(false)
  })

  it('(o) a hand-over given parts and no words is refused, not handed over with the rest missing', () => {
    const part = { from: 0, to: ASKED.length, quote: ASKED, intent: 'just-ask' as const, name: 'a made-up name', whatItAsks: 'a made-up instruction' }
    expect(() => deliveryEnvelope({ from: 'Mole Office', message: 'made-up-message', markedParts: [part] })).toThrow()
  })

  it('(o) no part leaves the wire and the envelope as they were, byte for byte', async () => {
    const id = await send({ intent: 'proposal-first' })
    const message = await readMessage(id)
    expect(Object.hasOwn(message, 'markedParts')).toBe(false)
    expect(Object.hasOwn(message, 'noMarkName')).toBe(false)
    const withNothingNew = deliveryEnvelope({
      from: 'Mole Office',
      message: id,
      intent: message['intent'],
      whatTheMarkAsks: message['whatTheMarkAsks'] as string,
    })
    const withTheNewFieldsAbsent = deliveryEnvelope({
      from: 'Mole Office',
      message: id,
      intent: message['intent'],
      whatTheMarkAsks: message['whatTheMarkAsks'] as string,
      body: BODY,
      markedParts: message['markedParts'] as never,
      noMarkName: message['noMarkName'] as string | undefined,
    })
    expect(withTheNewFieldsAbsent).toEqual(withNothingNew)
  })
})

describe('every fault in a marked part is refused and nothing is written', () => {
  it('(n) the quote is not the words at the place', async () => {
    await refused([{ from: ASKED_FROM, to: ASKED_TO, quote: 'Words that are not there', intent: 'just-ask' }], A_MARKED_PART_IS_A_RUN_OF_THE_WORDS)
  })

  it('(n) the run is outside the words', async () => {
    await refused([{ from: 0, to: BODY.length + 1, quote: BODY, intent: 'just-ask' }], A_MARKED_PART_IS_A_RUN_OF_THE_WORDS)
  })

  it('(n) the run is empty', async () => {
    // The quote is a visible word on purpose: a blank quote is refused by the message kind before the part's own
    // reading runs, so this case would prove the kind's sentence and not that `to` is not after `from`.
    await refused([{ from: 3, to: 3, quote: 'x', intent: 'just-ask' }], A_MARKED_PART_IS_A_RUN_OF_THE_WORDS)
  })

  it('(n) the run holds only spaces is refused by the door and by the part reading', async () => {
    const body = 'Made-up  words.'
    const part = { from: 7, to: 9, quote: '  ', intent: 'just-ask' }
    await refusedByTheKind([part], body)
    const read = readTheMarkedParts({ body, markedParts: [part] })
    expect(read.ok).toBe(false)
    expect(read.ok ? '' : read.why).toBe(A_MARKED_PART_HOLDS_VISIBLE_WORDS)
  })

  it('(n) the part carries a label that is not a word and a colour', async () => {
    const badLabel = { text: OWN.text, colour: 'orange' }
    const part = { from: ASKED_FROM, to: ASKED_TO, quote: ASKED, label: badLabel }
    await refusedByTheKind([part])
    const label = readMessageLabel(badLabel)
    expect(label.ok).toBe(false)
    const read = readTheMarkedParts({ body: BODY, markedParts: [part] })
    expect(read.ok).toBe(false)
    expect(read.ok ? '' : read.why).toBe(aMarkedPartLabelIsNotOne(label.ok ? '' : label.why))
  })

  it('(n) the run starts with a space', async () => {
    const body = 'Made-up  words.'
    await refused([{ from: 8, to: 11, quote: ' wo', intent: 'just-ask' }], A_MARKED_PART_HAS_NO_SPACE_AT_EITHER_END, {}, body)
  })

  it('(n) the part carries two flags', async () => {
    await refused(
      [{ from: ASKED_FROM, to: ASKED_TO, quote: ASKED, intent: 'just-ask', label: { text: OWN.text, colour: OWN.colour } }],
      A_MARKED_PART_HOLDS_ONE_FLAG,
    )
  })

  it('(n) the part carries no flag', async () => {
    await refused([{ from: ASKED_FROM, to: ASKED_TO, quote: ASKED }], A_MARKED_PART_HOLDS_ONE_FLAG)
  })

  it('(n) the part carries a mark that asks nothing', async () => {
    await refused([{ from: ASKED_FROM, to: ASKED_TO, quote: ASKED, intent: 'none' }], A_MARKED_PART_HOLDS_ONE_ASKING_MARK)
  })

  it('(n) two parts share a character', async () => {
    await refused(
      [
        { from: ASKED_FROM, to: ASKED_TO, quote: ASKED, intent: 'just-ask' },
        { from: ASKED_FROM + 4, to: ASKED_TO + 4, quote: BODY.slice(ASKED_FROM + 4, ASKED_TO + 4), intent: 'just-ask' },
      ],
      MARKED_PARTS_DO_NOT_OVERLAP,
    )
  })

  it('(n) parts sit beside a flag on the whole message', async () => {
    await refused(
      [{ from: ASKED_FROM, to: ASKED_TO, quote: ASKED, intent: 'just-ask' }],
      MARKED_PARTS_AND_A_WHOLE_FLAG,
      { intent: 'proposal-first' },
    )
  })

  it('(n) parts sit beside a label on the whole message', async () => {
    await refused(
      [{ from: ASKED_FROM, to: ASKED_TO, quote: ASKED, intent: 'just-ask' }],
      MARKED_PARTS_AND_A_WHOLE_FLAG,
      { label: { text: OWN.text, colour: OWN.colour } },
    )
  })
})

describe('only the person marks parts, and no later write touches them', () => {
  it('an agent cannot put parts on its message', async () => {
    const before = await howManyMessages()
    const reply = await ask('POST', '/api/records', asAgent('made-up-builder'), {
      kind: 'message',
      title: 'A made-up agent message with parts',
      data: {
        body: ASKED,
        to: [{ kind: 'person', id: THE_PERSON }],
        markedParts: [{ from: 0, to: ASKED.length, quote: ASKED, intent: 'just-ask' }],
      },
    })
    expect(reply.status, reply.text).toBe(403)
    expect(reply.json['error']).toBe(THE_MARKED_PARTS_ARE_THE_PERSONS)
    expect(await howManyMessages()).toBe(before)
  })

  it('a later write may not set, change or take them off, and sending the stored value back is allowed', async () => {
    const id = await send({ markedParts: [{ from: ASKED_FROM, to: ASKED_TO, quote: ASKED, intent: 'just-ask' }] })
    const data = await storedData(id)
    const parts = data['markedParts']
    const changed = await ask('PATCH', `/api/records/${id}`, AS_THE_PERSON, { dataPatch: { markedParts: [] } })
    expect(changed.status, changed.text).toBe(403)
    expect(changed.json['error']).toBe(THE_MARKED_PARTS_ARE_SET_WHEN_WRITTEN)
    const dropped = await ask('PATCH', `/api/records/${id}`, AS_THE_PERSON, { data: { ...data, markedParts: undefined } })
    expect(dropped.status, dropped.text).toBe(403)
    expect(dropped.json['error']).toBe(THE_MARKED_PARTS_ARE_SET_WHEN_WRITTEN)
    const same = await ask('PATCH', `/api/records/${id}`, AS_THE_PERSON, { data })
    expect(same.status, same.text).toBe(200)
    expect((await storedData(id))['markedParts']).toEqual(parts)
  })
})
