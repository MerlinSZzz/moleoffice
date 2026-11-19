// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW STORED AS SENT WITH A COMMENT STILL WAITING CAN BE SENT AGAIN, AND ONLY WHAT IS LEFT GOES.
 *
 * Until the review rule changed, a review was marked sent while a comment in it still waited: a comment only the person
 * may answer did not stop it, and nor did a comment that could no longer be found. Those reviews are in real offices
 * now. Pressing Send on one used to be refused because the review "was sent", and the comment that waited could then
 * never go.
 *
 * Four claims:
 *
 *   IT REOPENS AND SENDS WHAT IS LEFT. Send on such a review hands over the comment that waited, in the same
 *   conversation, and nothing that went before goes again. The review keeps the time it was first sent at.
 *
 *   ONLY ITS STARTER MAY DO IT. Another caller is refused with 403 and nothing changes.
 *
 *   A MESSAGE THAT CANNOT BE SENT SAFELY IS REFUSED WITH 409 AND NOTHING CHANGES. A message shared with a comment the
 *   press did not ask for, a comment already handed over, a comment carried by two messages, and a message whose words
 *   are no longer the comment's words.
 *
 *   A DISPATCH OF SOME OF A CONVERSATION'S MESSAGES DOES NOT CALL THE CONVERSATION DISPATCHED while another of its
 *   messages still waits.
 *
 * A SENT REVIEW WITH A COMMENT STILL WAITING CANNOT BE MADE BY THE PRODUCT NOW, so each case here writes the stored
 * state with SQL: it stands for an older review that was marked sent that way. The time written is made up.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { AGENT, apiApp, expectPanelError, fakeTranscript, freshDb, thePersonsKeyHeader, theAnswerToAWriteInATestOffice, type TestDb } from './helpers.ts'
import { sayInEnglish, type WordKey } from '../src/shared/i18n.ts'

type ReviewsLib = typeof import('../src/server/lib/reviews.ts')
type AgentsLib = typeof import('../src/server/lib/agents.ts')

/** A made-up time, standing for when an older review was first marked sent. */
const FIRST_SENT_AT = '2026-08-17 09:30:00'

let WORKSPACE = 'default'
let caseNumber = 0
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}
/** The person as the library reads them, with no key: enough to write a conversation, not to dispatch one. */
const THE_OWNER = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
/** The person as the library reads them after their key was checked. */
const PROVED = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' } as const

let t: TestDb
let app: FastifyInstance
let reviews: ReviewsLib
let agents: AgentsLib

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  reviews = (await import('../src/server/lib/reviews.ts')) as ReviewsLib
  agents = (await import('../src/server/lib/agents.ts')) as AgentsLib
}, 60_000)

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  HUMAN['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: 'A made-up project for one case' },
  })
  expect(made.statusCode, made.body).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ---------------------------------------------------------------------------- building things

async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(theAnswerToAWriteInATestOffice(HUMAN, { kind, data }))
  return (res.json() as { record: { id: string } }).record.id
}

/** A run Mole Office could really pick up again: a session record carrying what discovery stamps on one. */
async function resumableSession(title: string, externalId: string): Promise<string> {
  const logPath = fakeTranscript(externalId)
  return file('session', title, {
    state: 'idle',
    runtime: 'claude-code',
    extra: {
      discovered: {
        tool: 'claude-code',
        externalId,
        logPath,
        resumeCommand: `claude --resume ${externalId}`,
        observedState: 'idle',
        stateReason: 'its log last grew 40 minutes ago and a process still names it',
        filesTouched: [],
        filesComplete: true,
        at: '2026-08-17 09:00:00',
      },
    },
  })
}

async function remark(on: string, body: string): Promise<string> {
  return file('annotation', body.slice(0, 40), { body, context: onRecord(on) })
}

const onRecord = (recordId: string) => ({ target: { kind: 'record', recordId, workspaceId: WORKSPACE } })

async function startReview(on: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/reviews',
    headers: HUMAN,
    payload: { entry: onRecord(on) },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { review: { id: string } }).review.id
}

async function finishCollecting(reviewId: string): Promise<void> {
  const res = await app.inject({ method: 'POST', url: `/api/reviews/${reviewId}/finish-collecting`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
}

interface SendReply {
  threadId: string
  messages: { id: string; to: string }[]
  sent: number
  review: { review: { state: string; sentAt: string | null; threadId: string | null } }
}

async function send(
  reviewId: string,
  to: { commentId: string; recipient: unknown }[] = [],
  only: string[] | null = null,
): Promise<{ status: number; body: string; reply: SendReply }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/reviews/${reviewId}/send`,
    headers: { ...HUMAN, ...thePersonsKeyHeader() },
    payload: { to, ...(only === null ? {} : { only }) },
  })
  return { status: res.statusCode, body: res.body, reply: res.json() as SendReply }
}

async function readThread(threadId: string): Promise<{ messages: { id: string; body: string; state: string }[] }> {
  const res = await app.inject({ method: 'GET', url: `/api/agent/threads/${threadId}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Awaited<ReturnType<typeof readThread>>
}

async function readReview(reviewId: string): Promise<{ review: { state: string; sentAt: string | null } }> {
  const res = await app.inject({ method: 'GET', url: `/api/reviews/${reviewId}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Awaited<ReturnType<typeof readReview>>
}

const toSession = (sessionId: string) => ({ kind: 'session', sessionId, said: null, why: null })

/**
 * MARK A REVIEW SENT THE WAY AN OLDER ONE WAS, by SQL, because the product no longer marks a review sent while a
 * comment in it still waits. `thread` is the conversation it was sent in, when the case gives it one.
 */
function markedSentTheOldWay(reviewId: string, thread: string | null = null): void {
  t.client.sqlite
    .prepare('UPDATE reviews SET state = ?, sent_at = ?, sent_thread_id = coalesce(?, sent_thread_id) WHERE id = ?')
    .run('sent', FIRST_SENT_AT, thread, reviewId)
}

/** The stored row of a review, as SQL reads it, so a refusal can be shown to have changed nothing. */
function storedReview(reviewId: string): unknown {
  return t.client.sqlite.prepare('SELECT state, sent_at, sent_thread_id, frozen FROM reviews WHERE id = ?').get(reviewId)
}

/** The words of a refusal, as the JSON body of a reply carries them. */
const inTheBody = (key: WordKey): string => JSON.stringify(sayInEnglish(key)).slice(1, -1)

// ============================================================================ it reopens

describe('a review stored as sent with a comment still waiting', () => {
  it('reopens, sends only the comment that waited, and keeps the time it was first sent', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const alive = await resumableSession('Calibration work', 'ext-recover-a1')
    const review = await startReview(gripper)
    const first = await remark(gripper, 'The first number is wrong.')
    const second = await remark(gripper, 'The second number is wrong as well.')
    await finishCollecting(review)

    const once = await send(review, [{ commentId: first, recipient: toSession(alive) }], [first])
    expect(once.status, once.body).toBe(200)
    expect(once.reply.sent).toBe(1)
    expect(once.reply.review.review.state).not.toBe('sent')
    markedSentTheOldWay(review)

    const again = await send(review, [{ commentId: second, recipient: toSession(alive) }])
    expect(again.status, again.body).toBe(200)
    expect(again.reply.sent).toBe(1)
    expect(again.reply.messages).toHaveLength(1)
    // THE SAME CONVERSATION, AND THE FIRST COMMENT DID NOT GO AGAIN.
    expect(again.reply.threadId).toBe(once.reply.threadId)
    const thread = await readThread(again.reply.threadId)
    expect(thread.messages.map((one) => [one.body, one.state])).toEqual([
      ['The first number is wrong.', 'sent'],
      ['The second number is wrong as well.', 'sent'],
    ])
    // SENT, AT THE TIME IT WAS FIRST SENT.
    expect(again.reply.review.review.state).toBe('sent')
    expect(again.reply.review.review.sentAt).toBe(FIRST_SENT_AT)
    expect((await readReview(review)).review.sentAt).toBe(FIRST_SENT_AT)
  })

  it('refuses a caller who did not start the review with 403, and changes nothing', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const alive = await resumableSession('Calibration work', 'ext-recover-b1')
    const review = await startReview(gripper)
    const first = await remark(gripper, 'The first number is wrong.')
    const second = await remark(gripper, 'The second number is wrong as well.')
    await finishCollecting(review)
    const once = await send(review, [{ commentId: first, recipient: toSession(alive) }], [first])
    expect(once.status, once.body).toBe(200)
    markedSentTheOldWay(review)
    const before = storedReview(review)

    const refused = expectPanelError(
      t,
      () => reviews.sendReview(review, WORKSPACE, [{ commentId: second, recipient: toSession(alive) }] as never, AGENT as never),
      403,
    )
    expect(refused.message).toBe(sayInEnglish('review.delivery.recoveryStarter'))
    expect(storedReview(review)).toEqual(before)
    expect((await readThread(once.reply.threadId)).messages.map((one) => one.state)).toEqual(['sent'])
  })
})

// ============================================================================ the four refusals

describe('a recovery that cannot be sent safely is refused with 409, and nothing changes', () => {
  /** A review of two comments, collected, with the conversation it is sent in written by hand. */
  async function aReviewOfTwo(prefix: string): Promise<{ review: string; first: string; second: string; alive: string; thread: string; gripper: string }> {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const alive = await resumableSession('Calibration work', `ext-${prefix}`)
    const review = await startReview(gripper)
    const first = await remark(gripper, 'The first number is wrong.')
    const second = await remark(gripper, 'The second number is wrong as well.')
    await finishCollecting(review)
    const thread = agents.createThread({ workspaceId: WORKSPACE, title: 'The conversation of an older review', mode: 'review' }, THE_OWNER as never).id
    return { review, first, second, alive, thread, gripper }
  }

  it('refuses a waiting message that also holds a comment the press did not ask for', async () => {
    const { review, first, second, alive, thread, gripper } = await aReviewOfTwo('recover-shared')
    agents.addMessage(
      thread,
      WORKSPACE,
      {
        intent: 'review',
        body: '1. The first number is wrong.\n2. The second number is wrong as well.',
        recipient: toSession(alive) as never,
        carries: [
          { commentId: first, quote: onRecord(gripper) as never },
          { commentId: second, quote: onRecord(gripper) as never },
        ],
      },
      THE_OWNER as never,
    )
    markedSentTheOldWay(review, thread)
    const before = storedReview(review)

    const refused = await send(review, [], [first])
    expect(refused.status, refused.body).toBe(409)
    expect(refused.body).toContain(inTheBody('review.delivery.recoveryShared'))
    expect(storedReview(review)).toEqual(before)
    expect((await readThread(thread)).messages.map((one) => one.state)).toEqual(['queued'])
  })

  it('refuses a comment that was already handed over', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const alive = await resumableSession('Calibration work', 'ext-recover-handed')
    const review = await startReview(gripper)
    const first = await remark(gripper, 'The first number is wrong.')
    await finishCollecting(review)
    markedSentTheOldWay(review)
    // A DELIVERY ROW SAYING THE COMMENT REACHED AN AGENT, written by hand: it stands for a comment handed over
    // through the message pool after the review was marked sent. The agent and the time are made up.
    t.client.sqlite
      .prepare('INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('made-up-delivery-1', first, 'agent', 'made-up-agent', 'delivered', '2026-08-17 09:40:00')
    const before = storedReview(review)

    const refused = await send(review, [{ commentId: first, recipient: toSession(alive) }])
    expect(refused.status, refused.body).toBe(409)
    expect(refused.body).toContain(inTheBody('review.delivery.recoveryHanded'))
    expect(storedReview(review)).toEqual(before)
  })

  it('refuses a comment carried by two waiting messages', async () => {
    const { review, first, alive, thread, gripper } = await aReviewOfTwo('recover-twice')
    for (let i = 0; i < 2; i += 1) {
      agents.addMessage(
        thread,
        WORKSPACE,
        { intent: 'review', body: 'The first number is wrong.', context: onRecord(gripper) as never, recipient: toSession(alive) as never, fromAnnotationId: first },
        THE_OWNER as never,
      )
    }
    markedSentTheOldWay(review, thread)
    const before = storedReview(review)

    const refused = await send(review, [], [first])
    expect(refused.status, refused.body).toBe(409)
    expect(refused.body).toContain(inTheBody('review.delivery.recoveryHanded'))
    expect(storedReview(review)).toEqual(before)
    expect((await readThread(thread)).messages.map((one) => one.state)).toEqual(['queued', 'queued'])
  })

  it('refuses a waiting message whose words are no longer the comment’s words', async () => {
    const { review, first, alive, thread, gripper } = await aReviewOfTwo('recover-words')
    agents.addMessage(
      thread,
      WORKSPACE,
      { intent: 'review', body: 'Somebody changed these words after the review was sent.', context: onRecord(gripper) as never, recipient: toSession(alive) as never, fromAnnotationId: first },
      THE_OWNER as never,
    )
    markedSentTheOldWay(review, thread)
    const before = storedReview(review)

    const refused = await send(review, [], [first])
    expect(refused.status, refused.body).toBe(409)
    expect(refused.body).toContain(inTheBody('review.delivery.recoveryWords'))
    expect(storedReview(review)).toEqual(before)
    expect((await readThread(thread)).messages.map((one) => one.state)).toEqual(['queued'])
  })
})

// ============================================================================ dispatching some messages

describe('dispatching some of a conversation’s messages', () => {
  it('calls the conversation dispatched only once every waiting message has gone', async () => {
    const alive = await resumableSession('Calibration work', 'ext-recover-only')
    const thread = agents.createThread({ workspaceId: WORKSPACE, title: 'Two questions', mode: 'direct' }, THE_OWNER as never).id
    const one = agents.addMessage(thread, WORKSPACE, { intent: 'ask', body: 'The first question.', recipient: toSession(alive) as never }, THE_OWNER as never)
    const two = agents.addMessage(thread, WORKSPACE, { intent: 'ask', body: 'The second question.', recipient: toSession(alive) as never }, THE_OWNER as never)
    const stateOf = () =>
      (t.client.sqlite.prepare('SELECT state FROM agent_threads WHERE id = ?').get(thread) as { state: string }).state

    agents.dispatchThread(thread, WORKSPACE, PROVED as never, new Map(), null, 'none', new Set([one.id]))
    expect((await readThread(thread)).messages.map((m) => [m.id, m.state])).toEqual([
      [one.id, 'sent'],
      [two.id, 'queued'],
    ])
    expect(stateOf()).not.toBe('dispatched')

    agents.dispatchThread(thread, WORKSPACE, PROVED as never, new Map(), null, 'none', new Set([two.id]))
    expect((await readThread(thread)).messages.map((m) => m.state)).toEqual(['sent', 'sent'])
    expect(stateOf()).toBe('dispatched')
  })
})
