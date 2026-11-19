// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOWS PAGE'S READS, AND THE ONE CHECK OF A FLOW'S STEPS. This follows two decisions, in wave 13p
 * round 33, the first of the five rounds of proposal report 4mwraeIStEe8.
 *
 * What is proved, against a test office of its own with flows in three projects:
 *   1. GET /api/flows with none of the page's words answers its old reply exactly: the steward's inventory.
 *   2. A page of flows: each row's fields, the run counts of the last 30 days and the newest run, the three orders,
 *      the title search, and paging with matched, returned, left and next.
 *   2b. The count of runs that named no flow, in the projects read, whatever the search (round 35).
 *   3. Across projects: ?projects=all reads every project and each row names its own; ?projects=<id> reads that one;
 *      no word reads the header's project; a project that is not there is refused.
 *   4. ?with=problems counts each page flow's live problems, and only when asked.
 *   5. A word the door does not take, and a limit or sort it cannot read, are refused; and the note GET /api serves
 *      for the door names each of the six words (round 33b).
 *   6. GET /api/flows/<id>: the main content without the second level, the second level when asked, the latest runs
 *      newest first with `stagesRecorded` null when a run recorded no stage number; a record that is not a flow, an
 *      id that is nothing, and a flow of another project are refused, and ?projects= finds that flow.
 *   7. GET /api/flows/<id>/runs pages the runs, newest first.
 *   8. whatTheFlowStepsLack, the one check, finds each of the six codes, in the order the server refuses them, and
 *      asks after records only when nothing else is lacking.
 *
 * Three-run proof, this whole file each time:
 *   node tools/run-named-tests.mjs tests/flows-page-reads.test.ts
 * The mutations it is proved against are written in the commit message and in the round's report.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 120_000)

/**
 * THE READINGS HERE ARE OVER THE OFFICE: `?projects=all` counts every project's flows, and the
 * unnamed read counts every run that named no flow. Each case puts the flow and flow-run records
 * back as it found them (the office starts with none) instead of narrowing a reading, so each case's
 * own flows are the only ones in it.
 */
afterEach(() => {
  t.client.sqlite
    .prepare("update records set deleted_at = updated_at where kind in ('flow', 'flow_run') and deleted_at is null")
    .run()
})

afterAll(async () => {
  await app.close()
  t.close()
})

const AS = (project: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': project,
})

async function get(url: string, project = 'default'): Promise<{ status: number; body: Record<string, any> }> {
  const reply = await app.inject({ method: 'GET', url, headers: AS(project) })
  return { status: reply.statusCode, body: reply.json() as Record<string, any> }
}

async function read(url: string, project = 'default'): Promise<Record<string, any>> {
  const reply = await get(url, project)
  expect(reply.status, JSON.stringify(reply.body)).toBe(200)
  return reply.body
}

/** A local stamp this many days before now, the form `created_at` is stored in. */
async function daysAgo(days: number, minutes = 0): Promise<string> {
  const { localStamp } = await import('../src/shared/time.ts')
  return localStamp(new Date(Date.now() - days * 24 * 60 * 60 * 1000 - minutes * 60 * 1000))
}

/**
 * A project the file's cases share by name, made once. The cases before the change each had their own
 * database, so each made it; a shared office refuses a second one by design, and the cases that read
 * it only need it to exist.
 */
async function aWorkspace(id: string, title: string): Promise<void> {
  const { createWorkspace, getWorkspace } = await import('../src/server/lib/workspaces.ts')
  if (getWorkspace(id) === null) createWorkspace({ id, title })
}

function aFlow(title: string, workspaceId = 'default', stages = 3, extra: Record<string, unknown> = {}): string {
  const source = t.api.createRecord({ kind: 'report', title: `Test source of ${title}`, data: { blocks: [] }, workspaceId, actor: t.api.HUMAN }).id
  return t.api.createRecord({
    kind: 'flow',
    title,
    data: {
      declared_in: 'tools/test-kettle.mjs',
      runs: 'the office itself',
      trigger: `A test trigger for ${title}.`,
      stages: Array.from({ length: stages }, (_, k) => ({ n: k + 1, does: `Test stage ${k + 1}.`, evidence: 'A test record.', why: `Test why ${k + 1}.`, sources: [source] })),
      leaves_behind: 'a served kettle',
      ...extra,
    },
    workspaceId,
    actor: t.api.HUMAN,
  }).id
}

let runNumber = 0
/** A flow run, written into the table: only the office files one, and a test needs its time. */
function aRun(flow: string | null, at: string, steps: Record<string, unknown>[], workspaceId = 'default'): string {
  const sqlite = t.client.sqlite
  const like = sqlite.prepare("SELECT * FROM records WHERE kind = 'report' LIMIT 1").get() as Record<string, unknown>
  runNumber += 1
  const id = `test-run-${String(runNumber).padStart(4, '0')}`
  const data = flow === null ? { run: `test-session-${runNumber}`, noFlow: 'This run named no flow.', stepsTaken: steps } : { run: `test-session-${runNumber}`, flow, stepsTaken: steps }
  const row = { ...like, id, kind: 'flow_run', title: 'Flow run', workspace_id: workspaceId, data: JSON.stringify(data), created_at: at, updated_at: at }
  const columns = Object.keys(row)
  sqlite.prepare(`INSERT INTO records (${columns.map((c) => `"${c}"`).join(',')}) VALUES (${columns.map((c) => `@${c}`).join(',')})`).run(row)
  return id
}

const done = (n?: number, outcome = 'done') => ({ ...(n === undefined ? {} : { n }), does: 'A test step.', startedAt: '2026-10-01 10:00:00', how: 'by the office', outcome })

describe('GET /api/flows', () => {
  it('1. answers its old reply exactly when none of the page words is sent', async () => {
    const flow = aFlow('Test: brewing')
    aRun(flow, await daysAgo(1), [done()])
    const problem = t.api.createRecord({ kind: 'problem', title: 'Test: the kettle leaks', data: { symptom: 'Test drips.', cause: 'Test seal.', state: 'open' }, workspaceId: 'default', actor: t.api.HUMAN }).id
    const linked = await app.inject({ method: 'POST', url: '/api/links', headers: AS('default'), payload: { fromId: problem, toId: flow, type: 'about' } })
    expect(linked.statusCode, linked.body).toBe(201)
    const { readFlowInventory } = await import('../src/server/lib/flows.ts')
    const body = await read('/api/flows')
    // Every reply says `narrowedByPermission` (src/shared/disclosure.ts); the rest is the inventory, unchanged.
    expect(body).toEqual({ ...readFlowInventory('default'), narrowedByPermission: null })
    expect(body).toEqual({
      count: 1,
      flows: [{ id: flow, title: 'Test: brewing', declared_in: 'tools/test-kettle.mjs', problems: 1, problemIds: [problem] }],
      narrowedByPermission: null,
    })
  })

  it('2. answers a page of flows with run counts, three orders, a title search and paging', async () => {
    const quiet = aFlow('Test: a quiet flow', 'default', 2)
    const busy = aFlow('Test: a busy flow', 'default', 5)
    const recent = aFlow('Test: a recent flow', 'default', 4)
    const ignoredWorkspaceRun = await daysAgo(2)
    // EACH STAMP IS WORKED OUT ONCE: worked out twice, the clock can pass a second between the two.
    const busyLast = await daysAgo(3, 0)
    aRun(busy, busyLast, [done()])
    for (let i = 1; i < 4; i++) aRun(busy, await daysAgo(3, i), [done()])
    aRun(busy, await daysAgo(40), [done()])
    aRun(recent, await daysAgo(0, 5), [done()], 'default')
    aRun(null, ignoredWorkspaceRun, [done()])

    const byName = await read('/api/flows?limit=25')
    expect(byName.sort).toBe('name')
    expect(byName.projects).toEqual(['default'])
    expect(byName.flows.map((row: any) => row.id)).toEqual([busy, quiet, recent])
    const busyRow = byName.flows[0]
    expect(busyRow).toEqual({
      id: busy, project: 'default', title: 'Test: a busy flow', runsBy: 'the office itself', trigger: 'A test trigger for Test: a busy flow.',
      stages: 5, runs30d: 4, lastRunAt: busyLast, appliesTo: null,
    })
    expect(byName.flows[1]).toMatchObject({ id: quiet, runs30d: 0, lastRunAt: null, stages: 2 })
    expect(byName).toMatchObject({ matched: 3, returned: 3, left: 0, next: null })

    expect((await read('/api/flows?sort=runs')).flows.map((row: any) => row.id)).toEqual([busy, recent, quiet])
    expect((await read('/api/flows?sort=last')).flows.map((row: any) => row.id)).toEqual([recent, busy, quiet])

    const searched = await read('/api/flows?q=RECENT')
    expect(searched.flows.map((row: any) => row.id)).toEqual([recent])
    expect(searched.matched).toBe(1)
    expect((await read('/api/flows?q=%25')).matched, 'a % in the search is a character, not a wildcard').toBe(0)

    const first = await read('/api/flows?limit=2&sort=runs')
    expect(first).toMatchObject({ matched: 3, returned: 2, left: 1, next: 'GET /api/flows?limit=2&sort=runs&offset=2' })
    const second = await read(String(first.next).slice('GET '.length))
    expect(second.flows.map((row: any) => row.id)).toEqual([quiet])
    expect(second).toMatchObject({ returned: 1, left: 0, next: null })
  })

  it('2b. counts the runs of the projects read that named no flow, whatever the search, and not a run that named one', async () => {
    // Round 35: the list's heading line says how many runs named no flow (proposal 4mwraeIStEe8, block "page").
    await aWorkspace('garden', 'Garden')
    const flow = aFlow('Test: a named flow')
    aRun(flow, await daysAgo(1), [done()])
    aRun(null, await daysAgo(1), [done()])
    aRun(null, await daysAgo(90), [done()])
    aRun(null, await daysAgo(2), [done()], 'garden')
    const gone = aRun(null, await daysAgo(2), [done()])
    t.client.sqlite.prepare('UPDATE records SET deleted_at = updated_at WHERE id = ?').run(gone)
    // A run that named a flow id no flow record has named one, so it is not counted as naming none.
    aRun('test-no-such-flow', await daysAgo(1), [done()])

    expect((await read('/api/flows?limit=25')).runsNamingNoFlow).toBe(2)
    expect((await read('/api/flows?q=nothing-matches')).runsNamingNoFlow, 'the search looks in titles, not at runs').toBe(2)
    expect((await read('/api/flows?projects=all')).runsNamingNoFlow).toBe(3)
    expect((await read('/api/flows?projects=garden')).runsNamingNoFlow).toBe(1)
    expect(await read('/api/flows')).not.toHaveProperty('runsNamingNoFlow')
  })

  it('3. reads every project, one project, or the header\'s, and refuses a project that is not there', async () => {
    await aWorkspace('garden', 'Garden')
    await aWorkspace('kitchen', 'Kitchen')
    const home = aFlow('Test: a home flow')
    const garden = aFlow('Test: a garden flow', 'garden')
    const kitchen = aFlow('Test: a kitchen flow', 'kitchen')
    aRun(kitchen, await daysAgo(1), [done()], 'default')

    const every = await read('/api/flows?projects=all')
    expect(new Set(every.projects)).toEqual(new Set(['default', 'garden', 'kitchen']))
    expect(every.flows.map((row: any) => [row.id, row.project])).toEqual([[garden, 'garden'], [home, 'default'], [kitchen, 'kitchen']])
    expect(every.flows[2].runs30d, 'a run is counted in whichever project it was filed').toBe(1)
    expect(every.next).toBeNull()

    const one = await read('/api/flows?projects=garden')
    expect(one.flows.map((row: any) => row.id)).toEqual([garden])
    expect(one.projects).toEqual(['garden'])

    expect((await read('/api/flows?limit=25', 'kitchen')).flows.map((row: any) => row.id)).toEqual([kitchen])

    const paged = await read('/api/flows?projects=all&limit=1')
    expect(paged.next).toBe('GET /api/flows?limit=1&projects=all&offset=1')

    const nowhere = await get('/api/flows?projects=test-nowhere')
    expect(nowhere.status).toBe(400)
    expect(nowhere.body.error).toContain('No project is called "test-nowhere"')
  })

  it('4. counts problems for the page\'s flows only when ?with=problems asks', async () => {
    const leaky = aFlow('Test: a leaky flow')
    const dry = aFlow('Test: a dry flow')
    const problem = t.api.createRecord({ kind: 'problem', title: 'Test: drips', data: { symptom: 'Test drips.', cause: 'Test seal.', state: 'open' }, workspaceId: 'default', actor: t.api.HUMAN }).id
    const linked = await app.inject({ method: 'POST', url: '/api/links', headers: AS('default'), payload: { fromId: problem, toId: leaky, type: 'about' } })
    expect(linked.statusCode, linked.body).toBe(201)

    const without = await read('/api/flows?limit=25')
    expect(without.flows[0]).not.toHaveProperty('problems')
    const withProblems = await read('/api/flows?with=problems')
    expect(withProblems.flows.map((row: any) => [row.id, row.problems, row.problemIds])).toEqual([[dry, 0, []], [leaky, 1, [problem]]])
    t.api.deleteRecord(problem, t.api.HUMAN)
    expect((await read('/api/flows?with=problems')).flows[1].problems, 'a deleted problem is not counted').toBe(0)
  })

  it('5. refuses a word it does not take, and a limit or sort it cannot read', async () => {
    aFlow('Test: a flow')
    for (const url of ['/api/flows?limit=25&colour=blue', '/api/flows?limit=0', '/api/flows?limit=101', '/api/flows?sort=size', '/api/flows?with=everything', '/api/flows?offset=-1']) {
      const refused = await get(url)
      expect(refused.status, url).toBe(400)
      expect(refused.body.error, url).toContain('The query string')
    }
  })

  it('5b. names each of the page\'s six words in the note GET /api serves for the door', async () => {
    // Round 33's note was cut by a blank line, so GET /api served the inventory half and none of these (round 33b).
    const endpoints = (await read('/api')).endpoints as { method: string; path: string; description: string | null }[]
    const note = endpoints.find((one) => one.method === 'GET' && one.path === '/api/flows')?.description ?? ''
    for (const word of ['?limit=', '?offset=', '?q=', '?sort=', '?projects=', '?with=']) expect(note, word).toContain(word)
  })
})

describe('GET /api/flows/<id> and its runs', () => {
  it('6. answers one flow, its second level when asked, and its latest runs; refuses what is not a flow of this project', async () => {
    const flow = aFlow('Test: one flow', 'default', 3, { governed_by: 'tools/test-kettle.mjs' })
    for (let i = 0; i < 22; i++) aRun(flow, await daysAgo(i < 21 ? 1 : 40, i), [done()])
    const newest = await daysAgo(0, 1)
    const staged = aRun(flow, newest, [done(1), done(2, 'failed'), done()])

    const body = await read(`/api/flows/${flow}`)
    expect(body).toMatchObject({
      id: flow, project: 'default', title: 'Test: one flow', runsBy: 'the office itself', trigger: 'A test trigger for Test: one flow.',
      leavesBehind: 'a served kettle', declaredIn: 'tools/test-kettle.mjs', governedBy: 'tools/test-kettle.mjs', reviewedAt: null,
      runs: { count: 23, runs30d: 22, lastRunAt: newest },
    })
    expect(body.version).toMatch(/^[0-9a-f]{16}$/)
    expect(body.stages).toEqual([1, 2, 3].map((n) => ({ n, does: `Test stage ${n}.`, evidence: 'A test record.' })))
    expect(body).not.toHaveProperty('stepChanges')
    expect(body.secondLevel.ask).toBe(`GET /api/flows/${flow}?secondLevel=show`)
    expect(body.latestRuns).toHaveLength(20)
    expect(body.latestRuns[0]).toMatchObject({ id: staged, outcome: 'done', steps: 3, stagesRecorded: [{ n: 1, outcome: 'done' }, { n: 2, outcome: 'failed' }] })
    expect(body.latestRuns[1].stagesRecorded, 'a run that recorded no stage number').toBeNull()
    const ats = body.latestRuns.map((run: any) => run.at)
    expect([...ats].sort().reverse()).toEqual(ats)

    const shown = await read(`/api/flows/${flow}?secondLevel=show`)
    expect(shown.secondLevel).toBeNull()
    expect(shown.stages[0]).toEqual({ n: 1, does: 'Test stage 1.', evidence: 'A test record.', why: 'Test why 1.', sources: [expect.any(String)] })
    expect(shown.stepChanges).toEqual([])
    expect((await get(`/api/flows/${flow}?secondLevel=yes`)).status).toBe(400)

    const report = t.api.createRecord({ kind: 'report', title: 'Test: not a flow', data: { blocks: [] }, workspaceId: 'default', actor: t.api.HUMAN }).id
    const notAFlow = await get(`/api/flows/${report}`)
    expect(notAFlow.status).toBe(404)
    expect(notAFlow.body.error).toContain('is a report, not a flow')
    const nothing = await get('/api/flows/test-nothing-here')
    expect(nothing.status).toBe(404)
    expect(nothing.body.code).toBe('recordNotFound')

    await aWorkspace('garden', 'Garden')
    const elsewhere = aFlow('Test: a garden flow', 'garden')
    const refused = await get(`/api/flows/${elsewhere}`)
    expect(refused.status).toBe(404)
    expect(refused.body.error).toContain('is in another project')
    expect((await read(`/api/flows/${elsewhere}?projects=all`)).project).toBe('garden')
    expect((await get(`/api/flows/${elsewhere}?projects=default`)).status).toBe(404)
    expect((await get(`/api/flows/${flow}?colour=blue`)).status).toBe(400)
  })

  it('7. pages a flow\'s runs, newest first', async () => {
    const flow = aFlow('Test: a paged flow')
    const other = aFlow('Test: another flow')
    const ids: string[] = []
    for (let i = 0; i < 5; i++) ids.push(aRun(flow, await daysAgo(0, 10 - i), [done()]))
    aRun(other, await daysAgo(0), [done()])
    const first = await read(`/api/flows/${flow}/runs?limit=2`)
    expect(first.runs.map((run: any) => run.id)).toEqual([ids[4], ids[3]])
    expect(first).toMatchObject({ flow, matched: 5, returned: 2, left: 3, next: `GET /api/flows/${flow}/runs?limit=2&offset=2` })
    const last = await read(`/api/flows/${flow}/runs?limit=2&offset=4`)
    expect(last.runs.map((run: any) => run.id)).toEqual([ids[0]])
    expect(last).toMatchObject({ returned: 1, left: 0, next: null })
    expect((await read(`/api/flows/${flow}/runs`)).returned).toBe(5)
    expect((await get(`/api/flows/${flow}/runs?limit=500`)).status).toBe(400)
  })
})

describe('the one check of a flow\'s steps', () => {
  it('8. finds each of the six codes, in the server\'s order, and asks after records only when nothing else lacks', async () => {
    const { whatTheFlowStepsLack } = await import('../src/shared/flow-steps.ts')
    const asked: string[][] = []
    const missing = (ids: readonly string[]) => {
      asked.push([...ids])
      return ids.filter((id) => id.startsWith('gone-'))
    }
    const step = { n: 1, does: 'Check.', why: 'Because.', sources: ['here-1'] }
    const codes = (next: unknown, before: unknown) => whatTheFlowStepsLack(next, before, missing).lacks.map((lack) => lack.code)

    expect(codes({ stages: [{ n: 1, does: 'Check.' }] }, null)).toEqual(['flowStepNoWhy', 'flowStepNoSources'])
    expect(codes({ stages: [{ n: 1, does: 'Check.', sources: ['gone-1'] }] }, null)).toEqual(['flowStepNoWhy'])
    expect(asked, 'no record is asked after while a reason is lacking').toEqual([])
    expect(codes({ stages: [{ ...step, sources: ['gone-1'] }] }, null)).toEqual(['flowStepRecordNotThere'])
    expect(asked).toEqual([['gone-1']])

    const before = { stages: [step], step_changes: [{ at: 'x', what: 'y', why: 'z', cause: 'here-2' }] }
    expect(codes({ stages: [{ ...step, n: 2 }], step_changes: before.step_changes }, before), 'a step that only moved').toEqual([])
    expect(codes({ stages: [{ ...step, does: 'Check twice.' }], step_changes: before.step_changes }, before)).toEqual(['flowStepChangeUnrecorded'])
    expect(codes({ stages: [{ ...step, does: 'Check twice.' }], step_changes: [...before.step_changes, { at: 'x', what: 'y', why: 'z' }] }, before)).toEqual(['flowStepChangeNoCause'])
    expect(codes({ stages: [step], step_changes: [] }, before)).toEqual(['flowStepChangesRewritten'])
    const reading = whatTheFlowStepsLack({ stages: [] }, before, missing)
    expect(reading.gone, 'the removed step is handed back to be shown').toEqual([step])
  })
})
