// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RESTRICTION IS, HOW BAD IT IS, AND HOW BADLY IT IS DRAWN.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE THING THE TWO KINDS SHARE, AND THE SEVEN THINGS THEY DO NOT
 * ---------------------------------------------------------------------------------------
 *
 * `placeholder` and `ran_instead` both carry three fields: what work stays valid, what may not be
 * claimed, and how bad it is. That is the *"shared validity/epistemic projection"* the owner's
 * addendum G.2 permits. What they do NOT share is the kind, the field list, the lifecycle, the
 * create route, the governance rule and the screen word.
 *
 * SO THIS FILE IS NOT AN ENUM OF EPISTEMIC STATES, AND MAY NEVER BECOME ONE. G.2 names eight
 * different phenomena — Placeholder, Example, Synthetic/test data, Fallback, Unknown, Assumption,
 * Provisional choice, Deferred Decision — and says in as many words: *"Do not force them into one
 * canonical type merely because all are non-final."* Two of the eight are record kinds here. The
 * other six already have homes elsewhere in this product and none of them is a member of any list
 * in this file:
 *
 *   Example            a TypeScript type that is never in the database, so it cannot be queried
 *   Synthetic data     `records.origin` — `authored`, `fixture`, or NULL for nobody has said
 *   Unknown            an answer: SESSION_STATES' `unknown`, `depthReading`, the Absence component
 *   Assumption         a `claim` in state `proposed` — believed but not measured
 *   Provisional choice a `decision` with `revisit_when`
 *   Deferred Decision  a `proposal`, and the governance queue that reads it
 *
 * Until 12 November 2026 a test failed when any of the eight words appeared as a state in
 * `ITEM_STATES`, `DISPLAY_WORDS` or `STATE_WORDS`, when `RESTRICTION_SEVERITY` grew past three, and
 * when two of the eight were wired to one mechanism. It was deleted with the other house-rule tests.
 *
 * ---------------------------------------------------------------------------------------
 * SEVERITY IS AUTHORED. IT IS NEVER DERIVED, AND THAT IS NOT A CONVENIENCE
 * ---------------------------------------------------------------------------------------
 *
 * The author of the restriction chooses one of three words. Mole Office never works it out from a
 * title, a kind, a link count or anything else — the rule `consequence` already carries in
 * `src/shared/kinds.ts`: *a rule that reads titles is a rule a title can fool.* A derived severity
 * would be a guess about consequence, and this product does not guess about consequence.
 *
 * THREE WORDS AND NOT TWO OR FIVE. The product-surfaces section of the specification names two poles —
 * harmless against production-blocking. Its worked camera-calibration example describes the middle, where a
 * result passes for pipeline execution and at the same time is not valid evidence for geometric accuracy.
 * Three is the smallest set that separates the two poles and holds that worked case. A fourth rung would be
 * one nobody could tell from its neighbours, and every
 * rung costs a mark and a contrast measurement in seven palettes.
 *
 * ---------------------------------------------------------------------------------------
 * `harmless` TURNS BEHAVIOUR OFF, NOT ONLY DRAWING DOWN
 * ---------------------------------------------------------------------------------------
 *
 * The owner's rule is *"Do not make harmless Placeholders visually equivalent to
 * production-blocking ones"*. A drawing rule alone would be met by a paler mark on the same page.
 * This meets it in behaviour: a `harmless` restriction does not enter the propagation walk at all,
 * writes no re-validation rows when it is resolved, and is returned only for the record it is
 * about. It cannot look like a production-blocking one because it is not in the same places. See
 * `src/server/lib/restrictions.ts`.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING DRAWS ANY OF THIS YET, AND THAT IS SAID HERE RATHER THAN LEFT TO BE DISCOVERED
 * ---------------------------------------------------------------------------------------
 *
 * The table below is declared, tested and read by nothing that renders. `GET /api/records/:id`
 * carries a record's restrictions on every kind and no page reads the key; the boundary line is in
 * four replies and no browser draws it. That is round ten wave 8's step 10, which was not built.
 * So every sentence in this file about what a reader sees is a description of what these marks ARE
 * FOR, and not a claim that anybody has seen one.
 */

import { RESTRICTION_EMPTY_NOTE } from './record-reader-sentences.ts'
export { RESTRICTION_EMPTY_NOTE } from './record-reader-sentences.ts'
import { fillWord, type StateMark } from './states.ts'

// ============================================================================ severity

/**
 * HOW BAD A RESTRICTION IS. Authored, worst first, and the array IS the ranking.
 *
 * Callers that need "the worst one present" read the order from this array rather than restating
 * it, the way `RECIPIENT_GROUNDS` in `./types.ts` is already read. A second ordering of three
 * words is a second thing that can disagree with the first.
 *
 *   stops_final   something cannot be called finished or final while this is here
 *   limits_claims work continues and some claims cannot be made
 *   harmless      nothing rests on it; it does not travel and it writes nothing
 */
export const RESTRICTION_SEVERITY = ['stops_final', 'limits_claims', 'harmless'] as const
export type RestrictionSeverity = (typeof RESTRICTION_SEVERITY)[number]

/** Which of two severities is worse. Reads the order of the array above; never a second table. */
export function worstSeverity(
  one: RestrictionSeverity,
  other: RestrictionSeverity,
): RestrictionSeverity {
  return RESTRICTION_SEVERITY.indexOf(one) <= RESTRICTION_SEVERITY.indexOf(other) ? one : other
}

/** The kinds that carry a restriction. Two, and the list is here so nothing hard-codes a pair. */
export const RESTRICTION_KINDS = ['placeholder', 'ran_instead'] as const
export type RestrictionKind = (typeof RESTRICTION_KINDS)[number]

// ============================================================================ how one is drawn

/**
 * THE SIX MARKS, ONE PER `(severity, standing)` PAIR THE READER CAN RETURN.
 *
 * They use the four channels declared in `./states.ts` — `form`, `glyph`, `edge`, `where` — and
 * are compared with the same `withoutHue()`. **No hue at all**: severity is a word and a rail,
 * never a colour. Eight epistemic concepts across seven palettes would be fifty-six hexes and a
 * collision census whose pair count grows with the square of the token list.
 *
 * THREE RULES, ALL TESTABLE, AND `tests/restriction-marks.test.ts` asserts every one:
 *
 *  1. All six screen words are distinct. The word is the channel a reader who cannot see marks at
 *     all still gets.
 *  2. All six `withoutHue()` strings are distinct — the product's own family rule.
 *  3. **Every `harmless` entry differs from every `stops_final` entry in `form`, and in at least
 *     two of the three remaining channels.** `form` decides whether anything is drawn in the
 *     margin at all: `harmless` is bare `text`, `stops_final` is always a `rail`. That is the
 *     owner's *"do not make harmless equivalent to production-blocking"* in a form a test can fail.
 *
 * Within one severity the two standings differ in one channel and the word, on purpose: they are
 * the same restriction in two conditions, not two different things.
 *
 * `dashed` is not used — `tokens.css` reserves it for *inferred*. `hairline` is not used — the
 * history thread gives it to the planned world. Every entry is `where: 'leftMargin'`, which
 * separates this whole family from every other mark in the product, all of which are `inline`.
 *
 * THESE ARE NOT JOINED INTO `ALL_MARKS`, and that is deliberate rather than forgotten.
 * `markPairs()` walks `ALL_MARKS` to check every pair differs, and `ALL_MARKS` is the vocabulary
 * of composition and planned marks — what changed in a pipeline's history. A restriction is not an
 * event in a composition's history. Joining them would also move an acceptance count that is
 * asserted on purpose. `tests/restriction-marks.test.ts` asserts these six collide with none of
 * them on word or on `withoutHue()`, which is the check that was wanted, without the join.
 */
export interface RestrictionMark {
  /** The word on screen. `{date}` is filled by `fillWord`, which throws rather than guessing. */
  word: string
  /** What it looks like with hue removed. */
  mark: StateMark
  /** The whole sentence, for a title, an off-screen span or a fold. Never drawn beside the word. */
  detail: string
}

/**
 * The key is `${severity}.${standing}`. There is no `harmless.unchecked` and no
 * `stops_final.resolved`, because the reader cannot return either pair: a harmless restriction
 * writes no re-validation rows so nothing can be unchecked about it, and a restriction that wrote
 * rows is `resolved-unchecked` until every row is judged, at which point it stops being returned.
 */
export const RESTRICTION_MARKS: Readonly<Record<string, RestrictionMark>> = {
  'stops_final.active': {
    word: 'Stops this being called final',
    mark: { form: 'rail', glyph: 'barred', edge: 'solid', where: 'leftMargin' },
    detail:
      'Something was left unresolved here on purpose. Nothing resting on it may be called finished or final ' +
      'while it is open. Open it for what may and may not be claimed.',
  },
  'stops_final.unchecked': {
    word: 'Resolved {date} — this still cannot be called final',
    mark: { form: 'rail', glyph: 'barred', edge: 'underline', where: 'leftMargin' },
    detail:
      'The unresolved thing has been answered, and the work that rested on it has not been reviewed yet. ' +
      'Answering it does not make earlier work valid; each piece of work needs a review.',
  },
  'limits_claims.active': {
    word: 'Limits what this can prove',
    mark: { form: 'rail', glyph: 'doubled', edge: 'none', where: 'leftMargin' },
    detail:
      'Work continues, and the author of the restriction wrote down claims that may not be made while it is ' +
      'open. Open it for the two lists in their own words.',
  },
  'limits_claims.unchecked': {
    word: 'Resolved {date} — not re-checked',
    mark: { form: 'rail', glyph: 'doubled', edge: 'underline', where: 'leftMargin' },
    detail:
      'The restriction has been answered, and the work resting on it has not been reviewed since. Say whether ' +
      'it still stands.',
  },
  'harmless.active': {
    word: 'Nothing rests on it',
    mark: { form: 'text', glyph: 'hollow', edge: 'none', where: 'leftMargin' },
    detail:
      'A deliberate unresolved slot whose author said nothing rests on it. It does not travel to any other ' +
      'record and it asks for nothing when it is resolved.',
  },
  'harmless.resolved': {
    word: 'Resolved {date}',
    mark: { form: 'text', glyph: 'hollow', edge: 'underline', where: 'leftMargin' },
    detail: 'It has been answered, and nothing was ever owed, because nothing rested on it.',
  },
}

/** The key `RESTRICTION_MARKS` is looked up by. One place, so nobody spells the join twice. */
export function restrictionMarkKey(severity: RestrictionSeverity, standing: string): string {
  return `${severity}.${standing}`
}

/**
 * WHERE A RESTRICTION STANDS, AS THE READER ANSWERS IT.
 *
 * The reader's own `Standing` in `src/server/lib/restrictions.ts` is a union carrying a different
 * set of extra fields per arm, so it cannot be built from this list. What this list is for is the
 * two callers that only need the WORD: the mark lookup below, and any screen counting rows.
 */
export const RESTRICTION_STANDINGS = ['active', 'resolved-unchecked', 'resolved'] as const
export type RestrictionStanding = (typeof RESTRICTION_STANDINGS)[number]

/**
 * The mark's half of the key, from the reader's standing word.
 *
 * The two vocabularies differ by one word and this is the only place that knows it:
 * `resolved-unchecked` is the reader's word for *answered, and this record has not been looked at
 * since*, and the mark table spells that `unchecked`. Written once so a screen does not spell the
 * join a second time and get it wrong for one severity.
 */
export function markStandingOf(standing: RestrictionStanding): string {
  return standing === 'resolved-unchecked' ? 'unchecked' : standing
}

/**
 * HOW ONE RESTRICTION IS DRAWN: the word, the mark and the sentence, with `{date}` filled.
 *
 * NULL FOR A PAIR THE TABLE DOES NOT HOLD, and a screen must draw the absence rather than invent a
 * word. There is no `harmless.unchecked` and no `stops_final.resolved`, because the reader cannot
 * return either — see `RESTRICTION_MARKS`. A pair arriving here that the table has no entry for
 * means the reader changed and this table did not, which is a fault worth seeing on screen.
 *
 * `resolvedAt` IS REQUIRED BY THE TWO RESOLVED ROWS AND REFUSED BY THE ACTIVE ONES. `fillWord`
 * throws either way round rather than drawing an empty date or swallowing one, so this hands it the
 * day only when the word asks for one.
 */
export function restrictionDrawing(
  severity: RestrictionSeverity,
  standing: RestrictionStanding,
  resolvedAt: string | null,
): { word: string; mark: StateMark; detail: string } | null {
  const entry = RESTRICTION_MARKS[restrictionMarkKey(severity, markStandingOf(standing))]
  if (entry === undefined) return null
  const wantsDate = entry.word.includes('{date}')
  if (!wantsDate) return { word: entry.word, mark: entry.mark, detail: entry.detail }
  // THE DAY, NOT THE STAMP. The stored value is a local wall-clock stamp; the sentence asks when
  // it was resolved, and a time of day on a row about a resolution is noise.
  const day = resolvedAt === null ? null : (resolvedAt.slice(0, 10) || null)
  if (day === null) return null
  return { word: fillWord(entry.word, { date: day }), mark: entry.mark, detail: entry.detail }
}

// ============================================================================ counting and saying

/**
 * THE FOUR COUNTS, AND WHY TWO OF THEM ARE DISJOINT.
 *
 * `active` counts restrictions with no `resolves` link. `unchecked` counts restrictions that have
 * one and still stand at `resolved-unchecked` here. A restriction is in exactly one of them, so the
 * two numbers can be read side by side without anybody working out an overlap.
 *
 * `stopsFinal` is a severity breakdown ACROSS both, and it is deliberately a subset — that is what
 * the owner's own second line is: *1 prevents final performance validation* is one of the three
 * above it.
 *
 * `harmless` counts ACTIVE harmless restrictions and is never added into `active`. Two harmless
 * placeholders must not make a line read *5 active placeholders* beside *1 prevents final
 * validation*, because a reader who learns the number is mostly noise stops reading the number.
 *
 * IT MOVED HERE FROM `src/server/lib/restrictions.ts`, which held the only copy, so that the screen
 * counting a record's own restrictions and the route counting a scope's are one arithmetic.
 */
export interface RestrictionCounts {
  active: number
  unchecked: number
  stopsFinal: number
  harmless: number
}

/** What a set of readings holds, counted. Structural on purpose: any reply's rows fit. */
export function restrictionCounts(
  found: readonly { severity: RestrictionSeverity; standing: { state: string } }[],
): RestrictionCounts {
  let active = 0
  let unchecked = 0
  let stopsFinal = 0
  let harmless = 0
  for (const reading of found) {
    if (reading.severity === 'harmless') {
      if (reading.standing.state === 'active') harmless += 1
      continue
    }
    if (reading.standing.state === 'active') active += 1
    else if (reading.standing.state === 'resolved-unchecked') unchecked += 1
    if (reading.severity === 'stops_final' && reading.standing.state !== 'resolved') stopsFinal += 1
  }
  return { active, unchecked, stopsFinal, harmless }
}

/**
 * WHAT AN ANSWER ABOUT RESTRICTIONS COULD NOT LOOK AT, NAMED, IN THE SENTENCE THE ANSWER CARRIES.
 *
 * A SHORT LIST AND A COMPLETE ONE READ THE SAME UNLESS THE ANSWER SAYS WHICH IT IS. So every
 * sentence about restrictions ends with this clause when anything was missed, and with nothing when
 * nothing was.
 *
 * IT NAMES THE THING, NOT THE FIELD THAT HOLDS IT. This clause used to end *"see couldNotCheck"* —
 * a key from the JSON reply, printed on the Placeholders page, where a person reads it and has
 * nowhere to go. It now names what was not looked at, in the words the reading itself used:
 * *"One thing could not be checked: code dependencies between records."*
 *
 * WHY IT DOES NOT ALSO PRINT THE REASON. Every screen that shows this sentence also draws the full
 * list beside it — the Placeholders page in its "What could not be checked" panel, the record page
 * in the fold under the restrictions — and each row there carries the `because` in full. Printing
 * the reason twice on one screen would make the sentence three lines long and say nothing new.
 *
 * IT IS ONE FUNCTION BECAUSE THERE ARE TWO SENTENCES. `restrictionNote` below says how many
 * restrictions reach the thing you asked about; `everythingNote` in `src/server/api/restrictions.ts`
 * says how many exist in the project. Those are different facts and they are worded separately, on
 * purpose. What could not be checked is the SAME fact in both, and it was worked out in both — two
 * copies, byte for byte, so repairing one left the other on screen. This is the copy, and the other
 * one calls it.
 */
export function whatCouldNotBeCheckedSaid(couldNotCheck: readonly { what: string }[]): string {
  if (couldNotCheck.length === 0) return ''
  const named = couldNotCheck.map((gap) => gap.what).join('; ')
  return couldNotCheck.length === 1
    ? ` One thing could not be checked: ${named}.`
    : ` ${String(couldNotCheck.length)} things could not be checked: ${named}.`
}

/**
 * WHAT AN ANSWER ABOUT RESTRICTIONS SAYS ABOUT ITSELF, COUNTED FROM THE READINGS IN IT.
 *
 * What could not be checked comes first when there is any, because a list that is short is
 * indistinguishable from a complete one unless it says so.
 *
 * IT IS SHARED BECAUSE THE SCREEN SAYS IT TOO. `GET /api/restrictions` has printed this sentence
 * since wave 8; the record page now prints the same one about the same rows, and a second wording
 * in the browser would be one fact worked out in two places.
 *
 * IT TAKES THE GAPS THEMSELVES AND NOT A COUNT, because the clause names them. A caller with only a
 * number could not say what was missed, and "1 thing could not be checked" on its own is a sentence
 * a reader can do nothing with.
 */
export function restrictionNote(
  found: readonly { severity: RestrictionSeverity; standing: { state: string } }[],
  couldNotCheck: readonly { what: string }[],
): string {
  const missing = whatCouldNotBeCheckedSaid(couldNotCheck)
  if (found.length === 0) {
    return `${RESTRICTION_EMPTY_NOTE}${missing}`
  }
  const stopsFinal = found.filter((r) => r.severity === 'stops_final').length
  const unchecked = found.filter((r) => r.standing.state === 'resolved-unchecked').length
  return (
    `${found.length} restriction${found.length === 1 ? '' : 's'} reach${found.length === 1 ? 'es' : ''} this` +
    (stopsFinal === 0 ? '' : `, ${stopsFinal} of which stop${stopsFinal === 1 ? 's' : ''} it being called final`) +
    (unchecked === 0 ? '' : `, ${unchecked} resolved and not re-checked`) +
    `. Every one carries its author's own words about what may and may not be claimed.${missing}`
  )
}

// ============================================================================ boundaries

/**
 * THE ACTS AT WHICH MOLE OFFICE ASKS ABOUT RESTRICTIONS, AND NOTHING ELSE EVER DOES.
 *
 * The owner: *"Do not annoy users with daily: you have 12 Placeholders. Prefer reminders at
 * meaningful semantic boundaries."* So there is no scanner, no scheduler, no daily job, and
 * nothing on any page at rest says how many placeholders exist. A boundary is an act that already
 * writes something; the route that performs the act calls one reader after the write succeeds and
 * puts the answer in its reply.
 *
 * BOUND IN BOTH DIRECTIONS, so a boundary cannot quietly stop asking. A test walks this list,
 * drives each drivable act's own TRANSITION — not its route — and asserts the reply carries
 * `restrictions.boundary === act.name`.
 *
 * THE ROUTE IS NOT THE BOUNDARY, AND TWO OF THESE PROVE IT. `task.complete` and `result.promote`
 * are the same route and the same operation. What separates them is the transition, which is why
 * this list carries `transition` as prose and why the test drives transitions.
 *
 * `operation: null` MEANS THE ACT'S ROUTE IS ANOTHER THREAD'S AND DOES NOT EXIST YET. Two invented
 * names here would have failed the binding assertion on day one. Null is the honest value, the
 * test names those rows as not yet drivable rather than iterating over a row it cannot exercise,
 * and each thread fills in its own row in the same change that adds its route.
 *
 * DEPLOYMENT AND RELEASE ARE NOT HERE. The specification lists *deployment/release* among its boundaries.
 * Mole Office has no deployment act, no release act and no concept of either, and inventing one to have
 * somewhere to hang a reminder would be a boundary nothing could ever cross. It is named as not
 * built rather than left out silently. What would build it: a real release act in the product, at
 * which point it is one row here.
 */
export interface BoundaryAct {
  /** What the boundary is called on the wire, in the reply's `restrictions.boundary`. */
  name: string
  /**
   * The operation name from the telemetry vocabulary, or null when the route does not exist yet.
   * A non-null value must be a live name there; a list of operation names free to drift from the
   * one the product uses is a second list.
   */
  operation: string | null
  /** What the reader is handed as its scope, in the words a person would use. */
  scope: string
  /** The transition that IS the boundary. Two rows share a route and differ only here. */
  transition: string
}

export const BOUNDARY_ACTS: readonly BoundaryAct[] = [
  {
    name: 'task.complete',
    operation: 'record.change',
    scope: 'the record',
    transition: "a work record's state becomes done or failed",
  },
  {
    name: 'pipeline.complete',
    operation: 'record.body',
    scope: 'the pipeline',
    transition: "the last unfinished block of a pipeline becomes done",
  },
  {
    name: 'result.promote',
    operation: 'record.change',
    scope: 'the record',
    transition: "a claim's state becomes measured",
  },
  {
    name: 'decision.commit',
    operation: 'record.promote',
    scope: 'the proposal',
    transition: 'a fork is settled',
  },
  // NOT DRIVABLE YET — the review thread's close act.
  { name: 'review.close', operation: null, scope: 'the review', transition: 'a review is closed' },
  // NOT DRIVABLE YET — the work-domain thread's accept act.
  {
    name: 'domain.accept',
    operation: null,
    scope: 'the accepted domain',
    transition: 'a work domain is accepted',
  },
] as const
