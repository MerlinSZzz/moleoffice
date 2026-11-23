// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT IS RELATED TO A MODULE OR A PIPELINE: ONE WALK, ONE READING.
 *
 * A module's page and a pipeline's page list the decisions, reports and checklists about them. Each list reads the
 * same subjects, and the subjects are worked out once, here, by `theSubjectsOf`:
 *   - the scope itself;
 *   - for a pipeline, its blocks (`blockIds`) and the modules that implement them;
 *   - the sub-modules of any of those, at every depth, each once, by `part_of` links to it;
 *   - the runs with a `part_of` link to any of them.
 * Each subject keeps the subject it was reached from and how many steps that took, so a row can say which part it
 * came through. A loop in the stored links stops the walk at the first subject met twice.
 *
 * `relatedTo` reads one kind over the subjects: the decisions about each (`decisionsAbout` in ./decisionsabout.ts,
 * joined into one row per decision), the reports with an `about` link to one, or the checklists one of whose items
 * links one. The rows come newest first, then by id. Nothing is stored: it is worked out when it is read.
 *
 * GET /api/records/:id/related answers with it, and GET /api/records/reports-and-notes reads the same walk when it is
 * narrowed to a scope, so the Reports page and a module's page cannot disagree about which reports are its.
 */
import { reportReading, type ReportRow } from '@shared/attention.ts'
import { BLOCK_KIND, blockIdsOf } from '@shared/blocks.ts'
import { CHECKLIST_KIND } from '@shared/checklists.ts'
import type { PanelRecord } from '@shared/types.ts'
import { sqlite } from '../db/client.ts'
import { type BasisEntry } from './flow-reasons.ts'
import { decisionsAbout, INFERRED_FROM_ITS_FILES, type DecisionAbout, type HowItIsAbout } from './decisionsabout.ts'
import { getRecord } from './records/reading.ts'

/** The kinds of record a module's or a pipeline's page lists as related to it. */
export const RELATED_KINDS = ['decisions', 'reports', 'checklists'] as const
export type RelatedKind = (typeof RELATED_KINDS)[number]

/** The kinds of record that can be a scope. */
export const RELATED_SCOPE_KINDS = ['module', 'pipeline'] as const

/** The most rows one answer carries. */
export const RELATED_PAGE_MOST = 25

const MODULE_KIND = 'module'
const RUN_KIND = 'session'
const REPORT_KIND = 'report'

/** One record the walk reached: what it is, the subject it was reached from (null for the scope), and how far. */
export interface ASubject {
  id: string
  kind: string
  title: string
  via: string | null
  depth: number
}

/** A subject as a row names it: enough to draw a link to it. */
export interface ASubjectNamed {
  id: string
  kind: string
  title: string
}

/** One related record, as each of the three lists draws it. */
export interface ARelatedRow {
  id: string
  kind: string
  /** The record's title. */
  title: string
  /** A decision's day; a report's or a checklist's filing stamp. The order is newest first by this. */
  date: string
  /** True when the scope itself is one of the subjects that reached it. */
  directly: boolean
  /** The subjects other than the scope that reached it, in the order the walk met them. */
  through: ASubjectNamed[]
  /** True for a decision whose every reading was inferred from a module's stated files: nobody wrote it. */
  inferred: boolean
  /** On a decision row: the strongest reading, and the basis when it was asked for. */
  decision?: {
    how: HowItIsAbout
    nobodyWroteWhen: boolean
    throughTheFork: { id: string; title: string } | null
    inferredFrom?: { file: string; claim: string }[]
    basis?: BasisEntry[]
  }
  /** On a report row: what the reports panel draws, with the report's own `about` links. */
  report?: ReportRow
  /** On a checklist row: only the items whose links name a subject. */
  checklist?: { items: { id: string; words: string; state: string | null }[] }
}

/** The answer of GET /api/records/:id/related. */
export interface RelatedAnswer {
  scope: ASubjectNamed
  kind: RelatedKind
  rows: ARelatedRow[]
  /** How many rows the reading found, before the page was cut. */
  matched: number
  returned: number
  /** How many rows come after this page. */
  left: number
  offset: number
  limit: number
  /** The ids of the decisions about a subject that a later one replaced. They are not rows. Empty for other kinds. */
  replacedLeftOut: string[]
  /**
   * How many records of the kind asked are left out because they were deleted. Null for decisions: a deleted decision
   * is not read at all, so nobody counted them.
   */
  deletedLeftOut: number | null
  /** What could not be read, in words, so a short list is not taken for a whole one. Empty means all was read. */
  couldNotRead: string[]
}

/**
 * The rows of one SQL read of records by id: the ids are a JSON list, bound as one value. A record reached by its id
 * or by a link asks its kind and project with a unary plus, as src/server/db/a-row-found-by-id.ts says why, so SQLite
 * finds the few ids through the primary key and not every record of the kind through an index.
 */
type IdRow = { id: string; kind: string; title: string; to: string }

/**
 * THE SUBJECTS OF A MODULE OR A PIPELINE, the scope first and then in the order the walk meets them. A record of any
 * other kind is its own only subject, with the runs that are part of it.
 */
export function theSubjectsOf(scope: PanelRecord): ASubject[] {
  const workspaceId = scope.workspaceId
  const root: ASubject = { id: scope.id, kind: scope.kind, title: scope.title, via: null, depth: 0 }
  const out: ASubject[] = [root]
  const byId = new Map<string, ASubject>([[root.id, root]])
  const add = (row: IdRow): ASubject | null => {
    const from = byId.get(row.to)
    if (from === undefined || byId.has(row.id)) return null
    const one: ASubject = { id: row.id, kind: row.kind, title: row.title, via: from.id, depth: from.depth + 1 }
    byId.set(one.id, one)
    out.push(one)
    return one
  }

  let frontier: ASubject[] = [root]
  if (scope.kind === 'pipeline') {
    // THE BLOCKS, in the pipeline's own order, and then the modules that implement each.
    const order = blockIdsOf(scope)
    const blocks = (
      sqlite
        .prepare(
          'SELECT r.id AS id, r.kind AS kind, r.title AS title, ? AS "to" FROM records r ' +
            'WHERE r.id IN (SELECT value FROM json_each(?)) AND +r.kind = ? AND +r.workspace_id = ? AND r.deleted_at IS NULL',
        )
        .all(root.id, JSON.stringify(order), BLOCK_KIND, workspaceId) as IdRow[]
    ).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    const steps = blocks.map(add).filter((one): one is ASubject => one !== null)
    const implementing = theLinkedFrom('implements', MODULE_KIND, steps, workspaceId).map(add)
    frontier = [root, ...steps, ...implementing.filter((one): one is ASubject => one !== null)]
  }

  // THE SUB-MODULES AT EVERY DEPTH. `add` holds each once, so a loop in the stored links ends the walk.
  while (frontier.length > 0) {
    frontier = theLinkedFrom('part_of', MODULE_KIND, frontier, workspaceId)
      .map(add)
      .filter((one): one is ASubject => one !== null)
  }

  // THE RUNS PART OF ANY SUBJECT. A run is not walked further.
  for (const row of theLinkedFrom('part_of', RUN_KIND, out, workspaceId)) add(row)
  return out
}

/**
 * The live records of one kind with a link of one type to any of these subjects, oldest first, each once. A record
 * linked to two of them is reached from the one the walk met first.
 */
function theLinkedFrom(type: string, kind: string, to: readonly ASubject[], workspaceId: string): IdRow[] {
  if (to.length === 0) return []
  const at = new Map(to.map((one, i) => [one.id, i]))
  const rows = sqlite
    .prepare(
      'SELECT r.id AS id, r.kind AS kind, r.title AS title, l.to_id AS "to" FROM links l ' +
        'JOIN records r ON r.id = l.from_id ' +
        'WHERE l.type = ? AND l.to_id IN (SELECT value FROM json_each(?)) AND +r.kind = ? AND +r.workspace_id = ? ' +
        'AND r.deleted_at IS NULL ORDER BY r.created_at, r.id',
    )
    .all(type, JSON.stringify([...at.keys()]), kind, workspaceId) as IdRow[]
  const first = new Map<string, IdRow>()
  for (const row of rows) {
    const before = first.get(row.id)
    if (before === undefined || (at.get(row.to) ?? 0) < (at.get(before.to) ?? 0)) first.set(row.id, row)
  }
  return [...first.values()]
}

/** How strong each way a decision is about a record is, strongest first, as decisionsAbout keeps them. */
const STRONGEST_FIRST: readonly HowItIsAbout[] = ['governs it', 'linked to it', 'settled a fork about it', INFERRED_FROM_ITS_FILES]

/** One row being gathered: the row, and where it was met. */
interface Gathering {
  row: ARelatedRow
  reachedBy: Set<string>
}

/** Mark a row as reached by one subject: directly for the scope, through it for any other. */
function reachedBy(gathered: Gathering, subject: ASubject): void {
  if (gathered.reachedBy.has(subject.id)) return
  gathered.reachedBy.add(subject.id)
  if (subject.via === null) gathered.row.directly = true
  else gathered.row.through.push({ id: subject.id, kind: subject.kind, title: subject.title })
}

/** Newest first by the row's date, then by id. */
function newestFirst(a: ARelatedRow, b: ARelatedRow): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** The decisions about every subject, one row each, with the replaced ones left out and named. */
function theDecisions(subjects: readonly ASubject[], workspaceId: string, withBasis: boolean) {
  const rows = new Map<string, Gathering & { reading: DecisionAbout }>()
  const replaced = new Set<string>()
  const couldNotRead = new Set<string>()
  for (const subject of subjects) {
    const about = decisionsAbout({ workspaceId, recordId: subject.id, withBasis })
    for (const id of about.replacedLeftOut) replaced.add(id)
    for (const line of about.couldNotRead) couldNotRead.add(line)
    for (const one of about.decisions) {
      let gathered = rows.get(one.id)
      if (gathered === undefined) {
        gathered = {
          row: { id: one.id, kind: 'decision', title: one.title, date: one.decidedOn, directly: false, through: [], inferred: false },
          reachedBy: new Set(),
          reading: one,
        }
        rows.set(one.id, gathered)
      }
      // THE STRONGER READING IS KEPT: a decision the scope's sub-module governs and the scope's files infer governs.
      if (STRONGEST_FIRST.indexOf(one.how) < STRONGEST_FIRST.indexOf(gathered.reading.how)) gathered.reading = one
      reachedBy(gathered, subject)
    }
  }
  const out = [...rows.values()].map(({ row, reading }) => ({
    ...row,
    inferred: reading.how === INFERRED_FROM_ITS_FILES,
    decision: {
      how: reading.how,
      nobodyWroteWhen: reading.nobodyWroteWhen,
      throughTheFork: reading.throughTheFork,
      ...(reading.inferredFrom === undefined ? {} : { inferredFrom: reading.inferredFrom }),
      ...(reading.basis === undefined ? {} : { basis: reading.basis }),
    },
  }))
  return { rows: out, replacedLeftOut: [...replaced].sort(), deletedLeftOut: null, couldNotRead: [...couldNotRead] }
}

/** The reports with an `about` link to any subject. A deleted one is counted, never listed. */
function theReports(subjects: readonly ASubject[], workspaceId: string) {
  const byId = new Map(subjects.map((one) => [one.id, one]))
  const found = sqlite
    .prepare(
      'SELECT r.id AS id, r.title AS title, r.created_at AS createdAt, r.deleted_at AS deletedAt, l.to_id AS "to" ' +
        'FROM links l JOIN records r ON r.id = l.from_id ' +
        'WHERE l.type = ? AND l.to_id IN (SELECT value FROM json_each(?)) AND +r.kind = ? AND +r.workspace_id = ?',
    )
    .all('about', JSON.stringify([...byId.keys()]), REPORT_KIND, workspaceId) as {
    id: string
    title: string
    createdAt: string
    deletedAt: string | null
    to: string
  }[]
  const deleted = new Set(found.filter((one) => one.deletedAt !== null).map((one) => one.id))
  const rows = new Map<string, Gathering>()
  for (const one of found) {
    if (one.deletedAt !== null) continue
    const subject = byId.get(one.to)
    if (subject === undefined) continue
    let gathered = rows.get(one.id)
    if (gathered === undefined) {
      gathered = {
        row: { id: one.id, kind: REPORT_KIND, title: one.title, date: one.createdAt, directly: false, through: [], inferred: false },
        reachedBy: new Set(),
      }
      rows.set(one.id, gathered)
    }
    reachedBy(gathered, subject)
  }
  // THE THROUGH LIST IN THE ORDER THE WALK MET THE SUBJECTS, whatever order the links were read in.
  const at = new Map(subjects.map((one, i) => [one.id, i]))
  for (const { row } of rows.values()) row.through.sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0))
  return { rows: [...rows.values()].map(({ row }) => row), replacedLeftOut: [], deletedLeftOut: deleted.size, couldNotRead: [] }
}

/** What the reports panel draws for one report: its reading, with its own `about` links to live records. */
function theReportReading(id: string): ReportRow | null {
  const record = getRecord(id)
  if (record === null) return null
  const about = sqlite
    .prepare(
      'SELECT l.to_id AS recordId, r.title AS title FROM links l JOIN records r ON r.id = l.to_id ' +
        'WHERE l.from_id = ? AND l.type = ? AND r.deleted_at IS NULL ORDER BY l.created_at, l.to_id',
    )
    .all(id, 'about') as { recordId: string; title: string }[]
  return reportReading(record, about)
}

/** The checklists one of whose items links a subject, each with only those items. A deleted one is counted. */
function theChecklists(subjects: readonly ASubject[], workspaceId: string) {
  const byId = new Map(subjects.map((one) => [one.id, one]))
  const found = sqlite
    .prepare(
      'SELECT r.id AS id, r.title AS title, r.created_at AS createdAt, r.deleted_at AS deletedAt, r.data AS data ' +
        'FROM records r WHERE r.kind = ? AND r.workspace_id = ? AND EXISTS (' +
        "SELECT 1 FROM json_each(r.data, '$.items') i, json_each(i.value, '$.links') k " +
        'WHERE k.value IN (SELECT value FROM json_each(?)))',
    )
    .all(CHECKLIST_KIND, workspaceId, JSON.stringify([...byId.keys()])) as {
    id: string
    title: string
    createdAt: string
    deletedAt: string | null
    data: string | null
  }[]
  const rows: ARelatedRow[] = []
  let deleted = 0
  for (const one of found) {
    if (one.deletedAt !== null) {
      deleted += 1
      continue
    }
    // THE QUERY FOUND AN ITEM NAMING A SUBJECT, so the stored data is a JSON object holding a list of items.
    const data = JSON.parse(one.data ?? '{}') as { items?: unknown } | null
    const items = data !== null && Array.isArray(data.items) ? (data.items as unknown[]) : []
    const gathered: Gathering = {
      row: { id: one.id, kind: CHECKLIST_KIND, title: one.title, date: one.createdAt, directly: false, through: [], inferred: false },
      reachedBy: new Set(),
    }
    const kept: { id: string; words: string; state: string | null }[] = []
    for (const item of items) {
      if (item === null || typeof item !== 'object') continue
      const { id, words, state, links } = item as { id?: unknown; words?: unknown; state?: unknown; links?: unknown }
      const named = (Array.isArray(links) ? links : []).filter((link): link is string => typeof link === 'string' && byId.has(link))
      if (named.length === 0) continue
      kept.push({
        id: typeof id === 'string' ? id : '',
        words: typeof words === 'string' ? words : '',
        state: typeof state === 'string' ? state : null,
      })
      for (const subject of subjects) if (named.includes(subject.id)) reachedBy(gathered, subject)
    }
    rows.push({ ...gathered.row, checklist: { items: kept } })
  }
  return { rows, replacedLeftOut: [], deletedLeftOut: deleted, couldNotRead: [] }
}

/**
 * WHAT IS RELATED TO A MODULE OR A PIPELINE, of one kind: every row the walk's subjects reach, newest first and then
 * by id, cut to one page. A report row carries what the reports panel draws for the rows of the page only.
 */
export function relatedTo(
  scope: PanelRecord,
  kind: RelatedKind,
  page: { limit: number; offset: number; withBasis: boolean },
): RelatedAnswer {
  const subjects = theSubjectsOf(scope)
  const read =
    kind === 'decisions'
      ? theDecisions(subjects, scope.workspaceId, page.withBasis)
      : kind === 'reports'
        ? theReports(subjects, scope.workspaceId)
        : theChecklists(subjects, scope.workspaceId)
  const sorted = [...read.rows].sort(newestFirst)
  const cut = sorted.slice(page.offset, page.offset + page.limit)
  const rows =
    kind === 'reports'
      ? cut.flatMap((row) => {
          const report = theReportReading(row.id)
          return report === null ? [] : [{ ...row, report }]
        })
      : cut
  return {
    scope: { id: scope.id, kind: scope.kind, title: scope.title },
    kind,
    rows,
    matched: sorted.length,
    returned: rows.length,
    left: Math.max(0, sorted.length - page.offset - cut.length),
    offset: page.offset,
    limit: page.limit,
    replacedLeftOut: read.replacedLeftOut,
    deletedLeftOut: read.deletedLeftOut,
    couldNotRead: read.couldNotRead,
  }
}
