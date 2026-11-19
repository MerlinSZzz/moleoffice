// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVE ROW WHOSE DATA SQLITE DOES NOT READ AS JSON IS REFUSED BY NAME, BEFORE ANYTHING IS WRITTEN.
 *
 * Wave 13s round 64, problem 7S30dTLwo3g2, added to the round by the secretary (PFG1BkS6eRbi). The import writes each JSON
 * column as `JSON.stringify` gives it. JavaScript reads JSON nested far deeper than SQLite does: measured on SQLite
 * 3.53.4, `json_valid` answers 1 for data nested 1,000 levels deep and 0 for 1,001, and `json_extract` stops at the
 * second with "malformed JSON". So an archive could hold data that planImport read and passed, and that SQLite then
 * refused. An index that reads a revision's data, or a session record's, by `json_extract` refuses such a row on
 * insert, so applyImport stopped on a raw SQLite error after a plan that said the import would go through.
 *
 * NOW PLANIMPORT ASKS SQLITE ITSELF. Beside the content hash check, it puts the text the import would write for every
 * revision's data and every session record's data to `json_valid`, and refuses a row it answers 0 for, naming the
 * row. It is a refusal and not a note, because once such an index is on the database the row cannot be written. It
 * holds whether the index is there or not: each case runs on a database without one, and on a database with one made
 * here under a name of its own, shaped like the indexes that read those two columns.
 *
 * HOW THE ARCHIVE IS MADE. A test database files the record as the office files one, its data is then nested deeper
 * than SQLite reads, by SQL, and the revision's content hash is worked out again by the functions the office hashes
 * with, so the content hash check has nothing to refuse. The archive is that database's export. Every name is made up.
 * An index that would refuse that data is dropped from that database first, because it refuses the UPDATE there too.
 * The database that restores the archive without an index has those indexes dropped as well.
 *
 * MUTATION PROOF (after a green control), in src/server/lib/import.ts: the refusal taken out of planImport. On a
 * database without the index the import then writes the row, and on one with it applyImport stops on "malformed JSON".
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** The two rows the indexes read by `json_extract`: a revision's data, and a session record's. */
type WhichRow = 'a revision' | 'a session record'

/**
 * AN INDEX OF THIS TEST'S OWN, shaped like the ones that read these columns as JSON. A database that already holds
 * such an index from a migration holds it under another name, so this one never collides with it.
 */
const AN_INDEX_THAT_READS_THE_DATA: Record<WhichRow, string> = {
  'a revision':
    "CREATE INDEX a_test_index_that_reads_revision_data ON revisions (json_extract(data, '$.extra.agentRun')) WHERE seq = 1",
  'a session record':
    "CREATE INDEX a_test_index_that_reads_session_data ON records (json_extract(data, '$.extra.agentRun')) WHERE kind = 'session'",
}

/**
 * THE INDEXES THAT REFUSE SUCH A ROW. An index that reads `data` by `json_extract`, with no `json_valid` to skip what
 * SQLite cannot read, refuses that row on insert and on update. A migration may add one to either table. Every such
 * index on the row's table is dropped from a test database that must not have one.
 */
function dropTheIndexesThatRefuseIt(t: TestDb, which: WhichRow): void {
  const table = which === 'a revision' ? 'revisions' : 'records'
  const indexes = t.client.sqlite
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL")
    .all(table) as { name: string; sql: string }[]
  for (const index of indexes) {
    if (index.sql.includes('json_extract(') && !index.sql.includes('json_valid(')) t.client.sqlite.exec(`DROP INDEX "${index.name}"`)
  }
}

const open: TestDb[] = []
const folders: string[] = []
afterEach(() => {
  for (const one of open.splice(0)) one.close()
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** An object nested 1,001 levels deep: one more than SQLite reads. */
function deeperThanSQLiteReads(): Record<string, unknown> {
  let inner: Record<string, unknown> = {}
  for (let level = 1; level < 1001; level++) inner = { deeper: inner }
  return inner
}

/** An archive holding one record and its first revision, with the named row's data nested deeper than SQLite reads. */
async function anArchiveWithDeepData(which: WhichRow): Promise<{ dir: string; recordId: string; revisionId: string }> {
  const source = await freshDb()
  open.push(source)
  const { contentOf, versionOf } = await import('../src/server/lib/version.ts')
  const exportLib = await import('../src/server/lib/export.ts')
  // A state word each kind takes, so nothing but the depth is refused.
  const state = which === 'a session record' ? 'running' : 'doing'
  const record = source.api.createRecord({
    workspaceId: 'default',
    kind: which === 'a session record' ? 'session' : 'task',
    title: 'A made-up record',
    actor: PERSON,
    origin: 'fixture',
    data: { state },
  })
  const deep = { state, nested: deeperThanSQLiteReads() }
  dropTheIndexesThatRefuseIt(source, which)
  const sqlite = source.client.sqlite
  const revision = sqlite
    .prepare('SELECT id, kind, title, summary, deleted_at AS deletedAt FROM revisions WHERE record_id = ? AND seq = 1')
    .get(record.id) as { id: string; kind: string; title: string; summary: string | null; deletedAt: string | null }
  if (which === 'a revision') {
    const contentHash = versionOf(contentOf({ ...revision, data: deep }))
    sqlite.prepare('UPDATE revisions SET data = ?, content_hash = ? WHERE id = ?').run(JSON.stringify(deep), contentHash, revision.id)
  } else {
    sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(deep), record.id)
  }
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-not-json-'))
  folders.push(dir)
  exportLib.writeExport(dir)
  return { dir, recordId: record.id, revisionId: revision.id }
}

/** A freshly migrated database to restore into, with or without an index that reads the named row's data as JSON. */
async function aDatabase(which: WhichRow, withTheIndex: boolean): Promise<{ t: TestDb; importLib: typeof import('../src/server/lib/import.ts') }> {
  const t = await freshDb()
  open.push(t)
  if (withTheIndex) t.client.sqlite.exec(AN_INDEX_THAT_READS_THE_DATA[which])
  else dropTheIndexesThatRefuseIt(t, which)
  return { t, importLib: await import('../src/server/lib/import.ts') }
}

/** How many records and revisions the database holds, to show the refusal wrote nothing. */
function rowsIn(t: TestDb): { records: number; revisions: number } {
  const count = (table: string): number => (t.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
  return { records: count('records'), revisions: count('revisions') }
}

const WHAT_IS_REFUSED = 'holds data that SQLite does not accept as JSON'

describe('an archive row whose data SQLite does not read as JSON is refused by name (problem 7S30dTLwo3g2)', () => {
  for (const which of ['a revision', 'a session record'] as const) {
    for (const withTheIndex of [false, true]) {
      it(`refuses ${which} nested deeper than SQLite reads, ${withTheIndex ? 'with' : 'without'} an index that reads it, and writes nothing`, async () => {
        const archive = await anArchiveWithDeepData(which)
        const { t, importLib } = await aDatabase(which, withTheIndex)
        const before = rowsIn(t)
        const named =
          which === 'a revision'
            ? `revision ${archive.revisionId} of record ${archive.recordId} ${WHAT_IS_REFUSED}`
            : `session record ${archive.recordId} ${WHAT_IS_REFUSED}`

        // THE RESTORE IS REFUSED BY NAME, not stopped by SQLite part of the way through. Whatever came instead is
        // what a failure here prints.
        let refused: unknown
        try {
          importLib.applyImport(archive.dir)
        } catch (err) {
          refused = err
        }
        expect(String(refused)).toContain(named)
        expect(refused).toBeInstanceOf(importLib.ImportRefused)
        expect(rowsIn(t)).toEqual(before)

        // AND THE PREVIEW SAYS SO FIRST, with this one refusal, so the import stops for this row and nothing else.
        const plan = importLib.planImport(archive.dir)
        expect(plan.ok).toBe(false)
        expect(plan.refusals.map((refusal) => refusal.problem)).toEqual([expect.stringContaining(named)])
        // The first case also loads the export and the import. It took 4.5 s, near vitest's default of 5 s, and it
        // timed out on a loaded machine.
      }, 60_000)
    }
  }
})
