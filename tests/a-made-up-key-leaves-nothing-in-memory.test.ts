// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MADE-UP KEY LEAVES NOTHING IN MEMORY, AND THE MEMORY OF A KEY'S USE LASTS A MINUTE. Problem
 * KJWqE5DQC5TS.
 *
 * The office writes `held_keys.last_used_at` after the reply, at most once a minute per key. To keep to
 * once a minute it remembers when it last wrote each key. That memory was kept under the hash of
 * whatever key the request carried, and nothing removed an entry, so a caller could make it grow by
 * sending made-up keys. This file drives real requests through one scratch office (`app.inject`) and
 * reads the size of that memory with `howManyKeysTheUseMemoryHolds`:
 *
 *   made-up   100 real requests and then 10,000 calls of the after-reply hook's own function, each with
 *             a different made-up key, leave the memory empty; one request with a live agent key then
 *             leaves one entry. The 10,000 go straight to `recordTheUseOfTheKeyOn`, the one function
 *             the hook calls, because a real request costs about 5 ms here, so 10,000 of them took 52 s.
 *   window    a key used, the clock moved on past the minute, another key used: the first entry is gone
 *             and only the second is left.
 *   write     a live key's use is written; a second use within the minute writes nothing new; a use
 *             after the minute writes again.
 *
 * Only `Date` is faked, never the timers, so the requests and the hook after the reply run as usual.
 *
 * MUTATIONS (after a green control; each red, then restored), in `recordTheUseOfTheKeyOn` in
 * src/server/lib/keys.ts:
 *   made-up   add `lastWrittenAt.set(keyHash(presented), at)` after `const at = Date.now()`, so the
 *             memory is kept under what the request carried again.
 *   window    comment out `lastWrittenAt.delete(id)`, so old entries are never dropped.
 *   write     drop `|| lastWrittenAt.has(held.id)` from the early return, so every use is written.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { KEY_HEADER } from '../src/config/key-header.mjs'

let t: TestDb
let app: FastifyInstance
let keys: typeof import('../src/server/lib/keys.ts')
const liveKeys: Record<string, string> = {}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Register an agent and keep the key the office answered, which is a live held key. */
async function registerAnAgent(handle: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle, name: handle, role: 'worker' },
  })
  expect(reply.statusCode, 'the registration was not answered 201').toBe(201)
  const key = String((reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  liveKeys[handle] = key
}

/** One real request carrying this key and nothing else, then a turn so the after-reply hook has run. */
async function aRequestWith(key: string): Promise<void> {
  await app.inject({
    method: 'GET',
    url: '/api/health',
    headers: { 'x-mole-office-workspace': 'default', [KEY_HEADER]: key },
  })
  await new Promise((done) => setImmediate(done))
}

/** The stored last use of the live key of the agent with this handle. */
function lastUsedAtOf(handle: string): string | null {
  const row = t.client.sqlite
    .prepare(
      "SELECT h.last_used_at AS at FROM held_keys h JOIN agents a ON h.whose_id = a.id " +
        "WHERE h.whose_kind = 'agent' AND a.handle = ? AND h.revoked_at IS NULL",
    )
    .get(handle) as { at: string | null } | undefined
  expect(row, `no live key row for ${handle}`).toBeDefined()
  return row!.at
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  keys = await import('../src/server/lib/keys.ts')
  for (const handle of ['use-one', 'use-two', 'use-three']) await registerAnAgent(handle)
})

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the memory of when a key was last written', () => {
  it('holds nothing for 10,000 made-up keys, and one entry for one live key', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-26T10:00:00Z'))
    expect(keys.howManyKeysTheUseMemoryHolds(), 'the memory was not empty at the start').toBe(0)
    for (let i = 0; i < 100; i += 1) await aRequestWith(randomBytes(32).toString('hex'))
    expect(keys.howManyKeysTheUseMemoryHolds(), 'made-up keys on real requests left entries').toBe(0)
    for (let i = 0; i < 10_000; i += 1) {
      const request = { headers: { [KEY_HEADER]: randomBytes(32).toString('hex') } }
      keys.recordTheUseOfTheKeyOn(request as unknown as FastifyRequest)
    }
    expect(keys.howManyKeysTheUseMemoryHolds(), 'made-up keys left entries in the memory').toBe(0)
    await aRequestWith(liveKeys['use-one']!)
    expect(keys.howManyKeysTheUseMemoryHolds(), 'one live key used did not leave exactly one entry').toBe(1)
    // Move past the minute so the next case starts from an empty memory.
    vi.setSystemTime(new Date('2026-09-26T10:05:00Z'))
  }, 60_000)

  it('drops an entry once it is a minute old', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-26T11:00:00Z'))
    await aRequestWith(liveKeys['use-one']!)
    expect(keys.howManyKeysTheUseMemoryHolds(), 'one live key used did not leave exactly one entry').toBe(1)
    vi.setSystemTime(new Date('2026-09-26T11:01:01Z'))
    await aRequestWith(liveKeys['use-two']!)
    expect(keys.howManyKeysTheUseMemoryHolds(), 'the entry older than a minute was kept').toBe(1)
  })

  it('writes a live key use once, not again within the minute, and again after it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-26T12:00:00Z'))
    expect(lastUsedAtOf('use-three'), 'the key had a recorded use before it was used').toBeNull()
    await aRequestWith(liveKeys['use-three']!)
    const first = lastUsedAtOf('use-three')
    expect(first, 'the use of a live key was not written').not.toBeNull()

    vi.setSystemTime(new Date('2026-09-26T12:00:30Z'))
    await aRequestWith(liveKeys['use-three']!)
    expect(lastUsedAtOf('use-three'), 'a second use within the minute was written').toBe(first)

    vi.setSystemTime(new Date('2026-09-26T12:01:01Z'))
    await aRequestWith(liveKeys['use-three']!)
    const third = lastUsedAtOf('use-three')
    expect(third, 'a use after the minute was not written').not.toBe(first)
    expect(third! > first!, 'the use after the minute was not written as later').toBe(true)
  })
})
