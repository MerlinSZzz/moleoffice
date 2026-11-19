// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RESOURCES PAGE: THE GPU'S CARD, THE OWNER'S TWO CHOICES, AND WHO MAY GRANT.
 *
 * Wave 13s round 30, the design's round 2 (design peyJSnLoz_Bk), on two
 * decisions. This file drives the real doors on a fresh office with a fake
 * process table, then draws the card from what `GET /api/resources/gpu?secondLevel=show` answered, with no
 * browser. It pins four rules:
 *
 *   1. the card draws its three columns from the GET: in use now, booked next, and this week, with
 *      "Without a booking" counted from the watcher's readings;
 *   2. the owner's booking window draws "Go first now" and "Let … finish first" when something runs;
 *   3. a secretary, raised or not, is not the owner, so its card draws no booking window and no choices;
 *   4. the grant buttons are drawn only for those whose answer counts: the owner and the secretary asked.
 *
 * ---------------------------------------------------------------------------------------
 * PROVED BY MUTATION (chapter 5): CONTROL green, then each mutation alone, then RESTORE green
 * ---------------------------------------------------------------------------------------
 *
 * Each file was restored byte-identical after each mutation (sha256 checked before and after each).
 *   1. `theWeekNow` answers `withoutABookingMinutes: 0` whatever was counted (src/server/lib/bookings.ts)
 *      → rule 1 goes red.
 *   2. `BookingWindow` draws the two choices only when nothing runs (src/web/pages/ResourcesPage.tsx)
 *      → rule 2 goes red.
 *   3. `theGpuNow` answers `theOwner: true` for every caller (src/server/lib/bookings.ts) → rule 3 goes red.
 *   4. `GoFirstAsked` draws the buttons whatever `mayAnswer` says (src/web/pages/ResourcesPage.tsx)
 *      → rule 4 goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { GpuView } from '../src/server/lib/bookings.ts'
import { GRACE_MINUTES } from '../src/shared/bookings.ts'
import { createI18n } from '../src/shared/i18n.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type BookingsLib = typeof import('../src/server/lib/bookings.ts')
type Page = typeof import('../src/web/pages/ResourcesPage.tsx')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

const en = createI18n('en')

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

let t: TestDb
let app: FastifyInstance
let res: ResourcesLib
let lib: BookingsLib
let page: Page
const live = new Map<number, OsProcess>()

function fakeProbe(): OsProbe {
  return {
    platform: 'fake',
    // Process state is synthetic; avatar uploads still use the real bounded fixture codec.
    runAvatarCodec: input => res.LINUX_PROBE.runAvatarCodec!(input),
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

async function ask(method: 'GET' | 'POST', path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method, url: path, headers, payload: body as Record<string, unknown> | undefined })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function register(handle: string, role: string, workArea: string[], by: Record<string, string>): Promise<void> {
  const answer = await ask('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role, workArea })
  expect(answer.status, `${handle}: ${JSON.stringify(answer.said)}`).toBe(201)
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

async function booked(by: Record<string, string>, gib: number, minutes: number, purpose: string): Promise<string> {
  const answer = await ask('POST', '/api/bookings', by, { resource: 'gpu', gib, minutes, purpose, start: 'now' })
  expect(answer.status, JSON.stringify(answer.said)).toBe(201)
  return (answer.said['booking'] as { id: string }).id
}

function start(pid: number): void {
  live.set(pid, { pid, pgid: pid, ppid: 1, command: `test-run-${String(pid)}`, startedAt: '2026-10-08 10:00:00' })
}

async function theGpu(by: Record<string, string>): Promise<GpuView> {
  const answer = await ask('GET', '/api/resources/gpu?secondLevel=show', by)
  expect(answer.status, JSON.stringify(answer.said)).toBe(200)
  return answer.said as unknown as GpuView
}

/** The card as the page draws it, with its style taken out. */
function drawn(gpu: GpuView, windowOpen = false): string {
  return renderToStaticMarkup(h(page.GpuCard, { gpu, now: Date.now(), windowOpen })).replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
}

/** A running booking of wa1's, with its program on the fake machine. */
async function aRunningBooking(): Promise<string> {
  const id = await booked(asAgent('wa1'), 10, 60, 'Test train the kite model')
  start(4100)
  const named = await ask('POST', `/api/bookings/${id}/program`, asAgent('wa1'), { pid: 4100 })
  expect(named.status, JSON.stringify(named.said)).toBe(200)
  return id
}

beforeAll(async () => {
  // THE GPU WATCHER, a made-up handle: the agent MOLE_OFFICE_GPU_WATCHER names may hand in a reading of the card.
  process.env.MOLE_OFFICE_GPU_WATCHER = 'card-watcher'
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  lib = await import('../src/server/lib/bookings.ts')
  page = await import('../src/web/pages/ResourcesPage.tsx')
  app = (await apiApp()).app
  await app.ready()
  res.useOsProbe(fakeProbe())

  await register('sec-a', 'supervisor', ['src/sec-a'], AS_THE_PERSON)
  expect((await ask('POST', '/api/roles/card/sec-a', AS_THE_PERSON, { role: 'secretary' })).status).toBe(201)
  await register('sec-b', 'supervisor', ['src/sec-b'], AS_THE_PERSON)
  expect((await ask('POST', '/api/roles/card/sec-b', AS_THE_PERSON, { role: 'secretary' })).status).toBe(201)
  await register('wa1', 'worker', ['src/a1'], asAgent('sec-a'))
  await register('wa2', 'worker', ['src/a2'], asAgent('sec-a'))
  await register('card-watcher', 'worker', ['src/card-watcher'], AS_THE_PERSON)

  const read = await ask('POST', '/api/resources/gpu/reading', asAgent('card-watcher'), { readAt: '2026-10-08 18:00:00', totalMiB: 16303, usedMiB: 900, processes: [] })
  expect(read.status, JSON.stringify(read.said)).toBe(200)
}, 300_000)

afterEach(async () => {
  const left = t.client.sqlite
    .prepare("SELECT id FROM records WHERE kind = 'booking' AND json_extract(data, '$.state') IN ('waiting', 'running')")
    .all() as { id: string }[]
  for (const one of left) expect((await ask('POST', `/api/bookings/${one.id}/cancel`, AS_THE_PERSON)).status).toBe(200)
  live.clear()
})

afterAll(async () => {
  delete process.env.MOLE_OFFICE_GPU_WATCHER
  res.useOsProbe(res.LINUX_PROBE)
  await app.close()
  t.close()
})

describe('the card', () => {
  it('1. draws its three columns from the GET, with "Without a booking" counted from the readings', async () => {
    await aRunningBooking()
    const waiting = await booked(asAgent('wa2'), 10, 30, 'Test sort the photographs')
    // THREE READINGS A MINUTE APART, each with the booked program and one process no booking accounts for.
    const watcher = { type: 'agent' as const, id: idOf('card-watcher') }
    const base = Math.max(Date.now() - 180_000, lib.theWeekFrom(Date.now()))
    const processes = [
      { pid: 4100, pgid: 4100, mib: 9000, who: { kind: 'host' as const, unit: 'test-kite.service' } },
      { pid: 5100, pgid: 5100, mib: 600, who: { kind: 'unknown' as const, why: 'a test process nobody booked' } },
    ]
    for (const step of [0, 1, 2]) {
      lib.takeAGpuReading({ said: { readAt: '2026-10-08 18:01:00', totalMiB: 16303, usedMiB: 9600, processes }, actor: watcher, now: base + step * 60_000 })
    }
    const gpu = await theGpu(AS_THE_PERSON)
    expect(gpu.secondLevel?.week.withoutABookingMinutes, gpu.secondLevel?.week.says).toBe(2)
    expect(gpu.secondLevel?.week.byHolder.map((one) => one.minutes)).toEqual([2])

    const html = drawn(gpu)
    for (const column of ['now', 'next', 'week']) expect(html).toContain(`data-column="${column}"`)
    const [, now = '', next = '', week = ''] = html.split(/data-column="(?:now|next|week)"/)
    expect(now).toContain('wa1, 10 GiB, until')
    expect(now).toContain('Its program is running.')
    expect(now).toContain('1 process on the card has no booking.')
    expect(next).toContain('wa2, 10 GiB,')
    expect(next).toContain('Test sort the photographs')
    expect(week).toContain('wa1')
    expect(week).toMatch(/Without a booking<\/span><span>2 min/)
    expect(week).toContain('Hours with a job on the card, as the GPU watcher saw them.')
    expect(waiting).not.toBe('')
  })
})

describe('the owner’s window', () => {
  it('2. draws "Go first now" and "Let … finish first" to the owner when something runs', async () => {
    await aRunningBooking()
    const gpu = await theGpu(AS_THE_PERSON)
    expect(gpu.you.theOwner).toBe(true)
    const html = drawn(gpu, true)
    expect(html).toContain('Book the GPU for you')
    expect(html).toContain('Go first now')
    expect(html).toContain(en.t('resources.book.goFirstSays', { n: GRACE_MINUTES }))
    expect(html).toContain('Let wa1 finish first')
    expect(html).toContain('data-choices="owner"')
  })

  it('3. draws no window and no choices to a secretary, raised or not', async () => {
    await aRunningBooking()
    for (const raised of [false, true]) {
      if (raised) {
        const pressed = await ask('POST', '/api/roles/elevation/sec-a', { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'a test raises it', endsWhen: 'when you say' })
        expect(pressed.status, JSON.stringify(pressed.said)).toBe(201)
      }
      const gpu = await theGpu(asAgent('sec-a'))
      expect(gpu.you.theOwner, raised ? 'a raised secretary was read as the owner' : 'a secretary was read as the owner').toBe(false)
      const html = drawn(gpu, true)
      expect(html).not.toContain('Book the GPU for me')
      expect(html).not.toContain('Go first now')
      expect(html).not.toContain('data-choices')
      expect(html).toContain(en.t('resources.book.onlyTheOwner'))
    }
  })
})

describe('who may grant', () => {
  it('4. draws the grant buttons to the owner and the secretary asked, and to nobody else', async () => {
    const holders = await booked(asAgent('wa1'), 10, 60, 'Test train the kite model')
    const mine = await booked(asAgent('wa2'), 10, 30, 'Test sort the photographs')
    const asked = await ask('POST', `/api/bookings/${mine}/go-first`, asAgent('wa2'), { ahead: holders })
    expect(asked.status, JSON.stringify(asked.said)).toBe(200)
    for (const [who, headers, may] of [
      ['the owner', AS_THE_PERSON, true],
      ['sec-a, whose agents these are', asAgent('sec-a'), true],
      ['sec-b, a secretary not asked', asAgent('sec-b'), false],
      ['wa1, the holder', asAgent('wa1'), false],
    ] as const) {
      const gpu = await theGpu(headers)
      const line = gpu.secondLevel?.line.find((l) => l.booking === mine)
      expect(line?.mayAnswer, who).toBe(may)
      const html = drawn(gpu)
      expect(html, who).toContain('wa2 asks to go before wa1.')
      expect(html.includes('Let it go first') && html.includes('Keep its place'), who).toBe(may)
    }
  })
})
