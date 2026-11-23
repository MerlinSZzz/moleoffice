// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MOVING A RECORD BETWEEN PROJECTS — the verb, over HTTP, against a database holding three of them.
 *
 * ---------------------------------------------------------------------------------------
 * THE STATE THIS EXISTS FOR, MEASURED BEFORE IT WAS BUILT
 * ---------------------------------------------------------------------------------------
 *
 * On the real database, 2026-08-12: five records written through the API without
 * `x-mole-office-workspace` landed in `default` and were then linked to modules in `panelx`. Those links
 * predate `createLink`'s refusal, so they were legal when they were made and are refused now — which
 * meant `npx tsx scripts/import.ts` would not restore the corpus from its own export, naming them.
 * There was no verb anywhere that moved a record between projects, so the product could produce a
 * state it could not leave.
 *
 * Every test below is a black-box request. `moveRecordToWorkspace` is one function taking a
 * workspace id, so a unit test of it would prove that a parameter is used; the failure this work
 * exists to end was that NOTHING CALLED ANYTHING. So the route is asked, with the headers a real
 * agent sends, and the database is read afterwards to see what really moved.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH TEST HERE IS PROVING, AND WHICH ONE WOULD HAVE CAUGHT THE REAL DEFECT
 * ---------------------------------------------------------------------------------------
 *
 * `the corpus's own shape` is the one. It rebuilds the five real records — a session, a claim, a
 * note, a problem and a proposal in one project, linked to a module in another, with the note and
 * the claim also linked to each other — moves them with this verb, and then asks the question the
 * importer asks: is any link left with its two ends in different projects. Before this verb existed
 * there was no request that could make that number zero.
 */

import type { FastifyInstance } from 'fastify'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENT, apiApp, freshDb, one, type TestDb, governsTheWholeProject } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { DEFAULT_WORKSPACE } from '@shared/workspaces.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance

const PANELX = 'panelx'
const ROBOTICS = 'robotics'

/**
 * ONE DATABASE HOLDING THE THREE PROJECTS, BUILT ONCE.
 *
 * The projects, their rows and the schema do not change between cases, so the file is built once in
 * `beforeAll` and every case is given a copy of it. A case that moves a record changes its own copy
 * only, which is what the counts and the crossing query below need.
 */
let theOfficeToCopy: string
let theOfficeToCopyFolder: string

beforeAll(async () => {
  const built = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: PANELX, title: 'Mole Office' })
  createWorkspace({ id: ROBOTICS, title: 'Robotics' })
  theOfficeToCopyFolder = mkdtempSync(join(tmpdir(), 'mole-office-workspace-move-'))
  theOfficeToCopy = join(theOfficeToCopyFolder, 'office.db')
  // THE WRITES ABOVE GO TO THE WRITE-AHEAD LOG FIRST, so the file is checkpointed before it is copied.
  built.client.sqlite.pragma('wal_checkpoint(TRUNCATE)')
  copyFileSync(built.file, theOfficeToCopy)
  built.close()
})

afterAll(() => {
  rmSync(theOfficeToCopyFolder, { recursive: true, force: true })
})

beforeEach(async () => {
  const folder = aTestDatabaseFolder('test')
  const file = join(folder, 'panelx.db')
  copyFileSync(theOfficeToCopy, file)
  process.env.MOLE_OFFICE_DB = file
  vi.resetModules()
  const client = await import('../src/server/db/client.ts')
  const api = await import('../src/server/lib/records.ts')
  const blocks = await import('../src/server/lib/blocks.ts')
  const doors = await import('../src/server/lib/check-field-doors.ts')
  t = {
    api,
    blocks,
    doors,
    client,
    file,
    close() {
      client.sqlite.close()
      removeThisTestFolder(folder)
    },
  }
  app = (await apiApp()).app
  await app.ready()
})

afterEach(async () => {
  await app.close()
  t.close()
})

/** Headers as an agent working in one project sends them. */
const asAgent = (workspaceId: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': workspaceId,
})

/** Headers as the human sends them, for the kinds an agent may not write. */
const asHuman = (workspaceId: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': workspaceId,
})

async function file(
  workspaceId: string,
  kind: string,
  title: string,
  data: unknown = {},
  headers = asAgent(workspaceId),
): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function link(workspaceId: string, fromId: string, toId: string, type = 'about'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/links',
    headers: asAgent(workspaceId),
    payload: { fromId, toId, type },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { id: string }).id
}

interface MoveBody {
  to: string
  also?: string[]
  dryRun?: boolean
}

async function move(
  workspaceId: string,
  id: string,
  body: MoveBody,
  headers = asAgent(workspaceId),
): Promise<{ statusCode: number; body: string; json: () => unknown }> {
  return app.inject({ method: 'POST', url: `/api/records/${id}/workspace`, headers, payload: body })
}

/** What the importer asks: any stored link whose two ends sit in different projects. */
function crossings(): { linkId: string; from: string; to: string }[] {
  return t.client.sqlite
    .prepare(
      `SELECT l.id AS linkId, rf.workspace_id AS "from", rt.workspace_id AS "to"
         FROM links l JOIN records rf ON rf.id = l.from_id JOIN records rt ON rt.id = l.to_id
        WHERE rf.workspace_id <> rt.workspace_id ORDER BY l.id`,
    )
    .all() as { linkId: string; from: string; to: string }[]
}

const workspaceOfRecord = (id: string): string | undefined =>
  (t.client.sqlite.prepare('SELECT workspace_id AS w FROM records WHERE id = ?').get(id) as { w: string } | undefined)?.w

const errorOf = (res: { body: string }): string => String((JSON.parse(res.body) as { error?: unknown }).error ?? '')

// ================================================================================ the plain move

describe('a record that moves alone', () => {
  it('moves the record, its links, its change rows and its ledger row, and says every number', async () => {
    const session = await file(DEFAULT_WORKSPACE, 'session', 'overnight campaign', { state: 'running' })
    const changesBefore = t.client.sqlite
      .prepare('SELECT count(*) AS n FROM changes WHERE record_id = ?')
      .get(session) as { n: number }
    expect(changesBefore.n).toBeGreaterThan(0)
    // THE RUN'S OWN FLOW RUN, which the office wrote beside it and which goes with it unasked (wave 13p round 25).
    const flowRun = (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").get(session) as { id: string }).id
    const flowRunChangesBefore = t.client.sqlite.prepare('SELECT count(*) AS n FROM changes WHERE record_id = ?').get(flowRun) as { n: number }

    const res = await move(DEFAULT_WORKSPACE, session, { to: PANELX })
    expect(res.statusCode, res.body).toBe(200)
    const report = res.json() as {
      dryRun: boolean
      from: string
      to: string
      alreadyThere: boolean
      moving: { id: string; forcedBy: unknown }[]
      needsAlso: string[]
      rows: { records: number; changes: number }
      note: string
    }

    expect(report.dryRun).toBe(false)
    expect(report.alreadyThere).toBe(false)
    expect(report.from).toBe(DEFAULT_WORKSPACE)
    expect(report.to).toBe(PANELX)
    expect(report.needsAlso).toEqual([])
    expect(report.moving.map((m) => m.id)).toEqual([session, flowRun])
    expect(report.rows.records).toBe(2)
    // ONE MORE CHANGE ROW THAN THERE WERE BEFORE, AND THE EXTRA ONE IS THE MOVE ITSELF. This used
    // to assert `changesBefore.n`, which passed because the report counted before its own write
    // rather than because the number was right. A person checking the report against the
    // destination would have found one row the move never admitted to carrying.
    expect(report.rows.changes).toBe(changesBefore.n + 1 + flowRunChangesBefore.n + 1)
    expect(report.note).toContain('moved with its own flow run')

    expect(workspaceOfRecord(session)).toBe(PANELX)
    // The change rows followed. A change row's project is the project of the record it is about —
    // `logChange` derives it and refuses a parameter for it — so a row left behind would be the
    // derivation made false by the one verb that moves the thing it derives from.
    const left = t.client.sqlite
      .prepare("SELECT count(*) AS n FROM changes WHERE record_id = ? AND workspace_id <> ?")
      .get(session, PANELX) as { n: number }
    expect(left.n).toBe(0)
  })

  it('writes one change row per record moved, with the actor and both projects', async () => {
    const note = await file(DEFAULT_WORKSPACE, 'note', 'Wave 1 closeout', { body: 'what happened' })
    const res = await move(DEFAULT_WORKSPACE, note, { to: PANELX })
    expect(res.statusCode, res.body).toBe(200)

    const rows = t.client.sqlite
      .prepare("SELECT * FROM changes WHERE record_id = ? AND field = 'workspaceId'")
      .all(note) as { workspace_id: string; op: string; old_value: string; new_value: string; actor_type: string; actor_id: string }[]
    const row = one(rows, 'the move change row')
    expect(row.op).toBe('update')
    expect(row.old_value).toBe(DEFAULT_WORKSPACE)
    expect(row.new_value).toBe(PANELX)
    expect(row.actor_type).toBe('agent')
    expect(row.actor_id).toBe('claude-code')
    // Filed in the DESTINATION, beside the rest of that record's history, which has just moved with
    // it. A move row in the project the record left would be the one row of its history that is
    // somewhere else.
    expect(row.workspace_id).toBe(PANELX)
  })

  it('carries a session ledger row, which is the shape the real corpus had', async () => {
    const session = await file(DEFAULT_WORKSPACE, 'session', 'a run holding a port', { state: 'running' })
    const registered = await app.inject({
      method: 'POST',
      url: '/api/resources',
      headers: asAgent(DEFAULT_WORKSPACE),
      payload: { sessionRecordId: session, type: 'port', key: '39231', detail: 'a port this test never bound' },
    })
    expect(registered.statusCode, registered.body).toBe(201)

    const res = await move(DEFAULT_WORKSPACE, session, { to: PANELX })
    expect(res.statusCode, res.body).toBe(200)
    expect((res.json() as { rows: { resources: number } }).rows.resources).toBe(1)

    const rows = t.client.sqlite
      .prepare('SELECT workspace_id AS w FROM session_resources WHERE session_record_id = ?')
      .all(session) as { w: string }[]
    expect(one(rows, 'the ledger row').w).toBe(PANELX)
  })
})

// ================================================================================ what must come

describe('what has to move with it', () => {
  it('refuses rather than dragging a linked record along, and names the link that forces it', async () => {
    const claim = await file(DEFAULT_WORKSPACE, 'claim', 'A CSS variable on :root is silently invalid', {
      evidence: ['measured on the running page'],
    })
    const note = await file(DEFAULT_WORKSPACE, 'note', 'Wave 1 closeout', { body: 'what happened' })
    const joining = await link(DEFAULT_WORKSPACE, note, claim, 'relates_to')

    const res = await move(DEFAULT_WORKSPACE, note, { to: PANELX })
    expect(res.statusCode, res.body).toBe(409)
    const message = errorOf(res)
    expect(message).toContain(claim)
    expect(message).toContain(joining)
    expect(message).toContain('Nothing was written')
    // Both ways out are offered, and neither of them is "the link was removed for you".
    expect(message).toContain(`"also":["${claim}"]`)
    expect(message).toContain('DELETE /api/links/<id>')
    expect(message).toContain('nothing here will remove one')

    // And nothing happened.
    expect(workspaceOfRecord(note)).toBe(DEFAULT_WORKSPACE)
    expect(workspaceOfRecord(claim)).toBe(DEFAULT_WORKSPACE)
  })

  it('moves both when the caller confirms the list it was shown', async () => {
    const claim = await file(DEFAULT_WORKSPACE, 'claim', 'A CSS variable on :root is silently invalid', {
      evidence: ['measured on the running page'],
    })
    const note = await file(DEFAULT_WORKSPACE, 'note', 'Wave 1 closeout', { body: 'what happened' })
    await link(DEFAULT_WORKSPACE, note, claim, 'relates_to')

    const res = await move(DEFAULT_WORKSPACE, note, { to: PANELX, also: [claim] })
    expect(res.statusCode, res.body).toBe(200)
    const report = res.json() as { moving: { id: string; forcedBy: { relation: string; through: string } | null }[]; rows: { links: number } }
    expect(report.moving.map((m) => m.id).sort()).toEqual([claim, note].sort())
    expect(report.moving.find((m) => m.id === claim)?.forcedBy?.relation).toBe('link')
    expect(report.rows.links).toBe(1)

    expect(workspaceOfRecord(note)).toBe(PANELX)
    expect(workspaceOfRecord(claim)).toBe(PANELX)
    // The link is filed where both its ends now are, which is what `createLink` does when it makes
    // one. A link left in the project both ends have left is a row no request in that project can
    // reach and no request in this one can either.
    const rows = t.client.sqlite
      .prepare('SELECT workspace_id AS w FROM links WHERE from_id = ? AND to_id = ?')
      .all(note, claim) as { w: string }[]
    expect(one(rows, 'the link').w).toBe(PANELX)
    expect(crossings()).toEqual([])
  })

  it('does not pull in a record that is already at the destination', async () => {
    const module = await file(PANELX, 'module', 'The reading surface')
    const problem = await file(DEFAULT_WORKSPACE, 'problem', 'The filled red ground stopped meaning a person', {
      symptom: 'red everywhere',
    })
    // Written straight in, because the API refuses to create it — which is the whole point: this is
    // the shape the real corpus holds and the shape no request can make any more.
    t.client.sqlite
      .prepare(`INSERT INTO links (owner_id, id, workspace_id, from_id, to_id, type, inferred, created_by, created_at, updated_at) VALUES ('${THE_TEST_OFFICES_OWNER.id}', ?,?,?,?,?,0,?,?,?)`)
      .run('crossLink0001', DEFAULT_WORKSPACE, problem, module, 'about', 'agent:claude-code', '2026-08-11 20:00:00', '2026-08-11 20:00:00')
    expect(crossings()).toHaveLength(1)

    const res = await move(DEFAULT_WORKSPACE, problem, { to: PANELX })
    expect(res.statusCode, res.body).toBe(200)
    const report = res.json() as { moving: { id: string }[]; needsAlso: string[] }
    expect(report.needsAlso).toEqual([])
    expect(one(report.moving, 'moved record').id).toBe(problem)
    expect(workspaceOfRecord(module)).toBe(PANELX)
    expect(crossings()).toEqual([])
  })

  it('refuses an `also` that names a record nothing forces', async () => {
    const note = await file(DEFAULT_WORKSPACE, 'note', 'Wave 1 closeout', { body: 'what happened' })
    const unrelated = await file(DEFAULT_WORKSPACE, 'note', 'Something else entirely', { body: 'unrelated' })

    const res = await move(DEFAULT_WORKSPACE, note, { to: PANELX, also: [unrelated] })
    expect(res.statusCode, res.body).toBe(409)
    expect(errorOf(res)).toContain('which nothing forces to move')
    expect(workspaceOfRecord(note)).toBe(DEFAULT_WORKSPACE)
    expect(workspaceOfRecord(unrelated)).toBe(DEFAULT_WORKSPACE)
  })

  it('carries a pipeline and its blocks together, which no link joins', async () => {
    const pipeline = await file(DEFAULT_WORKSPACE, 'pipeline', 'Transplant v2', {})
    const added = await app.inject({
      method: 'POST',
      url: `/api/records/${pipeline}/blocks`,
      headers: asAgent(DEFAULT_WORKSPACE),
      payload: { name: 'Sense the pot', state: 'todo' },
    })
    expect(added.statusCode, added.body).toBe(201)
    const block = (added.json() as { record: { id: string } }).record.id

    // Moving the BLOCK pulls the pipeline, because the pipeline's ordered blockIds is the only
    // statement of what it holds and a block in another project reads there as an id naming nothing.
    const refused = await move(DEFAULT_WORKSPACE, block, { to: ROBOTICS })
    expect(refused.statusCode, refused.body).toBe(409)
    expect(errorOf(refused)).toContain(pipeline)
    expect(errorOf(refused)).toContain('blocks')

    const res = await move(DEFAULT_WORKSPACE, pipeline, { to: ROBOTICS, also: [block] })
    expect(res.statusCode, res.body).toBe(200)
    const report = res.json() as { moving: { id: string; forcedBy: { relation: string } | null }[] }
    expect(report.moving.find((m) => m.id === block)?.forcedBy?.relation).toBe('pipeline')
    expect(workspaceOfRecord(pipeline)).toBe(ROBOTICS)
    expect(workspaceOfRecord(block)).toBe(ROBOTICS)
  })
})

// ================================================================================ seeing it first

describe('seeing the whole consequence before it happens', () => {
  it('reports the plan and writes nothing under dryRun, even when the move needs no companion', async () => {
    const note = await file(DEFAULT_WORKSPACE, 'note', 'Wave 1 closeout', { body: 'what happened' })

    const res = await move(DEFAULT_WORKSPACE, note, { to: PANELX, dryRun: true })
    expect(res.statusCode, res.body).toBe(200)
    const report = res.json() as { dryRun: boolean; rows: { records: number; changes: number }; note: string; moving: unknown[] }
    expect(report.dryRun).toBe(true)
    expect(report.moving).toHaveLength(1)
    // Every number is zero, because nothing was carried. A dry run that reported the counts it WOULD
    // have carried in the same field a real move reports what it DID carry is the fake success this
    // server is written against; the sentence says what would happen instead.
    expect(report.rows).toEqual({ records: 0, links: 0, changes: 0, revisions: 0, resources: 0, intent: 0 })
    expect(report.note).toContain('Nothing was written')
    expect(report.note).toContain('moves alone')
    expect(workspaceOfRecord(note)).toBe(DEFAULT_WORKSPACE)
  })

  it('shows every companion under dryRun without needing `also`', async () => {
    const claim = await file(DEFAULT_WORKSPACE, 'claim', 'A CSS variable on :root is silently invalid', {
      evidence: ['measured on the running page'],
    })
    const note = await file(DEFAULT_WORKSPACE, 'note', 'Wave 1 closeout', { body: 'what happened' })
    await link(DEFAULT_WORKSPACE, note, claim, 'relates_to')

    const res = await move(DEFAULT_WORKSPACE, note, { to: PANELX, dryRun: true })
    expect(res.statusCode, res.body).toBe(200)
    const report = res.json() as { needsAlso: string[]; note: string }
    expect(report.needsAlso).toEqual([claim])
    expect(report.note).toContain(`"also":["${claim}"]`)
    expect(workspaceOfRecord(note)).toBe(DEFAULT_WORKSPACE)
    expect(workspaceOfRecord(claim)).toBe(DEFAULT_WORKSPACE)
  })
})

// ================================================================================ the refusals

describe('what it refuses', () => {
  it('refuses a destination that does not exist, naming how to find one', async () => {
    const note = await file(DEFAULT_WORKSPACE, 'note', 'Wave 1 closeout', { body: 'what happened' })
    const res = await move(DEFAULT_WORKSPACE, note, { to: 'panelxx' })
    expect(res.statusCode, res.body).toBe(404)
    expect(errorOf(res)).toContain('GET /api/workspaces')
    expect(workspaceOfRecord(note)).toBe(DEFAULT_WORKSPACE)
  })

  it('refuses a record this project does not hold', async () => {
    const note = await file(DEFAULT_WORKSPACE, 'note', 'Wave 1 closeout', { body: 'what happened' })
    const res = await move(ROBOTICS, note, { to: PANELX })
    expect(res.statusCode, res.body).toBe(404)
    expect(workspaceOfRecord(note)).toBe(DEFAULT_WORKSPACE)
  })

  /**
   * THIS TEST PINNED THE OPPOSITE RULE UNTIL 17 AUGUST 2026, and the owner is who changed it.
   *
   * It was called "refuses a title the destination already holds, naming both records" and asserted
   * a 409 with the message "A title is unique inside one project". The owner overturned that rule —
   * **ID is identity. Title is presentation. Titles may repeat.** — so a move that lands two records
   * of one name in one project is an allowed move. It is rewritten rather than deleted, because what
   * the test is really about did not change: the person doing the move has to be TOLD.
   */
  it('moves a record whose title the destination already uses, and says what it landed beside', async () => {
    const clash = await file(PANELX, 'note', 'Wave 1 closeout', { body: 'the one already there' })
    const note = await file(DEFAULT_WORKSPACE, 'note', 'Wave 1 closeout', { body: 'the one moving' })
    const res = await move(DEFAULT_WORKSPACE, note, { to: PANELX })
    expect(res.statusCode, res.body).toBe(200)
    // The move happened.
    expect(workspaceOfRecord(note)).toBe(PANELX)
    // And the reply names what it is now sitting beside, by id, with the way to tell them apart.
    const note_ = JSON.parse(res.body).note as string
    expect(note_).toContain(clash)
    expect(note_).toContain('That is allowed')
    expect(note_).toContain('PATCH /api/records/<id> {"title":"…"}')
  })

  it('refuses an agent moving a decision, and refuses it as a companion too', async () => {
    const decision = await file(
      DEFAULT_WORKSPACE,
      'decision',
      'Stay on position control',
      { ...governsTheWholeProject(), replaces: [], because: 'it works', decided_on: '2026-08-11' },
      asHuman(DEFAULT_WORKSPACE),
    )
    const note = await file(DEFAULT_WORKSPACE, 'note', 'Wave 1 closeout', { body: 'what happened' })
    await link(DEFAULT_WORKSPACE, note, decision, 'relates_to')

    const direct = await move(DEFAULT_WORKSPACE, decision, { to: PANELX, also: [note] })
    expect(direct.statusCode, direct.body).toBe(403)

    // And by the side door: an agent naming the NOTE would carry the decision as a companion.
    const sideways = await move(DEFAULT_WORKSPACE, note, { to: PANELX, also: [decision] })
    expect(sideways.statusCode, sideways.body).toBe(403)
    expect(workspaceOfRecord(decision)).toBe(DEFAULT_WORKSPACE)
    expect(workspaceOfRecord(note)).toBe(DEFAULT_WORKSPACE)

    // The human may.
    const allowed = await move(DEFAULT_WORKSPACE, note, { to: PANELX, also: [decision] }, asHuman(DEFAULT_WORKSPACE))
    expect(allowed.statusCode, allowed.body).toBe(200)
    expect(workspaceOfRecord(decision)).toBe(PANELX)
  })

  it('writes nothing and says so when the record is already in the destination', async () => {
    const note = await file(PANELX, 'note', 'Wave 1 closeout', { body: 'what happened' })
    const before = t.client.sqlite.prepare('SELECT count(*) AS n FROM changes').get() as { n: number }
    const res = await move(PANELX, note, { to: PANELX })
    expect(res.statusCode, res.body).toBe(200)
    const report = res.json() as { alreadyThere: boolean; dryRun: boolean; rows: { records: number }; note: string }
    expect(report.alreadyThere).toBe(true)
    expect(report.dryRun).toBe(true)
    expect(report.rows.records).toBe(0)
    expect(report.note).toContain('already in')
    const after = t.client.sqlite.prepare('SELECT count(*) AS n FROM changes').get() as { n: number }
    expect(after.n).toBe(before.n)
  })

  it('refuses an empty `also` rather than reading it as "no companions"', async () => {
    const note = await file(DEFAULT_WORKSPACE, 'note', 'Wave 1 closeout', { body: 'what happened' })
    const res = await move(DEFAULT_WORKSPACE, note, { to: PANELX, also: [] })
    expect(res.statusCode, res.body).toBe(400)
    expect(errorOf(res)).toContain('also is empty')
    expect(workspaceOfRecord(note)).toBe(DEFAULT_WORKSPACE)
  })
})

// ================================================================================ the real shape

describe("the corpus's own shape", () => {
  /**
   * The five records that made the real database unrestorable, rebuilt.
   *
   * A session, a claim, a note, a problem and a proposal in `default`, four of them linked to one
   * module in `panelx` and one to a second module, with the note and the claim also linked to each
   * other inside `default`. The crossing links go in through SQL because the product refuses to make
   * one now — which is exactly how the real ones exist: they were legal when they were written.
   */
  async function realShape(): Promise<{ ids: Record<string, string>; modules: string[] }> {
    const surface = await file(PANELX, 'module', 'Mole Office — the reading surface')
    const attention = await file(PANELX, 'module', 'Mole Office — attention and the anchor')
    const session = await file(DEFAULT_WORKSPACE, 'session', 'overnight campaign', { state: 'running' })
    // The four records that follow are written UNDER that session, the way the real ones were, so
    // their change rows carry its id. That is what makes the stranding a real measurement rather
    // than a query over a column nobody filled.
    const underSession = { ...asAgent(DEFAULT_WORKSPACE), 'x-mole-office-session': session }
    const claim = await file(
      DEFAULT_WORKSPACE,
      'claim',
      'A CSS variable on :root is silently invalid',
      { evidence: ['measured on the running page'] },
      underSession,
    )
    const note = await file(DEFAULT_WORKSPACE, 'note', 'Wave 1 closeout', { body: 'what happened' }, underSession)
    const problem = await file(
      DEFAULT_WORKSPACE,
      'problem',
      'The filled red ground lost its meaning',
      { symptom: 'red everywhere' },
      underSession,
    )
    const proposal = await file(
      DEFAULT_WORKSPACE,
      'proposal',
      'Should a collapsed row tell two people apart?',
      {},
      underSession,
    )
    await link(DEFAULT_WORKSPACE, note, claim, 'relates_to')

    const insert = t.client.sqlite.prepare(
      `INSERT INTO links (owner_id, id, workspace_id, from_id, to_id, type, inferred, created_by, created_at, updated_at) VALUES ('${THE_TEST_OFFICES_OWNER.id}', ?,?,?,?,?,0,?,?,?)`,
    )
    let n = 0
    for (const [from, to] of [
      [session, surface],
      [claim, surface],
      [note, surface],
      [problem, surface],
      [proposal, attention],
    ] as const) {
      n += 1
      insert.run(`old${n}`, DEFAULT_WORKSPACE, from, to, 'about', 'agent:claude-code', '2026-08-11 20:00:00', '2026-08-11 20:00:00')
    }
    return { ids: { session, claim, note, problem, proposal }, modules: [surface, attention] }
  }

  it('starts with exactly the five crossings the real database had', async () => {
    await realShape()
    expect(crossings()).toHaveLength(5)
    for (const c of crossings()) {
      expect(c.from).toBe(DEFAULT_WORKSPACE)
      expect(c.to).toBe(PANELX)
    }
  })

  it('moves all five into panelx and leaves nothing crossing a boundary', async () => {
    const { ids } = await realShape()

    // The session first, so that the change rows of the records that follow name a session already
    // at the destination — see `sessionAttributionNote`. Order is a judgement the verb reports on and
    // does not make.
    for (const [id, also] of [
      [ids.session, undefined],
      [ids.problem, undefined],
      [ids.proposal, undefined],
      [ids.note, [ids.claim]],
    ] as const) {
      const res = await move(DEFAULT_WORKSPACE, String(id), {
        to: PANELX,
        ...(also === undefined ? {} : { also: [...also].map(String) }),
      })
      expect(res.statusCode, res.body).toBe(200)
    }

    expect(crossings()).toEqual([])
    for (const id of Object.values(ids)) expect(workspaceOfRecord(id)).toBe(PANELX)
    const stillInDefault = t.client.sqlite
      .prepare("SELECT count(*) AS n FROM records WHERE workspace_id = ?")
      .get(DEFAULT_WORKSPACE) as { n: number }
    expect(stillInDefault.n).toBe(0)
    // And every change row went with its record, so `default` holds nothing at all.
    const changesLeft = t.client.sqlite
      .prepare('SELECT count(*) AS n FROM changes WHERE workspace_id = ?')
      .get(DEFAULT_WORKSPACE) as { n: number }
    expect(changesLeft.n).toBe(0)
  })

  it('counts the change rows a move leaves naming a session in another project, and calls it the rule', async () => {
    const { ids } = await realShape()
    // Move the SESSION out first while everything it wrote stays behind: the rows keep the id they
    // carry and go on naming the run that really wrote them, which is now a session of another
    // project. It is reported, never refused and never repaired by dragging every record the
    // session ever touched.
    const res = await move(DEFAULT_WORKSPACE, String(ids.session), { to: PANELX })
    expect(res.statusCode, res.body).toBe(200)
    const report = res.json() as { sessionNote: string | null }
    expect(report.sessionNote).not.toBeNull()
    const note = String(report.sessionNote)
    expect(note).toContain('4 change row(s)')
    // The note used to say those rows "will resolve to nothing", which was a description of a
    // defect. Under the rule they resolve to a sentence naming the project the session is in, so
    // the note says what the semantics ARE rather than apologising for them.
    expect(note).not.toContain('resolve to nothing')
    expect(note).toContain('historical provenance, not project ownership')
    expect(note).toContain('POST /api/records/<the session>/workspace')
  })
})

// ======================================================== a session is never carried by a move

/**
 * SESSION ATTRIBUTION IS HISTORICAL PROVENANCE, NOT PROJECT OWNERSHIP.
 *
 * The rule, and the three things it decides. Moving a record changes THAT RECORD'S project and
 * carries the history the record owns; it never moves the session that wrote that history, because
 * a session is a run that happened and re-filing it on the strength of where one of its outputs
 * ended up would be Mole Office deciding, on nobody's authority, that a night's work belongs somewhere
 * else. So a session is never a forced companion, the change rows keep naming it wherever they
 * land, and resolving one of those names must not become a way to read the other project.
 *
 * `src/server/lib/move.ts` states the rule where it is enforced; these are the measurements.
 */

/** Every value the change log holds in its session column for one record's rows. */
const sessionIdsOf = (recordId: string): (string | null)[] =>
  (
    t.client.sqlite.prepare('SELECT session_id AS s FROM changes WHERE record_id = ? ORDER BY at, id').all(recordId) as {
      s: string | null
    }[]
  ).map((r) => r.s)

/** The session column of the one row that records a move. */
const moveRowSessionOf = (recordId: string): string | null =>
  (
    t.client.sqlite
      .prepare("SELECT session_id AS s FROM changes WHERE record_id = ? AND field = 'workspaceId'")
      .get(recordId) as { s: string | null } | undefined
  )?.s ?? null

describe('a session is never a forced companion', () => {
  /** A module and the session that says it is part of it, both in `default`. */
  async function linkedSession(): Promise<{ module: string; session: string; joining: string }> {
    const module = await file(DEFAULT_WORKSPACE, 'module', 'Tray clamp calibration')
    const session = await file(DEFAULT_WORKSPACE, 'session', 'overnight campaign', { state: 'running' })
    const joining = await link(DEFAULT_WORKSPACE, session, module, 'part_of')
    return { module, session, joining }
  }

  it('refuses the move rather than dragging the session across with the record it is linked to', async () => {
    const { module, session, joining } = await linkedSession()

    const res = await move(DEFAULT_WORKSPACE, module, { to: PANELX })
    expect(res.statusCode, res.body).toBe(409)
    const message = errorOf(res)

    // The link is named, so the relationship can be gone and looked at — that is one of the two
    // ways out and it is the only one this verb will not take for you.
    expect(message).toContain(joining)
    expect(message).toContain(session)
    expect(message).toContain('were NOT carried')
    expect(message).toContain('historical provenance, not project ownership')
    // THE ASSERTION THAT WOULD HAVE CAUGHT THE OLD BEHAVIOUR. Before the rule, the session was an
    // ordinary companion and this refusal offered to carry it on confirmation — one `also` away
    // from a run being re-filed under a project it never worked in.
    expect(message).not.toContain(`"also":["${session}"]`)

    expect(workspaceOfRecord(module)).toBe(DEFAULT_WORKSPACE)
    expect(workspaceOfRecord(session)).toBe(DEFAULT_WORKSPACE)
  })

  it('will not carry a session named in `also` either, because confirming it is not the point', async () => {
    const { module, session } = await linkedSession()

    const res = await move(DEFAULT_WORKSPACE, module, { to: PANELX, also: [session] })
    expect(res.statusCode, res.body).toBe(409)
    expect(errorOf(res)).toContain('which nothing forces to move')
    expect(workspaceOfRecord(module)).toBe(DEFAULT_WORKSPACE)
    expect(workspaceOfRecord(session)).toBe(DEFAULT_WORKSPACE)
  })

  it('moves the session when the caller names IT as the record to move, carrying what it is linked to', async () => {
    const { module, session } = await linkedSession()

    // The way out the refusal names. This passes with or without the rule — it is the path a caller
    // is sent down, pinned so the refusal cannot send anyone somewhere that does not work.
    const res = await move(DEFAULT_WORKSPACE, session, { to: PANELX, also: [module] })
    expect(res.statusCode, res.body).toBe(200)
    expect(workspaceOfRecord(session)).toBe(PANELX)
    expect(workspaceOfRecord(module)).toBe(PANELX)
    expect(crossings()).toEqual([])
  })

  it('refuses outright rather than leaving a hole where a pipeline listed a session as a block', async () => {
    // A STATE THE PRODUCT CANNOT PRODUCE, WRITTEN BY HAND — `checkBlockIds` refuses anything but a
    // block — and therefore the one way the rule above could break something quietly: the session
    // would be left behind and the pipeline's order would name a record its own project cannot
    // reach. Neither carrying it nor leaving it is allowed, so this says so instead of choosing.
    const pipeline = await file(DEFAULT_WORKSPACE, 'pipeline', 'The overnight pipeline')
    const session = await file(DEFAULT_WORKSPACE, 'session', 'overnight campaign', { state: 'running' })
    t.client.sqlite
      .prepare('UPDATE records SET data = ? WHERE id = ?')
      .run(JSON.stringify({ blockIds: [session] }), pipeline)

    const res = await move(DEFAULT_WORKSPACE, pipeline, { to: PANELX })
    expect(res.statusCode, res.body).toBe(409)
    const message = errorOf(res)
    expect(message).toContain('Nothing was moved')
    expect(message).toContain(session)
    expect(message).toContain('listed among the blocks of a pipeline')
    expect(workspaceOfRecord(pipeline)).toBe(DEFAULT_WORKSPACE)
    expect(workspaceOfRecord(session)).toBe(DEFAULT_WORKSPACE)
  })

  it('does not walk THROUGH a session to reach the records on its other links', async () => {
    const { module, session } = await linkedSession()
    // A second record joined to the same session and to nothing else. If a session could be a
    // stepping stone, moving the module would reach the session and then this, and a caller who
    // named one record would be handed a stranger's work to confirm.
    const other = await file(DEFAULT_WORKSPACE, 'note', 'a note the run also touched', { body: 'x' })
    await link(DEFAULT_WORKSPACE, session, other, 'relates_to')

    const res = await move(DEFAULT_WORKSPACE, module, { to: PANELX, dryRun: true })
    expect(res.statusCode, res.body).toBe(200)
    const report = res.json() as { moving: { id: string }[]; needsAlso: string[]; note: string }
    expect(report.moving.map((m) => m.id)).toEqual([module])
    expect(report.needsAlso).toEqual([])
    expect(report.note).toContain('AND IT WOULD BE REFUSED')
    expect(report.note).not.toContain(other)
  })
})

describe('the attribution survives the move and stays true', () => {
  it('leaves the session where it is and every change row still naming it', async () => {
    const session = await file(DEFAULT_WORKSPACE, 'session', 'overnight campaign', { state: 'running' })
    const underSession = { ...asAgent(DEFAULT_WORKSPACE), 'x-mole-office-session': session }
    const note = await file(DEFAULT_WORKSPACE, 'note', 'Wave 1 closeout', { body: 'what happened' }, underSession)
    const before = sessionIdsOf(note)
    expect(before.length).toBeGreaterThan(0)
    expect(new Set(before)).toEqual(new Set([session]))

    const res = await move(DEFAULT_WORKSPACE, note, { to: PANELX }, underSession)
    expect(res.statusCode, res.body).toBe(200)

    // The record's history came with it and the run that wrote it did not.
    expect(workspaceOfRecord(note)).toBe(PANELX)
    expect(workspaceOfRecord(session)).toBe(DEFAULT_WORKSPACE)
    // Not blanked, not repointed at something local, not dropped.
    expect(new Set(sessionIdsOf(note))).toEqual(new Set([session]))
    expect(sessionIdsOf(note).length).toBeGreaterThan(before.length)
  })

  it('records the move itself against the run that made it, by record id and not by a name', async () => {
    // A run that writes under its NAME and then files itself, which is how the log comes to hold
    // both spellings. Filing the session binds the name and repoints the rows written before it.
    const underName = { ...asAgent(DEFAULT_WORKSPACE), 'x-mole-office-session': 'baseline' }
    const note = await file(DEFAULT_WORKSPACE, 'note', 'Wave 1 closeout', { body: 'what happened' }, underName)
    const session = await file(
      DEFAULT_WORKSPACE,
      'session',
      'baseline · overnight campaign',
      { state: 'running' },
      underName,
    )
    expect(new Set(sessionIdsOf(note))).toEqual(new Set([session]))

    const res = await move(DEFAULT_WORKSPACE, note, { to: PANELX }, underName)
    expect(res.statusCode, res.body).toBe(200)

    // THE ROW THIS MOVE WRITES IS THE ONE ROW WHOSE PROJECT IS NOT ITS AUTHOR'S. It lands in
    // `panelx` while `baseline` is a run of `default`, so a reference resolved after the record had
    // already moved would answer to nothing there and the row would keep a bare word instead of
    // naming a session. Resolved in the project the caller is working in, it carries the id.
    expect(moveRowSessionOf(note)).toBe(session)
    expect(moveRowSessionOf(note)).not.toBe('baseline')
  })
})

describe('a change row whose session is in another project', () => {
  /**
   * A run in `robotics` that wrote two notes, one of which is then moved into `panelx`.
   *
   * The other note is what the boundary is measured against: it is `robotics` work that a reader in
   * `panelx` has no business reaching, and the only thread from one project to the other is the
   * session id on the moved note's change rows.
   */
  async function movedWork(): Promise<{ session: string; secret: string; secretTitle: string; carried: string }> {
    const session = await file(ROBOTICS, 'session', 'robotics overnight', { state: 'running' })
    const under = { ...asAgent(ROBOTICS), 'x-mole-office-session': session }
    const secretTitle = 'the pinch force table'
    const secret = await file(ROBOTICS, 'note', secretTitle, { body: 'numbers that stay in robotics' }, under)
    const carried = await file(ROBOTICS, 'note', 'Wave 1 closeout', { body: 'what happened' }, under)
    const res = await move(ROBOTICS, carried, { to: PANELX })
    expect(res.statusCode, res.body).toBe(200)
    return { session, secret, secretTitle, carried }
  }

  const changeLog = async (workspaceId: string, query = '') =>
    app.inject({ method: 'GET', url: `/api/changes${query}`, headers: asAgent(workspaceId) })

  it('says which project the session is filed in, instead of that nothing answers to it', async () => {
    const { session } = await movedWork()

    const res = await changeLog(PANELX)
    expect(res.statusCode, res.body).toBe(200)
    const block = (
      res.json() as {
        sessions: {
          stored: string
          recordId: string | null
          title: string | null
          matchedBy: string
          elsewhereIn: string | null
        }[]
      }
    ).sessions
    const entry = block.find((s) => s.stored === session)
    if (entry === undefined) throw new Error(`the session block named ${block.map((s) => s.stored).join(', ')}`)

    // The row is not dropped and its value is not blanked: it still names the run that did the work.
    expect(entry.matchedBy).toBe('elsewhere')
    expect(entry.elsewhereIn).toBe(ROBOTICS)
    // And it is not resolved either, which is the half that keeps the boundary. `recordId` is what
    // a surface makes a link out of, and a link into another project is a link that goes nowhere.
    expect(entry.recordId).toBeNull()
    expect(entry.title).toBeNull()
  })

  it('is reported by the log migration as right already, not as a name nothing answers to', async () => {
    const { session } = await movedWork()
    const sessionsLib = await import('../src/server/lib/sessions.ts')

    const report = sessionsLib.migrateChangeSessions(AGENT, PANELX, { apply: false })
    expect(report.dangling.map((d) => d.name)).not.toContain(session)
    const named = one(report.namedElsewhere, 'reference naming a session in another project')
    expect(named.name).toBe(session)
    expect(named.workspaceId).toBe(ROBOTICS)
    expect(report.note).toContain('another project')
    // Nothing to repair, so nothing is offered: the honest repair for a dangling name is "file the
    // session", and offering it here would be offering to attribute a robotics run to a panelx record.
    expect(report.rowsRepointed).toBe(0)
  })

  it('does not let a reader in one project walk that session into the other one', async () => {
    const { session, secret, secretTitle, carried } = await movedWork()
    const sessionsLib = await import('../src/server/lib/sessions.ts')

    // 1. THE CHANGE LOG. The block names the session and nothing around it.
    const log = await changeLog(PANELX)
    expect(log.body).not.toContain(secret)
    expect(log.body).not.toContain(secretTitle)

    // 2. THE CHANGE LOG, FILTERED BY THAT SESSION. It answers about this project's rows only, and
    // says where the session is rather than that nothing was ever filed under the name.
    const filtered = await changeLog(PANELX, `?session=${session}`)
    expect(filtered.statusCode, filtered.body).toBe(200)
    expect(filtered.body).not.toContain(secret)
    expect(filtered.body).not.toContain(secretTitle)
    const rows = (filtered.json() as { changes: { recordId: string }[]; session: { note: string } }).changes
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.recordId === carried)).toBe(true)
    expect((filtered.json() as { session: { note: string } }).session.note).toContain(ROBOTICS)

    // 3. WHAT THAT SESSION DID, asked from here. Scoped to this project's log, so it reaches the
    // record that came and never the one that stayed.
    const work = sessionsLib.sessionWork(session, PANELX)
    expect(work.ref.matchedBy).toBe('elsewhere')
    expect(work.ref.recordId).toBeNull()
    expect([...work.wrote, ...work.touched].map((r) => r.id)).toEqual([carried])
    expect(work.note).toContain(ROBOTICS)

    // 4. THE SESSION'S OWN PAGE. Not found here, and found where it lives.
    const here = await app.inject({ method: 'GET', url: `/api/sessions/${session}`, headers: asAgent(PANELX) })
    expect(here.statusCode, here.body).toBe(404)
    const there = await app.inject({ method: 'GET', url: `/api/sessions/${session}`, headers: asAgent(ROBOTICS) })
    expect(there.statusCode, there.body).toBe(200)
  })

  it('stops naming a session the moment it leaves, even to a reader that had just read it', async () => {
    // THE LEAK A CACHE MAKES. `resolveSessionRef` remembers a name-to-record answer for the life of
    // the process, keyed by the project it was worked out in. A session can leave that project
    // between two reads — this verb is what moves one — and a cache that answered from memory would
    // hand a reader in the project the session LEFT its id and its title, which is a record that
    // project can no longer open.
    const session = await file(PANELX, 'session', 'panelx overnight', { state: 'running' })
    const under = { ...asAgent(PANELX), 'x-mole-office-session': session }
    await file(PANELX, 'note', 'Wave 1 closeout', { body: 'what happened' }, under)

    const namedBefore = (
      (await changeLog(PANELX)).json() as { sessions: { stored: string; recordId: string | null }[] }
    ).sessions.find((s) => s.stored === session)
    expect(namedBefore?.recordId).toBe(session)

    const res = await move(PANELX, session, { to: ROBOTICS })
    expect(res.statusCode, res.body).toBe(200)

    const after = (
      (await changeLog(PANELX)).json() as {
        sessions: { stored: string; recordId: string | null; title: string | null; elsewhereIn: string | null }[]
      }
    ).sessions.find((s) => s.stored === session)
    expect(after?.recordId).toBeNull()
    expect(after?.title).toBeNull()
    expect(after?.elsewhereIn).toBe(ROBOTICS)
  })
})
