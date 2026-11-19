// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0296 MAKES TWO INDEXES, SO THE WORKER FINDS THE RUNS THAT WANT A NEXT ROUND OR A WORKER RUN WITHOUT READING
 * EVERY RUN OF THE PROJECT.
 *
 * Wave 13y round 74. The message worker asks GET /api/next-round/to-start and GET /api/worker-runs/to-start on every
 * pass. `theRoundsToStart` (src/server/lib/next-round.ts) and `theWorkerRunsToStart` (src/server/lib/worker-runs.ts)
 * each read every session record of the project, whole, to find the few whose `nextRound` is wanted or whose
 * `workerRuns` holds a wanted entry. Each now adds one more WHERE term, the WHERE of its own partial index, so SQLite
 * reads only the rows that index holds. The rows each door hands back, their order, the limit of 25 and every reason a
 * run is left out stay as they were.
 *
 * WHAT IS HELD HERE, in a test world of synthetic rows written straight into a fresh test database:
 *
 *   A. each index is in the database, on the project and the deletion stamp, and its WHERE is the kind and the words of
 *      its stored field in src/server/db/schema.ts, so the migration's SQL and `STORED_FIELDS` cannot drift apart;
 *   B. each door's statement holds those same words, and SQLite's plan for it reads its index, so the query's term and
 *      the index's WHERE cannot drift apart with nothing failing;
 *   C. each door answers what its rule says of the rows planted here: the wanted rows of this project that are not
 *      deleted, oldest change first, then by id (and for a worker run by the agent's id), the first 25 of them, less
 *      each one whose agent has a run going or is not in the registry;
 *   D. each stored field keeps every row its door can hand back, read with the words of src/shared/next-round.ts and
 *      src/shared/worker-runs.ts, and keeps a row whose data is not JSON, so the door still fails on it as before.
 *
 * Cases A, B and D fail before the migration and the two changed queries. Case C holds before and after.
 *
 * MUTATIONS (round 74 of wave 13y), each after a control run, each put back from the commit:
 *   1. In `theRoundsToStart`, take out the added WHERE term. Case B goes red for the rounds.
 *   2. In `theWorkerRunsToStart`, take out the added WHERE term. Case B goes red for the worker runs.
 *   3. In drizzle/0296, make the rounds index ask for 'starting' and not 'wanted'. Cases A and B go red for the
 *      rounds: the index no longer holds the query's words, so SQLite does not read it.
 *   4. In `STORED_FIELDS.sessionHoldsWorkerRuns`, read '$.workerRun' and not '$.workerRuns'. Cases A, B, C and D go
 *      red for the worker runs: the query then asks for a key no run holds, so it answers nothing.
 *   5. In `theRoundsToStart`, ask for LIMIT 26. Case C goes red for the rounds.
 *   6. In `theWorkerRunsToStart`, order the entries by `entry.key DESC`. Case C goes red for the worker runs.
 */
import type { SQL, SQLWrapper } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { NEXT_ROUND, NEXT_ROUND_STATES, type NextRoundState } from '../src/shared/next-round.ts'
import { WORKER_RUNS, WORKER_RUN_STATES, type WorkerRunState } from '../src/shared/worker-runs.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let schema: typeof import('../src/server/db/schema.ts')
let theRoundsToStart: typeof import('../src/server/lib/next-round.ts').theRoundsToStart
let theWorkerRunsToStart: typeof import('../src/server/lib/worker-runs.ts').theWorkerRunsToStart

const PROJECT = 'default'
const ELSEWHERE = 'made-up-elsewhere'
const AT = '2026-10-24 09:00:00'
/** The one state of each list a door starts, typed by its list, so the word cannot leave the list unnoticed. */
const WANTED_ROUND: NextRoundState = 'wanted'
const WANTED_WORKER_RUN: WorkerRunState = 'wanted'

/** Each door's index and the stored field its WHERE is, under the names schema.ts gives them. */
const THE_DOORS = {
  rounds: { index: 'records_session_wants_a_next_round_idx', field: 'sessionWantsANextRound' },
  'worker runs': { index: 'records_session_holds_worker_runs_idx', field: 'sessionHoldsWorkerRuns' },
} as const
type ADoor = keyof typeof THE_DOORS

/** While this is set, every statement prepared on the database is kept here. */
let keeping: string[] | null = null

/** What the planted rows say each door must answer, worked out from why each row was planted. */
const expected: { rounds: { run: string; agentId: string; handle: string; runtime: string | null }[]; 'worker runs': { run: string; agentId: string; handle: string }[] } = {
  rounds: [],
  'worker runs': [],
}

beforeAll(async () => {
  t = await freshDb()
  const db = t.client.sqlite
  const sqlite = db as unknown as { prepare: (sql: string) => unknown }
  const prepare = sqlite.prepare
  sqlite.prepare = function (this: unknown, asked: string) {
    keeping?.push(asked)
    return prepare.call(this, asked)
  }
  schema = await import('../src/server/db/schema.ts')
  theRoundsToStart = (await import('../src/server/lib/next-round.ts')).theRoundsToStart
  theWorkerRunsToStart = (await import('../src/server/lib/worker-runs.ts')).theWorkerRunsToStart
  const { registerResource } = await import('../src/server/lib/resources.ts')

  db.prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(ELSEWHERE, 'A made-up second project', AT, AT)
  const asset = db.prepare(
    'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) ' +
      "VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated')",
  )
  const agent = db.prepare(
    'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at, started_by_kind, started_by_id, role) ' +
      "VALUES (?, ?, ?, ?, 0, NULL, ?, 'person', ?, NULL)",
  )
  const owner = t.api.HUMAN.id
  /** One registry row, with its avatar, written at the table. */
  const anAgent = (id: string): string => {
    asset.run(`avatar-default-agent-${id}`, AT)
    agent.run(id, id, `${id}-handle`, `avatar-default-agent-${id}`, AT, owner)
    return id
  }
  const record = db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, deleted_at, kind, title, data, origin) ' +
      "VALUES (?, ?, ?, ?, ?, ?, 'session', ?, ?, 'authored')",
  )
  let n = 0
  /** One session record. Rows are changed a second apart in the order they are planted, unless `at` says otherwise. */
  const aRun = (id: string, data: Record<string, unknown>, more: { at?: string; project?: string; deleted?: boolean } = {}): string => {
    n += 1
    const at = more.at ?? `2026-10-24 10:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
    record.run(id, more.project ?? PROJECT, owner, AT, at, more.deleted === true ? AT : null, `A made-up run ${id}`, JSON.stringify(data))
    return id
  }

  // AN AGENT WITH A RUN GOING: a run that says it is running, serving the agent, held by this test's own live process.
  const busy = anAgent('made-up-busy-agent')
  const going = aRun('made-up-run-going', { state: 'running', runtime: 'claude-code', servingAgentId: busy })
  registerResource({ workspaceId: PROJECT, sessionRecordId: going, type: 'process', key: String(process.pid), actor: t.api.HUMAN })
  const notRegistered = 'made-up-agent-with-no-registry-row'

  // ---------------------------------------------------------------- the rounds
  // THIRTY WANTED ROUNDS, SO THE LIMIT OF 25 IS REACHED, with three left out among the first 25 and two rows changed in
  // the same second, so the id decides between them.
  const wanted: { run: string; agentId: string | null; why: 'kept' | 'no agent' | 'a run going' | 'not registered'; runtime: string | null }[] = []
  const tie = '2026-10-24 10:00:30'
  for (let i = 0; i < 30; i++) {
    const why = i === 3 ? 'no agent' : i === 7 ? 'a run going' : i === 12 ? 'not registered' : 'kept'
    const agentId = why === 'no agent' ? null : why === 'a run going' ? busy : why === 'not registered' ? notRegistered : anAgent(`made-up-round-agent-${String(i).padStart(2, '0')}`)
    const runtime = i % 2 === 0 ? 'claude-code' : null
    const data: Record<string, unknown> = { state: 'finished', [NEXT_ROUND]: { state: WANTED_ROUND, askedAt: AT } }
    if (agentId !== null) data['servingAgentId'] = agentId
    if (runtime !== null) data['runtime'] = runtime
    // Rows 20 and 21 are planted in the opposite order of their ids, at the same moment.
    const id = i === 20 ? 'made-up-round-b' : i === 21 ? 'made-up-round-a' : `made-up-round-${String(i).padStart(2, '0')}`
    aRun(id, data, i === 20 || i === 21 ? { at: tie } : {})
    wanted.push({ run: id, agentId, why, runtime })
  }
  // ROWS THE DOOR NEVER HANDS BACK: every other state, no ask at all, a deleted run and a run of another project.
  for (const state of NEXT_ROUND_STATES.filter((one) => one !== WANTED_ROUND)) {
    aRun(`made-up-round-${state}`, { state: 'finished', servingAgentId: anAgent(`made-up-round-agent-${state}`), [NEXT_ROUND]: { state, askedAt: AT } })
  }
  aRun('made-up-run-with-no-ask', { state: 'finished', servingAgentId: anAgent('made-up-agent-with-no-ask') })
  aRun('made-up-round-deleted', { state: 'finished', servingAgentId: anAgent('made-up-agent-deleted'), [NEXT_ROUND]: { state: WANTED_ROUND, askedAt: AT } }, { deleted: true })
  aRun('made-up-round-elsewhere', { state: 'finished', servingAgentId: anAgent('made-up-agent-elsewhere'), [NEXT_ROUND]: { state: WANTED_ROUND, askedAt: AT } }, { project: ELSEWHERE })
  const updatedAt = new Map((db.prepare("SELECT id, updated_at AS at FROM records WHERE kind = 'session'").all() as { id: string; at: string }[]).map((row) => [row.id, row.at]))
  const byChangeThenId = <T extends { run: string }>(a: T, b: T): number => (updatedAt.get(a.run)! < updatedAt.get(b.run)! ? -1 : updatedAt.get(a.run)! > updatedAt.get(b.run)! ? 1 : a.run < b.run ? -1 : a.run > b.run ? 1 : 0)
  expected.rounds = [...wanted]
    .sort(byChangeThenId)
    .slice(0, 25)
    .filter((one) => one.why === 'kept')
    .map((one) => ({ run: one.run, agentId: one.agentId!, handle: `${one.agentId!}-handle`, runtime: one.runtime }))

  // ---------------------------------------------------------------- the worker runs
  // TWELVE RUNS OF THREE WANTED ENTRIES EACH, SO THE LIMIT OF 25 IS REACHED INSIDE A RUN. The entries of a run are
  // written out of the order of their keys, and one entry of each run is in another state.
  const entries: { run: string; agentId: string; why: 'kept' | 'a run going' | 'not registered' }[] = []
  const others = WORKER_RUN_STATES.filter((one) => one !== WANTED_WORKER_RUN)
  for (let r = 0; r < 12; r++) {
    const run = `made-up-worker-run-${String(r).padStart(2, '0')}`
    const all: Record<string, { state: string; askedAt: string; handle: string }> = {}
    const keys = ['c', 'a', 'b'].map((letter) => `made-up-worker-${String(r).padStart(2, '0')}-${letter}`)
    for (const [k, key] of keys.entries()) {
      const why = r === 1 && k === 1 ? 'a run going' : r === 4 && k === 0 ? 'not registered' : 'kept'
      const agentId = why === 'a run going' ? busy : why === 'not registered' ? notRegistered : anAgent(key)
      all[agentId] = { state: WANTED_WORKER_RUN, askedAt: AT, handle: `${agentId}-handle` }
      entries.push({ run, agentId, why })
    }
    const other = anAgent(`made-up-worker-${String(r).padStart(2, '0')}-not-wanted`)
    all[other] = { state: others[r % others.length]!, askedAt: AT, handle: `${other}-handle` }
    aRun(run, { state: 'finished', [WORKER_RUNS]: all })
  }
  // ROWS THE DOOR NEVER HANDS BACK: no worker runs, an empty list, a null, a deleted run and a run of another project.
  aRun('made-up-worker-run-empty', { state: 'finished', [WORKER_RUNS]: {} })
  aRun('made-up-worker-run-null', { state: 'finished', [WORKER_RUNS]: null })
  aRun('made-up-worker-run-deleted', { state: 'finished', [WORKER_RUNS]: { [anAgent('made-up-worker-deleted')]: { state: WANTED_WORKER_RUN, askedAt: AT, handle: 'x' } } }, { deleted: true })
  aRun('made-up-worker-run-elsewhere', { state: 'finished', [WORKER_RUNS]: { [anAgent('made-up-worker-elsewhere')]: { state: WANTED_WORKER_RUN, askedAt: AT, handle: 'x' } } }, { project: ELSEWHERE })
  const workerRunAt = new Map((db.prepare("SELECT id, updated_at AS at FROM records WHERE kind = 'session'").all() as { id: string; at: string }[]).map((row) => [row.id, row.at]))
  expected['worker runs'] = [...entries]
    .sort((a, b) => (workerRunAt.get(a.run)! < workerRunAt.get(b.run)! ? -1 : workerRunAt.get(a.run)! > workerRunAt.get(b.run)! ? 1 : a.run < b.run ? -1 : a.run > b.run ? 1 : a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0))
    .slice(0, 25)
    .filter((one) => one.why === 'kept')
    .map((one) => ({ run: one.run, agentId: one.agentId, handle: `${one.agentId}-handle` }))
}, 60_000)

afterAll(() => {
  t?.close()
})

/** A stored field by its name in `STORED_FIELDS`, or a failure naming it: read by name, so this file compiles before it is there. */
function theStoredField(door: ADoor): (data: SQLWrapper) => SQL {
  const name = THE_DOORS[door].field
  const field = (schema.STORED_FIELDS as unknown as Record<string, ((data: SQLWrapper) => SQL) | undefined>)[name]
  if (field === undefined) throw new Error(`STORED_FIELDS holds no ${name}, so the index of the ${door} and its door share no words.`)
  return field
}

/** The words of a door's stored field, read from the column as `column`. */
function theWords(door: ADoor, column: string): string {
  return schema.theWordsOfAStoredField(theStoredField(door), column)
}

/** The door's answer, and the statement it asked of the records. */
function ask(door: ADoor): { answer: unknown[]; statement: string } {
  const prepared: string[] = []
  keeping = prepared
  let answer: unknown[]
  try {
    answer = door === 'rounds' ? theRoundsToStart(PROJECT) : theWorkerRunsToStart(PROJECT)
  } finally {
    keeping = null
  }
  const statements = prepared.filter((one) => /\bFROM records\b/i.test(one) && /\bORDER BY\b/i.test(one) && /\bLIMIT\b/i.test(one))
  expect(statements.length, `the ${door} door's own read of the records`).toBe(1)
  return { answer, statement: statements[0]! }
}

describe('A. the two indexes', () => {
  for (const door of Object.keys(THE_DOORS) as ADoor[]) {
    it(`holds the index of the ${door} on the project and the deletion stamp, with the kind and its stored field's words as its WHERE`, () => {
      const row = t.client.sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?").get(THE_DOORS[door].index) as { sql: string } | undefined
      expect(row, `the index ${THE_DOORS[door].index}`).toBeDefined()
      const sql = row!.sql.replaceAll('`', '').replace(/\s+/g, ' ')
      expect(sql).toContain(`ON records (workspace_id, deleted_at) WHERE kind = 'session' AND ${theWords(door, 'data')}`)
      expect(sql.endsWith(theWords(door, 'data')), 'nothing after the stored field').toBe(true)
    })
  }
})

describe('B. each door asks in its index\'s words', () => {
  for (const door of Object.keys(THE_DOORS) as ADoor[]) {
    it(`asks the ${door} with the words of the index's WHERE, and SQLite reads the index`, () => {
      const { statement } = ask(door)
      const columns = ['data', 'records.data', '"records"."data"']
      expect(columns.some((column) => statement.includes(theWords(door, column))), `the ${door} statement holds the stored field's words:\n${statement}`).toBe(true)
      // THE WORKER-RUN STATEMENT TAKES THE FILED ALIASES AS ITS SECOND BIND: the map the code builds from the same
      // table, read here from that table so the parameter has the shape the door gives it.
      const aliasMap = Object.fromEntries(
        (t.client.sqlite.prepare('SELECT alias_id AS aliasId, canonical_id AS canonicalId FROM registry_aliases').all() as { aliasId: string; canonicalId: string }[]).map(
          (row) => [row.aliasId, row.canonicalId],
        ),
      )
      const binds = (statement.match(/\?/gu) ?? []).length === 1 ? [PROJECT] : [PROJECT, JSON.stringify(aliasMap)]
      const plan = (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${statement}`).all(...binds) as { detail: string }[]).map((one) => one.detail)
      expect(plan.some((line) => line.includes(`USING INDEX ${THE_DOORS[door].index} `)), `the plan of the ${door} door:\n${plan.join('\n')}`).toBe(true)
    })
  }
})

describe('C. what each door answers', () => {
  it('answers the wanted rounds by their change and id, the first 25, less each whose agent has a run going or none', () => {
    expect(expected.rounds.length, 'the planted rows leave some rounds to start').toBeGreaterThan(0)
    expect(ask('rounds').answer).toEqual(expected.rounds)
  })

  it('answers the wanted worker runs by their run\'s change, its id and the agent\'s id, the first 25, less each whose agent has a run going or is not registered', () => {
    expect(expected['worker runs'].length, 'the planted rows leave some worker runs to start').toBeGreaterThan(0)
    expect(ask('worker runs').answer).toEqual(expected['worker runs'])
  })
})

describe('D. each stored field keeps every row its door can hand back', () => {
  /** Whether a row with this data is in the door's index: 1 when the stored field is true, as SQLite reads a partial index's WHERE, else 0. */
  const kept = (door: ADoor, data: string): number => (t.client.sqlite.prepare(`SELECT CASE WHEN ${theWords(door, 'data')} THEN 1 ELSE 0 END AS kept FROM (SELECT ? AS data)`).get(data) as { kept: number }).kept

  it('keeps a run in the index of the rounds exactly when its next round is wanted, and a run whose data is not JSON', () => {
    const asks: unknown[] = [...NEXT_ROUND_STATES.map((state) => ({ state, askedAt: AT })), { state: 'Wanted' }, { state: ['wanted'] }, { state: null }, {}, null, 'wanted', []]
    for (const ask of asks) {
      const isWanted = typeof ask === 'object' && ask !== null && !Array.isArray(ask) && (ask as { state?: unknown }).state === WANTED_ROUND
      expect(kept('rounds', JSON.stringify({ state: 'finished', [NEXT_ROUND]: ask })), JSON.stringify(ask)).toBe(isWanted ? 1 : 0)
    }
    expect(kept('rounds', JSON.stringify({ state: 'finished' })), 'no next round').toBe(0)
    expect(kept('rounds', 'made-up words that are not JSON'), 'data that is not JSON').toBe(1)
  })

  it('keeps a run in the index of the worker runs whenever its data holds worker runs, and a run whose data is not JSON', () => {
    const lists: unknown[] = [...WORKER_RUN_STATES.map((state) => ({ 'made-up-agent': { state, askedAt: AT, handle: 'x' } })), {}, null, [], 'wanted']
    for (const list of lists) expect(kept('worker runs', JSON.stringify({ state: 'finished', [WORKER_RUNS]: list })), JSON.stringify(list)).toBe(1)
    expect(kept('worker runs', JSON.stringify({ state: 'finished' })), 'no worker runs').toBe(0)
    expect(kept('worker runs', 'made-up words that are not JSON'), 'data that is not JSON').toBe(1)
  })
})
