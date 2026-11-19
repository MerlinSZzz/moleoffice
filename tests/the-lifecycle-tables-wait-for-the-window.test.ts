// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO LIFECYCLE TABLES ARE WRITTEN, PROVED, AND NOT REGISTERED — and this file is the proof of
 * all three at once.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A HELD MIGRATION NEEDS A TEST OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * This campaign has ONE announced migration window and the owner opens it. `prepareToServe` refuses
 * to serve a corpus that has a migration waiting, so registering this one would stop the owner's dev server
 * at a moment nobody chose. So the SQL sits in `held-migrations/` and the drizzle
 * declarations sit in `src/server/db/lifecycle-tables.ts`, outside `schema.ts`.
 *
 * **That arrangement creates this repository's recurring defect on purpose: the same fact — what
 * columns these two tables have — is written out in two places, and nothing in the compiler or the
 * database makes them agree.** The answer CLAUDE.md gives for that is a test that fails when they
 * disagree. The cases below run the held SQL against a copy of a corpus and check what it makes.
 *
 * ---------------------------------------------------------------------------------------
 * THE THINGS THIS FILE ASSERTS
 * ---------------------------------------------------------------------------------------
 *
 *   2. The window has NOT opened: a freshly migrated database has neither table. **When the owner
 *      opens the window, this file is deleted** — it is the file whose whole subject is that the
 *      window is shut.
 *   3. Run against a copy of a corpus, the SQL creates both tables EMPTY, adds the three indexes,
 *      and changes no existing row. The owner's section 15 forbids inventing history that was never
 *      observed, and emptiness is how that is checked rather than asserted. A row written through
 *      the drizzle declarations then lands in the table the SQL made and reads back, and a row
 *      missing a required column is refused by the database.
 *   4. The standalone runner refuses the owner's own file by name, refuses a database that is not a
 *      Mole Office corpus, and is safe to run twice.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT CLAIM
 * ---------------------------------------------------------------------------------------
 *
 * It does not claim the migration is REGISTERED, because it is not, and it does not claim the two
 * tables exist on any database the product serves, because they do not. Every test that needs the
 * tables — here and in `tests/one-work-state-door.test.ts` — applies this same held SQL to its own
 * throwaway file first. That is also the strongest thing anybody can say about a held migration:
 * the tests run the SQL the window will run.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { execFileSync } from 'node:child_process'
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { settingNamed } from '../src/config/settings.mjs'
import { agentWakes, agentWorkTransitions } from '../src/server/db/lifecycle-tables.ts'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const HELD_DIR = join(REPO, 'held-migrations')
const HELD_SQL = join(HELD_DIR, 'agent-lifecycle-tables.sql')
const RUNNER = join(HELD_DIR, 'run-agent-lifecycle-tables.mjs')

const TABLES = ['agent_work_transitions', 'agent_wakes'] as const

const scratch: string[] = []
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-held-migration-'))
  scratch.push(dir)
  return dir
}

// ============================================================ reading the held SQL

// ============================================================ 1. the two places agree

// ============================================================ 2. the window has not opened

describe('the window has not opened, and that is asserted rather than assumed', () => {
  it('leaves a freshly migrated database without either table', async () => {
    const t: TestDb = await freshDb()
    try {
      const present = t.client.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)")
        .all(TABLES[0], TABLES[1]) as { name: string }[]
      expect(present.map((row) => row.name)).toEqual([])
    } finally {
      t.close()
    }
  })
})

// ============================================================ 3. what the SQL does to a corpus

describe('run against a copy of a corpus, the held SQL invents nothing', () => {
  /** A throwaway corpus with the shape the runner checks for, and one session record in it. */
  function aCorpus(): string {
    const file = join(tempDir(), 'copy.db')
    const db = new Database(file)
    db.exec('CREATE TABLE records (id TEXT PRIMARY KEY, kind TEXT, data TEXT)')
    db.prepare('INSERT INTO records (id, kind, data) VALUES (?, ?, ?)').run('s1', 'session', '{"state":"finished"}')
    db.close()
    return file
  }

  it('creates both tables empty, with the three indexes, and touches no existing row', () => {
    const file = aCorpus()
    const db = new Database(file)
    const before = db.prepare('SELECT id, kind, data FROM records').all()

    db.exec(readFileSync(HELD_SQL, 'utf8'))

    for (const table of TABLES) {
      const rows = db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }
      expect(rows.n, `${table} is created EMPTY — there is no backfill and nothing observed it`).toBe(0)
    }
    const indexes = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[])
      .map((row) => row.name)
      .filter((name) => name.startsWith('agent_'))
      .sort()
    expect(indexes).toEqual(['agent_wakes_agent_idx', 'agent_wakes_poll_idx', 'agent_work_transitions_agent_idx'])
    expect(db.prepare('SELECT id, kind, data FROM records').all(), 'no session record gained anything').toEqual(before)
    db.close()
  })

  it('accepts a row written through the declarations, and refuses one missing a required column', () => {
    // THE COLUMN-BY-COLUMN COMPARISON ABOVE MEASURED BY OUTCOME, and the reason it is here is what
    // the two deleted cases at the foot of this file were not. Comparing two lists of column names
    // is a comparison of two descriptions. This is the thing the descriptions are for: a write built
    // from the drizzle declarations, against the table the held SQL created, on a real database.
    // A column named in one place and not the other fails here with SQLite's own message.
    const file = aCorpus()
    const db = new Database(file)
    db.exec(readFileSync(HELD_SQL, 'utf8'))
    const d = drizzle(db)

    d.insert(agentWorkTransitions)
      .values({
        id: 'awt-1',
        workspaceId: 'panelx',
        agentId: 'ag-1',
        fromState: null,
        toState: 'working',
        at: '2026-09-03 21:00:00',
        because: 'the owner asked for the reach check',
        evidence: null,
        actorType: 'human',
        actorId: THE_TEST_OFFICES_OWNER.id,
        attachmentId: null,
        relatedKind: null,
        relatedId: null,
      })
      .run()
    d.insert(agentWakes)
      .values({
        id: 'awk-1',
        workspaceId: 'panelx',
        agentId: 'ag-1',
        wantedAt: '2026-09-03 21:05:00',
        wantedByType: 'human',
        wantedById: THE_TEST_OFFICES_OWNER.id,
        because: 'the owner answered the question the agent stopped on',
        evidence: null,
        policy: 'owner-message',
        state: 'wanted',
        stateAt: '2026-09-03 21:05:00',
        claimedBy: null,
        claimedAt: null,
        servedAt: null,
        attachmentId: null,
        refusedBecause: null,
      })
      .run()

    const transitions = d.select().from(agentWorkTransitions).all()
    expect(transitions).toHaveLength(1)
    expect(transitions[0]?.because).toBe('the owner asked for the reach check')
    expect(transitions[0]?.fromState, 'NULL means this is the agent first transition').toBeNull()
    const wakes = d.select().from(agentWakes).all()
    expect(wakes).toHaveLength(1)
    expect(wakes[0]?.state).toBe('wanted')

    // AND THE NULLABILITY IS THE TABLE'S, not a word in a declaration. `because` is the column the
    // design added this table for, and a row without one is refused by the database itself.
    expect(() =>
      db
        .prepare(
          'INSERT INTO agent_work_transitions (id, workspace_id, agent_id, to_state, at, actor_type, actor_id) ' +
            `VALUES ('awt-2', 'panelx', 'ag-1', 'idle', '2026-09-03 21:10:00', 'human', '${THE_TEST_OFFICES_OWNER.id}')`,
        )
        .run(),
    ).toThrow(/NOT NULL/i)
    db.close()
  })

  it('gives no session record a discovery stamp, which is the negative row the design asks for', () => {
    const file = aCorpus()
    const db = new Database(file)
    db.exec(readFileSync(HELD_SQL, 'utf8'))
    const stamped = db
      .prepare(
        "SELECT count(*) AS n FROM records WHERE kind = 'session' AND json_extract(data, '$.extra.discovered') IS NOT NULL",
      )
      .get() as { n: number }
    expect(stamped.n).toBe(0)
    db.close()
  })

  it('runs twice on the same file without a second CREATE, through the runner', () => {
    const file = aCorpus()
    const first = execFileSync('node', [RUNNER, file, '--apply'], { encoding: 'utf8' })
    expect(first).toContain('created: agent_work_transitions, agent_wakes')
    expect(first).toContain('nothing was invented')
    const second = execFileSync('node', [RUNNER, file, '--apply'], { encoding: 'utf8' })
    expect(second).toContain('already here, so this run created nothing')
  })

  it('writes nothing without --apply, and says what it would have done', () => {
    const file = aCorpus()
    const out = execFileSync('node', [RUNNER, file], { encoding: 'utf8' })
    expect(out).toContain('Nothing was written')
    const db = new Database(file)
    const present = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)")
      .all(TABLES[0], TABLES[1]) as { name: string }[]
    expect(present).toEqual([])
    db.close()
  })
})

// ============================================================ 4. what the runner refuses

describe('the standalone runner refuses what it cannot honestly do', () => {
  function refusal(args: string[], env: Record<string, string> = {}): string {
    try {
      execFileSync('node', [RUNNER, ...args], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env } })
    } catch (error) {
      return String((error as { stderr?: Buffer }).stderr ?? error)
    }
    throw new Error(`The runner accepted ${args.join(' ')} and it should have refused.`)
  }

  /** A small Mole Office corpus at `relative` inside a scratch folder: a records table and one session. */
  function aCorpusAt(relative: string): string {
    const file = join(tempDir(), relative)
    mkdirSync(dirname(file), { recursive: true })
    const db = new Database(file)
    db.exec('CREATE TABLE records (id TEXT PRIMARY KEY, kind TEXT, data TEXT)')
    db.prepare('INSERT INTO records (id, kind, data) VALUES (?, ?, ?)').run('s1', 'session', '{"state":"finished"}')
    db.close()
    return file
  }

  /** Whether the runner added either lifecycle table to `file`. */
  function gainedATable(file: string): boolean {
    const db = new Database(file)
    const present = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)")
      .all(TABLES[0], TABLES[1]) as { name: string }[]
    db.close()
    return present.length > 0
  }

  it('refuses the database an older office still uses, data/panelx.db, by name', () => {
    expect(refusal(['data/panelx.db', '--apply'])).toContain('live corpus')
  })

  // PROBLEM ZxFvofvzPrKz: until wave 13p round 11b the runner refused only data/panelx.db, while the
  // default database had been the settings' MOLE_OFFICE_DB default since 30 September 2026. The default's
  // name is read from src/config/settings.mjs here as well, so this case follows a rename of it.
  it("refuses the settings' default database by name, in any checkout, and writes nothing to it", () => {
    const theDefault = String(settingNamed('MOLE_OFFICE_DB').fallback).replace(/^\.\//u, '')
    const file = aCorpusAt(theDefault)
    expect(refusal([file, '--apply'])).toContain('live corpus')
    expect(gainedATable(file)).toBe(false)
  })

  it('refuses the database the office settings name through MOLE_OFFICE_DB, and writes nothing to it', () => {
    const file = aCorpusAt('the-office.db')
    expect(refusal([file, '--apply'], { MOLE_OFFICE_DB: file })).toContain('live corpus')
    expect(gainedATable(file)).toBe(false)
  })

  // PROBLEM Z8sP12_liDo0: until wave 13p round 12 the runner compared resolved path strings, so another
  // name for the same file got through. Every file here is a scratch database in a temporary folder.
  it("refuses a symbolic link to the settings' default database, and writes nothing through it", () => {
    const theDefault = String(settingNamed('MOLE_OFFICE_DB').fallback).replace(/^\.\//u, '')
    const target = aCorpusAt(theDefault)
    const link = join(tempDir(), 'a-link.db')
    symlinkSync(target, link)
    expect(refusal([link, '--apply'])).toContain('live corpus')
    expect(gainedATable(target)).toBe(false)
  })

  it("refuses a hard link to the settings' default database, and writes nothing through it", () => {
    const theDefault = String(settingNamed('MOLE_OFFICE_DB').fallback).replace(/^\.\//u, '')
    const target = aCorpusAt(theDefault)
    const hard = join(dirname(dirname(target)), 'a-hard-link.db')
    linkSync(target, hard)
    expect(refusal([hard, '--apply'])).toContain('live corpus')
    expect(gainedATable(target)).toBe(false)
  })

  it('refuses a symbolic link to the database MOLE_OFFICE_DB names, and writes nothing through it', () => {
    const target = aCorpusAt('the-office.db')
    const link = join(tempDir(), 'a-link.db')
    symlinkSync(target, link)
    expect(refusal([link, '--apply'], { MOLE_OFFICE_DB: target })).toContain('live corpus')
    expect(gainedATable(target)).toBe(false)
  })

  it('names a hard link to the database MOLE_OFFICE_DB names as that database, by device and inode', () => {
    const target = aCorpusAt('the-office.db')
    const hard = join(dirname(target), 'a-hard-link.db')
    linkSync(target, hard)
    expect(refusal([hard, '--apply'], { MOLE_OFFICE_DB: target })).toContain('under another name')
    expect(gainedATable(target)).toBe(false)
  })

  it('refuses a symbolic link to a file that does not exist, and creates no file', () => {
    const dir = tempDir()
    const missing = join(dir, 'not-there.db')
    const link = join(dir, 'a-link.db')
    symlinkSync(missing, link)
    expect(refusal([link, '--apply'])).toContain('live corpus')
    expect(readdirSync(dir).sort()).toEqual(['a-link.db'])
  })

  it('accepts a copy of the database MOLE_OFFICE_DB names, which is a different file, and leaves the original alone', () => {
    const target = aCorpusAt('the-office.db')
    const copy = join(dirname(target), 'a-copy.db')
    copyFileSync(target, copy)
    const out = execFileSync('node', [RUNNER, copy, '--apply'], {
      encoding: 'utf8',
      env: { ...process.env, MOLE_OFFICE_DB: target },
    })
    expect(out).toContain('created: agent_work_transitions, agent_wakes')
    expect(gainedATable(copy)).toBe(true)
    expect(gainedATable(target)).toBe(false)
  })

  it('still accepts a scratch copy while the setting names another database', () => {
    const file = aCorpusAt('copy.db')
    const other = join(dirname(file), 'the-office.db')
    const out = execFileSync('node', [RUNNER, file, '--apply'], {
      encoding: 'utf8',
      env: { ...process.env, MOLE_OFFICE_DB: other },
    })
    expect(out).toContain('created: agent_work_transitions, agent_wakes')
    expect(gainedATable(file)).toBe(true)
  })

  it('refuses a database that is not a Mole Office corpus', () => {
    const file = join(tempDir(), 'not-panelx.db')
    const db = new Database(file)
    db.exec('CREATE TABLE something_else (id TEXT)')
    db.close()
    expect(refusal([file, '--apply'])).toContain('not a Mole Office corpus')
  })

  it('refuses a half-applied database rather than papering over it', () => {
    const file = join(tempDir(), 'half.db')
    const db = new Database(file)
    db.exec('CREATE TABLE records (id TEXT PRIMARY KEY, kind TEXT, data TEXT)')
    db.exec('CREATE TABLE agent_wakes (id TEXT PRIMARY KEY)')
    db.close()
    expect(refusal([file, '--apply'])).toContain('half-applied run')
  })

  it('refuses to run with no database named at all', () => {
    expect(refusal([])).toContain('Name the database')
  })
})

// ============================================================ the file that has to be deleted

