// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S OWN REVIEW IS CARRIED FORWARD, AND IT IS CHECKED BY ITS ID.
 *
 * ---------------------------------------------------------------------------------------
 * WHY BY ID AND NOT BY COUNTING
 * ---------------------------------------------------------------------------------------
 *
 * Round seven had nowhere to put a review, so it used a row of `agent_threads` with `mode` set to
 * `review`, and each remark a row of `agent_messages` inside it. One such review is the fixture:
 * `mSOSTMcl5mka`, holding the one message `mGYhhpVnfVbZ`, pointing at line `Omc1DshUbkBq` of
 * plan `BcO6p5CRMhk3`. That single row is the whole reason this campaign exists.
 *
 * A test that counted rows would pass on a database that had brought forward somebody else's review
 * and lost the owner's. So every assertion below names the owner's ids, the owner's words, and where the owner was pointing. The
 * fixture is the owner's row, copied field for field from the live database on 18 August 2026.
 *
 * ---------------------------------------------------------------------------------------
 * AND WHAT THE MIGRATION REFUSES TO GUESS AT
 * ---------------------------------------------------------------------------------------
 *
 * Where a review was started from is MEASURED, from the first comment in the conversation that says
 * what it points at. A conversation whose comments all point at nothing has no evidence of where
 * anybody was standing, and inventing one would invent what that review collects — and eventually
 * sends. Those are left exactly as they are and reported one by one, which is the second half of
 * this file.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type ReviewsLib = typeof import('../src/server/lib/reviews.ts')
type MigrationLib = typeof import('../src/server/db/review-migration.ts')

/** The owner's review, as the live database holds it. */
const THE_OWNERS_REVIEW = 'mSOSTMcl5mka'
const THE_OWNERS_MESSAGE = 'mGYhhpVnfVbZ'
const THE_OWNERS_WORDS = 'some of the things still cannot be used as agent call (the right click)'
const THE_OWNERS_PLAN = 'BcO6p5CRMhk3'
const THE_OWNERS_LINE = 'Omc1DshUbkBq'
const THE_OWNERS_START = '2026-08-18 09:40:29'

let t: TestDb
let reviews: ReviewsLib
let migration: MigrationLib

beforeEach(async () => {
  t = await freshDb()
  reviews = (await import('../src/server/lib/reviews.ts')) as ReviewsLib
  migration = (await import('../src/server/db/review-migration.ts')) as MigrationLib
})

afterEach(() => {
  t.close()
})

/**
 * The owner's conversation and the owner's comment, written straight into the two tables.
 *
 * RAW SQL, because this is a row that already exists and no code path makes one like it today: the
 * point of the migration is exactly that these rows predate the table they are being moved into.
 * Writing it through `createThread` would stamp today's clock on it and the "since 09:40 on
 * 18 August" half of the claim would be about nothing.
 */
function theOwnersRoundSevenReview(): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO agent_threads (id, workspace_id, title, mode, state, created_at, updated_at, created_by) ' +
        'VALUES (?,?,?,?,?,?,?,?)',
    )
    .run(THE_OWNERS_REVIEW, 'default', 'Review, August 18 at 09:40 AM', 'review', 'open', THE_OWNERS_START, THE_OWNERS_START, `human:${THE_TEST_OFFICES_OWNER.id}`)
  t.client.sqlite
    .prepare(
      'INSERT INTO agent_messages (id, thread_id, position, role, intent, body, context, state, created_at, ' +
        'created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      THE_OWNERS_MESSAGE,
      THE_OWNERS_REVIEW,
      1,
      'human',
      'review',
      THE_OWNERS_WORDS,
      JSON.stringify({ target: { kind: 'planLine', planId: THE_OWNERS_PLAN, lineId: THE_OWNERS_LINE } }),
      'queued',
      THE_OWNERS_START,
      `human:${THE_TEST_OFFICES_OWNER.id}`,
    )
}

// ============================================================================ the owner's review

describe('the review the owner left open on 18 August is carried forward', () => {
  it('becomes a review of its own, keeping its id, its start and who started it', () => {
    theOwnersRoundSevenReview()
    const report = migration.migrateReviews(t.client.sqlite)

    expect(report.brought).toBe(1)
    expect(report.notes).toEqual([])

    // BY ID. A count would pass on a database that had brought forward somebody else's review.
    const ownersReview = reviews.readReview(THE_OWNERS_REVIEW, 'default')
    expect(ownersReview.review.id).toBe(THE_OWNERS_REVIEW)
    expect(ownersReview.review.state).toBe('collecting')
    expect(ownersReview.review.started).toBe(THE_OWNERS_START)
    expect(ownersReview.review.startedBy).toBe(`human:${THE_TEST_OFFICES_OWNER.id}`)
    // NOT FINISHED, and that is the fact: it has been open and uncollected the whole time.
    expect(ownersReview.review.membershipFrozen).toBe(false)
    expect(ownersReview.review.collectedAt).toBeNull()
  })

  it('says where it was started from, measured off the one thing the owner said in it', () => {
    theOwnersRoundSevenReview()
    migration.migrateReviews(t.client.sqlite)

    const ownersReview = reviews.readReview(THE_OWNERS_REVIEW, 'default')
    // THE TARGET AND NOTHING ELSE. The owner pointed at a line of a plan; that is where the owner was standing.
    expect(ownersReview.review.entry).toEqual({ target: { kind: 'planLine', planId: THE_OWNERS_PLAN, lineId: THE_OWNERS_LINE } })
    expect(ownersReview.rule.kind).toBe('plan')
    expect(ownersReview.rule.id).toBe(THE_OWNERS_PLAN)
  })

  it('still holds the owner’s comment, read from the conversation it is still in', () => {
    theOwnersRoundSevenReview()
    migration.migrateReviews(t.client.sqlite)

    const ownersReview = reviews.readReview(THE_OWNERS_REVIEW, 'default')
    expect(ownersReview.count).toBe(1)
    const only = ownersReview.members[0]
    if (only === undefined || !only.found) throw new Error('the owner’s comment is not in the owner’s review')
    expect(only.id).toBe(THE_OWNERS_MESSAGE)
    // THE OWNER'S WORDS, EXACTLY. They were not rewritten and they were not copied: the row is still the
    // one in `agent_messages`, which is what `source` says.
    expect(only.body).toBe(THE_OWNERS_WORDS)
    expect(only.source).toBe('conversation')
    expect(only.state).toBe('queued')
  })

  it('does not copy the owner’s words into a second row', () => {
    theOwnersRoundSevenReview()
    migration.migrateReviews(t.client.sqlite)

    // NOT MOVED EITHER. The message is exactly where it was, with the same words and the same
    // state, and no annotation was invented to hold a second copy of them.
    const message = t.client.sqlite
      .prepare('SELECT body, state FROM agent_messages WHERE id = ?')
      .get(THE_OWNERS_MESSAGE) as { body: string; state: string } | undefined
    expect(message).toEqual({ body: THE_OWNERS_WORDS, state: 'queued' })
    expect(t.api.listRecords({ workspaceId: 'default', kind: 'annotation' })).toEqual([])
  })

  it('writes nothing on a second run', () => {
    theOwnersRoundSevenReview()
    migration.migrateReviews(t.client.sqlite)
    const again = migration.migrateReviews(t.client.sqlite)

    expect(again.alreadyDone).toBe(true)
    expect(again.brought).toBe(0)
    expect(again.alreadyThere).toBe(1)
    expect(reviews.listReviews({ workspaceId: 'default' }).total).toBe(1)
  })
})

// ============================================================================ what it will not guess

describe('a conversation with nothing to measure is left exactly as it is', () => {
  it('reports a review-mode conversation whose comments point at nothing', () => {
    t.client.sqlite
      .prepare(
        'INSERT INTO agent_threads (id, workspace_id, title, mode, state, created_at, updated_at, created_by) ' +
          'VALUES (?,?,?,?,?,?,?,?)',
      )
      .run('tNoContext01', 'default', 'A review of nothing in particular', 'review', 'open', THE_OWNERS_START, THE_OWNERS_START, `human:${THE_TEST_OFFICES_OWNER.id}`)
    t.client.sqlite
      .prepare(
        'INSERT INTO agent_messages (id, thread_id, position, role, intent, body, context, state, created_at, ' +
          'created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .run('mNoContext01', 'tNoContext01', 1, 'human', 'ask', 'a thought about nothing in particular', null, 'queued', THE_OWNERS_START, `human:${THE_TEST_OFFICES_OWNER.id}`)

    const report = migration.migrateReviews(t.client.sqlite)
    expect(report.brought).toBe(0)
    const note = report.notes[0]
    if (note === undefined) throw new Error('the conversation was neither brought forward nor reported')
    expect(note.kind).toBe('nothing_pointed_at')
    expect(note.threadId).toBe('tNoContext01')
    expect(note.detail).toContain('nothing says where this review was started from')
    expect(reviews.listReviews({ workspaceId: 'default' }).total).toBe(0)
  })

  it('leaves an ordinary conversation alone, because it is not a review', () => {
    t.client.sqlite
      .prepare(
        'INSERT INTO agent_threads (id, workspace_id, title, mode, state, created_at, updated_at, created_by) ' +
          'VALUES (?,?,?,?,?,?,?,?)',
      )
      .run('tDirect0001', 'default', 'A question about the gripper', 'direct', 'open', THE_OWNERS_START, THE_OWNERS_START, `human:${THE_TEST_OFFICES_OWNER.id}`)

    const report = migration.migrateReviews(t.client.sqlite)
    expect(report.brought).toBe(0)
    expect(report.notes).toEqual([])
  })
})
