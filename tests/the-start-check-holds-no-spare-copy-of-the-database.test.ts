// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE START CHECK HOLDS NO SPARE COPY OF THE DATABASE IN MEMORY. Wave 13y round 20, item 3.
 *
 * MEASURED FIRST: on 10 October 2026 the live office took 16 s from SIGTERM to listen, and its memory peaked at
 * 5.9 GB. On a made-up office of 590 MB, `previewMigration` held four copies of the database at once: the image
 * read with `serialize`, a `Buffer.from` of it, the copy SQLite owns, and the copy read back after the migrations.
 * The process reached 3.2 GB. better-sqlite3 copies the buffer it is given into memory SQLite owns, so the
 * `Buffer.from` was the one copy nothing needed.
 *
 * WHAT THIS HOLDS: the in-memory measurement makes no JavaScript copy of a buffer the size of the database.
 *
 * AND THE FILE MEASUREMENT HOLDS ONE CHUNK OF ITS COPY, NOT THE COPY. Wave 13y round 21, item 1. A database above
 * the in-memory limit is measured against a copy on disk, and until this round the copy was read into memory whole
 * before the migrations and again after them, to be compared. Measured on a made-up office of the live size
 * (2.80 GB): the start reached 6.10 GB, as live reached 5.82 to 5.89 GB on 10 October 2026. With each reading kept
 * only as a fingerprint it reached 0.83 and 0.98 GB in two runs. The second test here allocates, in chunk-sized
 * buffers, less than the database's own size in all.
 *
 * WHAT IT DOES NOT HOLD. That the image is still compared as it was read; the third test of
 * tests/the-migration-preview-measures-a-large-database-on-a-file-copy.test.ts holds that, on this path too: a
 * write no report explains is caught.
 *
 * CONTROL: both tests pass at the tip. MUTATIONS: `copyIntoMemory` hands `Buffer.from(image)` to the connection
 * again (src/server/db/migrate.ts), and the first test is red; `piecesOf` allocates a new buffer for every chunk
 * and the fingerprints are taken over all the chunks kept in a list, as before round 21, and the second is red.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, expect, it } from 'vitest'

import { migrateInPlace, previewMigration, THE_PREVIEW_SEAM, whereTheCopyGoes } from '../src/server/db/migrate.ts'

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle')
const dir = mkdtempSync(join(tmpdir(), 'mole-office-spare-copy-'))

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

it('the in-memory measurement makes no JavaScript copy of the database', () => {
  const db = new Database(join(dir, 'office.db'))
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrateInPlace(db, MIGRATIONS)
    const bytes = (db.pragma('page_count', { simple: true }) as number) * (db.pragma('page_size', { simple: true }) as number)
    expect(whereTheCopyGoes(db)).toBe('memory')

    const from = Buffer.from
    const copiesOfTheDatabase: number[] = []
    Buffer.from = function (this: unknown, ...args: unknown[]) {
      const first = args[0]
      if (Buffer.isBuffer(first) && first.length >= bytes) copiesOfTheDatabase.push(first.length)
      return (from as (...a: unknown[]) => Buffer).apply(this, args)
    } as typeof Buffer.from
    let wouldWrite: string[]
    try {
      wouldWrite = previewMigration(db, MIGRATIONS).wouldWrite
    } finally {
      Buffer.from = from
    }
    expect(wouldWrite, 'the database had nothing to migrate').toEqual([])
    expect(copiesOfTheDatabase, `copies of a database of ${String(bytes)} bytes`).toEqual([])
  } finally {
    db.close()
  }
})

it('the file measurement holds one chunk of its copy at a time, not the copy', () => {
  const db = new Database(join(dir, 'large.db'))
  const AS_SHIPPED = { ...THE_PREVIEW_SEAM }
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrateInPlace(db, MIGRATIONS)
    const bytes = (db.pragma('page_count', { simple: true }) as number) * (db.pragma('page_size', { simple: true }) as number)
    const chunk = 4096
    THE_PREVIEW_SEAM.inMemoryLimit = bytes - 1
    THE_PREVIEW_SEAM.compareChunkBytes = chunk
    expect(whereTheCopyGoes(db)).toBe('file')
    expect(bytes, 'the database is many chunks long').toBeGreaterThan(16 * chunk)

    const allocUnsafe = Buffer.allocUnsafe
    let chunkBytes = 0
    Buffer.allocUnsafe = function (size: number) {
      if (size === chunk) chunkBytes += size
      return allocUnsafe(size)
    } as typeof Buffer.allocUnsafe
    let wouldWrite: string[]
    try {
      wouldWrite = previewMigration(db, MIGRATIONS).wouldWrite
    } finally {
      Buffer.allocUnsafe = allocUnsafe
    }
    expect(wouldWrite, 'the database had nothing to migrate').toEqual([])
    expect(chunkBytes, `bytes allocated in chunks of ${String(chunk)} while measuring a database of ${String(bytes)} bytes`).toBeLessThan(bytes)
  } finally {
    Object.assign(THE_PREVIEW_SEAM, AS_SHIPPED)
    db.close()
  }
})
