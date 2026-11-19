// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THIS PROCESS MAY WRITE IN A FOLDER WHOSE MODE SAYS IT MAY NOT (wave 13t, round W28).
 *
 * tests/root-may-write-in-any-folder.ts asks this, and no longer the uid. A folder of its own is made under the
 * system's temporary folder, shut to 0o500 and written in once. A write that is done says yes, as root's is, and a write
 * refused says no. Any other failure is thrown, because it says nothing about the folder's mode. The folder is opened
 * again and removed afterwards, whatever the write did.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Whether a write into a shut folder is done. `write` is the write, unless a test names another. */
export function aShutFolderTakesAWrite(write: (path: string) => void = (path) => writeFileSync(path, '')): boolean {
  const folder = mkdtempSync(join(tmpdir(), 'a-shut-folder-'))
  try {
    chmodSync(folder, 0o500)
    try {
      write(join(folder, 'a-write'))
      return true
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EACCES' || code === 'EPERM') return false
      throw err
    }
  } finally {
    chmodSync(folder, 0o700)
    rmSync(folder, { recursive: true, force: true })
  }
}
