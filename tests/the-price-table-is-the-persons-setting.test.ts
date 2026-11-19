// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRICE TABLE IS THE PERSON'S OWN SETTING, AND THE ESTIMATE READS IT. Criterion U3.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The table is one row, `price_table`, read and written through `GET/POST /api/office/price-table`.
 *
 *   1. THE STORE ROUND-TRIPS A TABLE, and a clear returns the reading to "none" with the sentence
 *      saying nobody has set one.
 *   2. ONLY THE PERSON MAY SET OR CLEAR IT. An agent's write is refused with a 403 and the row is
 *      unchanged. The read answers the same refusal in words.
 *   3. A TABLE THAT IS NOT ONE IS REFUSED WITH A 400 AND NOTHING IS WRITTEN: the table set before
 *      it is still the one in force, and on an empty store no row appears.
 *   4. `priceTableInForce` READS THE STORE, so `GET /api/usage/agents` carries an estimate in the
 *      table's currency once a table is set, and the no-table sentence before.
 *   5. A ROW THAT CANNOT BE READ THROWS AND NAMES THE TABLE, and never reads as "none".
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   take the insert out of `setThePriceTable`                         → case 1
 *   remove the refusal from the write door                           → case 2
 *   write the table before `readPriceTable` has checked it           → case 3
 *   return `readPriceTable(undefined)` from `priceTableInForce` again → case 4
 *   read an unreadable row as "none"                                 → case 5
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { PRICE_PER, theNoPriceTableSentence } from '../src/shared/price-table.ts'
import type { WhatThePriceTableDoorSays } from '../src/server/lib/price-table.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-price-table',
}

/** A table used by the tests. A person types it in the product; here it is a fixture. */
const TABLE = { currency: 'GBP', prices: { 'model-one': { input: 3, output: 15, cachedInput: 0.3 } } }

/** The reading, through the door. */
async function theReading(headers: Record<string, string> = AS_THE_OWNER): Promise<WhatThePriceTableDoorSays> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/price-table', headers })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatThePriceTableDoorSays
}

/** One write through the door. */
async function post(body: unknown, headers: Record<string, string> = AS_THE_OWNER) {
  const reply = await app.inject({ method: 'POST', url: '/api/office/price-table', headers, payload: body as object })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/** The stored row's JSON, or undefined when there is no row. Read straight from the table. */
function theRow(): string | undefined {
  const held = t.client.sqlite.prepare('SELECT settings FROM price_table WHERE only_row = 1').get() as
    | { settings: string }
    | undefined
  return held?.settings
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  t.close()
})

// THE TABLE IS ONE ROW FOR THE WHOLE OFFICE, so a case that sets it would be read by the next
// case's control. Each case puts the office back as it found it by removing the row.
afterEach(() => {
  t.client.sqlite.prepare('DELETE FROM price_table').run()
})

describe('the price table is stored, read back and cleared', () => {
  it('round-trips a table and a clear returns the reading to none', async () => {
    // THE CONTROL: nobody has set one, and the door says so in the one sentence.
    const before = await theReading()
    expect(before.reading).toEqual({ state: 'none' })
    expect(before.says).toBe(theNoPriceTableSentence())
    expect(before.setBy).toBeNull()

    const set = await post({ table: TABLE })
    expect(set.status, JSON.stringify(set.said)).toBe(200)
    const after = await theReading()
    expect(after.reading).toEqual({ state: 'set', table: TABLE })
    expect(after.says).toBeNull()
    expect(after.setBy).toEqual({ kind: 'human', id: THE_PERSON })
    expect(after.setAt).toBeTruthy()
    expect(after.unit).toContain(PRICE_PER.toLocaleString('en-GB'))

    const cleared = await post({ clear: true })
    expect(cleared.status, JSON.stringify(cleared.said)).toBe(200)
    const gone = await theReading()
    expect(gone.reading).toEqual({ state: 'none' })
    expect(gone.says).toBe(theNoPriceTableSentence())
    expect(theRow()).toBeUndefined()
  })
})

describe('only the person may change it', () => {
  it("refuses an agent's set and clear with a 403, and the row is unchanged", async () => {
    expect((await post({ table: TABLE })).status).toBe(200)
    const stored = theRow()
    // THE CONTROL: the owner's table is there before the agent tries anything.
    expect(stored).toBeDefined()

    const set = await post({ table: { currency: 'USD', prices: {} } }, AS_AN_AGENT)
    expect(set.status).toBe(403)
    expect(String(set.said['error'] ?? set.said['message'])).toContain("the owner's own setting")
    expect(theRow()).toBe(stored)

    const clear = await post({ clear: true }, AS_AN_AGENT)
    expect(clear.status).toBe(403)
    expect(theRow()).toBe(stored)

    // THE READ SAYS THE SAME REFUSAL, so a page read by an agent can draw it before a press.
    const read = await theReading(AS_AN_AGENT)
    expect(read.refusal).toContain("the owner's own setting")
    expect((await theReading()).refusal).toBeNull()
  })
})

describe('a table that is not one is refused before anything is written', () => {
  it('answers 400 and leaves the table in force as it was', async () => {
    expect((await post({ table: TABLE })).status).toBe(200)
    const stored = theRow()
    expect(stored).toBeDefined()

    // A price with no output number: the shape check refuses it.
    const refused = await post({ table: { currency: 'EUR', prices: { 'model-two': { input: 1, cachedInput: 0.1 } } } })
    expect(refused.status).toBe(400)
    expect(String(refused.said['error'] ?? refused.said['message'])).toContain('Nothing was written')
    expect(theRow()).toBe(stored)

    // A negative price is not a price either.
    const negative = await post({ table: { currency: 'EUR', prices: { 'model-two': { input: -1, output: 1, cachedInput: 0 } } } })
    expect(negative.status).toBe(400)
    expect(theRow()).toBe(stored)
  })

  it('writes no row at all when the store was empty', async () => {
    const refused = await post({ table: { currency: '', prices: {} } })
    expect(refused.status).toBe(400)
    expect(theRow()).toBeUndefined()
    expect((await theReading()).reading).toEqual({ state: 'none' })
  })
})

describe('the estimate reads the store', () => {
  it('priceTableInForce answers the stored table, and the usage door estimates in its currency', async () => {
    historicalSession(t, {
      workspaceId: 'default',
      actor: { type: 'agent', id: 'd-price-table-test' },
      kind: 'session',
      title: 'A run priced from the stored table',
      data: {
        state: 'finished', servingAgent: 'price-agent', model: 'model-one', runtime: 'claude-code',
        usageReceipt: {
          runtime: 'claude-code', model: 'model-one', inputTokens: 100, cachedInputTokens: 1000,
          cacheCreationInputTokens: 200, outputTokens: 50, inputIncludesCached: false, costUsd: 1.25,
        },
      },
    })
    const usage = async () => {
      const reply = await app.inject({ method: 'GET', url: '/api/usage/agents', headers: AS_THE_OWNER })
      expect(reply.statusCode, reply.body).toBe(200)
      return (reply.json() as { receipts: { overall: { estimate: { total: number | null; currency: string | null; says: string | null } } } })
        .receipts.overall.estimate
    }

    // THE CONTROL: no table, so no estimate and the sentence saying so.
    const none = await usage()
    expect(none.total).toBeNull()
    expect(none.says).toBe(theNoPriceTableSentence())

    expect((await post({ table: TABLE })).status).toBe(200)
    const { priceTableInForce } = await import('../src/server/lib/price-table.ts')
    expect(priceTableInForce()).toEqual({ state: 'set', table: TABLE })

    // (100 + 200) * 3 + 1000 * 0.3 + 50 * 15 = 1950, over one million tokens.
    const priced = await usage()
    expect(priced.currency).toBe('GBP')
    expect(priced.total).toBeCloseTo(1950 / PRICE_PER, 12)
    expect(priced.says).toBeNull()
  })

  it('throws, naming the table, when the stored row cannot be read', async () => {
    t.client.sqlite
      .prepare(
        `INSERT INTO price_table (only_row, settings, updated_at, updated_by_kind, updated_by_id, authority) VALUES (1, ?, '2026-09-25 12:00:00', 'human', '${THE_TEST_OFFICES_OWNER.id}', NULL)`,
      )
      .run(JSON.stringify({ currency: 'GBP', prices: { 'model-one': { input: 'three' } } }))
    const { priceTableInForce } = await import('../src/server/lib/price-table.ts')
    expect(() => priceTableInForce()).toThrow(/price_table/)
  })
})
