// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT SOMEBODY WROTE IS THEIRS, AND A REVIEW THAT HAS FINISHED COLLECTING SAYS WHAT IT SAID.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO HOLES THIS FILE CLOSES, BOTH MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The gate in src/server/lib/records.ts asked one question about a comment: what state is it in. A
 * comment that had been sent was fixed; a comment that was still `queued` was open to anybody.
 *
 * 1. ANYBODY COULD REWRITE ANYBODY'S WORDS. Measured on 19 August 2026 against an isolated copy:
 *    `agent:claude-code` sent one PATCH replacing a 67-character comment written by the owner,
 *    and Mole Office answered 200. Nothing in the write path asked who wrote it. GET /api/kinds had said
 *    since the kind was declared that `body` is "WHAT THE PERSON WROTE, KEPT EXACTLY", and
 *    qualified it with "the writer may change it" — a word no code enforced.
 *
 * 2. A COMMENT STAYS `queued` AFTER A REVIEW HAS FROZEN IT. Freezing writes down which comments
 *    were in the review and does not touch them, which is right. But a frozen review stores IDS and
 *    re-reads the words on every request, so what a finished review contained could be changed
 *    after it finished. The same measurement: after the rewrite above, GET /api/reviews/<id> served
 *    the agent's sentence as the person's.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE FROZEN HALF IS TESTED THROUGH THE REAL ROUTE
 * ---------------------------------------------------------------------------------------
 *
 * `reviews.frozen` holds the membership as JSON, and lib/reviews.ts parses it. The gate in
 * lib/records.ts is a SECOND reader of that stored shape — one fact read in two places, free to
 * disagree, which is the defect CLAUDE.md names as this repository's own. Of the three fixes it
 * allows, this file is the third: the review here is frozen by POST /api/reviews/:id/finish-collecting
 * and never by writing a row by hand, so a change to what freezing stores makes this test go red
 * instead of leaving the gate quietly finding nothing.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const WHO_WROTE_IT = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
const AN_AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-workspace': WORKSPACE }
const SOMEBODY_ELSE = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': 'sam', 'x-mole-office-workspace': WORKSPACE }

const THE_WORDS = 'This 37% does not match the run log. Which of the two was measured?'

let t: TestDb
let app: FastifyInstance

/**
 * ONE OFFICE FOR THE FILE. Each case files its own report, comments and review, and every reading it
 * takes names one of its own records, so no case reads another's work.
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

async function aReport(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: WHO_WROTE_IT,
    payload: {
      kind: 'report',
      title: 'What the gripper did on Tuesday',
      data: {
        for: THE_TEST_OFFICES_OWNER.name,
        date: '2026-08-18',
        blocks: [{ id: 'b-prose', type: 'text', text: 'It let go of the part on 37% of runs.' }],
      },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** A comment on the whole report, written by whoever the headers say. */
async function aComment(reportId: string, headers: Record<string, string> = WHO_WROTE_IT): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: {
      kind: 'annotation',
      title: 'On the gripper number',
      data: {
        body: THE_WORDS,
        context: { target: { kind: 'record', recordId: reportId, workspaceId: WORKSPACE } },
      },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function patch(
  id: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ status: number; error: string }> {
  const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload })
  return { status: res.statusCode, error: (res.json() as { error?: string }).error ?? '' }
}

async function wordsNow(id: string): Promise<unknown> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: WHO_WROTE_IT })
  return (res.json() as { record: { data: Record<string, unknown> } }).record.data['body']
}

/**
 * Start a review here, write the comments it is to hold while it collects, then finish collecting,
 * all through the routes a person uses. Answers the review's id and what `whileCollecting` answered.
 *
 * THE COMMENTS ARE WRITTEN AFTER THE REVIEW STARTS, AND THAT ORDER IS WHAT MAKES THEM MEMBERS. A review
 * takes only comments written from the second it started (`membersOf` in src/server/lib/reviews.ts
 * keeps `record.createdAt >= review.started`), and both stamps count whole seconds. This helper used
 * to be called after the comment was written. That worked only while the two writes fell in the same
 * second. On 1 October 2026 a second ended between them in the merge queue (problem MbePd2RGUtIn):
 * the review left the comment out as written before it started, the frozen-review rule found no
 * review holding it, and the agent got the writer rule's 403 instead of the frozen review's 409.
 */
async function aFrozenReviewOn<T>(
  reportId: string,
  whileCollecting: () => Promise<T>,
): Promise<{ review: string; written: T }> {
  const started = await app.inject({
    method: 'POST',
    url: '/api/reviews',
    headers: WHO_WROTE_IT,
    payload: { entry: { target: { kind: 'record', recordId: reportId, workspaceId: WORKSPACE } } },
  })
  expect(started.statusCode, started.body).toBe(201)
  const id = (started.json() as { review: { id: string } }).review.id
  const written = await whileCollecting()
  const frozen = await app.inject({
    method: 'POST',
    url: `/api/reviews/${id}/finish-collecting`,
    headers: WHO_WROTE_IT,
    payload: {},
  })
  expect(frozen.statusCode, frozen.body).toBe(200)
  expect((frozen.json() as { review: { membershipFrozen: boolean } }).review.membershipFrozen).toBe(true)
  return { review: id, written }
}

// ============================================================ who may change somebody's words

describe('only the person who wrote a comment may change its words', () => {
  it('refuses an agent rewriting a comment a person wrote, and says who wrote it', async () => {
    const id = await aComment(await aReport())

    const rewrite = await patch(id, { dataPatch: { body: 'The calibration was fine.' } }, AN_AGENT)
    expect(rewrite.status, 'an agent replaced a person’s words').toBe(403)
    expect(rewrite.error).toContain(`human:${THE_TEST_OFFICES_OWNER.id} wrote this note`)
    expect(rewrite.error).toContain('agent:claude-code')
    expect(rewrite.error, 'the refusal does not say what to do instead').toContain('supersedes')
    expect(await wordsNow(id)).toBe(THE_WORDS)
  })

  it('refuses another person too, because it is about who wrote it and not about being an agent', async () => {
    const id = await aComment(await aReport())
    const rewrite = await patch(id, { dataPatch: { body: 'I think this is fine.' } }, SOMEBODY_ELSE)
    expect(rewrite.status).toBe(403)
    expect(await wordsNow(id)).toBe(THE_WORDS)
  })

  it('refuses deleting the words as well as replacing them', async () => {
    // `{"dataPatch":{"body":null}}` removes the key rather than setting it, so a rule that only
    // compared two present values walked straight past it. What is compared is the value that will
    // be STORED, and a key about to go missing differs from one that is there.
    const id = await aComment(await aReport())
    const erased = await patch(id, { dataPatch: { body: null } }, AN_AGENT)
    expect(erased.status, 'an agent deleted a person’s words').toBe(403)
    expect(await wordsNow(id)).toBe(THE_WORDS)
  })

  it('refuses re-aiming what somebody else’s comment points at', async () => {
    const report = await aReport()
    const other = await aReport()
    const id = await aComment(report)
    const moved = await patch(
      id,
      { dataPatch: { context: { target: { kind: 'record', recordId: other, workspaceId: WORKSPACE } } } },
      AN_AGENT,
    )
    expect(moved.status).toBe(403)
    expect(moved.error).toContain('what it points at')
  })

  it('lets the person who wrote it change their own words while nothing has been sent', async () => {
    const id = await aComment(await aReport())
    const mine = await patch(id, { dataPatch: { body: 'Second thought, which is what I mean.' } }, WHO_WROTE_IT)
    expect(mine.status, mine.error).toBe(200)
    expect(await wordsNow(id)).toBe('Second thought, which is what I mean.')
  })

  it('lets an agent write its own comment and change it, because it wrote it', async () => {
    const id = await aComment(await aReport(), AN_AGENT)
    const its = await patch(id, { dataPatch: { body: 'Second try.' } }, AN_AGENT)
    expect(its.status, its.error).toBe(200)
    const hers = await patch(id, { dataPatch: { body: 'No, mine.' } }, WHO_WROTE_IT)
    expect(hers.status, 'a person rewrote an agent’s comment').toBe(403)
  })

  it('leaves everything else about somebody’s comment open to anybody', async () => {
    // THE RULE IS TWO FIELDS OF ONE KIND AND IT IS NOT A PERMISSION SYSTEM. Storing a reading
    // beside the words and retitling the comment are what is supposed to happen to somebody's
    // comment while it travels, and neither puts words in their mouth. It used to mark the comment
    // sent as well, by writing `data.state`; window B took that field off the kind, and where a
    // comment has got to is worked out from the messages that carried its words.
    const id = await aComment(await aReport())
    expect(
      (await patch(id, { dataPatch: { interpretation: 'Reads as a question about two numbers.' } }, AN_AGENT)).status,
    ).toBe(200)
    expect((await patch(id, { title: 'Which of the two?' }, AN_AGENT)).status).toBe(200)
    expect(await wordsNow(id)).toBe(THE_WORDS)
  })
})

// ============================================================ what freezing a review protects

describe('a review that has finished collecting says what it said', () => {
  it('refuses the person who wrote the comment, once a review has written it down', async () => {
    const report = await aReport()
    const { review, written: id } = await aFrozenReviewOn(report, () => aComment(report))

    // NOTHING HAS BEEN SAID TO ANYBODY, which is the whole reason this hole existed: the comment is
    // still a draft by every reading of it, and freezing the review is what fixes its words. It used
    // to be checked by reading `data.state` and finding `queued`; window B took that field off the
    // annotation kind, so what is asserted is the fact rather than the word — no message carries
    // these words, so nothing has gone out.
    const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: WHO_WROTE_IT })
    expect((read.json() as { record: { data: Record<string, unknown> } }).record.data['state']).toBeUndefined()
    const carried = t.client.sqlite
      .prepare('SELECT count(*) AS n FROM agent_messages WHERE from_annotation_id = ?')
      .get(id) as { n: number }
    expect(carried.n, 'a message carries this comment, so it is not the case this test is about').toBe(0)

    const mine = await patch(id, { dataPatch: { body: 'Actually, never mind.' } }, WHO_WROTE_IT)
    expect(mine.status, 'a frozen review’s contents were changed after it froze').toBe(409)
    expect(mine.error).toContain(review)
    expect(mine.error).toContain('finished collecting')
    expect(mine.error).toContain('supersedes')
    expect(await wordsNow(id)).toBe(THE_WORDS)
  })

  it('serves the words the review contained, whoever asks afterwards', async () => {
    const report = await aReport()
    const { review, written: id } = await aFrozenReviewOn(report, () => aComment(report))

    expect((await patch(id, { dataPatch: { body: 'AGENT WORDS' } }, AN_AGENT)).status).toBe(409)

    const held = await app.inject({ method: 'GET', url: `/api/reviews/${review}`, headers: WHO_WROTE_IT })
    const members = (held.json() as { members: { id: string; body: string }[] }).members
    expect(members.map((one) => one.id)).toContain(id)
    expect(members.find((one) => one.id === id)?.body).toBe(THE_WORDS)
  })

  it('still lets a frozen review’s comment be given a reading', async () => {
    // IT USED TO SAY "marked sent AND given a reading", by writing `data.state`. Window B took that
    // field off the kind; the half that remains is the half that was ever a fact about the record.
    const report = await aReport()
    const { written: id } = await aFrozenReviewOn(report, () => aComment(report))
    expect(
      (await patch(id, { dataPatch: { interpretation: 'Reads as a question.' } }, WHO_WROTE_IT)).status,
    ).toBe(200)
  })

  it('leaves a comment no frozen review holds free for its writer to change', async () => {
    // The rule is about membership and not about there being a frozen review somewhere. A comment
    // written on something else is nobody's business but its writer's.
    const inIt = await aReport()
    const elsewhere = await aReport()
    // Written while the review collects, so that being on another report is the one reason it is not
    // in the review. Written before the review started, it would also be left out as too early.
    const { written: outside } = await aFrozenReviewOn(inIt, () => aComment(elsewhere))
    const mine = await patch(outside, { dataPatch: { body: 'Second thought.' } }, WHO_WROTE_IT)
    expect(mine.status, mine.error).toBe(200)
  })

  it('leaves a comment free while the review holding it is still collecting', async () => {
    const report = await aReport()
    const id = await aComment(report)
    const started = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: WHO_WROTE_IT,
      payload: { entry: { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } } },
    })
    expect(started.statusCode, started.body).toBe(201)
    const mine = await patch(id, { dataPatch: { body: 'Second thought.' } }, WHO_WROTE_IT)
    expect(mine.status, mine.error).toBe(200)
  })
})
