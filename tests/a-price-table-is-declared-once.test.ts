// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRICE TABLE'S SHAPE, ITS UNIT AND ITS READER ARE DECLARED ONCE. Criterion U3, first half.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 *   1. A table round-trips through its declared shape, currency included.
 *   2. The unit every price is in is said out loud, and the divisor the arithmetic uses is the
 *      one the sentence names.
 *   3. The reader answers in THREE states and not two: nobody has set a table; a table is set and
 *      names this model; a table is set and does NOT name this model. A model nobody priced is not
 *      priced at zero.
 *   4. A stored value that is not a price table is refused loudly, because a store holding garbage
 *      is a broken assumption and not an absent setting.
 *
 * THE MUTATION THAT TURNS THIS RED, AFTER A CONTROL RUN, RESTORED BYTE-IDENTICAL. Drop the currency
 * from what `readPriceTable` hands back (`{ currency, prices: kept }` becomes `{ currency: '',
 * prices: kept }`). Case 1 goes red on the currency, and so does every caller that names it.
 */
import { describe, expect, it } from 'vitest'

import {
  PRICE_PER,
  priceForModel,
  readPriceTable,
  thePriceUnitSentence,
  type ModelPrice,
  type PriceTableReading,
} from '../src/shared/price-table.ts'

/** A table as a person types it into Settings; here it is a fixture. */
const STORED = { currency: 'GBP', prices: { 'model-one': { input: 3, output: 15, cachedInput: 0.3 } } }

describe('the price table is read into its declared shape', () => {
  it('round-trips a table, its currency and its unit', () => {
    const read = readPriceTable(STORED)
    expect(read.state).toBe('set')
    if (read.state !== 'set') throw new Error('the table did not read back')
    expect(read.table.currency).toBe('GBP')
    expect(read.table.prices['model-one']).toEqual({ input: 3, output: 15, cachedInput: 0.3 })
    // THE UNIT IS SAID, NOT GUESSED. The divisor and the sentence come from the one declaration.
    expect(PRICE_PER).toBe(1_000_000)
    expect(thePriceUnitSentence()).toContain('1,000,000')
    expect(thePriceUnitSentence().toLowerCase()).toContain('currency')
  })

  it('answers no table for the honest absence, and refuses a value that is not a table', () => {
    expect(readPriceTable(undefined).state).toBe('none')
    expect(readPriceTable(null).state).toBe('none')
    expect(() => readPriceTable({ currency: 'GBP' })).toThrow()
    expect(() => readPriceTable({ currency: 'GBP', prices: { 'model-one': { input: 3, output: 15 } } })).toThrow()
    expect(() => readPriceTable({ currency: '', prices: {} })).toThrow()
  })

  it('answers no table, priced, and not-priced as three states, and not-priced is not zero', () => {
    const reading: PriceTableReading = { state: 'set', table: { currency: 'GBP', prices: { 'model-one': { input: 3, output: 15, cachedInput: 0.3 } } } }
    const priced = priceForModel(reading, 'model-one')
    expect(priced.state).toBe('priced')
    if (priced.state === 'priced') expect((priced.price as ModelPrice).input).toBe(3)
    expect(priceForModel(reading, 'model-two')).toEqual({ state: 'not-priced', model: 'model-two' })
    expect(priceForModel(reading, null)).toEqual({ state: 'not-priced', model: null })
    expect(priceForModel({ state: 'none' }, 'model-one')).toEqual({ state: 'no-table' })
  })
})
