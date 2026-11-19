// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW'S SEND READS ONLY THE READER'S OWN UNSENT COMMENTS IN A CONVERSATION.
 *
 * The chat's review send compares the comments it shows as not sent yet with the server's. It read the whole
 * conversation for that. GET /api/messages/conversation now takes `only=my-unsent`, and what is proved here is the
 * door on its own, in a throwaway office:
 *
 *   1. THE SAME MESSAGES. A narrowed read answers exactly the messages of a whole read that are not sent yet, are about
 *      a page and were written by the reader, which are the ones the chat's `unsentHere` keeps. Not a comment sent as it
 *      was written, not a comment for another agent, and not a plain message.
 *   2. THE SAME BYTES. Each message is the same as a whole read gives it, in the same order, and the reply says
 *      `only: "my-unsent"` right after `messages`, which a whole read does not say.
 *   3. THE SAME MARKS. A narrowed read moves to delivered the rows a whole read moves.
 *   4. REFUSED WITH A PAGE. With `limit`, `before`, `after`, `since` or `from` it is a 400 and nothing is marked.
 *
 * NOT YET RUN. The mutation that should turn case 1 red: in `theUnsentOnesOfTheConversationFrom` in
 * src/server/lib/messages.ts, drop `one.notSentYet &&` from the filter, so the comment sent as it was written is
 * answered too. The control, the mutation and the restore are for the run that proves it.
 *
 * Every page, comment and agent here is made up.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

interface Wire {
  id: string
  notSentYet: boolean
  target: unknown
  sentBy: { kind: string; id: string } | null
}
interface Reply {
  me: { kind: string; id: string }
  them: { kind: string; id: string }
  messages: Wire[]
  only?: string
  page: unknown
  markedDelivered: string[]
  answering: unknown
  couldNotTell: unknown
  replying: unknown
  workspaceId: string
}

let t: TestDb
let app: FastifyInstance
let kiln = ''
let loom = ''
let page = ''
/** The two comments kept for the kiln agent, oldest first: the ones a narrowed read must answer. */
let keptForKiln: string[] = []
let sentAtOnce = ''
let keptForLoom = ''
let plain = ''
let fromKiln = ''

async function file(headers: Record<string, string>, kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const payload = { kind, title, data }
  const res = await app.inject({ method: 'POST', url: '/api/records', headers, payload })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(theAnswerToAWriteInATestOffice(headers, payload))
  return (res.json() as { record: { id: string } }).record.id
}

async function anAgent(title: string, handle: string): Promise<string> {
  await file(PERSON, 'agent', title, { handle, runtime: 'codex', state: 'active' })
  const res = await app.inject({ method: 'GET', url: `/api/participants/agent/${handle}`, headers: PERSON })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  return (res.json() as { participant: { id: string } }).participant.id
}

const on = () => ({ target: { kind: 'record', recordId: page, workspaceId: 'default' }, place: { at: 'surface' } })

/** A comment kept for the review: it names its agent and waits for the review's send, as the chat's comments do. */
const kept = (body: string, agent: string) =>
  file(PERSON, 'message', body, { body, chosenRecipient: { kind: 'new', said: 'a made-up new agent' }, to: [{ kind: 'agent', id: agent }], target: on() })

async function read(query: string): Promise<Reply> {
  const res = await app.inject({ method: 'GET', url: `/api/messages/conversation?kind=agent&id=${kiln}${query}`, headers: PERSON })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  return res.json() as Reply
}

/** The messages of a whole read the chat's `unsentHere` keeps. */
const unsentOf = (whole: Reply): Wire[] =>
  whole.messages.filter((one) => one.notSentYet && one.target !== null && one.sentBy?.kind === whole.me.kind && one.sentBy.id === whole.me.id)

const markOf = (id: string): string =>
  (t.client.sqlite.prepare(`SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_kind = 'person'`).get(id) as { mark: string }).mark

const queueAgain = (ids: readonly string[]): void => {
  for (const id of ids) t.client.sqlite.prepare(`UPDATE message_delivery SET mark = 'queued' WHERE message_id = ? AND recipient_kind = 'person'`).run(id)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  kiln = await anAgent('Made-up kiln agent', 'kiln-unsent-test')
  loom = await anAgent('Made-up loom agent', 'loom-unsent-test')
  page = await file(PERSON, 'note', 'A made-up firing schedule', { body: 'A made-up schedule of three firings.' })
  const review = await app.inject({ method: 'POST', url: '/api/reviews', headers: PERSON, payload: { entry: on() } })
  expect(review.statusCode, review.body.slice(0, 300)).toBe(201)
  keptForKiln = [await kept('The second firing is too short.', kiln), await kept('The cone number is missing.', kiln)]
  sentAtOnce = await file(PERSON, 'message', 'Sent at once', { body: 'Sent at once from the comment box.', target: on(), to: [{ kind: 'agent', id: kiln }] })
  keptForLoom = await kept('The loom agent should read this one.', loom)
  plain = await file(PERSON, 'message', 'A plain line', { body: 'A made-up plain line.', to: [{ kind: 'agent', id: kiln }] })
  const asKiln = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': kiln }
  fromKiln = await file(asKiln, 'message', 'A made-up answer', { body: 'A made-up answer to the person.', to: [{ kind: 'person', id: THE_PERSON }] })
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('GET /api/messages/conversation?only=my-unsent', () => {
  it('answers the reader’s unsent comments as a whole read gives them, and marks the rows a whole read marks', async () => {
    expect(markOf(fromKiln), 'the agent’s answer starts queued for the person').toBe('queued')
    const first = await read('&only=my-unsent')
    expect(first.markedDelivered, 'the narrowed read did not mark the agent’s answer').toContain(fromKiln)
    expect(markOf(fromKiln)).toBe('delivered')
    // THE SAME ROWS: put back what the narrowed read moved, and a whole read moves exactly those.
    queueAgain(first.markedDelivered)
    const whole = await read('')
    expect([...whole.markedDelivered].sort()).toEqual([...first.markedDelivered].sort())
    expect('only' in whole, 'a whole read says it was narrowed').toBe(false)

    const unsent = unsentOf(whole)
    expect(unsent.map((one) => one.id), 'the whole read does not hold the two kept comments').toEqual(keptForKiln)
    const narrowed = await read('&only=my-unsent')
    expect(narrowed.markedDelivered).toEqual([])
    expect(narrowed.messages.map((one) => one.id)).toEqual(keptForKiln)
    for (const other of [sentAtOnce, keptForLoom, plain, fromKiln]) expect(narrowed.messages.map((one) => one.id)).not.toContain(other)
    expect(narrowed.messages.map((one) => JSON.stringify(one))).toEqual(unsent.map((one) => JSON.stringify(one)))

    expect(narrowed.only).toBe('my-unsent')
    const keys = Object.keys(whole)
    expect(Object.keys(narrowed)).toEqual([...keys.slice(0, keys.indexOf('messages') + 1), 'only', ...keys.slice(keys.indexOf('messages') + 1)])
    // `status` and `whatHappensToAWaitingMessage` are read live at each read, by the same lines for both.
    for (const field of ['me', 'them', 'page', 'answering', 'couldNotTell', 'replying', 'workspaceId'] as const) {
      expect(narrowed[field], field).toEqual(whole[field])
    }
  })

  it('is refused with a page, and nothing is marked', async () => {
    queueAgain([fromKiln])
    const since = encodeURIComponent('2026-11-19 07:00:00')
    for (const page of ['&limit=5', `&before=${fromKiln}`, `&after=${fromKiln}`, `&since=${since}`, `&from=${fromKiln}`]) {
      const res = await app.inject({ method: 'GET', url: `/api/messages/conversation?kind=agent&id=${kiln}&only=my-unsent${page}`, headers: PERSON })
      expect(res.statusCode, page).toBe(400)
      expect(res.body, page).toContain('Nothing was read or marked.')
    }
    const unknown = await app.inject({ method: 'GET', url: `/api/messages/conversation?kind=agent&id=${kiln}&only=everything`, headers: PERSON })
    expect(unknown.statusCode, unknown.body.slice(0, 300)).toBe(400)
    expect(markOf(fromKiln), 'a refused read marked the agent’s answer').toBe('queued')
  })
})
