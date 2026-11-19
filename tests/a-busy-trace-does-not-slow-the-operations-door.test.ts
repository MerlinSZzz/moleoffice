// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PER-OPERATION TABLE ANSWERS IN UNDER A SECOND WHEN ONE TRACE WRITES AND READS ONE THING ALL DAY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/usage/operations` says, for each write operation, how often a read of the same thing
 * followed inside ten seconds in the same trace. Until 27 September 2026 it worked that out by
 * listing every read of each trace and thing, and walking that list from its start for every write.
 * A bridge that keeps one trace open writes and reads one agent's handle thousands of times, so the
 * walk grew with the square of its calls. On a copy of the owner's office, taken in September 2026,
 * one trace held 120,662 reads and 83,802 writes of one handle, and the door took 4.0 to 4.5 seconds
 * to answer. Problem `Hy13YXeH7xHL` is about the same door.
 *
 * Now SQLite answers it: for each write it looks only at the rows of that trace in the ten seconds
 * after it, through the index on trace and time.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE WRITES
 * ---------------------------------------------------------------------------------------
 *
 * One trace, one thing, 200,000 calls one second apart: two writes and three reads in every five
 * calls, and each write is read back one second later. So the answer is known before the door is
 * asked: 80,000 writes, every one of them read straight back. Measured on 27 September 2026 on
 * a sandbox machine with 20 cores and a load average of about 6 from other work, the door took 2.3
 * to 2.9 seconds on these rows before the change and 130 to 290 ms after it. The failure message
 * prints the milliseconds, because a timing test is only honest if it says what it measured.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** How many calls the one busy trace makes. */
const CALLS = 200_000

/** Two in every five calls are writes. */
const WRITES = (CALLS / 5) * 2

/** What a read may take before a person gives up on it, the same line as the other usage reads. */
const A_SECOND = 1000

const PROJECT = 'default'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const insert = t.client.sqlite.prepare(
    'insert into api_calls (id, at_ms, operation, effect, method, waits, status, ms, bytes, workspace_id, actor_type, ' +
      "actor_id, identity_source, trace_id, target_id) values (?, ?, ?, ?, ?, 0, 200, 3, 120, ?, 'agent', 'a-bridge', " +
      "'header', 'one-busy-trace', 'one-handle')",
  )
  const now = Date.now()
  t.client.sqlite.transaction(() => {
    for (let n = 0; n < CALLS; n += 1) {
      // Calls 0 and 2 of every five are writes; calls 1 and 3 read the same handle one second
      // after each write; call 4 is one more read.
      const write = n % 5 === 0 || n % 5 === 2
      insert.run(
        `busy-${String(n)}`,
        now - (CALLS - n) * 1000,
        write ? 'handle.took' : 'handle.waiting',
        write ? 'write' : 'read',
        write ? 'POST' : 'GET',
        PROJECT,
      )
    }
  })()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a busy trace does not slow the per-operation table', () => {
  it('answers GET /api/usage/operations in under a second, with every write read straight back', async () => {
    const started = Date.now()
    const reply = await app.inject({
      method: 'GET',
      url: '/api/usage/operations',
      headers: { 'x-mole-office-workspace': PROJECT },
    })
    const ms = Date.now() - started
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
    const body = reply.json() as { operations: { operation: string; readBackShare: number | null; readBackOf: number }[] }
    const took = body.operations.find((row) => row.operation === 'handle.took')
    expect(took, 'the write operation is missing from the table').toBeDefined()
    expect(took!.readBackOf).toBe(WRITES)
    expect(took!.readBackShare).toBe(1)
    expect(
      ms,
      `GET /api/usage/operations took ${String(ms)} ms over ${String(CALLS)} calls of one trace. It has to answer in ` +
        'under a second. Look first for a read-back check that walks every read of a trace for every write.',
    ).toBeLessThan(A_SECOND)
  }, 120_000)
})
