// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CHECKLIST ITEMS: one line of a checklist, addressed by its id, and the write that appends a part.
 * They were moved out of src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still
 * imports these names from records.ts. This file reads `assertMayWrite` from ./may-write.ts; every
 * other name comes from the file where it lives.
 */
// WHAT A WHO-MAY-ACT GATE LETS THROUGH AT OFF. Its two functions are called, never run when the file loads, so the loop
// through lib/who-may-act.ts back to records.ts is harmless.
import { gatePosition } from '../../../config/settings.mjs'
import { db, sqlite } from '../../db/client.ts'
import { numbering } from '../../db/numbering.ts'
import { records, revisions } from '../../db/schema.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import { gateMet, gateMetOnceTheWriteIsTakenBack } from '../gate-counts.ts'
import { logChange } from '../log-change.ts'
import { refuseModulePartChanges } from '../module-requirements.ts'
import { noRecordHasThisId } from '../no-record-has-this-id.ts'
import { PanelError } from '../panel-error.ts'
// WHO WROTE A RECORD, read from the ledger this file writes. `whatThisWroteOver` below is the one
// caller: what somebody wrote is theirs to change and nobody else's, and the ledger's first
// revision is where that fact already lives. lib/reviews.ts attributes a review's members with the
// same function, so there is one answer to "who wrote this" rather than two.
//
// THAT MODULE IMPORTS records.ts, and it is safe for the same reason: the reference is inside a
// function body, so nothing of records.ts is read while it is still being evaluated.
import { whoWroteEachFieldOfALine, type WhoWroteTheLineField } from '../revisions.ts'
import { toRecord } from '../to-record.ts'
import { type Incompleteness, validateRecordData } from '../validate.ts'
import { versionOf } from '../version.ts'
import { type Actor } from './actor.ts'
import { assertMayWrite } from './may-write.ts'
import { type DataEdit, type DataPatchOutcome, describeOutcome, mergeData, plainOutcome } from './merge-data.ts'
import { nothingWrittenSentence, patchRecord } from './patching.ts'
import { getRecord } from './reading.ts'
import { sameAgent } from './same-agent.ts'
import { saveRevision } from './save-revision.ts'
import { incompletenessOf } from '@shared/incompleteness-of.ts'
import { SHAPE_SPECS, suggestKey } from '@shared/kinds.ts'
import { named } from '@shared/named.ts'
import { now } from '@shared/now.ts'
import { type PanelRecord, type RecordKind } from '@shared/types.ts'
import { and, eq, or } from 'drizzle-orm'

// ------------------------------------------------------- changing ONE line of a checklist

/**
 * A checklist item, addressed by its id, written into a path a person can read back.
 *
 * `data.parts[#mount].items[#mount-1]`. The `#` says "the element whose id is this", not "the
 * element at this index", and that distinction is the whole reason the addressing is by id:
 * an index moves when somebody reorders a checklist, and a change row that says `items[2]` then
 * describes a different line than the one that was edited. An id does not move. `pathStep` (@shared/fielddiff.ts)
 * quotes a key that is not a plain identifier for the same reason, and this does the same for an
 * id with a bracket or a space in it, so a path always reads back to exactly one item.
 */
function idPath(prefix: string, arrayKey: string, id: string): string {
  const safe = /^[A-Za-z0-9_.:-]+$/.test(id) ? id : JSON.stringify(id)
  return `${prefix}.${arrayKey}[#${safe}]`
}

/** The keys of a checklist item that may be changed one at a time, from the shared spec. */
const ITEM_KEYS: readonly string[] = (SHAPE_SPECS['ProgressItem']?.fields ?? []).map((f) => f.key)

/** What a checklist-item write did: the record, the item, and the paths that moved. */
export interface ChecklistPatchResult {
  nothingWritten?: string
  record: PanelRecord
  /** The item as it now stands, whole. */
  item: Record<string, unknown>
  /** The id of the part the item was found in — the caller never has to know it in advance. */
  partId: string
  /** The same report a merge patch gives, in item paths. */
  itemPatch: DataPatchOutcome
  incomplete: Incompleteness[]
  /** True when this call ADDED the line rather than changing one that was there. */
  appended: boolean
  /**
   * The values on the line that this write replaced and that somebody else put there, or that the
   * revision ledger cannot name a writer for. Empty when the write replaced none: it added the line,
   * changed nothing, or changed only values its own writer had put there. See `whatThisWroteOver`.
   */
  writtenOver: WrittenOverField[]
  /**
   * The values the same earlier writes put on the line that this write did not touch, so they now
   * stand beside the new ones. Empty when `writtenOver` names no known writer.
   */
  leftBeside: { field: string; value: unknown; seq: number }[]
  /** One paragraph saying the two lists above in words. Null exactly when `writtenOver` is empty. */
  writtenOverNote: string | null
}

/** One value a checklist-line write replaced, what it held, and who put it there. */
export interface WrittenOverField {
  field: string
  /** What the line held under this key before the write. */
  was: unknown
  /** What it holds now. Null when the write removed the key. */
  now: unknown
  /** Who put `was` there. Null when the revision ledger cannot say. */
  by: { actorType: string; actorId: string; sessionId: string | null } | null
  at: string | null
  seq: number | null
}

/**
 * WHAT A CHECKLIST-LINE WRITE IS ABOUT TO WRITE OVER, when somebody else wrote it.
 *
 * The item route takes `ifVersion` and does not require it, on purpose: requiring it would put a read
 * in front of ticking a box. So a writer holding an old copy can send `{"state":"done"}` over a line
 * another writer has just set to `failed` with a note, and the write is made. The request cannot show
 * whether the writer knew, because a stale doing-to-done and a meant one are the same bytes.
 *
 * What this does instead of refusing: it reads, from the revision ledger, who put each value the
 * write replaces, and names in the 200 answer every one that the caller did not put there itself —
 * the field, what it held, who wrote it and when, and which revision. It also names the values the
 * same earlier writes put on the line that this write leaves standing, because a line reading `done`
 * beside a note about a failure is the half a reader of the answer most needs to see.
 *
 * A value is the caller's own when `sameAgent` says the stored writer and the caller are one writer.
 * A value the ledger cannot place is named too, with no writer, because "nobody can say" is not "it
 * was yours".
 */
function whatThisWroteOver(
  recordId: string,
  itemId: string,
  line: Record<string, unknown>,
  next: Record<string, unknown>,
  sentKeys: readonly string[],
  actor: Actor,
): Pick<ChecklistPatchResult, 'writtenOver' | 'leftBeside' | 'writtenOverNote'> {
  // The keys whose value this write really replaced. A key that was absent held nobody's value.
  const replaced = sentKeys.filter(
    (key) => line[key] !== undefined && JSON.stringify(line[key]) !== JSON.stringify(next[key]),
  )
  const others = Object.keys(next).filter((key) => key !== 'id' && !sentKeys.includes(key))
  const writers = whoWroteEachFieldOfALine(recordId, itemId, line, [...replaced, ...others])
  const writtenOver: WrittenOverField[] = []
  for (const field of replaced) {
    const by: WhoWroteTheLineField | null = writers.get(field) ?? null
    if (by !== null && sameAgent(by, actor)) continue
    writtenOver.push({
      field,
      was: line[field],
      now: next[field] ?? null,
      by: by === null ? null : { actorType: by.actorType, actorId: by.actorId, sessionId: by.sessionId },
      at: by?.at ?? null,
      seq: by?.seq ?? null,
    })
  }
  if (writtenOver.length === 0) return { writtenOver, leftBeside: [], writtenOverNote: null }
  const seqs = new Set(writtenOver.flatMap((w) => (w.seq === null ? [] : [w.seq])))
  const leftBeside = others.flatMap((field) => {
    const by = writers.get(field) ?? null
    return by !== null && seqs.has(by.seq) ? [{ field, value: next[field], seq: by.seq }] : []
  })

  const said = writtenOver.map((w) => {
    const change =
      `${w.field} was ${JSON.stringify(w.was)} and is now ` +
      (next[w.field] === undefined ? 'removed' : JSON.stringify(next[w.field]))
    return w.by === null
      ? `${change}; the revision ledger cannot say who wrote ${JSON.stringify(w.was)}`
      : `${change}; ${w.by.actorType} ${w.by.actorId} wrote ${JSON.stringify(w.was)} at ${w.at} (revision ${w.seq})`
  })
  const beside =
    leftBeside.length === 0
      ? ''
      : ` These values from the same ${seqs.size === 1 ? 'write are' : 'writes are'} still on the line, ` +
        `beside the new ones: ${leftBeside.map((l) => `${l.field} ${JSON.stringify(l.value)}`).join(', ')}.`
  const { highest, count } = numbering(recordId)
  const back =
    count === 0
      ? ''
      : ` The line as it was before this write is in GET /api/records/${recordId}/revisions/${highest}.`
  const writtenOverNote =
    `This write replaced values on checklist line "${itemId}" that another writer put there, or that the ` +
    `revision ledger cannot name a writer for: ${said.join('. ')}.${beside}${back} If you did not mean to ` +
    `write over them, set the line back with PATCH /api/records/${recordId}/checklist/${itemId}. To be ` +
    `refused rather than answered when the record has changed since you read it, send the ifVersion ` +
    `your read handed you.`
  return { writtenOver, leftBeside, writtenOverNote }
}

/**
 * Add ONE line to a module's checklist, without holding the checklist.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS: ADDING A LINE USED TO DESTROY THE OTHER LINES
 * ---------------------------------------------------------------------------------------
 *
 * `patchChecklistItem` below could change a line and deliberately refused to invent one. There was
 * no way to ADD one, so adding meant: GET the record, splice the array in the client, PATCH the
 * whole of `data.parts` back. Four agents did that in one night, and one of them measured what it
 * cost when two of them did it at once:
 *
 *     item ids BEFORE: ['utc-defaults', 'panel-layouts', 'summary-comment']
 *     item ids AFTER : ['sc-1', 'sc-2', 'sc-3', 'sc-4']
 *     survived: []
 *
 * Answered 200. This route is the write that has nothing to lose: it carries the one line, so a
 * caller that has not read the checklist cannot overwrite the part of it it never saw.
 *
 * `partId` IS REQUIRED AND IS NOT GUESSED. A module has several parts and there is no default one;
 * picking the first would file work under a heading nobody chose. A partId that names no part is
 * refused with the parts that do exist, so one wrong request teaches the caller the whole list.
 *
 * `id` IS THE CALLER'S TO CHOOSE and is required for the same reason `ProgressItem.id` is required:
 * it is what the change log compares to answer "how long has this been doing?", and it is what the
 * caller will address the line by afterwards. A server-minted random id would put
 * `data.parts[#mount].items[#V1StGXR8_4]` in the history where a person has to read it.
 */
export function appendChecklistItem(
  recordId: string,
  partId: string,
  item: Record<string, unknown>,
  actor: Actor,
  /** The version the caller read, when it chose to say. See `patchChecklistItem`, which enforces it. */
  ifVersion?: string,
): ChecklistPatchResult {
  const id = item['id']
  if (typeof id !== 'string' || id.trim() === '') {
    throw new PanelError(
      `A new checklist line needs an \`id\`: a short stable name, unique within this module, e.g. "mount-4". ` +
        `It is what the change log compares to answer "how long has this been doing?" and what you address the ` +
        `line by afterwards — PATCH /api/records/${recordId}/checklist/<id>. GET /api/kinds/module describes it ` +
        `under ProgressItem.`,
    )
  }
  const rest = { ...item }
  delete rest['id']
  // The write itself is patchChecklistItem's, which is the one function in this file that writes a
  // checklist line. Two functions writing the same array is how the two halves of a rule drift.
  return patchChecklistItem(recordId, id.trim(), rest, actor, partId, ifVersion)
}

/** What `appendAPart` hands back: the module as it now stands, the new part, and what the write left incomplete. */
export interface PartAppendResult {
  record: PanelRecord
  part: { id: string; name: string; items: unknown[] }
  incomplete: Incompleteness[]
}

/**
 * THE GATE `writes-from-a-stale-copy`, asked where a write names a version the record no longer has. At block the
 * refusal is thrown and counted as stopped. At off the write goes on and is counted. The plans' door asks it too.
 */
export function writtenFromAStaleCopy(refusal: PanelError): void {
  const position = gatePosition('writes-from-a-stale-copy')
  const met = () => gateMet('writes-from-a-stale-copy', position!)
  if (position === 'block') throw gateMetOnceTheWriteIsTakenBack(refusal, met)
  met()
}

/**
 * ADD ONE PART TO A MODULE'S CHECKLIST, without holding the checklist.
 *
 * The planning flow's first real use found no door for this. Rewriting `data.parts` is refused
 * without `ifVersion`, and the line door refuses a part that does not exist, so the planner put the plan's lines into a
 * part that was already there. This carries the one part, empty, the way `appendChecklistItem` carries one line: a
 * caller that has not read the checklist cannot drop the parts it never saw. Lines go on it afterwards through
 * POST /api/records/<module>/checklist.
 *
 * Refused, with nothing written: a record that is not a module; an id or a name that is missing or empty; an id that
 * a part of this module already has (409, naming the parts). A module with no `parts` yet gets its first. It writes
 * through `patchRecord`, as one change of `data.parts` and one revision.
 */
export function appendAPart(recordId: string, said: { id: string; name: string }, actor: Actor, ifVersion?: string): PartAppendResult {
  const before = db.select().from(records).where(eq(records.id, recordId)).get()
  if (!before) throw noRecordHasThisId(recordId)
  const kind = before.kind as RecordKind
  assertMayWrite(kind, 'change', actor, recordId)
  const current = versionOf(toRecord(before))
  if (ifVersion !== undefined) {
    if (ifVersion !== current) {
      writtenFromAStaleCopy(new PanelError(
        `This record has changed since you read it, so nothing was written. You sent ifVersion ` +
          `"${ifVersion}"; it is now "${current}". Read it again with GET /api/records/${recordId}, and send the ` +
          `version that read hands back.`,
        409,
      ))
    }
  }
  if (kind !== 'module') {
    throw new PanelError(`Only a module has a checklist with parts, and ${recordId} is a ${kind}. Nothing was written.`)
  }
  const id = said.id.trim()
  const name = said.name.trim()
  if (id === '' || name === '') {
    throw new PanelError(
      'A new part needs an `id`, short and unique within this module, and a `name`, the heading its lines sit under. ' +
        'Nothing was written.',
    )
  }
  const data = (before.data ?? {}) as Record<string, unknown>
  const held = data['parts']
  if (held !== undefined && !Array.isArray(held)) {
    throw new PanelError(
      `This module's \`parts\` is not a list, so no part can be added to it. Write it whole with ` +
        `PATCH /api/records/${recordId} {"dataPatch":{"parts":[…]}}. Nothing was written.`,
    )
  }
  const parts = (held ?? []) as unknown[]
  const partIds = parts.flatMap((part) => (isJsonObject(part) && typeof part['id'] === 'string' ? [part['id']] : []))
  if (partIds.includes(id)) {
    throw new PanelError(
      `This module already has a part with id "${id}". Its parts are: ${partIds.join(', ')}. Add lines to it with ` +
        `POST /api/records/${recordId}/checklist {"partId":"${id}",…}, or give the new part another id. Nothing was written.`,
      409,
    )
  }
  const part = { id, name, items: [] as unknown[] }
  // THROUGH patchRecord, so every guard on a module's data is asked here too and no new write site is made. The version
  // read above goes with it: the parts are written whole, and only over the parts this function looked at.
  const result = patchRecord(recordId, { dataPatch: { parts: [...parts, part] }, ifVersion: current }, actor)
  return { record: result.record, part, incomplete: validateRecordData(kind, result.record.data) }
}

/**
 * Change ONE line of a module's checklist without sending the checklist.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS WHEN dataPatch ALREADY DOES
 * ---------------------------------------------------------------------------------------
 *
 * `mergeData` merges objects and REPLACES arrays, deliberately: an index-wise array merge
 * cannot shorten a list and corrupts a reordered one. So `parts` — an array of parts, each
 * holding an array of items — is the one thing a merge patch cannot reach into, and ticking off
 * a checklist line is the single most common edit in the product. The audit's own words: "the
 * cheap edit path does not reach the content most likely to need editing." Today that edit means
 * GET the record, rewrite the array in the client, PATCH the whole of `data` back — the exact
 * read-modify-write the merge patch was built to remove, with a change row holding the whole
 * checklist twice.
 *
 * This addresses the item by ID instead. No index, no array, no read first.
 *
 * WHAT IT REFUSES, AND WHY EACH REFUSAL IS A REFUSAL RATHER THAN A GUESS:
 *
 *   - an id nothing holds        404, listing the ids that do exist. It does NOT append a new
 *                                item: a typo that silently creates a second checklist line is
 *                                worse than an error, because the tick lands somewhere and the
 *                                writer believes it. Adding a line is `appendChecklistItem`
 *                                above, which is a different request and names the part, so no
 *                                mistyped id can ever reach it.
 *   - an id held twice           400, naming both parts. Picking one would be a coin toss.
 *   - a key ProgressItem has no  400, naming the keys it does have.
 *   - `id` itself                400. The id is what the change log compares to date an item;
 *                                rewriting it silently loses that history.
 *   - an empty patch             400. "Change nothing" asked as a change is a caller that built
 *                                its request wrong, and a 200 would hide it.
 *   - a record that is not a     400. Only a module has a checklist.
 *     module
 *
 * A null deletes an optional key, exactly as in a merge patch — and if it names a key the item
 * needs, the whole-record gate below refuses the write, so `state: null` cannot empty a line.
 */
export function patchChecklistItem(
  recordId: string,
  itemId: string,
  patch: Record<string, unknown>,
  actor: Actor,
  /**
   * Set only by `appendChecklistItem` above: which part the NEW line goes on.
   *
   * Its presence is what turns this function from an edit into an append, and it is a part id
   * rather than a boolean so that the intent and its one missing fact arrive together — there is no
   * way to ask for an append without saying where it goes.
   */
  appendToPart?: string,
  /**
   * The version this write was built against, when the caller chose to say. Optional, and that is
   * the design rather than an omission.
   *
   * BOTH THESE ROUTES USED TO REFUSE IT — `400, a checklist item has no field "ifVersion"` — so the
   * only guard that would help was rejected by the only two routes the documentation recommends,
   * with a sentence that reads as the caller having malformed its own request. It is optional
   * because a route that carries ONE line cannot revert a line it never read, so requiring a read
   * in front of ticking a box would put a round trip on the commonest edit in the product for no
   * gain. What it buys the caller that does send it: a `doing` → `done` on a line somebody else has
   * just written is the one thing this path can still write over, and this is how a caller asks to be
   * refused when the record has moved since its read. A caller that does not send it is still told:
   * the answer's `writtenOver` names every value the write replaced that another writer put there,
   * with who and when (`whatThisWroteOver`).
   */
  ifVersion?: string,
  revisionNote?: string,
): ChecklistPatchResult {
  const appending = appendToPart !== undefined
  const before = db.select().from(records).where(eq(records.id, recordId)).get()
  if (!before) throw noRecordHasThisId(recordId)
  const kind = before.kind as RecordKind
  // WHO MAY WRITE THIS KIND, asked through `assertMayWrite` and not restated here. Ticking one
  // checklist line of a decision is the same act to a reader as patching the whole record, and
  // `patchRecord` asks this question in that one place — including the half a local copy kept
  // missing, that a request which sent no actor headers may not make a governance write at all.
  assertMayWrite(kind, 'change', actor, recordId)
  // THE COMPARE-AND-SET, ASKED FIRST, in the same words `patchRecord` uses and for the reason its
  // own comment gives: a refusal must happen before anything is computed from a copy that is stale.
  if (ifVersion !== undefined) {
    const current = versionOf(toRecord(before))
    if (ifVersion !== current) {
      writtenFromAStaleCopy(new PanelError(
        `This record has changed since you read it, so nothing was written. You sent ifVersion ` +
          `"${ifVersion}"; it is now "${current}". Read it again with GET /api/records/${recordId}, apply your ` +
          `change to what is there now, and send the version that read hands back.`,
        409,
      ))
    }
  }
  if (kind !== 'module') {
    throw new PanelError(
      `Only a module has a checklist, and ${recordId} is a ${kind}. A ${kind} is changed with ` +
        `PATCH /api/records/${recordId} {"dataPatch":{…}}; GET /api/kinds/${kind} lists what may go in it.`,
    )
  }

  const keys = Object.keys(patch)
  // An empty body means two different mistakes and gets two different answers. Asking to change
  // nothing is a caller that built its request wrong. Adding a line with nothing on it is a caller
  // that has not said what the line is, and the whole-record gate below already refuses that with
  // the field list and an example each, so the append path is left to reach it.
  if (keys.length === 0 && !appending) {
    throw new PanelError(
      `Nothing to change: name at least one of ${ITEM_KEYS.filter((k) => k !== 'id').join(', ')}, ` +
        `or null to delete an optional one.`,
    )
  }
  for (const key of keys) {
    if (key === 'id') {
      throw new PanelError(
        `A checklist item's id may not be changed here. It is what the change log compares to answer ` +
          `"how long has this been doing?", so renumbering an item loses that history. If the id really ` +
          `has to change, rewrite the checklist with PATCH /api/records/${recordId} {"dataPatch":{"parts":[…]}} ` +
          `and accept that the item's history starts again.`,
      )
    }
    if (!ITEM_KEYS.includes(key)) {
      const suggestion = suggestKey(key, ITEM_KEYS)
      throw new PanelError(
        `A checklist item has no field "${key}"${suggestion !== null ? ` — did you mean "${suggestion}"?` : ''}. ` +
          `It takes ${ITEM_KEYS.join(', ')}, and GET /api/kinds/module describes each one under ProgressItem.`,
      )
    }
    // A null means DELETE THIS KEY, and on a line that does not exist yet there is nothing to
    // delete. The append does not run through `mergeData`, so a null here would be STORED — and a
    // stored null is a value every reader then has to have an opinion about, which is the reason
    // the merge patch never stores one either. Refused rather than dropped: silently ignoring a key
    // somebody sent is the write that loses text and says it worked.
    if (appending && patch[key] === null) {
      throw new PanelError(
        `"${key}" was sent as null on a NEW checklist line. On a change, null deletes the key; on a line that ` +
          `does not exist yet there is nothing to delete, and a stored null is a value every reader has to have ` +
          `an opinion about. Leave "${key}" out of the body instead, and add it later with ` +
          `PATCH /api/records/${recordId}/checklist/${itemId} {"${key}":"…"}.`,
      )
    }
  }

  const data = (before.data ?? {}) as Record<string, unknown>
  const parts = data['parts']
  if (!Array.isArray(parts)) {
    throw new PanelError(
      `This module has no \`parts\` array, so it has no checklist to change. Write one first with ` +
        `PATCH /api/records/${recordId} {"dataPatch":{"parts":[…]}} — GET /api/kinds/module has the shape.`,
    )
  }

  // Every place the id occurs, not the first: a duplicate is a real state a hand-written
  // checklist can be in, and answering the first one would tick a line the caller cannot see.
  const hits: { partIndex: number; itemIndex: number; partId: string; item: Record<string, unknown> }[] = []
  const known: string[] = []
  const partIds: string[] = []
  parts.forEach((part, partIndex) => {
    if (!isJsonObject(part)) return
    if (typeof part['id'] === 'string') partIds.push(part['id'])
    const items = part['items']
    if (!Array.isArray(items)) return
    items.forEach((item, itemIndex) => {
      if (!isJsonObject(item)) return
      const id = item['id']
      if (typeof id !== 'string') return
      known.push(id)
      if (id !== itemId) return
      const partId = typeof part['id'] === 'string' ? part['id'] : `#${partIndex}`
      hits.push({ partIndex, itemIndex, partId, item })
    })
  })

  // ---- ADDING A LINE ---------------------------------------------------------------------
  //
  // Three refusals, and every one is a refusal rather than a guess for the same reason the edit
  // path's are: an append that lands somewhere the caller did not name is a line filed under a
  // heading nobody chose, and the caller believes it went where it asked.
  if (appending) {
    // A part id used twice is the same shape of damage as an item id used twice, one level up, and
    // it is worse here: the write below matches parts BY ID, so an append would silently put the
    // same line on both of them. The edit path refuses a duplicate item id rather than picking one;
    // this refuses a duplicate part id rather than writing to both.
    if (partIds.filter((p) => p === appendToPart).length > 1) {
      throw new PanelError(
        `This module has ${partIds.filter((p) => p === appendToPart).length} parts with id "${appendToPart}", so ` +
          `there is no single part to add to and adding to both would put one line in two places. Ids must be ` +
          `unique within a module. Fix the duplicate first with ` +
          `PATCH /api/records/${recordId} {"dataPatch":{"parts":[…]}}.`,
      )
    }
    if (!partIds.includes(appendToPart)) {
      throw new PanelError(
        `This module has no part with id "${appendToPart}", so there is nowhere to put the line. ` +
          (partIds.length === 0
            ? `None of its parts carries an id, so no part can be named; give them ids with ` +
              `PATCH /api/records/${recordId} {"dataPatch":{"parts":[…]}}.`
            : `Its parts are: ${partIds.join(', ')}.`) +
          ` Nothing was added: Mole Office does not pick a part for you, because a line filed under a heading ` +
          `nobody chose reads as somebody else's work.`,
        404,
      )
    }
    if (hits.length > 0) {
      const held = hits.map((h) => `"${h.partId}"`).join(' and ')
      throw new PanelError(
        `This module already has a checklist item with id "${itemId}", in ${hits.length === 1 ? 'part' : 'parts'} ` +
          `${held}, so nothing was added. Ids must be unique within a module — it is what the change log ` +
          `compares to date a line. To change the line that is there: ` +
          `PATCH /api/records/${recordId}/checklist/${itemId} {…}. To add a different one, give it another id.`,
      )
    }
  }

  if (!appending && hits.length === 0) {
    // The ids are listed, capped, because "no such item" with no alternatives is the 404 that
    // sends a caller to read the source — which is the failure this whole surface was built for.
    const shown = known.slice(0, 40)
    const tail = known.length > shown.length ? `, and ${known.length - shown.length} more` : ''
    throw new PanelError(
      `This module has no checklist item with id "${itemId}", so nothing was changed. ` +
        (known.length === 0
          ? `Its checklist has no items at all yet.`
          : `The ids it does have are: ${shown.join(', ')}${tail}.`) +
        ` Nothing was appended: an id that names no item is a mistake, not a new item.`,
      404,
    )
  }
  if (!appending && hits.length > 1) {
    const where = hits.map((h) => `"${h.partId}"`).join(' and ')
    throw new PanelError(
      `The id "${itemId}" is used by ${hits.length} items in this module, in parts ${where}. ` +
        `Ids must be unique within a module, so there is no single item to change. Fix the duplicate ` +
        `first with PATCH /api/records/${recordId} {"dataPatch":{"parts":[…]}}.`,
    )
  }

  // What the write is aimed at, worked out once by whichever branch applies, so that the write
  // itself below is ONE path. Two writers of one array is how the halves of a rule drift apart.
  let partId: string
  let nextItem: Record<string, unknown>
  let edits: DataEdit[]
  let outcome: DataPatchOutcome
  let nextParts: unknown[]
  // What this write replaces that somebody else wrote. Nothing, on an append: the line is new.
  let overwritten: Pick<ChecklistPatchResult, 'writtenOver' | 'leftBeside' | 'writtenOverNote'> = {
    writtenOver: [],
    leftBeside: [],
    writtenOverNote: null,
  }

  if (appending) {
    partId = appendToPart
    // The id goes in FIRST, so the stored line reads id, text, state in the order the shape
    // declares them rather than in the order the caller happened to type.
    nextItem = { id: itemId, ...patch }
    const itemPath = `${idPath('data', 'parts', partId)}.items[#${itemId}]`
    // ONE change row, holding the whole new line and nothing else. `before` is undefined, which is
    // what the log already means by "this key did not exist", so the history of the line starts
    // here and `lastTouchedItem` can date it from its first day.
    edits = [{ path: itemPath, before: undefined, after: nextItem, deleted: false }]
    const paths = { changed: [itemPath], deleted: [], unchanged: [], alreadyAbsent: [] }
    outcome = { ...paths, note: plainOutcome(paths), detail: describeOutcome(paths) }
    nextParts = parts.map((part) => {
      if (!isJsonObject(part) || part['id'] !== partId) return part
      const items = Array.isArray(part['items']) ? (part['items'] as unknown[]) : []
      // At the END, always. Where a line goes among the others is a reordering, which is a
      // `data.parts` write and is still allowed — dropping lines is what is refused, not moving them.
      return { ...part, items: [...items, nextItem] }
    })
  } else {
    const hit = hits[0] as { partIndex: number; itemIndex: number; partId: string; item: Record<string, unknown> }
    const itemPath = `${idPath('data', 'parts', hit.partId)}.items[#${itemId}]`
    const merged = mergeData(hit.item, patch, itemPath)

    // Nothing at all is written when nothing moved — not the item, not `updatedAt`. Same rule as a
    // merge patch: `updatedAt` is the order the home page lists modules in, and lifting a module to
    // the top of the page for a write that changed none of it is a lie with a visible consequence.
    if (merged.edits.length === 0) {
      const unchanged = toRecord(before)
      const fields = merged.outcome.unchanged.map((path) => path.slice(itemPath.length + 1))
      const absent = merged.outcome.alreadyAbsent.map((path) => path.slice(itemPath.length + 1))
      const reason = fields.length > 0 && absent.length > 0 ? { kind: 'mixed' as const, fields, absent }
        : fields.length > 0 ? { kind: 'unchanged' as const, fields }
        : absent.length > 0 ? { kind: 'absent' as const, fields: absent }
        : { kind: 'empty' as const }
      return {
        record: unchanged,
        nothingWritten: nothingWrittenSentence(reason),
        item: hit.item,
        partId: hit.partId,
        itemPatch: merged.outcome,
        incomplete: incompletenessOf(unchanged),
        appended: false,
        writtenOver: [],
        leftBeside: [],
        writtenOverNote: null,
      }
    }

    partId = hit.partId
    nextItem = merged.data
    edits = merged.edits
    // Read from the ledger BEFORE the write, so the answer is about the line as it stood.
    overwritten = whatThisWroteOver(recordId, itemId, hit.item, merged.data, keys, actor)
    outcome = merged.outcome
    nextParts = parts.map((part, partIndex) => {
      if (partIndex !== hit.partIndex || !isJsonObject(part)) return part
      const items = part['items'] as unknown[]
      return {
        ...part,
        items: items.map((item, itemIndex) => (itemIndex === hit.itemIndex ? merged.data : item)),
      }
    })
  }

  const nextData = { ...data, parts: nextParts }
  refuseModulePartChanges({ kind, data }, { kind, data: nextData }, actor)

  // Checked as the WHOLE record, like every other write. That is what makes `{"state":"quite
  // done"}` a 400 naming the five states, what stops `{"state":null}` leaving a line with no
  // state on it while answering 200, and what refuses a new line with no text on it — a nested
  // shape you write at all has to be written whole, which shared/kinds.ts states and enforces.
  const incomplete = validateRecordData(kind, nextData)

  // ONE TRANSACTION, since the revision ledger. The change rows used to be written before the update
  // with nothing holding the two together, so an update that failed left rows in the log describing
  // an edit that never landed. The revision makes that intolerable rather than merely untidy — it
  // would be stored content the record never held — so all three are one write now.
  sqlite.transaction(() => {
    // One row per leaf, named by the item — not one row holding the whole checklist twice.
    for (const edit of edits) {
      logChange(recordId, 'update', actor, edit.path, edit.before, edit.after)
    }

    db.update(records).set({ data: nextData, updatedAt: now() }).where(eq(records.id, recordId)).run()
    saveRevision(recordId, 'update', actor, revisionNote)
  })()
  const after = getRecord(recordId)
  if (!after) throw new PanelError('The update did not take effect', 500)
  return { record: after, item: nextItem, partId, itemPatch: outcome, incomplete, appended: appending, ...overwritten }
}