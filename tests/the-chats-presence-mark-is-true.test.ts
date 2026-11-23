// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * M106 — THE CHAT'S PRESENCE MARK IS TRUE.
 *
 * design/messages/ACCEPTANCE.md: the secretary still showed online long after it stopped on a usage
 * limit, and in between it went online and back to offline, while it was offline all along. Online means a
 * session is answering and can take a message now. A handle held by a waiter whose session is gone
 * reads offline (problem `DyEIJyDCG01X`). The mark does not flicker: a change is drawn only when
 * the office's answer changes.
 *
 * WHAT THIS FILE PROVES, driven through the doors a caller drives:
 *
 *   (a) A hold whose heartbeat is fresh, whose session has no process on record and whose transcript was
 *       last written longer ago than the hold's window, reads answering on its hold at both doors, and the
 *       sentence beside the dot names the old transcript. So does a hold whose transcript cannot be read,
 *       and its sentence says so. While a hold beats it is the answer, and only a sign the office reads
 *       turns it to not answering; an old transcript with no recorded process is not such a sign.
 *   (b) A hold whose session really is answering — its transcript grew just now, or a process
 *       resource row for it reads alive — reads online at both doors.
 *   (b2) A session waiting in its terminal: its record names its own process, and it reads online
 *       though its transcript is two hours old. A recorded process that is not running reads
 *       offline and the sentence names the pid. A pid that is running but whose start time does
 *       not match what was recorded is not trusted either: it is not shown to have ended, so the
 *       beating hold stands, and the sentence beside the dot names the pid it could not trust.
 *   (c) Ten presence reads of one agent on one fixed clock, with no fact changing, give one word.
 *
 * THE WINDOW IS THE HOLD'S OWN. `theSessionBehindTheHold` compares the transcript against
 * `handleLapsesAfterSeconds()`, the same window `stateOf` uses for the beat, so there is no second
 * window to drift away from the first.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: the eight cases below, all green.
 *
 * MUTATION 1 — READ THE HEARTBEAT ALONE (the old code). In src/server/lib/worker.ts, inside
 * `whoIsAnsweringAs`, `if (behind.answering)` was changed to `if (true)`, so a fresh hold answered
 * "a live session" without asking the session anything. Both killed-session cases (a) went red;
 * the answering cases (b) and the one-word case (c) stayed green. The change was put back.
 *
 * MUTATION 2 — DROP THE TRANSCRIPT READING. In src/server/lib/answering.ts, the quiet window was
 * written as `quiet = lapse + 1`, so a transcript could never answer. The transcript-answering case
 * (b) and the one-word case (c) went red; the killed cases (a) and the live-process case of (b)
 * stayed green. The change was put back.
 *
 * MUTATION 3 — A SECOND CLOCK. In src/server/lib/answering.ts, `now.getTime()` was replaced with
 * `Date.now()` in the quiet-window comparison, so the reading ignored the caller's instant. Case
 * (c), which fixes the clock 30 seconds after the transcript, went red; (a) and (b) stayed green.
 * The change was put back.
 *
 * MUTATION 4 — DROP THE PID READING. In src/server/lib/answering.ts, `if (itsProcess.trusted)` was
 * changed to `if (false)`. The process-answering case (b2) went red; the other seven stayed green.
 * The change was put back.
 *
 * MUTATION 5 — DROP THE START-TIME MATCH. In src/config/session-process.mjs, the
 * `localStampOf(started) !== pidStartedAt` term was removed from the condition in
 * `theRecordedProcess`. The reused-pid case (b2) went red; the other seven stayed green. The
 * change was put back.
 *
 * The control run was repeated after each restore, all green.
 *
 * ---------------------------------------------------------------------------------------
 * M126 — A SESSION CUT OFF BY A LIMIT
 * ---------------------------------------------------------------------------------------
 *
 * design/messages/ACCEPTANCE.md M126: two agents cut off by a usage limit should read offline, but
 * the contacts still showed them online. Both were codex sessions whose bridges were alive while
 * the sessions behind them had stopped on a usage limit, and their records carry no transcript
 * path, so M106's process reading trusted the bridge. Three cases are added:
 *
 *   (a) A session whose own recorded process is alive and trusted, and whose transcript's LAST line
 *       is a rate_limit error, reads offline at both doors; the sentence names the session limit,
 *       the reset time the line carries and the local moment it was stamped.
 *   (b) A session with a live bridge process registered against it and NO transcript path on record,
 *       while its hold beats, reads answering on its hold, and the sentence beside the dot says no
 *       transcript was recorded. This is the codex shape. Nothing read shows it stopped, so the hold
 *       stands; with no hold, the same facts still read not answering (M126b below).
 *   (c) A session whose transcript carries a limit line with ordinary activity after it reads
 *       online, because the cause is no longer the last word.
 *
 * M126 MUTATION 1 — DROP THE CAUSE READING. In src/server/lib/answering.ts, the cause branch was
 * made unreachable (`&& false`). Case (a) went red — the trusted process answered instead — and
 * the other ten stayed green. The change was put back.
 *
 * M126 MUTATION 2 — TRUST THE PROCESS ALONE. In src/server/lib/answering.ts, the no-transcript
 * branch was made unreachable (`stamp === null && false`), so the live bridge process answered.
 * Case (b) went red; the other ten stayed green. The change was put back.
 *
 * M126 MUTATION 3 — FIND THE NEWEST ERROR INSTEAD OF THE LAST WORD. In
 * src/config/stopped-run-cause.mjs, `theStopCauseAtTheEndOfTheTranscript` was changed to `continue`
 * past non-error lines, which is `theStopCauseInTheTranscript`'s behavior. Case (c) went red; the
 * other ten stayed green. The change was put back.
 *
 * CONTROL AFTER EACH RESTORE: all eleven cases green.
 *
 * THE MUTATION NOTES IN THIS FILE WERE RUN BEFORE 23 NOVEMBER 2026, when the hold became the base answer
 * for every tool. They are kept as they were and were not run again against the cases as they now read.
 *
 * ---------------------------------------------------------------------------------------
 * M126b — A LIVE PROCESS WITH NO HANDLE
 * ---------------------------------------------------------------------------------------
 *
 * The process-row path worked the same fact out for itself: `participantPresence` answered Online
 * from a live resource row alone, so one agent — the same codex bridge, no hold — read Online while
 * zhixu read Offline. The judgement now lives once, in `theReadingOf` in answering.ts, and both
 * doors call it. Two cases are added:
 *
 *   (a) an agent with a live process row, no transcript and no hold reads not answering, and says it
 *       could not read whether the session answers; one that holds a beating handle with the same facts
 *       reads answering on its hold, and its sentence names the same missing transcript;
 *   (b) the same agent with a transcript whose last line is a limit reads Offline with the cause.
 *
 * M126b MUTATION — PUT THE OLD PROCESS-ROW ANSWER BACK. In src/server/lib/presence.ts, the
 * live-process branch was made to answer Online from the row alone again, by making its condition
 * true whenever a live row was found. Both new cases went red — the free agent read green — and the
 * other eleven stayed green. The change was put back and the file is byte-identical:
 *
 *   presence.ts  before 050b33ad7c0143a9fc2660f96a0bd9f80d314812794ad2527f74317c558dd8ff
 *                after  050b33ad7c0143a9fc2660f96a0bd9f80d314812794ad2527f74317c558dd8ff
 *   answering.ts before 0c720f483831cc1c01e95093bee3233234265ef64ccb1b4d0d277addb0b4e620
 *
 * CONTROL AFTER THE RESTORE: all thirteen cases green.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

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

const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-m106-'))

const HUMAN = { type: 'human', id: THE_PERSON } as const
const AS_HUMAN = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Two hours ago: older than the hold's lapse window and older than the five-minute run window. */
const LONG_AGO = (): Date => new Date(Date.now() - 2 * 60 * 60 * 1000)

let made = 0

/**
 * A registered agent, so both doors answer about it. Returns its registry id. The registry gives an
 * agent an id of its own, not its handle, so the handle door is asked by handle and the presence door
 * by this id.
 */
function anAgent(handle: string): string {
  const record = t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: handle,
    data: { handle, runtime: 'claude-code', state: 'active' },
    actor: HUMAN,
  })
  const row = t.client.sqlite.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(record.id) as
    | { id: string }
    | undefined
  expect(row, `no registry row was made for ${handle}`).toBeDefined()
  return (row as { id: string }).id
}

/**
 * A claude-code transcript whose last real line carries this instant, or no clock at all.
 *
 * A timestamp of `null` writes a line with no clock, which makes the file's own modification time
 * the reading — the fallback the adapter uses for a log that carries none.
 */
function aTranscript(at: Date | null): string {
  made += 1
  const path = join(transcripts, `session-${String(made)}.jsonl`)
  const line: Record<string, unknown> = {
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'the answer' }] },
  }
  if (at !== null) line['timestamp'] = at.toISOString()
  writeFileSync(path, `${JSON.stringify(line)}\n`)
  return path
}

/** A session record for this agent, with a discovery stamp pointing at a transcript. */
function aSessionFor(
  agentId: string,
  logPath: string,
  /**
   * THE SESSION'S OWN PROCESS, when this case is about it. The hook writes these three fields
   * beside the conversation; a record with none of them is the ordinary case and is left as it was.
   */
  itsProcess?: { pid: number; pidStartedAt: string; pidCommand: string },
): string {
  made += 1
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: `M106 session ${String(made)}`,
    data: {
      state: 'running',
      runtime: 'claude-code',
      // THE RUN-OUTPUT INPUT IS HELD OLD ON PURPOSE. It is the weakest input, and a recent
      // `lastOutputAt` would turn the dot green by itself, hiding whether the hold's session
      // reading answered. The only green in the answering cases below is the hold's own reading.
      ranAs: [{ workspaceId: 'default', agentId }],
      lastOutputAt: localStamp(LONG_AGO()),
      extra: {
        discovered: {
          tool: 'claude-code',
          externalId: `m106-${String(made)}`,
          logPath,
          resumeCommand: null,
          startedAt: null,
          entryPoint: null,
          ...(itsProcess === undefined ? {} : itsProcess),
        },
      },
    },
    actor: HUMAN,
  }).id
}

/**
 * The command line of a process, its NULs as spaces, exactly as the office reads it.
 *
 * READ HERE FROM THE MACHINE, not from the code under test, so a reading that returned the wrong
 * process's command line could not pass by using the same wrong reader.
 */
function theCommandLineOf(pid: number): string {
  return readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8').split('\0').join(' ').trim()
}

/**
 * A claude-code transcript whose LAST real line is a limit error, in the shape measured on this
 * machine: a synthetic assistant line carrying `error: rate_limit`, HTTP 429 and the provider's own
 * words with the reset time. `later` appends one ordinary line after it, which is the activity that
 * separates a session that stopped from one that went on.
 */
function aTranscriptEndingInALimit(hitAt: Date, options: { later?: Date } = {}): string {
  made += 1
  const path = join(transcripts, `session-${String(made)}.jsonl`)
  const lines = [
    JSON.stringify({
      type: 'assistant',
      timestamp: hitAt.toISOString(),
      error: 'rate_limit',
      isApiErrorMessage: true,
      apiErrorStatus: 429,
      message: {
        model: '<synthetic>',
        role: 'assistant',
        content: [{ type: 'text', text: "You've hit your session limit · resets 7:10pm (Europe/London)" }],
      },
    }),
  ]
  if (options.later !== undefined) {
    lines.push(
      JSON.stringify({
        type: 'assistant',
        timestamp: options.later.toISOString(),
        message: { role: 'assistant', content: [{ type: 'text', text: 'and then the session went on working' }] },
      }),
    )
  }
  writeFileSync(path, `${lines.join('\n')}\n`)
  return path
}

/**
 * A session record with NO discovery stamp at all, which is the shape the two codex records have:
 * a runtime, a provider session id and a bridge process, and no `extra.discovered`, so the office
 * has no transcript path for it. The bridge process is registered separately by the case.
 */
function aSessionWithNoTranscript(agentId: string): string {
  made += 1
  const thread = '01a08000-0000-7000-8000-000000000000'
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: `M126 codex session ${String(made)}`,
    data: {
      state: 'running',
      runtime: 'codex',
      providerSession: thread,
      ranAs: [{ workspaceId: 'default', agentId }],
      lastOutputAt: localStamp(LONG_AGO()),
      extra: {
        codexBridge: {
          pid: process.pid,
          pgid: process.pid,
          machine: 'a-machine',
          script: '/tmp/does-not-need-to-exist/bridge.py',
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
 * The start time of a process, in the office's own stamp shape, from `ps`.
 *
 * `ps` rather than the code under test's `/proc` arithmetic, for the same reason: this case is
 * about a start time that has to be the TRUE one, and a reader that got it wrong could not vouch
 * for itself.
 */
function theStartStampOf(pid: number): string {
  const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim()
  return localStamp(new Date(out))
}

/**
 * THE TEST'S OWN PROCESS MADE TO NAME THE CLAUDE PROGRAM, and put back.
 *
 * The office trusts a recorded pid only when the live command line still names the claude program.
 * A test runner's command line does not, so this case gives it one: Node rewrites the process's own
 * command line when `process.title` is set, and the office reads exactly that. The original title
 * is put back after every test, so no other case inherits it.
 */
const ORIGINAL_TITLE = process.title
function nameThisProcessClaude(): void {
  process.title = 'claude'
}

/** Take the handle for this session, through the door a waiter uses. */
async function hold(handle: string, session: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${handle}/hold`,
    headers: AS_HUMAN,
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
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

beforeAll(async () => {
  t = await freshDb()
  presence = await import('../src/server/lib/presence.ts')
  resources = await import('../src/server/lib/resources.ts')
  answering = await import('../src/server/lib/answering.ts')
  app = (await apiApp()).app
  await app.ready()
})

afterEach(() => {
  // THE TITLE IS PUT BACK EVEN WHEN A CASE FAILS, so the next case starts from the real one and
  // "this process does not name claude" is a reading rather than an accident of test order.
  process.title = ORIGINAL_TITLE
})

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(transcripts, { recursive: true, force: true })
})

// ============================================================ (a) a killed session behind a live waiter

describe('a killed session behind a live waiter', () => {
  it('reads answering on its beating hold when nothing read shows it gone, and the dot names the old transcript', async () => {
    const agentId = anAgent('m106-killed')
    const session = aSessionFor(agentId, aTranscript(LONG_AGO()))
    await hold('m106-killed', session)

    const said = await handleDoor('m106-killed')
    // THE HEARTBEAT IS FRESH — the hold was written a moment ago — AND NO PROCESS OF THE SESSION WAS RECORDED. An old
    // transcript alone is not a sign that turns a beating hold to not answering, so the hold is the answer.
    expect(said.how).toBe('a live session')
    expect(said.session).toBe(session)

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('green')
    expect(dot.from).toBe('a session answering as it')
    expect(dot.says).toContain('transcript')
    expect(dot.says).toContain('last grew')
  })

  it('reads answering on its beating hold when its transcript cannot be read, and the dot says it could not be read', async () => {
    const agentId = anAgent('m106-no-transcript')
    const session = aSessionFor(agentId, join(transcripts, 'never-written.jsonl'))
    await hold('m106-no-transcript', session)

    const said = await handleDoor('m106-no-transcript')
    expect(said.how).toBe('a live session')

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('green')
    expect(dot.says).toContain('could not be read')
  })
})

// ============================================================ (b) a session that is answering

describe('a session that is answering', () => {
  it('reads online when its transcript grew just now, though its run output is hours old', async () => {
    const agentId = anAgent('m106-answering')
    const session = aSessionFor(agentId, aTranscript(new Date()))
    await hold('m106-answering', session)

    const said = await handleDoor('m106-answering')
    expect(said.how).toBe('a live session')
    expect(said.session).toBe(session)
    expect(said.says).toContain('Mole Office starts no run')

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('green')
    expect(dot.word).toBe(ANSWERING_WORD)
    expect(dot.from).toBe('a session answering as it')
  })

  it('reads online when a process resource row for the session is alive, though its transcript is old', async () => {
    const agentId = anAgent('m106-process')
    const session = aSessionFor(agentId, aTranscript(LONG_AGO()))
    // THE TEST'S OWN PROCESS, registered while it is running, exactly as a session registers a
    // process it started. The row is registered by the person and does not name the agent, so the
    // only input that can answer is the hold's session reading.
    resources.registerResource({
      workspaceId: 'default',
      sessionRecordId: session,
      type: 'process',
      key: String(process.pid),
      actor: HUMAN,
    })
    await hold('m106-process', session)

    const said = await handleDoor('m106-process')
    expect(said.how).toBe('a live session')
    expect(said.session).toBe(session)

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('green')
    expect(dot.word).toBe(ANSWERING_WORD)
    expect(dot.from).toBe('a session answering as it')
  })
})

// ============================================================ (b2) the session's own process

describe("a session that is waiting in its terminal, which is what its own process shows", () => {
  it("reads online when its recorded process is alive, though its transcript is days old", async () => {
    const agentId = anAgent('m106-its-process')
    nameThisProcessClaude()
    const pid = process.pid
    const session = aSessionFor(agentId, aTranscript(LONG_AGO()), {
      pid,
      pidStartedAt: theStartStampOf(pid),
      pidCommand: theCommandLineOf(pid),
    })
    await hold('m106-its-process', session)

    // THE TRANSCRIPT IS TWO HOURS OLD AND WOULD ANSWER OFFLINE BY ITSELF. The process the session
    // filed for itself is the reading that has to carry this.
    const said = await handleDoor('m106-its-process')
    expect(said.how).toBe('a live session')
    expect(said.session).toBe(session)

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('green')
    expect(dot.word).toBe(ANSWERING_WORD)
    expect(dot.from).toBe('a session answering as it')

    // AND THE READING NAMES ITS OWN PROCESS AS WHAT PROVED IT, which no door carries on the wire.
    const reading = answering.theSessionBehindTheHold({ session } as unknown as HoldOnTheWire, 'default', new Date())
    expect(reading.from).toBe('its process')
    expect(reading.answering).toBe(true)
  })

  it('reads offline and names the pid when the recorded process does not exist', async () => {
    const agentId = anAgent('m106-dead-process')
    const session = aSessionFor(agentId, aTranscript(LONG_AGO()), {
      pid: 2147483000,
      pidStartedAt: '2026-01-01 00:00:00',
      pidCommand: `${THE_TEST_FIXTURE_ROOT}/.local/share/claude/versions/0 --session-id dead`,
    })
    await hold('m106-dead-process', session)

    const said = await handleDoor('m106-dead-process')
    expect(said.how).toBe('nobody')
    expect(said.says).toContain('2147483000')
    expect(said.says).toContain('is not alive')

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('grey')
    expect(dot.word).toBe('Offline')
  })

  it('does not trust its own pid when the recorded start time is wrong, and names it beside the beating hold', async () => {
    const agentId = anAgent('m106-wrong-start')
    nameThisProcessClaude()
    const pid = process.pid
    const session = aSessionFor(agentId, aTranscript(LONG_AGO()), {
      pid,
      // A REUSED PID NUMBER IS NOT THE SAME PROCESS. This pid is running and names claude, and it
      // is refused only because the start time does not match what was recorded.
      pidStartedAt: '2001-01-01 00:00:00',
      pidCommand: theCommandLineOf(pid),
    })
    await hold('m106-wrong-start', session)

    // A PROCESS THAT IS NOT SHOWN TO BE THE ONE RECORDED IS NOT SHOWN TO HAVE ENDED EITHER, so the beating hold stands,
    // and the sentence beside the dot says which pid was not trusted.
    const said = await handleDoor('m106-wrong-start')
    expect(said.how).toBe('a live session')

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('green')
    expect(dot.says).toContain(String(pid))
    expect(dot.says).toContain('is not the process that was recorded')
  })
})

// ============================================================ M126: a session cut off by a limit

describe('a session whose transcript ended on a limit, though a process is alive', () => {
  it('reads offline and names the cause and the reset time', async () => {
    const agentId = anAgent('m126-limit')
    // THE SESSION'S OWN PROCESS IS TRUSTED AND RUNNING. Without the cause reading, M106 would call
    // this session answering from that process alone; the limit line is what has to overrule it.
    nameThisProcessClaude()
    const pid = process.pid
    const hit = new Date('2026-09-12T08:12:00.000Z')
    const session = aSessionFor(agentId, aTranscriptEndingInALimit(hit), {
      pid,
      pidStartedAt: theStartStampOf(pid),
      pidCommand: theCommandLineOf(pid),
    })
    await hold('m126-limit', session)

    const said = await handleDoor('m126-limit')
    expect(said.how).toBe('nobody')
    expect(said.session).toBeNull()
    // THE SENTENCE NAMES THE CAUSE AND THE RESET TIME, and quotes the transcript's own words.
    expect(said.says).toContain('session limit')
    expect(said.says).toContain('resets 7:10pm')
    expect(said.says).toContain(localStamp(hit))
    expect(said.says).toContain("You've hit your session limit")

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('grey')
    expect(dot.word).toBe('Offline')
    expect(dot.from).toBeNull()
    expect(dot.says).toContain('session limit')
    expect(dot.says).toContain('resets 7:10pm')
  })

  it('reads answering on its beating hold, and says no transcript was recorded, when no transcript path is recorded', async () => {
    const agentId = anAgent('m126-codex')
    const session = aSessionWithNoTranscript(agentId)
    // A LIVE BRIDGE PROCESS, exactly the shape the codex records have. The bridge is not what answers: it can outlive
    // the session it speaks for. The beating hold is, because nothing read shows the session stopped.
    resources.registerResource({
      workspaceId: 'default',
      sessionRecordId: session,
      type: 'process',
      key: String(process.pid),
      actor: HUMAN,
    })
    await hold('m126-codex', session)

    const said = await handleDoor('m126-codex')
    expect(said.how).toBe('a live session')
    expect(said.session).toBe(session)

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('green')
    expect(dot.from).toBe('a session answering as it')
    expect(dot.says).toContain('no transcript was recorded')
  })

  it('reads online when the limit line has later activity after it', async () => {
    const agentId = anAgent('m126-later')
    const hit = new Date(Date.now() - 60 * 60 * 1000)
    const session = aSessionFor(agentId, aTranscriptEndingInALimit(hit, { later: new Date() }))
    await hold('m126-later', session)

    // THE CAUSE IS NOT THE LAST WORD: an ordinary line came after it, and the transcript grew just
    // now. A reading that took the newest error in the tail would call this session stopped.
    const said = await handleDoor('m126-later')
    expect(said.how).toBe('a live session')
    expect(said.session).toBe(session)

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('green')
    expect(dot.word).toBe(ANSWERING_WORD)
  })
})

// ============================================================ M126b: a live process with no handle

/**
 * M126b — A LIVE PROCESS WITH NO HANDLE IS NOT ANSWERING.
 *
 * M126 fixed the handle path: a codex bridge alive while its session had stopped read Offline, and
 * the sentence said no transcript could be read. The process-row path kept its own answer, so an
 * agent with the same live bridge and no hold still read Online from the row alone. The fix
 * is one judgement in answering.ts. Since the hold became the base answer for every tool, a beating
 * hold with the same facts reads answering on its hold; the process-row path still never turns a
 * dot green, and both sentences name the transcript that was not recorded.
 */
describe('M126b: a live process with no readable transcript', () => {
  it('reads not answering with no handle, and answering on a beating hold, and both name the missing transcript', async () => {
    // THE ONE THAT HOLDS THE HANDLE. A codex-shaped session with no transcript path, a live bridge
    // process registered against it, and a hold.
    const heldAgent = anAgent('m126b-held')
    const heldSession = aSessionWithNoTranscript(heldAgent)
    resources.registerResource({
      workspaceId: 'default',
      sessionRecordId: heldSession,
      type: 'process',
      key: String(process.pid),
      actor: HUMAN,
    })
    await hold('m126b-held', heldSession)

    // THE ONE THAT HOLDS NO HANDLE. Same session shape, same live process, registered by the agent
    // itself so the process-row path finds it.
    const freeAgent = anAgent('m126b-free')
    const freeSession = aSessionWithNoTranscript(freeAgent)
    resources.registerResource({
      workspaceId: 'default',
      sessionRecordId: freeSession,
      type: 'process',
      key: String(process.pid),
      actor: { type: 'agent', id: freeAgent },
    })

    const held = await presenceDoor(heldAgent)
    const free = await presenceDoor(freeAgent)

    // THE FREE ONE: a live process row is never enough to turn a dot green, and the sentence says what could not be read.
    expect(free.colour, `free reads ${free.colour}`).toBe('grey')
    expect(free.word).toBe('Offline')
    expect(free.from).toBeNull()
    expect(free.says).toContain('a process of it is alive now')
    expect(free.says).toContain('no transcript was recorded for it')
    expect(free.says).toContain('could not be read')
    // THE HELD ONE: its hold beats, so the hold is the answer, and its sentence names the same missing transcript.
    expect(held.colour, `held reads ${held.colour}`).toBe('green')
    expect(held.from).toBe('a session answering as it')
    expect(held.says).toContain('no transcript was recorded for it')
  })

  it('reads Offline with the cause when its transcript ends on a limit, and it holds no handle', async () => {
    const agentId = anAgent('m126b-limit')
    const hit = new Date('2026-09-12T08:12:00.000Z')
    const session = aSessionFor(agentId, aTranscriptEndingInALimit(hit))
    resources.registerResource({
      workspaceId: 'default',
      sessionRecordId: session,
      type: 'process',
      key: String(process.pid),
      actor: { type: 'agent', id: agentId },
    })

    const dot = await presenceDoor(agentId)
    expect(dot.colour).toBe('grey')
    expect(dot.word).toBe('Offline')
    expect(dot.from).toBeNull()
    expect(dot.says).toContain('session limit')
    expect(dot.says).toContain('resets 7:10pm')
    expect(dot.says).toContain(localStamp(hit))
  })
})

// ============================================================ (c) one word while no fact changed

describe('the presence answer does not change while no fact changed', () => {
  it('gives one word over ten reads on one clock', async () => {
    const agentId = anAgent('m106-steady')
    // THE TRANSCRIPT IS FIXED, AND SO IS THE CLOCK THE READS ARE TAKEN ON. Thirty seconds after
    // the transcript is inside the ninety-second window; the real clock is nearly an hour later,
    // which is what a reading that ignored the caller's instant would use. Ten reads on the fixed
    // clock must give one word.
    const written = new Date('2026-01-01T05:00:00.000Z')
    const clock = new Date(written.getTime() + 30_000)
    const session = aSessionFor(agentId, aTranscript(written))
    await hold('m106-steady', session)

    const words = Array.from({ length: 10 }, () =>
      presence.participantPresence({ kind: 'agent', id: agentId }, 'default', clock).word,
    )
    expect(new Set(words).size, `the word changed with no fact changed: ${words.join(', ')}`).toBe(1)
    expect(words[0]).toBe(ANSWERING_WORD)
  })
})
