// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY PART OF A MESSAGE THAT HOLDS SOMEBODY'S WORDS IS JUDGED FOR A KEY (problem __4iR4FkFAGS, wave 13w round 4), and
 * since round 10 a part that seems to hold one is reminded about, never refused.
 *
 * Round 2 judged a message's title, summary and body. A message carries other words its writer wrote: the `from` line,
 * the hint of who a comment is for, the sentence behind a line, the words a comment or a quote selects, a picture's
 * text, the words a person typed to choose a reader, and the machine and program an emergency is shown on. Each is
 * stored in the database and in every backup as the body is, so each is judged by the same shapes. The list, and why
 * each other field is left out, is src/shared/message-keys.ts.
 *
 * EVERY KEY HERE IS MADE UP, and is put together when the test runs, so this file holds nothing of a key's shape. Every
 * agent and record is made up for the test, in a fresh database.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS IT RED
 * ---------------------------------------------------------------------------------------
 *
 *   · for each judged field, the message with ordinary words there is stored with no reminder (the control that the
 *     message is otherwise a good one), and the same message with a made-up key there is stored too, and its answer
 *     carries the reminder for the key's shape, naming the field. Until round 10 such a message was
 *     refused; a decision of the owner's made the refusal a reminder.
 *     CONTROL on the code before round 4: every case that expected a refusal went red, and the edit case too.
 *     MUTATION, one per field: take that field's line out of theWordsOfAMessage (src/shared/message-keys.ts). That
 *     field's case goes red.
 *     `seen.quote` is judged as well (wave 13w round 5, the secretary's message vjafrEk1UXk0, answer 3). It is let through only
 *     where its words are stored in the record its target names, and no target that may carry a `seen` names a record
 *     (`seenRuleFor` in src/shared/targets.ts), so today it is always judged.
 *     CONTROL on the code before round 5: its case went red. MUTATION: leave `seen` out of theQuotedWordsOf. Red.
 *   · a comment quoting words that are stored in the record it quotes is stored with no reminder, though the words hold
 *     a long run. MUTATION: in theKeyReminderFor (src/server/lib/message-keys.ts), drop theWordsAreStoredIn. Red.
 *   · an edit that puts a key into the title is stored, and its answer carries the reminder naming `title`. Until
 *     round 10 this case edited `from` and was refused for the key, because the key was judged first; with no key
 *     refusal left, the door refuses that edit for its own reason, that a writer may change only the title and the
 *     body, and the case says so. MUTATION: in patchRecord (src/server/lib/records.ts), ask only the stored words'
 *     body again. Red.
 */

import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WRITER = 'wk-writer'
const READER = 'wk-reader'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': 'default' })

/** A made-up key of the apiKey shape, put together here. */
const A_KEY = 'sk-' + 'proj' + 'a1'.repeat(10)
/** A made-up 32-character run of letters and digits, a long run as a hash or a token is. A quote holds at most 60 characters. */
const A_RUN = 'k3j9x0q2'.repeat(4)
/** A picture that is there, in the checkout: a message carries only a file the file door would serve (wave 13y, 9 November 2026). */
const A_PICTURE = fileURLToPath(new URL('../assets/architecture/general-en.png', import.meta.url))

let t: TestDb
let app: FastifyInstance
let report = ''

async function send(as: Record<string, string>, data: Record<string, unknown>, title = 'Test: a message'): Promise<{ status: number; body: string; id: string | null }> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: as, payload: { kind: 'message', title, data } })
  // THE ID IS THE RECORD THE ANSWER CARRIES. A 409 for an addressee nothing holds carries the message it stored, as a 201 does.
  const id = (reply.json() as { record?: { id: string } }).record?.id ?? null
  return { status: reply.statusCode, body: reply.body, id }
}

const toTheReader = { body: 'Test: an ordinary message.', to: [{ kind: 'agent', id: READER }] }
/**
 * THE ANSWER A SEND OF `data` IS GIVEN. Nothing holds the reader in the test office, so the office stores a message to
 * it, routes it and answers 409; the message is stored all the same, and the answer carries its record and any reminder.
 * A comment on the note is not addressed to the reader, and keeps its 201.
 */
const theAnswerTo = (data: Record<string, unknown>): number =>
  ((data['to'] as { id: string }[] | undefined) ?? []).some((one) => one.id === READER) ? 409 : 201
/** A comment on the report, quoting `quote` from it. The quote's offsets are where it is in the report's summary. */
const aComment = (quote: string): Record<string, unknown> => ({
  body: 'Test: a remark on this.',
  target: { target: { kind: 'record', recordId: report, workspaceId: 'default' }, span: { quote, from: 0, to: quote.length } },
})

/** Each judged field: a message with `words` in that field, and the field's path in the refusal. */
const FIELDS: ReadonlyArray<readonly [string, (words: string) => Record<string, unknown>]> = [
  ['data.from', (words) => ({ ...toTheReader, from: words })],
  ['data.recipientHint', (words) => ({ ...aComment('Test words'), recipientHint: words })],
  ['data.saidInFull', (words) => ({ ...toTheReader, saidInFull: words })],
  ['data.target.span.quote', (words) => aComment(words)],
  ['data.quotes[0].span.quote', (words) => ({ ...toTheReader, quotes: [aComment(words)['target']] })],
  ['data.lead.span.quote', (words) => ({ ...toTheReader, lead: aComment(words)['target'] })],
  ['data.target.seen.quote', (words) => ({ body: 'Test: a remark on this page.', target: { target: { kind: 'page', route: '/records' }, seen: { route: '/records', quote: words, build: 'unknown' } } })],
  ['data.pictures[0].alt', (words) => ({ ...toTheReader, pictures: [{ id: 'p1', type: 'image', path: A_PICTURE, alt: words }] })],
  ['data.pictures[0].caption', (words) => ({ ...toTheReader, pictures: [{ id: 'p1', type: 'image', path: A_PICTURE, alt: 'Test: a picture', caption: words }] })],
  ['data.chosenRecipient.said', (words) => ({ ...aComment('Test words'), chosenRecipient: { kind: 'new', said: words } })],
  ['data.onlyOn.machine', (words) => ({ ...toTheReader, urgent: true, onlyOn: { machine: words } })],
  ['data.onlyOn.program', (words) => ({ ...toTheReader, urgent: true, onlyOn: { program: words } })],
]

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of [WRITER, READER]) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role: 'worker', workArea: ['work'] } })
    expect(reply.statusCode, reply.body).toBe(201)
  }
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(WRITER),
    payload: { kind: 'note', title: 'Test: a note to quote', summary: `Test words, and the hash ${A_RUN} of a made-up file.` },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  report = (filed.json() as { record: { id: string } }).record.id
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

const messagesNow = (): number => (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n

describe('a part of a message that holds somebody\'s words', () => {
  for (const [where, message] of FIELDS) {
    it(`is judged: ${where}`, async () => {
      const answer = theAnswerTo(message('Test words'))
      const ordinary = await send(asAgent(WRITER), message(where.endsWith('span.quote') ? 'Test words' : 'Test: ordinary words'))
      expect(ordinary.status, `the message with ordinary words is not a good one: ${ordinary.body}`).toBe(answer)
      expect(ordinary.body, 'an ordinary message has no reminder').not.toContain('keyReminder')
      const before = messagesNow()
      const keyed = await send(asAgent(WRITER), message(`Test: ${A_KEY} here`))
      expect(keyed.status, keyed.body).toBe(answer)
      const reminder = (JSON.parse(keyed.body) as { keyReminder?: { shape: string; where: string; says: string } }).keyReminder
      expect(reminder?.shape, keyed.body).toBe('apiKey')
      expect(reminder?.where).toBe(where)
      expect(reminder?.says).toContain(`its ${where} seems to hold`)
      expect(JSON.stringify(reminder)).not.toContain(A_KEY)
      expect(messagesNow(), 'the message is stored').toBe(before + 1)
    })
  }
})

describe('a quote of words stored in the record it quotes', () => {
  it('is stored, though the words hold a long run', async () => {
    const quoted = await send(asAgent(WRITER), aComment(`the hash ${A_RUN} of`))
    expect(quoted.status, quoted.body).toBe(201)
    expect(quoted.body, 'no reminder').not.toContain('keyReminder')
  })

  it('is judged when the words are not in that record', async () => {
    const quoted = await send(asAgent(WRITER), aComment(`the hash ${'q2x0j9k3'.repeat(4)} of`))
    expect(quoted.status, quoted.body).toBe(201)
    expect(quoted.body).toContain('"keyReminder"')
    expect(quoted.body).toContain('"shape":"longRun"')
  })
})

describe('an edit of a message', () => {
  it('that puts a key into the title is stored, and its answer carries the reminder', async () => {
    // Nothing holds the reader, so the send is answered 409 (`theAnswerTo`); the message is stored, and is the one edited.
    const sent = await send(asAgent(WRITER), { ...toTheReader, from: 'Test: the writer' })
    expect(sent.status, sent.body).toBe(409)
    const edited = await app.inject({ method: 'PATCH', url: `/api/records/${sent.id}`, headers: asAgent(WRITER), payload: { title: `Test: ${A_KEY}` } })
    expect(edited.statusCode, edited.body).toBe(200)
    expect(edited.body).toContain('its title seems to hold')
    expect(t.api.getRecord(sent.id!)?.title).toBe(`Test: ${A_KEY}`)
  })
  it('that puts a key into `from` is refused because `from` is fixed, not because of the key', async () => {
    // Nothing holds the reader, so the send is answered 409 (`theAnswerTo`); the message is stored, and is the one edited.
    const sent = await send(asAgent(WRITER), { ...toTheReader, from: 'Test: the writer' })
    expect(sent.status, sent.body).toBe(409)
    const edited = await app.inject({ method: 'PATCH', url: `/api/records/${sent.id}`, headers: asAgent(WRITER), payload: { dataPatch: { from: `Test: ${A_KEY}` } } })
    expect(edited.statusCode, edited.body).toBe(403)
    expect(edited.json()['code']).toBe('messageFieldNotAWord')
    expect(t.api.getRecord(sent.id!)?.data['from']).toBe('Test: the writer')
  })
})
