// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/** The staged re-mint map that was applied, by its digest, with the migrations it was staged at. Migration 0313. */
export const registryRemintGenerations = aPartTable(sqliteTable('registry_remint_generations', {
  digest: text('digest').primaryKey().notNull(),
  schemaDigest: text('schema_digest').notNull(),
  agents: integer('agents').notNull(),
}, table => [
  check('registry_remint_generations_digest',sql`length(${table.digest}) = 64 AND ${table.digest} NOT GLOB '*[^0-9a-f]*'`),
  check('registry_remint_generations_schema',sql`length(${table.schemaDigest}) = 64 AND ${table.schemaDigest} NOT GLOB '*[^0-9a-f]*'`),
  check('registry_remint_generations_agents',sql`${table.agents} >= 0`),
]), {
  exported:true,
  restore:'compared',
  noProjectBecause:'a re-mint gives new ids across the whole agent registry, which every project shares',
  fillForTheProof:async () => (await import('../remint-migration.ts')).fillTheRemintGenerationProof(),
})
