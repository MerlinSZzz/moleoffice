// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SENT REVIEW HANDS EACH AGENT ONE MESSAGE FROM THE PERSON, AND THE PERSON'S CHAT SHOWS IT. Problems
 * `wFwcDnG5vzuK` (wave 13u round 18) and `eCrK1atZOrvA` (round 19), a decision, and the secretary's answer
 * `yMYX20nfBuep`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED 12 AND 13 OCTOBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A person who comments on an agent's report from the review pane names nobody on the comment: the
 * review says who it goes to, and by default that is the agent that wrote the page (decision
 * `9BZZVKQxWV9Z`). The review's send wrote the comments into the review's conversation and queued a
 * run there, and nothing in the person's office picks such a run up. The comment itself got no
 * delivery row, so the agent's waiter (`GET /api/handles/:handle/waiting`), the message worker and
 * the agent's own list of what is waiting for it all said nothing was waiting. Round 18 gave each
 * comment a delivery row of its own.
 *
 * Then the person found that what they send from the review pane does not show in their chat with
 * the agent (`eCrK1atZOrvA`, 13 October 00:11). A comment is not drawn in a chat: it belongs to the
 * page it was left on.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED IN ROUND 19, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * The secretary's answer `yMYX20nfBuep` follows a decision: one message per
 * recipient, from the person to the agent, with a delivery row, holding the numbered words and every
 * comment's quote. Each comment stays its own record with no delivery row of its own, so nothing is
 * handed over twice. Round 18's expectations here said each comment was handed over, named the agent in
 * `to` and had one queued delivery. They now say the opposite of each comment, and say it of the one
 * message instead.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * 1. Before the send nothing is handed to the page's author. Writing a comment in a review is not
 *    sending it (problem `g4M_z6965R5o`), and this file must not prove the opposite by accident.
 * 2. After the send the author's waiter hands over one message, and neither comment.
 * 3. That message is from the person to the agent, with one queued delivery. Its words number the two
 *    comments in the order the review pane's preview lists them, and its quotes are what each was left on.
 * 4. Each comment names nobody it went to and has no delivery row.
 * 5. The agent's own list of what is waiting for it has the message and not the comments.
 * 6. The person's chat with the agent shows the message as the person's, the same on a second read.
 * 7. No run is written.
 * 8. A send of one comment out of two gives the agent a message holding that one only.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const AS = (handle: string) => ({ ...HUMAN, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

const HANDLE = 'kiln-keeper'
const FIRST = 'Why is the second shelf lower than the first?'
const SECOND = 'The table and the paragraph above it give two firing times.'

let t: TestDb
let app: FastifyInstance
let registryId = ''

async function file(headers: Record<string, string>, kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

const on = (recordId: string) => ({ target: { kind: 'record', recordId, workspaceId: WORKSPACE }, place: { at: 'surface' } })

/** A report the agent wrote, which is what makes it who a review of the report goes to. */
async function aReportByTheAgent(title: string): Promise<string> {
  return file(AS(HANDLE), 'report', title, { for: 'Robin', date: '2026-10-01', blocks: [] })
}

/** A comment the way the review pane writes one: on the page, naming nobody. */
async function aCommentNamingNobody(body: string, page: string): Promise<string> {
  return file(HUMAN, 'message', body.slice(0, 40), { body, target: on(page) })
}

async function startAReview(page: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/reviews', headers: HUMAN, payload: { entry: on(page) } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { review: { id: string } }).review.id
}

interface Preview {
  messages: { comments: { id: string; number: number; words: string }[] }[]
}

/** What the review pane shows before the press, read after collecting is finished. */
async function finishAndPreview(review: string): Promise<Preview> {
  const done = await app.inject({ method: 'POST', url: `/api/reviews/${review}/finish-collecting`, headers: HUMAN })
  expect(done.statusCode, done.body).toBe(200)
  const res = await app.inject({ method: 'GET', url: `/api/reviews/${review}/send`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Preview
}

/** The press. The reply names each message it wrote. */
async function send(review: string, only?: string[]): Promise<{ messages: { id: string; to: string }[] }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/reviews/${review}/send`,
    headers: { ...HUMAN, ...thePersonsKeyHeader() },
    payload: only === undefined ? {} : { only },
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as { messages: { id: string; to: string }[] }
}

/** The ids the agent's waiter would hand over now. */
async function whatTheWaiterHands(): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: `/api/handles/${HANDLE}/waiting`, headers: AS(HANDLE) })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { waiting: { messageId: string }[] }).waiting.map((one) => one.messageId)
}

interface Message {
  id: string
  sentBy: { kind: string; id: string }
  to: { kind: string; id: string }[]
  body: string
  target: unknown
  quotes: { target: { recordId?: string } }[]
  deliveries: { mark: string }[]
}

async function readMessage(id: string): Promise<Message> {
  const res = await app.inject({ method: 'GET', url: `/api/messages/${id}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { message: Message }).message
}

/** The person's chat with the agent, as the chat reads it on opening and on every reload. */
async function theChat(): Promise<Message[]> {
  const res = await app.inject({ method: 'GET', url: `/api/messages/conversation?kind=agent&id=${HANDLE}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { messages: Message[] }).messages
}

const runsWritten = (): number => (t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_runs').get() as { n: number }).n

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await file(HUMAN, 'agent', 'Kiln Keeper', { handle: HANDLE, runtime: 'claude-code', state: 'active' })
  const participant = await app.inject({ method: 'GET', url: `/api/participants/agent/${HANDLE}`, headers: HUMAN })
  expect(participant.statusCode, participant.body).toBe(200)
  registryId = (participant.json() as { participant: { id: string } }).participant.id
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('two comments naming nobody, in a review of a report an agent wrote', () => {
  let page = ''
  let first = ''
  let second = ''
  let beforeTheSend: string[] = []
  let preview: Preview = { messages: [] }
  let sent: { id: string; to: string }[] = []

  beforeAll(async () => {
    page = await aReportByTheAgent('What the firing showed')
    const review = await startAReview(page)
    first = await aCommentNamingNobody(FIRST, page)
    second = await aCommentNamingNobody(SECOND, page)
    beforeTheSend = await whatTheWaiterHands()
    preview = await finishAndPreview(review)
    sent = (await send(review)).messages
  }, 120_000)

  it('hands nothing to the report’s author before the review is sent', () => {
    expect(beforeTheSend, 'a comment reached the agent before the person sent the review').toEqual([])
  })

  it('hands the report’s author one message once the review is sent, and neither comment', async () => {
    expect(sent, 'the send names no message it wrote for the agent').toEqual([{ id: expect.any(String), to: registryId }])
    expect(await whatTheWaiterHands(), 'the author’s waiter does not have the one message').toEqual([sent[0]?.id])
  })

  it('writes that message from the person to the agent, numbering the comments as the preview does, with their quotes', async () => {
    const message = await readMessage(sent[0]?.id ?? '')
    expect(message.sentBy).toEqual({ kind: 'person', id: THE_PERSON })
    expect(message.to).toEqual([{ kind: 'agent', id: registryId }])
    expect(message.deliveries.map((row) => row.mark), 'the message has no delivery to the agent').toEqual(['queued'])
    // THE PREVIEW IS WHAT WENT. The pane listed one message to this agent; its numbers and words are these.
    expect(preview.messages, 'the preview did not list one message').toHaveLength(1)
    const listed = preview.messages[0]?.comments ?? []
    expect(listed.map((one) => one.id).sort()).toEqual([first, second].sort())
    expect(message.body).toBe(listed.map((one) => `${String(one.number)}. ${one.words}`).join('\n\n'))
    // A QUOTE FOR EACH COMMENT, at the same place, and the message is not itself a comment on the page.
    expect(message.quotes.map((one) => one.target.recordId)).toEqual([page, page])
    expect(message.target).toBeNull()
  })

  it('leaves each comment naming nobody it went to, with no delivery of its own', async () => {
    for (const id of [first, second]) {
      const one = await readMessage(id)
      expect(one.to, `${id} names an agent as though it had gone on its own`).toEqual([])
      expect(one.deliveries, `${id} has a delivery of its own, so it would be handed over twice`).toEqual([])
    }
  })

  it('puts the message, and not the comments, in the agent’s own list of what is waiting for it', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/messages?only=waiting-for-me&limit=25', headers: AS(HANDLE) })
    expect(res.statusCode, res.body).toBe(200)
    const ids = (res.json() as { messages: { id: string }[] }).messages.map((one) => one.id)
    expect(ids, 'the agent’s list of what is waiting for it does not have the review’s message').toEqual([sent[0]?.id])
  })

  it('shows the message in the person’s chat with the agent, as the person’s, the same on a second read', async () => {
    for (const read of ['opening the chat', 'reloading it']) {
      const shown = (await theChat()).filter((one) => one.id === sent[0]?.id)
      expect(shown, `${read}: the chat does not have what the review sent`).toHaveLength(1)
      expect(shown[0]?.sentBy, read).toEqual({ kind: 'person', id: THE_PERSON })
      expect(shown[0]?.quotes, read).toHaveLength(2)
    }
  })

  it('writes no run', () => {
    expect(runsWritten(), 'the send queued a run, which nothing in the office picks up').toBe(0)
  })
})

describe('a review sent one comment at a time', () => {
  it('gives the agent a message holding the comment that was sent and not the one that was not', async () => {
    const page = await aReportByTheAgent('What the second firing showed')
    const review = await startAReview(page)
    const going = await aCommentNamingNobody('The glaze on the third pot is thinner.', page)
    const kept = await aCommentNamingNobody('The kiln log stops at four hours.', page)
    await finishAndPreview(review)
    const handedBefore = await whatTheWaiterHands()
    const [message] = (await send(review, [going])).messages
    const handed = await whatTheWaiterHands()
    expect(handed.filter((id) => !handedBefore.includes(id)), 'the send did not hand the agent one message').toEqual([message?.id])
    const read = await readMessage(message?.id ?? '')
    expect(read.body).toBe('The glaze on the third pot is thinner.')
    expect(read.quotes).toHaveLength(1)
    expect((await readMessage(kept)).deliveries, 'a comment nobody sent has a delivery').toEqual([])
    expect((await readMessage(going)).deliveries, 'the sent comment has a delivery of its own').toEqual([])
  })
})
