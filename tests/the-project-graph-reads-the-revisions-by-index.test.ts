// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT GRAPH READS THE REVISIONS BY INDEX, AT ANY SIZE. Wave 13s round 281, package PG, point PG-1: the cause
 * of the slow graph, held in a fresh office.
 *
 * GET /api/project-graph read the revision rows twice. It counted the project's revisions, grouped by record, through
 * `revisions_workspace_at_idx`, which leads to the rows themselves: every revision of the project was read, with its
 * data. Then it read the newest real revisions of the graph's records by a join that SQLite also began from that index,
 * so every revision of the project was read again. A row's `op` and `at` are stored after its data, so each row read
 * meant every page of its data. A fresh office has few rows and answers quickly; the person's office answered in 87 s.
 *
 * HOW THE READS ARE CAUGHT, as tests/the-project-board-reads-no-whole-table.test.ts catches them: while the graph is
 * read, `all`, `get`, `iterate` and `run` are wrapped on the prototype of better-sqlite3's statements. Each caught read
 * is then asked `EXPLAIN QUERY PLAN` with the values it was given. The office has no `sqlite_stat1`, as the person's has
 * none, so SQLite chooses here as it chooses there.
 *
 * THE OFFICE. Every record, revision and word is made up and written straight to the tables: more graph records than
 * one piece of ids holds, each with a first revision and two updates, many at the same second, so the newest real
 * revisions come from both pieces and their order turns on `seq` and the id. Beside them, rows the newest revisions must
 * leave out, each newer than any it keeps: a baseline, a deleted graph record, a record of a kind the graph does not
 * draw, a graph record of another project, and a revision row of this project's graph record written in another project.
 *
 * THE CASES:
 *   1. No statement the read runs reads the project's revision rows: each step of a plan over `revisions` searches it
 *      by a record id, or searches an index that holds every column the statement asks for.
 *   2. The totals of each record's revisions are counted from `revisions_workspace_record_op_at_idx` alone, in its
 *      order, with no temporary tree for the grouping.
 *   3. The newest real revisions are searched by the graph's record ids, piece by piece, never by the project.
 *   4. The newest real revisions are the same rows as before: the graph's own, no baseline, newest first by `at`, then
 *      `seq`, then the id, cut at PROJECT_GRAPH_REVISION_ROWS across the pieces, and the rest counted in `leftOut`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ProjectGraphReply } from '../src/shared/project-graph.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb

/** One statement the read ran, with the values it was given and how. */
interface ACaughtStatement {
  text: string
  args: unknown[]
  how: 'all' | 'get' | 'iterate' | 'run'
}

/** Every statement that runs during `work`, caught on the statements' prototype. */
function theStatementsDuring<T>(work: () => T): { answer: T; caught: ACaughtStatement[] } {
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, unknown>
  const originals = new Map<ACaughtStatement['how'], (...args: unknown[]) => unknown>()
  const caught: ACaughtStatement[] = []
  for (const how of ['all', 'get', 'iterate', 'run'] as const) {
    const original = prototype[how] as (...args: unknown[]) => unknown
    originals.set(how, original)
    prototype[how] = function (this: { source: string }, ...args: unknown[]) {
      caught.push({ text: this.source, args, how })
      return original.apply(this, args)
    }
  }
  try {
    return { answer: work(), caught }
  } finally {
    for (const [how, original] of originals) prototype[how] = original
  }
}

function thePlanOf(statement: ACaughtStatement): string[] {
  const plan = t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${statement.text}`).all(...(statement.args as never[])) as { detail: string }[]
  return plan.map((step) => step.detail)
}

const THE_PROJECT = 'default'
const ANOTHER_PROJECT = 'made-up-other-project'
const GRAPH_KINDS = ['module', 'pipeline', 'block', 'trajectory', 'planned_state', 'direction', 'stopping_point']
/** Newer than every revision the read keeps, for the rows it must leave out. */
const NEWER = '2026-11-30 12:00:00'

/** One revision row as it was written. */
interface AWrittenRevision {
  id: string
  recordId: string
  workspaceId: string
  seq: number
  op: string
  at: string
  title: string
}

let read: { answer: ProjectGraphReply; caught: ACaughtStatement[] }
const written: AWrittenRevision[] = []
/** The graph's live records of the project, in the order they were made, which is the order of the pieces. */
const graph: string[] = []
let idsAtOnce = 0
let revisionRows = 0

beforeAll(async () => {
  delete process.env['MOLE_OFFICE_IDLE_REMINDER_HOURS']
  t = await freshDb()
  const { readProjectGraph } = await import('../src/server/lib/project-graph.ts')
  idsAtOnce = (await import('../src/server/db/in-pieces.ts')).IDS_AT_ONCE
  revisionRows = (await import('../src/shared/project-graph.ts')).PROJECT_GRAPH_REVISION_ROWS
  const sqlite = t.client.sqlite
  const addRecord = sqlite.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) values (?, ?, 'owner', ?, ?, ?, ?, null, ?, ?, 'fixture')`,
  )
  const addRevision = sqlite.prepare(
    `insert into revisions (id, record_id, workspace_id, seq, content_hash, kind, title, summary, data, deleted_at, op, actor_type, actor_id, session_id, at) values (?, ?, ?, ?, ?, ?, ?, null, '{}', null, ?, 'agent', 'made-up', null, ?)`,
  )
  const revision = (recordId: string, kind: string, workspaceId: string, seq: number, op: string, at: string): void => {
    const n = written.length
    // The ids are not in the order the rows were written, so a tie on `at` and `seq` is decided by the id alone.
    const one = { id: `made-up-revision-${((n * 7_919) % 100_003).toString(36).padStart(5, '0')}`, recordId, workspaceId, seq, op, at, title: `Made-up revision ${String(n)}` }
    written.push(one)
    addRevision.run(one.id, recordId, workspaceId, seq, `made-up-hash-${String(n)}`, kind, one.title, op, at)
  }
  const two = (n: number): string => String(n).padStart(2, '0')
  sqlite.transaction(() => {
    const records = idsAtOnce + 100
    for (let r = 0; r < records; r++) {
      const id = `made-up-graph-record-${String(r).padStart(4, '0')}`
      const kind = GRAPH_KINDS[r % GRAPH_KINDS.length]!
      const made = `2026-09-${two(1 + Math.floor(r / 60))} ${two(r % 24)}:${two(r % 60)}:00`
      addRecord.run(id, THE_PROJECT, made, made, kind, `Made-up ${kind} ${String(r)}`, kind === 'pipeline' ? '{"blockIds":[]}' : '{}', null)
      graph.push(id)
      revision(id, kind, THE_PROJECT, 1, r % 5 === 0 ? 'baseline' : 'create', r % 5 === 0 ? '2026-08-18 12:00:00' : made)
      // Nine days and sixty minutes: many updates share a second, across both pieces.
      for (const seq of [2, 3]) revision(id, kind, THE_PROJECT, seq, 'update', `2026-11-${two(10 + ((r * 7 + seq) % 9))} 10:${two((r * 13 + seq) % 60)}:00`)
    }
    // The rows the newest revisions must leave out, each newer than every row they keep.
    revision(graph[1]!, 'pipeline', THE_PROJECT, 4, 'baseline', NEWER)
    addRecord.run('made-up-deleted-module', THE_PROJECT, '2026-10-01 09:00:00', NEWER, 'module', 'Made-up deleted module', '{}', NEWER)
    revision('made-up-deleted-module', 'module', THE_PROJECT, 1, 'create', NEWER)
    addRecord.run('made-up-task', THE_PROJECT, '2026-10-01 09:00:00', NEWER, 'task', 'Made-up task', '{}', null)
    revision('made-up-task', 'task', THE_PROJECT, 1, 'create', NEWER)
    addRecord.run('made-up-module-elsewhere', ANOTHER_PROJECT, '2026-10-01 09:00:00', NEWER, 'module', 'Made-up module elsewhere', '{}', null)
    revision('made-up-module-elsewhere', 'module', ANOTHER_PROJECT, 1, 'create', NEWER)
    revision(graph[2]!, 'block', ANOTHER_PROJECT, 4, 'update', NEWER)
  })()

  read = theStatementsDuring(() => readProjectGraph(THE_PROJECT))
}, 120_000)

afterAll(() => {
  t?.close()
})

/** The statements whose text reads the revisions table. */
const overTheRevisions = (): ACaughtStatement[] => read.caught.filter((statement) => /from "revisions"/u.test(statement.text))

describe('the project graph reads the revisions by index', () => {
  it("1. no statement it runs reads the project's revision rows", () => {
    const statements = overTheRevisions()
    expect(statements.length, 'the reads of the revisions').toBeGreaterThan(0)
    const wide = statements
      .map((statement) => ({ text: statement.text, plan: thePlanOf(statement) }))
      .filter((one) =>
        one.plan.some((step) => /\brevisions\b/u.test(step) && !/^SEARCH revisions USING (COVERING INDEX \w+|INDEX \w+ \(record_id=\?)/u.test(step)),
      )
    expect(wide, JSON.stringify(wide, null, 1)).toEqual([])
  })

  it('2. counts each record\'s revisions from revisions_workspace_record_op_at_idx alone, in its order', () => {
    const grouped = overTheRevisions().filter((statement) => /group by "revisions"\."record_id"/u.test(statement.text))
    expect(grouped).toHaveLength(1)
    expect(thePlanOf(grouped[0]!)).toEqual(['SEARCH revisions USING COVERING INDEX revisions_workspace_record_op_at_idx (workspace_id=?)'])
  })

  it("3. searches the newest real revisions by the graph's record ids, piece by piece", () => {
    // A select from one table writes its columns without the table's name, so the read is found by its order, which
    // the old join wrote in the same words.
    const newest = overTheRevisions().filter((statement) =>
      /order by "revisions"\."at" desc, "revisions"\."seq" desc, "revisions"\."id" desc/u.test(statement.text),
    )
    expect(newest.length, 'the reads of the newest revisions').toBeGreaterThan(0)
    for (const statement of newest) {
      const plan = thePlanOf(statement).join(' | ')
      expect(plan, statement.text).toMatch(/SEARCH revisions USING INDEX revisions_record_(at|seq)_idx \(record_id=\?\)/u)
      expect(plan, statement.text).not.toMatch(/revisions_workspace_at_idx/u)
    }
  })

  it('4. keeps the same newest real revisions: the graph\'s own, newest first, cut across the pieces', () => {
    const live = new Set(graph)
    const kept = written
      .filter((one) => live.has(one.recordId) && one.workspaceId === THE_PROJECT && one.op !== 'baseline')
      .sort((one, other) =>
        one.at !== other.at ? (one.at < other.at ? 1 : -1) : one.seq !== other.seq ? other.seq - one.seq : one.id < other.id ? 1 : -1,
      )
    const expected = kept.slice(0, revisionRows).map(({ recordId, seq, at, op, title }) => ({ recordId, seq, at, op, title }))

    // The case is about something: the newest rows come from both pieces, and some tie on `at` and on `seq` both.
    const piece = (recordId: string): number => Math.floor(graph.indexOf(recordId) / idsAtOnce)
    expect(new Set(expected.map((one) => piece(one.recordId))), 'the pieces the newest rows come from').toEqual(new Set([0, 1]))
    expect(expected.some((one, i) => i > 0 && one.at === expected[i - 1]!.at && one.seq === expected[i - 1]!.seq), 'a tie decided by the id').toBe(true)
    expect(kept.length, 'more real revisions than are kept').toBeGreaterThan(revisionRows)

    expect(read.answer.revisions.entries).toEqual(expected)
    expect(read.answer.revisions.leftOut).toBe(kept.length - revisionRows)
  })
})
