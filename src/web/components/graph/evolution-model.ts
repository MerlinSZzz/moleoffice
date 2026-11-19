// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { linkWord } from '@shared/words.ts'
import { t } from '@shared/i18n.ts'
/**
 * HOW A SUBSYSTEM MAY EVOLVE — the model behind the module evolution drawing.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DRAWS, AND WHY IT IS NOT THE PIPELINE
 * ---------------------------------------------------------------------------------------
 *
 * A pipeline drawing is the PRESENT: what runs, what depends on what, and where a gate stops the
 * work short. Its lines are execution and dependency, and they are drawn as engineering drawings
 * are drawn — direct, orthogonal, the gates the heaviest strokes on the canvas.
 *
 * This is the other question. Given one module, WHAT MIGHT HAPPEN TO IT: which lines of exploration
 * have been opened against it, how far each has actually been taken, which have been branched off
 * further, and which have been put down or replaced. Those are `direction` records, and this file
 * walks them.
 *
 *   Pipeline    present   execution, dependency, gate      direct, orthogonal, heavy on the gate
 *   Evolution   future    alternatives and branches        light curves off a trunk
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING NEW WAS ADDED TO THE PRODUCT TO DRAW THIS
 * ---------------------------------------------------------------------------------------
 *
 * No record kind, no link type, no stored field. A branch is a `link` somebody already made, a
 * branch's depth is the `direction` kind's own six-rung ladder, and a branch that has been put down
 * says so through the `paused` block every kind already carries or through a stored `supersedes`
 * link. If this drawing wants something the product does not store, the honest answer is that it
 * cannot be drawn yet — see `notes`, which says so on the screen rather than filling the gap in.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING ABOUT THE DRAWING IS STORED, INCLUDING ALL OF THE GEOMETRY BELOW
 * ---------------------------------------------------------------------------------------
 *
 * `shared/presentation.ts` sets the boundary: store meaning and presentation intent, derive
 * rendering. Every number in this file — a trunk's x, an elbow's control points, which vertical
 * rules pass through a row — is layer 3. It is computed from the links on every draw and kept
 * nowhere, so deleting the whole of it changes nothing except how long the next draw takes.
 *
 * This drawing reads NO presentation intent either, and that is a decision rather than an omission.
 * Intent is keyed by scope, the scopes are the module graph and one pipeline, and inventing an
 * `evolution:<id>` scope would be a new stored thing for a drawing whose order is already decided
 * by something authored — the order the links were made in.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT `layoutGraph`
 * ---------------------------------------------------------------------------------------
 *
 * ELK lays out the structure graph, whose nodes are modules, pipelines and blocks, and it routes
 * every edge ORTHOGONALLY. Both of those are the reasons not to reuse it here: a direction is not
 * one of those three kinds, and an orthogonal route is precisely the pipeline's visual language,
 * which this drawing exists to read differently from. What replaces it is not a second layout
 * engine — it is a trunk, an indent per hop, and one cubic Bezier per branch, which is arithmetic
 * short enough to be a pure function and checkable without a DOM.
 */

import { LINK_TYPES, depthReading, type DepthReading, type Link, type PanelRecord } from '@shared/types.ts'
import { readPause } from '@shared/work.ts'
import { LINE_WEIGHT } from './lines.ts'

// ============================================================================ what goes in

/**
 * The part of a stored link this drawing reads.
 *
 * `Pick` off the shared `Link` rather than five fields typed out again: the field names are
 * declared once in shared/types.ts, and a rename there is a type error here rather than a drawing
 * that quietly stops finding branches.
 */
export type EvolutionLink = Pick<Link, 'id' | 'fromId' | 'toId' | 'type' | 'inferred'>

export interface EvolutionInput {
  /** The module this drawing is about. */
  moduleId: string
  moduleTitle: string
  /** Every live record in the workspace. Deleted ones are already gone from this list. */
  records: readonly PanelRecord[]
  /** Every link in the workspace, in stored direction. */
  links: readonly EvolutionLink[]
}

// ============================================================================ set aside

/**
 * The two ways a direction can be put down, and both of them are read off something stored.
 *
 * `parked`     — the direction carries a `paused` block: put down on purpose, with the reason and,
 *                where there is one, what should bring it back. Every kind that can need somebody's
 *                attention carries this field; a direction is one of them.
 * `superseded` — some record holds a stored `supersedes` link pointing AT this direction. Somebody
 *                asserted that another line of work replaces it.
 *
 * THERE IS NO THIRD, AND NO `rejected` WORD. A direction has no `state` field and is not getting
 * one, so "rejected" is not something the product stores about a direction; what it does store is
 * the two facts above, and each is printed in its own words rather than folded into a word nobody
 * wrote. A direction that was dropped without either being recorded reads as live here, which is
 * true — nothing says otherwise.
 */
export const SET_ASIDE_WAYS = ['parked', 'superseded'] as const
export type SetAsideWay = (typeof SET_ASIDE_WAYS)[number]

export interface SetAside {
  way: SetAsideWay
  /** Why, in the record's own words where it has them. */
  because: string
  /** Where the fact was read, addressed the way a caller would, so a reader knows what to change. */
  from: string
}

// ============================================================================ the nodes

export interface EvolutionJoin {
  linkId: string
  otherId: string
  otherTitle: string
  /** The stored link's own forward wording. */
  label: string
}

export interface EvolutionNode {
  id: string
  /** The module is the trunk; everything else is a direction. */
  kind: 'module' | 'direction'
  title: string
  summary: string | null
  /**
   * How far this direction has been taken, on the `direction` kind's own ladder. Null on the module.
   *
   * DELIBERATELY NOT A STATE WORD AND NEVER DRAWN AS ONE. `measured` is rung four of six here and
   * means "keep going"; `measured` on a claim means the measurement is taken and the work is done.
   * shared/types.ts keeps the ladder out of STATE_MEANING for exactly that reason, and this drawing
   * prints the rung and the ladder's length so nobody reads the rung as a state.
   */
  depth: DepthReading | null
  /** Every stored reason this branch has been put down. Empty means nothing says it was. */
  setAside: SetAside[]
  /** Hops from the module. 0 is the module itself. */
  rank: number
  /** The node this one branches off. Null only on the module. */
  parentId: string | null
  /**
   * That node's title, so the row can name what it branches off.
   *
   * NOT "the record above it". A row at two hops out is read directly under its own parent, but the
   * row after it is a branch off something further up, and "above" would name the wrong record on
   * every row that closes a branch. The title is unambiguous wherever the row happens to land.
   */
  parentTitle: string | null
  /** The link that put it in the drawing, so a reader can go and change the right one. */
  viaLinkId: string | null
  /** The stored link type that put it here, and its forward wording. */
  viaLabel: string | null
  /** True when Mole Office worked that link out rather than being told. Drawn dashed, as everywhere. */
  viaInferred: boolean
  /**
   * Other links between this node and something else already in the drawing.
   *
   * The gutter draws a TREE — one line in per node — and a direction can be linked to two things.
   * The extra links are named on the row instead of being dropped, because a link that exists and
   * is not drawn is exactly the silence this product is built to remove.
   */
  alsoJoins: EvolutionJoin[]
}

// ============================================================================ the drawing

/**
 * How much room each hop takes, in the drawing's own units.
 *
 * NOT STORED, NOT AUTHORED, NOT PRESENTATION INTENT. These are layer 3 — the same layer as an ELK
 * coordinate — and they live in the code that draws, computed fresh every time.
 */
export const TRUNK_X = 11
export const INDENT_X = 15
/** The height of the box the branch curve is drawn in, and the y the node's own mark sits at. */
export const ELBOW_H = 26
export const DOT_R = 3.5
/** Room under the mark so the dot is not clipped by the bottom of the branch box. */
export const ELBOW_PAD = 6

/**
 * How heavily an evolution branch is stroked, and the rule it has to obey.
 *
 * LIGHTER THAN EVERY LINE ON A PIPELINE. The human's brief for this drawing was explicit that
 * evolution reads lighter than the present structure, and lines.ts already declares what the
 * present structure weighs. Stating the constraint against that table rather than against a number
 * typed here means a pipeline line that got lighter cannot silently pass this one.
 */
export const EVOLUTION_WEIGHT = 1.25

/** The orderings that must hold, each with the sentence saying why, or `[]` when they all do. */
export function evolutionIsLighterThanPipeline(
  weight: number = EVOLUTION_WEIGHT,
  pipeline: Record<string, number> = LINE_WEIGHT,
): string[] {
  const lightest = Math.min(...Object.values(pipeline))
  const [name] = Object.entries(pipeline).find(([, value]) => value === lightest) ?? ['(none)']
  if (weight < lightest) return []
  return [
    `An evolution branch is ${weight}px and the lightest line on a pipeline drawing — \`${String(name)}\` — is ` +
      `${lightest}px. Evolution is what MIGHT happen and the pipeline is what does; a branch that is not the ` +
      'lighter of the two puts a possible future on the page at the weight of a running dependency.',
  ]
}

/** Where the trunk at this many hops out sits, across the gutter. */
export function trunkXOf(indent: number): number {
  return TRUNK_X + indent * INDENT_X
}

/**
 * One branch, as a cubic Bezier.
 *
 * A CURVE AND NOT AN ELBOW, and that is the single strongest signal separating this drawing from a
 * pipeline. ELK routes a pipeline edge as straight runs meeting at right angles, which reads as
 * something built; a branch that leaves its trunk on a curve reads as something that might grow.
 * The two control points sit at half the box height on each trunk, which is the symmetric S that
 * leaves the parent vertically and arrives vertically.
 */
export function branchCurve(fromIndent: number, toIndent: number): string {
  const x1 = trunkXOf(fromIndent)
  const x2 = trunkXOf(toIndent)
  const mid = ELBOW_H / 2
  return `M ${x1} 0 C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${ELBOW_H}`
}

export interface EvolutionRow {
  nodeId: string
  /** How many hops out, which is also how far across the gutter this row's trunk sits. */
  indent: number
  /** The branch curve into this row, or null on the trunk head, which nothing branches into. */
  curve: string | null
  /** Where this row's own mark goes, across the gutter. */
  dotX: number
  /**
   * The x of every ancestor trunk that has another branch still to come below this row.
   *
   * Drawn as plain vertical rules. Without them a trunk would appear to stop at its first branch
   * and the second branch would seem to come from nowhere.
   */
  throughs: number[]
  /** True when this row's own trunk carries on below it, because it has branches of its own. */
  tail: boolean
  /** True when the node on this row has been set aside. The row and its curve are drawn muted. */
  muted: boolean
  /** True when the link that put this row here was worked out by Mole Office. Drawn dashed. */
  inferred: boolean
}

export interface EvolutionGraph {
  moduleId: string
  /** Depth-first from the module, in the order the links were made. The module is first. */
  nodes: EvolutionNode[]
  /** One per node, same order, carrying the geometry worked out for this draw. */
  rows: EvolutionRow[]
  /** How wide the gutter has to be for the deepest branch in this drawing. */
  gutterWidth: number
  /** How many directions the workspace holds, so an empty drawing can say which empty it is. */
  directionsInWorkspace: number
  /** Sentences the drawing prints about itself: what it left out, and what it will not guess. */
  notes: string[]
}

// ============================================================================ building it

/**
 * A link's wording FROM one end of it.
 *
 * A link is stored once, in one direction, and `LINK_TYPES` carries the sentence for each way
 * round. Printing the forward wording on a row that happens to be the link's target would say
 * "supersedes" where "superseded by" is true, which is the opposite fact.
 */
function wordingFor(link: EvolutionLink, from: string): string {
  return linkWord(link.type, link.fromId === from ? 'forward' : 'reverse').text
}

function nodeOf(record: PanelRecord, rank: number, parent: EvolutionNode): EvolutionNode {
  return {
    id: record.id,
    kind: 'direction',
    title: record.title,
    summary: record.summary,
    depth: depthReading(record.data),
    setAside: [],
    rank,
    parentId: parent.id,
    parentTitle: parent.title,
    viaLinkId: null,
    viaLabel: null,
    viaInferred: false,
    alsoJoins: [],
  }
}

/**
 * Why this direction has been put down, read off what is stored and nothing else.
 *
 * Both reasons are reported when both are true. A direction that was paused and then superseded has
 * had two things happen to it, and collapsing them to one would throw away whichever the reader
 * came for.
 */
function setAsideOf(record: PanelRecord, supersededBy: readonly string[]): SetAside[] {
  const found: SetAside[] = []
  const pause = readPause(record.data)
  if (pause !== null) {
    found.push({
      way: 'parked',
      because: t('g7b.evolution-model.put_down_on', { v1: pause.since, v2: pause.why }),
      from: 'data.paused',
    })
  }
  for (const title of supersededBy) {
    found.push({
      way: 'superseded',
      because: t('g7b.evolution-model.superseded_by', { v1: title }),
      from: t('g7b.evolution-model.a_stored_supersedes_link'),
    })
  }
  return found
}

/**
 * Build the drawing from the records and the links, and say what was left out.
 *
 * THE WALK. Start at the module and step along any stored link to a `direction`, then along any
 * link from that direction to another `direction`, and so on. Only directions are stepped onto: a
 * claim or a problem hanging off a direction is real and is on that record's own Links panel, and
 * pulling it in here would make a drawing about how the subsystem may evolve into a drawing of
 * everything near it.
 *
 * Order is the order the links come in, which is the order they were made. Deterministic, and the
 * one ordering in this drawing that somebody actually chose.
 */
export function buildEvolution(input: EvolutionInput): EvolutionGraph {
  const byId = new Map(input.records.map((record) => [record.id, record]))
  const notes: string[] = []

  const touching = new Map<string, EvolutionLink[]>()
  for (const link of input.links) {
    for (const end of [link.fromId, link.toId]) {
      const list = touching.get(end)
      if (list === undefined) touching.set(end, [link])
      else list.push(link)
    }
  }

  /** Every record that some `supersedes` link points AT, with the titles of what replaced it. */
  const supersededBy = new Map<string, string[]>()
  for (const link of input.links) {
    if (link.type !== 'supersedes') continue
    const by = byId.get(link.fromId)
    if (by === undefined) continue
    const list = supersededBy.get(link.toId)
    if (list === undefined) supersededBy.set(link.toId, [by.title])
    else list.push(by.title)
  }

  const root: EvolutionNode = {
    id: input.moduleId,
    kind: 'module',
    title: input.moduleTitle,
    summary: null,
    depth: null,
    setAside: [],
    rank: 0,
    parentId: null,
    parentTitle: null,
    viaLinkId: null,
    viaLabel: null,
    viaInferred: false,
    alsoJoins: [],
  }

  const nodes = new Map<string, EvolutionNode>([[root.id, root]])
  const children = new Map<string, string[]>()
  const queue: string[] = [root.id]
  let offDrawing = 0
  let brokenEnds = 0

  while (queue.length > 0) {
    const here = queue.shift() as string
    const node = nodes.get(here) as EvolutionNode
    for (const link of touching.get(here) ?? []) {
      // The link that put this node in the drawing is already the line into it. Walking back along
      // it would file the parent as an extra join on the child, which is the same fact twice.
      if (link.id === node.viaLinkId) continue
      const otherId = link.fromId === here ? link.toId : link.fromId
      if (otherId === here) continue
      const other = byId.get(otherId)
      if (other === undefined) {
        // The far end is deleted or is not in the listing this page loaded. Counted and reported;
        // dropping it silently would make a deleted direction look like one that never existed.
        brokenEnds += 1
        continue
      }
      if (other.kind !== 'direction') {
        if (here !== root.id) offDrawing += 1
        continue
      }
      const already = nodes.get(otherId)
      if (already !== undefined) {
        // Both ends are already in the drawing, so this link is not what put either of them there.
        // The gutter draws ONE line in per node — it is a tree — so this one is named on the row
        // instead of being drawn, and never dropped. It is named on both rows, in each row's own
        // wording, which is how every links panel in this app reads a link that is stored once.
        const isTreeEdge = already.viaLinkId === link.id || node.viaLinkId === link.id
        if (!isTreeEdge && !node.alsoJoins.some((join) => join.linkId === link.id)) {
          node.alsoJoins.push({
            linkId: link.id,
            otherId,
            otherTitle: already.title,
            label: wordingFor(link, here),
          })
        }
        continue
      }
      const next = nodeOf(other, node.rank + 1, node)
      next.viaLinkId = link.id
      next.viaLabel = wordingFor(link, here)
      next.viaInferred = link.inferred
      next.setAside = setAsideOf(other, supersededBy.get(otherId) ?? [])
      nodes.set(otherId, next)
      const list = children.get(here)
      if (list === undefined) children.set(here, [otherId])
      else list.push(otherId)
      queue.push(otherId)
    }
  }

  // Depth-first, so a branch and everything that grew off it are read together.
  const order: EvolutionNode[] = []
  const walk = (id: string): void => {
    order.push(nodes.get(id) as EvolutionNode)
    for (const child of children.get(id) ?? []) walk(child)
  }
  walk(root.id)

  const rowOf = new Map<string, number>()
  order.forEach((node, index) => rowOf.set(node.id, index))

  const rows: EvolutionRow[] = order.map((node, index) => {
    // A trunk has to reach down to its next branch, so every ancestor with a branch still below
    // this row keeps a vertical rule through it.
    const throughs: number[] = []
    let up = node.parentId
    while (up !== null) {
      const ancestor = nodes.get(up) as EvolutionNode
      const later = (children.get(up) ?? []).some((child) => (rowOf.get(child) as number) > index)
      if (later) throughs.push(trunkXOf(ancestor.rank))
      up = ancestor.parentId
    }
    return {
      nodeId: node.id,
      indent: node.rank,
      curve: node.parentId === null ? null : branchCurve(node.rank - 1, node.rank),
      dotX: trunkXOf(node.rank),
      throughs: throughs.sort((a, b) => a - b),
      tail: (children.get(node.id) ?? []).length > 0,
      muted: node.setAside.length > 0,
      inferred: node.viaInferred,
    }
  })

  if (brokenEnds > 0) notes.push(t('g7b.evolutionBroken', { n: brokenEnds }))
  if (offDrawing > 0) notes.push(t('g7b.evolutionOutside', { n: offDrawing }))

  const deepest = order.reduce((most, node) => Math.max(most, node.rank), 0)
  return {
    moduleId: input.moduleId,
    nodes: order,
    rows,
    gutterWidth: trunkXOf(deepest) + TRUNK_X,
    directionsInWorkspace: input.records.filter((record) => record.kind === 'direction').length,
    notes,
  }
}
