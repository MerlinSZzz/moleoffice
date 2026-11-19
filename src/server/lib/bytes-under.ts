// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BYTES OF EVERY ORDINARY FILE UNDER A FOLDER, HOWEVER DEEP.
 *
 * Two readers use it on a backup's files folder (`<copy>.files`). The What is kept panel adds the
 * number to the backups folder's total, in src/server/lib/what-is-kept.ts. The prune command prints
 * it as the size of the folder it deletes, in scripts/prune-backups.ts. Both read it from here, so
 * the panel and the prune say the same size for the same folder.
 *
 * A link is followed, and what it points at is counted. A name that is neither a folder nor an
 * ordinary file, such as a socket, adds nothing.
 *
 * It throws the file system's own error when a name under the folder cannot be listed or read. It
 * catches nothing: each caller decides what that means. The panel says the backups folder could not
 * be read, and the prune deletes nothing.
 *
 * This file imports nothing but node:fs and node:path. The prune command must not import anything
 * that opens the database, and this file opens none.
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export function bytesUnder(folder: string): number {
  let bytes = 0
  for (const name of readdirSync(folder)) {
    const at = join(folder, name)
    const stat = statSync(at)
    if (stat.isDirectory()) bytes += bytesUnder(at)
    else if (stat.isFile()) bytes += stat.size
  }
  return bytes
}
