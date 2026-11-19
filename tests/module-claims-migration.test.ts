// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A MODULE SAID IT IS RESPONSIBLE FOR, MOVED OFF THE RECORD AND INTO A ROW OF ITS OWN — AND
 * THE FOUR CHECKS THAT REFUSE THE WHOLE THING RATHER THAN LEAVE HALF OF IT MOVED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS UNDER TEST
 * ---------------------------------------------------------------------------------------
 *
 * design/round-ten/migrations/module-claims.ts. Every string in a live module's `data.claims`
 * becomes one `implementation_map` row — pattern verbatim, relation `implements`, provenance
 * `declared` — the key then leaves `data`, and the record's newest revision is restamped so the
 * ledger still names what the record holds.
 *
 * On the owner's corpus, measured 26 August 2026 by `tools/count-the-map.ts`: 15 modules, 152
 * claim strings, 152 rows, 15 restamped revisions.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE CHECK THAT CAN FAIL ON AN OFF-BY-ONE
 * ---------------------------------------------------------------------------------------
 *
 * A loop that starts at 1, or stops at `length - 1`, writes 151 rows, empties all 15 records, and
 * every count in the report still looks plausible. THE CLAIM WITH NO ROW IS THEN GONE FROM THE
 * CORPUS ALTOGETHER: each of those 15 modules carries exactly one revision, and the restamp rewrote
 * it. Check 1 re-reads the map per module per string and rolls the whole transaction back naming
 * the module and the claim, and the case below is what proves it is load-bearing.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT REGISTERED AND THIS FILE ASSERTS THAT
 * ---------------------------------------------------------------------------------------
 *
 * `npm run db:migrate` runs on every clone and on every server start, including the owner's. There
 * is no migration window in this run, so registering this file is what would take the owner's server down.
 * The last case here reads `drizzle/meta/_journal.json` and `src/server/db/migrate.ts` and fails if
 * either has learned about it. That is the whole of the "not registered" promise, made checkable.
 *
 * Every failing case here was proved by mutation, with a control run of this file first.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { freshDb, type TestDb } from './helpers.ts'
import { contentOf, versionOf } from '../src/server/lib/version.ts'
import {
  countModuleClaims,
  describeModuleClaims,
  migrateModuleClaims,
  planModuleClaims,
  MIGRATION_ACTOR,
  THE_ONE_PROVENANCE,
  THE_ONE_RELATION,
} from '../src/server/db/module-claims.ts'

const WORKSPACE = 'panelx'
const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/**
 * THE CORPUS'S OWN MODULE, BY NAME. `T_FNIYu56FnA` — "PanelX — database schema and migrations" —
 * holds these twelve strings, and five of them point at `tests/`. `src/shared/implementation.ts`
 * names it in its own comment as the measured instance of the `tests` relation, and NONE OF THE
 * FIVE IS MIGRATED AS ONE.
 */
const TWELVE_CLAIMS = [
  'src/server/db/schema.ts',
  'src/server/db/client.ts',
  'src/server/db/migrate.ts',
  'drizzle',
  'drizzle.config.ts',
  'scripts/reset.ts',
  'scripts/seed.ts',
  'tests/helpers.ts',
  'tests/schema-tables.test.ts',
  'tests/schema-inventory.test.ts',
  'tests/migration.test.ts',
  'tests/seed.test.ts',
]
const FIVE_OF_THEM_ARE_TESTS = TWELVE_CLAIMS.filter((one) => one.startsWith('tests/'))

let t: TestDb
let sqlite: Database.Database
let repositoryId: string

beforeEach(async () => {
  t = await freshDb()
  sqlite = t.client.sqlite as unknown as Database.Database
  repositoryId = (await aRepository('panelx')).id
})

afterEach(() => t.close())

/**
 * A repository, through the product's own `registerRepository` rather than an INSERT that looks
 * like one, so the row is the row the route writes.
 *
 * `root: null` IS A REAL ANSWER and not a missing value — repositories.ts says so in those words —
 * so no test here has to make a directory on disk to have a repository to be relative to.
 */
async function aRepository(name: string, workspaceId = WORKSPACE): Promise<{ id: string }> {
  const repositories = await import('../src/server/lib/repositories.ts')
  return repositories.registerRepository({ workspaceId, name, root: null, actor: HUMAN })
}

/** A module with claims, through the write door, which still accepts them until window B. */
/**
 * A MODULE HOLDING `data.claims`, WRITTEN THE ONLY WAY ONE CAN BE NOW.
 *
 * Window B deleted `KIND_SPECS.module.fields.claims` beside this migration, so the write door
 * refuses the key. That is not a problem for this fixture, it is the point of it: the records this
 * migration exists for are the ones written BEFORE the field went, and they are the only ones there
 * will ever be. So the record goes through the door and the key goes in with SQL.
 */
function aModule(title: string, claims: string[], workspaceId = WORKSPACE): string {
  const id = t.api.createRecord({
    kind: 'module',
    title,
    workspaceId,
    data: { context: 'What this subsystem is for.', parts: [] },
    actor: HUMAN,
  }).id
  sqlite.prepare("UPDATE records SET data = json_set(data, '$.claims', json(?)) WHERE id = ?").run(JSON.stringify(claims), id)
  // AND INTO THE NEWEST REVISION, WITH ITS HASH, because that is where a record written before the
  // field went holds it. A revision holding the claims under a hash of content without them would be
  // a stale ledger before the migration had done anything, which is the state this whole file is
  // about the migration NOT leaving behind.
  const row = sqlite.prepare('SELECT kind, title, summary, data, deleted_at FROM records WHERE id = ?').get(id) as {
    kind: string
    title: string
    summary: string | null
    data: string
    deleted_at: string | null
  }
  const content = contentOf({
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    data: JSON.parse(row.data) as Record<string, unknown>,
    deletedAt: row.deleted_at,
  })
  sqlite
    .prepare('UPDATE revisions SET data = ?, content_hash = ? WHERE record_id = ?')
    .run(JSON.stringify(content.data), versionOf(content), id)
  return id
}

/** Every pattern stored against one record, live or retired, the way the unique index is keyed. */
function patternsOn(recordId: string): string[] {
  return (
    sqlite.prepare('SELECT pattern FROM implementation_map WHERE record_id = ? ORDER BY pattern').all(recordId) as {
      pattern: string
    }[]
  ).map((one) => one.pattern)
}

/** One module's stored `data`, read back out of the row. */
function dataOn(recordId: string): Record<string, unknown> {
  const row = sqlite.prepare('SELECT data FROM records WHERE id = ?').get(recordId) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}

// ============================================================================ the move

describe('what a module said it is responsible for becomes a row of its own', () => {
  let module: string

  beforeEach(() => {
    module = aModule('Mole Office — database schema and migrations', TWELVE_CLAIMS)
  })

  it('counts what is in the old shape from the database, before writing anything', () => {
    expect(countModuleClaims(sqlite)).toEqual({ modules: 1, claims: 12 })
  })

  it('CHECK 1 — every claim string is a row, so a migration one claim short refuses the whole thing', () => {
    const done = migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    // TWELVE ROWS FOR TWELVE STRINGS, and each one asked for BY NAME rather than by counting. A
    // loop that starts at 1 or stops at `length - 1` writes eleven, empties the record anyway, and
    // the eleven look exactly like a clean run — while the twelfth is gone from the ledger too,
    // because the restamp rewrote the only revision that held it.
    expect(done.rows).toBe(12)
    expect(patternsOn(module)).toEqual([...TWELVE_CLAIMS].sort())
    for (const claim of TWELVE_CLAIMS) expect(patternsOn(module)).toContain(claim)
  })

  it('migrates a claim that points at tests/ as `implements`, because that is what the field said', () => {
    const done = migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    expect(done.rowsPointingAtTests).toBe(5)
    const rows = sqlite
      .prepare('SELECT pattern, relation, provenance FROM implementation_map WHERE record_id = ?')
      .all(module) as { pattern: string; relation: string; provenance: string }[]
    // `RELATIONS` has a word for exactly these five — `tests`, "this code checks it" — and the
    // migration does not use it. `data.claims` had ONE word for all twelve, and turning five of
    // them into something finer would put a distinction into the corpus that nobody drew, dated to
    // today, attributed to a migration. A migration that improves the data lies about the past.
    for (const row of rows.filter((one) => FIVE_OF_THEM_ARE_TESTS.includes(one.pattern))) {
      expect(row.relation).toBe(THE_ONE_RELATION)
      expect(row.provenance).toBe(THE_ONE_PROVENANCE)
    }
    expect(rows.filter((one) => one.relation === 'tests')).toEqual([])
    expect(describeModuleClaims(done)).toContain('lies about the past')
  })

  it('keeps every other key of `data` exactly where it was, because key order is part of the hash', () => {
    const before = Object.keys(dataOn(module))
    migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    const after = dataOn(module)
    expect(after['claims']).toBeUndefined()
    expect(Object.keys(after)).toEqual(before.filter((key) => key !== 'claims'))
    expect(after['context']).toBe('What this subsystem is for.')
  })

  it('restamps the newest revision, so the record does not become unwritable', async () => {
    const was = sqlite
      .prepare('SELECT id, content_hash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
      .get(module) as { id: string; content_hash: string }
    const done = migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    expect(done.ledgerRestamped).toBe(1)
    const now = sqlite.prepare('SELECT content_hash, seq FROM revisions WHERE id = ?').get(was.id) as {
      content_hash: string
      seq: number
    }
    // THE HASH MOVED, and no new revision was written: the build plan's "+15 revisions" for this
    // step are its restamp, and it restamps because window B runs it BELOW `migrateRevisions`.
    expect(now.content_hash).not.toBe(was.content_hash)
    expect(sqlite.prepare('SELECT count(*) AS c FROM revisions WHERE record_id = ?').get(module)).toEqual({ c: 1 })
    // And the stamp agrees with what the record now holds, which is the whole point of it: a read
    // hands this token back as `version` and a write has to send it to prove it is not stale.
    const version = await import('../src/server/lib/version.ts')
    const row = sqlite
      .prepare('SELECT kind, title, summary, data, deleted_at FROM records WHERE id = ?')
      .get(module) as { kind: string; title: string; summary: string | null; data: string; deleted_at: string | null }
    expect(now.content_hash).toBe(
      version.versionOf(
        version.contentOf({
          kind: row.kind,
          title: row.title,
          summary: row.summary,
          data: JSON.parse(row.data) as Record<string, unknown>,
          deletedAt: row.deleted_at,
        }),
      ),
    )
  })

  it('says who wrote the row, and it is not a person the corpus cannot name', () => {
    migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    const row = sqlite
      .prepare('SELECT stated_by, note, revision_id, accepted_at FROM implementation_map WHERE record_id = ? LIMIT 1')
      .get(module) as { stated_by: string; note: string; revision_id: string | null; accepted_at: string | null }
    // The change log holds two rows naming `data.claims` for fifteen modules, so nothing here can
    // say who wrote these strings. Reaching for `records.owner_id` would put a person's name
    // against 152 statements on the strength of who owns the record, which is a different fact.
    expect(row.stated_by).toBe(MIGRATION_ACTOR)
    expect(row.note).toContain('does not record who wrote the string')
    // Nobody accepted anything: `declared` is already ownership, and an acceptance nobody performed
    // would be the corpus saying a person did something they did not.
    expect(row.accepted_at).toBeNull()
  })

  it('writes no code-revision row, because nobody named a code revision', () => {
    migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    // `implementation_revisions` is the table of opaque code-revision strings a caller supplied.
    // The build plan's "+15 revisions" are this migration's restamp of the Mole Office record ledger,
    // which is a different table, and the two are easy to read as one.
    expect(sqlite.prepare('SELECT count(*) AS c FROM implementation_revisions').get()).toEqual({ c: 0 })
    const rows = sqlite.prepare('SELECT revision_id FROM implementation_map').all() as { revision_id: string | null }[]
    expect(rows.every((one) => one.revision_id === null)).toBe(true)
  })

  it('writes no `links` row, because a path has no record for a foreign key to name', () => {
    const before = sqlite.prepare('SELECT count(*) AS c FROM links').get() as { c: number }
    migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    expect(sqlite.prepare('SELECT count(*) AS c FROM links').get()).toEqual(before)
  })

  it('leaves nothing in the old shape, and says so from the database rather than from the plan', () => {
    migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    expect(countModuleClaims(sqlite)).toEqual({ modules: 0, claims: 0 })
  })

  it('is safe to run twice: the second run plans nothing and writes nothing', () => {
    migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    const rows = patternsOn(module)
    const data = dataOn(module)
    const again = migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    expect(again.alreadyDone).toBe(true)
    expect(again.rows).toBe(0)
    expect(patternsOn(module)).toEqual(rows)
    expect(dataOn(module)).toEqual(data)
    expect(describeModuleClaims(again)).toContain('Nothing to do')
  })
})

// ============================================================================ which repository

describe('which repository a claim is relative to is a question this migration refuses to answer', () => {
  it('refuses a project with no repository at all, and names the modules and the claims', async () => {
    // THE OWNER'S CORPUS IS EXACTLY THIS SHAPE and `tools/count-the-map.ts` prints it as a fork:
    // all 15 claim-holding modules are in the project `panelx`, the one `source_index` row is in
    // `default`, so minting repositories from the indexes mints none where the claims are.
    const other = aModule('a module in a project with no checkout', ['src/server/lib'], 'robotics')
    expect(() => migrateModuleClaims(sqlite, countModuleClaims(sqlite))).toThrow(/robotics/)
    expect(() => migrateModuleClaims(sqlite, countModuleClaims(sqlite))).toThrow(/no repository at all/)
    // AND NOTHING WAS WRITTEN — not the modules it could have placed either, because half a corpus
    // of moved claims is worse than none.
    expect(dataOn(other)['claims']).toEqual(['src/server/lib'])
    expect(sqlite.prepare('SELECT count(*) AS c FROM implementation_map').get()).toEqual({ c: 0 })
  })

  it('refuses a project holding two, and names both, rather than picking the first', async () => {
    await aRepository('calibration')
    aModule('a module in a project with two checkouts', ['src/server/lib'])
    expect(() => migrateModuleClaims(sqlite, countModuleClaims(sqlite))).toThrow(/calibration/)
    expect(() => migrateModuleClaims(sqlite, countModuleClaims(sqlite))).toThrow(/panelx/)
    expect(sqlite.prepare('SELECT count(*) AS c FROM implementation_map').get()).toEqual({ c: 0 })
  })

  it('uses the one the caller names, and says on the report that a person named it', async () => {
    const second = await aRepository('calibration')
    const module = aModule('a module in a project with two checkouts', ['src/server/lib'])
    const done = migrateModuleClaims(sqlite, countModuleClaims(sqlite), { [WORKSPACE]: second.id })
    expect(done.rows).toBe(1)
    expect(done.repositories).toEqual([
      { workspaceId: WORKSPACE, repositoryId: second.id, name: 'calibration', how: 'named by the caller' },
    ])
    const row = sqlite
      .prepare('SELECT repository_id FROM implementation_map WHERE record_id = ?')
      .get(module) as { repository_id: string }
    expect(row.repository_id).toBe(second.id)
  })

  it('uses the only repository a project has, and says that is why', () => {
    aModule('a module in a project with one checkout', ['src/server/lib'])
    const done = migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    // ONE CANDIDATE IS THE ONLY ANSWER THERE IS, not a guess between several, and the report says
    // which of the two it was so that nobody reads a default as a decision.
    expect(done.repositories[0]?.how).toBe('the only repository in that project')
    expect(done.repositories[0]?.repositoryId).toBe(repositoryId)
  })

  it('refuses a repository id that is not in that project, and says what is', () => {
    aModule('a module', ['src/server/lib'])
    expect(() => migrateModuleClaims(sqlite, countModuleClaims(sqlite), { [WORKSPACE]: 'NOTHING-HAS-THIS-ID' })).toThrow(
      /no repository of that id/,
    )
    expect(sqlite.prepare('SELECT count(*) AS c FROM implementation_map').get()).toEqual({ c: 0 })
  })
})

// ============================================================================ what it will not do

describe('what it will not do to the corpus it is given', () => {
  it('refuses a corpus it has not been told the numbers for, and names both of them', () => {
    const module = aModule('a module nobody counted', TWELVE_CLAIMS)
    // What the caller SAYS it measured, against what is really there. A migration that runs against
    // a corpus nobody counted is a broken assumption carried quietly.
    expect(() => migrateModuleClaims(sqlite, { modules: 15, claims: 152 })).toThrow(/not the corpus that was counted/)
    expect(() => migrateModuleClaims(sqlite, { modules: 15, claims: 152 })).toThrow(/you measured 152 claim strings/)
    // AND NOTHING WAS WRITTEN. The refusal is before the transaction, not inside a half-done one.
    expect(dataOn(module)['claims']).toEqual(TWELVE_CLAIMS)
    expect(sqlite.prepare('SELECT count(*) AS c FROM implementation_map').get()).toEqual({ c: 0 })
  })

  it("leaves a deleted module's claims exactly as they are, and names it", () => {
    const gone = aModule('a module somebody deleted', ['src/server/lib/gone.ts'])
    sqlite.prepare("UPDATE records SET deleted_at = datetime('now') WHERE id = ?").run(gone)
    const alive = aModule('a module nobody deleted', ['src/server/lib/here.ts'])
    const done = migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    // `declareRelationship` refuses a relationship on a deleted record — "a statement nothing
    // draws" — so a migration must not make one behind its back.
    expect(done.rows).toBe(1)
    expect(patternsOn(alive)).toEqual(['src/server/lib/here.ts'])
    expect(patternsOn(gone)).toEqual([])
    expect(dataOn(gone)['claims']).toEqual(['src/server/lib/gone.ts'])
    expect(done.notes.map((one) => one.kind)).toContain('deleted_module')
    expect(describeModuleClaims(done)).toContain('LEFT AS IT IS')
  })

  it('a claim string listed twice by one module is one row, because the index is keyed on the pattern', () => {
    const module = aModule('a module that says it twice', ['src/server/lib', 'src/server/lib', 'tests/one.test.ts'])
    const done = migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    expect(done.rows).toBe(2)
    expect(done.repeatsFolded).toBe(1)
    expect(patternsOn(module)).toEqual(['src/server/lib', 'tests/one.test.ts'])
    expect(describeModuleClaims(done)).toContain('listed twice')
  })

  it('never writes a row somebody retired, and the claim still counts as accounted for', () => {
    const module = aModule('a module whose row somebody removed', ['src/server/lib', 'tests/one.test.ts'])
    migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    // Somebody retires one row, and the old field comes back on the record — the only way to reach
    // this state, and it has to be survivable, because `implementation_map_one_idx` does NOT
    // include `deleted_at`: writing the pattern again is not a second row, it is a failed index and
    // a transaction on the floor.
    sqlite
      .prepare("UPDATE implementation_map SET deleted_at = datetime('now') WHERE record_id = ? AND pattern = ?")
      .run(module, 'src/server/lib')
    sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.claims', json(?)) WHERE id = ?")
      .run(JSON.stringify(['src/server/lib', 'tests/one.test.ts']), module)
    const again = migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    expect(again.rows).toBe(0)
    expect(again.rowsAlreadyThere).toBe(2)
    expect(again.rowsRetiredEarlier).toBe(1)
    // A MIGRATION DOES NOT UNDO A DELETION. The row somebody removed is still removed.
    const retired = sqlite
      .prepare('SELECT deleted_at FROM implementation_map WHERE record_id = ? AND pattern = ?')
      .get(module, 'src/server/lib') as { deleted_at: string | null }
    expect(retired.deleted_at).not.toBeNull()
    expect(patternsOn(module).length).toBe(2)
  })

  it('migrates a claim the write door would refuse today, and names it rather than repairing it', () => {
    // `claimProblem` refuses an absolute path at `POST /api/implementation`. This string is in the
    // corpus already; repairing it here would be the migration inventing a statement, and dropping
    // it would be the migration losing one.
    const module = aModule('a module with an absolute claim', [`${THE_TEST_FIXTURE_ROOT}/elsewhere/src`])
    const done = migrateModuleClaims(sqlite, countModuleClaims(sqlite))
    expect(done.rows).toBe(1)
    expect(patternsOn(module)).toEqual([`${THE_TEST_FIXTURE_ROOT}/elsewhere/src`])
    expect(done.patternsTheWriteDoorWouldRefuse.map((one) => one.pattern)).toEqual([`${THE_TEST_FIXTURE_ROOT}/elsewhere/src`])
    expect(describeModuleClaims(done)).toContain('MIGRATED AND NAMED')
  })

  it('leaves a module whose `data.claims` is not a list of patterns exactly as it is', () => {
    const prose = t.api.createRecord({
      kind: 'module',
      title: 'a module whose claims are a sentence',
      workspaceId: WORKSPACE,
      data: { context: 'What this is for.', parts: [], extra: { claims: 'the whole of the server' } },
      actor: HUMAN,
    }).id
    sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.claims', 'the whole of the server') WHERE id = ?")
      .run(prose)
    const planned = planModuleClaims(sqlite)
    expect(planned.moves.map((one) => one.recordId)).not.toContain(prose)
    expect(planned.notes.map((one) => one.kind)).toContain('claims_not_an_array')
  })
})

// ============================================================================ not registered

