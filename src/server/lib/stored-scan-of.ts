// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `storedScanOf` was moved byte for byte out of src/server/lib/sourceindex.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { SourceFile } from '@shared/types.ts'
import { listIndexedFiles } from './list-indexed-files.ts'
import { indexStatus } from './index-status.ts'
import type { IndexStatus } from './sourceindex.ts'

/**
 * THE STORED SCAN OF ONE REGISTERED REPOSITORY, or null when none is stored: its stamp and its files.
 *
 * This is the one reading of "the scan a row in this repository is counted against". The source door
 * (`claimsByRepository`), coverage, the unclaimed list and the work domains' resolver
 * (`ClaimsImplementation` and `scanFor` in lib/workdomain.ts) all read it, so none of them can count a
 * row against a different scan from the others.
 */
export function storedScanOf(workspaceId: string, repositoryId: string): { status: IndexStatus; files: SourceFile[] } | null {
  const status = indexStatus(workspaceId, repositoryId)
  if (status === null) return null
  return { status, files: listIndexedFiles(workspaceId, repositoryId) }
}
