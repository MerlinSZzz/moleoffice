// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHAPES GET /api/attention ANSWERS IN, WORKED OUT FROM ONE READING.
 *
 * The attention thread (attention-thread.ts) puts the reading into the shape the request asked for
 * before it hands it back, so only that shape crosses to the thread that reads requests. Until round
 * 22 of wave 13w the thread handed back the whole reading and the route cut it there. On the made-up
 * office the size of the owner's (tests/an-office-with-answers-of-the-live-size.ts) the whole reading
 * was about 12 MB, and Home's shape about 3.5 KB of it (problem CtH8CGBkE5Bz).
 *
 * The route, the thread and the tests read the shapes from here, so there is one cut of each.
 */
import { attentionFirstPage, attentionPartOf, fullAttentionLists, type FullAttentionLists, type FlowAttentionRow, type AttentionFirstPage, type AttentionPart, type AttentionPartPage } from '@shared/attention-first-page.ts'
import type { AttentionRow, GroupCount, ReasonGroup } from '@shared/attention.ts'
import { BLOCK_KIND } from '@shared/blocks.ts'
import type { RecordKind, RecordOrigin } from '@shared/types.ts'
import type { AttentionReading } from './records.ts'

/** What `shape=home` answers: Home's first page, with the two stamps the route adds. */
export type AttentionHomeReply = AttentionFirstPage & Pick<AttentionReading, 'at' | 'read'>

/** What `shape=flow` answers: the fields the pipeline graph reads, and the two stamps. */
export type AttentionFlowReply = Pick<AttentionReading, 'total' | 'remainderNote' | 'counts' | 'at' | 'read'> & { visible: FlowAttentionRow[]; remainder: FlowAttentionRow[] }

/**
 * What `shape=other-projects` answers: Home's first page for each project on the list but the one the
 * request names, in the order of the list. `leftOut` is that one, which the frame already reads.
 */
export interface AttentionOfOtherProjects {
  leftOut: string
  projects: { workspaceId: string; reading: AttentionHomeReply }[]
}

/**
 * THE NARROW ROW: WHAT A LIST DRAWS OF A SELECTED THING, WITHOUT WHY IT IS THERE.
 *
 * `reason`, `factors`, `score` and `progress` are what a page reads after
 * somebody opens a row, and they are most of the bytes of the answer. This is the row a caller that
 * reads only what needs attention gets; nothing here is worked out again from the reading.
 */
export interface NarrowAttentionRow {
  key: string
  recordId: string
  recordKind: RecordKind
  partId: string | null
  itemId: string | null
  title: string
  state: string | null
  group: ReasonGroup
  safety: boolean
  displacedBy: 'group-cap' | 'row-cap' | null
  origin: RecordOrigin | null
}

/** What `shape=narrow` answers: the same reading's selected rows, cut to the narrow row. */
export interface AttentionNarrowReply {
  visible: NarrowAttentionRow[]
  remainder: NarrowAttentionRow[]
  total: number
  counts: AttentionReading['counts']
  remainderByGroup: GroupCount[]
  remainderNote: string | null
  at: string
  read: AttentionReading['read']
}

export type AttentionFullReply = Omit<AttentionReading, keyof FullAttentionLists> & FullAttentionLists

/** The fields open-work ranking uses from the attention reading. */
export type AttentionRankingReply = Pick<AttentionReading, 'at'> & {
  visible: Pick<AttentionRow, 'recordId' | 'score'>[]
  remainder: Pick<AttentionRow, 'recordId' | 'score'>[]
}

/** The shape a caller asks the attention thread for. `whole` is the reading itself. */
export type AttentionShape = { shape: 'whole' } | { shape: 'ranking' } | { shape: 'narrow' } | { shape: 'home' } | { shape: 'flow' } | { shape: 'part'; part: AttentionPart; from: number; machine?: 'include' | 'omit' } | { shape: 'full'; machine: 'include' | 'omit' }

/** The reply each shape is. */
export type AttentionInTheShape<S extends AttentionShape> = S extends { shape: 'ranking' }
  ? AttentionRankingReply
  : S extends { shape: 'home' }
  ? AttentionHomeReply
  : S extends { shape: 'full' }
    ? AttentionFullReply
  : S extends { shape: 'flow' }
    ? AttentionFlowReply
    : S extends { shape: 'narrow' }
      ? AttentionNarrowReply
      : S extends { shape: 'part' }
        ? AttentionPartPage
        : AttentionReading

// ------------------------------------------------------- the home page's own reading of the answer

/**
 * HOME'S FIRST PAGE OF THE ANSWER, AND THE PAGES BEHIND ITS FOLDS.
 *
 * `shape=home` used to be the whole answer with the three question lists left off and the rows cut,
 * and Developer mode asked for the whole answer because it draws those lists. On the owner's office on
 * 9 October 2026 the whole answer was 11,767,705 bytes, and Home froze while it drew it (round 19 of
 * wave 13w). Now both modes ask `shape=home`, which is `attentionFirstPage` in
 * src/shared/attention-first-page.ts: the rows the frame and Home count from, the newest reports
 * waiting, and the counts of everything else. `shape=part&part=<list>&from=<n>` answers one page of
 * one list when a reader opens its fold. A plain call answers the narrow reading.
 */
export function homeAttention(reading: AttentionReading): AttentionHomeReply {
  return { ...attentionFirstPage(reading), at: reading.at, read: reading.read }
}

/**
 * THE NARROW READING, AND WHY IT IS THE DEFAULT.
 *
 * A decision made the narrow reading the default.
 * Measured since 27 August 2026 (GET /api/usage/operations):
 * project.attention answered 7.46 GB in 4,373 calls, about 1.7 MB each. Most of that is the rule's
 * work: `reason`, every rank factor, `score` and `progress` on each selected row, and the second
 * lists and machine sweep nobody reads until they open a row. This shape keeps the rows the rule
 * selected — cut to the keys a list draws — and the numbers that say what was counted, and it
 * carries no reason and none of the second lists. It cuts rows the one reading produced; it does
 * not decide anything itself. `?shape=full` answers pages of the reading with counts and continuations.
 */
export function narrowAttention(reading: AttentionReading): AttentionNarrowReply {
  const cut = (row: AttentionRow): NarrowAttentionRow => ({
    key: row.key,
    recordId: row.recordId,
    recordKind: row.recordKind,
    partId: row.partId,
    itemId: row.itemId,
    title: row.title,
    state: row.state,
    group: row.group,
    safety: row.safety,
    displacedBy: row.displacedBy,
    origin: row.origin,
  })
  return {
    visible: reading.visible.map(cut),
    remainder: reading.remainder.map(cut),
    total: reading.total,
    counts: reading.counts,
    remainderByGroup: reading.remainderByGroup,
    remainderNote: reading.remainderNote,
    at: reading.at,
    read: reading.read,
  }
}

/**
 * THE PIPELINE GRAPH'S OWN READING, AND WHY IT IS NARROWER AGAIN.
 *
 * `getGraphData` in src/web/pages/PipelinePage.tsx reads two things off this
 * reply: `visible` and `remainder`. A block keeps its whole row because the page draws its reason;
 * other rows keep only graph fields. The shape keeps `counts`, `total`,
 * `remainderNote` and the two stamps beside them, and leaves everything else off. `home` and
 * `narrow` both exist beside it rather than replacing it.
 */
export function flowAttention(reading: AttentionReading): AttentionFlowReply {
  const graphRow = (row: AttentionRow): FlowAttentionRow => {
    if (row.recordKind === BLOCK_KIND) return row
    const { recordId, recordKind, score, safety, reason } = row
    return { recordId, recordKind, score, safety, reason: { coded: reason.coded, owed: reason.owed, consequence: reason.consequence, stoppedShort: reason.stoppedShort === null ? null : { since: reason.stoppedShort.since } } }
  }
  return {
    visible: reading.visible.map(graphRow),
    remainder: reading.remainder.map(graphRow),
    total: reading.total,
    remainderNote: reading.remainderNote,
    counts: reading.counts,
    at: reading.at,
    read: reading.read,
  }
}

/** Cut the already-ranked rows on the worker before sending them to open work. */
export function rankingAttention(reading: AttentionReading): AttentionRankingReply {
  const row = ({ recordId, score }: AttentionRow) => ({ recordId, score })
  return { at: reading.at, visible: reading.visible.map(row), remainder: reading.remainder.map(row) }
}

/** The reading in the shape asked for. */
export function attentionInTheShape<S extends AttentionShape>(asked: S, reading: AttentionReading): AttentionInTheShape<S> {
  const shaped =
    asked.shape === 'ranking'
      ? rankingAttention(reading)
      : asked.shape === 'full'
      ? { ...reading, ...fullAttentionLists(reading, asked.machine) }
      : asked.shape === 'home'
      ? homeAttention(reading)
      : asked.shape === 'flow'
        ? flowAttention(reading)
        : asked.shape === 'narrow'
          ? narrowAttention(reading)
          : asked.shape === 'part'
            ? attentionPartOf(reading, asked.part, asked.from, asked.machine)
            : reading
  return shaped as AttentionInTheShape<S>
}
