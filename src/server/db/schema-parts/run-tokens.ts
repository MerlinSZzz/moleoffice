// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { records } from '../schema.ts'
import { aPartTable } from '../part-tables.ts'

/** Private router credentials. Only hashes; UTC epoch milliseconds for every compared instant. */
export const runTokens = aPartTable(sqliteTable('run_tokens', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => records.id),
  /** `casting` for the run's bridge, `tool` for a tool's own request. Migration 0334. */
  kind: text('kind').notNull().default('casting'),
  tokenHash: text('token_hash').notNull(),
  allowedPairs: text('allowed_pairs').notNull(),
  spendCap: real('spend_cap').notNull(),
  spent: real('spent').notNull().default(0),
  issuedAt: integer('issued_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  revokedAt: integer('revoked_at'),
  revokedBecause: text('revoked_because'),
}, t => [
  uniqueIndex('run_tokens_hash_idx').on(t.tokenHash),
  index('run_tokens_run_idx').on(t.runId),
  uniqueIndex('run_tokens_current_idx').on(t.runId, t.kind).where(sql`${t.revokedAt} IS NULL`),
  check('run_tokens_pairs_json', sql`json_valid(${t.allowedPairs})`),
  check('run_tokens_cap_finite', sql`${t.spendCap} >= 0 AND ${t.spendCap} <= 1.7976931348623157e308`),
  check('run_tokens_spent_finite', sql`${t.spent} >= 0 AND ${t.spent} <= 1.7976931348623157e308`),
  check('run_tokens_expiry', sql`${t.expiresAt} > ${t.issuedAt}`),
  check('run_tokens_revocation', sql`(${t.revokedAt} IS NULL) = (${t.revokedBecause} IS NULL)`),
]), { existingMeasured: true })
