// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FINDING ONE REMARK FROM ITS OWN ID, AND ASKING FORTY OF THEM AT ONCE WHETHER THEY HAVE GONE STALE.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO THINGS A REVIEW LIST COULD NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * A remark is a record of kind `annotation`, so `GET /api/records/<id>` already hands one back. That
 * gives the words and the stored context, and it does not answer either of the two questions a list
 * of remarks has to answer on every row:
 *
 *   HAS THE QUOTE GONE STALE? The reading — `there`, `changed`, `gone` or `unknown` — is computed,
 *   never stored, because a stored answer to "is this still there" is only ever right by accident.
 *   Measured on 18 August 2026, a review list with two stale quotes out of seven drew all seven
 *   rows the same, because nothing asked. `POST /api/annotations/readings` is one request for the
 *   whole list.
 *
 *   WHERE DO I GO TO SEE IT? A remark points at a block of a report, a cell of a table, a line of a
 *   plan. `readAnnotation` hands back which record or plan it is in, which block, and which words —
 *   enough for a page to open the right thing and light the right characters.
 *
 * ---------------------------------------------------------------------------------------
 * IT HANDS BACK IDS AND NOT ADDRESSES
 * ---------------------------------------------------------------------------------------
 *
 * The browser owns its own routes and this file does not know them. A reply carries the ids, the
 * titles, and `key` — the same string an addressable element on screen carries as `data-target` —
 * and the page builds its own address from those. A route table written here would be a second copy
 * of the browser's, free to go stale the first time a page moved. `FocusReading` in
 * src/server/lib/agents.ts already answers the same way, with ids.
 */

import {
  nameTarget,
  spanNamedBy,
  targetKey,
  targetSpec,
  type Context,
  type TargetIds,
  type TargetKind,
} from '@shared/targets.ts'
import type { PanelRecord, RecordKind } from '@shared/types.ts'
// WHERE A PART OF A RECORD IS, IN ONE SENTENCE, FROM THE ONE PLACE THAT ASSEMBLES ONE. `leftOn`
// below says why a word a person reads may not be spelled in this file, and why the review pane
// reads the same two functions.
import { whereAPartIs, type HolderInASentence, type Region } from '@shared/regions.ts'
import { readContext, type ContextReading } from './agents.ts'
// THE PART ITSELF AND WHICH PART IT IS, out of the same derived tree `resolveTarget` reads, so
// naming a part and asking whether it is still there cannot come to different views of what the
// record holds — and so the pane and this page cannot name one part two ways.
import { partOfRecordNamed } from './targets.ts'
import { getRecord, recordInWorkspace } from './records.ts'
import { PanelError } from './panel-error.ts'
import { whoWroteRecord } from '../db/who-wrote-record.ts'
import { getPlan } from './get-plan.ts'
// THE ONE TABLE BETWEEN WHAT MOLE OFFICE STORES AND WHAT A PERSON READS. These sentences are drawn under a
// comment in the review pane, so a stored kind may not reach one of them as itself.
import { hasGoneOut as goneOut } from './dispatch.ts'
import { kindWord } from '@shared/words.ts'
import { isAComment, theMessagesHiddenFrom, type AMessageReader } from './messages.ts'

/** At most this many readings come back from one request. */
export const MAX_READINGS = 200

// ============================================================================ reading the stored shape

/** The context stored on a record of kind `annotation`, or a refusal saying what is wrong with it. */
function contextOf(record: PanelRecord): Context {
  // WHICHEVER KEY THE KIND KEEPS IT UNDER. A comment of the older kind keeps it in `context`; a
  // message that says where it points keeps it in `target`. One fact, two spellings, read here.
  const held = record.kind === 'message' ? record.data['target'] : record.data['context']
  if (typeof held !== 'object' || held === null || Array.isArray(held)) {
    throw new PanelError(
      `The comment ${record.id} stores no context, so nothing can say what it was left on. Every annotation has ` +
        `one — GET /api/kinds says so on the \`annotation\` kind — so this row was written before that was true ` +
        `or by something that went round the write path. The words are still there: ` +
        `GET /api/records/${record.id}.`,
      500,
    )
  }
  const target = (held as Record<string, unknown>)['target']
  if (typeof target !== 'object' || target === null || Array.isArray(target)) {
    throw new PanelError(
      `The comment ${record.id} stores a context with nothing in it saying what kind of thing it points at, so ` +
        `Mole Office cannot look it up or take anybody to it. Nothing has been guessed. The words are still there: ` +
        `GET /api/records/${record.id}.`,
      500,
    )
  }
  return held as unknown as Context
}

/** The record must be one, and must be an annotation. Both refusals name what was found instead. */
function annotationInWorkspace(id: string, workspaceId: string, reader?: AMessageReader): PanelRecord {
  // A COMMENT THAT IS A MESSAGE THIS READER MAY NOT READ is refused inside `recordInWorkspace`, in the
  // words an id naming nothing is refused with.
  const record = recordInWorkspace(id, workspaceId, reader)
  // A COMMENT IS EITHER KIND. Records of kind `annotation` are every comment written before the one
  // message pool; a message that says what on a page it is about is every comment written since
  // (criterion M1). A route that read only the first would go quiet on every new comment.
  if (!isAComment(record)) {
    throw new PanelError(
      `${id} is a ${kindWord(record.kind).text}, not a comment somebody left on something. A comment says what on ` +
        `a page it is about; this one says nothing. GET /api/records/${id} reads any record.`,
      404,
    )
  }
  return record
}

// ============================================================================ where a remark is

/** Which record or plan a remark is in, which block, and which words. */
export interface AnnotationWhere {
  /** One of the thirteen things a person can point at. */
  targetKind: TargetKind
  /** What one of those is called in a sentence a person reads. */
  noun: string
  /** Everything that identifies it, by key: `recordId`, `blockId`, `rowKey`, `planId`, `lineId`. */
  ids: TargetIds
  /**
   * THE SAME STRING AN ADDRESSABLE ELEMENT ON SCREEN CARRIES AS `data-target`.
   *
   * A page compares the key it built for a thing it drew with this one and there is exactly one
   * spelling of a key in this product. Two spellings, one on each side, fails silently: every mark
   * simply stops being drawn.
   */
  key: string
  /** The record this is inside, when it is inside one. Null for a plan line or a block on the week. */
  record: { id: string; kind: string; title: string; workspaceId: string } | null
  /** The plan this is inside, when it is inside one. */
  plan: { id: string; title: string } | null
  /** Which block of that record, when the target names one. */
  blockId: string | null
  /** The words, where they were, and which stored string they came from. Null when none were quoted. */
  quote: { words: string; from: number; to: number; field: string | null } | null
  /**
   * WHAT THE COMMENT WAS LEFT ON, NAMED THE WAY A PERSON WOULD NAME IT, AND WHERE THAT IS.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT IT REPLACES, MEASURED ON THE LIVE CORPUS ON 31 AUGUST 2026
   * ---------------------------------------------------------------------------------------
   *
   * The page that draws a comment built this phrase from `record` alone — src/web/pages/RecordPage.tsx
   * at :4072 — so every comment on a PART of a record read back as a comment on the WHOLE of it.
   * Four comments read through the live API that day:
   *
   *   a comment      region  data.blocks[#b-pattern-table]           a table
   *   a comment      region  data.blocks[#b-pattern-table].rows[1]   one row of it
   *   a comment      region  section.openAround                      a declared section
   *   a comment      record  m2Q0CybxoGNF                            the whole report
   *
   * All four printed the identical sentence: *Left on the whole of the report "Round eight: …",
   * rather than on particular words.* Pointing had been fixed at write time and the reading still
   * said the root, which is the visible half of that work undone.
   *
   * ---------------------------------------------------------------------------------------
   * HOW THE PHRASE IS BUILT, AND WHAT IS NEVER INVENTED
   * ---------------------------------------------------------------------------------------
   *
   * The thing, then where it is: `the table in the report "…"`. The thing's word comes from a
   * declaration and never from this file — `wordForRegion` in src/shared/regions.ts for a part of a
   * record, the target's own `noun` from src/shared/targets.ts for everything else — so a word a
   * reader sees here is the word the composer used when they pointed at it.
   *
   * WHERE THE TARGET IS THE WHOLE OF A RECORD OR A PLAN, IT IS THAT AND NOTHING ELSE. `record`
   * and `annotation` name a record and nothing inside one, and `the record in the report "…"` would
   * be the same thing said twice. Which kinds those are is read off `identifies` in the target
   * declaration rather than listed here; see `namesSomethingInside`.
   *
   * NOTHING IS GUESSED WHEN THE PART IS NOT THERE. A region whose id the record no longer holds is
   * named by the target declaration's own noun — *part of a record* — which stays true whatever
   * happened to the characters. `reading` is what says it moved or went, and it says so separately.
   */
  leftOn: string
  /** Where to go, in one sentence a person reads. */
  says: string
}

/**
 * DOES THIS KIND OF TARGET NAME SOMETHING INSIDE A RECORD OR A PLAN, rather than the whole of one?
 *
 * READ OFF THE DECLARATION, NEVER LISTED HERE. A target that names something inside a record
 * carries an identifier for it beyond the record's own id — `regionId`, `blockId`, `rowKey`,
 * `changeId`, `lineId` — and one that IS the record carries nothing but the record's identity.
 * `workspaceId` is the project the record is filed in and is not something inside it.
 *
 * A LIST OF KINDS WRITTEN OUT HERE WOULD BE A SECOND DECLARATION, free to disagree with
 * `TARGET_SPECS` the first time a kind is added — and it would disagree silently, by printing
 * *the record in the report "…"* about a comment on a whole record.
 */
/**
 * WHICH PART OF A RECORD A COMMENT WAS LEFT ON, ready for the one function that puts the sentence
 * together.
 *
 * `namesOfParts` is the ONE place that answers which part something is — a paragraph by how it
 * opens, a cell by what it reads and the row it sits in, the gist by its own noun, a declared
 * section by its title — and `partOfRecordNamed` in ./targets.ts asks it of the same tree
 * `resolveTarget` resolves against. THE REVIEW PANE READS THAT SAME MAP — see `whatARegionHolds`
 * there — so the sentence under a comment on the record page and the sentence in the pane cannot
 * come to two answers about one place. That is D-R3, and it is why neither file names a part itself.
 *
 * NULL IS NOT A PART: it is a record that does not hold this id any more, and the answer is the noun
 * every region has whatever became of it, with no role to read and nothing guessed in its place.
 */
function namePart(
  found: { region: Region; name: string } | null,
  noun: string,
): { name: string; role: Region['role'] | null } {
  // A RECORD THIS DATABASE DOES NOT HOLD, OR A PART IT NO LONGER HOLDS, IS THE SAME HONEST ANSWER
  // AND NEITHER IS FILLED IN. The target declaration's own noun stays true whatever happened to the
  // characters. A kind guessed here would name a section of a record nobody can open.
  if (found === null) return { name: noun, role: null }
  return { name: found.name, role: found.region.role }
}

function namesSomethingInside(kind: TargetKind): boolean {
  const spec = targetSpec(kind)
  return spec.identifies.some(
    (one) => one.key !== spec.recordIdentifier && one.key !== 'planId' && one.key !== 'workspaceId',
  )
}

/**
 * THE RECORD A COMMENT POINTS AT, WHEN IT IS A MESSAGE THIS READER MAY NOT READ.
 * Its id is in the comment's own context, which the reader may read; its title, its words and what it
 * holds now are not given. Null for any other target, and for a reader who reads every message.
 */
function aMessageHiddenFromTheReader(context: Context, reader: AMessageReader | undefined): string | null {
  if (reader === undefined) return null
  const spec = targetSpec(context.target.kind)
  const recordId = spec.recordIdentifier === null ? null : ((context.target as unknown as TargetIds)[spec.recordIdentifier] ?? null)
  if (recordId === null) return null
  return theMessagesHiddenFrom(reader, [recordId]).has(recordId) ? recordId : null
}

/** What is said about whether a comment still holds, when it was left on a message the reader may not read. */
function aReadingOfAHiddenMessage(context: Context): ContextReading {
  return {
    state: 'unknown',
    about: nameTarget(context.target),
    says: 'This comment was left on a message you may not read, so nothing is said here about what it was left on.',
  }
}

function whereItIs(context: Context, hidden: string | null = null): AnnotationWhere {
  const target = context.target
  const spec = targetSpec(target.kind)
  const ids = target as unknown as TargetIds

  const recordKey = spec.recordIdentifier
  const recordId = recordKey === null ? null : (ids[recordKey] ?? null)
  // A MESSAGE THE READER MAY NOT READ IS NOT LOOKED UP, so its title, and the part of it the comment
  // names, are quoted nowhere below: the sentences name it as the target's own words do, by its id.
  const found = recordId === null || recordId === hidden ? null : getRecord(recordId)
  const record =
    found === null ? null : { id: found.id, kind: found.kind, title: found.title, workspaceId: found.workspaceId }

  const planId = ids['planId'] ?? null
  const plan = planId === null ? null : getPlan(planId)

  const span = spanNamedBy(context)
  const blockId = ids['blockId'] ?? null

  const inside =
    record !== null
      ? `in the ${kindWord(record.kind).text} "${record.title}" (${record.id})`
      : plan !== null
        ? `in the plan "${plan.title}" (${plan.id})`
        : `in ${nameTarget(target)}`

  // WHERE THE COMMENT WAS LEFT, FOR A READER. The record or the plan, in the words that name it on
  // every other screen, and the part of it when the target names one. `leftOn` above says what each
  // half is and where its words come from.
  //
  // NO ID ON EITHER SIDE. This sentence is drawn under a comment on the record page, where the
  // reader is already on the record; the review pane's sentence carries both ids because Developer
  // detail is where a reader meets them. That is the one difference between the two, and it is a
  // difference in what is HANDED to `whereAPartIs` rather than a second way of writing a sentence.
  const holder: HolderInASentence | null =
    record !== null
      ? { word: kindWord(record.kind).text, title: record.title, recordId: null }
      : plan !== null
        ? { word: 'plan', title: plan.title, recordId: null }
        : null
  const part =
    target.kind === 'region' && hidden === null
      ? // THE PART, AND WHICH PART, OUT OF THE SAME DERIVED TREE THE PAGE DRAWS FROM, ASKED ONCE.
        // Null means this record does not hold that part today, and then the declaration's own noun
        // is the honest answer.
        namePart(partOfRecordNamed(target.recordId, target.regionId), spec.noun)
      : // A TARGET THAT NAMES SOMETHING INSIDE A RECORD WITHOUT BEING A REGION — a block, a row of
        // a table, one change, a line of a plan. It has no region and therefore no role, and the
        // declaration's own noun is what it has always read as.
        { name: spec.noun, role: null }
  const leftOn =
    holder === null
      ? `the ${part.name}`
      : namesSomethingInside(target.kind)
        ? whereAPartIs({ ...part, regionId: null }, holder)
        : `the ${holder.word} “${holder.title}”`

  return {
    targetKind: target.kind,
    noun: spec.noun,
    ids,
    key: targetKey(target),
    record,
    plan: plan === null ? null : { id: plan.id, title: plan.title },
    blockId,
    quote: span === null ? null : { words: span.quote, from: span.from, to: span.to, field: span.field ?? null },
    leftOn,
    says:
      // WHERE IT IS, THEN WHICH WORDS. A page needs both and a person reads the first one.
      `On ${nameTarget(target)}, ${inside}.` +
      (span === null
        ? ` Nothing was quoted, so this is about the whole of it rather than particular words.`
        : ` The words it was left on are "${span.quote}"` +
          (span.field === undefined
            ? `, and nothing recorded which part of it they came from.`
            : `, at character ${String(span.from)} of ${span.field}.`)),
  }
}

// ============================================================================ one remark, whole

export interface AnnotationView {
  id: string
  workspaceId: string
  /** WHAT THE PERSON WROTE, exactly. Never rewritten by anything. */
  body: string
  /**
   * WHETHER THIS COMMENT'S WORDS HAVE GONE TO ANYBODY: `queued` or `sent`.
   *
   * WORKED OUT, NEVER STORED. Until window B it was `data.state` on the record — a SECOND place
   * where "this has gone out" was written down, stamped from the browser after a send, in a
   * try/catch that reported its failure and changed nothing, and walkable backwards. Window B took
   * that field off the kind and emptied it on every comment in the corpus, so this is now the same
   * question the server's own gate asks: `hasGoneOut`, which is true when a message carrying these
   * words is past `queued` or a marker says they went out before Mole Office recorded which conversation
   * carried them. One store, one writer, and nothing un-sends a message.
   *
   * `answered` was the third word and it is not one of these two. Nothing wrote it truthfully — the
   * six words `agent_messages.state` carries are where a dispatch has got to, and `deliveryWordOf`
   * projects them into the words the surfaces show the person.
   */
  state: string
  /** What it points at, as stored. */
  context: Context
  /** Which record or plan, which block, which words. */
  where: AnnotationWhere
  /** Whether what it points at is still there, and whether the quoted words have moved. */
  reading: ContextReading
  /** Who they seemed to mean, in their own words. A hint, never a decision. Null when nobody said. */
  recipientHint: string | null
  /**
   * WHAT MOLE OFFICE MADE OF THE WORDS, shown beside them and never instead of them. Null when nothing
   * has read them, which is every remark today — nothing in Mole Office organises one yet.
   */
  interpretation: string | null
  created: string
  /** Who wrote it, from the ledger. Null when nobody recorded it. */
  createdBy: string | null
  says: string
}

function stringField(record: PanelRecord, key: string): string | null {
  const held = record.data[key]
  return typeof held === 'string' && held !== '' ? held : null
}

/** One remark, with everything a page needs to take somebody to what it is about. */
export function readAnnotation(id: string, workspaceId: string, reader?: AMessageReader): AnnotationView {
  const record = annotationInWorkspace(id, workspaceId, reader)
  const context = contextOf(record)
  const hidden = aMessageHiddenFromTheReader(context, reader)
  const where = whereItIs(context, hidden)
  const reading = hidden === null ? readContext(context) : aReadingOfAHiddenMessage(context)
  const interpretation = stringField(record, 'interpretation')
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    body: stringField(record, 'body') ?? '',
    state: goneOut(record.id, record.workspaceId) ? 'sent' : 'queued',
    context,
    where,
    reading,
    recipientHint: stringField(record, 'recipientHint'),
    interpretation,
    created: record.createdAt,
    // FROM THE LEDGER, not from the record: a record row has no author column, and `ownerId` is not
    // one — it holds the owner's own name whenever an agent wrote the row. Null means nobody
    // recorded it, which is a real answer and not somebody in particular.
    createdBy: whoWroteRecord(record.id),
    says:
      `${where.says} ${reading.says}` +
      (interpretation === null ? ' Nothing has organised these words yet, so they stand as they were written.' : ''),
  }
}

// ============================================================================ forty at once

/** One row of the answer: the reading, or why there is none. */
export type AnnotationReading =
  | {
      found: true
      id: string
      /** Whether what it points at is still there, and whether the quoted words have moved. */
      reading: ContextReading
      /** The same string an addressable element on screen carries as `data-target`. */
      key: string
      /** The words that were quoted, or null when none were. */
      quote: string | null
    }
  | { found: false; id: string; says: string }

export interface AnnotationReadings {
  readings: AnnotationReading[]
  /** How many of the ids asked about answered with a reading. */
  read: number
  /** How many could not be read, each said in `readings`. */
  unread: number
  says: string
}

/**
 * WHETHER EACH OF THESE REMARKS HAS GONE STALE, IN ONE REQUEST.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A ROUTE AND NOT FORTY READS
 * ---------------------------------------------------------------------------------------
 *
 * A review list draws one row per remark and every row needs the reading. Asking per row is forty
 * requests, and the thing that goes wrong is not that it is slow: it is that a list which cannot
 * afford to ask stops asking, and then every row draws the quote and nothing else. That is what was
 * measured on 18 August 2026 with two of seven quotes stale.
 *
 * ---------------------------------------------------------------------------------------
 * AN ID THAT ANSWERS NOTHING IS REPORTED, NEVER LEFT OUT
 * ---------------------------------------------------------------------------------------
 *
 * A missing row silently shortens the list, and a caller comparing lengths learns only that
 * something went wrong. Each id gets an entry, and one that is not an annotation of this project
 * says which of those two it is.
 */
export function readAnnotations(ids: readonly string[], workspaceId: string, reader?: AMessageReader): AnnotationReadings {
  if (ids.length > MAX_READINGS) {
    throw new PanelError(
      `Ask about at most ${String(MAX_READINGS)} comments at once; this asked about ${String(ids.length)}. Nothing ` +
        `was read.`,
    )
  }
  // ONE READ PER NOTE, THEN ONE READING PER NOTE, in one REQUEST. The reading needs the thing each
  // note points at, which is a read of its own, so a single SQL statement would not make this one
  // query in any case. What a list of forty could not afford was forty requests, and that is what
  // this removes.
  // A COMMENT THAT IS A MESSAGE THIS READER MAY NOT READ is answered as an id naming
  // nothing. So the row does not say it is there.
  const hiddenComments = reader === undefined ? new Set<string>() : theMessagesHiddenFrom(reader, ids)
  const readings = ids.map((id): AnnotationReading => {
    const record = hiddenComments.has(id) ? null : getRecord(id)
    if (record === null) {
      return { found: false, id, says: `There is no record ${id}, so there is no comment here to read.` }
    }
    if (record.workspaceId !== workspaceId) {
      return {
        found: false,
        id,
        says:
          `The comment ${id} is filed in "${record.workspaceId}" and this request is about "${workspaceId}". Ask ` +
          `again with x-mole-office-workspace: ${record.workspaceId}.`,
      }
    }
    if (record.kind !== 'annotation') {
      return { found: false, id, says: `${id} is a ${kindWord(record.kind).text}, not a comment somebody left on something.` }
    }
    if (record.deletedAt !== null) {
      return {
        found: false,
        id,
        says: `The comment ${id} was deleted at ${record.deletedAt}. Its words are still in the record.`,
      }
    }
    let context: Context
    try {
      context = contextOf(record)
    } catch (error) {
      return { found: false, id, says: error instanceof Error ? error.message : String(error) }
    }
    return {
      found: true,
      id,
      reading: aMessageHiddenFromTheReader(context, reader) === null ? readContext(context) : aReadingOfAHiddenMessage(context),
      key: targetKey(context.target),
      quote: spanNamedBy(context)?.quote ?? null,
    }
  })

  const read = readings.filter((r) => r.found).length
  const stale = readings.filter((r) => r.found && r.reading.state !== 'there').length
  return {
    readings,
    read,
    unread: readings.length - read,
    says:
      `${String(read)} of ${String(readings.length)} comment${readings.length === 1 ? '' : 's'} read. ` +
      (read === 0
        ? `Nothing could be read; each row says why.`
        : `${String(stale)} of them point at something that has changed, gone, or that Mole Office cannot say either ` +
          `way about — the row says which. A reading is computed on this request and never stored, because a ` +
          `stored answer to "is this still there" is only ever right by accident.`),
  }
}
