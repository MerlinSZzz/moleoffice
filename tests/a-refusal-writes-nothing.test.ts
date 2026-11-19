// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHEN `npm run db:migrate` REFUSES AND SAYS "NOTHING WAS WRITTEN", NOTHING WAS WRITTEN.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * `migrateInPlace` runs sixteen data steps. Each one used to be its own transaction, so a step that
 * refused left every step above it committed. An independent verifier ran the command against a
 * copy of the owner's corpus whose project held no repository. The module-claims step — the
 * fourteenth of sixteen — refused with *"Nothing was written, because this migration will not
 * decide which repository a claim is relative to"*, and by then 362 rows had been written:
 * `changes` 2107 -> 2288, `revisions` 788 -> 969, and the `records` and `agent_messages` digests
 * had both moved.
 *
 * That sentence was true of the step and false of the command. It is also the sentence an operator
 * reads while deciding whether to restore a backup, which is the one place where believing a false
 * reassurance costs a corpus.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY IT IS THE ROW COUNTS AND NOT THE WORDS
 * ---------------------------------------------------------------------------------------
 *
 * A test that only read the message would pass on any wording. A test that only counted rows would
 * pass on a command that refuses and says nothing. So the two are tied together: EVERY TABLE IS
 * COUNTED BEFORE AND AFTER, and the moment the message claims nothing was written, every one of
 * those counts has to be the same number. Either half moving on its own turns this red.
 *
 * The tables are read out of `sqlite_master`, not listed here. A migration that adds a table and
 * writes rows into it during a refused run would otherwise be invisible to this file for ever.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { MIGRATIONS, oneMigrationBehind, theNewestMigration } from './an-office-one-migration-behind.ts'
import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { migrateInPlace } from '../src/server/db/migrate.ts'
import { THE_MIGRATION_JOURNAL_TABLE } from '../src/config/migration-look.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'


const open: { dir: string; db: Database.Database }[] = []

afterEach(() => {
  while (open.length > 0) {
    const one = open.pop()
    if (one === undefined) continue
    one.db.close()
    rmSync(one.dir, { recursive: true, force: true })
  }
})

/** A migrated database on disk, thrown away after the test. The real command builds it. */
function scratch(name: string): Database.Database {
  const dir = aTestDatabaseFolder(name)
  const db = new Database(join(dir, 'panelx.db'))
  migrateInPlace(db, MIGRATIONS)
  open.push({ dir, db })
  return db
}

/** Every table in the file, with how many rows it holds. Read from the file, never listed here. */
function countEveryTable(db: Database.Database): Record<string, number> {
  const tables = (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]
  ).map((row) => row.name)
  const counts: Record<string, number> = {}
  for (const table of tables) {
    const row = db.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number } | undefined
    if (row === undefined) throw new Error(`counting ${table} returned nothing`)
    counts[table] = Number(row.n)
  }
  return counts
}

/**
 * A corpus the module-claims step REFUSES, and that every step above it has work to do on.
 *
 * The refusal is `planModuleClaims` finding a project that holds modules with `data.claims` and no
 * registered repository: a claim is written relative to a repository root and the corpus never said
 * which root, so the step will not pick one. That is the fourteenth step of sixteen.
 *
 * The records are written straight into the tables, because this is a test about a migration and
 * the write path this corpus came from does not exist any more — `data.claims` is refused by
 * `KIND_SPECS.module` now, which is the whole reason the migration exists.
 */
function aCorpusThatRefuses(db: Database.Database): void {
  const at = '2026-08-20 09:00:00'
  const insert = db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  insert.run(
    'refusemodule1',
    'default',
    THE_TEST_OFFICES_OWNER.id,
    at,
    at,
    'module',
    'Tray clamp control',
    'The module whose claims have nowhere to go.',
    JSON.stringify({ context: 'the hand', claims: ['src/gripper', 'tests/gripper.test.ts'] }),
  )
  // A second record, so the steps above the refusal have more than one row to work on and the
  // revision ledger really does have something to write.
  insert.run(
    'refusenote111',
    'default',
    THE_TEST_OFFICES_OWNER.id,
    at,
    at,
    'note',
    'What the gripper module is for',
    'Something for the ledger pass to take a baseline of.',
    JSON.stringify({ body: 'A note, so the corpus is not one record.' }),
  )
}

describe('a refusal in the middle of the command leaves the file with the rows it had', () => {
  it('says nothing was written, and nothing was written', () => {
    const db = scratch('refusal')
    aCorpusThatRefuses(db)
    const before = countEveryTable(db)

    let said: string | null = null
    try {
      migrateInPlace(db, MIGRATIONS)
    } catch (err) {
      said = err instanceof Error ? err.message : String(err)
    }

    // THE CONTROL FOR THIS FILE. If the command stopped refusing, every assertion below would pass
    // over a run that never happened, which is the failure this whole suite is built to rule out.
    expect(said, 'the module-claims step was expected to refuse this corpus and it did not').not.toBeNull()
    expect(said).toContain('will not decide which repository a claim is relative to')

    const after = countEveryTable(db)

    // THE TWO HALVES, TIED TOGETHER, AND THE WORDING IS THE STEP'S OWN. "Nothing was written" is
    // what `module-claims.ts` has always said and what this repair did not touch. So this assertion
    // is about the DISAGREEMENT between that sentence and the file, not about any new wording: it
    // was red before the transaction existed and it stays red the day anything reopens the gap.
    expect(said, 'the refusal is the sentence this test is about').toMatch(/Nothing was written/i)
    const moved = Object.keys(after).filter((table) => after[table] !== before[table])
    expect(
      moved.map((table) => `${table} ${String(before[table])} -> ${String(after[table])}`),
      'the refusal says nothing was written and these tables disagree with it',
    ).toEqual([])
  })

  it('says out loud that it was the whole command and not only the step that wrote nothing', () => {
    const db = scratch('refusal-whole')
    aCorpusThatRefuses(db)
    let said = ''
    try {
      migrateInPlace(db, MIGRATIONS)
    } catch (err) {
      said = err instanceof Error ? err.message : String(err)
    }
    // A reader of the step's own sentence cannot tell whether it is about the step or the command.
    // The command answers that question itself rather than leaving it to be worked out.
    expect(said).toContain('NOTHING WAS WRITTEN BY ANY STEP OF THIS COMMAND')
  })

  it('rolls the schema migrations back with the data, so the next try applies them once', () => {
    // An office one migration behind, so the refused run has a schema migration of its own to roll back.
    const dir = aTestDatabaseFolder('refusal-schema')
    const db = new Database(join(dir, 'panelx.db'))
    open.push({ dir, db })
    migrateInPlace(db, oneMigrationBehind(dir))
    aCorpusThatRefuses(db)
    const newest = theNewestMigration()
    const journaled = (): number =>
      (db.prepare(`SELECT count(*) AS n FROM "${THE_MIGRATION_JOURNAL_TABLE}" WHERE hash = ?`).get(newest) as { n: number }).n
    const schema = (): string =>
      (db.prepare("SELECT group_concat(sql, ';') AS s FROM (SELECT sql FROM sqlite_master ORDER BY name)").get() as { s: string }).s
    const schemaBefore = schema()

    let said = ''
    try {
      migrateInPlace(db, MIGRATIONS)
    } catch (err) {
      said = err instanceof Error ? err.message : String(err)
    }
    // THE CONTROL: the run refused, so what follows is about a refused run.
    expect(said).toContain('will not decide which repository a claim is relative to')
    // Until 10 October 2026 the schema half was kept and journaled, and the message said so. Now neither is kept.
    expect(said).not.toContain('The schema migrations are the one exception')
    expect(said).toContain('The schema migrations and every data migration ran inside one transaction')
    expect(journaled(), 'the refused run journaled the newest migration').toBe(0)
    expect(schema(), 'the refused run left a schema change behind').toBe(schemaBefore)

    // The next try, with what the refusal asked for, applies the newest migration exactly once.
    const at = '2026-08-20 09:00:00'
    db.prepare(
      'INSERT INTO repositories (id, workspace_id, name, note, root, created_at, updated_at, created_by) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('refuserepo12', 'default', 'panelx', null, null, at, at, `human:${THE_TEST_OFFICES_OWNER.id}`)
    const outcome = migrateInPlace(db, MIGRATIONS)
    expect(outcome.newlyApplied).toBe(1)
    expect(journaled()).toBe(1)
  })

  it('still finishes and reports when the same corpus is given the repository it was asking for', () => {
    const db = scratch('refusal-answered')
    aCorpusThatRefuses(db)
    const at = '2026-08-20 09:00:00'
    db.prepare(
      'INSERT INTO repositories (id, workspace_id, name, note, root, created_at, updated_at, created_by) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('refuserepo11', 'default', 'panelx', null, null, at, at, `human:${THE_TEST_OFFICES_OWNER.id}`)

    const outcome = migrateInPlace(db, MIGRATIONS)
    // The claims moved, which is what makes the refusal above a refusal about this corpus rather
    // than a refusal the command makes whatever it is given.
    expect(outcome.moduleClaims.rows).toBe(2)
    const after = countEveryTable(db)
    expect(after['implementation_map']).toBe(2)
  })
})
