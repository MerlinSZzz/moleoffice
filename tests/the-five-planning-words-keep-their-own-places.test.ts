// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FIVE PLANNING WORDS KEEP THEIR OWN PLACES IN THE RECORDS.
 *
 * A trajectory is the intended evolution. A plan is the work chosen to get there. A schedule puts
 * that work in time. A checkpoint observes progress and picks what happens next. A revision is what
 * became true. The office stores each of the five somewhere of its own:
 *
 *   trajectory  the `trajectory` record kind, whose `plannedStateIds` field is the intended states;
 *   plan        the `plans` table and the `plan_lines` table, which no record kind declares;
 *   schedule    the `allocations` and `work_windows` tables, which no record kind declares;
 *   checkpoint  the `stopping_point` record kind, whose `doing` and `next` fields are the stop;
 *   revision    the `revisions` table, whose `record_id`, `seq` and `op` are a record's history.
 *
 * THE BEHAVIOUR HALF USES THEM. One scratch office, one project, every write through the real doors,
 * read through GET /api/project-graph, the one read that returns all five together: a future carries
 * planned states, a plan carries lines, an allocation carries period and hours, a checkpoint carries
 * doing and next, and a revision carries seq and op. Each pair is one case that fails when the read
 * gives one word the other's source. The record door is also asked to refuse the four words that
 * are not kinds, and a field copied from the other kind. This claims only these two paths, not every
 * route.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ProjectGraphReply } from '../src/shared/project-graph.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/**
 * THE BEHAVIOUR HALF, on one scratch office and one project. Every value below is written through
 * the door that owns it and read through GET /api/project-graph, which is the one route that returns
 * all five together. The record door is also asked to refuse the four words that are not record
 * kinds, and a field copied from the other kind.
 */
let t: TestDb
let app: FastifyInstance
let workspace = ''
let today = ''
let moduleId = ''
let blockId = ''
let firstState = ''
let secondState = ''
let trajectoryId = ''
let stopId = ''
let planId = ''
let allocationId = ''
let reply: ProjectGraphReply

const PLAN_LINE = 'Made-up line that points at the block'
const FIRST_WHAT = 'Made-up: the gripper closes on a 40 mm part.'
const SECOND_WHAT = 'Made-up: the reach envelope is measured.'
const DOING = 'Made-up: wiring the second camera.'
const NEXT = 'Made-up: calibrate the second camera.'

const human = (): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': workspace,
})

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: human(), payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function link(fromId: string, toId: string, type: string): Promise<void> {
  const res = await app.inject({ method: 'POST', url: '/api/links', headers: human(), payload: { fromId, toId, type } })
  expect(res.statusCode, res.body).toBe(201)
}

async function graph(): Promise<ProjectGraphReply> {
  const res = await app.inject({ method: 'GET', url: '/api/project-graph', headers: human() })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as ProjectGraphReply
}

describe('the five planning words, used', () => {
  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    workspace = 'five-planning-words-used'
    const made = await app.inject({ method: 'POST', url: '/api/workspaces', headers: human(), payload: { id: workspace, title: 'Five planning words' } })
    expect(made.statusCode, made.body).toBe(201)
    const theDay = await app.inject({ method: 'GET', url: '/api/planning/today', headers: human() })
    expect(theDay.statusCode, theDay.body).toBe(200)
    today = (theDay.json() as { day: string }).day

    moduleId = await file('module', 'Made-up gripper module', { context: 'Made-up: the gripper has to hold a part.', parts: [] })
    const pipelineId = await file('pipeline', 'Made-up perception pipeline', { blockIds: [] })
    const block = await app.inject({ method: 'POST', url: `/api/records/${pipelineId}/blocks`, headers: human(), payload: { name: 'Made-up grasp', state: 'doing' } })
    expect(block.statusCode, block.body).toBe(201)
    blockId = (block.json() as { record: { id: string } }).record.id

    firstState = await file('planned_state', 'Made-up closed gripper', { what: FIRST_WHAT })
    secondState = await file('planned_state', 'Made-up measured reach', { what: SECOND_WHAT })
    trajectoryId = await file('trajectory', 'Made-up clamp, then reach', { plannedStateIds: [firstState, secondState], because: 'Made-up: the gripper has to be right first.' })
    await link(trajectoryId, moduleId, 'plans_for')

    stopId = await file('stopping_point', 'Made-up stop on the gripper', { doing: DOING, next: NEXT })
    await link(stopId, moduleId, 'about')

    const planned = await app.inject({ method: 'POST', url: '/api/plans', headers: human(), payload: { title: 'Made-up plan', body: PLAN_LINE } })
    expect(planned.statusCode, planned.body).toBe(201)
    const plan = planned.json() as { plan: { id: string }; lines: Array<{ id: string }> }
    planId = plan.plan.id
    const lineId = plan.lines[0]?.id ?? ''
    const pointed = await app.inject({ method: 'PATCH', url: `/api/plans/${planId}/lines/${lineId}`, headers: human(), payload: { recordId: blockId } })
    expect(pointed.statusCode, pointed.body).toBe(200)

    const allocation = await app.inject({ method: 'POST', url: '/api/planning/allocations', headers: human(), payload: { horizon: 'day', period: today, recordId: blockId, plannedHours: 2 } })
    expect(allocation.statusCode, allocation.body).toBe(201)
    allocationId = (allocation.json() as { allocation: { id: string } }).allocation.id

    const changed = await app.inject({ method: 'PATCH', url: `/api/records/${blockId}`, headers: human(), payload: { dataPatch: { measured: 'Made-up: the grasp was checked once.' } } })
    expect(changed.statusCode, changed.body).toBe(200)

    reply = await graph()
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    t?.close()
  })

  it('1. trajectory and plan are used apart: planned states against plan lines', () => {
    const future = reply.futures.find((one) => one.id === trajectoryId)
    expect(future?.kind).toBe('trajectory')
    expect(future?.states.map((one) => one.id)).toEqual([firstState, secondState])
    expect(future?.states.map((one) => one.what)).toEqual([FIRST_WHAT, SECOND_WHAT])
    const plan = reply.plans.find((one) => one.id === planId)
    expect(plan?.lines.map((one) => one.text)).toEqual([PLAN_LINE])
    expect(plan?.lines.map((one) => one.recordId)).toEqual([blockId])
    expect(reply.plans.some((one) => one.id === trajectoryId), 'the trajectory is not a plan').toBe(false)
    expect(reply.futures.some((one) => one.id === planId), 'the plan is not a future').toBe(false)
  })

  it('2. trajectory and schedule are used apart: planned states against period and hours', () => {
    const future = reply.futures.find((one) => one.id === trajectoryId)
    expect(future?.states.map((one) => one.id)).toEqual([firstState, secondState])
    const allocation = reply.allocations.find((one) => one.id === allocationId)
    expect(allocation).toMatchObject({ recordId: blockId, period: today, plannedHours: 2 })
    expect(reply.allocations.some((one) => one.recordId === trajectoryId), 'the trajectory is not an allocation').toBe(false)
    expect(reply.futures.some((one) => one.id === allocationId), 'the allocation is not a future').toBe(false)
  })

  it('3. trajectory and checkpoint are used apart: planned states against doing and next', () => {
    const future = reply.futures.find((one) => one.id === trajectoryId)
    expect(future?.states.map((one) => one.id)).toEqual([firstState, secondState])
    const checkpoint = reply.checkpoints.find((one) => one.id === stopId)
    expect(checkpoint).toMatchObject({ doing: DOING, next: NEXT })
    expect(reply.checkpoints.some((one) => one.id === trajectoryId), 'the trajectory is not a checkpoint').toBe(false)
    expect(reply.futures.some((one) => one.id === stopId), 'the checkpoint is not a future').toBe(false)
  })

  it('4. trajectory and revision are used apart: intended states against versions', () => {
    const future = reply.futures.find((one) => one.id === trajectoryId)
    expect(future?.states.map((one) => one.id)).toEqual([firstState, secondState])
    const versions = reply.revisions.entries.filter((one) => one.recordId === trajectoryId)
    expect(versions.length).toBeGreaterThanOrEqual(1)
    for (const entry of versions) {
      expect(typeof entry.seq, 'a revision has a seq').toBe('number')
      expect(typeof entry.op, 'a revision has an op').toBe('string')
    }
    expect(future?.states.map((one) => one.id), 'the future states are the planned states, not the versions').not.toEqual(versions.map((one) => one.recordId))
  })

  it('5. plan and schedule are used apart: plan lines against period and hours', () => {
    const plan = reply.plans.find((one) => one.id === planId)
    expect(plan?.lines.map((one) => one.text)).toEqual([PLAN_LINE])
    const allocation = reply.allocations.find((one) => one.id === allocationId)
    expect(allocation).toMatchObject({ recordId: blockId, period: today, plannedHours: 2 })
    expect(reply.allocations.some((one) => one.id === planId), 'the plan is not an allocation').toBe(false)
    expect(reply.plans.some((one) => one.id === allocationId), 'the allocation is not a plan').toBe(false)
  })

  it('6. plan and checkpoint are used apart: plan lines against doing and next', () => {
    const plan = reply.plans.find((one) => one.id === planId)
    expect(plan?.lines.map((one) => one.text)).toEqual([PLAN_LINE])
    const checkpoint = reply.checkpoints.find((one) => one.id === stopId)
    expect(checkpoint).toMatchObject({ doing: DOING, next: NEXT })
    expect(reply.checkpoints.some((one) => one.id === planId), 'the plan is not a checkpoint').toBe(false)
    expect(reply.plans.some((one) => one.id === stopId), 'the checkpoint is not a plan').toBe(false)
  })

  it('7. plan and revision are used apart: plan lines against seq and op', () => {
    const plan = reply.plans.find((one) => one.id === planId)
    expect(plan?.lines.map((one) => one.text)).toEqual([PLAN_LINE])
    const versions = reply.revisions.entries.filter((one) => one.recordId === blockId)
    expect(versions.length).toBeGreaterThanOrEqual(2)
    expect(reply.revisions.entries.some((one) => one.recordId === planId), 'the plan is not a revision').toBe(false)
    for (const entry of versions) {
      expect(typeof entry.seq, 'a revision has a seq').toBe('number')
      expect(typeof entry.op, 'a revision has an op').toBe('string')
    }
  })

  it('8. schedule and checkpoint are used apart: period and hours against doing and next', () => {
    const allocation = reply.allocations.find((one) => one.id === allocationId)
    expect(allocation).toMatchObject({ recordId: blockId, period: today, plannedHours: 2 })
    const checkpoint = reply.checkpoints.find((one) => one.id === stopId)
    expect(checkpoint).toMatchObject({ doing: DOING, next: NEXT })
    expect(reply.allocations.some((one) => one.recordId === stopId), 'the checkpoint is not an allocation').toBe(false)
    expect(reply.checkpoints.some((one) => one.id === allocationId), 'the allocation is not a checkpoint').toBe(false)
  })

  it('9. schedule and revision are used apart: period and hours against seq and op', () => {
    const allocation = reply.allocations.find((one) => one.id === allocationId)
    expect(allocation).toMatchObject({ recordId: blockId, period: today, plannedHours: 2 })
    const versions = reply.revisions.entries.filter((one) => one.recordId === blockId)
    expect(versions.length).toBeGreaterThanOrEqual(2)
    for (const entry of versions) {
      expect(typeof entry.seq, 'a revision has a seq').toBe('number')
      expect(typeof entry.op, 'a revision has an op').toBe('string')
      expect('period' in entry, 'a revision has no period').toBe(false)
      expect('plannedHours' in entry, 'a revision has no planned hours').toBe(false)
    }
    expect(reply.revisions.entries.some((one) => one.recordId === allocationId), 'the allocation is not a revision').toBe(false)
  })

  it('10. checkpoint and revision are used apart: doing and next against versions', () => {
    const checkpoint = reply.checkpoints.find((one) => one.id === stopId)
    expect(checkpoint).toMatchObject({ doing: DOING, next: NEXT })
    const versions = reply.revisions.entries.filter((one) => one.recordId === stopId)
    expect(versions.length).toBeGreaterThanOrEqual(1)
    for (const entry of versions) {
      expect(typeof entry.seq, 'a revision has a seq').toBe('number')
      expect(typeof entry.op, 'a revision has an op').toBe('string')
    }
    expect(reply.checkpoints.some((one) => one.id === stopId), 'the checkpoint is read as the record').toBe(true)
  })

  it('the record door refuses the four words that are not kinds, and a field copied from the other kind', async () => {
    for (const kind of ['plan', 'schedule', 'checkpoint', 'revision']) {
      const refused = await app.inject({ method: 'POST', url: '/api/records', headers: human(), payload: { kind, title: 'Made-up not a kind', data: {} } })
      expect(refused.statusCode, `${kind}: ${refused.body}`).toBe(400)
    }
    const copiedDoing = await app.inject({ method: 'POST', url: '/api/records', headers: human(), payload: { kind: 'trajectory', title: 'Made-up copied field', data: { plannedStateIds: [firstState, secondState], doing: DOING } } })
    expect(copiedDoing.statusCode, copiedDoing.body).toBe(400)
    const copiedNext = await app.inject({ method: 'POST', url: '/api/records', headers: human(), payload: { kind: 'trajectory', title: 'Made-up copied field', data: { plannedStateIds: [firstState, secondState], next: NEXT } } })
    expect(copiedNext.statusCode, copiedNext.body).toBe(400)
    const copiedStates = await app.inject({ method: 'POST', url: '/api/records', headers: human(), payload: { kind: 'stopping_point', title: 'Made-up copied field', data: { doing: DOING, next: NEXT, plannedStateIds: [] } } })
    expect(copiedStates.statusCode, copiedStates.body).toBe(400)
  })
})
