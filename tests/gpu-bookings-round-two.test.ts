// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * BOOKINGS OF THE HOST GPU, ROUND TWO: A DAILY BOOKING, RUNNING OVER, A JOB WITH NO BOOKING, AND THE GPU TOOL.
 *
 * This follows three decisions and the design in report
 * peyJSnLoz_Bk. This file drives the real doors on
 * a fresh office with a fake process table, and moves the clock with vitest's fake Date only, so the office's
 * own `Date.now()` is the clock the test sets. It pins these rules:
 *
 *   8. a daily booking's next day is booked once, at the same time, when this day's time comes;
 *   9. cancelling a daily booking before its time stops the repeating;
 *  10. a running-over booking's holder and the next booker are each told once;
 *  11. a job with no booking during a booking: the holder's quiet line while it fits; when not, the waking one,
 *      to the owner as well;
 * 11b. a job with no booking is not blamed for the room a running-over booking takes;
 *  12. the GPU tool's use is recorded once, by the holder;
 *  13. the GPU tool takes the caller's own booking whose time is now and that holds enough;
 *  14. the GPU tool counts its own process group's memory, and passes the command's exit on;
 *  15. the GPU tool's job gets an environment of its own: no key, token or secret its caller carries reaches it,
 *      and the tool passes on no NODE_OPTIONS and none of the test runner's own variables;
 *  16. a caller that does not read the card records the peak the watcher's readings saw for the booking's sandbox
 *      (point 4, round 36): the highest total of that sandbox's processes at one reading, and no peak,
 *      with why, when the booking names no sandbox or no reading came while it ran. A use whose peak could not
 *      be read is stored with peakMiB left out, because a kind stores no null; the door still takes null.
 *
 * ---------------------------------------------------------------------------------------
 * PROVED BY MUTATION (chapter 5): CONTROL green, then each mutation alone, then RESTORE green
 * ---------------------------------------------------------------------------------------
 *
 * Mutations 1–13 are in src/server/lib/bookings.ts and 14–17 in tools/gpu.mjs. Each file was restored
 * byte-identical after each one (sha256 checked). What went red, of nineteen:
 *   1. `bookTheNextDay` no longer checks `nextDay` → rule 8 alone: the next day is booked twice.
 *   2. it steps two days and not one → rule 8 alone.
 *   3. `settle` books the next day before this day's time comes → rule 8, and the rules run after it.
 *   4. the cancel answer no longer says the repeating stops → rule 9 alone.
 *   5. `tellTheOverRuns` no longer checks `overRunTold` → rules 10 and 11b: both are told at every reading.
 *   6. `settle` no longer calls `tellTheOverRuns` → rule 10 alone.
 *   7. the job-with-no-booking line always says the booking fits → rule 11 alone.
 *  7b. it blames the job for an over-run's room (`|| bookedGiB > card` removed) → rule 11b alone.
 *   8. it no longer checks `unbookedTold` → rule 11 alone: told at every reading.
 *   9. the owner is told at the default, or not told with the setting on → rule 11 alone.
 *  9b. the owner is told the quiet line as well → rule 11 alone.
 *  10. the view's `overByMinutes` is always null → rule 10 alone.
 *  11. `recordAUse` lets any caller record → rule 12 alone.
 *  12. it records a second use → rule 12 alone.
 *  13. `book` takes "repeat" with no set time → rule 8b alone.
 *  14. `theBookingToUse` ignores the GiB → rule 13 alone.
 *  15. it takes a running booking → rule 13 alone.
 *  16. `theGroupsMiB` counts every process → rule 14 alone.
 *  17. `howItEnded` leaves out 128 for a signal → rule 14 alone.
 *
 * Rule 15 was added in round 35b, after the check found the job inherited MOLE_AGENT_KEY. Its control, three
 * mutations in tools/gpu.mjs, each restored byte-identical (sha256 checked), and its restore are in that round's report:
 *  18. `startTheJob` spawns with no `env`, so the job inherits the caller's environment again → rule 15 alone.
 *  19. `theJobsEnvironment` no longer leaves out a secret's name the allow-list matches → rule 15 alone.
 *  20. it no longer stops on a value equal to a secret the caller carries → rule 15 alone.
 *
 * Rule 16 was added in round 36: control green, then five mutations in src/server/lib/bookings.ts, each restored
 * byte-identical (sha256 checked), then restore green. Each turned rule 16 red alone:
 *  21. `keepThePeaks` counts every sandbox's processes, not the booking's own.
 *  22. it keeps the latest reading and not the highest.
 *  23. it counts an error reading as a reading.
 *  24. `recordAUse` stores a null peakMiB, which the booking kind refuses.
 *  25. `takeAGpuReading` no longer calls `keepThePeaks`.
 *
 * Rule 15 was changed in round 39. The merge queue's suite run loads tools/record-what-tests-read.mjs into every node
 * process through NODE_OPTIONS, and the recorder gives a child started with an environment of its own its import and
 * TEST_READ_ROOT and TEST_READ_RECORD back, as the guard does with its own three. So under the queue the job held the
 * recorder's import as well, and case 15, which allowed the guard's import alone, went red there and only there. The
 * tool passes on neither: both are added inside `spawn` by the test runner's own wrappers, after the tool built the
 * job's environment. Case 15 now checks what the tool builds, and lets the job hold the runner's preloads by name.
 * Before the change, case 15 was red with the recorder preloaded and green without it. After it: control green both
 * ways, then four mutations in tools/gpu.mjs, each run with the recorder preloaded and without it and restored
 * byte-identical (sha256 checked), then restore green both ways:
 *  26. THE_JOBS_VARIABLES gains NODE_OPTIONS → rule 15 alone, both ways. The old case missed this without the
 *      recorder, because the job then got the guard's import and nothing else.
 *  27. `startTheJob` gives the job NODE_OPTIONS of its own (--no-warnings) → rule 15 alone, both ways.
 *  28. THE_JOBS_PREFIXES gains TEST_READ_ → rule 15 alone with the recorder; green without it, where the caller
 *      carries neither variable.
 *  29. `startTheJob` spawns with no `env` (mutation 18 again) → rule 15 alone, both ways.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { PORTS_VARIABLE, TEST_FILE_VARIABLE, THE_IMPORT, THE_PRELOAD } from '../tools/live-office-guard.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { howItEnded, startTheJob, theBookingToUse, theGroupsMiB, theJobsEnvironment, THE_JOBS_PREFIXES, THE_JOBS_VARIABLES } from '../tools/gpu.mjs'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

/**
 * THE READ RECORDER, tools/record-what-tests-read.mjs. The merge queue's suite run loads it into every node process,
 * with TEST_READ_ROOT and TEST_READ_RECORD set. It counts as on only when both are set, as in
 * tests/the-timing-tool-reads-a-copy-and-leaves-nothing.test.ts.
 */
const THE_READ_RECORDER = ['TEST_READ_ROOT', 'TEST_READ_RECORD']
const THE_READ_RECORDER_IS_ON = THE_READ_RECORDER.every((name) => (process.env[name] ?? '') !== '')
/** The recorder's file, next to the guard's preload. An import names it when the two paths resolve to the same file. */
const THE_RECORDER = realpathSync(join(dirname(THE_PRELOAD), 'record-what-tests-read.mjs'))
function isTheRecordersImport(word: string): boolean {
  const path = word.startsWith('--import=') ? word.slice('--import='.length) : ''
  return path !== '' && existsSync(path) && realpathSync(path) === THE_RECORDER
}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

const MINUTE = 60_000
let t: TestDb
let app: FastifyInstance
let res: ResourcesLib
const live = new Map<number, OsProcess>()

/** A process table the test changes between requests. It never signals anything. */
function fakeProbe(): OsProbe {
  return {
    platform: 'fake',
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid) => [...live.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: () => {
      throw new Error('a booking never signals anything')
    },
    stopContainer: () => {
      throw new Error('this test stops nothing')
    },
  }
}

interface Said {
  status: number
  said: Record<string, unknown>
}

async function ask(path: string, headers: Record<string, string>, body?: unknown): Promise<Said> {
  const reply = await app.inject({ method: body === undefined && !path.includes('/cancel') ? 'GET' : 'POST', url: path, headers, payload: body as Record<string, unknown> | undefined })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function register(handle: string, role: string, workArea: string[], by: Record<string, string>): Promise<void> {
  const answer = await ask('/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role, workArea })
  expect(answer.status, `${handle}: ${JSON.stringify(answer.said)}`).toBe(201)
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

interface Data {
  startsAt: string
  endsAt: string
  askedFor?: string
  state: string
  repeat?: string
  repeatOf?: string
  nextDay?: string
  use?: { minutes: number; peakMiB?: number; peakSays: string; ended: string }
}

async function booked(by: Record<string, string>, gib: number, minutes: number, extra: Record<string, unknown> = {}): Promise<{ id: string; data: Data }> {
  const answer = await ask('/api/bookings', by, { resource: 'gpu', gib, minutes, purpose: 'a test run', start: 'now', ...extra })
  expect(answer.status, JSON.stringify(answer.said)).toBe(201)
  return answer.said['booking'] as { id: string; data: Data }
}

function now(id: string): Data {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Data
}

/** Every booking a daily series wrote after its first. */
function laterDays(first: string): { id: string; data: Data }[] {
  const rows = t.client.sqlite
    .prepare("SELECT id, data FROM records WHERE kind = 'booking' AND json_extract(data, '$.repeatOf') = ?")
    .all(first) as { id: string; data: string }[]
  return rows.map((r) => ({ id: r.id, data: JSON.parse(r.data) as Data }))
}

/**
 * The system lines written to one participant, in the order written. By rowid and not by created_at: a line
 * written while a test had moved the clock carries that later time.
 */
function linesTo(to: { kind: string; id: string }): { body: string; saidInFull?: string }[] {
  const rows = t.client.sqlite
    .prepare("SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL ORDER BY rowid")
    .all() as { data: string }[]
  return rows
    .map((row) => JSON.parse(row.data) as { body: string; saidInFull?: string; to?: { kind: string; id: string }[] })
    .filter((m) => (m.to ?? []).some((one) => one.kind === to.kind && one.id === to.id))
}
const agentLines = (handle: string) => linesTo({ kind: 'agent', id: idOf(handle) })
const ownerLines = () => linesTo({ kind: 'person', id: THE_PERSON })

/** A running program on the fake machine: a group leader. */
function start(pid: number): void {
  live.set(pid, { pid, pgid: pid, ppid: 1, command: `test-run-${String(pid)}`, startedAt: '2026-10-08 10:00:00' })
}

type Process = { pid: number; pgid: number | null; mib: number; who: { kind: 'host'; unit: string } | { kind: 'sandbox'; name: string } }

/** The watcher hands in a reading; that settles the line at the clock the test set. */
async function aReading(processes: Process[] = []): Promise<void> {
  const used = 900 + processes.reduce((sum, p) => sum + p.mib, 0)
  const read = await ask('/api/resources/gpu/reading', asAgent('card-watcher'), { readAt: localStamp(new Date()), totalMiB: 16303, usedMiB: used, processes })
  expect(read.status, JSON.stringify(read.said)).toBe(200)
}

/** Move the office's clock: Date only, so the server's timers and the request machinery run as they do. */
function theClockIs(ms: number): void {
  vi.useFakeTimers({ toFake: ['Date'], now: ms })
}

beforeAll(async () => {
  // THE GPU WATCHER, a made-up handle: the agent MOLE_OFFICE_GPU_WATCHER names may hand in a reading of the card.
  process.env.MOLE_OFFICE_GPU_WATCHER = 'card-watcher'
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.ready()
  res.useOsProbe(fakeProbe())
  await register('sec-a', 'supervisor', ['src/sec-a'], AS_THE_PERSON)
  expect((await ask('/api/roles/card/sec-a', AS_THE_PERSON, { role: 'secretary' })).status).toBe(201)
  await register('wa1', 'worker', ['src/a1'], asAgent('sec-a'))
  await register('wb1', 'worker', ['src/b1'], asAgent('sec-a'))
  await register('card-watcher', 'worker', ['src/card-watcher'], AS_THE_PERSON)
  // THE CARD: 16303 MiB, so 15 GiB to book (change 1).
  await aReading()
}, 300_000)

afterEach(async () => {
  vi.useRealTimers()
  // EVERY TEST STARTS FROM AN EMPTY LINE: the owner cancels whatever is left.
  const left = t.client.sqlite
    .prepare("SELECT id FROM records WHERE kind = 'booking' AND json_extract(data, '$.state') IN ('waiting', 'running')")
    .all() as { id: string }[]
  for (const one of left) expect((await ask(`/api/bookings/${one.id}/cancel`, AS_THE_PERSON)).status).toBe(200)
  live.clear()
  await aReading()
})

afterAll(async () => {
  delete process.env.MOLE_OFFICE_GPU_WATCHER
  res.useOsProbe(res.LINUX_PROBE)
  await app.close()
  t.close()
})

/** A whole minute an hour from now, as a time to book at. */
function anHourOn(): number {
  const at = new Date(Date.now() + 60 * MINUTE)
  at.setSeconds(0, 0)
  return at.getTime()
}

describe('a daily booking', () => {
  it('8. books the next day once, at the same time, when this day\'s time comes', async () => {
    const at = anHourOn()
    const first = await booked(asAgent('wa1'), 8, 30, { start: { at: localStamp(new Date(at)).slice(0, 16) }, repeat: 'daily' })
    expect(first.data.repeat).toBe('daily')
    // BEFORE ITS TIME, NOTHING MORE IS BOOKED.
    await aReading()
    expect(laterDays(first.id)).toEqual([])
    // ITS TIME COMES: the next day is booked at the same time, once.
    theClockIs(at + MINUTE)
    await aReading()
    await aReading()
    const later = laterDays(first.id)
    expect(later.length, 'the next day was not booked exactly once').toBe(1)
    const tomorrow = new Date(at)
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(later[0]!.data.startsAt).toBe(localStamp(tomorrow))
    expect(later[0]!.data.repeat).toBe('daily')
    expect(now(first.id).nextDay).toBe(later[0]!.id)
  })

  it('8b. refuses a daily booking with no set time', async () => {
    const refused = await ask('/api/bookings', asAgent('wa1'), { resource: 'gpu', gib: 4, minutes: 30, purpose: 'a test run', start: 'now', repeat: 'daily' })
    expect(refused.status).toBe(400)
    expect(refused.said['error'] as string).toContain('needs a set time')
  })

  it('9. stops repeating when it is cancelled before its time', async () => {
    const at = anHourOn()
    const first = await booked(asAgent('wa1'), 8, 30, { start: { at: localStamp(new Date(at)).slice(0, 16) }, repeat: 'daily' })
    const cancelled = await ask(`/api/bookings/${first.id}/cancel`, asAgent('wa1'))
    expect(cancelled.status).toBe(200)
    expect(cancelled.said['says'] as string).toContain('the repeating stops')
    theClockIs(at + MINUTE)
    await aReading()
    expect(laterDays(first.id), 'a cancelled daily booking still booked a next day').toEqual([])
  })
})

describe('running over', () => {
  it('10. tells the running-over holder and the next booker, each once', async () => {
    const running = await booked(asAgent('wa1'), 10, 30)
    start(4200)
    expect((await ask(`/api/bookings/${running.id}/program`, asAgent('wa1'), { pid: 4200 })).status).toBe(200)
    // ROUND 38: a booking starts at the time asked, so the next booker waits by its own choice ("when-free").
    const next = await booked(asAgent('wb1'), 10, 30, { start: 'when-free' })
    expect(next.data.startsAt).toBe(running.data.endsAt)
    const before = { wa1: agentLines('wa1').length, wb1: agentLines('wb1').length }
    // FIVE MINUTES PAST ITS END, ITS PROGRAM STILL RUNS.
    const end = Date.parse(running.data.endsAt.replace(' ', 'T'))
    theClockIs(end + 5 * MINUTE)
    await aReading()
    await aReading()
    const toHolder = agentLines('wa1').slice(before.wa1)
    const toNext = agentLines('wb1').slice(before.wb1)
    expect(toHolder.map((m) => m.body)).toEqual(['Your GPU booking is 5 min over its time'])
    expect(toNext.map((m) => m.body)).toEqual(["wa1's GPU booking runs over, and yours does not fit yet"])
    // THE PAGE MARKS IT.
    const view = await ask('/api/resources/gpu?secondLevel=show', AS_THE_PERSON)
    const line = (view.said['secondLevel'] as { line: { booking: string; overByMinutes: number | null }[] }).line
    expect(line.find((l) => l.booking === running.id)?.overByMinutes).toBe(5)
    expect(line.find((l) => l.booking === next.id)?.overByMinutes).toBeNull()
  })
})

describe('a job with no booking', () => {
  it('11. tells the holder once, quietly while the booking fits, and the owner too when it leaves no room only when the owner asked', async () => {
    const running = await booked(asAgent('wa1'), 10, 60)
    start(4300)
    expect((await ask(`/api/bookings/${running.id}/program`, asAgent('wa1'), { pid: 4300 })).status).toBe(200)
    const before = { wa1: agentLines('wa1').length, owner: ownerLines().length }
    const small: Process = { pid: 7777, pgid: 7777, mib: 2048, who: { kind: 'host', unit: 'ollama.service' } }
    await aReading([small])
    await aReading([small])
    expect(agentLines('wa1').slice(before.wa1).map((m) => m.body)).toEqual(['A job with no booking shares the GPU'])
    expect(ownerLines().slice(before.owner).map((m) => m.body), 'the owner was told the quiet line').toEqual([])
    // A BIG ONE LEAVES NO ROOM FOR THE 10 GiB BOOKED.
    const big: Process = { pid: 8888, pgid: 8888, mib: 6000, who: { kind: 'host', unit: 'comfyui.service' } }
    await aReading([small, big])
    const toHolder = agentLines('wa1').slice(before.wa1)
    expect(toHolder.map((m) => m.body)).toEqual(['A job with no booking shares the GPU', 'A job with no booking leaves no room on the GPU'])
    expect(toHolder[1]!.saidInFull).toContain('the card has room for 7 GiB, and 10 GiB is booked')
    // THE OWNER IS NOT TOLD AT THE DEFAULT; the Resources page shows the job.
    expect(ownerLines().slice(before.owner), 'the owner was told without asking').toEqual([])
    // WITH THE SETTING ON, another job that leaves no room is told to the owner as well, once.
    const was = process.env['MOLE_OFFICE_TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS']
    process.env['MOLE_OFFICE_TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS'] = '1'
    try {
      const another: Process = { pid: 9191, pgid: 9191, mib: 1024, who: { kind: 'host', unit: 'another.service' } }
      await aReading([small, big, another])
      await aReading([small, big, another])
      expect(ownerLines().slice(before.owner).map((m) => m.body)).toEqual(['A job with no booking leaves no room on the GPU'])
    } finally {
      if (was === undefined) delete process.env['MOLE_OFFICE_TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS']
      else process.env['MOLE_OFFICE_TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS'] = was
    }
  })
})

describe('a job with no booking during an over-run', () => {
  it('11b. is not blamed for the room a running-over booking takes', async () => {
    const running = await booked(asAgent('wa1'), 10, 30)
    start(4500)
    expect((await ask(`/api/bookings/${running.id}/program`, asAgent('wa1'), { pid: 4500 })).status).toBe(200)
    const next = await booked(asAgent('wb1'), 6, 30, { start: 'when-free' })
    theClockIs(Date.parse(next.data.startsAt.replace(' ', 'T')) + 5 * MINUTE)
    await aReading()
    const before = agentLines('wb1').length
    await aReading([{ pid: 9999, pgid: 9999, mib: 600, who: { kind: 'host', unit: 'stray.service' } }])
    expect(agentLines('wb1').slice(before).map((m) => m.body)).toEqual(['A job with no booking shares the GPU'])
  })
})

describe('the GPU tool', () => {
  it('12. records a use once, by the holder', async () => {
    const mine = await booked(asAgent('wa1'), 6, 30)
    start(4400)
    expect((await ask(`/api/bookings/${mine.id}/program`, asAgent('wa1'), { pid: 4400 })).status).toBe(200)
    const use = { startedAt: '2026-10-08 16:03:12', endedAt: '2026-10-08 16:51:40', peakMiB: 5120, peakSays: 'Read every 5 seconds.', ended: 'exit 0' }
    expect((await ask(`/api/bookings/${mine.id}/use`, asAgent('wb1'), use)).status, 'another agent recorded the use').toBe(403)
    const recorded = await ask(`/api/bookings/${mine.id}/use`, asAgent('wa1'), use)
    expect(recorded.status, JSON.stringify(recorded.said)).toBe(200)
    expect(now(mine.id).use).toMatchObject({ minutes: 48, peakMiB: 5120, ended: 'exit 0' })
    expect((await ask(`/api/bookings/${mine.id}/use`, asAgent('wa1'), use)).status, 'a second use was recorded').toBe(409)
  })

  it('13. takes the caller\'s own booking whose time is now and that holds enough', () => {
    const at = Date.parse('2026-10-08T16:10:00')
    const line = (booking: string, id: string, state: string, startsAt: string, endsAt: string, gib: number) => ({
      booking,
      holder: { kind: 'agent', id },
      state,
      startsAt,
      endsAt,
      gib,
    })
    const lines = [
      line('others', 'wb1', 'waiting', '2026-10-08 16:00:00', '2026-10-08 17:00:00', 10),
      line('running', 'wa1', 'running', '2026-10-08 16:00:00', '2026-10-08 17:00:00', 10),
      line('small', 'wa1', 'waiting', '2026-10-08 16:00:00', '2026-10-08 17:00:00', 4),
      line('later', 'wa1', 'waiting', '2026-10-08 16:30:00', '2026-10-08 17:00:00', 10),
      line('mine', 'wa1', 'waiting', '2026-10-08 16:05:00', '2026-10-08 16:45:00', 8),
    ]
    expect(theBookingToUse(lines, 'wa1', 8, at)).toBe('mine')
    expect(theBookingToUse(lines, 'wa1', 9, at)).toBeNull()
  })

  it('14. counts its own process group\'s memory and passes the command\'s exit on', () => {
    const processes = [
      { pgid: 500, mib: 3000 },
      { pgid: 500, mib: 1200 },
      { pgid: 600, mib: 9000 },
      { pgid: null, mib: 50 },
    ]
    expect(theGroupsMiB(processes, 500)).toBe(4200)
    expect(howItEnded(3, null)).toEqual({ exit: 3, ended: 'exit 3' })
    expect(howItEnded(null, 'SIGTERM')).toEqual({ exit: 143, ended: 'signal SIGTERM' })
  })

  it('15. starts the job with an environment of its own, which holds no key, token or secret of its caller', async () => {
    // Made-up keys, for this test only.
    const secrets = {
      MOLE_AGENT_KEY: 'made-up-agent-key-15a',
      SANDBOX_RUN_KEY: 'made-up-run-key-15b',
      MOLE_OFFICE_SESSION: 'made-up-session-15c',
      HF_TOKEN: 'made-up-hf-token-15d',
      OPENAI_API_KEY: 'made-up-api-key-15e',
      DB_PASSWORD: 'made-up-password-15f',
      CUDA_LICENSE_TOKEN: 'made-up-cuda-token-15g',
    }
    const passed = { CUDA_VISIBLE_DEVICES: '0', NVIDIA_DRIVER_CAPABILITIES: 'compute,utility' }
    try {
      for (const [name, value] of Object.entries({ ...secrets, ...passed, JOB_UNLISTED: 'not-for-the-job-15h' })) vi.stubEnv(name, value)
      const child = startTheJob(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.env))'], process.env, [['JOB_SEED', '7']], ['ignore', 'pipe', 'inherit'])
      let printed = ''
      child.stdout?.on('data', (chunk: Buffer) => { printed += chunk.toString() })
      const code = await new Promise((done) => child.once('close', done))
      expect(code).toBe(0)
      for (const [name, value] of Object.entries(secrets)) expect(printed, `the job saw ${name}`).not.toContain(value)
      expect(printed, 'the job saw a variable no list allows').not.toContain('not-for-the-job-15h')
      const seen = JSON.parse(printed) as Record<string, string>
      expect(seen).toMatchObject({ ...passed, JOB_SEED: '7', PATH: process.env['PATH'] })
      // THE TOOL PASSES ON NONE OF THE TEST RUNNER'S OWN VARIABLES, though this process carries them.
      const theRunners = ['NODE_OPTIONS', PORTS_VARIABLE, TEST_FILE_VARIABLE, ...THE_READ_RECORDER]
      const built = theJobsEnvironment(process.env, [['JOB_SEED', '7']])
      expect(Object.keys(built).filter((name) => theRunners.includes(name)), 'the tool passed on a variable of the test runner').toEqual([])
      // THE TEST RUNNER'S OWN PRELOADS give every child started with an environment of its own their variables back,
      // inside `spawn`: the guard its import, the ports and the test file's name; the read recorder, when the merge
      // queue's run loads it, its import, TEST_READ_ROOT and TEST_READ_RECORD. The job may hold those, and no more.
      const theGuards = [PORTS_VARIABLE, TEST_FILE_VARIABLE, 'NODE_OPTIONS', ...(THE_READ_RECORDER_IS_ON ? THE_READ_RECORDER : [])]
      const words = (seen['NODE_OPTIONS'] ?? '').split(' ').filter((word) => word !== '')
      expect(words.filter((word) => word !== THE_IMPORT && !(THE_READ_RECORDER_IS_ON && isTheRecordersImport(word))), 'the job got NODE_OPTIONS beyond the test runner\'s preloads').toEqual([])
      for (const name of THE_READ_RECORDER) {
        if (seen[name] !== undefined) expect(seen[name], `the job holds a ${name} the recorder did not give it`).toBe(resolve(String(process.env[name])))
      }
      const allowed = (name: string) =>
        THE_JOBS_VARIABLES.includes(name) || THE_JOBS_PREFIXES.some((p) => name.startsWith(p)) || name === 'JOB_SEED' || theGuards.includes(name)
      expect(Object.keys(seen).filter((name) => !allowed(name))).toEqual([])

      expect(() => theJobsEnvironment(process.env, [['HF_TOKEN', 'x']])).toThrow(/--env HF_TOKEN names a key or a secret/)
      expect(() => theJobsEnvironment(process.env, [['PLAIN', secrets.MOLE_AGENT_KEY]])).toThrow(/^The job's PLAIN holds the value of a key or secret you carry[^]*Nothing was started\.$/)
      expect(() => theJobsEnvironment(process.env, [['PLAIN', secrets.MOLE_AGENT_KEY]])).not.toThrow(secrets.MOLE_AGENT_KEY)
    } finally {
      vi.unstubAllEnvs()
    }
  })
  it('16. records the peak the watcher\'s readings saw for the booking\'s sandbox, for a caller that does not read the card', async () => {
    const use = { startedAt: '2026-10-11 04:10:00', endedAt: '2026-10-11 04:40:00', peak: 'from the readings', ended: 'exit 0' }
    const sandbox = (name: string, pid: number, mib: number): Process => ({ pid, pgid: pid, mib, who: { kind: 'sandbox', name } })

    const ran = await booked(asAgent('wa1'), 4, 30)
    start(4600)
    expect((await ask(`/api/bookings/${ran.id}/program`, asAgent('wa1'), { pid: 4600, sandbox: 'news-desk' })).status).toBe(200)
    await aReading([sandbox('news-desk', 4601, 2000), sandbox('news-desk', 4602, 1000), sandbox('other-box', 4700, 9000)])
    await aReading([sandbox('news-desk', 4601, 4000)])
    await aReading([sandbox('news-desk', 4601, 500)])
    expect((await ask('/api/resources/gpu/reading', asAgent('card-watcher'), { readAt: localStamp(new Date()), error: 'nvidia-smi timed out' })).status).toBe(200)
    const recorded = await ask(`/api/bookings/${ran.id}/use`, asAgent('wa1'), use)
    expect(recorded.status, JSON.stringify(recorded.said)).toBe(200)
    expect(now(ran.id).use?.peakMiB, 'the peak is the highest total of the sandbox at one reading').toBe(4000)
    expect(now(ran.id).use?.peakSays).toMatch(/^The highest total of sandbox news-desk's processes on the card in the GPU watcher's readings, at \d{4}-\d\d-\d\d \d\d:\d\d:\d\d: 3 readings counted since \d{4}-\d\d-\d\d \d\d:\d\d:\d\d, and 1 reading that could not read the card\. Readings before then are not in it\.$/)

    const unseen = await booked(asAgent('wa1'), 4, 30)
    start(4800)
    expect((await ask(`/api/bookings/${unseen.id}/program`, asAgent('wa1'), { pid: 4800, sandbox: 'night-box' })).status).toBe(200)
    const unseenUse = await ask(`/api/bookings/${unseen.id}/use`, asAgent('wa1'), use)
    expect(unseenUse.status, JSON.stringify(unseenUse.said)).toBe(200)
    expect(now(unseen.id).use, 'no reading came, so the peak is not known').not.toHaveProperty('peakMiB')
    expect(now(unseen.id).use?.peakSays).toMatch(/^The office holds no reading of the card taken while booking \S+ ran in sandbox night-box\./)

    const unnamed = await booked(asAgent('wa1'), 4, 30)
    start(4900)
    expect((await ask(`/api/bookings/${unnamed.id}/program`, asAgent('wa1'), { pid: 4900 })).status).toBe(200)
    await aReading([sandbox('news-desk', 4901, 3000)])
    expect((await ask(`/api/bookings/${unnamed.id}/use`, asAgent('wa1'), use)).status).toBe(200)
    expect(now(unnamed.id).use, 'a booking with no sandbox is counted no reading').not.toHaveProperty('peakMiB')
    expect(now(unnamed.id).use?.peakSays).toMatch(/names no sandbox/)

    // The GPU tool sends null when no reading of the card succeeded; the kind refused that before round 36.
    const unread = await booked(asAgent('wa1'), 4, 30)
    start(5000)
    expect((await ask(`/api/bookings/${unread.id}/program`, asAgent('wa1'), { pid: 5000 })).status).toBe(200)
    const toldNull = await ask(`/api/bookings/${unread.id}/use`, asAgent('wa1'), { ...use, peak: undefined, peakMiB: null, peakSays: 'No reading of the card succeeded: timed out' })
    expect(toldNull.status, JSON.stringify(toldNull.said)).toBe(200)
    expect(now(unread.id).use).not.toHaveProperty('peakMiB')
    expect(now(unread.id).use?.peakSays).toBe('No reading of the card succeeded: timed out')
  })
})
