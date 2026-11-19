// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INTEGRITY CHECK RUNS BESIDE THE MIGRATION PREVIEW, AND ITS ANSWER STILL DECIDES FIRST.
 *
 * Problem Blt6Dv5ieC3r: past 2 GiB a start took about two minutes. Measured in wave 13p round 15 on a scratch database
 * of the live one's shape (2.16 GB): the integrity check and the preview each read the whole database, one after the
 * other (21 to 24 s warm, 58 s cold). `prepareToServe` now runs the check on a read-only connection of its own in a
 * worker while the preview measures its copy (about 14 s warm, 19 s cold). This file holds what must not change:
 *
 *   1. a damaged database is refused as damaged on the preview branch, though the preview itself found nothing;
 *   2. on a database with a file, the check ran beside the preview, and the start report says so;
 *   3. on a database with no file, the check runs on the same connection, and the report says why.
 *
 * The damage is made where only the integrity check can see it: an index page overwritten. VACUUM INTO, which makes
 * the preview's copy, rebuilds every index from its table, so the preview's copy is whole and finds nothing to do.
 *
 * Mutations, proved in the commit message: drop the check after the preview; run the check on this connection always.
 */
import { closeSync, openSync, rmSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { migrateInPlace, prepareToServe, previewMigration } from '../src/server/db/migrate.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = join(REPO, 'drizzle')
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Writes one authored record and migrates again, so the database has nothing left to do and is not the seed's. */
function settle(db: Database.Database): void {
  db.pragma('foreign_keys = ON')
  migrateInPlace(db, MIGRATIONS)
  const add = db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
      "VALUES (?, 'default', 'owner-1', '2026-07-01 09:00:00', '2026-07-01 09:00:00', 'note', ?, NULL, '{}', 'authored')",
  )
  // ONE TRANSACTION, so the four hundred rows cost one sync rather than four hundred.
  db.transaction(() => {
    for (let i = 0; i < 400; i++) add.run(`note-${String(i)}`, `An invented note with a title long enough to fill pages ${String(i)}`)
  })()
  migrateInPlace(db, MIGRATIONS)
}

/** A settled scratch database in a file, in rollback-journal mode so its pages are all in the main file. */
function aSettledFile(name: string): string {
  const dir = aTestDatabaseFolder(`integrity-beside-${name}`)
  dirs.push(dir)
  const file = join(dir, 'office.db')
  const db = new Database(file)
  settle(db)
  db.pragma('journal_mode = DELETE')
  db.close()
  return file
}

describe('the integrity check runs beside the preview and still decides first', () => {
  it('refuses a damaged database as damaged on the preview branch, though the preview finds nothing to do', () => {
    const file = aSettledFile('damaged')
    const look = new Database(file, { readonly: true })
    const root = (look.prepare("SELECT rootpage FROM sqlite_master WHERE name = 'records_title_idx'").get() as { rootpage: number }).rootpage
    const pageSize = look.pragma('page_size', { simple: true }) as number
    look.close()
    // ZEROS OVER THE CELLS OF THE INDEX'S ROOT PAGE, past its header: the table is whole, the index is not.
    const fd = openSync(file, 'r+')
    writeSync(fd, Buffer.alloc(pageSize - 200), 0, pageSize - 200, (root - 1) * pageSize + 200)
    closeSync(fd)

    const db = new Database(file)
    db.pragma('foreign_keys = ON')
    try {
      expect(previewMigration(db, MIGRATIONS).wouldWrite, 'the preview alone finds nothing to do').toEqual([])
      const decision = prepareToServe(db, MIGRATIONS)
      expect(decision.serve).toBe(false)
      if (!decision.serve) expect(decision.refusal).toContain('DAMAGED')
    } finally {
      db.close()
    }
  })

  it('runs the check beside the preview on a database with a file, and the start report says so', () => {
    const db = new Database(aSettledFile('beside'))
    try {
      const decision = prepareToServe(db, MIGRATIONS)
      expect(decision.serve).toBe(true)
      if (decision.serve) expect(decision.report).toContain('The integrity check ran on a read-only connection of its own while the copy was measured.')
    } finally {
      db.close()
    }
  })

  it('runs the check on the same connection for a database with no file, and the report says why', () => {
    const db = new Database(':memory:')
    try {
      settle(db)
      const decision = prepareToServe(db, MIGRATIONS)
      expect(decision.serve).toBe(true)
      if (decision.serve) expect(decision.report).toContain('The integrity check ran on this connection after the preview, because the database has no file')
    } finally {
      db.close()
    }
  })
})
