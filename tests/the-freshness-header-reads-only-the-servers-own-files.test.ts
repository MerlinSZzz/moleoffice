// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FRESHNESS HEADER ON A REPLY IS WORKED OUT FROM THE SERVER'S OWN FILES, AND THE PAGE'S ARE NOT READ FOR IT.
 * Wave 13y round 33, item 3.6.
 *
 * MEASURED FIRST: on 14 October 2026, on three copies of an office, the first ask of GET /api/sessions?only=running after
 * a start took 258 to 350 ms, and a warm ask 26 to 127 ms. Working out the two reply headers once before the first ask
 * took 207 to 248 ms, and the first ask then took 51 to 167 ms. The freshness header's reading walked the 567 files the
 * browser app is built from and read the built page's stamp, and the header carries neither: its three values are the
 * server's own verdict, how long it has been stale, and the grace. Every later reply looked at the time of each of those
 * 567 files again.
 *
 * WHAT THIS HOLDS:
 *   - a served reply carries the freshness header, and working it out asks for the newest file of the server's program
 *     and of no other, and reads no build stamp;
 *   - the runtime record's freshness still reads the page's half: the newest file of the browser app's program, and the
 *     built page's stamp.
 *
 * WHAT IT DOES NOT HOLD. Whether the verdict is right; freshness.test.ts and
 * staleness-is-counted-from-when-it-started.test.ts hold that.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** Every program entry the newest source was asked for, and every folder whose build stamp was read, while this file runs. */
const asked = vi.hoisted(() => ({ entries: [] as string[], stamps: [] as unknown[] }))

vi.mock('../src/config/newest-source.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/newest-source.mjs')>()
  return {
    ...real,
    newestSourceBuiltFrom: (entry: string, root?: string) => {
      asked.entries.push(entry)
      return real.newestSourceBuiltFrom(entry, root)
    },
  }
})

vi.mock('../src/config/build-stamp.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/build-stamp.mjs')>()
  return {
    ...real,
    readTheBuildStamp: (...args: Parameters<typeof real.readTheBuildStamp>) => {
      asked.stamps.push(args[0])
      return real.readTheBuildStamp(...args)
    },
  }
})

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** What was asked for while `act` ran. */
async function askedDuring(act: () => Promise<void>): Promise<{ entries: string[]; stamps: unknown[] }> {
  const entries = asked.entries.length
  const stamps = asked.stamps.length
  await act()
  return { entries: asked.entries.slice(entries), stamps: asked.stamps.slice(stamps) }
}

it("a reply's freshness header asks for the newest file of the server's program and of no other, and reads no build stamp", async () => {
  const { THE_SERVER_ENTRY } = await import('../src/config/newest-source.mjs')
  const { FRESHNESS_HEADER, parseFreshnessHeader } = await import('../src/config/freshness-header.mjs')
  let header: unknown
  const read = await askedDuring(async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/sessions?only=running' })
    expect(reply.statusCode, reply.body).toBe(200)
    header = reply.headers[FRESHNESS_HEADER]
  })
  expect(typeof header, 'the reply carries the freshness header').toBe('string')
  expect(parseFreshnessHeader(header as string), 'the header reads back').toMatchObject({ ok: true })
  expect(read.entries).toEqual([THE_SERVER_ENTRY])
  expect(read.stamps).toEqual([])
})

it("the runtime record's freshness reads the page's half: the newest file of the browser app's program, and the built page's stamp", async () => {
  const { THE_PAGES_ENTRY } = await import('../src/config/newest-source.mjs')
  const read = await askedDuring(async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/runtime/freshness' })
    expect(reply.statusCode, reply.body).toBe(200)
  })
  expect(read.entries).toContain(THE_PAGES_ENTRY)
  expect(read.stamps.length).toBeGreaterThan(0)
})
