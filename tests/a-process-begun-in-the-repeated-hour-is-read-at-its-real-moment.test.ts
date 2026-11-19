// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROCESS BEGUN IN THE REPEATED HOUR IS READ AT ITS REAL MOMENT. Wave 13q item 1i.
 *
 * On 25 October 2026 the clocks in Europe/London go back an hour at 02:00 summer time, so the hour from 01:00 comes
 * twice: first in summer time (00:00 to 01:00 UTC), then in winter time (01:00 to 02:00 UTC). On 28 March 2027 they go
 * forward an hour at 01:00, so the hour from 01:00 to 02:00 never comes.
 *
 * A probe writes when a process began as local time in words (`localStamp`), and the words cannot say which pass of the
 * repeated hour they mean. The seat door checked the start time a caller sent against those words read as the first
 * pass. The merge tool sends the exact moment, so for a process begun in the second pass the door read the start an
 * hour early, called it another process, and refused the full-suite seat. Two false stalls on the night of 25 October
 * came from this (F3BcBDuqHKXR and iBn1WS78UB3i).
 *
 * The Linux probe now keeps the exact moment beside the words, in `startedInstant`. A start time is compared like this:
 *
 *   - the machine's reading is its instant when the probe kept one, and otherwise every moment its words name;
 *   - the start time sent is its moment when it states its zone, and otherwise every moment its words name;
 *   - the two are one process when a moment of one is within a second of a moment of the other.
 *
 * Words name one moment on an ordinary day, two in the repeated hour, and none in the skipped hour. Start-time words
 * that name no moment are refused, and the refusal says why. They are never read as the hour after.
 *
 * WHAT IS PROVED, against a throwaway database and a made-up process table, with this process's zone set to
 * Europe/London and its clock set here:
 *
 *   1. This machine's zone rules have both nights as described above, so no case below passes on a night without a
 *      clock change.
 *   2. The Linux probe keeps the instant beside the words, read once from the same moment (`aLinuxProcess`).
 *   3. A process begun at 01:30 winter time on 25 October is granted the full-suite seat when it sends its start time
 *      the way the merge tool sends it (UTC), the way tools/slot.mjs sends it (with its offset), and in the words
 *      GET /api/resources gives back.
 *   4. Control: a process begun at 01:30 summer time is granted the seat the same three ways.
 *   5. A start time in the other pass of the hour is refused as another process, both ways round, and no row is
 *      written.
 *   6. The registration door (POST /api/resources) accepts the same three start times for a process begun in the
 *      second pass.
 *   7. A process row written for a process begun in the second pass reads as running, and a seat asked for by naming
 *      that row is granted (`theRowIsAboutThisProcess`). Control: a pid that began at 01:50 summer time and was given,
 *      twenty minutes later, to a process begun at 01:10 winter time is read as another process.
 *   8. A probe that keeps only the words, as the macOS probe does, is read as both moments its words name. A start time
 *      sent at either pass is granted, and one an hour after both is refused.
 *   9. On 28 March 2027 a process begun at 02:30 summer time is granted the seat with its instant, its UTC time and its
 *      words. The words "01:30", a time the clock skipped, are refused, the refusal says the clock skipped them, and no
 *      row is written.
 *  10. Controls: one second either side of the skipped hour is one process. On an ordinary day, a start time one second
 *      off is the same process and one two seconds off is not.
 *
 * Without the code, cases 2, 3, 5, 6 and 8 are red, and so is the part of case 9 that refuses the skipped words. Cases
 * 1, 4, 7 and 10 and the rest of case 9 are green. Case 7 was already green: the row check compares the row's words
 * with the probe's words, so a process begun in the second pass already read as itself there.
 *
 * Cases 3 to 10 build the machine's reading themselves, with the instant in it. Case 2 is what holds the Linux probe to
 * that reading.
 *
 * MUTATION PROOF (each after a green control run; each turns the cases named red, and restoring it turns them green):
 *
 *   - In src/server/lib/resources.ts, `aLinuxProcess`, leave out `startedInstant`. Case 2 goes red.
 *   - In `theStartTimeTheCallerSentIsThisProcess`, read the machine's reading as its words again and ignore the
 *     instant. Case 5 goes red.
 *   - In `theMomentsTheWordsName`, answer only the first moment the words name. Cases 3, 6 and 8 go red.
 *   - In the same function, answer the hour after for words the clock skipped. The part of case 9 that refuses the
 *     skipped words goes red.
 *
 * Every process here is a synthetic fixture in a made-up process table, handed to the ledger through `useOsProbe`. No
 * real process on this machine is read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { freshDb, type TestDb } from './helpers.ts'
import { theRowIsAboutThisProcess } from '../src/config/process-reader.mjs'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>
type Time = typeof import('../src/shared/time.ts')

const MINUTE = 60_000

/** 01:30 summer time, 25 October 2026, in the first pass of the repeated hour. */
const FIRST_PASS = Date.UTC(2026, 9, 25, 0, 30, 0)
/** 01:30 winter time, an hour later, in the second pass. Its words are the same as the first pass's. */
const SECOND_PASS = Date.UTC(2026, 9, 25, 1, 30, 0)
/** 01:50 summer time, in the first pass. */
const FIRST_PASS_AT_TEN_TO = Date.UTC(2026, 9, 25, 0, 50, 0)
/** 01:10 winter time, twenty minutes later, in the second pass. */
const SECOND_PASS_AT_TEN_PAST = Date.UTC(2026, 9, 25, 1, 10, 0)
/** 23:00 summer time the evening before, when the session that registers a process is filed. */
const THE_EVENING_BEFORE = Date.UTC(2026, 9, 24, 22, 0, 0)
/** 02:30 summer time, 28 March 2027, half an hour after the skipped hour. */
const AFTER_THE_SKIP = Date.UTC(2027, 2, 28, 1, 30, 0)
/** 00:59:59 winter time, 28 March 2027, the last second before the skipped hour. */
const BEFORE_THE_GAP = Date.UTC(2027, 2, 28, 0, 59, 59)
/** 02:00:00 summer time, one second later. */
const AFTER_THE_GAP = Date.UTC(2027, 2, 28, 1, 0, 0)
/** Noon summer time on an ordinary day, the day before the clocks go back. */
const AN_ORDINARY_NOON = Date.UTC(2026, 9, 24, 11, 0, 0)

const SYNTHETIC_COMMAND = 'node tools/merge-tool/office-keeper.mjs (synthetic process)'

let t: TestDb
let res: ResourcesLib
let time: Time
let app: FastifyInstance
let live: Map<number, OsProcess>
let theZoneBefore: string | undefined

/** A process table the test changes between requests. It never signals anything. */
function fakeProbe(table: Map<number, OsProcess>): OsProbe {
  return {
    platform: 'fake',
    processById: (pid) => table.get(pid) ?? null,
    processesInGroup: (pgid) => [...table.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: () => {
      throw new Error('this test signals nothing')
    },
    stopContainer: () => {
      throw new Error('this test stops nothing')
    },
  }
}

beforeEach(async () => {
  theZoneBefore = process.env.TZ
  process.env.TZ = 'Europe/London'
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  time = await import('../src/shared/time.ts')
  const Fastify = (await import('fastify')).default
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { resourceRoutes } = await import('../src/server/api/resources.ts')
  const { slotRoutes } = await import('../src/server/api/slots.ts')
  app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.register(slotRoutes, { prefix: '/api' })
  await app.ready()
  live = new Map<number, OsProcess>()
  res.useOsProbe(fakeProbe(live))
  vi.useFakeTimers({ toFake: ['Date'], now: THE_EVENING_BEFORE })
}, 60_000)

afterEach(async () => {
  vi.useRealTimers()
  res.useOsProbe(res.LINUX_PROBE)
  await app.close()
  t.close()
  if (theZoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = theZoneBefore
})

/**
 * A process begun at `ms`, as the Linux probe describes it: the words and the instant of one clock observation of the
 * moment. Case 2 holds `aLinuxProcess` to exactly this.
 */
function aLinuxReading(ms: number, pid: number): OsProcess {
  const started = time.clockStamp(() => new Date(ms))
  return { pid, pgid: pid, ppid: 1, command: SYNTHETIC_COMMAND, startedAt: started.stamp, startedInstant: started.instant }
}

/** Puts a process on the made-up machine, and moves the clock five minutes past its start. */
function begin(p: OsProcess, at: number): OsProcess {
  live.set(p.pid, p)
  vi.setSystemTime(at + 5 * MINUTE)
  return p
}

/** A running session record, filed at the clock's time now, and its id. */
function aSession(title: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  }).id
}

/** The headers of a session asking: an agent the office needs no registration for, and the session. */
function as(sessionId: string): Record<string, string> {
  return { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-session': sessionId }
}

function askForTheSeat(sessionId: string, body: Record<string, unknown>): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'POST', url: '/api/slots/acquire', headers: as(sessionId), payload: { pool: 'full-suite', ...body } })
}

function register(sessionId: string, pid: number, osStartedAt: string): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'POST', url: '/api/resources', payload: { sessionRecordId: sessionId, type: 'process', key: String(pid), osStartedAt } })
}

/** The seat's state in a reply that must be a grant or a place in line. */
function stateOf(reply: LightMyRequestResponse): string {
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { slot: { state: string } }).slot.state
}

function slotRows(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM session_resources WHERE type = 'slot'").get() as { n: number }).n
}

/** The same moment as an ISO time in UTC, the way the merge tool's `startTimeOf(pid)` reaches the office as JSON. */
const utc = (ms: number): string => new Date(ms).toISOString()

describe('the two nights this file is about, on this machine', () => {
  it('has the hour from 01:00 twice on 25 October 2026, and not at all on 28 March 2027', () => {
    expect(time.localStamp(new Date(FIRST_PASS))).toBe('2026-10-25 01:30:00')
    expect(time.localStamp(new Date(SECOND_PASS))).toBe('2026-10-25 01:30:00')
    expect(time.clockStamp(() => new Date(FIRST_PASS)).offset).toBe('+01:00')
    expect(time.clockStamp(() => new Date(SECOND_PASS)).offset).toBe('+00:00')
    expect(time.localStamp(new Date(BEFORE_THE_GAP))).toBe('2027-03-28 00:59:59')
    expect(time.localStamp(new Date(AFTER_THE_GAP))).toBe('2027-03-28 02:00:00')
    expect(time.localStamp(new Date(AFTER_THE_SKIP))).toBe('2027-03-28 02:30:00')
  })
})

describe('the Linux probe keeps the moment beside the words', () => {
  it('writes the words and the instant of one reading of the start', () => {
    for (const ms of [FIRST_PASS, SECOND_PASS, AFTER_THE_SKIP]) {
      const read = res.aLinuxProcess({ pid: 4100, pgid: 4100, ppid: 1, command: SYNTHETIC_COMMAND, startedAt: new Date(ms), directoryChangedAt: new Date(ms) })
      expect(read).toEqual({ ...aLinuxReading(ms, 4100), directoryChangedAt: time.localStamp(new Date(ms)) })
      expect(time.momentOfAnInstant(read.startedInstant ?? '')).toBe(ms)
    }
  })
})

describe('the full-suite seat, for a process begun in the repeated hour', () => {
  it('is granted to a process begun at 01:30 winter time, with its start time sent in UTC, with its offset, or in words', async () => {
    const p = begin(aLinuxReading(SECOND_PASS, 4100), SECOND_PASS)
    const s = aSession('a run whose merge tool began in the second pass')
    expect(stateOf(await askForTheSeat(s, { pid: p.pid, startedAt: utc(SECOND_PASS) }))).toBe('granted')
    expect(stateOf(await askForTheSeat(s, { pid: p.pid, startedAt: '2026-10-25T01:30:00.000+00:00' }))).toBe('granted')
    expect(stateOf(await askForTheSeat(s, { pid: p.pid, startedAt: '2026-10-25 01:30:00' }))).toBe('granted')
  })

  it('is granted to a process begun at 01:30 summer time the same three ways (control)', async () => {
    const p = begin(aLinuxReading(FIRST_PASS, 4200), FIRST_PASS)
    const s = aSession('a run whose merge tool began in the first pass')
    expect(stateOf(await askForTheSeat(s, { pid: p.pid, startedAt: utc(FIRST_PASS) }))).toBe('granted')
    expect(stateOf(await askForTheSeat(s, { pid: p.pid, startedAt: '2026-10-25T01:30:00.000+01:00' }))).toBe('granted')
    expect(stateOf(await askForTheSeat(s, { pid: p.pid, startedAt: '2026-10-25 01:30:00' }))).toBe('granted')
  })

  it('refuses a start time in the other pass of the hour as another process, both ways round, and writes no row', async () => {
    const second = begin(aLinuxReading(SECOND_PASS, 4100), SECOND_PASS)
    const first = begin(aLinuxReading(FIRST_PASS, 4200), SECOND_PASS)
    const s = aSession('a run that sent the other pass')
    for (const [pid, sent] of [[second.pid, utc(FIRST_PASS)], [first.pid, utc(SECOND_PASS)]] as const) {
      const reply = await askForTheSeat(s, { pid, startedAt: sent })
      expect(reply.statusCode, reply.body).toBe(409)
      expect(String(reply.json().error)).toContain('not the same process')
    }
    expect(slotRows()).toBe(0)
  })
})

describe('the registration door, for a process begun in the second pass', () => {
  it('accepts its start time in UTC, with its offset, and in words, and keeps the machine\'s own words', async () => {
    const s = aSession('the session that started the processes, filed the evening before')
    // Three processes begun in the same second, because a session registers one pid once.
    const sent = { 4100: utc(SECOND_PASS), 4101: '2026-10-25T01:30:00.000+00:00', 4102: '2026-10-25 01:30:00' }
    for (const [pid, startedAt] of Object.entries(sent)) {
      begin(aLinuxReading(SECOND_PASS, Number(pid)), SECOND_PASS)
      const answer = await register(s, Number(pid), startedAt)
      expect(answer.statusCode, `${startedAt}: ${answer.body}`).toBe(201)
    }
    const rows = res.listResources({ workspaceId: 'default' })
    expect(rows.map((r) => r.osStartedAt)).toEqual(['2026-10-25 01:30:00', '2026-10-25 01:30:00', '2026-10-25 01:30:00'])
  })
})

describe('a process row about a process begun in the second pass', () => {
  it('reads as running, and a seat asked for by naming the row is granted', async () => {
    const s = aSession('the session that started the process, filed the evening before')
    const p = begin(aLinuxReading(SECOND_PASS, 4100), SECOND_PASS)
    const row = res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '4100', actor: t.api.HUMAN })
    expect(theRowIsAboutThisProcess(row.osStartedAt, p)).toEqual({ same: true, stampedTheOldWay: false })
    expect(res.listResources({ workspaceId: 'default' })[0]?.liveness.state).toBe('alive')
    expect(stateOf(await askForTheSeat(s, { resource: row.id }))).toBe('granted')
  })

  it('tells a pid begun at 01:50 summer time from the process given it twenty minutes later, at 01:10 winter time (control)', () => {
    const s = aSession('the session that started the first process, filed the evening before')
    begin(aLinuxReading(FIRST_PASS_AT_TEN_TO, 4100), FIRST_PASS_AT_TEN_TO)
    const row = res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '4100', actor: t.api.HUMAN })
    const later = begin(aLinuxReading(SECOND_PASS_AT_TEN_PAST, 4100), SECOND_PASS_AT_TEN_PAST)
    expect(theRowIsAboutThisProcess(row.osStartedAt, later)).toEqual({ same: false })
    expect(res.listResources({ workspaceId: 'default' })[0]?.liveness.state).toBe('gone')
  })
})

describe('a probe that keeps only the words', () => {
  it('is read as both moments its words name, as the macOS probe\'s reading of ps is', async () => {
    const { anOsProcess } = await import('../src/server/lib/darwin-probe.ts')
    // `aProcessFromAPsLine` in src/config/process-reader.mjs builds the start from the local words ps prints, like this.
    const p = anOsProcess({ pid: 4300, ppid: 1, pgid: 4300, state: 'S', command: SYNTHETIC_COMMAND, startedAt: new Date(2026, 9, 25, 1, 30, 0) })
    expect(p.startedInstant).toBeUndefined()
    begin(p, SECOND_PASS)
    const s = aSession('a run on a Mac')
    expect(stateOf(await askForTheSeat(s, { pid: p.pid, startedAt: utc(FIRST_PASS) }))).toBe('granted')
    expect(stateOf(await askForTheSeat(s, { pid: p.pid, startedAt: utc(SECOND_PASS) }))).toBe('granted')
    const anHourAfterBoth = await askForTheSeat(s, { pid: p.pid, startedAt: utc(SECOND_PASS + 60 * MINUTE) })
    expect(anHourAfterBoth.statusCode, anHourAfterBoth.body).toBe(409)
    expect(String(anHourAfterBoth.json().error)).toContain('not the same process')
  })
})

describe('the hour the clocks skip, 28 March 2027', () => {
  it('grants the seat to a process begun at 02:30 summer time, with its instant, in UTC and in words', async () => {
    const p = begin(aLinuxReading(AFTER_THE_SKIP, 4400), AFTER_THE_SKIP)
    const s = aSession('a run the morning the clocks go forward')
    expect(stateOf(await askForTheSeat(s, { pid: p.pid, startedAt: '2027-03-28T02:30:00.000+01:00' }))).toBe('granted')
    expect(stateOf(await askForTheSeat(s, { pid: p.pid, startedAt: utc(AFTER_THE_SKIP) }))).toBe('granted')
    expect(stateOf(await askForTheSeat(s, { pid: p.pid, startedAt: '2027-03-28 02:30:00' }))).toBe('granted')
  })

  it('refuses the words of a time the clock skipped, says so, and writes no row', async () => {
    const p = begin(aLinuxReading(AFTER_THE_SKIP, 4400), AFTER_THE_SKIP)
    const reply = await askForTheSeat(aSession('a run that sent a skipped time'), { pid: p.pid, startedAt: '2027-03-28 01:30:00' })
    expect(reply.statusCode, reply.body).toBe(409)
    const error = String(reply.json().error)
    expect(error).toContain('2027-03-28 01:30:00')
    expect(error).toContain('skipped')
    expect(error).not.toContain('not the same process')
    expect(slotRows()).toBe(0)
  })

  it('reads the second after the skipped hour as the process begun the second before it (control)', async () => {
    const p = begin(aLinuxReading(BEFORE_THE_GAP, 4500), BEFORE_THE_GAP)
    expect(stateOf(await askForTheSeat(aSession('a run begun before the gap'), { pid: p.pid, startedAt: '2027-03-28 02:00:00' }))).toBe('granted')
  })

  it('reads the second before the skipped hour as the process begun the second after it (control)', async () => {
    const p = begin(aLinuxReading(AFTER_THE_GAP, 4600), AFTER_THE_GAP)
    expect(stateOf(await askForTheSeat(aSession('a run begun after the gap'), { pid: p.pid, startedAt: '2027-03-28 00:59:59' }))).toBe('granted')
  })
})

describe('an ordinary day (control)', () => {
  it('reads a start time one second off as the same process, and one two seconds off as another', async () => {
    const p = begin(aLinuxReading(AN_ORDINARY_NOON, 4700), AN_ORDINARY_NOON)
    const s = aSession('a run at noon')
    expect(stateOf(await askForTheSeat(s, { pid: p.pid, startedAt: utc(AN_ORDINARY_NOON + 1000) }))).toBe('granted')
    const twoSecondsOff = await askForTheSeat(s, { pid: p.pid, startedAt: utc(AN_ORDINARY_NOON + 2000) })
    expect(twoSecondsOff.statusCode, twoSecondsOff.body).toBe(409)
    expect(String(twoSecondsOff.json().error)).toContain('not the same process')
  })
})
