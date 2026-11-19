// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * A COMMENT WRITTEN BEFORE A REVIEW STARTED IS KEPT AND NAMED, NEVER DROPPED IN SILENCE.
 *
 * Problem 342gEXEpJ20R. Its recipe: write a comment on a module, let the clock pass into a later
 * second, start a review on that module, finish collecting, and read the send plan. The plan was
 * empty, and sending the comment by name was refused with "The comments in it are: ." So a person
 * read it as a comment that had been lost.
 *
 * WHAT IS TRUE, AND WHAT THIS FILE HOLDS THE PRODUCT TO:
 *
 *   - A review takes the comments written from the second it starts. Contract §6.15 lists
 *     `Earlier` as a reason a comment is not in one, and design/round-ten/design/review.md says a
 *     review "names a reach and a moment". So the comment written the second before is not in it,
 *     and that is the design, not the defect.
 *   - The comment is kept. Its record is untouched, and the review names it under `Not in it` with
 *     the clause `written-before-it-started`, before and after collecting finishes.
 *   - Naming it in the send is refused with a sentence that says why, and an empty review says it
 *     holds no comments. That sentence is what was missing.
 *   - The composer's sentence after "Save without sending" said "a review can send it later". This
 *     case is the proof that a later review does not, so the sentence now says so. Shape B took that
 *     press away; the same sentence is what the frame says after Start review when the review does
 *     not take the comment in.
 *
 * THE CLOCK IS SET, NOT WAITED FOR. Only `Date` is faked, so each write lands in the second this file
 * chose: the second before, the same second, and the second after. Nothing here depends on how busy
 * the machine is.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { thePersonsKeyHeader, apiApp, freshDb, type TestDb } from './helpers.ts'
import { COMPOSER_STATES } from '../src/shared/states.ts'

const WORKSPACE = 'default'
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}
const AN_AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-workspace': WORKSPACE }
const THE_WORDS = 'The calibration number is wrong here.'

let t: TestDb
let app: FastifyInstance

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})

afterEach(async () => {
  await app.close()
  t.close()
  vi.useRealTimers()
})

/** Put the office's clock at this local time. */
function at(local: string): void {
  vi.setSystemTime(new Date(local))
}

async function aModule(): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind: 'module', title: 'The gripper', data: { context: 'x' } } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function aCommentOn(moduleId: string): Promise<{ id: string; createdAt: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'annotation',
      title: THE_WORDS,
      data: { body: THE_WORDS, context: { target: { kind: 'record', recordId: moduleId, workspaceId: WORKSPACE } } },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string; createdAt: string } }).record
}

async function aReviewOn(moduleId: string): Promise<{ id: string; started: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/reviews',
    headers: HUMAN,
    payload: { entry: { target: { kind: 'record', recordId: moduleId, workspaceId: WORKSPACE } } },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { review: { id: string; started: string } }).review
}

async function finish(reviewId: string): Promise<void> {
  const res = await app.inject({ method: 'POST', url: `/api/reviews/${reviewId}/finish-collecting`, headers: HUMAN, payload: {} })
  expect(res.statusCode, res.body).toBe(200)
}

async function plan(reviewId: string): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: `/api/reviews/${reviewId}/send`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { comments: { id: string }[] }).comments.map((one) => one.id)
}

async function notInIt(reviewId: string): Promise<{ id: string; clause: string; reason: string }[]> {
  const res = await app.inject({ method: 'GET', url: `/api/reviews/${reviewId}/not-in-it`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { rows: { id: string; clause: string; reason: string }[] }).rows
}

describe('a comment written the second before a review starts', () => {
  it('is kept, is named under Not in it as Earlier, and a send that names it is refused with why', async () => {
    at('2026-09-11T17:19:56.900')
    const gripper = await aModule()
    const comment = await aCommentOn(gripper)
    at('2026-09-11T17:19:57.100')
    const review = await aReviewOn(gripper)
    expect(review.started > comment.createdAt, 'the two writes did not land in two seconds').toBe(true)

    // WHILE IT COLLECTS: not a member, and named with its reason.
    expect((await notInIt(review.id)).find((one) => one.id === comment.id)).toMatchObject({
      clause: 'written-before-it-started',
      reason: 'earlier',
    })

    at('2026-09-11T17:19:57.300')
    await finish(review.id)
    expect(await plan(review.id), 'the review holds a comment written before it started').toEqual([])

    // AFTER IT FROZE: the reason was written down, so it is still named, with the same clause.
    expect((await notInIt(review.id)).find((one) => one.id === comment.id)).toMatchObject({
      clause: 'written-before-it-started',
      reason: 'earlier',
    })

    // NAMED IN THE SEND, IT IS REFUSED WITH A SENTENCE THAT SAYS WHY.
    const sent = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review.id}/send`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() },
      payload: { to: [{ commentId: comment.id, recipient: { kind: 'new' } }] },
    })
    expect(sent.statusCode, sent.body).toBe(400)
    const refusal = (sent.json() as { error: string }).error
    expect(refusal).toContain(`You chose an agent for ${comment.id}, and that is not one of the comments in this review.`)
    expect(refusal).toContain('This comment was written before the review started collecting.')
    expect(refusal).toContain('This review holds no comments.')
    expect(refusal).not.toContain('The comments in it are: .')

    // AND THE COMMENT IS STILL THERE, WORD FOR WORD.
    const read = await app.inject({ method: 'GET', url: `/api/records/${comment.id}`, headers: HUMAN })
    expect(read.statusCode, read.body).toBe(200)
    expect((read.json() as { record: { data: { body: string } } }).record.data.body).toBe(THE_WORDS)

    // THE COMPOSER'S SENTENCE FOR A COMMENT KEPT IN NO REVIEW PROMISES NO PLAIN "LATER". It followed "Save without
    // sending" until shape B, and follows Start review now when the review does not take the comment. Since problem H031xonpPSqa a
    // review started afterwards lists a comment saved there (a message, not this old annotation) under Saved, not
    // sent, and the sentence names that group and the condition, rather than saying a review "can send it later".
    expect(COMPOSER_STATES.keptNotSent.detail).not.toContain('send it later')
    expect(COMPOSER_STATES.keptNotSent.detail).toContain('lists it under Saved, not sent, unless another review already holds it')
  })

  it('is not protected by the review it is not in, so an agent rewriting it meets the writer rule (403), not the frozen rule (409)', async () => {
    // THE SAME BOUNDARY AS PROBLEM MbePd2RGUtIn. tests/a-comment-belongs-to-whoever-wrote-it.test.ts writes its comment
    // and then starts its review; when a second turns between the two, the frozen review does not hold the comment
    // and its PATCH answers 403 where the test expects 409. This case shows the 403 at the boundary on purpose.
    at('2026-09-11T17:19:56.900')
    const gripper = await aModule()
    const comment = await aCommentOn(gripper)
    at('2026-09-11T17:19:57.100')
    const review = await aReviewOn(gripper)
    await finish(review.id)
    const rewrite = await app.inject({
      method: 'PATCH',
      url: `/api/records/${comment.id}`,
      headers: AN_AGENT,
      payload: { dataPatch: { body: 'AGENT WORDS' } },
    })
    expect(rewrite.statusCode, rewrite.body).toBe(403)
  })
})

describe('a comment written in the same second as the press, or later', () => {
  it('is in the review when it shares the press\'s second, and the review says their order is not known', async () => {
    at('2026-09-11T17:19:56.100')
    const gripper = await aModule()
    const comment = await aCommentOn(gripper)
    at('2026-09-11T17:19:56.900')
    const review = await aReviewOn(gripper)
    expect(review.started).toBe(comment.createdAt)

    const read = await app.inject({ method: 'GET', url: `/api/reviews/${review.id}`, headers: HUMAN })
    expect(read.statusCode, read.body).toBe(200)
    const gaps = (read.json() as { gaps: string[] }).gaps
    expect(gaps.some((one) => one.includes('written in the same second this review started') && one.includes(comment.id))).toBe(true)

    await finish(review.id)
    expect(await plan(review.id)).toEqual([comment.id])
  })

  it('is in the review when it is written in a later second, with nothing said about order', async () => {
    at('2026-09-11T17:19:56.100')
    const gripper = await aModule()
    const review = await aReviewOn(gripper)
    at('2026-09-11T17:19:57.100')
    const comment = await aCommentOn(gripper)

    const read = await app.inject({ method: 'GET', url: `/api/reviews/${review.id}`, headers: HUMAN })
    expect((read.json() as { gaps: string[] }).gaps.some((one) => one.includes('same second'))).toBe(false)

    at('2026-09-11T17:19:57.300')
    await finish(review.id)
    expect(await plan(review.id)).toEqual([comment.id])
  })
})
