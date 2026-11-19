// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RECORD HAS WRITTEN AT EACH LEVEL, READ ONCE, WITH THE RECORD IN HAND.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A FILE OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * These two functions were inside `src/web/components/graph/model.ts` and could only be called by
 * something holding the whole project's records. That was every drawing until the plan drawing:
 * the planning route decides which records a period reaches, on the server, and serves them — so
 * the browser has plan nodes and no records, and the card on one still has to reach the same
 * ladder as a module card.
 *
 * So the two readers moved here, where the server can call them too. Nothing about what they answer
 * changed. `src/server/lib/openloops.ts` and `src/server/lib/zoom.ts` already import from
 * `src/web/lib/` for the same reason: these are pure readers over a stored record, with no browser
 * in them.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THEY EXIST TO KEEP
 * ---------------------------------------------------------------------------------------
 *
 * A card is a box on a canvas and has no record. Reading a record's written forms inside the card
 * would mean handing every record to the drawing and asking again on every render — a canvas
 * re-deciding, with a viewport in its hand, what a record holds. It is read once, here, and the
 * node carries the answer.
 */

import { rungsFor, whyEachLevelIsMissing, type DetailNothing, type DetailText, type LevelAbsence, type Rung } from '@shared/detail.ts'
import { formsWrittenIn, reportAt, type DrawnPart } from '@shared/reportrungs.ts'
import { BY_PART_LEVELS, type ByPartLevel } from '@shared/zoom.ts'
import { blocksFieldOf } from '@shared/kinds.ts'
import type { PanelRecord, SummaryBlock } from '@shared/types.ts'
import { detailSourceOf, wordsAt } from '@shared/detailsource.ts'

/**
 * THE THREE POSITIONS OF THE DETAIL LADDER A DRAWING EVER ASKS FOR.
 *
 * `src/shared/detail.ts` declares six. A card is a box on a canvas, so the three longest — `card`,
 * `brief` and the record's own content — are not lengths a card has room for at any zoom, and a
 * drawing that asked for one would be handed a paragraph to put in a 288px box. The reading layer
 * under the canvas is where the whole of a record is printed.
 */
export const GRAPH_RUNGS = ['label', 'title', 'gist'] as const
export type GraphRung = (typeof GRAPH_RUNGS)[number]

/**
 * The stored words a node can draw, at each of the three positions.
 *
 * EVERY VALUE CAME OUT OF A STORED FIELD AND SAYS WHICH ONE. `wordsAt` reads the record and cuts
 * nothing; `drew` says which rung actually answered, so a card can tell "somebody wrote a label for
 * this" from "the ladder walked up to the title column because nobody did". The difference is the
 * whole of what zooming out is allowed to change.
 */
export type NodeWords = Readonly<Record<GraphRung, DetailText | DetailNothing>>

/**
 * The three lengths of this record's own stored words, read once.
 *
 * `wordsAt` is the one reader of a record's short forms, its title column and its summary column;
 * calling it here means a card at any zoom draws characters something already read, rather than a
 * canvas re-deciding what a record's shortest name is with a viewport in its hand.
 */
export function wordsOf(record: PanelRecord): NodeWords {
  return Object.fromEntries(GRAPH_RUNGS.map((rung) => [rung, wordsAt(record, rung as Rung)])) as NodeWords
}

/**
 * WHICH POSITIONS OF THE LADDER THIS RECORD HAS, AND ITS PARTS AS EACH OF THE THREE DRAWS THEM.
 *
 * WHICH LEVELS EXIST is `rungsFor` — which the KIND has a place for, and where the record's own
 * length stops the ladder — narrowed by `formsWrittenIn`, which is which of them somebody actually
 * wrote. Both live in the shared half and both are what the report page and the settings counter
 * read, so a card and a report cannot come to two answers about one record.
 *
 * WHAT THE PARTS SAY is `reportAt`, the one function the report body itself draws from. A card at
 * level 5 draws the same headings and the same texts as the report page at level 5, out of the same
 * call, and never a second walk over `data.shortForms.parts`.
 */
export interface NodeLevels {
  /**
   * The positions this record has words at, shortest first.
   *
   * `full` IS NEVER ON IT. A card is a box on a canvas and the record itself is what the reading
   * layer under the drawing prints; `formsWrittenIn` does not answer for Full either.
   */
  has: readonly Rung[]
  /**
   * WHY THE RECORD HAS NOT GOT EACH LEVEL IT HAS NOT GOT: no place on this kind, too short, or
   * nobody wrote it. A level it HAS is not in the map.
   *
   * `has` USED TO BE THE WHOLE ANSWER AND IT LOST THE REASON. It is an intersection of two lists,
   * and an intersection cannot say which of the two removed a rung, so the card told a reader
   * *nobody has written this record by part* about a record whose parts are stored and about a kind
   * that has no place for parts at all. Both are false and a reader acting on either gets nowhere.
   * `whyEachLevelIsMissing` in @shared/detail.ts is the one place the three are told apart.
   */
  why: Readonly<Partial<Record<Rung, LevelAbsence>>>
  /** The record's parts as each by-part level draws them, or null where nobody wrote them. */
  parts: Readonly<Record<ByPartLevel, readonly DrawnPart[] | null>>
}

export function levelsOf(record: PanelRecord): NodeLevels {
  const source = detailSourceOf(record)
  const written = new Set(formsWrittenIn(source).map((one) => one.rung))
  const has = rungsFor(source).filter((rung) => written.has(rung))
  const why = whyEachLevelIsMissing(source, written)
  const field = blocksFieldOf(record.kind)
  const stored = field === null ? undefined : (record.data as Record<string, unknown> | null)?.[field]
  const blocks = Array.isArray(stored) ? (stored as SummaryBlock[]) : []
  const parts = Object.fromEntries(
    BY_PART_LEVELS.map((level) => [level, reportAt(source, blocks, level).parts]),
  ) as NodeLevels['parts']
  return { has, why, parts }
}
