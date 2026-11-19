// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type Database from 'better-sqlite3'
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { CLASSIFY_PREFIX_BYTES, DEFERRED_STORAGE_STORES, STORAGE_CATEGORIES, STORAGE_STORES, classifyStoredFile, type StorageCategory } from '../../../shared/storage/categories.ts'

export const STORAGE_IO_BYTES = 64 * 1024
export const STORAGE_BATCH_SIZE = 128
export interface InventoryFile { path: string; category: StorageCategory; bytes: number; fingerprint: string }
export interface MeasuredFile extends InventoryFile { stamp: string }

export function storagePath(root: string, path: string): string {
  const key = relative(resolve(root), resolve(path)).split(sep).join('/')
  if (isAbsolute(key) || key.startsWith('../') || !STORAGE_STORES.some(store => key.startsWith(`${store}/`))) {
    throw new Error('The file is outside the physical storage folders.')
  }
  return key
}

/** One open file, bounded buffers, no followed links. The digest reads chunks, never a whole file buffer. */
export function measureStorageFile(root: string, path: string, classifyName = path): MeasuredFile {
  const key = storagePath(root, path)
  if (realpathSync(path) !== resolve(path)) throw new Error('A storage path contains a symbolic link.')
  const before = lstatSync(path, { bigint: true })
  if (!before.isFile() || before.nlink > 1n) throw new Error('A storage entry is a link or is not a regular file.')
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = fstatSync(fd, { bigint: true })
    if (opened.dev !== before.dev || opened.ino !== before.ino) throw new Error('The file changed while opening it.')
    const buffer = Buffer.alloc(STORAGE_IO_BYTES)
    const prefix = Buffer.alloc(CLASSIFY_PREFIX_BYTES)
    let prefixSize = 0
    let bytes = 0
    const hash = createHash('sha256')
    for (;;) {
      const n = readSync(fd, buffer, 0, buffer.length, null)
      if (n === 0) break
      hash.update(buffer.subarray(0, n))
      const keep = Math.min(n, prefix.length - prefixSize)
      buffer.copy(prefix, prefixSize, 0, keep)
      prefixSize += keep
      bytes += n
    }
    const after = fstatSync(fd, { bigint: true })
    const stampOf = (s: typeof before): string => `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`
    if (stampOf(before) !== stampOf(after) || stampOf(lstatSync(path, { bigint: true })) !== stampOf(after)) {
      throw new Error('The file changed while measuring it.')
    }
    return { path: key, bytes, category: classifyStoredFile(classifyName, prefix.subarray(0, prefixSize)), fingerprint: hash.digest('hex'), stamp: stampOf(after) }
  } finally { closeSync(fd) }
}

const inventoryWriters = new WeakMap<Database.Database, Database.Statement>()

/** An unchanged physical path keeps its category; reads never classify it again. */
export function registerStorageFile(sqlite: Database.Database, file: InventoryFile, plan: string | null = null): void {
  let statement = inventoryWriters.get(sqlite)
  if (statement === undefined) {
    statement = sqlite.prepare(`INSERT INTO storage_files(path,category,bytes,fingerprint,seen_plan) VALUES(@path,@category,@bytes,@fingerprint,@plan)
    ON CONFLICT(path) DO UPDATE SET
      category=CASE WHEN storage_files.fingerprint=excluded.fingerprint AND storage_files.bytes=excluded.bytes THEN storage_files.category ELSE excluded.category END,
      bytes=excluded.bytes,fingerprint=excluded.fingerprint,seen_plan=coalesce(excluded.seen_plan,storage_files.seen_plan)
    WHERE storage_files.fingerprint != excluded.fingerprint OR storage_files.bytes != excluded.bytes
      OR (excluded.seen_plan IS NOT NULL AND storage_files.seen_plan IS NOT excluded.seen_plan)`)
    inventoryWriters.set(sqlite, statement)
  }
  statement.run({ ...file, plan })
}
export function forgetStorageFile(sqlite: Database.Database, path: string): void {
  sqlite.prepare('DELETE FROM storage_files WHERE path = ?').run(path)
}
export function moveStorageFile(sqlite: Database.Database, before: string, after: string): void {
  sqlite.prepare('UPDATE storage_files SET path = ? WHERE path = ?').run(after, before)
}
const measurementReaders = new WeakMap<object, Database.Statement>()
export function storageMeasurement(sqlite: Pick<Database.Database, 'prepare'>) {
  let statement = measurementReaders.get(sqlite)
  if (statement === undefined) {
    statement = sqlite.prepare('SELECT generation,phase,plan_digest,skipped,checked_generation FROM storage_measurement WHERE id = 1')
    measurementReaders.set(sqlite, statement)
  }
  return statement.get() as
    { generation: number; phase: string; plan_digest: string | null; skipped: number; checked_generation: number | null } | undefined
}

/** This request reads at most five category rows and one measurement row, independent of inventory size. */
export function readStorageCategories(sqlite: Pick<Database.Database, 'prepare'>) {
  const totals = sqlite.prepare(`SELECT category,bytes,files FROM storage_totals LIMIT ${STORAGE_CATEGORIES.length}`).all() as { category: StorageCategory; bytes: number; files: number }[]
  const measured = storageMeasurement(sqlite)
  return {
    scope: 'installation', complete: false,
    state: measured?.phase ?? 'unmeasured',
    coverage: 'measured-inventory-only',
    externalEdits: 'require-another-checked-snapshot',
    snapshotTime: null, snapshotTimeSource: 'not-recorded',
    deferredStores: [...DEFERRED_STORAGE_STORES],
    skipped: measured?.skipped ?? null,
    categories: STORAGE_CATEGORIES.map(category => ({ category, bytes: totals.find(row => row.category === category)?.bytes ?? 0, files: totals.find(row => row.category === category)?.files ?? 0 })),
  }
}

/** A small real inventory write used by the archive/restore proof for all three tables. */
export async function fillStorageProof(): Promise<string> {
  const { sqlite } = await import('../client.ts')
  registerStorageFile(sqlite, { path: 'report-files/archive-proof.txt', category: 'text', bytes: 3, fingerprint: 'proof' })
  return 'One physical file inventory row and its running total and measurement row.'
}
