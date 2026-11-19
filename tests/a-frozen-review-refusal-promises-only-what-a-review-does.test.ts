// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REFUSAL TO REWRITE A NOTE A FINISHED REVIEW HOLDS PROMISES ONLY WHAT A REVIEW DOES. Problem yyRvgbMOczW4.
 *
 * Changing the words of a note that a review has finished collecting is refused with 409, and the
 * refusal tells the writer to write a new note and link it with `supersedes`. It used to add that "a
 * later review can collect that one". A review takes in only notes written while it is collecting, by
 * whoever started it, about what it covers (`membersOf` in src/server/lib/reviews.ts; contract §6.15,
 * `Earlier`). So the refusal now says that, and this file holds it to it:
 *
 *   - the 409 no longer promises a later collection, and says what a review takes in;
 *   - what it says is true: a new note written after the review finished is not in that review.
 *
 * THE CLOCK IS SET, NOT WAITED FOR, as in tests/a-comment-written-before-a-review-is-named-not-dropped.test.ts.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

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

function at(local: string): void {
  vi.setSystemTime(new Date(local))
}

async function aModule(): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind: 'module', title: 'The gripper', data: { context: 'x' } } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function aCommentOn(moduleId: string, words: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'annotation',
      title: words,
      data: { body: words, context: { target: { kind: 'record', recordId: moduleId, workspaceId: WORKSPACE } } },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function aReviewOn(moduleId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/reviews',
    headers: HUMAN,
    payload: { entry: { target: { kind: 'record', recordId: moduleId, workspaceId: WORKSPACE } } },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { review: { id: string } }).review.id
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

describe('rewriting a note a finished review holds (yyRvgbMOczW4)', () => {
  it('is refused with a sentence that promises no later collection, and what it says is true', async () => {
    at('2026-10-01T10:00:00')
    const gripper = await aModule()
    const review = await aReviewOn(gripper)
    at('2026-10-01T10:00:05')
    const held = await aCommentOn(gripper, 'The calibration number is wrong here.')
    at('2026-10-01T10:00:10')
    await finish(review)
    expect(await plan(review)).toEqual([held])

    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/records/${held}`,
      headers: HUMAN,
      payload: { dataPatch: { body: 'The calibration number is wrong in two places.' } },
    })
    expect(refused.statusCode, refused.body).toBe(409)
    const said = (refused.json() as { error: string }).error
    expect(said).toContain(`Review ${review} has finished collecting with this note in it`)
    expect(said).not.toContain('a later review can collect')
    expect(said).toContain(
      'A review takes in only notes written while it is collecting, by whoever started it, about what it covers, ' +
        'so no review that has already finished will take in the new note.',
    )

    // WHAT THE SENTENCE SAYS IS TRUE: the new note the refusal asks for is not taken in by the review
    // that finished, and the held note still says what it said.
    at('2026-10-01T10:00:20')
    const replacement = await aCommentOn(gripper, 'The calibration number is wrong in two places.')
    expect(await plan(review)).toEqual([held])
    expect(await plan(review)).not.toContain(replacement)
  })
})
