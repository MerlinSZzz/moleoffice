// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH RESTRICTIONS REACH A PIECE OF WORK, AND HOW THEY GOT THERE.
 *
 * ---------------------------------------------------------------------------------------
 * ONE WALK IN THE PRODUCT, AND THIS IS IT
 * ---------------------------------------------------------------------------------------
 *
 * A `placeholder` or a `ran_instead` record says what work stays valid and what may not be
 * claimed. Those two authored lists have to reach the records that rest on the restricted one, or
 * a fresh reader sees `fx = 600` and loses *temporary placeholder; not valid for geometry*.
 *
 * Three sibling designs asked for this read and gave it three different names —
 * `restrictionsOn`, `activePlaceholdersFor`, `placeholdersAffecting`. Three names for one function
 * is the defect this campaign is about, so the names are settled here and there are three of them,
 * one per question a caller can have:
 *
 *   restrictionsOn(recordId)        one record. The record page, the block page, the review pane.
 *   restrictionsReaching(ids)       many records, one pass. The graph, a pipeline page, a bundle.
 *   restrictionsInScope(input)      a scope. A boundary, a work domain, a bundle, an envelope.
 *
 * And one export that is not a fourth way to read restrictions: `restrictionsFrom(restrictionId)`
 * answers the opposite question — from a restriction, which records — and the resolution path is
 * its only caller. It is the SAME `walk` with `direction` reversed, so the set that gets
 * re-validation rows cannot drift from the set the reads return. Nothing else may call it.
 *
 * ---------------------------------------------------------------------------------------
 * IT WRITES NOTHING. EVER.
 * ---------------------------------------------------------------------------------------
 *
 * Every function here is a read. The re-validation rows are written by the resolution path in
 * `resolveRestriction` below, which is called from a LINK WRITE and never from a read. A write
 * hung off a read would turn "asking what restricts a record materialises nothing" in
 * `tests/resolution-validates-nothing.test.ts` red, correctly.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT TRAVELS, AND THE ONE THING THAT NEVER DOES
 * ---------------------------------------------------------------------------------------
 *
 * Travels unchanged: the id, kind and title; the severity; both authored lists STRING FOR STRING;
 * `holds_field` where the reached record is the one it is about; the standing; and the path.
 *
 * Does not travel: `harmless` restrictions, at all (§ below); the `substitute`, because a
 * downstream finding does not use `fx = 600`, it uses a result computed with it; and ANY VERDICT.
 *
 * **Mole Office never answers *is this claim still valid*.** No field, no reply key, no derived
 * boolean. It answers: this record is reached by P17, at distance 2, through these two links, and
 * P17's author wrote that it may be used for pipeline plumbing and may not support geometric
 * accuracy. Deciding whether a particular assertion falls inside *geometric accuracy* is reading,
 * and a machine doing it would be inventing a judgement. There is no `tainted`, no `valid` and no
 * `blocked` key here and there must not be one.
 *
 * ---------------------------------------------------------------------------------------
 * `harmless` DOES NOT ENTER THE WALK
 * ---------------------------------------------------------------------------------------
 *
 * A restriction whose author said nothing rests on it is drawn on the record it is `about` and
 * nowhere else, and it writes no re-validation rows when it is resolved. That is the owner's *"do
 * not make harmless Placeholders visually equivalent to production-blocking ones"* made
 * behavioural: a harmless one cannot look like a production-blocking one because it is not in the
 * same places.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE FOUR EDGES, AND WHY NOT THE OTHERS
 * ---------------------------------------------------------------------------------------
 *
 * A restriction travels along links whose declared meaning is *the content of one came from the
 * other*: `consumes`, `derived_from`, `produces`, `measures`.
 *
 * `blocks` is excluded and it is the most common structural type, so the reason matters: it means
 * *you cannot start until*, which is about TIME, not about content. A result does not inherit a
 * restriction from something that was merely holding it up. That holds hardest for a `hard` gate,
 * which is the majority case: a hard gate is precisely where the downstream work has not run yet,
 * so there is no result of it for a restriction to be about. Where content really did move, that
 * is a `consumes` or a `derived_from` link and the walk finds it there.
 *
 * `implements` and `part_of` are CARRIED, not inherited: a module that implements a restricted
 * block reports *a step you carry has a restriction*, and the module's own claims are untouched.
 *
 * `about`, `relates_to`, `discusses`, `resolves`, `contradicts` assert that nothing moved. `about`
 * is declared as *the honest weak statement*, and propagating along it would put a restriction on
 * a third of the corpus.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS CACHED
 * ---------------------------------------------------------------------------------------
 *
 * MEASURED ON A COPY OF THE OWNER'S CORPUS ON 26 AUGUST 2026, by
 * `design/round-ten/scratch/w8-dependency-edges.mjs`, which is in the repository so the next reader
 * re-runs it rather than trusting this paragraph:
 *
 *   674 live records, 720 links with both ends live
 *   89 of those are the four dependency types — 0.132 per record
 *   the widest downstream walk reaches 8 records and is 3 links deep
 *   the widest upstream walk reaches 6 records and is 3 links deep; nothing is deeper than 3
 *   66 records have anything downstream of them; 75 rest on anything at all
 *
 * A cache over 89 edges would be the only thing in this file that could go stale, would need
 * invalidating on every link write and every soft delete, and would save microseconds. THE NUMBER
 * TO WATCH IS THE EDGE COUNT, NOT THE RECORD COUNT.
 *
 * AND THE SAME MEASUREMENT IS THIS FEATURE'S LARGEST RISK, so it is written here rather than only
 * in the design: **599 of 674 records rest on nothing recorded.** On this corpus a placeholder
 * would reach almost nothing, and the feature will look as though it does not work when what is
 * missing is the links. If the edge count is still near 89 six weeks after this ships while
 * placeholders are being filed, the value is in the record page and the boundary reminder, not in
 * propagation — and the answer is NOT to widen the walk to `blocks` and `about` to make it find
 * things. Widening a walk to find things is how a restriction lands on work its author never
 * restricted.
 *
 * (The design this was built from said 47 edges across 334 records. That was true when it was
 * written and the corpus has since doubled; the shape of the answer did not change.)
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { links, records, revalidations } from '../db/schema.ts'
import {
  RESTRICTION_KINDS,
  RESTRICTION_SEVERITY,
  restrictionCounts,
  type RestrictionCounts,
  type RestrictionKind,
  type RestrictionSeverity,
} from '../../shared/restriction.ts'
import { CONTAINMENT_LINK, descendantsOf, partsOf, type ContainmentContext, type ContainmentLink } from '../../shared/containment.ts'
import type { LinkType, PanelRecord } from '../../shared/types.ts'
import { MESSAGE_CENTRE } from '../../shared/workspaces.ts'

// ============================================================================ what comes back

/**
 * One step of the path that reached a record.
 *
 * `linkId` is null on a `code` hop, where the edge came from the Implementation Map rather than
 * from a `links` row, and `because` carries the Map's own sentence UNCHANGED — a sentence Mole Office
 * rewrote would be a claim about what the resolver meant.
 */
export interface Hop {
  linkId: string | null
  type: LinkType | 'code'
  recordId: string
  because?: string
}

/**
 * Where a restriction stands, computed in ONE place and nowhere else.
 *
 * `active` — nothing has answered it.
 * `resolved-unchecked` — something answered it, and this record has not been looked at since.
 *     `revalidationId` is null when no row exists yet, which happens when the record became a
 *     dependency AFTER the resolution. It reads honestly as *nobody has re-checked this one*.
 * `resolved` — harmless only. Nothing was ever owed, so there is nothing to be unchecked about.
 */
export type Standing =
  | { state: 'active' }
  | { state: 'resolved-unchecked'; resolvedAt: string; resolvedBy: string; revalidationId: string | null }
  | { state: 'resolved'; resolvedAt: string; resolvedBy: string }

/** How a restriction got to the record being asked about. */
export type Reach =
  /** This record is what the restriction is declared about. */
  | { how: 'direct' }
  /**
   * A piece of this carries it. THIS RECORD'S OWN CLAIMS ARE NOT RESTRICTED — a module that
   * implements a restricted block reports the block's restriction, and says nothing about itself.
   */
  | { how: 'carried'; through: 'implements' | 'part_of'; carriedFrom: string }
  /** The content of this record came, through these hops, from the restricted one. */
  | { how: 'depends'; distance: number; path: Hop[] }

/** One restriction, as it reaches one record. */
export interface RestrictionReading {
  restrictionId: string
  kind: RestrictionKind
  title: string
  severity: RestrictionSeverity
  /** The author's strings, unchanged. Mole Office never re-words, summarises or merges these. */
  allowedUses: string[]
  /** The author's strings, unchanged. Both halves: what may not be claimed AND what it may not be used for. */
  disallowedClaims: string[]
  /** The field key this restriction holds, when it holds one and this is the record it is about. */
  holdsField: string | null
  reach: Reach
  standing: Standing
  // There is no `valid`, no `tainted` and no `blocked` key, and the header says why.
}

/**
 * ONE SHAPE FOR ALL THREE READS.
 *
 * `couldNotCheck` is on every one of them, and that is the point: without it, *no restrictions*
 * and *nobody looked* are the same reply, which is the one thing this feature exists to prevent.
 * A `Map` cannot carry a second key, which is why the map lives inside `found`.
 */
export interface RestrictionsReply<T> {
  found: T
  /** Records the walk could not go through because they have been deleted. Counted, never hidden. */
  skippedDeleted: number
  /** Every honest failure, each said as itself. An empty array means the check really did run. */
  couldNotCheck: { what: string; because: string }[]
}

/**
 * The four counts a scope reply carries. It is `RestrictionCounts` under this file's own name,
 * because the arithmetic is shared with the screen — see `countsOf` below.
 */
export type ScopeCounts = RestrictionCounts

// ============================================================================ the four edges

/**
 * The link types a restriction travels along. The direction says which way to walk FROM A
 * DEPENDENT RECORD — that is, upstream, towards what it was made from.
 */
const DEPENDENCY_EDGES: Readonly<Record<string, 'outgoing' | 'incoming'>> = {
  // A consumes B: B's content is an input to A.
  consumes: 'outgoing',
  // A derived_from B: A came out of B.
  derived_from: 'outgoing',
  // A produces B: B is A's output, so B carries what A was.
  produces: 'incoming',
  // A measures B: A is a measurement OF B. This is the camera-calibration case exactly.
  measures: 'outgoing',
}

/** The two types that CARRY a restriction without inheriting it. */
const CARRYING_EDGES = ['implements', 'part_of'] as const

interface Edge {
  linkId: string | null
  type: LinkType | 'code'
  /** The dependent end: the record whose content came from `from`. */
  dependent: string
  /** The end the content came from. */
  from: string
  because?: string
}

/**
 * WHAT AN UPSTREAM WALK AND THE READINGS READ, AND NOTHING MORE. `upstreamOf` builds one for the records
 * asked about, and the whole graph below is one too.
 *
 * The graph of the records asked holds only the edges an upstream walk from any of them can reach, and its
 * `live` and `deleted` answer only for those records and the far ends of those edges. So it has no downstream
 * edges and no titles, and its own type keeps it from the downstream walk and from every read that names
 * records by title.
 */
interface UpstreamGraph {
  /** Keyed on the id of the record that DEPENDS, so an upstream walk reads it directly. */
  upstream: Map<string, Edge[]>
  deleted: Pick<ReadonlySet<string>, 'has'>
  live: Pick<ReadonlySet<string>, 'has'>
  /** Every `about` link out of a restriction: restriction id -> the records it is declared about. */
  declaredScope: Map<string, string[]>
  /** Every `implements`/`part_of` link: the carrier id -> {carriedFrom, through}. One record's graph holds its own. */
  carries: Map<string, { carriedFrom: string; through: 'implements' | 'part_of' }[]>
  restrictions: Map<string, PanelRecord>
  /** restriction id -> the `resolves` link into it, if any. */
  resolved: Map<string, { at: string; by: string }>
}

/** The whole graph of a project. */
interface Graph extends UpstreamGraph {
  /** Keyed on the id of the record content came FROM, for the downstream walk. */
  downstream: Map<string, Edge[]>
  deleted: Set<string>
  /** Every live record's id and title. The project list names a declared-about record by its title. */
  live: Map<string, { id: string; title: string }>
}

/** Exported for the test that holds the compiler to refusing the graph of one record to the downstream walk. */
export type { UpstreamGraph }

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

const severityOf = (record: PanelRecord): RestrictionSeverity => {
  const stored = (record.data as Record<string, unknown> | null)?.['severity']
  // A restriction with no severity stored cannot be drawn and must not be guessed at. The write
  // path requires the field, so this is the corpus-repair case: it is treated as the loudest thing
  // it could be, never as harmless, because reading an absence as "nothing rests on it" is exactly
  // the substitution this product refuses to make.
  return stored === 'limits_claims' || stored === 'harmless' || stored === 'stops_final'
    ? stored
    : 'stops_final'
}

/**
 * THE ADJACENCY, BUILT ONCE PER CALL.
 *
 * Three queries and a pass over them. Nothing is cached; see the header.
 *
 * Every record of the project is read for its id, kind, title and deletion only. The walk needs
 * nothing more from most of them, and reading `data` would parse the JSON of every record,
 * deleted ones included. Only the live restrictions are read whole, because their `data` holds the
 * severity and the author's lists.
 *
 * The records are read by title, then in the order they were stored, and the links in the order they were stored.
 * Every reply lists the restrictions in the first order, and `upstreamOf` reads in both orders, so the graph of one
 * record gives the same answer as this one.
 */
function restrictionGraph(workspaceId: string): Graph {
  const all = db
    .select({ id: records.id, kind: records.kind, title: records.title, deletedAt: records.deletedAt })
    .from(records)
    .where(eq(records.workspaceId, workspaceId))
    .orderBy(records.title, sql`rowid`)
    .all()
  const live = new Map<string, { id: string; title: string }>()
  const deleted = new Set<string>()
  const restrictionIds: string[] = []
  for (const row of all) {
    if (row.deletedAt != null) {
      deleted.add(row.id)
      continue
    }
    live.set(row.id, { id: row.id, title: row.title })
    if ((RESTRICTION_KINDS as readonly string[]).includes(row.kind)) restrictionIds.push(row.id)
  }
  const whole = new Map<string, PanelRecord>()
  if (restrictionIds.length > 0) {
    const rows = db
      .select()
      .from(records)
      .where(
        and(
          eq(records.workspaceId, workspaceId),
          isNull(records.deletedAt),
          inArray(records.kind, [...RESTRICTION_KINDS]),
        ),
      )
      .all()
    for (const row of rows) whole.set(row.id, row as unknown as PanelRecord)
  }
  // The restrictions keep the order of the scan above, which is the order every reply lists them in.
  const restrictions = new Map<string, PanelRecord>()
  for (const id of restrictionIds) {
    const record = whole.get(id)
    if (record === undefined) {
      throw new Error(`restrictionGraph: the restriction ${id} was live in one read and missing from the next.`)
    }
    restrictions.set(id, record)
  }

  const rows = db.select().from(links).where(eq(links.workspaceId, workspaceId)).orderBy(sql`rowid`).all()
  return { ...whatTheLinksSay(rows, restrictions), deleted, live, restrictions }
}

type LinkRow = { id: string; fromId: string; toId: string; type: string; createdAt: string }

/**
 * WHAT A PROJECT'S LINKS SAY TO THE WALK AND THE READINGS, worked out here for both graphs. `rows` come in the order
 * the links were made: a restriction's declared records keep that order, and the last `resolves` link wins.
 */
function whatTheLinksSay(
  rows: LinkRow[],
  restrictions: Map<string, PanelRecord>,
): Pick<Graph, 'upstream' | 'downstream' | 'declaredScope' | 'carries' | 'resolved'> {
  const upstream = new Map<string, Edge[]>()
  const downstream = new Map<string, Edge[]>()
  const declaredScope = new Map<string, string[]>()
  const carries = new Map<string, { carriedFrom: string; through: 'implements' | 'part_of' }[]>()
  const resolved = new Map<string, { at: string; by: string }>()
  const push = (map: Map<string, Edge[]>, key: string, edge: Edge): void => {
    const held = map.get(key)
    if (held === undefined) map.set(key, [edge])
    else held.push(edge)
  }
  for (const row of rows) {
    const direction = DEPENDENCY_EDGES[row.type]
    if (direction !== undefined) {
      // `outgoing` means the row's own `from` is the dependent end; `incoming` means it is the
      // other way round. Both become one Edge shape, so the walk has one rule rather than two.
      const edge: Edge =
        direction === 'outgoing'
          ? { linkId: row.id, type: row.type as LinkType, dependent: row.fromId, from: row.toId }
          : { linkId: row.id, type: row.type as LinkType, dependent: row.toId, from: row.fromId }
      push(upstream, edge.dependent, edge)
      push(downstream, edge.from, edge)
    }
    if (row.type === 'about' && restrictions.has(row.fromId)) {
      const held = declaredScope.get(row.fromId)
      if (held === undefined) declaredScope.set(row.fromId, [row.toId])
      else held.push(row.toId)
    }
    if ((CARRYING_EDGES as readonly string[]).includes(row.type)) {
      const held = carries.get(row.fromId)
      const entry = { carriedFrom: row.toId, through: row.type as 'implements' | 'part_of' }
      if (held === undefined) carries.set(row.fromId, [entry])
      else held.push(entry)
    }
    if (row.type === 'resolves' && restrictions.has(row.toId)) {
      resolved.set(row.toId, { at: row.createdAt, by: row.fromId })
    }
  }
  return { upstream, downstream, declaredScope, carries, resolved }
}

const dependencyTypes = (direction: 'outgoing' | 'incoming') =>
  sql.join(
    Object.keys(DEPENDENCY_EDGES)
      .filter((type) => DEPENDENCY_EDGES[type] === direction)
      .map((type) => sql`${type}`),
    sql`, `,
  )

/**
 * THE GRAPH OF THE RECORDS ASKED: what an upstream walk from any of them and their readings read, and nothing else.
 *
 * `restrictionGraph` reads every record and every link of the project, and the records asked need few of them.
 * This reads those records, the project's live restrictions, the dependency links an upstream walk from them
 * can follow with a far end at each record reached, the `about` and `resolves` links of the restrictions, and
 * the `implements` and `part_of` links out of each asked record. Each is read in the order `restrictionGraph`
 * reads it, and folded by `whatTheLinksSay`, so a walk over this graph finds what a walk over the whole graph
 * finds, in the same order.
 *
 * WHY THE ANSWER IS THE SAME. `readingsFor` reads `carries` only for the asked ids, the walk follows only edges
 * out of records it reached, and `live`/`deleted` say the same about every far end and every asked id as the
 * whole graph does. Its `live` and `deleted` answer only for these records and those far ends, so its type
 * keeps it from the downstream walk.
 */
function upstreamOf(recordIds: string[], workspaceId: string): UpstreamGraph {
  const live = new Set<string>()
  const deleted = new Set<string>()
  // The live ids asked about, kept apart from `live`, which also gains the far ends the walk reaches. The CTE
  // and the carried links read this list; they must not start from a far end.
  const liveAsked: string[] = []
  const asked = readInPieces(recordIds, (piece) =>
    db
      .select({ id: records.id, deletedAt: records.deletedAt })
      .from(records)
      .where(and(inArray(records.id, piece), eq(records.workspaceId, workspaceId)))
      .all(),
  )
  for (const row of asked) {
    if (row.deletedAt == null) {
      live.add(row.id)
      liveAsked.push(row.id)
    } else {
      deleted.add(row.id)
    }
  }

  // `+` keeps the planner on the kind index, which is the narrowest; the order is restrictionGraph's.
  const restrictions = new Map<string, PanelRecord>()
  const rows = db
    .select()
    .from(records)
    .where(
      and(
        sql`+${records.workspaceId} = ${workspaceId}`,
        sql`+${records.deletedAt} IS NULL`,
        inArray(records.kind, [...RESTRICTION_KINDS]),
      ),
    )
    .orderBy(records.title, sql`rowid`)
    .all()
  for (const row of rows) restrictions.set(row.id, row as unknown as PanelRecord)

  const linkRows: LinkRow[] = []
  if (liveAsked.length > 0) {
    // Every record an upstream walk from any asked id reaches, then every upstream link out of each with the
    // record at its far end. A far end that is deleted in this project is counted by the walk, and one in another
    // project is passed over. `+` keeps the planner off links_type_idx, which would read every link of a type for
    // each record reached.
    type Reached = LinkRow & { far: string | null; farWorkspaceId: string | null; farDeletedAt: string | null }
    const reached = db.all<Reached>(sql`
      WITH RECURSIVE reached(id) AS (
        SELECT value FROM json_each(${JSON.stringify(liveAsked)})
        UNION
        SELECT r.id FROM reached CROSS JOIN links l CROSS JOIN records r
          WHERE l.from_id = reached.id AND +l.type IN (${dependencyTypes('outgoing')})
            AND l.workspace_id = ${workspaceId}
            AND r.id = l.to_id AND r.workspace_id = ${workspaceId} AND r.deleted_at IS NULL
        UNION
        SELECT r.id FROM reached CROSS JOIN links l CROSS JOIN records r
          WHERE l.to_id = reached.id AND +l.type IN (${dependencyTypes('incoming')})
            AND l.workspace_id = ${workspaceId}
            AND r.id = l.from_id AND r.workspace_id = ${workspaceId} AND r.deleted_at IS NULL
      )
      SELECT l.rowid AS n, l.id AS id, l.from_id AS fromId, l.to_id AS toId, l.type AS type, l.created_at AS createdAt,
          far.id AS far, far.workspace_id AS farWorkspaceId, far.deleted_at AS farDeletedAt
        FROM reached CROSS JOIN links l LEFT JOIN records far ON far.id = l.to_id
        WHERE l.from_id = reached.id AND +l.type IN (${dependencyTypes('outgoing')}) AND l.workspace_id = ${workspaceId}
      UNION ALL
      SELECT l.rowid AS n, l.id AS id, l.from_id AS fromId, l.to_id AS toId, l.type AS type, l.created_at AS createdAt,
          far.id AS far, far.workspace_id AS farWorkspaceId, far.deleted_at AS farDeletedAt
        FROM reached CROSS JOIN links l LEFT JOIN records far ON far.id = l.from_id
        WHERE l.to_id = reached.id AND +l.type IN (${dependencyTypes('incoming')}) AND l.workspace_id = ${workspaceId}
      ORDER BY n`)
    for (const row of reached) {
      if (row.far !== null && row.farWorkspaceId === workspaceId) {
        ;(row.farDeletedAt == null ? live : deleted).add(row.far)
      }
      linkRows.push(row)
    }
  }

  if (restrictions.size > 0) {
    const ids = JSON.stringify([...restrictions.keys()])
    const ofTheRestrictions = (type: 'about' | 'resolves', end: 'from_id' | 'to_id') =>
      db.all<LinkRow>(sql`
        SELECT l.id AS id, l.from_id AS fromId, l.to_id AS toId, l.type AS type, l.created_at AS createdAt
          FROM json_each(${ids}) j CROSS JOIN links l ON l.${sql.raw(end)} = j.value
          WHERE +l.type = ${type} AND +l.workspace_id = ${workspaceId}
          ORDER BY l.rowid`)
    const carrying = sql.join(CARRYING_EDGES.map((type) => sql`${type}`), sql`, `)
    // `from_id` is read from the live asked ids, never from `live`, which by now also holds the far ends.
    const carried = liveAsked.length > 0
      ? db.all<LinkRow>(sql`
          SELECT l.id AS id, l.from_id AS fromId, l.to_id AS toId, l.type AS type, l.created_at AS createdAt
            FROM json_each(${JSON.stringify(liveAsked)}) j CROSS JOIN links l ON l.from_id = j.value
            WHERE +l.type IN (${carrying}) AND +l.workspace_id = ${workspaceId}
            ORDER BY l.rowid`)
      : []
    // Each kind of link is folded on its own, so the order between kinds does not matter; within a kind it is rowid.
    linkRows.push(...ofTheRestrictions('about', 'from_id'), ...ofTheRestrictions('resolves', 'to_id'), ...carried)
  }

  const { upstream, declaredScope, carries, resolved } = whatTheLinksSay(linkRows, restrictions)
  return { upstream, deleted, live, declaredScope, carries, restrictions, resolved }
}

// ============================================================================ the one walk

/**
 * ONE BREADTH-FIRST WALK. `direction` is the only difference between the reads and the write.
 *
 * The visited set, the shortest-path rule and the link-id tie-break are stated once, HERE, and
 * therefore hold in both directions. A second traversal written in the resolution path is how the
 * set that gets re-validation rows comes to differ from the set the read returns, and a record
 * then shows a restriction it has no row for.
 *
 * Depth is not capped. The owner's own example is three steps, and a cap would cut it short.
 *
 * Soft-deleted records are skipped and COUNTED. A restriction that reached three records through
 * one that has since been deleted now reaches fewer, and saying so is the difference between *the
 * walk found nothing* and *the walk could not get through*.
 */
type Walked = { reached: Map<string, Hop[]>; skippedDeleted: number }
function walk(graph: UpstreamGraph, startId: string, direction: 'upstream'): Walked
function walk(graph: Graph, startId: string, direction: 'downstream'): Walked
function walk(graph: UpstreamGraph | Graph, startId: string, direction: 'upstream' | 'downstream'): Walked {
  const edges = direction === 'upstream' ? graph.upstream : 'downstream' in graph ? graph.downstream : null
  if (edges === null) throw new Error('walk: a downstream walk was asked of a graph that holds no downstream edges.')
  const reached = new Map<string, Hop[]>()
  let skippedDeleted = 0
  const queue: { id: string; path: Hop[] }[] = [{ id: startId, path: [] }]
  const seen = new Set<string>([startId])
  while (queue.length > 0) {
    const here = queue.shift()!
    const next = edges.get(here.id) ?? []
    // Link-id order, so the answer is the same on every call. A `code` hop has no link id and
    // sorts last, under its own key, for the same reason.
    const ordered = [...next].sort((a, b) => (a.linkId ?? `~${a.from}`).localeCompare(b.linkId ?? `~${b.from}`))
    for (const edge of ordered) {
      const to = direction === 'upstream' ? edge.from : edge.dependent
      if (graph.deleted.has(to)) {
        skippedDeleted += 1
        continue
      }
      if (!graph.live.has(to)) continue
      if (seen.has(to)) continue
      seen.add(to)
      const hop: Hop = { linkId: edge.linkId, type: edge.type, recordId: to }
      if (edge.because !== undefined) hop.because = edge.because
      const path = [...here.path, hop]
      reached.set(to, path)
      queue.push({ id: to, path })
    }
  }
  return { reached, skippedDeleted }
}

/** Exported for the test that holds the compiler to refusing the graph of one record to the downstream walk. */
export type TheWalk = typeof walk

// ============================================================================ standing

/**
 * WHERE A RESTRICTION STANDS FOR ONE RECORD. THE ONLY PLACE THIS IS DECIDED.
 *
 * The six rules, in order. **The `resolves` link decides resolved. The row decides checked.**
 * An earlier form of this worked *active versus resolved-unchecked* out from the row alone and
 * called *no row* "the restriction is live" — under which a resolved restriction read `active`
 * for ever for three whole classes of reading, and nothing failed, because `active` is a legal
 * member of the union.
 *
 * Returns null when the reading is not returned for this record at all.
 */
function standingOf(
  restriction: PanelRecord,
  reach: Reach,
  recordId: string,
  graph: UpstreamGraph,
  rows: Map<string, { id: string; state: string }>,
): Standing | null {
  // 1. No `resolves` link into the restriction. The link decides, and nothing else does.
  const resolution = graph.resolved.get(restriction.id)
  if (resolution === undefined) return { state: 'active' }
  const { at: resolvedAt, by: resolvedBy } = resolution
  // 2. Resolved and harmless. It wrote no rows, so nothing was ever owed.
  if (severityOf(restriction) === 'harmless') return { state: 'resolved', resolvedAt, resolvedBy }
  // 3. Carried: the standing is the standing of the step this record carries, not of this record.
  //    `carriedFrom` is always a directly-declared record, and the resolution wrote a row for
  //    every one of those at distance 0, so the row exists.
  const key = reach.how === 'carried' ? reach.carriedFrom : recordId
  const row = rows.get(`${restriction.id}\u0000${key}`)
  // 4. Resolved, no row: this record became a dependency after the resolution.
  if (row === undefined) return { state: 'resolved-unchecked', resolvedAt, resolvedBy, revalidationId: null }
  // 5. Resolved, still needing review.
  if (row.state === 'needs_review') {
    return { state: 'resolved-unchecked', resolvedAt, resolvedBy, revalidationId: row.id }
  }
  // 6. Judged. The reading is not returned for this record, and this is the only case where a
  //    reading disappears.
  return null
}

/**
 * The re-validation rows for a set of restrictions, keyed on the pair.
 *
 * THE SEPARATOR IS WRITTEN AS THE ESCAPE `\u0000` AND NOT AS THE BYTE. A literal NUL in a source
 * file makes git call it binary and makes grep match nothing in it, which is a trap this repository
 * has already been caught by once, by a test deleted on 13 November 2026. A NUL is the right
 * separator, because no id can contain one; writing it as the byte is what is wrong.
 */
function revalidationRows(restrictionIds: string[]): Map<string, { id: string; state: string }> {
  const map = new Map<string, { id: string; state: string }>()
  if (restrictionIds.length === 0) return map
  // IN PIECES (src/server/db/in-pieces.ts): this is every live restriction of the project, and nothing caps that.
  // The rows go into a map by the pair, which `revalidations_pair_idx` holds unique, so their order is not used.
  const rows = readInPieces(restrictionIds, (piece) =>
    db
      .select({
        id: revalidations.id,
        restrictionId: revalidations.restrictionId,
        recordId: revalidations.recordId,
        state: revalidations.state,
      })
      .from(revalidations)
      .where(inArray(revalidations.restrictionId, piece))
      .all(),
  )
  for (const row of rows) map.set(`${row.restrictionId}\u0000${row.recordId}`, { id: row.id, state: row.state })
  return map
}

// ============================================================================ reading one record

function readingFor(
  restriction: PanelRecord,
  reach: Reach,
  recordId: string,
  graph: UpstreamGraph,
  rows: Map<string, { id: string; state: string }>,
): RestrictionReading | null {
  const standing = standingOf(restriction, reach, recordId, graph, rows)
  if (standing === null) return null
  const data = (restriction.data ?? {}) as Record<string, unknown>
  const heldField = data['holds_field']
  return {
    restrictionId: restriction.id,
    kind: restriction.kind as RestrictionKind,
    title: restriction.title,
    severity: severityOf(restriction),
    allowedUses: asStrings(data['allowed_uses']),
    disallowedClaims: asStrings(data['disallowed_claims']),
    // `holds_field` names a field on the record the restriction is ABOUT. Carrying it downstream
    // would point at a field the dependent record does not have.
    holdsField: reach.how === 'direct' && typeof heldField === 'string' ? heldField : null,
    reach,
    standing,
  }
}

/**
 * Every restriction reaching every record in `ids`, in one pass over one graph.
 *
 * The order the three reaches are computed in is the order they are preferred in: a restriction
 * declared directly about a record is reported as `direct` even if a dependency path also reaches
 * it, because the nearer statement is the truer one.
 */
function readingsFor(
  ids: string[],
  graph: UpstreamGraph,
): { byRecord: Map<string, RestrictionReading[]>; skippedDeleted: number } {
  const rows = revalidationRows([...graph.restrictions.keys()])
  const byRecord = new Map<string, RestrictionReading[]>()
  let skippedDeleted = 0
  for (const id of ids) byRecord.set(id, [])

  // The upstream walk is run once per asked-about record and its answer reused for every
  // restriction, rather than once per (record, restriction) pair.
  const upstream = new Map<string, Map<string, Hop[]>>()
  for (const id of ids) {
    if (!graph.live.has(id)) continue
    const found = walk(graph, id, 'upstream')
    upstream.set(id, found.reached)
    skippedDeleted += found.skippedDeleted
  }

  for (const [restrictionId, restriction] of graph.restrictions) {
    const declared = graph.declaredScope.get(restrictionId) ?? []
    const harmless = severityOf(restriction) === 'harmless'
    for (const id of ids) {
      if (!graph.live.has(id)) continue
      let reach: Reach | null = null
      if (declared.includes(id)) reach = { how: 'direct' }
      else if (!harmless) {
        // Carried: this record `implements` or is `part_of` something the restriction is about.
        const carried = (graph.carries.get(id) ?? []).find((entry) => declared.includes(entry.carriedFrom))
        if (carried !== undefined) {
          reach = { how: 'carried', through: carried.through, carriedFrom: carried.carriedFrom }
        } else {
          // Depends: one of the declared-scope records is upstream of this one.
          const reached = upstream.get(id)
          let best: { path: Hop[]; target: string } | null = null
          for (const target of declared) {
            const path = reached?.get(target)
            if (path === undefined) continue
            if (best === null || path.length < best.path.length) best = { path, target }
          }
          if (best !== null) reach = { how: 'depends', distance: best.path.length, path: best.path }
        }
      }
      if (reach === null) continue
      const reading = readingFor(restriction, reach, id, graph, rows)
      if (reading !== null) byRecord.get(id)!.push(reading)
    }
  }
  return { byRecord, skippedDeleted }
}

// ============================================================================ the three reads

/** One record. What the record page, the block page and the review pane ask. */
export function restrictionsOn(recordId: string, workspaceId: string): RestrictionsReply<RestrictionReading[]> {
  // The graphs of this record, not of the whole project: they answer for this record and for nothing else.
  const reply = restrictionsReaching([recordId], workspaceId, graphsUpstreamOf([recordId], workspaceId))
  return {
    found: reply.found.get(recordId) ?? [],
    skippedDeleted: reply.skippedDeleted,
    couldNotCheck: reply.couldNotCheck,
  }
}

/**
 * THE GRAPHS ONE READ WALKS: its project's, and the message centre's, each built the first time it is asked for.
 * `restrictionsReaching` makes its own. A read that asks about one record at a time, many times over, makes one of
 * these and hands it to every ask (`restrictionsWithinOneRead`).
 */
interface GraphsOfOneRead {
  project(): UpstreamGraph
  centre(): UpstreamGraph
}

function graphsOfOneRead(workspaceId: string): GraphsOfOneRead {
  let project: Graph | null = null
  let centre: Graph | null = null
  return {
    project: () => (project ??= restrictionGraph(workspaceId)),
    centre: () => (centre ??= restrictionGraph(MESSAGE_CENTRE)),
  }
}

/** The graphs of the records asked, in their project and in the message centre, for a read that asks about them alone. */
function graphsUpstreamOf(recordIds: string[], workspaceId: string): GraphsOfOneRead {
  let project: UpstreamGraph | null = null
  let centre: UpstreamGraph | null = null
  return {
    project: () => (project ??= upstreamOf(recordIds, workspaceId)),
    centre: () => (centre ??= upstreamOf(recordIds, MESSAGE_CENTRE)),
  }
}

/**
 * `restrictionsOn` FOR MANY RECORDS ASKED ONE AT A TIME INSIDE ONE READ, with the graph built once for that read.
 *
 * A review reads each of its comments on its own, and each comment asked for the restrictions on the record it is about.
 * Each ask built the whole graph again: about 5 ms each, and a review's comments, the comments it did not take, and
 * finishing it ask hundreds of times on an office the size of the owner's (wave 13r round 15). This is still not a cache. The
 * reader is made at the start of one synchronous read and thrown away at its end, so nothing written between two
 * reads can be missed; the caller must not keep it longer.
 */
export function restrictionsWithinOneRead(workspaceId: string): (recordId: string) => RestrictionsReply<RestrictionReading[]> {
  const graphs = graphsOfOneRead(workspaceId)
  return (recordId) => {
    const reply = restrictionsReaching([recordId], workspaceId, graphs)
    return { found: reply.found.get(recordId) ?? [], skippedDeleted: reply.skippedDeleted, couldNotCheck: reply.couldNotCheck }
  }
}

/** Many records, one pass. THE ONLY BATCHED READ — nothing else may build a second one. */
export function restrictionsReaching(
  recordIds: string[],
  workspaceId: string,
  graphs: GraphsOfOneRead = graphsOfOneRead(workspaceId),
): RestrictionsReply<Map<string, RestrictionReading[]>> {
  const graph = graphs.project()
  const { byRecord, skippedDeleted } = readingsFor(recordIds, graph)
  // A MESSAGE IS KEPT IN THE MESSAGE CENTRE AND BELONGS TO NO PROJECT, so what reaches it is read
  // from the message centre's own records and links, not from this project's, and it is checked rather than skipped.
  const messages = workspaceId === MESSAGE_CENTRE ? [] : recordIds.filter((id) => !graph.live.has(id) && !graph.deleted.has(id))
  const centre = messages.length === 0 ? null : graphs.centre()
  if (centre !== null) {
    const read = readingsFor(messages.filter((id) => centre.live.has(id)), centre)
    for (const [id, found] of read.byRecord) byRecord.set(id, found)
  }
  const couldNotCheck: { what: string; because: string }[] = []
  for (const id of recordIds) {
    if (centre !== null && centre.live.has(id)) continue
    if (!graph.live.has(id)) {
      couldNotCheck.push({
        what: `the record ${id}`,
        because: graph.deleted.has(id)
          ? 'it has been deleted, so nothing was walked from it'
          : 'no record of that id is in this project',
      })
    }
  }
  couldNotCheck.push(...codeDependenciesNotWalked())
  return { found: byRecord, skippedDeleted, couldNotCheck }
}

/**
 * THE IMPLEMENTATION MAP'S EDGES ARE NOT WALKED, AND THIS SAYS SO RATHER THAN REPORTING A CLEAN
 * RESULT.
 *
 * The propagation design asks for a fifth edge source: `dependsOn`, *the import graph rolled up to
 * records*, so that a restriction on one record reaches another whose code imports its code. That
 * read is the implementation-map thread's and it is **not built** — `src/server/lib/implementation.ts`
 * has `statedFor`, `statedInRepository` and `findingsForPath`, and nothing that rolls an import
 * graph up to records.
 *
 * So every reply says so. A missing edge source that reported nothing would make *there are no
 * code dependencies* and *nobody walked the code* the same answer, which is the one thing
 * `couldNotCheck` exists to prevent. When the read lands, this function goes and the edges join
 * `restrictionGraph` under the same visited set and the same shorter-path rule.
 */
function codeDependenciesNotWalked(): { what: string; because: string }[] {
  return [
    {
      what: 'code dependencies between records',
      // Shortened in round 47 of wave 13q: every record read carries this. The page quotes it whole
      // (tests/what-could-not-be-checked-is-said-in-words.test.ts), and
      // tests/where-the-map-cannot-answer-it-says-so.test.ts looks for "Implementation Map" and "import graph" in it.
      because:
        'the Implementation Map cannot yet roll the import graph up to records, so a restriction reaches only along ' +
        'drawn links.',
    },
  ]
}

/**
 * A scope. What a boundary, a work domain, a bundle and an envelope ask.
 *
 * A SCOPE IS `descendantsOf`, AND NOTHING ELSE. This repository already holds three answers to
 * *what is in this scope* — the review scope, the pipeline step order and the presentation
 * scopes — so an implementer would have picked one silently or written a fourth. It resolves
 * through the containment reader the product already has, reached the same way the review scope
 * reaches it, and `descendantsOf`'s own gaps become `couldNotCheck` entries one for one.
 *
 * Passing none of the three inputs is a refusal, not an empty answer.
 */
export function restrictionsInScope(input: {
  workspaceId: string
  scopeRecordId?: string | null
  recordIds?: string[]
  entries?: { repository: string; path: string }[]
}): RestrictionsReply<RestrictionReading[]> & { counts: ScopeCounts } {
  const { workspaceId } = input
  const asked = input.recordIds ?? []
  const entries = input.entries ?? []
  if (input.scopeRecordId == null && asked.length === 0 && entries.length === 0) {
    throw new Error(
      'restrictionsInScope was given nothing to look at. Send a scopeRecordId, a list of recordIds, or a list ' +
        'of implementation entries — an empty answer to an empty question would read as "nothing is restricted".',
    )
  }

  const couldNotCheck: { what: string; because: string }[] = []
  const ids = new Set<string>(asked)

  if (input.scopeRecordId != null) {
    const inside = recordsInScope(input.scopeRecordId, workspaceId)
    for (const id of inside.ids) ids.add(id)
    couldNotCheck.push(...inside.gaps)
  }

  if (entries.length > 0) {
    const resolvedEntries = entriesToRecords(entries, workspaceId)
    for (const id of resolvedEntries.ids) ids.add(id)
    couldNotCheck.push(...resolvedEntries.gaps)
  }

  const reply = restrictionsReaching([...ids], workspaceId, graphsUpstreamOf([...ids], workspaceId))
  const found: RestrictionReading[] = []
  const seen = new Set<string>()
  for (const readings of reply.found.values()) {
    for (const reading of readings) {
      // One reading per restriction in a scope reply: the scope asks WHICH restrictions are in
      // here, and the per-record paths are what `restrictionsReaching` is for.
      if (seen.has(reading.restrictionId)) continue
      seen.add(reading.restrictionId)
      found.push(reading)
    }
  }
  return {
    found,
    skippedDeleted: reply.skippedDeleted,
    couldNotCheck: [...couldNotCheck, ...reply.couldNotCheck],
    counts: countsOf(found),
  }
}

/**
 * THE FOUR COUNTS. The arithmetic lives in `src/shared/restriction.ts` and is called from here.
 *
 * IT MOVED THERE WHEN THE SCREEN LANDED. The record page counts a record's own restrictions and
 * this route counts a scope's, and two copies of *which rows are active* would be free to disagree
 * about the one that matters — a `harmless` row is never added into `active`, and a screen that got
 * that wrong would read *5 active placeholders* beside *1 prevents final validation*.
 */
const countsOf = restrictionCounts

/**
 * The scope record and everything part of it, through the one containment reader.
 *
 * THE SCOPE'S OWN CLOSURE, NOT THE PROJECT. One frontier at a time, the `part_of` links into its records are
 * read, and the children are taken from the containment reader itself, so a pipeline's stored order and its
 * `part_of` children are read by the one rule that reads them everywhere. Only live records of this project
 * are loaded, and a child that is deleted, in another project or nobody's stays unloaded: `descendantsOf`
 * lists it as a step and walks nothing below it, exactly as the whole-project read did. An id already loaded
 * is not loaded again, so a loop ends.
 *
 * The root is in the context only when it is this project's. When it is not, only its own links whose child
 * end was loaded are kept, which is the old `ids.has(fromId) || ids.has(toId)` filter with the root outside
 * the project: only the `fromId` side can hold.
 */
function recordsInScope(
  rootId: string,
  workspaceId: string,
): { ids: Set<string>; gaps: { what: string; because: string }[] } {
  const root = db.select().from(records).where(eq(records.id, rootId)).get()
  if (root === undefined || root.deletedAt != null) {
    return {
      ids: new Set([rootId]),
      gaps: [
        {
          what: `the scope ${rootId}`,
          because:
            root === undefined
              ? 'no record of that id is in this project, so nothing under it was walked'
              : 'that record has been deleted, so nothing under it was walked',
        },
      ],
    }
  }

  const rootIsHere = root.workspaceId === workspaceId
  const loaded: PanelRecord[] = []
  const loadedIds = new Set<string>()
  if (rootIsHere) loadedIds.add(root.id)
  const readLinks: ContainmentLink[] = []
  let frontier: PanelRecord[] = [root as unknown as PanelRecord]
  while (frontier.length > 0) {
    // `+l.type` keeps the planner on links_to_idx, which is the narrowest for a read by the child end.
    const partOf = readInPieces(frontier.map((record) => record.id), (piece) =>
      db
        .select({ id: links.id, fromId: links.fromId, toId: links.toId, type: links.type })
        .from(links)
        .where(and(inArray(links.toId, piece), sql`+${links.type} = ${CONTAINMENT_LINK}`))
        .all(),
    )
    readLinks.push(...partOf)
    const children: string[] = []
    for (const record of frontier) {
      const own = partOf.filter((link) => link.toId === record.id)
      for (const part of partsOf(record, { records: [], links: own }).parts) children.push(part.id)
    }
    const unloaded = [...new Set(children)].filter((childId) => !loadedIds.has(childId))
    if (unloaded.length === 0) break
    const landed = readInPieces(unloaded, (piece) =>
      db
        .select()
        .from(records)
        .where(and(inArray(records.id, piece), eq(records.workspaceId, workspaceId), isNull(records.deletedAt)))
        .all(),
    ) as unknown as PanelRecord[]
    for (const record of landed) {
      loadedIds.add(record.id)
      loaded.push(record)
    }
    frontier = landed
  }
  const contextRecords = rootIsHere ? [root as unknown as PanelRecord, ...loaded] : loaded
  // A link into the root from another project is kept only when the child end was loaded; every other link
  // read points at a loaded record.
  const loadedInContext = new Set(contextRecords.map((record) => record.id))
  const contextLinks = rootIsHere
    ? readLinks
    : readLinks.filter((link) => link.toId !== rootId || loadedInContext.has(link.fromId))
  const context: ContainmentContext = { records: contextRecords, links: contextLinks }
  const found = descendantsOf(root as unknown as PanelRecord, context)
  const inside = new Set<string>([rootId])
  for (const step of found.steps) inside.add(step.id)
  const gaps = found.gaps.map((gap) => ({ what: 'part of this scope', because: gap.reason }))
  // A scope Mole Office could only partly resolve must never come back looking like a scope with
  // nothing in it.
  if (!found.complete) gaps.push({ what: 'the rest of this scope', because: found.stopped })
  return { ids: inside, gaps }
}

/**
 * An implementation entry resolved to record ids through the Map's forward read.
 *
 * Nothing else happens to an entry. Where the Map cannot answer — the repository is not in this
 * project, or the scan never saw the path — that is a `couldNotCheck` entry carrying the reason,
 * and never a quiet zero.
 */
function entriesToRecords(
  entries: { repository: string; path: string }[],
  workspaceId: string,
): { ids: Set<string>; gaps: { what: string; because: string }[] } {
  const ids = new Set<string>()
  const gaps: { what: string; because: string }[] = []
  for (const entry of entries) {
    const answer = servedBy(entry.repository, entry.path, workspaceId)
    for (const id of answer.recordIds) ids.add(id)
    if (answer.because !== null) gaps.push({ what: `${entry.repository}/${entry.path}`, because: answer.because })
  }
  return { ids, gaps }
}

/**
 * Which records state this file as theirs. Imported lazily so that this module can be read by a
 * test that has no implementation map, and so the map's own reads stay the only statement of what
 * serves what.
 */
function servedBy(
  repositoryId: string,
  path: string,
  workspaceId: string,
): { recordIds: string[]; because: string | null } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const map = mapReads()
  if (map === null) {
    return { recordIds: [], because: 'the Implementation Map could not be read from here' }
  }
  const paths = map.filesInRepository(workspaceId, repositoryId)
  const stated = map.statedInRepository(repositoryId, workspaceId)
  const serves = stated.filter((row) => map.filesMatching(row.pattern, [path]).length > 0)
  const recordIds = serves.map((row) => row.recordId)
  if (!paths.includes(path)) {
    return {
      recordIds,
      because:
        `the scan has never seen "${path}", so nothing was walked from the code side of it. That is not the ` +
        `same as no record owning it: the scan skips what .gitignore names, anything beginning with an ` +
        `underscore, and anything that is not a source extension. ` +
        `${recordIds.length} record${recordIds.length === 1 ? '' : 's'} state it as theirs anyway.`,
    }
  }
  if (recordIds.length === 0) {
    return { recordIds, because: `no record states "${path}" as theirs, so it reached no work` }
  }
  return { recordIds, because: null }
}

/** Set by `src/server/lib/restrictions-map.ts` at boot. Null in a test with no map. */
let mapReader: {
  filesInRepository: (workspaceId: string, repositoryId: string) => string[]
  statedInRepository: (repositoryId: string, workspaceId: string) => { recordId: string; pattern: string }[]
  filesMatching: (pattern: string, paths: string[]) => string[]
} | null = null

function mapReads(): typeof mapReader {
  return mapReader
}

/**
 * WIRED AT BOOT RATHER THAN IMPORTED, and the reason is a real one: `implementation.ts` imports
 * `records.ts`, which imports enough of the server that a shared reader importing it directly
 * makes a cycle. The wiring is one call in `src/server/index.ts`, and a corpus with no map wiring
 * answers *the Implementation Map could not be read from here* rather than answering nothing.
 */
export function useImplementationMap(reader: NonNullable<typeof mapReader>): void {
  mapReader = reader
}

/**
 * EVERY RESTRICTION IN ONE PROJECT, WITH WHERE IT STANDS AND HOW FAR IT REACHES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A FOURTH READ AND NOT ONE OF THE THREE ABOVE
 * ---------------------------------------------------------------------------------------
 *
 * The three reads answer *what restricts this*. This answers *what restrictions are there* — the
 * question the Placeholders surface is opened with, and one none of them can answer. A restriction
 * with no `about` link restricts nothing and reaches nobody, so it appears in no reading anywhere;
 * `restrictionsOn` would not return it even for itself. It is still a real record a person filed,
 * and a surface that lost it would be a list that quietly excludes the case the kind's own rules
 * call out.
 *
 * ONE GRAPH, ONE PASS OVER THE RESTRICTIONS. The reach is the same downstream walk
 * `restrictionsFrom` uses, run once per restriction over its own declared scope — not once per
 * record in the corpus.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE ONE RESTRICTION STANDS, WHICH IS NOT THE SAME QUESTION AS WHERE IT STANDS ON A RECORD
 * ---------------------------------------------------------------------------------------
 *
 * `standingOf` answers for a PAIR: this restriction, on that record. A row on this surface is about
 * the restriction alone, so it carries two facts instead:
 *
 *   answered   whether anything links to it with `resolves`. The link decides and nothing else
 *              does, exactly as it does for a pair.
 *   owed       how many affected records have not been judged since. Zero and answered means every
 *              one has been looked at; that restriction has stopped travelling and says so.
 *
 * NOTHING HERE INVENTS A FOURTH SEVERITY OR A FOURTH STANDING. The two facts are counted from the
 * same rows the pair reader counts from.
 */
export interface RestrictionInProject {
  restrictionId: string
  kind: RestrictionKind
  title: string
  severity: RestrictionSeverity
  /** The author's strings, unchanged. */
  allowedUses: string[]
  disallowedClaims: string[]
  holdsField: string | null
  /** True when something links to it with `resolves`. The link decides and nothing else does. */
  answered: boolean
  resolvedAt: string | null
  resolvedBy: string | null
  /** The records it is declared about, by its own `about` links. Empty is a real state. */
  about: { id: string; title: string }[]
  /** Declared-about records that have been deleted. Counted, never silently dropped. */
  aboutDeleted: number
  /**
   * How many records it reaches, its declared scope included. Zero for a `harmless` one BY RULE —
   * it does not enter the walk at all — and that is the behaviour half of *harmless is not
   * production-blocking*, not a gap in the reading.
   */
  reaches: number
  /** How many affected records have not been judged since it was answered. */
  owed: number
}

export function restrictionsInThisProject(
  workspaceId: string,
): RestrictionsReply<RestrictionInProject[]> & { counts: ScopeCounts } {
  const graph = restrictionGraph(workspaceId)
  const rows = revalidationRows([...graph.restrictions.keys()])
  const found: RestrictionInProject[] = []
  let skippedDeleted = 0

  for (const [restrictionId, restriction] of graph.restrictions) {
    const severity = severityOf(restriction)
    const resolution = graph.resolved.get(restrictionId)
    const declared = graph.declaredScope.get(restrictionId) ?? []
    const data = (restriction.data ?? {}) as Record<string, unknown>
    const heldField = data['holds_field']

    const about: { id: string; title: string }[] = []
    let aboutDeleted = 0
    for (const target of declared) {
      const record = graph.live.get(target)
      if (record === undefined) {
        if (graph.deleted.has(target)) aboutDeleted += 1
        continue
      }
      about.push({ id: record.id, title: record.title })
    }

    // THE SAME DOWNSTREAM WALK THE RESOLUTION PATH USES, so the number on this surface and the set
    // that got re-validation rows are one reading. A harmless restriction never enters it.
    let reaches = 0
    if (severity !== 'harmless') {
      const seen = new Set<string>()
      for (const target of declared) {
        if (graph.deleted.has(target)) continue
        if (!graph.live.has(target)) continue
        seen.add(target)
        const reached = walk(graph, target, 'downstream')
        skippedDeleted += reached.skippedDeleted
        for (const recordId of reached.reached.keys()) seen.add(recordId)
      }
      reaches = seen.size
    }

    let owed = 0
    for (const [key, row] of rows) {
      if (!key.startsWith(`${restrictionId}\u0000`)) continue
      if (row.state === 'needs_review') owed += 1
    }

    found.push({
      restrictionId,
      kind: restriction.kind as RestrictionKind,
      title: restriction.title,
      severity,
      allowedUses: asStrings(data['allowed_uses']),
      disallowedClaims: asStrings(data['disallowed_claims']),
      holdsField: typeof heldField === 'string' ? heldField : null,
      answered: resolution !== undefined,
      resolvedAt: resolution?.at ?? null,
      resolvedBy: resolution?.by ?? null,
      about,
      aboutDeleted,
      reaches,
      owed,
    })
  }

  // WORST FIRST, then the ones that still stand, then by title. The order is
  // `RESTRICTION_SEVERITY`'s, read from the array rather than restated.
  found.sort(
    (a, b) =>
      RESTRICTION_SEVERITY.indexOf(a.severity) - RESTRICTION_SEVERITY.indexOf(b.severity) ||
      Number(a.answered) - Number(b.answered) ||
      a.title.localeCompare(b.title),
  )

  return {
    found,
    skippedDeleted,
    couldNotCheck: codeDependenciesNotWalked(),
    // THE SAME FOUR COUNTS, over a standing built the same way the pair reader builds it: a
    // restriction that is answered and still owes judgements is `resolved-unchecked`; one that owes
    // none is `resolved`; one nothing answers is `active`.
    counts: countsOf(
      found.map((row) => ({
        severity: row.severity,
        standing: { state: !row.answered ? 'active' : row.owed > 0 ? 'resolved-unchecked' : 'resolved' },
      })),
    ),
  }
}

/**
 * A RESTRICTION, FORWARD: which records it reaches. WHAT THE RESOLUTION PATH USES.
 *
 * It is `walk(..., 'downstream')` over the same adjacency the reads walk upstream, so the set that
 * gets re-validation rows is the set the reads return. Nothing else calls this, and a caller
 * wanting *what restricts this record* has three doors above and none of them is this.
 */
export function restrictionsFrom(
  restrictionId: string,
  workspaceId: string,
): RestrictionsReply<{ recordId: string; distance: number; path: Hop[] }[]> {
  const graph = restrictionGraph(workspaceId)
  const restriction = graph.restrictions.get(restrictionId)
  if (restriction === undefined) {
    return {
      found: [],
      skippedDeleted: 0,
      couldNotCheck: [
        {
          what: `the restriction ${restrictionId}`,
          because: 'it is not a live record of a deliberate unresolved slot or of something that ran instead',
        },
      ],
    }
  }
  // A harmless restriction reaches nothing, by the rule in the header. It writes no rows.
  if (severityOf(restriction) === 'harmless') {
    return { found: [], skippedDeleted: 0, couldNotCheck: codeDependenciesNotWalked() }
  }
  const declared = graph.declaredScope.get(restrictionId) ?? []
  const found: { recordId: string; distance: number; path: Hop[] }[] = []
  const seen = new Set<string>()
  let skippedDeleted = 0
  for (const target of declared) {
    if (graph.deleted.has(target)) {
      skippedDeleted += 1
      continue
    }
    if (!graph.live.has(target)) continue
    // The declared scope itself, at distance 0. The record the restriction is about is the first
    // thing that needs re-checking, and these rows are load-bearing beyond their own record: a
    // carried reading reads its standing off the row for the record it is carried from.
    if (!seen.has(target)) {
      seen.add(target)
      found.push({ recordId: target, distance: 0, path: [] })
    }
    const reached = walk(graph, target, 'downstream')
    skippedDeleted += reached.skippedDeleted
    for (const [recordId, path] of reached.reached) {
      if (seen.has(recordId)) continue
      seen.add(recordId)
      found.push({ recordId, distance: path.length, path })
    }
  }
  found.sort((a, b) => a.distance - b.distance || a.recordId.localeCompare(b.recordId))
  return { found, skippedDeleted, couldNotCheck: codeDependenciesNotWalked() }
}
