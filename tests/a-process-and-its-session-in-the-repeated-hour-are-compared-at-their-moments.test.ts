// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROCESS AND ITS SESSION IN THE REPEATED HOUR ARE COMPARED AT THEIR MOMENTS.
 *
 * On 25 October 2026 the clocks in Europe/London go back an hour at 02:00 summer time, so the hour from 01:00 comes
 * twice: first in summer time (00:00 to 01:00 UTC), then in winter time (01:00 to 02:00 UTC). On 28 March 2027 they go
 * forward an hour at 01:00, so the hour from 01:00 to 02:00 never comes.
 *
 * The resource door refuses a process that began before the session registering it, because that session cannot have
 * started it. It compared when the process began, in words, with when the session was filed, in words, and read both
 * as the first pass of the repeated hour. So a process begun at 01:20 winter time for a session filed at 01:50 summer
 * time, half an hour before it, was refused as older than its session, and a process begun at 01:40 summer time for a
 * session filed at 01:10 winter time, half an hour after it, was taken. The Linux probe keeps the moment a process
 * began (`startedInstant`), and the record door now keeps the moment it filed a session (`filedTime`). A moment only
 * says which pass of the hour its stamp means, so the door compares the two moments only when each names the stamp
 * beside it: its first 19 characters are the stamp, with T for the space. Otherwise it compares the two stamps, as
 * before.
 *
 * WHAT IS PROVED, against a throwaway database and a made-up process table, with this process's zone set to
 * Europe/London and its clock set here. Every session is filed through the record door and every process is
 * registered through POST /api/resources, except the rows cases 4, 5 and 6 change by hand, which say why.
 *
 *   1. A process begun at 01:20 winter time on 25 October, for a session filed at 01:50 summer time, is taken, and a
 *      process begun at 01:40 summer time, for a session filed at 01:10 winter time, is refused in the words used
 *      before, with no row written.
 *   2. On 28 March 2027, a process begun at 02:30 summer time for a session filed at 00:30 winter time is taken, and a
 *      process begun at 00:30 winter time for a session filed at 02:30 summer time is refused.
 *   3. Control: a process begun at 01:20 winter time for a session filed at 01:10 winter time is taken. A process
 *      begun a second before its session was filed is taken, and one begun two seconds before is refused.
 *   4. Control: a session with no moment beside its stamp, and a process the probe kept no moment for, are compared
 *      in words, as before. A process begun at 01:20 winter time for a session filed at 01:50 summer time is refused.
 *   5. A session whose moment names its stamp and cannot be read, with the offset +25:00, is refused, as a stamp that
 *      cannot be read is, and the refusal quotes that moment.
 *   6. A session stamp changed alone is compared in words, as before. A process begun at 12:10 on 2 November 2026, for
 *      a session filed at noon whose stamp is then set to 12:20, is refused, and the refusal quotes the two stamps.
 *
 * Without the code, cases 1 and 5 are red. Cases 2, 3, 4 and 6 are green. A door that compares the moments whenever
 * both are there, without asking whether each names its stamp, turns case 6 red: it compares 12:10 with noon, and takes
 * the process.
 *
 * Every process here is a synthetic fixture in a made-up process table, handed to the ledger through `useOsProbe`. No
 * real process on this machine is read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { freshDb, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>
type Time = typeof import('../src/shared/time.ts')

const SECOND = 1_000
const MINUTE = 60_000

/** 01:10 winter time, 25 October 2026, in the second pass of the repeated hour. */
const SECOND_PASS_AT_TEN_PAST = Date.UTC(2026, 9, 25, 1, 10, 0)
/** 01:20 winter time, ten minutes later. */
const SECOND_PASS_AT_TWENTY_PAST = Date.UTC(2026, 9, 25, 1, 20, 0)
/** 01:40 summer time, 25 October 2026, in the first pass: half an hour before 01:10 winter time. */
const FIRST_PASS_AT_TWENTY_TO = Date.UTC(2026, 9, 25, 0, 40, 0)
/** 01:50 summer time, in the first pass: half an hour before 01:20 winter time. */
const FIRST_PASS_AT_TEN_TO = Date.UTC(2026, 9, 25, 0, 50, 0)
/** 00:30 winter time, 28 March 2027, half an hour before the skipped hour. */
const BEFORE_THE_SKIP = Date.UTC(2027, 2, 28, 0, 30, 0)
/** 02:30 summer time, 28 March 2027, half an hour after the skipped hour, and an hour after the one above. */
const AFTER_THE_SKIP = Date.UTC(2027, 2, 28, 1, 30, 0)
/** Noon, 2 November 2026, in winter time and far from either change of the clocks. */
const NOON_IN_NOVEMBER = Date.UTC(2026, 10, 2, 12, 0, 0)
/** 12:10 the same day. */
const TEN_PAST_NOON_IN_NOVEMBER = Date.UTC(2026, 10, 2, 12, 10, 0)

const SYNTHETIC_COMMAND = 'node a-made-up-server.mjs (synthetic process)'

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
  app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.ready()
  live = new Map<number, OsProcess>()
  res.useOsProbe(fakeProbe(live))
}, 60_000)

afterEach(async () => {
  vi.useRealTimers()
  res.useOsProbe(res.LINUX_PROBE)
  await app.close()
  t.close()
  if (theZoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = theZoneBefore
})

/** A process begun at `ms`, as the Linux probe describes it: the words and the instant of one reading of the moment. */
function aLinuxReading(ms: number, pid: number): OsProcess {
  const started = time.clockStamp(() => new Date(ms))
  return { pid, pgid: pid, ppid: 1, command: SYNTHETIC_COMMAND, startedAt: started.stamp, startedInstant: started.instant }
}

/** A running session filed through the record door at `ms`, and its id. */
function aSessionFiledAt(ms: number, title: string): string {
  vi.setSystemTime(ms)
  return t.api.createRecord({ workspaceId: 'default', kind: 'session', title, data: { state: 'running', runtime: 'claude-code' }, actor: t.api.HUMAN }).id
}

/** Puts the process on the made-up machine and registers it for the session, with the clock five minutes on. */
function register(sessionId: string, p: OsProcess, at: number): Promise<LightMyRequestResponse> {
  live.set(p.pid, p)
  vi.setSystemTime(Math.max(at, Date.now()) + 5 * MINUTE)
  return app.inject({ method: 'POST', url: '/api/resources', payload: { sessionRecordId: sessionId, type: 'process', key: String(p.pid) } })
}

/** The process rows the session holds. */
function rowsOf(sessionId: string): number {
  return res.listResources({ workspaceId: 'default' }).filter((row) => row.sessionRecordId === sessionId && row.type === 'process').length
}

/** That the reply took the process. */
function taken(reply: LightMyRequestResponse): void {
  expect(reply.statusCode, reply.body).toBe(201)
}

/** That the reply refused the process, naming both stamps it compared, and the session holds no row for it. */
function refused(reply: LightMyRequestResponse, sessionId: string, words: readonly string[]): void {
  expect(reply.statusCode, reply.body).toBe(400)
  for (const one of words) expect(String((reply.json() as { error?: unknown }).error)).toContain(one)
  expect(rowsOf(sessionId)).toBe(0)
}

describe('a process and its session in the repeated hour are compared at their moments', () => {
  it('1. a process begun after its session is taken, and one begun before it is refused, across the two passes', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: FIRST_PASS_AT_TEN_TO })
    const early = aSessionFiledAt(FIRST_PASS_AT_TEN_TO, 'a session filed at 01:50 summer time')
    taken(await register(early, aLinuxReading(SECOND_PASS_AT_TWENTY_PAST, 4100), SECOND_PASS_AT_TWENTY_PAST))
    expect(rowsOf(early)).toBe(1)

    const late = aSessionFiledAt(SECOND_PASS_AT_TEN_PAST, 'a session filed at 01:10 winter time')
    refused(await register(late, aLinuxReading(FIRST_PASS_AT_TWENTY_TO, 4200), SECOND_PASS_AT_TEN_PAST), late, ['4200', '2026-10-25 01:40:00', '2026-10-25 01:10:00'])
  })

  it('2. on the night the clocks go forward, a process is compared with its session across the skipped hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: BEFORE_THE_SKIP })
    const early = aSessionFiledAt(BEFORE_THE_SKIP, 'a session filed at 00:30 winter time')
    taken(await register(early, aLinuxReading(AFTER_THE_SKIP, 4300), AFTER_THE_SKIP))

    const late = aSessionFiledAt(AFTER_THE_SKIP + 10 * MINUTE, 'a session filed at 02:40 summer time')
    refused(await register(late, aLinuxReading(BEFORE_THE_SKIP, 4400), AFTER_THE_SKIP + 10 * MINUTE), late, ['4400', '2027-03-28 00:30:00', '2027-03-28 02:40:00'])
  })

  it('3. control: a process begun after its session in the second pass is taken, and the second of tolerance holds', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: SECOND_PASS_AT_TEN_PAST })
    const session = aSessionFiledAt(SECOND_PASS_AT_TEN_PAST, 'a session filed at 01:10 winter time')
    taken(await register(session, aLinuxReading(SECOND_PASS_AT_TWENTY_PAST, 4500), SECOND_PASS_AT_TWENTY_PAST))
    taken(await register(session, aLinuxReading(SECOND_PASS_AT_TEN_PAST - SECOND, 4501), SECOND_PASS_AT_TEN_PAST))

    const another = aSessionFiledAt(SECOND_PASS_AT_TEN_PAST, 'another session filed at 01:10 winter time')
    refused(await register(another, aLinuxReading(SECOND_PASS_AT_TEN_PAST - 2 * SECOND, 4502), SECOND_PASS_AT_TEN_PAST), another, ['4502'])
  })

  it('4. control: a session or a process with no moment is compared in words, as before', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: FIRST_PASS_AT_TEN_TO })
    const noMoment = aSessionFiledAt(FIRST_PASS_AT_TEN_TO, 'a session filed with no moment')
    // WRITTEN BY HAND, AS A SESSION FILED BEFORE THE RECORD DOOR KEPT ITS MOMENT: the door's own row, with that moment
    // taken out. Without the code there is nothing to take out, and the row is left as it is.
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.filedTime') WHERE id = ?").run(noMoment)
    refused(await register(noMoment, aLinuxReading(SECOND_PASS_AT_TWENTY_PAST, 4600), SECOND_PASS_AT_TWENTY_PAST), noMoment, ['4600'])

    const filed = aSessionFiledAt(FIRST_PASS_AT_TEN_TO, 'a session filed at 01:50 summer time')
    // A probe that keeps only the words, as the macOS probe does.
    const { startedInstant: _left, ...wordsOnly } = aLinuxReading(SECOND_PASS_AT_TWENTY_PAST, 4601)
    refused(await register(filed, wordsOnly, SECOND_PASS_AT_TWENTY_PAST), filed, ['4601'])
  })

  it('5. a session whose moment cannot be read is refused', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: SECOND_PASS_AT_TEN_PAST })
    const session = aSessionFiledAt(SECOND_PASS_AT_TEN_PAST, 'a session with a moment that cannot be read')
    // WRITTEN BY HAND, BECAUSE NO DOOR WRITES A MOMENT THAT CANNOT BE READ: the door's own row, with its moment spoiled.
    // Its date and time are kept, so it still names its stamp, and its offset is one no clock has.
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.filedTime.instant', substr(json_extract(data, '$.filedTime.instant'), 1, 23) || '+25:00') WHERE id = ?")
      .run(session)
    refused(await register(session, aLinuxReading(SECOND_PASS_AT_TWENTY_PAST, 4700), SECOND_PASS_AT_TWENTY_PAST), session, ['4700', '2026-10-25T01:10:00.000+25:00'])
  })

  it('6. a session stamp changed alone is compared in words, as before', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOON_IN_NOVEMBER })
    const session = aSessionFiledAt(NOON_IN_NOVEMBER, 'a session with its stamp changed alone')
    // WRITTEN BY HAND, AS A TEST OR A WRITER THAT KNOWS ONLY THE STAMP MOVES A SESSION'S FILING: the door's own row, with
    // its stamp set twenty minutes on and its moment left as the door wrote it. The record door never changes the stamp
    // alone.
    t.client.sqlite.prepare("UPDATE records SET created_at = '2026-11-02 12:20:00' WHERE id = ?").run(session)
    // The session's moment names noon, not 12:20, so the two stamps are compared, and 12:10 is before 12:20.
    refused(await register(session, aLinuxReading(TEN_PAST_NOON_IN_NOVEMBER, 4800), TEN_PAST_NOON_IN_NOVEMBER + 10 * MINUTE), session, [
      '4800',
      '2026-11-02 12:10:00',
      '2026-11-02 12:20:00',
    ])
  })
})
