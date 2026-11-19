// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW MUCH A SURFACE SAYS, AND WHICH STORED WORDS IT DRAWS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * A row in a list has room for four words. A report page has room for the whole report. Between
 * those there are five other useful lengths. This file names all seven as one ladder, says which
 * stored field carries each one, and answers two questions:
 *
 *   detailOf(source, asked)          which stored words does this surface draw, and where from
 *   rungFor(surface, kind, …)        how much should this surface be saying in the first place
 *
 * ---------------------------------------------------------------------------------------
 * THE SUPPLY DECISION, WHICH IS THE POINT OF THE FILE
 * ---------------------------------------------------------------------------------------
 *
 * `records.title` IS rung 2 and `records.summary` IS rung 3. They are not fallbacks. They are the
 * two rungs this product has always written, under other names.
 *
 * Measured against the live corpus on 20 August 2026, read-only: 541 live records, 541 with a
 * title, 430 with a summary. So 971 slots are answerable the day this ships, with nothing
 * generated. Stored short forms exist on ONE record — a label and a gist on report `m2Q0CybxoGNF`.
 * Without the decision above, a list of 541 rows would draw "nobody has written one" 540 times.
 *
 * (The interaction contract says 531 / 420 / 951, measured on 19 August. The corpus grew. Both
 * numbers stand, dated, rather than one being quietly corrected.)
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE RULES THAT MAKE THIS HONEST
 * ---------------------------------------------------------------------------------------
 *
 * 1. NOTHING HERE GENERATES TEXT. There is no summariser in this product. Every character this
 *    file returns was read from a stored field, and `tests/detail-resolver.test.ts` proves it by
 *    byte-comparing every answer against the field it names.
 *
 * 2. NOTHING HERE CUTS A STRING TO LENGTH. Where a rung has no words, the answer says which other
 *    rung it drew and how far over the asked budget those words run. A surface then clips them and
 *    marks the clip. A cut made here would reach a caller looking exactly like something somebody
 *    wrote at that length.
 *
 * 3. A CUT SOMEBODY ELSE MADE IS NEVER PRESENTED AS AUTHORED. `written` on the answer says whether
 *    anybody wrote these words at this length, and its third value is `unrecorded`, which is the
 *    truth about all 541 titles today: nobody has recorded which of them were cut.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * IT IS NOT THE STYLE AXIS. Reading style — Editorial, Technical, Data-heavy, Presentation — says
 * how writing is set. Detail says how much of it there is. Two axes, and this file owns one of
 * them. Nothing here reads or writes `READING_STYLES`.
 *
 * IT DOES NOT DECIDE WHETHER A STORED SHORT FORM IS STILL CURRENT. That needs the revision ledger,
 * which is a database. The caller passes what the ledger said in `standing`. See the note on
 * `ShortFormStanding` for why this file does not work it out a second way.
 *
 * IT DRAWS NOTHING AND STORES NOTHING. It runs in the browser and on the server, like
 * `src/shared/zoom.ts` and `src/shared/kinds.ts`.
 */

import {
  BY_PART_LEVELS,
  CHARACTERS_PER_WORD,
  PART_TEXT_SPECS,
  SHORT_FORM_LEVELS,
  SHORT_FORM_SPECS,
  TEXT_DRAWN_AT,
  countWords,
  isByPartLevel,
  joined,
  readStoredParts,
  readStoredShortForms,
  wordsAgainstACeiling,
  type ByPartLevel,
  type ShortFormLevel,
  type StoredShortForms,
} from './zoom.ts'

// ============================================================================ the seven rungs

/**
 * ONE OF THE SEVEN POSITIONS ON THE DETAIL LADDER.
 *
 * The first three are the whole-record short forms declared in `./zoom.ts`. The next three are the
 * lengths written BY PART, declared in the same file. The seventh is the record's own content — the
 * thing the other six are made from.
 */
export type Rung = ShortFormLevel | ByPartLevel | 'full'

/**
 * THE LAST RUNG IS NOT A STORABLE SHORT FORM, AND IT IS DELIBERATELY NOT IN `SHORT_FORM_LEVELS`.
 *
 * `SHORT_FORM_LEVELS` is the list of lengths somebody can WRITE and Mole Office can STORE. `kinds.ts`
 * turns it into schema fields and `src/server/api/zoom.ts` turns it into the set of levels a POST
 * will accept. Putting `full` in it would declare a storable `shortForms.full` on every body kind
 * and let an agent write a copy of the record's own body beside the record's own body.
 *
 * So the seven-position ladder is built here, from the six, and `tests/detail-resolver.test.ts`
 * fails if anybody adds `full` to the storable list.
 */
export const RUNGS: readonly Rung[] = [...SHORT_FORM_LEVELS, ...BY_PART_LEVELS, 'full']

/**
 * THE SEVEN, NAMED IN ONE SENTENCE, for a refusal that has to say what the ladder is.
 *
 * BUILT FROM `RUNGS` rather than typed out, so a refusal cannot name a ladder the product does not
 * have. The write door uses it when it refuses one of the three retired keys.
 */
export const SEVEN_RUNGS_NAMED = joined([...RUNGS])

/** True when this word names a rung. Used on values read back out of storage. */
export function isRung(word: unknown): word is Rung {
  return typeof word === 'string' && (RUNGS as readonly string[]).includes(word)
}

/** Everything there is to know about one rung. Plain data: safe to serve as JSON. */
export interface RungSpec {
  rung: Rung
  /** Where it sits on the ladder, 1 upwards. The control draws these numerals. */
  position: number
  /** What one of these is called in a sentence. From `./zoom.ts` for the six. */
  noun: string
  /** What this length is FOR, in one sentence. */
  what: string
  /**
   * The accessible name of this position on the detail control.
   *
   * THE CONTROL DRAWS `1 2 3 4 5 6 Full` AND NOTHING ELSE. These phrases are what a screen reader
   * says and what a title carries. They are the only screen text this file holds.
   */
  phrase: string
  /** The word budget, both ends. Null on `full`, which has no budget: it is the whole thing. */
  words: { min: number; max: number } | null
  /**
   * WHAT THAT BUDGET IS COUNTED OVER: the whole form, or each part of the report separately.
   *
   * IT IS DECLARED RATHER THAN GUESSED FROM THE RUNG'S NAME. Levels 1 to 3 are one text about the
   * whole record and their budget covers that text. Levels 4, 5 and 6 are written by part and the
   * budget is the budget of ONE PART'S text, so a report with nine parts at level 6 is nine texts
   * of at most 120 words and not one. A screen that read the number without this word would tell a
   * reader the sixth length is 120 words long, which is false about every report with two parts.
   *
   * `null` on `full`, which has no budget at all.
   */
  wordsPer: 'form' | 'part' | null
}

const FULL_SPEC: RungSpec = {
  rung: 'full',
  // THE LAST POSITION, COUNTED RATHER THAN TYPED. Full sits one above the longest authored length,
  // so adding a length moves it without anybody remembering to. It was the literal `6` until the
  // sixth authored length landed, at which point the number would have named another length's seat.
  position: SHORT_FORM_LEVELS.length + BY_PART_LEVELS.length + 1,
  noun: 'full text',
  what: "The record's own content, as it was written. This is what the shorter forms are made from.",
  phrase: 'the whole thing',
  words: null,
  wordsPer: null,
}

/**
 * The accessible phrase for each of the written lengths.
 *
 * These are here rather than in `./zoom.ts` because they are about the CONTROL, not about the
 * stored form. `./zoom.ts` says what a gist is for; this says what the third position on the
 * control is called.
 */
const PHRASES: Record<ShortFormLevel, string> = {
  label: 'a few words',
  title: 'one line',
  gist: 'one paragraph, the conclusion where one is written',
}

/**
 * WHAT EACH BY-PART LENGTH IS CALLED IN PLAIN WORDS, and what it draws.
 *
 * THESE ARE THE WORDS THE COMPOSER SAYS, and they name what the reader is looking at rather than
 * the key it is stored under. `outline`, `sketch` and `digest` are the ids in the code and in a
 * stored choice; nobody reads those on a screen. The control says *Level 4*, *Level 5* and
 * *Level 6*, which is the owner's rule of 2 September 2026, and `levelLabel` below is where that
 * lives.
 *
 * THE WORDS NAME THE RECORD THEY ARE ABOUT. A module carries these three lengths as well as a
 * report, so `holder` is what the record is called — *report*, *module* — read by the caller off
 * the kind with `kindWord`. Until 30 September 2026 the words said *report* on every kind, and a
 * module's writer was told about a report's outline (problem rLYYdQeL0vJL).
 */
function byPartSaid(level: ByPartLevel, holder: string): { noun: string; what: string; phrase: string } {
  switch (level) {
    case 'outline':
      return {
        noun: `${holder}'s outline`,
        what: `The ${holder}'s outline, one line per part. Each line is that part of the ${holder} in one sentence.`,
        phrase: `the ${holder}'s outline, one line per part`,
      }
    case 'sketch':
      return {
        noun: `${holder}'s sketch`,
        what: `The ${holder}'s sketch: each part in 30 words, under the same one-sentence heading level 4 draws.`,
        phrase: `the ${holder}'s sketch, each part in 30 words`,
      }
    case 'digest':
      return {
        noun: `${holder}'s digest`,
        what: `The ${holder}'s digest: each part in 120 words, under the same one-sentence heading level 4 draws.`,
        phrase: `the ${holder}'s digest, each part in 120 words`,
      }
  }
}

/**
 * THE RECORD THE LADDER'S OWN WORDS ARE ABOUT, WHERE NO ONE RECORD IS BEING READ: a report.
 *
 * `RUNG_SPECS` is the ladder as the settings grid and the report's level control say it. A report is
 * the one kind with a level control on its own page (`FLOORED_KIND` below), so its words are the
 * ladder's. A reply about one record reads `rungSaidOf` with that record's own word instead.
 */
const LADDER_HOLDER = 'report'

/** The seven, shortest first, so every list built from them reads the same way twice. */
export const RUNG_SPECS: Readonly<Record<Rung, RungSpec>> = Object.fromEntries([
  ...SHORT_FORM_LEVELS.map((level, index): [Rung, RungSpec] => {
    const spec = SHORT_FORM_SPECS[level]
    return [
      level,
      {
        rung: level,
        position: index + 1,
        noun: spec.noun,
        what: spec.what,
        phrase: PHRASES[level],
        words: { min: spec.minWords, max: spec.maxWords },
        wordsPer: 'form',
      },
    ]
  }),
  ...BY_PART_LEVELS.map((level, index): [Rung, RungSpec] => {
    const said = byPartSaid(level, LADDER_HOLDER)
    // THE BUDGET IS THE BUDGET OF THE TEXT THIS LEVEL DRAWS UNDER THE HEADING, and at level 4 there
    // is no such text, so it is the heading's own budget. `TEXT_DRAWN_AT` in ./zoom.ts is the one
    // table saying which text each level draws, and it is read here rather than restated.
    const drawn = TEXT_DRAWN_AT[level]
    const budget = PART_TEXT_SPECS[drawn ?? 'heading']
    return [
      level,
      {
        rung: level,
        position: SHORT_FORM_LEVELS.length + index + 1,
        noun: said.noun,
        what: said.what,
        phrase: said.phrase,
        words: { min: budget.minWords, max: budget.maxWords },
        wordsPer: 'part',
      },
    ]
  }),
  ['full', FULL_SPEC] as [Rung, RungSpec],
]) as Record<Rung, RungSpec>

/**
 * WHAT ONE POSITION IS CALLED ON ONE RECORD: its noun, what it draws, and its phrase.
 *
 * The three whole-record lengths and the whole record are called the same on every kind, so they
 * are `RUNG_SPECS`'s own words. The three lengths written by part name the record, so they are
 * worked out from `holder`, which is what the record is called (`kindWord(kind).text`).
 */
export function rungSaidOf(rung: Rung, holder: string): { noun: string; what: string; phrase: string } {
  if (isByPartLevel(rung)) return byPartSaid(rung, holder)
  const spec = RUNG_SPECS[rung]
  return { noun: spec.noun, what: spec.what, phrase: spec.phrase }
}

/** Where a rung sits on the ladder, 1 upwards. */
export function positionOf(rung: Rung): number {
  return RUNG_SPECS[rung].position
}

/**
 * WHAT ONE POSITION IS DRAWN AS: `1 2 3 4 5 6 Full`, and nothing else.
 *
 * ONE FUNCTION, BECAUSE THE LABEL WAS BEING WORKED OUT IN THREE PLACES — the grid's column header,
 * the accessible name of a grid cell, and now the control on a report. Three copies of one rule
 * about what a reader sees is this repository's recurring defect at its smallest size.
 *
 * The word `Full` is the only word on the axis, per the interaction contract: the phrases live in
 * accessible names and the axis itself has no name on screen.
 */
export function positionLabel(rung: Rung): string {
  return rung === 'full' ? 'Full' : String(positionOf(rung))
}

/**
 * WHAT THE LEVEL CONTROL ON A REPORT READS: `Level 1 … Level 2, Conclusion, Level 4 … Conclusion,
 * Full`. Two positions have a word; the other five are numbered.
 *
 * ONLY FULL AND CONCLUSION ARE WORDS, and every level between them is written `Level n`, because a
 * bare numeral says nothing about what it is a numeral of, and the two lengths a reader reaches for
 * by name are the whole report and its conclusion.
 *
 * `Conclusion` IS THE THIRD POSITION BECAUSE THAT IS WHAT THE THIRD POSITION IS FOR. `RUNG_SPECS`
 * calls the gist *one line, the conclusion where one is written*, so this label is that declaration
 * shortened rather than a second opinion about what the length holds.
 *
 * THE NUMERAL COMES FROM `positionLabel` AND IS NOT COUNTED AGAIN HERE, so the control and the
 * settings grid cannot come to two numbers for one position.
 */
export function levelLabel(rung: Rung): string {
  return A_POSITION_WITH_A_NAME[rung] ?? `Level ${levelValue(rung)}`
}

/**
 * THE TWO POSITIONS A READER REACHES FOR BY NAME. Every other position is a numeral.
 *
 * One table, read by both of the functions below, so the question *which positions are words* has
 * one answer. `positionLabel` already writes `Full` for the last position; this table is about the
 * two levels a person names out loud, and the gist is the one `positionLabel` has no word for.
 */
const A_POSITION_WITH_A_NAME: Readonly<Partial<Record<Rung, string>>> = {
  gist: 'Conclusion',
  full: 'Full',
}

/**
 * WHAT ONE POSITION READS AS WHEN THE WORD `Level` IS ALREADY WRITTEN BESIDE IT: `1 2 Conclusion
 * 4 5 6 Full`.
 *
 * THIS EXISTS BECAUSE A CARD ON A DRAWING NAMES THE AXIS ITSELF. The strip under a focused card
 * writes `Size` and then the size, so it writes `Level` and then the level; putting `levelLabel`
 * there made it read `Level  Level 2`, which is problem `ffKdX7dfulEO`. The strip draws this and
 * everything that has no axis word of its own draws `levelLabel`.
 *
 * The two are the same rule read two ways, not two rules: `levelLabel` is this value with the word
 * in front of it wherever the value is a numeral.
 */
export function levelValue(rung: Rung): string {
  return A_POSITION_WITH_A_NAME[rung] ?? positionLabel(rung)
}

/**
 * WHAT A REPORT OPENS AT WHEN NOBODY HAS SET ANYTHING: the whole report.
 *
 * A REPORT OPENS AT FULL AGAIN, by a message and a decision. This
 * partly reverses the act of 15 September that made a record page open at its summary. A report
 * opened at its conclusion had to be switched to Full by hand, and a reader who wants less can lower the level.
 *
 * IT IS READ BY `rungFor` AND BY NOTHING ELSE, and only where `readerFloorApplies` answers true —
 * the body of a report, and nothing else. It is not in `DETAIL_DEFAULTS`, which is the default of
 * the SURFACE: a module drawn on this same surface keeps the answer of the act of 15 September and opens at its own
 * level-2 line, because the module page shows as it always did. One kind, one
 * value, one reader: declared here so there are not two opinions about where somebody who said nothing lands.
 *
 * A READER WHO WANTS LESS LOWERS THE LEVEL BY HAND, and that choice is kept: every decider a person
 * set still wins, and a stored choice below the floor is still raised to the floor. What changed is
 * where a reader who has set nothing lands — at Full, not at the conclusion.
 */
export const READER_LEVEL_A_REPORT_OPENS_AT = 'full' as const satisfies Rung

/**
 * THE POSITION ONE STEP SHORTER OR ONE STEP LONGER THAN THIS ONE, OR NULL AT THE END OF THE LADDER.
 *
 * NULL IS WHAT DISABLES THE BUTTON, and it is the same answer for both ends, so the control does
 * not carry a rule of its own about where the ladder stops. `RUNGS` is in order, shortest first, so
 * a step is one place along it.
 */
export function stepFrom(rung: Rung, by: 1 | -1): Rung | null {
  return RUNGS[RUNGS.indexOf(rung) + by] ?? null
}

// ============================================================ how low a person reads a report

/**
 * THE THREE POSITIONS A REPORT'S LEVEL CONTROL OFFERS A READER: Conclusion, Level 6, Full.
 *
 * THREE POSITIONS ARE OFFERED: the other levels exist but are not offered to an ordinary
 * reader. So the control offers these three and no other positions.
 *
 * THE WORDS ARE NOT SPELLED HERE A SECOND TIME: the list holds rungs, and a control draws
 * `levelLabel` of each, which answers `Conclusion`, `Level 6` and `Full` under the rule
 * that only Full and Conclusion are words.
 *
 * EVERY OTHER RUNG STAYS IN `RUNGS`, stays storable and stays reachable through the API and for
 * agents — zoom doors, short forms — this list takes nothing out of the ladder: it is the control's
 * offered positions and nothing else.
 *
 * THE RUNGS ARE NAMED BY ID AND NOT BY POSITION so a reorder of the ladder cannot silently move
 * what a reader is offered; `positionOf` below still answers where each one stands.
 */
export const OFFERED_TO_A_READER: readonly Rung[] = ['gist', 'digest', 'full']

/**
 * THE NEAREST POSITION THE REPORT'S CONTROL OFFERS, when the reader's kept choice is no longer one
 * of them.
 *
 * A READER WHO CHOSE LEVEL 4 OR LEVEL 5 BEFORE THE OFFER SHRANK is not moved: the stored choice
 * stands, and the control shows it as the nearest offered position and says so. Nearest is by
 * position on the ladder, the same measure who stands where is counted in.
 *
 * A RUNG ALREADY OFFERED ANSWERS ITSELF, so this is asked only for what the control displays.
 */
export function nearestOffered(rung: Rung): Rung {
  if ((OFFERED_TO_A_READER as readonly string[]).includes(rung)) return rung
  let nearest: Rung | undefined
  for (const one of OFFERED_TO_A_READER) {
    if (
      nearest === undefined ||
      Math.abs(positionOf(one) - positionOf(rung)) < Math.abs(positionOf(nearest) - positionOf(rung))
    ) {
      nearest = one
    }
  }
  if (nearest === undefined) throw new Error('OFFERED_TO_A_READER is empty: no nearest position to show a reader.')
  return nearest
}

/**
 * THE SHORTEST POSITION A PERSON READS A REPORT AT: the conclusion.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS RULE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Levels 1 and 2 were reachable while the ladder was being checked. That checking is over, so a
 * reader stops at the conclusion. Criterion A19 of design/pointing-reopened/ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * It is not a shorter ladder. `RUNGS` still holds all seven, the label is still written and stored,
 * `GET /api/records/:id/short-forms` still serves seven positions, lists and cards and the graph
 * still draw the label and the title, and the settings grid still counts them. The only thing that
 * changes is which positions a person can CHOOSE for the body of a report page.
 *
 * ---------------------------------------------------------------------------------------
 * ONE CONSTANT, THREE USES
 * ---------------------------------------------------------------------------------------
 *
 * The floor is declared once here and three places derive from it: the minus button on the report
 * control is disabled when `readerStepFrom` answers null, the settings grid draws `READER_RUNGS` as
 * the choices on the report content row, and `rungFor` raises a stored choice below the floor back
 * up to it. Three separate opinions about where the floor is would be the defect this repository
 * keeps producing, and a stored `label` would reach the page through whichever of them forgot.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS FOR REPORTS AND FOR NOTHING ELSE
 * ---------------------------------------------------------------------------------------
 *
 * All three of them ask `readerFloorApplies`, further down this file, and that answers on the KIND
 * of record being drawn as well as the surface. A module drawing its curated summary keeps all
 * seven positions. See `FLOORED_KIND`.
 */
export const READER_FLOOR = 'gist' as const satisfies Rung

/** The positions a person can choose for report content, shortest first. Five of the seven. */
export const READER_RUNGS: readonly Rung[] = RUNGS.slice(RUNGS.indexOf(READER_FLOOR))

/** True when a person may choose this position for the body of a report. */
export function isReaderRung(rung: Rung): boolean {
  return positionOf(rung) >= positionOf(READER_FLOOR)
}

/**
 * THIS POSITION AS A READER OF A REPORT GETS IT: anything below the floor reads as the floor.
 *
 * A choice of level 1 or 2 can be stored from before this rule, or set on the settings page for
 * everything and inherited here. Raising it is what stops a reader landing on a position the
 * control cannot leave.
 */
export function asReaderRung(rung: Rung): Rung {
  return isReaderRung(rung) ? rung : READER_FLOOR
}

/**
 * ONE STEP SHORTER OR LONGER FOR A READER OF A REPORT, OR NULL AT EITHER END.
 *
 * The same shape as `stepFrom` and the same rule about null: null is what disables the button. This
 * one walks `READER_RUNGS`, so minus is disabled at the conclusion rather than at the label.
 */
export function readerStepFrom(rung: Rung, by: 1 | -1): Rung | null {
  const from = asReaderRung(rung)
  return READER_RUNGS[READER_RUNGS.indexOf(from) + by] ?? null
}

/**
 * THE ORDER THE LADDER IS WALKED FROM ONE POSITION: the asked rung, then every longer one, then
 * every shorter one.
 *
 * LONGER FIRST, AND THAT IS THE WHOLE ARGUMENT. More information than was asked for is still true;
 * less information is a different claim. A surface that asked for a gist and is handed the title
 * has been told something narrower than it asked for, so the shorter direction is the last resort
 * and the answer always says which way it went.
 */
export function ladderFrom(asked: Rung): readonly Rung[] {
  const here = positionOf(asked)
  const longer = RUNGS.filter((rung) => positionOf(rung) > here)
  const shorter = RUNGS.filter((rung) => positionOf(rung) < here).reverse()
  return [asked, ...longer, ...shorter]
}

// ============================================================================ what a caller supplies

/**
 * WHETHER A STORED SHORT FORM IS STILL CURRENT, in the words this product already uses.
 *
 * THESE THREE WORDS ARE `ShortFormState` FROM `src/server/lib/zoom.ts` WITHOUT `none`. That type
 * cannot be imported here — it lives in the server half, and this file runs in the browser — so the
 * words are written twice. `tests/detail-resolver.test.ts` holds a compile-time assertion that the
 * two agree, so the typecheck fails if either side gains or loses a word.
 *
 * THIS FILE NEVER WORKS THE ANSWER OUT ITSELF, and that is deliberate. Deciding it needs the
 * revision ledger: a short form names the revision it was made from, and that revision may not be
 * in this database at all, which is `cannot_check` and is a different answer from `out_of_date`.
 * Comparing two content hashes here would get `cannot_check` wrong every time, and would be the
 * same fact worked out in two places that can disagree.
 */
export type ShortFormStanding = 'current' | 'out_of_date' | 'cannot_check'

/** The record's own content, and whether anybody has written any of it. */
export interface DetailBody {
  /** The field path the kind declares its body in, such as `data.blocks`. */
  field: string
  /** True when that field holds something. False for the 25 modules with no summary written. */
  written: boolean
}

/**
 * ONE RECORD, AS THE RESOLVER NEEDS TO SEE IT.
 *
 * Every field here is read from storage by the caller. Nothing is computed on the way in and
 * nothing may be shortened on the way in — a caller that trims a title before passing it has moved
 * the cut this file refuses to make.
 */
export interface DetailSource {
  /** The `records.title` column. `NOT NULL`, and non-empty on all 541 live records today. */
  title: string
  /** The `records.summary` column. */
  summary?: string | null
  /** `data.shortForms`, exactly as stored and not yet narrowed. Read with `readStoredShortForms`. */
  shortForms?: unknown
  /**
   * Whether this KIND declares a `shortForms` field at all.
   *
   * It separates two things a screen must not draw the same way: a module that could hold a label
   * and does not (somebody should write one) from a task, which has no place for one at all
   * (nobody should). Today `kinds.ts` declares the field on `module` and `report` only.
   */
  declaresShortForms: boolean
  /**
   * `data.titleDerived` — whether the title column was cut from the record's own prose.
   *
   * Left out means NOBODY RECORDED IT, which is the truth about every one of the 541 live records
   * today, including the 89 session titles that are 60-character machine cuts. It does not mean
   * the title was written by hand.
   */
  titleDerived?: boolean
  /** The kind's declared body field, or absent when the kind has no body. */
  body?: DetailBody | null
  /**
   * What the revision ledger said about each stored short form. See `ShortFormStanding`.
   *
   * A level left out reads `cannot_check`: nobody looked, which is not the same as current.
   */
  standing?: Partial<Record<ShortFormLevel, ShortFormStanding>>
  /**
   * HOW MANY WORDS THE RECORD'S OWN CONTENT IS. `theRecordsOwnWords` below counts it.
   *
   * IT IS WHAT `rungsFor` USES TO STOP THE LADDER, on the owner's rule of 5 September 2026: a
   * record whose own text is already about the length of one level has no levels above that one.
   *
   * ABSENT MEANS NOBODY COUNTED IT, and then `rungsFor` takes no rung away for length. That is the
   * honest answer to a question nobody asked rather than a guess at the record's size, and it is
   * why the field is optional: a caller that builds a source by hand is saying it did not measure.
   * `detailSourceOf` in src/shared/detailsource.ts is the one production builder and it always
   * counts.
   */
  ownWords?: number
}

// ============================================================================ the supply table

/**
 * WHICH STORED FIELD CARRIES WHICH RUNG. One table, and every answer this file gives names a row
 * of it.
 *
 * ONE ROW PER RUNG, AND RUNGS 2 AND 3 HAD TWO EACH UNTIL 3 SEPTEMBER 2026. The stored short form
 * was an override and came first; the column answered where nobody had written one.
 *
 * THE OVERRIDES WENT WITH THE FORMS THEY READ. Since that day level 2 IS the
 * record's own title and level 3 IS its own summary — a title of at most 15 words, a summary of 20–60 words — so there is
 * no separate title form and no separate gist to override anything with. What is stored under
 * those two keys stays on disk and this table no longer names it, which is what makes "nothing
 * draws it" true. Criterion A14b of design/pointing-reopened/ACCEPTANCE.md.
 *
 * WHAT THAT COST, WRITTEN DOWN. Three reports in this corpus store one of the two: `OOOt4Kouc5dT`
 * and `gGJ15W-f4sIY` hold a title form, and `m2Q0CybxoGNF` holds a 29-word gist beside its 36-word
 * summary. All three now read their own columns at those two lengths, and the words they stored
 * are on disk, undrawn, and they are left there.
 *
 * FULL IS NOT IN THIS TABLE: its answer is a field path, not a string, and it is handled on its own
 * below.
 *
 * RUNGS 4, 5 AND 6 ARE NOT IN THIS TABLE EITHER, and that is the whole reason a report falls back
 * to its gist there. Those three lengths are written BY PART — one heading and two texts for each
 * part of the report — and there is no single string to hand a row of a list. So a surface that
 * asks this resolver for one of them is walked to the nearest length that HAS a single string,
 * which is the gist, and the answer says so in `gap` and `drew`. The report page is the one surface
 * that draws the parts themselves, through `reportAt` in ./reportrungs.ts, which reads the stored
 * structure this table cannot describe.
 */
interface Supply {
  rung: ShortFormLevel
  /** Which stored thing this row reads. A surface switches on this. */
  from: 'shortForm' | 'title' | 'summary'
  /** The exact stored path, for a proof and for a person reading an answer. */
  field: string
  /** True when this row can only exist on a kind that declares `shortForms`. */
  needsShortForms: boolean
}

const SUPPLY: readonly Supply[] = [
  { rung: 'label', from: 'shortForm', field: 'data.shortForms.label', needsShortForms: true },
  { rung: 'title', from: 'title', field: 'title', needsShortForms: false },
  { rung: 'gist', from: 'summary', field: 'summary', needsShortForms: false },
]

/** The supply rows for one rung, in the order they are tried. */
function supplyFor(rung: ShortFormLevel): readonly Supply[] {
  return SUPPLY.filter((row) => row.rung === rung)
}

// ============================================================================ the answer

/**
 * WHETHER ANYBODY WROTE THESE WORDS AT THIS LENGTH.
 *
 *   `atThisLength`  somebody wrote them for this job. The write route refuses a cut, and the two
 *                   columns are what a person typed.
 *   `cutFromBody`   Mole Office made them by cutting the record's own prose, and the record says so.
 *   `unrecorded`    nobody recorded which of the two it is. True of all 541 titles today.
 *
 * `unrecorded` IS NOT `atThisLength`. Eighty-nine session titles are 60-character machine cuts and
 * two annotation titles are written by `annotationTitle`; none of them carries a flag saying so,
 * and a 60-character title ending mid-word is not reliably distinguishable from one somebody wrote.
 * Mole Office does not guess which, so it says nobody recorded it.
 */
export type WrittenHow = 'atThisLength' | 'cutFromBody' | 'unrecorded'

/** Whether the drawn words fit the slot the asked rung sizes. */
export type Fit = 'inBudget' | 'overBudget'

/**
 * WHY THE ASKED RUNG DID NOT ANSWER, or that it did.
 *
 *   `none`           the asked rung answered.
 *   `unwritten`      this kind has a place for the asked rung and nobody has filled it.
 *   `notOnThisKind`  this kind has no place for the asked rung, so nobody should fill it.
 */
export type DetailGap = 'none' | 'unwritten' | 'notOnThisKind'

/** Words read out of a stored field. */
export interface DetailText {
  kind: 'text'
  /** The stored characters, byte for byte. Never cut, never joined, never generated. */
  text: string
  asked: Rung
  /** The rung the words actually came from. */
  drew: Rung
  from: 'shortForm' | 'title' | 'summary'
  /** The exact stored path the characters came from, such as `data.shortForms.gist`. */
  field: string
  gap: DetailGap
  written: WrittenHow
  /** Only meaningful when `from` is `shortForm`. The two columns are the record, so they are current. */
  standing: ShortFormStanding
  /**
   * WHICH AGENT OR PERSON WROTE THESE WORDS, by actor id, or null where nobody recorded one.
   *
   * Null for the `title` and `summary` columns, which carry no writer of their own, and null on
   * every stored short form written before 2 September 2026. It is never derived from anything.
   */
  by: string | null
  fit: Fit
}

/** The record's own content. Not characters: the caller renders the field named here. */
export interface DetailBodyAnswer {
  kind: 'body'
  field: string
  asked: Rung
  drew: 'full'
  /**
   * Why the asked rung did not answer, exactly as on a text answer.
   *
   * `unwritten` when the whole thing was asked for and the kind declares a body nobody has written
   * — 25 of 27 modules. `notOnThisKind` is reachable too: a shorter rung was asked for, this kind
   * has no place for that rung, and the body answered instead.
   */
  gap: DetailGap
}

/**
 * NOTHING IS STORED AT ANY RUNG.
 *
 * Reachable only when the title column is blank, which is 0 of 541 live records — the column is
 * `NOT NULL` and this corpus has no empty one. It exists because the function must be total, and
 * the alternative is returning an empty string dressed as a short form, which draws as a gap that
 * reads as a missing value. It is not a fallback path: nothing recovers here, the caller is told.
 */
export interface DetailNothing {
  kind: 'nothing'
  asked: Rung
  why: 'theTitleColumnIsBlank'
}

export type DetailAnswer = DetailText | DetailBodyAnswer | DetailNothing

// ============================================================================ the resolver

/** What one rung has, if anything. */
interface Found {
  text: string
  from: 'shortForm' | 'title' | 'summary'
  field: string
  written: WrittenHow
  standing: ShortFormStanding
  by: string | null
}

/**
 * Whether this kind has a place for this rung at all.
 *
 * THE THREE BY-PART RUNGS NEED BLOCKS, not just a place for short forms. A part carries the ids of
 * the blocks it covers, so a kind with no blocks has nothing for a part to cover and no place for
 * levels 4, 5 and 6. That used to read `source.declaresShortForms` alone, which gave the same answer
 * only because the two kinds that declared short forms were the two kinds that held blocks. Since 5
 * September 2026 every kind declares short forms, so the two questions have come apart and this
 * asks the one it means. `kindHoldsPartsLevels` in ./kinds.ts is the same question asked of a kind
 * rather than of a record, and it reads the declared shape rather than a list of kind names.
 */
function holds(source: DetailSource, rung: Rung): boolean {
  const hasABody = source.body !== undefined && source.body !== null
  if (rung === 'full') return hasABody
  if (rung === 'title') return true
  if (rung === 'gist') return true // the summary column is on every record
  if (isByPartLevel(rung)) return source.declaresShortForms && hasABody
  return source.declaresShortForms
}

// ============================================================ the record's own words

/**
 * THE RECORD'S OWN WORDS: the text every written level is a shorter form of, and where it is stored.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ONE FUNCTION
 * ---------------------------------------------------------------------------------------
 *
 * Two rules need it and they must agree about what "the record itself" is. The write door refuses a
 * level that copies the record's opening words, and it refuses a level longer than the record. If
 * the door and the page each decided which field is the record's own words, one could refuse a
 * label for copying a title the other never compared it against.
 */
export interface TheRecordsOwnWords {
  /** The words, exactly as stored. A record's blocks are joined the way `proseOfBlocks` joins them. */
  text: string
  /** Where they are: the kind's blocks field, `summary`, or `title`. A refusal names this. */
  field: string
  /** How many words that is, counted the way every budget on this ladder is counted. */
  words: number
}

/**
 * WHICH TEXT A RECORD'S OWN WORDS ARE, decided once.
 *
 * THE ORDER IS THE LADDER READ FROM THE TOP. A record's own content is rung 7 where it has one —
 * a report's blocks, a module's curated summary. A kind that holds no blocks has no rung 7, and
 * then the longest thing the record itself holds is its `summary` column, which is rung 3. Where
 * nobody wrote a summary either, it is the `title` column, which is rung 2 and is `NOT NULL` on
 * every record, so this always has an answer.
 *
 * A DECLARED BUT EMPTY BODY FALLS THROUGH TO THE COLUMNS. Twenty-five of twenty-seven modules have
 * no curated summary written, and the words such a record holds are the words in its two columns.
 * Answering "the body, which is empty" would say a module with a written title holds no words.
 */
export function theRecordsOwnWords(record: {
  /** The record's blocks as one piece of prose, or null on a kind that holds none. */
  body: { field: string; prose: string } | null
  summary: string | null
  title: string
}): TheRecordsOwnWords {
  const body = record.body
  if (body !== null && body.prose.trim() !== '') {
    return { text: body.prose, field: body.field, words: countWords(body.prose) }
  }
  const summary = record.summary
  if (typeof summary === 'string' && summary.trim() !== '') {
    return { text: summary, field: 'summary', words: countWords(summary) }
  }
  return { text: record.title, field: 'title', words: countWords(record.title) }
}

/**
 * THE SHORTEST RUNG A RECORD'S LADDER MAY STOP AT: the conclusion, level 3.
 *
 * Levels 1, 2 and 3 are not shorter forms written beside the record. Level 2 IS its own `title`
 * column, level 3 IS its own `summary`, and level 1 is the name it is listed under — the record
 * holds all three whatever its size, so taking one away for length would say a record does not hold
 * words it does hold. The rule is that no level says MORE than the record; a column of the record
 * cannot.
 *
 * IT IS THE SAME RUNG AS `READER_FLOOR` AND IT IS NOT THE SAME RULE. That one is how low a PERSON
 * reads a report, which the owner set and could move. This is where the ladder itself stops having
 * anything to take away. Written as one constant, moving the owner's reading floor would silently change
 * which rungs a short record has.
 */
const SHORTEST_A_LADDER_STOPS_AT = 'gist' as const satisfies Rung

/**
 * THE RUNGS THIS RECORD ACTUALLY HAS, shortest first. The one place a record's ladder is listed.
 *
 * ---------------------------------------------------------------------------------------
 * TWO THINGS TAKE A RUNG AWAY, AND THEY ARE DIFFERENT THINGS
 * ---------------------------------------------------------------------------------------
 *
 * THIS KIND HAS NO PLACE FOR IT. A task holds no blocks, so it has no levels 4 to 6 and no Full.
 * That is `holds` above and it is a fact about the kind.
 *
 * THE RECORD IS ALREADY THAT SHORT. Every kind may have reading levels, but none of them may say
 * more than the record, so a record
 * whose own text is already about level-6 length has no Full above it. A level above the record's
 * own length is a level that would have to say MORE than the record to fill it, and there is
 * nothing more to say.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE LADDER STOPS, EXACTLY
 * ---------------------------------------------------------------------------------------
 *
 * At the first rung whose budget reaches the record's own length. That rung is kept — it is the
 * one the whole record fits in — and everything above it is dropped. Full has no budget and is
 * above everything, so a record shorter than the longest written length has no Full.
 *
 * THE BUDGET COMPARED IS THE RUNG'S OWN MAXIMUM, in words, which is what the budgets are counted
 * in. At levels 4 to 6 that maximum is ONE PART'S worth, which is the right number here: the
 * question is whether there is anything left for a further level to say, and a report shorter than
 * one part's budget has nothing left at any of them.
 *
 * ---------------------------------------------------------------------------------------
 * FULL IS THE RECORD ITSELF, SO IT GOES ONLY WHEN SOMETHING BELOW IT CAN DRAW THE RECORD
 * ---------------------------------------------------------------------------------------
 *
 * A record already about level-6 length has no Full above it, because level 6 is then the whole
 * thing and Full would repeat it.
 *
 * THAT ONLY HOLDS WHERE LEVEL 6 IS WRITTEN. Levels 4 to 6 are the record's own parts and are the
 * only shorter forms that stand in for a whole document — levels 1 to 3 are one line and cannot.
 * A short report whose parts nobody has written, offered nothing above the conclusion, would have
 * only rungs with nothing in them: its blocks, its charts and its tables would be drawn nowhere.
 * So Full is taken away only when the rung the ladder now stops at is one written by part AND
 * somebody has written it. Otherwise Full stays, and it is the rung that draws the record.
 *
 * ---------------------------------------------------------------------------------------
 * LEVELS 2 AND 3 ARE NEVER DROPPED FOR LENGTH, AND THAT IS NOT AN EXCEPTION TO THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * They are not shorter forms written beside the record. Level 2 IS the record's own `title` column
 * and level 3 IS its own `summary`, so dropping one would say a record does not hold words it does
 * hold. The rule is that no level says MORE than the record; a column of the record cannot.
 *
 * `ownWords` ABSENT MEANS NOBODY COUNTED, and then nothing is dropped for length. See the field.
 */
export function rungsFor(source: DetailSource): readonly Rung[] {
  const here = RUNGS.filter((rung) => holds(source, rung))
  const ownWords = source.ownWords
  if (ownWords === undefined) return here
  // THE FIRST RUNG WHOSE BUDGET REACHES THE RECORD'S OWN LENGTH. Walked shortest first, so this is
  // the shortest length the whole record fits in. Undefined when the record is longer than every
  // budget on the ladder, and then the ladder is whole.
  const reached = here.find((rung) => {
    const budget = RUNG_SPECS[rung].words
    return budget !== null && budget.max >= ownWords
  })
  if (reached === undefined) return here
  const last = Math.max(positionOf(reached), positionOf(SHORTEST_A_LADDER_STOPS_AT))
  const kept = here.filter((rung) => positionOf(rung) <= last)
  // FULL IS THE RECORD ITSELF. See the note above: it is taken away only where the rung the ladder
  // now stops at is one written by part and somebody has written those parts, so a reader always
  // has one rung that can draw the whole record.
  const top = kept[kept.length - 1]
  const partsWritten = readStoredParts(source.shortForms) !== null
  if (top !== undefined && isByPartLevel(top) && partsWritten) return kept
  return here.includes('full') ? [...kept, 'full'] : kept
}

/**
 * WHY A RECORD HAS NOT GOT ONE POSITION OF THE LADDER. THREE ANSWERS, AND THEY ARE THREE FACTS.
 *
 *   `noPlace`     this KIND has no place for it. A task holds no blocks, so a part of one would
 *                 have nothing to cover, and it has no levels 4, 5 or 6. Nobody should write one.
 *   `tooShort`    the RECORD is already that short. A level above the record's own length would
 *                 have to say more than the record to fill it. Writing one changes nothing.
 *   `notWritten`  the kind has a place and the record has room, and nobody has written it. This is
 *                 the one a reader can act on.
 *
 * THEY WERE ONE ANSWER AND A CARD SAID THE WRONG ONE. `levelsOf` in the drawing intersected two
 * lists and kept neither reason, so a record whose parts ARE stored but which is shorter than they
 * are was told *nobody has written this record by part*. A reader who believes that goes and writes
 * it, and the card still will not draw it. That is a plausible reason given for something whose
 * real reason is different, which is the fifth engineering rule of this repository.
 */
export type LevelAbsence = 'noPlace' | 'tooShort' | 'notWritten'

/**
 * WHY THIS RECORD HAS NOT GOT EACH OF THE LEVELS IT HAS NOT GOT. A level it HAS is not in the map.
 *
 * IT ASKS THE SAME TWO THINGS THE LADDER IS BUILT FROM, in their order: `holds` is the kind's place
 * for a level, and `rungsFor` is what the record's own length leaves. So this cannot disagree with
 * `rungsFor` about which levels exist — it is `rungsFor`, asked why.
 *
 * `written` IS THE CALLER'S. Which levels somebody wrote is `formsWrittenIn` in ./reportrungs.ts,
 * which imports this file, and every caller of this has already asked it.
 */
export function whyEachLevelIsMissing(
  source: DetailSource,
  written: ReadonlySet<Rung>,
): Readonly<Partial<Record<Rung, LevelAbsence>>> {
  const roomFor = rungsFor(source)
  const out: Partial<Record<Rung, LevelAbsence>> = {}
  for (const rung of RUNGS) {
    if (!holds(source, rung)) out[rung] = 'noPlace'
    else if (!roomFor.includes(rung)) out[rung] = 'tooShort'
    else if (!written.has(rung)) out[rung] = 'notWritten'
  }
  return out
}

/**
 * THE RUNGS A READER OF THIS RECORD MAY STAND ON, ON THIS SURFACE.
 *
 * THREE THINGS NARROW THE SEVEN AND THEY ARE ALL ASKED HERE, so a control does not carry any of
 * them itself: what this record HAS (`rungsFor`), how low a PERSON reads a report
 * (`readerFloorApplies`, which is the owner's rule and applies to reports only), and which of the
 * levels this record has words for (`written`, which the caller read with `formsWrittenIn` in
 * ./reportrungs.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHY "HAS ANYBODY WRITTEN THIS ONE" IS ASKED HERE AND NOT IN `rungsFor`
 * ---------------------------------------------------------------------------------------
 *
 * `rungsFor` answers WHICH POSITIONS EXIST for a record. The drawing, the bundle, the short-form
 * doors and `continuation.ts` all ask it that, and its answer has to keep saying a report has
 * levels 4 to 6 even where nobody wrote the parts, because a position that exists is a place the
 * write door will accept words for. "Has anybody written this one" is a different question, and the
 * reader's control is the only place the person's act is about. A REPORT ADVERTISES THE LEVELS IT HAS WORDS FOR, by
 * the owner's act of 15 September 2026, criterion A14a as amended the same day: the control does not offer a position
 * nobody wrote, and no agent backfills a paraphrase to fill it. So
 * the narrowing lives here, where the reader's control asks, and `rungsFor` goes on answering what exists.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE THAT ARE NEVER NARROWED AWAY
 * ---------------------------------------------------------------------------------------
 *
 * LEVELS 2 AND 3 ARE THE RECORD'S OWN TITLE AND SUMMARY, for the reason `rungsFor` never drops
 * them: a record with a title has words at that position, and level 3 is where a report with no
 * summary says so in the words this criterion leaves it. FULL IS THE RECORD ITSELF, so there is no
 * shorter form of it to be missing.
 *
 * ---------------------------------------------------------------------------------------
 * IT APPLIES TO A REPORT
 * ---------------------------------------------------------------------------------------
 *
 * The person's act 3b names a report, and the floor it sits beside is for a report too. A module drawn on
 * this same surface is not floored and keeps every position it has, so a module still says at a
 * level nobody wrote what A14a always said. That is measured and reported; moving the narrowing
 * onto a module is theirs, and it is not an agent's to do.
 */
export function readerRungsFor(
  source: DetailSource,
  surface: DetailSurface,
  kind: string | null,
  written: ReadonlySet<Rung>,
): readonly Rung[] {
  const here = rungsFor(source)
  if (!readerFloorApplies(surface, kind)) return here
  const why = whyEachLevelIsMissing(source, written)
  return here.filter((rung) => {
    if (!isReaderRung(rung)) return false
    if (rung === 'title' || rung === 'gist' || rung === 'full') return true
    return why[rung] !== 'notWritten'
  })
}

/**
 * ONE STEP SHORTER OR LONGER WITHIN A LIST OF RUNGS, or null at either end of it.
 *
 * NULL IS WHAT DISABLES THE BUTTON, exactly as in `stepFrom`, so a control does not carry a rule of
 * its own about where the ladder stops.
 *
 * A RUNG THAT IS NOT IN THE LIST IS ANSWERED FROM THE NEAREST ONE BELOW IT, and never with null in
 * both directions. A reader standing at Full when the record shrinks below it is standing on a rung
 * the record no longer has; disabling both buttons would leave them there with no way out.
 */
export function stepWithin(rungs: readonly Rung[], rung: Rung, by: 1 | -1): Rung | null {
  if (rungs.length === 0) return null
  const at = rungs.indexOf(rung)
  if (at >= 0) return rungs[at + by] ?? null
  // The longest rung in the list that is not longer than the one asked about, or the shortest of
  // all when every rung in the list is longer.
  const below = rungs.filter((one) => positionOf(one) < positionOf(rung))
  const from = below.length === 0 ? 0 : rungs.indexOf(below[below.length - 1] as Rung)
  return rungs[from + (by === 1 ? 0 : by)] ?? null
}

/** How the title column came to say what it says. */
function howTheTitleWasWritten(source: DetailSource): WrittenHow {
  if (source.titleDerived === true) return 'cutFromBody'
  if (source.titleDerived === false) return 'atThisLength'
  return 'unrecorded'
}

/** The words at one rung, or null when that rung has none. */
function foundAt(source: DetailSource, stored: StoredShortForms, rung: ShortFormLevel): Found | null {
  for (const row of supplyFor(rung)) {
    if (row.needsShortForms && !source.declaresShortForms) continue
    if (row.from === 'shortForm') {
      const form = stored[rung]
      if (form === undefined || form.text.trim() === '') continue
      return {
        text: form.text,
        from: 'shortForm',
        field: row.field,
        written: 'atThisLength',
        standing: source.standing?.[rung] ?? 'cannot_check',
        // WHICH AGENT OR PERSON WROTE THIS LENGTH, where the stored form carries it. Null on every
        // form written before 2 September 2026, and nothing is filled in for those.
        by: form.by ?? null,
      }
    }
    if (row.from === 'title') {
      if (source.title.trim() === '') continue
      return {
        text: source.title,
        from: 'title',
        field: row.field,
        written: howTheTitleWasWritten(source),
        standing: 'current',
        // THE TITLE COLUMN CARRIES NO WRITER. Who typed a record's title is in the revision ledger
        // and is a different question from who wrote a short form; naming one from the other would
        // be an answer nobody recorded.
        by: null,
      }
    }
    const summary = source.summary
    if (typeof summary !== 'string' || summary.trim() === '') continue
    // THE SUMMARY COLUMN CARRIES NO WRITER EITHER, for the reason the title column does not.
    return { text: summary, from: 'summary', field: row.field, written: 'atThisLength', standing: 'current', by: null }
  }
  return null
}

/** Whether these words fit the slot the asked rung sizes. `full` has no budget, so nothing is over. */
function fitAt(asked: Rung, text: string): Fit {
  // THE BUDGET IS READ OFF THE RUNG, WHICH IS WHERE THE BY-PART LENGTHS HAVE ONE TOO. At levels 4
  // to 6 the number is one part's budget rather than the whole form's, and that is the right number
  // for this question: what this asks is whether the ONE string a list row is about to draw fits
  // the slot, and at those lengths a row's slot is one part's worth.
  const budget = RUNG_SPECS[asked].words
  if (budget === null) return 'inBudget'
  // THE SAME COUNT THE WRITE DOOR'S CEILING USES, or a Chinese label it accepted would never be drawn.
  if (wordsAgainstACeiling(text) > budget.max) return 'overBudget'
  if (text.trim().length > budget.max * CHARACTERS_PER_WORD) return 'overBudget'
  return 'inBudget'
}

/**
 * WHICH STORED WORDS A SURFACE DRAWS WHEN IT ASKED FOR ONE RUNG'S WORTH.
 *
 * It walks the asked rung, then every longer one, then every shorter one, and returns the first
 * that has something. Because `records.title` is rung 2 and the column is `NOT NULL`, the walk
 * always finds something, so no list row can ever read "nobody has written one".
 *
 * IT RETURNS STORED CHARACTERS OR A FIELD NAME, AND NOTHING ELSE. It does not cut, pad, join,
 * capitalise, translate or summarise. `field` on the answer names exactly where the characters came
 * from, and the test suite byte-compares them against that field.
 *
 * ASKING FOR `full` ON A KIND WITH A BODY ALWAYS ANSWERS WITH THAT BODY, written or not. A surface
 * asking for the whole thing is not served by a shorter form of it: handing a 20-word gist to a
 * report page and letting it draw as the report is the silent substitution this product bans.
 * Where a body is declared and empty, the answer says `unwritten` and the surface says so.
 */
export function detailOf(source: DetailSource, asked: Rung): DetailAnswer {
  const stored = readStoredShortForms(source.shortForms)
  const body = source.body

  if (asked === 'full' && body !== undefined && body !== null) {
    return { kind: 'body', field: body.field, asked, drew: 'full', gap: body.written ? 'none' : 'unwritten' }
  }

  for (const rung of ladderFrom(asked)) {
    if (rung === 'full') {
      if (body === undefined || body === null || !body.written) continue
      return { kind: 'body', field: body.field, asked, drew: 'full', gap: gapFor(source, asked) }
    }
    // THE THREE BY-PART LENGTHS SUPPLY NO SINGLE STRING, SO THE WALK STEPS OVER THEM. They are a
    // list of parts, and a row of a list has room for one string. A surface that asked for one of
    // them is answered from the nearest length that has one — the gist — and `drew` and `gap` on
    // the answer say that is what happened. The report page is the surface that draws the parts,
    // through `reportAt` in ./reportrungs.ts.
    if (isByPartLevel(rung)) continue
    const found = foundAt(source, stored, rung)
    if (found === null) continue
    return {
      kind: 'text',
      text: found.text,
      asked,
      drew: rung,
      from: found.from,
      field: found.field,
      gap: rung === asked ? 'none' : gapFor(source, asked),
      written: found.written,
      standing: found.standing,
      by: found.by,
      fit: fitAt(asked, found.text),
    }
  }

  return { kind: 'nothing', asked, why: 'theTitleColumnIsBlank' }
}

/** Why the asked rung did not answer: nobody wrote one, or this kind has no place for one. */
function gapFor(source: DetailSource, asked: Rung): 'unwritten' | 'notOnThisKind' {
  return holds(source, asked) ? 'unwritten' : 'notOnThisKind'
}

// ============================================================================ the ten surfaces

/**
 * THE TEN SURFACES THAT HAVE A DETAIL SETTING OF THEIR OWN.
 *
 * THESE ARE NOT `uiSurface` IDS AND THE TWO VOCABULARIES DO NOT MERGE. The `uiSurface` registry is
 * per control — `rail.modules`, `composer.intent` — because a person right-clicks a control. These
 * ten are per rendering surface, because a person sets how much a whole list says, not how much one
 * row of it says. The map between them is one optional `detail` field on each registry entry, owned
 * by `src/shared/surfaces.ts`, and a test there asserts every surface below is claimed by at least
 * one registry id and every id resolves to at most one of these.
 */
export type DetailSurface =
  | 'home'
  | 'review'
  | 'composer'
  | 'recipients'
  | 'messages'
  | 'reportIndex'
  | 'reportContent'
  | 'moduleCards'
  | 'graph'
  | 'tables'

/**
 * How much each surface says when nobody has said otherwise.
 *
 * `reportContent` READS LEVEL 2, THE AUTHORED SUMMARY LINE, since
 * 15 September 2026: this is the default of the
 * SURFACE, and a module drawn on it still opens at it, because the
 * module page shows as it always did. A REPORT drawn on this surface opens
 * at `READER_LEVEL_A_REPORT_OPENS_AT` instead, applied
 * in `rungFor` where `readerFloorApplies` answers true and the decider is the code default; before
 * that day a report opened at Full, from 15 September at its summary raised to the conclusion by
 * the floor, and now at Full again. Messages and tasks draw no ladder at all — only
 * `module` and `report` declare a block field — so this default never reaches them.
 *
 * `composer` is a label because it names what you are talking about in a line that already holds
 * other words.
 */
export const DETAIL_DEFAULTS = {
  home: 'gist',
  review: 'title',
  composer: 'label',
  recipients: 'title',
  messages: 'gist',
  reportIndex: 'title',
  reportContent: 'title',
  moduleCards: 'gist',
  graph: 'title',
  tables: 'title',
} as const satisfies Record<DetailSurface, Rung>

/** The ten, in a fixed order, so every list built from them reads the same way twice. */
export const DETAIL_SURFACES = Object.keys(DETAIL_DEFAULTS) as readonly DetailSurface[]

/** What a row of the Settings grid is: one of the ten, or the row above them all. */
export type DetailRow = DetailSurface | 'everywhere'

/** The rows, in the order the grid draws them: the inherited-from row first. */
export const DETAIL_ROWS: readonly DetailRow[] = ['everywhere', ...DETAIL_SURFACES]

/**
 * THE ONE SURFACE THE READER FLOOR GOVERNS: the body of a report page.
 *
 * `READER_FLOOR` above says a person reads a report no lower than the conclusion. This says where
 * that rule applies. It is one surface, named rather than listed, because there is one: the other
 * nine are rows of lists, cards and graph nodes, and a label is what those are for.
 */
export const FLOORED_SURFACE = 'reportContent' as const satisfies DetailSurface

/**
 * THE ONE KIND OF RECORD THE READER FLOOR GOVERNS: a report.
 *
 * The limit is for reports only, because only a report is adjusted level by level by hand.
 * The floor is there because a report is the thing with a level
 * control on it, so it is a rule about reports and not about the surface that happens to draw them.
 * Criterion A19 of design/pointing-reopened/ACCEPTANCE.md.
 *
 * TWO KINDS OF RECORD HOLD BLOCKS: a report in `blocks` and a module in `summaryBlocks`, and both
 * are drawn by the same component through the same `reportContent` surface. Before this the floor
 * was asked of the surface alone, so a module's curated summary would have been floored as well —
 * it has no report in it and no reason to stop at a conclusion. Nothing in the corpus draws one at
 * a reading length today, which is why nobody saw it. Problem found by Verifier 5; proposal
 * `hHhzZVOvqGOh` carries the decision.
 */
export const FLOORED_KIND = 'report'

/**
 * DOES THE READER FLOOR APPLY TO WHAT IS BEING DRAWN? The body of a report, and nothing else.
 *
 * THIS IS THE ONE PLACE THAT ANSWERS IT. The minus button on the report control, `rungFor`'s
 * raising of a stored choice, and the shut cells on the settings grid all ask here, each with the
 * kind it is drawing. A second opinion in any of them is the defect this repository keeps
 * producing: change the rule in one place and the other two go on flooring what they always did.
 *
 * `kind` IS NULL WHERE THERE IS NO ONE RECORD BEING DRAWN — a list, a card, a graph node, the
 * settings grid resolving a row. Null is not a report, so the floor does not apply, which is the
 * same answer those surfaces got before this rule existed.
 */
export function readerFloorApplies(surface: DetailSurface, kind: string | null): boolean {
  return surface === FLOORED_SURFACE && kind === FLOORED_KIND
}

/** True when this word names one of the ten. Used on values read back out of storage. */
export function isDetailSurface(word: unknown): word is DetailSurface {
  return typeof word === 'string' && (DETAIL_SURFACES as readonly string[]).includes(word)
}

// ============================================================================ precedence

/** Which of the five things decided how much a surface says. */
export type DetailDecider = 'here' | 'thisSurface' | 'everywhere' | 'recommended' | 'default'

/**
 * THE FIVE THINGS THAT CAN DECIDE, STRONGEST FIRST. One array, walked by one function.
 *
 * A person's setting beats what a record asks for BY ITS POSITION IN THIS ARRAY, not by a check
 * somewhere that somebody can forget to write. That is the whole mechanism.
 *
 * THIS ARRAY IS THE SEAM FOR A LAYER THAT LEARNS, AND NOTHING HERE LEARNS. If Mole Office ever works out
 * what a person tends to choose, it becomes one more entry, placed below their explicit settings
 * and above the code default, and `why` says so on screen. No empty slot is left for it: an unused
 * entry is a second state somebody can be wrong about.
 */
export interface DeciderSpec {
  decider: DetailDecider
  /** Why this is the answer, in words a person can read. Lower case: it is composed into a line. */
  why: string
  /** Where the value is kept, for the one place that reads it. */
  where: string
}

/**
 * The last entry, named on its own because `rungFor` returns it when nothing else answered and the
 * reason a person reads must be the same string in both places.
 */
const THE_DEFAULT: DeciderSpec = {
  decider: 'default',
  why: "Mole Office's setting for this surface",
  where: 'DETAIL_DEFAULTS in src/shared/detail.ts',
}

export const DETAIL_PRECEDENCE: readonly DeciderSpec[] = [
  { decider: 'here', why: 'you set this here, for this visit', where: 'sessionStorage mole-office.detail.local.<surface>' },
  { decider: 'thisSurface', why: 'your setting for this surface', where: 'localStorage mole-office.detail.<surface>' },
  { decider: 'everywhere', why: 'your setting for everything', where: 'localStorage mole-office.detail' },
  {
    decider: 'recommended',
    why: 'the thing being read asks to be read this way',
    where: 'the record: presentation_intent.detail',
  },
  THE_DEFAULT,
]

/** Where the person's global choice is kept. One spelling, read by one place. */
export const DETAIL_KEY_EVERYWHERE = 'mole-office.detail'

/** Where the person's choice for one surface is kept. */
export function detailKeyForSurface(surface: DetailSurface): string {
  return `${DETAIL_KEY_EVERYWHERE}.${surface}`
}

/** Where a choice made for this visit only is kept. */
export function detailKeyForHere(surface: DetailSurface): string {
  return `${DETAIL_KEY_EVERYWHERE}.local.${surface}`
}

/**
 * What the caller read out of storage, unchecked.
 *
 * All three are `unknown` because they came out of `sessionStorage` or `localStorage`, where
 * anything can be. A value that is not a rung is skipped and the next decider answers — the array
 * is what decides, so an unreadable setting is simply not a setting.
 */
export interface DetailChoices {
  /** `sessionStorage[detailKeyForHere(surface)]`, for this surface. */
  here?: unknown
  /** `localStorage[detailKeyForSurface(surface)]`, for this surface. */
  thisSurface?: unknown
  /** `localStorage[DETAIL_KEY_EVERYWHERE]`. */
  everywhere?: unknown
}

/** How much a surface should say, and what decided it. */
export interface RungChoice {
  rung: Rung
  decider: DetailDecider
  /** The plain phrase from `DETAIL_PRECEDENCE`, so the reason on screen and the reason here agree. */
  why: string
}

/**
 * HOW MUCH THIS SURFACE SHOULD SAY.
 *
 * It walks `DETAIL_PRECEDENCE` and returns the first decider that names a real rung. The code
 * default is last and always answers, so this function cannot fail.
 *
 * `recommended` is what the thing being read asked for — `presentation_intent.detail`, which today
 * only graph nodes carry. It loses to every setting a person made, which is the point of it being
 * fourth.
 *
 * `kind` IS THE KIND OF RECORD BEING DRAWN, AND IT IS ASKED FOR RATHER THAN GUESSED. Only a report
 * has the reader floor, so this function cannot answer without being told what it is drawing. Every
 * caller says: `null` where a surface draws no one record, which is nine of the ten surfaces.
 */
export function rungFor(
  surface: DetailSurface,
  kind: string | null,
  recommended?: unknown,
  choices?: DetailChoices,
): RungChoice {
  const chosen = readWithPrecedence(
    {
      here: choices?.here,
      thisSurface: choices?.thisSurface,
      everywhere: choices?.everywhere,
      recommended,
    },
    isRung,
    DETAIL_DEFAULTS[surface],
  )
  // A REPORT PAGE IS READ NO LOWER THAN THE CONCLUSION, and this is where that is applied rather
  // than in the control, so a choice stored before the rule — or set for everything and inherited
  // here — cannot land a reader on a position the minus button will not leave. Criterion A19.
  //
  // A REPORT OPENS AT FULL AGAIN. So where NOBODY has set
  // anything — the decider is the code default — a floored answer is
  // THE_LEVEL_A_REPORT_OPENS_AT and not the floor. Every decider a person set still applies, raised
  // to the floor exactly as before: a reader who wants less lowers the level by hand and that choice
  // is kept. `asReaderRung` changes nothing at the positions a reader can choose. The decider and
  // its reason are the ones that answered: raising a choice to the floor does not make Mole Office's
  // default the thing that decided it. Criterion A19.
  //
  // IT ASKS THE KIND AND NOT THE SURFACE ALONE. A module's curated summary is drawn on this same
  // surface and is not floored, and a decision says the module page shows as it always did, so this changes nothing for
  // a module: it still opens at its own level-2 line. `readerFloorApplies` is the one place
  // that decides, and the control and the settings grid ask it too.
  const rung = readerFloorApplies(surface, kind)
    ? chosen.decider === 'default'
      ? READER_LEVEL_A_REPORT_OPENS_AT
      : asReaderRung(chosen.value)
    : chosen.value
  return { rung, decider: chosen.decider, why: chosen.why }
}

// ====================================================== the precedence rule, written once

/**
 * WHAT A PRECEDENCE WALK ANSWERS: the value, which of the deciders gave it, and why in words.
 *
 * The same three things for every dimension, because they are what a person is owed when Mole Office
 * shows them a setting it worked out rather than one they typed.
 */
export interface Chosen<T> {
  value: T
  decider: DetailDecider
  why: string
}

/**
 * WHAT EACH DECIDER OFFERED, UNCHECKED, FOR ONE DIMENSION.
 *
 * Every field is `unknown` because every one of them came out of `sessionStorage`,
 * `localStorage`, or a stored record — places where anything can be. A value the dimension does
 * not recognise is SKIPPED and the next decider answers, which is the honest reading: an
 * unreadable setting is not a setting.
 *
 * A DIMENSION LEAVES OUT THE DECIDERS IT DOES NOT HAVE, and that is how a shorter chain is said.
 * Text size offers no `recommended`, so nothing a record stores can move it. That is not a check
 * somewhere that somebody can forget to write; there is no value for the walk to find.
 */
export type Offered = Partial<Record<DetailDecider, unknown>>

/**
 * THE PRECEDENCE RULE, WRITTEN ONCE AND READ BY EVERY DIMENSION.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FUNCTION EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Three dimensions decide how a report is drawn: how much it says, whether its pictures are drawn,
 * and how large the type is. All three answer the same question — "you set this here, then your
 * setting for this surface, then your setting for everything, then what the record asks for, then
 * Mole Office's own" — and all three MUST answer it the same way, or a reader's setting would outrank a
 * record on one dimension and lose to it on another with nothing saying which.
 *
 * Written three times, the three could drift and nothing would fail. So it is written here, once,
 * and each dimension brings its own vocabulary: its own check on a value, and its own default.
 * `DETAIL_PRECEDENCE` is the single array all three walk.
 *
 * IT CANNOT FAIL. The last entry of the array is the code default, and the caller hands one in
 * that is already the dimension's own type, so there is always an answer.
 */
export function readWithPrecedence<T>(
  offered: Offered,
  accepts: (value: unknown) => value is T,
  fallback: T,
): Chosen<T> {
  for (const spec of DETAIL_PRECEDENCE) {
    if (spec.decider === THE_DEFAULT.decider) break
    const value = offered[spec.decider]
    if (!accepts(value)) continue
    return { value, decider: spec.decider, why: spec.why }
  }
  return { value: fallback, decider: THE_DEFAULT.decider, why: THE_DEFAULT.why }
}

// ================================================ what each surface draws, and what reads it today

/**
 * WHAT A SURFACE PUTS ON THE SCREEN, WHICH IS WHAT A PREVIEW OF IT HAS TO DRAW.
 *
 * Two shapes and no more. A surface either draws ONE LINE about a record — a row of a list, a chip,
 * a name in a picker — or it draws the RECORD'S OWN CONTENT, which is a report's blocks.
 *
 * The difference is not cosmetic and it is why the axis looked dead. A one-line surface asked for
 * the last position cannot draw a report; it takes the longest thing anybody WROTE, which for
 * almost every record in this corpus is the same summary the third position gives. A content
 * surface asked for the last position draws the whole report, which is nothing like its summary.
 * So the same seven positions produce two answers on one surface and three on the other, and a
 * preview that used one rule for both told a reader something false about half the grid.
 */
export type DetailDraws = 'oneLine' | 'theRecordsOwnContent'

/** Which of the two each of the ten surfaces is. Total, so a new surface must say which it is. */
export const DETAIL_DRAWS = {
  home: 'oneLine',
  review: 'oneLine',
  composer: 'oneLine',
  recipients: 'oneLine',
  messages: 'oneLine',
  reportIndex: 'oneLine',
  reportContent: 'theRecordsOwnContent',
  moduleCards: 'oneLine',
  graph: 'oneLine',
  tables: 'oneLine',
} as const satisfies Record<DetailSurface, DetailDraws>

/**
 * WHICH RECORDS A SURFACE DRAWS, WHERE ONLY SOME KINDS EVER REACH IT.
 *
 * `null` means any kind can appear there — Home ranks every kind, and a review, a composer or a
 * message can be about any record. The four that are not `null` are the surfaces whose name already
 * says which kind they hold, and they are listed so a preview of that row shows the kind of record
 * a person would actually meet there rather than whatever the corpus happened to sort first.
 *
 * IT IS NOT A FILTER THE SURFACES APPLY. Nothing reads this to decide what to fetch. It exists so
 * one thing — the preview on the settings grid — can be about the right kind of record, and a test
 * asserts every kind named here is a real record kind.
 */
export const DETAIL_KINDS_DRAWN: Readonly<Record<DetailSurface, readonly string[] | null>> = {
  home: null,
  review: null,
  composer: null,
  recipients: null,
  messages: null,
  reportIndex: ['report'],
  reportContent: ['report'],
  moduleCards: ['module'],
  graph: ['block', 'pipeline'],
  tables: null,
}

/**
 * THE SURFACES WE EXPECT NOTHING TO READ YET. THIS LIST ONLY EVER SHRINKS.
 *
 * IT IS AN EXPECTATION, WHICH IS WHY IT IS NAMED ONE. It used to be called
 * `DETAIL_SURFACES_NOTHING_READS`, which reads as a measurement of the running product. It is not
 * one. It is a checked-in claim, and what holds it honest is a test that disagrees with it — that
 * is `CLAUDE.md`'s third way of fixing one fact worked out in two places, and it is the sanctioned
 * one here because the other two would delete the second opinion.
 *
 * Measured on 20 August 2026, one day after the panel shipped: of the ten rows a person can set,
 * NINE were read by nothing at all. `useDetail` appeared exactly once in `src/web`. A dogfood set
 * `Report content` to 1, 2 and Full and measured three pages: nine identical numbers out of nine.
 * The control was not broken and the resolver was not wrong — no screen had ever asked it anything.
 *
 * So this list exists and the grid draws it. A row nobody reads says so on the row, in the preview,
 * and in its accessible name, because a control that quietly does nothing is the fifth engineering
 * invariant broken in the one place a person goes to change how Mole Office behaves.
 *
 * HOW A SURFACE COMES OFF THIS LIST, AND IT IS NOT BY A SOURCE SCAN.
 * `tests/how-much-each-thing-says.test.ts` requires a BEHAVIOUR proof for every surface not named
 * here: set the level, render the thing that draws it, and show the output differs. The source
 * scan in that file stays as a cheap extra check and it is never sufficient — there are exactly
 * two literal `useDetail('<surface>')` call sites in all of `src/web`, and `detailchoice.ts`
 * already reaches every surface through a variable, so the day somebody wires one up through a
 * prop or a loop the scan reads zero for a control that works.
 */
export const DETAIL_SURFACES_EXPECTED_UNREAD: readonly DetailSurface[] = [
  'review',
  'composer',
  'recipients',
  'messages',
  'reportIndex',
  'moduleCards',
  // `graph` CAME OFF THIS LIST IN ROUND TEN WAVE 11. The canvas asks `useDetail('graph')` and draws
  // its three positions on a bar of its own, and the proof registered for it in
  // `tests/a-detail-control-changes-what-is-drawn.test.ts` sets each position in a real browser and
  // reads what is on the drawing. Before that, canvas ZOOM chose how much a card said, which is why
  // this row read as dead: the control existed, and the thing it was meant to move was wired to the
  // viewport instead.
  'tables',
]

/**
 * True when this surface is one we expect nothing to ask how much to say.
 *
 * The name says expectation rather than fact for the same reason the list does: nothing in the
 * running product is measured here. What the settings grid draws from this is a claim, and the
 * claim is held by a behaviour test rather than by this function.
 */
export function expectedUnread(surface: DetailSurface): boolean {
  return DETAIL_SURFACES_EXPECTED_UNREAD.includes(surface)
}
