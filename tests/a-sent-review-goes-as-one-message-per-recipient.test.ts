// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SENT REVIEW GOES AS ONE MESSAGE PER RECIPIENT.
 *
 * When a review is sent, every comment going to one recipient is put into one message, in the order
 * the comments were written. The message numbers them 1, 2, 3, each with its quote above its words,
 * and stores the quotes as a list in the same order. Comments for different recipients go as
 * separate messages, sent together.
 *
 * Each comment stays its own record. So every per-comment reading that existed before still answers
 * per comment: where each one went, whether it has gone out, whether a review still holds it, and the
 * marks on a page. A comment with nobody chosen is not put with anything: it is written as its own
 * message with no recipient, exactly as before, and it stays.
 *
 * WHAT EACH RECIPIENT IS GIVEN, SINCE ROUND 19 OF WAVE 13U. The send wrote a run for each recipient,
 * and the run's request carried the numbered quotes; nothing in the office picks such a run up. Now
 * each recipient is given one message from the person in the message pool, holding the numbered words
 * and each comment's quote in the same order, and no run is written (the secretary's answer yMYX20nfBuep,
 * following this decision; problem eCrK1atZOrvA).
 *
 * These tests press the same doors the review pane presses, in a throwaway office.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { thePersonsKeyHeader, apiApp, fakeTranscript, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const WORKSPACE = 'default'
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

let t: TestDb
let app: FastifyInstance

/**
 * ONE OFFICE FOR THE FILE. Each case files its own module, sessions, review and comments, and every
 * reading it takes is scoped to that review or that conversation, so no case reads another's work.
 */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** A run Mole Office could really pick up again. The names are made up. */
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

/** What the made-up module says, so a comment can select words that are really in it. */
const GRIPPER_TEXT =
  'The zero offset, the mount drawing and the calibration file are listed here. The torque limit and the brake ' +
  'timing are not.'

/** A comment left on the module, with the words the person selected there. */
async function remark(on: string, body: string, selected: string): Promise<string> {
  const from = GRIPPER_TEXT.indexOf(selected)
  expect(from, selected).toBeGreaterThanOrEqual(0)
  return file('annotation', body.slice(0, 40), {
    body,
    context: {
      target: { kind: 'record', recordId: on, workspaceId: WORKSPACE },
      span: { quote: selected, from, to: from + selected.length, field: 'context' },
    },
  })
}

async function startReview(on: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/reviews',
    headers: HUMAN,
    payload: { entry: { target: { kind: 'record', recordId: on, workspaceId: WORKSPACE } } },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { review: { id: string } }).review.id
}

async function finishCollecting(reviewId: string): Promise<void> {
  const res = await app.inject({ method: 'POST', url: `/api/reviews/${reviewId}/finish-collecting`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
}

async function chooseWhoItIsFor(commentId: string, sessionId: string): Promise<void> {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/records/${commentId}`,
    headers: HUMAN,
    payload: { dataPatch: { chosenRecipient: { kind: 'session', sessionId } } },
  })
  expect(res.statusCode, res.body).toBe(200)
}

interface Preview {
  comments: { id: string; willGo: boolean; says: string }[]
  messages: { to: string; comments: { id: string; number: number; quote: string; words: string }[] }[]
}

async function preview(reviewId: string): Promise<Preview> {
  const res = await app.inject({ method: 'GET', url: `/api/reviews/${reviewId}/send`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Preview
}

interface SendReply {
  threadId: string
  messages: { id: string; to: string }[]
  sent: number
  alreadyGone: number
  review: { review: { state: string } }
}

async function send(reviewId: string): Promise<SendReply> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/reviews/${reviewId}/send`,
    headers: { ...HUMAN, ...thePersonsKeyHeader() },
    payload: { to: [] },
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as SendReply
}

interface ThreadMessage {
  id: string
  body: string
  state: string
  context: { target: { recordId?: string } } | null
  fromAnnotationId: string | null
  carries: string[]
  quotes: { target: { recordId?: string } }[]
  recipient: { sessionId: string | null } | null
}

async function messagesOf(threadId: string): Promise<ThreadMessage[]> {
  const res = await app.inject({ method: 'GET', url: `/api/agent/threads/${threadId}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { messages: ThreadMessage[] }).messages
}

async function membersOf(reviewId: string): Promise<{ id: string; state: string }[]> {
  const res = await app.inject({ method: 'GET', url: `/api/reviews/${reviewId}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { members: { id: string; state: string }[] }).members
}

/** Wait until the wall clock's second has moved on. */
async function aSecondLater(): Promise<void> {
  const second = Math.floor(Date.now() / 1000)
  while (Math.floor(Date.now() / 1000) === second) await new Promise((done) => setTimeout(done, 10))
}

/**
 * A review on one module with three comments: two for the calibration run, written first and
 * third, and one for the camera run, written second. Two more comments nobody chose anybody for
 * are added when `withNobodyChosen` is true.
 */
async function aReviewOfThree(withNobodyChosen = false) {
  const gripper = await file('module', 'The gripper', { context: GRIPPER_TEXT })
  const calibration = await resumableSession('Calibration work', 'ext-merge-1')
  const camera = await resumableSession('Wrist camera work', 'ext-merge-2')
  const review = await startReview(gripper)
  // A SECOND APART, because a stamp is to the second and two comments written in one second are
  // listed by id. Apart, the order they were written in is the order stored.
  const first = await remark(gripper, 'The zero offset here disagrees with the log.', 'zero offset')
  await aSecondLater()
  const second = await remark(gripper, 'The camera mount drawing is out of date.', 'mount drawing')
  await aSecondLater()
  const third = await remark(gripper, 'Say which calibration file this used.', 'calibration file')
  const nobody = withNobodyChosen
    ? [
        await remark(gripper, 'Somebody should look at the torque limit.', 'torque limit'),
        await remark(gripper, 'And at the brake timing.', 'brake timing'),
      ]
    : []
  await chooseWhoItIsFor(first, calibration)
  await chooseWhoItIsFor(second, camera)
  await chooseWhoItIsFor(third, calibration)
  await finishCollecting(review)
  return { gripper, calibration, camera, review, first, second, third, nobody }
}

describe('a sent review writes one message for each recipient', () => {
  it('two comments to one agent and one to another make two messages, numbered in the order written', async () => {
    const r = await aReviewOfThree()

    // BEFORE THE PRESS, the preview shows the same grouping the send writes.
    const before = await preview(r.review)
    expect(before.messages.map((one) => ({ to: one.to, ids: one.comments.map((c) => c.id) }))).toEqual([
      { to: 'Calibration work', ids: [r.first, r.third] },
      { to: 'Wrist camera work', ids: [r.second] },
    ])
    expect(before.messages[0]?.comments.map((c) => c.number)).toEqual([1, 2])
    expect(before.messages[0]?.comments[0]?.quote).toContain('“zero offset”')

    const sent = await send(r.review)
    expect(sent.messages).toHaveLength(2)
    expect(sent.sent).toBe(3)
    expect(sent.review.review.state).toBe('sent')

    const written = await messagesOf(sent.threadId)
    expect(written).toHaveLength(2)
    const toCalibration = written.find((one) => one.carries.length === 2)
    const toCamera = written.find((one) => one.carries.length === 1)
    expect(toCalibration, JSON.stringify(written)).toBeDefined()
    expect(toCamera, JSON.stringify(written)).toBeDefined()

    // THE MERGED MESSAGE names each comment it carries, in the order written, and quotes each.
    expect(toCalibration?.carries).toEqual([r.first, r.third])
    expect(toCalibration?.fromAnnotationId).toBeNull()
    expect(toCalibration?.context).toBeNull()
    // THE QUOTES, IN THE SAME ORDER: each is the comment's own stored context, words and all.
    expect(toCalibration?.quotes).toHaveLength(2)
    expect(toCalibration?.quotes.map((q) => q.target.recordId)).toEqual([r.gripper, r.gripper])
    expect(JSON.stringify(toCalibration?.quotes[0])).toContain('zero offset')
    expect(JSON.stringify(toCalibration?.quotes[1])).toContain('calibration file')
    expect(toCalibration?.recipient?.sessionId).toBe(r.calibration)
    const body = toCalibration?.body ?? ''
    expect(body.startsWith('1. On ')).toBe(true)
    const one = body.indexOf('1. On ')
    const quoteOne = body.indexOf('“zero offset”')
    const wordsOne = body.indexOf('The zero offset here disagrees with the log.')
    const two = body.indexOf('2. On ')
    const quoteTwo = body.indexOf('“calibration file”')
    const wordsTwo = body.indexOf('Say which calibration file this used.')
    expect([one, quoteOne, wordsOne, two, quoteTwo, wordsTwo].every((at) => at >= 0), body).toBe(true)
    expect(one < quoteOne && quoteOne < wordsOne && wordsOne < two && two < quoteTwo && quoteTwo < wordsTwo, body).toBe(true)

    // ONE COMMENT TO ONE RECIPIENT IS ONE MESSAGE EXACTLY AS BEFORE.
    expect(toCamera?.fromAnnotationId).toBe(r.second)
    expect(toCamera?.body).toBe('The camera mount drawing is out of date.')
    expect(toCamera?.context?.target.recordId).toBe(r.gripper)

    // EACH COMMENT IS STILL ITS OWN RECORD, with its own words.
    for (const [id, words] of [
      [r.first, 'The zero offset here disagrees with the log.'],
      [r.second, 'The camera mount drawing is out of date.'],
      [r.third, 'Say which calibration file this used.'],
    ] as const) {
      const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
      expect(res.statusCode, res.body).toBe(200)
      const record = (res.json() as { record: { kind: string; data: { body: string } } }).record
      expect(record.kind).toBe('annotation')
      expect(record.data.body).toBe(words)
    }
  })

  it('every per-comment reading still answers for each comment in the merged message', async () => {
    const r = await aReviewOfThree()
    const sent = await send(r.review)
    const ids = [r.first, r.second, r.third]

    // 1. THE REVIEW'S OWN READING: each comment has gone.
    const members = await membersOf(r.review)
    for (const id of ids) expect(members.find((one) => one.id === id)?.state, id).toBe('sent')

    // 2. THE PANE'S LINE UNDER EACH COMMENT: each says it went with this review, and none would go again. It said
    //    "has already gone" until the secretary's review of round 12 (report cu3k8UH1DiRT) read that as a contradiction of the
    //    sentence after the press.
    const after = await preview(r.review)
    for (const id of ids) {
      const line = after.comments.find((one) => one.id === id)
      expect(line?.willGo, id).toBe(false)
      expect(line?.says, id).toContain('Sent with this review')
    }
    expect(after.messages).toEqual([])

    // 3. THE GATE THAT FIXES A COMMENT'S WORDS, and its migration twin, per comment.
    const dispatch = await import('../src/server/lib/dispatch.ts')
    const annotationState = await import('../src/server/db/annotation-state.ts')
    const reading = dispatch.dispatchOf(ids, WORKSPACE)
    const gone = new Set(dispatch.commentsGoneOut({ oneProject: WORKSPACE }))
    for (const id of ids) {
      expect(dispatch.hasGoneOut(id, WORKSPACE), id).toBe(true)
      expect(reading[id]?.word, id).toBe('sent')
      expect(gone.has(id), id).toBe(true)
      expect(annotationState.goneOutIn(t.client.sqlite, id, WORKSPACE).byAMessage, id).toBe(true)
    }
    const words = await app.inject({
      method: 'PATCH',
      url: `/api/records/${r.third}`,
      headers: HUMAN,
      payload: { dataPatch: { body: 'Rewritten after it went.' } },
    })
    expect(words.statusCode, words.body).toBe(409)

    // 4. THE WORKER'S HOLD: a sent review holds none of them back any more.
    const reviews = await import('../src/server/lib/reviews.ts')
    const held = reviews.commentsAReviewHasNotSentYet(WORKSPACE)
    for (const id of ids) expect(held.has(id), id).toBe(false)

    // 5. WHAT THE CALIBRATION WORK WAS GIVEN: one message from the person, its words numbered, with both quotes in the
    //    same order. Until round 19 this read the request of a run the send wrote; the send writes none now.
    const given = await Promise.all(
      sent.messages.map(async (one) => {
        const res = await app.inject({ method: 'GET', url: `/api/messages/${one.id}`, headers: HUMAN })
        expect(res.statusCode, res.body).toBe(200)
        return (res.json() as { message: { body: string; quotes: unknown[]; sentBy: { kind: string } } }).message
      }),
    )
    const merged = given.find((one) => one.quotes.length === 2)
    expect(merged?.sentBy.kind).toBe('person')
    expect(merged?.body).toBe('1. The zero offset here disagrees with the log.\n\n2. Say which calibration file this used.')
    expect(JSON.stringify(merged?.quotes[0])).toContain('zero offset')
    expect(JSON.stringify(merged?.quotes[1])).toContain('calibration file')
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_runs').get()).toEqual({ n: 0 })
    expect(sent.alreadyGone).toBe(0)

    // 6. THE AGENT'S INBOX names every comment its one message carries.
    const threadMessages = await messagesOf(sent.threadId)
    const mergedRow = threadMessages.find((one) => one.carries.length === 2)
    const agentId = (
      t.client.sqlite.prepare('SELECT recipient_agent_id AS id FROM agent_messages WHERE id = ?').get(mergedRow?.id) as {
        id: string
      }
    ).id
    const inbox = await import('../src/server/lib/inbox.ts')
    const items = inbox.inboxOf({ id: agentId, handle: 'the calibration agent', resolvedThrough: null } as never, WORKSPACE)
      .messages
    expect(items.find((one) => one.messageId === mergedRow?.id)?.carries).toEqual([r.first, r.third])
  })

  it('a comment with nobody chosen is not put with anything, and stays waiting as before', async () => {
    const r = await aReviewOfThree(true)
    const [nobodyOne, nobodyTwo] = r.nobody

    const before = await preview(r.review)
    const grouped = before.messages.flatMap((one) => one.comments.map((c) => c.id))
    expect(grouped).not.toContain(nobodyOne)
    expect(grouped).not.toContain(nobodyTwo)

    const sent = await send(r.review)
    const written = await messagesOf(sent.threadId)
    // TWO FOR THE TWO RECIPIENTS, AND ONE EACH FOR THE TWO COMMENTS NOBODY CHOSE ANYBODY FOR.
    expect(written).toHaveLength(4)
    for (const id of [nobodyOne, nobodyTwo]) {
      const own = written.filter((one) => one.carries.includes(id ?? ''))
      expect(own, id).toHaveLength(1)
      expect(own[0]?.fromAnnotationId, id).toBe(id)
      expect(own[0]?.carries, id).toEqual([id])
      expect(own[0]?.recipient, id).toBeNull()
      expect(own[0]?.state, id).toBe('queued')
    }
    const members = await membersOf(r.review)
    for (const id of [nobodyOne, nobodyTwo]) expect(members.find((one) => one.id === id)?.state, id).toBe('queued')
    expect(sent.review.review.state).not.toBe('sent')
  })
})
