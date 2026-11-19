// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RELEASE WITH NO RE-MINT MAP RE-MINTS NOTHING, AND THE PREVIOUS VERSION MAY STILL RUN ON THE OFFICE IT LEAVES.
 *
 * Migrations 0336 and 0337 come with the re-mint of the agent registry (src/server/db/remint-migration.ts). The re-mint
 * gives agents new ids only when `npm run db:migrate -- --remint <file>` hands it a map that `--stage-remint` wrote. A
 * release runs the command with no argument, and the server's start passes no map either. This file holds that such a
 * release, on an office written before 0336, changes no row it finds there, and that the way back passes both
 * migrations.
 *
 *   A. an office at the migration before 0336 holds Mole Office's own row under the id `mole-office`, as the older
 *      version wrote it, two other agents, the drawn face of each, a note with two revisions, a second note, a link
 *      between them and a seal that pins their revisions. The real command, with no argument, migrates it. Then every
 *      table the office had holds the same rows, in the columns it had, in key order, by digest. The migration journal
 *      keeps its rows and gains one for 0336 and each migration after it. The kept-lists table is new and empty.
 *      `drawn_from` is new and NULL on every asset row. No agent id changed at any migrate, the fixture's own two
 *      included. Every seal pin still holds, and the command says the re-mint was given no map;
 *   B. `theWayBackCheck` in tools/stable/the-way-back.mjs, given an older version whose migrations end just before 0336
 *      and a newer one whose migrations end at 0337, refuses nothing and finds that both only add.
 *
 * WHAT CASE B CANNOT CATCH. Case B reads both versions' in-place steps from this checkout, so it cannot catch a new
 * in-place step. The stable tool's own check reads each version's steps from its commit, and that one does catch it.
 * The proof made with this test ran that check at the two real commits, where it passed, and once more with one name
 * added to the newer version's THE_STEPS, where it refused.
 *
 * NO CASE C. No path applies a map without `--remint <file>`. The command reads a map only in its `--remint` branch
 * (`whatTheCommandWasAsked` in src/server/db/migrate.ts). Every other caller of `migrateInPlace` passes none, the
 * server's start and its preview included. A staged map is kept only in the file `--stage-remint` wrote, so there is no
 * stored map for a release to find.
 *
 * WHAT IS REAL: a test office of its own, in the temporary folder. drizzle's own migrator builds it from the real
 * migrations up to just before 0336, as `migrateInPlace` builds an empty file. The agents and their faces are written
 * next, by the two statements the older version's participants step writes them with, and Mole Office's own row under
 * its handle, as that version gave it. This checkout's `migrateInPlace` then runs the data steps on the same
 * migrations, before and after the notes. The notes and the link are written by the product's writers, and the seal by
 * hand, in the shape sealFinishedRun gives one. Every value is made up. The command is the real
 * src/server/db/migrate.ts, run by node with tsx, on that office alone.
 *
 * MUTATIONS, each after a control run, each file copied first, restored with cp and checked with cmp:
 *   1. in the 0337 migration, add a second statement after a statement breakpoint, which gives Mole Office's own row its
 *      name with a space after it: A and B go red;
 *   2. in applyTheStagedRemint (src/server/db/remint-migration.ts), when it is given no map, plan one and write it,
 *      in place of returning: A goes red;
 *   3. in the 0336 migration, add `UPDATE agents SET name = name WHERE 0` after a statement breakpoint: B goes red.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { getTableName } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { journal, MIGRATIONS, migrationsBefore, partialMigrations, REPO } from './migration-fixtures.ts'

/** A migration's tag, found in the journal by its words, because the merge queue may change its number. */
function theTagEnding(words: string): string {
  const tag = journal(MIGRATIONS).find((entry) => entry.tag.endsWith(words))?.tag
  if (tag === undefined) throw new Error(`The migration journal holds no migration ending ${words}.`)
  return tag
}
const TAG_0336 = theTagEnding('_the_remint_keeps_its_old_to_new_lists')
const TAG_0337 = theTagEnding('_a_drawn_face_keeps_what_it_is_drawn_from')
const BEFORE_0336 = migrationsBefore(TAG_0336)

const WHEN = '2026-11-13 01:00:00'
const PROJECT = 'default'
/** A made-up agent whose id is its handle, as the older version's participants step gave one. */
const LEGACY = 'made-up-legacy'
/** A made-up agent whose id was drawn, as the older version's registration gave one. */
const REGISTERED = { id: 'MadeUpAgent1', handle: 'made-up-registered' }

/** The two statements the older version's participants step writes an agent's drawn face and its row with. */
const A_DRAWN_FACE =
  'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) ' +
  "VALUES (?, ?, 'default', NULL, ?, NULL, ?, NULL, NULL, ?) ON CONFLICT(id) DO NOTHING"
const AN_AGENT =
  'INSERT INTO agents (id, name, handle, avatar_asset_id, state, state_at, retired, retired_because, ' +
  'created_at, created_by_kind, created_by_id) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, NULL) ' +
  'ON CONFLICT(id) DO NOTHING'

type Row = Record<string, unknown>
/** A write by `id`, under a key that proved it. */
const by = (id: string) => ({ type: 'agent' as const, id, provedHolder: { id, how: 'an-agent-key' as const, claimed: 'a-made-up-name' } })
const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

function readOnly<T>(file: string, read: (s: Database.Database) => T): T {
  const s = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return read(s)
  } finally {
    s.close()
  }
}

/** Every agent's id and handle, by handle. */
const theAgents = (s: Database.Database) => s.prepare('SELECT handle, id FROM agents ORDER BY handle').all() as Row[]

/** Each table of `s` but SQLite's own, with its columns in their order. */
function theTablesOf(s: Database.Database): Map<string, string[]> {
  const tables = s.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").pluck().all() as string[]
  return new Map(tables.map((table) => [table, s.prepare('SELECT name FROM pragma_table_info(?) ORDER BY cid').pluck().all(table) as string[]]))
}

/** The row count and the sha256 of the rows of each table in `tables`, read in the columns given there, in key order. */
function theDigests(s: Database.Database, tables: Map<string, string[]>): Record<string, string> {
  return Object.fromEntries(
    [...tables].map(([table, columns]) => {
      const key = s.prepare('SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk').pluck().all(table) as string[]
      const order = key.length > 0 ? key.map(quoted).join(', ') : 'rowid'
      const rows = s.prepare(`SELECT ${columns.map(quoted).join(', ')} FROM ${quoted(table)} ORDER BY ${order}`).raw().all()
      return [table, `${String(rows.length)} rows, sha256 ${createHash('sha256').update(JSON.stringify(rows)).digest('hex')}`]
    }),
  )
}

/** A made-up seal with the shape sealFinishedRun gives one, pinning `records` and `dependencies`. */
function aSeal(id: string, records: Row[], dependencies: Row[]): Row {
  return {
    seal: {
      version: 1,
      run: `${id}-run`,
      execution: `${id}-execution`,
      attempt: `${id}-attempt`,
      area: ['made-up/'],
      sealedAt: WHEN,
      kind: 'records',
      git: null,
      records: { workspace: PROJECT, baseline: 1, through: 1000, records, dependencies, links: [], says: 'Made-up words, on a made-up seal.' },
      hash: 'c'.repeat(64),
    },
  }
}

/** The office written before 0336, in `dir`, and the agents as each of its two in-place migrates left them. */
async function anOfficeWrittenBefore0336(dir: string) {
  const p = await import('../src/shared/participants.ts')
  const file = join(dir, 'panelx.db')
  const partial = partialMigrations(BEFORE_0336)

  // THE SCHEMA, by drizzle's own migrator, as `migrateInPlace` builds an empty file. Then the agents and their faces,
  // before any data step, so the participants step finds Mole Office's own row and leaves it.
  const empty = new Database(file)
  empty.pragma('journal_mode = WAL')
  migrate(drizzle(empty), { migrationsFolder: partial })
  const anAgent = (id: string, name: string, handle: string) => {
    const face = p.defaultAvatarAssetId({ kind: 'agent', id })
    empty.prepare(A_DRAWN_FACE).run(face, p.AVATAR_ASSET_KIND, p.GENERATED_AVATAR_MIME, WHEN, p.GENERATED_AVATAR_LICENCE)
    empty.prepare(AN_AGENT).run(id, name, handle, face, 0, null, WHEN)
  }
  anAgent(p.MOLE_OFFICE_HANDLE, p.MOLE_OFFICE_NAME, p.MOLE_OFFICE_HANDLE)
  anAgent(LEGACY, 'Made-up legacy agent', LEGACY)
  anAgent(REGISTERED.id, 'Made-up registered agent', REGISTERED.handle)
  const written = theAgents(empty)
  empty.close()

  // THE DATA STEPS AND THE WRITERS, on the product's own connection to this file.
  vi.resetModules()
  process.env.MOLE_OFFICE_DB = file
  const client = await import('../src/server/db/client.ts')
  const { migrateInPlace } = await import('../src/server/db/migrate.ts')
  const api = await import('../src/server/lib/records.ts')
  const { theHashOfARow } = await import('../src/server/lib/the-hash-a-seal-pins-a-row-by.ts')
  const s = client.sqlite
  try {
    migrateInPlace(s, partial)
    const afterTheFirst = theAgents(s)
    const aNote = (what: string) => api.createRecord({ workspaceId: PROJECT, kind: 'note', title: `A made-up note ${what}`, data: { body: 'Made-up words, first.' }, actor: by(LEGACY) }).id
    const sealed = aNote('a seal names before and after')
    api.patchRecord(sealed, { data: { body: 'Made-up words, second.' } }, by(LEGACY))
    const dependency = aNote('a seal names as a dependency')
    const link = api.createLink({ fromId: sealed, toId: dependency, type: 'relates_to', actor: api.HUMAN }).id
    const aPin = (record: string, seq: number) => {
      const row = s.prepare('SELECT * FROM revisions WHERE record_id = ? AND seq = ?').get(record, seq) as Row
      return { record, id: String(row['id']), seq, hash: theHashOfARow(row) }
    }
    const seal = aSeal('MadeUpSeal01', [{ id: sealed, before: aPin(sealed, 1), after: aPin(sealed, 2) }], [aPin(dependency, 1)])
    s.prepare(
      `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin)
       VALUES ('MadeUpSeal01', ?, ?, ?, ?, 'sealed_tip', 'A made-up seal', ?, 'fixture')`,
    ).run(PROJECT, THE_TEST_OFFICES_OWNER.id, WHEN, WHEN, JSON.stringify(seal))
    // AGAIN, so the seal is given its first revision, as a start after the seal would give it.
    migrateInPlace(s, partial)
    return { file, sealed, link, agents: { written, afterTheFirst, afterTheSecond: theAgents(s) } }
  } finally {
    s.close()
  }
}

/** The real command, with the arguments given, on `file` alone. */
function theCommand(file: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const home = join(file, '..', 'home')
  mkdirSync(home, { recursive: true })
  const ran = spawnSync(process.execPath, ['--import', 'tsx', 'src/server/db/migrate.ts', ...args], {
    cwd: REPO,
    env: { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: file },
    encoding: 'utf8',
  })
  if (ran.error !== undefined) throw ran.error
  return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr }
}

describe('a release with no re-mint map', () => {
  it('A. migrates an office written before 0336 and changes no row it finds there, and re-mints no agent', async () => {
    const dir = aTestDatabaseFolder('no-remint-map')
    try {
      const p = await import('../src/shared/participants.ts')
      const { THE_MIGRATION_JOURNAL_TABLE } = await import('../src/config/migration-look.mjs')
      const office = await anOfficeWrittenBefore0336(dir)
      const schema = await import('../src/server/db/schema.ts')
      const { THE_KEPT_LISTS, applyTheStagedRemint, theSealPinsThatDoNotHold, whatTheRemintDid } = await import('../src/server/db/remint-migration.ts')
      const ASSETS = getTableName(schema.assets)
      const DRAWN_FROM = schema.assets.drawnFrom.name

      // THE OFFICE AS THE OLDER VERSION LEFT IT, and every no-map migrate so far left every agent id as it was written.
      const tables = readOnly(office.file, theTablesOf)
      expect(office.agents.written).toEqual(
        [
          { handle: p.MOLE_OFFICE_HANDLE, id: p.MOLE_OFFICE_HANDLE },
          { handle: LEGACY, id: LEGACY },
          { handle: REGISTERED.handle, id: REGISTERED.id },
        ].sort((a, b) => (a.handle < b.handle ? -1 : 1)),
      )
      expect(office.agents.afterTheFirst, 'the first in-place migrate, with no map').toEqual(office.agents.written)
      expect(office.agents.afterTheSecond, 'the second in-place migrate, with no map').toEqual(office.agents.written)
      expect(tables.has(THE_KEPT_LISTS), `${THE_KEPT_LISTS} before 0336`).toBe(false)
      expect(tables.get(ASSETS), `${ASSETS} before 0337`).not.toContain(DRAWN_FROM)
      readOnly(office.file, (s) => {
        expect(s.prepare('SELECT count(*) FROM revisions WHERE record_id = ?').pluck().get(office.sealed)).toBe(2)
        expect(s.prepare('SELECT count(*) FROM links WHERE id = ?').pluck().get(office.link)).toBe(1)
        expect(s.prepare("SELECT count(*) FROM records WHERE kind = 'sealed_tip'").pluck().get()).toBe(1)
        expect(s.prepare(`SELECT count(*) FROM ${quoted(ASSETS)} WHERE origin = 'default' AND id = ?`).pluck().get(p.defaultAvatarAssetId({ kind: 'agent', id: p.MOLE_OFFICE_HANDLE }))).toBe(1)
        expect(theSealPinsThatDoNotHold(s), 'the seal pins, before').toEqual([])
      })
      const before = readOnly(office.file, (s) => ({
        digests: theDigests(s, new Map([...tables].filter(([table]) => table !== THE_MIGRATION_JOURNAL_TABLE))),
        journal: s.prepare(`SELECT * FROM ${quoted(THE_MIGRATION_JOURNAL_TABLE)} ORDER BY id`).all() as Row[],
      }))

      // A RELEASE: the plain command, with no argument.
      const ran = theCommand(office.file, [])
      expect(ran.status, ran.stderr).toBe(0)

      readOnly(office.file, (s) => {
        expect(theAgents(s), 'the command, with no map').toEqual(office.agents.written)
        expect(theDigests(s, new Map([...tables].filter(([table]) => table !== THE_MIGRATION_JOURNAL_TABLE)))).toEqual(before.digests)
        const journalNow = s.prepare(`SELECT * FROM ${quoted(THE_MIGRATION_JOURNAL_TABLE)} ORDER BY id`).all() as Row[]
        expect(journalNow.slice(0, before.journal.length)).toEqual(before.journal)
        expect(journalNow.map((row) => row['hash'])).toEqual(readMigrationFiles({ migrationsFolder: MIGRATIONS }).map((one) => one.hash))
        expect(theTablesOf(s).has(THE_KEPT_LISTS), `${THE_KEPT_LISTS} after the command`).toBe(true)
        expect(s.prepare(`SELECT count(*) FROM ${quoted(THE_KEPT_LISTS)}`).pluck().get()).toBe(0)
        expect(s.prepare(`SELECT count(*) FROM ${quoted(ASSETS)}`).pluck().get()).toBeGreaterThanOrEqual(3)
        expect(s.prepare(`SELECT count(*) FROM ${quoted(ASSETS)} WHERE ${quoted(DRAWN_FROM)} IS NOT NULL`).pluck().get()).toBe(0)
        expect(theSealPinsThatDoNotHold(s), 'the seal pins, after').toEqual([])
      })

      // AND IT SAYS SO, in the words the no-map path of the re-mint gives: a store of no tables, given no map.
      const nothing = new Database(':memory:')
      try {
        expect(ran.stdout).toContain(whatTheRemintDid(applyTheStagedRemint(nothing, null, [], [])))
      } finally {
        nothing.close()
      }
    } finally {
      removeThisTestFolder(dir)
    }
  }, 240_000)

  it('B. passes the way back from an older version that ends before 0336 to a newer one that ends at 0337', async () => {
    const wayBack = await import('../tools/stable/the-way-back.mjs')
    const raw = JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
    const upTo0337 = raw.entries.findIndex((entry) => entry.tag === TAG_0337) + 1
    const versions = { older: raw.entries.slice(0, BEFORE_0336), newer: raw.entries.slice(0, upTo0337) }
    // A GIT OF TWO VERSIONS, MADE OF THIS TREE: each holds the real migration files its journal names.
    const blobs = new Map<string, string>()
    const tree = (version: keyof typeof versions): string => {
      blobs.set(`${version}:journal`, JSON.stringify({ ...raw, entries: versions[version] }))
      const lines = [`100644 blob ${version}:journal\t${wayBack.THE_MIGRATIONS_PATH}/meta/_journal.json`]
      for (const one of versions[version]) {
        blobs.set(`file:${one.tag}`, readFileSync(join(MIGRATIONS, `${one.tag}.sql`), 'utf8'))
        lines.push(`100644 blob file:${one.tag}\t${wayBack.THE_MIGRATIONS_PATH}/${one.tag}.sql`)
      }
      return lines.join('\0')
    }
    // BOTH VERSIONS' IN-PLACE STEPS ARE THIS CHECKOUT'S, which is why this case cannot catch a new step: see the header.
    const steps = readFileSync(join(REPO, wayBack.THE_STEPS_FILE), 'utf8')
    const asked: string[] = []
    const theMadeUpGit = (args: string[]): string => {
      asked.push(args.join(' '))
      if (args[0] === 'ls-tree' && (args[3] === 'older' || args[3] === 'newer')) return tree(args[3])
      const blob = args[0] === 'cat-file' ? blobs.get(args[2] ?? '') : undefined
      if (blob !== undefined) return blob
      if (args[0] === 'show' && (args[1] === `older:${wayBack.THE_STEPS_FILE}` || args[1] === `newer:${wayBack.THE_STEPS_FILE}`)) return steps
      throw new Error(`The made-up git was asked ${args.join(' ')}.`)
    }
    expect(versions.newer.slice(BEFORE_0336).map((one) => one.tag)).toEqual([TAG_0336, TAG_0337])
    expect(wayBack.theWayBackCheck(theMadeUpGit, 'older', 'newer', [])).toEqual({ checked: [TAG_0336, TAG_0337], reviewed: [], unused: [], refusal: null })
    expect(asked).toEqual(expect.arrayContaining([`show older:${wayBack.THE_STEPS_FILE}`, `show newer:${wayBack.THE_STEPS_FILE}`]))
  })
})
