// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable, theFillGivenBy } from '../part-tables.ts'
import { records } from '../schema.ts'

/**
 * One row for each request the provider router carried: the run, the slot whose key was sent, the provider's own token
 * counts and the price the office put on them. Never a key or a token; the credential is named by its row id.
 */
export const routerReceipts = aPartTable(sqliteTable('router_receipts', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => records.id),
  tokenId: text('token_id').notNull(),
  model: text('model').notNull(),
  slot: text('slot').notNull(),
  status: integer('status').notNull(),
  inputTokens: integer('input_tokens'),
  cachedInputTokens: integer('cached_input_tokens'),
  outputTokens: integer('output_tokens'),
  priceUsd: real('price_usd'),
  priceSays: text('price_says'),
  at: integer('at').notNull(),
}, (t) => [
  index('router_receipts_run_idx').on(t.runId),
  check('router_receipts_price', sql`(${t.priceUsd} IS NULL) <> (${t.priceSays} IS NULL) AND (${t.priceUsd} IS NULL OR ${t.priceUsd} >= 0)`),
]), {
  exported: false,
  restore: 'may be lost',
  why: 'A receipt is charged to a run credential, and no archive carries run credentials, so no archive carries the receipts either.',
  repair: "Nothing in Mole Office can put them back. The provider's own usage pages are the other record of what each key spent.",
  fillForTheProof: theFillGivenBy('src/server/lib/keyrouter/provider-router.ts'),
})
