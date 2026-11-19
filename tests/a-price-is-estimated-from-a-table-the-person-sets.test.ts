// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PRICE IS ESTIMATED FROM A TABLE THE PERSON SETS, BESIDE THE COST THE RUNTIME REPORTED.
 * Criterion U3, second half — the arithmetic over runs.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, AND WHY EACH ASSERTION IS THE ONE IT IS
 * ---------------------------------------------------------------------------------------
 *
 *   1. NO TABLE IS AN HONEST ANSWER. With nothing set, `receiptsFromRuns` estimates nothing, its
 *      overall row says so in the one sentence, and the runtime's own `costUsd` is still summed.
 *      Mutation: estimate with an empty table (return an estimated zero for the no-table state)
 *      and the total moves off null.
 *   2. A PRICE COMES ONLY FROM SUPPLIED NUMBERS. A run with no receipt is counted as missing and
 *      adds nothing to the estimate. Mutation: treat a missing receipt as a zero-token receipt and
 *      estimate over it — the priced count rises and the assertion catches it.
 *   3. AN UNPRICED MODEL IS NOT FREE. A table that names model-one but not model-two leaves the
 *      model-two row with no estimate, while its measured cost and its tokens are still summed.
 *      Mutation: fall back to another model's price and the model-two estimate is a number.
 *   4. THE ESTIMATE NEVER REPLACES THE MEASURED COST. `values.costUsd` is the runtime's own number
 *      and `estimate.total` is worked out; they are asserted apart. Mutation: write the estimate
 *      into `costUsd` and the measured number moves.
 *   5. A RUN IS COUNTED UNDER THE MODEL ITS RUNTIME NAMED. A receipt's `modelRequested`, the model
 *      the run asked for, is never its row and never its price (Dxiry_2y6vuD point 3).
 *      Mutation: row a receipt by `modelRequested` when it has one, and the row and its price move.
 *
 * A SECOND COPY OF THE ARITHMETIC IS MADE IMPOSSIBLE TO ADD QUIETLY. The last case mocks the shared
 * declaration, gives its estimate function a sentinel answer, and checks the server's summation
 * moves with it. A private copy in `src/server/lib/usage-receipts.ts` would compute its own number
 * and go red, which is the ninth invariant's defect this file exists to catch.
 *
 * EACH MUTATION WAS RUN AFTER A CONTROL, THE FILE RESTORED BYTE-IDENTICAL, SHA256 ON BOTH SIDES.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import {
  PRICE_PER,
  theNoPriceTableSentence,
  theUnpricedModelSentence,
  type PriceTableReading,
} from '../src/shared/price-table.ts'
import type { UsageReceipt } from '../src/shared/usage-receipts.ts'

/** The shared declaration's path, as this file and the product's readers resolve it. */
const SHARED_PRICE = '../src/shared/price-table.ts'

/** A price table used by the tests. It is typed in by a person in the product; here it is a fixture. */
const TABLE: PriceTableReading = {
  state: 'set',
  table: {
    currency: 'GBP',
    prices: {
      'model-one': { input: 3, output: 15, cachedInput: 0.3 },
      'model-two': { input: 1, output: 10, cachedInput: 0.1 },
    },
  },
}

/** One run as the summation takes it: its id and the record's own data bag. */
const run = (id: string, receipt?: UsageReceipt): ReceiptRun => ({
  id,
  data: receipt === undefined ? { runtime: 'claude-code' } : { runtime: 'claude-code', usageReceipt: receipt },
})

/**
 * model-one states that its input excludes cache reads, so cache creation is priced at the input
 * price and the cached reads at the cached price: (100 + 200) * 3 + 1000 * 0.3 + 50 * 15 = 1950,
 * over one million tokens = 0.00195.
 */
const ONE: UsageReceipt = {
  model: 'model-one', runtime: 'claude-code', inputTokens: 100, cachedInputTokens: 1000,
  cacheCreationInputTokens: 200, outputTokens: 50, inputIncludesCached: false, costUsd: 1.25,
}
/**
 * model-two states its input already includes cached reads, as Codex's does, so the cached reads are taken out of the
 * input and priced at the cached price, and the rest at the input price: (2000 - 1500) * 1 + 1500 * 0.1 + 100 * 10 =
 * 1650 (wave 13s round 42: "Price cached input at the cached rate").
 */
const TWO: UsageReceipt = {
  model: 'model-two', runtime: 'claude-code', inputTokens: 2000, cachedInputTokens: 1500, outputTokens: 100,
  inputIncludesCached: true, costUsd: 2.5,
}
const ONE_ESTIMATE = (100 + 200) * 3 + 1000 * 0.3 + 50 * 15
const TWO_ESTIMATE = (2000 - 1500) * 1 + 1500 * 0.1 + 100 * 10

/** The one summation, imported after `freshDb()` has named the test database it opens. */
type ReceiptRun = import('../src/server/lib/usage-receipts.ts').ReceiptRun
let receiptsFromRuns: typeof import('../src/server/lib/usage-receipts.ts')['receiptsFromRuns']
let database: TestDb

beforeAll(async () => {
  database = await freshDb()
  receiptsFromRuns = (await import('../src/server/lib/usage-receipts.ts')).receiptsFromRuns
}, 60_000)

afterAll(() => {
  database?.close()
})

// ============================================================ 1. no table set
describe('with no price table set, nothing is estimated and the measured cost stays', () => {
  it('leaves the estimate absent, says so once, and still sums the runtime’s own cost', () => {
    const reading = receiptsFromRuns([run('a', ONE), run('b', TWO)], { state: 'none' })
    expect(reading.overall.estimate.total, 'nothing is estimated').toBeNull()
    expect(reading.overall.estimate.says).toBe(theNoPriceTableSentence())
    // THE MEASURED COST IS STILL THERE. 1.25 + 2.5, the number the runtime reported.
    expect(reading.overall.values.costUsd).toBe(3.75)
    expect(reading.overall.supplied.costUsd).toBe(2)
    // AND EVERY ROW SAYS THE SAME ABSENCE, from the one sentence.
    expect(reading.byModel.every((row) => row.estimate.says === theNoPriceTableSentence())).toBe(true)
  })
})

// ============================================================ 2. only supplied numbers
describe('a price is estimated only from numbers the receipt supplied', () => {
  it('adds nothing for a run with no receipt and still counts it as missing', () => {
    const reading = receiptsFromRuns([run('a', ONE), run('b', TWO), run('missing')], TABLE)
    expect(reading.missingReceipts, 'the run with no receipt is counted as missing').toBe(1)
    expect(reading.overall.estimate.pricedRuns, 'only the two receipted runs were priced').toBe(2)
    expect(reading.overall.estimate.total).toBeCloseTo((ONE_ESTIMATE + TWO_ESTIMATE) / PRICE_PER, 12)
    expect(reading.overall.estimate.says, 'a number is present, so nothing has to explain an absence').toBeNull()
    // THE MISSING RUN IS NOT A ZERO. Its tokens never reach the totals, and the count of supplied
    // numbers does not move because of it.
    expect(reading.overall.supplied.inputTokens).toBe(2)
    expect(reading.overall.missingReceipts).toBe(1)
  })
})

// ============================================================ 3. an unpriced model is not free
describe('a model the table does not price gets no estimate and says so', () => {
  it('leaves the model’s estimate absent while its tokens and measured cost stay', () => {
    const onlyOne: PriceTableReading = { state: 'set', table: { currency: 'GBP', prices: { 'model-one': { input: 3, output: 15, cachedInput: 0.3 } } } }
    const reading = receiptsFromRuns([run('a', ONE), run('b', TWO)], onlyOne)
    const two = reading.byModel.find((row) => row.name === 'model-two')
    expect(two, 'the unpriced model has its own row').toBeDefined()
    expect(two?.estimate.total, 'an unpriced model is not priced at zero').toBeNull()
    expect(two?.estimate.says).toBe(theUnpricedModelSentence('model-two'))
    // ITS MEASURED NUMBERS ARE STILL SUMMED.
    expect(two?.values.costUsd).toBe(2.5)
    expect(two?.values.inputTokens).toBe(2000)
    // AND THE PRICED MODEL STILL HAS A NUMBER.
    const one = reading.byModel.find((row) => row.name === 'model-one')
    expect(one?.estimate.total).toBe(ONE_ESTIMATE / PRICE_PER)
  })
})

// ============================================================ 4. measured and estimated never merge
describe('the estimate never overwrites the cost the runtime reported', () => {
  it('keeps costUsd and the estimate as two separate numbers', () => {
    const reading = receiptsFromRuns([run('a', ONE)], TABLE)
    const one = reading.byModel.find((row) => row.name === 'model-one')
    expect(one?.values.costUsd, 'the runtime’s own number is kept').toBe(1.25)
    expect(one?.estimate.total, 'the worked-out number is its own').toBe(ONE_ESTIMATE / PRICE_PER)
    expect(one?.values.costUsd).not.toBe(one?.estimate.total)
    // They are not added to each other anywhere: the row's measured cost is exactly what the
    // runtime gave and the estimate is exactly the arithmetic, neither the sum.
    expect(reading.overall.values.costUsd).toBe(1.25)
    expect(reading.overall.estimate.total).toBe(ONE_ESTIMATE / PRICE_PER)
  })
})

// ============================================================ 5. the model asked for is not the row
describe('a run is counted under the model its runtime named, never under the model it asked for', () => {
  it('rows and prices a receipt by model while its modelRequested names another model', () => {
    const reading = receiptsFromRuns([run('a', { ...ONE, modelRequested: 'model-two' })], TABLE)
    expect(reading.byModel.map((row) => row.name)).toEqual(['model-one'])
    expect(reading.byModel[0]?.estimate.total).toBe(ONE_ESTIMATE / PRICE_PER)
    expect(reading.overall.estimate.total).toBe(ONE_ESTIMATE / PRICE_PER)
  })
})

// ============================================================ 6. one declaration, not two
describe('the estimate arithmetic is read from the one shared declaration', () => {
  it('moves when the shared declaration moves, so a private copy cannot sit quietly', async () => {
    const real = await import(SHARED_PRICE)
    expect(typeof real.estimatedCostOf).toBe('function')
    vi.doMock(SHARED_PRICE, () => ({
      readPriceTable: () => ({ state: 'none' }),
      estimatedCostOf: () => ({ state: 'estimated', total: 42, currency: 'ZZZ' }),
      theNoPriceTableSentence: () => 'no table',
      theNotEnoughNumbersSentence: () => 'not enough numbers',
      theNothingToPriceSentence: () => 'nothing to price',
      theUnpricedModelSentence: (model: string | null) => `unpriced ${String(model)}`,
      theUnpricedRowSentence: () => 'unpriced row',
      thePriceUnitSentence: () => 'the unit',
      PRICE_PER: 1,
    }))
    try {
      vi.resetModules()
      const fresh = (await import('../src/server/lib/usage-receipts.ts')) as typeof import('../src/server/lib/usage-receipts.ts')
      const reading = fresh.receiptsFromRuns([run('a', ONE)], TABLE)
      // THE SENTINEL MOVED THROUGH THE SERVER'S SUMMATION. A private copy of the arithmetic in
      // that file would have produced the real 0.00195 and stayed here.
      expect(reading.overall.estimate.total).toBe(42)
      expect(reading.overall.estimate.currency).toBe('ZZZ')
    } finally {
      vi.doUnmock(SHARED_PRICE)
      vi.resetModules()
    }
  })
})
