// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT EVERY STORED COMMENT POINTS AT, PUT INTO THE SHAPE THE PRODUCT NOW DRAWS. One transaction,
 * written and proved and NOT REGISTERED.
 *
 * ---------------------------------------------------------------------------------------
 * TWO JOBS, ONE TRANSACTION, AND WHY THEY CANNOT BE TWO MIGRATIONS
 * ---------------------------------------------------------------------------------------
 *
 * JOB ONE — every context gets a `place`. This is round nine's step 20, which was written, proved
 * by nine tests, deliberately held out of the tree, and NEVER RAN. Its three rules stand exactly as
 * they were:
 *
 *     a span is there    ->  place = {at: 'words', span}, and the span moves INSIDE the place
 *     no span            ->  place = {at: 'surface'}
 *     it cannot be read  ->  left exactly as it is, and named in the report
 *
 * JOB TWO — every context pointing at a part of a report by its old name gets the new one:
 *
 *     {kind:'reportBlock', blockId:'b-5'}            ->  {kind:'region', regionId:'data.blocks[#b-5]'}
 *     {kind:'tableRow',   blockId:'t1', rowKey:'2'}  ->  ...'data.blocks[#t1].rows[1]'
 *     {kind:'tableCell',  ... columnKey:'2'}         ->  ...'data.blocks[#t1].rows[1].cells[1]'
 *
 * THEY ARE ONE TRANSACTION BECAUSE THEY TOUCH THE SAME ROWS. A single stored comment can need both
 * — a `reportBlock` target with no place — and two migrations would rewrite one record's `data`
 * twice, restamp its newest revision twice, and leave a window between them in which the ledger
 * named content that no longer existed. The restamp and the ledger check below are therefore driven
 * from the UNION of the records the two jobs touch, computed once.
 *
 * ---------------------------------------------------------------------------------------
 * BOTH JOBS WALK ALL THREE CARRIERS
 * ---------------------------------------------------------------------------------------
 *
 * A context is stored in three places and not one: `records.data.context` on an annotation,
 * `agent_messages.context`, and `reviews.entry`. Round nine's migration already walked all three.
 * A conversion that walked only the records would leave a review entry and a queued message naming
 * a `reportBlock` that the browser no longer emits, and the review pane would go quiet about
 * exactly the comments a person is most likely to open.
 *
 * ---------------------------------------------------------------------------------------
 * HOW BIG IT IS, MEASURED RATHER THAN PLANNED
 * ---------------------------------------------------------------------------------------
 *
 * The build plan's window-B table sized job one at 25 rows — 3 annotations, 21 reviews, 1 message —
 * and job two at 10 annotations. NEITHER FIGURE WAS EVER THIS CORPUS'S. Re-measured on 25 August
 * 2026 with the plan's own three statements, by
 * design/round-ten/scratch/w5-contexts-to-regions-count.mjs, against a copy made by SQLite's own
 * backup so the write-ahead log is included:
 *
 *     job one · annotations with a target and no place ....  2
 *     job one · reviews with a target and no place .......   2
 *     job one · messages with a target and no place .....    1
 *     job one, all three carriers .......................    5      (not 25)
 *     job two · annotation targets by kind ..............    record 3, reportBlock 1, uiSurface 3
 *     job two, contexts to convert ......................    1      (not 10)
 *
 * THE COUNTS ARE A PARAMETER AND NOT A CONSTANT HERE, for the reason ./block-identity.ts gives: a
 * function with the corpus's numbers baked in cannot be tested against anything else, and the first
 * thing anybody would do is take the check out. The runner holds the corpus's numbers with the date
 * they were taken; a test holds its fixture's. Any difference and the whole run refuses, naming
 * each one — because a migration that runs against a corpus nobody counted is a broken assumption
 * carried quietly, which is the fourth invariant.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT LIVES HERE AND IS NOT REGISTERED
 * ---------------------------------------------------------------------------------------
 *
 * It is NOT in `drizzle/meta/_journal.json` and NOT in `migrateInPlace`, and that is deliberate.
 * `npm run db:migrate` runs on every clone and on every server start, including the owner's. This
 * rewrites what the owner's stored comments point at. It is applied by its own runner,
 * `run-contexts-to-regions.mjs`, against a database named on the command line, which refuses the
 * live corpus by name. Window B is when it runs for real, and there is no window B in this run.
 *
 * ---------------------------------------------------------------------------------------
 * IT RUNS LAST IN WINDOW B, SO THE RESTAMP IS NOT OPTIONAL
 * ---------------------------------------------------------------------------------------
 *
 * The build plan puts this last in the window and therefore BELOW `migrateRevisions`: the ledger is
 * already built when this runs, so there is no ordering in which a fresh backfill would come along
 * afterwards and put right what this left. Every one of its record-touching writes restamps.
 *
 * A record's newest revision holds what the record holds, and its `content_hash` IS `versionOf()` —
 * the token a read hands back as `version` and the token a write has to send back to prove it is
 * not stale. KEY ORDER INSIDE `data` IS PART OF THAT HASH. So a migration that rewrote
 * `records.data` and left the ledger alone would leave the newest revision holding old content
 * under a hash of old content, and every compare-and-set built from a read of that record would
 * refuse every write — the record would be silently unwritable. That is why `place-migration.ts`
 * restamps at its lines 308 and 347, and this is the same act in the same shape.
 *
 * NO `changes` ROW AND NO `updated_at`. A migration is not somebody saying something. The
 * revision's `note` is set instead, and only where it was empty, so the ledger says in words that a
 * migration moved this and that nobody chose it.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR CHECKS, INSIDE THE TRANSACTION
 * ---------------------------------------------------------------------------------------
 *
 *   1. EVERY CONTEXT THIS WROTE READS BACK AS THE ONE IT MEANT TO WRITE. Re-read from the row, not
 *      from the plan. A carrier that wrote to the wrong column passes every other check.
 *   2. EVERY TOUCHED RECORD'S NEWEST REVISION NAMES WHAT THE RECORD NOW HOLDS. Re-read, not
 *      assumed, and driven from the union of both jobs.
 *   3. EVERY CONVERTED CONTEXT THAT NAMES STORED WORDS STILL FINDS THEM. This is the only one that
 *      can fail on an off-by-one, and it is the reason the conversion is checked at all:
 *      `[#b-5].rows[1]` counts rows from ZERO and a stored `rowKey` counts them from ONE. A
 *      conversion one row out resolves to a REAL region holding the wrong text, which is a comment
 *      silently moved onto somebody else's sentence rather than a comment lost.
 *
 *      **THE BUILD PLAN ASKS THIS OF A `quote` PLACE TOO AND IT CANNOT BE ASKED.** Its words are
 *      the plan's own: *"for every converted context carrying a quote or a words place, the region
 *      the new id resolves to must hold those characters"*. A `quote` is declared in
 *      src/shared/targets.ts as *"words on screen that NO STORED STRING CAN BE SHOWN TO HOLD"*, so
 *      that is a demand for the opposite of what the word means — and the corpus settled it rather
 *      than an argument. This migration's only real conversion is on `NHtlTgnKAG8h` block `b-5` and
 *      carries a quote reading `#⇅Concept⇅Verdict⇅Where it is⇅1…`: a table as a SCREEN drew it,
 *      sort-arrow glyphs and all, not one character of which is in the record.
 *      Under the
 *      plan's rule this migration refuses its own corpus, which is what it did the first time it
 *      was run against a copy. Quotes are therefore COUNTED AND NAMED — `quotesNotCheckable` — and
 *      never quietly treated as checked.
 *   4. NO CONTEXT IS LEFT IN EITHER OLD SHAPE. Asked of the database afterwards, in the plan's own
 *      two statements, so "it is done" is a measurement rather than the absence of an error.
 *
 * All four throw from inside the transaction, so a disagreement rolls the whole thing back. The
 * alternative — reporting afterwards — is a repair nobody can make: the write is committed and the
 * old content is gone.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * IT NEVER GUESSES. No rule here invents a position, a field, a quote or a region. Every span that
 * moves keeps its four values byte for byte; every context without one is given the word that means
 * "nothing finer was recorded", which was already true of it; and every region id is spelled by
 * `regionIdOfLegacyTarget` in src/shared/regions.ts — the ONE converter, which
 * tests/a-part-of-a-report-can-be-pointed-at.test.ts already holds to the same answers the server's
 * own reader gives. A second spelling of that grammar here is the defect this repository names.
 *
 * IT LEAVES A CONTEXT IT CANNOT PLACE EXACTLY AS IT IS, and names it in the report. A record whose
 * `data.context` is a PARAGRAPH OF PROSE is not a context: 24 `module` records in the live corpus
 * hold one. A row is a candidate BY ITS SHAPE and never by its kind or its field name.
 *
 * IT IS SAFE TO RUN TWICE. A context that already carries a place and names no old kind is done: it
 * is counted and not touched. A second run plans nothing, writes nothing, and reports `alreadyDone`.
 */

import type Database from 'better-sqlite3'
import { contentOf, versionOf } from './version.ts'
import { blocksFieldOf } from '../../shared/kinds.ts'
import { withThePlaceItNames, type Context } from '../../shared/targets.ts'
import { findRegion, flatten, regionIdOfLegacyTarget, regionsOf } from '../../shared/regions.ts'
import type { SummaryBlock } from '../../shared/types.ts'

/** Which of the three carriers a row is in. The word a person reads in the report. */
export type Carrier = 'annotation' | 'message' | 'review'

/**
 * The three target kinds that name a part of a report by its old name.
 *
 * They are not deleted from the product: the server still READS them, because an export taken
 * before this names them and a database nobody has migrated still holds them. What stops is the
 * browser emitting them, which wave 5 step 7 already did.
 */
export const OLD_PART_KINDS = ['reportBlock', 'tableRow', 'tableCell'] as const
export type OldPartKind = (typeof OLD_PART_KINDS)[number]

/** One row this migration would not touch, and why. Left exactly as it is. */
export interface SkipNote {
  kind: 'unreadable' | 'no_target' | 'no_blocks_field' | 'no_region_id'
  carrier: Carrier
  id: string
  detail: string
}

/** One rewrite this migration would make, and which of the two jobs asked for it. */
export interface Move {
  carrier: Carrier
  id: string
  /** True when job one put a `place` on this context. */
  placed: boolean
  /** `words` when a span moved inside the place, `surface` when nothing finer was recorded, null when job one did nothing here. */
  becomes: 'words' | 'surface' | null
  /** The old kind this context's target named, or null when job two did nothing here. */
  converted: OldPartKind | null
  /** The region id the target now names, when it was converted. */
  regionId: string | null
  /** The whole context afterwards, as it will be stored. */
  context: string
  /**
   * The record this context POINTS AT, which is whose blocks check 3 reads. Not the same thing as
   * `recordId` below: a message pointing at a report has a record to read and no record to restamp.
   */
  aboutRecordId: string | null
  /** The record whose ledger has to be put right with it. Only an annotation has one. */
  recordId: string | null
}

/** What the caller says it measured. Re-measured here and compared; any difference refuses. */
export interface MeasuredCorpus {
  /** Contexts with a target and no place, over all three carriers. Job one's size. */
  jobOne: number
  /** Contexts whose target names one of the three old part kinds, over all three carriers. Job two's size. */
  jobTwo: number
}

export interface Report {
  /** True when nothing was in either old shape, so this run wrote nothing. */
  alreadyDone: boolean
  /** How many contexts were given a place. */
  placed: number
  /** Of those, how many had a span that moved inside the place. */
  fromSpan: number
  /** Of those, how many had nothing finer recorded and became `surface`. */
  fromNothing: number
  /** How many targets were converted to a region, by the old kind they came from. */
  converted: Readonly<Record<OldPartKind, number>>
  /** How many rows were written at all. Less than `placed + converted` where one row needed both. */
  rowsWritten: number
  /** How many already carried a place and named no old kind. */
  alreadyDoneRows: number
  /** How many rows of the three carriers hold no context at all. */
  withoutContext: number
  /** Rows whose `data.context` is not a context at all — the module paragraphs, and their like. */
  notAContext: { kind: string; id: string }[]
  /** How many newest revisions were rewritten so their hash still names what the record holds. */
  ledgerRestamped: number
  /** How many converted contexts named STORED words, and were checked against the region they now name. */
  wordsChecked: number
  /**
   * How many converted contexts kept words FROM A SCREEN, which no stored string can be shown to
   * hold, so check 3 could not speak for them. Reported rather than counted as checked.
   */
  quotesNotCheckable: number
  /** Every row this would not guess at. */
  notes: SkipNote[]
}

/** As much of a record row as this file reads. */
interface RecordRow {
  id: string
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
}

/** Whether a table is there at all. A fresh database, or one migrated part-way, may not have it. */
function tableIsThere(sqlite: Database.Database, name: string): boolean {
  return sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined
}

/**
 * IS THIS OBJECT A CONTEXT? The shape test, and the only thing that decides.
 *
 * A context carries a `target`, and a target carries a `kind` that is a string. Prose does not, an
 * array does not, and `null` does not. NOTHING HERE ASKS WHAT KIND OF TARGET IT IS: a kind this file
 * has not heard of is still somebody's context and still needs a place, and refusing it here would
 * make this migration go stale the next time a kind is added.
 */
function looksLikeAContext(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const target = (value as Record<string, unknown>)['target']
  if (typeof target !== 'object' || target === null || Array.isArray(target)) return false
  return typeof (target as Record<string, unknown>)['kind'] === 'string'
}

/** The target of a context that has already passed `looksLikeAContext`. */
function targetOf(context: Record<string, unknown>): Record<string, unknown> {
  return context['target'] as Record<string, unknown>
}

/** Whether a target names one of the three old part kinds, and which. */
function oldPartKind(target: Record<string, unknown>): OldPartKind | null {
  const kind = target['kind']
  return OLD_PART_KINDS.find((one) => one === kind) ?? null
}

/**
 * JOB ONE. The rule is round nine's step 20 and it is NOT WRITTEN HERE: it is
 * `withThePlaceItNames` in src/shared/targets.ts, which is the same rule the write paths now apply
 * to every context they store, so a row this migration would place and a row a door writes cannot
 * come out differently. The whole argument for both branches is in that function's comment.
 *
 * `place` LAST AND THE OTHER KEYS IN THE ORDER THEY WERE IN, which is what an object spread does
 * and what the shared rule is written to do, because key order is part of the content hash.
 *
 * THE CAST IS THIS FILE'S OWN HABIT. Everything here reads unvalidated JSON out of a database that
 * may be older than the shape, so a context is a `Record<string, unknown>` that `looksLikeAContext`
 * has said carries a `target`. The shared rule reads two keys and copies the rest, so it is true of
 * that value as well as of a checked one.
 */
function withPlace(context: Record<string, unknown>): {
  context: Record<string, unknown>
  becomes: 'words' | 'surface'
} {
  const placed = withThePlaceItNames(context as unknown as Context) as unknown as Record<string, unknown>
  return { context: placed, becomes: context['span'] === undefined ? 'surface' : 'words' }
}

/**
 * JOB TWO. The new target, with the region id spelled by the ONE converter.
 *
 * `blocksField` is the field that record's kind keeps its blocks in — `blocks` on a report,
 * `summaryBlocks` on a module — read from `blocksFieldOf` rather than assumed, because a module's
 * curated summary lives somewhere else and a conversion that assumed `blocks` would spell an id
 * that resolves to nothing on every module.
 *
 * THE OTHER KEYS OF THE TARGET GO. `recordId` stays because a region names one; `blockId`, `rowKey`
 * and `columnKey` are INSIDE the region id now, and keeping them beside it would be the same fact
 * in two fields — free to disagree the first time anything edited either.
 */
function withRegion(
  context: Record<string, unknown>,
  blocksField: string | null,
): { context: Record<string, unknown>; regionId: string } | null {
  const target = targetOf(context)
  const regionId = regionIdOfLegacyTarget(
    {
      kind: String(target['kind']),
      ...(typeof target['blockId'] === 'string' ? { blockId: target['blockId'] } : {}),
      ...(typeof target['rowKey'] === 'string' ? { rowKey: target['rowKey'] } : {}),
      ...(typeof target['columnKey'] === 'string' ? { columnKey: target['columnKey'] } : {}),
    },
    blocksField,
  )
  if (regionId === null) return null
  const recordId = target['recordId']
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    next[key] = key === 'target' ? { kind: 'region', recordId, regionId } : value
  }
  return { context: next, regionId }
}

/**
 * The words a context kept, AND WHICH OF THE TWO KINDS OF WORDS THEY ARE. Null when it kept none.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO ARE NOT CHECKABLE TO THE SAME DEGREE, AND THE PLAN SAID THEY WERE
 * ---------------------------------------------------------------------------------------
 *
 * `stored` — a `words` place. It names a stored field and two offsets into it, so "are these
 * characters part of what this region covers" has an answer, and check 3 demands one.
 *
 * `fromScreen` — a `quote` place. src/shared/targets.ts declares it in these words: *"Words on
 * screen that NO STORED STRING CAN BE SHOWN TO HOLD. Kept exactly, as evidence."* Demanding that a
 * region hold them is demanding the opposite of what the word means.
 *
 * THE BUILD PLAN ASKS FOR BOTH — *"for every converted context carrying a quote or a words place,
 * the region the new id resolves to must hold those characters"* — and the corpus is what settled
 * it. The one stored `reportBlock` comment there, on `NHtlTgnKAG8h` block `b-5`, carries a quote
 * whose words are a TABLE AS A SCREEN DREW IT: `#⇅Concept⇅Verdict⇅Where it is⇅1…`, sort-arrow
 * glyphs and all, run together with no separators. Not one of those characters is in the stored
 * record, and none ever was. Under the plan's rule this migration refuses
 * its own corpus's
 * only conversion, which is what happened the first time it was run against a copy.
 *
 * So a quote is COUNTED AND NAMED rather than checked or waved through: `quotesNotCheckable` says
 * how many conversions this check could not speak for, and why. That is invariant five — *nobody
 * looked* is a different answer from *nothing is there* — rather than a check quietly weakened to
 * whatever the data would pass.
 */
function wordsKeptBy(context: Record<string, unknown>): { words: string; how: 'stored' | 'fromScreen' } | null {
  const place = context['place']
  if (typeof place === 'object' && place !== null && !Array.isArray(place)) {
    const at = (place as Record<string, unknown>)['at']
    if (at === 'quote') {
      const words = (place as Record<string, unknown>)['words']
      return typeof words === 'string' && words !== '' ? { words, how: 'fromScreen' } : null
    }
    if (at === 'words') {
      const span = (place as Record<string, unknown>)['span']
      if (typeof span === 'object' && span !== null) {
        const quote = (span as Record<string, unknown>)['quote']
        return typeof quote === 'string' && quote !== '' ? { words: quote, how: 'stored' } : null
      }
    }
  }
  return null
}

/** What this migration would do, without doing any of it. The preview, the runner and the test read this. */
export function planContextsToRegions(sqlite: Database.Database): {
  moves: Move[]
  notes: SkipNote[]
  alreadyDoneRows: number
  withoutContext: number
  notAContext: { kind: string; id: string }[]
} {
  const moves: Move[] = []
  const notes: SkipNote[] = []
  const notAContext: { kind: string; id: string }[] = []
  let alreadyDoneRows = 0
  let withoutContext = 0

  /** Which field a record kind keeps its blocks in, asked once per record rather than per context. */
  const blocksFieldOfRecord = new Map<string, string | null>()
  const recordKind = tableIsThere(sqlite, 'records')
    ? sqlite.prepare('SELECT id, kind FROM records')
    : null
  if (recordKind !== null) {
    for (const row of recordKind.all() as { id: string; kind: string }[]) {
      blocksFieldOfRecord.set(row.id, blocksFieldOf(row.kind))
    }
  }

  /** One stored context, whichever carrier it came out of. */
  const consider = (carrier: Carrier, id: string, stored: string | null, recordId: string | null): void => {
    if (stored === null) {
      withoutContext += 1
      return
    }
    let read: unknown
    try {
      read = JSON.parse(stored)
    } catch {
      notes.push({
        kind: 'unreadable',
        carrier,
        id,
        detail: 'the stored JSON does not parse, so nothing here knows what it was meant to say',
      })
      return
    }
    if (!looksLikeAContext(read)) {
      notes.push({
        kind: 'no_target',
        carrier,
        id,
        detail: 'it carries no `target` naming a kind, so there is nothing here to place or to convert',
      })
      return
    }

    let context = read
    let placed = false
    let becomes: 'words' | 'surface' | null = null
    let converted: OldPartKind | null = null
    let regionId: string | null = null

    // JOB ONE FIRST, so that job two's `withRegion` copies a context that already carries its place
    // and the key order of the stored object is decided once.
    if (context['place'] === undefined) {
      const next = withPlace(context)
      context = next.context
      placed = true
      becomes = next.becomes
    }

    const old = oldPartKind(targetOf(context))
    const aboutRecordId = typeof targetOf(context)['recordId'] === 'string' ? (targetOf(context)['recordId'] as string) : null
    if (old !== null) {
      // WHICH FIELD THAT RECORD KEEPS ITS BLOCKS IN. Unknown record, unknown field: this is left
      // exactly as it is and named, because a region id spelled against a guessed field is an id
      // that resolves to nothing and a comment that has quietly stopped pointing at anything.
      const field = aboutRecordId === null ? undefined : blocksFieldOfRecord.get(aboutRecordId)
      if (field === undefined || field === null) {
        notes.push({
          kind: 'no_blocks_field',
          carrier,
          id,
          detail:
            aboutRecordId === null
              ? 'its target names no record, so nothing here can say which field holds the blocks it points into'
              : `record ${aboutRecordId} is not in this database, or its kind keeps no blocks, so there is no field to spell a region id against`,
        })
        if (!placed) {
          alreadyDoneRows += 1
          return
        }
      } else {
        const next = withRegion(context, field)
        if (next === null) {
          notes.push({
            kind: 'no_region_id',
            carrier,
            id,
            detail: `a ${old} target that names no block cannot be spelled as a region id, so it is left as it is`,
          })
        } else {
          context = next.context
          converted = old
          regionId = next.regionId
        }
      }
    }

    if (!placed && converted === null) {
      alreadyDoneRows += 1
      return
    }
    moves.push({
      carrier,
      id,
      placed,
      becomes,
      converted,
      regionId,
      context: JSON.stringify(context),
      aboutRecordId,
      recordId,
    })
  }

  if (tableIsThere(sqlite, 'records')) {
    const rows = sqlite.prepare('SELECT id, kind, data FROM records').all() as {
      id: string
      kind: string
      data: string
    }[]
    for (const row of rows) {
      let data: unknown
      try {
        data = JSON.parse(row.data)
      } catch {
        // A record whose whole `data` will not parse holds no readable context, and saying so here
        // would report a fault about a field this file is not about.
        continue
      }
      if (typeof data !== 'object' || data === null || Array.isArray(data)) continue
      const context = (data as Record<string, unknown>)['context']
      if (context === undefined) continue
      if (!looksLikeAContext(context)) {
        notAContext.push({ kind: row.kind, id: row.id })
        continue
      }
      consider('annotation', row.id, JSON.stringify(context), row.id)
    }
  }

  if (tableIsThere(sqlite, 'agent_messages')) {
    const rows = sqlite.prepare('SELECT id, context FROM agent_messages').all() as {
      id: string
      context: string | null
    }[]
    for (const row of rows) consider('message', row.id, row.context, null)
  }

  if (tableIsThere(sqlite, 'reviews')) {
    const rows = sqlite.prepare('SELECT id, entry FROM reviews').all() as { id: string; entry: string | null }[]
    for (const row of rows) consider('review', row.id, row.entry, null)
  }

  return { moves, notes, alreadyDoneRows, withoutContext, notAContext }
}

/**
 * WHAT IS IN THE OLD SHAPE, ASKED OF THE DATABASE IN THE PLAN'S OWN TWO STATEMENTS.
 *
 * Used twice: once before anything is written, to compare against what the caller says it measured;
 * and once inside the transaction as check 4, where both answers must be zero. Asking the database
 * rather than counting the plan is the point — "it is done" is then a measurement rather than the
 * absence of an error.
 */
export function countOldShapes(sqlite: Database.Database): MeasuredCorpus {
  const one = (sql: string): number => {
    try {
      return sqlite.prepare(sql).pluck().get() as number
    } catch {
      return 0
    }
  }
  const kinds = OLD_PART_KINDS.map((k) => `'${k}'`).join(', ')
  const jobOne =
    one(
      "SELECT count(*) FROM records WHERE kind='annotation' AND deleted_at IS NULL AND json_extract(data,'$.context.target.kind') IS NOT NULL AND json_extract(data,'$.context.place') IS NULL",
    ) +
    one("SELECT count(*) FROM reviews WHERE json_extract(entry,'$.target.kind') IS NOT NULL AND json_extract(entry,'$.place') IS NULL") +
    one(
      "SELECT count(*) FROM agent_messages WHERE json_extract(context,'$.target.kind') IS NOT NULL AND json_extract(context,'$.place') IS NULL",
    )
  const jobTwo =
    one(
      `SELECT count(*) FROM records WHERE kind='annotation' AND deleted_at IS NULL AND json_extract(data,'$.context.target.kind') IN (${kinds})`,
    ) +
    one(`SELECT count(*) FROM reviews WHERE json_extract(entry,'$.target.kind') IN (${kinds})`) +
    one(`SELECT count(*) FROM agent_messages WHERE json_extract(context,'$.target.kind') IN (${kinds})`)
  return { jobOne, jobTwo }
}

/**
 * PUT THE NEW CONTEXT INSIDE THE RECORD'S `data`, KEEPING EVERY OTHER FIELD AND ITS ORDER.
 *
 * The record's own key order is preserved because it is part of the content hash: rebuilding the
 * object with `context` moved to the end would change the token on every annotation for no reason,
 * and every open composer holding one would be refused as stale.
 */
function dataWithContext(data: string, context: string): string {
  const read = JSON.parse(data) as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(read)) next[key] = key === 'context' ? JSON.parse(context) : value
  return JSON.stringify(next)
}

/**
 * DO IT. One transaction: either every row moves and all four checks agree, or nothing moves.
 *
 * `measured` is what the caller says it counted. It is re-measured here and compared before a single
 * row is written; any difference refuses the whole run, naming both numbers.
 */
export function migrateContextsToRegions(sqlite: Database.Database, measured: MeasuredCorpus): Report {
  const { moves, notes, alreadyDoneRows, withoutContext, notAContext } = planContextsToRegions(sqlite)

  const here = countOldShapes(sqlite)
  const wrong: string[] = []
  if (here.jobOne !== measured.jobOne) {
    wrong.push(`job one: you measured ${measured.jobOne} contexts with a target and no place; this database holds ${here.jobOne}`)
  }
  if (here.jobTwo !== measured.jobTwo) {
    wrong.push(
      `job two: you measured ${measured.jobTwo} contexts naming a ${OLD_PART_KINDS.join(', ')}; this database holds ${here.jobTwo}`,
    )
  }
  if (wrong.length > 0) {
    throw new Error(
      `This is not the corpus that was counted, so nothing was written.\n  ${wrong.join('\n  ')}\n` +
        'Re-run design/round-ten/scratch/w5-contexts-to-regions-count.mjs against this database and hand the ' +
        'runner what it prints. A migration that runs against a corpus nobody counted is a broken assumption ' +
        'carried quietly.',
    )
  }

  const converted: Record<OldPartKind, number> = { reportBlock: 0, tableRow: 0, tableCell: 0 }
  const report: Report = {
    alreadyDone: moves.length === 0,
    placed: 0,
    fromSpan: 0,
    fromNothing: 0,
    converted,
    rowsWritten: 0,
    alreadyDoneRows,
    withoutContext,
    notAContext,
    ledgerRestamped: 0,
    wordsChecked: 0,
    quotesNotCheckable: 0,
    notes,
  }
  if (moves.length === 0) return report

  const setRecord = sqlite.prepare('UPDATE records SET data = ? WHERE id = ?')
  const setMessage = sqlite.prepare('UPDATE agent_messages SET context = ? WHERE id = ?')
  const setReview = sqlite.prepare('UPDATE reviews SET entry = ? WHERE id = ?')
  const readRecord = sqlite.prepare('SELECT id, kind, title, summary, data, deleted_at FROM records WHERE id = ?')
  const newestRevision = sqlite.prepare('SELECT id, seq, note FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
  const restamp = sqlite.prepare('UPDATE revisions SET data = ?, content_hash = ?, note = ? WHERE id = ?')
  const ledgerIsThere = tableIsThere(sqlite, 'revisions')

  const run = sqlite.transaction(() => {
    for (const move of moves) {
      if (move.carrier === 'annotation') {
        const row = readRecord.get(move.id) as RecordRow | undefined
        if (row === undefined) throw new Error(`Record ${move.id} went between planning this migration and running it.`)
        setRecord.run(dataWithContext(row.data, move.context), move.id)
      } else if (move.carrier === 'message') {
        setMessage.run(move.context, move.id)
      } else {
        setReview.run(move.context, move.id)
      }
      report.rowsWritten += 1
      if (move.placed) {
        report.placed += 1
        if (move.becomes === 'words') report.fromSpan += 1
        else report.fromNothing += 1
      }
      if (move.converted !== null) converted[move.converted] += 1
    }

    // ---- THE LEDGER, AFTER EVERY ROW HAS MOVED, so the content it is stamped from is the final
    // one. DRIVEN FROM THE UNION: one pass over the records BOTH jobs touched, each restamped once,
    // because a record needing both jobs is one record and two restamps would leave the second
    // hashing content the first had already replaced.
    if (ledgerIsThere) {
      const touched = new Set<string>()
      for (const move of moves) {
        if (move.recordId === null || touched.has(move.recordId)) continue
        touched.add(move.recordId)
        const row = readRecord.get(move.recordId) as RecordRow | undefined
        if (row === undefined) continue
        const newest = newestRevision.get(move.recordId) as { id: string; seq: number; note: string | null } | undefined
        if (newest === undefined) continue
        const content = contentOf({
          kind: row.kind,
          title: row.title,
          summary: row.summary,
          data: JSON.parse(row.data) as Record<string, unknown>,
          deletedAt: row.deleted_at,
        })
        const note =
          newest.note ??
          'A migration put `place` into what this comment points at, and gave the part of the report it names its ' +
            'own address. Nobody chose either: they say what was already true of the comment, and their time is ' +
            "this migration's moment rather than the moment somebody wrote."
        restamp.run(JSON.stringify(content.data), versionOf(content), note, newest.id)
        report.ledgerRestamped += 1
      }
    }

    const checked = checkEverything(sqlite, moves)
    report.wordsChecked = checked.wordsChecked
    report.quotesNotCheckable = checked.quotesNotCheckable
  })

  run()
  return report
}

/** The four checks, in order, all thrown from inside the transaction. Answers how many words it checked. */
function checkEverything(
  sqlite: Database.Database,
  moves: readonly Move[],
): { wordsChecked: number; quotesNotCheckable: number } {
  const readRecord = sqlite.prepare('SELECT id, kind, title, summary, data, deleted_at FROM records WHERE id = ?')
  const readMessage = sqlite.prepare('SELECT context FROM agent_messages WHERE id = ?')
  const readReview = sqlite.prepare('SELECT entry FROM reviews WHERE id = ?')

  // ---- CHECK 1. Every context this wrote reads back as the one it meant to write, from the ROW.
  // A carrier that wrote to the wrong column passes every other check in this function.
  for (const move of moves) {
    let stored: string | null | undefined
    if (move.carrier === 'annotation') {
      const row = readRecord.get(move.id) as RecordRow | undefined
      const data = row === undefined ? null : (JSON.parse(row.data) as Record<string, unknown>)
      stored = data === null ? null : JSON.stringify(data['context'])
    } else if (move.carrier === 'message') {
      stored = (readMessage.get(move.id) as { context: string | null } | undefined)?.context
    } else {
      stored = (readReview.get(move.id) as { entry: string | null } | undefined)?.entry
    }
    if (stored !== move.context) {
      throw new Error(
        `Check 1 failed and nothing was written. The ${move.carrier} ${move.id} was meant to hold ` +
          `${move.context} and holds ${String(stored)}. A context written into the wrong column would pass ` +
          'every other check here.',
      )
    }
  }

  // ---- CHECK 2. Every touched record's newest revision names what the record NOW holds. Re-read,
  // not assumed, and over the UNION of the records both jobs touched.
  if (tableIsThere(sqlite, 'revisions')) {
    const newestHash = sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
    const seen = new Set<string>()
    for (const move of moves) {
      if (move.recordId === null || seen.has(move.recordId)) continue
      seen.add(move.recordId)
      const row = readRecord.get(move.recordId) as RecordRow | undefined
      if (row === undefined) continue
      const held = newestHash.get(move.recordId) as { content_hash: string } | undefined
      if (held === undefined) continue
      const want = versionOf(
        contentOf({
          kind: row.kind,
          title: row.title,
          summary: row.summary,
          data: JSON.parse(row.data) as Record<string, unknown>,
          deletedAt: row.deleted_at,
        }),
      )
      if (held.content_hash !== want) {
        throw new Error(
          `Check 2 failed and nothing was written. Record ${move.recordId}'s newest revision is stamped ` +
            `${held.content_hash} and the record now hashes to ${want}. Left as it was, every write to that ` +
            'record would be refused as stale, for ever.',
        )
      }
    }
  }

  // ---- CHECK 3. Every converted context that kept words still finds them, in the region the new
  // id names. THE ONLY ONE THAT CAN FAIL ON AN OFF-BY-ONE, and the reason the conversion is checked
  // at all: `rows[1]` counts from zero and a stored `rowKey` counts from one, so a conversion one
  // row out resolves to a REAL region holding somebody else's sentence.
  let wordsChecked = 0
  let quotesNotCheckable = 0
  for (const move of moves) {
    if (move.converted === null || move.regionId === null || move.aboutRecordId === null) continue
    const context = JSON.parse(move.context) as Record<string, unknown>
    const kept = wordsKeptBy(context)
    if (kept === null) continue
    const row = readRecord.get(move.aboutRecordId) as RecordRow | undefined
    if (row === undefined) continue
    const field = blocksFieldOf(row.kind)
    if (field === null) continue
    const data = JSON.parse(row.data) as Record<string, unknown>
    const blocks = data[field]
    if (!Array.isArray(blocks)) continue
    const region = findRegion(regionsOf({ field, blocks: blocks as SummaryBlock[] }), move.regionId)
    if (region === null) {
      throw new Error(
        `Check 3 failed and nothing was written. The ${move.carrier} ${move.id} was converted to ` +
          `${move.regionId} and no region of ${move.aboutRecordId} has that id, so the comment would point at ` +
          'nothing at all.',
      )
    }
    // WORDS FROM A SCREEN CANNOT BE LOOKED FOR IN A STORED STRING, and that is what `quote` means
    // rather than a gap in this check. Counted and named, never waved through.
    if (kept.how === 'fromScreen') {
      quotesNotCheckable += 1
      continue
    }
    // A CONTAINER'S CHARACTERS ARE ITS CHILDREN'S. `data.blocks[#b-5]` is a passage and its own
    // `text` is empty: the derivation cuts the characters into the paragraphs inside it. So the
    // question is asked of the SUBTREE — does any part of what this region draws hold the words —
    // which is what "the region the new id resolves to must hold those characters" means for a
    // region that draws other regions. Asking only the region's own slice would fail every block
    // comment there is, which is the majority of what this migration converts.
    if (!flatten(region).some((one) => one.text.includes(kept.words))) {
      throw new Error(
        `Check 3 failed and nothing was written. The ${move.carrier} ${move.id} names the stored words ` +
          `${JSON.stringify(kept.words)} and the region ${move.regionId} it was converted to does not hold them. ` +
          'A conversion one row or one cell out lands on a real region holding somebody else\'s sentence, which ' +
          'is a comment silently moved rather than a comment lost.',
      )
    }
    wordsChecked += 1
  }

  // ---- CHECK 4. Nothing is left in either old shape, asked of the DATABASE in the plan's own two
  // statements rather than counted off the plan.
  const left = countOldShapes(sqlite)
  if (left.jobOne !== 0 || left.jobTwo !== 0) {
    throw new Error(
      `Check 4 failed and nothing was written. After the run this database still holds ${left.jobOne} contexts ` +
        `with no place and ${left.jobTwo} naming an old part kind. "It is done" has to be a measurement rather ` +
        'than the absence of an error.',
    )
  }

  return { wordsChecked, quotesNotCheckable }
}

/** The report as a person reads it. Every number the transaction produced, and nothing invented. */
export function describeContextsToRegions(report: Report): string {
  if (report.alreadyDone) {
    return (
      `regions: Nothing to do: ${report.alreadyDoneRows} stored contexts already carry a place and name no old part kind, ` +
      `${report.withoutContext} rows hold no context at all.`
    )
  }
  const lines = [
    `regions: ${report.rowsWritten} stored contexts rewritten, over all three carriers.`,
    `  job one — ${report.placed} given a place: ${report.fromSpan} from a span that moved inside it, ` +
      `${report.fromNothing} that had nothing finer recorded.`,
    `  job two — ${report.converted.reportBlock} reportBlock, ${report.converted.tableRow} tableRow, ` +
      `${report.converted.tableCell} tableCell converted to a region id.`,
    `  ${report.ledgerRestamped} newest revisions restamped, so no touched record is left unwritable.`,
    `  ${report.wordsChecked} converted contexts name stored words, and each was found in the region it now names.`,
    `  ${report.quotesNotCheckable} kept words from a screen, which no stored string can be shown to hold, so ` +
      'check 3 could not speak for those.',
    `  ${report.alreadyDoneRows} were already done; ${report.withoutContext} rows hold no context.`,
  ]
  if (report.notAContext.length > 0) {
    lines.push(
      `  ${report.notAContext.length} records hold a \`data.context\` that is not a context — prose, most often — ` +
        'and were not touched.',
    )
  }
  for (const note of report.notes) lines.push(`  LEFT AS IT IS — ${note.carrier} ${note.id}: ${note.detail}`)
  return lines.join('\n')
}
