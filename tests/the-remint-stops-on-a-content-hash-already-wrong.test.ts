// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT STOPS ON A STORE WHOSE HISTORY ALREADY HOLDS A WRONG CONTENT HASH, AND REPAIRS NOTHING. Wave 13s round
 * 180, case 8 of section 10.1 of the re-mint plan, its corruption part, as far as a stored content hash.
 *
 * A revision's content hash is the hash of its own content, worked out by contentOf and versionOf (lib/version.ts) when
 * the revision was written. The plan says the re-mint checks every such hash against the baseline, keeps each as it is,
 * and stops on one that is already wrong: it never makes one right by working it out again. The stage checks every
 * revision, and the apply checks every revision again in its own transaction, so a hash made wrong after the stage is
 * stopped too. The migration's ledger pass (db/revision-backfill.ts) runs before the apply in that transaction, and it
 * writes a new revision for a record whose newest revision does not hold what the record holds. So the apply's check is
 * also what rolls that row back.
 *
 * A throwaway office holds made-up agents, one legacy agent with its handle as its id and one minted agent, and a note
 * with three revisions written through the product's own writers. It is migrated, and copies are made of it. Cases:
 *   1. the fixture contract: the note has three revisions, and each stored hash is the hash of its revision's content;
 *      in the copy whose second revision was given a made-up hash, that revision is the only one whose hash is wrong;
 *   2. --stage-remint on that copy exits 1, says the re-mint stops on a wrong hash, names the record and both hashes,
 *      writes no file and leaves every row as it was, the made-up hash included;
 *   3. a map staged on a clean copy, applied to a copy whose newest revision was given a made-up hash after the stage,
 *      exits 1, names the record and both hashes, and leaves every row as it was: no agent has a new id, no alias or
 *      generation row is filed, the made-up hash is still there, and no revision was added;
 *   4. the same map applied to a clean copy exits 0 and gives the legacy agent a new id, so case 3 was stopped by the
 *      hash and nothing else.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-stops-on-a-content-hash-already-wrong.test.ts
 * After a green control, copy src/server/db/remint-migration.ts, then make one of these changes:
 *   1. in stageTheRemint, delete the line that throws when the list of wrong hashes is not empty: the map is staged,
 *      and case 2 goes red;
 *   2. in applyTheStagedRemint, delete the line that throws when the list of wrong hashes is not empty: the wrong hash
 *      is not caught, and case 3 goes red. A made-up hash on the newest revision also leaves a gap in the ledger, so the
 *      check for a gap (tests/the-remint-stops-on-a-gap-in-the-ledger.test.ts) stops the run, with a refusal that does
 *      not say a hash is wrong;
 *   3. in applyTheStagedRemint, put
 *      `for (const one of wrong) sqlite.prepare('UPDATE revisions SET content_hash = ? WHERE id = ?').run(one.holds, one.id)`
 *      in place of the line that throws: the hash is made right, the check for a gap stops the run with its own
 *      refusal, and case 3 goes red;
 *   4. in theRevisionsWhoseHashIsWrong, add `WHERE seq = (SELECT max(w.seq) FROM revisions w WHERE w.record_id =
 *      revisions.record_id)` before `ORDER BY`: only each record's newest revision is checked, so the stage misses the
 *      second revision, and the apply misses the third because the ledger pass has written a fourth by then. Case 2
 *      goes red, and so does case 3, whose run the check for a gap stops with its own refusal.
 * Restore the file with cp after each change, check it with cmp, and run the command again for green.
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
const WHEN = '2026-11-01 05:00:00'
const PROJECT = 'default'

// A made-up legacy agent, with its handle as its id, and a minted one.
const IBIS = 'legacy-ibis'
const MINTED = { id: 'MintedHash_1', handle: 'minted-hash' }
// A made-up hash of the shape versionOf gives, which no content here hashes to.
const MADE_UP = '0123456789abcdef'

/** A write by `id`, under a key that proved it. */
const by = (id: string) => ({ type: 'agent' as const, id, provedHolder: { id, how: 'an-agent-key' as const, claimed: 'a-made-up-name' } })

function theAgents(s: Database.Database): void {
  s.prepare("INSERT INTO assets (id, kind, origin, mime, created_at) VALUES ('made-up-asset', 'avatar', 'default', 'image/svg+xml', ?)").run(WHEN)
  const anAgent = (id: string, handle: string) =>
    s.prepare("INSERT INTO agents (id, name, handle, avatar_asset_id, created_at) VALUES (?, ?, ?, 'made-up-asset', ?)").run(id, `Made-up ${handle}`, handle, WHEN)
  anAgent(IBIS, IBIS)
  anAgent(MINTED.id, MINTED.handle)
}

/** A note with three revisions, written by the legacy agent. */
function writeTheNote(test: TestDb): string {
  const note = test.api.createRecord({ workspaceId: PROJECT, kind: 'note', title: 'A made-up note', data: { body: 'Made-up words, first.' }, actor: by(IBIS) }).id
  test.api.patchRecord(note, { data: { body: 'Made-up words, second.' } }, by(IBIS))
  test.api.patchRecord(note, { title: 'A made-up note, changed', data: { body: 'Made-up words, third.' } }, by(IBIS))
  return note
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

let t: TestDb
let note: string
/** A map staged on a clean copy, and what the stage said. */
const clean = { map: '', staged: { status: null as number | null, stderr: '' } }
const folder = () => dirname(t.file)
/** A copy of the migrated office, in the test's own folder. */
function aCopy(name: string): string {
  const file = join(folder(), `${name}.db`)
  t.client.sqlite.prepare('VACUUM INTO ?').run(file)
  return file
}
/** A copy of the migrated office whose revision `seq` of the note holds the made-up hash. */
function aCopyWithAWrongHash(name: string, seq: number): string {
  const file = aCopy(name)
  const s = opened(file)
  try {
    s.prepare('UPDATE revisions SET content_hash = ? WHERE record_id = ? AND seq = ?').run(MADE_UP, note, seq)
  } finally {
    s.close()
  }
  return file
}

beforeAll(async () => {
  t = await freshDb()
  theAgents(t.client.sqlite)
  note = writeTheNote(t)
  ;(await import('../src/server/db/migrate.ts')).migrateInPlace(t.client.sqlite, MIGRATIONS)
  clean.map = join(folder(), 'staged-clean.json')
  clean.staged = ran(['--stage-remint', clean.map], aCopy('staged-from'))
}, 120_000)
afterAll(() => t?.close())

interface ARevision {
  id: string
  seq: number
  content_hash: string
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
}
const theRevisionsOfTheNote = (s: Database.Database) => s.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq').all(note) as ARevision[]
/** The hash of a revision's content, as the revision writer works it out. */
const theHashOf = (row: ARevision) => versionOf(contentOf({ kind: row.kind, title: row.title, summary: row.summary, data: JSON.parse(row.data) as Record<string, unknown>, deletedAt: row.deleted_at }))
/** The seq of each revision of the note whose stored hash is not the hash of its content. */
const theWrongSeqs = (file: string) => readOnly(file, (s) => theRevisionsOfTheNote(s).filter((row) => row.content_hash !== theHashOf(row)).map((row) => row.seq))
/** The hash of what revision `seq` of the note holds, in `file`. */
const whatItHolds = (file: string, seq: number) => readOnly(file, (s) => theHashOf(theRevisionsOfTheNote(s).find((row) => row.seq === seq)!))

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

describe('the fixture', () => {
  it('has a note with three revisions, each hashed as its writer hashed it, and a copy whose second revision alone holds a made-up hash', () => {
    const clean = aCopy('contract-clean')
    expect(readOnly(clean, (s) => theRevisionsOfTheNote(s).map((row) => row.seq))).toEqual([1, 2, 3])
    expect(theWrongSeqs(clean)).toEqual([])
    const wrong = aCopyWithAWrongHash('contract-wrong', 2)
    expect(theWrongSeqs(wrong)).toEqual([2])
    expect(whatItHolds(wrong, 2)).not.toBe(MADE_UP)
    expect(theIdOfTheLegacyAgent(clean)).toBe(IBIS)
  })
})

describe('npm run db:migrate -- --stage-remint <file>', () => {
  it('stops on a revision whose hash is already wrong, names the record and both hashes, writes no file and leaves every row as it was', async () => {
    const { A_WRONG_HASH_STOPS_THE_REMINT } = await import('../src/server/db/remint-migration.ts')
    const database = aCopyWithAWrongHash('stage-wrong', 2)
    const map = join(folder(), 'stage-wrong.json')
    const before = everyRow(database)

    const staged = ran(['--stage-remint', map], database)
    expect(staged.status, staged.stderr).toBe(1)
    expect(staged.stderr).toContain(A_WRONG_HASH_STOPS_THE_REMINT)
    expect(staged.stderr).toContain(note)
    expect(staged.stderr).toContain(MADE_UP)
    expect(staged.stderr).toContain(whatItHolds(database, 2))
    expect(existsSync(map)).toBe(false)
    expect(everyRow(database)).toEqual(before)
    expect(theWrongSeqs(database)).toEqual([2])
  })
})

describe('npm run db:migrate -- --remint <file>', () => {
  it('stops on a hash made wrong after the stage, names the record and both hashes, and leaves every row as it was', async () => {
    const { A_WRONG_HASH_STOPS_THE_REMINT } = await import('../src/server/db/remint-migration.ts')
    expect(clean.staged.status, clean.staged.stderr).toBe(0)
    const database = aCopyWithAWrongHash('apply-wrong', 3)
    const before = everyRow(database)

    const applied = ran(['--remint', clean.map], database)
    expect(applied.status, applied.stderr).toBe(1)
    expect(applied.stderr).toContain(A_WRONG_HASH_STOPS_THE_REMINT)
    expect(applied.stderr).toContain(note)
    expect(applied.stderr).toContain(MADE_UP)
    expect(applied.stderr).toContain(whatItHolds(database, 3))
    expect(everyRow(database)).toEqual(before)
    expect(theWrongSeqs(database)).toEqual([3])
    expect(theIdOfTheLegacyAgent(database)).toBe(IBIS)
  })

  it('applies the same map to a clean copy, so the hash was what stopped it', () => {
    expect(clean.staged.status, clean.staged.stderr).toBe(0)
    const database = aCopy('apply-clean')

    const applied = ran(['--remint', clean.map], database)
    expect(applied.status, applied.stderr).toBe(0)
    expect(theIdOfTheLegacyAgent(database)).not.toBe(IBIS)
    expect(theWrongSeqs(database)).toEqual([])
  })
})
