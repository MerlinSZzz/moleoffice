// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GPU LINE SAYS WHAT THE CARD HAS FREE (problem IhwlmgpdJD2W; report pWB_1BDz9RkC).
 *
 * Wave 13s round 31. On 9 October the Resources page read "Host GPU: 15 of 15 GiB free now" while a host job
 * with no booking held 4.3 GB of the card, because free counted the bookings only. This file drives the real
 * doors on a fresh office, hands in made-up readings as the watcher, and draws the card from what
 * `GET /api/resources/gpu?secondLevel=show` answered, with no browser. It pins three rules:
 *
 *   1. free uses the watcher's newest reading when it is newer than the watcher's bound: the card less the
 *      larger of what the reading says is in use and what the bookings hold;
 *   2. a reading older than the bound is not used: free counts the bookings only, and the line says so; the
 *      jobs that old reading saw are said in the past, at the time it was read;
 *   3. a job on the card with no booking is listed on the page with its size and its scope.
 *
 * ---------------------------------------------------------------------------------------
 * PROVED BY MUTATION (chapter 5): CONTROL green, then each mutation alone, then RESTORE green
 * ---------------------------------------------------------------------------------------
 *
 * Each file was restored byte-identical after each mutation (sha256 checked before and after each).
 *   1. `theFreeNow` answers `gib: byBookings` for a fresh reading (src/server/lib/bookings.ts) → rule 1 goes red.
 *   2. `theFreeNow` takes a reading as fresh whatever its age (src/server/lib/bookings.ts) → rule 2 goes red.
 *   3. `GpuCard` draws the count of jobs with no booking and not the jobs (src/web/pages/ResourcesPage.tsx)
 *      → rule 3 goes red.
 *   4. `GpuCard` says an old reading's jobs as on the card now (src/web/pages/ResourcesPage.tsx) → rule 2 goes red.
 *
 * OLD (wave 13s round 113): the cases ran on the real clock. Run in the first three minutes after midnight, rule 2's
 * reading, three minutes old, was taken the day before, so the line named its date as well as its time, and the
 * pattern that expects a time alone did not match.
 * NEW: the cases run on a clock in Europe/London that starts at noon summer time on 24 October 2026 and moves on with
 * the real one, so the office's waits run as they do on any day.
 * WHY: a test that reads the real time passes or fails by the hour it is run at.
 * MUTATION (round 113, after a control run, then restored): `said` in src/server/lib/bookings.ts names the date even
 * for a time today → rule 2 goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_READING_IS_OLD_AFTER_MINUTES } from '../src/shared/bookings.ts'
import type { GpuView } from '../src/server/lib/bookings.ts'

// THE CLOCK READS IN EUROPE/LONDON, set before any module reads the zone. The zone before is put back after the file.
const theZoneBefore = vi.hoisted(() => {
  const before = process.env.TZ
  process.env.TZ = 'Europe/London'
  return before
})

type BookingsLib = typeof import('../src/server/lib/bookings.ts')
type Page = typeof import('../src/web/pages/ResourcesPage.tsx')

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

/** Noon summer time on 24 October 2026, an ordinary day: the clock starts there and moves on with the real one. */
const AN_ORDINARY_NOON = Date.UTC(2026, 9, 24, 11, 0, 0)

/** The card that was measured: 16303 MiB, so bookings may add up to 15 GiB. */
const TOTAL_MIB = 16303
/** A made-up job with no booking, a tmux scope holding 4.3 GiB, as on 9 October. */
const THE_TMUX_JOB = { pid: 5100, pgid: 5100, mib: 4403, who: { kind: 'host' as const, unit: 'tmux-spawn-3f1c.scope' } }
/** The display's share, which the card's whole GiB already leaves out. */
const THE_DISPLAY = { pid: 1200, pgid: 1200, mib: 850, who: { kind: 'host' as const, unit: 'gdm.service' } }

let t: TestDb
let app: FastifyInstance
let lib: BookingsLib
let page: Page

async function ask(method: 'GET' | 'POST', path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method, url: path, headers, payload: body as Record<string, unknown> | undefined })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

function theWatcher(): { type: 'agent'; id: string } {
  const row = t.client.sqlite.prepare("SELECT id FROM agents WHERE handle = 'card-watcher'").get() as { id: string } | undefined
  expect(row, 'nothing is registered as card-watcher').toBeDefined()
  return { type: 'agent', id: row!.id }
}

/** A reading of the card with these processes on it, taken `ago` milliseconds before now. */
function read(processes: (typeof THE_TMUX_JOB)[], ago = 0): void {
  const usedMiB = processes.reduce((sum, p) => sum + p.mib, 0)
  lib.takeAGpuReading({ said: { readAt: '2026-10-09 17:55:00', totalMiB: TOTAL_MIB, usedMiB, processes }, actor: theWatcher(), now: Date.now() - ago })
}

async function booked(gib: number): Promise<void> {
  const answer = await ask('POST', '/api/bookings', asAgent('wa1'), { resource: 'gpu', gib, minutes: 60, purpose: 'Test train the kite model', start: 'now' })
  expect(answer.status, JSON.stringify(answer.said)).toBe(201)
}

async function theGpu(): Promise<GpuView> {
  const answer = await ask('GET', '/api/resources/gpu?secondLevel=show', AS_THE_PERSON)
  expect(answer.status, JSON.stringify(answer.said)).toBe(200)
  return answer.said as unknown as GpuView
}

function drawn(gpu: GpuView): string {
  return renderToStaticMarkup(h(page.GpuCard, { gpu, now: Date.now() })).replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
}

beforeAll(async () => {
  // THE GPU WATCHER, a made-up handle: the agent MOLE_OFFICE_GPU_WATCHER names may hand in a reading of the card.
  process.env.MOLE_OFFICE_GPU_WATCHER = 'card-watcher'
  vi.useFakeTimers({ toFake: ['Date'], now: AN_ORDINARY_NOON, shouldAdvanceTime: true })
  t = await freshDb()
  lib = await import('../src/server/lib/bookings.ts')
  page = await import('../src/web/pages/ResourcesPage.tsx')
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['card-watcher', 'wa1']) {
    const answer = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, runtime: 'claude-code', role: 'worker', workArea: [`src/${handle}`] })
    expect(answer.status, `${handle}: ${JSON.stringify(answer.said)}`).toBe(201)
  }
}, 300_000)

afterEach(async () => {
  const left = t.client.sqlite
    .prepare("SELECT id FROM records WHERE kind = 'booking' AND json_extract(data, '$.state') IN ('waiting', 'running')")
    .all() as { id: string }[]
  for (const one of left) expect((await ask('POST', `/api/bookings/${one.id}/cancel`, AS_THE_PERSON)).status).toBe(200)
})

afterAll(async () => {
  delete process.env.MOLE_OFFICE_GPU_WATCHER
  await app.close()
  t.close()
  vi.useRealTimers()
  if (theZoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = theZoneBefore
})

describe('the free figure', () => {
  it('1. uses a reading newer than the bound: the card less the larger of the reading and the bookings', async () => {
    read([THE_DISPLAY, THE_TMUX_JOB])
    let gpu = await theGpu()
    // (16303 − 5253) MiB is 10.8 GiB, so 10 whole GiB are free; the bookings alone would say 15.
    expect(gpu.cardGiB).toBe(15)
    expect(gpu.freeGiBNow, gpu.says).toBe(10)
    expect(gpu.freeCounts).toMatchObject({ from: 'the card', bookedGiB: 0, unbookedMiB: 5253, unbooked: 2 })
    expect(gpu.says).toBe('Host GPU: 10 of 15 GiB free now. 2 jobs with no booking hold 5.1 GiB. Nothing is waiting.')
    expect(drawn(gpu)).toContain('10 of 15 GiB free now')

    // A booking larger than what the reading sees in use: the bookings are the larger, and they count.
    await booked(12)
    gpu = await theGpu()
    expect(gpu.freeGiBNow, gpu.says).toBe(3)
  })

  it(`2. falls back to the bookings when the reading is older than ${String(A_READING_IS_OLD_AFTER_MINUTES)} minutes, and says so`, async () => {
    read([THE_DISPLAY, THE_TMUX_JOB], (A_READING_IS_OLD_AFTER_MINUTES + 1) * 60_000)
    const gpu = await theGpu()
    expect(gpu.freeGiBNow, gpu.says).toBe(15)
    expect(gpu.freeCounts).toMatchObject({ from: 'bookings only', because: 'an old reading' })
    expect(gpu.says).toMatch(/^Host GPU: 15 of 15 GiB free now, counting bookings only\. The watcher has not read the card since \d\d:\d\d\./)
    const html = drawn(gpu)
    expect(html).toContain('data-free="bookings-only"')
    expect(html).toMatch(/This counts bookings only: the watcher has not read the card since \d\d:\d\d\./)
    // The old reading's job is said in the past, at the time it was read, and not as on the card now.
    expect(html).toMatch(/At \d\d:\d\d, 2 processes on the card had no booking\./)
    expect(html).not.toContain('on the card have no booking')
  })
})

describe('a job with no booking', () => {
  it('3. is listed on the page with its size and its scope', async () => {
    read([THE_TMUX_JOB])
    const gpu = await theGpu()
    expect(gpu.secondLevel?.withoutABooking.map((p) => p.pid)).toEqual([5100])
    const html = drawn(gpu)
    expect(html).toContain('1 process on the card has no booking.')
    expect(html).toContain('No booking: 4.3 GiB, tmux-spawn-3f1c.scope, process 5100')
  })
})
