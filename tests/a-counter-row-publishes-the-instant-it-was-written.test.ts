// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COUNTER'S ROW PUBLISHES THE INSTANT IT WAS WRITTEN, OR NULL WHEN NONE WAS KEPT.
 *
 * Item 14 of 13r's list. A counter row keeps its moment twice: `at`, a stamp with no offset, and beside it the
 * instant with its offset, since migration 0299. On the night the clocks go back, two rows written an hour apart
 * carry one stamp. A program that reads a counter's rows, such as the main-suite poll, needs the instant to tell
 * them apart. So every row reading carries `atInstant`: the instant stored with the row, word for word, or null for
 * a row written before the office kept one. Nothing is made up for such a row from its stamp.
 *
 * WHAT IS PROVED, one claim at a time:
 *
 *   1  each row of GET /api/counters/<id>, and the counter's last firing, answers the instant stored with it, which
 *      names the moment the row was written; two rows written an hour apart in the hour that comes twice have one
 *      stamp and two instants;
 *   2  a row written before the office kept its instant answers null, as a field that is there, and no instant made
 *      from its stamp.
 *
 * THE ZONE IS THE TEST'S, as in tests/a-counter-due-time-names-one-moment-when-the-clocks-change.test.ts. This file
 * sets process.env.TZ to Europe/London for itself and puts it back in afterAll, and `vi.setSystemTime` chooses the
 * moment each row is written.
 *
 * BEFORE THE CODE both cases are red, because no row reading carries the field.
 *
 * MUTATIONS, each after a green control run, of readACounterRow in src/server/lib/counters.ts:
 *   - `atInstant` always null: case 1 red;
 *   - a null instant made up from the stamp, read as its later moment: case 2 red;
 *   - the field left off when the instant is null: case 2 red;
 *   - the field added only to the rows of GET /api/counters/<id>, not where every row reading is built: case 1 red,
 *     on the last firing.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const zoneBefore = process.env.TZ

const asKeeper = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'row-instant-keeper',
}

type RowReading = { seq: number; what: string; at: string; atInstant?: string | null }
type Reading = { counter: { lastFiring: RowReading | null }; rows: RowReading[] }

/** A counter that fires at its second addition, filed through its own door at a moment this test chooses. */
async function aCounterAt(when: Date, title: string): Promise<string> {
  vi.setSystemTime(when)
  const r = await app.inject({
    method: 'POST',
    url: '/api/counters',
    headers: asKeeper,
    payload: {
      title,
      counts: 'Synthetic additions.',
      triggers: [{ kind: 'count', n: 2 }],
      action: { kind: 'task', title: `${title}, the look` },
    },
  })
  expect(r.statusCode, r.body).toBe(201)
  return (JSON.parse(r.body) as { counter: { id: string } }).counter.id
}

/** Add one at a moment this test chooses. */
async function addAt(when: Date, id: string): Promise<void> {
  vi.setSystemTime(when)
  const r = await app.inject({ method: 'POST', url: `/api/counters/${id}/add`, headers: asKeeper, payload: { by: 1, because: 'One more.' } })
  expect(r.statusCode, r.body).toBe(201)
}

async function read(id: string): Promise<Reading> {
  const r = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: asKeeper })
  expect(r.statusCode, r.body).toBe(200)
  return JSON.parse(r.body) as Reading
}

/** The two moment columns of a counter's rows, as the database holds them, by seq. */
function storedRows(id: string): Map<number, { at: string; atInstant: string | null }> {
  const rows = t.client.sqlite
    .prepare('SELECT seq, at, at_instant AS atInstant FROM counter_rows WHERE counter_id = ?')
    .all(id) as { seq: number; at: string; atInstant: string | null }[]
  return new Map(rows.map((row) => [row.seq, { at: row.at, atInstant: row.atInstant }]))
}

beforeAll(async () => {
  process.env.TZ = 'Europe/London'
  vi.useFakeTimers({ toFake: ['Date'] })
  t = await freshDb()
  app = (await apiApp()).app
  const r = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...asKeeper, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { handle: 'row-instant-keeper', name: 'Synthetic row-instant keeper' },
  })
  expect(r.statusCode, r.body).toBe(201)
})

afterAll(async () => {
  vi.useRealTimers()
  await app?.close()
  t?.close()
  if (zoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = zoneBefore
})

describe('a counter row reading publishes the instant stored with the row', () => {
  it('each row, and the last firing, answers its stored instant, so two rows with one stamp name two moments', async () => {
    // 00:30 UTC and 01:30 UTC on 25 October 2026 are both 01:30 on the wall in Europe/London. The second addition
    // reaches the count of 2, so it fires, and its firing row is written at the same moment.
    const firstMoment = Date.parse('2026-10-25T00:30:00Z')
    const secondMoment = Date.parse('2026-10-25T01:30:00Z')
    const id = await aCounterAt(new Date('2026-10-24T23:00:00Z'), 'Two in the repeated hour')
    await addAt(new Date(firstMoment), id)
    await addAt(new Date(secondMoment), id)

    const reading = await read(id)
    const stored = storedRows(id)
    expect(reading.rows.map((row) => row.what).sort()).toEqual(['addition', 'addition', 'firing'])
    for (const row of reading.rows) {
      const kept = stored.get(row.seq)?.atInstant
      expect(kept, `row ${row.seq} kept no instant`).toEqual(expect.any(String))
      expect(row.atInstant, `row ${row.seq} did not publish the instant stored with it`).toBe(kept)
    }

    const [first, second] = reading.rows.filter((row) => row.what === 'addition').sort((a, b) => a.seq - b.seq)
    const firing = reading.rows.find((row) => row.what === 'firing')
    expect(second?.at, 'the two additions do not share a stamp, so this case proves nothing').toBe(first?.at)
    expect(Date.parse(first?.atInstant ?? ''), 'the first addition named another moment').toBe(firstMoment)
    expect(Date.parse(second?.atInstant ?? ''), 'the second addition named another moment').toBe(secondMoment)
    expect(Date.parse(firing?.atInstant ?? ''), 'the firing named another moment').toBe(secondMoment)

    expect(reading.counter.lastFiring?.seq).toBe(firing?.seq)
    expect(reading.counter.lastFiring?.atInstant, 'the last firing did not publish its stored instant').toBe(firing?.atInstant)
  })

  it('a row written before the office kept its instant answers null, and nothing made from its stamp', async () => {
    const id = await aCounterAt(new Date('2026-10-24T23:00:00Z'), 'An old row')
    await addAt(new Date('2026-10-25T00:30:00Z'), id)
    // AS AN OFFICE BEFORE MIGRATION 0299 WROTE IT: the stamp alone. In the hour that comes twice that stamp names two
    // moments, so any instant made from it would be a guess.
    const emptied = t.client.sqlite.prepare('UPDATE counter_rows SET at_instant = NULL WHERE counter_id = ?').run(id)
    expect(emptied.changes).toBe(1)

    const reading = await read(id)
    const stored = storedRows(id)
    expect(reading.rows).toHaveLength(1)
    const row = reading.rows[0] as RowReading
    expect(stored.get(row.seq)).toEqual({ at: row.at, atInstant: null })
    expect(row, 'the row published no instant field, so a reader cannot tell it from an office that publishes none').toHaveProperty('atInstant')
    expect(row.atInstant, 'an instant was published that the office never kept').toBeNull()
  })
})
