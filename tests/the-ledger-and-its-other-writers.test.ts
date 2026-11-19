// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WRITE PATHS THAT ARE NOT `saveRevision`, AND WHAT EACH OF THEM OWES THE REVISION LEDGER.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The ledger was built with one writer — `saveRevision` in lib/records.ts — and a test asserting
 * there was only one. Four other pieces of the product write or re-file rows of that table, or
 * change what a record holds without going near it, and the assertion could not see any of them:
 *
 *   THE WORKSPACE MOVE re-files five tables and left the sixth behind, so a record that changed
 *   project kept its history stamped with the project it came from. A project-scoped export reads
 *   that column, so the destination's archive lost the record's history and the source's archive
 *   carried revisions of a record it did not contain.
 *
 *   THE IMPORT writes `records` rows through hand-built SQL. Restoring yesterday's archive rolled a
 *   record back and wrote no revision, so the newest revision claimed today's content, the served
 *   `version` was some older revision's hash, and the next ordinary edit was credited with the whole
 *   rollback.
 *
 *   THE IMPORT AGAIN, reading revision rows out of a text file with no check on `actorType`, `op` or
 *   `seq`, and with no model of the UNIQUE(record_id, seq) index — so a plan said "clean" and the
 *   apply threw a raw SQLite error.
 *
 *   THE RAW-SQL DATA MIGRATIONS rewrite `records.data` and write change rows and no revision, and
 *   the backfill could not repair them because it only filled records with no revision at all.
 *
 * Every test below is one of those, written so that it fails if the fix is taken out. The findings
 * they come from were measured on 18 August 2026 and are in
 * .logs/round-eight-map/ledger-attack-findings.json.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath, URL } from 'node:url'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTheFirstOfficeInAHook, freshDb, one, type TestDb } from './helpers.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')
type MoveLib = typeof import('../src/server/lib/move.ts')
type RevisionsLib = typeof import('../src/server/lib/revisions.ts')
type WorkspacesLib = typeof import('../src/server/lib/workspaces.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url))

let t: TestDb
const dirs: string[] = []

/** A throwaway directory for an archive, cleaned up after the test that made it. */
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-ledger-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  t.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** The version token `GET /api/records/:id` serves for a record, read straight off the stored row. */
async function versionNow(recordId: string): Promise<string> {
  const { contentOf, versionOf } = await import('../src/server/lib/version.ts')
  const row = t.client.sqlite
    .prepare('SELECT kind, title, summary, data, deleted_at FROM records WHERE id = ?')
    .get(recordId) as { kind: string; title: string; summary: string | null; data: string; deleted_at: string | null }
  return versionOf(
    contentOf({
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      data: JSON.parse(row.data) as Record<string, unknown>,
      deletedAt: row.deleted_at,
    }),
  )
}

/** The `content_hash` of the record's newest revision, which is what the ledger says it holds. */
function newestRevisionHash(recordId: string): string {
  const row = t.client.sqlite
    .prepare('SELECT content_hash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
    .get(recordId) as { content_hash: string } | undefined
  if (row === undefined) throw new Error(`record ${recordId} has no revision at all`)
  return row.content_hash
}

// ============================================================================ 1 · the move

describe('moving a record between projects carries its history', () => {
  it('leaves no row about that record still filed in the project it left', async () => {
    t = await freshDb()
    const workspaces = (await import('../src/server/lib/workspaces.ts')) as WorkspacesLib
    const move = (await import('../src/server/lib/move.ts')) as MoveLib
    workspaces.createWorkspace({ id: 'robotics', title: 'Robotics' })

    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'the note', data: { body: 'a' }, actor: HUMAN })
    t.api.updateRecord(note.id, { title: 'the note, again' }, HUMAN)
    move.moveRecordToWorkspace(note.id, 'default', { to: 'robotics' }, HUMAN)

    // ASKED OF THE DATABASE'S OWN SCHEMA, NOT OF A LIST TYPED HERE. Every table that says both which
    // record a row is about and which project it is in states the record's project a second time,
    // so every one of them has to move when the record does. A test naming `revisions` alone would
    // pass the day a seventh such table was added and left behind, which is exactly how the sixth
    // came to be left behind.
    const tables = (
      t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    )
      .map((row) => row.name)
      .filter((name) => {
        const columns = (t.client.sqlite.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).map((c) => c.name)
        return columns.includes('record_id') && columns.includes('workspace_id')
      })
    expect(tables, 'no table names both a record and a project, so this test is proving nothing').toContain('revisions')

    for (const table of tables) {
      const left = t.client.sqlite
        .prepare(`SELECT count(*) AS n FROM ${table} WHERE record_id = ? AND workspace_id IS NOT 'robotics'`)
        .get(note.id) as { n: number }
      expect(left.n, `${table} still files rows about a record that moved under the project it left`).toBe(0)
    }
  })

  it('says in the report how many revisions it carried, because a loss nobody reads is a loss', async () => {
    t = await freshDb()
    const workspaces = (await import('../src/server/lib/workspaces.ts')) as WorkspacesLib
    const move = (await import('../src/server/lib/move.ts')) as MoveLib
    workspaces.createWorkspace({ id: 'robotics', title: 'Robotics' })

    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'the note', data: { body: 'a' }, actor: HUMAN })
    t.api.updateRecord(note.id, { title: 'the note, again' }, HUMAN)
    const before = t.client.sqlite.prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?').get(note.id) as { n: number }

    const report = move.moveRecordToWorkspace(note.id, 'default', { to: 'robotics' }, HUMAN)
    // THE MOVE WRITES A REVISION OF ITS OWN, so what it carried is one more than what was there
    // when it started. The earlier version of this test asserted `before.n` and was green for the
    // wrong reason: the count was taken at the top of the move's transaction, before
    // `fileRecordsInWorkspace` wrote that revision. The number a reader would check against the
    // destination's `revisions` rows was short by one per record moved.
    const carried = before.n + 1
    expect(report.rows.revisions).toBe(carried)
    expect(report.note).toContain(`${carried} revisions`)
    const there = t.client.sqlite
      .prepare("SELECT count(*) AS n FROM revisions WHERE record_id = ? AND workspace_id = 'robotics'")
      .get(note.id) as { n: number }
    expect(there.n, 'the report and the destination disagree about how many revisions arrived').toBe(carried)
  })

  it('and no revision then reports a project, because the row says where it is filed and not where it was', async () => {
    t = await freshDb()
    const workspaces = (await import('../src/server/lib/workspaces.ts')) as WorkspacesLib
    const move = (await import('../src/server/lib/move.ts')) as MoveLib
    const revisions = (await import('../src/server/lib/revisions.ts')) as RevisionsLib
    workspaces.createWorkspace({ id: 'robotics', title: 'Robotics' })

    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'the note', data: { body: 'a' }, actor: HUMAN })
    t.api.updateRecord(note.id, { title: 'the note, again' }, HUMAN)
    move.moveRecordToWorkspace(note.id, 'default', { to: 'robotics' }, HUMAN)

    // THE COLUMN IS STILL RE-STAMPED, which is what keeps a project-scoped archive whole.
    const row = t.client.sqlite
      .prepare('SELECT workspace_id AS w FROM revisions WHERE record_id = ? AND seq = 1')
      .get(note.id) as { w: string }
    expect(row.w).toBe('robotics')

    // AND IT IS NOT SERVED AS CONTENT. Revision 1 was written while the record was in "default", so
    // a revision reporting "robotics" would state something false about the moment it was written —
    // in the field whose whole job is to say what was true.
    const content = revisions.getRevision(note.id, 1).content as unknown as Record<string, unknown>
    expect(Object.keys(content).sort()).toEqual(['data', 'deletedAt', 'kind', 'summary', 'title'])
    expect(JSON.stringify(content)).not.toContain('robotics')
  })
})

// ============================================================================ 2 · the import

describe('an import leaves the ledger describing the record it rewrote', () => {
  it('writes one revision when a restore rolls a record back, and the served version names it', async () => {
    t = await freshDb()
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib

    const note = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'the note',
      data: { body: 'as it was yesterday' },
      actor: HUMAN,
    })
    const root = scratch()
    exportLib.writeExport(root)
    t.api.updateRecord(note.id, { title: 'the note, rewritten', data: { body: 'what today says' } }, HUMAN)

    const report = importLib.applyImport(root)
    expect(report.applied).toBe(true)

    // THE ONE SENTENCE THE WHOLE FIX IS: the token a read hands back names the newest revision.
    expect(await versionNow(note.id)).toBe(newestRevisionHash(note.id))

    const written = t.client.sqlite
      .prepare('SELECT seq, title, op, actor_type, actor_id, note FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
      .get(note.id) as { seq: number; title: string; op: string; actor_type: string; actor_id: string; note: string }
    expect(written).toMatchObject({ seq: 3, title: 'the note', op: 'restore', actor_type: 'system', actor_id: 'import' })
    // NOT THE PERSON WHO RAN IT. They restored an archive; they did not retype the title.
    expect(written.note).toContain('Nobody edited the record')

    // AND THE NEXT ORDINARY EDIT IS CREDITED WITH ONLY WHAT IT DID. This is the symptom the finding
    // led with: without the row above, one person adding a summary got a revision saying they had
    // also rewritten the title and the body.
    t.api.updateRecord(note.id, { summary: `one line added by ${THE_TEST_OFFICES_OWNER.id}` }, HUMAN)
    const revisions = (await import('../src/server/lib/revisions.ts')) as RevisionsLib
    const newest = one(revisions.listRevisions(note.id).revisions.slice(0, 1), 'newest revision')
    expect(newest.changed?.map((c) => c.path)).toEqual(['summary'])
  })

  it('says so in the plan, before anything is written, and names the row it will add', async () => {
    t = await freshDb()
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib

    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'the note', data: { body: 'a' }, actor: HUMAN })
    const root = scratch()
    exportLib.writeExport(root)
    t.api.updateRecord(note.id, { title: 'moved on' }, HUMAN)

    const plan = importLib.planImport(root)
    expect(plan.ok).toBe(true)
    expect(plan.rows.filter((row) => row.region === 'revisions')).toHaveLength(1)
    expect(one(plan.notes.filter((n) => n.includes('system:import')), 'the note about the ledger')).toContain(
      'their newest revision did not describe',
    )
    // THE PLAN A PERSON READS IS THE PLAN THAT RUNS, ids and all. A row identified differently in
    // the two could not be checked afterwards by the person who read the plan.
    expect(importLib.applyImport(root).rows).toEqual(plan.rows)
  })

  it('adds nothing when the archive already agrees, however many times it is imported', async () => {
    t = await freshDb()
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib

    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'the note', data: { body: 'a' }, actor: HUMAN })
    t.api.updateRecord(note.id, { summary: 'a line' }, HUMAN)
    const root = scratch()
    exportLib.writeExport(root)

    const before = t.client.sqlite.prepare('SELECT count(*) AS n FROM revisions').get() as { n: number }
    expect(importLib.applyImport(root).inserts['revisions'] ?? 0).toBe(0)
    expect(importLib.applyImport(root).inserts['revisions'] ?? 0).toBe(0)
    const after = t.client.sqlite.prepare('SELECT count(*) AS n FROM revisions').get() as { n: number }
    expect(after.n).toBe(before.n)
  })
})

// ============================================================================ 3 · the index

describe('two rows claiming one revision number', () => {
  it('is refused by the plan, not by SQLite after the plan said it was clean', async () => {
    t = await freshDb()
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib

    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'x', data: { body: 'a' }, actor: HUMAN })
    t.api.updateRecord(note.id, { title: 'y' }, HUMAN)
    const full = scratch()
    exportLib.writeExport(full)

    // WHAT ANY MIRROR WRITTEN BEFORE ROUND EIGHT LOOKS LIKE: no `revisions/` and a manifest saying so.
    const old = scratch()
    exportLib.writeExport(old)
    rmSync(join(old, 'revisions'), { recursive: true, force: true })
    writeFileSync(
      join(old, 'MANIFEST.md'),
      readFileSync(join(old, 'MANIFEST.md'), 'utf8').replace(/revisions: \d+/, 'revisions: 0'),
      'utf8',
    )

    t.close()
    t = await freshDb()
    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib
    expect(importLib.applyImport(old).applied).toBe(true)

    // The backfill now gives that record a baseline at seq 1 under a fresh id, which is a different
    // revision 1 from the one the full archive carries.
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    expect(migrateInPlace(t.client.sqlite, MIGRATIONS).revisions.written).toBe(1)

    const plan = importLib.planImport(full)
    expect(plan.ok, 'the plan is what an operator reads before restoring; it has to see this').toBe(false)
    const refusal = one(plan.refusals, 'refusal')
    expect(refusal.problem).toContain('would each be revision 1 of record')
    expect(refusal.problem).toContain('baseline')

    // AND THE APPLY REFUSES IN THE SAME WORDS rather than throwing a SQLite message naming an index.
    let thrown: unknown
    try {
      importLib.applyImport(full)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(importLib.ImportRefused)
    expect(String((thrown as Error).message)).not.toContain('UNIQUE constraint failed')
  })
})

// ============================================================================ 4 · the vocabulary

describe('a revision row in an archive is held to the same rules as a change row', () => {
  it('refuses a word outside the three the human-only rule reads, and reports the rest', async () => {
    t = await freshDb()
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib

    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'x', data: { body: 'a' }, actor: HUMAN })
    t.api.updateRecord(note.id, { title: 'y' }, HUMAN)
    const root = scratch()
    exportLib.writeExport(root)

    const file = join(root, 'revisions', note.id, '2.md')
    writeFileSync(
      file,
      readFileSync(file, 'utf8')
        .replace(/^actorType: .*$/m, 'actorType: "hooman"')
        .replace(/^op: .*$/m, 'op: "banana"')
        .replace(/^seq: .*$/m, 'seq: 9')
        .replace(/^at: .*$/m, 'at: "1999-01-01 00:00:00"'),
      'utf8',
    )

    const plan = importLib.planImport(root)
    // REFUSED: `actorType` is the field the human-only rule reads, and this is the exact rule the
    // importer already enforces on a `changes` row.
    expect(plan.ok).toBe(false)
    expect(one(plan.refusals, 'refusal').problem).toContain('"hooman"')
    // REPORTED: an unrecognised `op`, a gap in the numbering, and a stamp out of order. None of the
    // three is self-contradictory, and none of them was said at all before.
    expect(plan.notes.some((n) => n.includes('banana'))).toBe(true)
    expect(plan.notes.some((n) => n.includes('does not run 1, 2, 3'))).toBe(true)
    expect(plan.notes.some((n) => n.includes('stamped earlier than the revision before'))).toBe(true)
  })

  it('refuses a revision number that is not a whole number counting from 1', async () => {
    t = await freshDb()
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib

    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'x', data: { body: 'a' }, actor: HUMAN })
    const root = scratch()
    exportLib.writeExport(root)
    const file = join(root, 'revisions', note.id, '1.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace(/^seq: .*$/m, 'seq: 0'), 'utf8')

    const plan = importLib.planImport(root)
    expect(plan.ok).toBe(false)
    expect(plan.refusals.some((r) => r.problem.includes('a revision number is a whole number counting from 1'))).toBe(true)
  })

  it('refuses a revision whose content hash does not name the content on the same row', async () => {
    t = await freshDb()
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib

    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'x', data: { body: 'a' }, actor: HUMAN })
    const root = scratch()
    exportLib.writeExport(root)
    const stored = t.client.sqlite
      .prepare('SELECT id, content_hash FROM revisions WHERE record_id = ?')
      .get(note.id) as { id: string; content_hash: string }

    // The row now says the record held one title and carries the token naming another. That field is
    // the only thing `keepTheLedgerTrue` compares against the record, so a wrong one makes the import
    // skip a record whose ledger is stale or write a revision for one whose ledger was already true.
    const file = join(root, 'revisions', note.id, '1.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace(/^title: .*$/m, 'title: "not what the hash names"'), 'utf8')

    const plan = importLib.planImport(root)
    expect(plan.ok).toBe(false)
    const refusal = one(
      plan.refusals.filter((r) => r.problem.includes('says its content hash is')),
      'the content-hash refusal',
    )
    // WHICH ROW, AND BOTH HASHES. An operator cannot fix this without all three.
    expect(refusal.problem).toContain(stored.id)
    expect(refusal.problem).toContain(stored.content_hash)
    const { contentOf, versionOf } = await import('../src/server/lib/version.ts')
    const whatTheRowNowSays = versionOf(
      contentOf({ kind: 'note', title: 'not what the hash names', summary: null, data: { body: 'a' }, deletedAt: null }),
    )
    expect(refusal.problem).toContain(whatTheRowNowSays)
  })

  it('refuses a revision stamped with a word that names no moment', async () => {
    t = await freshDb()
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib

    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'x', data: { body: 'a' }, actor: HUMAN })
    const root = scratch()
    exportLib.writeExport(root)
    const file = join(root, 'revisions', note.id, '1.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace(/^at: .*$/m, 'at: "banana"'), 'utf8')

    const plan = importLib.planImport(root)
    // REFUSED AND NOT REPORTED. The order check compares stamps as text, so "banana" sorts after
    // every date and was not even said to be out of order; it was imported in silence.
    expect(plan.ok).toBe(false)
    expect(one(plan.refusals.filter((r) => r.problem.includes('names no moment')), 'the stamp refusal').problem).toContain('banana')
  })
})

// ============================================================================ 5 · the export

describe('a project archive says what it carries that it cannot explain', () => {
  it('counts revisions about a record it does not hold, and a ledger that starts part-way through', async () => {
    t = await freshDb()
    const workspaces = (await import('../src/server/lib/workspaces.ts')) as WorkspacesLib
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    const move = (await import('../src/server/lib/move.ts')) as MoveLib
    workspaces.createWorkspace({ id: 'robotics', title: 'Robotics' })

    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'the note', data: { body: 'a' }, actor: HUMAN })
    t.api.updateRecord(note.id, { title: 'the note, again' }, HUMAN)
    move.moveRecordToWorkspace(note.id, 'default', { to: 'robotics' }, HUMAN)

    // THE STATE A DATABASE MOVED BEFORE 18 AUGUST 2026 IS IN, built here on purpose because the move
    // no longer produces it. `settleLinkBypassingTheGate` in helpers.ts exists for the same reason: a
    // reader has to keep defending itself against rows that are already in somebody's corpus.
    t.client.sqlite
      .prepare("UPDATE revisions SET workspace_id = 'default' WHERE record_id = ? AND seq <= 2")
      .run(note.id)

    const left = exportLib.writeExport(scratch(), { workspaceId: 'default' })
    expect(existsSync(join(left.root, 'records'))).toBe(false)
    expect(
      one(left.notes.filter((n) => n.includes('this archive does not carry')), 'the note about homeless revisions'),
    ).toContain('revisions row(s)')

    const kept = exportLib.writeExport(scratch(), { workspaceId: 'robotics' })
    expect(one(kept.notes.filter((n) => n.includes('does not run 1, 2, 3')), 'the note about the gap')).toContain(
      note.id,
    )
  })
})

// ============================================================================ 6 · the sentences

describe('what the ledger says about a record whose history reached it with holes', () => {
  /** A record whose revisions 1 and 2 are not in this database, which a scoped archive produces. */
  async function truncated(): Promise<string> {
    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'x', data: { body: 'a' }, actor: HUMAN })
    t.api.updateRecord(note.id, { title: 'y' }, HUMAN)
    t.api.updateRecord(note.id, { title: 'z' }, HUMAN)
    t.api.updateRecord(note.id, { title: 'w' }, HUMAN)
    t.client.sqlite.prepare('DELETE FROM revisions WHERE record_id = ? AND seq <= 2').run(note.id)
    return note.id
  }

  it('does not tell a reader that numbers which answer nothing are the ones to ask for', async () => {
    t = await freshDb()
    const revisions = (await import('../src/server/lib/revisions.ts')) as RevisionsLib
    const id = await truncated()

    let thrown: unknown
    try {
      revisions.getRevision(id, 1)
    } catch (err) {
      thrown = err
    }
    const message = String((thrown as Error).message)
    // THE OLD SENTENCE, WHICH WAS FALSE: "It has 2 — they are numbered 1 to 2, 1 being the oldest",
    // said about a record whose revisions are 3 and 4.
    expect(message).not.toContain('they are numbered 1 to 2')
    expect(message).toContain('numbered 3 to 4')
    // AND THE LIST AFTER THE COLON IS THE NUMBERS THAT ANSWER, which is what the reader needs and
    // what the sentence now says. It used to be introduced as "with numbers missing in between",
    // naming the same list as the ones that do NOT answer — and on a ledger holding one revision it
    // read "numbered 3 to 3 with numbers missing in between: 3", where nothing is missing at all.
    expect(message).toContain('the numbers that answer are: 3, 4')
    expect(message).not.toContain('missing in between')
  })

  it('says nothing about numbers missing when the ledger holds one revision', async () => {
    t = await freshDb()
    const revisions = (await import('../src/server/lib/revisions.ts')) as RevisionsLib
    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'x', data: { body: 'a' }, actor: HUMAN })
    t.api.updateRecord(note.id, { title: 'y' }, HUMAN)
    t.api.updateRecord(note.id, { title: 'z' }, HUMAN)
    t.client.sqlite.prepare('DELETE FROM revisions WHERE record_id = ? AND seq <= 2').run(note.id)

    let thrown: unknown
    try {
      revisions.getRevision(note.id, 1)
    } catch (err) {
      thrown = err
    }
    // THE CASE THE REPLACEMENT SENTENCE WAS WRITTEN FOR, AND WAS WRONG IN: "It has 1, numbered 3 to
    // 3 with numbers missing in between: 3". Nothing is missing between 3 and 3.
    const message = String((thrown as Error).message)
    expect(message).not.toContain('missing in between')
    expect(message).toContain('numbered 3 to 3')
    expect(message).toContain('the numbers that answer are: 3')
  })

  it('does not work the numbering out from the count when it serves one revision', async () => {
    t = await freshDb()
    const revisions = (await import('../src/server/lib/revisions.ts')) as RevisionsLib
    const id = await truncated()

    // "Revision 3 of 2" is what counting gives on a ledger holding revisions 3 and 4, and it is
    // nonsense. Three other places were moved off the count; this one was missed.
    const note = revisions.getRevision(id, 3).note
    expect(note, 'the note works the numbering out from the count').not.toContain('of 2')
    expect(note).toContain('numbered 3 to 4')
  })

  it('stops saying the numbering is gapless when it is not, and says what `changed: null` means', async () => {
    t = await freshDb()
    const revisions = (await import('../src/server/lib/revisions.ts')) as RevisionsLib
    const id = await truncated()

    const listing = revisions.listRevisions(id)
    expect(listing.count).toBe(2)
    // THIS ASSERTION USED TO READ `toContain('THIS LEDGER HAS A HOLE IN IT')` AND IT WAS WRONG.
    // `truncated()` deletes seq 1 and 2 and leaves 3 and 4, which are consecutive: nothing at all is
    // missing between them. The sentence was false in exactly the case this test was written for,
    // and the test pinned it. Two facts had been folded into one flag — whether anything is missing
    // BETWEEN the ends, and whether the oldest one here is number 1 — and they are now separate.
    // The three shapes and their three sentences are pinned in
    // tests/what-the-ledger-says-about-its-own-numbering.test.ts.
    expect(listing.note).toContain("THIS RECORD'S HISTORY STARTS AT 3 HERE")
    expect(listing.note).not.toContain('HOLE')
    expect(listing.note).not.toContain('Every version this record has is here')
    expect(listing.note).toContain('the version before it is not here')
  })

  it('still says the plain thing about a ledger with no hole in it', async () => {
    t = await freshDb()
    const revisions = (await import('../src/server/lib/revisions.ts')) as RevisionsLib
    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'x', data: { body: 'a' }, actor: HUMAN })
    t.api.updateRecord(note.id, { title: 'y' }, HUMAN)

    expect(revisions.listRevisions(note.id).note).toContain('Every version this record has is here')
    let thrown: unknown
    try {
      revisions.getRevision(note.id, 7)
    } catch (err) {
      thrown = err
    }
    expect(String((thrown as Error).message)).toContain('they are numbered 1 to 2')
  })
})

// ============================================================================ 7 · the migrations

describe('a data migration that rewrites a record in raw SQL', () => {
  it('leaves the ledger describing it, because the last migration in the command catches up', async () => {
    t = await freshDb()
    const task = t.api.createRecord({ workspaceId: 'default', kind: 'task', title: 'victim', data: {}, actor: HUMAN })

    // THE PRE-MIGRATION SHAPE, PUT ON BY HAND. `validateData` refuses `blocked_by` on a task today,
    // so this shape can only reach a live database from an old corpus or through an import — and the
    // defect being tested is in product code either way.
    t.client.sqlite
      .prepare('UPDATE records SET data = ? WHERE id = ?')
      .run(JSON.stringify({ blocked_by: 'the vendor has not shipped the part' }), task.id)

    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const outcome = migrateInPlace(t.client.sqlite, MIGRATIONS)
    expect(outcome.blockedBy.moved).toBe(1)
    expect(outcome.revisions.caughtUp).toBe(1)

    expect(await versionNow(task.id)).toBe(newestRevisionHash(task.id))
    const written = t.client.sqlite
      .prepare('SELECT seq, data, op, actor_type, note FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
      .get(task.id) as { seq: number; data: string; op: string; actor_type: string; note: string }
    expect(written.seq).toBe(2)
    expect(written.op).toBe('update')
    expect(written.actor_type).toBe('system')
    expect(JSON.parse(written.data)).toEqual({ also_waiting_on: 'the vendor has not shipped the part' })
    // IT DOES NOT CLAIM TO KNOW WHO MADE THE WRITE IT IS CATCHING UP WITH, because it cannot.
    expect(written.note).toContain('NOT evidence of who made that write')

    const { describeRevisionBackfill } = await import('../src/server/db/revision-backfill.ts')
    expect(describeRevisionBackfill(outcome.revisions)).toContain('no longer described')
  })

  it('says nothing about catching up when there was nothing to catch up', async () => {
    t = await freshDb()
    t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'quiet', data: { body: 'a' }, actor: HUMAN })

    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const outcome = migrateInPlace(t.client.sqlite, MIGRATIONS)
    expect(outcome.revisions.caughtUp).toBe(0)
    const { describeRevisionBackfill } = await import('../src/server/db/revision-backfill.ts')
    expect(describeRevisionBackfill(outcome.revisions)).not.toContain('no longer described')
  })
})
