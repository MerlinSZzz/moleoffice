// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INSTALLED OFFICE CARRIES WHAT AN AGENT NEEDS TO START (wave 13t, round 16; report 3VoXeLuUUyeI,
 * question 5; decision AusK_Wfu4cf5).
 *
 * Before this round no agent could start in an installed office: the skill did not ship, so the office
 * refused every run, and the skill's register step ran tools/register-myself.mjs, which does not ship.
 * Now the tools an agent runs are in for-agents/, which ships, and so does the skill.
 *
 *   1. In a checkout, GET /api/onboarding names for-agents/ and plain `node`, and the folder holds the
 *      tools it names.
 *   3. That bundle's office, started on a home and a port of its own, serves its built waiter as it is,
 *      and tests/installed/an-agent-starts.mjs passes against it: an agent registers with the shipped
 *      tool, holds its handle, gets a message and answers it, and nothing the waiter hands over speaks of
 *      a checkout, the office's own welcome included. The same script runs in the container
 *      against the packed app (tests/installed/run-in-a-container.sh).
 *   4. NO STEP REACHES AN OFFICE THE TEST DID NOT START (wave 13t, round 18; problem JQ3yaANBi1JC). A
 *      sandbox gives its agent's shell MOLE_OFFICE_API naming the owner's live office, with a run and a
 *      key, and on 4 October round 16 ran the bundled register-myself.mjs from that shell without --api:
 *      the tool registered an agent "x" in the live office. So case 3 runs the driver from such a shell,
 *      with the address naming a stand-in this test listens on and never gives to anything as an office,
 *      and fails when any request reaches the stand-in.
 *   5. ITS SESSION HOOK FILES A SESSION IN IT (round W21). Until this round the hook was in tools/,
 *      which no bundle carries, so an installed office's press wrote no hook line and its agents' sessions
 *      were filed only by the skill's own step. The hook is now built into for-agents/. Run as an installed
 *      office's hook line runs it, by the Node that runs the office, with Claude Code's payload on stdin and
 *      with no node on PATH and none of this shell's office settings, its start files a session in the
 *      bundle's office, and its stop and end then end with 0. Its note is in the person's data folder, because
 *      an office installed in /opt cannot write beside its code. Its lines name nothing a checkout has:
 *      no tools/, no CLAUDE.md and not "this checkout".
 *   6. WITH NOTHING SET, ITS HOOK ASKS ITS OWN OFFICE AND SAYS NOTHING ON STDERR (round W22). Until this round every
 *      run of an installed office's hook printed a line on stderr saying the address took the default, and the
 *      person's Claude Code showed it at every session start, every turn's end and every session's end. Run with
 *      neither MOLE_OFFICE_API nor MOLE_OFFICE_PORT set, the hook asks the office its install runs, at the port that
 *      office's service lock records, and files the session there; its start, stop and end write nothing on stderr.
 *      The test gives the office a port of its own, so a hook that took the default port would not reach it.
 *   7. A SETTING THE PERSON MADE STILL WINS. With MOLE_OFFICE_API in the environment, or MOLE_OFFICE_PORT in the
 *      data folder's .env, the hook asks where that setting says, and not at the port the lock records.
 *   8. A CHECKOUT'S HOOK STILL SAYS THE LINE. A checkout runs no install's own office, so the hook's first step finds
 *      none and its address is whereIsTheApi's, which says on stderr that it took the default. whereIsTheApi asks the
 *      same step first, so in a checkout every tool's address is what it was. This case runs that step in this
 *      process, with nothing set, because a checkout's hook run whole with nothing set would ask port 8787, and a test
 *      may not depend on what answers there.
 *   9. WITH NO LOCK IT CAN READ, ITS HOOK ASKS THE DECLARED PORT, AND AN UNREADABLE LOCK IS SAID. With nothing set and
 *      no office running there is no lock, and the hook says nothing on stderr. A lock that is not JSON is never taken
 *      for no lock (src/config/the-service-lock.mjs): the hook says so in one line naming the lock's path, why it
 *      cannot be read and the declared address it asks instead. That lock starts with text shaped like its token, and
 *      the line holds none of it. The hook is run with no payload, so it asks nothing: its address is worked out before
 *      it reads one, and the declared port is 8787, which this test may not ask (case 8).
 *  10. ITS OTHER TOOLS ASK THE SAME OFFICE. With nothing set, the installed register-myself.mjs asks the office at the
 *      port the lock records, as the hook does, and says nothing on stderr about a default. The lock here names a
 *      stand-in, and no office runs.
 *  11. IN AN APPIMAGE, ITS HOOK LINES FILE A SESSION THROUGH ITS LAUNCHER (round W23). Started with APPIMAGE set and
 *      APPDIR at the bundle, as an AppImage starts it, the office writes its hook launcher in the person's data folder,
 *      naming the bundle's hook and the program the office runs on, told to run as Node. The person's press, sent as the Settings page sends it,
 *      writes three hook lines that run that launcher with /bin/sh. The start line, run through sh as it is written,
 *      with Claude Code's payload, no node on PATH and none of this shell's office settings, files a session in the
 *      bundle's office, and its stop and end lines then end with 0 and say nothing on stderr. This bundle was not
 *      packed, so the program the office runs on is the Node running this test, which reads nothing in that variable.
 *
 * Never the live office: the office and the tools run with none of this shell's MOLE_OFFICE_ settings,
 * and the driver is given only the stand-in's. The built page must exist (`npm run build`), because a
 * bundle carries it.
 *
 * Three-run proofs: node tools/run-named-tests.mjs tests/the-installed-office-carries-what-an-agent-starts-with.test.ts
 * MUTATIONS, each run on 4 October 2026:
 *   - src/server/api/onboarding.ts leaves forAgents out: red, cases 1 and 3;
 *   - scripts/bundle.mjs does not copy the skill: red, case 2;
 *   - src/server/lib/cardmessage.ts says again that the rules are "in the checkout": red, case 3 (the
 *     office's welcome, which the waiter hands over first, speaks of a checkout);
 *   - for-agents/hold-the-handle.mjs gives a checkout's command in a bundle too: red, case 3 (its line to
 *     start it again does not name the installation's Node and file).
 * MUTATION (round 18), run on 5 October 2026: tests/installed/an-agent-starts.mjs runs register-myself.mjs
 * as round 16's step did, with the shell's own environment and no --api: red, case 3, because the
 * registration (POST /api/agents/register-myself) reached the stand-in. A second, the same day:
 * aPlainEnvironment in tests/installed/ask-until.mjs passes everything on: red, case 3, though not at the
 * stand-in, because the driver passes --api: the shell's MOLE_OFFICE_WORKSPACE reached register-myself.mjs
 * and the test's office refused the unknown project.
 * MUTATION (wave 13w round 1), run on 13 October 2026: scripts/bundle.mjs copies CODE.md and chapters.json
 * from src/config/rules too: red, case 2.
 * Round 19 moved the stand-in and the agent's shell into tests/the-shells-office-stand-in.ts, which
 * tests/the-window-and-terminal-drivers-pass-no-office-on.test.ts shares; the first mutation, run again
 * that day: red, case 3, at the stand-in.
 * MUTATIONS (wave 13t, round W22), run from 23:50 on 2 November to 00:06 on 3 November 2026 (UTC), each after a
 * control run that passed, and each restored:
 *   - for-agents/where-is-the-api.mjs asks apiAddressFrom inside theInstallsOwnOffice, so the default's line is said:
 *     red, cases 6, 9 and 10;
 *   - for-agents/session-hook.mjs expects the world the declaration names, not its own office's: red, case 6;
 *   - theInstallsOwnOffice does not step aside for a setting: red, case 7, and cases 9 and 10 after it, because
 *     case 7 then fails before it stops its office;
 *   - theInstallsOwnOffice does not step aside in a checkout: red, case 8;
 *   - a lock that cannot be read is passed over in silence: red, case 9;
 *   - an absent lock is taken as no office of its own, so the default's line is said: red, case 9;
 *   - the port asked is one more than the lock's: red, cases 6 and 10;
 *   - whereIsTheApi asks only apiAddressFrom: red, case 10. 8787 was held by a listener, which heard nothing, because
 *     the test runner refuses that port before a connection is made;
 *   - for-agents/register-myself.mjs reads its project through settings() again: red, case 10.
 * MUTATIONS (wave 13t, round W22, after its gates moved the world into the self-check and case 6 began to run a start
 * after a compaction), run from 00:57 to 01:06 on 3 November 2026 (UTC), each after a control run that passed, and
 * each restored; each red, case 6:
 *   - the hook passes no office of its own to whatAnswersForThisOffice, so it expects the declaration's world;
 *   - the hook's start after a compaction passes no office of its own to whatAWorldHeaderShows;
 *   - src/config/the-self-check.mjs: whatAnswersForThisOffice ignores `declared`;
 *   - src/config/the-self-check.mjs: whatAWorldHeaderShows ignores `declared`.
 * MUTATIONS (wave 13t, round W23), run from 03:38 to 03:41 on 3 November 2026 (UTC), each after a control run that
 * passed, and each restored; each red, case 11:
 *   - src/config/install-the-entry.mjs: the AppImage's three lines run the hook with the bundle's Node, not the
 *     launcher;
 *   - src/server/index.ts: the start writes the skill's copy and not the launcher.
 */

import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theInstallsOwnOffice } from '../for-agents/where-is-the-api.mjs'
import { PORTS_VARIABLE } from '../tools/live-office-guard.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { apiAddressFrom, forgetTheDefaultApiAddressWarning, THE_AGENTS_TOOLS, THE_FOR_AGENTS_FOLDER } from '../src/config/settings.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import { apiApp, freshDb, TEST_DATABASE_PREFIX } from './helpers.ts'
import { aFreePort } from './installed/ask-until.mjs'
import { anAgentsShell, aStandInForTheShellsOffice, runToItsEnd, type TheShellsOffice } from './the-shells-office-stand-in.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

const groups = new Set<number>()
let dir = ''
let bundle = ''
let home = ''
let api = ''
let env: NodeJS.ProcessEnv = {}

/** The office an agent's shell names, as a stand-in that keeps every request reaching it (tests/the-shells-office-stand-in.ts). */
let theShellsOffice: TheShellsOffice | null = null

/** Run the bundle's own `mole-office` command, in this test's environment unless a case gives another. */
function theCommand(what: string, commandEnv: NodeJS.ProcessEnv = env): Promise<{ code: number | null; out: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(bundle, 'mole-office.mjs'), what], { cwd: dir, env: commandEnv, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => (out += String(chunk)))
    child.stderr.on('data', (chunk) => (out += String(chunk)))
    child.on('close', (code) => done({ code, out }))
  })
}

/** Start the bundle's office with the `mole-office` command, keeping its process group for the end. */
async function startTheOffice(): Promise<void> {
  const started = await theCommand('start')
  const named = /in process group (\d+)/.exec(started.out)?.[1]
  if (named !== undefined) groups.add(Number(named))
  const lock = readTheServiceLock(join(home, '.config', 'mole-office', 'data', 'mole-office.db.service.json'))
  if (lock.state === 'read') groups.add(lock.lock.pgid)
  expect(started.code, started.out).toBe(0)
}

/**
 * WHAT AN INSTALLED OFFICE'S HOOK LINE RUNS UNDER when the person set nothing: this test's environment without the
 * port it gave the office, and a PATH that holds no node.
 */
function withNoOfficeSetting(): NodeJS.ProcessEnv {
  const unset: NodeJS.ProcessEnv = { ...env, PATH: String(process.env['PATH']).split(':').filter((folder) => folder !== '' && !existsSync(join(folder, 'node'))).join(':') }
  delete unset['MOLE_OFFICE_PORT']
  return unset
}

/** The conversation of the session record the hook's note names, read from the bundle's office with the person's key. */
async function theConversationFiled(conversation: string): Promise<string | undefined> {
  const note = JSON.parse(readFileSync(join(home, '.config', 'mole-office', '.logs', `session-${conversation}.json`), 'utf8')) as { id: string }
  const keys = JSON.parse(readFileSync(join(home, '.config', 'mole-office', 'data', 'keys.json'), 'utf8')) as { person: string }
  const read = await fetch(`${api}/api/records/${note.id}`, { headers: { [KEY_HEADER]: keys.person } })
  expect(read.status).toBe(200)
  const filed = ((await read.json()) as { record: { kind: string; data: { providerSession?: string } } }).record
  expect(filed.kind).toBe('session')
  return filed.data.providerSession
}

/**
 * Run the bundle's hook's start to its end with Claude Code's payload on stdin, without holding up this process, so a
 * stand-in can answer meanwhile. With no payload the hook asks nothing.
 */
function theHookStartsAlongside(hookEnv: NodeJS.ProcessEnv): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(bundle, THE_FOR_AGENTS_FOLDER, 'session-hook.mjs'), 'start'], { cwd: dir, env: hookEnv, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000)
    child.on('close', (status) => {
      clearTimeout(timer)
      done({ status, stdout, stderr })
    })
    child.stdin.end(JSON.stringify({ session_id: randomUUID(), cwd: dir, hook_event_name: 'SessionStart' }))
  })
}

beforeAll(async () => {
  dir = mkdtempSync(`${TEST_DATABASE_PREFIX}agent-starts-`)
  bundle = join(dir, 'bundle')
  home = join(dir, 'home')
  mkdirSync(home)
  const made = spawnSync(process.execPath, [join(REPO, 'scripts', 'bundle.mjs'), '--out', bundle], { cwd: REPO, encoding: 'utf8', timeout: 300_000 })
  expect(made.status, `${made.stdout}\n${made.stderr}`).toBe(0)
  const port = await aFreePort()
  api = `http://127.0.0.1:${String(port)}`
  // NONE OF THIS SHELL'S SETTINGS: a home of its own, a port of its own, and the PATH to find programs.
  // AND THE SUITE'S MARK, so the bundled server knows a test started it on a Mac as well; on Linux a
  // server a test started without it refuses to start (src/config/the-test-mark.mjs).
  env = {
    PATH: process.env['PATH'],
    HOME: home,
    MOLE_OFFICE_PORT: String(port),
    MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none',
    [THE_TEST_MARK]: process.env[THE_TEST_MARK],
  }
  theShellsOffice = await aStandInForTheShellsOffice()
}, 360_000)

afterAll(async () => {
  const running = [...groups].filter((group) => theProcessAt(group).here)
  for (const group of running) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 15_000
  while (running.some((group) => theProcessAt(group).here) && Date.now() < deadline) await sleep(200)
  for (const group of running.filter((one) => theProcessAt(one).here)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
  await theShellsOffice?.close()
}, 60_000)

describe('an installed office carries what an agent needs to start', () => {
  it('names for-agents/ in a checkout, and the folder holds the tools it names', async () => {
    const t = await freshDb()
    const { app } = await apiApp()
    try {
      await app.ready()
      const res = await app.inject({ method: 'GET', url: '/api/onboarding' })
      expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
      const forAgents = (res.json() as { forAgents?: { folder: string; node: string; environment: Record<string, string>; tools: string[] } }).forAgents
      expect(forAgents?.folder).toBe(join(REPO, THE_FOR_AGENTS_FOLDER))
      expect(forAgents?.node).toBe('node')
      expect(forAgents?.environment, 'a checkout tells its agents to set something before they run node').toEqual({})
      expect(forAgents?.tools).toEqual([...THE_AGENTS_TOOLS])
      for (const tool of forAgents?.tools ?? []) expect(existsSync(join(REPO, THE_FOR_AGENTS_FOLDER, tool)), tool).toBe(true)
    } finally {
      await app.close()
      t.close()
    }
  })

  it("serves its built waiter as it is, and an agent registers, holds its handle, gets a message and answers it", async () => {
    const started = await theCommand('start')
    const named = /in process group (\d+)/.exec(started.out)?.[1]
    if (named !== undefined) groups.add(Number(named))
    const lock = readTheServiceLock(join(home, '.config', 'mole-office', 'data', 'mole-office.db.service.json'))
    if (lock.state === 'read') groups.add(lock.lock.pgid)
    expect(started.code, started.out).toBe(0)

    const served = await fetch(`${api}/api/handles/waiter`)
    expect(served.status).toBe(200)
    const waiter = (await served.json()) as { path: string; text: string }
    expect(waiter.path).toBe(join(bundle, THE_FOR_AGENTS_FOLDER, 'hold-the-handle.mjs'))
    expect(waiter.text).toBe(readFileSync(waiter.path, 'utf8'))

    // THE SAME SCRIPT THE CONTAINER RUNS. This bundle was not packed, so it carries no Node of its own
    // and the script is told to use this one. It runs from an agent's shell whose office is the stand-in.
    const run = await runToItsEnd(
      process.execPath,
      [join(REPO, 'tests', 'installed', 'an-agent-starts.mjs'), '--api', api, '--keys', join(home, '.config', 'mole-office', 'data', 'keys.json'), '--node', process.execPath],
      // The script refuses the live offices' ports: it is handed the ones the runner read (tools/live-office-ports.mjs).
      { cwd: dir, env: { ...env, ...anAgentsShell(String(theShellsOffice?.address)), [PORTS_VARIABLE]: process.env[PORTS_VARIABLE] }, timeoutMs: 240_000 },
    )
    expect(theShellsOffice?.reached, `a step reached the office the agent's shell names, which this test did not start\n${run.stdout}`).toEqual([])
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0)
    expect(run.stdout).toContain('Every step held.')

    const stopped = await theCommand('stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 300_000)

  it('runs its session hook by its own Node with no node on PATH, and the hook files the session in that office', async () => {
    const started = await theCommand('start')
    const named = /in process group (\d+)/.exec(started.out)?.[1]
    if (named !== undefined) groups.add(Number(named))
    expect(started.code, started.out).toBe(0)

    // AS AN INSTALLED OFFICE'S HOOK LINE RUNS IT: the hook by its whole path, on the Node that runs the office.
    // This bundle was not packed, so that Node is this one. The PATH holds no node, and nothing names an office.
    const hook = join(bundle, THE_FOR_AGENTS_FOLDER, 'session-hook.mjs')
    const noNode = String(process.env['PATH']).split(':').filter((folder) => folder !== '' && !existsSync(join(folder, 'node'))).join(':')
    const conversation = randomUUID()
    const theHookRun = (mode: string, event: string) =>
      spawnSync(process.execPath, [hook, mode], {
        cwd: dir,
        env: { ...env, PATH: noNode },
        input: JSON.stringify({ session_id: conversation, cwd: dir, hook_event_name: event }),
        encoding: 'utf8',
        timeout: 30_000,
      })
    const start = theHookRun('start', 'SessionStart')
    expect(start.status, `${start.stdout}\n${start.stderr}`).toBe(0)
    expect(start.stdout).toContain('MOLE OFFICE —')

    // ITS NOTE IS IN THE PERSON'S DATA FOLDER, not beside the code, and it names the session the hook filed.
    const notes = join(home, '.config', 'mole-office', '.logs')
    expect(existsSync(join(bundle, '.logs')), 'a note was written beside the installed code').toBe(false)
    const note = JSON.parse(readFileSync(join(notes, `session-${conversation}.json`), 'utf8')) as { id: string }
    const keys = JSON.parse(readFileSync(join(home, '.config', 'mole-office', 'data', 'keys.json'), 'utf8')) as { person: string }
    const read = await fetch(`${api}/api/records/${note.id}`, { headers: { [KEY_HEADER]: keys.person } })
    expect(read.status).toBe(200)
    const filed = ((await read.json()) as { record: { kind: string; data: { providerSession?: string } } }).record
    expect(filed.kind).toBe('session')
    expect(filed.data.providerSession).toBe(conversation)

    // ITS LINES NAME NOTHING A CHECKOUT HAS. The line that says which processes the hook looked at quotes their command
    // lines, and here those are this test runner's, so that one line is left out of what is read.
    const itsOwnLines = start.stdout
      .split('\n')
      .filter((line) => !line.startsWith("This run's own process is NOT on its record:"))
      .join('\n')
    expect(itsOwnLines).not.toMatch(/\btools\//)
    expect(itsOwnLines).not.toContain('CLAUDE.md')
    expect(itsOwnLines).not.toContain('this checkout')

    for (const [mode, event] of [['stop', 'Stop'], ['end', 'SessionEnd']] as const) {
      const ran = theHookRun(mode, event)
      expect(ran.status, `${mode}: ${ran.stdout}\n${ran.stderr}`).toBe(0)
    }

    const stopped = await theCommand('stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 120_000)

  it('with nothing set, its hook asks the office its install runs, at the port its lock records, and says nothing on stderr', async () => {
    await startTheOffice()
    // THE LOCK NAMES THE PORT THIS TEST GAVE THE OFFICE, which is not the default one.
    const lock = readTheServiceLock(join(home, '.config', 'mole-office', 'data', 'mole-office.db.service.json'))
    expect(lock.state === 'read' ? String(lock.lock.port) : lock.state).toBe(new URL(api).port)

    const conversation = randomUUID()
    const theHookRun = (mode: string, event: string, source?: string) =>
      spawnSync(process.execPath, [join(bundle, THE_FOR_AGENTS_FOLDER, 'session-hook.mjs'), mode], {
        cwd: dir,
        env: withNoOfficeSetting(),
        input: JSON.stringify({ session_id: conversation, cwd: dir, hook_event_name: event, ...(source === undefined ? {} : { source }) }),
        encoding: 'utf8',
        timeout: 30_000,
      })
    const start = theHookRun('start', 'SessionStart')
    expect(start.status, `${start.stdout}\n${start.stderr}`).toBe(0)
    expect(start.stderr).toBe('')
    expect(start.stdout).toContain('MOLE OFFICE —')
    expect(await theConversationFiled(conversation)).toBe(conversation)
    // AFTER A COMPACTION the hook judges the world on its first reply's header, and expects its install's office there.
    const compacted = theHookRun('start', 'SessionStart', 'compact')
    expect(compacted.status, `${compacted.stdout}\n${compacted.stderr}`).toBe(0)
    expect(compacted.stderr).toBe('')
    expect(compacted.stdout).toContain('MOLE OFFICE — after a compaction. Your role:')
    for (const [mode, event] of [['stop', 'Stop'], ['end', 'SessionEnd']] as const) {
      const ran = theHookRun(mode, event)
      expect(ran.status, `${mode}: ${ran.stdout}\n${ran.stderr}`).toBe(0)
      expect(ran.stderr, mode).toBe('')
    }

    const stopped = await theCommand('stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 120_000)

  it("a setting the person made still wins: MOLE_OFFICE_API in the environment, or MOLE_OFFICE_PORT in the data folder's .env", async () => {
    await startTheOffice()
    // ANOTHER OFFICE'S ADDRESS, as a stand-in that keeps every request reaching it. The lock still names the bundle's office.
    const elsewhere = await aStandInForTheShellsOffice()
    const envFile = join(home, '.config', 'mole-office', '.env')
    const before = existsSync(envFile) ? readFileSync(envFile, 'utf8') : null
    try {
      const byTheEnvironment = await theHookStartsAlongside({ ...withNoOfficeSetting(), MOLE_OFFICE_API: elsewhere.address })
      expect(byTheEnvironment.status, `${byTheEnvironment.stdout}\n${byTheEnvironment.stderr}`).toBe(0)
      expect(elsewhere.reached.length, `MOLE_OFFICE_API in the environment did not win\n${byTheEnvironment.stdout}`).toBeGreaterThan(0)

      const reachedBefore = elsewhere.reached.length
      writeFileSync(envFile, `${before === null ? '' : before.replace(/\n?$/, '\n')}MOLE_OFFICE_PORT=${new URL(elsewhere.address).port}\n`)
      const byTheFile = await theHookStartsAlongside(withNoOfficeSetting())
      expect(byTheFile.status, `${byTheFile.stdout}\n${byTheFile.stderr}`).toBe(0)
      expect(elsewhere.reached.length, `MOLE_OFFICE_PORT in the data folder's .env did not win\n${byTheFile.stdout}`).toBeGreaterThan(reachedBefore)
    } finally {
      if (before === null) rmSync(envFile, { force: true })
      else writeFileSync(envFile, before)
      await elsewhere.close()
    }

    const stopped = await theCommand('stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 120_000)

  it("a checkout's hook finds no install's own office, so its address still says on stderr that it took the default", () => {
    forgetTheDefaultApiAddressWarning()
    const said: string[] = []
    const realErr = process.stderr.write
    process.stderr.write = ((chunk: unknown) => {
      said.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    let own: ReturnType<typeof theInstallsOwnOffice> = null
    let address = ''
    try {
      // THE HOOK'S FIRST STEP, with nothing set in the environment or in a .env.
      own = theInstallsOwnOffice({})
      address = own?.address ?? apiAddressFrom({})
    } finally {
      process.stderr.write = realErr
      forgetTheDefaultApiAddressWarning()
    }
    expect(own).toBe(null)
    expect(address).toBe('http://127.0.0.1:8787')
    expect(said.join('')).toContain('Neither MOLE_OFFICE_API nor MOLE_OFFICE_PORT is set')
  })

  it('with nothing set and no lock it can read, its hook asks the declared port, and says one line only when the lock cannot be read', () => {
    const lockPath = join(home, '.config', 'mole-office', 'data', 'mole-office.db.service.json')
    expect(readTheServiceLock(lockPath).state, 'an office of this test is still running').toBe('absent')
    const theHookWithNoPayload = () =>
      spawnSync(process.execPath, [join(bundle, THE_FOR_AGENTS_FOLDER, 'session-hook.mjs'), 'start'], {
        cwd: dir,
        env: withNoOfficeSetting(),
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: 30_000,
      })
    const noLock = theHookWithNoPayload()
    expect(noLock.status, `${noLock.stdout}\n${noLock.stderr}`).toBe(0)
    expect(noLock.stderr).toBe('')

    // A TORN LOCK, which starts with text shaped like its token.
    mkdirSync(dirname(lockPath), { recursive: true })
    writeFileSync(lockPath, 'xx"SECRETabcdef0123456789')
    try {
      const torn = theHookWithNoPayload()
      expect(torn.status, `${torn.stdout}\n${torn.stderr}`).toBe(0)
      const lines = torn.stderr.split('\n').filter((line) => line !== '')
      expect(lines, torn.stderr).toHaveLength(1)
      expect(lines[0]).toContain(lockPath)
      expect(lines[0]).toContain('it is not JSON')
      expect(lines[0]).toContain('http://127.0.0.1:8787')
      expect(lines[0]).not.toContain('SECRET')
    } finally {
      rmSync(lockPath, { force: true })
    }
  })

  it('with nothing set, its other tools ask the office at the port its lock records too', async () => {
    const lockPath = join(home, '.config', 'mole-office', 'data', 'mole-office.db.service.json')
    expect(readTheServiceLock(lockPath).state, 'an office of this test is still running').toBe('absent')
    const theLocksOffice = await aStandInForTheShellsOffice()
    mkdirSync(dirname(lockPath), { recursive: true })
    // A LOCK AS A RUNNING OFFICE WRITES ONE, naming the stand-in's port. Nothing reads it but the tool, for its port.
    writeFileSync(
      lockPath,
      JSON.stringify({ token: 'a lock this test wrote', pid: process.pid, pgid: process.pid, port: Number(new URL(theLocksOffice.address).port), processStartedAt: new Date().toISOString() }),
    )
    try {
      expect(readTheServiceLock(lockPath).state).toBe('read')
      const ran = await runToItsEnd(
        process.execPath,
        [join(bundle, THE_FOR_AGENTS_FOLDER, 'register-myself.mjs'), '--handle', 'a-tool-that-asks', '--name', 'A tool that asks', '--dir', dir, '--key-file', join(dir, 'a-key-never-written')],
        { cwd: dir, env: withNoOfficeSetting(), timeoutMs: 30_000 },
      )
      expect(theLocksOffice.reached, `${ran.stdout}\n${ran.stderr}`).toContain('POST /api/agents/register-myself')
      expect(ran.stderr).not.toContain('Neither MOLE_OFFICE_API nor MOLE_OFFICE_PORT is set')
    } finally {
      rmSync(lockPath, { force: true })
      await theLocksOffice.close()
    }
  }, 60_000)

  it("in an AppImage, its start writes its hook launcher, and the hook line its press writes files the session through it", async () => {
    // AS AN APPIMAGE STARTS IT: APPIMAGE set, and APPDIR at the folder that holds the office, which is readable by all
    // and writable by its user alone, as the AppImage's own folder is. Its Node is the program the office runs on.
    const node = process.execPath
    chmodSync(bundle, 0o755)
    const inAnAppImage: NodeJS.ProcessEnv = { ...env, APPIMAGE: join(dir, 'Mole-Office.AppImage'), APPDIR: bundle }
    try {
      const started = await theCommand('start', inAnAppImage)
      const named = /in process group (\d+)/.exec(started.out)?.[1]
      if (named !== undefined) groups.add(Number(named))
      expect(started.code, started.out).toBe(0)
      const launcher = join(home, '.config', 'mole-office', 'session-hook', 'run')
      expect(existsSync(launcher), `the start wrote no launcher at ${launcher}`).toBe(true)
      expect(readFileSync(launcher, 'utf8')).toContain(`hook='${join(bundle, THE_FOR_AGENTS_FOLDER, 'session-hook.mjs')}'`)
      expect(readFileSync(launcher, 'utf8')).toContain(`node='${node}'`)
      expect(readFileSync(launcher, 'utf8'), 'the launcher does not tell the program it names to run as Node').toContain("export ELECTRON_RUN_AS_NODE='1'")

      // THE PERSON'S PRESS, as the Settings page sends it: no body, and the person's key.
      const keys = JSON.parse(readFileSync(join(home, '.config', 'mole-office', 'data', 'keys.json'), 'utf8')) as { person: string }
      const pressed = await fetch(`${api}/api/office/install-the-entry`, { method: 'POST', headers: { [KEY_HEADER]: keys.person } })
      const answer = (await pressed.json()) as { ok?: boolean; says?: string }
      expect(pressed.status, JSON.stringify(answer)).toBe(200)
      expect(answer.says).toContain(`Wrote the hook launcher at ${launcher}`)
      const settings = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')) as { hooks: Record<string, { hooks: { command: string }[] }[]> }
      const theLineAt = (event: string): string => String(settings.hooks[event]?.at(-1)?.hooks[0]?.command)
      expect(theLineAt('SessionStart')).toBe(`"/bin/sh" "${launcher}" start`)

      // EACH LINE RUN AS CLAUDE CODE RUNS IT: through sh as it is written, with no node on PATH and nothing set.
      const conversation = randomUUID()
      const theLineRun = (event: string) =>
        spawnSync('/bin/sh', ['-c', theLineAt(event)], {
          cwd: dir,
          env: withNoOfficeSetting(),
          input: JSON.stringify({ session_id: conversation, cwd: dir, hook_event_name: event }),
          encoding: 'utf8',
          timeout: 30_000,
        })
      const start = theLineRun('SessionStart')
      expect(start.status, `${start.stdout}\n${start.stderr}`).toBe(0)
      expect(start.stderr).toBe('')
      expect(start.stdout).toContain('MOLE OFFICE —')
      expect(start.stdout).not.toContain('is not on the record')
      expect(await theConversationFiled(conversation)).toBe(conversation)
      for (const event of ['Stop', 'SessionEnd']) {
        const ran = theLineRun(event)
        expect(ran.status, `${event}: ${ran.stdout}\n${ran.stderr}`).toBe(0)
        expect(ran.stderr, event).toBe('')
      }
    } finally {
      const stopped = await theCommand('stop', inAnAppImage)
      expect(stopped.code, stopped.out).toBe(0)
    }
  }, 120_000)
})
