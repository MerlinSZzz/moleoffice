// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * THE DERIVED LAYER: where every box goes, where every line runs, and how big the window onto it is.
 * Computed on each draw, and never stored.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE LAYERS, AND WHICH ONE THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/presentation.ts` states the boundary and this file obeys it:
 *
 *   1. CANONICAL — records, links, gates, step `needs`. `model.ts` reads it.
 *   2. PRESENTATION INTENT — direction, lane, order, role, emphasis, collapsed, near. Stored, and
 *      already resolved onto every node by `model.ts` as `node.presentation`.
 *   3. DERIVED — this file. Every x, every y, every node size, every edge route, the height of the
 *      window and the zoom it opens at. Worked out here on every draw and thrown away.
 *
 * Nothing here is written anywhere. There is no schema field for a coordinate and no request in this
 * directory carries one.
 *
 * ---------------------------------------------------------------------------------------
 * A HINT THAT DID NOTHING IS THE FAILURE THIS FILE EXISTS TO MAKE IMPOSSIBLE
 * ---------------------------------------------------------------------------------------
 *
 * `model.ts` answers for the hints it can answer for on its own — direction, role, emphasis,
 * collapsed, and whether a `near` names anything that is drawn here. It cannot answer for `lane`,
 * `order` or the adjacency half of `near`, because those are questions about a finished layout: ELK
 * takes an order only when it can, and it will not tangle a graph to put two boxes side by side.
 *
 * So this file MEASURES what ELK did against what was asked for, and appends its own entries to the
 * same `LayoutReport`. Every hint ends up in `honoured` or in `unhonoured` with the reason in words.
 * A hint in neither list has been dropped silently, and that is the one outcome this product bans.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE WHOLE DRAWING NO LONGER HAS TO FIT ON THE SCREEN
 * ---------------------------------------------------------------------------------------
 *
 * The canvas used to open fitted: the window was sized to the drawing's own proportions and the view
 * was scaled until everything was inside it. On the seeded workspace that settled at 0.36 — a 280px
 * card drawn 100px wide, with its type about four pixels tall. Every other fault in the picture came
 * out of that one decision. The lines were there and were hidden under their own labels; the
 * arrowheads were there and were three pixels across; the words on the cards were there and could
 * not be read. A drawing nobody can read is not a smaller drawing, it is a different product.
 *
 * So the window now opens at READING SIZE and the reader pans. Fitting the whole thing is still one
 * press away and is named in words — it is an ANSWER TO A QUESTION somebody asked, not the state a
 * page lands in. `openingViewport` below is the whole of that decision.
 *
 * ---------------------------------------------------------------------------------------
 * SIZES ARE MEASURED, NOT GUESSED — AND THAT NOW INCLUDES THE WORDS ON THE LINES
 * ---------------------------------------------------------------------------------------
 *
 * ELK needs a width and a height for everything it places. Estimating them from a character count is
 * wrong here for a reason this project states as a hard constraint: titles may be Chinese, like
 * `倒片台安全护罩` and `把 1923 年缺的 12 期列成清单`, and Chinese characters are wider and do not wrap at spaces.
 *
 * The caller renders the cards AND the words that sit on the lines where they cannot be seen, lets
 * the browser measure both, and passes the measurements in. Measuring the line labels is new and it
 * fixes a fault a photograph found: ELK left 90px between two layers, a partial gate's label is
 * "waits on · PARTIAL GATE · kinematics checked in simulation", and the pill was drawn straight
 * across the card next door. Given the label's real size, ELK reserves room for it instead.
 */

import type { ElkExtendedEdge, ElkLabel, ElkNode, LayoutOptions } from 'elkjs/lib/elk-api.js'
import type { LayoutReport } from '@shared/presentation.ts'
import { BOX_MAX, BOX_MIN, MAX_ZOOM } from './card.ts'
import type { GraphEdge, GraphNode, Scope, StructureGraph } from './model.ts'

// ============================================================================ options

/**
 * The layout options, written down once.
 *
 * `layered` is the algorithm for a directed graph with a reading direction, which is what both
 * scopes are: modules point at the modules they consume and measure, steps point at the steps that
 * wait on them.
 *
 * `INCLUDE_CHILDREN` is what makes the compound case work — a `carries` line runs from a module
 * outside the pipeline box to a step inside it, and without this ELK treats the box as opaque and
 * routes to its edge instead of to the step.
 *
 * `ORTHOGONAL` routing replaces the POLYLINE that was here. The paths ELK returns are now DRAWN
 * rather than thrown away and re-guessed by the canvas, so a line goes round a card instead of
 * through it and its label sits where ELK reserved room for it. That is the difference between a
 * line you can follow to a box and a line you have to guess about.
 *
 * These are ordinary strings because that is elkjs's interface; the names are ELK's, not ours.
 */
export const LAYOUT_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  // Room between one layer and the next, for a line to run in.
  //
  // SMALLER THAN THE 90 IT REPLACES, AND THE DRAWING IS LOOSER, which is not a contradiction. ELK
  // puts a centred edge label in a layer of its own, so the real gap between two cards is this
  // spacing twice plus the size of the words between them — about 300px where a partial gate says
  // how far it lets you go, and about 150 where a line carries one word. That is the room the labels
  // used to be drawn over the top of the next card for want of. Left at 90 the same arithmetic gave
  // 300px of empty grey between every pair of rows on the modules drawing, which a photograph showed.
  'elk.layered.spacing.nodeNodeBetweenLayers': '64',
  'elk.spacing.nodeNode': '44',
  'elk.spacing.edgeNode': '32',
  'elk.spacing.edgeEdge': '18',
  'elk.spacing.edgeLabel': '8',
  'elk.spacing.componentComponent': '64',
  'elk.padding': '[top=48,left=28,bottom=28,right=28]',
  'elk.edgeRouting': 'ORTHOGONAL',
  // The word on a line belongs in the middle of it, between the two boxes it joins. ELK inserts a
  // dummy of the label's own size there, which is what stops a label landing on a card.
  'elk.edgeLabels.placement': 'CENTER',
  // A stable, deterministic node order, and the mechanism that a stored `lane`, `order` and `near`
  // reach ELK through — see `positionHints`. Without it ELK is free to break ties differently
  // between runs, and the whole no-stored-positions rule depends on two runs agreeing.
  'elk.layered.crossingMinimization.semiInteractive': 'true',
}

/**
 * Which way this particular drawing flows.
 *
 * IT IS NOT DECIDED HERE ANY MORE. `model.ts` resolves it: stored presentation intent when somebody
 * said, and Mole Office's own measured answer when nobody did, with `directionBecause` saying which. Two
 * files with their own opinion about the direction is how a line ends up leaving the wrong side of a
 * card, so this translates the stored word into ELK's and nothing else.
 */
export type FlowDirection = 'RIGHT' | 'DOWN'

export function directionFor(graph: StructureGraph): FlowDirection {
  return graph.direction === 'down' ? 'DOWN' : 'RIGHT'
}

/**
 * HOW THE LAYOUT RUNS IN EACH PLACE A DRAWING IS DRAWN — the geometry half of a place's
 * configuration.
 *
 * THE OTHER HALF IS `DRAWING_PLACES` IN model.ts, and this is not a second list. model.ts is the
 * meaning of a drawing and its own header forbids geometry in it: no x, no y, no ELK option. So the
 * one part of a place's configuration that IS geometry is declared here, keyed by the same word and
 * exhaustive over it — adding a place to `Scope` fails to compile until both are filled in.
 */
export const LAYOUT_AT: Readonly<Record<Scope['at'], LayoutOptions>> = {
  modules: LAYOUT_OPTIONS,
  pipeline: LAYOUT_OPTIONS,
  /**
   * The plan drawing packs tighter, and every number here was measured on the live corpus.
   *
   * `LAYOUT_OPTIONS`'s node spacing gave a 2,645px plane for fourteen plan cards, of which three
   * were fully visible in a 1,144px pane. These are the numbers the plan drawing was already laid
   * out with before it was folded into this component, kept exactly, so the fold changed how the
   * drawing is built and not how tightly it packs.
   *
   * `separateConnectedComponents` and the room between two of them is what draws the groups. The
   * plan drawing used to find its own connected components and stack them as bands with a heading
   * each; ELK separates them for nothing, and the headings moved to the line under the drawing.
   */
  plan: {
    ...LAYOUT_OPTIONS,
    'elk.layered.spacing.nodeNodeBetweenLayers': '64',
    'elk.spacing.nodeNode': '28',
    'elk.spacing.edgeNode': '24',
    'elk.spacing.edgeEdge': '14',
    'elk.padding': '[top=14,left=16,bottom=16,right=16]',
    'elk.separateConnectedComponents': 'true',
    'elk.spacing.componentComponent': '48',
  },
}

export function layoutOptionsFor(graph: StructureGraph): LayoutOptions {
  return { ...LAYOUT_AT[graph.scope.at], 'elk.direction': directionFor(graph) }
}

/**
 * How to move layout off the main thread, when it is ever worth it.
 *
 * Kept as a sentence rather than as dead code: elkjs's constructor takes `workerFactory`, and Vite
 * builds a worker from `new Worker(new URL('elkjs/lib/elk-worker.min.js', import.meta.url))`. The
 * cost is a second way for the canvas to fail that the current arrangement does not have.
 */
export const WORKER = 'not used — see the header. elkjs ships elk-worker.min.js and the constructor takes workerFactory.'

// ============================================================================ folding is not done here

/**
 * WHERE `collapsed` IS APPLIED, AND WHY IT IS NOT HERE.
 *
 * `model.ts` folds. It reads the stored `collapsed` before it builds the nodes, leaves the steps of
 * a folded pipeline out of the graph entirely, carries the count on the box as a badge, names them
 * in `omitted`, and replaces the lines that would have landed on a step with one line per module
 * that says how many steps it stands for.
 *
 * So there is nothing for this file to fold, and writing a second fold here is the duplication this
 * codebase keeps producing: two implementations of one rule with nothing making them agree. A folded
 * drawing arrives here as an ordinary smaller graph, and every node in it is placed the same way.
 */

// ============================================================================ the ELK graph

export interface Size {
  width: number
  height: number
}

/** Where one node ended up. Relative to its parent, which is also what React Flow expects. */
export interface Placement {
  x: number
  y: number
  width: number
  height: number
}

/** Where one line runs, in the canvas's own coordinates, and where its words go. */
export interface EdgeRoute {
  /** Start, every bend, end. Two points is a straight line; more is a route round something. */
  points: { x: number; y: number }[]
  /** The middle of the room ELK reserved for the words on this line. Null when it reserved none. */
  label: { x: number; y: number; width: number; height: number } | null
}

export interface LayoutResult {
  /** node id -> where it goes. Every node in the drawing is here, or the run failed and said so. */
  placements: Map<string, Placement>
  /** drawn edge id -> the route ELK worked out. Missing means ELK returned no path for that line. */
  routes: Map<string, EdgeRoute>
  /** What was done with the presentation intent, with the model's entries and this file's. */
  report: LayoutReport
  /** How long ELK took, in milliseconds, so a slow graph is visible rather than just slow. */
  ms: number
}

/**
 * How far apart two lanes are put in the ordering ELK is given.
 *
 * NOT A DISTANCE ON SCREEN. It is a gap in the sort key, big enough that no `order` inside one lane
 * can reach into the next one — a lane is a group and an order is a place inside it, and the two
 * must not be able to swap roles. Nothing here reaches the drawing: ELK reads these to decide which
 * node comes before which within a layer and then works the real coordinates out for itself.
 */
const LANE_STRIDE = 1_000_000

/**
 * The sort key each node is handed to ELK with, when anything at all has been arranged.
 *
 * ELK's semi-interactive crossing minimisation reads `elk.position` and uses it to order the nodes
 * WITHIN a layer. That is exactly the shape of `lane` and `order`: a lane is which band you are in,
 * and an order is where you sit in it. So the two become one number, lanes first.
 *
 * ONLY WHEN SOMETHING WAS ARRANGED. With no lane, no order and no `near` anywhere, no position is
 * set at all and ELK orders the drawing the way it always has. Handing it positions for a drawing
 * nobody arranged would move the picture for every reader, to no purpose.
 *
 * `near` is the weak one and it says so in shared/presentation.ts: it nudges a node to sit just
 * after the one it names, and if ELK will not put them together the report says so.
 */
export function positionHints(nodes: readonly GraphNode[]): Map<string, number> {
  const arranged = nodes.some(
    (node) => node.presentation.lane !== null || node.presentation.order !== null || node.presentation.near !== null,
  )
  if (!arranged) return new Map()

  // First-met order, not alphabetical: a lane is a name somebody chose and the first one they wrote
  // is the first one they meant. `model.ts` has already sorted the array the same way.
  const laneRank = new Map<string, number>()
  for (const node of nodes) {
    const lane = node.presentation.lane
    if (lane !== null && !laneRank.has(lane)) laneRank.set(lane, laneRank.size)
  }
  const keys = new Map<string, number>()
  nodes.forEach((node, index) => {
    const lane = node.presentation.lane
    // A node in no lane sorts after every named lane. It is not part of the arrangement, so it does
    // not get to break one up.
    const band = lane === null ? laneRank.size : (laneRank.get(lane) ?? laneRank.size)
    keys.set(node.id, band * LANE_STRIDE + (node.presentation.order ?? index))
  })
  // `near` last, so it can only move a node relative to keys that are already settled. Half a step
  // after the node it names puts it immediately behind it without displacing anything else.
  for (const node of nodes) {
    const beside = node.presentation.near
    if (beside === null) continue
    const anchor = keys.get(beside)
    if (anchor === undefined) continue
    keys.set(node.id, anchor + 0.5)
  }
  return keys
}

/**
 * The words ELK is told a line carries, which must never be empty.
 *
 * ELK decides whether to reserve room for a label by looking at its TEXT, not at its size: a label
 * with none is handed back at the origin and the layers are packed as though it were not there. The
 * canvas measures the real pill and passes the size; this passes the words that are in it, and the
 * fall-back is the relation rather than a space, so a line whose label is somehow blank still gets
 * room and is still drawn between its two cards.
 */
export function elkLabelText(edge: GraphEdge): string {
  const words = [edge.label, edge.gateWords].filter((part): part is string => part !== null && part.trim() !== '')
  return words.length > 0 ? words.join(' · ') : edge.relation
}

/**
 * Build the ELK input from the meaning, the measured sizes and the presentation intent.
 *
 * SEPARATE FROM RUNNING IT ON PURPOSE. This is a pure function of its arguments, so a test with no
 * DOM can check that the same meaning and the same intent always produce byte-identical input —
 * which is half of the reproducibility property, and the half that can fail because of something we
 * wrote rather than something ELK did.
 *
 * The children of a compound node are nested, and edges between two children are hung on the parent
 * because ELK requires an edge to live in the lowest container holding both of its ends.
 */
/**
 * HOW MUCH ROOM A PIPELINE BOX'S HEAD NEEDS WHEN NOBODY HAS MEASURED IT, and the gap under it.
 *
 * The steps inside a box are placed from the box's top padding down, so the padding IS the room the
 * head has. 68 was the number for a head holding a name, a state and a few marks. A head holds more
 * than that now: the record's own line at level 3, its parts at levels 4 to 6, and — on the box the
 * reader has pressed — its own size, detail and level controls. Each of those wraps the head onto
 * another line, and a first step drawn over them is a control nobody can press. A browser test
 * found exactly that: five controls on the box, none of them at a point a press would reach, with
 * the step card's own head and marks in the way.
 *
 * SO THE HEAD IS MEASURED AND NOT GUESSED, which is the same rule the cards themselves follow —
 * `toElkGraph` refuses to lay out a node whose size nobody measured. `headRoom` below carries the
 * measurement; this is the floor for a box whose head this browser has not drawn yet, and
 * `UNDER_A_HEAD` is the gap between the head and the first step.
 */
const A_HEAD_AT_LEAST = 68
const UNDER_A_HEAD = 12

export function toElkGraph(
  graph: StructureGraph,
  sizes: ReadonlyMap<string, Size>,
  labelSizes: ReadonlyMap<string, Size> = new Map(),
  /**
   * HOW TALL EACH COMPOUND NODE'S HEAD IS DRAWN, in layout pixels, keyed by the node's id.
   *
   * Measured off the drawn head by the canvas, in the same pass that reads the card sizes. A node
   * missing from the map is a box this browser has not drawn yet, and it gets the floor.
   */
  headRoom: ReadonlyMap<string, number> = new Map(),
): ElkNode {
  const missing = graph.nodes.filter((node) => !sizes.has(node.id)).map((node) => node.id)
  if (missing.length > 0) {
    throw new Error(
      `toElkGraph was given no measured size for ${missing.length} node${missing.length === 1 ? '' : 's'} (${missing
        .slice(0, 4)
        .join(', ')}). Sizes are measured from the rendered cards, never estimated — see the header.`,
    )
  }

  const options = layoutOptionsFor(graph)
  const down = directionFor(graph) === 'DOWN'
  const hints = positionHints(graph.nodes)
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const children = new Map<string, ElkNode[]>()
  const elkById = new Map<string, ElkNode>()
  const roots: ElkNode[] = []

  // Stored order, so the ELK input is identical for identical meaning. Sorting by id here would be
  // just as deterministic and would throw away the order the record stores its steps in, which is
  // the order the work happens in and the tie-break a reader expects.
  graph.nodes.forEach((node, index) => {
    const size = sizes.get(node.id) as Size
    const elk: ElkNode = { id: node.id, width: size.width, height: size.height }
    // A NODE INSIDE A BOX GETS ITS STORED PLACE AS ITS POSITION when nothing was arranged (wave 13u
    // round 217). The steps of a pipeline are stored in the order the work happens in, and a box draws
    // them in that order. Without a position ELK breaks a tie inside one layer its own way, and it put
    // step 03 above step 02 in a box whose steps no drawn line joins. Top-level nodes still get no
    // position unless something was arranged, for the reason `positionHints` gives.
    const key = hints.get(node.id) ?? (node.parentId !== null ? index : undefined)
    if (key !== undefined) {
      // The secondary axis is the one an in-layer order runs along: down the page when the drawing
      // runs right, across it when the drawing runs down.
      elk.layoutOptions = { 'elk.position': down ? `(${key},0)` : `(0,${key})` }
    }
    elkById.set(node.id, elk)
    if (node.parentId === null) roots.push(elk)
    else {
      const list = children.get(node.parentId)
      if (list === undefined) children.set(node.parentId, [elk])
      else list.push(elk)
    }
  })
  for (const [parentId, list] of children) {
    const parent = elkById.get(parentId)
    if (parent === undefined) {
      throw new Error(`Node "${list[0]?.id}" names a parent "${parentId}" that is not in the graph.`)
    }
    parent.children = list
    // THE OPTIONS ARE REPEATED ON THE PARENT, NOT INHERITED. A compound node lays its children out
    // with ELK's own defaults unless it carries the options itself, and ELK's default gap between
    // layers is 20px — so nine step cards came out twenty pixels apart and every line between them
    // was a twenty-pixel stub nobody could see. A photograph found it, and the geometry in the DOM
    // named it. Spread first, so anything added to LAYOUT_OPTIONS reaches the inside of a pipeline
    // as well as the outside of it.
    //
    // Its own size is then decided by what is inside it, so the measured size of the pipeline card
    // is a MINIMUM rather than the answer.
    /**
     * THE ROOM THE READER ASKED FOR IS SPENT BETWEEN THE STEPS — CRITERION D35.
     *
     * `elk.nodeSize.minimum` makes the box at least as big as the reader asked for, and on its own
     * that is all it does: ELK places the steps from the box's padding at the usual spacing and
     * leaves the rest of the box empty. Measured on the owner's own pipeline, dragging the box's bottom-right
     * grip: the box went from 3578 x 631 to 4312 x 760, and 0 of its 10 steps moved and 0 of its 11
     * lines were redrawn. That is not enough: changing the box's size has to rearrange the steps and
     * their lines by itself.
     *
     * So the extra room is spread between the steps, which is the one thing a reader asking for a
     * bigger box can mean. The gap between one step and the next grows by the leftover width shared
     * out among the gaps, and the gap between rows by the leftover height. A box nobody has dragged
     * asks for nothing and gets the ordinary spacing, to the pixel.
     */
    const across = down ? (parent.height ?? 0) : (parent.width ?? 0)
    const alongside = down ? (parent.width ?? 0) : (parent.height ?? 0)
    /**
     * THE WORDS ON THE LINES COUNT TOWARDS THE ROOM ALREADY TAKEN, and leaving them out is what made
     * the first version of this overshoot. ELK puts a centred edge label in a layer of its own, so
     * two steps with `waits on` between them are one label wider apart than two steps with nothing.
     * Measured on the same pipeline: a box asked for 4294 pixels came out 6538, because every gap was
     * given room the labels were already taking.
     */
    const inside = new Set(list.map((child) => child.id))
    const labelsAlong = graph.edges
      .filter((edge) => inside.has(edge.from) && inside.has(edge.to))
      .reduce((sum, edge) => sum + ((down ? labelSizes.get(edge.id)?.height : labelSizes.get(edge.id)?.width) ?? 0), 0)
    const stepsAlong =
      list.reduce((sum, child) => sum + ((down ? child.height : child.width) ?? 0), 0) + labelsAlong
    const widest = list.reduce((most, child) => Math.max(most, (down ? child.width : child.height) ?? 0), 0)
    const gaps = Math.max(1, list.length - 1)
    const head = Math.max(A_HEAD_AT_LEAST, Math.ceil(headRoom.get(parent.id ?? '') ?? 0) + UNDER_A_HEAD)
    const sides = 48 + (down ? head : 0)
    const betweenLayers = Number(options['elk.layered.spacing.nodeNodeBetweenLayers'] ?? 64)
    const betweenRows = Number(options['elk.spacing.nodeNode'] ?? 44)
    /**
     * A GAP COSTS THE SPACING TWICE. ELK puts a centred edge label in a layer of its own, so between
     * two steps there is spacing, then the label, then spacing again. Counting it once made the
     * spread spend the same room twice and the box came out about three times the size asked for:
     * measured on a four-step pipeline, a drag of 356 pixels grew the box by 1056.
     */
    const spare = Math.max(0, across - stepsAlong - sides - 2 * betweenLayers * gaps)
    const spareAcross = Math.max(0, alongside - widest - (down ? 48 : head + 24))
    parent.layoutOptions = {
      ...options,
      ...(parent.layoutOptions ?? {}),
      'elk.padding': `[top=${String(head)},left=24,bottom=24,right=24]`,
      'elk.layered.spacing.nodeNodeBetweenLayers': String(Math.round(betweenLayers + spare / (2 * gaps))),
      'elk.spacing.nodeNode': String(Math.round(betweenRows + spareAcross / 2)),
      'elk.nodeSize.constraints': 'NODE_LABELS MINIMUM_SIZE',
      'elk.nodeSize.minimum': `(${parent.width ?? 0},${parent.height ?? 0})`,
    }
  }

  const rootEdges: ElkExtendedEdge[] = []
  const nestedEdges = new Map<string, ElkExtendedEdge[]>()
  for (const edge of graph.edges) {
    const from = nodeById.get(edge.from)
    const to = nodeById.get(edge.to)
    // An edge with an end that is not on this canvas is not laid out. It is not dropped from the
    // MEANING — model.ts keeps it and the drawing reports it — it simply has nothing to connect.
    if (from === undefined || to === undefined) continue
    const elkEdge: ElkExtendedEdge = { id: edge.id, sources: [edge.from], targets: [edge.to] }
    // The measured size of the words that ride on this line, so ELK keeps room for them instead of
    // leaving them to be drawn over the card next door.
    //
    // A LINE THAT IS ONLY DRAWN ON SELECTION IS LAID OUT BUT NEVER LABELLED, and both halves of that
    // matter. It is LAID OUT because a revealed line has to run round the cards like every other one:
    // dropping it from ELK would leave it with no route at all, so selecting a step would draw a
    // straight bar across the drawing. It is NOT LABELLED because ELK puts a centred edge label in a
    // layer of its own — ten "carries" pills therefore cost a whole extra column of the drawing, plus
    // the room round it, for words that are not on screen. Reserving space for what is not drawn is
    // the empty grey this file already had to remove once.
    const label = edge.drawn === 'always' ? labelSizes.get(edge.id) : undefined
    if (label !== undefined && label.width > 0 && label.height > 0) {
      elkEdge.labels = [
        {
          id: `${edge.id}:label`,
          // THE TEXT IS REQUIRED, and finding that out cost an afternoon. ELK skips an edge label
          // whose text is missing or empty — it keeps the object, hands it straight back with
          // x = 0 and y = 0, and reserves no room for it. So every label was drawn at the origin of
          // the drawing, five of them in one heap outside the top-left corner with no line near any
          // of them, which is exactly what the photographs showed. The words are what the label
          // says, so nothing here is a placeholder; `elkLabelText` guarantees it is never empty.
          text: elkLabelText(edge),
          width: label.width,
          height: label.height,
        } satisfies ElkLabel,
      ]
    }
    const container = from.parentId !== null && from.parentId === to.parentId ? from.parentId : null
    if (container === null) rootEdges.push(elkEdge)
    else {
      const list = nestedEdges.get(container)
      if (list === undefined) nestedEdges.set(container, [elkEdge])
      else list.push(elkEdge)
    }
  }
  for (const [parentId, list] of nestedEdges) {
    const parent = elkById.get(parentId)
    if (parent !== undefined) parent.edges = list
  }

  return { id: 'root', layoutOptions: options, children: roots, edges: rootEdges }
}

/** The one thing this file needs from ELK. Named so a caller can hand in its own loader. */
export interface ElkLike {
  layout(graph: ElkNode): Promise<ElkNode>
}

/**
 * Load ELK. The lazy import that keeps 8 MB of compiled Java out of the first paint.
 *
 * IT IS A PARAMETER OF `layoutGraph` AND NOT A HARD-WIRED CALL, for one measured reason. elkjs
 * ships a browser build and a Node build under the same specifier: in a browser it lays out in
 * process, and under Node it wraps itself in a worker shim. The test runner is Node, and the shim
 * does not survive the runner's CommonJS interop — `new Worker` comes back undefined and every
 * layout throws. Making the loader injectable lets the test hand in the same library, loaded the way
 * Node loads it, and check the property that matters; the browser path below is untouched and is
 * what actually runs.
 *
 * That difference is a real gap and it is named rather than hidden: the tests prove ELK is
 * deterministic over the real graph, and they do not prove that this particular import statement
 * resolves in a browser. A screenshot does.
 */
export async function loadElk(): Promise<ElkLike> {
  const module = (await import('elkjs/lib/elk.bundled.js')) as unknown as {
    default: new (args?: Record<string, unknown>) => ElkLike
  }
  const Elk = module.default
  return new Elk()
}

/**
 * Run the layout, and then check what it did against what was asked for.
 *
 * The placements come back flat, because that is what the canvas sets on its nodes; the nesting is
 * already expressed by `parentId` on the node itself. The routes come back in the canvas's own
 * coordinates — ELK gives an edge's geometry relative to whichever box contains it, and a reader of
 * this result should never have to know which box that was.
 */
export async function layoutGraph(
  graph: StructureGraph,
  sizes: ReadonlyMap<string, Size>,
  makeElk: () => Promise<ElkLike> = loadElk,
  labelSizes: ReadonlyMap<string, Size> = new Map(),
  headRoom: ReadonlyMap<string, number> = new Map(),
): Promise<LayoutResult> {
  const input = toElkGraph(graph, sizes, labelSizes, headRoom)
  const elk = await makeElk()
  const started = Date.now()
  const laid = await elk.layout(input)
  const ms = Date.now() - started

  const placements = new Map<string, Placement>()
  const routes = new Map<string, EdgeRoute>()
  /** Absolute position of each container, so an edge's own coordinates can be lifted out of it. */
  const walk = (node: ElkNode, originX: number, originY: number): void => {
    for (const edge of (node as { edges?: ElkExtendedEdge[] }).edges ?? []) {
      const route = routeOf(edge, originX, originY)
      if (route !== null) routes.set(edge.id, route)
    }
    for (const child of node.children ?? []) {
      const x = child.x ?? 0
      const y = child.y ?? 0
      placements.set(child.id, { x, y, width: child.width ?? 0, height: child.height ?? 0 })
      walk(child, originX + x, originY + y)
    }
  }
  walk(laid, 0, 0)

  const unplaced = graph.nodes.filter((node) => !placements.has(node.id))
  if (unplaced.length > 0) {
    throw new Error(
      `ELK placed ${placements.size} of ${graph.nodes.length} nodes and left ${unplaced.length} without a position (${unplaced
        .slice(0, 4)
        .map((node) => node.id)
        .join(', ')}). A node drawn at a position nobody worked out would sit on top of another one.`,
    )
  }

  const report = checkIntent(graph, placements, routes)
  return { placements, routes, report, ms }
}

/**
 * One edge's geometry, lifted into the canvas's coordinates.
 *
 * ELK gives an edge's points relative to the box that CONTAINS the edge, which for a step-to-step
 * line is the pipeline box and for everything else is the whole drawing. React Flow draws in one
 * flat space, so the container's own position is added here — once, in the walk that already knows
 * it — rather than being worked out again by whoever reads the result.
 */
function routeOf(edge: ElkExtendedEdge, originX: number, originY: number): EdgeRoute | null {
  const section = edge.sections?.[0]
  if (section === undefined) return null
  const points = [
    { x: section.startPoint.x + originX, y: section.startPoint.y + originY },
    ...(section.bendPoints ?? []).map((point) => ({ x: point.x + originX, y: point.y + originY })),
    { x: section.endPoint.x + originX, y: section.endPoint.y + originY },
  ]
  const label = edge.labels?.[0]
  const placed =
    label === undefined || label.x === undefined || label.y === undefined
      ? null
      : {
          x: label.x + originX + (label.width ?? 0) / 2,
          y: label.y + originY + (label.height ?? 0) / 2,
          width: label.width ?? 0,
          height: label.height ?? 0,
        }
  return { points, label: placed }
}

// ============================================================================ drawing one route

/**
 * ELK's points turned into an SVG path with the corners rounded off.
 *
 * IT LIVES HERE, NOT IN THE CANVAS, because it is arithmetic and the canvas is the one file in this
 * directory a test cannot load. A wrong corner is a line that appears to pass through a card, which
 * is precisely the "which node does this join" fault this pass is fixing, and it should be caught by
 * the suite rather than by somebody looking at a picture.
 *
 * A corner is cut back by at most half of the shorter of the two segments meeting at it, so a short
 * jog cannot round itself inside out.
 */
export function roundedPath(points: readonly { x: number; y: number }[], radius = 9): string {
  if (points.length === 0) return ''
  const first = points[0] as { x: number; y: number }
  if (points.length === 1) return `M ${first.x} ${first.y}`
  let d = `M ${first.x} ${first.y}`
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1] as { x: number; y: number }
    const corner = points[index] as { x: number; y: number }
    const next = points[index + 1] as { x: number; y: number }
    const into = Math.hypot(corner.x - previous.x, corner.y - previous.y)
    const out = Math.hypot(next.x - corner.x, next.y - corner.y)
    const cut = Math.min(radius, into / 2, out / 2)
    if (cut <= 0.5) {
      d += ` L ${corner.x} ${corner.y}`
      continue
    }
    const start = {
      x: corner.x + ((previous.x - corner.x) / into) * cut,
      y: corner.y + ((previous.y - corner.y) / into) * cut,
    }
    const end = { x: corner.x + ((next.x - corner.x) / out) * cut, y: corner.y + ((next.y - corner.y) / out) * cut }
    d += ` L ${start.x} ${start.y} Q ${corner.x} ${corner.y} ${end.x} ${end.y}`
  }
  const last = points[points.length - 1] as { x: number; y: number }
  return `${d} L ${last.x} ${last.y}`
}

/**
 * The point half way ALONG a route, measured by length rather than by counting bends.
 *
 * WHERE THE WORDS GO ON A LINE ELK RESERVED NO ROOM FOR. Most lines carry an ELK label and its
 * position is ELK's answer, which is better than any arithmetic here because it also avoids the
 * cards. A line that is only drawn when something is selected is deliberately given no ELK label —
 * see `toElkGraph` — so when it IS drawn its word needs a place, and the middle of the route it
 * actually follows is the honest one.
 *
 * NOT THE MIDDLE BEND, and not the average of the points. An orthogonal route round a pipeline box
 * is mostly short jogs at one end and one long run at the other, so both of those land the word in a
 * corner. Half the arc length lands it on the long run, which is where a person looks.
 */
export function routeMidpoint(points: readonly { x: number; y: number }[]): { x: number; y: number } | null {
  if (points.length === 0) return null
  const first = points[0] as { x: number; y: number }
  if (points.length === 1) return { x: first.x, y: first.y }
  let total = 0
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1] as { x: number; y: number }
    const b = points[index] as { x: number; y: number }
    total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  if (total === 0) return { x: first.x, y: first.y }
  let walked = 0
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1] as { x: number; y: number }
    const b = points[index] as { x: number; y: number }
    const run = Math.hypot(b.x - a.x, b.y - a.y)
    if (walked + run >= total / 2) {
      const along = run === 0 ? 0 : (total / 2 - walked) / run
      return { x: a.x + (b.x - a.x) * along, y: a.y + (b.y - a.y) * along }
    }
    walked += run
  }
  const last = points[points.length - 1] as { x: number; y: number }
  return { x: last.x, y: last.y }
}

// ============================================================================ did it do as it was asked

/**
 * Which layer each node came out in, from the coordinates ELK returned.
 *
 * A LAYER IS MEASURED, NOT REMEMBERED. ELK does not hand back its layering, and asking it to would
 * be a second source of truth about the same picture. Two nodes are in the same layer when they
 * start at the same place along the reading direction, which is what a layered layout means.
 */
function layersOf(
  nodes: readonly GraphNode[],
  placements: ReadonlyMap<string, Placement>,
  down: boolean,
): Map<string, GraphNode[]> {
  const layers = new Map<string, GraphNode[]>()
  for (const node of nodes) {
    const at = placements.get(node.id)
    if (at === undefined) continue
    const along = Math.round(down ? at.y : at.x)
    const key = `${node.parentId ?? 'root'}@${along}`
    const list = layers.get(key)
    if (list === undefined) layers.set(key, [node])
    else list.push(node)
  }
  for (const list of layers.values()) {
    list.sort((a, b) => {
      const pa = placements.get(a.id) as Placement
      const pb = placements.get(b.id) as Placement
      return down ? pa.x - pb.x : pa.y - pb.y
    })
  }
  return layers
}

/**
 * What the layout did with the hints it was given, in words.
 *
 * IT IS MEASURED FROM THE RESULT, not asserted from the request. Saying "order applied" because an
 * order was sent is exactly the silent failure this reports against: ELK takes an in-layer order
 * when it can and quietly does something else when it cannot, and a reader who arranged a drawing
 * has to be able to tell which happened.
 *
 * The model's own entries are already in `graph.report` and are carried through untouched. This adds
 * the three questions only a finished layout can answer: did the lane stay together, did the order
 * survive, and did `near` end up beside anything.
 */
export function checkIntent(
  graph: StructureGraph,
  placements: ReadonlyMap<string, Placement>,
  routes: ReadonlyMap<string, EdgeRoute>,
): LayoutReport {
  const report: LayoutReport = {
    honoured: [...graph.report.honoured],
    unhonoured: graph.report.unhonoured.map((entry) => ({ ...entry })),
  }
  const down = directionFor(graph) === 'DOWN'
  const layers = layersOf(graph.nodes, placements, down)
  const layerOf = new Map<string, { key: string; index: number; list: GraphNode[] }>()
  for (const [key, list] of layers) {
    list.forEach((node, index) => layerOf.set(node.id, { key, index, list }))
  }
  const across = down ? t('g7b.layout.left_to_right') : t('g7b.layout.top_to_bottom')

  // ---- lane: did everything with the same name stay together in each column? ------------------
  const lanes = new Map<string, GraphNode[]>()
  for (const node of graph.nodes) {
    const lane = node.presentation.lane
    if (lane === null) continue
    const list = lanes.get(lane)
    if (list === undefined) lanes.set(lane, [node])
    else list.push(node)
  }
  for (const [lane, members] of lanes) {
    const broken: string[] = []
    for (const [, list] of layers) {
      const mine = list.map((node, index) => ({ node, index })).filter((entry) => entry.node.presentation.lane === lane)
      if (mine.length < 2) continue
      const first = mine[0]?.index ?? 0
      const last = mine[mine.length - 1]?.index ?? 0
      for (let index = first + 1; index < last; index++) {
        const between = list[index]
        if (between !== undefined && between.presentation.lane !== lane) broken.push(between.title)
      }
    }
    const target = members.map((node) => node.presentation.target).join(', ')
    if (broken.length === 0) {
      report.honoured.push(
        t('g7b.layout.lane_its_node_were_kept_together_in', { v1: lane, v2: members.length, v3: members.length === 1 ? '' : 's', v4: across }),
      )
    } else {
      report.unhonoured.push({
        target,
        hint: t('g7b.layout.lane', { v1: lane }),
        because:
          t('g7b.layout.the_layout_put_between_them_a_lane', { v1: [...new Set(broken)].slice(0, 3).map((title) => `“${title}”`).join(', ') }) +
          t('g7b.layout.request_to_keep_nodes_together_and_the') +
          t('g7b.layout.disagree_the_lines_win_and_this_says'),
      })
    }
  }

  // ---- order: did each column come out in the order that was asked for? ------------------------
  for (const [, list] of layers) {
    const asked = list
      .map((node, index) => ({ node, index }))
      .filter((entry) => entry.node.presentation.order !== null)
    if (asked.length < 2) continue
    const wanted = [...asked].sort((a, b) => (a.node.presentation.order ?? 0) - (b.node.presentation.order ?? 0))
    for (let seat = 0; seat < wanted.length; seat++) {
      const entry = wanted[seat]
      const got = asked[seat]
      if (entry === undefined || got === undefined) continue
      if (entry.node.id === got.node.id) {
        report.honoured.push(
          t('g7b.layout.order_on_it_came_out_of_in', { v1: entry.node.presentation.order ?? 0, v2: entry.node.presentation.target, v3: seat + 1, v4: wanted.length }),
        )
      } else {
        report.unhonoured.push({
          target: entry.node.presentation.target,
          hint: t('g7b.layout.order', { v1: entry.node.presentation.order ?? 0 }),
          because:
            t('g7b.layout.it_was_asked_for_place_of_in', { v1: seat + 1, v2: wanted.length, v3: got.node.title }) +
            t('g7b.layout.instead_a_layered_layout_takes_an_order'),
        })
      }
    }
  }

  // ---- near: did the two end up beside each other? ---------------------------------------------
  for (const node of graph.nodes) {
    const beside = node.presentation.near
    if (beside === null) continue
    const mine = layerOf.get(node.id)
    const theirs = layerOf.get(beside)
    const other = graph.nodes.find((candidate) => candidate.id === beside)
    const name = other?.title ?? beside
    // The hint is quoted back in the words it was STORED in — a record id, or `step:<step id>` —
    // and never in the canvas's own node id. A reader who wrote `near: <record>` and is shown
    // `near: mod:<record>` cannot tell whether the thing being reported on is the hint they wrote.
    const asked = other?.presentation.target ?? beside
    if (mine === undefined || theirs === undefined) continue
    if (mine.key !== theirs.key) {
      report.unhonoured.push({
        target: node.presentation.target,
        hint: t('g7b.layout.near', { v1: asked }),
        because:
          t('g7b.layout.they_are_in_different_columns_has_to', { v1: name }) +
          t('g7b.layout.what_and_a_dependency_decides_a_column') +
          t('g7b.layout.drawing_where_it_cannot_be_met'),
      })
      continue
    }
    const gap = Math.abs(mine.index - theirs.index)
    if (gap === 1) {
      report.honoured.push(t('g7b.layout.near_on_they_came_out_side_by', { v1: asked, v2: node.presentation.target, v3: across }))
    } else {
      const between = mine.list
        .slice(Math.min(mine.index, theirs.index) + 1, Math.max(mine.index, theirs.index))
        .map((entry) => `“${entry.title}”`)
      report.unhonoured.push({
        target: node.presentation.target,
        hint: t('g7b.layout.near', { v1: asked }),
        because: t('g7b.layout.the_layout_left_between_this_and_in', { v1: between.slice(0, 3).join(', '), v2: name }),
      })
    }
  }

  // ---- lines the layout could not route -------------------------------------------------------
  const unrouted = graph.edges.filter((edge) => !routes.has(edge.id))
  if (unrouted.length > 0) {
    report.unhonoured.push({
      target: unrouted.map((edge) => edge.id).slice(0, 4).join(', '),
      hint: t('g7b.layout.the_route_of_the_line'),
      because:
        t('g7b.layout.the_layout_returned_no_path_for_line', { v1: unrouted.length, v2: unrouted.length === 1 ? '' : 's', v3: unrouted.length === 1 ? t('g7b.layout.it_is') : t('g7b.layout.they_are') }) +
        t('g7b.layout.drawn_as_a_direct_connector_between_the') +
        t('g7b.layout.missing_is_the_route_round_whatever_is'),
    })
  }

  return report
}

// ============================================================================ the window onto it

/**
 * The size a card was designed and measured at. A drawing at this zoom is a drawing you can read.
 *
 * The canvas used to open at 0.36, because it was fitting a drawing three screens wide into one
 * window. A reader who lands on the page has to be able to read a card without doing anything.
 */
export const READING_ZOOM = 1

/**
 * The smallest zoom a canvas may OPEN at, whatever that costs in how much of the drawing fits.
 *
 * MEASURED, NOT CHOSEN. The card body is set in `--fs-1`, which is 12px, and the titles in
 * `--fs-2`, 13px. At 0.85 those are 10.2px and 11px, which is about the smallest a person reads
 * comfortably; at 0.7 they are 8.4px and 9.1px, which is the size the old fitted canvas produced on
 * a small drawing and could not be read. So a drawing that nearly fits is shown whole, a drawing
 * that does not is shown at 0.85 and panned, and nothing ever opens smaller than this.
 */
export const READABLE_FLOOR = 0.85

/** Room between the edge of the drawing and the edge of the window, in screen pixels. */
export const CANVAS_PAD = 28

/** The furthest out the reader may zoom by hand. Below this a card is a grey rectangle. */
export const MIN_ZOOM = 0.1
/**
 * The furthest in. Declared in `card.ts` and re-exported here, so the two files cannot disagree.
 *
 * THEY DID DISAGREE. This file said 2 and `card.ts` said 1.6, `Canvas.tsx` imported this one, and
 * the canvas therefore let a reader past the zoom the fit above was sized for. Both names are kept
 * because both files' callers use them; only the number is gone from here.
 */
export { MAX_ZOOM }

/**
 * Everything the drawing occupies, including where it starts.
 *
 * `minX` and `minY` are not always zero and that is not a rounding error: ELK puts the words on a
 * line where they belong, which for the leftmost card in a drawing that runs downwards is to the
 * LEFT of it. Measuring only the cards left those labels off the edge of the window on open, with
 * their first letters cut off — which a photograph found.
 */
export interface DrawingSize {
  minX: number
  minY: number
  width: number
  height: number
}

/**
 * How big the drawing is, and where it begins.
 *
 * TOP-LEVEL NODES ONLY, plus every route and every label: a step's position is relative to the
 * pipeline box it sits in, so adding a child's offset to the origin would count the same space twice
 * and ask for a window about twice as tall as the drawing. The routes are already in the canvas's
 * own coordinates, so they are taken as they are.
 */
export function drawingSize(
  nodes: readonly GraphNode[],
  placements: ReadonlyMap<string, Placement>,
  routes: ReadonlyMap<string, EdgeRoute> = new Map(),
): DrawingSize {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const see = (x: number, y: number): void => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  for (const node of nodes) {
    if (node.parentId !== null) continue
    const at = placements.get(node.id)
    if (at === undefined) continue
    see(at.x, at.y)
    see(at.x + at.width, at.y + at.height)
  }
  for (const route of routes.values()) {
    for (const point of route.points) see(point.x, point.y)
    if (route.label !== null) {
      see(route.label.x - route.label.width / 2, route.label.y - route.label.height / 2)
      see(route.label.x + route.label.width / 2, route.label.y + route.label.height / 2)
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return { minX: 0, minY: 0, width: 0, height: 0 }
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

/**
 * How tall the window onto the drawing is.
 *
 * IT IS A WINDOW, NOT A FRAME ROUND THE WHOLE PICTURE, and that is the change. It used to be the
 * drawing's own proportions, so a wide drawing forced the zoom down until nothing could be read and
 * a tall one made the page enormous. Now it is as much of the drawing as fits at the zoom it opens
 * at, between the same two limits `card.ts` states — short enough to leave room for the reading
 * layer under it, tall enough to be worth panning around.
 *
 * Returns null when there is nothing to measure, and the caller then leaves the stylesheet's own
 * height alone rather than setting a guess.
 */
export function boxHeightFor(drawing: DrawingSize, availableWidth: number): number | null {
  if (availableWidth <= 0) return null
  if (drawing.width <= 0 || drawing.height <= 0) return null
  const wanted = drawing.height * READING_ZOOM + 2 * CANVAS_PAD
  return Math.round(Math.min(BOX_MAX, Math.max(BOX_MIN, wanted)))
}

/**
 * The zoom at which the whole drawing WOULD fit the window. A statement of geometry and nothing else.
 *
 * IT IS NOT WHAT `Fit all` DOES, and it used to be. On a big drawing this returns a number below
 * `MIN_ZOOM` — 0.004 on a workspace of 1,080 modules, measured — and driving the canvas there is
 * driving it somewhere `MIN_ZOOM` exists to forbid. Use `fitAllFor`, which is that answer with the
 * floor applied and with what the floor cost stated. This is kept, exported and named because "how
 * small would the whole thing have to be" is a real question and the honest answer to it is
 * sometimes a number the canvas will not go to.
 */
export function fitZoomFor(drawing: DrawingSize, boxWidth: number, boxHeight: number): number {
  if (drawing.width <= 0 || drawing.height <= 0 || boxWidth <= 0 || boxHeight <= 0) return READING_ZOOM
  const usableWidth = Math.max(1, boxWidth - 2 * CANVAS_PAD)
  const usableHeight = Math.max(1, boxHeight - 2 * CANVAS_PAD)
  return Math.min(MAX_ZOOM, usableWidth / drawing.width, usableHeight / drawing.height)
}

/** What pressing `Fit all` will actually do, including the case where it cannot do what it says. */
export interface FitAll {
  /** The zoom it settles on. Never below `MIN_ZOOM`, whatever that costs in what fits. */
  zoom: number
  /** True when the whole drawing really is inside the window at that zoom. */
  whole: boolean
  /** How much of the drawing the window holds at that zoom. 1 when `whole` is true. */
  shows: number
}

/**
 * WHAT `Fit all` DOES, AS OPPOSED TO WHAT IT PROMISES.
 *
 * THIS EXISTS BECAUSE THE BUTTON LIED, AND IT LIED EXACTLY WHEN THE WORKSPACE GOT BIG. `fitZoomFor`
 * is pure geometry with no floor in it, and the canvas set the viewport straight from it —
 * `setViewport` does not clamp, only the reader's own wheel and buttons do. So on a drawing of 1,080
 * module cards the sentence under the canvas said "press Fit all for the whole shape at 0%", the
 * press was obeyed, and the reader got a drawing 1,276 pixels wide and one and a half pixels tall
 * with the zoom readout showing 0%. Measured on a scratch copy of the database, on port 39002.
 * `MIN_ZOOM` is documented three lines up as the furthest out a reader may go because "below this a
 * card is a grey rectangle"; a button is a reader going there.
 *
 * The floor bites from about sixty-five modules upwards on this corpus, which is well inside the
 * life of the workspace and well below the size that used to kill the page outright.
 *
 * SO THE LIMIT IS APPLIED AND THEN STATED. `whole` is false when the drawing does not fit even at
 * the floor, and `shows` says how much of it the reader will actually get, so the sentence under the
 * canvas can offer the reading layer instead of promising a picture that cannot be drawn.
 */
export function fitAllFor(drawing: DrawingSize, boxWidth: number, boxHeight: number): FitAll {
  const wanted = fitZoomFor(drawing, boxWidth, boxHeight)
  const zoom = Math.max(MIN_ZOOM, wanted)
  // `wanted` is the zoom that fits exactly, so anything at or above the floor fits and anything
  // below it does not. The comparison is the whole of the answer; nothing needs re-measuring.
  return { zoom, whole: wanted >= MIN_ZOOM, shows: visibleFraction(drawing, boxWidth, boxHeight, zoom) }
}

/**
 * How many windowfuls of drawing there are, across and down, at a given zoom.
 *
 * A PERCENTAGE IS NOT AN INSTRUCTION. "shows about 1% of the drawing — drag it to move around" is
 * true and tells a reader nothing about what dragging is going to cost them; "63 windows across"
 * does. It is rounded up and never below one, because a drawing that spills a little past the edge
 * is still a second window to reach.
 */
export function windowsOf(
  drawing: DrawingSize,
  boxWidth: number,
  boxHeight: number,
  zoom: number,
): { across: number; down: number } {
  if (boxWidth <= 0 || boxHeight <= 0) return { across: 1, down: 1 }
  return {
    across: Math.max(1, Math.ceil((drawing.width * zoom) / boxWidth)),
    down: Math.max(1, Math.ceil((drawing.height * zoom) / boxHeight)),
  }
}

/**
 * The zoom the canvas opens at: as much of the drawing as will fit WITHOUT going below reading size.
 *
 * Three cases and they are all one line. A drawing that fits at reading size is drawn at reading
 * size. A drawing that nearly fits is drawn a little smaller and shown whole, because seeing all of
 * something at 0.9 beats seeing three quarters of it at 1. A drawing that would need 0.3 is drawn at
 * `READABLE_FLOOR` and panned, because 0.3 is the fault this pass exists to remove.
 */
export function openingZoom(drawing: DrawingSize, boxWidth: number, boxHeight: number): number {
  return Math.max(READABLE_FLOOR, Math.min(READING_ZOOM, fitZoomFor(drawing, boxWidth, boxHeight)))
}

/** Where the view starts: how far the drawing is moved, and how big it is drawn. */
export interface Viewport {
  x: number
  y: number
  zoom: number
}

/**
 * The part of the drawing worth landing on: everything a line touches.
 *
 * WHY NOT THE TOP-LEFT CORNER. The whole-project drawing is twelve modules with five links between
 * them, and ELK puts the pieces that are not joined to anything wherever they pack best — which on
 * the seeded workspace was the left-hand end. Opening at the corner therefore opened on four
 * unconnected cards and no lines at all, in a picture whose entire purpose is what depends on what.
 * That was photographed.
 *
 * So the view opens where the lines are. Everything a route touches, plus the routes themselves;
 * where nothing is joined to anything there is nothing to prefer and it is the whole drawing.
 *
 * THE QUESTION THIS ONLY MOVED THE CAMERA ON IS ANSWERED NOW, AND THIS IS STILL NEEDED. The decision
 * entry cited this function as half-admitting that the canvas is a picture of dependencies, and
 * `projectForCanvas` in model.ts now says so outright: by default the drawing holds only the cards a
 * line touches, so this returns the whole of it. It still does the work it was written for under
 * `Show all`, where the unjoined cards are back and the reader still has to land somewhere useful.
 */
export function drawingFocus(
  graph: StructureGraph,
  placements: ReadonlyMap<string, Placement>,
  routes: ReadonlyMap<string, EdgeRoute>,
): DrawingSize {
  // ONE PIPELINE'S DRAWING OPENS ON ITS FIRST STEP (wave 13y round 82). The steps are drawn inside the pipeline's box,
  // and the modules that carry them stand to its left, joined by lines, so the part the lines are in was the whole
  // drawing and the view opened at its corner, on the modules. The box began at the right edge of the window, where
  // only the empty space above its first step showed, and at 660 pixels it was not in the window at all. Opening on the
  // box's head was tried and was not enough: the first step sits some 450 pixels below the head, under the bottom of a
  // window 1,000 pixels high at 990 and 660. A step is drawn at its box's position plus its own.
  const scope = graph.scope
  if (scope.at === 'pipeline') {
    const box = graph.nodes.find((node) => node.kind === 'pipeline' && node.recordId === scope.recordId && node.parentId === null)
    const first = box === undefined ? undefined : graph.nodes.find((node) => node.kind === 'step' && node.parentId === box.id)
    const boxAt = box === undefined ? undefined : placements.get(box.id)
    const firstAt = first === undefined ? undefined : placements.get(first.id)
    if (box !== undefined && first !== undefined && boxAt !== undefined && firstAt !== undefined) {
      // The steps a line joins to the first step are in the window beside it, and the box's own order can put them
      // higher than the first. The focus reaches up to the highest of them, so the window's top cuts none of them.
      let top = firstAt.y
      for (const edge of graph.edges) {
        if (!routes.has(edge.id)) continue
        const otherId = edge.from === first.id ? edge.to : edge.to === first.id ? edge.from : null
        const other = graph.nodes.find((node) => node.id === otherId)
        const otherAt = other === undefined ? undefined : placements.get(other.id)
        if (other?.parentId === box.id && otherAt !== undefined) top = Math.min(top, otherAt.y)
      }
      return {
        minX: boxAt.x + firstAt.x,
        minY: boxAt.y + top,
        width: firstAt.width,
        height: firstAt.y + firstAt.height - top,
      }
    }
  }
  const joined = new Set<string>()
  for (const edge of graph.edges) {
    if (!routes.has(edge.id)) continue
    joined.add(edge.from)
    joined.add(edge.to)
  }
  if (joined.size === 0) return drawingSize(graph.nodes, placements, routes)
  // A step inside a pipeline box is drawn at its parent's position plus its own, and a focus is a
  // place in the canvas's coordinates — so a joined child counts as its top-level ancestor, which is
  // the box that actually holds it.
  const topLevel = new Set<string>()
  for (const id of joined) {
    let node = graph.nodes.find((candidate) => candidate.id === id)
    while (node !== undefined && node.parentId !== null) node = graph.nodes.find((c) => c.id === node?.parentId)
    if (node !== undefined) topLevel.add(node.id)
  }
  return drawingSize(
    graph.nodes.filter((node) => topLevel.has(node.id)),
    placements,
    routes,
  )
}

/** Keep a number inside two bounds, whichever way round they came. */
function clamp(value: number, a: number, b: number): number {
  const low = Math.min(a, b)
  const high = Math.max(a, b)
  return Math.min(high, Math.max(low, value))
}

/**
 * The view a canvas opens at.
 *
 * NEVER BELOW READING SIZE — that is the rule this whole pass turns on. Where the drawing fits it is
 * centred, because a small drawing pinned to a corner looks like a mistake. Where it does not, it
 * opens on `focus` — the part of it the lines are in — and never past the drawing's own edges, so
 * the window is always full of drawing rather than of grey.
 *
 * ONE PIPELINE'S DRAWING IS THE EXCEPTION, with `focusAtTheTop`. The window there starts far down
 * the page, and only its top part is on the screen when the page opens. When there is not a window's
 * height of drawing under the first step, keeping the drawing's bottom edge at the window's bottom
 * pushes the first step down past the screen's lower edge. So its focus goes to the window's top,
 * and empty grid may show under the box.
 */
export function openingViewport(
  drawing: DrawingSize,
  focus: DrawingSize,
  boxWidth: number,
  boxHeight: number,
  focusAtTheTop = false,
): Viewport {
  const zoom = openingZoom(drawing, boxWidth, boxHeight)
  const whole = placeAt(drawing, boxWidth, boxHeight, zoom)
  const fitsAcross = drawing.width * zoom + 2 * CANVAS_PAD <= boxWidth
  const fitsDown = drawing.height * zoom + 2 * CANVAS_PAD <= boxHeight
  const x = fitsAcross
    ? whole.x
    : clamp(
        CANVAS_PAD - focus.minX * zoom,
        boxWidth - CANVAS_PAD - (drawing.minX + drawing.width) * zoom,
        CANVAS_PAD - drawing.minX * zoom,
      )
  const y = fitsDown
    ? whole.y
    : focusAtTheTop
      ? Math.min(CANVAS_PAD - focus.minY * zoom, CANVAS_PAD - drawing.minY * zoom)
      : clamp(
          CANVAS_PAD - focus.minY * zoom,
          boxHeight - CANVAS_PAD - (drawing.minY + drawing.height) * zoom,
          CANVAS_PAD - drawing.minY * zoom,
        )
  return { x: Math.round(x), y: Math.round(y), zoom }
}

/**
 * Where the drawing sits in the window at a given zoom: centred when it fits, at the corner when it
 * does not. `minX` and `minY` are taken off, so what is at the corner is the drawing and not the
 * origin of a coordinate system nobody can see.
 */
export function placeAt(
  drawing: DrawingSize,
  boxWidth: number,
  boxHeight: number,
  zoom: number,
): { x: number; y: number } {
  const drawnWidth = drawing.width * zoom
  const drawnHeight = drawing.height * zoom
  const x = drawnWidth + 2 * CANVAS_PAD <= boxWidth ? (boxWidth - drawnWidth) / 2 : CANVAS_PAD
  const y = drawnHeight + 2 * CANVAS_PAD <= boxHeight ? (boxHeight - drawnHeight) / 2 : CANVAS_PAD
  return { x: Math.round(x - drawing.minX * zoom), y: Math.round(y - drawing.minY * zoom) }
}

/**
 * How much of the drawing the window holds at a given zoom, as a fraction.
 *
 * Printed under the canvas in words. A reader who can see a third of a drawing should be told that
 * they can see a third of it, rather than being left to discover the rest by dragging.
 */
export function visibleFraction(drawing: DrawingSize, boxWidth: number, boxHeight: number, zoom: number): number {
  if (drawing.width <= 0 || drawing.height <= 0) return 1
  const across = Math.min(1, boxWidth / (drawing.width * zoom))
  const down = Math.min(1, boxHeight / (drawing.height * zoom))
  return across * down
}

// ============================================================================ comparing two runs

/**
 * The same placements, rounded, for comparing two runs.
 *
 * Rounded because the property that matters is that the PICTURE does not move, and a floating-point
 * digit nobody can see moving is not the picture moving. The test compares these.
 */
export function placementFingerprint(result: LayoutResult): string {
  return [...result.placements.entries()]
    .map(([id, at]) => `${id}@${Math.round(at.x)},${Math.round(at.y)},${Math.round(at.width)},${Math.round(at.height)}`)
    .sort()
    .join('\n')
}

/** A size map for testing and for the first pass, keyed by node kind. Never used to DRAW. */
export function nominalSizes(nodes: readonly GraphNode[], of: (node: GraphNode) => Size): Map<string, Size> {
  return new Map(nodes.map((node) => [node.id, of(node)]))
}

// ============================================================================ grouping and shape
//
// ADDED FOR THE PLANNING GRAPH AND USED BY NOTHING ELSE YET. Everything below this line is new
// exports; not one line above it changed, because `StructureView.tsx` and `Evolution.tsx` also read
// this file and a changed function there is a changed picture on two canvases nobody asked about.
//
// WHY IT IS HERE RATHER THAN IN PlanGraph.tsx. All five are arithmetic over ids, sizes and boxes
// with no React and no DOM in them, which is the only kind of thing this project can test at full
// strength — the test environment is `node` with no jsdom. A layout rule that lives inside a
// component is a layout rule proved by looking at it.

/** The smallest shape of a line these functions need: which two ends it joins. */
export interface JoinedPair {
  from: string
  to: string
}

/**
 * The groups of ids that are actually joined to each other, in first-seen order.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PLANNING GRAPH NEEDED THIS
 * ---------------------------------------------------------------------------------------
 *
 * The plan drawing looked like two graphs. It was two graphs: ELK packs
 * disconnected components wherever they fit, and on the live corpus that put a nine-card deadline
 * cluster above a five-card wave chain with 78px of grey between them and NOTHING SAYING SO. A gap
 * that size reads as a tier — as if the lower band were subordinate to the upper one — and the two
 * share not one link.
 *
 * So the split is measured and then STATED. A component's ids come back together, the caller draws
 * each as its own band with its own heading, and "0 links cross between these" stops being
 * something a reader has to infer from white space.
 *
 * FIRST-SEEN ORDER, NOT SIZE ORDER: the reply's node order is the server's, it is stable between
 * draws, and re-sorting here would move the picture for a reason the reader cannot see.
 */
export function connectedComponents(ids: readonly string[], edges: readonly JoinedPair[]): string[][] {
  const held = new Set(ids)
  const beside = new Map<string, string[]>()
  for (const id of ids) beside.set(id, [])
  for (const edge of edges) {
    // A line with an end this drawing does not hold joins nothing here. It is not an error and it
    // is not dropped from the caller's own list — it simply cannot merge two groups.
    if (!held.has(edge.from) || !held.has(edge.to)) continue
    beside.get(edge.from)?.push(edge.to)
    beside.get(edge.to)?.push(edge.from)
  }
  const seen = new Set<string>()
  const groups: string[][] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    const group: string[] = []
    const queue = [id]
    seen.add(id)
    while (queue.length > 0) {
      const at = queue.shift() as string
      group.push(at)
      for (const next of beside.get(at) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    groups.push(group)
  }
  return groups
}

/**
 * How many lines run between two different groups.
 *
 * WHY A DRAWING WOULD EVER CALL THIS ON ITS OWN COMPONENTS, given the answer is zero by
 * construction: because the drawing states the number rather than asserting it. The claim on screen
 * is "0 links join this band to the rest", and a claim built from a count of the same array it
 * describes cannot come apart from the picture. It is also the honest answer for a grouping that is
 * NOT by component — the three-column variant groups by what a card is, and its crossings are real.
 */
export function crossingCount(groups: readonly (readonly string[])[], edges: readonly JoinedPair[]): number {
  const groupOf = new Map<string, number>()
  groups.forEach((group, index) => {
    for (const id of group) groupOf.set(id, index)
  })
  let crossing = 0
  for (const edge of edges) {
    const a = groupOf.get(edge.from)
    const b = groupOf.get(edge.to)
    if (a === undefined || b === undefined) continue
    if (a !== b) crossing += 1
  }
  return crossing
}

/** A group of ids that is one straight run, and the one link type every step of it is. */
export interface StraightRun {
  /** The ids in order, tail first. */
  order: string[]
  /** The stored link type every step is. A run of mixed types is not a run. */
  type: string
}

/**
 * A group that is ONE STRAIGHT RUN — every card has at most one line in and one out, all of a kind.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS WORTH, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * On the live corpus the plan drawing's plane was 2,645px wide and 2,062px of it was five wave
 * blocks in a row, each drawn as a full card in its own ELK layer, each repeating the same pipeline
 * title. Five columns to say `4B → 5 → 6 → 7 → 8`. A layered layout is the right picture for a
 * graph and the wrong picture for a queue: there is nothing to route round, nothing crosses, and
 * the reader is asked to drag two windows to read an ordering that fits on one line.
 *
 * So a run is drawn as a row of chips with arrows between them, and the width goes with it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT A RUN, AND WHY EACH IS EXCLUDED
 * ---------------------------------------------------------------------------------------
 *
 * A branch (two lines out of one card) is not: the second branch would have nowhere to go on a row.
 * A join is not, for the same reason. A cycle is not — it has no first card, so a row would have to
 * pick one and the choice would be invisible. MIXED TYPES ARE NOT, and that is the one worth
 * stating: `A blocks B` then `B part of C` drawn as `A → B → C` reads as one ordering when it is
 * two different claims, and the arrow between the chips would be a word the data never said.
 *
 * Returns null for all of those, and the caller draws the group the ordinary way.
 */
export function straightRun(
  ids: readonly string[],
  edges: readonly (JoinedPair & { type: string })[],
): StraightRun | null {
  if (ids.length < 2) return null
  const held = new Set(ids)
  const inside = edges.filter((edge) => held.has(edge.from) && held.has(edge.to))
  // A run of n cards has exactly n-1 steps. Fewer is not connected as a single line; more means a
  // branch, a join or a repeat, all of which lose their second line on a row.
  if (inside.length !== ids.length - 1) return null
  const type = inside[0]?.type
  if (type === undefined || !inside.every((edge) => edge.type === type)) return null

  const out = new Map<string, string>()
  const into = new Map<string, string>()
  for (const edge of inside) {
    if (out.has(edge.from) || into.has(edge.to)) return null
    if (edge.from === edge.to) return null
    out.set(edge.from, edge.to)
    into.set(edge.to, edge.from)
  }
  const heads = ids.filter((id) => !into.has(id))
  if (heads.length !== 1) return null
  const order: string[] = []
  let at: string | undefined = heads[0]
  const walked = new Set<string>()
  while (at !== undefined) {
    if (walked.has(at)) return null
    walked.add(at)
    order.push(at)
    at = out.get(at)
  }
  // Every card on the row, or it is not this group's ordering.
  return order.length === ids.length ? { order, type } : null
}

/**
 * Where to scroll a pane so one box sits in the middle of it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A DRAWING DOES NOT OPEN AT ITS OWN ORIGIN
 * ---------------------------------------------------------------------------------------
 *
 * The planning panel is titled "What this period is working toward" and on the live corpus the
 * record it is working toward — the one deadline — was placed by ELK at x=1138 in a 1144px pane. It
 * was off screen at rest. A reader landed on a panel that names a goal, showing nine cards that are
 * not it, with nothing saying to scroll right.
 *
 * The origin is not a meaningful place in a derived layout: it is wherever the solver happened to
 * start. The anchor is meaningful, so the pane opens there. Clamped to the plane, so a centred
 * anchor near an edge never leaves half a window of grey.
 */
export function centreScroll(
  box: { x: number; y: number; width: number; height: number },
  pane: { width: number; height: number },
  plane: { width: number; height: number },
): { left: number; top: number } {
  const left = box.x + box.width / 2 - pane.width / 2
  const top = box.y + box.height / 2 - pane.height / 2
  return {
    left: Math.round(clamp(left, 0, Math.max(0, plane.width - pane.width))),
    top: Math.round(clamp(top, 0, Math.max(0, plane.height - pane.height))),
  }
}

/** What a fit lands on, and whether landing there cost the reader the ability to read it. */
export interface ReadableFit extends FitAll {
  /**
   * True when the whole shape only fits BELOW `READABLE_FLOOR`.
   *
   * The button is still obeyed — a reader who asks for the whole shape gets the whole shape — but
   * the readout beside it says the words rather than printing a percentage and letting them
   * discover that the type has gone. A fit below the floor is a thumbnail and the screen says so.
   */
  belowReading: boolean
}

/**
 * `fitAllFor` with the one extra fact the planning pane has to print.
 *
 * ADDED RATHER THAN CHANGING `fitAllFor`, which two other canvases call: the structure view's
 * sentence is built around `whole` and `shows`, and quietly giving it a third field it does not read
 * is harmless while quietly changing what `zoom` means is not.
 */
export function fitWithinReading(drawing: DrawingSize, boxWidth: number, boxHeight: number): ReadableFit {
  const fit = fitAllFor(drawing, boxWidth, boxHeight)
  return { ...fit, belowReading: fit.zoom < READABLE_FLOOR }
}
