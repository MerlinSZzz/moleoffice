// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { agents } from '../schema.ts'

/** Authored identity history; handles and all other identifier namespaces have separate meanings. */
export const registryAliases = aPartTable(sqliteTable('registry_aliases', {
  namespace: text('namespace').notNull(),
  aliasId: text('alias_id').notNull(),
  canonicalId: text('canonical_id').notNull().references(()=>agents.id, {onDelete:'restrict',onUpdate:'restrict'}),
}, table => [
  primaryKey({columns:[table.namespace,table.aliasId]}),
  // The second is by the id an alias replaces, so a read of an agent by a stored id searches the aliases instead of reading every one. Migration 0357 says why.
  index('registry_aliases_target_idx').on(table.namespace,table.canonicalId),
  index('registry_aliases_alias_idx').on(table.aliasId),
  check('registry_aliases_namespace',sql`${table.namespace} = 'agent-registry'`),
  check('registry_aliases_source',sql`length(${table.aliasId}) > 0 AND ${table.aliasId} = trim(${table.aliasId}) AND instr(${table.aliasId}, char(0)) = 0`),
  check('registry_aliases_target',sql`length(${table.canonicalId}) > 0 AND ${table.canonicalId} = trim(${table.canonicalId}) AND instr(${table.canonicalId}, char(0)) = 0 AND ${table.canonicalId} <> ${table.aliasId}`),
]), {
  exported:true,
  restore:'compared',
  noProjectBecause:'permanent registry aliases identify principals across every project',
  fillForTheProof:async () => (await import('../registry-aliases/restore-proof.ts')).fillRegistryAliasProof(),
})
