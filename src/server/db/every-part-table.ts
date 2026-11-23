// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { sourceFiles, sourceIndex, sourceFileHashes, implementationFindings, apiCalls, heldKeys, runTokens, headerOnlyCalls, hourlyCalls, outsideReads, usageStretches, usageChecks, gateCounts, gateCountSpoolReads } from './schema.ts'
import { AUTHORED_TABLE_OF } from './authored-table-of.ts'
import { IRREPLACEABLE_TABLES } from './migration-declared-tables.ts'
import { thePartTables, type PartTable } from './part-tables.ts'
import * as everyPart from './schema-parts/index.ts'
import {
  AUTHORED_TABLES,
  LEGACY_DERIVED_TABLES,
  MEASURED_TABLES,
  RECORD_TEXT_INDEX_TABLES,
} from './table-name-lists.ts'

/** Reserved names; an existing authored archive may retain the exact table in its registry. */
export const NAMES_A_PART_MAY_NOT_TAKE: readonly string[] = [
  ...AUTHORED_TABLES,
  ...LEGACY_DERIVED_TABLES,
  ...MEASURED_TABLES,
  ...RECORD_TEXT_INDEX_TABLES,
]

/**
 * Every table the schema parts declare, with what each says about itself.
 *
 * A FUNCTION, READ WHEN ASKED, and not a list made while this file loads. It was made one while schema.ts re-exported
 * this file: a part file that imports schema.ts, imported first, made schema.ts load this file before the part's own
 * tables existed, and reading them then threw a ReferenceError (measured at the foot of schema.ts on 23 October 2026
 * with a part table referencing `workspaces`). schema.ts no longer re-exports this file.
 */
export function everyPartTable(): readonly PartTable[] {
  const derived = new Map<string, SQLiteTable>([
    ['source_files', sourceFiles],
    ['source_index', sourceIndex],
    ['source_file_hashes', sourceFileHashes],
    ['implementation_findings', implementationFindings],
  ])
  const measured = new Map<string, SQLiteTable>([
    ['api_calls', apiCalls],
    ['held_keys', heldKeys],
    ['run_tokens', runTokens],
    ['header_only_calls', headerOnlyCalls],
    ['hourly_calls', hourlyCalls],
    ['outside_reads', outsideReads],
    ['usage_stretches', usageStretches],
    ['usage_checks', usageChecks],
    ['gate_counts', gateCounts],
    ['gate_count_spool_reads', gateCountSpoolReads],
  ])
  return thePartTables(new Map([['src/server/db/schema-parts/', everyPart]]), NAMES_A_PART_MAY_NOT_TAKE, new Map(Object.entries(AUTHORED_TABLE_OF)), derived, LEGACY_DERIVED_TABLES, measured, MEASURED_TABLES)
}

/** Exported part tables hold authored work too. Read after the parts have finished loading. */
export function irreplaceableTablesWithParts(): readonly string[] {
  return [...IRREPLACEABLE_TABLES,...everyPartTable().filter(part=>part.says.exported).map(part=>part.name)]
}
