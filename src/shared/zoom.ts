// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHORTER FORMS OF ONE PIECE OF WRITING, DECLARED ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * A report is long. A row in a list has room for four words. Between those two there are other
 * useful lengths, and today every screen that needs one cuts the long form with an ellipsis
 * and hopes. A cut is not a shorter form. It is the same words with the end missing, so the one
 * sentence worth keeping is usually the one thrown away.
 *
 * So three WHOLE-RECORD lengths are named here, each with a job and a word budget:
 *
 *     label      2 to 5 words        enough to tell it apart from the things beside it
 *     title      up to 15 words      what this is, or what happened
 *     gist       20 to 60 words      the useful conclusion, in one paragraph
 *
 * ONLY THE LABEL IS STORED UNDER `data.shortForms`. Since 3 September 2026 the title IS the
 * record's own `title` column and the conclusion IS its own `summary` column, so those two budgets
 * are targets for whoever writes the record and nothing refuses a column for its length. See
 * `STORED_SHORT_FORM_LEVELS` and `RETIRED_SHORT_FORM_KEYS` below.
 *
 * And three more lengths that are written BY PART rather than as one text — `outline`, `sketch` and
 * `digest`. Those three share one stored structure: for each part of the report a heading, a
 * 30-word text, a 120-word text, and the list of the report's blocks that part covers. They are
 * declared below, under *the three lengths written by part*.
 *
 * And a seventh thing that is none of them: FULL, the canonical content. Full is the only thing
 * anybody authors. The six above are derived from it, and none of them may be made by cutting it.
 *
 * THIS LADDER WAS SETTLED ON THE EVENING OF 2 SEPTEMBER 2026, in the review kept whole in
 * `design/pointing-reopened/OWNER-REVIEW-3-2026-09-02.md`. Level 3 was widened from 30 words to 40.
 * Levels 4 to 6 became by-part: from level 4 the summary may be structured by the report's parts. The
 * per-part budgets are level 5 at most what level 3 allows, and level 6 at most 120 words.
 *
 * THE THREE LENGTHS RETIRED THE SAME EVENING are `card`, `brief` and `account`, and `title` and
 * `gist` joined them the next day when levels 2 and 3 became the record's own columns. What is
 * stored under those five keys stays on disk, nothing draws it, and a new write to one is refused.
 * See `RETIRED_SHORT_FORM_KEYS` below.
 *
 * ---------------------------------------------------------------------------------------
 * THE READING LADDER HAS SEVEN POSITIONS AND LIVES NEXT DOOR, IN ./detail.ts
 * ---------------------------------------------------------------------------------------
 *
 * A surface deciding how much to say walks all seven — the three whole-record lengths here, the
 * three by-part lengths here, and FULL. That ladder is built in `./detail.ts` from both lists, and
 * `detailOf` there is what a screen calls.
 *
 * `SHORT_FORM_LEVELS` LEAVES FULL OUT, AND THAT IS NOT AN OVERSIGHT. This list is what somebody can
 * WRITE and Mole Office can STORE: `./kinds.ts` turns it into schema fields and `src/server/api/zoom.ts`
 * turns it into the set of lengths a POST accepts. Adding FULL to it would declare a storable
 * `shortForms.full` on every body kind and let an agent write a copy of a record's body beside that
 * record's body. `tests/detail-resolver.test.ts` fails if anybody does.
 *
 * ---------------------------------------------------------------------------------------
 * HOW MUCH OF THAT RULE MOLE OFFICE CAN ACTUALLY CHECK, SAID PLAINLY
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office CANNOT tell a short form somebody wrote from a cut somebody tidied up. Nothing in this
 * product reads for meaning, so the only trace a cut leaves is that its words are the opening words
 * of what it was cut from, and an editor who changes one of those words leaves no trace at all.
 *
 * SO THIS IS WHAT IS CHECKED, AND IT IS SMALLER THAN THE RULE. A form whose words are the opening
 * words of a longer form, or of the record's own prose, is refused. So is one ending in an ellipsis.
 * That catches the cut nobody edited — `full.slice(0, 60)`, the drag of a mouse, the first sentence
 * copied across — which is how a cut is actually made here.
 *
 * IT USED TO BE ONE CHARACTER WEAKER THAN THAT, AND THAT IS WHY THIS PARAGRAPH EXISTS. The
 * comparison was a prefix test on the whole flattened string, so appending a full stop to a
 * twenty-four word cut made it pass: a mid-sentence truncation of a deliberately misleading opening
 * was stored as a gist and read back as current, on 19 August 2026. The comparison is now over
 * WORDS with the punctuation at each end of a word taken off, so a full stop, a comma or a closing
 * quote no longer answers the question. A changed word still does, and this file says so rather
 * than leaving a reader to assume the rule is enforced.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE FILE IS CALLED zoom.ts AND NOTHING IN IT SAYS ZOOM
 * ---------------------------------------------------------------------------------------
 *
 * The campaign calls this Semantic Zoom, and that is the name of the idea in design/ROUND-EIGHT.md.
 * It is not what a person reads. On screen these are short forms of a piece of writing, so that is
 * what everything exported here is called. The file keeps the campaign's name so that somebody
 * looking for the phase finds it.
 *
 * ---------------------------------------------------------------------------------------
 * TWO KINDS OF SHORT FORM, ONE VOCABULARY
 * ---------------------------------------------------------------------------------------
 *
 * WRITTEN AND STORED. Somebody wrote a report and wrote its six short forms beside it. They are
 * stored in the record, they name the revision they were made from, and they go out of date when
 * the report moves. src/server/lib/zoom.ts reads those and works out which of them still hold.
 *
 * WORKED OUT EVERY TIME. Mole Office also says things about its own reasoning — why a run is a likely
 * recipient, why a row is on the attention list, what a card on a drawing carries. Those are
 * computed on every read, so they can never be out of date and they store nothing. What they need
 * from this file is the same six names and the same budgets, so that a label on one screen is the
 * same length as a label on another.
 *
 * Two systems in this product already hold a short and a long form of one fact — the detail levels
 * of a card on a drawing (src/web/components/graph/card.ts) and the closed and open forms of a row
 * on the attention list. Neither is replaced by this. This is the vocabulary they should be spoken
 * in, and the reason there is no seventh shape.
 *
 * ---------------------------------------------------------------------------------------
 * THIS FILE MUST NOT REACH THE DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * It runs in the browser as well as on the server, exactly as src/shared/kinds.ts does. It knows
 * what the six lengths are and whether a piece of text fits one. It knows nothing about whether a
 * stored short form is still current, because that needs the revision ledger, and that question is
 * answered in src/server/lib/zoom.ts.
 */

import type { Revision } from './targets.ts'
import type { DetailSource, Rung } from './detail.ts'

// ============================================================================ the declaration

/**
 * THE KEY A RECORD'S SHORT FORMS ARE STORED UNDER, spelled once.
 *
 * src/shared/kinds.ts declares the field with this name, src/server/lib/summary.ts reads it while
 * checking a write, and src/server/lib/zoom.ts has to know which field path to leave OUT of the
 * comparison that decides whether a short form has gone out of date. Three readers of one key, and
 * a fourth spelling of it would be a short form that is out of date the instant it is written.
 */
export const SHORT_FORMS_FIELD = 'shortForms'

/**
 * How many characters a word is allowed to average before a budget stops trusting the word count.
 *
 * A WORD COUNT ALONE CANNOT JUDGE EVERY SCRIPT. Words are counted by splitting on spaces, and
 * Chinese and Japanese are written without them, so a whole paragraph of Chinese counts as one
 * word and would pass a five-word budget. That is not hypothetical in this product: the card
 * shortener in src/web/components/graph/card.ts already carries a note about a script with no
 * spaces.
 *
 * So every budget has two ends measured two ways, and both are reported when they are broken.
 * Twelve is deliberately generous — an English word plus its space averages about six characters —
 * because this number is here to catch a paragraph in a label slot, not to argue about prose.
 */
export const CHARACTERS_PER_WORD = 12

/**
 * One of the three WHOLE-RECORD lengths, each stored as one text.
 *
 * The three by-part lengths are `ByPartLevel` below and are not one of these: they are not stored as
 * a text at all. Full is not one of them either — Full is what they are all made from.
 */
export type ShortFormLevel = 'label' | 'title' | 'gist'

/** Everything there is to know about one of the six lengths. Plain data: safe to serve as JSON. */
export interface ShortFormSpec {
  level: ShortFormLevel
  /** What one of these is called in a sentence a person reads. Lower case, no metaphors. */
  noun: string
  /**
   * THE WORD THAT GOES IN FRONT OF THE NOUN: `a` or `an`. Declared, never worked out.
   *
   * Every refusal this file writes says "a gist", "a short description", "an account". Choosing
   * between the two by looking at the first letter is right for these six words and wrong for
   * English — *an hour*, *a university* — so the answer is written down beside the noun it belongs
   * to, and a seventh length cannot be added without somebody saying which of the two it takes.
   */
  article: 'a' | 'an'
  /** What this length is FOR, in one sentence. The job, not the size. */
  what: string
  /** The fewest words this length is written in. */
  minWords: number
  /** The most. */
  maxWords: number
  /** A real one, and short enough to read in a refusal message. */
  example: string
}

/**
 * THE THREE WHOLE-RECORD LENGTHS, SHORTEST FIRST.
 *
 * THEY ARE JOBS, NOT SIZES. Two of them overlap in length on purpose: a title may be shorter than a
 * label. What separates them is what they are for. A label tells one thing apart from its
 * neighbours, so it may be a fragment; a title says what happened, so it is usually a sentence.
 *
 * NOTHING HERE SAYS HOW TO PRODUCE ONE, and that is deliberate. Mole Office has no summariser. Whoever
 * writes the record writes these, and when nobody has written one the answer is that there is none.
 *
 * ---------------------------------------------------------------------------------------
 * ONLY THE FIRST OF THE THREE IS STORED UNDER `data.shortForms` NOW
 * ---------------------------------------------------------------------------------------
 *
 * Since 3 September 2026 a title aims at 15 words at most and a summary at 20 to 60, the reports
 * filed before then stay as they are, and a level a report lacks is said not to exist. Level 2 IS
 * the record's own `title` column and level 3 IS its `summary` column. There is no separate title
 * form and no separate gist any more: `STORED_SHORT_FORM_LEVELS` below is what can be written, and
 * `RETIRED_SHORT_FORM_KEYS` holds the two that left. Criterion A14b of
 * design/pointing-reopened/ACCEPTANCE.md.
 *
 * THE TWO BUDGETS BELOW ARE TARGETS AND NOTHING REFUSES A COLUMN FOR ITS LENGTH. They say what a
 * writer is aiming at, `GET /api/kinds/report` states them, and a title of eighteen words or a
 * summary of sixty-five is stored exactly as it was typed. Going over
 * by a little does not matter. The door still refuses an over-budget LABEL,
 * because a label is still a form somebody writes into `data.shortForms`.
 */
const SPECS = [
  {
    level: 'label',
    noun: 'label',
    article: 'a',
    what: 'Enough to tell this apart from the things listed beside it. A name, not a sentence.',
    minWords: 2,
    maxWords: 5,
    example: 'Clamp mount load test',
  },
  {
    level: 'title',
    noun: 'title',
    article: 'a',
    what: "The record's own title: what this is, or what happened, in one line.",
    // AT MOST 15 WORDS AND IT WAS 10 UNTIL 3 SEPTEMBER 2026, when this length became the record's
    // own title column. The number is a target rather
    // than a rule: nothing refuses a title for its length.
    minWords: 1,
    maxWords: 15,
    example: 'The printed clamp mount cracked under load',
  },
  {
    level: 'gist',
    noun: 'conclusion',
    article: 'a',
    what: "The record's own summary: the useful conclusion, in one paragraph.",
    // 20 TO 60 WORDS. It was 20 to 30, then 20 to 40 from 2 September 2026, and 20 to 60 from
    // 3 September, when this length became the record's own summary column. It is a target and
    // nothing refuses a summary for its length.
    //
    // THE NOUN IS `conclusion` AND THE KEY IS STILL `gist`. The key is what the ladder has always
    // called this position and changing it would rename a rung the control, the settings grid and
    // every stored reading choice already name. The noun is what a person reads, and the control
    // has said *Conclusion* here since 2 September 2026 — so the composer, the refusals and the
    // control now say one word instead of two.
    minWords: 20,
    maxWords: 60,
    example:
      'The printed clamp mount cracks at about fifteen newtons, under the twenty the transplant trials ' +
      'need, so the aluminium version is now the only one worth testing.',
  },
] as const satisfies readonly ShortFormSpec[]

/** The three, shortest first, so every list built from them reads the same way twice. */
export const SHORT_FORM_LEVELS = SPECS.map((s) => s.level) as readonly ShortFormLevel[]

/** The declaration, readable as data and safe to serve over HTTP. */
export const SHORT_FORM_SPECS: Readonly<Record<ShortFormLevel, ShortFormSpec>> = Object.fromEntries(
  SPECS.map((s) => [s.level, s]),
) as Record<ShortFormLevel, ShortFormSpec>

/** The spec for one length, by its own word. */
export function shortFormSpec(level: ShortFormLevel): ShortFormSpec {
  return SHORT_FORM_SPECS[level]
}

/** True when this word is one of the three whole-record lengths. */
export function isShortFormLevel(word: string): word is ShortFormLevel {
  return Object.prototype.hasOwnProperty.call(SHORT_FORM_SPECS, word)
}

/**
 * THE WHOLE-RECORD LENGTHS THAT ARE STORED UNDER `data.shortForms`. ONE, SINCE 3 SEPTEMBER 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SECOND LIST AND NOT A SHORTER `SHORT_FORM_LEVELS`
 * ---------------------------------------------------------------------------------------
 *
 * They answer two different questions and they used to have one answer.
 *
 *   `SHORT_FORM_LEVELS`         which POSITIONS on the reading ladder are whole-record lengths.
 *                               Three: label, title and the conclusion. `RUNGS` in ./detail.ts is
 *                               built from it, so shortening it would take two rungs off the
 *                               ladder — and the owner kept all seven.
 *   `STORED_SHORT_FORM_LEVELS`  which of those a writer can WRITE into `data.shortForms` and Mole
 *                               Office can store. One: the label. ./kinds.ts turns this into schema
 *                               fields and src/server/api/zoom.ts turns it into the set of keys a
 *                               POST accepts.
 *
 * Level 2 is the record's own `title` column and level 3 its `summary` column, so neither is a form
 * anybody writes beside the record. What is already stored under those two keys stays on disk,
 * nothing draws it, and a NEW write to either is refused — they are in `RETIRED_SHORT_FORM_KEYS`
 * below with the three lengths that were retired the day before. Criterion A14b.
 */
export const STORED_SHORT_FORM_LEVELS = ['label'] as const satisfies readonly ShortFormLevel[]

// ==================================================== the three lengths written by part

/**
 * THE THREE LENGTHS THAT ARE WRITTEN BY PART, AND THE ONE STRUCTURE ALL THREE READ.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THEY ARE
 * ---------------------------------------------------------------------------------------
 *
 * Levels 1 to 3 are one text about the whole record. Levels 4, 5 and 6 are not. They are a list of
 * PARTS, and each part carries three pieces of writing and the list of blocks it covers:
 *
 *     heading    at most 10 words     the part's one-sentence summary. Level 4 draws these alone.
 *     text30     at most 30 words     the part in a sentence or two. Level 5 draws it under the heading.
 *     text120    at most 120 words    the part at length. Level 6 draws it under the heading.
 *
 * THE HEADING IS THE SAME SENTENCE AT ALL THREE LEVELS, and that is the point of one structure
 * rather than three: a part at one level maps to the same part at the next.
 * Three separately written texts could not promise that.
 *
 * WHAT A PART IS: a headed section where the report has headings, and a group of paragraphs where it
 * has none. THE WRITER DECIDES, and records which blocks the part covers, which is `covers` below.
 * Nothing here derives a part from the report, because a derived part presented as an authored
 * summary is what this whole file exists to prevent.
 */
export const BY_PART_LEVELS = ['outline', 'sketch', 'digest'] as const

/** One of the three lengths written by part. */
export type ByPartLevel = (typeof BY_PART_LEVELS)[number]

/** The three pieces of writing every part carries. */
export type PartText = 'heading' | 'text30' | 'text120'

/**
 * A WORD BUDGET AND THE WORDS THAT DESCRIBE IT — everything `budgetAgainst` needs to refuse a text.
 *
 * It is `ShortFormSpec` without the `level` key, so the whole-record lengths and the three texts of
 * a part are judged by ONE function against ONE shape rather than by two copies of one rule.
 */
export type WordBudget = Omit<ShortFormSpec, 'level'>

/** The budget and the job of each of a part's three texts. */
export const PART_TEXT_SPECS: Readonly<Record<PartText, WordBudget>> = {
  heading: {
    noun: "part's heading",
    article: 'a',
    what: "This part of the report summarised in one sentence. It is the same sentence at levels 4, 5 and 6.",
    minWords: 1,
    maxWords: 10,
    example: 'The printed mount fails below the load the trials need',
  },
  text30: {
    noun: "part's short text",
    article: 'a',
    what: 'What this part of the report says, in a sentence or two. Drawn under the heading at level 5.',
    minWords: 1,
    maxWords: 30,
    example:
      'Three of four printed mounts broke between 14 and 16 newtons, below the twenty the transplant trials ' +
      'need, so the printed part is out.',
  },
  text120: {
    noun: "part's long text",
    article: 'a',
    what: 'What this part of the report says, at length. Drawn under the heading at level 6.',
    minWords: 1,
    maxWords: 120,
    example:
      'Four printed clamp mounts were pulled to failure on the bench jig. Three broke at the thin section ' +
      'behind the bolt circle, at 14.2, 15.1 and 15.4 newtons, and the transplant trials need twenty, so the ' +
      'printed part cannot be used for them. The fourth held to 22 newtons and had been printed at half the ' +
      'layer height, which was a mistake in the print queue rather than a decision, and nobody has repeated ' +
      'it. One sample is not a finding. An aluminium mount of the same geometry has been ordered.',
  },
}

/** The three, in the order a part is written. */
export const PART_TEXTS = ['heading', 'text30', 'text120'] as const satisfies readonly PartText[]

/**
 * WHICH OF A PART'S TEXTS EACH BY-PART LEVEL DRAWS UNDER THE HEADING, and null at level 4, which
 * draws the heading alone.
 *
 * ONE TABLE, READ BY THE PAGE AND BY THE LADDER. `src/shared/detail.ts` builds the rung out of this
 * and `src/shared/reportrungs.ts` draws from it, so what a level draws and what a level is called
 * cannot come apart.
 */
export const TEXT_DRAWN_AT: Readonly<Record<ByPartLevel, PartText | null>> = {
  outline: null,
  sketch: 'text30',
  digest: 'text120',
}

/** True when this word names one of the three by-part lengths. */
export function isByPartLevel(word: string): word is ByPartLevel {
  return (BY_PART_LEVELS as readonly string[]).includes(word)
}

/**
 * THE KEY THE BY-PART STRUCTURE IS STORED UNDER, inside `data.shortForms`, spelled once.
 *
 * It sits beside `label`, `title` and `gist` rather than under a field of its own, because it is
 * one more thing somebody writes about this record at a reading length, and because the write door,
 * the revision stamp and the writer's name are already worked out for everything under that key.
 */
export const PARTS_KEY = 'parts'

/**
 * THE FIVE KEYS UNDER `data.shortForms` THAT ARE RETIRED, kept here by name and nowhere else.
 *
 * THREE WENT ON 2 SEPTEMBER 2026 — `card`, `brief` and `account` — when levels 4, 5 and 6 became
 * the by-part structure. TWO MORE WENT ON 3 SEPTEMBER — `title` and `gist` — when levels 2 and 3
 * became the record's own `title` and `summary` columns. Criterion A14b of
 * design/pointing-reopened/ACCEPTANCE.md: the reports that are already filed stay exactly where
 * they are.
 *
 * WHY THEY ARE NAMED AT ALL RATHER THAN DELETED. Records in this corpus hold text under these keys.
 * Deleting the names would leave those records unable to be written to at all — every key a kind
 * does not declare is refused by `validateRecordData`, so a record holding a `card` could never be
 * patched again — and it would delete somebody's writing from the schema without deleting it from
 * the disk. So: what is stored stays, nothing on any screen draws it, and the write door refuses a
 * NEW write to one of these keys. `settleShortForms` in src/server/lib/zoom.ts is that door.
 *
 * NEW MEANS WORDS NO VERSION OF THE RECORD EVER HELD. Putting a version back is a patch of the whole
 * of `data`, so a version that carried a `card` comes through this door carrying it. Reading that as
 * a new write made every version of every report in this project unreachable through the put-back
 * button — problem `MBqNmPWlSeQs`, measured 3 September 2026 — so the door asks the revision ledger
 * instead, and history coming back is not a write.
 *
 * The ruling is in `design/pointing-reopened/OWNER-REVIEW-3-2026-09-02.md`: levels 4 to 6
 * are written by part now, so the three whole-text lengths that used to sit there have no seat.
 * Levels 2 and 3 are the record's own columns, so the two whole-text lengths that used to sit
 * THERE have no seat either.
 */
export const RETIRED_SHORT_FORM_KEYS = ['title', 'gist', 'card', 'brief', 'account'] as const

/** True when this word names one of the three retired keys. */
export function isRetiredShortFormKey(word: string): boolean {
  return (RETIRED_SHORT_FORM_KEYS as readonly string[]).includes(word)
}

/** The most characters a length may run to, from its word budget and nothing else. */
export function maxCharacters(level: ShortFormLevel): number {
  return SHORT_FORM_SPECS[level].maxWords * CHARACTERS_PER_WORD
}

/** A set of short forms, by length. Any of them may be missing, and usually most of them are. */
export type ShortFormTexts = Partial<Record<ShortFormLevel, string>>

// ============================================================================ what is stored

/**
 * Who wrote a short form. There is no "system": Mole Office writes none of these itself.
 *
 * IT IS DERIVED FROM WHO ASKED, NEVER DECLARED BY THEM. The write route reads the actor headers,
 * the same three every other write path in this product reads, and stores what they say. It used to
 * be a field of the request body, which meant an agent could file its own words as a person's
 * override by typing the word `human` — so the mark was evidence of nothing in either direction.
 * `src/server/lib/zoom.ts` is where the derivation is made, once.
 */
export type ShortFormAuthor = 'agent' | 'human'

/**
 * ONE STORED SHORT FORM, as it sits inside a record's `data`.
 *
 * `madeFrom` is the SAME `Revision` shape a comment carries to say which version it was written
 * against, reused rather than declared again. It means the same thing in both places — which entry
 * of that record's ledger — so a second shape would be one fact with two spellings.
 */
export interface StoredShortForm {
  text: string
  madeFrom: Revision
  writtenBy: ShortFormAuthor
  /**
   * WHO WROTE THESE WORDS, by the registry id of the agent or person whose request stored them. Where
   * no registry row is found, as for the office's own writer, it is the actor id on the request. A
   * form stored before the writer was stored by id holds the actor id too, which may be a handle.
   *
   * IT IS THE NAME, WHERE `writtenBy` ABOVE IS THE KIND. `writtenBy` says whether a person or an
   * agent wrote it, which is what decides whether the form is an override. This says WHICH person
   * or which agent, because a form records who produced it.
   * Neither is derivable from the other and both are the server's record of the write.
   *
   * IT IS NOT A FIELD A WRITER FILLS IN. Both write doors overwrite it with the writer the request
   * headers name, for the reason `shortFormAuthor` gives about `writtenBy`: who did a thing is
   * Mole Office's record of the write, never a claim the writer makes about itself.
   *
   * ABSENT ON EVERY FORM STORED BEFORE 2 SEPTEMBER 2026, and absent when a request stated no actor
   * at all — the identity is then defaulted, and filing the default as the writer would put a
   * person's name on words nobody said they wrote. A reader that finds it absent says nobody
   * recorded it and never fills it in.
   */
  by?: string
  /**
   * WHEN THESE WORDS WERE STORED, as local wall-clock time: `2026-09-02 10:14:03`.
   *
   * WRITTEN WITH THE ONE WRITER, `nowStamp` in src/shared/time.ts, never as UTC. A day has to mean
   * the operator's day, and a stamp with a `Z` on it once made a fifty-minute silence read as
   * "just now" in this product.
   *
   * IT IS NOT `madeFrom`. That names the revision of the record somebody READ; this is when the
   * words were WRITTEN DOWN. A form written this morning from a revision filed last week has both,
   * and they are a week apart.
   *
   * ABSENT ON EVERY FORM STORED BEFORE 2 SEPTEMBER 2026, and never filled in from the record's own
   * `updatedAt`, which is the time of the last write of any kind.
   */
  at?: string
  /**
   * THE RUN THAT WROTE THESE WORDS, as the id of its session record.
   *
   * IT IS A RECORD ID AND NOTHING ELSE, so a page can link to it without asking anything first. The
   * write door reads `x-mole-office-session`, which may be a session record's id OR a run name, and
   * resolves it the way the revision ledger does. Where the reference names no session record of
   * this project, nothing is stored: a run name in this field would be a link to nowhere.
   *
   * WHY IT IS HERE WHEN THE LEDGER ALREADY HAS IT. Every write is in the revision ledger with its
   * actor and its session, and that is the record of the write. This is the same fact stamped where
   * the form is, so the composer can name the run in one read instead of searching the ledger. The
   * ledger stays the authority: if the two ever disagree, the ledger is right.
   *
   * ABSENT ON EVERY FORM STORED BEFORE 3 SEPTEMBER 2026, and absent where the request named no
   * session. A reader that finds it absent says nothing about the run rather than filling one in,
   * and nothing migrates the old rows — the next write of a form stamps it.
   */
  session?: string
  /**
   * WHICH PARTS OF THE RECORD THESE WORDS STAND FOR, by region id, or absent because nobody
   * recorded them.
   *
   * ---------------------------------------------------------------------------------------
   * IT IS NOT `madeFrom` AND THE TWO ARE NOT INTERCHANGEABLE
   * ---------------------------------------------------------------------------------------
   *
   * `madeFrom` says WHICH REVISION somebody read when they wrote these words — a fact about time.
   * This says WHICH PARTS OF THE REPORT the words stand in place of — a fact about the document.
   * Criterion 18 of design/problem-03/ACCEPTANCE.md asks for the second, and until 1 September 2026
   * the product carried only the first and the panel drew neither.
   *
   * ---------------------------------------------------------------------------------------
   * ABSENT MEANS NOBODY RECORDED IT, AND THAT IS SAID OUT LOUD RATHER THAN FILLED IN
   * ---------------------------------------------------------------------------------------
   *
   * Every short form in the corpus is in this state and every one of them is a COMPLETE report: a
   * form whose sources nobody wrote down is not a defective form, it is a form that cannot say
   * which parts it came from. So the product says exactly that, in words, wherever the form is
   * drawn. Nothing is derived and presented as recorded — the criterion forbids that in as many
   * words, and a derivation would be a guess about somebody's writing.
   *
   * AN EMPTY LIST IS NOT A VALUE THIS CAN HOLD. "Stands for nothing" is not a thing a projection
   * can be, so the write door refuses it and `readStoredShortForms` drops it rather than storing a
   * second spelling of "nobody recorded".
   */
  standsFor?: readonly string[]
}

/** Every short form one record holds, by length. */
export type StoredShortForms = Partial<Record<ShortFormLevel, StoredShortForm>>

/**
 * Read a record's stored short forms out of a value nothing has narrowed yet.
 *
 * ANYTHING THAT IS NOT A WHOLE SHORT FORM IS LEFT OUT, not repaired and not half-read. The write
 * path refuses a half-written one, so this is reading a value whose type is `unknown` rather than
 * defending against a shape that can be stored — and a level that does not come back is reported as
 * one nobody has written, which is the truth about a value nothing can read.
 */
export function readStoredShortForms(value: unknown): StoredShortForms {
  const out: StoredShortForms = {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return out
  const held = value as Record<string, unknown>
  // ONLY THE LEVELS THIS PRODUCT STILL STORES. A record holding a retired `title` or `gist` keeps
  // it on disk and this does not read it back, which is what makes "nothing draws it" true rather
  // than a rule every surface has to remember. Criterion A14b.
  for (const level of STORED_SHORT_FORM_LEVELS) {
    const form = held[level]
    if (form === null || typeof form !== 'object' || Array.isArray(form)) continue
    const { text, madeFrom, writtenBy } = form as Record<string, unknown>
    if (typeof text !== 'string' || text.trim() === '') continue
    if (writtenBy !== 'agent' && writtenBy !== 'human') continue
    if (madeFrom === null || typeof madeFrom !== 'object' || Array.isArray(madeFrom)) continue
    const { seq, contentHash } = madeFrom as Record<string, unknown>
    if (typeof seq !== 'number' || !Number.isFinite(seq)) continue
    if (typeof contentHash !== 'string' || contentHash === '') continue
    // WHICH PARTS IT STANDS FOR, WHERE SOMEBODY RECORDED THEM. Read under the same rule as
    // everything else here: anything that is not a whole answer is left out rather than repaired,
    // and a level that comes back without this key is one nobody recorded sources for, which is
    // the truth about a value nothing can read.
    const standsFor = readStandsFor((form as Record<string, unknown>)['standsFor'])
    // WHO WROTE IT AND WHEN, WHERE THE FORM CARRIES THEM. Every form stored before 2 September 2026
    // carries neither, and a form that has stood for weeks is not a broken form — so a missing one
    // is left missing rather than being read as a fault, and nothing here invents either. Reading
    // them separately is deliberate: a form may honestly carry the time and not the name, because a
    // request that stated no actor is a write whose time was measured and whose writer was not.
    const by = readWord((form as Record<string, unknown>)['by'])
    const at = readWord((form as Record<string, unknown>)['at'])
    // AND WHICH RUN WROTE IT, under the same rule: absent stays absent and nothing is derived.
    const session = readWord((form as Record<string, unknown>)['session'])
    out[level] = {
      text,
      madeFrom: { seq, contentHash },
      writtenBy,
      ...(by === null ? {} : { by }),
      ...(at === null ? {} : { at }),
      ...(session === null ? {} : { session }),
      ...(standsFor === null ? {} : { standsFor }),
    }
  }
  return out
}

/** A stored non-empty string, or null for anything else. Nothing is trimmed and nothing is made up. */
function readWord(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  return value
}

/**
 * THE RECORDED SOURCE REGIONS OF ONE STORED SHORT FORM, or null when nobody recorded any.
 *
 * A LIST OF NON-EMPTY STRINGS OR NOTHING. An empty list, a list with a blank in it, or a value of
 * any other shape all come back null: none of them is a record of which parts a projection stands
 * for, and half-reading one would put a region id nobody wrote onto a screen. The repeats are
 * dropped because two mentions of one part are one part.
 */
function readStandsFor(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null
  const ids: string[] = []
  for (const one of value) {
    if (typeof one !== 'string' || one.trim() === '') return null
    if (!ids.includes(one)) ids.push(one)
  }
  return ids.length === 0 ? null : ids
}

/** Just the words, for the checks and the pickers that do not care where they came from. */
export function textsOf(stored: StoredShortForms): ShortFormTexts {
  const out: ShortFormTexts = {}
  for (const level of STORED_SHORT_FORM_LEVELS) {
    const form = stored[level]
    if (form !== undefined) out[level] = form.text
  }
  return out
}

// ==================================================== the parts, as they sit in a record

/**
 * ONE PART OF A REPORT, AS THE THREE BY-PART LEVELS STORE IT.
 *
 * All three of its texts are written together, because they are three lengths of ONE part and a
 * level that had only some of them would draw a part that vanishes when the reader asks for more.
 */
export interface StoredPart {
  /**
   * A stable name for this part, unique within the record.
   *
   * IT IS WHAT MAKES A PART THE SAME PART AT LEVELS 4, 5 AND 6. Right-clicking a part builds a
   * region id from it, so the same part pressed at two levels gives one id and the composer names
   * one thing. Renumbering the parts loses that.
   */
  id: string
  /** The part's one-sentence summary, at most 10 words. Drawn at every by-part level. */
  heading: string
  /** The part in at most 30 words. Drawn under the heading at level 5. */
  text30: string
  /** The part in at most 120 words. Drawn under the heading at level 6. */
  text120: string
  /**
   * THE IDS OF THE REPORT'S BLOCKS THIS PART COVERS.
   *
   * BLOCK IDS, NOT REGION IDS. A block's `id` is what the report itself stores, so a reader of this
   * list needs nothing but the record to find what a part stands for.
   *
   * EVERY BLOCK OF THE REPORT IS COVERED BY EXACTLY ONE PART, and the write door refuses anything
   * else. That is the rule that makes it impossible for a level to leave a part of the report out
   * without saying so, and otherwise the reader cannot tell which parts are missing.
   */
  covers: readonly string[]
}

/**
 * THE WHOLE BY-PART STRUCTURE OF ONE RECORD, stored under `data.shortForms.parts`.
 *
 * It carries the same five provenance fields a written form carries and they mean the same thing —
 * which revision it was written from, whether a person or an agent wrote it, which one, when, and
 * in which run. They are the same fields rather than a second set, so one write stamps everything
 * it wrote.
 */
export interface StoredParts {
  madeFrom: Revision
  writtenBy: ShortFormAuthor
  /** Who wrote it, stored as `StoredShortForm.by` is, or absent because the request stated no actor. */
  by?: string
  /** When it was stored, local wall-clock time. Absent on anything stored before this existed. */
  at?: string
  /** The run that wrote it, as its session record's id. See `StoredShortForm.session`. */
  session?: string
  /** The parts, in the order they are drawn. Never empty: an empty list is not a summary. */
  parts: readonly StoredPart[]
}

/**
 * Read a record's by-part structure out of a value nothing has narrowed yet, or null.
 *
 * ANYTHING THAT IS NOT WHOLE IS LEFT OUT, not repaired and not half-read — the same rule
 * `readStoredShortForms` above follows and for the same reason. A structure that does not come back
 * is reported as one nobody has written, which is the truth about a value nothing can read.
 */
export function readStoredParts(value: unknown): StoredParts | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const held = (value as Record<string, unknown>)[PARTS_KEY]
  if (held === null || typeof held !== 'object' || Array.isArray(held)) return null
  const { madeFrom, writtenBy, parts } = held as Record<string, unknown>
  if (writtenBy !== 'agent' && writtenBy !== 'human') return null
  if (madeFrom === null || typeof madeFrom !== 'object' || Array.isArray(madeFrom)) return null
  const { seq, contentHash } = madeFrom as Record<string, unknown>
  if (typeof seq !== 'number' || !Number.isFinite(seq)) return null
  if (typeof contentHash !== 'string' || contentHash === '') return null
  if (!Array.isArray(parts) || parts.length === 0) return null
  const read: StoredPart[] = []
  for (const one of parts) {
    const part = readStoredPart(one)
    // ONE UNREADABLE PART MAKES THE WHOLE STRUCTURE UNREADABLE, and it is not read around. The
    // levels this draws promise that every block of the report is covered, and a structure with a
    // part dropped out of it would draw a report with a hole in it and nothing saying so.
    if (part === null) return null
    read.push(part)
  }
  const by = readWord((held as Record<string, unknown>)['by'])
  const at = readWord((held as Record<string, unknown>)['at'])
  const session = readWord((held as Record<string, unknown>)['session'])
  return {
    madeFrom: { seq, contentHash },
    writtenBy,
    ...(by === null ? {} : { by }),
    ...(at === null ? {} : { at }),
    ...(session === null ? {} : { session }),
    parts: read,
  }
}

/** One part, or null when anything about it is missing. */
function readStoredPart(value: unknown): StoredPart | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const { id, heading, text30, text120, covers } = value as Record<string, unknown>
  if (typeof id !== 'string' || id.trim() === '') return null
  if (typeof heading !== 'string' || heading.trim() === '') return null
  if (typeof text30 !== 'string' || text30.trim() === '') return null
  if (typeof text120 !== 'string' || text120.trim() === '') return null
  // AN EMPTY `covers` IS READ, NOT REFUSED HERE. It is a rule about coverage rather than about
  // shape, and `partsProblems` below refuses it in words a writer can act on. A reader that
  // dropped the part instead would leave the door with nothing to complain about.
  if (!Array.isArray(covers)) return null
  const blocks: string[] = []
  for (const one of covers) {
    if (typeof one !== 'string' || one.trim() === '') return null
    if (!blocks.includes(one)) blocks.push(one)
  }
  return { id, heading, text30, text120, covers: blocks }
}

/** The three texts of one part, by the key each is stored under. */
export function textsOfPart(part: StoredPart): Readonly<Record<PartText, string>> {
  return { heading: part.heading, text30: part.text30, text120: part.text120 }
}

// ============================================================================ what it stands for

/**
 * ONE SOURCE REGION A PROJECTION STANDS FOR, named the way a reader names it.
 *
 * `name` is `nameOfRegion` in @shared/regions.ts — the one place a part of a record is named, and
 * the same one the review pane and the record page read. It is worked out by the caller that holds
 * the record's region tree, so this file names nothing itself and cannot come to a second answer.
 */
export interface SourceRegion {
  regionId: string
  /** *the table*, *the section "What is still open around this"*. Never a region id. */
  name: string
  /** False when the record no longer holds this part. Said out loud; never quietly dropped. */
  stillThere: boolean
}

/**
 * WHICH PARTS OF THE RECORD ONE PROJECTION STANDS FOR, AND THE SENTENCE THAT SAYS SO.
 *
 * `parts` IS NULL WHEN NOBODY RECORDED ANY AND IS NEVER AN EMPTY LIST. Those would be two spellings
 * of one answer, and a screen reading `length === 0` would say *stands for nothing* about a form
 * whose sources simply were not written down.
 */
export interface StandsFor {
  parts: readonly SourceRegion[] | null
  /**
   * ONE PLAIN SENTENCE, WHICHEVER OF THE TWO IT IS, AND NEVER AN EMPTY STRING.
   *
   * The criterion this exists for says a projection must name its source regions, and where nobody
   * recorded them the product must SAY SO rather than say nothing. Silence is the one answer
   * forbidden, so this is built for every case including the ones nobody has written.
   */
  says: string
}

/**
 * A list of things in a sentence: *a, b and c*. Written once so two screens read alike.
 *
 * Exported because the reply to filing a record names the lengths nobody has written, and *label,
 * title, gist* with no *and* in it is a list read out rather than a sentence.
 */
export function joined(things: readonly string[]): string {
  if (things.length <= 1) return things[0] ?? ''
  return `${things.slice(0, -1).join(', ')} and ${things[things.length - 1] ?? ''}`
}

/**
 * THE ANSWER AND ITS SENTENCE, WORKED OUT ONCE FOR EVERY SURFACE THAT DRAWS A PROJECTION.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ONE FUNCTION AND NOT A SENTENCE PER SCREEN
 * ---------------------------------------------------------------------------------------
 *
 * Three surfaces say it: the *Shorter forms* panel, the composer that opens when somebody
 * right-clicks the summary at the shortest reading length, and anything else that draws a stored
 * form later. The owner's acceptance Act 3 presses the second of those. A sentence written on each screen
 * is the defect this repository keeps finding, and here it would fail in the worst direction: one
 * screen saying nobody recorded the sources while another says nothing at all.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR CASES, AND NONE OF THEM IS SILENCE
 * ---------------------------------------------------------------------------------------
 *
 *   nobody wrote this length      there is no projection to stand for anything, and that is said.
 *   nobody recorded the sources   the ordinary case on every record in the corpus. The form stands
 *                                 for the whole record, by rule, and that is what is said.
 *   recorded, all still there     the parts are named, in the reader's words.
 *   recorded, some gone           the ones still there are named and the rest are counted. A part
 *                                 the record no longer holds is not quietly left out of the list.
 *
 * ---------------------------------------------------------------------------------------
 * A FORM WITH NO RECORDED PARTS STANDS FOR THE WHOLE RECORD, AND IS NOT AN ABSENCE
 * ---------------------------------------------------------------------------------------
 *
 * THIS WAS SETTLED when the POINTING handback was rejected: the summary of a whole report stands
 * mainly for the whole report, no summary or lower level has to map to specific paragraphs, and
 * source-region coverage may be optional provenance. A whole-record form stands for
 * the whole record because that is what it is, so nothing has to be recorded for the answer to be
 * known. Recorded parts are PROVENANCE — where in the record the words were read — and they are
 * named beside the words when somebody wrote them down.
 *
 * SO THE MISSING SOURCE LIST IS NO LONGER REPORTED AS SOMETHING NOBODY DID. It used to read
 * *Nobody recorded which parts of this report this gist stands for*, which is true and is now
 * beside the point: it answered a question nobody has to answer, and it read as
 * a gap in a form that has none.
 *
 * ---------------------------------------------------------------------------------------
 * A SECTION-LEVEL FORM WOULD STAND FOR ITS SECTION, NOT FOR THE RECORD
 * ---------------------------------------------------------------------------------------
 *
 * The rule has a second half — a section summary stands for its section — and it is written here
 * because this is where the identity is worked out. NOTHING STORES A SECTION-LEVEL FORM TODAY:
 * `StoredShortForms` is keyed by length and hangs off the record, so every form this function is
 * ever handed is a whole-record form. The half-sentence is here so that the day one is stored, the
 * holder handed in is the section rather than the record, and this answer is not read as a claim
 * about the whole record. Criterion C3 of design/pointing-reopened/ACCEPTANCE.md asks for exactly
 * that and for nothing built ahead of it.
 *
 * `noun` is the length's own noun and `holder` is what the record is called — *report*, *module* —
 * both handed in, because this file has no table of either.
 */
export function whatItStandsFor(
  written: boolean,
  parts: readonly SourceRegion[] | null,
  length: ShortFormSpec,
  holder: string,
): StandsFor {
  const noun = length.noun
  if (!written) {
    return {
      parts: null,
      // THE ARTICLE IS READ OFF THE LENGTH AND NEVER WORKED OUT HERE. This line said `a ${noun}`
      // and so answered "Nobody has written a account for this report" — while `ShortFormSpec.article`
      // three hundred lines up says why the answer is written down beside the noun it belongs to.
      says:
        `Nobody has written ${length.article} ${noun} for this ${holder}, so there is nothing here to ` +
        `stand for any part of it.`,
    }
  }
  // NOBODY RECORDED ANY PART, SO THE ANSWER IS THE RULE. See the note above: a whole-record form
  // stands for the whole record whether or not anybody wrote down where in it the words came from.
  if (parts === null || parts.length === 0) {
    return { parts: null, says: `Stands for the whole ${holder}.` }
  }
  const here = parts.filter((one) => one.stillThere)
  const gone = parts.length - here.length
  // EVERY ONE OF THEM GONE IS ITS OWN SENTENCE, because the clause that names them went with them.
  // This read "This report no longer holds any of them." — *them* with nothing in front of it to
  // point at, since `named` is empty exactly when every part is gone. A pronoun whose antecedent
  // was deleted is a sentence that cannot be understood, so this one counts them instead.
  if (here.length === 0) {
    return {
      parts,
      says:
        `This ${holder} no longer holds ${gone === 1 ? 'the one part' : `any of the ${String(gone)} parts`} ` +
        `recorded as what this ${noun} stands for.`,
    }
  }
  const missing =
    gone === 0
      ? ''
      : ` ${gone === 1 ? 'One more part' : `${String(gone)} more parts`} recorded here, this ${holder} no longer holds.`
  const named = `Stands for ${joined(here.map((one) => one.name))}.`
  return { parts, says: `${named}${missing}`.trim() }
}

/**
 * WHO WROTE A FORM AND WHEN, IN THE PHRASE A SCREEN DRAWS, or null when nobody recorded either.
 *
 * ONE SCREEN DRAWS IT TODAY, AND IT STAYS ONE FUNCTION. It was written for two — the *Shorter
 * forms* panel beside each length, and the mark under the report's own opening line — and the owner
 * removed both on 2 September 2026. The composer that opens on right-clicking a form is what is
 * left. It stays here because the phrase is about a stored fact rather than about that box, and
 * because two wordings of one stored fact is the defect this repository keeps finding.
 *
 * NULL IS THE FOURTH ANSWER AND IT IS A REAL ONE. Every form stored before 2 September 2026 carries
 * neither name nor time. A screen handed null draws nothing at all: a line saying nobody recorded a
 * writer reads oddly in the place a name goes, and writing nothing is better, so the absence of a
 * writer is silence rather than a sentence. Criterion A9a.
 *
 * THE TIME WITHOUT THE NAME IS ALSO A REAL ANSWER, and it is not rounded down to null: a write that
 * stated no actor happened at a measured moment, and its writer is who nobody stated. The name
 * without the time cannot happen through either write door today and is answered anyway, because a
 * function that reads two optional fields has four cases whether or not it writes three of them.
 */
export function whoWroteIt(by: string | null, at: string | null): string | null {
  if (by !== null && at !== null) return `Written by ${by} on ${at}`
  if (by !== null) return `Written by ${by}`
  if (at !== null) return `Written on ${at}`
  return null
}

// ============================================================================ measuring one

/**
 * THE CHARACTERS THAT ARE A WORD ON THEIR OWN, because the script they belong to writes no spaces.
 *
 * Han for Chinese and for Japanese kanji, and the two Japanese kana. Korean is written WITH spaces
 * and is deliberately not here: counting each Hangul syllable as a word would treat a two-word
 * Korean phrase as six.
 */
const A_WORD_ON_ITS_OWN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
const EVERY_WORD_ON_ITS_OWN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu

/**
 * How many words a piece of text is, counted the way a reader reads it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT JUST A SPLIT ON SPACES
 * ---------------------------------------------------------------------------------------
 *
 * It was, until 6 September 2026, and that made every Chinese title one word however long it was.
 * The consequence was not theoretical: a record with a Chinese title could never be given a level-1
 * name, because every honest two-to-five-word label says more than a record of one word. Measured on
 * the live API that day: the label "Permissions draft is ready" on a message called
 * 权限cluster草稿写好了，四个问题等你 — fourteen characters, one whitespace token — was refused for
 * being longer than the record it shortens. Problem `wq24OKf_dbSw`. Many records here are written in
 * Chinese, so it was those records that could not have the name the lists and cards draw.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND WHAT IT DELIBERATELY DOES NOT CHANGE
 * ---------------------------------------------------------------------------------------
 *
 * A space still separates words. What is added is that a Chinese or Japanese character counts as a
 * word by itself, because that script puts no spaces between its words and one character is about
 * one word. Everything else in a token — Latin letters, digits, punctuation — counts as one word
 * between the characters that stand alone, exactly as a whitespace split would have counted it.
 *
 * SO NOTHING ABOUT AN ENGLISH TEXT MOVED. A text with no Han and no kana counts today exactly what
 * it counted before, character for character, which is what makes this safe to change under every
 * budget in the ladder at once.
 *
 * IT IS AN APPROXIMATION AND IT IS THE GENEROUS ONE. A Chinese word is one or two characters, so
 * counting each character as a word can say a title is longer than a reader would. That direction is
 * the safe one for the rule it feeds: this count decides whether a shorter form really is shorter,
 * and over-counting the record it shortens can only ever accept a name, never refuse one.
 *
 * See CHARACTERS_PER_WORD for the ceiling that catches a long run with no spaces in any script.
 */
export function countWords(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  let count = 0
  for (const token of trimmed.split(/\s+/)) {
    let standingAlone = 0
    for (const character of token) if (A_WORD_ON_ITS_OWN.test(character)) standingAlone += 1
    const rest = token.replace(EVERY_WORD_ON_ITS_OWN, '')
    count += standingAlone + (rest.trim() === '' ? 0 : 1)
  }
  return count
}

/**
 * How many Chinese or Japanese characters make one word at the HIGH end of a budget.
 *
 * Measured on 6 October 2026 (wave 13k, round 44, problem `zTsUr6VSSs0B`), on the 38 English labels
 * stored on one page of reports and one page of problems in the office. Drawn in the app's own font,
 * one English word of a label is as wide as 1.94 to 3.87 Chinese characters, 2.56 at the median, and
 * the thirteen five-word labels are as wide as 9.7 to 15.5 characters. Two characters to a word makes
 * a Chinese label at most 10 characters: narrower than twelve of those thirteen. It is also about the
 * length of a Chinese word, which is one or two characters.
 */
export const CHINESE_CHARACTERS_PER_WORD = 2

/**
 * How many words a piece of text is when the question is whether it is TOO LONG.
 *
 * `countWords` over-counts Chinese on purpose, and its own comment says why that is safe: it was
 * written to decide whether a shorter form is shorter than its record, where over-counting can only
 * accept a name. A ceiling is the other direction. Each character a word made the five-word label
 * five characters, so 扫描第三周报告, seven characters and four words, was refused. So at a ceiling
 * two Chinese or Japanese characters count as one word, rounded up (CHINESE_CHARACTERS_PER_WORD
 * says where the two comes from). Everything else counts as `countWords` counts it, so an English
 * text counts the same here as there.
 *
 * Every comparison of a shorter form with its record keeps `countWords`.
 */
export function wordsAgainstACeiling(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  let others = 0
  let standingAlone = 0
  for (const token of trimmed.split(/\s+/)) {
    for (const character of token) if (A_WORD_ON_ITS_OWN.test(character)) standingAlone += 1
    if (token.replace(EVERY_WORD_ON_ITS_OWN, '').trim() !== '') others += 1
  }
  return others + Math.ceil(standingAlone / CHINESE_CHARACTERS_PER_WORD)
}

/**
 * The characters an ellipsis is written with — the single character and the three dots.
 *
 * Text ending in one of these is the end of a cut, which is the thing this whole file exists to
 * replace. `countWords` would happily call it four words.
 */
const ENDS_CUT = /(…|\.\.\.)\s*$/

/**
 * True when this text ends in an ellipsis.
 *
 * That is the mark a screen leaves when it ran out of room, so it is evidence of a cut. It is not a
 * test for one: an ellipsis is one character and deleting it costs nothing. `isCutOf` below is the
 * check that compares the words, and the file header says what neither of them can see.
 */
export function looksCut(text: string): boolean {
  return ENDS_CUT.test(text)
}

/**
 * The words of a text, lower case, with the punctuation at each end of a word taken off.
 *
 * NOT STORED AND NOT SHOWN. Nothing anybody wrote is rewritten. This exists for one question — is
 * the short one the opening of the long one — and the punctuation comes off because otherwise ONE
 * CHARACTER answers it. `…the clamp dropped` and `…the clamp dropped.` are the same words, and
 * a check that called the first a cut and the second a piece of writing is a check anybody can walk
 * past by pressing the full stop key.
 *
 * PUNCTUATION INSIDE A WORD STAYS, so `twenty-five` and `didn't` are each one word and are compared
 * whole. Only the ends are trimmed, which is where the marks that separate sentences sit.
 */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, ''))
    .filter((word) => word !== '')
}

/**
 * True when the shorter text is the opening of the longer one, word for word.
 *
 * THIS IS HOW A CUT IS CAUGHT, AND IT CATCHES ONE KIND OF CUT. A short form produced by
 * `full.slice(0, 60)` is, by definition, the opening of what it was made from, and those repeated
 * words are the only mechanical trace it leaves. Somebody who then rewrites one of those words
 * leaves no trace, and no text comparison can find them. The file header says this out loud;
 * nothing here should be read as proof that a form was written rather than cut.
 *
 * WORDS AND NOT CHARACTERS, because a prefix test on characters was defeated by appending a full
 * stop — measured on 19 August 2026, and the reason this is a word walk. The last word of the
 * shorter one may be the START of a word in the longer one, since a cut by character count lands
 * mid-word as often as not.
 *
 * IT IS STILL DELIBERATELY NARROW. It fires only when the WHOLE of the shorter text is the opening
 * of the longer one. Two forms that open with the same sentence and then diverge are not a cut, and
 * refusing those would refuse honest writing — a gist and a brief that share their first sentence
 * are a normal thing to write.
 *
 * A short form exactly equal to the longer one is a cut of nothing at all, and it is caught here
 * too. It is the case somebody reaches when the writing at two lengths has not been done and one
 * has been copied into the other.
 */
export function isCutOf(shorter: string, longer: string): boolean {
  const a = wordsOf(shorter)
  const b = wordsOf(longer)
  if (a.length === 0 || b.length === 0) return false
  if (a.length > b.length) return false
  for (let n = 0; n < a.length - 1; n += 1) {
    if (a[n] !== b[n]) return false
  }
  const lastOfShorter = a[a.length - 1] ?? ''
  const facingIt = b[a.length - 1] ?? ''
  return facingIt.startsWith(lastOfShorter)
}

/**
 * HOW MANY WORDS IN A ROW MAKE A COPY: eight.
 *
 * The number is here rather than written into a refusal, so the sentence a writer reads and the
 * check it describes are one fact. Eight was chosen by measurement, not by taste: on the 26 reports
 * of this project, every part text already written is refused by nothing at eight, and a run of
 * eight words repeated in the same order is far past what two people writing separately produce.
 */
export const WORDS_THAT_MAKE_A_COPY = 8

/**
 * Whether two texts are the same words in the same order: the sentence arm of the copy rule.
 *
 * The words are compared the way `isCutOf` compares them — lower case, punctuation off each end —
 * so adding a full stop cannot get a copy past this either. A Chinese sentence is one word here,
 * because `wordsOf` splits on spaces, so a Chinese copy is the same one word on both sides. (The arm
 * used to count the words two texts open with against `countWords`, which counts every Chinese
 * character, so it could never match a Chinese copy; wave 13k, round 45.)
 */
export function areTheSameWords(a: string, b: string): boolean {
  const left = wordsOf(a)
  const right = wordsOf(b)
  return left.length === right.length && left.every((word, n) => word === right[n])
}

/**
 * EVERY SENTENCE OF A PIECE OF PROSE, in the order it is read.
 *
 * A sentence ends at a full stop, a question mark or an exclamation mark followed by a space, at a
 * Chinese 。, ！ or ？ with or without a space after it, or at a line break. Chinese puts no space
 * after its stops, so without them a Chinese paragraph was one sentence and the copy rule's sentence
 * arm never caught a Chinese copy (wave 13k, round 45). `proseOfBlocks` joins one block's writing to the next with a space, so a heading
 * with no full stop after it runs into the paragraph below it and the two are read here as one
 * sentence. That makes the sentences LONGER than a person would mark them, which is the safe
 * direction: the copy rule fires on a whole sentence being repeated, so a longer sentence is a
 * harder thing to repeat by accident.
 */
export function sentencesOfProse(prose: string): string[] {
  return prose
    .split(/(?<=[.!?])\s+|(?<=[。！？])\s*|\n+/)
    .map((one) => one.trim())
    .filter((one) => one !== '')
}

/** One thing wrong with one short form, said in a sentence somebody can act on. */
export interface ShortFormProblem {
  level: ShortFormLevel
  message: string
}

/**
 * Whether one piece of text fits one length's budget, or the sentence saying how it does not.
 *
 * BOTH ENDS ARE ENFORCED, and the low end is not officiousness. A one-word gist is not a short
 * gist; it is a label written in the gist's place, and a screen that asked for the useful
 * conclusion gets a name instead with nothing saying so.
 *
 * AND BOTH ENDS FALL BACK TO CHARACTERS WHERE WORDS CANNOT BE COUNTED. See the note inside on the
 * label `夹具标定`, which the word rule refused and should not have.
 */
const trimmed = (text: string): string => text.trim()

/** `a` at the start of a sentence is `A`. One line, so a refusal is not written twice. */
const up = (article: 'a' | 'an'): string => (article === 'a' ? 'A' : 'An')

export function budgetProblem(level: ShortFormLevel, text: string): string | null {
  return budgetAgainst(SHORT_FORM_SPECS[level], text)
}

/**
 * THE SAME QUESTION ASKED ABOUT ANY BUDGET, whether it is one of the whole-record lengths or one of
 * the three texts a part carries.
 *
 * IT TAKES THE BUDGET RATHER THAN THE LEVEL'S NAME, because a part's heading is not a level and its
 * words are judged by exactly this rule. Written the other way, the by-part texts would have needed
 * a second copy of every sentence below, which is the defect this repository keeps finding.
 */
export function budgetAgainst(spec: WordBudget, text: string): string | null {
  const words = countWords(text)
  const characters = trimmed(text).length
  const budget = `${up(spec.article)} ${spec.noun} is ${spec.minWords} to ${spec.maxWords} words: ${spec.what}`

  if (words === 0) {
    return (
      `The ${spec.noun} is blank. Leave the level out entirely instead — nothing written is a real answer and ` +
      `Mole Office says it out loud, while a blank one draws as a gap that reads as a missing value. ${budget}`
    )
  }
  if (looksCut(text)) {
    return (
      `The ${spec.noun} ends in an ellipsis, so it is the end of a cut rather than something written at this ` +
      `length. Write the ${spec.noun} for what it is for; do not shorten the full text into it. ${budget}`
    )
  }
  // THE LOW END IS JUDGED BY WORDS ONLY WHERE THERE ARE SPACES TO COUNT THEM BY.
  //
  // A text with no space in it is one word by any count that respects word boundaries, and both a
  // real Latin name and a real Chinese label are written that way: a one-word name is a name an agent
  // answers to, and `夹具标定` is a module in this corpus. Neither should be refused for being
  // shorter than two words. So a text with no space is judged at the low end by its CHARACTERS,
  // against one character per word the budget asks for — a floor far below anything real, which
  // still catches a one-character gist.
  //
  // THIS SURVIVED THE COUNT CHANGE OF 6 SEPTEMBER 2026 and it was briefly deleted. `countWords`
  // now counts a Chinese character as a word, so `夹具标定` is four words and passes on its own
  // terms — but a one-word Latin name is still one, and taking this branch away refused every one-word name a
  // registry holds. Six cases in tests/a-name-is-short-and-a-person-gives-it.test.ts said so.
  const spaced = /\s/.test(trimmed(text))
  if (spaced && words < spec.minWords) {
    return (
      `The ${spec.noun} is ${String(words)} word${words === 1 ? '' : 's'} and wants at least ${String(spec.minWords)}. ` +
      `${budget} An example: "${spec.example}"`
    )
  }
  if (!spaced && characters < spec.minWords) {
    return (
      `The ${spec.noun} is ${String(characters)} character${characters === 1 ? '' : 's'} written without any spaces, ` +
      `so its length is judged by characters instead. It wants at least ${String(spec.minWords)}. ${budget}`
    )
  }
  // THE HIGH END COUNTS TWO CHINESE CHARACTERS AS ONE WORD; see `wordsAgainstACeiling`.
  const atMost = wordsAgainstACeiling(text)
  if (atMost > spec.maxWords) {
    const howCounted = atMost === words ? '' : 'At this end two Chinese or Japanese characters count as one word. '
    return (
      `The ${spec.noun} is ${String(atMost)} words and may be at most ${String(spec.maxWords)}. ${howCounted}${budget} ` +
      `Whatever did not fit belongs at the next length up, or in the full text.`
    )
  }
  if (characters > spec.maxWords * CHARACTERS_PER_WORD) {
    return (
      `The ${spec.noun} is ${String(characters)} characters, and ${String(spec.maxWords)} words at this length is ` +
      `at most ${String(spec.maxWords * CHARACTERS_PER_WORD)}. A space separates words, and at this end two ` +
      `Chinese or Japanese characters are one word; a long run with neither counts as one word, and the ` +
      `character count is what judges it. ${budget}`
    )
  }
  return null
}

// ============================================================================ checking a whole set

/**
 * Everything wrong with a set of short forms: the budgets, and any one made by cutting another.
 *
 * THE CUTTING RULE IS THE POINT OF THIS FUNCTION. Each of the six is a semantic role, so a label
 * that is the first four words of the gist has not been written — it has been sliced, and the one
 * sentence worth keeping is whatever fell off the end. Every shorter form is compared with every
 * longer one that is present.
 *
 * WHAT THIS CANNOT SEE, and there are two of them. It compares the six with each other and nothing
 * else: whether one of them is a cut of the FULL text needs the full text, which is a different
 * object on every kind of record, and that check lives in src/server/lib/summary.ts where the body
 * of a record is already understood. And neither check can see a cut whose words have been edited —
 * the file header says so plainly, and no caller should read a clean answer from here as proof that
 * somebody wrote these rather than sliced them.
 */
export function shortFormProblems(texts: ShortFormTexts): ShortFormProblem[] {
  const problems: ShortFormProblem[] = []
  for (const level of STORED_SHORT_FORM_LEVELS) {
    const text = texts[level]
    if (text === undefined) continue
    const problem = budgetProblem(level, text)
    if (problem !== null) problems.push({ level, message: problem })
  }
  // Only forms that are sound on their own are compared, so a caller with a blank gist is told
  // about the blank rather than about the blank being the start of everything.
  const sound = STORED_SHORT_FORM_LEVELS.filter((level) => {
    const text = texts[level]
    return text !== undefined && budgetProblem(level, text) === null
  })
  for (const [n, shorter] of sound.entries()) {
    for (const longer of sound.slice(n + 1)) {
      const a = texts[shorter]
      const b = texts[longer]
      if (a === undefined || b === undefined) continue
      if (!isCutOf(a, b)) continue
      problems.push({
        level: shorter,
        message:
          `The ${SHORT_FORM_SPECS[shorter].noun} is the opening of the ${SHORT_FORM_SPECS[longer].noun}, so it was ` +
          `made by cutting rather than written. ${SHORT_FORM_SPECS[shorter].what} That is a different job from the ` +
          `${SHORT_FORM_SPECS[longer].noun}, and a cut keeps whichever words came first rather than the ones that ` +
          `matter. Write it for what it is for.`,
      })
    }
  }
  return problems
}

// ==================================================== checking a set of parts

/** One thing wrong with one part, said in a sentence somebody can act on. */
export interface PartProblem {
  /** The part's own id, or the position where it has none. */
  part: string
  /** Which of the three texts, or null when the problem is about the part as a whole. */
  text: PartText | null
  message: string
}

/**
 * EVERYTHING WRONG WITH A SET OF PARTS THAT CAN BE SEEN WITHOUT THE REPORT: the word budgets and
 * two parts sharing an id.
 *
 * WHAT IT CANNOT SEE, and the other half of the door is where those live. Whether a part covers a
 * block the report holds, whether two parts cover one block, whether every block is covered, and
 * whether a text is a cut of the report's own prose all need the report's blocks. Those are in
 * `checkPartsAgainstBody` in src/server/lib/summary.ts, where a record's body is already
 * understood — the same split `shortFormProblems` above already lives on.
 */
export function partsProblems(parts: readonly StoredPart[]): PartProblem[] {
  const problems: PartProblem[] = []
  if (parts.length === 0) {
    return [
      {
        part: PARTS_KEY,
        text: null,
        message:
          'The list of parts is empty, so it says nothing about the record. Leave the whole structure out ' +
          'instead: nothing written is a real answer and Mole Office says it out loud, while an empty list draws ' +
          'as a report with no parts in it.',
      },
    ]
  }
  const seen = new Set<string>()
  for (const [n, part] of parts.entries()) {
    const named = part.id === '' ? `part ${String(n + 1)}` : part.id
    if (seen.has(part.id)) {
      problems.push({
        part: named,
        text: null,
        message:
          `Two parts carry the id "${part.id}". A part's id is how one part is addressed on its own, and it is ` +
          `what makes a part the same part at levels 4, 5 and 6, so two parts may not share one. Give one of ` +
          `them a different id.`,
      })
    }
    seen.add(part.id)
    if (part.covers.length === 0) {
      problems.push({
        part: named,
        text: null,
        message:
          `The part "${named}" covers no block of this record. A part stands for the blocks it covers, so a ` +
          `part covering nothing is a summary of nothing: name the ids of the blocks it is about, or take the ` +
          `part out. Every block of the record has to be covered by exactly one part. Which field holds them ` +
          `is the kind's own, and it is read off the declaration: GET /api/kinds says where this kind keeps ` +
          `them.`,
      })
    }
    const texts = textsOfPart(part)
    for (const which of PART_TEXTS) {
      const problem = budgetAgainst(PART_TEXT_SPECS[which], texts[which])
      if (problem !== null) problems.push({ part: named, text: which, message: problem })
    }
  }
  return problems
}

/**
 * WHAT A KIND WITH NO PLACE FOR THE BY-PART LEVELS SAYS.
 *
 * ONE SENTENCE FOR ONE FACT. A task, a pipeline, a note and every other kind that keeps no blocks
 * in its own `data` has no levels 4, 5 or 6, because a part names the blocks it covers and there is
 * nothing for it to cover. The reading reply, the card on the drawing and the write door all have
 * to give that reason; a second wording would be two answers about one record, which is the defect
 * this whole file exists to prevent.
 *
 * THE LEVEL NAMES COME IN rather than being read here, because the same sentence is printed for one
 * level on a card and for all three when a whole summary written by part is refused. `joined` is the
 * list sentence the rest of the ladder uses, so `level 4, level 5 and level 6` reads as one.
 */
export function noPartsToWriteSentence(levelNames: readonly string[]): string {
  return `This kind of record has no parts to write, so it has no ${joined(levelNames)}.`
}

/**
 * WHAT A LEVEL SAYS WHEN THE RECORD IS ALREADY THAT SHORT.
 *
 * The other of the two reasons a position cannot be written. The reading row and the whole-record
 * note both print it, and the write door's length check refuses with the same clause, so there is
 * one sentence about one fact. `namedLevels` is already a list in words — `level 4` for one row,
 * `level 4, level 5 and level 6` for the note — because the two callers name a different number.
 */
export function tooShortForLevelSentence(namedLevels: string): string {
  return (
    `This record is too short for ${namedLevels}: A level longer than the record would have to say more ` +
    `than the record does.`
  )
}

// ============================================================================ asking for one

/** What came back when a screen asked for one length. */
export type ShortFormPick =
  | { found: true; level: ShortFormLevel; text: string }
  | {
      found: false
      /** The length that was asked for. */
      wanted: ShortFormLevel
      /** The lengths that HAVE been written, shortest first. Empty when none have. */
      written: readonly ShortFormLevel[]
      /** One plain sentence for a screen that has room for one. */
      says: string
    }

/**
 * The text at one length, or the honest answer that nobody has written one.
 *
 * IT NEVER SUBSTITUTES ANOTHER LENGTH. A screen that asks for a label has room for a label; handing
 * back the 250-word brief because it happens to exist is the silent substitution this product bans,
 * and on a screen it arrives as a row that is suddenly eleven lines tall.
 *
 * A CALLER THAT WANTS TO FALL BACK MAY, and has to do it in the open: `written` names what exists,
 * so a caller can choose the next one up and say on the screen that it did. What it may not do is
 * have this function choose quietly.
 */
export function atLevel(texts: ShortFormTexts, wanted: ShortFormLevel): ShortFormPick {
  const text = texts[wanted]
  if (text !== undefined && text.trim() !== '') return { found: true, level: wanted, text }
  const written = STORED_SHORT_FORM_LEVELS.filter((level) => {
    const other = texts[level]
    return other !== undefined && other.trim() !== ''
  })
  const spec = SHORT_FORM_SPECS[wanted]
  return {
    found: false,
    wanted,
    written,
    says:
      written.length === 0
        ? `Nobody has written ${spec.article} ${spec.noun} for this, or any other short form of it.`
        : `Nobody has written ${spec.article} ${spec.noun} for this. What has been written: ` +
          `${written.map((level) => SHORT_FORM_SPECS[level].noun).join(', ')}.`,
  }
}

/**
 * WHICH OF THE SIX LENGTHS THIS RECORD HAS WRITING FOR, AND THE WORDS EACH ONE DRAWS.
 *
 * ---------------------------------------------------------------------------------------
 * LEVEL 2 IS THE RECORD'S OWN TITLE AND LEVEL 3 IS ITS OWN SUMMARY
 * ---------------------------------------------------------------------------------------
 *
 * Since 3 September 2026 a title aims at 15 words at most and a summary at 20 to 60, the reports
 * filed before then stay as they are, and a level a report lacks is said not to exist. A report is
 * filed with a title and a summary, and those two ARE those two lengths. There is no separate title
 * form and no separate gist any more. Criterion A14b of design/pointing-reopened/ACCEPTANCE.md.
 *
 * SO A REPORT ALWAYS HAS LEVEL 2 — the title column is `NOT NULL` and non-empty on every record in
 * this corpus — AND HAS LEVEL 3 ONLY WHERE SOMEBODY WROTE A SUMMARY. A report with no summary has
 * no level 3 and the body says so, which is criterion A14a and is what `summaryAt` below answers.
 *
 * THIS USED TO READ ONLY `data.shortForms`, WHICH IS WHY THE PARAGRAPH BELOW IS KEPT. The day
 * before, the OTHER thing ended: a column standing in for a length nobody had written, with the
 * page saying nothing about which. Where a report has no writing at a level, the page shows no
 * summary (gist) level and says that it does not exist. The column is not standing in for
 * anything now: it IS the level, so the page draws it and names it as the report's title or its
 * conclusion. What is
 * still forbidden, and what that ruling was about, is one length's words drawn at another length.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE LENGTHS WRITTEN BY PART ARE ON IT, AND THEIR `text` IS NULL
 * ---------------------------------------------------------------------------------------
 *
 * Levels 4, 5 and 6 are one structure — a heading and two texts for each part of the report — so
 * there is no single string for the list to carry, and null is that answer rather than an empty
 * string standing in for words. All three stand or fall together, because all three read the one
 * structure.
 *
 * They were missing once, and the settings page counted them: its counter row read *0 of 43* at
 * levels 4, 5 and 6 on a corpus where all 26 reports draw between four and twenty-four written
 * parts at each of them. Problem `gzRwiq38pp7v`, 3 September 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE LIST IS DERIVED FROM THE RECORD AND HANDED TO EVERY SURFACE
 * ---------------------------------------------------------------------------------------
 *
 * The report body draws one opening line and the settings counter counts which lengths a record
 * has. They used to work that out from two different inputs, and one rule over two inputs still
 * gives two answers: measured on 2 September 2026 on a report with a summary and no gist form, the
 * body said the summary written for this length was drawn above the report and the panel on the
 * same page said nobody had written any short form of it. Problem `U0eaiB_AosNh`. So the list is
 * worked out here, once, from the record itself, and every surface takes it.
 */
export function formsWrittenIn(source: DetailSource): { rung: Rung; field: string; text: string | null }[] {
  const found: { rung: Rung; field: string; text: string | null }[] = []
  const stored = readStoredShortForms(source.shortForms)
  // WHATEVER IS STORED UNDER `data.shortForms`, WHICH SINCE 3 SEPTEMBER 2026 IS THE LABEL ALONE.
  //
  // IT WALKS ALL THREE WHOLE-RECORD LENGTHS AND ASKS THE READER, rather than walking a second list
  // of which ones are still storable. `readStoredShortForms` in ./zoom.ts is the ONE gate: it reads
  // `STORED_SHORT_FORM_LEVELS` and hands back nothing under a retired key, so a stored `title` form
  // or `gist` is not here to be found. A second list here would be the same fact in two places, and
  // it would fail in the worst direction — the two agreeing is what keeps a retired form off the
  // page, so a test could not tell which of them was doing it.
  for (const rung of SHORT_FORM_LEVELS) {
    const form = stored[rung]
    if (form === undefined) continue
    found.push({ rung, field: `data.shortForms.${rung}`, text: form.text })
  }
  // LEVEL 2, WHICH IS THE RECORD'S OWN TITLE COLUMN. `field` is the bare word `title`, which is the
  // path every reader of this product already names that column by — `stringsOfRecord` on the
  // server and `data-text-field` in the header both write it — so a line drawn from here carries
  // the true path of its characters and not a name invented for the drawing.
  if (source.title.trim() !== '') found.push({ rung: 'title', field: 'title', text: source.title })
  // LEVEL 3, WHICH IS THE RECORD'S OWN SUMMARY COLUMN, where somebody wrote one. A report with no
  // summary is simply not on this list at level 3, and the body draws the line saying so.
  const summary = source.summary
  if (typeof summary === 'string' && summary.trim() !== '') {
    found.push({ rung: 'gist', field: 'summary', text: summary })
  }
  // A LENGTH WRITTEN BY PART IS WRITTEN WHEN ITS PARTS ARE, and the structure is what says so.
  // `field` is the key they are stored under, which is what every other entry carries: the stored
  // path the words come from.
  if (readStoredParts(source.shortForms) !== null) {
    for (const rung of BY_PART_LEVELS) found.push({ rung, field: `data.shortForms.${PARTS_KEY}`, text: null })
  }
  return found
}
