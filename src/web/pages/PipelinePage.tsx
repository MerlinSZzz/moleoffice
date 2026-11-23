// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { ReportsScope } from '../components/ReportsScope.tsx'
import { ChecklistItemsHere, DecisionFacts, RelatedList, type RelatedReading } from '../components/RelatedHere.tsx'
import { consumePreparedPage, peekPreparedPage } from '../lib/prepared-page.ts'
import { t, type WordKey } from '@shared/i18n.ts'
import { stateWord } from '@shared/words.ts'
import { useLanguage } from '../lib/language.ts'
import { currentWorkspace } from '../lib/workspace.ts'
/**
 * The project structure, drawn — and, under it, every pipeline on file in detail.
 *
 * SINCE WAVE 13j's ROUND 11 THIS DRAWING IS NOT WHAT `#/pipeline` OPENS ON. `#/pipeline` is the list
 * of pipelines (PipelinesList.tsx), where the drawing is a card with a small picture; the card opens
 * `#/pipeline/drawing`, and a pipeline's row opens `#/pipeline/<id>`. What follows is about the
 * drawing page those two addresses open.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED HERE, AND WHY THE ORDER OF THE PAGE IS THE CHANGE
 * ---------------------------------------------------------------------------------------
 *
 * This page used to open on a LIST of nine pipelines and then draw ONE of them as a steps × modules
 * matrix. Both are good and both are still here, at the foot of the page. What was wrong was that
 * they were the first thing a reader met, and neither of them is the project: a list of pipelines
 * cannot say what the project is made of, and a matrix of one pipeline cannot say what it waits on.
 * The structure — the modules, and the typed links between them — was drawn nowhere at all.
 *
 * So the page now opens on a real graph, laid out automatically, and the list and the matrix are the
 * detailed view behind it. That is the whole reordering: same facts, different first sentence.
 *
 * NOTHING WAS DELETED TO MAKE ROOM. `orderPipelines`, `standingOn`, `attentionByBlocks` and the
 * matrix drawing are unchanged and are still exported and still tested. They sit inside `Explain`
 * folds that name exactly what they hold and how many, which is this app's own pattern for prose and
 * detail that is read carefully once — not a hidden list.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PAGE OPENS ON THE MODULES AND NOT ON A PIPELINE
 * ---------------------------------------------------------------------------------------
 *
 * The rail calls this page "Pipelines" and it still is one. It opens on the modules because a
 * pipeline's steps only mean something against the things that carry them: `03 Close and hold` is a
 * step, and what it is really about is the tray clamp and the force bench. Every pipeline is one press
 * away in the same picker, and picking one there also decides which one the matrix below draws, so
 * the two halves of the page cannot end up showing different pipelines.
 *
 * WHICH DRAWING IS OPEN IS NOW IN THE ADDRESS. `#/pipeline/drawing` is the modules drawing;
 * `#/pipeline/<id>` is that pipeline, on the canvas and in the grid at the foot. It was component state, which meant a
 * drawing could not be linked to, sent to anybody, or reloaded back into — and it meant the review
 * tool could only ever photograph the drawing the page happened to open on, so nobody had ever seen
 * a picture of a pipeline on this canvas. Both halves of the page read the same one address.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PAGE FETCHES, AND WHY IT IS MORE THAN IT WAS
 * ---------------------------------------------------------------------------------------
 *
 * Records, the attention reply, and the links — three requests, whatever the size of the workspace.
 *
 * IT USED TO BE ONE REQUEST PER STRUCTURAL RECORD. There was no route that returned every link at
 * once, so this page read links the only way there was: `GET /api/records/:id` for every module,
 * pipeline and block, deduplicating the overlap because a link is served on both of its ends. That
 * was 104 requests on the corpus of the day, and above about 1,350 structural records it was a dead
 * page — the browser refused the requests before the server heard any of them. `AT_ONCE` below
 * bounded the fan-out and kept the page alive at 15,120 records; `GET /api/links` removes the
 * fan-out, and with it `dedupeLinks`, because reading every link once means never reading one twice.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { AttentionRow } from '@shared/attention.ts'
import type { FlowAttentionRow } from '@shared/attention-first-page.ts'
import type { AttentionFlowReply } from '../../server/lib/attention-shapes.ts'
import { BLOCK_KIND } from '@shared/blocks.ts'
import type { PanelRecord } from '@shared/types.ts'
import { api, type RecordListItem } from '../api.ts'
import type { GatedLink } from '../components/LinkPanel.tsx'
import {
  HungPipelines,
  PipelineFlow,
  plural,
  stepNumber,
  type FlowStep,
  type PipelineReading,
  type StepAttention,
} from '../components/PipelineFlow.tsx'
import { NothingInTheDrawing, StructureView, intentReadAhead, type IntentAnswer } from '../components/graph/StructureView.tsx'
import type { ASentenceAndItsWord } from '../components/graph/restrictions-and-presence.ts'
import { readEveryPackage } from '../components/TaskPackagePanel.tsx'
import { lanesInputFor, readEveryPipeline } from '../components/graph/lanes/from-records.ts'
import { LanesDrawing } from '../components/graph/lanes/LanesDrawing.tsx'
import type { LanesTree } from '../components/graph/lanes/tree.ts'
import { graphLinks, type GraphLink, type Scope } from '../components/graph/model.ts'
// THE ONE WAY A CONTROL SAYS WHAT IT IS, so a person can point a comment at the tier control. The
// index fold and the panel head use `Panel`'s and `Explain`'s own `declares`; this control is plain
// markup, so it carries the name the same way `LevelControl` on a report page does.
import { partOfMoleOffice } from '../components/agent/pointing.ts'
import { navigate, pipelineDrawingPath, pipelinePath, recordPath, RouteLink } from '../components/router.tsx'
import { PipelinesList } from './PipelinesList.tsx'
import {
  Absence,
  Empty,
  ErrorNote,
  Explain,
  HiddenCount,
  Loading,
  Panel,
  Row,
  Tag,
  alarmFor,
  daysSince,
  type AlarmLevel,
  type PanelState,
} from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
// THE FOLD OF A MODULE'S RELATED LISTS, so the lists here fold at the same number.
import { OPEN_LOOPS_DRAWN } from './RecordPage.tsx'

// ============================================================================ reading the reply

/**
 * The server's attention rows that belong to pipeline blocks, keyed by block record id.
 *
 * ONE MAP, NOT TWO. It used to be keyed by (pipeline id, step id), because a step's identity was a
 * pair and nothing anywhere declared that pair as the key — which is why the API accepted two steps
 * with one id and then served two attention rows carrying one key. A block is a record, so a row is
 * keyed by a primary key and the composite is gone.
 *
 * BOTH LISTS ARE READ. A row in `remainder` was selected by exactly the same rule as a row in
 * `visible`; what moved it was a cap on how many rows one screen shows. Reading only `visible` here
 * would mean a failed block vanished from its own pipeline's page because three obligations
 * outranked it somewhere else, which is the kind of quiet loss this product exists to stop.
 */
function isWholeBlockRow(row: FlowAttentionRow): row is AttentionRow {
  return row.recordKind === BLOCK_KIND && 'factors' in row.reason && Array.isArray(row.reason.factors)
}

export function attentionByBlocks(reply: AttentionFlowReply): Map<string, StepAttention> {
  const out = new Map<string, StepAttention>()
  const take = (rows: readonly FlowAttentionRow[], where: 'visible' | 'remainder') => {
    for (const row of rows) {
      if (!isWholeBlockRow(row)) continue
      // The higher-ranked reading wins. `visible` is taken first, so a row that appears in both
      // lists — which nothing produces today — keeps the one a reader would have seen.
      if (!out.has(row.recordId)) out.set(row.recordId, { row, where })
    }
  }
  take(reply.visible, 'visible')
  take(reply.remainder, 'remainder')
  return out
}

// ============================================================================ the index

/** One line of the index: what the pipeline is, where it has got to, and how much needs a person. */
export interface PipelineEntry {
  reading: PipelineReading
  /** Steps of this pipeline the server put on the attention list, `visible` and `remainder` both. */
  onList: number
  /** How many of those are on the first screen of that list. */
  onFirstScreen: number
  /** The highest score the server gave any of this pipeline's steps. Null when none is on the list. */
  topScore: number | null
  /** True when any of them carries a stored consequence of "a person could be hurt". */
  safety: boolean
  done: number
  stopped: number
  /**
   * THE THREE ORDERING NUMBERS, WITH EVERY BLOCKED STEP LEFT OUT. Under question 18
   * of report n9Mjk3c_sJRu, a blocked line of work is not shown first, as
   * something for the person, until the record says who it waits on. No kind stores who a blocked step
   * waits on, so a blocked step never lifts its pipeline here. The row still counts and names it:
   * `onList`, `stopped` and `why` above are unchanged.
   */
  orderedBy: { onList: number; topScore: number | null; stopped: number }
  total: number
  /** The step it is standing on: the first failed, then blocked, then doing, then todo. */
  standingOn: { step: FlowStep; index: number } | null
  /**
   * How loudly to draw the row, from the shared alarm scale.
   *
   * THIS IS DECISION 2 AND IT IS WHY THE INDEX IS NOT A WALL OF RED. Seven of the nine pipelines on
   * file hold a failed or a blocked step, and Row's older reading would tint every one of them at
   * full strength — which is a list that has stopped ranking anything. The level here comes from
   * `alarmFor` over numbers the SERVER sent about the top-ranked step in each pipeline, so an old
   * failure recedes and a safety row does not.
   */
  alarm: AlarmLevel
  /** Why this row is where it is in the index, in one sentence. */
  why: string
}

/** The step a pipeline is standing on, by the same reading the home panel has always used. */
export function standingOn(steps: readonly FlowStep[]): { step: FlowStep; index: number } | null {
  const first = (want: FlowStep['state']) => {
    const index = steps.findIndex((step) => step.state === want)
    const step = steps[index]
    return index < 0 || step === undefined ? null : { step, index }
  }
  return first('failed') ?? first('blocked') ?? first('doing') ?? first('todo')
}

/**
 * Order the index by how much of each pipeline needs a person.
 *
 * THE ORDER IS: anything with a step whose stored consequence says a person could be hurt, then by
 * how many steps are on the attention list, then by the best score the server gave one of them, then
 * by how many steps have stopped short, then by the order the pipelines were filed. A BLOCKED STEP
 * COUNTS IN NONE OF THE LAST THREE, by question 18 of a decision. Nothing
 * stored says who it waits on, so it does not put its pipeline first as something for the person.
 * Safety is not a question of who it waits on, so a blocked step with a safety consequence still
 * counts there.
 *
 * SAFETY IS A SEPARATE KEY AND NOT A BIG NUMBER, for the same reason it is one on the server:
 * nothing may out-add a person being hurt, and a safety row filed this morning must not sort below a
 * stale one. Everything below it is the server's own score, never a second opinion about it.
 */
export function orderPipelines(
  readings: readonly PipelineReading[],
  attention: ReadonlyMap<string, StepAttention>,
  now: number = Date.now(),
): PipelineEntry[] {
  const entries = readings.map((reading): PipelineEntry => {
    const steps = reading.steps
    // The pipeline's rows are its BLOCKS' rows, gathered from the ordered list it holds. The
    // attention map is keyed by block record id now, because a block is a record.
    const rows = steps.map((step) => attention.get(step.id)).filter((row): row is StepAttention => row !== undefined)
    const onFirstScreen = rows.filter((row) => row.where === 'visible').length
    const topScore = rows.length === 0 ? null : Math.max(...rows.map((row) => row.row.score))
    const safety = rows.some((row) => row.row.safety)
    const done = steps.filter((step) => step.state === 'done').length
    const stopped = steps.filter((step) => step.state === 'failed' || step.state === 'blocked').length
    // THE SAME NUMBERS WITHOUT THE BLOCKED STEPS, for the order only. See `orderedBy` above.
    const notBlocked = new Set(steps.filter((step) => step.state !== 'blocked').map((step) => step.id))
    const askingRows = rows.filter((row) => notBlocked.has(row.row.recordId))
    const orderedBy = {
      onList: askingRows.length,
      topScore: askingRows.length === 0 ? null : Math.max(...askingRows.map((row) => row.row.score)),
      stopped: steps.filter((step) => step.state === 'failed').length,
    }

    const why =
      reading.problem !== null
        ? t('g7b.PipelinePage.it_cannot_be_drawn_what_is_wrong')
        : safety
          ? t('g7b.PipelinePage.a_step_in_it_records_that_a')
          : rows.length > 0
            ? rows.length === 1
              ? t('g7b.PipelinePage.step_is_on_the_attention_list', { v1: onFirstScreen === 1 ? t('g7b.PipelinePage.on_the_first_screen_of_it') : t('g7b.PipelinePage.held_back_into_the_remainder') })
              : t('g7b.PipelinePage.steps_are_on_the_attention_list', { v1: rows.length, v2: onFirstScreen === 0
                    ? t('g7b.PipelinePage.all_of_them_held_back_into_the')
                    : t('g7b.PipelinePage.of_them_on_the_first_screen_of', { v1: onFirstScreen }) })
            : stopped > 0
              ? t('g7b.PipelinePage.no_step_is_on_the_attention_list', { v1: plural(stopped, t('g7b.PipelinePage.step_has'), t('g7b.PipelinePage.steps_have')) })
              : t('g7b.PipelinePage.nothing_in_it_has_stopped_short_and')

    // The loudest of this pipeline's own rows, worked out with the shared scale from what the
    // server sent. A pipeline that cannot be read is `raised`: an unreadable record is a real
    // problem, and it is not the same kind of problem as a step that failed three weeks ago.
    const top = rows.reduce<StepAttention | null>(
      (best, row) => (best === null || row.row.score > best.row.score ? row : best),
      null,
    )
    const alarm: AlarmLevel =
      top !== null
        ? alarmFor({
            safety: top.row.safety,
            lateMs: top.row.reason.owed?.lateMs ?? null,
            satDays: daysSince(top.row.reason.stoppedShort?.since ?? null, now),
          })
        : reading.problem !== null
          ? 'raised'
          : stopped > 0
            ? 'plain'
            : 'faded'

    return {
      reading,
      alarm,
      onList: rows.length,
      onFirstScreen,
      topScore,
      safety,
      done,
      stopped,
      orderedBy,
      total: steps.length,
      standingOn: standingOn(steps),
      why,
    }
  })

  return entries
    .map((entry, filed) => ({ entry, filed }))
    .sort((a, b) => {
      if (a.entry.safety !== b.entry.safety) return a.entry.safety ? -1 : 1
      const x = a.entry.orderedBy
      const y = b.entry.orderedBy
      if (x.onList !== y.onList) return y.onList - x.onList
      const aScore = x.topScore ?? -1
      const bScore = y.topScore ?? -1
      if (aScore !== bScore) return bScore - aScore
      if (x.stopped !== y.stopped) return y.stopped - x.stopped
      return a.filed - b.filed
    })
    .map((wrapped) => wrapped.entry)
}

/** The chip at the head of an index row: the state of the step the pipeline is standing on. */
export function chipFor(entry: PipelineEntry): PanelState {
  if (entry.reading.problem !== null) return 'broken'
  if (entry.standingOn === null) return 'done'
  return entry.standingOn.step.state
}

// ============================================================================ loading

/**
 * Everything the page needs, in one consistent moment, in three requests.
 *
 * THREE, AND NOT ONE PER RECORD, and the difference is the whole history of this function. There
 * was no way to read more than one record's links at a time, so this asked for every structural
 * record separately. Measured, on scratch copies of the real database, on ports above 39000:
 *
 *   structural records | /api requests the page created | reached the server | refused | the page
 *   1,352              | 1,357                          | 1,357              | 0       | drew
 *   2,080              | 2,084                          | 1,358              | 726     | "Cannot reach the Mole Office server"
 *
 * The second row is a total loss of the page — 207 DOM nodes, no retry that can ever succeed —
 * blaming a server that answered every one of the 1,358 requests it was given. The refusal is
 * Chromium's `ERR_INSUFFICIENT_RESOURCES`, and it happens in the browser: the request never leaves,
 * so no server can be fast enough to help and none can even report the loss.
 *
 * A pool held the requests to eight at a time, which kept the page alive at 15,120 records and left
 * the load proportional to the size of the workspace. `GET /api/links` makes it a constant: the
 * number of requests this page makes no longer depends on what the workspace holds at all.
 *
 * The three leave together, so the drawing, the reasons on it and the lines between the cards all
 * describe the same instant.
 *
 * A LINK READ THAT FAILS IS NOT A MISSING LINK. If it is refused the whole load fails and the page
 * says so, rather than drawing a graph with fewer lines than the database holds — a picture that is
 * quietly incomplete is worse here than no picture at all.
 */
export async function loadPage(): Promise<{
  records: RecordListItem[]
  attention: AttentionFlowReply
  links: GraphLink[]
  /** What moves along each link, by link id, as the bulk link read served it. `undefined` is nobody said. */
  linkCarries: ReadonlyMap<string, string | null | undefined>
}> {
  // THE GRAPH'S OWN SHAPE: this reads `visible` and `remainder` and
  // nothing else off the attention reply, so it asks for the shape that keeps exactly those two,
  // in whole rows. The whole answer, with its three question lists, stays one parameter away and
  // every other caller of the plain form keeps it.
  //
  // THE STRUCTURE FAMILY WHOLE, AND EVERY RECORD ONE LINK AWAY IN THE LIGHT SHAPE, which is what a chip on a card
  // draws (a title, a kind and a state). It read the whole project: 142 MB on the live office (round 15). A far end
  // that is deleted is not in the answer, so the drawing still says so.
  // THE LINKS TOUCHING THE STRUCTURE, with the fields the drawing reads. A link with no structure
  // record at either end is not drawn: every node the drawing has is a module, a pipeline or a
  // block, or a record one link from one of them, and that one link is here.
  const [records, attention, links] = await Promise.all([
    api.recordsOf({ family: 'structure', farEnds: 'light' }).then((r) => [...r.records, ...(r.farEnds ?? [])]),
    api.attention({ shape: 'flow' }),
    api.listLinks({ touchesKind: ['module', 'pipeline', 'block'], shape: 'draw' }),
  ])
  for (const row of [...attention.visible, ...attention.remainder]) {
    if (row.recordKind === BLOCK_KIND && !isWholeBlockRow(row)) throw new Error(t('pipelinePage.aBlockCameWithoutItsReason'))
  }
  // THE CARRIES SURVIVES THE GRAPH'S NARROWER SHAPE. `GraphLink` is what the drawings were built
  // on and it does not hold what moves along a link; the pipeline's own reader needs it, so it is
  // kept by link id here rather than widening a shape every drawing reads.
  const linkCarries = new Map(links.map((link) => [link.id, link.carries] as const))
  return { records, attention, links: graphLinks(links), linkCarries }
}

// ============================================================================ reading tiers

/**
 * HOW MUCH OF ONE PIPELINE IS DRAWN HERE: THREE TIERS BEFORE FULL.
 *
 * ---------------------------------------------------------------------------------------
 * THE DECISION
 * ---------------------------------------------------------------------------------------
 *
 * Three tiers and nothing between them, from a message and from a decision built on the by-part
 * idea the review had proposed.
 *
 *   1  title                 the pipeline's own title, and nothing else
 *   2  blockTitles          one line per block, being the block's title
 *   3  blockTitlesWithLine  the block titles, and under each one its first line
 *   4  full                 the drawing exactly as it is, tiers and nothing changed
 *
 * TIER 3'S LINE IS THE BLOCK'S OWN SUMMARY where a block has one; where it has none, the first
 * sentence of what was measured on the block. Both are stored words read off the record or the
 * `measured` column: nothing here generates a line, and nothing is cut shorter than a sentence.
 *
 * ONLY TIERS THAT HAVE WORDS ARE OFFERED. A pipeline with no blocks offers the title and full and
 * nothing between them; tier 3 is offered where at least one block carries a line. The words at a
 * tier are counted from the same stored list the drawing reads, so the control and the drawing
 * cannot come to disagree about how much there is.
 */
export type PipelineTier = 'title' | 'blockTitles' | 'blockTitlesWithLine' | 'full'

export const PIPELINE_TIERS: readonly PipelineTier[] = ['title', 'blockTitles', 'blockTitlesWithLine', 'full']

const TIER_WORDS: Readonly<Record<PipelineTier, string>> = {
  get title() { return t('g7b.PipelinePage.title') },
  get blockTitles() { return t('g7b.PipelinePage.block_titles') },
  get blockTitlesWithLine() { return t('g7b.PipelinePage.block_titles_and_a_line') },
  get full() { return t('g7b.PipelinePage.full') },
}

/**
 * The one line tier 3 draws under a block title, or null where the block has none.
 *
 * THE BLOCK'S OWN SUMMARY FIRST, because it is a line somebody wrote to answer the question, then
 * the first sentence of `measured`. Both are read once here; the drawing asks nothing of the block
 * a second time.
 */
export function oneLineOfBlock(step: FlowStep): string | null {
  const summary = step.record?.summary
  if (typeof summary === 'string' && summary.trim() !== '') return summary.trim()
  if (step.measured === null) return null
  return firstSentence(step.measured)
}

/** The block's first sentence, cut whole at the first full stop and never mid-sentence. */
export function firstSentence(text: string): string {
  const trimmed = text.trim()
  if (trimmed === '') return ''
  const cut = trimmed.search(/(?<=[.!?])[ \t\r\n]/)
  return cut > 0 ? trimmed.slice(0, cut) : trimmed
}

/** How much there is to draw at the two middle tiers, counted from the stored words. */
export function pipelineTierCount(reading: PipelineReading): { blockTitles: number; withLine: number } {
  const steps = reading.steps
  return { blockTitles: steps.length, withLine: steps.filter((step) => oneLineOfBlock(step) !== null).length }
}

/** The tiers this record has words for. These are what the control offers, and nothing else. */
export function tiersOffered(reading: PipelineReading): readonly PipelineTier[] {
  const counts = pipelineTierCount(reading)
  const offered: PipelineTier[] = ['title']
  if (counts.blockTitles > 0) offered.push('blockTitles')
  if (counts.blockTitles > 0 && counts.withLine > 0) offered.push('blockTitlesWithLine')
  offered.push('full')
  return offered
}

/**
 * WHERE THE PAGE OPENS WHEN NOBODY HAS SET ANYTHING: the block titles, except on a record with
 * fewer than two blocks, where the whole drawing says more and the shorter tier says it worse.
 */
export function defaultPipelineTier(reading: PipelineReading): PipelineTier {
  return reading.steps.length >= 2 ? 'blockTitles' : 'full'
}

/**
 * THE KEY THE TIER IS REMEMBERED UNDER. sessionStorage, per record, in the shape
 * `mole-office.here.<word>.<record id>` — the same storage and the same key shape the report page's
 * per-record view state (`mole-office.here.machinery.<id>`) already uses, so the two answers agree
 * about what belongs where.
 */
export function pipelineTierKeyFor(recordId: string): string {
  return `mole-office.here.pipelineTier.${recordId}`
}

/** The tier this record was left at in this browser visit, or null where nothing was stored. */
export function readStoredPipelineTier(recordId: string): PipelineTier | null {
  try {
    const word = window.sessionStorage.getItem(pipelineTierKeyFor(recordId))
    return (PIPELINE_TIERS as readonly string[]).includes(word ?? '') ? (word as PipelineTier) : null
  } catch {
    return null
  }
}

function writePipelineTierHere(recordId: string, tier: PipelineTier): void {
  try {
    window.sessionStorage.setItem(pipelineTierKeyFor(recordId), tier)
  } catch {
    // A browser that keeps nothing forgets the tier between visits, and the page still opens at
    // the default. Said here because saying it on screen would put a settings refusal where the
    // reader was reading a pipeline.
  }
}

/** The tier the drawn pipeline opens at: the stored one, or the record's own default. */
function rememberedTier(recordId: string, reading: PipelineReading): PipelineTier {
  const stored = readStoredPipelineTier(recordId)
  // A STORED TIER THE RECORD NO LONGER OFFERS is treated as absence and the default stands —
  // losing a stored choice to a record change is the same state as the choice never being made,
  // and quietly drawing an empty tier would be the worse substitute.
  return stored !== null && (PIPELINE_TIERS as readonly PipelineTier[]).includes(stored)
    ? stored
    : defaultPipelineTier(reading)
}

// ============================================================================ the page

/**
 * `#/pipeline` IS THE LIST, AND THE DRAWING IS AT ITS OWN ADDRESS.
 *
 * With no id and no `drawing`, the page is the list of pipelines in the family lists' design
 * (PipelinesList.tsx), on which the drawing is a card with a small picture. `#/pipeline/drawing` is
 * the drawing of every module and `#/pipeline/<id>` is one pipeline's drawing, both drawn below.
 */
export function PipelinePage({ id, drawing }: { id?: string; drawing?: boolean } = {}) {
  if (id === undefined && drawing !== true) return <PipelinesList />
  return <PipelineDrawingPage {...(id === undefined ? {} : { id })} />
}

function PipelineDrawingPage({ id }: { id?: string }) {
  useLanguage()
  const [held] = useState(() => id === undefined ? undefined : peekPreparedPage<Awaited<ReturnType<typeof loadPage>>>(pipelinePath(id)))
  const used = useRef(false)
  const ready = used.current || held === undefined || id === undefined ? undefined : peekPreparedPage(pipelinePath(id), held)
  const [state, reload] = useProjectAsync(() => {
    if (ready !== undefined && !used.current) { used.current = true; consumePreparedPage(ready); return Promise.resolve(ready.value) }
    used.current = true
    return loadPage()
  }, [], ready === undefined ? { saysRefreshing: true } : { saysRefreshing: true, startFrom: { value: ready.value } })
  const rereadWaiters = useRef<(() => void)[]>([])
  const reloadAndWait = () => new Promise<void>((resolve) => {
    rereadWaiters.current.push(resolve)
    reload()
  })
  useEffect(() => {
    if (state.status !== 'ready' || state.refreshing === true) return
    const waiters = rereadWaiters.current.splice(0)
    waiters.forEach((resolve) => resolve())
  }, [state])
  // THE PROJECT'S PACKAGES, for a block card that one package names (package PK, point PK-3). Its own request, and only
  // when a pipeline is open, so `loadPage` and the list page ask for no more than they did. The drawing waits for it.
  const [packages, rereadPackages] = useProjectAsync(() => (id === undefined ? Promise.resolve(null) : readEveryPackage()), [id])
  // WHICH PIPELINE THE PROJECT MARKS AS ITS MASTER (package BV, point BV-5). Its own request, one row by key, so
  // `loadPage` and the list page that shares it ask for no more than they did. With no pipeline in the address,
  // the grid at the foot draws the master; the page waits for this answer rather than draw another one first.
  const [master, rereadMaster] = useProjectAsync(() => api.masterPipeline(currentWorkspace()), [])
  // WHAT THE DRAWING COULD NOT SHOW, as the drawing hands it up, for the body section at the foot (wave 13u round 217).
  const [said, setSaid] = useState<readonly string[]>([])
  // WHAT THE LANES DRAWING COULD NOT DRAW, as it hands it up once it has drawn (wave 13u round 230).
  const [lanesSay, setLanesSay] = useState<readonly string[]>([])
  // WHAT RESTRICTS THE LANES' RECORDS AND WHO IS WORKING ON THEM, each sentence with its word key, as StructureView
  // hands it up while the lanes are on screen (16 November 2026).
  const [recordsSay, setRecordsSay] = useState<readonly ASentenceAndItsWord[]>([])

  /**
   * The last answer that arrived, kept so a WRITE does not blank the page.
   *
   * Every control in the editing panel rereads after it writes.
   * Without the last answer the page replaced itself with the loading skeleton the
   * instant you filed a module — which unmounted the panel, threw away the sentence saying what the
   * server had just said, and left you looking at a grey page wondering whether the write happened.
   * A probe found it by pressing the button, which is the one thing the screenshot tool cannot do.
   *
   * So a reload keeps drawing the previous answer and SAYS it is re-reading. The first load has no
   * previous answer and still shows the skeleton, because there the skeleton is the truth.
   */
  const lastGood = useRef<Awaited<ReturnType<typeof loadPage>> | null>(null)
  if (state.status === 'ready') lastGood.current = state.value

  // Which pipeline the drawing is scoped to and which one the grid at the foot draws: ONE answer,
  // and it is the address. It used to be two pieces of component state, which cost two things a
  // reader could feel — a drawing could not be linked to or sent to anybody, and two halves of one
  // page could be persuaded to show two different pipelines. `#/pipeline` is the modules drawing and
  // `#/pipeline/<id>` is that pipeline; the router learned the second segment this pass.
  const picked = id ?? null
  // ONE OBJECT FOR ONE ADDRESS (wave 13u round 217). The body section's facts are handed up from the drawing and
  // re-render this page. A scope made afresh on that render gives the drawing a new graph, which it measures and lays
  // out again, so a fact said only while the drawing is drawn goes away again. Case 3 of
  // tests/graph-presence-in-the-browser.test.ts is red without this.
  const scope = useMemo<Scope>(() => (id === undefined ? { at: 'modules' } : { at: 'pipeline', recordId: id }), [id])

  // One clock for the whole render, so the drawing and the index cannot disagree about how old a
  // failure is by the milliseconds between two calls.
  const now = useMemo(() => Date.now(), [state])

  // THE ARRANGEMENT STORED FOR THIS PIPELINE'S DRAWING (wave 13u round 230), as StructureView reads it and hands it up:
  // the page reads it nowhere else. Read draws its lanes; still reading or failed draws the arrangement last read when
  // one is kept; failed with nothing kept draws no lanes, and the body says so. The page is mounted afresh for each
  // address, so an answer here is always this pipeline's.
  const [intent, setIntent] = useState<IntentAnswer>(NOTHING_READ_YET)
  // ITS FIRST READ STARTS WITH THE PAGE'S OTHER READS (round 238). StructureView is mounted only once the records and
  // the packages are read, and its first read used to start only then. It now takes this request as that first read,
  // and hands its answer up as before. `#/pipeline/drawing` starts none, and its drawing sends its own first read.
  const readAhead = useMemo(() => (id === undefined ? null : intentReadAhead(scope)), [id, scope])
  useEffect(() => {
    readAhead?.start()
  }, [readAhead])
  // WHICH LEVEL THE MASTER'S DRAWING SHOWS. It opens at Boxes; every other pipeline is drawn at its steps.
  const [level, setLevel] = useState<LanesTree['level']>('boxes')

  const loaded = state.status === 'ready' ? state.value : lastGood.current
  const masterId = master.status === 'ready' && master.value.state === 'marked' ? master.value.id : null
  // THE LANES DRAWING'S INPUT, on a filed pipeline's address. None while the master is still being read, so it is never
  // drawn first as an ordinary pipeline, and none while the arrangement is read for the first time.
  const lanes = useMemo(() => {
    if (id === undefined || loaded === null || master.status !== 'ready') return null
    if (intent.at === 'reading' && intent.kept === null) return null
    const pipeline = loaded.records.find((record) => record.kind === 'pipeline' && record.id === id)
    if (pipeline === undefined) return null
    const drawnLevel = pipeline.id === masterId ? level : 'steps'
    const named = packages.status === 'ready' && packages.value !== null ? packages.value.tasks : undefined
    return lanesInputFor(loaded, masterId, pipeline, drawnLevel, intent.at === 'read' ? intent.stored : intent.kept, named)
  }, [id, loaded, master.status, masterId, level, intent, packages])

  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} retry={reload} />
  if (master.status === 'error') return <ErrorNote message={master.message} fault={master.fault} retry={rereadMaster} />
  if (packages.status === 'error') return <ErrorNote message={packages.message} fault={packages.fault} retry={rereadPackages} />
  if (loaded === null || (id === undefined && master.status === 'loading') || packages.status === 'loading') {
    return <Loading label={t('g7b.PipelinePage.the_project_structure')} rows={6} />
  }
  const rereading = state.status === 'ready' && state.refreshing === true

  const pipelineRecords = loaded.records.filter((record) => record.kind === 'pipeline')
  // THE PIPELINE THIS PAGE IS ABOUT, when the address names one that is filed: its own summary opens the page and its
  // own body closes it. An address naming nothing filed draws neither; PipelineDetail says what happened instead.
  const own = id === undefined ? undefined : pipelineRecords.find((record) => record.id === id)
  const isMaster = own !== undefined && own.id === masterId
  const readings = readEveryPipeline(loaded)
  const attention = attentionByBlocks(loaded.attention)
  const entries = orderPipelines(readings, attention, now)

  // Picking a drawing changes the ADDRESS, and the address is what the page reads back. So the
  // canvas and the grid at the foot cannot end up showing different pipelines, and the drawing you
  // are looking at is the one in the address bar.
  //
  // The picker in the drawing is made of links and needs only `hrefFor`; a row in the index at the
  // foot holds several things and is not itself a link, so those navigate in code. Both ends at the
  // same address, which is the point.
  const pathOf = (next: Scope) => (next.at === 'pipeline' ? pipelinePath(next.recordId) : pipelineDrawingPath())
  const hrefFor = (next: Scope) => `#${pathOf(next)}`
  const onScope = (next: Scope) => {
    navigate(pathOf(next))
  }

  // A FILED PIPELINE'S ADDRESS DRAWS THE LANES DRAWING in the canvas's place, inside StructureView, which keeps its
  // editor, its List and its picker. The modules drawing and an address naming nothing filed keep the canvas. On the
  // master the level control comes first, and its Boxes level with no box says so in the drawing's place. Lanes with no
  // card, as a pipeline with no step has, draw the canvas's empty mark there instead of an empty frame (round 230).
  const noBoxes = isMaster && level === 'boxes' && lanes !== null && !lanes.input.records.some((record) => record.role === 'box')
  const noCard = lanes !== null && !noBoxes && lanes.input.records.length === 0
  // THE BODY'S SENTENCES (16 November 2026): those a reader needs to trust the page, in the section after the About
  // part, and the rest in the developer view only. They are the arrangement that could not be read, what the input
  // could not draw, what the lanes drawing hands up while it is shown, and what restricts the drawn records and who is
  // working on them. With no lanes, StructureView hands up the canvas's sentences, and every reader is told them.
  const handedUp = [...(lanes === null || noBoxes || noCard ? [] : theDrawingsSentencesByKey(lanesSay)), ...recordsSay]
  const facts = [
    ...(intent.at !== 'failed'
      ? []
      : [t(intent.kept === null ? 'lanesInput.intentFailed' : 'lanesInput.intentFailedKept', { problem: intent.problem })]),
    ...(lanes === null ? [] : lanes.said),
    ...handedUp.filter((sentence) => !forDevelopers(sentence)).map((sentence) => sentence.words),
    ...said,
  ]
  const toDevelopers = [...(lanes === null ? [] : lanes.toDevelopers), ...handedUp.filter(forDevelopers)]
  const keptForDevelopers = toDevelopers.filter((line) => line.key !== 'lanes.noRoute')
  const lanesShown =
    own === undefined
      ? null
      : {
          drawing:
            lanes === null ? null : (
              <>
                {isMaster ? <MasterLevel level={level} onLevel={setLevel} /> : null}
                {noBoxes
                  ? <p className="pp-no-boxes" data-to-developers={JSON.stringify(keptForDevelopers)}>{t('absence.none')}</p>
                  : noCard ? <NothingInTheDrawing toDevelopers={keptForDevelopers} /> : <LanesDrawing input={lanes.input} onSays={setLanesSay} toDevelopers={keptForDevelopers} />}
              </>
            ),
          records: lanes === null || noBoxes ? [] : lanes.input.records.map((record) => record.id),
          onIntent: setIntent,
          onSaysByWord: setRecordsSay,
        }

  return (
    <div className="pp">
      <style href="mole-office-pipelines" precedence="default">
        {PIPELINES_CSS}
      </style>

      <PageHead />

      {own === undefined ? null : <PipelineOwnWords record={own} part="summary" />}

      {rereading ? (
        <p className="pp-rereading" role="status">{t('g7b.PipelinePage.re_reading_the_records_after_a_write')}</p>
      ) : null}

      <StructureView
        records={loaded.records}
        links={loaded.links}
        {...(packages.status === 'ready' && packages.value !== null ? { packages: packages.value.tasks } : {})}
        {...(readAhead === null ? {} : { readAhead })}
        attention={loaded.attention}
        scope={scope}
        masterId={masterId}
        hrefFor={hrefFor}
        onChanged={reloadAndWait}
        now={now}
        // Given lanes, StructureView hands up only what restricts their records and who is working on them, and the
        // page takes that with its word keys through the lanes.
        {...(lanesShown === null ? { onSays: setSaid } : { lanes: lanesShown })}
      />

      {own === undefined ? null : <ReportsScope id={own.id} title={own.title} />}
      {own === undefined ? null : <RelatedToThePipeline id={own.id} title={own.title} kind="decisions" />}
      {own === undefined ? null : <RelatedToThePipeline id={own.id} title={own.title} kind="checklists" />}
      <PipelineDetail entries={entries} picked={picked} master={masterId} attention={attention} onScope={onScope} />

      {own === undefined ? null : <PipelineOwnWords record={own} part="context" followed={facts.length > 0} />}

      {/* Right after the pipeline's own body, and at the foot of `#/pipeline/drawing`. An address naming nothing filed
          has no drawing to say anything about, so it draws neither. */}
      {own === undefined && id !== undefined ? null : <PipelineSaid facts={facts} />}

    </div>
  )
}

const NOTHING_READ_YET: IntentAnswer = { at: 'reading', kept: null }

/**
 * THE DECISIONS AND THE CHECKLISTS ABOUT THIS PIPELINE AND ITS PARTS, under its reports.
 *
 * The related door (GET /api/records/:id/related) walks the pipeline's steps, the modules that implement them, their
 * sub-modules at every depth and their runs. ReportsScope above reads the reports by the same walk. Each list folds
 * where a module's lists fold, and draws a row as a module's page draws it.
 */
function RelatedToThePipeline({ id, title, kind }: { id: string; title: string; kind: 'decisions' | 'checklists' }) {
  const [state, reload] = useProjectAsync(
    () => api.related(id, kind === 'decisions' ? { kind, secondLevel: 'show' } : { kind }),
    [id, kind],
  )
  const heading = t(kind === 'decisions' ? 'w13s.related.decisionsFor' : 'w13s.related.checklistsFor', { title })
  const reading: RelatedReading | null =
    state.status === 'loading'
      ? null
      : state.status === 'error'
        ? { status: 'error', message: state.message, fault: state.fault }
        : { status: 'ready', value: state.value }
  return (
    <section className="related-scope" data-kind={kind}>
      <h2>{heading}</h2>
      {reading === null ? (
        <Loading label={heading} rows={1} />
      ) : (
        <RelatedList
          reading={reading}
          fold={OPEN_LOOPS_DRAWN}
          drawRow={(row) => (kind === 'decisions' ? <DecisionFacts row={row} /> : <ChecklistItemsHere row={row} />)}
          workspaceId={currentWorkspace()}
          retry={reload}
        />
      )}
    </section>
  )
}

/**
 * THE MASTER'S TWO LEVELS (wave 13u round 230): Boxes draws a row of the block pipelines' boxes for each master step,
 * and Steps draws the master's own steps. The pressed button is the level drawn.
 */
function MasterLevel({ level, onLevel }: { level: LanesTree['level']; onLevel: (level: LanesTree['level']) => void }) {
  return (
    <div className="pp-level" role="group" aria-label={t('lanesInput.level')} data-level-control="">
      {LEVELS.map((each) => (
        <button
          key={each}
          type="button"
          className="pp-tier-step"
          data-level={each}
          aria-pressed={each === level}
          onClick={() => onLevel(each)}
        >{t(each === 'boxes' ? 'lanesInput.level.boxes' : 'lanesInput.level.steps')}</button>
      ))}
    </div>
  )
}
const LEVELS: readonly LanesTree['level'][] = ['boxes', 'steps']

/**
 * A PIPELINE'S OWN WORDS ON ITS PAGE: the page has three
 * parts, the pipeline's short introduction at the top, the drawing in the middle and its body at the bottom, where
 * explanations are written. The introduction is the record's `summary`; the body is its `context` field
 * (src/shared/kinds.ts, kind `pipeline`). The fixed paragraphs about what a pipeline is in general do not come back.
 *
 * Each part says in one line when nobody has written it, and never puts other words in its place. The body does not
 * say so when sentences for every reader follow it (`followed`, 16 November 2026): those say what the page has to say.
 */
export function PipelineOwnWords({ record, part, followed = false }: { record: PanelRecord; part: 'summary' | 'context'; followed?: boolean }) {
  if (part === 'summary') {
    const words = record.summary?.trim() ?? ''
    return (
      <section className="pp-own" data-pipeline-part="summary">
        <h2 className="pp-own-title wrap-anywhere">{record.title}</h2>
        {words === '' ? (
          <p className="pp-own-none">{t('moduleView.context.notWritten')}</p>
        ) : (
          <p className="pp-own-words wrap-anywhere">{words}</p>
        )}
      </section>
    )
  }
  const stored = record.data['context']
  const context = typeof stored === 'string' ? stored.trim() : ''
  return (
    <section className="pp-own" data-pipeline-part="context">
      <h2 className="pp-own-heading">{t('pipelinePage.own.context')}</h2>
      {context === '' ? (
        followed ? null : <p className="pp-own-none">{t('moduleView.context.notWritten')}</p>
      ) : (
        // A blank line in the stored text starts a new paragraph; nothing else in it is read as markup.
        context.split(/\n\s*\n/).map((paragraph, at) => (
          <p key={at} className="pp-own-words wrap-anywhere">{paragraph.trim()}</p>
        ))
      )}
    </section>
  )
}

/**
 * WHAT THE PAGE'S BODY SAYS ABOUT THE DRAWING (wave 13u round 217): each thing the drawing could not show that a reader
 * needs to trust the page, one paragraph each and only when it is true. These used to stand under the drawing, as a
 * strip of small type and a list; the drawing now says nothing under itself, and this section says it in the body's
 * own type. With nothing to say, it is not drawn.
 *
 * "A step is not a module." stood first in it from 13 November 2026 and went on 16 November 2026: the section says only
 * what a reader needs to trust the page, and that sentence is not that.
 */
export function PipelineSaid({ facts }: { facts: readonly string[] }) {
  if (facts.length === 0) return null
  return (
    <div className="pp-said" data-pipeline-part="said">
      {/* Keyed by place: two links of one type between cards of the same titles give the same sentence, and each is said. */}
      {facts.map((fact, at) => (
        <p key={at} className="wrap-anywhere">{fact}</p>
      ))}
    </div>
  )
}

/**
 * THE SENTENCES HANDED UP TO THE PAGE THAT THE DEVELOPER VIEW ALONE SAYS (16 November 2026), by the word that writes
 * each: the lanes drawing's lines it could not draw, and, of what restricts the drawn records and who is working on
 * them, the checks that could not run, the work-domain read while it runs and the records with a work domain. Every
 * other sentence handed up is for every reader. The lanes input sorts its own sentences itself (lanes/from-records.ts).
 */
const SAID_TO_DEVELOPERS: ReadonlySet<WordKey> = new Set<WordKey>([
  'lanes.missingEnd',
  'lanes.noRoute',
  'g7b.Canvas.could_not_run',
  'g7b.Canvas.reading_who_is_working_on_these_records',
  'drawingWithNoMarks.workDomain',
])

const forDevelopers = (sentence: { key: WordKey | null; words: string }): sentence is { key: WordKey; words: string } =>
  sentence.key !== null && SAID_TO_DEVELOPERS.has(sentence.key)

/** The two words the lanes drawing writes its sentences with, about the lines it could not draw (lanes/engine.ts). */
const THE_DRAWINGS_OWN_WORDS = ['lanes.missingEnd', 'lanes.noRoute'] as const satisfies readonly WordKey[]

/**
 * THE LANES DRAWING'S SENTENCES, EACH NAMED BY THE WORD THAT WRITES IT. The drawing hands them up as plain sentences, so
 * each is matched here against the two words it writes them with, in the page's language, any text standing in for a
 * value. They come back in order with their words unchanged. A sentence neither word fits comes back with no key, and
 * the page then says it to every reader, since it cannot tell that the sentence is for developers only.
 */
export function theDrawingsSentencesByKey(sentences: readonly string[]): readonly { key: (typeof THE_DRAWINGS_OWN_WORDS)[number] | null; words: string }[] {
  const fits = THE_DRAWINGS_OWN_WORDS.map((key) => ({ key, fit: aWordWithAnyValues(t(key)) }))
  return sentences.map((words) => ({ key: fits.find((one) => one.fit.test(words))?.key ?? null, words }))
}

/** A word as written, its `{value}` marks standing for any text, as a pattern that must match a whole sentence. */
function aWordWithAnyValues(word: string): RegExp {
  const parts = word.split(/\{\w+\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^${parts.join('[\\s\\S]+?')}$`)
}

/**
 * THE TIERED READING OF THE DRAWN PIPELINE, WITH ITS CONTROL.
 *
 * KEYED BY RECORD ID BY THE CALLER, so picking another pipeline restarts the choice from that
 * record's own stored tier: a tier is remembered per record, the way the report page remembers a
 * report's reading level per record, and one component per record keeps the two from borrowing
 * each other's answer.
 */
export function PipelineTierView({ reading, attention, now }: { reading: PipelineReading; attention: ReadonlyMap<string, StepAttention>; now?: number }) {
  const [tier, setTierState] = useState<PipelineTier>(() => rememberedTier(reading.record.id, reading))
  const tiers = tiersOffered(reading)
  const counts = pipelineTierCount(reading)
  const at = tiers.indexOf(tier)
  const shorter = at > 0 ? (tiers[at - 1] as PipelineTier) : null
  const longer = at >= 0 && at < tiers.length - 1 ? (tiers[at + 1] as PipelineTier) : null
  /** A press MOVES THE TIER AND WRITES IT HERE, so the next visit opens where this one left. */
  const setTier = (next: PipelineTier): void => {
    writePipelineTierHere(reading.record.id, next)
    setTierState(next)
  }

  // THE ONE PLACE THE TIER IS MOVED FROM? NO: THE CONTROL IS DRAWN ONCE, ABOVE THE FOLD IT CHANGES,
  // and `PipelineTierBody` below only reads the tier. One place to press, one reading of one key.
  return (
    <>
      <PipelineTierControl tier={tier} tiers={tiers} counts={counts} onNext={setTier} />
      <PipelineTierBody reading={reading} attention={attention} tier={tier} now={now} />
    </>
  )
}

/** The tier control: less and more, the tier's name, and the real counts beside them. */
function PipelineTierControl({
  tier,
  tiers,
  counts,
  onNext,
}: {
  tier: PipelineTier
  tiers: readonly PipelineTier[]
  counts: { blockTitles: number; withLine: number }
  onNext: (tier: PipelineTier) => void
}) {
  const at = tiers.indexOf(tier)
  const shorter = at > 0 ? (tiers[at - 1] as PipelineTier) : null
  const longer = at < tiers.length - 1 ? (tiers[at + 1] as PipelineTier) : null
  return (
    <div className="pp-tiers" {...partOfMoleOffice({ surface: 'pipeline.tiers' })}>
      <button
        type="button"
        className="pp-tier-step"
        disabled={shorter === null}
        title={shorter === null ? t('g7b.PipelinePage.nothing_shorter_than_the_title_has_words') : undefined}
        onClick={() => {
          if (shorter !== null) onNext(shorter)
        }}
      >{t('g7b.PipelinePage.less')}</button>
      {/* THE ONE WORD THAT CHANGES. No sentence: the control says the tier's name and nothing more. */}
      <span className="pp-tier-word" aria-live="polite">
        {TIER_WORDS[tier] ?? tier}
      </span>
      <button
        type="button"
        className="pp-tier-step"
        disabled={longer === null}
        title={longer === null ? t('g7b.PipelinePage.nothing_longer_than_full_is_drawn_from') : undefined}
        onClick={() => {
          if (longer !== null) onNext(longer)
        }}
      >{t('g7b.PipelinePage.more')}</button>
      {/* THE REAL COUNTS, BESIDE LESS AND MORE, the way the copy page shows a scale beside its own
          Less and More (criterion B34). Counted here, from the same list the lists below walk. */}
      <span className="pp-tiers-scale num">
        <span>
          {counts.blockTitles === 1 ? t('g7b.PipelinePage.block_title') : t('g7b.PipelinePage.block_titles_97', { v1: String(counts.blockTitles) })}
        </span>
        <span>{counts.withLine === 1 ? t('g7b.PipelinePage.with_a_line') : t('g7b.PipelinePage.with_a_line_99', { v1: String(counts.withLine) })}</span>
      </span>
    </div>
  )
}

/** What one drawing tier says, and nothing more than that tier says. Exported for the tests of it. */
export function PipelineTierBody({
  reading,
  attention,
  tier,
  now,
}: {
  reading: PipelineReading
  attention: ReadonlyMap<string, StepAttention>
  tier: PipelineTier
  now?: number
}) {
  if (tier === 'full') return <PipelineFlow reading={reading} attention={attention} {...(now === undefined ? {} : { now })} />
  if (tier === 'title') return <p className="pp-tier-title">{reading.record.title}</p>
  return (
    <ol className="pp-tiers-list">
      {reading.steps.map((step) => {
        const line = tier === 'blockTitlesWithLine' ? oneLineOfBlock(step) : null
        return (
          <li key={step.id}>
            <span className="pp-tiers-name wrap-anywhere">{step.name}</span>
            {line === null ? null : <span className="pp-tiers-line wrap-anywhere">{line}</span>}
            {/* A PIPELINE HANGING FROM THIS STEP OPENS FROM IT at every tier that names the steps (BV-5). */}
            <HungPipelines step={step} />
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The index and the steps × modules grid, under the drawing.
 *
 * IT IS ITS OWN COMPONENT SO THE UNKNOWN-ID NOTICE CAN BE RENDERED IN A TEST. The page around it
 * cannot be: `useAsync` has nothing to hand it without a server, so the whole panel used to be
 * unreachable from the runner and the defect below went unseen.
 *
 * WHICH PIPELINE THE DETAIL IS ABOUT IS SAID BEFORE ANY FOLD, AND THAT IS THE DEFECT THIS FIXES.
 * `pp-missing` — the sentence promising that an address naming a pipeline nobody has filed was NOT
 * quietly answered with a different one — was rendered INSIDE the index `Explain`, which is a
 * collapsed `<details>`. So `#/pipeline/<unknown-id>` drew the first pipeline in the order with
 * nothing on screen saying the requested one does not exist: exactly the silent substitution
 * USER.md invariant 2 forbids, with the denial one press away. It now sits directly under the panel
 * heading. Nothing about the routing or the fallback changed — only where the page says what it did.
 *
 * `pp-why-drawn` HAS GONE, AND IT IS NOT THE SAME SENTENCE. It read "Drawn below: Transplant v2. It is
 * first in the order below, which is why it is the one drawn when you arrive." — a standing
 * paragraph whose subject was the interface's own default. WHICH pipeline is drawn is a fact and is
 * still said, in the visible summary of the grid's own fold, where the grid is; WHY that one was
 * picked when nobody picked anything is the interface explaining itself, and the ordering rule it
 * appeals to is the index fold's own visible line two rows above. The MISSING-ID case keeps its full
 * sentence, because there the choice is a substitution and a reader has to be told.
 */
export function PipelineDetail({
  entries,
  picked,
  master = null,
  attention,
  onScope,
}: {
  entries: readonly PipelineEntry[]
  /** The pipeline id in the address, or null when the address names none. */
  picked: string | null
  /** The pipeline the project marks as its master, or null when it marks none. Drawn when the address names none. */
  master?: string | null
  attention: ReadonlyMap<string, StepAttention>
  onScope: (scope: Scope) => void
}) {
  // The first entry is read out before it is used, rather than indexed at the point of use: it is
  // the one drawn when nothing has been picked, and "there are no pipelines" and "the first one is
  // missing" have to be the same branch or the page would draw a header with nothing under it.
  const first = entries[0]
  const requested = picked === null ? null : (entries.find((entry) => entry.reading.record.id === picked) ?? 'missing')
  // THE PAGE OPENS ON THE MASTER PIPELINE WHEN THE PROJECT MARKS ONE (package BV, point BV-5). A marked master is a
  // live pipeline of this project, so it is among the entries; the first in the order is drawn only when none is marked.
  const opening = master === null ? first : (entries.find((entry) => entry.reading.record.id === master) ?? first)
  const shown = requested === null ? opening : requested === 'missing' ? first : requested

  return (
    /* THE HEADING IS NOT "EVERY PIPELINE ON FILE, IN DETAIL" ANY MORE. The h1 forty pixels up says
       Pipelines, the index fold under this heading says "9 pipelines on file" on its own visible
       line, and the grid fold names the one it draws. Three labels for one thing, stacked. What is
       left is the only word the heading was adding: this is the detail, under the drawing. */
    <Panel titleIs="label" declares={{ surface: 'pipeline.detail' }} title={t('g7b.PipelinePage.in_detail')} rank={2}>
      {first === undefined ? (
        /* WHAT WAS HERE, AND WHY IT WENT. Fifty-five words in the largest box on the page, in an
           empty project, ending in an HTTP route: "File a record of kind `pipeline`, add its blocks
           with POST /api/records/<id>/blocks, say which modules carry each one with an `implements`
           link". A kind name, two link types and a route in one sentence, set in a monospace face —
           so the page could see they were not English and printed them anyway. There is no control
           in this panel, so the paragraph was the whole feature.

           Absence has almost no weight unless it needs action, and nobody has to do anything about
           a project with no pipelines in it. A person who does not know what a pipeline is will not
           be taught by a POST route. (The fold at the top of the page that answered that question
           has gone; a pipeline's own body text explains it now.) */
        <Absence />
      ) : (
        <>
          {/* THE ONE CASE THAT IS STILL A PARAGRAPH, AND WHY IT IS. An address naming a pipeline
              nobody has filed gets a different one drawn. That is a substitution, and the principle
              at the top of USER.md is "Never silently substitute semantics": a substitution is said
              out loud, in front of every fold, with the id that was asked for so the reader can see
              the typo. Nothing about the fallback changed. */}
          {requested === 'missing' ? (
            <p className="pp-missing">
              {/* THE SUBSTITUTION IS STILL SAID OUT LOUD — that is invariant 2 and it is not
                  negotiable, because a different pipeline really is being drawn. What went is the
                  raw id as the subject of the sentence and the phrase "Nothing was substituted for
                  it" immediately before a sentence saying what was drawn instead, which read as a
                  contradiction. The id is in the address bar, where the reader typed it. */}
              <b>{t('g7b.PipelinePage.there_is_no_pipeline_at_that_address')}</b></p>
          ) : null}

          <Explain declares={{ surface: 'pipeline.index' }}
            meaning={<span>{t('g7b.PipelinePage.pipelines_140')}</span>}
            opens={t('g7b.PipelinePage.the_index_with_where_each_pipeline_is')}
            holds={{ count: entries.length, what: t(entries.length === 1 ? 'g7b.PipelinePage.pipeline_on_file' : 'g7b.PipelinePage.pipelines_on_file') }}
          >
            {entries.map((entry) => (
              <IndexRow
                key={entry.reading.record.id}
                entry={entry}
                current={entry.reading.record.id === shown?.reading.record.id}
                onPick={() => onScope({ at: 'pipeline', recordId: entry.reading.record.id })}
              />
            ))}

            {/* Nothing on this page is folded away, and the line says so rather than leaving a
                reader to wonder. HiddenCount refuses to draw a shortened list that cannot name
                what it is hiding; here it is drawing the other case. */}
            <HiddenCount
              shown={entries.length}
              total={entries.length}
              href="#/records"
              what={t('g7b.PipelinePage.pipelines')}
              linkText={t('g7b.PipelinePage.open_every_record_of_every_kind')}
            />
          </Explain>

          {/* A PIPELINE THAT CANNOT BE DRAWN SAYS SO WITHOUT BEING PRESSED, AND IT DID NOT.
              `readPipeline` returns a `problem` sentence for a record with no `blockIds`, an empty
              block list, or no readable block at all. The only place that sentence was printed is
              `PipelineFlow`'s own `pf-nothing`, which is INSIDE the fold below — so `#/pipeline/<id
              of an unreadable pipeline>` drew a collapsed disclosure, promised a steps × modules
              grid on its summary, and put the reason there is no grid one press away. That is the
              same shape as the unknown-id defect above: the page's failure, folded.

              The sentence is one line and it is the whole answer, so it stands here. The fold still
              holds `PipelineFlow`, which prints what could be read of the record — the per-step
              problems, the dependencies pointing at nothing — and those are a list rather than the
              headline. */}
          {shown === undefined || shown.reading.problem === null ? null : (
            <p className="pp-unreadable">
              <b>{shown.reading.record.title}{t('g7b.PipelinePage.cannot_be_drawn')}</b> {shown.reading.problem}
            </p>
          )}

          {/* WHICH PIPELINE THE GRID DRAWS IS SAID HERE, ON A `<summary>`, WHICH IS VISIBLE.
              This is where `pp-why-drawn` went. A summary is not behind the fold — it IS the fold —
              so the name of the drawn pipeline and how far it has got are in the default view,
              beside the grid they are about, without a paragraph explaining the arrangement. What
              the grid's axes are is the fold's own `opens`, one press away and one line down. */}
          {shown === undefined ? null : (
            <Explain declares={{ surface: 'pipeline.drawn' }}
              meaning={
                <span>
                  <b>{shown.reading.record.title}</b>
                  {shown.reading.problem !== null ? null : (
                    <>
                      {' · '}
                      <b className="num">{shown.done}</b>/<b className="num">{shown.total}</b>{t('g7b.PipelinePage.steps_done')}</>
                  )}
                </span>
              }
              opens={
                shown.reading.problem === null
                  ? t('g7b.PipelinePage.the_steps_modules_grid_for_this_pipeline')
                  : t('g7b.PipelinePage.what_could_be_read_of_this_record')
              }
              holds={{ count: shown.total, what: t('g7b.PipelinePage.steps') }}
            >
              {/* THE TIERS. The control stands where the drawing's other
                  controls stand — at the fold whose body the tier changes — and the body is the
                  tiered reading or the full drawing. A pipeline that cannot be read says so above
                  instead, and the fold keeps its own whole-drawing behaviour there.
                  KEYED BY RECORD ID so picking another pipeline re-opens at that record's tier. */}
              {shown.reading.problem === null ? (
                <PipelineTierView key={shown.reading.record.id} reading={shown.reading} attention={attention} />
              ) : (
                <PipelineFlow reading={shown.reading} attention={attention} />
              )}
            </Explain>
          )}
        </>
      )}
    </Panel>
  )
}

/**
 * The page's opener: the heading alone.
 *
 * THE FOLD OF FIXED PARAGRAPHS HAS GONE. It held three
 * paragraphs about what a pipeline is in general and why the drawing opened on the modules. A pipeline page now opens
 * on the pipeline's own introduction and closes on its own body (`PipelineOwnWords`), and the fixed paragraphs do not
 * come back. THE COUNTS LINE WENT THE SAME DAY (wave 13u round 217): the "In detail" index counts the pipelines on file,
 * and the line's one sentence, "A step is not a module.", moved to the body section `PipelineSaid`, which said it until
 * 16 November 2026.
 */
export function PageHead() {
  return (
    <header className="pp-head" {...partOfMoleOffice({ surface: 'pipeline.opener' })}>
      <h1 data-title-is="label">{t('g7b.PipelinePage.pipelines_140')}</h1>
    </header>
  )
}

/** One line of the index. The whole row picks the pipeline; the title link opens its record. */
export function IndexRow({ entry, current, onPick }: { entry: PipelineEntry; current: boolean; onPick: () => void }) {
  const { reading } = entry
  const at = entry.standingOn
  const meta =
    reading.problem !== null
      ? reading.problem
      : entry.total === 0 ? <Absence title={t('g7b.PipelinePage.it_has_no_step')} /> : at === null
        ? t('g7b.PipelinePage.all_done', { v1: plural(entry.total, t('g7b.PipelinePage.step_is'), t('g7b.PipelinePage.steps_are')) })
        : t('g7b.PipelinePage.standing_on_of', { v1: stepNumber(at.index), v2: entry.total, v3: at.step.name, v4: stateWord(at.step.state).text })

  return (
    <div className="pp-entry" data-current={current ? '1' : undefined}>
      <Row
        state={chipFor(entry)}
        alarm={entry.alarm}
        title={reading.record.title}
        target={{ kind: 'record', recordId: reading.record.id, workspaceId: reading.record.workspaceId }}
        // The reason goes INSIDE the row's own meta cell rather than in a paragraph underneath with
        // a hand-copied indent. Row reserves a fixed column for the state chip and that width is
        // ui.tsx's to choose; a number copied here to line up with it would be two places that must
        // agree, which is this codebase's most expensive recurring defect.
        meta={<span className="pp-standing">{meta}</span>}
        right={
          reading.problem !== null ? (
            <span className="pp-count">{t('g7b.PipelinePage.unreadable')}</span>
          ) : (
            <span className="pp-count num">
              {entry.done}/{entry.total}
            </span>
          )
        }
        onClick={onPick}
        current={current}
      />
      <p className="pp-links">
        {current ? (
          <span className="pp-here">{t('g7b.PipelinePage.drawn_below')}</span>
        ) : (
          <button type="button" className="pp-pick" onClick={onPick}>{t('g7b.PipelinePage.draw_this_one')}</button>
        )}
        <RouteLink to={recordPath(reading.record.id)} className="pp-record">{t('g7b.PipelinePage.open_the_record')}</RouteLink>
      </p>
    </div>
  )
}

// ============================================================================ styles

/**
 * This page's own rules.
 *
 * styles.css belongs to another agent this phase, so the page's layout lives with the page. React 19
 * hoists `<style href>` into <head> and de-duplicates by href. Every value below is a token from
 * tokens.css, so a preset swap on <html> re-skins all of it.
 */
const PIPELINES_CSS = `
.pp { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }

.pp-head { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }

/* The pipeline's own words, above and below the drawing. */
.pp-own { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.pp-own-title, .pp-own-heading { font-size: var(--fs-3); font-weight: 600; line-height: var(--lh-tight); color: var(--text); }
.pp-own-words, .pp-own-none {
  font-size: var(--fs-2);
  line-height: var(--lh-read);
  color: var(--text-2);
  max-width: var(--measure-in-box);
}
/* What the body says about the drawing: the body's own type, and not its class. That class marks the pipeline's own
   words, and these are the office's. Some of the words are composed from clauses that start in lower case. */
.pp-said { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.pp-said p {
  font-size: var(--fs-2);
  line-height: var(--lh-read);
  color: var(--text-2);
  max-width: var(--measure-in-box);
}
.pp-said p::first-letter { text-transform: uppercase; }
.pp-rereading {
  padding: var(--pad) var(--pad-lg);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  background: var(--st-inferred-row);
  border: var(--border-w) solid var(--st-inferred-line);
  border-radius: var(--radius-sm);
}
.pp-missing, .pp-unreadable {
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  max-width: var(--measure-in-box);
  margin-bottom: var(--pad);
}
/* Two notices about the same kind of trouble, drawn the same way: an address naming a pipeline
   nobody filed, and a pipeline whose record cannot be read into steps. Both are what Mole Office could
   not do, said where it would otherwise have been silent. */
.pp-missing, .pp-unreadable {
  padding: var(--pad) var(--pad-lg);
  background: var(--st-inferred-row);
  border: var(--border-w) solid var(--st-inferred-line);
  border-radius: var(--radius-sm);
  color: var(--text);
}
.pp-missing code { font-family: var(--font-mono); font-size: 0.94em; }

.pp-entry {
  padding-bottom: var(--pad);
  border-bottom: var(--border-w) solid var(--border);
  min-width: 0;
}
.pp-entry:last-of-type { border-bottom: 0; }
.pp-entry[data-current='1'] { background: var(--sel); border-radius: var(--radius-sm); }

.pp-standing { display: block; color: var(--text-2); font-weight: 600; }

/* Sits under the row rather than inside it, because a link and a button inside a row that is
   itself clickable is two answers to one press. It lines up with the row's own left padding, which
   is a token, so a density preset moves both together. */
.pp-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pad) var(--pad-lg);
  padding-left: var(--pad);
  margin-top: 4px;
}
.pp-pick {
  font: inherit;
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text);
  background: var(--panel-2);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  padding: 2px var(--pad-lg);
  cursor: pointer;
}
.pp-pick:hover { background: var(--hover); }
.pp-here {
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-3);
}
.pp-record {
  font-size: var(--fs-1);
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: .16em;
}
.pp-count { font-size: var(--fs-1); font-weight: 600; color: var(--text-3); white-space: nowrap; }

/* The tier control and the tiered readings. Same tokens as the rest of
   this page's own rules above. */
.pp-tiers {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--pad) var(--pad-lg);
  margin-bottom: var(--pad);
}
.pp-tier-step {
  font: inherit;
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text);
  background: var(--panel-2);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  padding: 2px var(--pad-lg);
  cursor: pointer;
}
.pp-tier-step:disabled { color: var(--text-3); cursor: default; border-color: var(--border); }
.pp-tier-step:not(:disabled):hover { background: var(--hover); }
/* The master's level control uses the tier control's buttons; the pressed one is the level drawn. */
.pp-level { display: flex; flex-wrap: wrap; gap: var(--pad); margin-bottom: var(--pad); }
.pp-level .pp-tier-step[aria-pressed='true'] { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
.pp-no-boxes { color: var(--text-2); }
.pp-tier-word {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-2);
  white-space: nowrap;
}
/* The counts sit at the control's scale like the copy page's own scale does beside Less and More. */
.pp-tiers-scale {
  display: flex;
  gap: var(--pad);
  font-size: var(--fs-1);
  color: var(--text-3);
}
.pp-tier-title { font-size: var(--fs-2); font-weight: 600; color: var(--text); }
.pp-tiers-list { display: flex; flex-direction: column; gap: var(--pad); margin-left: var(--pad); }
.pp-tiers-name { display: block; color: var(--text); font-weight: 600; }
.pp-tiers-line { display: block; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); max-width: var(--measure-in-box); }



`
