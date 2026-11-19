// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable, theFillGivenBy } from '../part-tables.ts'

/**
 * THE PROVIDER TABLE, migration 0323: one row for each place a program sends its model requests to. The id is given by
 * the writer and never changes. `programs` is a JSON list of program words. `key_name` names an entry of the office's
 * key file, and the table never holds a key's value. Who added the row and when, and who changed it last and when, are
 * stamped by the writer in src/server/lib/the-provider-table.ts, which checks every rule before it writes.
 */
export const providers = aPartTable(sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  programs: text('programs').notNull(),
  baseAddress: text('base_address').notNull(),
  keyName: text('key_name').notNull(),
  addedAt: text('added_at').notNull(),
  addedByKind: text('added_by_kind').notNull(),
  addedById: text('added_by_id').notNull(),
  changedAt: text('changed_at').notNull(),
  changedByKind: text('changed_by_kind').notNull(),
  changedById: text('changed_by_id').notNull(),
}, (t) => [
  check('providers_id', sql`length(${t.id}) BETWEEN 2 AND 40 AND ${t.id} NOT GLOB '*[^a-z0-9-]*'`),
  check('providers_name', sql`trim(${t.name}) = ${t.name} AND length(${t.name}) BETWEEN 1 AND 120`),
  check('providers_programs', sql`json_valid(${t.programs}) AND json_type(${t.programs}) = 'array' AND json_array_length(${t.programs}) > 0`),
  check('providers_key_name', sql`${t.keyName} <> '' AND ${t.keyName} NOT GLOB '*[^a-z0-9-]*'`),
]), {
  exported: true,
  restore: 'compared',
  noProjectBecause: 'a provider is a place every project\'s programs may send to, as the Casting table it sits beside belongs to the whole installation',
  fillForTheProof: theFillGivenBy('src/server/lib/the-provider-table.ts'),
})

/**
 * EVERY CHANGE TO A PROVIDER, append-only, migration 0323: which provider, what (add, change, remove), who and when, and
 * the row's fields before and after as JSON. The JSON holds the id, name, programs, base address and key name, and
 * never a key's value.
 */
export const providerChanges = aPartTable(sqliteTable('provider_changes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  providerId: text('provider_id').notNull(),
  what: text('what').notNull(),
  at: text('at').notNull(),
  byKind: text('by_kind').notNull(),
  byId: text('by_id').notNull(),
  before: text('before'),
  after: text('after'),
}, (t) => [
  index('provider_changes_provider_idx').on(t.providerId, t.id),
  check('provider_changes_what', sql`${t.what} IN ('add', 'change', 'remove')`),
  check('provider_changes_json', sql`(${t.before} IS NULL OR json_valid(${t.before})) AND (${t.after} IS NULL OR json_valid(${t.after}))`),
  check(
    'provider_changes_shape',
    sql`(${t.what} = 'add' AND ${t.before} IS NULL AND ${t.after} IS NOT NULL) OR (${t.what} = 'change' AND ${t.before} IS NOT NULL AND ${t.after} IS NOT NULL) OR (${t.what} = 'remove' AND ${t.before} IS NOT NULL AND ${t.after} IS NULL)`,
  ),
]), {
  exported: true,
  restore: 'compared',
  noProjectBecause: "the providers' history belongs to the whole installation, as the providers do",
  fillForTheProof: theFillGivenBy('src/server/lib/the-provider-table.ts'),
})
