// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WRITERS A STORE HAS ON RECORD, FOR THE RE-MINT'S WRITER REGISTER. Wave 13s round 164, item 30c part 3.
 *
 * Before the window the re-mint needs a register of every writer to hold or stop, one entry for each instance.
 * src/server/db/remint-writers.ts reads the part of it a store records, and tools/the-writers-on-record.mjs prints it
 * from a database file opened read-only and immutable. Here a throwaway office holds made-up agents, runs in every
 * state, two of the office's own parts, and process-ledger rows held and released. Cases:
 *   1. every run that has not ended is its own entry, with its state as stored, and no finished, crashed, paused,
 *      orphaned or deleted run is one. A run whose state is not a word is an entry with no state;
 *   2. each entry names its agent as the record stores it, then by the canonical id and that id's handle; an id no agent
 *      has gives no handle, and a run that stores only a name is not resolved by that name;
 *   3. each row the ledger still holds is under its run, a released row is in no list, and a held row whose run has
 *      ended, was deleted, could not be read, is not a run, or has no record is listed apart, saying which. An ended
 *      run's state and the kind of a record that is not a run are given beside the reason, as stored;
 *   4. the office's own parts are entries with their part and the process their record says they are, and only the
 *      terminal holder is marked to keep running;
 *   5. after the re-mint, planned and written as the migration does, the census lists the same runs and rows, with each
 *      agent under its new id and the same handle;
 *   6. a run whose data is not a JSON object, and a run whose state is not a word, are named as not read, and the tool
 *      prints the census it read and exits 1; on a copy with both runs mended it prints no row as not read, and exits 0;
 *   7. on a file in write-ahead-log mode, as the office keeps its store, the tool leaves the file's bytes and times as
 *      they were and makes nothing beside it or where it runs; a file with a rollback journal beside it, a write-ahead
 *      log with anything in it, and a relative path are each refused with exit 2 and no census, and the log is not
 *      changed.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-writers-on-record.test.ts
 * After a green control, copy src/server/db/remint-writers.ts, tools/the-writers-on-record.mjs and
 * tools/open-immutable.mjs, then make one of these changes:
 *   1. in remint-writers.ts, put `false` in place of `RUN_IS_OVER_STATES.includes(state)`: every ended run is listed,
 *      and cases 1 to 6 go red;
 *   2. in remint-writers.ts, put `if (false) {` in place of `if (row.deletedAt !== null) {`: a deleted run is listed,
 *      and cases 1 to 6 go red;
 *   3. in remint-writers.ts, put `storedId` in place of `aliases.canonicalOf(storedId)`: after the re-mint an agent is
 *      not named by its new id, and case 5 goes red;
 *   4. in remint-writers.ts, put `handleOf.get(storedId)` in place of `handleOf.get(id)`: after the re-mint the stored
 *      id names no agent's row, so no handle is given, and case 5 goes red;
 *   5. in remint-writers.ts, put `aWord(data['servingAgentId'] ?? data['servingAgent'])` in place of
 *      `aWord(data['servingAgentId'])`: a run that stores only a name is resolved by it, and cases 2 and 5 go red;
 *   6. in remint-writers.ts, put `keepRunning: ownPart !== null,` in place of
 *      `keepRunning: ownPart === THE_TERMINAL_HOLDER,`: the API server is marked to keep running, and case 4 goes red;
 *   7. in remint-writers.ts, delete the line `run.held.push(held)`: no held row is under its run, and cases 3, 4 and 6
 *      go red;
 *   8. in remint-writers.ts, put `WHERE 1` in place of `WHERE released_at IS NULL`: a released row is listed, and cases
 *      3 and 6 go red;
 *   9. in remint-writers.ts, put `true ?` in place of `kind === undefined ?`: a row of a note is said to have no record,
 *      and case 3 goes red;
 *  10. in remint-writers.ts, delete the line `unread.push({ table: 'records', row: row.id, why: 'the run\'s data is not`:
 *      the run nothing can read is not named, and case 6 goes red;
 *  11. in the-writers-on-record.mjs, put `process.exit(0)` in place of `process.exit(read.unread.length ? 1 : 0)`:
 *      cases 6 and 7 go red;
 *  12. in open-immutable.mjs, put `if (false) return` in place of `if (beside('-journal') !== null) return`: case 7
 *      goes red;
 *  13. in open-immutable.mjs, put `if (false) return` in place of `if (log !== null && log.size > 0) return`: case 7
 *      goes red;
 *  14. in open-immutable.mjs, delete `?immutable=1`: the file is opened read-only but not immutable, a log and a
 *      shared-memory file are left beside it, and case 7 goes red;
 *  15. in remint-writers.ts, delete the line `if (state !== undefined && typeof state !== 'string') unread.push(`: a
 *      state that is not a word is not named, and case 6 goes red;
 *  16. in remint-writers.ts, put `runState: null` in place of `runState: state`: an ended run's state is not given, and
 *      cases 3 and 6 go red;
 *  17. in remint-writers.ts, put `recordKind: null` in place of `recordKind: kind ?? null`: the kind of the note is not
 *      given, and case 3 goes red.
 * Restore each file with cp after each change, check it with cmp, and run the command again for green.
 *
 * Every id, name, pid and row here is made up, in a throwaway office. The tool is given only PATH, LANG, a made-up home
 * in the test's own folder and MOLE_OFFICE_DB naming a file nobody makes, so it reads no settings file of anybody's.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_API_SERVER, THE_TERMINAL_HOLDER, theOwnPartBlock } from '../src/config/own-rows.mjs'
import { RUN_IS_OVER_STATES } from '../src/config/the-session-note.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { freshDb, type TestDb } from './helpers.ts'

type Census = import('../src/server/db/remint-writers.ts').TheWritersOnRecord

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const THE_TOOL = join(REPO, 'tools/the-writers-on-record.mjs')
const NODE = realpathSync(process.execPath)
const WHEN = '2026-10-31 03:00:00'
const THE_HOLDERS_START = '2026-10-31T02:00:00.000Z'
const THE_PROCESS_START = '2026-10-31T02:30:00.000Z'

let t: TestDb
const db = () => t.client.sqlite
const folder = () => dirname(t.file)
const runs: Record<string, string> = {}
let before: Census
let after: Census
let newIdOf: Map<string, string>
/** A copy of the store made before the re-mint, for the tool to read. */
let theStore = ''

/** A legacy agent's row, its id the handle it was registered with, as the live office's rows were before the re-mint. */
function aLegacyAgent(id: string, handle: string): void {
  db().prepare("INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated')").run(`avatar-default-agent-${id}`, WHEN)
  db().prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at, runtime, role, started_by_kind, started_by_id) VALUES (?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?)').run(id, `Made-up ${handle}`, handle, `avatar-default-agent-${id}`, WHEN, 'claude-code', 'worker', 'human', THE_PERSON)
}

/** A run filed by the records door, then given exactly the data the case needs, which may be data no door would write. */
function aRun(title: string, data: Record<string, unknown> | string): string {
  const id = t.api.createRecord({ kind: 'session', title, workspaceId: 'default', actor: { type: 'human', id: THE_PERSON }, origin: 'fixture', data: { state: 'running' } }).id
  db().prepare('UPDATE records SET data = ? WHERE id = ?').run(typeof data === 'string' ? data : JSON.stringify(data), id)
  return id
}

/** A row of the process ledger, held unless it is given a release. */
function aLedgerRow(id: string, run: string, type: string, key: string, more: { pgid?: number; startedAt?: string; byTheOffice?: 0 | 1; releasedAt?: string } = {}): void {
  db().prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail, registered_at, registered_by, released_at, released_by, started_by_the_product) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, 'agent:fixture', ?, ?, ?)")
    .run(id, run, type, key, more.pgid ?? null, more.startedAt ?? null, `A made-up ${type} of the test`, WHEN, more.releasedAt ?? null, more.releasedAt === undefined ? null : 'agent:fixture', more.byTheOffice ?? null)
}

beforeAll(async () => {
  t = await freshDb()
  aLegacyAgent('a-worker', 'a-worker')
  aLegacyAgent('old-heron', 'new-heron')
  runs['running'] = aRun('A made-up running run', { state: 'running', servingAgentId: 'a-worker', servingAgent: 'a-worker', startedByMoleOffice: true })
  runs['idle'] = aRun('A made-up idle run', { state: 'idle', servingAgentId: 'old-heron', servingAgent: 'new-heron' })
  runs['unknown'] = aRun('A made-up run in an unknown state', { state: 'unknown', servingAgentId: 'made-up-visitor' })
  runs['no state'] = aRun('A made-up run that records no state', { servingAgent: 'a-worker' })
  runs['holder'] = aRun(THE_TERMINAL_HOLDER, { state: 'running', workingDirectory: '/made/up/checkout', extra: theOwnPartBlock({ role: THE_TERMINAL_HOLDER, port: 1, checkout: '/made/up/checkout' }, 4242, THE_HOLDERS_START) })
  runs['server'] = aRun(THE_API_SERVER, { state: 'running', workingDirectory: '/made/up/checkout', extra: theOwnPartBlock({ role: THE_API_SERVER, port: 1, checkout: '/made/up/checkout' }, 4243, null) })
  runs['a number'] = aRun('A made-up run whose state is a number', { state: 7, servingAgentId: 'a-worker' })
  for (const state of RUN_IS_OVER_STATES) runs[state] = aRun(`A made-up ${state} run`, { state, servingAgentId: 'a-worker' })
  runs['deleted'] = aRun('A made-up deleted run', { state: 'running', servingAgentId: 'a-worker' })
  db().prepare('UPDATE records SET deleted_at = ? WHERE id = ?').run(WHEN, runs['deleted'])
  // THE STORE'S TEXT TRIGGER REFUSES DATA THAT IS NOT JSON AT ALL, as malformed JSON, so the run nothing can read is a list.
  runs['unread'] = aRun('A made-up run whose data is not an object', '["not", "an", "object"]')
  runs['note'] = t.api.createRecord({ kind: 'note', title: 'A made-up note', workspaceId: 'default', actor: { type: 'human', id: THE_PERSON }, origin: 'fixture', data: {} }).id

  aLedgerRow('row-of-the-running-process', runs['running'], 'process', '5001', { pgid: 5001, startedAt: THE_PROCESS_START, byTheOffice: 1 })
  aLedgerRow('row-of-the-running-port', runs['running'], 'port', '9001')
  aLedgerRow('row-released', runs['running'], 'process', '5002', { pgid: 5002, startedAt: THE_PROCESS_START, byTheOffice: 1, releasedAt: WHEN })
  aLedgerRow('row-of-the-holder', runs['holder'], 'process', '4242', { pgid: 4242, startedAt: THE_HOLDERS_START, byTheOffice: 1 })
  RUN_IS_OVER_STATES.forEach((state, n) => aLedgerRow(`row-of-the-${state}-run`, runs[state]!, 'process', String(6001 + n), { byTheOffice: 0 }))
  aLedgerRow('row-of-the-deleted-run', runs['deleted'], 'container', 'mole-office-sandbox-made-up')
  aLedgerRow('row-of-the-unread-run', runs['unread'], 'lock', '/made/up/lock')
  aLedgerRow('row-of-a-note', runs['note'], 'slot', 'a-made-up-slot')
  aLedgerRow('row-of-no-record', 'no-record-has-this-id', 'gpu', '0')

  const { theWritersOnRecord } = await import('../src/server/db/remint-writers.ts')
  before = theWritersOnRecord(db())
  theStore = join(folder(), 'the-store.db')
  db().prepare('VACUUM INTO ?').run(theStore)

  // THE RE-MINT, AS THE MIGRATION RUNS IT: the map planned from the office, then written.
  const { planTheRemint } = await import('../src/server/lib/registry-aliases/remint-map.ts')
  const { writeTheRemint } = await import('../src/server/lib/registry-aliases/remint-write.ts')
  let next = 0
  const plan = planTheRemint(db(), () => `MadeUpId_${String(++next).padStart(3, '0')}`)
  if (!('map' in plan)) throw new Error(plan.refused.join(' '))
  const written = writeTheRemint(db(), plan.map)
  if (!('written' in written)) throw new Error(written.refused.join(' '))
  newIdOf = new Map(plan.map.entries.map((entry) => [entry.oldId, entry.newId]))
  after = theWritersOnRecord(db())
}, 120_000)
afterAll(() => t?.close())

const theRun = (census: Census, name: string) => census.runs.find((run) => run.run === runs[name])!
const heldRow = (row: string, type: string, key: string, pgid: number | null, startedAt: string | null, startedByTheOffice: boolean | null) => ({ row, type, key, pgid, startedAt, detail: `A made-up ${type} of the test`, startedByTheOffice })

interface Ran {
  status: number | null
  stdout: string
  stderr: string
}
/** THE TOOL on `path`, run from a folder of its own that it must leave empty. */
function theTool(path: string): Ran {
  const home = join(folder(), 'home')
  mkdirSync(home, { recursive: true })
  const where = join(folder(), `ran-${String(readdirSync(folder()).filter((name) => name.startsWith('ran-')).length + 1)}`)
  mkdirSync(where)
  const it = spawnSync(NODE, [THE_TOOL, path], { cwd: where, env: { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: join(where, 'office.db') }, encoding: 'utf8' })
  if (it.error !== undefined) throw it.error
  expect(readdirSync(where), 'the tool makes nothing where it runs, and MOLE_OFFICE_DB names a file it never makes').toEqual([])
  return { status: it.status, stdout: it.stdout, stderr: it.stderr }
}
/** The journal, log and shared-memory files beside a database. */
const theFilesBeside = (file: string) => ['-journal', '-wal', '-shm'].filter((suffix) => existsSync(file + suffix))
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')
/** A copy of the store in a folder of its own. */
function aCopy(name: string): string {
  mkdirSync(join(folder(), name))
  const copy = join(folder(), name, 'office.db')
  copyFileSync(theStore, copy)
  return copy
}

describe('the census of a store', () => {
  it('1. lists every run that has not ended as its own entry, and no ended or deleted run', () => {
    expect(before.runs.map((run) => [run.title, run.state])).toEqual([
      ['A made-up running run', 'running'],
      ['A made-up idle run', 'idle'],
      ['A made-up run in an unknown state', 'unknown'],
      ['A made-up run that records no state', null],
      [THE_TERMINAL_HOLDER, 'running'],
      [THE_API_SERVER, 'running'],
      ['A made-up run whose state is a number', null],
    ])
    expect(before.runs.map((run) => run.run)).toEqual(['running', 'idle', 'unknown', 'no state', 'holder', 'server', 'a number'].map((name) => runs[name]))
    expect(theRun(before, 'running').startedByTheOffice).toBe(true)
    expect(theRun(before, 'idle').startedByTheOffice).toBe(false)
  })

  it('2. names each run\'s agent as stored, then by the canonical id and its handle, and never by a name alone', () => {
    expect(Object.fromEntries(before.runs.map((run) => [run.title, run.agent]))).toEqual({
      'A made-up running run': { storedId: 'a-worker', storedName: 'a-worker', id: 'a-worker', handle: 'a-worker' },
      'A made-up idle run': { storedId: 'old-heron', storedName: 'new-heron', id: 'old-heron', handle: 'new-heron' },
      'A made-up run in an unknown state': { storedId: 'made-up-visitor', storedName: null, id: 'made-up-visitor', handle: null },
      'A made-up run that records no state': { storedId: null, storedName: 'a-worker', id: null, handle: null },
      [THE_TERMINAL_HOLDER]: null,
      [THE_API_SERVER]: null,
      'A made-up run whose state is a number': { storedId: 'a-worker', storedName: null, id: 'a-worker', handle: 'a-worker' },
    })
  })

  it('3. puts each held ledger row under its run, leaves a released row out, and lists the rest apart with why', () => {
    expect(theRun(before, 'running').held).toEqual([
      heldRow('row-of-the-running-process', 'process', '5001', 5001, THE_PROCESS_START, true),
      heldRow('row-of-the-running-port', 'port', '9001', null, null, null),
    ])
    expect(JSON.stringify(before)).not.toContain('row-released')
    expect(before.runs.filter((run) => run.held.length > 0).map((run) => run.title)).toEqual(['A made-up running run', THE_TERMINAL_HOLDER])
    expect(before.apart.map(({ row, run, why, runState, recordKind }) => [row, run, why, runState, recordKind])).toEqual([
      ...RUN_IS_OVER_STATES.map((state) => [`row-of-the-${state}-run`, runs[state], 'its run has ended', state, null]),
      ['row-of-the-deleted-run', runs['deleted'], `its run was deleted at ${WHEN}`, null, null],
      ['row-of-the-unread-run', runs['unread'], 'its run\'s data could not be read', null, null],
      ['row-of-a-note', runs['note'], 'its run\'s record is not a run', null, 'note'],
      ['row-of-no-record', 'no-record-has-this-id', 'no record has its run\'s id', null, null],
    ])
    expect(before.apart[0]).toMatchObject({ type: 'process', key: '6001', pgid: null, startedAt: null, startedByTheOffice: false })
  })

  it('4. lists the office\'s own parts with the process their record names, and marks only the holder to keep running', () => {
    expect(before.runs.filter((run) => run.ownPart !== null).map(({ title, ownPart, keepRunning, recordedProcess }) => ({ title, ownPart, keepRunning, recordedProcess }))).toEqual([
      { title: THE_TERMINAL_HOLDER, ownPart: THE_TERMINAL_HOLDER, keepRunning: true, recordedProcess: { pid: 4242, startedAt: THE_HOLDERS_START } },
      { title: THE_API_SERVER, ownPart: THE_API_SERVER, keepRunning: false, recordedProcess: { pid: 4243, startedAt: null } },
    ])
    expect(theRun(before, 'holder').held).toEqual([heldRow('row-of-the-holder', 'process', '4242', 4242, THE_HOLDERS_START, true)])
    expect(before.runs.filter((run) => run.ownPart === null).map(({ keepRunning, recordedProcess }) => ({ keepRunning, recordedProcess }))).toEqual(Array(5).fill({ keepRunning: false, recordedProcess: null }))
  })

  it('5. lists the same runs and rows after the re-mint, each agent under its new id with the same handle', () => {
    const withoutAgents = (census: Census) => ({ ...census, runs: census.runs.map(({ agent: _agent, ...run }) => run) })
    expect(withoutAgents(after)).toEqual(withoutAgents(before))
    expect(newIdOf.get('a-worker')).toMatch(/^MadeUpId_/)
    expect(newIdOf.get('old-heron')).toMatch(/^MadeUpId_/)
    expect(Object.fromEntries(after.runs.map((run) => [run.title, run.agent]))).toEqual({
      'A made-up running run': { storedId: 'a-worker', storedName: 'a-worker', id: newIdOf.get('a-worker'), handle: 'a-worker' },
      'A made-up idle run': { storedId: 'old-heron', storedName: 'new-heron', id: newIdOf.get('old-heron'), handle: 'new-heron' },
      'A made-up run in an unknown state': { storedId: 'made-up-visitor', storedName: null, id: 'made-up-visitor', handle: null },
      'A made-up run that records no state': { storedId: null, storedName: 'a-worker', id: null, handle: null },
      [THE_TERMINAL_HOLDER]: null,
      [THE_API_SERVER]: null,
      'A made-up run whose state is a number': { storedId: 'a-worker', storedName: null, id: newIdOf.get('a-worker'), handle: 'a-worker' },
    })
  })
})

describe('the tool', () => {
  it('6. prints the census it read, names a run whose data is not an object as not read and exits 1, and exits 0 when all was read', () => {
    const read = theTool(theStore)
    expect(read.status, read.stderr).toBe(1)
    const printed = JSON.parse(read.stdout) as Census & { database: string; notOnRecord: string }
    expect(printed).toEqual({ database: theStore, notOnRecord: expect.stringContaining('the host\'s timers and watches') as unknown, ...before })
    expect(before.unread).toEqual([
      { table: 'records', row: runs['a number'], why: 'the run\'s state is not a word, so it is listed as a run that may still be going' },
      { table: 'records', row: runs['unread'], why: 'the run\'s data is not a JSON object, so whether it has ended cannot be read' },
    ])
    expect(read.stderr).toContain('7 runs not ended, holding 3 ledger rows; 8 ledger rows held for a run that has ended or is not there; 2 rows not read, so this census is incomplete.')

    const mended = aCopy('mended')
    const s = new Database(mended)
    try {
      s.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ state: 'finished' }), runs['unread'])
      s.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ state: 'running', servingAgentId: 'a-worker' }), runs['a number'])
    } finally {
      s.close()
    }
    expect(theFilesBeside(mended)).toEqual([])
    const whole = theTool(mended)
    expect(whole.status, whole.stderr).toBe(0)
    const all = JSON.parse(whole.stdout) as Census
    expect(all.unread).toEqual([])
    expect(all.runs).toEqual(before.runs.map((run) => (run.run === runs['a number'] ? { ...run, state: 'running' } : run)))
    expect(all.apart.find((row) => row.row === 'row-of-the-unread-run')).toMatchObject({ why: 'its run has ended', runState: 'finished' })
    expect(whole.stderr).toContain('0 rows not read.')
  })

  it('7. changes and makes nothing beside the file, and refuses a journal, a log that holds anything, and a relative path', () => {
    // IN WRITE-AHEAD-LOG MODE, AS THE OFFICE KEEPS ITS STORE (src/server/db/client.ts). A read-only open that is not
    // immutable leaves a log and a shared-memory file beside such a file.
    const file = aCopy('untouched')
    const s = new Database(file)
    try {
      expect(s.pragma('journal_mode = WAL', { simple: true })).toBe('wal')
    } finally {
      s.close()
    }
    expect([theFilesBeside(file), readFileSync(file)[18]]).toEqual([[], 2])
    const [bytes, times, beside] = [sha256(file), statSync(file), readdirSync(dirname(file))]
    expect(theTool(file).status).toBe(1)
    expect(sha256(file)).toBe(bytes)
    expect([statSync(file).mtimeMs, statSync(file).ctimeMs]).toEqual([times.mtimeMs, times.ctimeMs])
    expect(readdirSync(dirname(file))).toEqual(beside)

    const journalled = aCopy('journalled')
    writeFileSync(`${journalled}-journal`, 'made-up bytes of a write that never finished')
    const refusedForTheJournal = theTool(journalled)
    expect([refusedForTheJournal.status, refusedForTheJournal.stdout]).toEqual([2, ''])
    expect(refusedForTheJournal.stderr).toContain('has a rollback journal beside it')

    const logged = aCopy('logged')
    writeFileSync(`${logged}-wal`, 'made-up bytes not yet in the file')
    const refusedForTheLog = theTool(logged)
    expect([refusedForTheLog.status, refusedForTheLog.stdout]).toEqual([2, ''])
    expect(refusedForTheLog.stderr).toContain('write-ahead log holds 33 bytes')
    expect(readFileSync(`${logged}-wal`, 'utf8')).toBe('made-up bytes not yet in the file')

    const relative = theTool('untouched/office.db')
    expect([relative.status, relative.stdout]).toEqual([2, ''])
    expect(relative.stderr).toContain('is named by an absolute path')
  })
})
