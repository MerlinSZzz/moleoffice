// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { kindWord, linkWord, stateWord as readStateWord } from '@shared/words.ts'
import { t } from '@shared/i18n.ts'
/**
 * THE MEANING OF THE GRAPH. Nodes, typed edges, gates and what attaches where — and not one
 * coordinate.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE LAYERS, AND THE RULE THAT KEEPS THEM APART
 * ---------------------------------------------------------------------------------------
 *
 * The boundary is stated once, in src/shared/presentation.ts, and this file obeys it rather than
 * restating it. In short:
 *
 *     STORE MEANING AND PRESENTATION INTENT. DERIVE RENDERING.
 *
 *   1. CANONICAL — stored, written by people and agents, edited through the ordinary API: the
 *   RECORDS that are nodes, the TYPED LINKS between them, the GATE on a link, a PIPELINE STEP and
 *   its `needs`, and the text inside each. That is what this file reads. It is the meaning of the
 *   graph, it survives being redrawn, and it is the only thing anybody maintains.
 *
 *   2. PRESENTATION INTENT — also stored, and served by /api/presentation: direction, lane, order,
 *   role, emphasis, collapsed, near. A closed vocabulary that an AGENT can write from what it knows
 *   about the work. This file READS it, resolves it against what is actually on the canvas, and
 *   reports every hint it could not honour in `report`. A hint that was quietly dropped would be a
 *   reader believing they had arranged something when they had not, which is the silent fallback
 *   this product bans.
 *
 *   3. DERIVED — every x, every y, every edge route, every box size. Computed on render, thrown
 *   away, never stored, never sent to the server. `layout.ts` is the whole of that layer and it
 *   takes what this file produces. THERE IS NO SCHEMA FIELD ANYWHERE HOLDING A POSITION and no code
 *   path in this directory writes one; the graph spike (design/attention/GRAPH-SPIKE.md) proved that
 *   the same meaning lays out to identical coordinates twice, which is what makes that safe.
 *
 *   THE RULE: when the two disagree, the records are right about what the project MEANS and the
 *   layout is right about nothing at all — it is redrawn.
 *
 * So this file is pure. No React, no ELK, no fetch, no clock of its own. Same input, same output.
 * That is what makes it the layer the test suite can hold, which matters here more than usual: the
 * runner has no DOM, so a canvas cannot be rendered in a test and everything that can be checked
 * has to live somewhere a test can reach.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DRAWN, AND WHAT IS DELIBERATELY NOT
 * ---------------------------------------------------------------------------------------
 *
 * THE DEFAULT PROJECT GRAPH IS MODULE-FIRST, and that is a decision about what competes with what.
 * A module is the curated, human-meant unit of this project: it survives a refactor that moves every
 * file it covers. So in the `modules` scope the modules are the only boxes, module-to-module typed
 * links are the only lines, and everything else that bears on a module — its problems, what it owes,
 * work on it that stopped short, and how many pipeline steps it carries — is a BADGE on the module
 * it affects. A problem drawn as its own box makes twelve modules into forty boxes and loses which
 * is which; a problem drawn as `2 problems` on the module it is wrong with keeps the picture a
 * picture and still says where to look.
 *
 * A BADGE IS A COUNT AND A WORD, NEVER A PARAGRAPH. `badges` on a node is the compact form of what
 * is attached to it; `attached` is the same information in full, and the reading layer prints all of
 * it. `card.ts` decides which of the two a card carries at each of the three detail levels.
 *
 * ONE PIPELINE OPENED IS A DIFFERENT SCOPE, not more of the same picture. There the steps are the
 * subject: their dependencies, their branches and rejoins, their hard and partial gates, and the
 * modules that carry them, drawn as a compound node — the pipeline is the box, its steps are inside
 * it — because a step belongs to the thing that owns it and has no life outside it. Presentation
 * intent is keyed by scope for exactly this reason: a module can be prominent in one pipeline's
 * drawing and compact in another.
 *
 * A STEP IS NOT A MODULE, and the mapping is many-to-many in BOTH directions: one step can be
 * carried by two modules, one module can carry two steps, and a step carried by nobody is a real
 * answer meaning nobody owns it yet. Every count in this file is written so that it cannot be read
 * as a one-to-one mapping, and `carriedBy` on a step keeps the module TITLES the record stores.
 *
 * THE `carries` BUNDLE IS NOT DRAWN ALL AT ONCE, AND THAT IS A DRAWING DECISION ONLY. Twelve steps
 * and four modules make ten `carries` lines whose pills all read the same word; drawn together they
 * are the busiest thing on the canvas and they crowd out the `needs` lines a reader opened the
 * pipeline to follow. So every one of them is built, kept, and marked `drawn: 'on-selection'` —
 * counted on the step as `carried by N`, drawn when the step or the module is selected, printed in
 * full by the reading layer, and named in `omitted` with the exact number. Nothing about the stored
 * relationship changes: `carries` is canonical and the steps × modules grid is still the detailed
 * view of the whole mapping.
 *
 * ELEVEN LINK TYPES DO NOT BECOME ELEVEN COLOURS. The type is drawn as the WORD on the line, from
 * LINK_TYPES in the shared contract, plus an arrowhead for direction. Colour in this product is
 * spent entirely on state and that restriction is not negotiable — a family colour or a link-type
 * colour sitting beside a state chip makes two different things look like one.
 *
 * A GATE IS NOT A SECOND DEPENDENCY MODEL. It rides on the `blocks` link and on a step's `needs`,
 * exactly as shared/work.ts says. `gateWordsForReader()` below reads the same word keys as the gate
 * mark, so this drawing and the record page cannot describe one stored pair two different ways.
 *
 * NOTHING IS DROPPED SILENTLY. Every scope reports what it leaves out, counted and named, in
 * `omitted`. A graph with no edges because nothing is linked and a graph with no edges because the
 * scope excluded them must never look alike.
 *
 * ---------------------------------------------------------------------------------------
 * THE GRAPH THIS FILE BUILDS IS COMPLETE. THE CANVAS DRAWS A PROJECTION OF IT
 * ---------------------------------------------------------------------------------------
 *
 * `projectForCanvas` at the foot of this file is the whole of that, and it is a rule about the
 * DRAWING and never about the meaning. It takes the complete graph and returns a smaller one for the
 * canvas to draw, with every card it left out held in a list, counted exactly, and worded. It can
 * only REMOVE nodes: it never adds one, never edits one, and never touches an edge, a fact, a badge
 * or an attachment. The reading layer keeps rendering the complete object.
 *
 * WHY IT EXISTS IS MEASURED and it is in design/DECISIONS-PENDING.md §11: 27 modules with 5 links
 * between them lay out to 7,924 × 364 px — six windows across, 17% of it in the window — and the
 * drawing is ONE ROW at every size, because most modules are joined to nothing and a layered layout
 * packs unconnected components into a strip. No layout option changes that; several were tried.
 */

import type { FlowAttentionRow } from '@shared/attention-first-page.ts'
import type { AttentionFlowReply } from '../../../server/lib/attention-shapes.ts'
import {
  pipelineScope,
  planScope,
  STRUCTURE_SCOPE,
  type EmphasisRole,
  type GraphDirection,
  type LayoutReport,
  type NodeIntent,
  type NodeRole,
  type ScopeIntent,
} from '@shared/presentation.ts'
import {
  LINK_TYPES,
  type ItemState,
  type LinkType,
  type PanelRecord,
  type RecordKind,
  type ResolvedLink,
  type SummaryBlock,
} from '@shared/types.ts'
import { progressOf, unclassifiedNote, type Gate, type Progress } from '@shared/work.ts'
import { worldOf, type World } from '@shared/world.ts'
import { linkFamilyOf, type LinkFamily } from './lines.ts'
// THE PLANNING ROUTE'S OWN ANSWER, as a type only: nothing of the server is loaded to build a
// drawing. The plan place reads which records the period reaches from it; see `buildPlanScope`.
import type { PlanGraphNode, PlanGraphReply } from '../../../server/api/plan-graph.ts'
import type { Allocation } from '@shared/planning.ts'
import type { DelegationRow, PackageState } from '@shared/delegation.ts'
import { rungsFor, whyEachLevelIsMissing, type DetailNothing, type DetailText, type LevelAbsence, type Rung } from '@shared/detail.ts'
// WHAT A RECORD HAS WRITTEN AT EACH LEVEL, AND ITS PARTS AS EACH LEVEL DRAWS THEM. The same two
// readers the report page uses; see `levelsOf`.
import { formsWrittenIn, reportAt, type DrawnPart } from '@shared/reportrungs.ts'
import { BY_PART_LEVELS, type ByPartLevel } from '@shared/zoom.ts'
import { blocksFieldOf } from '@shared/kinds.ts'
// ONE READER FOR WHAT A RECORD CONTAINS. `partsOf` is the only reader of a record's parts, and the
// nested cards D28 draws come through it rather than through a sort of this file's own. See
// `containsOn` below.
import { partsOf, type Containment, type ContainmentLink } from '@shared/containment.ts'
// WHAT A RECORD HAS WRITTEN AT EACH LEVEL. These four moved to `src/web/lib/nodewords.ts` when the
// plan drawing needed them: the planning route decides on the server which records a period
// reaches, so the browser has plan nodes and no records, and the route reads the written forms with
// the same two functions. They are re-exported here because every reader of a node's words has
// always taken them from this file.
import { GRAPH_RUNGS, levelsOf, wordsOf, type GraphRung, type NodeLevels, type NodeWords } from '../../lib/nodewords.ts'
export { GRAPH_RUNGS }
export type { GraphRung, NodeLevels, NodeWords }
import type { GateReading } from '../LinkPanel.tsx'
import { gateOf } from '../LinkPanel.tsx'
/** Type-only, so nothing of the server is in the browser bundle. See src/web/api.ts for why. */
import type { LinkAnswered, LinkOnTheWire } from '@shared/link-shapes.ts'
import { BLOCK_KIND, type BlockLinkRow } from '@shared/blocks.ts'
import { readPipeline, stepNumber, type FlowStep, type PipelineReading } from '../PipelineFlow.tsx'
import type { AlarmLevel, PanelState } from '../ui.tsx'
import { alarmFor, ageAlarm, daysSince, gateWordsForReader } from '../ui.tsx'
import { AS_STORED, stageInAPipeline, stageInThePlan, type GateStage } from '../../lib/gate-stage.ts'
import { codedReasonWords } from '../AttentionPanel.tsx'
import { formatDue } from '../../lib/attention.ts'

type FlowAttentionResult = Pick<AttentionFlowReply, 'visible' | 'remainder'>

// ============================================================================ small readers

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

// ============================================================================ links, normalised

/**
 * One stored link, in the direction it is stored, with its gate already read.
 *
 * WHY THIS SHAPE RATHER THAN `ResolvedLink`. `GET /api/records/:id` hands back a link from the
 * point of view of the record being looked at: `isBacklink` says which way round it is and `other`
 * is the far end. That is right for a record page and wrong for a graph, where a line has one
 * direction whichever node you arrived from. `GET /api/links` has no point of view to undo — it
 * names both ends by id — so `graphLinks` below is a rename and a gate reading and nothing else.
 *
 * The gate is `GateReading` from LinkPanel.tsx and not a bare `Gate | null`, because there are five
 * honest answers and not two: this type carries no dependency at all, the reply did not include the
 * gate, nobody said how hard it is, the stored pair cannot be read, or here is the gate. A drawing
 * that collapsed the middle three into "no gate" would report an unqualified block as a hard one,
 * which is putting a word in the author's mouth.
 */
export interface GraphLink {
  linkId: string
  fromId: string
  toId: string
  type: LinkType
  inferred: boolean
  /** True when the record at one end has been deleted. Kept and drawn, never hidden. */
  broken: boolean
  gate: GateReading
}

/**
 * The workspace's links as the drawing wants them: the row's own id, both ends, the gate read once.
 *
 * WHAT THIS REPLACED, because the shape of the old one is the reason this exists. Links used to be
 * read one record at a time, which served every link TWICE — once from each end — and from two
 * points of view, so a `normaliseLinks` undid the point of view and a `dedupeLinks` threw the
 * second copy away. Reading every link once, from `GET /api/links`, deletes both problems rather
 * than managing them: there is no point of view to undo and no duplicate to remove.
 *
 * LINKS BETWEEN RECORDS THIS DRAWING HAS NO NODE FOR ARE PASSED THROUGH, not filtered here. A scope
 * looks its nodes' links up by node id, so a link between two records outside the scope is never
 * asked for. Filtering here would mean this function deciding what a scope contains, which is the
 * scope's decision and is made in one place, below.
 */
export function graphLinks(links: readonly LinkAnswered<LinkOnTheWire, 'draw'>[]): GraphLink[] {
  return links.map((link) => ({
    linkId: link.id,
    fromId: link.fromId,
    toId: link.toId,
    type: link.type,
    inferred: link.inferred,
    broken: link.broken,
    gate: gateOf(link),
  }))
}

/**
 * The links as `shared/blocks.ts` wants them, so one reader serves the server and the browser.
 *
 * The gate is FLATTENED here and only here. `GraphLink.gate` is a `GateReading` with five honest
 * answers, which is what a drawing needs; the block reader needs the two stored columns, which is
 * what the server has. This is the one line that turns one into the other, so neither side has to
 * learn the other's shape and there is still only one reading of a block.
 */
export function blockLinkRows(links: readonly GraphLink[]): BlockLinkRow[] {
  return links.map((link) => ({
    id: link.linkId,
    fromId: link.fromId,
    toId: link.toId,
    type: link.type,
    gate: link.gate.at === 'gate' ? link.gate.gate.kind : null,
    upTo: link.gate.at === 'gate' ? (link.gate.gate.upTo ?? null) : null,
    inferred: link.inferred,
  }))
}

// ============================================================================ scopes

/**
 * Which part of the meaning is on the canvas, and what its subject is.
 *
 * THREE PLACES AND NOT ONE, and the first two splits are arithmetic rather than taste. The seeded
 * workspace holds 12 modules with 5 links between them, and 61 pipeline steps with 58 dependencies.
 * Drawing all of it at once is 82 nodes, which is a picture nobody reads; drawing only the pipelines
 * loses the project structure, which is the thing modules are for. So the modules are one drawing
 * and each pipeline is another, every scope is named on screen, and what a scope leaves out is
 * counted in `omitted` rather than quietly missing. The third is the planning page's drawing, whose
 * subject is a period rather than a record.
 *
 * THE TAG IS THE PLACE, AND THE PLACE IS A CONFIGURATION. `DRAWING_PLACES` below is the whole of
 * what differs between the three, in one table. See its own note.
 */
export type Scope =
  | { at: 'modules' }
  | { at: 'pipeline'; recordId: string }
  | { at: 'plan'; period: string }

export function scopeKey(scope: Scope): string {
  return DRAWING_PLACES[scope.at].key(scope)
}

/**
 * The name this drawing's presentation intent is stored under.
 *
 * NOT `scopeKey`, and the difference is worth a function. `scopeKey` is this file's own key for a
 * drawing and it says `modules`; the stored vocabulary in shared/presentation.ts calls the whole
 * project graph `structure`. Two names for one thing, translated in one place, so nobody builds the
 * string a second time and gets it slightly wrong.
 */
export function intentScopeKey(scope: Scope): string {
  return DRAWING_PLACES[scope.at].intentKey(scope)
}

// ============================================================================ nodes

/**
 * The kinds of card a drawing draws.
 *
 * `plan` is a record on the planning drawing: an obligation, a direction, a piece of work, a block
 * or a problem this period's plan reaches. It is ONE kind and not five because nothing the drawing
 * does with it varies by the record's own kind — what a plan card says about itself comes from the
 * plan, which is `PlanGraphNode.role` and the allocations, and both are facts about the period
 * rather than about the record.
 */
export type NodeKind = 'module' | 'pipeline' | 'step' | 'plan'



/**
 * A PIPELINE HELD INSIDE ONE BLOCK, and what the drawing knows about it without opening it.
 *
 * A block is one step of one pipeline. When that step turns out to have steps of its own, the way
 * to say so today — with no migration and no new vocabulary — is a `pipeline part_of block` link:
 * `createLink` allows it, `part_of` is the containment link and is the only one that is
 * cycle-checked and single-parent-checked, and `shared/containment.ts` already walks it.
 *
 * NOTHING READ IT BEFORE THIS. `readPipelineBlocks` gathers `implements` and `blocks` links and
 * nothing else, so a sub-pipeline was stored, legal, and invisible — the audit measured the cost on
 * `Wave 5 — Planning MVP`, whose six sub-steps live inside one prose string in `measured` because
 * there was nowhere else to put them.
 */
export interface HeldPipeline {
  /** The sub-pipeline's own record id. Pressing the count opens it. */
  recordId: string
  title: string
  /** How many block ids the sub-pipeline stores. */
  steps: number
  /** How many of those blocks are stored `done`. */
  done: number
  /** Block ids the sub-pipeline lists that no live record holds. Counted, never dropped. */
  unreadable: number
}

/**
 * WHETHER SOMEBODY HAS SAID THAT THE DEPENDENCIES IN THIS PIPELINE ARE ALL WRITTEN DOWN.
 *
 * Two steps with no line between them mean one of two different things, and a drawing that lays
 * them out side by side is claiming the second:
 *
 *   `unstated`   nobody has said. Absence of a `blocks` link means no dependency has been RECORDED,
 *                which the block kind's own stored rule insists is not "it waits on nothing".
 *   `complete`   somebody recorded that every dependency here is written down. Now, and only now,
 *                two steps with no link between them run independently on purpose.
 *   `incomplete` somebody recorded that they are NOT all written down, so the gaps are gaps.
 *
 * Measured on the live campaign pipeline `q9ILnZPACd95`: 17 blocks, 9 `blocks` links, and 7 blocks
 * with no dependency link at either end. Every one of those seven is drawn today as though it ran
 * beside the others by choice, and nothing stored says that.
 */
export type DependencyClaim = 'unstated' | 'complete' | 'incomplete'

/**
 * One line inside a node's card. A card is not a box with a name in it: it carries the thing's own
 * words, its standing, and what is attached to it.
 */
export interface CardFact {
  /** The label on the left, e.g. "checklist" or "carried by". Always a word, never a symbol alone. */
  label: string
  /** The value, in the record's own words or as an exact count. */
  value: string
}

/**
 * A record that AFFECTS a node, drawn attached to it rather than floating on the canvas.
 *
 * WHY ATTACHED. A problem, an obligation or a blocked task is not a peer of a module; it is
 * something WRONG WITH a module, and drawing it as another box on the canvas makes twelve modules
 * into forty boxes and loses which is which. So it sits inside the card that owns it, carrying the
 * server's own sentence about why it needs a person.
 *
 * `because` is the SERVER's sentence when the row is on the attention list, and this file's own
 * sentence about the link when it is not. Which of the two is said in `source`, so a reader is never
 * left guessing whether the ranking rule looked at this or not.
 */
export interface Attachment {
  recordId: string
  kind: RecordKind
  title: string
  /** The stored state word, exactly as written. Null when the record carries none. */
  stateWord: string | null
  progress: Progress | null
  state: PanelState | null
  alarm: AlarmLevel | undefined
  /** Why it is attached to THIS node: the stored link, in words. */
  through: string
  /** Why it needs a person, or why it is here at all. */
  because: string
  source: 'attention-rule' | 'stored-link'
  /** The gate on the link that attaches it, when the link carries one. */
  gate: Gate | null
  /** True when the server ranked it onto the first screen of the attention list. */
  onFirstScreen: boolean
}

/**
 * Where one step stands relative to the walls across its pipeline.
 *
 * DRAWN ON THE STEP, NOT BESIDE THE PIPELINE. A gate is stored on a `blocks` link into the pipeline
 * record, so the naive drawing puts one mark on the pipeline box and leaves nine steps looking
 * identical — which is exactly the failure the partial gate exists to prevent: work that is mostly
 * doable reading as blocked. The reach is computed once in `gateReach` and then carried down onto
 * the step it applies to, so the card that says "you may not get here" is the card you are looking
 * at.
 */
export interface StepWallMark {
  /**
   *   `at`       — the wall stands here: this is as far as you may go.
   *   `behind`   — beyond the wall. Recorded `needs` say this waits on the step the wall stands at.
   *   `unplaced` — nothing recorded says which side of the wall this is on. A question, not a no.
   */
  at: 'at' | 'behind' | 'unplaced'
  /** The records whose gates put it here, worst-named first. */
  by: { recordId: string; title: string; gate: Gate }[]
  sentence: string
}

// ============================================================================ badges

/**
 * ONE COUNT AND A WORD: how far this node has got, what is wrong with it, and what is attached.
 *
 * THIS IS THE WHOLE OF "MODULE-FIRST". A problem, an obligation or a piece of blocked work is not a
 * peer of a module — it is something wrong WITH one — and drawn as its own box it turns twelve
 * modules into forty boxes. Drawn as `2 problems attached` on the module it is wrong with, the
 * picture stays a picture of the project and still says where to look. The same holds for the
 * node's own progress: `4 of 8 done` is what a person scans for, and the sentence behind it is not.
 *
 * A BADGE IS ALWAYS THE COMPACT FORM OF SOMETHING ELSE ON THE SAME NODE, and `summarises` says of
 * what. That is what lets a card show the badge OR the thing itself and never both: at the level
 * that prints every fact, the count badges stand down; at the level that prints every attached
 * record, the attachment badges stand down. `2 problems attached` sitting on top of the two problems
 * is the one-fact-twice defect a photograph already found on this drawing's step cards.
 *
 * Nothing is deleted by any of it. Every badge's subject is in `facts` or in `attached` on the same
 * node, and the reading layer prints all of it. What got smaller is the layer you read to keep
 * track, which is what the brief asks for in as many words.
 *
 * `alarm` is HOW LOUDLY, from the same four-level scale the rest of the product uses. It is not a
 * second state vocabulary and not a colour: `undefined` means this badge is an ordinary count.
 */
export interface Badge {
  /** Stable across redraws, so a renderer can key on it. `checklist`, `attached:problem`, … */
  key: string
  /** The number, when the badge counts something. Null when it is an answer in words. */
  count: number | null
  /** Two or three words. What a person scans. */
  short: string
  /** One sentence: what it counts, and where the whole of it can be read. */
  full: string
  alarm: AlarmLevel | undefined
  /**
   * THE TOTAL THIS COUNT IS PART OF, when the badge counts a share of something. Absent otherwise.
   *
   * It exists so that a count can be drawn as a MARK — `11/17` — at the distances where there is no
   * room for the words `11 of 17 done`. Without it the mark would be the bare numeral `11`, which is
   * a different fact: eleven of what, out of how many. Two badges carry a total (a module's
   * checklist, a pipeline's steps) and every other badge counts a whole thing, so this is absent on
   * them rather than repeated as null.
   *
   * IT IS NOT DERIVED FROM `short`. Reading the numbers back out of the sentence this file just
   * wrote would be the same fact worked out in two places, which is the defect this repository names
   * at the top of CLAUDE.md.
   */
  of?: number
  /**
   * What this badge is the compact form of, so a card can stand it down where that is printed whole.
   *
   *   `facts`    — a count the node also states as a fact: the checklist, what it carries, how many
   *                steps are done. Stands down on a card that prints every fact.
   *   `attached` — the records in `attached`, counted by kind. Stands down on a card that prints
   *                them.
   *   null       — nothing else on the node says it. Trouble and folds are like this, so they are
   *                on the card at every level that has room for a badge at all.
   */
  summarises: 'facts' | 'attached' | null
  /**
   * True when the lines this badge counts are NOT all on the canvas, so the badge is the only place
   * on the drawing the number appears.
   *
   * WHY A BADGE NEEDS THIS AND `summarises` IS NOT ENOUGH. A card at the level a drawing opens at
   * shows the first few badges, loudest first, and everything past that is counted under the canvas
   * rather than printed. That is the right bargain for a count a reader can find somewhere else on
   * the picture. It is the wrong bargain for the `carries` count, because the `carries` lines are
   * held back by default — so when the badge is ranked off the card, the drawing states the number
   * NOWHERE and a module sits beside a pipeline it demonstrably carries work in with nothing saying
   * so. That was photographed: three of the four module cards on the seeded pipeline drawing had no
   * carries count, and pressing one of them revealed seven lines the picture had never mentioned.
   *
   * A fold this product allows is one that is counted exactly and named where the reader is looking.
   * `card.ts` gives these badges their place first and fills the rest of the room by loudness.
   */
  standsInForLines: boolean
}

/** "1 problem", "2 problems". The plural rule, in one place, because this product has got it wrong before. */
export function countPhrase(count: number, noun: string): string {
  const special: Record<string, string> = {
    step: t('g7b.noun.step'), 'pipeline step': t('g7b.noun.pipelineStep'),
    'checklist item': t('g7b.noun.checklistItem'), item: t('g7b.noun.item'),
    block: t('g7b.noun.block'), record: t('g7b.noun.record'), card: t('g7b.noun.card'),
    link: t('g7b.noun.link'), node: t('g7b.noun.node'),
  }
  return t('g7b.count', { n: count, what: special[noun] ?? kindWord(noun).text })
}

const ALARM_RANK: Readonly<Record<string, number>> = { urgent: 4, raised: 3, plain: 2, faded: 1 }

/** The loudest of several alarm levels, or nothing when none of them carries one. */
function loudest(levels: readonly (AlarmLevel | undefined)[]): AlarmLevel | undefined {
  let best: AlarmLevel | undefined
  for (const level of levels) {
    if (level === undefined) continue
    if (best === undefined || (ALARM_RANK[level] ?? 0) > (ALARM_RANK[best] ?? 0)) best = level
  }
  return best
}

/** Loudest badge first, and otherwise the order they were built in. A card shows the first few. */
function rankBadges(badges: Badge[]): Badge[] {
  return badges
    .map((badge, index) => ({ badge, index }))
    .sort(
      (a, b) =>
        (ALARM_RANK[b.badge.alarm ?? ''] ?? 0) - (ALARM_RANK[a.badge.alarm ?? ''] ?? 0) || a.index - b.index,
    )
    .map((entry) => entry.badge)
}

/**
 * THE TWO WAYS OF READING ONE DRAWING, IN THE READER'S WORDS — CRITERION D26.
 *
 * They were the two control names until they were changed to Graph and List, because the old two
 * did not say what they meant.
 *
 * THEY ARE DECLARED ONCE BECAUSE FOUR FILES DRAW THEM. The module and pipeline drawings, the plan
 * drawing, and the sentences on both pages that name a control by its own words. Each had its own
 * copy, so renaming one control meant finding eleven strings and hoping. `DRAWING_WORDS` in card.ts
 * reads these two, so there is one place and one spelling.
 *
 * THEY ARE IN THIS FILE AND NOT IN card.ts because card.ts imports this one. A word both files need
 * has to live in the one they can both reach.
 */
export const THE_TWO_READINGS = {
  get graph() { return t('g7b.model.graph') },
  get list() { return t('g7b.model.list') },
} as const

// ============================================================================ a count as a mark

/**
 * WHICH ICON STANDS BESIDE A COUNT when there is no room for the words.
 *
 * A bare numeral is ambiguous — `3` beside a module could be three done, three stopped, three
 * attached — so every mark is a numeral AND a shape, and the shape says which of them it is. The
 * shapes are drawn in CSS from these names, so they cost the canvas no characters and survive
 * greyscale, which is the rule the far view now depends on entirely.
 */
export type MarkKind =
  | 'progress'
  | 'stopped'
  | 'carries'
  | 'attached'
  | 'holds'
  | 'loose'
  | 'unowned'
  | 'walled'
  | 'folded'

/**
 * WHAT EACH COUNT MARK IS CALLED, IN TWO OR THREE WORDS — CRITERION D20.
 *
 * It was not clear what the box with a number at a card's bottom-left was. It was a shape and a
 * numeral, with the whole sentence on the element's `title`
 * and nothing else — so a reader who did not hover had a numeral beside a square and no way to find
 * out what it counted.
 *
 * THE CARD DRAWS THIS WORD WHERE IT HAS ROOM FOR WORDS and the sentence stays on the mark
 * everywhere else. It is short because the marks sit in one row: a card at the level that prints
 * its own line has room for two or three words beside each numeral and not for a sentence.
 */
export const MARK_WORDS: Readonly<Record<MarkKind, string>> = {
  progress: 'done',
  get stopped() { return t('g7b.model.stopped_short') },
  get carries() { return t('g7b.model.carried_by') },
  attached: 'attached',
  holds: 'holds',
  get loose() { return t('g7b.model.depends_on') },
  get unowned() { return t('g7b.model.nobody_carries_it') },
  get walled() { return t('g7b.model.at_the_wall') },
  get folded() { return t('g7b.model.folded_away') },
}

/**
 * The icon each badge's count is drawn with. Keyed on the part of `Badge.key` before any colon, so
 * `attached:problem` and `holds:abc123` land on their family rather than needing a row each.
 *
 * A BADGE WITH NO ROW HERE DRAWS NO MARK. That is deliberate: a count nobody chose an icon for
 * would be an unexplained numeral on a card, and an unexplained numeral is worse than nothing.
 */
const MARK_KINDS: Readonly<Record<string, MarkKind>> = {
  checklist: 'progress',
  steps: 'progress',
  'checklist-stopped': 'stopped',
  'carries-stopped': 'stopped',
  'steps-stopped': 'stopped',
  carries: 'carries',
  'carried-by': 'carries',
  attached: 'attached',
  holds: 'holds',
  dependencies: 'loose',
  unowned: 'unowned',
  walls: 'walled',
  folded: 'folded',
}

/**
 * ONE COUNT, DRAWN AS A MARK: a numeral of five characters or fewer, an icon, and the sentence
 * behind it.
 *
 * THIS IS THE REPLACEMENT FOR A BADGE'S WORDS AT THE DISTANCES THAT HAVE NO ROOM FOR THEM. The
 * owner's instruction is exact: open problems become a count or a status indicator, not prose. So
 * `2 problems attached` — 19 characters, drawn on 41 cards — becomes `2` beside the problem shape,
 * and the sentence it came from stays reachable on the mark itself.
 */
export interface CardMark {
  /** Stable across redraws, from the badge. */
  key: string
  /** The numeral. `11/17` where the badge carries a total, `3` where it counts a whole thing. */
  text: string
  kind: MarkKind
  /** The badge's own sentence, so the mark is never the only place the fact lives. */
  full: string
  alarm: AlarmLevel | undefined
}

/**
 * The mark for one badge, or null when this badge is an answer in words rather than a count.
 *
 * `nobody carries this` and `dependencies written down` are answers in words: they have no number,
 * so there is no numeral to draw and the card says them another way — an unowned mark on the card
 * itself, and the line encoding for what a step waits on.
 */
export function markOf(badge: Badge): CardMark | null {
  if (badge.count === null) return null
  const kind = MARK_KINDS[badge.key.split(':')[0] ?? '']
  if (kind === undefined) return null
  return {
    key: badge.key,
    text: badge.of === undefined ? String(badge.count) : `${badge.count}/${badge.of}`,
    kind,
    full: badge.full,
    alarm: badge.alarm,
  }
}

/**
 * The records attached to a node, counted by kind.
 *
 * By KIND and never as a bare "+3 more": a card that says `2 problems attached` tells you whether to
 * look, and a card that says `3` does not. Same bargain `HiddenCount` makes everywhere else in this
 * product.
 *
 * THE WORD "ATTACHED" IS IN EVERY ONE OF THEM, and it was not at first. `3 pipelines` beside
 * `2 items stopped short` on a module card was photographed, and it reads as "this module is in
 * three pipelines" — which is a different fact, and one the card also has. A badge has to survive
 * being read on its own.
 */
function attachedBadges(attached: readonly Attachment[]): Badge[] {
  const groups = new Map<string, Attachment[]>()
  for (const item of attached) {
    const list = groups.get(item.kind)
    if (list === undefined) groups.set(item.kind, [item])
    else list.push(item)
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))
    .map(([kind, items]) => ({
      key: `attached:${kind}`,
      count: items.length,
      short: t('g7b.model.attached', { v1: countPhrase(items.length, kind) }),
      // The verb agrees with the count. "1 records need a person" is the plural defect this product
      // has already had to fix once in a server reply, and a badge is read more often than a reply.
      full:
        t('g7b.attachedReason'),
      alarm: loudest(items.map((item) => item.alarm)),
      summarises: 'attached' as const,
      // An attached record is a chip on the card at the level that prints them, and its record page
      // is one press away. It stands in for no line on this canvas.
      standsInForLines: false,
    }))
}

// ============================================================================ presentation intent, resolved

// THE SECOND DECLARATION OF `'step:'` USED TO BE HERE, and the server had the other one, each with a
// header saying the prefix should be built in one place. Both are gone. A block is a record, so a
// presentation-intent target is a record id whatever kind of node it is, and there is no prefix.

/**
 * The key this node's presentation intent is stored under: its record id, for every kind of node.
 *
 * It used to be `step:<id>` for a step and a record id for everything else. A block is a record, so
 * the two forms became one — and `node.stepId` is now the BLOCK's record id, which is the same
 * string the block's own card is keyed by.
 */
export function intentTargetOf(node: Pick<GraphNode, 'recordId' | 'stepId'>): string {
  return node.stepId === null ? node.recordId : node.stepId
}

/**
 * What presentation intent says about one node, already resolved against what is on this canvas.
 *
 * EVERY FIELD SAYS WHERE IT CAME FROM. `role` is `normal` when nobody stored one, and `roleSource`
 * says whether that was authored or is Mole Office's own answer — because a reader who arranged something
 * has to be able to tell the difference between "my hint is being used" and "my hint went nowhere".
 * The hints that went nowhere are in `StructureGraph.report.unhonoured`, each with the reason in
 * words.
 */
export interface NodePresentation {
  /** The key this node's intent is stored under: a record id, or `step:<step id>`. */
  target: string
  /** A named lane or cluster, in the author's own words. Null when nobody said. */
  lane: string | null
  /** Preferred order within its lane, low first. A hint, and the layout says if it could take it. */
  order: number | null
  role: NodeRole
  roleSource: 'stored' | 'default'
  /** Semantic emphasis. NEVER a colour: Mole Office's design system decides what each one looks like. */
  emphasis: EmphasisRole | null
  /**
   *   `stored`   — somebody or some agent said so, and it overrides everything below.
   *   `state`    — worked out from what this node itself records: its state word, or a stored
   *                consequence saying a person could be hurt. The common case, and meant to be.
   *   `none`     — nothing recorded gives it one, and `emphasisBecause` says why.
   */
  emphasisSource: 'stored' | 'state' | 'none'
  /** Why it has the emphasis it has, in words, for the card and for the report. */
  emphasisBecause: string
  /** True when this node is a group drawn folded. The count of what is inside is always on it. */
  collapsed: boolean
  /** The NODE id this one should sit beside, resolved on this canvas. Null when nothing here matches. */
  near: string | null
  /**
   * WHERE SOMEBODY PUT THIS NODE, in the layout's own pixels, or null when nobody has moved it.
   *
   * Criterion D19, and the ruling that lifted the rule against storing a
   * position. A card nobody
   * dragged has none of this and the layout decides where it goes, exactly as before.
   */
  placedAt: { x: number; y: number } | null
  /**
   * The hints somebody stored for this node, by name. Empty when nobody arranged it.
   *
   * READ FROM THE STORED OBJECT'S OWN KEYS, not worked out again from the fields above. Every field
   * above answers a question the drawing asks — what lane, what role — and each of them has a value
   * whether or not anybody stored one, so "was this arranged" is not a question any of them can be
   * asked. Deriving it from them would also mean a new word in the vocabulary quietly missing from
   * every count of what was stored, which is the defect this repository keeps producing.
   *
   * `projectForCanvas` is what needs it: a canvas that is not drawing a card cannot honour anything
   * stored for it, and the drawing has to say so rather than stand still.
   */
  stored: readonly string[]
  /**
   * The lines this node put in `report.honoured`, kept here so the projection can take them back.
   *
   * A hint is honoured by the MODEL, and the projection runs afterwards and may take the card off
   * the canvas. When it does, those lines stop being true of that canvas, and a report that still
   * listed them would be telling a reader their arrangement was applied to a picture it is not in.
   */
  applied: readonly string[]
}

/** How the model builds a report entry, so every hint reads the same way. */
function hintSentence(target: string, hint: string, what: string): string {
  return t('g7b.model.on', { v1: hint, v2: target, v3: what })
}

export interface GraphNode {
  /** The node's id on the canvas. Derived from canonical identity and stable across redraws. */
  id: string
  kind: NodeKind
  /** The canonical record. For a step it is the PIPELINE record the step is stored inside. */
  recordId: string
  /** The canonical step id inside that pipeline. Null for a module and for a pipeline. */
  stepId: string | null
  /** The compound parent's node id, for a step. Null otherwise. */
  parentId: string | null
  /**
   * THE RECORD THIS NODE IS DRAWN INSIDE ON THIS DRAWING: the pipeline a step card sits in.
   *
   * Null for a card at the top of the drawing. It is the RECORD id and not `parentId`, which is a
   * node id with a prefix on it; a reader that took the record out of the node id would be a second
   * reading of a key this file builds, which is the defect at the top of CLAUDE.md. A comment
   * written on a card stores this as the box it was in, so it has to be a record.
   */
  inside: string | null
  title: string
  /** "04" for a step, so a sentence can point at it. Null when the node is not a step. */
  ordinal: string | null
  /** The stored state word. A module has none, and that is said rather than invented. */
  stateWord: string | null
  state: PanelState | null
  /**
   * THE STATE OF THE PACKAGE WHOSE TASK IS LINKED TO THIS BLOCK, on a block card that one package names. The card
   * draws this state's word in place of the block's own state word. Absent on any other node.
   */
  packageState?: PackageState
  progress: Progress | null
  alarm: AlarmLevel | undefined
  /** The lines inside the card, in reading order. The FULL set; a card prints a subset per level. */
  facts: CardFact[]
  /**
   * The compact form: counts and single words, loudest first.
   *
   * This is what a card carries at the normal detail level. It is a summary of `facts` and
   * `attached` and never a fact of its own, so nothing here can say something the rest of the node
   * does not.
   */
  badges: Badge[]
  /** Problems, obligations and blocked work that affect this node. */
  attached: Attachment[]
  /**
   * The TITLES of the modules recorded as carrying this block. Null on anything but a block.
   *
   * `[]` IS ONE ANSWER AND NOT TWO. It used to also be null for a step storing no `modules` key,
   * which was a gap rather than an answer. `implements` is a link now, and a link is a row that
   * exists or does not; src/shared/blocks.ts states that the third state is gone and that no reader
   * may invent it back. So empty means "no module is RECORDED as carrying this", which is the
   * sentence every card, badge and note here prints — never "it waits on nobody".
   *
   * KEPT AS A LIST, NEVER AS ONE MODULE. One block can be carried by two, and collapsing that into
   * a single owner is the exact assumption the product owner asked never to let back in.
   */
  carriedBy: string[] | null
  /** Where this step stands relative to the walls across its pipeline. Null on anything else. */
  wall: StepWallMark | null
  /** A sentence the card prints when there is something it cannot say. Null when there is not. */
  note: string | null
  /**
   * The stored words this node draws at each of the three positions on the detail ladder.
   *
   * `title` is not the same string as `title` above on a step: a block's own title column is
   * qualified by its pipeline (`Round nine › Wave 5`), and the card draws the step's name. Both are
   * here, both are read from storage, and neither is derived from the other.
   */
  words: NodeWords
  /**
   * WHICH POSITIONS OF THE LADDER THIS RECORD HAS, AND ITS PARTS AS EACH OF THE THREE DRAWS THEM.
   *
   * It is what a card's own ladder walks: the automatic zoom moves only among the levels a record
   * has, so this is what says which those are. `levelsOf` above reads it, once, out of the two
   * shared readers the report page uses.
   */
  levels: NodeLevels
  /**
   * The pipelines this block holds inside it, from `part_of` links. Empty on anything but a block,
   * and empty on a block that holds none.
   *
   * A LIST, BECAUSE TWO IS STORABLE. `part_of` checks that a record has one parent; it does not
   * check that a parent has one child, so two sub-pipelines under one block is a legal corpus and
   * keeping only the first would be a silent drop.
   */
  holds: readonly HeldPipeline[]
  /**
   * THE RECORDS THIS NODE CONTAINS, read once by `partsOf` in `@shared/containment.ts` — D28.
   *
   * A MODULE'S `part_of` CHILDREN, in the office's own parts order (title, then id). Empty on
   * everything except a module, and empty on a module that contains none. A record's own blocks —
   * a module's `summaryBlocks`, a report's `blocks` — are NOT here: they are the levels written by
   * part and they have no ladder of their own, which is the criterion's own sentence.
   *
   * IT IS DERIVED AND NEVER STORED. There is no field for it on any record and nothing writes one;
   * it is the answer `partsOf` gives from the links the drawing was already handed, carried on the
   * node so the card can draw the children without a second reader or a second sort.
   */
  contains: readonly Containment[]
  /** What presentation intent says about this node, resolved. Never a coordinate. */
  presentation: NodePresentation
}

// ============================================================================ edges

/**
 * What a line means. Three kinds, and they are three different claims about the world.
 *
 *   link    — a stored typed link between two records. The word on the line is the type.
 *   needs   — a pipeline step waits on another step, from the step's own `needs`.
 *   carries — a module carries a step. NOT a dependency and drawn without an arrowhead, because an
 *             arrow here would read as "the module comes first", which is not what the record says.
 */
export type EdgeRelation = 'link' | 'needs' | 'carries'

/**
 * WHEN A LINE IS DRAWN. Two answers, and the second one is a drawing decision and nothing else.
 *
 *   `always`       — it is part of the structure the drawing is for. Every dependency, every stored
 *                    typed link, and the one joined line per module when a pipeline is folded.
 *   `on-selection` — it is drawn when one of its two ends is selected, and counted on the card the
 *                    rest of the time.
 *
 * WHY THE SECOND ONE EXISTS, MEASURED. A pipeline of twelve steps carried by four modules produces
 * ten `carries` lines, every one of them a near-identical pill reading "carries", stacked down the
 * left of the canvas. Each is correct and legible; together they are the busiest thing in the
 * drawing and they crowd out the `needs` lines, which are what a reader opens a pipeline to follow.
 * So the bundle is not drawn by default. THE RELATIONSHIP IS UNCHANGED — `carries` is canonical, the
 * edge is still in this object, the reading layer still prints every one, the steps × modules grid
 * still holds the whole mapping, and every step card says how many modules carry it. What changed is
 * which lines compete for the eye at reading size.
 *
 * NOTHING IS DROPPED SILENTLY BY IT. `omitted` counts the lines that are not drawn by default and
 * says where the whole of the mapping is read, exactly as every other fold in this product does.
 */
export type EdgeDrawn = 'always' | 'on-selection'

export interface GraphEdge {
  id: string
  from: string
  to: string
  relation: EdgeRelation
  /** When this line is drawn. See `EdgeDrawn`: a drawing decision, never a fact about the record. */
  drawn: EdgeDrawn
  /** The stored link type, when there is one. Null for `needs` and `carries`. */
  linkType: LinkType | null
  /** The stored link's id, so an edge can be removed through the ordinary API. */
  linkId: string | null
  /** The word drawn on the line. The link type's forward label, or "waits on", or "carries". */
  label: string
  /** How hard the dependency is. Null on a line that states no dependency. */
  gate: Gate | null
  /** The gate in words, from `gateWordsForReader()`. Null when there is no gate. */
  gateWords: string | null
  /**
   * What this line can honestly say about how much it blocks, when it is a `blocks` link. Kept
   * apart from `gate` because "nobody said how hard" and "hard" must never draw the same.
   */
  reading: GateReading | null
  inferred: boolean
  broken: boolean
  /**
   * WHICH FAMILY THIS LINE BELONGS TO: what waits for what, what leads to what, what is only
   * planned, and what is joined with neither waiting. `lines.ts` holds the table and the weights.
   *
   * NULL ON A LINE THAT IS NOT A STORED LINK. A pipeline's `needs` and `carries` lines are drawn
   * from the pipeline's own reading rather than from a link row, and each already has a weight of
   * its own in the canvas stylesheet; giving them a family here would be a second opinion about the
   * same stroke. Null on a stored type nobody classified, which is a real answer — the drawing says
   * so under it rather than picking a family.
   *
   * IT IS NOT A PROPERTY OF THE TYPE ALONE, which is why it is worked out here with both records in
   * hand. `supersedes` between two intentions is planned; between two things that happened it is
   * `leads to`. `linkFamilyOf` states the rule and this is the one place that asks it for a drawing.
   */
  family: LinkFamily | null
}

// ============================================================================ how far a gate lets you go

/**
 * The reach of a PARTIAL gate: which steps you may get to, which are behind the wall, and which the
 * record cannot place either side of it.
 *
 * THIS IS THE CASE THE WHOLE `gate` WORD EXISTS FOR and it is quoted in shared/work.ts: the digital
 * twin can be built and its kinematics checked without the real arm, but it cannot be VALIDATED
 * without it. Recorded as a hard gate, three finished simulated steps read as blocked work, which is
 * most of the pipeline. So a partial gate has to show HOW FAR, and "how far" has to be computed from
 * the recorded `needs` rather than from the order the steps happen to be written in.
 *
 * THE THIRD ANSWER IS THE HONEST ONE. Steps on a parallel branch neither lead to `upTo` nor follow
 * from it, and nothing stored says which side of the wall they are on. They come back as `unplaced`
 * and the drawing says so, rather than being quietly swept into one of the other two lists. On the
 * seeded `Sim-to-real` pipeline that is three steps out of ten, and it is a real question for a
 * person, not a defect in this function.
 */
export interface GateReach {
  /** The step the wall stands at, when `upTo` names a step in this pipeline. */
  atStepId: string | null
  /** `upTo` exactly as stored, whether it named a step or a stage in words. */
  upTo: string
  /** Step ids you may reach: the named step and everything it waits on, transitively. */
  allowed: string[]
  /** Step ids beyond the wall: everything that waits on the named step, transitively. */
  walled: string[]
  /** Step ids the recorded `needs` cannot place on either side. A question, not a verdict. */
  unplaced: string[]
  /** The sentence, written once so the canvas and the outline word it identically. */
  sentence: string
}

/** Every step that `stepId` waits on, transitively, from the recorded `needs` alone. */
function ancestorsOf(steps: readonly FlowStep[], stepId: string): Set<string> {
  const byId = new Map(steps.map((step) => [step.id, step]))
  const found = new Set<string>()
  const queue = [stepId]
  while (queue.length > 0) {
    const next = queue.shift()
    if (next === undefined) break
    for (const need of byId.get(next)?.needs ?? []) {
      if (found.has(need.blockId)) continue
      // A `needs` that names an id nothing in this pipeline holds is a broken dependency. It is
      // reported by the matrix drawing already; here it simply cannot widen the reach, because a
      // step that does not exist cannot be one you may get to.
      if (!byId.has(need.blockId)) continue
      found.add(need.blockId)
      queue.push(need.blockId)
    }
  }
  return found
}

/** Every step that waits on `stepId`, transitively. */
function descendantsOf(steps: readonly FlowStep[], stepId: string): Set<string> {
  const dependents = new Map<string, string[]>()
  for (const step of steps) {
    for (const need of step.needs) {
      const list = dependents.get(need.blockId)
      if (list === undefined) dependents.set(need.blockId, [step.id])
      else list.push(step.id)
    }
  }
  const found = new Set<string>()
  const queue = [stepId]
  while (queue.length > 0) {
    const next = queue.shift()
    if (next === undefined) break
    for (const child of dependents.get(next) ?? []) {
      if (found.has(child)) continue
      found.add(child)
      queue.push(child)
    }
  }
  return found
}

/**
 * Work out the reach of one partial gate over one pipeline's steps.
 *
 * Returns null when `upTo` names no step here, which is a real and common case — the report gate says
 * "the two pages can be drafted; the force table cannot be filled in", which is a stage in words and
 * not a step id. shared/work.ts allows exactly that, so this refuses to guess which steps those
 * words mean and the caller prints the words instead.
 */
export function gateReach(steps: readonly FlowStep[], upTo: string): GateReach | null {
  const target = steps.find((step) => step.id === upTo)
  if (target === undefined) return null
  const index = steps.indexOf(target)
  const allowedSet = ancestorsOf(steps, upTo)
  allowedSet.add(upTo)
  const walledSet = descendantsOf(steps, upTo)
  const allowed = steps.filter((step) => allowedSet.has(step.id)).map((step) => step.id)
  const walled = steps.filter((step) => walledSet.has(step.id)).map((step) => step.id)
  const unplaced = steps
    .filter((step) => !allowedSet.has(step.id) && !walledSet.has(step.id))
    .map((step) => step.id)

  const sentence = t('g7b.wallReach', { step: `${stepNumber(index)} ${target.name}`, before: allowed.length, after: walled.length, unplaced: unplaced.length })
  return { atStepId: upTo, upTo, allowed, walled, unplaced, sentence }
}

/**
 * A record holding a whole pipeline up, and how far the pipeline may still get.
 *
 * The gate is stored on the `blocks` link into the pipeline record; the server serves it on both
 * ends, which matters, because the end that needs to say what it is waiting for is the pipeline and
 * that is the end that stores nothing.
 */
export interface PipelineWall {
  linkId: string
  /** The record that is holding it up. */
  recordId: string
  title: string
  gate: Gate
  /** The words from `gateWordsForReader()`, so this and the record page cannot disagree. */
  words: string
  /** Null when the gate is hard, or when `upTo` is a stage in words rather than a step id. */
  reach: GateReach | null
  /** What the drawing prints under the wall. Always says which of the three cases it is. */
  sentence: string
}

/**
 * Carry every wall's reach down onto the steps it applies to.
 *
 * A step under two walls gets ONE mark holding both records, and the strongest word wins: `behind`
 * beats `at`, and `at` beats `unplaced`. That order is not a preference — it is what a reader has to
 * act on. A step that one gate lets you reach and another puts behind a wall is not reachable, and a
 * mark that said "you may go this far" over the top of a hard gate would be a picture of the wrong
 * fact.
 */
export function stepWallMarks(
  walls: readonly PipelineWall[],
  steps: readonly FlowStep[],
): Map<string, StepWallMark> {
  const rank: Record<StepWallMark['at'], number> = { behind: 3, at: 2, unplaced: 1 }
  const found = new Map<string, StepWallMark>()
  const put = (stepId: string, at: StepWallMark['at'], wall: PipelineWall): void => {
    const existing = found.get(stepId)
    const by = { recordId: wall.recordId, title: wall.title, gate: wall.gate }
    if (existing === undefined) {
      found.set(stepId, { at, by: [by], sentence: '' })
      return
    }
    existing.by.push(by)
    if (rank[at] > rank[existing.at]) existing.at = at
  }

  for (const wall of walls) {
    if (wall.gate.kind === 'hard') {
      // A hard gate walls everything. That is what hard means, and it is why recording a partial
      // dependency as a hard one makes most of a pipeline look stuck.
      for (const step of steps) put(step.id, 'behind', wall)
      continue
    }
    if (wall.reach === null) {
      // The stage is named in words, so nothing here can place a step against it. Every step is
      // unplaced by this wall, and the sentence says the words rather than guessing at them.
      for (const step of steps) put(step.id, 'unplaced', wall)
      continue
    }
    // The allowed steps BEFORE the named one carry no mark from this wall: this gate does not stop
    // them, and marking them would make an open stretch of pipeline look walled. Only the step the
    // wall stands AT, the steps behind it, and the steps nothing can place are marked.
    if (wall.reach.atStepId !== null) put(wall.reach.atStepId, 'at', wall)
    for (const id of wall.reach.walled) put(id, 'behind', wall)
    for (const id of wall.reach.unplaced) put(id, 'unplaced', wall)
  }

  for (const mark of found.values()) {
    const names = mark.by.map((entry) => `“${entry.title}”`).join(', ')
    mark.sentence =
      mark.at === 'at'
        ? t('g7b.model.this_is_as_far_as_you_may', { v1: names })
        : mark.at === 'behind'
          ? t('g7b.model.this_is_behind_the_wall_it_cannot', { v1: names })
          : t('g7b.model.nothing_recorded_says_whether_this_is_behind', { v1: names })
  }
  return found
}

// ============================================================================ the graph

export interface Omission {
  /** What is not on the canvas, as a plural noun phrase. */
  what: string
  count: number
  /** One sentence saying why, and where it can be read instead. */
  why: string
  /**
   * Set on the one omission the page's body says in words: stored steps that could not be read, which nothing else on
   * the page shows (wave 13u round 217). The list is no longer drawn under the drawing, and each other entry is said
   * where its records are: in the row of pipelines, the "In detail" index, a folded box's count or a record's page.
   */
  saidInTheBody?: true
}

export interface StructureGraph {
  scope: Scope
  /** What this drawing is, in one line, for the heading. */
  title: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Records holding this pipeline up, with how far it may still get. Empty in the modules scope. */
  walls: PipelineWall[]
  /** Everything this scope leaves out, counted and named. Never silent. */
  omitted: Omission[]
  /** Sentences the drawing prints about itself: what it could not read, what it will not guess. */
  notes: string[]
  /** Null when the scope resolves. A sentence when it does not — a pipeline id nothing answers to. */
  problem: string | null
  /**
   * Which way this structure runs. Stored intent when somebody said, and Mole Office's own answer when
   * nobody did — `directionBecause` says which of the two, in words, and why.
   */
  direction: GraphDirection
  directionSource: 'stored' | 'default'
  directionBecause: string
  /**
   * What was done with the presentation intent this drawing was given.
   *
   * THE MODEL'S OWN ENTRIES ONLY. This file can answer for direction, role, emphasis, collapsed and
   * near, because it applies all five. Whether ELK could place a `lane` beside itself or take an
   * `order` without crossing edges is a question only the layout can answer, and `layout.ts` appends
   * its entries to this same report. A hint that appears in neither list has been dropped silently,
   * which is the one outcome this field exists to make impossible.
   */
  report: LayoutReport
}

/**
 * WHAT A DRAWING IS BUILT FROM.
 *
 * WHICH OF THESE A PLACE READS IS PART OF ITS CONFIGURATION, which is why three of them are
 * optional. The modules and pipeline drawings are built from the project's own records, links and
 * attention answer, read in the browser. The plan drawing is built from `plan` alone, because the
 * planning route decides on the server which records a period reaches and serves them with what a
 * card needs. A place asked to build without what it reads REFUSES and says which input is missing;
 * it never draws an empty picture that looks like an empty project.
 */
export interface GraphInput {
  /** Every live record the workspace holds. Deleted ones are already gone from this list. */
  records?: readonly PanelRecord[]
  /** Every link touching a node in scope, in stored direction, deduplicated. */
  links?: readonly GraphLink[]
  /** The server's whole answer to "what needs a person". Never re-computed here. */
  attention?: FlowAttentionResult
  scope: Scope
  /** The clock, passed in, so this file has none of its own and two runs cannot disagree. */
  now: number
  /**
   * How somebody asked for this structure to be presented, as served by GET /api/presentation/:scope
   * for `intentScopeKey(scope)`.
   *
   * OPTIONAL AND MEANT TO STAY MOSTLY ABSENT. A structure that only looks right because forty hints
   * were tuned by hand is a structure nobody can regenerate. Absent means Mole Office decides, which is
   * the ordinary state.
   */
  intent?: ScopeIntent
  /**
   * WHAT THE PLANNING ROUTE ANSWERED, for the plan place and no other.
   *
   * The plan drawing's node set is the plan's own rule — every obligation and every direction in
   * this project, everything the period allocates time to, and everything one stored link from
   * those — and that rule is worked out by `GET /api/plan-graph`, on the server, once. This is that
   * answer. The records, links and attention above are read exactly as the other two places read
   * them, so a plan card is built by the same code from the same corpus; what this adds is WHICH of
   * them the period reaches and what the plan says about each.
   *
   * ABSENT EVERYWHERE ELSE. The modules and pipeline places never look at it, and the plan place
   * refuses to build without it rather than drawing an empty period.
   */
  plan?: PlanGraphReply
  /**
   * THE PROJECT'S PACKAGES, as the two package doors serve them, for the pipeline place. A block that one package names
   * among its plan blocks gets that package's state. Absent where the page did not read them.
   */
  packages?: readonly Pick<DelegationRow, 'state' | 'planBlocks'>[]
}

// ============================================================================ applying the intent

function directionOf(
  input: GraphInput,
  report: LayoutReport,
): Pick<StructureGraph, 'direction' | 'directionSource' | 'directionBecause'> {
  const stored = input.intent?.direction
  if (stored === undefined) {
    const fallback = DRAWING_PLACES[input.scope.at].runs
    return { direction: fallback.direction, directionSource: 'default', directionBecause: fallback.because }
  }
  report.honoured.push(
    hintSentence(intentScopeKey(input.scope), t('g7b.model.direction', { v1: t(`g7b.direction.${stored}`) }), t('g7b.model.the_whole_drawing_runs_that_way')),
  )
  return {
    direction: stored,
    directionSource: 'stored',
    directionBecause: t('g7b.model.somebody_stored_a_direction_for_this_drawing', { v1: t(`g7b.direction.${stored}`) }),
  }
}

/**
 * The semantic emphasis a node carries, and where it came from.
 *
 * COMPUTED IS THE COMMON CASE, and shared/presentation.ts says so: most nodes should take their
 * emphasis from their own recorded state, and a stored one is for when a person or an agent knows
 * something the state words do not say yet. So this reads the state word through the shared
 * classifier and lets a stored value win over it — and it always says which of the two happened,
 * because "my hint is being used" and "my hint went nowhere" must never look alike.
 */
function emphasisOf(args: {
  stored: EmphasisRole | undefined
  progress: Progress | null
  stateWord: string | null
  safety: boolean
}): Pick<NodePresentation, 'emphasis' | 'emphasisSource' | 'emphasisBecause'> {
  const { stored, progress, stateWord, safety } = args
  if (stored !== undefined) {
    return {
      emphasis: stored,
      emphasisSource: 'stored',
      emphasisBecause: t('g7b.model.somebody_stored_the_emphasis_for_this_node', { v1: t(`g7b.emphasis.${stored}`) }),
    }
  }
  // Safety first, for the same reason attention.ts gives it a rank floor: nothing out-adds a person
  // being hurt, and a safety record filed this morning must not be quieter than a stale failure.
  if (safety) {
    return {
      emphasis: 'safety',
      emphasisSource: 'state',
      emphasisBecause: t('g7b.model.a_stored_consequence_on_this_says_a'),
    }
  }
  if (progress === 'stopped_short') {
    return {
      emphasis: 'blocked',
      emphasisSource: 'state',
      emphasisBecause: t('g7b.model.its_state_word_means_the_work_began', { v1: readStateWord(stateWord).text }),
    }
  }
  if (progress === 'in_flight') {
    return {
      emphasis: 'active',
      emphasisSource: 'state',
      emphasisBecause: t('g7b.model.its_state_word_means_somebody_is_on', { v1: readStateWord(stateWord).text }),
    }
  }
  if (progress === 'finished') {
    return {
      emphasis: 'muted',
      emphasisSource: 'state',
      emphasisBecause: t('g7b.model.its_state_word_means_it_reached_its', { v1: readStateWord(stateWord).text }),
    }
  }
  if (progress === 'paused') {
    return {
      emphasis: 'muted',
      emphasisSource: 'state',
      emphasisBecause: t('g7b.model.its_state_word_means_it_was_deliberately', { v1: readStateWord(stateWord).text }),
    }
  }
  if (stateWord === null) {
    return {
      emphasis: null,
      emphasisSource: 'none',
      emphasisBecause:
        t('g7b.model.this_record_carries_no_state_word_at'),
    }
  }
  if (progress === 'unclassified') {
    return {
      emphasis: null,
      emphasisSource: 'none',
      emphasisBecause: t('g7b.model.so_nothing_here_gives_it_an_emphasis', { v1: unclassifiedNote(stateWord) }),
    }
  }
  if (progress === 'unknown') {
    return {
      emphasis: null,
      emphasisSource: 'none',
      emphasisBecause: t('g7b.model.its_state_word_records_the_standing_as', { v1: readStateWord(stateWord).text }),
    }
  }
  return {
    emphasis: null,
    emphasisSource: 'none',
    emphasisBecause: t('g7b.model.its_state_word_means_the_work_has', { v1: readStateWord(stateWord).text }),
  }
}

/**
 * Does the arrangement ask for this pipeline's steps folded into its box?
 *
 * ONE READER, USED TWICE. The builder has to know before it makes the step nodes, and `applyIntent`
 * has to say so on the node afterwards. Two expressions reading the same key is how the two answers
 * would eventually disagree and a fold would half-happen.
 */
function foldsPipeline(intent: ScopeIntent | undefined, pipelineId: string): boolean {
  return intent?.nodes?.[pipelineId]?.collapsed === true
}

/** The records the attention rule flagged as a stored consequence to a person. */
function safetyRecords(rowsByRecord: ReadonlyMap<string, { row: FlowAttentionRow; visible: boolean }[]>): Set<string> {
  const found = new Set<string>()
  for (const [recordId, rows] of rowsByRecord) {
    if (rows.some((entry) => entry.row.safety)) found.add(recordId)
  }
  return found
}

/**
 * Resolve the stored presentation intent against the nodes that are actually on this canvas.
 *
 * ONE PASS, AFTER THE NODES EXIST, because half of the vocabulary can only be checked against the
 * finished drawing: `near` names another node, and `collapsed` only means something on a node that
 * has something inside it. Every hint either changes the node or lands in `report.unhonoured` with
 * the reason in words. Nothing is dropped in between.
 */
function applyIntent(args: {
  nodes: GraphNode[]
  scope: Scope
  intent?: ScopeIntent
  safety: ReadonlySet<string>
  report: LayoutReport
  /**
   * Targets that exist in this scope but are not drawn because they are folded inside something.
   *
   * WITHOUT THIS THE REASON WOULD BE WRONG. A step of a folded pipeline is not a typo and not a
   * deleted record, and telling a reader "nothing here has that id" would send them looking for a
   * mistake they did not make.
   */
  folded?: ReadonlySet<string>
}): void {
  const { nodes, scope, intent, safety, report, folded } = args
  const stored = intent?.nodes ?? {}
  const used = new Set<string>()

  /** Why a target names nothing on this canvas. Three different answers, and they are not alike. */
  const whyMissing = (target: string): string => {
    if (folded?.has(target) === true) {
      return (
        t('g7b.model.it_is_inside_a_pipeline_box_this') +
        t('g7b.model.how_it_is_presented_can_apply_to')
      )
    }
    return scope.at === 'modules'
      ? t('g7b.model.nothing_drawn_here_has_that_id_in') +
          t('g7b.model.a_pipeline_and_its_steps_have_their')
      : t('g7b.model.nothing_drawn_here_has_that_id_in_2682') +
          t('g7b.model.module_that_carries_one_of_its_blocks')
  }

  /**
   * The node a `near` points at, by record id.
   *
   * A BLOCK IS TRIED FIRST. In a pipeline's drawing the pipeline's own record id belongs to the box
   * and every block inside it also carries that record id in `recordId`, so the block's own id is
   * the more specific answer and there is nothing ambiguous about preferring it.
   */
  const nearNode = (value: string): GraphNode | undefined => {
    const block = nodes.find((node) => node.stepId === value)
    if (block !== undefined) return block
    return nodes.find((node) => node.recordId === value && node.stepId === null)
  }

  for (const node of nodes) {
    const target = intentTargetOf(node)
    const mine: NodeIntent | undefined = stored[target]
    if (mine !== undefined) used.add(target)

    /**
     * The sentences this node put in `report.honoured`, kept on the node as well as in the report.
     *
     * WHY BOTH. The report is one list for the whole drawing, and the projection that runs after
     * this can take a card off the canvas — at which point that card's sentences stop being true,
     * because a hint on a card nobody is drawing was not applied to anything a reader can see.
     * Taking them out again means knowing which line belongs to which node, and the only honest way
     * to know that is to keep the line where it was written rather than to read the target back out
     * of the sentence later. A second reader of these strings is the defect this repository keeps
     * producing.
     */
    const applied: string[] = []
    const honour = (line: string): void => {
      applied.push(line)
      report.honoured.push(line)
    }

    const role: NodeRole = mine?.role ?? 'normal'
    if (mine?.role !== undefined) {
      honour(
        hintSentence(
          target,
          t('g7b.model.role', { v1: role }),
          // WHAT EACH ONE ACTUALLY DOES, checked against `levelWithRole` and `CARD_WIDTH`.
          // `prominent` used to be reported as "one detail level higher", which was true of the
          // renderer and false of the rule: card.ts refuses to let a stored hint reach `expanded`,
          // because a paragraph on the canvas by default is the failure that pass removed. So a
          // prominent card is a WIDER card at the same level, and this sentence now says that
          // rather than promising a level the drawing will not give it.
          role === 'compact'
            ? t('g7b.model.its_card_is_drawn_one_detail_level')
            : role === 'prominent'
              ? t('g7b.model.its_card_is_drawn_wider_than_the')
              : t('g7b.model.it_is_drawn_the_way_mole_office'),
        ),
      )
    }

    const emphasis = emphasisOf({
      stored: mine?.emphasis,
      progress: node.progress,
      stateWord: node.stateWord,
      safety: safety.has(node.recordId),
    })
    if (mine?.emphasis !== undefined) {
      honour(hintSentence(target, t('g7b.model.emphasis', { v1: mine.emphasis }), t('g7b.model.it_overrides_what_this_node_s_own')))
    }

    // A fold only means something where something can be inside, and in this product that is a
    // pipeline box in its own drawing. It is checked against the KIND rather than against the
    // children on the canvas, because a box that is already folded has no children on the canvas —
    // asking the canvas would report the honoured fold as unhonourable.
    const canFold = node.kind === 'pipeline'
    let collapsed = false
    if (mine?.collapsed === true) {
      if (canFold) {
        collapsed = true
        honour(
          hintSentence(target, t('g7b.model.collapsed_true'), t('g7b.model.its_steps_are_folded_into_the_box')),
        )
      } else {
        report.unhonoured.push({
          target,
          hint: t('g7b.model.collapsed_true'),
          because:
            t('g7b.model.nothing_is_drawn_inside_this_node_so') +
            t('g7b.model.nodes_and_only_in_that_pipeline_s'),
        })
      }
    }

    let near: string | null = null
    if (mine?.near !== undefined) {
      const beside = nearNode(mine.near)
      if (beside === undefined || beside.id === node.id) {
        report.unhonoured.push({
          target,
          hint: t('g7b.model.near', { v1: mine.near }),
          because:
            beside?.id === node.id
              ? t('g7b.model.a_node_cannot_be_kept_beside_itself')
              : t('g7b.model.a_near_names_another_record_drawn_here', { v1: whyMissing(mine.near) }),
        })
      } else {
        near = beside.id
        honour(
          hintSentence(target, t('g7b.model.near', { v1: mine.near }), t('g7b.model.it_is_handed_to_the_layout_beside', { v1: beside.title })),
        )
      }
    }

    if (mine?.lane !== undefined) {
      honour(
        hintSentence(target, t('g7b.model.lane', { v1: mine.lane }), t('g7b.model.it_is_grouped_with_everything_else_in')),
      )
    }
    if (mine?.order !== undefined) {
      honour(
        hintSentence(target, t('g7b.model.order', { v1: mine.order }), t('g7b.model.it_takes_that_place_in_the_reading')),
      )
    }

    // WHERE SOMEBODY PUT THIS CARD. Both halves or neither — the write door refuses half a place —
    // so a stored place is a place.
    const placedAt =
      typeof mine?.x === 'number' && typeof mine.y === 'number' ? { x: mine.x, y: mine.y } : null
    if (placedAt !== null) {
      honour(
        hintSentence(
          target,
          t('g7b.model.put_at', { v1: String(Math.round(placedAt.x)), v2: String(Math.round(placedAt.y)) }),
          t('g7b.model.it_is_drawn_where_somebody_dragged_it'),
        ),
      )
    }

    node.presentation = {
      target,
      lane: mine?.lane ?? null,
      order: mine?.order ?? null,
      role,
      roleSource: mine?.role === undefined ? 'default' : 'stored',
      collapsed,
      near,
      placedAt,
      // The keys of what was stored, so nothing downstream has to guess whether this node was
      // arranged by reading the resolved fields back.
      stored: mine === undefined ? [] : Object.keys(mine),
      applied,
      ...emphasis,
    }
  }

  // A target nobody on this canvas answers to. It is reported rather than ignored: the usual cause
  // is a record that has been deleted, or intent written against the wrong scope.
  for (const target of Object.keys(stored)) {
    if (used.has(target)) continue
    report.unhonoured.push({ target, hint: t('g7b.model.all_of_it'), because: whyMissing(target) })
  }
}

/**
 * Put the nodes in the order the stored intent asks for.
 *
 * ONLY WHEN SOMETHING WAS STORED. With no lane and no order anywhere, the array keeps the order the
 * records are in — which is the order the work happens in for steps, and what makes ELK's input
 * byte-identical between two runs of an unarranged drawing. Sorting unconditionally would move the
 * picture for every reader who has arranged nothing, to no purpose.
 *
 * Lanes come out in the order they were first met rather than alphabetically: a lane is a name
 * somebody chose and the first one they wrote is the first one they meant.
 */
function orderNodesByIntent(nodes: GraphNode[]): GraphNode[] {
  const arranged = nodes.some((node) => node.presentation.lane !== null || node.presentation.order !== null)
  if (!arranged) return nodes
  const laneRank = new Map<string, number>()
  for (const node of nodes) {
    const lane = node.presentation.lane
    if (lane !== null && !laneRank.has(lane)) laneRank.set(lane, laneRank.size)
  }
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => {
      // A node in no lane sorts after every named lane. It is not in the arrangement, so it does not
      // get to break it up.
      const laneA = a.node.presentation.lane === null ? laneRank.size : (laneRank.get(a.node.presentation.lane) ?? laneRank.size)
      const laneB = b.node.presentation.lane === null ? laneRank.size : (laneRank.get(b.node.presentation.lane) ?? laneRank.size)
      if (laneA !== laneB) return laneA - laneB
      const orderA = a.node.presentation.order ?? Number.POSITIVE_INFINITY
      const orderB = b.node.presentation.order ?? Number.POSITIVE_INFINITY
      if (orderA !== orderB) return orderA - orderB
      return a.index - b.index
    })
    .map((entry) => entry.node)
}

/** The five checklist words are also panel states, so a step's chip is its stored word. */
function stepState(state: ItemState): PanelState {
  return state
}

/**
 * The state of the one package that names this block among its plan blocks. Nothing when no package names it. Nothing
 * when two do, because two packages have no one state, and the card then draws the block's own state.
 */
export function thePackageStateOn(packages: GraphInput['packages'], blockId: string): { packageState?: PackageState } {
  const naming = (packages ?? []).filter((row) => row.planBlocks.includes(blockId))
  return naming.length === 1 ? { packageState: naming[0]!.state } : {}
}

/** Every attention row for a record, whether the server showed it or held it into the remainder. */
function attentionByRecord(attention: FlowAttentionResult): Map<string, { row: FlowAttentionRow; visible: boolean }[]> {
  const out = new Map<string, { row: FlowAttentionRow; visible: boolean }[]>()
  const take = (rows: readonly FlowAttentionRow[], visible: boolean) => {
    for (const row of rows) {
      const list = out.get(row.recordId)
      if (list === undefined) out.set(row.recordId, [{ row, visible }])
      else list.push({ row, visible })
    }
  }
  // BOTH LISTS. A row in `remainder` was selected by exactly the same rule; what moved it was a cap
  // on how many rows ONE screen shows. Reading only `visible` here would mean a failed step vanished
  // from its own pipeline's drawing because three obligations outranked it somewhere else.
  take(attention.visible, true)
  take(attention.remainder, false)
  return out
}

/**
 * The highest-ranked of a record's attention rows, or nothing when it has none.
 *
 * The SERVER's score decides, never a second opinion computed here. A record can hold several rows
 * — the record itself and two of its checklist items — and the loudest is the one the card reports.
 */
function topRow(
  rows: readonly { row: FlowAttentionRow; visible: boolean }[] | undefined,
): { row: FlowAttentionRow; visible: boolean } | undefined {
  let best: { row: FlowAttentionRow; visible: boolean } | undefined
  for (const entry of rows ?? []) if (best === undefined || entry.row.score > best.row.score) best = entry
  return best
}

/** The loudest level any of a record's own attention rows earned, or nothing when it has none. */
function alarmOfRecord(
  rows: readonly { row: FlowAttentionRow; visible: boolean }[] | undefined,
  now: number,
): AlarmLevel | undefined {
  const best = topRow(rows)
  if (best === undefined) return undefined
  return alarmFor({
    safety: best.row.safety,
    lateMs: best.row.reason.owed?.lateMs ?? null,
    satDays: daysSince(best.row.reason.stoppedShort?.since ?? null, now),
  })
}

/**
 * How a stored state word is drawn, when the app's chip vocabulary contains it.
 *
 * THE LIST BELOW IS A SECOND COPY OF `PANEL_STATES`, retyped. This file already imports the
 * `PanelState` type from ../ui.tsx, where the ten words are declared and the type is derived
 * from them — so it imports the type and rewrites the values. The widening to `readonly
 * string[]` and the `as PanelState` cast defeat the compiler in both directions: an eleventh
 * word added over there would be drawn here as "no state", and a word removed over there would
 * still compile here. Nothing fails either way, which is why this is written down rather than
 * annotated with a request to keep them in step.
 */
function panelStateOf(word: string | null): PanelState | null {
  if (word === null) return null
  const lower = word.trim().toLowerCase()
  const known: readonly string[] = ['todo', 'doing', 'done', 'failed', 'blocked', 'broken', 'inferred', 'overdue', 'running', 'crashed']
  return known.includes(lower) ? (lower as PanelState) : null
}

/**
 * WHY AN ATTACHED RECORD NEEDS A PERSON, IN THE READER'S OWN LANGUAGE.
 *
 * `row.reason.because` is the server's sentence, written in English by `becauseSentence()` in
 * src/shared/attention.ts for an agent reading raw JSON. This drawing is read by a person, so it
 * builds the sentence again from the same facts on the row: the coded clauses, who is waiting and
 * the recorded consequence. It uses the words the attention list on Home uses for them
 * (`codedReasonWords` and `RowFacts` in AttentionPanel.tsx). Every value comes off the row the
 * server ranked, so nothing is judged a second time here. `RowFacts` was removed in wave 13k's round
 * 22 with the row that drew it, so this function is now the one place that says who is waiting and
 * the consequence in words; `codedReasonWords` is still shared.
 */
function attachmentReasonWords(row: FlowAttentionRow): string {
  const parts: string[] = row.reason.coded.map((one) => codedReasonWords(one, row.recordKind))
  const owed = row.reason.owed
  if (owed !== null) {
    let clause = t('home.partyWaiting', { party: owed.party })
    if (owed.hops > 0) clause += t('home.owedThrough', { title: owed.throughTitle, n: owed.hops })
    clause += owed.due === null ? t('home.noAgreedDate') : t('home.dueDate', { date: formatDue(owed.due) })
    parts.push(t('g7b.model.one_sentence', { v1: clause }))
  }
  if (row.reason.consequence !== null) parts.push(t('g7b.model.recorded_consequence', { v1: row.reason.consequence.what }))
  return parts.length === 0 ? t('g7b.model.nothing_recorded_says_why_this_needs_a_person') : parts.join(' ')
}

/**
 * Build one attachment from a link and the record at its far end.
 *
 * The facts are the SERVER's when the attention rule selected this record, because a second
 * opinion about why something needs a person is the one duplication this product cannot take. The
 * sentence is said in the reader's language from those facts (`attachmentReasonWords`). When the
 * rule did not select it, the sentence is about the stored link and says so through `source`.
 */
function attachmentOf(args: {
  record: PanelRecord
  link: GraphLink
  towardsNode: boolean
  rows: { row: FlowAttentionRow; visible: boolean }[] | undefined
  now: number
}): Attachment {
  const { record, link, towardsNode, rows, now } = args
  const spec = linkWord(link.type, 'forward')
  const through = towardsNode ? t('g7b.model.this', { v1: spec.text }) : t('g7b.model.this_it', { v1: spec.text })
  const stateWord = str(isObj(record.data) ? record.data['state'] : undefined)
  const progress = progressOf(stateWord)
  const top = topRow(rows)
  const gate = link.gate.at === 'gate' ? link.gate.gate : null

  return {
    recordId: record.id,
    kind: record.kind,
    title: record.title,
    stateWord,
    progress,
    state: panelStateOf(stateWord),
    alarm: top === undefined ? ageAlarm(progress, record.updatedAt, now) : alarmOfRecord(rows, now),
    through,
    because:
      top === undefined
        ? t('g7b.model.it_is_linked_to_this_by_a', { v1: linkWord(link.type, 'forward').text })
        : attachmentReasonWords(top.row),
    source: top === undefined ? 'stored-link' : 'attention-rule',
    gate,
    onFirstScreen: top?.visible === true,
  }
}

/**
 * Which linked records are worth attaching to a node, and which are simply neighbours.
 *
 * THE RULE IS THE SERVER'S, NOT A SECOND ONE. A record attaches when the attention rule selected it
 * — owed to somebody outside, or its own word says it stopped short — or when the link carries a
 * GATE, because a gate is a recorded statement that this thing is holding the node up whatever the
 * blocker's own state says. Everything else linked to the node is counted in `omitted` and named, so
 * "nothing is attached" never has to mean "nothing was looked at".
 */
function attachmentsFor(args: {
  nodeRecordId: string
  links: readonly GraphLink[]
  byId: ReadonlyMap<string, PanelRecord>
  rowsByRecord: ReadonlyMap<string, { row: FlowAttentionRow; visible: boolean }[]>
  /** Record ids that are themselves nodes on this canvas, so they are drawn as boxes not chips. */
  drawn: ReadonlySet<string>
  now: number
}): { attached: Attachment[]; quiet: number } {
  const { nodeRecordId, links, byId, rowsByRecord, drawn, now } = args
  const attached: Attachment[] = []
  let quiet = 0
  for (const link of links) {
    const towardsNode = link.toId === nodeRecordId
    const otherId = towardsNode ? link.fromId : link.toId
    if (otherId === nodeRecordId) continue
    if (drawn.has(otherId)) continue
    const other = byId.get(otherId)
    if (other === undefined) {
      // The far end has been deleted. It is a fact about the archive and it is kept: a link that
      // used to point somewhere is not the same as a link that never existed.
      attached.push({
        recordId: otherId,
        kind: 'note',
        title: t('g7b.deletedRecord'),
        stateWord: null,
        progress: null,
        state: 'broken',
        alarm: 'raised',
        through: linkWord(link.type, 'forward').text,
        because: t('g7b.model.the_record_at_the_other_end_of'),
        source: 'stored-link',
        gate: null,
        onFirstScreen: false,
      })
      continue
    }
    const rows = rowsByRecord.get(otherId)
    const gated = link.gate.at === 'gate'
    if (rows === undefined && !gated) {
      quiet++
      continue
    }
    attached.push(attachmentOf({ record: other, link, towardsNode, rows, now }))
  }
  attached.sort(
    (a, b) =>
      Number(b.onFirstScreen) - Number(a.onFirstScreen) ||
      (a.title < b.title ? -1 : a.title > b.title ? 1 : 0),
  )
  return { attached, quiet }
}

// ============================================================================ the modules scope

/** A module's checklist, counted once so the fact and the badge cannot disagree. */
interface Checklist {
  /** False when no `parts` key is stored at all. A module is required to have one. */
  stored: boolean
  total: number
  done: number
  stopped: number
}

function checklistOf(record: PanelRecord): Checklist {
  const data = isObj(record.data) ? record.data : {}
  const parts = Array.isArray(data['parts']) ? data['parts'] : null
  if (parts === null) return { stored: false, total: 0, done: 0, stopped: 0 }
  let total = 0
  let done = 0
  let stopped = 0
  for (const part of parts) {
    if (!isObj(part)) continue
    for (const item of Array.isArray(part['items']) ? part['items'] : []) {
      if (!isObj(item)) continue
      total++
      const word = str(item['state'])
      if (word === 'done') done++
      if (word === 'failed' || word === 'blocked') stopped++
    }
  }
  return { stored: true, total, done, stopped }
}

/**
 * How much pipeline work names one module, counted across every pipeline.
 *
 * THREE NUMBERS AND NOT ONE, because a module carrying six steps of which two have stopped short is
 * a different thing from a module carrying six that are all fine, and the picture has to be able to
 * say which. `pipelines` is here so the count cannot be misread as "six steps of one pipeline".
 */
interface CarriedSteps {
  steps: number
  pipelines: number
  stopped: number
}

const NO_STEPS: CarriedSteps = { steps: 0, pipelines: 0, stopped: 0 }

function moduleFacts(record: PanelRecord, carried: CarriedSteps): CardFact[] {
  const data = isObj(record.data) ? record.data : {}
  const facts: CardFact[] = []

  const context = str(data['context'])
  // The module's own words, first. A card whose only content is a title is a box with a name in it.
  if (context !== null) facts.push({ label: t('g7b.model.why_it_exists'), value: context })
  else facts.push({ label: t('g7b.model.why_it_exists'), value: '—' })

  const list = checklistOf(record)
  if (!list.stored) {
    facts.push({ label: t('g7b.model.checklist'), value: t('g7b.model.no_checklist_is_stored_and_a_module') })
  } else {
    facts.push({
      label: t('g7b.model.checklist'),
      value:
        list.total === 0
          ? '—'
          : t('g7b.model.of_done', { v1: list.done, v2: list.total, v3: list.stopped === 0 ? '' : t('g7b.model.stopped_short_2757', { v1: list.stopped }) }),
    })
  }

  facts.push({
    label: t('g7b.model.carries'),
    value:
      carried.steps === 0
        ? '—'
        : t('g7b.model.pipeline_step', { v1: carried.steps, v2: carried.steps === 1 ? '' : 's' }),
  })
  return facts
}

/** How far a module has got, what is wrong with it, and what is attached to it. */
function moduleBadges(record: PanelRecord, carried: CarriedSteps, attached: readonly Attachment[]): Badge[] {
  const badges: Badge[] = []
  const list = checklistOf(record)

  badges.push(
    !list.stored
      ? {
          key: 'checklist',
          count: null,
          short: t('g7b.model.no_checklist'),
          full: t('g7b.model.no_checklist_is_stored_on_this_module'),
          alarm: undefined,
          summarises: 'facts',
          standsInForLines: false,
        }
      : list.total === 0
        ? {
            key: 'checklist',
            count: 0,
            short: t('g7b.model.empty_checklist'),
            full: t('g7b.model.the_checklist_is_stored_and_empty_that'),
            alarm: undefined,
            summarises: 'facts',
            standsInForLines: false,
          }
        : {
            key: 'checklist',
            count: list.done,
            of: list.total,
            short: t('g7b.model.of_done_2771', { v1: list.done, v2: list.total }),
            full: t('g7b.model.of_checklist_items_on_this_module_are', { v1: list.done, v2: list.total }),
            alarm: undefined,
            summarises: 'facts',
            // The checklist is on the module's own page, whole. Nothing on this canvas draws it.
            standsInForLines: false,
          },
  )
  badges.push(
    carried.steps === 0
      ? {
          key: 'carries',
          count: 0,
          short: t('g7b.model.carries_no_step'),
          full: t('g7b.model.no_pipeline_step_names_this_module_nothing'),
          alarm: undefined,
          summarises: 'facts',
          // "Carries nothing" has no line to draw either, and it is the answer that says WHY this
          // card has nothing joining it to the pipeline. Losing it leaves the same silent card.
          standsInForLines: true,
        }
      : {
          key: 'carries',
          count: carried.steps,
          short: t('g7b.model.carries_2779', { v1: countPhrase(carried.steps, 'step') }),
          full:
            t('g7b.model.in_name_this_module', { v1: countPhrase(carried.steps, 'pipeline step'), v2: countPhrase(carried.pipelines, 'pipeline') }) +
            t('g7b.model.a_step_can_be_carried_by_two'),
          alarm: undefined,
          summarises: 'facts',
          // THE COUNT THE HELD-BACK LINES ARE FOLDED INTO. In the modules drawing no block is a box
          // at all, so no `carries` line exists to draw; in a pipeline drawing every one of them is
          // `drawn: 'on-selection'`. Either way this badge is the only place the number appears.
          standsInForLines: true,
        },
  )

  if (list.stopped > 0) {
    badges.push({
      key: 'checklist-stopped',
      count: list.stopped,
      short: t('g7b.model.stopped_short_2787', { v1: countPhrase(list.stopped, 'item') }),
      full: t('g7b.model.on_this_module_began_and_did_not', { v1: countPhrase(list.stopped, 'checklist item') }),
      alarm: 'raised',
      // Nothing else on the node says this. The `checklist` fact counts what is DONE, and a module
      // with two failed items and four done ones would otherwise look like ordinary progress.
      summarises: null,
      standsInForLines: false,
    })
  }
  if (carried.stopped > 0) {
    badges.push({
      key: 'carries-stopped',
      count: carried.stopped,
      short: t('g7b.model.stopped_short_2793', { v1: countPhrase(carried.stopped, 'step') }),
      full:
        t('g7b.model.this_module_carries_began_and_did_not', { v1: countPhrase(carried.stopped, 'pipeline step') }) +
        t('g7b.model.it_carries_across_in_all_open_one', { v1: countPhrase(carried.steps, 'step'), v2: countPhrase(carried.pipelines, 'pipeline') }),
      alarm: 'raised',
      summarises: null,
      // It is loud enough to keep its own place, and it counts trouble rather than lines.
      standsInForLines: false,
    })
  }

  badges.push(...attachedBadges(attached))
  return rankBadges(badges)
}

/**
 * How much pipeline work names each module, across every pipeline on file.
 *
 * BY TITLE STILL, because that is what a module card is labelled with — but the title now comes
 * from the module RECORD at the far end of an `implements` link, not from a list of titles copied
 * onto a step. That is the difference the whole change was for: one accepted rename used to leave
 * ten steps naming the old title and the links naming the new one, with nothing reporting it.
 */
function carriedStepsByModule(
  records: readonly PanelRecord[],
  links: readonly GraphLink[],
): Map<string, CarriedSteps> {
  const carried = new Map<string, { steps: number; pipelines: Set<string>; stopped: number }>()
  const blockLinks = blockLinkRows(links)
  for (const record of records) {
    if (record.kind !== 'pipeline') continue
    for (const step of readPipeline(record, records, blockLinks).steps) {
      for (const title of step.modules) {
        const entry = carried.get(title) ?? { steps: 0, pipelines: new Set<string>(), stopped: 0 }
        entry.steps++
        entry.pipelines.add(record.id)
        if (progressOf(step.state) === 'stopped_short') entry.stopped++
        carried.set(title, entry)
      }
    }
  }
  return new Map(
    [...carried.entries()].map(([title, entry]) => [
      title,
      { steps: entry.steps, pipelines: entry.pipelines.size, stopped: entry.stopped },
    ]),
  )
}

/** A node before its intent has been read. `applyIntent` replaces every one of these. */
function unarranged(target: string): NodePresentation {
  return {
    target,
    lane: null,
    order: null,
    role: 'normal',
    roleSource: 'default',
    emphasis: null,
    emphasisSource: 'none',
    emphasisBecause: t('g7b.model.the_presentation_intent_for_this_drawing_has'),
    collapsed: false,
    near: null,
    placedAt: null,
    stored: [],
    applied: [],
  }
}

/**
 * WHAT ONE MODULE CONTAINS — D28 — AND THE LADDER THAT OPENS FOR IT.
 *
 * THE ONE READER. `partsOf` in @shared/containment.ts answers this, and it sorts by title then id.
 * Nothing here sorts again: the order this returns is the order the office lists a record's parts
 * everywhere else, and the drawing prints no name for that order at all.
 *
 * A MODULE WITH CHILDREN CAN REACH LEVELS 4 TO 6 EVEN WITH NO SHORT FORM WRITTEN BY PART. The
 * criterion asks a card enlarged past level 3 to draw the records it contains, and the reading
 * surface on the live office holds 51 of them and no summary blocks, so without this its children
 * could never be drawn. The by-part levels are the levels the card's parts are drawn at, and for a
 * module whose only parts are the records it contains, those records ARE what that level draws. The
 * written parts, where there are any, are drawn as before — `levels.parts` is untouched.
 */
function containsOn(
  record: PanelRecord,
  context: { records: readonly PanelRecord[]; links: readonly ContainmentLink[] },
): { contains: readonly Containment[]; levels: NodeLevels } {
  const contains = partsOf(record, context).parts
  const levels = levelsOf(record)
  if (contains.length === 0) return { contains, levels }
  const opened = BY_PART_LEVELS.filter((level) => !levels.has.includes(level))
  if (opened.length === 0) return { contains, levels }
  return { contains, levels: { ...levels, has: [...levels.has, ...opened] } }
}

/** The workspace's links in the shape `partsOf` reads. One mapping per drawing. */
function containmentLinksIn(links: readonly GraphLink[]): ContainmentLink[] {
  return links.map((link) => ({ id: link.linkId, fromId: link.fromId, toId: link.toId, type: link.type }))
}


/**
 * The corpus a drawing built from the project's own records needs, or a loud stop saying what is
 * missing. See `GraphInput`: which inputs a place reads is part of its configuration.
 */
function corpusOf(input: GraphInput, place: string): {
  records: readonly PanelRecord[]
  links: readonly GraphLink[]
  attention: FlowAttentionResult
} {
  const { records, links, attention } = input
  if (records === undefined || links === undefined || attention === undefined) {
    const missing = [
      records === undefined ? t('g7b.model.the_records') : null,
      links === undefined ? t('g7b.model.the_links') : null,
      attention === undefined ? t('g7b.model.the_attention_answer') : null,
    ].filter((one): one is string => one !== null)
    throw new Error(
      t('g7b.model.the_drawing_is_built_from_the_project', { v1: place, v2: missing.join(', ') }) +
        t('g7b.model.missing_nothing_was_drawn_rather_than_an'),
    )
  }
  return { records, links, attention }
}

function buildModulesScope(input: GraphInput): StructureGraph {
  const { records, links, attention } = corpusOf(input, 'modules')
  const { now } = input
  const modules = records.filter((record) => record.kind === 'module')
  const byId = new Map(records.map((record) => [record.id, record]))
  const rowsByRecord = attentionByRecord(attention)
  const drawn = new Set(modules.map((record) => record.id))
  const carried = carriedStepsByModule(records, links)

  /**
   * Each record's links, gathered in one pass over the links instead of one pass PER MODULE.
   *
   * `links.filter(...)` inside `modules.map(...)` was O(modules × links). Measured on densified
   * copies of the real database: 108 modules and 1,216 links built the graph in 8 ms, and 1,080
   * modules and 12,160 links took 594 ms — ten times the workspace for seventy-four times the work.
   * With the index it is 420 ms. It is not what broke the page and was never close to it; it is
   * fixed here because it is quadratic and it is nine lines.
   *
   * THE 420 MS THAT IS LEFT IS NOT IN THIS FILE. It is `carriedStepsByModule` below, which calls
   * `readPipeline` once per pipeline, and `readPipelineBlocks` in `src/shared/blocks.ts` rebuilds a
   * map of EVERY record on every one of those calls — 400 pipelines × 15,120 records at this size.
   * A profile puts 739 ms of the process in that one function. Fixing it means hoisting that map
   * out or letting the caller pass one in, and shared/blocks.ts is not this pass's file.
   *
   * The order inside each list is the order the links arrived in, which is the order `filter`
   * produced, so nothing downstream can tell the difference.
   */
  const linksByRecord = new Map<string, GraphLink[]>()
  const note = (recordId: string, link: GraphLink): void => {
    const list = linksByRecord.get(recordId)
    if (list === undefined) linksByRecord.set(recordId, [link])
    else list.push(link)
  }
  for (const link of links) {
    note(link.fromId, link)
    // A link whose two ends are the same record came back from `filter` ONCE, so it is noted once
    // here too. Noting it twice would double a self-link on the one card that carries it.
    if (link.toId !== link.fromId) note(link.toId, link)
  }

  let quietTotal = 0
  const containmentLinks = containmentLinksIn(links)
  const nodes: GraphNode[] = modules.map((record) => {
    const mine = linksByRecord.get(record.id) ?? []
    const { attached, quiet } = attachmentsFor({
      nodeRecordId: record.id,
      links: mine,
      byId,
      rowsByRecord,
      drawn,
      now,
    })
    quietTotal += quiet
    const carries = carried.get(record.title) ?? NO_STEPS
    const { contains, levels } = containsOn(record, { records, links: containmentLinks })
    return {
      id: `mod:${record.id}`,
      kind: 'module' as const,
      recordId: record.id,
      stepId: null,
      parentId: null,
      inside: null,
      title: record.title,
      ordinal: null,
      // A module record has NO state field. Saying so is the point: inventing a state for it out of
      // its checklist would be a made-up word standing in a column where every other word is stored.
      stateWord: null,
      state: null,
      progress: null,
      alarm: alarmOfRecord(rowsByRecord.get(record.id), now),
      facts: moduleFacts(record, carries),
      badges: moduleBadges(record, carries, attached),
      attached,
      carriedBy: null,
      wall: null,
      note:
        attached.length === 0
          ? t('g7b.model.nothing_that_needs_a_person_is_linked')
          : null,
      words: wordsOf(record),
      levels,
      // A module is not a step, so nothing holds a pipeline inside it. `part_of` from a pipeline to
      // a module is not refused by the API and is not this drawing's question: this scope draws
      // modules and the pipelines beside them, and a module that contains one has it on the canvas
      // already.
      holds: [],
      contains,
      presentation: unarranged(record.id),
    }
  })

  const edges: GraphEdge[] = links
    .filter((link) => drawn.has(link.fromId) && drawn.has(link.toId) && link.fromId !== link.toId)
    .map((link) => edgeFromLink(link, (recordId) => `mod:${recordId}`))

  const pipelines = records.filter((record) => record.kind === 'pipeline').length
  const blocks = records.filter((record) => record.kind === BLOCK_KIND).length
  const omitted: Omission[] = []
  if (pipelines > 0) {
    omitted.push({
      what: t('g7b.PipelinePage.pipelines'),
      count: pipelines,
      // THE TWO NUMBERS ARE THIS WORKSPACE'S, NOT THE SEED'S. This sentence read "because 61 steps
      // beside 12 modules is a picture nobody reads" at every size — true of the seeded corpus and
      // read on screen as a claim about the workspace in front of you. On a workspace of 1,080
      // modules and 2,440 blocks it was a number about somebody else's project, which is the one
      // thing a count on this screen may never be.
      why: t('g7b.pipelineOmission'),
    })
  }
  if (quietTotal > 0) {
    omitted.push({
      what: t('g7b.model.records_linked_to_a_module_that_the'),
      count: quietTotal,
      why: t('g7b.model.they_are_linked_and_they_are_fine'),
    })
  }

  const report: LayoutReport = { honoured: [], unhonoured: [] }
  applyIntent({
    nodes,
    scope: { at: 'modules' },
    ...(input.intent === undefined ? {} : { intent: input.intent }),
    safety: safetyRecords(rowsByRecord),
    report,
  })

  return {
    scope: { at: 'modules' },
    title: t('g7b.model.the_project_structure_every_module_and_the'),
    nodes: orderNodesByIntent(nodes),
    edges,
    walls: [],
    omitted,
    notes: [
      t('g7b.model.a_module_is_the_curated_unit_of'),
      t('g7b.model.a_card_carries_its_name_and_counts'),
      t('g7b.model.the_count_of_steps_a_module_carries'),
      // "Every position on this canvas is worked out on each draw and none of it is stored. Nobody
      // maintains a coordinate here." — DELETED. The visible line above this fold already says
      // "Layout derived: nothing stores a position", and the fold's own first paragraphs said it a
      // third time. Three statements of one fact about the implementation, none of which changes
      // what a reader does. The one consequence that does is in StructureView's fold.
    ],
    problem: null,
    ...directionOf(input, report),
    report,
  }
}

/**
 * One stored link as a line. The word on the line is the type; the direction is the arrowhead.
 *
 * `nodeIdOf` turns a RECORD id into the NODE id it is drawn as, and the two are not the same thing:
 * one record can be a module card in one scope and a pipeline box in another. An edge that carried
 * record ids would name nothing on the canvas and quietly draw no line at all, which is how a stored
 * link disappears from a picture that is supposed to be a picture of stored links.
 */
function edgeFromLink(
  link: GraphLink,
  nodeIdOf: (recordId: string) => string,
  /**
   * Whether each end has happened or is only intended, or null where this drawing cannot say.
   *
   * A drawing that hands back null for an end gets the family the type alone gives, which is what
   * every caller got before the plan drawing needed the other answer. See `GraphEdge.family`.
   */
  worldAt: (recordId: string) => World | null = () => null,
  /** The stage a gate stops at, from src/web/lib/gate-stage.ts. A caller that passes none draws `upTo` as stored. */
  stageOf: (upTo: string | undefined) => GateStage = () => AS_STORED,
): GraphEdge {
  const spec = linkWord(link.type, 'forward')
  const gate = link.gate.at === 'gate' ? link.gate.gate : null
  const from = worldAt(link.fromId)
  const to = worldAt(link.toId)
  return {
    id: `link:${link.linkId}`,
    from: nodeIdOf(link.fromId),
    to: nodeIdOf(link.toId),
    relation: 'link',
    drawn: 'always',
    linkType: link.type,
    linkId: link.linkId,
    label: spec.text,
    gate,
    gateWords: gate === null ? null : gateWordsForReader(gate, stageOf(gate.upTo).words),
    reading: link.gate,
    inferred: link.inferred,
    broken: link.broken,
    family: from === null || to === null ? linkFamilyOf(link.type) : linkFamilyOf(link.type, { from, to }),
  }
}

// ============================================================================ the pipeline scope

/**
 * THE SUB-PIPELINES HELD INSIDE THIS PIPELINE'S OWN BLOCKS, read from `part_of` links.
 *
 * This is the whole of the subpipeline change and it stores nothing. `pipeline part_of block` is
 * legal today — `createLink` checks a cycle and a second parent and nothing else — and it was
 * invisible: `readPipelineBlocks` gathers `implements` and `blocks` links, the pipeline drawing
 * skips every stored link with a block at either end, and neither of them looks at `part_of`. So a
 * block with six steps inside it drew exactly like a block with none.
 *
 * WHAT IT COUNTS AND WHAT IT REFUSES TO COUNT. The sub-pipeline's own `blockIds` is the only place
 * that says which blocks are inside it, so the count comes from there; a listed id no live record
 * holds is counted in `unreadable` rather than dropped, exactly as the outer reading counts its own.
 * Nothing here reads a state word it was not handed: `done` is the stored word `done` and nothing
 * else is inferred from it.
 */
function heldPipelines(
  steps: readonly FlowStep[],
  links: readonly GraphLink[],
  byId: ReadonlyMap<string, PanelRecord>,
): Map<string, HeldPipeline[]> {
  const blocks = new Set(steps.map((step) => step.id))
  const held = new Map<string, HeldPipeline[]>()
  for (const link of links) {
    if (link.type !== 'part_of') continue
    if (!blocks.has(link.toId)) continue
    const child = byId.get(link.fromId)
    if (child === undefined || child.kind !== 'pipeline') continue
    const listed = child.data['blockIds']
    const ids: readonly unknown[] = Array.isArray(listed) ? listed : []
    let done = 0
    let unreadable = 0
    for (const id of ids) {
      const block = typeof id === 'string' ? byId.get(id) : undefined
      if (block === undefined || block.kind !== BLOCK_KIND) {
        unreadable++
        continue
      }
      if (block.data['state'] === 'done') done++
    }
    const list = held.get(link.toId) ?? []
    list.push({ recordId: child.id, title: child.title, steps: ids.length, done, unreadable })
    held.set(link.toId, list)
  }
  return held
}

/**
 * WHETHER ANYBODY HAS SAID THAT THE DEPENDENCIES IN THIS PIPELINE ARE ALL WRITTEN DOWN.
 *
 * Three answers, and absent is one of them. See `DependencyClaim` for why the difference matters:
 * without it a drawing of two unlinked chains is claiming they run independently, and the corpus
 * never said that about any pipeline.
 */
function dependencyClaim(record: PanelRecord): DependencyClaim {
  const said = record.data['dependenciesComplete']
  if (said === true) return 'complete'
  if (said === false) return 'incomplete'
  return 'unstated'
}

/**
 * The steps with no dependency link at either end — nothing waits on them and they wait on nothing.
 *
 * These are the steps the claim above is about. On the live campaign pipeline there are seven of
 * seventeen, and until somebody says otherwise all seven mean "nobody wrote it down".
 */
function stepsJoinedByNothing(steps: readonly FlowStep[]): FlowStep[] {
  const waitedOn = new Set<string>()
  for (const step of steps) for (const need of step.needs) waitedOn.add(need.blockId)
  return steps.filter((step) => step.needs.length === 0 && !waitedOn.has(step.id))
}

/** What a step's own card says about the order it runs in, given what the pipeline claims. */
const CONCURRENCY_WORDS: Readonly<Record<DependencyClaim, { short: string; full: string }>> = {
  unstated: {
    get short() { return t('g7b.model.nobody_said_what_it_waits_on') },
    get full() { return t('g7b.model.no_dependency_link_touches_this_block_at') },
  },
  complete: {
    get short() { return t('g7b.model.runs_independently') },
    get full() { return t('g7b.model.no_dependency_link_touches_this_block_at_2850') },
  },
  incomplete: {
    get short() { return t('g7b.model.a_dependency_is_missing_here') },
    get full() { return t('g7b.model.no_dependency_link_touches_this_block_at_2852') },
  },
}

/** What the pipeline box says about its own dependencies, in one badge. */
const CLAIM_WORDS: Readonly<Record<DependencyClaim, (loose: number, total: number) => { short: string; full: string }>> = {
  unstated: (loose, total) => ({
    short: t('g7b.model.joined_by_nothing', { v1: countPhrase(loose, 'step') }),
    full: t('g7b.model.of_the_steps_here_have_no_dependency', { v1: loose, v2: total }),
  }),
  complete: (loose, total) => ({
    short: t('g7b.model.dependencies_written_down'),
    full: t('g7b.model.this_pipeline_records_that_every_dependency_in', { v1: loose, v2: total }),
  }),
  incomplete: (loose, total) => ({
    short: t('g7b.model.dependencies_unfinished'),
    full: t('g7b.model.this_pipeline_records_that_its_dependencies_are', { v1: loose, v2: total }),
  }),
}

function stepFacts(step: FlowStep, holds: readonly HeldPipeline[], claim: DependencyClaim, loose: boolean, byId: ReadonlyMap<string, PanelRecord>, stageOf: (upTo: string | undefined) => GateStage): CardFact[] {
  const facts: CardFact[] = []
  facts.push({
    label: t('g7b.model.carried_by'),
    value:
      step.modules.length === 0
        ? '—'
        : step.modules.join(', '),
  })
  // WHAT IS INSIDE THIS STEP, when a pipeline is filed inside it. The count is the sub-pipeline's
  // own `blockIds` and the name is its own title: this line says a step has structure, and where to
  // read it, without copying a single one of its steps onto this drawing.
  for (const inside of holds) {
    facts.push({
      label: t('g7b.model.holds'),
      value:
        t('g7b.model.done', { v1: inside.title, v2: countPhrase(inside.steps, 'step'), v3: inside.done }) +
        (inside.unreadable === 0 ? '' : t('g7b.model.it_lists_that_no_record_holds', { v1: inside.unreadable })),
    })
  }
  if (step.measured !== null) facts.push({ label: t('g7b.model.measured'), value: step.measured })
  facts.push({
    label: t('g7b.model.waits_on'),
    value:
      step.needs.length === 0
        ? loose
          ? CONCURRENCY_WORDS[claim].full
          : t('g7b.model.no_dependency_is_recorded_which_is_not')
        : step.needs
            .map((need) =>
              need.gate === null
                ? t('g7b.model.blocks_it_nobody_has_said_how_much', { v1: byId.get(need.blockId)?.title ?? t('g7b.missingRecord') })
                : need.gate === 'hard'
                  ? t('g7b.model.must_finish_first', { v1: byId.get(need.blockId)?.title ?? t('g7b.missingRecord') })
                  : t('g7b.model.words', { v1: byId.get(need.blockId)?.title ?? t('g7b.missingRecord'), v2: gateWordsForReader({ kind: 'partial', ...(need.upTo === undefined ? {} : { upTo: need.upTo }) }, stageOf(need.upTo).words) }),
            )
            .join('; '),
  })
  return facts
}

/**
 * What is missing from a block. Nothing else, and that is deliberate.
 *
 * WHO CARRIES IT IS THE ONE THING THE LINES DO NOT SAY BY DEFAULT. The `carries` lines from the
 * module cards are all `drawn: 'on-selection'`, so until somebody presses a card this badge is the
 * whole of what the drawing states about who owns this block. That is why it is here, and why it is
 * marked `standsInForLines` so a card cannot rank it off.
 *
 * TWO ANSWERS AND NOT THREE, since a block became a record. It used to be three, because `modules`
 * was an array on a stored step and an ABSENT key ("nobody wrote this down") was a different fact
 * from `[]` ("nobody owns it yet"). `implements` is a link now, and a link is a row that exists or
 * does not — src/shared/blocks.ts says so and forbids any reader inventing the third state back. So
 * zero incoming links is one answer, in one sentence: no module is RECORDED as carrying this.
 */
function stepBadges(step: FlowStep, holds: readonly HeldPipeline[], claim: DependencyClaim, loose: boolean): Badge[] {
  const badges: Badge[] =
    step.modules.length === 0
      ? [
          {
            key: 'carried-by',
            count: 0,
            short: t('g7b.model.nobody_carries_this'),
            full: t('g7b.model.no_module_is_recorded_as_carrying_this_2876'),
            alarm: undefined,
            summarises: 'facts',
            standsInForLines: true,
          },
        ]
      : [
          {
            key: 'carried-by',
            count: step.modules.length,
            short: t('g7b.model.carried_by_2879', { v1: step.modules.length }),
            full: t('g7b.model.carry_this_step_a_step_is_not', { v1: countPhrase(step.modules.length, 'module'), v2: step.modules.join(', ') }),
            alarm: undefined,
            summarises: 'facts',
            standsInForLines: true,
          },
        ]
  // THE STEPS INSIDE THIS STEP, and this badge is the only place on the drawing they are counted.
  // The sub-pipeline is a separate drawing with its own cards, so no line here stands for it and
  // `standsInForLines` keeps a crowded card from ranking the number off.
  for (const inside of holds) {
    badges.push({
      key: `holds:${inside.recordId}`,
      count: inside.steps,
      short: t('g7b.model.holds_2884', { v1: countPhrase(inside.steps, 'step') }),
      full: t('g7b.model.this_block_holds_a_pipeline_of_its', { v1: inside.title, v2: countPhrase(inside.steps, 'step'), v3: inside.done }),
      alarm: undefined,
      summarises: 'facts',
      standsInForLines: true,
    })
  }
  // WHICH OF THE TWO SILENCES THIS IS. A step with no dependency at either end is either work that
  // runs independently on purpose or a link nobody wrote, and the drawing cannot tell them apart by
  // looking. The pipeline's own claim is the only thing that can, so the badge says which one it is
  // reading and never guesses.
  if (loose) {
    badges.push({
      key: 'order',
      count: null,
      short: CONCURRENCY_WORDS[claim].short,
      full: CONCURRENCY_WORDS[claim].full,
      alarm: undefined,
      summarises: 'facts',
      standsInForLines: true,
    })
  }
  return badges
}

/** What is wrong inside a pipeline box, what nobody owns, what holds it up, and what is folded. */
function pipelineBadges(args: {
  steps: readonly FlowStep[]
  walls: readonly PipelineWall[]
  attached: readonly Attachment[]
  /** How many steps are folded away inside the box. Zero when it is open. */
  folded: number
  /** Whether anybody has said the dependencies here are all written down. */
  claim: DependencyClaim
  /** How many steps have no dependency link at either end. */
  loose: number
}): Badge[] {
  const { steps, walls, attached, folded, claim, loose } = args
  const done = steps.filter((step) => step.state === 'done').length
  const stopped = steps.filter((step) => progressOf(step.state) === 'stopped_short').length
  // NO NULL CHECK, because there is nothing left that could be null. `FlowStep.modules` is derived
  // from the `implements` links into the block and is always an array; the `step.modules !== null`
  // that used to guard this line was reading a stored key that stopped existing when a block became
  // a record, and it compiled clean because comparing an array to null is legal TypeScript.
  const unowned = steps.filter((step) => step.modules.length === 0).length
  const badges: Badge[] = []

  badges.push(
    steps.length === 0
      ? {
          key: 'steps',
          count: 0,
          short: t('g7b.model.no_steps_read'),
          full: t('g7b.model.no_step_of_this_pipeline_could_be'),
          alarm: 'raised',
          summarises: 'facts',
          standsInForLines: false,
        }
      : {
          key: 'steps',
          count: done,
          of: steps.length,
          short: t('g7b.model.of_done_2899', { v1: done, v2: steps.length }),
          full: t('g7b.model.of_the_steps_this_pipeline_stores_are', { v1: done, v2: steps.length }),
          alarm: undefined,
          summarises: 'facts',
          // The blocks are boxes inside this one, each with its own state chip, so the drawing
          // already shows what this counts.
          standsInForLines: false,
        },
  )
  if (stopped > 0) {
    badges.push({
      key: 'steps-stopped',
      count: stopped,
      short: t('g7b.model.stopped_short_2903', { v1: countPhrase(stopped, 'step') }),
      full: t('g7b.model.began_and_did_not_finish_the_stored', { v1: countPhrase(stopped, 'step') }),
      alarm: 'raised',
      summarises: null,
      standsInForLines: false,
    })
  }
  if (unowned > 0) {
    badges.push({
      key: 'unowned',
      count: unowned,
      short: t('g7b.model.nobody_carries', { v1: countPhrase(unowned, 'step') }),
      full: t('g7b.model.have_no_module_recorded_as_carrying_them', { v1: countPhrase(unowned, 'step') }),
      alarm: undefined,
      summarises: null,
      // A block nobody carries has no line to hold back, because there is nothing at the far end of
      // one. This counts an absence rather than standing in for lines that exist.
      standsInForLines: false,
    })
  }
  if (walls.length > 0) {
    badges.push({
      key: 'walls',
      count: walls.length,
      short: t('g7b.model.held_up_by', { v1: walls.length }),
      full: t('g7b.model.block_this_pipeline_through_a_stored_gate', { v1: countPhrase(walls.length, 'record') }),
      alarm: 'raised',
      summarises: null,
      standsInForLines: false,
    })
  }
  // WHAT THE ABSENT LINES MEAN, said on the box rather than left to the layout. A pipeline whose
  // steps have no lines between them is drawn as several chains side by side, and that arrangement
  // reads as "these run in parallel" whether or not anything stored says so.
  if (loose > 0 || claim !== 'unstated') {
    const words = CLAIM_WORDS[claim](loose, steps.length)
    badges.push({
      key: 'dependencies',
      count: claim === 'unstated' ? loose : null,
      short: words.short,
      full: words.full,
      // NOT AN ALARM. Nobody having said is the ordinary state of every pipeline in this corpus, and
      // painting it as trouble would make the honest answer look like a defect.
      alarm: undefined,
      summarises: null,
      standsInForLines: true,
    })
  }
  if (folded > 0) {
    badges.push({
      key: 'folded',
      count: folded,
      short: t('g7b.model.folded', { v1: countPhrase(folded, 'step') }),
      full: t('g7b.model.are_inside_this_box_and_are_not', { v1: countPhrase(folded, 'step') }),
      alarm: undefined,
      summarises: null,
      standsInForLines: false,
    })
  }
  badges.push(...attachedBadges(attached))
  return rankBadges(badges)
}

function buildPipelineScope(input: GraphInput, recordId: string): StructureGraph {
  const { records, links, attention } = corpusOf(input, 'pipeline')
  const { now } = input
  const record = records.find((r) => r.id === recordId && r.kind === 'pipeline')
  if (record === undefined) {
    const missing = DRAWING_PLACES[input.scope.at].runs
    return {
      scope: { at: 'pipeline', recordId },
      title: t('g7b.model.a_pipeline_that_is_not_on_file'),
      nodes: [],
      edges: [],
      walls: [],
      omitted: [],
      notes: [],
      // THE ADDRESS IS WRONG AND NOTHING BROKE. It said "No pipeline on file has the id
      // NOPEnothere99. Nothing was substituted for it." — the raw id as the subject, and invariant 2
      // being defended to somebody who mistyped a URL and has never heard of invariant 2. The
      // substitution rule still holds and is still said where a substitution really happens, which
      // is the paragraph in PipelinePage.tsx that names the pipeline it drew instead.
      problem: t('g7b.model.there_is_no_pipeline_at_that_address'),
      direction: missing.direction,
      directionSource: 'default',
      directionBecause: missing.because,
      // No intent is read at all here: there is no drawing for it to be about, and reporting a
      // stored lane against a pipeline that does not exist would be noise on top of the real answer.
      report: { honoured: [], unhonoured: [] },
    }
  }

  const reading: PipelineReading = readPipeline(record, records, blockLinkRows(links))
  const byId = new Map(records.map((r) => [r.id, r]))
  const rowsByRecord = attentionByRecord(attention)
  // The two readings step 50 adds, both of them over links and fields that were already storable.
  const held = heldPipelines(reading.steps, links, byId)
  const claim = dependencyClaim(record)
  const loose = new Set(stepsJoinedByNothing(reading.steps).map((step) => step.id))

  const parentId = `pipe:${record.id}`
  const nodes: GraphNode[] = []
  const containmentLinks = containmentLinksIn(links)

  // The modules that carry any block of this pipeline. They are drawn as their own cards, outside the
  // pipeline box, because a module is not part of a pipeline — it carries blocks in several.
  //
  // BY ID, from the `implements` links. It was by TITLE, matching a list copied onto each step, which
  // is the pair of representations one accepted module rename broke ten of behind a 200.
  const carriedIds = new Set<string>()
  for (const step of reading.steps) for (const moduleId of step.moduleIds) carriedIds.add(moduleId)
  const carriedModules = records.filter((r) => r.kind === 'module' && carriedIds.has(r.id))
  // A BLOCK IS DRAWN, so it is a box on this canvas and not a chip on somebody else's card. Without
  // this every `blocks` link between two blocks would also appear as an attachment chip on both.
  const drawn = new Set<string>([
    record.id,
    ...carriedModules.map((r) => r.id),
    ...reading.steps.map((step) => step.id),
  ])

  const pipelineLinks = links.filter((link) => link.fromId === record.id || link.toId === record.id)
  const { attached: pipelineAttached, quiet } = attachmentsFor({
    nodeRecordId: record.id,
    links: pipelineLinks,
    byId,
    rowsByRecord,
    drawn,
    now,
  })

  // THE STAGE OF EVERY GATE ON THIS CANVAS, BY THE STEP'S NUMBER AND TITLE, NEVER BY ITS ID (wave 13y round 85).
  const stageOf = (upTo: string | undefined): GateStage => stageInAPipeline(upTo, reading.steps, stepNumber, (id) => byId.get(id)?.kind === BLOCK_KIND)

  // ---- what holds the whole pipeline up, and how far it may still get --------------------------
  // Worked out BEFORE the step cards, because each card has to carry its own side of the wall. A
  // single mark on the pipeline box would leave nine steps looking identical, which is the exact
  // failure a partial gate exists to prevent.
  const walls: PipelineWall[] = []
  for (const link of pipelineLinks) {
    if (link.toId !== record.id) continue
    if (link.gate.at !== 'gate') continue
    const blocker = byId.get(link.fromId)
    const gate = link.gate.gate
    // THE STEP BY ITS NUMBER AND TITLE, NEVER BY ITS ID (wave 13y round 83). `upTo` names a step by its block's id,
    // and drawn as stored that id was the wall's words. A block that is no step of this pipeline is said in words.
    // Anything else may be a stage named in words, so it is drawn as it is stored.
    const stage = stageOf(gate.upTo)
    const words = gateWordsForReader(gate, stage.words)
    const reach = gate.kind === 'partial' && gate.upTo !== undefined ? gateReach(reading.steps, gate.upTo) : null
    walls.push({
      linkId: link.linkId,
      recordId: link.fromId,
      title: blocker?.title ?? t('g7b.deletedRecord'),
      gate,
      words,
      reach,
      sentence:
        gate.kind === 'hard'
          ? t('g7b.model.nothing_in_this_pipeline_can_proceed_until')
          : reach !== null
            ? reach.sentence
            : stage.at === 'not-a-step-here'
              ? t('graph.wall.standsAtAStepNotInThisPipeline')
              : t('g7b.model.the_wall_stands_at_a_stage_named', { v1: gate.upTo ?? t('sheet.gate.unstated') }),
    })
  }
  walls.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0))
  const wallMarks = stepWallMarks(walls, reading.steps)

  // ---- is the box folded? -----------------------------------------------------------------------
  // Decided BEFORE the step cards, because a fold is the one presentation hint that changes which
  // nodes exist. It is opt-in and stored: nothing folds unless somebody asked for it, and what is
  // folded is counted on the box, listed in `omitted` and printed in full on the record page.
  const folded = foldsPipeline(input.intent, record.id)

  const done = reading.steps.filter((step) => step.state === 'done').length
  nodes.push({
    id: parentId,
    kind: 'pipeline',
    recordId: record.id,
    stepId: null,
    parentId: null,
    inside: null,
    title: record.title,
    ordinal: null,
    stateWord: null,
    state: null,
    progress: null,
    alarm: alarmOfRecord(rowsByRecord.get(record.id), now),
    facts: [
      { label: t('g7b.model.steps'), value: reading.steps.length === 0 ? t('g7b.model.none_could_be_read') : t('g7b.model.of_done_2945', { v1: done, v2: reading.steps.length }) },
      { label: t('g7b.model.modules'), value: carriedModules.length === 0 ? '—' : t('g7b.model.carry_its_steps', { v1: carriedModules.length }) },
    ],
    badges: pipelineBadges({
      steps: reading.steps,
      walls,
      attached: pipelineAttached,
      folded: folded ? reading.steps.length : 0,
      claim,
      loose: loose.size,
    }),
    attached: pipelineAttached,
    carriedBy: null,
    wall: null,
    note: reading.problem,
    words: wordsOf(record),
    levels: levelsOf(record),
    holds: [],
    // A pipeline box's own children are its steps, which are given to React Flow as its children
    // below. Its `part_of` module children are NOT drawn here — D28 says they are measured and
    // reported, and the pipeline box is not changed tonight.
    contains: [],
    presentation: unarranged(record.id),
  })

  if (!folded) {
    for (const [index, step] of reading.steps.entries()) {
      const entry = topRow(rowsByRecord.get(step.id) ?? [])
      // ---- B7, and it is one line ----------------------------------------------------------------
      //
      // A block node used to carry `attached: []`, hard-coded, because nothing could attach to a step
      // at all: `links.from_id` and `to_id` are foreign keys to `records.id`, and a step was a nested
      // object. A block is a record, so this is the SAME function every module card already used, and
      // a problem, a claim, an idea or a measured timing attached to a block draws on the block.
      const mine = links.filter((link) => link.fromId === step.id || link.toId === step.id)
      const { attached: stepAttached } = attachmentsFor({
        nodeRecordId: step.id,
        links: mine,
        byId,
        rowsByRecord,
        drawn,
        now,
      })
      nodes.push({
        id: `step:${record.id}:${step.id}`,
        kind: 'step',
        // ITS OWN RECORD ID, so opening the card opens the block. It used to be the PIPELINE's id,
        // because that was the only record a step had — which is why the card's tooltip read "open
        // the pipeline record this step is stored in".
        recordId: step.id,
        stepId: step.id,
        parentId,
        // THE PIPELINE BOX THIS STEP IS DRAWN IN. A comment on a step card stores it, because a
        // pipeline drawing can draw several pipelines and which box the reader was looking at is a
        // fact about their screen. `parentId` is the same fact as a node id; this is the record.
        inside: record.id,
        title: step.name,
        ordinal: stepNumber(index),
        stateWord: step.state,
        state: stepState(step.state),
        ...thePackageStateOn(input.packages, step.id),
        progress: progressOf(step.state),
        alarm:
          entry === undefined
            ? // ITS OWN STAMP. A step's age used to be its pipeline's `updatedAt`, so nine steps in one
              // pipeline were all exactly as old as the last edit to any of them.
              ageAlarm(progressOf(step.state), step.record.updatedAt, now)
            : alarmFor({
                safety: entry.row.safety,
                lateMs: entry.row.reason.owed?.lateMs ?? null,
                satDays: daysSince(entry.row.reason.stoppedShort?.since ?? null, now),
              }),
        facts: stepFacts(step, held.get(step.id) ?? [], claim, loose.has(step.id), byId, stageOf),
        badges: stepBadges(step, held.get(step.id) ?? [], claim, loose.has(step.id)),
        attached: stepAttached,
        // The modules that carry it, from the stored links. Two modules on one block is the case the
        // product owner asked never to let collapse into one owner.
        carriedBy: [...step.modules],
        wall: wallMarks.get(step.id) ?? null,
        note:
          step.modules.length === 0
            ? '—'
            : null,
        // ITS OWN RECORD'S WORDS. A block's title column is qualified by its pipeline, so this is
        // not the name on the card and the two are read separately rather than one from the other.
        words: wordsOf(step.record),
        levels: levelsOf(step.record),
        holds: held.get(step.id) ?? [],
        // A BLOCK CARD STOPS AT LEVEL 3, so it never reaches the level that draws children. What a
        // block holds is a sub-pipeline, and that is `holds` above, drawn as the badge the criterion
        // leaves alone. See the badge's sentence in `stepBadges`.
        contains: [],
        presentation: unarranged(step.id),
      })
    }
  }

  for (const module of carriedModules) {
    const mine = links.filter((link) => link.fromId === module.id || link.toId === module.id)
    const { attached } = attachmentsFor({ nodeRecordId: module.id, links: mine, byId, rowsByRecord, drawn, now })
    // What this module carries IN THIS PIPELINE, not across the project: the drawing is one
    // pipeline, and a count from somewhere else on it would be a number about another picture.
    const here = reading.steps.filter((step) => step.moduleIds.includes(module.id))
    const carries: CarriedSteps = {
      steps: here.length,
      pipelines: here.length === 0 ? 0 : 1,
      stopped: here.filter((step) => progressOf(step.state) === 'stopped_short').length,
    }
    const { contains, levels } = containsOn(module, { records, links: containmentLinks })
    nodes.push({
      id: `mod:${module.id}`,
      kind: 'module',
      recordId: module.id,
      stepId: null,
      parentId: null,
      inside: null,
      title: module.title,
      ordinal: null,
      stateWord: null,
      state: null,
      progress: null,
      alarm: alarmOfRecord(rowsByRecord.get(module.id), now),
      facts: moduleFacts(module, carries),
      badges: moduleBadges(module, carries, attached),
      attached,
      carriedBy: null,
      wall: null,
      note: null,
      words: wordsOf(module),
      levels,
      holds: [],
      contains,
      presentation: unarranged(module.id),
    })
  }

  // ---- edges -----------------------------------------------------------------------------------
  const edges: GraphEdge[] = []
  const stepIds = new Set(reading.steps.map((step) => step.id))
  let foldedNeeds = 0
  for (const step of reading.steps) {
    for (const need of step.needs) {
      // A line needs two boxes. With the steps folded there are none, so the count is carried on the
      // box and named in `omitted` — never dropped without being said.
      if (folded) {
        foldedNeeds++
        continue
      }
      // NULL IS NOT `hard`. A `blocks` link may say only that one block blocks another, and a
      // drawing that labelled that "hard" would put a word in the author's mouth.
      const gate: Gate | null =
        need.gate === null
          ? null
          : need.gate === 'partial' && need.upTo !== undefined
            ? { kind: 'partial', upTo: need.upTo }
            : { kind: need.gate }
      const known = stepIds.has(need.blockId)
      edges.push({
        id: `needs:${record.id}:${need.blockId}->${step.id}`,
        from: `step:${record.id}:${need.blockId}`,
        to: `step:${record.id}:${step.id}`,
        relation: 'needs',
        // A dependency is the whole reason a pipeline is drawn. It is never held back.
        drawn: 'always',
        linkType: null,
        linkId: null,
        label: t('g7b.model.waits_on'),
        gate,
        gateWords: gate === null ? t('g7b.model.blocks_it_and_nobody_has_said_how') : gateWordsForReader(gate, stageOf(gate.upTo).words),
        reading: gate === null ? { at: 'unstated' } : { at: 'gate', gate },
        inferred: false,
        // A `needs` naming an id nothing in this pipeline holds is a dependency with nothing at the
        // far end. Drawn broken rather than dropped, for the same reason a link to a deleted record
        // is: a pointer at nothing is a finding.
        broken: !known,
        family: null,
      })
    }
  }
  if (folded) {
    // ONE LINE PER MODULE, NOT PER STEP, and the word on it says how many steps it stands for. The
    // steps are inside the folded box, so a line per pair would land on nothing; joining them keeps
    // the fact that this module carries work here, and the count keeps it honest.
    for (const module of carriedModules) {
      const carries = reading.steps.filter((step) => step.moduleIds.includes(module.id)).length
      if (carries === 0) continue
      edges.push({
        id: `carries:${module.id}:${record.id}`,
        from: `mod:${module.id}`,
        to: parentId,
        relation: 'carries',
        // ONE LINE PER MODULE IS NOT A BUNDLE. A folded drawing has four of these at most and they
        // are the only thing joining a module to the box, so holding them back would leave the
        // modules floating unconnected beside a pipeline they demonstrably carry work in.
        drawn: 'always',
        linkType: null,
        linkId: null,
        label: t('g7b.model.carries_inside', { v1: countPhrase(carries, 'step') }),
        gate: null,
        gateWords: null,
        reading: null,
        inferred: false,
        broken: false,
        family: null,
      })
    }
  } else {
    for (const step of reading.steps) {
      // BY ID, from the stored `implements` link. It matched on TITLE, against a list copied onto the
      // step, so a module renamed on Tuesday drew no line on Wednesday and nothing said why.
      for (const moduleId of step.moduleIds) {
        const module = carriedModules.find((r) => r.id === moduleId)
        if (module === undefined) continue
        edges.push({
          id: `carries:${module.id}:${record.id}:${step.id}`,
          from: `mod:${module.id}`,
          to: `step:${record.id}:${step.id}`,
          relation: 'carries',
          // ONE PER (STEP, MODULE) PAIR, AND THAT IS THE BUNDLE. Ten of them on the seeded pipeline,
          // every pill reading the same word. Kept in the meaning, drawn on selection. See
          // `EdgeDrawn` for the measurement, and `carriesOf` for what a selection reveals.
          drawn: 'on-selection',
          linkType: null,
          linkId: null,
          label: t('g7b.model.carries'),
          gate: null,
          gateWords: null,
          reading: null,
          inferred: false,
          broken: false,
          family: null,
        })
      }
    }
  }
  // Stored links between the pipeline BOX and the module cards. A link touching one of this
  // pipeline's own blocks is deliberately left out: it is already on the drawing as a `needs` line
  // (a `blocks` link between two blocks) or as a `carries` line (an `implements` link from a
  // module), and drawing it a second time as a plain `link` would put two lines between one pair
  // of cards saying the same thing in two different words.
  const blockNodes = new Set(reading.steps.map((step) => step.id))
  for (const link of links) {
    if (!drawn.has(link.fromId) || !drawn.has(link.toId)) continue
    if (link.fromId === link.toId) continue
    if (blockNodes.has(link.fromId) || blockNodes.has(link.toId)) continue
    edges.push(edgeFromLink(link, (id) => (id === record.id ? parentId : `mod:${id}`), undefined, stageOf))
  }

  const omitted: Omission[] = []
  if (quiet > 0) {
    omitted.push({
      what: t('g7b.model.records_linked_to_this_pipeline_that_the'),
      count: quiet,
      why: t('g7b.model.nothing_is_owed_on_them_and_none'),
    })
  }
  if (reading.stepProblems.length > 0) {
    omitted.push({
      what: t('g7b.model.stored_steps_that_could_not_be_read'),
      count: reading.stepProblems.length,
      why: t('g7b.model.they_are_counted_in_the_the_record', { v1: reading.storedSteps }),
      saidInTheBody: true,
    })
  }
  if (folded && reading.steps.length > 0) {
    omitted.push({
      what: t('g7b.model.steps_folded_inside_the_pipeline_box'),
      count: reading.steps.length,
      why: t('g7b.model.the_arrangement_stored_for_this_drawing_asks'),
    })
  }
  // THE STEPS INSIDE A STEP, counted here because they are not on this canvas and never will be:
  // a sub-pipeline is its own drawing with its own order and its own walls, and folding its cards
  // into this one would put two orders in one box. The card says which block holds them; this says
  // how many there are altogether and where to read them.
  const insideSteps = [...held.values()].flat()
  if (insideSteps.length > 0) {
    omitted.push({
      what: t('g7b.model.steps_held_inside_a_block_as_a'),
      count: insideSteps.reduce((sum, inside) => sum + inside.steps, 0),
      why: t('g7b.model.on_this_drawing_holds_a_pipeline_of', { v1: countPhrase(insideSteps.length, 'block'), v2: insideSteps.map((inside) => inside.title).join(', ') }),
    })
  }
  if (foldedNeeds > 0) {
    omitted.push({
      what: t('g7b.model.lines_between_steps_not_drawn_because_the'),
      count: foldedNeeds,
      why: t('g7b.model.each_one_is_a_step_waiting_on'),
    })
  }
  // WHAT THE DRAWING HOLDS BACK, COUNTED EXACTLY AND NAMED. The `carries` bundle is not drawn all at
  // once, and this is the sentence that keeps that from being a silent fold. The number is the real
  // number of (step, module) pairs, so it cannot be read as one module per step.
  const heldBack = edges.filter((edge) => edge.drawn === 'on-selection')
  if (heldBack.length > 0) {
    const carriers = new Set(heldBack.map((edge) => edge.from)).size
    const carried = new Set(heldBack.map((edge) => edge.to)).size
    omitted.push({
      what: t('g7b.model.carries_lines_drawn_when_you_select_a'),
      count: heldBack.length,
      why:
        t('g7b.model.carry_here_and_drawn_together_those', { v1: countPhrase(carriers, 'module'), v2: countPhrase(carried, 'step') }) +
        t('g7b.model.near_identical_lines_crowd_out_the_dependencies', { v1: heldBack.length }) +
        t('g7b.model.for_every_step_card_says_how_many') +
        t('g7b.model.selecting_a_module_draws_the_lines_to') +
        t('g7b.model.whole_mapping_in_one_place_nothing_about'),
    })
  }

  const notes = [
    t('g7b.model.one_step_can_be_carried_by_two'),
    t('g7b.model.the_lines_between_steps_are_each_step'),
    t('g7b.model.who_carries_a_step_is_a_count'),
    t('g7b.model.a_card_carries_its_name_its_state'),
    // Same deletion as the project-structure notes above: this is the third statement on the page
    // of a fact about the layout engine, and the reader acts on none of them.
  ]

  const report: LayoutReport = { honoured: [], unhonoured: [] }
  applyIntent({
    nodes,
    scope: { at: 'pipeline', recordId },
    ...(input.intent === undefined ? {} : { intent: input.intent }),
    safety: safetyRecords(rowsByRecord),
    report,
    // The steps that exist and are not drawn, so intent aimed at one of them is refused with the
    // reason it deserves rather than with "nothing here has that id".
    folded: new Set(folded ? reading.steps.map((step) => step.id) : []),
  })

  return {
    scope: { at: 'pipeline', recordId },
    title: t('g7b.model.its_steps_what_each_waits_on_and', { v1: record.title }),
    nodes: orderNodesByIntent(nodes),
    edges,
    walls,
    omitted,
    notes,
    problem: null,
    ...directionOf(input, report),
    report,
  }
}

// ============================================================================ the plan scope

/**
 * THE PLANNING PAGE'S DRAWING: what this period is working toward.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE EACH HALF COMES FROM
 * ---------------------------------------------------------------------------------------
 *
 * WHICH RECORDS ARE ON IT is the plan's own rule and is answered by `GET /api/plan-graph`, on the
 * server, once. This file does not re-derive it: `input.plan.nodes` is the node set and
 * `input.plan.omitted` is what that rule left out, both taken as given.
 *
 * WHAT EACH CARD SAYS comes from the record, read here exactly as the other two places read it —
 * `wordsOf` for the three shortest written forms, `levelsOf` for which levels the record has and
 * what its parts say at each, `attachmentsFor` for the problems and obligations that affect it.
 * That is what puts a plan card on the same ladder as a module card, which is the whole point of
 * the fold: it is one card, configured, not two cards that have to be improved twice.
 *
 * ---------------------------------------------------------------------------------------
 * A RECORD THE PLAN NAMES THAT THIS PROJECT NO LONGER HOLDS IS COUNTED, NEVER DROPPED
 * ---------------------------------------------------------------------------------------
 *
 * The plan reply and the record list are two reads, so a record can be deleted between them. Such a
 * node is left off the drawing and counted in `omitted` with the reason, because a card silently
 * missing from a drawing about deadlines is the worst kind of quiet.
 */
function buildPlanScope(input: GraphInput, period: string): StructureGraph {
  const reply = input.plan
  const runs = DRAWING_PLACES.plan.runs
  if (reply === undefined) {
    return {
      scope: { at: 'plan', period },
      title: t('g7b.model.what_is_working_toward', { v1: period }),
      nodes: [],
      edges: [],
      walls: [],
      omitted: [],
      notes: [],
      problem:
        t('g7b.model.the_plan_for_this_period_has_not') +
        t('g7b.model.get_api_plan_graph_and_nothing_was'),
      direction: runs.direction,
      directionSource: 'default',
      directionBecause: runs.because,
      report: { honoured: [], unhonoured: [] },
    }
  }

  const nodes: GraphNode[] = reply.nodes.map((planned) => ({
    id: `plan:${planned.recordId}`,
    kind: 'plan' as const,
    recordId: planned.recordId,
    stepId: null,
    parentId: null,
    inside: null,
    // THE PLAN'S OWN NAME FOR IT, which for a block is its name inside its pipeline rather than its
    // qualified title. Three blocks of one campaign drawn with their qualified titles are three
    // cards reading identically down their visible half; the route splits them and this draws what
    // it split.
    title: planned.name,
    ordinal: null,
    stateWord: planned.state,
    // NO PanelState AND NO ALARM. Both are read from the attention answer and from the record's own
    // state vocabulary, and this drawing is served nodes rather than records. A state word it was
    // given is drawn as a word; a state it was not given is absent rather than guessed.
    state: null,
    progress: planned.state === null ? null : progressOf(planned.state),
    alarm: undefined,
    /**
     * A PLAN CARD CARRIES NO FACT LINES AND NO COMPACT FORMS, and both are empty rather than
     * absent-by-accident.
     *
     * The plan drawing's cards were cut down to a mark, a name and one word on 3 September 2026,
     * and the measurement is in tests/plan-graph-drawing.test.ts: eleven of fourteen cards ended
     * with the sentence "not in this period's plan", which the hollow square and the missing rail
     * had already said twice. Every field those lines carried — the role, the pipeline, `due`, the
     * state, the depth, the estimate and the allocation rows — is printed in full by the reading
     * layer under the drawing and by the panel a card opens. Putting them back as facts here would
     * undo that pass.
     *
     * WHAT A PLAN CARD SAYS AS IT GROWS is the record's own written forms — the summary at level 3
     * and its parts at 4, 5 and 6 — which is the ladder every other card on every other drawing
     * walks. `levels` below is what it walks.
     */
    facts: [],
    badges: [],
    // NOTHING IS ATTACHED TO A PLAN CARD, and that is what the drawing shows today rather than a
    // gap. The problems and obligations that affect a record are read from the attention answer
    // over the whole project, which this drawing is not given.
    attached: [],
    carriedBy: null,
    wall: null,
    note: null,
    // READ HERE, IN THE BROWSER, FROM THE RECORD THE ROUTE SENT. The same two readers the module
    // drawing calls, so a plan card and a module card cannot come to two answers about one record.
    words: wordsOf(planned.record),
    levels: levelsOf(planned.record),
    holds: [],
    // The plan drawing's cards are the plan's own shape — obligations and directions — and it draws
    // no nested children. D28's case is a module card on a modules drawing.
    contains: [],
    presentation: unarranged(planned.recordId),
  }))

  // WHICH WORLD EACH CARD IS IN, so a line between two intentions is drawn in the language of
  // things that have not happened. `worldOf` is the one statement of whether a thing has happened.
  const worlds = new Map(reply.nodes.map((node) => [node.recordId, worldOf(node.kind)]))
  const drawn = new Set(reply.nodes.map((node) => node.recordId))
  const edges: GraphEdge[] = reply.edges
    .filter((edge) => drawn.has(edge.from) && drawn.has(edge.to) && edge.from !== edge.to)
    .map((edge): GraphEdge => {
      const from = worlds.get(edge.from)
      const to = worlds.get(edge.to)
      return {
        id: `link:${edge.id}`,
        from: `plan:${edge.from}`,
        to: `plan:${edge.to}`,
        relation: 'link',
        drawn: 'always',
        linkType: edge.type,
        linkId: edge.id,
        label: edge.label,
        gate: edge.gate,
        // READ THE GATE ITSELF, NOT THE SERVER'S ENGLISH LABEL. `edge.gateLabel` is built once for
        // an agent's raw JSON and stays English; this drawing already has `edge.gate` and can say
        // the same fact in the reader's own language (report dbPgS8ooliII, block b-6).
        gateWords: edge.gate === null ? null : gateWordsForReader(edge.gate, stageInThePlan(edge.gate.upTo, reply.nodes).words),
        // THE ROUTE SENDS THE GATE AND ITS LABEL AND NOT THE FIVE-WAY READING. `reading` is what
        // draws the words "nobody said how much", and this drawing has never drawn them; null is
        // "this drawing was not told" rather than "the row states nothing".
        reading: null,
        inferred: false,
        broken: edge.broken,
        family: from === undefined || to === undefined ? linkFamilyOf(edge.type) : linkFamilyOf(edge.type, { from, to }),
      }
    })

  const omitted: Omission[] = reply.omitted.map((entry) => ({ what: entry.what, count: entry.count, why: entry.why }))
  if (reply.elsewhere.length > 0) {
    omitted.push({
      what: t('g7b.model.pieces_of_work_this_period_gives_time'),
      count: reply.elsewhere.reduce((total, row) => total + row.allocations.length, 0),
      why: t('g7b.model.a_plan_belongs_to_a_person_and'),
    })
  }

  const report: LayoutReport = { honoured: [], unhonoured: [] }
  applyIntent({
    nodes,
    scope: { at: 'plan', period },
    ...(input.intent === undefined ? {} : { intent: input.intent }),
    safety: new Set<string>(),
    report,
  })

  return {
    scope: { at: 'plan', period },
    title: t('g7b.model.what_is_working_toward', { v1: reply.period }),
    nodes: orderNodesByIntent(nodes),
    edges,
    walls: [],
    omitted,
    notes: [],
    problem: null,
    ...directionOf(input, report),
    report,
  }
}

/**
 * Build the whole meaning of one drawing.
 *
 * Pure and total: every scope returns a graph, and a scope that cannot resolve returns one with a
 * `problem` sentence rather than an empty canvas that looks like an empty project.
 */
export function buildStructureGraph(input: GraphInput): StructureGraph {
  return DRAWING_PLACES[input.scope.at].build(input)
}

// ============================================================================ what the canvas draws

/**
 * WHICH CARDS THE CANVAS DRAWS. A decision about the DRAWING, never about the meaning.
 *
 *   `joined` — every card a line on this canvas touches, and every card inside a box that is drawn.
 *              The default.
 *   `all`    — every card in the graph, whatever shape that makes. What the canvas used to do, and
 *              what `Show all` gives back.
 *
 * WHY `joined`, AGAINST THE THREE OPTIONS THE DECISION LISTED. design/DECISIONS-PENDING.md §11 put
 * three on the table and they mean different things:
 *
 *   (a) EVERY MODULE, ALWAYS. What shipped. It is true, and at 27 modules it is 7,924 px of drawing
 *       — six windows across, 17% of it in the window, one row tall — because 17 of the 27 are
 *       joined to nothing and a layered layout packs unconnected components into a strip. The reader
 *       gets a true picture they cannot use, and drags past 17 silent cards to reach the 5 lines
 *       that are the whole subject of a dependency drawing.
 *
 *   (c) A STATED CEILING — the first N by some rule. Every rule is a claim: by attention rank the
 *       drawing becomes "what needs you", by filing order it is arbitrary, and by link degree it is
 *       (b) with a cap nobody can justify a number for. It also cuts a real dependency chain in half
 *       the moment the chain is longer than N, which is the one thing this drawing may not do.
 *
 *   (b) WHAT A LINE TOUCHES — this. It is the only rule that is a fact about the drawing rather than
 *       a ranking somebody chose: a canvas of boxes and lines is a picture of what depends on what,
 *       and a card no line reaches states nothing there that its own row in the reading layer does
 *       not state better. `drawingFocus` in layout.ts already half-admitted it by opening the view
 *       where the lines are; this answers the question instead of moving the camera.
 *
 * IT ONLY EVER DROPS UNJOINED LEAVES. A box that holds other cards is kept whatever touches it, and
 * everything inside a kept box is kept with it — so a pipeline drawing, which is one connected chain
 * plus the modules its `carries` lines reach, loses nothing at all. The strip is a modules-drawing
 * problem and this is the smallest rule that answers it.
 *
 * LINES DRAWN ON SELECTION COUNT AS LINES. A `carries` line is held back until a card is pressed,
 * but it is real, it is in the graph, and a module that is only there because it carries a step must
 * still be on the canvas for the press to reveal anything.
 *
 * THE WORST CASE IS NAMED RATHER THAN DISCOVERED: a workspace whose modules are real and not yet
 * linked has nothing for this rule to keep, so `empty` is true and `sentence` says in words that
 * nothing is linked yet and that every card is in the reading layer. An empty box would be the one
 * outcome worse than the strip.
 */
export const CANVAS_PROJECTIONS = ['joined', 'all'] as const
export type CanvasProjection = (typeof CANVAS_PROJECTIONS)[number]

/** One drawing's worth of projection: what the canvas draws, and exactly what it does not. */
export interface ProjectedGraph {
  /** Which rule produced it. */
  projection: CanvasProjection
  /**
   * The graph the CANVAS draws. The same object under `all`; under `joined`, the same graph with
   * nodes removed and nothing else changed. Never a node, edge or fact the complete graph lacks.
   */
  graph: StructureGraph
  /** How many nodes the complete graph holds, so a sentence about the whole can be exact. */
  total: number
  /**
   * The nodes the complete graph holds and this drawing does not, in the complete graph's own order.
   *
   * THE NODES THEMSELVES AND NOT A COUNT, because a reader who is told "17 are not drawn" has to be
   * able to get from that to the actual 17. They are named on the page and printed in full, each
   * with its links and everything attached to it, by the reading layer.
   */
  omitted: GraphNode[]
  /** The same fact as `omitted`, counted, for the list of what this drawing leaves out. Null when none. */
  omission: Omission | null
  /** What the canvas says about itself in one sentence a reader can act on. Null when it draws all. */
  sentence: string | null
  /**
   * WHY THERE IS NOTHING TO DRAW, in the whole account and in one short line. Null when the canvas
   * draws something.
   *
   * `sentence` IS the long form when this is set — the same string, assigned from it — so the
   * paragraph on the page and the reason a control gives can never come apart.
   */
  nothingToDraw: NothingToDraw | null
  /** True when the rule leaves nothing to draw AND the graph itself is not empty. */
  empty: boolean
}

/**
 * WHY A DRAWING WOULD BE EMPTY, IN TWO LENGTHS OF ONE FACT.
 *
 * The page prints the long form where the drawing would be. `Graph` refuses beside it, and a
 * refusal that repeated the long form put the same 39 words on the screen twice, 52 pixels apart,
 * one copy red, and pushed the other two buttons onto a second row — problem `f43ANgTxSkST`,
 * measured at 1440 in both themes. So a control refusing where the long form is already on the page
 * says the short one instead.
 *
 * THEY ARE NOT TWO SENTENCES KEPT IN STEP. Both are built by `whyNothingIsDrawn` below, out of the
 * same clauses, in this file, beside the rule that empties the drawing.
 */
export interface NothingToDraw {
  /** The whole account: why there is nothing to draw, and both things that would put a card there. */
  long: string
  /** The same fact for a control refusing beside the long one. Under 90 characters. */
  short: string
}

/**
 * WHAT WOULD PUT A CARD ON AN EMPTY DRAWING, WRITTEN WHERE THE RULE THAT EMPTIES IT IS WRITTEN.
 *
 * Criterion D2 of design/drawings/ACCEPTANCE.md asks an empty drawing to say why it is empty and to
 * name what would fill it. TWO THINGS WOULD FILL IT AND THEY FILL IT DIFFERENTLY, so both are said:
 *
 *   - `Show all` puts every card on the canvas with no line between any of them. It is on screen
 *     beside this sentence whenever this sentence is printed: the projection is empty exactly when
 *     every card was left out, which is exactly when `StructureView` draws that button. The
 *     sentence used to name only the link, next to a button that filled the canvas in one press —
 *     problem `igS-XA9B7ejS`, and a reader who believed the sentence stopped there.
 *   - A link between two modules, or a step in this pipeline, is what draws the LINES. That is what
 *     this drawing is for, and it is the fact `Show all` cannot give.
 *
 * IT NAMES THE BUTTON BY THE LABEL ON IT — `Show all 16` — and `StructureView` writes that label
 * from the same count. tests/a-drawing-control-is-never-silent.test.ts reads the label off the page
 * and asserts this sentence contains it, so the two cannot drift apart with nothing failing.
 */
export function whyNothingIsDrawn(at: Scope['at'], total: number): NothingToDraw {
  return DRAWING_PLACES[at].nothingToDraw(total)
}

/** The first half of every empty-drawing sentence, so the places do not each write it. */
function showAllSentence(total: number): { showAll: string; withoutLines: string } {
  const showAll = t('g7b.model.show_all', { v1: total })
  return { showAll, withoutLines: t('g7b.model.draws_without_lines', { v1: showAll, v2: total === 1 ? t('g7b.model.the_card') : t('g7b.model.the_cards') }) }
}

// ============================================================================ one drawing, three places

/**
 * WHAT IS DIFFERENT ABOUT ONE PLACE A DRAWING IS DRAWN, ALL OF IT, IN ONE TABLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The rule is one
 * graph used everywhere, where a place differs only in its default configuration and never in its
 * implementation. Criterion D10 of design/drawings/ACCEPTANCE.md.
 *
 * Before this table the difference between one drawing and another was six separate switches on
 * `scope.at`, spread across three files: which builder runs, what the drawing is keyed by, what its
 * stored arrangement is keyed by, which way it runs when nobody said, what an empty one says, and
 * which ELK options the solver gets. Adding a third place meant finding all six.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS HERE AND WHAT IS IN layout.ts, AND WHY THE SPLIT IS NOT A SECOND TABLE
 * ---------------------------------------------------------------------------------------
 *
 * This file is the MEANING of a drawing and this file's own header forbids geometry in it: no x, no
 * y, no ELK option. So *how the layout runs* — the one part of a place's configuration that is
 * geometry — is declared in `layout.ts`, in `LAYOUT_AT`, keyed by the same word as this table and
 * exhaustive over it. Adding a place to `Scope` fails to compile until both are filled in, which is
 * what makes them one declaration in two layers rather than two lists that can drift.
 */
export interface DrawingPlace {
  /** The word for this place. The same word `src/shared/targets.ts` calls the drawing. */
  at: Scope['at']
  /**
   * THE KINDS OF CARD THIS PLACE DRAWS. Exhaustive: a node of any other kind is a defect in the
   * builder, and `tests/one-drawing-three-places.test.ts` fails when one appears.
   */
  draws: readonly NodeKind[]
  /** This drawing's own key, used for a reader's per-card choices and for the layout cache. */
  key: (scope: Scope) => string
  /** The name this drawing's stored arrangement is kept under, in shared/presentation.ts's words. */
  intentKey: (scope: Scope) => string
  /** Which way it runs when nobody stored a direction, and the measurement behind that answer. */
  runs: { direction: GraphDirection; because: string }
  /**
   * WHICH LEVEL THE CARDS ON THIS DRAWING OPEN AT, when nobody has set one on the settings page.
   *
   * ---------------------------------------------------------------------------------------
   * IT IS CONFIGURATION AND NOT A CONTROL, WHICH IS CRITERION D14
   * ---------------------------------------------------------------------------------------
   *
   * There was a three-step `Detail` control over every drawing, and it went: pressing it made the
   * picture jump, and it shared its name with the tick on a
   * card. So the drawing no longer carries a control that sets what its cards say; a card is grown
   * by dragging its edge, and this is where it starts.
   *
   * THE PERSON'S OWN SETTING STILL WINS. This is handed to `useDetail` as what the drawing asks
   * for, which sits below anything a person set on the settings page and above Mole Office's own
   * default. So the row on that page is still a real control over a real reader, and the drawing
   * itself has none over it.
   *
   * ALL THREE ARE `title` TODAY, and that is a measurement rather than a coincidence: it is what
   * the three drawings opened at before this table existed, and the owner's rule of 6 September was that
   * the plan drawing must not change. The column exists because the answer belongs to the place —
   * it was hard-wired in two files, which the third verification named.
   */
  opensAt: Rung
  /** Build the whole meaning of one drawing here. Pure and total; see `buildStructureGraph`. */
  build: (input: GraphInput) => StructureGraph
  /** Why a drawing here has nothing on it, and what would put a card on it. */
  nothingToDraw: (total: number) => NothingToDraw
}

/**
 * The scope this place was handed, refused loudly when it belongs to another place.
 *
 * A place only ever works on its own drawing. Nothing in this file can call one with another's
 * scope — `placeOf` picks the entry by the same tag — so reaching this throw means a caller built
 * the pair by hand, and a builder that quietly drew the wrong thing would be far worse than a stop.
 */
function mine<A extends Scope['at']>(at: A, scope: Scope): Extract<Scope, { at: A }> {
  if (scope.at !== at) {
    throw new Error(
      `The ${at} drawing was asked to work on a ${scope.at} drawing. A place only ever works on its own.`,
    )
  }
  return scope as Extract<Scope, { at: A }>
}

export const DRAWING_PLACES: Readonly<Record<Scope['at'], DrawingPlace>> = {
  modules: {
    at: 'modules',
    draws: ['module'],
    key: () => 'modules',
    intentKey: () => STRUCTURE_SCOPE,
    runs: {
      direction: 'down',
      get because() { return t('g7b.model.nobody_stored_a_direction_for_this_drawing') +
        t('g7b.model.other_and_a_layered_layout_stacks_unconnected') +
        t('g7b.model.twelve_modules_on_the_test_workspace_came') +
        t('g7b.model.about_a_quarter_size_running_down_the') },
    },
    opensAt: 'title',
    build: (input) => buildModulesScope(input),
    nothingToDraw: (total) => {
      const { showAll, withoutLines } = showAllSentence(total)
      return {
        long:
          t('g7b.model.none_of_these_modules_is_linked_to', { v1: total }) +
          t('g7b.model.words_3044', { v1: withoutLines }) +
          t('g7b.model.a_link_of_any_type_between_two') +
          t('g7b.model.they_are_all_listed_below'),
        short: t('g7b.model.nothing_to_draw_no_two_modules_are', { v1: showAll }),
      }
    },
  },
  pipeline: {
    at: 'pipeline',
    draws: ['pipeline', 'step', 'module'],
    key: (scope) => `pipeline:${mine('pipeline', scope).recordId}`,
    intentKey: (scope) => pipelineScope(mine('pipeline', scope).recordId),
    runs: {
      direction: 'right',
      get because() { return t('g7b.model.nobody_stored_a_direction_for_this_drawing_3056') +
        t('g7b.model.reading_order_and_a_sequence_that_runs') },
    },
    opensAt: 'title',
    build: (input) => buildPipelineScope(input, mine('pipeline', input.scope).recordId),
    nothingToDraw: (total) => {
      const { withoutLines } = showAllSentence(total)
      return {
        long:
          t('g7b.model.this_pipeline_has_no_step_yet_so') +
          t('g7b.model.words_3061', { v1: withoutLines }) +
          t('g7b.model.adding_a_step_to_it_draws_a'),
        short: t('g7b.model.nothing_to_draw_this_pipeline_has_no'),
      }
    },
  },
  plan: {
    at: 'plan',
    draws: ['plan'],
    key: (scope) => `plan:${mine('plan', scope).period}`,
    intentKey: (scope) => planScope(mine('plan', scope).period),
    runs: {
      direction: 'right',
      get because() { return t('g7b.model.nobody_stored_a_direction_for_this_drawing_3070') +
        t('g7b.model.and_a_run_of_work_that_leads') },
    },
    opensAt: 'title',
    build: (input) => buildPlanScope(input, mine('plan', input.scope).period),
    /**
     * THE PLAN DRAWING HAS NO `Show all`, so neither sentence names one.
     *
     * `short` is the whole of the claim and is the words the page prints in bold where the drawing
     * would be, and the words `Graph` refuses with. One sentence in one place: they were two
     * copies of it until 5 September 2026, and a second copy is how a button and the page it is on
     * come to say slightly different things about the same absence.
     */
    nothingToDraw: (total) => ({
      long: t('g7b.model.none_of_these_records_is_linked_to', { v1: total, v2: THE_TWO_READINGS.list }),
      short: t('g7b.model.none_of_these_records_is_linked_to_3075', { v1: total }),
    }),
  },
}

/** The configuration for the place this drawing is drawn in. */
export function placeOf(scope: Scope): DrawingPlace {
  return DRAWING_PLACES[scope.at]
}

/**
 * Apply a projection to a complete graph.
 *
 * PURE, AND IT IS THE ONLY PLACE THIS RULE IS WRITTEN. The canvas draws what this returns and the
 * page prints the counts this returns; a second copy of the rule in the renderer is how the sentence
 * under a drawing comes to disagree with the drawing above it.
 *
 * NOTHING HERE IS STORED OR STORABLE. A projection is DERIVED — src/shared/presentation.ts layer 3 —
 * worked out on every draw from the graph alone and thrown away. There is no field for it in the
 * presentation-intent vocabulary and nothing in this directory writes one.
 */
export function projectForCanvas(graph: StructureGraph, projection: CanvasProjection): ProjectedGraph {
  const total = graph.nodes.length
  const whole: ProjectedGraph = {
    projection,
    graph,
    total,
    omitted: [],
    omission: null,
    sentence: null,
    nothingToDraw: null,
    empty: false,
  }
  if (projection === 'all') return whole

  // The top-level card a node is drawn inside. A step is drawn inside its pipeline box, and it is
  // the BOX that a projection can keep or drop — half a compound node is not a smaller picture.
  const parentOf = new Map(graph.nodes.map((node) => [node.id, node.parentId]))
  const topOf = (id: string): string => {
    let at = id
    // Bounded by the number of nodes: a parent chain longer than that is a cycle, which nothing here
    // can build, and a loop that trusted the data would hang the page rather than report anything.
    for (let step = 0; step <= graph.nodes.length; step++) {
      const parent = parentOf.get(at)
      if (parent === undefined || parent === null) return at
      at = parent
    }
    return at
  }

  const keep = new Set<string>()
  // A box that holds other cards is the subject of its own drawing, not one of its unjoined leaves.
  for (const node of graph.nodes) if (node.parentId !== null) keep.add(topOf(node.parentId))
  // EVERY line in the graph, including the ones held back until something is pressed. An end that
  // names no node — a `needs` pointing at an id this pipeline does not hold — adds an id nothing
  // matches, which keeps nothing and drops nothing.
  for (const edge of graph.edges) {
    keep.add(topOf(edge.from))
    keep.add(topOf(edge.to))
  }

  const nodes = graph.nodes.filter((node) => keep.has(topOf(node.id)))
  const omitted = graph.nodes.filter((node) => !keep.has(topOf(node.id)))
  // EVERY EDGE IS KEPT, and that is a consequence rather than a decision: both ends of every edge
  // are in `keep` by construction, so no line can be left pointing at a card that is not drawn.
  if (omitted.length === 0) return whole

  const drawn = nodes.length
  const empty = drawn === 0
  const cards = (n: number): string => countPhrase(n, 'card')

  /**
   * AN ARRANGEMENT ON A CARD THIS CANVAS IS NOT DRAWING, SAID OUT LOUD.
   *
   * WHAT WENT WRONG WITHOUT THIS. Store a lane, an order and an emphasis for a module that joins
   * nothing, and the drawing does not move — because this projection takes that card off the canvas
   * before the layout ever sees it. The write was accepted, the read came back with it, the model
   * applied it, and the picture was identical to the picture with nothing stored. Nothing anywhere
   * said why. src/shared/presentation.ts is explicit that a hint the drawing could not honour is
   * REPORTED and never quietly dropped, and this was the one way left to drop one quietly.
   *
   * IT IS REPORTED RATHER THAN DRAWN. Which cards a canvas draws was settled by the owner —
   * design/wave3/11-canvas-projection.md, rule (b): a card is drawn when a line on this canvas
   * touches it. Drawing a card because somebody arranged it would be this file overturning that
   * decision, so the card stays off and the drawing says so.
   *
   * `tools/review.mjs` was photographing this for a week without anybody reading it that way: its
   * presentation-intent proof arranged three modules chosen by sorted id, with no regard for whether
   * the canvas drew them, and went NOT PROVED on the runs where all three were cards no line
   * touched — eight times in ninety-five runs, which is the 9% that C(6,3)/C(12,3) predicts.
   */
  const dropped = omitted.filter((node) => node.presentation.stored.length > 0)
  const takenBack = new Set(dropped.flatMap((node) => node.presentation.applied))
  const report: LayoutReport =
    dropped.length === 0
      ? graph.report
      : {
          honoured: graph.report.honoured.filter((line) => !takenBack.has(line)),
          unhonoured: [
            ...graph.report.unhonoured,
            ...dropped.map((node) => ({
              target: node.presentation.target,
              // `all of it`, the same words `applyIntent` uses for a target this drawing has no card
              // for, and for the same reason: one entry covers one card and every hint on it. The
              // hints are NAMED IN THE SENTENCE rather than in this field, because the report counts
              // entries — "1 stored hint could not be applied" beside three hint names is a number
              // arguing with the words next to it.
              hint: t('g7b.model.all_of_it'),
              because:
                t('g7b.model.this_canvas_is_not_drawing_because_no', { v1: node.title }) +
                t('g7b.model.is_nothing_here_for_a_lane_or', { v1: node.presentation.stored.join(', ') }) +
                t('g7b.model.is_on_file_and_unchanged_the_card') +
                t('g7b.model.reading_layer_and_show_all_draws_every'),
            })),
          ],
        }

  // WHAT IS TRUE, AND NOT A DEFENCE OF THE DRAWING ENGINE. The empty sentence used to run to
  // fifty-five words and spend most of them denying charges nobody had made — "That is what is on
  // file, not a failed layout and not an empty project" — in the vocabulary of the implementation:
  // "the reading layer below", "the strip a layout makes of cards that join nothing". The fact a
  // reader needs is that none of these is linked to another, so there is nothing to draw lines
  // between, and that they are all listed below.
  // AND WHAT WOULD PUT A CARD ON IT — both of the things that would, which is what
  // `whyNothingIsDrawn` above is for and what its two lengths are for. The two scopes are drawn
  // from different things, so they get different words rather than one sentence true of neither.
  const nothingToDraw = empty ? whyNothingIsDrawn(graph.scope.at, total) : null
  const sentence = nothingToDraw !== null
    ? nothingToDraw.long
    : t('g7b.canvasOmitted', { drawn, total, n: omitted.length })

  return {
    projection,
    graph: { ...graph, nodes, report },
    total,
    omitted,
    omission: {
      // THE NOUN AGREES WITH THE COUNT. The renderer prints `{count} {what}`, so a phrase that is
      // always plural puts "1 cards" on the page — the plural defect this product has already had
      // to fix once in a server reply, and a count under a drawing is read more often than a reply.
      what: t('g7b.noun.card'),
      count: omitted.length,
      why: t('g7b.canvasUnjoined'),
    },
    sentence,
    nothingToDraw,
    empty,
  }
}

// ============================================================================ what a selection shows

/** The lines a drawing shows when nothing is selected. */
export function edgesDrawnByDefault(graph: StructureGraph): GraphEdge[] {
  return graph.edges.filter((edge) => edge.drawn === 'always')
}

/**
 * Every `carries` line one node is an end of, whichever end that is.
 *
 * THE ONE FUNCTION FOR BOTH DIRECTIONS, and that is the whole point. The mapping is many-to-many
 * BOTH WAYS: selecting a module has to light every step it carries, and selecting a step has to
 * light every module carrying it. Two functions, one per direction, is how a drawing eventually
 * comes to imply one module per step — which is the assumption this product bans by name. Matching
 * on "is this node either end of the line" cannot express that assumption at all.
 *
 * A node nothing carries and a node that carries nothing both come back empty, and that is a real
 * answer rather than a gap: the card already says which of the two it is, in words.
 */
export function carriesOf(graph: StructureGraph, nodeId: string): GraphEdge[] {
  return graph.edges.filter((edge) => edge.relation === 'carries' && (edge.from === nodeId || edge.to === nodeId))
}

/** What one selection lights up: the lines revealed, and the nodes at the far ends of them. */
export interface Lit {
  /** Edge ids that are drawn because of the selection and would not be otherwise. */
  edges: Set<string>
  /** Node ids the selection reaches through those lines, INCLUDING the selected nodes themselves. */
  nodes: Set<string>
}

/**
 * The lines and nodes one or more selected nodes light up.
 *
 * REVEALS ONLY WHAT IS HELD BACK, and highlights the far ends of it. A line already drawn is not
 * "revealed" by selecting it — it was on screen all along — so selecting a step does not silently
 * restate its dependencies as something new. What a reader gets is exactly the answer they cannot
 * otherwise see at a glance: who carries this, or what does this carry.
 */
export function litBySelection(graph: StructureGraph, selected: ReadonlySet<string>): Lit {
  const edges = new Set<string>()
  const nodes = new Set<string>(selected)
  if (selected.size === 0) return { edges, nodes }
  for (const edge of graph.edges) {
    if (edge.drawn !== 'on-selection') continue
    const mine = selected.has(edge.from) || selected.has(edge.to)
    if (!mine) continue
    edges.add(edge.id)
    nodes.add(edge.from)
    nodes.add(edge.to)
  }
  return { edges, nodes }
}

// ============================================================================ reading order

/**
 * The nodes in a reading order, for the composition that is a list rather than a canvas.
 *
 * A LAYERED ORDER, NOT THE STORED ORDER. Steps are sorted so that everything a step waits on comes
 * before it — the same fact ELK uses to put a node in a layer — and ties keep the order the record
 * stores them in, which is the order the work happens in. A cycle cannot be ordered and is reported
 * rather than silently broken: the remaining nodes come out in stored order with `cyclic` naming
 * them, because a pipeline that waits on itself is a real finding.
 */
export function readingOrder(graph: StructureGraph): { order: GraphNode[]; cyclic: string[] } {
  const nodes = graph.nodes
  const index = new Map(nodes.map((node, i) => [node.id, i]))
  const incoming = new Map<string, Set<string>>()
  for (const node of nodes) incoming.set(node.id, new Set())
  for (const edge of graph.edges) {
    // Only the lines that state an ORDER may decide reading order. `carries` states no order and
    // `relates to` states no direction anybody agreed on.
    if (edge.relation !== 'needs') continue
    if (!index.has(edge.from) || !index.has(edge.to)) continue
    incoming.get(edge.to)?.add(edge.from)
  }

  const placed: GraphNode[] = []
  const done = new Set<string>()
  let moved = true
  while (moved) {
    moved = false
    for (const node of nodes) {
      if (done.has(node.id)) continue
      const waits = incoming.get(node.id) ?? new Set<string>()
      let ready = true
      for (const before of waits) if (!done.has(before)) ready = false
      if (!ready) continue
      done.add(node.id)
      placed.push(node)
      moved = true
    }
  }
  const cyclic = nodes.filter((node) => !done.has(node.id))
  return { order: [...placed, ...cyclic], cyclic: cyclic.map((node) => node.id) }
}

// ============================================================================ identity on a drawing

/**
 * WHICH CANDIDATE ANSWERED FOR THE NAME ON A CARD.
 *
 *   `label`  somebody wrote a short form at position 1 and this is their words.
 *   `head`   the part of the record's own name before the dash the person themselves put in it.
 *   `title`  the record's own name, whole.
 *
 * IT IS NOT A QUALITY RANKING AND THE CARD SAYS WHICH ONE IT DREW. `head` is a fallback and the
 * product says so on the card rather than passing a computed head off as somebody's label.
 */
export type IdentitySource = 'label' | 'head' | 'title'

/** The name one object draws, the whole name it was taken from, and why it is that one. */
export interface NodeIdentity {
  /**
   * THE CHARACTERS DRAWN. Never empty while the record's own name is not empty, which is the whole
   * of the identity invariant: a box with nothing in it is the drawing lying about what it knows.
   */
  text: string
  from: IdentitySource
  /** The record's own name, whole, always — so a popover and a title attribute have it. */
  full: string
  /** The stored path `full` was read out of. */
  field: string
  /**
   * THE OTHER NAMES ON THIS DRAWING THAT MADE A SHORTER CANDIDATE UNUSABLE, in stored order.
   *
   * Empty when nothing collided. Non-empty and `from` still short means somebody WROTE that label
   * and Mole Office does not overrule their words — the collision is reported instead.
   */
  sharedWith: readonly string[]
}

/**
 * THE THREE SEPARATORS A PERSON PUTS BETWEEN A NAME AND THE REST OF A NAME.
 *
 * A COLON IS NOT ONE OF THEM, and that is measured rather than felt. With `: ` in this list the
 * fifteen panelx modules produce the head `blocks` for the module *Mole Office — blocks: a pipeline step
 * is a record*. A colon introduces an explanation; a dash is a join a person marked.
 */
const NAME_SEPARATORS = [' — ', ' – ', ' - '] as const

/**
 * THE PART OF A NAME BEFORE THE FIRST DASH, or null when the person wrote no dash in it.
 *
 * IT NEVER LANDS MID-WORD. That is the difference between this and a clip: `Wave 5` is the head of
 * a name at the place its author marked, and `Wave 5 — Plann` is eight characters of somebody's
 * sentence. Nothing here is stored and nothing here is generated: every character comes back out of
 * the string that went in.
 */
export function headOfName(title: string): string | null {
  let cut = -1
  for (const separator of NAME_SEPARATORS) {
    const at = title.indexOf(separator)
    if (at > 0 && (cut < 0 || at < cut)) cut = at
  }
  if (cut < 0) return null
  const head = title.slice(0, cut).trim()
  return head.length === 0 ? null : head
}

/**
 * WHICH STORED FIELD A NODE'S OWN NAME IS. The same three answers `card.ts` gives, and they agree
 * because a block's drawn name is the step's name inside its pipeline and not the record's title
 * column, which is qualified by that pipeline.
 */
const NAME_OF_NODE: Readonly<Record<NodeKind, string>> = {
  module: 'title',
  pipeline: 'title',
  get step() { return t('g7b.model.the_step_s_name_inside_its_pipeline') },
  get plan() { return t('g7b.model.the_record_s_name_on_the_plan') },
}

/** An authored short form at position 1, or null where nobody wrote one. */
function authoredLabel(node: GraphNode): { text: string; field: string } | null {
  const answer = node.words.label
  if (answer.kind !== 'text') return null
  if (answer.drew !== 'label') return null
  if (answer.text.length === 0) return null
  return { text: answer.text, field: answer.field }
}

/** Every name one node could draw, shortest first. The last is always the record's own name. */
function candidatesFor(node: GraphNode): { text: string; from: IdentitySource; field: string }[] {
  const out: { text: string; from: IdentitySource; field: string }[] = []
  const written = authoredLabel(node)
  if (written !== null) out.push({ text: written.text, from: 'label', field: written.field })
  const head = headOfName(node.title)
  if (head !== null && head !== node.title) out.push({ text: head, from: 'head', field: NAME_OF_NODE[node.kind] })
  out.push({ text: node.title, from: 'title', field: NAME_OF_NODE[node.kind] })
  return out
}


/**
 * WHAT EVERY OBJECT ON ONE DRAWING IS CALLED, decided once for the whole drawing.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * Shortest candidate first, and a candidate is usable when nothing else on the drawing that carries
 * a name would draw it. `others` is how the names that are not nodes get into that comparison — a
 * module outline's tab, a lane band, the face of a presence mark. THERE IS ONE SET AND THIS IS IT:
 * comparing nodes against nodes and tabs against tabs is two comparison universes on one picture,
 * and an outline reading `Perception` would never have met a card reading `Perception`.
 *
 * ---------------------------------------------------------------------------------------
 * TWO PROPERTIES WORTH STATING, BECAUSE BOTH LOOK LIKE FAULTS
 * ---------------------------------------------------------------------------------------
 *
 * AN AUTHORED LABEL IS NEVER SKIPPED. If somebody wrote one it is drawn even where it collides, and
 * the collision comes back in `sharedWith` for the reading layer to say. Those are their words.
 *
 * ADDING ONE OBJECT CAN CHANGE WHAT ANOTHER CARD SAYS. A second block called `Wave 5 — anything`
 * demotes both from `Wave 5` to their whole names in the same draw. That is a real property of a
 * uniqueness rule rather than a defect of this one, and `sharedWith` is what lets a card say why.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT NEVER DOES
 * ---------------------------------------------------------------------------------------
 *
 * It never returns an empty string for a node whose record has a name, it never cuts a word, and it
 * never invents a character. The last candidate is the record's own name, so the walk always lands
 * on something a person wrote.
 */
export function identityFor(
  nodes: readonly GraphNode[],
  others: readonly string[] = [],
): Map<string, NodeIdentity> {
  const candidates = new Map<string, { text: string; from: IdentitySource; field: string }[]>()
  // HOW MANY OBJECTS COULD DRAW EACH STRING. A candidate offered by two objects tells neither of
  // them apart, so neither may use it — which is why this is counted across the whole drawing
  // before any object is given its answer.
  const offeredBy = new Map<string, number>()
  for (const node of nodes) {
    const mine = candidatesFor(node)
    candidates.set(node.id, mine)
    for (const one of new Set(mine.map((c) => c.text))) offeredBy.set(one, (offeredBy.get(one) ?? 0) + 1)
  }
  for (const name of others) offeredBy.set(name, (offeredBy.get(name) ?? 0) + 1)

  const out = new Map<string, NodeIdentity>()
  for (const node of nodes) {
    const mine = candidates.get(node.id) ?? candidatesFor(node)
    const whole = mine[mine.length - 1] as { text: string; from: IdentitySource; field: string }
    const shares = (text: string): string[] =>
      (offeredBy.get(text) ?? 0) > 1
        ? nodes.filter((other) => other.id !== node.id && candidates.get(other.id)?.some((c) => c.text === text) === true).map((other) => other.title)
        : []
    let chosen: { text: string; from: IdentitySource; field: string } | null = null
    for (const candidate of mine) {
      // An authored label is used whatever else is on the drawing. Everything else has to be unique.
      if (candidate.from === 'label' || (offeredBy.get(candidate.text) ?? 0) === 1) {
        chosen = candidate
        break
      }
    }
    const answer = chosen ?? whole
    out.set(node.id, {
      text: answer.text,
      from: answer.from,
      full: node.title,
      field: answer.field,
      sharedWith: shares(answer.text),
    })
  }
  return out
}
