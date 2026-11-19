// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORD A COMMENT STORED ABOUT WHETHER ITS WORDS HAD GONE OUT, TAKEN OFF THE RECORD — AND THE
 * ONE-WAY MARKER FOR THE COMMENTS WHOSE FACT NOTHING ELSE HOLDS. Two acts, a transaction each,
 * written and proved and NOT REGISTERED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FINISHING
 * ---------------------------------------------------------------------------------------
 *
 * Whether a comment's words have gone to somebody was written down in two places. `agent_messages`
 * said it about the message carrying the words. `records.data.state` said it about the comment
 * those words came from, in three words — `queued`, `sent`, `answered`.
 *
 * The second one could be wrong and could be walked back. It was stamped from the browser after the
 * send, inside a `try/catch` whose failure changed nothing, so a comment could be out and still read
 * `queued`; and three writes with three 200s, measured on 19 August 2026, put a sent comment back to
 * `queued`, rewrote its body and marked it sent again.
 *
 * Wave 3 made `agent_messages.state` the one store. Wave 4 removed the last reader and the last
 * writer of the record field from `src/`, and `GET /api/kinds` now tells every writer, in capitals,
 * that nothing decides anything from it and not to write it. So the field is dead in the code and
 * still sitting in the records. THIS IS THE STEP THAT TAKES IT OUT OF THE RECORDS — which is the
 * difference between a field that is gone and a field that is frozen, and the frozen half is what
 * wave 3 and wave 4 both recorded as a major fault.
 *
 * ---------------------------------------------------------------------------------------
 * TWO ACTS, BECAUSE WINDOW B ORDERS THEM APART
 * ---------------------------------------------------------------------------------------
 *
 * ACT ONE — every comment loses its `state` key, and its newest revision is restamped so the ledger
 * still names what the record holds. `design/ROUND-TEN-BUILD-PLAN.md`'s window-B ordering puts this
 * ABOVE `migrateRevisions`; it restamps anyway, so it is correct in either position.
 *
 * ACT TWO — a comment whose own word said its words had gone out, and which no message and no
 * earlier marker can account for, gets one row in `annotation_words_fixed`. The plan puts this below
 * `migrateReviews`, because it reads `agent_messages`.
 *
 * THE TWO ACTS ARE SEPARATE FUNCTIONS AND SEPARATE TRANSACTIONS for that reason alone. They are in
 * one file because they are one decision about one field, and reading either without the other
 * would leave somebody thinking the field can just be deleted.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER BETWEEN THEM, AND WHY ACT ONE REFUSES RATHER THAN TRUSTING IT
 * ---------------------------------------------------------------------------------------
 *
 * Act two reads the stored word. Act one deletes it, and restamps the one revision that held it. So
 * act one running first, on a comment act two still owes a marker to, DESTROYS ACT TWO'S ONLY INPUT
 * — and the fact that comment's words went out would be gone from the corpus altogether, with no
 * error anywhere.
 *
 * SO ACT ONE REFUSES TO TAKE THE WORD OFF A COMMENT WHOSE WORD SAYS ITS WORDS WENT OUT UNLESS THAT
 * FACT IS ALREADY HELD SOMEWHERE ELSE — a message carrying the comment's id that has left `queued`,
 * or a marker written by an earlier act two. The refusal names every such comment and says to run
 * act two first, which needs nothing from act one. That is the design's own opening sentence
 * (`design/round-ten/design/review.md` §10.2): *order matters and the migration refuses to run out
 * of order*.
 *
 * ON THE OWNER'S CORPUS THE REFUSAL CANNOT FIRE, because no comment in it says its words went out
 * — measured below. On the owner's corpus the two acts commute and the plan's ordering stands exactly as
 * written. On any other corpus the refusal is what stops the plan's ordering from losing a fact.
 *
 * ---------------------------------------------------------------------------------------
 * HOW BIG IT IS, MEASURED RATHER THAN PLANNED
 * ---------------------------------------------------------------------------------------
 *
 * The build plan's window-B row 5 said 22 annotations until 25 August 2026, and wave 7 recorded that
 * figure as stale and unre-measured. Counted on 26 August 2026 against a copy of the owner's corpus
 * made by `VACUUM INTO`, so the write-ahead log is folded in, by
 * `design/round-ten/migrations/run-annotation-state.mjs <copy>` with no `--apply`:
 *
 *     annotations, deleted ones included ...............  7
 *     carrying a `state` key ...........................  7
 *     their words: queued 7, sent 0, answered 0 ........  7 / 0 / 0
 *     newest revisions the restamp would rewrite .......  7
 *     messages naming a comment and past `queued` ......  0
 *     markers already written ..........................  0
 *     markers act two would write ......................  0
 *
 * SO ACT ONE WRITES 7 RECORDS AND 7 REVISIONS, AND ACT TWO WRITES NOTHING ON THIS CORPUS. That is
 * not act two failing. It is act two's own answer: no comment in this corpus has ever said its words
 * went out, so there is no lost fact for a marker to hold. The same counter run over all 29 backups
 * in `data/backups` gives the same answer — see the commit that added
 * `design/round-ten/scratch/w7-annotation-state-count.mjs`.
 *
 * **THE PLAN'S SECOND HALF FOR THIS ROW CANNOT BE WRITTEN DOWN AS IT STANDS.** It says
 * `annotation_words_fixed` *"gets one row per message with `from_annotation_id` NULL — 1 of 1 here"*.
 * A row of that table IS a comment: `annotation_id` is its primary key. A message whose
 * `from_annotation_id` is NULL names no comment, so there is no key to write it under. This file
 * follows the DESIGN's rule instead (§10.2 step 4): a marker is for a comment whose OWN stored word
 * said its words went out and which no message names. The one message in the corpus with no comment
 * on it, `mGYhhpVnfVbZ`, was written 2026-08-18 09:40:29 — before the oldest comment in the
 * database, 2026-08-19 18:14:49 — so it could not have carried any of them, and act two's report
 * names it rather than dropping it.
 *
 * THE COUNTS ARE A PARAMETER AND NOT A CONSTANT, for the reason ./block-identity.ts gives: a
 * function with the corpus's numbers baked in cannot be tested against anything else, and the first
 * thing anybody would do is take the check out. The runner holds the corpus's numbers with the date
 * they were taken; a test holds its fixture's. Any difference and the run refuses, naming both.
 *
 * ---------------------------------------------------------------------------------------
 * A WORD THAT DISAGREES WITH THE STORE IS EVIDENCE, AND IT IS REPORTED
 * ---------------------------------------------------------------------------------------
 *
 * The two mechanisms can disagree in both directions and they mean different things.
 *
 *   THE WORD SAYS GONE, THE STORE HAS NOTHING. The comment's words went out and no conversation
 *   recorded which comment they came from. This is not an edge case: `handOverToOneAgent` never
 *   passed `fromAnnotationId` until wave 3, and that is the ordinary composer path. THIS IS WHAT THE
 *   MARKER IS FOR, and act two writes one.
 *
 *   THE WORD SAYS WAITING, THE STORE SAYS THE WORDS WENT OUT. The word was written by the browser
 *   after the send and its failure changed nothing, so this is the fault wave 3 measured, sitting in
 *   a record. THE STORE WINS AND NOTHING IS LOST BY DELETING THE WORD — the message is still there
 *   and still says so. Act one counts these and names every one of them in its report, because a
 *   disagreement is evidence about how the old field behaved and deleting it quietly would be the
 *   only chance anybody had to see it.
 *
 *   A WORD THAT IS NONE OF THE THREE. Nothing here knows what it meant. Act one REFUSES the whole
 *   run and names the comment and the word. Reading it as *not gone* would be this migration
 *   deciding what somebody's word meant, which is the fifth invariant: absence beats a guess.
 *   Measured on the corpus: no such word.
 *
 * ---------------------------------------------------------------------------------------
 * THE CLOSING ASSERTION, AND THE ONE PLACE THIS DOES NOT DO WHAT THE DESIGN'S WORDS SAY
 * ---------------------------------------------------------------------------------------
 *
 * The design (§10.2 step 7) asks for three closing assertions. Two are here as written: no comment
 * holds a `state` key afterwards, and the distribution is printed rather than asserted.
 *
 * THE THIRD IS ASKED AS AN INCLUSION AND NOT AS AN EQUALITY, AND THAT IS DELIBERATE. The design says
 * *"the number of comments for which `hasGoneOut` is true equals the number that were `sent` or
 * `answered`"*. Written as an equality it refuses on a comment whose word said `queued` and which a
 * message says went out — and that comment is not a fault in this migration, it is the wave-3 fault
 * sitting in a record: the browser stamped the word after the send inside a `try/catch` that changed
 * nothing. Wave 4 measured the product's answer for exactly that case and the store wins. Stopping
 * the owner's window over it would be refusing a state that is already correct.
 *
 * SO THE HARD CHECK IS THE DIRECTION THE DESIGN'S OWN FAILURE NOTE NAMES — *a comment whose fact was
 * lost between the two mechanisms*. Every comment whose word said its words went out is answered by
 * `hasGoneOut` afterwards, through a message or through a marker, or the transaction rolls back
 * naming it. The other direction is COUNTED AND NAMED in both reports, per record, so nobody has to
 * take this paragraph on trust.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE `fixed_at` COMES FROM, AND WHAT HAPPENS WHEN NOTHING RECORDED IT
 * ---------------------------------------------------------------------------------------
 *
 * `annotation_words_fixed.fixed_at` is *"when the old field was stamped, taken from the change log"*
 * (schema.ts). Two witnesses, in this order, and NO THIRD:
 *
 *   1. the newest `changes` row for that comment whose `field` is `data.state` and whose new value
 *      is `sent` or `answered`. The NEWEST, because the word the record holds now is the last one
 *      written, and that is the moment being recorded.
 *   2. the newest `revisions` row for that comment whose stored `data.state` was `sent` or
 *      `answered`. The ledger is a second witness to the same fact and the design's own counter asks
 *      for it by that name.
 *
 * IF NEITHER EXISTS, ACT TWO REFUSES THE WHOLE RUN AND NAMES THE COMMENT AND THE FIELD. A time
 * nobody recorded is a time nobody may invent, and `updated_at` is not it — that is when the record
 * was last written for any reason at all. The refusal says the two things that could answer it.
 * Measured on the corpus: no comment is in that case, because none says its words went out.
 *
 * WITNESS 2 IS ALSO WHY ACT TWO CANNOT BE RUN AFTER ACT ONE FOR A COMMENT THAT NEEDS A MARKER: act
 * one's restamp rewrites the newest revision, so the ledger stops holding the word. Act one's
 * refusal above is what makes that unreachable rather than merely unlikely.
 *
 * ---------------------------------------------------------------------------------------
 * THE PREDICATE IS THE PRODUCT'S, CLAUSE FOR CLAUSE, AND A TEST HOLDS THEM TOGETHER
 * ---------------------------------------------------------------------------------------
 *
 * `hasGoneOut` in `src/server/lib/dispatch.ts` is two clauses: a message carrying the comment's id
 * that is past `queued`, OR a row in `annotation_words_fixed`. `goneOutIn` below asks the same two
 * questions of the database handle this migration was given.
 *
 * IT IS NOT AN IMPORT, AND THAT IS NOT LAZINESS. `dispatch.ts` reaches `src/server/db/client.ts`,
 * which OPENS A DATABASE AT IMPORT — whichever one `.env` names, which is the owner's real corpus.
 * A migration that is handed a handle to a copy and imports that module would open the owner's live file as
 * a side effect of being loaded, and then answer questions about the wrong database. client.ts's own
 * header records four commands and eight test files that did exactly this, and four junk records
 * written into the owner's corpus by one of them.
 *
 * SO THE TWO ARE HELD TOGETHER BY A TEST INSTEAD: `tests/annotation-state-migration.test.ts` builds
 * a comment in every one of the six message states, plus a marker, plus both, plus neither, and
 * asserts that `goneOutIn` and the product's `hasGoneOut` answer the same for every one. Dropping
 * either clause from either function reddens it by name. A test can import `dispatch.ts` safely
 * because `freshDb()` points `MOLE_OFFICE_DB` at a throwaway file before the import runs.
 *
 * ---------------------------------------------------------------------------------------
 * IT RESTAMPS, AND NOTHING IS LOST BY THE RESTAMP
 * ---------------------------------------------------------------------------------------
 *
 * A record's newest revision holds what the record holds, and its `content_hash` IS the token a read
 * hands back as `version` and a write has to send back to prove it is not stale. A migration that
 * rewrote `records.data` and left the ledger alone would leave every one of those records refusing
 * every write for ever. So act one restamps, in the same transaction, the way
 * `design/round-nine/step20-bundle/place-migration.ts` does at its lines 308 and 347.
 *
 * ./block-identity.ts made the opposite choice — a fresh revision — because 60 of its 89 records
 * hold a single revision and restamping would have deleted the composed title from the ledger with
 * nothing else holding it. HERE THE RESTAMP DELETES NOTHING, and act one's check 1 is what makes
 * that a fact rather than a hope: no comment whose word said its words went out loses that word
 * until a message or a marker holds the same fact, and the whole transaction rolls back if even one
 * does not. All seven of the owner's comments hold exactly one revision each and all seven say
 * `queued`, which is what the dispatch store already says about them.
 *
 * NO `changes` ROW AND NO `updated_at`. A migration is not somebody saying something. The revision's
 * `note` is set instead, and only where it was empty, so the ledger says in words that a migration
 * removed the field and that nobody chose it.
 *
 * ---------------------------------------------------------------------------------------
 * BOTH ACTS ARE SAFE TO RUN TWICE
 * ---------------------------------------------------------------------------------------
 *
 * A comment with no `state` key is not a candidate, so act one's second run plans nothing, writes
 * nothing and reports `alreadyDone`. A marker is keyed on the comment, so act two counts a row that
 * is already there and does not write it again — which also means a half-finished run can be
 * finished rather than started over.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT LIVES HERE AND IS NOT REGISTERED
 * ---------------------------------------------------------------------------------------
 *
 * It is NOT in `drizzle/meta/_journal.json` and NOT in `migrateInPlace`, and that is deliberate.
 * `npm run db:migrate` runs on every clone and on every server start, including the owner's. This
 * empties a field on seven of the owner's comments and rewrites their revisions. It is applied by its own
 * runner, `run-annotation-state.mjs`, against a database named on the command line, which refuses
 * the live corpus by name. Window B is when it runs for real, and there is no window B in this run.
 *
 * IT TOUCHES `src/shared/kinds.ts` NOT AT ALL. `ANNOTATION_STATES` and the annotation kind's `state`
 * field stay declared and optional; window B's commit deletes them beside this migration. Until
 * then both answers are correct and neither is lost. The three words are written out below rather
 * than imported from that file for the same reason ./reviews-reach.ts writes out its two target
 * kinds: the list this migration is about is the list that commit deletes, and a migration importing
 * it would stop compiling at the moment it is registered.
 */

import type Database from 'better-sqlite3'
import { contentOf, versionOf } from './version.ts'

// ============================================================================ the words, written out

/**
 * The two of the three old words that said a comment's words had gone to somebody.
 *
 * `answered` is in the list because it was one of `ANNOTATION_STATES` and a record written before
 * wave 3 can hold it. Nothing writes it any more and the corpus holds none, but a migration that
 * only knew about `sent` would silently delete an `answered` comment's fact.
 */
export const THE_GONE_WORDS = ['sent', 'answered'] as const
export type GoneWord = (typeof THE_GONE_WORDS)[number]

/** The one old word that said the words had not gone anywhere yet. */
export const THE_WAITING_WORD = 'queued'

/** All three, so "a word nothing knows" has one definition. */
export const THE_OLD_WORDS: readonly string[] = [THE_WAITING_WORD, ...THE_GONE_WORDS]

/**
 * What every marker says, word for word from `design/round-ten/design/review.md` §10.2.
 *
 * There is one sentence because there is one thing to say. No message is invented, no body is
 * matched against another body, and no recipient is guessed: two comments with the same words would
 * make body-matching a guess.
 */
export const THE_ONE_SENTENCE =
  'These words had already gone to somebody when Mole Office stopped storing a word for it, and no ' +
  'conversation recorded which comment they came from.'

/** What a restamped revision's `note` says, where it had none. */
export const REVISION_NOTE =
  'A migration removed the word this comment stored about whether its words had gone out. Nobody ' +
  'chose it: where a comment has got to is now worked out from the messages that carried its words, ' +
  "so the word could not be kept without being a second answer. This revision's time is the moment " +
  'somebody wrote, not the moment of the migration.'

// ============================================================================ what the acts are told

/** One comment's stored word, read before anything is written. This is act two's input. */
export interface StoredWord {
  id: string
  workspaceId: string
  /** The word the record holds. */
  word: string
  /** Set when the comment is in the wastebasket. Act one still takes the key off it. */
  deletedAt: string | null
  /** True when the word is one of `THE_GONE_WORDS`. */
  saysGone: boolean
  /** True when the word is none of the three, which refuses act one. */
  nobodyKnowsThisWord: boolean
}

/** What the caller says it counted before act one. Re-counted here; any difference refuses. */
export interface MeasuredWords {
  /** Every comment, deleted ones included. This is the population act one walks. */
  annotations: number
  /** Comments carrying a `state` key at all. This is the key act one removes. */
  carryingAWord: number
  /** Comments whose word says their words went out. This is the population act two considers. */
  sayingGone: number
}

/** What the caller says it counted before act two. Re-counted here; any difference refuses. */
export interface MeasuredDispatch {
  /** Rows already in `annotation_words_fixed`. */
  markers: number
  /** Messages that name a comment and have left `queued` — what the dispatch store answers with. */
  messagesGoneOut: number
}

// ============================================================================ what the acts produce

/** One comment act one would take the key off. */
export interface KeyRemoval {
  recordId: string
  workspaceId: string
  deletedAt: string | null
  word: string
  saysGone: boolean
  /** The record's `data` with `state` removed and every other key in the order it was in. */
  data: string
}

/** One comment act one will not touch, and why. Left exactly as it is. */
export interface SkipNote {
  kind: 'unreadable_data' | 'no_message_names_it' | 'a_word_nothing_knows' | 'a_message_names_nothing'
  recordId: string
  detail: string
}

/** A comment the two mechanisms disagree about, in either direction. Reported, never dropped. */
export interface Disagreement {
  recordId: string
  workspaceId: string
  /** The word the record stored. */
  word: string
  /** What the dispatch store says about the same comment. */
  theStoreSays: 'the words went out' | 'nothing carries these words'
  detail: string
}

/** One marker act two would write. */
export interface Marker {
  annotationId: string
  workspaceId: string
  /** When the old field was stamped. Never invented — see `whenItWasStamped`. */
  fixedAt: string
  /** Which witness said so. */
  from: 'the change log' | 'the revision ledger'
  because: string
}

/** A comment that needs a marker and that nothing in the corpus can date. Refuses act two. */
export interface Undatable {
  annotationId: string
  workspaceId: string
  word: string
}

export interface ActOneReport {
  /** True when no comment held a `state` key, so this run wrote nothing. */
  alreadyDone: boolean
  /** Every comment, deleted ones included. */
  annotations: number
  /** Comments that carried a word. */
  carriedAWord: number
  /** The word, and how many comments held it. Printed, because the plan's figure was stale. */
  distribution: Record<string, number>
  /** How many records lost the key. */
  recordsWritten: number
  /** Of those, how many are in the wastebasket. */
  deletedOnesWritten: number
  /** How many newest revisions were restamped, so no touched comment is left unwritable. */
  ledgerRestamped: number
  /** Comments whose word and whose dispatch store said the same thing. */
  theyAgreed: number
  /** Comments where the word said waiting and a message says the words went out. */
  theStoreOverrodeTheWord: Disagreement[]
  /** Comments whose word said gone and which a message accounts for. */
  goneAndAMessageSaysSo: string[]
  /** Comments whose word said gone and which an earlier marker accounts for. */
  goneAndAMarkerSaysSo: string[]
  /**
   * Every word this run removed, in full.
   *
   * IT IS IN THE REPORT SO THE CALLER CAN HAND IT TO ACT TWO. In window B the two acts are separated
   * by four other steps, and by then the database no longer holds the words. Act two also reads them
   * itself when it runs first, which is the order act one's refusal enforces whenever it matters.
   */
  theWords: StoredWord[]
  notes: SkipNote[]
}

export interface ActTwoReport {
  /**
   * TRUE WHEN THIS DATABASE HAS NO `annotation_words_fixed` TABLE, so there was nowhere to write.
   *
   * Window A creates that table, and until window B registered this act the only caller was a runner
   * pointed at a copy by hand — so a missing table was somebody running it against the wrong file
   * and the right answer was to THROW. `migrateInPlace` is a different caller: it is also run
   * against a database migrated part-way, by every test that applies a subset of the schema files,
   * and by any clone whose journal is behind. Throwing there would stop the whole run over a table
   * the next schema file creates.
   *
   * IT IS NOT A SILENT SKIP. The flag is on the report, `describeActTwo` says it in a sentence, and
   * `previewMigration` reports zero writes because zero is what it would write. Nothing is guessed
   * and nothing is quietly passed over.
   */
  tableMissing: boolean
  /** True when no comment needed a marker, so this run wrote nothing. */
  alreadyDone: boolean
  /** Comments whose word said their words went out. The population this act considers. */
  saidTheirWordsWentOut: number
  /** Markers written by this run. */
  markersWritten: number
  /** Markers that were already there from an earlier run, counted and not written again. */
  markersAlreadyThere: number
  /** Comments whose word said gone and which a message accounts for, so no marker is owed. */
  answeredByAMessage: string[]
  /** Comments where the store says the words went out and the record's word did not. */
  theStoreOverrodeTheWord: Disagreement[]
  /** Every marker this run wrote, with where its time came from. */
  markers: Marker[]
  notes: SkipNote[]
}

// ============================================================================ reading the database

/** As much of a record row as this file reads. */
interface RecordRow {
  id: string
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
  workspace_id: string
}

/** Whether a table is there at all. A fresh database, or one migrated part-way, may not have it. */
function tableIsThere(sqlite: Database.Database, name: string): boolean {
  return sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined
}

/** Whether a table has a column. Backups from before 18 August have no `from_annotation_id`. */
function columnIsThere(sqlite: Database.Database, table: string, column: string): boolean {
  if (!tableIsThere(sqlite, table)) return false
  return (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((one) => one.name === column)
}

/**
 * EVERY COMMENT'S STORED WORD, READ AND NOT WRITTEN. Deleted comments included.
 *
 * `json_valid` first, and not as tidiness: `json_extract` on a record whose `data` is not JSON
 * throws, and a comment like that is one this migration deliberately leaves alone rather than one it
 * falls over on.
 */
export function readTheStoredWords(sqlite: Database.Database): StoredWord[] {
  if (!tableIsThere(sqlite, 'records')) return []
  const rows = sqlite
    .prepare(
      "SELECT id, workspace_id, deleted_at, json_extract(data, '$.state') AS word FROM records " +
        "WHERE kind = 'annotation' AND json_valid(data) AND json_type(data, '$.state') IS NOT NULL " +
        'ORDER BY created_at, id',
    )
    .all() as { id: string; workspace_id: string; deleted_at: string | null; word: unknown }[]
  return rows.map((row) => {
    const word = typeof row.word === 'string' ? row.word : JSON.stringify(row.word)
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      word,
      deletedAt: row.deleted_at,
      saysGone: (THE_GONE_WORDS as readonly string[]).includes(word),
      nobodyKnowsThisWord: !THE_OLD_WORDS.includes(word),
    }
  })
}

/**
 * WHAT IS IN THE OLD SHAPE, ASKED OF THE DATABASE.
 *
 * Used twice: before act one, to compare against what the caller says it measured; and inside act
 * one's transaction as the closing check, where `carryingAWord` must be zero. Asking the database
 * rather than counting the plan is the point — "it is done" is then a measurement rather than the
 * absence of an error.
 */
export function countAnnotationState(sqlite: Database.Database): MeasuredWords {
  if (!tableIsThere(sqlite, 'records')) return { annotations: 0, carryingAWord: 0, sayingGone: 0 }
  const annotations = (
    sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'annotation'").get() as { n: number }
  ).n
  const words = readTheStoredWords(sqlite)
  return {
    annotations,
    carryingAWord: words.length,
    sayingGone: words.filter((one) => one.saysGone).length,
  }
}

/** What the dispatch store holds, asked of the database. */
export function countDispatch(sqlite: Database.Database): MeasuredDispatch {
  const markers = tableIsThere(sqlite, 'annotation_words_fixed')
    ? (sqlite.prepare('SELECT count(*) AS n FROM annotation_words_fixed').get() as { n: number }).n
    : 0
  // A MESSAGE THAT CARRIES SEVERAL COMMENTS OF A SENT REVIEW names them in `carries` (migration
  // 0185) and counts here as one message naming comments, like a message naming one.
  const naming = columnIsThere(sqlite, 'agent_messages', 'carries')
    ? '(from_annotation_id IS NOT NULL OR carries IS NOT NULL)'
    : 'from_annotation_id IS NOT NULL'
  const messagesGoneOut = columnIsThere(sqlite, 'agent_messages', 'from_annotation_id')
    ? (
        sqlite
          .prepare(`SELECT count(*) AS n FROM agent_messages WHERE ${naming} AND state <> 'queued'`)
          .get() as { n: number }
      ).n
    : 0
  return { markers, messagesGoneOut }
}

/**
 * HAVE THIS COMMENT'S WORDS GONE TO SOMEBODY? The two clauses of `hasGoneOut`, asked of the handle
 * this migration was given.
 *
 * The two clauses are returned apart rather than as one boolean, because the reports say WHICH of
 * them answered — a comment a message accounts for needs no marker, and a comment a marker accounts
 * for has already been through act two.
 *
 * See the header for why this is not an import of `src/server/lib/dispatch.ts`, and for the test
 * that holds the two together.
 */
export function goneOutIn(
  sqlite: Database.Database,
  annotationId: string,
  workspaceId: string,
): { byAMessage: boolean; byAMarker: boolean } {
  // THE PROJECT IS ASKED OF THE CONVERSATION, exactly as `dispatchOf` asks it. A message's project
  // is its thread's, and `hasGoneOut` is given the comment's project by every one of its callers, so
  // a predicate that skipped this join would answer true where the product answers false.
  // A MESSAGE CARRIES A COMMENT BY NAMING IT IN `from_annotation_id`, OR IN ITS `carries` LIST when
  // a sent review put several comments for one recipient into it (migration 0185). Both count, as
  // they do for `messagesCarrying` in lib/dispatch.ts.
  const inTheList = columnIsThere(sqlite, 'agent_messages', 'carries')
    ? " OR EXISTS (SELECT 1 FROM json_each(agent_messages.carries) c WHERE json_extract(c.value, '$.commentId') = ?)"
    : ''
  const byAMessage =
    columnIsThere(sqlite, 'agent_messages', 'from_annotation_id') && tableIsThere(sqlite, 'agent_threads')
      ? sqlite
          .prepare(
            'SELECT 1 FROM agent_messages JOIN agent_threads ON agent_threads.id = agent_messages.thread_id ' +
              `WHERE (agent_messages.from_annotation_id = ?${inTheList}) AND agent_messages.state <> 'queued' ` +
              'AND agent_threads.workspace_id = ? LIMIT 1',
          )
          .pluck()
          .get(...(inTheList === '' ? [annotationId] : [annotationId, annotationId]), workspaceId) !== undefined
      : false
  const byAMarker = tableIsThere(sqlite, 'annotation_words_fixed')
    ? sqlite.prepare('SELECT 1 FROM annotation_words_fixed WHERE annotation_id = ? LIMIT 1').pluck().get(annotationId) !==
      undefined
    : false
  return { byAMessage, byAMarker }
}

/**
 * WHEN THE OLD FIELD WAS STAMPED, or null because nothing recorded it.
 *
 * Two witnesses and no third. See the header: `updated_at` is not a witness, because it is when the
 * record was last written for any reason at all.
 */
export function whenItWasStamped(
  sqlite: Database.Database,
  annotationId: string,
): { at: string; from: 'the change log' | 'the revision ledger' } | null {
  if (tableIsThere(sqlite, 'changes')) {
    // THE NEWEST, because the word the record holds now is the last one that was written, and that
    // is the moment this row is about. A value stamped, walked back and stamped again has two rows
    // and the second one is the one that is still true.
    //
    // BOTH SPELLINGS OF THE VALUE. `logChange` stores a string raw, but a caller that handed it the
    // word inside an object would have stored it JSON-quoted, and a witness missed is a refusal
    // nobody needed.
    const row = sqlite
      .prepare(
        "SELECT at FROM changes WHERE record_id = ? AND field = 'data.state' AND new_value IN " +
          `(${THE_GONE_WORDS.map(() => '?').join(', ')}, ${THE_GONE_WORDS.map(() => '?').join(', ')}) ` +
          'ORDER BY at DESC, rowid DESC LIMIT 1',
      )
      .pluck()
      .get(annotationId, ...THE_GONE_WORDS, ...THE_GONE_WORDS.map((word) => JSON.stringify(word))) as string | undefined
    if (row !== undefined) return { at: row, from: 'the change log' }
  }
  if (tableIsThere(sqlite, 'revisions')) {
    const row = sqlite
      .prepare(
        "SELECT at FROM revisions WHERE record_id = ? AND json_valid(data) AND json_extract(data, '$.state') IN " +
          `(${THE_GONE_WORDS.map(() => '?').join(', ')}) ORDER BY seq DESC LIMIT 1`,
      )
      .pluck()
      .get(annotationId, ...THE_GONE_WORDS) as string | undefined
    if (row !== undefined) return { at: row, from: 'the revision ledger' }
  }
  return null
}

/**
 * `data` with `state` taken out and EVERY OTHER KEY IN THE ORDER IT WAS IN.
 *
 * The record's own key order is preserved because it is part of the content hash: rebuilding the
 * object in a different order would change the token on every comment for no reason, and every open
 * editor holding one would be refused as stale.
 */
function dataWithoutTheWord(data: string): string {
  const read = JSON.parse(data) as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(read)) {
    if (key === 'state') continue
    next[key] = value
  }
  return JSON.stringify(next)
}

// ============================================================================ act one

/** What act one would do, without doing any of it. The runner, the preview and the test read this. */
export function planActOne(sqlite: Database.Database): {
  removals: KeyRemoval[]
  words: StoredWord[]
  distribution: Record<string, number>
  /** Comments whose word says gone and whose fact nothing else holds. Any one of these refuses. */
  theFactIsNowhereElse: StoredWord[]
  /** Comments holding a word that is none of the three. Any one of these refuses. */
  aWordNothingKnows: StoredWord[]
  goneAndAMessageSaysSo: string[]
  goneAndAMarkerSaysSo: string[]
  theStoreOverrodeTheWord: Disagreement[]
  theyAgreed: number
  notes: SkipNote[]
} {
  const notes: SkipNote[] = []
  const empty = {
    removals: [],
    words: [],
    distribution: {},
    theFactIsNowhereElse: [],
    aWordNothingKnows: [],
    goneAndAMessageSaysSo: [],
    goneAndAMarkerSaysSo: [],
    theStoreOverrodeTheWord: [],
    theyAgreed: 0,
    notes,
  }
  if (!tableIsThere(sqlite, 'records')) return empty

  // EVERY COMMENT, deleted ones included, so a record whose `data` does not parse is named rather
  // than silently missing from a query that could not read it.
  const rows = sqlite
    .prepare("SELECT id, workspace_id, deleted_at, data FROM records WHERE kind = 'annotation' ORDER BY created_at, id")
    .all() as { id: string; workspace_id: string; deleted_at: string | null; data: string }[]

  const words = readTheStoredWords(sqlite)
  const wordOf = new Map(words.map((one) => [one.id, one]))
  const distribution: Record<string, number> = {}
  for (const one of words) distribution[one.word] = (distribution[one.word] ?? 0) + 1

  const removals: KeyRemoval[] = []
  const theFactIsNowhereElse: StoredWord[] = []
  const aWordNothingKnows: StoredWord[] = []
  const goneAndAMessageSaysSo: string[] = []
  const goneAndAMarkerSaysSo: string[] = []
  const theStoreOverrodeTheWord: Disagreement[] = []
  let theyAgreed = 0

  for (const row of rows) {
    let parsed: unknown
    try {
      parsed = JSON.parse(row.data)
    } catch {
      notes.push({
        kind: 'unreadable_data',
        recordId: row.id,
        detail: 'the stored JSON does not parse, so nothing here knows what it was meant to say',
      })
      continue
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue
    const held = wordOf.get(row.id)
    if (held === undefined) continue

    const store = goneOutIn(sqlite, row.id, row.workspace_id)
    if (held.nobodyKnowsThisWord) {
      // NOT READ AS ANYTHING. Reading an unknown word as "not gone" would be this migration deciding
      // what somebody's word meant.
      aWordNothingKnows.push(held)
      notes.push({
        kind: 'a_word_nothing_knows',
        recordId: row.id,
        detail:
          `it holds the word ${JSON.stringify(held.word)}, which is none of the three the field ever had. ` +
          'Nothing here knows whether that means its words went out.',
      })
      continue
    }
    if (held.saysGone) {
      if (store.byAMessage) {
        goneAndAMessageSaysSo.push(row.id)
        theyAgreed += 1
      } else if (store.byAMarker) {
        goneAndAMarkerSaysSo.push(row.id)
        theyAgreed += 1
      } else {
        // THE ONE CASE THAT REFUSES. Act two has not run for this comment and act one would delete
        // its only evidence.
        theFactIsNowhereElse.push(held)
        notes.push({
          kind: 'no_message_names_it',
          recordId: row.id,
          detail:
            `its word says ${JSON.stringify(held.word)} and no message carries its id and no marker was written ` +
            'for it. Run act two first — it needs nothing from act one — and this comment will get a marker.',
        })
        continue
      }
    } else if (store.byAMessage || store.byAMarker) {
      // THE OTHER DIRECTION. The word said waiting and the words went out. The store wins, nothing
      // is lost by deleting the word, and the disagreement is reported rather than dropped.
      theStoreOverrodeTheWord.push({
        recordId: row.id,
        workspaceId: row.workspace_id,
        word: held.word,
        theStoreSays: 'the words went out',
        detail: store.byAMessage
          ? 'a message carrying this comment has left `queued`, so the words went out and the stored word was ' +
            'wrong. The browser stamped that word after the send and its failure changed nothing, which is how ' +
            'it could be wrong. Nothing is lost by removing it: the message still says so.'
          : 'a marker written by an earlier run says these words went out, so the stored word was wrong. ' +
            'Nothing is lost by removing it: the marker still says so.',
      })
    } else {
      theyAgreed += 1
    }

    removals.push({
      recordId: row.id,
      workspaceId: row.workspace_id,
      deletedAt: row.deleted_at,
      word: held.word,
      saysGone: held.saysGone,
      data: dataWithoutTheWord(row.data),
    })
  }

  return {
    removals,
    words,
    distribution,
    theFactIsNowhereElse,
    aWordNothingKnows,
    goneAndAMessageSaysSo,
    goneAndAMarkerSaysSo,
    theStoreOverrodeTheWord,
    theyAgreed,
    notes,
  }
}

/**
 * ACT ONE. Every comment loses the word, every touched record's newest revision is restamped, or
 * nothing moves at all.
 *
 * @param measured what the caller says it counted. Re-measured here and compared before a single row
 *   is written; any difference refuses the whole run, naming both numbers.
 */
export function migrateAnnotationStateActOne(sqlite: Database.Database, measured: MeasuredWords): ActOneReport {
  const here = countAnnotationState(sqlite)
  const wrong: string[] = []
  if (here.annotations !== measured.annotations) {
    wrong.push(`you measured ${measured.annotations} comments; this database holds ${here.annotations}`)
  }
  if (here.carryingAWord !== measured.carryingAWord) {
    wrong.push(`you measured ${measured.carryingAWord} carrying a word; this database holds ${here.carryingAWord}`)
  }
  if (here.sayingGone !== measured.sayingGone) {
    wrong.push(`you measured ${measured.sayingGone} whose word says gone; this database holds ${here.sayingGone}`)
  }
  if (wrong.length > 0) {
    throw new Error(
      `This is not the corpus that was counted, so nothing was written.\n  ${wrong.join('\n  ')}\n` +
        'Re-run `npx tsx design/round-ten/migrations/run-annotation-state.mjs <this database>` with no --apply and ' +
        'hand the runner what it prints. A migration that runs against a corpus nobody counted is a broken ' +
        'assumption carried quietly.',
    )
  }

  const plan = planActOne(sqlite)

  if (plan.aWordNothingKnows.length > 0) {
    throw new Error(
      'Nothing was written, because this migration will not decide what an unknown word meant.\n' +
        plan.aWordNothingKnows
          .map((one) => `  comment ${one.id} in "${one.workspaceId}" holds ${JSON.stringify(one.word)}`)
          .join('\n') +
        `\nThe field only ever had three words: ${THE_OLD_WORDS.join(', ')}. Reading anything else as "its words ` +
        'have not gone out" would be a guess about somebody\'s comment, and the wrong guess makes a comment ' +
        'editable that should be fixed. Decide what these mean, write the word this migration knows, and run it ' +
        'again.',
    )
  }

  if (plan.theFactIsNowhereElse.length > 0) {
    throw new Error(
      'Nothing was written, because act one would destroy act two\'s only input.\n' +
        plan.theFactIsNowhereElse
          .map(
            (one) =>
              `  comment ${one.id} in "${one.workspaceId}" says ${JSON.stringify(one.word)}, and no message ` +
              'carries its id and no marker was written for it',
          )
          .join('\n') +
        '\nThese comments\' words went out and nothing but this field records it. Act one removes the field and ' +
        'restamps the one revision that held it, so after it there is nothing left for act two to read. Run act ' +
        'two first — `run-annotation-state.mjs <db> --act-two --apply` — and then run this again.',
    )
  }

  const report: ActOneReport = {
    alreadyDone: plan.removals.length === 0,
    annotations: here.annotations,
    carriedAWord: here.carryingAWord,
    distribution: plan.distribution,
    recordsWritten: 0,
    deletedOnesWritten: 0,
    ledgerRestamped: 0,
    theyAgreed: plan.theyAgreed,
    theStoreOverrodeTheWord: plan.theStoreOverrodeTheWord,
    goneAndAMessageSaysSo: plan.goneAndAMessageSaysSo,
    goneAndAMarkerSaysSo: plan.goneAndAMarkerSaysSo,
    theWords: plan.words,
    notes: plan.notes,
  }
  if (plan.removals.length === 0) return report

  const setData = sqlite.prepare('UPDATE records SET data = ? WHERE id = ?')
  const readRecord = sqlite.prepare(
    'SELECT id, kind, title, summary, data, deleted_at, workspace_id FROM records WHERE id = ?',
  )
  const newestRevision = sqlite.prepare('SELECT id, seq, note FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
  const restamp = sqlite.prepare('UPDATE revisions SET data = ?, content_hash = ?, note = ? WHERE id = ?')
  const ledgerIsThere = tableIsThere(sqlite, 'revisions')

  const run = sqlite.transaction(() => {
    // ---- CHECK 1, BEFORE ANY WRITE AND INSIDE THE TRANSACTION. No comment whose word says its
    // words went out loses that word until a message or a marker holds the same fact. The plan
    // already refused above; this asks the database again, so a corpus somebody wrote to between
    // planning and running cannot slip past.
    for (const removal of plan.removals) {
      if (!removal.saysGone) continue
      const store = goneOutIn(sqlite, removal.recordId, removal.workspaceId)
      if (store.byAMessage || store.byAMarker) continue
      throw new Error(
        `Check 1 failed and nothing was written. Comment ${removal.recordId} says ` +
          `${JSON.stringify(removal.word)} and nothing else in this database holds that fact. Run act two first.`,
      )
    }

    for (const removal of plan.removals) {
      setData.run(removal.data, removal.recordId)
      report.recordsWritten += 1
      if (removal.deletedAt !== null) report.deletedOnesWritten += 1
    }

    // ---- THE LEDGER, AFTER EVERY RECORD HAS MOVED, so the content it is stamped from is the final
    // one.
    if (ledgerIsThere) {
      for (const removal of plan.removals) {
        const row = readRecord.get(removal.recordId) as RecordRow | undefined
        if (row === undefined) {
          throw new Error(`Record ${removal.recordId} went between planning this migration and running it.`)
        }
        const newest = newestRevision.get(removal.recordId) as { id: string; seq: number; note: string | null } | undefined
        if (newest === undefined) continue
        const content = contentOf({
          kind: row.kind,
          title: row.title,
          summary: row.summary,
          data: JSON.parse(row.data) as Record<string, unknown>,
          deletedAt: row.deleted_at,
        })
        restamp.run(JSON.stringify(content.data), versionOf(content), newest.note ?? REVISION_NOTE, newest.id)
        report.ledgerRestamped += 1
      }
    }

    checkActOne(sqlite, plan.removals)
  })

  run()
  return report
}

/** Act one's remaining three checks, all thrown from inside the transaction. */
function checkActOne(sqlite: Database.Database, removals: readonly KeyRemoval[]): void {
  const readRecord = sqlite.prepare(
    'SELECT id, kind, title, summary, data, deleted_at, workspace_id FROM records WHERE id = ?',
  )

  // ---- CHECK 2. EVERY COMMENT'S `data` IS WHAT IT WAS, MINUS ONE KEY. Re-read from the row and
  // compared byte for byte, so a rewrite that reordered the keys or dropped a second one is caught
  // here rather than by a hash disagreement two floors away.
  for (const removal of removals) {
    const row = readRecord.get(removal.recordId) as RecordRow | undefined
    if (row === undefined) throw new Error(`Record ${removal.recordId} went while this migration was running.`)
    if (row.data !== removal.data) {
      throw new Error(
        `Check 2 failed and nothing was written. Comment ${removal.recordId} was meant to hold ${removal.data} and ` +
          'holds ' +
          row.data +
          '. Every key but `state` should be exactly where it was, in the order it was in, because that order is ' +
          'part of the content hash.',
      )
    }
  }

  // ---- CHECK 3. EVERY TOUCHED RECORD'S NEWEST REVISION NAMES WHAT THE RECORD NOW HOLDS. Re-read,
  // not assumed. Without it every one of these comments would refuse every write for ever.
  if (tableIsThere(sqlite, 'revisions')) {
    const newestHash = sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
    for (const removal of removals) {
      const row = readRecord.get(removal.recordId) as RecordRow | undefined
      if (row === undefined) continue
      const held = newestHash.get(removal.recordId) as { content_hash: string } | undefined
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
          `Check 3 failed and nothing was written. Comment ${removal.recordId}'s newest revision is stamped ` +
            `${held.content_hash} and the record now hashes to ${want}. Left as it was, every write to that ` +
            'comment would be refused as stale, for ever.',
        )
      }
    }
  }

  // ---- CHECK 4. NO COMMENT IS LEFT HOLDING THE WORD, asked of the DATABASE rather than counted off
  // the plan.
  const left = countAnnotationState(sqlite)
  if (left.carryingAWord !== 0) {
    throw new Error(
      `Check 4 failed and nothing was written. After the run this database still holds ${left.carryingAWord} ` +
        'comments carrying a `state` key. "It is done" has to be a measurement rather than the absence of an error.',
    )
  }
}

// ============================================================================ act two

/**
 * What act two would do, without doing any of it.
 *
 * @param words every comment's stored word. Read from the database by `readTheStoredWords` when act
 *   two runs first, or taken from act one's report when it runs second.
 */
export function planActTwo(
  sqlite: Database.Database,
  words: readonly StoredWord[],
): {
  markers: Marker[]
  alreadyMarked: string[]
  answeredByAMessage: string[]
  undatable: Undatable[]
  theStoreOverrodeTheWord: Disagreement[]
  notes: SkipNote[]
} {
  const markers: Marker[] = []
  const alreadyMarked: string[] = []
  const answeredByAMessage: string[] = []
  const undatable: Undatable[] = []
  const theStoreOverrodeTheWord: Disagreement[] = []
  const notes: SkipNote[] = []

  for (const one of words) {
    const store = goneOutIn(sqlite, one.id, one.workspaceId)
    if (!one.saysGone) {
      if (store.byAMessage) {
        theStoreOverrodeTheWord.push({
          recordId: one.id,
          workspaceId: one.workspaceId,
          word: one.word,
          theStoreSays: 'the words went out',
          detail:
            'a message carrying this comment has left `queued`. NO MARKER IS WRITTEN: the marker is only for a ' +
            'fact nothing else holds, and this one is held by the message. The disagreement is named because the ' +
            'stored word was wrong, not because anything has to be done about it.',
        })
      }
      if (one.nobodyKnowsThisWord) {
        notes.push({
          kind: 'a_word_nothing_knows',
          recordId: one.id,
          detail:
            `it holds the word ${JSON.stringify(one.word)}, which is none of the three the field ever had. Act ` +
            'two writes nothing for it and act one will refuse until somebody decides what it meant.',
        })
      }
      continue
    }
    // ITS WORD SAYS THE WORDS WENT OUT.
    if (store.byAMessage) {
      // NOTHING TO DO. A message carries the comment's id and has left `queued`, so the fact moved
      // stores intact and a marker would be a second copy of it.
      answeredByAMessage.push(one.id)
      continue
    }
    if (store.byAMarker) {
      alreadyMarked.push(one.id)
      continue
    }
    const when = whenItWasStamped(sqlite, one.id)
    if (when === null) {
      undatable.push({ annotationId: one.id, workspaceId: one.workspaceId, word: one.word })
      continue
    }
    markers.push({
      annotationId: one.id,
      workspaceId: one.workspaceId,
      fixedAt: when.at,
      from: when.from,
      because: THE_ONE_SENTENCE,
    })
  }

  // THE MESSAGES THAT NAME NO COMMENT, NAMED. The build plan asked for one marker per message with
  // `from_annotation_id` NULL, and there is no key to write such a row under. They are reported here
  // so that the plan's sentence is answered rather than ignored.
  if (columnIsThere(sqlite, 'agent_messages', 'from_annotation_id')) {
    const nameless = sqlite
      .prepare(
        'SELECT id, state, created_at FROM agent_messages WHERE from_annotation_id IS NULL' +
          (columnIsThere(sqlite, 'agent_messages', 'carries') ? ' AND carries IS NULL' : '') +
          ' ORDER BY created_at',
      )
      .all() as { id: string; state: string; created_at: string }[]
    for (const row of nameless) {
      notes.push({
        kind: 'a_message_names_nothing',
        recordId: row.id,
        detail:
          `message ${row.id} reads "${row.state}", was written ${row.created_at} and names no comment. A marker is ` +
          'keyed on a comment, so there is no row to write for it. Nothing is lost: the message is still there and ' +
          'still says what it says.',
      })
    }
  }

  return { markers, alreadyMarked, answeredByAMessage, undatable, theStoreOverrodeTheWord, notes }
}

/**
 * ACT TWO. Every comment whose words went out and whose fact nothing else holds gets one marker, or
 * nothing is written at all.
 *
 * @param words every comment's stored word — from `readTheStoredWords` when this runs first, or from
 *   act one's `theWords` when it runs second.
 * @param measured what the caller says it counted of the dispatch store. Re-measured here.
 */
export function migrateAnnotationStateActTwo(
  sqlite: Database.Database,
  words: readonly StoredWord[],
  measured: MeasuredDispatch,
): ActTwoReport {
  if (!tableIsThere(sqlite, 'annotation_words_fixed')) {
    // SAID RATHER THAN THROWN, since window B registered this act. See `tableMissing` above.
    return {
      tableMissing: true,
      alreadyDone: true,
      saidTheirWordsWentOut: 0,
      markersWritten: 0,
      markersAlreadyThere: 0,
      answeredByAMessage: [],
      theStoreOverrodeTheWord: [],
      markers: [],
      notes: [],
    }
  }

  const here = countDispatch(sqlite)
  const wrong: string[] = []
  if (here.markers !== measured.markers) {
    wrong.push(`you measured ${measured.markers} markers already written; this database holds ${here.markers}`)
  }
  if (here.messagesGoneOut !== measured.messagesGoneOut) {
    wrong.push(
      `you measured ${measured.messagesGoneOut} messages naming a comment and past queued; this database holds ` +
        `${here.messagesGoneOut}`,
    )
  }
  if (wrong.length > 0) {
    throw new Error(
      `This is not the corpus that was counted, so nothing was written.\n  ${wrong.join('\n  ')}\n` +
        'Re-run `npx tsx design/round-ten/migrations/run-annotation-state.mjs <this database>` with no --apply and ' +
        'hand the runner what it prints.',
    )
  }

  const plan = planActTwo(sqlite, words)

  if (plan.undatable.length > 0) {
    throw new Error(
      'Nothing was written, because this migration will not invent the moment a comment went out.\n' +
        plan.undatable
          .map(
            (one) =>
              `  comment ${one.annotationId} in "${one.workspaceId}" says ${JSON.stringify(one.word)}, and ` +
              '`annotation_words_fixed.fixed_at` has no witness for it',
          )
          .join('\n') +
        '\nTwo things could answer it: a `changes` row for that comment with field `data.state` and a new value of ' +
        `${THE_GONE_WORDS.join(' or ')}, or a revision of it whose stored data held one of those words. This ` +
        'database holds neither. `updated_at` is not an answer — it is when the record was last written for any ' +
        'reason. Say when these words went out, or leave the field on these comments and take it off the rest.',
    )
  }

  const report: ActTwoReport = {
    tableMissing: false,
    alreadyDone: plan.markers.length === 0,
    saidTheirWordsWentOut: words.filter((one) => one.saysGone).length,
    markersWritten: 0,
    markersAlreadyThere: plan.alreadyMarked.length,
    answeredByAMessage: plan.answeredByAMessage,
    theStoreOverrodeTheWord: plan.theStoreOverrodeTheWord,
    markers: plan.markers,
    notes: plan.notes,
  }
  if (plan.markers.length === 0) return report

  const before = new Set(
    (sqlite.prepare('SELECT annotation_id FROM annotation_words_fixed').pluck().all() as string[]),
  )
  const addMarker = sqlite.prepare(
    'INSERT INTO annotation_words_fixed (annotation_id, fixed_at, because) VALUES (?, ?, ?)',
  )

  const run = sqlite.transaction(() => {
    for (const marker of plan.markers) {
      addMarker.run(marker.annotationId, marker.fixedAt, marker.because)
      report.markersWritten += 1
    }
    checkActTwo(sqlite, plan.markers, before)
  })

  run()
  return report
}

/** Act two's three checks, all thrown from inside the transaction. */
function checkActTwo(sqlite: Database.Database, markers: readonly Marker[], before: ReadonlySet<string>): void {
  const readMarker = sqlite.prepare('SELECT annotation_id, fixed_at, because FROM annotation_words_fixed WHERE annotation_id = ?')

  // ---- CHECK 1. EVERY PLANNED MARKER IS THERE AND READS WHAT IT WAS MEANT TO READ. Re-read from
  // the table. A marker with the wrong sentence, or with a time nothing witnessed, is a claim about
  // somebody's comment that nothing can walk back — no route writes this table.
  for (const marker of markers) {
    const row = readMarker.get(marker.annotationId) as
      | { annotation_id: string; fixed_at: string; because: string }
      | undefined
    if (row === undefined) {
      throw new Error(
        `Check 1 failed and nothing was written. Comment ${marker.annotationId} was meant to get a marker and has ` +
          'none.',
      )
    }
    if (row.fixed_at !== marker.fixedAt || row.because !== THE_ONE_SENTENCE) {
      throw new Error(
        `Check 1 failed and nothing was written. The marker for ${marker.annotationId} reads ` +
          `${JSON.stringify(row.fixed_at)} / ${JSON.stringify(row.because)} and was meant to read ` +
          `${JSON.stringify(marker.fixedAt)} / ${JSON.stringify(THE_ONE_SENTENCE)}.`,
      )
    }
  }

  // ---- CHECK 2. NO MARKER WAS WRITTEN FOR A COMMENT THAT WAS NOT PLANNED ONE. THIS IS THE ONE THAT
  // MATTERS MOST. A marker fixes a comment's words: `hasGoneOut` answers true for ever after, so the
  // owner can no longer edit or delete that comment, and no route can take the row away. A loop that
  // wrote one row too many would silently freeze one of the owner's comments and every count in the report
  // would still look right.
  const now = sqlite.prepare('SELECT annotation_id FROM annotation_words_fixed').pluck().all() as string[]
  const meant = new Set([...before, ...markers.map((one) => one.annotationId)])
  const extra = now.filter((id) => !meant.has(id))
  if (extra.length > 0) {
    throw new Error(
      `Check 2 failed and nothing was written. ${extra.length} marker(s) were written for comments nothing planned ` +
        `one for: ${extra.join(', ')}. A marker fixes a comment's words for ever and no route can remove one.`,
    )
  }

  // ---- CHECK 3. EVERY MARKER THIS RUN WROTE NAMES A COMMENT THAT EXISTS. `annotation_words_fixed`
  // holds no project of its own: `SCOPED_THROUGH` says a row belongs to the project of the record it
  // names. A marker naming no record belongs to no project, and would print, over somebody's own
  // comments, the sentence that says a plan belongs to nobody.
  const isAComment = sqlite.prepare("SELECT 1 FROM records WHERE id = ? AND kind = 'annotation'").pluck()
  for (const marker of markers) {
    if (isAComment.get(marker.annotationId) !== undefined) continue
    throw new Error(
      `Check 3 failed and nothing was written. The marker for ${marker.annotationId} names no comment in this ` +
        'database, so nothing could say which project it belongs to.',
    )
  }
}

// ============================================================================ the reports, in words

/** Act one's report as a person reads it. Every number the transaction produced, and nothing invented. */
export function describeActOne(report: ActOneReport): string {
  if (report.alreadyDone) {
    const why =
      report.notes.length === 0
        ? 'no comment holds a `state` key.'
        : `no comment holds a \`state\` key; ${report.notes.length} were left as they are.`
    return `comment state: Nothing to do: ${why} Nothing was written.`
  }
  const words = Object.entries(report.distribution)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([word, n]) => `${word} ${n}`)
    .join(', ')
  const lines = [
    `comment state: ${report.annotations} comment(s) read, ${report.carriedAWord} of them carrying a word: ${words}.`,
    `${report.recordsWritten} lost the key, ${report.deletedOnesWritten} of them in the wastebasket.`,
    `${report.ledgerRestamped} newest revisions restamped, so no touched comment is left unwritable.`,
    `${report.theyAgreed} comment(s) had a word that said the same as the messages carrying their words.`,
  ]
  if (report.goneAndAMessageSaysSo.length > 0) {
    lines.push(
      `  ${report.goneAndAMessageSaysSo.length} said their words had gone out and a message says so too: ` +
        `${report.goneAndAMessageSaysSo.join(', ')}.`,
    )
  }
  if (report.goneAndAMarkerSaysSo.length > 0) {
    lines.push(
      `  ${report.goneAndAMarkerSaysSo.length} said their words had gone out and act two's marker says so: ` +
        `${report.goneAndAMarkerSaysSo.join(', ')}.`,
    )
  }
  for (const one of report.theStoreOverrodeTheWord) {
    lines.push(
      `  THE WORD WAS WRONG AND IS REMOVED — ${one.recordId} in "${one.workspaceId}" stored ` +
        `${JSON.stringify(one.word)}. ${one.detail}`,
    )
  }
  for (const note of report.notes) lines.push(`  LEFT AS IT IS — ${note.recordId}: ${note.detail}`)
  return lines.join('\n')
}

/** Act two's report as a person reads it. */
export function describeActTwo(report: ActTwoReport): string {
  const lines: string[] = []
  if (report.tableMissing) {
    return (
      'comment markers: this database has no `annotation_words_fixed` table, so NOTHING was written and nothing ' +
      'was skipped over — there was nowhere to write. Window A creates that table; point the command at the whole ' +
      'drizzle/ folder.'
    )
  }
  if (report.alreadyDone) {
    lines.push(
      `comment markers: Nothing to do: ${report.saidTheirWordsWentOut} comment(s) say their words went out, and none of them needs ` +
        `a marker — ${report.answeredByAMessage.length} are answered by a message and ` +
        `${report.markersAlreadyThere} already have one. Nothing was written.`,
    )
  } else {
    lines.push(
      `comment markers: ${report.markersWritten} marker(s) written, for comments whose words went out before Mole Office recorded which ` +
        'conversation carried them.',
    )
    for (const marker of report.markers) {
      lines.push(
        `  ${marker.annotationId} in "${marker.workspaceId}" — fixed at ${marker.fixedAt}, taken from ` +
          `${marker.from}.`,
      )
    }
    lines.push(
      `  ${report.answeredByAMessage.length} needed none because a message names them; ` +
        `${report.markersAlreadyThere} already had one from an earlier run.`,
    )
    lines.push(`  Every marker reads: "${THE_ONE_SENTENCE}"`)
  }
  for (const one of report.theStoreOverrodeTheWord) {
    lines.push(
      `  THE WORD DISAGREED WITH THE MESSAGES — ${one.recordId} in "${one.workspaceId}" stored ` +
        `${JSON.stringify(one.word)}. ${one.detail}`,
    )
  }
  for (const note of report.notes) lines.push(`  NAMED, NOT WRITTEN — ${note.recordId}: ${note.detail}`)
  return lines.join('\n')
}
