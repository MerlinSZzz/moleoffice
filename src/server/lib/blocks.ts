// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The five writes that change a pipeline's blocks: add, edit, remove, reorder, restore.
 *
 * ---------------------------------------------------------------------------------------
 * FOUR OF THE FIVE HAVE A ROUTE. `restoreBlock` DOES NOT, AND HERE IS WHY.
 * ---------------------------------------------------------------------------------------
 *
 * The block routes live in `src/server/api/records.ts`, which the pass that wrote `restoreBlock`
 * did not own, so it stops at this file. Until somebody adds the route, restoring a block is
 * reachable from the seed, the tests and any code in this process, and NOT over HTTP — and
 * `POST /api/records/<block id>/restore`, which an agent will reach for instead, undeletes the row
 * and leaves it in no pipeline's order. What is needed is one handler beside the other four:
 *
 *   app.post('/records/:id/blocks/:blockId/restore', …)  ->  restoreBlock(id, blockId, body, actor)
 *
 * taking an optional `{"at": <number>}` and answering with the block, the pipeline and `at`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE ARE THEIR OWN FUNCTIONS AND NOT `PATCH /api/records/<pipeline>`
 * ---------------------------------------------------------------------------------------
 *
 * Adding a step used to be a read-modify-write of the whole `data.steps` array. That cost three
 * things, all of them measured rather than supposed:
 *
 *   - Two callers adding a step at the same time: the second read the array before the first wrote
 *     it, so the first step vanished with no error anywhere.
 *   - One change row per edit, holding the WHOLE array twice. "What happened to this step" could
 *     not be answered from the log at all, which is what made version comparison impossible.
 *   - The caller had to build the array, so it had to get every other step right to change one.
 *
 * Each function here does the whole of one intention in ONE transaction: the block record and the
 * pipeline's order move together, or neither moves. That is the same guarantee `patchChecklistItem`
 * already gives a module's checklist, for the same reason.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------------------
 *
 * The modules that carry a block, and what it waits on, are LINKS. They are created and removed
 * with POST and DELETE /api/links like every other relationship in the product, and there is no
 * block-shaped wrapper around them, because a wrapper is how the two representations of one fact
 * came into being the first time.
 */

import {
  BLOCK_KIND,
  blockIdsOf,
  readPipelineBlocks,
  type BlockLinkRow,
  type PipelineBlockReading,
} from '@shared/blocks.ts'
import type { ItemState, PanelRecord, RecordOrigin } from '@shared/types.ts'
import { ITEM_STATES } from '@shared/types.ts'
import { and, eq, sql } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { links, records } from '../db/schema.ts'
import { readLinkGate } from './records/stored-link-gates.ts'
import {
  allGatedLinks,
  blocksLeftOutWords,
  createRecordWithReport,
  deleteRecord,
  getRecord,
  listChanges,
  patchRecord,
  nothingWrittenSentence,
  pipelineHolding,
  pipelinesHolding,
  restoreRecord,
  WHY_A_BLOCK_NAME_MAY_NOT_REPEAT,
  type Actor,
} from './records.ts'
import { NO_SUCH_RECORD } from './no-record-has-this-id.ts'
import { PanelError } from './panel-error.ts'

/** The pipeline named, checked. Throws with the reason rather than returning null. */
function pipelineOr404(pipelineId: string): PanelRecord {
  const record = getRecord(pipelineId)
  if (record === null) throw new PanelError(NO_SUCH_RECORD, 404, `No record with id ${pipelineId}.`)
  if (record.kind !== 'pipeline') {
    throw new PanelError(
      `${pipelineId} is a ${record.kind} called "${record.title}", not a pipeline. Only a pipeline has blocks.`,
      404,
    )
  }
  if (record.deletedAt !== null) {
    throw new PanelError(
      `The pipeline "${record.title}" was deleted on ${record.deletedAt}. Restore it with ` +
        `POST /api/records/${pipelineId}/restore before changing its blocks.`,
      404,
    )
  }
  return record
}

/** The block named, checked against the pipeline that is supposed to hold it. */
function blockOf(pipeline: PanelRecord, blockId: string): PanelRecord {
  const record = getRecord(blockId)
  if (record === null) throw new PanelError(NO_SUCH_RECORD, 404, `No record with id ${blockId}.`)
  if (record.kind !== BLOCK_KIND) {
    throw new PanelError(`${blockId} is a ${record.kind} called "${record.title}", not a block.`, 404)
  }
  if (!blockIdsOf(pipeline).includes(blockId)) {
    // EVERY PIPELINE THAT DOES LIST IT, because several may since 6 September 2026. Naming one of
    // them would read as "it is that one's, not yours" and leave the writer no way to see the rest.
    const holders = pipelinesHolding(blockId)
    throw new PanelError(
      holders.length === 0
        ? `"${record.title}" is not one of "${pipeline.title}"'s blocks, and no pipeline lists it at all.`
        : `"${record.title}" is not one of "${pipeline.title}"'s blocks. ` +
          `${holders.length === 1 ? 'The pipeline that lists it is' : `The ${String(holders.length)} pipelines that list it are`} ` +
          `${holders.map((one) => `"${one.title}"`).join(', ')}.`,
      404,
    )
  }
  return record
}

const STATE_NAMES: readonly string[] = ITEM_STATES

/**
 * Write the pipeline's new order. Never called outside a transaction.
 *
 * THROUGH `patchRecord`, NOT THROUGH THE QUERY BUILDER. lib/records.ts is the one door to the
 * records table — a write anywhere else is outside the human-only guard and outside the change log,
 * which is the same defect twice, and tests/guard-human-only.test.ts scans the source for it. The
 * merge patch writes one change row at `data.blockIds`, which is exactly the right grain: what
 * changed about the ORDER is on the pipeline, and what changed about each block is on that block.
 *
 * `deleting` names blocks deliberately removed by this transaction. Each is either deleted in the
 * transaction or remains listed by another live pipeline. Only `removeBlock` passes it, so rule 4
 * of `checkBlockIds` can distinguish this removal from an accidentally incomplete order.
 */
function writeOrder(
  pipeline: PanelRecord,
  ids: readonly string[],
  actor: Actor,
  deleting: readonly string[] = [],
): void {
  patchRecord(pipeline.id, { dataPatch: { blockIds: [...ids] } }, actor, undefined, deleting)
}

/**
 * Refuse a name another LIVE BLOCK OF THIS PIPELINE already answers to, before anything is written.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS THE ONE PLACE A REPEATED TITLE IS STILL REFUSED, AND ONLY BECAUSE OF WHAT A BLOCK IS
 * ---------------------------------------------------------------------------------------
 *
 * A record's id is its identity and its title is only how it is shown, and titles may
 * repeat: `createRecord` no longer refuses one. A block is the exception because a pipeline is
 * read as an ordered list of its blocks' names: two live blocks of ONE pipeline called the same
 * thing are two rows a reader cannot tell apart on the page they both appear on.
 * `WHY_A_BLOCK_NAME_MAY_NOT_REPEAT` in lib/records/record-by-title.ts holds that sentence.
 *
 * IT ASKS ABOUT THIS PIPELINE AND NOT ABOUT THE PROJECT, and that is the change of 6 September
 * 2026. It used to refuse a title ANY live record in the workspace held, which was affordable only
 * while the server composed a block's title out of its pipeline's — every name was unique by
 * construction. A decision reversed that. A block's title is its own name.
 * Asking the old question of the new titles would refuse a second pipeline a step called
 * `Calibrate`, which is two steps of two different pieces of work. `duplicateTitlesInPipeline` in
 * shared/blocks.ts is the one statement of the rule and this is the write path asking it.
 *
 * DELETED ROWS DO NOT COUNT, and that is the change of 17 August 2026. They used to: a soft-deleted
 * record kept its title and nothing else could take it, so deleting a block and adding it again
 * under the same name was refused for ever. That is the owner's own defect — they deleted something,
 * wrote it again, and Mole Office said it already existed.
 */
function refuseTakenName(
  name: string,
  pipeline: PanelRecord,
  /** The block that is allowed to hold this name already, because it is the one being changed.
   * `null` when there is no such record yet, which is what filing a NEW block means. */
  keepingId: string | null,
  howToFix: string,
): void {
  const clashes = blockIdsOf(pipeline)
    .filter((id) => id !== keepingId)
    .map((id) => db.select().from(records).where(eq(records.id, id)).get())
    .filter((row): row is NonNullable<typeof row> => row !== undefined && row.deletedAt === null)
    .filter((row) => row.kind === BLOCK_KIND && row.title === name)
  if (clashes.length === 0) return
  const each = clashes.map((found) => found.id).join('; ')
  throw new PanelError(
    `"${pipeline.title}" already has ${clashes.length === 1 ? 'a live block' : `${clashes.length} live blocks`} ` +
      `called "${name}" (${each}). ${WHY_A_BLOCK_NAME_MAY_NOT_REPEAT}. Nothing has been changed. ${howToFix}`,
  )
}

// ============================================================================ add

export interface AddBlockInput {
  /** The block's own name. The server builds the qualified title from it. */
  name: string
  state: ItemState
  /**
   * What the block is, in a sentence or two: the record's own summary, as on every other record. Taken here since wave
   * 13j round 51, because this is the only door a block is filed through and it refused the key, so every block
   * planned through it took a second write to get its summary (report FRsTZ627KvQQ).
   */
  summary?: string
  measured?: string
  consequence?: unknown
  paused?: unknown
  source?: string
  extra?: Record<string, unknown>
  /**
   * Where in the order it goes, 0-based. Left out means the end, which is the ordinary case.
   *
   * An index and not a "after this block id", because the order is an array and an index is what an
   * array position is. An index past the end is refused rather than clamped: clamping would put the
   * block somewhere the caller did not ask for and answer 201.
   */
  at?: number
  /**
   * How this row got here. Default `authored`, like every other record.
   *
   * A BLOCK IS A RECORD AND CAME THROUGH WHATEVER WROTE IT. Sixty-one of the 290 fixture rows in
   * the measured corpus are blocks, and they are fixture for the same reason their pipelines are:
   * the fixture script wrote them. Not reachable from any route — the routes do not send it — so a
   * block filed over HTTP is authored, which is what filing one over HTTP is.
   */
  origin?: RecordOrigin
}

/**
 * File a new block into a pipeline: mint the record, then append its id to the order.
 *
 * ONE TRANSACTION. A block record that exists but is in no pipeline's order is invisible on every
 * page and has a title qualified by a pipeline that does not list it — the worst of both halves.
 */
export function addBlock(
  pipelineId: string,
  input: AddBlockInput,
  actor: Actor,
): { block: PanelRecord; pipeline: PanelRecord; at: number } {
  const pipeline = pipelineOr404(pipelineId)
  const name = input.name.trim()
  if (name === '') {
    throw new PanelError('A block needs a name. It becomes the second half of the block\'s title, which is how you link to it.')
  }
  if (!STATE_NAMES.includes(input.state)) {
    throw new PanelError(`state must be one of ${STATE_NAMES.join(', ')}, and it is ${JSON.stringify(input.state)}.`)
  }
  const ids = blockIdsOf(pipeline)
  const at = input.at ?? ids.length
  if (!Number.isInteger(at) || at < 0 || at > ids.length) {
    throw new PanelError(
      `at must be a whole number from 0 to ${ids.length} — this pipeline has ${ids.length} block${ids.length === 1 ? '' : 's'}, ` +
        `so ${ids.length} means "at the end". It is ${JSON.stringify(input.at)}. A position past the end is refused ` +
        `rather than moved to the end, because a block quietly filed somewhere else looks like a 201 that worked.`,
    )
  }

  // THE TITLE IS THE NAME, by a decision. A block's title is its own name, and
  // several pipelines may list one block. Nothing is composed and nothing is prefixed.
  const title = name
  // ASKED HERE SINCE 17 AUGUST 2026, and it used to be asked for this path by `createRecord`, which
  // refused any repeated title. That refusal is gone — titles may now repeat —
  // so a block would have been the one caller that lost its check by inheriting somebody else's.
  // Without this, `addBlock` filed a second "Close and hold" into one pipeline and answered 201, and
  // that pipeline read as two identical names in one ordered list.
  refuseTakenName(
    title,
    pipeline,
    null,
    `Give this block a different name, or rename the block of this pipeline that already holds it ` +
      `with PATCH /api/records/${pipeline.id}/blocks/<block id> {"name":"…"}.`,
  )

  const data: Record<string, unknown> = { state: input.state }
  if (input.measured !== undefined) data['measured'] = input.measured
  if (input.consequence !== undefined) data['consequence'] = input.consequence
  if (input.paused !== undefined) data['paused'] = input.paused
  if (input.source !== undefined) data['source'] = input.source
  if (input.extra !== undefined) data['extra'] = input.extra

  return sqlite.transaction(() => {
    const created = createRecordWithReport({
      kind: BLOCK_KIND,
      title,
      ...(input.summary === undefined ? {} : { summary: input.summary }),
      data,
      workspaceId: pipeline.workspaceId,
      actor,
      insidePipeline: true,
      // Left off entirely when the caller said nothing, so `createRecordWithReport` applies its own
      // default. Passing `undefined` would work today and would be a promise about how that
      // function reads a missing key.
      ...(input.origin === undefined ? {} : { origin: input.origin }),
    })
    const next = [...ids.slice(0, at), created.record.id, ...ids.slice(at)]
    writeOrder(pipeline, next, actor)
    const after = getRecord(pipelineId)
    if (after === null) throw new PanelError('The pipeline vanished while its block was being filed', 500)
    return { block: created.record, pipeline: after, at }
  })()
}

// ============================================================================ edit

export interface PatchBlockInput {
  /** The block's own name, unqualified. The server rebuilds the title from it. */
  name?: string
  state?: ItemState
  /** Null clears what was measured. */
  measured?: string | null
  consequence?: unknown
  paused?: unknown
}

/**
 * Change one block. `name` goes to the title, everything else goes into `data`.
 *
 * It goes through `patchRecord` rather than writing the row itself, so a block gets exactly the
 * change rows, the validation and the completeness report every other record gets. The only thing
 * this adds is knowing how to turn a bare name into the qualified title.
 */
export function patchBlock(pipelineId: string, blockId: string, input: PatchBlockInput, actor: Actor) {
  const pipeline = pipelineOr404(pipelineId)
  const block = blockOf(pipeline, blockId)

  const dataPatch: Record<string, unknown> = {}
  if (input.state !== undefined) {
    if (!STATE_NAMES.includes(input.state)) {
      throw new PanelError(`state must be one of ${STATE_NAMES.join(', ')}, and it is ${JSON.stringify(input.state)}.`)
    }
    dataPatch['state'] = input.state
  }
  // Null deletes the key, which is `mergeData`'s rule and is what "nothing has been measured any
  // more" has to mean. An empty string would store a blank that reads as a gap.
  if (input.measured !== undefined) dataPatch['measured'] = input.measured
  if (input.consequence !== undefined) dataPatch['consequence'] = input.consequence
  if (input.paused !== undefined) dataPatch['paused'] = input.paused

  const patch: { title?: string; dataPatch?: Record<string, unknown> } = {}
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name === '') throw new PanelError('A block needs a name. Send the new name, or leave `name` out to keep the one it has.')
    patch.title = name
    // A name a sibling already uses would leave the pipeline reading as two identical names in one
    // ordered list. See refuseTakenName.
    refuseTakenName(
      patch.title,
      pipeline,
      blockId,
      `Pick another name for this block, or rename the block of this pipeline that holds "${name}" first.`,
    )
  }
  if (Object.keys(dataPatch).length > 0) patch.dataPatch = dataPatch
  if (Object.keys(patch).length === 0) {
    throw new PanelError(
      `Nothing to change. Send name, state, measured, consequence or paused. The block is "${block.title}".`,
    )
  }
  const result = patchRecord(blockId, patch, actor)
  if (result.nothingWritten === undefined) return result
  const fields = [
    ...(input.name === undefined ? [] : ['name']),
    ...(result.dataPatch?.unchanged ?? []).map((path) => path.replace(/^data\./, '')),
  ]
  const absent = (result.dataPatch?.alreadyAbsent ?? []).map((path) => path.replace(/^data\./, ''))
  const reason = fields.length > 0 && absent.length > 0 ? { kind: 'mixed' as const, fields, absent }
    : fields.length > 0 ? { kind: 'unchanged' as const, fields }
    : absent.length > 0 ? { kind: 'absent' as const, fields: absent }
    : { kind: 'empty' as const }
  return { ...result, nothingWritten: nothingWrittenSentence(reason) }
}

// ============================================================================ remove

/**
 * Take a block out of this pipeline's order. Delete it in the same transaction only when no other live pipeline lists it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A DELETED BLOCK LEAVES BEHIND, MEASURED RATHER THAN ASSUMED
 * ---------------------------------------------------------------------------------------
 *
 * ITS LINKS ARE NOT DELETED, and that is the same rule every other record has: a link whose far end
 * is deleted is shown as broken rather than vanishing, because a dependency somebody recorded is a
 * fact about the archive even after the thing it pointed at is gone. A problem filed against this
 * block still lists it, still names it, and `resolveLinks` marks it `broken: true`.
 *
 * ITS HISTORY IS NOT DELETED either. `changes.record_id` points at the block, so "what happened to
 * this block" is still answerable after it is gone — which is the whole reason a block was made a
 * record.
 *
 * THE ORDER DOES LOSE IT, and that is the one thing here that is a choice rather than a rule. The
 * alternative — leaving the id in `blockIds` and marking the block deleted — is what
 * `readPipelineBlocks` reports as "that block has been deleted, and the pipeline still lists it",
 * and it is refused on the write path by `checkBlockIds` in lib/records/pipeline-blocks.ts: an order naming a
 * deleted row cannot be written at all, so a later reorder of any other block would fail until
 * somebody repaired it by hand. So the order drops it, and `restoreBlock` below is what puts it
 * back where it was.
 *
 * `at` is where it was, 0-based, so the caller can hand that number straight back to `restoreBlock`.
 */
export function removeBlock(pipelineId: string, blockId: string, actor: Actor): { pipeline: PanelRecord; at: number; deleted: boolean; stillListedBy: { id: string; title: string }[] } {
  const pipeline = pipelineOr404(pipelineId)
  blockOf(pipeline, blockId)
  const before = blockIdsOf(pipeline)
  const at = before.indexOf(blockId)
  const ids = before.filter((id) => id !== blockId)
  return sqlite.transaction(() => {
    // The block is deliberately removed and will be deleted or kept in another live pipeline.
    const stillListedBy = pipelinesHolding(blockId).filter((holder) => holder.id !== pipelineId).map(({ id, title }) => ({ id, title }))
    writeOrder(pipeline, ids, actor, [blockId])
    const deleted = stillListedBy.length === 0
    if (deleted) deleteRecord(blockId, actor)
    const after = getRecord(pipelineId)
    if (after === null) throw new PanelError('The pipeline vanished while its block was being removed', 500)
    return { pipeline: after, at, deleted, stillListedBy }
  })()
}

// ============================================================================ restore

/**
 * The change-log field the pipeline's order is written under. One spelling, built by `mergeData`.
 *
 * It is `data.blockIds` because `writeOrder` sends `dataPatch: { blockIds: [...] }` and `pathStep`
 * in lib/records.ts joins the two. Typed here once so the reader below and the writer above cannot
 * drift apart over a string.
 */
const ORDER_FIELD = 'data.blockIds'

/**
 * How far back this reads the pipeline's order history. A pipeline with more than this many change
 * rows makes `restoreBlock` refuse and ask for an explicit position, rather than guess one.
 */
const ORDER_HISTORY_ROWS = 10_000

/** One stored order, parsed out of a change row. Null when the row does not hold a list of ids. */
function parseOrder(value: string | null): string[] | null {
  if (value === null) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    return null
  }
}

/**
 * Where a block goes back, given the order it was taken out of and the order there is now.
 *
 * BY ITS NEIGHBOUR, NOT BY ITS INDEX. The index it had is meaningless once anything else has moved:
 * block 4 of nine, restored into a pipeline that has since lost two earlier blocks, would land two
 * places from where it was. So this walks backwards through the blocks that used to come before it
 * and puts it after the first one that is still there. Nothing before it survived means it goes
 * first, which is the only answer left and is the right one.
 */
function insertionPoint(wasIn: readonly string[], blockId: string, current: readonly string[]): number {
  for (let i = wasIn.indexOf(blockId) - 1; i >= 0; i--) {
    const neighbour = wasIn[i]
    if (neighbour === undefined) continue
    const at = current.indexOf(neighbour)
    if (at !== -1) return at + 1
  }
  return 0
}

/**
 * Every position this pipeline's own history says the block should come back to.
 *
 * READ OUT OF THE CHANGE LOG, WHICH ALREADY HOLDS THE FACT. Every write of the order stores the
 * whole array before and the whole array after, so a row whose `oldValue` lists this block and whose
 * `newValue` does not IS the removal, with the block's neighbours in it. Nothing extra is stored to
 * make this work and no new field was invented for it.
 *
 * A SET, AND USUALLY OF ONE. A block removed and restored more than once has more than one removal
 * row; if they disagree about where it goes, the caller is asked rather than one of them picked.
 *
 * Row ORDER is deliberately not used. `changes.at` is a local wall-clock string to the second, and
 * every write in one test — or one busy minute — carries the same one, so "the most recent row"
 * cannot be told apart from "the first row written that second". This asks a question that does not
 * depend on the answer.
 */
function positionsItWasAt(pipeline: PanelRecord, blockId: string): number[] {
  const current = blockIdsOf(pipeline)
  const answers = new Set<number>()
  // THE PIPELINE'S OWN PROJECT, not the string `'default'`. It was hard-coded, which was invisible
  // because this function has no HTTP route yet — so for any pipeline outside the default project
  // the history query would have returned nothing and a restore would have refused, or guessed a
  // slot, on an empty answer. Same family as the preview and resource-ledger defects of 2026-08-12.
  for (const row of listChanges({
    workspaceId: pipeline.workspaceId,
    recordId: pipeline.id,
    limit: ORDER_HISTORY_ROWS,
  })) {
    if (row.field !== ORDER_FIELD) continue
    const wasIn = parseOrder(row.oldValue)
    if (wasIn === null || !wasIn.includes(blockId)) continue
    if ((parseOrder(row.newValue) ?? []).includes(blockId)) continue
    answers.add(insertionPoint(wasIn, blockId, current))
  }
  return [...answers].sort((a, b) => a - b)
}

export interface RestoreBlockInput {
  /**
   * Where it goes back, 0-based. Left out means "where it was", read from the pipeline's own order
   * history. `removeBlock` reports the same number as `at`, so a caller that has it can pass it.
   */
  at?: number
}

export interface RestoreBlockResult {
  block: PanelRecord
  pipeline: PanelRecord
  /** Where it went back, 0-based. */
  at: number
}

export function restoreBlockSharingAdvice(pipelineId: string, blockId: string): string {
  return `send PATCH /api/records/${pipelineId} with dataPatch.blockIds holding this pipeline's whole order and ${blockId} in it.`
}

/**
 * Put a deleted block back into its pipeline, in the place it came from.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A PLAIN RESTORE IS NOT ENOUGH, AND WHAT IT DOES INSTEAD
 * ---------------------------------------------------------------------------------------
 *
 * `POST /api/records/<block id>/restore` undeletes the row and stops there. Measured on 2026-08-10:
 * the block comes back live, no pipeline lists it, `pipelineHolding` answers null — and a block that
 * is in no order is drawn on no page at all. It also comes back carrying a title qualified by
 * whatever the pipeline was called when it was deleted. So the plain restore answers 200 and hands
 * back a record nobody can see and nobody can edit: `patchBlock` refuses it ("no pipeline lists it
 * at all") and so does a title PATCH.
 *
 * This does the whole of the one intention in ONE transaction: undelete the record, put its id back
 * in the pipeline's order, and rebuild its title from the pipeline's title as it is NOW.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE THINGS IT REFUSES RATHER THAN GUESSES
 * ---------------------------------------------------------------------------------------
 *
 *   1. A BLOCK THIS PIPELINE NEVER HELD. Membership is proved from this pipeline's own order
 *      history, not from the block's title, so "restore" cannot be used to move a block from one
 *      pipeline to another by way of the wastebasket. Filing it somewhere new is a create, and the
 *      refusal says so.
 *   2. A POSITION ITS HISTORY CANNOT SETTLE. Removed and restored twice from two different places,
 *      the answer is asked for rather than picked.
 *   3. A TITLE THAT IS TAKEN. The pipeline may have been renamed, and something else may now answer
 *      to the name this block would come back with. Nothing is written and the clash is named.
 */
export function restoreBlock(
  pipelineId: string,
  blockId: string,
  input: RestoreBlockInput,
  actor: Actor,
): RestoreBlockResult {
  const pipeline = pipelineOr404(pipelineId)
  const record = getRecord(blockId)
  if (record === null) throw new PanelError(NO_SUCH_RECORD, 404, `No record with id ${blockId}.`)
  if (record.kind !== BLOCK_KIND) {
    throw new PanelError(`${blockId} is a ${record.kind} called "${record.title}", not a block.`, 404)
  }

  const current = blockIdsOf(pipeline)
  const alreadyAt = current.indexOf(blockId)
  if (alreadyAt !== -1) {
    // The order still lists it, which happens when the PIPELINE was deleted and the block was
    // deleted after it — `pipelineHolding` only scans live pipelines, so nothing stopped that. There
    // is a hole in the order and this closes it by undeleting the row alone.
    if (record.deletedAt === null) {
      throw new PanelError(
        `"${record.title}" is already block ${alreadyAt + 1} of "${pipeline.title}" and is not deleted. There is ` +
          `nothing to restore. Use PUT /api/records/${pipelineId}/blocks to change the order.`,
      )
    }
    const back = restoreRecord(blockId, actor)
    const after = getRecord(pipelineId)
    if (after === null) throw new PanelError('The pipeline vanished while its block was being restored', 500)
    return { block: back, pipeline: after, at: alreadyAt }
  }

  // A LIVE BLOCK SOME OTHER PIPELINE LISTS IS NOT RESTORED HERE, and the reason changed on 6
  // September 2026. It used to be that a block belongs to one pipeline; several may list one now
  // . What is left is simpler and still true: this block is not deleted, so
  // there is nothing to restore, and restoring is not the way to put a live block into a second
  // pipeline — PATCH the pipeline record with dataPatch.blockIds holding its whole order and the block id.
  const holders = pipelinesHolding(blockId)
  if (holders.length > 0) {
    throw new PanelError(
      `"${record.title}" is not deleted — it is listed by ` +
        `${holders.map((one) => `"${one.title}"`).join(', ')} — so there is nothing here to restore. To put it in ` +
        `"${pipeline.title}" as well, ${restoreBlockSharingAdvice(pipelineId, blockId)} Several pipelines may list one block.`,
      404,
    )
  }

  const wasAt = positionsItWasAt(pipeline, blockId)
  if (wasAt.length === 0) {
    throw new PanelError(
      `The change log for "${pipeline.title}" never shows it holding ${blockId} ("${record.title}"), so there is no ` +
        `place to put it back. Restoring is not how a block moves between pipelines: file a new one with ` +
        `POST /api/records/${pipelineId}/blocks {"name":…,"state":…}. Sending "at" does not get past this — the ` +
        `history is the only thing that says this pipeline ever held that block, and only its last ` +
        `${ORDER_HISTORY_ROWS} changes are read.`,
      404,
    )
  }

  const at = input.at ?? (wasAt.length === 1 ? (wasAt[0] as number) : -1)
  if (at === -1) {
    throw new PanelError(
      `"${record.title}" has been taken out of "${pipeline.title}" from more than one place, so its history does not ` +
        `settle where it goes back: ${wasAt.join(' or ')}. Send the one you mean as "at".`,
    )
  }
  if (!Number.isInteger(at) || at < 0 || at > current.length) {
    throw new PanelError(
      `at must be a whole number from 0 to ${current.length} — this pipeline has ${current.length} live ` +
        `block${current.length === 1 ? '' : 's'}, so ${current.length} means "at the end". It is ${JSON.stringify(input.at)}.`,
    )
  }

  // A BLOCK COMES BACK UNDER THE NAME IT WENT AWAY WITH. Its title never depended on the pipeline's,
  // so nothing about it moved while it was deleted; what can have changed is that a sibling took the
  // name in the meantime, and that is refused rather than allowed to make two identical names.
  refuseTakenName(
    record.title,
    pipeline,
    blockId,
    `Rename that block, or rename this one, and restore this block again.`,
  )

  return sqlite.transaction((): RestoreBlockResult => {
    // Undelete FIRST: `checkBlockIds` refuses an order naming a deleted row, so writing the order
    // before the row is live would refuse this pipeline's own restore.
    restoreRecord(blockId, actor)
    writeOrder(pipeline, [...current.slice(0, at), blockId, ...current.slice(at)], actor)
    const block = getRecord(blockId)
    const after = getRecord(pipelineId)
    if (block === null || after === null) {
      throw new PanelError('The block or its pipeline vanished while it was being restored', 500)
    }
    return {
      block,
      pipeline: after,
      at,
    }
  })()
}

// ============================================================================ reorder

/**
 * Put the pipeline's blocks in a new order.
 *
 * THE WHOLE LIST, NOT A MOVE. A caller sends the order it wants, and it must be a permutation of the
 * blocks the pipeline already has: no id added, none dropped, none repeated. A "move block X to
 * position 3" call would be smaller to write and impossible to check — two callers moving two blocks
 * would each be right about their own and wrong about the result. This way the caller says what the
 * order IS, and a stale caller is refused rather than silently reordering somebody else's work.
 */
export function reorderBlocks(pipelineId: string, ids: readonly string[], actor: Actor): { pipeline: PanelRecord; nothingWritten?: string } {
  const pipeline = pipelineOr404(pipelineId)
  const current = blockIdsOf(pipeline)
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) throw new PanelError(`blockIds lists "${id}" twice. A block is at one position or it is nowhere.`)
    seen.add(id)
    if (!current.includes(id)) {
      const record = getRecord(id)
      throw new PanelError(
        record === null
          ? `blockIds names "${id}", and no record has that id. Reordering only reorders; add a block with POST /api/records/${pipelineId}/blocks.`
          : `blockIds names "${record.title}", which is not one of this pipeline's blocks. Reordering only reorders.`,
      )
    }
  }
  const missing = current.filter((id) => !seen.has(id))
  if (missing.length > 0) {
    const blocks = missing.map((id) => ({ id, title: getRecord(id)?.title ?? id }))
    throw new PanelError(blocksLeftOutWords(pipelineId, blocks))
  }
  if (ids.length === current.length && ids.every((id, i) => id === current[i])) {
    return { pipeline, nothingWritten: nothingWrittenSentence({ kind: 'order-unchanged' }) }
  }
  return sqlite.transaction(() => {
    writeOrder(pipeline, ids, actor)
    const after = getRecord(pipelineId)
    if (after === null) throw new PanelError('The pipeline vanished while its blocks were being reordered', 500)
    return { pipeline: after }
  })()
}

// ============================================================================ reading one pipeline

/**
 * ONE PIPELINE'S BLOCKS, LOADED OFF THE DATABASE AND READ THE ONE WAY THEY ARE EVER READ.
 *
 * `readPipelineBlocks` in shared/blocks.ts is THE reader, and it takes records and links rather
 * than reading them itself, because the browser has already loaded both. A caller on the server
 * has not, so it has to load them — and that loading was written once, inside a closure in
 * `src/server/api/records.ts`, where nothing else could reach it. `src/server/lib/continuation.ts`
 * needed the same answer for the bundle and wrote a second reading instead: it counted a
 * pipeline's steps through links of kind `block`, and a pipeline's steps are the ids in its own
 * `data.blockIds`, so every bundle printed "0 of 0 step(s) done" for every pipeline. Problem
 * `xxpYGbmxEDiW`. The loading lives here now and both callers use it.
 *
 * WHY THE LINKS ARE A PARAMETER AND NOT READ HERE. `blockLinkRowsIn` reads every link in the
 * project, so a caller with several pipelines reads them once and hands the same rows to each.
 * Reading them per pipeline would multiply that whole query by the number of pipelines.
 */
export function readOnePipelinesBlocks(
  pipeline: PanelRecord,
  workspaceId: string,
  rows: readonly BlockLinkRow[],
): PipelineBlockReading {
  // The blocks themselves, and the modules recorded as carrying one. A module that is not loaded
  // is named as not loaded rather than dropped — see `unloadedModuleName` — so gathering them
  // here is the difference between a real title and a sentence apologising for its absence.
  const ids = new Set(blockIdsOf(pipeline))
  const wanted = new Set(ids)
  for (const row of rows) {
    if (row.type === 'implements' && ids.has(row.toId)) wanted.add(row.fromId)
  }
  const loaded: PanelRecord[] = []
  for (const id of wanted) {
    const found = getRecord(id)
    // A block of another project is not this project's to read, and a pipeline should never hold
    // one — `POST /api/records/:id/workspace` refuses to leave a pipeline holding a block that is
    // elsewhere. If one ever is, it is left out here and `readPipelineBlocks` reports the hole.
    if (found !== null && found.workspaceId === workspaceId) loaded.push(found)
  }
  return readPipelineBlocks(pipeline, loaded, rows)
}

/**
 * EVERY LINK IN ONE PROJECT, in the shape `readPipelineBlocks` takes. One query for the lot.
 *
 * `allGatedLinks` is the bulk reader the drawing already uses. The gate is flattened to the two
 * fields a block reading looks at, here rather than in each caller.
 */
export function blockLinkRowsIn(workspaceId: string): BlockLinkRow[] {
  return allGatedLinks(workspaceId).map((l) => ({
    id: l.id,
    fromId: l.fromId,
    toId: l.toId,
    type: l.type,
    gate: l.gate?.kind ?? null,
    upTo: l.gate?.upTo ?? null,
    inferred: l.inferred,
  }))
}

/** Links that the single-pipeline reader can use, in the same stored order as the project read. */
export function blockLinkRowsFor(pipeline: PanelRecord, workspaceId: string): BlockLinkRow[] {
  const ids = blockIdsOf(pipeline)
  if (ids.length === 0) return []
  return db.select().from(links)
    .where(and(eq(links.workspaceId, workspaceId), sql`${links.toId} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`))
    .orderBy(sql`${links}.rowid`)
    .all()
    .map((row) => {
      const gate = readLinkGate(row).gate
      return {
        id: row.id,
        fromId: row.fromId,
        toId: row.toId,
        type: row.type,
        gate: gate?.kind ?? null,
        upTo: gate?.upTo ?? null,
        inferred: row.inferred,
      }
    })
}
