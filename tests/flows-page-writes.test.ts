// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOWS PAGE'S FIVE WRITES. This follows a pair of decisions, in wave 13p round 34, the second of
 * the five rounds of proposal report 4mwraeIStEe8.
 *
 * What is proved, against a test office of its own:
 *   1. POST /api/flows files a flow in the project the body names, not the header's, with its stages numbered by place;
 *      its answer is small, writes no change entry and says so; a stage with no why, no source, or a source that is not
 *      there, and a project that is not there, are refused with their codes, and nothing is filed.
 *   2. Each of the four stage writes — add, change, move, remove — answers the new version, the stages as {n, does} and
 *      one line on the change entry; stores the stages renumbered; and writes one change entry at the end of
 *      `step_changes` from the request's why and cause, dated today. A change and a remove quote the old stage.
 *   3. Each refuses, with its code and nothing written: a stale ifVersion (409), no why, no source, no cause, a source or
 *      a cause that is not there, a stage or a place that is not there, a move to where the stage is, and a change that
 *      changes nothing.
 *   4. The version a write answers is the one the next write sends, and the one GET /api/flows/<id> reads.
 *   5. buildAFlowStageWrite, the one builder the editor calls too, finds the same lacks without a server.
 *
 * Three-run proof, this whole file each time:
 *   node tools/run-named-tests.mjs tests/flows-page-writes.test.ts
 * The mutations it is proved against are written in the commit message and in the round's report.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

const AS = (project: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': project,
  'content-type': 'application/json',
})

type Reply = { status: number; body: Record<string, any> }

async function send(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object, project = 'default'): Promise<Reply> {
  const reply = await app.inject({ method, url, headers: AS(project), ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, any> }
}

/** A record a step or a change can name as its source or cause. */
const aSource = (title: string, workspaceId = 'default'): string =>
  t.api.createRecord({ kind: 'report', title, data: { blocks: [] }, workspaceId, actor: t.api.HUMAN }).id

/** The flow's data as stored, read past every door. */
const stored = (id: string): Record<string, any> => t.api.getRecord(id)!.data as Record<string, any>

/** How many flow records the office holds, read past every door. */
const flowCount = (): number => (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'flow'").get() as { n: number }).n

/** The current version of a flow, as GET /api/flows/<id> answers it. */
async function versionOf(id: string, project = 'default'): Promise<string> {
  const read = await send('GET', `/api/flows/${id}`, undefined, project)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return read.body.version as string
}

/** Today's date on the local wall clock, the date a change entry is written on. */
function today(): string {
  const now = new Date()
  const two = (n: number) => String(n).padStart(2, '0')
  return `${String(now.getFullYear())}-${two(now.getMonth() + 1)}-${two(now.getDate())}`
}

/** A flow of three stages, each with its why and source, made through the create door. */
async function aFlow(source: string): Promise<string> {
  const made = await send('POST', '/api/flows', {
    project: 'default',
    title: 'Test: serving a kettle',
    runsBy: 'the office itself',
    trigger: 'A test kettle is ready.',
    leavesBehind: 'a served test kettle',
    declaredIn: 'tools/test-kettle.mjs',
    stages: [1, 2, 3].map((k) => ({ does: `Test stage ${String(k)}.`, why: `Test why ${String(k)}.`, sources: [source] })),
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.flow as string
}

/** Expect a refusal with this code and status, with its reason and its English, and the flow left exactly as it was. */
async function refusedAndUnwritten(flow: string, write: Promise<Reply>, code: string, status = 400): Promise<Reply> {
  const before = JSON.stringify(stored(flow))
  const reply = await write
  expect(reply.status, JSON.stringify(reply.body)).toBe(status)
  expect(reply.body.code).toBe(code)
  expect(typeof reply.body.reason).toBe('string')
  expect(reply.body.error).toMatch(/nothing was written/i)
  expect(JSON.stringify(stored(flow))).toBe(before)
  return reply
}

describe('POST /api/flows makes a flow in the project it names', () => {
  it("files it in the body's project, numbers its stages, answers small and writes no change entry", async () => {
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'garden', title: 'Garden' })
    const source = aSource('Test source in the garden', 'garden')
    const made = await send('POST', '/api/flows', {
      project: 'garden',
      title: 'Test: watering',
      runsBy: 'person',
      trigger: 'A test dry day.',
      leavesBehind: 'wet test soil',
      declaredIn: 'nowhere yet',
      stages: [
        { does: 'Test fill the can.', evidence: 'a test can', why: 'Test: no water, no watering.', sources: [source] },
        { does: 'Test pour.', why: 'Test: the soil is dry.', sources: [source] },
      ],
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    expect(Object.keys(made.body)).toEqual(['version', 'stages', 'change', 'flow', 'project', 'narrowedByPermission'])
    expect(made.body.project).toBe('garden')
    expect(made.body.stages).toEqual([{ n: 1, does: 'Test fill the can.' }, { n: 2, does: 'Test pour.' }])
    expect(made.body.change).toBe('No change entry was written: a new flow has no earlier stages to change.')
    const record = t.api.getRecord(made.body.flow as string)!
    expect(record.workspaceId).toBe('garden')
    expect(record.kind).toBe('flow')
    expect(record.title).toBe('Test: watering')
    expect(record.data).toEqual({
      declared_in: 'nowhere yet',
      runs: 'person',
      trigger: 'A test dry day.',
      leaves_behind: 'wet test soil',
      stages: [
        { n: 1, does: 'Test fill the can.', evidence: 'a test can', why: 'Test: no water, no watering.', sources: [source] },
        { n: 2, does: 'Test pour.', why: 'Test: the soil is dry.', sources: [source] },
      ],
    })
    expect(made.body.version).toBe(await versionOf(made.body.flow as string, 'garden'))
  })

  it('refuses a stage with no why, no source, a source that is not there, and a project that is not there', async () => {
    const source = aSource('Test source')
    const base = { project: 'default', title: 'Test: a refused flow', runsBy: 'person', trigger: 'A test.', leavesBehind: 'nothing', declaredIn: 'nowhere' }
    const good = { does: 'Test.', why: 'Test why.', sources: [source] }
    const before = flowCount()
    const each = [
      [{ ...base, stages: [{ does: 'Test.', sources: [source] }] }, 'flowStepNoWhy'],
      [{ ...base, stages: [{ does: 'Test.', why: 'Test why.' }] }, 'flowStepNoSources'],
      [{ ...base, stages: [{ ...good, sources: ['test-not-there'] }] }, 'flowStepRecordNotThere'],
      [{ ...base, project: 'test-no-project', stages: [good] }, 'flowProjectNotThere'],
      [{ ...base, project: 'message-centre', stages: [good] }, 'flowProjectNotThere'],
    ] as const
    for (const [payload, code] of each) {
      const reply = await send('POST', '/api/flows', payload)
      expect(reply.status, JSON.stringify(reply.body)).toBe(400)
      expect(reply.body.code).toBe(code)
      expect(typeof reply.body.reason).toBe('string')
    }
    expect(flowCount()).toBe(before)
  })
})

describe('POST /api/flows/<id>/stages adds a stage', () => {
  it('puts it at its place, renumbers, answers small and writes the change entry from why and cause', async () => {
    const source = aSource('Test source')
    const cause = aSource('Test cause')
    const flow = await aFlow(source)
    const ifVersion = await versionOf(flow)
    const added = await send('POST', `/api/flows/${flow}/stages`, { ifVersion, at: 2, does: 'Test new stage.', evidence: 'a test line', why: 'Test new why.', sources: [source], cause })
    expect(added.status, JSON.stringify(added.body)).toBe(200)
    expect(Object.keys(added.body)).toEqual(['version', 'stages', 'change', 'flow', 'project', 'narrowedByPermission'])
    expect(added.body.stages).toEqual([
      { n: 1, does: 'Test stage 1.' },
      { n: 2, does: 'Test new stage.' },
      { n: 3, does: 'Test stage 2.' },
      { n: 4, does: 'Test stage 3.' },
    ])
    expect(added.body.change).toBe('Change entry 1 was written: Stage 2 was added: "Test new stage.".')
    const data = stored(flow)
    expect(data['stages'][1]).toEqual({ n: 2, does: 'Test new stage.', evidence: 'a test line', why: 'Test new why.', sources: [source] })
    expect(data['stages'].map((step: { n: number }) => step.n)).toEqual([1, 2, 3, 4])
    expect(data['step_changes']).toEqual([{ at: today(), what: 'Stage 2 was added: "Test new stage.".', why: 'Test new why.', cause }])
    expect(added.body.version).toBe(await versionOf(flow))
    expect(added.body.version).not.toBe(ifVersion)
  })

  it('refuses a stale version, no why, no source, no cause, a record that is not there, and a place that is not there', async () => {
    const source = aSource('Test source')
    const cause = aSource('Test cause')
    const flow = await aFlow(source)
    const ifVersion = await versionOf(flow)
    const url = `/api/flows/${flow}/stages`
    const good = { ifVersion, at: 1, does: 'Test new stage.', why: 'Test new why.', sources: [source], cause }
    const stale = await refusedAndUnwritten(flow, send('POST', url, { ...good, ifVersion: 'test-stale-0000' }), 'flowVersionStale', 409)
    expect(stale.body.error).toContain(ifVersion)
    await refusedAndUnwritten(flow, send('POST', url, { ...good, why: undefined }), 'flowStepNoWhy')
    await refusedAndUnwritten(flow, send('POST', url, { ...good, sources: [] }), 'flowStepNoSources')
    await refusedAndUnwritten(flow, send('POST', url, { ...good, cause: undefined }), 'flowStepChangeNoCause')
    await refusedAndUnwritten(flow, send('POST', url, { ...good, sources: ['test-gone-source'] }), 'flowStepRecordNotThere')
    const noCause = await refusedAndUnwritten(flow, send('POST', url, { ...good, cause: 'test-gone-cause' }), 'flowStepRecordNotThere')
    expect(noCause.body.error).toContain('"test-gone-cause"')
    await refusedAndUnwritten(flow, send('POST', url, { ...good, at: 5 }), 'flowStagePlaceNotThere')
    await refusedAndUnwritten(flow, send('POST', url, { ...good, at: 0 }), 'flowStagePlaceNotThere')
    // The last place there is, one past the last stage, is a place.
    expect((await send('POST', url, { ...good, at: 4 })).status).toBe(200)
  })
})

describe('PATCH /api/flows/<id>/stages/<n> changes a stage', () => {
  it('changes it in place, quotes the old stage, and writes the change entry', async () => {
    const source = aSource('Test source')
    const other = aSource('Test other source')
    const cause = aSource('Test cause')
    const flow = await aFlow(source)
    const ifVersion = await versionOf(flow)
    const changed = await send('PATCH', `/api/flows/${flow}/stages/2`, { ifVersion, does: 'Test stage 2, twice.', why: 'Test why 2, again.', sources: [other], cause })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(Object.keys(changed.body)).toEqual(['version', 'stages', 'change', 'was', 'flow', 'project', 'narrowedByPermission'])
    expect(changed.body.stages).toEqual([
      { n: 1, does: 'Test stage 1.' },
      { n: 2, does: 'Test stage 2, twice.' },
      { n: 3, does: 'Test stage 3.' },
    ])
    expect(changed.body.was).toEqual({ n: 2, does: 'Test stage 2.', why: 'Test why 2.', sources: [source] })
    expect(changed.body.change).toBe('Change entry 1 was written: Stage 2 was changed from "Test stage 2." to "Test stage 2, twice.".')
    const data = stored(flow)
    expect(data['stages'][1]).toEqual({ n: 2, does: 'Test stage 2, twice.', why: 'Test why 2, again.', sources: [other] })
    expect(data['step_changes']).toEqual([{ at: today(), what: 'Stage 2 was changed from "Test stage 2." to "Test stage 2, twice.".', why: 'Test why 2, again.', cause }])

    // A change that keeps the words names what it changed.
    const reasoned = await send('PATCH', `/api/flows/${flow}/stages/1`, { ifVersion: changed.body.version, why: 'Test why 1, better.', sources: [source], cause })
    expect(reasoned.status, JSON.stringify(reasoned.body)).toBe(200)
    expect(reasoned.body.change).toBe('Change entry 2 was written: Stage 1 ("Test stage 1.") was changed: its why.')
    expect(stored(flow)['step_changes']).toHaveLength(2)
  })

  it('refuses a stale version, no why, no source, no cause, a cause that is not there, a stage that is not there, and no change', async () => {
    const source = aSource('Test source')
    const cause = aSource('Test cause')
    const flow = await aFlow(source)
    const ifVersion = await versionOf(flow)
    const url = `/api/flows/${flow}/stages/2`
    const good = { ifVersion, does: 'Test stage 2, twice.', why: 'Test why 2, again.', sources: [source], cause }
    await refusedAndUnwritten(flow, send('PATCH', url, { ...good, ifVersion: 'test-stale-0000' }), 'flowVersionStale', 409)
    const noWhy = await refusedAndUnwritten(flow, send('PATCH', url, { ...good, why: undefined }), 'flowStepNoWhy')
    expect(noWhy.body.error, 'the refusal quotes what the old stage said').toContain('why: Test why 2.')
    await refusedAndUnwritten(flow, send('PATCH', url, { ...good, sources: undefined }), 'flowStepNoSources')
    await refusedAndUnwritten(flow, send('PATCH', url, { ...good, cause: '' }), 'flowStepChangeNoCause')
    await refusedAndUnwritten(flow, send('PATCH', url, { ...good, cause: 'test-gone-cause' }), 'flowStepRecordNotThere')
    await refusedAndUnwritten(flow, send('PATCH', `/api/flows/${flow}/stages/4`, good), 'flowStageNotThere')
    await refusedAndUnwritten(flow, send('PATCH', `/api/flows/${flow}/stages/0`, good), 'flowStageNotThere')
    await refusedAndUnwritten(flow, send('PATCH', url, { ...good, does: undefined, why: 'Test why 2.' }), 'flowStageUnchanged')
  })
})

describe('POST /api/flows/<id>/stages/<n>/move moves a stage', () => {
  it('moves it, renumbers, and writes a change entry with its why and cause', async () => {
    const source = aSource('Test source')
    const cause = aSource('Test cause')
    const flow = await aFlow(source)
    const ifVersion = await versionOf(flow)
    const moved = await send('POST', `/api/flows/${flow}/stages/3/move`, { ifVersion, to: 1, why: 'Test: the last stage goes first.', cause })
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(Object.keys(moved.body)).toEqual(['version', 'stages', 'change', 'flow', 'project', 'narrowedByPermission'])
    expect(moved.body.stages).toEqual([
      { n: 1, does: 'Test stage 3.' },
      { n: 2, does: 'Test stage 1.' },
      { n: 3, does: 'Test stage 2.' },
    ])
    expect(moved.body.change).toBe('Change entry 1 was written: Stage 3 ("Test stage 3.") was moved to place 1.')
    const data = stored(flow)
    expect(data['stages']).toEqual([
      { n: 1, does: 'Test stage 3.', why: 'Test why 3.', sources: [source] },
      { n: 2, does: 'Test stage 1.', why: 'Test why 1.', sources: [source] },
      { n: 3, does: 'Test stage 2.', why: 'Test why 2.', sources: [source] },
    ])
    expect(data['step_changes']).toEqual([{ at: today(), what: 'Stage 3 ("Test stage 3.") was moved to place 1.', why: 'Test: the last stage goes first.', cause }])
  })

  it('refuses a stale version, no why, no cause, a cause that is not there, a stage or place that is not there, and no move', async () => {
    const source = aSource('Test source')
    const cause = aSource('Test cause')
    const flow = await aFlow(source)
    const ifVersion = await versionOf(flow)
    const url = `/api/flows/${flow}/stages/1/move`
    const good = { ifVersion, to: 2, why: 'Test why of the move.', cause }
    await refusedAndUnwritten(flow, send('POST', url, { ...good, ifVersion: 'test-stale-0000' }), 'flowVersionStale', 409)
    await refusedAndUnwritten(flow, send('POST', url, { ...good, why: '  ' }), 'flowChangeNoWhy')
    await refusedAndUnwritten(flow, send('POST', url, { ...good, why: undefined }), 'flowChangeNoWhy')
    await refusedAndUnwritten(flow, send('POST', url, { ...good, cause: undefined }), 'flowStepChangeNoCause')
    await refusedAndUnwritten(flow, send('POST', url, { ...good, cause: 'test-gone-cause' }), 'flowStepRecordNotThere')
    await refusedAndUnwritten(flow, send('POST', `/api/flows/${flow}/stages/9/move`, good), 'flowStageNotThere')
    await refusedAndUnwritten(flow, send('POST', url, { ...good, to: 4 }), 'flowStagePlaceNotThere')
    await refusedAndUnwritten(flow, send('POST', url, { ...good, to: 1 }), 'flowStageAlreadyThere')
  })
})

describe('DELETE /api/flows/<id>/stages/<n> removes a stage', () => {
  it('removes it, renumbers, quotes it, and writes the change entry', async () => {
    const source = aSource('Test source')
    const cause = aSource('Test cause')
    const flow = await aFlow(source)
    const ifVersion = await versionOf(flow)
    const removed = await send('DELETE', `/api/flows/${flow}/stages/1`, { ifVersion, why: 'Test: the first stage is done elsewhere.', cause })
    expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    expect(Object.keys(removed.body)).toEqual(['version', 'stages', 'change', 'was', 'flow', 'project', 'narrowedByPermission'])
    expect(removed.body.stages).toEqual([
      { n: 1, does: 'Test stage 2.' },
      { n: 2, does: 'Test stage 3.' },
    ])
    expect(removed.body.was).toEqual({ n: 1, does: 'Test stage 1.', why: 'Test why 1.', sources: [source] })
    expect(removed.body.change).toBe('Change entry 1 was written: Stage 1 ("Test stage 1.") was removed.')
    const data = stored(flow)
    expect(data['stages']).toEqual([
      { n: 1, does: 'Test stage 2.', why: 'Test why 2.', sources: [source] },
      { n: 2, does: 'Test stage 3.', why: 'Test why 3.', sources: [source] },
    ])
    expect(data['step_changes']).toEqual([{ at: today(), what: 'Stage 1 ("Test stage 1.") was removed.', why: 'Test: the first stage is done elsewhere.', cause }])
  })

  it('refuses a stale version, no why, no cause, a cause that is not there, and a stage that is not there', async () => {
    const source = aSource('Test source')
    const cause = aSource('Test cause')
    const flow = await aFlow(source)
    const ifVersion = await versionOf(flow)
    const url = `/api/flows/${flow}/stages/2`
    const good = { ifVersion, why: 'Test why of the removal.', cause }
    await refusedAndUnwritten(flow, send('DELETE', url, { ...good, ifVersion: 'test-stale-0000' }), 'flowVersionStale', 409)
    await refusedAndUnwritten(flow, send('DELETE', url, { ...good, why: undefined }), 'flowChangeNoWhy')
    const noCause = await refusedAndUnwritten(flow, send('DELETE', url, { ...good, cause: undefined }), 'flowStepChangeNoCause')
    expect(noCause.body.error, 'the refusal quotes what the removed stage said').toContain('why: Test why 2.')
    await refusedAndUnwritten(flow, send('DELETE', url, { ...good, cause: 'test-gone-cause' }), 'flowStepRecordNotThere')
    await refusedAndUnwritten(flow, send('DELETE', `/api/flows/${flow}/stages/4`, good), 'flowStageNotThere')
  })
})

describe('ifVersion runs from one write to the next', () => {
  it('takes the version each write answers, and refuses the one before it', async () => {
    const source = aSource('Test source')
    const cause = aSource('Test cause')
    const flow = await aFlow(source)
    const first = await versionOf(flow)
    const moved = await send('POST', `/api/flows/${flow}/stages/1/move`, { ifVersion: first, to: 3, why: 'Test move.', cause })
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    await refusedAndUnwritten(flow, send('DELETE', `/api/flows/${flow}/stages/1`, { ifVersion: first, why: 'Test remove.', cause }), 'flowVersionStale', 409)
    const removed = await send('DELETE', `/api/flows/${flow}/stages/1`, { ifVersion: moved.body.version, why: 'Test remove.', cause })
    expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    expect(removed.body.change).toMatch(/^Change entry 2 was written: /)
    // A write through the records door moves the version too, and the stage doors see it.
    const outside = await send('PATCH', `/api/records/${flow}`, { dataPatch: { trigger: 'A test trigger, changed.' } })
    expect(outside.status, JSON.stringify(outside.body)).toBe(200)
    await refusedAndUnwritten(flow, send('DELETE', `/api/flows/${flow}/stages/1`, { ifVersion: removed.body.version, why: 'Test remove.', cause }), 'flowVersionStale', 409)
  })
})

describe('buildAFlowStageWrite is the one builder', () => {
  it('finds the same lacks without a server, and asks after records only when nothing else is lacking', async () => {
    const { buildAFlowStageWrite } = await import('../src/shared/flow-step-writes.ts')
    const asked: string[][] = []
    const missing = (ids: readonly string[]) => {
      asked.push([...ids])
      return ids.filter((id) => id.startsWith('gone'))
    }
    const before = { stages: [{ n: 1, does: 'A.', why: 'Why A.', sources: ['s'] }, { n: 2, does: 'B.', why: 'Why B.', sources: ['s'] }] }
    const codes = (write: Parameters<typeof buildAFlowStageWrite>[1]) => buildAFlowStageWrite(before, write, '2026-10-10', missing).lacks.map((lack) => lack.code)
    expect(codes({ op: 'add', at: 1, does: 'C.', sources: ['s'], cause: 'c' })).toEqual(['flowStepNoWhy'])
    expect(codes({ op: 'move', n: 1, to: 2, cause: 'c' })).toEqual(['flowChangeNoWhy'])
    expect(codes({ op: 'remove', n: 3, why: 'w', cause: 'c' })).toEqual(['flowStageNotThere'])
    expect(codes({ op: 'move', n: 2, to: 2, why: 'w', cause: 'c' })).toEqual(['flowStageAlreadyThere'])
    expect(codes({ op: 'change', n: 1, why: 'Why A.', sources: ['s'], cause: 'c' })).toEqual(['flowStageUnchanged'])
    expect(asked, 'no record is asked after while something else is lacking').toEqual([])
    expect(codes({ op: 'remove', n: 1, why: 'w', cause: 'gone-c' })).toEqual(['flowStepRecordNotThere'])
    const built = buildAFlowStageWrite(before, { op: 'move', n: 1, to: 2, why: 'w', cause: 'c' }, '2026-10-10', missing)
    expect(built.lacks).toEqual([])
    expect(built.next).toEqual({
      stages: [{ n: 1, does: 'B.', why: 'Why B.', sources: ['s'] }, { n: 2, does: 'A.', why: 'Why A.', sources: ['s'] }],
      step_changes: [{ at: '2026-10-10', what: 'Stage 1 ("A.") was moved to place 2.', why: 'w', cause: 'c' }],
    })
  })
})
