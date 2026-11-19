// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SANDBOXED AGENT ASKS THE OFFICE FOR A REGISTERED HOST TOOL BY NAME, AND THE OFFICE RUNS ONLY WHAT IS REGISTERED.
 *
 * The door is POST /api/host-jobs (src/server/lib/host-jobs.ts). A running run asks with its own run key for a tool
 * named in the office's host-tools.json, with arguments of the shape the tool declares. The office files a host_job
 * record about the run. The runner on the host (tools/run-the-host-jobs.mjs), holding the office's own key, takes the
 * job, runs the declared program and answers into the same record, and the office tells the asking agent once.
 *
 * The tools here are stand-ins: small shell scripts in a scratch folder, registered only in this file, through the
 * secretary's door, on a decision the person made in this test office. Nothing here is a real tool or a real lab.
 *
 * The sentences the cases look for are read from where the code makes them (WHY_A_PROGRAM_ON_DISK_IS_REFUSED,
 * WHY_IT_IS_NEVER_THE_PROGRAM, WHY_ANOTHER_MAY_BE_IN_THE_GROUP, THE_RUNNERS_WORDS and NO_RUNNER_HOLDS_IT), so a sentence
 * reworded there changes no case. Every sentence of the runner's that a case reads is one of THE_RUNNERS_WORDS. The
 * office's own refusals are still read as they are written in src/server/lib/host-jobs.ts.
 *
 * systemd-run and systemctl are stand-ins too (SYSTEMD below), since a scope needs a systemd user session that a test
 * machine may not have. Every case before 13 runs where systemd-run is not there, so it holds its job by its group.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A registered stand-in runs on an agent's request. Its result is filed in a record about the asking run, with
 *      its arguments as whole argv elements that no shell reads, in its own folder and an environment built from
 *      nothing.
 *   2. The asker reads the result through the office tool, as the run, and the one message about its end too.
 *   3. An unregistered name gets words naming the registered tools, and arguments outside the shape get words naming
 *      the shape wanted. Nothing is written.
 *   4. A tool past its time limit is ended with its whole process group, and the record says so. A tool that ignores
 *      TERM is sent KILL after the grace.
 *   5. An agent the tool does not name is told which agents may ask it. A tool that names sandboxes is asked only
 *      from a run in one of them that the office vouches for, and only by an agent it names: both, never either.
 *   6. Only a running run's own key asks: an agent's lasting key, another run's session header, or no key is
 *      refused. Nobody writes a host job through the records door, or changes a record's kind into or out of one.
 *      Only the office key takes or answers a job. A run moved to another project carries its host job with it,
 *      and the job says what it said.
 *   7. At most three jobs of one tool, and one of one run, are asked or running at once.
 *   8. Outputs are read without following a link; a folder, a missing file and a file too large are each said, and
 *      files nobody declared are counted, not read.
 *   9. What the tool prints is masked before it is filed: a home on a /home-like mount, a .ts.net host and the login
 *      of `ssh -l`. The record says where.
 *  10. A file of tools others may read is refused whole.
 *  11. Only a secretary registers a tool, on a decision the owner made, and the declaration is checked on disk: no
 *      interpreter, even behind a link, and the sha256 given. Every folder above the program's folder, up to /, is
 *      this user's or root's, and nobody else may write it unless it is sticky, as /tmp is; a job whose program came
 *      under such a folder after it was asked does not start. The program, its own folder and every folder above may
 *      be written by the office user's own group when nobody else is in it, as a umask of 0002 makes them.
 *  12. The runner gives an answer it could not give before, answers lost for a job it held when it stopped, and
 *      does not start a job whose tool was taken off or whose program changed. Its command refuses to run without
 *      --once. It sends the office key only to a loopback address and follows no redirect, runs one at a time, and
 *      starts the program and its folder by the real paths it checked. Its lock names its pid and when its process
 *      began, and a lock is held only by a runner that still runs, read by its pid, that start time and its command
 *      line. A pid given out again to another program, or to a process that began at another time, holds nothing,
 *      and a holder whose start time cannot be read keeps the lock. A runner that cannot read when its own process
 *      began does not start. The runner the office starts reads the office's process the same way, by its pid, when
 *      it began and its command line: a pid given out again ends the runner, a start that cannot be read later is
 *      said once and ends nothing, and one that cannot be read at the start is refused. An office already gone at
 *      the start is refused before the lock, and no job is taken. Of two runners taking over one lock left by a runner
 *      that stopped, one takes it and the other refuses; a runner taking a lock over is named, and the run refuses. A
 *      file of taking over left by a runner that stopped is gone past to a file of the runner's own, read again once
 *      that is made, and removed, and the runner says so; one made anew meanwhile is another runner's, and the run
 *      refuses. A job a runner took and never wrote down is answered lost by the office when the
 *      next runner says it holds nothing. A job lost while its tool ran has its process group ended by the next
 *      runner when the tool's own process still runs and began when the runner wrote down; otherwise the group is
 *      left, and the answer says why.
 *  13. Where `systemd-run --user` starts a scope, each job runs in a scope of its own, named for the job, and the tool
 *      sees no address of the user's systemd. The runner stops that scope at the time limit, when it is asked to stop,
 *      and after the tool ends, and the next runner stops the scope of a job lost while its tool ran. Where no scope
 *      can be started, or the program's path holds "=", the job is held by its process group only, and the answer
 *      says so: a process that left the group is not ended. A scope that cannot be stopped, or that systemd does not
 *      know while the tool runs, is said, and its group is ended instead. Every answer names the way that held the job, and the office takes no other. A runner given no
 *      XDG_RUNTIME_DIR finds the user's runtime folder itself, and takes only a folder of the user's, mode 700, that
 *      holds the bus; otherwise the job is held by its group, and the answer says why.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the hand-back of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the runner spawns with shell: true: case 1 goes red (a value's $(...) is run);
 *   - the runner's environment takes process.env as well: case 1 goes red;
 *   - the link `about` the run left off the filed job: case 1 goes red;
 *   - the message to the asker left out of endAHostJob: case 2 goes red;
 *   - the registered tools left out of the unknown-tool refusal: case 3 goes red;
 *   - TERM and KILL sent to the program's pid and not to its group: case 4 goes red;
 *   - the mayAsk.agents check skipped when the tool names sandboxes: case 5 goes red;
 *   - the run read from the session header instead of the run the key proves: case 6 goes red;
 *   - `verb !== 'move'` taken out of the host job's guard in records.ts: case 6c goes red (403);
 *   - the tool cap taken out: case 7 goes red;
 *   - outputs read with stat and without O_NOFOLLOW: case 8 goes red;
 *   - the office files the runner's text unmasked: case 9 goes red;
 *   - the decided_by check taken out of the registration: case 11 goes red;
 *   - the program check taken out of the runner's whatItStarts: case 12 goes red;
 *   - the loopback check taken out of runOnce: case 12f goes red;
 *   - `redirect: 'error'` taken out of callTheOffice: case 12f goes red;
 *   - the lock not taken in runOnce: case 12g goes red;
 *   - a lock whose pid is gone refused and not taken over: case 12g goes red;
 *   - the program started by its declared path and not the real one: case 12h goes red;
 *   - the holder counted as a runner by its pid and start time, its command line not read: case 12i goes red
 *     (another program with the pid and the start the lock names keeps the lock);
 *   - the start time in the lock not compared with the holder's: case 12i goes red (a runner that began an hour
 *     after the lock says keeps it);
 *   - the lock written with the pid alone: case 12i goes red (the lock taken over holds no start time);
 *   - a holder whose start time cannot be read counted as gone: case 12i goes red (its lock is taken over);
 *   - the refusal of a runner that cannot read its own start taken out of theLock: case 12j goes red (it starts);
 *   - the office's process watched by its pid alone, as before wave 13q round 62: case 12k goes red (a pid that
 *     began an hour later keeps the runner going);
 *   - the office's start time not compared: case 12k goes red (the same);
 *   - the office's command line not compared: case 12k goes red (a pid that runs another command keeps it going);
 *   - the folders above the program's folder not read: case 11b goes red (it is registered under a folder of mode 777);
 *   - the sticky bit not excepted: case 11b goes red (a folder of mode 1777 above refuses it);
 *   - a folder above owned by another user not refused: case 11b goes red (by a stand-in reading);
 *   - root not excepted as the owner of a folder above: case 11b goes red;
 *   - a folder above that only the office user's own group may write refused: case 11b goes red (by stand-in files);
 *   - the group of a folder above not compared with the office user's own: case 11b goes red;
 *   - another member of that group in /etc/group not read: case 11b goes red;
 *   - another user given that group in /etc/passwd not read: case 11b goes red;
 *   - an /etc/group that cannot be read taken as naming nobody else: case 11b goes red;
 *   - the program's own file refused when only the office user's own group may write it, as before wave 13q round 64:
 *     case 11c goes red;
 *   - the program's own folder refused so: case 11c goes red;
 *   - the program's file or folder let any group write it, its group not compared: case 11c goes red;
 *   - the program's file or folder let others write it: case 11c goes red;
 *   - a runner whose office has gone let take the lock, as before wave 13q round 63: case 12l goes red;
 *   - an office with no command line taken as there: case 12l goes red (its job is taken);
 *   - the lock not read again before it is taken over: case 12m goes red (both runners ask the office for a job);
 *   - the lock taken over without the file that says a runner is taking it over: case 12m goes red;
 *   - a file of taking over left by a runner that stopped refused, as before wave 13q round 64: case 12m goes red;
 *   - such a file removed and made again as the runner's own, not gone past: case 12m goes red (the file made anew
 *     meanwhile is removed, and the lock taken over);
 *   - the files gone past not read again once the runner's own is made: case 12m goes red (the same);
 *   - the files gone past removed when one has changed: case 12m goes red;
 *   - the files gone past not removed, or their removal not said: case 12m goes red;
 *   - the runner's take not saying it holds nothing: case 12n goes red (the job it never wrote down stays running);
 *   - the office not answering lost what no runner holds: case 12n goes red;
 *   - the tool's own start not written down beside its group: case 12o goes red (the next runner leaves the group);
 *   - the lost group ended without its start compared: case 12o goes red (another program's group is ended);
 *   - a start that cannot be read taken as the tool's: case 12o goes red;
 *   - a group whose own process has ended taken as the tool's: case 12o goes red;
 *   - the scope's unit named without the job's id: case 13a goes red;
 *   - the tool started without `env -u` taking the session's address away: case 13a goes red (the tool sees it);
 *   - the scope not stopped after the tool ends: case 13a goes red;
 *   - the office taking any words as the way that held a job: case 13a goes red;
 *   - the tool's group sent TERM at the time limit, and the scope not stopped: case 13b goes red (the scope is stopped
 *     only after the tool has ended);
 *   - the same when the runner is asked to stop: case 13c goes red;
 *   - the probe left out, every job started in a scope: case 13d goes red;
 *   - a program whose path holds "=" started in a scope: case 13d goes red;
 *   - a scope that could not be stopped still answered as the way that held the job: case 13e goes red;
 *   - its group not ended when the scope could not be stopped: case 13e goes red;
 *   - the scope of a job lost while its tool ran left by the next runner: case 13f goes red;
 *   - systemctl's 5, a unit not loaded, taken as a stop that failed: case 13f goes red;
 *   - whether the tool has ended read when the scope's stop is asked, and not when systemctl answers: case 13i goes red
 *     (a tool that ends while the stop is on its way is said to be held by its group only).
 */

import type { AddressInfo } from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import type { Stats } from 'node:fs'
import { createServer } from 'node:http'
import { userInfo } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  maskedForAHostJob,
  theProgramOnDisk,
  theSha256Of,
  WHY_A_PROGRAM_ON_DISK_IS_REFUSED,
  WHY_ANOTHER_MAY_BE_IN_THE_GROUP,
  WHY_IT_IS_NEVER_THE_PROGRAM,
} from '../src/config/host-tools.mjs'
import { theProcessReader } from '../src/config/process-reader.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import { HOST_JOB_HOLDINGS } from '../src/shared/host-jobs.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { askTheOffice } from '../tools/office-request.mjs'
import { runOnce, runWithTheOffice, THE_RUNNERS_WORDS } from '../tools/run-the-host-jobs.mjs'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/**
 * A STAND-IN FOR systemd-run AND systemctl, the two commands the runner holds a job in a scope with. The runner starts
 * both through node:child_process, so that module is replaced here; every other command goes to the real one. `way` is
 * what systemd-run does: 'missing' (it is not on this machine), 'refused' (it cannot reach a user session) or 'scope'.
 * In 'scope' a call given neither XDG_RUNTIME_DIR nor DBUS_SESSION_BUS_ADDRESS is refused as in 'refused', since
 * systemd finds the user's session by them.
 * In 'scope' the job is the real command after `--`, and `systemctl --user stop <unit>` ends that command's process
 * group: TERM, and KILL after the TimeoutStopSec the scope was started with. It answers 5, as systemctl does for a
 * unit that is not loaded, when that group has ended or the scope was never made (`makesTheScope` false), and 1 when
 * `stop` is 'fails'. When `stop` is 'ends first' it ends the group with TERM, waits until the group has gone, and
 * answers 5: the tool ended while the stop was on its way, and systemd unloaded its empty scope. Each call is kept
 * with its environment, and a stop with whether the scope's group still ran when it was asked (false for a scope it
 * does not know). A real scope also holds a process that left the group; that needs a systemd user session, and is not
 * proved here.
 */
const SYSTEMD = vi.hoisted(() => ({
  way: 'missing' as 'missing' | 'refused' | 'scope',
  stop: 'stops' as 'stops' | 'fails' | 'ends first',
  makesTheScope: true,
  calls: [] as { command: string; args: string[]; env: Record<string, string | undefined>; whileItRan?: boolean }[],
  scopes: new Map<string, { groupId: number; graceMs: number }>(),
}))
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const aNodeThat = (script: string, args: string[], options: Record<string, unknown>) =>
    actual.spawn(process.execPath, ['-e', script, ...args], { ...options, env: { PATH: '/usr/bin:/bin' } })
  const STOPS =
    'const [unit, group, graceMs] = process.argv.slice(1);' +
    'const to = (signal) => { try { process.kill(-Number(group), signal); return true } catch { return false } };' +
    "if (!to('SIGTERM')) { process.stderr.write(`Failed to stop ${unit}: Unit ${unit} not loaded.\\n`); process.exit(5) }" +
    'const until = Date.now() + Number(graceMs);' +
    "const wait = () => { if (to(0) && Date.now() < until) setTimeout(wait, 20); else { to('SIGKILL'); process.exit(0) } };" +
    'wait()'
  const ENDS_FIRST =
    'const [unit, group] = process.argv.slice(1);' +
    'const to = (signal) => { try { process.kill(-Number(group), signal); return true } catch { return false } };' +
    "to('SIGTERM');" +
    "const wait = () => { if (to(0)) setTimeout(wait, 20); else { process.stderr.write(`Failed to stop ${unit}: Unit ${unit} not loaded.\\n`); process.exit(5) } };" +
    'wait()'
  const spawn = ((command: string, args?: unknown, options?: unknown) => {
    if ((command !== 'systemd-run' && command !== 'systemctl') || !Array.isArray(args)) {
      return (actual.spawn as (...all: unknown[]) => unknown)(command, args, options)
    }
    const given = args.map(String)
    const how = (options ?? {}) as Record<string, unknown>
    const call: (typeof SYSTEMD.calls)[number] = { command, args: given, env: { ...((how['env'] ?? {}) as Record<string, string | undefined>) } }
    SYSTEMD.calls.push(call)
    if (SYSTEMD.way === 'missing') return actual.spawn(`/a-${command}-that-is-not-there`, given, how)
    const noSession = call.env['XDG_RUNTIME_DIR'] === undefined && call.env['DBUS_SESSION_BUS_ADDRESS'] === undefined
    if (SYSTEMD.way === 'refused' || noSession) return aNodeThat("process.stderr.write('Failed to connect to bus: No medium found\\n'); process.exit(1)", [], how)
    if (command === 'systemd-run') {
      const after = given.indexOf('--')
      const child = actual.spawn(given[after + 1] as string, given.slice(after + 2), how)
      const unit = given.find((one) => one.startsWith('--unit='))?.slice('--unit='.length)
      const graceMs = Number(/TimeoutStopSec=(\d+)ms$/.exec(given.find((one) => one.includes('TimeoutStopSec=')) ?? '')?.[1] ?? 0)
      if (unit !== undefined && child.pid !== undefined && SYSTEMD.makesTheScope) SYSTEMD.scopes.set(unit, { groupId: child.pid, graceMs })
      return child
    }
    const unit = given[given.length - 1] as string
    const scope = SYSTEMD.scopes.get(unit)
    call.whileItRan = false
    if (scope !== undefined) {
      try {
        process.kill(-scope.groupId, 0)
        call.whileItRan = true
      } catch {
        // The scope's group has ended.
      }
    }
    if (SYSTEMD.stop === 'fails') return aNodeThat('process.stderr.write(`Failed to stop ${process.argv[1]}: Access denied\\n`); process.exit(1)', [unit], how)
    // NO GROUP 0 IS EVER SIGNALLED: that is the stand-in's own group, and so this test's.
    if (scope === undefined) return aNodeThat("process.stderr.write(`Failed to stop ${process.argv[1]}: Unit ${process.argv[1]} not loaded.\\n`); process.exit(5)", [unit], how)
    if (SYSTEMD.stop === 'ends first') return aNodeThat(ENDS_FIRST, [unit, String(scope.groupId)], how)
    return aNodeThat(STOPS, [unit, String(scope.groupId), String(scope.graceMs)], how)
  }) as typeof actual.spawn
  return { ...actual, default: { ...actual, spawn }, spawn }
})

/** Made-up keys, written before the server is built. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

const ASKER = 'a-lab-worker'
const ANOTHER = 'a-worker-no-tool-names'

let t: TestDb
let app: FastifyInstance
let api = ''
let scratch = ''
let work = ''
let toolsFile = ''
let runnerFolder = ''
let theDecision = ''
const idOf: Record<string, string> = {}
const keyOf: Record<string, string> = {}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_PROVED_PERSON = { ...AS_THE_PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}
const THE_OFFICE_KEY_ALONE = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': A_MADE_UP_OFFICE_KEY }

/** An agent, proved by its own lasting key. */
function asAgent(handle: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-key': keyOf[handle] ?? '',
  }
}

interface ARun {
  id: string
  key: string
  handle: string
}

/** As a run asks: its agent, the run as its session, and the run's own key. */
function asTheRun(run: ARun): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': run.handle,
    'x-mole-office-session': run.id,
    'x-mole-office-key': run.key,
  }
}

async function send(method: 'GET' | 'POST' | 'PATCH', path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: any; text: string }> {
  const reply = await app.inject({ method, url: path, headers, ...(body === undefined ? {} : { payload: body as Record<string, unknown> }) })
  let parsed: any = null
  try {
    parsed = reply.json()
  } catch {
    parsed = null
  }
  return { status: reply.statusCode, body: parsed, text: reply.body }
}

async function register(handle: string, role: string): Promise<void> {
  const reply = await send('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role, runtime: 'claude-code' })
  expect(reply.status, `registering ${handle}: ${reply.text.slice(0, 300)}`).toBe(201)
  idOf[handle] = reply.body.agent.id
  keyOf[handle] = String(reply.body.whatToGiveIt?.key ?? '')
  expect(keyOf[handle], `${handle} was given a key`).toMatch(/^[0-9a-f]{64}$/)
}

/** A container row of the ledger naming a made-up sandbox folder, as `sandbox.mjs up` writes one. */
function aVouchedSandbox(name: string): { folder: string; container: string; template: string } {
  const folder = join(scratch, 'sandboxes', name)
  mkdirSync(folder, { recursive: true })
  const container = `container-of-${name}`
  t.client.sqlite
    .prepare(
      "INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-11-07 09:00:00', 'agent:fixture')",
    )
    .run(container, `mole-office-sandbox-${name}`, `Sandbox ${name}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
  return { folder, container, template: 'mole-office-dev' }
}

/** A running run of `handle`, filed by the office's own worker, with the key the office mints it. */
async function aRunOf(handle: string, sandbox?: { folder: string; container: string; template: string }): Promise<ARun> {
  const title = `A run of ${handle}`
  const filed = await send('POST', '/api/records', AS_THE_OFFICE_WORKER, {
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: idOf[handle], doing: title, ...(sandbox === undefined ? {} : { sandbox }) },
  })
  expect(filed.status, filed.text.slice(0, 400)).toBe(201)
  const key = String(filed.body.runKey?.key)
  expect(key, 'the office minted the run no key').toMatch(/^[0-9a-f]{64}$/)
  return { id: filed.body.record.id, key, handle }
}

/** A stand-in program: a shell script in the scratch folder, run through its own first line. */
function aStandIn(name: string, body: string): { path: string; sha256: string } {
  const path = join(scratch, 'bin', name)
  writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  chmodSync(path, 0o755)
  return { path, sha256: theSha256Of(path) }
}

function aDeclaration(name: string, program: { path: string; sha256: string }, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name,
    what: `a stand-in for this test only (${name})`,
    program,
    argv: [],
    arguments: {},
    folder: work,
    timeLimitSeconds: 20,
    outputs: [],
    logLines: 20,
    mayAsk: { agents: [idOf[ASKER]] },
    ...over,
  }
}

async function registerATool(declaration: Record<string, unknown>): Promise<void> {
  const done = await send('POST', '/api/host-tools', asAgent(THE_TEST_OFFICES_SECRETARY.handle), { declaration, decision: theDecision })
  expect(done.status, done.text.slice(0, 500)).toBe(201)
}

/** Why a program on disk is refused, and why another may be in the office user's group, in the code's own words. */
const REFUSED = WHY_A_PROGRAM_ON_DISK_IS_REFUSED
const NOT_ALONE = WHY_ANOTHER_MAY_BE_IN_THE_GROUP

/**
 * SEVEN STAND-IN READINGS OF WHOSE GROUP `gid` IS, from /etc/passwd and /etc/group as stand-in files, since the files of
 * a test machine say only what that machine is. Each comes with why a thing of `mode` that the group may write is
 * refused, in the code's words, or null when the group is the office user's own and nobody else is in it.
 */
function theGroupsReadings(gid: number, mode: string): [(at: string) => string, string | null, string][] {
  const uid = process.getuid?.() ?? 0
  const users = (mine: number, more = ''): string => `root:x:0:0:root:/root:/bin/sh\nme:x:${String(uid)}:${String(mine)}:me:/srv/me:/bin/sh\n${more}`
  const filesSaying = (passwd: string, group: string | null) => (at: string): string => {
    if (at === '/etc/passwd') return passwd
    if (at === '/etc/group' && group !== null) return group
    throw Object.assign(new Error(`a stand-in without ${at}`), { code: 'ENOENT' })
  }
  return [
    [filesSaying(users(gid), `root:x:0:\nme:x:${String(gid)}:\n`), null, 'the group names no member'],
    [filesSaying(users(gid), `me:x:${String(gid)}:me\n`), null, 'the group names only the office user'],
    [filesSaying(users(gid), `me:x:${String(gid)}:me,alice\n`), REFUSED.ownGroupNotAlone(mode, NOT_ALONE.aMember('alice')), 'another member'],
    [
      filesSaying(users(gid, `alice:x:4243:${String(gid)}:alice:/srv/alice:/bin/sh\n`), `me:x:${String(gid)}:\n`),
      REFUSED.ownGroupNotAlone(mode, NOT_ALONE.theirsToo('alice')),
      'another user with that primary group',
    ],
    [filesSaying(users(gid + 1), `me:x:${String(gid + 1)}:\n`), REFUSED.anotherGroup(gid, mode), 'another group'],
    [filesSaying(users(gid), null), REFUSED.ownGroupNotAlone(mode, NOT_ALONE.unreadable('/etc/group', 'ENOENT')), 'no /etc/group'],
    [filesSaying('root:x:0:0:root:/root:/bin/sh\n', ''), REFUSED.ownGroupNotKnown(mode, NOT_ALONE.notInPasswd(uid)), 'the office user not in /etc/passwd'],
  ]
}

function theJobsCount(): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'host_job'").get() as { n: number }).n
}

function theJobData(id: string): Record<string, any> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, any>
}

/** A process that is there and not a zombie waiting for its parent. */
function stillThere(pid: number): boolean {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  try {
    return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, 'utf8'))
  } catch {
    return false
  }
}

/** When a process began, as the office's process reader reads it. */
function theStartOf(pid: number): string {
  const now = theProcessAt(pid)
  expect(now.here && now.startedAt, `when process ${String(pid)} began could not be read`).toMatch(/^\d{4}-\d\d-\d\dT/)
  return (now as { startedAt: string }).startedAt
}

/** A stand-in for a runner that still runs: a script with the runner's file name that only waits. */
function aRunnerThatWaits(): ReturnType<typeof spawn> {
  const script = join(scratch, 'a-runner-that-waits', 'run-the-host-jobs.mjs')
  mkdirSync(dirname(script), { recursive: true })
  writeFileSync(script, 'setTimeout(() => {}, 30_000)\n')
  return spawn(process.execPath, [script], { stdio: 'ignore' })
}

/** The runner's grace between TERM and KILL in this file, and the pause of the runner the office starts, short so a case does not wait. */
const A_SHORT_GRACE_MS = 300
const A_SHORT_PAUSE_MS = 200

function theRunner(over: { api?: string; reads?: ReturnType<typeof theProcessReader>; runtimeFolders?: string } = {}): Promise<number> {
  return runOnce({
    api: over.api ?? api,
    key: A_MADE_UP_OFFICE_KEY,
    folder: runnerFolder,
    toolsFile,
    graceMs: A_SHORT_GRACE_MS,
    ...(over.reads === undefined ? {} : { reads: over.reads }),
    ...(over.runtimeFolders === undefined ? {} : { runtimeFolders: over.runtimeFolders }),
  })
}

/** Asks as the run, through the office tool, with the run's identity in the environment as a sandbox gives it. */
async function askAsTheRun(run: ARun, path: string, fields: string[]): Promise<{ status: number | null; body: string }> {
  const keyBefore = process.env['MOLE_AGENT_KEY']
  process.env['MOLE_AGENT_KEY'] = run.key
  try {
    const env = { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_AGENT: run.handle, MOLE_OFFICE_SESSION: run.id, MOLE_OFFICE_WORKSPACE: 'default' }
    const answer = (await askTheOffice({ method: 'GET', path, fields }, { env })) as { status: number | null; body: string }
    return { status: answer.status, body: String(answer.body) }
  } finally {
    if (keyBefore === undefined) delete process.env['MOLE_AGENT_KEY']
    else process.env['MOLE_AGENT_KEY'] = keyBefore
  }
}

const STAND_IN_ARGUMENTS = { label: { text: { pattern: '^[a-z0-9 ;$()]+$', maxLength: 60 } }, count: { wholeNumber: { min: 0, max: 9 } } }

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  toolsFile = join(dirname(t.file), 'host-tools.json')
  runnerFolder = join(dirname(t.file), 'host-jobs')
  mkdirSync(runnerFolder, { mode: 0o700 })
  scratch = aTestDatabaseFolder('host-tools')
  work = join(scratch, 'work')
  mkdirSync(join(scratch, 'bin'), { recursive: true })
  // MODE 755 WHATEVER THE UMASK, since a program in a folder others may write is refused.
  chmodSync(join(scratch, 'bin'), 0o755)
  mkdirSync(work)
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  await register(ASKER, 'worker')
  await register(ANOTHER, 'worker')
  await register(THE_TEST_OFFICES_SECRETARY.handle, 'secretary')

  const words = await send('POST', '/api/records', AS_THE_PERSON, { kind: 'note', title: 'What the person said about host tools', data: { body: 'the office runs the registered stand-ins' } })
  expect(words.status, words.text.slice(0, 300)).toBe(201)
  const decided = await send('POST', '/api/records', AS_THE_PERSON, {
    kind: 'decision',
    title: 'The office runs registered stand-in host tools',
    data: { replaces: [], option_taken: 'register the stand-ins', because: 'this test office needs them', decided_by: THE_OWNER, authority: 'the owner said so', authority_reference: words.body.record.id },
  })
  expect(decided.status, decided.text.slice(0, 300)).toBe(201)
  theDecision = decided.body.record.id

  writeFileSync(join(work, 'outside.txt'), 'outside the output folder\n')
  await registerATool(aDeclaration('stand-in', aStandIn('stand-in', [
    'printf "label=%s count=%s\\n" "$1" "$2"',
    'printf \'{"label":"%s","count":%s}\\n\' "$1" "$2" > "$HOST_JOB_OUTPUT/RESULT.json"',
    '{ pwd; env | cut -d= -f1 | sort; } > "$HOST_JOB_OUTPUT/ENV"',
  ].join('\n')), {
    argv: ['{label}', '{count}'],
    arguments: STAND_IN_ARGUMENTS,
    outputs: [{ name: 'RESULT.json', maxBytes: 1000 }, { name: 'ENV', maxBytes: 4000 }],
  }))
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  // EVERY CASE STARTS WHERE systemd-run IS NOT THERE, with no call and no scope kept.
  SYSTEMD.way = 'missing'
  SYSTEMD.stop = 'stops'
  SYSTEMD.makesTheScope = true
  SYSTEMD.calls.length = 0
  SYSTEMD.scopes.clear()
  // EVERY CASE STARTS WITH NO JOB WAITING, so one case's jobs neither hold a cap nor get taken in another's.
  t.client.sqlite
    .prepare("UPDATE records SET data = json_set(data, '$.state', 'lost', '$.endedAt', '2026-11-07 09:00:00') WHERE kind = 'host_job' AND json_extract(data, '$.state') IN ('asked', 'running')")
    .run()
  rmSync(join(runnerFolder, 'taken.json'), { force: true })
  rmSync(join(runnerFolder, 'runner.lock'), { force: true })
  for (const level of ['', '.2', '.3']) rmSync(join(runnerFolder, `runner.lock.taking-over${level}`), { force: true })
})

describe('a registered tool, asked for by a running run', () => {
  it('1: runs on the ask, with whole arguments, in its own folder and an environment from nothing, and its result is filed about the run', async () => {
    const run = await aRunOf(ASKER)
    const label = 'two words; $(touch made) here'
    const asked = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'stand-in', arguments: { label, count: 4 } })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const job = asked.body.job as { id: string; data: Record<string, any> }
    expect(job.data['state']).toBe('asked')
    expect(job.data['askedBy']).toEqual({ run: run.id, agent: idOf[ASKER] })
    const about = t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM links WHERE from_id = ? AND to_id = ? AND type = 'about'").get(job.id, run.id) as { n: number }
    expect(about.n, 'the job is filed about the asking run').toBe(1)

    process.env['A_VALUE_ONLY_THE_TEST_PROCESS_HOLDS'] = 'held'
    try {
      expect(await theRunner()).toBe(0)
    } finally {
      delete process.env['A_VALUE_ONLY_THE_TEST_PROCESS_HOLDS']
    }
    const data = theJobData(job.id)
    expect(data['state'], JSON.stringify(data).slice(0, 600)).toBe('finished')
    expect(data['exitCode']).toBe(0)
    const result = (data['outputs'] as { name: string; state: string; text?: string }[]).find((one) => one.name === 'RESULT.json')
    expect(result?.state).toBe('returned')
    expect(JSON.parse(String(result?.text)), 'the label reached the program as one whole argument').toEqual({ label, count: 4 })
    expect(existsSync(join(work, 'made')), 'no shell read the value, so its $(...) was never run').toBe(false)
    const env = String((data['outputs'] as { name: string; text?: string }[]).find((one) => one.name === 'ENV')?.text).split('\n')
    expect(env[0], 'the program ran in its declared folder').toBe(realpathSync(work))
    expect(env, 'the environment was built from nothing').not.toContain('A_VALUE_ONLY_THE_TEST_PROCESS_HOLDS')
    expect(env).not.toContain('MOLE_OFFICE_DB')
    expect(env).toEqual(expect.arrayContaining(['HOST_JOB_ID', 'HOST_JOB_OUTPUT', 'PATH', 'HOME']))
    expect(data['logTail']).toContain(`label=${label} count=4`)
  })

  it('2: the asker reads the result through the office tool, as the run, and is told once that it ended', async () => {
    const run = await aRunOf(ASKER)
    const asked = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'stand-in', arguments: { label: 'read back', count: 1 } })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const id = asked.body.job.id as string
    expect(await theRunner()).toBe(0)

    const read = await askAsTheRun(run, `/api/host-jobs/${id}`, ['job.id', 'job.data.state', 'job.data.outputs'])
    expect(read.status, read.body.slice(0, 500)).toBe(200)
    expect(read.body).toContain('"state":"finished"')
    expect(read.body).toContain('read back')

    const told = await askAsTheRun(run, '/api/messages?only=waiting-for-me&full=1', ['messages.body'])
    expect(told.status, told.body.slice(0, 500)).toBe(200)
    const lines = told.body.split(`The host job ${id} (stand-in) ended: finished`).length - 1
    expect(lines, told.body.slice(0, 800)).toBe(1)
  })

  it('3: an unregistered name is told the registered tools, arguments outside the shape are told the shape, and nothing is written', async () => {
    const run = await aRunOf(ASKER)
    const before = theJobsCount()
    const unknown = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'a-tool-nobody-registered', arguments: {} })
    expect(unknown.status).toBe(400)
    expect(unknown.body.error).toContain('"a-tool-nobody-registered" is not a registered host tool.')
    expect(unknown.body.error).toContain('The registered host tools are stand-in (a stand-in for this test only (stand-in))')

    const shape = 'The tool stand-in takes exactly {label: text matching ^[a-z0-9 ;$()]+$, at most 60 characters; count: a whole number from 0 to 9}.'
    const refusals: [unknown, string][] = [
      [{ label: '../../.ssh', count: 1 }, '"label" is refused because it holds a "/", and no argument is a path'],
      [{ label: 'ok', count: 1, also: 'x' }, 'it takes no argument named "also"'],
      [{ label: 'ok' }, '"count" is missing'],
      [{ label: 'ok', count: 12 }, '"count" must be a whole number from 0 to 9'],
      [{ label: 'OK', count: 1 }, '"label" does not match ^[a-z0-9 ;$()]+$'],
      ['label=ok', '"arguments" must be an object of named values'],
    ]
    for (const [given, why] of refusals) {
      const refused = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'stand-in', arguments: given })
      expect(refused.status, JSON.stringify(given)).toBe(400)
      expect(refused.body.error, JSON.stringify(given)).toContain(`The arguments for stand-in are refused: ${why}.`)
      expect(refused.body.error).toContain(shape)
      expect(refused.body.error).toContain('Nothing was written.')
    }
    expect(theJobsCount()).toBe(before)
  })
})

describe('a tool past its time limit', () => {
  it('4a: is ended with its whole process group, and the record says so', async () => {
    await registerATool(aDeclaration('sleeper', aStandIn('sleeper', [
      'sleep 30 &',
      'echo $! > "$HOST_JOB_OUTPUT/PID"',
      'echo started',
      'sleep 5',
      'echo never',
    ].join('\n')), { timeLimitSeconds: 1, outputs: [{ name: 'PID', maxBytes: 20 }] }))
    const run = await aRunOf(ASKER)
    const asked = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'sleeper', arguments: {} })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const started = Date.now()
    expect(await theRunner()).toBe(0)
    expect(Date.now() - started, 'the job was ended at its limit and not left to finish').toBeLessThan(4000)
    const data = theJobData(asked.body.job.id)
    expect(data['state'], JSON.stringify(data).slice(0, 600)).toBe('ended at its time limit')
    expect(data['why']).toBe(THE_RUNNERS_WORDS.endedAtItsTimeLimit(1))
    expect(data['signal']).toBe('SIGTERM')
    expect(data['logTail']).toContain('started')
    expect(data['logTail']).not.toContain('never')
    const pid = Number(String((data['outputs'] as { name: string; text?: string }[])[0]?.text).trim())
    expect(pid).toBeGreaterThan(1)
    expect(stillThere(pid), 'what the tool started in the background was ended with it').toBe(false)
  })

  it('4b: a tool that ignores TERM is sent KILL after the grace', async () => {
    await registerATool(aDeclaration('stubborn', aStandIn('stubborn', [
      "trap '' TERM",
      'echo started',
      'i=0',
      'while [ $i -lt 15 ]; do sleep 1; i=$((i+1)); done',
    ].join('\n')), { timeLimitSeconds: 1 }))
    const run = await aRunOf(ASKER)
    const asked = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'stubborn', arguments: {} })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const started = Date.now()
    expect(await theRunner()).toBe(0)
    expect(Date.now() - started).toBeLessThan(5000)
    const data = theJobData(asked.body.job.id)
    expect(data['state']).toBe('ended at its time limit')
    expect(data['signal']).toBe('SIGKILL')
  })
})

describe('who may ask', () => {
  it('5a: an agent the tool does not name is told which agents may ask it, and nothing is written', async () => {
    const run = await aRunOf(ANOTHER)
    const before = theJobsCount()
    const refused = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'stand-in', arguments: { label: 'x', count: 1 } })
    expect(refused.status).toBe(403)
    expect(refused.body.error).toContain(`This agent may not ask stand-in. The agents that may ask stand-in are ${ASKER} (${idOf[ASKER]}).`)
    expect(theJobsCount()).toBe(before)
  })

  it('5b: a tool naming a sandbox is asked only from that sandbox, as the office vouches, and only by an agent it names', async () => {
    const standIn = JSON.parse(readFileSync(toolsFile, 'utf8')).tools.find((one: any) => one.declaration.name === 'stand-in').declaration
    await registerATool(aDeclaration('sandboxed', standIn.program, {
      argv: ['{label}', '0'],
      arguments: { label: STAND_IN_ARGUMENTS.label },
      mayAsk: { agents: [idOf[ASKER]], sandboxes: ['lab-box'] },
    }))
    const labBox = aVouchedSandbox('lab-box')
    const otherBox = aVouchedSandbox('other-box')
    const ask = (run: ARun) => send('POST', '/api/host-jobs', asTheRun(run), { tool: 'sandboxed', arguments: { label: 'x' } })

    const outside = await aRunOf(ASKER)
    const fromNowhere = await ask(outside)
    expect(fromNowhere.status).toBe(403)
    expect(fromNowhere.body.error).toContain(`Run ${outside.id} may not ask sandboxed: it is in no sandbox the office vouches for.`)

    const elsewhere = await aRunOf(ASKER, otherBox)
    const fromOther = await ask(elsewhere)
    expect(fromOther.status).toBe(403)
    expect(fromOther.body.error).toContain('it is in the sandbox other-box.')
    expect(fromOther.body.error).toContain('from a run in the sandbox lab-box as the office vouches for it.')

    const stranger = await aRunOf(ANOTHER, labBox)
    const fromAStranger = await ask(stranger)
    expect(fromAStranger.status, 'the sandbox alone does not let every run in it ask').toBe(403)
    expect(fromAStranger.body.error).toContain('This agent may not ask sandboxed.')

    const inside = await aRunOf(ASKER, labBox)
    const fromInside = await ask(inside)
    expect(fromInside.status, fromInside.text.slice(0, 500)).toBe(201)
  })

  it("6a: only a running run's own key asks; a lasting key, another run's session or no key is refused", async () => {
    const run = await aRunOf(ASKER)
    const other = await aRunOf(ASKER)
    const before = theJobsCount()
    const body = { tool: 'stand-in', arguments: { label: 'x', count: 1 } }
    const asks: [string, Record<string, string>][] = [
      ["the agent's lasting key, naming its running run", { ...asAgent(ASKER), 'x-mole-office-session': run.id }],
      ["one run's key, naming another run", { ...asTheRun(run), 'x-mole-office-session': other.id }],
      ['no key', { ...asTheRun(run), 'x-mole-office-key': '' }],
    ]
    for (const [what, headers] of asks) {
      if (headers['x-mole-office-key'] === '') delete headers['x-mole-office-key']
      const refused = await send('POST', '/api/host-jobs', headers, body)
      expect(refused.status, `${what}: ${refused.text.slice(0, 300)}`).toBe(403)
      expect(refused.body.error, what).toContain('A host tool is asked for by a running run, with its own run key')
    }
    expect(theJobsCount()).toBe(before)
  })

  it('6b: nobody writes a host job through the records door, and only the office key takes or answers one', async () => {
    const run = await aRunOf(ASKER)
    const filed = await send('POST', '/api/records', AS_THE_PROVED_PERSON, { kind: 'host_job', title: 'Host job: stand-in', data: { tool: 'stand-in' } })
    expect(filed.status).toBe(403)
    expect(filed.body.error).toContain('A host job is written only by the host-job doors')

    const asked = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'stand-in', arguments: { label: 'x', count: 1 } })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const id = asked.body.job.id as string
    const patched = await send('PATCH', `/api/records/${id}`, AS_THE_PROVED_PERSON, { dataPatch: { state: 'finished' } })
    expect(patched.status).toBe(403)
    expect(theJobData(id)['state']).toBe('asked')

    // A KIND CHANGE IS A WRITE OF BOTH KINDS: no record becomes a host job, and no host job becomes anything else.
    const note = await send('POST', '/api/records', AS_THE_PROVED_PERSON, { kind: 'note', title: 'A note, not a job', data: { body: 'x' } })
    expect(note.status, note.text.slice(0, 300)).toBe(201)
    const intoAJob = await send('PATCH', `/api/records/${note.body.record.id}`, AS_THE_PROVED_PERSON, { kind: 'host_job' })
    expect(intoAJob.status, intoAJob.text.slice(0, 300)).toBe(403)
    expect(intoAJob.body.error).toContain('A host job is written only by the host-job doors')
    const outOfAJob = await send('PATCH', `/api/records/${id}`, AS_THE_PROVED_PERSON, { kind: 'note' })
    expect(outOfAJob.status, outOfAJob.text.slice(0, 300)).toBe(403)
    expect(t.client.sqlite.prepare('SELECT kind FROM records WHERE id = ?').get(id)).toEqual({ kind: 'host_job' })
    // AND THE JOB DOORS SAY WHAT ANOTHER KIND OF RECORD IS, rather than that nothing is there.
    const readANote = await send('GET', `/api/host-jobs/${note.body.record.id}`, AS_THE_PROVED_PERSON)
    expect(readANote.status).toBe(409)
    expect(readANote.body.error).toBe(`${note.body.record.id} is not a host job: it is a note called "A note, not a job". Nothing was written.`)

    for (const headers of [AS_THE_PROVED_PERSON, asTheRun(run), asAgent(THE_TEST_OFFICES_SECRETARY.handle)]) {
      const take = await send('POST', '/api/host-jobs/take', headers, {})
      expect(take.status).toBe(403)
      expect(take.body.error).toContain("Only the host job runner, with the office's own key, takes and answers host jobs.")
      const answer = await send('POST', `/api/host-jobs/${id}/answer`, headers, { state: 'finished', exitCode: 0 })
      expect(answer.status).toBe(403)
    }
    const early = await send('POST', `/api/host-jobs/${id}/answer`, THE_OFFICE_KEY_ALONE, { state: 'finished', exitCode: 0 })
    expect(early.status).toBe(409)
    expect(early.body.error).toContain(`The host job ${id} is asked, not running, so it takes no answer.`)
    expect(theJobData(id)['state']).toBe('asked')
  })

  it('6c: a run moved to another project is moved, and carries its host job with it, saying the same', async () => {
    const run = await aRunOf(ASKER)
    const asked = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'stand-in', arguments: { label: 'x', count: 1 } })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const id = asked.body.job.id as string
    const before = theJobData(id)
    const project = await send('POST', '/api/workspaces', AS_THE_PERSON, { id: 'synthetic-elsewhere', title: 'A synthetic other project' })
    expect([201, 409], project.text.slice(0, 300)).toContain(project.status)
    const moved = await send('POST', `/api/records/${run.id}/workspace`, AS_THE_PERSON, { to: 'synthetic-elsewhere', also: [id] })
    expect(moved.status, moved.text.slice(0, 500)).toBe(200)
    const where = (one: string): unknown => (t.client.sqlite.prepare('SELECT workspace_id AS w FROM records WHERE id = ?').get(one) as { w: string }).w
    expect(where(run.id)).toBe('synthetic-elsewhere')
    expect(where(id)).toBe('synthetic-elsewhere')
    expect(theJobData(id)).toEqual(before)
  })
})

describe('the caps', () => {
  it('7: at most three jobs of one tool and one of one run are asked or running', async () => {
    const body = { tool: 'stand-in', arguments: { label: 'x', count: 1 } }
    const runs = [await aRunOf(ASKER), await aRunOf(ASKER), await aRunOf(ASKER), await aRunOf(ASKER)]
    for (const run of runs.slice(0, 3)) expect((await send('POST', '/api/host-jobs', asTheRun(run), body)).status).toBe(201)
    const fourth = await send('POST', '/api/host-jobs', asTheRun(runs[3]!), body)
    expect(fourth.status).toBe(409)
    expect(fourth.body.error).toContain('stand-in already has 3 jobs asked or running')
    expect(fourth.body.error).toContain('it takes at most 3')

    const twice = await send('POST', '/api/host-jobs', asTheRun(runs[0]!), { tool: 'sleeper', arguments: {} })
    expect(twice.status).toBe(409)
    expect(twice.body.error).toContain(`Run ${runs[0]!.id} already has a host job asked or running`)
  })
})

describe('what a job hands back', () => {
  it('8: outputs are read without following a link, and each other state is said', async () => {
    await registerATool(aDeclaration('outputs-tool', aStandIn('outputs-tool', [
      'o="$HOST_JOB_OUTPUT"',
      'printf kept > "$o/KEPT.txt"',
      'ln -s "$PWD/outside.txt" "$o/LINK.txt"',
      'mkdir "$o/FOLDER.txt"',
      "head -c 300 /dev/zero | tr '\\000' a > \"$o/BIG.txt\"",
      'printf x > "$o/extra-one"',
      'printf x > "$o/extra-two"',
    ].join('\n')), {
      outputs: ['KEPT.txt', 'LINK.txt', 'FOLDER.txt', 'BIG.txt', 'MISSING.txt'].map((name) => ({ name, maxBytes: 100 })),
    }))
    const run = await aRunOf(ASKER)
    const asked = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'outputs-tool', arguments: {} })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    expect(await theRunner()).toBe(0)
    const data = theJobData(asked.body.job.id)
    const outputs = Object.fromEntries((data['outputs'] as { name: string }[]).map((one) => [one.name, one]))
    expect(outputs['KEPT.txt']).toMatchObject({ state: 'returned', size: 4, text: 'kept' })
    expect(outputs['LINK.txt'], 'a link is not followed').toEqual({ name: 'LINK.txt', state: 'not a regular file' })
    expect(outputs['FOLDER.txt']).toEqual({ name: 'FOLDER.txt', state: 'not a regular file' })
    expect(outputs['BIG.txt']).toEqual({ name: 'BIG.txt', state: 'too large', size: 300, sha256: createHash('sha256').update('a'.repeat(300)).digest('hex') })
    expect(outputs['MISSING.txt']).toEqual({ name: 'MISSING.txt', state: 'missing' })
    expect(data['undeclaredFiles']).toBe(2)
    expect(JSON.stringify(data)).not.toContain('outside the output folder')
  })

  it('9: what the tool prints is masked before it is filed, and the record says where', async () => {
    await registerATool(aDeclaration('masker', aStandIn('masker', [
      'echo "/home_nfs/someone/x"',
      'echo "a.b.ts.net"',
      'echo "ssh -l someone host"',
      'echo "/home_nfs/someone/x a.b.ts.net ssh -l someone host" > "$HOST_JOB_OUTPUT/SAID.txt"',
      'exit 3',
    ].join('\n')), { outputs: [{ name: 'SAID.txt', maxBytes: 200 }] }))
    const run = await aRunOf(ASKER)
    const asked = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'masker', arguments: {} })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    expect(await theRunner()).toBe(0)
    const data = theJobData(asked.body.job.id)
    expect(data['state']).toBe('finished')
    expect(data['exitCode']).toBe(3)
    const filed = JSON.stringify(data)
    for (const shown of ['/home_nfs', 'someone', 'a.b.ts.net']) expect(filed, shown).not.toContain(shown)
    expect(data['logTail']).toContain('<a host, not shown>')
    expect(data['logTail']).toContain('ssh -l <a login, not shown> host')
    expect(data['masked']).toEqual(expect.arrayContaining(['the log', 'SAID.txt']))
  })
})

describe('the file of tools', () => {
  it('10: a file others may read is refused whole, at the list and at the ask', async () => {
    const run = await aRunOf(ASKER)
    chmodSync(toolsFile, 0o644)
    try {
      const listed = await send('GET', '/api/host-tools', AS_THE_PERSON)
      expect(listed.status).toBe(409)
      expect(listed.body.error).toContain("The office's host tools file may be read or written by others (mode 644), so no host tool is used. It must be mode 600.")
      const asked = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'stand-in', arguments: { label: 'x', count: 1 } })
      expect(asked.status).toBe(409)
    } finally {
      chmodSync(toolsFile, 0o600)
    }
    expect((await send('GET', '/api/host-tools', AS_THE_PERSON)).status).toBe(200)
  })

  it('11: only a secretary registers, on a decision the owner made, and the program is checked on disk', async () => {
    const program = aStandIn('a-good-one', 'echo fine')
    const declaration = aDeclaration('a-good-one', program)
    const asTheSecretary = asAgent(THE_TEST_OFFICES_SECRETARY.handle)

    for (const headers of [AS_THE_PROVED_PERSON, asAgent(ASKER)]) {
      const refused = await send('POST', '/api/host-tools', headers, { declaration, decision: theDecision })
      expect(refused.status).toBe(403)
      expect(refused.body.error).toContain("Registering, changing or taking off a host tool is a secretary's act")
    }
    const none = await send('POST', '/api/host-tools', asTheSecretary, { declaration, decision: null })
    expect(none.status).toBe(400)
    expect(none.body.error).toContain('"decision" must be the id of a decision the owner made that this rests on, and none was given.')

    const itsOwn = await send('POST', '/api/records', asTheSecretary, {
      kind: 'decision',
      title: 'Register a stand-in on my own word',
      data: { replaces: [], decided_by: THE_TEST_OFFICES_SECRETARY.handle, authority: 'a measurement', because: 'a stand-in is needed' },
    })
    expect(itsOwn.status, itsOwn.text.slice(0, 400)).toBe(201)
    const notTheirOwn = await send('POST', '/api/host-tools', asTheSecretary, { declaration, decision: itsOwn.body.record.id })
    expect(notTheirOwn.status).toBe(400)
    expect(notTheirOwn.body.error).toContain(`"decision" must be the id of a decision the owner made, which says decided_by "${THE_OWNER}", and ${itsOwn.body.record.id} says "${THE_TEST_OFFICES_SECRETARY.handle}".`)

    const python = await send('POST', '/api/host-tools', asTheSecretary, { declaration: { ...declaration, program: { path: '/usr/bin/python3', sha256: 'a'.repeat(64) } }, decision: theDecision })
    expect(python.status).toBe(400)
    expect(python.body.error).toContain(WHY_IT_IS_NEVER_THE_PROGRAM.itIs('python3'))
    const link = join(scratch, 'bin', 'a-helper')
    symlinkSync('/bin/sh', link)
    const linked = await send('POST', '/api/host-tools', asTheSecretary, { declaration: { ...declaration, program: { path: link, sha256: theSha256Of(link) } }, decision: theDecision })
    expect(linked.status).toBe(400)
    expect(linked.body.error).toContain(WHY_IT_IS_NEVER_THE_PROGRAM.itResolvesTo(basename(realpathSync(link))))
    const wrong = await send('POST', '/api/host-tools', asTheSecretary, { declaration: { ...declaration, program: { ...program, sha256: 'b'.repeat(64) } }, decision: theDecision })
    expect(wrong.status).toBe(400)
    expect(wrong.body.error).toContain(WHY_A_PROGRAM_ON_DISK_IS_REFUSED.itsSha256Changed(program.sha256, 'b'.repeat(64)))
    expect(JSON.parse(readFileSync(toolsFile, 'utf8')).tools.some((one: any) => one.declaration.name === 'a-good-one'), 'nothing refused was written').toBe(false)

    const done = await send('POST', '/api/host-tools', asTheSecretary, { declaration, decision: theDecision })
    expect(done.status, done.text.slice(0, 400)).toBe(201)
    expect(done.body.says).toBe(`a-good-one is registered, on the decision ${theDecision}.`)
    expect(statSync(toolsFile).mode & 0o777).toBe(0o600)
    const entry = JSON.parse(readFileSync(toolsFile, 'utf8')).tools.find((one: any) => one.declaration.name === 'a-good-one')
    expect(entry.registered).toMatchObject({ by: idOf[THE_TEST_OFFICES_SECRETARY.handle], decision: theDecision })
  })

  it('11b: a program under a folder others may write, at any height above its own, is refused, and its job does not start', async () => {
    const above = join(scratch, 'a-folder-above')
    const bin = join(above, 'tools', 'bin')
    mkdirSync(bin, { recursive: true })
    for (const folder of [above, join(above, 'tools'), bin]) chmodSync(folder, 0o755)
    const path = join(bin, 'under-an-open-folder')
    writeFileSync(path, '#!/bin/sh\necho ran\n', { mode: 0o755 })
    chmodSync(path, 0o755)
    const declaration = aDeclaration('under-an-open-folder', { path, sha256: theSha256Of(path) })
    const asTheSecretary = asAgent(THE_TEST_OFFICES_SECRETARY.handle)
    await registerATool(declaration)
    const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'under-an-open-folder', arguments: {} })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const theFolder = realpathSync(above)
    const openBy = (mode: string): string => REFUSED.aFolderAbove(theFolder, REFUSED.othersMayWrite(mode))
    try {
      chmodSync(above, 0o777)
      const again = await send('POST', '/api/host-tools', asTheSecretary, { declaration, decision: theDecision })
      expect(again.status, `a folder above of mode 777: ${again.text.slice(0, 400)}`).toBe(400)
      // THE DOOR'S OWN SENTENCE around the reason is its line's, so only the reason is looked for.
      expect(again.body.error).toContain(openBy('777'))
      // THE JOB WAS ASKED BEFORE THE FOLDER OPENED, so the runner's own read of the program refuses it.
      expect(await theRunner()).toBe(0)
    } finally {
      chmodSync(above, 0o755)
    }
    const data = theJobData(asked.body.job.id)
    expect(data['state'], JSON.stringify(data).slice(0, 600)).toBe('could not start')
    expect(data['why']).toBe(openBy('777'))

    // A STICKY FOLDER OTHERS MAY WRITE, as /tmp is, refuses nothing: nobody else may rename or remove what is this user's in it.
    chmodSync(above, 0o1777)
    try {
      const sticky = await send('POST', '/api/host-tools', asTheSecretary, { declaration, decision: theDecision })
      expect(sticky.status, sticky.text.slice(0, 400)).toBe(201)
    } finally {
      chmodSync(above, 0o755)
    }

    // A STAND-IN READING OF WHO OWNS THE FOLDER ABOVE, since no folder on a test machine is another user's. Root owns
    // / and /tmp, which every program here is under, and owns the folder above here too in the second reading.
    const ownedBy = (uid: number) => (at: string): Stats => {
      const stat = statSync(at)
      return at === theFolder ? Object.assign(Object.create(Object.getPrototypeOf(stat) as object) as typeof stat, stat, { uid }) : stat
    }
    expect(theProgramOnDisk(declaration as never, ownedBy(4242))).toEqual({ refused: REFUSED.aFolderAbove(theFolder, REFUSED.anotherOwnerNotRoot) })
    expect(theProgramOnDisk(declaration as never, ownedBy(0))).toEqual({ program: realpathSync(path), folder: realpathSync(work) })

    // A FOLDER ABOVE THAT ONLY THE OFFICE USER'S OWN GROUP MAY WRITE refuses nothing, as a umask of 0002 makes every
    // folder. Whose group it is comes from stand-in files (theGroupsReadings).
    const accepted = { program: realpathSync(path), folder: realpathSync(work) }
    chmodSync(above, 0o775)
    try {
      for (const [files, why, reading] of theGroupsReadings(statSync(theFolder).gid, '775')) {
        expect(theProgramOnDisk(declaration as never, statSync, files), reading).toEqual(why === null ? accepted : { refused: REFUSED.aFolderAbove(theFolder, why) })
      }
    } finally {
      chmodSync(above, 0o755)
    }
  })

  it("11c: a program, or its own folder, that only the office user's own group may write is used, as a umask of 0002 makes them", () => {
    const bin = join(scratch, 'a-group-writable-one', 'bin')
    mkdirSync(bin, { recursive: true })
    chmodSync(dirname(bin), 0o755)
    chmodSync(bin, 0o755)
    const path = join(bin, 'written-under-a-umask-of-0002')
    writeFileSync(path, '#!/bin/sh\necho ran\n', { mode: 0o755 })
    chmodSync(path, 0o755)
    const declaration = aDeclaration('written-under-a-umask-of-0002', { path, sha256: theSha256Of(path) })
    const program = realpathSync(path)
    const folder = realpathSync(bin)
    const accepted = { program, folder: realpathSync(work) }

    // WHOSE GROUP IT IS comes from stand-in files (theGroupsReadings), as in case 11b.
    const gid = statSync(program).gid
    expect(statSync(folder).gid, 'the program and its folder have one group').toBe(gid)
    const readings = theGroupsReadings(gid, '775')
    const alone = (readings[1] as (typeof readings)[number])[0]

    // THE PROGRAM ITSELF, mode 775 as a umask of 0002 makes a file that is then made runnable.
    chmodSync(path, 0o775)
    try {
      for (const [files, why, reading] of readings) {
        expect(theProgramOnDisk(declaration as never, statSync, files), `the program: ${reading}`).toEqual(why === null ? accepted : { refused: REFUSED.itsFile(program, why) })
      }
      // Others are refused as before, whoever is in the group.
      chmodSync(path, 0o777)
      expect(theProgramOnDisk(declaration as never, statSync, alone)).toEqual({ refused: REFUSED.itsFile(program, REFUSED.othersMayWrite('777')) })
    } finally {
      chmodSync(path, 0o755)
    }

    // THE PROGRAM'S OWN FOLDER, mode 775 as a umask of 0002 makes a folder.
    chmodSync(bin, 0o775)
    try {
      for (const [files, why, reading] of readings) {
        expect(theProgramOnDisk(declaration as never, statSync, files), `its folder: ${reading}`).toEqual(why === null ? accepted : { refused: REFUSED.itsFolder(folder, why) })
      }
      chmodSync(bin, 0o777)
      expect(theProgramOnDisk(declaration as never, statSync, alone)).toEqual({ refused: REFUSED.itsFolder(folder, REFUSED.othersMayWrite('777')) })
    } finally {
      chmodSync(bin, 0o755)
    }

    // Both at once, as one umask makes them, and the program's own file and folder are still the office user's alone.
    chmodSync(path, 0o775)
    chmodSync(bin, 0o775)
    try {
      expect(theProgramOnDisk(declaration as never, statSync, alone)).toEqual(accepted)
      const ownedBy = (uid: number) => (at: string): Stats => {
        const stat = statSync(at)
        return at === program ? Object.assign(Object.create(Object.getPrototypeOf(stat) as object) as typeof stat, stat, { uid }) : stat
      }
      expect(theProgramOnDisk(declaration as never, ownedBy(0), alone)).toEqual({ refused: REFUSED.itsFile(program, REFUSED.anotherOwner) })
    } finally {
      chmodSync(path, 0o755)
      chmodSync(bin, 0o755)
    }
  })
})

describe('the runner', () => {
  it('12a: an answer it could not give is kept, and given on the next run', async () => {
    const run = await aRunOf(ASKER)
    const asked = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'stand-in', arguments: { label: 'held', count: 2 } })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const id = asked.body.job.id as string
    const taken = await send('POST', '/api/host-jobs/take', THE_OFFICE_KEY_ALONE, {})
    expect(taken.status, taken.text.slice(0, 300)).toBe(200)
    expect(taken.body.job.id).toBe(id)
    const held = join(runnerFolder, 'taken.json')
    writeFileSync(held, JSON.stringify({ id, workspaceId: 'default', answer: { state: 'finished', exitCode: 0, logTail: 'held\n' } }), { mode: 0o600 })

    const closed = createServer()
    await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done))
    const nobody = `http://127.0.0.1:${String((closed.address() as AddressInfo).port)}`
    await new Promise<void>((done) => closed.close(() => done()))
    expect(await theRunner({ api: nobody })).toBe(1)
    expect(existsSync(held), 'the answer is kept while the office is not there').toBe(true)
    expect(theJobData(id)['state']).toBe('running')

    expect(await theRunner()).toBe(0)
    expect(existsSync(held)).toBe(false)
    expect(theJobData(id)['state']).toBe('finished')
  })

  it('12b: a job it held when it stopped is answered lost, naming its process group', async () => {
    const run = await aRunOf(ASKER)
    const asked = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'stand-in', arguments: { label: 'lost', count: 2 } })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const id = asked.body.job.id as string
    expect((await send('POST', '/api/host-jobs/take', THE_OFFICE_KEY_ALONE, {})).status).toBe(200)
    writeFileSync(join(runnerFolder, 'taken.json'), JSON.stringify({ id, workspaceId: 'default', groupId: 4242424 }), { mode: 0o600 })
    expect(await theRunner()).toBe(0)
    const data = theJobData(id)
    expect(data['state']).toBe('lost')
    const W = THE_RUNNERS_WORDS
    expect(data['why']).toBe(W.aLostJob(W.lostWhileTheToolRan(4242424, W.itsStartWasNotWrittenDown)))
  })

  it('12e: a whole answer the office refuses as wrong is given again as its state alone, so the runner goes on', async () => {
    const run = await aRunOf(ASKER)
    const asked = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'stand-in', arguments: { label: 'refused', count: 2 } })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const id = asked.body.job.id as string
    expect((await send('POST', '/api/host-jobs/take', THE_OFFICE_KEY_ALONE, {})).status).toBe(200)
    // WHAT THE OFFICE SAYS TO THAT ANSWER, asked here first: it is refused for its shape before the job is read.
    const refused = await send('POST', `/api/host-jobs/${id}/answer`, THE_OFFICE_KEY_ALONE, { state: 'finished', exitCode: 1.5 })
    expect(refused.status, refused.text.slice(0, 300)).toBe(400)
    const held = join(runnerFolder, 'taken.json')
    writeFileSync(held, JSON.stringify({ id, workspaceId: 'default', answer: { state: 'finished', exitCode: 1.5 } }), { mode: 0o600 })
    expect(await theRunner()).toBe(0)
    expect(existsSync(held)).toBe(false)
    const data = theJobData(id)
    expect(data['state']).toBe('finished')
    expect(data['exitCode']).toBeUndefined()
    expect(data['why']).toBe(maskedForAHostJob(THE_RUNNERS_WORDS.theWholeAnswerWasRefused(String(refused.body.error))).text)
  })

  it('12c: a job whose tool was taken off, or whose program changed, does not start, and says why', async () => {
    const changing = aStandIn('changing', 'echo first')
    await registerATool(aDeclaration('changing', changing))
    await registerATool(aDeclaration('taken-off', aStandIn('taken-off', 'echo never')))
    // ONE JOB ASKED AT A TIME: two asked in the same second are taken in the order of their ids.
    const first = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'changing', arguments: {} })
    expect(first.status, first.text.slice(0, 300)).toBe(201)
    appendFileSync(changing.path, 'echo changed after the ask\n')
    expect(await theRunner()).toBe(0)
    const changed = theJobData(first.body.job.id)
    expect(changed['state']).toBe('could not start')
    // THE TWO SHA256S ARE MASKED IN THE REASON, as any 64 small hex characters are, since a key looks the same.
    const changedWhy = WHY_A_PROGRAM_ON_DISK_IS_REFUSED.itsSha256Changed(theSha256Of(changing.path), changing.sha256)
    expect(changed['why']).toBe(maskedForAHostJob(changedWhy).text)
    expect(changed['why']).not.toContain(changing.sha256)
    expect(changed['masked']).toEqual(['the reason'])
    expect(changed['logTail']).toBeUndefined()

    const second = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'taken-off', arguments: {} })
    expect(second.status, second.text.slice(0, 300)).toBe(201)
    const off = await send('POST', '/api/host-tools/take-off', asAgent(THE_TEST_OFFICES_SECRETARY.handle), { name: 'taken-off', decision: theDecision })
    expect(off.status, off.text.slice(0, 300)).toBe(200)
    expect(await theRunner()).toBe(0)
    const gone = theJobData(second.body.job.id)
    expect(gone['state']).toBe('could not start')
    expect(gone['why']).toBe('The tool taken-off was taken off the register after the job was asked.')
  })

  it('12f: it sends the office key only to this machine, and follows no redirect', async () => {
    const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'stand-in', arguments: { label: 'never sent', count: 1 } })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const said: string[] = []
    const write = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      said.push(String(chunk))
      return true
    })
    try {
      for (const elsewhere of ['http://192.0.2.1:9', 'http://127.0.0.1.example:9', 'http://localhost.:9', 'not an address']) expect(await theRunner({ api: elsewhere }), elsewhere).toBe(2)
    } finally {
      write.mockRestore()
    }
    expect(said).toEqual([
      ...['http://192.0.2.1:9', 'http://127.0.0.1.example:9', 'http://localhost.:9'].map((origin) => `${THE_RUNNERS_WORDS.notThisMachinesLoopback(origin)}\n`),
      `${THE_RUNNERS_WORDS.notAnAddress('not an address')}\n`,
    ])
    expect(theJobData(asked.body.job.id)['state'], 'no job was taken').toBe('asked')

    // A REDIRECT WOULD CARRY THE KEY to where it points, here a second listener on this machine that counts who came.
    let came = 0
    const target = createServer((_, reply) => {
      came += 1
      reply.end('{"job": null}')
    })
    const redirecting = createServer((_, reply) => {
      reply.writeHead(307, { location: `http://127.0.0.1:${String((target.address() as AddressInfo).port)}/api/host-jobs/take` })
      reply.end()
    })
    for (const server of [target, redirecting]) await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    try {
      expect(await theRunner({ api: `http://127.0.0.1:${String((redirecting.address() as AddressInfo).port)}` })).toBe(1)
    } finally {
      for (const server of [target, redirecting]) await new Promise<void>((done) => server.close(() => done()))
    }
    expect(came, 'the redirect was not followed, so nothing reached where it pointed').toBe(0)
    expect(theJobData(asked.body.job.id)['state']).toBe('asked')
  })

  it('12g: one runner at a time; a lock left by a runner that stopped is taken over', async () => {
    const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'stand-in', arguments: { label: 'one at a time', count: 1 } })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const lock = join(runnerFolder, 'runner.lock')
    const another = spawnSync(process.execPath, ['-e', ''], { timeout: 20_000 })
    const gone = Number(another.pid)
    expect(stillThere(gone), 'the made-up runner that stopped has ended').toBe(false)
    const holding = aRunnerThatWaits()
    const said: string[] = []
    const write = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      said.push(String(chunk))
      return true
    })
    const held = `${String(holding.pid)}\n${theStartOf(Number(holding.pid))}\n`
    try {
      writeFileSync(lock, held, { mode: 0o600 })
      expect(await theRunner()).toBe(2)
    } finally {
      write.mockRestore()
      holding.kill('SIGKILL')
    }
    expect(said).toEqual([`${THE_RUNNERS_WORDS.aRunnerHoldsTheLock(Number(holding.pid), lock)}\n`])
    expect(theJobData(asked.body.job.id)['state'], 'nothing was taken while another runner held the lock').toBe('asked')
    expect(readFileSync(lock, 'utf8')).toBe(held)

    writeFileSync(lock, `${String(gone)}\n`, { mode: 0o600 })
    expect(await theRunner()).toBe(0)
    expect(theJobData(asked.body.job.id)['state']).toBe('finished')
    expect(existsSync(lock), 'the lock is let go at the end of the run').toBe(false)
  })

  it('12h: the program and its folder are started by the real paths it checked, not through a link', async () => {
    const real = aStandIn('the-real-stand-in', 'printf "started as %s in %s\\n" "$(basename "$0")" "$(pwd)"')
    const aName = join(scratch, 'bin', 'a-name-for-it')
    symlinkSync(real.path, aName)
    // A FOLDER THAT IS ITSELF A LINK IS REFUSED, so the link is a folder above it.
    const aNameForTheScratch = join(scratch, 'a-name-for-the-scratch-folder')
    symlinkSync(scratch, aNameForTheScratch)
    await registerATool(aDeclaration('through-a-link', { path: aName, sha256: real.sha256 }, { folder: join(aNameForTheScratch, 'work') }))
    const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'through-a-link', arguments: {} })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    expect(await theRunner()).toBe(0)
    const data = theJobData(asked.body.job.id)
    expect(data['state'], JSON.stringify(data).slice(0, 600)).toBe('finished')
    expect(data['logTail']).toBe(`started as the-real-stand-in in ${realpathSync(work)}\n`)
  })

  it('12i: a pid given out again holds no lock; a runner is read by its pid, when it began and its command line', async () => {
    const lock = join(runnerFolder, 'runner.lock')
    await registerATool(aDeclaration('lock-reader', aStandIn('lock-reader', `cat "${lock}"`)))
    const ours = `${String(process.pid)}\n${theStartOf(process.pid)}\n`
    const aRunner = aRunnerThatWaits()
    const another = spawn('sleep', ['30'], { stdio: 'ignore' })
    try {
      const aRunnersStart = theStartOf(Number(aRunner.pid))
      const takenOver: [string, string][] = [
        [`${String(another.pid)}\n${theStartOf(Number(another.pid))}\n`, 'another program has the pid, and began when the lock says'],
        [`${String(another.pid)}\n`, 'another program has the pid of a lock written with no start time'],
        [`${String(aRunner.pid)}\n${new Date(Date.parse(aRunnersStart) - 3_600_000).toISOString()}\n`, 'a runner has the pid, and began an hour after the lock says'],
      ]
      for (const [written, why] of takenOver) {
        const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'lock-reader', arguments: {} })
        expect(asked.status, asked.text.slice(0, 500)).toBe(201)
        writeFileSync(lock, written, { mode: 0o600 })
        expect(await theRunner(), why).toBe(0)
        const data = theJobData(asked.body.job.id)
        expect(data['state'], why).toBe('finished')
        expect(data['logTail'], `${why}: the runner took the lock over and wrote its own pid and start time in it`).toBe(ours)
        expect(existsSync(lock), why).toBe(false)
      }

      const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'lock-reader', arguments: {} })
      expect(asked.status, asked.text.slice(0, 500)).toBe(201)
      const real = theProcessReader()
      // A STAND-IN READING: a process whose start time cannot be read is what a hidepid mount shows of another user's.
      const cannotRead = { ...real, processAt: (pid: number) => (pid === aRunner.pid ? { here: true as const, unreadable: 'a made-up reading that could not look' } : real.processAt(pid)) }
      const keptBy: [string, typeof real, string, string][] = [
        [
          `${String(aRunner.pid)}\n`,
          real,
          `${THE_RUNNERS_WORDS.aRunnerHoldsTheLock(Number(aRunner.pid), lock)}\n`,
          'a runner has the pid of a lock written with no start time',
        ],
        [
          `${String(aRunner.pid)}\n${aRunnersStart}\n`,
          cannotRead,
          `${THE_RUNNERS_WORDS.theLocksRunnerCannotBeTold(lock, Number(aRunner.pid))}\n`,
          'a process has the pid, and when it began could not be read',
        ],
      ]
      for (const [written, reads, sentence, why] of keptBy) {
        const said: string[] = []
        const write = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
          said.push(String(chunk))
          return true
        })
        try {
          writeFileSync(lock, written, { mode: 0o600 })
          expect(await theRunner({ reads }), why).toBe(2)
        } finally {
          write.mockRestore()
        }
        expect(said, why).toEqual([sentence])
        expect(readFileSync(lock, 'utf8'), `${why}: the lock is kept as it was`).toBe(written)
        expect(theJobData(asked.body.job.id)['state'], `${why}: nothing was taken while the lock was kept`).toBe('asked')
      }
    } finally {
      aRunner.kill('SIGKILL')
      another.kill('SIGKILL')
    }
  })

  it('12j: a runner that cannot read when its own process began does not start, and writes no lock', async () => {
    const lock = join(runnerFolder, 'runner.lock')
    const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'stand-in', arguments: { label: 'its own start', count: 1 } })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const real = theProcessReader()
    const itsOwnCannotBeRead = { ...real, processAt: (pid: number) => (pid === process.pid ? { here: true as const, unreadable: 'a made-up reading that could not look' } : real.processAt(pid)) }
    const said: string[] = []
    const write = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      said.push(String(chunk))
      return true
    })
    try {
      expect(await theRunner({ reads: itsOwnCannotBeRead })).toBe(2)
    } finally {
      write.mockRestore()
    }
    expect(said).toEqual([`${THE_RUNNERS_WORDS.itsOwnStartCannotBeRead(process.pid, lock)}\n`])
    expect(existsSync(lock), 'no lock was written').toBe(false)
    expect(theJobData(asked.body.job.id)['state'], 'nothing was taken').toBe('asked')
  })

  it("12k: the office's process is read by its pid, when it began and its command line, so a pid given out again ends the runner", async () => {
    // A STAND-IN FOR THE OFFICE'S PROCESS, and a stand-in reading of it that this case changes while the runner runs.
    const office = spawn('sleep', ['30'], { stdio: 'ignore' })
    const officePid = Number(office.pid)
    const real = theProcessReader()
    let reading: 'as it is' | 'cannot be read' | 'began an hour later' | 'runs another command' = 'as it is'
    const reads = {
      ...real,
      processAt: (pid: number) => {
        const now = real.processAt(pid)
        if (pid !== officePid || reading === 'as it is' || reading === 'runs another command') return now
        if (reading === 'cannot be read') return { here: true as const, unreadable: 'a made-up reading that could not look' }
        return now.here && now.unreadable === undefined ? { ...now, startedAt: new Date(now.startedAt.getTime() + 3_600_000) } : now
      },
      commandLineOf: (pid: number) => (pid === officePid && reading === 'runs another command' ? `${process.execPath} another-program.mjs` : real.commandLineOf(pid)),
    }
    const said: string[] = []
    const keep = (chunk: string | Uint8Array): boolean => {
      said.push(String(chunk))
      return true
    }
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(keep)
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(keep)
    const theRunnerWithTheOffice = (): Promise<number> =>
      runWithTheOffice({ api, key: A_MADE_UP_OFFICE_KEY, folder: runnerFolder, toolsFile, officePid, graceMs: A_SHORT_GRACE_MS, pauseMs: A_SHORT_PAUSE_MS, reads })
    const within = (ran: Promise<number>, ms: number): Promise<number | 'still running'> =>
      Promise.race([ran, new Promise<'still running'>((done) => setTimeout(() => done('still running'), ms))])
    const started = `${THE_RUNNERS_WORDS.itAsksEvery(A_SHORT_PAUSE_MS, officePid)}\n`
    const gone = `${THE_RUNNERS_WORDS.theOfficeHasGone(officePid)}\n`
    const cannotTell = `${THE_RUNNERS_WORDS.theOfficesStartCannotBeReadNow(officePid)}\n`
    let running: Promise<number> | null = null
    try {
      for (const ending of ['began an hour later', 'runs another command'] as const) {
        reading = 'as it is'
        said.length = 0
        running = theRunnerWithTheOffice()
        expect(await within(running, 1_500), 'the runner goes on while its office is the process it read').toBe('still running')
        expect(said, ending).toContain(started)
        if (ending === 'runs another command') {
          reading = 'cannot be read'
          expect(await within(running, 2_500), 'a start that cannot be read is not gone').toBe('still running')
          expect(said.filter((line) => line === cannotTell), 'it says once that it cannot tell').toHaveLength(1)
        }
        reading = ending
        expect(await within(running, 3_000), `the office's pid ${ending}`).toBe(0)
        expect(said, ending).toContain(gone)
        running = null
      }
      reading = 'cannot be read'
      said.length = 0
      running = theRunnerWithTheOffice()
      expect(await within(running, 3_000), "when the office's process began cannot be read at the start").toBe(2)
      running = null
      expect(said).toEqual([`${THE_RUNNERS_WORDS.theOfficesStartCannotBeRead(officePid)}\n`])
      expect(existsSync(join(runnerFolder, 'runner.lock')), 'no lock was written').toBe(false)
    } finally {
      out.mockRestore()
      err.mockRestore()
      reading = 'as it is'
      office.kill('SIGKILL')
      if (running !== null) await within(running, 5_000)
    }
  }, 30_000)

  it('12l: a runner whose office has already gone refuses before it takes the lock, and takes no job', async () => {
    const lock = join(runnerFolder, 'runner.lock')
    const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'stand-in', arguments: { label: 'no office', count: 1 } })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const ended = spawnSync(process.execPath, ['-e', ''], { timeout: 20_000 })
    const gone = Number(ended.pid)
    expect(stillThere(gone), 'the made-up office has ended').toBe(false)
    const office = spawn('sleep', ['30'], { stdio: 'ignore' })
    const real = theProcessReader()
    // A STAND-IN READING: a process whose start is read and whose command line is not, as one ending between the two.
    const noCommandLine = { ...real, commandLineOf: (pid: number) => (pid === office.pid ? null : real.commandLineOf(pid)) }
    const holding = aRunnerThatWaits()
    const within = (ran: Promise<number>, ms: number): Promise<number | 'still running'> =>
      Promise.race([ran, new Promise<'still running'>((done) => setTimeout(() => done('still running'), ms))])
    try {
      const held = `${String(holding.pid)}\n${theStartOf(Number(holding.pid))}\n`
      const cases: [number, typeof real, string | null, string, string][] = [
        [gone, real, held, `${THE_RUNNERS_WORDS.theOfficeIsNotRunning(gone)}\n`, 'the office has gone, while another runner holds the lock'],
        [Number(office.pid), noCommandLine, null, `${THE_RUNNERS_WORDS.theOfficeHasNoCommandLine(Number(office.pid))}\n`, 'the office has no command line, and no runner holds the lock'],
      ]
      for (const [officePid, reads, lockHeld, sentence, why] of cases) {
        rmSync(lock, { force: true })
        if (lockHeld !== null) writeFileSync(lock, lockHeld, { mode: 0o600 })
        const said: string[] = []
        const keep = (chunk: string | Uint8Array): boolean => {
          said.push(String(chunk))
          return true
        }
        const out = vi.spyOn(process.stdout, 'write').mockImplementation(keep)
        const err = vi.spyOn(process.stderr, 'write').mockImplementation(keep)
        try {
          expect(await within(runWithTheOffice({ api, key: A_MADE_UP_OFFICE_KEY, folder: runnerFolder, toolsFile, officePid, graceMs: A_SHORT_GRACE_MS, pauseMs: A_SHORT_PAUSE_MS, reads }), 3_000), why).toBe(2)
        } finally {
          out.mockRestore()
          err.mockRestore()
        }
        expect(said, why).toEqual([sentence])
        expect(existsSync(lock) ? readFileSync(lock, 'utf8') : null, `${why}: the lock is as it was`).toBe(lockHeld)
        expect(theJobData(asked.body.job.id)['state'], `${why}: no job was taken`).toBe('asked')
      }
    } finally {
      holding.kill('SIGKILL')
      office.kill('SIGKILL')
    }
  })

  it('12m: of two runners taking over one lock left by a runner that stopped, one takes it and the other does not start; what a runner stopped while taking over left is gone past and removed', async () => {
    const lock = join(runnerFolder, 'runner.lock')
    const takingOver = join(runnerFolder, 'runner.lock.taking-over')
    const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'stand-in', arguments: { label: 'one of two', count: 1 } })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const ended = spawnSync(process.execPath, ['-e', ''], { timeout: 20_000 })
    const gone = Number(ended.pid)
    expect(stillThere(gone), 'the made-up runner that stopped has ended').toBe(false)
    const real = theProcessReader()
    const aRunnersCommandLine = `${process.execPath} ${resolve('tools/run-the-host-jobs.mjs')} --once`
    let theSecond: Promise<number> | null = null
    let secondStarted = false
    // A STAND-IN READING, in two parts. The second runner starts while the first reads the pid of the runner that
    // stopped, as a runner started by hand beside the office's could. Both runners are this test's process, so its
    // command line is read as a runner's.
    const reads: ReturnType<typeof theProcessReader> = {
      ...real,
      processAt: (pid: number) => {
        if (pid === gone && !secondStarted) {
          secondStarted = true
          theSecond = theRunner({ reads })
        }
        return real.processAt(pid)
      },
      commandLineOf: (pid: number) => (pid === process.pid ? aRunnersCommandLine : real.commandLineOf(pid)),
    }
    const takes: string[] = []
    const theFetch = globalThis.fetch
    const fetching = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (String(input).endsWith('/api/host-jobs/take')) takes.push(String(input))
      return theFetch(input, init)
    })
    const said: string[] = []
    const keep = (chunk: string | Uint8Array): boolean => {
      said.push(String(chunk))
      return true
    }
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(keep)
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(keep)
    let codes: number[] = []
    try {
      writeFileSync(lock, `${String(gone)}\n`, { mode: 0o600 })
      const first = await theRunner({ reads })
      expect(theSecond, 'the second runner started').not.toBeNull()
      codes = [first, await (theSecond as unknown as Promise<number>)]
    } finally {
      fetching.mockRestore()
      out.mockRestore()
      err.mockRestore()
    }
    expect(codes, said.join('')).toEqual([2, 0])
    expect(said).toContain(`${THE_RUNNERS_WORDS.aRunnerHoldsTheLock(process.pid, lock)}\n`)
    expect(takes, 'one runner asked the office for a job').toHaveLength(1)
    expect(theJobData(asked.body.job.id)['state']).toBe('finished')
    expect(existsSync(lock), 'the lock is let go at the end of the run').toBe(false)
    expect(existsSync(takingOver), 'nothing of the taking over is left').toBe(false)

    // A RUNNER TAKING A LOCK OVER NOW is named, and this run does not start, as when what has its pid cannot be read.
    const another = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'stand-in', arguments: { label: 'not taken', count: 1 } })
    expect(another.status, another.text.slice(0, 500)).toBe(201)
    const andAgain = `${takingOver}.2`
    const stoppedToo = Number(spawnSync(process.execPath, ['-e', ''], { timeout: 20_000 }).pid)
    expect(stillThere(stoppedToo), 'the second made-up runner that stopped has ended').toBe(false)
    const leftByTheStopped = `${String(gone)}\n`
    const holding = aRunnerThatWaits()
    const holdingPid = Number(holding.pid)
    try {
      const itsLock = `${String(holdingPid)}\n${theStartOf(holdingPid)}\n`
      const cannotRead = { ...real, processAt: (pid: number) => (pid === holdingPid ? { here: true as const, unreadable: 'a made-up reading that could not look' } : real.processAt(pid)) }
      // A STAND-IN READING in which, while this runner reads the pid in a file it goes past, that file is removed and made
      // anew, as by a runner that took over in its place and by the next one.
      const madeAnew = { ...real, processAt: (pid: number) => {
        if (pid === stoppedToo) writeFileSync(takingOver, itsLock, { mode: 0o600 })
        return real.processAt(pid)
      } }
      const theWords = THE_RUNNERS_WORDS
      const cases: [Record<string, string>, typeof real, string, Record<string, string | null>, string][] = [
        [{ [takingOver]: itsLock }, real, theWords.aRunnerIsTakingOver(holdingPid, lock), { [takingOver]: itsLock, [andAgain]: null }, 'a runner that still runs is taking the lock over'],
        [
          { [takingOver]: itsLock },
          cannotRead,
          theWords.aTakerCannotBeTold(takingOver, holdingPid, lock),
          { [takingOver]: itsLock, [andAgain]: null },
          'a process has the pid, and when it began could not be read',
        ],
        [
          { [takingOver]: leftByTheStopped, [andAgain]: itsLock },
          real,
          theWords.aRunnerIsTakingOver(holdingPid, lock),
          { [takingOver]: leftByTheStopped, [andAgain]: itsLock },
          'past the file a runner that stopped left, a runner that still runs is taking the lock over',
        ],
        [
          { [takingOver]: `${String(stoppedToo)}\n` },
          madeAnew,
          theWords.anotherTookOver(lock),
          { [takingOver]: itsLock, [andAgain]: null },
          'the file gone past was made anew before this runner had made its own',
        ],
      ]
      for (const [written, readsNow, sentence, after, why] of cases) {
        rmSync(andAgain, { force: true })
        writeFileSync(lock, leftByTheStopped, { mode: 0o600 })
        for (const [file, text] of Object.entries(written)) writeFileSync(file, text, { mode: 0o600 })
        const heard: string[] = []
        const keepIt = (chunk: string | Uint8Array): boolean => {
          heard.push(String(chunk))
          return true
        }
        const heardOut = vi.spyOn(process.stdout, 'write').mockImplementation(keepIt)
        const heardErr = vi.spyOn(process.stderr, 'write').mockImplementation(keepIt)
        try {
          expect(await theRunner({ reads: readsNow }), why).toBe(2)
        } finally {
          heardOut.mockRestore()
          heardErr.mockRestore()
        }
        expect(heard, why).toEqual([`${sentence}\n`])
        for (const [file, text] of Object.entries(after)) expect(existsSync(file) ? readFileSync(file, 'utf8') : null, `${why}: ${file}`).toBe(text)
        expect(readFileSync(lock, 'utf8'), `${why}: the lock is kept`).toBe(leftByTheStopped)
        expect(theJobData(another.body.job.id)['state'], `${why}: nothing was taken`).toBe('asked')
      }
    } finally {
      holding.kill('SIGKILL')
    }

    // A RUNNER THAT STOPPED WHILE IT TOOK THE LOCK OVER left its file. The next runner goes past it to a file of its own,
    // and past a second left so, takes the lock over, and removes both, saying so. Nobody removes them by hand.
    writeFileSync(lock, leftByTheStopped, { mode: 0o600 })
    writeFileSync(takingOver, `${String(gone)}\n`, { mode: 0o600 })
    writeFileSync(andAgain, `${String(stoppedToo)}\n`, { mode: 0o600 })
    const told: string[] = []
    const tell = (chunk: string | Uint8Array): boolean => {
      told.push(String(chunk))
      return true
    }
    const toldOut = vi.spyOn(process.stdout, 'write').mockImplementation(tell)
    const toldErr = vi.spyOn(process.stderr, 'write').mockImplementation(tell)
    try {
      expect(await theRunner({ reads: real }), told.join('')).toBe(0)
    } finally {
      toldOut.mockRestore()
      toldErr.mockRestore()
    }
    expect(told).toContain(`${THE_RUNNERS_WORDS.aTakerStopped(gone, lock, takingOver)}\n`)
    expect(told).toContain(`${THE_RUNNERS_WORDS.aTakerStopped(stoppedToo, lock, andAgain)}\n`)
    for (const file of [takingOver, andAgain, `${takingOver}.3`]) expect(existsSync(file), `${file} is removed`).toBe(false)
    expect(existsSync(lock), 'the lock is let go at the end of the run').toBe(false)
    expect(theJobData(another.body.job.id)['state'], 'the job is taken and run').toBe('finished')
  })

  it('12n: a job taken by a runner that stopped before it wrote the job down is answered lost, when the next runner says it holds nothing', async () => {
    const first = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'stand-in', arguments: { label: 'never written down', count: 1 } })
    expect(first.status, first.text.slice(0, 500)).toBe(201)
    const id = first.body.job.id as string
    // TAKEN AS A RUNNER TAKES IT, and taken.json not written, as when a runner stops between the two.
    const taken = await send('POST', '/api/host-jobs/take', THE_OFFICE_KEY_ALONE, {})
    expect(taken.status, taken.text.slice(0, 300)).toBe(200)
    expect(taken.body.job.id).toBe(id)
    expect(existsSync(join(runnerFolder, 'taken.json'))).toBe(false)
    const second = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'stand-in', arguments: { label: 'the next one', count: 1 } })
    expect(second.status, second.text.slice(0, 500)).toBe(201)

    const said: string[] = []
    const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      said.push(String(chunk))
      return true
    })
    try {
      expect(await theRunner()).toBe(0)
    } finally {
      out.mockRestore()
    }
    const data = theJobData(id)
    expect(data['state'], JSON.stringify(data).slice(0, 600)).toBe('lost')
    // Imported here, after freshDb has named the test database, since the module opens the database it is given.
    expect(data['why']).toBe((await import('../src/server/lib/host-jobs.ts')).NO_RUNNER_HOLDS_IT)
    expect(said).toContain(`${THE_RUNNERS_WORDS.lostSinceNoRunnerHeldIt(id)}\n`)
    expect(theJobData(second.body.job.id)['state'], 'the next job is taken and run').toBe('finished')
  })

  it("12o: a job lost while its tool ran has its process group ended by the next runner, when the group is still the tool's", async () => {
    const waits = aStandIn('waits-in-its-group', 'sleep 30 &\necho $! > "$HOST_JOB_OUTPUT/the-child"\nwait')
    await registerATool(aDeclaration('waits-in-its-group', waits))
    const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'waits-in-its-group', arguments: {} })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const id = asked.body.job.id as string
    const held = join(runnerFolder, 'taken.json')
    // A REAL RUNNER, STOPPED OUTRIGHT WHILE THE TOOL RUNS, as one is when its process is killed with the machine up.
    const runner = spawn(process.execPath, [resolve('tools/run-the-host-jobs.mjs'), '--once', '--api', api], {
      stdio: 'ignore',
      env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: process.env['HOME'] ?? '', MOLE_OFFICE_DB: t.file },
    })
    const itsExit = new Promise((done) => runner.once('exit', done))
    let groupId = 0
    let child = 0
    try {
      const until = Date.now() + 15_000
      const theChild = join(runnerFolder, id, 'out', 'the-child')
      while ((groupId === 0 || child === 0) && Date.now() < until) {
        await new Promise((done) => setTimeout(done, 100))
        if (existsSync(held)) groupId = Number(JSON.parse(readFileSync(held, 'utf8')).groupId ?? 0)
        if (existsSync(theChild)) child = Number.parseInt(readFileSync(theChild, 'utf8'), 10) || 0
      }
      expect(groupId, "the runner wrote down the tool's process group").toBeGreaterThan(0)
      expect(child, 'the tool wrote down the process it started').toBeGreaterThan(0)
      runner.kill('SIGKILL')
      await itsExit
      expect([stillThere(groupId), stillThere(child)], 'the tool and what it started outlive the runner').toEqual([true, true])
      expect(await theRunner()).toBe(0)
      expect([stillThere(groupId), stillThere(child)], "the next runner ended the tool's group").toEqual([false, false])
    } finally {
      runner.kill('SIGKILL')
      if (groupId > 0) {
        try {
          process.kill(-groupId, 'SIGKILL')
        } catch {
          // Ended already.
        }
      }
    }
    const data = theJobData(id)
    expect(data['state'], JSON.stringify(data).slice(0, 600)).toBe('lost')
    expect(data['why']).toBe(THE_RUNNERS_WORDS.aLostJob(THE_RUNNERS_WORDS.lostWhileTheToolRan(groupId, THE_RUNNERS_WORDS.itsGroupWasEnded(A_SHORT_GRACE_MS))))

    // A GROUP THAT CANNOT BE TOLD TO BE THE TOOL'S IS LEFT, and the answer says why.
    const another = spawn('sleep', ['30'], { stdio: 'ignore', detached: true })
    const anotherPid = Number(another.pid)
    try {
      const itsStart = theStartOf(anotherPid)
      const real = theProcessReader()
      const cannotRead = { ...real, processAt: (pid: number) => (pid === anotherPid ? { here: true as const, unreadable: 'a made-up reading that could not look' } : real.processAt(pid)) }
      const itsLeaderGone = { ...real, processAt: (pid: number) => (pid === anotherPid ? { here: false as const } : real.processAt(pid)) }
      const cases: [Record<string, unknown>, typeof real, string, string][] = [
        [
          { groupStartedAt: new Date(Date.parse(itsStart) - 3_600_000).toISOString() },
          real,
          THE_RUNNERS_WORDS.anotherProgramHasIt(anotherPid),
          'the process with the number began an hour after the one written down',
        ],
        [
          { groupStartedAt: itsStart },
          cannotRead,
          THE_RUNNERS_WORDS.itsStartCannotBeRead(anotherPid),
          'when the process with the number began could not be read',
        ],
        [
          { groupStartedAt: itsStart },
          itsLeaderGone,
          THE_RUNNERS_WORDS.itsOwnProcessHasEndedAndItsGroupStillHadAMember(anotherPid),
          "the tool's own process has ended but its group still had a member",
        ],
        [
          {},
          real,
          THE_RUNNERS_WORDS.itsStartWasNotWrittenDown,
          'when the tool began was not written down',
        ],
      ]
      for (const [written, reads, sentence, why] of cases) {
        const job = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'stand-in', arguments: { label: 'lost', count: 1 } })
        expect(job.status, job.text.slice(0, 500)).toBe(201)
        expect((await send('POST', '/api/host-jobs/take', THE_OFFICE_KEY_ALONE, {})).status).toBe(200)
        writeFileSync(held, JSON.stringify({ id: job.body.job.id, workspaceId: 'default', groupId: anotherPid, ...written }), { mode: 0o600 })
        expect(await theRunner({ reads }), why).toBe(0)
        expect(stillThere(anotherPid), `${why}: the group is left`).toBe(true)
        const lost = theJobData(job.body.job.id)
        expect(lost['state'], why).toBe('lost')
        expect(lost['why'], why).toBe(THE_RUNNERS_WORDS.aLostJob(THE_RUNNERS_WORDS.lostWhileTheToolRan(anotherPid, sentence)))
      }
    } finally {
      another.kill('SIGKILL')
    }
  }, 60_000)

  it('12d: its command refuses to run without --once', () => {
    const ran = spawnSync(process.execPath, [resolve('tools/run-the-host-jobs.mjs')], { encoding: 'utf8', timeout: 20_000, env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin' } })
    expect(ran.status, ran.stderr).toBe(2)
    expect(ran.stderr).toContain(`${THE_RUNNERS_WORDS.onceOrWithTheOffice}\n`)
  })
})

describe('the scope a job runs in', () => {
  /** A made-up user session, as the runner reads it from its own environment. */
  const A_SESSION = { XDG_RUNTIME_DIR: '/run/user/a-made-up-session', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/a-made-up-session/bus' }
  const THE_PROBE = ['systemd-run', '--user', '--scope', '--quiet', '--collect', '--', 'true']
  const theScopeFor = (id: string): string => `mole-office-host-job-${id}.scope`
  const theCalls = (): string[][] => SYSTEMD.calls.map((one) => [one.command, ...one.args])
  const theStops = (): { args: string[]; whileItRan: boolean | undefined }[] =>
    SYSTEMD.calls.filter((one) => one.command === 'systemctl').map((one) => ({ args: one.args, whileItRan: one.whileItRan }))
  const thePidIn = (data: Record<string, any>): number => Number(String((data['outputs'] as { name: string; text?: string }[]).find((one) => one.name === 'PID')?.text).trim())

  /** `act` with `session` (A_SESSION unless another is given) as the whole session in this process's environment, which is put back after. */
  async function inASession<T>(act: () => Promise<T>, session: Partial<typeof A_SESSION> = A_SESSION): Promise<T> {
    const before = Object.fromEntries(Object.keys(A_SESSION).map((name) => [name, process.env[name]]))
    for (const name of Object.keys(A_SESSION) as (keyof typeof A_SESSION)[]) {
      const value = session[name]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    try {
      return await act()
    } finally {
      for (const [name, value] of Object.entries(before)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }
  }

  /** A tool that starts a child in its group, writes the child's pid, and waits, so its time limit of 1 second ends it. */
  async function aSleeper(name: string): Promise<void> {
    const body = ['sleep 30 &', 'echo $! > "$HOST_JOB_OUTPUT/PID"', 'echo started', 'sleep 5', 'echo never'].join('\n')
    await registerATool(aDeclaration(name, aStandIn(name, body), { timeLimitSeconds: 1, outputs: [{ name: 'PID', maxBytes: 20 }] }))
  }

  it('13a: a job runs in a scope of its own, named for the job, that is stopped after the tool ends; the tool sees no address of the session, and the job says which way held it', async () => {
    SYSTEMD.way = 'scope'
    const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'stand-in', arguments: { label: 'in a scope', count: 3 } })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const id = asked.body.job.id as string
    const unit = theScopeFor(id)
    expect(await inASession(() => theRunner())).toBe(0)
    const data = theJobData(id)
    expect(data['state'], JSON.stringify(data).slice(0, 600)).toBe('finished')
    expect(data['exitCode']).toBe(0)
    expect(theCalls()).toEqual([
      THE_PROBE,
      [
        'systemd-run', '--user', '--scope', '--quiet', '--collect', `--unit=${unit}`, `--property=TimeoutStopSec=${String(A_SHORT_GRACE_MS)}ms`, '--',
        '/usr/bin/env', '-u', 'XDG_RUNTIME_DIR', '-u', 'DBUS_SESSION_BUS_ADDRESS', realpathSync(join(scratch, 'bin', 'stand-in')), 'in a scope', '3',
      ],
      ['systemctl', '--user', 'stop', unit],
    ])
    const [probe, start, stop] = SYSTEMD.calls
    expect(probe?.env, 'systemd-run is given the path and the session, and nothing else').toEqual({ PATH: '/usr/bin:/bin', ...A_SESSION })
    expect(stop?.env, 'so is systemctl').toEqual({ PATH: '/usr/bin:/bin', ...A_SESSION })
    expect(Object.keys(start?.env ?? {}).sort()).toEqual(['DBUS_SESSION_BUS_ADDRESS', 'HOME', 'HOST_JOB_ID', 'HOST_JOB_OUTPUT', 'LANG', 'PATH', 'TZ', 'USER', 'XDG_RUNTIME_DIR'])
    expect(stop?.whileItRan, 'the scope was stopped after the tool had ended').toBe(false)
    const env = String((data['outputs'] as { name: string; text?: string }[]).find((one) => one.name === 'ENV')?.text).split('\n')
    expect(env, 'the tool sees no address of the session').not.toContain('XDG_RUNTIME_DIR')
    expect(env).not.toContain('DBUS_SESSION_BUS_ADDRESS')
    expect(env).toEqual(expect.arrayContaining(['HOST_JOB_ID', 'HOST_JOB_OUTPUT', 'PATH', 'HOME']))
    expect(data['heldBy']).toBe(HOST_JOB_HOLDINGS[0])
    expect(data['howItWasHeld']).toBe(THE_RUNNERS_WORDS.inItsOwnScope(unit))

    // THE OFFICE TAKES ONLY THE TWO WAYS: an answer naming another is refused before the job is read.
    const another = await send('POST', `/api/host-jobs/${id}/answer`, THE_OFFICE_KEY_ALONE, { state: 'finished', heldBy: 'its whole machine' })
    expect(another.status, another.text.slice(0, 300)).toBe(400)
    expect(another.text).toContain('heldBy')
  })

  it('13b: at its time limit the scope is stopped while the tool runs, and what the tool started ends with it', async () => {
    SYSTEMD.way = 'scope'
    await aSleeper('a-scoped-sleeper')
    const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'a-scoped-sleeper', arguments: {} })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const id = asked.body.job.id as string
    const started = Date.now()
    expect(await inASession(() => theRunner())).toBe(0)
    expect(Date.now() - started, 'the job was ended at its limit and not left to finish').toBeLessThan(4000)
    const data = theJobData(id)
    expect(data['state'], JSON.stringify(data).slice(0, 600)).toBe('ended at its time limit')
    expect(data['why']).toBe(THE_RUNNERS_WORDS.endedAtItsTimeLimit(1))
    expect(data['signal']).toBe('SIGTERM')
    expect(theStops(), 'the scope was stopped once, while the tool ran').toEqual([{ args: ['--user', 'stop', theScopeFor(id)], whileItRan: true }])
    expect(stillThere(thePidIn(data)), 'what the tool started was ended with the scope').toBe(false)
    expect(data['heldBy']).toBe(HOST_JOB_HOLDINGS[0])
    expect(data['howItWasHeld']).toBe(THE_RUNNERS_WORDS.inItsOwnScope(theScopeFor(id)))
  })

  it('13c: a runner asked to stop while the tool runs stops its scope, and the job is lost in words that say so', async () => {
    SYSTEMD.way = 'scope'
    await registerATool(aDeclaration('a-scoped-waiter', aStandIn('a-scoped-waiter', 'echo started\nsleep 30')))
    const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'a-scoped-waiter', arguments: {} })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const id = asked.body.job.id as string
    const unit = theScopeFor(id)
    // A STAND-IN FOR THE OFFICE'S PROCESS: the runner stops when it has gone, as it does when it is sent TERM.
    const office = spawn('sleep', ['30'], { stdio: 'ignore' })
    const officePid = Number(office.pid)
    const within = (ran: Promise<number>, ms: number): Promise<number | 'still running'> =>
      Promise.race([ran, new Promise<'still running'>((done) => setTimeout(() => done('still running'), ms))])
    const keep = (): boolean => true
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(keep)
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(keep)
    let running: Promise<number> | null = null
    try {
      await inASession(async () => {
        running = runWithTheOffice({ api, key: A_MADE_UP_OFFICE_KEY, folder: runnerFolder, toolsFile, officePid, graceMs: A_SHORT_GRACE_MS, pauseMs: A_SHORT_PAUSE_MS })
        const until = Date.now() + 10_000
        while (!SYSTEMD.scopes.has(unit) && Date.now() < until) await new Promise((done) => setTimeout(done, 50))
      })
      expect(SYSTEMD.scopes.has(unit), 'the tool was started in its scope').toBe(true)
      office.kill('SIGKILL')
      expect(await within(running as unknown as Promise<number>, 5_000)).toBe(0)
      running = null
    } finally {
      out.mockRestore()
      err.mockRestore()
      office.kill('SIGKILL')
      if (running !== null) await within(running, 5_000)
    }
    const data = theJobData(id)
    expect(data['state'], JSON.stringify(data).slice(0, 600)).toBe('lost')
    expect(data['why']).toBe(THE_RUNNERS_WORDS.lostWhenAskedToStopInItsScope(A_SHORT_GRACE_MS))
    expect(theStops(), 'the scope was stopped while the tool ran').toEqual([{ args: ['--user', 'stop', unit], whileItRan: true }])
    expect(data['heldBy']).toBe(HOST_JOB_HOLDINGS[0])
  }, 30_000)

  it('13d: where no scope can be started, or the program\'s path holds "=", the job is held by its group only and says so; a process that left the group is not ended', async () => {
    // THE TOOL WAITS UNTIL ITS CHILD HAS LEFT ITS GROUP (field 5 of /proc/<pid>/stat), or the KILL at its end could
    // reach the child before setsid had moved it.
    const leaves = [
      'setsid sleep 30 > /dev/null 2>&1 &',
      'until [ "$(cut -d" " -f5 /proc/$!/stat)" != "$(cut -d" " -f5 /proc/$$/stat)" ]; do sleep 0.05; done',
      'echo $! > "$HOST_JOB_OUTPUT/PID"',
      'echo started',
    ].join('\n')
    const outputs = [{ name: 'PID', maxBytes: 20 }]
    await registerATool(aDeclaration('a-tool-whose-child-leaves', aStandIn('a-tool-whose-child-leaves', leaves), { outputs }))
    const withAnEqualsSign = aStandIn('its=group', leaves)
    await registerATool(aDeclaration('a-tool-with-an-equals-sign', withAnEqualsSign, { outputs }))
    const W = THE_RUNNERS_WORDS
    const ways: ['missing' | 'refused' | 'scope', string, string, string[][]][] = [
      ['missing', 'a-tool-whose-child-leaves', W.byItsGroupOnly(W.noScope(W.couldNotStart('systemd-run', 'ENOENT'))), [THE_PROBE]],
      ['refused', 'a-tool-whose-child-leaves', W.byItsGroupOnly(W.noScope(W.exited('systemd-run', 1, 'Failed to connect to bus: No medium found'))), [THE_PROBE]],
      ['scope', 'a-tool-with-an-equals-sign', W.byItsGroupOnly(W.itsPathHoldsAnEqualsSign(realpathSync(withAnEqualsSign.path))), []],
    ]
    for (const [way, tool, words, calls] of ways) {
      SYSTEMD.way = way
      SYSTEMD.calls.length = 0
      const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool, arguments: {} })
      expect(asked.status, asked.text.slice(0, 500)).toBe(201)
      expect(await inASession(() => theRunner()), way).toBe(0)
      const data = theJobData(asked.body.job.id)
      const left = thePidIn(data)
      try {
        expect(data['state'], `${way}: ${JSON.stringify(data).slice(0, 600)}`).toBe('finished')
        expect(theCalls(), way).toEqual(calls)
        expect(data['heldBy'], way).toBe(HOST_JOB_HOLDINGS[1])
        expect(data['howItWasHeld'], way).toBe(maskedForAHostJob(words).text)
        expect(left, way).toBeGreaterThan(1)
        expect(stillThere(left), `${way}: a process that left the group is not ended, as the words say`).toBe(true)
      } finally {
        try {
          if (left > 1) process.kill(left, 'SIGKILL')
        } catch {
          // Ended already.
        }
      }
    }
  })

  it('13e: a scope that cannot be stopped is said, its group is ended instead, and the job is not shown as held by its scope', async () => {
    SYSTEMD.way = 'scope'
    SYSTEMD.stop = 'fails'
    await aSleeper('a-sleeper-whose-scope-stays')
    const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'a-sleeper-whose-scope-stays', arguments: {} })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const id = asked.body.job.id as string
    const unit = theScopeFor(id)
    expect(await inASession(() => theRunner())).toBe(0)
    const data = theJobData(id)
    expect(data['state'], JSON.stringify(data).slice(0, 600)).toBe('ended at its time limit')
    expect(data['why']).toBe(THE_RUNNERS_WORDS.endedAtItsTimeLimit(1))
    expect(theStops(), 'the scope was asked to stop once').toEqual([{ args: ['--user', 'stop', unit], whileItRan: true }])
    expect(stillThere(thePidIn(data)), "what the tool started in its group was ended with the group").toBe(false)
    expect(data['heldBy']).toBe(HOST_JOB_HOLDINGS[1])
    expect(data['howItWasHeld']).toBe(THE_RUNNERS_WORDS.itsScopeWasNotStopped(unit, THE_RUNNERS_WORDS.exited('systemctl', 1, `Failed to stop ${unit}: Access denied`)))
  })

  it("13f: a job lost while its tool ran in its scope has the scope stopped by the next runner; a scope that had ended, or that cannot be stopped, is said", async () => {
    SYSTEMD.way = 'scope'
    const held = join(runnerFolder, 'taken.json')
    const W = THE_RUNNERS_WORDS
    for (const how of ['stopped', 'had ended', 'cannot be stopped'] as const) {
      SYSTEMD.calls.length = 0
      SYSTEMD.stop = how === 'cannot be stopped' ? 'fails' : 'stops'
      const job = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'stand-in', arguments: { label: 'lost in a scope', count: 1 } })
      expect(job.status, job.text.slice(0, 500)).toBe(201)
      const id = job.body.job.id as string
      expect((await send('POST', '/api/host-jobs/take', THE_OFFICE_KEY_ALONE, {})).status).toBe(200)
      const unit = theScopeFor(id)
      // THE TOOL A RUNNER THAT STOPPED LEFT RUNNING, in its own group, and in the stand-in's scope unless it had ended.
      const tool = spawn('sleep', ['30'], { stdio: 'ignore', detached: true })
      const groupId = Number(tool.pid)
      try {
        if (how !== 'had ended') SYSTEMD.scopes.set(unit, { groupId, graceMs: A_SHORT_GRACE_MS })
        writeFileSync(held, JSON.stringify({ id, workspaceId: 'default', groupId, groupStartedAt: theStartOf(groupId), heldBy: HOST_JOB_HOLDINGS[0], howItWasHeld: W.inItsOwnScope(unit) }), { mode: 0o600 })
        expect(await inASession(() => theRunner()), how).toBe(0)
        expect(theStops(), how).toEqual([{ args: ['--user', 'stop', unit], whileItRan: how !== 'had ended' }])
        const lost = theJobData(id)
        expect(lost['state'], how).toBe('lost')
        const failed = W.exited('systemctl', 1, `Failed to stop ${unit}: Access denied`)
        const what = how === 'stopped' ? W.itsScopeWasStopped : how === 'had ended' ? W.itsScopeHadEnded : W.theLostScopeWasNotStopped(failed, W.itsGroupWasEnded(A_SHORT_GRACE_MS))
        expect(lost['why'], how).toBe(W.aLostJob(W.lostWhileTheToolRanInItsScope(unit, what)))
        expect(lost['heldBy'], how).toBe(how === 'cannot be stopped' ? HOST_JOB_HOLDINGS[1] : HOST_JOB_HOLDINGS[0])
        expect(lost['howItWasHeld'], how).toBe(how === 'cannot be stopped' ? W.itsScopeWasNotStopped(unit, failed) : W.inItsOwnScope(unit))
        // A SCOPE THAT HAD ENDED HELD NOTHING OF THE JOB, so the group with the number written down is left.
        expect(stillThere(groupId), how).toBe(how === 'had ended')
      } finally {
        tool.kill('SIGKILL')
      }
    }
  }, 30_000)

  it('13g: a scope systemd does not know while the tool runs is not taken as stopped; its group is ended, and the job is not shown as held by its scope', async () => {
    SYSTEMD.way = 'scope'
    SYSTEMD.makesTheScope = false
    await aSleeper('a-sleeper-whose-scope-is-not-there')
    const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'a-sleeper-whose-scope-is-not-there', arguments: {} })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const id = asked.body.job.id as string
    const unit = theScopeFor(id)
    const started = Date.now()
    expect(await inASession(() => theRunner())).toBe(0)
    expect(Date.now() - started, 'the job was ended at its limit and not left to finish').toBeLessThan(4000)
    const data = theJobData(id)
    expect(data['state'], JSON.stringify(data).slice(0, 600)).toBe('ended at its time limit')
    expect(theStops(), 'the scope was asked to stop once, while the tool ran').toEqual([{ args: ['--user', 'stop', unit], whileItRan: false }])
    expect(stillThere(thePidIn(data)), 'what the tool started in its group was ended with the group').toBe(false)
    expect(data['heldBy']).toBe(HOST_JOB_HOLDINGS[1])
    expect(data['howItWasHeld']).toBe(THE_RUNNERS_WORDS.itsScopeWasNotStopped(unit, THE_RUNNERS_WORDS.exited('systemctl', 5, `Failed to stop ${unit}: Unit ${unit} not loaded.`)))
  })

  it("13h: a runner given no XDG_RUNTIME_DIR finds the user's own runtime folder, and takes only a folder of the user's, mode 700, that holds the bus; otherwise the job is held by its group and says why", async () => {
    SYSTEMD.way = 'scope'
    const W = THE_RUNNERS_WORDS
    const uid = String(userInfo().uid)
    /** A folder that holds a runtime folder named for this user, as /run/user does, made as `make` makes it. */
    const aPlaceFor = (name: string, make: (mine: string) => void): { folders: string; mine: string } => {
      const folders = join(scratch, name)
      const mine = join(folders, uid)
      mkdirSync(folders)
      make(mine)
      return { folders, mine }
    }
    const aFolderOfMine = (mine: string, mode: number): void => {
      mkdirSync(mine)
      chmodSync(mine, mode)
    }
    // THE BUS IS A REAL SOCKET, listened on here; the stand-in systemd never connects to it.
    const bus = createServer()
    const ours = aPlaceFor('ru-ours', (mine) => aFolderOfMine(mine, 0o700))
    await new Promise<void>((done) => bus.listen(join(ours.mine, 'bus'), done))
    try {
      const notThere = aPlaceFor('ru-not-there', () => {})
      const aLink = aPlaceFor('ru-a-link', (mine) => symlinkSync(ours.mine, mine))
      const open = aPlaceFor('ru-open', (mine) => aFolderOfMine(mine, 0o755))
      const noBus = aPlaceFor('ru-no-bus', (mine) => {
        aFolderOfMine(mine, 0o700)
        writeFileSync(join(mine, 'bus'), '')
      })
      const places: [string, { folders: string; mine: string }, string | null][] = [
        ['its own', ours, null],
        ['not there', notThere, W.runtimeFolderCannotBeRead('ENOENT')],
        ['a link', aLink, W.runtimeFolderIsNotAFolder],
        ['open to others', open, W.runtimeFolderModeIsNot700(0o755)],
        ['no bus', noBus, W.runtimeFolderHoldsNoBus(join(noBus.mine, 'bus'))],
      ]
      for (const [what, { folders, mine }, why] of places) {
        SYSTEMD.calls.length = 0
        const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'stand-in', arguments: { label: what, count: 1 } })
        expect(asked.status, asked.text.slice(0, 500)).toBe(201)
        const id = asked.body.job.id as string
        expect(await inASession(() => theRunner({ runtimeFolders: folders }), {}), what).toBe(0)
        const data = theJobData(id)
        expect(data['state'], `${what}: ${JSON.stringify(data).slice(0, 600)}`).toBe('finished')
        if (why === null) {
          const unit = theScopeFor(id)
          expect(theCalls().map((one) => one.slice(0, 2)), what).toEqual([['systemd-run', '--user'], ['systemd-run', '--user'], ['systemctl', '--user']])
          const [probe, start, stop] = SYSTEMD.calls
          expect(probe?.env, `${what}: the folder found is handed to systemd-run`).toEqual({ PATH: '/usr/bin:/bin', XDG_RUNTIME_DIR: mine })
          expect(start?.env['XDG_RUNTIME_DIR'], what).toBe(mine)
          expect(stop?.env, `${what}: and to systemctl`).toEqual({ PATH: '/usr/bin:/bin', XDG_RUNTIME_DIR: mine })
          expect(data['heldBy'], what).toBe(HOST_JOB_HOLDINGS[0])
          expect(data['howItWasHeld'], what).toBe(W.inItsOwnScope(unit))
        } else {
          expect(theCalls(), `${what}: no scope is tried`).toEqual([])
          expect(data['heldBy'], what).toBe(HOST_JOB_HOLDINGS[1])
          expect(data['howItWasHeld'], what).toBe(maskedForAHostJob(W.byItsGroupOnly(W.noRuntimeFolder(mine, why))).text)
        }
      }
    } finally {
      await new Promise((done) => bus.close(done))
    }
  })

  it('13i: a tool that ends while the stop of its scope at the time limit is on its way is still held by its scope, though systemctl answers that the scope is not loaded', async () => {
    SYSTEMD.way = 'scope'
    SYSTEMD.stop = 'ends first'
    await aSleeper('a-sleeper-that-ends-as-it-is-stopped')
    const asked = await send('POST', '/api/host-jobs', asTheRun(await aRunOf(ASKER)), { tool: 'a-sleeper-that-ends-as-it-is-stopped', arguments: {} })
    expect(asked.status, asked.text.slice(0, 500)).toBe(201)
    const id = asked.body.job.id as string
    const unit = theScopeFor(id)
    expect(await inASession(() => theRunner())).toBe(0)
    const data = theJobData(id)
    expect(data['state'], JSON.stringify(data).slice(0, 600)).toBe('ended at its time limit')
    expect(data['why']).toBe(THE_RUNNERS_WORDS.endedAtItsTimeLimit(1))
    expect(data['signal']).toBe('SIGTERM')
    expect(theStops(), 'the scope was asked to stop once, while the tool ran').toEqual([{ args: ['--user', 'stop', unit], whileItRan: true }])
    expect(stillThere(thePidIn(data)), 'what the tool started ended with it').toBe(false)
    expect(data['heldBy']).toBe(HOST_JOB_HOLDINGS[0])
    expect(data['howItWasHeld']).toBe(THE_RUNNERS_WORDS.inItsOwnScope(unit))
  })
})
