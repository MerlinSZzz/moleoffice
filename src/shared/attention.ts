// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH THINGS NEED A PERSON, AND WHICH ONE FIRST.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * `work.ts` answers WHAT A THING IS: what a state word means, who is hurt, whether a promise has
 * been kept, whether something was deliberately put down. This file answers WHICH MATTERS MOST.
 * It imports every predicate it needs from there and re-states none of them.
 *
 * It is a pure function of its arguments. No clock of its own, no storage, no fetching, no React.
 * `now` is passed in, the records are passed in, and the same input always gives the same output.
 * That is what makes the rule arguable: a person can disagree with a row and the disagreement is
 * about a number this file computed from a stored field, not about a judgement made inside a page.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 *     A thing needs attention when it is OWED to somebody outside this project,
 *     when its own recorded state says the work STOPPED SHORT of finishing,
 *     or when a PAUSE somebody set has run past the date they set it until.
 *
 * A discharged obligation is not owed — `readFulfilment` decides that, and `data.done` is the field
 * it reads, which has been declared in kinds.ts from the start.
 *
 * ---------------------------------------------------------------------------------------
 * THE THIRD HALF, AND WHY A PAUSE IS NOT A PERMANENT EXCUSE
 * ---------------------------------------------------------------------------------------
 *
 * A pause is a decision: somebody put the work down, said why, and often said what should bring it
 * back. While that resume condition still says "not yet", the pause is doing its job and the work
 * stays off the list — that is the whole point of recording one.
 *
 * But a pause whose date has PASSED is not a decision any more. It is work somebody meant to pick
 * back up on the 6th and has not, and nothing in the product said so. Under the old rule a pause
 * silenced a record for ever, so "not now, until the 6th" and "not now, ever" were the same thing.
 * They are not, and `pauseElapsed` in work.ts is what tells them apart.
 *
 * IT GIVES THREE ANSWERS AND ALL THREE ARE KEPT APART, because `null` is not `false`:
 *
 *   true   — the date it named has passed. The pause has expired: it goes ON the list, in its own
 *            reason-group, and the row says which date it was put down until.
 *   false  — the date it named is still ahead. The pause is working: it stays OFF the list, and it
 *            is counted in `passedOver` under `paused_waiting`.
 *   null   — Mole Office CANNOT TELL. The pause is open-ended, or its condition is written in prose, or
 *            it waits on another record, or the stamp is not one this product can read. It stays
 *            off the list — nothing here says action is required — and it is counted under
 *            `paused_cannot_tell` and reported with `standing` saying WHICH of those it is. That is
 *            the difference between "not yet" and "nobody knows", and a screen that showed them as
 *            one answer would be guessing on the product's behalf.
 *
 * WHAT IS DELIBERATELY NOT DONE HERE. `until.recordId` names a record whose finishing should end
 * the pause, and this file has that record in hand. Checking it would be a SECOND opinion about
 * whether a pause is over, sitting beside `pauseElapsed`, with nothing making the two agree — the
 * exact defect this codebase keeps producing. `pauseElapsed` is the one arbiter; extending it to
 * read `until.recordId` belongs in work.ts, which this phase does not own. Reported, not built.
 *
 * A state word nobody has classified is NOT quietly excluded. It comes back in its own list with
 * `unclassifiedNote()` as its sentence, so the screen can ask the question. So does a record with
 * no state at all, which is a different question again.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE RANKING IS SCORED AND NOT TIERED — THE MEASUREMENT THIS FILE EXISTS TO FIX
 * ---------------------------------------------------------------------------------------
 *
 * The rule that ships today ranks by a fixed tier order and cuts at seven rows. The corpus holds
 * exactly seven crashed sessions, `crashed` is the first tier, and the cap is seven. So the panel
 * was seven crashed sessions at every setting of every input, an obligation six days past its date
 * sat at row 14, and no amount of redrawing the page could reach it.
 *
 * Three things here make that structurally impossible, and each one is aimed at a measured failure:
 *
 *   1. THE RANK IS A SUM OF INDEPENDENT FACTORS. Who is hurt, whether somebody outside is waiting,
 *      how late it is, how much recorded work stands behind it, how long it has sat. Every factor
 *      has a maximum (FACTOR_MAX below) and every maximum is smaller than the sum of the others, so
 *      a row that scores everything else always beats a row that scores one thing. No factor can
 *      fill the list on its own. `tests/attention-rule.test.ts` checks that property arithmetically
 *      rather than trusting the numbers to stay chosen well.
 *
 *   2. SAFETY IS A SEPARATE SORT KEY, NOT A BIG NUMBER. Anything `isSafety()` calls true sorts
 *      above everything that is not, whatever either side scores. A large constant would have been
 *      easier and would eventually be out-added by four other factors; a separate key cannot be.
 *      The measurement that led here found the same dangerous problem ranked 48th when filed this
 *      morning and 31st when three weeks old, because staleness was doing the ranking. A safety
 *      item filed one minute ago is row one.
 *
 *   3. NO GROUP MAY TAKE MORE THAN `MAX_ROWS_PER_GROUP` OF THE VISIBLE ROWS while another group
 *      has rows waiting. Scoring alone does not prevent one reason dominating: seven crashes with
 *      seven similar scores would have done it again.
 *
 *      TWO THINGS PASS THAT CAP, and both are exemptions from it rather than second mechanisms.
 *      A SAFETY ROW passes always, for the reason in point 2. AN OVERDUE OWED ROW passes while its
 *      group is still under `MAX_OVERDUE_OWED_ROWS`, because a promise to somebody outside this
 *      project whose date has already gone must not vanish into a quota — that failure was measured
 *      too, and the numbers are on that constant. Only OVERDUE: a promise still ahead of its date,
 *      or with no date at all, is ordinary work and is capped like everything else.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS HIDDEN. EVERYTHING NOT SHOWN IS COUNTED AND NAMED
 * ---------------------------------------------------------------------------------------
 *
 * The problem is never solved by avoiding the
 * information. So the reading layer is small and the archive stays whole. Every candidate this
 * function is given lands in exactly one place:
 *
 *   `visible`      — the rows a person reads first
 *   `remainder`    — selected, not shown, each carrying WHY it was cut (the row cap or the group cap)
 *   `passedOver`   — not selected, in named buckets with a sentence each and every key listed
 *
 * and five of those buckets are also returned in full: `unclassified`, `noState` and `paused`,
 * which are questions rather than verdicts, and `directions` and `reports`, which are ANSWERS this
 * rule does not rank — see below and see `ReportRow`. `visible.length + remainder.length === total`, exactly, always; a test pins it.
 *
 * ---------------------------------------------------------------------------------------
 * AN OBLIGATION COMES DUE THREE WAYS, AND ONLY ONE OF THEM CAN BE LATE
 * ---------------------------------------------------------------------------------------
 *
 * `data.due` takes a date, a trigger written in words, or the record whose finishing makes it due —
 * the same three ways a pause ends, in the same shape. `readDue`, `dueStandingOf` and `latenessMs`
 * in work.ts are the readers, and this file uses them rather than reading `data.due` itself.
 *
 * WHAT THAT MEANS FOR THE RANKING, and it is the whole of decision 5:
 *
 *   A DATE can pass, so a date-due promise can be OVERDUE, and overdue is the sharpest thing this
 *   product says. `lateMs` is `now - dueAt` and `isOverdueOwed` is the one reading of it.
 *
 *   A TRIGGER cannot be late. A promise owed "when the reprint lands" is WAITING: nothing measured
 *   says it has come due, so nothing measured says it is late. `latenessMs` answers null and this
 *   file keeps that null. NO DEADLINE IS INVENTED SO THAT SOMETHING CAN BE SCORED — that
 *   substitution would be invisible afterwards, because a resolved condition looks exactly like a
 *   date somebody wrote — and NO LATENESS DURATION IS INVENTED EITHER, so the `late` factor scores
 *   zero and SAYS WHY IT SCORED ZERO in the promise's own stored words.
 *
 * THE ONE TRIGGER MOLE OFFICE CAN CHECK IS A RECORD, AND IT IS CHECKED HERE RATHER THAN IN work.ts.
 * `Due.recordId` names a record, this rule has every record in hand, and work.ts declares that
 * question "checkable, by a caller that has the rows" — it delegates rather than answering, so
 * answering it here is the ONLY answer and not a second one. That is exactly the opposite of
 * `Pause.until.recordId`, which is NOT checked here: `pauseElapsed` already answers "is this pause
 * over", so a second reading beside it would be two arbiters with nothing making them agree. The
 * difference is whether an arbiter already exists, and it does for a pause and does not for a due.
 *
 * A fired trigger changes the SENTENCE and not the SCORE. "The record it waits on has finished, so
 * this is due now" is what a person needs; how late it is remains unknown, because nothing anywhere
 * says by when it is owed once the trigger fires. Giving it points would be that missing deadline
 * arriving through the back door.
 *
 * ---------------------------------------------------------------------------------------
 * A DIRECTION IS NOT A RECORD MISSING ITS STATE
 * ---------------------------------------------------------------------------------------
 *
 * Sixteen of seventeen directions used to land in `noState`, beside notes and messages, under the
 * sentence *records of this kind have no state field, so there is no word to read*. That sentence is
 * literally true and it reads as a gap in the record, and there is no gap: a direction is the one
 * kind whose whole purpose is progress — "a line of exploration, tracked by how far it has actually
 * been taken" — and it records that in `depth`, on a required, validated six-rung ladder.
 *
 * So a direction is reported in ITS OWN LIST, in ITS OWN LANGUAGE, through `depthReading()` in
 * types.ts, and it is counted in its own bucket. Decision 15.
 *
 * WHAT DID NOT HAPPEN, AND MUST NOT. The six rungs did not go into `STATE_MEANING` — `measured` is
 * level four of six for a direction and *the work is done* for a claim, and that table is flat to
 * stop one word meaning two things. There is no function anywhere that turns a depth into a
 * `Progress`, and `DepthReading.stoppedShort` is typed as the literal `false` so nobody can write
 * one by accident.
 *
 * AND A SHALLOW DIRECTION IS NOT AN ATTENTION ITEM. `noticed` means somebody wrote down that a
 * question exists and has not taken it any further, which is what the kind is FOR. Ranking that as
 * work that stopped short would put every future idea this lab has ever written down in front of a
 * person today, permanently, and empty the list of readers. A direction reaches this list the way
 * every other kind does and no other way: somebody stored a CONSEQUENCE on it, or a PAUSE on it ran
 * past its date, or it is OWED to somebody outside, or it carries a state word that stopped short.
 * Those paths are untouched and are checked before a direction is ever filed under its depth.
 *
 * ---------------------------------------------------------------------------------------
 * TWO THINGS THIS FILE DELIBERATELY DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * IT DOES NOT READ A DUE DATE ITSELF. `dueMs` is handed in. A bare "2026-08-03" is due at the END
 * of the 3rd — otherwise everything due today is overdue at one minute past midnight — and that
 * rule already exists, once, as `parseDueStamp` in src/web/lib/attention.ts. Writing a second copy
 * here is the exact defect this codebase keeps producing: two places that must agree with nothing
 * making them agree. `pauseElapsed` in work.ts takes the same reader as a parameter for the same
 * reason. The rule should end up in src/shared/time.ts beside the other stamp readers; that file
 * belongs to somebody else this phase, so it is reported and not moved.
 *
 * IT DOES NOT DATE A CHECKLIST ITEM. An item carries no timestamp of its own, so "how long has this
 * been left" is measured on the record it sits in and SAYS SO on the row (`sinceSource`). That is a
 * weak signal honestly labelled. The strong version needs one stored field — a stamp written
 * whenever an item's state changes — and that is a schema change, not something to infer here.
 */

import { en } from './words/en.ts'
import { sayInEnglish, sentencesJoined, type Say } from './i18n.ts'
import type { CodedReason } from './attention-reasons.ts'
import { BLOCK_KIND } from './blocks.ts'
import { KIND_SPECS, REPORT_READ_ANSWERS, SHAPE_SPECS, type ReportReadAnswer } from './kinds.ts'
import { parseLocalStamp } from './time.ts'
import {
  depthReading,
  type ActorType,
  type Change,
  type DirectionDepth,
  type Link,
  type PanelRecord,
  type RecordKind,
  type RecordOrigin,
} from './types.ts'
import {
  KIND_FAMILIES,
  dueStandingOf,
  familyOf,
  isSafety,
  latenessMs,
  pauseElapsed,
  progressOf,
  stateOfWork,
  theWorkHasEnded,
  theWorkHasStoppedShort,
  readConsequence,
  readDue,
  readFulfilment,
  KINDS_READ_ON_THEIR_OWN_PAGE,
  readPause,
  unclassifiedNote,
  type Consequence,
  type Due,
  type DueStanding,
  type KindFamily,
  type Pause,
  type Progress,
} from './work.ts'

/**
 * The one kind whose progress is a `depth` rather than a state word. Written as a typed constant so
 * that renaming the kind stops this file compiling instead of leaving a string nothing matches.
 */
const DIRECTION_KIND: RecordKind = 'direction'

/**
 * The kind that is written for a person to read rather than to be worked on. Typed for the same
 * reason `DIRECTION_KIND` is: renaming the kind must break the compile, not leave a dead string.
 */
const REPORT_KIND: RecordKind = 'report'

// ============================================================================ constants

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS

/**
 * How many rows a reader sees before the remainder.
 *
 * Seven, which is what the panel shows today. The number was never the problem — the problem was
 * that one tier could fill all seven. Changing it to twelve would have moved twelve crashed
 * sessions onto the screen and called it a fix.
 */
export const VISIBLE_ROWS = 7

/**
 * The most rows any one reason-group may take while another group has rows waiting.
 *
 * THREE, and the reason is arithmetic. Three cannot fill seven: two groups at their limit still
 * leave a row for a third, so the visible list always shows at least three different reasons
 * whenever three exist. Two would be tidier and would break the case this is really for — the ESA
 * story is three connected rows (a late report, the reprint that would finish it, the printer
 * queue behind that) and cutting it at two would split a story that reads top down. Four could
 * take seven rows with one group and one leftover, which is the failure this constant prevents.
 *
 * SAFETY IS EXEMPT. A safety row is never held back by this, and never displaces a safety row.
 * AN OVERDUE PROMISE IS EXEMPT TOO, up to `MAX_OVERDUE_OWED_ROWS` below, which is where that second
 * exemption and the price it costs are written down.
 * Everything this cap holds back appears in `remainder` with `displacedBy: 'group-cap'`, so what it
 * moved is visible rather than lost.
 */
export const MAX_ROWS_PER_GROUP = 3

/**
 * The most rows the `owed` group may take when the rows past `MAX_ROWS_PER_GROUP` are OVERDUE.
 *
 * FOUR, and it is derived rather than picked: `VISIBLE_ROWS - MAX_ROWS_PER_GROUP`. Whatever those two
 * numbers become, the sentence this one keeps true is that the exemption always leaves a FULL
 * group's share of the screen — three rows today — for every other reason. A test checks that
 * relation over the constants rather than over the number four.
 *
 * WHY THE EXEMPTION EXISTS, MEASURED. Over the live corpus on 2026-08-10 there were ten owed rows,
 * six of them past their date. Three were on the screen. Three sat in the remainder marked
 * `displacedBy: 'group-cap'` — the highest scoring 80 and 6.9 days late — while visible row seven was
 * a checklist item scoring 16. A promise to somebody OUTSIDE this project, whose agreed date has
 * already gone, is the sharpest thing this product has to say, and its group's quota being full is
 * not a reason for it to disappear. With this constant in place the row scoring 80 is on the screen
 * and the checklist item is in the remainder, which is the swap the measurement asked for.
 *
 * WHY IT IS BOUNDED WHEN SAFETY'S IS NOT. Safety can be unbounded because a person being hurt has no
 * substitute: a screen of nothing but safety rows is the right screen. An overdue obligation does
 * have a substitute — the next overdue obligation — so ten of them would take all seven rows and the
 * panel would be one reason owning the screen again, which is the exact failure `MAX_ROWS_PER_GROUP`
 * was added to stop. Unbounded was measured rather than imagined: on the live corpus it fills the
 * screen with five obligations and the two safety rows, and nothing else reaches it at all.
 *
 * WHAT IT COSTS, SAID PLAINLY RATHER THAN GLOSSED. `MAX_ROWS_PER_GROUP`'s own guarantee was that two
 * groups at their limit still leave a row for a third, so three different reasons are shown whenever
 * three exist. Four plus three is seven, so when this exemption is spent that spare row can be taken
 * and the floor drops to two different reasons. That is a real loss, it was accepted knowingly in
 * exchange for never hiding an overdue promise, and it is the first thing to revisit if a screen ever
 * reads as nothing but obligations.
 *
 * NOTHING IS HIDDEN BY IT EITHER WAY. An overdue owed row this bound holds back is in `remainder`
 * with `displacedBy: 'group-cap'` and counted under `owed` in `remainderByGroup`, exactly as a row
 * the plain cap held back — because in both cases what held it back was its group's share being full.
 */
export const MAX_OVERDUE_OWED_ROWS = VISIBLE_ROWS - MAX_ROWS_PER_GROUP

/** How far ahead of its date something starts earning points for being close. One working day
 *  plus the night before it. */
export const DUE_SOON_HOURS = 48

/** The rank factors. Each is computed from a stored field; none is read out of prose. */
export const FACTOR_NAMES = ['harm', 'owed', 'late', 'standing', 'sat'] as const
export type FactorName = (typeof FACTOR_NAMES)[number]

/**
 * The most any one factor can contribute.
 *
 * THE PROPERTY THAT MATTERS is not the individual numbers, it is that each maximum is smaller than
 * the sum of the other four. That is what stops any single factor filling the list: a row that
 * scores everything except X always outranks a row that scores only X. The test asserts it over the
 * table rather than over these particular values, so the numbers can be tuned and the guarantee
 * cannot be tuned away by accident.
 */
export const FACTOR_MAX: Readonly<Record<FactorName, number>> = {
  /** Who is hurt, from the STORED consequence bearer. Highest, because it is the only factor that
   *  is about a person rather than about a schedule. */
  harm: 40,
  /** Somebody outside this project is waiting. */
  owed: 35,
  /** How far past the agreed date. */
  late: 25,
  /** How much recorded work stands behind it. */
  standing: 20,
  /** How long it has sat since anything was recorded about it. Deliberately the smallest: age was
   *  doing the ranking in the measurement, and a dangerous thing filed this morning is dangerous. */
  sat: 15,
}

/**
 * What one link of distance costs, when the promise is inherited rather than made.
 *
 * A task that blocks a late report is owed to the same people the report is owed to, but less
 * directly, and something two links away is less direct again. 0.7 per hop, so the chain fades
 * without ever reaching zero — it should still outrank an unrelated failure, and it does.
 */
export const HOP_DECAY = 0.7

/** Points for each stored consequence bearer. `person` also gets the floor; see `isSafety`. */
const HARM_POINTS: Readonly<Record<Consequence['bearer'], number>> = {
  person: FACTOR_MAX.harm,
  outside: 30,
  property: 22,
  dependent: 18,
  owner: 8,
  none: 0,
}

/** Points per live record that stands behind this one, up to the factor's maximum. */
const STANDING_POINTS_EACH = 5

/** Points per day since anything was recorded about it, up to the factor's maximum. */
const SAT_POINTS_PER_DAY = 1

/** What being exactly at its date is worth. Past that it climbs; before it, it fades to nothing. */
const LATE_POINTS_AT_DUE = 12
const LATE_POINTS_PER_DAY = 2
/** The most a thing that is NOT yet late can earn for being close to its date. */
const DUE_SOON_MAX = 10

// ============================================================================ groups

/**
 * The reason-groups the diversity guarantee counts, and the remainder is broken down by.
 *
 * DERIVED, NOT INVENTED. A row is owed to somebody outside, or its own word says it stopped short,
 * or a pause somebody set has run past its date — and in the second case the group is the reading
 * family the kind already belongs to, from KIND_FAMILIES in work.ts. Checklist items and pipeline
 * steps get their own two groups because they have no kind of their own; they live inside a record
 * and would otherwise all count as their parent's family.
 *
 * This is what makes the seven-crashed-sessions failure impossible rather than unlikely. All seven
 * crashes are one group, `stopped:notes`, and one group may take three of seven rows.
 */
export type ReasonGroup =
  | 'owed'
  | 'pause-elapsed'
  | `stopped:${KindFamily}`
  | 'stopped:item'
  | 'stopped:block'
  | 'stopped:own-page'
  | 'stopped:no-family'

/**
 * The words for each group, as a plural noun phrase.
 *
 * Written as phrases rather than built from `KIND_FAMILIES[f].label`, because those labels are
 * headings ("Decisions", "Notes and messages") and do not survive being put after a number. This is
 * a different sentence for a different place, not a second copy: the KEY SET is pinned by the
 * ReasonGroup type above, so a new family added to work.ts stops this file compiling until somebody
 * writes its words.
 */
export const REASON_GROUP_LABELS: Readonly<Record<ReasonGroup, string>> = {
  owed: 'owed to somebody outside',
  // Phrased as a mass noun for the same reason "work that stopped short" is: these labels are
  // printed straight after a count, and "1 pauses that have run past" is a sentence nobody writes.
  'pause-elapsed': 'work whose pause has run past the date it was set until',
  'stopped:work': 'work that stopped short',
  'stopped:structure': 'structure that stopped short',
  'stopped:decisions': 'questions and decisions that stopped short',
  'stopped:findings': 'findings that stopped short',
  'stopped:ideas': 'things we might do that stopped short',
  // AGENT RUNS ARE IN THIS FAMILY, and they are most of what this group ever holds: a crashed, idle
  // or orphaned session lands here. The Notes and messages PAGE filters sessions out and sends a
  // reader to the Sessions page; the FAMILY still contains the kind, so this sentence names runs
  // first rather than describing a group by the two kinds it rarely holds.
  'stopped:notes': 'agent runs, notes and messages that stopped short',
  'stopped:item': 'checklist items that stopped short',
  'stopped:block': 'pipeline blocks that stopped short',
  // A KIND NOBODY FILED IN A FAMILY IS NOT THE SAME AS A KIND SOMEBODY TOOK OUT OF ONE. A message
  // left the notes family under criterion E1 of design/entries, and is
  // read in the chat, at Messages and on the record it is about; `KINDS_READ_ON_THEIR_OWN_PAGE` in
  // @shared/work.ts is where that is declared. Without this group a stopped message fell into
  // `stopped:no-family`, whose words say no family covers it — true of the table and false of the
  // product, because a place was chosen for it. The two are told apart here for the same reason
  // Everything's facet bar and a record's breadcrumb tell them apart.
  'stopped:own-page': 'Set aside',
  'stopped:no-family': 'records of a kind no family covers, stopped short',
}

/** Every candidate that is NOT selected lands in exactly one of these, with a sentence. */
export const PASSED_OVER_BUCKETS = [
  'discharged',
  // TWO PAUSE BUCKETS, NOT ONE. A pause still inside the date it named is work that is being held
  // back on purpose; a pause Mole Office cannot date at all is work nobody can say anything about. One
  // bucket for both would report "6 paused" and answer neither question.
  'paused_waiting',
  'paused_cannot_tell',
  'unclassified',
  'no_state_written',
  'no_state_field',
  // NOT a fourth spelling of "no state". A direction HAS a progress word; it is called `depth`, it
  // is required, it is validated, and it is measured on a ladder of its own. Filing it beside a note
  // that genuinely has nothing was the defect decision 15 names.
  'progress_on_its_own_ladder',
  // NOT a fifth spelling of "no state" either, and the argument is the direction's argument again. A
  // report is writing for a person to read. It is not work, so there is no state word missing from
  // it, and filing it under "its kind has no state field" would say a report is like a note nobody
  // queries — which is the failure the report kind was added to end. What a report DOES have is a
  // reader, and whether that reader has read it comes back in `reports`.
  'written_for_a_person_to_read',
  'unknown_kind',
  'not_started',
  'in_flight',
  'finished',
  'unknown',
  'machine',
] as const
export type PassedOverBucket = (typeof PASSED_OVER_BUCKETS)[number]

/** One sentence per bucket, phrased as a fact about the record a person can check against it. */
export const PASSED_OVER_SENTENCES: Readonly<Record<PassedOverBucket, string>> = {
  discharged: 'the promise is recorded as kept, so it is no longer owed',
  paused_waiting:
    'it was deliberately put down and the date it was put down until has not arrived, so the pause is still doing its job',
  paused_cannot_tell:
    'it was deliberately put down and nothing Mole Office can check says when it comes back — the paused list says which of open-ended, a condition in words, another record, or an unreadable date each one is',
  unclassified: 'nobody has said what its state word means — see the unclassified list',
  no_state_written: 'its kind carries a state and none was written on this record',
  no_state_field: 'records of this kind have no state field, so there is no word to read',
  progress_on_its_own_ladder:
    'it is a direction, and a direction records its progress as `depth` on a six-rung ladder of its own rather ' +
    'than as a state word — the rung each one has reached is in the `directions` list. No rung is a reason to act ' +
    'today: a direction at "noticed" is a question somebody wrote down and has not taken further, which is what ' +
    'the kind is for. One reaches the attention list the way every other kind does — a stored consequence, a pause ' +
    'that ran past its date, or somebody outside waiting on it',
  written_for_a_person_to_read:
    'it is a report — something written for a person to read. A report is not work, it has no state ' +
    'word, and nothing about it can stop short, so this rule never ranks one against work. What it ' +
    'has instead is a reader, and the `reports` list says who each one is for, which day it is about, ' +
    'and whether that person has been recorded as having read it — "read", "unread", or nobody has ' +
    'said, which is the third answer and the common one',
  unknown_kind: 'Mole Office does not know this kind, so it cannot say whether a state was expected',
  not_started: 'its state word says the work has not begun, so nothing has stopped',
  in_flight: 'its state word says somebody is on it right now',
  finished: 'its state word says the work reached its end',
  unknown: 'it is recorded as genuinely undetermined, which is not the same as having stopped',
  machine: 'a held process carries no state word and is owed to nobody; it is counted here instead',
}

// ============================================================================ pause standing

/**
 * WHERE ONE PAUSE STANDS: has its resume condition come due, is it still waiting, or can Mole Office
 * not tell — and, when it cannot tell, WHY not.
 *
 * `pauseElapsed` answers the first question with true, false or null. Null is the interesting one:
 * it is four different situations wearing one value, and a screen that printed "Mole Office cannot tell"
 * four times would be hiding four different things to do. So this splits the null.
 *
 * Only the FIRST of these puts a record on the attention list. The rest are counted and named.
 */
export const PAUSE_STANDINGS = [
  /** It named a date, and that date has passed. The decision expired; somebody has to renew it. */
  'resume-date-passed',
  /** It named a date and that date is still ahead. The pause is working. */
  'waiting-for-date',
  /** It named a date Mole Office cannot read, so it cannot say whether that date has passed. */
  'date-unreadable',
  /** It resumes on a condition written in prose. A person has to judge it; Mole Office cannot. */
  'condition-in-words',
  /** It resumes when another record finishes. Checkable in principle — see the header. */
  'waits-on-a-record',
  /** Nothing says what brings it back. Honest and common, and reported as itself. */
  'open-ended',
  /**
   * The state word says paused and no `paused` block was written down. A gap, not a decision.
   *
   * IT SAYS NO **PAUSE** WAS RECORDED, NEVER THAT NO **REASON** EXISTS, and the difference started
   * mattering the day `parked` was classified. An `idea` in state `parked` reaches this standing
   * with its reason sitting in `parked_because`, which is the field the kind declares for exactly
   * that job — "Without this, a parked idea reads as a forgotten one" — so the old wording made
   * this rule tell the reader the opposite of what the record says. `readPause` reads one field,
   * `data.paused`, and this standing reports what that read found and nothing more. Whether a
   * parked idea should be carrying a `paused` block at all is §15 of design/DECISIONS-PENDING.md.
   */
  'no-pause-recorded',
] as const
export type PauseStanding = (typeof PAUSE_STANDINGS)[number]

/** One sentence per standing, so every surface says the same thing about the same situation. */
export const PAUSE_STANDING_SENTENCES: Readonly<Record<PauseStanding, string>> = {
  'resume-date-passed': 'the date it was put down until has passed, so it is on the attention list',
  'waiting-for-date': 'the date it was put down until is still ahead, so the pause is still doing its job',
  'date-unreadable': 'the resume date stored on it is not one Mole Office can read, so it cannot say whether it has passed',
  'condition-in-words': 'it comes back on a condition written in words, which Mole Office cannot check',
  'waits-on-a-record': 'it comes back when another record finishes, and Mole Office does not check that record',
  'open-ended': 'nothing says what brings it back, which is honest and common and is reported as itself',
  get 'no-pause-recorded'() { return en['sheet.pause.noReasonMeaning'] },
}

/**
 * Which of the seven a pause is in, from the pause itself and `pauseElapsed`'s three-way answer.
 *
 * The order of the checks is the order of how much Mole Office can say. A stored date it can read beats
 * everything, because it is the only condition this file can decide; a condition in words beats an
 * open-ended pause, because somebody at least wrote down what to watch for.
 */
export function pauseStandingOf(pause: Pause | null, elapsed: boolean | null): PauseStanding {
  if (pause === null) return 'no-pause-recorded'
  if (elapsed === true) return 'resume-date-passed'
  if (elapsed === false) return 'waiting-for-date'
  const until = pause.until
  if (until === undefined) return 'open-ended'
  if (until.date !== undefined) return 'date-unreadable'
  if (until.condition !== undefined) return 'condition-in-words'
  if (until.recordId !== undefined) return 'waits-on-a-record'
  return 'open-ended'
}

// ============================================================================ input

/**
 * One thing alive on the machine that no live session claims.
 *
 * A STRUCTURAL SUBSET of `UnclaimedResource` in src/server/lib/resources.ts, and deliberately not
 * an import of it: that file talks to /proc and spawns nvidia-smi, and nothing in src/shared may
 * drag the operating system into the browser. The real object satisfies this shape as it stands.
 *
 * These are never selected. A held process has no state word and is owed to nobody, so neither half
 * of the rule reaches it — and its count is set by the operating system rather than by the work, so
 * mixing it into the research would let a machine covered in abandoned servers push a late promise
 * off the screen. They come back counted and named in `machine`, which is the answer to "26 things
 * are running that nobody claims, and none of them is on the list — why".
 */
export interface MachineResourceRef {
  /** "port", "process", "gpu", "container". */
  type: string
  /** The port number, the pid, or the container name, as text. */
  key: string
  /** What it is, in one line. */
  detail: string
  /** What Mole Office can and cannot say about who started it, in the sweep's own words. */
  note?: string
}

export interface AttentionInput {
  /** The clock, in milliseconds. Passed in so the rule has none of its own. */
  now: number
  /** Every record. Deleted ones are counted and then left out; they are not work. */
  records: readonly PanelRecord[]
  /** Typed links. `blocks` carries the promise outwards; `consumes` says who stands behind a thing. */
  links: readonly Link[]
  /** The change log, in any order. Used to date when a record ENTERED its current state. */
  changes: readonly Change[]
  /** What the machine sweep found. Counted, never selected. */
  resources: readonly MachineResourceRef[]
  /**
   * Read a due stamp, in milliseconds, or null when it is not a date.
   *
   * HANDED IN ON PURPOSE. A bare date is due at the END of that day, and that rule already exists
   * once — `parseDueStamp` in src/web/lib/attention.ts. See the header: a second copy here is the
   * defect this codebase keeps producing.
   */
  dueMs: (stamp: string) => number | null
}

// ============================================================================ output

/** What one factor contributed to a row's rank, and why. */
export interface RankFactor {
  name: FactorName
  /** Always between 0 and FACTOR_MAX[name]. Zero is a real answer and is reported, not dropped. */
  points: number
  /** One sentence quoting the stored value the points came from, or saying it is absent. */
  why: string
}

/**
 * The record whose finishing makes a promise due, and whether it has finished.
 *
 * MOLE OFFICE CHECKS THIS, AND IT IS THE ONLY PLACE THAT DOES. `Due.recordId` is declared in work.ts as
 * "checkable, by a caller that has the rows" — work.ts hands the question over rather than answering
 * it — and this rule holds every record. Compare `Pause.until.recordId`, which is deliberately NOT
 * checked here, because `pauseElapsed` already answers "is this pause over" and a second reading
 * beside it would be two arbiters with nothing making them agree.
 */
export interface DueTrigger {
  /** The record id, exactly as stored on `due.recordId`. */
  recordId: string
  /** Its title, or null when no live record answers to that id. */
  title: string | null
  /**
   * True when its own state word says it reached its end, false when it says it has not, and NULL
   * when Mole Office cannot tell: no live record answers to the id, or the record carries no state word.
   * NULL IS NOT "NO" — `note` says which of the three this is.
   */
  finished: boolean | null
  /** One sentence naming the stored values this was read from, and what it means for lateness. */
  note: string
}

/** Somebody outside this project is waiting, and what for. */
export interface OwedFact {
  /** Who is waiting, exactly as stored in `owedTo`. Never inferred from a title. */
  party: string
  /** The record carrying the promise. The row itself when `hops` is 0. */
  throughRecordId: string
  /** The title of that record, for the sentence on the row. */
  throughTitle: string
  /** 0 when this record carries `owedTo`; 1 when it blocks something that does, and so on. */
  hops: number
  /**
   * The stored due DATE, exactly as written, or null when what was written is not a date at all.
   *
   * NULL NO LONGER MEANS "nobody ever agreed anything", and that is the correction decision 5 asked
   * for. A promise owed "when the reprint lands" has a due — it is in `condition` — and reading this
   * field alone would report it as a promise with nothing agreed. `dueStanding` is the field that
   * says which of the five situations this is.
   */
  due: string | null
  /**
   * The trigger in the author's own words, when the promise comes due on one. Mole Office never evaluates
   * it — a person does — and it is reported beside `due` rather than instead of it, because a
   * promise carrying both a date and a condition has said two things.
   */
  condition: string | null
  /** Where the promise stands on coming due. `dueStandingOf` in work.ts is the one classifier. */
  dueStanding: DueStanding
  /** Set when the promise names a record whose finishing makes it due. Null when it names none. */
  trigger: DueTrigger | null
  /**
   * Milliseconds past the date. Negative means it is still ahead.
   *
   * NULL WHENEVER THERE IS NO TRUTHFUL LATENESS TO STATE, which is every form but a readable date:
   * no date, an unreadable one, a condition in words, or a record. It means "there is no lateness to
   * measure" and never "it is not late" and never zero. No deadline is invented so that a promise
   * can be scored, and no duration is invented once one comes due.
   */
  lateMs: number | null
}

/** Where a "how long has this sat" reading came from. Never a guess, and never omitted. */
export type SinceSource =
  /** The change row that put the record into the state it is in now. The strongest answer. */
  | 'state-change'
  /** The record's own updated stamp: when ANYTHING on it last changed, not when it stopped. */
  | 'record-updated'
  /** The record the item or step sits in. An item carries no time of its own. */
  | 'parent-record-updated'
  /** Nothing readable. The row then earns nothing for age and says so. */
  | 'none'

/** Its own word says the work began and did not finish. */
export interface StoppedShortFact {
  /** The word, exactly as stored. */
  state: string
  /** When it entered that state, as a stored stamp, or null when nothing records it. */
  since: string | null
  sinceSource: SinceSource
}

/** A pause that has run past the date it was set until. The third way onto the list. */
export interface PauseElapsedFact {
  /** When it was put down, as stored. */
  since: string
  /** Why, in the author's own words. */
  why: string
  /** The resume date, exactly as stored. */
  date: string
  /** Milliseconds past that date. Null only if the stamp stopped being readable between two
   *  reads of it, which cannot happen — so it is reported rather than assumed away. */
  pastMs: number | null
}

export interface AttentionReason {
  /**
   * Which part of the rule put it on the list, when more than one applies.
   *
   * `owed` first, because who is waiting is the sharpest sentence. Then `stopped_short`, because a
   * word saying the work fell over is a statement about the work. `pause_elapsed` last: it is a
   * statement about a DECISION that expired, which is the weakest of the three claims and the one
   * a reader most needs the other two facts beside. Every fact that applies is below either way.
   */
  selectedBy: 'owed' | 'stopped_short' | 'pause_elapsed'
  owed: OwedFact | null
  stoppedShort: StoppedShortFact | null
  /**
   * Set when a pause on this record has run past its date. Null on every other row.
   *
   * OPTIONAL IN THE TYPE AND ALWAYS WRITTEN BY THE RULE, and that is not a default hiding in a
   * type. `computeAttention` sets it on every row it builds, so anything reading a real reply gets
   * `PauseElapsedFact` or `null` and never `undefined`. It is optional only so that the hand-built
   * reason objects in tests/pipeline-flow.test.ts and tests/shell-nav.test.ts keep compiling —
   * those files belong to other agents this phase and are not this one's to edit. Absent and null
   * mean the same thing here, which is why widening it costs nothing: it should be made required
   * the moment those two fixtures carry the field.
   */
  pauseElapsed?: PauseElapsedFact | null
  /** Who is hurt, as STORED. Null means nobody has recorded it, which is said rather than assumed. */
  consequence: Consequence | null
  /** True when `isSafety()` put this above everything that is not safety. */
  safetyFloor: boolean
  /** One sentence saying why it is on the list at all, quoting stored values and no durations. */
  because: string
  /**
   * The clauses of `because` that a page draws, each as a code and its values, so a page can say
   * them in its own language while `because` stays English for agents. Built by the same function
   * as `because`, clause for clause. Which clauses are coded, and why the others are not, is said in
   * src/shared/attention-reasons.ts. Empty when none of the coded clauses applies.
   */
  coded: CodedReason[]
  /** Every factor that was considered, with its contribution. Zeroes included, with the reason. */
  factors: RankFactor[]
}

export interface AttentionRow {
  /** Stable across recomputes, so a list can keep a row's identity. */
  key: string
  shape: 'record' | 'checklist_item'
  recordId: string
  recordKind: RecordKind
  /** The checklist part, when the row is an item inside one. */
  partId: string | null
  /** The item or step id, when the row is not the record itself. */
  itemId: string | null
  title: string
  /** The stored state word, exactly as written. Null when the row has none — an obligation has no
   *  state field, and is on the list because it is owed. */
  state: string | null
  progress: Progress | null
  group: ReasonGroup
  /** The sum of the factors. Comparable only against other rows from the same run. */
  score: number
  safety: boolean
  reason: AttentionReason
  /** Why this row is not visible. Null on a visible row. */
  displacedBy: 'group-cap' | 'row-cap' | null
  /**
   * HOW THE RECORD BEHIND THIS ROW ENTERED THE CORPUS — `fixture`, `authored`, or null when nobody
   * has said. Copied from the record, never inferred, and recomputed on every request.
   *
   * WHY A DERIVED ROW CARRIES IT. `origin` was on every record and on none of the rows a reader
   * meets first, so the mark existed and never reached a screen. Measured 2026-08-12 in one
   * project, where 187 of 187 records are fixture: the top visible row reads "The rig keeps moving
   * after the stop button is pressed, and somebody stands next to it during transplant trials",
   * drawn with no mark at all, and an agent told to trust that screen escalates a fabricated safety
   * incident. Checking cost one extra request per row.
   *
   * IT IS NOT THE DUPLICATION THIS REPOSITORY KEEPS FINDING, and that was checked before it was
   * written rather than assumed. The test is whether the record's `origin` could change and leave
   * this wrong with nothing failing. It could not: no attention, session or link-neighbour row is
   * stored anywhere — `attentionNow` reads `listRecords` fresh on every request and there is no
   * materialised table — so this is a projection of one fact, like `gateLabel` and `incompleteCount`
   * beside it, and not a second copy of it.
   */
  origin: RecordOrigin | null
}

export interface GroupCount {
  group: ReasonGroup
  label: string
  count: number
}

/** A state word nobody has classified. A question for a person, never a verdict. */
export interface UnclassifiedRow {
  key: string
  recordId: string
  recordKind: RecordKind
  title: string
  state: string
  /** `unclassifiedNote()` from work.ts, so every surface asks it the same way. */
  note: string
  /** See `AttentionRow.origin`. */
  origin: RecordOrigin | null
}

/** No state at all, which is a different thing from a word nobody has classified. */
export interface NoStateRow {
  key: string
  recordId: string
  recordKind: RecordKind
  title: string
  /** True when the kind declares a `state` field, so one was expected and never written. Null when
   *  Mole Office does not know the kind at all. */
  expected: boolean | null
  note: string
  /** See `AttentionRow.origin`. */
  origin: RecordOrigin | null
}

/**
 * A direction and how far it has been taken. AN ANSWER, NOT A QUESTION.
 *
 * The other three lists this rule returns in full are questions for a person — a word nobody has
 * classified, a state that was expected and never written, work somebody put down. This one is not.
 * Every row here carries a required, validated progress word; it is simply measured on the
 * direction's own ladder and is not a reason to act today. It is returned in full for the same
 * reason those are: so a screen can show WHY these records are off the list, in their own language,
 * instead of the count being a number nobody can open.
 */
export interface DirectionRow {
  key: string
  recordId: string
  title: string
  /** The rung reached, or null when `depth` is absent or is not one of the six. */
  depth: DirectionDepth | null
  /** Which rung, counting from 1, or null. "rung 2 of 6" is a thing a reader can draw. */
  rung: number | null
  /** How many rungs the ladder has, so a screen never counts them itself. */
  rungs: number
  /** `depthReading().note` from types.ts, so this and every other surface say the same sentence. */
  note: string
  /** See `AttentionRow.origin`. */
  origin: RecordOrigin | null
}

/**
 * SOMETHING WRITTEN FOR A PERSON TO READ, AND WHETHER THAT PERSON HAS READ IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REPORT IS IN THE ATTENTION REPLY AT ALL, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * IT IS NOT RANKED AND IT NEVER WILL BE. A report is not work. It cannot be late, nothing blocks
 * it, and it carries no state word for `progressOf` to read, so no clause of the rule at the head of
 * this file can select one. This list sits beside `directions` for exactly the reason that one
 * exists: the rule has to be able to say WHY a record is off the ranked list, in that record's own
 * language, instead of leaving a number nobody can open.
 *
 * WHAT IT IS. A report says who it is for and it is dated, and a report nobody has read is a person
 * still waiting. That is a real thing to put in front of somebody and it is a different thing from
 * work, so it is a different list, drawn its own way, in the colour that already means a person is
 * waiting. Ranking it against a late promise would be inventing an urgency the record does not have.
 *
 * WHAT IT IS ABOUT IS A LINK, NOT A FIELD. `about` links out of the report are resolved here, once,
 * so a module's page and this list name the same subject and cannot come to disagree about it.
 */
export interface ReportRow {
  key: string
  recordId: string
  title: string
  /** Who it is written for, exactly as stored. Null when nobody wrote it down. */
  for: string | null
  /** The day it is ABOUT, exactly as stored. Null when nobody wrote it down. */
  date: string | null
  /**
   * When the report was filed, which is the record's own creation stamp and NOT `date`.
   *
   * `date` is the day the report is about, so it is the wrong field to order a list of what has
   * just been written to a person. A screen that wants "the newest first" orders on this.
   */
  filedAt: string
  /**
   * Whether the person it is for has read it. NULL IS THE THIRD ANSWER AND IT IS NOT `unread`.
   *
   * `read` and `unread` are both statements somebody made. Null is a gap in the record: nobody has
   * said. A reader that prints null as "unread" is putting a claim about a person's eyes into a
   * field nobody filled in, which is the fifth invariant failing in one word.
   */
  read: ReportReadAnswer | null
  /**
   * True while nothing says the reader has read it — `read` is `unread` or nobody has said.
   *
   * DERIVED HERE AND NOT ON EVERY SURFACE. Home draws one list and a module page draws another, and
   * two screens working out "is this still waiting" separately is how the two come to disagree. It
   * is a weaker claim than `read` on purpose, and the row says which of the two answers produced it.
   */
  waiting: boolean
  /** How many blocks it holds. Zero means the report is a title with nothing under it yet. */
  blocks: number
  /** What it is about, from its `about` links. Empty is a real answer: it is about nothing named. */
  about: { recordId: string; title: string }[]
  /** One sentence saying where this report stands with its reader, written from the stored fields. */
  note: string
  /** See `AttentionRow.origin`. */
  origin: RecordOrigin | null
}

/** Deliberately put down, with the reason and whatever should bring it back. */
export interface PausedRow {
  key: string
  recordId: string
  recordKind: RecordKind
  title: string
  /** Null when the state word says paused but no reason was recorded. That gap is worth seeing. */
  pause: Pause | null
  /**
   * True when the pause carried a date and that date has passed. Null when Mole Office cannot tell —
   * an open-ended pause, or one whose condition is written in prose. Null is not "no".
   */
  dueToResume: boolean | null
  /**
   * The same answer with the null split four ways, so a screen can say WHICH kind of "cannot tell"
   * this is instead of printing one sentence over four different situations.
   */
  standing: PauseStanding
  /** True when it is ALSO on the attention list — because its pause expired, or because a pause
   *  does not cancel a promise somebody outside is still waiting on. */
  onList: boolean
  note: string
  /** See `AttentionRow.origin`. */
  origin: RecordOrigin | null
}

/** Alive on the machine, claimed by nobody. Counted here, never ranked. */
export interface MachineRow {
  key: string
  type: string
  resourceKey: string
  detail: string
  note: string | null
  why: string
}

export interface PassedOverGroup {
  bucket: PassedOverBucket
  sentence: string
  count: number
  /** Every key in the bucket, so nothing is a number a person cannot open. */
  keys: string[]
}

export interface AttentionResult {
  /** What a person reads first. At most VISIBLE_ROWS, in rank order, never one reason on its own. */
  visible: AttentionRow[]
  /** Selected and not shown, in rank order, each saying which cap moved it. */
  remainder: AttentionRow[]
  /** visible.length + remainder.length. Exactly, always. */
  total: number
  /** What the remainder is made of, by named group. Never the word "more" on its own. */
  remainderByGroup: GroupCount[]
  /** The same as one sentence: "3 things that happened and stopped short, 2 …". Null when nothing
   *  was cut. */
  remainderNote: string | null
  unclassified: UnclassifiedRow[]
  noState: NoStateRow[]
  /**
   * Every direction that reached none of the other answers, with the rung it has been taken to.
   *
   * NOT a slice of `noState`, and that is the point of it: a direction is not a record missing its
   * state word. See the header, and §15 of design/DECISIONS-PENDING.md.
   */
  directions: DirectionRow[]
  /**
   * Every report in this project, with who it is for and whether that person has read it.
   *
   * IN FULL, LIKE `directions`, AND FOR THE SAME REASON — see `ReportRow`. It is not a slice of
   * `noState`: a report is not a record missing its state word, it is writing addressed to somebody.
   */
  reports: ReportRow[]
  paused: PausedRow[]
  machine: MachineRow[]
  /** Everything not selected, in named buckets with a sentence each. Nothing falls outside one. */
  passedOver: PassedOverGroup[]
  counts: {
    /** Records, checklist items and machine resources considered. */
    candidates: number
    selected: number
    visible: number
    remainder: number
    /** candidates - selected. The sum of every passedOver bucket. */
    passedOver: number
    /** Deleted records, left out of the population entirely. A deleted thing is not work. */
    deleted: number
  }
}

// ============================================================================ small readers

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/**
 * Does this kind declare a `state` field?
 *
 * Read from KIND_SPECS, which is the schema Mole Office publishes, so "a state was expected here" is a
 * fact about the contract rather than a habit of this file. Null when the kind is not one Mole Office
 * knows — that cannot be answered, so it is not answered.
 */
export function kindDeclaresState(kind: string): boolean | null {
  const spec = KIND_SPECS[kind as RecordKind] as (typeof KIND_SPECS)[RecordKind] | undefined
  if (spec === undefined) return null
  return spec.fields.some((field) => field.key === 'state')
}

/**
 * The same question for the one shape that lives inside a record and has no kind of its own.
 *
 * There used to be two, and the second was `PipelineStep`. A pipeline block has a kind now, so it
 * is answered by `kindDeclaresState` above, from the same `KIND_SPECS` every other record uses.
 */
function shapeDeclaresState(shapeName: 'ProgressItem'): boolean | null {
  const shape = SHAPE_SPECS[shapeName]
  if (shape === undefined) return null
  return shape.fields.some((field) => field.key === 'state')
}

/** Who a thing is owed to, in either of the two spellings the data uses. */
function owedToOf(data: unknown): string | null {
  if (!isObj(data)) return null
  return str(data['owedTo']) ?? str(data['owed_to'])
}

// ============================================================================ reading a report

/**
 * READ ONE REPORT: who it is for, which day it is about, and whether that person has read it.
 *
 * THIS IS THE ONE READER, AND THAT IS THE WHOLE POINT OF IT BEING HERE. Home draws the reports
 * waiting for a person and a module's page draws the reports written about that module. Both need
 * the same four facts off the same record, and two components reading `data.read` themselves is how
 * one screen comes to say a report is waiting while the other says it is not.
 *
 * `about` is handed in because what a report is about is a LINK and not a field. The rule below
 * resolves those links once from the whole link table; a module's page already knows the subject it
 * is drawing. Neither invents one.
 *
 * NOTHING IS INFERRED. A missing `for` comes back null and a missing `read` comes back null, and
 * null is never printed as "unread" — see `ReportRow.read`.
 */
export function reportReading(
  record: PanelRecord,
  about: readonly { recordId: string; title: string }[],
): ReportRow {
  const data = isObj(record.data) ? record.data : {}
  const writtenFor = str(data['for'])
  const date = str(data['date'])
  const rawRead = str(data['read'])
  const read: ReportReadAnswer | null =
    rawRead !== null && (REPORT_READ_ANSWERS as readonly string[]).includes(rawRead)
      ? (rawRead as ReportReadAnswer)
      : null
  const blocks = Array.isArray(data['blocks']) ? data['blocks'].length : 0
  const waiting = read !== 'read'
  return {
    key: `rec:${record.id}`,
    recordId: record.id,
    title: record.title,
    for: writtenFor,
    date,
    filedAt: record.createdAt,
    read,
    waiting,
    blocks,
    about: [...about],
    note: reportNote({ read, writtenFor, date, blocks }),
    origin: record.origin ?? null,
  }
}

/**
 * Why this report is on this list, said in the stored words rather than in a judgement.
 *
 * Every row on the attention surfaces explains itself, and testers named that as the best thing in
 * the product. A report earns the same sentence, built here so that Home and a module's page cannot
 * word the same situation two ways.
 *
 * ONE COMPOSER, TWO READERS (wave 13k round 34). The sentences are word-list keys. `reportReading`
 * hands this `sayInEnglish`, so `note` on a row the API serves is English, as it always was; a page
 * calls `reportNoteOnAPage` with its own `t`, so a Chinese page draws the same sentence in Chinese
 * (wave 13n's round 33, report GMFtAC2grPQg, b-3, saw it English there). `day` is how the date is
 * written: as stored for the API, and in the page's own words on a page.
 */
function reportNote(
  input: {
    read: ReportReadAnswer | null
    writtenFor: string | null
    date: string | null
    blocks: number
  },
  say: Say = sayInEnglish,
  day: (stored: string) => string = (stored) => stored,
): string {
  return sentencesJoined([
    say(
      input.read === 'read'
        ? 'attention.report.markedRead'
        : input.read === 'unread'
          ? 'attention.report.markedUnread'
          : 'attention.report.readNotSaid',
    ),
    input.writtenFor === null ? say('attention.report.forNobody') : say('attention.report.forWhom', { who: input.writtenFor }),
    input.date === null ? say('attention.report.dayNone') : say('attention.report.day', { day: day(input.date) }),
    ...(input.blocks === 0 ? [say('attention.report.empty')] : []),
  ])
}

/** A report row's sentence in a page's language: `say` is the page's `t`, `day` its reader of a stored day. */
export function reportNoteOnAPage(row: ReportRow, say: Say, day: (stored: string) => string): string {
  return reportNote({ read: row.read, writtenFor: row.for, date: row.date, blocks: row.blocks }, say, day)
}

// ============================================================================ saying you read one

/**
 * WHO MAY SAY A REPORT HAS BEEN READ. Only a person, and this is the one place that says so.
 *
 * IT IS THE PLAN'S RULE, APPLIED TO THE SAME CLAIM. `markPlanRead` in src/server/lib/plans.ts
 * answers 403 to an agent and 403 to a request that sent no actor headers at all, because an absent
 * header is not evidence that a person read anything — where such a request is answered at all, it is
 * filed as the person by default. "I have read this" is a claim about somebody's eyes and nobody else can make it.
 * The plan's door has one way more since wave 13s round 81: a secretary may mark a plan for the person under their
 * grant, where this office's list lets the grant press it, and the plan stores which secretary did. A report has no
 * such way, so this rule stays a person's alone.
 *
 * WHY THE RULE IS IN src/shared AND NOT IN THE WRITE PATH. The browser has to know it, to refuse the
 * press rather than to send a write it knows will be refused; the write path has to enforce it,
 * because a refusal only the browser knows is not a refusal. Two hand-written copies of one sentence
 * is the defect this repository keeps finding, so there is one function and both call it.
 *
 * **THE SERVER DOES NOT CALL IT YET.** The record write path is `src/server/lib/records.ts`, which
 * this phase does not own, so today only the browser asks. That means `PATCH /api/records/<report>`
 * with `data.read` still accepts an agent, and the exact edit that closes it is in this phase's
 * report. Until it lands, this is a browser rule and not a guarantee, which is said here rather than
 * left for somebody to discover.
 */
export interface ReadingActor {
  type: ActorType
  id: string
  /** False when the request carried no identity at all. Absent means the caller did not say. */
  stated?: boolean
}

export function mayMarkReportRead(actor: ReadingActor): boolean {
  return actor.type === 'human' && actor.stated !== false
}

/** What to say when somebody who is not a person tries to mark a report read. One wording, twice. */
export function reportReadRefusal(actor: ReadingActor): string {
  const cost =
    'An agent that marks a report read takes away the one sign that the writing reached the person ' +
    'it was written for.'
  if (actor.stated === false) {
    return (
      'Only a person can say they have read a report, and this request sent no identity, so nothing ' +
      `said who is asking. Nothing was written. ${cost}`
    )
  }
  return (
    `Only a person can say they have read a report, and this came from ${actor.type} "${actor.id}". ` +
    `Nothing was written. ${cost}`
  )
}

/**
 * Has this record reached its end, by its own state word?
 *
 * ONE READING, TWO CALLERS, DELIBERATELY. The `blocks` walk stops at a finished blocker because a
 * finished thing is holding nobody up, and a promise owed "when X finishes" comes due when X
 * finishes. That is the same question and it must not be answered two ways in one file.
 *
 * `progressOf` is the arbiter and `null` is a real answer: a record with no state word, or a word
 * nobody has classified, is NOT read as finished. Reading either as finished would be the silent
 * default this product forbids — and on the trigger side it would make a promise come due on a
 * record nobody has said anything about.
 */
function hasReachedItsEnd(record: PanelRecord): boolean {
  return theWorkHasEnded(record.data)
}

/** A change log value, which may or may not be JSON-quoted depending on the field it came from. */
function unquote(value: string): string {
  const trimmed = value.trim()
  if (!trimmed.startsWith('"')) return trimmed
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return typeof parsed === 'string' ? parsed : trimmed
  } catch {
    return trimmed
  }
}

// ============================================================================ the population

interface Candidate {
  key: string
  /**
   * TWO SHAPES, NOT THREE. `pipeline_step` was the third until a block became a record.
   *
   * Everything that shape existed to work around went with it. A step's age was its PIPELINE's
   * `updatedAt`, because a nested object carries no stamp of its own; a block has its own. `owed`
   * was computed only for `shape === 'record'`, so half the attention rule could never fire on a
   * step; it fires on a block. And the key was `step:<recordId>:<stepId>`, a composite that nothing
   * enforced and that the API happily served twice for two steps sharing an id.
   */
  shape: 'record' | 'checklist_item'
  record: PanelRecord
  partId: string | null
  itemId: string | null
  title: string
  /** The bag the state, consequence and pause are read from: the record's data, or the item. */
  bag: unknown
}

function buildCandidates(records: readonly PanelRecord[]): { candidates: Candidate[]; deleted: number } {
  const candidates: Candidate[] = []
  let deleted = 0
  for (const record of records) {
    if (record.deletedAt !== null) {
      deleted++
      continue
    }
    candidates.push({
      key: `rec:${record.id}`,
      shape: 'record',
      record,
      partId: null,
      itemId: null,
      title: record.title,
      bag: record.data,
    })

    const data = isObj(record.data) ? record.data : {}

    // Checklist items, wherever a kind keeps them. A module's parts are the usual case; the reader
    // does not check the kind, because a checklist is a checklist.
    const parts = Array.isArray(data['parts']) ? data['parts'] : []
    parts.forEach((part, partIndex) => {
      if (!isObj(part)) return
      const partId = str(part['id']) ?? `${record.id}-part-${partIndex}`
      const partName = str(part['name'])
      const items = Array.isArray(part['items']) ? part['items'] : []
      items.forEach((item, itemIndex) => {
        if (!isObj(item)) return
        const itemId = str(item['id']) ?? `${partId}-item-${itemIndex}`
        const text = str(item['text'])
        candidates.push({
          key: `item:${record.id}:${itemId}`,
          shape: 'checklist_item',
          record,
          partId,
          itemId,
          // No invented title. A row with no text says that it has none and where it lives.
          title: text ?? `(an item with no text in "${partName ?? partId}")`,
          bag: item,
        })
      })
    })

    // NO PIPELINE-STEP BRANCH. A pipeline block is a record of kind `block`, so it was already
    // pushed as a candidate above, with its own key, its own stamp and its own `owed` computation.
  }
  return { candidates, deleted }
}

// ============================================================================ the link graph

interface Graph {
  /** recordId -> the records it blocks. */
  blocksOut: Map<string, string[]>
  /** recordId -> the records that block it. */
  blocksIn: Map<string, string[]>
  /** recordId -> the records that consume it. */
  consumedBy: Map<string, string[]>
}

function buildGraph(links: readonly Link[], live: ReadonlySet<string>): Graph {
  const blocksOut = new Map<string, string[]>()
  const blocksIn = new Map<string, string[]>()
  const consumedBy = new Map<string, string[]>()
  const push = (map: Map<string, string[]>, key: string, value: string): void => {
    const list = map.get(key)
    if (list === undefined) map.set(key, [value])
    else list.push(value)
  }
  for (const link of links) {
    // A link whose other end has been deleted is a broken link. It is a fact about the archive and
    // not a piece of work, so it carries no promise and nothing stands behind it here.
    if (!live.has(link.fromId) || !live.has(link.toId)) continue
    if (link.type === 'blocks') {
      push(blocksOut, link.fromId, link.toId)
      push(blocksIn, link.toId, link.fromId)
    } else if (link.type === 'consumes') {
      push(consumedBy, link.toId, link.fromId)
    }
  }
  return { blocksOut, blocksIn, consumedBy }
}

// ============================================================================ the rule

/**
 * Apply the rule, rank what it selects, and account for everything it does not.
 *
 * Pure. Same input, same output, and the output is fully ordered — ties are broken on the row key
 * so two runs over the same data cannot disagree about which of two equal rows came first.
 */
export function computeAttention(input: AttentionInput): AttentionResult {
  const { now, records, links, changes, resources, dueMs } = input

  const { candidates, deleted } = buildCandidates(records)
  const byId = new Map<string, PanelRecord>()
  for (const record of records) if (record.deletedAt === null) byId.set(record.id, record)
  const graph = buildGraph(links, new Set(byId.keys()))
  const stateSince = readStateSince(changes, byId)

  // ---- who is owed, including through the blocks chain --------------------------------------
  const owedByRecord = walkOwed(byId, graph, dueMs, now)

  // ---- decide each candidate ------------------------------------------------------------------
  const rows: AttentionRow[] = []
  const unclassified: UnclassifiedRow[] = []
  const noState: NoStateRow[] = []
  const directions: DirectionRow[] = []
  const reports: ReportRow[] = []
  const paused: PausedRow[] = []

  /**
   * What each report is about, resolved from the `about` links ONCE.
   *
   * A report says what it is about through a link and never through a field, so this is the only
   * reading of it — the module's page reads the same link from the other end. A link to a record
   * that is not live is left out rather than drawn as a subject with no name.
   */
  const aboutByReport = new Map<string, { recordId: string; title: string }[]>()
  for (const link of links) {
    if (link.type !== 'about') continue
    const subject = byId.get(link.toId)
    if (subject === undefined) continue
    const from = byId.get(link.fromId)
    if (from === undefined || from.kind !== REPORT_KIND) continue
    const list = aboutByReport.get(link.fromId)
    const entry = { recordId: subject.id, title: subject.title }
    if (list === undefined) aboutByReport.set(link.fromId, [entry])
    else list.push(entry)
  }
  const buckets = new Map<PassedOverBucket, string[]>()
  const bucket = (name: PassedOverBucket, key: string): void => {
    const list = buckets.get(name)
    if (list === undefined) buckets.set(name, [key])
    else list.push(key)
  }

  for (const candidate of candidates) {
    const { record, bag } = candidate
    const rawState = stateOfWork(bag)
    const progress = progressOf(rawState)
    const stateWord = typeof rawState === 'string' ? rawState.trim() : null
    const consequence = readConsequence(bag)
    const pause = readPause(bag)
    const owed = candidate.shape === 'record' ? (owedByRecord.get(record.id) ?? null) : null

    const isPaused = progress === 'paused' || pause !== null
    const elapsed = pause === null ? null : pauseElapsed(pause, now, dueMs)
    const standing = pauseStandingOf(pause, elapsed)

    // A LIVE pause beats the word. `state: "blocked"` on a thing somebody deliberately put down
    // last week has not stopped short; it is waiting on purpose, and the paused list says why.
    // A pause that has run past its date is not live and holds nothing back: see the header.
    const stoppedShort = theWorkHasStoppedShort(bag, now, dueMs)
    const pauseFact = elapsed === true && pause !== null ? elapsedFact(pause, now, dueMs) : null
    const selected = owed !== null || stoppedShort || pauseFact !== null

    if (isPaused) {
      paused.push({
        key: candidate.key,
        recordId: record.id,
        recordKind: record.kind,
        title: candidate.title,
        pause,
        dueToResume: elapsed,
        standing,
        onList: selected,
        note: pauseNote(pause, standing),
        origin: record.origin ?? null,
      })
    }

    if (selected) {
      rows.push(
        buildRow({
          candidate,
          now,
          progress,
          stateWord,
          consequence,
          owed,
          stoppedShort,
          pauseFact,
          stateSince,
          graph,
          byId,
        }),
      )
      // A paused thing that is also owed is on the list AND in the paused group. Both are true and
      // both are worth seeing; a pause is a decision about your own plans, not about somebody
      // else's. The paused row says `onList: true` so the screen never shows it as put down when
      // it is not.
      continue
    }

    // ---- not selected. Which bucket, and does it need its own visible list? -------------------
    if (isPaused) {
      // `elapsed` here is false or null; true was selected above. The two buckets keep "not yet"
      // apart from "nobody can say", which is the whole reason null is not treated as no.
      bucket(elapsed === false ? 'paused_waiting' : 'paused_cannot_tell', candidate.key)
      continue
    }
    if (candidate.shape === 'record' && owedToOf(record.data) !== null && readFulfilment(record.data).done) {
      bucket('discharged', candidate.key)
      continue
    }
    if (progress === null) {
      // A DIRECTION IS NOT MISSING A STATE, IT IS MEASURED ON A DIFFERENT SCALE. Decision 15.
      //
      // IT IS ASKED HERE AND NOT EARLIER, ON PURPOSE. Every selection the rule makes has already
      // been made above — a stored consequence, a pause that ran past its date, somebody outside
      // waiting, a state word that stopped short — so a direction that needs a person is on the list
      // before this line, and this branch only catches the ones nothing else had anything to say
      // about. It reads `depth` and REPORTS it; there is no path from a rung to a selection, which
      // is what keeps "we should look into X one day" off the list of what needs doing today.
      if (candidate.shape === 'record' && record.kind === DIRECTION_KIND) {
        const reading = depthReading(record.data)
        directions.push({
          key: candidate.key,
          recordId: record.id,
          title: candidate.title,
          depth: reading.depth,
          rung: reading.rung,
          rungs: reading.rungs,
          note: reading.note,
          origin: record.origin ?? null,
        })
        bucket('progress_on_its_own_ladder', candidate.key)
        continue
      }
      // A REPORT IS NOT A RECORD MISSING ITS STATE EITHER, and it is asked here for the same reason
      // the direction is asked here: everything the rule can select on has already been decided
      // above, so nothing about this branch can keep a record off the ranked list. It reads the
      // report and REPORTS it. There is no path from "nobody has read it" to a selection, because a
      // report is not late and nothing is blocked by it — what it is is a person still waiting, and
      // the surfaces draw that in the colour that already means exactly that.
      if (candidate.shape === 'record' && record.kind === REPORT_KIND) {
        reports.push(reportReading(record, aboutByReport.get(record.id) ?? []))
        bucket('written_for_a_person_to_read', candidate.key)
        continue
      }
      const expected =
        candidate.shape === 'record'
          ? kindDeclaresState(record.kind)
          : shapeDeclaresState('ProgressItem')
      noState.push({
        key: candidate.key,
        recordId: record.id,
        recordKind: record.kind,
        title: candidate.title,
        expected,
        note: noStateNote(candidate, expected),
        origin: record.origin ?? null,
      })
      bucket(expected === null ? 'unknown_kind' : expected ? 'no_state_written' : 'no_state_field', candidate.key)
      continue
    }
    if (progress === 'unclassified') {
      // stateWord cannot be null here: progressOf only says `unclassified` about a real word.
      const word = stateWord ?? ''
      unclassified.push({
        key: candidate.key,
        recordId: record.id,
        recordKind: record.kind,
        title: candidate.title,
        state: word,
        note: unclassifiedNote(word),
        origin: record.origin ?? null,
      })
      bucket('unclassified', candidate.key)
      continue
    }
    bucket(bucketForProgress(progress, candidate.key), candidate.key)
  }

  // ---- the machine, counted and named ---------------------------------------------------------
  const machine: MachineRow[] = resources.map((resource) => ({
    key: `res:${resource.type}:${resource.key}`,
    type: resource.type,
    resourceKey: resource.key,
    detail: resource.detail,
    note: resource.note ?? null,
    why: PASSED_OVER_SENTENCES.machine,
  }))
  for (const row of machine) bucket('machine', row.key)

  // ---- rank, then guarantee the spread --------------------------------------------------------
  const ranked = [...rows].sort(compareRows)
  const { visible, remainder } = pickVisible(ranked)

  const remainderByGroup = countByGroup(remainder)
  const remainderNote =
    remainderByGroup.length === 0
      ? null
      : remainderByGroup.map((entry) => `${entry.count} ${entry.label}`).join(', ')

  const passedOver: PassedOverGroup[] = PASSED_OVER_BUCKETS.filter((name) => (buckets.get(name)?.length ?? 0) > 0).map(
    (name) => {
      const keys = buckets.get(name) ?? []
      return { bucket: name, sentence: PASSED_OVER_SENTENCES[name], count: keys.length, keys }
    },
  )
  const passedOverCount = passedOver.reduce((sum, group) => sum + group.count, 0)

  // THE FIVE UNRANKED LISTS ARE SORTED BY KEY, FOR THE REASON `standingBehind` IS.
  //
  // The ranked list is totally ordered by `compareRows`, which ends on the row key, so it comes
  // back from a restore in exactly the same order. These five never had an order at all: they are
  // pushed in the order candidates arrive, which is the order `listRecords()` returns rows, which
  // is `updatedAt` and then rowid. A restore renumbers rowids, so the destructive restore proof
  // measured the no-state list coming back with the same 97 keys in a different order.
  //
  // The key is the right thing to sort on rather than the title: it is what every other part of
  // this reply identifies a row by, it is unique, and it does not move when somebody renames a
  // record. None of these five is a ranking — three of them are questions for a person, and
  // `directions` and `reports` are answers this rule does not rank — so nothing here is claiming one
  // row matters more than the next, only that the same corpus reads the same way twice.
  const byKey = <T extends { key: string }>(rows: T[]): T[] => [...rows].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  return {
    visible,
    remainder,
    total: visible.length + remainder.length,
    remainderByGroup,
    remainderNote,
    unclassified: byKey(unclassified),
    noState: byKey(noState),
    directions: byKey(directions),
    reports: byKey(reports),
    paused: byKey(paused),
    machine,
    passedOver,
    counts: {
      candidates: candidates.length + machine.length,
      selected: rows.length,
      visible: visible.length,
      remainder: remainder.length,
      passedOver: passedOverCount,
      deleted,
    },
  }
}

/**
 * Which bucket a candidate the rule did not select belongs in.
 *
 * A switch rather than a chain of ifs, so that a new word added to PROGRESS in work.ts stops this
 * file compiling instead of quietly falling into a bucket that does not describe it. `paused` and
 * `unclassified` are handled by the caller before this is reached, because both also come back in
 * their own visible list; if either arrives here the rule and this table disagree, and that is a
 * bug worth stopping for rather than filing under something plausible.
 */
function bucketForProgress(progress: Progress, key: string): PassedOverBucket {
  switch (progress) {
    case 'not_started':
      return 'not_started'
    case 'in_flight':
      return 'in_flight'
    case 'finished':
      return 'finished'
    case 'unknown':
      return 'unknown'
    case 'unclassified':
      return 'unclassified'
    case 'paused':
      throw new Error(`${key} is paused and reached the buckets by the wrong road — the caller sorts paused work first`)
    case 'stopped_short':
      throw new Error(`${key} stopped short and was not selected — the rule and the buckets disagree`)
    default: {
      const unhandled: never = progress
      throw new Error(`${key} has progress ${String(unhandled)}, which nothing here classifies`)
    }
  }
}

// ============================================================================ owed

/**
 * Every record somebody outside this project is waiting for, directly or through a blocks chain.
 *
 * DIRECTLY is `owedTo` with a promise that is not discharged. `readFulfilment` decides discharged,
 * and it reads `data.done` — the field kinds.ts has declared all along and nothing ever wrote.
 *
 * THROUGH A CHAIN is the `blocks` links, walked backwards from each promise: whatever blocks a
 * promise is holding that promise up, and whatever blocks THAT is holding it up one step further
 * away. Each step costs HOP_DECAY, so the chain fades rather than stopping at an arbitrary depth.
 *
 * The walk stops at anything whose word says it FINISHED, because a finished thing is not blocking
 * anybody. It does NOT stop at a word nobody has classified: reading an unclassified word as
 * finished would be a guess, and this product does not guess.
 *
 * Breadth first, so a record reached by two chains keeps the SHORTEST one, which is the one that
 * describes it best.
 *
 * WHEN each promise comes due is read through `readDue`, `dueStandingOf` and `latenessMs` in
 * work.ts, and never off `data.due` here. A promise owed on a trigger rather than a date has a
 * `lateMs` of null, which stays null: see the header for why no deadline is invented for it.
 */
function walkOwed(
  byId: ReadonlyMap<string, PanelRecord>,
  graph: Graph,
  dueMs: (stamp: string) => number | null,
  now: number,
): Map<string, OwedFact> {
  const found = new Map<string, OwedFact>()
  const queue: { id: string; fact: OwedFact }[] = []

  for (const record of byId.values()) {
    const party = owedToOf(record.data)
    if (party === null) continue
    if (readFulfilment(record.data).done) continue
    const due = readDue(record.data)
    const fact: OwedFact = {
      party,
      throughRecordId: record.id,
      throughTitle: record.title,
      hops: 0,
      // Only when a DATE is what decides. A record id or a condition in words is reported in its own
      // field, because calling either of them "the date agreed" is the substitution this forbids.
      due: due.when === 'date' ? (due.date ?? null) : null,
      // Kept whichever form decides, because a promise carrying both a date and a condition has said
      // two things and a reader is owed both.
      condition: due.condition ?? null,
      dueStanding: dueStandingOf(due, dueMs),
      trigger: readTrigger(due, byId),
      // Null for every form but a readable date. `latenessMs` is the one reader of that, and null
      // there means "there is no lateness to state" rather than "it is not late".
      lateMs: latenessMs(due, now, dueMs),
    }
    found.set(record.id, fact)
    queue.push({ id: record.id, fact })
  }

  while (queue.length > 0) {
    const next = queue.shift()
    if (next === undefined) break
    for (const blockerId of graph.blocksIn.get(next.id) ?? []) {
      if (found.has(blockerId)) continue
      const blocker = byId.get(blockerId)
      if (blocker === undefined) continue
      if (hasReachedItsEnd(blocker)) continue
      const fact: OwedFact = { ...next.fact, hops: next.fact.hops + 1 }
      found.set(blockerId, fact)
      queue.push({ id: blockerId, fact })
    }
  }
  return found
}

/**
 * The record a promise waits on, and whether it has finished. Null when the promise names none.
 *
 * READ WHENEVER `due.recordId` IS WRITTEN, not only when it is the deciding form. A promise carrying
 * both a date and a record has said two things, and `dueStanding` is what says which of them decides
 * whether it is late; dropping the other would be this reader choosing on the author's behalf.
 */
function readTrigger(due: Due, byId: ReadonlyMap<string, PanelRecord>): DueTrigger | null {
  const recordId = due.recordId
  if (recordId === undefined) return null
  const record = byId.get(recordId)
  if (record === undefined) {
    return {
      recordId,
      title: null,
      // NOT false. A promise waiting on a record that is not there has not been shown to be waiting
      // and has not been shown to have come due — nobody can say, and saying "not yet" would be a
      // guess in the direction that keeps it quiet.
      finished: null,
      note: `it comes due when record ${recordId} finishes, and no live record answers to that id, so Mole Office cannot say whether it has`,
    }
  }
  const state = stateOfWork(record.data)
  const word = typeof state === 'string' && state.trim() !== '' ? state.trim() : null
  const progress = progressOf(state)
  if (progress === null || progress === 'unclassified') {
    return {
      recordId,
      title: record.title,
      finished: null,
      note:
        word === null
          ? `it comes due when "${record.title}" finishes, and that record carries no state word, so Mole Office cannot say whether it has`
          : `it comes due when "${record.title}" finishes, and nobody has said what that record's state "${word}" means, so Mole Office cannot say whether it has`,
    }
  }
  if (progress === 'finished') {
    return {
      recordId,
      title: record.title,
      finished: true,
      // The news, and the honest limit on it. It has come due; how late it is nobody has said, and
      // this is where a "0 days late" would have been invented if anywhere.
      note: `"${record.title}" is recorded as "${word ?? ''}", which means it reached its end, so this promise has come due — and nothing says by when it is owed from here, so there is no lateness to measure`,
    }
  }
  return {
    recordId,
    title: record.title,
    finished: false,
    note: `it comes due when "${record.title}" finishes, and that record is recorded as "${word ?? ''}", so it is waiting rather than late`,
  }
}

// ============================================================================ dating

/**
 * When each record ENTERED the state it is in now, read out of the change log.
 *
 * The newest change that set `data.state` to the word the record currently holds. That is a
 * measured answer to "how long has this been stuck", and it is much better than the record's own
 * updated stamp, which moves when anybody edits a title.
 *
 * A record with no such row is absent. The project board asks this too, so a step's age there is the age this list
 * measures.
 */
export function readStateSince(
  changes: readonly Pick<Change, 'field' | 'newValue' | 'recordId' | 'at'>[],
  byId: ReadonlyMap<string, PanelRecord>,
): Map<string, string> {
  const since = new Map<string, string>()
  const sinceMs = new Map<string, number>()
  for (const change of changes) {
    if (change.field !== 'data.state') continue
    if (change.newValue === null) continue
    const record = byId.get(change.recordId)
    if (record === undefined) continue
    const current = isObj(record.data) ? record.data['state'] : undefined
    if (typeof current !== 'string' || unquote(change.newValue) !== current.trim()) continue
    const at = parseLocalStamp(change.at)
    if (at === null) continue
    const best = sinceMs.get(change.recordId)
    if (best !== undefined && best >= at) continue
    sinceMs.set(change.recordId, at)
    since.set(change.recordId, change.at)
  }
  return since
}

/**
 * Since when one record has held its state: the change that put it there, else its own updated stamp, which is later
 * than or equal to that moment and so never makes the age longer than it is. The project board dates its steps with
 * this too.
 */
export function sinceARecordHeldItsState(
  record: Pick<PanelRecord, 'id' | 'updatedAt'>,
  stateSince: ReadonlyMap<string, string>,
): { at: string; source: 'state-change' | 'record-updated' } {
  const entered = stateSince.get(record.id)
  if (entered !== undefined) return { at: entered, source: 'state-change' }
  return { at: record.updatedAt, source: 'record-updated' }
}

/** The stamp a row's age is measured from, and where that stamp came from. Never invented. */
function sinceOf(
  candidate: Candidate,
  stateSince: ReadonlyMap<string, string>,
): { at: string | null; source: SinceSource } {
  if (candidate.shape === 'record') return sinceARecordHeldItsState(candidate.record, stateSince)
  // An item and a step carry no time of their own. The record they sit in is the only measured
  // answer available, and the row says that is what it is.
  return { at: candidate.record.updatedAt, source: 'parent-record-updated' }
}

// ============================================================================ one row

/** The stored facts of a pause that has run out, for the row that pause put on the list. */
function elapsedFact(pause: Pause, now: number, dueMs: (stamp: string) => number | null): PauseElapsedFact | null {
  const date = pause.until?.date
  if (date === undefined) return null
  const at = dueMs(date)
  return { since: pause.since, why: pause.why, date, pastMs: at === null ? null : now - at }
}

function buildRow(args: {
  candidate: Candidate
  now: number
  progress: Progress | null
  stateWord: string | null
  consequence: Consequence | null
  owed: OwedFact | null
  stoppedShort: boolean
  pauseFact: PauseElapsedFact | null
  stateSince: ReadonlyMap<string, string>
  graph: Graph
  byId: ReadonlyMap<string, PanelRecord>
}): AttentionRow {
  const { candidate, now, progress, stateWord, consequence, owed, stoppedShort, pauseFact, stateSince, graph, byId } =
    args
  const since = sinceOf(candidate, stateSince)
  const sinceMs = since.at === null ? null : parseLocalStamp(since.at)
  const safety = isSafety(consequence)

  const stoppedFact: StoppedShortFact | null =
    stoppedShort && stateWord !== null ? { state: stateWord, since: since.at, sinceSource: since.source } : null

  const standing = standingBehind(candidate, graph, byId)
  const factors: RankFactor[] = [
    harmFactor(consequence),
    ...(owed === null ? [] : [owedFactor(owed)]),
    ...(owed === null ? [] : [lateFactor(owed)]),
    standingFactor(standing, candidate.shape),
    satFactor(since.at, sinceMs, now, since.source),
  ]
  const score = factors.reduce((sum, factor) => sum + factor.points, 0)
  const selectedBy: AttentionReason['selectedBy'] = owed !== null ? 'owed' : stoppedShort ? 'stopped_short' : 'pause_elapsed'

  return {
    key: candidate.key,
    shape: candidate.shape,
    recordId: candidate.record.id,
    recordKind: candidate.record.kind,
    // A CHECKLIST ITEM'S PROVENANCE IS ITS MODULE'S. The row is a line inside a record, not a
    // record, so there is nothing else it could honestly say — and a fixture module's checklist
    // items are fixture in exactly the sense the word means: they came in through the seed.
    origin: candidate.record.origin ?? null,
    partId: candidate.partId,
    itemId: candidate.itemId,
    title: candidate.title,
    state: stateWord,
    progress,
    group: groupOf(candidate, selectedBy),
    score,
    safety,
    reason: {
      selectedBy,
      owed,
      stoppedShort: stoppedFact,
      pauseElapsed: pauseFact,
      consequence,
      safetyFloor: safety,
      ...becauseSentence(candidate, owed, stoppedFact, pauseFact, consequence),
      factors,
    },
    displacedBy: null,
  }
}

function groupOf(candidate: Candidate, selectedBy: AttentionReason['selectedBy']): ReasonGroup {
  if (selectedBy === 'owed') return 'owed'
  // A pause that ran out is its own reason, not a stopped-short one, so the group cap can keep six
  // expired pauses from taking the screen away from a crashed session and an overdue report.
  if (selectedBy === 'pause_elapsed') return 'pause-elapsed'
  if (candidate.shape === 'checklist_item') return 'stopped:item'
  // A BLOCK IS STRUCTURE, AND STILL GETS ITS OWN GROUP. `familyOf('block')` is `structure`, which is
  // right for reading — a block belongs under Structure in the rail. It is wrong for the diversity
  // guarantee, which caps each group at three of seven rows: this workspace holds 61 blocks against
  // 12 modules and 9 pipelines, so blocks sharing the structure cap would take the whole group and
  // a stopped module would never be seen beside them. The exception is by KIND rather than by shape
  // because the shape it used to ride on is gone.
  if (candidate.record.kind === BLOCK_KIND) return 'stopped:block'
  // A KIND READ ON A PAGE OF ITS OWN IS NOT A KIND NOBODY FILED. See the label above: a message
  // left the notes family under criterion E1 and is read in the chat, at Messages and
  // on the record it is about. `familyOf` answers null for it, which is right, and `no-family`
  // would then say no family covers it, which is false of the product. This asks the same
  // declaration the other two surfaces ask.
  if (KINDS_READ_ON_THEIR_OWN_PAGE.has(candidate.record.kind)) return 'stopped:own-page'
  const family = familyOf(candidate.record.kind)
  return family === null ? 'stopped:no-family' : `stopped:${family}`
}

/**
 * How much recorded work stands behind this: what it blocks, and what consumes it.
 *
 * Only LIVE records, and only ones whose own word does not say they finished. The measurement that
 * led here found a proposal counting a finished task as standing behind a problem, which is a
 * ranking built on work somebody had already done.
 *
 * A record whose word nobody has classified DOES count. It is live, and reading "nobody has said
 * what this word means" as "finished" is exactly the silent default this product forbids.
 */
function standingBehind(
  candidate: Candidate,
  graph: Graph,
  byId: ReadonlyMap<string, PanelRecord>,
): { ids: string[]; titles: string[] } {
  const id = candidate.record.id
  const seen = new Set<string>()
  const found: { id: string; title: string }[] = []
  for (const otherId of [...(graph.blocksOut.get(id) ?? []), ...(graph.consumedBy.get(id) ?? [])]) {
    if (seen.has(otherId)) continue
    const other = byId.get(otherId)
    if (other === undefined) continue
    if (theWorkHasEnded(other.data)) continue
    seen.add(otherId)
    found.push({ id: otherId, title: other.title })
  }
  // SORTED, BECAUSE THE ORDER THE WALK FINDS THEM IN IS THE DATABASE'S AND NOT THE PRODUCT'S.
  //
  // These titles are printed in one sentence — `4 live records stand behind it: "…", "…"` — and
  // the walk reached them in whatever order `allLinks()` handed the links back, which is rowid
  // order, because that query has no ORDER BY. The destructive restore proof measured what that
  // costs: an archive imported into an empty database renumbers the rowids, so seven attention
  // rows came back with the same records named in a different order, and the proof had to declare
  // the difference rather than hold. Two databases holding identical content must answer this
  // question identically.
  //
  // By title, and by id where two records share one, so the sentence a person reads is in a stable
  // order they could predict. Compared with `<` rather than `localeCompare`, which is locale
  // dependent and would put the same corpus in two orders on two machines — the same defect one
  // layer along. Both arrays are sorted together so `ids[i]` still names `titles[i]`.
  found.sort((a, b) => (a.title === b.title ? (a.id < b.id ? -1 : 1) : a.title < b.title ? -1 : 1))
  return { ids: found.map((f) => f.id), titles: found.map((f) => f.title) }
}

// ============================================================================ the factors

function harmFactor(consequence: Consequence | null): RankFactor {
  if (consequence === null) {
    // NOT a default. Nothing is assumed about who gets hurt; the absence earns nothing and is
    // printed, so a record that ought to carry a consequence can be spotted and given one.
    return {
      name: 'harm',
      points: 0,
      why: 'nobody has recorded who is hurt if this is left alone',
    }
  }
  const points = HARM_POINTS[consequence.bearer]
  return {
    name: 'harm',
    points,
    why:
      consequence.bearer === 'person'
        ? `a person could be hurt: ${consequence.what}`
        : `${consequence.bearer} is hurt if this is left: ${consequence.what}`,
  }
}

function owedFactor(owed: OwedFact): RankFactor {
  const points = Math.round(FACTOR_MAX.owed * Math.pow(HOP_DECAY, owed.hops))
  return {
    name: 'owed',
    points,
    why:
      owed.hops === 0
        ? `${owed.party} is waiting for this`
        : `it blocks "${owed.throughTitle}", which ${owed.party} is waiting for, ${owed.hops} link${owed.hops === 1 ? '' : 's'} away`,
  }
}

/**
 * Why a promise earns nothing for lateness, in the words of what is actually stored on it.
 *
 * THE SENTENCE THIS REPLACED WAS FALSE ON THREE OF THE FIVE STANDINGS. It read "no date was ever
 * agreed for this promise" whenever `lateMs` was null, so a promise owed "when the reprint is on the
 * bench" — a due somebody wrote down, in a form the product publishes and accepts — was reported to
 * a reader as a promise with nothing agreed at all. Decision 5 asked for the difference between
 * UNRANKABLE and NOT YET DUE to be said out loud, and this is where it is said.
 *
 * `dueStanding` decides which sentence, and the sentence QUOTES THE STORED VALUE, which is why it is
 * written here rather than taken from `DUE_STANDING_SENTENCES` in work.ts. Those are the canonical
 * general sentences and a screen can read them off `row.reason.owed.dueStanding`; these are the same
 * five situations with this promise's own words in them. The CLASSIFICATION is shared, so the two
 * cannot come to disagree about which situation a promise is in — only about how to phrase it.
 */
function unrankableWhy(owed: OwedFact): string {
  switch (owed.dueStanding) {
    case 'date-unreadable':
      return `the stored date "${owed.due ?? ''}" is not one Mole Office can read, so it cannot say whether it has passed`
    case 'waiting-on-a-condition':
      return `it comes due when ${owed.condition ?? 'a condition nobody wrote down'}, which Mole Office cannot check, so it is waiting rather than late — when that becomes true, write the date it is then owed by`
    case 'waiting-on-a-record':
      // The trigger reading carries the three answers and the sentence for each. It is never null on
      // this standing: `dueStandingOf` only answers it when `due.recordId` was written, which is the
      // one condition `readTrigger` returns a reading for.
      return owed.trigger?.note ?? 'it comes due when another record finishes, and that record was not read'
    case 'no-due-recorded':
      return 'nothing on this promise says when it is owed — no date, no condition and no record — so it can never come due and nothing can say it is late'
    case 'dated':
      // Unreachable: `dated` means `dueMs` read the stamp, so `latenessMs` returned a number and the
      // caller took the other branch. Loud rather than plausible, because the two disagreeing about
      // one promise is worth stopping for.
      return `the date agreed is "${owed.due ?? ''}" and Mole Office read it, so this promise has a lateness and should not be here — that is a bug`
    default: {
      const unhandled: never = owed.dueStanding
      throw new Error(`a promise stands at ${String(unhandled)}, which nothing here classifies`)
    }
  }
}

function lateFactor(owed: OwedFact): RankFactor {
  if (owed.lateMs === null) {
    // ZERO, AND IT IS NOT A JUDGEMENT THAT THE PROMISE IS ON TIME. Nothing measured says it is late,
    // so nothing is added — and no deadline is conjured out of a condition so that something could
    // be. `why` says which of the four situations earned the zero.
    return { name: 'late', points: 0, why: unrankableWhy(owed) }
  }
  // The stamps are quoted and the durations are not spelled out. `lateMs` on the row is the
  // machine-readable answer, and how a duration is worded is the interface's business — this file
  // holding its own "4d" / "31h" rule would be a second copy of one that already exists.
  const decay = Math.pow(HOP_DECAY, owed.hops)
  const away = owed.hops === 0 ? '' : `, ${owed.hops} link${owed.hops === 1 ? '' : 's'} from the promise`
  const due = owed.due ?? 'unstated'
  if (owed.lateMs < 0) {
    const hoursToGo = -owed.lateMs / HOUR_MS
    if (hoursToGo >= DUE_SOON_HOURS) {
      return { name: 'late', points: 0, why: `the date agreed is ${due}, more than ${DUE_SOON_HOURS} hours away` }
    }
    const points = Math.round(DUE_SOON_MAX * (1 - hoursToGo / DUE_SOON_HOURS) * decay)
    return { name: 'late', points, why: `the date agreed is ${due}, inside the next ${DUE_SOON_HOURS} hours${away}` }
  }
  const daysLate = owed.lateMs / DAY_MS
  const raw = LATE_POINTS_AT_DUE + daysLate * LATE_POINTS_PER_DAY
  const points = Math.round(Math.min(FACTOR_MAX.late, raw) * decay)
  return { name: 'late', points, why: `the date agreed was ${due}, and it has passed${away}` }
}

function standingFactor(standing: { ids: string[]; titles: string[] }, shape: Candidate['shape']): RankFactor {
  const through = shape === 'record' ? '' : ' (through the record it sits in)'
  if (standing.ids.length === 0) {
    return { name: 'standing', points: 0, why: `nothing recorded stands behind it${through}` }
  }
  const points = Math.min(FACTOR_MAX.standing, standing.ids.length * STANDING_POINTS_EACH)
  const names = standing.titles.map((title) => `"${title}"`).join(', ')
  return {
    name: 'standing',
    points,
    why: `${standing.ids.length} live record${standing.ids.length === 1 ? '' : 's'} stand${standing.ids.length === 1 ? 's' : ''} behind it${through}: ${names}`,
  }
}

function satFactor(at: string | null, sinceMs: number | null, now: number, source: SinceSource): RankFactor {
  if (at === null || sinceMs === null) {
    // Never an invented age. A row that cannot be dated earns nothing here and says why, rather
    // than being given "now" and quietly ranking as fresh.
    return { name: 'sat', points: 0, why: 'when this last changed is not recorded, so its age earns nothing' }
  }
  const days = Math.max(0, (now - sinceMs) / DAY_MS)
  const points = Math.min(FACTOR_MAX.sat, Math.round(days * SAT_POINTS_PER_DAY))
  return { name: 'sat', points, why: `the last thing recorded about it was ${at} — ${SINCE_WORDS[source]}` }
}

/** Where the age came from, said on the row, because a weak reading has to be labelled as one. */
const SINCE_WORDS: Readonly<Record<SinceSource, string>> = {
  'state-change': 'the change that put it in this state',
  'record-updated': "the record's own updated stamp, which is when anything on it changed, not when it stopped",
  'parent-record-updated': 'the record it sits in; an item carries no time of its own',
  none: 'nothing',
}

// ============================================================================ sentences

/**
 * What decides when this promise comes due, as a clause for the row's own sentence.
 *
 * The five standings again, phrased to follow "somebody is waiting for this, and …". It used to be
 * a single ternary on whether a DATE was stored, which printed "no date was ever agreed" over a
 * promise that had said perfectly clearly when it comes due, in one of the two other forms the
 * product publishes.
 */
function whenItComesDue(owed: OwedFact): string {
  switch (owed.dueStanding) {
    case 'dated':
      return `the date agreed was ${owed.due ?? ''}`
    case 'date-unreadable':
      return `the stored date "${owed.due ?? ''}" is not one Mole Office can read, so it cannot say whether that date has passed`
    case 'waiting-on-a-condition':
      return `it comes due when ${owed.condition ?? 'a condition nobody wrote down'} — a trigger in words, which Mole Office cannot check, so nobody is late yet`
    case 'waiting-on-a-record':
      return owed.trigger?.note ?? 'it comes due when another record finishes, and that record was not read'
    case 'no-due-recorded':
      return 'nothing says when it is owed, so it can never come due'
    default: {
      const unhandled: never = owed.dueStanding
      throw new Error(`a promise stands at ${String(unhandled)}, which nothing here classifies`)
    }
  }
}

/**
 * The row's English sentence and its coded clauses, built together so they cannot say different
 * things. Every clause that has a code pushes its code beside its English words.
 */
function becauseSentence(
  candidate: Candidate,
  owed: OwedFact | null,
  stopped: StoppedShortFact | null,
  pauseFact: PauseElapsedFact | null,
  consequence: Consequence | null,
): { because: string; coded: CodedReason[] } {
  const parts: string[] = []
  const coded: CodedReason[] = []
  if (owed !== null) {
    parts.push(
      owed.hops === 0
        ? `${owed.party} is waiting for this, and ${whenItComesDue(owed)}`
        : `it blocks "${owed.throughTitle}", which ${owed.party} is waiting for`,
    )
  }
  if (stopped !== null) {
    parts.push(`its state word is "${stopped.state}", which means the work stopped short of finishing`)
    coded.push({ code: 'stoppedShort', values: { state: stopped.state } })
  }
  if (pauseFact !== null) {
    // No duration spelled out here, for the same reason `lateFactor` spells none out: `pastMs` on
    // the row is the machine-readable answer and how a duration is worded is the interface's job.
    parts.push(
      `it was put down on ${pauseFact.since} until ${pauseFact.date}, and that date has passed — the pause was a decision to come back, and nobody has`,
    )
    coded.push({ code: 'pauseElapsed', values: { since: pauseFact.since, until: pauseFact.date } })
  }
  if (stopped !== null && readFulfilment(candidate.bag).done) {
    // The record says two opposite things: `done` says it was discharged and the state word says
    // the work stopped short. Mole Office does not pick a winner quietly. It keeps the row, because the
    // word that means "somebody should look" is the one worth acting on, and it says why the row
    // is there so the person can fix whichever of the two is wrong.
    parts.push('`done` on this record says it was discharged, and its state word says otherwise — one of the two is wrong')
    coded.push({ code: 'doneDisagrees', values: {} })
  }
  if (consequence !== null) {
    parts.push(`recorded consequence: ${consequence.what}`)
  }
  if (parts.length === 0) {
    // Unreachable: nothing is on the list without one of the two halves. Kept as a sentence rather
    // than an empty string, because an empty reason on a row is worse than a loud one.
    return { because: `Mole Office put "${candidate.title}" on the list and did not record why — this is a bug`, coded }
  }
  return { because: parts.join('; '), coded }
}

/**
 * End the author's own sentence without ending it twice.
 *
 * MEASURED, NOT TIDINESS. The old version joined the author's words to the next clause with ". "
 * whatever they ended in, so a reason that already had a full stop printed "…come back.. it was
 * due to resume", and a Chinese one printed "…一卷也修不了。. Open-ended" (made-up words here). It
 * was on the home screen six times. The author's words are never edited; only the joining
 * punctuation is decided here, and it is decided by looking at what is already there.
 */
function endSentence(text: string): string {
  const words = text.trim()
  if (words === '') return words
  return /[.!?…。！？；;:)"'”』」]$/.test(words) ? words : `${words}.`
}

/** The first word of a clause, capitalised, so it can start a sentence of its own. */
function leadWith(clause: string): string {
  return clause.charAt(0).toUpperCase() + clause.slice(1)
}

/**
 * The one sentence describing a pause, wherever a pause is shown.
 *
 * It says WHEN it was put down, WHY in the author's own words, and what should bring it back —
 * naming every resume condition that was recorded rather than only the one Mole Office can act on. The
 * `standing` decides how the date is worded, because "it resumes on the 6th" and "it was due to
 * resume on the 6th, and that date has passed" are two different pieces of news.
 */
function pauseNote(pause: Pause | null, standing: PauseStanding): string {
  if (pause === null) {
    // The one sentence, from the one table, so this note and PAUSE_STANDING_SENTENCES cannot drift
    // apart. They said the same thing in two places and one of them had to be corrected twice when
    // the wording was found to be false about a parked idea; this is the fix for that half of it.
    return PAUSE_STANDING_SENTENCES['no-pause-recorded']
  }
  const head = `put down on ${pause.since}: ${endSentence(pause.why)}`
  const until = pause.until
  const conditions: string[] = []
  if (until?.date !== undefined) {
    conditions.push(
      standing === 'resume-date-passed'
        ? `it was due to resume on ${until.date}, and that date has passed`
        : standing === 'date-unreadable'
          ? `it records a resume date of "${until.date}", which Mole Office cannot read`
          : `it resumes on ${until.date}`,
    )
  }
  if (until?.condition !== undefined) conditions.push(`it resumes when ${until.condition}, which Mole Office cannot check`)
  if (until?.recordId !== undefined) {
    conditions.push(`it resumes when record ${until.recordId} finishes, which Mole Office does not check`)
  }
  if (conditions.length === 0) conditions.push('open-ended — nothing says what brings it back')
  return `${head} ${endSentence(leadWith(conditions.join('; ')))}`
}

function noStateNote(candidate: Candidate, expected: boolean | null): string {
  if (expected === null) {
    return `Mole Office does not know the kind "${candidate.record.kind}", so it cannot say whether a state was expected here`
  }
  if (expected) {
    const what =
      candidate.shape === 'record'
        ? `records of kind "${candidate.record.kind}" carry a state`
        : 'a checklist item carries a state'
    return `${what}, and none was written here, so Mole Office cannot tell whether this stopped short`
  }
  return `records of kind "${candidate.record.kind}" have no state field, so there is no word to read`
}

// ============================================================================ ranking

/**
 * The order rows are read in.
 *
 * SAFETY IS A SEPARATE KEY and it comes first. Not a large number added to the score: a number can
 * be out-added, and the whole point is that nothing out-adds a person being hurt. This is why a
 * safety item filed one minute ago sits above a three-week-old everything-else, and why age cannot
 * move it.
 *
 * After that, the score. Then the most overdue, then the longest sat, then the key — so the order
 * is total and two runs over the same data cannot disagree.
 */
export function compareRows(a: AttentionRow, b: AttentionRow): number {
  if (a.safety !== b.safety) return a.safety ? -1 : 1
  if (a.score !== b.score) return b.score - a.score
  const aLate = a.reason.owed?.lateMs ?? null
  const bLate = b.reason.owed?.lateMs ?? null
  if (aLate !== bLate) {
    if (aLate === null) return 1
    if (bLate === null) return -1
    return bLate - aLate
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

/**
 * Is somebody outside this project waiting for this, and has the date they agreed already gone?
 *
 * THE SAME READING `lateFactor` USES, deliberately. `lateFactor` prints "the date agreed was X, and
 * it has passed" from `lateMs >= 0`, so anything else here would let one row say it has passed in
 * its own sentence and say it is not overdue to the visibility cap. `lateMs` is `now - dueAt` and
 * `dueAt` is the END of a bare date, so zero means the agreed day has just run out.
 *
 * NULL IS NOT FALSE, and here it lands on the same side as false for a stated reason. A promise with
 * no agreed date, or with a stored date Mole Office cannot read, is not overdue: nothing measured says it
 * is late, and treating "no date" as late would be the guess this product forbids. It stays subject
 * to the ordinary group cap, and its row already says which of the two it is.
 *
 * EXPORTED so that no screen writes a second copy of "overdue". `alarmFor()` in
 * src/web/components/ui.tsx reads `row.reason.owed.lateMs` itself to decide how loudly to draw a
 * row; that file belongs to somebody else this phase, so this is reported and not moved.
 */
export function isOverdueOwed(row: AttentionRow): boolean {
  const lateMs = row.reason.owed?.lateMs ?? null
  return lateMs !== null && lateMs >= 0
}

/**
 * Cut the ranked list to what a person reads, without letting one reason take it.
 *
 * Three passes, and the second is the one that matters:
 *
 *   1. Fill in rank order, holding back any row whose group already has MAX_ROWS_PER_GROUP rows.
 *      Safety rows are never held back, and an overdue owed row is not held back until its group
 *      has MAX_OVERDUE_OWED_ROWS rows.
 *   2. If that left room — because nothing else was waiting — put the held rows back, in rank
 *      order. The cap exists to keep other groups on the screen, not to shorten the list.
 *   3. Everything still out is the remainder, and each row says which cap moved it.
 *
 * Exported because a screen that wants to show more than VISIBLE_ROWS should widen the same rule
 * rather than write a second one; the home page's sessions panel and the sessions page disagreed
 * about a cap until wave 13y round 32 removed the panel, and that was one bug more than was wanted.
 */
export function pickVisible(ranked: readonly AttentionRow[]): {
  visible: AttentionRow[]
  remainder: AttentionRow[]
} {
  const visible: AttentionRow[] = []
  const held: AttentionRow[] = []
  const perGroup = new Map<ReasonGroup, number>()

  const take = (row: AttentionRow): void => {
    visible.push(row)
    perGroup.set(row.group, (perGroup.get(row.group) ?? 0) + 1)
  }

  /**
   * May this row walk past a group that has already had its share?
   *
   * ONE CONDITION WITH TWO REASONS TO BE TRUE, and not two mechanisms — that shape is the whole
   * point. Safety passes always, which is what makes its exemption unbounded. An overdue promise
   * passes only while its group is still under MAX_OVERDUE_OWED_ROWS, which is what makes its
   * exemption bounded, and the constant carries the argument for the bound.
   *
   * The count it reads is the group's OWN count, which already includes any safety rows taken from
   * that group. So five safety obligations fill the owed group's seats and no further overdue
   * obligation is exempt — the exemption cannot be used to reach past what safety already took.
   */
  const passesGroupCap = (row: AttentionRow): boolean => {
    if (row.safety) return true
    return isOverdueOwed(row) && (perGroup.get(row.group) ?? 0) < MAX_OVERDUE_OWED_ROWS
  }

  for (const row of ranked) {
    if (visible.length >= VISIBLE_ROWS) {
      held.push(row)
      continue
    }
    if (!passesGroupCap(row) && (perGroup.get(row.group) ?? 0) >= MAX_ROWS_PER_GROUP) {
      held.push(row)
      continue
    }
    take(row)
  }

  const stillHeld: AttentionRow[] = []
  for (const row of held) {
    if (visible.length < VISIBLE_ROWS) take(row)
    else stillHeld.push(row)
  }

  // WHICH CAP MOVED IT, measured rather than assumed. A row was displaced by the GROUP cap when
  // something that ranked BELOW it is on the screen; that is the whole visible effect of the cap
  // and it is what a person would be surprised by. Everything else is simply past the end of the
  // list. Reading it off the final order rather than off which loop caught the row keeps the two
  // from disagreeing after the refill pass, which is where the first version of this got it wrong.
  //
  // AN OVERDUE ROW THAT RAN OUT OF EXEMPTION READS AS 'group-cap', AND THAT IS THE TRUE ANSWER.
  // MAX_OVERDUE_OWED_ROWS is a cap on one group, so a row it holds back was held back by its
  // group's share being full — the same fact the plain cap reports, reached by a longer route. No
  // third word is added: a reader is owed the reason a row is not on the screen, and "its group had
  // already had its share" is that reason in both cases.
  const order = new Map(ranked.map((row, index) => [row.key, index]))
  let worstVisible = -1
  for (const row of visible) worstVisible = Math.max(worstVisible, order.get(row.key) ?? -1)
  for (const row of stillHeld) {
    row.displacedBy = (order.get(row.key) ?? 0) < worstVisible ? 'group-cap' : 'row-cap'
  }
  for (const row of visible) row.displacedBy = null

  visible.sort(compareRows)
  const remainder = [...stillHeld].sort(compareRows)
  return { visible, remainder }
}

function countByGroup(rows: readonly AttentionRow[]): GroupCount[] {
  const counts = new Map<ReasonGroup, number>()
  for (const row of rows) counts.set(row.group, (counts.get(row.group) ?? 0) + 1)
  return [...counts.entries()]
    .map(([group, count]) => ({ group, label: REASON_GROUP_LABELS[group], count }))
    .sort((a, b) => b.count - a.count || (a.group < b.group ? -1 : 1))
}

// ============================================================================ headings

/** The heading for a group, e.g. "Owed to somebody outside". One place, so every surface agrees. */
export function reasonGroupHeading(group: ReasonGroup): string {
  const label = REASON_GROUP_LABELS[group]
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * The families this file groups by, for a screen that wants to list them before it has any data.
 *
 * Derived from KIND_FAMILIES rather than typed out again — the two must not be able to disagree
 * about which families exist.
 */
export const REASON_GROUPS: readonly ReasonGroup[] = [
  'owed',
  'pause-elapsed',
  ...(Object.keys(KIND_FAMILIES) as KindFamily[]).map((family): ReasonGroup => `stopped:${family}`),
  'stopped:item',
  'stopped:block',
  'stopped:own-page',
  'stopped:no-family',
]
