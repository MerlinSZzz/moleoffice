// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW READS AS SENT ONLY WHEN NOTHING IN IT WAITS, AND A PERSON CAN TAKE OUT WHAT WILL NEVER GO.
 *
 * A review waits for every comment in it that has not gone. Two kinds of comment will never go by pressing Send: a
 * comment only the person may answer, and a comment that can no longer be found. Each gets a press of its own. "I
 * answer this myself" takes a comment only the person may answer out of what the review waits for, and it stays where
 * it is. "Remove from this review" takes a comment that can no longer be found out of the review. The review is
 * marked sent once nothing else waits, by whichever press comes last, and never before.
 *
 * Six claims:
 *
 *   SEND MARKS THE REVIEW SENT ONLY WHEN NOTHING WAITS. Not while a comment is held for an address that does not work,
 *   and not while a comment in it can no longer be found.
 *
 *   EACH PRESS TAKES OUT ONLY ITS OWN KIND OF COMMENT. "I answer this myself" is refused on a comment that is not the
 *   person's to answer, and "Remove from this review" on a comment that is still there. A comment that went, or one
 *   taken out already, is refused. Each refusal is 409 and changes nothing.
 *
 *   ONLY THE CALLER WHO MAY SEND THE REVIEW MAY PRESS. A press with no proof that it is the person is refused with 403.
 *   On a review stored as sent, only its starter may press, as only its starter may send it again.
 *
 *   A TAKEN-OUT COMMENT STAYS LISTED, and the review says who took it out, why, and when.
 *
 *   A REVIEW SENT AFTER THE PERSON TOOK A COMMENT FOR THEMSELVES SAYS SO: it is sent, and the comment that is theirs
 *   stayed here.
 *
 *   A REVIEW STORED AS SENT WITH A COMMENT STILL WAITING TO GO SAYS IT WAS SENT, and that Send sends what is left.
 *
 * A review stored as sent while a comment in it still waited cannot be made by the product now, so the cases that need
 * one write it with SQL, standing for an older review. The time written is made up.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { AGENT, apiApp, expectPanelError, fakeTranscript, freshDb, thePersonsKeyHeader, theAnswerToAWriteInATestOffice, type TestDb } from './helpers.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'

type ReviewsLib = typeof import('../src/server/lib/reviews.ts')

/** A made-up time, standing for when an older review was first marked sent. */
const FIRST_SENT_AT = '2026-08-17 09:30:00'

let WORKSPACE = 'default'
let caseNumber = 0
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}
const THE_OWNER = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let app: FastifyInstance
let reviews: ReviewsLib

/** A directory that exists and stays empty, so a stamp can name a transcript nobody wrote. */
const transcriptsGone = mkdtempSync(join(tmpdir(), 'mole-office-review-waits-gone-'))

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  reviews = (await import('../src/server/lib/reviews.ts')) as ReviewsLib
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
  rmSync(transcriptsGone, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------- building things

async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(theAnswerToAWriteInATestOffice(HUMAN, { kind, data }))
  return (res.json() as { record: { id: string } }).record.id
}

/** A session record carrying what discovery stamps on one, with a transcript at `logPath`. */
function aSession(title: string, externalId: string, logPath: string): Promise<string> {
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
        stateReason: 'its log last grew 40 minutes ago',
        filesTouched: [],
        filesComplete: true,
        at: '2026-08-17 09:00:00',
      },
    },
  })
}

/** A run Mole Office could really pick up again. */
const resumableSession = (title: string, externalId: string) => aSession(title, externalId, fakeTranscript(externalId))

/** A run Mole Office has an id for and CANNOT pick up: the stamp is there and the transcript is not. */
const stampedButGone = (title: string, externalId: string) => aSession(title, externalId, join(transcriptsGone, `${externalId}.jsonl`))

const onRecord = (recordId: string) => ({ target: { kind: 'record', recordId, workspaceId: WORKSPACE } })

async function remark(on: string, body: string): Promise<string> {
  return file('annotation', body.slice(0, 40), { body, context: onRecord(on) })
}

async function startReview(on: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/reviews', headers: HUMAN, payload: { entry: onRecord(on) } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { review: { id: string } }).review.id
}

async function finishCollecting(reviewId: string): Promise<void> {
  const res = await app.inject({ method: 'POST', url: `/api/reviews/${reviewId}/finish-collecting`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
}

/** Organise a review so that each comment's reading names the artefacts given for it. */
async function readAs(review: string, comments: { commentId: string; artefacts: string[] }[]): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/reviews/${review}/organise`,
    headers: HUMAN,
    payload: {
      comments: comments.map((one) => ({
        commentId: one.commentId,
        reading: 'What this comment is asking for.',
        intents: ['discuss'],
        artefacts: one.artefacts,
      })),
      groups: [],
    },
  })
  expect(res.statusCode, res.body).toBe(200)
}

interface TakenOut {
  id: string
  because: 'the-person-answers-it' | 'it-cannot-be-found'
  by: string
  at: string
}

interface Detail {
  review: { state: string; sentAt: string | null }
  members: { id: string; found: boolean; body?: string; state?: string }[]
  takenOut?: TakenOut[]
  waitsFor?: string[]
}

interface SendReply {
  sent: number
  held: { messageId: string }[]
  yoursToAnswer: { id: string }[]
  review: Detail
  says: string
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

/** The press under one comment: "I answer this myself", or "Remove from this review". */
async function takeOut(
  reviewId: string,
  comment: string,
  because: TakenOut['because'],
  proved = true,
): Promise<{ status: number; body: string; reply: { review: Detail; takenOut: TakenOut; reviewSent: boolean; says: string } }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/reviews/${reviewId}/take-out`,
    headers: { ...HUMAN, ...(proved ? thePersonsKeyHeader() : {}) },
    payload: { comment, because },
  })
  return { status: res.statusCode, body: res.body, reply: res.json() as Awaited<ReturnType<typeof takeOut>>['reply'] }
}

async function readReview(reviewId: string): Promise<Detail> {
  const res = await app.inject({ method: 'GET', url: `/api/reviews/${reviewId}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Detail
}

interface Plan {
  comments: { id: string; willGo: boolean; yoursToAnswer: boolean; sentence?: { key: string }; takenOut?: { because: string } }[]
  facts: { state: string; recovery?: boolean }
  recoveryAvailable: boolean
  says: string
}

async function whereTheyWouldGo(reviewId: string): Promise<Plan> {
  const res = await app.inject({ method: 'GET', url: `/api/reviews/${reviewId}/send`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Plan
}

const toSession = (sessionId: string) => ({ kind: 'session', sessionId, said: null, why: null })

/** MARK A REVIEW SENT THE WAY AN OLDER ONE WAS, by SQL, because the product no longer does it while a comment waits. */
function markedSentTheOldWay(reviewId: string): void {
  t.client.sqlite.prepare('UPDATE reviews SET state = ?, sent_at = ? WHERE id = ?').run('sent', FIRST_SENT_AT, reviewId)
}

function storedReview(reviewId: string): unknown {
  return t.client.sqlite.prepare('SELECT state, sent_at, frozen FROM reviews WHERE id = ?').get(reviewId)
}

/** A collected and organised review of two comments on one record: one asks for work, one asks for a decision. */
async function workAndAChoice(prefix: string): Promise<{ review: string; work: string; choice: string; agent: string }> {
  const gripper = await file('module', 'The gripper', { context: 'x' })
  const agent = await resumableSession('Calibration work', `ext-${prefix}`)
  const review = await startReview(gripper)
  const work = await remark(gripper, 'Please check this number against the run log.')
  const choice = await remark(gripper, 'Decide for me whether we drop the printed mount.')
  await finishCollecting(review)
  await readAs(review, [
    { commentId: work, artefacts: ['problem'] },
    { commentId: choice, artefacts: ['decision'] },
  ])
  return { review, work, choice, agent }
}

// ============================================================================ send

describe('Send marks a review sent only when nothing in it waits', () => {
  it('waits while a comment is held, and while a comment cannot be found, until that one is removed', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const alive = await resumableSession('Calibration work', 'ext-waits-held-1')
    const gone = await stampedButGone('A run whose transcript is not here', 'ext-waits-held-2')
    const review = await startReview(gripper)
    const good = await remark(gripper, 'The calibration number is wrong here.')
    const stranded = await remark(gripper, 'These words wait for an address that works.')
    const lost = await remark(gripper, 'This comment is deleted after collecting finished.')
    await finishCollecting(review)
    t.api.deleteRecord(lost, THE_OWNER as never)

    const sent = await send(review, [
      { commentId: good, recipient: toSession(alive) },
      { commentId: stranded, recipient: toSession(gone) },
    ])
    expect(sent.status, sent.body).toBe(200)
    expect(sent.reply.sent).toBe(1)
    expect(sent.reply.held).toHaveLength(1)
    expect(sent.reply.review.review.state).not.toBe('sent')

    // THE HELD ONE IS GIVEN AN ADDRESS THAT WORKS, and goes. The review still waits for the comment that is gone.
    const fixed = await app.inject({
      method: 'PATCH',
      url: `/api/agent/messages/${sent.reply.held[0]?.messageId ?? ''}`,
      headers: HUMAN,
      payload: { recipient: toSession(alive) },
    })
    expect(fixed.statusCode, fixed.body).toBe(200)
    const again = await send(review)
    expect(again.status, again.body).toBe(200)
    expect(again.reply.sent).toBe(1)
    expect(again.reply.held).toHaveLength(0)
    expect(again.reply.review.review.state).not.toBe('sent')
    expect(again.reply.review.waitsFor).toEqual([lost])

    // REMOVE FROM THIS REVIEW is the last press, so it marks the review sent.
    const out = await takeOut(review, lost, 'it-cannot-be-found')
    expect(out.status, out.body).toBe(200)
    expect(out.reply.reviewSent).toBe(true)
    expect(out.reply.review.review.state).toBe('sent')
    expect(out.reply.review.waitsFor).toEqual([])
    expect(out.reply.says).toContain(sayInEnglish('review.takeOut.removed'))
    expect(out.reply.says).toContain(sayInEnglish('review.takeOut.nothingWaits'))
    // IT IS STILL LISTED, as a comment the review can no longer find, and the plan says it was taken out.
    expect(out.reply.review.members.find((one) => one.id === lost)?.found).toBe(false)
    const line = (await whereTheyWouldGo(review)).comments.find((one) => one.id === lost)
    expect(line?.sentence?.key).toBe('removedFromTheReview')
    expect(line?.takenOut?.because).toBe('it-cannot-be-found')
  })
})

// ============================================================================ the presses

describe('each press takes out only its own kind of comment', () => {
  it('takes a comment only the person may answer out of what the review waits for, and the review reads as sent only then', async () => {
    const { review, work, choice, agent } = await workAndAChoice('waits-person-1')
    const sent = await send(review, [
      { commentId: work, recipient: toSession(agent) },
      { commentId: choice, recipient: toSession(agent) },
    ])
    expect(sent.status, sent.body).toBe(200)
    expect(sent.reply.sent).toBe(1)
    expect(sent.reply.yoursToAnswer.map((one) => one.id)).toEqual([choice])
    expect(sent.reply.review.review.state).not.toBe('sent')
    expect(sent.reply.review.waitsFor).toEqual([choice])
    const before = storedReview(review)

    // THE WRONG PRESS, A COMMENT THAT WENT, AND A PRESS WITH NO PROOF: each refused, and nothing changes.
    const wrongPress = await takeOut(review, choice, 'it-cannot-be-found')
    expect(wrongPress.status, wrongPress.body).toBe(409)
    const went = await takeOut(review, work, 'the-person-answers-it')
    expect(went.status, went.body).toBe(409)
    const unproved = await takeOut(review, choice, 'the-person-answers-it', false)
    expect(unproved.status, unproved.body).toBe(403)
    expect(storedReview(review)).toEqual(before)
    expect((await readReview(review)).takenOut).toEqual([])

    const out = await takeOut(review, choice, 'the-person-answers-it')
    expect(out.status, out.body).toBe(200)
    expect(out.reply.reviewSent).toBe(true)
    expect(out.reply.review.review.state).toBe('sent')
    expect(out.reply.review.waitsFor).toEqual([])
    expect(out.reply.takenOut).toMatchObject({ id: choice, because: 'the-person-answers-it', by: `human:${THE_TEST_OFFICES_OWNER.id}` })
    expect(out.reply.review.takenOut).toEqual([out.reply.takenOut])
    expect(out.reply.says).toContain(sayInEnglish('review.takeOut.answered'))
    expect(out.reply.says).toContain(sayInEnglish('review.takeOut.nothingWaits'))

    // IT STAYS WHERE IT IS, with its words, and nothing was handed over for it.
    const kept = (await readReview(review)).members.find((one) => one.id === choice)
    expect(kept?.body).toBe('Decide for me whether we drop the printed mount.')
    expect(kept?.state).toBe('queued')
    const line = (await whereTheyWouldGo(review)).comments.find((one) => one.id === choice)
    expect(line?.willGo).toBe(false)
    expect(line?.sentence?.key).toBe('answeredByThePerson')
    expect(line?.takenOut?.because).toBe('the-person-answers-it')

    // A SECOND PRESS ON IT IS REFUSED.
    const twice = await takeOut(review, choice, 'the-person-answers-it')
    expect(twice.status, twice.body).toBe(409)
  })

  it('refuses "Remove from this review" on a comment that is still there', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const review = await startReview(gripper)
    const here = await remark(gripper, 'This comment is still here.')
    await finishCollecting(review)
    const before = storedReview(review)

    const refused = await takeOut(review, here, 'it-cannot-be-found')
    expect(refused.status, refused.body).toBe(409)
    expect(storedReview(review)).toEqual(before)
  })

  it('on a review stored as sent, lets only its starter press, and keeps the time it was first sent', async () => {
    const { review, work, choice, agent } = await workAndAChoice('waits-starter-1')
    const sent = await send(review, [{ commentId: work, recipient: toSession(agent) }])
    expect(sent.status, sent.body).toBe(200)
    markedSentTheOldWay(review)
    // NOTHING THERE CAN GO BY PRESSING SEND, so the plan does not offer to send what is left.
    expect((await whereTheyWouldGo(review)).recoveryAvailable).toBe(false)
    const before = storedReview(review)

    const refused = expectPanelError(
      t,
      () => reviews.takeOutOfTheReview(review, WORKSPACE, { comment: choice, because: 'the-person-answers-it' }, AGENT as never),
      403,
    )
    expect(refused.message).toBe(sayInEnglish('review.takeOut.starter'))
    expect(storedReview(review)).toEqual(before)

    const out = await takeOut(review, choice, 'the-person-answers-it')
    expect(out.status, out.body).toBe(200)
    expect(out.reply.review.review.state).toBe('sent')
    expect(out.reply.review.review.sentAt).toBe(FIRST_SENT_AT)
  })
})

// ============================================================================ what the review says

describe('what a review says about the comments that did not go', () => {
  it('says it is sent and that the comment the person took for themselves stayed, when that was taken out first', async () => {
    const { review, work, choice, agent } = await workAndAChoice('waits-said-1')

    const out = await takeOut(review, choice, 'the-person-answers-it')
    expect(out.status, out.body).toBe(200)
    expect(out.reply.reviewSent).toBe(false)
    expect(out.reply.review.review.state).not.toBe('sent')
    expect(out.reply.review.waitsFor).toEqual([work])
    expect(out.reply.says).toContain(sayInEnglish('review.takeOut.stillWaits', { n: 1 }))

    const sent = await send(review, [{ commentId: work, recipient: toSession(agent) }])
    expect(sent.status, sent.body).toBe(200)
    expect(sent.reply.sent).toBe(1)
    expect(sent.reply.review.review.state).toBe('sent')
    expect(sent.reply.says).toContain(sayInEnglish('sendPlan.sent.reviewSentYoursStayed', { n: 1 }))
    expect(sent.reply.says).not.toContain(sayInEnglish('review.delivery.stillWaiting'))
  })

  it('says a review stored as sent with a comment still waiting was sent, and that Send sends what is left', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const alive = await resumableSession('Calibration work', 'ext-waits-left-1')
    const gone = await stampedButGone('A run whose transcript is not here', 'ext-waits-left-2')
    const review = await startReview(gripper)
    const good = await remark(gripper, 'The calibration number is wrong here.')
    const stranded = await remark(gripper, 'These words wait for an address that works.')
    await finishCollecting(review)
    const sent = await send(review, [
      { commentId: good, recipient: toSession(alive) },
      { commentId: stranded, recipient: toSession(gone) },
    ])
    expect(sent.status, sent.body).toBe(200)
    expect(sent.reply.held).toHaveLength(1)
    markedSentTheOldWay(review)
    const fixed = await app.inject({
      method: 'PATCH',
      url: `/api/agent/messages/${sent.reply.held[0]?.messageId ?? ''}`,
      headers: HUMAN,
      payload: { recipient: toSession(alive) },
    })
    expect(fixed.statusCode, fixed.body).toBe(200)

    const plan = await whereTheyWouldGo(review)
    expect(plan.recoveryAvailable).toBe(true)
    expect(plan.facts.state).toBe('sent')
    expect(plan.facts.recovery).toBe(true)
    expect(plan.says).toContain(sayInEnglish('sendPlan.plan.sentSomeLeft'))
    expect(plan.says).not.toContain(sayInEnglish('sendPlan.plan.sent'))
  })
})
