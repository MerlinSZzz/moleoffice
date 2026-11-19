// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT STOPS ON A SEAL WHOSE PINNED ROW CHANGED, AND REPAIRS NONE. Wave 13s round 183, case 8 of section 10.1 of
 * the re-mint plan, its sealed manifest part, under the plan's phase 1: a seal's pins are kept as they are, and one that
 * does not hold before the re-mint stops it. The apply also reads every revisions and links row before its write and
 * after it, and a row that changed stops it. Its pass over the history then rewrites the legacy agent's id in the
 * revisions and remakes each pin and seal over them; a row the pass did not name that changed in it, a pin that does not
 * hold after it, and a stamp that names someone else after it each stop the re-mint.
 *
 * A records seal names a revision by its id and the sha256 of its whole row as JSON (src/server/lib/sealed-tip.ts).
 * Migrations added columns to revisions after 0060 made it, so a row read today hashes as a seal read it only when it is
 * cut to the columns the table had then. The lists of those columns are written out below from the drizzle files,
 * and not taken from the code they check.
 *
 * A throwaway office holds made-up agents, one legacy agent with its handle as its id and one minted agent, made-up
 * notes, each made and then changed, and one made-up link. Two made-up seals are put in by hand before the migration,
 * each with its one revision, with the shape the seal writer gives them, and with their own hash the sha256 of their
 * content as JSON, because a sealed tip cannot be changed once written. One names a note's
 * revision before and after a run, and a dependency's revision, in today's columns. The other names a revision in the
 * columns 0060 made, with no revision before. A pin is broken by giving its revision row another note by hand, which no
 * content hash covers, or by deleting its revision, so the ledger has no gap and no wrong hash either way. Cases:
 *   1. the written lists are the code's lists, and the last is the columns of a migrated office's revisions table, so a
 *      migration that adds a column to revisions without a new list fails here;
 *   2. one case per list: a made-up row pinned in that list holds under that list and no other, and still holds when
 *      a column that list does not have is given a value;
 *   3. one case per list: the same row, with a value changed in a column that list's migration added, holds under none;
 *   4. the fixture contract: every pin holds by this test's own reading, each seal is a valid sealed tip with one
 *      revision and its own hash the hash of its content, the legacy agent has its handle as its id, and each way of
 *      breaking a pin breaks that pin alone;
 *   5. theSealPinsThatDoNotHold finds no pin on a clean copy;
 *   6. one case for each pin: its revision row is given another note, and the reader finds that one pin;
 *   7. the dependency's revision is deleted, and the reader finds that pin as a revision the ledger does not hold;
 *   8. a third seal is put in a copy, whose revision after names no hash, and the reader finds that pin;
 *   9. a column is added to revisions by hand, and the reader refuses the copy;
 *  10. --stage-remint on a copy with the before pin broken exits 1, names the seal and the revision, writes no file and
 *      leaves every row as it was;
 *  11. --stage-remint on a copy with the added column exits 1, says why, writes no file and leaves every row as it was;
 *  12. a map staged on a clean copy, applied to a copy with the after pin broken, exits 1, names the seal, and leaves
 *      every row as it was, with the legacy agent's id;
 *  13. the same map, applied to a copy with a made-up trigger that changes the link when an agent's id changes, exits
 *      1, says its write changed a row of links, and leaves every row as it was;
 *  14. the same, with a made-up trigger that changes a revision of a note no seal names: it says revisions;
 *  15. the same map applied to a clean copy exits 0 and gives the legacy agent a new id, so cases 12 to 14 and 18 to 20
 *      were stopped by the guards and nothing else; each pin holds by this test's own reading over the row the history
 *      pass rewrote, by another hash than the fixture's, and each seal's own hash is the hash of its content;
 *  16. a plain db:migrate on a copy with the before pin broken exits 0 and repairs nothing;
 *  17. sealed-tip.ts pins a revision and a link by the sha256 of the row as it reads it, and theHashOfARow gives a
 *      fixed made-up row the hash written here;
 *  18. the same map, applied to a copy with a made-up trigger that changes the link when the history pass rewrites a
 *      revision, exits 1, says the pass changed a row it did not name, names the link, and leaves every row as it was;
 *  19. the same, with a made-up trigger that gives the revision the after pin names another note once the pass has
 *      rewritten it: it names the seal and the revision;
 *  20. the same, with a made-up trigger that makes the minted agent the writer of a revision no seal names once the pass
 *      has rewritten it: it says a stamp names someone else, and names the revision.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-stops-on-a-seal-whose-pinned-row-changed.test.ts
 * After a green control, copy the file a change is in, then make one of these changes:
 *   1. in stageTheRemint (src/server/db/remint-migration.ts), delete the line that throws when the list of seal pins
 *      is not empty: the map is staged, and case 10 goes red;
 *   2. in applyTheStagedRemint, delete the line that throws when the list of seal pins is not empty: case 12 goes red;
 *   3. in theListARevisionRowHashesUnder (src/server/lib/the-hash-a-seal-pins-a-row-by.ts), read only the last list:
 *      the seal in the columns of 0060 no longer holds, and no map is staged on a clean copy. Case 2 goes red but for
 *      the last list, case 6 but for the pin in the columns of 0060, and so do cases 5, 7, 8, 12 to 15 and 18 to 20;
 *   4. in THE_COLUMNS_REVISIONS_HAS_HAD, move elevation from the entry of 0139 to the entry of 0168: case 1 goes red,
 *      and so does the case of 0139 in 2;
 *   5. delete the entry of 0276: the reader refuses every copy, and case 1, the case of 0276 in 2, and cases 5 to 8,
 *      10, 12 to 15 and 18 to 20 go red;
 *   6. in thePinsASealHolds (remint-migration.ts), read no revision before: case 6 for the before pin goes red, and so
 *      do case 10 and case 15, whose before pin the pass does not remake;
 *   7. the same, for the revision after: case 6 for the after pin and for the pin in the columns of 0060 goes red, and
 *      so do cases 8, 12, 15 and 19;
 *   8. the same, for the dependencies: case 6 for the dependency pin goes red, and so do cases 7 and 15;
 *   9. in theSealPinsThatDoNotHold, count a pin as held when the ledger has no revision with its id: case 7 goes red;
 *  10. the same, count a pin with no hash as held: case 8 goes red;
 *  11. the same, delete the check of the revisions table's columns: cases 9 and 11 go red;
 *  12. in THE_TABLES_SEALS_PIN, take out links: cases 13 and 18 go red;
 *  13. the same, take out revisions: case 14 goes red;
 *  14. in applyTheStagedRemint, read the rows before the write after it instead: cases 13 and 14 go red;
 *  15. in theHashOfARow, write the JSON with an indent of one space: no pin holds, and case 17 goes red, and so do
 *      case 2 for every list and cases 5 to 8, 12 to 15 and 18 to 20;
 *  16. in revision() (src/server/lib/sealed-tip.ts), hash the row with one made-up column more: case 17 goes red;
 *  17. the same, in theHashOfALinkRow: case 17 goes red;
 *  18. in remint-migration.ts, make A_REVISIONS_TABLE_THE_LISTS_DO_NOT_NAME_STOPS_THE_REMINT the empty string: case 9
 *      goes red, because toThrow with no words would pass on any error;
 *  19. in applyTheStagedRemint, delete the line that throws when the pass changed a row it did not name: case 18 goes
 *      red;
 *  20. the same, read the stamps again after the writes and before the pass, and not after the pass: case 20 goes red;
 *  21. the same, delete the checks of the hashes and the pins after the pass: case 19 goes red;
 *  22. the same, do not call rewriteTheHistory: cases 15 and 18 to 20 go red.
 * Restore the file with cp after each change, check it with cmp, and run the command again for green.
 * Every id, name and word here is made up, in a throwaway office. Each command is given only PATH, LANG, a made-up home
 * in the test's own folder and MOLE_OFFICE_DB, so it reads no settings file of anybody's.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { contentOf, versionOf } from '../src/server/lib/version.ts'
import { validateData } from '../src/shared/kinds.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { MIGRATIONS } from './an-office-one-migration-behind.ts'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const WHEN = '2026-11-01 07:50:00'
const PROJECT = 'default'

// A made-up legacy agent, with its handle as its id, and a minted one.
const STILT = 'legacy-stilt'
const MINTED = { id: 'MintedSeal01', handle: 'minted-seal' }
const HUMAN = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id }

/** A write by `id`, under a key that proved it. */
const by = (id: string) => ({ type: 'agent' as const, id, provedHolder: { id, how: 'an-agent-key' as const, claimed: 'a-made-up-name' } })

function theAgents(s: Database.Database): void {
  s.prepare("INSERT INTO assets (id, kind, origin, mime, created_at) VALUES ('made-up-asset', 'avatar', 'default', 'image/svg+xml', ?)").run(WHEN)
  const anAgent = (id: string, handle: string) =>
    s.prepare("INSERT INTO agents (id, name, handle, avatar_asset_id, created_at) VALUES (?, ?, ?, 'made-up-asset', ?)").run(id, `Made-up ${handle}`, handle, WHEN)
  anAgent(STILT, STILT)
  anAgent(MINTED.id, MINTED.handle)
}

/** Every list of columns revisions has had, each after the migration that made it, written out from the drizzle files. */
const THE_LISTS = [
  {
    after: '0060_revision_ledger',
    columns: ['id', 'record_id', 'workspace_id', 'seq', 'content_hash', 'kind', 'title', 'summary', 'data', 'deleted_at', 'op', 'actor_type', 'actor_id', 'session_id', 'at', 'note'],
  },
  {
    after: '0112_the_warrant',
    columns: ['id', 'record_id', 'workspace_id', 'seq', 'content_hash', 'kind', 'title', 'summary', 'data', 'deleted_at', 'op', 'actor_type', 'actor_id', 'session_id', 'at', 'note', 'warrant', 'revokes_seq'],
  },
  {
    after: '0139_a_secretary_acting_for_the_person',
    columns: ['id', 'record_id', 'workspace_id', 'seq', 'content_hash', 'kind', 'title', 'summary', 'data', 'deleted_at', 'op', 'actor_type', 'actor_id', 'session_id', 'at', 'note', 'warrant', 'revokes_seq', 'elevation'],
  },
  {
    after: '0168_the_proved_holder_beside_the_actor',
    columns: ['id', 'record_id', 'workspace_id', 'seq', 'content_hash', 'kind', 'title', 'summary', 'data', 'deleted_at', 'op', 'actor_type', 'actor_id', 'session_id', 'at', 'note', 'warrant', 'revokes_seq', 'elevation', 'proved_holder'],
  },
  {
    after: '0178_how_a_write_was_proved',
    columns: ['id', 'record_id', 'workspace_id', 'seq', 'content_hash', 'kind', 'title', 'summary', 'data', 'deleted_at', 'op', 'actor_type', 'actor_id', 'session_id', 'at', 'note', 'warrant', 'revokes_seq', 'elevation', 'proved_holder', 'proved_by'],
  },
  {
    after: '0276_a_signed_item_held_for_its_named_agent',
    columns: ['id', 'record_id', 'workspace_id', 'seq', 'content_hash', 'kind', 'title', 'summary', 'data', 'deleted_at', 'op', 'actor_type', 'actor_id', 'session_id', 'at', 'note', 'warrant', 'revokes_seq', 'elevation', 'proved_holder', 'proved_by', 'signed_item'],
  },
  {
    after: '0351_a_revision_stores_a_runs_chapters_once',
    columns: ['id', 'record_id', 'workspace_id', 'seq', 'content_hash', 'kind', 'title', 'summary', 'data', 'deleted_at', 'op', 'actor_type', 'actor_id', 'session_id', 'at', 'note', 'warrant', 'revokes_seq', 'elevation', 'proved_holder', 'proved_by', 'signed_item', 'parts'],
  },
] as const
type AList = (typeof THE_LISTS)[number]
const THE_FIRST_LIST = THE_LISTS[0]
const THE_LAST_LIST = (() => {
  const last = THE_LISTS.at(-1)
  if (last === undefined) throw new Error('The test needs at least one historical revision-column list.')
  return last
})()

type Row = Record<string, unknown>
/** `row` in the columns of `list`, in their order. */
const cut = (row: Row, list: AList): Row => Object.fromEntries(list.columns.map((column) => [column, row[column]]))
/** The sha256 of a row as JSON, worked out here and not by the code it checks. */
const theHashOf = (row: Row) => createHash('sha256').update(JSON.stringify(row)).digest('hex')

/** A made-up revision row as `SELECT *` reads it today, with a value in each column of `list` and null in each after it. */
function aRowSealedIn(list: AList): Row {
  const values: Row = {
    id: 'MadeUpRev001',
    record_id: 'MadeUpNote01',
    workspace_id: PROJECT,
    seq: 3,
    content_hash: 'd'.repeat(64),
    kind: 'note',
    title: 'A made-up note',
    summary: 'Made-up words, in short.',
    data: '{"body":"Made-up words."}',
    deleted_at: '2026-11-01 07:51:00',
    op: 'update',
    actor_type: 'agent',
    actor_id: STILT,
    session_id: 'MadeUpRun001',
    at: WHEN,
    note: 'Made-up words, a note.',
    warrant: '{"made":"up"}',
    revokes_seq: 2,
    elevation: '{"made":"up"}',
    proved_holder: '{"made":"up"}',
    proved_by: 'an-agent-key',
    signed_item: '{"made":"up"}',
    parts: '{"extra.roundChapters":1}',
  }
  return Object.fromEntries(THE_LAST_LIST.columns.map((column) => [column, list.columns.includes(column as never) ? values[column] : null]))
}

/** One pin a planted seal holds: the seal, where in its data as the reader names it, and the revision row it names. */
interface APin {
  seal: string
  path: string
  revision: string
  hash: string
  list: AList
}
const PINS = ['before', 'after', 'dependency', 'in the columns of 0060'] as const
type Place = (typeof PINS)[number]

const one = (s: Database.Database, sql: string, ...args: unknown[]): unknown => s.prepare(sql).pluck().get(...args)
const theRevision = (s: Database.Database, record: string, seq: number) => s.prepare('SELECT * FROM revisions WHERE record_id = ? AND seq = ?').get(record, seq) as Row

/** A made-up seal with the shape sealFinishedRun gives one, put in by hand. Its own hash is the sha256 of its content as JSON. */
function aSeal(id: string, records: Row[], dependencies: Row[]): Row {
  const content = {
    version: 1,
    run: `${id}-run`,
    execution: `${id}-execution`,
    attempt: `${id}-attempt`,
    area: ['made-up/'],
    sealedAt: WHEN,
    kind: 'records',
    git: null,
    records: { workspace: PROJECT, baseline: 1, through: 1000, records, dependencies, links: [], says: 'Made-up words, on a made-up seal.' },
  }
  return { seal: { ...content, hash: theHashOf(content) } }
}
/** A made-up seal and its one revision, written by the office's owner as the revision writer writes one. */
function putIn(s: Database.Database, id: string, data: Row): void {
  const title = 'A made-up seal'
  s.prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin)
    VALUES (?, ?, ?, ?, ?, 'sealed_tip', ?, ?, 'fixture')`).run(id, PROJECT, HUMAN.id, WHEN, WHEN, title, JSON.stringify(data))
  s.prepare("INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, data, op, actor_type, actor_id, at) VALUES (?, ?, ?, 1, ?, 'sealed_tip', ?, ?, 'create', 'human', ?, ?)")
    .run(`${id}-r1`, id, PROJECT, versionOf(contentOf({ kind: 'sealed_tip', title, summary: null, data, deletedAt: null })), title, JSON.stringify(data), HUMAN.id, WHEN)
}
/** Each seal in `s`: its record, its own hash, and its content without that hash. */
const theSeals = (s: Database.Database) =>
  (s.prepare("SELECT id, data FROM records WHERE kind = 'sealed_tip' ORDER BY id").all() as { id: string; data: string }[]).map((row) => {
    const { hash, ...content } = (JSON.parse(row.data) as { seal: Row }).seal
    return { id: row.id, data: row.data, hash, content }
  })

/** The notes a seal or a guard names, the link, and the pins. */
interface TheFixture {
  sealed: string
  dependency: string
  older: string
  unpinned: string
  link: string
  pins: Record<Place, APin>
}

async function plantTheSeals(test: TestDb): Promise<TheFixture> {
  const s = test.client.sqlite
  const api = test.api
  /** A made-up note, made and then changed, so it has two revisions. */
  const aNote = (what: string) => {
    const id = api.createRecord({ workspaceId: PROJECT, kind: 'note', title: `A made-up note ${what}`, data: { body: 'Made-up words, first.' }, actor: by(STILT) }).id
    api.patchRecord(id, { data: { body: 'Made-up words, second.' } }, by(STILT))
    return id
  }
  const sealed = aNote('a seal names before and after')
  const dependency = aNote('a seal names as a dependency')
  const older = aNote('a seal names in the columns of 0060')
  const unpinned = aNote('no seal names')
  const link = api.createLink({ fromId: sealed, toId: dependency, type: 'relates_to', actor: api.HUMAN }).id
  /** The pin of revision `seq` of `record`, hashed in `list`. */
  const aPin = (record: string, seq: number, list: AList) => {
    const row = theRevision(s, record, seq)
    return { record, id: String(row['id']), seq, hash: theHashOf(cut(row, list)) }
  }
  const before = aPin(sealed, 1, THE_LAST_LIST)
  const after = aPin(sealed, 2, THE_LAST_LIST)
  const needed = aPin(dependency, 1, THE_LAST_LIST)
  const inTheOldColumns = aPin(older, 1, THE_FIRST_LIST)
  putIn(s, 'MadeUpSeal01', aSeal('MadeUpSeal01', [{ id: sealed, before, after }], [needed]))
  putIn(s, 'MadeUpSeal02', aSeal('MadeUpSeal02', [{ id: older, before: null, after: inTheOldColumns }], []))

  const pinned = (seal: string, path: string, pin: { id: string; hash: string }, list: AList): APin => ({ seal, path, revision: pin.id, hash: pin.hash, list })
  return {
    sealed,
    dependency,
    older,
    unpinned,
    link,
    pins: {
      before: pinned('MadeUpSeal01', 'data.seal.records.records[0].before', before, THE_LAST_LIST),
      after: pinned('MadeUpSeal01', 'data.seal.records.records[0].after', after, THE_LAST_LIST),
      dependency: pinned('MadeUpSeal01', 'data.seal.records.dependencies[0]', needed, THE_LAST_LIST),
      'in the columns of 0060': pinned('MadeUpSeal02', 'data.seal.records.records[0].after', inTheOldColumns, THE_FIRST_LIST),
    },
  }
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
let fixture: TheFixture
/** A map staged on a clean copy, and what the stage said. */
const clean = { map: '', staged: { status: null as number | null, stderr: '' } }
const folder = () => dirname(t.file)
/** A copy of the migrated office, in the test's own folder. */
function aCopy(name: string): string {
  const file = join(folder(), `${name}.db`)
  t.client.sqlite.prepare('VACUUM INTO ?').run(file)
  return file
}

/** The pin's revision row given another note by hand, in `file`. No content hash covers a revision's note. */
const OTHER_NOTE = 'Made-up words, put in by hand.'
const theRowGivenAnotherNote = (file: string, pin: APin) => changedByHand(file, (s) => s.prepare('UPDATE revisions SET note = ? WHERE id = ?').run(OTHER_NOTE, pin.revision))
/** The pin's revision deleted by hand, in `file`. */
const theRevisionDeleted = (file: string, pin: APin) => changedByHand(file, (s) => s.prepare('DELETE FROM revisions WHERE id = ?').run(pin.revision))
/** A column added to revisions by hand, in `file`, as a migration with no new list would add it. */
const aColumnAdded = (file: string) => changedByHand(file, (s) => s.exec('ALTER TABLE revisions ADD COLUMN made_up_column text'))

/** The value at `pin.path` in its seal's row. */
function theStoredPin(s: Database.Database, pin: APin): Row {
  const [, ...rest] = pin.path.replace(/\[(\d+)\]/gu, '.$1').split('.')
  let value: unknown = JSON.parse(one(s, 'SELECT data FROM records WHERE id = ?', pin.seal) as string)
  for (const step of rest) value = (value as Row)[step]
  return value as Row
}
/** Whether the ledger in `s` has the pin's revision, whose row hashes to the pin in the pin's list, by this test's own reading. */
const holds = (s: Database.Database, pin: APin) => {
  const stored = theStoredPin(s, pin)
  const row = s.prepare('SELECT * FROM revisions WHERE id = ?').get(stored['id']) as Row | undefined
  return row !== undefined && theHashOf(cut(row, pin.list)) === stored['hash']
}

const sorted = (rows: Row[]): Row[] => rows.map((row) => [JSON.stringify(row), row] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, row]) => row)
/** Every row of every table of `file`, each table's rows in one order, so two readings can be compared. */
function everyRow(file: string): Record<string, Row[]> {
  return readOnly(file, (s) => {
    const tables = (s.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[]).map((table) => table.name)
    return Object.fromEntries(tables.map((table) => [table, sorted(s.prepare(`SELECT * FROM "${table}"`).all() as Row[])]))
  })
}
const theIdOfTheLegacyAgent = (file: string) => readOnly(file, (s) => s.prepare('SELECT id FROM agents WHERE handle = ?').pluck().get(STILT) as string)
const theGenerations = (file: string) => readOnly(file, (s) => s.prepare('SELECT count(*) FROM registry_remint_generations').pluck().get() as number)

/** What the re-mint's own reader finds in `file`. */
async function theSealPinsFound(file: string): Promise<unknown[]> {
  const { theSealPinsThatDoNotHold } = await import('../src/server/db/remint-migration.ts')
  return readOnly(file, (s) => theSealPinsThatDoNotHold(s))
}
/** The one pin the reader should find when `pin` is broken. */
const found = (pin: APin, inTheLedger: boolean) => ({ seal: pin.seal, path: pin.path, revision: pin.revision, hash: pin.hash, found: inTheLedger })

beforeAll(async () => {
  t = await freshDb()
  theAgents(t.client.sqlite)
  fixture = await plantTheSeals(t)
  ;(await import('../src/server/db/migrate.ts')).migrateInPlace(t.client.sqlite, MIGRATIONS)
  clean.map = join(folder(), 'staged-clean.json')
  clean.staged = ran(['--stage-remint', clean.map], aCopy('staged-from'))
}, 120_000)
afterAll(() => t?.close())

describe('the lists of columns revisions has had', () => {
  it("are the lists written out here, and the last is the columns of a migrated office's revisions table", async () => {
    const { THE_LISTS_OF_REVISION_COLUMNS } = await import('../src/server/lib/the-hash-a-seal-pins-a-row-by.ts')
    expect(THE_LISTS_OF_REVISION_COLUMNS).toEqual(THE_LISTS)
    expect(t.client.sqlite.prepare("SELECT name FROM pragma_table_info('revisions') ORDER BY cid").pluck().all()).toEqual(THE_LAST_LIST.columns)
  })

  for (const list of THE_LISTS) {
    it(`hold a row pinned after ${list.after} under that list alone, whatever a later column holds`, async () => {
      const { theListARevisionRowHashesUnder } = await import('../src/server/lib/the-hash-a-seal-pins-a-row-by.ts')
      const row = aRowSealedIn(list)
      const pin = theHashOf(cut(row, list))
      for (const other of THE_LISTS) expect(theHashOf(cut(row, other)) === pin, other.after).toBe(other === list)
      expect(theListARevisionRowHashesUnder(row, pin)).toBe(list.after)

      const later = THE_LAST_LIST.columns.filter((column) => !list.columns.includes(column as never))
      const withLaterValues = { ...row, ...Object.fromEntries(later.map((column) => [column, 'Made-up words, put in later.'])) }
      expect(theListARevisionRowHashesUnder(withLaterValues, pin)).toBe(list.after)
    })

    it(`hold a row pinned after ${list.after} under none once a column that migration added holds another value`, async () => {
      const { theListARevisionRowHashesUnder } = await import('../src/server/lib/the-hash-a-seal-pins-a-row-by.ts')
      const row = aRowSealedIn(list)
      const pin = theHashOf(cut(row, list))
      const column = list.columns.at(-1) as string
      expect(theListARevisionRowHashesUnder({ ...row, [column]: 'Made-up words, changed.' }, pin)).toBeNull()
    })
  }
})

describe('the fixture', () => {
  it('holds every pin by its own reading, in valid seals, and breaks only the pin it breaks', () => {
    const cleanCopy = aCopy('contract-clean')
    readOnly(cleanCopy, (s) => {
      for (const place of PINS) expect(holds(s, fixture.pins[place]), place).toBe(true)
      for (const row of s.prepare("SELECT kind, data FROM records WHERE origin = 'fixture'").all() as { kind: string; data: string }[]) {
        expect(validateData(row.kind as never, JSON.parse(row.data)), row.kind).toMatchObject({ ok: true })
      }
      expect(one(s, "SELECT count(*) FROM records WHERE kind = 'sealed_tip'")).toBe(2)
      for (const seal of theSeals(s)) {
        expect(s.prepare('SELECT data FROM revisions WHERE record_id = ?').pluck().all(seal.id), seal.id).toEqual([seal.data])
        expect(seal.hash, seal.id).toBe(theHashOf(seal.content))
      }
    })
    expect(theIdOfTheLegacyAgent(cleanCopy)).toBe(STILT)

    for (const place of PINS) {
      const file = theRowGivenAnotherNote(aCopy(`contract-${place.replace(/ /gu, '-')}`), fixture.pins[place])
      readOnly(file, (s) => {
        for (const other of PINS) expect(holds(s, fixture.pins[other]), `${place}: ${other}`).toBe(other !== place)
      })
    }
    const deleted = theRevisionDeleted(aCopy('contract-deleted'), fixture.pins.dependency)
    readOnly(deleted, (s) => {
      for (const other of PINS) expect(holds(s, fixture.pins[other]), `deleted: ${other}`).toBe(other !== 'dependency')
      expect(s.prepare('SELECT seq FROM revisions WHERE record_id = ? ORDER BY seq').pluck().all(fixture.dependency)).toEqual([2])
    })
  })
})

describe('theSealPinsThatDoNotHold', () => {
  it('finds no pin on a clean copy', async () => {
    expect(await theSealPinsFound(aCopy('reader-clean'))).toEqual([])
  })

  for (const place of PINS) {
    it(`finds the ${place} pin when its revision row holds another note`, async () => {
      const pin = fixture.pins[place]
      expect(await theSealPinsFound(theRowGivenAnotherNote(aCopy(`reader-${place.replace(/ /gu, '-')}`), pin))).toEqual([found(pin, true)])
    })
  }

  it("finds the dependency's pin when its revision is gone, as a revision the ledger does not hold", async () => {
    const pin = fixture.pins.dependency
    expect(await theSealPinsFound(theRevisionDeleted(aCopy('reader-deleted'), pin))).toEqual([found(pin, false)])
  })

  it('finds the pin of a seal whose revision after names no hash', async () => {
    const file = changedByHand(aCopy('reader-no-hash'), (s) => {
      const after = { record: fixture.sealed, id: fixture.pins.after.revision, seq: 2 }
      putIn(s, 'MadeUpSeal03', aSeal('MadeUpSeal03', [{ id: fixture.sealed, before: null, after }], []))
    })
    expect(await theSealPinsFound(file)).toEqual([{ seal: 'MadeUpSeal03', path: 'data.seal.records.records[0].after', revision: fixture.pins.after.revision, hash: undefined, found: true }])
  })

  it('refuses a revisions table with a column the lists do not name', async () => {
    const { A_REVISIONS_TABLE_THE_LISTS_DO_NOT_NAME_STOPS_THE_REMINT } = await import('../src/server/db/remint-migration.ts')
    // toThrow with no words passes on any error, so the words must be there first.
    expect(A_REVISIONS_TABLE_THE_LISTS_DO_NOT_NAME_STOPS_THE_REMINT).toMatch(/\S/u)
    await expect(theSealPinsFound(aColumnAdded(aCopy('reader-added-column')))).rejects.toThrow(A_REVISIONS_TABLE_THE_LISTS_DO_NOT_NAME_STOPS_THE_REMINT)
  })
})

describe('npm run db:migrate -- --stage-remint <file>', () => {
  async function refusedAtTheStage(name: string, database: string, says: string[]): Promise<void> {
    const map = join(folder(), `${name}.json`)
    const before = everyRow(database)

    const staged = ran(['--stage-remint', map], database)
    expect(staged.status, staged.stderr).toBe(1)
    for (const words of says) expect(staged.stderr).toContain(words)
    expect(existsSync(map)).toBe(false)
    expect(everyRow(database)).toEqual(before)
  }

  it('stops on the before pin, names the seal and the revision, writes no file and leaves every row as it was', async () => {
    const { A_SEALED_ROW_THAT_CHANGED_STOPS_THE_REMINT } = await import('../src/server/db/remint-migration.ts')
    const pin = fixture.pins.before
    await refusedAtTheStage('stage-before', theRowGivenAnotherNote(aCopy('stage-before'), pin), [A_SEALED_ROW_THAT_CHANGED_STOPS_THE_REMINT, pin.seal, pin.revision])
  })

  it('stops on a revisions table with a column the lists do not name, writes no file and leaves every row as it was', async () => {
    const { A_REVISIONS_TABLE_THE_LISTS_DO_NOT_NAME_STOPS_THE_REMINT } = await import('../src/server/db/remint-migration.ts')
    await refusedAtTheStage('stage-added-column', aColumnAdded(aCopy('stage-added-column')), [A_REVISIONS_TABLE_THE_LISTS_DO_NOT_NAME_STOPS_THE_REMINT, 'made_up_column'])
  })
})

describe('npm run db:migrate -- --remint <file>', () => {
  function refusedAtTheApply(database: string, says: string[]): void {
    expect(clean.staged.status, clean.staged.stderr).toBe(0)
    const before = everyRow(database)

    const applied = ran(['--remint', clean.map], database)
    expect(applied.status, applied.stderr).toBe(1)
    for (const words of says) expect(applied.stderr).toContain(words)
    expect(everyRow(database)).toEqual(before)
    expect(theIdOfTheLegacyAgent(database)).toBe(STILT)
  }
  /** A made-up trigger, put in by hand in `file`, that changes one row when an agent's id changes. */
  const aTriggerThatChanges = (file: string, change: string) =>
    changedByHand(file, (s) => s.exec(`CREATE TRIGGER made_up_trigger_of_this_test AFTER UPDATE OF id ON agents BEGIN ${change}; END`))

  it('stops on the after pin, broken after the stage, names the seal, and writes nothing', async () => {
    const { A_SEALED_ROW_THAT_CHANGED_STOPS_THE_REMINT } = await import('../src/server/db/remint-migration.ts')
    const pin = fixture.pins.after
    refusedAtTheApply(theRowGivenAnotherNote(aCopy('apply-after'), pin), [A_SEALED_ROW_THAT_CHANGED_STOPS_THE_REMINT, pin.seal, pin.revision])
  })

  it('stops when its write changes a links row, says so, and writes nothing', async () => {
    const { A_WRITE_THAT_CHANGED_A_ROW_A_SEAL_PINS_STOPS_THE_REMINT } = await import('../src/server/db/remint-migration.ts')
    const database = aTriggerThatChanges(aCopy('apply-link'), `UPDATE links SET inferred = 1 WHERE id = '${fixture.link}'`)
    refusedAtTheApply(database, [A_WRITE_THAT_CHANGED_A_ROW_A_SEAL_PINS_STOPS_THE_REMINT, 'a row of links that'])
  })

  it('stops when its write changes a revisions row no seal names, says so, and writes nothing', async () => {
    const { A_WRITE_THAT_CHANGED_A_ROW_A_SEAL_PINS_STOPS_THE_REMINT } = await import('../src/server/db/remint-migration.ts')
    const database = aTriggerThatChanges(aCopy('apply-revision'), `UPDATE revisions SET note = '${OTHER_NOTE}' WHERE record_id = '${fixture.unpinned}' AND seq = 1`)
    refusedAtTheApply(database, [A_WRITE_THAT_CHANGED_A_ROW_A_SEAL_PINS_STOPS_THE_REMINT, 'a row of revisions that'])
  })

  it('applies the same map to a clean copy, and remakes each pin and each seal over the revisions the history pass rewrote', () => {
    expect(clean.staged.status, clean.staged.stderr).toBe(0)
    const database = aCopy('apply-clean')

    const applied = ran(['--remint', clean.map], database)
    expect(applied.status, applied.stderr).toBe(0)
    expect(theIdOfTheLegacyAgent(database)).not.toBe(STILT)
    expect(theGenerations(database)).toBe(1)
    // The legacy agent wrote every pinned revision, so the pass rewrote each, and each pin holds over it by a new hash.
    readOnly(database, (s) => {
      for (const place of PINS) {
        expect(holds(s, fixture.pins[place]), place).toBe(true)
        expect(theStoredPin(s, fixture.pins[place])['hash'], place).not.toBe(fixture.pins[place].hash)
      }
      for (const seal of theSeals(s)) expect(seal.hash, seal.id).toBe(theHashOf(seal.content))
    })
  })

  /** A made-up trigger, put in by hand in `file`, that makes `change` when the history pass rewrites the revision `revision`. */
  const aTriggerInThePass = (file: string, revision: string, change: string) =>
    changedByHand(file, (s) => s.exec(`CREATE TRIGGER made_up_trigger_of_this_test AFTER UPDATE ON revisions WHEN NEW.id = '${revision}' BEGIN ${change}; END`))
  /** The first revision of the note no seal names. The legacy agent wrote it, so the pass rewrites it. */
  const theUnpinnedRevision = () => String(theRevision(t.client.sqlite, fixture.unpinned, 1)['id'])

  it('stops when its pass over the history changes a links row the pass did not name, says so, and writes nothing', async () => {
    const { A_PASS_THAT_CHANGED_A_ROW_IT_DID_NOT_NAME_STOPS_THE_REMINT } = await import('../src/server/db/remint-migration.ts')
    expect(A_PASS_THAT_CHANGED_A_ROW_IT_DID_NOT_NAME_STOPS_THE_REMINT).toMatch(/\S/u)
    const database = aTriggerInThePass(aCopy('pass-link'), theUnpinnedRevision(), `UPDATE links SET inferred = 1 WHERE id = '${fixture.link}'`)
    refusedAtTheApply(database, [A_PASS_THAT_CHANGED_A_ROW_IT_DID_NOT_NAME_STOPS_THE_REMINT, fixture.link])
  })

  it('stops when a pinned revision changes after its pass over the history rewrote it, names the seal and the revision, and writes nothing', async () => {
    const { A_SEALED_ROW_THAT_CHANGED_STOPS_THE_REMINT } = await import('../src/server/db/remint-migration.ts')
    const pin = fixture.pins.after
    const database = aTriggerInThePass(aCopy('pass-after-pin'), pin.revision, `UPDATE revisions SET note = '${OTHER_NOTE}' WHERE id = NEW.id`)
    refusedAtTheApply(database, [A_SEALED_ROW_THAT_CHANGED_STOPS_THE_REMINT, pin.seal, pin.revision])
  })

  it("stops when a revision's writer names another agent after its pass over the history rewrote it, says so, and writes nothing", async () => {
    const { A_STAMP_THAT_NAMES_ANYONE_ELSE_STOPS_THE_REMINT } = await import('../src/server/lib/registry-aliases/remint-stamps.ts')
    expect(A_STAMP_THAT_NAMES_ANYONE_ELSE_STOPS_THE_REMINT).toMatch(/\S/u)
    const revision = theUnpinnedRevision()
    const database = aTriggerInThePass(aCopy('pass-stamp'), revision, `UPDATE revisions SET actor_id = '${MINTED.id}' WHERE id = NEW.id`)
    refusedAtTheApply(database, [A_STAMP_THAT_NAMES_ANYONE_ELSE_STOPS_THE_REMINT, revision])
  })
})

describe('npm run db:migrate', () => {
  it('runs without --remint on a copy with the before pin broken, and repairs nothing', () => {
    const database = theRowGivenAnotherNote(aCopy('plain-before'), fixture.pins.before)

    const migrated = ran([], database)
    expect(migrated.status, migrated.stderr).toBe(0)
    readOnly(database, (s) => {
      expect(holds(s, fixture.pins.before)).toBe(false)
      expect(one(s, 'SELECT note FROM revisions WHERE id = ?', fixture.pins.before.revision)).toBe(OTHER_NOTE)
    })
    expect(theIdOfTheLegacyAgent(database)).toBe(STILT)
  })
})

describe('sealed-tip.ts', () => {
  it('pins a revision and a link by the sha256 of the row as it reads it, and theHashOfARow is that hash', async () => {
    const { theNewestRevisionOf, aLinkRowAsTheSealHashesIt, theHashOfALinkRow } = await import('../src/server/lib/sealed-tip.ts')
    const { theHashOfARow } = await import('../src/server/lib/the-hash-a-seal-pins-a-row-by.ts')
    const newest = theRevision(t.client.sqlite, fixture.sealed, 2)
    expect(theNewestRevisionOf(fixture.sealed)).toEqual({ record: fixture.sealed, id: newest['id'], seq: 2, hash: theHashOf(newest) })

    const link = aLinkRowAsTheSealHashesIt(fixture.link)
    expect(link?.['id']).toBe(fixture.link)
    expect(theHashOfALinkRow(link as Row)).toBe(theHashOf(link as Row))

    const aFixedRow = { id: 'MadeUpRev001', record_id: 'MadeUpNote01', seq: 1, content_hash: 'made-up', note: null }
    expect(theHashOfARow(aFixedRow)).toBe('da1bda059a65af13dc3cfa565afd45792e82e51a4a151c9ac1fbc8d4429ded86')
  })
})
