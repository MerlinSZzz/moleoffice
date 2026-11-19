// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CARD ON THE DECISIONS PAGE READS THE EARLIER DECISIONS A PRESS ON THE FORK MAY REPLACE.
 *
 * The owner, on a beta.6 tester's Mac, pressed an option on a fork on the Decisions page and got the Chinese refusal
 * for "earlier decisions with candidates": the page offered no earlier decision to choose, because nothing had told it
 * which ones there were. This is the server's half. An open fork's own record read answers `replacesCandidates`, each
 * one with its id, its title and the record it shares with the fork, read by the same `candidatesOnTheSameSubjects`
 * that the promote door refuses with, so the card and the refusal cannot disagree.
 *
 * WHAT THIS FILE PROVES, against a real Fastify app over a database of its own:
 *   1. an open fork with one earlier decision linked `about` it answers that decision's id, its title, and
 *      `sharedSubject` = the fork's id;
 *   2. an open fork with no earlier decision answers an empty list;
 *   3. a settled fork's reply does not carry the field at all;
 *   4. the promote door, asked with `data` that has no `replaces`, refuses with
 *      `decisionReplacesUnsaidWithCandidates` and its English names the same candidate the card read.
 *
 * THE READING IT FAILED AGAINST FIRST: the open fork's reply carried `decisionsThatNameIt` and nothing else, so case 1
 * read `undefined` where the page needed the candidate list. The refusal already named that candidate, so the office
 * knew it and the page could not be told.
 *
 * THE VALUES THAT CAN CHANGE ARE READ FROM THE CODE: the kind names, the `replaces` field and the refusal code. The
 * status numbers are HTTP's own and this repository declares no constant for them.
 *
 * Everybody and everything here is made up.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ACandidate } from '../src/server/lib/replaced-decisions.ts'
import { DECISION_REPLACES_UNSAID_WITH_CANDIDATES } from '../src/shared/refusal-codes.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

const EARLIER_TITLE = 'Test: the spring batch takes the celadon'

interface Harness {
  db: TestDb
  app: FastifyInstance
  /** `proposal`, read from the code rather than typed again. */
  proposalKind: string
  /** `decision`, read from the code rather than typed again. */
  decisionKind: string
  /** `replaces`, read from the code rather than typed again. */
  replacesField: string
  /** The reply field this test reads, read from the declaration rather than typed again. */
  replacesCandidatesField: string
}

/** A throwaway database with the real record and link routes registered over it. */
async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { linkRoutes } = await import('../src/server/api/links.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  // A SLOW, DATABASE-OPENING MODULE, imported after freshDb() has named the throwaway file. A normal
  // top-of-file import of lib/records.ts would open the operator's database before the case runs.
  const { DECISION_KIND, PROPOSAL_KIND, REPLACES_CANDIDATES_FIELD } = await import('../src/server/lib/records.ts')
  const { REPLACES_FIELD } = await import('../src/server/lib/replaced-decisions.ts')

  const app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(linkRoutes, { prefix: '/api' })
  await app.ready()
  return {
    db,
    app,
    proposalKind: PROPOSAL_KIND,
    decisionKind: DECISION_KIND,
    replacesField: REPLACES_FIELD,
    replacesCandidatesField: REPLACES_CANDIDATES_FIELD,
  }
}

const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-test',
}
const AS_HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

function bodyOf(res: { body: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 200)}`)
  }
  return parsed as Record<string, unknown>
}

function recordOf(res: { body: string }): Record<string, unknown> {
  const record = bodyOf(res)['record']
  if (typeof record !== 'object' || record === null) {
    throw new Error(`expected a record, got ${res.body.slice(0, 200)}`)
  }
  return record as Record<string, unknown>
}

/** What the card would read from the fork's own record read, or undefined when the field is absent. */
function candidatesOf(res: { body: string }): ACandidate[] | undefined {
  return bodyOf(res)[h.replacesCandidatesField] as ACandidate[] | undefined
}

let h: Harness

beforeEach(async () => {
  h = await freshApp()
})
afterEach(async () => {
  await h.app.close()
  h.db.close()
})

/** A fork an agent filed: a real question, two defensible answers, the reasoning. */
async function fileFork(title = 'Which glaze goes on the spring batch?'): Promise<string> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_AGENT,
    payload: {
      kind: h.proposalKind,
      title,
      data: {
        question: 'Which glaze goes on the spring batch?',
        options: ['The celadon', 'The tenmoku'],
        because: 'The kiln is booked for Friday.',
      },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return String(recordOf(res)['id'])
}

/** An earlier decision the person made, linked `about` the fork as a decision about it would be. */
async function anEarlierDecisionAbout(forkId: string, title = EARLIER_TITLE): Promise<string> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_HUMAN,
    payload: {
      kind: h.decisionKind,
      title,
      data: { option_taken: 'The celadon.', because: 'The bench agreed on 3 October.', [h.replacesField]: [] },
      links: [{ type: 'about', toId: forkId }],
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return String(recordOf(res)['id'])
}

/** The promote door's press, with `data` that says nothing about what the decision replaces. */
function pressTheFork(forkId: string, title = 'The spring batch takes the tenmoku') {
  return h.app.inject({
    method: 'POST',
    url: `/api/records/${forkId}/promote`,
    headers: AS_HUMAN,
    payload: { title, data: { because: 'The bench changed its mind.' } },
  })
}

describe("the open fork's record read names the decisions a press may replace", () => {
  it('names the earlier decision linked about the fork, with the fork as the record they share', async () => {
    const forkId = await fileFork()
    const earlierId = await anEarlierDecisionAbout(forkId)

    const page = await h.app.inject({ method: 'GET', url: `/api/records/${forkId}` })
    expect(page.statusCode, page.body).toBe(200)
    expect(candidatesOf(page)).toEqual([{ id: earlierId, title: EARLIER_TITLE, sharedSubject: forkId }])
  })

  it('answers an empty list when no earlier decision shares a subject with the fork', async () => {
    const forkId = await fileFork()

    const page = await h.app.inject({ method: 'GET', url: `/api/records/${forkId}` })
    expect(page.statusCode, page.body).toBe(200)
    expect(candidatesOf(page)).toEqual([])
  })

  it("does not carry the field at all on a settled fork's reply", async () => {
    const forkId = await fileFork()
    const promoted = await h.app.inject({
      method: 'POST',
      url: `/api/records/${forkId}/promote`,
      headers: AS_HUMAN,
      payload: {
        title: 'The spring batch takes the celadon',
        data: { because: 'The bench agreed on 3 October.', [h.replacesField]: [] },
      },
    })
    expect(promoted.statusCode, promoted.body).toBe(201)

    const page = await h.app.inject({ method: 'GET', url: `/api/records/${forkId}` })
    expect(page.statusCode, page.body).toBe(200)
    expect(bodyOf(page)['resolution']).toMatchObject({ resolved: true })
    expect(bodyOf(page)).not.toHaveProperty(h.replacesCandidatesField)
  })
})

describe('the card and the promote door read one list', () => {
  it('refuses an unsaid replaces, and its English names the candidate the card read', async () => {
    const forkId = await fileFork()
    const earlierId = await anEarlierDecisionAbout(forkId)

    const page = await h.app.inject({ method: 'GET', url: `/api/records/${forkId}` })
    expect(page.statusCode, page.body).toBe(200)
    const candidates = candidatesOf(page)
    expect(candidates).toEqual([{ id: earlierId, title: EARLIER_TITLE, sharedSubject: forkId }])

    const refused = await pressTheFork(forkId)
    expect(refused.statusCode, refused.body).toBe(400)
    const refusal = bodyOf(refused)
    expect(refusal['code']).toBe(DECISION_REPLACES_UNSAID_WITH_CANDIDATES)
    for (const candidate of candidates ?? []) expect(String(refusal['error'])).toContain(candidate.id)

    // NOTHING WAS WRITTEN, and the fork is still the open one the card read.
    const after = await h.app.inject({ method: 'GET', url: `/api/records/${forkId}` })
    expect(bodyOf(after)['resolution']).toMatchObject({ resolved: false })
  })
})
