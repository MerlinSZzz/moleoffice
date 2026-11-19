// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE `task.blocked_by` MOVE: what it moves, and the link it will not make.
 *
 * ---------------------------------------------------------------------------------------
 * THE TEMPTATION THIS FILE EXISTS TO PIN
 * ---------------------------------------------------------------------------------------
 *
 * In the live corpus every single one of the eight values this migration moved is, letter for
 * letter, the title of another record. That is not a coincidence — a field called `blocked_by` whose
 * published description was "the TITLE of the record blocking it" was always going to be filled with
 * titles — and it makes the wrong thing to do very easy and very plausible: resolve the title, write
 * a `blocks` link, delete the prose, report eight dependencies recovered.
 *
 * It is forbidden. A `blocks` link is read by the gate rule, the attention rule,
 * `unmetDependencies`, the record page and the graph, and nobody wrote one. A string that matches a
 * title is evidence about the string. The author may have meant a different record with a similar
 * name, or been describing the thing rather than pointing at it, or the record may have been created
 * afterwards. So the text moves into the prose field, and the exact match is REPORTED with the
 * `POST /api/links` somebody could run, for a person to decide.
 *
 * Most of this file is that one claim, checked from several directions, plus the claims that make
 * the move non-destructive: nothing is overwritten, both original strings survive on their own in
 * the change log, and an obligation — which still declares the field — is not touched at all.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { migrateInPlace } from '../src/server/db/migrate.ts'
import { JOIN_SEPARATOR, migrateBlockedBy, planBlockedByMigration } from '../src/server/db/blocked-by-migration.ts'
import { KIND_SPECS } from '../src/shared/kinds.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const MIGRATIONS = join(fileURLToPath(new URL('..', import.meta.url)), 'drizzle')

const open: { dir: string; db: Database.Database }[] = []

function fresh(name: string): Database.Database {
  const dir = aTestDatabaseFolder(`blockedby-${name}`)
  const db = new Database(join(dir, 'panelx.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  open.push({ dir, db })
  migrateInPlace(db, MIGRATIONS)
  return db
}

afterEach(() => {
  for (const o of open.splice(0)) {
    if (o.db.open) o.db.close()
    rmSync(o.dir, { recursive: true, force: true })
  }
})

interface RowSpec {
  id: string
  kind: string
  title: string
  data: Record<string, unknown> | string
  deletedAt?: string
}

function write(db: Database.Database, rows: RowSpec[]): void {
  const insert = db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at) ' +
      `VALUES (@id, 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-01 09:00:00', '2026-07-02 11:00:00', @kind, @title, NULL, @data, @deleted_at)`,
  )
  for (const r of rows) {
    insert.run({
      id: r.id,
      kind: r.kind,
      title: r.title,
      data: typeof r.data === 'string' ? r.data : JSON.stringify(r.data),
      deleted_at: r.deletedAt ?? null,
    })
  }
}

function dataOf(db: Database.Database, id: string): Record<string, unknown> {
  const row = db.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string } | undefined
  if (row === undefined) throw new Error(`no record ${id}`)
  return JSON.parse(row.data) as Record<string, unknown>
}

function changesFor(db: Database.Database, id: string): { field: string | null; old_value: string | null; new_value: string | null }[] {
  return db
    .prepare('SELECT field, old_value, new_value FROM changes WHERE record_id = ? ORDER BY field')
    .all(id) as { field: string | null; old_value: string | null; new_value: string | null }[]
}

// ============================================================================ the vocabulary it is about

describe('the two kinds this migration tells apart', () => {
  it('reads the fields from kinds.ts rather than believing this file: task has no blocked_by, obligation does', () => {
    // If either of these ever stops being true, this whole migration is about the wrong thing, and
    // that has to be a failing test rather than a migration that quietly moves the wrong field.
    const taskKeys = KIND_SPECS.task.fields.map((f) => f.key)
    const obligationKeys = KIND_SPECS.obligation.fields.map((f) => f.key)
    expect(taskKeys, 'a task declares blocked_by again, so there is nothing to move').not.toContain('blocked_by')
    expect(taskKeys, 'a task has no also_waiting_on to move prose into').toContain('also_waiting_on')
    expect(obligationKeys, 'an obligation lost blocked_by, so this migration must stop skipping it').toContain(
      'blocked_by',
    )
  })
})

// ============================================================================ where its rows are filed

describe('the change rows this migration writes', () => {
  it('files each one under the project of the record it is about, at the moment it is written', () => {
    // RUN ON ITS OWN, WHICH IS THE POINT. `npm run db:migrate` runs `migrateWorkspaces` a few
    // statements after this one, and that pass stamps every change row still holding NULL. So for a
    // long time these rows were written blank and corrected later, and the ordinary command never
    // noticed. A caller running this migration by itself — this test, a repair script, a future
    // command that runs the data migrations in a different order — left rows the daily page filters
    // out, because it selects by project and NULL is not a project.
    const db = fresh('project')
    db.prepare("INSERT INTO workspaces (id, title, created_at, updated_at) VALUES ('robotics', 'Robotics', ?, ?)").run(
      '2026-07-01 09:00:00',
      '2026-07-01 09:00:00',
    )
    write(db, [{ id: 't1', kind: 'task', title: 'reprint the shell', data: { state: 'blocked', blocked_by: 'the printer queue' } }])
    db.prepare("UPDATE records SET workspace_id = 'robotics' WHERE id = 't1'").run()

    migrateBlockedBy(db)

    const rows = db.prepare('SELECT workspace_id FROM changes WHERE record_id = ?').all('t1') as {
      workspace_id: string | null
    }[]
    expect(rows.length, 'the migration wrote no change rows, so this test proves nothing').toBeGreaterThan(0)
    // NOT 'default', AND NOT NULL. A constant would pass a test written in the default project, so
    // the record is moved somewhere else first and the rows have to follow it there.
    for (const row of rows) {
      expect(row.workspace_id, 'a change row was filed under a project the record it is about is not in').toBe('robotics')
    }
  })
})

// ============================================================================ what it moves

describe('a task holding blocked_by', () => {
  it('moves the prose into an also_waiting_on that was empty', () => {
    const db = fresh('moves')
    write(db, [{ id: 't1', kind: 'task', title: 'reprint the shell', data: { state: 'blocked', blocked_by: 'the printer queue' } }])
    const report = migrateBlockedBy(db)
    expect(dataOf(db, 't1')).toEqual({ state: 'blocked', also_waiting_on: 'the printer queue' })
    expect(report.moved).toBe(1)
    expect(report.joined).toBe(0)
  })

  it('joins onto an also_waiting_on that already said something, keeping what was there first', () => {
    const db = fresh('joins')
    write(db, [
      {
        id: 't1',
        kind: 'task',
        title: 'reprint the shell',
        data: { state: 'blocked', blocked_by: 'the printer queue', also_waiting_on: 'PETG to arrive' },
      },
    ])
    const report = migrateBlockedBy(db)
    expect(dataOf(db, 't1')['also_waiting_on']).toBe(`PETG to arrive${JOIN_SEPARATOR}the printer queue`)
    expect(report.joined).toBe(1)
    expect(report.moved).toBe(0)
  })

  it('adds no words of its own to what somebody wrote', () => {
    // A joined field must read as two statements, not as a sentence a migration composed. Anything
    // beyond punctuation would be words a reader takes for the author's.
    const db = fresh('nowords')
    write(db, [
      { id: 't1', kind: 'task', title: 't', data: { blocked_by: 'BBB', also_waiting_on: 'AAA' } },
    ])
    migrateBlockedBy(db)
    expect(dataOf(db, 't1')['also_waiting_on']).toBe(`AAA${JOIN_SEPARATOR}BBB`)
    expect(JOIN_SEPARATOR.trim()).toBe(';')
  })

  it('keeps every other key of data exactly as it was', () => {
    const db = fresh('otherkeys')
    write(db, [
      {
        id: 't1',
        kind: 'task',
        title: 't',
        data: {
          state: 'blocked',
          command: 'make reprint',
          blocked_by: 'the queue',
          consequence: { bearer: 'person', what: 'somebody is standing next to it' },
          source: { file: 'notes.md' },
        },
      },
    ])
    migrateBlockedBy(db)
    const after = dataOf(db, 't1')
    expect(after['state']).toBe('blocked')
    expect(after['command']).toBe('make reprint')
    expect(after['consequence']).toEqual({ bearer: 'person', what: 'somebody is standing next to it' })
    expect(after['source']).toEqual({ file: 'notes.md' })
    expect('blocked_by' in after).toBe(false)
  })

  it('is migrated even when it is soft-deleted, because a restored record must not carry a dead key', () => {
    const db = fresh('deleted')
    write(db, [
      { id: 't1', kind: 'task', title: 't', data: { blocked_by: 'the queue' }, deletedAt: '2026-08-01 10:00:00' },
    ])
    migrateBlockedBy(db)
    expect(dataOf(db, 't1')).toEqual({ also_waiting_on: 'the queue' })
  })

  it('does not move its updated_at, because a migration is not the work moving', () => {
    // `records.updated_at` orders the Records page and is read as "somebody edited this". The block
    // migration once stamped every block with its own clock and zeroed the age the attention rule
    // ranks on; this is the same mistake at a smaller scale and it is not made here.
    const db = fresh('stamps')
    write(db, [{ id: 't1', kind: 'task', title: 't', data: { blocked_by: 'the queue' } }])
    migrateBlockedBy(db)
    const row = db.prepare('SELECT created_at, updated_at FROM records WHERE id = ?').get('t1') as {
      created_at: string
      updated_at: string
    }
    expect(row.updated_at).toBe('2026-07-02 11:00:00')
    expect(row.created_at).toBe('2026-07-01 09:00:00')
  })
})

// ============================================================================ the link it will not make

describe('a value that is exactly another record title', () => {
  it('makes no link, of any type, from anything to anything', () => {
    const db = fresh('nolink')
    write(db, [
      { id: 'p1', kind: 'problem', title: 'the printer queue is three jobs deep', data: {} },
      {
        id: 't1',
        kind: 'task',
        title: 'reprint the shell',
        data: { blocked_by: 'the printer queue is three jobs deep' },
      },
    ])
    migrateBlockedBy(db)
    expect(db.prepare('SELECT count(*) AS n FROM links').get()).toEqual({ n: 0 })
  })

  it('leaves the text in also_waiting_on exactly as written, rather than resolving it away', () => {
    const db = fresh('keepstext')
    write(db, [
      { id: 'p1', kind: 'problem', title: 'the printer queue is three jobs deep', data: {} },
      { id: 't1', kind: 'task', title: 'reprint', data: { blocked_by: 'the printer queue is three jobs deep' } },
    ])
    migrateBlockedBy(db)
    expect(dataOf(db, 't1')['also_waiting_on']).toBe('the printer queue is three jobs deep')
  })

  it('reports it by name, with both ends and the request somebody could make', () => {
    const db = fresh('reports')
    write(db, [
      { id: 'p1', kind: 'problem', title: 'the printer queue is three jobs deep', data: {} },
      { id: 't1', kind: 'task', title: 'reprint', data: { blocked_by: 'the printer queue is three jobs deep' } },
    ])
    const report = migrateBlockedBy(db)
    expect(report.namesARecord).toBe(1)
    const note = report.notes.find((n) => n.kind === 'names_a_record')
    expect(note?.detail).toContain('NO LINK WAS MADE')
    expect(note?.detail).toContain('"fromId":"p1"')
    expect(note?.detail).toContain('"toId":"t1"')
  })

  it('says nothing about a value that resembles no record, because there is nothing to report', () => {
    const db = fresh('nomatch')
    write(db, [{ id: 't1', kind: 'task', title: 'reprint', data: { blocked_by: 'the printer being busy' } }])
    const report = migrateBlockedBy(db)
    expect(report.namesARecord).toBe(0)
    expect(report.notes.map((n) => n.kind)).toEqual(['moved'])
  })
})

// ============================================================================ what it will not touch

describe('an obligation holding blocked_by', () => {
  it('is left exactly as it is, because that kind still declares the field', () => {
    const db = fresh('obligation')
    write(db, [
      { id: 'o1', kind: 'obligation', title: 'the ESA report', data: { state: 'open', blocked_by: 'the force table' } },
    ])
    const report = migrateBlockedBy(db)
    expect(dataOf(db, 'o1')).toEqual({ state: 'open', blocked_by: 'the force table' })
    expect(report.alreadyDone).toBe(true)
    expect(report.notes).toEqual([])
  })

  it('is not touched even when a task beside it is being migrated', () => {
    const db = fresh('both')
    write(db, [
      { id: 'o1', kind: 'obligation', title: 'the ESA report', data: { blocked_by: 'the force table' } },
      { id: 't1', kind: 'task', title: 'reprint', data: { blocked_by: 'the queue' } },
    ])
    migrateBlockedBy(db)
    expect(dataOf(db, 'o1')).toEqual({ blocked_by: 'the force table' })
    expect(dataOf(db, 't1')).toEqual({ also_waiting_on: 'the queue' })
  })
})

describe('a blocked_by with no prose in it', () => {
  it.each([
    ['an array', ['a', 'b']],
    ['a number', 12],
    ['null', null],
    ['an empty string', '   '],
  ])('leaves %s exactly where it is and reports it', (_name, value) => {
    const db = fresh(`notprose-${String(_name).replace(/\W/g, '')}`)
    write(db, [{ id: 't1', kind: 'task', title: 'reprint', data: { state: 'blocked', blocked_by: value } }])
    const report = migrateBlockedBy(db)
    expect(dataOf(db, 't1')).toEqual({ state: 'blocked', blocked_by: value })
    expect(report.leftInPlace).toBe(1)
    expect(report.notes.map((n) => n.kind)).toEqual(['not_prose'])
    expect(report.notes[0]?.detail).toContain('also_waiting_on')
  })

  it('does not write an empty also_waiting_on that says nothing', () => {
    const db = fresh('noempty')
    write(db, [{ id: 't1', kind: 'task', title: 'reprint', data: { blocked_by: '' } }])
    migrateBlockedBy(db)
    expect('also_waiting_on' in dataOf(db, 't1')).toBe(false)
  })
})

describe('a task whose data column will not parse', () => {
  it('is reported rather than silently skipped', () => {
    const db = fresh('unreadable')
    write(db, [{ id: 't1', kind: 'task', title: 'reprint', data: 'not json at all' }])
    const report = migrateBlockedBy(db)
    expect(report.notes.map((n) => n.kind)).toEqual(['unreadable_data'])
    expect(report.leftInPlace).toBe(1)
  })
})

// ============================================================================ the change log

describe('what the change log keeps', () => {
  it('files both original strings separately, so neither half of a join is ever lost', () => {
    const db = fresh('changelog')
    write(db, [
      { id: 't1', kind: 'task', title: 'reprint', data: { blocked_by: 'the queue', also_waiting_on: 'PETG' } },
    ])
    migrateBlockedBy(db)
    const rows = changesFor(db, 't1')
    expect(rows).toEqual([
      { field: 'data.also_waiting_on', old_value: 'PETG', new_value: `PETG${JOIN_SEPARATOR}the queue` },
      { field: 'data.blocked_by', old_value: 'the queue', new_value: null },
    ])
  })

  it('attributes the rows to the migration rather than to a person', () => {
    const db = fresh('actor')
    write(db, [{ id: 't1', kind: 'task', title: 'reprint', data: { blocked_by: 'the queue' } }])
    migrateBlockedBy(db)
    const row = db.prepare('SELECT actor_type, actor_id FROM changes WHERE record_id = ?').get('t1')
    expect(row).toEqual({ actor_type: 'system', actor_id: 'blocked-by-migration' })
  })

  it('writes nothing at all for a record it did not move', () => {
    const db = fresh('nolog')
    write(db, [{ id: 'o1', kind: 'obligation', title: 'owed', data: { blocked_by: 'the force table' } }])
    migrateBlockedBy(db)
    expect(db.prepare('SELECT count(*) AS n FROM changes').get()).toEqual({ n: 0 })
  })
})

// ============================================================================ running it twice

describe('running it twice', () => {
  it('moves nothing the second time and writes no second pair of change rows', () => {
    const db = fresh('twice')
    write(db, [
      { id: 't1', kind: 'task', title: 'reprint', data: { blocked_by: 'the queue', also_waiting_on: 'PETG' } },
    ])
    const first = migrateBlockedBy(db)
    const after = dataOf(db, 't1')
    const changes = changesFor(db, 't1')
    const second = migrateBlockedBy(db)
    expect(first.alreadyDone).toBe(false)
    expect(second.alreadyDone).toBe(true)
    expect(second.notes).toEqual([])
    expect(dataOf(db, 't1')).toEqual(after)
    expect(changesFor(db, 't1')).toEqual(changes)
  })

  it('plans without writing when asked to, so an operator can look first', () => {
    const db = fresh('dryrun')
    write(db, [{ id: 't1', kind: 'task', title: 'reprint', data: { blocked_by: 'the queue' } }])
    const report = migrateBlockedBy(db, { dryRun: true })
    expect(report.moved).toBe(1)
    expect(dataOf(db, 't1')).toEqual({ blocked_by: 'the queue' })
    expect(planBlockedByMigration(db).moves.length).toBe(1)
  })
})
