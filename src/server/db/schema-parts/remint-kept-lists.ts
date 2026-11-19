// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { registryRemintGenerations } from './remint-generations.ts'

/**
 * THE RE-MINT'S OLD-TO-NEW LISTS: one row for each pair of an old value and the new one it was replaced by, in one
 * generation. Migration 0336. A row is one of five lists:
 *
 *   agent_id      an agent's old id and its new id. `new` is the mint's length, 12 characters.
 *   content_hash  a revision's old content hash and its new one. Each is HASH_CHARS lowercase hex characters
 *                 (16 today), the shape versionOf makes.
 *   seal_hash     the old hash a seal pinned a revision row by, and the new hash of that row over the same list of
 *                 columns. Each is 64 lowercase hex characters, a sha256.
 *   link_hash     the old hash a seal pinned a link's row by, and the new hash of that row over the same list of
 *                 columns. Each is 64 lowercase hex characters, a sha256. `linkId` names the link.
 *   seal_own_hash a seal's old own hash and the own hash of its rewritten content. Each is 64 lowercase hex
 *                 characters, the shape sealHash makes.
 *
 * A content_hash, seal_hash or seal_own_hash row names the revision it is about by its record and its 1-based seq; a
 * link_hash row names its link by its id; an agent_id row names none of them. The three unique indexes keep one new
 * value for each old id and each old seal or link hash, one content-hash pair for each revision, and one own-hash pair
 * for each seal revision, in a generation. A revision can hold both of the last two, because the rewrite changes its
 * content hash and its own hash when it remakes a seal. The rewrite writes a row here inside the one transaction the
 * migration command runs every step in. The re-mint verifier and the export verifier read the table. Every archive
 * carries it: every export writes its rows, every import reads the stored rows and adds each archive row it does not
 * hold yet, and the restore proof compares it.
 *
 * THE PRIMARY KEY IS THE WHOLE ROW. Every column is in it, so an import matches a stored row only by the whole row.
 * SQLite keeps that key in an automatic index of its own, and the three unique indexes below are the only ones this
 * part names.
 */
export const registryRemintKeptLists = aPartTable(sqliteTable('registry_remint_kept_lists', {
  /** The generation row of the re-mint this pair belongs to, by its digest. */
  generation: text('generation').notNull().references(() => registryRemintGenerations.digest),
  /** One of the five list words: agent_id, content_hash, seal_hash, link_hash or seal_own_hash. */
  list: text('list').notNull(),
  /** The revision a content_hash, seal_hash or seal_own_hash row is about, and null on an agent_id or link_hash row. */
  recordId: text('record_id'),
  /** The revision's 1-based seq, and null on an agent_id or link_hash row. */
  seq: integer('seq'),
  /** The link a link_hash row is about, and null on the other four lists. */
  linkId: text('link_id'),
  /** The old value: an agent's old id, a revision's old content hash, the old hash a seal pinned a revision's or a link's row by, or a seal's old own hash. */
  old: text('old').notNull(),
  /** The new value: an agent's new id, a revision's new content hash, the new hash of a revision's or a link's row over the same columns, or the own hash of a seal's rewritten content. */
  new: text('new').notNull(),
}, table => [
  primaryKey({ columns: [table.generation, table.list, table.recordId, table.seq, table.linkId, table.old, table.new] }),
  check('registry_remint_kept_lists_generation', sql`length(${table.generation}) = 64 AND ${table.generation} NOT GLOB '*[^0-9a-f]*'`),
  check('registry_remint_kept_lists_list', sql`${table.list} IN ('agent_id', 'content_hash', 'seal_hash', 'link_hash', 'seal_own_hash')`),
  check(
    'registry_remint_kept_lists_names_its_subject',
    sql`(${table.list} = 'agent_id' AND ${table.recordId} IS NULL AND ${table.seq} IS NULL AND ${table.linkId} IS NULL) OR (${table.list} IN ('content_hash', 'seal_hash', 'seal_own_hash') AND ${table.recordId} IS NOT NULL AND ${table.seq} IS NOT NULL AND ${table.seq} >= 1 AND ${table.linkId} IS NULL) OR (${table.list} = 'link_hash' AND ${table.linkId} IS NOT NULL AND ${table.recordId} IS NULL AND ${table.seq} IS NULL)`,
  ),
  check('registry_remint_kept_lists_differ', sql`${table.old} <> ${table.new}`),
  check(
    'registry_remint_kept_lists_content_hash',
    sql`${table.list} <> 'content_hash' OR (length(${table.old}) = 16 AND ${table.old} NOT GLOB '*[^0-9a-f]*' AND length(${table.new}) = 16 AND ${table.new} NOT GLOB '*[^0-9a-f]*')`,
  ),
  check(
    'registry_remint_kept_lists_seal_hash',
    sql`${table.list} <> 'seal_hash' OR (length(${table.old}) = 64 AND ${table.old} NOT GLOB '*[^0-9a-f]*' AND length(${table.new}) = 64 AND ${table.new} NOT GLOB '*[^0-9a-f]*')`,
  ),
  check(
    'registry_remint_kept_lists_link_hash',
    sql`${table.list} <> 'link_hash' OR (length(${table.old}) = 64 AND ${table.old} NOT GLOB '*[^0-9a-f]*' AND length(${table.new}) = 64 AND ${table.new} NOT GLOB '*[^0-9a-f]*')`,
  ),
  check(
    'registry_remint_kept_lists_seal_own_hash',
    sql`${table.list} <> 'seal_own_hash' OR (length(${table.old}) = 64 AND ${table.old} NOT GLOB '*[^0-9a-f]*' AND length(${table.new}) = 64 AND ${table.new} NOT GLOB '*[^0-9a-f]*')`,
  ),
  check('registry_remint_kept_lists_new_agent_id', sql`${table.list} <> 'agent_id' OR length(${table.new}) = 12`),
  uniqueIndex('registry_remint_kept_lists_old_idx').on(table.generation, table.list, table.old).where(sql`${table.list} IN ('agent_id', 'seal_hash', 'link_hash')`),
  uniqueIndex('registry_remint_kept_lists_revision_idx').on(table.generation, table.recordId, table.seq).where(sql`${table.list} = 'content_hash'`),
  uniqueIndex('registry_remint_kept_lists_seal_own_hash_idx').on(table.generation, table.recordId, table.seq).where(sql`${table.list} = 'seal_own_hash'`),
]), {
  exported: true,
  restore: 'compared',
  noProjectBecause: 'a re-mint rewrites the whole agent registry, and its kept old-to-new lists belong to every project',
  fillForTheProof: async () => (await import('../remint-migration.ts')).fillTheKeptListsProof(),
})
