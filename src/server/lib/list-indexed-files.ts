// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `listIndexedFiles` was moved byte for byte out of src/server/lib/sourceindex.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { SourceFile, SourceLanguage } from '@shared/types.ts'
import { sqlite } from '../db/client.ts'
import { parseNames } from './index-status.ts'
import type { FileRow } from './sourceindex.ts'

/**
 * Every stored file of the WORKSPACE SCAN, in path order.
 *
 * `repository_id IS NULL` IS THE WHOLE MEANING OF THIS READ AND NOT A NARROWING. Two doors write
 * `source_files`: this file's scan records the one root it walks and names no repository, and
 * `rebuildRepository` records a named repository. Both were in the table, and this reader returned
 * both, so a workspace with an implementation index counted every file twice — measured at 4,760
 * where the checkout held 2,381. This reader means the workspace scan, so it asks for the workspace
 * scan's rows and never adds the other owner's to them.
 *
 * `repositoryId` names the other owner instead: the stored scan of one registered repository, which
 * `rebuildRepository` in lib/implementation.ts writes. Left out, it is null and this is the
 * workspace scan, as it always was. One owner per call either way, never both.
 */
export function listIndexedFiles(workspaceId: string, repositoryId: string | null = null): SourceFile[] {
  const rows = sqlite
    .prepare(
      'SELECT path, language, size_bytes, lines, imports, exports, modified_at FROM source_files ' +
        'WHERE workspace_id = ? AND repository_id IS ? ORDER BY path',
    )
    .all(workspaceId, repositoryId) as FileRow[]

  return rows.map((row) => ({
    path: row.path,
    // Widened from TEXT the way records.ts widens `kind`: the value was written from
    // SOURCE_FILE_EXTENSIONS on the way in, which is the only place a language comes from.
    language: row.language as SourceLanguage,
    sizeBytes: row.size_bytes,
    lines: row.lines,
    imports: parseNames(row.imports, row.path, 'imports', 'so this file would be served as though it imported nothing'),
    exports: parseNames(row.exports, row.path, 'exports', 'so this file would be served as though it declared nothing'),
    modifiedAt: row.modified_at,
  }))
}
