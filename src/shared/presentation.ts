// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * How a structure should be PRESENTED — the middle layer between what the project means and where
 * the boxes end up.
 *
 * ---------------------------------------------------------------------------------------
 * THREE LAYERS, AND THE BOUNDARY THIS FILE DEFENDS
 * ---------------------------------------------------------------------------------------
 *
 *   1. CANONICAL SEMANTIC GRAPH — records, modules, pipeline blocks, typed relationships, hard and
 *      partial gates, text and state. What the project IS. Stored in `records` and `links`.
 *
 *   2. PRESENTATION INTENT — this file. A small, closed vocabulary saying how somebody wants the
 *      structure shown: which way it runs, which lane a thing belongs in, what order, how
 *      prominent, whether a group is folded, and which semantic emphasis applies. Stored, because
 *      it is authored and it should survive a reload.
 *
 *   3. DERIVED RENDERING — x, y, node sizes, edge routes, final geometry. ELK decides all of it,
 *      on every draw. May be CACHED for visual stability, but the cache is disposable: deleting it
 *      must change nothing except how long the next draw takes.
 *
 * The rule that was here before — "store nothing" — was too absolute. It made every arrangement
 * unrepeatable, so a reader who wanted the twin work shown beside the arm work had no way to say
 * so. The rule that replaces it is:
 *
 *     STORE MEANING AND PRESENTATION INTENT. DERIVE RENDERING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAY NEVER BE STORED HERE, AND WHY EACH IS EXCLUDED BY NAME
 * ---------------------------------------------------------------------------------------
 *
 * No x, no y, no width, no height, no edge waypoint. Those are layer 3. The moment a coordinate is
 * authored, somebody owns it, and every later change to the graph has to be reconciled against it
 * by hand. That is the failure that turns a structural view into a drawing everybody is afraid to
 * regenerate.
 *
 * No colour, no stroke, no dash pattern, no font, no CSS of any kind. Emphasis is stored as a
 * SEMANTIC ROLE — `safety`, `blocked`, `active`, `muted` — and Mole Office's design system decides what
 * that looks like. A stored `#c0392b` cannot be restyled, cannot be themed, cannot be made
 * accessible, and means nothing to an agent reading the record.
 *
 * The test for whether a new field belongs here: could an AGENT set it from what it knows about the
 * work, without looking at a screen? "This is a safety module" — yes. "This node is at 420,180" —
 * no. If only a person looking at a picture could supply the value, it is layer 3 and it is derived.
 *
 * Mole Office is not becoming a diagram editor. A person chooses from the options below, or tells an
 * agent how they want the structure presented. They do not draw.
 */

// ============================================================================ vocabulary

/**
 * Which way the structure runs.
 *
 * Two, not eight. Dependencies read naturally either downward or left-to-right and every other
 * direction is somebody's taste; a closed vocabulary of two is a decision a person makes once.
 */
export const GRAPH_DIRECTIONS = ['down', 'right'] as const
export type GraphDirection = (typeof GRAPH_DIRECTIONS)[number]

/**
 * How much room a node gets, and how much of itself it shows.
 *
 * Not a size in pixels — a rank. `compact` is a node that is present for completeness and should
 * not compete; `prominent` is one worth landing on first. The renderer turns these into whatever
 * the design system says they mean at the current zoom.
 */
export const NODE_ROLES = ['compact', 'normal', 'prominent'] as const
export type NodeRole = (typeof NODE_ROLES)[number]

/**
 * Semantic emphasis. NEVER a colour.
 *
 * The four map onto states the product already understands, so an agent can set them from the
 * work: `safety` where a person could be hurt, `blocked` where work has stopped short, `active`
 * where somebody is on it, `muted` where a thing is kept for completeness and should recede.
 *
 * Emphasis is an OVERRIDE, and it is expected to be rare. Most nodes should get their emphasis
 * from their own recorded state and consequence, computed rather than authored. Storing it here is
 * for the case where a person or an agent knows something the state words do not say yet.
 */
export const EMPHASIS_ROLES = ['safety', 'blocked', 'active', 'muted'] as const
export type EmphasisRole = (typeof EMPHASIS_ROLES)[number]

/** How much of a node is drawn. Set by zoom and selection, never stored — listed here so the three
 *  levels have one definition that the model, the card and the renderer all agree on. */
export const DETAIL_LEVELS = ['title', 'title-state', 'expanded'] as const
export type DetailLevel = (typeof DETAIL_LEVELS)[number]

/** How a lane lays out what is in it: side by side, one under another, or in columns. */
export const LANE_ARRANGEMENTS = ['row', 'stack', 'grid'] as const
export type LaneArrangement = (typeof LANE_ARRANGEMENTS)[number]

/** The side of a top-level lane another lane stands on. */
const LANE_SIDES = ['left', 'right'] as const

/**
 * The tints a lane may carry. NEVER a colour.
 *
 * Each is the name of a design token, the same way an emphasis is a meaning: the drawing decides
 * what the token looks like in each theme, so a theme change reaches every lane that names it.
 */
export const LANE_TINTS = ['--area-1', '--area-2', '--area-3', '--area-4', '--area-5', '--area-6'] as const
export type LaneTint = (typeof LANE_TINTS)[number]

// ============================================================================ the stored shape

/**
 * Presentation intent for ONE target inside ONE scope.
 *
 * Every field is optional. Absent means "Mole Office decides", which must stay the common case: a
 * structure that only looks right because somebody hand-tuned forty hints is a structure nobody
 * can regenerate, and that is the failure this whole boundary exists to prevent.
 */
export interface NodeIntent {
  /**
   * A named lane or cluster this node belongs in. Free text, because a lane is a name a person or
   * an agent chooses — "perception", "the arm", "off the bench" — and a closed list could not hold
   * a research project's own vocabulary. It is semantic: it says what this node is WITH, not where
   * it goes. ELK turns lanes into partitions; it still decides the geometry.
   *
   * Once the scope lists its `lanes`, a node's lane has to be one of their names. A scope that
   * lists none keeps the free name.
   */
  lane?: string
  /**
   * Preferred order within its lane or layer, low first. A HINT, not a position: ELK may not be
   * able to honour it without crossing edges, and when it cannot, `LayoutReport.unhonoured` says
   * so rather than the hint being silently dropped.
   */
  order?: number
  /** How much room and prominence this node gets. */
  role?: NodeRole
  /** Semantic emphasis, overriding what the node's own state would give it. Expected to be rare. */
  emphasis?: EmphasisRole
  /** A structural group drawn folded. The count of what is inside is always shown; nothing is lost. */
  collapsed?: boolean
  /**
   * Keep this node near another, by record id. The one relative-placement hint, and it is
   * deliberately weak: "near" is a request to the layout, not a coordinate, and two nodes that
   * cannot be adjacent without tangling the graph will not be.
   */
  near?: string
  /**
   * WHERE SOMEBODY PUT THIS NODE ON THIS DRAWING, in the layout's own pixels. Both or neither.
   *
   * ---------------------------------------------------------------------------------------
   * A COORDINATE WAS REFUSED HERE BY NAME UNTIL 6 SEPTEMBER 2026, AND THAT RULE IS LIFTED
   * ---------------------------------------------------------------------------------------
   *
   * The rule that a position is never stored and is worked out
   * again on every draw is void where it gets in the way. It got in the way of criterion D19: on a
   * phone, a long press on a card's empty space starts a free drag of its position, and a position
   * nobody keeps is a drag that undoes itself on the next draw.
   *
   * IT IS THE ONE COORDINATE, AND EVERY OTHER ONE IS STILL REFUSED. `width`, `height`, `position`,
   * `coords`, `left`, `top`, `points`, `waypoints`, `route` and `zIndex` are still refused by name
   * with the sentence that says why, and a coordinate at the top of a SCOPE — a drawing does not
   * have a place — is refused too. What is stored is where a person dragged one card.
   *
   * WHAT IT DOES NOT DO. A node nobody has dragged has no `x` and no `y`, and the layout works out
   * where it goes exactly as it did. This is a hint that wins, not a layout somebody maintains.
   */
  x?: number
  y?: number
}

/**
 * One lane of a pipeline's drawing: a named part of it with its own arrangement.
 *
 * The keys are a closed list, like a node's. A lane says what it is and where it sits among the
 * other lanes, never where it is drawn: no width, no position, no colour.
 */
export interface LaneIntent {
  /** The lane's name, unique in the list. A node is in this lane when its own `lane` says this name. */
  name: string
  arrange: LaneArrangement
  /** Preferred order among the lanes beside it, low first. A hint, as a node's order is. */
  order?: number
  /** The name of the listed lane this one sits inside. */
  in?: string
  /** The record drawn at the head of the lane, by record id. */
  head?: string
  /** How many columns a grid has. Only on a lane arranged as `grid`. */
  columns?: number
  /** Which side of the lane named in `of` this one stands on. Only together with `of`, and only on a lane with no `in`. */
  beside?: (typeof LANE_SIDES)[number]
  /** The top-level lane this one stands beside. */
  of?: string
  tint?: LaneTint
}

/**
 * Intent for a whole scope: how this structure runs, plus per-node intent.
 *
 * A SCOPE is which structure is being presented — the whole-project module graph, or one pipeline.
 * The same module can be prominent in one pipeline's drawing and compact in another, which is why
 * intent is keyed by scope and not stored on the record.
 */
export interface ScopeIntent {
  direction?: GraphDirection
  /**
   * Per-node intent, keyed by RECORD ID. Every node on every drawing has one, including a block.
   *
   * There used to be a second spelling, `step:<stepId>`, because a pipeline step was a nested
   * object with no row of its own. It is gone: a block is a record, so one key form addresses every
   * node, and `server/lib/presentation.ts` no longer has a prefix to declare. A write that still
   * sends the old form is REFUSED with the record id to use instead, rather than being rewritten
   * quietly — the old id is the block's id, so the refusal can say exactly what to send.
   */
  nodes?: Record<string, NodeIntent>
  /**
   * The lanes of a pipeline's drawing, in the order they are listed. The whole-project structure
   * drawing takes none; the server refuses them there, because only it knows which scope this is.
   */
  lanes?: LaneIntent[]
}

/** The whole-project module graph. */
export const STRUCTURE_SCOPE = 'structure'

/** The scope name for one pipeline's own drawing. One place, so nobody builds this string twice. */
export function pipelineScope(pipelineId: string): string {
  return `pipeline:${pipelineId}`
}

/**
 * The scope name for one planning period's own drawing.
 *
 * NOTHING STORES INTENT UNDER IT YET, and that is the state rather than a gap. The planning page
 * reads no arrangement and writes none. The name exists because a drawing has to have one: the
 * report saying what was done with an arrangement names the drawing it was aimed at, and a drawing
 * with no name could not appear in it. A write under this name would be applied like any other, by
 * the same code.
 */
export function planScope(period: string): string {
  return `plan:${period}`
}

// ============================================================================ checking

/** Everything a scope may say. Anything else is refused, so the vocabulary cannot quietly grow. */
const SCOPE_KEYS = new Set(['direction', 'nodes', 'lanes'])
const NODE_KEYS = new Set(['lane', 'order', 'role', 'emphasis', 'collapsed', 'near', 'x', 'y'])
const LANE_KEYS = new Set(['name', 'arrange', 'order', 'in', 'head', 'columns', 'beside', 'of', 'tint'])

/**
 * Names that would mean somebody is storing geometry. Refused BY NAME with an explanation, rather
 * than by falling through the unknown-key check, because this is the boundary most likely to be
 * crossed by accident and the error should say why it is a boundary at all.
 *
 * `x` AND `y` LEFT THIS LIST FOR A NODE ON 6 SEPTEMBER 2026, and stayed on it for a scope. The
 * rule that a position is never stored is lifted, so a node may say where somebody put it.
 * A drawing still has no place of its own, so a coordinate at the top of a scope is still refused
 * by name, and `checkNodeIntent` is the only checker that lets the two through.
 */
const GEOMETRY_KEYS = new Set([
  'x', 'y', 'width', 'height', 'position', 'positions', 'coords', 'coordinates',
  'left', 'top', 'points', 'waypoints', 'route', 'zIndex',
])

/**
 * Names that would mean somebody is storing appearance. Refused separately from geometry, because
 * they are refused for a different reason and the message has to say the right one: a coordinate is
 * excluded because it is derived, a colour because it is not a fact about the work.
 */
const STYLE_KEYS = new Set(['colour', 'color', 'style', 'css', 'stroke', 'fill', 'dash', 'font'])

/** The sentence for a key that names a coordinate. */
function geometryRefusal(key: string): string {
  return (
    `"${key}" is drawing geometry and is never stored. Nobody maintains a coordinate in Mole Office: ` +
    'say the meaning — lane, order, role, emphasis — and the layout works out the picture.'
  )
}

/** The sentence for a key that names an appearance. */
function styleRefusal(key: string): string {
  return (
    `"${key}" is appearance, and appearance is not stored. Store a MEANING instead — emphasis is ` +
    `one of ${EMPHASIS_ROLES.join(', ')} — and Mole Office decides how it looks, so a theme change and ` +
    'an accessibility fix reach it. A stored colour reaches neither, and means nothing to an agent.'
  )
}

/** The sentence for an order that is not a number, on a node and on a lane alike. */
const ORDER_PROBLEM = 'order has to be a number. It is a hint, not a position.'

function isOrder(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

export interface IntentProblem {
  where: string
  problem: string
}

/**
 * Check presentation intent. Returns every problem rather than the first, so a caller fixing one
 * field at a time does not round-trip five times.
 *
 * Strict on purpose, and the same strictness the rest of Mole Office applies to record data: an unknown
 * key is a hard error, not a warning. A vocabulary that accepts anything is not a vocabulary.
 */
export function checkScopeIntent(value: unknown): IntentProblem[] {
  const problems: IntentProblem[] = []
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [{ where: '(root)', problem: 'presentation intent has to be an object' }]
  }
  const scope = value as Record<string, unknown>

  for (const key of Object.keys(scope)) {
    if (GEOMETRY_KEYS.has(key)) {
      problems.push({ where: key, problem: geometryRefusal(key) })
    } else if (STYLE_KEYS.has(key)) {
      problems.push({ where: key, problem: styleRefusal(key) })
    } else if (!SCOPE_KEYS.has(key)) {
      problems.push({ where: key, problem: `"${key}" is not part of presentation intent. Allowed: ${[...SCOPE_KEYS].join(', ')}.` })
    }
  }

  if (scope['direction'] !== undefined) {
    const d = scope['direction']
    if (typeof d !== 'string' || !GRAPH_DIRECTIONS.includes(d as GraphDirection)) {
      problems.push({ where: 'direction', problem: `direction has to be one of: ${GRAPH_DIRECTIONS.join(', ')}.` })
    }
  }

  const lanes = scope['lanes']
  if (lanes !== undefined) problems.push(...checkLanes(lanes))

  const nodes = scope['nodes']
  if (nodes !== undefined) {
    if (nodes === null || typeof nodes !== 'object' || Array.isArray(nodes)) {
      problems.push({ where: 'nodes', problem: 'nodes has to be an object keyed by record id.' })
    } else {
      const listed = listedLaneNames(lanes)
      for (const [id, raw] of Object.entries(nodes as Record<string, unknown>)) {
        problems.push(...checkNodeIntent(raw, `nodes.${id}`))
        const onLane = nodeLaneProblem(raw, listed, `nodes.${id}`)
        if (onLane !== null) problems.push(onLane)
      }
    }
  }
  return problems
}

/**
 * The names of the lanes a scope lists, or null when it lists none.
 *
 * Null is the old free-name rule: a scope with no lanes lets a node name any lane, as it always
 * has. A list of names is the closed one.
 */
export function listedLaneNames(lanes: unknown): string[] | null {
  if (!Array.isArray(lanes) || lanes.length === 0) return null
  const names: string[] = []
  for (const lane of lanes) {
    const name = isPlainObject(lane) ? lane['name'] : undefined
    if (typeof name === 'string') names.push(name)
  }
  return names
}

/**
 * Whether a node's lane is one the scope lists. Null when it is, when the node names no lane, or
 * when the scope lists none. The one check for both routes: a whole-scope write passes the lanes
 * it carries, and a one-node write passes the lanes already stored.
 */
export function nodeLaneProblem(node: unknown, listed: readonly string[] | null, where: string): IntentProblem | null {
  if (listed === null || !isPlainObject(node)) return null
  const lane = node['lane']
  if (typeof lane !== 'string' || listed.includes(lane)) return null
  return {
    where: `${where}.lane`,
    problem:
      `the lane ${JSON.stringify(lane)} is not one of this drawing's lanes. Once a drawing lists its lanes, a ` +
      `node's lane names one of them: ${listed.map((name) => JSON.stringify(name)).join(', ')}.`,
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * How a refusal names a lane: by its name, or by its place in the list when it has no name to go
 * by. Exported so the server's reference checks name a lane in the same words.
 */
export function laneCalled(lane: unknown, index: number): string {
  const name = isPlainObject(lane) ? lane['name'] : undefined
  return typeof name === 'string' && name.trim() !== ''
    ? `the lane ${JSON.stringify(name)}`
    : `the lane at place ${index + 1} in the list`
}

/**
 * Check a scope's lanes: each lane's keys and values, and how the lanes name one another.
 *
 * Every problem gives the lane's address and names the lane in its words, so a caller with ten
 * lanes is told which one was wrong. Whether a `head` names a record is checked by the server,
 * which has the records.
 */
function checkLanes(value: unknown): IntentProblem[] {
  if (!Array.isArray(value)) {
    return [{ where: 'lanes', problem: 'lanes has to be a list of lanes, each one an object with a name and an arrangement.' }]
  }
  // An empty list is refused rather than stored, for the reason an empty node intent is: leaving
  // `lanes` out is how a drawing says it has none.
  if (value.length === 0) {
    return [{ where: 'lanes', problem: 'an empty list of lanes says nothing. Leave lanes out for a drawing with no lanes.' }]
  }
  const problems: IntentProblem[] = []
  const byName = new Map<string, { lane: Record<string, unknown>; index: number }>()
  value.forEach((lane, index) => {
    const name = isPlainObject(lane) ? lane['name'] : undefined
    if (typeof name === 'string' && name.trim() !== '' && !byName.has(name)) byName.set(name, { lane: lane as Record<string, unknown>, index })
  })

  value.forEach((raw, index) => {
    const where = `lanes[${index}]`
    const called = laneCalled(raw, index)
    if (!isPlainObject(raw)) {
      problems.push({ where, problem: `${called} has to be an object with a name and an arrangement.` })
      return
    }
    const lane = raw

    for (const key of Object.keys(lane)) {
      if (GEOMETRY_KEYS.has(key)) {
        problems.push({ where: `${where}.${key}`, problem: `${geometryRefusal(key)} It was sent on ${called}.` })
      } else if (STYLE_KEYS.has(key)) {
        problems.push({ where: `${where}.${key}`, problem: `${styleRefusal(key)} It was sent on ${called}.` })
      } else if (!LANE_KEYS.has(key)) {
        problems.push({
          where: `${where}.${key}`,
          problem: `"${key}" is not lane intent, on ${called}. Allowed: ${[...LANE_KEYS].join(', ')}.`,
        })
      }
    }

    const name = lane['name']
    if (typeof name !== 'string' || name.trim() === '') {
      problems.push({ where: `${where}.name`, problem: `${called} has no name. A lane's name is how a node and another lane name it.` })
    } else if (byName.get(name)?.lane !== lane) {
      problems.push({ where: `${where}.name`, problem: `${called} is listed twice. Each name is listed once, so a node in it is in one lane.` })
    }

    if (!LANE_ARRANGEMENTS.includes(lane['arrange'] as LaneArrangement)) {
      problems.push({ where: `${where}.arrange`, problem: `${called} has to say how it is arranged: one of ${LANE_ARRANGEMENTS.join(', ')}.` })
    }

    if (lane['order'] !== undefined && !isOrder(lane['order'])) {
      problems.push({ where: `${where}.order`, problem: `${ORDER_PROBLEM} It was sent on ${called}.` })
    }

    const inside = lane['in']
    if (inside !== undefined) {
      const parent = typeof inside === 'string' ? byName.get(inside) : undefined
      if (parent === undefined) {
        problems.push({ where: `${where}.in`, problem: `${called} is in ${JSON.stringify(inside)}, and no listed lane has that name.` })
      } else {
        const round = roundBackTo(lane, index, byName)
        if (round !== null) {
          problems.push({
            where: `${where}.in`,
            problem: `${called} would sit inside itself: ${round}. A lane is in another lane, never in itself.`,
          })
        }
      }
    }

    const head = lane['head']
    if (head !== undefined && (typeof head !== 'string' || head.trim() === '')) {
      problems.push({ where: `${where}.head`, problem: `${called} has a head that is not a record id. head is the id of the record at the head of the lane.` })
    }

    const columns = lane['columns']
    if (columns !== undefined) {
      if (lane['arrange'] !== 'grid') {
        problems.push({ where: `${where}.columns`, problem: `${called} is not arranged as a grid, so it has no columns. Only a grid lane says how many columns it has.` })
      } else if (typeof columns !== 'number' || !Number.isInteger(columns) || columns < 1) {
        problems.push({ where: `${where}.columns`, problem: `${called} has ${JSON.stringify(columns)} columns. columns has to be a whole number from 1.` })
      }
    }

    const beside = lane['beside']
    const of = lane['of']
    if (beside !== undefined) {
      if (!LANE_SIDES.includes(beside as (typeof LANE_SIDES)[number])) {
        problems.push({ where: `${where}.beside`, problem: `${called} is beside ${JSON.stringify(beside)}. beside has to be one of: ${LANE_SIDES.join(', ')}.` })
      }
      if (of === undefined) {
        problems.push({ where: `${where}.beside`, problem: `${called} says a side but not which lane it is beside. beside goes together with of, which names that lane.` })
      }
      if (inside !== undefined) {
        problems.push({
          where: `${where}.beside`,
          problem: `${called} is in ${JSON.stringify(inside)} and beside a lane as well. A lane beside another stands at the top of the drawing, so it is in no lane.`,
        })
      }
    }
    if (of !== undefined) {
      if (beside === undefined) {
        problems.push({ where: `${where}.of`, problem: `${called} names the lane it is beside but not the side. of goes together with beside, which is left or right.` })
      }
      const other = typeof of === 'string' ? byName.get(of) : undefined
      if (other === undefined) {
        problems.push({ where: `${where}.of`, problem: `${called} is beside ${JSON.stringify(of)}, and no listed lane has that name.` })
      } else if (other.lane['in'] !== undefined) {
        problems.push({
          where: `${where}.of`,
          problem: `${called} is beside ${JSON.stringify(of)}, which is inside another lane. A lane stands beside a lane at the top of the drawing, one with no in.`,
        })
      }
    }

    const tint = lane['tint']
    if (tint !== undefined && !LANE_TINTS.includes(tint as LaneTint)) {
      problems.push({
        where: `${where}.tint`,
        problem: `${called} has the tint ${JSON.stringify(tint)}. A lane's tint is a meaning, not a colour, and has to be one of: ${LANE_TINTS.join(', ')}.`,
      })
    }
  })
  return problems
}

/**
 * How a lane comes back round to itself through `in`, in words, or null when it does not.
 *
 * A round of lanes is reported once, on the lane listed first in it, so a caller with one mistake
 * is told about one mistake.
 */
function roundBackTo(
  start: Record<string, unknown>,
  startIndex: number,
  byName: ReadonlyMap<string, { lane: Record<string, unknown>; index: number }>,
): string | null {
  const steps: string[] = []
  const seen = new Set<Record<string, unknown>>()
  let at = start
  for (;;) {
    seen.add(at)
    const inside = at['in']
    const next = typeof inside === 'string' ? byName.get(inside) : undefined
    if (next === undefined) return null
    steps.push(`${JSON.stringify(at['name'])} is in ${JSON.stringify(inside)}`)
    if (next.lane === start) break
    // A round that does not pass through this lane is reported on its own lanes, not here.
    if (seen.has(next.lane)) return null
    if (next.index < startIndex) return null
    at = next.lane
  }
  return steps.join(', and ')
}

export function checkNodeIntent(value: unknown, where: string): IntentProblem[] {
  const problems: IntentProblem[] = []
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [{ where, problem: 'node intent has to be an object' }]
  }
  const node = value as Record<string, unknown>

  for (const key of Object.keys(node)) {
    // `x` AND `y` ARE NODE INTENT SINCE 6 SEPTEMBER 2026 — see `NodeIntent` for why — so they
    // are checked as numbers below rather than refused as geometry here.
    if (key === 'x' || key === 'y') continue
    if (GEOMETRY_KEYS.has(key)) {
      problems.push({ where: `${where}.${key}`, problem: geometryRefusal(key) })
    } else if (STYLE_KEYS.has(key)) {
      problems.push({ where: `${where}.${key}`, problem: styleRefusal(key) })
    } else if (!NODE_KEYS.has(key)) {
      problems.push({ where: `${where}.${key}`, problem: `"${key}" is not node intent. Allowed: ${[...NODE_KEYS].join(', ')}.` })
    }
  }

  if (node['lane'] !== undefined && (typeof node['lane'] !== 'string' || node['lane'].trim() === '')) {
    problems.push({ where: `${where}.lane`, problem: 'lane has to be a non-empty name.' })
  }
  if (node['order'] !== undefined && !isOrder(node['order'])) {
    problems.push({ where: `${where}.order`, problem: ORDER_PROBLEM })
  }
  if (node['role'] !== undefined && !NODE_ROLES.includes(node['role'] as NodeRole)) {
    problems.push({ where: `${where}.role`, problem: `role has to be one of: ${NODE_ROLES.join(', ')}.` })
  }
  if (node['emphasis'] !== undefined && !EMPHASIS_ROLES.includes(node['emphasis'] as EmphasisRole)) {
    problems.push({
      where: `${where}.emphasis`,
      problem:
        `emphasis has to be one of: ${EMPHASIS_ROLES.join(', ')}. It is a meaning, not a colour — ` +
        'Mole Office decides how each one is drawn, so a theme change and an accessibility fix reach it.',
    })
  }
  if (node['collapsed'] !== undefined && typeof node['collapsed'] !== 'boolean') {
    problems.push({ where: `${where}.collapsed`, problem: 'collapsed has to be true or false.' })
  }
  if (node['near'] !== undefined && (typeof node['near'] !== 'string' || node['near'].trim() === '')) {
    problems.push({ where: `${where}.near`, problem: 'near has to be the id of the record to sit beside.' })
  }
  for (const axis of ['x', 'y'] as const) {
    const at = node[axis]
    if (at !== undefined && (typeof at !== 'number' || !Number.isFinite(at))) {
      problems.push({
        where: `${where}.${axis}`,
        problem: `${axis} has to be a number: it is where somebody put this node on this drawing.`,
      })
    }
  }
  // BOTH OR NEITHER. Half a place is not a place, and a node with only an x would be drawn at the
  // layout's y and somebody's x, which is a position nobody chose.
  if ((node['x'] === undefined) !== (node['y'] === undefined)) {
    problems.push({
      where: `${where}.${node['x'] === undefined ? 'x' : 'y'}`,
      problem: 'x and y go together: a node somebody put somewhere has both, and a node nobody moved has neither.',
    })
  }
  return problems
}

// ============================================================================ honesty about hints

/**
 * What the layout did with the intent it was given.
 *
 * A hint that could not be honoured MUST be reported. This product has a standing rule against
 * silent fallbacks, and a stored `order: 1` that quietly had no effect is exactly that: the reader
 * believes they have arranged something and they have not. The interface says which hints were
 * applied and which the layout could not take.
 */
export interface LayoutReport {
  /** Hints the layout applied. */
  honoured: string[]
  /** Hints it could not, each with the reason in words. */
  unhonoured: { target: string; hint: string; because: string }[]
}
