// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GPU BOOKING WITH A PROGRAM LASTS UNTIL THE PROGRAM ENDS, AND A BOOKING CAN BE EXTENDED (wave 13s round 37).
 *
 * Message vlmGbNQhYQZn passed this on: a booking planned to end at 19:03 ran its job to about 21:30, and
 * the Resources page said 19:03. This file drives the real doors on a fresh office with a fake process table, and
 * moves the clock with vitest's fake Date only. The whole file runs on its own clock, so the hour it runs at does not
 * matter (round 94). It pins these rules:
 *
 *   1. GET /api/resources/gpu says a running booking lasts until its program ends, with its planned end as planned
 *      and no expected end while its program has said nothing; a waiting booking keeps its fixed end;
 *   2. where the program reports how far it is, the expected end is the report's time plus the steps left at the
 *      pace since the program's group leader started;
 *   3. the page draws the running booking as lasting until its program ends, its planned end and its expected end,
 *      and the waiting one with its fixed end;
 *   4. its holder extends it with a reason: its end and minutes move, the extension is kept, nothing else moves;
 *   5. a secretary or the owner may extend another's booking; another agent may not, and nobody may without a
 *      reason;
 *   6. an extension into another booking's time is taken, and when the GiB declared then go over the card, both
 *      holders are reminded with each declaration, the total and the card's size;
 *   7. an extension whose GiB stay within the card is taken with no reminder;
 *   8. an extension is taken when the card's reading is old, and when the card has not been read since the
 *      server started, in which case the reminder says the card was not read;
 *   9. an extension to an end the office's clock shows twice, the night the clocks go back, is refused, and the
 *      refusal names those times (round 94).
 *
 * Round 38 changed rules 5 to 8 by a decision that replaced QQn47N5d284x: there is no hard gate on GPU
 * memory.
 * Until then an extension that clashed, went past the GPU rule or had no fresh reading was refused with
 * bookingExtendClashes, bookingExtendBreaksTheGpuRule or bookingExtendCardNotRead; those codes are retired.
 *
 * ---------------------------------------------------------------------------------------
 * PROVED BY MUTATION (chapter 5): CONTROL green, then each mutation alone, then RESTORE green
 * ---------------------------------------------------------------------------------------
 *
 * The runs are listed in the round's report and logged in .scratch/r37 and, for round 38, .scratch/r38.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp, parseLocalStamp } from '../src/shared/time.ts'
import { THE_LONGEST_BOOKING_MINUTES } from '../src/shared/bookings.ts'
import type { GpuView } from '../src/server/lib/bookings.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type Page = typeof import('../src/web/pages/ResourcesPage.tsx')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

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
/**
 * THE FILE'S CLOCK starts at 10:00 on 13 October 2026 in London and moves on with the real one, so the hour the file
 * runs at does not matter. On the real clock, an end the cases ask for could be a time the clocks show twice, the night
 * they go back, and the extend door refuses those (case 9).
 */
const THE_FILES_CLOCK = Date.UTC(2026, 9, 13, 9, 0)
/** How far on the file looks: past the longest booking, as case 4 does, and an hour for the file's own running. */
const THE_FILE_COVERS = (THE_LONGEST_BOOKING_MINUTES + 60) * MINUTE
let theRealStart = 0

/** Puts the file's clock back, as far on as the real clock has moved since beforeAll began. Called on the real clock. */
function onTheFilesClock(): void {
  vi.useFakeTimers({ toFake: ['Date'], now: THE_FILES_CLOCK + (Date.now() - theRealStart), shouldAdvanceTime: true })
}

let t: TestDb
let app: FastifyInstance
let res: ResourcesLib
let page: Page
const live = new Map<number, OsProcess>()

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

async function ask(method: 'GET' | 'POST', path: string, headers: Record<string, string>, body?: unknown): Promise<Said> {
  const reply = await app.inject({ method, url: path, headers, payload: body as Record<string, unknown> | undefined })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function register(handle: string, role: string, workArea: string[], by: Record<string, string>): Promise<void> {
  const answer = await ask('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role, workArea })
  expect(answer.status, `${handle}: ${JSON.stringify(answer.said)}`).toBe(201)
}

interface Data {
  startsAt: string
  endsAt: string
  minutes: number
  state: string
  extensions?: { from: string; to: string; because: string; by: { kind: string; id: string } }[]
}

async function booked(by: Record<string, string>, gib: number, minutes: number, start: 'now' | 'when-free' = 'now'): Promise<{ id: string; data: Data }> {
  const answer = await ask('POST', '/api/bookings', by, { resource: 'gpu', gib, minutes, purpose: 'Test made-up job', start })
  expect(answer.status, JSON.stringify(answer.said)).toBe(201)
  return answer.said['booking'] as { id: string; data: Data }
}

/** The system lines written to one agent, newest last. */
function linesTo(handle: string): { body: string; saidInFull?: string }[] {
  const agent = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  return (t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL ORDER BY created_at, rowid").all() as { data: string }[])
    .map((row) => JSON.parse(row.data) as { body: string; saidInFull?: string; to?: { kind: string; id: string }[] })
    .filter((m) => (m.to ?? []).some((one) => one.kind === 'agent' && one.id === agent.id))
}

function stored(id: string): Data {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Data
}

/** A running program on the fake machine: a group leader that started `ago` milliseconds before now. */
function start(pid: number, ago = 0): void {
  live.set(pid, { pid, pgid: pid, ppid: 1, command: `test-run-${String(pid)}`, startedAt: localStamp(new Date(Date.now() - ago)) })
}

/** A booking of `by`'s, with its program running on the fake machine. */
async function running(by: string, gib: number, minutes: number, pid: number, ago = 0): Promise<{ id: string; data: Data }> {
  const b = await booked(asAgent(by), gib, minutes)
  start(pid, ago)
  const named = await ask('POST', `/api/bookings/${b.id}/program`, asAgent(by), { pid })
  expect(named.status, JSON.stringify(named.said)).toBe(200)
  return { id: b.id, data: stored(b.id) }
}

async function aReading(): Promise<void> {
  const read = await ask('POST', '/api/resources/gpu/reading', asAgent('card-watcher'), { readAt: localStamp(new Date()), totalMiB: 16303, usedMiB: 900, processes: [] })
  expect(read.status, JSON.stringify(read.said)).toBe(200)
}

async function theGpu(by: Record<string, string>): Promise<GpuView> {
  const answer = await ask('GET', '/api/resources/gpu?secondLevel=show', by)
  expect(answer.status, JSON.stringify(answer.said)).toBe(200)
  return answer.said as unknown as GpuView
}

function msOf(stamp: string): number {
  const ms = parseLocalStamp(stamp)
  expect(ms, `${stamp} cannot be read`).not.toBeNull()
  return ms!
}

/** A whole-minute time `minutes` after `ms`, as the extend door takes it. */
function later(ms: number, minutes: number): string {
  return localStamp(new Date(ms + minutes * MINUTE)).slice(0, 16)
}

beforeAll(async () => {
  theRealStart = Date.now()
  onTheFilesClock()
  expect(new Date(Date.now() + THE_FILE_COVERS).getTimezoneOffset(), 'the clocks change in the day the file covers').toBe(new Date().getTimezoneOffset())
  // THE GPU WATCHER, a made-up handle: the agent MOLE_OFFICE_GPU_WATCHER names may hand in a reading of the card.
  process.env.MOLE_OFFICE_GPU_WATCHER = 'card-watcher'
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  page = await import('../src/web/pages/ResourcesPage.tsx')
  app = (await apiApp()).app
  await app.ready()
  res.useOsProbe(fakeProbe())
  await register('sec-a', 'supervisor', ['src/sec-a'], AS_THE_PERSON)
  expect((await ask('POST', '/api/roles/card/sec-a', AS_THE_PERSON, { role: 'secretary' })).status).toBe(201)
  await register('wa1', 'worker', ['src/a1'], asAgent('sec-a'))
  await register('wb1', 'worker', ['src/b1'], asAgent('sec-a'))
  await register('card-watcher', 'worker', ['src/card-watcher'], AS_THE_PERSON)
  // THE CARD: 16303 MiB, so 15 GiB to book; 900 MiB held outside any booked job.
  await aReading()
}, 300_000)

afterEach(async () => {
  vi.useRealTimers()
  // THE FILE'S CLOCK AGAIN, for the cancels and the next case: cases 8 and 9 set clocks of their own.
  onTheFilesClock()
  const left = t.client.sqlite
    .prepare("SELECT id FROM records WHERE kind = 'booking' AND json_extract(data, '$.state') IN ('waiting', 'running')")
    .all() as { id: string }[]
  for (const one of left) expect((await ask('POST', `/api/bookings/${one.id}/cancel`, AS_THE_PERSON)).status).toBe(200)
  live.clear()
  await aReading()
})

afterAll(async () => {
  vi.useRealTimers()
  delete process.env.MOLE_OFFICE_GPU_WATCHER
  res.useOsProbe(res.LINUX_PROBE)
  await app.close()
  t.close()
})

describe('what a booking says about its end', () => {
  it('1. a running booking lasts until its program ends; a waiting one keeps its fixed end', async () => {
    const a = await running('wa1', 10, 30, 4101)
    const w = await booked(asAgent('wb1'), 10, 20)
    const gpu = await theGpu(asAgent('wa1'))
    const r = gpu.running.find((one) => one.booking === a.id)
    expect(r?.end.lasts).toBe('until its program ends')
    expect(r?.end.plannedEnd).toBe(a.data.endsAt)
    expect(r?.end.expectedEnd).toBeNull()
    expect(gpu.says).toContain('It lasts until its program ends')
    const waiting = gpu.secondLevel?.line.find((one) => one.booking === w.id)
    expect(waiting?.end.lasts).toBe('at its end')
    expect(waiting?.end.plannedEnd).toBe(w.data.endsAt)
  })

  it('2. a program that reports how far it is gives an expected end at its own pace', async () => {
    const a = await running('wa1', 10, 30, 4102, 30 * MINUTE)
    const reported = await ask('POST', `/api/bookings/${a.id}/progress`, asAgent('wa1'), { done: 10, of: 40 })
    expect(reported.status, JSON.stringify(reported.said)).toBe(200)
    const gpu = await theGpu(AS_THE_PERSON)
    const end = gpu.running.find((one) => one.booking === a.id)?.end
    expect(end?.progress).toMatchObject({ done: 10, of: 40 })
    const at = msOf(end!.progress!.at)
    const startedAt = msOf(live.get(4102)!.startedAt)
    // THE PACE: (at − started) / 10 per step, for the 30 steps left.
    expect(end?.expectedEnd).toBe(localStamp(new Date(at + ((at - startedAt) / 10) * 30)))
    expect(end?.lasts).toBe('until its program ends')
    // A WAITING BOOKING HAS NO PROGRAM TO REPORT ON.
    const w = await booked(asAgent('wb1'), 10, 20)
    expect((await ask('POST', `/api/bookings/${w.id}/progress`, asAgent('wb1'), { done: 1, of: 2 })).status).toBe(409)
  })

  it('3. the page draws it as lasting until its program ends, with its planned and expected ends', async () => {
    const a = await running('wa1', 10, 30, 4103, 30 * MINUTE)
    expect((await ask('POST', `/api/bookings/${a.id}/progress`, asAgent('wa1'), { done: 10, of: 40 })).status).toBe(200)
    const w = await booked(asAgent('wb1'), 10, 20)
    const gpu = await theGpu(AS_THE_PERSON)
    const now = Date.now()
    const end = gpu.running.find((one) => one.booking === a.id)!.end
    const html = renderToStaticMarkup(h(page.GpuCard, { gpu, now }))
    expect(html).toContain('wa1, 10 GiB, until its program ends')
    expect(html).toContain('data-lasts="program"')
    expect(html).toContain(`Planned to end at ${page.whenWord(a.data.endsAt, now)}`)
    expect(html).toContain(`Expected to end about ${page.whenWord(end.expectedEnd!, now)}: 10 of 40 done at ${page.whenWord(end.progress!.at, now)}`)
    expect(html).toContain(`wb1, 10 GiB, ${page.whenWord(w.data.startsAt, now)} to ${page.whenWord(w.data.endsAt, now)}`)
  })
})

describe('extending a booking', () => {
  it('4. its holder extends it with a reason; nothing else moves', async () => {
    // ON THE FILE'S CLOCK. On the real clock at 02:30 on 24 October 2026 in London, a day and two minutes on was a time
    // the clocks show twice, and the door read the first, 23 hours on.
    const pastTheLongest = THE_LONGEST_BOOKING_MINUTES + 2
    const a = await running('wa1', 4, 30, 4104)
    const other = await booked(asAgent('wb1'), 4, 20)
    const until = later(msOf(a.data.endsAt), 60)
    const extended = await ask('POST', `/api/bookings/${a.id}/extend`, asAgent('wa1'), { until, because: 'Test 25 of 42 made-up cases left' })
    expect(extended.status, JSON.stringify(extended.said)).toBe(200)
    const data = stored(a.id)
    expect(data.endsAt).toBe(`${until}:00`)
    expect(data.minutes).toBe(Math.round((msOf(`${until}:00`) - msOf(data.startsAt)) / MINUTE))
    expect(data.extensions).toHaveLength(1)
    expect(data.extensions?.[0]).toMatchObject({ from: a.data.endsAt, to: `${until}:00`, because: 'Test 25 of 42 made-up cases left' })
    expect(data.state).toBe('running')
    expect(stored(other.id)).toEqual(other.data)
    // NO EARLIER END, AND NO LONGER THAN A DAY.
    expect((await ask('POST', `/api/bookings/${a.id}/extend`, asAgent('wa1'), { until: later(msOf(a.data.endsAt), 10), because: 'Test' })).status).toBe(400)
    expect((await ask('POST', `/api/bookings/${a.id}/extend`, asAgent('wa1'), { until: later(msOf(data.startsAt), pastTheLongest), because: 'Test' })).status).toBe(400)
  })

  it('5. a secretary or the owner may extend it; another agent may not, and nobody may without a reason', async () => {
    const a = await running('wa1', 4, 30, 4105)
    const until = later(msOf(a.data.endsAt), 30)
    const byAnother = await ask('POST', `/api/bookings/${a.id}/extend`, asAgent('wb1'), { until, because: 'Test' })
    expect(byAnother.status, JSON.stringify(byAnother.said)).toBe(403)
    expect(byAnother.said['error'] as string).toContain('only its holder, a secretary or the owner')
    expect((await ask('POST', `/api/bookings/${a.id}/extend`, asAgent('wa1'), { until })).status).toBe(400)
    expect((await ask('POST', `/api/bookings/${a.id}/extend`, asAgent('wa1'), { until, because: '  ' })).status).toBe(400)
    expect(stored(a.id).endsAt).toBe(a.data.endsAt)
    const bySecretary = await ask('POST', `/api/bookings/${a.id}/extend`, asAgent('sec-a'), { until, because: 'Test the job needs longer' })
    expect(bySecretary.status, JSON.stringify(bySecretary.said)).toBe(200)
    expect(stored(a.id).extensions?.[0]?.by.kind).toBe('agent')
    // THE OWNER EXTENDS ANY BOOKING, with a reason, like its holder (the secretary's reading, decision kFPdCQrt9kRn).
    const further = later(msOf(stored(a.id).endsAt), 30)
    expect((await ask('POST', `/api/bookings/${a.id}/extend`, AS_THE_PERSON, { until: further })).status).toBe(400)
    const byTheOwner = await ask('POST', `/api/bookings/${a.id}/extend`, AS_THE_PERSON, { until: further, because: 'Test the owner wants it longer' })
    expect(byTheOwner.status, JSON.stringify(byTheOwner.said)).toBe(200)
    expect(stored(a.id).endsAt).toBe(`${further}:00`)
    expect(stored(a.id).extensions?.[1]?.by.kind).toBe('person')
  })

  it('6. takes an extension into another booking’s time, and reminds both holders when the GiB go over the card', async () => {
    const a = await running('wa1', 10, 30, 4106)
    const next = await booked(asAgent('wb1'), 10, 30, 'when-free')
    expect(next.data.startsAt).toBe(a.data.endsAt)
    const taken = await ask('POST', `/api/bookings/${a.id}/extend`, asAgent('wa1'), { until: later(msOf(a.data.endsAt), 30), because: 'Test' })
    expect(taken.status, JSON.stringify(taken.said)).toBe(200)
    expect(taken.said['says'] as string).toContain('Nothing was refused: the 2 holders were reminded.')
    expect(stored(next.id)).toEqual(next.data)
    for (const holder of ['wa1', 'wb1']) {
      const told = linesTo(holder).at(-1)
      expect(told?.body, `${holder} was not reminded`).toMatch(/^Booked GPU memory goes over the card from /)
      expect(told?.saidInFull).toContain('Together that is 20 GiB, and the card has 15 GiB (16303 MiB).')
    }
    expect(linesTo('wa1').at(-1)?.saidInFull).toContain(`your booking ${a.id} declares 10 GiB; wb1's booking ${next.id} declares 10 GiB.`)
  })

  it('7. takes an extension whose GiB stay within the card, with no reminder', async () => {
    const a = await running('wa1', 7, 30, 4107)
    await booked(asAgent('wb1'), 7, 120)
    const before = { wa1: linesTo('wa1').length, wb1: linesTo('wb1').length }
    const taken = await ask('POST', `/api/bookings/${a.id}/extend`, asAgent('wa1'), { until: later(msOf(a.data.endsAt), 30), because: 'Test' })
    expect(taken.status, JSON.stringify(taken.said)).toBe(200)
    expect(taken.said['says'] as string).not.toContain('reminded')
    expect({ wa1: linesTo('wa1').length, wb1: linesTo('wb1').length }, '7 + 7 GiB of a 15 GiB card reminded somebody').toEqual(before)
  })

  it('8. takes an extension with an old reading, and one with no reading, whose reminder says the card was not read', async () => {
    const a = await running('wa1', 10, 30, 4109)
    await booked(asAgent('wb1'), 10, 120)
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 3 * MINUTE })
    const old = await ask('POST', `/api/bookings/${a.id}/extend`, asAgent('wa1'), { until: later(msOf(a.data.endsAt), 30), because: 'Test' })
    expect(old.status, JSON.stringify(old.said)).toBe(200)
    expect(linesTo('wa1').at(-1)?.saidInFull).toContain('and the card has 15 GiB (16303 MiB)')
    // NOT READ SINCE THE SERVER STARTED: the afterEach reading puts the card back.
    ;(await import('../src/server/lib/bookings.ts')).forgetTheGpuReadings()
    const unread = await ask('POST', `/api/bookings/${a.id}/extend`, asAgent('wa1'), { until: later(msOf(stored(a.id).endsAt), 30), because: 'Test' })
    expect(unread.status, JSON.stringify(unread.said)).toBe(200)
    for (const holder of ['wa1', 'wb1']) {
      const told = linesTo(holder).at(-1)
      expect(told?.body, `${holder} was not told the card was not read`).toMatch(/^GPU bookings share the card from .*, and it was not read$/)
      expect(told?.saidInFull).toContain("and the card's size is not known, because the watcher has not read the card since the server started.")
    }
  })

  it('9. refuses an end the clock shows twice, the night the clocks go back, and names those times', async () => {
    const theZoneBefore = process.env.TZ
    // LONDON, where the clocks go back at 02:00 on 25 October 2026. The case checks on the clock which times come twice.
    process.env.TZ = 'Europe/London'
    try {
      vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 24, 23, 10) })
      const shownTwice = (time: string): boolean => later(msOf(`2026-10-25 ${time}:00`), 60) === `2026-10-25 ${time}`
      expect(['00:59', '01:00', '01:59', '02:00'].map(shownTwice)).toEqual([false, true, true, false])
      const a = await running('wa1', 4, 30, 4110)
      const refused = await ask('POST', `/api/bookings/${a.id}/extend`, asAgent('wa1'), { until: '2026-10-25 01:30', because: 'Test the job needs longer' })
      expect(refused.status, JSON.stringify(refused.said)).toBe(400)
      for (const named of ['2026-10-25 01:30', '01:00', '02:00']) expect(refused.said['error'] as string).toContain(named)
      expect(stored(a.id)).toEqual(a.data)
      // THE FIRST TIME SHOWN ONCE AFTER THEM is taken.
      const taken = await ask('POST', `/api/bookings/${a.id}/extend`, asAgent('wa1'), { until: '2026-10-25 02:00', because: 'Test the job needs longer' })
      expect(taken.status, JSON.stringify(taken.said)).toBe(200)
      expect(stored(a.id).endsAt).toBe('2026-10-25 02:00:00')
    } finally {
      if (theZoneBefore === undefined) delete process.env.TZ
      else process.env.TZ = theZoneBefore
    }
  })
})
