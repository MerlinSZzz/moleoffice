// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Small hooks at physical writers; no reference or record traversal. */
import { dirname, join } from 'node:path'
import { sqlite } from '../../db/client.ts'
import { settings } from '../../../config/settings.mjs'
import { measureStorageFile, registerStorageFile, forgetStorageFile, moveStorageFile, storagePath } from './inventory.ts'

const root = (): string => dirname(settings().databasePath)
export function storedFileChanged(path: string): void {
  registerStorageFile(sqlite, measureStorageFile(root(), path))
}
export function storedFileRemoved(path: string): void { forgetStorageFile(sqlite, storagePath(root(), path)) }
export function storedFileMoved(before: string, after: string): void {
  moveStorageFile(sqlite, storagePath(root(), before), storagePath(root(), after))
  registerStorageFile(sqlite, measureStorageFile(root(), after, before))
}
export function storedTreeRemoved(path: string): void {
  const prefix = `${storagePath(root(), join(path, '_')).slice(0, -1)}`
  sqlite.prepare('DELETE FROM storage_files WHERE path >= ? AND path < ?').run(prefix, prefix.slice(0, -1) + '0')
}
