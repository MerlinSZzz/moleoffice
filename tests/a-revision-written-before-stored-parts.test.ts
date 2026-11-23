// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { expect, it, vi } from 'vitest'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { readFileSync, writeFileSync } from 'node:fs'
import { journal, MIGRATIONS, partialMigrations } from './migration-fixtures.ts'

it('keeps whole revisions written before stored parts and reads them after the upgrade', async () => {
  const tag = journal(MIGRATIONS).find(entry => entry.tag.endsWith('_a_revision_stores_a_runs_chapters_once'))?.tag
  if (tag === undefined) throw new Error('The stored-parts migration is missing from the journal.')
  // EVERY MIGRATION BUT THE STORED-PARTS ONE. The two revisions below are written with no `parts` column, and today's
  // code still finds every other column it reads. A folder that ended before that migration lacked every later one
  // too, and today's code reads later columns: a run's change reads its hold's `last_heard_instant`. The migrator
  // takes a missing migration by its hash, so the whole upgrade below applies that one schema migration alone.
  const partial = partialMigrations(journal(MIGRATIONS).length)
  const journalFile = join(partial, 'meta', '_journal.json')
  const folder = JSON.parse(readFileSync(journalFile, 'utf8')) as { entries: { tag: string }[] }
  writeFileSync(journalFile, JSON.stringify({ ...folder, entries: folder.entries.filter(entry => entry.tag !== tag) }))
  const dir = aTestDatabaseFolder('revision-before-parts')
  const file = join(dir, 'panelx.db')
  const originalDb = process.env.MOLE_OFFICE_DB
  const empty = new Database(file)
  migrate(drizzle(empty), { migrationsFolder: partial })
  empty.close()
  vi.resetModules()
  process.env.MOLE_OFFICE_DB = file
  const client = await import('../src/server/db/client.ts')
  try {
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const api = await import('../src/server/lib/records.ts')
    migrateInPlace(client.sqlite, partial)
    const chapters = { text: 'Made-up chapter '.repeat(100) }
    const record = api.createRecord({ kind: 'session', title: 'A made-up run', workspaceId: 'default', actor: api.HUMAN, origin: 'fixture', data: { state: 'running', doing: 'first', extra: { roundChapters: chapters } } })
    api.patchRecord(record.id, { dataPatch: { doing: 'second' } }, api.HUMAN)
    const before = client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq').all(record.id) as Record<string, unknown>[]
    expect(before).toHaveLength(2)
    expect(before.map(row => JSON.parse(row.data as string).extra.roundChapters)).toEqual([chapters, chapters])

    migrateInPlace(client.sqlite)
    const after = client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq').all(record.id) as Record<string, unknown>[]
    expect(after.map(({ parts, ...oldColumns }) => ({ parts, oldColumns }))).toEqual(before.map(oldColumns => ({ parts: null, oldColumns })))
    api.patchRecord(record.id, { dataPatch: { doing: 'third' } }, api.HUMAN)
    const { getRevision } = await import('../src/server/lib/revisions.ts')
    expect([1, 2, 3].map(seq => getRevision(record.id, seq).content.data.extra)).toEqual([
      { roundChapters: chapters }, { roundChapters: chapters }, { roundChapters: chapters },
    ])
    const third = client.sqlite.prepare('SELECT parts FROM revisions WHERE record_id = ? AND seq = 3').get(record.id) as { parts: string }
    expect(JSON.parse(third.parts)).toEqual({ 'extra.roundChapters': 2 })
  } finally {
    client.sqlite.close()
    if (originalDb === undefined) delete process.env.MOLE_OFFICE_DB
    else process.env.MOLE_OFFICE_DB = originalDb
    removeThisTestFolder(dir)
  }
}, 60_000)
