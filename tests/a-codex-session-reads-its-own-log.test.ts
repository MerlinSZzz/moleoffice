// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CODEX SESSION'S OWN LOG IS READ, SO A CODEX AGENT STOPPED BY A LIMIT READS OFFLINE.
 *
 * Criterion M126: two agents cut off by a usage limit should have read offline, and the contacts list
 * still showed them online. Both were codex sessions whose bridges were alive while the sessions
 * behind them had hit a usage limit and stopped, and their records carry no transcript path, so the
 * process reading trusted the bridge and read Online.
 *
 * The report `R57L9B4wnvKh` fixed the second answer: a live process with no readable transcript now
 * reads the honest cannot-read sentence on both doors. The report `TFk8xA0cB_1D` made the codex
 * rollout readable, so a codex session that stopped on a limit reads Offline with the cause. This
 * file proves the log is found and read, that a stop cause at its end overrules any process, and —
 * criterion M126, one rule for both runtimes — that a quiet log with a live process the office can
 * tie to the session reads answering from that process, exactly as a claude-code session does.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE A CODEX LOG IS AND HOW IT IS MATCHED, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Measured on this machine on 12 September 2026 against codex-cli 0.153.4. Codex writes one JSON
 * object per line at
 *
 *   `~/.codex/sessions/<year>/<month>/<day>/rollout-<ISO>-<thread>.jsonl`
 *
 * and a turn that dies leaves its last line as a `task_complete` event whose `payload.error` carries
 * the words a person reads beside the provider's own `codex_error_info`. The codex binary names
 * `usage_limit_exceeded`, `rate_limit_exceeded` and `unauthorized` among its error codes, and those
 * three are the causes a person has to act on. A reset time, when the message carries one, is
 * phrased `try again at <moment>`; claude-code phrases the same fact `resets <moment>`.
 *
 * The bridge records the thread it speaks for in `data.providerSession` and
 * `data.extra.codexBridge.thread`, so the office finds the rollout by the thread id in its name.
 * The fixtures below copy the SHAPE of the two real logs, never their content: the words and the
 * reset time are invented here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 *   (a) a codex session whose rollout ends on a usage-limit line reads Offline at both doors, and
 *       the sentence names the cause, the moment the line was stamped and the reset time;
 *   (b) a codex session whose rollout grew inside the lapse reads answering, and it is the
 *       transcript — not a bridge process — that proves it;
 *   (c) a codex session whose rollout cannot be found reads the cannot-read sentence;
 *   (d) a codex session whose rollout is OLD and whose last word is ordinary work reads answering
 *       from its process when the office can tie a live process to it — a `codex resume <thread>`
 *       process, or the bridge the record names by pid and script — and reads Offline when no
 *       process can be tied to it;
 *   (e) a codex session whose old rollout ENDS on a cause reads Offline with the cause whatever the
 *       tied process says.
 *
 * Two further cases prove the other two causes a person has to act on: a `rate_limit_exceeded` line
 * reads as a quota with its reset time, and an `unauthorized` line reads as a login and invents no
 * reset it was not given. One more case proves a live process the office CANNOT tie to the session
 * is not the session: a registered process row with an old rollout reads Offline, not answering.
 *
 * THE TIE IS READ FROM THE LIVE PROCESS, and the stand-in processes this file starts are Node with
 * the command line shape the real ones have. No codex process is started or stopped; the children
 * are killed when the file ends.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: the ten cases below, all green. Then two mutations of the reading, each restored.
 *
 * MUTATION 1 — TAKE THE CODEX CAUSE SHAPE OUT. In src/config/stopped-run-cause.mjs, `theCauseIn` was
 * changed to `return whatTheCauseWas(theWordsOf(record))`, so a codex `task_complete` line parsed
 * as an error with no words and named no cause. The four cause cases went red — the tied or live
 * process answered green instead, exactly the defect M126 is about — and the six other cases stayed
 * green. The change was put back and the file is byte-identical:
 *
 *   stopped-run-cause.mjs  before 45a351cb898dd1d64e58fd5f01b173400e26379a4315ba05be1d8e92b6bc93f5
 *                          after  45a351cb898dd1d64e58fd5f01b173400e26379a4315ba05be1d8e92b6bc93f5
 *
 * MUTATION 2 — REMOVE THE CODEX PROCESS TIE. In src/config/session-process.mjs,
 * `theCodexProcessTiedTo` was made to return `{ trusted: false }` before reading anything, so a
 * codex session could no longer be tied to a live process. The two tied cases went red — the quiet
 * log read Offline, the defect this change is about — and the other eight stayed green, including
 * the untied-process case and the cause case. The change was put back and both files are
 * byte-identical:
 *
 *   session-process.mjs  before 76cb77e26dc695babc767479b47ad37e729e7dc7dead30bde9a05f9ff8c44f62
 *                        after  76cb77e26dc695babc767479b47ad37e729e7dc7dead30bde9a05f9ff8c44f62
 *   answering.ts         before 8054c501716460e292a93ad90501142678704690779a17b2ece2c14729a43c8c
 *                        after  8054c501716460e292a93ad90501142678704690779a17b2ece2c14729a43c8c
 *
 * The answering.ts hash above was the file at the moment of that proof. Problem `Ga1VZCbpv63Y`
 * changed that file again (the exec worker's `extra.codexCliWorker` bag is read beside
 * `extra.codexBridge`, and the row sentence admits a live row), so the pin now names the changed
 * file:
 *
 *   answering.ts         88bb8a626da11393a7bc74babf81b4570dc91fcb0e31cc3e3be472b080050551
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { HoldOnTheWire } from '../src/shared/handles.ts'
import { ANSWERING_WORD } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'

let t: TestDb
let app: FastifyInstance
let presence: typeof import('../src/server/lib/presence.ts')
let resources: typeof import('../src/server/lib/resources.ts')
let answering: typeof import('../src/server/lib/answering.ts')

/** A home of this file's own, so a fixture rollout is never written under the owner's ~/.codex. */
const home = mkdtempSync(join(tmpdir(), 'mole-office-codex-'))

/** The stand-in processes this file starts, killed when the file is done. No codex is started. */
const started: ChildProcess[] = []

const HUMAN = { type: 'human', id: THE_PERSON } as const
const AS_HUMAN = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Two hours ago: older than the hold's ninety-second lapse and the five-minute run window. */
const LONG_AGO = (): Date => new Date(Date.now() - 2 * 60 * 60 * 1000)

/** The reset time this file's own usage-limit line carries. Invented, not the owner's. */
const THE_RESET = 'Oct 3rd, 2026 9:15 AM'

let made = 0

/**
 * A registered codex agent, so both doors answer about it. It hands back the registry id the office
 * gave the agent, which is not its handle. Sessions, process rows and the presence door use that id.
 */
function anAgent(handle: string): string {
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: handle,
    data: { handle, runtime: 'codex', state: 'active' },
    actor: HUMAN,
  })
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent row for ${handle}`).toBeDefined()
  return row!.id
}

/**
 * A rollout line of the shape codex writes, with this instant. An ordinary message, not an error:
 * it makes the last line real and dated without naming any cause.
 */
function anOrdinaryLine(at: Date): Record<string, unknown> {
  return {
    timestamp: at.toISOString(),
    ordinal: made + 1,
    type: 'response_item',
    payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'the answer' }] },
  }
}

/**
 * The measured codex error shape: a `task_complete` event whose `payload.error` carries the words
 * and the provider's own code. The words and the reset time are this file's, not the owner's.
 */
function aLimitLine(at: Date): Record<string, unknown> {
  return {
    timestamp: at.toISOString(),
    ordinal: 24058,
    type: 'event_msg',
    payload: {
      type: 'task_complete',
      turn_id: '01a09122-75bb-7013-9470-ec1c99ac2b99',
      last_agent_message: null,
      error: {
        message: `You've hit your usage limit. Visit https://example.invalid/usage to purchase more credits or try again at ${THE_RESET}.`,
        codex_error_info: 'usage_limit_exceeded',
      },
      started_at: 1789141349,
      completed_at: 1789142665,
    },
  }
}

/** A codex `task_complete` error line with another of the three codes a person has to act on. */
function aCodexErrorLine(at: Date, code: string, message: string): Record<string, unknown> {
  return {
    timestamp: at.toISOString(),
    ordinal: 24058,
    type: 'event_msg',
    payload: {
      type: 'task_complete',
      turn_id: '01a09122-75bb-7013-9470-ec1c99ac2b99',
      last_agent_message: null,
      error: { message, codex_error_info: code },
      started_at: 1789141349,
      completed_at: 1789142665,
    },
  }
}

/** Write a rollout for one thread in the measured directory shape, and return its path. */
function aRollout(thread: string, lines: Record<string, unknown>[]): string {
  const dir = join(home, '.codex', 'sessions', '2026', '09', '12')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `rollout-2026-09-12T10-00-00-${thread}.jsonl`)
  writeFileSync(path, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`)
  return path
}

/** A codex session record carrying the thread its bridge speaks for, and no transcript stamp. */
function aCodexSession(
  agentId: string,
  thread: string,
  /**
   * The bridge the record names, when a case is about the bridge tie. The default is the test
   * runner's own pid with a script path that is not on its command line, so a case that says nothing
   * about the bridge is not accidentally tied by it.
   */
  bridge?: { pid: number; script: string },
): string {
  made += 1
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: `codex session ${String(made)}`,
    data: {
      state: 'running',
      runtime: 'codex',
      providerSession: thread,
      ranAs: [{ workspaceId: 'default', agentId }],
      // HELD OLD ON PURPOSE, like the M126 cases: a recent `lastOutputAt` would turn the dot green
      // by the run-output input and hide whether the transcript reading answered.
      lastOutputAt: localStamp(LONG_AGO()),
      extra: {
        codexBridge: {
          pid: bridge?.pid ?? process.pid,
          pgid: bridge?.pid ?? process.pid,
          machine: 'a-machine',
          script: bridge?.script ?? '/tmp/does-not-need-to-exist/bridge.py',
          state: 'running',
          thread,
          leftRunningIntentionally: true,
        },
      },
    },
    actor: HUMAN,
  }).id
}

/**
 * A codex session record carrying the EXEC WORKER's own bag, `extra.codexCliWorker`, and no
 * `extra.codexBridge`.
 *
 * The exec worker writes a pid, a pgid, a thread, a state directory and a state, and no `script`.
 * `providerSession` is optional so a case can prove the thread was read from the bag itself rather
 * than from the record's own field.
 */
function anExecCodexSession(
  agentId: string,
  thread: string,
  options: { providerSession?: boolean; pid?: number } = {},
): string {
  made += 1
  const data: Record<string, unknown> = {
    state: 'running',
    runtime: 'codex',
    ranAs: [{ workspaceId: 'default', agentId }],
    lastOutputAt: localStamp(LONG_AGO()),
    extra: {
      codexCliWorker: {
        pid: options.pid ?? process.pid,
        pgid: options.pid ?? process.pid,
        thread,
        stateDirectory: '/tmp/mole-office-fixture-state',
        state: 'running',
        transport: 'serial codex exec resume',
        idleModelProcess: false,
        leftRunningIntentionally: true,
      },
    },
  }
  if (options.providerSession !== false) data['providerSession'] = thread
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: `exec codex session ${String(made)}`,
    data,
    actor: HUMAN,
  }).id
}

/**
 * A LIVE PROCESS WHOSE COMMAND LINE CARRIES THE THREAD, in the shape an exec worker has.
 *
 * It is Node, not the codex program: the office's `/proc` walk for a `codex resume <thread>` process
 * does not find it, so the only tie that can reach it is the bridge pid the exec worker names. The
 * child is killed when the file ends.
 */
async function aWorkerProcessNaming(thread: string): Promise<number> {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', thread], { stdio: 'ignore' })
  started.push(child)
  expect(child.pid, 'the stand-in exec worker did not start').toBeTypeOf('number')
  await theCommandLineToAppear(child.pid ?? 0, thread)
  return child.pid ?? 0
}

/**
 * Wait until a just-started child's own command line is visible, so a /proc read is not racing exec.
 *
 * A child between fork and exec still carries its parent's command line. The office's tie reader
 * reads /proc once, so the fixture waits for the real one to appear before a case asks for a reading.
 */
async function theCommandLineToAppear(pid: number, wanted: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    try {
      const line = readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8').split('\0').join(' ')
      if (line.includes(wanted)) return
    } catch {
      // The child has not appeared yet, or has already gone. Either is retried until the bound.
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`the stand-in process ${String(pid)} never showed ${wanted} on its command line`)
}

/**
 * A LIVE PROCESS TIED TO ONE THREAD, in the measured shape `codex resume <thread>`.
 *
 * The office finds a codex session's process by the thread in its arguments, so this starts a real
 * process this machine shows in /proc with that shape. It is Node with its own name changed, not
 * the codex program: this file starts no codex process, and the child is killed when the file ends.
 */
async function aCodexProcessTiedTo(thread: string): Promise<number> {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', 'resume', thread], {
    argv0: 'codex',
    stdio: 'ignore',
  })
  started.push(child)
  expect(child.pid, 'the stand-in codex process did not start').toBeTypeOf('number')
  await theCommandLineToAppear(child.pid ?? 0, thread)
  return child.pid ?? 0
}

/**
 * A LIVE PROCESS WHOSE COMMAND LINE NAMES A SCRIPT, for the bridge tie a codex record carries.
 *
 * The record says its bridge is this pid running this script; a real process whose command line names
 * that script is what makes the tie true. The script need not exist: the office reads the process's
 * command line, not the file.
 */
async function aBridgeProcessRunning(script: string): Promise<number> {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', script], { stdio: 'ignore' })
  started.push(child)
  expect(child.pid, 'the stand-in bridge process did not start').toBeTypeOf('number')
  await theCommandLineToAppear(child.pid ?? 0, script)
  return child.pid ?? 0
}

/** The bridge's live process row, registered by the agent, as the real records write one. */
function registerTheBridge(session: string, agentId: string): void {
  resources.registerResource({
    workspaceId: 'default',
    sessionRecordId: session,
    type: 'process',
    key: String(process.pid),
    actor: { type: 'agent', id: agentId },
  })
}

/** Take the handle for this session, through the door a waiter uses. */
async function hold(handle: string, session: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${handle}/hold`,
    headers: AS_HUMAN,
    payload: { session, machine: 'a-machine', runtime: 'codex' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

interface Dot {
  colour: string
  word: string
  from: string | null
  says: string
}

/** What the presence door says about one agent. */
async function presenceDoor(agentId: string): Promise<Dot> {
  const reply = await app.inject({ method: 'GET', url: '/api/presence', headers: AS_HUMAN })
  expect(reply.statusCode, reply.body).toBe(200)
  const found = (reply.json() as { presence: { who: { kind: string; id: string } }[] }).presence.find(
    (one) => one.who.kind === 'agent' && one.who.id === agentId,
  )
  expect(found, `the presence door says nothing about ${agentId}`).toBeDefined()
  return found as unknown as Dot
}

interface Answering {
  how: string
  session: string | null
  says: string
}

/** What the handle door answers for one agent. */
async function handleDoor(handle: string): Promise<Answering> {
  const reply = await app.inject({ method: 'GET', url: `/api/handles/${handle}`, headers: AS_HUMAN })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { answering: Answering }).answering
}

beforeAll(async () => {
  // THE HOME IS THIS FILE'S OWN, SET BEFORE ANY MODULE READS IT. `theHomeDirectory()` calls
  // `homedir()` on every read, so a codex session's rollout is looked for under this directory and
  // never under the owner's own ~/.codex.
  process.env.HOME = home
  t = await freshDb()
  presence = await import('../src/server/lib/presence.ts')
  resources = await import('../src/server/lib/resources.ts')
  answering = await import('../src/server/lib/answering.ts')
  app = (await apiApp()).app
  await app.ready()
})

afterAll(async () => {
  // THE STAND-IN PROCESSES ARE THIS FILE'S OWN AND ARE NEVER LEFT RUNNING. They are Node, not codex.
  for (const child of started) child.kill('SIGKILL')
  await app.close()
  t.close()
  rmSync(home, { recursive: true, force: true })
})

// ============================================================ (a) a rollout that ends on a limit

describe('a codex session whose rollout ends on a usage limit', () => {
  it('reads Offline at both doors, naming the cause, the moment and the reset time', async () => {
    const agentId = anAgent('codex-limit')
    const thread = '01a0c0de-0000-7000-8000-000000000001'
    const hit = new Date('2026-09-12T08:12:00.000Z')
    const path = aRollout(thread, [anOrdinaryLine(new Date(hit.getTime() - 60_000)), aLimitLine(hit)])
    const session = aCodexSession(agentId, thread)
    // THE BRIDGE IS ALIVE, EXACTLY THE SHAPE ZHIXU AND THE OTHER AGENT HAVE. Without the limit reading the
    // process row would answer Online; the rollout's own last line is what overrules it.
    registerTheBridge(session, agentId)

    const dot = await presenceDoor(agentId)
    expect(dot.colour, `read ${dot.colour} from ${String(dot.from)}: ${path}`).toBe('grey')
    expect(dot.word).toBe('Offline')
    expect(dot.from).toBeNull()
    expect(dot.says).toContain('session limit')
    expect(dot.says).toContain(`resets ${THE_RESET}`)
    expect(dot.says).toContain(localStamp(hit))
    expect(dot.says).toContain("You've hit your usage limit")

    // AND THE HANDLE DOOR SAYS THE SAME, because both doors reach the one reading.
    await hold('codex-limit', session)
    const said = await handleDoor('codex-limit')
    expect(said.how).toBe('nobody')
    expect(said.session).toBeNull()
    expect(said.says).toContain('session limit')
    expect(said.says).toContain(`resets ${THE_RESET}`)
  })
})

// ============================================================ the other two causes a person acts on

describe('the other two codex causes a person must act on', () => {
  it('reads a rate limit as a quota, with the reset the line carries', async () => {
    const agentId = anAgent('codex-rate')
    const thread = '01a0c0de-0000-7000-8000-000000000003'
    const hit = new Date('2026-09-12T08:20:00.000Z')
    aRollout(thread, [aCodexErrorLine(hit, 'rate_limit_exceeded', `Rate limit reached. Try again at ${THE_RESET}.`)])
    const session = aCodexSession(agentId, thread)
    await hold('codex-rate', session)

    const said = await handleDoor('codex-rate')
    expect(said.how).toBe('nobody')
    expect(said.says).toContain('a quota')
    expect(said.says).toContain(`resets ${THE_RESET}`)
  })

  it('reads an authentication failure as a login, and invents no reset time it was not given', async () => {
    const agentId = anAgent('codex-login')
    const thread = '01a0c0de-0000-7000-8000-000000000004'
    const hit = new Date('2026-09-12T08:30:00.000Z')
    aRollout(thread, [aCodexErrorLine(hit, 'unauthorized', 'Unauthorized: run codex login to authenticate.')])
    const session = aCodexSession(agentId, thread)
    await hold('codex-login', session)

    const said = await handleDoor('codex-login')
    expect(said.how).toBe('nobody')
    expect(said.says).toContain('a login')
    expect(said.says).not.toContain('resets')
  })
})

// ============================================================ (b) a rollout written inside the lapse

describe('a codex session whose rollout grew inside the lapse', () => {
  it('reads answering, and it is the transcript that proves it rather than a process', async () => {
    const agentId = anAgent('codex-fresh')
    const thread = '01a0c0de-0000-7000-8000-000000000002'
    aRollout(thread, [anOrdinaryLine(new Date())])
    const session = aCodexSession(agentId, thread)
    // NO PROCESS ROW AT ALL. The only thing that can answer is the rollout itself.
    await hold('codex-fresh', session)

    // THE ONE READING NAMES THE TRANSCRIPT AS WHAT PROVED IT. A reading that trusted a process
    // would have nothing to trust here, so this is the log being read and not a bridge.
    const reading = answering.theSessionBehindTheHold({ session } as unknown as HoldOnTheWire, 'default', new Date())
    expect(reading.answering, reading.says ?? 'no sentence').toBe(true)
    expect(reading.from).toBe('its transcript')

    const said = await handleDoor('codex-fresh')
    expect(said.how).toBe('a live session')
    expect(said.session).toBe(session)

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('green')
  })

  it('reads Offline but admits the live resource row it cannot tie to the session', async () => {
    const agentId = anAgent('codex-stale')
    const thread = '01a0c0de-0000-7000-8000-000000000005'
    aRollout(thread, [anOrdinaryLine(LONG_AGO())])
    const session = aCodexSession(agentId, thread)
    registerTheBridge(session, agentId)

    // THE PROCESS IS ALIVE AND THE ROLLOUT IS TWO HOURS OLD. The row alone is the bridge, and the
    // bridge is not the session: since M126 a live process answers for a quiet log only when the
    // office can tie it here — a codex process naming this thread, or the bridge this record names
    // really running. This fixture's pid is the test runner and names neither, so the rollout's own
    // age is what answers, as M126b made a bridge with no log answer.
    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('grey')
    expect(dot.word).toBe('Offline')
    expect(dot.from).toBeNull()
    // AND THE SENTENCE ADMITS THE ROW IS ALIVE. Problem `Ga1VZCbpv63Y`: the reading said "no process
    // resource row for it reads alive" while the resource page showed one, so the office contradicted
    // itself. A `nobody` answer is lawful here; denying the live row is not.
    expect(dot.says).toContain('a process resource row for it reads alive')
    expect(dot.says).not.toContain('no process resource row for it reads alive')
    expect(dot.says).toContain('last grew')
    expect(dot.says).toContain('nothing shows it is still answering')
  })
})

// ============================================================ (b2) a quiet log with a tied process

/**
 * A CODEX SESSION WITH A QUIET LOG AND A LIVE PROCESS TIED TO IT NOW READS ANSWERING. Criterion
 * M126: one rule for a claude-code session and a codex session alike. A claude-code session whose
 * recorded process is alive reads answering though its transcript is old; a codex session carries
 * no recorded pid, so its process is tied by the thread in a `codex resume <thread>` command line,
 * or by the bridge the record itself names.
 *
 * The stand-in processes below are Node with the command-line shape the real one has. No codex
 * process is started or stopped; they are killed when this file ends.
 */
describe('a codex session whose quiet log has a live process tied to it', () => {
  it('reads answering from its process when a live codex process names its thread', async () => {
    const agentId = anAgent('codex-tied')
    const thread = '01a0c0de-0000-7000-8000-000000000010'
    aRollout(thread, [anOrdinaryLine(LONG_AGO())])
    const session = aCodexSession(agentId, thread)
    const pid = await aCodexProcessTiedTo(thread)

    // THE ROLLOUT ITSELF WOULD READ OFFLINE. The thread in the live process's arguments is what has
    // to carry the reading, and the sentence says the log is quiet and names the process.
    const reading = answering.theSessionBehindTheHold({ session } as unknown as HoldOnTheWire, 'default', new Date())
    expect(reading.answering, reading.says ?? 'no sentence').toBe(true)
    expect(reading.from).toBe('its process')
    expect(reading.says ?? '').toContain('quiet since')
    expect(reading.says ?? '').toContain('seconds ago')
    expect(reading.says ?? '').toContain(String(pid))
    expect(reading.says ?? '').toContain('so it is answering')

    await hold('codex-tied', session)
    const said = await handleDoor('codex-tied')
    expect(said.how).toBe('a live session')
    expect(said.session).toBe(session)

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('green')
    expect(dot.word).toBe(ANSWERING_WORD)
    expect(dot.from).toBe('a session answering as it')
  })

  it('reads answering from the bridge the record names, by its pid and script', async () => {
    const agentId = anAgent('codex-bridge-tied')
    const thread = '01a0c0de-0000-7000-8000-000000000013'
    aRollout(thread, [anOrdinaryLine(LONG_AGO())])
    const script = '/tmp/mole-office-fixture-bridge.py'
    const pid = await aBridgeProcessRunning(script)
    const session = aCodexSession(agentId, thread, { pid, script })

    const reading = answering.theSessionBehindTheHold({ session } as unknown as HoldOnTheWire, 'default', new Date())
    expect(reading.answering, reading.says ?? 'no sentence').toBe(true)
    expect(reading.from).toBe('its process')
    expect(reading.says ?? '').toContain('quiet since')
    expect(reading.says ?? '').toContain(`bridge process ${String(pid)}`)
  })

  it('reads Offline when no live process is tied to it', async () => {
    const agentId = anAgent('codex-untied')
    const thread = '01a0c0de-0000-7000-8000-000000000011'
    aRollout(thread, [anOrdinaryLine(LONG_AGO())])
    const session = aCodexSession(agentId, thread)

    const reading = answering.theSessionBehindTheHold({ session } as unknown as HoldOnTheWire, 'default', new Date())
    expect(reading.answering).toBe(false)
    expect(reading.from).toBeNull()
    expect(reading.says ?? '').toContain('last grew')
    expect(reading.says ?? '').toContain('nothing shows it is still answering')

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('grey')
    expect(dot.word).toBe('Offline')
    expect(dot.from).toBeNull()
  })

  it('reads Offline with the cause when the quiet log ends on a stop cause, whatever the process says', async () => {
    const agentId = anAgent('codex-tied-limit')
    const thread = '01a0c0de-0000-7000-8000-000000000012'
    const hit = new Date('2026-09-12T08:40:00.000Z')
    aRollout(thread, [anOrdinaryLine(new Date(hit.getTime() - 60_000)), aLimitLine(hit)])
    const session = aCodexSession(agentId, thread)
    await aCodexProcessTiedTo(thread)

    // THE PROCESS IS TIED AND ALIVE, AND THE ROLLOUT ENDS ON A USAGE LIMIT. The cause is the last
    // word, so it overrules the process: the session is not answering and the sentence names the
    // cause and the reset time. Criterion M126's first rule.
    const reading = answering.theSessionBehindTheHold({ session } as unknown as HoldOnTheWire, 'default', new Date())
    expect(reading.answering).toBe(false)
    expect(reading.from).toBeNull()
    expect(reading.says ?? '').toContain('session limit')
    expect(reading.says ?? '').toContain(`resets ${THE_RESET}`)

    await hold('codex-tied-limit', session)
    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('grey')
    expect(dot.word).toBe('Offline')
    expect(dot.from).toBeNull()
    expect(dot.says).toContain('session limit')
  })
})

// ============================================================ (b3) the exec worker's own bag

/**
 * THE EXEC WORKER WRITES ITS OWN KEY, `extra.codexCliWorker`, AND IT CARRIES NO SCRIPT.
 *
 * Measured on the two records in the diagnosis of problem `Ga1VZCbpv63Y`: each session's
 * `extra.codexCliWorker` carries a pid, a pgid, a thread, a state directory and a state, and no
 * `script`. An exec worker runs `codex exec resume <thread>`, so the thread on its process is what
 * ties it to the session. The office read only `extra.codexBridge`, so both sessions read Offline
 * while a live process and a live resource row plainly said otherwise.
 *
 * The first case proves the THREAD is read from the bag: the thread appears nowhere else, and the
 * office can only find the rollout if it read the exec worker's key. The second proves the PID is
 * read: the live process is not a codex program, so the office's `/proc` walk for one cannot find
 * it, and the only tie is the pid the exec worker named.
 */
describe("a codex session whose bridge is the exec worker's own bag", () => {
  it('finds the rollout by the thread the exec worker writes, with no providerSession', async () => {
    const agentId = anAgent('exec-worker-thread')
    const thread = '01a0c0de-0000-7000-8000-000000000020'
    aRollout(thread, [anOrdinaryLine(new Date())])
    const session = anExecCodexSession(agentId, thread, { providerSession: false })

    // THE ROLLOUT IS FRESH, SO THE TRANSCRIPT IS WHAT ANSWERS — but only if the thread was read.
    // `extra.codexCliWorker.thread` is the only place it appears: no `providerSession`, no
    // `codexBridge`, and no recorded pid.
    const reading = answering.theSessionBehindTheHold({ session } as unknown as HoldOnTheWire, 'default', new Date())
    expect(reading.answering, reading.says ?? 'no sentence').toBe(true)
    expect(reading.from).toBe('its transcript')

    await hold('exec-worker-thread', session)
    const said = await handleDoor('exec-worker-thread')
    expect(said.how).toBe('a live session')
    expect(said.session).toBe(session)
  })

  it('ties a live process by the pid the exec worker writes, when the thread is on its command line', async () => {
    const agentId = anAgent('exec-worker-pid')
    const thread = '01a0c0de-0000-7000-8000-000000000021'
    aRollout(thread, [anOrdinaryLine(LONG_AGO())])
    // A LIVE PROCESS THAT IS NOT A CODEX PROGRAM, so the only tie can be the bridge pid the exec
    // worker names. Its command line carries the thread, exactly as `codex exec resume <thread>` does.
    const pid = await aWorkerProcessNaming(thread)
    const session = anExecCodexSession(agentId, thread, { pid })

    const reading = answering.theSessionBehindTheHold({ session } as unknown as HoldOnTheWire, 'default', new Date())
    expect(reading.answering, reading.says ?? 'no sentence').toBe(true)
    expect(reading.from).toBe('its process')
    expect(reading.says ?? '').toContain(String(pid))

    await hold('exec-worker-pid', session)
    const said = await handleDoor('exec-worker-pid')
    expect(said.how).toBe('a live session')
    expect(said.session).toBe(session)

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('green')
  })
})

// ============================================================ (c) a rollout that cannot be found

describe('a codex session whose rollout cannot be found', () => {
  it('reads the cannot-read sentence, and never invents a cause', async () => {
    const agentId = anAgent('codex-nolog')
    // A THREAD NO FILE ON THIS MACHINE NAMES, which is the absence M126b already handled.
    const thread = '01a0c0de-0000-7000-8000-0000000000ff'
    const session = aCodexSession(agentId, thread)
    registerTheBridge(session, agentId)

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('grey')
    expect(dot.word).toBe('Offline')
    expect(dot.from).toBeNull()
    expect(dot.says).toContain('no transcript was recorded for it')
    expect(dot.says).toContain('could not be read')
  })
})
