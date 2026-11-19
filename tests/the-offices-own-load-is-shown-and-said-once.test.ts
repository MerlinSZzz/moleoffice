// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S OWN READ TIME, CPU AND MEMORY ARE SHOWN, AND A NUMBER THAT STAYS OUT OF RANGE IS SAID ONCE. Wave 13y
 * round 21: development may use most of the machine, but the office itself must not waste it.
 *
 * WHAT THIS FILE PROVES, in its own empty office, with made-up readings where a number has to be out of range:
 * 1. Before the first reading there is no reading, and every range is its default with nobody having chosen. The reads
 *    the office answers are counted by the request hook: three GETs make a reading of three reads.
 * 2. A number above its top at ten readings in a row is said once to the secretaries, in one line to the Secretariat
 *    group delivered to them; not at nine, and not again at the twentieth. Back in range and out for ten more, it is
 *    said a second time.
 * 3. The owner changes a top with no reason; a secretary with its own key only with a reason; any other agent is
 *    refused; a top outside its bounds, or a body naming no top, is refused; null puts the default back. Each change is
 *    kept with who and why.
 * 4. A stored top outside its bounds is refused with a 500, not read as the default.
 *
 * WHERE THE RULES LIVE: src/shared/office-load.ts (the numbers, defaults and bounds), src/server/lib/office-load.ts (the
 * reading and the line) and src/server/api/office-load.ts (who may change a range).
 *
 * CONTROL: all pass at the tip. MUTATIONS, each red, then put back: the line is written at every reading out of range
 * past the tenth, not once (case 2); the request hook in src/server/index.ts notes no read (case 1); a secretary may
 * change a range with no reason (case 3).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { OFFICE_LOAD_DEFAULTS } from '../src/shared/office-load.ts'

type LoadLib = typeof import('../src/server/lib/office-load.ts')

let t: TestDb
let app: FastifyInstance
let load: LoadLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const keyOf: Record<string, string> = {}
const idOf: Record<string, string> = {}

async function register(handle: string, role: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role } })
  expect(reply.statusCode, `registering ${handle}: ${reply.body.slice(0, 300)}`).toBe(201)
  keyOf[handle] = String((reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
  expect(keyOf[handle], `${handle} was given a key`).toMatch(/^[0-9a-f]{64}$/)
  idOf[handle] = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** The headers of an agent's request, proved by its own key. */
function asAgent(handle: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-key': keyOf[handle]!,
  }
}

function press(headers: Record<string, string>, payload: object) {
  return app.inject({ method: 'POST', url: '/api/office/load-ranges', headers, payload })
}

/** The lines the office wrote about its own load: which number, and to whom they were delivered. */
function theLoadLines(): { number: string; deliveredTo: string[]; said: string }[] {
  return (
    t.client.sqlite
      .prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.extra.officeLoad.number') IS NOT NULL ORDER BY rowid")
      .all() as { data: string }[]
  ).map((one) => {
    const data = JSON.parse(one.data) as { extra: { officeLoad: { number: string } }; deliveredOnlyTo?: { id: string }[]; saidInFull?: string }
    return { number: data.extra.officeLoad.number, deliveredTo: (data.deliveredOnlyTo ?? []).map((who) => who.id), said: data.saidInFull ?? '' }
  })
}

/** The newest kept change to the ranges. */
async function theLastChange(): Promise<{ by: { type: string; id: string }; to: string | null } | null> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/setting-changes', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  return reply.json().settings['office-load-ranges']
}

const R0 = new Date('2026-10-11T09:00:00')
const minute = (n: number): Date => new Date(R0.getTime() + n * 60_000)

beforeAll(async () => {
  t = await freshDb()
  load = await import('../src/server/lib/office-load.ts')
  app = (await apiApp()).app
  await app.ready()
  await register('clerk', 'secretary')
  await register('mason', 'worker')
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("the office's own load", () => {
  it('1. has no reading before the first, reads the defaults, and counts the reads the office answers', async () => {
    load.forgetTheOfficeLoad()
    const first = await app.inject({ method: 'GET', url: '/api/office/load', headers: AS_THE_PERSON })
    expect(first.statusCode, first.body.slice(0, 300)).toBe(200)
    const before = first.json()
    expect(before.latest).toBeNull()
    expect(before.ranges).toEqual([
      { number: 'readMs', top: OFFICE_LOAD_DEFAULTS.readMs, nobodyChose: true, default: OFFICE_LOAD_DEFAULTS.readMs },
      { number: 'cpuPercent', top: OFFICE_LOAD_DEFAULTS.cpuPercent, nobodyChose: true, default: OFFICE_LOAD_DEFAULTS.cpuPercent },
      { number: 'memoryMb', top: OFFICE_LOAD_DEFAULTS.memoryMb, nobodyChose: true, default: OFFICE_LOAD_DEFAULTS.memoryMb },
    ])
    await app.inject({ method: 'GET', url: '/api/office/load', headers: AS_THE_PERSON })
    await app.inject({ method: 'GET', url: '/api/office/load', headers: AS_THE_PERSON })
    // A WRITE IS NOT A READ, and is not counted.
    await press(AS_THE_PERSON, { readMs: null })
    const reading = load.takeAReading(minute(0))
    expect(reading.reads, 'the three GETs above, and nothing else').toBe(3)
    expect(reading.readMedianMs).not.toBeNull()
    expect(reading.readSlowestMs!).toBeGreaterThanOrEqual(reading.readMedianMs!)
    expect(reading.memoryMb).toBeGreaterThan(0)
    const after = (await app.inject({ method: 'GET', url: '/api/office/load', headers: AS_THE_PERSON })).json()
    expect(after.latest).toEqual(reading)
  })

  it('2. a number out of range at ten readings in a row is said once to the secretaries, and again after it came back', () => {
    load.forgetTheOfficeLoad()
    const high = { memoryMb: OFFICE_LOAD_DEFAULTS.memoryMb + 1, cpuPercent: 0 }
    for (let n = 1; n <= 9; n++) load.takeAReading(minute(n), high)
    expect(theLoadLines(), 'nothing at nine readings').toEqual([])
    load.takeAReading(minute(10), high)
    const once = theLoadLines()
    expect(once).toHaveLength(1)
    expect(once[0]).toMatchObject({ number: 'memoryMb', deliveredTo: [idOf['clerk']] })
    expect(once[0]!.said).toContain(`above its top of ${String(OFFICE_LOAD_DEFAULTS.memoryMb)} MB at 10 readings in a row`)
    for (let n = 11; n <= 20; n++) load.takeAReading(minute(n), high)
    expect(theLoadLines(), 'still once at the twentieth').toHaveLength(1)
    const standing = load.theOfficeLoad().standing.find((one) => one.number === 'memoryMb')!
    expect(standing).toMatchObject({ outFor: 20, toldIn: expect.any(String) })

    load.takeAReading(minute(21), { memoryMb: 100, cpuPercent: 0 })
    expect(load.theOfficeLoad().standing.find((one) => one.number === 'memoryMb')).toMatchObject({ outFor: 0, outSince: null, toldIn: null })
    for (let n = 22; n <= 31; n++) load.takeAReading(minute(n), high)
    expect(theLoadLines(), 'a second run out of range is said once more').toHaveLength(2)
  })

  it('3. the owner, or a secretary with a reason, changes a range; anybody else is refused', async () => {
    const byTheOwner = await press(AS_THE_PERSON, { memoryMb: 4096 })
    expect(byTheOwner.statusCode, byTheOwner.body.slice(0, 300)).toBe(200)
    expect(byTheOwner.json().find((one: { number: string }) => one.number === 'memoryMb')).toMatchObject({ top: 4096, nobodyChose: false })
    expect((await theLastChange())?.by).toEqual({ type: 'human', id: THE_PERSON })

    const without = await press(asAgent('clerk'), { cpuPercent: 80 })
    expect(without.statusCode, without.body.slice(0, 300)).toBe(400)
    expect(without.body).toContain('gives a reason')
    const withReason = await press(asAgent('clerk'), { cpuPercent: 80, because: 'A build of the web app takes most of a core.' })
    expect(withReason.statusCode, withReason.body.slice(0, 300)).toBe(200)
    expect((await theLastChange())?.to).toContain('A build of the web app takes most of a core.')

    const refused = await press(asAgent('mason'), { cpuPercent: 90, because: 'faster' })
    expect(refused.statusCode, refused.body.slice(0, 300)).toBe(403)
    for (const payload of [{ memoryMb: 10 }, { memoryMb: 3000.5 }, { readMs: 'slow' }, {}, { memoryMb: 4096, also: 1 }]) {
      const wrong = await press(AS_THE_PERSON, payload)
      expect(wrong.statusCode, `${JSON.stringify(payload)}: ${wrong.body.slice(0, 300)}`).toBe(400)
    }
    const ranges = load.theOfficeLoadRanges()
    expect(ranges.map((one) => one.top), 'nothing refused was changed').toEqual([OFFICE_LOAD_DEFAULTS.readMs, 80, 4096])

    const back = await press(AS_THE_PERSON, { memoryMb: null, cpuPercent: null })
    expect(back.statusCode, back.body.slice(0, 300)).toBe(200)
    expect(load.theOfficeLoadRanges().every((one) => one.nobodyChose)).toBe(true)
  })

  it('4. a stored top outside its bounds is refused, not read as the default', async () => {
    t.client.sqlite.prepare('UPDATE installation SET load_memory_mb_top = 1 WHERE only_row = 1').run()
    try {
      const reply = await app.inject({ method: 'GET', url: '/api/office/load', headers: AS_THE_PERSON })
      expect(reply.statusCode).toBe(500)
      expect(reply.body).toContain('stored as 1 in installation.load_memory_mb_top')
    } finally {
      t.client.sqlite.prepare('UPDATE installation SET load_memory_mb_top = NULL WHERE only_row = 1').run()
    }
  })
})
