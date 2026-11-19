// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WRITERS THE STORE RECORDS, MATCHED WITH THE PROCESSES THE HOST LISTS. Wave 13s round 166, item 30c part 3.
 *
 * The re-mint's writer register needs each process the host's census lists to be one the store records, or said not to
 * be. src/server/db/remint-writers-matched.ts matches the store's census with the host's, and tools/match-the-writers.mjs
 * runs it on a database file and a census file. Here a throwaway office holds made-up runs, an office part and held
 * process rows, and a made-up host census in the declared form lists made-up processes. Cases:
 *   1. a process with a held row's pid and start is matched to the row's run by pid and start, naming the row; the
 *      process an office part's record names is matched to the part's run; a live process of an ended run is matched
 *      to that run, with its state as stored;
 *   2. a process naming a run that has not ended, with no row, is matched by the run; a held row that recorded no start
 *      is not matched by its pid alone; a run no process is matched to is listed with why;
 *   3. a process with a held row's pid and another start is not matched to that row, and each is listed with why; so are
 *      a process naming no run, one naming an ended run, given that run's state, one naming an id no record has, and a
 *      held process row whose key is not a pid;
 *   4. no tie is broken by a guess: a row two processes match is matched to neither, and a process the rows of two runs
 *      match is matched to none, with both rows saying so; each process that shares a held row's pid and start with
 *      another says a held row has them and the ledger cannot tell which of them it records;
 *   5. nothing is dropped: each host line, each run not ended, each held process row and each recorded office process is
 *      in exactly one place, a port row is in none, and the match is complete;
 *   6. the host's census is read as declared: a line with any one declared field wrong, a line that is not JSON, a line
 *      after the summary, and a census with no summary last are each named as not read, and a line not read is matched
 *      to nothing; a store census naming a row it could not read is named too; each makes the match incomplete;
 *   7. the tool prints the match from a copy of the store and a census file, and exits 0 when it is complete and 1 when it
 *      is not; a relative path, a census that is not there and a third argument are each refused with exit 2 and no
 *      match; the store's bytes are as they were, and nothing is made beside it or where the tool runs.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-writers-are-matched-with-the-hosts.test.ts
 * After a green control, copy src/server/db/remint-writers-matched.ts and tools/match-the-writers.mjs, then make one of
 * these changes:
 *   1. put `true` in place of `theRowIsAboutThisProcess(startedAt, { startedAt: one.startLocal }).same === true`: a pid
 *      alone matches, and case 3 goes red;
 *   2. delete the line `if (entry.startedAt === null) { noProcess(entry, THE_MATCH_SAYS.noStartRecorded); continue }`:
 *      the row with no start is listed for another reason, and case 2 goes red;
 *   3. put `if (false) {` in place of `if (found.length > 1) {`: the tie is broken by taking the first process, and
 *      case 4 goes red;
 *   4. put `if (false) {` in place of `if (theirRuns.size > 1) {`: the rows of two runs are dropped, and cases 4 and 5
 *      go red;
 *   5. put `true` in place of `going.has(one.runId)`: a process naming an ended run is matched by it, and case 3 goes
 *      red;
 *   6. put `runState: null` in place of `runState: runStateOf.get(one.runId) ?? null`: the ended run's state is not
 *      given, and case 3 goes red;
 *   7. delete the line `for (const held of store.apart) if (held.type === 'process') entries.push(`: a live process of an
 *      ended run is not matched to it, and cases 1 and 5 go red;
 *   8. delete the line `if (run.recordedProcess !== null) entries.push(`: the office part's process is not matched, and
 *      cases 1 and 5 go red;
 *   9. put `if (true)` in place of the first `if (held.type === 'process')`: a port row is matched as a process, and
 *      case 5 goes red;
 *  10. put `!A_STAMP.test('2026-10-31 00:00:00')` in place of `!A_STAMP.test(start['startLocal'])`: a start that is not a
 *      local time is read, and case 6 goes red;
 *  11. put `false` in place of `!(HOST_PROCESS_KINDS as readonly string[]).includes(kind)`: a kind the census does not
 *      declare is read, and case 6 goes red;
 *  12. delete the line `if (summaryAt === null) unread.push(`: a census cut short is complete, and cases 6 and 7 go red;
 *  13. delete the line `for (const one of store.unread) unread.unshift(`: a store census naming a row not read makes a
 *      complete match, and cases 6 and 7 go red;
 *  14. in match-the-writers.mjs, put `process.exit(0)` in place of `process.exit(matched.complete ? 0 : 1)`: case 7 goes
 *      red;
 *  15. put `THE_MATCH_SAYS.namesNoRun` in place of `THE_MATCH_SAYS.oneOfTwoProcesses`: the two tied processes carry a
 *      reason whose words say the store holds no row with their pid and start, and case 4 goes red.
 * Restore each file with cp after each change, check it with cmp, and run the command again for green.
 *
 * Every id, pid, time and name here is made up, in a throwaway office. The tool is given only PATH, LANG, a made-up home
 * in the test's own folder and MOLE_OFFICE_DB naming a file nobody makes, so it reads no settings file of anybody's.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_API_SERVER, theOwnPartBlock } from '../src/config/own-rows.mjs'
import { RUN_IS_OVER_STATES } from '../src/config/the-session-note.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { HOST_PROCESS_KINDS, HOST_WINDOWS, THE_MATCH_SAYS, matchTheWriters, type TheWritersMatched } from '../src/server/db/remint-writers-matched.ts'
import { theWritersOnRecord, type TheWritersOnRecord } from '../src/server/db/remint-writers.ts'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const THE_TOOL = join(REPO, 'tools/match-the-writers.mjs')
const NODE = realpathSync(process.execPath)
const WHEN = '2026-10-31 03:00:00'
const ONE_START = '2026-10-31 02:30:00'
const ANOTHER_START = '2026-10-31 02:31:00'
const THE_PARTS_START = '2026-10-31 02:00:00'
const ENDED = RUN_IS_OVER_STATES[0]!

let t: TestDb
const db = () => t.client.sqlite
const folder = () => dirname(t.file)
const runs: Record<string, string> = {}
let store: TheWritersOnRecord
let match: TheWritersMatched
/** The made-up host census, and a copy of the store for the tool to read. */
let hostLines: Record<string, unknown>[] = []
let theStore = ''

/** A run filed by the records door, then given exactly the data the case needs. */
function aRun(title: string, data: Record<string, unknown> | string): string {
  const id = t.api.createRecord({ kind: 'session', title, workspaceId: 'default', actor: { type: 'human', id: THE_PERSON }, origin: 'fixture', data: { state: 'running' } }).id
  db().prepare('UPDATE records SET data = ? WHERE id = ?').run(typeof data === 'string' ? data : JSON.stringify(data), id)
  return id
}

/** A row of the process ledger, held. */
function aLedgerRow(id: string, run: string, type: string, key: string, startedAt: string | null): void {
  db().prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail, registered_at, registered_by, released_at, released_by, started_by_the_product) VALUES (?, 'default', ?, ?, ?, NULL, ?, ?, ?, 'agent:fixture', NULL, NULL, NULL)")
    .run(id, run, type, key, startedAt, `A made-up ${type} of the test`, WHEN)
}

/** One process line in the declared form. */
function aProcess(writer: string | null, runId: string | null, hostPid: number, startLocal: string, more: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    runId,
    pids: { hostPid, containerPid: null },
    start: { startLocal, startTicks: hostPid * 100 },
    pgid: hostPid,
    container: null,
    kind: HOST_PROCESS_KINDS.at(-1),
    name: `made-up-process-${String(hostPid)}`,
    window: HOST_WINDOWS[0],
    how: 'A made-up way to stop it.',
    agent: null,
    holdsStore: false,
    cmd: 'made-up command',
    holdsIds: false,
    writer,
    ...more,
  }
}
const SUMMARY = { summary: { processes: 0 } }
const aCensus = (lines: unknown[]) => lines.map((line) => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n') + '\n'
const theProcessAt = (m: TheWritersMatched, hostPid: number) => m.processes.filter((one) => one.hostPid === hostPid)

beforeAll(async () => {
  t = await freshDb()
  runs['held'] = aRun('A made-up run holding a process', { state: 'running' })
  runs['named'] = aRun('A made-up run a process names', { state: 'idle' })
  runs['alone'] = aRun('A made-up run with no process', { state: 'running' })
  runs['other start'] = aRun('A made-up run whose process started at another time', { state: 'running' })
  runs['no start'] = aRun('A made-up run whose row recorded no start', { state: 'running' })
  runs['tie'] = aRun('A made-up run whose row two processes match', { state: 'running' })
  runs['two runs 1'] = aRun('A made-up run sharing a pid and start', { state: 'running' })
  runs['two runs 2'] = aRun('Another made-up run sharing a pid and start', { state: 'running' })
  runs['not a pid'] = aRun('A made-up run whose process row has no pid', { state: 'running' })
  runs['server'] = aRun(THE_API_SERVER, { state: 'running', workingDirectory: '/made/up/checkout', extra: theOwnPartBlock({ role: THE_API_SERVER, port: 1, checkout: '/made/up/checkout' }, 4243, THE_PARTS_START) })
  runs['ended'] = aRun('A made-up ended run', { state: ENDED })
  aLedgerRow('row-held', runs['held'], 'process', '5001', ONE_START)
  aLedgerRow('row-port', runs['held'], 'port', '9001', null)
  aLedgerRow('row-other-start', runs['other start'], 'process', '5002', ONE_START)
  aLedgerRow('row-no-start', runs['no start'], 'process', '5003', null)
  aLedgerRow('row-tie', runs['tie'], 'process', '5004', ONE_START)
  aLedgerRow('row-two-runs-1', runs['two runs 1'], 'process', '5005', ONE_START)
  aLedgerRow('row-two-runs-2', runs['two runs 2'], 'process', '5005', ONE_START)
  aLedgerRow('row-not-a-pid', runs['not a pid'], 'process', 'not-a-pid', ONE_START)
  aLedgerRow('row-of-the-ended-run', runs['ended'], 'process', '6001', ONE_START)
  store = theWritersOnRecord(db())

  hostLines = [
    aProcess('the-held-writer', null, 5001, ONE_START),
    aProcess('the-servers-writer', null, 4243, THE_PARTS_START),
    aProcess('the-ended-runs-writer', null, 6001, ONE_START),
    aProcess('the-named-writer', runs['named']!, 7001, ONE_START),
    aProcess('the-no-start-writer', runs['no start']!, 5003, ONE_START),
    aProcess('the-other-start-writer', null, 5002, ANOTHER_START),
    aProcess(null, null, 8001, ONE_START),
    aProcess('a-writer-of-an-ended-run', runs['ended']!, 7002, ONE_START),
    aProcess('a-writer-of-no-record', 'no-record-has-this-id', 7003, ONE_START),
    aProcess('the-first-tied-writer', null, 5004, ONE_START),
    aProcess('the-second-tied-writer', null, 5004, ONE_START),
    aProcess('the-shared-writer', null, 5005, ONE_START),
  ]
  match = matchTheWriters(store, aCensus([...hostLines, SUMMARY]))
  theStore = join(folder(), 'the-store.db')
  db().prepare('VACUUM INTO ?').run(theStore)
}, 120_000)
afterAll(() => t?.close())

describe('the writers the store records, matched with the processes the host lists', () => {
  it('1. matches a held row and an office part by pid and start, and a live process of an ended run to that run', () => {
    expect(theProcessAt(match, 5001)).toEqual([expect.objectContaining({ line: 1, writer: 'the-held-writer', run: runs['held'], by: 'pid-and-start', rows: ['row-held'], recorded: false, runState: null, why: null })])
    expect(theProcessAt(match, 4243)).toEqual([expect.objectContaining({ run: runs['server'], by: 'pid-and-start', rows: [], recorded: true, why: null })])
    expect(theProcessAt(match, 6001)).toEqual([expect.objectContaining({ run: runs['ended'], by: 'pid-and-start', rows: ['row-of-the-ended-run'], runState: ENDED, why: null })])
  })

  it('2. matches a process by the run it names, never a row by its pid alone, and lists a run with no process', () => {
    expect(theProcessAt(match, 7001)).toEqual([expect.objectContaining({ runId: runs['named'], run: runs['named'], by: 'run', rows: [], why: null })])
    expect(theProcessAt(match, 5003)).toEqual([expect.objectContaining({ run: runs['no start'], by: 'run', rows: [] })])
    expect(match.rowsWithNoProcess.filter((row) => row.row === 'row-no-start')).toEqual([{ row: 'row-no-start', run: runs['no start'], pid: '5003', startedAt: null, runState: null, why: THE_MATCH_SAYS.noStartRecorded }])
    expect(match.runsWithNoProcess.filter((run) => run.run === runs['alone'])).toEqual([{ run: runs['alone'], title: 'A made-up run with no process', state: 'running', ownPart: null, why: THE_MATCH_SAYS.noProcessForTheRun }])
    expect(match.runsWithNoProcess.map((run) => run.run)).not.toContain(runs['named'])
  })

  it('3. lists with why a process and a row that share only a pid, and every process the store does not record', () => {
    expect(theProcessAt(match, 5002)).toEqual([expect.objectContaining({ run: null, by: null, rows: [], why: THE_MATCH_SAYS.namesNoRun })])
    expect(match.rowsWithNoProcess.filter((row) => row.row === 'row-other-start')).toEqual([expect.objectContaining({ run: runs['other start'], why: THE_MATCH_SAYS.noProcessForTheRow })])
    expect(theProcessAt(match, 8001)).toEqual([expect.objectContaining({ writer: null, run: null, why: THE_MATCH_SAYS.namesNoRun })])
    expect(theProcessAt(match, 7002)).toEqual([expect.objectContaining({ runId: runs['ended'], run: null, by: null, runState: ENDED, why: THE_MATCH_SAYS.runNotGoing })])
    expect(theProcessAt(match, 7003)).toEqual([expect.objectContaining({ runId: 'no-record-has-this-id', run: null, runState: null, why: THE_MATCH_SAYS.runNotGoing })])
    expect(match.rowsWithNoProcess.filter((row) => row.row === 'row-not-a-pid')).toEqual([expect.objectContaining({ pid: 'not-a-pid', why: THE_MATCH_SAYS.keyIsNotAPid })])
  })

  it('4. breaks no tie by a guess', () => {
    expect(theProcessAt(match, 5004).map((one) => [one.run, one.why])).toEqual([[null, THE_MATCH_SAYS.oneOfTwoProcesses], [null, THE_MATCH_SAYS.oneOfTwoProcesses]])
    expect(match.rowsWithNoProcess.filter((row) => row.row === 'row-tie')).toEqual([expect.objectContaining({ why: THE_MATCH_SAYS.twoProcesses })])
    expect(theProcessAt(match, 5005)).toEqual([expect.objectContaining({ run: null, rows: [], why: THE_MATCH_SAYS.rowsOfTwoRuns })])
    expect(match.rowsWithNoProcess.filter((row) => row.pid === '5005').map((row) => [row.row, row.why])).toEqual([['row-two-runs-1', THE_MATCH_SAYS.twoRuns], ['row-two-runs-2', THE_MATCH_SAYS.twoRuns]])
  })

  it('5. drops nothing, and the match is complete', () => {
    expect(match.processes.map((one) => one.line)).toEqual(hostLines.map((_, index) => index + 1))
    expect(match.unread).toEqual([])
    expect(match.complete).toBe(true)
    const matchedRuns = new Set(match.processes.flatMap((one) => (one.run === null ? [] : [one.run])))
    for (const run of store.runs) expect(Number(matchedRuns.has(run.run)) + match.runsWithNoProcess.filter((one) => one.run === run.run).length, run.title).toBe(1)
    const processRows = [...store.runs.flatMap((run) => run.held), ...store.apart].filter((held) => held.type === 'process').map((held) => held.row)
    for (const row of processRows) {
      expect(match.processes.filter((one) => one.rows.includes(row)).length + match.rowsWithNoProcess.filter((one) => one.row === row).length, row).toBe(1)
    }
    const recorded = store.runs.filter((run) => run.recordedProcess !== null).map((run) => run.run)
    expect(recorded).toEqual([runs['server']])
    for (const run of recorded) {
      expect(match.processes.filter((one) => one.recorded && one.run === run).length + match.rowsWithNoProcess.filter((one) => one.row === null && one.run === run).length).toBe(1)
    }
    expect(match.processes.some((one) => one.rows.includes('row-port'))).toBe(false)
    expect(match.rowsWithNoProcess.some((one) => one.row === 'row-port')).toBe(false)
  })

  it('6. reads the host census as declared, and a census not read whole makes the match incomplete', () => {
    const good = aProcess('a-writer', runs['named']!, 7101, ONE_START)
    const broken: Record<string, Record<string, unknown>> = {
      writer: { ...good, writer: 1 },
      runId: { ...good, runId: 1 },
      'no runId': Object.fromEntries(Object.entries(good).filter(([key]) => key !== 'runId')),
      hostPid: { ...good, pids: { hostPid: 0, containerPid: null } },
      containerPid: { ...good, pids: { hostPid: 7101, containerPid: 'one' } },
      startLocal: { ...good, start: { startLocal: '2026-10-31T02:30:00.000Z', startTicks: 1 } },
      startTicks: { ...good, start: { startLocal: ONE_START, startTicks: -1 } },
      kind: { ...good, kind: 'a-made-up-kind' },
      name: { ...good, name: '' },
      window: { ...good, window: 'a-made-up-window' },
      holdsStore: { ...good, holdsStore: 'yes' },
    }
    for (const [field, line] of Object.entries(broken)) {
      const read = matchTheWriters(store, aCensus([good, line, SUMMARY]))
      expect(read.processes.map((one) => one.line), field).toEqual([1])
      expect(read.unread.map((one) => [one.from, one.at]), field).toEqual([['host', 'line 2']])
      expect(read.complete, field).toBe(false)
    }
    expect(matchTheWriters(store, aCensus([good, SUMMARY])).complete).toBe(true)
    const notJson = matchTheWriters(store, aCensus([good, '{"pids":', SUMMARY]))
    expect(notJson.unread.map((one) => one.at)).toEqual(['line 2'])
    const after = matchTheWriters(store, aCensus([good, SUMMARY, good]))
    expect([after.processes.map((one) => one.line), after.unread.map((one) => one.at), after.complete]).toEqual([[1], ['line 3'], false])
    const cut = matchTheWriters(store, aCensus([good]))
    expect([cut.unread, cut.complete]).toEqual([[{ from: 'host', at: 'the end', why: THE_MATCH_SAYS.noSummary }], false])
    const storeNotWhole = matchTheWriters({ ...store, unread: [{ table: 'records', row: 'a-made-up-row', why: 'A made-up reason.' }] }, aCensus([good, SUMMARY]))
    expect([storeNotWhole.unread, storeNotWhole.complete]).toEqual([[{ from: 'store', at: 'records a-made-up-row', why: 'A made-up reason.' }], false])
  })

  it('7. the tool prints the match, exits by whether it is complete, refuses what it cannot read, and changes nothing', () => {
    const before = createHash('sha256').update(readFileSync(theStore)).digest('hex')
    const census = (name: string, lines: unknown[]) => {
      const path = join(folder(), name)
      writeFileSync(path, aCensus(lines))
      return path
    }
    const whole = theTool([theStore, census('whole.jsonl', [...hostLines, SUMMARY])])
    expect(whole.status, whole.stderr).toBe(0)
    const printed = JSON.parse(whole.stdout) as TheWritersMatched & { database: string; hostCensus: string }
    expect(printed.database).toBe(theStore)
    expect({ ...printed, database: undefined, hostCensus: undefined }).toEqual({ ...match, database: undefined, hostCensus: undefined })
    const cut = theTool([theStore, census('cut.jsonl', hostLines)])
    expect(cut.status, cut.stderr).toBe(1)
    expect((JSON.parse(cut.stdout) as TheWritersMatched).unread).toEqual([{ from: 'host', at: 'the end', why: THE_MATCH_SAYS.noSummary }])
    mkdirSync(join(folder(), 'not-whole'))
    const notWhole = join(folder(), 'not-whole', 'office.db')
    aRunIn(notWhole)
    const unread = theTool([notWhole, census('whole-again.jsonl', [...hostLines, SUMMARY])])
    expect(unread.status, unread.stderr).toBe(1)
    expect((JSON.parse(unread.stdout) as TheWritersMatched).unread.map((one) => one.from)).toEqual(['store'])
    for (const asked of [['the-store.db', census('relative.jsonl', [SUMMARY])], [theStore, join(folder(), 'no-census-here.jsonl')], [theStore, census('third.jsonl', [SUMMARY]), 'more']]) {
      const refused = theTool(asked)
      expect([refused.status, refused.stdout], asked.join(' ')).toEqual([2, ''])
    }
    expect(createHash('sha256').update(readFileSync(theStore)).digest('hex')).toBe(before)
    expect(['-journal', '-wal', '-shm'].filter((suffix) => existsSync(theStore + suffix))).toEqual([])
  })
})

/** A copy of the store at `path` holding one more run, whose data is not an object, so its census names it as not read. */
function aRunIn(path: string): void {
  const id = aRun('A made-up run whose data is not an object', '["not", "an", "object"]')
  db().prepare('VACUUM INTO ?').run(path)
  db().prepare('UPDATE records SET deleted_at = ? WHERE id = ?').run(WHEN, id)
}

interface Ran { status: number | null; stdout: string; stderr: string }
/** THE TOOL with these arguments, run from a folder of its own that it must leave empty. */
function theTool(asked: string[]): Ran {
  const home = join(folder(), 'home')
  mkdirSync(home, { recursive: true })
  const where = join(folder(), `ran-${String(readdirSync(folder()).filter((name) => name.startsWith('ran-')).length + 1)}`)
  mkdirSync(where)
  const it = spawnSync(NODE, [THE_TOOL, ...asked], { cwd: where, env: { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: join(where, 'office.db') }, encoding: 'utf8' })
  if (it.error !== undefined) throw it.error
  expect(readdirSync(where), 'the tool makes nothing where it runs, and MOLE_OFFICE_DB names a file it never makes').toEqual([])
  return { status: it.status, stdout: it.stdout, stderr: it.stderr }
}
