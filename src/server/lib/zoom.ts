// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH OF A RECORD'S SHORT FORMS STILL HOLD, AND WHICH THE RECORD HAS MOVED PAST.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE IDEA IN THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * A short form is written from a record at a moment. The record then changes. Nothing tells the
 * short form, and nobody remembers, so a two-week-old gist is drawn beside a rewritten report and
 * reads as a description of it.
 *
 * SO IT IS ARITHMETIC INSTEAD OF MEMORY. Every stored short form names the revision it was made
 * from. The ledger says what that revision held. Comparing it with what the record holds now
 * answers, without anybody being asked, whether the words are still about this record.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A COMPARISON OF TOKENS, OVER THE CONTENT WITHOUT THE SHORT FORMS IN IT
 * ---------------------------------------------------------------------------------------
 *
 * `versionOf` names a piece of content with a short token. Same content, same token. So "has the
 * record moved since this was written" is one comparison of two tokens, and it cannot miss a change
 * because there is nothing for it to walk past.
 *
 * WHAT IS HASHED IS THE AUTHORED CONTENT: the record with `data.shortForms` taken out of it. Short
 * forms are stored INSIDE the record and the token is over the whole of `data`, so hashing the
 * record whole would mark every short form out of date the instant another one was saved — for
 * ever, on every record, with the mark then meaning nothing. Taking the field out on both sides asks
 * exactly the question being asked, and it is the SAME `versionOf` doing the naming, applied to a
 * smaller object. There is no second hash function and nothing new is stored.
 *
 * IT USED TO BE INFERRED FROM A FIELD COMPARISON, AND THAT IS THE DEFECT THIS PARAGRAPH REPLACES.
 * `fieldsThatDiffer` pairs the entries of an array by their `id` and never by position — deliberately,
 * so that moving one line of a checklist is not reported as a change to two lines. A report's blocks
 * are an array of things with ids, and their order is the order somebody reads them in. So reordering
 * a report moved what it says, moved its content hash, and produced NO differing fields at all: every
 * derived level was still drawn as current, saying "nothing in the record has changed since".
 * Measured 19 August 2026. The token is what cannot be walked past, so the token is what decides.
 *
 * THE FIELD LIST IS STILL READ, and it is now the EXPLANATION rather than the decision.
 * `changedSince` names which fields moved, for a reader who wants to know. When the tokens differ
 * and that list is empty, nothing changed its value and what moved is an ORDER — which is a real
 * answer and is said in those words rather than being rounded down to "nothing changed".
 *
 * ONE FIELD OF TWO KINDS IS LEFT OUT AS WELL: a module's owner and a block's tier, which no form of
 * theirs describes. `LEFT_OUT_OF_THE_COMPARISON` says why. When that field is the only thing that
 * moved, the form's sentence says so rather than saying nothing changed.
 *
 * THE COMPARISON IS CONSERVATIVE IN ONE DIRECTION ONLY, and that is the safe one. `versionOf` is a
 * plain JSON.stringify, so two objects holding the same fields in a different key order produce
 * different tokens. A write that reordered the keys of `data` and changed no value would therefore
 * be reported as a move. That is a short form marked out of date when it did not have to be, which
 * costs somebody a re-read. The other direction — a record that moved and a level still drawn as
 * current — is the lie this whole file exists to prevent, and no key order can produce it.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE WRITES, AND NOTHING HERE GENERATES
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office has no summariser and does not pretend to. Short forms are written by whoever wrote the
 * record, through POST /api/records/:id/short-forms in src/server/api/zoom.ts, which calls
 * `patchRecord` — the one write door — so the validation, the human-only rule, the change log and
 * the revision all happen exactly as they do on any other edit.
 *
 * When nobody has written one, the answer is that there is none. That is a complete answer and it is
 * said out loud on every surface. A shortened body dressed as a written short form would be the
 * fifth engineering rule broken with extra steps.
 */

import { and, desc, eq, sql } from 'drizzle-orm'
import { fieldsThatDiffer } from '@shared/fielddiff.ts'
import type { PanelRecord, RecordKind } from '@shared/types.ts'
import {
  PARTS_KEY,
  RETIRED_SHORT_FORM_KEYS,
  SHORT_FORMS_FIELD,
  SHORT_FORM_LEVELS,
  SHORT_FORM_SPECS,
  STORED_SHORT_FORM_LEVELS,
  countWords,
  joined,
  readStoredParts,
  readStoredShortForms,
  textsOf,
  whatItStandsFor,
  type ShortFormAuthor,
  type SourceRegion,
  type StandsFor,
  type ShortFormLevel,
  type ShortFormTexts,
  type StoredPart,
  type StoredParts,
  type StoredShortForms,
} from '@shared/zoom.ts'
// THE SEVEN POSITIONS OF THE READING LADDER, NAMED IN ONE SENTENCE, for the refusal that says what
// the ladder is. Built from `RUNGS`, so a refusal cannot name a ladder the product does not have.
//
// AND WHICH TEXT A RECORD'S OWN WORDS ARE, which the write door below compares a written level
// against. It is decided in `@shared/detail.ts` because the page asks the same question of the
// same record and the two answers have to be one answer.
import {
  RUNG_SPECS,
  rungSaidOf,
  SEVEN_RUNGS_NAMED,
  levelLabel,
  rungsFor,
  theRecordsOwnWords,
  whyEachLevelIsMissing,
  type LevelAbsence,
  type Rung,
  type TheRecordsOwnWords,
} from '@shared/detail.ts'
// THE RECORD AS THE READING LADDER SEES IT, built by the ONE function that builds one. The browser
// asks `rungsFor` the same question of the same record, and a second builder here would be two
// readings of what a record holds, free to disagree with nothing failing. `src/server/lib/openloops.ts`
// already reaches into this file for `wordsAt` for the same reason.
import { detailSourceOf } from '@shared/detailsource.ts'
import {
  BY_PART_LEVELS,
  isCutOf,
  noPartsToWriteSentence,
  tooShortForLevelSentence,
  type ByPartLevel,
} from '@shared/zoom.ts'
// WHICH FIELD A KIND KEEPS ITS BLOCKS IN, read off the declaration and never listed here. AND
// WHETHER THE KIND HAS A PLACE FOR THE BY-PART LEVELS AT ALL, which is the same declaration asked
// the other way: `kindHoldsPartsLevels` is true exactly when the kind declares a block field.
import { blocksFieldOf, kindHoldsPartsLevels } from '@shared/kinds.ts'
// THE PROSE OF A RECORD'S BLOCKS — headings, paragraphs, list items, captions — read the way every
// other reader of it reads it, so two checks over one report cannot see two different texts.
import { proseOfBlocks } from '@shared/waitingclaims.ts'
import type { SummaryBlock } from '@shared/types.ts'
// WHEN A SHORT FORM WAS WRITTEN, in the one stored form: local wall clock, never UTC.
import { nowStamp } from '@shared/time.ts'
import { db, sqlite } from '../db/client.ts'
import { revisionsReaderOf, wholeRevisionData, type ReadARevision } from '../db/revision-stored-once.ts'
import { records, revisions } from '../db/schema.ts'
import { patchRecord, nothingWrittenSentence, recordInWorkspace, versionOf, type Actor } from './records.ts'
// WHICH REGISTRY ROW WROTE A FORM, and the name the office gives that row. A form stores the row's id,
// and the reading names it by the one function that names a stored reference.
import { participantForActor } from './participant-for-actor.ts'
import { theOfficeNameOfAStoredReference } from './agent-owner-changes.ts'
import { resolveSessionRef } from './resolve-session-ref.ts'
import { PanelError } from './panel-error.ts'
// THE ONE PLACE A PART OF A RECORD IS NAMED, and the tree it is named out of. Both read the same
// walk `resolveTarget` and the review pane read, so what a projection says it stands for and what a
// comment left on that part reads back as are one answer.
import { namesOfPartsOfRecord, regionOfRecord } from './targets.ts'
// WHO LAST CHANGED ONE OF THE RECORD'S OWN COLUMNS, AND IN WHICH RUN. Levels 2 and 3 are those
// columns, so the writer of each is a question about the revision ledger and is answered there.
import { whoWroteTheColumn } from '../db/who-wrote-the-column.ts'
// WHAT A RECORD IS CALLED IN A SENTENCE. One table; nothing here spells `report`.
import { kindWord } from '@shared/words.ts'
import { contentOf, type RecordContent } from './version.ts'

// ============================================================================ what a reader gets

/**
 * WHERE ONE SHORT FORM STANDS. Six answers, and they are six different situations.
 *
 *   `current`       somebody wrote it, and nothing the form describes has changed since.
 *   `out_of_date`   somebody wrote it, and the record changed afterwards. It is not drawn as current.
 *   `cannot_check`  somebody wrote it against a revision this database's ledger does not hold, so
 *                   Mole Office cannot say which of the two above is true. It never guesses at one.
 *   `none`          there is a place for it and room for it and nobody has written one. This is the
 *                   one a reader can act on.
 *   `cannot_write`  this record cannot have it at all: the kind has no place for it, or the record
 *                   is already too short. `why` says which. Nobody should try to write one.
 *   `is_the_record` Full, which is the record itself and has no shorter form of it to be missing.
 *
 * `none`, `cannot_write` AND `cannot_check` ARE THREE DIFFERENT ANSWERS, and keeping them apart is the
 * fifth engineering rule on this surface: nobody has written one, against this record cannot have
 * one, against somebody wrote one and nobody can check it.
 */
export type ShortFormState = 'current' | 'out_of_date' | 'cannot_check' | 'none' | 'cannot_write' | 'is_the_record'

/** What a level says when no value of its record changed and only the order did. A test reads it here (round 130). */
export const ONLY_THE_ORDER_MOVED =
  'No value in the record has changed since; the order of its blocks has, and that is the order they are read in.'

/** Where one of the seven reading positions stands on one record. */
export interface ShortFormReading {
  /**
   * WHICH OF THE SEVEN POSITIONS THIS IS: `label`, `title`, `gist`, `outline`, `sketch`, `digest`,
   * `full`. Read off `RUNGS`, so this reply and the reading control cannot come to two ladders.
   */
  rung: Rung
  /** Where it sits, 1 to 7. */
  position: number
  /** What the reading control draws for it: `Level 1`, `Conclusion`, `Level 4`, `Full`. */
  label: string
  /**
   * THE STORED KEY, for the three lengths that are stored as one text, and null for the other four.
   *
   * Null is not a gap. Levels 4 to 6 are stored as one structure under `shortForms.parts` rather
   * than as a text per level, and Full is the record itself. A caller writing one of those does not
   * name a key here — see `parts` below and the write route's own description.
   */
  level: ShortFormLevel | null
  /** What this length is called in a sentence. From the declaration, never typed again. */
  noun: string
  /** What this length is for. */
  what: string
  /** The word budget, both ends. Null on Full, which is the whole thing. */
  words: { min: number; max: number } | null
  /**
   * WHAT THAT BUDGET IS COUNTED OVER: the whole form at levels 1 to 3, EACH PART at levels 4 to 6.
   *
   * A caller reading `words` without this would tell a reader that the sixth length is 120 words
   * long, which is false about every report with more than one part.
   */
  wordsPer: 'form' | 'part' | null
  /**
   * FOR LEVELS 4 TO 6: whether the by-part structure is written, and how many parts it holds.
   *
   * Null at every other position, because there is no such structure there. `count` is null exactly
   * when `written` is false.
   */
  parts: { written: boolean; count: number | null } | null
  state: ShortFormState
  /**
   * WHY THIS POSITION HAS NO WORDS, where it has none: the shared code's own three answers.
   *
   * `noPlace` and `tooShort` are positions that cannot be written at all, and they carry
   * `state: 'cannot_write'`. `notWritten` is the one a reader can act on, and it carries
   * `state: 'none'`. Null wherever somebody has written this position.
   *
   * IT IS NOT WORKED OUT HERE. `whyEachLevelIsMissing` in @shared/detail.ts is the one place that
   * tells the three apart, and it is the same call the card on the drawing makes, so this reply and
   * the card cannot come to two answers about one level.
   */
  why: LevelAbsence | null
  /** The words, or null when nobody has written any at this length. */
  text: string | null
  /** How many words they are. Null when there are none. Counted, not stored. */
  wordCount: number | null
  /**
   * WHERE THE WORDS CAME FROM, so a caller can tell a form somebody wrote beside the record from
   * the record's own writing.
   *
   *   `shortForm`   a form stored under `data.shortForms`. Level 1 is the only one left.
   *   `title`       the record's own `title` column, which IS level 2.
   *   `summary`     the record's own `summary` column, which IS level 3.
   *   `null`        levels 4 to 6, which are the by-part structure, and Full, which is the record.
   *
   * IT IS THE SAME VOCABULARY `DetailText.from` IN @shared/detail.ts USES, and for the same
   * reason: a surface asking where a length's words came from must get one answer from the two
   * readers, not two.
   */
  from: 'shortForm' | 'title' | 'summary' | null
  /** Who wrote them. Null when nobody has. */
  writtenBy: ShortFormAuthor | null
  /**
   * WHICH agent or person wrote them, as stored. Null when nobody has written this length, and
   * null on every form stored before 2 September 2026, which carries no name.
   *
   * A FORM STORES ITS WRITER'S REGISTRY ID, and a form stored before that stores the actor id the
   * request sent, which may be a handle. This hands back what is stored either way. `byName` below
   * is the name a screen draws.
   *
   * NOT THE SAME FACT AS `writtenBy` ABOVE. That says whether a person or an agent wrote it, which
   * is what decides the override. This says which one. A screen drawing one in place of the other
   * would answer a question nobody asked.
   */
  by: string | null
  /**
   * THE NAME THE OFFICE GIVES THE WRITER `by` NAMES, worked out when the form is read.
   *
   * NULL WHEN NO REGISTERED PERSON OR AGENT HAS THAT ID. That is a form stored before the writer was
   * stored by id, a writer nobody registered, and a length nobody wrote. A screen then draws `by` as
   * it is, so a form stored before the change reads as it did.
   *
   * NULL ON THE TWO COLUMNS AS WELL. Their writer comes from the revision ledger, which stores the
   * actor id the request sent, not a registry id.
   */
  byName: string | null
  /**
   * WHEN they were written, as local wall-clock time. Null on the same two counts as `by`.
   *
   * NOT `madeFrom` BELOW. That names the revision somebody read; this is when the words were stored.
   */
  at: string | null
  /**
   * THE RUN THAT WROTE THEM, as the id of its session record. Null on the same two counts as `by`,
   * and null where the request named a run nobody has filed as a session of this project.
   *
   * IT IS A RECORD ID, so a reader can link straight to it. See `StoredShortForm.session` in
   * @shared/zoom.ts for why nothing else is stored here.
   */
  session: string | null
  /**
   * True when a PERSON wrote this length by hand.
   *
   * It is an OVERRIDE and every surface has to say so. The body is what is authored and these are
   * derived from it, so a person writing one is stepping in front of the derivation, and a screen
   * that draws it like any other derived form is hiding a human decision.
   */
  override: boolean
  /** Which revision the words were written from. Null when nobody has written any. */
  madeFrom: { seq: number; contentHash: string } | null
  /**
   * WHICH PARTS OF THE RECORD THESE WORDS STAND FOR, AND THE SENTENCE THAT SAYS SO.
   *
   * A DIFFERENT FACT FROM `madeFrom` ABOVE. That one names a revision — WHEN somebody read the
   * record. This one names regions — WHICH PARTS the words stand in place of. Criterion 18 of
   * design/problem-03/ACCEPTANCE.md is about the second, and the panel drew neither until
   * 1 September 2026.
   *
   * `says` IS NEVER EMPTY, INCLUDING WHERE NOBODY RECORDED ANYTHING. The one answer the criterion
   * forbids is silence, and every record in the corpus is in exactly that state.
   */
  standsFor: StandsFor | null
  /**
   * WHAT HAS CHANGED IN THE RECORD SINCE, by field path, longest-standing first as the ledger walks.
   *
   * Empty means the comparison ran and nothing had changed. NULL MEANS NO COMPARISON WAS POSSIBLE —
   * nobody wrote one, or the revision it names is not in this ledger — and those are different
   * answers, so they are different values.
   */
  changedSince: string[] | null
  /** One plain sentence a screen with room for one can print. */
  says: string
}

/** Where every length stands on one record. What GET /api/records/:id/short-forms answers. */
export interface ShortFormsReading {
  nothingWritten?: string
  recordId: string
  kind: RecordKind
  /** The record's `version` now — the same token a read of the record hands back. */
  version: string
  /** The newest revision this record has, or null when its ledger holds none at all. */
  newestRevision: number | null
  /**
   * ALL SEVEN POSITIONS, SHORTEST FIRST. A length nobody has written is here too, saying so.
   *
   * SEVEN AND NOT SIX, because Full is a reading position and a caller asking where this record
   * stands at each length has to be told about it. It is reported as `is_the_record`: there is no
   * shorter form of the whole thing to be missing.
   */
  levels: ShortFormReading[]
  /** How many of the six writable positions have been written at all. */
  written: number
  /** How many of the written ones the record has moved past. */
  outOfDate: number
  note: string
}

// ============================================================================ the comparison

/**
 * A record's content with its own short forms taken out of it.
 *
 * THIS IS WHAT "THE AUTHORED CONTENT" MEANS, and it is worked out in one place. Everything a person
 * or an agent wrote into the record is here; the five derived forms of it are not. Both sides of
 * every comparison below go through this, so a short form cannot make itself out of date.
 *
 * The rest of `data` keeps its key order, because this copies the object and removes one key. That
 * matters: `versionOf` hashes the JSON, so a reordering would read as a move. See the header for
 * why a false move is the acceptable direction and a false stay is not.
 */
function authoredContent(content: RecordContent): RecordContent {
  return withoutData(content, SHORT_FORMS_FIELD)
}

/** The content with one key of its `data` taken out, by a copy, so the rest of `data` keeps its key order. */
function withoutData(content: RecordContent, key: string): RecordContent {
  if (!(key in content.data)) return content
  const data = { ...content.data }
  delete data[key]
  return { ...content, data }
}

/**
 * THE ONE FIELD OF A KIND THAT ITS SHORT FORMS DO NOT DESCRIBE, left out of both sides of the comparison.
 *
 * A label says what a module does. Who owns the module, and which row of the big map a block is drawn
 * in, are bookkeeping that other readings use, and a form written before either moved still says the
 * same true thing. So a new owner does not age a module's forms and a new tier does not age a block's.
 * Every other field of these two kinds still ages them, and so does every field of every other kind:
 * a goal's owner is part of what the goal says.
 *
 * THE WHOLE KEY IS TAKEN OUT, so every path under it goes with it, such as `data.owner.id`, and a key
 * that only starts with the same letters is still compared.
 */
const LEFT_OUT_OF_THE_COMPARISON: Partial<Readonly<Record<RecordKind, string>>> = { module: 'owner', block: 'tier' }

/** What the record has done since a revision: whether it moved at all, and which fields moved. */
interface SinceThen {
  /**
   * True when the authored content is the same content it was.
   *
   * THIS IS THE DECISION, and it is a comparison of two `versionOf` tokens. It is not read off
   * `changed` below, because a list of differing fields is empty for a reorder and the record has
   * still moved.
   */
  same: boolean
  /**
   * Which field paths moved. The EXPLANATION, not the decision.
   *
   * Empty while `same` is false is a real and meaningful answer: no field changed its value, so what
   * moved is the order of something.
   */
  changed: string[]
  /**
   * The field `LEFT_OUT_OF_THE_COMPARISON` names, when it is the only thing that moved: `same` is true
   * and the record is still not the content it was. Null otherwise. The sentence reads it, because
   * "nothing has changed" would then be untrue.
   */
  onlyMoved: string | null
}

/**
 * What the record's AUTHORED content has done since a given revision, or null when it cannot be read.
 *
 * Null means this database's ledger has no such revision, or holds one whose content is not the
 * content the short form says it was written from. Both are "Mole Office cannot check this", and both are
 * reported rather than resolved: a pair that does not match the ledger names a different revision
 * from the one it claims, and believing half of it would be believing a claim nobody checked.
 */
function changedSince(record: PanelRecord, madeFrom: { seq: number; contentHash: string }): SinceThen | null {
  const row = db
    .select()
    .from(revisions)
    .where(and(eq(revisions.recordId, record.id), eq(revisions.seq, madeFrom.seq)))
    .get()
  return changedSinceWith(record, madeFrom, row, revisionsReaderOf(sqlite))
}

function changedSinceWith(record: PanelRecord, madeFrom: { seq: number; contentHash: string }, row: typeof revisions.$inferSelect | undefined, read: ReadARevision): SinceThen | null {
  if (row === undefined) return null
  if (row.contentHash !== madeFrom.contentHash) return null
  const then = authoredContent(contentOf({ ...row, data: wholeRevisionData(row, read) }))
  const now = authoredContent(contentOf(record))
  const leftOut = LEFT_OUT_OF_THE_COMPARISON[record.kind]
  const thenCompared = leftOut === undefined ? then : withoutData(then, leftOut)
  const nowCompared = leftOut === undefined ? now : withoutData(now, leftOut)
  const same = versionOf(thenCompared) === versionOf(nowCompared)
  return {
    same,
    changed: fieldsThatDiffer(thenCompared, nowCompared).map((difference) => difference.path),
    onlyMoved: same && leftOut !== undefined && versionOf(then) !== versionOf(now) ? leftOut : null,
  }
}

const stateSince = (since: SinceThen | null): ShortFormState => since === null ? 'cannot_check' : since.same ? 'current' : 'out_of_date'

/** The same missing-position decision for a full reading and for the seal's set reading. */
function missingOf(record: PanelRecord, stored: StoredShortForms, parts: StoredParts | null): ReturnType<typeof whyEachLevelIsMissing> {
  const written = new Set<Rung>([
    ...STORED_SHORT_FORM_LEVELS.filter((level) => stored[level] !== undefined),
    ...(record.title.trim() === '' ? [] : (['title'] as const)),
    ...(typeof record.summary !== 'string' || record.summary.trim() === '' ? [] : (['gist'] as const)),
    ...(parts === null ? [] : BY_PART_LEVELS),
  ])
  return whyEachLevelIsMissing(detailSourceOf(record), written)
}

/** Read only the label and by-part states for a set of already read records. */
export function theShortFormStatesOf(records: readonly PanelRecord[]): Map<string, { rung: Rung; state: ShortFormState }[] | { error: string }> {
  const forms = records.map((record) => ({ record, stored: readStoredShortForms(record.data[SHORT_FORMS_FIELD]), parts: readStoredParts(record.data[SHORT_FORMS_FIELD]) }))
  const wanted = forms.flatMap(({ record, stored, parts }) => [stored.label?.madeFrom, parts?.madeFrom].flatMap((from) => from === undefined ? [] : [{ id: record.id, seq: from.seq }]))
  const rowsFor = (pairs: { id: string; seq: number }[]) => db.select().from(revisions).where(sql`(${revisions.recordId}, ${revisions.seq}) IN (SELECT json_extract(value, '$.id'), json_extract(value, '$.seq') FROM json_each(${JSON.stringify(pairs)}))`).all()
  const rows = rowsFor(wanted)
  const holders = rows.flatMap((row) => row.parts === null ? [] : Object.values(row.parts).map((seq) => ({ id: row.recordId, seq })))
  const all = [...rows, ...rowsFor(holders)]
  const key = (id: string, seq: number) => `${id}\u0000${String(seq)}`
  const byId = new Map(all.map((row) => [key(row.recordId, row.seq), row]))
  const read: ReadARevision = (id, seq) => byId.get(key(id, seq))
  return new Map(forms.map(({ record, stored, parts }): [string, { rung: Rung; state: ShortFormState }[] | { error: string }] => {
    try {
      const missing = missingOf(record, stored, parts)
      const absent = (rung: Rung): ShortFormState => (missing[rung] ?? 'notWritten') === 'notWritten' ? 'none' : 'cannot_write'
      const state = (from: { seq: number; contentHash: string }) => stateSince(changedSinceWith(record, from, byId.get(key(record.id, from.seq)), read))
      return [record.id, [
        { rung: 'label' as const, state: stored.label === undefined ? absent('label') : state(stored.label.madeFrom) },
        ...BY_PART_LEVELS.map((rung) => ({ rung, state: parts === null ? absent(rung) : state(parts.madeFrom) })),
      ]]
    } catch (err) {
      return [record.id, { error: err instanceof Error ? err.message : String(err) }]
    }
  }))
}

/**
 * THE RECORDED SOURCE REGIONS OF ONE STORED FORM, NAMED, or null because nobody recorded any.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS DERIVED AND NOTHING IS DROPPED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion 18 of design/problem-03/ACCEPTANCE.md forbids deriving an answer and presenting it as
 * recorded, so this reads what somebody wrote and nothing else. Where they wrote nothing it answers
 * null, and `whatItStandsFor` turns that into a sentence saying so.
 *
 * A PART THE RECORD NO LONGER HOLDS IS STILL LISTED, marked `stillThere: false`. Leaving it out
 * would be the same silence one level down: the writer said this form stands for four parts and the
 * screen would draw three, with nothing saying where the fourth went. The sentence counts them.
 *
 * IT IS THE SAME TREE THE SERVER RESOLVES A COMMENT AGAINST. `namesOfPartsOfRecord` in ./targets.ts
 * asks `namesOfParts` of that one tree — so *the table “Runs”* here and the part a comment left on
 * it names are one answer worked out once.
 *
 * IT NAMES WHICH PART AND NOT WHAT KIND OF PART, and that is the whole of the change made on 1
 * September 2026. `nameOfRegion` alone gave a form standing for two headed blocks the sentence
 * *Stands for the section and the section*, which names nothing a reader can go to. See
 * `namesOfParts` for what is measured about it.
 */
function sourcesOf(record: PanelRecord, recorded: readonly string[] | undefined): readonly SourceRegion[] | null {
  if (recorded === undefined || recorded.length === 0) return null
  // ONE TREE FOR THE WHOLE LIST. Naming which part a part is, rather than what kind of thing it is,
  // is a question about the whole record — see `namesOfParts` — so it is asked once here and not
  // once per recorded source.
  const names = namesOfPartsOfRecord(record.id)
  return recorded.map((regionId): SourceRegion => {
    const name = names?.get(regionId)
    return {
      regionId,
      // A PART THAT IS GONE HAS NO NAME TO READ, so it is named by what it is: a part this record
      // does not have any more. Naming it from the id would print the id as if it were words.
      name: name === undefined ? 'a part this record no longer holds' : `the ${name}`,
      stillThere: name !== undefined,
    }
  })
}

/** The newest revision number this record has, or null when its ledger holds none. */
function newestRevisionOf(recordId: string): number | null {
  const row = db
    .select({ seq: revisions.seq })
    .from(revisions)
    .where(eq(revisions.recordId, recordId))
    .orderBy(desc(revisions.seq))
    .limit(1)
    .get()
  return row?.seq ?? null
}

// ============================================================================ reading one record

/**
 * The sentence one reading prints. Built from the reading, so the two cannot say different things.
 *
 * `alsoWritten` is what the record DOES hold, and it is on the absent sentence for the reason
 * `atLevel` in @shared/zoom.ts gives: nothing is substituted, so a caller that wants to fall back
 * has to be told what there is to fall back to. Without it a row was told only that it had no label,
 * which reads as "this record has nothing" when a brief is sitting right there.
 */
function saysOf(
  reading: Omit<ShortFormReading, 'says'>,
  recordId: string,
  alsoWritten: readonly ShortFormLevel[],
  /** What this record is called in a sentence, from `kindWord`. The caller reads it once. */
  holderWord: string,
  /** The left-out field when it is the only thing that moved, from `changedSince`; null when it is not. */
  onlyMoved: string | null = null,
): string {
  // THE NOUN AND THE ARTICLE COME OFF WHATEVER DECLARED THIS POSITION, and the three lengths written
  // by part have no `ShortFormSpec`, so their noun is read from the rung instead. Both are the
  // product's own words for the position; neither is worked out here.
  const spec =
    reading.level === null
      ? { noun: reading.noun, article: 'a' as const, what: reading.what }
      : SHORT_FORM_SPECS[reading.level]
  const by = reading.writtenBy === 'human' ? 'A person wrote this by hand, which overrides what would otherwise be derived from the record. ' : ''
  const seq = reading.madeFrom === null ? '' : String(reading.madeFrom.seq)

  // FULL IS THE RECORD ITSELF and there is no shorter form of the whole thing to be missing, so it
  // is never reported as unwritten.
  if (reading.state === 'is_the_record') {
    return `This is the record itself, as it was written. It is what every shorter form above is made from.`
  }
  // LEVELS 2 AND 3 ARE THE RECORD'S OWN TITLE AND SUMMARY, so there is no revision to name and
  // nothing to be out of date against: they move when the record moves. Who last changed them is
  // read from the record's history, which is where every other question about who changed what is
  // answered. Criterion A14b.
  if (reading.from === 'title' || reading.from === 'summary') {
    const wrote = reading.by === null ? '' : ` Last changed by ${reading.by}${reading.at === null ? '' : ` on ${reading.at}`}.`
    return (
      `This is the ${reading.noun} of the record itself, which is what reading length ` +
      `${String(reading.position)} draws. It is written when the record is written, so it is never out of ` +
      `date with it, and it stands for the whole ${holderWord}.${wrote}`
    )
  }
  // HOW MANY PARTS, WHERE THIS POSITION IS WRITTEN BY PART. The count is the one thing a caller
  // cannot work out from the words, because there are no words at these three lengths — there is a
  // heading and two texts for each part.
  const held =
    reading.parts === null || reading.parts.count === null
      ? ''
      : // THE RECORD'S OWN WORD, not `report`. A module carries the by-part levels too — every kind
        // that declares a block field does — so a module's reader was told about a report.
        // `holderWord` is the word the caller already read off the kind for the sentence above.
        `This ${holderWord} is written in ${String(reading.parts.count)} part${reading.parts.count === 1 ? '' : 's'}, ` +
        `and this length draws ${reading.parts.count === 1 ? 'it' : 'each of them'}. `

  switch (reading.state) {
    case 'none': {
      const others = alsoWritten.filter((level) => level !== reading.level)
      const instead =
        others.length === 0
          ? `No shorter form of this record has been written at any length.`
          : `What has been written: ${others.map((level) => SHORT_FORM_SPECS[level].noun).join(', ')}.`
      // THE ARTICLE IS READ OFF THE LENGTH AND NEVER WORKED OUT HERE, for the reason written beside
      // `ShortFormSpec.article` and beside the same repair in `whatItStandsFor`. These two were
      // missed by that commit — same object, same sentence, same "a account" — and are the last
      // hardcoded articles in front of a stored noun.
      return (
        `No ${spec.noun} has been written for this record. ${instead} Nothing has been shortened ` +
        `into its place, because a cut of the whole thing is not ${spec.article} ${spec.noun}.`
      )
    }
    case 'current':
      // ONLY THE LEFT-OUT FIELD MOVED. The record did change, so saying nothing had would be untrue.
      if (onlyMoved !== null) {
        return (
          `${by}${held}Written from revision ${seq}. Since then only its ${onlyMoved} has changed, and ` +
          `${spec.article} ${spec.noun} does not describe its ${onlyMoved}.`
        )
      }
      return `${by}${held}Written from revision ${seq}, and nothing in the record has changed since.`
    case 'out_of_date': {
      // THE COUNT, NOT THE PATHS. `data.blocks[#b-1].text` is a field path, and docs/UX-CONTRACT.md
      // puts a raw stored field name in Developer detail. Measured against a live server on 19 August
      // 2026, this sentence read "the record has changed since: data.blocks[#b-1].type,
      // data.blocks[#b-1].text, data.blocks[#b-2]", which is the mechanism named where the state
      // belongs. `changedSince` beside it still carries every path, for the reader who wants them.
      //
      // AND NONE IS A REAL COUNT HERE. The state is decided by the content token, so a record can be
      // out of date with no field changed: what moved is the order things are in, and the order of a
      // record's blocks is the order somebody reads them in. Saying "0 things have changed" beside
      // "out of date" would read as a fault in Mole Office rather than as the fact it is.
      const changed = reading.changedSince ?? []
      if (changed.length === 0) {
        return (
          `${by}Written from revision ${seq}. ${ONLY_THE_ORDER_MOVED} So these words may no longer be true of ` +
          `it, and Mole Office will not draw them as current.`
        )
      }
      const how = changed.length === 1 ? 'One thing about the record has changed' : `${String(changed.length)} things about the record have changed`
      return (
        `${by}${held}Written from revision ${seq}. ${how} since. So these words may no longer be true of it, and ` +
        `Mole Office will not draw them as current.`
      )
    }
    case 'cannot_write':
      // A POSITION NOBODY CAN WRITE. The card on the drawing says this and the write door refuses
      // with the same clause, so the three surfaces say one thing about one level. `reading.why`
      // says which of the two reasons it is and neither is "nobody has written one".
      //
      // BOTH SENTENCES COME FROM @shared/zoom.ts, so the reading row and the whole-record note below
      // cannot drift from the write door's refusal. There used to be a copy of each in this file.
      return reading.why === 'tooShort'
        ? tooShortForLevelSentence(reading.label.toLowerCase())
        : noPartsToWriteSentence([reading.label.toLowerCase()])
    case 'cannot_check':
      return (
        `${by}This says it was written from revision ${seq}, and this database's ledger does not hold that ` +
        `revision with that content. So Mole Office cannot say whether the record has moved past it. ` +
        `GET /api/records/${recordId}/revisions is what this pair has to come from.`
      )
  }
}

/**
 * THE NAME OF THE WRITER A STORED FORM NAMES, or null when no registered person or agent has the id
 * it stores. `writtenBy` says which of the two registries to look in. A form stored before its
 * writer was stored by id holds the actor id the request sent. Where that is a handle, no registry id
 * answers to it, so it reads as null and a screen draws what is stored.
 */
function theNameOfAFormsWriter(writtenBy: ShortFormAuthor, by: string | undefined): string | null {
  if (by === undefined) return null
  return theOfficeNameOfAStoredReference({ kind: writtenBy === 'human' ? 'person' : 'agent', id: by })
}

/**
 * WHERE EVERY LENGTH STANDS ON ONE RECORD.
 *
 * All seven come back whether or not anybody has written them, because a length that is missing from
 * the answer is a length a caller has to know about in order to ask about. The six states above are
 * what tells them apart, and `why` says which of the three answers the shared code gave for a
 * position nobody has written.
 */
export function readShortForms(recordId: string, workspaceId: string): ShortFormsReading {
  const record = recordInWorkspace(recordId, workspaceId)
  const stored = readStoredShortForms(record.data[SHORT_FORMS_FIELD])
  const parts = readStoredParts(record.data[SHORT_FORMS_FIELD])
  const newest = newestRevisionOf(recordId)
  // WHAT THIS RECORD IS CALLED, once, for the sentences below. Read from the one table.
  const holder = kindWord(record.kind).text
  // WHICH OF THE THREE WHOLE-RECORD LENGTHS THIS RECORD HAS WORDS FOR. The label is a stored form;
  // levels 2 and 3 are the record's own columns, so they are on this list exactly when the columns
  // hold something. It is what the sentence about an unwritten length names as what IS written.
  const summaryColumn = typeof record.summary === 'string' && record.summary.trim() !== '' ? record.summary : null
  const alsoWritten: ShortFormLevel[] = [
    ...STORED_SHORT_FORM_LEVELS.filter((level) => stored[level] !== undefined),
    ...(record.title.trim() === '' ? [] : (['title'] as const)),
    ...(summaryColumn === null ? [] : (['gist'] as const)),
  ]

  // WHY EACH POSITION THIS RECORD HAS NOT GOT IS NOT THERE. `whyEachLevelIsMissing` is the ONE place
  // that decides between "this kind has no place for it", "this record is too short" and "nobody has
  // written it", and it is the same call the card on the drawing makes. Working the answer out again
  // here is the defect this whole file is about: the two readings drifted and the reply said *nobody
  // has written one* about a level the write door refuses.
  const whyMissing = missingOf(record, stored, parts)

  /**
   * THE STATE AND THE REASON FOR A POSITION NOBODY HAS WRITTEN.
   *
   * `none` KEEPS ITS MEANING AND GETS NARROWER: there is a place for this level and room for it and
   * nobody has written one. Where either of the other two answers holds, the position cannot be
   * written at all, and `cannot_write` says so with `why` carrying which of the two it is.
   */
  const absentAt = (rung: Rung): { state: ShortFormState; why: LevelAbsence } => {
    const reason = whyMissing[rung] ?? 'notWritten'
    return { state: reason === 'notWritten' ? 'none' : 'cannot_write', why: reason }
  }

  /**
   * The fields every row carries, whatever supplied it. Read off the rung, never typed again. The
   * noun and what it draws name this record's own kind, so a module's reader is told about a
   * module's outline and not a report's (problem rLYYdQeL0vJL).
   */
  const seat = (rung: Rung): Pick<ShortFormReading, 'rung' | 'position' | 'label' | 'noun' | 'what' | 'words' | 'wordsPer'> => {
    const spec = RUNG_SPECS[rung]
    const said = rungSaidOf(rung, holder)
    return {
      rung,
      position: spec.position,
      label: levelLabel(rung),
      noun: said.noun,
      what: said.what,
      words: spec.words,
      wordsPer: spec.wordsPer,
    }
  }

  /**
   * ONE OF THE RECORD'S OWN COLUMNS, READ AS A READING LENGTH.
   *
   * ---------------------------------------------------------------------------------------
   * WHO WROTE IT COMES OUT OF THE REVISION LEDGER AND IS NEVER STAMPED ON THE RECORD
   * ---------------------------------------------------------------------------------------
   *
   * A stored short form carries its writer because somebody wrote that form. A column carries no
   * writer of its own, and the ledger already knows who last changed it — `whoWroteTheColumn` in
   * ./revisions.ts walks back to the write that put the value there. Stamping a writer onto the
   * record would be a second copy of a fact the ledger holds, which is the defect this repository
   * keeps finding, and it would rewrite 28 reports to say what is already recorded about them.
   *
   * WHERE THE LEDGER CANNOT SAY, NOTHING IS WRITTEN. `by`, `at` and `session` are null and the
   * composer draws no line at all. A line saying "nobody recorded" reads oddly there, and writing
   * nothing is better. Criterion A9a.
   *
   * IT IS NEVER OUT OF DATE. A column moves when the record moves, because it IS the record, so
   * there is no revision it was written from and nothing to compare against. `madeFrom` is null
   * and `changedSince` is null: no comparison was possible because none is meaningful.
   */
  const columnAt = (level: 'title' | 'gist', column: 'title' | 'summary', text: string | null): ShortFormReading => {
    const spec = SHORT_FORM_SPECS[level]
    const base = { ...seat(level), level, parts: null }
    if (text === null) {
      const absent = absentAt(level)
      const reading = {
        ...base,
        from: null,
        state: absent.state,
        why: absent.why,
        text: null,
        wordCount: null,
        writtenBy: null,
        by: null,
        byName: null,
        at: null,
        session: null,
        override: false,
        madeFrom: null,
        changedSince: null,
        standsFor: whatItStandsFor(false, null, spec, holder),
      }
      return { ...reading, says: saysOf(reading, recordId, alsoWritten, holder) }
    }
    const wrote = whoWroteTheColumn(recordId, column, text)
    const reading = {
      ...base,
      from: column,
      state: 'current' as const,
      why: null,
      text,
      wordCount: countWords(text),
      // WHAT KIND OF WRITER, off the ledger row rather than off the record. `system` is neither of
      // the two words a short form's author may be, so it is reported as an agent's write is not:
      // null, which every screen reads as nobody having recorded a person or an agent.
      writtenBy: ((): ShortFormAuthor | null => {
        if (wrote === null) return null
        if (wrote.actorType === 'human') return 'human'
        if (wrote.actorType === 'agent') return 'agent'
        // `system` IS NEITHER OF THE TWO WORDS A SHORT FORM'S AUTHOR MAY BE, and null is that
        // answer rather than one of them: a migration that touched a column is not a person and
        // is not the agent whose work it was.
        return null
      })(),
      by: wrote === null ? null : wrote.actorId,
      byName: null,
      at: wrote === null ? null : wrote.at,
      session: wrote?.sessionId ?? null,
      override: wrote !== null && wrote.actorType === 'human',
      madeFrom: null,
      changedSince: null,
      // A WHOLE-RECORD LENGTH STANDS FOR THE WHOLE RECORD: the summary of a whole report stands for
      // the whole report. Nothing records source parts for a column and
      // nothing has to — recorded parts are provenance, not a requirement.
      standsFor: whatItStandsFor(true, null, spec, holder),
    }
    return { ...reading, says: saysOf(reading, recordId, alsoWritten, holder) }
  }

  const label = STORED_SHORT_FORM_LEVELS.map((level): ShortFormReading => {
    const spec = SHORT_FORM_SPECS[level]
    const form = stored[level]
    const base = { ...seat(level), level, parts: null }
    if (form === undefined) {
      const absent = absentAt(level)
      const reading = {
        ...base,
        from: null,
        state: absent.state,
        why: absent.why,
        text: null,
        wordCount: null,
        writtenBy: null,
        // NOBODY WROTE THIS LENGTH, so there is nobody to name, no moment to give and no run.
        by: null,
        byName: null,
        at: null,
        session: null,
        override: false,
        madeFrom: null,
        changedSince: null,
        // NOBODY WROTE THIS LENGTH, so there is no projection to stand for anything, and that is
        // said rather than left blank. `whatItStandsFor` writes the sentence for all four cases.
        standsFor: whatItStandsFor(false, null, spec, holder),
      }
      return { ...reading, says: saysOf(reading, recordId, alsoWritten, holder) }
    }
    const since = changedSince(record, form.madeFrom)
    // THE TOKENS DECIDE, NOT THE LIST. `since.changed` is empty for a reorder and the record has
    // still moved, which is the whole reason this reads `same` — see the file header.
    const state = stateSince(since)
    const reading = {
      ...base,
      from: 'shortForm' as const,
      state,
      why: null,
      text: form.text,
      wordCount: countWords(form.text),
      writtenBy: form.writtenBy,
      // WHAT THE FORM CARRIES, AND NOTHING FILLED IN. A form stored before 2 September 2026 carries
      // neither, and the record's own `updatedAt` is not an answer to when these words were written.
      by: form.by ?? null,
      byName: theNameOfAFormsWriter(form.writtenBy, form.by),
      at: form.at ?? null,
      session: form.session ?? null,
      override: form.writtenBy === 'human',
      madeFrom: form.madeFrom,
      changedSince: since === null ? null : since.changed,
      standsFor: whatItStandsFor(true, sourcesOf(record, form.standsFor), spec, holder),
    }
    return { ...reading, says: saysOf(reading, recordId, alsoWritten, holder, since === null ? null : since.onlyMoved) }
  })

  // THE THREE WHOLE-RECORD LENGTHS IN LADDER ORDER: the label somebody wrote, then the record's own
  // title and its own summary. The two columns ARE levels 2 and 3 since 3 September 2026 —
  // criterion A14b — so nothing is written beside the record for them and nothing needs to be.
  const written: ShortFormReading[] = [
    ...label,
    columnAt('title', 'title', record.title.trim() === '' ? null : record.title),
    columnAt('gist', 'summary', summaryColumn),
  ]

  // THE THREE LENGTHS WRITTEN BY PART, ALL THREE READING THE ONE STORED STRUCTURE.
  //
  // They stand or fall together, and that is the point of one structure rather than three: a report
  // whose parts are written has all three of these lengths, and a report whose parts are not has
  // none of them and falls back to its gist at all three. There is no state in which level 5 is
  // written and level 6 is not.
  const byPart = BY_PART_LEVELS.map((level): ShortFormReading => {
    const base = { ...seat(level), level: null, from: null }
    if (parts === null) {
      const absent = absentAt(level)
      const reading = {
        ...base,
        parts: { written: false, count: null },
        state: absent.state,
        why: absent.why,
        text: null,
        wordCount: null,
        writtenBy: null,
        by: null,
        byName: null,
        at: null,
        session: null,
        override: false,
        madeFrom: null,
        changedSince: null,
        // A LENGTH WRITTEN BY PART STANDS FOR ITS PARTS, and there are none. The whole-record
        // sentence would be a claim about a form nobody wrote.
        standsFor: null,
      }
      return { ...reading, says: saysOf(reading, recordId, alsoWritten, holder) }
    }
    const since = changedSince(record, parts.madeFrom)
    const state = stateSince(since)
    const reading = {
      ...base,
      parts: { written: true, count: parts.parts.length },
      state,
      why: null,
      // THERE IS NO ONE TEXT AT THESE THREE LENGTHS and null says so rather than joining the parts
      // into one. A joined text would be words nobody wrote, drawn as though somebody had.
      text: null,
      wordCount: null,
      writtenBy: parts.writtenBy,
      by: parts.by ?? null,
      byName: theNameOfAFormsWriter(parts.writtenBy, parts.by),
      at: parts.at ?? null,
      session: parts.session ?? null,
      override: parts.writtenBy === 'human',
      madeFrom: parts.madeFrom,
      changedSince: since === null ? null : since.changed,
      standsFor: null,
    }
    return { ...reading, says: saysOf(reading, recordId, alsoWritten, holder, since === null ? null : since.onlyMoved) }
  })

  // FULL, WHICH IS THE RECORD ITSELF. It is on this list because a caller asking where this record
  // stands at each reading length has to be told about the seventh, and it is reported as what it
  // is rather than as a length nobody has written.
  const full: ShortFormReading = {
    ...seat('full'),
    level: null,
    from: null,
    parts: null,
    state: 'is_the_record',
    why: null,
    text: null,
    wordCount: null,
    writtenBy: null,
    by: null,
    byName: null,
    at: null,
    session: null,
    override: false,
    madeFrom: null,
    changedSince: null,
    standsFor: null,
    says: '',
  }
  const levels = [...written, ...byPart, { ...full, says: saysOf(full, recordId, alsoWritten, holder) }]

  // A LEVEL IS WRITTEN EXACTLY WHEN `why` IS NULL. `why` is the shared code's answer for a missing
  // level and null for a level somebody wrote, so the count and the note read the reason rather than
  // a second opinion about what `state` means.
  const writtenCount = levels.filter((l) => l.why === null && l.state !== 'is_the_record').length
  const outOfDate = levels.filter((l) => l.state === 'out_of_date').length
  return {
    recordId,
    kind: record.kind,
    version: versionOf(contentOf(record)),
    newestRevision: newest,
    levels,
    written: writtenCount,
    outOfDate,
    note: noteFor(levels, recordId),
  }
}

/**
 * WHY A POSITION THAT CANNOT BE WRITTEN HAS NO WORDS. Two answers, and the sentence names which.
 *
 * IT REUSES THE CARD'S OWN WORDS AND THE WRITE DOOR'S OWN CLAUSE. The card says *This record is too
 * short for level 4* and the write door refuses with *A level longer than the record would have to
 * say more than the record does*. A second vocabulary for one fact is the defect this file fixes.
 */
function cannotBeWrittenSentence(levels: readonly ShortFormReading[]): string {
  const levelNames = levels.map((l) => l.label.toLowerCase())
  const names = joined(levelNames)
  if (levels[0]?.why === 'tooShort') return tooShortForLevelSentence(names)
  // ONE SENTENCE WITH THE WRITE DOOR. `refusePartsOnAKindWithNoPlace` below throws the same words
  // when a summary written by part arrives at a kind that has no place for one, so what a reader is
  // told and what a writer is told about the same record cannot be two different things.
  return noPartsToWriteSentence(levelNames)
}

/**
 * The one sentence about the whole record. It counts what is there rather than describing a design.
 *
 * IT NAMES THE LENGTHS NOBODY HAS WRITTEN, and that is not decoration. This sentence is what a
 * writer reads back after filing a short form, and "1 of the 5 have been written" does not tell
 * them which four are still missing — so the next write is a guess or a second read. The names come
 * out of the levels this reading already built, so the count and the list cannot disagree.
 *
 * IT ALSO SAYS WHICH POSITIONS CANNOT BE WRITTEN AT ALL, and why, after the count. A writer reading
 * only the missing list would go and write a level the write door refuses; the sentence that names
 * the reason is the one that stops them.
 *
 * ON A REPORT, AN UNWRITTEN LENGTH IS A READING LENGTH THAT SAYS SO. The report body draws a
 * written summary where there is one and says plainly where there is none. That is why the writer
 * is told which are missing rather than only how many.
 */
function noteFor(levels: readonly ShortFormReading[], recordId: string): string {
  // THE SEVENTH POSITION IS THE RECORD ITSELF AND IS NOT COUNTED HERE. It cannot be written and it
  // cannot be missing, so counting it would say six of seven have been written about a record whose
  // every shorter form is there.
  const writable = levels.filter((l) => l.state !== 'is_the_record')
  const total = writable.length
  // A LEVEL IS WRITTEN EXACTLY WHEN `why` IS NULL, which is the shared code's answer. Reading the
  // count off `state !== 'none'` again would be a second opinion, and it would count a position this
  // record cannot have as one somebody wrote.
  const written = writable.filter((l) => l.why === null).length
  const outOfDate = writable.filter((l) => l.state === 'out_of_date').length
  // `missing` IS ONLY THE POSITIONS SOMEBODY COULD STILL WRITE. A position this record cannot have is
  // not a missing one, and naming it here is telling a writer to meet the write door's refusal.
  const missing = writable.filter((l) => l.why === 'notWritten').map((l) => l.noun)
  const cannot = writable.filter((l) => l.why === 'noPlace' || l.why === 'tooShort')
  const unwritten =
    missing.length === 0
      ? 'Every length has been written.'
      : `Nobody has written the ${missing.join(', ')}.`
  const cannotBeWritten = cannot.length === 0 ? '' : `${cannotBeWrittenSentence(cannot)} `
  if (written === 0) {
    return (
      `Nobody has written any of the ${String(total)} shorter forms of this record` +
      `${missing.length === 0 ? '' : `: ${missing.join(', ')}`}. ${cannotBeWritten}Every list, card and picker ` +
      `that has no room for the whole thing therefore has nothing to draw, and each says so ` +
      `rather than shortening the record itself. POST /api/records/${recordId}/short-forms is how they are written.`
    )
  }
  const stale =
    outOfDate === 0
      ? 'None of them is out of date.'
      : `${String(outOfDate)} of them ${outOfDate === 1 ? 'is' : 'are'} out of date, because the record changed ` +
        `after they were written. Out of date is worked out by comparing what the record held at the revision ` +
        `each was written from with what it holds now, so nobody has to remember.`
  return (
    `${String(written)} of the ${String(total)} shorter forms of this record ${written === 1 ? 'has' : 'have'} ` +
    `been written. ${unwritten} ${cannotBeWritten}${stale}`
  )
}

// ============================================================================ reading a whole list

/** What one row of a list gets: the words at one length, or the honest absence, plus its state. */
export interface ShortFormForRow {
  recordId: string
  level: ShortFormLevel
  /** The words, or null when nobody has written any at this length. */
  text: string | null
  /**
   * The record's title, or null when it has none. It is its own field and never fills `text`, so a row
   * with no label still says so, and a screen that draws the title in its place can mark it as standing in.
   */
  title: string | null
  state: ShortFormState
  /** True when a person wrote it by hand. A screen has to mark it. */
  override: boolean
  /** Which agent or person wrote it, as `ShortFormReading.by` holds it, or null where nobody recorded one. */
  by: string | null
  /** When it was written, local wall clock, or null where nobody recorded one. */
  at: string | null
  says: string
}

/**
 * HOW MANY RECORDS ONE CALL MAY ASK ABOUT.
 *
 * A list draws rows, and asking per row is a request per row — the fault measured on the review list
 * on 18 August 2026, where asking cost a request each and so nothing asked and every row was drawn
 * the same. This is the same shape of answer `POST /api/annotations/readings` gives for the same
 * reason, and the number is the same one for the same reason: it is a screen's worth of rows.
 */
export const MAX_ROWS = 200

/**
 * ONE LENGTH, FOR A WHOLE LIST OF RECORDS, IN ONE READ.
 *
 * THIS IS WHAT A PICKER OR A LIST CALLS. The example is the recipient picker: it shows a
 * label and a short line on each run rather than a paragraph. A caller passes the ids it is about to
 * draw and the length its rows have room for, and gets back one row per record — including the
 * records nobody has written a short form for, which say so.
 *
 * IT NEVER SUBSTITUTES ANOTHER LENGTH. A row that asked for a label and is handed a 250-word brief
 * is a row eleven lines tall, and the caller never asked for that. `atLevel` in src/shared/zoom.ts is
 * the same rule for a caller that already holds the texts.
 *
 * A RECORD THAT IS NOT IN THIS PROJECT IS LEFT OUT rather than refused, and the answer is shorter
 * than the question, which a caller can see. Refusing the whole read because one id in a list of
 * forty has been moved would make a list undrawable over one row.
 */
export function shortFormsForRows(
  recordIds: readonly string[],
  workspaceId: string,
  level: ShortFormLevel,
): ShortFormForRow[] {
  if (recordIds.length > MAX_ROWS) {
    throw new PanelError(
      `Ask about at most ${String(MAX_ROWS)} records at once; this asked about ${String(recordIds.length)}. ` +
        `That is about a screen's worth of rows, and a list longer than that is being drawn before it is filtered.`,
    )
  }
  const out: ShortFormForRow[] = []
  for (const recordId of [...new Set(recordIds)]) {
    let reading: ShortFormsReading
    try {
      reading = readShortForms(recordId, workspaceId)
    } catch (error) {
      // Only "there is no such record here" is passed over. Anything else is a fault in this read
      // and is raised, because swallowing it would report a record as having no short forms when
      // what happened is that nothing looked.
      if (error instanceof PanelError && error.status === 404) continue
      throw error
    }
    const found = reading.levels.find((l) => l.level === level)
    if (found === undefined) continue
    out.push({
      recordId,
      level,
      text: found.text,
      title: reading.levels.find((l) => l.level === 'title')?.text ?? null,
      state: found.state,
      override: found.override,
      by: found.by,
      at: found.at,
      says: found.says,
    })
  }
  return out
}

// ============================================================================ writing

/**
 * What a caller asks to be stored. A level named with null clears it; a level not named is left alone.
 *
 * `parts` SITS BESIDE THE THREE TEXTS BECAUSE IT IS WRITTEN THE SAME WAY: one request, one stamp,
 * one writer. It is a list rather than a text because the three lengths above the gist are written
 * by part — see `StoredParts` in @shared/zoom.ts.
 */
export type ShortFormWrite = Partial<Record<ShortFormLevel, string | null>> & {
  parts?: readonly StoredPart[] | null
}

/**
 * WHO MADE ONE WRITE OF A SHORT FORM, AND WHEN — the three facts Mole Office records about the write
 * itself, worked out once and never claimed by the caller.
 *
 * `writtenBy` is WHAT KIND of writer it was and decides the override. `by` is WHICH one. `at` is
 * when. The second and the third are there so that who made a short form is recorded.
 */
export interface ShortFormWriting {
  writtenBy: ShortFormAuthor
  /**
   * The writer's registry id, or null when the request stated no actor at all.
   *
   * THE ID OF THE ROW `participantForActor` FINDS, not the string the request sent. An agent may
   * send its handle, and a handle can be changed or freed and then name another agent. The resolver's
   * first step is the agent's key, so an agent a key proved is stored as itself. A form the person
   * writes stores the person's id.
   *
   * THE ACTOR ID WHERE NO ROW IS FOUND. The office's own writer is neither an agent nor a person, and
   * an agent that needs no registration has no registry row. What the request sent is then the only
   * name there is.
   *
   * NULL RATHER THAN THE DEFAULT IDENTITY. `actorFrom` defaults a header-less request to
   * the owner and marks it as not stated, and `design/DECISIONS-PENDING.md` §36 settles that
   * silence is not proof of anybody. Storing the owner's id there would put a person's name on words
   * nobody said they wrote — the third engineering rule, in the one field that is evidence about a
   * person. So the name is left unrecorded, which every screen says out loud.
   */
  by: string | null
  /** Local wall-clock time, from the one writer in @shared/time.ts. Never UTC. */
  at: string
  /**
   * THE RUN THAT MADE THIS WRITE, as the id of its session record, or null.
   *
   * RESOLVED HERE THE WAY THE REVISION LEDGER RESOLVES IT. `x-mole-office-session` may be a session
   * record's id or a run name bound to one, so the header alone is not something a page can link
   * to. `resolveSessionRef` answers with the record it means, inside the record's own project, and
   * null where nothing there answers to it.
   *
   * NULL IS A REAL ANSWER AND IT IS STORED AS ABSENCE. A request that named no session, or named a
   * run nobody has filed, has no session record to point at. The ledger still keeps what the caller
   * sent, which is why nothing here guesses: see `attributionFor` in ./records.ts.
   */
  session: string | null
}

/**
 * WHO IS WRITING AND WHEN, WORKED OUT ONCE PER WRITE.
 *
 * ONE FUNCTION FOR BOTH DOORS. `POST /api/records/<id>/short-forms` and an ordinary
 * `PATCH /api/records/<id>` both store `data.shortForms`, and until this existed only the first
 * derived anything at all about the writer — see `settleShortForms` for what an agent could store
 * through the second before that was closed for `writtenBy`.
 *
 * THE STAMP IS TAKEN ONCE AND SHARED BY EVERY LEVEL THIS WRITE TOUCHES, because one request is one
 * moment. Reading the clock per level would file six forms written together at six times, and a
 * reader comparing two of them would see a difference that never happened.
 */
export function shortFormWriting(actor: Actor, workspaceId: string | null): ShortFormWriting {
  return {
    writtenBy: shortFormAuthor(actor),
    by: actor.stated === false ? null : (participantForActor(actor)?.id ?? actor.id),
    at: nowStamp(),
    session: sessionRecordBehind(actor, workspaceId),
  }
}

/**
 * WHICH SESSION RECORD THE CALLER'S `x-mole-office-session` NAMES, INSIDE ONE PROJECT.
 *
 * The reference is resolved in the project of the RECORD being written, which is the same project
 * `logChange` resolves it in, so a form and the ledger row for the same write name one session.
 * Resolving it anywhere else would file the write under another project's run.
 */
function sessionRecordBehind(actor: Actor, workspaceId: string | null): string | null {
  const sent = (actor.sessionId ?? '').trim()
  if (sent === '' || workspaceId === null) return null
  return resolveSessionRef(sent, workspaceId).recordId
}

/**
 * The short forms a record should hold after a write, merged with what it holds now.
 *
 * MERGED RATHER THAN REPLACED, because the lengths are written at different times: somebody
 * adds a brief to a record that already has a label, and a whole-object write would silently drop
 * the label. A level named with `null` is cleared, which is the same spelling `dataPatch` already
 * uses for deleting a key, and a level not named is left exactly as it was.
 *
 * NOTHING HERE VALIDATES. The budgets, the cutting rule and the ledger check all run on the way
 * through `patchRecord`, which is the one write door. This only decides what object to hand it.
 */
export function mergeShortForms(
  current: StoredShortForms,
  write: ShortFormWrite,
  madeFrom: { seq: number; contentHash: string },
  writtenBy: ShortFormAuthor,
  standsFor: Partial<Record<ShortFormLevel, readonly string[]>> = {},
): StoredShortForms {
  const merged: StoredShortForms = { ...current }
  for (const level of STORED_SHORT_FORM_LEVELS) {
    if (!(level in write)) continue
    const text = write[level]
    if (text === null || text === undefined) {
      delete merged[level]
      continue
    }
    // THE SOURCES GO WITH THE WORDS AND ARE NOT CARRIED OVER FROM THE FORM BEING REPLACED. Writing
    // a level writes the whole of that level: keeping the old list would say the new words stand
    // for parts nobody said they stand for, which is the guess criterion 18 forbids.
    const sources = standsFor[level]
    // WHICH ACTOR WROTE IT AND WHEN ARE NOT SET HERE, AND THAT IS ON PURPOSE. `settleShortForms`
    // below stamps both, on the merged object, on the way through `patchRecord` — which is the one
    // door this function's result goes through and the only door the other write path goes through
    // as well. Setting them here too would be one fact worked out in two places, and the copy that
    // reached the database would be the other one.
    merged[level] = { text, madeFrom, writtenBy, ...(sources === undefined ? {} : { standsFor: sources }) }
  }
  return merged
}

/**
 * THE MERGE PATCH THAT PRODUCES THAT RESULT — the value to send under `shortForms` in a `dataPatch`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PATCH IS NOT SIMPLY THE MERGED OBJECT
 * ---------------------------------------------------------------------------------------
 *
 * `mergeData` in lib/records/merge-data.ts RECURSES: where the incoming value and the stored value are both
 * objects, it merges them key by key rather than replacing one with the other. So handing it the
 * merged set does not remove a length that was cleared — the level's old object is still under the
 * key, and the merge leaves it there. That is what a deletion has to be said in this patch's own
 * language for, which is an explicit `null` under the level's key.
 *
 * MEASURED, NOT REASONED. This was written the other way, every test passed, and clearing one of two
 * lengths over HTTP did nothing at all: the reply said `card: current` with the card still in it.
 * The one test that covered clearing happened to clear the ONLY length, which takes the branch below
 * that removes the whole field, so it never touched the broken path.
 *
 * The whole field is removed when nothing would be left, because an empty object stored under
 * `shortForms` reads as "somebody wrote short forms" when nobody has.
 */
export function shortFormsPatch(
  current: StoredShortForms,
  write: ShortFormWrite,
  madeFrom: { seq: number; contentHash: string },
  writtenBy: ShortFormAuthor,
  standsFor: Partial<Record<ShortFormLevel, readonly string[]>> = {},
  /**
   * THE BY-PART STRUCTURE THIS RECORD HOLDS NOW, so that clearing the last text does not take the
   * parts with it. Without it a request that cleared the gist on a record whose only other content
   * is the parts would remove the whole `shortForms` field, and the report would lose levels 4 to 6
   * because somebody cleared level 3.
   */
  currentParts: StoredParts | null = null,
): Record<string, unknown> | null {
  const textsLeft = Object.keys(mergeShortForms(current, write, madeFrom, writtenBy, standsFor)).length
  const partsLeft = write.parts === undefined ? currentParts !== null : write.parts !== null
  if (textsLeft === 0 && !partsLeft) return null
  const patch: Record<string, unknown> = {}
  // THE PARTS, WRITTEN WHOLE OR CLEARED. A null removes the key, which is what `mergeData` needs to
  // hear: it recurses into an object already under a key, so leaving the key out would leave the
  // old parts standing under the new ones. Who wrote it and when are NOT in this patch —
  // `settleShortForms` stamps both after `mergeData` has run, for the reason written on it.
  if (write.parts === null) {
    // A NULL UNDER A KEY THAT IS NOT THERE IS STORED AS A NULL, which the schema refuses. So the
    // null is written exactly when there is something to remove, the same rule this function
    // already follows for a cleared source list one field down.
    if (currentParts !== null) patch[PARTS_KEY] = null
  } else if (write.parts !== undefined) {
    patch[PARTS_KEY] = { madeFrom, writtenBy, parts: write.parts }
  }
  for (const level of STORED_SHORT_FORM_LEVELS) {
    if (!(level in write)) continue
    const text = write[level]
    if (text === null || text === undefined) {
      patch[level] = null
      continue
    }
    // A LEVEL WRITTEN WITHOUT SOURCES DOES NOT KEEP THE SOURCES OF THE FORM IT REPLACES, and that
    // needs saying in this patch's own language. `mergeData` recurses into an object that is
    // already there, so leaving the key out would leave the old list under the new words — the same
    // fault the note above this function records for a cleared level, one field down. A null
    // removes a key that is there; a null under a key that is NOT there is stored as a null, which
    // is a value the schema refuses. So the null is written exactly when there is one to remove.
    const sources = standsFor[level]
    const had = current[level]?.standsFor !== undefined
    // WHICH ACTOR WROTE IT AND WHEN ARE NOT IN THIS PATCH EITHER. `settleShortForms` writes both on
    // the merged object, after `mergeData` has run, which is what a previous writer's name has to
    // be overwritten AFTER: `mergeData` recurses into the object already under this key, so a name
    // left out here is a name left standing. See `mergeShortForms` above.
    patch[level] = {
      text,
      madeFrom,
      writtenBy,
      ...(sources !== undefined ? { standsFor: sources } : had ? { standsFor: null } : {}),
    }
  }
  return patch
}

/**
 * REFUSE A REVISION THE LEDGER DOES NOT HOLD.
 *
 * The same rule, and the same reason, as `checkContextRevision` in ./targets.ts: Mole Office checks the
 * pair a writer sends and never fills one in. Stamping "the newest revision as of now" would claim
 * the writer had read the newest revision, and nothing measured that — somebody writing a gist from
 * a report they opened an hour ago wrote it from what they were looking at.
 */
export function checkMadeFrom(recordId: string, madeFrom: { seq: number; contentHash: string }): void {
  const row = db
    .select()
    .from(revisions)
    .where(and(eq(revisions.recordId, recordId), eq(revisions.seq, madeFrom.seq)))
    .get()
  if (row === undefined) {
    throw new PanelError(
      `Record ${recordId} has no revision ${String(madeFrom.seq)}, so a short form cannot say it was written from ` +
        `one. GET /api/records/${recordId}/revisions lists the revisions it has. Nothing was stored.`,
      404,
    )
  }
  if (row.contentHash !== madeFrom.contentHash) {
    throw new PanelError(
      `Revision ${String(madeFrom.seq)} of record ${recordId} holds the content "${row.contentHash}", and this says ` +
        `the short form was written from "${madeFrom.contentHash}". The two name different revisions, so one of ` +
        `them is about something else. Nothing was stored. Send the seq and the contentHash from the same entry of ` +
        `GET /api/records/${recordId}/revisions.`,
    )
  }
}

/** The words a record holds now, at every length, for a caller that only wants the text. */
export function storedTextsOf(record: PanelRecord): ShortFormTexts {
  return textsOf(readStoredShortForms(record.data[SHORT_FORMS_FIELD]))
}

/** Everything a record holds now, whole. */
export function storedShortFormsOf(record: PanelRecord): StoredShortForms {
  return readStoredShortForms(record.data[SHORT_FORMS_FIELD])
}

/**
 * What a caller sends to write short forms.
 *
 * THERE IS NO `writtenBy` HERE ON PURPOSE. Who wrote the words is derived from the actor headers by
 * `shortFormAuthor` below. It used to be a field of this object, which meant it was a claim the
 * writer made about themselves — see that function for what that cost.
 */
export interface ShortFormWriteRequest {
  madeFrom: { seq: number; contentHash: string }
  forms: ShortFormWrite
  /**
   * WHICH PARTS OF THE RECORD EACH OF THOSE FORMS STANDS FOR, by region id, for the levels whose
   * writer recorded them.
   *
   * A LEVEL MAY ONLY APPEAR HERE IF IT APPEARS IN `forms`. The sources are a fact about the words
   * being written, and letting them be written against a level nobody is writing would let the two
   * drift: a gist rewritten later would keep the source list of the gist it replaced. The route
   * refuses that pair by name.
   *
   * EVERY ID IS CHECKED AGAINST THE RECORD'S OWN REGIONS. An id the record does not hold is refused
   * rather than stored, for the reason `checkMadeFrom` refuses a revision the ledger does not hold:
   * storing it would put a name on a screen that the server answers *that part is not there* about.
   */
  standsFor?: Partial<Record<ShortFormLevel, readonly string[]>>
}

/**
 * REFUSE A SOURCE LIST THAT NAMES A LEVEL NOBODY IS WRITING, OR A PART THIS RECORD DOES NOT HAVE.
 *
 * ---------------------------------------------------------------------------------------
 * TWO REFUSALS, AND BOTH ARE THE SAME RULE THIS FILE ALREADY APPLIES TO `madeFrom`
 * ---------------------------------------------------------------------------------------
 *
 * `checkMadeFrom` refuses a revision the ledger does not hold rather than storing a claim nobody
 * can check. These are that rule about the other half of a projection's provenance.
 *
 *   A LEVEL NOT BEING WRITTEN. The sources belong to the words, so they are recorded when the words
 *   are. Accepting them apart would let a gist rewritten next week keep the source list of the gist
 *   it replaced, and nothing on any screen would say so.
 *
 *   A REGION THIS RECORD DOES NOT HOLD. `regionOfRecord` is the same tree the server resolves a
 *   comment against, so an id it does not find is one that would draw as *a part this record no
 *   longer holds* the moment it was written. Storing it would be recording a source nobody has.
 *
 * A LEVEL WITH AN EMPTY LIST IS REFUSED TOO. "Stands for nothing" is not a state a projection can
 * be in, and storing it would be a second spelling of "nobody recorded", free to read differently.
 *
 * ---------------------------------------------------------------------------------------
 * A BLOCK AND A PARAGRAPH INSIDE IT ARE TWO PARTS, NOT TWO SPELLINGS OF ONE
 * ---------------------------------------------------------------------------------------
 *
 * Both `data.blocks[#b-1]` and `data.blocks[#b-1].text@0` are accepted here and that is correct,
 * because they name different things. Measured on the report OOOt4Kouc5dT, 1 September 2026: the
 * first is a SECTION holding four parts — a heading and three paragraphs — and the second is the
 * first of those three, 394 characters of it. `nameOfRegion` calls them "the section" and "the
 * paragraph" for that reason, and a comment left on one is not a comment left on the other.
 *
 * SO NOTHING IS NORMALISED AT THIS DOOR. Folding one into the other would throw away a distinction
 * the region tree makes, every mark relies on and the reader can see. What was really wrong was not
 * that both were accepted: it was that the two BEHAVED differently once stored, because *View
 * original* could land on a paragraph and not on a block. That was one lookup written twice and it
 * is fixed where it was — src/web/lib/drawnhere.ts is now the only answer to which element on a page
 * is which part, and both spellings land.
 *
 * WHAT A WRITER HAS TO KNOW is therefore which of the two they mean, so the refusal below says it
 * and so does the route description in src/server/api/zoom.ts.
 */
function checkStandsFor(record: PanelRecord, input: ShortFormWriteRequest): void {
  const asked = input.standsFor
  if (asked === undefined) return
  for (const level of STORED_SHORT_FORM_LEVELS) {
    const ids = asked[level]
    if (ids === undefined) continue
    const words = input.forms[level]
    if (words === null || words === undefined) {
      throw new PanelError(
        `standsFor names the ${SHORT_FORM_SPECS[level].noun}, and forms does not write one. Which parts a short ` +
          `form stands for is recorded when its words are written, so send the ${level} words in the same ` +
          `request. Nothing was stored.`,
        400,
      )
    }
    if (ids.length === 0) {
      throw new PanelError(
        `standsFor.${level} is an empty list. A short form that stands for no part of the record is not a thing ` +
          `Mole Office can hold: leave the level out of standsFor and it is recorded as one whose source parts ` +
          `nobody wrote down, which is what every short form in this project is today. Nothing was stored.`,
        400,
      )
    }
    for (const regionId of ids) {
      if (regionOfRecord(record.id, regionId) !== null) continue
      throw new PanelError(
        `standsFor.${level} names the part "${regionId}", and record ${record.id} has no such part. A source ` +
          `region is checked against the record the way madeFrom is checked against its ledger, because a name ` +
          `nothing holds would be drawn on a screen as a part somebody could go to. A part is named by its ` +
          `stored path — "data.blocks[#b-1]" is a whole block, "data.blocks[#b-1].text@0" is the paragraph ` +
          `that starts at character 0 inside it, and "section.openAround" is a section of the record page. ` +
          `Those are different parts and both a block and a paragraph inside it can be named here, so name ` +
          `the one you mean. Right-clicking the thing on the record page reads its exact id off the thing ` +
          `itself, which is the one way to be sure which of the two you have. Nothing was stored.`,
        400,
      )
    }
  }
}

/**
 * WHO WROTE THESE WORDS, WORKED OUT FROM WHO IS ASKING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS DERIVED AND NOT DECLARED
 * ---------------------------------------------------------------------------------------
 *
 * `writtenBy: 'human'` puts a sentence on every screen saying a person wrote this by hand, which
 * OVERRIDES what would otherwise be derived from the record. That is a claim about a person, so it
 * has to come from the same place every other claim about who did something comes from: the three
 * actor headers, read once, in `actorFrom`.
 *
 * IT USED TO BE A FIELD OF THE REQUEST BODY, and so it was evidence of nothing in either direction.
 * An agent posting `writtenBy: "human"` got the override sentence while the change log recorded the
 * agent; a person posting without the flag had their own hand-written label filed as a derived one.
 * Measured 19 August 2026.
 *
 * AN ACTOR NOBODY STATED IS FILED AS AN AGENT. A request that sends no actor headers at all is
 * defaulted to the owner and marked as not stated, and the owner settled what that means in
 * `design/DECISIONS-PENDING.md` §36: missing actor headers are not proof of human authority. So
 * silence does not buy the override. Nothing is refused for it — the level is written and filed as
 * derived, which is the weaker of the two claims and the one that needs no evidence.
 *
 * IT IS EXPORTED BECAUSE THE ORDINARY WRITE DOOR NEEDS IT TOO. `patchRecord` can be handed
 * `data.shortForms` directly, and until 19 August 2026 that door derived nothing: an agent's PATCH
 * could store `writtenBy: "human"` and the record page drew the sentence saying a person wrote it by
 * hand. See `settleShortForms` below, which is the one caller from that path.
 */
export function shortFormAuthor(actor: Actor): ShortFormAuthor {
  return actor.type === 'human' && actor.stated !== false ? 'human' : 'agent'
}

/**
 * A plain object, or null. The four checks below all begin by asking this.
 *
 * Anything else under `shortForms` — a string, a list, a number — is a shape mistake, and
 * `validateRecordData` names the field and what it should be a few lines further down the write.
 * Refusing it here would answer a type error with a sentence about the revision ledger.
 */
function plainObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/**
 * DID ANY VERSION OF THIS RECORD HOLD THESE WORDS UNDER THIS KEY?
 *
 * This is what tells putting a version back from writing something new. The retired-key gate in
 * `settleShortForms` asks it, and only when the arriving value differs from what the record holds
 * now — which is a restore, an import, or somebody typing, and rare either way — so the ledger read
 * costs nothing on an ordinary write.
 *
 * IT COMPARES VALUES, NOT REVISION NUMBERS. A restore names one revision, but the same words may
 * have stood across many of them, and the caller does not say which one it came from. So the answer
 * is over the whole ledger of this record: any revision holding this exact value under this key is
 * proof the words are the record's own history rather than a new write.
 *
 * `fieldsThatDiffer` is the comparison because it is the one the gate above uses, so a value read
 * out of a revision and written back with its keys in another order is still the same value.
 */
function someRevisionHeld(recordId: string, key: string, value: unknown): boolean {
  const rows = db.select({ data: revisions.data }).from(revisions).where(eq(revisions.recordId, recordId)).all()
  for (const row of rows) {
    const forms = plainObject(row.data[SHORT_FORMS_FIELD])
    if (forms === null || !(key in forms)) continue
    if (fieldsThatDiffer(forms[key], value).length === 0) return true
  }
  return false
}

// ==================================================== the record a short form is measured against

/**
 * THE RECORD AS IT WILL STAND WHEN THIS WRITE LANDS — the two columns and the kind.
 *
 * The third thing a short form is measured against is the record's `data`, and `settleShortForms`
 * already holds that as `next`. These three are what it does not: `title` and `summary` are columns
 * rather than fields of `data`, and the kind is what says which field of `data` holds the blocks.
 */
export interface TheRecordAsItWillStand {
  kind: RecordKind
  title: string
  /** Null where nobody has written one. Not an empty string standing in for that. */
  summary: string | null
}

/**
 * THE RECORD'S OWN WORDS, AS THIS WRITE WILL LEAVE THEM.
 *
 * WHICH TEXT THAT IS, IS DECIDED IN `@shared/detail.ts` and not here, because the page asks the same
 * question of the same record and two answers to it would be this repository's recurring defect.
 * This function's whole job is finding the blocks in the `data` about to be stored and reading them
 * the way every other reader of a record's prose reads them.
 *
 * A BLOCKS VALUE THIS WRITE CANNOT READ IS READ AS NO PROSE, and that is handled rather than hidden.
 * `proseOfBlocks` reads a block's declared fields, so a half-written block — a metrics block with no
 * items, say — makes it throw. THE WRITE IS ALREADY REFUSED WHEN THAT HAPPENS: `validateRecordData`
 * checks the same field a few lines later on the patch path and has checked it already on the create
 * path, and neither has written anything yet. So there is nothing here for a short form to be
 * measured against, this comparison has nothing to say, and the caller gets the sentence about its
 * blocks rather than a sentence about short forms — which is the one it can act on.
 */
function theRecordsOwnWordsAfterThisWrite(
  itself: TheRecordAsItWillStand,
  next: Record<string, unknown>,
): TheRecordsOwnWords | null {
  const field = blocksFieldOf(itself.kind)
  if (field === null) {
    // A KIND THAT HOLDS NO BLOCKS. Its own words are its own two columns and there is nothing to
    // read out of `data`, so this always has an answer.
    return theRecordsOwnWords({ body: null, summary: itself.summary, title: itself.title })
  }
  const blocks = next[field]
  // A CLEARED OR ABSENT BODY IS NOT AN UNREADABLE ONE. The record will hold no blocks, so its own
  // words are its columns, which is what `theRecordsOwnWords` answers for an empty body.
  if (!Array.isArray(blocks)) {
    return theRecordsOwnWords({ body: null, summary: itself.summary, title: itself.title })
  }
  try {
    const prose = proseOfBlocks(blocks as readonly SummaryBlock[])
    return theRecordsOwnWords({ body: { field: `data.${field}`, prose }, summary: itself.summary, title: itself.title })
  } catch {
    // HANDLED, AND WHAT IS HANDLED IS SAID. See the note above: this write is refused by the block
    // rules, nothing has been stored, and the record's own words cannot be read. Answering from the
    // columns instead would compare a short form against the wrong text and call it the right one.
    return null
  }
}

/**
 * NO SHORT FORM MAY BE THE OPENING OF THE RECORD'S OWN TITLE OR SUMMARY. Problem 1uVuXgnE8HKS.
 *
 * ---------------------------------------------------------------------------------------
 * THE TITLE AND THE SUMMARY ARE LONGER FORMS OF EVERY RECORD
 * ---------------------------------------------------------------------------------------
 *
 * A short form is a job, not a size, and none of the jobs is the record with the end taken off. The
 * record's own `title` is level 2 and its own `summary` is level 3, on every kind, so a label cut from
 * either is the cut this rule exists to catch. Both columns are asked here, as this write will leave
 * them, whatever else the record holds.
 *
 * UNTIL 5 OCTOBER 2026 ONLY ONE TEXT WAS ASKED: the record's own words, which are its blocks where it
 * holds blocks, else its summary, else its title. So a report's label could be the opening of the
 * report's title and was stored, and so could a task's where the task had a summary. The comparison
 * with the blocks stays in `checkShortFormsAgainstBody` in ./summary.ts, which already understands a
 * body; this one compares with the two columns and nothing else, so no text is compared twice.
 *
 * THE PROPOSAL THAT ASKED FOR LABELS ON EVERY KIND NAMED THIS AS THE THING TO WATCH:
 * *a label that copies the title's first words is what his POINTING ruling forbade* — proposal
 * `dYDv5is4UTUJ`, 5 September 2026.
 *
 * WHAT IT CANNOT SEE is what the whole comparison cannot see: change one of those words and nothing
 * here can tell the result from writing. `isCutOf` carries that sentence and this adds nothing to it.
 */
function refuseAFormCutFromTheRecordsOwnColumns(
  arriving: Record<string, unknown>,
  held: Record<string, unknown>,
  itself: TheRecordAsItWillStand,
): void {
  const columns = [
    { field: 'title', text: itself.title },
    { field: 'summary', text: itself.summary ?? '' },
  ].filter((column) => column.text.trim() !== '')
  for (const level of STORED_SHORT_FORM_LEVELS) {
    const form = plainObject(arriving[level])
    if (form === null) continue
    // ONLY THE LEVELS THIS WRITE CHANGES, for the reason the whole function carries: a record whose
    // stored label was written before this rule existed may still be patched in every other way.
    if (fieldsThatDiffer(held[level], form).length === 0) continue
    const text = form['text']
    if (typeof text !== 'string' || text.trim() === '') continue
    const cutFrom = columns.find((column) => isCutOf(text, column.text))
    if (cutFrom === undefined) continue
    const spec = SHORT_FORM_SPECS[level]
    throw new PanelError(
      `The ${spec.noun} in \`${SHORT_FORMS_FIELD}.${level}\` is the opening of this ${kindWord(itself.kind).text}'s ` +
        `own \`${cutFrom.field}\`, so it was made by cutting rather than written. ${spec.what} A cut keeps whichever ` +
        `words came first rather than the ones worth keeping. A record's \`title\` and \`summary\` are longer ` +
        `readings of it, so a shorter form is compared against both.\n\n` +
        `How the comparison is made: the two are compared as sequences of words, lower case, with the ` +
        `punctuation at each end of every word taken off. So adding a full stop to the end of a cut does not get ` +
        `past it.\n\n` +
        `What it cannot see: change one of those words and Mole Office cannot tell the result from writing. ` +
        `Passing this check is not evidence that a short form was written rather than cut. Nothing was stored.`,
    )
  }
}

/**
 * NO WRITTEN LEVEL MAY SAY MORE THAN THE RECORD ITSELF.
 *
 * ---------------------------------------------------------------------------------------
 * WHOSE RULE THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * A decision: every kind may have reading levels, but take care that none of them
 * says more than the record. A shorter form longer than the thing it is a shorter form of is not a
 * shorter form of it. The reader who opens the record to read more finds less.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS COMPARED: WORDS, WHICH IS WHAT THE BUDGETS ARE COUNTED IN
 * ---------------------------------------------------------------------------------------
 *
 * `countWords` is the same count `budgetAgainst` uses to refuse a six-word label, so a writer is not
 * told two different numbers about one text. The refusal names both lengths, because a writer told
 * only its own length cannot tell what to change.
 *
 * IT USED TO SPLIT ON SPACES ONLY, AND THAT MADE THIS RULE REFUSE EVERY CHINESE RECORD A NAME. A
 * Chinese title has no spaces, so it counted as one word however long it was, and every honest
 * two-to-five-word label said more than the record it shortened. So a record written in Chinese
 * could not have the name a list, a card or a picker draws — problem
 * `wq24OKf_dbSw`, measured on the live API on 6 September 2026. `countWords` now counts a Chinese or
 * Japanese character as a word on its own, and this rule is unchanged around it.
 *
 * THE OTHER HALF OF THE RULE IS `rungsFor` IN @shared/detail.ts: a record whose own content is
 * already as short as a level has no levels above that one, so the page draws no empty rung. That
 * one is about what a reader is offered; this one is about what a writer may store.
 */
function refuseALevelLongerThanTheRecord(
  arriving: Record<string, unknown>,
  held: Record<string, unknown>,
  own: TheRecordsOwnWords,
  itself: TheRecordAsItWillStand,
): void {
  if (own.words === 0) return
  for (const level of STORED_SHORT_FORM_LEVELS) {
    const form = plainObject(arriving[level])
    if (form === null) continue
    // ONLY THE LEVELS THIS WRITE CHANGES, for the reason `settleShortForms` carries: a rule that
    // re-checked what is already stored would freeze every record written before the rule existed.
    if (fieldsThatDiffer(held[level], form).length === 0) continue
    const text = form['text']
    if (typeof text !== 'string' || text.trim() === '') continue
    const words = countWords(text)
    if (words <= own.words) continue
    const spec = SHORT_FORM_SPECS[level]
    throw new PanelError(
      `The ${spec.noun} in \`${SHORT_FORMS_FIELD}.${level}\` is ${String(words)} words and this ` +
        `${kindWord(itself.kind).text}'s own \`${own.field}\` is ${String(own.words)}, so this reading level would say ` +
        `more than the ${kindWord(itself.kind).text} it is a shorter form of. ${spec.what} Write it shorter than the ` +
        `record, or write more in the record. A space separates words, and a Chinese or Japanese character is a word ` +
        `on its own, which is how a shorter form is compared with its record. Nothing was stored.`,
    )
  }
}

/**
 * A SUMMARY WRITTEN BY PART BELONGS ONLY ON A KIND THAT HAS A PLACE FOR ONE.
 *
 * ---------------------------------------------------------------------------------------
 * THE KIND CHECK THE WRITE DOOR DID NOT HAVE
 * ---------------------------------------------------------------------------------------
 *
 * Levels 4, 5 and 6 are written by part, and a part names the blocks of the record it covers. A task,
 * a pipeline, a note and every other kind that keeps no blocks in its own `data` therefore has no
 * place for them — `kindHoldsPartsLevels` in @shared/kinds.ts reads that off the kind's own declared
 * shape, and the reading reply and the card ask the same question. This door did not.
 *
 * WHAT IT DID INSTEAD: `refusePartsLongerThanTheRecord` below was the first thing reached, and it
 * answers with the sentence for a record that is TOO SHORT. Measured on 16 September 2026: a pipeline
 * with eighty words in its summary was refused with *"Write more in the pipeline"* — advice that can
 * never come true, because no amount of writing gives a pipeline a block field. The reading reply for
 * the same record said *this kind of record has no parts to write*, so the two surfaces gave two
 * reasons for one fact.
 *
 * IT RUNS BEFORE THE LENGTH CHECK, because where the kind has no place the length is not the reason.
 * Both surfaces now print `noPartsToWriteSentence`, so a reader and a writer are told one thing.
 */
function refusePartsOnAKindWithNoPlace(kind: RecordKind): void {
  if (kindHoldsPartsLevels(kind)) return
  const names = BY_PART_LEVELS.map((level) => levelLabel(level).toLowerCase())
  throw new PanelError(
    `${noPartsToWriteSentence(names)} A part of a record names the blocks it covers, and a ` +
      `${kindWord(kind).text} keeps no blocks in its own \`data\`, so there is nothing for a part to ` +
      `stand for. Nothing was stored.`,
  )
}

/**
 * NO SUMMARY WRITTEN BY PART MAY BE STORED ON A RECORD SHORTER THAN ONE PART.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS BESIDE `refuseALevelLongerThanTheRecord` ABOVE
 * ---------------------------------------------------------------------------------------
 *
 * That one walks the whole-record lengths — the label — and compares each stored text against the
 * record's own word count. Levels 4, 5 and 6 are not one text; they are the parts, and which of the
 * three a set of parts can be drawn at is `rungsFor`'s ceiling rather than a per-text comparison. So
 * the same rule, asked of the same record, needs the ladder rather than a word count.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT PREVENTS: TWO SURFACES DISAGREEING ABOUT ONE RECORD
 * ---------------------------------------------------------------------------------------
 *
 * The write door took parts on a record too short to have any level above the conclusion, and the
 * page then refused to draw them, because `rungsFor` had already stopped the ladder. Somebody's
 * writing was stored and drawn nowhere, and the card said nobody had written it. Refusing the write
 * is what makes the stored record and the drawn record the same record. Problem `OHqsLjYxAXLB`.
 *
 * ---------------------------------------------------------------------------------------
 * IT ASKS `rungsFor`, WHICH IS THE PAGE'S OWN ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * `detailSourceOf` builds the record as the ladder sees it and `rungsFor` says which positions it
 * has. Both are the shared functions the browser calls, so the door and the page cannot come to two
 * answers — which is the defect this repository keeps producing and the reason this is one call and
 * not a second copy of the arithmetic.
 *
 * THE RECORD AS IT WILL STAND, not as it is: a write that lengthens the record and writes its parts
 * in one request is judged on what it produces.
 */
function refusePartsLongerThanTheRecord(
  next: Record<string, unknown>,
  own: TheRecordsOwnWords | null,
  itself: TheRecordAsItWillStand,
): void {
  // NOBODY COUNTED THE RECORD'S OWN WORDS, because this write's blocks cannot be read and the block
  // rules are about to refuse it in their own words. There is nothing to compare against.
  if (own === null) return
  const source = detailSourceOf({
    kind: itself.kind,
    title: itself.title,
    summary: itself.summary,
    data: next,
  } as unknown as PanelRecord)
  const has = rungsFor(source)
  if (BY_PART_LEVELS.some((level) => has.includes(level))) return
  const shortest = BY_PART_LEVELS[0] as ByPartLevel
  const budget = RUNG_SPECS[shortest].words
  throw new PanelError(
    `This ${kindWord(itself.kind).text} is ${String(own.words)} words in its \`${own.field}\`, so it has no reading ` +
      `level above the conclusion for a summary written by part to be drawn at` +
      `${budget === null ? '' : `: one part of ${levelLabel(shortest).toLowerCase()} is up to ${String(budget.max)} words`}. ` +
      `A level longer than the record would have to say more than the record does. The person's rule of 5 September 2026: ` +
      `所有模块都允许有semantic level，但是要注意不要出现比原文多的. Write more in the ${kindWord(itself.kind).text}, or ` +
      `leave \`${SHORT_FORMS_FIELD}.${PARTS_KEY}\` out — the conclusion is already the whole of what this record ` +
      `says. Nothing was stored.`,
  )
}

/**
 * THE TWO THINGS A WRITER MAY NOT SAY ABOUT ITS OWN SHORT FORMS, SETTLED ON THE ORDINARY WRITE PATH.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS WHEN `writeShortForms` ABOVE ALREADY DOES BOTH
 * ---------------------------------------------------------------------------------------
 *
 * Because a rule enforced on one write path is not a rule, and `data.shortForms` has two doors.
 * `POST /api/records/<id>/short-forms` is the front one and has always checked the stamp and
 * derived the author. A plain `PATCH /api/records/<id>` writes the same field and did neither.
 *
 * MEASURED ON 19 AUGUST 2026, before this function existed: an agent sent
 * `PATCH {"dataPatch":{"shortForms":{"label":{"text":"…","madeFrom":{"seq":44,"contentHash":"aaaa…"},
 * "writtenBy":"human"}}}}`, Mole Office answered 200, and the record page drew the label with the
 * sentence that says a person wrote this length by hand. Both halves were false: the revision did
 * not exist, and the writer was an agent.
 *
 * ---------------------------------------------------------------------------------------
 * THE RECORD AS IT WILL STAND, HANDED IN
 * ---------------------------------------------------------------------------------------
 *
 * The kind, the title and the summary AFTER this write. `next` is the whole of `data` as it will
 * stand — both callers in lib/records.ts hand in the merged object or the wholesale one — but the
 * title and the summary are columns and are not in it, and a patch may change one of them in the
 * same request that writes a short form.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES TO EACH LEVEL THIS WRITE IS CHANGING
 * ---------------------------------------------------------------------------------------
 *
 * THE STAMP IS CHECKED AGAINST THE LEDGER, by `checkMadeFrom`, exactly as the front door checks it.
 * A revision this record does not have is refused and nothing is stored.
 *
 * THE AUTHOR IS OVERWRITTEN with what `shortFormAuthor` derives from the actor, whatever the body
 * said. This is not the quiet substitution this repository bans: `writtenBy` is Mole Office's own record
 * of who made the write, so a caller is not the authority on it, and storing what the caller claimed
 * would be fabricated evidence about a person. The front door has never accepted the field at all.
 *
 * ---------------------------------------------------------------------------------------
 * ONLY THE LEVELS THIS WRITE CHANGES, AND THAT IS THE WHOLE SUBTLETY
 * ---------------------------------------------------------------------------------------
 *
 * A merge patch carries the record's existing short forms along with it, so checking everything in
 * the object about to be stored would re-check forms this write is not touching. A record holding
 * one form whose stamp the ledger cannot confirm — there are such rows, written before this door was
 * closed — would then be frozen: no patch to its title, its summary or anything else could ever land
 * again. That is the same trap `checkAnnotationContext` fell into on this path, and lib/records.ts
 * carries the note about it. So each level is compared with what is stored first, and a level that
 * has not moved is left exactly alone.
 *
 * A FORGERY IS ALWAYS A CHANGE, so nothing is let through by that. Storing back the same bytes that
 * are already there forges nothing.
 *
 * `recordId` IS null WHEN THE RECORD IS BEING FILED FOR THE FIRST TIME, and then every short form is
 * refused rather than checked: a record that does not exist yet has no revisions, so no short form
 * can honestly name the revision it was written from. The refusal says to file the record and then
 * write its short forms.
 *
 * `itself` IS THE RECORD AS IT WILL STAND WHEN THIS WRITE LANDS, and it is handed in rather than
 * read here. A patch may change the title and a short form in one request, and reading the stored
 * title would then compare the new words against words this write is replacing — a comparison
 * against the wrong text, answered as though it were the right one.
 */
export function settleShortForms(
  recordId: string | null,
  stored: Record<string, unknown>,
  next: Record<string, unknown>,
  actor: Actor,
  itself: TheRecordAsItWillStand,
): void {
  const arriving = plainObject(next[SHORT_FORMS_FIELD])
  if (arriving === null) return
  const held = plainObject(stored[SHORT_FORMS_FIELD]) ?? {}
  const settled: Record<string, unknown> = { ...arriving }
  // ONE WRITE, ONE WRITER, ONE RUN, ONE MOMENT. Read before the loop so that six levels written
  // together carry one stamp rather than six that differ by whatever the loop cost.
  //
  // THE PROJECT IS THE RECORD'S OWN, because the caller's session reference is resolved inside it —
  // the same project `logChange` resolves it in for the ledger row of this same write. A record
  // being filed for the first time has no row yet and every short form on it is refused below, so
  // there is nothing to stamp and null is the honest workspace.
  const owner = recordId === null ? undefined : db.select({ workspaceId: records.workspaceId }).from(records).where(eq(records.id, recordId)).get()
  const writing = shortFormWriting(actor, owner?.workspaceId ?? null)
  let changed = false

  refuseAFormCutFromTheRecordsOwnColumns(arriving, held, itself)
  // THE WORDS THE RECORD ITSELF WILL HOLD WHEN THIS WRITE LANDS, which a written level may not be
  // longer than. NULL MEANS THE BLOCKS THIS WRITE CARRIES CANNOT BE READ, so there is nothing to
  // measure a short form against and the block rules are about to refuse the write in their own words.
  const own = theRecordsOwnWordsAfterThisWrite(itself, next)
  if (own !== null) refuseALevelLongerThanTheRecord(arriving, held, own, itself)

  // THE THREE RETIRED KEYS ARE REFUSED ON A NEW WRITE AND LEFT ALONE WHERE THEY STAND.
  //
  // Records in this project hold text under `card`, `brief` and `account`. The owner retired those
  // three lengths on 2 September 2026 when levels 4 to 6 became the by-part structure. What is
  // stored stays exactly as it is and nothing draws it; what is refused is somebody WRITING one
  // again, which is why the comparison is against what is held rather than against the key alone.
  // A record carrying one can still be patched — otherwise retiring a length would freeze every
  // record that ever used it, which is the trap `settleShortForms` already avoids for the levels
  // it settles below.
  //
  // AND PUTTING A VERSION BACK IS NOT WRITING ONE. A restore is an ordinary patch of the whole of
  // `data`, so a revision that carries a retired form arrives here looking exactly like somebody
  // typing that form in. Measured on 3 September 2026 by the fifth verification: restoring the
  // oldest revision of a report dropped its short forms, and after that every later revision was
  // unreachable, because putting one back read as a new `card`. All 26 reports in this project
  // store all three keys, so the act the record page offers in words — put a version back — was
  // refused on every one of them. Problem `MBqNmPWlSeQs`.
  //
  // SO THE QUESTION IS WHETHER THIS RECORD EVER HELD THESE WORDS, not whether it holds them now.
  // The ledger answers it, and it is the same ledger `checkMadeFrom` reads. A value under a retired
  // key that some revision of this record held is its own history coming back, and it goes through.
  // A value no revision ever held is somebody writing a retired length, and it is refused. Nothing
  // new is stored either way, because what goes through is words this record already had.
  for (const key of RETIRED_SHORT_FORM_KEYS) {
    if (!(key in arriving)) continue
    if (fieldsThatDiffer(held[key], arriving[key]).length === 0) continue
    if (recordId !== null && someRevisionHeld(recordId, key, arriving[key])) continue
    throw new PanelError(
      `\`${SHORT_FORMS_FIELD}.${key}\` is retired and cannot be written. The reading ladder has seven ` +
        `positions — ${SEVEN_RUNGS_NAMED} — and only \`label\` and \`${PARTS_KEY}\` are stored under ` +
        `\`${SHORT_FORMS_FIELD}\`. Reading length 2 is this record's own \`title\` and length 3 is its own ` +
        `\`summary\`, both written with PATCH /api/records/<id>; lengths 4, 5 and 6 are written by part, in ` +
        `\`${SHORT_FORMS_FIELD}.${PARTS_KEY}\`: a heading, a 30-word text, a 120-word text and the blocks ` +
        `covered, for each part of the report. What is already stored under \`${key}\` is left exactly as it ` +
        `is and nothing draws it. Putting back a version of this record that held one is allowed, because ` +
        `that carries words the record already had; these are new words. Nothing was stored.`,
    )
  }

  // THE BY-PART STRUCTURE IS STAMPED LIKE A FORM, because it is one more thing somebody wrote about
  // this record at a reading length, and the same two things may not be claimed by the writer: the
  // revision it names is checked against the ledger, and who wrote it is derived from the actor.
  const arrivingParts = plainObject(arriving[PARTS_KEY])
  if (arrivingParts !== null && fieldsThatDiffer(held[PARTS_KEY], arrivingParts).length > 0) {
    // THE KIND FIRST, THEN THE LENGTH. A kind with no place for the by-part levels is not too short,
    // it is the wrong shape, and saying so is the answer the reading reply already gives.
    refusePartsOnAKindWithNoPlace(itself.kind)
    refusePartsLongerThanTheRecord(next, own, itself)
    if (recordId === null) {
      throw new PanelError(
        `A summary written by part names the revision of this record it was written from, and a record being ` +
          `filed for the first time has no revisions yet — so \`${SHORT_FORMS_FIELD}.${PARTS_KEY}\` cannot be ` +
          `checked against anything and nothing was stored. File the record, then write its short forms with ` +
          `POST /api/records/<id>/short-forms, which names the revision they were made from, or send the top-level ` +
          `shortForms key in the same POST /api/records.`,
      )
    }
    const stamp = plainObject(arrivingParts['madeFrom'])
    const seq = stamp?.['seq']
    const contentHash = stamp?.['contentHash']
    if (typeof seq === 'number' && Number.isFinite(seq) && typeof contentHash === 'string' && contentHash !== '') {
      checkMadeFrom(recordId, { seq, contentHash })
    }
    const settledParts: Record<string, unknown> = {
      ...arrivingParts,
      writtenBy: writing.writtenBy,
      at: writing.at,
    }
    if (writing.by === null) delete settledParts['by']
    else settledParts['by'] = writing.by
    // AND THE RUN, ON THE SAME RULE AS THE NAME. Deleted where the request named no session record,
    // because a run kept from the body would say a run this write never touched had written it.
    if (writing.session === null) delete settledParts['session']
    else settledParts['session'] = writing.session
    settled[PARTS_KEY] = settledParts
    changed = true
  }

  for (const level of STORED_SHORT_FORM_LEVELS) {
    const form = plainObject(arriving[level])
    if (form === null) continue
    // UNTOUCHED MEANS UNTOUCHED. `fieldsThatDiffer` walks the two objects key by key, so a caller
    // that read a form and wrote it back with its keys in another order has changed nothing.
    if (fieldsThatDiffer(held[level], form).length === 0) continue

    if (recordId === null) {
      throw new PanelError(
        `A short form names the revision of this record it was written from, and a record being filed for the ` +
          `first time has no revisions yet — so the ${SHORT_FORM_SPECS[level].noun} in \`${SHORT_FORMS_FIELD}.` +
          `${level}\` cannot be checked against anything and nothing was stored. File the record, then write its ` +
          `short forms with POST /api/records/<id>/short-forms, which names the revision they were made from, or send ` +
          `the top-level shortForms key in the same POST /api/records.`,
      )
    }
    const madeFrom = plainObject(form['madeFrom'])
    const seq = madeFrom?.['seq']
    const contentHash = madeFrom?.['contentHash']
    if (typeof seq === 'number' && Number.isFinite(seq) && typeof contentHash === 'string' && contentHash !== '') {
      checkMadeFrom(recordId, { seq, contentHash })
    }
    // WHO WROTE IT, WHICH ONE, IN WHICH RUN, AND WHEN — all four overwritten, all four from the
    // request rather than from the body. `by` and `session` are DELETED where the request stated no
    // actor or named no session record, because a form that kept either from the body would say
    // somebody wrote words they never sent, which is the same forgery `writtenBy` was closed
    // against on 19 August 2026.
    const settledForm: Record<string, unknown> = { ...form, writtenBy: writing.writtenBy, at: writing.at }
    if (writing.by === null) delete settledForm['by']
    else settledForm['by'] = writing.by
    if (writing.session === null) delete settledForm['session']
    else settledForm['session'] = writing.session
    settled[level] = settledForm
    changed = true
  }

  // The object is replaced rather than written into, so nothing the caller still holds is altered
  // underneath it, and every key nobody here understands is carried across untouched.
  if (changed) next[SHORT_FORMS_FIELD] = settled
}

/**
 * WRITE OR CLEAR SOME OF A RECORD'S SHORT FORMS, and hand back where all five then stand.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS AN ORDINARY RECORD EDIT
 * ---------------------------------------------------------------------------------------
 *
 * `patchRecord` is the one write door and this goes through it, so the field checking, the
 * human-only rule, the change log and the revision all happen exactly as they do on any other edit.
 * The word budgets and the two cutting rules are enforced in there, by the write gate, which is why
 * none of them is repeated here.
 *
 * THE STAMP AND THE AUTHOR ARE SETTLED ON BOTH DOORS, and this one asks first. `settleShortForms`
 * above is called from inside `patchRecord`, so a plain PATCH gets the same ledger check and the
 * same derived author that this route gets. What this adds is the ORDER: `input.madeFrom` is checked
 * before anything is read or merged, so a caller naming a revision that does not exist is told that
 * and nothing else. It also covers the one case the gate cannot see — clearing every level, where
 * there is no form left in the stored object for the gate to check the pair against.
 *
 * ---------------------------------------------------------------------------------------
 * THE COMPARE-AND-SET IS THE RECORD'S CURRENT VERSION, NOT `madeFrom`
 * ---------------------------------------------------------------------------------------
 *
 * Those are two different facts and using one as the other would break both. `madeFrom` is a claim
 * about which revision somebody READ; the compare-and-set is about whether the record has moved
 * since this function read it a line ago. They are usually different tokens the moment a record has
 * any short forms at all, because a short form lives inside `data` and writing one moves the
 * record's version.
 *
 * A guard is warranted because this is a whole-object write of `data.shortForms`: the merge below is
 * built from a value that was read, so without one a second writer's levels could be dropped. Inside
 * this process the read and the write are one synchronous step and nothing can interleave; the guard
 * is what makes that true of a second process as well.
 */
export function writeShortForms(
  recordId: string,
  workspaceId: string,
  input: ShortFormWriteRequest,
  actor: Actor,
): ShortFormsReading {
  const record = recordInWorkspace(recordId, workspaceId)
  checkMadeFrom(recordId, input.madeFrom)
  checkStandsFor(record, input)
  const result = patchRecord(
    recordId,
    {
      // A MERGE PATCH NAMING ONE KEY, so this write cannot touch anything else the record holds.
      // What goes under that key is the patch `shortFormsPatch` builds — a level to write, or a
      // null to clear one — rather than the whole merged set, and the note on that function says
      // what happened when it was the whole merged set.
      dataPatch: { [SHORT_FORMS_FIELD]: shortFormsPatch(
        readStoredShortForms(record.data[SHORT_FORMS_FIELD]),
        input.forms,
        input.madeFrom,
        // WHO IS ASKING, never what the request said about itself. See `shortFormAuthor`.
        shortFormAuthor(actor),
        input.standsFor ?? {},
        readStoredParts(record.data[SHORT_FORMS_FIELD]),
      ) },
      ifVersion: versionOf(contentOf(record)),
    },
    actor,
  )
  const reading = readShortForms(recordId, workspaceId)
  return { ...reading, ...(result.nothingWritten === undefined ? {} : { nothingWritten: nothingWrittenSentence({ kind: Object.values(input.forms).every((value) => value === null) ? 'short-forms-absent' : 'short-forms-unchanged' }) }) }
}
