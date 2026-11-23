// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MODULE'S AND A PIPELINE'S PAGE LIST WHAT IS RELATED TO THEM, AT EVERY DEPTH.
 *
 * What is checked, against a test office of its own, through src/server/lib/related.ts and through
 * GET /api/records/:id/related:
 *   1. the walk of a module holds its sub-modules at every depth, each once, and stops at a loop in the stored links;
 *      a record of another kind that is part of the module is not walked;
 *   2. the walk of a pipeline holds its blocks, the modules implementing them, their sub-modules and the runs part of
 *      any of them, each with the subject it was reached from;
 *   3. the decisions list joins a decision reached through two subjects into one row that names the one that is not
 *      the scope, newest first, and holds each decision's basis back until it is asked for;
 *   4. a replaced decision is left out of the list and named in the answer;
 *   5. the reports list holds a report about a sub-module two levels down and one about a run, says which subject
 *      each came through, and counts a deleted one;
 *   6. the checklists list holds a checklist one of whose items links a subject, with only that item;
 *   7. the door answers 404 for an unknown id and 400 for a scope that is neither a module nor a pipeline or a kind
 *      it does not list, and pages by limit and offset with what is left;
 *   8. the scoped list of reports reads the same walk, so it reaches a sub-module two levels down;
 *   9. the context door stays the module's own reading: a decision about a sub-module is not in it;
 *  10. a pipeline's decisions list holds a decision about one of its blocks, through that block.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const PROJECT = 'default'
const OWNER = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id, stated: true }
const AS_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': PROJECT,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

function aRecord(kind: string, title: string, data: Record<string, unknown> = {}): string {
  return t.api.createRecord({ workspaceId: PROJECT, kind: kind as never, title, data, actor: OWNER }).id
}

function aModule(title: string): string {
  return aRecord('module', title, { context: 'A made-up module for a test office.', parts: [] })
}

function link(fromId: string, toId: string, type: string): void {
  t.api.createLink({ fromId, toId, type: type as never, actor: OWNER })
}

function aPipeline(title: string): string {
  return aRecord('pipeline', title, { blockIds: [] })
}

function aBlock(pipeline: string, name: string): string {
  return t.blocks.addBlock(pipeline, { name, state: 'todo' }, t.api.HUMAN).block.id
}

function aRun(title: string, of: string): string {
  const id = aRecord('session', title)
  link(id, of, 'part_of')
  return id
}

function aReport(title: string, about: string): string {
  const id = aRecord('report', title, { for: 'Readers', date: '2026-01-01', read: 'read' })
  link(id, about, 'about')
  return id
}

/** A stamp of its own for each record, so newest first is an order and not a tie. */
function filedAt(id: string, stamp: string): void {
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(stamp, id)
}

/**
 * A LOOP IN THE STORED LINKS. The link door refuses a part_of link that makes a loop, so it is written straight into
 * the table, as an old store can hold one.
 */
function aStoredLoop(fromId: string, toId: string): void {
  const stamp = t.api.localStamp(new Date())
  t.client.sqlite
    .prepare(
      'INSERT INTO links (owner_id, id, workspace_id, from_id, to_id, type, created_by, created_at, updated_at) ' +
        "VALUES (?, ?, ?, ?, ?, 'part_of', ?, ?, ?)",
    )
    .run(THE_TEST_OFFICES_OWNER.id, `loop-${fromId}`.slice(0, 12), PROJECT, fromId, toId, THE_TEST_OFFICES_OWNER.id, stamp, stamp)
}

/** A decision through the record door, as a person files one. */
async function decide(title: string, data: Record<string, unknown>): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_OWNER,
    payload: {
      kind: 'decision',
      title,
      data: { option_taken: title, because: 'A made-up reason for a test office.', replaces: [], ...data },
    },
  })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

interface Row {
  id: string
  kind: string
  title: string
  date: string
  directly: boolean
  through: { id: string; kind: string; title: string }[]
  inferred: boolean
  decision?: { how: string; basis?: unknown[] }
  report?: { recordId: string }
  checklist?: { items: { id: string; words: string }[] }
}

interface Related {
  scope: { id: string; kind: string; title: string }
  kind: string
  rows: Row[]
  matched: number
  returned: number
  left: number
  offset: number
  limit: number
  replacedLeftOut: string[]
  deletedLeftOut: number
  couldNotRead: string[]
  secondLevel?: { held: string[]; ask: string }
  error?: string
}

async function related(id: string, kind: string, more = ''): Promise<{ status: number; body: Related }> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}/related?kind=${kind}${more}`, headers: AS_OWNER })
  return { status: res.statusCode, body: res.json() as Related }
}

const ids = (rows: readonly { id: string }[]): string[] => rows.map((one) => one.id)
const throughIds = (row: Row | undefined): string[] => (row?.through ?? []).map((one) => one.id)

describe('the walk of the subjects', () => {
  it('1: holds a module and its sub-modules at every depth, each once, and stops at a loop', async () => {
    const { theSubjectsOf } = await import('../src/server/lib/related.ts')
    const arm = aModule('Walk: the arm')
    const wrist = aModule('Walk: the wrist')
    link(wrist, arm, 'part_of')
    const finger = aModule('Walk: the finger')
    link(finger, wrist, 'part_of')
    const nail = aModule('Walk: the nail')
    link(nail, finger, 'part_of')
    const task = aRecord('task', 'Walk: a task that is part of the arm')
    link(task, arm, 'part_of')
    aStoredLoop(arm, nail)

    const subjects = theSubjectsOf(t.api.getRecord(arm)!)
    expect(ids(subjects).sort()).toEqual([arm, wrist, finger, nail].sort())
    expect(new Set(ids(subjects)).size, 'a subject is held once').toBe(subjects.length)
    expect(ids(subjects), 'a record that is not a module or a run is not walked').not.toContain(task)
    const at = (id: string) => subjects.find((one) => one.id === id)
    expect(at(arm)?.via, 'the scope is reached as itself').toBeNull()
    expect(at(arm)?.depth).toBe(0)
    expect(at(finger)?.via, 'a sub-module keeps the subject it was reached from').toBe(wrist)
    expect(at(nail)?.depth).toBe(3)
    expect(at(nail)?.kind).toBe('module')
  })

  it('2: holds a pipeline, its blocks, the modules implementing them, their sub-modules and the runs', async () => {
    const { theSubjectsOf } = await import('../src/server/lib/related.ts')
    const line = aPipeline('Walk: the folding line')
    const cut = aBlock(line, 'Walk: cut')
    const fold = aBlock(line, 'Walk: fold')
    const cutter = aModule('Walk: the cutter')
    link(cutter, cut, 'implements')
    const blade = aModule('Walk: the blade')
    link(blade, cutter, 'part_of')
    const elsewhere = aModule('Walk: a module of no step')
    const onTheBlade = aRun('Walk: a run on the blade', blade)
    const onTheLine = aRun('Walk: a run on the line', line)

    const subjects = theSubjectsOf(t.api.getRecord(line)!)
    expect(ids(subjects).sort()).toEqual([line, cut, fold, cutter, blade, onTheBlade, onTheLine].sort())
    expect(ids(subjects)).not.toContain(elsewhere)
    const at = (id: string) => subjects.find((one) => one.id === id)
    expect(at(cut)?.via).toBe(line)
    expect(at(cut)?.kind).toBe(t.api.getRecord(cut)?.kind)
    expect(at(cutter)?.via, 'a module is reached through the block it implements').toBe(cut)
    expect(at(blade)?.via).toBe(cutter)
    expect(at(onTheBlade)?.via, 'a run is reached through the subject it is part of').toBe(blade)
    expect(at(onTheBlade)?.kind).toBe('session')
    expect(at(onTheLine)?.via).toBe(line)
  })
})

describe('one reading of what is related, through one door', () => {
  it('3: joins a decision reached two ways into one row, newest first, with the basis held back', async () => {
    const arm = aModule('Decided: the arm')
    const wrist = aModule('Decided: the wrist')
    link(wrist, arm, 'part_of')
    const both = await decide('Decided: one rule for every joint', { governs: [{ record: arm }, { record: wrist }], decided_on: '2026-09-02' })
    const below = await decide('Decided: the wrist turns both ways', { governs: [{ record: wrist }], decided_on: '2026-09-03' })
    const own = await decide('Decided: the arm stays short', { governs: [{ record: arm }], decided_on: '2026-09-01' })

    const { status, body } = await related(arm, 'decisions')
    expect(status, JSON.stringify(body).slice(0, 300)).toBe(200)
    expect(body.scope.id).toBe(arm)
    expect(ids(body.rows), 'one row for each decision, newest first').toEqual([below, both, own])
    const row = (id: string) => body.rows.find((one) => one.id === id)
    expect(row(both)?.directly, 'it governs the scope itself').toBe(true)
    expect(throughIds(row(both)), 'and the row names the sub-module it also came through').toEqual([wrist])
    expect(row(below)?.directly).toBe(false)
    expect(throughIds(row(below))).toEqual([wrist])
    expect(row(below)?.through[0]?.kind).toBe('module')
    expect(row(own)?.directly).toBe(true)
    expect(throughIds(row(own))).toEqual([])
    expect(row(own)?.inferred).toBe(false)
    expect(row(own)?.decision?.how).toBe('governs it')
    expect(row(own)?.date).toBe('2026-09-01')
    expect([body.matched, body.returned, body.left]).toEqual([3, 3, 0])
    expect(body.couldNotRead).toEqual([])

    expect(row(own)?.decision?.basis, 'the basis is one level down').toBeUndefined()
    expect(body.secondLevel?.ask).toContain('secondLevel=show')
    const shown = await related(arm, 'decisions', '&secondLevel=show')
    expect(Array.isArray(shown.body.rows[0]?.decision?.basis), 'and given when asked for').toBe(true)
    expect(shown.body.secondLevel).toBeUndefined()
  })

  it('4: leaves a replaced decision out and names it', async () => {
    const arm = aModule('Replaced: the arm')
    const old = await decide('Replaced: the old rule', { governs: [{ record: arm }] })
    const later = await decide('Replaced: the new rule', { governs: [{ record: arm }], replaces: [old] })

    const { body } = await related(arm, 'decisions')
    expect(ids(body.rows)).toEqual([later])
    expect(body.replacedLeftOut).toEqual([old])
  })

  it('5: lists the reports about every subject, says which subject each came through, and counts a deleted one', async () => {
    const arm = aModule('Reports: the arm')
    const wrist = aModule('Reports: the wrist')
    link(wrist, arm, 'part_of')
    const finger = aModule('Reports: the finger')
    link(finger, wrist, 'part_of')
    const own = aReport('Reports: about the arm', arm)
    const deep = aReport('Reports: about the finger', finger)
    const run = aRun('Reports: a run on the wrist', wrist)
    const ofTheRun = aReport('Reports: about the run', run)
    const gone = aReport('Reports: withdrawn', wrist)
    t.api.deleteRecord(gone, OWNER)
    const elsewhere = aReport('Reports: about another module', aModule('Reports: another module'))
    filedAt(own, '2026-09-01 10:00:00')
    filedAt(ofTheRun, '2026-09-02 10:00:00')
    filedAt(deep, '2026-09-03 10:00:00')

    const { status, body } = await related(arm, 'reports')
    expect(status).toBe(200)
    expect(ids(body.rows), 'newest first, at every depth').toEqual([deep, ofTheRun, own])
    expect(ids(body.rows)).not.toContain(elsewhere)
    const row = (id: string) => body.rows.find((one) => one.id === id)
    expect(throughIds(row(deep))).toEqual([finger])
    expect(row(deep)?.directly).toBe(false)
    expect(throughIds(row(ofTheRun))).toEqual([run])
    expect(row(ofTheRun)?.through[0]?.kind).toBe('session')
    expect(row(own)?.directly).toBe(true)
    expect(row(own)?.report?.recordId, 'each row carries what the reports panel draws').toBe(own)
    expect(row(own)?.kind).toBe('report')
    expect(body.deletedLeftOut, 'the withdrawn report is counted, not listed').toBe(1)
  })

  it('6: lists a checklist one of whose items links a subject, with only that item', async () => {
    const { makeAChecklist } = await import('../src/server/lib/checklists.ts')
    const arm = aModule('Checklists: the arm')
    const wrist = aModule('Checklists: the wrist')
    link(wrist, arm, 'part_of')
    const actor = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id }
    const list = makeAChecklist({
      workspaceId: PROJECT,
      said: { title: 'Checklists: before the arm ships', items: [{ words: 'Oil the wrist', links: [wrist] }, { words: 'Paint the box' }] },
      actor,
    }).id
    const other = makeAChecklist({ workspaceId: PROJECT, said: { title: 'Checklists: about nothing here', items: [{ words: 'Sweep up' }] }, actor }).id

    const { status, body } = await related(arm, 'checklists')
    expect(status).toBe(200)
    expect(ids(body.rows)).toEqual([list])
    expect(ids(body.rows)).not.toContain(other)
    expect(throughIds(body.rows[0])).toEqual([wrist])
    expect(body.rows[0]?.checklist?.items.map((one) => one.words)).toEqual(['Oil the wrist'])
  })

  it('7: refuses what it cannot answer, and pages with what is left', async () => {
    expect((await related('no-such-record', 'decisions')).status).toBe(404)
    const task = aRecord('task', 'Door: a task is not a scope')
    expect((await related(task, 'reports')).status).toBe(400)
    const arm = aModule('Door: the arm')
    expect((await related(arm, 'everything')).status, 'a kind the door does not list').toBe(400)
    expect((await related(arm, 'reports', '&limit=26')).status, 'more than a page of 25').toBe(400)

    const first = aReport('Door: first', arm)
    const second = aReport('Door: second', arm)
    const third = aReport('Door: third', arm)
    filedAt(first, '2026-09-01 10:00:00')
    filedAt(second, '2026-09-02 10:00:00')
    filedAt(third, '2026-09-03 10:00:00')
    const page = await related(arm, 'reports', '&limit=2')
    expect(ids(page.body.rows)).toEqual([third, second])
    expect([page.body.matched, page.body.returned, page.body.left]).toEqual([3, 2, 1])
    const next = await related(arm, 'reports', '&limit=2&offset=2')
    expect(ids(next.body.rows)).toEqual([first])
    expect([next.body.offset, next.body.left]).toEqual([2, 0])
  })

  it('8: the scoped list of reports reads the same walk, so it reaches a sub-module two levels down', async () => {
    const arm = aModule('Scoped: the arm')
    const wrist = aModule('Scoped: the wrist')
    link(wrist, arm, 'part_of')
    const finger = aModule('Scoped: the finger')
    link(finger, wrist, 'part_of')
    const deep = aReport('Scoped: about the finger', finger)
    const res = await app.inject({
      method: 'GET',
      url: `/api/records/reports-and-notes?show=reports&scope=${arm}`,
      headers: AS_OWNER,
    })
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(ids((res.json() as { rows: { id: string }[] }).rows)).toContain(deep)
  })

  it("9: the context door stays the module's own reading", async () => {
    const arm = aModule('Context: the arm')
    const wrist = aModule('Context: the wrist')
    link(wrist, arm, 'part_of')
    const below = await decide('Context: the wrist rule', { governs: [{ record: wrist }] })
    const res = await app.inject({ method: 'GET', url: `/api/records/${arm}/context`, headers: AS_OWNER })
    expect(res.statusCode).toBe(200)
    const own = (res.json() as { decisionsAboutThis: { decisions: { id: string }[] } }).decisionsAboutThis.decisions
    expect(ids(own), 'a decision about a sub-module is not one about the module itself').not.toContain(below)
    expect(ids((await related(arm, 'decisions')).body.rows)).toContain(below)
  })

  it("10: a pipeline's decisions list holds a decision about one of its blocks, through that block", async () => {
    const line = aPipeline('Blocks: the line')
    const cut = aBlock(line, 'Blocks: cut')
    const onTheBlock = await decide('Blocks: cut square', { governs: [{ record: cut }] })
    const { status, body } = await related(line, 'decisions')
    expect(status).toBe(200)
    expect(ids(body.rows)).toEqual([onTheBlock])
    expect(throughIds(body.rows[0])).toEqual([cut])
    expect(body.rows[0]?.directly).toBe(false)
  })
})
