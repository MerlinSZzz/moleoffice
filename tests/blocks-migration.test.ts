// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The step-to-block migration, over a database that still stores `data.steps`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The migration had no test. It was verified by hand, on copies, by the agent that wrote it and by
 * three independent reviewers — and one of those reviewers found a real data loss that every hand
 * check had missed: every block was stamped with the migration's own clock.
 *
 * That is not cosmetic. The attention rule scores `stopped_short` work partly by how long it has
 * sat, so a block blocked since 19 July and a block blocked this morning are meant to be different
 * rows. Stamping all of them "now" collapses that to zero, and **nothing in the database can
 * recover the real dates afterwards** — the pipeline's `data.steps` has already been rewritten by
 * the time anybody notices. Six of nine stopped blocks dropped from score 15 or 12 to 5 or 0, in
 * the same minute.
 *
 * A migration is the one piece of code that runs once, against data that cannot be got back if it
 * is wrong. It is therefore the last place that should be checked by hand and the first that should
 * be checked by a test.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY EACH ONE
 * ---------------------------------------------------------------------------------------
 *
 * Each of these is one of the seven risks the audit ranked before the migration was written. They
 * are not a list of what the code happens to do; they are the list of ways this could destroy data.
 *
 * PRESEED REGRESSION (problem bJB5w1_BEUif). Mutation: put './drizzle' back in preseed.mjs.
 * Running the tool outside the checkout must still apply its pending schema migration and seed
 * the four side tables in the disposable database.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Database from 'better-sqlite3'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { migrateBlocks } from '../src/server/db/blocks-migration.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

let dir: string
let file: string
let sqlite: Database.Database

/** The repository's own migration files — the ones `npm run db:migrate` applies. */
const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url))

/**
 * The real schema, built by running the repository's own migration files.
 *
 * IT USED TO BE A HAND-WRITTEN COPY OF THREE TABLES, AND THE COPY DRIFTED. It went a whole campaign
 * without `changes.workspace_id`, which the real table has carried since projects existed, so a
 * migration writing that column passed every test here and failed the moment it met a real
 * database. The comment above it said "anything added to a table this migration writes has to be
 * added here too, and the only thing making that happen is this paragraph" — which is a note asking
 * somebody to remember, and CLAUDE.md says that is not one of the ways to fix a fact written twice.
 *
 * So there is one statement of the schema now and it is `drizzle/`. This runs the schema migrations
 * only — drizzle's own migrator, exactly the call `migrateInPlace` makes before it runs any data
 * step — so the tables are the real tables and no data migration has touched them. It costs about
 * 45 milliseconds per test.
 *
 * WHAT THE COPY WAS ALSO GETTING WRONG, found the moment it was deleted: it declared
 * `records_title_idx` UNIQUE, and the real one is a plain index. So a title collision was refused
 * by SQLite in these tests and has to be refused by `migrateBlocks` itself on a real database. It
 * is: the migration checks for a taken title and reports `title_taken`. The test below now measures
 * the code path a real corpus would meet.
 *
 * `foreign_keys = ON` because db/client.ts sets it on every real connection, and `links` really does
 * carry foreign keys onto `records`.
 */
function schema(db: Database.Database): void {
  db.pragma('foreign_keys = ON')
  migrate(drizzle(db), { migrationsFolder: MIGRATIONS })
}

/** Timestamps deliberately old, so "did it stamp them today" has an answer. */
const PIPELINE_CREATED = '2026-07-19 10:15:00'
const PIPELINE_UPDATED = '2026-07-24 16:45:00'

function seedPipeline(steps: unknown[], title = 'Transplant v2'): string {
  const id = 'pipe-1'
  sqlite
    .prepare(
      `INSERT INTO records (owner_id, id, created_at, updated_at, kind, title, data) VALUES ('${THE_TEST_OFFICES_OWNER.id}', ?,?,?,?,?,?)`,
    )
    .run(id, PIPELINE_CREATED, PIPELINE_UPDATED, 'pipeline', title, JSON.stringify({ steps }))
  return id
}

function addModule(id: string, title: string): void {
  sqlite
    .prepare(`INSERT INTO records (owner_id, id, created_at, updated_at, kind, title, data) VALUES ('${THE_TEST_OFFICES_OWNER.id}', ?,?,?,?,?,?)`)
    .run(id, PIPELINE_CREATED, PIPELINE_UPDATED, 'module', title, '{}')
}

const blocks = () =>
  sqlite.prepare("SELECT * FROM records WHERE kind = 'block' ORDER BY id").all() as {
    id: string
    title: string
    created_at: string
    updated_at: string
    data: string
  }[]

beforeEach(() => {
  dir = aTestDatabaseFolder('blockmig')
  file = join(dir, 'test.db')
  sqlite = new Database(file)
  schema(sqlite)
})

afterEach(() => {
  sqlite.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('the block-migration preseed uses this checkout\'s migrations', () => {
  it('applies a pending migration and seeds its copy when run outside the checkout root', () => {
    const journal = (db: Database.Database) => db.prepare(
      'SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at',
    ).all()
    // THE JOURNAL A FULLY MIGRATED DATABASE HOLDS, read off a second database migrated from this checkout.
    const full = new Database(join(dir, 'full.db'))
    schema(full)
    const expectedJournal = journal(full)
    full.close()

    // LEAVE THE NEWEST SCHEMA MIGRATION REALLY PENDING: this test's database is migrated from a copy of
    // drizzle/ whose journal stops one entry short, so the newest migration has never run on it. The tool
    // then applies it once, as it would on a real copy. Deleting the newest journal row of a fully migrated
    // database instead would ask the tool to run that migration a second time, which fails for any
    // migration that adds a column.
    const shortFolder = join(dir, 'drizzle-one-short')
    cpSync(MIGRATIONS, shortFolder, { recursive: true })
    const journalFile = join(shortFolder, 'meta', '_journal.json')
    const entries = JSON.parse(readFileSync(journalFile, 'utf8')) as { entries: unknown[] }
    entries.entries.pop()
    writeFileSync(journalFile, JSON.stringify(entries))
    sqlite.close()
    rmSync(file, { force: true })
    rmSync(`${file}-wal`, { force: true })
    rmSync(`${file}-shm`, { force: true })
    sqlite = new Database(file)
    sqlite.pragma('foreign_keys = ON')
    migrate(drizzle(sqlite), { migrationsFolder: shortFolder })
    expect(journal(sqlite)).toHaveLength(expectedJournal.length - 1)

    // `owner_id` WRITTEN OUT. The owner migration took its default away, and once a newer migration than that
    // one is the one left pending, this database already has no default to fall back on.
    sqlite.prepare(
      'INSERT INTO records (id, owner_id, created_at, updated_at, kind, title, data) VALUES (?,?,?,?,?,?,?)',
    ).run('preseed-session', THE_TEST_OFFICES_OWNER.id, PIPELINE_CREATED, PIPELINE_UPDATED, 'session', 'Preseed fixture', '{}')

    execFileSync(process.execPath, [
      fileURLToPath(new URL('../tools/blockmig/preseed.mjs', import.meta.url)), file,
    ], { cwd: dir, encoding: 'utf8', timeout: 10_000 })

    expect(journal(sqlite)).toEqual(expectedJournal)
    expect(sqlite.prepare('SELECT target FROM presentation_intent ORDER BY target').pluck().all())
      .toEqual(['step:hv2-04', 'step:hv2-99'])
    expect(sqlite.prepare('SELECT reader FROM reader_anchors').pluck().all()).toEqual([THE_TEST_OFFICES_OWNER.id])
    expect(sqlite.prepare('SELECT id FROM panel_layouts').pluck().all()).toEqual(['home'])
    expect(sqlite.prepare('SELECT session_record_id FROM session_resources').pluck().all())
      .toEqual(['preseed-session'])
  })

  // A MIGRATION BEHIND ONE THE COPY ALREADY HOLDS (wave 13v round 23). The copy lacks the journal's last migration but holds
  // a row whose `when` is later, as a database does when a migration with a later `when` landed first. drizzle's own
  // function decides by date and skipped it without a word; the preseed now applies what is missing, as migrate.ts does.
  it('applies a missing migration whose when is earlier than one the copy already holds', () => {
    const shortFolder = join(dir, 'drizzle-one-short')
    cpSync(MIGRATIONS, shortFolder, { recursive: true })
    const journalFile = join(shortFolder, 'meta', '_journal.json')
    const entries = JSON.parse(readFileSync(journalFile, 'utf8')) as { entries: { when: number, tag: string }[] }
    const missing = entries.entries.pop()!
    writeFileSync(journalFile, JSON.stringify(entries))
    sqlite.close()
    for (const end of ['', '-wal', '-shm']) rmSync(`${file}${end}`, { force: true })
    sqlite = new Database(file)
    sqlite.pragma('foreign_keys = ON')
    migrate(drizzle(sqlite), { migrationsFolder: shortFolder })
    sqlite.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run('a migration with a later when, a stand-in', missing.when + 1)
    sqlite.prepare(
      'INSERT INTO records (id, owner_id, created_at, updated_at, kind, title, data) VALUES (?,?,?,?,?,?,?)',
    ).run('preseed-session', THE_TEST_OFFICES_OWNER.id, PIPELINE_CREATED, PIPELINE_UPDATED, 'session', 'Preseed fixture', '{}')

    execFileSync(process.execPath, [
      fileURLToPath(new URL('../tools/blockmig/preseed.mjs', import.meta.url)), file,
    ], { cwd: dir, encoding: 'utf8', timeout: 10_000 })

    const itsHash = createHash('sha256').update(readFileSync(join(MIGRATIONS, `${missing.tag}.sql`)).toString()).digest('hex')
    expect(sqlite.prepare('SELECT created_at FROM __drizzle_migrations WHERE hash = ?').pluck().all(itsHash)).toEqual([missing.when])
  })
})

// ============================================================ the timestamp, which was the defect

describe('a block keeps the age its work actually has', () => {
  it('inherits its pipeline stamps rather than the migration clock', () => {
    seedPipeline([
      { id: 'hv2-01', name: 'Sense the pot', state: 'done', modules: [] },
      { id: 'hv2-02', name: 'Plan the approach', state: 'blocked', modules: [] },
    ])

    migrateBlocks(null as never, sqlite)

    const made = blocks()
    expect(made).toHaveLength(2)
    for (const block of made) {
      // THE REGRESSION. These were the migration's own `nowStamp()` before, which erased the
      // staleness the attention rule ranks on. There is no recovering it once data.steps is gone.
      expect(block.created_at, `${block.title} created_at`).toBe(PIPELINE_CREATED)
      expect(block.updated_at, `${block.title} updated_at`).toBe(PIPELINE_UPDATED)
    }
  })

  it('does not stamp a block with today', () => {
    // Stated separately and in the terms a person would notice it in: after migrating a database
    // whose newest edit was in July, nothing should look like it was touched this minute.
    seedPipeline([{ id: 'hv2-01', name: 'Sense the pot', state: 'failed', modules: [] }])
    migrateBlocks(null as never, sqlite)

    const today = new Date().toISOString().slice(0, 10)
    for (const block of blocks()) {
      expect(block.updated_at.startsWith(today), `${block.title} was stamped today`).toBe(false)
    }
  })
})

// ============================================================ where its rows are filed

describe('the change rows this migration writes', () => {
  it('files each one under the project of the record it is about', () => {
    // These rows used to be written with no project at all and stamped by a later pass in the same
    // command, so running this migration on its own left rows the daily page filters out — it
    // selects by project, and nothing is not a project. The column is derived in the statement now.
    sqlite.prepare("UPDATE records SET workspace_id = 'robotics' WHERE 1 = 1").run()
    seedPipeline([{ id: 'hv2-01', name: 'Sense the pot', state: 'done', modules: [] }])
    sqlite.prepare("UPDATE records SET workspace_id = 'robotics' WHERE 1 = 1").run()

    migrateBlocks(null as never, sqlite)

    const rows = sqlite.prepare('SELECT record_id, workspace_id FROM changes').all() as {
      record_id: string
      workspace_id: string | null
    }[]
    expect(rows.length, 'the migration wrote no change rows, so this test proves nothing').toBeGreaterThan(0)
    // 'robotics' rather than 'default', because a constant would pass a test written in the project
    // every other test here uses.
    for (const row of rows) {
      expect(row.workspace_id, `the change row about ${row.record_id} is filed under the wrong project`).toBe('robotics')
    }
  })
})

// ============================================================ identity

describe('identity survives, because the history depends on it', () => {
  it('uses the author-written step id as the block record id, verbatim', () => {
    // Risk 1 of the seven. A step's history is `field='data.steps'` rows holding the whole array;
    // nothing in such a row identifies a step except the ids inside the JSON. Renumber them and
    // "what happened to hv2-04" is unanswerable from anything, which is the point of B5.
    seedPipeline([
      { id: 'hv2-04', name: 'Plan the approach', state: 'blocked', modules: [] },
      { id: '夹爪-01', name: '重印 v3', state: 'todo', modules: [] },
    ])
    migrateBlocks(null as never, sqlite)
    expect(blocks().map((b) => b.id).sort()).toEqual(['hv2-04', '夹爪-01'].sort())
  })

  it('refuses the whole migration when two steps share one id', () => {
    // Risk 3. Merging two blocks into one is silent and permanent, so it must not proceed at all.
    seedPipeline([
      { id: 'dup', name: 'One', state: 'todo', modules: [] },
      { id: 'dup', name: 'Another', state: 'todo', modules: [] },
    ])
    expect(() => migrateBlocks(null as never, sqlite)).toThrow(/dup/)
    expect(blocks(), 'nothing may be written when it refuses').toHaveLength(0)
  })

  it('refuses when a step id is already some other record id', () => {
    addModule('hv2-01', 'A module that got there first')
    seedPipeline([{ id: 'hv2-01', name: 'Sense the pot', state: 'todo', modules: [] }])
    expect(() => migrateBlocks(null as never, sqlite)).toThrow()
    expect(blocks()).toHaveLength(0)
  })
})

// ============================================================ titles

describe('a block title is qualified by its pipeline', () => {
  it('is "<pipeline> › <step>"', () => {
    seedPipeline([{ id: 'hv2-01', name: 'Sense the pot', state: 'todo', modules: [] }])
    migrateBlocks(null as never, sqlite)
    expect(blocks()[0]?.title).toBe('Transplant v2 › Sense the pot')
  })

  it('refuses rather than colliding with a title that already exists', () => {
    // Risk 5. Two records in one project sharing a title cannot be told apart by the browser's own
    // address bar or by anything a person types, and a half-applied migration is worse than one
    // that did not run. `records_title_idx` is a plain index rather than a unique one, so nothing in
    // SQLite stops this: the refusal has to come from the migration, and it does.
    addModule('mod-1', 'Transplant v2 › Sense the pot')
    seedPipeline([{ id: 'hv2-01', name: 'Sense the pot', state: 'todo', modules: [] }])
    expect(() => migrateBlocks(null as never, sqlite)).toThrow()
    expect(blocks()).toHaveLength(0)
  })
})

// ============================================================ the mapping

describe('the many-to-many mapping survives', () => {
  it('turns modules[] titles into links, and reports a title naming nothing', () => {
    // Risk 4. Dropping it loses recorded work; inventing the module invents an owner, which the
    // brief forbids. So it is applied AND reported.
    addModule('mod-a', 'LeafCam 2 overhead camera')
    seedPipeline([
      { id: 's1', name: 'Sense', state: 'done', modules: ['LeafCam 2 overhead camera', 'A module nobody filed'] },
    ])

    const report = migrateBlocks(null as never, sqlite)

    const links = sqlite.prepare("SELECT * FROM links WHERE type = 'implements'").all() as { from_id: string; to_id: string }[]
    expect(links).toHaveLength(1)
    expect(links[0]?.from_id).toBe('mod-a')
    expect(links[0]?.to_id).toBe('s1')
    expect(report.notes.some((n) => n.kind === 'module_not_found' && n.detail.includes('A module nobody filed'))).toBe(true)
  })

  it('keeps a block carried by nobody as a block carried by nobody', () => {
    // The rule the owner raised: a step carried by no module is a real answer meaning
    // nobody owns it yet, not a gap to fill in.
    seedPipeline([{ id: 's1', name: 'Decide to let go', state: 'todo', modules: [] }])
    migrateBlocks(null as never, sqlite)
    expect(sqlite.prepare("SELECT count(*) AS n FROM links WHERE type='implements'").get()).toEqual({ n: 0 })
    expect(blocks()).toHaveLength(1)
  })
})

// ============================================================ running it twice

describe('safe to run twice', () => {
  it('plans nothing the second time', () => {
    seedPipeline([{ id: 's1', name: 'Sense', state: 'done', modules: [] }])
    migrateBlocks(null as never, sqlite)
    const after = blocks()

    const second = migrateBlocks(null as never, sqlite)
    expect(second.alreadyDone).toBe(true)
    expect(second.blocks).toBe(0)
    expect(blocks()).toEqual(after)
  })
})

// ============================================================ blockIds that are already there

/**
 * A pipeline that ALREADY holds `blockIds` when the migration reaches it.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT, AND WHY IT WAS THE WORST ONE AN OUTSIDE ATTACK FOUND
 * ---------------------------------------------------------------------------------------
 *
 * The plan phase used to write `nextData['blockIds'] = blocks.map(…)` without ever READING the
 * `blockIds` the pipeline was holding. A pipeline storing `steps: []` beside nine live `blockIds`
 * came out of `npm run db:migrate` holding zero, its nine block records orphaned, and nothing could
 * tell you: the row-count guard in migrate.ts compares whole tables and the loss is inside a JSON
 * column, so records, links and changes all matched, and the command exited 0 saying it had nothing
 * to do. `blockIds` is the only statement of both membership and order, so an emptied one is the
 * pipeline.
 *
 * Reaching that state takes a half-finished hand edit — which is precisely what somebody repairing a
 * pre-block pipeline does, because the API refuses the key `steps` outright and editing `data` is
 * the obvious way round it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY ONE CASE IS APPLIED AND THE OTHER REFUSED
 * ---------------------------------------------------------------------------------------
 *
 * When `steps` yields no blocks the pipeline is already migrated and there is nothing to guess: the
 * held ids stay exactly as they are and the stale key goes. When both lists have content, where the
 * new blocks belong in the ORDER is a statement only their author can make — order here is content,
 * not a sort — so it refuses and writes nothing at all, in the same voice as every other thing this
 * migration will not guess at.
 */
describe('a pipeline that already holds blockIds', () => {
  /** A pipeline whose `data` is written out in full, rather than only its steps. */
  function seedPipelineData(id: string, title: string, data: Record<string, unknown>): void {
    sqlite
      .prepare(`INSERT INTO records (owner_id, id, created_at, updated_at, kind, title, data) VALUES ('${THE_TEST_OFFICES_OWNER.id}', ?,?,?,?,?,?)`)
      .run(id, PIPELINE_CREATED, PIPELINE_UPDATED, 'pipeline', title, JSON.stringify(data))
  }

  function addBlock(id: string, title: string): void {
    sqlite
      .prepare(`INSERT INTO records (owner_id, id, created_at, updated_at, kind, title, data) VALUES ('${THE_TEST_OFFICES_OWNER.id}', ?,?,?,?,?,?)`)
      .run(id, PIPELINE_CREATED, PIPELINE_UPDATED, 'block', title, JSON.stringify({ state: 'todo' }))
  }

  const dataOf = (id: string): Record<string, unknown> =>
    JSON.parse(
      (sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data,
    ) as Record<string, unknown>

  it('keeps every held blockId when an empty steps key is all that is left', () => {
    // THE LOSS, REPRODUCED. Three blocks, an empty `steps` beside them, and the migration used to
    // come back with `blockIds: []` and three orphaned records.
    //
    // THE EMPTY `steps` KEY IS THE WHOLE FIXTURE and it must not be dropped from this test. A
    // pipeline with no `steps` key at all is skipped in one line at the top of the plan phase and
    // never reaches the code this is about, so a version of this test without it passes against the
    // defect. It did, once, for about ten minutes.
    for (const n of [1, 2, 3]) addBlock(`blk-${n}`, `Transplant v2 › Step ${n}`)
    seedPipelineData('pipe-held', 'Transplant v2', {
      blockIds: ['blk-1', 'blk-2', 'blk-3'],
      steps: [],
      consequence: { bearer: THE_TEST_OFFICES_OWNER.id, what: 'the handover stops' },
    })

    migrateBlocks(null as never, sqlite)

    const data = dataOf('pipe-held')
    expect(data['blockIds'], 'the held blocks were thrown away').toEqual(['blk-1', 'blk-2', 'blk-3'])
    // The stale key goes, which is the only thing there was to do here.
    expect('steps' in data).toBe(false)
    // And nothing else in `data` was disturbed on the way past.
    expect(data['consequence']).toEqual({ bearer: THE_TEST_OFFICES_OWNER.id, what: 'the handover stops' })
  })

  it('reports no gate as prose when it planned no blocks at all', () => {
    // The report is the whole product of such a run, and it used to be wrong in it. A pipeline with
    // `steps: []` is PLANNED with zero blocks, so the old `plan.length === 0` guard did not fire and
    // every gate in the workspace was classified against nothing — on a copy of the live database
    // that called four live block records "a stage named in words".
    addBlock('blk-1', 'Transplant v2 › Step 1')
    seedPipelineData('pipe-held', 'Transplant v2', { blockIds: ['blk-1'], steps: [] })
    sqlite
      .prepare(
        `INSERT INTO links (owner_id, created_by, id, created_at, updated_at, from_id, to_id, type, gate, gate_up_to) VALUES ('${THE_TEST_OFFICES_OWNER.id}', '${THE_TEST_OFFICES_OWNER.id}', ?,?,?,?,?,?,?,?)`,
      )
      .run('link-1', PIPELINE_CREATED, PIPELINE_UPDATED, 'blk-1', 'pipe-held', 'blocks', 'partial', 'blk-1')

    const report = migrateBlocks(null as never, sqlite)

    expect(report.notes.filter((n) => n.kind === 'gate_prose')).toEqual([])
    expect(dataOf('pipe-held')['blockIds']).toEqual(['blk-1'])
  })

  it('refuses, and writes nothing, when it holds blocks AND still stores real steps', () => {
    addBlock('blk-1', 'Transplant v2 › Step 1')
    seedPipelineData('pipe-half', 'Transplant v2', {
      blockIds: ['blk-1'],
      steps: [{ id: 'half-moved', name: 'A step the hand edit did not reach', state: 'todo', modules: [] }],
    })

    // The message has to name the pipeline and both halves, because the person reading it has to
    // decide where that step belongs in the order and nothing else can tell them.
    expect(() => migrateBlocks(null as never, sqlite)).toThrow(/half-moved/)
    expect(() => migrateBlocks(null as never, sqlite)).toThrow(/Transplant v2/)

    const data = dataOf('pipe-half')
    expect(data['blockIds'], 'a refusal must write nothing').toEqual(['blk-1'])
    expect(data['steps']).toHaveLength(1)
    expect(blocks().map((b) => b.id), 'no block record may be created by a refused run').toEqual(['blk-1'])
  })

  it('surfaces that refusal even when it is the only pipeline with steps left', () => {
    // The refusal is recorded before the pipeline reaches the plan, so on a corpus where this is the
    // only pipeline still holding `steps` the plan is EMPTY — and the empty-plan return used to come
    // first and drop every refusal on the floor, printing "nothing to migrate" and exiting 0. In the
    // exact case this refusal exists for, it would have said nothing at all.
    addBlock('blk-1', 'Transplant v2 › Step 1')
    seedPipelineData('pipe-half', 'Transplant v2', {
      blockIds: ['blk-1'],
      steps: [{ id: 'half-moved', name: 'A step the hand edit did not reach', state: 'todo', modules: [] }],
    })
    seedPipelineData('pipe-done', 'Model-to-bench growth check', { blockIds: [] })

    expect(() => migrateBlocks(null as never, sqlite)).toThrow(/NOTHING has been written/)
  })

  it('builds blockIds from the steps when the pipeline holds none, which is the ordinary run', () => {
    // The case that was always right, kept beside the two that were not, so a fix to those cannot
    // quietly change what happens on every real database.
    seedPipeline([
      { id: 's1', name: 'Sense', state: 'done', modules: [] },
      { id: 's2', name: 'Plan', state: 'todo', modules: [] },
    ])
    migrateBlocks(null as never, sqlite)
    expect(dataOf('pipe-1')['blockIds']).toEqual(['s1', 's2'])
  })
})

// ============================================================ the history, which is the whole point

/**
 * DECISION 1 IN design/stages-audit/DECISIONS.md: a block gets its OWN change history, so
 * `changes.record_id` points at the block and the migration rewrites the existing rows.
 *
 * WHY THIS WAS ADDED LATE, AND IT IS THE REASON TO KEEP IT. The migration was run against a copy of
 * the live corpus on 2026-08-10 and reported `0 change rows re-filed` — correctly, because that
 * corpus stores every pipeline edit as `field='data'` holding the whole record and has not one
 * `field='data.steps'` row in it. So the branch that carries the decision was exercised by neither
 * the data nor the tests: the only thing that had ever run it was a hand check on a hand-made file,
 * and the last defect this file found had survived four of those.
 *
 * B5's sentence is "without this, comparing versions is impossible, not merely missing", and version
 * comparison over blocks is exactly reading these rows. A migration that silently filed them wrong
 * would leave the feature built and its purpose unreachable, with nothing left to notice it from
 * once `data.steps` had been rewritten.
 */
describe('a block gets its own history, from the pipeline rows that held it', () => {
  /** One `data.steps` row, exactly as the old write path stored it: the whole array on both sides. */
  function seedStepChange(before: unknown[], after: unknown[], at = '2026-07-21 09:30:00'): string {
    const id = 'chg-1'
    sqlite
      .prepare(
        'INSERT INTO changes (id, record_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at) ' +
          'VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        'pipe-1',
        'update',
        'agent',
        'claude-code',
        'sess-42',
        'data.steps',
        JSON.stringify(before),
        JSON.stringify(after),
        at,
      )
    return id
  }

  const changesFor = (recordId: string) =>
    sqlite.prepare('SELECT * FROM changes WHERE record_id = ? ORDER BY id').all(recordId) as {
      id: string
      op: string
      actor_type: string
      actor_id: string
      session_id: string | null
      field: string | null
      old_value: string | null
      new_value: string | null
      at: string
    }[]

  it('files one row under each block that really changed, and none under the ones that did not', () => {
    const one = { id: 'hv2-01', name: 'Sense the pot', state: 'doing', modules: [] }
    const twoBefore = { id: 'hv2-02', name: 'Plan the approach', state: 'todo', modules: [] }
    const twoAfter = { id: 'hv2-02', name: 'Plan the approach', state: 'blocked', modules: [] }
    seedPipeline([one, twoAfter])
    seedStepChange([one, twoBefore], [one, twoAfter])

    const report = migrateBlocks(null as never, sqlite)
    expect(report.changeRowsRefiled).toBe(1)

    // Every block also gets a `create` row from the migration itself, so its history starts where
    // the block does. That one is filtered out here: this test is about the RE-FILED rows, and both
    // halves are asserted rather than one being allowed to stand for the other.
    const created = changesFor('hv2-02').filter((r) => r.op === 'create')
    expect(created, 'the block has its own create row').toHaveLength(1)
    expect(created[0]?.actor_id).toBe('block-migration')

    // The block that moved has its own row, carrying the ORIGINAL actor, session and stamp. A row
    // re-filed under the migration's own actor or clock would say a robot did this today, which is
    // the same class of loss as the timestamp defect at the top of this file.
    const moved = changesFor('hv2-02').filter((r) => r.op !== 'create')
    expect(moved).toHaveLength(1)
    const [row] = moved
    expect(row?.field).toBe('data')
    expect(row?.actor_type).toBe('agent')
    expect(row?.actor_id).toBe('claude-code')
    expect(row?.session_id).toBe('sess-42')
    expect(row?.at).toBe('2026-07-21 09:30:00')
    expect(JSON.parse(String(row?.old_value))).toEqual(twoBefore)
    expect(JSON.parse(String(row?.new_value))).toEqual(twoAfter)

    // The block that did not move gets nothing beyond its own create row. One stored edit is as
    // many facts as the array has steps that differ, and filing a no-op under a block would make
    // its history a list of times somebody edited a sibling.
    expect(changesFor('hv2-01').filter((r) => r.op !== 'create')).toHaveLength(0)
  })

  it('rewrites the original row to be about the pipeline, which is the part of it that was', () => {
    const one = { id: 'hv2-01', name: 'Sense the pot', state: 'done', modules: [] }
    const two = { id: 'hv2-02', name: 'Plan the approach', state: 'todo', modules: [] }
    seedPipeline([one, two])
    seedStepChange([one], [one, two])

    migrateBlocks(null as never, sqlite)

    // `data.steps` no longer exists as a field, so a row still claiming it would be a row about a
    // shape the product cannot read. What the row really recorded about the PIPELINE is the order.
    const onPipeline = changesFor('pipe-1').filter((r) => r.id === 'chg-1')
    expect(onPipeline).toHaveLength(1)
    const [row] = onPipeline
    expect(row?.field).toBe('data.blockIds')
    expect(JSON.parse(String(row?.old_value))).toEqual(['hv2-01'])
    expect(JSON.parse(String(row?.new_value))).toEqual(['hv2-01', 'hv2-02'])
    expect(sqlite.prepare("SELECT count(*) FROM changes WHERE field = 'data.steps'").pluck().get()).toBe(0)
  })

  it('leaves a row naming a step no block was made for exactly where it is, and says so', () => {
    // Risk 2 of the seven, in the change log rather than in a gate. A step deleted before the
    // migration ran has no block to file its history under, and the row is the only record it ever
    // existed. Splitting it would file half under a block and lose the half about the missing step;
    // inventing a block for it would invent work nobody did.
    const kept = { id: 'hv2-01', name: 'Sense the pot', state: 'done', modules: [] }
    const gone = { id: 'hv2-99', name: 'A step somebody removed', state: 'todo', modules: [] }
    seedPipeline([kept])
    seedStepChange([kept, gone], [kept])

    const report = migrateBlocks(null as never, sqlite)
    expect(report.changeRowsRefiled).toBe(0)

    const [row] = changesFor('pipe-1').filter((r) => r.id === 'chg-1')
    expect(row?.field, 'the row was left exactly as it was').toBe('data.steps')
    expect(JSON.parse(String(row?.old_value))).toEqual([kept, gone])

    // REPORTED, never dropped. A migration that quietly declined to move something is a migration
    // whose output nobody can check.
    const said = report.notes.filter((n) => n.kind === 'history_left_on_pipeline')
    expect(said).toHaveLength(1)
    expect(said[0]?.detail).toContain('hv2-99')
  })
})
