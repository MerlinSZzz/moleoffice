// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON THE OFFICE MAKES FROM NOW ON STARTS IN DEVELOPER MODE, and a person it already had keeps Normal, as decided.
 *
 * The office makes a person in one place: the owner's row, written at the first migrate of a new office. That row now
 * holds `starting_mode` `inspect`, and the participant's read carries it as `startingMode`, on the whole row and on
 * the page's row. A person whose row has NULL is read as null, which the page takes as Normal mode.
 *
 *   1. A new office: its owner's row holds `inspect`, and both reads carry it.
 *   2. An owner whose row is already there keeps NULL through a later migrate, and the read says null.
 *   3. An office migrated before the column's migration, which has written its owner's row without the column, and is
 *      then migrated with every migration: the owner keeps NULL. This is the owner of an office that already holds
 *      work on the day the migration lands, and an office one migration behind.
 */

import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { MIGRATIONS } from './an-office-one-migration-behind.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** The migration that adds the column, by its journal tag. */
const THE_MIGRATION = '0354_a_person_keeps_the_mode_it_starts_in'

const HEADERS = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** What the owner's row holds in the column, read from the table itself. */
function theColumnOf(sqlite: Database.Database, id: string): unknown {
  const row = sqlite.prepare('SELECT starting_mode FROM people WHERE id = ?').get(id) as { starting_mode: unknown } | undefined
  if (row === undefined) throw new Error(`no person ${id} in this office`)
  return row.starting_mode
}

/** The person's starting mode as the whole read and the page's read carry it. */
async function whatTheReadsSay(): Promise<{ whole: unknown; page: unknown }> {
  const whole = await app.inject({ method: 'GET', url: `/api/participants/person/${THE_PERSON}`, headers: HEADERS })
  expect(whole.statusCode, whole.body).toBe(200)
  const page = await app.inject({ method: 'GET', url: '/api/participants?shape=page', headers: HEADERS })
  expect(page.statusCode, page.body).toBe(200)
  const row = (page.json() as { people: Record<string, unknown>[] }).people.find((one) => one['id'] === THE_PERSON)
  expect(row, 'the page read has no row for the person').toBeDefined()
  return { whole: (whole.json() as { participant: Record<string, unknown> }).participant['startingMode'], page: row!['startingMode'] }
}

/** drizzle/ up to, and not including, the migration `tag`, copied into `dir`. */
function migrationsBefore(dir: string, tag: string): string {
  const older = join(dir, 'drizzle-before')
  cpSync(MIGRATIONS, older, { recursive: true })
  const journalFile = join(older, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as { entries: { tag: string }[] }
  const at = journal.entries.findIndex((entry) => entry.tag === tag)
  if (at < 0) throw new Error(`drizzle/ has no migration ${tag}`)
  journal.entries.splice(at)
  writeFileSync(journalFile, JSON.stringify(journal))
  return older
}

describe('the mode a person starts in', () => {
  it('1. a new office writes its owner with Developer mode, and the reads carry it', async () => {
    expect(theColumnOf(t.client.sqlite, THE_PERSON)).toBe('inspect')
    expect(await whatTheReadsSay()).toEqual({ whole: 'inspect', page: 'inspect' })
  })

  it('2. an owner whose row is already there keeps NULL through a later migrate, and is read as null', async () => {
    t.client.sqlite.prepare('UPDATE people SET starting_mode = NULL WHERE id = ?').run(THE_PERSON)
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    migrateInPlace(t.client.sqlite, MIGRATIONS)
    expect(theColumnOf(t.client.sqlite, THE_PERSON)).toBeNull()
    expect(await whatTheReadsSay()).toEqual({ whole: null, page: null })
  })

  it('3. an office migrated before the column keeps NULL on its owner when the column lands', async () => {
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const dir = aTestDatabaseFolder('starting-mode-lands')
    const db = new Database(join(dir, 'panelx.db'))
    try {
      migrateInPlace(db, migrationsBefore(dir, THE_MIGRATION))
      const columns = db.prepare("SELECT name FROM pragma_table_info('people')").all() as { name: string }[]
      expect(columns.some((one) => one.name === 'starting_mode'), 'the office before the migration has the column').toBe(false)
      const owner = db.prepare('SELECT id FROM people WHERE office_owner IS NOT NULL').get() as { id: string } | undefined
      expect(owner, 'the first migrate wrote no owner').toBeDefined()
      migrateInPlace(db, MIGRATIONS)
      expect(theColumnOf(db, owner!.id)).toBeNull()
    } finally {
      db.close()
    }
  })
})
