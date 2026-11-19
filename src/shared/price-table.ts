// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRICE TABLE, ITS SHAPE, ITS UNIT, AND WHAT IT SAYS WHEN NOBODY HAS SET ONE. Criterion U3.
 *
 * -----------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * -----------------------------------------------------------------------------------------
 *
 * The Settings store is another worker's piece (U2) and it is where a person edits the table. The
 * shape the store holds, the unit every price in it is in, and the sentence saying no table has
 * been set are facts this product works out ONCE. The ninth invariant names the defect this file
 * prevents: a shape declared in the store and again in the reader, free to drift. So the shape,
 * the unit and the absence sentence live here, beside the receipt shape they price, and every
 * reader imports them.
 *
 * `src/config/token-estimate.mjs` is the pattern: one declaration, imported by every reader, with
 * a test that changes it and watches every reader move.
 *
 * -----------------------------------------------------------------------------------------
 * THE UNIT IS PRICES PER MILLION TOKENS, SAID OUT LOUD
 * -----------------------------------------------------------------------------------------
 *
 * A price a provider publishes is per million tokens, so that is the unit declared here once. A
 * reader never guesses it: `thePriceUnitSentence` is drawn wherever a price is asked for. The
 * arithmetic divides by `PRICE_PER`, so the unit and the divisor cannot come apart.
 *
 * -----------------------------------------------------------------------------------------
 * THREE STATES, NOT TWO
 * -----------------------------------------------------------------------------------------
 *
 * "Nobody has set a price table" is not the same as "the table prices this model at zero". The
 * reading below is one of `none` or `set`, and a model lookup is then one of `no-table`,
 * `priced`, or `not-priced`. An unpriced model has no price and never a made-up default.
 */
import type { UsageReceipt } from './usage-receipts.ts'

/** The unit every price in a table is in: the table's own currency per million tokens. */
export const PRICE_PER = 1_000_000

/**
 * THE UNIT SENTENCE, WRITTEN ONCE. It is drawn wherever a price table is shown or edited, so a
 * reader is never left to work out whether a number is per token, per thousand or per million.
 *
 * @returns {string}
 */
export function thePriceUnitSentence(): string {
  return `Every price in this table is in the table's own currency per ${PRICE_PER.toLocaleString('en-GB')} tokens.`
}

/**
 * THE SENTENCE FOR THE HONEST ABSENCE. "No price table has been set" is a real answer, and it is
 * the answer on screen today. It is declared here and nowhere else.
 *
 * @returns {string}
 */
export function theNoPriceTableSentence(): string {
  return 'No price table has been set, so no price is estimated. The cost shown is the number the runtime reported.'
}

/** The sentence for a model the table does not name, or for a run whose runtime named no model. */
export function theUnpricedModelSentence(model: string | null): string {
  return model === null
    ? 'The runtime named no model, so the price table cannot price this run.'
    : `The price table names no price for ${model}, so no price is estimated for it.`
}

/** The sentence for a row holding no run whose model the table names. */
export function theUnpricedRowSentence(): string {
  return 'The price table names no price for any model this row counted, so no price is estimated for it.'
}

/** The sentence for a row whose receipts did not supply enough numbers to price. */
export function theNotEnoughNumbersSentence(): string {
  return 'The receipts in this row did not supply enough numbers to work out a price.'
}

/** The sentence for a row that carried no receipt at all. A missing receipt is never a zero. */
export function theNothingToPriceSentence(): string {
  return 'No run in this row carried a usage receipt, so no price is estimated for it.'
}

/** What a table says about one model, in the table's currency per `PRICE_PER` tokens. */
export interface ModelPrice {
  /** Fresh input tokens. Cache creation is priced at this number too; see `estimatedCostOf`. */
  input: number
  output: number
  /** Input tokens read from the prompt cache. */
  cachedInput: number
}

/** A price table a person set: a currency it is all in, and a price for each model it names. */
export interface PriceTable {
  /** The currency the table is in, as a person would name it: GBP, USD, EUR. */
  currency: string
  /** One price per model the table names. A model absent from this object is not priced at zero. */
  prices: Record<string, ModelPrice>
}

/**
 * WHETHER A TABLE IS IN FORCE. `none` is "nobody has set one", which is the state today and is a
 * real state rather than an empty table.
 */
export type PriceTableReading = { state: 'none' } | { state: 'set'; table: PriceTable }

/** What a table says about one model. Three answers, and the third is not the first. */
export type ModelPriceReading =
  | { state: 'no-table' }
  | { state: 'priced'; price: ModelPrice; currency: string }
  | { state: 'not-priced'; model: string | null }

/**
 * WHAT ONE RECEIPT'S PRICE COMES TO, OR WHY IT CANNOT BE WORKED OUT.
 *
 * `not-priced` is the table set but naming no price for the model. `not-enough-numbers` is the
 * table pricing the model while the receipt did not supply enough to work a price out. Neither is
 * a zero: a zero would read as a measured price.
 */
export type EstimatedCost =
  | { state: 'no-table' }
  | { state: 'not-priced'; model: string | null }
  | { state: 'not-enough-numbers'; because: string }
  | { state: 'estimated'; total: number; currency: string }

/**
 * READ A STORED VALUE INTO A TABLE, OR SAY NOBODY HAS SET ONE. This is the shape check the store
 * and the reader share. `undefined` and `null` are the honest absence; anything else that is not
 * a price table is refused loudly rather than read as empty, because a store that holds garbage
 * is a broken assumption and not an absent setting.
 */
export function readPriceTable(stored: unknown): PriceTableReading {
  if (stored === undefined || stored === null) return { state: 'none' }
  if (typeof stored !== 'object' || Array.isArray(stored)) throw new Error('The stored price table is not an object.')
  const bag = stored as Record<string, unknown>
  const currency = bag['currency']
  if (typeof currency !== 'string' || currency.trim() === '') throw new Error('The stored price table names no currency.')
  const prices = bag['prices']
  if (typeof prices !== 'object' || prices === null || Array.isArray(prices)) throw new Error('The stored price table holds no prices object.')
  const kept: Record<string, ModelPrice> = {}
  for (const [model, value] of Object.entries(prices as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`The price for ${model} is not an object.`)
    const one = value as Record<string, unknown>
    const numbers: Record<string, number> = {}
    for (const key of ['input', 'output', 'cachedInput'] as const) {
      const number = one[key]
      if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) {
        throw new Error(`The price for ${model} has no ${key} number, or it is not a price.`)
      }
      numbers[key] = number
    }
    kept[model] = { input: numbers['input'] as number, output: numbers['output'] as number, cachedInput: numbers['cachedInput'] as number }
  }
  return { state: 'set', table: { currency, prices: kept } }
}

/** What the table says about one model: no table, priced, or the table names no price for it. */
export function priceForModel(reading: PriceTableReading, model: string | null): ModelPriceReading {
  if (reading.state === 'none') return { state: 'no-table' }
  if (model === null) return { state: 'not-priced', model: null }
  const price = reading.table.prices[model]
  return price === undefined ? { state: 'not-priced', model } : { state: 'priced', price, currency: reading.table.currency }
}

/**
 * THE ESTIMATE FOR ONE RECEIPT, IN THE TABLE'S CURRENCY.
 *
 * THE CACHE RULE IS THE RECEIPT'S OWN RULE. The runtime either says its input count includes
 * cached reads or says it does not; adding the two without that fact is a number nobody can
 * defend. So:
 *
 *   · `inputIncludesCached === true`: the input count already holds the cached reads (Codex's
 *     does), so the cached reads are taken out of it and priced at the cached price, and the rest
 *     at the input price (wave 13s round 42). A cached count the receipt did not supply is not
 *     taken as zero: the estimate is absent and says why.
 *   · `inputIncludesCached === false`: the input count excludes cached reads and cache creation,
 *     so cache creation is priced at the input price (the table names three prices, not four) and
 *     the cached reads are priced at the cached price. A cached count the receipt did not supply
 *     is not priced at zero: the estimate is absent and says why.
 *   · no statement of overlap at all: nothing is estimated.
 *
 * Reasoning tokens are part of the output count the runtime reported and are never priced twice.
 */
export function estimatedCostOf(receipt: UsageReceipt, reading: PriceTableReading): EstimatedCost {
  const model = typeof receipt.model === 'string' && receipt.model !== '' ? receipt.model : null
  const what = priceForModel(reading, model)
  if (what.state === 'no-table') return { state: 'no-table' }
  if (what.state === 'not-priced') return { state: 'not-priced', model: what.model }
  const price = what.price

  if (receipt.inputTokens === undefined || receipt.outputTokens === undefined) {
    return {
      state: 'not-enough-numbers',
      because: `${model as string}'s receipt did not supply both an input count and an output count, so its price cannot be worked out.`,
    }
  }

  let inputSide = receipt.inputTokens
  let cachedSide = 0
  if (receipt.inputIncludesCached === true) {
    if (receipt.cachedInputTokens === undefined) {
      return {
        state: 'not-enough-numbers',
        because: `${model as string}'s receipt did not say how much of its input was cached, so its price cannot be worked out.`,
      }
    }
    inputSide = receipt.inputTokens - receipt.cachedInputTokens
    cachedSide = receipt.cachedInputTokens
  } else if (receipt.inputIncludesCached === false) {
    if (receipt.cachedInputTokens === undefined || receipt.cacheCreationInputTokens === undefined) {
      return {
        state: 'not-enough-numbers',
        because: `${model as string}'s receipt did not say how much of its input was cached, so its price cannot be worked out.`,
      }
    }
    inputSide = receipt.inputTokens + receipt.cacheCreationInputTokens
    cachedSide = receipt.cachedInputTokens
  } else {
    return {
      state: 'not-enough-numbers',
      because: `${model as string}'s receipt did not say whether its input count includes cached reads, so its price cannot be worked out.`,
    }
  }

  const total = (inputSide * price.input + cachedSide * price.cachedInput + receipt.outputTokens * price.output) / PRICE_PER
  return { state: 'estimated', total, currency: what.currency }
}
