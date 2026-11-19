// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION C1: EVERY WORLD KEEPS ITS OWN ROLL.
 *
 * `design/messages/ACCEPTANCE.md` section 8: everybody, agents and
 * people alike, registers in a world, and registering is becoming a citizen of it.
 *
 * What is proved here:
 *
 *   1. the migration makes every person and every agent already in a database a citizen of the world
 *      that database is, and says how many;
 *   2. the date is the row's own registration date and not the day the migration ran;
 *   3. a registration made after the migration is a citizen of the world it is made in;
 *   4. a citizenship somebody already holds is never overwritten;
 *   5. the installation id is written once and never rewritten, and the declaration can name it.
 *
 * WHY THIS FILE MIGRATES ITS OWN DATABASE rather than using `freshDb()`. The helper migrates and
 * throws the report away, and three of these tests are about what the report says. Migrating here
 * costs one run of the folder per test and gives the numbers the criterion asks for.
 */
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateInPlace } from '../src/server/db/migrate.ts'
import { theOfficesOwnId } from './helpers.ts'
import {
  installationOf,
  WHAT_A_REPAIRED_SENTENCE_SAYS,
  describeCitizenship,
  theInstallationForADatabaseAt,
  theInstallationThisDatabaseBelongsTo,
} from '../src/server/db/citizenship-migration.ts'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { canonicalDatabasePath } from '../src/config/settings.mjs'
import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url))

interface Scratch {
  dir: string
  file: string
  db: Database.Database
}

const open: Scratch[] = []

function scratch(name: string): Scratch {
  const dir = mkdtempSync(join(tmpdir(), `mole-office-citizens-${name}-`))
  const file = join(dir, 'panelx.db')
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  const s = { dir, file, db }
  open.push(s)
  return s
}

afterEach(() => {
  for (const s of open.splice(0)) {
    if (s.db.open) s.db.close()
    rmSync(s.dir, { recursive: true, force: true })
  }
  delete process.env['MOLE_OFFICE_INSTALLATION']
})

describe('everybody already in a database becomes a citizen of the world that database is', () => {
  it('gives every person and every agent the identity of this database, and says how many', () => {
    const s = scratch('counts')
    const outcome = migrateInPlace(s.db, MIGRATIONS)
    const world = databaseIdentity(s.file).id

    // The migration writes the owner and Mole Office itself, so a freshly migrated database holds
    // one of each. Both are counted here rather than assumed, so a change to what the participants
    // step writes shows up as a number rather than as silence.
    expect(outcome.citizenship.world).toBe(world)
    expect(outcome.citizenship.peopleMadeCitizens).toBe(1)
    expect(outcome.citizenship.agentsMadeCitizens).toBe(1)
    expect(outcome.citizenship.leftWithNoWorld).toBe(0)

    const homeless = s.db
      .prepare(
        'SELECT COUNT(*) AS n FROM (SELECT home_world FROM people UNION ALL SELECT home_world FROM agents) ' +
          'WHERE home_world IS NULL',
      )
      .get() as { n: number }
    expect(homeless.n).toBe(0)
    const person = s.db.prepare('SELECT home_world, home_installation FROM people').get() as {
      home_world: string
      home_installation: string
    }
    expect(person.home_world).toBe(world)
    expect(person.home_installation).toBe(installationOf(s.db))
  })

  it('dates the citizenship from when the row was registered, not from when the migration ran', () => {
    const s = scratch('dates')
    migrateInPlace(s.db, MIGRATIONS)

    // A ROW FROM BEFORE THE COLUMNS EXISTED, which is what this step is for and the only state that
    // can tell the two dates apart. Everything the migration itself writes is created in the same
    // second the migration runs, so `created_at` and "now" are the same string on those rows and a
    // step stamping its own clock over them would look exactly right.
    const wasRegistered = '2026-01-01 09:00:00'
    const picture = s.db.prepare('SELECT id FROM assets LIMIT 1').get() as { id: string }
    s.db
      .prepare(
        'INSERT INTO people (id, name, handle, avatar_asset_id, state, state_at, created_at) ' +
          "VALUES ('older', 'Somebody registered in January', 'older', ?, NULL, NULL, ?)",
      )
      .run(picture.id, wasRegistered)

    migrateInPlace(s.db, MIGRATIONS)
    const older = s.db.prepare('SELECT created_at, citizen_since FROM people WHERE id = ?').get('older') as {
      created_at: string
      citizen_since: string
    }
    expect(older.created_at).toBe(wasRegistered)
    expect(older.citizen_since).toBe(wasRegistered)

    const rows = s.db
      .prepare(
        'SELECT created_at, citizen_since FROM people UNION ALL SELECT created_at, citizen_since FROM agents',
      )
      .all() as { created_at: string; citizen_since: string }[]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.citizen_since).toBe(row.created_at)
  })

  it('leaves a row alone when it arrived already holding a world, and says none was left homeless', () => {
    const s = scratch('restored')
    migrateInPlace(s.db, MIGRATIONS)
    // A row restored from another installation's archive: it carries the world it was registered in,
    // which is not this one.
    const elsewhere = 'ffffffffffffffff'
    const picture = s.db.prepare('SELECT id FROM assets LIMIT 1').get() as { id: string }
    s.db
      .prepare(
        'INSERT INTO people (id, name, handle, avatar_asset_id, state, state_at, created_at, home_world, ' +
          "home_installation, citizen_since) VALUES ('visitor', 'A visitor', 'visitor', ?, NULL, NULL, " +
          "'2026-01-01 09:00:00', ?, 'another-installation', '2026-01-01 09:00:00')",
      )
      .run(picture.id, elsewhere)
    // Run the whole folder again. Nothing is pending, so this is the data steps alone.
    const again = migrateInPlace(s.db, MIGRATIONS)
    expect(again.citizenship.peopleMadeCitizens).toBe(0)
    const kept = s.db.prepare('SELECT home_world, home_installation FROM people WHERE id = ?').get('visitor') as {
      home_world: string
      home_installation: string
    }
    expect(kept.home_world).toBe(elsewhere)
    expect(kept.home_installation).toBe('another-installation')
  })
})

describe('the installation this database belongs to is written once', () => {
  it('writes one row on the first migration and does not rewrite it on the second', () => {
    const s = scratch('once')
    const first = migrateInPlace(s.db, MIGRATIONS)
    expect(first.citizenship.installationWritten).toBe(1)
    const wasWrittenAt = s.db.prepare('SELECT written_at, id FROM installation').get() as {
      written_at: string
      id: string
    }

    process.env['MOLE_OFFICE_INSTALLATION'] = 'somebody-elses-name'
    const second = migrateInPlace(s.db, MIGRATIONS)
    expect(second.citizenship.installationWritten).toBe(0)
    const now = s.db.prepare('SELECT written_at, id FROM installation').get() as { written_at: string; id: string }
    expect(now.id).toBe(wasWrittenAt.id)
    expect(now.written_at).toBe(wasWrittenAt.written_at)
    expect(now.id).not.toBe('somebody-elses-name')
  })

  it('takes the name the declaration gives, when the declaration gives one', () => {
    process.env['MOLE_OFFICE_INSTALLATION'] = `${THE_TEST_OFFICES_OWNER.id}-desktop`
    const s = scratch('named')
    expect(theInstallationThisDatabaseBelongsTo(s.db).id).toBe(`${THE_TEST_OFFICES_OWNER.id}-desktop`)
    // AND IT STILL NAMES THE DATABASE IT MIGRATED, so a value set in one checkout and used on
    // another database is readable in the log rather than silent.
    expect(theInstallationThisDatabaseBelongsTo(s.db).database).toBe(s.file)
    migrateInPlace(s.db, MIGRATIONS)
    expect(installationOf(s.db)).toBe(`${THE_TEST_OFFICES_OWNER.id}-desktop`)
  })

  /**
   * PROBLEM `25JDoYvL_lK5`. The id used to be the SHA-256 of the CANONICAL database path, so
   * migrate-first — which CLAUDE.md requires and which is always run from a worktree — stamped the
   * worktree's own path into whatever database it was pointed at. The live database was given
   * 729aa30f9ed0f0d6, the id of that worktree, and the value is written once and never
   * rewritten. These two hold the fix from both sides: it is the database in hand, and it is not
   * the declaration.
   */
  it('is the identity of the database being migrated, whatever database the declaration names', () => {
    delete process.env['MOLE_OFFICE_INSTALLATION']
    const one = scratch('installation-one')
    const two = scratch('installation-two')
    const first = theInstallationThisDatabaseBelongsTo(one.db)
    const second = theInstallationThisDatabaseBelongsTo(two.db)
    expect(first.id).not.toBe(second.id)
    // AND THE MIGRATION'S OWN SENTENCE NAMES IT, because reading that sentence in the log is how the
    // wrong value was caught, and a log that stopped naming the database would take that away.
    const said = migrateInPlace(one.db, MIGRATIONS).citizenship
    expect(said.howTheInstallationWasRead).toContain(one.file)
    expect(said.installation).toBe(first.id)
    expect(first.database).toBe(one.file)
    expect(second.database).toBe(two.file)
    expect(first.database).not.toBe(canonicalDatabasePath())
    // AND THE STORED SENTENCE CARRIES NO PATH AT ALL. The row is exported, and an absolute path
    // from the machine that wrote it is not a fact about the archive.
    expect(first.how).not.toContain(one.dir)
    expect(first.how).not.toContain('/')
  })

  it('gives one database path the same id it was always given, pinned rather than worked out', () => {
    // THE VALUE IS WRITTEN HERE, asked of the product rather than worked out here. An installation
    // row is written once and never rewritten: a rule that moved would leave every row already
    // written disagreeing with the code for ever. The first version of this test computed the hash
    // itself, which is the rule written twice — it went on passing over a hash with its own word
    // taken out.
    delete process.env['MOLE_OFFICE_INSTALLATION']
    expect(theInstallationForADatabaseAt('/srv/office/data/office.db').id).toBe('7174a227d8dbcd81')
  })

  it('reads two spellings of one file as one installation', () => {
    // A DATABASE OPENED THROUGH A `..` IS THE SAME DATABASE. Without resolving the path first the
    // two spellings hash differently, and a stack that opened it the other way round would call
    // itself a different installation.
    delete process.env['MOLE_OFFICE_INSTALLATION']
    const s = scratch('two-spellings')
    // Built with a template rather than `join`, because `join` normalises the `..` away and the
    // point is a path that still has one in it when it reaches the product.
    const roundabout = `${s.dir}/somewhere/../panelx.db`
    expect(roundabout).not.toBe(s.file)
    expect(theInstallationForADatabaseAt(roundabout).id).toBe(theInstallationForADatabaseAt(s.file).id)
    expect(theInstallationThisDatabaseBelongsTo(s.db).id).toBe(theInstallationForADatabaseAt(roundabout).id)
  })

  it('holds exactly one row, whatever anybody tries to write into it', () => {
    const s = scratch('one-row')
    migrateInPlace(s.db, MIGRATIONS)
    expect(() =>
      s.db
        .prepare('INSERT INTO installation (only_row, id, how, written_at) VALUES (2, ?, ?, ?)')
        .run('a-second-installation', 'somebody wrote it by hand', '2026-09-04 12:00:00'),
    ).toThrow()
    const count = s.db.prepare('SELECT COUNT(*) AS n FROM installation').get() as { n: number }
    expect(count.n).toBe(1)
  })
})

/**
 * AND THE DOOR: an agent registered after the migration is a citizen of the world it registers in.
 *
 * `freshDb()` here, not the scratch database above, because this is about `keepTheAgentRegistryInStep`
 * — the door every write of an `agent` record goes through — and that reads the database this
 * process has open.
 */
describe('a registration made in a world is citizenship of that world', () => {
  let t: Awaited<ReturnType<typeof import('./helpers.ts').freshDb>>
  let registry: typeof import('../src/server/lib/participants.ts')
  let world: typeof import('../src/server/lib/world.ts')

  beforeEach(async () => {
    const { freshDb } = await import('./helpers.ts')
    t = await freshDb()
    registry = await import('../src/server/lib/participants.ts')
    world = await import('../src/server/lib/world.ts')
    // The world is held on the process and keyed by the database file, so a test that changed the
    // database has to say the world is worth reading again.
    world.forgetTheWorld()
  })

  afterEach(() => {
    t.close()
  })

  it('makes an agent registered today a citizen of this world, from today', () => {
    const made = t.api.createRecord({
      workspaceId: 'panelx',
      kind: 'agent',
      title: 'Builder AU',
      data: { handle: 'builder-au', runtime: 'claude-code', state: 'active' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })
    const agent = registry.agentForRecord(made.id)
    expect(agent?.homeWorld).toBe(world.theWorldThisDatabaseIs())
    expect(agent?.homeWorld).not.toBeNull()
    expect(agent?.homeInstallation).toBe(world.theInstallationThisDatabaseBelongsTo())
    expect(agent?.citizenSince).not.toBeNull()
    // Registered today, so its citizenship starts today: the same stamp the row was created with.
    expect(agent?.citizenSince).toBe(agent?.createdAt)
  })

  it('gives the same world to the owner and to Mole Office itself, which the migration wrote', () => {
    const here = world.theWorldThisDatabaseIs()
    expect(here).not.toBeNull()
    const owner = registry.readParticipant({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id })
    const moleOffice = registry.readParticipant({ kind: 'agent', id: theOfficesOwnId(t) })
    expect(owner?.homeWorld).toBe(here)
    expect(moleOffice?.homeWorld).toBe(here)
  })
})

/**
 * A ROW ALREADY WRITTEN WITH A PATH IN IT IS PUT RIGHT, AND ITS ID IS NOT TOUCHED.
 *
 * `installation.how` is an exported column. The second citizens verifier wrote a whole-installation
 * archive from a copy of the owner's database and found
 * the database's own path, under the home folder, at `mirror/participants.md` line 231. The
 * derivation was fixed on 4 September, but a row is written once and never rewritten, so nothing was
 * ever going to correct the one already there. Problem `25JDoYvL_lK5`, reopened.
 */
describe('an installation sentence that names this machine is repaired', () => {
  it('takes the path out and leaves the id exactly as it was', () => {
    delete process.env['MOLE_OFFICE_INSTALLATION']
    const s = scratch('repair')
    migrateInPlace(s.db, MIGRATIONS)
    const before = s.db.prepare('SELECT id, how, written_at FROM installation WHERE only_row = 1').get() as {
      id: string
      how: string
      written_at: string
    }
    // THE SENTENCE THE OLD CODE WROTE, written by hand the way it wrote it, with this database's path in it.
    s.db
      .prepare('UPDATE installation SET how = ? WHERE only_row = 1')
      .run(`nothing named this installation, so it is the SHA-256 of the canonical database path ${s.file}, cut to 16 characters`)

    const said = migrateInPlace(s.db, MIGRATIONS).citizenship
    expect(said.installationSentenceRepaired).toBe(1)
    const after = s.db.prepare('SELECT id, how, written_at FROM installation WHERE only_row = 1').get() as {
      id: string
      how: string
      written_at: string
    }
    expect(after.id, 'the identity moved, and it must never move').toBe(before.id)
    expect(after.written_at).toBe(before.written_at)
    expect(after.how).toBe(WHAT_A_REPAIRED_SENTENCE_SAYS)
    expect(after.how).not.toContain('/')
  })

  it('says so in the words the migration prints', () => {
    delete process.env['MOLE_OFFICE_INSTALLATION']
    const s = scratch('repair-said')
    migrateInPlace(s.db, MIGRATIONS)
    s.db.prepare('UPDATE installation SET how = ? WHERE only_row = 1').run(`the SHA-256 of ${THE_TEST_FIXTURE_ROOT}/somewhere.db`)
    const said = describeCitizenship(migrateInPlace(s.db, MIGRATIONS).citizenship)
    expect(said).toContain('rewritten to carry none')
    expect(said).toContain('The id itself is unchanged')
  })

  it('leaves a sentence that carries no path alone, and reports nothing on a second run', () => {
    delete process.env['MOLE_OFFICE_INSTALLATION']
    const s = scratch('repair-twice')
    const first = migrateInPlace(s.db, MIGRATIONS).citizenship
    expect(first.installationSentenceRepaired, 'a freshly written row was repaired').toBe(0)
    s.db.prepare('UPDATE installation SET how = ? WHERE only_row = 1').run(`the SHA-256 of ${THE_TEST_FIXTURE_ROOT}/somewhere.db`)
    expect(migrateInPlace(s.db, MIGRATIONS).citizenship.installationSentenceRepaired).toBe(1)
    expect(migrateInPlace(s.db, MIGRATIONS).citizenship.installationSentenceRepaired, 'it ran twice on one row').toBe(0)
  })

  it('writes a replacement that carries no path, so the repair cannot make the fault again', () => {
    expect(WHAT_A_REPAIRED_SENTENCE_SAYS).not.toContain('/')
  })
})
