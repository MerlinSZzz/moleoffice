// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0326 MAKES ONE INDEX, SO THE REVISIONS OF ONE KIND IN A PROJECT ARE FOUND WITHOUT READING THE PROJECT'S OTHERS.
 *
 * Wave 13y round 144, item 82c. The record page's history (`historyEvents` in src/server/lib/history.ts) reads every
 * pipeline revision of the project, and the take-back check (`takeBackAlreadyExists` in src/server/lib/take-back.ts)
 * reads the first merge-entry revisions of a project. No index of `revisions` held the kind, so SQLite read every revision
 * of the project by `revisions_workspace_at_idx` and kept those of the kind asked. On the made-up office of 4 November
 * 2026 (385,431 revisions in its largest project, 335 of them pipeline), the history door answered in 9.2 s with the
 * database's pages not in memory and 363 ms with them. Migration 0326 makes an index on (`kind`, `workspace_id`, `seq`):
 * 265 ms and 103 ms, with the same answer by hash. The index is 13,103,104 bytes there.
 *
 * WHAT IS HELD HERE. Cases A to C in a fresh test database, case D in a scratch database of its own:
 *   A. the index is in the database, on `kind`, then `workspace_id`, then `seq`, and it is not unique;
 *   B. each read is caught as it runs, and SQLite, asked with the values bound to it, plans it:
 *      - the history door's read of a project's pipeline revisions searches the index by the kind and the project;
 *      - the take-back check searches it by the kind, the project and the place in the record;
 *      - the take-back listing (`asyncTakeBacksForProject` in src/server/lib/async-take-back.ts) reads a problem's
 *        takeouts twice, once before its git reads and once after, and searches it the same way each time;
 *      - two reads by the project alone (`theRuleThreeSignature` in src/server/lib/rulethree.ts and `actsUnderThePeriod`
 *        in src/server/lib/elevation.ts) still search `revisions_workspace_at_idx`, because the kind comes first;
 *      - none of these reads scans the table.
 *    Migration 0353 adds an index on the project, then the record, its op and its `at`. The take-back listing and
 *    `theRuleThreeSignature` ask for their rows in record order, and SQLite would move both onto that index to skip the
 *    sort. The first term of each one's ORDER BY has a unary plus, so SQLite does not take that order from an index, and
 *    both keep the plans held here. `actsUnderThePeriod` keeps its plan with no plus.
 *   C. the way back passes the migration: `theWayBackCheck` in tools/stable/the-way-back.mjs finds that it only adds;
 *   D. a database migrated to just before 0326 reads a project's pipeline revisions through `revisions_workspace_at_idx`,
 *      and the same database migrated the rest of the way searches the new index.
 *
 * Every case but the reads by the project alone fails before the migration. Case B's control: the history door's read
 * and the take-back check are planned as `SEARCH revisions USING INDEX revisions_workspace_at_idx (workspace_id=?)`.
 * Case D shows the same in one run, before 0326 and after it. The take-back listing's case came later, in wave 13s
 * round 281, and was not run before the migration.
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   1. In the migration, make the index on `workspace_id`, then `kind`, then `seq`. Cases A, B and D go red: the index's
 *      columns are in the other order, the history door's read and the take-back check search it by the project first,
 *      and SQLite plans one of the reads by the project alone on it too.
 *   2. In `historyEvents`, ask `+kind = 'pipeline'`, which SQLite does not search an index by. Case B goes red for the
 *      history door alone: its read is planned on `revisions_workspace_at_idx`.
 *   3. In the migration, add a second statement, `DELETE FROM revisions WHERE 0`, after a statement breakpoint. Case C
 *      goes red: a statement that deletes rows does more than add, though this one deletes none.
 *
 * WHAT IT DOES NOT HOLD. How long the reads take. What the reads answer: their own tests hold that, before the migration and after it.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The pipeline is filed through
 * the record door. Case D's database is an empty one in the temporary folder, removed after the case.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { MIGRATIONS, migrationsBefore, partialMigrations, scratch } from './migration-fixtures.ts'

/** The index, under the name schema.ts and the migration give it. */
const INDEX = 'revisions_kind_workspace_seq_idx'
/** The index a read by the project alone keeps. */
const BY_PROJECT = 'revisions_workspace_at_idx'
/** The migration's tag without its number, which the merge queue may change. */
const TAG = '_the_revisions_of_a_kind_are_found_by_index'
const WORKSPACE = 'default'
const A_RUN = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'made-up-r144-runner',
}
/** The person, as the tests that file a problem with no data through the record door ask. */
const THE_PERSON_ASKS = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let wayBack: typeof import('../tools/stable/the-way-back.mjs')
let migrations: string
let pipeline: string

/** The SQL of this migration, found in the journal by its tag. */
function theMigration(): { tag: string; sql: string } {
  const journal = JSON.parse(readFileSync(join(migrations, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  const entry = journal.entries.find((one) => one.tag.endsWith(TAG))
  if (entry === undefined) throw new Error(`The migration journal holds no migration ending ${TAG}.`)
  return { tag: entry.tag, sql: readFileSync(join(migrations, `${entry.tag}.sql`), 'utf8') }
}

/** The first step of SQLite's plan for a read that searches the index by the kind and the project. */
const SEARCHED = new RegExp(`^SEARCH revisions USING (COVERING )?INDEX ${INDEX} \\(kind=\\? AND workspace_id=\\?`)
/** The first step of SQLite's plan for a read that searches the index by the kind, the project and the place in the record. */
const SEARCHED_TO_THE_PLACE = new RegExp(`^SEARCH revisions USING (COVERING )?INDEX ${INDEX} \\(kind=\\? AND workspace_id=\\? AND seq=\\?\\)`)
/** The first step of SQLite's plan for a read by the project alone. */
const BY_THE_PROJECT = new RegExp(`^SEARCH revisions USING (COVERING )?INDEX ${BY_PROJECT} \\(workspace_id=\\?\\)`)
/** The steps of a plan that read the revisions by scanning them. */
const scans = (plan: string[]): string[] => plan.filter((step) => /^SCAN revisions\b/.test(step))

/** True for a read of the revisions table. */
const isARevisionsRead = (source: string): boolean => /\bfrom "?revisions"?/i.test(source)
/** True for a read of the revisions table that asks for one kind. */
const isAKindRead = (source: string): boolean => isARevisionsRead(source) && /\bwhere\b[\s\S]*\bkind"?\s*=/i.test(source)

/** Every read of the revisions table that `work` made and `which` keeps, with SQLite's plan for it, asked with its values. */
async function theRevisionReadsDuring(work: () => unknown, which: (source: string) => boolean): Promise<{ source: string; plan: string[] }[]> {
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => { all: (...values: unknown[]) => unknown[] } }
  const prototype = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, (...args: unknown[]) => unknown>
  const originals = new Map<string, (...args: unknown[]) => unknown>()
  const ran: { source: string; values: unknown[] }[] = []
  for (const name of ['get', 'all', 'iterate']) {
    const original = prototype[name]!
    originals.set(name, original)
    prototype[name] = function (this: { source: string }, ...args: unknown[]) {
      if (which(this.source)) ran.push({ source: this.source, values: args.flat() })
      return original.apply(this, args)
    }
  }
  try {
    await work()
  } finally {
    for (const [name, original] of originals) prototype[name] = original
  }
  return ran.map((one) => ({
    source: one.source,
    plan: (sqlite.prepare(`EXPLAIN QUERY PLAN ${one.source}`).all(...one.values) as { detail: string }[]).map((step) => step.detail),
  }))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  wayBack = await import('../tools/stable/the-way-back.mjs')
  migrations = (await import('../src/config/settings.mjs')).THE_MIGRATIONS_FOLDER
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: A_RUN,
    payload: { kind: 'pipeline', title: 'Made-up pipeline of round 144', data: { blockIds: [] } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  pipeline = (filed.json() as { record: { id: string } }).record.id
}, 120_000)
afterAll(async () => {
  await app.close()
  t.close()
})

describe('A. the index', () => {
  it('is on the kind, then the project, then the place in the record, and is not unique', () => {
    const listed = (t.client.sqlite.prepare('PRAGMA index_list(revisions)').all() as { name: string; unique: number }[]).find((one) => one.name === INDEX)
    expect(listed, `the index ${INDEX}`).toBeDefined()
    expect(listed!.unique).toBe(0)
    const columns = (t.client.sqlite.prepare(`PRAGMA index_info(${INDEX})`).all() as { name: string }[]).map((one) => one.name)
    expect(columns).toEqual(['kind', 'workspace_id', 'seq'])
  })
})

describe('B. the reads', () => {
  const expectPlanned = (reads: { source: string; plan: string[] }[], what: string, count: number, planned: RegExp): void => {
    expect(reads, `${what} reads the revisions ${String(count)} times`).toHaveLength(count)
    for (const read of reads) {
      expect(read.plan[0], `${what}: ${read.plan.join(' | ')}`).toMatch(planned)
      expect(scans(read.plan), `${what}: ${read.plan.join(' | ')}`).toEqual([])
    }
  }
  it('the history door reads the project\'s pipeline revisions by the index', async () => {
    const reads = await theRevisionReadsDuring(() => app.inject({ method: 'GET', url: `/api/records/${pipeline}/history`, headers: A_RUN }), isAKindRead)
    expectPlanned(reads, 'the history door', 1, SEARCHED)
  })
  it('the take-back check reads the first merge-entry revisions of the project by the index', async () => {
    const takeBack = await import('../src/server/lib/take-back.ts')
    const reads = await theRevisionReadsDuring(() => takeBack.takeBackAlreadyExists(WORKSPACE, 'made-up-problem'), isAKindRead)
    expectPlanned(reads, 'takeBackAlreadyExists', 1, SEARCHED_TO_THE_PLACE)
  })
  it('the take-back listing reads a problem\'s takeouts by the index, once before its git reads and once after', async () => {
    const filed = await app.inject({ method: 'POST', url: '/api/records', headers: THE_PERSON_ASKS, payload: { kind: 'problem', title: 'Made-up problem of round 281', data: {} } })
    expect(filed.statusCode, filed.body).toBe(201)
    const problem = (filed.json() as { record: { id: string } }).record.id
    const takeBacks = await import('../src/server/lib/async-take-back.ts')
    const reads = await theRevisionReadsDuring(
      () => takeBacks.asyncTakeBacksForProject(WORKSPACE, problem),
      (source) => isAKindRead(source) && source.includes('$.fixRound.kind'),
    )
    expectPlanned(reads, 'asyncTakeBacksForProject', 2, SEARCHED_TO_THE_PLACE)
  })
  it('two reads by the project alone still search revisions_workspace_at_idx', async () => {
    const ruleThree = await import('../src/server/lib/rulethree.ts')
    const elevation = await import('../src/server/lib/elevation.ts')
    expectPlanned(await theRevisionReadsDuring(() => ruleThree.theRuleThreeSignature(WORKSPACE), isARevisionsRead), 'theRuleThreeSignature', 1, BY_THE_PROJECT)
    expectPlanned(await theRevisionReadsDuring(() => elevation.actsUnderThePeriod('el-made-up', WORKSPACE, () => null), isARevisionsRead), 'actsUnderThePeriod', 1, BY_THE_PROJECT)
  })
})

describe('C. the way back', () => {
  it('finds that the migration only adds, so the previous version may run on the database it leaves', async () => {
    const { THE_STATEMENT_BREAKPOINT } = await import('../src/config/migration-look.mjs')
    const { tag } = theMigration()
    const journalPath = `${wayBack.THE_MIGRATIONS_PATH}/meta/_journal.json`
    const journal = JSON.parse(readFileSync(join(migrations, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
    const without = { ...journal, entries: journal.entries.filter((one) => one.tag !== tag) }
    // A GIT OF TWO VERSIONS MADE OF THIS TREE: the newer is the tree, the older is the tree without this migration.
    const blobs = new Map<string, string>()
    const tree = (version: 'older' | 'newer') => {
      const entries = version === 'newer' ? journal.entries : without.entries
      blobs.set(`${version}:journal`, JSON.stringify(version === 'newer' ? journal : without))
      const lines = [`100644 blob ${version}:journal\t${journalPath}`]
      for (const one of entries) {
        blobs.set(`file:${one.tag}`, readFileSync(join(migrations, `${one.tag}.sql`), 'utf8'))
        lines.push(`100644 blob file:${one.tag}\t${wayBack.THE_MIGRATIONS_PATH}/${one.tag}.sql`)
      }
      return lines.join('\0')
    }
    const steps = readFileSync(new URL(`../${wayBack.THE_STEPS_FILE}`, import.meta.url), 'utf8')
    const theMadeUpGit = (args: string[]): string => {
      if (args[0] === 'ls-tree') return tree(args[3] as 'older' | 'newer')
      if (args[0] === 'cat-file') return blobs.get(args[2]!)!
      if (args[0] === 'show') return steps
      throw new Error(`The made-up git was asked ${args.join(' ')}.`)
    }
    const checked = wayBack.theWayBackCheck(theMadeUpGit, 'older', 'newer', [])
    expect(checked.refusal).toBeNull()
    expect(checked.checked).toEqual([tag])
    for (const statement of theMigration().sql.split(THE_STATEMENT_BREAKPOINT)) {
      expect(wayBack.whatAStatementChanges(statement, new Set(), [])).toBeNull()
    }
  })
})

describe('D. a database that has never seen it', () => {
  it('reads a project\'s pipeline revisions by the project before the migration, and by the index after it', async () => {
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const s = scratch('the-revisions-of-a-kind-are-found-by-index')
    migrateInPlace(s.db, partialMigrations(migrationsBefore(theMigration().tag)))
    const plan = (): string[] =>
      (s.db.prepare("EXPLAIN QUERY PLAN SELECT * FROM revisions WHERE workspace_id = ? AND kind = 'pipeline'").all(WORKSPACE) as { detail: string }[]).map((step) => step.detail)
    // THE FIXTURE IS BEFORE 0326, or this case would be measuring nothing: the read goes through the project's revisions.
    expect(s.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(INDEX), 'the index before 0326').toBeUndefined()
    expect(plan()[0], plan().join(' | ')).toMatch(BY_THE_PROJECT)
    migrateInPlace(s.db, MIGRATIONS)
    expect(plan()[0], plan().join(' | ')).toMatch(SEARCHED)
    expect(scans(plan()), plan().join(' | ')).toEqual([])
  })
})
