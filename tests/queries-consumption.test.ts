// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * What `GET /api/queries/unconsumed` MEANS, tested as the sentence a reader is given.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The endpoint was published as "results nothing is using". It computes something narrower: every
 * live claim, module and idea that no `consumes` link points at. Those are not the same claim, and
 * the gap between them is not academic — it was hit by two separate agents during the dogfood, each
 * of whom found a claim they had `measures`-linked sitting on a list telling them nobody was using
 * it. Measuring a result is arguably the strongest form of using one.
 *
 * DECISION 7 KEPT THE QUERY AND MOVED THE WORDS. `measures` does NOT satisfy `consumes`, because the
 * two say different things: `consumes` says downstream work DEPENDS on this result and is wrong if
 * the result is retracted, and `measures` says one thing EVALUATED another, which is how you found
 * out rather than something built on top. Folding them together would have changed what this list
 * and `unmet` both mean with neither of them saying so.
 *
 * So the tests here are about MEANING and not about a status code:
 *
 *   1. A result somebody measured is still on the list — which is the whole reason the old wording
 *      was false, expressed as behaviour rather than as a string comparison.
 *   2. A `consumes` link, and only a `consumes` link, takes it off.
 *   3. The list is what the route says it is: no live claim, module or idea with nothing consuming
 *      it is missing from it, and nothing else is on it.
 *
 * THE PUBLISHED SENTENCE IS TESTED HERE NOW, and the reason it was not is worth keeping. This file
 * used to say the sentence "lives in ROUTE_NOTES in src/server/api/kinds.ts, which this change does
 * not own… the reworded sentence is in the reply that came with this work for whoever places it".
 * Nobody placed it. The rule shipped, the words did not move, and for a whole pass `GET /api`
 * described this route as "results nothing is using" — the exact clause the decision was about —
 * with every test green, because no test could fail on a sentence nobody owned.
 *
 * A handoff in a comment is not a mechanism. The assertions at the foot of this file are.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { CONSUMPTION_LINK, type PanelRecord } from '@shared/types.ts'

/**
 * ONE OFFICE FOR THE FILE, A PROJECT FOR EACH CASE. The list the route answers is about one
 * project, so each case gets a project of its own and the list holds only that case's records.
 */
let WORKSPACE = 'default'
let caseNumber = 0

let t: TestDb
let app: FastifyInstance
let createWorkspace: typeof import('../src/server/lib/workspaces.ts')['createWorkspace']

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  createWorkspace = (await import('../src/server/lib/workspaces.ts')).createWorkspace
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  createWorkspace({ id: WORKSPACE, title: 'A case of its own' })
})

/** The titles the endpoint answers with, so an assertion reads like the screen does. */
async function unconsumedTitles(): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/api/queries/unconsumed', headers: { 'x-mole-office-workspace': WORKSPACE } })
  expect(res.statusCode, res.body).toBe(200)
  const body = JSON.parse(res.body) as { records: PanelRecord[] }
  return body.records.map((r) => r.title).sort()
}

const make = (kind: PanelRecord['kind'], title: string, data: Record<string, unknown> = {}) =>
  t.api.createRecord({ workspaceId: WORKSPACE, kind, title, data, actor: t.api.HUMAN })

describe('a result somebody measured is still a result nothing has been recorded as depending on', () => {
  it('keeps a claim on the list when the only link to it is `measures`', () => {
    // THE MEASURED COMPLAINT, REPRODUCED. Two agents filed a claim, linked the run that measured it,
    // and were told by this list that nobody was using their claim. Somebody was: they were.
    const claim = make('claim', 'Zero-velocity beats every learned predictor past 200 ms', {
      state: 'measured',
      evidence: ['240 replays, 33 mm at 200 ms'],
    })
    const session = make('session', 'the run that measured it', { state: 'finished' })
    t.api.createLink({ fromId: session.id, toId: claim.id, type: 'measures', actor: t.api.HUMAN })

    return unconsumedTitles().then((titles) => {
      expect(titles).toContain('Zero-velocity beats every learned predictor past 200 ms')
    })
  })

  it('takes it off the list the moment work says it DEPENDS on the result', () => {
    // The distinction, from the other side. The same claim, one link different, and the answer
    // flips — because this link is the one that says something breaks if the claim is retracted.
    const claim = make('claim', 'Zero-velocity beats every learned predictor past 200 ms', {
      state: 'measured',
      evidence: ['240 replays, 33 mm at 200 ms'],
    })
    const module = make('module', 'Handover timing', { context: 'when to close the gripper', parts: [] })
    t.api.createLink({ fromId: module.id, toId: claim.id, type: CONSUMPTION_LINK, actor: t.api.HUMAN })

    return unconsumedTitles().then((titles) => {
      expect(titles).not.toContain('Zero-velocity beats every learned predictor past 200 ms')
    })
  })

  it('is not moved by any of the other ways two records can be joined', () => {
    // `consumes` and nothing else. If a future change widened this rule, every one of these would
    // start taking results off the list, and the list would quietly become a different list.
    const others = ['relates_to', 'measures', 'about', 'discusses', 'produces', 'contradicts', 'derived_from'] as const
    for (const type of others) {
      const claim = make('claim', `a finding joined by ${type}`, { state: 'proposed' })
      const other = make('note', `a note joined by ${type}`, { body: 'something' })
      t.api.createLink({ fromId: other.id, toId: claim.id, type, actor: t.api.HUMAN })
    }
    return unconsumedTitles().then((titles) => {
      for (const type of others) {
        expect(titles, `a ${type} link took a result off the list`).toContain(`a finding joined by ${type}`)
      }
    })
  })
})

describe('the list is exactly what the route says it is', () => {
  it('is every live claim, module and idea that no `consumes` link points at, and nothing else', () => {
    // The route's own sentence, checked against the link graph rather than against a count. A record
    // is on this list if and only if it is a live result with no incoming consumption — which is a
    // fact a reader can verify, unlike "nobody is using it".
    const consumed = make('claim', 'a claim something depends on', { state: 'measured', evidence: ['x'] })
    const measured = make('claim', 'a claim something merely measured', { state: 'measured', evidence: ['x'] })
    const alone = make('idea', 'an idea nothing has taken up', { state: 'new' })
    const gone = make('module', 'a module nothing consumes, deleted', { context: 'c', parts: [] })
    const consumer = make('task', 'the work that depends on it', { state: 'doing' })
    const measurer = make('session', 'the run that measured it', { state: 'finished' })
    const problem = make('problem', 'a problem, which is not a result', { state: 'open' })

    t.api.createLink({ fromId: consumer.id, toId: consumed.id, type: CONSUMPTION_LINK, actor: t.api.HUMAN })
    t.api.createLink({ fromId: measurer.id, toId: measured.id, type: 'measures', actor: t.api.HUMAN })
    t.api.deleteRecord(gone.id, t.api.HUMAN)

    return unconsumedTitles().then((titles) => {
      expect(titles).toEqual(
        [
          'a claim something merely measured',
          'an idea nothing has taken up',
          // `consumer` is a task, `measurer` a session and `problem` a problem: none of the three is
          // a result, so none of them is a candidate for this list however it is linked.
        ].sort(),
      )
      expect(titles).not.toContain('a claim something depends on')
      expect(titles).not.toContain('a module nothing consumes, deleted')
      expect(titles).not.toContain(problem.title)
    })
  })

  it('says nothing about whether anybody has read a result, only about what is recorded', () => {
    // WHY THE WORDING HAD TO CHANGE, STATED AS THE PROPERTY IT RESTS ON. This endpoint reads links.
    // It cannot see who opened a record, who quoted it in a meeting, or who measured it and wrote
    // that down as a `measures` link. A brand new claim that nobody has had time to build on is on
    // this list, and that is the honest state of a new finding rather than a complaint about it.
    const fresh = make('claim', 'a finding filed one minute ago', { state: 'proposed' })
    return unconsumedTitles().then((titles) => {
      expect(titles).toContain(fresh.title)
    })
  })
})

// ============================================================ the words a reader is given

/**
 * The sentence has to describe the query that ran.
 *
 * This is the other half of decision 7. The rule — `measures` does not satisfy `consumes` — is
 * pinned by every test above. What a READER is told the list is comes from `ROUTE_NOTES`, served
 * through `GET /api`, and it is the half that can be wrong while the code is right.
 */
describe('what GET /api says this query is', () => {
  /** The published line for one endpoint, read from the served bytes. */
  async function published(): Promise<string> {
    const res = await app.inject({ method: 'GET', url: '/api' })
    expect(res.statusCode).toBe(200)
    const listed = (res.json() as { endpoints: Array<{ method: string; path: string; description: string | null }> })
      .endpoints.find((e) => e.method === 'GET' && e.path === '/api/queries/unconsumed')
    if (listed === undefined) throw new Error('GET /api does not list GET /api/queries/unconsumed at all')
    if (listed.description === null) throw new Error('GET /api lists it with no description')
    return listed.description
  }

  it('does not claim to know what anybody is using', async () => {
    // The old words. What a person is using is not in this database and no query can compute it;
    // what IS in the database is whether a `consumes` link was recorded.
    expect((await published()).toLowerCase()).not.toContain('nothing is using')
  })

  it('names the one link type it counts, and says a `measures` link is not one', async () => {
    const note = await published()
    expect(note).toContain(CONSUMPTION_LINK)
    // The distinction the whole decision turns on, in the published words and not only in a header.
    expect(note).toContain('measures')
  })

  it('says being on the list is not a complaint, because that is what a reader assumes', async () => {
    expect((await published()).toLowerCase()).toContain('not a complaint')
  })
})
