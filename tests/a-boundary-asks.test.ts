// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BOUNDARY ASKS, ONCE, AT THE MOMENT OF THE ACT — AND NOTHING ELSE EVER ASKS.
 *
 * The owner: *"Do not annoy users with daily: you have 12 Placeholders. Prefer reminders at
 * meaningful semantic boundaries."* So there is no scanner, no scheduler, no daily job, and nothing
 * on any page at rest says how many placeholders exist. The route that performs the act calls one
 * reader after the write succeeds and puts the answer in its reply.
 *
 * ---------------------------------------------------------------------------------------
 * IT DRIVES TRANSITIONS AND NOT ROUTES
 * ---------------------------------------------------------------------------------------
 *
 * `task.complete` and `result.promote` ARE THE SAME ROUTE and the same operation. A test written
 * over routes would prove one of them and report two. What separates them is the transition — a
 * work record reaching `done`, against a claim reaching `measured` — so every row below drives its
 * own transition and asserts `restrictions.boundary` names the right one of the six.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO THAT CANNOT BE DRIVEN ARE NAMED RATHER THAN SKIPPED
 * ---------------------------------------------------------------------------------------
 *
 * `review.close` and `domain.accept` carry `operation: null`, because their routes are other
 * threads' and do not exist. Iterating over a row that cannot be exercised would report a pass for
 * a boundary nothing asks at. They are listed by name below, and the day one of them gains an
 * operation this file goes red and says a row is owed.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { BOUNDARY_ACTS } from '../src/shared/restriction.ts'
import { OPERATIONS } from '../src/shared/ops.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: PERSON })
  return { status: res.statusCode, body: res.json() }
}

async function patch(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'PATCH', url, payload: payload as object, headers: PERSON })
  return { status: res.statusCode, body: res.json() }
}

async function record(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await post('/api/records', { kind, title, data })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

/** One `stops_final` restriction, declared about whatever record is named. */
async function restrict(about: string, title = 'The intrinsics are not calibrated'): Promise<string> {
  const p = await record('placeholder', title, {
    what: 'The wrist camera intrinsics have never been calibrated.',
    slot: 'stand_in',
    substitute: 'fx = 600',
    resolved_when: 'A checkerboard calibration run.',
    allowed_uses: ['pipeline plumbing'],
    disallowed_claims: ['geometric accuracy claims'],
    severity: 'stops_final',
  })
  expect((await post('/api/links', { fromId: p, toId: about, type: 'about' })).status).toBe(201)
  return p
}

describe('the four boundaries that have routes today', () => {
  it('task.complete — a work record reaching done says what is restricted, and names itself', async () => {
    const task = await record('task', 'Wire the segmentation step', { state: 'doing' })
    await restrict(task)
    const done = await patch(`/api/records/${task}`, { dataPatch: { state: 'done' } })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body.restrictions.boundary).toBe('task.complete')
    expect(done.body.restrictions.counts.stopsFinal).toBe(1)
  })

  it('result.promote — a claim reaching measured is a DIFFERENT boundary through the same route', async () => {
    const claim = await record('claim', 'Reach error under 2 mm', { state: 'proposed' })
    await restrict(claim)
    const measured = await patch(`/api/records/${claim}`, { dataPatch: { state: 'measured' } })
    expect(measured.status, JSON.stringify(measured.body)).toBe(200)
    // THE ROUTE IS NOT THE BOUNDARY. Same URL, same operation, different act.
    expect(measured.body.restrictions.boundary).toBe('result.promote')
    expect(measured.body.restrictions.counts.stopsFinal).toBe(1)
  })

  it('pipeline.complete — the LAST unfinished block reaching done, with the pipeline as the scope', async () => {
    const pipeline = await record('pipeline', 'Perception', {})
    const one = await post(`/api/records/${pipeline}/blocks`, { name: 'Segment', state: 'doing' })
    const two = await post(`/api/records/${pipeline}/blocks`, { name: 'Project', state: 'doing' })
    await restrict(one.body.record.id)

    // The first block finishing does NOT cross the boundary: something is still unfinished.
    const first = await patch(`/api/records/${pipeline}/blocks/${one.body.record.id}`, { state: 'done' })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body.restrictions).toBeUndefined()

    const last = await patch(`/api/records/${pipeline}/blocks/${two.body.record.id}`, { state: 'done' })
    expect(last.status, JSON.stringify(last.body)).toBe(200)
    expect(last.body.restrictions.boundary).toBe('pipeline.complete')
    // THE SCOPE IS THE PIPELINE, not the step that happened to finish it.
    expect(last.body.restrictions.scope.id).toBe(pipeline)
    expect(last.body.restrictions.counts.stopsFinal).toBe(1)
  })

  it('decision.commit — settling a fork, with the proposal as the scope', async () => {
    const fork = await record('proposal', 'Which detector', {
      question: 'Which detector architecture do we build on?',
      options: ['two-stage', 'single-shot'],
    })
    await restrict(fork)
    const settled = await post(`/api/records/${fork}/promote`, {
      title: 'We build on the two-stage detector',
      data: { because: 'It is the one the trials ran on.' },
    })
    expect(settled.status, JSON.stringify(settled.body)).toBe(201)
    expect(settled.body.restrictions.boundary).toBe('decision.commit')
    expect(settled.body.restrictions.scope.id).toBe(fork)
  })
})

describe('a reminder that fires every time is not a reminder', () => {
  it('says nothing at all when nothing is restricted', async () => {
    const task = await record('task', 'An ordinary task', { state: 'doing' })
    const done = await patch(`/api/records/${task}`, { dataPatch: { state: 'done' } })
    expect(done.status).toBe(200)
    // ABSENT, not present and zero. The ordinary act is unchanged.
    expect(done.body.restrictions).toBeUndefined()
  })

  it('says nothing when the only restriction in scope is harmless', async () => {
    const task = await record('task', 'An ordinary task', { state: 'doing' })
    const harmless = await record('placeholder', 'A slot nothing rests on', {
      what: 'Nobody has picked the log format.',
      slot: 'empty',
      resolved_when: 'Somebody picks one.',
      allowed_uses: [],
      disallowed_claims: [],
      severity: 'harmless',
    })
    expect((await post('/api/links', { fromId: harmless, toId: task, type: 'about' })).status).toBe(201)
    const done = await patch(`/api/records/${task}`, { dataPatch: { state: 'done' } })
    // Two harmless placeholders must not make a line read "5 active placeholders" beside "1
    // prevents final validation". A reader who learns the number is mostly noise stops reading it.
    expect(done.body.restrictions).toBeUndefined()
  })

  it('says nothing when the state did not move', async () => {
    const task = await record('task', 'A task that is already done', { state: 'done' })
    await restrict(task)
    const again = await patch(`/api/records/${task}`, { dataPatch: { state: 'done' } })
    expect(again.status).toBe(200)
    expect(again.body.restrictions).toBeUndefined()
  })

  it('refuses nothing — the act always succeeds', async () => {
    const claim = await record('claim', 'Reach error under 2 mm', { state: 'proposed' })
    await restrict(claim)
    const measured = await patch(`/api/records/${claim}`, { dataPatch: { state: 'measured' } })
    // Mole Office does not refuse to promote a result because a placeholder is active; deciding that
    // would be Mole Office judging the work.
    expect(measured.status).toBe(200)
    expect(measured.body.record.data.state).toBe('measured')
  })
})

describe('the owner’s own three lines, built from the counts', () => {
  /**
   * The owner's format, exactly:
   *
   *     Complete Pipeline
   *     3 active Placeholders
   *     1 prevents final performance validation
   *
   * NOTHING DRAWS THIS YET — step 10 was not built — so this is the sentence a browser would draw,
   * exercised here rather than left as an untested string. The `harmless` count is never on the
   * line, because a reader who learns the number is mostly noise stops reading the number.
   */
  it('never puts the harmless count on the line', async () => {
    // DYNAMICALLY IMPORTED, like every other server module in these tests: a value import at the
    // top of the file would open a database before `freshDb` had said which one.
    const { boundarySentence } = await import('../src/server/lib/boundaries.ts')
    const line = boundarySentence({
      boundary: 'pipeline.complete',
      scope: { id: 'p1', kind: 'pipeline', title: 'Perception' },
      counts: { active: 3, unchecked: 0, stopsFinal: 1, harmless: 9 },
      found: [],
      skippedDeleted: 0,
      couldNotCheck: [],
    })
    expect(line).toContain('3 active restrictions in Perception')
    expect(line).toContain('1 stops this being called final')
    expect(line).not.toContain('9')
    expect(line).not.toContain('harmless')
  })

  it('adds the resolved-and-not-re-checked line only when there is one', async () => {
    const { boundarySentence } = await import('../src/server/lib/boundaries.ts')
    const base = { boundary: 'task.complete', scope: { id: 'r', kind: 'task', title: 'A task' }, found: [], skippedDeleted: 0, couldNotCheck: [] }
    expect(boundarySentence({ ...base, counts: { active: 1, unchecked: 0, stopsFinal: 0, harmless: 0 } })).not.toContain(
      're-checked',
    )
    expect(boundarySentence({ ...base, counts: { active: 1, unchecked: 2, stopsFinal: 0, harmless: 0 } })).toContain(
      '2 resolved and not re-checked',
    )
  })
})

describe('the list of boundaries is bound in both directions', () => {
  it('gives every non-null operation a name the vocabulary really declares', () => {
    const live = new Set(OPERATIONS.map((o) => o.name as string))
    for (const act of BOUNDARY_ACTS) {
      if (act.operation === null) continue
      expect(live, `${act.name} points at an operation nothing declares`).toContain(act.operation)
    }
  })

  it('names the two that cannot be driven, rather than iterating over rows it cannot exercise', () => {
    const notDrivable = BOUNDARY_ACTS.filter((act) => act.operation === null).map((act) => act.name)
    // Their routes are other threads'. Two invented operation names here would have failed the
    // binding assertion above on day one, so `null` is the honest value. The day one of them gains
    // an operation, this goes red and a row above is owed.
    expect(notDrivable.sort()).toEqual(['domain.accept', 'review.close'])
  })

  it('has a transition written out for every one, because the route is not the boundary', () => {
    for (const act of BOUNDARY_ACTS) {
      expect(act.transition.length, `${act.name} does not say what its transition is`).toBeGreaterThan(10)
    }
    // The two that share a route differ in exactly that field, which is the whole point of it.
    const sharing = BOUNDARY_ACTS.filter((a) => a.operation === 'record.change')
    expect(sharing.map((a) => a.name).sort()).toEqual(['result.promote', 'task.complete'])
    expect(sharing[0]!.transition).not.toBe(sharing[1]!.transition)
  })
})
