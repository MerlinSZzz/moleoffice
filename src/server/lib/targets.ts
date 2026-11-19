// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * IS THE THING SOMEBODY POINTED AT STILL THERE, AND WHAT TEXT DOES IT HOLD?
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * src/shared/targets.ts declares the things a person can point at: what identifies each,
 * whether it holds text, and what to call it in a sentence. It runs in the browser and knows nothing
 * about the database.
 *
 * This is the other half. `TARGET_READERS` below is a TOTAL MAP over the same kind words, so a new
 * entry in the declaration does not compile until somebody has said how to look it up. There is no
 * default arm and no fallback: a kind nothing can resolve yet answers `unknown` WITH THE SENTENCE
 * SAYING SO, and the write path refuses it. That is the difference between "Mole Office looked and
 * it is not there" and "Mole Office has not been taught to look", and USER.md's fifth invariant is
 * that the two may never draw the same.
 *
 * ---------------------------------------------------------------------------------------
 * FIELD PATHS, SO A QUOTE CAN BE LOOKED FOR AGAIN
 * ---------------------------------------------------------------------------------------
 *
 * Every string a target holds comes back with the path it was found at, written from the RECORD
 * down: `title`, `summary`, `data.blocks[#b-1].text`, `data.blocks[#b-1].rows[1].cells[0]`. `#id`
 * means the element with that id rather than the element at that index, which is the same spelling
 * the change log uses for a checklist line. Those paths are what a span stores as `field`, and what
 * an element on screen carries as `data-text-field`.
 *
 * A ROW AND A COLUMN ARE COUNTED FROM 1 IN A TARGET AND FROM 0 IN A PATH. A person says "row 2" and
 * a stored array is indexed from 0; both are true and the conversion happens once, in `tableAt`
 * below. Anything else means a number on the screen that does not match the number in the target.
 */

import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { agentMessages, agentThreads, changes } from '../db/schema.ts'
import { SHOWN_CHARACTERS, shortenToWords } from '@shared/shortening.ts'
import {
  isPlanLineFact,
  nameTarget,
  PLAN_LINE_FACTS,
  placeNeedsText,
  seenRuleFor,
  spanNamedBy,
  projectNamedByTarget,
  targetSpec,
  viewRuleFor,
  withThePlaceItNames,
  WHY_AN_ACTION_INSIDE_A_READING_HAS_NO_IDENTITY,
  WHY_A_DRAFT_IS_NOT_ON_THE_SERVER,
  type Context,
  type Span,
  type Target,
  type TargetKind,
} from '@shared/targets.ts'
// WHO MADE A WRITE, in the three words the whole product attributes with. `checkView` below is the
// one reader: a view is evidence about a screen and an agent has none. Type-only.
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { en } from '@shared/words/en.ts'
import type { ActorType, RecordKind } from '@shared/types.ts'
import { byId, pathStep } from '@shared/fielddiff.ts'
import { A_MESSAGE_QUOTES_IN_TARGET_OR_IN_QUOTES } from '@shared/messages.ts'
import { theProjectsAReaderMayRead } from '../db/the-projects-a-reader-may-read.ts'
import type { AMessageReader } from './messages.ts'
import { getRecord, recordInWorkspace, resolveLinks } from './records.ts'
import { PanelError } from './panel-error.ts'
// WHICH PROJECTS THIS INSTALLATION HOLDS. Read by the one refusal below that is about a project
// rather than about a thing: a lead may name another project, so the name has to be one.
import { getWorkspace } from '../db/get-workspace.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
import { linesWithWork } from './plans.ts'
import { getPlan } from './get-plan.ts'
import { linesOf } from '../db/lines-of.ts'
import { parsePlanLine } from '@shared/planline.ts'
import { getWindow } from '../db/get-window.ts'
import { contentOf } from './version.ts'
import { revisions } from '../db/schema.ts'
import { isSurfaceId, surfaceLabel } from '../../shared/surfaces'
import {
  findRegion,
  identityOf,
  namesOfParts,
  offsetOf,
  parseRegionId,
  regionHolding,
  regionIdOfLegacyTarget,
  recordRegionsOf,
  regionsInField,
  sectionRegionId,
  summaryOf,
  whereAPartIs,
  type HolderInASentence,
  type Region,
  type RegionId,
  type RegionSummary,
} from '@shared/regions.ts'
// THE THREE OLD SPELLINGS OF A PART OF A REPORT, from the file that counts them. `theRegionItNames`
// below turns each one into a region at the door, and the list it works from is the same list the
// start-up gate refuses over — one fact in one place, so a fourth spelling could not be added to
// the count without the door converting it.
import { OLD_PART_KINDS, type OldPartKind } from '../db/contexts-to-regions.ts'
import { blocksFieldOf, whatHoldsBlocks } from '@shared/kinds.ts'
// THE SECTIONS NO PAGE DRAWS, declared beside the sections themselves. `checkTarget` refuses them.
import { SECTIONS_NO_PAGE_DRAWS } from '@shared/sections.ts'
import { changeVerb, kindWord } from '@shared/words.ts'
// WHICH ADDRESSES THIS APP REALLY HAS. The one grammar, which the shell reads to decide which page
// to draw and this door reads to decide whether a lead may point at it. Criterion M97; see the page
// branch of `checkTarget`.
import { parseRoute } from '@shared/addresses.ts'

// ============================================================================ what a read answers

/** One stored string, and the path it was found at. */
export interface StoredString {
  field: string
  text: string
}

/** What a target holds, once Mole Office has looked it up. */
export interface TargetText {
  /** What it is, as a sentence a person reads: `the report "Round six"`. */
  about: string
  /** Every string it holds, with the path each was found at. Empty is a real answer. */
  strings: StoredString[]
}

/**
 * Whether a target could be looked up, in three answers.
 *
 * `found`   — it is there, and here is what it holds.
 * `gone`    — Mole Office looked and it is not there, or it has been deleted.
 * `changed` — THE THING IT NAMES IS NOT WHERE IT WAS, AND THE PART OF THE REPORT THAT IS THERE NOW
 *             IS HANDED BACK. Only a region answers this today. A region deeper than a block is
 *             named by where its characters start, so inserting one character above it means no
 *             region starts at the named offset any more. `gone` would be false — the record, the
 *             block and the field are all still there — and `found` would be a lie about which
 *             characters the comment was written on. `what` is the region that covers the offset
 *             now, or the field's own region when nothing covers it.
 * `unknown` — MOLE OFFICE CANNOT LOOK THIS KIND OF THING UP YET, so it cannot say either way. It is not
 *             a fourth kind of absence: it is the absence of a LOOK. Reporting it as `gone` would
 *             be a guess about somebody's work, and reporting it as `found` would be a lie.
 *
 * IT IS A UNION AND THAT IS THE POINT. Every caller of `resolveTarget` stops compiling until it
 * says what it does with the new answer. There are three and all three say so in their own words.
 */
export type TargetResolution =
  | { answer: 'found'; text: TargetText }
  | { answer: 'gone'; about: string }
  | { answer: 'changed'; text: TargetText; what: RegionSummary }
  | { answer: 'unknown'; about: string; why: string }

type Reader<K extends TargetKind> = (target: Extract<Target, { kind: K }>) => TargetResolution

// ============================================================================ reading strings

/**
 * Every string inside a value, with the path it was found at.
 *
 * ---------------------------------------------------------------------------------------
 * IT NAMES A PATH THE WAY THE CHANGE LOG NAMES ONE, AND THAT IS NOT A PREFERENCE
 * ---------------------------------------------------------------------------------------
 *
 * An array whose every entry carries an `id` is addressed by that id — `data.blocks[#b-1].text` —
 * and any other array by index. `pathStep` and `byId` in src/shared/fielddiff.ts are the rule, and
 * they are imported rather than reimplemented, because a change row saying `data.blocks[#b-1].text`
 * beside a stored span saying `data.blocks[0].text` would be two spellings of one path.
 *
 * IT WAS INDEX-ONLY AND THAT COST A REAL ANSWER. `readWrittenAgainst` looks the span's `field` up in
 * the revision it was written against, and the block reader had already named that field
 * `data.blocks[#b-1].text`. The two never matched, so Mole Office had the old text in its hand and
 * reported that it could not find the field.
 */
export function stringsIn(value: unknown, path: string, out: StoredString[]): void {
  if (typeof value === 'string') {
    out.push({ field: path, text: value })
    return
  }
  if (Array.isArray(value)) {
    const identified = byId(value)
    if (identified !== null) {
      for (const [id, item] of identified) stringsIn(item, `${path}[#${id}]`, out)
      return
    }
    for (const [n, item] of value.entries()) stringsIn(item, `${path}[${String(n)}]`, out)
    return
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      stringsIn(item, pathStep(path, key), out)
    }
  }
}

/** The strings a whole record holds: its title, its summary when it has one, and all of its data. */
function stringsOfRecord(record: { title: string; summary: string | null; data: Record<string, unknown> }): StoredString[] {
  const strings: StoredString[] = [
    { field: 'title', text: record.title },
    ...(record.summary === null ? [] : [{ field: 'summary', text: record.summary }]),
  ]
  stringsIn(record.data, 'data', strings)
  return strings
}

// ============================================================================ blocks and tables

/**
 * WHICH FIELD HOLDS A RECORD'S BLOCKS is asked of `blocksFieldOf` in src/shared/kinds/type-reader.ts and is not
 * written out here.
 *
 * It used to be a two-entry map in this file — `{ report: 'blocks', module: 'summaryBlocks' }` —
 * which is the same fact as the declaration in kinds.ts, free to disagree with it. A record kind
 * given a block field there would have kept resolving to "holds no blocks at all" here, with
 * nothing failing. `blocksFieldOf` finds the field whose declared type is `SummaryBlock[]`, so it
 * reads the declaration instead of restating it, and the region derivation below asks the same
 * function.
 */

interface FoundBlock {
  /** The block object as stored. */
  block: Record<string, unknown>
  /** The path of the block inside the record: `data.blocks[#b-1]`. */
  path: string
  /** What the record is called, for the sentence. */
  recordTitle: string
  recordKind: string
}

/** One block of a record's blocks, by its own id, or the reason it could not be found. */
function findBlock(recordId: string, blockId: string): FoundBlock | { missing: string } {
  const record = getRecord(recordId)
  if (record === null || record.deletedAt !== null) {
    return { missing: `no record answers to ${recordId}` }
  }
  const field = blocksFieldOf(record.kind)
  if (field === null) {
    return {
      missing:
        `"${record.title}" is a ${record.kind}, and a ${record.kind} holds no blocks. What does: ` +
        `${whatHoldsBlocks()}`,
    }
  }
  const held = record.data[field]
  if (!Array.isArray(held)) {
    return { missing: `"${record.title}" holds no \`${field}\`, so it has no blocks at all` }
  }
  const block = held.find(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item) && (item as Record<string, unknown>)['id'] === blockId,
  )
  if (block === undefined) {
    const ids = held
      .map((item) => (typeof item === 'object' && item !== null ? (item as Record<string, unknown>)['id'] : null))
      .filter((id): id is string => typeof id === 'string')
    return {
      missing:
        `"${record.title}" has no block with the id ${blockId}` +
        (ids.length === 0 ? '' : `; the blocks it has are ${ids.join(', ')}`),
    }
  }
  return { block, path: `data.${field}[#${blockId}]`, recordTitle: record.title, recordKind: record.kind }
}

/** The rows of a block, when it is a table block. */
function tableRows(block: Record<string, unknown>): unknown[] | null {
  if (block['type'] !== 'table') return null
  const rows = block['rows']
  return Array.isArray(rows) ? rows : null
}

/**
 * The cells of one row of a table block, by the row's POSITION COUNTED FROM 1.
 *
 * The conversion from what a person says to what an array holds happens here and nowhere else.
 */
function tableAt(block: Record<string, unknown>, rowKey: string): { cells: unknown[]; index: number } | { missing: string } {
  const rows = tableRows(block)
  if (rows === null) return { missing: `block ${String(block['id'] ?? '')} is not a table` }
  const position = Number(rowKey)
  if (!Number.isInteger(position) || position < 1) {
    return { missing: `"${rowKey}" is not a row number — rows are counted from 1` }
  }
  const row = rows[position - 1]
  if (row === undefined) {
    return { missing: `that table has ${String(rows.length)} row${rows.length === 1 ? '' : 's'} and no row ${rowKey}` }
  }
  const cells = typeof row === 'object' && row !== null ? (row as Record<string, unknown>)['cells'] : null
  if (!Array.isArray(cells)) return { missing: `row ${rowKey} of that table holds no cells` }
  return { cells, index: position - 1 }
}

/**
 * ONE RECORD'S PARTS, AS EVERYTHING A SENTENCE ABOUT ONE OF THEM NEEDS, DERIVED ONCE.
 *
 * `names` is a function rather than a map because most resolves never name a part — they answer
 * `gone` — and `namesOfParts` walks the whole record. It is worked out on the first ask and kept,
 * so the two callers below that both want it pay for it once.
 */
interface RegionTree {
  root: Region
  kind: RecordKind
  /** The record this tree is of, in the pieces `whereAPartIs` builds a sentence from. */
  holder: HolderInASentence
  /** Which part each one IS, in a reader's words — `namesOfParts`, asked of this tree. */
  names: () => ReadonlyMap<RegionId, string>
}

/**
 * THE REGION TREE OF ONE RECORD, or null when the record is not there.
 *
 * ---------------------------------------------------------------------------------------
 * IT ASKS `recordRegionsOf`, AND WHAT THAT CHANGED
 * ---------------------------------------------------------------------------------------
 *
 * It used to call `regionsOf`, which derives the parts of a REPORT BODY and nothing else. Two
 * things followed from that, and both were faults a person could meet.
 *
 * A RECORD OF ANY OTHER KIND ANSWERED `null` AND THEREFORE `gone`. `blocksFieldOf` finds a block
 * field on `report` and `module` only, so the other 24 kinds had no tree at all — a comment
 * anchored to a section of a decision would have been told the part is not there.
 *
 * A SECTION ID PARSED AND THEN RESOLVED TO NOTHING. `section.summary` is a name this product's own
 * grammar accepts, and the tree searched for it held no section, so `checkTarget` accepted the name
 * and then answered `gone` about a panel a reader is looking at.
 *
 * `recordRegionsOf` is the tree the browser draws from — sections, the record's own written fields,
 * and the report body under its section with every id beneath it unchanged. One derivation, so the
 * server cannot come to a different answer about a record's parts than the screen did.
 */
function regionTreeOf(recordId: string): RegionTree | null {
  const record = getRecord(recordId)
  if (record === null || record.deletedAt !== null) return null
  const root = recordRegionsOf({
    kind: record.kind,
    data: record.data,
    // THE RECORD'S OWN TITLE, WHICH IS READING LENGTH 2 ON A KIND WITH A READING LADDER. Same
    // column, same rule as the summary below: it is not in `data`, and `stringsOfRecord` above
    // reads it under the same name, so the section's characters and the record's own strings are
    // one string read once.
    title: record.title,
    // THE ONE-LINE SUMMARY, WHICH IS A COLUMN AND NOT A KEY OF `data`. `stringsOfRecord` above
    // reads the same field under the same name, so the section's characters and the record's own
    // strings are one string read once.
    summary: record.summary,
    // THE RELATIONS COME OFF THE RECORD'S OWN LINKS, THROUGH THE ONE READER THAT LABELS THEM.
    // `resolveLinks` is what the record page is served, so the phrase a row is printed under and the
    // phrase the region is keyed by are one string read once. A second reading here — the link rows
    // in one direction, the labels worked out again from `LINK_TYPES` — is the defect this
    // repository keeps finding, and it would be silent: a comment anchored under *subject of* would
    // come back "that part is not there".
    relations: resolveLinks(record.id).map((link) => link.label),
  })
  /** Asked at most once per tree, and only by a caller that has a part to name. */
  let named: ReadonlyMap<RegionId, string> | null = null
  return {
    root,
    // THE KIND, CARRIED OUT WITH THE TREE, because naming a declared section needs it and reading
    // the record a second time to ask would be a second reading of the same row.
    kind: record.kind,
    // THE RECORD, IN THE PIECES A SENTENCE IS BUILT FROM, RATHER THAN AS A SENTENCE. It used to be
    // one pre-baked string — `the ${record.kind} "${record.title}", ${record.id}` — which is where
    // the pane's straight quotation marks and the stored kind word both came from. `whereAPartIs`
    // in @shared/regions.ts is the one place those pieces are put together now, and the record page
    // puts its own sentence together in that same place.
    holder: { word: kindWord(record.kind).text, title: record.title, recordId: record.id },
    // THE TITLE GOES WITH THE KIND, because the two parts that ARE the record — `data` and
    // `data.blocks` — are named by the record's own title, and a namer handed no title quoted the
    // record's prose in its place. See `namesOfParts`. It is the same column `holder` above reads,
    // off the same row, read once.
    names: () => (named ??= namesOfParts(root, record.kind, record.title)),
  }
}

/**
 * ONE PART OF ONE RECORD, out of the same derived tree the page draws from, or null when this
 * record does not have that part today — it was never there, the record is gone, or an edit moved
 * the characters the id names.
 *
 * IT IS THE SAME TREE AND NOT A SECOND WALK. `regionTreeOf` above is what `resolveTarget` reads, so
 * a caller that wants to NAME a part and a caller that wants to know whether it is STILL THERE
 * cannot come to different views of what the record has in it.
 *
 * NULL IS A REAL ANSWER AND ITS CALLERS MAY NOT GUESS PAST IT. `readAnnotation` is the one caller:
 * it falls back to the target declaration's own noun — *part of a record* — which is true of every
 * region whether or not the tree still holds it.
 */
export function regionOfRecord(recordId: string, regionId: string): Region | null {
  const tree = regionTreeOf(recordId)
  return tree === null ? null : findRegion(tree.root, regionId)
}

/**
 * WHAT EVERY PART OF ONE RECORD IS CALLED — which part, not what kind — or null when this record is
 * gone.
 *
 * It is `namesOfParts` in @shared/regions.ts asked of the same tree `regionOfRecord` walks, so a
 * sentence naming the parts a projection stands for and a sentence naming the part a comment was
 * left on are two readings of one derivation.
 *
 * A PART MISSING FROM THE MAP IS A PART THIS RECORD NO LONGER HOLDS, which is the same answer
 * `regionOfRecord` gives by answering null, said as an absence from a list instead of one lookup at
 * a time. The caller says it out loud; nothing here decides what to do about it.
 */
export function namesOfPartsOfRecord(recordId: string): ReadonlyMap<string, string> | null {
  const tree = regionTreeOf(recordId)
  return tree === null ? null : tree.names()
}

/**
 * ONE PART OF ONE RECORD AND WHICH PART IT IS, out of ONE derivation, or null when the record no
 * longer holds it.
 *
 * `regionOfRecord` above answers the first half and `namesOfPartsOfRecord` answers the second, and
 * a caller that wants both used to ask both — deriving the record's tree twice for one sentence.
 * The record page's `leftOn` is that caller. This is the two questions asked once.
 */
export function partOfRecordNamed(recordId: string, regionId: string): { region: Region; name: string } | null {
  const tree = regionTreeOf(recordId)
  if (tree === null) return null
  const region = findRegion(tree.root, regionId)
  if (region === null) return null
  const name = tree.names().get(region.id)
  // THE SAME TOTALITY `whatARegionHolds` RELIES ON, and the same refusal to paper over its absence.
  if (name === undefined) {
    throw new Error(
      `The part ${region.id} is in this record's region tree and namesOfParts gave it no name. Those are two ` +
        `readings of one derivation and they cannot disagree; src/shared/regions.ts is where both live.`,
    )
  }
  return { region, name }
}

/** The region that holds what was cut from one stored string — the block, in the ordinary case. */
function holderOf(root: Region, cut: readonly Region[]): Region {
  const widest = [...cut].sort(
    (a, b) => (b.range?.to ?? 0) - (b.range?.from ?? 0) - ((a.range?.to ?? 0) - (a.range?.from ?? 0)),
  )[0]
  if (widest === undefined) return root
  const parent = widest.parentId === null ? null : findRegion(root, widest.parentId)
  return parent ?? widest
}

/**
 * WHAT ONE REGION HOLDS, as the same three-field answer every other reader gives.
 *
 * A REGION'S STRINGS ARE ITS OWN CHARACTERS, NOT THE WHOLE FIELD THEY ARE CUT FROM. A paragraph is
 * a run of one stored string, and the question a caller asks — are these words still here — is
 * about the run and not about the block. The path beside it is the stored string the run lives in,
 * spelled the way every other path in this file is, so a quote can still be looked for in an older
 * revision of that field.
 *
 * A REGION THAT HOLDS NO CHARACTERS OF ITS OWN ANSWERS WITH ITS CHILDREN'S. A section holds
 * paragraphs; it has no run of its own. Answering with an empty list would say the section holds no
 * words, which is false.
 */
function whatARegionHolds(region: Region, tree: RegionTree): TargetText {
  const strings: StoredString[] = []
  const walk = (one: Region): void => {
    if (one.field !== null && one.text !== '') strings.push({ field: one.field, text: one.text })
    else for (const child of one.children) walk(child)
  }
  walk(region)
  // WHICH PART IT IS, THROUGH THE ONE FUNCTION THAT ANSWERS THAT — `namesOfParts` in
  // @shared/regions.ts, the same map the *Shorter forms* panel and the composer read.
  //
  // IT USED TO ASK `nameOfRegion`, WHICH ANSWERS WHAT KIND OF PART SOMETHING IS. Measured on the
  // owner's own report `OOOt4Kouc5dT` on 2 September 2026: 488 parts, 27 distinct sentences, 260 of
  // them the identical *cell of a table*, while `namesOfParts` gave those same 488 parts 488
  // distinct names. Pressed in a browser, seventeen comments on sixteen different parts of that
  // report drew thirteen different sentences — two paragraphs alike, two rows of one table alike,
  // two cells of one row alike. E-R3 asks that one place work a fact out and both surfaces read it,
  // and the weaker of the two namers was on the surface the person's review flow uses.
  //
  // THE MAP IS TOTAL OVER THE TREE IT WAS ASKED OF, and `region` came out of that tree, so a miss
  // is this derivation having two answers about what one record holds. It stops rather than falling
  // back on the kind: falling back is how one weaker sentence lived on this surface unnoticed for a
  // whole campaign, and it would look exactly like a name.
  const name = tree.names().get(region.id)
  if (name === undefined) {
    throw new Error(
      `The part ${region.id} is in this record's region tree and namesOfParts gave it no name. Those are two ` +
        `readings of one derivation and they cannot disagree; src/shared/regions.ts is where both live.`,
    )
  }
  // THE ID STAYS IN THE SENTENCE AND THE PANE TAKES IT OUT. `withoutIds` in the browser removes the
  // exact ids the context names, so a reader sees *the table “…” in the report “…”* and Developer
  // detail sees the id as well. Leaving the id out here would take it off both.
  return {
    about: whereAPartIs({ name, role: region.role, regionId: region.id }, tree.holder),
    strings,
  }
}

// ============================================================================ the readers

/**
 * HOW EACH KIND IS LOOKED UP. A TOTAL MAP, so nothing can be added without an answer.
 *
 * The three that answer `unknown` name things Mole Office does not store yet. Each says what is missing,
 * because "Mole Office cannot look this up" is only a useful answer if it says what would make it
 * possible.
 */
const TARGET_READERS: { [K in TargetKind]: Reader<K> } = {
  record: (target) => {
    const record = getRecord(target.recordId)
    if (record === null || record.deletedAt !== null) return { answer: 'gone', about: nameTarget(target) }
    return {
      answer: 'found',
      text: { about: `the ${record.kind} "${record.title}", ${record.id}`, strings: stringsOfRecord(record) },
    }
  },

  plan: (target) => {
    const plan = getPlan(target.planId)
    if (plan === null) return { answer: 'gone', about: nameTarget(target) }
    return {
      answer: 'found',
      text: { about: `the plan "${plan.title}", ${plan.id}`, strings: [{ field: 'title', text: plan.title }] },
    }
  },

  reportBlock: (target) => {
    const found = findBlock(target.recordId, target.blockId)
    if ('missing' in found) return { answer: 'gone', about: `${nameTarget(target)} — ${found.missing}` }
    const strings: StoredString[] = []
    stringsIn(found.block, found.path, strings)
    return {
      answer: 'found',
      text: {
        about: `the block ${target.blockId} of the ${found.recordKind} "${found.recordTitle}", ${target.recordId}`,
        strings,
      },
    }
  },

  /**
   * A PART OF A REPORT, WITH THREE ANSWERS AND NO GUESS BETWEEN THEM.
   *
   * The tree is derived, never stored, so "is it still there" is asked of today's content by the
   * same function the browser draws from. `regionsOf` is in src/shared, so there is one walk over
   * stored text and not two.
   *
   * THE IDENTITY STEPS AND THE OFFSET ARE ASKED SEPARATELY, and that is the whole design of this
   * arm. `data.blocks[#b-5].text@412` says two things: the `text` field of block `b-5` — which is
   * an identity and survives every edit of the characters inside it — and character 412, which is
   * a position that an edit above it moves.
   *
   *   · The exact id is there            → `found`.
   *   · The field is gone                → `gone`. That is what `gone` means.
   *   · The field is there, the offset is not where it was → `changed`, with the region covering
   *     that offset now, or the field's own region when nothing covers it.
   *
   * WHY THE LAST ONE IS NOT `gone`. Insert one character above a paragraph and its id moves. The
   * record is there, the block is there, the field is there and the words are almost certainly
   * there. Answering `gone` would tell somebody their comment points at nothing, which is false,
   * and the write path would refuse their own stored context back.
   */
  region: (target) => {
    const tree = regionTreeOf(target.recordId)
    if (tree === null) return { answer: 'gone', about: nameTarget(target) }

    const exact = findRegion(tree.root, target.regionId)
    if (exact !== null) return { answer: 'found', text: whatARegionHolds(exact, tree) }

    // THE FIELD ITSELF, ASKED FOR WITHOUT THE OFFSET. A region whose id has no `@` step has no
    // second question to ask: it named a thing, and the thing is not there.
    const offset = offsetOf(target.regionId)
    if (offset === null) return { answer: 'gone', about: nameTarget(target) }
    const field = identityOf(target.regionId)
    const cut = regionsInField(tree.root, field)
    if (cut.length === 0) return { answer: 'gone', about: nameTarget(target) }

    // NOTHING COVERS THE OFFSET AND THE FIELD IS STILL THERE. Somebody deleted the paragraphs below
    // this one and the offset is now past the end of the string. That is still `changed` and not
    // `gone`: the answer is the thing that HOLDS what was cut from this field — the block.
    const holding = regionHolding(tree.root, field, offset) ?? holderOf(tree.root, cut)
    return { answer: 'changed', text: whatARegionHolds(holding, tree), what: summaryOf(holding) }
  },

  /**
   * ONE ROW OF THE LEDGER, LOOKED UP BY ITS OWN ID.
   *
   * THE RECORD IS CHECKED AGAINST THE ROW AND NOT TRUSTED FROM THE ATTRIBUTE. Both ids are in the
   * target, and a change belongs to exactly one record — so a target naming a change of one record
   * and the id of another is a claim this can test rather than carry. It answers `gone` with the
   * record the change is actually on, because that sentence is what tells somebody the attribute
   * was built wrong rather than the row deleted.
   *
   * A CHANGE IS NEVER `changed`. Nothing rewrites a ledger row: it is there or it is not.
   */
  change: (target) => {
    const row = db.select().from(changes).where(eq(changes.id, target.changeId)).get()
    if (row === undefined) return { answer: 'gone', about: nameTarget(target) }
    if (row.recordId !== target.recordId) {
      return {
        answer: 'gone',
        about: `${nameTarget(target)} — that change was made to record ${row.recordId}`,
      }
    }
    const record = getRecord(row.recordId)
    return {
      answer: 'found',
      text: {
        about:
          // THE ROW AS A SENTENCE, THROUGH THE ONE FUNCTION THAT WRITES ONE. `changeVerb` turns the
          // stored op and the stored field name into a reader's words — *changed the fix*, *linked
          // (part of)* — and it is the same function the change log on the screen and the
          // continuation assembler both call. Writing `row.op` and `row.field` out here would have
          // been a third sentence for one row, which is what that function was moved to
          // src/shared/words.ts to stop. `tests/the-machine-word-gate.test.ts` caught it.
          `${changeVerb(row)} on ` +
          `${record === null ? `a record nobody has, ${row.recordId}` : `"${record.title}"`}, ` +
          `${row.at}, by ${row.actorId}`,
        // THE TWO STORED VALUES, UNDER THE COLUMN NAMES THEY ARE STORED IN. A value that is null is
        // left out rather than sent as an empty string: a field that was created holds no before,
        // and an empty quote against it would say it held nothing rather than that nothing is there
        // to quote.
        strings: [
          ...(row.oldValue === null ? [] : [{ field: 'oldValue', text: row.oldValue }]),
          ...(row.newValue === null ? [] : [{ field: 'newValue', text: row.newValue }]),
        ],
      },
    }
  },

  tableRow: (target) => {
    const found = findBlock(target.recordId, target.blockId)
    if ('missing' in found) return { answer: 'gone', about: `${nameTarget(target)} — ${found.missing}` }
    const row = tableAt(found.block, target.rowKey)
    if ('missing' in row) return { answer: 'gone', about: `${nameTarget(target)} — ${row.missing}` }
    const strings: StoredString[] = []
    stringsIn(row.cells, `${found.path}.rows[${String(row.index)}].cells`, strings)
    return {
      answer: 'found',
      text: {
        about:
          `row ${target.rowKey} of the table ${target.blockId} in the ${found.recordKind} ` +
          `"${found.recordTitle}", ${target.recordId}`,
        strings,
      },
    }
  },

  tableCell: (target) => {
    const found = findBlock(target.recordId, target.blockId)
    if ('missing' in found) return { answer: 'gone', about: `${nameTarget(target)} — ${found.missing}` }
    const row = tableAt(found.block, target.rowKey)
    if ('missing' in row) return { answer: 'gone', about: `${nameTarget(target)} — ${row.missing}` }
    const column = Number(target.columnKey)
    if (!Number.isInteger(column) || column < 1) {
      return { answer: 'gone', about: `${nameTarget(target)} — "${target.columnKey}" is not a column number` }
    }
    const cell = row.cells[column - 1]
    if (cell === undefined) {
      return {
        answer: 'gone',
        about:
          `${nameTarget(target)} — that row has ${String(row.cells.length)} ` +
          `cell${row.cells.length === 1 ? '' : 's'} and no column ${target.columnKey}`,
      }
    }
    const strings: StoredString[] = []
    stringsIn(cell, `${found.path}.rows[${String(row.index)}].cells[${String(column - 1)}]`, strings)
    return {
      answer: 'found',
      text: {
        about:
          `row ${target.rowKey}, column ${target.columnKey} of the table ${target.blockId} in the ` +
          `${found.recordKind} "${found.recordTitle}", ${target.recordId}`,
        strings,
      },
    }
  },

  planLine: (target) => {
    const plan = getPlan(target.planId)
    if (plan === null) return { answer: 'gone', about: nameTarget(target) }
    const line = linesOf(target.planId).find((l) => l.id === target.lineId) ?? null
    if (line === null) return { answer: 'gone', about: nameTarget(target) }
    return {
      answer: 'found',
      text: {
        about: `the line "${line.text.slice(0, 60)}" of the plan "${plan.title}", ${target.lineId}`,
        strings: [
          { field: 'text', text: line.text },
          ...(line.remark === null ? [] : [{ field: 'remark', text: line.remark }]),
        ],
      },
    }
  },

  /**
   * ONE FACT BESIDE A LINE OF A PLAN, looked up through the plan, then the line, then the fact.
   *
   * THE FACT IS READ THE WAY THE TABLE READS IT: the value the line's own words give it, and the
   * values the plan read hands back for it (`derived`, from `linesWithWork`). So the sentence an
   * agent reads says what the person saw. A fact with nothing said about it is still there, because
   * the table draws its cell on every row, and the sentence says nothing is said.
   *
   * IT HOLDS NO STORED STRING. What a fact says is worked out on every read, so `strings` is empty
   * and the words somebody pointed at travel as a quote.
   */
  planLineFact: (target) => {
    const plan = getPlan(target.planId)
    if (plan === null) return { answer: 'gone', about: nameTarget(target) }
    const entry = linesWithWork(target.planId).find((one) => one.line.id === target.lineId)
    if (entry === undefined) return { answer: 'gone', about: nameTarget(target) }
    const fact = target.fact
    if (!isPlanLineFact(fact)) {
      return { answer: 'gone', about: `${nameTarget(target)} — a line of a plan has no fact called "${fact}"` }
    }
    const says = [
      ...parsePlanLine(entry.line.text).values.filter((one) => one.key === fact).map((one) => one.value),
      ...entry.derived.filter((one) => one.key === fact).map((one) => one.says),
    ]
    return {
      answer: 'found',
      text: {
        about:
          `the ${fact} of the line "${entry.line.text.slice(0, 60)}" of the plan "${plan.title}", ${target.lineId}, ` +
          `which says ${says.length === 0 ? 'nothing' : says.map((one) => `"${one}"`).join(' and ')}`,
        strings: [],
      },
    }
  },

  scheduleBlock: (target) => {
    const window = getWindow(target.windowId)
    if (window === null) return { answer: 'gone', about: nameTarget(target) }
    const work = getRecord(window.recordId)
    return {
      answer: 'found',
      text: {
        about:
          `the days ${window.startsOn} to ${window.endsOn} given to ` +
          `${work === null ? `a record nobody has, ${window.recordId}` : `"${work.title}"`}, ${window.id}`,
        strings: window.note === null ? [] : [{ field: 'note', text: window.note }],
      },
    }
  },

  agentMessage: (target) => {
    const row = db.select().from(agentMessages).where(eq(agentMessages.id, target.messageId)).get()
    if (row === undefined) return { answer: 'gone', about: nameTarget(target) }
    const thread = db.select().from(agentThreads).where(eq(agentThreads.id, row.threadId)).get()
    return {
      answer: 'found',
      text: {
        about:
          `the message "${row.body.replace(/\s+/g, ' ').slice(0, 60)}" in the conversation ` +
          `"${thread === undefined ? row.threadId : thread.title}", ${row.id}`,
        strings: [{ field: 'body', text: row.body }],
      },
    }
  },

  annotation: (target) => {
    const record = getRecord(target.annotationId)
    if (record === null || record.deletedAt !== null) return { answer: 'gone', about: nameTarget(target) }
    if (record.kind !== 'annotation') {
      return {
        answer: 'gone',
        about: `${nameTarget(target)} — that id names a ${record.kind}, "${record.title}", and not a note`,
      }
    }
    return {
      answer: 'found',
      text: { about: `the note "${record.title}", ${record.id}`, strings: stringsOfRecord(record) },
    }
  },

  // ---- the three Mole Office cannot look up yet, each saying what is missing ------------------------

  graphNode: (target) => ({
    answer: 'unknown',
    about: nameTarget(target),
    why:
      `Mole Office does not store which drawing a node is in, so it cannot say whether the node for ` +
      `${target.recordId} in "${target.drawing}" is still there. A drawing is laid out on every read from ` +
      `records and links; nothing keeps a node. What would change this is a stored identity for a drawing.`,
  }),

  // WHAT THIS ONE SAYS CHANGED WHEN PHASE 6 LANDED, and the sentence had to change with it. Mole Office
  // does store an organised reading now — `annotation.interpretation`, one sentence beside each
  // comment. What it does not store is a reading broken into separately numbered actions, which is
  // what this target asks for. A sentence denying that any reading is kept would now be false.
  proposedAction: (target) => ({
    answer: 'unknown',
    about: nameTarget(target),
    why:
      `${WHY_AN_ACTION_INSIDE_A_READING_HAS_NO_IDENTITY} So there is nothing holding action ` +
      `${target.actionId} of ${target.interpretationId} for Mole Office to look up. What would change this is a ` +
      `reading stored as a list with an id on each part.`,
  }),

  // AND THIS ONE IS NOT A GAP AT ALL, WHICH IS WHY IT NO LONGER SAYS "yet". An unsent instruction is
  // kept in the browser it is being typed in, on purpose: nothing about it reaches the network,
  // which is the whole of the rule that no agent may start work before the instruction is finally
  // sent. The server cannot look one up because it is not supposed to be able to.
  draft: (target) => ({
    answer: 'unknown',
    about: nameTarget(target),
    why:
      `${WHY_A_DRAFT_IS_NOT_ON_THE_SERVER} So nothing here holds draft ${target.draftId} to look up. The ` +
      `browser it is being typed in can read it; Mole Office cannot, and will not.`,
  }),

  // A SURFACE IS ANSWERED FROM THE REGISTRY AND NEEDS NO DATABASE. The name is the whole identity, so
  // the only question is whether this build still declares it. A name that is gone reads `gone` and is
  // never guessed at: there is no list of old names, and a guess about which new name means the same
  // thing as an old one is the invention this product refuses.
  uiSurface: (target) =>
    isSurfaceId(target.surfaceId)
      ? {
          answer: 'found',
          // A SURFACE HOLDS NO STORED STRING. Its words live in a .tsx file and in no record, which is
          // the whole reason this kind exists rather than being made to look like a record.
          text: { about: surfaceLabel(target.surfaceId), strings: [] },
        }
      : { answer: 'gone', about: `the part of the screen called ${target.surfaceId}` },

  page: (target) => ({
    answer: 'found',
    text: {
      about: `the page ${target.route}`,
      // A PAGE HOLDS NO STORED STRING, and that is a fact rather than an empty result. `holdsText` on
      // the declaration says so, and the write path refuses a quote taken inside one.
      strings: [],
    },
  }),
}

/**
 * THE ANSWER NOBODY SAID WHAT TO DO WITH, TURNED INTO A COMPILE ERROR.
 *
 * Every caller of `resolveTarget` ends by handing whatever is left to this. While all four answers
 * are accounted for, what is left is `never` and this call type-checks. Add a fifth answer and each
 * caller stops compiling on this line, naming itself. That is the mechanism the fourth answer was
 * declared with, and it is the reason a region reader could be added without any caller quietly
 * treating `changed` as `found`.
 */
export function noAnswerWasLeftOut(answer: never): never {
  throw new Error(`resolveTarget answered ${JSON.stringify(answer)} and nothing here says what to do with it`)
}

/**
 * Look one target up.
 *
 * The dispatch is through the total map, so there is no `if kind === …` ladder here that could go
 * one arm short of the vocabulary.
 */
export function resolveTarget(target: Target): TargetResolution {
  const reader = TARGET_READERS[target.kind] as Reader<TargetKind>
  return reader(target)
}

// ============================================================================ writing one down

/**
 * REFUSE A LEAD NAMING A PROJECT THIS INSTALLATION DOES NOT HOLD.
 *
 * It is a separate refusal from every other one in `checkTarget` because it is about the PROJECT
 * and not about the thing: nothing was looked up, and nothing could have been, because there is no
 * project to look in. The sentence names the projects there are, in the same shape
 * `requireWorkspace` uses, so a reader who misspelt one can see the spelling.
 */
function refuseAProjectNobodyHas(id: string): void {
  if (getWorkspace(id) !== null) return
  const existing = listWorkspaces()
  throw new PanelError(
    `This offers to take somebody to "${id}", and there is no project called that. This installation holds ` +
      `${existing.length === 0 ? 'none at all' : existing.map((w) => `${w.id} ("${w.title}")`).join(', ')}. ` +
      `Nothing was stored: an offer naming a project nobody has would move the reader to an empty screen and ` +
      `tell them nothing about why.`,
    404,
  )
}

/**
 * THE OTHER PROJECT A MESSAGE POINTS INTO, WHEN ITS WRITER MAY READ IT, or null when it points into this project or the
 * message centre. Problem 8zw4lqj3ZNm_; see `checkTarget`.
 *
 * Which project the thing is in is read off the target when it names one, and off the record it names otherwise (a
 * block, a row or a part of a record carries no project). A project the reader may not read is REFUSED here, with the
 * words `theProjectsAsked` uses, and a project nobody has is refused by `refuseAProjectNobodyHas`, so neither falls
 * through to the sentence about one project's work, which is not true of a message.
 */
function aProjectTheReaderMayPointInto(
  target: Target,
  named: string | null,
  workspaceId: string,
  reader: AMessageReader,
): string | null {
  const key = targetSpec(target.kind).recordIdentifier
  const recordId = key === null ? undefined : (target as unknown as Record<string, string>)[key]
  const there = named ?? (recordId === undefined || recordId === '' ? null : (getRecord(recordId)?.workspaceId ?? null))
  if (there === null || there === workspaceId || there === MESSAGE_CENTRE) return null
  refuseAProjectNobodyHas(there)
  if (!theProjectsAReaderMayRead(reader).some((workspace) => workspace.id === there)) {
    throw new PanelError(`You may not read the project "${there}", so nothing in it can be pointed at. Nothing was stored.`, 403)
  }
  return there
}

/**
 * MAY THIS TARGET BE STORED? Checked once, where the comment is written, by whoever can fix it.
 *
 * Four refusals and no fifth:
 *
 *   · A NAME MOLE OFFICE CANNOT READ. A part of a report is named by a path, and a path that breaks
 *     the grammar is not a comment about anything. It is asked before any lookup, and separately
 *     from the three below, because all three of those are claims about a lookup and this one is
 *     the reason no lookup could be made.
 *   · A KIND MOLE OFFICE CANNOT LOOK UP. Storing a comment against one would be storing something Mole Office
 *     can never say anything about again — silence dressed as success. The refusal names what is
 *     missing, so the person reads a reason rather than a shrug.
 *   · A THING THAT IS NOT THERE. A comment written against something nobody has is not a comment
 *     about anything.
 *   · A RECORD IN ANOTHER PROJECT. A conversation is about one project's work.
 *
 * A MESSAGE IS THE SECOND EXCEPTION, and it is named by its caller too: the message doors pass the
 * writer's `reader`. Since a decision, a message, a comment among them, is kept in the
 * message centre and belongs to no project, and a comment is in the view of the project whose record
 * it points at (`aCommentOnARecordOf` in lib/message-centre.ts). So "a conversation is about one
 * project's work" is not true of a message any more, and a message may point at a record of any
 * project its writer may read, which is `theProjectsAReaderMayRead`, the one rule of which projects a
 * reader may read (problem 8zw4lqj3ZNm_). The record is then looked up in its own project, so an id
 * that project does not hold is still a 404. A door that passes no reader (an annotation, a review's
 * entry, an agent conversation's comment) keeps the fourth refusal as it was.
 *
 * THE FOURTH ONE HAS AN EXCEPTION AND IT IS NAMED BY THE CALLER, NEVER GUESSED HERE. A LEAD may
 * point anywhere the person may go, because a lead is not a claim about what a conversation is
 * about: it is an offer to move somebody's screen, and a person's screen is not held to one
 * project. Criterion M60. Only
 * `checkMessageLead` passes `mayCrossProjects`, so a comment's `target` is refused exactly as
 * before and the sentence it is refused with has not changed.
 *
 * WHAT HAPPENS LATER IS NOT THIS CHECK'S BUSINESS. The record is deleted, the words are rewritten:
 * that is `readContext`, which says so honestly rather than refusing.
 */
export function checkTarget(
  target: Target,
  workspaceId: string,
  mayCrossProjects = false,
  reader?: AMessageReader,
): void {
  const spec = targetSpec(target.kind)

  // WHICH PROJECT THIS TARGET IS TO BE CHECKED AGAINST. It is the conversation's project, except
  // for a lead pointing at something that says which project it is in — then it is that project,
  // and the lookup below asks the right database rows rather than refusing.
  const named = projectNamedByTarget(target)
  const readable = reader === undefined ? null : aProjectTheReaderMayPointInto(target, named, workspaceId, reader)
  const inProject = mayCrossProjects && named !== null ? named : (readable ?? workspaceId)

  // A RECORD TARGET SAYS WHICH PROJECT IT IS IN, so a mismatch is answerable without any lookup and
  // is a different refusal from a record nobody has. Said first for that reason.
  // A TARGET THAT IS A MESSAGE names the message centre, which is no project, so it crosses no
  // boundary: a comment may point at a message from any project, and the lookup below finds it there.
  if (target.kind === 'record' && target.workspaceId !== workspaceId && target.workspaceId !== MESSAGE_CENTRE && !mayCrossProjects && readable === null) {
    throw new PanelError(
      `This points at a record in "${target.workspaceId}" and the conversation is about "${workspaceId}". A ` +
        `conversation is about one project's work, so what it points at is that project's work. Start a ` +
        `conversation in "${target.workspaceId}" for that record.`,
    )
  }

  // AND A PROJECT NAMED ON A LEAD HAS TO BE A PROJECT. Without this an offer could be stored naming
  // a misspelt project, and the reader would press it, be moved to a project that does not exist,
  // and meet an empty screen with no way of telling that the offer was the thing that was wrong.
  if (mayCrossProjects && named !== null && named !== workspaceId) refuseAProjectNobodyHas(named)

  // A NAME NOBODY CAN READ IS REFUSED BEFORE ANYTHING IS LOOKED UP, and this is the one refusal
  // that is about the NAME rather than about the thing.
  //
  // WHAT IT REPLACES. A region id is a path, and until 30 August 2026 a malformed one went straight
  // to the region reader, which looked for it in the tree, did not find it, and answered `gone` —
  // so the person got a 404 saying *there is no part of a report to point at*. That sentence is
  // false. Mole Office never looked: it could not read the name. Now the parser says which step it
  // could not read, and the answer is a 400 about the id.
  //
  // IT IS THE SAME PARSER THE BROWSER USES, from src/shared, so the server cannot come to a
  // different view of the grammar from the code that derived the id in the first place.
  //
  // AND IT REFUSES NOTHING THAT IS ALREADY WRITTEN DOWN, which was measured rather than assumed.
  // On 30 August 2026 the database held two stored region ids, both `data.blocks[#b-5]`, and both
  // read. Every one of the 2,485 ids the 750 live records derive reads too — see
  // design/problem-03/baseline/region-grammar.mts, which is where those counts come from.
  if (target.kind === 'region') {
    const problem = parseRegionId(target.regionId).problem
    if (problem !== undefined) {
      throw new PanelError(
        `Mole Office cannot read that as a part of a report. In "${problem.id}", the step "${problem.step}" at ` +
          `character ${String(problem.from)} is wrong: ${problem.why}. Nothing was stored.`,
      )
    }
    // A PANEL NO PAGE DRAWS IS NOT A PLACE (problem zIdb10n9vao2). A comment left on it could not be
    // found or answered. The parts under it are drawn and stay accepted; see SECTIONS_NO_PAGE_DRAWS.
    if (SECTIONS_NO_PAGE_DRAWS.some((key) => sectionRegionId(key) === target.regionId)) {
      throw new PanelError(
        `No page draws "${target.regionId}" since its panel was taken off the record page, so a comment left on it ` +
          `could not be found or answered. Nothing was stored. Point at the record itself, or at a part of it that ` +
          `a page draws.`,
      )
    }
  }

  /**
   * AN ADDRESS THIS PRODUCT DOES NOT HAVE IS REFUSED BY NAME. Criterion M97.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT WAS MEASURED, 9 SEPTEMBER 2026
   * ---------------------------------------------------------------------------------------
   *
   * A page target resolved `found` for every string ever sent, because `TARGET_READERS.page` has
   * nothing to look a page up in. Measured against a running server that day: `/there-is-no-such-page`,
   * `/who/agent` (two segments where the address takes three) and `not-even-an-address` were all
   * stored, 201 each. A lead carrying one of those takes the reader to the not-found page, and the
   * message that led them there says nothing about it having been wrong.
   *
   * ---------------------------------------------------------------------------------------
   * IT IS THE APP'S OWN PARSER AND NOT A SECOND LIST OF ADDRESSES
   * ---------------------------------------------------------------------------------------
   *
   * `parseRoute` is what the browser uses to decide which page an address is. A list of addresses
   * kept here beside it would be the defect this repository names as its own: two places that must
   * agree, with nothing making them agree, so a page added to the app would be refused by the door
   * for as long as nobody remembered this file. The server already reads src/web this way — see
   * `parseDueStamp` in lib/waiting.ts and `detailSourceOf` in lib/zoom.ts.
   *
   * `unknown` IS THE PARSER'S OWN WORD for an address no page answers to, and it is the only one
   * refused here. Everything the app draws — a record, a plan, a pipeline, a citizen's page, a flat
   * page, a family — is one of the other names.
   */
  if (target.kind === 'page') {
    const where = parseRoute(`#${target.route}`)
    if (where.name === 'unknown') {
      throw new PanelError(
        `Mole Office has no page at "${target.route}", so nothing was stored. A page target is an address the app ` +
          `really has — a record is /r/<id>, one citizen is /who/agent/<handle> or /who/person/<id>, and the rest ` +
          `are one segment each, like /records or /messages. Point at an address a reader can arrive at.`,
      )
    }
  }

  // A FACT A LINE OF A PLAN DOES NOT HAVE IS REFUSED BEFORE ANYTHING IS LOOKED UP, like a region id
  // nobody can read: the refusal is about the name, not about the plan. Coded, because the composer
  // draws it (problem ON-vXSmgokHf).
  if (target.kind === 'planLineFact' && !isPlanLineFact(target.fact)) {
    throw new PanelError(
      `A line of a plan has no fact called "${target.fact}", so nothing was stored. The facts beside a line are ` +
        `${PLAN_LINE_FACTS.map((one) => `"${one}"`).join(', ')}.`,
      400,
      undefined,
      undefined,
      'A line of a plan has no fact by that name.',
      { code: 'planLineFactUnknown', values: {} },
    )
  }

  // MOLE OFFICE CANNOT LOOK THIS KIND OF THING UP, said before anything else about the thing, because
  // every other refusal below would be a claim about a lookup that never happened.
  const found = resolveTarget(target)
  if (found.answer === 'unknown') {
    throw new PanelError(
      `Mole Office cannot point at a ${spec.noun} yet, so nothing was stored. ${found.why} Point at something Mole Office ` +
        `can look up again — the record it is in is always one of them.`,
    )
  }

  // ANYTHING THAT LIVES INSIDE A RECORD IS HELD TO THAT RECORD'S PROJECT BOUNDARY. A block of a
  // report, a cell of its table and a note left on it all name a record and none of them carries a
  // project, so the boundary is read off the record. `recordInWorkspace` is the one place that
  // refusal is worded, and it also refuses a record that has been deleted.
  const key = spec.recordIdentifier
  if (key !== null) {
    recordInWorkspace((target as unknown as Record<string, string>)[key] ?? '', inProject)
  }

  if (found.answer === 'gone') {
    // A FACT BESIDE A LINE CARRIES A CODE, because the composer draws this refusal in the page's
    // language. Its plan or its line was removed after the page was drawn.
    if (target.kind === 'planLineFact') {
      throw new PanelError(
        `There is no ${spec.noun} to point at: ${found.about}.`,
        404,
        undefined,
        undefined,
        'That plan or that line is no longer there.',
        { code: 'planLineFactGone', values: {} },
      )
    }
    throw new PanelError(`There is no ${spec.noun} to point at: ${found.about}.`, 404)
  }

  // ---- CALLER ONE OF THREE SAYS WHAT IT DOES WITH THE OTHER TWO ANSWERS.
  //
  // `found` is the thing exactly where it was. `changed` is the thing not where it was: for a
  // region, the record, the block and the field all resolved and only the character offset moved.
  // BOTH MAY BE WRITTEN AGAINST. This check asks whether there is something to point at, and in
  // both cases there is. Refusing `changed` would stop a person commenting on a paragraph that
  // somebody had edited above, and would refuse Mole Office's own stored contexts back the moment a
  // report was edited.
  if (found.answer === 'found' || found.answer === 'changed') return
  noAnswerWasLeftOut(found)
}

/**
 * EVERYTHING A STORED CONTEXT HAS TO SATISFY, in one call, so no write path has half of it.
 *
 * A comment to an agent and an annotation are two doors into the same shape. This is what both go
 * through: the thing has to be one Mole Office can look up, in this project, and still there; a quoted
 * span has to be a pair that can be true, on something that holds text; and a revision has to name
 * one the ledger really holds.
 *
 * `mayCrossProjects` IS PASSED STRAIGHT DOWN AND CHANGES ONE THING: whether the target may be in
 * another project. Only a lead sets it. Everything else in this call is about the thing itself and
 * is the same question in either project.
 */
export function checkContext(
  context: Context,
  workspaceId: string,
  writtenBy: ActorType,
  mayCrossProjects = false,
  reader?: AMessageReader,
): void {
  checkTarget(context.target, workspaceId, mayCrossProjects, reader)
  checkSpan(context)
  checkPlace(context)
  checkSeen(context)
  checkView(context, writtenBy)
  checkContextRevision(context)
  checkDrawnIn(context, workspaceId)
  checkDrawnOn(context, workspaceId)
}

/**
 * MAY THIS CONTEXT SAY WHERE IT WAS DRAWN? Only if the place it names is a place.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE SAME CHECK A REGION TARGET GETS, POINTED AT THE OTHER FIELD
 * ---------------------------------------------------------------------------------------
 *
 * `drawnIn` names a region of a record's page — `section.subject of` of the report a link row was
 * printed on. That is exactly a region target, so it goes through `checkTarget`, which reads the id
 * with the one parser, refuses a name nobody can read with a 400 naming the bad step, holds the
 * record to this project, and answers 404 for a region that is not there. Writing a second, weaker
 * version of those four refusals here is how one door comes to accept what the other refuses.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT REFUSED HERE, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * A `drawnIn` naming the SAME record the target names is not refused. The browser does not write
 * one — the ancestry of a part of a record's own page is already in the region tree, and storing it
 * twice is the defect `DrawnIn` names in its own comment — but that is a rule about what is worth
 * recording, not about what is true. A restore or a migration moving a stored context forward must
 * not be refused for carrying a fact somebody once wrote.
 *
 * AN AGENT MAY SEND ONE. Unlike `view`, this is not evidence about a screen: it is the region a
 * thing is drawn in, which is derived from the record and its links and can be checked against
 * them. `checkTarget` above is that check.
 */
export function checkDrawnIn(context: Context, workspaceId: string): void {
  const drawnIn = context.drawnIn
  if (drawnIn === undefined) return
  checkTarget({ kind: 'region', recordId: drawnIn.recordId, regionId: drawnIn.regionId }, workspaceId)
}

/**
 * MAY THIS CONTEXT SAY WHICH DRAWING IT WAS ON? Only if the records it names are records.
 *
 * ---------------------------------------------------------------------------------------
 * THE SAME CHECK A RECORD TARGET GETS, POINTED AT TWO MORE FIELDS
 * ---------------------------------------------------------------------------------------
 *
 * `drawnOn.pipelineId` is the pipeline a pipeline drawing draws, and `drawnOn.inside` is the
 * pipeline box a step card sat in. Both are records, so both go through `checkTarget`, which holds
 * a record to this project and answers 404 for one that is not there. A weaker check written out
 * here is how one door comes to accept what the other refuses.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT REFUSED, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * A `pipelineId` on the module drawing, or an `inside` that is not the pipeline the drawing draws.
 * A pipeline drawing can draw several pipelines and a module drawing draws none, so which pairs are
 * possible is a fact about a projection this file cannot rebuild, and a rule guessing at it would
 * refuse honest evidence about somebody's screen.
 *
 * AN AGENT MAY SEND ONE, for the reason `checkDrawnIn` gives: this is not evidence about a screen
 * in the way `view` is — it is which drawing a card was on, and the records it names are checkable.
 */
export function checkDrawnOn(context: Context, workspaceId: string): void {
  const drawnOn = context.drawnOn
  if (drawnOn === undefined) return
  for (const recordId of [drawnOn.pipelineId, drawnOn.inside]) {
    if (recordId === undefined) continue
    checkTarget({ kind: 'record', recordId, workspaceId }, workspaceId)
  }
}

/**
 * MAY THIS WRITER SAY WHAT WAS ON THEIR SCREEN? One refusal, and it is about WHO and not about WHAT.
 *
 * ---------------------------------------------------------------------------------------
 * AN AGENT HAS NO SCREEN
 * ---------------------------------------------------------------------------------------
 *
 * `Context.view` records the drawing a comment was written off — which rung of the detail ladder the
 * record was at, and therefore which of its parts the writer could see. It exists so that a reader
 * at a different rung can be told the truth: *the place is real and it is not on your screen.*
 * Everything downstream trusts it. A mark is drawn at reduced strength because of it, and a control
 * offers to restore that view.
 *
 * An agent reaches every door a browser reaches — the annotation route, the message route, the
 * review entry — and an agent never rendered a report, never chose a rung and cannot have read one.
 * A view stored by one is an invented observation about somebody's reading, which is the third
 * engineering rule, and it would be invisible: nothing downstream can tell a measured view from a
 * plausible one. So it is refused at the door, where the person who can fix it is standing.
 *
 * THIS IS THE SAME RULE `checkSeen` ALREADY MAKES ABOUT SCREEN EVIDENCE, pointed at a different
 * writer. There, evidence about a screen is refused wherever the corpus already holds the words.
 * Here, evidence about a screen is refused wherever the writer has no screen. Both exist so nobody
 * files a claim about something they did not see.
 *
 * ---------------------------------------------------------------------------------------
 * `system` IS ALLOWED, AND THAT IS NOT A HOLE
 * ---------------------------------------------------------------------------------------
 *
 * A `system` write is Mole Office moving something it already holds: a restore writing an earlier
 * revision forward, a migration putting a stored context into a newer shape. Refusing a view there
 * would make a stored comment unrestorable BECAUSE it carries honest evidence, which is the refusal
 * doing the opposite of its job. A system write never invents a view; it copies one, and the
 * revision ledger says which revision it came from.
 *
 * WHAT IS NOT CHECKED HERE. Whether the rung is one of the six, and whether the two optional words
 * are from their lists, is SHAPE — `validateData` in src/shared/kinds/validation.ts answers it in the browser
 * as well as here, off `SHAPE_SPECS.View`, and a second copy of that list in this file would be the
 * defect this repository names about itself.
 */
export function checkView(context: Context, writtenBy: ActorType): void {
  if (context.view === undefined) return
  if (viewRuleFor(writtenBy === 'agent' ? 'agent' : 'human') === 'allowed') return
  throw new PanelError(
    'A `view` says what was on a person\'s screen when they wrote this, and an agent has no screen — it never ' +
      'drew the report, never chose how much of it to show, and cannot have read either. Storing one would be a ' +
      'measurement of a person\'s reading that was never taken, and everything that draws the comment afterwards ' +
      `would trust it. Leave \`view\` off: "${en['agentWords.marks.noView']}" is what Mole Office will ` +
      'say, and it is true. Everything else about the comment — what it points at, the words, the revision — is ' +
      'yours to send.',
  )
}

/**
 * MAY THIS PLACE BE STORED? Four refusals, and a fifth that is about the shape of the whole context.
 *
 * ---------------------------------------------------------------------------------------
 * THE DOOR IS OPEN, AND A PLACE IS NOT REQUIRED
 * ---------------------------------------------------------------------------------------
 *
 * `SHAPE_SPECS.Context` in src/shared/kinds/drawn-on.ts now declares `place`, so a request carrying one
 * reaches this function instead of being refused as an unknown key. `place` is OPTIONAL there and
 * here, and that is the ordering rule rather than an oversight: what puts a place on the wire is
 * the browser, in components/agent/pointing.ts, and until that lands a required field would refuse
 * every comment the product itself writes. The producer lands before the check that demands it,
 * never after.
 *
 * WHAT IS ALREADY TRUE OF EVERY STORED ROW. `src/server/db/place-migration.ts` gives every context
 * already in the corpus a place, so the day the requirement is switched on there is nothing left
 * without one. It has to be applied BEFORE the flip and AFTER this door opened — a migrated row
 * carries a `place`, and a shape that did not declare the key refused the whole record on the next
 * patch. Measured on a copy of the corpus on 20 August 2026: with the row migrated and the key
 * undeclared, `PATCH /api/records/<id>` answered *unknown key "place"* and the owner's
 * comment could not be changed at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES
 * ---------------------------------------------------------------------------------------
 *
 *   · A PLACE AND A SPAN ON THE SAME CONTEXT. `spanOf` derives a span from a place, so storing both
 *     is one fact in two fields, and the two are free to name different words. This is the defect
 *     CLAUDE.md names as this repository's recurring one, and this is the pair that would cause it.
 *   · A POSITION INSIDE STORED TEXT, ON A THING THAT HOLDS NO STORED TEXT. The same refusal a
 *     quoted span gets, and for the same reason: the words would name something nothing keeps.
 *     `quote` and `surface` are legal on every kind, and `quote` is how somebody keeps the words
 *     they selected off a part of the screen Mole Office draws from its own code.
 *   · A SPAN THAT ENDS BEFORE IT STARTS. A mistake in the request.
 *   · A TWO-ENDED PLACE THAT DOES NOT NAME TWO THINGS, or that keeps no word for what lay between.
 *   · AN EMPTY QUOTE. An empty string is found wherever it is looked for, so it would report that
 *     the words are still there for a surface that has since been rewritten. `quoteWhatItHolds`
 *     below refuses an empty cell for exactly the same reason.
 */
export function checkPlace(context: Context): void {
  const place = context.place
  if (place === undefined) return
  const spec = targetSpec(context.target.kind)

  if (context.span !== undefined) {
    throw new PanelError(
      'A context says where somebody was in one field, not two. This carries both `place` and `span`, and the two ' +
        'are free to name different words. Send `place` — a span is worked out from it.',
    )
  }

  if ('cut' in place && place.cut !== undefined && place.cut !== true) {
    throw new PanelError(
      '`cut` says the selected words continue past the stored quote. It is only ever true. Leave it out when the ' +
        'whole selection is stored.',
    )
  }

  if (placeNeedsText(place) && !spec.holdsText) {
    throw new PanelError(
      `A ${spec.noun} holds no stored text, so nothing inside one has a position. ${spec.what} Send ` +
        '`{"at":"quote","words":"…"}` to keep the words that were on screen, or `{"at":"surface"}` for the whole ' +
        'thing.',
    )
  }

  if (place.at === 'words') {
    checkSpanShape(place.span)
    refuseAPlaceQuoteOverTheBound(place.span.quote)
  }
  if (place.at === 'across') {
    checkSpanShape(place.from)
    checkSpanShape(place.to)
    refuseAPlaceQuoteOverTheBound(place.from.quote)
    refuseAPlaceQuoteOverTheBound(place.to.quote)
    if (place.parts < 2) {
      throw new PanelError(
        `A selection that ran across more than one thing lay across at least two, and this says ${String(place.parts)}.`,
      )
    }
    if (place.partWord === '') {
      throw new PanelError(
        'A selection that ran across more than one thing says what those things were — blocks, rows, lines — and ' +
          'this leaves that word blank. Without it a reader is told "3" and nothing else.',
      )
    }
  }
  if (place.at === 'quote' && place.words === '') {
    throw new PanelError(
      'Keeping the words means keeping some words. An empty quote is found wherever it is looked for, so it would ' +
        'report that the words are still there long after they were rewritten.',
    )
  }
  if (place.at === 'quote') refuseAPlaceQuoteOverTheBound(place.words)
  if (place.at === 'run') {
    if (place.field === '') {
      throw new PanelError('A run of text is named by which stored string it is part of, and this leaves that blank.')
    }
    if (place.offset < 0) {
      throw new PanelError(
        `A run of text starts at or after the beginning of the string it is in, and this starts at ${String(place.offset)}.`,
      )
    }

    // ---- THE SAME FACT IN THE TARGET AND IN THE PLACE, REFUSED.
    //
    // A region deeper than a block is named by where its characters start: `…text@530` says the
    // field `text` and character 530. A `run` place says a field and an offset too. Store both and
    // one context holds one fact in two fields, free to disagree, and nothing would fail when they
    // did — the region would say one paragraph and the place another.
    //
    // THE REGION IS THE WHOLE ANSWER, SO THE PLACE SAYS `surface`. A run survives where it names
    // something the region does not: a bold phrase inside a paragraph starts somewhere other than
    // the paragraph's first character, and that offset is a fact the region id does not carry.
    if (context.target.kind === 'region') {
      const at = offsetOf(context.target.regionId)
      if (place.field === identityOf(context.target.regionId) && at !== null && at === place.offset) {
        throw new PanelError(
          'This says the same thing twice: the part of the report it points at already starts at character ' +
            `${String(place.offset)} of ${place.field}, and the place repeats it. Send \`{"at":"surface"}\` — the ` +
            'part is the whole answer. A run is for words that start somewhere else inside it.',
        )
      }
    }
  }
}

/** The browser sends the same opening this reader uses, with the cut fact beside it. */
function refuseAPlaceQuoteOverTheBound(quote: string): void {
  if (!shortenToWords(quote).shortened) return
  throw new PanelError(
    `A place quote may use at most ${String(SHOWN_CHARACTERS)} characters. Send the opening text shown on screen and ` +
      'set `cut: true` when the rest was left out. Keep any `from` and `to` at the full selection.',
  )
}

/** A pair that can be true. Shared by `checkSpan` and by the two-ended place, which holds two of them. */
function checkSpanShape(span: Span): void {
  if (span.to < span.from) {
    throw new PanelError(`A quoted span ends before it starts: from ${String(span.from)}, to ${String(span.to)}.`)
  }
}

/**
 * MAY THIS EVIDENCE BE STORED? One half of the rule is enforced here today, and the other half is
 * not, and which is which is said out loud rather than left to be discovered.
 *
 * ---------------------------------------------------------------------------------------
 * THE HALF THAT IS ENFORCED: REFUSED WHERE THE WORDS ARE ALREADY IN THE CORPUS
 * ---------------------------------------------------------------------------------------
 *
 * A record, a block, a row, a cell: Mole Office can read what these say at any moment. A copy of those
 * words taken when a comment was written is a second version of a string the database already
 * holds, and it starts drifting the moment somebody edits the original. So it is refused, and the
 * reader is told to read the thing itself.
 *
 * ---------------------------------------------------------------------------------------
 * THE HALF THAT IS NOT ENFORCED YET: REQUIRED WHERE THERE IS NO STORED TEXT
 * ---------------------------------------------------------------------------------------
 *
 * `seenRuleFor` says a target with no stored text REQUIRES this evidence, because there is no
 * original to go stale against and the measurement is the only record there will ever be.
 *
 * IT IS STILL NOT REQUIRED HERE, AND THE REASON HAS CHANGED. It used to be that nothing measured a
 * `Seen` at all. Since 25 August 2026 the browser does — `theScreenThisWasSeenOn` in
 * src/web/components/agent/pointing.ts — so half of the old reason has gone. The other half has
 * not: an agent writing through the API has no screen, and every door that takes a `Context` takes
 * one from an agent as well as from a browser. Turning the requirement on here would refuse an
 * agent for not measuring something it cannot measure, which is the same ordering fault pointing
 * the other way.
 *
 * WHO IT SHOULD BE REQUIRED OF IS THE OWNER'S TO SETTLE and it is filed as a proposal rather than
 * decided here. The test that pins today's behaviour is in tests/where-a-comment-was-made.test.ts,
 * and it has to be changed deliberately on the day this flips, which is the point of it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ENFORCED IS EXACTLY WHAT `Seen` DECLARES
 * ---------------------------------------------------------------------------------------
 *
 * Four fields and no fifth: `SHAPE_SPECS.Seen` in src/shared/kinds/drawn-on.ts is what refuses a fifth, and
 * it was added on the same day, because until then this whole function was unreachable — a context
 * carrying `seen` never got as far as it. `cut` is checked here rather than there because it is
 * declared `cut?: true`, a flag whose presence is the fact, and the shape checker knows booleans
 * rather than the literal `true`. Sending `false` would be a browser saying "the words were not
 * cut" in a field that only exists to say they were.
 */
export function checkSeen(context: Context): void {
  const seen = context.seen
  if (seen === undefined) return
  const spec = targetSpec(context.target.kind)
  if (seenRuleFor(context.target.kind) === 'refused') {
    throw new PanelError(
      `A ${spec.noun} holds its own words, so Mole Office reads them from it rather than keeping a copy. A copy taken ` +
        'now says something different from the original as soon as anybody edits it. Leave `seen` off and quote the ' +
        'words in `place` if a person chose some.',
    )
  }
  if (seen.route === '') {
    throw new PanelError('Evidence about what was on screen says which page it was on, and this leaves that blank.')
  }
  if (seen.build === '') {
    throw new PanelError(
      'Evidence about what was on screen says which build drew it. Send "unknown" if that cannot be read — that is ' +
        'a real answer and a blank one is not.',
    )
  }
  if (seen.cut !== undefined && seen.cut !== true) {
    throw new PanelError(
      '`cut` says the words on screen were longer than what a screen shows and the quote holds the first whole ' +
        'words of them. It is only ever true. Leave it out to say the quote is the whole of what was drawn.',
    )
  }
}

/**
 * WHAT A THING NAMED BY WHERE IT SITS HOLDS, KEPT AS THE QUOTE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A COMMENT ON A CELL USED TO BE UNANSWERABLE
 * ---------------------------------------------------------------------------------------
 *
 * A cell of a table is named by its row and its column, and a stored row has no id. So row 2 still
 * resolving says only that the table still has a second row: add a row above and row 2 is a
 * different row holding something the comment was never about. With nothing quoted there is nothing
 * to compare, so `readContext` answered `unknown` — honest, and useless to read.
 *
 * THE ANSWER IS TO MEASURE IT WHEN THE COMMENT IS WRITTEN. What the cell holds at that moment is
 * exactly the evidence the reading needs later, and src/shared/targets.ts already says a text anchor
 * carries its quote for this reason. So Mole Office keeps it, and the reading becomes `there` while the
 * cell still holds those words and `changed` when it does not.
 *
 * THIS IS NOT MOLE OFFICE GUESSING WHAT SOMEBODY MEANT. The words are read out of the database at the
 * moment of the write, so the stored quote is a measurement rather than a plausible default. What
 * the person pointed at IS what the cell held.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR THINGS IT WILL NOT DO
 * ---------------------------------------------------------------------------------------
 *
 *   · IT NEVER TOUCHES A SPAN SOMEBODY SENT. Words a person selected are what the comment is about,
 *     and replacing them with the whole cell would be a substitution nobody asked for.
 *   · IT ONLY RUNS ON A THING NAMED BY WHERE IT SITS, which `isPosition` on the declaration already
 *     says. A block of a report carries its own id, so "still there" is already a true sentence
 *     about one — quoting its text as well would turn every edit of the block into `changed`, which
 *     is a claim about a comment that was never about particular words.
 *   · IT NEEDS THE THING TO HOLD EXACTLY ONE RUN OF WORDS. A cell holds one. A ROW HOLDS ONE PER
 *     CELL, and a span names one stored string, so there is no honest single quote for a row. A row
 *     therefore still reads `unknown`, and the sentence for it says to point at a cell instead.
 *   · IT KEEPS NOTHING FOR AN EMPTY CELL. An empty quote matches wherever it is looked for, so it
 *     would report `there` for a cell somebody has since filled in.
 */
/**
 *   · IT WRITES THE MEASUREMENT INTO THE PLACE, BECAUSE THE PLACE IS WHERE WORDS LIVE NOW. A
 *     context says where somebody was in one field. Adding a `span` beside a `place` is the pair
 *     `checkPlace` refuses two hundred lines above, and it was being written here: every comment on
 *     a cell was stored with both, and the server then refused its own stored context the next time
 *     anything sent it back.
 *   · IT NEVER OVERWRITES WORDS A PERSON CHOSE. `words`, `across` and `quote` all carry somebody's
 *     own selection, so a context holding one of those is returned untouched. Only `run` and
 *     `surface` — the two that name no words at all — and a context with no place are filled in.
 */
export function quoteWhatItHolds(context: Context): Context {
  if (spanNamedBy(context) !== null) return context
  if (context.place !== undefined && context.place.at !== 'run' && context.place.at !== 'surface') return context
  const spec = targetSpec(context.target.kind)
  if (!spec.holdsText) return context
  if (!spec.identifies.some((field) => field.isPosition === true)) return context

  // ---- CALLER TWO OF THREE SAYS WHAT IT DOES WITH EACH ANSWER.
  //
  // This measures what a thing holds AT THE MOMENT OF THE WRITE, so only `found` is a measurement.
  // `changed` hands back a part of the report that is NOT the part the target named — the offset
  // moved — and quoting that would store somebody's comment against words they never saw, which is
  // the invented interpretation this product refuses. `gone` and `unknown` hold nothing to measure.
  // All three leave the context exactly as it arrived.
  const found = resolveTarget(context.target)
  switch (found.answer) {
    case 'found':
      break
    case 'changed':
    case 'gone':
    case 'unknown':
      return context
    default:
      noAnswerWasLeftOut(found)
  }
  if (found.text.strings.length !== 1) return context
  const only = found.text.strings[0]
  if (only === undefined || only.text === '') return context

  const span: Span = { quote: only.text, from: 0, to: only.text.length, field: only.field }
  return { ...context, place: { at: 'words', span } }
}

/**
 * THE THREE OLD SPELLINGS OF A PART OF A REPORT, WRITTEN IN THE ONE SPELLING THAT IS STORED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES
 * ---------------------------------------------------------------------------------------
 *
 *     {kind:'reportBlock', recordId:'R', blockId:'b-2'}
 *         becomes  {kind:'region', recordId:'R', regionId:'data.blocks[#b-2]'}
 *
 * and a `tableRow` and a `tableCell` become the region of that row and of that cell. Every other
 * kind is handed back untouched.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT A SILENT REWRITE: THE TWO SPELLINGS NAME THE SAME PART OF THE SAME RECORD
 * ---------------------------------------------------------------------------------------
 *
 * That is shown here rather than asserted:
 *
 *   · `findBlock` above builds a block's path as `data.${blocksFieldOf(kind)}[#${blockId}]`, and
 *     `regionIdOfLegacyTarget` in src/shared/regions.ts builds the region id out of the same two
 *     values through the same function of the record's kind. One derivation, not two.
 *   · The browser already treats them as one thing. `regionsDrawnOn` in
 *     src/web/components/agent/MarkLayer.tsx finds the element carrying `reportBlock/R/b-2` when it
 *     is looking for the region `data.blocks[#b-2]`, through that same converter, so a comment
 *     stored as a region is still drawn on the block a person pointed at.
 *   · What was stored is handed straight back to the writer — the review's `entry`, the record's
 *     `data.context`, the message's `context` — so nobody is told one thing and given another.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT HAPPENS AT THE DOOR
 * ---------------------------------------------------------------------------------------
 *
 * `countOldShapes` in src/server/db/contexts-to-regions.ts counts a stored context whose target
 * names one of these three kinds as pending migration work, and `prepareToServe` in
 * src/server/db/migrate.ts then REFUSES TO SERVE the file at the next start. Under `tsx watch` the
 * next start is the next time anybody saves a server file. Measured on 31 August 2026 on a copy of
 * the live corpus: right-clicking a report block on `OOOt4Kouc5dT` and pressing "Start a review
 * from here" stored `{"kind":"reportBlock","recordId":"OOOt4Kouc5dT","blockId":"b-2"}`, and a
 * server started on that copy refused with *convert 1 target(s) from a report block to a region*.
 * Two such presses took it to two. That is problem XFT0NENMhPfz, and this is the half of it that
 * was left open.
 *
 * ---------------------------------------------------------------------------------------
 * THE OTHER WAY OUT, AND WHY IT WAS NOT TAKEN
 * ---------------------------------------------------------------------------------------
 *
 * The alternative was to refuse the three kinds at the door. It was rejected because the browser
 * still emits them: `regionMark` in src/web/components/SummaryBlocks.tsx builds a `reportBlock`
 * target for every block of a report's own list, and a `tableRow` and a `tableCell` for the rows
 * and cells inside one. Refusing would turn one right-click from "the server will not start" into
 * "this comment cannot be written", which is a second fault rather than the fix for the first.
 *
 * ---------------------------------------------------------------------------------------
 * IT REFUSES RATHER THAN GUESSES
 * ---------------------------------------------------------------------------------------
 *
 * A record nobody has, a record kind that holds no blocks, a row number that is not a number: none
 * of those has a region id, and a region id this record's own tree does not hold is not the part
 * the writer pointed at. Both cases throw and nothing is stored. Storing the old spelling instead
 * is what stops the server, and storing a region id that resolves to nothing would move somebody's
 * comment onto nothing at all.
 */
export function theRegionItNames(target: Target): Target {
  const spelled = theRegionItNamesOrWhyNot(target)
  if (spelled.why !== undefined) throw new PanelError(spelled.why, spelled.status)
  return spelled.target
}

/**
 * The same answer, with the refusal as a sentence rather than as a throw.
 *
 * TWO CALLERS AND ONE RULE. The door throws, because a write that cannot be spelled the one way it
 * is stored must not happen. The anchor comparison in src/server/lib/records.ts may not throw: it
 * only asks whether a patch MOVES a comment, the value it is handed is refused a few lines later by
 * `checkTarget` with that refusal's own sentence, and a throw here would answer a question about a
 * missing block with a sentence about spelling.
 */
export function theRegionItNamesOrWhyNot(
  target: Target,
): { target: Target; why?: undefined } | { why: string; status?: number; target?: undefined } {
  if (!isAnOldSpelling(target.kind)) return { target }
  const old = target as Extract<Target, { kind: OldPartKind }>
  const spec = targetSpec(target.kind)
  const record = getRecord(old.recordId)
  if (record === null || record.deletedAt !== null) {
    return { why: `There is no ${spec.noun} to point at: ${nameTarget(target)}.`, status: 404 }
  }
  const regionId = regionIdOfLegacyTarget(old, blocksFieldOf(record.kind))
  if (regionId === null) {
    return {
      why:
        `Mole Office stores ${nameTarget(target)} as a part of that record, and it cannot work out which part. ` +
        `A ${record.kind} holds its blocks in no field, or the row and column this names are not numbers ` +
        'counted from 1. Nothing was stored.',
    }
  }
  const region: Target = { kind: 'region', recordId: old.recordId, regionId }
  const found = resolveTarget(region)
  // ---- CALLER THREE OF THREE SAYS WHAT IT DOES WITH EACH ANSWER. `found` is the part exactly
  // where it was and `changed` is the same part with an offset that has moved; both are the part
  // the writer pointed at, and `checkTarget` above accepts both for the same reason. `gone` and
  // `unknown` mean the region tree of this record does not hold what the old name resolved to, so
  // the two spellings would NOT be naming one thing here — which is the one case where converting
  // would be a rewrite, and it refuses.
  switch (found.answer) {
    case 'found':
    case 'changed':
      return { target: region }
    case 'gone':
    case 'unknown':
      return {
        why:
          `Mole Office found ${nameTarget(target)} and stores it as the part ${regionId} of that record, and that ` +
          'record has no such part. The two names disagree, so nothing was stored rather than storing a ' +
          'comment against a part nobody could look up again.',
      }
    default:
      noAnswerWasLeftOut(found)
  }
}

/** True when this word is one of the three spellings src/server/db/contexts-to-regions.ts names. */
function isAnOldSpelling(kind: TargetKind): kind is OldPartKind {
  return (OLD_PART_KINDS as readonly string[]).includes(kind)
}

/**
 * WHAT A DOOR STORES: the context that arrived, with the place it names written down.
 *
 * ---------------------------------------------------------------------------------------
 * ONE FUNCTION BECAUSE THERE ARE FOUR DOORS AND THEY HAD THREE DIFFERENT ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * A context is stored in three places — `records.data.context` on a comment, `agent_messages.
 * context`, and `reviews.entry` — reached through four doors: POST /api/records (and the PATCH and
 * the revision restore behind it), POST /api/agent/threads/:id/messages (and its PATCH), and
 * POST /api/reviews. Before this, the first two called `quoteWhatItHolds` and the review door
 * called nothing at all, so what got stored depended on which door it came through.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PLACE MAY NOT BE LEFT OFF
 * ---------------------------------------------------------------------------------------
 *
 * A stored context that names a target and carries no place is counted by
 * src/server/db/contexts-to-regions.ts as pending migration work, and `prepareToServe` then refuses
 * to serve the file at the next start — which under `tsx watch` is the next time anybody saves a
 * server file. That is problem XFT0NENMhPfz, and it has taken the corpus down twice. Measured on a
 * copy of the live corpus on 31 August 2026: one review started at a region target, one comment
 * written at one and one message carrying one, and the copy would not start.
 *
 * WHY THE OLD SPELLING MAY NOT BE STORED EITHER. The same gate counts a stored context naming a
 * `reportBlock`, a `tableRow` or a `tableCell` as pending migration work and refuses to serve over
 * that too. `theRegionItNames` above is that half, with the whole argument on it.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE STEPS, IN THIS ORDER
 * ---------------------------------------------------------------------------------------
 *
 *   1. `quoteWhatItHolds` — MEASURE what a thing named by where it sits holds, when it holds one
 *      run of words. That is evidence, taken from the database at the moment of the write.
 *   2. `theRegionItNames` — SPELL the thing pointed at the one way this product stores it.
 *   3. `withThePlaceItNames` — WRITE DOWN the place the context already names, when step one had
 *      nothing to measure. It never invents a position: the whole argument is on that function in
 *      src/shared/targets.ts, and it is the same rule the migration applies to rows already stored.
 *
 * THE MEASUREMENT COMES BEFORE THE SPELLING, AND THAT ORDER IS NOT A PREFERENCE. A row and a cell
 * are named by POSITION — `rowKey` and `columnKey` count from 1 and a row inserted above moves them
 * — so `quoteWhatItHolds` keeps what the cell held at the moment of the write, and that quote is
 * what later tells a reader the words they commented on have been edited. Spelling it as a region
 * first would take the position away before anything measured it, and the comment would afterwards
 * report "still there" about a cell somebody had rewritten. Measured by doing it in the other order
 * on 31 August 2026: `tests/an-anchor-is-read-honestly.test.ts` and `tests/seven-surfaces.test.ts`
 * both went red, in those words.
 *
 * WHAT THE CONVERSION DOES COST, SAID OUT LOUD. A stored `tableCell` was read back as *row 2,
 * column 1 of the table b-2*, and the same comment stored as a region reads *the part
 * data.blocks[#b-2].rows[1].cells[0]*. That is a path where there was a sentence. It is the reading
 * every other part of a record already gets — a comment on a paragraph has read that way since
 * round ten — so this makes cells consistent with the rest rather than making them worse than
 * anything else, and the exchange is a server that starts. The sentence a region reader gives is
 * worth improving and it is a separate piece of work.
 *
 * IT IS RUN AFTER `checkContext` AND NOT BEFORE. A caller that sends `place` and `span` together is
 * refused by `checkPlace`, and completing first would move the span into the place and quietly make
 * that pair legal. The refusal is the one that should be seen. `checkTarget` also runs on the
 * spelling the caller sent, so a block nobody has is refused as a block and not as a region.
 */
export function contextAsStored(context: Context): Context {
  return completed(context, theRegionItNames)
}

/**
 * THE SAME THREE STEPS, FOR A CALLER THAT IS COMPARING RATHER THAN WRITING.
 *
 * A target that cannot be spelled as a part of a record is handed back exactly as it arrived. That
 * is not a fallback and nothing is stored from it: the one caller is the anchor comparison in
 * src/server/lib/records.ts, which asks whether a patch moves a comment, and the same value goes on
 * to `checkTarget` a few lines later and is refused there with the refusal's own sentence. Leaving
 * the target alone here means the two sides of that comparison are still the same shape, so the
 * answer is "the anchor did not move" and the refusal a person reads is the true one.
 */
export function contextAsItWouldBeStored(context: Context): Context {
  return completed(context, (target) => theRegionItNamesOrWhyNot(target).target ?? target)
}

/** The three steps, in the one order. `contextAsStored` above is where that order is argued. */
function completed(context: Context, spell: (target: Target) => Target): Context {
  const measured = quoteWhatItHolds(context)
  const target = spell(measured.target)
  return withThePlaceItNames(target === measured.target ? measured : { ...measured, target })
}

/**
 * The same checks, run over an annotation record's `data.context` on the way in — AND THE QUOTE
 * FILLED IN when the note points at something named by where it sits and quoted nothing.
 *
 * ---------------------------------------------------------------------------------------
 * IT CHANGES THE VALUE ON ITS WAY PAST, AND THE NAME DOES NOT SAY SO
 * ---------------------------------------------------------------------------------------
 *
 * The name is `check…` and it now also completes, which is a name that no longer describes what
 * happens. It is kept because the caller is `createRecord` and `patchRecord` in
 * src/server/lib/records.ts, and renaming it means editing that file. **The name should follow.**
 *
 * WHAT IT WRITES AND WHY IT IS SAFE. It fills in the `place`, and only when the place named no
 * words. `data` here is the object the caller is about to store, on both the create path and the
 * patch path, so the filled-in place is what is written and what the record then serves. See
 * `quoteWhatItHolds` above for the whole argument.
 *
 * IT USED TO WRITE A `span` INSTEAD, BESIDE THE PLACE THE BROWSER SENT. That is the pair
 * `checkPlace` refuses, so every comment on a table cell was stored in a shape the server would not
 * accept back: `POST /api/agent/threads/:id/messages` answered 400 for a context Mole Office had written
 * itself.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HERE AND NOT IN `validateData`
 * ---------------------------------------------------------------------------------------
 *
 * `validateData` in src/shared/kinds/validation.ts checks STRUCTURE and runs in the browser, so it may not
 * touch the database. Whether the record a note points at exists, is in this project and has the
 * revision the note names are three questions only the database can answer. `checkBlockIds` is the
 * same case and is answered the same way: a kind-specific check on the write path, run on create
 * and on patch alike, because a rule enforced on one of the two is not a rule.
 *
 * IT IS SHAPED AS A NO-OP FOR ANYTHING IT CANNOT READ. `validateData` has already refused a
 * `context` that is not a Context, so a value that does not look like one here is a value this was
 * not asked about — a `dataPatch` that names other fields, most often — and the stored context is
 * left to be checked by whatever wrote it.
 */
export function checkAnnotationContext(data: unknown, workspaceId: string, writtenBy: ActorType): void {
  checkTheContextUnder('context', data, workspaceId, writtenBy)
}

/**
 * THE SAME THREE QUESTIONS, FOR A MESSAGE THAT SAYS WHAT ON A PAGE IT IS ABOUT.
 *
 * A comment is a message with a target (criterion M1), and a message keeps it under `target` while a
 * comment of the older kind keeps it under `context`. One function, called with the key each kind
 * uses, because two copies of this would let one of the two doors stop checking without anything
 * failing.
 */
export function checkMessageTarget(data: unknown, workspaceId: string, writtenBy: ActorType, reader?: AMessageReader): void {
  checkTheContextUnder('target', data, workspaceId, writtenBy, false, reader)
}

/**
 * THE SAME THREE QUESTIONS AGAIN, FOR WHERE A MESSAGE OFFERS TO TAKE THE READER.
 *
 * A lead is a context like any other, so a lead naming a region nobody can parse or a revision the
 * ledger does not hold is refused exactly as a comment naming one is. Criterion M8, and it matters
 * more here than for a comment: a lead is a request to move somebody's screen, and an offer to take
 * a person somewhere that is not there is worse than no offer.
 *
 * ONE QUESTION IS ANSWERED DIFFERENTLY FOR A LEAD THAN FOR A COMMENT, AND ONLY ONE: WHICH PROJECT.
 * A comment's target is held to the conversation's project, because a conversation is about one
 * project's work. A lead is not about anything — it offers to move a person, and a person moves
 * between projects whenever they like. Criterion M60: somebody who has already
 * agreed to be taken somewhere is not asked a second time about the project. The record still has
 * to be there, in the project the lead names, and the project still has to be one this
 * installation holds; both are checked, in that project's rows, by `checkTarget`.
 */
export function checkMessageLead(data: unknown, workspaceId: string, writtenBy: ActorType, reader?: AMessageReader): void {
  checkTheContextUnder('lead', data, workspaceId, writtenBy, true, reader)
}

/**
 * THE SAME QUESTIONS, FOR EACH THING A MESSAGE QUOTES. As a decision says,
 * one message may carry any
 * number of quotes, so `quotes` is a list of contexts and each one is checked as a `target` is.
 *
 * EVERY QUOTE IS CHECKED BEFORE ANY IS CHANGED, and nothing is written by this function. A bad quote
 * among good ones refuses the whole message, and the refusal says which quote it was, counted from 1,
 * followed by the sentence the check gave. The status the check chose is kept, so a quote of
 * something that is not there is still a 404.
 *
 * Only after all of them pass is each rewritten into the stored spelling, as `checkMessageTarget`
 * does for the one `target`.
 *
 * The shape of the list and of each entry is `validateData`'s question, and `createRecord` asks it
 * before this runs, so an entry that is not a context never reaches here.
 */
export function checkMessageQuotes(data: unknown, workspaceId: string, writtenBy: ActorType, reader?: AMessageReader): void {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return
  const said = data as Record<string, unknown>
  const quotes = said['quotes']
  if (quotes === undefined || quotes === null) return
  if (said['target'] !== undefined && said['target'] !== null) throw new PanelError(A_MESSAGE_QUOTES_IN_TARGET_OR_IN_QUOTES)
  if (!Array.isArray(quotes)) return
  quotes.forEach((held: unknown, i: number) => {
    const which = `Quote ${i + 1} of ${quotes.length}`
    try {
      checkContext(held as unknown as Context, workspaceId, writtenBy, false, reader)
    } catch (error) {
      if (!(error instanceof PanelError)) throw error
      throw new PanelError(`${which} cannot be stored. ${error.message}`, error.status, error.detail)
    }
  })
  for (const held of quotes) writeInTheStoredSpelling(held as Record<string, unknown>)
}

/** The body of all three: check the context stored under one key, and rewrite it into the stored spelling. */
function checkTheContextUnder(
  key: string,
  data: unknown,
  workspaceId: string,
  writtenBy: ActorType,
  mayCrossProjects = false,
  reader?: AMessageReader,
): void {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return
  const held = (data as Record<string, unknown>)[key]
  if (typeof held !== 'object' || held === null || Array.isArray(held)) return
  const target = (held as Record<string, unknown>)['target']
  if (typeof target !== 'object' || target === null || Array.isArray(target)) return
  const context = held as unknown as Context
  checkContext(context, workspaceId, writtenBy, mayCrossProjects, reader)
  writeInTheStoredSpelling(held as Record<string, unknown>)
}

/** Rewrite one checked context, in place, into the spelling this product stores. */
function writeInTheStoredSpelling(held: Record<string, unknown>): void {
  const context = held as unknown as Context
  const stored = contextAsStored(context)
  // AND THE TARGET, WHEN THE DOOR SPELLED IT THE ONE WAY THIS PRODUCT STORES IT. A comment left on
  // a block of a report arrives naming a `reportBlock` and is stored as the region that block is;
  // `theRegionItNames` above is the whole argument. Writing only the place back would leave the old
  // spelling in `data`, which is the row the start-up gate refuses over.
  if (stored.target !== context.target) (held as Record<string, unknown>)['target'] = stored.target
  if (stored.place !== context.place) {
    ;(held as Record<string, unknown>)['place'] = stored.place
    // AND THE SPAN GOES WHEN IT MOVED INTO THE PLACE. `checkPlace` refuses a context carrying both,
    // so leaving it behind would store a comment in a shape this server will not accept back — the
    // defect the note above `quoteWhatItHolds` records happening once already.
    if (stored.span === undefined) delete (held as Record<string, unknown>)['span']
  }
}

/**
 * MAY THIS SPAN BE STORED? Only two things are refused, and neither is about whether the words match.
 *
 * A span that ends before it starts is a mistake in the request. A span on a target that holds no
 * stored text names words nothing keeps. WHETHER THE QUOTE IS STILL THERE IS NOT CHECKED HERE and
 * must not be: the offsets are hints, the quote is the evidence, and `readContext` is what answers
 * that question honestly on every read.
 */
export function checkSpan(context: Context): void {
  const span = context.span
  if (span === undefined) return
  checkSpanShape(span)
  refuseAPlaceQuoteOverTheBound(span.quote)
  const spec = targetSpec(context.target.kind)
  if (!spec.holdsText) {
    throw new PanelError(
      `A ${spec.noun} holds no stored text, so there are no words inside one to quote. ${spec.what} Point at ` +
        `something that holds text, or leave the quote off.`,
    )
  }
}

/**
 * MAY THIS REVISION BE STORED? It has to name a revision the ledger really holds.
 *
 * ---------------------------------------------------------------------------------------
 * MOLE OFFICE CHECKS IT AND NEVER FILLS IT IN
 * ---------------------------------------------------------------------------------------
 *
 * The obvious alternative is for the server to stamp "the newest revision as of now" on every
 * write. It is rejected, and the reason is USER.md's third invariant: that stamp would CLAIM the
 * author had read the newest revision, and nothing measured that. Somebody commenting on a page
 * opened an hour ago wrote against what they were looking at, and a server that says otherwise has
 * fabricated an observation about a person's reading.
 *
 * So the writer sends what it read — `GET /api/records/:id/revisions` is where both halves come
 * from — and this refuses a pair the ledger does not hold. Leaving the revision out entirely is a
 * real answer and means nobody recorded which version this was written against.
 */
export function checkContextRevision(context: Context): void {
  const revision = context.revision
  if (revision === undefined) return
  const spec = targetSpec(context.target.kind)
  const key = spec.recordIdentifier
  if (key === null) {
    throw new PanelError(
      `A ${spec.noun} has no revisions, so nothing can say which revision this was written against. Revisions are ` +
        `of records, and a ${spec.noun} is not one. Leave \`revision\` out.`,
    )
  }
  const recordId = (context.target as unknown as Record<string, string>)[key] ?? ''
  const row = db
    .select()
    .from(revisions)
    .where(and(eq(revisions.recordId, recordId), eq(revisions.seq, revision.seq)))
    .get()
  if (row === undefined) {
    throw new PanelError(
      `Record ${recordId} has no revision ${String(revision.seq)}, so this cannot say it was written against one. ` +
        `GET /api/records/${recordId}/revisions lists the revisions it has. Nothing was stored and nothing was ` +
        `guessed at.`,
      404,
    )
  }
  if (row.contentHash !== revision.contentHash) {
    throw new PanelError(
      `Revision ${String(revision.seq)} of record ${recordId} holds the content "${row.contentHash}", and this says ` +
        `it was written against "${revision.contentHash}". The two name different content, so one of them is about a ` +
        `different revision. Nothing was stored. Read GET /api/records/${recordId}/revisions and send the seq and ` +
        `the contentHash from the same entry.`,
    )
  }
}

// ============================================================================ what a revision held

/** What the revision a comment was written against held where the comment was pointing. */
export interface WrittenAgainst {
  seq: number
  contentHash: string
  /** True when that revision is still in this database's ledger. */
  inTheLedger: boolean
  /**
   * What that revision held in the field the words came from, or null.
   *
   * Null means one of three things and `says` tells them apart: the revision is not here, the
   * comment never said which field its words came from, or that field held nothing at that revision.
   */
  heldThere: string | null
  /** Which field `heldThere` was read from. Null when nothing was read. */
  field: string | null
  says: string
}

/** How much of an old field's text is quoted back. Sixty is what every other quotation here uses. */
const SHOWN = 200

/**
 * READ THE REVISION A COMMENT WAS WRITTEN AGAINST, and say what it held where the comment pointed.
 *
 * This is what turns "the text has changed" into a sentence somebody can act on. Without it a reader
 * is told the words moved and has no way to see what they were sitting in.
 *
 * NOTHING IS REPAIRED HERE EITHER. It reports what an older revision held; it never moves the
 * comment onto it, and it never claims the old text is the current text.
 */
export function readWrittenAgainst(context: Context): WrittenAgainst | null {
  const revision = context.revision
  if (revision === undefined) return null
  const spec = targetSpec(context.target.kind)
  const key = spec.recordIdentifier
  if (key === null) return null
  const recordId = (context.target as unknown as Record<string, string>)[key] ?? ''

  const row = db
    .select()
    .from(revisions)
    .where(and(eq(revisions.recordId, recordId), eq(revisions.seq, revision.seq)))
    .get()
  if (row === undefined) {
    return {
      seq: revision.seq,
      contentHash: revision.contentHash,
      inTheLedger: false,
      heldThere: null,
      field: null,
      says: `Written against revision ${String(revision.seq)} of record ${recordId}, which is not in this database.`,
    }
  }

  const field = spanNamedBy(context)?.field ?? null
  const strings = stringsOfRecord(contentOf(row))
  const hit = field === null ? null : (strings.find((s) => s.field === field) ?? null)

  if (field === null) {
    return {
      seq: revision.seq,
      contentHash: revision.contentHash,
      inTheLedger: true,
      heldThere: null,
      field: null,
      says:
        `This was written against revision ${String(revision.seq)} of record ${recordId}, written ${row.at}. ` +
        `Nothing recorded which part of it the words came from, so Mole Office cannot show what that revision held ` +
        `there. GET /api/records/${recordId}/revisions/${String(revision.seq)} is the whole of it.`,
    }
  }

  if (hit === null) {
    return {
      seq: revision.seq,
      contentHash: revision.contentHash,
      inTheLedger: true,
      heldThere: null,
      field,
      says:
        `This was written against revision ${String(revision.seq)} of record ${recordId}, written ${row.at}, and ` +
        `that revision held nothing at ${field}. So the field the words came from did not exist then either, which ` +
        `is worth knowing before anybody reads the comment as being about today's text.`,
    }
  }

  const shown = hit.text.length <= SHOWN ? hit.text : `${hit.text.slice(0, SHOWN)}…`
  return {
    seq: revision.seq,
    contentHash: revision.contentHash,
    inTheLedger: true,
    heldThere: hit.text,
    field,
    says:
      `This was written against revision ${String(revision.seq)} of record ${recordId}, written ${row.at}. What ` +
      `that revision held at ${field}: "${shown}"`,
  }
}
