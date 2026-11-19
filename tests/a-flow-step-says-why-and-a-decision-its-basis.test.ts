// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLOW STEP SAYS WHY IT IS THERE, A DECISION SAYS WHAT IT WAS BASED ON, AND BOTH ARE ONE LEVEL DOWN. In wave 13q
 * round 43.
 *
 * What is proved, against a test office of its own:
 *   1. A new or changed flow step with no `why` is refused, one with no `sources` is refused, and a change to the steps
 *      that adds no entry to `step_changes`, or adds one with no `cause`, is refused. Nothing is written. The refusal
 *      quotes what the changed or removed step said: its why and its sources.
 *   2. A step nobody touched is never refused, though it has no why and no sources (a flow filed before the decision).
 *   3. An agent's read has no second level until it asks with ?secondLevel=show: GET /api/records/:id, the list,
 *      GET /api/decisions/governing and GET /api/records/:id/context. Each says what it left out and how to ask.
 *      Any other value of secondLevel is refused.
 *   4. A decision with twelve basis links keeps all twelve, in order; a record of another project is named by kind
 *      and id, without its title.
 *   5. A module's context lists the decisions that govern it, "governs it", and leaves out one that was replaced.
 *
 * Three-run proof, this whole file each time:
 *   node tools/run-named-tests.mjs tests/a-flow-step-says-why-and-a-decision-its-basis.test.ts
 * Mutations, one at a time, restored with cp and checked with cmp. A to E name src/shared/flow-steps.ts, where wave 13p
 * round 33 moved the check from src/server/lib/flow-reasons.ts:
 *   A. src/shared/flow-steps.ts, `if (noWhy.length > 0)` to `if (false)`: case 1 goes red.
 *   B. src/shared/flow-steps.ts, `if (noSources.length > 0)` to `if (false)`: case 1 goes red.
 *   C. src/shared/flow-steps.ts, `if (kept && stepsChanged && added.length === 0)` to `if (false)`: case 1 goes red.
 *   D. src/shared/flow-steps.ts, `if (noCause.length > 0)` to `if (false)`: case 1 goes red.
 *   E. src/shared/flow-steps.ts, `const touched = newSteps.filter(...)` to `const touched = newSteps`: case 2
 *      goes red.
 *   F. src/server/lib/flow-reasons.ts, `if (asked ||` to `if (true ||` in `foldTheSecondLevel`: case 3 goes red.
 *   G. src/server/api/records.ts, `withBasis: asked` to `withBasis: true` in the context door: case 3 goes red.
 *   H. src/server/lib/flow-reasons.ts, `return ids.map(` to `return ids.slice(0, 10).map(` in `theBasisOf`: case 4
 *      goes red.
 *   I. src/server/lib/decisionsabout.ts, `rowsFor(decisionsGoverning(workspaceId, { record: recordId }).decisions.map(`
 *      to `rowsFor(([] as { id: string }[]).map(`, so the governing decisions are not read: cases 3, 4 and 5 go red,
 *      because 3 and 4 reach the module's decisions through `governs` too.
 *   J. src/server/lib/flow-reasons.ts, `n === 1 ? one : many` to `many` in `counted`: case 3 goes red on "1 records".
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, expectPanelError, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  t.close()
})

type Step = { n: number; does: string; evidence?: string; why?: string; sources?: string[] }

function aReport(title: string, workspaceId = 'default'): string {
  return t.api.createRecord({ kind: 'report', title, data: { blocks: [] }, workspaceId, actor: t.api.HUMAN }).id
}

function aFlow(stages: Step[]): string {
  return t.api.createRecord({
    kind: 'flow',
    title: 'Test: landing a kettle',
    data: { declared_in: 'tools/test-kettle.mjs', runs: 'the office itself', trigger: 'A kettle is ready.', stages, leaves_behind: 'a served kettle' },
    workspaceId: 'default',
    actor: t.api.HUMAN,
  }).id
}

function aDecision(title: string, extra: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    kind: 'decision',
    title,
    data: { option_taken: title, because: 'A made-up reason.', ...extra },
    workspaceId: 'default',
    actor: t.api.HUMAN,
  }).id
}

const patch = (id: string, dataPatch: Record<string, unknown>) => t.api.patchRecord(id, { dataPatch }, t.api.HUMAN)

async function read(url: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

describe('a flow step says why it is there', () => {
  it('1. refuses a new or changed step with no why or no sources, and a change with no cause, quoting the old step', () => {
    const source = aReport('Test: why a kettle is checked')
    const noWhy = expectPanelError(t, () => aFlow([{ n: 1, does: 'The kettle is checked.', sources: [source] }]), 400)
    expect(noWhy.message).toContain('must say why it is there')
    const noSources = expectPanelError(t, () => aFlow([{ n: 1, does: 'The kettle is checked.', why: 'A cold kettle is served.' }]), 400)
    expect(noSources.message).toContain('must name its sources')

    const flow = aFlow([{ n: 1, does: 'The kettle is checked.', why: 'A cold kettle is served.', sources: [source] }])
    const changed: Step = { n: 1, does: 'The kettle is checked twice.', why: 'Once missed a cold one.', sources: [source] }
    const noEntry = expectPanelError(t, () => patch(flow, { stages: [changed] }), 400)
    expect(noEntry.message).toContain('must add an entry to `step_changes`')
    expect(noEntry.message, 'the refusal shows what the changed step said').toContain('why: A cold kettle is served.')
    expect(noEntry.message).toContain(`sources: ${source}`)

    const noCause = expectPanelError(
      t,
      () => patch(flow, { stages: [changed], step_changes: [{ at: '2026-10-08', what: 'Checked twice.', why: 'Once missed one.' }] }),
      400,
    )
    expect(noCause.message).toContain('names the record that caused it, in `cause`')
    expect(noCause.message).toContain('why: A cold kettle is served.')

    const changedWithoutWhy = expectPanelError(t, () => patch(flow, { stages: [{ n: 1, does: 'The kettle is checked twice.', sources: [source] }] }), 400)
    expect(changedWithoutWhy.message).toContain('must say why it is there')
    expect(changedWithoutWhy.message).toContain('why: A cold kettle is served.')

    const stored = t.api.getRecord(flow)!.data as { stages: Step[] }
    expect(stored.stages[0]!.does, 'nothing was written by the refused patches').toBe('The kettle is checked.')

    patch(flow, { stages: [changed], step_changes: [{ at: '2026-10-08', what: 'Checked twice.', why: 'Once missed one.', cause: source }] })
    expect((t.api.getRecord(flow)!.data as { stages: Step[] }).stages[0]!.does).toBe('The kettle is checked twice.')
  })

  it('2. never refuses a step nobody touched, though it has no why and no sources', () => {
    const source = aReport('Test: why a kettle is served')
    const flow = aFlow([{ n: 1, does: 'The kettle is served.', why: 'Nobody drinks from a kettle on the side.', sources: [source] }])
    const old = t.api.getRecord(flow)!.data as Record<string, unknown> & { stages: Step[] }
    writeDataBypassingTheGate(t, flow, { ...old, stages: [...old.stages, { n: 2, does: 'The kettle is washed.' }] })

    patch(flow, { trigger: 'A kettle is ready to pour.' })
    const stages = (t.api.getRecord(flow)!.data as { stages: Step[] }).stages
    patch(flow, {
      stages: [...stages, { n: 3, does: 'The kettle is put away.', why: 'A kettle left out is knocked over.', sources: [source] }],
      step_changes: [{ at: '2026-10-08', what: 'Step 3 added.', why: 'One was knocked over.', cause: source }],
    })
    expect((t.api.getRecord(flow)!.data as { stages: Step[] }).stages.map((step) => step.n)).toEqual([1, 2, 3])
  })
})

describe('the second level is one level down', () => {
  it('3. an agent read has no why, sources, changes or basis until it asks with secondLevel=show', async () => {
    const source = aReport('Test: the source')
    const module = t.api.createRecord({ kind: 'module', title: 'Test: kettle module', data: { context: 'made up' }, workspaceId: 'default', actor: t.api.HUMAN }).id
    const flow = aFlow([{ n: 1, does: 'The kettle is checked.', why: 'A cold kettle is served.', sources: [source] }])
    const decision = aDecision('Test: check every kettle', { governs: [{ record: module }], basis: [source] })

    const flowRead = await read(`/api/records/${flow}`)
    const flowData = (flowRead['record'] as { data: { stages: Step[] } }).data
    expect(flowData.stages[0]).not.toHaveProperty('why')
    expect(flowData.stages[0]).not.toHaveProperty('sources')
    expect(flowData.stages[0]!.does, 'the main content stays').toBe('The kettle is checked.')
    expect((flowRead['secondLevel'] as { ask: string }).ask).toBe(`GET /api/records/${flow}?secondLevel=show`)
    const flowShown = await read(`/api/records/${flow}?secondLevel=show`)
    expect((flowShown['record'] as { data: { stages: Step[] } }).data.stages[0]!.why).toBe('A cold kettle is served.')
    expect(flowShown).not.toHaveProperty('secondLevel')

    const decisionRead = await read(`/api/records/${decision}`)
    expect((decisionRead['record'] as { data: Record<string, unknown> }).data).not.toHaveProperty('basis')
    expect((decisionRead['secondLevel'] as { held: string[] }).held, 'one record is said as one').toEqual(['data.basis (1 record)'])
    expect((flowRead['secondLevel'] as { held: string[] }).held).toEqual(['data.stages[].why and data.stages[].sources (1 of 1 step has them)'])
    const decisionShown = await read(`/api/records/${decision}?secondLevel=show`)
    expect((decisionShown['record'] as { data: { basis: string[] } }).data.basis).toEqual([source])

    const list = await read('/api/records?kind=flow&shape=full')
    const listRow = (list['records'] as Array<{ id: string; data: { stages: Step[] } }>).find((one) => one.id === flow)
    expect(listRow!.data.stages[0]).not.toHaveProperty('why')
    expect(list).toHaveProperty('secondLevel')
    const listShown = await read('/api/records?kind=flow&secondLevel=show&shape=full')
    const listShownRow = (listShown['records'] as Array<{ id: string; data: { stages: Step[] } }>).find((one) => one.id === flow)
    expect(listShownRow!.data.stages[0]!.why).toBe('A cold kettle is served.')

    const governing = await read(`/api/decisions/governing?record=${module}`)
    expect(governing).toHaveProperty('secondLevel')
    expect(JSON.stringify(governing)).not.toContain('"basis"')
    const governingShown = await read(`/api/decisions/governing?record=${module}&secondLevel=show`)
    expect(JSON.stringify(governingShown)).toContain(source)

    const context = await read(`/api/records/${module}/context`)
    const about = (context['decisionsAboutThis'] as { decisions: Array<Record<string, unknown>> }).decisions
    expect(about.map((one) => one['id'])).toEqual([decision])
    expect(about[0]).not.toHaveProperty('basis')
    expect((context['secondLevel'] as { ask: string }).ask).toBe(`GET /api/records/${module}/context?secondLevel=show`)
    const contextShown = await read(`/api/records/${module}/context?secondLevel=show`)
    const shownAbout = (contextShown['decisionsAboutThis'] as { decisions: Array<{ basis: Array<{ id: string }> }> }).decisions
    expect(shownAbout[0]!.basis.map((one) => one.id)).toEqual([source])
    expect(contextShown).not.toHaveProperty('secondLevel')

    const misspelt = await app.inject({ method: 'GET', url: `/api/records/${flow}?secondLevel=yes` })
    expect(misspelt.statusCode, 'any other value is refused, not read as no').toBe(400)
  })

  it('4. a decision keeps twelve basis links in order, naming another project only by kind and id', async () => {
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'other', title: 'Other' })
    const here = Array.from({ length: 11 }, (_, i) => aReport(`Test: basis ${String(i + 1)}`))
    const elsewhere = aReport('Test: a title of another project', 'other')
    const basis = [...here, elsewhere]
    const module = t.api.createRecord({ kind: 'module', title: 'Test: kettle module', data: { context: 'made up' }, workspaceId: 'default', actor: t.api.HUMAN }).id
    aDecision('Test: twelve reasons', { governs: [{ record: module }], basis })

    const context = await read(`/api/records/${module}/context?secondLevel=show`)
    const entries = (context['decisionsAboutThis'] as { decisions: Array<{ basis: Array<{ id: string; title: string | null; untitledBecause: string | null }> }> })
      .decisions[0]!.basis
    expect(entries.map((one) => one.id)).toEqual(basis)
    expect(entries[0]!.title).toBe('Test: basis 1')
    expect(entries[11], 'a record of another project is named without its title').toEqual({ id: elsewhere, kind: 'report', title: null, untitledBecause: 'another-project' })
    expect(JSON.stringify(context)).not.toContain('Test: a title of another project')
  })

  it('5. a module lists the decisions that govern it, and leaves out one that was replaced', async () => {
    const module = t.api.createRecord({ kind: 'module', title: 'Test: kettle module', data: { context: 'made up' }, workspaceId: 'default', actor: t.api.HUMAN }).id
    const older = aDecision('Test: the older rule', { governs: [{ record: module }] })
    const newer = aDecision('Test: the newer rule', { governs: [{ record: module }], replaces: [older] })
    const context = await read(`/api/records/${module}/context`)
    const about = (context['decisionsAboutThis'] as { decisions: Array<{ id: string; how: string }> }).decisions
    expect(about.map((one) => [one.id, one.how])).toEqual([[newer, 'governs it']])
  })
})
