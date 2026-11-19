// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** Fake-runtime exits submit an explicit completion note through the real sealer, as in the other worker tests. */
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * A REVIEW THAT HAS ENDED LISTS NO SAVED COMMENT AND HOLDS NONE BACK. Check 9K27DM6LOr_Z, the case of
 * problem 342gEXEpJ20R.
 *
 * WHAT WAS WRONG. `savedNotSent` in src/server/lib/reviews.ts listed comments saved without sending
 * under any review, whatever its state, and `commentsAReviewHasNotSentYet` skipped only an abandoned
 * one. So a comment a sent review had left as `Earlier` was listed under that sent review: the column
 * said "Goes with the review", the message worker held it for that review, and the review refused a
 * second send with 409. The comment could never be delivered, and the screen said it would be.
 *
 * HOW A SENT REVIEW COMES TO HOLD ONE. Until 1 October 2026 a review's send did not carry the comments saved
 * before it started. So a review sent before then is stored as `sent`, and a comment saved before it
 * started is still saved and unsent. Today's send carries such a comment, so no door writes that state
 * now; this file writes the review's state directly, as such a review is stored.
 *
 * WHAT IS PROVED HERE.
 *   (a) The sent review answers `saved: []` on GET /api/reviews/:id, and the worker's reading
 *       (`commentsAReviewHasNotSentYet`) has no entry for the comment.
 *   (b) Once somebody is chosen for the comment, GET /api/reviews/holding answers null for it, a
 *       worker pass does not hold it for a review, and after the person's press a run is started and
 *       the comment is handed over (its delivery is no longer `queued`). `onePass` is the real worker
 *       pass, with the fake runtime, as in tests/a-review-holds-its-comments-until-it-is-sent.test.ts.
 *   (a') The same for an abandoned review that started after a saved comment: it lists none.
 *   (c) One worker pass over N reviews reads the project's review rows once, and makes at most 8 + 18N
 *       database reads in all. The statements are counted at `sqlite.prepare`.
 *       Each review is on its own
 *       page, still collecting, with one comment saved on that page before it started.
 *
 * Three-run proofs, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/a-sent-review-holds-no-saved-comment.test.ts
 * After a green control, copy src/server/lib/reviews.ts before each one-line mutation:
 * - The ended-state check removed: `reviewHasEnded` answering `false`. (a), (a'), (b) and (c) go red.
 * - `sent` left out of `ENDED_REVIEW_STATES`. (a), (b) and (c) go red.
 * - The review rows read again for each review: in `commentsAReviewHasNotSentYet`, `whatItWouldSend(row,
 *   project)` made `whatItWouldSend(row, oneProjectsReviews(workspaceId))`. (c) goes red.
 * - In `savedNotSent`, `|| aMessageHasGoneOut(record)` added to the line that asks whether another review holds the
 *   comment, so it is asked before the scope again. (c) goes red: 326 reads for eight reviews.
 * Restore the file with cp, check it with cmp, and run the command again for green.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, fakeTranscript, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
let outputs = ''
const watching: Parameters<typeof onePass>[1] = []

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const HANDLE = 'ended-review-agent'
let sessionId = ''

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function get<T>(path: string): Promise<T> {
  const res = await app.inject({ method: 'GET', url: path, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as T
}

async function post<T>(path: string, payload?: Record<string, unknown>, expected = 200): Promise<T> {
  const res = await app.inject({ method: 'POST', url: path, headers: HUMAN, ...(payload === undefined ? {} : { payload }) })
  expect(res.statusCode, res.body).toBe(expected)
  return res.json() as T
}

const on = (recordId: string) => ({ target: { kind: 'record', recordId, workspaceId: 'default' }, place: { at: 'surface' } })

/**
 * A comment saved without sending, in the shape the right-click panel's "Save without sending" wrote. Shape B took that
 * press away; Start review writes this same record first and then starts the page's review, so a comment of this shape is
 * still made by a review that will not start, or one that does not reach what the comment is about, and by every comment
 * kept before shape B.
 */
async function saveWithoutSending(body: string, recordId: string): Promise<string> {
  return file('message', body.slice(0, 40), { body, target: on(recordId) })
}

async function startAReview(recordId: string): Promise<string> {
  return (await post<{ review: { id: string } }>('/api/reviews', { entry: on(recordId) }, 201)).review.id
}

/** A review is started to the second, and takes what is written from that second on. */
const aSecondLater = () => new Promise((resolve) => setTimeout(resolve, 1_100))

async function theWorkersHolds(): Promise<Map<string, { id: string }>> {
  const reviews = await import('../src/server/lib/reviews.ts')
  return reviews.commentsAReviewHasNotSentYet('default')
}

/** Why a review holds this comment in this pass, or null because none does. */
function whyAReviewHoldsIt(pass: { held: { messageId: string; because: string }[] }, id: string): string | null {
  const row = pass.held.find((one) => one.messageId === id)
  if (row === undefined) return null
  return row.because.includes(CHAT_WORDS.sendThemAll) ? row.because : null
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-ended-review-'))
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 4,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
  const agentRecordId = await file('agent', 'Ended review agent', { handle: HANDLE, runtime: 'claude-code', state: 'active' })
  // A RUN MOLE OFFICE COULD PICK UP AGAIN, which a comment can be addressed to. Synthetic stamps, as discovery writes them.
  const externalId = 'ended-review-run'
  sessionId = await file('session', 'A run of the ended review agent', {
    state: 'idle',
    runtime: 'claude-code',
    ranAs: [{ workspaceId: 'default', agentId: agentRecordId }],
    extra: {
      discovered: {
        tool: 'claude-code',
        externalId,
        logPath: fakeTranscript(externalId),
        resumeCommand: `claude --resume ${externalId}`,
        observedState: 'idle',
        stateReason: 'its log last grew 40 minutes ago and a process still names it',
        filesTouched: [],
        filesComplete: true,
        at: '2026-10-02 05:00:00',
      },
    },
  })
}, 120_000)

afterAll(async () => {
  for (const left of watching.splice(0, watching.length)) left.adapter.stop(left.handle, 'the test is over')
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('a comment a sent review left as Earlier', () => {
  let page = ''
  let comment = ''
  let sentReview = ''

  beforeAll(async () => {
    page = await file('note', 'Synthetic page: the harbour soundings', { body: 'Two claims and a table.' })
    comment = await saveWithoutSending('Synthetic saved comment: the north pier depth needs its source.', page)
    await aSecondLater()
    sentReview = await startAReview(page)
    // CONTROL: while it can still send, the review holds the comment and the worker holds it for the review. Since
    // wave 13r round 15 a comment kept before a review starts is taken in as a member when it starts (the owner's
    // third detail, record 9BZZVKQxWV9Z), so it is among the members rather than listed as saved.
    expect((await get<{ members: { id: string }[] }>(`/api/reviews/${sentReview}`)).members.map((one) => one.id)).toEqual([comment])
    expect((await theWorkersHolds()).has(comment)).toBe(true)
    await post(`/api/reviews/${sentReview}/finish-collecting`)
    // SENT BEFORE 1 OCTOBER 2026. Until then a review's send did not carry the comments saved before it started,
    // so a review was sent and the comment stayed behind, saved and unsent. No door of today's office writes that
    // state, because today's send carries the comment. So it is written here directly, as such a review is stored.
    t.client.sqlite
      .prepare("UPDATE reviews SET state = 'sent', sent_at = ? WHERE id = ?")
      .run('2026-09-30 10:00:00', sentReview)
  }, 120_000)

  it('(a) is not listed by the sent review, and the worker holds it for no review', async () => {
    const read = await get<{ review: { state: string }; saved: { id: string }[] }>(`/api/reviews/${sentReview}`)
    expect(read.review.state).toBe('sent')
    expect(read.saved, 'a sent review lists a saved comment it can never send').toEqual([])
    expect((await theWorkersHolds()).has(comment), 'the worker holds the comment for a review').toBe(false)
  })

  it('(b) is handed to the agent once somebody is chosen for it, and no review holds it', async () => {
    const chose = await app.inject({
      method: 'PATCH', url: `/api/records/${comment}`, headers: HUMAN,
      payload: { dataPatch: { chosenRecipient: { kind: 'session', sessionId, why: 'Synthetic: it wrote this page.' } } },
    })
    expect(chose.statusCode, chose.body).toBe(200)
    const holding = await get<{ review: unknown }>(`/api/reviews/holding?comment=${encodeURIComponent(comment)}`)
    expect(holding.review, 'the column is told a review holds it').toBeNull()
    const pass = await onePass(settings, watching)
    expect(whyAReviewHoldsIt(pass, comment), 'the worker holds it for a review').toBeNull()
    // THE PERSON'S PRESS TO START AN AGENT (criterion M78): this agent has no conversation here to pick up.
    await post(`/api/messages/${comment}/start-an-agent`, {})
    const after = await onePass(settings, watching)
    expect(whyAReviewHoldsIt(after, comment), 'the worker holds it for a review').toBeNull()
    expect(after.started.length, 'nothing took the comment').toBeGreaterThan(0)
    const message = (await get<{ message: { deliveries: { mark: string }[] } }>(`/api/messages/${comment}`)).message
    expect(message.deliveries.map((one) => one.mark), 'the comment is still queued').not.toContain('queued')
  }, 120_000)
})

describe('a comment saved before a review that was abandoned', () => {
  it("(a') is not listed by the abandoned review, and the worker holds it for no review", async () => {
    const page = await file('note', 'Synthetic page: the tide tables', { body: 'One claim.' })
    const comment = await saveWithoutSending('Synthetic saved comment: the tide table is from last year.', page)
    await aSecondLater()
    const review = await startAReview(page)
    // Taken in as a member when the review started (wave 13r round 15), so the control reads the members.
    expect((await get<{ members: { id: string }[] }>(`/api/reviews/${review}`)).members.map((one) => one.id)).toEqual([comment])
    await post(`/api/reviews/${review}/abandon`)
    const read = await get<{ review: { state: string }; saved: { id: string }[] }>(`/api/reviews/${review}`)
    expect(read.review.state).toBe('abandoned')
    expect(read.saved, 'an abandoned review lists a saved comment it can never send').toEqual([])
    expect((await theWorkersHolds()).has(comment)).toBe(false)
  }, 60_000)

  // THE BRANCH IN `stillHolding` (wave 13r round 16, piece 1 item 5): an ended review holds nothing for another review
  // to leave to it. Without that branch the abandoned review's taken-in list still holds the comment, so the next
  // review on the page does not take it in, and the comment is in no review that can send it.
  it("(a'') is taken in by the next review started on the page", async () => {
    const page = await file('note', 'Synthetic page: the pier survey', { body: 'One claim.' })
    const comment = await saveWithoutSending('Synthetic saved comment: the survey date is missing.', page)
    await aSecondLater()
    const first = await startAReview(page)
    expect((await get<{ members: { id: string }[] }>(`/api/reviews/${first}`)).members.map((one) => one.id)).toEqual([comment])
    await post(`/api/reviews/${first}/abandon`)
    const next = await startAReview(page)
    const read = await get<{ members: { id: string }[]; saved: { id: string }[] }>(`/api/reviews/${next}`)
    expect([...read.members, ...read.saved].map((one) => one.id), 'the next review leaves the comment to an abandoned one').toEqual([comment])
    expect((await theWorkersHolds()).has(comment), 'the worker holds it for the next review').toBe(true)
  }, 60_000)
})

/** Every statement prepared while `act` runs, by its SQL. */
function statementsDuring(act: () => void): string[] {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => unknown }
  const original = sqlite.prepare
  const seen: string[] = []
  sqlite.prepare = function (this: unknown, sql: string) {
    seen.push(sql)
    return original.call(this, sql)
  }
  try {
    act()
  } finally {
    sqlite.prepare = original
  }
  return seen
}

/** The statement that reads a project's review rows. */
const readsTheReviews = (sql: string) => /^select .* from "reviews" where "reviews"\."workspace_id" = \?$/.test(sql)

/**
 * THE BOUND, MEASURED ON 2 OCTOBER 2026 with one saved comment on each review's page: 21, 41, 77 and 149 reads for
 * 1, 2, 4 and 8 reviews, which is 5 + 18N from two reviews on. Before the change it was 63, 125, 308 and 914, growing
 * with the square of N. The bound leaves three reads of room at eight reviews.
 */
const AT_MOST = (n: number) => 8 + 18 * n

describe('(c) the reads one worker pass makes over N reviews', () => {
  it('grow linearly with N, and the review rows are read once', async () => {
    const reviews = await import('../src/server/lib/reviews.ts')
    // THE REVIEWS ABOVE STAY IN THE PROJECT. They have ended, so the pass reads their rows and nothing more of them.
    const counts = new Map<number, number>()
    let made = 0
    const mine: string[] = []
    for (const n of [1, 2, 4, 8]) {
      const pages: string[] = []
      for (; made < n; made += 1) {
        const page = await file('note', `Synthetic page ${String(made + 1)}`, { body: 'A paragraph.' })
        mine.push(await saveWithoutSending(`Synthetic saved comment on page ${String(made + 1)}.`, page))
        pages.push(page)
      }
      await aSecondLater()
      for (const page of pages) await startAReview(page)
      let held = new Map<string, unknown>()
      const statements = statementsDuring(() => {
        held = reviews.commentsAReviewHasNotSentYet('default')
      })
      counts.set(n, statements.length)
      // EACH REVIEW HOLDS ITS ONE SAVED COMMENT, so every review was really read.
      expect(mine.filter((id) => held.has(id)).length).toBe(n)
      expect(statements.filter(readsTheReviews).length, `the review rows were read more than once with ${String(n)} reviews`).toBe(1)
    }
    console.log(`reads per pass by number of reviews: ${JSON.stringify([...counts])}`)
    expect(counts.get(8), `reads for 1, 2, 4, 8 reviews: ${JSON.stringify([...counts])}`).toBeLessThanOrEqual(AT_MOST(8))
  }, 120_000)
})
