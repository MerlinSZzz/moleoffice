// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING THE REVISION LEDGER: what a record held, what changed between two of those, and putting
 * one back.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE WRITING IS, AND WHY IT IS NOT HERE
 * ---------------------------------------------------------------------------------------
 *
 * `saveRevision` is in src/server/lib/records/save-revision.ts, and it is the ONLY thing that writes this
 * table. That is deliberate: every write to the `records` table calls it beside `logChange`, and
 * a revision has to be written in the same transaction as the write it is of. A writer over here
 * would be a second door into the ledger that the eight write sites could forget to use.
 *
 * This file only READS — with one exception, `restoreRevision` below, which writes nothing itself:
 * it calls `patchRecord`, the same function an ordinary PATCH calls, so the validation, the
 * human-only gate, the change log and the revision all happen exactly as they do on any other edit.
 *
 * ---------------------------------------------------------------------------------------
 * ONE DIFFER, AND THIS FILE IS NOT IT
 * ---------------------------------------------------------------------------------------
 *
 * Comparing two revisions is the same question the record page's change log asks about one change
 * row's two values: which field paths differ, and what did each go from and to. There were two
 * candidates to reuse and the choice is written down here because the wrong one is easy to reach for:
 *
 *   `mergeData` in lib/records/merge-data.ts is NOT a comparison. It is a MERGE: it reports the paths named in
 *   the patch it was given, so a key that is present in the earlier revision and ABSENT from the
 *   later one is not in its answer at all. Using it here would silently drop every removal, and a
 *   ledger that cannot say a field was removed is the failure this whole table exists to prevent.
 *
 *   `diffValues` in src/web/components/ChangeLog.tsx IS a comparison, and it is the one. It walks
 *   two decoded values, handles a key added on one side and removed on the other as their own
 *   answers, and compares arrays of identified items by id rather than by position.
 *
 * So the walk moved to src/shared/fielddiff.ts — the one directory the browser and the server may
 * both import — and both read it. `fieldsThatDiffer` is the entry point for two decoded values,
 * which is what this file holds; `diffValues` is the same walk over two stored JSON strings, which
 * is what a change row holds. THERE IS NO THIRD DIFFER AND NONE MAY BE ADDED.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A REVISION PAIR AND THE CHANGE ROWS OF THE SAME WRITE LINE UP, EXACTLY
 * ---------------------------------------------------------------------------------------
 *
 * They name the same changes. They do not always name them at the same DEPTH, and that is a
 * property of the two, measured rather than assumed, and worth knowing before anybody reads a
 * difference in depth as a disagreement:
 *
 *   AN ORDINARY EDIT MATCHES EXACTLY. A title, a summary, a merge patch, one checklist line: the
 *   ledger's paths and the change rows' `field` values are the same strings, because `mergeData`
 *   and this walk both name a path through `pathStep`.
 *
 *   A CREATE AND A DELETE WRITE A CHANGE ROW WITH NO FIELD AT ALL. `logChange(id, 'create', …)`
 *   passes null, and so does the delete. The ledger answers `changed: null` for the create — there
 *   is no revision before it — and `deletedAt` for the delete.
 *
 *   A WHOLESALE `data` WRITE IS ONE CHANGE ROW AND SEVERAL LEDGER PATHS. `PATCH {"data":{…}}`
 *   writes a single row whose field is `data`; the ledger names each key inside it that moved. The
 *   change row is the shallower of the two.
 *
 *   A KIND CHANGE CAN BE THE OTHER WAY ROUND. Moving a field into `extra` writes a change row at
 *   the exact key — `data.extra.state` — and the ledger reports `data.extra` whole, because `extra`
 *   did not exist before and an added key is shown with its content rather than walked into. The
 *   ledger is the shallower of the two there.
 *
 * SO THE RULE THAT HOLDS IN BOTH DIRECTIONS is that every change row's field and some ledger path
 * are one a prefix of the other, and no change is named by only one of them. Anything stronger than
 * that is a claim about depth rather than about what changed.
 *
 *   ONE EXCEPTION, AND IT IS `workspaceId`. A move writes a change row saying the project moved and
 *   the ledger names nothing, because a revision's content does not carry the project — see
 *   `RevisionContent` below. tests/revision-ledger-agrees-with-the-change-log.test.ts names the same
 *   exception and excuses no other field.
 */

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { keptStatement } from '../db/kept-statement.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { comparableAsStored, revisionsReaderOf, wholeRevisionData, type ReadARevision } from '../db/revision-stored-once.ts'
import { revisions } from '../db/schema.ts'
import {
  checkSubtraction,
  leftOutWords,
  REVISION_ROWS_BUCKET_WORDS,
  type LeftOutCounts,
  type LeftOutGroup,
  type RevisionRowsBucket,
} from '@shared/disclosure.ts'
import { fieldsThatDiffer, type FieldDiff } from '@shared/fielddiff.ts'
import type { ActorType, HowACallerProvedItself, PanelRecord, RecordKind, RevisionOp } from '@shared/types.ts'
import { getRecord, patchRecord, versionOf, everyAgentAStoredStampCouldName, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { contentOf as sharedContentOf } from './version.ts'
import { warrantAsStored, type Warrant } from '@shared/warrant.ts'
import { anOfficeOnlyFieldAWholeDataWouldMove } from './office-only-run-fields.ts'
import { caughtUpNote } from '../db/revision-backfill.ts'
import type { Incompleteness } from './validate.ts'
import { numbering } from '../db/numbering.ts'
import { getRevisionRow } from './get-revision-row.ts'
import type { TheEndsOfTheLedger, WhoWroteTheValue, WhoWroteTheColumn } from '../db/types/revisions.ts'

/**
 * How many revisions one list answers with.
 *
 * A LIMIT WITH A COUNT AND A FLAG BESIDE IT, never a silent cut. `GET /api/records/:id` serves a
 * record's whole change log with no limit and no flag saying whether anything was left out, which is
 * a known defect and is deliberately not copied here.
 *
 * NOTHING IS UNREACHABLE BECAUSE OF THIS, and that is why there is no paging. `seq` is 1-based and
 * gapless, and `count` says how many there are, so every revision this list leaves out is addressable
 * by number at GET /api/records/:id/revisions/:seq. A page parameter would be a second way to ask a
 * question that is already answerable.
 */
export const REVISIONS_LISTED = 200

/**
 * ONE REVISION'S STORED FIELDS, AS ONE OBJECT — the thing a comparison walks.
 *
 * ---------------------------------------------------------------------------------------
 * NO REVISION REPORTS A PROJECT, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * `revisions.workspace_id` is a FILTER column. It says which project the ROW belongs to now, exactly
 * as it does on a change row, and a move re-stamps it on every revision of the record it carries so
 * that a project-scoped archive stays whole. It is therefore not a statement about the past, and it
 * is not served as one: a record filed in `default` and later moved to `greenhouse` would otherwise
 * have revision 1 reporting `greenhouse`, which is false about the moment revision 1 was written.
 *
 * TWO REASONS, AND BOTH ARE THE POINT.
 *
 * `versionOf` never hashed the project, so content and `contentHash` now describe exactly the same
 * five fields: kind, title, summary, data and deletedAt. Before this, two revisions could differ in
 * a field their hashes could not see.
 *
 * AND NOTHING IS LOST. "When did this record move" is already answered by the change log, which
 * writes a row whose field is `workspaceId`, carrying the project it came from and the one it
 * went to.
 */
export interface RevisionContent {
  kind: RecordKind
  title: string
  summary: string | null
  data: Record<string, unknown>
  /** The soft-delete stamp AS IT WAS. A delete writes a revision, and this is what it carries. */
  deletedAt: string | null
}

/** Who wrote a revision: the same three a change row carries, from the same headers. */
export interface RevisionActor {
  actorType: ActorType
  actorId: string
  /** The session responsible, when there was one. Null means nobody said. */
  sessionId: string | null
  /** Today's unambiguous registry reading of this stored stamp; not historical authentication or a key-derived value. */
  resolvedAgentId: string | null
}

/** One revision as a reader gets it, without the content. */
export interface RevisionHeader {
  id: string
  seq: number
  contentHash: string
  op: RevisionOp
  who: RevisionActor
  /** Release authorization needs the stored proof of this revision, not an actor name. Old rows stay null. */
  provedBy: HowACallerProvedItself | null
  /** Only the stored holder id; no key material or inferred authentication is served. */
  provedHolder: string | null
  /** When it was written, LOCAL wall clock. */
  at: string
  /** Why, when somebody said. Null means nobody did, which is the ordinary case for an edit. */
  note: string | null
  /**
   * THE PERSON'S OWN WORDS THIS WRITE WAS MADE ON, when it was made on any. Null is the ordinary
   * answer and means this was an ordinary write that stood on nobody's words.
   *
   * SERVED BESIDE `who`, BECAUSE IT IS THE OTHER HALF OF THE SAME SENTENCE. `who` says an agent
   * wrote this; the warrant says the agent wrote it because the owner said so, and what they said.
   * Verifier 6 found `revisions.warrant` filled and this endpoint not serving it: the record page
   * drew the act and the version history — the place a person goes to read the trail — did not.
   * `design/messages/ACCEPTANCE.md` W2 asks that every surface saying who did something says it was
   * done on the person's words.
   */
  warrant: Warrant | null
  /**
   * WHICH EARLIER VERSION OF THIS RECORD THIS ONE TOOK BACK. Null on every ordinary write.
   *
   * SERVED FOR THE SAME REASON `warrant` ABOVE IS, and it is the other half of the same trail. A
   * revocation is an ordinary restore or an ordinary delete as far as `op` can say, so a reader
   * given only `op` reads "an earlier version put back" and never learns that a person took an act
   * back. Without this column the version history can also mark an act *on the owner's words* long
   * after the person revoked it, which is the one thing that mark must never say.
   *
   * IT IS READ OFF THE SAME ROW AS `warrant`, never counted or looked up again: the revocation and
   * the act it took back are one insert apart in one transaction, in `revokeAnActOnTheirWords`.
   */
  revokesSeq: number | null
}

/** One entry of the list: a revision, and what changed from the one before it. */
export interface RevisionEntry extends RevisionHeader {
  /**
   * What changed from the revision BEFORE this one, or null when there is no revision before it.
   *
   * NULL IS NOT AN EMPTY LIST. Null means there is nothing earlier to compare with — this is the
   * first revision of the record. An empty list means the two were compared and nothing differed,
   * which really happens: moving a record between projects writes a revision, and a revision's
   * content does not carry the project, so that revision holds exactly what its predecessor held.
   */
  changed: FieldDiff[] | null
}

/** What GET /api/records/:id/revisions answers. */
export interface RevisionListing {
  recordId: string
  /** Every revision this record has, whether or not all of them are in `revisions` below. */
  count: number
  /** Newest first. */
  revisions: RevisionEntry[]
  /** True when `count` is larger than the list, so the reader knows something was left out. */
  truncated: boolean
  /** How many this endpoint will list at once. */
  limit: number
  /**
   * WHAT THE ROW LIMIT LEFT OUT, declared the way every capped read declares it (src/shared/disclosure.ts):
   * every version is either listed or in a group, and each group names every version it holds by id.
   */
  subtraction: LeftOutCounts
  leftOutGroups: LeftOutGroup<RevisionRowsBucket>[]
  /** The versions left out, in words, from the bucket's own word map. Null when every version is listed. */
  says: string | null
  note: string
}

/** What GET /api/records/:id/revisions/:seq answers. */
export interface OneRevision extends RevisionHeader {
  recordId: string
  content: RevisionContent
  note: string
  /** The `note` somebody wrote on this revision, kept separate from the sentence above. */
  why: string | null
}

/** What GET /api/records/:id/revisions/:seq/compare/:otherSeq answers. */
export interface RevisionComparison {
  recordId: string
  from: RevisionHeader
  to: RevisionHeader
  /** Every field path that differs, with what it went from and to. Empty means they are the same. */
  differences: FieldDiff[]
  note: string
}

/** One stored row, as drizzle hands it back. */
export type Row = typeof revisions.$inferSelect

function headerOf(row: Row): RevisionHeader {
  const authors = row.actorType === 'agent' ? everyAgentAStoredStampCouldName(row.actorId) : []
  return {
    id: row.id,
    seq: row.seq,
    contentHash: row.contentHash,
    op: row.op as RevisionOp,
    who: { actorType: row.actorType as ActorType, actorId: row.actorId, sessionId: row.sessionId, resolvedAgentId: authors.length === 1 ? authors[0]!.id : null },
    provedBy: row.provedBy,
    provedHolder: row.provedHolder?.id ?? null,
    at: row.at,
    note: row.note,
    // ONE READER OF THE STORED COLUMN, in @shared/warrant.ts, the same one the record page's own
    // panel uses. A row whose stored text is not a warrant reads as null rather than as a shape
    // invented for it, and the raw column is untouched and still readable.
    warrant: warrantAsStored(row.warrant),
    revokesSeq: row.revokesSeq,
  }
}

/**
 * ONE READER OF THE FIVE FIELDS A REVISION STORES, and it is the one the hash is built from.
 *
 * There used to be a second copy here. The two agreed on the five fields and disagreed about an
 * absent `data`: `src/server/lib/version.ts` normalises it to `{}` and this did not. So the served
 * content and its own `contentHash` were worked out by different readers — the recurring defect in
 * this codebase, in the one place where the whole point is that a hash names its content.
 */
function contentOf(row: Row, read: ReadARevision = revisionsReaderOf(sqlite)): RevisionContent {
  // WHOLE, as the record held it: a revision that stores a value once is given it back from the revision that holds it
  // (src/server/db/revision-stored-once.ts), and one that throws there is not read as if it were whole.
  return sharedContentOf({ ...row, data: wholeRevisionData(row, read) })
}

/**
 * THE THREE FACTS THE `History` CONTROL IS DRAWN FROM, and it is never drawn from one.
 *
 * Measured on a `VACUUM INTO` copy of the owner's corpus on 26 August 2026 by
 * `tools/measure-the-history.mjs`: **361 of 707 records have exactly one revision and its `op` is
 * `baseline`** — a row the ledger backfill wrote, holding what the record already holds. On those
 * pages a badge reading `History 1` promises an earlier version that was never stored, and a reader
 * who follows it arrives at the thing they just left. `baselineOnly` is what lets the control say
 * `History` with no numeral there.
 *
 * (The design says 530 of 646. That was the old corpus copy, and the figure moves — which is why
 * the script that takes it is in the repository and this comment names the day it was taken.)
 *
 * IT IS NOT A STORED FLAG and it writes no counting SQL of its own. It is `numbering()` and one
 * `op`, so the badge on the header and the first line of the History section below it cannot
 * disagree: they are two readings of one statement.
 */
export function historyBadge(recordId: string): { versions: number; baselineOnly: boolean } {
  const { count } = numbering(recordId)
  if (count !== 1) return { versions: count, baselineOnly: false }
  const only = db
    .select({ op: revisions.op })
    .from(revisions)
    .where(eq(revisions.recordId, recordId))
    .get()
  return { versions: count, baselineOnly: only?.op === 'baseline' }
}

/**
 * A record's revisions, newest first, each with what changed from the one before it.
 *
 * IT READS ONE MORE ROW THAN IT ANSWERS WITH, on purpose. The oldest revision on the page needs its
 * predecessor to say what changed, and that predecessor is off the page. Reading it and not listing
 * it is the difference between "nothing changed here" and "the row before this is not in front of
 * you"; answering the first when the second is true would be a fabricated observation.
 */
export function listRevisions(recordId: string, limit: number = REVISIONS_LISTED): RevisionListing {
  // ONE QUERY FOR ALL FOUR FACTS. This used to call a second function called `countRevisions` here
  // and `numbering` twenty lines below, so how many revisions there are was worked out twice from
  // two statements. They cannot disagree now because there is only one of them, and that second
  // function is GONE rather than left where a third caller could find it: see
  // `tests/one-count-of-versions.test.ts`.
  const { gapless, contiguous, lowest, highest, count } = numbering(recordId)
  const rows = db
    .select()
    .from(revisions)
    .where(eq(revisions.recordId, recordId))
    .orderBy(desc(revisions.seq))
    // One extra, as the predecessor of the last one listed. Never returned.
    .limit(limit + 1)
    .all()

  const listed = rows.slice(0, limit)
  const read = revisionsReaderOf(sqlite)
  const entries = listed.map((row, i): RevisionEntry => {
    const earlier = rows[i + 1]
    // Two revisions that store the same value once by the same hash differ as stored exactly where they differ whole,
    // so they are compared as stored and the value is not put back twice for each line of the list.
    const changed =
      earlier === undefined
        ? null
        : comparableAsStored(earlier, row)
          ? fieldsThatDiffer(sharedContentOf(earlier), sharedContentOf(row))
          : fieldsThatDiffer(contentOf(earlier, read), contentOf(row, read))
    return { ...headerOf(row), changed }
  })

  // THE VERSIONS THE LIMIT LEFT OUT, BY ID, the older ones past the last listed. Read as ids only, so a long
  // history costs one narrow query rather than every version's content.
  const leftOutIds =
    count > listed.length
      ? (
          db
            .select({ id: revisions.id })
            .from(revisions)
            .where(eq(revisions.recordId, recordId))
            .orderBy(desc(revisions.seq))
            .all() as { id: string }[]
        )
          .slice(listed.length)
          .map((row) => row.id)
      : []
  const leftOutGroups: LeftOutGroup<RevisionRowsBucket>[] = [
    { cause: 'budget', bucket: 'row_limit', count: leftOutIds.length, ids: leftOutIds },
  ]
  const subtraction: LeftOutCounts = { candidates: count, carried: listed.length, leftOut: leftOutIds.length, shortened: 0 }
  checkSubtraction('listRevisions', subtraction, leftOutGroups)

  const truncated = count > listed.length
  // ASKED, NOT ASSUMED. The sentences below used to state that `seq` is 1-based and gapless, which
  // is true of every ledger this server writes and not true of every ledger it can be handed.
  // See `numbering`, which tells apart a ledger that starts above 1 from one with a hole inside it.
  return {
    recordId,
    count,
    revisions: entries,
    truncated,
    limit,
    subtraction,
    leftOutGroups,
    says: subtraction.leftOut === 0 ? null : leftOutWords(REVISION_ROWS_BUCKET_WORDS.row_limit, subtraction.leftOut),
    note:
      count === 0
        ? `Nothing in the version history answers to record ${recordId}. Either no record has that id, or this ` +
          `database has not been through the backfill that gives every existing record its first version — ` +
          `\`npm run db:migrate\` is what runs it.`
        : `${count} version${count === 1 ? '' : 's'} of ${nameOf(rows[0])}, newest first` +
          `${truncated ? `, of which ${listed.length} are listed here` : ''}. ` +
          `\`changed\` on each entry is what moved between it and the version before it; it is null on the ` +
          `oldest one, because there is nothing earlier to compare with. ` +
          (gapless
            ? truncated
              ? `\`seq\` is 1-based and gapless here, so every version left out is reachable by number at ` +
                `GET /api/records/${recordId}/revisions/<seq>.`
              : `Every version this record has is here.`
            : contiguous
              ? `THIS RECORD'S HISTORY STARTS AT ${String(lowest)} HERE, not at 1, and nothing is missing between ` +
                `${String(lowest)} and ${String(highest)}. The versions before ${String(lowest)} are not in this ` +
                `database. A history this server wrote starts at 1, so the usual cause is a project-scoped archive ` +
                `of a record whose earlier versions are filed in another project. Read \`changed: null\` on the ` +
                `oldest entry as "the version before it is not here" rather than as "this is where the record began".`
              : `THIS HISTORY HAS A HOLE IN IT: the numbers run ${String(lowest)} to ${String(highest)} and there are ` +
                `only ${String(count)}, so some of this record's history is not in this database. A history this ` +
                `server wrote has no gaps, so the usual cause is a project-scoped archive of a record whose other ` +
                `versions are filed in another project. Read \`changed: null\` on the oldest entry as "the ` +
                `version before it is not here" rather than as "this is where the record began".`),
  }
}

/**
 * WHAT TO CALL A RECORD IN A SENTENCE: its title, as the version being described carried it.
 *
 * Step 41 left the ledger's sentences naming a record by its id — *"Revision 2 of record
 * m2Q0CybxoGNF was already what the record held"* — which is an address standing where a name
 * belongs. The title comes off the revision row rather than off the record, because a sentence about
 * version 2 that names the record by today's title is a small untruth about what version 2 held.
 *
 * The id is not lost: every one of these replies carries `recordId` as a field of its own, and the
 * routes that need it are written out in full where they are needed.
 */
function nameOf(row: Row | undefined): string {
  return row === undefined ? 'this record' : `"${row.title}"`
}

export { numbering } from '../db/numbering.ts'

export { noSuchRevision } from './get-revision-row.ts'

/**
 * The newest revision of a record, or a refusal naming the record.
 *
 * Read by `seq` descending rather than as "revision number `count`". The two answer the same on a
 * gapless ledger, and they are not the same claim: one asks the table, the other assumes the rule
 * the unique index enforces. A restore reports the number it wrote, so it asks.
 */
function newestRevision(recordId: string): Row {
  const row = db
    .select()
    .from(revisions)
    .where(eq(revisions.recordId, recordId))
    .orderBy(desc(revisions.seq))
    .limit(1)
    .get()
  if (row === undefined) {
    throw new PanelError(
      `Record ${recordId} has no versions at all, so there is nothing to write a restore on top of. Either no ` +
        `record answers to that id, or this database has not been through the backfill that gives every existing ` +
        `record its first version — \`npm run db:migrate\` is what runs it.`,
      404,
    )
  }
  return row
}

/**
 * WHICH REVISION HOLDS EXACTLY THIS CONTENT, or null because none in this database does.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A READ OF A RECORD HANDS THIS BACK
 * ---------------------------------------------------------------------------------------
 *
 * A remark may say which revision it was written against, and Mole Office CHECKS that pair and never
 * fills it in — stamping "the newest revision as of now" would claim the author had read the newest
 * revision, and nothing measured that. So the writer has to send a `seq` and a `contentHash` from
 * one entry of the ledger.
 *
 * That left a browser with a second request to make before every remark, which is the sort of cost
 * that ends with nothing sending a revision at all. It does not have to: a caller that has just
 * read a record REALLY DID read one particular revision, and `version` on that reply is that
 * revision's content hash. This turns the hash it already has into the number that goes beside it.
 * Nothing is claimed that was not measured — the pair names the content the caller was handed.
 *
 * IT ASKS FOR THE CONTENT RATHER THAN FOR THE NEWEST ROW. "The newest revision" and "the revision
 * holding what you just read" are the same on a quiet database and different the moment somebody
 * else writes between the read and the reply. The second is the true one, and it is the one a
 * remark needs.
 *
 * NULL IS A REAL ANSWER and means this database's ledger holds nothing with that content: a record
 * written before the ledger existed and never backfilled, or one restored from an archive that
 * carried only some of its revisions.
 */
export function revisionHoldingContent(recordId: string, contentHash: string): number | null {
  const row = db
    .select({ seq: revisions.seq })
    .from(revisions)
    .where(and(eq(revisions.recordId, recordId), eq(revisions.contentHash, contentHash)))
    .orderBy(desc(revisions.seq))
    .limit(1)
    .get()
  return row === undefined ? null : row.seq
}

export { whoWroteRecords } from '../db/who-wrote-records.ts'

export type { TheEndsOfTheLedger, WhoWroteTheValue, WhoWroteTheColumn } from '../db/types/revisions.ts'

export { theEndsOfTheLedger } from '../db/who-wrote-records.ts'

export { whoWroteRecord } from '../db/who-wrote-record.ts'

export { whoWroteTheValue } from '../db/who-wrote-the-value.ts'

export { theRevisionsNewestFirst } from '../db/who-wrote-the-value.ts'

export { whoWroteTheColumn } from '../db/who-wrote-the-column.ts'

/** Who put the value one field of a checklist line holds there. */
export interface WhoWroteTheLineField {
  actorType: ActorType
  actorId: string
  /** The session record of the run that wrote it, or null where the write named no run. */
  sessionId: string | null
  /** When that revision was written, LOCAL wall clock, as it is stored. */
  at: string
  /** Which revision it was. */
  seq: number
}

/** The line with this id in a stored `data`, from whichever part holds it. Undefined when none does. */
function theLineIn(data: unknown, itemId: string): Record<string, unknown> | undefined {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return undefined
  const parts = (data as Record<string, unknown>)['parts']
  if (!Array.isArray(parts)) return undefined
  for (const part of parts) {
    if (part === null || typeof part !== 'object' || Array.isArray(part)) continue
    const items = (part as Record<string, unknown>)['items']
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
      if ((item as Record<string, unknown>)['id'] === itemId) return item as Record<string, unknown>
    }
  }
  return undefined
}

/**
 * WHO PUT THE VALUE EACH NAMED FIELD OF ONE CHECKLIST LINE HOLDS NOW THERE — read from the ledger.
 *
 * The same walk as `whoWroteTheValue` above, one level down: for each key, go back from the newest
 * revision while the line holds the same value under that key, and stop at the write that put it
 * there. The line is found by its id in whichever part holds it, so a line moved between parts is
 * still the same line. Values are compared as JSON, so a missing key and a key that is present are
 * different values.
 *
 * NULL FOR A KEY MEANS THE LEDGER CANNOT SAY. It is null when the record has no revisions, when the
 * newest revision does not hold what `line` holds (the ledger and the record disagree), and when the
 * write it stops at was made by the ledger's own backfill: a `baseline` row, or a row carrying
 * `caughtUpNote`. Those rows say in their own words that they are not evidence of who made the write.
 *
 * `patchChecklistItem` in lib/records/checklist-items.ts is the caller. It asks this before it writes, so the answer
 * is about the line the write is about to change.
 */
export function whoWroteEachFieldOfALine(
  recordId: string,
  itemId: string,
  /** The line as the record holds it now. */
  line: Record<string, unknown>,
  keys: readonly string[],
): Map<string, WhoWroteTheLineField | null> {
  const rows = db
    .select({
      seq: revisions.seq,
      data: revisions.data,
      op: revisions.op,
      note: revisions.note,
      actorType: revisions.actorType,
      actorId: revisions.actorId,
      sessionId: revisions.sessionId,
      at: revisions.at,
    })
    .from(revisions)
    .where(eq(revisions.recordId, recordId))
    .orderBy(desc(revisions.seq))
    .all()
  const lines = rows.map((row) => theLineIn(row.data, itemId))
  const answers = new Map<string, WhoWroteTheLineField | null>()
  for (const key of keys) {
    const now = JSON.stringify(line[key])
    let stop: (typeof rows)[number] | null = null
    for (let i = 0; i < rows.length; i++) {
      const held = lines[i]
      if (held === undefined || JSON.stringify(held[key]) !== now) break
      stop = rows[i] ?? null
    }
    if (stop === null || stop.op === 'baseline' || stop.note === caughtUpNote(stop.at)) {
      answers.set(key, null)
      continue
    }
    answers.set(key, {
      actorType: stop.actorType as ActorType,
      actorId: stop.actorId,
      sessionId: stop.sessionId,
      at: stop.at,
      seq: stop.seq,
    })
  }
  return answers
}

export { getRevisionRow } from './get-revision-row.ts'

/**
 * One revision, whole, as the record was.
 *
 * WHAT IT DOES NOT CARRY, AND WHY THE ABSENCE IS THE HONEST ANSWER. A revision stores exactly what
 * `versionOf` hashes. It does NOT store `ownerId`, `createdAt`, `updatedAt` or `origin`, so none of
 * them is served here, and which project the record was in is not stored per revision either — see
 * `RevisionContent`. Filling any of them from the record's row today would be presenting a value from
 * now as a value from then, which is a fabricated observation about a moment nobody measured.
 *
 * THE NUMBERING IS ASKED OF THE TABLE, not worked out from the count. On a ledger holding only
 * revision 3 — a record restored from a project-scoped archive — "Revision 3 of 2" is what counting
 * gives, and it is nonsense. See `numbering`.
 */
export function getRevision(recordId: string, seq: number): OneRevision {
  const row = getRevisionRow(recordId, seq)
  const { count, lowest, highest, gapless } = numbering(recordId)
  return {
    ...headerOf(row),
    recordId,
    content: contentOf(row),
    why: row.note,
    note:
      (gapless
        ? `Version ${seq} of ${count} of ${nameOf(row)}: `
        : `Version ${seq} of ${nameOf(row)}, one of the ${count} this database holds for it — they are ` +
          `numbered ${lowest} to ${highest}, so some of this record's history is not here: `) +
      `what it held at ${row.at}, written by ${row.actorType} ${row.actorId}. ` +
      `It carries only what a version stores — the kind, the title, the summary, the data and the ` +
      `soft-delete stamp. When the record was created, who owns it, how it entered the corpus and which project ` +
      `it was in are NOT stored per version, so they are not here: serving today's values as this version's ` +
      `would be inventing a measurement nobody took. ` +
      `\`contentHash\` is the same token a read of the record hands back as \`version\`.`,
  }
}

/**
 * The difference between two revisions of one record, as field paths with before and after.
 *
 * THE ORDER IS THE ONE THE CALLER ASKED FOR, not oldest-first. Asking what changed going backwards
 * is a real question — "what would putting revision 4 back undo?" — and silently swapping the two
 * would answer a different question from the one asked.
 */
export function compareRevisions(recordId: string, seq: number, otherSeq: number): RevisionComparison {
  const from = getRevisionRow(recordId, seq)
  const to = getRevisionRow(recordId, otherSeq)
  const differences = fieldsThatDiffer(contentOf(from), contentOf(to))
  return {
    recordId,
    from: headerOf(from),
    to: headerOf(to),
    differences,
    note:
      differences.length === 0
        ? `Versions ${seq} and ${otherSeq} of ${nameOf(to)} hold exactly the same content. Two versions ` +
          `can differ in their content hash and still compare the same, because that hash is over a plain ` +
          `JSON.stringify and key order inside \`data\` is part of it.`
        : `${differences.length} field${differences.length === 1 ? '' : 's'} differ between version ${seq} and ` +
          `version ${otherSeq} of ${nameOf(to)}: ${differences.map((d) => d.path).join(', ')}. ` +
          `\`before\` is version ${seq}, \`after\` is version ${otherSeq}, in the order you asked.`,
  }
}

/** What a restore did. */
export interface RestoredRevision {
  recordId: string
  /** The revision whose content was put back. */
  putBack: number
  /**
   * The revision this restore WROTE, or null when it wrote none.
   *
   * NULL MEANS NOTHING WAS WRITTEN, which happens when the record already held exactly the content
   * of the revision named. A patch that changes nothing writes nothing at all — no row, no
   * `updatedAt`, no revision — so saying a number here would name a revision that does not exist.
   * `revisionsWritten` beside it says the same thing as a count.
   */
  newSeq: number | null
  /**
   * How many revisions this restore wrote: 0, 1, or 2 when the kind had to be put back first.
   *
   * MEASURED FROM THE LEDGER, before and after. It used to be the constant 2 on a kind change, and
   * a constant cannot notice that one of the two writes turned out to be a no-op.
   */
  revisionsWritten: number
  /** Every field path the restore moved. Empty when the record already held that content. */
  changed: FieldDiff[]
  /**
   * What the record still wants, after the restore. Empty means nothing is missing.
   *
   * EVERY OTHER WRITE PATH SAYS THIS and a restore said nothing, so a restore that took a module's
   * `context` back out was answered 200 with no hint that the record was now incomplete. It is
   * computed from what ended up stored, by the same function every other reply uses.
   */
  incomplete: Incompleteness[]
  /**
   * Present ONLY when the record's soft-delete stamp differs from the revision's, and nothing was
   * done about it. A restore writes CONTENT; whether a record is deleted is its own verb.
   */
  deletedStateUntouched?: { revision: string | null; record: string | null; whatToSend: string }
  /**
   * Present only when putting the content back needed the KIND to be put back first.
   *
   * `patchRecord` refuses a kind and a `data` in one request — a kind change rewrites `data` itself,
   * so the two would be two writers of one object — so a restore across a kind change sends the kind
   * first and the content second, inside one transaction. Both are ordinary patches and each writes
   * its own revision, which is why this says so rather than leaving the caller to wonder why the
   * number went up by two. How many were really written is `revisionsWritten` above.
   */
  throughKindChange?: { from: RecordKind; to: RecordKind }
  /**
   * PRESENT WHEN THIS RESTORE USED A RUN KEY TO WRITE ANOTHER RUN OF THE SAME AGENT. `patchRecord` takes the write
   * and answers with this sentence, which names the key's run and the run it wrote; the written run carries one line
   * saying so beside the new revision. The restore door asks for the run-key binding so this is not lost on its way
   * back, as an ordinary PATCH carries it.
   */
  runKeyReminder?: string
  note: string
}

/**
 * PUT AN EARLIER REVISION'S CONTENT BACK, by writing it forward as a new revision.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS REMOVED AND NOTHING IS REWRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * The revision being restored stays exactly where it is, and so does everything after it. The count
 * only ever goes up. That is the owner's rule from 18 August 2026 and it is why there is no branch,
 * no merge and no rebase here: a history that can be edited is a history nobody can cite.
 *
 * A RESTORE THAT CHANGES NOTHING WRITES NOTHING, which is the one case where the count stays where
 * it was. The record already holds the content named, so there is no write to record: no revision,
 * no change row, and no new "last changed" time to push the record up every list ordered by it. The
 * reply says so, and `newSeq` is null rather than a number naming a revision nobody wrote.
 *
 * ---------------------------------------------------------------------------------------
 * IT GOES THROUGH `patchRecord`, WHICH IS WHAT AN ORDINARY EDIT GOES THROUGH
 * ---------------------------------------------------------------------------------------
 *
 * Not around it. The validation, the human-only gate, the change log and the new revision all happen
 * because this is an ordinary patch — so an agent asking to restore a `decision` is refused with the
 * same sentence, from the same line of code, as an agent asking to patch one. A restore path that
 * wrote the row itself would be a second door past the only access control this product has.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT PUT BACK, AND SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * WHETHER THE RECORD IS DELETED. A soft delete has its own verb and its own reversal, and a patch
 * cannot set or clear the stamp. When the revision's stamp and the record's differ, this writes the
 * content and REPORTS that the stamp was left alone, naming the request that changes it. Doing it
 * silently either way would be a write nobody asked for; refusing the whole restore would refuse the
 * part that was asked for and is perfectly safe.
 *
 * WHICH PROJECT THE RECORD IS IN. Moving a record between projects is its own verb too, for reasons
 * `POST /api/records/:id/workspace` states at length — it carries links, change rows and companions.
 * A restore does not move anything.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT COMPARES: THE RECORD, NEVER THE LEDGER AGAINST ITSELF
 * ---------------------------------------------------------------------------------------
 *
 * `changed` is the record as it stood against the record as it stands, both read inside this
 * transaction. It used to be the newest revision ROW against the newest revision row, which is a
 * different question with the same answer only while the ledger and the record agree. When they do
 * not — a hand-edited row, an archive restored over the database, a raw-SQL data migration — the
 * reply named a `before` value the record never held and reported fields as moved that did not
 * move. The kind was worked out the same way and was therefore not put back at all, while the reply
 * listed the kind as something the restore had changed.
 */
export function restoreRevision(
  recordId: string,
  seq: number,
  actor: Actor,
  why?: string,
  ifVersion?: string,
): RestoredRevision {
  const row = getRevisionRow(recordId, seq)
  const wanted = contentOf(row)

  return sqlite.transaction((): RestoredRevision => {
    const recordBefore = readOrRefuse(recordId, seq)
    const before = contentOfRecord(recordBefore)
    const kindChanged = before.kind !== wanted.kind

    // ONLY THE OFFICE WRITES needsNoCheck and endedWithItsMergeEntry. A restore writes the version's
    // `data` whole, so it asks the question a whole-`data` PATCH asks. It is asked here, before the
    // first write, so a restore across a kind change is refused before its kind is written, and
    // every caller asks it: the restore route and taking back an act on the person's words.
    const moved = anOfficeOnlyFieldAWholeDataWouldMove(before.data, wanted.data)
    if (moved !== null) {
      // The refusal names the field, so the sentence after it says "that field".
      const what =
        moved.move === 'added'
          ? `Version ${seq} holds that field and this record does not hold it now, so putting that version back would put the field back on.`
          : moved.move === 'dropped'
            ? `Version ${seq} does not hold that field and this record holds it now, so putting that version back would take the field off.`
            : `Version ${seq} holds a different value of that field from the one this record holds now, so putting that version back would change it.`
      throw new PanelError(`${moved.refusal} ${what}`, 403)
    }
    const revisionsBefore = numbering(recordId).count

    // The note every write of this restore carries into the ledger. It names the revision put back,
    // in words, because a `restore` row with no note is a row that cannot say what it restored.
    const ledger = {
      op: 'restore' as const,
      note:
        `Put back what this record held at version ${seq}, written ${row.at}` +
        `${why === undefined || why.trim() === '' ? '.' : `. ${why.trim()}`}`,
    }

    // THE KIND FIRST, ON ITS OWN, when it moved. `patchRecord` refuses a kind beside a `data`, and
    // the reason is its own: a kind change rewrites `data`, so the two would be two writers of one
    // object. Both patches are inside this transaction, so a restore that fails half way leaves
    // nothing — including no revision, because `saveRevision` runs inside each patch's own write.
    //
    // BOTH ARE LABELLED `restore`, because both are part of one act. Labelling the first `update`
    // would put a write in the ledger that nobody performed on its own.
    //
    // ---------------------------------------------------------------------------------------
    // WHICH `ifVersion` EACH PATCH CARRIES, AND WHY THAT IS NOT REACHING AROUND A GUARD
    // ---------------------------------------------------------------------------------------
    //
    // `patchRecord` REFUSES a whole-`data` write that rewrites or drops a checklist line the record
    // holds right now unless the write says which version of the checklist it was built against.
    // Without an `ifVersion` a restore of any module with a ticked-off line was refused outright,
    // measured the first time this function was run: the guard cannot tell a deliberate revert from
    // a stale copy, and a restore is exactly a deliberate revert.
    //
    // THE DEFAULT IS THE RECORD AS IT STANDS, read inside this transaction. That is a truthful
    // answer to the guard's question — it is what is stored now, not a copy read minutes ago, and
    // nothing can write in between — but it answers a weaker claim than the caller made. A caller
    // that names revision 4 has proved it read revision 4; it has proved nothing about the lines
    // somebody added since. So the default takes those lines back out, and the reply says which
    // fields moved, and that is the whole of what a restore is for.
    //
    // A CALLER THAT WANTS THE STRICT DOOR ASKS FOR IT, by sending `ifVersion` with the version its
    // own read of the record handed back. Then the first write carries the caller's token and the
    // ordinary compare-and-set refuses the whole restore with a 409 if anybody has written since.
    // Two agents racing then lose nothing quietly: one of them is told. The restore body accepts
    // the key for exactly this reason — it used to refuse it, so a careful caller had no way to ask.
    //
    // NOTHING IS HIDDEN BY EITHER. The reply names every field the restore moved, the change log
    // gets a row per field as it does for any patch, and the ledger row says `restore` with a note
    // naming the revision put back.
    const versionNow = (): string => versionOf(readOrRefuse(recordId, seq))
    if (kindChanged) {
      patchRecord(recordId, { kind: wanted.kind, ifVersion: ifVersion ?? versionNow() }, actor, ledger)
    }
    // The SECOND write of a kind change answers the guard with what the first one left, because the
    // caller's token described the record before this restore started and is spent.
    const content = patchRecord(
      recordId,
      {
        title: wanted.title,
        summary: wanted.summary,
        data: wanted.data,
        ifVersion: kindChanged || ifVersion === undefined ? versionNow() : ifVersion,
        // A RESTORE MEANS THE WHOLE OBJECT, INCLUDING THE FIELDS THE OLD REVISION DID NOT HOLD.
        // `patchRecord` refuses a `data` that would empty a stored field unless the caller says it
        // is meant, and putting revision 4 back is exactly that write said out loud: a field added
        // after revision 4 is not in revision 4. Without this every restore across a new field
        // would be refused, including the restores that repair the defect the guard was built for.
        // The reply still names every field the restore moved, so nothing goes quietly.
        replace: true,
      },
      actor,
      ledger,
    )

    // MEASURED, BOTH OF THEM. How many revisions this wrote is the ledger's count before and after,
    // not the number of `patchRecord` calls made: a patch that changes nothing writes nothing, so a
    // restore of content a record already holds writes no revision at all and says so.
    const revisionsWritten = numbering(recordId).count - revisionsBefore
    const after = contentOfRecord(content.record)
    const changed = fieldsThatDiffer(before, after)

    const stampDiffers = row.deletedAt !== after.deletedAt
    const result: RestoredRevision = {
      recordId,
      putBack: seq,
      newSeq: revisionsWritten === 0 ? null : newestRevision(recordId).seq,
      revisionsWritten,
      changed,
      incomplete: content.incomplete,
      ...(content.runKeyReminder === undefined ? {} : { runKeyReminder: content.runKeyReminder }),
      ...(kindChanged ? { throughKindChange: { from: before.kind, to: wanted.kind } } : {}),
      ...(stampDiffers
        ? {
            deletedStateUntouched: {
              revision: row.deletedAt,
              record: after.deletedAt,
              whatToSend:
                row.deletedAt === null
                  ? `POST /api/records/${recordId}/restore`
                  : `DELETE /api/records/${recordId}`,
            },
          }
        : {}),
      note: '',
    }
    result.note = describeRestore(result, seq, nameOf(row), ledger.note)
    return result
  })()
}

/**
 * The record as it stands, or a refusal saying nothing was written.
 *
 * A RESTORE READS THE RECORD AND NOT THE LEDGER, which is why this exists. It is called before the
 * writes, to say what the record held, and again between them, to answer the compare-and-set with
 * what is stored right now.
 */
function readOrRefuse(recordId: string, seq: number): PanelRecord {
  const record = getRecord(recordId)
  if (record === null) {
    throw new PanelError(
      `Record ${recordId} disappeared while its version ${seq} was being put back. Nothing has been ` +
        `written: this runs in one transaction and the whole restore is rolled back.`,
      404,
    )
  }
  return record
}

/** A record read as the five fields a revision stores, so a record and a revision can be compared. */
function contentOfRecord(record: PanelRecord): RevisionContent {
  return {
    kind: record.kind,
    title: record.title,
    summary: record.summary,
    data: record.data,
    deletedAt: record.deletedAt,
  }
}

/**
 * The sentence a restore answers with. Built from the result, so the two cannot say different things.
 *
 * `called` is the record's title as the version being put back carried it. It stands where step 41
 * left the record's ID standing, which is an address in the place a name belongs.
 */
function describeRestore(result: RestoredRevision, seq: number, called: string, ledgerNote: string): string {
  // THE OPENING SENTENCE SAYS WHETHER ANYTHING WAS WRITTEN, because the two cases are different
  // events and reading one as the other is what the whole ledger exists to prevent. It used to say
  // "was put back as version N" either way, and on a restore that changed nothing that sentence
  // named a version the restore had not written while `updatedAt` was stamped all the same.
  const opening =
    result.newSeq === null
      ? `Version ${seq} of ${called} was already what the record held, so NOTHING WAS ` +
        `WRITTEN: no version, no change row, and the record's "last changed" time has not moved. ` +
        `Version ${seq} is still there, and so is everything written after it.`
      : `Version ${seq} of ${called} was put back as version ${result.newSeq}. ` +
        `Nothing was removed and nothing was rewritten — version ${seq} is still there, and so is everything ` +
        `written after it.`
  // NOT SAID TWICE. When nothing was written the opening has already said the record held this
  // content, so a second sentence saying no field moved is the same news in different words.
  const moved =
    result.newSeq === null
      ? ''
      : result.changed.length === 0
        ? ` No field moved.`
        : ` ${result.changed.length} field${result.changed.length === 1 ? '' : 's'} moved: ` +
          `${result.changed.map((d) => d.path).join(', ')}.`
  const kind =
    result.throughKindChange === undefined
      ? ''
      : ` The kind went back from "${result.throughKindChange.from}" to "${result.throughKindChange.to}". A kind ` +
        `may not be sent with data, so the kind and the content are two separate writes` +
        (result.revisionsWritten >= 2
          ? `, and this restore made both: version ${result.newSeq} is the second.`
          : `, and the content was already right, so only the kind was written and that is version ` +
            `${result.newSeq}.`)
  const stamp =
    result.deletedStateUntouched === undefined
      ? ''
      : ` The content is back and the SOFT-DELETE STAMP WAS NOT TOUCHED: version ${seq} was ` +
        `${result.deletedStateUntouched.revision === null ? 'not deleted' : `deleted at ${result.deletedStateUntouched.revision}`}` +
        ` and the record is ` +
        `${result.deletedStateUntouched.record === null ? 'not deleted' : `deleted at ${result.deletedStateUntouched.record}`}` +
        `. Deleting and undeleting are their own verbs and a patch cannot do either; send ` +
        `${result.deletedStateUntouched.whatToSend} if that is what you meant.`
  // WHAT THE RECORD STILL WANTS, said here as every other write path says it. A restore can take a
  // filled-in field back out, and answering 200 with no word about it is the reply this product
  // refuses to give anywhere else.
  const wanting =
    result.incomplete.length === 0
      ? ''
      : ` The record is INCOMPLETE after this: ${result.incomplete.map((i) => i.path).join(', ')} ` +
        `${result.incomplete.length === 1 ? 'is' : 'are'} not filled in. GET /api/records/${result.recordId} ` +
        `says what ${result.incomplete.length === 1 ? 'it' : 'each one'} wants.`
  // THE LEDGER SENTENCE ONLY WHEN THERE IS A LEDGER ROW. "The ledger records it as: …" beside an
  // opening that says nothing was written is the reply contradicting itself in two sentences, and
  // the note it would quote was prepared for a write that never happened.
  const ledger = result.newSeq === null ? '' : ` The version history records it as: ${ledgerNote}`
  return `${opening}${moved}${kind}${stamp}${wanting}${ledger}`
}
