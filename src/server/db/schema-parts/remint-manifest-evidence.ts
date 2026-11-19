// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, foreignKey, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { registryRemintGenerations } from './remint-generations.ts'

export const registryRemintManifestBodies = aPartTable(sqliteTable('registry_remint_manifests', {
  generation: text('generation').notNull().references(() => registryRemintGenerations.digest),
  originalDigest: text('original_digest').notNull(),
  originalJson: text('original_json').notNull(),
  rewrittenDigest: text('rewritten_digest').notNull(),
  rewrittenJson: text('rewritten_json').notNull(),
  derivedOriginalAck: text('derived_original_ack').notNull(),
  derivedRewrittenAck: text('derived_rewritten_ack').notNull(),
}, table => [
  primaryKey({ columns: [table.generation, table.originalDigest], name: 'registry_remint_manifests_key' }),
  check('registry_remint_manifests_generation', sql`length(${table.generation}) = 64 AND ${table.generation} NOT GLOB '*[^0-9a-f]*'`),
  check('registry_remint_manifests_original_digest', sql`length(${table.originalDigest}) = 64 AND ${table.originalDigest} NOT GLOB '*[^0-9a-f]*'`),
  check('registry_remint_manifests_rewritten_digest', sql`length(${table.rewrittenDigest}) = 64 AND ${table.rewrittenDigest} NOT GLOB '*[^0-9a-f]*'`),
  check('registry_remint_manifests_json', sql`json_valid(${table.originalJson}) AND json_valid(${table.rewrittenJson})`),
]), {
  exported: true,
  restore: 'compared',
  noProjectBecause: 'a re-mint applies across the installation and preserves its manifests by generation',
  fillForTheProof: async () => (await import('../remint-manifest-evidence.ts')).fillManifestEvidenceProof(),
})

export const registryRemintManifestRevisions = aPartTable(sqliteTable('registry_remint_manifest_revisions', {
  generation: text('generation').notNull(),
  recordId: text('record_id').notNull(),
  seq: integer('seq').notNull(),
  originalDigest: text('original_digest').notNull(),
  oldContentHash: text('old_content_hash').notNull(),
  newContentHash: text('new_content_hash').notNull(),
}, table => [
  primaryKey({ columns: [table.generation, table.recordId, table.seq], name: 'registry_remint_manifest_revisions_key' }),
  foreignKey({ name: 'registry_remint_manifest_revisions_manifest', columns: [table.generation, table.originalDigest], foreignColumns: [registryRemintManifestBodies.generation, registryRemintManifestBodies.originalDigest] }),
  check('registry_remint_manifest_revisions_seq', sql`${table.seq} >= 1`),
  check('registry_remint_manifest_revisions_old_hash', sql`length(${table.oldContentHash}) = 16 AND ${table.oldContentHash} NOT GLOB '*[^0-9a-f]*'`),
  check('registry_remint_manifest_revisions_new_hash', sql`length(${table.newContentHash}) = 16 AND ${table.newContentHash} NOT GLOB '*[^0-9a-f]*'`),
]), {
  exported: true,
  restore: 'compared',
  noProjectBecause: 'the links describe a re-mint over the installation as a whole',
  fillForTheProof: async () => (await import('../remint-manifest-evidence.ts')).fillManifestEvidenceProof(),
})

export const registryRemintManifestChangeSides = aPartTable(sqliteTable('registry_remint_manifest_change_sides', {
  generation: text('generation').notNull().references(() => registryRemintGenerations.digest),
  changeId: text('change_id').notNull(),
  side: text('side').notNull(),
  originalField: text('original_field').notNull(),
  rewrittenField: text('rewritten_field').notNull(),
  originalValue: text('original_value'),
  rewrittenValue: text('rewritten_value'),
  originalValueDigest: text('original_value_digest').notNull(),
  rewrittenValueDigest: text('rewritten_value_digest').notNull(),
  originalManifestDigest: text('original_manifest_digest'),
}, table => [
  primaryKey({ columns: [table.generation, table.changeId, table.side], name: 'registry_remint_manifest_change_sides_key' }),
  foreignKey({ name: 'registry_remint_manifest_change_sides_manifest', columns: [table.generation, table.originalManifestDigest], foreignColumns: [registryRemintManifestBodies.generation, registryRemintManifestBodies.originalDigest] }),
  check('registry_remint_manifest_change_sides_side', sql`${table.side} IN ('old_value', 'new_value')`),
  check('registry_remint_manifest_change_sides_values', sql`(${table.originalValue} IS NOT NULL AND ${table.rewrittenValue} IS NOT NULL) OR (${table.originalValue} IS NULL AND ${table.rewrittenValue} IS NULL AND ${table.originalManifestDigest} IS NOT NULL)`),
  check('registry_remint_manifest_change_sides_original_digest', sql`length(${table.originalValueDigest}) = 64 AND ${table.originalValueDigest} NOT GLOB '*[^0-9a-f]*'`),
  check('registry_remint_manifest_change_sides_rewritten_digest', sql`length(${table.rewrittenValueDigest}) = 64 AND ${table.rewrittenValueDigest} NOT GLOB '*[^0-9a-f]*'`),
]), {
  exported: true,
  restore: 'compared',
  noProjectBecause: 'the links describe a re-mint over the installation as a whole',
  fillForTheProof: async () => (await import('../remint-manifest-evidence.ts')).fillManifestEvidenceProof(),
})
