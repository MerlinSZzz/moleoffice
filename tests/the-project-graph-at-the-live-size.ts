// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT GRAPH'S PART OF A MADE-UP OFFICE AT THE LIVE SIZE: the revision rows of the first project and the links of
 * its graph records, added to an office `buildTheOfficeAtAScale` built at `THE_LIVE_OFFICE_ON_13_NOVEMBER`. Every row is
 * made up.
 *
 * WHY IT IS NEEDED. That builder makes no revision row, and the graph's slow read was a count over the project's
 * revisions. On the live office on 20 November that count read 203,799 rows (the live server's log).
 * The same log says the graph's records of the seven kinds were 686 rows and one read of the links 4,870 rows.
 *
 * WHAT IS COUNTED AND WHAT IS A GUESS.
 *   - Counted, from that log: the 203,799 revision rows, the 686 graph records and the 4,870 link rows. The office of
 *     13 November already holds 856 graph records in its first project, so none is added.
 *   - A guess: the revision rows are made 210,000, above the count. Every record of the project has one first revision,
 *     a `baseline` when it was made before the revisions table (18 August 2026) and a `create` after. Each graph record
 *     has `UPDATES_PER_GRAPH_RECORD` more, and the runs share the rest. The writes are spread evenly over the weeks
 *     after the table was built, a graph record's among the runs', so the newest graph revisions are not the newest rows.
 *   - A guess: each revision holds its record's made-up title and data as the builder left them, so a run's revision is
 *     as large as a made-up run.
 *   - A guess: the links are made up to `LINKS_OF_THE_GRAPH` with an end among the graph records, each from a graph
 *     record to another record of the project, of the type `relates_to`.
 */
import type Database from 'better-sqlite3'

/** The project the builder fills, which is the one the graph is read for. */
export const THE_PROJECT = 'default'

/** The live server's log of 20 November, and what this office is made to hold of each. */
export const THE_GRAPH_ON_20_NOVEMBER = {
  /** Counted: the rows the grouped count of the project's revisions read. */
  revisionRowsCounted: 203_799,
  /** A guess above the count: the revision rows this office's project holds. */
  revisionRows: 210_000,
  /** Counted: the live records of the seven kinds the graph reads. */
  graphRecordsCounted: 686,
  /** Counted: the rows one read of the links gave. */
  linkRowsCounted: 4_870,
} as const

/** A guess: the revisions of each graph record after its first. */
export const UPDATES_PER_GRAPH_RECORD = 3
/** A guess above the count: the links with an end among the graph records, after this step. */
export const LINKS_OF_THE_GRAPH = 5_000

/** The day the revisions table was built: a record made before it has a baseline as its first revision. */
const THE_TABLE_WAS_BUILT = '2026-08-18 12:00:00'
/** The last moment a made-up revision is written at. */
const THE_LAST_WRITE = '2026-11-19 18:00:00'

const GRAPH_KINDS = ['module', 'pipeline', 'block', 'trajectory', 'planned_state', 'direction', 'stopping_point']

function aStamp(ms: number): string {
  const at = new Date(ms)
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${String(at.getUTCFullYear())}-${two(at.getUTCMonth() + 1)}-${two(at.getUTCDate())} ${two(at.getUTCHours())}:${two(at.getUTCMinutes())}:${two(at.getUTCSeconds())}`
}

const msOf = (stamp: string): number => Date.parse(`${stamp.replace(' ', 'T')}Z`)

/** What this step added, by count. */
export interface TheGraphsPast {
  revisionRows: number
  graphRecords: number
  linksOfTheGraph: number
}

/** Adds the project's revision rows and its graph's links, in one transaction, and says how many there are. */
export function addTheProjectGraphsPast(sqlite: Database.Database): TheGraphsPast {
  const kinds = GRAPH_KINDS.map(() => '?').join(', ')
  type Row = { id: string; kind: string; title: string; summary: string | null; data: string; created_at: string; deleted_at: string | null }
  const held = sqlite
    .prepare(`select id, kind, title, summary, data, created_at, deleted_at from records where workspace_id = ? order by created_at, id`)
    .all(THE_PROJECT) as Row[]
  const graph = held.filter((one) => one.deleted_at === null && GRAPH_KINDS.includes(one.kind))
  const runs = held.filter((one) => one.kind === 'session')
  if (graph.length < THE_GRAPH_ON_20_NOVEMBER.graphRecordsCounted) {
    throw new Error(`The built project holds ${String(graph.length)} graph records, fewer than the ${String(THE_GRAPH_ON_20_NOVEMBER.graphRecordsCounted)} counted.`)
  }

  // Each write: the record, its op and when. First revisions at the record's making; the updates spread evenly.
  type Write = { record: Row; op: string; at: string }
  const writes: Write[] = held.map((record) =>
    record.created_at < THE_TABLE_WAS_BUILT ? { record, op: 'baseline', at: THE_TABLE_WAS_BUILT } : { record, op: 'create', at: record.created_at },
  )
  const updates = THE_GRAPH_ON_20_NOVEMBER.revisionRows - writes.length
  const graphUpdates = graph.length * UPDATES_PER_GRAPH_RECORD
  if (updates < graphUpdates || runs.length === 0) throw new Error(`The built project holds ${String(held.length)} records, too many for ${String(THE_GRAPH_ON_20_NOVEMBER.revisionRows)} revisions.`)
  const from = msOf(THE_TABLE_WAS_BUILT)
  const span = msOf(THE_LAST_WRITE) - from
  const everyGraphUpdate = updates / graphUpdates
  for (let u = 0, g = 0, r = 0; u < updates; u++) {
    const isGraph = g < graphUpdates && u >= Math.floor(g * everyGraphUpdate)
    const record = isGraph ? graph[g++ % graph.length]! : runs[r++ % runs.length]!
    writes.push({ record, op: 'update', at: aStamp(from + Math.floor(((u + 1) * span) / (updates + 1))) })
  }

  // Written in the order they happened, so the rows sit in the file as a live office's do; each record's seq counts up.
  writes.sort((one, other) => (one.at < other.at ? -1 : one.at > other.at ? 1 : 0))
  const seqOf = new Map<string, number>()
  const add = sqlite.prepare(
    `insert into revisions (id, record_id, workspace_id, seq, content_hash, kind, title, summary, data, deleted_at, op, actor_type, actor_id, session_id, at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, 'agent', 'made-up', null, ?)`,
  )
  const already = (sqlite.prepare(`select count(*) as n from links where from_id in (select id from records where workspace_id = ? and deleted_at is null and kind in (${kinds})) or to_id in (select id from records where workspace_id = ? and deleted_at is null and kind in (${kinds}))`).get(THE_PROJECT, ...GRAPH_KINDS, THE_PROJECT, ...GRAPH_KINDS) as { n: number }).n
  const link = sqlite.prepare(
    `insert into links (id, workspace_id, owner_id, from_id, to_id, type, inferred, created_by, created_by_type, created_at, updated_at)
     values (?, ?, 'owner', ?, ?, 'relates_to', 0, 'made-up', 'agent', ?, ?)`,
  )
  const others = held.filter((one) => !GRAPH_KINDS.includes(one.kind))
  sqlite.transaction(() => {
    writes.forEach((write, i) => {
      const seq = (seqOf.get(write.record.id) ?? 0) + 1
      seqOf.set(write.record.id, seq)
      add.run(`made-up-revision-${i.toString(36).padStart(6, '0')}`, write.record.id, THE_PROJECT, seq, `made-up-hash-${String(i)}`, write.record.kind, write.record.title, write.record.summary, write.record.data, write.op, write.at)
    })
    for (let l = 0; already + l < LINKS_OF_THE_GRAPH; l++) {
      const one = graph[l % graph.length]!
      const other = others[(l * 7_919) % others.length]!
      link.run(`made-up-graph-link-${String(l)}`, THE_PROJECT, one.id, other.id, one.created_at, one.created_at)
    }
  })()
  return {
    revisionRows: theProjectsRevisionRows(sqlite),
    graphRecords: graph.length,
    linksOfTheGraph: Math.max(already, LINKS_OF_THE_GRAPH),
  }
}

/** The revision rows the project holds now. */
export function theProjectsRevisionRows(sqlite: Database.Database): number {
  return (sqlite.prepare(`select count(*) as n from revisions where workspace_id = ?`).get(THE_PROJECT) as { n: number }).n
}
