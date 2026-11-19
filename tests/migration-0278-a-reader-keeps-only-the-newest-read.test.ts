// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0278 KEEPS ONLY EACH READER'S NEWEST READ OF EACH CONVERSATION IN EACH PROJECT, AND THE LOSS GUARD
 * DECLARES WHAT IT REMOVES.
 *
 * Wave 13s round 64: the older rows of `conversation_reads` are folded away by a
 * migration. The key is (project, reader kind, reader id, conversation): `workspace_id`,
 * `reader_kind`, `reader_id`
 * and `pair`. tests/a-reader-keeps-one-read-point-per-conversation.test.ts says why the project is in it, and tests
 * what a read writes from now on. This file tests the migration.
 *
 * THE ROW KEPT IS THE ONE EVERY READER ALREADY SHOWED: the latest `at`, and on a tie the highest rowid, which is the
 * order `theReadsNewestFirst` in src/server/lib/messages.ts reads in. An id is a random nanoid, so the highest id
 * would keep one of two reads from the same second at random. So no read point moves when the migration runs, and
 * the second case asks the product's own reader, before and after, for every key of the fixture.
 *
 * THE MIGRATIONS AFTER 0278 RUN TOO, as on a real start, and they may add columns to this table: 0311 adds
 * `as_side_kind`. A row is compared by the columns the table held before the migrations ran, and a column a later
 * migration adds is tested with that migration. The product's reader asks for every column the schema declares, so
 * the read before the migrations adds the missing ones in a transaction it rolls back.
 *
 * THE LOSS GUARD in src/server/db/migrate.ts refuses a migration that leaves a counted table smaller, and
 * `conversation_reads` is counted. This removal is declared there: before anything runs, and only while 0278's unique
 * index is missing, it counts the rows less the keys, and afterwards the table must hold exactly that many fewer. One
 * row fewer than that is still refused, and the refusal names the table. The forbidden-statement rule in
 * tests/migration.test.ts lets 0278 delete from this one table through its list of folds.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { getTableColumns } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { migrateInPlace, olderReadsTheFoldRemoves } from '../src/server/db/migrate.ts'
import { conversationReads } from '../src/server/db/schema.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { MIGRATIONS, journal, partialMigrations, scratch, type Scratch } from './migration-fixtures.ts'

/** Found by its name, not its number, so a renumber is only the file name and the journal line. */
const TAG = journal(MIGRATIONS).find((entry) => entry.tag.endsWith('_a_reader_keeps_only_the_newest_read'))?.tag
const INDEX = journal(MIGRATIONS).findIndex((entry) => entry.tag === TAG)

const PROJECT = 'panelx'
const SECOND_PROJECT = 'a-second-project'
const PAIR = 'agent-a~agent-b'
const SECOND_PAIR = 'agent-a~agent-c'
const GROUP = 'aGroupOf12Ch'

/** One read as the fixture writes it. The order of a list of these is the order they are written, so their rowids. */
interface Read {
  id: string
  project: string
  readerKind: 'person' | 'agent'
  readerId: string
  pair: string
  asSide: string
  at: string
}

const read = (id: string, project: string, readerKind: 'person' | 'agent', readerId: string, pair: string, asSide: string, at: string): Read => ({
  id,
  project,
  readerKind,
  readerId,
  pair,
  asSide,
  at,
})

/**
 * TEN READS OF SIX KEYS, four of them older than another read of their key.
 *
 * The two reads of the second key share one second. Their ids are chosen so that the HIGHER id is the one written
 * FIRST, so keeping the highest id would keep the other row than the one every reader shows.
 */
const WITH_OLDER_READS: readonly Read[] = [
  read('k1-first', PROJECT, 'person', 'a-reader', PAIR, 'agent-a', '2026-10-19 10:00:00'),
  read('k1-newest', PROJECT, 'person', 'a-reader', PAIR, 'agent-b', '2026-10-19 10:05:00'),
  read('k1-written-last-but-older', PROJECT, 'person', 'a-reader', PAIR, 'agent-a', '2026-10-19 10:03:00'),
  read('k2-z-written-first', PROJECT, 'person', 'a-reader', SECOND_PAIR, 'agent-a', '2026-10-19 10:00:00'),
  read('k2-a-written-last', PROJECT, 'person', 'a-reader', SECOND_PAIR, 'agent-c', '2026-10-19 10:00:00'),
  read('k3-only', SECOND_PROJECT, 'person', 'a-reader', PAIR, 'agent-b', '2026-10-19 09:00:00'),
  read('k4-newest', PROJECT, 'person', 'a-second-reader', PAIR, 'agent-a', '2026-10-19 11:00:00'),
  read('k4-older', PROJECT, 'person', 'a-second-reader', PAIR, 'agent-b', '2026-10-19 10:00:00'),
  read('k5-only', PROJECT, 'agent', 'a-reader', PAIR, 'agent-a', '2026-10-19 08:00:00'),
  read('k6-only', PROJECT, 'person', 'a-reader', GROUP, 'agent-x', '2026-10-19 07:00:00'),
]
/** The newest read of each key, which is what the migration keeps. */
const KEPT = ['k1-newest', 'k2-a-written-last', 'k3-only', 'k4-newest', 'k5-only', 'k6-only']

/** One read of each key, so nothing is older than anything else of its key. */
const ONE_READ_EACH: readonly Read[] = WITH_OLDER_READS.filter((one) => KEPT.includes(one.id))

/** Every key of the fixture, as the product's reader is asked for it. */
const KEYS: { reader: ParticipantRef; pair: string; project: string }[] = [
  { reader: { kind: 'person', id: 'a-reader' }, pair: PAIR, project: PROJECT },
  { reader: { kind: 'person', id: 'a-reader' }, pair: SECOND_PAIR, project: PROJECT },
  { reader: { kind: 'person', id: 'a-reader' }, pair: PAIR, project: SECOND_PROJECT },
  { reader: { kind: 'person', id: 'a-second-reader' }, pair: PAIR, project: PROJECT },
  { reader: { kind: 'agent', id: 'a-reader' }, pair: PAIR, project: PROJECT },
  { reader: { kind: 'person', id: 'a-reader' }, pair: GROUP, project: PROJECT },
]

/** Every row of the table with its rowid, in the order they were written: every column, or only the ones named. */
function storedReads(db: Database.Database, columns?: readonly string[]): Record<string, unknown>[] {
  const which = columns === undefined ? '*' : columns.map((one) => `"${one}"`).join(', ')
  return db.prepare(`SELECT rowid, ${which} FROM conversation_reads ORDER BY rowid`).all() as Record<string, unknown>[]
}

/** The columns the table holds now. */
function theColumnsHeld(db: Database.Database): string[] {
  return (db.prepare('PRAGMA table_info(conversation_reads)').all() as { name: string }[]).map((one) => one.name)
}

/** A database migrated up to the migration before 0278, holding these reads. */
function aDatabaseBefore0278(name: string, reads: readonly Read[]): Scratch {
  if (TAG === undefined || INDEX <= 0) throw new Error('drizzle/meta/_journal.json has no migration tagged *_a_reader_keeps_only_the_newest_read')
  const s = scratch(name)
  migrateInPlace(s.db, partialMigrations(INDEX))
  // The migrations make the first project themselves; ON CONFLICT leaves it, and a missing column still fails.
  const project = s.db.prepare(
    "INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, '2026-10-01 09:00:00', '2026-10-01 09:00:00') ON CONFLICT (id) DO NOTHING",
  )
  project.run(PROJECT, 'Mole Office')
  project.run(SECOND_PROJECT, 'A second project')
  const insert = s.db.prepare(
    'INSERT INTO conversation_reads (id, workspace_id, reader_kind, reader_id, pair, as_side, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  for (const one of reads) insert.run(one.id, one.project, one.readerKind, one.readerId, one.pair, one.asSide, one.at)
  return s
}

/**
 * A copy of the migrations folder in which 0278 removes one row more than the fold: the newest read of the first key.
 * The copy is written, and drizzle/ is not touched.
 */
function aFolderWhere0278RemovesOneRowMore(): string {
  const folder = partialMigrations(INDEX + 1)
  const file = join(folder, `${String(TAG)}.sql`)
  const more = "\n--> statement-breakpoint\nDELETE FROM `conversation_reads` WHERE `id` = 'k1-newest';\n"
  writeFileSync(file, readFileSync(file, 'utf8') + more)
  return folder
}

/** The product's reader, opened on this database: `whenTheyLastRead` as a page asks it. */
async function theReaderOn(s: Scratch): Promise<{ readAll: () => unknown[]; readBefore: () => unknown[]; close: () => void }> {
  vi.resetModules()
  process.env.MOLE_OFFICE_DB = s.file
  const client = await import('../src/server/db/client.ts')
  const pool = await import('../src/server/lib/messages.ts')
  const readAll = () => KEYS.map((key) => pool.whenTheyLastRead(key.reader, key.pair, pool.justThisProject(key.project)))
  return {
    readAll,
    // Each column the schema declares and the table does not hold yet is added, empty, for the read, and the
    // transaction is rolled back, so the migrations meet the table as the fixture wrote it.
    readBefore: () => {
      const held = theColumnsHeld(client.sqlite)
      client.sqlite.exec('BEGIN')
      try {
        for (const column of Object.values(getTableColumns(conversationReads))) {
          if (!held.includes(column.name)) client.sqlite.exec(`ALTER TABLE conversation_reads ADD COLUMN "${column.name}" ${column.getSQLType()}`)
        }
        return readAll()
      } finally {
        client.sqlite.exec('ROLLBACK')
      }
    },
    close: () => client.sqlite.close(),
  }
}

const opened: { close: () => void }[] = []
const THE_DATABASE_BEFORE = process.env.MOLE_OFFICE_DB
afterEach(() => {
  for (const one of opened.splice(0)) one.close()
  if (THE_DATABASE_BEFORE === undefined) delete process.env.MOLE_OFFICE_DB
  else process.env.MOLE_OFFICE_DB = THE_DATABASE_BEFORE
})

// These tests cite a decision.
describe('migration 0278 on a database holding older reads', () => {
  it('keeps exactly the newest read of each project, reader and conversation, field for field', () => {
    const s = aDatabaseBefore0278('0278-fold', WITH_OLDER_READS)
    const columns = theColumnsHeld(s.db)
    const before = storedReads(s.db)
    expect(before, 'the fixture wrote nothing, so this proves nothing').toHaveLength(10)

    migrateInPlace(s.db, MIGRATIONS)

    expect(storedReads(s.db, columns)).toEqual(before.filter((row) => KEPT.includes(String(row['id']))))
  })

  it('leaves every page reading the read it showed before, the tie in one second included', async () => {
    const s = aDatabaseBefore0278('0278-no-read-point-moves', WITH_OLDER_READS)
    const reader = await theReaderOn(s)
    opened.push(reader)
    const before = reader.readBefore()
    expect(theColumnsHeld(s.db), 'the read before the migrations left a column behind').not.toContain(conversationReads.asSideKind.name)
    expect(before.map((one) => (one as { asSide: string } | null)?.asSide), 'the reader found nothing, so this proves nothing').toEqual([
      'agent-b',
      'agent-c',
      'agent-b',
      'agent-a',
      'agent-a',
      'agent-x',
    ])

    migrateInPlace(s.db, MIGRATIONS)

    expect(reader.readAll()).toEqual(before)
  })

  it('is the removal the loss guard declares: the rows less the keys, counted before anything ran', () => {
    const s = aDatabaseBefore0278('0278-declared', WITH_OLDER_READS)
    expect(olderReadsTheFoldRemoves(s.db)).toBe(10 - 6)

    const outcome = migrateInPlace(s.db, MIGRATIONS)

    expect(outcome.before['conversation_reads']).toBe(10)
    expect(outcome.after['conversation_reads']).toBe(6)
    expect(olderReadsTheFoldRemoves(s.db), 'the index is there now, so nothing is left to fold').toBe(0)
  })

  it('is refused, and the refusal names the table, when it removes one row more than the fold', () => {
    const s = aDatabaseBefore0278('0278-one-more', WITH_OLDER_READS)

    expect(() => migrateInPlace(s.db, aFolderWhere0278RemovesOneRowMore())).toThrow(
      /LOST ROWS: conversation_reads went from 10 rows to 5: 4 older reads/,
    )
  })
})

describe('migration 0278 on a database with no older reads', () => {
  it('counts nothing and removes nothing', () => {
    const s = aDatabaseBefore0278('0278-nothing-to-fold', ONE_READ_EACH)
    const columns = theColumnsHeld(s.db)
    const before = storedReads(s.db)
    expect(olderReadsTheFoldRemoves(s.db)).toBe(0)

    migrateInPlace(s.db, MIGRATIONS)

    expect(storedReads(s.db, columns)).toEqual(before)
  })

  it('leaves the guard exact as before: one row removed is refused, and the refusal names the table', () => {
    const s = aDatabaseBefore0278('0278-nothing-to-fold-one-more', ONE_READ_EACH)

    expect(() => migrateInPlace(s.db, aFolderWhere0278RemovesOneRowMore())).toThrow(
      /LOST ROWS: conversation_reads went from 6 rows to 5: 0 older reads/,
    )
  })
})

describe('migration 0278 run a second time', () => {
  it('counts nothing and removes nothing once its index is there', () => {
    const s = aDatabaseBefore0278('0278-again', WITH_OLDER_READS)
    migrateInPlace(s.db, MIGRATIONS)
    const after = storedReads(s.db)

    expect(olderReadsTheFoldRemoves(s.db)).toBe(0)
    expect(migrateInPlace(s.db, MIGRATIONS).newlyApplied).toBe(0)
    expect(storedReads(s.db)).toEqual(after)

    // AND ITS OWN STATEMENTS, RUN AGAIN BY HAND, delete nothing: what is left is one row per key.
    const statements = readFileSync(join(MIGRATIONS, `${String(TAG)}.sql`), 'utf8')
      .split('--> statement-breakpoint')
      .filter((statement) => statement.replace(/--[^\n]*/g, '').trim() !== '')
    const changed = statements.map((statement) => s.db.prepare(statement).run().changes)
    expect(changed.reduce((sum, n) => sum + n, 0)).toBe(0)
    expect(storedReads(s.db)).toEqual(after)
  })

  it('adds the unique index over the project, the reader kind, the reader id and the conversation', () => {
    const s = aDatabaseBefore0278('0278-index', ONE_READ_EACH)
    migrateInPlace(s.db, MIGRATIONS)

    const index = (s.db.prepare("SELECT name, \"unique\" FROM pragma_index_list('conversation_reads')").all() as { name: string; unique: number }[]).find(
      (one) => one.name === 'conversation_reads_one_per_reader_idx',
    )
    expect(index?.unique).toBe(1)
    const columns = (s.db.prepare("SELECT name FROM pragma_index_info('conversation_reads_one_per_reader_idx') ORDER BY seqno").all() as { name: string }[]).map(
      (one) => one.name,
    )
    expect(columns).toEqual(['workspace_id', 'reader_kind', 'reader_id', 'pair'])
  })
})
