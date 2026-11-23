// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TEST TOOL TAKES A TEST-BATCHES SEAT BEFORE ITS FIRST FILE AND GIVES IT BACK AFTER ITS LAST (wave 13r round AY).
 *
 * tools/run-named-tests.mjs asks the office for a seat in the pool `test-batches` (tools/test-batch-seat.mjs), waits in
 * line while it is told to, and gives the seat back with tools/slot.mjs release when its last part has ended.
 *
 * WHAT IS PROVED, against a stand-in office and a stand-in vitest. No real office is asked and no real test runs. The
 * stand-in vitest asks the stand-in office for `/the-stand-in-vitest-starts` when it starts, so the order the office
 * heard things in shows whether the seat was taken before the first file and given back after the last.
 *   1. The seat is asked for before vitest starts and given back after it ends, when the files pass and when they fail,
 *      in the foreground and with --background. The exit code is vitest's.
 *   2. Inside a sandbox the seat is held by the row the tool wrote for its own process, never by the sandbox's row it
 *      inherited; elsewhere by the tool's own pid.
 *   3. kill -TERM and kill -INT of the tool's group give the seat back, and the tool ends by that signal.
 *   4. A batch told to wait does not start vitest until it is granted.
 *   5. A named office that cannot answer or refuses stops the batch in words; no office named runs without a seat.
 *      A sandbox batch whose own row was not written stops in words.
 *   6. A second batch in a process group that already has a row is refused: it starts no vitest and gives nothing back.
 *      A refused give-back is said.
 *   7. Joined to the office's real seat doors, in a database of the test's own: the acquire door grants the seat to
 *      the tool's own process group, as the tool names it, and the release door takes it back with the tool's note.
 *      The machine's load and free space are made up there, so whatever this machine is doing holds nothing back.
 *   8. Inside a sandbox the batch holds the tsc lock shared from its seat to its last part (tools/the-tsc-lock.mjs), on
 *      a gate and a lock file in the case's own folder, never on the sandbox's real ones. A tsc started in the rule's
 *      form runs and ends while the batch waits in line for its seat; a tsc that holds the lock when the seat is granted
 *      is waited for; a batch that comes while a tsc waits for the lock waits behind the tsc. A batch started inside the
 *      older shell form, or by another batch, takes no second hold; a batch names its own process to its test files;
 *      nothing is taken outside a sandbox; and a lock that cannot be taken stops the batch and gives the seat back.
 *
 * The tool's own sentences and notes are read from tools/test-batch-seat.mjs and tools/the-tsc-lock.mjs, where they are
 * worded. A case checks that the line is there and carries what the case put in: the address, the office's words, the
 * row, the lock's files.
 *
 * Every key, row and address here is made up.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { freshDb } from './helpers.ts'
import {
  aSecondBatchIsRefused,
  notGivenBack,
  stoppedBy,
  TEST_BATCH_POOL,
  THE_BATCH_ENDED,
  waitsForASeat,
  WITHOUT_A_SEAT,
} from '../tools/test-batch-seat.mjs'
import {
  handedInBy,
  heldByABatchAbove,
  holdsTheTscLock,
  letGoOfTheTscLock,
  THE_TSC_GATE,
  THE_TSC_LOCK,
  THE_TSC_LOCK_COULD_NOT_BE_TAKEN,
  TSC_LOCK_FOLDER_VARIABLE,
  TSC_LOCK_HELD_BY_VARIABLE,
  waitsForTheTscLock,
} from '../tools/the-tsc-lock.mjs'

type OsProbe = (typeof import('../src/server/lib/resources.ts'))['LINUX_PROBE']

const REPO = join(import.meta.dirname, '..')
const TOOL = join(REPO, 'tools', 'run-named-tests.mjs')
const OFFICE_VARIABLES = ['MOLE_OFFICE_API', 'MOLE_OFFICE_API_ROOT', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT']
const THE_KEY = 'mok_a-made-up-key-for-a-test-batch-seat-01'
const THE_RUN = 'the-calling-run'
const THE_SANDBOX_ROW = 'row-of-the-sandbox'
const THE_SEAT = 'seat-of-the-batch'
const THE_ROW = 'row-of-the-test-tool'
const ASK = 'POST /api/slots/acquire'
const GIVE_BACK = `POST /api/slots/${THE_SEAT}/release`
const VITEST = 'GET /the-stand-in-vitest-starts'
const USE = 'POST /api/toolset/uses'
const REGISTER = 'POST /api/resources'
const RELEASE = `POST /api/resources/${THE_ROW}/release`

interface Heard {
  url: string
  session: unknown
  key: unknown
  body: Record<string, unknown> | null
}

interface Ended {
  code: number | null
  signal: NodeJS.Signals | null
  out: string
}

const granted = { status: 200, body: { slot: { id: THE_SEAT, state: 'granted', seat: 1, position: null }, asked: 'new', handedOn: [], says: 'Granted: seat 1 of 3 in test-batches, as the stand-in office says.' } }
const queued = { status: 200, body: { slot: { id: THE_SEAT, state: 'queued', seat: null, position: 1 }, asked: 'new', handedOn: [], says: 'Queued: number 1 in line for test-batches, as the stand-in office says.' } }

let root = ''
let office: Server
let api = ''
let heard: Heard[] = []
/** What the stand-in office answers the seat's ask with, ask by ask. A case that needs another answer sets it. */
let asks: (n: number) => { status: number; body: unknown }
/** What it answers the give-back with. */
let back: { status: number; body: unknown }
/** What it answers the tool's registration of its own row with. */
let register: { status: number; body: unknown }
let started: ChildProcess[] = []
/** The office's real app, when a case hands it the seat's two doors, and what it answered there. */
let joined: FastifyInstance | null = null
let joinedAnswers: { url: string; status: number; body: Record<string, unknown> }[] = []
/** The headers handed on to the app. The key is not one of them: the test app takes an agent's name unchecked. */
const HANDED_ON = ['content-type', 'x-mole-office-workspace', 'x-mole-office-actor-type', 'x-mole-office-actor-id', 'x-mole-office-session', 'x-mole-office-purpose']

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'a-test-batch-seat-'))
  mkdirSync(join(root, 'tests'))
  writeFileSync(join(root, 'tests', 'one.test.ts'), "test('x', () => {})\n")
  heard = []
  started = []
  joined = null
  joinedAnswers = []
  asks = () => granted
  back = { status: 200, body: { released: true, id: THE_SEAT, says: 'Gave back seat 1 of test-batches.' } }
  register = { status: 201, body: { resource: { id: THE_ROW, type: 'process' } } }
  office = createServer((req, res) => {
    let text = ''
    req.on('data', (chunk) => (text += String(chunk)))
    req.on('end', () => {
      // SOMETHING OUTSIDE THE TEST MAY ASK THIS PORT WHAT IT IS, and is not counted. An office registering a process
      // asks GET /api/runtime on a port that process listens on (src/server/api/resources.ts), and this stand-in has
      // heard that request from outside the test. The tool never sends it.
      if (req.method === 'GET' && req.url === '/api/runtime') {
        res.statusCode = 404
        res.end()
        return
      }
      let body: Record<string, unknown> | null = null
      try {
        body = JSON.parse(text) as Record<string, unknown> | null
      } catch {
        // Heard with body null.
      }
      const url = `${req.method ?? ''} ${req.url ?? ''}`
      heard.push({ url, session: req.headers['x-mole-office-session'], key: req.headers[KEY_HEADER], body })
      if (joined !== null && (req.url ?? '').startsWith('/api/slots/')) {
        const headers: Record<string, string> = {}
        for (const name of HANDED_ON) {
          const value = req.headers[name]
          if (typeof value === 'string') headers[name] = value
        }
        void joined.inject({ method: req.method as 'POST', url: req.url ?? '/', headers, payload: text }).then((reply) => {
          joinedAnswers.push({ url, status: reply.statusCode, body: reply.json() as Record<string, unknown> })
          res.setHeader('content-type', 'application/json')
          res.statusCode = reply.statusCode
          res.end(reply.body)
        })
        return
      }
      const answered = url === ASK
        ? asks(heard.filter((one) => one.url === ASK).length)
        : url === GIVE_BACK ? back
        : url === REGISTER ? register
        : url === RELEASE ? { status: 200, body: { resource: { id: THE_ROW } } }
        : { status: 201, body: { run: THE_RUN } }
      res.setHeader('content-type', 'application/json')
      res.statusCode = answered.status
      res.end(JSON.stringify(answered.body))
    })
  })
  await new Promise<void>((ready) => office.listen(0, '127.0.0.1', ready))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
})

afterEach(async () => {
  // Each tool was started as the leader of its own group, so a case that failed half way stops it by that group.
  for (const child of started) {
    if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // The group has ended already.
      }
    }
  }
  await new Promise<void>((closed) => office.close(() => closed()))
  rmSync(root, { recursive: true, force: true })
})

/**
 * A stand-in vitest. It tells the stand-in office it has started, writes a file saying so, then either waits to be
 * stopped or writes a report naming every file it was given with `status`, and exits with `code`.
 *
 * With `seen`, it first writes seen.json in root: the exit code of `flock -n -x <file> true` on the case's tsc lock and
 * on its gate, 1 while another process holds the file and 0 while it is free, and the TSC_LOCK_HELD_BY it was given, or
 * null. Two batches in one case each name a `started` file of their own in root, and each gets a script of its own.
 */
function standIn({ status = 'passed', code = 0, waits = false, seen = false, started = 'vitest-started' }: { status?: string; code?: number; waits?: boolean; seen?: boolean; started?: string } = {}): string {
  const file = join(root, `stand-in-${started}.mjs`)
  writeFileSync(
    file,
    `import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const out = process.argv.find((word) => word.startsWith('--outputFile.json='))
const named = process.argv.filter((word) => word.endsWith('.test.ts'))
await fetch(${JSON.stringify(`${api}/the-stand-in-vitest-starts`)}).catch(() => {})
if (${String(seen)}) {
  const held = (file) => spawnSync('flock', ['-n', '-x', file, 'true']).status
  writeFileSync(${JSON.stringify(join(root, 'seen.json'))}, JSON.stringify({
    lock: held(${JSON.stringify(join(root, THE_TSC_LOCK))}),
    gate: held(${JSON.stringify(join(root, THE_TSC_GATE))}),
    heldBy: process.env[${JSON.stringify(TSC_LOCK_HELD_BY_VARIABLE)}] ?? null,
  }))
}
writeFileSync(${JSON.stringify(join(root, started))}, 'started')
if (${String(waits)}) {
  setInterval(() => {}, 1000)
} else {
  writeFileSync(out.slice('--outputFile.json='.length), JSON.stringify({ testResults: named.map((name) => ({ name, status: ${JSON.stringify(status)} })) }))
  process.exit(${String(code)})
}
`,
  )
  return file
}

interface Change {
  api?: string
  noOffice?: boolean
  inASandbox?: boolean
  session?: string
  /** Starts the tool through the older shell form, whose descriptor 9 holds the case's own tsc lock shared. */
  inTheOlderShell?: boolean
  /** Starts the tool under timeout inside the older shell form, so that it does not lead its process group. */
  underATimeout?: boolean
  /** The TSC_LOCK_HELD_BY the tool is given, as a batch that started it would set it. */
  heldBy?: string
  /** Another folder for the tsc lock than the case's own root. */
  lockFolder?: string
}

/**
 * The tool as the leader of its own process group, with the office variables, the stand-in office and a made-up key.
 * Its tsc lock is in the case's own folder, and no batch above it holds one, so no case takes or waits for the
 * sandbox's real lock. `said()` answers what it has printed so far.
 */
function startTool(words: string[], change: Change = {}): { child: ChildProcess; ended: Promise<Ended>; said: () => string } {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of [...OFFICE_VARIABLES, 'MOLE_AGENT_KEY', 'MOLE_OFFICE_TOOL_CONFIGURATION', 'SANDBOX_PROCESS_ROW', 'SANDBOX_DIR', TSC_LOCK_HELD_BY_VARIABLE]) delete env[name]
  Object.assign(env, {
    ...(change.noOffice === true ? {} : { MOLE_OFFICE_API: change.api ?? api }),
    MOLE_OFFICE_SESSION: change.session ?? THE_RUN,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_AGENT: 'test-batch-seat-tester',
    MOLE_AGENT_KEY: THE_KEY,
    ...(change.inASandbox === true ? { SANDBOX_DIR: root, SANDBOX_PROCESS_ROW: THE_SANDBOX_ROW } : {}),
    [TSC_LOCK_FOLDER_VARIABLE]: change.lockFolder ?? root,
    ...(change.heldBy === undefined ? {} : { [TSC_LOCK_HELD_BY_VARIABLE]: change.heldBy }),
  })
  // THE OLDER SHELL FORM holds the lock on descriptor 9 and then becomes the tool, which keeps that descriptor.
  const child = change.inTheOlderShell === true
    ? spawn('sh', ['-c', change.underATimeout === true ? 'exec 9>"$0"; flock -s 9; exec timeout 120 "$@"' : 'exec 9>"$0"; flock -s 9; exec "$@"', join(root, THE_TSC_LOCK), process.execPath, TOOL, ...words], { cwd: root, env, detached: true })
    : spawn(process.execPath, [TOOL, ...words], { cwd: root, env, detached: true })
  started.push(child)
  let out = ''
  child.stdout?.on('data', (chunk) => (out += String(chunk)))
  child.stderr?.on('data', (chunk) => (out += String(chunk)))
  const ended = new Promise<Ended>((done) => child.on('close', (code, signal) => done({ code, signal, out })))
  return { child, ended, said: () => out }
}

function runTool(words: string[], change: Change = {}): Promise<Ended> {
  return startTool(words, change).ended
}

/** Waits until the stand-in vitest has started, for at most twenty seconds. */
async function untilVitestStarted(): Promise<void> {
  for (let tries = 0; tries < 400 && !existsSync(join(root, 'vitest-started')); tries += 1) {
    await new Promise((wait) => setTimeout(wait, 50))
  }
  expect(existsSync(join(root, 'vitest-started')), 'the stand-in vitest must have started').toBe(true)
}

/** The requests heard, by method and address, in order. */
function urls(): string[] {
  return heard.map((one) => one.url)
}

function times(out: string, words: string): number {
  return out.split(words).length - 1
}

/** The one line of `out` that begins with `words`. */
function theLine(out: string, words: string): string {
  const lines = out.split('\n').filter((line) => line.startsWith(words))
  expect(lines, out).toHaveLength(1)
  return lines[0]!
}

/** Asks `done` every 50 ms until it answers true, for at most `seconds`, and answers what it answered last. */
async function until(done: () => boolean, seconds: number): Promise<boolean> {
  for (let tries = 0; tries < seconds * 20 && !done(); tries += 1) {
    await new Promise((wait) => setTimeout(wait, 50))
  }
  return done()
}

/** The exit code of `flock -n -x <file> true`: 1 while another process holds the file, 0 while it is free. */
function heldNow(file: string): number | null {
  return spawnSync('flock', ['-n', '-x', file, 'true']).status
}

/** What the stand-in vitest wrote in seen.json. */
function seen(): { lock: number | null; gate: number | null; heldBy: string | null } {
  return JSON.parse(readFileSync(join(root, 'seen.json'), 'utf8')) as { lock: number | null; gate: number | null; heldBy: string | null }
}

/**
 * A stand-in tsc, started in the rule's form, `flock <gate> flock <lock> <node> -e <script>`, on the case's own gate and
 * lock, as the leader of its own process group. Its script writes tsc-holds in root once it holds the lock, and then
 * ends at once, or with `holds` when its stdin closes. `wait` passes -w to the inner flock, so that a mutation turns
 * the case red instead of hanging it.
 */
function aStandInTsc({ holds = false, wait }: { holds?: boolean; wait?: number } = {}): { child: ChildProcess; ended: Promise<number | null> } {
  const script = `require('node:fs').writeFileSync(${JSON.stringify(join(root, 'tsc-holds'))}, 'holds')
if (${String(holds)}) {
  process.stdin.resume()
  process.stdin.on('end', () => process.exit(0))
}`
  const inner = [...(wait === undefined ? [] : ['-w', String(wait)]), join(root, THE_TSC_LOCK)]
  const child = spawn('flock', [join(root, THE_TSC_GATE), 'flock', ...inner, process.execPath, '-e', script], {
    cwd: root,
    stdio: ['pipe', 'ignore', 'ignore'],
    detached: true,
  })
  started.push(child)
  const ended = new Promise<number | null>((done) => child.on('close', (code) => done(code)))
  return { child, ended }
}

describe('a batch holds a seat from before its first file to after its last', () => {
  // Mutation: ask for the seat after vitest starts; give it back before vitest ends, or not when the files fail; keep
  // vitest's exit code from the tool's own end.
  it.each([
    ['pass', 'passed', 0],
    ['fail', 'failed', 3],
  ])('takes the seat before vitest starts and gives it back after it ends, when the files %s', async (_, status, code) => {
    const { child, ended } = startTool(['--root', root, '--vitest', standIn({ status, code }), 'one'])
    const run = await ended
    expect(run.code, run.out).toBe(code)
    expect(urls(), run.out).toEqual([REGISTER, ASK, VITEST, GIVE_BACK, USE, RELEASE])
    const ask = heard[1]!
    expect(ask.session).toBe(THE_RUN)
    expect(ask.key).toBe(THE_KEY)
    expect(ask.body?.['pool']).toBe(TEST_BATCH_POOL)
    // Outside a sandbox the tool's own process group holds the seat, named by its own pid.
    expect(ask.body?.['pid']).toBe(child.pid)
    expect(typeof ask.body?.['startedAt']).toBe('string')
    expect(ask.body).not.toHaveProperty('resource')
    expect(String(ask.body?.['detail'])).toContain('tests/one.test.ts')
    const given = heard[3]!
    expect(given.session).toBe(THE_RUN)
    expect(given.key).toBe(THE_KEY)
    expect(given.body).toEqual({ note: THE_BATCH_ENDED })
    expect(run.out).toContain(granted.body.says)
    expect(times(run.out, WITHOUT_A_SEAT), run.out).toBe(0)
  })

  // Mutation: name the pid inside a sandbox, or both the pid and the row; name the sandbox's row the tool inherited.
  it("names the row the tool wrote for its own process as the holder inside a sandbox, not the sandbox's row", async () => {
    const run = await runTool(['--root', root, '--vitest', standIn(), 'one'], { inASandbox: true })
    expect(run.code, run.out).toBe(0)
    expect(urls(), run.out).toEqual([REGISTER, ASK, VITEST, GIVE_BACK, USE, RELEASE])
    expect(heard[1]!.body).toMatchObject({ pool: TEST_BATCH_POOL, resource: THE_ROW })
    expect(heard[1]!.body).not.toHaveProperty('pid')
  })

  // Mutation: take the seat before the background row is registered, or give it back after the row is released.
  it('takes and gives back the seat inside the background row, when started with --background', async () => {
    const run = await runTool(['--background', '--root', root, '--vitest', standIn({ status: 'failed', code: 3 }), 'one'])
    expect(run.code, run.out).toBe(3)
    expect(urls(), run.out).toEqual([REGISTER, ASK, VITEST, GIVE_BACK, USE, RELEASE])
  })
})

describe('a stopped batch gives its seat back', () => {
  // Mutation: give nothing back on the signal; or swallow the signal so the tool runs on.
  it.each([
    ['SIGTERM', false],
    ['SIGINT', true],
  ] as const)('gives the seat back when its group is sent %s (background %s), and ends by that signal', async (signal, background) => {
    const { child, ended } = startTool([...(background ? ['--background'] : []), '--root', root, '--vitest', standIn({ waits: true }), 'one'])
    await untilVitestStarted()
    process.kill(-child.pid!, signal)
    const run = await ended
    expect(run.signal, run.out).toBe(signal)
    expect(urls().filter((url) => url === GIVE_BACK), run.out).toEqual([GIVE_BACK])
    expect(heard.find((one) => one.url === GIVE_BACK)?.body).toEqual({ note: stoppedBy(signal) })
    if (background) expect(urls()).toContain(RELEASE)
  })
})

describe('a batch told to wait', () => {
  // Mutation: start vitest at the first answer whatever it says; or give back a row it was never told about.
  it('does not start vitest until the seat is granted, and says what it waits for', async () => {
    asks = (n) => (n === 1 ? queued : granted)
    const run = await runTool(['--root', root, '--vitest', standIn(), 'one'])
    expect(run.code, run.out).toBe(0)
    expect(urls(), run.out).toEqual([REGISTER, ASK, ASK, VITEST, GIVE_BACK, USE, RELEASE])
    expect(times(run.out, waitsForASeat(queued.body.says)), run.out).toBe(1)
  })
})

describe('a batch that cannot get a seat', () => {
  // Mutation: run the tests when the named office does not answer, or omit the reason.
  it('stops the tests when the office does not answer', async () => {
    const closed = createServer()
    await new Promise<void>((ready) => closed.listen(0, '127.0.0.1', ready))
    const gone = `http://127.0.0.1:${String((closed.address() as AddressInfo).port)}`
    await new Promise<void>((done) => closed.close(() => done()))
    const run = await runTool(['--root', root, '--vitest', standIn({ code: 3 }), 'one'], { api: gone })
    expect(run.code, run.out).not.toBe(0)
    expect(existsSync(join(root, 'vitest-started'))).toBe(false)
    expect(run.out).toContain(gone)
  })

  // Mutation: run the tests on a refusal, or leave the office's words out.
  it("stops the tests when the office refuses, and says the office's words", async () => {
    asks = () => ({ status: 400, body: { error: 'There is no slot pool called "test-batches", as the stand-in office says.' } })
    const run = await runTool(['--root', root, '--vitest', standIn({ code: 3 }), 'one'])
    expect(run.code, run.out).not.toBe(0)
    expect(urls(), run.out).toEqual([REGISTER, ASK, RELEASE])
    expect(existsSync(join(root, 'vitest-started'))).toBe(false)
    expect(run.out).toContain('400')
    expect(run.out).toContain('There is no slot pool called "test-batches", as the stand-in office says')
  })

  // Mutation: use a container pid, or the sandbox's row the tool inherited, when the tool's own row was not written.
  it("stops a sandbox batch whose own row was not written, and says the office's words", async () => {
    register = { status: 409, body: { error: 'The office could not find which program sent this, as the stand-in office says.' } }
    const run = await runTool(['--root', root, '--vitest', standIn(), 'one'], { inASandbox: true })
    expect(run.code, run.out).not.toBe(0)
    expect(urls(), run.out).toEqual([REGISTER])
    expect(existsSync(join(root, 'vitest-started'))).toBe(false)
    expect(run.out).toContain('The office could not find which program sent this, as the stand-in office says')
  })

  // Mutation: ask an office nobody named; run without a word.
  it('runs the tests when no office is named, and says so', async () => {
    const run = await runTool(['--root', root, '--vitest', standIn(), 'one'], { noOffice: true })
    expect(run.code, run.out).toBe(0)
    expect(urls(), run.out).toEqual([VITEST])
    // The line names the variable the case left unset.
    expect(theLine(run.out, WITHOUT_A_SEAT)).toMatch(/MOLE_OFFICE_API(?!_)/)
  })
})

describe('a second batch in one process group, and a give-back the office refuses', () => {
  // Mutation: wait for the queued row, or run on the granted one, as if it were this batch's; give back the row
  // another batch of this group asked for; refuse without a word, or with exit 0.
  it.each([
    ['queued', queued],
    ['granted', granted],
  ] as const)('refuses to start when its process group already has a %s row, and gives that row nothing back', async (state, answer) => {
    asks = () => ({ ...answer, body: { ...answer.body, asked: 'again' } })
    const run = await runTool(['--root', root, '--vitest', standIn(), 'one'])
    expect(run.code, run.out).toBe(1)
    expect(urls(), run.out).toEqual([REGISTER, ASK, RELEASE])
    expect(existsSync(join(root, 'vitest-started'))).toBe(false)
    expect(times(run.out, aSecondBatchIsRefused(THE_SEAT, state)), run.out).toBe(1)
  })

  // Mutation: ask the give-back again; say nothing; change the exit code.
  it('says once that the seat was not given back, and keeps the exit code', async () => {
    back = { status: 409, body: { error: 'the seat moved' } }
    const run = await runTool(['--root', root, '--vitest', standIn({ code: 3 }), 'one'])
    expect(run.code, run.out).toBe(3)
    expect(urls(), run.out).toEqual([REGISTER, ASK, VITEST, GIVE_BACK, USE, RELEASE])
    expect(times(run.out, notGivenBack(THE_SEAT)), run.out).toBe(1)
    expect(theLine(run.out, notGivenBack(THE_SEAT))).toContain('the seat moved')
  })
})

describe('the seat, joined to the real doors', () => {
  // Mutation: send a start time the tool's process did not start at; send no pool; give back as another run. The
  // door compares the instant, so the same start written in UTC is not a mutation it can catch.
  it("is granted to the tool's own process group by the real acquire door, and given back by the real release door", async () => {
    const t = await freshDb()
    const res = await import('../src/server/lib/resources.ts')
    const Fastify = (await import('fastify')).default
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    const { resourceRoutes } = await import('../src/server/api/resources.ts')
    const { slotRoutes } = await import('../src/server/api/slots.ts')
    const app = Fastify({ logger: false })
    installErrorHandling(app)
    await app.register(resourceRoutes, { prefix: '/api' })
    await app.register(slotRoutes, { prefix: '/api' })
    await app.ready()
    // THE REAL PROCESS TABLE, so the door reads the tool's group as it reads any holder's. The load and the free space
    // are made up and quiet, so no limit holds the seat back whatever this machine is doing.
    const quiet = Object.assign(Object.create(res.LINUX_PROBE) as OsProbe, {
      machineNow: () => ({ loadOneMinute: 1, freeBytes: null }),
      rootFreeBytes: () => 500_000_000_000,
    })
    res.useOsProbe(quiet)
    try {
      const run = t.api.createRecord({
        workspaceId: 'default',
        kind: 'session',
        title: 'A made-up run whose test tool takes a seat',
        data: { state: 'running', runtime: 'claude-code' },
        actor: t.api.HUMAN,
      }).id
      joined = app
      const { child, ended } = startTool(['--root', root, '--vitest', standIn({ code: 3 }), 'one'], { session: run })
      const ran = await ended
      expect(ran.code, ran.out).toBe(3)
      expect(joinedAnswers.map((one) => one.status), ran.out).toEqual([200, 200])
      expect(joinedAnswers[0]!.body).toMatchObject({ asked: 'new', slot: { pool: TEST_BATCH_POOL, state: 'granted' } })
      const seat = (joinedAnswers[0]!.body['slot'] as { id: string }).id
      const ledger = (await app.inject({ method: 'GET', url: `/api/resources?includeReleased=true&pgid=${String(child.pid)}` })).json() as {
        resources: { id: string; pgid: number | null }[]
      }
      expect(ledger.resources.find((one) => one.id === seat)?.pgid, ran.out).toBe(child.pid)
      expect(urls(), ran.out).toEqual([REGISTER, ASK, VITEST, `POST /api/slots/${seat}/release`, USE, RELEASE])
      // The door adds why it took the seat back without force to the tool's own note.
      expect(joinedAnswers[1]!.body).toMatchObject({ released: true, id: seat })
      const note = String(joinedAnswers[1]!.body['note'])
      expect(note.startsWith(THE_BATCH_ENDED) && note.length > THE_BATCH_ENDED.length, note).toBe(true)
      expect(times(ran.out, WITHOUT_A_SEAT), ran.out).toBe(0)
      const pools = (await app.inject({ method: 'GET', url: '/api/slots' })).json() as { pools: { name: string; held: unknown[] }[] }
      expect(pools.pools.find((pool) => pool.name === TEST_BATCH_POOL)?.held).toEqual([])
    } finally {
      joined = null
      res.useOsProbe(res.LINUX_PROBE)
      await app.close()
      t.close()
    }
  })
})

describe('inside a sandbox the batch holds the tsc lock shared from its seat to its last part', () => {
  // Mutation: take the lock before the seat is asked for.
  it("lets a tsc in the rule's form run and end while the batch waits in line for its seat", async () => {
    const tsc: { code?: number | null; asksWhenItEnded?: number } = {}
    asks = (n) => {
      if (n === 1) {
        void aStandInTsc({ wait: 10 }).ended.then((code) => {
          tsc.code = code
          tsc.asksWhenItEnded = heard.filter((one) => one.url === ASK).length
        })
        return queued
      }
      return tsc.code === undefined ? queued : granted
    }
    const run = await runTool(['--root', root, '--vitest', standIn({ seen: true }), 'one'], { inASandbox: true })
    expect(run.code, run.out).toBe(0)
    expect(tsc.code, run.out).toBe(0)
    expect(tsc.asksWhenItEnded, run.out).toBe(1)
    expect(seen(), run.out).toMatchObject({ lock: 1, gate: 0 })
    expect(heldNow(join(root, THE_TSC_LOCK)), run.out).toBe(0)
  })

  // Mutation: go on without the lock when a `flock -n` is refused, instead of waiting. Taking the shared lock with -n
  // and going on when only that is refused is no mutation this case can catch: a tsc in the rule's form holds the gate
  // all the time it holds the lock, so the batch waits at the gate, and the lock is free once the gate is.
  it('waits for a tsc that holds the lock when the seat is granted, and says so once', async () => {
    const tsc = aStandInTsc({ holds: true })
    expect(await until(() => existsSync(join(root, 'tsc-holds')), 20), 'the stand-in tsc must hold the lock').toBe(true)
    const tool = startTool(['--root', root, '--vitest', standIn({ seen: true }), 'one'], { inASandbox: true })
    const waits = waitsForTheTscLock(join(root, THE_TSC_GATE), join(root, THE_TSC_LOCK))
    expect(await until(() => tool.said().includes(waits), 15), tool.said()).toBe(true)
    await new Promise((wait) => setTimeout(wait, 1000))
    expect(existsSync(join(root, 'vitest-started')), tool.said()).toBe(false)
    tsc.child.stdin!.end()
    const run = await tool.ended
    expect(run.code, run.out).toBe(0)
    expect(await tsc.ended).toBe(0)
    expect(times(run.out, waits), run.out).toBe(1)
    expect(run.out.indexOf(holdsTheTscLock(join(root, THE_TSC_LOCK))), run.out).toBeGreaterThan(run.out.indexOf(waits))
    expect(seen(), run.out).toMatchObject({ lock: 1, gate: 0 })
  })

  // Mutation: take the shared lock without going through the gate.
  it('makes a batch that comes while a tsc waits for the lock wait behind the tsc', async () => {
    // TWO BATCHES IN ONE CASE. The stand-in office grants each batch's ask, so the two share its one seat answer. Each
    // batch has a stand-in vitest of its own, which writes a started file of its own in root, so the case can tell
    // which batch has started its tests.
    const first = startTool(['--root', root, '--vitest', standIn({ waits: true, started: 'first-vitest-started' }), 'one'], { inASandbox: true })
    expect(await until(() => existsSync(join(root, 'first-vitest-started')), 20), first.said()).toBe(true)
    const tsc = aStandInTsc()
    const gate = join(root, THE_TSC_GATE)
    // The tsc holds the gate and waits for the lock, which the first batch holds.
    expect(await until(() => heldNow(gate) === 1, 10), first.said()).toBe(true)
    expect(existsSync(join(root, 'tsc-holds'))).toBe(false)
    const second = startTool(['--root', root, '--vitest', standIn({ started: 'second-vitest-started' }), 'one'], { inASandbox: true })
    const waits = waitsForTheTscLock(gate, join(root, THE_TSC_LOCK))
    expect(await until(() => second.said().includes(waits), 15), second.said()).toBe(true)
    await new Promise((wait) => setTimeout(wait, 1000))
    expect(existsSync(join(root, 'second-vitest-started')), second.said()).toBe(false)
    process.kill(-first.child.pid!, 'SIGTERM')
    const one = await first.ended
    expect(one.signal, one.out).toBe('SIGTERM')
    expect(await tsc.ended).toBe(0)
    const two = await second.ended
    expect(two.code, two.out).toBe(0)
    expect(times(two.out, waits), two.out).toBe(1)
    expect(statSync(join(root, 'tsc-holds')).mtimeMs).toBeLessThanOrEqual(statSync(join(root, 'second-vitest-started')).mtimeMs)
  })

  // Mutation: leave out the check of /proc/self/fdinfo.
  it('takes no second hold when it was started inside the older shell form, which handed it the lock', async () => {
    const tsc: { ended?: Promise<number | null> } = {}
    asks = (n) => {
      // While the batch is in line, a tsc takes the gate and waits for the lock the shell handed the tool.
      if (n === 1) tsc.ended = aStandInTsc({ wait: 8 }).ended
      return n === 1 ? queued : granted
    }
    const run = await runTool(['--root', root, '--vitest', standIn(), 'one'], { inASandbox: true, inTheOlderShell: true })
    expect(run.code, run.out).toBe(0)
    const lock = join(root, THE_TSC_LOCK)
    expect(times(run.out, handedInBy(lock, '9')), run.out).toBe(1)
    expect(times(run.out, waitsForTheTscLock(join(root, THE_TSC_GATE), lock)), run.out).toBe(0)
    expect(await tsc.ended, run.out).toBe(0)
    expect(existsSync(join(root, 'tsc-holds'))).toBe(true)
  })

  // Mutation: start the batch again with descriptors 0 to 3 only.
  it('takes no second hold when it was started under timeout inside the older shell form, which handed it the lock', async () => {
    const tsc: { ended?: Promise<number | null> } = {}
    asks = (n) => {
      // While the batch is in line, a tsc takes the gate and waits for the lock the shell handed the tool.
      if (n === 1) tsc.ended = aStandInTsc({ wait: 8 }).ended
      return n === 1 ? queued : granted
    }
    const run = await runTool(['--root', root, '--vitest', standIn(), 'one'], { inASandbox: true, inTheOlderShell: true, underATimeout: true })
    expect(run.code, run.out).toBe(0)
    const lock = join(root, THE_TSC_LOCK)
    expect(times(run.out, handedInBy(lock, '9')), run.out).toBe(1)
    expect(times(run.out, waitsForTheTscLock(join(root, THE_TSC_GATE), lock)), run.out).toBe(0)
    expect(await tsc.ended, run.out).toBe(0)
    expect(existsSync(join(root, 'tsc-holds'))).toBe(true)
  }, 60_000)

  // Mutation: ignore TSC_LOCK_HELD_BY, and take the lock again.
  it('takes no lock when a batch that started it holds one, and passes that batch on to its test files unchanged', async () => {
    const above = 'a-made-up-batch-above'
    const run = await runTool(['--root', root, '--vitest', standIn({ seen: true }), 'one'], { inASandbox: true, heldBy: above })
    expect(run.code, run.out).toBe(0)
    expect(times(run.out, heldByABatchAbove(above)), run.out).toBe(1)
    expect(seen(), run.out).toEqual({ lock: 0, gate: 0, heldBy: above })
  })

  // Mutation: name nothing to the test files.
  it('names its own process to its test files as the batch that holds the lock', async () => {
    const { child, ended } = startTool(['--root', root, '--vitest', standIn({ seen: true }), 'one'], { inASandbox: true })
    const run = await ended
    expect(run.code, run.out).toBe(0)
    // The tool leads its own group, so the pid it names is the child's.
    expect(seen(), run.out).toEqual({ lock: 1, gate: 0, heldBy: String(child.pid) })
  })

  // Mutation: take the lock outside a sandbox as well.
  it('takes nothing outside a sandbox, and says nothing of the lock', async () => {
    const run = await runTool(['--root', root, '--vitest', standIn({ seen: true }), 'one'])
    expect(run.code, run.out).toBe(0)
    expect(seen(), run.out).toEqual({ lock: 0, gate: 0, heldBy: null })
    const lock = join(root, THE_TSC_LOCK)
    for (const line of [waitsForTheTscLock(join(root, THE_TSC_GATE), lock), holdsTheTscLock(lock), letGoOfTheTscLock(lock)]) {
      expect(times(run.out, line), run.out).toBe(0)
    }
    expect(run.out).not.toContain(lock)
  })

  // Mutation: run the tests when the lock could not be taken.
  it('stops the batch and gives the seat back when the lock cannot be taken, and says why', async () => {
    const missing = join(root, 'no-such-folder')
    const run = await runTool(['--root', root, '--vitest', standIn(), 'one'], { inASandbox: true, lockFolder: missing })
    expect(run.code, run.out).toBe(1)
    expect(existsSync(join(root, 'vitest-started'))).toBe(false)
    expect(urls(), run.out).not.toContain(VITEST)
    expect(urls().filter((url) => url === GIVE_BACK), run.out).toEqual([GIVE_BACK])
    expect(theLine(run.out, THE_TSC_LOCK_COULD_NOT_BE_TAKEN)).toContain(missing)
  })
})
