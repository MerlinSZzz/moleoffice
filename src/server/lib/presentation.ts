// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Storing and serving PRESENTATION INTENT: how somebody asked for a structure to be drawn.
 *
 * ---------------------------------------------------------------------------------------
 * THE BOUNDARY THIS FILE IS ON THE STORAGE SIDE OF
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/presentation.ts` defines three layers and the rule between them:
 *
 *     STORE MEANING AND PRESENTATION INTENT. DERIVE RENDERING.
 *
 * That file owns the vocabulary — `direction`, `lane`, `order`, `role`, `emphasis`, `collapsed`,
 * `near` — and it owns the two checkers that refuse anything else. This file owns the table, the
 * references, and the change log rows. It does not restate the vocabulary and it must never grow a
 * second copy of it: every write here goes through `checkScopeIntent` or `checkNodeIntent`, and
 * every refusal serves the sentence those functions produced rather than a paraphrase of it. Those
 * sentences are the boundary teaching itself to whoever crossed it.
 *
 * Nothing derived is kept here. No x, no y, no size, no edge route, and no cache of any of them.
 * The boundary allows a layout cache, but it would be a SEPARATE, DROPPABLE thing — deleting it may
 * change only how long the next draw takes. Put it in this table and nobody can ever drop it again
 * without dropping what a person wrote, which is how the boundary is lost.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE ADDS ON TOP OF THE SHARED CHECKERS, AND WHY EACH IS HERE AND NOT THERE
 * ---------------------------------------------------------------------------------------
 *
 * The shared checkers run in the browser too, where there is no database, so they can only check
 * SHAPE: is this one of the six words, is this a number, is this key part of the vocabulary. Three
 * things can only be checked where the records are, and all three are references:
 *
 *   1. THE SCOPE NAMES A REAL STRUCTURE. `pipeline:<id>` where nothing has that id, or where the id
 *      is a module, is refused. A scope nobody can open is a drawer full of intent that will never
 *      appear on a screen and never be found again.
 *   2. A TARGET NAMES SOMETHING IN THAT SCOPE. A record id that no record has, or `step:<id>` where
 *      the pipeline holds no such step, is refused with the ids that do exist. The project's master
 *      pipeline is the one drawing that also holds blocks of other pipelines: the boxes of its big map.
 *   3. `near` NAMES SOMETHING TOO. It is the one hint whose value is a reference, and a `near`
 *      pointing at nothing is a hint that can never be honoured.
 *
 * All three are refused rather than stored, because this project's most damaging open defect is the
 * opposite arrangement: a reference that is accepted, stored, and can never resolve, behind a reply
 * that reports success. `reader_anchors.last_change_id` is a real foreign key for the same reason.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REPORTED RATHER THAN REFUSED, AND WHY THAT IS NOT A FALLBACK
 * ---------------------------------------------------------------------------------------
 *
 * A record that is SOFT-DELETED still exists, so intent naming it still resolves. It is accepted —
 * deleting a record in Mole Office never removes it and a restore is an ordinary thing to do — and it is
 * REPORTED, in `LayoutReport.unhonoured`, on the write that stored it and on every read afterwards.
 * The same goes for a step that has since been taken out of its pipeline. Those are hints the
 * drawing cannot honour, and shared/presentation.ts says a hint the layout could not honour must be
 * reported and never quietly dropped.
 *
 * WHAT THIS FILE CANNOT REPORT, said out loud so nobody reads its silence as approval: it cannot
 * say whether ELK honoured an `order` or a `near`. That is only known where the layout runs, which
 * is the browser. The report served here covers the references it can check and says so in words;
 * the renderer adds its own findings to the same shape.
 */

import { and, asc, desc, eq } from 'drizzle-orm'
import { BLOCK_KIND, blockIdsOf, pipelineDeclaresBlocks } from '@shared/blocks.ts'
import { db, sqlite } from '../db/client.ts'
import { presentationIntent } from '../db/schema.ts'
import { actsForThePerson, actsForThePersonWithoutTheRaise, assertThePersonIsProved, getRecord, type Actor } from './records.ts'
import { logChange } from './log-change.ts'
import { now } from '@shared/now.ts'
import { PanelError } from './panel-error.ts'
import { gatePosition } from '../../config/settings.mjs'
import { gateMet, gateMetAgainOnceTheWriteIsTakenBack } from './gate-counts.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from './who-may-act.ts'
import { theBigMapOf } from './map-dictionary.ts'
import { theMasterPipeline } from './master-pipeline.ts'
import {
  checkNodeIntent,
  checkScopeIntent,
  laneCalled,
  listedLaneNames,
  nodeLaneProblem,
  pipelineScope,
  STRUCTURE_SCOPE,
  type IntentProblem,
  type LayoutReport,
  type NodeIntent,
  type ScopeIntent,
} from '@shared/presentation.ts'

// THE WORKSPACE RIDES ON `ParsedScope`, and there is no module constant any more.
//
// It was `const WORKSPACE = 'default'` and it read as scoping code — every query below mentions
// `workspace_id`, so a reviewer skimming for "does it filter by workspace" ticked it off. What it
// actually did was file one project's authored arrangement under another: measured, PUT
// /api/presentation/structure/nodes/<a greenhouse record> answered 200 and stored a row saying
// `workspace_id = 'default'`. Worse, both projects shared one `structure` scope, so lanes written
// for Mole Office's module graph WERE the arrangement of the greenhouse graph.
//
// Putting it on the parsed scope rather than passing it beside one is deliberate: a scope names a
// structure, and the same structure name in two projects is two different structures. Carrying the
// two together means no function can be given one without the other.

/**
 * The `target` of the row carrying the scope's OWN settings, as opposed to one node's.
 *
 * In brackets on purpose. A record id is a nanoid over letters, digits, `_` and `-`, and a step
 * target is `step:<id>`; neither can contain a bracket, so this sentinel cannot collide with a real
 * target. A sentinel that could collide would mean one write silently overwriting another.
 */
export const SCOPE_TARGET = '(scope)'

/**
 * The target form this table used to have for a pipeline step, kept ONLY so a caller sending it can
 * be told what to send instead.
 *
 * Nothing writes it and nothing stores it. A pipeline block is a record, so every target is a record
 * id and there is one form. This string survives because an agent that learnt the old one gets a
 * sentence naming the record id to use rather than a 404 that reads like the block is missing —
 * and because the block's record id IS the author-written step id, so `step:hv2-04` can be answered
 * with "send hv2-04" and be exactly right.
 *
 * This is also where the SECOND declaration of `'step:'` used to be. There were two, in this file
 * and in web/components/graph/model.ts, each with a header saying the prefix should be built in one
 * place. Both are gone.
 */
export const RETIRED_STEP_PREFIX = 'step:'

/**
 * The scope's own settings, as stored: its `direction` and its `lanes`, in the one `(scope)` row.
 *
 * It is `Omit<ScopeIntent, 'nodes'>` rather than a hand-written interface so that a scope-level key
 * added to shared/presentation.ts turns into a TypeScript error here instead of being quietly
 * dropped on the way into the table — see `SCOPE_SETTINGS`, which is where that error would land.
 */
export type ScopeSettings = Omit<ScopeIntent, 'nodes'>

/**
 * Every scope setting, each once. The `Record` makes leaving one out a TypeScript error, so a new
 * scope-level key is copied into the row, compared and logged with the others or the build fails.
 */
const SCOPE_SETTING_KEYS: Record<keyof ScopeSettings, true> = { direction: true, lanes: true }
const SCOPE_SETTINGS = Object.keys(SCOPE_SETTING_KEYS) as (keyof ScopeSettings)[]

// ============================================================================ scopes

/** A scope name that has been checked: which structure it is, and what its change rows hang off. */
export type ParsedScope =
  | {
      kind: 'structure'
      /** The stored scope string, normalised. */
      scope: string
      /** Which project's structure this is. `structure` in two projects is two drawings. */
      workspaceId: string
      pipelineId: null
      /**
       * What `changes.record_id` gets for a write to the scope's own settings.
       *
       * THE WHOLE-PROJECT STRUCTURE GRAPH IS NOT A RECORD, so there is no record id to use and this
       * is the scope name itself. That is the one value this file writes into `changes.record_id`
       * that does not name a record, and it is deliberate: the alternative is not writing the row
       * at all, which would make one kind of write invisible in the log that answers "what happened
       * while I was away". Every route that stores this says so in its reply rather than leaving it
       * to be discovered. Per-node writes in this scope are not affected — they hang off the record
       * they are about, like every other change row.
       */
      anchorId: string
    }
  | { kind: 'pipeline'; scope: string; workspaceId: string; pipelineId: string; anchorId: string }

/**
 * Check a scope name and work out what it means, or refuse it.
 *
 * The vocabulary of scopes is CLOSED, the same way the vocabulary of hints is closed. An unchecked
 * scope name would let `pipeline:abc ` and `pipeline:abc` be two different drawings that look
 * identical in a list — a silent split, and the second reader would find their arrangement gone.
 */
export function parseScope(raw: string, workspaceId: string): ParsedScope {
  const scope = raw.trim()
  if (scope === STRUCTURE_SCOPE) {
    return { kind: 'structure', scope, workspaceId, pipelineId: null, anchorId: STRUCTURE_SCOPE }
  }
  if (!scope.startsWith('pipeline:')) {
    throw new PanelError(
      `"${raw}" is not a structure Mole Office draws. A scope is either "${STRUCTURE_SCOPE}", which is the ` +
        `whole-project module graph, or "${pipelineScope('<pipeline id>')}" for one pipeline's own drawing. ` +
        `GET /api/records?kind=pipeline lists the pipelines.`,
    )
  }
  const pipelineId = scope.slice('pipeline:'.length)
  if (pipelineId === '') {
    throw new PanelError(
      `"${raw}" names no pipeline. It has to be ${pipelineScope('<pipeline id>')} — the id of a pipeline ` +
        `record, which GET /api/records?kind=pipeline lists.`,
    )
  }
  const record = getRecord(pipelineId)
  if (!record) {
    throw new PanelError(
      'There is no pipeline at that address, so there is no drawing to arrange and nothing was stored.',
      404,
      `No pipeline has the id "${pipelineId}". GET /api/records?kind=pipeline lists the pipelines and their ids.`,
    )
  }
  if (record.kind !== 'pipeline') {
    throw new PanelError(
      `${pipelineId} is a ${record.kind} ("${record.title}"), not a pipeline. Only a pipeline has a drawing ` +
        `of its own; intent about a ${record.kind} inside the whole-project graph goes in the ` +
        `"${STRUCTURE_SCOPE}" scope, keyed by that record's id.`,
    )
  }
  // Rebuilt through pipelineScope rather than kept as sent, so the stored string is always the one
  // shared/presentation.ts would build. Two spellings of one scope would be two drawings.
  // The pipeline must be in the project the caller is working in. A drawing of another project's
  // pipeline is that project's drawing, and storing intent for it from here would file authored
  // arrangement across a boundary — the thing this whole pass exists to stop.
  if (record.workspaceId !== workspaceId) {
    throw new PanelError(
      `${pipelineId} is a pipeline in the workspace "${record.workspaceId}" and this request is working in ` +
        `"${workspaceId}", so there is no such scope here. Send x-mole-office-workspace: ${record.workspaceId} to ` +
        `arrange that project's pipeline.`,
      404,
    )
  }
  return { kind: 'pipeline', scope: pipelineScope(pipelineId), workspaceId, pipelineId, anchorId: pipelineId }
}

/**
 * The block ids a pipeline holds, or why they cannot be read.
 *
 * A pipeline may be a stub with no `blockIds` at all — that is a normal, supported state here, not
 * an error. But it means a block target cannot be checked against this pipeline, and accepting one
 * would store an arrangement for a node the drawing does not have. So the two cases are told apart
 * and the caller refuses with the reason in words.
 */
function pipelineBlockIds(pipelineId: string): { ids: string[]; problem: string | null } {
  const record = getRecord(pipelineId)
  if (!record) return { ids: [], problem: `the pipeline ${pipelineId} is not there any more` }
  if (!pipelineDeclaresBlocks(record)) {
    return {
      ids: [],
      problem:
        `the pipeline "${record.title}" has no blocks yet, so no block of it can be arranged. Add one with ` +
        `POST /api/records/${pipelineId}/blocks {"name":"…","state":"todo"} — GET /api/kinds/block has the shape.`,
    }
  }
  const ids = blockIdsOf(record)
  if (ids.length === 0) {
    return { ids, problem: `the pipeline "${record.title}" stores an empty list of blocks, so there is nothing to arrange` }
  }
  return { ids, problem: null }
}

/**
 * Block ids read once per parsed scope, rather than once per target.
 *
 * A pipeline drawing can have sixty blocks, and checking each one separately would read the same
 * pipeline record sixty times for one request. The cache is keyed on the PARSED SCOPE OBJECT, which
 * `parseScope` builds fresh for every request, so it lives exactly as long as the request does and
 * is collected with it. Keyed on the pipeline id instead it would outlive the request and report a
 * block as missing after somebody had just added it — a cache that is wrong is worse than none.
 */
const blockMemo = new WeakMap<ParsedScope, { ids: string[]; problem: string | null }>()

function blocksIn(scope: ParsedScope): { ids: string[]; problem: string | null } {
  if (scope.kind !== 'pipeline') return { ids: [], problem: `"${STRUCTURE_SCOPE}" has no blocks in it` }
  const found = blockMemo.get(scope)
  if (found !== undefined) return found
  const read = pipelineBlockIds(scope.pipelineId)
  blockMemo.set(scope, read)
  return read
}

/**
 * THE MASTER PIPELINE'S DRAWING HAS THE BOXES OF THE BIG MAP AS NODES TOO.
 *
 * The master's Boxes level draws the steps of the pipelines hung `part_of` on its steps, and its lanes place them,
 * so a box is a node of that drawing even though the master does not hold it. The boxes are read with the map
 * dictionary's own reading, so the drawn map, GET /api/map/dictionary and this store cannot disagree about which
 * they are. Any other pipeline's drawing, and the master's once it is no longer the marked master, has none.
 * Read once per parsed scope, for the reason `blockMemo` gives.
 */
const boxMemo = new WeakMap<ParsedScope, ReadonlySet<string>>()

function masterBoxesIn(scope: ParsedScope): ReadonlySet<string> {
  if (scope.kind !== 'pipeline') return new Set()
  const found = boxMemo.get(scope)
  if (found !== undefined) return found
  const master = theMasterPipeline(scope.workspaceId)
  const read: ReadonlySet<string> =
    master.state === 'marked' && master.id === scope.pipelineId
      ? new Set(theBigMapOf(scope.workspaceId, master.id).boxes.map((box) => box.id))
      : new Set()
  boxMemo.set(scope, read)
  return read
}

/** How many ids to print in a refusal before saying "and N more". Long enough to be useful in this workspace. */
const IDS_SHOWN = 40

function listIds(ids: readonly string[]): string {
  const shown = ids.slice(0, IDS_SHOWN)
  const tail = ids.length > shown.length ? `, and ${ids.length - shown.length} more` : ''
  return `${shown.join(', ')}${tail}`
}

/**
 * Whether a target names something this scope can draw. Null when it does, a problem when it does not.
 *
 * `where` is the path the caller sent it under, so that a problem found on `nodes.abc.near` is
 * reported at `nodes.abc.near` and not at the node.
 */
function targetProblem(scope: ParsedScope, target: string, where: string): IntentProblem | null {
  if (target === SCOPE_TARGET) {
    return {
      where,
      problem:
        `"${SCOPE_TARGET}" is reserved for the scope's own settings and is not a node. Set the whole ` +
        `structure's direction with "direction" at the top level instead.`,
    }
  }
  // THE RETIRED FORM IS REFUSED WITH THE ANSWER, NOT REWRITTEN. A block's record id is the
  // author-written step id the migration preserved, so `step:hv2-04` can be answered with "send
  // hv2-04" and be exactly right. Accepting it quietly would leave two spellings of one target in
  // the table, which is how this reference space grew four spellings in the first place.
  if (target.startsWith(RETIRED_STEP_PREFIX)) {
    const stepId = target.slice(RETIRED_STEP_PREFIX.length)
    return {
      where,
      problem:
        `"${target}" is the old way of naming a pipeline step, from before a block was a record. A block is a ` +
        `record now, so it is addressed by its record id like everything else on the drawing: send ` +
        `${JSON.stringify(stepId)}. The block migration kept every author-written step id as the block's record ` +
        `id, so that is the same block you meant.`,
    }
  }
  const record = getRecord(target)
  if (record === null) {
    return {
      where,
      problem:
        `no record has the id "${target}", so intent stored for it could never be drawn. A node is addressed by ` +
        `a record's id — a module, a pipeline, or one of a pipeline's blocks. GET /api/records lists the records ` +
        `and their ids.`,
    }
  }
  // A BLOCK IS CHECKED AGAINST THE PIPELINE WHOSE DRAWING THIS IS. It could not be before: a step
  // was addressed by an id that only its own pipeline held, so being in the right pipeline was
  // automatic. A record id is global, so arranging block A of pipeline B inside pipeline C's
  // drawing is now expressible — and it is a node that drawing does not have, so it is refused. The one
  // exception is the master's drawing, whose boxes are nodes too (`masterBoxesIn`).
  if (record.kind === BLOCK_KIND && scope.kind === 'pipeline') {
    const blocks = blocksIn(scope)
    if (blocks.problem !== null) {
      return { where, problem: `"${target}" cannot be checked, because ${blocks.problem}.` }
    }
    if (!blocks.ids.includes(target) && !masterBoxesIn(scope).has(target)) {
      return {
        where,
        problem:
          `"${record.title}" is a block of another pipeline, so this drawing has no node for it and nothing was ` +
          `stored. The blocks of this pipeline are: ${listIds(blocks.ids)}.`,
      }
    }
  }
  return null
}

// ============================================================================ checking a whole write

/**
 * Every problem with a whole scope's intent: the shared checker's, then the references.
 *
 * BOTH SETS, ALWAYS, and never the first problem only. A caller fixing one field at a time round
 * trips once per problem, and an agent doing that spends its turns on the API instead of the work.
 * The shared checker already collects rather than throws; this keeps that property across the
 * reference checks, which is why they are appended to its list instead of throwing.
 */
export function problemsWithScopeIntent(scope: ParsedScope, value: unknown): IntentProblem[] {
  const problems = [...checkScopeIntent(value)]
  // The reference checks read the value's own keys, so they only run on something already shaped
  // like a scope intent. Running them on a string would report nonsense on top of a real answer.
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return problems

  problems.push(...laneProblems(scope, (value as Record<string, unknown>)['lanes']))

  const nodes = (value as Record<string, unknown>)['nodes']
  if (nodes === null || typeof nodes !== 'object' || Array.isArray(nodes)) return problems

  for (const [target, raw] of Object.entries(nodes as Record<string, unknown>)) {
    // Only the reference checks here. `checkScopeIntent` above has already walked every node with
    // `checkNodeIntent`, and running it a second time would report each shape problem twice — which
    // is how a caller with two mistakes is told it has four.
    problems.push(...referenceProblems(scope, target, raw, `nodes.${target}`))
  }
  return problems
}

/**
 * The half of the lane check that needs the scope and the records: lanes belong to a pipeline's
 * drawing, and a lane's `head` names a record the way a node's id does.
 *
 * The shapes were checked by `checkScopeIntent`, which runs in the browser too.
 */
function laneProblems(scope: ParsedScope, lanes: unknown): IntentProblem[] {
  if (lanes === undefined) return []
  if (scope.kind === 'structure') {
    return [
      {
        where: 'lanes',
        problem:
          `the whole-project structure drawing takes no lanes. Lanes arrange one pipeline's drawing: send them ` +
          `to that pipeline's scope, ${pipelineScope('<id>')}.`,
      },
    ]
  }
  if (!Array.isArray(lanes)) return []
  const problems: IntentProblem[] = []
  lanes.forEach((lane: unknown, index) => {
    const head = lane !== null && typeof lane === 'object' ? (lane as Record<string, unknown>)['head'] : undefined
    if (typeof head !== 'string' || head.trim() === '') return
    const onHead = targetProblem(scope, head, `lanes[${index}].head`)
    if (onHead !== null) problems.push({ where: onHead.where, problem: `${laneCalled(lane, index)} has a head that cannot be drawn: ${onHead.problem}` })
  })
  return problems
}

/** The names of the lanes stored for a scope, or null when it stores none. */
function storedLaneNames(scope: ParsedScope): string[] | null {
  const row = rowsOf(scope.scope, scope.workspaceId).find((r) => r.target === SCOPE_TARGET)
  return listedLaneNames(row?.intent['lanes'])
}

/**
 * Every problem with ONE node's intent: its shape, then its references.
 *
 * Used by the route that writes a single node, where there is no surrounding scope object and so
 * nothing has checked the shape yet. `where` is the node's own address there; inside a whole-scope
 * write the reference half is called directly with `nodes.<id>`.
 *
 * A one-node write is checked against the lanes already STORED for the scope, the same check a
 * whole-scope write makes against the lanes it carries.
 */
export function problemsWithNodeIntent(
  scope: ParsedScope,
  target: string,
  value: unknown,
  where: string,
): IntentProblem[] {
  const problems = [...checkNodeIntent(value, where), ...referenceProblems(scope, target, value, where)]
  const onLane = nodeLaneProblem(value, storedLaneNames(scope), where)
  if (onLane !== null) problems.push(onLane)
  return problems
}

/**
 * The half of the check that needs the database: does this node's address name something in this
 * scope, does its `near` name something too, and does it say anything at all.
 *
 * Separate from `checkNodeIntent` because that one runs in the browser as well, where there are no
 * records to check against — and separate from `problemsWithNodeIntent` because a whole-scope write
 * has already had the shape checked and must not have it checked twice.
 */
function referenceProblems(
  scope: ParsedScope,
  target: string,
  value: unknown,
  where: string,
): IntentProblem[] {
  const problems: IntentProblem[] = []

  const onTarget = targetProblem(scope, target, where)
  if (onTarget !== null) problems.push(onTarget)

  if (value === null || typeof value !== 'object' || Array.isArray(value)) return problems
  const node = value as Record<string, unknown>

  // An empty node intent is refused rather than stored. A row that says nothing is not the same as
  // no row: it would appear in every read as a target somebody arranged, and it would keep a record
  // in a scope's list of arranged nodes for ever without saying anything about it. Absent is the
  // way to say nothing, and DELETE is how to get back to absent.
  if (Object.keys(node).length === 0) {
    problems.push({
      where,
      problem:
        'this node intent is empty, so it says nothing. Leave the node out, or DELETE its stored intent, ' +
        'rather than storing a row with nothing in it.',
    })
  }

  const near = node['near']
  // Only checked when it is a usable string; when it is not, checkNodeIntent has already said so
  // and a second complaint about the same key would be noise.
  //
  // CHECKED EXACTLY AS SENT, not trimmed. A padded id would be stored padded — nothing on a write
  // path here rewrites what a caller wrote — and would then match no node when the drawing looked
  // it up, which is a hint that silently does nothing. Refusing it names the value with its padding
  // visible inside the quotes.
  if (typeof near === 'string' && near.trim() !== '') {
    if (near === target) {
      problems.push({
        where: `${where}.near`,
        problem: 'a node cannot be kept near itself. `near` names the OTHER node it should sit beside.',
      })
    } else {
      const onNear = targetProblem(scope, near, `${where}.near`)
      if (onNear !== null) problems.push(onNear)
    }
  }
  return problems
}

// ============================================================================ reading

/** One stored row, as a reader meets it. */
export interface StoredTarget {
  target: string
  updatedAt: string
  updatedBy: string
}

/** A whole scope's stored intent, who wrote each part of it, and what could not be honoured. */
export interface StoredScopeIntent {
  scope: string
  /** Exactly what is stored, in the shape shared/presentation.ts defines. */
  intent: ScopeIntent
  /** Who wrote each target's intent and when. Oldest key first is not meaningful; sorted by target. */
  targets: StoredTarget[]
  report: LayoutReport
  /** The whole answer in one sentence, for whoever is reading rather than parsing. */
  note: string
}

function rowsOf(
  scope: string,
  workspaceId: string,
): { target: string; intent: Record<string, unknown>; updatedAt: string; updatedBy: string }[] {
  return db
    .select({
      target: presentationIntent.target,
      intent: presentationIntent.intent,
      updatedAt: presentationIntent.updatedAt,
      updatedBy: presentationIntent.updatedBy,
    })
    .from(presentationIntent)
    .where(and(eq(presentationIntent.workspaceId, workspaceId), eq(presentationIntent.scope, scope)))
    .orderBy(asc(presentationIntent.target))
    .all()
}

/** One scope that has something stored, for the index. */
export interface ScopeSummary {
  scope: string
  /** How many nodes have stored intent. The scope's own settings are not counted as a node. */
  nodes: number
  /** True when a direction has been stored for the scope. */
  hasDirection: boolean
  /** The most recent write to any part of it, and who made it. */
  updatedAt: string
  updatedBy: string
}

/**
 * Every scope that has anything stored, most recently touched first.
 *
 * It lives here rather than in the route because this is the only file that reaches the table. A
 * route that wrote its own query would be a second place that knows what a `(scope)` row means.
 */
export function listScopes(workspaceId: string): ScopeSummary[] {
  const rows = db
    .select({
      scope: presentationIntent.scope,
      target: presentationIntent.target,
      intent: presentationIntent.intent,
      updatedAt: presentationIntent.updatedAt,
      updatedBy: presentationIntent.updatedBy,
    })
    .from(presentationIntent)
    .where(eq(presentationIntent.workspaceId, workspaceId))
    .orderBy(desc(presentationIntent.updatedAt))
    .all()

  const byScope = new Map<string, ScopeSummary>()
  for (const row of rows) {
    // Rows arrive newest first, so the first one seen for a scope is that scope's most recent write.
    const summary = byScope.get(row.scope) ?? {
      scope: row.scope,
      nodes: 0,
      hasDirection: false,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    }
    // The scope row may hold lanes and no direction, so the row being there does not say a direction is.
    if (row.target === SCOPE_TARGET) summary.hasDirection = row.intent['direction'] !== undefined
    else summary.nodes += 1
    byScope.set(row.scope, summary)
  }
  return [...byScope.values()]
}

/**
 * Sort an intent object's keys, so what is stored and what is compared are byte-stable.
 *
 * Two writes that say the same thing in a different key order are the same intent, and without this
 * the second would look like a change: a change row would be written saying nothing changed, and
 * "what happened while I was away" would carry a line about work nobody did.
 */
function canonical(intent: Record<string, unknown>): Record<string, unknown> {
  return sortedKeys(intent) as Record<string, unknown>
}

/** The same value with every object's keys sorted, all the way down. A list keeps its order: a lane list's order is what it says. */
function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys)
  if (value === null || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) out[key] = sortedKeys((value as Record<string, unknown>)[key])
  return out
}

/** Whether a stored hint still names something the drawing has, and why not when it does not. */
function unhonourableBecause(scope: ParsedScope, target: string): string | null {
  const record = getRecord(target)
  if (record === null) return `no record has the id "${target}" any more`
  if (record.deletedAt !== null) {
    return (
      `the record "${record.title}" was deleted on ${record.deletedAt}, so it is not drawn. The intent is ` +
      `kept and takes effect again if the record is restored.`
    )
  }
  // A block that has left this pipeline is arranged for a node that is no longer here. It is not
  // deleted and is not missing, so neither sentence above says what happened; this one does.
  if (record.kind === BLOCK_KIND && scope.kind === 'pipeline') {
    const blocks = blocksIn(scope)
    if (blocks.problem !== null) return blocks.problem
    if (!blocks.ids.includes(target) && !masterBoxesIn(scope).has(target)) {
      return `"${record.title}" is no longer one of this pipeline's blocks, so there is nothing to arrange`
    }
  }
  return null
}

/** The hint names on one node intent, in the order shared/presentation.ts declares them. */
function hintsOf(intent: Record<string, unknown>): string[] {
  return Object.keys(intent).sort()
}

/**
 * Read a scope's stored intent, and say what the server can already tell will not be drawn.
 *
 * The `report` covers REFERENCES only — a target or a `near` that no longer names anything in this
 * scope. Whether ELK could take an `order` or put two nodes side by side is known only where the
 * layout runs, and the note says so rather than letting an empty `unhonoured` read as "everything
 * was honoured".
 */
export function readScopeIntent(scope: ParsedScope): StoredScopeIntent {
  const rows = rowsOf(scope.scope, scope.workspaceId)
  const intent: ScopeIntent = {}
  const nodes: Record<string, NodeIntent> = {}
  const honoured: string[] = []
  const unhonoured: LayoutReport['unhonoured'] = []

  for (const row of rows) {
    if (row.target === SCOPE_TARGET) {
      const settings = row.intent as ScopeSettings
      if (settings.direction !== undefined) {
        intent.direction = settings.direction
        honoured.push('direction')
      }
      if (settings.lanes !== undefined) {
        intent.lanes = settings.lanes
        honoured.push('lanes')
        // A lane's head is a reference like a node's id, and goes the same ways: deleted, or out of the pipeline.
        for (const lane of settings.lanes) {
          if (lane.head === undefined) continue
          const hint = `lanes.${lane.name}.head`
          const because = unhonourableBecause(scope, lane.head)
          if (because === null) honoured.push(hint)
          else unhonoured.push({ target: SCOPE_TARGET, hint, because: `it names ${lane.head}, and ${because}` })
        }
      }
      continue
    }
    const node = row.intent as NodeIntent
    nodes[row.target] = node

    const because = unhonourableBecause(scope, row.target)
    for (const hint of hintsOf(row.intent)) {
      if (because !== null) {
        unhonoured.push({ target: row.target, hint, because })
        continue
      }
      // `near` can be unhonourable on its own, while the node it is on is perfectly drawable.
      if (hint === 'near' && typeof node.near === 'string') {
        const nearBecause = unhonourableBecause(scope, node.near)
        if (nearBecause !== null) {
          unhonoured.push({ target: row.target, hint, because: `it names ${node.near}, and ${nearBecause}` })
          continue
        }
      }
      honoured.push(`${row.target}.${hint}`)
    }
  }
  if (Object.keys(nodes).length > 0) intent.nodes = nodes

  const targets = rows.map((r) => ({ target: r.target, updatedAt: r.updatedAt, updatedBy: r.updatedBy }))
  return { scope: scope.scope, intent, targets, report: { honoured, unhonoured }, note: describeRead(scope, intent, targets, unhonoured) }
}

function describeRead(
  scope: ParsedScope,
  intent: ScopeIntent,
  targets: readonly StoredTarget[],
  unhonoured: LayoutReport['unhonoured'],
): string {
  const scopeSettingsSaid = (): string => {
    const said = [
      ...(intent.direction === undefined ? [] : ['a direction']),
      ...(intent.lanes === undefined ? [] : [`${intent.lanes.length} lane${intent.lanes.length === 1 ? '' : 's'}`]),
    ]
    return said.length === 0 ? '.' : `, and the scope itself has ${said.join(' and ')}.`
  }
  const nodeCount = targets.filter((t) => t.target !== SCOPE_TARGET).length
  const head =
    targets.length === 0
      ? `Nothing has been stored for "${scope.scope}", so Mole Office decides the whole of this drawing.`
      : `${nodeCount} node${nodeCount === 1 ? '' : 's'} in "${scope.scope}" ${nodeCount === 1 ? 'has' : 'have'} ` +
        `stored intent` +
        scopeSettingsSaid()
  const problems =
    unhonoured.length === 0
      ? 'No stored hint names something that has gone.'
      : `${unhonoured.length} stored hint${unhonoured.length === 1 ? '' : 's'} name something that is no longer ` +
        'in this drawing; `unhonoured` says which and why. Nothing was deleted.'
  return (
    `${head} ${problems} This report covers the references only: whether the layout could take an order, ` +
    `a lane or a "near" is known where the layout runs, which is the browser, and that half is added there.`
  )
}

// ============================================================================ writing

/**
 * Run a write as one transaction: all of it lands, or none of it does.
 *
 * Every entry point below goes through this, and there are two reasons rather than one. A whole-scope
 * replace touches many rows, and half a replace is an arrangement nobody asked for. And EVERY write,
 * even a one-row one, is two statements — the row and its change log entry — so without this a
 * crash between them could leave stored intent that nothing says who wrote. The same mechanism
 * lib/sourceindex.ts uses to replace the source index.
 */
function inOneWrite<T>(work: () => T): T {
  return sqlite.transaction(work)()
}

/** What one write did. Every number is a row that really moved. */
export interface IntentWrite {
  scope: string
  /** Targets whose stored intent is different now. */
  changed: string[]
  /** Targets whose stored intent was removed. */
  removed: string[]
  /** Targets the write named that already held exactly what was sent. Nothing was written for these. */
  unchanged: string[]
  /** What the server can already tell will not be drawn. See readScopeIntent. */
  report: LayoutReport
  note: string
}

/**
 * The change rows one write of one target makes: the `changes.field`, and the before and after.
 * One place, so the log speaks one language.
 *
 * The scope row is logged ONE ROW PER SETTING THAT MOVED, by the setting's name — `.direction`,
 * `.lanes` — because each reads as a sentence in the change log, where `(scope)` would not. The
 * direction is logged as the bare word, because "down" is what a person wrote and what they would
 * search for; the lanes as their list.
 *
 * A node's intent is logged whole, as its JSON: it is one small authored statement — "this is a
 * safety module, in the bench lane" — and splitting it into one row per key would make one
 * deliberate act look like four separate ones on the day's page.
 */
function loggedChanges(
  scope: ParsedScope,
  target: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { field: string; oldValue: unknown; newValue: unknown }[] {
  if (target !== SCOPE_TARGET) return [{ field: `presentation[${scope.scope}].${target}`, oldValue: before, newValue: after }]
  return SCOPE_SETTINGS.map((key) => ({
    field: `presentation[${scope.scope}].${key}`,
    oldValue: before?.[key] ?? null,
    newValue: after?.[key] ?? null,
  })).filter((row) => JSON.stringify(sortedKeys(row.oldValue)) !== JSON.stringify(sortedKeys(row.newValue)))
}

/** Write one row and log it, or do nothing at all when the value is already exactly that. */
function putRow(
  scope: ParsedScope,
  target: string,
  intent: Record<string, unknown>,
  actor: Actor,
  outcome: { changed: string[]; unchanged: string[] },
): void {
  const next = canonical(intent)
  const existing = db
    .select({ intent: presentationIntent.intent })
    .from(presentationIntent)
    .where(
      and(
        eq(presentationIntent.workspaceId, scope.workspaceId),
        eq(presentationIntent.scope, scope.scope),
        eq(presentationIntent.target, target),
      ),
    )
    .get()

  // Nothing is written when nothing moved, the same rule a merge patch on a record follows. A write
  // that stored an identical value would still stamp `updated_at` and still append to the change
  // log, and a day's page carrying "arranged the graph" for a request that changed nothing is a lie
  // with a visible consequence.
  if (existing !== undefined && JSON.stringify(canonical(existing.intent)) === JSON.stringify(next)) {
    outcome.unchanged.push(target)
    return
  }

  // One stamp, read once. Two calls to `now()` a second apart would put a different time in the
  // insert and in the update, so the same request would file its rows under two moments.
  const at = now()
  const by = `${actor.type}:${actor.id}`
  db.insert(presentationIntent)
    .values({
      workspaceId: scope.workspaceId,
      scope: scope.scope,
      target,
      intent: next,
      updatedAt: at,
      updatedBy: by,
    })
    .onConflictDoUpdate({
      target: [presentationIntent.workspaceId, presentationIntent.scope, presentationIntent.target],
      set: { intent: next, updatedAt: at, updatedBy: by },
    })
    .run()

  for (const row of loggedChanges(scope, target, existing?.intent ?? null, next)) {
    logChange(
      anchorFor(scope, target),
      'update',
      actor,
      row.field,
      row.oldValue,
      row.newValue,
      // Read ONLY when the anchor is not a record, which is the `structure` scope's whole-graph
      // arrangement: no single record owns it, so there is nothing to derive the project from and
      // this row would otherwise be filed in no project and vanish from every scoped read of the log.
      scope.workspaceId,
    )
  }
  outcome.changed.push(target)
}

/** Remove one row and log it, or do nothing when there was nothing there. */
function dropRow(scope: ParsedScope, target: string, actor: Actor, removed: string[]): void {
  const existing = db
    .select({ intent: presentationIntent.intent })
    .from(presentationIntent)
    .where(
      and(
        eq(presentationIntent.workspaceId, scope.workspaceId),
        eq(presentationIntent.scope, scope.scope),
        eq(presentationIntent.target, target),
      ),
    )
    .get()
  if (existing === undefined) return

  db.delete(presentationIntent)
    .where(
      and(
        eq(presentationIntent.workspaceId, scope.workspaceId),
        eq(presentationIntent.scope, scope.scope),
        eq(presentationIntent.target, target),
      ),
    )
    .run()

  // Logged as an `update` whose new value is nothing, not as a `delete`. `delete` in this log means
  // a RECORD was deleted, and the record is still there — what went is one thing somebody said about
  // how it should be drawn. This is the same way a merge patch logs a key it removed.
  for (const row of loggedChanges(scope, target, existing.intent, null)) {
    logChange(anchorFor(scope, target), 'update', actor, row.field, row.oldValue, row.newValue, scope.workspaceId)
  }
  removed.push(target)
}

/**
 * The record a change row hangs off.
 *
 * A node's intent hangs off the record it is about, so "what changed about this module" answers with
 * it — and that now includes a block, which has its own history to hang it off. It used to hang off
 * the block's PIPELINE, because a step had no record of its own; that was the same "a block has no
 * history" problem that made version comparison impossible, in one more place.
 *
 * The scope's own settings hang off the pipeline — except in the whole-project structure graph,
 * which is not a record at all; see `ParsedScope.anchorId`.
 */
function anchorFor(scope: ParsedScope, target: string): string {
  if (target === SCOPE_TARGET) return scope.anchorId
  return target
}

/** The scope-level settings out of a whole scope intent, or null when it says nothing about them. */
function scopeRowOf(intent: ScopeIntent): ScopeSettings | null {
  const settings: Record<string, unknown> = {}
  for (const key of SCOPE_SETTINGS) if (intent[key] !== undefined) settings[key] = intent[key]
  return Object.keys(settings).length === 0 ? null : (settings as ScopeSettings)
}

/** The scope settings stored now, or an empty object when the scope row is absent. */
function storedSettings(scope: ParsedScope): ScopeSettings {
  const row = rowsOf(scope.scope, scope.workspaceId).find((r) => r.target === SCOPE_TARGET)
  return (row?.intent ?? {}) as ScopeSettings
}

/**
 * Put the scope row with one setting changed and every other one kept, or drop the row when
 * nothing is left in it. The direction routes go through this, so setting or forgetting a
 * direction never takes the lanes with it.
 */
function putOneSetting(
  scope: ParsedScope,
  key: keyof ScopeSettings,
  value: ScopeSettings[keyof ScopeSettings] | undefined,
  actor: Actor,
  outcome: { changed: string[]; unchanged: string[] },
  removed: string[],
): void {
  const next: Record<string, unknown> = { ...storedSettings(scope) }
  if (value === undefined) delete next[key]
  else next[key] = value
  if (Object.keys(next).length === 0) dropRow(scope, SCOPE_TARGET, actor, removed)
  else putRow(scope, SCOPE_TARGET, next, actor, outcome)
}

/**
 * Replace a whole scope's intent with what was sent.
 *
 * A REPLACE and not a merge, because the thing being written is a whole arrangement. A caller that
 * sends three nodes has said what this drawing's intent is, and a merge would leave a fourth node
 * arranged by somebody last week inside a picture the caller believes they have just defined.
 * Targets that go are reported in `removed`, so nothing disappears without being named.
 *
 * The intent must already have been checked with `problemsWithScopeIntent`. This throws if it was
 * not: a write path that could be reached without the checker is how the vocabulary quietly grows.
 */
/**
 * AN AGENT MAY NOT ARRANGE THE WHOLE-PROJECT MODULE GRAPH. Criterion P38.
 *
 * ---------------------------------------------------------------------------------------
 * THE DECISION, AND THE SENTENCE IT TURNS ON
 * ---------------------------------------------------------------------------------------
 *
 * A decision took option B, which says it in one line: *"An agent may set
 * a block's size and lane but not choose which module groupings you look at."* And the reason,
 * from the same fork: *"Changing a drawing's arrangement is reversible and visible; changing
 * which modules are drawn changes what you notice, which is not."*
 *
 * ---------------------------------------------------------------------------------------
 * WHICH DRAWING THAT IS, AND WHY THIS IS A JUDGEMENT RATHER THAN A READING
 * ---------------------------------------------------------------------------------------
 *
 * A block is a node on a pipeline's drawing, so *a block's size and lane* is a pipeline scope, and
 * their sentence leaves it open. The drawing whose nodes are modules is `structure`, the whole-project
 * module graph — so *which module groupings you look at* is that drawing's arrangement, and it is
 * refused to every agent.
 *
 * THE FORK'S TEXT AND THE OPTION'S TEXT DO NOT AGREE WITH EACH OTHER, and this is the reading that
 * satisfies both. The question asked about *"which module boundaries a PIPELINE drawing shows"*; the
 * option chosen talks about a block's lane being allowed. Both are true at once only if the line
 * falls between the two scopes, which is where it is drawn. If that is wrong, this is the function
 * to change and nothing else reads the rule.
 *
 * ---------------------------------------------------------------------------------------
 * THE OTHER HALF OF THEIR QUESTION HAS NOTHING TO GATE, AND SAYING SO IS THE HONEST ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * They also asked about *"how much that drawing asks to be read at"*. Nothing stores a reading level
 * on a drawing. `ScopeIntent` takes `direction` and `nodes` and nothing else; `NodeIntent` takes a
 * lane, an order, a size, an emphasis, a fold, a neighbour and one dragged coordinate. There is no
 * field, so there is no act, so there is nothing here to refuse. Inventing one would be building a
 * permission for a feature nobody has written.
 *
 * IT IS REGISTERED IN `GOVERNANCE_GUARDS` with a null act key. The key is for acts also refused from
 * another machine, and this one is refused by WHO is asking rather than by where they are.
 */
export function assertMayArrangeTheModuleGraph(scope: ParsedScope, actor: Actor): void {
  if (scope.kind !== 'structure') return
  // AND A STATED PERSON HAS TO HOLD THE PERSON'S KEY. Criterion P83, point 1: the header claim is
  // attribution, and the key is what makes a caller the person.
  if (actor.type === 'human') {
    assertThePersonIsProved(actor, 'Arranging the module graph')
    return
  }
  // AN AGENT HOLDING THE PERSON'S PRESS PASSES, exactly as it does at every other act declared under
  // `The person's own acts`. Criterion P59; this act is declared there in roles.json. The raise is asked only while
  // the gate below is at block, so at off nothing is written under the grant.
  const position = gatePosition('who-arranges-the-module-graph')
  if (position === 'block' ? actsForThePerson(actor) : actsForThePersonWithoutTheRaise(actor)) return
  if (actor.type !== 'agent') return
  // AT OFF, AN AGENT ITS OWN KEY PROVES ARRANGES IT TOO, and the change row names it (wave 13r round U). Any other agent
  // is refused in the off words. At block that agent is counted as stopped.
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-arranges-the-module-graph', position!) !== 'block') return
  if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-arranges-the-module-graph', 'arrange the whole-project drawing of modules')
  const refusal = new PanelError(
    'Which module groupings the whole-project drawing shows is the owner\'s to arrange, and this asked to change ' +
      'them. Nothing was written. An agent may set a block\'s size ' +
      'and lane on a pipeline\'s own drawing, and may not choose which module groupings the owner looks at. The reason: ' +
      'arranging a drawing is reversible and visible, and changing which modules are drawn changes what the owner ' +
      'notices, which is not. A pipeline\'s drawing is open — send the same request with a `pipeline:<id>` scope. ' +
      'If you think a grouping is wrong, file a proposal saying so.',
    403,
  )
  if (!keyed) throw refusal
  throw gateMetAgainOnceTheWriteIsTakenBack(refusal, () => gateMet('who-arranges-the-module-graph', 'block'))
}

export function writeScopeIntent(scope: ParsedScope, intent: ScopeIntent, actor: Actor): IntentWrite {
  assertMayArrangeTheModuleGraph(scope, actor)
  const problems = problemsWithScopeIntent(scope, intent)
  if (problems.length > 0) throw new PanelError(refusal(problems))

  return inOneWrite(() => {
    const outcome = { changed: [] as string[], unchanged: [] as string[] }
    const removed: string[] = []

    const settings = scopeRowOf(intent)
    if (settings === null) dropRow(scope, SCOPE_TARGET, actor, removed)
    else putRow(scope, SCOPE_TARGET, settings as Record<string, unknown>, actor, outcome)

    const nodes = intent.nodes ?? {}
    for (const [target, node] of Object.entries(nodes)) {
      putRow(scope, target, node as Record<string, unknown>, actor, outcome)
    }

    // Read AFTER the writes above, so a target this arrangement just wrote is never a candidate for
    // removal. Everything still stored that the new arrangement does not name is intent the caller
    // has replaced, and it goes — named in `removed`, never silently.
    for (const row of rowsOf(scope.scope, scope.workspaceId)) {
      if (row.target === SCOPE_TARGET) continue
      if (row.target in nodes) continue
      dropRow(scope, row.target, actor, removed)
    }

    return finish(scope, outcome, removed)
  })
}

/** Store one node's intent, leaving every other node in the scope alone. */
export function writeNodeIntent(
  scope: ParsedScope,
  target: string,
  node: NodeIntent,
  actor: Actor,
): IntentWrite {
  assertMayArrangeTheModuleGraph(scope, actor)
  const problems = problemsWithNodeIntent(scope, target, node, target)
  if (problems.length > 0) throw new PanelError(refusal(problems))

  return inOneWrite(() => {
    const outcome = { changed: [] as string[], unchanged: [] as string[] }
    putRow(scope, target, node as Record<string, unknown>, actor, outcome)
    return finish(scope, outcome, [])
  })
}

/**
 * Store the scope's direction, leaving every node and the lanes alone.
 *
 * Lanes are refused here. They are written with the whole arrangement, where the nodes that name
 * them are checked in the same request; written here, they could leave a stored node in a lane the
 * new list does not have.
 */
export function writeScopeSettings(scope: ParsedScope, settings: ScopeSettings, actor: Actor): IntentWrite {
  assertMayArrangeTheModuleGraph(scope, actor)
  const problems = problemsWithScopeIntent(scope, settings)
  if (settings.lanes !== undefined) {
    problems.push({
      where: 'lanes',
      problem:
        `this route sets the direction only. Send the lanes with the whole arrangement to PUT ` +
        `/api/presentation/${scope.scope}, which REPLACES it, so the nodes that name the lanes are checked with them.`,
    })
  }
  if (problems.length > 0) throw new PanelError(refusal(problems))

  return inOneWrite(() => {
    const outcome = { changed: [] as string[], unchanged: [] as string[] }
    const removed: string[] = []
    putOneSetting(scope, 'direction', settings.direction, actor, outcome, removed)
    return finish(scope, outcome, removed)
  })
}

/**
 * Remove one target's stored intent. `(scope)` forgets the scope's direction and keeps its lanes,
 * because the one route that sends it is DELETE …/direction.
 */
export function clearTarget(scope: ParsedScope, target: string, actor: Actor): IntentWrite {
  assertMayArrangeTheModuleGraph(scope, actor)
  return inOneWrite(() => {
    const outcome = { changed: [] as string[], unchanged: [] as string[] }
    const removed: string[] = []
    if (target === SCOPE_TARGET) putOneSetting(scope, 'direction', undefined, actor, outcome, removed)
    else dropRow(scope, target, actor, removed)
    return finish(scope, outcome, removed)
  })
}

/** Remove everything stored for a scope, so Mole Office decides the whole drawing again. */
/**
 * FORGET EVERYTHING ARRANGED FOR ONE DRAWING, IN ONE CHANGE ROW — CRITERION D36.
 *
 * A reset button: one press that returns
 * the drawing to the configuration it started at.
 *
 * ONE ROW AND NOT ONE PER CARD, and that is the criterion's own wording. Clearing the pipeline this was measured on
 * wrote five rows into the change log, one for each card they had ever moved, and a reader looking at
 * what happened to that pipeline saw five separate events for one press of one button. The row is
 * hung off the drawing itself — the pipeline record, or the structure scope where there is no record
 * — and its old value is everything that went, keyed by target, so nothing is lost by writing less.
 *
 * IT IS LOGGED AS AN `update` WHOSE NEW VALUE IS NOTHING, for the reason `dropRow` gives: `delete`
 * in this log means a RECORD was deleted, and every record here is still there.
 */
export function clearScope(scope: ParsedScope, actor: Actor): IntentWrite {
  assertMayArrangeTheModuleGraph(scope, actor)
  return inOneWrite(() => {
    const rows = rowsOf(scope.scope, scope.workspaceId)
    const removed = rows.map((row) => row.target)
    if (rows.length === 0) return finish(scope, { changed: [], unchanged: [] }, [])
    const was: Record<string, unknown> = {}
    for (const row of rows) was[row.target] = row.intent
    db.delete(presentationIntent)
      .where(and(eq(presentationIntent.workspaceId, scope.workspaceId), eq(presentationIntent.scope, scope.scope)))
      .run()
    logChange(
      scope.anchorId,
      'update',
      actor,
      `presentation[${scope.scope}]`,
      JSON.stringify(was),
      null,
      scope.workspaceId,
    )
    return finish(scope, { changed: [], unchanged: [] }, removed)
  })
}

/** Build the reply, with the report read back from what is now stored rather than from what was sent. */
function finish(
  scope: ParsedScope,
  outcome: { changed: string[]; unchanged: string[] },
  removed: string[],
): IntentWrite {
  const stored = readScopeIntent(scope)
  return {
    scope: scope.scope,
    changed: outcome.changed,
    removed,
    unchanged: outcome.unchanged,
    report: stored.report,
    note: describeWrite(outcome, removed, stored.report),
  }
}

function describeWrite(
  outcome: { changed: string[]; unchanged: string[] },
  removed: string[],
  report: LayoutReport,
): string {
  const parts: string[] = []
  if (outcome.changed.length > 0) parts.push(`${outcome.changed.length} stored: ${outcome.changed.join(', ')}`)
  if (removed.length > 0) parts.push(`${removed.length} removed: ${removed.join(', ')}`)
  if (outcome.unchanged.length > 0) {
    parts.push(`${outcome.unchanged.length} already held exactly that, so nothing was written for them: ${outcome.unchanged.join(', ')}`)
  }
  const head = parts.length === 0 ? 'Nothing was stored, removed or changed.' : `${parts.join('. ')}.`
  const tail =
    report.unhonoured.length === 0
      ? ''
      : ` ${report.unhonoured.length} stored hint${report.unhonoured.length === 1 ? '' : 's'} name something ` +
        `that is not in this drawing any more; \`report.unhonoured\` says which and why, and nothing was dropped.`
  return head + tail
}

// ============================================================================ refusals

/**
 * Every problem in one sentence, in the checker's own words.
 *
 * THE MESSAGES ARE NOT REWRITTEN HERE. shared/presentation.ts explains, at the point of refusal,
 * why a coordinate is not stored and why an emphasis is a meaning rather than a colour. Those
 * paragraphs are the boundary teaching itself to whoever crossed it, and a caller that got
 * "invalid field" instead would go and read the source, or guess again.
 *
 * EVERY problem, never the first. A caller fixing one field per round trip is how an agent spends
 * five turns on a request it could have fixed in one.
 */
export function refusal(problems: readonly IntentProblem[]): string {
  const lines = problems.map((p) => `${p.where}: ${p.problem}`)
  return (
    `This is not presentation intent Mole Office can store — ${problems.length} problem${problems.length === 1 ? '' : 's'}, ` +
    `and nothing was written. ${lines.join(' | ')}`
  )
}
