// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT STOPS ON A GAP IN THE REVISION LEDGER, AND FILLS NONE. Wave 13s round 181, case 8 of section 10.1 of the
 * re-mint plan, its corruption part, as far as the ledger, under the plan's phase 1: a gap found before the re-mint is a
 * blocker or a reviewed historical limitation, never something the re-mint repairs.
 *
 * A gap in the ledger is a record with no revision at all, or a record whose newest revision does not hold what the
 * record holds. The migration's ledger pass (db/revision-backfill.ts) fills both: a baseline revision for the first, a
 * catch-up revision for the second. A run that re-mints writes neither. The stage finds every gap and stops. The apply
 * finds every gap as it was before the ledger pass of its own run, and stops, so its rollback takes back what that
 * pass wrote. A --remint run that finds its map already applied re-mints nothing, so it is a plain db:migrate, and the
 * ledger pass fills a gap as it always does. A plain db:migrate fills both, as before.
 *
 * A throwaway office holds made-up agents, one legacy agent with its handle as its id and one minted agent, a note with
 * three revisions and a second note with one, written through the product's own writers. It is migrated, and copies are
 * made of it: one whose first note was changed by hand with no revision, and one whose second note had its revision
 * deleted by hand. Cases:
 *   1. the fixture contract: the clean copy has no gap; each other copy has its one gap and no other, and every stored
 *      hash in every copy is the hash of its revision's content, so no case here is stopped by a wrong hash;
 *   2. --stage-remint on the copy with the changed note exits 1, says the re-mint stops on a gap in the ledger, names the
 *      note, writes no file and leaves every row as it was;
 *   3. the same, on the copy with the note that has no revision;
 *   4. a map staged on a clean copy, applied to the copy with the changed note, exits 1, names the note, and leaves every
 *      row as it was: no catch-up revision, no new id, no alias or generation row;
 *   5. the same map, applied to the copy with the note that has no revision, the same, with no baseline revision;
 *   6. the same map applied to a clean copy exits 0 and gives the legacy agent a new id, so cases 4 and 5 were stopped by
 *      the gap and nothing else; given the map again after its first note was changed by hand, it exits 0, files no
 *      second generation row, and the ledger pass catches the note up, as a plain db:migrate does;
 *   7. a plain db:migrate on a copy with both gaps exits 0 and fills both, as it did before this check.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-stops-on-a-gap-in-the-ledger.test.ts
 * After a green control, copy src/server/db/remint-migration.ts and src/server/db/migrate.ts, then make one of these
 * changes:
 *   1. in stageTheRemint, delete the line that throws when the list of gaps is not empty: the map is staged, and cases 2
 *      and 3 go red;
 *   2. in applyTheStagedRemint, delete the line that throws when the list of gaps is not empty: the map is applied, with
 *      the revision the ledger pass wrote, and cases 4 and 5 go red;
 *   3. in migrateInPlace, move the line that reads the gaps for the re-mint to just below the ledger pass: the pass has
 *      filled them by then, the apply finds none, and cases 4 and 5 go red;
 *   4. in theGapsInTheLedger, return only the stale ledgers and drop the records with no revision: cases 3 and 5 go red;
 *   5. in applyTheStagedRemint, move the line that throws on gaps to just above the check for a map already applied:
 *      the second run of case 6 is refused, and case 6 goes red;
 *   6. in migrateInPlace, read the gaps in every run and not only a --remint one, and in applyTheStagedRemint move the
 *      line that throws on gaps above the line that returns when no map was given: a plain db:migrate is refused, and so
 *      is the second run of case 6, which finds its map already applied. Cases 6 and 7 go red.
 * Restore each file with cp after each change, check it with cmp, and run the command again for green.
 * Every id, name and word here is made up, in a throwaway office. Each command is given only PATH, LANG, a made-up home
 * in the test's own folder and MOLE_OFFICE_DB, so it reads no settings file of anybody's.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { contentOf, versionOf } from '../src/server/lib/version.ts'
import { MIGRATIONS } from './an-office-one-migration-behind.ts'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const WHEN = '2026-11-01 05:20:00'
const PROJECT = 'default'

// A made-up legacy agent, with its handle as its id, and a minted one.
const IBIS = 'legacy-ibis'
const MINTED = { id: 'MintedGap_01', handle: 'minted-gap' }
// What the first note is changed to by hand, which no revision of it holds.
const BY_HAND = { body: 'Made-up words, changed by hand.' }

/** A write by `id`, under a key that proved it. */
const by = (id: string) => ({ type: 'agent' as const, id, provedHolder: { id, how: 'an-agent-key' as const, claimed: 'a-made-up-name' } })

function theAgents(s: Database.Database): void {
  s.prepare("INSERT INTO assets (id, kind, origin, mime, created_at) VALUES ('made-up-asset', 'avatar', 'default', 'image/svg+xml', ?)").run(WHEN)
  const anAgent = (id: string, handle: string) =>
    s.prepare("INSERT INTO agents (id, name, handle, avatar_asset_id, created_at) VALUES (?, ?, ?, 'made-up-asset', ?)").run(id, `Made-up ${handle}`, handle, WHEN)
  anAgent(IBIS, IBIS)
  anAgent(MINTED.id, MINTED.handle)
}

/** A note with three revisions and a second note with one, written by the legacy agent. */
function writeTheNotes(test: TestDb): { changed: string; bare: string } {
  const changed = test.api.createRecord({ workspaceId: PROJECT, kind: 'note', title: 'A made-up note', data: { body: 'Made-up words, first.' }, actor: by(IBIS) }).id
  test.api.patchRecord(changed, { data: { body: 'Made-up words, second.' } }, by(IBIS))
  test.api.patchRecord(changed, { title: 'A made-up note, changed', data: { body: 'Made-up words, third.' } }, by(IBIS))
  const bare = test.api.createRecord({ workspaceId: PROJECT, kind: 'note', title: 'A second made-up note', data: { body: 'Made-up words, once.' }, actor: by(IBIS) }).id
  return { changed, bare }
}

function ran(args: string[], database: string): { status: number | null; stderr: string } {
  const home = join(folder(), 'home')
  mkdirSync(home, { recursive: true })
  const it = spawnSync(process.execPath, ['--import', 'tsx', 'src/server/db/migrate.ts', ...args], {
    cwd: REPO,
    env: { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: database },
    encoding: 'utf8',
  })
  if (it.error !== undefined) throw it.error
  return { status: it.status, stderr: it.stderr }
}

/** A handle on a file, as the office opens one. */
function opened(file: string): Database.Database {
  const s = new Database(file)
  s.pragma('journal_mode = WAL')
  s.pragma('foreign_keys = ON')
  return s
}
function readOnly<T>(file: string, read: (s: Database.Database) => T): T {
  const s = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return read(s)
  } finally {
    s.close()
  }
}
function changedByHand(file: string, change: (s: Database.Database) => void): string {
  const s = opened(file)
  try {
    change(s)
  } finally {
    s.close()
  }
  return file
}

let t: TestDb
let notes: { changed: string; bare: string }
/** A map staged on a clean copy, and what the stage said. */
const clean = { map: '', staged: { status: null as number | null, stderr: '' } }
const folder = () => dirname(t.file)
/** A copy of the migrated office, in the test's own folder. */
function aCopy(name: string): string {
  const file = join(folder(), `${name}.db`)
  t.client.sqlite.prepare('VACUUM INTO ?').run(file)
  return file
}
/** The first note's data, changed by hand in `file`, with no revision written. */
const theNoteChangedByHand = (file: string) =>
  changedByHand(file, (s) => s.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(BY_HAND), notes.changed))
/** The second note's one revision, deleted by hand in `file`. */
const theRevisionDeletedByHand = (file: string) => changedByHand(file, (s) => s.prepare('DELETE FROM revisions WHERE record_id = ?').run(notes.bare))

beforeAll(async () => {
  t = await freshDb()
  theAgents(t.client.sqlite)
  notes = writeTheNotes(t)
  ;(await import('../src/server/db/migrate.ts')).migrateInPlace(t.client.sqlite, MIGRATIONS)
  clean.map = join(folder(), 'staged-clean.json')
  clean.staged = ran(['--stage-remint', clean.map], aCopy('staged-from'))
}, 120_000)
afterAll(() => t?.close())

interface Hashed {
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
}
/** The hash of a row's content, as the revision writer works it out. */
const theHashOf = (row: Hashed) => versionOf(contentOf({ kind: row.kind, title: row.title, summary: row.summary, data: JSON.parse(row.data) as Record<string, unknown>, deletedAt: row.deleted_at }))
interface ARevision extends Hashed {
  seq: number
  content_hash: string
  op: string
}
const theRevisionsOf = (s: Database.Database, record: string) => s.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq').all(record) as ARevision[]

/** Each record of `file` with no revision at all, and each whose newest revision does not hold what the record holds. */
function theGaps(file: string): { none: string[]; stale: string[] } {
  return readOnly(file, (s) => {
    const records = s.prepare('SELECT id, kind, title, summary, data, deleted_at FROM records ORDER BY id').all() as (Hashed & { id: string })[]
    const none: string[] = []
    const stale: string[] = []
    for (const record of records) {
      const newest = theRevisionsOf(s, record.id).at(-1)
      if (newest === undefined) none.push(record.id)
      else if (newest.content_hash !== theHashOf(record)) stale.push(record.id)
    }
    return { none, stale }
  })
}
/** The number of revisions in `file` whose stored hash is not the hash of their content. */
const theWrongHashes = (file: string) =>
  readOnly(file, (s) => (s.prepare('SELECT * FROM revisions').all() as ARevision[]).filter((row) => row.content_hash !== theHashOf(row)).length)

type Row = Record<string, unknown>
const sorted = (rows: Row[]): Row[] => rows.map((row) => [JSON.stringify(row), row] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, row]) => row)
/** Every row of every table of `file`, each table's rows in one order, so two readings can be compared. */
function everyRow(file: string): Record<string, Row[]> {
  return readOnly(file, (s) => {
    const tables = (s.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[]).map((one) => one.name)
    return Object.fromEntries(tables.map((table) => [table, sorted(s.prepare(`SELECT * FROM "${table}"`).all() as Row[])]))
  })
}
const theIdOfTheLegacyAgent = (file: string) => readOnly(file, (s) => s.prepare('SELECT id FROM agents WHERE handle = ?').pluck().get(IBIS) as string)
const theGenerations = (file: string) => readOnly(file, (s) => s.prepare('SELECT count(*) FROM registry_remint_generations').pluck().get() as number)

describe('the fixture', () => {
  it('has a clean copy with no gap, and two copies with one gap each, and no wrong hash in any', () => {
    const cleanCopy = aCopy('contract-clean')
    expect(readOnly(cleanCopy, (s) => theRevisionsOf(s, notes.changed).map((row) => row.seq))).toEqual([1, 2, 3])
    expect(readOnly(cleanCopy, (s) => theRevisionsOf(s, notes.bare).map((row) => row.seq))).toEqual([1])
    expect(theGaps(cleanCopy)).toEqual({ none: [], stale: [] })
    expect(theIdOfTheLegacyAgent(cleanCopy)).toBe(IBIS)

    const changed = theNoteChangedByHand(aCopy('contract-changed'))
    expect(theGaps(changed)).toEqual({ none: [], stale: [notes.changed] })
    const bare = theRevisionDeletedByHand(aCopy('contract-bare'))
    expect(theGaps(bare)).toEqual({ none: [notes.bare], stale: [] })
    for (const file of [cleanCopy, changed, bare]) expect(theWrongHashes(file)).toBe(0)
  })
})

describe('npm run db:migrate -- --stage-remint <file>', () => {
  async function refusedAtTheStage(name: string, database: string, record: string): Promise<void> {
    const { A_GAP_IN_THE_LEDGER_STOPS_THE_REMINT } = await import('../src/server/db/remint-migration.ts')
    const map = join(folder(), `${name}.json`)
    const before = everyRow(database)

    const staged = ran(['--stage-remint', map], database)
    expect(staged.status, staged.stderr).toBe(1)
    expect(staged.stderr).toContain(A_GAP_IN_THE_LEDGER_STOPS_THE_REMINT)
    expect(staged.stderr).toContain(record)
    expect(existsSync(map)).toBe(false)
    expect(everyRow(database)).toEqual(before)
  }

  it('stops on a record whose newest revision does not hold what it holds, names it, writes no file and leaves every row as it was', async () => {
    await refusedAtTheStage('stage-changed', theNoteChangedByHand(aCopy('stage-changed')), notes.changed)
  })

  it('stops on a record with no revision, names it, writes no file and leaves every row as it was', async () => {
    await refusedAtTheStage('stage-bare', theRevisionDeletedByHand(aCopy('stage-bare')), notes.bare)
  })
})

describe('npm run db:migrate -- --remint <file>', () => {
  async function refusedAtTheApply(database: string, record: string): Promise<void> {
    const { A_GAP_IN_THE_LEDGER_STOPS_THE_REMINT } = await import('../src/server/db/remint-migration.ts')
    expect(clean.staged.status, clean.staged.stderr).toBe(0)
    const before = everyRow(database)

    const applied = ran(['--remint', clean.map], database)
    expect(applied.status, applied.stderr).toBe(1)
    expect(applied.stderr).toContain(A_GAP_IN_THE_LEDGER_STOPS_THE_REMINT)
    expect(applied.stderr).toContain(record)
    expect(everyRow(database)).toEqual(before)
    expect(theIdOfTheLegacyAgent(database)).toBe(IBIS)
  }

  it('stops on a record changed after the stage with no revision, names it, and writes no catch-up revision and nothing else', async () => {
    await refusedAtTheApply(theNoteChangedByHand(aCopy('apply-changed')), notes.changed)
  })

  it('stops on a record whose revision was deleted after the stage, names it, and writes no baseline revision and nothing else', async () => {
    await refusedAtTheApply(theRevisionDeletedByHand(aCopy('apply-bare')), notes.bare)
  })

  it('applies the same map to a clean copy, and given it again on a changed ledger, re-mints nothing and catches the ledger up', () => {
    expect(clean.staged.status, clean.staged.stderr).toBe(0)
    const database = aCopy('apply-clean')

    const first = ran(['--remint', clean.map], database)
    expect(first.status, first.stderr).toBe(0)
    const minted = theIdOfTheLegacyAgent(database)
    expect(minted).not.toBe(IBIS)
    expect(theGenerations(database)).toBe(1)

    theNoteChangedByHand(database)
    expect(theGaps(database)).toEqual({ none: [], stale: [notes.changed] })
    const again = ran(['--remint', clean.map], database)
    expect(again.status, again.stderr).toBe(0)
    expect(theGenerations(database)).toBe(1)
    expect(theIdOfTheLegacyAgent(database)).toBe(minted)
    expect(theGaps(database)).toEqual({ none: [], stale: [] })
    expect(readOnly(database, (s) => theRevisionsOf(s, notes.changed).map((row) => [row.seq, row.op]))).toEqual([[1, 'create'], [2, 'update'], [3, 'update'], [4, 'update']])
  })
})

describe('npm run db:migrate', () => {
  it('fills both gaps without --remint, as it did before', () => {
    const database = theRevisionDeletedByHand(theNoteChangedByHand(aCopy('plain-both')))
    expect(theGaps(database)).toEqual({ none: [notes.bare], stale: [notes.changed] })

    const migrated = ran([], database)
    expect(migrated.status, migrated.stderr).toBe(0)
    expect(theGaps(database)).toEqual({ none: [], stale: [] })
    expect(readOnly(database, (s) => theRevisionsOf(s, notes.bare).map((row) => [row.seq, row.op]))).toEqual([[1, 'baseline']])
    expect(readOnly(database, (s) => theRevisionsOf(s, notes.changed).at(-1)?.seq)).toBe(4)
    expect(theIdOfTheLegacyAgent(database)).toBe(IBIS)
  })
})
