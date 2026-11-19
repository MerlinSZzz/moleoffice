// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT CHANGES A RECORD'S HISTORY ONLY WHERE IT HELD AN OLD ID, AND EACH PIN TO IT STILL NAMES THE REVISION IT
 * NAMED. Wave 13s round 179, case 3 of section 10.1 of the re-mint plan, the full history; since round 257, with the
 * history pass wired in.
 *
 * A revisions or changes row names its writer in actor_id, and in proved_holder where a key proved who wrote. A
 * revision's content can hold an id too, as a short form's stamp does. The re-mint's history pass (db/remint-history.ts)
 * rewrites each old id in them to the new id the map gives, makes each content hash it changes again, and keeps each
 * old and new content hash as a pair in the kept lists. A revision's content hash is over its content, and a pin is a
 * revision's seq and that hash. So a re-mint that changed any other byte of a history row could leave a hash that no
 * longer recomputes, or a pin that names nothing, and one that left an old id would leave a writer named by it.
 *
 * This test reads the bytes itself, apart from the re-mint's own checks. Each old id of the two made-up legacy agents
 * is read as a whole run of the characters an id is made of, and none of the rows holds the office's own id, whose rule
 * is not the same at each position.
 *
 * A throwaway office holds made-up agents: two legacy agents, each with its handle as its id, and one minted agent. They
 * write through the product's own writers, each under a key that proved it:
 *   - a note with four revisions: made, patched by the other two, and given a short form, whose madeFrom pins the third
 *     revision and whose stamp names its writer by the old id;
 *   - a comment pinned to the note's first revision;
 *   - a second note, made, patched and deleted, whose records row is then removed, so that only its history is left.
 * A map is staged and applied with the real commands, `npm run db:migrate -- --stage-remint <file>` and
 * `npm run db:migrate -- --remint <file>`. Cases:
 *   1. the fixture contract: the note has four revisions, written by the three agents; each stored content hash is the
 *      hash of its revision's content; each pin names an older revision of the note with its hash; the second note has
 *      no row, and its history is left, ending in its deletion; the short form's stamp holds an old id; and the staged
 *      map holds both legacy agents;
 *   2. the re-mint ran: each legacy agent has its new id, and an alias holds its old one;
 *   3. every revisions and changes row of the three records, and the row of each record that holds a pin, has the bytes
 *      it had, each value of the same type, but that each old id of the two legacy agents is the new id the map gives
 *      it, and each content hash the kept lists hold a pair for is the new hash of that pair;
 *   4. after the re-mint, each content hash is still the hash of its revision's content, each pin names a revision
 *      with its hash, and each history row names its writer by the new id where a legacy agent wrote it. The only
 *      revision whose content held an old id is the note's last one, the short form's, so its content hash is the one
 *      that changed, and the kept lists hold its old and new hash at its record and seq, and no other pair of these
 *      records.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-keeps-a-records-history-and-its-pins.test.ts
 * After a green control, copy src/server/db/remint-history.ts and src/server/lib/registry-aliases/remint-map.ts, then
 * make one of these changes:
 *   1. in remint-history.ts, put `return` as the first line of the arrow `update` in rewriteTheHistory: the pass works
 *      everything out and writes no row, and cases 3 and 4 go red;
 *   2. in remint-history.ts, in what planTheHistoryPass returns, put `...[]` in place of `...contentHashes`: no
 *      content-hash pair is kept, and cases 3 and 4 go red;
 *   3. in remint-map.ts, put `from: 'minted'` in place of `from: 'legacy'` on the line that reads an id that is its
 *      handle: no agent is legacy, and cases 1 to 4 go red.
 * Restore each file with cp after each change, check it with cmp, and run the command again for green.
 * Every id, name and word here is made up, in a throwaway office. Each command is given only PATH, LANG, a made-up home
 * in the test's own folder and MOLE_OFFICE_DB, so it reads no settings file of anybody's.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SHORT_FORMS_FIELD, readStoredShortForms } from '../src/shared/zoom.ts'
import { contentOf, versionOf } from '../src/server/lib/version.ts'
import { MIGRATIONS } from './an-office-one-migration-behind.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { MOLE_OFFICE_HANDLE } from '../src/shared/participants.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const WHEN = '2026-10-31 03:00:00'
const PROJECT = 'default'

// Two made-up legacy agents, each with its handle as its id, and one minted one.
const PLOVER = 'legacy-plover'
const AVOCET = 'legacy-avocet'
const MINTED = { id: 'MintedHist_1', handle: 'minted-hist' }

/** A write by `id`, under a key that proved it. */
const by = (id: string) => ({ type: 'agent' as const, id, provedHolder: { id, how: 'an-agent-key' as const, claimed: 'a-made-up-name' } })
const one = (s: Database.Database, sql: string, ...args: unknown[]) => (s.prepare(sql).pluck().get(...args) as unknown) ?? null

function theAgents(s: Database.Database): void {
  s.prepare("INSERT INTO assets (id, kind, origin, mime, created_at) VALUES ('made-up-asset', 'avatar', 'default', 'image/svg+xml', ?)").run(WHEN)
  const anAgent = (id: string, handle: string) =>
    s.prepare("INSERT INTO agents (id, name, handle, avatar_asset_id, created_at) VALUES (?, ?, ?, 'made-up-asset', ?)").run(id, `Made-up ${handle}`, handle, WHEN)
  for (const id of [PLOVER, AVOCET]) anAgent(id, id)
  anAgent(MINTED.id, MINTED.handle)
}

/** The three records the history is of. */
interface TheHistory {
  note: string
  comment: string
  /** The note whose records row is removed. */
  gone: string
}

async function writeTheHistory(test: TestDb): Promise<TheHistory> {
  const { writeShortForms } = await import('../src/server/lib/zoom.ts')
  const s = test.client.sqlite
  const api = test.api
  const hashAt = (record: string, seq: number) => one(s, 'SELECT content_hash FROM revisions WHERE record_id = ? AND seq = ?', record, seq) as string
  const note = api.createRecord({ workspaceId: PROJECT, kind: 'note', title: 'A made-up note with a history', data: { body: 'Made-up words, first.' }, actor: by(PLOVER) }).id
  api.patchRecord(note, { title: 'A made-up note with a longer history', data: { body: 'Made-up words, second.' } }, by(AVOCET))
  api.patchRecord(note, { data: { body: 'Made-up words, third.' } }, by(MINTED.id))
  const comment = api.createRecord({
    workspaceId: PROJECT,
    kind: 'annotation',
    title: 'A made-up remark on the first words',
    data: { body: 'Made-up remark.', context: { target: { kind: 'record', recordId: note, workspaceId: PROJECT }, revision: { seq: 1, contentHash: hashAt(note, 1) } } },
    actor: by(AVOCET),
  }).id
  writeShortForms(note, PROJECT, { madeFrom: { seq: 3, contentHash: hashAt(note, 3) }, forms: { label: 'Made-up history label' } }, by(PLOVER))
  const gone = api.createRecord({ workspaceId: PROJECT, kind: 'note', title: 'A made-up note whose row is removed', data: { body: 'Made-up words.' }, actor: by(PLOVER) }).id
  api.patchRecord(gone, { data: { body: 'Made-up words, changed.' } }, by(AVOCET))
  api.deleteRecord(gone, by(PLOVER))
  s.prepare('DELETE FROM records WHERE id = ?').run(gone)
  return { note, comment, gone }
}

function ran(program: string, args: string[], database: string): { status: number | null; stderr: string } {
  const home = join(folder(), 'home')
  mkdirSync(home, { recursive: true })
  const it = spawnSync(program, args, { cwd: REPO, env: { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: database }, encoding: 'utf8' })
  if (it.error !== undefined) throw it.error
  return { status: it.status, stderr: it.stderr }
}
/** THE REAL COMMAND, `npm run db:migrate -- <args>`, on `database`. */
const theCommand = (database: string, ...args: string[]) => ran(process.execPath, ['--import', 'tsx', 'src/server/db/migrate.ts', ...args], database)

let t: TestDb
let history: TheHistory
let staged: { status: number | null; stderr: string }
let applied: { status: number | null; stderr: string }
const at = { snapshot: '', after: '', map: '' }
beforeAll(async () => {
  t = await freshDb()
  // The legacy row this fixture reads: put the office's own row back on its handle, as an office made before the change has it.
  t.client.sqlite.prepare('UPDATE agents SET id = ? WHERE handle = ? AND retired = 0').run(MOLE_OFFICE_HANDLE, MOLE_OFFICE_HANDLE)
  theAgents(t.client.sqlite)
  history = await writeTheHistory(t)
  ;(await import('../src/server/db/migrate.ts')).migrateInPlace(t.client.sqlite, MIGRATIONS)
  Object.assign(at, { snapshot: join(folder(), 'snapshot.db'), after: join(folder(), 'office.db'), map: join(folder(), 'map.json') })
  t.client.sqlite.prepare('VACUUM INTO ?').run(at.after)
  staged = theCommand(at.after, '--stage-remint', at.map)
  copyFileSync(at.after, at.snapshot)
  applied = staged.status === 0 ? theCommand(at.after, '--remint', at.map) : { status: null, stderr: 'not run: the map was not staged' }
}, 240_000)
afterAll(() => t?.close())

const folder = () => dirname(t.file)
interface AnEntry {
  oldId: string
  newId: string
  from: 'legacy' | 'minted'
}
const theLegacyEntries = () => (JSON.parse(readFileSync(at.map, 'utf8')) as { map: { entries: AnEntry[] } }).map.entries.filter((entry) => entry.from === 'legacy')
function readOnly<T>(file: string, read: (s: Database.Database) => T): T {
  const s = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return read(s)
  } finally {
    s.close()
  }
}

const theRecords = () => [history.note, history.comment, history.gone]
interface ARevision {
  record_id: string
  seq: number
  content_hash: string
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
  actor_id: string
}
const theRevisionsOf = (s: Database.Database, record: string) => s.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq').all(record) as ARevision[]
/** The hash of a revision's content, as the revision writer works it out. */
const theHashOf = (row: ARevision) => versionOf(contentOf({ kind: row.kind, title: row.title, summary: row.summary, data: JSON.parse(row.data) as Record<string, unknown>, deletedAt: row.deleted_at }))

/** Each pin to a revision of the note: the comment's revision, and the short form's madeFrom. */
function thePins(s: Database.Database): { what: string; seq: number; contentHash: string }[] {
  const dataOf = (id: string) => JSON.parse(one(s, 'SELECT data FROM records WHERE id = ?', id) as string) as Record<string, unknown>
  const { revision } = dataOf(history.comment)['context'] as { revision: { seq: number; contentHash: string } }
  const label = readStoredShortForms(dataOf(history.note)[SHORT_FORMS_FIELD]).label
  if (label === undefined) throw new Error('the note holds no short form')
  return [
    { what: "the comment's revision", seq: revision.seq, contentHash: revision.contentHash },
    { what: "the short form's madeFrom", seq: label.madeFrom.seq, contentHash: label.madeFrom.contentHash },
  ]
}
/** Whether the note has a revision with the pin's seq and hash, as checkMadeFrom and checkContextRevision ask it. */
const namesItsRevision = (s: Database.Database, pin: { seq: number; contentHash: string }) =>
  one(s, 'SELECT content_hash FROM revisions WHERE record_id = ? AND seq = ?', history.note, pin.seq) === pin.contentHash

/** Each row of `table` that `where` picks, as SQLite quotes each of its values, which keeps the bytes and the type, by the row's id. */
function theRowsOf(s: Database.Database, table: string, where: string, ...args: unknown[]): Record<string, string> {
  const columns = s.prepare('SELECT name FROM pragma_table_info(?) ORDER BY cid').pluck().all(table) as string[]
  const quoted = columns.map((column) => `quote("${column}")`).join(" || ',' || ")
  return Object.fromEntries(s.prepare(`SELECT id, ${quoted} FROM "${table}" WHERE ${where} ORDER BY id`).raw().all(...args) as [string, string][])
}
function theHistoryRows(s: Database.Database): { revisions: Record<string, string>; changes: Record<string, string>; records: Record<string, string> } {
  const records = theRecords()
  const among = `record_id IN (${records.map(() => '?').join(', ')})`
  return {
    revisions: theRowsOf(s, 'revisions', among, ...records),
    changes: theRowsOf(s, 'changes', among, ...records),
    records: theRowsOf(s, 'records', 'id IN (?, ?)', history.note, history.comment),
  }
}
type TheHistoryRows = ReturnType<typeof theHistoryRows>

/** The new id the staged map gives a legacy agent's old id. */
function theNewIdOf(old: string): string {
  const entry = theLegacyEntries().find((one) => one.oldId === old)
  if (entry === undefined) throw new Error(`the staged map gives ${old} no new id`)
  return entry.newId
}

/** A run of the characters an id or a hash is made of: a value is read token by token, so that no id is matched inside a longer one. */
const A_TOKEN = /[A-Za-z0-9_-]+/g
const theTokensOf = (rows: TheHistoryRows): string[] => Object.values(rows).flatMap((byId) => Object.values(byId).flatMap((row) => row.match(A_TOKEN) ?? []))
/** The rows with each token that `becomes` names replaced by what it becomes, and every other byte as it was. */
const asTheRemintLeavesThem = (rows: TheHistoryRows, becomes: ReadonlyMap<string, string>): TheHistoryRows => {
  const replaced = (byId: Record<string, string>) => Object.fromEntries(Object.entries(byId).map(([id, row]) => [id, row.replace(A_TOKEN, (token) => becomes.get(token) ?? token)]))
  return { revisions: replaced(rows.revisions), changes: replaced(rows.changes), records: replaced(rows.records) }
}

/** The kept lists' content-hash pairs of the three records, by record and seq. */
const theContentHashPairs = (s: Database.Database, table: string) =>
  s.prepare(`SELECT record_id, seq, old, new FROM "${table}" WHERE list = 'content_hash' AND record_id IN (?, ?, ?) ORDER BY record_id, seq`).all(...theRecords()) as { record_id: string; seq: number; old: string; new: string }[]

describe('the fixture contract', () => {
  it('writes a history of four revisions by three agents, pins two of them, and leaves a history whose record is gone', () => {
    expect(staged.status, staged.stderr).toBe(0)
    // The two made-up ones, and the office's own agent, put back on its handle above.
    expect(theLegacyEntries().map((entry) => entry.oldId).sort()).toEqual([AVOCET, PLOVER, MOLE_OFFICE_HANDLE].sort())
    readOnly(at.snapshot, (s) => {
      const note = theRevisionsOf(s, history.note)
      expect(note.map((row) => row.seq)).toEqual([1, 2, 3, 4])
      expect(note.map((row) => row.actor_id)).toEqual([PLOVER, AVOCET, MINTED.id, PLOVER])
      expect(one(s, 'SELECT count(*) FROM changes WHERE record_id = ? AND field IS NOT NULL AND actor_id = ?', history.note, AVOCET), 'a change of one field').toBeGreaterThan(0)
      for (const record of theRecords()) for (const row of theRevisionsOf(s, record)) expect(row.content_hash, `${record} ${String(row.seq)}`).toBe(theHashOf(row))
      for (const pin of thePins(s)) {
        expect(pin.seq, pin.what).toBeLessThan(4)
        expect(namesItsRevision(s, pin), pin.what).toBe(true)
      }
      expect(readStoredShortForms((JSON.parse(note[3]!.data) as Record<string, unknown>)[SHORT_FORMS_FIELD]).label?.by, 'the stamp inside a revision').toBe(PLOVER)
      expect(one(s, 'SELECT id FROM records WHERE id = ?', history.gone)).toBeNull()
      const gone = theRevisionsOf(s, history.gone)
      expect(gone.map((row) => row.seq)).toEqual([1, 2, 3])
      expect(gone[2]!.deleted_at).not.toBeNull()
    })
  })
})

describe('a re-mint of an office with a history', () => {
  it('gives each legacy agent its new id and files its old one as an alias', () => {
    expect(applied.status, applied.stderr).toBe(0)
    const entries = theLegacyEntries()
    for (const old of [PLOVER, AVOCET]) expect(entries.some((entry) => entry.oldId === old), old).toBe(true)
    readOnly(at.after, (s) => {
      for (const { oldId, newId } of entries) {
        expect(one(s, 'SELECT handle FROM agents WHERE id = ?', newId), oldId).toBe(oldId)
        expect(one(s, 'SELECT id FROM agents WHERE id = ?', oldId), oldId).toBeNull()
        expect(one(s, "SELECT canonical_id FROM registry_aliases WHERE namespace = 'agent-registry' AND alias_id = ?", oldId), oldId).toBe(newId)
      }
    })
  })

  it('changes in every history row, and in each row that holds a pin, only each old id to its new one and each content hash to its kept pair', async () => {
    const { THE_KEPT_LISTS } = await import('../src/server/db/remint-migration.ts')
    const before = readOnly(at.snapshot, theHistoryRows)
    // Four of the note, one of the comment and three of the note whose row is gone.
    expect(Object.keys(before.revisions)).toHaveLength(8)
    expect(Object.keys(before.records)).toHaveLength(2)
    expect(theTokensOf(before), "the office's own id").not.toContain(MOLE_OFFICE_HANDLE)
    const becomes = new Map<string, string>([PLOVER, AVOCET].map((old) => [old, theNewIdOf(old)]))
    for (const pair of readOnly(at.after, (s) => theContentHashPairs(s, THE_KEPT_LISTS))) becomes.set(pair.old, pair.new)
    expect(readOnly(at.after, theHistoryRows)).toEqual(asTheRemintLeavesThem(before, becomes))
  })

  it('leaves each content hash recomputing, each pin naming its revision, each writer named by its new id, and a kept pair for the one hash it changed', async () => {
    const { THE_KEPT_LISTS } = await import('../src/server/db/remint-migration.ts')
    const newIdOf = new Map(theLegacyEntries().map((entry) => [entry.oldId, entry.newId]))
    const was = readOnly(at.snapshot, (s) => theRecords().flatMap((record) => theRevisionsOf(s, record)))
    readOnly(at.after, (s) => {
      for (const record of theRecords()) for (const row of theRevisionsOf(s, record)) expect(row.content_hash, `${record} ${String(row.seq)}`).toBe(theHashOf(row))
      for (const pin of thePins(s)) expect(namesItsRevision(s, pin), pin.what).toBe(true)
      for (const table of ['revisions', 'changes']) {
        const writers = s.prepare(`SELECT DISTINCT actor_id FROM "${table}" WHERE record_id IN (?, ?, ?) ORDER BY actor_id`).pluck().all(...theRecords()) as string[]
        expect(writers, table).toEqual([theNewIdOf(AVOCET), theNewIdOf(PLOVER), MINTED.id].sort())
      }
      const now = new Map(theRecords().flatMap((record) => theRevisionsOf(s, record)).map((row) => [`${row.record_id} ${String(row.seq)}`, row.content_hash]))
      const changed = was.flatMap((row) => {
        const hash = now.get(`${row.record_id} ${String(row.seq)}`)
        return hash === row.content_hash ? [] : [{ record_id: row.record_id, seq: row.seq, old: row.content_hash, new: hash }]
      })
      // The short form's stamp named its writer by the old id, and no other revision of these records held one.
      expect(changed.map((row) => [row.record_id, row.seq])).toEqual([[history.note, 4]])
      expect(theContentHashPairs(s, THE_KEPT_LISTS)).toEqual(changed.sort((a, b) => (a.record_id === b.record_id ? a.seq - b.seq : a.record_id < b.record_id ? -1 : 1)))
      for (const old of [PLOVER, AVOCET]) {
        const alias = one(s, "SELECT canonical_id FROM registry_aliases WHERE namespace = 'agent-registry' AND alias_id = ?", old)
        expect(alias, old).toBe(newIdOf.get(old))
        expect(one(s, 'SELECT handle FROM agents WHERE id = ?', alias), old).toBe(old)
      }
    })
  })
})
