// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE TABLE OF READINGS, READ BY THE BROWSER AND BY THE SERVER.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS FOR, WHICH HAS NOW ARRIVED THREE TIMES IN ONE CAMPAIGN
 * ---------------------------------------------------------------------------------------
 *
 * A comment to an agent holds one of six stored words. On 25 August 2026 the review pane's ROWS
 * were given `STATE_WORDS` in `src/web/lib/words.ts`, so a row stopped saying `picked_up` and
 * started saying "Picked up". Verification of that change then found the SAME machine word two
 * lines below the row it had just been taken out of: `src/server/lib/reviews.ts` wrote *Mole Office has
 * it stamped "handled"* into the sentence under the comment, because a file in `src/web` is not
 * reachable from `src/server`. One fact, one screen, two words — the row said "Dealt with".
 *
 * A SECOND TABLE ON THE SERVER WOULD HAVE BEEN THE SAME DEFECT A FOURTH TIME. So the table moved
 * down to `src/shared/words.ts`, which both sides import, and `src/web/lib/words.ts` re-exports it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, AND WHY EACH PART IS NEEDED
 * ---------------------------------------------------------------------------------------
 *
 * "Two lists that agree today" would pass a test that only checked the words. So this checks two
 * different things, and no two of them can be satisfied by a copy:
 *
 *   1. THE SERVER'S SENTENCE SAYS THE READER'S WORD. Driven through the route the review pane
 *      calls, on a comment a run really has finished with. Changing the reading in
 *      `src/shared/words.ts` turns this red.
 *   2. THE BROWSER HOLDS THE SAME OBJECT, not an equal one. `toBe`, not `toEqual`: a copy passes
 *      `toEqual` and fails this.
 *
 * THE BROWSER HALF OF THE MUTATION PROOF IS `tests/the-review-pane.test.ts`, in *draws a reader's
 * word for every one of the six, and never the stored token*, which holds `standsWords('handled')`
 * to the literal "Dealt with" and renders a row containing it. It is in that file because it needs
 * a browser stand-in and this one opens a database. The pair is what the proof needs: change
 * `handled` in the one table and that test and the first test here go red together.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { thePersonsKeyHeader, apiApp, freshDb, type TestDb } from './helpers.ts'

// =========================================================================== 2. it is one object

/**
 * THE FILE THE BROWSER IMPORTS AND THE FILE THE SERVER IMPORTS HAND OUT THE SAME OBJECT.
 *
 * `toBe` is the whole point. `src/web/lib/words.ts` is a re-export, so `STATE_WORDS` reached
 * through it IS the object declared in `src/shared/words.ts`. If somebody ever replaces that
 * re-export with a table of its own — the cheap way to answer "the browser needs a word here" —
 * the two would still be equal on the day it was written and this goes red immediately.
 *
 * The imports are dynamic because `freshDb` in the describe below calls `vi.resetModules()`, and a
 * module-scope import would be a different instance from the one the routes are running.
 */
describe('the browser and the server hold one table, not two that agree', () => {
  it('hands out the SAME object through both doors, rather than an equal copy', async () => {
    const shared = await import('../src/shared/words.ts')
    const browser = await import('../src/web/lib/words.ts')
    expect(browser.STATE_WORDS, 'the browser has a copy of the state words rather than the table').toBe(
      shared.STATE_WORDS,
    )
    expect(browser.KIND_WORDS, 'the browser has a copy of the kind words rather than the table').toBe(
      shared.KIND_WORDS,
    )
    expect(browser.ACTOR_WORDS, 'the browser has a copy of the actor words rather than the table').toBe(
      shared.ACTOR_WORDS,
    )
    expect(browser.stateWord, 'the browser has its own stateWord').toBe(shared.stateWord)
  })
})

// =========================================================================== 1. the server's word

const WORKSPACE = 'default'
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

/** Resolves once the office's clock reads a later second than `stamp`, polling it; a condition, not a time. */
async function untilTheClockHasPassed(stamp: string): Promise<void> {
  const { nowStamp } = await import('../src/shared/time.ts')
  while (nowStamp() <= stamp) await new Promise((next) => setTimeout(next, 20))
}

describe('the sentence the review pane draws under a comment says the reader\'s word', () => {
  let t: TestDb
  let app: FastifyInstance

  beforeEach(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    t.close()
  })

  async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
    expect(res.statusCode, res.body).toBe(201)
    return (res.json() as { record: { id: string } }).record.id
  }

  /**
   * A REVIEW WHOSE ONE COMMENT HAS REALLY BEEN HANDED OVER AND REALLY BEEN FINISHED WITH.
   *
   * It goes through the routes and then through `moveMessageTo`, which is the only function in this
   * repository that writes `agent_messages.state` — so the word this test reads back is the word
   * the product would have written, not one poked into a row.
   */
  async function aCommentARunFinishedWith(): Promise<{ reviewId: string }> {
    const gripper = await file('module', 'The gripper', { context: 'x' })

    const started = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: HUMAN,
      payload: { entry: { target: { kind: 'record', recordId: gripper, workspaceId: WORKSPACE } } },
    })
    expect(started.statusCode, started.body).toBe(201)
    const review = (started.json() as { review: { id: string; started: string } }).review
    const reviewId = review.id

    // THE COMMENT IS WRITTEN AFTER THE REVIEW STARTED, IN A LATER SECOND. A review collects the comments written at
    // or after the second it started (`membersOf` in src/server/lib/reviews.ts). This fixture used to write the
    // comment first: alone, both fell in the same second and the comment counted, and under load the second ticked
    // over between them and the review held nothing (problem G6BLK97_R1UD). Waiting on the clock to pass the
    // review's second, a condition and not a time, makes every run cross that boundary, so the order is what passes.
    await untilTheClockHasPassed(review.started)
    const comment = await file('annotation', 'The calibration number is wrong here.', {
      body: 'The calibration number is wrong here.',
      context: { target: { kind: 'record', recordId: gripper, workspaceId: WORKSPACE } },
    })
    expect(comment).not.toBe('')

    const collected = await app.inject({
      method: 'POST',
      url: `/api/reviews/${reviewId}/finish-collecting`,
      headers: HUMAN,
    })
    expect(collected.statusCode, collected.body).toBe(200)

    const sent = await app.inject({
      method: 'POST',
      url: `/api/reviews/${reviewId}/send`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() },
      payload: { to: [{ commentId: comment, recipient: { kind: 'new' } }] },
    })
    expect(sent.statusCode, sent.body).toBe(200)
    const threadId = (sent.json() as { threadId: string }).threadId

    const thread = await app.inject({ method: 'GET', url: `/api/agent/threads/${threadId}`, headers: HUMAN })
    expect(thread.statusCode, thread.body).toBe(200)
    const messages = (thread.json() as { messages: { id: string; state: string }[] }).messages
    expect(messages, 'the send wrote no message into the conversation').toHaveLength(1)

    const { moveMessageTo } = await import('../src/server/lib/dispatch.ts')
    moveMessageTo(messages[0]?.id ?? '', 'delivered')
    moveMessageTo(messages[0]?.id ?? '', 'handled')
    return { reviewId }
  }

  /**
   * THE MEASURED FAULT, MADE INTO A TEST.
   *
   * Photographed in Chromium at 1440 on 25 August 2026: the row said "Dealt with" and the sentence
   * two lines under it said *Mole Office has it stamped "handled"*. The literal below is what makes this
   * a proof — change "dealt with" in `src/shared/words.ts` and this goes red, along with the
   * browser's half in `tests/the-review-pane.test.ts`.
   */
  it('says "dealt with" for a comment a run has finished with, and never the stored word', async () => {
    const { reviewId } = await aCommentARunFinishedWith()
    const plan = await app.inject({ method: 'GET', url: `/api/reviews/${reviewId}/send`, headers: HUMAN })
    expect(plan.statusCode, plan.body).toBe(200)
    const said = (plan.json() as { comments: { says: string }[] }).comments[0]?.says ?? ''

    expect(said, 'the sentence under the comment is empty').not.toBe('')
    expect(said, 'the sentence does not say where the comment got to').toContain('dealt with')
    expect(said, 'the stored word reached a sentence a person reads').not.toContain('handled')
  })

  /**
   * THE SAME WORD IN THE OTHER SENTENCE ABOUT THE SAME FACT.
   *
   * Trying to edit a comment that has gone is refused, and that refusal named the state too. It had
   * a table of its own — `WHAT_HAPPENED` in `src/server/lib/agents.ts`, six entries, four of them
   * character for character the strings the shared table already held. It reads the table now.
   */
  it('says the same word when it refuses to change that comment, out of the same table', async () => {
    await aCommentARunFinishedWith()
    const rows = t.client.sqlite.prepare('SELECT id, state FROM agent_messages').all() as {
      id: string
      state: string
    }[]
    expect(rows.map((row) => row.state)).toEqual(['handled'])

    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/agent/messages/${rows[0]?.id ?? ''}`,
      headers: HUMAN,
      payload: { body: 'Actually, never mind.' },
    })
    expect(changed.statusCode, changed.body).toBe(409)
    const error = (changed.json() as { error: string }).error
    expect(error, 'the refusal does not say where the comment got to').toContain('already been dealt with')
    expect(error, 'the stored word reached a sentence a person reads').not.toContain('handled')
  })
})
