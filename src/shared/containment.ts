// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RECORD IS PART OF, AND WHAT IS PART OF IT. ONE READER, THREE STORES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office stores containment in three different places, and until this file nothing joined them:
 *
 *   1. A pipeline's steps are an ordered array of record ids in `pipeline.data.blockIds`. See
 *      `blockIdsOf` in ./blocks.ts, which is the one statement of that rule.
 *   2. A module's checklist items are plain JSON objects in `module.data.parts[].items[]`. They
 *      have no record id. See `ProgressItem` in ./types.ts.
 *   3. Everything else uses the `part_of` link — "part of" read forward, "has part" read back.
 *      The live corpus holds 15 of these in the panelx project and 10 in the other project.
 *
 * `design/ROUND-FOUR-BUILD.md` decision 3 settled what to do about that: **this pass does not
 * migrate them.** Instead one function answers "what is this part of" and one answers "what is part
 * of this", and this file is the only code that knows there is more than one store. One reader, so
 * two callers cannot get two different answers to the same question.
 *
 * ---------------------------------------------------------------------------------------
 * A CHECKLIST ITEM IS NOT A RECORD, AND THIS FILE DOES NOT PRETEND IT IS
 * ---------------------------------------------------------------------------------------
 *
 * `links.from_id` and `links.to_id` are foreign keys to `records.id`. A checklist item has no row
 * in `records`, so nothing can link to it, it cannot be the parent of anything, and it cannot
 * appear in a list of parts here. That is a real answer and not a gap in this reader.
 *
 * So `partsOf` COUNTS the checklist items it cannot list and names them in `gaps`, the same way
 * `shared/deadlines.ts` names every input its totals could not count. A module with 12 checklist
 * items and no `part_of` children answers "no parts, and 12 checklist items that cannot be counted
 * here" — never "no parts".
 *
 * ---------------------------------------------------------------------------------------
 * EVERYTHING HERE IS PURE
 * ---------------------------------------------------------------------------------------
 *
 * No database, no server, no HTTP, no clock. The caller hands in the records and links it has
 * loaded, and the same input always gives the same answer. The answer never depends on the ORDER
 * the caller happened to pass its arrays in: parts and parents read from links are sorted by title
 * and then by id, and only a pipeline's stored order carries a position that means anything.
 *
 * WHAT THIS READER DOES NOT COMPLAIN ABOUT. A pipeline's stored order may hold an id that names a
 * record of the wrong kind, or one with no state word. `readPipelineBlocks` in ./blocks.ts already
 * reports both, loudly, and the pipeline page shows them. Containment is a different question — the
 * order still says that record is a step of that pipeline — so this file counts it and leaves those
 * complaints to the one reader that already makes them.
 */

import type { LinkType, PanelRecord } from './types.ts'
import { blockIdsOf, pipelinesByBlock, pipelinesHolding, storedEntries, type PipelinesByBlock } from './blocks.ts'

/**
 * The one link type that means containment. Typed as `LinkType`, so renaming the word in
 * ./types.ts is a compile error here rather than a reader that silently finds nothing.
 */
export const CONTAINMENT_LINK: LinkType = 'part_of'

/** The record kind whose stored order is the second containment store. */
const PIPELINE_KIND = 'pipeline'

/**
 * How deep this reader will walk, up or down, before it refuses to go further.
 *
 * TWENTY. The deepest containment anything in this product can mean is a handful of levels: a
 * pipeline holds blocks, a module holds tasks, and the owner's own hand-written plan went five
 * headings deep. A chain of twenty is not deep work, it is broken data.
 *
 * Exceeding it is a REFUSAL and never a quiet stop. `Walk.complete` is `false` and `Walk.stopped`
 * says in words that the answer is incomplete and why. A truncated list handed back as though it
 * were the whole chain is the fake success this product exists to prevent.
 */
export const MAX_CONTAINMENT_DEPTH = 20

// ============================================================================ what goes in

/**
 * One stored link, reduced to the four facts this reader needs.
 *
 * NOT A SECOND MODEL OF A LINK, for the same reason `BlockLinkRow` in ./blocks.ts is not: the two
 * callers hold a link in two different shapes, the server as a table row and the browser as its own
 * view model, and both can produce this in one line. `type` is a plain string because that is what
 * comes back out of the database; it is compared against `CONTAINMENT_LINK` and nothing else.
 */
export interface ContainmentLink {
  id: string
  fromId: string
  toId: string
  type: string
}

/**
 * Everything this reader is allowed to look at.
 *
 * `records` is every record the caller loaded and `links` is every link it has. Both are filtered
 * here rather than by the caller, so no page can hand in a different subset and get a different
 * answer. A record that is not in `records` is reported as not loaded, never guessed at.
 */
export interface ContainmentContext {
  records: readonly PanelRecord[]
  links: readonly ContainmentLink[]
}

// ============================================================================ what comes out

/** Which of the two record-to-record stores said this containment. */
export type ContainmentSource = 'pipeline order' | 'part of link'

/** How each store reads in a sentence, so two refusals cannot describe one store two ways. */
const SOURCE_PHRASE: Readonly<Record<ContainmentSource, string>> = {
  'pipeline order': 'the pipeline stores it as one of its steps',
  'part of link': 'a stored "part of" link says so',
}

/** What stands in for a title when the record at the other end was not handed to this reader. */
export function unloadedRecordName(id: string): string {
  return `a record that was not loaded (${id})`
}

/**
 * How one end of a containment is named in a sentence: its title and its id.
 *
 * ID IS IDENTITY AND TITLE IS PRESENTATION, so both are printed and neither stands alone. A record
 * that was not handed in is named by `unloadedRecordName` and gets no quotation marks, because
 * putting quotes round it would read as a record somebody titled that.
 */
function label(end: { id: string; title: string; record: PanelRecord | null }): string {
  return end.record === null ? unloadedRecordName(end.id) : `"${end.title}" (${end.id})`
}

/** One end of one containment: the record, which store says so, and where it sits. */
export interface Containment {
  /** The record id at the other end. This is the identity, and it never changes. */
  id: string
  /** The record itself, or null when the caller did not hand it to this reader. */
  record: PanelRecord | null
  /** What to print: the record's title, or `unloadedRecordName` when there is no record. */
  title: string
  /** Which store says this containment. */
  via: ContainmentSource
  /** The `part_of` link row, when one exists. Null when only a pipeline's stored order says it. */
  linkId: string | null
  /** True when the record at the other end is soft-deleted. Null when it was not handed in. */
  deleted: boolean | null
  /** 1-based place in the pipeline's stored order. Null when a link is what says it. */
  position: number | null
}

/** A containment this reader could not count, named. */
export interface ContainmentGap {
  /**
   * WHICH OF THE FOUR IT IS, so a page can say it in its reader's language (a review's scope gaps, wave 13r round
   * 18). `reason` is the same thing in English, with the ids, worked out at the same place.
   */
  code: 'checklist' | 'notAnId' | 'namedTwice' | 'partOfTwo'
  /** The numbers a page's sentence needs: the checklist's items, or the places in a pipeline's stored order. */
  values: { n?: number; position?: number; first?: number }
  /** What was left out, and why, in plain words. */
  reason: string
  /** How many things this covers. At least 1. */
  count: number
  /** The record ids involved. Empty for checklist items, which have no record id. */
  recordIds: string[]
}

/**
 * What one record is part of.
 *
 * `parent` is derived from `parents` and is never a pick between two. When two stores each name a
 * parent — or two `part_of` links do — `parent` is null and `conflict` is a sentence naming every
 * one of them. Choosing one of two stored parents would be a made-up answer, and a record with two
 * parents is a data problem somebody has to see.
 */
export interface ParentReading {
  /** Everything that says it holds this record, sorted by title and then by id. */
  parents: Containment[]
  /** The one parent, or null when there is none and when there is more than one. */
  parent: Containment | null
  /** Names every parent when there is more than one. Null when there is at most one. */
  conflict: string | null
}

/** What is part of one record, and what could not be counted. */
export interface PartsReading {
  /**
   * Everything part of this record. A pipeline's steps come first, IN ITS STORED ORDER; anything
   * else — including a `part_of` link into a pipeline that its order does not mention — follows,
   * sorted by title and then by id.
   */
  parts: Containment[]
  /** Every containment this list could not carry, named. Empty means nothing was left out. */
  gaps: ContainmentGap[]
}

/** One step of a walk up or down, with how far from the starting record it is. */
export interface ChainStep extends Containment {
  /** 1 is the immediate parent, or an immediate part. */
  depth: number
}

interface WalkBody {
  /** The chain, nearest first. Read `complete` before trusting it to be the whole chain. */
  steps: ChainStep[]
  /** Everything the walk could not count, named. */
  gaps: ContainmentGap[]
}

/**
 * A walk up or down the containment chain.
 *
 * `complete: false` means the answer is SHORT and `stopped` says why in words a person can read.
 * The two cannot disagree, because they are one union rather than two fields.
 */
export type Walk = (WalkBody & { complete: true }) | (WalkBody & { complete: false; stopped: string; stoppedBy: WalkStop })

/** Why a walk stopped short, as a code beside `stopped`: the depth limit, two parents, a loop, a record not handed in. */
export type WalkStop = 'tooDeep' | 'twoParents' | 'loop' | 'notHanded'

// ============================================================================ refusing a write

/** Why a `part_of` write is refused. */
export type RefusalReason =
  /** Both ends are the same record. */
  | 'itself'
  /** The link would put a record inside something that is already inside it. */
  | 'loop'
  /** The record already has a parent, from either store. */
  | 'second parent'
  /** The check could not be made, so it refuses rather than passing. */
  | 'not checked'

/**
 * The answer to one question a `part_of` write has to ask.
 *
 * A refusal always carries a SENTENCE THAT NAMES THE RECORDS, because "this is not allowed" with no
 * names tells the person reading it nothing about what to do next. It also carries the record ids,
 * so a screen can link to them rather than match on a title — titles may repeat, ids may not.
 *
 * `'not checked'` is a refusal and not a pass. If the records this needs were not handed to it, it
 * cannot say whether the write is safe, and answering "allowed" would be a guess in the one
 * direction that writes bad data.
 */
export type PartOfCheck =
  | { refuse: false }
  | { refuse: true; why: RefusalReason; sentence: string; recordIds: string[] }

// ============================================================================ the index

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

interface Index {
  records: readonly PanelRecord[]
  byId: Map<string, PanelRecord>
  /** `part_of` links out of a record: child id -> the links saying what it is part of. */
  up: Map<string, ContainmentLink[]>
  /** `part_of` links into a record: parent id -> the links saying what is part of it. */
  down: Map<string, ContainmentLink[]>
  /** Block id -> the pipelines whose stored order names it, read once from `records`. */
  holders: PipelinesByBlock
}

/**
 * The lookups this reader walks over, built from one context.
 *
 * A caller that walks many records over the same records and links builds this once with
 * `containmentIndexOf` and hands it to `ancestorsIn`. Building it again for every record read every
 * record and every link again each time: on a copy of the owner's office that was most of the 5 to 9
 * seconds GET /api/work took (problem zo_hyUBLSAVJ, 25 September 2026). The answer is the same either way,
 * because `ancestorsOf` is `ancestorsIn` over an index built from its own context.
 *
 * Build it only with `containmentIndexOf`, so its lookups always agree with the records and links
 * it was built from. It holds what the caller handed in and nothing newer: GET /api/work builds one
 * per request and drops it with the request.
 */
export type ContainmentIndex = Readonly<Index>

/** Builds the lookups once, for a caller that walks many records over the same context. */
export function containmentIndexOf(context: ContainmentContext): ContainmentIndex {
  return indexOf(context)
}

function indexOf(context: ContainmentContext): Index {
  const byId = new Map<string, PanelRecord>()
  for (const record of context.records) byId.set(record.id, record)
  const up = new Map<string, ContainmentLink[]>()
  const down = new Map<string, ContainmentLink[]>()
  for (const link of context.links) {
    if (link.type !== CONTAINMENT_LINK) continue
    const out = up.get(link.fromId)
    if (out === undefined) up.set(link.fromId, [link])
    else out.push(link)
    const into = down.get(link.toId)
    if (into === undefined) down.set(link.toId, [link])
    else into.push(link)
  }
  return { records: context.records, byId, up, down, holders: pipelinesByBlock(context.records) }
}

function containment(
  id: string,
  ix: Index,
  via: ContainmentSource,
  linkId: string | null,
  position: number | null,
): Containment {
  const record = ix.byId.get(id) ?? null
  return {
    id,
    record,
    title: record === null ? unloadedRecordName(id) : record.title,
    via,
    linkId,
    deleted: record === null ? null : record.deletedAt !== null,
    position,
  }
}

/**
 * A stable order for containments that no store puts in an order: by title, then by id.
 *
 * It cannot depend on the order the caller passed its links in, because that is a query's order and
 * two callers query differently. Title is what a reader recognises; id breaks the tie, because
 * titles may repeat and an id may not.
 */
function byTitleThenId(a: Containment, b: Containment): number {
  if (a.title !== b.title) return a.title < b.title ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Where in a pipeline's stored order this id sits, counting from 1. */
function positionIn(pipeline: PanelRecord, id: string): number {
  return blockIdsOf(pipeline).indexOf(id) + 1
}

/**
 * How many checklist items a record holds, and in how many parts.
 *
 * The kind is not checked, because a checklist is a checklist wherever a record keeps one — the
 * same reading `shared/attention.ts` makes when it builds its candidates. The SHAPE is declared
 * once, as `ModulePart` and `ProgressItem` in ./types.ts and as the `parts` field in
 * ./kinds.ts, which is what validates every write.
 */
function checklistSize(record: PanelRecord): { items: number; parts: number } {
  const data = isObj(record.data) ? record.data : {}
  const raw = Array.isArray(data['parts']) ? data['parts'] : []
  let items = 0
  let parts = 0
  for (const part of raw) {
    if (!isObj(part)) continue
    parts += 1
    const list = Array.isArray(part['items']) ? part['items'] : []
    for (const item of list) if (isObj(item)) items += 1
  }
  return { items, parts }
}

const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`

/** The gap a record's checklist is, or null when it holds no checklist items. */
function checklistGap(record: PanelRecord): ContainmentGap | null {
  const size = checklistSize(record)
  if (size.items === 0) return null
  return {
    code: 'checklist',
    values: { n: size.items },
    reason:
      `"${record.title}" (${record.id}) holds ${plural(size.items, 'checklist item', 'checklist items')} ` +
      `in ${plural(size.parts, 'part', 'parts')}. A checklist item is not a record, so nothing can link ` +
      `to it and it cannot be listed here. Open the record itself to see them.`,
    count: size.items,
    recordIds: [],
  }
}

// ============================================================================ reading

/** Everything that says it holds this id, from both record-to-record stores. */
function parentsFor(id: string, ix: Index): Containment[] {
  const parents: Containment[] = []
  for (const pipeline of pipelinesHolding(id, ix.records, ix.holders)) {
    parents.push(containment(pipeline.id, ix, 'pipeline order', null, positionIn(pipeline, id)))
  }
  for (const link of ix.up.get(id) ?? []) {
    parents.push(containment(link.toId, ix, 'part of link', link.id, null))
  }
  return parents.sort(byTitleThenId)
}

function parentReadingFor(id: string, ix: Index): ParentReading {
  const parents = parentsFor(id, ix)
  if (parents.length <= 1) return { parents, parent: parents[0] ?? null, conflict: null }
  const named = parents.map((p) => `${label(p)}, because ${SOURCE_PHRASE[p.via]}`).join('; ')
  // Always plural: this branch only runs when there are two or more.
  return {
    parents,
    parent: null,
    conflict:
      `${String(parents.length)} things say they hold ${nameOf(id, ix)}, and a record is part of one ` +
      `thing. They are: ${named}. Mole Office will not choose between them.`,
  }
}

/**
 * The one thing this record is part of.
 *
 * A MODULE'S CHECKLIST ITEM CAN NEVER BE THE ANSWER. An item is a JSON object inside
 * `module.data.parts[].items[]` with no row in `records`, so no link can point at it and no stored
 * order can name it. If a piece of work belongs under a checklist item, nothing in Mole Office records
 * that today, and this reader says so by leaving it out rather than by inventing a parent.
 */
export function parentOf(record: PanelRecord, context: ContainmentContext): ParentReading {
  return parentReadingFor(record.id, indexOf(context))
}

function partsFor(record: PanelRecord, ix: Index): PartsReading {
  const parts: Containment[] = []
  const gaps: ContainmentGap[] = []
  const listed = new Set<string>()

  // A pipeline's own steps, IN ITS STORED ORDER, which is the only order here that means anything.
  if (record.kind === PIPELINE_KIND) {
    const entries = storedEntries(record)
    entries.forEach((entry, at) => {
      const position = at + 1
      if (entry.id === null) {
        gaps.push({
          code: 'notAnId',
          values: { position },
          reason:
            `Position ${String(position)} of this pipeline's stored order holds ` +
            `${JSON.stringify(entry.raw)}, which is not a record id. Nothing can be counted for it.`,
          count: 1,
          recordIds: [],
        })
        return
      }
      if (listed.has(entry.id)) {
        const first = blockIdsOf(record).indexOf(entry.id) + 1
        gaps.push({
          code: 'namedTwice',
          values: { position, first },
          reason:
            `Position ${String(position)} of this pipeline's stored order names the same record as ` +
            `position ${String(first)}. It is counted once.`,
          count: 1,
          recordIds: [entry.id],
        })
        return
      }
      listed.add(entry.id)
      // A step whose record was not handed to this reader is still a step. It is listed with the
      // plain words that say it was not loaded, never dropped and never given an invented title.
      parts.push(containment(entry.id, ix, 'pipeline order', null, position))
    })
  }

  // Everything linked as part of it. A link into a pipeline that its stored order does not mention
  // is real containment and is counted; one that the order already names is counted once, and the
  // stored order is what carries its place.
  const linked: Containment[] = []
  for (const link of ix.down.get(record.id) ?? []) {
    if (listed.has(link.fromId)) continue
    listed.add(link.fromId)
    linked.push(containment(link.fromId, ix, 'part of link', link.id, null))
  }
  parts.push(...linked.sort(byTitleThenId))

  const checklist = checklistGap(record)
  if (checklist !== null) gaps.push(checklist)
  return { parts, gaps }
}

/**
 * Everything part of this record, in a stable order, with whatever could not be counted named.
 *
 * For a pipeline that is its steps in `blockIds` order. For everything else it is the `part_of`
 * links pointing at it. A module's checklist items are counted in `gaps` and cannot be listed —
 * see the note at the top of this file.
 */
export function partsOf(record: PanelRecord, context: ContainmentContext): PartsReading {
  return partsFor(record, indexOf(context))
}

// ============================================================================ walking

/** How the walk says it gave up, with the record it gave up at named. */
function stoppedSentence(at: string, why: string): string {
  return `The chain is not complete. Walking stopped at ${at}: ${why}`
}

/**
 * Everything this record is part of, nearest first.
 *
 * The walk stops, and says so, on any of four things: a parent that is not one parent, a record
 * that was not handed in, a loop already in the stored data, and `MAX_CONTAINMENT_DEPTH`. None of
 * them is a silent stop, because a short chain reported as the whole chain is a false answer about
 * where a piece of work sits.
 *
 * `gaps` is always empty here, and that is the honest empty rather than a missing feature: what is
 * above a record cannot be a checklist item, and nothing else in the two stores goes uncounted.
 */
export function ancestorsOf(record: PanelRecord, context: ContainmentContext): Walk {
  return ancestorsIn(record, indexOf(context))
}

/** `ancestorsOf` over an index the caller built once with `containmentIndexOf`. */
export function ancestorsIn(record: PanelRecord, ix: ContainmentIndex): Walk {
  const steps: ChainStep[] = []
  const seen = new Set<string>([record.id])
  let at = nameOf(record.id, ix)
  let current = record.id

  for (let depth = 1; ; depth += 1) {
    if (depth > MAX_CONTAINMENT_DEPTH) {
      return {
        steps,
        gaps: [],
        complete: false,
        stoppedBy: 'tooDeep',
        stopped: stoppedSentence(
          at,
          `this reader walks ${String(MAX_CONTAINMENT_DEPTH)} levels and no further, and the chain ` +
            `is longer than that. Nothing above this record is in the answer. A containment chain ` +
            `this deep is almost certainly wrong data rather than deep work.`,
        ),
      }
    }
    const reading = parentReadingFor(current, ix)
    if (reading.conflict !== null) {
      return { steps, gaps: [], complete: false, stoppedBy: 'twoParents', stopped: stoppedSentence(at, reading.conflict) }
    }
    const parent = reading.parent
    if (parent === null) return { steps, gaps: [], complete: true }
    if (seen.has(parent.id)) {
      return {
        steps,
        gaps: [],
        complete: false,
        stoppedBy: 'loop',
        stopped: stoppedSentence(
          at,
          `${label(parent)} is above it and is also below it, so the stored data ` +
            `holds a loop. The walk stops rather than going round it.`,
        ),
      }
    }
    steps.push({ ...parent, depth })
    if (parent.record === null) {
      return {
        steps,
        gaps: [],
        complete: false,
        stoppedBy: 'notHanded',
        stopped: stoppedSentence(
          label(parent),
          'that record was not handed to this reader, so nothing can be said about what is above it.',
        ),
      }
    }
    seen.add(parent.id)
    at = nameOf(parent.id, ix)
    current = parent.id
  }
}

/**
 * Everything part of this record, and everything part of those, nearest first.
 *
 * Depth-first, so a record is followed by its own parts before its next sibling — the order a
 * reader would draw an indented list in. Every checklist item met on the way is counted in `gaps`.
 * A loop in the stored data stops the walk with a sentence, and so does the depth limit.
 */
export function descendantsOf(record: PanelRecord, context: ContainmentContext): Walk {
  const ix = indexOf(context)
  const steps: ChainStep[] = []
  const gaps: ContainmentGap[] = []
  const listed = new Set<string>()
  const stack: { part: Containment; depth: number; above: string[] }[] = []

  const first = partsFor(record, ix)
  gaps.push(...first.gaps)
  for (let at = first.parts.length - 1; at >= 0; at -= 1) {
    stack.push({ part: first.parts[at]!, depth: 1, above: [record.id] })
  }

  while (stack.length > 0) {
    const next = stack.pop()!
    // A LOOP: this record is already one of the records above it on this branch.
    if (next.above.includes(next.part.id)) {
      return {
        steps,
        gaps,
        complete: false,
        stoppedBy: 'loop',
        stopped: stoppedSentence(
          label(next.part),
          'that record is already above itself here, so the stored data holds a loop. The walk ' +
            'stops rather than going round it.',
        ),
      }
    }
    // NOT A LOOP, AND NOT THE SAME THING: the record is part of two different things, so this walk
    // reaches it twice. It is listed once and the second parent is named, because listing it twice
    // would count one piece of work twice in everything built on this.
    if (listed.has(next.part.id)) {
      gaps.push({
        code: 'partOfTwo',
        values: {},
        reason:
          `${label(next.part)} is part of more than one thing, so it is reached ` +
          `twice here. It is listed once, under the first. A record is part of one thing, so this is ` +
          `a data problem somebody has to fix.`,
        count: 1,
        recordIds: [next.part.id],
      })
      continue
    }
    listed.add(next.part.id)
    steps.push({ ...next.part, depth: next.depth })
    if (next.part.record === null) continue
    const below = partsFor(next.part.record, ix)
    gaps.push(...below.gaps)
    if (below.parts.length === 0) continue
    if (next.depth === MAX_CONTAINMENT_DEPTH) {
      return {
        steps,
        gaps,
        complete: false,
        stoppedBy: 'tooDeep',
        stopped: stoppedSentence(
          label(next.part),
          `this reader walks ${String(MAX_CONTAINMENT_DEPTH)} levels and no further, and there is ` +
            `more below this record. Nothing under it is in the answer.`,
        ),
      }
    }
    const above = [...next.above, next.part.id]
    for (let at = below.parts.length - 1; at >= 0; at -= 1) {
      stack.push({ part: below.parts[at]!, depth: next.depth + 1, above })
    }
  }
  return { steps, gaps, complete: true }
}

// ============================================================================ the two questions

/** The same phrase as `label`, for a caller that has an id rather than a containment. */
function nameOf(id: string, ix: Index): string {
  const record = ix.byId.get(id) ?? null
  return label({ id, title: record === null ? unloadedRecordName(id) : record.title, record })
}

function notChecked(sentence: string, recordIds: string[]): PartOfCheck {
  return { refuse: true, why: 'not checked', sentence, recordIds }
}

/**
 * Would a `part_of` link from `fromId` to `toId` put a record inside something already inside it?
 *
 * `fromId` is the record that would become a part; `toId` is what it would be part of — the same
 * direction the link is stored in, and the same direction "part of" reads.
 *
 * IT REFUSES WHEN IT CANNOT CHECK. If either record was not handed in, or the walk up from `toId`
 * stopped short, this answers `'not checked'` rather than "allowed". Passing a write because the
 * check could not run is how the loop gets stored.
 */
export function wouldMakeCycle(fromId: string, toId: string, context: ContainmentContext): PartOfCheck {
  const ix = indexOf(context)
  if (fromId === toId) {
    return {
      refuse: true,
      why: 'itself',
      sentence: `A record cannot be part of itself. Both ends of this link are ${nameOf(fromId, ix)}.`,
      recordIds: [fromId],
    }
  }
  const from = ix.byId.get(fromId)
  const to = ix.byId.get(toId)
  if (from === undefined || to === undefined) {
    const missing = [from === undefined ? fromId : null, to === undefined ? toId : null].filter(
      (id): id is string => id !== null,
    )
    return notChecked(
      `Mole Office did not check this link for a loop. ${plural(missing.length, 'record was', 'records were')} ` +
        `not handed to the check: ${missing.join(', ')}. The link is refused rather than allowed, because ` +
        `a check that did not run says nothing about whether the link is safe.`,
      missing,
    )
  }

  // Walk up from the far end. If the record that would become the part is already above it, the
  // link closes a loop.
  const above = ancestorsOf(to, context)
  const hit = above.steps.findIndex((step) => step.id === fromId)
  if (hit !== -1) {
    // Every id from the far end up to the record that would become the part, in order.
    const loop = [toId, ...above.steps.slice(0, hit + 1).map((step) => step.id)]
    const already = loop
      .slice(0, -1)
      .map((id, at) => `${nameOf(id, ix)} is part of ${nameOf(loop[at + 1]!, ix)}`)
      .join(', and ')
    return {
      refuse: true,
      why: 'loop',
      sentence:
        `This link would make a loop. Already: ${already}. Making ${nameOf(fromId, ix)} part of ` +
        `${nameOf(toId, ix)} would put each of them inside the other.`,
      recordIds: loop,
    }
  }
  if (!above.complete) {
    return notChecked(
      `Mole Office did not check this link for a loop. ${above.stopped} Until that is fixed the link is ` +
        `refused, because the records above ${nameOf(toId, ix)} are not all known.`,
      [toId],
    )
  }
  return { refuse: false }
}

/**
 * Does this record already have a parent, in either store?
 *
 * A record is part of one thing. The answer names what already holds it, says which store says so,
 * and says what to remove to free it — a refusal that does not tell the reader what to do next is
 * useless to them.
 */
export function hasParentAlready(fromId: string, context: ContainmentContext): PartOfCheck {
  const ix = indexOf(context)
  if (!ix.byId.has(fromId)) {
    return notChecked(
      `Mole Office did not check what this record is already part of. No record with the id ${fromId} was ` +
        `handed to the check, so it cannot say whether this would be a second parent.`,
      [fromId],
    )
  }
  const reading = parentReadingFor(fromId, ix)
  if (reading.parents.length === 0) return { refuse: false }

  const recordIds = [fromId, ...reading.parents.map((p) => p.id)]
  if (reading.conflict !== null) {
    return {
      refuse: true,
      why: 'second parent',
      sentence:
        `${nameOf(fromId, ix)} already has more than one parent, which should not have happened. ` +
        `${reading.conflict} Fix that before adding another.`,
      recordIds,
    }
  }
  const parent = reading.parents[0]!
  const remove =
    parent.via === 'pipeline order'
      ? `Take it out of that pipeline's steps first.`
      : `Remove the stored "part of" link (${parent.linkId ?? 'no id'}) first.`
  const deleted =
    parent.deleted === true
      ? ` That record has been deleted and the containment is still stored, which is why it still counts.`
      : ''
  const where =
    parent.position === null
      ? `${nameOf(parent.id, ix)}, because ${SOURCE_PHRASE[parent.via]}`
      : `step ${String(parent.position)} of the pipeline ${nameOf(parent.id, ix)}`
  return {
    refuse: true,
    why: 'second parent',
    sentence:
      `${nameOf(fromId, ix)} is already part of ${where}. A record is part of one thing.${deleted} ${remove}`,
    recordIds,
  }
}
