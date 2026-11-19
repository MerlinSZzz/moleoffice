// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SOURCE AND IMPLEMENTATION TABLES, one declaration to a file. `session_resources` is in
 * `session-resources.ts`, `source_files` in `source-files.ts`, `source_index` in `source-index.ts`,
 * `source_file_hashes` in `source-file-hashes.ts`, `repositories` in `repositories.ts`,
 * `implementation_revisions` in `implementation-revisions.ts`, `implementation_findings` in
 * `implementation-findings.ts` and `file_observations` in `file-observations.ts`.
 * `implementation_map` stays in schema.ts: it references `records`, and schema.ts reads it while it
 * loads, as schema-parts/index.ts says.
 *
 * THIS FILE STAYS AS THE COMPATIBILITY BARREL. schema-parts/index.ts exports it, and schema.ts
 * imports the eight tables and four row types from it, so neither has to change while the
 * declarations are divided. Each table keeps its existing archive and restore answers beside its
 * own declaration.
 */
export { sessionResources } from './session-resources.ts'
export { sourceFiles } from './source-files.ts'
export { sourceIndex } from './source-index.ts'
export { sourceFileHashes } from './source-file-hashes.ts'
export { repositories } from './repositories.ts'
export { implementationRevisions } from './implementation-revisions.ts'
export { implementationFindings } from './implementation-findings.ts'
export { fileObservations } from './file-observations.ts'

export type { SessionResourceRow } from './session-resources.ts'
export type { SourceFileRow } from './source-files.ts'
export type { SourceIndexRow } from './source-index.ts'
export type { SourceFileHashRow } from './source-file-hashes.ts'
