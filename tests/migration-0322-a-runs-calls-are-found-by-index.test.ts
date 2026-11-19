// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0322 MAKES ONE INDEX, SO A RUN'S CALLS ARE FOUND BY THE RUN AND NOT BY READING EVERY CALL.
 *
 * Wave 13y round 120, item 54. Four reads ask `api_calls` for the calls of some runs by `session_id`: the run's
 * timeline (`sessionTimeline` in src/server/lib/sessions.ts), the newest call of one agent's runs and of every run
 * (`newestRequestFor` and `newestRequestOfEachRun` in src/server/lib/arrivals.ts), and a run's start steps
 * (`startStepsOfSession` in src/server/lib/start-cost.ts). The table had no index that starts with `session_id`, so
 * SQLite read every call, by time or by rowid, and kept those of the runs asked. On a made-up office at the live sizes
 * (2,526,769 calls), a run's timeline statement took 186 to 199 ms, the start steps 195 ms and the newest call of
 * 7,053 runs 823 ms. Migration 0322 makes an index on (`session_id`, `at_ms`): 0.3 ms, 0.8 ms and 90 ms, with the same
 * answers by hash. The index is 66,756,608 bytes there, beside 431,259,648 for the table.
 *
 * WHAT IS HELD HERE. Cases A to C in a fresh test database, case D in a scratch database of its own:
 *   A. the index is in the database, on `session_id` and then `at_ms`, and it is not unique;
 *   B. each of the four reads is caught as it runs, and SQLite, asked with the values bound to it, plans it with a
 *      step that searches the index by `session_id` and with no step that reads calls by scanning the table. The
 *      search need not be the first step: `newestRequestOfEachRun` scans the list of runs it was asked, then searches
 *      the index once for each run;
 *   C. the way back passes the migration: `theWayBackCheck` in tools/stable/the-way-back.mjs finds that it only adds;
 *   D. a database migrated to just before 0322 reads a run's calls by scanning the table, and the same database
 *      migrated the rest of the way searches the index.
 *
 * Every case fails before the migration. Case B's control: each read is planned as `SCAN api_calls`, through
 * api_calls_at_idx or none. Case D shows the same in one run, before 0322 and after it.
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   1. In the migration, make the index on `at_ms` and then `session_id`. Cases A, B and D go red.
 *   2. In `startStepsOfSession`, ask `session_id || '' = ?`. Case B goes red for that read alone.
 *   3. In the migration, add a second statement, `DELETE FROM api_calls WHERE 0`, after a statement breakpoint. Case C
 *      goes red: a statement that deletes rows does more than add, though this one deletes none.
 *   4. In `newestRequestOfEachRun`, read `api_calls NOT INDEXED`. Case B goes red for that read alone: no step of its
 *      plan searches the index. SQLite names the step `SEARCH api_calls`, with no index, because the read asks for a
 *      maximum, though it reads every row of the table.
 *
 * WHAT IT DOES NOT HOLD. How long the reads take: the times are in the round's report and the commit. What the reads
 * answer: their own tests hold that, before the migration and after it (tests/one-run-timeline.test.ts,
 * tests/the-roster-reads-each-run-once.test.ts, tests/start-cost-measured.test.ts).
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The run is filed through
 * the record door; its calls are made-up rows written straight into the table. Case D's database is an empty one in
 * the temporary folder, removed after the case.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { MIGRATIONS, migrationsBefore, partialMigrations, scratch } from './migration-fixtures.ts'

/** The index, under the name schema.ts and the migration give it. */
const INDEX = 'api_calls_session_at_idx'
/** The migration's tag without its number, which the merge queue may change. */
const TAG = '_a_runs_calls_are_found_by_index'
const WORKSPACE = 'default'
const A_RUN = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'made-up-r120-runner',
}

let t: TestDb
let app: FastifyInstance
let wayBack: typeof import('../tools/stable/the-way-back.mjs')
let migrations: string
let run: string

/** The SQL of this migration, found in the journal by its tag. */
function theMigration(): { tag: string; sql: string } {
  const journal = JSON.parse(readFileSync(join(migrations, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  const entry = journal.entries.find((one) => one.tag.endsWith(TAG))
  if (entry === undefined) throw new Error(`The migration journal holds no migration ending ${TAG}.`)
  return { tag: entry.tag, sql: readFileSync(join(migrations, `${entry.tag}.sql`), 'utf8') }
}

/** A step of SQLite's plan that searches the index by run. Other steps may come before it. */
const SEARCHED = new RegExp(`^SEARCH api_calls USING (COVERING )?INDEX ${INDEX} \\(session_id=\\?\\)`)
/** The steps of a plan that read the call log by scanning it. */
const scans = (plan: string[]): string[] => plan.filter((step) => /^SCAN api_calls\b/.test(step))

/** True for a read of the call log by the run's column. */
const isARunsCallsRead = (source: string): boolean => /\bfrom "?api_calls"?/i.test(source) && /\bsession_id\b/i.test(source)

/** Every read of the call log by run that `work` made, with SQLite's plan for it, asked with its values. */
async function theCallReadsDuring(work: () => unknown): Promise<{ source: string; plan: string[] }[]> {
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => { all: (...values: unknown[]) => unknown[] } }
  const prototype = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, (...args: unknown[]) => unknown>
  const originals = new Map<string, (...args: unknown[]) => unknown>()
  const ran: { source: string; values: unknown[] }[] = []
  for (const name of ['get', 'all', 'iterate']) {
    const original = prototype[name]!
    originals.set(name, original)
    prototype[name] = function (this: { source: string }, ...args: unknown[]) {
      if (isARunsCallsRead(this.source)) ran.push({ source: this.source, values: args.flat() })
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
    payload: { kind: 'session', title: 'Made-up run of round 120', data: { state: 'running', runtime: 'claude-code', model: 'opus', doing: 'made-up calls' } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  run = (filed.json() as { record: { id: string } }).record.id
  // 120 made-up calls: every third the run's, the rest another run's or nobody's, many of them in one millisecond.
  t.client.sqlite
    .prepare(
      `WITH RECURSIVE n(k) AS (SELECT 0 UNION ALL SELECT k + 1 FROM n WHERE k < 119)
       INSERT INTO api_calls (id, at_ms, operation, effect, route, method, status, ms, workspace_id, actor_type, actor_id, session_id, identity_source)
       SELECT printf('call-r120-%04d', k), 1793000000000 + (k / 4), 'records.get', 'read', '/api/records/:id', 'GET', 200, 1.5, ?, 'agent', 'made-up',
              CASE WHEN k % 3 = 0 THEN ? WHEN k % 2 = 0 THEN 'se-made-up-other' ELSE NULL END, 'header'
       FROM n`,
    )
    .run(WORKSPACE, run)
}, 120_000)
afterAll(async () => {
  await app.close()
  t.close()
})

describe('A. the index', () => {
  it('is on the run and then the time of the call, and is not unique', () => {
    const listed = (t.client.sqlite.prepare('PRAGMA index_list(api_calls)').all() as { name: string; unique: number }[]).find((one) => one.name === INDEX)
    expect(listed, `the index ${INDEX}`).toBeDefined()
    expect(listed!.unique).toBe(0)
    const columns = (t.client.sqlite.prepare(`PRAGMA index_info(${INDEX})`).all() as { name: string }[]).map((one) => one.name)
    expect(columns).toEqual(['session_id', 'at_ms'])
  })
})

describe('B. the four reads', () => {
  const expectSearched = (reads: { source: string; plan: string[] }[], what: string, count: number): void => {
    expect(reads, `${what} reads the call log by run ${String(count)} times`).toHaveLength(count)
    for (const read of reads) {
      expect(read.plan.some((step) => SEARCHED.test(step)), `${what}: ${read.plan.join(' | ')}`).toBe(true)
      expect(scans(read.plan), `${what}: ${read.plan.join(' | ')}`).toEqual([])
    }
  }
  it('the timeline, through the door and with a message hidden', async () => {
    const sessions = await import('../src/server/lib/sessions.ts')
    expectSearched(await theCallReadsDuring(() => app.inject({ method: 'GET', url: `/api/sessions/${run}/timeline`, headers: A_RUN })), 'the timeline door', 1)
    expectSearched(await theCallReadsDuring(() => sessions.sessionTimeline(run, WORKSPACE, ['ms-made-up-hidden'])), 'sessionTimeline with a message hidden', 1)
  })
  it('the newest call of some runs and of each run', async () => {
    const arrivals = await import('../src/server/lib/arrivals.ts')
    expectSearched(await theCallReadsDuring(() => arrivals.newestRequestFor([run, 'se-made-up-other'])), 'newestRequestFor', 1)
    expectSearched(await theCallReadsDuring(() => arrivals.newestRequestOfEachRun([run, 'se-made-up-other', 'se-made-up-silent'])), 'newestRequestOfEachRun', 1)
  })
  it('the start steps of a run', async () => {
    const startCost = await import('../src/server/lib/start-cost.ts')
    const record = (t.client.sqlite.prepare('SELECT id, kind, title, data, created_at AS createdAt FROM records WHERE id = ?').get(run) as Record<string, unknown>)
    const reads = await theCallReadsDuring(() => startCost.startStepsOfSession(record as unknown as Parameters<typeof startCost.startStepsOfSession>[0], 1793000000020))
    expectSearched(reads, 'startStepsOfSession', 1)
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
  it('reads a run\'s calls by scanning the table before the migration, and by searching the index after it', async () => {
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const s = scratch('a-runs-calls-are-found-by-index')
    migrateInPlace(s.db, partialMigrations(migrationsBefore(theMigration().tag)))
    const plan = (): string[] =>
      (s.db.prepare('EXPLAIN QUERY PLAN SELECT id, at_ms FROM api_calls WHERE session_id = ? ORDER BY at_ms').all('se-made-up') as { detail: string }[]).map((step) => step.detail)
    // THE FIXTURE IS BEFORE 0322, or this case would be measuring nothing: the read goes through every call.
    expect(s.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(INDEX), 'the index before 0322').toBeUndefined()
    expect(scans(plan()), plan().join(' | ')).not.toEqual([])
    migrateInPlace(s.db, MIGRATIONS)
    expect(plan()[0], plan().join(' | ')).toMatch(SEARCHED)
    expect(scans(plan()), plan().join(' | ')).toEqual([])
  })
})
