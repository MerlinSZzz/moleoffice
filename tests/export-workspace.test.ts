// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The installation-level fixture now includes an inventoried historical finish; all scoped archive and exhaustive row assertions remain. */
/**
 * ONE PROJECT'S ARCHIVE: exported on its own, and restored on its own into a database that already
 * holds another.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PER-PROJECT ARCHIVE HAS TO BE
 * ---------------------------------------------------------------------------------------
 *
 * Not a filtered view of the installation's archive — a SELF-CONTAINED one. It declares the
 * workspace its rows name, so an importer never has to invent a project; it holds that project's
 * rows and no others; and restoring it must leave the other projects in the target database
 * exactly as they were. A "per-project export" that quietly carried a neighbour's records, or that
 * restored by wiping what it did not mention, would be worse than not having one: the whole reason
 * to want it is to hand one project over without handing over the other.
 *
 * ---------------------------------------------------------------------------------------
 * AND WHAT MUST NOT HAPPEN TO THE INSTALLATION'S ARCHIVE
 * ---------------------------------------------------------------------------------------
 *
 * `writeExport` PRUNES: it deletes files under `records/`, `changes/` and `layouts/` that the
 * current export no longer produces. That is not tidiness, it is what stops a deleted record
 * coming back from the dead on the next import. So writing one project into the shared directory
 * would delete every other project's file and report the deletions as a successful export. The
 * destination test below is the whole reason `workspaceExportRoot` exists, and it is measured
 * rather than asserted from the code's shape.
 */

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')
type WorkspaceLib = typeof import('../src/server/lib/workspaces.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let source: TestDb
let target: TestDb
/** The whole installation, and the robotics project on its own. */
let whole: string
let scoped: string
let ids: Record<string, string> = {}

/** Every file under a directory, as a set of relative paths. */
function tree(root: string): Set<string> {
  const out = new Set<string>()
  const visit = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(join(dir, entry.name), `${prefix}${entry.name}/`)
      else out.add(`${prefix}${entry.name}`)
    }
  }
  visit(root, '')
  return out
}

beforeAll(async () => {
  whole = mkdtempSync(join(tmpdir(), 'mole-office-whole-'))
  scoped = mkdtempSync(join(tmpdir(), 'mole-office-scoped-'))

  source = await freshDb()
  const workspaces = (await import('../src/server/lib/workspaces.ts')) as WorkspaceLib
  workspaces.createWorkspace({ id: 'robotics', title: 'Robotics', note: 'the arm' })
  workspaces.createWorkspace({ id: 'panelx', title: 'Mole Office', note: 'this product' })

  // Two projects, each with a record, a link of its own, and a change row behind both.
  const gripper = source.api.createRecord({ workspaceId: 'robotics', kind: 'module', title: 'Tray clamp', actor: HUMAN })
  const calib = source.api.createRecord({
    workspaceId: 'robotics',
    kind: 'claim',
    title: '夹爪在 effort 13 时夹得住',
    data: { state: 'measured', evidence: ['n=40'] },
    actor: HUMAN,
  })
  const exporter = source.api.createRecord({ workspaceId: 'panelx', kind: 'module', title: 'The export', actor: HUMAN })
  const format = source.api.createRecord({
    workspaceId: 'panelx',
    kind: 'decision',
    title: 'The archive is text, not a database file',
    data: { decided_on: '2026-08-10', because: 'text outlives the program that wrote it' },
    actor: HUMAN,
  })
  ids = { gripper: gripper.id, calib: calib.id, exporter: exporter.id, format: format.id }

  source.api.createLink({ fromId: calib.id, toId: gripper.id, type: 'relates_to', actor: HUMAN })
  source.api.createLink({ fromId: format.id, toId: exporter.id, type: 'relates_to', actor: HUMAN })

  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  exportLib.writeExport(whole)
  exportLib.writeExport(scoped, { workspaceId: 'robotics' })

  // A SECOND database that already holds the OTHER project, so the restore has something to leave
  // alone. Restoring into an empty database would prove only that rows can be written.
  target = await freshDb()
  const targetWorkspaces = (await import('../src/server/lib/workspaces.ts')) as WorkspaceLib
  targetWorkspaces.createWorkspace({ id: 'panelx', title: 'Mole Office', note: 'this product' })
  const alreadyHere = target.api.createRecord({
    workspaceId: 'panelx',
    kind: 'module',
    title: 'Something already here',
    actor: HUMAN,
  })
  ids['alreadyHere'] = alreadyHere.id
  const importLib = (await import('../src/server/lib/import.ts')) as ImportLib
  importLib.applyImport(scoped)
})

afterAll(() => {
  source.close()
  target.close()
  for (const dir of [whole, scoped]) rmSync(dir, { recursive: true, force: true })
})

// ================================================================================ what it holds

describe('a project archive holds one project and declares it', () => {
  it('carries that project\'s records and none of the other\'s', () => {
    const files = tree(scoped)
    expect([...files].some((f) => f.includes(ids['gripper'] ?? 'nothing'))).toBe(true)
    expect([...files].some((f) => f.includes(ids['exporter'] ?? 'nothing'))).toBe(false)
    // And the whole-installation archive really does hold both, so the comparison above is about
    // scoping rather than about an export that produced nothing.
    const all = tree(whole)
    expect([...all].some((f) => f.includes(ids['gripper'] ?? 'nothing'))).toBe(true)
    expect([...all].some((f) => f.includes(ids['exporter'] ?? 'nothing'))).toBe(true)
  })

  it('declares its own workspace row, so an importer never has to invent one', () => {
    const text = readFileSync(join(scoped, 'workspaces.md'), 'utf8')
    expect(text).toContain('id: "robotics"')
    // NOT the other project's. An archive that declared every workspace would announce projects it
    // holds nothing of, and a restore would create them empty.
    expect(text).not.toContain('id: "panelx"')
    expect(text).toContain('THIS ARCHIVE HOLDS ONE PROJECT')
  })

  it('says which archive it is on the manifest line an importer reads first', () => {
    expect(readFileSync(join(scoped, 'MANIFEST.md'), 'utf8')).toContain('workspace: "robotics"')
    // The two are the same format and restore into different states, so `null` is stated rather
    // than left out — an absent key and "the whole installation" must not look identical.
    expect(readFileSync(join(whole, 'MANIFEST.md'), 'utf8')).toContain('workspace: null')
  })

  it('carries the workspace on every change row, including the null that means nobody can say', () => {
    const days = readdirSync(join(scoped, 'changes'))
    expect(days.length, 'no change files, so this proves nothing').toBeGreaterThan(0)
    const text = days.map((d) => readFileSync(join(scoped, 'changes', d), 'utf8')).join('\n')
    expect(text).toContain('workspaceId: "robotics"')
    expect(text).not.toContain('workspaceId: "panelx"')
  })
})

// ================================================================================ the destination

describe('a project archive is written beside the installation\'s, never into it', () => {
  it('names a different directory', async () => {
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    exportLib.useExportRoot('/tmp/mole-office-example/mirror')
    expect(exportLib.workspaceExportRoot('robotics')).toBe('/tmp/mole-office-example/mirror-robotics')
    expect(exportLib.workspaceExportRoot('robotics')).not.toBe(exportLib.exportRoot())
    exportLib.useExportRoot(whole)
  })

  it('MEASURED: writing one project into the installation\'s directory would delete the rest of it', async () => {
    // The reason the destination is not a parameter, taken as a measurement rather than asserted
    // from the shape of the code. A copy of the whole archive is written to a scratch directory,
    // then ONE project is exported over the top of it, and what `writeExport` removes is counted.
    const clash = mkdtempSync(join(tmpdir(), 'mole-office-clash-'))
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    exportLib.writeExport(clash)
    const before = tree(clash).size
    const report = exportLib.writeExport(clash, { workspaceId: 'robotics' })
    expect(before, 'the whole archive was empty, so there was nothing to lose').toBeGreaterThan(0)
    expect(
      report.removed.length,
      'exporting one project over the installation\'s archive removed nothing, so the separate ' +
        'destination is guarding against something that does not happen — check writeExport still prunes',
    ).toBeGreaterThan(0)
    // Specifically, the OTHER project's record file is gone. Named from the target database,
    // which is the one open by the time this runs — `freshDb()` in beforeAll pointed the module
    // registry at it, so `writeExport` here archives the target and not the source.
    expect(report.removed.some((p) => p.includes(ids['alreadyHere'] ?? 'nothing'))).toBe(true)
    rmSync(clash, { recursive: true, force: true })
  })
})

// ================================================================================ the restore

describe('a project archive restores on its own, beside a project it says nothing about', () => {
  it('brings that project\'s records back, text and all', () => {
    const rows = target.client.sqlite
      .prepare('SELECT id, title, workspace_id FROM records WHERE workspace_id = ? ORDER BY title')
      .all('robotics') as { id: string; title: string; workspace_id: string }[]
    expect(rows.map((r) => r.title)).toEqual(['Tray clamp', '夹爪在 effort 13 时夹得住'])
    expect(rows.map((r) => r.id).sort()).toEqual([ids['gripper'], ids['calib']].sort())
  })

  it('establishes the workspace it declares, with the note the archive carried', () => {
    const row = target.client.sqlite.prepare('SELECT id, title, note FROM workspaces WHERE id = ?').get('robotics') as
      | { id: string; title: string; note: string | null }
      | undefined
    expect(row).toEqual({ id: 'robotics', title: 'Robotics', note: 'the arm' })
  })

  it('leaves the other project in the target database exactly as it was', () => {
    // THE POINT OF THE WHOLE EXERCISE. A restore that treated "not in this archive" as "delete it"
    // would hand one project over by destroying the other.
    const rows = target.client.sqlite
      .prepare('SELECT title FROM records WHERE workspace_id = ?')
      .all('panelx') as { title: string }[]
    expect(rows.map((r) => r.title)).toEqual(['Something already here'])
  })

  it('brings the links of that project back, and only those', () => {
    const rows = target.client.sqlite.prepare('SELECT workspace_id FROM links').all() as { workspace_id: string }[]
    expect(rows.length).toBe(1)
    expect(rows.every((r) => r.workspace_id === 'robotics')).toBe(true)
  })
})

// ================================================================================ the refusals

describe('the boundary survives the round trip rather than being restored across', () => {
  it('refuses an archive holding a link whose two ends are in different projects', async () => {
    // Hand-edited, or written by a Mole Office from before the boundary existed. The importer checked
    // that both ends EXIST and never that they belonged together, so without this the violation
    // survives a restore and is afterwards indistinguishable from a link somebody meant.
    const forged = mkdtempSync(join(tmpdir(), 'mole-office-forged-'))
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    exportLib.writeExport(forged)

    const file = join(forged, 'records', 'claim', `${ids['calib']}.md`)
    const text = readFileSync(file, 'utf8')
    expect(text).toContain(`toId: "${ids['gripper']}"`)
    // Repoint the link at the OTHER project's record — one that IS in this archive, so the far end
    // exists and the only thing wrong with the link is the boundary it crosses. Pointing it at a
    // record that is nowhere would be refused by the dangling-reference check instead, and would
    // prove nothing about the workspace rule.
    const { writeFileSync } = await import('node:fs')
    writeFileSync(file, text.replace(`toId: "${ids['gripper']}"`, `toId: "${ids['alreadyHere']}"`), 'utf8')

    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib
    const plan = importLib.planImport(forged)
    expect(plan.ok, 'a cross-project link was accepted by the importer').toBe(false)
    const said = plan.refusals.map((r) => r.problem).join('\n')
    expect(said).toContain('different projects')
    expect(said).toContain('robotics')
    expect(said).toContain('panelx')
    rmSync(forged, { recursive: true, force: true })
  })

  it('refuses a row filed behind a workspace the archive never declares', async () => {
    const orphaned = mkdtempSync(join(tmpdir(), 'mole-office-orphan-'))
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    exportLib.writeExport(orphaned, { workspaceId: 'robotics' })

    const file = join(orphaned, 'records', 'module', `${ids['gripper']}.md`)
    const { writeFileSync } = await import('node:fs')
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('workspaceId: "robotics"', 'workspaceId: "the-slam-project"'),
      'utf8',
    )

    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib
    const plan = importLib.planImport(orphaned)
    // `workspace_id` is not a declared foreign key, so SQLite would have accepted this and left a
    // row every scoped read skips — present in the table, reachable by nothing.
    expect(plan.ok).toBe(false)
    expect(plan.refusals.map((r) => r.problem).join('\n')).toContain('the-slam-project')
    rmSync(orphaned, { recursive: true, force: true })
  })

  it('refuses to export a project that does not exist rather than writing an empty archive', async () => {
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    // "This project holds nothing" and "there is no such project" are different answers, and only
    // one of them is a reason to go looking for your work.
    expect(() => exportLib.buildExport({ workspaceId: 'the-slam-project' })).toThrow(/no workspace called/i)
  })
})

// ================================================================================ not vacuous

describe('the comparisons above looked at something', () => {
  it('the source database really held two projects with rows in both', () => {
    const rows = source.client.sqlite
      .prepare('SELECT workspace_id AS w, count(*) AS n FROM records GROUP BY 1 ORDER BY 1')
      .all() as { w: string; n: number }[]
    expect(rows).toEqual([
      { w: 'panelx', n: 2 },
      { w: 'robotics', n: 2 },
    ])
  })

  it('the scoped archive is smaller than the whole one, and neither is empty', () => {
    const a = tree(scoped).size
    const b = tree(whole).size
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    expect(statSync(join(scoped, 'MANIFEST.md')).size).toBeGreaterThan(0)
  })
})

// ================================================================ what it says it does NOT carry

/**
 * A PROJECT ARCHIVE CANNOT CARRY THE PLAN, AND MUST NOT READ AS THOUGH THERE ISN'T ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, 2026-08-12
 * ---------------------------------------------------------------------------------------
 *
 * A scoped archive of a database holding one allocation, one capacity row, one draft and one
 * recurrence contained, in its own files:
 *
 *     drafts.md      "Nothing has been drafted."
 *     recurring.md   "Nothing recurs."
 *     plan.md        "Nothing is planned. No time has been committed to anything"
 *     MANIFEST.md    planning_drafts: 0, planning_recurrences: 0, allocations: 0, planning_capacity: 0
 *
 * and, two paragraphs above the third of those, plan.md's own claim that a project-scoped archive
 * "carries none of this **and says so in its notes**". The note named two of the four tables,
 * because it was built from two hard-coded `SELECT count(*)` queries written when there were two,
 * and migrations 0008 and 0009 added the other two without touching it. Four files said an
 * absence; one report line said a partial truth; nothing said what was actually missing.
 *
 * ---------------------------------------------------------------------------------------
 * SO EVERY LIST HERE IS READ FROM THE SCHEMA, AND THE FIXTURE IS WHAT MAKES THAT MEAN ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * `PERSON_LEVEL_TABLES` is derived from which tables carry a `workspaceId`, and both the archive and
 * these tests read it. That is only half the guard: a table can be named in every note and covered
 * by no row, and then each assertion below is about a count of zero. So the fixture writes one row
 * into every one of them and the first test proves it did — added on 16 August 2026, when round five
 * made `planning_intents` the seventh person-level table and the eighteenth authored one. The
 * archive already reported it, because it reads the schema; this fixture did not, so four
 * assertions here were being made about an empty table.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS SUITE HAS ITS OWN DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * An allocation needs an ALLOCATABLE record to name — a task, not a module — and the fixture above
 * is asserted on record for record by the restore tests. Adding one there would have made those
 * assertions about this test's fixture. This block builds its own, so the two cannot interfere.
 */
describe('a project archive states what it cannot carry, with the numbers', () => {
  let planning: TestDb
  let onlyRobotics: string
  let everything: string
  let report: { notes: string[]; counts: Record<string, number> }

  beforeAll(async () => {
    onlyRobotics = mkdtempSync(join(tmpdir(), 'mole-office-plan-scoped-'))
    everything = mkdtempSync(join(tmpdir(), 'mole-office-plan-whole-'))

    planning = await freshDb()
    const workspaces = (await import('../src/server/lib/workspaces.ts')) as WorkspaceLib
    workspaces.createWorkspace({ id: 'robotics', title: 'Robotics', note: 'the arm' })
    const task = planning.api.createRecord({
      workspaceId: 'robotics',
      kind: 'task',
      title: 'Recalibrate the gripper',
      actor: HUMAN,
    })

    // ONE ROW IN EVERY PERSON-LEVEL TABLE, through the product's own write paths.
    const plan = (await import('../src/server/lib/planning.ts')) as typeof import('../src/server/lib/planning.ts')
    plan.createAllocation({ horizon: 'week', period: '2026-W36', recordId: task.id, plannedHours: 4 }, HUMAN)
    plan.setCapacity('week', '2026-W36', 22, 'three teaching days', HUMAN)
    plan.createRecurrence({ recordId: task.id, every: 'weekdays', days: '1,3,5', hoursEach: 0.5 }, HUMAN)
    // WHAT SOMEBODY WROTE ABOUT TIME is person-level for the same reason the hours are: a week of
    // intentions spans every project. Added by migration 0020, so it is the newest of these tables
    // and the one a fixture written before it would silently not cover. The words are kept and
    // nothing is read from them, which is the ordinary shape of a row here.
    plan.createIntent({ said: 'sometime next week, when the rig is free', recordId: task.id }, HUMAN)
    // WHEN SOMEBODY MEANS TO WORK ON IT, which is person-level for the same reason and carries no
    // hours at all. Added by migration 0040, so it is the newest of these tables and the one a
    // fixture written before it would silently not cover.
    const windows = (await import('../src/server/lib/windows.ts')) as typeof import('../src/server/lib/windows.ts')
    windows.createWindow({ recordId: task.id, startsOn: '2026-08-27', endsOn: '2026-09-02' }, HUMAN)
    // A plan and its lines are person-level too: writing spans projects exactly as hours do.
    const plans = (await import('../src/server/lib/plans.ts')) as typeof import('../src/server/lib/plans.ts')
    // Exactly one plan, and one reason on record: `plan_line_revisions`, added by migration 0170 for
    // criterion P3, is person-level for the same reason, and the assertions below read its real count.
    const onePlan = plans.createPlan({ title: 'ICRA submission, written out', body: '- baseline' }, HUMAN)
    plans.addLine(
      onePlan.plan.id,
      { text: '- a line added with its reason', reason: 'the fixture needs one reason on record' },
      HUMAN,
    )

    // ONE DURABLE AGENT, THROUGH THE PRODUCT'S OWN DOOR, which is what fills three of the four
    // registry tables at once: writing the record gives it a registry row, the picture drawn for that
    // row, and the mapping saying which registry agent the record is. `people` and the owner's own
    // picture are already there, written by the migration.
    planning.api.createRecord({
      workspaceId: 'robotics',
      kind: 'agent',
      title: 'Round ten',
      data: { handle: 'round-ten', runtime: 'claude-code', state: 'active' },
      actor: HUMAN,
    })

    // A saved scene and appearance belong to the installation, so a scoped archive must explain their omission.
    const pixel = await import('../src/server/lib/pixel-office.ts')
    const pixelChoices = await import('../src/shared/pixel-office.ts')
    pixel.changePixelAppearance('round-ten', pixelChoices.generatePixelAppearance('scoped-export-appearance'), HUMAN)
    pixel.changePixelSettings({ motion: false }, HUMAN)
    // AND ONE MODEL SET ON THE SETTINGS PAGE, criterion U2, migration 0176. It is person-level: the one
    // row belongs to the whole installation, so a project archive cannot carry it honestly.
    const runModelStore = await import('../src/server/lib/run-models.ts')
    runModelStore.setTheRunModels({ places: { conversation: { runtime: 'claude-code', model: 'the-scoped-export-fixture-model' } } }, HUMAN)
    // AND ONE CASTING, migration 0190. The table belongs to the whole
    // installation, so a project archive cannot carry it or its history either.
    // THE ROLE CARDS ARE READ ONCE, as buildApp reads them, because the Casting writer checks the role against them.
    const roleCards = await import('../src/server/lib/roles.ts')
    if (!roleCards.theRoleCardsAreRead()) {
      const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
      roleCards.readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
    }
    const castingStore = await import('../src/server/lib/casting.ts')
    castingStore.addACasting('worker', { project: null, cells: { model: { value: 'the-scoped-export-fixture-model', decision: null } } }, HUMAN)
    // AND ONE CASTING LABEL, migration 0349. A label and its history are person-level for the same
    // reason as the Casting row above: the labels are one list for the whole installation, so a
    // project archive cannot carry either table honestly.
    const castingLabels = await import('../src/server/lib/casting-labels.ts')
    castingLabels.addACastingLabel({ name: 'the-scoped-export-fixture-label' }, { by: { kind: 'human', id: HUMAN.id }, authority: null })
    // AND ONE ROW IN EACH OF MIGRATION 0189'S TWO TABLES, which migration 0190 kept as they were and nothing in the product
    // writes since. A database made before 0190 may hold such rows, so the archive must still carry them. Written in 0189's
    // shape, by hand, because no product path remains; the model is the fixture's own.
    planning.client.sqlite.prepare(
      `INSERT INTO casting (role, project, model, model_from, changed_at, changed_by_kind, changed_by_id) VALUES ('secretary', '', 'the-0189-fixture-model', ?, '2026-09-29 10:00:00', 'human', '${THE_TEST_OFFICES_OWNER.id}')`,
    ).run(JSON.stringify({ at: '2026-09-29 10:00:00', by: { kind: 'human', id: THE_TEST_OFFICES_OWNER.id }, decision: null, moved: false }))
    planning.client.sqlite.prepare(
      `INSERT INTO casting_changes (role, project, at, by_kind, by_id, decisions, after) VALUES ('secretary', '', '2026-09-29 10:00:00', 'human', '${THE_TEST_OFFICES_OWNER.id}', '[]', '{}')`,
    ).run()
    // AND ONE DIRECTORY ADDED BY HAND AS A PREVIEW ROOT, criterion U4, migration 0165. It is
    // person-level for the same reason: the one row's JSON is keyed by project, so a project archive
    // cannot carry the list honestly.
    const previewRoots = await import('../src/server/lib/preview-roots.ts')
    previewRoots.addPreviewRoot({ path: process.cwd(), why: 'the scoped-export fixture adds one by hand' }, 'robotics', HUMAN)
    // AND A PRICE TABLE, criterion U3, migration 0177. One row for the whole installation, so a
    // project archive cannot carry it either.
    const prices = await import('../src/server/lib/price-table.ts')
    prices.setThePriceTable({ currency: 'GBP', prices: { 'scoped-export-model': { input: 3, output: 15, cachedInput: 0.3 } } }, HUMAN)
    // AND ONE ROW OF SAVED MAP POSITIONS, migration 0151. The older built-in map that wrote them was deleted in wave 13y
    // round 119 and nothing in the product writes them since, but a database may hold such rows, so the archive must
    // still explain their omission. Written by hand in 0151's shape; every value is made up.
    planning.client.sqlite.prepare('INSERT INTO office_map_layouts (configuration_key, data, updated_at) VALUES (?,?,?)').run(
      JSON.stringify([1, 'shared']),
      JSON.stringify({ version: 1, seed: 'scoped-export-scene', grouping: 'shared', regions: [], assignments: {}, roads: [] }),
      '2026-11-01 12:00:00',
    )

    // AND ONE WORLD, through the door a server start calls. A world belongs to no project because it
    // holds every project it has, so the office is person-level in the sense this block means.
    const office = (await import('../src/server/lib/office.ts')) as typeof import('../src/server/lib/office.ts')
    office.registerWorldHere({
      name: 'my world',
      kind: 'home',
      startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      checkout: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
      head: '905d1df',
      databaseIdentity: 'c'.repeat(16),
      address: 'http://127.0.0.1:41300',
      addressForOtherMachines: null,
      standing: 'canonical',
      parentWorld: null,
      installation: 'the-installation-this-fixture-belongs-to',
    })

    // AND ONE VISIT, through the door entering a world calls. A visit is about two worlds rather than
    // about any project inside either, so it is person-level in the sense this block means.
    const visitsLib = (await import('../src/server/lib/visits.ts')) as typeof import('../src/server/lib/visits.ts')
    visitsLib.registerVisitHere({
      visitor: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      fromWorld: 'c'.repeat(16),
      toWorld: 'd'.repeat(16),
      why: 'reading what the agent built',
    })

    // AND ONE VISITING AGENT'S CREDENTIAL, WITH ONE REQUEST UNDER IT, through the doors the Embassy
    // and the credential gate call. A credential is held against the whole installation rather than
    // against one project — an agent that visits does not visit one project — so both tables are
    // person-level in the sense this block means. Criteria P24 to P30.
    const visitorsLib = (await import('../src/server/lib/visitors.ts')) as typeof import('../src/server/lib/visitors.ts')
    const issued = visitorsLib.issueACredential({
      handle: 'a-worker-on-another-machine',
      name: 'A worker on another machine',
      role: 'worker',
      world: null,
      machine: 'a-machine.example',
      machineHow: 'an address',
      facts: {
        conversationPath: '/transcripts/another-machine/4f10',
        startDirectory: '/work/another-machine',
        runtime: 'claude-code',
        sessionRecord: null,
      },
    })
    visitorsLib.recordARequestUnder(issued.credential.id, {
      method: 'GET',
      route: '/api/agent/runs',
      operation: 'agent.runs',
      wrote: false,
      refusedBecause: null,
      mismatch: [],
      fromATrustedMachine: null,
    })

    // AND ONE MACHINE THIS OFFICE TRUSTS, through the press at the world's page. Which machines an
    // office trusts belongs to the installation and to no project, for the same reason the
    // credential above does — a machine is not trusted for one project's work and refused for
    // another — so it is person-level in the sense this block means. Criterion P73.
    const trustedLib = (await import('../src/server/lib/trustedmachines.ts')) as typeof import('../src/server/lib/trustedmachines.ts')
    trustedLib.trustThisMachine('a-machine.example', { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, 'a press', 'the other box', null)

    // AND ONE HOLD ON AN AGENT HANDLE, through the door a session's waiter calls. Which session is
    // answering as a durable agent is a fact about the agent and the machine rather than about any
    // one project — the registries these name belong to the installation — so it is person-level in
    // the sense this block means, and a project-scoped archive carries none of it.
    const handlesLib = (await import('../src/server/lib/handles.ts')) as typeof import('../src/server/lib/handles.ts')
    const terminal = planning.api.createRecord({
      workspaceId: 'robotics',
      kind: 'session',
      title: 'The terminal that was answering as round-ten',
      data: { state: 'finished', runtime: 'claude-code' },
      actor: HUMAN,
    })
    // Explicit historical inventory gives every new installation-level evidence table a real fixture row.
    planning.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(terminal.id)
    handlesLib.holdTheHandle({
      handle: 'round-ten',
      session: terminal.id,
      machine: 'a-machine',
      runtime: 'claude-code',
      workspaceId: 'robotics',
    })

    // AND ONE CONTACT GROUP THE OWNER MADE, WITH SOMEBODY IN IT. How the owner has arranged their contacts belongs
    // to the owner and to the installation — which group an agent is in is a fact about the agent — so it
    // is person-level in the sense this block means, and a project-scoped archive carries none of it.
    const contactsLib = (await import('../src/server/lib/contacts.ts')) as typeof import('../src/server/lib/contacts.ts')
    const arranger = { kind: 'person' as const, id: THE_TEST_OFFICES_OWNER.id }
    const made = contactsLib.makeAContactGroup(arranger, 'Verifiers', 'agent')
    contactsLib.moveAContact(
      arranger,
      [{ key: 'agent:a-verifier', kind: 'agent', id: 'a-verifier', role: 'worker', retired: false }],
      'agent:a-verifier',
      made.key,
    )
    // AND ONE FOLD, so `contact_group_collapses` has a row and the archive's note about
    // person-level tables is about a thing the fixture really wrote. Criterion M121.
    contactsLib.setAContactGroupCollapsed(arranger, 'retired', false)

    // AND A PERMANENT RESIDENT'S LEAVE, VOID MARK AND WRITE, one row each, so the three tables the residents'
    // migration adds have rows. Written straight into the tables: the fixture is about what an archive carries.
    {
      const someAgent = (planning.client.sqlite.prepare('SELECT id FROM agents ORDER BY id LIMIT 1').get() as { id: string }).id
      planning.client.sqlite.prepare("INSERT INTO resident_read_grants (id, resident_id, reader_id, until, given_at, given_by_kind, given_by_id) VALUES ('grant-1', ?, ?, '2099-01-01 12:00:00', '2026-09-16 10:00:00', 'agent', ?)").run(someAgent, someAgent, someAgent)
      planning.client.sqlite.prepare(`INSERT INTO resident_void_marks (id, resident_id, path, because, marked_at, marked_by_kind, marked_by_id) VALUES ('void-1', ?, 'memory/a.md', 'A made-up reason.', '2026-09-16 10:00:00', 'person', '${THE_TEST_OFFICES_OWNER.id}')`).run(someAgent)
      planning.client.sqlite.prepare("INSERT INTO resident_space_writes (id, resident_id, path, bytes, sha256, written_at, written_by_kind, written_by_id) VALUES ('write-1', ?, 'memory/a.md', 3, 'abc', '2026-09-16 10:00:00', 'agent', ?)").run(someAgent, someAgent)
      planning.client.sqlite.prepare("INSERT INTO resident_sleeps (id, agent_id, what, began_at, ended_at, because, by_kind, by_id, session_id) VALUES ('sleep-1', ?, 'slept', '2026-09-16 22:00:00', '2026-09-17 06:00:00', 'A made-up night.', 'agent', ?, NULL)").run(someAgent, someAgent)
    }

    // AND ONE ASK FOR A QUICK INPUT, migration 0272, so `quick_input_asks` has a row. An ask is for one agent's terminal
    // and the list it is checked against is the owner's for the whole installation, so both tables are person-level in
    // the sense this block means; the list's row is the one the migration writes. Written straight into the table, like
    // the residents' rows above; the run and the terminal are made up for the fixture.
    {
      const someAgent = (planning.client.sqlite.prepare('SELECT id FROM agents ORDER BY id LIMIT 1').get() as { id: string }).id
      planning.client.sqlite.prepare("INSERT INTO quick_input_asks (id, at_ms, agent_id, run, terminal, input, outcome, says, asked_by_kind, asked_by_id, proved_by) VALUES ('ask-1', 1789552800000, ?, 'a-made-up-run', 'a-made-up-terminal', '/context', 'typed', 'A made-up sentence.', 'agent', ?, 'an-agent-key')").run(someAgent, someAgent)
    }

    // The saved runtime choice and restart grant belong to the installation too. These made-up rows
    // keep the unchanged "every person-level table" checks about real fixture data, not empty tables.
    planning.client.sqlite.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)').run('MOLE_OFFICE_REPLY_REMINDER_MINUTES', '9')
    const grantedTo = (planning.client.sqlite.prepare('SELECT id FROM agents ORDER BY id LIMIT 1').get() as { id: string }).id
    const grantDecision = planning.api.createRecord({
      workspaceId: 'robotics', kind: 'decision', title: 'A made-up grant to restart the test office',
      data: { decided_on: '2026-10-12', because: 'The archive fixture needs one restart grant.' }, actor: HUMAN,
    })
    planning.client.sqlite.prepare('INSERT INTO office_restart_grants (agent_id, decision_id) VALUES (?, ?)').run(grantedTo, grantDecision.id)

    // AND ONE DOOR THE PERSON CHANGED IN WHAT THEIR GRANT CARRIES, migration 0287, so `what_the_grant_carries` has a row.
    // It is the office's and names no project, so it is person-level in the sense this block means. Written straight
    // into the table, like the residents' rows above; the answer and when it was changed are made up for the fixture.
    planning.client.sqlite.prepare(`INSERT INTO what_the_grant_carries (door, answer, updated_at, updated_by_kind, updated_by_id) VALUES ('office.set-quick-inputs', 'may-press', '2026-09-16 10:00:00', 'human', '${THE_TEST_OFFICES_OWNER.id}')`).run()

    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    exportLib.writeExport(everything)
    report = exportLib.writeExport(onlyRobotics, { workspaceId: 'robotics' })
  })

  afterAll(() => {
    planning.close()
    for (const dir of [onlyRobotics, everything]) rmSync(dir, { recursive: true, force: true })
  })

  /** Every file of the scoped archive, joined, which is all a person opening it can read. */
  /** How many rows the fixture database really holds in one table. Read, never typed. */
  function held(table: string): number {
    return (planning.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
  }

  function scopedText(): string {
    return [...tree(onlyRobotics)]
      .sort()
      .map((f) => readFileSync(join(onlyRobotics, ...f.split('/')), 'utf8'))
      .join('\n')
  }

  it('the fixture really has a row in every person-level table', async () => {
    // Not vacuous, and DERIVED: a fifth person-level table added to the schema and not given a row
    // here fails this rather than quietly making the four tests below prove less than they say.
    const { PERSON_LEVEL_TABLES } = await import('../src/server/db/authored-table-of.ts')
    expect(PERSON_LEVEL_TABLES.length).toBeGreaterThan(0)
    for (const table of PERSON_LEVEL_TABLES) {
      const n = (
        planning.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }
      ).n
      expect(n, `${table} has no rows, so nothing below is about it`).toBeGreaterThan(0)
    }
  })

  it('names every person-level table in its notes, with the count the database holds', async () => {
    const { PERSON_LEVEL_TABLES } = await import('../src/server/db/authored-table-of.ts')
    const said = report.notes.join('\n')
    for (const table of PERSON_LEVEL_TABLES) {
      expect(said, `the archive's notes say nothing about ${table}`).toContain(table)
      // THE NUMBER THE DATABASE REALLY HOLDS, read here rather than typed. It was typed as `1`, which
      // was true while every person-level table was one this fixture wrote exactly one row into; the
      // registries arrived with the migration writing rows of their own, and a hard-coded 1 would
      // then be asserting that the notes report the wrong number.
      expect(said, `the notes do not say how many ${table} rows were left behind`).toContain(
        `${String(held(table))} ${table}`,
      )
    }
    expect(said).toContain('NOT in this archive')
  })

  it('does not claim the plan is empty on the pages where those rows would be', async () => {
    // The three sentences, verbatim. Each was printed by a scoped archive over a database that had
    // rows, and each is the false one — so their absence here is the fix, and their presence is the
    // defect coming back.
    const text = scopedText()
    expect(text).not.toContain('Nothing has been drafted.')
    expect(text).not.toContain('Nothing recurs.')
    expect(text).not.toContain('Nothing is planned.')

    // And what it says instead, for EVERY person-level table, read from the schema rather than from
    // a list of pages typed here. A list typed here is how the defect happened in the first place:
    // it named the tables there were when it was written, and migrations went on adding more.
    const { PERSON_LEVEL_TABLES } = await import('../src/server/db/authored-table-of.ts')
    const pages = [...tree(onlyRobotics)].map((file) => ({
      file,
      text: readFileSync(join(onlyRobotics, ...file.split('/')), 'utf8'),
    }))
    for (const table of PERSON_LEVEL_TABLES) {
      const saying = pages.filter((p) => p.text.includes(`carries no \`${table}\` rows AT ALL`))
      expect(saying.length, `no page of this archive says where the ${table} rows went`).toBeGreaterThan(0)
      for (const page of saying) {
        expect(page.text, `${page.file} does not say it is one project's archive`).toContain(
          "THIS IS ONE PROJECT'S ARCHIVE",
        )
        expect(page.text, `${page.file} does not say how many ${table} rows the database holds`).toContain(
          `holds ${String(held(table))} of`,
        )
      }
    }

    // ------------------------------------------------------ AND THE PAGE EACH OF THOSE ROWS LIVES ON
    //
    // THIS WAS FIVE FILE NAMES TYPED HERE — plan.md, drafts.md, recurring.md, plans.md, intents.md
    // — and windows.md was never added when `work_windows` arrived on 17 August 2026. The list
    // passed anyway, because the five it named still said what they were supposed to say, so the
    // sixth page went unchecked and nothing anywhere reported that. It was the defect this
    // repository keeps producing: the tables are worked out in one place and the pages holding them
    // in another, and the two could disagree with nothing failing.
    //
    // SO THE PAGES ARE READ OFF THE ARCHIVE THE EXPORTER JUST WROTE. Every row in this format sits
    // under a fence naming its region, so the whole-installation archive says, in its own bytes,
    // which page holds a table's rows. The scoped archive must then have a page of that same name
    // saying where those rows went. A new person-level table gets checked the day its page exists,
    // and no name is typed here at all.
    //
    // IT IS ALSO STRICTLY MORE THAN THE FIVE NAMES CHECKED. A page renamed in the scoped archive
    // but not in the whole one fails here and passed before, in both directions.
    const wholePages = [...tree(everything)].map((file) => ({
      file,
      text: readFileSync(join(everything, ...file.split('/')), 'utf8'),
    }))
    const scopedFiles = tree(onlyRobotics)
    const checked: string[] = []
    for (const table of PERSON_LEVEL_TABLES) {
      const holders = wholePages.filter((p) => p.text.includes('```mole-office ' + table)).map((p) => p.file)
      expect(
        holders.length,
        `no page of the whole-installation archive carries a ${table} row, so this check is about nothing`,
      ).toBeGreaterThan(0)
      for (const file of holders) {
        expect(
          scopedFiles.has(file),
          `${file} holds ${table} rows in the whole-installation archive and this project's archive has no page of that name`,
        ).toBe(true)
        const said = readFileSync(join(onlyRobotics, ...file.split('/')), 'utf8')
        expect(said, `${file} does not say it is one project's archive`).toContain("THIS IS ONE PROJECT'S ARCHIVE")
        expect(said, `${file} does not say how many ${table} rows the database holds`).toContain(
          `holds ${String(held(table))} of`,
        )
        checked.push(file)
      }
    }
    // Not vacuous, and it counts the page the typed list forgot: the person-level tables are written
    // across plan.md, recurring.md, plans.md, intents.md, windows.md, participants.md and
    // pictures.md. The number below is a floor rather than a count, so a new page joins it silently
    // and a page that stopped saying its sentence does not.
    expect(new Set(checked).size).toBeGreaterThan(5)
  })

  it('says in MANIFEST.md that its planning zeroes are counts of the archive, not of the database', async () => {
    const { PERSON_LEVEL_TABLES } = await import('../src/server/db/authored-table-of.ts')
    const manifest = readFileSync(join(onlyRobotics, 'MANIFEST.md'), 'utf8')
    // The counts THEMSELVES stay 0 and must: the importer verifies what it read against them, so
    // they are a count of this archive's files. Which is exactly why the manifest has to say so.
    for (const table of PERSON_LEVEL_TABLES) expect(manifest).toContain(`${table}: 0`)
    expect(manifest).toContain('COUNTS OF THIS ARCHIVE AND NOT OF')
    for (const table of PERSON_LEVEL_TABLES) expect(manifest).toContain(`${String(held(table))} ${table}`)
  })

  it('and the whole-installation archive carries all of it, so the scoping is what was measured', async () => {
    const { PERSON_LEVEL_TABLES } = await import('../src/server/db/authored-table-of.ts')
    const manifest = readFileSync(join(everything, 'MANIFEST.md'), 'utf8')
    for (const table of PERSON_LEVEL_TABLES) expect(manifest).toContain(`${table}: ${String(held(table))}`)
    // The plan's words, verbatim, are in the archive that is allowed to hold them. (This was the draft's body in
    // drafts.md until migration 0196 moved every draft into a plan.)
    expect(readFileSync(join(everything, 'plans.md'), 'utf8')).toContain('- baseline')
    // And a whole-installation archive with rows says none of the scoped sentences.
    expect(readFileSync(join(everything, 'plans.md'), 'utf8')).not.toContain("THIS IS ONE PROJECT'S ARCHIVE")
  })
})
