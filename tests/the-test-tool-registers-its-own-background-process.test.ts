// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TEST TOOL, STARTED WITH OR WITHOUT --background, REGISTERS ITS OWN PROCESS AND RELEASES IT ON EXPECTED ENDS AND
 * SUPPORTED SIGNALS.
 *
 * Chapter 2 asks that anything which outlives its command be registered on the run that started it, and released when
 * it ends. tools/run-named-tests.mjs does that itself whenever it is about to run tests and holds a run's key, through
 * the office's ledger door as the live office has it: POST /api/resources with type process, the tool's own pid as the
 * key and its start time as osStartedAt, and POST /api/resources/<row>/release with {"signalNothing":true} when it
 * ends. The release signals nothing because the process the row names is the one sending the request.
 *
 * --background is still taken and no longer changes what the tool does. A start that gives it says so in one sentence,
 * exported by tools/own-process-row.mjs, and registers and releases exactly as a start without it does.
 *
 * WHAT IS PROVED, against a stand-in office and a stand-in vitest. No real office is asked.
 *   1. A start with no flag registers before the tests run, on the run in MOLE_OFFICE_SESSION and with the run's key.
 *      Its start time is the local time with its offset, as clockStamp in src/shared/time.ts writes a stamp a machine
 *      compares, and not UTC. It releases the row once, after the use line, when the tests pass and when they fail.
 *      The exit code is vitest's.
 *   2. kill -TERM and kill -INT of the tool's process group release the row, and the tool ends by that signal.
 *   3. A start with --background prints the sentence about the flag once, and registers and releases as case 1 does.
 *   4. --print with and without --background runs nothing and sends nothing on the ledger.
 *   5. A refused registration is said; a granted seat still lets tests run. If the office does not answer or the shell
 *      has no key, the seat cannot be asked for, so tests do not start and the reason is said.
 *   6. A granted registration followed by a refused seat releases the row and does not start the tests.
 *   7. A release the office refuses is asked once, and the tool says so. The exit code is still vitest's.
 *
 * THE SEAT. A start asks for its test-batches seat after the row is registered, and gives it back before the use
 * line and the release. The stand-in office grants it and takes it back, so the order is heard. What the tool does
 * when the seat is queued or not given back is proved in the-test-tool-takes-a-test-batch-seat.
 *
 * Every key and address here is made up.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_BACKGROUND_FLAG_IS_STILL_TAKEN } from '../tools/own-process-row.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { clockStamp } from '../src/shared/time.ts'

const REPO = join(import.meta.dirname, '..')
const TOOL = join(REPO, 'tools', 'run-named-tests.mjs')
const OFFICE_VARIABLES = ['MOLE_OFFICE_API', 'MOLE_OFFICE_API_ROOT', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT']
const THE_KEY = 'mok_a-made-up-key-for-a-background-run-0001'
const THE_RUN = 'the-calling-run'
const THE_ROW = 'row-of-the-test-tool'
const REGISTER = 'POST /api/resources'
const RELEASE = `POST /api/resources/${THE_ROW}/release`
const USE = 'POST /api/toolset/uses'
const THE_SEAT = 'seat-of-the-background-run'
const SEAT_ASK = 'POST /api/slots/acquire'
const SEAT_BACK = `POST /api/slots/${THE_SEAT}/release`
const NOT_REGISTERED = 'run-named-tests: this run of the tests is not registered on the ledger: '
const NOT_RELEASED = `run-named-tests: the ledger row ${THE_ROW} was not released: `

/** One request the stand-in office heard. */
interface Heard {
  url: string
  session: unknown
  key: unknown
  body: Record<string, unknown> | null
}

/** How one run of the tool ended. */
interface Ended {
  code: number | null
  signal: NodeJS.Signals | null
  out: string
}

let root = ''
let office: Server
let api = ''
let heard: Heard[] = []
/** What the stand-in office answers each request but the seat's two with. A case that needs a refusal sets it. */
let answer: (url: string) => { status: number; body: unknown }
let started: ChildProcess[] = []
let refuseSeat = false

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'a-background-run-'))
  mkdirSync(join(root, 'tests'))
  writeFileSync(join(root, 'tests', 'one.test.ts'), "test('x', () => {})\n")
  heard = []
  started = []
  refuseSeat = false
  answer = (url) => url === REGISTER
    ? { status: 201, body: { resource: { id: THE_ROW, type: 'process' } } }
    : url === RELEASE ? { status: 200, body: { resource: { id: THE_ROW } } } : { status: 201, body: { run: THE_RUN } }
  office = createServer((req, res) => {
    let text = ''
    req.on('data', (chunk) => (text += String(chunk)))
    req.on('end', () => {
      let body: Record<string, unknown> | null = null
      try {
        body = JSON.parse(text) as Record<string, unknown> | null
      } catch {
        // Heard with body null.
      }
      const url = `${req.method ?? ''} ${req.url ?? ''}`
      heard.push({ url, session: req.headers['x-mole-office-session'], key: req.headers[KEY_HEADER], body })
      // The seat is granted except in the case that asks the stand-in to refuse it.
      const answered = url === SEAT_ASK && refuseSeat
        ? { status: 400, body: { error: 'the seat was refused' } }
        : url === SEAT_ASK ? { status: 200, body: { slot: { id: THE_SEAT, state: 'granted', seat: 1, position: null }, asked: 'new', handedOn: [], says: 'Granted.' } }
        : url === SEAT_BACK ? { status: 200, body: { released: true, id: THE_SEAT, says: 'Given back.' } } : answer(url)
      res.setHeader('content-type', 'application/json')
      res.statusCode = answered.status
      res.end(JSON.stringify(answered.body))
    })
  })
  await new Promise<void>((ready) => office.listen(0, '127.0.0.1', ready))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
})

afterEach(async () => {
  // A CASE THAT FAILED HALF WAY MAY LEAVE A TOOL WAITING. Each was started as the leader of its own group, so it is
  // stopped by that group and nothing else.
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
 * A stand-in vitest. It writes a file saying it started, then either waits to be stopped or writes a report naming
 * every file it was given with `status`, and exits with `code`.
 */
function standIn({ status = 'passed', code = 0, waits = false }: { status?: string; code?: number; waits?: boolean } = {}): string {
  const file = join(root, 'stand-in-vitest.mjs')
  writeFileSync(
    file,
    `import { writeFileSync } from 'node:fs'
const out = process.argv.find((word) => word.startsWith('--outputFile.json='))
const named = process.argv.filter((word) => word.endsWith('.test.ts'))
writeFileSync(${JSON.stringify(join(root, 'vitest-started'))}, 'started')
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

/** The tool as the leader of its own process group, with the office variables, the stand-in office and a made-up key. */
function startTool(words: string[], change: { api?: string; noKey?: boolean } = {}): { child: ChildProcess; ended: Promise<Ended> } {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of [...OFFICE_VARIABLES, 'MOLE_AGENT_KEY', 'MOLE_OFFICE_TOOL_CONFIGURATION', 'SANDBOX_DIR', 'SANDBOX_PROCESS_ROW']) delete env[name]
  Object.assign(env, {
    MOLE_OFFICE_API: change.api ?? api,
    MOLE_OFFICE_SESSION: THE_RUN,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_AGENT: 'background-tests-tester',
    ...(change.noKey === true ? {} : { MOLE_AGENT_KEY: THE_KEY }),
  })
  const child = spawn(process.execPath, [TOOL, ...words], { cwd: root, env, detached: true })
  started.push(child)
  let out = ''
  child.stdout?.on('data', (chunk) => (out += String(chunk)))
  child.stderr?.on('data', (chunk) => (out += String(chunk)))
  const ended = new Promise<Ended>((done) => child.on('close', (code, signal) => done({ code, signal, out })))
  return { child, ended }
}

/** Runs the tool to its end. */
function runTool(words: string[], change: { api?: string; noKey?: boolean } = {}): Promise<Ended> {
  return startTool(words, change).ended
}

/** Waits until the stand-in vitest has started, for at most ten seconds. */
async function untilVitestStarted(): Promise<void> {
  for (let tries = 0; tries < 200 && !existsSync(join(root, 'vitest-started')); tries += 1) {
    await new Promise((wait) => setTimeout(wait, 50))
  }
  expect(existsSync(join(root, 'vitest-started')), 'the stand-in vitest must have started').toBe(true)
}

/** The requests heard, by method and address, in order. */
function urls(): string[] {
  return heard.map((one) => one.url)
}

/** How many times a sentence's opening is in the tool's output. */
function times(out: string, words: string): number {
  return out.split(words).length - 1
}

describe('the test tool registers its own process whenever it runs tests under a run\'s key', () => {
  it.each([
    ['pass', 'passed', 0],
    ['fail', 'failed', 3],
  ])('registers before the tests run and releases the row once when the tests %s, with no flag', async (_, status, code) => {
    const before = Date.now()
    const { child, ended } = startTool(['--root', root, '--vitest', standIn({ status, code }), 'one'])
    const run = await ended
    expect(run.code, run.out).toBe(code)
    expect(urls(), run.out).toEqual([REGISTER, SEAT_ASK, SEAT_BACK, USE, RELEASE])
    const register = heard[0]!
    expect(register.session).toBe(THE_RUN)
    expect(register.key).toBe(THE_KEY)
    expect(Object.keys(register.body ?? {}).sort()).toEqual(['key', 'osStartedAt', 'type'])
    expect(register.body?.['type']).toBe('process')
    expect(register.body?.['key']).toBe(String(child.pid))
    // THE START TIME IS LOCAL TIME WITH ITS OFFSET, written as src/shared/time.ts writes a stamp a machine compares
    // (clockStamp's instant), and never UTC. The door reads the moment it names.
    const sent = String(register.body?.['osStartedAt'])
    const startedAt = Date.parse(sent)
    expect(Number.isFinite(startedAt), sent).toBe(true)
    expect(sent).toBe(clockStamp(() => new Date(startedAt)).instant)
    expect(startedAt).toBeGreaterThanOrEqual(before - 2000)
    expect(startedAt).toBeLessThanOrEqual(Date.now())
    const release = heard.find((one) => one.url === RELEASE)!
    expect(release.body).toEqual({ signalNothing: true })
    expect(release.session).toBe(THE_RUN)
    expect(release.key).toBe(THE_KEY)
    expect(times(run.out, NOT_REGISTERED)).toBe(0)
    expect(times(run.out, NOT_RELEASED)).toBe(0)
    expect(times(run.out, THE_BACKGROUND_FLAG_IS_STILL_TAKEN)).toBe(0)
  })

  it.each(['SIGTERM', 'SIGINT'] as const)('releases the row when its group is sent %s, and ends by that signal', async (signal) => {
    const { child, ended } = startTool(['--root', root, '--vitest', standIn({ waits: true }), 'one'])
    await untilVitestStarted()
    expect(urls()).toEqual([REGISTER, SEAT_ASK])
    process.kill(-child.pid!, signal)
    const run = await ended
    expect(run.signal, run.out).toBe(signal)
    expect(urls().filter((url) => url !== USE), run.out).toEqual([REGISTER, SEAT_ASK, SEAT_BACK, RELEASE])
    expect(heard.find((one) => one.url === RELEASE)?.body).toEqual({ signalNothing: true })
  })

  it('says the flag no longer changes anything once, and registers and releases the row, when started with --background', async () => {
    const { child, ended } = startTool(['--background', '--root', root, '--vitest', standIn({ status: 'passed', code: 0 }), 'one'])
    const run = await ended
    expect(run.code, run.out).toBe(0)
    expect(times(run.out, THE_BACKGROUND_FLAG_IS_STILL_TAKEN), run.out).toBe(1)
    expect(urls(), run.out).toEqual([REGISTER, SEAT_ASK, SEAT_BACK, USE, RELEASE])
    expect(heard[0]?.body?.['key']).toBe(String(child.pid))
    expect(heard[0]?.session).toBe(THE_RUN)
    expect(heard[0]?.key).toBe(THE_KEY)
    expect(heard.find((one) => one.url === RELEASE)?.body).toEqual({ signalNothing: true })
  })
})

describe('a --print start runs nothing and sends nothing, with or without --background', () => {
  it.each([['no flag', []], ['--background', ['--background']]])('hears nothing from --print with %s', async (_, flag) => {
    const run = await runTool([...flag, '--print', '--root', root, 'one'])
    expect(run.code, run.out).toBe(0)
    expect(urls(), run.out).toEqual([])
  })
})

describe('a refused registration and a missing seat', () => {
  it.each([400, 403, 409])('runs the tests and keeps vitest\'s exit code when the door answers %i', async (status) => {
    answer = (url) => url === REGISTER
      ? { status, body: { error: `the door answers ${String(status)}` } }
      : { status: 201, body: { run: THE_RUN } }
    const run = await runTool(['--background', '--root', root, '--vitest', standIn({ code: 3 }), 'one'])
    expect(run.code, run.out).toBe(3)
    expect(urls(), run.out).toEqual([REGISTER, SEAT_ASK, SEAT_BACK, USE])
    expect(times(run.out, NOT_REGISTERED), run.out).toBe(1)
    expect(run.out).toContain(`the door answers ${String(status)}`)
  })

  it('stops the tests when the office does not answer', async () => {
    const closed = createServer()
    await new Promise<void>((ready) => closed.listen(0, '127.0.0.1', ready))
    const gone = `http://127.0.0.1:${String((closed.address() as AddressInfo).port)}`
    await new Promise<void>((done) => closed.close(() => done()))
    const run = await runTool(['--background', '--root', root, '--vitest', standIn({ code: 3 }), 'one'], { api: gone })
    expect(run.code, run.out).not.toBe(0)
    expect(existsSync(join(root, 'vitest-started'))).toBe(false)
    expect(times(run.out, NOT_REGISTERED), run.out).toBe(1)
    expect(run.out).toContain('did not answer')
  })

  it('stops the tests when the shell holds no key', async () => {
    const run = await runTool(['--background', '--root', root, '--vitest', standIn({ code: 3 }), 'one'], { noKey: true })
    expect(run.code, run.out).not.toBe(0)
    expect(existsSync(join(root, 'vitest-started'))).toBe(false)
    expect(urls(), run.out).toEqual([])
    expect(times(run.out, NOT_REGISTERED), run.out).toBe(1)
    expect(run.out).toContain('holds no key')
  })
})

describe('a refused seat after registration', () => {
  it('releases the registered row once and does not start the tests', async () => {
    refuseSeat = true
    const run = await runTool(['--background', '--root', root, '--vitest', standIn(), 'one'])
    expect(run.code, run.out).not.toBe(0)
    expect(run.out).toContain('the seat was refused')
    expect(existsSync(join(root, 'vitest-started'))).toBe(false)
    expect(urls(), run.out).toEqual([REGISTER, SEAT_ASK, RELEASE])
    expect(heard[2]?.body).toEqual({ signalNothing: true })
    expect(heard[2]?.session).toBe(THE_RUN)
    expect(heard[2]?.key).toBe(THE_KEY)
  })
})

describe('a release the office refuses', () => {
  it('is asked once and said, and the exit code is still vitest\'s', async () => {
    answer = (url) => url === REGISTER
      ? { status: 201, body: { resource: { id: THE_ROW, type: 'process' } } }
      : url === RELEASE ? { status: 409, body: { error: 'the row moved' } } : { status: 201, body: { run: THE_RUN } }
    const run = await runTool(['--background', '--root', root, '--vitest', standIn({ code: 3 }), 'one'])
    expect(run.code, run.out).toBe(3)
    expect(urls(), run.out).toEqual([REGISTER, SEAT_ASK, SEAT_BACK, USE, RELEASE])
    expect(times(run.out, NOT_RELEASED), run.out).toBe(1)
    expect(run.out).toContain('the row moved')
  })
})
