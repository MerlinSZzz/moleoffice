// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE STARTS ITS HOST JOB RUNNER, KEEPS ONE, AND STOPS IT BY ITS GROUP.
 *
 * Round 56's open item 1 (mhmXNVQ7MGWo). Until wave 13q round 59 an asked host job waited for a user timer that
 * ran tools/run-the-host-jobs.mjs --once (JV4F6DbDiV4d). Now the office starts the runner itself
 * (src/server/lib/host-job-runner.ts), with --with-the-office=<its pid>.
 *
 * Two real offices, one after the other, on one database in this test's own temporary folder, with made-up keys and
 * two stand-in tools in that folder. Each office's runner is given that office's address and reads the keys beside
 * this test's database, so nothing here reaches the live office's port or any office but the test's own.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. With no host tool registered, the office starts no runner, and GET /api/host-tools says so in words.
 *   2. Once a tool is registered, a runner starts within a look, in a process group of its own, and is filed in the
 *      ledger under the API server's own session with its pid and group.
 *   3. It runs an asked job with no timer and no --once, and the job ends finished.
 *   4. One at a time: a person's --once beside it is refused by the lock, which names the office's runner, and no
 *      office has two runners at any of the samples taken five times a second for as long as it runs.
 *   5. When the office stops, it asks the runner's group to stop. The runner says it was asked, and ends the tool
 *      that was running by the tool's own group. The office waits for it to end, longer than the runner gives the tool
 *      after TERM, and closes the runner's row in the ledger before it exits.
 *   6. The next office starts a runner at once, since a tool is registered, and the job ends lost, saying the runner
 *      was asked to stop while the tool ran.
 *   7. A runner that dies is said in words, with how it ended and the last line of its log, and its row is closed,
 *      and another is started at once.
 *   8. At most AT_MOST_STARTS starts in THE_WINDOW_MS, as src/server/lib/host-job-runner-bounds.ts sets them. After
 *      that the words say when the next start is, and none runs.
 *   9. A runner whose office's process is gone stops by itself within seconds.
 *  10. A round of the runner that fails is said on one line, the runner goes on, and its next round takes a job.
 *
 * Every number the code sets (the look, the bound, its window, the pause and the grace) is read from the code, and so
 * is every sentence the runner says (THE_RUNNERS_WORDS). The office's two sentences that hold a time it chose are built
 * from its own (theRunnerRuns, theStartsAreUsedUp), with each second from just before the start to just after it. The
 * runner here is a real process, so it holds the job in a scope of its own only where systemd-run --user can start one;
 * case 6 reads which way held the job from the job.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   - `theRunner !== null` taken out of the keeper's look: case 4 goes red (a second row while one runs);
 *   - the runner's stop taken out of the office's shutdown: case 5 goes red (the runner was not asked);
 *   - the keeper's stop no longer waiting for the runner to end: case 5 goes red (the row is open when the office has
 *     exited, since the runner was still there when the office closed what its session left);
 *   - the row's release taken out of the keeper's stop: case 5 goes red (the row is closed by the session's end, with
 *     no word that the office stopped the runner);
 *   - the wait for a stopped runner made shorter than the runner's grace: case 5 goes red;
 *   - the TERM handler taken out of runWithTheOffice: case 5 goes red (the tool's group outlives the runner);
 *   - the bound taken out of the keeper's look: case 8 goes red (a fourth start);
 *   - the next start said a window after the last start rather than the first: case 8 goes red (a later second);
 *   - the running sentence given its start in another form than localStamp's: case 2 goes red;
 *   - the office's process no longer watched in runWithTheOffice: case 9 goes red;
 *   - the catch taken out of runWithTheOffice's round: case 10 goes red (the runner ends at the failed round).
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { theSha256Of } from '../src/config/host-tools.mjs'
import {
  AT_MOST_STARTS,
  THE_LOOK_MS,
  THE_NOTE_OF_A_STOPPED_RUNNER,
  THE_STOP_WAIT_MS,
  THE_WINDOW_MS,
  theRunnerRuns,
  theStartsAreUsedUp,
} from '../src/server/lib/host-job-runner-bounds.ts'
import { HOST_JOB_HOLDINGS } from '../src/shared/host-jobs.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { aFreePortBelowTheEphemeralRange } from './a-free-port-below-the-ephemeral-range.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { THE_GRACE_MS, THE_PAUSE_MS, THE_RUNNERS_WORDS } from '../tools/run-the-host-jobs.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** Made-up keys, written beside the test's database before the first office starts. */
const OFFICE_KEY = randomBytes(32).toString('hex')
const PERSON_KEY = randomBytes(32).toString('hex')

const ASKER = 'a-lab-worker'
// THE LEDGER PUTS THE COMMAND LINE AFTER the detail the office gives.
const THE_RUNNERS_DETAIL = 'the Mole Office host job runner — '

let dir = ''
let database = ''
let runnerFolder = ''
let theLog = ''
let theDecision = ''
const idOf: Record<string, string> = {}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-key': PERSON_KEY,
}
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': OFFICE_KEY,
}
const keyOf: Record<string, string> = {}

/** The environment of every process this test starts: the test's database and HOME, and no identity of its own run. */
function theEnvironment(over: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: dir,
    MOLE_OFFICE_DB: database,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_API: undefined,
    MOLE_OFFICE_AGENT: undefined,
    MOLE_OFFICE_SESSION: undefined,
    MOLE_AGENT_KEY: undefined,
    VITEST: undefined,
    VITEST_WORKER_ID: undefined,
    ...over,
  }
}

/** Every stamp of a second from `from` to `to`: a start the office stamped between the two is stamped with one of them. */
function theStampsBetween(from: number, to: number): string[] {
  const stamps: string[] = []
  for (let second = Math.floor(from / 1000); second <= Math.floor(to / 1000); second += 1) stamps.push(localStamp(new Date(second * 1000)))
  return stamps
}

/** A process that is there and not a zombie waiting for its parent. */
function stillThere(pid: number): boolean {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  try {
    return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${String(pid)}/stat`, 'utf8'))
  } catch {
    return false
  }
}

/** Whether any process is in a group. */
function aGroupIsThere(pgid: number): boolean {
  try {
    process.kill(-pgid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** The process group a process is in, from /proc. */
function theGroupOf(pid: number): number {
  const stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8')
  return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2])
}

function signalGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

/** The runners of one office now running: each process started with --with-the-office=<that office's pid>. */
function theRunnersOf(officePid: number): number[] {
  const mark = `--with-the-office=${String(officePid)}`
  const found: number[] = []
  for (const name of readdirSync('/proc')) { // machine-wide on purpose: the office's ledger is what this test checks, and a runner the office started without filing it is named in no row or file this test reads, so only a look at every process can show there is none; it keeps only those started with this office's pid
    if (!/^\d+$/.test(name)) continue
    let argv: string[]
    try {
      argv = readFileSync(`/proc/${name}/cmdline`, 'utf8').split('\0')
    } catch {
      continue
    }
    if (argv.includes(mark) && argv.some((one) => one.endsWith('run-the-host-jobs.mjs')) && stillThere(Number(name))) found.push(Number(name))
  }
  return found
}

interface ARow {
  id: string
  session: string
  key: string
  pgid: number | null
  released: string | null
  note: string | null
}

/** The runner's rows in the ledger, read with a connection of their own. */
function theRunnersRows(): ARow[] {
  const db = new Database(database, { readonly: true, fileMustExist: true })
  try {
    return db
      .prepare(
        'SELECT id, session_record_id AS session, key, pgid, released_at AS released, release_note AS note FROM session_resources ' +
          "WHERE type = 'process' AND substr(detail, 1, ?) = ? ORDER BY registered_at, rowid",
      )
      .all(THE_RUNNERS_DETAIL.length, THE_RUNNERS_DETAIL) as ARow[]
  } finally {
    db.close()
  }
}

function aRecordsTitle(id: string): string | null {
  const db = new Database(database, { readonly: true, fileMustExist: true })
  try {
    return (db.prepare('SELECT title FROM records WHERE id = ?').get(id) as { title: string } | undefined)?.title ?? null
  } finally {
    db.close()
  }
}

function theJobData(id: string): Record<string, any> {
  const db = new Database(database, { readonly: true, fileMustExist: true })
  try {
    return JSON.parse((db.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, any>
  } finally {
    db.close()
  }
}

async function until<T>(what: string, read: () => T | Promise<T>, ok: (value: T) => boolean, withinMs: number): Promise<T> {
  const by = Date.now() + withinMs
  let value = await read()
  while (!ok(value) && Date.now() < by) {
    await sleep(100)
    value = await read()
  }
  if (!ok(value)) throw new Error(`${what} did not happen within ${String(withinMs / 1000)} seconds; the last reading was ${JSON.stringify(value)}`)
  return value
}

interface AnOffice {
  pid: number
  api: string
  said: () => string
  exited: () => boolean
  ended: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  /** The most runners of this office seen running at once. */
  most: () => number
  stopSampling: () => void
}

const theOffices: AnOffice[] = []

/** A real office on this test's database, on a port of its own, and a sampling of its runners five times a second. */
async function anOffice(): Promise<AnOffice> {
  const port = await aFreePortBelowTheEphemeralRange()
  const remotePort = await aFreePortBelowTheEphemeralRange([port])
  const api = `http://127.0.0.1:${String(port)}`
  let output = ''
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts', `--stop-with-pid=${String(process.pid)}`], {
    cwd: REPO,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: theEnvironment({
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_REMOTE_PORT: String(remotePort),
      MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: '127.0.0.2',
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_MESSAGE_WORKER: 'off',
      MOLE_OFFICE_PIXEL_OFFICE: 'off',
      LOG_LEVEL: 'info',
      NODE_ENV: 'development',
    }),
  })
  if (child.pid === undefined) throw new Error('The test office did not start.')
  const pid = child.pid
  child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
  child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })
  let exited = false
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done) => {
    child.once('exit', (code, signal) => {
      exited = true
      done({ code, signal })
    })
  })
  let most = 0
  const sampling = setInterval(() => {
    most = Math.max(most, theRunnersOf(pid).length)
  }, 200)
  const office: AnOffice = { pid, api, said: () => output, exited: () => exited, ended, most: () => most, stopSampling: () => clearInterval(sampling) }
  theOffices.push(office)
  await until(
    'The test office answering',
    async () => {
      if (exited) throw new Error(`The test office exited before it answered.\n${output}`)
      try {
        return (await fetch(`${api}/api/host-tools`, { headers: AS_THE_PERSON })).status
      } catch {
        return null
      }
    },
    (status) => status === 200,
    90_000,
  )
  return office
}

async function send(office: AnOffice, method: 'GET' | 'POST', path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: any; text: string }> {
  const reply = await fetch(`${office.api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  let parsed: any = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  return { status: reply.status, body: parsed, text }
}

async function theRunnerSays(office: AnOffice): Promise<{ running: boolean; pid: number | null; says: string }> {
  const listed = await send(office, 'GET', '/api/host-tools', AS_THE_PERSON)
  expect(listed.status, listed.text.slice(0, 400)).toBe(200)
  return listed.body.runner
}

/** The runner script, started by hand as a person or a user timer would, with this test's database. */
function theRunnerByHand(args: string[]): { child: ChildProcess; out: () => string; ended: Promise<number | null> } {
  let out = ''
  const child = spawn(process.execPath, [join(REPO, 'tools', 'run-the-host-jobs.mjs'), ...args], { cwd: REPO, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: theEnvironment() })
  child.stdout?.on('data', (chunk: Buffer) => { out += chunk.toString() })
  child.stderr?.on('data', (chunk: Buffer) => { out += chunk.toString() })
  const ended = new Promise<number | null>((done) => child.once('exit', (code) => done(code)))
  return { child, out: () => out, ended }
}

let first: AnOffice
let second: AnOffice
let theRun = { id: '', key: '' }
let theSlowJob = ''
let theSlowGroup = 0
/** When the second office's first runner was started: after `from` and before `to`. */
let theSecondOfficesFirstStart = { from: 0, to: 0 }

function asTheRun(): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': ASKER,
    'x-mole-office-session': theRun.id,
    'x-mole-office-key': theRun.key,
  }
}

/** A stand-in program in the test's folder, run through its own first line. */
function aStandIn(name: string, body: string): { path: string; sha256: string } {
  const path = join(dir, 'bin', name)
  writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  chmodSync(path, 0o755)
  return { path, sha256: theSha256Of(path) }
}

beforeAll(async () => {
  dir = aTestDatabaseFolder('host-job-runner')
  database = join(dir, 'office.db')
  runnerFolder = join(dir, 'host-jobs')
  theLog = join(runnerFolder, 'runner.log')
  writeFileSync(join(dir, 'keys.json'), `${JSON.stringify({ person: PERSON_KEY, office: OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  mkdirSync(join(dir, 'bin'))
  mkdirSync(join(dir, 'work'))
  // MODE 755 WHATEVER THE UMASK, since a program in a folder others may write is refused.
  chmodSync(join(dir, 'bin'), 0o755)
  first = await anOffice()
  for (const [handle, role] of [[ASKER, 'worker'], [THE_TEST_OFFICES_SECRETARY.handle, 'secretary']] as const) {
    const reply = await send(first, 'POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role, runtime: 'claude-code' })
    expect(reply.status, `registering ${handle}: ${reply.text.slice(0, 300)}`).toBe(201)
    idOf[handle] = reply.body.agent.id
    keyOf[handle] = String(reply.body.whatToGiveIt?.key ?? '')
  }
  const words = await send(first, 'POST', '/api/records', AS_THE_PERSON, { kind: 'note', title: 'What the person said about host tools', data: { body: 'the office runs the registered stand-ins' } })
  expect(words.status, words.text.slice(0, 300)).toBe(201)
  const decided = await send(first, 'POST', '/api/records', AS_THE_PERSON, {
    kind: 'decision',
    title: 'The office runs registered stand-in host tools',
    data: { governs: [{ wholeProject: true }], replaces: [], option_taken: 'register the stand-ins', because: 'this test office needs them', decided_by: THE_OWNER, authority: 'the owner said so', authority_reference: words.body.record.id },
  })
  expect(decided.status, decided.text.slice(0, 300)).toBe(201)
  theDecision = decided.body.record.id
}, 240_000)

afterAll(async () => {
  for (const office of theOffices) {
    office.stopSampling()
    if (!office.exited()) signalGroup(office.pid, 'SIGTERM')
  }
  await Promise.race([Promise.all(theOffices.map((office) => office.ended)), sleep(30_000)])
  for (const office of theOffices) if (!office.exited()) signalGroup(office.pid, 'SIGKILL')
  // ANY RUNNER LEFT, by the group the ledger recorded for it.
  if (database !== '' && existsSync(database)) {
    const left = theOffices.flatMap((office) => theRunnersOf(office.pid))
    for (const row of theRunnersRows()) if (row.pgid !== null && left.includes(Number(row.key))) signalGroup(row.pgid, 'SIGKILL')
  }
  if (theSlowGroup > 1) signalGroup(theSlowGroup, 'SIGKILL')
  removeThisTestFolder(dir)
}, 240_000)

it('1: with no host tool registered, the office starts no runner and says so', async () => {
  expect(await theRunnerSays(first)).toEqual({
    running: false,
    pid: null,
    says: `No host tool is registered, so the office starts no host job runner; it reads its host-tools.json again every ${String(THE_LOOK_MS / 1000)} seconds.`,
  })
  expect(theRunnersOf(first.pid)).toEqual([])
  expect(theRunnersRows()).toEqual([])
}, 60_000)

it('2: once a tool is registered, a runner starts within a look, in a group of its own, filed under the API server', async () => {
  const from = Date.now()
  for (const [name, body] of [
    ['stand-in', 'printf "done\\n"\nprintf \'{"ok":true}\' > "$HOST_JOB_OUTPUT/RESULT.json"'],
    ['slow', 'printf "started\\n"\nexec sleep 60'],
  ] as const) {
    const declaration = {
      name,
      what: `a stand-in for this test only (${name})`,
      program: aStandIn(name, body),
      argv: [],
      arguments: {},
      folder: join(dir, 'work'),
      timeLimitSeconds: 90,
      outputs: [{ name: 'RESULT.json', maxBytes: 100 }],
      logLines: 20,
      mayAsk: { agents: [idOf[ASKER]] },
    }
    const done = await send(first, 'POST', '/api/host-tools', { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle, 'x-mole-office-key': keyOf[THE_TEST_OFFICES_SECRETARY.handle] ?? '' }, { declaration, decision: theDecision })
    expect(done.status, done.text.slice(0, 500)).toBe(201)
  }
  const runner = await until('A runner starting', () => theRunnerSays(first), (one) => one.running, 20_000)
  const pid = runner.pid as number
  expect(theStampsBetween(from, Date.now()).map((started) => theRunnerRuns(pid, pid, started, theLog)), 'started after the first tool was registered').toContain(runner.says)
  expect(theRunnersOf(first.pid)).toEqual([pid])
  expect(theGroupOf(pid), 'the runner leads a process group of its own').toBe(pid)
  const rows = theRunnersRows()
  expect(rows.map(({ key, pgid, released }) => ({ key, pgid, released }))).toEqual([{ key: String(pid), pgid: pid, released: null }])
  expect(aRecordsTitle(rows[0]!.session), "the row is filed under the API server's own session").toBe('The API server')
}, 60_000)

it('3: the runner runs an asked job with no timer and no --once', async () => {
  const filed = await send(first, 'POST', '/api/records', AS_THE_OFFICE_WORKER, {
    kind: 'session',
    title: `A run of ${ASKER}`,
    data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: idOf[ASKER], doing: `A run of ${ASKER}` },
  })
  expect(filed.status, filed.text.slice(0, 400)).toBe(201)
  theRun = { id: filed.body.record.id, key: String(filed.body.runKey?.key) }
  const asked = await send(first, 'POST', '/api/host-jobs', asTheRun(), { tool: 'stand-in', arguments: {} })
  expect(asked.status, asked.text.slice(0, 400)).toBe(201)
  const job = await until('The job ending', () => theJobData(asked.body.job.id), (data) => data['state'] !== 'asked' && data['state'] !== 'running', 30_000)
  expect(job['state'], JSON.stringify(job)).toBe('finished')
  expect(job['outputs']).toEqual([expect.objectContaining({ name: 'RESULT.json', state: 'returned', text: '{"ok":true}' })])
}, 60_000)

it("4: one at a time: a person's --once beside it is refused by the lock, and the office never has two", async () => {
  const runner = await theRunnerSays(first)
  const byHand = theRunnerByHand(['--once', '--api', first.api])
  expect(await byHand.ended, byHand.out()).toBe(2)
  expect(byHand.out()).toContain(THE_RUNNERS_WORDS.aRunnerHoldsTheLock(Number(runner.pid), join(runnerFolder, 'runner.lock')))
  // TWO LOOKS LATER, still the one runner and the one row.
  await sleep(2 * THE_LOOK_MS + 1_000)
  expect((await theRunnerSays(first)).pid).toBe(runner.pid)
  expect(theRunnersRows().map((row) => row.key)).toEqual([String(runner.pid)])
  expect(first.most(), 'the most runners of the first office seen at once').toBe(1)
}, 60_000)

it("5: when the office stops it asks the runner's group to stop, and the runner ends the running tool by the tool's group", async () => {
  const runner = await theRunnerSays(first)
  const asked = await send(first, 'POST', '/api/host-jobs', asTheRun(), { tool: 'slow', arguments: {} })
  expect(asked.status, asked.text.slice(0, 400)).toBe(201)
  theSlowJob = asked.body.job.id
  const held = await until(
    'The slow tool running',
    () => {
      try {
        return JSON.parse(readFileSync(join(runnerFolder, 'taken.json'), 'utf8')) as { id?: string; groupId?: number }
      } catch {
        return {}
      }
    },
    (one) => one.id === theSlowJob && typeof one.groupId === 'number',
    30_000,
  )
  theSlowGroup = held.groupId as number
  expect(aGroupIsThere(theSlowGroup), 'the tool runs').toBe(true)
  signalGroup(first.pid, 'SIGTERM')
  expect(await first.ended, first.said().slice(-3000)).toEqual({ code: 0, signal: null })
  first.stopSampling()
  // THE ROW IS CLOSED BY THE OFFICE THAT STOPPED THE RUNNER, before it exited: no other office runs on this database.
  const rows = theRunnersRows()
  expect(rows.map((row) => row.key), first.said().slice(-3000)).toEqual([String(runner.pid)])
  expect(rows[0]?.released, `the row of the stopped runner\n${first.said().slice(-3000)}`).not.toBeNull()
  expect(rows[0]?.note).toContain(THE_NOTE_OF_A_STOPPED_RUNNER)
  expect(THE_STOP_WAIT_MS, 'the office waits for its runner longer than the runner gives a tool after TERM').toBeGreaterThan(THE_GRACE_MS)
  await until('The runner and the tool ending', () => [stillThere(runner.pid as number), aGroupIsThere(theSlowGroup)], (both) => !both[0] && !both[1], 15_000)
  expect(readFileSync(theLog, 'utf8')).toContain(`${THE_RUNNERS_WORDS.askedToStop}\n`)
  expect(first.said()).toContain(`host job runner: the runner in group ${String(runner.pid)} was asked to stop`)
  expect(first.most(), 'the most runners of the first office seen at once').toBe(1)
}, 90_000)

it('6: the next office starts a runner at once, and the job ends lost, saying the runner was asked to stop while it ran', async () => {
  const from = Date.now()
  second = await anOffice()
  const runner = await until('A runner starting', () => theRunnerSays(second), (one) => one.running, 20_000)
  theSecondOfficesFirstStart = { from, to: Date.now() }
  expect(theRunnersOf(second.pid)).toEqual([runner.pid])
  const job = await until('The slow job ending', () => theJobData(theSlowJob), (data) => data['state'] !== 'asked' && data['state'] !== 'running', 30_000)
  expect(job['state'], JSON.stringify(job)).toBe('lost')
  // WHICH WAY HELD THE JOB is the machine's: a scope of its own where systemd-run --user can start one, its group alone
  // where it cannot. The words are read from the code either way.
  expect(job['why'], JSON.stringify(job)).toBe(
    job['heldBy'] === HOST_JOB_HOLDINGS[0] ? THE_RUNNERS_WORDS.lostWhenAskedToStopInItsScope(THE_GRACE_MS) : THE_RUNNERS_WORDS.lostWhenAskedToStop(THE_GRACE_MS),
  )
  expect(HOST_JOB_HOLDINGS, 'the job says which way held it').toContain(job['heldBy'])
  await until('The held answer given', () => existsSync(join(runnerFolder, 'taken.json')), (there) => !there, 15_000)
}, 150_000)

it('7: a runner that dies is said in words, its row is closed, and another is started at once', async () => {
  const before = await theRunnerSays(second)
  const old = before.pid as number
  signalGroup(old, 'SIGKILL')
  const after = await until('Another runner starting', () => theRunnerSays(second), (one) => one.running && one.pid !== old, 15_000)
  expect(after.says).toContain(`The runner before, process ${String(old)}, ended at `)
  expect(after.says).toContain(' by the signal SIGKILL. The last line of its log was: ')
  const rows = await until('The old row closed', () => theRunnersRows(), (all) => all.find((row) => row.key === String(old))?.released !== null, 10_000)
  expect(rows.find((row) => row.key === String(old))?.note).toContain('closed after the process was found gone')
  expect(rows.filter((row) => row.released === null).map((row) => row.key)).toEqual([String(after.pid)])
  expect(theRunnersOf(second.pid)).toEqual([after.pid])
}, 60_000)

it('8: at most the bound of starts in its window, and then the words say when the next is', async () => {
  // THE LAST START IN A LATER SECOND than case 6's start, so the next start said from it cannot pass for one said from
  // the first. Case 7's start can fall in the same second as case 6's.
  await sleep(Math.max(0, (Math.floor(theSecondOfficesFirstStart.to / 1000) + 1) * 1000 - Date.now()))
  // THE LAST START THE BOUND ALLOWS, after each runner of this office before it dies. Case 7 made the second.
  for (let start = 3; start <= AT_MOST_STARTS; start += 1) {
    const before = await theRunnerSays(second)
    signalGroup(before.pid as number, 'SIGKILL')
    const next = await until(`Start ${String(start)}`, () => theRunnerSays(second), (one) => one.running && one.pid !== before.pid, 15_000)
    expect(next.says).toContain(`The runner before, process ${String(before.pid)}, ended at `)
    expect(next.says).toContain(
      ` by the signal SIGKILL. The last line of its log was: The host job runner asks the office for a host job every ${String(THE_PAUSE_MS / 1000)} seconds, for as long as the office's process ${String(second.pid)} runs.`,
    )
  }
  // AND NO MORE, a look after the last one dies.
  const last = await theRunnerSays(second)
  signalGroup(last.pid as number, 'SIGKILL')
  await until('The last runner ending', () => theRunnerSays(second), (one) => !one.running, 15_000)
  await sleep(THE_LOOK_MS + 1_000)
  const still = await theRunnerSays(second)
  expect(still.running, still.says).toBe(false)
  // THE NEXT START IS A WINDOW AFTER THE FIRST START OF THIS OFFICE, case 6's, since the bound is used up.
  const { from, to } = theSecondOfficesFirstStart
  const usedUp = theStampsBetween(from + THE_WINDOW_MS, to + THE_WINDOW_MS).map((next) => theStartsAreUsedUp(AT_MOST_STARTS, next))
  const length = usedUp[0]?.length ?? 0
  expect(usedUp, still.says).toContain(still.says.slice(0, length))
  const after = ` The runner before, process ${String(last.pid)}, ended at `
  expect(still.says.slice(length, length + after.length)).toBe(after)
  expect(theRunnersOf(second.pid)).toEqual([])
  const rows = await until('Every row of the second office closed', () => theRunnersRows().slice(1), (all) => all.every((row) => row.released !== null), 10_000)
  expect(rows, 'the starts of the second office').toHaveLength(AT_MOST_STARTS)
  expect(second.most(), 'the most runners of the second office seen at once').toBe(1)
}, 120_000)

it("9: a runner whose office's process is gone stops by itself", async () => {
  // A STAND-IN FOR AN OFFICE'S PROCESS: a sleep in a group of its own. The lock is free, since the bound left no runner.
  const office = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  const officePid = office.pid as number
  const gone = new Promise<void>((done) => office.once('exit', () => done()))
  const byHand = theRunnerByHand([`--with-the-office=${String(officePid)}`, '--api', second.api])
  try {
    await until('The runner starting', () => byHand.out(), (out) => out.includes(THE_RUNNERS_WORDS.itAsksEvery(THE_PAUSE_MS, officePid)), 15_000)
    signalGroup(officePid, 'SIGKILL')
    await gone
    const code = await Promise.race([byHand.ended, sleep(5_000).then(() => 'still running' as const)])
    expect(code, byHand.out()).toBe(0)
    expect(byHand.out()).toContain(THE_RUNNERS_WORDS.theOfficeHasGone(officePid))
  } finally {
    signalGroup(officePid, 'SIGKILL')
    if (byHand.child.pid !== undefined) signalGroup(byHand.child.pid, 'SIGKILL')
  }
}, 60_000)

it('10: a round that fails is said on one line, the runner goes on, and its next round takes a job', async () => {
  // A ROUND THAT FAILS: what the runner keeps between rounds is made unreadable, by this test only, before it starts.
  // The office's own runner of the second office has used its bound, so the lock is free for this one.
  const held = join(runnerFolder, 'taken.json')
  writeFileSync(held, 'not what a runner writes', { mode: 0o600 })
  const office = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  const officePid = office.pid as number
  const byHand = theRunnerByHand([`--with-the-office=${String(officePid)}`, '--api', second.api])
  try {
    // WHAT THE ROUND FAILS WITH is what reading that file throws, and the line's opening is the runner's own words.
    let said = ''
    try {
      JSON.parse('not what a runner writes')
    } catch (error) {
      said = (error as Error).message
    }
    const aRoundFailed = THE_RUNNERS_WORDS.aRoundFailed('\0', THE_PAUSE_MS, false).split('\0')[0] as string
    const failed = await until('The first round failing', () => byHand.out(), (out) => out.includes(aRoundFailed), 15_000)
    rmSync(held)
    expect(failed.split('\n').find((line) => line.startsWith(aRoundFailed))).toBe(THE_RUNNERS_WORDS.aRoundFailed(said, THE_PAUSE_MS, false))
    const asked = await send(second, 'POST', '/api/host-jobs', asTheRun(), { tool: 'stand-in', arguments: {} })
    expect(asked.status, asked.text.slice(0, 400)).toBe(201)
    const job = await until('The job ending', () => theJobData(asked.body.job.id), (data) => data['state'] !== 'asked' && data['state'] !== 'running', 30_000)
    expect(job['state'], `${JSON.stringify(job)}\n${byHand.out()}`).toBe('finished')
    expect(stillThere(byHand.child.pid as number), 'the runner that failed a round still runs').toBe(true)
    expect(byHand.out().split('\n').filter((line) => line.startsWith(aRoundFailed)), 'one round failed').toHaveLength(1)
  } finally {
    signalGroup(officePid, 'SIGKILL')
    if (byHand.child.pid !== undefined) signalGroup(byHand.child.pid, 'SIGKILL')
  }
}, 60_000)
