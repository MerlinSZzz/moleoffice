// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER COMES FROM THE INSTALLER, NOT FROM THE CODE.
 *
 * It follows a decision, and items FLO-14, FLO-16 and FLO-17 of another.
 * Who owns an office is a setting in its own database (people.office_owner, the owner migration `the_owner_comes_from_the_installer`), written
 * at the first migrate from MOLE_OFFICE_OWNER_ID and MOLE_OFFICE_OWNER_NAME. This file proves:
 *
 *   1. a fresh office with neither setting gets the id `owner` and no name, and writes no owner's name;
 *   2. the two settings give the office its owner's id and name, which is how the owner's own office keeps their identity;
 *   3. an office that already holds work, with no owner written and neither setting, refuses to
 *      migrate with a sentence naming both settings, and nothing in it changes;
 *   4. such an office with both settings is marked, and nothing else in it moves;
 *   5. the owner migration `the_owner_comes_from_the_installer` takes the three column defaults that named the owner away and puts every row of the tables
 *      it rebuilds back unchanged, rowid and all;
 *   6. GET /api/office/owner answers anyone, and POST /api/office/owner lets only the person name
 *      themselves, once, and refuses an agent in the supervisor's own sentence.
 *
 * EVERY TEST HERE SAYS WHICH SETTINGS IT MEANS. tests/every-test-process-is-given-the-test-offices-owner.ts gives every
 * test process the test office's owner; a case that means a fresh office sets both to empty, which the two
 * settings read as "not set" (their `emptyMeans`), so a .env beside the checkout cannot answer for
 * them either.
 */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, describe, expect, it } from 'vitest'

import { buildTheFirstOfficeInAHook, apiApp, freshDb, type TestDb } from './helpers.ts'
import { ONLY_THE_PERSON_NAMES_THEMSELVES, THE_OWNER_PLACEHOLDER } from '../src/shared/owner.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

const MIGRATIONS = './drizzle'
/** The owner migration by its name, found in the journal, so a renumber is only its file name and journal line. */
const THE_MIGRATION = 'the_owner_comes_from_the_installer'

let t: TestDb | null = null
const saved = { id: process.env.MOLE_OFFICE_OWNER_ID, name: process.env.MOLE_OFFICE_OWNER_NAME }

function theSettingsAre(id: string, name: string): void {
  process.env.MOLE_OFFICE_OWNER_ID = id
  process.env.MOLE_OFFICE_OWNER_NAME = name
}

afterEach(() => {
  t?.close()
  t = null
  process.env.MOLE_OFFICE_OWNER_ID = saved.id
  process.env.MOLE_OFFICE_OWNER_NAME = saved.name
})

/** The default of each column the owner migration rebuilds, as SQLite gives it: quoted text, or null for none. */
function theOwnerDefaults(db: Database.Database): Record<'records.owner_id' | 'links.owner_id' | 'links.created_by', string | null> {
  const defaultOf = (table: string, column: string): string | null =>
    (db.prepare('SELECT dflt_value AS value FROM pragma_table_info(?) WHERE name = ?').get(table, column) as { value: string | null }).value
  return { 'records.owner_id': defaultOf('records', 'owner_id'), 'links.owner_id': defaultOf('links', 'owner_id'), 'links.created_by': defaultOf('links', 'created_by') }
}

function peopleIn(db: Database.Database): { id: string; name: string; office_owner: string | null }[] {
  return db.prepare('SELECT id, name, office_owner FROM people ORDER BY id').all() as { id: string; name: string; office_owner: string | null }[]
}

describe('the first migrate writes the owner from the installer', () => {
  it('a fresh office with neither setting gets the id owner and no name, and writes no other name', async () => {
    theSettingsAre('', '')
    t = await freshDb()
    expect(peopleIn(t.client.sqlite)).toEqual([{ id: 'owner', name: THE_OWNER_PLACEHOLDER.en, office_owner: 'unnamed' }])
    const { theOfficeOwner } = await import('../src/server/lib/owner.ts')
    expect(theOfficeOwner()).toEqual({ id: 'owner', name: null, mark: 'unnamed' })
    const { THE_PERSON } = await import('../src/shared/person.ts')
    expect(THE_PERSON).toBe('owner')
  })

  it("the two settings give the owner its id and its name, as an installer's .env does", async () => {
    theSettingsAre(THE_TEST_OFFICES_OWNER.id, THE_TEST_OFFICES_OWNER.name)
    t = await freshDb()
    expect(peopleIn(t.client.sqlite)).toEqual([{ id: THE_TEST_OFFICES_OWNER.id, name: THE_TEST_OFFICES_OWNER.name, office_owner: 'named-by-the-installer' }])
  })

  it('an office that holds work, with no owner written and neither setting, refuses and changes nothing', async () => {
    theSettingsAre(THE_TEST_OFFICES_OWNER.id, THE_TEST_OFFICES_OWNER.name)
    t = await freshDb()
    // THE STATE THE OWNER'S OFFICE IS IN BEFORE THIS CHANGE: the owner's row, a record under them, and no mark.
    t.api.createRecord({ kind: 'note', title: 'the owner\'s work', workspaceId: 'default', actor: t.api.HUMAN })
    t.client.sqlite.prepare('UPDATE people SET office_owner = NULL').run()
    const before = peopleIn(t.client.sqlite)
    theSettingsAre('', '')
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    expect(() => migrateInPlace(t!.client.sqlite, MIGRATIONS)).toThrow(
      /already holds work and does not say who owns it.*MOLE_OFFICE_OWNER_ID and MOLE_OFFICE_OWNER_NAME are not set/,
    )
    expect(peopleIn(t.client.sqlite)).toEqual(before)
  })

  it('such an office with both settings is marked, and nothing else in it moves', async () => {
    theSettingsAre(THE_TEST_OFFICES_OWNER.id, THE_TEST_OFFICES_OWNER.name)
    t = await freshDb()
    t.api.createRecord({ kind: 'note', title: 'the owner\'s work', workspaceId: 'default', actor: t.api.HUMAN })
    t.client.sqlite.prepare('UPDATE people SET office_owner = NULL').run()
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const outcome = migrateInPlace(t.client.sqlite, MIGRATIONS)
    expect(outcome.participants.ownerMarked).toBe(1)
    expect(peopleIn(t.client.sqlite)).toEqual([{ id: THE_TEST_OFFICES_OWNER.id, name: THE_TEST_OFFICES_OWNER.name, office_owner: 'named-by-the-installer' }])
  })

  it('a different id later, or a name that is not the owner\'s, stops with a sentence', async () => {
    theSettingsAre(THE_TEST_OFFICES_OWNER.id, THE_TEST_OFFICES_OWNER.name)
    t = await freshDb()
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    theSettingsAre('alice', 'Alice')
    expect(() => migrateInPlace(t!.client.sqlite, MIGRATIONS)).toThrow(new RegExp(`MOLE_OFFICE_OWNER_ID is "alice", and this office's owner is "${THE_TEST_OFFICES_OWNER.id}"`))
    t.api.createRecord({ kind: 'note', title: 'the owner\'s work', workspaceId: 'default', actor: t.api.HUMAN })
    t.client.sqlite.prepare('UPDATE people SET office_owner = NULL').run()
    theSettingsAre(THE_TEST_OFFICES_OWNER.id, 'Somebody Else')
    expect(() => migrateInPlace(t!.client.sqlite, MIGRATIONS)).toThrow(new RegExp(`is already called "${THE_TEST_OFFICES_OWNER.name}"`))
  })
})

describe('the owner migration `the_owner_comes_from_the_installer`', () => {
  /** A folder holding every migration before it, with the journal cut to match. */
  function theMigrationsBefore(dir: string): string {
    const folder = join(dir, 'drizzle-before')
    mkdirSync(join(folder, 'meta'), { recursive: true })
    const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
    const at = journal.entries.findIndex((one) => one.tag.endsWith(THE_MIGRATION))
    expect(at, 'the owner migration `the_owner_comes_from_the_installer` is in the journal').toBeGreaterThan(0)
    const kept = journal.entries.slice(0, at)
    writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: kept }))
    for (const one of kept) cpSync(join(MIGRATIONS, `${one.tag}.sql`), join(folder, `${one.tag}.sql`))
    return folder
  }

  it('takes the three defaults that named the owner away and puts every row back unchanged, rowid and all', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-office-test-owner-migration-'))
    try {
      const db = new Database(join(dir, 'office.db'))
      db.pragma('foreign_keys = ON')
      migrate(drizzle(db), { migrationsFolder: theMigrationsBefore(dir) })
      // The old default is read from the database the earlier migrations built, so this case names nobody. It is one
      // quoted id, the same in all three columns.
      const theOldDefault = theOwnerDefaults(db)['records.owner_id'] ?? ''
      expect(theOldDefault, 'the earlier migrations give records.owner_id a quoted default').toMatch(/^'[^']+'$/)
      expect(theOwnerDefaults(db)).toEqual({ 'records.owner_id': theOldDefault, 'links.owner_id': theOldDefault, 'links.created_by': theOldDefault })
      // Rows the old defaults filled, with rowids that are not 1, 2, 3, and a child row in each table
      // that points at records.
      const now = '2026-09-30 12:00:00'
      db.prepare("INSERT INTO records (rowid, id, kind, title, created_at, updated_at) VALUES (40, 'r1', 'note', 'one', ?, ?)").run(now, now)
      db.prepare("INSERT INTO records (rowid, id, kind, title, created_at, updated_at, owner_id) VALUES (7, 'r2', 'message', 'two', ?, ?, 'x')").run(now, now)
      db.prepare("INSERT INTO links (rowid, id, from_id, to_id, type, created_at, updated_at) VALUES (9, 'l1', 'r1', 'r2', 'relates', ?, ?)").run(now, now)
      db.prepare("INSERT INTO message_delivery (rowid, id, message_id, recipient_kind, recipient_id, mark, at) VALUES (5, 'd1', 'r2', 'person', 'x', 'queued', ?)").run(now)
      const read = (table: string): unknown[] => db.prepare(`SELECT rowid AS rowid_, * FROM ${table} ORDER BY rowid`).all()
      const before = { records: read('records'), links: read('links'), message_delivery: read('message_delivery') }
      expect(JSON.stringify(before)).toContain(`"owner_id":${JSON.stringify(theOldDefault.slice(1, -1))}`)

      migrate(drizzle(db), { migrationsFolder: MIGRATIONS })

      // THE ROWS ARE COMPARED ON THE COLUMNS THEY HAD BEFORE THIS MIGRATION. The second migrate runs every later
      // migration too, and a later one may add a column (0200 adds `message_delivery.offer_put_off_at`, NULL on
      // every row). A column that did not exist before is not a change to a row that this migration made.
      const asBefore = (table: 'records' | 'links' | 'message_delivery'): unknown[] =>
        read(table).map((row, at) => {
          const was = before[table][at] as Record<string, unknown> | undefined
          const now = row as Record<string, unknown>
          return was === undefined ? now : Object.fromEntries(Object.keys(was).map((key) => [key, now[key]]))
        })
      expect({ records: asBefore('records'), links: asBefore('links'), message_delivery: asBefore('message_delivery') }).toEqual(before)
      expect(theOwnerDefaults(db)).toEqual({ 'records.owner_id': null, 'links.owner_id': null, 'links.created_by': null })
      const tables = db.prepare('SELECT name FROM sqlite_master WHERE instr(sql, ?) > 0').all(`DEFAULT ${theOldDefault}`)
      expect(tables).toEqual([])
      const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'records' ORDER BY name").all()
      // The three triggers that keep the index of the records' text (wave 13y round 64) are on records too.
      expect(triggers).toEqual([
        { name: 'record_text_on_delete' }, { name: 'record_text_on_insert' }, { name: 'record_text_on_update' },
        { name: 'sealed_tip_no_delete' }, { name: 'sealed_tip_no_update' }, { name: 'submission_run_baseline' },
      ])
      expect(db.pragma('foreign_key_check')).toEqual([])
      // A writer that forgets the owner now fails, instead of filing the row under one person.
      expect(() => db.prepare("INSERT INTO records (id, kind, title, created_at, updated_at) VALUES ('r3', 'note', 'x', ?, ?)").run(now, now)).toThrow(
        /NOT NULL constraint failed: records.owner_id/,
      )
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('names no number anywhere but its file name and its journal line', () => {
    const file = readdirSync(MIGRATIONS).find((one) => one.endsWith(`${THE_MIGRATION}.sql`))
    expect(file).toBeDefined()
    const text = readFileSync(join(MIGRATIONS, file!), 'utf8')
    expect(text).not.toContain(file!.slice(0, 4))
  })
})

describe('the two doors', () => {
  const AGENT_HEADERS = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-session': 'sess-test' }
  const OWNER_HEADERS = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': 'owner' }

  async function aFreshOffice() {
    theSettingsAre('', '')
    t = await freshDb()
    return apiApp()
  }

  it('GET answers anyone, with the placeholder in the language asked for, and no name yet', async () => {
    const { app } = await aFreshOffice()
    const reply = await app.inject({ method: 'GET', url: '/api/office/owner?language=zh' })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json()).toMatchObject({ id: 'owner', name: null, named: false, placeholder: THE_OWNER_PLACEHOLDER.zh, guide: '#/welcome' })
    const english = await app.inject({ method: 'GET', url: '/api/office/owner' })
    expect(english.json()).toMatchObject({ placeholder: 'default office owner name' })
    await app.close()
  })

  it('an agent is refused in the one sentence, and nothing is named', async () => {
    const { app } = await aFreshOffice()
    const reply = await app.inject({ method: 'POST', url: '/api/office/owner', headers: AGENT_HEADERS, payload: { name: 'Robot' } })
    expect(reply.statusCode, reply.body).toBe(403)
    expect(reply.json().error).toBe(ONLY_THE_PERSON_NAMES_THEMSELVES)
    const after = await app.inject({ method: 'GET', url: '/api/office/owner' })
    expect(after.json()).toMatchObject({ name: null, named: false })
    await app.close()
  })

  it('the person names themselves once, stored as typed after trimming, with their language', async () => {
    const { app } = await aFreshOffice()
    const tooLong = await app.inject({ method: 'POST', url: '/api/office/owner', headers: OWNER_HEADERS, payload: { name: 'x'.repeat(81) } })
    expect(tooLong.statusCode, tooLong.body).toBe(400)
    const look = await app.inject({ method: 'POST', url: '/api/office/owner', headers: OWNER_HEADERS, payload: { name: 'Ada', look: 'dark' } })
    expect(look.statusCode, look.body).toBe(400)
    const named = await app.inject({ method: 'POST', url: '/api/office/owner', headers: OWNER_HEADERS, payload: { name: '  Ada  Lovelace ', language: 'zh' } })
    expect(named.statusCode, named.body).toBe(200)
    expect(named.json()).toMatchObject({ id: 'owner', name: 'Ada  Lovelace', named: true, placeholder: THE_OWNER_PLACEHOLDER.zh, guide: '#/welcome' })
    expect(peopleIn(t!.client.sqlite)).toEqual([{ id: 'owner', name: 'Ada  Lovelace', office_owner: 'named-by-the-person' }])
    const again = await app.inject({ method: 'POST', url: '/api/office/owner', headers: OWNER_HEADERS, payload: { name: 'Somebody' } })
    expect(again.statusCode, again.body).toBe(409)
    await app.close()
  })

  it("naming the owner tells every page, because the owner's name is on the chat's lists", async () => {
    const { app } = await aFreshOffice()
    const events = await import('../src/server/lib/events.ts')
    const heard: { event: { name: string; lists?: readonly string[]; participant?: unknown } }[] = []
    events.pageOpened({ workspaceId: 'default', who: { kind: 'person', id: 'owner' }, send: (one) => heard.push(one as never) })
    const named = await app.inject({ method: 'POST', url: '/api/office/owner', headers: OWNER_HEADERS, payload: { name: 'Ada' } })
    expect(named.statusCode, named.body).toBe(200)
    const said = heard.map((one) => one.event).find((one) => one.name === 'list.changed')
    expect(said?.lists).toEqual(['participants', 'contacts'])
    expect(said?.participant).toEqual({ kind: 'person', id: 'owner' })
    await app.close()
  })

  it('keeping the placeholder stores the placeholder', async () => {
    const { app } = await aFreshOffice()
    const kept = await app.inject({ method: 'POST', url: '/api/office/owner', headers: OWNER_HEADERS, payload: { name: THE_OWNER_PLACEHOLDER.zh } })
    expect(kept.statusCode, kept.body).toBe(200)
    expect(kept.json()).toMatchObject({ name: THE_OWNER_PLACEHOLDER.zh, named: true })
    await app.close()
  })

  it('a person writing as somebody other than the owner is refused like an agent', async () => {
    const { app } = await aFreshOffice()
    const reply = await app.inject({
      method: 'POST',
      url: '/api/office/owner',
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': 'somebody' },
      payload: { name: 'Somebody' },
    })
    expect(reply.statusCode, reply.body).toBe(403)
    await app.close()
  })
})
