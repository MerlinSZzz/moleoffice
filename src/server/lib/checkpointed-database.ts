// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RELEASE CHECK'S RULE FOR A CHECKPOINTED DATABASE. Release-check mode opens only a closed database in DELETE journal
 * mode (src/server/lib/release-check.ts). The rule is a module of its own that imports nothing but Node, so the made-up
 * office of the stable upgrade's tests keeps it without loading the product's settings.
 */
import { closeSync, existsSync, openSync, readSync } from 'node:fs'

/** Refuse journals rather than ignore work they may hold or let SQLite create companion files. */
export function requireCheckpointed(file: string): void {
  if (existsSync(`${file}-wal`) || existsSync(`${file}-journal`)) {
    throw new Error(`Release-check requires a closed, checkpointed database: ${file} has a WAL or rollback journal. Nothing was written.`)
  }
  const header = Buffer.alloc(100)
  const descriptor = openSync(file, 'r')
  let bytes: number
  try { bytes = readSync(descriptor, header, 0, header.length, 0) } finally { closeSync(descriptor) }
  if (bytes !== 100 || header.subarray(0, 16).toString('binary') !== 'SQLite format 3\0' || header[18] !== 1 || header[19] !== 1) {
    throw new Error(`Release-check requires a checkpointed SQLite database in DELETE journal mode: ${file}. SQLite was not opened and nothing was written.`)
  }
}
