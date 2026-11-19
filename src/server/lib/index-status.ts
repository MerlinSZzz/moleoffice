// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `indexStatus` was moved byte for byte out of src/server/lib/sourceindex.ts, with no change of behaviour.
 * `parseNames` was moved byte for byte out of src/server/lib/sourceindex.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from '../db/client.ts'
import type { IndexRow, IndexStatus } from './sourceindex.ts'
import { PanelError } from './panel-error.ts'

/** `repositoryId` as in `listIndexedFiles`: null, the default, is the workspace scan. */
export function indexStatus(workspaceId: string, repositoryId: string | null = null): IndexStatus | null {
  const row = sqlite
    .prepare(
      'SELECT built_at, built_by, root, scan_ms, skipped FROM source_index ' +
        'WHERE workspace_id = ? AND repository_id IS ?',
    )
    .get(workspaceId, repositoryId) as IndexRow | undefined
  if (!row) return null
  const count = sqlite
    .prepare('SELECT count(*) AS n FROM source_files WHERE workspace_id = ? AND repository_id IS ?')
    .get(workspaceId, repositoryId) as { n: number }
  return {
    builtAt: row.built_at,
    builtBy: row.built_by,
    root: row.root,
    scanMs: row.scan_ms,
    skipped: parseNames(row.skipped, '(the index)', 'skipped', 'so this index cannot say where it did not look'),
    fileCount: count.n,
  }
}
/**
 * A stored JSON list of strings, or a loud failure.
 *
 * These columns are written by JSON.stringify a few lines below, so they parse — a row that does
 * not is a corrupt index, and the alternative to saying so is serving a file as though it
 * imported nothing, which reads exactly like a leaf of the dependency graph.
 *
 * The message QUOTES what it could not read, which the copy in api/source.ts did and this one did
 * not. Without it the fix starts by working out which row is wrong.
 */
export function parseNames(json: string, where: string, which: string, consequence: string): string[] {
  const refuse = (why: string): never => {
    throw new PanelError(
      `The stored ${which} list for ${where} is unreadable (${why}), ${consequence}. Rebuild the index with ` +
        '`npx tsx scripts/reindex.ts`, or POST /api/source/reindex.',
      500,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    return refuse(err instanceof Error ? err.message : String(err))
  }
  if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== 'string')) {
    return refuse(`it is ${json.slice(0, 60)}`)
  }
  return parsed as string[]
}
