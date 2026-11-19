// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SANDBOX'S COPY OF THE OFFICE IS MADE FOR ONE RUN, LIVES ONLY AS LONG AS IT, CARRIES NO ADDRESS, AND
 * KEEPS THE WHOLE SCHEMA.
 *
 * Problem iCqnLDtfsGzF. This file drives tools/office-copy.mjs as a command against a small database it
 * builds itself. It never opens the office's own database.
 *
 * ROUND 64 ADDS SEVEN COLUMNS, as ruled in message QxNyszrXlvkD. Two of them get the mark, as the three
 * before them do: agent_runs.claimed_from_machine and handle_holds.machine. Five are set to NULL:
 * installation.machine_names, installation.address_for_browsers, worlds.address,
 * worlds.address_for_other_machines and visitor_credentials.machine. NULL is what each of those five holds
 * when nobody chose or said anything, and a mark in the first two would make Settings answer 500, because
 * their one reader reads only JSON and an address.
 *
 * What it measures, each by running the command:
 *   - the copy holds no machine name or address in any of the ten columns, read as rows and read as bytes,
 *     and its log and its marker say how each was cleared, by the mark or to NULL;
 *   - the office's own backup still holds every one of them;
 *   - an office started on the copy answers the Settings doors that read them with 200, and its world check
 *     asks no address;
 *   - make refuses without --for, and writes nothing;
 *   - the copy's marker, one row of its runtime_settings table named `office-copy.marker`, says which run
 *     it is for, when it was made, by what, and what was cleared;
 *   - the office's own database-only backup holds no such row;
 *   - an office reading the copy does not show the row: runtimeSettingsReading and the added-roles list;
 *   - make refuses a run that has ended, and a run no record names;
 *   - open refuses a copy whose run has ended, or cannot be read, and the copy is gone;
 *   - the sweep removes every copy whose run has ended or cannot be read, and keeps the others;
 *   - the sweep finds an unpacked copy by its marker when the copy has been renamed;
 *   - the copy's triggers equal the source's, by name and SQL, and so does the rest of its schema, with no
 *     table added.
 *
 * EVERY ADDRESS HERE IS MADE UP: each number is from the ranges kept for documentation, and each name is
 * under `.example` or says it is made up.
 *
 * WHAT EACH MUTATION TURNS RED, as measured after a control run in which all 18 cases here and all 19 in
 * tests/a-sandbox-copy-carries-no-key.test.ts pass:
 *   - --for made optional, with no run checked when it is missing: "make refuses without --for".
 *   - the addresses not cleared, and the tool not checking them: the rows, the bytes, the log and the
 *     marker's list of what was cleared.
 *   - the addresses cleared but the copy not written again after the marker (no VACUUM INTO): the bytes.
 *   - (the backup make starts from copying the source with the online backup: nothing here; the copy is
 *     written again at the end, which takes the source's deleted rows out as well. tests/a-copy-leaves-no-key-hash-in-its-bytes.test.ts
 *     turns red on the backup itself.)
 *   - the three columns added to COLUMNS_A_COPY_CLEARS, which the backup shares: the backup keeps them,
 *     a NULL left NULL, the log and the marker; and, in the other file, the visitor credentials case.
 *   - open with no sweep, no refusal and no marker check: both "open refuses" cases.
 *   - open's own refusal removed, with the sweep before it kept: both "open refuses" cases.
 *   - make's own refusal removed, with open's kept: both "make refuses a run" cases.
 *   - every trigger dropped, and the tool's own schema check skipped: the triggers case. With the tool's
 *     check kept, make fails, and 25 of the 37 cases in the two files are red.
 *   - a table of make's own added, and the tool's own schema check skipped: "none is added".
 *   - the sweep keeping a copy whose run cannot be read: the sweep, and "open refuses a copy whose run
 *     cannot be read".
 *   - the sweep removing nothing: the sweep, and both "open refuses" cases.
 *   - the sweep reading no marker in a file whose name is not a copy's: the sweep, which then leaves the
 *     renamed copy of a run that has ended.
 *   - no marker row written, and neither make nor open checking it: the marker; the sweep, which then
 *     removes the unpacked copy of a run still going, so the three schema cases lose their file; and, in
 *     the other file, open refusing an unpacked copy already there.
 *   - the database-only backup writing a marker row after its own check, with make replacing it: the
 *     database-only backup case alone. Written instead in the step the backup shares with make, before
 *     its check, the row is refused by the backup's own row-for-row check, make fails, and 28 of 37 are red.
 *   - the marker named under the added roles' prefix, `office.role:`: the marker, and the reading case,
 *     because the added-roles list shows it.
 *   - the marker named as a setting, MOLE_OFFICE_IDLE_REMINDER_HOURS: the marker, and the reading case,
 *     because runtimeSettingsReading shows its value.
 *
 * ROUND 64, each alone after a control run in which all 20 cases here and all 19 in the other file pass:
 *   - worlds.address taken out of the NULL list: the three tables set to NULL, the bytes, the log, the
 *     marker, and the office started on the copy, whose world check asks the made-up office's address.
 *   - each of the other four taken out of the NULL list in turn: the three tables set to NULL, the bytes,
 *     the log and the marker.
 *   - agent_runs.claimed_from_machine taken out of the mark list, and then handle_holds.machine: the five
 *     tables marked, the bytes, the log and the marker.
 *   - installation.machine_names moved from the NULL list to the mark list: the three tables set to NULL,
 *     the log, the marker, and the office on the copy, whose machine-names door answers 500. The same with
 *     installation.address_for_browsers, whose door answers 500.
 *   - handle_holds.machine added to COLUMNS_A_COPY_CLEARS, which the backup shares: the backup keeps them,
 *     the log; and, in the other file, the visitor credentials case.
 *   - every column put in the marker as cleared by the mark: the log and the marker.
 *   - the columns set to NULL after the file is rewritten, not before: the bytes alone. The list of machine
 *     names is longer than one page for this, because a value set to NULL in a row that fits in one page is
 *     written over, and one on a page of its own stays in the file until VACUUM.
 *   - nothing set to NULL, and the tool not checking it: the three tables set to NULL, the bytes, the log,
 *     the marker, and the office on the copy.
 *   - nothing set to NULL, with the tool's check kept: make fails, and 27 of the 39 cases in the two files
 *     are red. The check skipped, with the columns still set to NULL: nothing is red, because the check has
 *     nothing to find.
 *   - every trigger dropped after the columns are cleared, and the tool's own schema check skipped: the
 *     triggers case alone.
 */

import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { NOT_CARRIED_TABLES, REMOVED_MARK } from '../src/config/what-a-copy-must-not-carry.mjs'
import { writeInstance } from '../tools/sandbox-common.mjs'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'office-copy.mjs')
const BACKUP_SCRIPT = join(REPO, 'scripts', 'backup.ts')

/** The columns a copy clears by the mark: the three of round 63, and two of round 64. */
const MARKED_COLUMNS = [
  { table: 'trusted_machines', column: 'address' },
  { table: 'api_calls', column: 'client_addr' },
  { table: 'header_only_calls', column: 'client_addr' },
  { table: 'agent_runs', column: 'claimed_from_machine' },
  { table: 'handle_holds', column: 'machine' },
] as const

/** The columns a copy sets to NULL, all of round 64. */
const NULLED_COLUMNS = [
  { table: 'installation', column: 'machine_names' },
  { table: 'installation', column: 'address_for_browsers' },
  { table: 'worlds', column: 'address' },
  { table: 'worlds', column: 'address_for_other_machines' },
  { table: 'visitor_credentials', column: 'machine' },
] as const

const EVERY_COLUMN = [...MARKED_COLUMNS, ...NULLED_COLUMNS]

/** Made-up addresses. None is, or was ever, a machine that reached an office. */
const TRUSTED = ['192.0.2.41', 'a-made-up-machine-4417.example']
const CALLED_FROM = '198.51.100.62'
/**
 * MANY CALLS, FROM FIFTY MADE-UP MACHINES: 500 rows of api_calls, as the office's own table holds hundreds of
 * thousands. Clearing that many with SQLite's secure_delete on still leaves some of the old values in the bytes
 * (measured 21 October 2026 with better-sqlite3's SQLite: 28 of 50), which is why the copy is written again with
 * VACUUM INTO after its marker. Without these rows, nothing here could tell whether it was.
 */
const MANY_CALLS_FROM = Array.from({ length: 50 }, (_, i) => `198.51.100.${String(100 + i)}`)
const HEADER_ONLY_FROM = ['203.0.113.83', '203.0.113.84']
const CLAIMED_FROM = '192.0.2.53'
const HELD_ON = 'a-made-up-laptop-5522.example'
const NAMED = { address: '198.51.100.54', name: 'a-made-up-desk-5523' }
const FOR_BROWSERS = '203.0.113.55'
const WORLD_AT = 'http://192.0.2.56:8787'
const WORLD_FOR_OTHER_MACHINES = 'http://198.51.100.57:8787'
const VISITOR_FROM = '203.0.113.58'
/** The SHA-256 of a made-up key the source held once and deleted, with SQLite's secure_delete off, as the office's file is. */
const DELETED_LONG_AGO = createHash('sha256').update('a made-up key the source deleted long ago 6610').digest('hex')
const EVERY_ADDRESS = [
  ...TRUSTED,
  CALLED_FROM,
  ...MANY_CALLS_FROM,
  ...HEADER_ONLY_FROM,
  CLAIMED_FROM,
  HELD_ON,
  NAMED.address,
  NAMED.name,
  FOR_BROWSERS,
  WORLD_AT,
  WORLD_FOR_OTHER_MACHINES,
  VISITOR_FROM,
]

/** The made-up office's home row: a world of another database, alive, at a made-up address. */
const THE_HOME_ROW = 'made-up-home-row'

/** The row of the copy's runtime_settings table in which a copy names its run. */
const MARKER = 'office-copy.marker'

/** A choice and an added card the source holds, so an office reading the copy has rows of its own to show. */
const A_STORED_CHOICE = { name: 'MOLE_OFFICE_REPLY_REMINDER_MINUTES', value: '9' }
const AN_ADDED_CARD = 'made-up-archivist'

/** The environment a child gets: the test database, and none of the live office's four variables. */
function childEnv(databaseFile: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_DB: databaseFile }
  for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT']) delete env[name]
  return env
}

interface Ran {
  status: number
  stdout: string
  stderr: string
}

function officeCopy(args: readonly string[]): Ran {
  const run = spawnSync(process.execPath, [TOOL, ...args, '--sandboxes', sandboxes], {
    cwd: REPO,
    encoding: 'utf8',
    env: childEnv(source.file),
    timeout: 120_000,
  })
  return { status: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' }
}

/** A folder that looks to the tool like a sandbox: its facts, both copies as up writes them, and an out folder. */
function aSandbox(name: string): string {
  const dir = join(sandboxes, name)
  mkdirSync(dir, { recursive: true })
  writeInstance(dir, { instance: 'made by a test' })
  mkdirSync(join(dir, 'out'))
  return join(dir, 'out')
}

/** A run in the source database, still going. */
function aRun(title: string): string {
  return source.api.createRecord({
    kind: 'session',
    title,
    workspaceId: 'default',
    actor: { type: 'agent', id: 'copy-tester' },
    origin: 'fixture',
    data: { state: 'running' },
  }).id
}

/** The run ends, the way any run's end is written: its state. */
function end(run: string): void {
  source.api.patchRecord(run, { dataPatch: { state: 'finished' } }, source.api.HUMAN)
}

/** The copy files in one out folder. */
const copiesIn = (out: string): string[] => readdirSync(out).filter((name) => name.startsWith('office-copy') && name !== 'office-copy.log').sort()

/** Every value of one column, sorted, NULLs as null. */
function valuesOf(db: Database.Database, table: string, column: string): (string | null)[] {
  return (db.prepare(`SELECT "${column}" AS v FROM "${table}" ORDER BY id`).all() as { v: string | null }[]).map((r) => r.v)
}

/** The Settings doors that read a column cleared to NULL here. */
const SETTINGS_DOORS = ['/api/office/machine-names', '/api/office/address-for-browsers', '/api/office/trusted-machines', '/api/office/header-only-calls', '/api/office/worlds']

/**
 * WHAT AN OFFICE STARTED ON ONE DATABASE ANSWERS: the Settings doors above, asked as the person, and the world
 * check, with a stand-in in place of the network that writes down every address it is asked for and answers
 * as nothing listening. Run in a child, because the modules here hold the source's database.
 */
function whatAnOfficeOnTheCopyAnswers(file: string): { statuses: Record<string, number>; bodies: Record<string, string>; asked: string[]; aliveElsewhere: number } {
  const code = [
    "const { buildApp } = await import('./src/server/index.ts')",
    "const { settings } = await import('./src/config/settings.mjs')",
    "const { THE_PERSON } = await import('./src/shared/person.ts')",
    "const { closeTheWorldsNothingIsServing, worldsHere } = await import('./src/server/lib/office.ts')",
    "const { theWorldThisDatabaseIs } = await import('./src/server/lib/world.ts')",
    `const built = await buildApp({ production: false, webDir: ${JSON.stringify(join(REPO, 'dist', 'web'))}, webAppUrl: settings().webAddress, logLevel: false })`,
    "const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }",
    'const statuses = {}',
    'const bodies = {}',
    `for (const url of ${JSON.stringify(SETTINGS_DOORS)}) {`,
    "  const reply = await built.app.inject({ method: 'GET', url, headers })",
    '  statuses[url] = reply.statusCode',
    '  if (reply.statusCode !== 200) bodies[url] = reply.body.slice(0, 600)',
    '}',
    'const asked = []',
    "const nothingListens = async (url) => { asked.push(String(url)); throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) }",
    'await closeTheWorldsNothingIsServing({ fetchImpl: nothingListens })',
    'const here = theWorldThisDatabaseIs()',
    'const aliveElsewhere = worldsHere().filter((world) => world.diedAt === null && world.databaseIdentity !== here).length',
    'await built.app.close()',
    'console.log(JSON.stringify({ statuses, bodies, asked, aliveElsewhere }))',
    'process.exit(0)',
  ].join('\n')
  const read = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: REPO, encoding: 'utf8', env: childEnv(file), timeout: 120_000 })
  expect(read.status, read.stderr).toBe(0)
  return JSON.parse(read.stdout.trim().split('\n').at(-1)!)
}

/** Every trigger, by name and SQL. */
function triggersOf(db: Database.Database): { name: string; sql: string }[] {
  return db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all() as { name: string; sql: string }[]
}

/** Every table, index and view, by type, name and SQL. */
function theRestOfTheSchemaOf(db: Database.Database): unknown[] {
  return db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type <> 'trigger' ORDER BY type, name").all()
}

/** The marker rows of one database. */
function markersIn(db: Database.Database): { name: string; value: string }[] {
  return db.prepare('SELECT name, value FROM runtime_settings WHERE name = ?').all(MARKER) as { name: string; value: string }[]
}

/**
 * WHAT AN OFFICE STARTED ON ONE DATABASE READS: runtimeSettingsReading, and the added-roles list after the
 * cards are read as the server's start reads them. Read in a child, because the modules here hold the
 * source's database.
 */
function whatAnOfficeReadsIn(file: string): { settings: { name: string; chosen: string | null }[]; addedRoles: { name: string }[] } {
  const code = [
    "const { readTheRoleCardsAtStart } = await import('./src/server/lib/role-cards-at-start.ts')",
    "const { loadAddedRoles, addedRoles } = await import('./src/server/lib/added-roles.ts')",
    "const { runtimeSettingsReading } = await import('./src/server/api/runtime-settings.ts')",
    'readTheRoleCardsAtStart()',
    'loadAddedRoles()',
    'console.log(JSON.stringify({ settings: runtimeSettingsReading().settings, addedRoles: addedRoles() }))',
  ].join('\n')
  const read = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: REPO, encoding: 'utf8', env: childEnv(file), timeout: 120_000 })
  expect(read.status, read.stderr).toBe(0)
  return JSON.parse(read.stdout.trim().split('\n').at(-1)!)
}

function opened<T>(file: string, read: (db: Database.Database) => T): T {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return read(db)
  } finally {
    db.close()
  }
}

let source: TestDb
let place: string
let sandboxes: string
let out: string
let run: string
let unpacked: string
let made: Ran
let openedRun: Ran

beforeAll(async () => {
  source = await freshDb()
  const sql = source.client.sqlite
  sql.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)').run(A_STORED_CHOICE.name, A_STORED_CHOICE.value)
  sql
    .prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)')
    .run(`office.role:${AN_ADDED_CARD}`, JSON.stringify({ name: AN_ADDED_CARD, duties: 'Made-up role: reads the archive.', rung: null, powers: ['Reading everything'] }))
  TRUSTED.forEach((address, i) => {
    sql.prepare("INSERT INTO trusted_machines (id, address, how, added_at) VALUES (?, ?, 'a press', '2026-10-18 10:00:00')").run(`made-up-machine-${String(i)}`, address)
  })
  const call = sql.prepare("INSERT INTO api_calls (id, at_ms, method, status, ms, identity_source, client_addr, client_origin) VALUES (?, ?, 'GET', 200, 1, 'none', ?, ?)")
  call.run('made-up-call-1', Date.now(), CALLED_FROM, 'remote')
  // NO SOCKET: an honest NULL, which names no machine and stays NULL.
  call.run('made-up-call-2', Date.now(), null, null)
  for (let i = 0; i < 500; i++) call.run(`made-up-call-many-${String(i).padStart(3, '0')}`, Date.now() + i, MANY_CALLS_FROM[i % 50], 'remote')
  // ONE CALLER ON ONE DAY FROM TWO MACHINES: the unique index holds them apart only by the address.
  HEADER_ONLY_FROM.forEach((address, i) => {
    sql
      .prepare("INSERT INTO header_only_calls (id, day, actor_type, actor_id, client_addr, client_origin, first_seen, last_seen, calls) VALUES (?, '2026-10-18', 'agent', 'a-made-up-caller', ?, 'remote', 1, 2, 1)")
      .run(`made-up-header-only-${String(i)}`, address)
  })
  // ROUND 64: EACH OF THE SEVEN COLUMNS FILLED, in rows written the way the office writes them.
  sql
    .prepare(
      'INSERT INTO agent_runs (id, thread_id, runtime, state, claimed_by, claimed_at, claimed_from_machine, request, created_at) ' +
        "VALUES ('made-up-agent-run', 'a-made-up-thread', 'codex', 'claimed', 'a-made-up-worker', '2026-10-18 10:00:00', ?, '{}', '2026-10-18 10:00:00')",
    )
    .run(CLAIMED_FROM)
  const anAgent = (sql.prepare('SELECT id FROM agents ORDER BY id LIMIT 1').get() as { id: string }).id
  sql
    .prepare(
      'INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at) ' +
        "VALUES ('made-up-hold', ?, 'a-made-up-session', ?, 'codex', '2026-10-18 10:00:00', '2026-10-18 10:00:00')",
    )
    .run(anAgent, HELD_ON)
  // MORE NAMES THAN ONE PAGE HOLDS, with the checked one last: the end of the row spills onto a page of its
  // own, and a value set to NULL there stays in the file's bytes until the file is rewritten.
  const names: Record<string, string> = {}
  for (let i = 1; i <= 120; i++) names[`192.0.2.${String(i)}`] = `a-made-up-machine-${String(i)}`
  names[NAMED.address] = NAMED.name
  const named = sql.prepare('UPDATE installation SET machine_names = ?, address_for_browsers = ? WHERE only_row = 1').run(JSON.stringify(names), FOR_BROWSERS)
  expect(named.changes, 'the made-up office has no installation row, so this proves nothing').toBe(1)
  sql
    .prepare(
      'INSERT INTO worlds (id, name, kind, database_identity, address, address_for_other_machines, standing, born_at, installation) ' +
        "VALUES (?, 'a made-up office', 'home', 'a1b2c3d4e5f60718', ?, ?, 'canonical', '2026-10-18 10:00:00', 'a-made-up-installation')",
    )
    .run(THE_HOME_ROW, WORLD_AT, WORLD_FOR_OTHER_MACHINES)
  sql
    .prepare(
      'INSERT INTO visitor_credentials (id, handle, name, role, token_hash, machine, machine_how, standing, ends_at, issued_at) ' +
        "VALUES ('made-up-visitor', 'a-made-up-visitor', 'A made-up visitor', 'worker', ?, ?, 'an address', 'trusted', '2026-11-18 10:00:00', '2026-10-18 10:00:00')",
    )
    .run(createHash('sha256').update('a made-up token').digest('hex'), VISITOR_FROM)
  // A KEY THE SOURCE DELETED LONG AGO, pasted into a row of a table the copy keeps: the row is gone, and with
  // secure_delete off its bytes stay in the file.
  sql.pragma('secure_delete = OFF')
  sql.prepare("INSERT INTO runtime_settings (name, value) VALUES ('a-made-up-note-deleted-long-ago', ?)").run(`pasted by mistake: ${DELETED_LONG_AGO}`)
  sql.prepare("DELETE FROM runtime_settings WHERE name = 'a-made-up-note-deleted-long-ago'").run()
  sql.pragma('wal_checkpoint(TRUNCATE)')

  place = mkdtempSync(join(tmpdir(), 'office-copy-run-test-'))
  sandboxes = join(place, 'sandboxes')
  out = aSandbox('sb')
  run = aRun('A made-up run the copy is for')
  unpacked = join(out, `office-copy-${run}.db`)
  made = officeCopy(['make', '--to', 'sb', '--for', run])
  openedRun = officeCopy(['open', '--in', 'sb', '--for', run])
}, 180_000)

afterAll(() => {
  source?.close()
  if (place !== undefined) rmSync(place, { recursive: true, force: true })
})

describe('the copy holds no address', () => {
  it('is made and opened for its run', () => {
    expect(made.status, made.stderr).toBe(0)
    expect(openedRun.status, openedRun.stderr).toBe(0)
    expect(copiesIn(out)).toEqual([`office-copy-${run}.db`, `office-copy-${run}.db.gz`])
  })

  it('the source holds every made-up address, or this proves nothing', () => {
    const held = EVERY_COLUMN.flatMap(({ table, column }) => valuesOf(source.client.sqlite, table, column)).filter((v) => v !== null)
    for (const address of EVERY_ADDRESS) expect(held.some((value) => value.includes(address)), address).toBe(true)
  })

  it('keeps every row of the five tables it marks, with each address replaced by the mark and a NULL left NULL', () => {
    opened(unpacked, (copy) => {
      for (const { table, column } of MARKED_COLUMNS) {
        const before = valuesOf(source.client.sqlite, table, column)
        const after = valuesOf(copy, table, column)
        expect(after.length, `${table} lost rows`).toBe(before.length)
        after.forEach((value, i) => {
          if (before[i] === null) expect(value, `${table}.${column} made a NULL into something`).toBeNull()
          else expect(value?.startsWith(REMOVED_MARK), `${table}.${column} was not cleared`).toBe(true)
        })
      }
    })
  })

  it('keeps every row of the three tables it sets to NULL, with each machine name and address set to NULL', () => {
    opened(unpacked, (copy) => {
      for (const { table, column } of NULLED_COLUMNS) {
        const before = valuesOf(source.client.sqlite, table, column)
        expect(before.some((value) => value !== null), `${table}.${column} holds nothing in the source, so this proves nothing`).toBe(true)
        const after = valuesOf(copy, table, column)
        expect(after.length, `${table} lost rows`).toBe(before.length)
        expect(after.filter((value) => value !== null), `${table}.${column} was not set to NULL`).toEqual([])
      }
    })
  })

  it('carries nothing its source deleted: it starts from a backup written with VACUUM INTO and is written again at the end', () => {
    expect(readFileSync(source.client.sqlite.name).toString('latin1').includes(DELETED_LONG_AGO), 'the source no longer holds the deleted key in its bytes, so this proves nothing').toBe(true)
    expect(readFileSync(unpacked).toString('latin1').includes(DELETED_LONG_AGO), "a key the source deleted is in the copy's bytes").toBe(false)
  })

  it('holds none of the addresses anywhere in its bytes', () => {
    const bytes = readFileSync(unpacked).toString('latin1')
    for (const address of EVERY_ADDRESS) expect(bytes.includes(address), `${address} is still in the copy's bytes`).toBe(false)
  })

  it('says in its log which columns it cleared, how many rows of each, and how', () => {
    const log = readFileSync(join(out, 'office-copy.log'), 'utf8')
    expect(log).toContain(
      'Cleared: visitor_credentials.token_hash (1 row, mark), trusted_machines.address (2 rows, mark), api_calls.client_addr (501 rows, mark), ' +
        'header_only_calls.client_addr (2 rows, mark), agent_runs.claimed_from_machine (1 row, mark), handle_holds.machine (1 row, mark), ' +
        'installation.machine_names (1 row, NULL), installation.address_for_browsers (1 row, NULL), worlds.address (1 row, NULL), ' +
        'worlds.address_for_other_machines (1 row, NULL), visitor_credentials.machine (1 row, NULL).',
    )
    expect(log).toContain(`mark: each value is replaced by "${REMOVED_MARK}" and the row's id. NULL: each value is set to NULL.`)
    expect(log).toContain(
      'The machine names and addresses in trusted_machines.address, api_calls.client_addr, header_only_calls.client_addr, ' +
        'agent_runs.claimed_from_machine, handle_holds.machine, installation.machine_names, installation.address_for_browsers, ' +
        "worlds.address, worlds.address_for_other_machines, visitor_credentials.machine are cleared in this copy only. The office's own backups keep them.",
    )
  })
})

describe('an office started on the copy', () => {
  it('answers the Settings doors that read the cleared columns with 200, and its world check asks no address', () => {
    const file = join(place, 'a-copy-an-office-serves.db')
    copyFileSync(unpacked, file)
    const served = whatAnOfficeOnTheCopyAnswers(file)
    for (const door of SETTINGS_DOORS) expect(served.statuses[door], `${door}: ${served.bodies[door] ?? ''}`).toBe(200)
    expect(served.aliveElsewhere, 'no world of another database is alive in the copy, so the world check proves nothing').toBeGreaterThan(0)
    expect(served.asked, 'the world check asked an address').toEqual([])
  }, 120_000)
})

describe("the office's own backup keeps them", () => {
  it('holds every machine name and address the source holds, in all ten columns', () => {
    const to = join(place, 'the-office-backup.db')
    const backup = spawnSync('npx', ['tsx', BACKUP_SCRIPT, '--to', to], { cwd: REPO, encoding: 'utf8', env: childEnv(source.file), timeout: 120_000 })
    expect(backup.status, backup.stderr).toBe(0)
    opened(to, (copy) => {
      for (const { table, column } of EVERY_COLUMN) {
        expect(valuesOf(copy, table, column), `${table}.${column}`).toEqual(valuesOf(source.client.sqlite, table, column))
      }
    })
  }, 120_000)

  it('its database-only backup, the one make starts from, holds no marker row and every runtime_settings row of the source', () => {
    const to = join(place, 'the-office-database-only-backup.db')
    const backup = spawnSync('npx', ['tsx', BACKUP_SCRIPT, '--to', to, '--database-only'], { cwd: REPO, encoding: 'utf8', env: childEnv(source.file), timeout: 120_000 })
    expect(backup.status, backup.stderr).toBe(0)
    const everyRow = (db: Database.Database) => db.prepare('SELECT name, value FROM runtime_settings ORDER BY name').all()
    opened(to, (copy) => {
      expect(markersIn(copy)).toEqual([])
      expect(everyRow(copy)).toEqual(everyRow(source.client.sqlite))
    })
  }, 120_000)
})

describe('a copy is made for one named run', () => {
  it('make refuses without --for, and writes nothing', () => {
    const nothing = aSandbox('no-run-named')
    const refused = officeCopy(['make', '--to', 'no-run-named'])
    expect(refused.status, refused.stderr).toBe(2)
    expect(refused.stderr).toContain('make needs --for <run>, the id of the run the copy is for.')
    expect(readdirSync(nothing)).toEqual([])
  })

  it('the copy holds one marker row, which says which run it is for, when it was made, by what, and what was cleared and how', () => {
    const marker = opened(unpacked, markersIn)
    expect(marker).toHaveLength(1)
    const said = JSON.parse(marker[0]!.value) as Record<string, unknown>
    expect(said['madeAt']).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(said).toEqual({
      madeBy: 'tools/office-copy.mjs',
      forRun: run,
      madeAt: said['madeAt'],
      // NOBODY NAMED AN AGENT OR A RUN in the child's environment, so nobody is written.
      madeByAgent: null,
      madeByRun: null,
      emptied: [...NOT_CARRIED_TABLES],
      cleared: {
        'visitor_credentials.token_hash': { how: 'mark', rows: 1 },
        'trusted_machines.address': { how: 'mark', rows: 2 },
        'api_calls.client_addr': { how: 'mark', rows: 501 },
        'header_only_calls.client_addr': { how: 'mark', rows: 2 },
        'agent_runs.claimed_from_machine': { how: 'mark', rows: 1 },
        'handle_holds.machine': { how: 'mark', rows: 1 },
        'installation.machine_names': { how: 'NULL', rows: 1 },
        'installation.address_for_browsers': { how: 'NULL', rows: 1 },
        'worlds.address': { how: 'NULL', rows: 1 },
        'worlds.address_for_other_machines': { how: 'NULL', rows: 1 },
        'visitor_credentials.machine': { how: 'NULL', rows: 1 },
      },
    })
  })

  it('an office reading the copy shows its own choice and card, and not the marker', () => {
    const file = join(place, 'a-copy-an-office-reads.db')
    copyFileSync(unpacked, file)
    const read = whatAnOfficeReadsIn(file)
    expect(read.settings.find((one) => one.name === A_STORED_CHOICE.name)?.chosen, 'the reading did not read the copy, so this proves nothing').toBe(A_STORED_CHOICE.value)
    expect(read.addedRoles.map((one) => one.name), 'the list did not read the copy, so this proves nothing').toContain(AN_ADDED_CARD)
    for (const [what, value] of Object.entries(read)) {
      const text = JSON.stringify(value)
      expect(text.includes(MARKER), `${what} shows the marker's name`).toBe(false)
      expect(text.includes(run), `${what} shows the run the marker names`).toBe(false)
    }
  }, 120_000)

  it('make refuses a run that has ended, and writes nothing', () => {
    const over = aRun('A made-up run that has ended')
    end(over)
    const there = aSandbox('ended-before')
    const refused = officeCopy(['make', '--to', 'ended-before', '--for', over])
    expect(refused.status, refused.stderr).toBe(2)
    expect(refused.stderr).toContain(`The run ${over} has ended: its state is finished. A copy lives only as long as its run, so make makes none for it.`)
    expect(copiesIn(there)).toEqual([])
  })

  it('make refuses a run no record names, as a run that cannot be read', () => {
    const there = aSandbox('no-such-run')
    const refused = officeCopy(['make', '--to', 'no-such-run', '--for', 'NoSuchRun0001'])
    expect(refused.status, refused.stderr).toBe(2)
    expect(refused.stderr).toContain('The run NoSuchRun0001 cannot be read, so it is treated as ended: no record in the office')
    expect(copiesIn(there)).toEqual([])
  })
})

describe('a copy lives only as long as its run', () => {
  it('open refuses a copy whose run has ended, and the copy is gone', () => {
    const ending = aRun('A made-up run that ends after its copy')
    const there = aSandbox('ends')
    expect(officeCopy(['make', '--to', 'ends', '--for', ending]).status).toBe(0)
    end(ending)
    const refused = officeCopy(['open', '--in', 'ends', '--for', ending])
    expect(refused.status, refused.stderr).toBe(2)
    expect(refused.stderr).toContain(`The run ${ending} has ended: its state is finished. A copy lives only as long as its run, so open opens none for it.`)
    expect(copiesIn(there)).toEqual([])
    expect(readFileSync(join(there, 'office-copy.log'), 'utf8')).toContain(
      `sweep: removed ${join(there, `office-copy-${ending}.db.gz`)}, because the run it is for, ${ending}, has ended: its state is finished.`,
    )
  }, 120_000)

  it('open refuses a copy whose run cannot be read, and the copy is gone', () => {
    const there = aSandbox('unread')
    copyFileSync(join(out, `office-copy-${run}.db.gz`), join(there, 'office-copy-NoSuchRun0002.db.gz'))
    const refused = officeCopy(['open', '--in', 'unread', '--for', 'NoSuchRun0002'])
    expect(refused.status, refused.stderr).toBe(2)
    expect(refused.stderr).toContain('The run NoSuchRun0002 cannot be read, so it is treated as ended')
    expect(copiesIn(there)).toEqual([])
  })

  it('the sweep removes every copy whose run has ended or cannot be read, says why in each log, and keeps the others', () => {
    const going = aRun('A made-up run still going at the sweep')
    const kept = aSandbox('sweep-kept')
    expect(officeCopy(['make', '--to', 'sweep-kept', '--for', going]).status).toBe(0)
    expect(officeCopy(['open', '--in', 'sweep-kept', '--for', going]).status).toBe(0)

    const ending = aRun('A made-up run that ends before the sweep')
    const endedHere = aSandbox('sweep-ended')
    expect(officeCopy(['make', '--to', 'sweep-ended', '--for', ending]).status).toBe(0)
    expect(officeCopy(['open', '--in', 'sweep-ended', '--for', ending]).status).toBe(0)

    // TWO UNPACKED COPIES RENAMED BY HAND, whose names name no run and whose markers still do; and a
    // database that is no copy, which the sweep must leave.
    copyFileSync(join(endedHere, `office-copy-${ending}.db`), join(endedHere, 'renamed-by-hand.db'))
    copyFileSync(unpacked, join(kept, 'renamed-too.db'))
    const notACopy = new Database(join(kept, 'not-a-copy.db'))
    notACopy.exec('CREATE TABLE runtime_settings (name TEXT PRIMARY KEY, value TEXT)')
    notACopy.close()
    end(ending)

    // AN OLD COPY WITH NO RUN IN ITS NAME, and an unpacked copy whose marker names another run than its name.
    const unread = aSandbox('sweep-unread')
    copyFileSync(join(out, `office-copy-${run}.db.gz`), join(unread, 'office-copy.db.gz'))
    copyFileSync(unpacked, join(unread, `office-copy-${going}.db`))

    const swept = officeCopy(['sweep'])
    expect(swept.status, swept.stderr).toBe(0)
    expect(readdirSync(kept).sort()).toEqual(['not-a-copy.db', `office-copy-${going}.db`, `office-copy-${going}.db.gz`, 'office-copy.log', 'renamed-too.db'])
    expect(copiesIn(out)).toEqual([`office-copy-${run}.db`, `office-copy-${run}.db.gz`])
    expect(readdirSync(endedHere)).toEqual(['office-copy.log'])
    expect(copiesIn(unread)).toEqual([])
    expect(swept.stdout).toContain(', and removed 5, whose run had ended or could not be read.')
    const endedLog = readFileSync(join(endedHere, 'office-copy.log'), 'utf8')
    expect(endedLog).toContain(`because the run it is for, ${ending}, has ended: its state is finished.`)
    expect(endedLog).toContain(
      `sweep: removed ${join(endedHere, 'renamed-by-hand.db')}, a copy found by its marker, because the run it is for, ${ending}, has ended: its state is finished.`,
    )
    const unreadLog = readFileSync(join(unread, 'office-copy.log'), 'utf8')
    expect(unreadLog).toContain(
      `sweep: removed ${join(unread, 'office-copy.db.gz')}, because the run it is for cannot be read, so it is treated as ended: it was made before a copy named its run.`,
    )
    expect(unreadLog).toContain(`its marker names the run ${run}, and its name the run ${going}`)
  }, 300_000)
})

describe('the schema stays whole', () => {
  it("the copy's triggers equal the source's, by name and SQL", () => {
    const fromTheSource = triggersOf(source.client.sqlite)
    expect(fromTheSource.length, 'the source has no trigger, so this proves nothing').toBeGreaterThan(0)
    expect(opened(unpacked, triggersOf)).toEqual(fromTheSource)
  })

  it("every other table, index and view of the copy equals the source's, and none is added", () => {
    expect(opened(unpacked, theRestOfTheSchemaOf)).toEqual(theRestOfTheSchemaOf(source.client.sqlite))
  })

  it('the unpacked copy is the only file there: no write-ahead log beside it', () => {
    expect(existsSync(unpacked), 'there is no unpacked copy, so this proves nothing').toBe(true)
    expect(existsSync(`${unpacked}-wal`)).toBe(false)
  })
})
