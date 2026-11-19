// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LOGIN READING JOB TAKES ONE READING ROUND AN HOUR IN ITS OWN SANDBOX AND ANSWERS ITS FIRING. Problem
 * LeL0ssxi2jje, step 6; the design in message EEVacbmu1FEZ, decided in cG8h9dqwwwJ8 and 7B9asujb_j-w, and
 * changed by answer WkJf0ZUspgnr (choice H): nothing waits for the round, and the round runs under coreutils
 * `timeout 300` inside the sandbox.
 *
 * tools/run-the-login-reading.mjs is run by a timer outside the repository. On each tick it installs the hourly
 * counter of src/config/login-reading-job.mjs when no counter of the job has its title, starts one short Claude round
 * in the sandbox login-reading through `tools/sandbox.mjs exec` without --wait, and answers the firing as soon as the
 * start line comes back. The office reads the round's out file itself (src/server/lib/logins-week.ts); the runner
 * never reads it, never reads end.json, and claims no exit code.
 *
 * WHAT THIS FILE PROVES, with a fresh database, the office's own counter doors through app.inject, and a stand-in
 * for the sandbox tool that records its arguments and writes start.json, out, and end.json when a case asks:
 *   1. without each of its five environment variables, productionDoors() refuses with one sentence that says the
 *      runner needs its own agent, and never says "secretary";
 *   2. the first tick installs the hourly counter, the second installs no other, and a paused one stays paused and
 *      is not replaced;
 *   3. with no firing waiting, nothing is started and the returned sentence says so;
 *   4. one firing: exactly the whole reading command is started, with no --wait; the firing is answered once with
 *      the sandbox and the log folder, says no exit code is known, and carries no result; no figure or uuid from the
 *      round's out file is in the answer;
 *   5. an end.json saying exit 1 already in the folder changes nothing in the answer, so the runner does not read it;
 *   6. the round's time limit is in the command it starts, and it is the one named constant, 300 seconds;
 *   7. a sandbox tool that printed no start object is answered with its status and its error cut to 300
 *      characters, and no folder;
 *   8. three firings waiting: one round starts, for the newest, and the two older are answered as not run, naming
 *      the newest's seq;
 *   9. the job is registered, and a counter naming it can be filed.
 *
 * NOTHING HERE STARTS CLAUDE OR THE SANDBOX TOOL. The stand-in is a function given as the runner's exec door, and
 * productionDoors() is only built, never asked anything. The rate-limit event, its uuid, the key and every address
 * below are made up.
 *
 * MUTATIONS, PROVED AFTER A CONTROL RUN (see the commit message): `--wait` added to the exec (red: 4, 7, 8); the
 * older firings run instead of answered (red: 8); end.json's exit code read into the answer (red: 5); the refusal
 * saying "secretary" (red: 1); installation run past a paused counter (red: 2); `timeout 300` taken out of the
 * command (red: 4, 6, 7, 8).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import {
  LOGIN_READING_COMMAND,
  LOGIN_READING_COUNTER,
  LOGIN_READING_JOB,
  LOGIN_READING_LIMIT_SECONDS,
} from '../src/config/login-reading-job.mjs'
import { loginReadingTick, productionDoors } from '../tools/run-the-login-reading.mjs'

const START = new Date('2026-10-17T09:00:00')
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const KEEPER = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'synthetic-login-reading' }

/** The whole argument array the runner gives node, written out here and not built from the runner's own constants. */
const THE_ROUND = [
  fileURLToPath(new URL('../tools/sandbox.mjs', import.meta.url)),
  'exec', 'login-reading', '--secret', 'CLAUDE_CODE_OAUTH_TOKEN', '--json', '--',
  'timeout', '300', 'claude', '-p', 'Reply with OK.', '--model', 'claude-haiku-4-5-20251001', '--output-format', 'stream-json', '--verbose',
]
const THE_REFUSAL = 'The login reading runner needs its own agent, project, session and key environment.'
// MADE UP: a rate-limit event in the shape a stream-json round prints, with a figure and a uuid no answer may carry.
const MADE_UP_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const MADE_UP_OUT = [
  JSON.stringify({ type: 'system', subtype: 'init', session_id: 'synthetic-session', uuid: MADE_UP_UUID }),
  `{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","rateLimitType":"five_hour","utilization":0.42},"uuid":"${MADE_UP_UUID}","session_id":"synthetic-session"}`,
  JSON.stringify({ type: 'result', subtype: 'success', result: 'OK', uuid: MADE_UP_UUID }),
].join('\n')

let db: TestDb
let app: FastifyInstance
let counters: typeof import('../src/server/lib/counters.ts')
let jobs: typeof import('../src/server/lib/office-jobs.ts')
let clock = START.getTime()
const madeFolders: string[] = []

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  clock = START.getTime()
  db = await freshDb()
  app = (await apiApp()).app
  counters = await import('../src/server/lib/counters.ts')
  jobs = await import('../src/server/lib/office-jobs.ts')
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: 'synthetic-login-reading', name: 'Synthetic login reading' } })
  expect(made.statusCode, made.body).toBe(201)
  // A JOB FIRES ONLY IN THE DATABASE THAT IS THE OFFICE, so this fresh database is made a synthetic home office.
  const office = await import('../src/server/lib/office.ts')
  const world = await import('../src/server/lib/world.ts')
  office.registerWorldHere({ name: 'Synthetic login reading office', purpose: null, handback: null, kind: 'home', startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, checkout: `${THE_TEST_FIXTURE_ROOT}/login-reading`, head: 'abc1234', databaseIdentity: world.theWorldThisDatabaseIs() ?? '', address: 'http://127.0.0.1:41900', addressForOtherMachines: null, standing: 'canonical', parentWorld: null, installation: 'synthetic-login-reading' })
  expect(office.theOfficeIsInThisDatabase()).toBe(true)
}, 60_000)

afterEach(async () => {
  vi.useRealTimers()
  await app?.close()
  db?.close()
  for (const folder of madeFolders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/**
 * A STAND-IN FOR tools/sandbox.mjs exec. It records each argument array. Unless the case says it fails, it makes a log
 * folder `<tmp>/logs/cmd-<stamp>` holding start.json and the made-up out file, and end.json when the case gives one,
 * and prints the start object as the real tool does with --json: one JSON line, last on stdout.
 */
function aStandInSandbox(how: { end?: { code: number }; fails?: { status: number; stderr: string } } = {}) {
  const calls: string[][] = []
  const folders: string[] = []
  const exec = (args: readonly string[]) => {
    calls.push([...args])
    const root = mkdtempSync(join(tmpdir(), 'login-reading-stand-in-'))
    madeFolders.push(root)
    if (how.fails !== undefined) return { status: how.fails.status, stdout: '', stderr: how.fails.stderr }
    const folder = join(root, 'logs', `cmd-${String(calls.length)}`)
    mkdirSync(folder, { recursive: true })
    const out = join(folder, 'out')
    const start = { synthetic: true, run: null, instance: 'login-reading', out, processRow: 'synthetic-row', command: args.slice(args.indexOf('--') + 1) }
    writeFileSync(join(folder, 'start.json'), `${JSON.stringify(start, null, 2)}\n`)
    writeFileSync(out, `${MADE_UP_OUT}\n`)
    if (how.end !== undefined) writeFileSync(join(folder, 'end.json'), `${JSON.stringify({ code: how.end.code, signal: null, timedOut: false, exit: how.end.code, endedAt: '2026-10-17 10:02:00' })}\n`)
    folders.push(folder)
    return { status: 0, stdout: `${JSON.stringify(start)}\n`, stderr: '' }
  }
  return { exec, calls, folders }
}

/** The runner's doors: the test office through app.inject, as the agent, refusing what the office refuses. */
function doorsFor(exec: ReturnType<typeof aStandInSandbox>['exec']) {
  const asked: { method: string; path: string; body: unknown }[] = []
  const ask = async (method: string, path: string, body?: unknown) => {
    asked.push({ method, path, body })
    const response = await app.inject({ method: method as 'GET' | 'POST', url: path, headers: KEEPER, ...(body === undefined ? {} : { payload: body as Record<string, unknown> }) })
    if (response.statusCode >= 300) throw new Error(`The test office answered ${method} ${path} with ${String(response.statusCode)}: ${response.body}`)
    return JSON.parse(response.body)
  }
  return { asked, doors: { ask, exec } }
}

type ACounter = { id: string; title: string; paused: unknown; action: { kind: string; job?: string } }
type ARow = { seq: number; what: string; answer?: { job?: string; ids: string[]; says: string; finished: boolean } }

async function theJobsCounters(): Promise<ACounter[]> {
  const listed = await app.inject({ method: 'GET', url: '/api/counters', headers: PERSON })
  expect(listed.statusCode, listed.body).toBe(200)
  return (JSON.parse(listed.body).counters as ACounter[]).filter((one) => one.action.kind === 'job' && one.action.job === LOGIN_READING_JOB)
}

async function theRows(id: string): Promise<ARow[]> {
  const read = await app.inject({ method: 'GET', url: `/api/counters/${id}?limit=25`, headers: PERSON })
  expect(read.statusCode, read.body).toBe(200)
  return JSON.parse(read.body).rows as ARow[]
}

async function theAnswerOf(id: string, seq: number) {
  const row = (await theRows(id)).find((one) => one.seq === seq)
  expect(row?.what).toBe('firing')
  return row!.answer!
}

/** Moves the clock on an hour and a minute at a time and lets the office fire what is due, `n` times. */
async function theHourlyFirings(n: number): Promise<{ id: string; seq: number }[]> {
  const [installed] = await theJobsCounters()
  expect(installed, 'the hourly counter is installed first').toBeDefined()
  const fired: { id: string; seq: number }[] = []
  for (let i = 0; i < n; i++) {
    clock += 61 * 60_000
    vi.setSystemTime(new Date(clock))
    expect(counters.fireTheCountersThatAreDue(new Date(clock)).fired).toEqual([installed!.id])
    const newest = (await theRows(installed!.id)).find((row) => row.what === 'firing')!
    expect(newest.answer).toMatchObject({ job: LOGIN_READING_JOB, finished: false })
    fired.push({ id: installed!.id, seq: newest.seq })
  }
  return fired
}

describe('the runner names its own agent', () => {
  const FIVE = ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_AGENT_KEY'] as const
  // MADE UP. Nothing listens at this address, and the key is no key.
  const MADE_UP = { MOLE_OFFICE_API: 'http://127.0.0.1:9', MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_AGENT: 'synthetic-login-reading', MOLE_OFFICE_SESSION: 'synthetic-session', MOLE_AGENT_KEY: 'synthetic-not-a-key' }

  function withTheEnvironment(missing: (typeof FIVE)[number] | null, then: () => void) {
    const saved = Object.fromEntries(FIVE.map((name) => [name, process.env[name]]))
    try {
      for (const name of FIVE) process.env[name] = MADE_UP[name]
      if (missing !== null) delete process.env[missing]
      then()
    } finally {
      for (const name of FIVE) {
        if (saved[name] === undefined) delete process.env[name]
        else process.env[name] = saved[name]
      }
    }
  }

  it.each(FIVE)('refuses to build its doors without %s, naming its own agent and no secretary', (missing) => {
    withTheEnvironment(missing, () => {
      let said = ''
      try {
        productionDoors()
      } catch (why) {
        said = why instanceof Error ? why.message : String(why)
      }
      expect(said).toBe(THE_REFUSAL)
      expect(said).toContain('its own agent')
      expect(said).not.toMatch(/secretary/i)
      expect(said).not.toContain(MADE_UP.MOLE_AGENT_KEY)
    })
  })

  it('builds its doors, and asks nothing, when all five are there', () => {
    withTheEnvironment(null, () => {
      const doors = productionDoors()
      expect(typeof doors.ask).toBe('function')
      expect(typeof doors.exec).toBe('function')
    })
  })
})

describe('the hourly counter', () => {
  it('is installed by the first tick, not again by the second, and a paused one stays paused and is not replaced', async () => {
    const sandbox = aStandInSandbox()
    const { doors } = doorsFor(sandbox.exec)
    await loginReadingTick(doors)
    const installed = await theJobsCounters()
    expect(installed).toHaveLength(1)
    expect(installed[0]).toMatchObject({ title: LOGIN_READING_COUNTER.title, paused: null, mayAdd: { anyone: false, who: [] }, triggers: [{ kind: 'every', hours: 1 }], action: { kind: 'job', job: LOGIN_READING_JOB } })
    await loginReadingTick(doors)
    expect((await theJobsCounters()).map((one) => one.id)).toEqual([installed[0]!.id])
    const paused = await app.inject({ method: 'POST', url: `/api/counters/${installed[0]!.id}/pause`, headers: PERSON, payload: { because: 'Synthetic pause for the installation case.' } })
    expect(paused.statusCode, paused.body).toBe(200)
    await loginReadingTick(doors)
    const after = await theJobsCounters()
    expect(after.map((one) => one.id)).toEqual([installed[0]!.id])
    expect(after[0]!.paused).not.toBeNull()
    expect(sandbox.calls).toEqual([])
  })

  it('starts nothing, and says so, while no firing waits', async () => {
    const sandbox = aStandInSandbox()
    const { doors } = doorsFor(sandbox.exec)
    await loginReadingTick(doors)
    // FIFTY-NINE MINUTES ON, the hourly counter is not yet due.
    clock += 59 * 60_000
    vi.setSystemTime(new Date(clock))
    expect(counters.fireTheCountersThatAreDue(new Date(clock)).fired).toEqual([])
    const said = await loginReadingTick(doors)
    expect(said).toContain('No login reading firing is waiting, so no reading round was started')
    expect(sandbox.calls).toEqual([])
  })
})

describe('one reading round', () => {
  it('starts exactly the reading command with no --wait, and answers once with the sandbox and folder and no exit code', async () => {
    const sandbox = aStandInSandbox()
    const { doors, asked } = doorsFor(sandbox.exec)
    await loginReadingTick(doors)
    const [firing] = await theHourlyFirings(1)
    const said = await loginReadingTick(doors)
    expect(sandbox.calls).toEqual([THE_ROUND])
    expect(sandbox.calls[0]).not.toContain('--wait')
    const answer = await theAnswerOf(firing!.id, firing!.seq)
    expect(answer.finished).toBe(true)
    expect(answer.ids).toEqual([])
    expect(answer.says).toContain('login-reading')
    expect(answer.says).toContain(sandbox.folders[0])
    expect(answer.says).toContain('the reading round was started; whether it ended well is read from its out file')
    expect(answer.says).toContain('No exit code is known')
    const posted = asked.filter((one) => one.path === `/api/counters/${firing!.id}/firings/${String(firing!.seq)}/answer`)
    expect(posted).toEqual([{ method: 'POST', path: posted[0]?.path, body: { says: answer.says } }])
    for (const made of ['0.42', '42%', MADE_UP_UUID]) {
      expect(answer.says).not.toContain(made)
      expect(said).not.toContain(made)
    }
  })

  it('reads no end.json: an exit 1 already in the folder leaves the answer as it is without one', async () => {
    const plain = aStandInSandbox()
    const ended = aStandInSandbox({ end: { code: 1 } })
    await loginReadingTick(doorsFor(plain.exec).doors)
    const [first] = await theHourlyFirings(1)
    await loginReadingTick(doorsFor(plain.exec).doors)
    const [second] = await theHourlyFirings(1)
    await loginReadingTick(doorsFor(ended.exec).doors)
    const without = (await theAnswerOf(first!.id, first!.seq)).says
    const withEnd = (await theAnswerOf(second!.id, second!.seq)).says
    expect(withEnd.replace(ended.folders[0]!, '<folder>')).toBe(without.replace(plain.folders[0]!, '<folder>'))
    expect(withEnd.replace(ended.folders[0]!, '<folder>')).not.toMatch(/\b1\b/)
  })

  it('runs the round under the one named time limit, 300 seconds, inside the sandbox', async () => {
    expect(LOGIN_READING_LIMIT_SECONDS).toBe(300)
    expect(Object.isFrozen(LOGIN_READING_COMMAND)).toBe(true)
    expect(LOGIN_READING_COMMAND.slice(0, 3)).toEqual(['timeout', String(LOGIN_READING_LIMIT_SECONDS), 'claude'])
    const sandbox = aStandInSandbox()
    const { doors } = doorsFor(sandbox.exec)
    await loginReadingTick(doors)
    const [firing] = await theHourlyFirings(1)
    await loginReadingTick(doors)
    const started = sandbox.calls[0]!
    expect(started.slice(started.indexOf('--') + 1, started.indexOf('--') + 4)).toEqual(['timeout', '300', 'claude'])
    expect((await theAnswerOf(firing!.id, firing!.seq)).says).toContain('300 seconds')
  })

  it('answers a sandbox tool that printed no start object with its status and its error cut to 300 characters, and no folder', async () => {
    const stderr = `sandbox.mjs: synthetic refusal before anything started. ${'x'.repeat(400)}`
    const sandbox = aStandInSandbox({ fails: { status: 3, stderr } })
    const { doors } = doorsFor(sandbox.exec)
    await loginReadingTick(doors)
    const [firing] = await theHourlyFirings(1)
    await loginReadingTick(doors)
    expect(sandbox.calls).toEqual([THE_ROUND])
    const answer = await theAnswerOf(firing!.id, firing!.seq)
    expect(answer.finished).toBe(true)
    expect(answer.ids).toEqual([])
    expect(answer.says).toContain('status 3')
    expect(answer.says).toContain(stderr.slice(0, 300))
    expect(answer.says).not.toContain(stderr.slice(0, 301))
    expect(answer.says).not.toContain(tmpdir())
    expect(answer.says).not.toMatch(/log folder/i)
  })
})

describe('more than one firing waiting', () => {
  it('starts one round, for the newest, and answers the two older as not run, naming the newest', async () => {
    const sandbox = aStandInSandbox()
    const { doors } = doorsFor(sandbox.exec)
    await loginReadingTick(doors)
    const [oldest, middle, newest] = await theHourlyFirings(3)
    await loginReadingTick(doors)
    expect(sandbox.calls).toEqual([THE_ROUND])
    expect((await theAnswerOf(newest!.id, newest!.seq)).says).toContain(sandbox.folders[0])
    for (const older of [oldest!, middle!]) {
      const answer = await theAnswerOf(older.id, older.seq)
      expect(answer.finished).toBe(true)
      expect(answer.ids).toEqual([])
      expect(answer.says).toMatch(/^Not run/)
      expect(answer.says).toContain(`firing ${String(newest!.seq)} is newer`)
      expect(answer.says).not.toContain(sandbox.folders[0])
    }
  })
})

describe('the registered job', () => {
  it('is on the office list, and a counter naming it can be filed', async () => {
    expect(LOGIN_READING_JOB).toBe('sandboxes-claude.login-reading')
    const registered = jobs.theOfficeJobNamed(LOGIN_READING_JOB)
    expect(registered).not.toBeNull()
    expect(registered?.what).toContain('login-reading sandbox')
    const filed = await app.inject({ method: 'POST', url: '/api/counters', headers: KEEPER, payload: { title: 'Synthetic counter naming the login reading job', counts: 'Synthetic requests for a reading.', triggers: [{ kind: 'count', n: 1 }], action: { kind: 'job', job: LOGIN_READING_JOB } } })
    expect(filed.statusCode, filed.body).toBe(201)
  })
})
