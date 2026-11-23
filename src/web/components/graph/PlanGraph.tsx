// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * THE PLANNING GRAPH: what a period is working toward, and which of it is actually allocated.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE QUESTION, AND THE FIVE THINGS THE PICTURE HAS TO KEEP APART
 * ---------------------------------------------------------------------------------------
 *
 *     What goal or deadline am I working toward, what work and future branches lead there,
 *     and which parts are actually allocated?
 *
 * Five things must be distinguishable AT A GLANCE, and each is drawn with a SHAPE and a WORD as
 * well as a colour, because a colour alone dies in greyscale, in a photograph and in one of the two
 * high-contrast themes this app ships:
 *
 *   1. a deadline            double border and a heavier top rail, plus the word on its chip.
 *   2. a future direction    DASHED border all the way round. It is never drawn as work.
 *   3. current adopted work  solid border and its own state word.
 *   4. allocated             a FILLED left rail and a filled ■.
 *   5. unallocated           no rail and a hollow □.
 *
 * 4 and 5 are orthogonal to 1–3 on purpose: a DIRECTION MAY BE ALLOCATED, and such a card is drawn
 * as an allocated DIRECTION. Nothing here promotes it into work.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN AUDIT MEASURED ON THIS DRAWING, AND WHAT EACH NUMBER CHANGED
 * ---------------------------------------------------------------------------------------
 *
 * At 1440x900 the pane was 1,144x760 over a 2,645x980 plane — a third of the drawing, with THREE OF
 * FOURTEEN CARDS fully visible at rest, no fit, no zoom, and native scrollbars for panning. Six
 * measurements, six changes, and every one of them is a change to hierarchy or geometry rather than
 * a sentence explaining the old picture:
 *
 *   THE ONE DEADLINE WAS OFF SCREEN AT REST. The panel is titled "working toward" and the record it
 *   is working toward sat at x=1138 in a 1,144px pane. The origin of a derived layout is not a
 *   meaningful place — it is wherever the solver started — so the pane now opens CENTRED ON THE TOP
 *   ANCHOR (`centreScroll`), and that card is drawn with primacy: a larger title and a lifted box.
 *
 *   IT WAS TWO GRAPHS AND NOTHING SAID SO. ELK packs disconnected components wherever they fit, and
 *   here that put a nine-card deadline cluster above a five-card wave chain with 78px between them
 *   and not one link crossing. 78px of grey reads as a tier, as if the lower half were subordinate.
 *   `connectedComponents` measures the split and each component is drawn as its own BAND with a
 *   heading built from its own records — and the zero is STATED rather than left to be inferred.
 *
 *   A LINEAR CHAIN WAS FIVE FULL-SIZE COLUMNS. 2,062 of the plane's 2,645px was `4B → 5 → 6 → 7 →
 *   8`, five cards each repeating the same pipeline title. `straightRun` finds a band where every
 *   card has at most one line in and one out, all of one type, and it is drawn as ONE ROW OF CHIPS.
 *
 *   THE EDGE LABELS WERE MOST OF THE WIDTH. The layer pitch was 555px, of which about 287px was
 *   room ELK reserved for a measured label. ELK is now handed NO LABELS; the word and the gate
 *   sentence are revealed on hover, on selection, and whenever a card they touch is focused.
 *
 *   SIX LINK TYPES WERE ONE VISUAL. All thirteen stored types now draw as one of three families
 *   from `lines.ts` — sequence, builds toward, related — and the ARROWHEAD comes from
 *   `LINK_TYPES[type].symmetric`, so a symmetric link stops asserting a direction it does not have.
 *
 *   THE CARDS WERE 138–217px TALL ON A 268px WIDTH, eleven of fourteen carrying "not in this
 *   period's plan" — which the hollow □ and the missing rail already said. A canvas card is now a
 *   mark, a title and one state chip. Everything else moved to the detail panel a card opens, where
 *   it is the same words `List` prints.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING STORES A POSITION, AND THIS FILE IS WHERE THAT COULD HAVE BEEN BROKEN
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/presentation.ts` states the three layers and `src/server/lib/presentation.ts` enforces
 * them with a written refusal. The reply this draws holds records, links and allocations, and it
 * carries no x, no y, no size and no colour. Every position here is worked out on every draw and
 * thrown away — including which band a card is in, which is derived from the links themselves.
 *
 * ---------------------------------------------------------------------------------------
 * SIZES ARE MEASURED, NEVER ESTIMATED
 * ---------------------------------------------------------------------------------------
 *
 * Titles in the demonstration corpus include `倒片台安全护罩` and `把 1923 年缺的 12 期列成清单`, and a character
 * count is not a width for either. So every card is rendered once, hidden, measured by the browser,
 * and the measurements are what the solver is given. `PlanCanvasCard` is ONE component rendered in
 * both places — the hidden pass and the canvas — so what was measured and what is drawn cannot come
 * apart. That is not a precaution: it was two renderings once, and a photograph found a line label
 * drawn straight across the card next door.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE CARDS ARE GROUPED
 * ---------------------------------------------------------------------------------------
 *
 * One named horizontal band per connected group of cards, stacked, laid out left to right inside
 * each by ELK's layered algorithm. The reading direction is explicit and the drawing is wide.
 *
 * A second grouping was built beside it for a while — the same groups as tinted regions packed side
 * by side, with no reading direction — so the owner could compare the two against the real corpus.
 * The bands were chosen and the other was deleted.
 *
 * THE DRAWING IS HANDED ITS FACTS. `PlanGraphView` fetches, builds the model, measures the cards and
 * holds the selection; the canvas receives `PlanCanvasProps` and arranges what it is given. Nothing
 * the canvas draws is counted, sorted or decided inside it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * Not the pipeline execution graph, not the module evolution graph, and NOT A GANTT CHART: there is
 * no time axis, no bar and no length, and nothing here compares a date to a clock. `due` is printed
 * as stored. The arithmetic on deadlines belongs to `src/shared/deadlines.ts` and this file does not
 * import it.
 *
 * ---------------------------------------------------------------------------------------
 * TWO COMPOSITIONS, CHOSEN BY WIDTH
 * ---------------------------------------------------------------------------------------
 *
 * At 390px the LIST is what you get: a phone holds about two cards at a readable size. On a desk the
 * drawing is the default and the list is one press away. NEITHER IS A SUBSET OF THE OTHER. A drawing
 * with NO LINES IN IT gets the list at every width, and pressing `Graph` there says why instead of
 * drawing a single column of fifteen cards, which is a list drawn badly.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { periodSaid } from '../Planning.tsx'
import { kindWord, stateWord, linkWord } from '../../lib/words.ts'
import { LINK_TYPES } from '@shared/types.ts'
import { parsePeriod, type Allocation } from '@shared/planning.ts'
import { api, errorMessage, moleOfficeRequest } from '../../api.ts'
import { useInspect } from '../../lib/mode.ts'
import { WORKSPACE_HEADER } from '../../lib/workspace.ts'
import { InReachMark, useReach } from '../InReach.tsx'
import { aRequestSettled, aRequestStarted } from '../../lib/ready.ts'
// THE ONE FUNCTION IN THE BROWSER THAT NAMES A PROJECT. This panel printed the stored id twice —
// "project: unassigned" over the plane, and a bare id on every row of work in another project —
// while the rest of the product printed the title.
//
// IT NEEDS THE STORED TITLE TO DO ITS JOB, and only the server has one. The line over the plane gets
// `reply.workspaceTitle` and reads "Mole Office" where it used to read "panelx". The rows below it name
// OTHER projects, whose titles this reply deliberately does not carry — reading them would mean
// reading a project the caller did not ask about. So the panel reads the project REGISTRY, which is
// a list of names and counts and holds no project's records, and hands the titles down. Until that
// list arrives, normal mode uses the short mark for the missing name.
import { planProjectName as projectName } from '../plans/PlanWords.ts'
import { navigate, recordPath } from '../router.tsx'
import {
  Absence,
  DepthLadder,
  ErrorNote,
  gateWordsForReader,
  Hint,
  Loading,
  Panel,
  ServerNote,
  StoredState,
  Tag,
  useNarrow,
} from '../ui.tsx'
import { useProjectAsync } from '../../lib/project-async.ts'
import { stageInThePlan } from '../../lib/gate-stage.ts'
import { progressOf } from '@shared/work.ts'
import {
  CANVAS_PAD,
  MAX_ZOOM,
  MIN_ZOOM,
  READABLE_FLOOR,
  READING_ZOOM,
  boxHeightFor,
  centreScroll,
  connectedComponents,
  crossingCount,
  directionFor,
  fitWithinReading,
  layoutGraph,
  roundedPath,
  straightRun,
  type EdgeRoute,
  type Placement,
  type Size,
  type StraightRun,
} from './layout.ts'
import { LINE_FAMILY_STYLE, LINK_FAMILIES, linkFamilyOf, type LinkFamily } from './lines.ts'
// THE SHARED DRAWING. Everything below this line that draws a card, lays one out, or offers a
// control over the drawing is the module drawing's own implementation, configured for this place.
// Criterion D10 of design/drawings/ACCEPTANCE.md: one graph used
// everywhere, differing in its default configuration and not in its implementation.
import { CardFace, markAttributes, type CardData } from './CardFace.tsx'
import {
  NOTHING_PRESSED,
  NO_FOCUS,
  WIDTH_AT_SIZE,
  SIZE_A_CARD_STARTS_AT,
  type SizeWord,
  neighboursOf,
  planCanvas,
  planFor,
  DRAWING_WORDS,
  type CanvasFocus,
  type CanvasPlan,
  type CardChoice,
  type CardPlan,
} from './card.ts'
import { cardsHere, setCardHere, subscribeToCards } from './cardhere.ts'
import { useDetail } from '../../lib/detailchoice.ts'
import type { Rung } from '@shared/detail.ts'
import { declaredAttributes } from '../declares.ts'
import { DrawingControl, DrawingControls, sameZoom } from './controls.tsx'
import { buildStructureGraph, placeOf, scopeKey, type GraphNode, type StructureGraph } from './model.ts'
import type { PlanGraphEdge, PlanGraphNode, PlanGraphReply } from '../../../server/api/plan-graph.ts'
// THE ONE STATEMENT OF WHETHER A THING HAS HAPPENED. The canvas asks it about every card it draws
// a line between; see `familyOfEdge`.
import { worldOf, type World } from '@shared/world.ts'
// THE ONE READER OF AN AGENT'S MARK ON A GOAL. `goalIsConfirmed` is the same function the horizons
// page reads to draw "An agent filed this goal. The person has not confirmed it yet." — a goal with
// no `filed_by` is the person's, and one with a `confirmed_by` has been pressed. Criterion P1.
import { goalIsConfirmed } from '@shared/horizons.ts'

/**
 * How wide a card is drawn AT REST, and what its own size steps scale from.
 *
 * A FIXED WIDTH AND A MEASURED HEIGHT. The height is whatever the words need once they have wrapped
 * at this width, and it is read off the rendered element — the only way a card holding
 * `把 1923 年缺的 12 期列成清单` gets a height that is right. The width is fixed because a
 * layered layout puts cards in columns, and columns of different widths look broken.
 *
 * AT REST MEANS: at the size the drawing gives a card nobody has pressed. `WIDTH_AT_SIZE` is a
 * SHARE of a base width, and the share a card starts at is below one — so multiplying this by it
 * would have drawn every plan card at 214px, where the drawing has drawn them at 268 since it was
 * built. `widthOfPlanCard` divides the starting share back out, so a card nobody has touched is
 * exactly this wide and its own size controls scale from there.
 */
const CARD_WIDTH = 268

/**
 * How wide one plan card is at the size it is at. The share is the shared table's; the base is this
 * drawing's own, which is the whole of what "the same card, configured" means for a width.
 */
function widthOfPlanCard(room: number, says: Rung): number {
  return Math.round((CARD_WIDTH * room) / WIDTH_AT_SIZE[SIZE_A_CARD_STARTS_AT[says]])
}

/** Room between one band and the next, and between a band's edge and its cards. */
const BAND_GAP = 16

export interface PlanGraphProps {
  /** The period to draw: `2026-09`, `2026-W36` or `2026-09-07`. The horizon is read from it. */
  period: string
  /**
   * Which project's drawing, when the page chose one other than the switcher's (the Goals page reads
   * across projects). Sent as the project header. Left out, the switcher's project, as always.
   */
  project?: string
}

export function PlanGraph({ period, project }: PlanGraphProps) {
  const parsed = parsePeriod(period)
  const [state, readAgain] = useProjectAsync(() => {
    if (parsed === null) {
      // Refused here rather than sent, so a typed address fails where the sentence can name the
      // three shapes rather than as a 400 from a route the reader never asked for.
      return Promise.reject(
        new Error(t('g8.graph.isNotAPeriodAMonthIsAWeek', { value1: period })),
      )
    }
    return moleOfficeRequest<PlanGraphReply>(
      `/api/plan-graph/${parsed.horizon}/${period}`,
      project === undefined ? {} : { headers: { [WORKSPACE_HEADER]: project } },
    )
  }, [period, project])

  // WHICH PROJECTS THIS INSTALLATION HOLDS, so the rows naming work in another project can name it
  // the way every other screen does. See the note on the `projectName` import: the drawing's own
  // reply carries one title, for the one project it drew, and must not carry the others.
  //
  // A failure here is not reported on the page and that is deliberate: the panel's subject is the
  // drawing, this list only spells names on a side list, and an error box about the project
  // registry over a drawing that arrived would be a fault about the wrong thing. What it costs is
  // an id where a title would have been, which is what the list says when it has not arrived.
  const [projects] = useProjectAsync(() => api.listWorkspaces(), [])

  return (
    <div className="pg">
      <style href="mole-office-plan-graph" precedence="default">
        {PLAN_GRAPH_CSS}
      </style>
      {state.status === 'loading' ? (
        <Loading label={t('g8.graph.readingWhatThisPeriodIsWorkingToward')} what={t('g8.graph.thePlanGraph')} rows={2} />
      ) : state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} label={t('g8.graph.thePlanGraphCouldNotBeRead')} retry={readAgain} />
      ) : (
        <PlanGraphView
          reply={state.value}
          projectTitles={projects.status === 'ready' ? projects.value.workspaces : null}
        />
      )}
    </div>
  )
}

// ============================================================================ the model

/**
 * One band: a set of cards that are actually joined to each other, and what to call it.
 *
 * A BAND IS DERIVED, NOT STORED, and it is derived from the one thing that decides whether two cards
 * belong in one picture: whether any stored link joins them. `connectedComponents` does the work and
 * everything here is naming and counting what came back.
 */
export interface PlanBand {
  /** Stable across draws: the first record in the component, in the server's own node order. */
  key: string
  nodes: PlanGraphNode[]
  edges: PlanGraphEdge[]
  /** The card the band is named after, or null when nothing in it is an anchor or allocated. */
  anchor: PlanGraphNode | null
  /** What the band is called, built from its own records. Never a template with a number in it. */
  heading: string
  allocated: number
  /** Set when every card is one straight run of one link type — drawn as a row of chips. */
  run: StraightRun | null
  /** How many stored lines join this band to anything else on the drawing. Zero by construction. */
  crossings: number
  /** True when it starts folded: nothing in it is allocated and it does not hold the top anchor. */
  foldedAtRest: boolean
}

export interface PlanModel {
  bands: PlanBand[]
  /** The record this whole panel is working toward: the first goal, else the first deadline, else allocated work. */
  topAnchorId: string | null
  goals: number
  deadlines: number
  directions: number
  allocated: number
  cards: number
  /** Link types on this drawing that `lines.ts` does not classify. Drawn plainly and said out loud. */
  unclassified: string[]
}

/**
 * THE ONE RECORD THE PANEL IS ABOUT.
 *
 * The panel is titled "What this period is working toward", so the answer is a GOAL when there is
 * one — criterion P1 makes the plan graph start from goals, and a goal is what the work below it is
 * for. Failing a goal it is a deadline, because an obligation is the only kind here that means
 * somebody outside is waiting. Failing that it is what the period actually gives time to, because a
 * period with no deadline is still working toward the work it has planned. Failing both there is no
 * answer and this returns null rather than picking the first card, which would put primacy on
 * whatever the server happened to list first.
 */
function topAnchorOf(nodes: readonly PlanGraphNode[]): string | null {
  const goal = nodes.find((node) => node.role === 'goal')
  if (goal !== undefined) return goal.recordId
  const deadline = nodes.find((node) => node.role === 'deadline')
  if (deadline !== undefined) return deadline.recordId
  const allocated = nodes.find((node) => node.allocations.length > 0)
  if (allocated !== undefined) return allocated.recordId
  const direction = nodes.find((node) => node.role === 'direction')
  return direction?.recordId ?? null
}

/** What one band is called, and the sentence saying where the name came from. */
function nameBand(nodes: readonly PlanGraphNode[]): { heading: string } {
  const goal = nodes.find((node) => node.role === 'goal')
  if (goal !== undefined) {
    return {
      heading: t('g8.graph.goal', { value1: goal.name }),
    }
  }
  const deadline = nodes.find((node) => node.role === 'deadline')
  if (deadline !== undefined) {
    return {
      heading: t('g8.graph.toward', { value1: deadline.name }),
    }
  }
  const direction = nodes.find((node) => node.role === 'direction')
  if (direction !== undefined) {
    return {
      heading: t('g8.graph.exploring', { value1: direction.name }),
    }
  }
  // THE REPEATED LINE, HOISTED. Five wave cards each printed "in Mole Office development campaign — waves
  // 4A to 9, from 2026-08-12" and the five of them are one band. The pipeline title said once, at the
  // top, is the same fact taking a twentieth of the room and naming the band while it is there.
  const within = nodes[0]?.within ?? null
  if (within !== null && nodes.every((node) => node.within === within)) {
    return {
      heading: within,
    }
  }
  const first = nodes[0]
  return {
    heading: first === undefined ? t('g8.graph.unnamedGroup') : first.name,
  }
}

/**
 * Everything the picture is built from, worked out ONCE and handed to the drawing.
 *
 * Nothing downstream counts its own bands. A drawing that did could report a different number of
 * cards from the summary line above it, on the same data, with nothing failing.
 */
export function planModel(reply: PlanGraphReply): PlanModel {
  const ids = reply.nodes.map((node) => node.recordId)
  const byId = new Map(reply.nodes.map((node) => [node.recordId, node]))
  const groups = connectedComponents(ids, reply.edges)
  const topAnchorId = topAnchorOf(reply.nodes)

  const bands: PlanBand[] = groups.map((group) => {
    const held = new Set(group)
    const nodes = group.map((id) => byId.get(id) as PlanGraphNode)
    const edges = reply.edges.filter((edge) => held.has(edge.from) && held.has(edge.to))
    const allocated = nodes.filter((node) => node.allocations.length > 0).length
    const anchor =
      nodes.find((node) => node.role === 'goal') ??
      nodes.find((node) => node.role === 'deadline') ??
      nodes.find((node) => node.role === 'direction') ??
      nodes.find((node) => node.allocations.length > 0) ??
      null
    const holdsTop = topAnchorId !== null && held.has(topAnchorId)
    return {
      key: group[0] as string,
      nodes,
      edges,
      anchor,
      ...nameBand(nodes),
      allocated,
      run: straightRun(group, edges),
      // Stated rather than asserted. It is zero for a component by construction, and printing the
      // count of the array the picture is drawn from is what stops the claim and the picture parting.
      crossings: crossingCount(groups, reply.edges),
      /**
       * FOLDED AT REST WHEN THIS PERIOD GIVES IT NOTHING — WITH ONE EXCEPTION THAT IS NOT OPTIONAL.
       *
       * A band the plan does not touch is a true and quiet answer, and folding it puts the period's
       * actual work at the top of a short page. But the band holding the TOP ANCHOR is the subject
       * of the panel's own title, and on the live corpus that band is exactly the one with no hours
       * in it: folding it would open "What this period is working toward" with the thing it is
       * working toward hidden behind a press. So the exception is stated here rather than being an
       * accident of the ordering.
       */
      foldedAtRest: allocated === 0 && !holdsTop,
    }
  })

  // The band holding the subject of the panel goes first. Everything else keeps the server's order.
  const holdsTop = (band: PlanBand): boolean =>
    topAnchorId !== null && band.nodes.some((node) => node.recordId === topAnchorId)
  bands.sort((a, b) => Number(holdsTop(b)) - Number(holdsTop(a)))

  const seen = [...new Set(reply.edges.map((edge) => edge.type))]
  return {
    bands,
    topAnchorId,
    goals: reply.nodes.filter((node) => node.role === 'goal').length,
    deadlines: reply.nodes.filter((node) => node.role === 'deadline').length,
    directions: reply.nodes.filter((node) => node.role === 'direction').length,
    allocated: reply.nodes.filter((node) => node.allocations.length > 0).length,
    cards: reply.nodes.length,
    // ASKED OF THE TABLE ALONE, ON PURPOSE, AND NOT OF `familyOfEdge` BELOW. The question here is
    // which link TYPES nobody has classified, so that a fourteenth type fails loudly instead of
    // being drawn plainly. Two intentions joined by an unclassified type do get a family from
    // their ends — see `familyOfEdge` — and that must not take the type off this list, because the
    // type is still unclassified for every other pair it could join.
    unclassified: seen.filter((type) => linkFamilyOf(type) === null),
  }
}

/**
 * Which world each card is in, by record id.
 *
 * `worldOf` is the ONE statement of whether a thing has happened, and it is derived from the kind.
 * The kind is on every card the server sends, so nothing here stores, guesses or asks for a world.
 */
export function worldsIn(nodes: readonly PlanGraphNode[]): ReadonlyMap<string, World> {
  return new Map(nodes.map((node) => [node.recordId, worldOf(node.kind)]))
}

/**
 * THE FAMILY ONE LINE IS DRAWN AS, ASKED WITH BOTH OF ITS ENDS.
 *
 * `linkFamilyOf` has taken the ends since the intent family was built, and until now nothing passed
 * them: both call sites asked with the type alone. So `trj2 supersedes trj1` was drawn as `builds`,
 * whose key reads **leads to** — backwards, and in the language of things that happened, on a
 * relation between two intentions. That is verbatim the fault the argument exists to prevent.
 *
 * A CARD THIS BAND DOES NOT HOLD LEAVES THE ENDS OUT rather than being guessed at. A band is a
 * connected component so it does not happen, and if it ever did, the honest answer is the table's
 * — not a world invented for a card nobody drew.
 */
export function familyOfEdge(
  edge: Pick<PlanGraphEdge, 'type' | 'from' | 'to'>,
  worlds: ReadonlyMap<string, World>,
): LinkFamily | null {
  const from = worlds.get(edge.from)
  const to = worlds.get(edge.to)
  if (from === undefined || to === undefined) return linkFamilyOf(edge.type)
  return linkFamilyOf(edge.type, { from, to })
}

// ============================================================================ the shell

export function PlanGraphView({
  reply,
  projectTitles,
}: {
  reply: PlanGraphReply
  /**
   * Every project this installation holds, with its title, from `GET /api/plan-graph`'s neighbour
   * `GET /api/workspaces`. Null until it arrives, and null in a test that draws this on its own.
   *
   * It is only ever read for a name. Nothing here counts these, filters by them or draws one.
   */
  projectTitles?: readonly { id: string; title: string }[] | null
}) {
  const narrow = useNarrow()
  const inspect = useInspect()
  const model = useMemo(() => planModel(reply), [reply])
  /**
   * THE DRAWING, BUILT BY THE SHARED MODEL. `buildStructureGraph` picks the plan place out of
   * `DRAWING_PLACES` and `buildPlanScope` turns the route's reply into the same `StructureGraph`
   * the module and pipeline drawings are built into. Everything below that draws a card, lays one
   * out or offers a control reads this.
   */
  const graph = useMemo(
    () => buildStructureGraph({ scope: { at: 'plan', period: reply.period }, now: Date.now(), plan: reply }),
    [reply],
  )
  const titleOf = (id: string): string | null =>
    (projectTitles ?? []).find((w) => w.id === id)?.title ?? null

  // What a reader asked for, when they have asked. Null means "whatever this width and this
  // drawing are for".
  const [asked, setAsked] = useState<'canvas' | 'list' | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    setSelected(null)
    setFolded(new Set(model.bands.filter((band) => band.foldedAtRest).map((band) => band.key)))
  }, [model])

  /**
   * HOW MUCH THIS DRAWING SAYS, from the same setting every other surface in this product reads.
   *
   * `rungFor('graph', …)` through `useDetail`, exactly as `Canvas.tsx` asks it, so the row on the
   * settings page moves this drawing too. What this place ASKS FOR is its own row of
   * `DRAWING_PLACES` — criterion D14, where a place's opening level lives now that no control over
   * a drawing sets it. It was hard-wired here and again in Canvas.tsx, which the third verification
   * named as one fact in two places.
   */
  const detail = useDetail('graph', null, placeOf(graph.scope).opensAt)
  const says = detail.rung
  /** Which drawing a reader's per-card presses are kept under. The place's own key. */
  const drawing = scopeKey(graph.scope)
  const [presses, setPresses] = useState(0)
  useEffect(() => subscribeToCards(() => setPresses((count) => count + 1)), [])
  const recordIds = useMemo(() => graph.nodes.map((node) => node.recordId), [graph])
  const chosen = useMemo(
    // `presses` is read for its value CHANGING and not for its value: a press writes the store and
    // this is what asks the store again. The same shape `Canvas.tsx` uses.
    () => cardsHere(drawing, recordIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawing, recordIds, presses],
  )
  const chosenByNode = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, chosen.get(node.recordId) ?? NOTHING_PRESSED])),
    [graph, chosen],
  )
  /**
   * WHICH CARD IS FOCUSED, in the shared drawing's own words.
   *
   * Focus is one of the owner's four states and it is one step of card size, which is what makes
   * pressing a card reveal more. `neighboursOf` is the shared reader for what a selection reaches.
   */
  const focus: CanvasFocus = useMemo(() => {
    if (selected === null) return NO_FOCUS
    const picked = new Set([`plan:${selected}`])
    return { selected: picked, neighbours: neighboursOf(graph, picked) }
  }, [graph, selected])
  /** What every card on this drawing was given: its level, its size, its tier. Worked out once. */
  const cardPlan: CanvasPlan = useMemo(
    () => planCanvas(graph, says, focus, chosenByNode),
    [graph, says, focus, chosenByNode],
  )
  const choose = useCallback((recordId: string, choice: CardChoice) => setCardHere(drawing, recordId, choice), [drawing])
  const openRecord = useCallback((recordId: string) => navigate(recordPath(recordId)), [])
  const flow = directionFor(graph)
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.recordId, node])), [graph])
  /**
   * EVERYTHING ONE CARD NEEDS, built here and never in the card.
   *
   * `restriction` and `here` are null and empty because this drawing is not given either read — the
   * plan route serves nodes, not the project's restrictions or who is on each record. A card cannot
   * draw "nobody looked" in a shape, so it draws nothing, exactly as a card does on the other two
   * drawings while their reads are in flight.
   */
  const cardFor = useCallback(
    (node: PlanGraphNode): CardData => {
      const drawn = nodeById.get(node.recordId)
      if (drawn === undefined) {
        throw new Error(t('g8.graph.thePlanDrawingHasNoCardForWhichThe', { value1: node.recordId }))
      }
      return {
        node: drawn,
        onOpen: openRecord,
        flow,
        lit: false,
        restriction: null,
        here: [],
        says,
        plan: planFor(cardPlan, drawn.id),
        choice: chosenByNode.get(drawn.id) ?? NOTHING_PRESSED,
        onChoose: (choice: CardChoice) => choose(drawn.recordId, choice),
        // A PRESS ON THE NAME FOCUSES THE CARD HERE, and that is what this drawing has always
        // done: the record opens from the panel the focus draws underneath, which prints every
        // field the card leaves off. `PlanCanvasCard` puts the focus handler in place of `onOpen`.
        opens: t('g8.graph.focusThisCardItsRecordOpensFromThePanel'),
      }
    },
    [nodeById, openRecord, flow, says, cardPlan, chosenByNode, choose],
  )
  /**
   * What the cards are drawn at right now, in one string. See `useMeasuredCards`.
   *
   * THE TIER IS IN IT because the card the reader pressed draws its own controls as a row inside it
   * on this drawing, which makes it taller. Without the tier, a press on a card whose level was set
   * by hand changed nothing here, the cards were not measured again, and the pressed card ran past
   * the bottom of its group.
   */
  const drawnAt = useMemo(
    () =>
      [...cardPlan.cards.entries()]
        .map(([id, one]) => `${id}:${one.room?.toFixed(3) ?? '?'}:${one.level ?? '?'}:${one.rung}:${one.tier}`)
        .join(','),
    [cardPlan],
  )
  const sizes = useMeasuredCards(reply.nodes, cardFor, says, drawnAt)

  /**
   * A DRAWING WITH NO LINES IS A LIST DRAWN BADLY, and it is measured rather than assumed.
   *
   * Photographed on the real corpus: the `unassigned` project holds eleven directions and four
   * obligations with not one stored link between them, so a layered layout stacked fifteen cards in
   * ONE COLUMN. So the reading layer is what a reader lands on when there is nothing to join, and
   * pressing `Graph` says why rather than drawing the column. NOTHING IS DROPPED: every card is on
   * the page either way, and a deadline nothing leads to is an answer this graph exists to give.
   */
  const nothingJoined = reply.edges.length === 0
  /**
   * WHY THERE IS NO SHAPE TO DRAW, READ FROM THE PLACE THAT SAYS IT.
   *
   * Two things say it: the words where the drawing would be, and the reason `Graph` is not
   * available. Both read this, and this is `DRAWING_PLACES.plan`'s own sentence, written beside the
   * rule that empties the drawing — the arrangement the module drawing already has.
   */
  const noShapeToDraw = placeOf(graph.scope).nothingToDraw(reply.nodes.length).short
  const showing = asked ?? (narrow || nothingJoined ? 'list' : 'canvas')

  const toggleBand = useCallback((key: string) => {
    setFolded((was) => {
      const next = new Set(was)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const elsewhereRows = reply.elsewhere.reduce((total, row) => total + row.allocations.length, 0)
  const omittedTotal = reply.omitted.reduce((total, entry) => total + entry.count, 0)
  const pressedNode = selected === null ? null : (reply.nodes.find((node) => node.recordId === selected) ?? null)

  // THE ONE OBJECT THE CANVAS GETS. Built here and spread in, so nothing below this line reaches
  // past it for a fact of its own.
  const canvasProps: PlanCanvasProps = {
    reply,
    graph,
    model,
    cardFor,
    sizes,
    selected,
    onSelect: setSelected,
    hoveredEdge,
    onHoverEdge: setHoveredEdge,
    folded,
    onToggleBand: toggleBand,
    inspect,
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'plan.toward' }}
      title={t('g8.graph.whatThisPeriodIsWorkingToward')}
      actions={
        <>
          <Tag tone="quiet" title={t('g8.graph.everyRecordHereIsDrawnNothingIsLeftOut')}>
            {reply.nodes.length === 1 ? t('g8.graph.record') : t('g8.graph.records', { value1: reply.nodes.length })}
          </Tag>
          <Tag
            tone={model.allocated === 0 ? 'warn' : 'accent'}
            title={t('g8.graph.recordsThisPeriodGivesTimeToTheRestAre')}
          >{t('g8.graph.onThePlan', { value1: model.allocated })}</Tag>
        </>
      }
    >
      {/* THE ANSWER AS COUNTS. It was 134px of server prose above the drawing, restating counts the
          tags beside the title already carried. Every count is a `.length` of an array on the reply,
          so the row and the picture cannot say different numbers; the paragraph that says the same
          thing at length is behind inspect, and it is the whole answer when there is nothing to
          draw, which is why an empty drawing still prints it. */}
      {inspect ? <ServerNote text={reply.note} /> : reply.nodes.length === 0 ? <Absence title={t('g8.graph.nothingDrawn')} /> : null}

      {/* THE SUMMARY, MARKED AS ONE. Owner, on this row: *"we could place them in a grey block like
          the '>' render in markdown"*. `px-sum` is that block — grey ground, a left rule, the word
          `Sum` — and it is defined once in pages/PlanPage.tsx so every summary in the product can
          wear it. A summary that looks like content is read as content; this reads as an aside.

          THE PERIOD WAS SAID THREE TIMES ABOVE THE DRAWING — in the page's own title, in the
          server's paragraph and here. What is left is the pair a reader cannot get anywhere else on
          this panel: which days it covers, and which project was drawn. A plan is person-level and
          spans projects; a structure is workspace-owned, so saying which one is on the plane is what
          stops this looking like the whole plan when it is one project's share of it. */}
      <div className="px-sum">
        {reply.nodes.length === 0 ? null : (
          <p className="px-sum-line" aria-label={t('g8.graph.whatIsOnThisDrawing')}>
            <span className="px-sum-key">{t('g8.graph.sum')}</span>
            <b className="num">{model.goals}</b> {model.goals === 1 ? t('g8.graph.goalAt708') : t('g8.graph.goals')} ·{' '}
            <b className="num">{model.deadlines}</b> {model.deadlines === 1 ? t('g8.graph.deadline') : t('g8.graph.deadlines')} ·{' '}
            <b className="num">{model.directions}</b> {model.directions === 1 ? t('g8.graph.direction') : t('g8.graph.directions')} ·{' '}
            <b className="num">{model.allocated}</b> {t('g8.graph.of')}<b className="num">{model.cards}</b> {t('g8.graph.onThePlanAt711')}{model.bands.length < 2 ? null : (
              <span title={t('g8.graph.noLineJoinsOneGroupToAnotherTheyAre')}>
                {' '}
                · <b className="num">{model.bands.length}</b> {t('g8.graph.groups')}</span>
            )}
          </p>
        )}
        <p className="pg-where">
          <span>
            {reply.from}
            {reply.from === reply.to ? '' : t('g8.graph.to', { value1: reply.to })}
          </span>
          {/* WHAT IS ON THE PLANE, NOT WHAT THE PANEL READ. This said "project: greenhouse", which a
              reader takes as "this panel is about one project" — and the page's own chip four
              inches above says the plan covers all of them, so the two read as a contradiction.
              Both are true of different things: the plan's hours are person-level and span every
              project, and the DRAWING is one project's records and links. This line is about the
              drawing, so it says so, and the block below names the work it did not draw. */}
          <span className="pg-ws">{t('g8.graph.onlyIsDrawn', { value1: projectName(reply.workspaceId, reply.workspaceTitle) })}</span>
          {inspect ? <span className="pg-ws">{reply.period}</span> : null}
        </p>
      </div>

      {reply.nodes.length === 0 ? null : (
        <>
          {/* THE SAME RULE AS THE ZOOM BAR AND AS THE OTHER TWO DRAWINGS: a press that would change
              nothing is drawn as not available with the reason beside it. Pressing `Graph` while
              the drawing is already showing was a press that changed zero pixels and said nothing.
              There is no drawing to switch to when nothing here is linked to anything, and that is a
              missing prerequisite rather than a state already reached, so it is said in those
              words. */}
          <DrawingControls>
          <div className="pg-switch">
            <DrawingControl
              look="button"
              variant={showing === 'canvas' ? 'primary' : 'secondary'}
              now={showing}
              after={'canvas' as 'canvas' | 'list'}
              reason={t('g8.graph.theDrawingIsAlreadyShowing')}
              {...(nothingJoined ? { unavailable: noShapeToDraw } : {})}
              onPress={() => setAsked('canvas')}
              title={t('g8.graph.boxesAndLinesEveryPositionIsWorkedOutOn')}
            >
              {DRAWING_WORDS.graph}
            </DrawingControl>
            <DrawingControl
              look="button"
              variant={showing === 'list' ? 'primary' : 'secondary'}
              now={showing}
              after={'list' as 'canvas' | 'list'}
              reason={t('g8.graph.theWrittenOutListIsAlreadyShowing')}
              onPress={() => setAsked('list')}
              title={t('g8.graph.everyRecordInTheDrawingWrittenOutWithIts')}
            >
              {DRAWING_WORDS.list}
            </DrawingControl>
          </div>
          </DrawingControls>

          {/* THE HIDDEN BOXES THAT GET MEASURED, RENDERED WHATEVER IS SHOWING.
              A DEFECT FOUND BY PRESSING THE BUTTON. They used to be rendered by the two drawing
              arrangements, so on a phone — where the written-out list is what you land on — nothing
              was on the page to measure when the measuring ran. Pressing Graph then mounted them
              too late: the measurement does not run again, so the drawing refused itself and said
              "14 boxes were never drawn" over an empty pane. Photographed at 390.
              They are off to the side and invisible, and rendering them always costs one hidden
              copy of a list the reading layer is already printing in full. */}
          {/* THE RACK RENDERS THE SAME CARD, so it renders that card's own controls too, and a
              control has to have somewhere to say why a press did nothing even when nobody can
              press it — `DrawingControl` throws rather than swallowing a refusal it cannot draw.
              Nothing is ever refused in here: the rack is off to the side and aria-hidden. */}
          <DrawingControls>{sizes.rack}</DrawingControls>

          {showing === 'list' ? (
            <>
              {/* THE KEY RIDES THE DRAWING. On the canvas it is a boxed legend in the corner of the
                  pane — see `PlanPane` — and here, where there is no pane, it is the same component
                  in ordinary flow above the cards it explains. */}
              <Legend />
              <PlanList reply={reply} />
            </>
          ) : nothingJoined ? (
            <p className="pg-nothing-joined">
              <b>{noShapeToDraw}</b> {t('g8.graph.everyOneIsPrintedUnder')}<b>{DRAWING_WORDS.list}</b> {t('g8.graph.aDeadlineNothingLeadsToIsAnAnswerNot')}</p>
          ) : (
            <PlanLayers {...canvasProps} />
          )}

          {showing === 'canvas' && pressedNode !== null ? (
            // ITS OWN ROW OF CONTROLS AND ITS OWN LINE UNDER THEM. The panel is not part of the
            // drawing above it, so a refusal from its Close would have nowhere honest to go if it
            // reported into the drawing's line.
            <DrawingControls>
              <PlanDetail node={pressedNode} reply={reply} onClose={() => setSelected(null)} inspect={inspect} />
            </DrawingControls>
          ) : null}
        </>
      )}

      {/* WHAT THE PLAN NAMES THAT THIS PROJECT DOES NOT HOLD. Named and counted, never drawn — see
          the route's header. A reader who wants the picture switches project, and this says so. */}
      {reply.elsewhere.length === 0 ? null : (
        <div className="pg-elsewhere">
          {/* THREE CLAUSES CUT TO ONE. The justification — a plan spans projects, a drawing cannot,
              and reading one to draw it is the thing a planning allocation must never become — is a
              genuinely novel rule rather than a description of the interface, so it is behind the
              mark rather than deleted or read past. */}
          {/* A div and not a p, because Hint renders a details element and a details may not sit
              inside a paragraph — the browser closes the paragraph early, so the markup React
              renders on the server and the markup the browser builds are different shapes. The rule
              gained an explicit margin at the same time, because a p carries one by default and a
              div does not, and nothing in this app resets it. */}
          <div className="pg-elsewhere-head">
            {t('g8.graph.thisPeriodAlsoGivesTimeTo')}<b className="num">{elsewhereRows}</b>{' '}
            {elsewhereRows === 1 ? t('g8.graph.piece') : t('g8.graph.pieces')} {t('g8.graph.ofWorkInAnotherProjectNamedHereNotDrawn')}<Hint label={t('g8.graph.whyWorkInAnotherProjectIsNamedAndNot')}>{t('g8.graph.aPlanBelongsToAPersonAndCoversEvery')}</Hint>
          </div>
          <ul className="pg-elsewhere-list">
            {reply.elsewhere.map((row) => (
              <li key={row.recordId}>
                {row.gone ? (
                  <span className="pg-gone">{t('g8.graph.theRecordThisAllocationNamesIsGone', { value1: !inspect && row.name === row.recordId ? t('absence.mark') : row.name })}</span>
                ) : (
                  <a className="px-nav" href={`#${recordPath(row.recordId)}`}>
                    {row.name}
                  </a>
                )}
                <span className="pg-elsewhere-ws">{projectName(row.workspaceId, titleOf(row.workspaceId))}</span>
                <span className="pg-elsewhere-hours">{row.allocations.map(allocationWords).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* WHAT IS LEFT OUT, AND WHY IT IS NOT BEHIND INSPECT WITH THE REST OF THE DIAGNOSTICS.
          `CLAUDE.md`'s fifth rule outranks the density test: a number that could not count everything
          still says so, and the audit that asked for this list to move called it a diagnostic. It is
          not one — it is the difference between "nothing else is there" and "nobody drew the rest".
          So the COUNT is first-glance, one line, and the five reasons are one press away. In inspect
          it stands open, because that is the mode where the reasons are what you came for. */}
      {reply.omitted.length === 0 ? (
        <p className="pg-omitted-none"><Absence title={t('g8.graph.nothingIsLeftOutOfThisDrawing')} /></p>
      ) : (
        <div className="pg-omitted-all" {...declaredAttributes({ surface: 'plan.omitted' })}>
          <p className="pg-omitted-count">
            <b className="num">{omittedTotal}</b> {t('g8.graph.omittedRecords', { n: omittedTotal })}
          </p>
          {/* A NUMBERED LIST, BECAUSE IT IS A LIST. Owner: *"no numerical render like the '1. 2.' or
              '-' or '*' in markdown to make those lists look organized"*. Five reasons ran together
              as five unmarked paragraphs, each ending in a long clause; the count and the thing are
              the item, the reason is its own quieter line under it. */}
          <ol className="pg-omitted">
            {reply.omitted.map((entry) => (
              <li key={entry.what}>
                <span className="pg-omitted-what">
                  <b className="num">{entry.count}</b> {inspect ? entry.what : entry.what.replace(reply.workspaceId, projectName(reply.workspaceId, reply.workspaceTitle))}
                </span>
                <ServerNote text={entry.why} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  )
}

/**
 * WHAT A ROLE IS CALLED — one table, two readers.
 *
 * The key said *"future direction — planned, not adopted"* and `roleWords` said the same clause on
 * every card, as two separate string literals with nothing making them agree. That is the defect
 * CLAUDE.md names, and the owner found the other half of it first: *"'future direction — planned,
 * not adopted' is bad, it is too much for a block or type description"*. A key entry is a NAME. So
 * each row holds one `word` and nothing else. The legend draws that word. The card's role line
 * draws the same word. Neither carries a sentence about the role, not even in a `title`.
 */
export const ROLE_KEY = {
  goal: { get word() { return t('g8.graph.goalAt708') } },
  deadline: { get word() { return t('g8.graph.deadline') } },
  direction: { get word() { return t('g8.graph.direction') } },
} as const

/**
 * The key: what a card's marks mean, and what a LINE means.
 *
 * IT IS A LEGEND NOW, NOT A PARAGRAPH. It was two full-width rows of clauses above the drawing —
 * about 90 words of it — and the labels about the drawing belonged inside it, as matplotlib places
 * them, in one or two columns. So
 * it is eight entries of one or two words in two columns, and on the canvas it is drawn INSIDE the
 * pane, boxed, in the corner, exactly as a plot's legend sits inside its axes (`PlanPane`).
 *
 * EACH ENTRY DRAWS ONE OR TWO WORDS AND CARRIES NO SENTENCE, not even in a `title`. The role words
 * come from `ROLE_KEY`, the table the cards read through `roleWords`, so the key and the cards
 * cannot say two different things about what a direction is.
 *
 * Every sample is the real thing at its real size: the line samples are drawn by the same
 * `LINE_FAMILY_STYLE` table the canvas strokes from, so a family whose weight changes changes here
 * in the same commit or in neither.
 */
export function Legend({ placed }: { placed?: boolean }) {
  return (
    <ul
      className={placed === true ? 'pg-legend pg-legend-placed' : 'pg-legend'}
      aria-label={t('g8.graph.whatTheMarksAndTheLinesOnThisDrawing')}
    >
      <li>
        <span className="pg-key" data-role="goal" />
        {ROLE_KEY.goal.word}
      </li>
      <li>
        <span className="pg-key" data-role="deadline" />
        {ROLE_KEY.deadline.word}
      </li>
      <li>
        <span className="pg-key" data-role="direction" />
        {ROLE_KEY.direction.word}
      </li>
      <li>
        <span className="pg-key" data-plan="allocated" />
        <span className="pg-mark">■</span> {t('g8.graph.hasTime')}</li>
      <li>
        <span className="pg-key" data-plan="unallocated" />
        <span className="pg-mark">□</span> {t('g8.graph.noTime')}</li>
      {LINK_FAMILIES.map((family) => {
        const style = LINE_FAMILY_STYLE[family]
        return (
          <li key={family}>
            <svg className="pg-key-line" width="28" height="12" aria-hidden="true">
              <defs>
                <marker
                  id={`pg-key-arrow-${family}`}
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 8 4 L 0 8 z" className="pg-arrow" />
                </marker>
              </defs>
              <path
                className="pg-line"
                data-family={family}
                d="M 1 6 L 22 6"
                markerEnd={family === 'related' ? undefined : `url(#pg-key-arrow-${family})`}
              />
            </svg>
            {style.label}
          </li>
        )
      })}
      {/* THE HEAD IS NOT THE FAMILY'S TO GIVE, so the key says what it is instead of implying that
          `related` never has one. `relates to` is the one type shared/types.ts marks symmetric and
          it is drawn without a head; `about` reads `about` one way and `subject of` the other, so
          it keeps its head and stays dotted. */}
      <li>
        <svg className="pg-key-line" width="28" height="12" aria-hidden="true">
          <defs>
            <marker
              id="pg-key-arrow-head"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" className="pg-arrow" />
            </marker>
          </defs>
          <path className="pg-line" data-family="builds" d="M 1 6 L 22 6" markerEnd="url(#pg-key-arrow-head)" />
        </svg>
        {t('g8.graph.oneWay')}</li>
    </ul>
  )
}

// ============================================================================ words on a card

/** One allocation as a line of words. One row per horizon, and they are never added together. */
function allocationWords(allocation: Allocation): string {
  const hours = allocation.plannedHours === null ? t('absence.mark') : t('g8.progress.h', { value1: allocation.plannedHours })
  return `${periodSaid(allocation.period, null).name} · ${hours} · ${t(`g8.graph.allocation.${allocation.state}`)}`
}

/**
 * `due` in words, EXACTLY AS STORED.
 *
 * The stored shape is `date | PauseUntil`: a stamp, or an object saying what has to happen before it
 * matters. All four answers are different and none of them is computed — nothing here compares
 * anything to a clock, and an obligation holding no `due` says so rather than being given one.
 */
function dueWords(due: unknown): string {
  if (due === null || due === undefined) return t('absence.mark')
  if (typeof due === 'string') return due
  if (typeof due === 'object' && !Array.isArray(due)) {
    const bag = due as Record<string, unknown>
    if (typeof bag['condition'] === 'string') return t('g8.graph.when', { value1: bag['condition'] })
    if (typeof bag['recordId'] === 'string') return t('g8.graph.whenTheLinkedWorkFinishes')
  }
  // Neither a stamp nor either form of trigger. Said out loud: a card that quietly printed nothing
  // would look like an obligation nobody owes.
  return t('g8.graph.aDueRecordedInAFormThisDrawingCannot')
}

/**
 * The role, in the words the legend uses — and now literally out of the legend's own table, so the
 * key and the cards cannot drift. The card's role line draws the word alone, with no `title`.
 */
function roleWords(node: PlanGraphNode): string {
  if (node.role === 'goal') return ROLE_KEY.goal.word
  if (node.role === 'deadline') return ROLE_KEY.deadline.word
  if (node.role === 'direction') return ROLE_KEY.direction.word
  return kindWord(node.kind).text
}

/**
 * THE ONE WORD A CANVAS CARD CARRIES BESIDE ITS TITLE.
 *
 * A card had a role line, an "in <pipeline>" line, a `due` line, a state/depth/est list and either
 * its allocation rows or the sentence "not in this period's plan" — 138 to 217 pixels of it on a
 * 268px width, and eleven of the fourteen cards ended with that same sentence, which the hollow □
 * and the missing rail had already said twice. This is what survives: the one word that differs per
 * card and cannot be read off its shape.
 *
 * NEVER INVENTED. A record with no state word says so, because "no state recorded" and a card that
 * quietly ends after its title are different facts and only one of them is true.
 */
export function chipWords(node: PlanGraphNode): string {
  if (node.role === 'deadline') {
    if (node.settled !== null) return t('g8.graph.settledWord')
    return dueWords(node.due)
  }
  if (node.role === 'direction') return node.depth === null ? t('absence.mark') : node.depth
  // A GOAL's one word is its state word, drawn through the product's ONE state drawing table by
  // `NodeChip`, so a met goal draws the ended mark and nothing here restates that mapping.
  return node.state === null ? t('absence.mark') : stateWord(node.state).text
}

/**
 * THE ONE LINE AN AGENT-FILED GOAL CARRIES UNTIL THE PERSON CONFIRMS IT.
 *
 * `goalIsConfirmed` is the one reader of the two fields the mark is made of, and it is the same
 * reader the horizons page uses, so a goal is drawn the same way wherever it appears. The words are
 * that page's words, whole. Null on every card that is not a goal and on a goal the person filed or
 * has already confirmed: the marker does not decide who may confirm — the guard does — it only says
 * what the stored fields say.
 */
export function goalMark(node: PlanGraphNode): string | null {
  if (node.role !== 'goal') return null
  return goalIsConfirmed(node.record) ? null : t('g8.graph.anAgentFiledThisGoalThePersonHasNot')
}

/**
 * THE WORD A CARD CARRIES, DRAWN AS THE PRODUCT DRAWS IT.
 *
 * A state word goes in the product's own state chip, so "blocked" on this graph and "blocked" on
 * Home are one drawing. The words this graph works out for itself -- when a deadline falls, how far
 * a direction has been taken -- are its own and stay as plain words: they are not state words and
 * dressing them as one would say they came off a record.
 */
function NodeChip({ node }: { node: PlanGraphNode }) {
  if (node.role !== 'deadline' && node.role !== 'direction' && node.state !== null) {
    return <StoredState state={node.state} progress={progressOf(node.state)} />
  }
  return <span className="pg-cc-chip">{chipWords(node)}</span>
}

/**
 * THE WORDS ON A LINE, REVEALED RATHER THAN RESERVED.
 *
 * ELK used to be handed this label's measured size, and that is where the width went: the layer
 * pitch was 555px of which about 287 was label room, and a pill reached 260px. The words are the
 * same words; what changed is that they are drawn on demand, on top, at the middle of the route —
 * on hover, on selection, and whenever a card the line touches has keyboard focus. `List` prints
 * every one of them at all times, which is what makes on-demand honest rather than hidden.
 */
function LineLabel({ edge, nodes }: { edge: PlanGraphEdge; nodes: readonly PlanGraphNode[] }) {
  return (
    <>
      {linkWord(edge.type, 'forward').text}
      {edge.gate === null ? null : <span className="pg-line-gate"> · {gateWordsForReader(edge.gate, stageInThePlan(edge.gate.upTo, nodes).words)}</span>}
    </>
  )
}

/**
 * ONE CANVAS CARD, USED FOR BOTH PASSES — AND IT IS THE SHARED CARD.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS THIS FILE'S AND WHAT IS THE DRAWING'S
 * ---------------------------------------------------------------------------------------
 *
 * WHAT THE CARD SAYS is `CardFace`, the module and pipeline drawings' own card: the name at the
 * level the card is at, the marks, the compact forms, the body at levels 3 to 6, and the card's own
 * controls for its size, its detail tick and a level chosen by hand. The drawing was already good
 * apart from having no semantic zoom, and that is answered by using the thing that has one rather
 * than writing a second.
 *
 * WHAT IS THIS DRAWING'S is the box round it: the plan mark, □ or ■, saying whether this period
 * gives the record time, and the plan's own stylesheet. A plan card looks like a plan card and says
 * what the shared card says.
 *
 * Rendered hidden to be measured and then rendered again to be drawn, from this one component, so
 * the size the solver was given is the size the card really is. Two components would be the defect
 * this codebase keeps producing, in the place where it shows as lines landing an inch from boxes.
 */
function PlanCanvasCard({
  node,
  card,
  anchor,
  selected,
  onOpen,
  onFocus,
  onBlur,
}: {
  node: PlanGraphNode
  /** Everything the shared card needs, built once for the whole drawing. See `PlanGraphView`. */
  card: CardData
  anchor: boolean
  selected: boolean
  onOpen?: () => void
  onFocus?: () => void
  onBlur?: () => void
}) {
  const allocated = node.allocations.length > 0
  return (
    <div
      className="pg-cc"
      // WHAT THE PLAN CALLS THIS RECORD: a deadline, a future direction, or work. It is
      // `data-plan-role` and not `data-role`, because the shared card writes `data-role` and means
      // something else by it — how much room the drawing's stored arrangement asks for. One
      // attribute with two meanings on one element is one of them being overwritten, and the one
      // that lost was this: the double border on a deadline and the dashed border on a direction
      // were gone from the drawing, which a photograph found.
      data-plan-role={node.role}
      data-plan={allocated ? 'allocated' : 'unallocated'}
      data-anchor={anchor ? '1' : undefined}
      data-selected={selected ? '1' : undefined}
      // THE WHOLE TITLE, because the name is clamped to two lines on this drawing. That clamp is
      // paid for three times — here, in the heading of the panel a press opens, and in the list —
      // and it is what keeps a 96-character obligation title from making a 206px card.
      title={node.title}
      // EVERY MARK THE SHARED CARD WRITES, including which record it is, which level it drew and
      // which drawing it is on. A comment right-clicked onto a plan card reads the same attributes
      // it reads on a module card, because they are written by the same function.
      {...markAttributes(card)}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <span className="pg-mark" aria-hidden="true">
        {allocated ? '■' : '□'}
      </span>
      {/* A PRESS ON THE NAME FOCUSES THE CARD, which is what a press on this drawing has always
          done: the panel underneath then prints every field the card leaves off, with the record's
          own page one link away. The handler is given here rather than built into the card data,
          because focus belongs to the band and the band is what draws the card. */}
      <CardFace {...card} onOpen={() => onOpen?.()} />
      {/* THE ONE WORD THIS DRAWING'S CARDS CARRY, and it stays outside the shared card because it
          is the plan's and not the record's: when a deadline falls, how far a direction has been
          taken, what state a piece of work is in. The shared card draws what the RECORD has
          written; this is what the PERIOD says about it. */}
      <NodeChip node={node} />
    </div>
  )
}

/**
 * ONE CARD IN FULL, for the reading layer and for the panel a card opens.
 *
 * EVERY FIELD THE CANVAS CARD DROPPED IS HERE, in the same words it used to print on the canvas —
 * the role, the pipeline, `due`, the state, the depth, the estimate, the allocation rows and the
 * sentence "not in this period's plan". Nothing was deleted from the product; it moved from
 * first-glance to one press, which is the only move the density test allows.
 */
function PlanCard({ node }: { node: PlanGraphNode }) {
  const allocated = node.allocations.length > 0
  return (
    <div className="pg-card" data-role={node.role} data-plan={allocated ? 'allocated' : 'unallocated'}>
      <div className="pg-card-head">
        <span className="pg-mark" aria-hidden="true">
          {allocated ? '■' : '□'}
        </span>
        <button type="button" className="pg-card-title" onClick={() => navigate(recordPath(node.recordId))}>
          {node.name}
        </button>
      </div>

      <p className="pg-card-role">
        {roleWords(node)}
      </p>

      {/* AN AGENT'S GOAL SAYS SO UNTIL THE PERSON CONFIRMS IT. One short line, from the two stored
          fields through `goalIsConfirmed`; absent on a goal the person filed and on a confirmed one,
          and on every card that is not a goal. Criterion P1. */}
      {goalMark(node) === null ? null : <p className="pg-card-mark">{goalMark(node)}</p>}

      {/* A block's title is its pipeline's title and then its own name. The name is on the card and
          the pipeline is here, rather than three cards of one campaign reading identically. */}
      {node.within === null ? null : <p className="pg-card-within">{t('g8.graph.in', { value1: node.within })}</p>}

      {node.role === 'deadline' ? (
        <p className="pg-card-due" data-dated={node.due === null ? '0' : '1'}>
          {node.due === null ? dueWords(node.due) : t('g8.graph.dueAt1267', { value1: dueWords(node.due) })}
        </p>
      ) : null}

      <dl className="pg-card-facts">
        {node.state === null ? null : (
          <div>
            <dt>{t('g8.graph.state')}</dt>
            <dd>
              <StoredState state={node.state} progress={progressOf(node.state)} />
            </dd>
          </div>
        )}
        {node.role !== 'direction' ? null : (
          <div>
            <dt>{t('g8.graph.depth')}</dt>
            <dd>
              <DepthLadder depth={node.depth} />
            </dd>
          </div>
        )}
        {node.effortHours === null ? null : (
          <div>
            <dt>{t('g8.graph.est')}</dt>
            <dd>{t('g8.graph.hInTotal', { value1: node.effortHours })}</dd>
          </div>
        )}
      </dl>

      {/* THE PLAN, ONE ROW PER HORIZON AND NEVER A SUM. A week planning 8 hours with 3 of them on a
          Monday is 8 hours of work, not 11 — shared/planning.ts states it and this is what obeying
          it looks like on a card. */}
      {allocated ? (
        <ul className="pg-card-plan">
          {node.allocations.map((allocation) => (
            <li key={allocation.id}>{allocationWords(allocation)}</li>
          ))}
        </ul>
      ) : (
        <p className="pg-card-unplanned">{t('g8.graph.notInThisPeriodSPlan')}</p>
      )}
    </div>
  )
}

// ============================================================================ measuring

/**
 * Every canvas card rendered hidden at the real width, and what the browser made of it.
 *
 * `null` until the first measurement lands, so a caller can tell "not measured yet" from "measured
 * as nothing" — the two would otherwise both be an empty map, and one of them is a drawing that
 * must not run.
 */
function useMeasuredCards(
  nodes: readonly PlanGraphNode[],
  cardFor: (node: PlanGraphNode) => CardData,
  /** The position the whole drawing is at, for the one card nobody has sized. */
  says: Rung,
  /**
   * What the cards are drawn AT right now: every size and every level, in one string.
   *
   * A CARD THAT GREW HAS TO BE MEASURED AGAIN. Growing one is the whole of the semantic zoom the
   * owner asked for, and a measurement taken before the press would lay the drawing out to the size
   * the card used to be — lines landing an inch from a box, which is the fault this rack exists to
   * prevent. The nodes do not change when a card is pressed, so the node list alone cannot say it.
   */
  drawnAt: string,
): {
  sizes: ReadonlyMap<string, Size> | null
  unmeasured: string[]
  rack: React.ReactNode
} {
  const elements = useRef(new Map<string, HTMLElement>())
  const [state, setState] = useState<{ sizes: Map<string, Size>; unmeasured: string[] } | null>(null)

  useLayoutEffect(() => {
    const sizes = new Map<string, Size>()
    const unmeasured: string[] = []
    for (const node of nodes) {
      const element = elements.current.get(node.recordId)
      if (element === undefined) {
        // Refused rather than estimated from a character count, which a title in mixed script would
        // make wrong by a factor. The caller reports the names and draws nothing.
        unmeasured.push(node.name)
        continue
      }
      const rect = element.getBoundingClientRect()
      sizes.set(node.recordId, { width: Math.ceil(rect.width), height: Math.ceil(rect.height) })
    }
    setState({ sizes, unmeasured })
  }, [nodes, drawnAt])

  const rack = (
    <div className="pg-measure" aria-hidden="true">
      {nodes.map((node) => (
        <div
          key={node.recordId}
          ref={(element) => {
            if (element === null) elements.current.delete(node.recordId)
            else elements.current.set(node.recordId, element)
          }}
          className="pg-measure-card"
          // THE WIDTH THE CARD'S OWN SIZE ASKS FOR, so the height measured here is the height at
          // that width. See `widthOfPlanCard`: the share is the shared table's and the base is this
          // drawing's, which is the same split `widthOf` in Canvas.tsx makes.
          style={{ width: `${widthOfPlanCard(cardFor(node).plan.room ?? WIDTH_AT_SIZE[SIZE_A_CARD_STARTS_AT[says]], says)}px` }}
        >
          <PlanCanvasCard node={node} card={cardFor(node)} anchor={false} selected={false} />
        </div>
      ))}
    </div>
  )

  return { sizes: state?.sizes ?? null, unmeasured: state?.unmeasured ?? [], rack }
}

// ============================================================================ laying the bands out

/** Where one band's cards and lines ended up, in that band's own coordinates. */
/**
 * WHERE ONE BAND'S CARDS AND LINES GO. Exported so a test can draw a plane without the solver.
 *
 * `tests/a-line-between-two-intentions.test.ts` hands `BandBody` a layout it wrote by hand and reads
 * the family off the drawn `<path>`. Asking `familyOfEdge` directly would pass with the canvas still
 * calling the table alone, which is the shape this repository keeps shipping: a pure function
 * guarded by a test, wired to no drawing.
 */
export interface BandDrawn {
  placements: Map<string, Placement>
  routes: Map<string, EdgeRoute>
  width: number
  height: number
}

type BandsState =
  | { at: 'measuring' }
  | { at: 'laying-out' }
  | { at: 'drawn'; drawn: Map<string, BandDrawn>; ms: number }
  | { at: 'failed'; problem: string }

/** The name the plan drawing's layout goes by in the page's list of what is still out. */
const PLAN_LAYOUT_WORK = 'the plan drawing, laying out its groups'

/**
 * ELK, once per band that is drawn as a graph.
 *
 * A BAND IS ITS OWN ROOT GRAPH. A group holds no line to any other group, so nesting them under one
 * root only hands ELK's component packer a decision the reader already has a better answer to —
 * which is what produced the unlabelled two-graph plane this pass was opened on. Laid out
 * separately, each band's box is its own and the page stacks the boxes.
 *
 * A band that is a straight run gets no layout at all: it is a row of chips in ordinary flow, and
 * `straightRun` has already given the order. A folded band gets none either — there is nothing on
 * screen to place — and unfolding it runs the solver then, which is 49ms on this corpus.
 */
function useBandLayout(
  bands: readonly PlanBand[],
  graph: StructureGraph,
  sizes: ReadonlyMap<string, Size> | null,
  folded: ReadonlySet<string>,
): BandsState {
  const [state, setState] = useState<BandsState>({ at: 'measuring' })
  const wanted = bands.filter((band) => band.run === null && !folded.has(band.key))
  // The dependency is what the layout is OF, spelled out: the ids and the sizes. A band object
  // identity would re-run ELK on every keystroke of the selection state.
  const key = wanted
    .map((band) => `${band.key}:${band.nodes.map((n) => `${n.recordId}@${sizes?.get(n.recordId)?.height ?? '?'}x${sizes?.get(n.recordId)?.width ?? '?'}`).join(',')}`)
    .join(';')

  useEffect(() => {
    if (sizes === null) {
      setState({ at: 'measuring' })
      return
    }
    let live = true
    setState({ at: 'laying-out' })
    // THE PAGE IS NOT FINISHED WHILE ITS DRAWING IS BEING LAID OUT. The page marks itself ready when
    // nothing it asked for is still out (lib/ready.ts), and the layout is not a request, so the mark
    // went on while the groups still said they were working out where things go. The first page of
    // a run waits longest, because that is when the layout code is first loaded, and a photograph
    // taken at the mark caught the drawing unfinished. Counted as one thing still out, and settled
    // exactly once: when the layout ends in any way, or when this effect is thrown away.
    let counted = true
    aRequestStarted(PLAN_LAYOUT_WORK)
    const settled = (): void => {
      if (!counted) return
      counted = false
      aRequestSettled(PLAN_LAYOUT_WORK)
    }

    /**
     * ONE BAND AS A DRAWING OF ITS OWN, so the shared layout can lay it out.
     *
     * `layoutGraph` takes a drawing and its measured cards. A band is a connected component of this
     * drawing and is placed on its own plane, so what it is handed is the same drawing narrowed to
     * that band — the same scope, so the same ELK options out of `LAYOUT_AT`, and the same
     * direction. There is no second solver call and no second set of options here: this file used
     * to build an ELK graph by hand and hold its own copy of the spacing numbers, and both are gone.
     */
    const bandGraph = (band: PlanBand): StructureGraph => {
      const ids = new Set(band.nodes.map((node) => `plan:${node.recordId}`))
      return {
        ...graph,
        nodes: graph.nodes.filter((node) => ids.has(node.id)),
        edges: graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
      }
    }

    void (async () => {
      try {
        const started = Date.now()
        const drawn = new Map<string, BandDrawn>()
        for (const band of wanted) {
          const inside = bandGraph(band)
          // The sizes `layoutGraph` wants are keyed by NODE id; the rack measures by record id,
          // which is what every reader on this page holds.
          const byNode = new Map(inside.nodes.map((node) => [node.id, sizes.get(node.recordId) ?? { width: CARD_WIDTH, height: 0 }]))
          const laid = await layoutGraph(inside, byNode)
          const placements = new Map<string, Placement>()
          let width = 0
          let height = 0
          for (const node of inside.nodes) {
            const at = laid.placements.get(node.id)
            if (at === undefined) continue
            placements.set(node.recordId, at)
            width = Math.max(width, at.x + at.width)
            height = Math.max(height, at.y + at.height)
          }
          const missing = band.nodes.filter((node) => !placements.has(node.recordId))
          if (missing.length > 0) {
            // A node drawn at a position nobody worked out would sit on top of another one. Refused
            // rather than defaulted to the origin, which is the rule layout.ts states.
            if (live) {
              setState({
                at: 'failed',
                problem:
                  t('g8.graph.theLayoutPlacedOfBoxesInAndLeftWith', { value1: placements.size, value2: band.nodes.length, value3: band.heading, value4: missing.length, value5: DRAWING_WORDS.list }),
              })
            }
            return
          }
          const routes = new Map<string, EdgeRoute>()
          for (const edge of inside.edges) {
            const route = laid.routes.get(edge.id)
            if (route === undefined) continue
            // The band's own edge ids are the reply's; the drawing's carry a `link:` prefix. One
            // translation, here, so nothing below this line holds two spellings of one id.
            routes.set(edge.linkId ?? edge.id, route)
            for (const point of route.points) {
              width = Math.max(width, point.x)
              height = Math.max(height, point.y)
            }
          }
          drawn.set(band.key, {
            placements,
            routes,
            width: Math.ceil(width + BAND_GAP),
            height: Math.ceil(height + BAND_GAP),
          })
        }
        if (live) setState({ at: 'drawn', drawn, ms: Date.now() - started })
      } catch (err) {
        // Caught only to be reported. The drawing is gone and the sentence says so, rather than an
        // empty box that looks like a period with nothing in it.
        if (live) setState({ at: 'failed', problem: errorMessage(err) })
      } finally {
        settled()
      }
    })()

    return () => {
      live = false
      settled()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sizes, graph])

  return state
}

// ============================================================================ the pane

/** What the canvas is handed. One object, built once, by `PlanGraphView`. */
interface PlanCanvasProps {
  reply: PlanGraphReply
  /** The drawing, built by the shared model. See `PlanGraphView`. */
  graph: StructureGraph
  model: PlanModel
  /** Everything one card needs, built once for the whole drawing. See `PlanGraphView`. */
  cardFor: (node: PlanGraphNode) => CardData
  sizes: { sizes: ReadonlyMap<string, Size> | null; unmeasured: string[]; rack: React.ReactNode }
  selected: string | null
  onSelect: (id: string | null) => void
  hoveredEdge: string | null
  onHoverEdge: (id: string | null) => void
  folded: ReadonlySet<string>
  onToggleBand: (key: string) => void
  inspect: boolean
}

/**
 * The window onto the drawing: how big it is, how much of it is in the pane, and where it opens.
 *
 * ---------------------------------------------------------------------------------------
 * IT OPENS AT READING SIZE AND SCROLLS TO THE ANCHOR
 * ---------------------------------------------------------------------------------------
 *
 * The rule `layout.ts` records is that a drawing scaled until it fits is a drawing nobody can read,
 * so this pane opens at `READING_ZOOM` and pans. What is new is WHERE it opens: at the origin, on
 * the live corpus, the one deadline was at x=1138 in a 1,144px pane and therefore off screen on a
 * panel titled "working toward". The origin of a derived layout means nothing; the anchor does.
 *
 * ---------------------------------------------------------------------------------------
 * AND IT HAS A FIT, WHICH THE SIBLING CANVAS HAS HAD ALL ALONG
 * ---------------------------------------------------------------------------------------
 *
 * `Canvas.tsx` has `Fit all` and `Reading size`; this pane had neither, and no zoom at all. It has
 * both now, and the readout says the truth about what pressing them did: `READABLE_FLOOR` is 0.85
 * because below it the 13px card body is under 11px, so a fit that lands under the floor is a
 * thumbnail and the words beside the percentage say so instead of leaving a reader to discover that
 * the type has gone.
 */
function PlanPane({
  planeWidth,
  planeHeight,
  anchorBox,
  inspect,
  foot,
  children,
}: {
  planeWidth: number
  planeHeight: number
  anchorBox: { x: number; y: number; width: number; height: number } | null
  inspect: boolean
  foot: React.ReactNode
  children: React.ReactNode
}) {
  const pane = useRef<HTMLDivElement | null>(null)
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(READING_ZOOM)

  useLayoutEffect(() => {
    const element = pane.current
    if (element === null) return
    const read = (): void => setPaneSize({ width: element.clientWidth, height: element.clientHeight })
    read()
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const drawing = { minX: 0, minY: 0, width: planeWidth, height: planeHeight }
  // WHAT THE PANE REALLY SCROLLS OVER. The inner plane has CANVAS_PAD of padding on every side, so
  // the drawn area is the drawing plus twice the padding, at the zoom. The opening scroll is worked
  // out on this, and the anchor's place is moved in by one padding, because both the anchor and the
  // drawing's size are read inside the padding. Without it the widest scroll the pane allowed
  // stopped 56 pixels short, and a goal card at the right end of the drawing opened cut in half.
  const padded = { width: (planeWidth + 2 * CANVAS_PAD) * zoom, height: (planeHeight + 2 * CANVAS_PAD) * zoom }
  const height = boxHeightFor(drawing, paneSize.width)
  const fit = fitWithinReading(drawing, paneSize.width, height ?? paneSize.height)

  // WHERE IT OPENS, AND AGAIN AFTER EVERY ZOOM. A reader who fits the whole shape and then returns
  // to reading size must land back on the card the panel is about, not wherever the scrollbars were.
  const scrolled = useRef('')
  useLayoutEffect(() => {
    const element = pane.current
    if (element === null || anchorBox === null || planeWidth <= 0 || paneSize.width <= 0) return
    const stamp = `${planeWidth}x${planeHeight}@${zoom}:${anchorBox.x},${anchorBox.y}`
    if (scrolled.current === stamp) return
    scrolled.current = stamp
    const at = centreScroll(
      { x: (anchorBox.x + CANVAS_PAD) * zoom, y: (anchorBox.y + CANVAS_PAD) * zoom, width: anchorBox.width * zoom, height: anchorBox.height * zoom },
      { width: element.clientWidth, height: element.clientHeight },
      padded,
    )
    element.scrollLeft = at.left
    element.scrollTop = at.top
  }, [anchorBox, planeWidth, planeHeight, paneSize.width, zoom])

  const step = (by: number): void => setZoom((was) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((was + by) * 100) / 100)))
  // The drawing changes size with the zoom, so the zoom is what says to measure the pane again.
  const reach = useReach(String(zoom), pane)

  return (
    // THE EDGES OF THE PANE SAY WHEN THE DRAWING GOES ON PAST THEM. A node off the edge of a graph
    // is a node nobody knows about, and the pane had no scrollbar and no edge. The reading is taken
    // on the pane's own ref, which the panning code already holds. See components/InReach.tsx.
    <InReachMark reach={reach} className="pg-canvas-wrap">
      {/* THE LEGEND, IN THE PLOT. It floats in the corner of the pane rather than sitting above the
          drawing as a block of prose, which is the arrangement the owner named — a matplotlib
          legend. `pointer-events: none` so it can never take a press meant for a card underneath. */}
      <Legend placed />
      {/* THE CARDS' OWN CONTROLS SAY WHY A PRESS DID NOTHING UNDER THE DRAWING THEY ARE ON.
          A row of controls and the one line under it is what `DrawingControls` is; the bar below
          the drawing is one row and the cards on the drawing are another, so each gets its own
          line rather than reporting into a row it is not in. It is OUTSIDE the scrolling pane,
          which clips what overflows it. `Canvas.tsx` has the same pair for the same reason. */}
      <DrawingControls>
      <div
        className="pg-canvas"
        ref={pane}
        style={height === null ? undefined : { height: `${height}px` }}
        // The pane is scrolled by the reader as well as by the code, so it is a labelled region and
        // it takes keyboard focus. A drawing that can only be panned with a mouse is a drawing half
        // the people who open it cannot reach the far side of.
        tabIndex={0}
        role="group"
        aria-label={t('g8.graph.theDrawingScrollOrUseTheZoomControlsBeneath')}
      >
        <div
          className="pg-plane"
          style={{ width: `${Math.ceil(padded.width)}px`, height: `${Math.ceil(padded.height)}px` }}
        >
          <div
            className="pg-plane-inner"
            style={{ width: `${planeWidth}px`, transform: zoom === 1 ? undefined : `scale(${zoom})` }}
          >
            {children}
          </div>
        </div>
      </div>
      </DrawingControls>

      {/* EVERY CONTROL HERE GOES THROUGH `DrawingControl`, AND THE ROW HOLDS THE ONE LINE THAT SAYS
          WHY A PRESS DID NOTHING. These four were raw buttons: pressing `Reading size` while the
          drawing was already at reading size changed zero pixels and said nothing, which is the
          defect problem 6 of the owner's list is about, and this file was the one drawing that
          `tests/a-drawing-control-is-never-silent.test.ts` did not look at. The check itself is
          controls.tsx's and there is no copy of it here. */}
      <DrawingControls>
      <div className="pg-bar" role="group" aria-label={t('g8.graph.howMuchOfTheDrawingYouCanSee')}>
        <DrawingControl
          look="plain"
          className="pg-bar-btn"
          now={zoom}
          after={READING_ZOOM}
          same={sameZoom}
          reason={t('g8.graph.alreadyAtTheReadingSizeThisIsTheSize')}
          onPress={() => setZoom(READING_ZOOM)}
          title={t('g8.graph.goBackToTheSizeTheBoxesAreMeant')}
        >{t('g8.graph.readingSize')}</DrawingControl>
        <DrawingControl
          look="plain"
          className="pg-bar-btn"
          now={zoom}
          after={fit.zoom}
          same={sameZoom}
          reason={t('g8.graph.alreadyShowingTheWholeDrawingThisIsAsMuch')}
          onPress={() => setZoom(fit.zoom)}
          title={t('g8.graph.showTheWholeDrawingAtOnceHoweverSmallThat')}
        >{t('g8.graph.fitAll')}</DrawingControl>
        <DrawingControl
          look="plain"
          className="pg-bar-btn"
          now={zoom}
          after={MIN_ZOOM}
          same={sameZoom}
          reason={t('g8.graph.alreadyAtTheSmallestIsAsFarOutAs', { value1: String(Math.round(MIN_ZOOM * 100)) })}
          label={t('g8.graph.smaller')}
          onPress={() => step(-0.1)}
        >
          −
        </DrawingControl>
        <span className="pg-zoom-readout num">{Math.round(zoom * 100)}%</span>
        <DrawingControl
          look="plain"
          className="pg-bar-btn"
          now={zoom}
          after={MAX_ZOOM}
          same={sameZoom}
          reason={t('g8.graph.alreadyAtTheLargestIsAsCloseInAs', { value1: String(Math.round(MAX_ZOOM * 100)) })}
          label={t('g8.graph.bigger')}
          onPress={() => step(0.1)}
        >
          +
        </DrawingControl>
        {/* THE HONEST WORD BESIDE THE PERCENTAGE. A percentage on its own is a number; "below reading
            size" is what the number means for the person about to squint at it. */}
        <span className="pg-fit-note">
          {zoom < READABLE_FLOOR
            ? t('g8.graph.tooSmallToReadTheWordsInABox')
            : fit.belowReading
              ? t('g8.graph.theWholeShapeOnlyFitsAtWhichIsToo', { value1: Math.round(fit.zoom * 100) })
              : fit.whole && fit.zoom >= READING_ZOOM
                ? t('g8.graph.theWholeDrawingIsInThePane')
                : t('g8.graph.fitAllLandsOn', { value1: Math.round(fit.zoom * 100) })}
        </span>
      </div>
      </DrawingControls>

      {foot === null || (!inspect && foot === undefined) ? null : <p className="pg-canvas-state">{foot}</p>}
    </InReachMark>
  )
}

/**
 * One band's contents: a row of chips when it is a straight run, a plane of cards when it is not.
 *
 * WHAT A BAND CONTAINS IS A FACT ABOUT THE RECORDS, and it is drawn in one place. How the bands are
 * arranged on the page is a separate question and is answered above; a second drawing of the
 * contents could disagree with this one about a card's marks with nothing failing.
 */
export function BandBody({
  band,
  drawn,
  props,
}: {
  band: PlanBand
  drawn: BandDrawn | undefined
  props: PlanCanvasProps
}) {
  const { model, selected, onSelect, hoveredEdge, onHoverEdge } = props
  const [focused, setFocused] = useState<string | null>(null)
  const lit = selected ?? focused

  if (band.run !== null) {
    const byId = new Map(band.nodes.map((node) => [node.recordId, node]))
    const word = linkWord(band.run.type, 'forward').text
    return (
      <div className="pg-chain">
        <p className="pg-chain-word">
          {band.run.order.length} {t('g8.graph.stepsInOrderEach')}<b>{word}</b> {t('g8.graph.theNext')}</p>
        <ol className="pg-chain-row">
          {band.run.order.map((id, index) => {
            const node = byId.get(id)
            if (node === undefined) return null
            const allocated = node.allocations.length > 0
            return (
              <li key={id}>
                {index === 0 ? null : (
                  <span className="pg-chain-arrow" aria-hidden="true">
                    →
                  </span>
                )}
                <DrawingControl
                  look="plain"
                  className="pg-chain-step"
                  now={selected}
                  after={node.recordId === selected ? null : node.recordId}
                  onPress={() => onSelect(node.recordId === selected ? null : node.recordId)}
                  title={node.title}
                >
                  <span className="pg-mark" aria-hidden="true">
                    {allocated ? '■' : '□'}
                  </span>
                  <span className="pg-chain-name">{node.name}</span>
                  <NodeChip node={node} />
                </DrawingControl>
              </li>
            )
          })}
        </ol>
      </div>
    )
  }

  if (drawn === undefined) return <p className="pg-band-waiting">{t('g8.graph.workingOutWhereThisGroupGoes')}</p>

  const litEdges = new Set<string>()
  if (lit !== null) for (const edge of band.edges) if (edge.from === lit || edge.to === lit) litEdges.add(edge.id)
  if (hoveredEdge !== null) litEdges.add(hoveredEdge)
  const unrouted = band.edges.filter((edge) => !drawn.routes.has(edge.id))
  // WHICH WORLD EACH CARD IN THIS BAND IS IN, so the lines between them can be drawn in the right
  // language. `worldOf` is the one statement of whether a thing has happened, and this is where the
  // canvas asks it. A band is a connected component, so both ends of every edge in it are here.
  const worlds = worldsIn(band.nodes)

  return (
    <div className="pg-band-plane" style={{ width: `${drawn.width}px`, height: `${drawn.height}px` }}>
      <svg className="pg-lines" width={drawn.width} height={drawn.height}>
        <defs>
          <marker
            id="pg-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" className="pg-arrow" />
          </marker>
        </defs>
        {band.edges.map((edge) => {
          const route = drawn.routes.get(edge.id)
          if (route === undefined) return null
          const family = familyOfEdge(edge, worlds)
          // A SYMMETRIC LINK LOSES ITS ARROWHEAD AND NOTHING ELSE DOES. `relates_to` is the one type
          // shared/types.ts marks symmetric, and drawing a direction on it asserted something the row
          // does not hold. `about` is NOT symmetric — it reads `about` one way and `subject of` the
          // other — so taking its head away would assert less than the row holds, which is the same
          // defect pointing the other way. One declaration decides, and it is the shared one.
          const directed = LINK_TYPES[edge.type as keyof typeof LINK_TYPES]?.symmetric !== true
          const d = roundedPath(route.points)
          return (
            <g key={edge.id}>
              <path
                className="pg-line"
                data-family={family ?? 'unclassified'}
                data-broken={edge.broken ? '1' : undefined}
                data-gated={edge.gate === null ? undefined : '1'}
                data-lit={litEdges.has(edge.id) ? '1' : undefined}
                d={d}
                markerEnd={directed ? 'url(#pg-arrow)' : undefined}
              />
              {/* The line itself is 1.5 to 2.25px wide and nobody hits that with a mouse. This is
                  the same path at a width a hand can land on, invisible, and it is what reveals the
                  words on hover. */}
              <path
                className="pg-line-hit"
                d={d}
                onMouseEnter={() => onHoverEdge(edge.id)}
                onMouseLeave={() => onHoverEdge(null)}
              />
            </g>
          )
        })}
      </svg>

      {band.edges.map((edge) => {
        if (!litEdges.has(edge.id)) return null
        const route = drawn.routes.get(edge.id)
        if (route === undefined) return null
        const middle = route.points[Math.floor(route.points.length / 2)]
        if (middle === undefined) return null
        return (
          <span key={edge.id} className="pg-line-label" data-placed="1" style={{ left: `${middle.x}px`, top: `${middle.y}px` }}>
            <LineLabel edge={edge} nodes={props.reply.nodes} />
          </span>
        )
      })}

      {band.nodes.map((node) => {
        const at = drawn.placements.get(node.recordId)
        if (at === undefined) return null
        return (
          <div
            key={node.recordId}
            className="pg-node"
            data-record-id={node.recordId}
            style={{ left: `${at.x}px`, top: `${at.y}px`, width: `${at.width}px` }}
          >
            <PlanCanvasCard
              node={node}
              card={props.cardFor(node)}
              anchor={node.recordId === model.topAnchorId}
              selected={node.recordId === selected}
              onOpen={() => onSelect(node.recordId === selected ? null : node.recordId)}
              onFocus={() => setFocused(node.recordId)}
              onBlur={() => setFocused(null)}
            />
          </div>
        )
      })}

      {/* NOT SILENTLY MISSING. A line the solver returned no path for is not drawn, and this is
          where that is said, inside the band it belongs to and beside the picture it is absent from. */}
      {unrouted.length === 0 ? null : (
        <p className="pg-band-unrouted">{t('g8.graph.couldNotBeGivenAPathSoNotDrawn', { value1: unrouted.length, value2: unrouted.length === 1 ? t('g8.onePlan.line') : t('g8.onePlan.lines'), value3: unrouted.length === 1 ? t('g8.graph.itIs') : t('g8.graph.theyAre'), value4: DRAWING_WORDS.list, value5: unrouted.length === 1 ? t('g8.graph.it') : t('g8.graph.them') })}</p>
      )}
    </div>
  )
}

/** The heading over a band: what it is, how big it is, and how much of it this period pays for. */
function BandHead({
  band,
  folded,
  onToggle,
}: {
  band: PlanBand
  folded: boolean
  onToggle: () => void
}) {
  return (
    <div className="pg-band-head">
      {/* STUCK TO THE LEFT EDGE OF THE PANE. A band is as wide as its own drawing, which on the live
          corpus is 1,629px in a 1,144px window that opens scrolled to the anchor — so a heading laid
          out at the band's own origin was off screen at exactly the moment it was needed, and a
          photograph found it saying "…e-restore proof cannot stand". It now rides the scroll. */}
      <div className="pg-band-head-in">
        {/* A TOGGLE, so it can never be in the state its own press would set and never refuses.
            It still goes through the shared control, because the rule is that every control on a
            drawing does and a toggle is where an exception would look harmless. */}
        <DrawingControl
          look="plain"
          className="pg-band-toggle"
          now={folded}
          after={!folded}
          onPress={onToggle}
          title={folded ? t('g8.graph.drawThisGroup') : t('g8.graph.foldThisGroupAway')}
        >
          <span className="pg-band-caret" aria-hidden="true">
            {folded ? '▸' : '▾'}
          </span>
          <span className="pg-band-name">{band.heading}</span>
        </DrawingControl>
        {/* IN THE GREY BLOCK, LIKE EVERY OTHER SUMMARY. This is the line directly under the band's
            own name — the one the owner was reading when they asked for the counts to stop looking
            like content. `px-sum` is defined in styles.css and is the whole product's. */}
        <p className="pg-band-counts px-sum">
          <span className="px-sum-key">{t('g8.graph.sum')}</span>
          <b className="num">{band.nodes.length}</b> {band.nodes.length === 1 ? t('g8.graph.recordAt866') : t('g8.graph.recordsAt866')} ·{' '}
          <b className="num">{band.allocated}</b> {t('g8.graph.onThePlanAt1958')}{' '}
          {/* THE NUMBER, SAID OUT LOUD. Why the drawing looked like two graphs had
              a true answer nothing on the screen was giving: they share no link at all. 78px of grey
              was carrying the whole claim, and a gap that size reads as a tier, not a separation. */}
          <b className="num">{band.crossings}</b> {band.crossings === 1 ? t('g8.onePlan.line') : t('g8.onePlan.lines')} {t('g8.graph.toAnotherGroup')}</p>
        {folded ? (
          <p className="pg-band-why">
            {/* A group of one record said "Folded because it is on this period's plan" here, which is
                the opposite of why it was folded: nothing in it has time in this period. */}
            {t('g8.graph.folded')}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Everything the pane says about the run, given the state. One function, so the number of
 * milliseconds and the wording of a failure are worked out in exactly one place.
 */
function bandsFoot(state: BandsState, props: PlanCanvasProps): React.ReactNode {
  const { reply, model, sizes, inspect } = props
  if (sizes.unmeasured.length > 0) {
    return (
      t('g8.graph.neverDrawnSoThereIsNoMeasuredSizeFor', { value1: sizes.unmeasured.length, value2: sizes.unmeasured.length === 1 ? t('g8.graph.boxWas') : t('g8.graph.boxesWere'), value3: sizes.unmeasured.length === 1 ? t('g8.graph.it') : t('g8.graph.them'), value4: DRAWING_WORDS.list, value5: inspect ? sizes.unmeasured.join(', ') : t('absence.mark') })
    )
  }
  if (state.at === 'failed') {
    return t('g8.graph.theDrawingFailedSoNothingIsShownRatherThan', { value1: state.problem, value2: DRAWING_WORDS.list })
  }
  if (state.at === 'measuring') return t('g8.graph.measuringTheBoxesEverySizeIsReadOffA')
  if (state.at === 'laying-out') return t('g8.graph.workingOutWhereEverythingGoes')
  const unclassified =
    model.unclassified.length === 0
      ? ''
      : t('g8.graph.linkNotInAnyOfTheThreeFamiliesAnd', { value1: model.unclassified.length, value2: model.unclassified.length === 1 ? t('g8.graph.typeIs') : t('g8.graph.typesAre'), value3: model.unclassified.length === 1 ? t('g8.writing.is') : t('g8.writing.are'), value4: model.unclassified.join(', ') })
  if (!inspect) return null
  return (
    t('g8.graph.andInPlacedInMsAndStoredNowhere', { value1: reply.nodes.length, value2: reply.nodes.length === 1 ? t('g8.graph.recordAt866') : t('g8.graph.recordsAt866'), value3: reply.edges.length, value4: reply.edges.length === 1 ? t('g8.onePlan.line') : t('g8.onePlan.lines'), value5: model.bands.length, value6: model.bands.length === 1 ? t('g8.graph.group') : t('g8.graph.groupsAt2005'), value7: state.ms, value8: unclassified })
  )
}

/** Where the anchor card sits inside the plane, read off the DOM after the bands are arranged. */
function useAnchorBox(
  planeRef: React.RefObject<HTMLDivElement | null>,
  anchorId: string | null,
  after: unknown,
): { x: number; y: number; width: number; height: number } | null {
  const [box, setBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const plane = planeRef.current
    if (plane === null || anchorId === null) {
      setBox(null)
      return
    }
    const target = plane.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(anchorId)}"]`)
    if (target === null) {
      setBox(null)
      return
    }
    const a = target.getBoundingClientRect()
    const b = plane.getBoundingClientRect()
    setBox({ x: a.left - b.left, y: a.top - b.top, width: a.width, height: a.height })
  }, [planeRef, anchorId, after])
  return box
}

// ============================================================================ the bands, stacked

/**
 * One named horizontal band per group of joined cards, stacked, laid out left to right inside.
 *
 * The reading direction is explicit: a line runs rightwards from what comes first to what waits on
 * it, and a band's heading names what the band is toward. It is a wide drawing, and on the live
 * corpus it is wider than the pane, which the readout under it says.
 */
function PlanLayers(props: PlanCanvasProps) {
  const { model, sizes, folded, onToggleBand, inspect } = props
  const state = useBandLayout(model.bands, props.graph, sizes.sizes, folded)
  const plane = useRef<HTMLDivElement | null>(null)
  const [measured, setMeasured] = useState({ width: 0, height: 0 })
  const drawn = state.at === 'drawn' ? state.drawn : new Map<string, BandDrawn>()

  useLayoutEffect(() => {
    const element = plane.current
    if (element === null) return
    const read = (): void => setMeasured({ width: element.scrollWidth, height: element.scrollHeight })
    read()
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [state, folded])

  const anchorBox = useAnchorBox(plane, model.topAnchorId, state)

  return (
    <PlanPane
      planeWidth={measured.width}
      planeHeight={measured.height}
      anchorBox={anchorBox}
      inspect={inspect}
      foot={bandsFoot(state, props)}
    >
      <div className="pg-bands" ref={plane}>
        {model.bands.map((band) => (
          <section className="pg-band" key={band.key} data-folded={folded.has(band.key) ? '1' : undefined}>
            <BandHead
              band={band}
              folded={folded.has(band.key)}
              onToggle={() => onToggleBand(band.key)}
            />
            {folded.has(band.key) ? null : <BandBody band={band} drawn={drawn.get(band.key)} props={props} />}
          </section>
        ))}
      </div>
    </PlanPane>
  )
}

// ============================================================================ what a card opens

/**
 * EVERYTHING THE CANVAS CARD STOPPED PRINTING, on a press, in the words it used to print.
 *
 * This is the other half of the density fix and it is why the fix is honest: a canvas card is a
 * mark, a title and one word, and the role, the pipeline, the depth, the estimate, the allocation
 * rows and the links are all here — the same `PlanCard` the reading layer renders, so there is one
 * rendering of a card's full detail in this file and not two.
 */
function PlanDetail({
  node,
  reply,
  onClose,
  inspect,
}: {
  node: PlanGraphNode
  reply: PlanGraphReply
  onClose: () => void
  inspect: boolean
}) {
  const byId = new Map(reply.nodes.map((each) => [each.recordId, each]))
  const out = reply.edges.filter((edge) => edge.from === node.recordId)
  const into = reply.edges.filter((edge) => edge.to === node.recordId)

  return (
    <aside className="pg-detail" aria-label={t('g8.graph.whatIsRecordedAbout', { value1: node.name })}>
      <div className="pg-detail-head">
        <h3 className="pg-detail-title">{node.title}</h3>
        {/* DRAWN ONLY WHILE THE PANEL IS OPEN, so it can never be in the state its press would
            set. It goes through the shared control for the same reason the fold above does. */}
        <DrawingControl look="plain" className="pg-bar-btn" now={true} after={false} onPress={onClose}>{t('g8.planitems.close')}</DrawingControl>
      </div>
      <PlanCard node={node} />
      {node.settled === null ? null : (
        <p className="pg-detail-settled">{t('g8.graph.settled', { value1: node.settled.at === null ? t('g8.graph.andNothingRecordsWhen') : t('g8.graph.on', { value1: node.settled.at }), value2: node.settled.note === null ? '.' : `: ${node.settled.note}` })}</p>
      )}
      {out.length === 0 && into.length === 0 ? (
        <p className="pg-row-none"><Absence /></p>
      ) : (
        <ul className="pg-row-links">
          {out.map((edge) => (
            <li key={edge.id}>
              <span className="pg-row-word">{linkWord(edge.type, 'forward').text}</span>
              <a className="px-nav" href={`#${recordPath(edge.to)}`}>
                {byId.get(edge.to)?.name ?? (inspect ? edge.to : t('absence.mark'))}
              </a>
              {edge.gate === null ? null : <span className="pg-row-gate">{gateWordsForReader(edge.gate, stageInThePlan(edge.gate.upTo, reply.nodes).words)}</span>}
            </li>
          ))}
          {into.map((edge) => (
            <li key={edge.id}>
              <span className="pg-row-word">← {linkWord(edge.type, 'forward').text}</span>
              <a className="px-nav" href={`#${recordPath(edge.from)}`}>
                {byId.get(edge.from)?.name ?? (inspect ? edge.from : t('absence.mark'))}
              </a>
              {edge.gate === null ? null : <span className="pg-row-gate">{gateWordsForReader(edge.gate, stageInThePlan(edge.gate.upTo, reply.nodes).words)}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="pg-detail-open">
        <a className="px-nav" href={`#${recordPath(node.recordId)}`}>{t('g8.graph.openThisRecord')}</a>
        {inspect ? <span className="pg-ws"> {node.recordId}</span> : null}
      </p>
    </aside>
  )
}

// ============================================================================ the reading layer

/**
 * Every card the drawing holds, printed, with its links.
 *
 * NOT A SUBSET AND NOT A SUPERSET. There is no projection in this drawing — nothing is dropped for
 * being unconnected, because a deadline nothing leads to is precisely an answer this graph exists to
 * give — so the two views hold the same set and neither has to account for the other. It is also
 * where every word on every line is printed at all times, which is what makes revealing a line's
 * label on hover a change of emphasis rather than a hiding.
 */
function PlanList({ reply }: { reply: PlanGraphReply }) {
  const inspect = useInspect()
  const byId = useMemo(() => new Map(reply.nodes.map((node) => [node.recordId, node])), [reply.nodes])
  // Goals first, then deadlines, then future branches, then the work: the order the question asks
  // them in. Criterion P1 starts the drawing from goals.
  const order = { goal: 0, deadline: 1, direction: 2, work: 3 }
  const sorted = [...reply.nodes].sort((a, b) => order[a.role] - order[b.role])

  return (
    <div className="pg-list">
      {sorted.map((node) => {
        const out = reply.edges.filter((edge) => edge.from === node.recordId)
        const into = reply.edges.filter((edge) => edge.to === node.recordId)
        return (
          <section className="pg-row" key={node.recordId}>
            <PlanCard node={node} />
            {out.length === 0 && into.length === 0 ? (
              <p className="pg-row-none"><Absence /></p>
            ) : (
              <ul className="pg-row-links">
                {out.map((edge) => (
                  <li key={edge.id}>
                    <span className="pg-row-word">{linkWord(edge.type, 'forward').text}</span>
                    <a className="px-nav" href={`#${recordPath(edge.to)}`}>
                      {byId.get(edge.to)?.name ?? (inspect ? edge.to : t('absence.mark'))}
                    </a>
                    {edge.gate === null ? null : <span className="pg-row-gate">{gateWordsForReader(edge.gate, stageInThePlan(edge.gate.upTo, reply.nodes).words)}</span>}
                  </li>
                ))}
                {into.map((edge) => (
                  <li key={edge.id}>
                    <span className="pg-row-word">← {linkWord(edge.type, 'forward').text}</span>
                    <a className="px-nav" href={`#${recordPath(edge.from)}`}>
                      {byId.get(edge.from)?.name ?? (inspect ? edge.from : t('absence.mark'))}
                    </a>
                    {edge.gate === null ? null : <span className="pg-row-gate">{gateWordsForReader(edge.gate, stageInThePlan(edge.gate.upTo, reply.nodes).words)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

// ============================================================================ styles

/**
 * This drawing's own rules.
 *
 * Every value is a token from tokens.css, so a preset swap on <html> re-skins all of it — the two
 * high-contrast themes included, which is half the reason no distinction here rests on colour alone.
 * React 19 hoists `<style href>` into <head> and de-duplicates by href.
 *
 * THE LINE FAMILIES ARE BUILT FROM `LINE_FAMILY_STYLE` rather than restated here. A weight in a
 * stylesheet and a weight in a table, with nothing making them agree, is the defect CLAUDE.md names
 * as the one this codebase keeps producing — and lines.ts already paid for it once, with a revealed
 * `carries` line drawn heavier than a hard gate on a canvas whose subject is its gates.
 */
const FAMILY_CSS = LINK_FAMILIES.map((family) => {
  const style = LINE_FAMILY_STYLE[family]
  return (
    `.pg-line[data-family='${family}'] { stroke-width: ${style.width};` +
    `${style.dash === null ? '' : ` stroke-dasharray: ${style.dash};`} }`
  )
}).join('\n')

const PLAN_GRAPH_CSS = `
/* Position relative because the hidden boxes that get measured are positioned, and they are placed
   off to the left of THIS box rather than of whatever happens to be positioned further up. */
.pg { position: relative; display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
/* The days and the project, inside the summary block rather than as a third line of their own. */
.pg-where {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--pad);
  font-size: var(--fs-1);
  color: var(--text-3);
}
.pg-ws { color: var(--text-2); }
.pg-switch { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); margin-bottom: var(--pad); }

/* ---- the key ---- */
/* TWO COLUMNS OF ONE-WORD ENTRIES, and every sample is the real marker or the real stroke at its
   real size, so the drawing is checked against this rather than against a paragraph about it. */
.pg-legend {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(2, auto);
  justify-content: start;
  gap: 3px var(--pad-lg);
  margin-bottom: var(--pad);
  font-size: var(--fs-1);
  color: var(--text-2);
}
.pg-legend li { display: flex; align-items: center; gap: 6px; min-width: 0; white-space: nowrap; }
/* IN THE PLOT, IN THE CORNER. It cannot be pressed and it cannot be scrolled away from: the pane
   under it scrolls, this rides the frame. Opaque, because a legend you can read the drawing through
   is a legend you cannot read. */
.pg-legend-placed {
  position: absolute;
  right: var(--pad);
  top: var(--pad);
  z-index: 4;
  margin: 0;
  padding: 5px var(--pad);
  pointer-events: none;
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--elev-1);
  max-width: calc(100% - var(--pad-lg));
  overflow: hidden;
}
.pg-key {
  flex: 0 0 auto;
  width: 22px;
  height: 14px;
  border-radius: 2px;
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
}
.pg-key[data-role='goal'] { border-color: var(--plan-goal); border-left-width: var(--rail); }
.pg-key[data-role='deadline'] { border-style: double; border-width: 3px; border-color: var(--st-overdue-line); }
.pg-key[data-role='direction'] { border-style: dashed; border-color: var(--st-inferred-line); }
.pg-key[data-plan='allocated'] { box-shadow: inset var(--rail) 0 0 0 var(--accent); }
.pg-key-line { flex: 0 0 auto; overflow: visible; }

/* ---- a canvas card: a mark, a title and one word ---- */
.pg-cc {
  /* THE BOX THE SHARED CARD'S STATE MARK AND CONTROLS ARE PLACED AGAINST. */
  position: relative;
  box-sizing: border-box;
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  column-gap: 6px;
  row-gap: 2px;
  padding: 7px var(--pad);
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--elev-1);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
}
/* 1. THE DEADLINE — a double border and a heavier top rail. Two shape differences, so it survives
      greyscale and it survives a theme with no colour at all. */
.pg-cc[data-plan-role='deadline'] {
  border-style: double;
  border-width: 3px;
  border-color: var(--st-overdue-line);
  border-top-width: 5px;
  background: var(--st-overdue-row);
}
/* 2. THE FUTURE DIRECTION — dashed all the way round. Planned is not adopted. */
.pg-cc[data-plan-role='direction'] {
  border-style: dashed;
  border-color: var(--st-inferred-line);
  background: var(--st-inferred-row);
}
.pg-cc[data-plan-role='work'] { border-style: solid; border-color: var(--border-strong); }
/* 3. THE GOAL — its own ink, and a rail down the leading edge. Criterion P1. On the canvas the rail
      and the ink are the channels; the word "goal" is on the key and on the card in full. */
.pg-cc[data-plan-role='goal'] {
  border-style: solid;
  border-color: var(--plan-goal);
  border-left-width: var(--rail);
}
/* 4 and 5. ALLOCATED AND NOT — a filled rail down the inside edge, or nothing there. An inset shadow
   and NOT border-left: a border-left overrode the ROLE's border on one side, so a deadline came out
   double on three edges and dotted on the fourth, which reads as a rendering fault rather than as two
   facts. The two are orthogonal — a direction may be allocated — so they are two marks. */
.pg-cc[data-plan='allocated'] { box-shadow: inset var(--rail) 0 0 0 var(--accent), var(--elev-1); }
/* THE CARD THE PANEL IS ABOUT. Primacy by size and weight rather than by a hue: the urgency channel
   is spent on state and the identity channel is a rail, and this is neither — it is where to look. */
.pg-cc[data-anchor='1'] { box-shadow: var(--elev-2); }
.pg-cc[data-anchor='1'][data-plan='allocated'] { box-shadow: inset var(--rail) 0 0 0 var(--accent), var(--elev-2); }
.pg-cc[data-anchor='1'] .gx-card-title { font-size: var(--fs-3); }
.pg-cc[data-selected='1'] { outline: 2px solid var(--accent); outline-offset: 1px; }
.pg-mark { flex: 0 0 auto; color: var(--accent); font-size: var(--fs-1); }
.pg-cc[data-plan='unallocated'] .pg-mark,
.pg-chain-step[data-plan='unallocated'] .pg-mark { color: var(--text-3); }
/* ---- the shared card, drawn as a plan card ----
   WHAT IS SHARED IS THE CARD AND ITS LOOK; WHAT IS HERE IS WHAT THIS DRAWING DOES DIFFERENTLY.
   CardFace decides what a card says at the level it is at: the name, the body at levels 3 to 6,
   and the card's own controls. It is the same component the module and pipeline drawings draw,
   and it loads its own stylesheet, CARD_CSS in CardFace.tsx. The rules below are only this
   drawing's overrides: one row of a mark, a name and one word, with tighter gaps than the module
   drawing. They used to restate the shared rules as well, and the restated copies had drifted
   from the shared ones. */
/* EVERYTHING BUT THE PLAN MARK IS IN THE SECOND COLUMN, one row each. This used to be left to the
   grid's own placement, which put each element in the next free cell, so the card's words and its
   one word landed in the second column only while the card drew a certain number of other elements
   before them. With its controls drawn, the words fell into the first column. */
.pg-cc > * { grid-column: 2; min-width: 0; }
.pg-cc > .pg-mark { grid-column: 1; }
/* THE CARD'S WORDS ARE ONE CELL. The shared card draws them in a box that is display: contents,
   which here would make each of its parts a row of its own. The card is never cut to a dragged
   height on this drawing, so that box has nothing else to do here. */
.pg-cc > .gx-card-words { display: block; }
/* THE GRIPS ARE NOT DRAWN HERE. A grip resizes the card it finds by the module drawing's own class
   names, and a plan card has neither, so on this drawing a grip would be an edge that takes the
   pointer and does nothing. */
.pg-cc > .gx-grip { display: none; }
/* THE CARD'S OWN CONTROLS ARE A ROW INSIDE THE CARD HERE, and not hung below it as on the module
   drawing. This drawing's plane is as big as the cards it measured, and a strip hung outside a card
   is not in that measure, so under the lowest card it ran past the plane and the pane cut it off.
   The module drawing moves such a strip above the card instead, and that move reads the module
   drawing's own canvas, which this drawing does not have. A press already changes a card's size
   here, because a pressed card is drawn one step bigger, so a row inside it costs no second layout. */
.pg-cc > .gx-card-controls {
  position: static;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 4px;
  margin-top: 4px;
}
.pg-cc .gx-card-corner,
.pg-cc .gx-card-strip-holder {
  position: static;
  margin: 0;
}
.pg-cc .gx-card-head {
  gap: 4px 6px;
  margin-bottom: 0;
}
.pg-cc .gx-card-title {
  /* CLAMPED, AND PAID FOR THREE TIMES: the whole title is the card's own tooltip, it is the heading
     of the panel a press opens, and the list prints it. A card that wrapped a 96-character
     obligation title measured 206px tall, and fourteen of those was the plane this pass shrank. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* THE BODY, WHICH ONLY APPEARS WHEN A READER GROWS THE CARD. At the level this drawing opens at
   there is none; from level 3 up it is the record's own summary and then its parts. */
.pg-cc .gx-card-body { margin-top: 2px; }
/* THE CARD'S OWN CONTROLS, at this drawing's smaller size. They are on the card the reader pressed
   and on no other, which is CardFace's own rule. */
.pg-cc .gx-card-strip {
  gap: 2px 4px;
  padding: 0;
  background: none;
  border: 0;
  box-shadow: none;
  font-size: var(--fs-1);
}
.pg-cc .gx-marks { gap: 3px; margin-top: 2px; }
.pg-cc-chip {
  grid-column: 2;
  justify-self: start;
  max-width: 100%;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  border: var(--border-w) solid var(--border);
  background: var(--panel-2);
  color: var(--text-3);
  font-size: var(--fs-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---- a card in full, in the reading layer and in what a card opens ---- */
.pg-card {
  box-sizing: border-box;
  width: 100%;
  padding: var(--pad) var(--pad-lg);
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--elev-1);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
}
.pg-card[data-role='deadline'] {
  border-style: double;
  border-width: 3px;
  border-color: var(--st-overdue-line);
  border-top-width: 5px;
  background: var(--st-overdue-row);
}
.pg-card[data-role='direction'] {
  border-style: dashed;
  border-color: var(--st-inferred-line);
  background: var(--st-inferred-row);
}
.pg-card[data-role='work'] { border-style: solid; border-color: var(--border-strong); }
/* THE GOAL CARD, in full: the same ink and rail as the canvas card, so the two are one card. */
.pg-card[data-role='goal'] {
  border-style: solid;
  border-color: var(--plan-goal);
  border-left-width: var(--rail);
}
.pg-card[data-plan='allocated'] { box-shadow: inset var(--rail) 0 0 0 var(--accent), var(--elev-1); }
.pg-card-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; margin-bottom: 3px; }
.pg-card[data-plan='unallocated'] .pg-mark { color: var(--text-3); }
.pg-card-title {
  font: inherit;
  font-size: var(--fs-2);
  font-weight: 700;
  color: var(--text);
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  cursor: pointer;
  /* Titles hold mixed script. No uppercase, no letter-spacing, no truncation: they wrap. */
  overflow-wrap: anywhere;
  min-width: 0;
}
button.pg-card-title:hover { text-decoration: underline; text-underline-offset: .16em; }
.pg-card-role { font-size: var(--fs-1); font-weight: 600; color: var(--text-3); overflow-wrap: anywhere; }
.pg-card[data-role='goal'] .pg-card-role { color: var(--plan-goal); }
.pg-card[data-role='deadline'] .pg-card-role { color: var(--st-overdue); }
.pg-card[data-role='direction'] .pg-card-role { color: var(--st-inferred); }
.pg-card-within { margin-top: 2px; color: var(--text-3); overflow-wrap: anywhere; }
/* THE MARK LINE, in the waiting-on-a-person ink: it says the person has not pressed yet, so it is
   the same conclusion the ask token carries everywhere else, and the words carry it without hue. */
.pg-card-mark { margin-top: 3px; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--ask); overflow-wrap: anywhere; }
.pg-card-due { margin-top: 4px; font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
/* A deadline nobody dated reads as a question rather than as a date. */
.pg-card-due[data-dated='0'] { font-weight: 400; font-style: italic; color: var(--text-3); }
.pg-card-facts { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
.pg-card-facts div { display: flex; gap: 6px; min-width: 0; }
.pg-card-facts dt { flex: 0 0 auto; color: var(--text-3); }
.pg-card-facts dd { min-width: 0; color: var(--text-2); overflow-wrap: anywhere; }
.pg-card-plan {
  list-style: none;
  margin-top: 5px;
  padding-top: 4px;
  border-top: var(--border-w) solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--text);
  font-weight: 600;
}
.pg-card-unplanned { margin-top: 5px; padding-top: 4px; border-top: var(--border-w) solid var(--border); color: var(--text-3); }

.pg-nothing-joined {
  padding: var(--pad-lg);
  font-size: var(--fs-2);
  line-height: var(--lh-read);
  color: var(--text);
  background: var(--st-inferred-row);
  border: var(--border-w) solid var(--st-inferred-line);
  border-radius: var(--radius-sm);
  max-width: var(--measure-in-box);
}

/* ---- the pane ---- */
/* Position relative is what the legend in the corner is positioned against. No backtick in here. */
.pg-canvas-wrap { position: relative; border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); overflow: hidden; background: var(--panel); }
.pg-canvas { position: relative; min-height: 240px; background: var(--panel-2); overflow: auto; }
.pg-plane { position: relative; }
/* The zoom is a transform on the inner plane and the outer one carries the scaled size, so the
   scrollbars measure what is actually drawn. transform-origin at the corner, so a scroll position
   worked out in plane coordinates times the zoom is where that point really is. */
.pg-plane-inner { transform-origin: 0 0; padding: ${CANVAS_PAD}px; box-sizing: content-box; }
.pg-lines { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.pg-node { position: absolute; }
/* Hidden rather than absent: an element that is display:none has no size, and this pass exists to
   be measured. Off to the side so it cannot be scrolled to. */
.pg-measure { position: absolute; left: -10000px; top: 0; visibility: hidden; pointer-events: none; }
.pg-measure-card { width: ${CARD_WIDTH}px; }
.pg-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 5px var(--pad-lg);
  border-top: var(--border-w) solid var(--border);
  background: var(--panel);
  font-size: var(--fs-1);
}
.pg-bar-btn {
  font: inherit;
  padding: 2px 8px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  color: var(--text-2);
  cursor: pointer;
}
.pg-bar-btn:hover { color: var(--text); }
.pg-zoom-readout { min-width: 3.4em; text-align: center; color: var(--text); font-weight: 700; }
.pg-fit-note { color: var(--text-3); }
.pg-canvas-state {
  padding: 5px var(--pad-lg);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
  border-top: var(--border-w) solid var(--border);
  background: var(--panel);
}

/* ---- bands ---- */
.pg-bands { display: flex; flex-direction: column; gap: ${BAND_GAP}px; align-items: flex-start; }
.pg-band {
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  min-width: 0;
}
.pg-bands .pg-band { align-self: stretch; }
.pg-band-head { padding: 7px var(--pad-lg) 4px; border-bottom: var(--border-w) solid var(--border); }
/* The heading rides the horizontal scroll rather than sitting at the band's own left edge, which on
   a band wider than the pane is off screen the moment the pane opens on the anchor. It stops as far
   in from the pane's edge as the edge fade is deep (reach-edge, from InReach.tsx). At the edge itself
   the fade lay over the caret and the first letter of every line, so a folded group read "olded
   because". */
.pg-band-head-in { position: sticky; left: var(--reach-edge); display: inline-block; max-width: 100%; min-width: 0; }
.pg-band[data-folded='1'] .pg-band-head { border-bottom: 0; }
.pg-band-toggle {
  font: inherit;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  cursor: pointer;
  text-align: left;
}
.pg-band-caret { color: var(--text-3); }
.pg-band-name { font-size: var(--fs-3); font-weight: 700; overflow-wrap: anywhere; }
.pg-band-counts { margin-top: 3px; font-size: var(--fs-1); }
.pg-band-why { margin-top: 2px; font-size: var(--fs-1); color: var(--text-3); }
.pg-band-plane { position: relative; }
.pg-band-waiting { padding: var(--pad) var(--pad-lg); font-size: var(--fs-1); color: var(--text-3); }
.pg-band-unrouted { padding: 4px var(--pad-lg); font-size: var(--fs-1); color: var(--st-failed); }

/* ---- a straight run, as one row ---- */
/* Sticky for the same reason the heading is: a run is far narrower than the band it shares a plane
   with, so at the scroll position the pane opens on, its first chips were off the left edge. */
.pg-chain { position: sticky; left: var(--reach-edge); display: inline-block; max-width: 100%; padding: 6px var(--pad-lg) var(--pad); }
.pg-chain-word { font-size: var(--fs-1); color: var(--text-3); margin-bottom: 5px; }
.pg-chain-word b { color: var(--text-2); }
/* CAPPED SO THE RUN WRAPS RATHER THAN RUNNING OFF THE PANE. Five chips at their widest are about
   1,400px, and a strip wider than the window is the fault this replaced, in miniature: sticky can
   only slide an element as far as its own containing block allows, and a photograph caught the
   first chip clipped to "ve 4B". Two rows of chips is still a twentieth of the five ELK layers. */
.pg-chain-row { list-style: none; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; max-width: min(1040px, 74vw); }
.pg-chain-row li { display: flex; align-items: center; gap: 4px; min-width: 0; }
.pg-chain-arrow { color: var(--text-3); font-size: var(--fs-2); }
.pg-chain-step {
  font: inherit;
  font-size: var(--fs-1);
  display: flex;
  align-items: baseline;
  gap: 5px;
  max-width: 22em;
  padding: 4px 8px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text-2);
  cursor: pointer;
  text-align: left;
}
.pg-chain-step[data-plan='allocated'] { box-shadow: inset var(--rail) 0 0 0 var(--accent); }
.pg-chain-step[data-anchor='1'] { box-shadow: var(--elev-2); }
.pg-chain-step[data-selected='1'] { outline: 2px solid var(--accent); outline-offset: 1px; }
.pg-chain-name { font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ---- a line ---- */
/* THE FAMILY DECIDES WEIGHT AND DASH; the ARROWHEAD is decided by whether shared/types.ts calls the
   type symmetric, which is why there is no rule here that removes one. */
.pg-line { fill: none; stroke: var(--border-strong); stroke-width: 1.5; }
${FAMILY_CSS}
.pg-line[data-family='unclassified'] { stroke-dasharray: 1 4; }
.pg-line[data-gated='1'] { stroke: var(--st-blocked); }
.pg-line[data-broken='1'] { stroke: var(--st-broken); stroke-dasharray: 5 4; }
.pg-line[data-lit='1'] { stroke: var(--accent); }
.pg-line-hit { fill: none; stroke: transparent; stroke-width: 16; pointer-events: stroke; cursor: default; }
.pg-arrow { fill: var(--border-strong); }
/* CAPPED IN CSS, NOT BY CUTTING THE STRING. A partial gate's words are a whole sentence — "only as
   far as the figures can be drafted; the force table cannot" — and an uncapped pill is a strip
   across the drawing. Nothing reserves room for this any more: it is drawn on top, on demand. */
.pg-line-label {
  display: inline-block;
  max-width: 22em;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
  box-shadow: var(--elev-1);
  font-size: var(--fs-1);
  line-height: 1.3;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pg-line-label[data-placed='1'] { position: absolute; transform: translate(-50%, -50%); pointer-events: none; z-index: 3; }
.pg-line-gate { color: var(--st-blocked); }

/* ---- what a card opens ---- */
.pg-detail {
  margin-top: var(--pad);
  padding: var(--pad) var(--pad-lg);
  border: var(--border-w) solid var(--border-strong);
  border-left: var(--rail) solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--panel);
  display: flex;
  flex-direction: column;
  gap: var(--pad);
  min-width: 0;
}
.pg-detail-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--pad); }
.pg-detail-title { font-size: var(--fs-3); font-weight: 700; color: var(--text); overflow-wrap: anywhere; min-width: 0; }
.pg-detail-settled { font-size: var(--fs-1); color: var(--text-2); }
.pg-detail-open { font-size: var(--fs-1); }

/* ---- the reading layer ---- */
.pg-list { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.pg-row { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
/* MARKED, BECAUSE IT IS A LIST. Six unmarked rows of "word · name · condition" read as a paragraph
   that had been broken oddly; a bullet in front of each is what makes them count as six things.
   The bullet is drawn rather than left to list-style: a row is a flex line so it can wrap without
   the name splitting, and a flex item draws no marker of its own. */
.pg-row-links { list-style: none; display: flex; flex-direction: column; gap: 3px; padding-left: var(--pad-lg); }
.pg-row-links li::before, .pg-elsewhere-list li::before { content: '•'; flex: 0 0 auto; color: var(--text-3); }
.pg-row-links li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: var(--fs-1); min-width: 0; }
.pg-row-word { color: var(--text-3); font-weight: 600; }
.pg-row-gate { color: var(--st-blocked); }
.pg-row-none { padding-left: var(--pad-lg); font-size: var(--fs-1); color: var(--text-3); }

/* ---- what the plan names in another project ---- */
.pg-elsewhere {
  margin-top: var(--pad);
  padding: var(--pad) var(--pad-lg);
  border: var(--border-w) solid var(--border);
  border-left: var(--rail) solid var(--st-inferred-line);
  border-radius: var(--radius-sm);
  background: var(--st-inferred-row);
  min-width: 0;
}
.pg-elsewhere-head { margin: 1em 0; font-size: var(--fs-1); line-height: var(--lh-read); color: var(--text); }
.pg-elsewhere-head .num { font-weight: 700; }
.pg-elsewhere-list { list-style: none; margin-top: 5px; padding-left: var(--pad); display: flex; flex-direction: column; gap: 4px; }
.pg-elsewhere-list li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: var(--fs-1); min-width: 0; }
.pg-elsewhere-ws { color: var(--text-3); }
.pg-elsewhere-hours { color: var(--text-2); }
.pg-gone { color: var(--st-failed); }

/* ---- what is left out ---- */
.pg-omitted, .pg-omitted-none, .pg-omitted-count {
  margin-top: var(--pad);
  font-size: var(--fs-1);
  line-height: var(--lh-read);
  color: var(--text-2);
}
/* NUMBERED. Five reasons with no markers read as one broken paragraph; the count and the kind are
   the item, and the reason is a second line under it in the quieter ink. */
.pg-omitted { list-style: decimal; padding-left: 1.6rem; display: flex; flex-direction: column; gap: 5px; }
.pg-omitted li::marker { color: var(--text-3); font-variant-numeric: tabular-nums; }
.pg-omitted-what { display: block; color: var(--text); }
.pg-omitted .num { color: var(--text); font-weight: 700; }

@media (max-width: 480px) {
  .pg-canvas { min-height: 220px; }
  /* ON A PHONE THE KEY STOPS FLOATING. A legend in the corner of a plot is fine when the plot is
     1,100px wide and covers a fifth of one when it is 330px. It stays inside the drawing frame,
     as a strip along the top, so it explains the picture without standing on it. */
  .pg-legend-placed {
    position: static;
    max-width: none;
    margin: 0;
    border: 0;
    border-bottom: var(--border-w) solid var(--border);
    border-radius: 0;
    box-shadow: none;
    padding: 5px var(--pad-lg);
  }
}
`
