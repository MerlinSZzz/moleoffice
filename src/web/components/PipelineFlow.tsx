// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useInspect } from '../lib/mode.ts'
import { useLanguage } from '../lib/language.ts'
import { clausesJoined, endOfSentence, listJoined, sentencesJoined, t } from '@shared/i18n.ts'
import { gapBetween } from '@shared/spacing.ts'
/**
 * A pipeline drawn as a flow: what each step waits on, and which modules carry it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG WITH THE OLD DRAWING
 * ---------------------------------------------------------------------------------------
 *
 * A pipeline was a row of small state chips in a line. That drawing says three things and two of
 * them are false: it says the steps are written in that order (true — it is the stored order), it
 * says each step waits on the one before it (not stored, and not true), and it says nothing at all
 * about the modules that carry the work. There has never been a pipeline page.
 *
 * ---------------------------------------------------------------------------------------
 * THE SHAPE, AND WHERE IT CAME FROM
 * ---------------------------------------------------------------------------------------
 *
 * Taken from design/pipeline/flow-dag, photographed in design/shots/pipeline-flow-dag-1440-light.png:
 * STEPS ARE ROWS, MODULES ARE COLUMNS, and a mark where a row meets a column means "this module
 * carries this step". Nothing else is ever a row and nothing else is ever a column.
 *
 * That was chosen for one reason and it is still the reason: A MATRIX IS THE ONLY DRAWING THAT
 * CANNOT QUIETLY TURN INTO ONE MODULE PER STEP. A row with two marks, a column with three marks and
 * a row with no marks are three different pictures, and all three are on the screen at once. The
 * product owner raised this themselves and asked that no one-to-one assumption creep back in.
 *
 * WHAT IS TAKEN FROM THAT DESIGN, UNCHANGED:
 *   - steps as rows, modules as vertical lanes, a dot at each crossing;
 *   - the mapping said FOUR ways over — the grid, the count in the lane footer, the "carried by"
 *     line under each step name, and one counted sentence at the top — because one channel is one
 *     channel somebody skims past;
 *   - a step no module carries drawn as an ANSWER: a band with words in it, not a blank row, not an
 *     alarm colour and not the incompleteness marker, which would be a different and false claim;
 *   - the lane footer worded so it cannot be read as a module's own condition.
 *
 * WHAT IS CHANGED, AND WHY:
 *
 *   1. THERE IS A DEPENDENCY GUTTER NOW. That design says in its own words "I did not draw a
 *      dependency graph, because Mole Office does not store dependencies", and asks for the field. The
 *      field landed: a step carries `needs: {stepId, gate, upTo?}[]`. So the left of every row is a
 *      real graph — a line from each step down to every step that waits on it — and the rail that
 *      could only ever mean "written in this order" is gone. Order is still order and is still the
 *      row order; the lines are the separate fact.
 *
 *   2. A PARTIAL GATE IS DRAWN AS A WALL WITH AN OPEN STRETCH IN FRONT OF IT, not as a sentence in
 *      a list. See `Wall` below. That is the case the whole `gate` word exists for, and it had to be
 *      visible without reading.
 *
 *   3. THE MATRIX SURVIVES AT 390px AS A MATRIX. That design folds the lanes away on a phone and
 *      replaces them with two lists. The facts survive that way; the SHAPE does not, and the shape
 *      is the whole argument for drawing a matrix. Here the lane strip moves UNDER the step's name
 *      instead of beside it, on the same fixed column template as the header and every other row, so
 *      the columns still line up down the page: the diagonal, the busy column and the empty row are
 *      all still readable on a phone.
 *
 *   4. A PIPELINE WITH NO STORED STEP LINK DRAWS ITS OWN ORDER. A pipeline stores its steps in an
 *      order and may store no link between any two of them. The rows are already that order; this
 *      adds a lighter line from each step to the next, one legend line saying it is the stored order
 *      and not a link, and a hover word on every such line. The line is lighter and thinner because
 *      nobody wrote it: it is the page reading the order, and nothing is written to the office.
 *      WHEN ANY `blocks` OR `feeds` LINK IS STORED BETWEEN TWO OF THE PIPELINE'S OWN STEPS, the
 *      stored links are drawn as they always were and no order line is invented.
 *
 *   5. A `feeds` LINK BETWEEN TWO STEPS SAYS WHAT MOVES, on a small pill on its line. The words are
 *      the out port's name, then "→ in port" when the two names differ. They are the agents' own
 *      words and are never translated. A `blocks` link keeps its gate and its line unchanged.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE REFUSES TO GUESS
 * ---------------------------------------------------------------------------------------
 *
 * `needs` ABSENT IS NOT "IT WAITS ON NOTHING". src/shared/types.ts says so in the field's own
 * comment and asks a reader to say which of the two it is showing. So a step with no `needs` key
 * prints "nothing is recorded about what this waits on", and a step with `needs: []` prints
 * "recorded as waiting on nothing". Two sentences, because they are two facts.
 *
 * `modules: []` IS AN ANSWER AND A MISSING `modules` KEY IS A GAP. `modules` is a required field, so
 * its absence means somebody left the record unfinished; an empty list means somebody said nobody
 * owns this step yet. Those get different words as well.
 *
 * WHETHER A GATE STILL STANDS is read from the stored state of the step it names, and every place
 * that says so also says where it read it. Nothing here reads a title, invents a date, or turns row
 * order into a dependency.
 */

import type { AttentionRow } from '@shared/attention.ts'
import {
  readPipelineBlocks,
  type BlockLinkRow,
  type BlockNeed,
  type BlockProblem,
  type CarriedData,
  type PipelineBlockView,
} from '@shared/blocks.ts'
import { ITEM_STATES, type ItemState, type PanelRecord } from '@shared/types.ts'
import {
  readConsequence,
  readPause,
  type Consequence,
  type Gate,
  type GateKind,
  type Pause,
} from '@shared/work.ts'
import { pipelinePath, recordPath, RouteLink } from './router.tsx'
import {
  Absence,
  ConsequenceMark,
  GateMark,
  PauseMark,
  gateWordsForReader,
  ReasonLine,
  StateChip,
  alarmFor,
  daysSince,
  panelStateWord,
  shownState,
  type AlarmLevel,
} from './ui.tsx'
import { stageInAPipeline } from '../lib/gate-stage.ts'

// ============================================================================ small helpers

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** The five item states as plain strings, for checking a value that came out of a JSON column. */
const ITEM_STATE_NAMES: readonly string[] = ITEM_STATES

/**
 * "1 step" / "3 steps", written once.
 *
 * This project already tracks a class of defect that is nothing but plurals — a reply that said
 * "1 change rows" was fixed in the pass before this one — and this page prints eleven counted
 * sentences. One helper is cheaper than eleven chances to get it wrong.
 */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "04" — a step's position, so a sentence can point at a row without repeating its name. */
export function stepNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}

// ============================================================================ reading a record

/**
 * One block of a pipeline, as this page draws it.
 *
 * IT IS THE SHARED READING, NOT A SECOND ONE. `FlowStep` used to be its own interface, one of five
 * different readings of one stored step; three of them disagreed about what a step with no id is
 * (invent one way, invent another way, drop it). A block is a record with a primary key, so there is
 * nothing left to invent and one reading serves every page.
 *
 * WHAT CHANGED IN WHAT IT CAN SAY. `modules` and `needs` used to be nullable, so this page could
 * keep "nobody wrote it down" apart from "recorded as empty". Both are links now, and a link is a
 * row: it exists or it does not. The honest half survives — zero links means NO MODULE IS RECORDED
 * as carrying this block, and NO DEPENDENCY IS RECORDED — and this page still says that rather than
 * printing "it waits on nothing", which is a claim the data no longer makes.
 */
export type FlowStep = PipelineBlockView

/** A block id in the pipeline's stored order that could not be read, and where it sat. */
export type StepProblem = BlockProblem

export interface PipelineReading {
  record: PanelRecord
  steps: FlowStep[]
  /** Why the whole pipeline cannot be drawn, in the words the page prints. Null when it can. */
  problem: string | null
  /** Blocks that could not be read. Reported beside the drawing, never dropped from the count. */
  stepProblems: StepProblem[]
  /** How many ids the stored order held, including the ones that could not be read. */
  storedSteps: number
  consequence: Consequence | null
  pause: Pause | null
}

/**
 * Read one pipeline record, with the records and links the page has already loaded.
 *
 * IT NEEDS THE OTHER RECORDS NOW, and that is the whole shape of the change: a pipeline stores an
 * ordered list of block ids, and the blocks are records beside it. It used to need nothing but the
 * pipeline, because every step was nested inside it — which is exactly why nothing could link to
 * one.
 *
 * One unreadable block out of nine costs you that block and a sentence naming it, not the drawing.
 */
export function readPipeline(
  record: PanelRecord,
  records: readonly PanelRecord[],
  links: readonly BlockLinkRow[],
): PipelineReading {
  const data = isObj(record.data) ? record.data : {}
  const consequence = readConsequence(data)
  const pause = readPause(data)
  const reading = readPipelineBlocks(record, records, links)

  if (reading.undeclared) {
    return {
      record,
      steps: [],
      problem:
        t('g7b.pipelineUnfinished'),
      stepProblems: [],
      storedSteps: 0,
      consequence,
      pause,
    }
  }

  const problem =
    reading.blocks.length > 0
      ? null
      : reading.storedIds === 0
        ? null
        : t('g7b.PipelineFlow.none_of_the_blocks_this_pipeline_lists')

  return {
    record,
    steps: reading.blocks,
    problem,
    stepProblems: reading.problems,
    storedSteps: reading.storedIds,
    consequence,
    pause,
  }
}

// ============================================================================ the module matrix

/** One module column: its title, and which steps (by row index) it carries. */
export interface ModuleLane {
  title: string
  /** Row indexes, in order. Its length is the number in the lane footer. */
  steps: number[]
}

export interface MappingFacts {
  lanes: ModuleLane[]
  /** Every (step, module) pair. The number one module per step could not produce. */
  pairings: number
  /** Steps carried by two or more modules. */
  stepsWithMany: number
  /**
   * Blocks no module is recorded as carrying.
   *
   * ONE COUNT WHERE THERE USED TO BE TWO. A step could store `modules: []` ("nobody owns this yet")
   * or leave the key out ("nobody has said"), and this counted them separately. The mapping is
   * `implements` links now and a link exists or it does not, so there is one fact to count and the
   * sentence below says the one thing that is still true about it.
   */
  stepsWithNone: number
  busiest: ModuleLane | null
  /** The same facts as one sentence, for reading aloud or pasting into a report. */
  sentence: string
}

/**
 * The many-to-many mapping, counted.
 *
 * LANE ORDER IS FIRST APPEARANCE DOWN THE STEPS. That is a choice the data does not make: nothing
 * stores an order for the modules inside a pipeline. First appearance tends to put the marks near a
 * diagonal, which reads as flow, and it is stable while steps are appended. It shuffles if a step is
 * inserted at the top, which is the cost, and it is written down here so the next reader knows it is
 * a decision and not an accident.
 */
export function mappingFacts(steps: readonly FlowStep[]): MappingFacts {
  const byTitle = new Map<string, ModuleLane>()
  let pairings = 0
  let stepsWithMany = 0
  let stepsWithNone = 0

  steps.forEach((step, index) => {
    if (step.modules.length === 0) {
      stepsWithNone++
      return
    }
    if (step.modules.length > 1) stepsWithMany++
    for (const title of step.modules) {
      const existing = byTitle.get(title)
      const lane = existing ?? { title, steps: [] }
      // A module named twice on one step is ONE pairing. Two identical marks in one cell would be a
      // picture of a fact that is not there.
      if (!lane.steps.includes(index)) {
        lane.steps.push(index)
        pairings++
      }
      if (existing === undefined) byTitle.set(title, lane)
    }
  })

  const lanes = [...byTitle.values()]
  const busiest = lanes.reduce<ModuleLane | null>(
    (best, lane) => (best === null || lane.steps.length > best.steps.length ? lane : best),
    null,
  )

  const head = t('g7b.PipelineFlow.between_and', { v1: plural(pairings, t('g7b.PipelineFlow.pairing'), t('g7b.PipelineFlow.pairings')), v2: plural(steps.length, t('g7b.PipelineFlow.step'), t('g7b.PipelineFlow.steps')), v3: plural(lanes.length, t('g7b.PipelineFlow.module'), t('g7b.PipelineFlow.modules')) })
  const rest: string[] = []
  if (stepsWithMany > 0) {
    rest.push(t('g7b.PipelineFlow.carried_by_more_than_one_module', { v1: plural(stepsWithMany, t('g7b.PipelineFlow.step_is'), t('g7b.PipelineFlow.steps_are')) }))
  }
  if (busiest !== null && busiest.steps.length > 1) {
    rest.push(t('g7b.PipelineFlow.the_busiest_module_carries', { v1: busiest.title, v2: plural(busiest.steps.length, t('g7b.PipelineFlow.step'), t('g7b.PipelineFlow.steps')) }))
  }
  if (stepsWithNone > 0) {
    rest.push(
      t('pipelineFlow.fact.noModule', { v1: plural(stepsWithNone, t('g7b.PipelineFlow.step_has'), t('g7b.PipelineFlow.steps_have')), v2: stepsWithNone === 1 ? t('g7b.PipelineFlow.it') : t('g7b.PipelineFlow.them') }),
    )
  }

  return {
    lanes,
    pairings,
    stepsWithMany,
    stepsWithNone,
    busiest,
    // EACH SENTENCE ENDS IN THE PAGE'S LANGUAGE, and its clauses are joined in it (wave 13q's round 29).
    sentence: sentencesJoined(rest.length === 0 ? [head + endOfSentence()] : [head + endOfSentence(), clausesJoined(rest) + endOfSentence()]),
  }
}

// ============================================================================ what holds a step

/** One recorded dependency, resolved against the blocks it names. */
export interface NeedView {
  need: BlockNeed
  /** The row index of the step waited on, or null when no step in this pipeline has that id. */
  index: number | null
  /** The step waited on. Null when the id names nothing here. */
  step: FlowStep | null
  /** True when the step waited on is stored as `done`, so this gate no longer stands. */
  cleared: boolean
}

/**
 * What stands between a step and being started, right now.
 *
 * FIVE ANSWERS AND NOT ONE. "No dependency is recorded" is a fact about the record; "every gate has
 * cleared" is a fact about today; and a block whose dependencies all point at ids nothing here holds
 * is a third thing again. A drawing that gave them all the same blank row would be answering a
 * question nobody asked it.
 *
 * IT USED TO BE SIX. `unrecorded` and `waits-on-nothing` were separate, because `needs` could be
 * absent or `[]`. A dependency is a stored link now, and a link exists or it does not, so those two
 * are one answer — and the one that survives is the weaker, honest one: nothing is recorded.
 */
export type Hold =
  | { kind: 'none-recorded' }
  | { kind: 'clear'; cleared: NeedView[]; broken: NeedView[] }
  | { kind: 'hard'; standing: NeedView[]; cleared: NeedView[]; broken: NeedView[] }
  | { kind: 'partial'; standing: NeedView[]; cleared: NeedView[]; broken: NeedView[] }

/**
 * Which of them a step is in.
 *
 * A HARD GATE BEATS A PARTIAL ONE. If anything stops the step completely then the open stretch a
 * partial gate would have allowed does not exist, and drawing that open stretch anyway would say you
 * may start work that you may not.
 */
export function holdOn(
  step: FlowStep,
  byId: ReadonlyMap<string, { index: number; step: FlowStep }>,
): Hold {
  if (step.needs.length === 0) return { kind: 'none-recorded' }
  const cleared: NeedView[] = []
  const broken: NeedView[] = []
  const standingHard: NeedView[] = []
  const standingPartial: NeedView[] = []
  for (const need of step.needs) {
    const found = byId.get(need.blockId)
    if (found === undefined || found.step === step) {
      broken.push({ need, index: null, step: null, cleared: false })
      continue
    }
    const view: NeedView = { need, index: found.index, step: found.step, cleared: found.step.state === 'done' }
    if (view.cleared) cleared.push(view)
    else if (need.gate === 'hard') standingHard.push(view)
    else standingPartial.push(view)
  }
  if (standingHard.length > 0) return { kind: 'hard', standing: standingHard, cleared, broken }
  if (standingPartial.length > 0) return { kind: 'partial', standing: standingPartial, cleared, broken }
  return { kind: 'clear', cleared, broken }
}

export interface DependencyFacts {
  /** Recorded (waiting step, needed step) pairs that name a step this pipeline actually holds. */
  edges: number
  hard: number
  partial: number
  /** Dependencies naming an id no step here holds. Refused on write; drawn if already stored. */
  broken: number
  heldCompletely: number
  heldPartly: number
  allClear: number
  /** Blocks with no `blocks` link into them at all: no dependency is recorded either way. */
  noneRecorded: number
  sentence: string
}

export function dependencyFacts(steps: readonly FlowStep[], holds: readonly Hold[]): DependencyFacts {
  const ids = new Set(steps.map((s) => s.id))
  let edges = 0
  let hard = 0
  let partial = 0
  let broken = 0
  for (const step of steps) {
    for (const need of step.needs) {
      if (!ids.has(need.blockId) || need.blockId === step.id) {
        broken++
        continue
      }
      edges++
      if (need.gate === 'hard') hard++
      else partial++
    }
  }

  let heldCompletely = 0
  let heldPartly = 0
  let allClear = 0
  let noneRecorded = 0
  for (const hold of holds) {
    if (hold.kind === 'none-recorded') noneRecorded++
    else if (hold.kind === 'hard') heldCompletely++
    else if (hold.kind === 'partial') heldPartly++
    else allClear++
  }

  const head =
    edges === 0
      ? t('g7b.PipelineFlow.nothing_is_recorded_about_what_waits_on', { v1: plural(steps.length, t('g7b.PipelineFlow.step'), t('g7b.PipelineFlow.steps')) })
      : t('g7b.PipelineFlow.between_these_hard_and_partial', { v1: plural(edges, t('g7b.PipelineFlow.dependency'), t('g7b.PipelineFlow.dependencies')), v2: plural(steps.length, t('g7b.PipelineFlow.step'), t('g7b.PipelineFlow.steps')), v3: hard, v4: partial })

  const now: string[] = []
  if (heldCompletely > 0) now.push(t('g7b.PipelineFlow.cannot_start_at_all', { v1: plural(heldCompletely, t('g7b.PipelineFlow.step'), t('g7b.PipelineFlow.steps')) }))
  if (heldPartly > 0) now.push(t('g7b.PipelineFlow.may_go_only_as_far_as_a', { v1: plural(heldPartly, t('g7b.PipelineFlow.step'), t('g7b.PipelineFlow.steps')) }))
  if (now.length === 0 && edges > 0) now.push(t('g7b.PipelineFlow.nothing_is_held_every_recorded_gate_has'))

  const gaps: string[] = []
  if (noneRecorded > 0) {
    gaps.push(
      t('pipelineFlow.fact.noDependency', { v1: plural(noneRecorded, t('g7b.PipelineFlow.block_has'), t('g7b.PipelineFlow.blocks_have')) }),
    )
  }
  if (broken > 0) {
    gaps.push(t('g7b.PipelineFlow.a_block_nothing_here_holds', { v1: plural(broken, t('g7b.PipelineFlow.dependency_names'), t('g7b.PipelineFlow.dependencies_name')) }))
  }

  const parts = [head + endOfSentence()]
  if (now.length > 0) parts.push(t('g7b.PipelineFlow.right_now', { v1: now.join(t('g7b.PipelineFlow.and')) }))
  if (gaps.length > 0) parts.push(clausesJoined(gaps) + endOfSentence())

  return {
    edges,
    hard,
    partial,
    broken,
    heldCompletely,
    heldPartly,
    allClear,
    noneRecorded,
    sentence: sentencesJoined(parts),
  }
}

// ============================================================================ the gutter graph

/**
 * One dependency, placed in a lane of the left gutter.
 *
 * `top` and `bottom` are row indexes rather than `from` and `to`, because a lane is occupied over a
 * STRETCH of rows and which end of that stretch is the waiting step is a separate question. Almost
 * always the waiting step is the lower one, because that is the order people write pipelines in. It
 * is not guaranteed — `needs` may name any step in the pipeline — and a backward dependency is drawn
 * rather than dropped, with the gate mark at the end that actually waits.
 */
export interface FlowEdge {
  /** Row index of the step that has to move. */
  from: number
  /** Row index of the step that is waiting. */
  to: number
  top: number
  bottom: number
  /** How hard the wait is. NULL means the link says only that one blocks the other. */
  gate: GateKind | null
  upTo: string | null
  /** True when the step at `from` is stored as `done`, so this dependency holds nothing now. */
  cleared: boolean
  /** True when the waiting step is written ABOVE the step it waits on. */
  backward: boolean
  lane: number
  /**
   * What this line is. A `wait` is a stored `blocks` link, a `move` is a stored `feeds` link, and an
   * `order` is the page's own arrow from one step to the next when no such link is stored. The three
   * are drawn differently on purpose: an order arrow is not a link and nothing was written for it.
   */
  kind: 'wait' | 'move' | 'order'
  /** The words on a move line: the port names the agents wrote. Null on a wait or an order. */
  label: string | null
  /** The stored link this line was read from, or null on an order line. */
  linkId: string | null
}

/** What to draw in one row's gutter, for one lane. Derived from the edges, never measured. */
export interface FlowSegment {
  lane: number
  /**
   * `through` — the line passes this row untouched.
   * `enter`   — this row is the LOWER end of the line.
   * `leave`   — this row is the UPPER end of the line.
   */
  kind: 'through' | 'enter' | 'leave'
  /** True when the line has to bend across to this row's node. */
  elbow: boolean
  /** Set only on the row that WAITS, which is the end a gate belongs to. */
  gate: GateKind | null
  cleared: boolean
  /** Index into `FlowLayout.edges`. */
  edge: number
}

export interface FlowRow {
  index: number
  nodeLane: number
  segments: FlowSegment[]
}

export interface FlowLayout {
  rows: FlowRow[]
  edges: FlowEdge[]
  /** How many lanes wide the gutter has to be. At least one, for the column of nodes. */
  lanes: number
  /** Dependencies naming a step id this pipeline does not hold, with the row that wrote them. */
  brokenRefs: { at: number; stepId: string }[]
}

/**
 * The words on a move line: the out port, and "→ in port" when the two differ.
 *
 * THE NAMES ARE THE AGENTS' OWN WORDS and are never looked up, translated or shortened here. A
 * link with no names is drawn as an unlabelled arrow, which says a flow exists and does not claim
 * to know what moves.
 */
export function carriedWords(carries: readonly CarriedData[]): string | null {
  if (carries.length === 0) return null
  return carries.map((one) => (one.in === undefined || one.in === one.out ? one.out : `${one.out} → ${one.in}`)).join(', ')
}

/**
 * Place every dependency in a lane, the way a commit graph does.
 *
 * WHY A LANE SWEEP AND NOT A MEASURED DRAWING. The obvious way to draw edges is to measure where
 * each row landed and stroke curves between the pixels. That needs layout to have happened, gives
 * nothing in a server render, and re-measures every time a name wraps. This assigns each edge an
 * integer lane in one pass, and a row then draws three plain boxes: a line from the top of the row,
 * a line to the bottom of the row, and a horizontal bend at a fixed height. A row that wraps to four
 * lines is still continuous, because the through-lines are pinned to the row's top and bottom rather
 * than to a height somebody had to know in advance.
 *
 * The sweep is: put this row's node on a lane an arriving edge already occupies, so the line runs
 * straight into it; then give every edge that starts here a lane, preferring the node's own lane and
 * then any lane that has just come free.
 *
 * `storedOrder` IS A DIFFERENT DRAWING, NOT A DIFFERENT SHAPE. When a pipeline stores no link
 * between two of its own steps, the only order it has is the order it stores them in. The caller
 * then asks for one edge from each step to the next, and the same lane sweep places them; the edges
 * are marked `order` so every surface can say they are the page's own reading of the order and not
 * a link anybody wrote.
 */
export function layoutFlow(steps: readonly FlowStep[], storedOrder = false): FlowLayout {
  const indexById = new Map<string, number>()
  steps.forEach((step, i) => {
    // First writer wins. Two steps sharing an id is a record that cannot be drawn correctly either
    // way, and the second one's dependents are reported as pointing at an id nothing holds.
    if (!indexById.has(step.id)) indexById.set(step.id, i)
  })

  const edges: FlowEdge[] = []
  const brokenRefs: { at: number; stepId: string }[] = []
  if (storedOrder) {
    for (let i = 0; i + 1 < steps.length; i++) {
      edges.push({
        from: i,
        to: i + 1,
        top: i,
        bottom: i + 1,
        gate: null,
        upTo: null,
        // THE ORDER IS NOT A WAIT, SO A FINISHED STEP DOES NOT FADE IT. The line says where the
        // steps are stored, and that stays true after the work is done.
        cleared: false,
        backward: false,
        lane: -1,
        kind: 'order',
        label: null,
        linkId: null,
      })
    }
  } else {
    steps.forEach((step, to) => {
      for (const need of step.needs) {
        const from = indexById.get(need.blockId)
        if (from === undefined || from === to) {
          brokenRefs.push({ at: to, stepId: need.blockId })
          continue
        }
        const source = steps[from]
        edges.push({
          from,
          to,
          top: Math.min(from, to),
          bottom: Math.max(from, to),
          // A `blocks` link may carry no gate at all, and NULL IS NOT `hard`. The edge is drawn as an
          // unqualified dependency and says so; reading it as hard would make work that is mostly
          // doable look completely stuck.
          gate: need.gate,
          upTo: need.upTo ?? null,
          cleared: source !== undefined && source.state === 'done',
          backward: from > to,
          lane: -1,
          kind: 'wait',
          label: null,
          linkId: need.linkId,
        })
      }
      for (const move of step.moves ?? []) {
        const target = indexById.get(move.blockId)
        if (target === undefined || target === to) continue
        edges.push({
          from: to,
          to: target,
          top: Math.min(to, target),
          bottom: Math.max(to, target),
          gate: null,
          upTo: null,
          // A FLOW IS NOT A WAIT EITHER. Data moving out of a finished step is still data moving.
          cleared: false,
          backward: to > target,
          lane: -1,
          kind: 'move',
          label: carriedWords(move.carries),
          linkId: move.linkId,
        })
      }
    })
  }

  // Longest-lived first among edges that start on the same row, so a line spanning many rows takes
  // an outer lane and short hops stay near the node column. That is what keeps the picture readable.
  edges.sort((a, b) => a.top - b.top || b.bottom - a.bottom || a.to - b.to)

  /** lane -> index of the edge holding it, or null. A lane is held over [edge.top, edge.bottom]. */
  const held: (number | null)[] = []
  const rows: FlowRow[] = []
  let maxLane = 0

  const freeAt = (lane: number, row: number): boolean => {
    const at = held[lane]
    if (at === undefined || at === null) return true
    const edge = edges[at]
    return edge === undefined || edge.bottom <= row
  }
  const firstFree = (row: number): number => {
    for (let lane = 0; lane < held.length; lane++) if (freeAt(lane, row)) return lane
    held.push(null)
    return held.length - 1
  }

  for (let i = 0; i < steps.length; i++) {
    // The node prefers a lane an edge is already arriving on, so the line runs into it rather than
    // bending sideways. Ties go to the leftmost, which keeps the picture stable as steps are added.
    let nodeLane = -1
    for (let lane = 0; lane < held.length && nodeLane === -1; lane++) {
      const at = held[lane]
      if (at === undefined || at === null) continue
      const edge = edges[at]
      if (edge !== undefined && edge.bottom === i) nodeLane = lane
    }
    if (nodeLane === -1) nodeLane = firstFree(i)

    const taken = new Set<number>([nodeLane])
    for (const [index, edge] of edges.entries()) {
      if (edge.top !== i || edge.lane !== -1) continue
      let lane = -1
      // The node's own lane first: an edge leaving the node should leave straight down.
      if (freeAt(nodeLane, i) && held[nodeLane] !== index && !edges.some((e) => e.lane === nodeLane && e.top === i)) {
        lane = nodeLane
      }
      if (lane === -1) {
        for (let candidate = 0; candidate < held.length; candidate++) {
          if (taken.has(candidate) || !freeAt(candidate, i)) continue
          lane = candidate
          break
        }
      }
      if (lane === -1) {
        held.push(null)
        lane = held.length - 1
      }
      taken.add(lane)
      held[lane] = index
      edge.lane = lane
      maxLane = Math.max(maxLane, lane)
    }
    maxLane = Math.max(maxLane, nodeLane)
    rows.push({ index: i, nodeLane, segments: [] })
  }

  // Segments are DERIVED from the finished lane assignment rather than collected during the sweep,
  // because during the sweep one lane can be both "an edge ending here" and "an edge starting here"
  // in the same row, and the second would overwrite the first.
  for (const row of rows) {
    for (const [index, edge] of edges.entries()) {
      if (edge.lane === -1) continue
      const waiting = edge.to === row.index
      if (edge.top < row.index && edge.bottom > row.index) {
        row.segments.push({
          lane: edge.lane,
          kind: 'through',
          elbow: false,
          gate: null,
          cleared: edge.cleared,
          edge: index,
        })
      } else if (edge.bottom === row.index) {
        row.segments.push({
          lane: edge.lane,
          kind: 'enter',
          elbow: edge.lane !== row.nodeLane,
          gate: waiting ? edge.gate : null,
          cleared: edge.cleared,
          edge: index,
        })
      } else if (edge.top === row.index) {
        row.segments.push({
          lane: edge.lane,
          kind: 'leave',
          elbow: edge.lane !== row.nodeLane,
          gate: waiting ? edge.gate : null,
          cleared: edge.cleared,
          edge: index,
        })
      }
    }
  }

  return { rows, edges, lanes: maxLane + 1, brokenRefs }
}

// ============================================================================ the drawing

/** An attention row that belongs to one block of this pipeline, and where the server put it. */
export interface StepAttention {
  row: AttentionRow
  where: 'visible' | 'remainder'
}

export interface PipelineFlowProps {
  reading: PipelineReading
  /**
   * The server's attention rows, by BLOCK RECORD ID. Never re-derived here.
   *
   * It used to be keyed by step id inside one pipeline, so the same map could not be shared between
   * two pipelines' drawings. A block is a record, so one map covers every pipeline and looking a
   * block up in it cannot pick up another pipeline's row by accident.
   */
  attention?: ReadonlyMap<string, StepAttention>
  /** Injected so a test and a screenshot are stable. */
  now?: number
}

/** How wide one module lane is on a wide screen: a dot, a hairline, and room for a count. */
const LANE_PX = 38
/** How wide one gutter lane is. Two lines side by side have to be tellable apart at a glance. */
const GUTTER_LANE_PX = 15
/** How wide the gutter is when a feeds link writes words beside its line. */
const MOVE_GUTTER_PX = 128

/**
 * How much of the wall bar is the open stretch, for a partial gate.
 *
 * A CONSTANT, AND SAID TO BE ONE ON SCREEN. Nothing stores how much of a step the open stretch is,
 * and a bar whose split moved with the data would be read as a measurement. The drawing says only
 * "there is an open stretch, and then a wall", which is exactly what a partial gate records.
 */
const OPEN_SHARE = 42

export function PipelineFlow({ reading, attention, now = Date.now() }: PipelineFlowProps) {
  useLanguage()
  const inspect = useInspect()
  const { record, steps } = reading
  const byId = new Map(steps.map((step, index) => [step.id, { index, step }]))
  const drawn = steps.map((step, index) => ({ step, index, hold: holdOn(step, byId) }))
  const mapping = mappingFacts(steps)
  const deps = dependencyFacts(steps, drawn.map((d) => d.hold))
  // A LINK BETWEEN ANY TWO OF THIS PIPELINE'S OWN STEPS IS THE PIPELINE'S OWN DRAWING. When one is
  // stored, the page draws the stored links and invents no order; when none is, the only order the
  // record has is the order it stores its steps in, and the page draws that and says so.
  const aStepLinkIsStored = steps.some(
    (step, index) =>
      (step.moves ?? []).length > 0 ||
      step.needs.some((need) => {
        const found = byId.get(need.blockId)
        return found !== undefined && found.index !== index
      }),
  )
  const orderArrows = steps.length > 1 && !aStepLinkIsStored
  const layout = layoutFlow(steps, orderArrows)
  const laneIndex = new Map(mapping.lanes.map((lane, i) => [lane.title, i]))

  const counts = ITEM_STATES.map((state) => ({ state, n: steps.filter((s) => s.state === state).length })).filter(
    (entry) => entry.n > 0,
  )

  // A WORD ON A MOVE LINE NEEDS ROOM BESIDE THE LINE. The line stays in its lane; the word is put
  // to its right, and the gutter grows only for a pipeline that has such a line.
  const hasMoveLabels = steps.some((step) => (step.moves ?? []).some((move) => carriedWords(move.carries) !== null))
  const vars = {
    '--pf-lane-cols': `repeat(${Math.max(1, mapping.lanes.length)}, minmax(0, 1fr))`,
    '--pf-lanes-w': `${LANE_PX * Math.max(1, mapping.lanes.length)}px`,
    '--pf-gutter-lane': `${GUTTER_LANE_PX}px`,
    '--pf-gutter-w': `${Math.max(hasMoveLabels ? MOVE_GUTTER_PX : 0, Math.max(1, layout.lanes) * GUTTER_LANE_PX + 10)}px`,
  } as unknown as React.CSSProperties

  return (
    <div className="pf" style={vars}>
      <style href="mole-office-pipeline" precedence="default">
        {PIPELINE_FLOW_CSS}
      </style>

      <header className="pf-head">
        <div className="pf-head-line">
          <RouteLink to={recordPath(record.id)} className="pf-title wrap-anywhere">
            {record.title}
          </RouteLink>
          <span className="pf-size num">
            {plural(reading.storedSteps, t('g7b.PipelineFlow.step'), t('g7b.PipelineFlow.steps'))} · {plural(mapping.lanes.length, t('g7b.PipelineFlow.module'), t('g7b.PipelineFlow.modules'))}
          </span>
        </div>
        {record.summary === null ? null : <p className="pf-summary wrap-anywhere">{record.summary}</p>}
        {reading.consequence === null ? null : (
          <p className="pf-mark-line">
            <ConsequenceMark consequence={reading.consequence} withSentence />
          </p>
        )}
        {reading.pause === null ? null : (
          <p className="pf-mark-line">
            <PauseMark pause={reading.pause} note={t('g7b.PipelineFlow.put_down_on', { v1: reading.pause.since, v2: reading.pause.why })} />
          </p>
        )}
        {counts.length === 0 ? null : (
          <p className="pf-counts">
            {/* THE COUNT AND THE READER'S WORD, not the count and the stored one. This built the
                label as `${n} ${state}` and drew "3 todo" on #/pipeline at 1440 and at 390, in
                normal mode, at first paint. `panelStateWord` is the same reading the chip beside
                it uses, so the count and the chip cannot say two different words. */}
            {counts.map(({ state, n }) => (
              <StateChip key={state} state={state} label={`${n} ${panelStateWord(state)}`} />
            ))}
          </p>
        )}
      </header>

      {reading.problem !== null ? (
        <p className="pf-nothing">{reading.problem}</p>
      ) : steps.length === 0 ? (
        <Absence />
      ) : (
        <>
          <p className="pf-fact">{mapping.sentence}</p>
          <p className="pf-fact">{deps.sentence}</p>

          <div className="pf-grid">
            <LaneHeader lanes={mapping.lanes} />
            <ol className="pf-steps">
              {drawn.map(({ step, index, hold }) => (
                <StepRow
                  key={step.id}
                  step={step}
                  index={index}
                  total={steps.length}
                  steps={steps}
                  row={layout.rows[index]}
                  edges={layout.edges}
                  hold={hold}
                  lanes={mapping.lanes}
                  laneIndex={laneIndex}
                  attention={attention?.get(step.id)}
                  now={now}
                />
              ))}
            </ol>
            {mapping.lanes.length === 0 ? null : <LaneFooter lanes={mapping.lanes} total={steps.length} />}
          </div>

          <Roster mapping={mapping} steps={steps} />
        </>
      )}

      {reading.stepProblems.length === 0 ? null : (
        <div className="pf-broken">
          <p className="pf-broken-head">
            {plural(reading.stepProblems.length, t('g7b.PipelineFlow.stored_step'), t('g7b.PipelineFlow.stored_steps'))}{t('g7b.PipelineFlow.of')}{reading.storedSteps}{t('g7b.PipelineFlow.could_not_be_read_so')}{reading.stepProblems.length === 1 ? t('g7b.PipelineFlow.it_is') : t('g7b.PipelineFlow.they_are')}{t('g7b.PipelineFlow.not_in_the_drawing_above_they_are')}</p>
          <ul className="pf-broken-list">
            {reading.stepProblems.map((problem) => (
              <li key={problem.at}>
                <span className="num">{t('g7b.PipelineFlow.step_307')}{problem.at}</span> — {inspect ? problem.problem : t('g7b.readFailed')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {layout.brokenRefs.length === 0 ? null : (
        <div className="pf-broken">
          <p className="pf-broken-head">
            {plural(layout.brokenRefs.length, t('g7b.PipelineFlow.dependency_points'), t('g7b.PipelineFlow.dependencies_point'))}{t('g7b.PipelineFlow.at_a_step_id_this_pipeline_does')}</p>
          <ul className="pf-broken-list">
            {layout.brokenRefs.map((ref) => (
              <li key={`${ref.at}-${ref.stepId}`}>{t('g7b.PipelineFlow.step_315')}<span className="num">{stepNumber(ref.at)}</span>{t('g7b.PipelineFlow.waits_on')}{inspect ? <code>{ref.stepId}</code> : t('g7b.missingRecord')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {steps.length === 0 ? null : <Legend orderArrows={orderArrows} />}
    </div>
  )
}

// ---------------------------------------------------------------------------- the lane headers

/**
 * The module names, written down the page so eight of them fit across a phone.
 *
 * `text-orientation: mixed` is what makes this work in two scripts at once: Latin turns onto its
 * side and CJK stays upright, which is how vertical Chinese is actually set. A long name is cut off
 * at the height available; the whole of it is in the roster below and in every step's "carried by"
 * line, so nothing lives only here.
 */
function LaneHeader({ lanes }: { lanes: readonly ModuleLane[] }) {
  return (
    <div className="pf-row pf-colhead">
      <div className="pf-gutter" aria-hidden="true" />
      <div className="pf-body">
        <div className="pf-text">
          <span className="pf-colhead-word">{t('g7b.PipelineFlow.steps_in_the_order_written')}</span>
        </div>
        {lanes.length === 0 ? null : (
          <div className="pf-lanes">
            {lanes.map((lane, i) => (
              <span className="pf-lane-head" key={lane.title} title={lane.title}>
                <span className="pf-lane-name">{lane.title}</span>
                <span className="pf-lane-tag num">{t('g7b.PipelineFlow.m')}{i + 1}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * How many steps of THIS PIPELINE each module carries.
 *
 * THE WORDING HERE IS LOAD-BEARING and the source design flagged it as the most dangerous thing on
 * the page. The home page already draws a FAILED chip against a module when what failed was one line
 * inside it; a lane footer that counted failures would make the same claim again. So it counts steps
 * and the sentence beside it says what that is not.
 */
function LaneFooter({ lanes, total }: { lanes: readonly ModuleLane[]; total: number }) {
  return (
    <div className="pf-row pf-colfoot">
      <div className="pf-gutter" aria-hidden="true" />
      <div className="pf-body">
        <div className="pf-text" aria-hidden="true" />
        <div className="pf-lanes">
          {lanes.map((lane) => (
            <span
              className="pf-lane-foot num"
              key={lane.title}
              title={t('g7b.PipelineFlow.carries_of_these', { v1: lane.title, v2: plural(lane.steps.length, t('g7b.PipelineFlow.step'), t('g7b.PipelineFlow.steps')), v3: total })}
            >
              {lane.steps.length}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------- one step

function StepRow({
  step,
  index,
  total,
  steps,
  row,
  edges,
  hold,
  lanes,
  laneIndex,
  attention,
  now,
}: {
  step: FlowStep
  index: number
  total: number
  steps: readonly FlowStep[]
  row: FlowRow | undefined
  edges: readonly FlowEdge[]
  hold: Hold
  lanes: readonly ModuleLane[]
  laneIndex: ReadonlyMap<string, number>
  attention: StepAttention | undefined
  now: number
}) {
  // How loudly, from the shared scale, using only numbers the server already sent. Nothing here
  // decides whether the step needs a person — that is the row's presence on the list.
  const alarm: AlarmLevel | undefined =
    attention === undefined
      ? undefined
      : alarmFor({
          safety: attention.row.safety,
          lateMs: attention.row.reason.owed?.lateMs ?? null,
          satDays: daysSince(attention.row.reason.stoppedShort?.since ?? null, now),
        })

  return (
    <li className="pf-row pf-step" data-state={step.state} data-alarm={alarm}>
      <Gutter row={row} edges={edges} steps={steps} />
      <div className="pf-body">
        <div className="pf-text">
          {/* THE NUMBER AND THE TITLE ON ONE LINE, and a long title wraps under itself and not under
              the number. The state and the carried-by count share the line under it (PV-2). */}
          <div className="pf-step-line">
            <span className="pf-step-no num">{stepNumber(index)}</span>
            <span className="pf-step-name wrap-anywhere">{step.name}</span>
          </div>
          <div className="pf-chip-row">
            {/* The same level the row is drawn at. A step whose row had faded and whose chip had
                not was one line saying two things about how urgent it is. */}
            <StateChip state={step.state} {...(alarm === undefined ? {} : { alarm })} />
            <Carriers step={step} laneIndex={laneIndex} />
          </div>
          {step.measured === null ? (
            <p className="pf-none"><Absence /></p>
          ) : (
            <p className="pf-measured wrap-anywhere">{step.measured}</p>
          )}
          <HungPipelines step={step} />
          <Waits hold={hold} state={step.state} steps={steps} />
          {step.consequence === null ? null : (
            <p className="pf-mark-line">
              <ConsequenceMark consequence={step.consequence} withSentence />
            </p>
          )}
          {attention === undefined ? null : (
            <div className="pf-reason">
              <p className="pf-reason-where">
                {attention.where === 'visible'
                  ? t('g7b.PipelineFlow.this_step_is_on_the_first_screen')
                  : t('g7b.PipelineFlow.this_step_is_on_the_attention_list', { v1: attention.row.displacedBy === 'group-cap' ? t('g7b.PipelineFlow.group_cap') : t('g7b.PipelineFlow.row_cap') })}
              </p>
              <ReasonLine
                because={attention.row.reason.because}
                factors={attention.row.reason.factors}
                score={attention.row.score}
                safetyFloor={attention.row.reason.safetyFloor}
              />
            </div>
          )}
        </div>
        {lanes.length === 0 ? null : <LaneCells step={step} lanes={lanes} total={total} />}
      </div>
    </li>
  )
}

/**
 * THE PIPELINES THAT HANG FROM THIS STEP, each a link that opens its own page. Wave 13u round 216, package BV, point
 * BV-5. A pipeline hangs from a step when a `part_of` link runs from the pipeline to the step; `readPipelineBlocks` in
 * src/shared/blocks.ts reads them, so every drawing of a step shows the same ones. Nothing is drawn for a step with none.
 */
export function HungPipelines({ step }: { step: FlowStep }) {
  const hung = step.hung ?? []
  if (hung.length === 0) return null
  // The flow's own sheet, mounted here as well, because the tier list draws this line without the rest of the flow.
  // React keeps one copy of a sheet by its href.
  return (
    <p className="pf-hung">
      <style href="mole-office-pipeline" precedence="default">
        {PIPELINE_FLOW_CSS}
      </style>
      <span className="pf-carried-word">{t('pipelineFlow.hung')}</span>
      {hung.map((one) => (
        <span key={one.id} className="pf-hung-one" data-hung-pipeline={one.id}>
          <RouteLink to={pipelinePath(one.id)} className="wrap-anywhere">{one.title}</RouteLink>
        </span>
      ))}
    </p>
  )
}

/** The names of the modules carrying this block: the grid read ACROSS, in words. */
function Carriers({ step, laneIndex }: { step: FlowStep; laneIndex: ReadonlyMap<string, number> }) {
  if (step.modules.length === 0) {
    return (
      <p className="pf-nobody"><Absence /></p>
    )
  }
  return (
    <p className="pf-carried">
      <span className="pf-carried-word">{t('g7b.PipelineFlow.carried_by')}{step.modules.length}</span>
      {step.modules.map((title) => {
        const at = laneIndex.get(title)
        return (
          <span className="pf-carried-one wrap-anywhere" key={title}>
            {title}
            {at === undefined ? null : <span className="pf-carried-tag num">{t('g7b.PipelineFlow.m')}{at + 1}</span>}
          </span>
        )
      })}
    </p>
  )
}

/**
 * What this step is waiting on, in words and — when something is holding it — as a wall.
 *
 * THE WALL IS THE POINT OF THIS COMPONENT. A partial gate says "you may go this far, and no further,
 * until that finishes", and written as a sentence in a list it is one more line of text on a page
 * already full of them. Drawn, the open stretch and the wall are the first thing you see, and the
 * difference between a step that is completely stopped and a step with a week of work in front of it
 * is the position of one bar.
 */
function Waits({ hold, state, steps }: { hold: Hold; state: ItemState; steps: readonly FlowStep[] }) {
  const inspect = useInspect()
  if (hold.kind === 'none-recorded') {
    return (
      <>
        <p className="pf-none">{t('pipelineFlow.noDependencies')}</p>
        <BlockedBySomethingElse hold={hold} state={state} />
      </>
    )
  }

  const listed = [...(hold.kind === 'clear' ? [] : hold.standing), ...hold.cleared, ...hold.broken]

  return (
    <div className="pf-waits">
      <BlockedBySomethingElse hold={hold} state={state} />
      {hold.kind === 'clear' ? (
        hold.cleared.length === 0 ? (
          <p className="pf-waits-line">{t('g7b.PipelineFlow.every_dependency_written_on_this_step_points')}</p>
        ) : (
          <p className="pf-waits-line">{t('g7b.PipelineFlow.every_step_it_waits_on_has_finished')}{namedSteps(hold.cleared)}{t('g7b.PipelineFlow.nothing_is_holding_it_now')}</p>
        )
      ) : impossible(hold, state) ? (
        <Impossible hold={hold} state={state} />
      ) : (
        <Wall hold={hold} />
      )}
      <ul className="pf-needs">
        {listed.map((view, i) => (
          <li className="pf-need" key={`${view.need.blockId}-${i}`}>
            {/* No gate is drawn where none is stored. A default mark would say "hard" for an author
                who wrote nothing at all about how much this blocks. */}
            {gateOf(view.need) === null ? null : <GateMark gate={gateOf(view.need) as Gate} />}
            <span className="pf-need-text wrap-anywhere">
              {view.step === null || view.index === null ? (
                <>{t('g7b.PipelineFlow.waits_on_391')}{inspect ? <code>{view.need.blockId}</code> : t('g7b.missingRecord')}{t('g7b.PipelineFlow.which_no_block_here_holds')}</>
              ) : (
                <>{t('g7b.PipelineFlow.waits_on_393')}<span className="num">{stepNumber(view.index)}</span> {view.step.name} —{' '}
                  {gateOf(view.need) === null
                    ? t('g7b.PipelineFlow.nobody_has_said_how_hard_this_wait')
                    : gateWordsForReader(gateOf(view.need) as Gate, stageInAPipeline(view.need.upTo, steps, stepNumber).words)}{t('g7b.PipelineFlow.that_step_is')}{' '}
                  {/* THE READER'S WORD. This said "it is stored as todo", which named the column
                      value and told a reader nothing they could act on. */}
                  <b>{shownState(view.step.state)}</b>
                  {view.cleared ? <span className="pf-need-cleared">{t('g7b.PipelineFlow.so_this_has_cleared')}</span> : null}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * A step whose own word says `blocked` while nothing it waits on is holding it.
 *
 * THIS IS A REAL CASE IN THIS DATABASE AND IT WOULD OTHERWISE READ AS A CONTRADICTION. Transplant v2
 * step 04 is stored as `blocked`, and every step in its `needs` has finished — because what blocks
 * it is a `blocks` link from a problem record, and a link points at the PIPELINE and cannot point at
 * a step. A reader who saw "blocked" beside "nothing is holding it" and no explanation would
 * reasonably conclude the drawing was wrong.
 *
 * So it says where to look instead. It does NOT guess which link is meant: Mole Office genuinely does not
 * know, and naming a likely one would be exactly the confident default this product bans.
 */
function BlockedBySomethingElse({ hold, state }: { hold: Hold; state: ItemState }) {
  if (state !== 'blocked') return null
  if (hold.kind === 'hard' || hold.kind === 'partial') return null
  return (
    <p className="pf-elsewhere">{t('g7b.PipelineFlow.its_own_state_word_says')}<b>{t('g7b.PipelineFlow.blocked')}</b>{t('g7b.PipelineFlow.and_nothing_it_waits_on_is_holding')}<code>{t('g7b.PipelineFlow.blocks')}</code>{t('g7b.PipelineFlow.link_points_at_the_whole_pipeline_and')}</p>
  )
}

/**
 * A stored dependency as the shared `Gate` shape, so `gateWordsForReader` and `GateMark` word it the one way.
 *
 * Null when the link carries no gate. NULL IS NOT `hard`: the author said that one block blocks
 * another and said nothing at all about how much, and the reader shows an unqualified dependency as
 * an unqualified one.
 */
function gateOf(need: BlockNeed): Gate | null {
  if (need.gate === null) return null
  return need.upTo === undefined ? { kind: need.gate } : { kind: need.gate, upTo: need.upTo }
}

/** "04 Plan the approach and 07 Sense the pull" — the steps a sentence is about. */
function namedSteps(views: readonly NeedView[]): string {
  const names = views.map((view) =>
    view.index === null || view.step === null ? t('g7b.missingRecord') : `${stepNumber(view.index)} ${view.step.name}`,
  )
  if (names.length <= 1) return names.join('')
  return t('g7b.PipelineFlow.and_409', { v1: listJoined(names.slice(0, -1)), v2: names[names.length - 1] ?? '' })
}

/**
 * Two stored facts that cannot both be true, so the wall must not be drawn.
 *
 * THIS IS IN THE SHIPPED SEED. Step 09 of the sim-to-real check is stored as `done` while step 07,
 * which it waits on through a HARD gate, is still `doing`. Drawing the wall there would print
 * "nothing here can start" over a step that has already finished, which is the drawing telling a
 * plain lie about its own data.
 *
 * TWO CASES AND ONLY TWO. `done` while anything it waits on is unfinished, and `doing` while
 * something is supposed to stop it COMPLETELY. A `failed` step behind a standing gate is NOT here:
 * failed means somebody tried it anyway, which is an ordinary thing to do and a real record of it.
 */
function impossible(hold: Hold, state: ItemState): boolean {
  if (hold.kind !== 'hard' && hold.kind !== 'partial') return false
  if (hold.standing.length === 0) return false
  if (state === 'done') return true
  return state === 'doing' && hold.kind === 'hard'
}

/** The contradiction, named — and NOT resolved, because Mole Office has no way to know which side is right. */
function Impossible({ hold, state }: { hold: Extract<Hold, { kind: 'hard' | 'partial' }>; state: ItemState }) {
  const many = hold.standing.length > 1
  return (
    <p className="pf-impossible">
      {state === 'done' ? (
        <>{t('g7b.PipelineFlow.this_step_is_stored_as')}<b>{t('g7b.PipelineFlow.done')}</b>{t('g7b.PipelineFlow.and_421')}{namedSteps(hold.standing)}{t('g7b.PipelineFlow.which_it_waits_on')}{' '}
          {many ? t('g7b.PipelineFlow.have') : t('g7b.PipelineFlow.has')}{t('g7b.PipelineFlow.not_finished')}</>
      ) : (
        <>{t('g7b.PipelineFlow.work_on_this_step_is_recorded_as')}<b>{t('g7b.PipelineFlow.under_way')}</b>{t('g7b.PipelineFlow.and_428')}{namedSteps(hold.standing)}{t('g7b.PipelineFlow.is_recorded_as_stopping_it_completely_until')}{many ? t('g7b.PipelineFlow.they_finish') : t('g7b.PipelineFlow.it_finishes')}{endOfSentence()}
        </>
      )}{gapBetween(endOfSentence(), t('g7b.PipelineFlow.both_cannot_be_true_either_the_work'))}{t('g7b.PipelineFlow.both_cannot_be_true_either_the_work')}</p>
  )
}

/** The bar: how far you may go, where the wall is, and what is on the other side of it. */
function Wall({ hold }: { hold: Extract<Hold, { kind: 'hard' | 'partial' }> }) {
  const hard = hold.kind === 'hard'
  const upTo = hold.standing
    .map((view) => view.need.upTo)
    .filter((value): value is string => value !== undefined && value.trim() !== '')
  return (
    <div className="pf-wall" data-gate={hold.kind} style={{ ['--pf-open' as string]: hard ? '0' : String(OPEN_SHARE) }}>
      {hard ? null : (
        <span className="pf-wall-open">
          <span className="pf-wall-word">{t('g7b.PipelineFlow.you_may_go_this_far')}</span>
          <span className="pf-wall-detail wrap-anywhere">
            {upTo.length === 0 ? t('g7b.PipelineFlow.the_stored_gate_does_not_say_how') : upTo.join(' · ')}
          </span>
        </span>
      )}
      <span className="pf-wall-bar" aria-hidden="true" />
      <span className="pf-wall-beyond">
        <span className="pf-wall-word">{hard ? t('g7b.PipelineFlow.nothing_here_can_start') : t('g7b.PipelineFlow.and_no_further')}</span>
        <span className="pf-wall-detail wrap-anywhere">{t('g7b.PipelineFlow.until')}{namedSteps(hold.standing)}{t('g7b.PipelineFlow.finishes')}</span>
      </span>
    </div>
  )
}

/** The lane cells for one step: a mark where a module carries it, and nothing where it does not. */
function LaneCells({ step, lanes, total }: { step: FlowStep; lanes: readonly ModuleLane[]; total: number }) {
  if (step.modules.length === 0) {
    return (
      <div className="pf-lanes">
        <span className="pf-band" data-kind="nobody"><Absence /></span>
      </div>
    )
  }
  const carried = new Set(step.modules)
  return (
    <div className="pf-lanes">
      {lanes.map((lane) => (
        <span className="pf-cell" key={lane.title}>
          {carried.has(lane.title) ? (
            <span
              className="pf-dot"
              style={{ ['--pf-tone' as string]: `var(--st-${step.state})` }}
              title={t('g7b.PipelineFlow.carries_this_step_it_is_of_the', { v1: lane.title, v2: total, v3: shownState(step.state) })}
            />
          ) : null}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------- the gutter

function Gutter({ row, edges, steps }: { row: FlowRow | undefined; edges: readonly FlowEdge[]; steps: readonly FlowStep[] }) {
  if (row === undefined) return <div className="pf-gutter" />
  const x = (lane: number) => `calc(var(--pf-gutter-lane) * ${lane + 0.5})`
  return (
    <div className="pf-gutter">
      {row.segments.map((segment, i) => {
        const edge = edges[segment.edge]
        const tone = segment.cleared ? 'cleared' : 'standing'
        const order = edge !== undefined && edge.kind === 'order'
        const move = edge !== undefined && edge.kind === 'move'
        const words =
          edge === undefined
            ? undefined
            : order
              ? t('g7b.PipelineFlow.the_next_step_in_the_stored_order')
              : move && edge.label !== null
                ? edge.label
                : undefined
        return (
          <span key={`${segment.edge}-${segment.kind}-${i}`}>
            <span
              className="pf-line"
              data-kind={segment.kind}
              data-tone={tone}
              data-order={order ? '1' : undefined}
              data-move={move ? '1' : undefined}
              data-edge={segment.edge}
              style={{ left: x(segment.lane) }}
              title={words}
              aria-hidden="true"
            />
            {segment.elbow ? (
              <span
                className="pf-elbow"
                data-tone={tone}
                data-order={order ? '1' : undefined}
                style={{
                  left: x(Math.min(segment.lane, row.nodeLane)),
                  width: `calc(var(--pf-gutter-lane) * ${Math.abs(segment.lane - row.nodeLane)})`,
                }}
                aria-hidden="true"
              />
            ) : null}
            {segment.gate === null ? null : (
              <span
                className="pf-gate"
                data-gate={segment.gate}
                data-tone={tone}
                data-side={segment.kind === 'enter' ? 'above' : 'below'}
                style={{ left: x(segment.lane) }}
                title={
                  edge === undefined || edge.gate === null
                    ? undefined
                    : `${gateWordsForReader(edge.upTo === null ? { kind: edge.gate } : { kind: edge.gate, upTo: edge.upTo }, stageInAPipeline(edge.upTo ?? undefined, steps, stepNumber).words)}${
                        edge.cleared ? t('g7b.PipelineFlow.cleared_the_block_it_comes_from_is') : ''
                      }`
                }
                aria-hidden="true"
              />
            )}
            {edge !== undefined && move && edge.label !== null && row.index === edge.from ? (
              <span
                className="pf-move"
                style={{
                  left: `calc(var(--pf-gutter-lane) * ${segment.lane + 0.5} + 4px)`,
                  top: edge.backward ? 'calc(var(--pf-node-y) - 26px)' : 'calc(var(--pf-node-y) + 8px)',
                }}
                title={edge.label}
              >
                {edge.label}
              </span>
            ) : null}
          </span>
        )
      })}
      <span className="pf-node" style={{ left: x(row.nodeLane) }} aria-hidden="true" />
    </div>
  )
}

// ---------------------------------------------------------------------------- the roster

/** The grid read DOWN: one line per module, naming the steps it carries. */
function Roster({ mapping, steps }: { mapping: MappingFacts; steps: readonly FlowStep[] }) {
  if (mapping.lanes.length === 0) {
    return (
      <p className="pf-nothing"><Absence /></p>
    )
  }
  const unowned = steps
    .map((step, index) => ({ step, index }))
    .filter((entry) => entry.step.modules !== null && entry.step.modules.length === 0)
  return (
    <div className="pf-roster">
      <p className="pf-roster-head">{t('g7b.PipelineFlow.who_carries_what_the_columns_above_read')}</p>
      <ul className="pf-roster-list">
        {mapping.lanes.map((lane, i) => (
          <li className="pf-roster-item" key={lane.title}>
            <span className="pf-roster-tag num">{t('g7b.PipelineFlow.m')}{i + 1}</span>
            <span className="pf-roster-name wrap-anywhere">{lane.title}</span>
            <span className="pf-roster-steps num">
              {plural(lane.steps.length, t('g7b.PipelineFlow.step'), t('g7b.PipelineFlow.steps'))} {lane.steps.map((s) => stepNumber(s)).join(' ')}
            </span>
          </li>
        ))}
      </ul>
      {unowned.length === 0 ? null : (
        <p className="pf-roster-none">
          <b>{t('g7b.PipelineFlow.no_module')}{listJoined(unowned.map((entry) => stepNumber(entry.index)))}</b> — {unowned.length}{t('g7b.PipelineFlow.of_497')}{' '}
          {steps.length} {t('g7b.PipelineFlow.steps')}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------- the legend

/**
 * What the marks in the gutter mean, printed rather than hidden behind a hover.
 *
 * A phone has no hover, so an explanation that only appears on one does not exist for the reader
 * this page was built for — and this project does not call a screen done until somebody has looked
 * at a picture of it, which cannot show a tooltip either.
 */
function Legend({ orderArrows }: { orderArrows: boolean }) {
  const at = 'calc(var(--pf-gutter-lane) * 0.5)'
  return (
    <div className="pf-legend">
      <p className="pf-legend-head">{t('g7b.PipelineFlow.how_to_read_the_lines_on_the')}</p>
      <ul className="pf-legend-list">
        <li>
          <span className="pf-legend-art" aria-hidden="true">
            <span className="pf-line" data-kind="through" data-tone="standing" style={{ left: at }} />
            <span className="pf-node" style={{ left: at }} />
          </span>
          <span>{t('g7b.PipelineFlow.step')} · {t('g7b.PipelineFlow.dependency')}</span>
        </li>
        {orderArrows ? (
          <li>
            <span className="pf-legend-art" aria-hidden="true">
              <span className="pf-line" data-kind="through" data-tone="standing" data-order="1" style={{ left: at }} />
              <span className="pf-node" style={{ left: at }} />
            </span>
            <span>{t('pipelineFlow.legend.stepOrder')}</span>
          </li>
        ) : null}
        <li>
          <span className="pf-legend-art" aria-hidden="true">
            <span className="pf-line" data-kind="through" data-tone="standing" style={{ left: at }} />
            <span className="pf-gate" data-gate="hard" data-tone="standing" data-side="above" style={{ left: at }} />
            <span className="pf-node" style={{ left: at }} />
          </span>
          <span>{t('g7b.PipelineFlow.hard_gate')}</span>
        </li>
        <li>
          <span className="pf-legend-art" aria-hidden="true">
            <span className="pf-line" data-kind="through" data-tone="standing" style={{ left: at }} />
            <span className="pf-gate" data-gate="partial" data-tone="standing" data-side="above" style={{ left: at }} />
            <span className="pf-node" style={{ left: at }} />
          </span>
          <span>{t('g7b.PipelineFlow.partial_gate')}</span>
        </li>
        <li>
          <span className="pf-legend-art" aria-hidden="true">
            <span className="pf-line" data-kind="through" data-tone="cleared" style={{ left: at }} />
            <span className="pf-node" style={{ left: at }} />
          </span>
          <span>{t('pipelineFlow.legend.cleared')}</span>
        </li>
      </ul>
    </div>
  )
}

// ============================================================================ styles

/**
 * This drawing's own rules.
 *
 * styles.css, tokens.css and ui.tsx's stylesheet belong to other agents this phase, so the geometry
 * that is specific to a pipeline lives with the pipeline. React 19 hoists `<style href>` into <head>
 * and de-duplicates by href, so rendering it from every row still produces one element.
 *
 * THE RULE, the same one ui.tsx and ModuleView follow: every colour and every type size below is a
 * token from tokens.css or a local `--pf-*` variable pointed at one. There is no hex and no font
 * size written out, so a theme, a density or a radius preset re-skins all of it.
 *
 * THE ONE BREAKPOINT IS A CONTAINER QUERY, not a media query. This drawing has to work full width at
 * 1440, in a narrow column beside a side rail, and on a 390px phone, and only the container knows
 * which of those it is in. What changes at the breakpoint is WHERE the lane strip sits — beside the
 * step's name or under it — and nothing else: the same elements, the same column template, one
 * component. That is decision 9, and it is why there is no second phone layout in this file.
 */
export const PIPELINE_FLOW_CSS = `
.pf {
  container-type: inline-size;
  /* The drawing measures ITSELF, and the one breakpoint below asks for it by name so that a
     container added around the page cannot answer in its place. */
  container-name: flow;
  display: flex;
  flex-direction: column;
  gap: var(--gut);
  min-width: 0;
  /* Where a node sits inside its row: level with the first line of text, not the middle of a row
     whose height nobody knows. Derived from --pad so a density preset moves it with everything else.
     The first line is the step's title inside its card: 4px of margin, 1px of edge, --pad, and half
     of a --fs-2 line at --lh-tight. */
  --pf-node-y: calc(var(--pad) + 15px);
}

/* ---------------------------------------------------------------- header and counted facts */
.pf-head { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.pf-head-line { display: flex; align-items: baseline; justify-content: space-between; gap: var(--pad) var(--pad-lg); flex-wrap: wrap; }
.pf-title {
  font-size: var(--fs-5);
  font-weight: 600;
  line-height: var(--lh-tight);
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: .16em;
}
.pf-title:hover { color: var(--accent); }
.pf-size { font-size: var(--fs-1); color: var(--text-3); white-space: nowrap; }
.pf-summary { font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text-2); max-width: var(--measure-in-box); }
.pf-counts { display: flex; flex-wrap: wrap; gap: var(--pad); align-items: center; }
.pf-mark-line { display: flex; flex-wrap: wrap; gap: var(--pad); align-items: baseline; }

.pf-fact {
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-2);
  max-width: var(--measure-in-box);
  padding-left: var(--pad-lg);
  border-left: var(--rail) solid var(--border-strong);
}

.pf-nothing {
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-2);
  max-width: var(--measure-in-box);
  padding: var(--pad) var(--pad-lg);
  background: var(--panel-2);
  border-radius: var(--radius-sm);
}

/* ---------------------------------------------------------------- the grid

   Every row is [gutter][body], and every body is [text][lanes]. The column header, the steps and
   the lane footer are all that same shape, which is what keeps the module columns lined up down
   the page without anybody measuring anything. */
.pf-grid { display: flex; flex-direction: column; min-width: 0; }
.pf-steps { list-style: none; margin: 0; padding: 0; min-width: 0; }

.pf-row {
  display: grid;
  grid-template-columns: var(--pf-gutter-w) minmax(0, 1fr);
  align-items: stretch;
  min-width: 0;
}

/* No padding on the body, so the lane cells run edge to edge and their hairlines join up into
   continuous columns down the page. The text cell carries the padding instead. */
.pf-body { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; }
.pf-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: var(--pad) var(--pad-lg) var(--pad) 0;
}

/* EACH STEP IS A CARD (PV-2): a thin edge, no shadow, and no height beyond its own words, so it has
   no empty lower half. Only the text cell is the card. The gutter and the lane cells stay outside
   it, so the dependency lines and the module columns still run unbroken down the page; the cards
   sit 8px apart inside rows that touch. */
.pf-step .pf-text {
  align-self: start;
  margin: 4px var(--pad) 4px 0;
  padding: var(--pad);
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: none;
}
/* A stuck or failed step is edged in its state's colour, 2px so it stands out from the 1px edges
   round it. The chip says the same in words and with its mark, so colour is not the only channel.
   The padding gives back the extra pixel, so the title does not move. */
.pf-step[data-state='failed'] .pf-text { border: 2px solid var(--st-failed-line); padding: calc(var(--pad) - 1px); }
.pf-step[data-state='blocked'] .pf-text { border: 2px solid var(--st-blocked-line); padding: calc(var(--pad) - 1px); }

/* ---------------------------------------------------------------- the dependency gutter */
.pf-gutter {
  position: relative;
  min-width: 0;
  /* A dependency line is CONTENT, so it is inked in text colour rather than in a border colour.
     Drawn at --border-strong it was invisible in both themes at 100%, which is a graph nobody can
     read: the branch was on the page and could not be seen. */
  --pf-line-ink: var(--text-3);
}
.pf-line {
  position: absolute;
  width: 0;
  border-left: 2px solid var(--pf-line-ink);
  transform: translateX(-1px);
}
.pf-line[data-kind='through'] { top: 0; bottom: 0; }
.pf-line[data-kind='enter'] { top: 0; height: var(--pf-node-y); }
.pf-line[data-kind='leave'] { top: var(--pf-node-y); bottom: 0; }
.pf-elbow {
  position: absolute;
  top: var(--pf-node-y);
  height: 0;
  border-top: 2px solid var(--pf-line-ink);
  transform: translateY(-1px);
}
/* A cleared dependency is drawn quieter, not removed: the pipeline still has that shape, and a
   line that disappeared when a step finished would make a finished branch look like no branch. */
.pf-line[data-tone='cleared'],
.pf-elbow[data-tone='cleared'] { --pf-line-ink: var(--border-strong); }

/* THE ORDER ARROW IS THE PAGE'S READING, NOT A LINK. It is lighter and thinner than a stored line,
   because it does not say one step waits on another — it says only where the record put them. The
   dashed edge stays reserved for something nobody wrote down, which this is not. */
.pf-line[data-order='1'],
.pf-elbow[data-order='1'] { --pf-line-ink: var(--text-3); opacity: .7; }

.pf-node {
  position: absolute;
  top: var(--pf-node-y);
  width: 9px;
  height: 9px;
  margin: -5px 0 0 -5px;
  border-radius: var(--radius-pill);
  background: var(--panel);
  border: 2px solid var(--text-2);
}

/* The gate on the line, in the same two shapes the GateMark glyphs use: a bar straight across
   means it stops completely, a bar with a gap in it means work passes through as far as a named
   stage. NOT a dash — a dashed line means "Mole Office worked this out" everywhere in this app, and a
   stored gate is something a person wrote down. */
.pf-gate {
  position: absolute;
  width: 13px;
  height: 3px;
  margin-left: -7px;
  border-radius: 1px;
}
.pf-gate[data-side='above'] { top: calc(var(--pf-node-y) - 10px); }
.pf-gate[data-side='below'] { top: calc(var(--pf-node-y) + 7px); }
.pf-gate[data-gate='hard'] { background: var(--st-blocked); }
.pf-gate[data-gate='partial'] {
  background: linear-gradient(to right, var(--st-todo) 0 32%, transparent 32% 68%, var(--st-todo) 68% 100%);
}
.pf-gate[data-tone='cleared'] { opacity: .4; }

/* WHAT MOVES, written on the line in the look the records graph uses for the words on a link: a
   small pill on the panel, with the agents' own port names in it. It takes no press and it is cut
   with the whole words in its title when the lane is narrow. */
.pf-move {
  position: absolute;
  z-index: 1;
  padding: 1px 6px;
  max-width: calc(var(--pf-gutter-w) - 12px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--panel);
  color: var(--text-2);
  font-size: var(--fs-1);
  line-height: 1.3;
  pointer-events: none;
}

/* ---------------------------------------------------------------- the step */
.pf-step-line { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.pf-step-no { flex: none; font-size: var(--fs-1); color: var(--text-3); font-weight: 700; }
.pf-step-name { flex: 1 1 auto; min-width: 0; font-size: var(--fs-2); font-weight: 700; line-height: var(--lh-tight); color: var(--text); }
/* The state chip and the carried-by count, side by side. The count drops under the chip only
   when the line is too narrow for both. */
.pf-chip-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-width: 0; margin-top: 1px; }
.pf-chip-row > .pf-carried, .pf-chip-row > .pf-nobody { flex: 1 1 12em; min-width: 0; }
.pf-measured {
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  max-width: var(--measure-in-box);
}
.pf-none, .pf-gap, .pf-waits-line {
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
  max-width: var(--measure-in-box);
}
.pf-waits-line { color: var(--text-2); }
.pf-gap { color: var(--text-2); }
.pf-gap code, .pf-need code, .pf-broken-list code, .pf-roster-none code {
  font-family: var(--font-mono);
  font-size: 0.94em;
}

.pf-carried { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--pad); font-size: var(--fs-1); color: var(--text-2); }
.pf-carried-word { font-weight: 600; color: var(--text-3); }
.pf-hung { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--pad); font-size: var(--fs-1); color: var(--text-2); }
.pf-carried-one { display: inline-flex; align-items: baseline; gap: 3px; }
.pf-carried-tag, .pf-roster-tag, .pf-lane-tag {
  font-size: var(--fs-1);
  color: var(--text-3);
  background: var(--panel-2);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 4px;
}
.pf-nobody { font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); max-width: var(--measure-in-box); }
.pf-nobody-word { font-weight: 700; color: var(--text); }

/* ---------------------------------------------------------------- what holds it */
.pf-waits { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pf-needs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.pf-need { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pad); min-width: 0; }
.pf-need-text { font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); }
.pf-need-cleared { color: var(--text-3); }
.pf-elsewhere, .pf-impossible {
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  max-width: var(--measure-in-box);
  padding: 3px var(--pad);
  border-left: var(--rail) solid var(--st-blocked-line);
  background: var(--panel-2);
}
/* A contradiction between two stored words is not an alarm about the work; it is a question about
   the record. It takes the inferred tone, which is the one this app already uses for "Mole Office has
   noticed something nobody has confirmed", and never the alarm colour. */
.pf-impossible { border-left-color: var(--st-inferred-line); background: var(--st-inferred-row); }

/* THE WALL: how far you may go, the bar, and what is on the other side of it. A hard gate has no
   open stretch at all, so the bar sits hard against the left edge and the whole width is beyond it
   -- which is the difference between the two kinds of gate, visible without reading a word. */
.pf-wall {
  display: flex;
  align-items: stretch;
  min-height: 36px;
  margin: 3px 0;
  max-width: var(--measure-in-box);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.pf-wall-open {
  flex: var(--pf-open) 1 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  padding: 3px var(--pad);
  min-width: 0;
  background: var(--panel);
}
.pf-wall-bar { flex: 0 0 auto; width: 7px; }
.pf-wall[data-gate='hard'] .pf-wall-bar { background: var(--st-blocked); }
.pf-wall[data-gate='partial'] .pf-wall-bar {
  background: linear-gradient(to bottom, var(--st-todo) 0 30%, transparent 30% 70%, var(--st-todo) 70% 100%);
}
.pf-wall-beyond {
  flex: 58 1 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  padding: 3px var(--pad);
  min-width: 0;
  background-color: var(--panel-2);
  background-image: repeating-linear-gradient(135deg, var(--panel-3) 0 5px, transparent 5px 11px);
}
.pf-wall-word { font-size: var(--fs-1); font-weight: 700; color: var(--text); line-height: var(--lh-tight); }
.pf-wall-detail { font-size: var(--fs-1); color: var(--text-2); line-height: var(--lh-tight); }

/* ---------------------------------------------------------------- the module lanes */
.pf-lanes {
  display: grid;
  grid-template-columns: var(--pf-lane-cols);
  align-items: stretch;
  min-width: 0;
  /* Only while the strip is on its own line under the name. Beside the name it has to run edge to
     edge, or the hairlines stop joining up into columns. */
  padding-bottom: var(--pad);
}
.pf-cell {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: calc(var(--pad) + 3px);
  border-left: var(--border-w) solid var(--border);
}
.pf-cell:last-child { border-right: var(--border-w) solid var(--border); }
.pf-dot {
  width: 11px;
  height: 11px;
  border-radius: var(--radius-pill);
  background: var(--pf-tone);
}
.pf-band {
  grid-column: 1 / -1;
  align-self: start;
  margin: var(--pad) var(--pad) var(--pad) 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 3px var(--pad);
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  color: var(--text-3);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
}
/* The dashed edge is the ONE place this file spends it, and it is spent on the meaning it has
   everywhere else: nobody said this. A step nobody owns is NOT that -- somebody did say it -- so
   that band is solid, and only the one nobody has filled in is dashed. */
.pf-band[data-kind='unrecorded'] {
  border-style: dashed;
}

.pf-colhead { border-bottom: var(--border-w) solid var(--border-strong); }
.pf-colfoot { border-top: var(--border-w) solid var(--border-strong); }
.pf-colhead-word {
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-3);
}
.pf-lane-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  height: 118px;
  padding-bottom: 4px;
  border-left: var(--border-w) solid var(--border);
  min-width: 0;
}
.pf-lane-head:last-child { border-right: var(--border-w) solid var(--border); }
/* Vertical, so eight module names fit across a phone. text-orientation: mixed is what keeps
   Chinese upright while Latin turns onto its side, which is how vertical CJK is actually set. */
.pf-lane-name {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  overflow: hidden;
  max-height: 92px;
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  color: var(--text-2);
  white-space: nowrap;
}
.pf-lane-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--pad) 0;
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-2);
  border-left: var(--border-w) solid var(--border);
}
.pf-lane-foot:last-child { border-right: var(--border-w) solid var(--border); }

/* ---------------------------------------------------------------- reason, roster, legend */
.pf-reason { margin-top: 2px; }
.pf-reason-where { font-size: var(--fs-1); font-weight: 600; color: var(--text-2); max-width: var(--measure-in-box); }

.pf-roster, .pf-legend, .pf-broken {
  padding: var(--pad-lg);
  background: var(--panel-2);
  border-radius: var(--radius);
  min-width: 0;
}
.pf-broken { background: var(--st-inferred-row); border: var(--border-w) solid var(--st-inferred-line); }
.pf-roster-head, .pf-legend-head {
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: var(--pad);
}
.pf-broken-head {
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
  max-width: var(--measure-in-box);
  margin-bottom: var(--pad);
}
.pf-roster-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.pf-roster-item { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pad); min-width: 0; }
.pf-roster-name { font-size: var(--fs-2); font-weight: 600; color: var(--text); }
.pf-roster-steps { font-size: var(--fs-1); color: var(--text-3); }
.pf-roster-none {
  margin-top: var(--pad);
  padding-top: var(--pad);
  border-top: var(--border-w) solid var(--border-strong);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  max-width: var(--measure-in-box);
}
.pf-broken-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: var(--fs-1);
  color: var(--text-2);
}

.pf-legend-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--pad); }
.pf-legend-list li {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: var(--pad);
  align-items: center;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  max-width: var(--measure-in-box);
}
.pf-legend-art { position: relative; height: 34px; --pf-node-y: 17px; --pf-line-ink: var(--text-3); }

/* ---------------------------------------------------------------- wide enough for lanes beside

   From 720px of CONTAINER width the lane strip sits beside the step's name, which is the drawing
   the design was photographed in. Below that it drops to its own line under the name -- the same
   elements, the same column template and the same left edge, so the columns still line up down the
   page and the matrix is still a matrix on a phone. */
@container flow (min-width: 720px) {
  .pf-body { grid-template-columns: minmax(0, 1fr) var(--pf-lanes-w); }
  .pf-lanes { grid-column: 2; padding-bottom: 0; }
  /* Beside the card, a dot is level with its title, as --pf-node-y puts the gutter's node, and the
     band starts level with the card's words. */
  .pf-cell { padding-top: calc(var(--pad) + 9px); }
  .pf-band { margin-top: calc(var(--pad) + 4px); }
}
`
