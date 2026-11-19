// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FIXED DEADLINE, AS ARITHMETIC: HOW LONG IS LEFT, HOW BIG THE WORK IS, AND WHETHER IT FITS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS, AND WHAT IT REFUSES TO BE
 * ---------------------------------------------------------------------------------------
 *
 * `shared/planning.ts` answers *when will this person allocate real time to this work*. This file
 * asks the one question that sits on top of it: **a date is fixed and something is owed by it — is
 * there enough time left, and how much of the answer is actually known?**
 *
 * It adds NO new record kind. There is no Milestone here and there must not be one. A fixed deadline
 * is already an `obligation`: "something owed to somebody else by a date", with `due` on it, and its
 * `effort_hours` sitting on the work like every other estimate. Inventing a second kind for the same
 * fact is the defect this repository keeps producing — two places that must agree, with nothing
 * making them agree.
 *
 * Every function here is PURE and takes plain data. No clock of its own, no database, no fetching,
 * no React: `now` is a number, the work is an array, the plan is an array, and the same input always
 * gives the same output. That is what makes it arguable — a person disagreeing with a buffer is
 * disagreeing with arithmetic over stored fields, not with a judgement made inside a page.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THAT GOVERNS EVERYTHING BELOW: UNKNOWN STAYS UNKNOWN
 * ---------------------------------------------------------------------------------------
 *
 * `Load` and `Fit` in shared/planning.ts settled the doctrine and this file follows it exactly:
 *
 *   - **Absent is not zero.** Work nobody estimated does not contribute 0 hours, it contributes
 *     *nothing*, and the total says how many pieces it could not count. A deadline whose work is
 *     entirely unestimated reports `nothing-estimated`, not "0 hours of work, plenty of room".
 *   - **Unknown capacity is not a full working week and not zero.** `Fit.capacityHours` is null when
 *     nobody has said, and every number needing it is null too. Same here.
 *   - **Every total publishes how many rows it could not see.** `estimated`/`unestimated`,
 *     `stated`/`unstated`, and the named list in `gaps`.
 *
 * The temptation this file exists to resist is a buffer of "+40 hours" produced by counting three
 * unestimated tasks as zero. That number is not conservative, it is false, and it is false in the
 * direction that makes somebody miss a deadline.
 *
 * ---------------------------------------------------------------------------------------
 * ONLY A DATE CAN MAKE SOMETHING LATE, AND THAT WAS SETTLED ELSEWHERE
 * ---------------------------------------------------------------------------------------
 *
 * `obligation.due` takes a date, a trigger written in words, or the record whose finishing makes it
 * due — the same three ways a pause ends, in the same shape. `readDue`, `dueStandingOf` and
 * `latenessMs` in shared/work.ts are the readers, and **this file calls them rather than reading
 * `data.due` itself**. It does not re-classify, it does not re-measure, and it never turns "mid
 * September" into 2026-09-15.
 *
 * So an obligation due on a CONDITION has no deadline here. Not a far-off one, not today's: none.
 * `remainingMs` is null, there is no window, and therefore no capacity, no planned total and no
 * buffer — `between` is null as one object so a reader cannot pick a windowed number out of a report
 * that has no window. The estimate survives, because how big the work is was never a question about
 * time.
 *
 * Reading the stamp is handed in as `dueMs` for the same reason `computeAttention` hands it in: a
 * bare "2026-09-15" is due at the END of the 15th, that rule exists once as `parseDueStamp` in
 * src/web/lib/attention.ts, and a second copy here is exactly the drift this codebase keeps finding.
 *
 * ---------------------------------------------------------------------------------------
 * THE WINDOW: WHOLE LOCAL DAYS, AND WHOLE PERIODS ONLY
 * ---------------------------------------------------------------------------------------
 *
 * "Between now and the deadline" is measured in LOCAL days, like every other date in Mole Office: from
 * the day `now` falls in, through the day the deadline falls in, both included.
 *
 * A period of the counted horizon is added up ONLY when it lies wholly inside that window. A week
 * that straddles the start, or a month that runs past the deadline, is **named in `partial` and not
 * counted, and never cut down to size**. Nothing records how a period's hours are spread inside it,
 * so "three fifths of a 20-hour week" is a number nobody wrote, and writing it would be the silent
 * substitution this product bans. The cost is real and is stated rather than hidden: a deadline
 * eleven days out, counted at the week horizon, will report one whole week and name two partial
 * ones, and the reader can see that the capacity figure covers seven of eleven days.
 *
 * THE ONE OVERSTATEMENT, SAID OUT LOUD. At the day horizon the day `now` falls in lies wholly inside
 * the window, so its full stated hours are counted even though part of that day has gone.
 * `periodsAlreadyStarted` counts it. Nothing stored says how a day's hours are spread inside it
 * either, so cutting it down would be the same invention; the honest move is to count it and say so.
 *
 * ---------------------------------------------------------------------------------------
 * ONE HORIZON AT A TIME, ALWAYS
 * ---------------------------------------------------------------------------------------
 *
 * `loadOf` sums one horizon and says which, because a week planning 8 hours and a Monday planning 3
 * of them is 8 hours of work and not 11. The same rule holds over a deadline window: `horizon` is an
 * input, the plan and the capacity are both counted at it, and the result says which it was.
 *
 * That makes a particular lie possible, so it is caught and named. Count at the day horizon while
 * every allocation was written at the week horizon and the planned total is zero — which reads as
 * "nothing is planned" and means "nothing is planned AT THIS HORIZON". `plan-at-another-horizon`
 * fires whenever this work has allocations overlapping the window at a horizon that was not counted,
 * and `atOtherHorizons` says how many.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE BUFFER IS, AND THE ONE THING IT DOES NOT KNOW
 * ---------------------------------------------------------------------------------------
 *
 * `buffer = capacity − estimate`: the hours left over once every ESTIMATED hour of the relevant work
 * has been done, out of the hours the window says are available. It is null whenever either input is
 * unknown, and `fits` is null with it — never false, because "it does not fit" and "nobody has said"
 * are different sentences and only one of them is a reason to move a deadline.
 *
 * IT DOES NOT SUBTRACT WORK ALREADY DONE. `effort_hours` is the size of the whole job and nothing on
 * the record says how much of it is left. `actualHours` on past allocations is the nearest stored
 * thing and it answers a different question — what a slice of time cost, not what remains — so it is
 * not quietly repurposed here. A half-finished 20-hour task counts as 20. That is the conservative
 * direction and it is reported rather than corrected by a guess.
 *
 * WHICH WORK IS RELEVANT IS THE CALLER'S ANSWER, NOT THIS FILE'S. Nothing here walks `blocks` links
 * or reads a workspace. The caller names the work; this file sizes it. A rule that decided relevance
 * from prose would be a rule prose could fool.
 */

import {
  dayKey,
  parsePeriod,
  periodKey,
  type Allocation,
  type Grain,
  type Period,
} from './planning.ts'
import { dueStandingOf, latenessMs, type Due, type DueStanding } from './work.ts'
import { calendarDaysBetween, calendarDaysBetweenDayKeys, theClockZone } from './time.ts'

// ============================================================================ what could not be counted

/**
 * Every reason a number in this report is missing or covers less than it looks like it covers.
 *
 * NOT DECORATION, exactly as `Load`'s counts are not. A buffer of six hours means one thing when
 * every input was known and something else entirely when half the work carries no estimate, and a
 * report that showed the same six hours in both cases would be telling a reader they have room.
 */
export const DEADLINE_GAPS = [
  /** Nobody named any work, so there is nothing to size. Different from work nobody estimated. */
  'no-work-named',
  /** Work was named and not one piece of it carries an estimate. */
  'nothing-estimated',
  /** Some pieces carry an estimate and some do not. */
  'some-work-unestimated',
  /** `due` is not a date, so there is no deadline to count towards and nobody is late. */
  'no-date',
  /** The date has gone. There is no stretch of time ahead to count anything in. */
  'deadline-passed',
  /** No period of the counted horizon lies wholly inside the window. */
  'no-whole-period-in-window',
  /** Periods overlap the window without lying wholly inside it. Named, not counted, not prorated. */
  'periods-overlap-the-window',
  /** Not one period in the window says how many hours it holds. */
  'no-capacity-stated',
  /** Some periods in the window say and some do not. */
  'some-periods-without-capacity',
  /** Some allocations naming this work did not say how long for. */
  'some-allocations-without-hours',
  /** This work is planned inside the window at a horizon other than the one counted. */
  'plan-at-another-horizon',
  /** This work is planned in a period the window clips, so those hours were not added in. */
  'plan-in-a-clipped-period',
] as const
export type DeadlineGap = (typeof DEADLINE_GAPS)[number]

/** One sentence per gap, so every surface says the same thing about the same missing input. */
export const DEADLINE_GAP_SENTENCES: Readonly<Record<DeadlineGap, string>> = {
  'no-work-named':
    'no piece of work was named as relevant to this deadline, so there is nothing to size, nothing to place and ' +
    'nothing to fit. That is a gap in what was asked, not a finding about the work',
  'nothing-estimated':
    'not one piece of the relevant work carries an effort_hours, so nobody has estimated how big this deadline is. ' +
    'That is not zero hours and it is not a small job — it is nobody having looked',
  'some-work-unestimated':
    'some of the relevant work carries no effort_hours, so every total here counts only the pieces somebody ' +
    'estimated, and says how many it left out',
  'no-date':
    'what is written in due is not a date, so there is no deadline to count towards: nobody is late and there is no ' +
    'time remaining. Mole Office will not turn a condition in words or another record into a date so that it can be counted',
  'deadline-passed':
    'the date has already gone, so there is no stretch of time between now and it. Capacity, the plan inside the ' +
    'window and the buffer are all about time ahead, and there is none',
  'no-whole-period-in-window':
    'no period of the counted horizon lies wholly between now and the deadline, so there was nothing to add up at ' +
    'this horizon. Counting a month across three days is the usual cause; count at a finer horizon',
  'periods-overlap-the-window':
    'one or more periods of the counted horizon overlap this window without lying wholly inside it. They are named ' +
    'and NOT counted and NOT cut down to size: nothing records how a period holds its hours, so a share of one ' +
    'would be a number nobody wrote',
  'no-capacity-stated':
    'not one period in the window says how many hours it holds, so the capacity is unknown. It is not zero and it ' +
    'is not a full working week',
  'some-periods-without-capacity':
    'some periods in the window say how many hours they hold and some do not, so the capacity here covers only part ' +
    'of the time between now and the deadline',
  'some-allocations-without-hours':
    'some allocations naming this work say nothing about how long for, so the planned total counts only the ones ' +
    'that did. Nothing is filled in from effort_hours: that would put a whole task into one afternoon',
  'plan-at-another-horizon':
    'this work has allocations inside the window at a horizon other than the one counted, and they are NOT added in ' +
    '— a week planning 8 hours and a Monday planning 3 of them is 8 hours, not 11. So a planned total of nothing ' +
    'here can still mean the work is planned somewhere else',
  'plan-in-a-clipped-period':
    'this work is planned at the counted horizon in a period the window only partly covers — most often the week ' +
    'or month today falls in — and those hours are NOT added in, because nothing records which part of a period ' +
    'its hours sit in. So the planned total is a floor and the unplaced total is a ceiling',
}

// ============================================================================ input

/**
 * One piece of work this deadline depends on.
 *
 * A STRUCTURAL SUBSET of `AllocatedWork` in src/server/lib/planning.ts, and deliberately not an
 * import of it: that file talks to a database, and nothing in src/shared may drag one into the
 * browser. A planning reply's rows satisfy this shape as they stand.
 */
export interface DeadlineWork {
  /** The record id. The same id an allocation's `recordId` names. */
  id: string
  /**
   * `effort_hours` from the WORK, or null when nobody estimated it.
   *
   * NEVER filled in from a plan, and null is NEVER read as zero. A direction usually has none by
   * design — the total effort of an exploration is normally the thing you are exploring to find out.
   */
  effortHours: number | null
}

/**
 * What one period says it holds. A structural subset of `Capacity` in src/server/lib/planning.ts,
 * for the same reason as above.
 *
 * A period with no statement is ABSENT from this array rather than present with zero hours. Zero
 * hours is a real answer a person can write — a week they are away — and it must stay different
 * from nobody having said.
 */
export interface CapacityStatement {
  horizon: Grain
  period: string
  hours: number
}

export interface DeadlineInput {
  /** The clock, in milliseconds. Passed in so this file has none of its own. */
  now: number
  /**
   * `data.due` as `readDue` in work.ts returned it. THIS FILE NEVER READS `data.due` ITSELF: one
   * reader, one precedence, one set of standings.
   */
  due: Due
  /**
   * Read a due stamp as local milliseconds, a bare date meaning the END of that day.
   *
   * HANDED IN ON PURPOSE. That rule already exists once, as `parseDueStamp` in
   * src/web/lib/attention.ts, and `computeAttention` takes it the same way for the same reason.
   */
  dueMs: (stamp: string) => number | null
  /** Which horizon the plan and the capacity are counted at. Never summed across horizons. */
  horizon: Grain
  /** The work this deadline depends on. The CALLER decides what is relevant; see the header. */
  work: readonly DeadlineWork[]
  /** Every allocation that might name this work, at any horizon. Filtered here, not by the caller. */
  allocations: readonly Allocation[]
  /** What each period says it holds. Rows for other periods and horizons are ignored, not an error. */
  capacity: readonly CapacityStatement[]
}

// ============================================================================ output

/**
 * When this is owed, and how long is left.
 *
 * `standing` and `remainingMs` cannot disagree: both come from work.ts, one classifier and one
 * measurer, and `remainingMs` is non-null exactly when `standing` is `dated`.
 */
export interface DeadlineTiming {
  /** Which of the five situations this is. `dueStandingOf` in work.ts is the one classifier. */
  standing: DueStanding
  /** The stored date, exactly as written, or null when what was written is not a date. */
  date: string | null
  /**
   * The trigger in the author's own words, when the promise comes due on one. Reported BESIDE the
   * date rather than instead of it, because an obligation carrying both has said two things. Mole Office
   * never evaluates it — a person does.
   */
  condition: string | null
  /** The record whose finishing makes it due, when one was written. Not checked here. */
  recordId: string | null
  /** The deadline as local milliseconds, or null when there is no readable date. */
  atMs: number | null
  /**
   * Milliseconds from now until it. Negative means it has gone.
   *
   * NULL WHENEVER THERE IS NO TRUTHFUL ANSWER — a condition, a record, an unreadable stamp, or
   * nothing written. It means "there is no time remaining to state", never "no time is left" and
   * never zero. It is `-latenessMs(...)` and nothing else, so lateness and time remaining are one
   * measurement read from two ends.
   */
  remainingMs: number | null
  /**
   * True when the date has gone, false when it is still ahead, NULL when Mole Office cannot say.
   * NULL IS NOT FALSE: a promise owed "when the reprint lands" is not on time, it is waiting.
   */
  past: boolean | null
}

/** The stretch of local days between now and the deadline, both ends included. */
export interface DeadlineWindow {
  /** First day counted, `YYYY-MM-DD` — the day `now` falls in. */
  from: string
  /** Last day counted — the day the deadline falls in. A bare due date means the end of that day. */
  to: string
  /** How many local days that is, both ends included. Always at least 1 when a window exists. */
  days: number
}

/** Which periods of one horizon the window covers, and which it only clips. */
export interface WindowPeriods {
  /** Periods lying wholly inside the window, in calendar order. Only these are counted. */
  whole: string[]
  /**
   * Periods overlapping the window without lying wholly inside it, in calendar order.
   *
   * NAMED AND NOT COUNTED AND NOT PRORATED. See the header: nothing records how a period holds its
   * hours, so a share of one would be invented. Naming them is what lets a reader see that a
   * capacity figure covers seven days of an eleven-day window.
   */
  partial: string[]
}

/** How big the work is, and how much of it anybody has sized. */
export interface DeadlineEstimate {
  /** Sum of `effort_hours` over the work that carries one. Never a default for the work that does not. */
  hours: number
  /** How many pieces of work were named. */
  items: number
  /** How many of them carry an estimate. */
  estimated: number
  /** `items - estimated`. THE HEADLINE UNKNOWN OF THIS WHOLE REPORT. */
  unestimated: number
}

/** What the plan gives this work inside the window, at one horizon. */
export interface DeadlinePlanned {
  /** The horizon counted. Restated here so a number can never be read without it. */
  horizon: Grain
  /** The periods that were added up, in calendar order. */
  periods: string[]
  /** Sum of `plannedHours` over the allocations that carry one. */
  hours: number
  /** How many allocations name this work in those periods, at this horizon. */
  allocations: number
  /** How many of them said how long. */
  stated: number
  /** `allocations - stated`. Planned hours are only as true as this is small. */
  unstated: number
  /**
   * Allocations naming this work that overlap the window at ANOTHER horizon, and were not added in.
   * See the header: horizons are never summed, and a zero here that should be a number is the lie
   * this count exists to prevent.
   */
  atOtherHorizons: number
  /**
   * Allocations naming this work AT THIS HORIZON that fall in a period the window clips, and were
   * therefore not added in either.
   *
   * `periods.partial` says the window clipped some periods; this says whether that cost the total
   * anything. It usually does, because the period today falls in is clipped by definition and is
   * where near work is planned — so a deadline three weeks out can report every hour unplaced while
   * this week already holds them. Without this number the reader cannot tell "nothing is planned"
   * from "what is planned is in the period I could not count".
   */
  inClippedPeriods: number
}

/** Estimated work with no time on the plan yet, counted only where both numbers are known. */
export interface DeadlineUnplaced {
  /**
   * Summed over the work that HAS an estimate: `effort_hours - plannedHours`. NULL when not one
   * piece of the work carries an estimate — there is then nothing to subtract from, and zero would
   * read as "it is all placed".
   *
   * Negative is REPORTED, not clamped: more hours planned than the work was ever estimated at is a
   * real answer, and it usually means the estimate is stale. `Spread.unscheduledHours` reports its
   * negative for the same reason.
   */
  hours: number | null
  /** How many pieces of work this could be counted for. */
  counted: number
  /** How many it could not, because nobody estimated them. */
  uncounted: number
  /**
   * Hours the plan gives to work nobody has estimated.
   *
   * NOT included in `hours` — there is no estimate to subtract it from — and reported so that a
   * reader can see what the number above leaves out. Six hours planned against three unestimated
   * tasks is a week that is fuller than `hours` alone admits.
   */
  hoursAgainstUnestimated: number
}

/** How many hours the window says are available. */
export interface DeadlineCapacity {
  /** The horizon counted. */
  horizon: Grain
  /** The periods that were added up, in calendar order. */
  periods: string[]
  /**
   * Sum of the stated hours over those periods, or NULL when not one of them states a number.
   * NULL IS NOT ZERO AND NOT A FULL WORKING WEEK — the same rule `Fit.capacityHours` keeps.
   */
  hours: number | null
  /** How many of the periods state a number. */
  stated: number
  /** How many do not. `hours` covers only `stated` of `periods.length`. */
  unstated: number
  /** Periods clipped by the window and therefore not counted. See `WindowPeriods.partial`. */
  partial: string[]
  /**
   * How many counted periods had already started when `now` fell in them — one, at the day horizon,
   * or none. Their hours are counted WHOLE. See the header: nothing records how a period holds its
   * hours, so the alternative is inventing a fraction, and this is the overstatement said out loud.
   */
  periodsAlreadyStarted: number
}

/**
 * Everything that only means something when a stretch of time exists between now and a date.
 *
 * ONE NULLABLE OBJECT RATHER THAN FOUR NULLABLE FIELDS, deliberately. An obligation due on a
 * condition has no window, and therefore no capacity, no planned total and no unplaced work — those
 * are not "zero", they are questions with no subject. Grouping them makes it impossible to read one
 * of them out of a report that has no window, which a nullable field beside a non-nullable one
 * eventually allows.
 */
export interface DeadlineBetween {
  window: DeadlineWindow
  planned: DeadlinePlanned
  unplaced: DeadlineUnplaced
  capacity: DeadlineCapacity
}

/** Whether the estimated work fits in the hours the window says are available. */
export interface DeadlineBuffer {
  /**
   * `capacity - estimate`, or NULL when either is unknown. Negative means it does not fit.
   *
   * It counts only the work somebody estimated, so it is only as true as `estimate.unestimated` is
   * zero — which is why that count travels beside it and why `some-work-unestimated` is in `gaps`.
   */
  hours: number | null
  /**
   * True when it fits, false when it does not, NULL when Mole Office cannot say.
   * NULL IS NEVER FALSE. "It does not fit" and "nobody has said" are different sentences, and only
   * one of them is a reason to move a deadline.
   */
  fits: boolean | null
}

/** One piece of work, sized and placed. Null in the windowed fields when there is no window. */
export interface DeadlineWorkRow {
  recordId: string
  /** `effort_hours` as stored, or null when nobody estimated it. */
  effortHours: number | null
  /** Hours the plan gives it inside the window at the counted horizon. Null when there is no window. */
  plannedHours: number | null
  /** How many allocations, and how many said a number. Null together with `plannedHours`. */
  allocations: number | null
  stated: number | null
  /**
   * `effortHours - plannedHours`, or null when either is unknown. Negative is reported, not clamped.
   */
  unplacedHours: number | null
}

export interface DeadlineOutlook {
  deadline: DeadlineTiming
  /** The horizon the plan and the capacity were counted at. Stated even when there is no window. */
  horizon: Grain
  /** How big the work is. Computed even without a deadline: size was never a question about time. */
  estimate: DeadlineEstimate
  /** Null when there is no date, or when the date has gone. See `DeadlineBetween`. */
  between: DeadlineBetween | null
  buffer: DeadlineBuffer
  /** Every piece of work named, in the order it was given. */
  work: DeadlineWorkRow[]
  /** Every input this report could not count, named. Empty means everything was known. */
  gaps: DeadlineGap[]
}

// ============================================================================ timing

/**
 * When this is owed and how long is left — read entirely through work.ts.
 *
 * `dueStandingOf` classifies and `latenessMs` measures; nothing here re-decides either. Time
 * remaining is lateness with its sign turned round, so the two can never disagree about whether a
 * date has passed.
 */
export function deadlineTiming(
  due: Due,
  now: number,
  dueMs: (stamp: string) => number | null,
): DeadlineTiming {
  const standing = dueStandingOf(due, dueMs)
  const late = latenessMs(due, now, dueMs)
  const remainingMs = late === null ? null : -late
  return {
    standing,
    date: due.date ?? null,
    condition: due.condition ?? null,
    recordId: due.recordId ?? null,
    atMs: remainingMs === null ? null : now + remainingMs,
    remainingMs,
    past: remainingMs === null ? null : remainingMs < 0,
  }
}

/**
 * The local days between now and the deadline, or null when there are none.
 *
 * Null for two DIFFERENT reasons, and the caller must tell them apart from `timing` rather than from
 * this: there is no readable date at all, or there is one and it has gone. `deadlineOutlook` reports
 * them as `no-date` and `deadline-passed`, which are not the same situation and do not want the same
 * sentence on a screen.
 */
export function windowOf(timing: DeadlineTiming, now: number): DeadlineWindow | null {
  if (timing.atMs === null || timing.remainingMs === null || timing.remainingMs < 0) return null
  const from = dayKey(new Date(now))
  const to = dayKey(new Date(timing.atMs))
  // Unreachable null: both keys came from `dayKey`, which only produces days that parse. Reported rather
  // than assumed away, because a null here would otherwise become an empty window nobody could explain.
  const between = calendarDaysBetweenDayKeys(from, to)
  if (between === null) return null
  const days = between + 1
  return days < 1 ? null : { from, to, days }
}

/**
 * Which periods of one horizon this window covers wholly, and which it only clips.
 *
 * WALKED DAY BY DAY THROUGH `periodKey`, not computed with calendar arithmetic of its own. The keys
 * a day belongs to are exactly what `shared/planning.ts` says they are — including the ISO week-year
 * rule that puts 1 January 2027 in `2026-W53` — so a week can never be counted twice at a year
 * boundary because this file disagreed with that one.
 */
export function periodsIn(horizon: Grain, window: DeadlineWindow): WindowPeriods {
  const start = localDay(window.from)
  if (start === null) return { whole: [], partial: [] }
  const seen: string[] = []
  const cursor = new Date(start)
  while (dayKey(cursor) <= window.to) {
    const key = periodKey(horizon, cursor)
    if (!seen.includes(key)) seen.push(key)
    cursor.setDate(cursor.getDate() + 1)
  }
  const whole: string[] = []
  const partial: string[] = []
  for (const key of seen) {
    const period = parsePeriod(key)
    // Unreachable for the same reason as above: `periodKey` produced it. A key that stopped parsing
    // is dropped from BOTH lists rather than silently counted, and would show as a window whose
    // periods do not cover its days.
    if (period === null) continue
    if (wholeInside(window, period)) whole.push(key)
    else partial.push(key)
  }
  return { whole, partial }
}

// ============================================================================ the arithmetic

/**
 * How big the named work is, and how much of it anybody has sized.
 *
 * Independent of the deadline on purpose: how big a job is was never a question about time, so an
 * obligation waiting on a condition still knows what it is carrying.
 */
export function estimateOf(work: readonly DeadlineWork[]): DeadlineEstimate {
  let hours = 0
  let estimated = 0
  for (const item of work) {
    if (item.effortHours !== null) {
      hours += item.effortHours
      estimated++
    }
  }
  return { hours: round2(hours), items: work.length, estimated, unestimated: work.length - estimated }
}

/**
 * The whole report: the deadline, what is left, how big the work is, what the plan gives it, what
 * the window holds, and whether it fits — with every input it could not count named.
 *
 * Pure, and the same input always gives the same output.
 */
export function deadlineOutlook(input: DeadlineInput): DeadlineOutlook {
  const { now, due, dueMs, horizon, allocations, capacity } = input
  const gaps: DeadlineGap[] = []

  // ONE ROW PER RECORD. A caller naming the same work twice would otherwise have it sized twice and
  // its hours placed twice, and nothing stored could say which of the two was meant. The first
  // statement about a record wins, exactly as the capacity read below keeps the first statement
  // about a period.
  const work = [...new Map(input.work.map((item) => [item.id, item])).values()]

  const deadline = deadlineTiming(due, now, dueMs)
  const estimate = estimateOf(work)

  if (estimate.items === 0) gaps.push('no-work-named')
  else if (estimate.estimated === 0) gaps.push('nothing-estimated')
  else if (estimate.unestimated > 0) gaps.push('some-work-unestimated')

  const window = windowOf(deadline, now)
  if (deadline.remainingMs === null) gaps.push('no-date')
  else if (window === null) gaps.push('deadline-passed')

  // ---- no window: every windowed number is a question with no subject ------------------------
  if (window === null) {
    return {
      deadline,
      horizon,
      estimate,
      between: null,
      buffer: { hours: null, fits: null },
      work: work.map((item) => ({
        recordId: item.id,
        effortHours: item.effortHours,
        plannedHours: null,
        allocations: null,
        stated: null,
        unplacedHours: null,
      })),
      gaps,
    }
  }

  // ---- the plan, at ONE horizon, in whole periods only ----------------------------------------
  const periods = periodsIn(horizon, window)
  if (periods.whole.length === 0) gaps.push('no-whole-period-in-window')
  if (periods.partial.length > 0) gaps.push('periods-overlap-the-window')

  const counted = new Set(periods.whole)
  /** A row while it is being added up, before its windowed numbers can be null. */
  interface Placing {
    item: DeadlineWork
    plannedHours: number
    allocations: number
    stated: number
  }
  const placing = new Map<string, Placing>()
  for (const item of work) {
    placing.set(item.id, { item, plannedHours: 0, allocations: 0, stated: 0 })
  }

  const clipped = new Set(periods.partial)
  let atOtherHorizons = 0
  let inClippedPeriods = 0
  for (const allocation of allocations) {
    const row = placing.get(allocation.recordId)
    if (row === undefined) continue
    if (allocation.horizon !== horizon) {
      const period = parsePeriod(allocation.period)
      // Overlapping, not contained: an allocation on a week that clips the window is still planned
      // time this report is not counting, and that is the thing worth saying.
      if (period !== null && period.to >= window.from && period.from <= window.to) atOtherHorizons++
      continue
    }
    if (!counted.has(allocation.period)) {
      // A period the window clips. NOT counted and NOT prorated — but counted as uncounted, which
      // is the difference between a floor and a lie.
      if (clipped.has(allocation.period)) inClippedPeriods++
      continue
    }
    row.allocations++
    if (allocation.plannedHours !== null) {
      row.plannedHours = round2(row.plannedHours + allocation.plannedHours)
      row.stated++
    }
  }
  if (atOtherHorizons > 0) gaps.push('plan-at-another-horizon')
  if (inClippedPeriods > 0) gaps.push('plan-in-a-clipped-period')

  // ---- the totals, which are the rows added up and cannot disagree with them -------------------
  const rows: DeadlineWorkRow[] = []
  let plannedHours = 0
  let plannedAllocations = 0
  let plannedStated = 0
  let unplacedHours = 0
  let unplacedCounted = 0
  let unplacedUncounted = 0
  let hoursAgainstUnestimated = 0
  for (const row of placing.values()) {
    plannedHours += row.plannedHours
    plannedAllocations += row.allocations
    plannedStated += row.stated
    const effortHours = row.item.effortHours
    let unplaced: number | null = null
    if (effortHours === null) {
      unplacedUncounted++
      hoursAgainstUnestimated += row.plannedHours
    } else {
      unplaced = round2(effortHours - row.plannedHours)
      unplacedHours += unplaced
      unplacedCounted++
    }
    rows.push({
      recordId: row.item.id,
      effortHours,
      plannedHours: row.plannedHours,
      allocations: row.allocations,
      stated: row.stated,
      unplacedHours: unplaced,
    })
  }

  const planned: DeadlinePlanned = {
    horizon,
    periods: periods.whole,
    hours: round2(plannedHours),
    allocations: plannedAllocations,
    stated: plannedStated,
    unstated: plannedAllocations - plannedStated,
    atOtherHorizons,
    inClippedPeriods,
  }
  if (planned.unstated > 0) gaps.push('some-allocations-without-hours')

  const unplaced: DeadlineUnplaced = {
    hours: unplacedCounted === 0 ? null : round2(unplacedHours),
    counted: unplacedCounted,
    uncounted: unplacedUncounted,
    hoursAgainstUnestimated: round2(hoursAgainstUnestimated),
  }

  // ---- what the window holds -------------------------------------------------------------------
  const stated = new Map<string, number>()
  for (const row of capacity) {
    if (row.horizon !== horizon) continue
    if (!counted.has(row.period)) continue
    // The store holds one statement per horizon and period, so a second row for one period is a
    // caller assembling its input wrongly. The FIRST is kept rather than added to, because two
    // statements about the same week are a correction by one reading and a sum by another.
    if (!stated.has(row.period)) stated.set(row.period, row.hours)
  }
  let capacityHours = 0
  for (const hours of stated.values()) capacityHours += hours
  // A counted period cannot begin before the window does — that is what makes it whole — so the one
  // holding `now` is the one that begins on the window's first day. At the day horizon that is
  // today; at the week horizon it happens only when `now` falls on a Monday.
  const periodsAlreadyStarted = periods.whole.filter((key) => {
    const period = parsePeriod(key)
    return period !== null && period.from === window.from
  }).length

  const capacityTotal: DeadlineCapacity = {
    horizon,
    periods: periods.whole,
    hours: stated.size === 0 ? null : round2(capacityHours),
    stated: stated.size,
    unstated: periods.whole.length - stated.size,
    partial: periods.partial,
    periodsAlreadyStarted,
  }
  if (periods.whole.length > 0 && stated.size === 0) gaps.push('no-capacity-stated')
  else if (capacityTotal.unstated > 0) gaps.push('some-periods-without-capacity')

  // ---- does it fit ------------------------------------------------------------------------------
  const bufferHours =
    capacityTotal.hours === null || estimate.estimated === 0
      ? null
      : round2(capacityTotal.hours - estimate.hours)

  return {
    deadline,
    horizon,
    estimate,
    between: { window, planned, unplaced, capacity: capacityTotal },
    buffer: { hours: bufferHours, fits: bufferHours === null ? null : bufferHours >= 0 },
    work: rows,
    gaps,
  }
}

// ============================================================================ late, due today, or due in N days

/**
 * WHERE A DEADLINE STANDS TODAY, IN WHOLE CALENDAR DAYS: the one rule every due or late count reads, the work page's
 * chip, the record page's deadline and Home's late alarm (problem R74WVeH6LZPU; invariant 9). Dates are counted by
 * `calendarDaysBetween` in the zone given, the person's by default, so a clock change in the span moves nothing.
 *
 * LATE IS THE CALENDAR DAYS SINCE THE DUE DATE, for a date and a moment alike: due yesterday is 1 day late at any hour
 * today, and a due date five days back is 5. This is the rule from wave 13q's round 31 on: until then a
 * bare date counted only the dates strictly between it and today, so due yesterday read "under a day late" and five days
 * back read 4, while Home, before round 27b, had said 5.
 *
 * `dueMs` is the moment it is due, as `readDueStamp` in web/lib/attention.ts reads a stored stamp, and `due` says which of
 * two things was stored:
 * - `'a date'`, such as `2026-09-14`: due by the end of that day, so it is late from the next date on, and never late by
 *   under a day.
 * - `'a moment'`, such as `2026-09-14 17:00`: due at that time. Past the time on its own date is 0, "under a day late".
 *   Round 27 had counted a moment like a date, a day short; before that, the count was whole 24-hour spans, so 30 hours
 *   after 17:00 read 1 day and 23 hours after it read under a day.
 *
 * - `due`: the due moment falls on a later date than now; `days` is how many dates away, for a date and a moment alike.
 * - `due-today`: it falls today and has not passed.
 */
export interface DueCount {
  kind: 'due' | 'due-today' | 'late'
  days: number
}

/** What a stored due names: the end of a date, or a moment with a time of day. */
export type DueForm = 'a date' | 'a moment'

// `due` NO LONGER CHANGES THE COUNT (round 31): `dueMs` already says where the day ends, the end of a date or the moment
// itself, so both forms count the same dates. It is kept so a caller still says which form it read.
export function dueCount(dueMs: number, nowMs: number, zone: string = theClockZone(), _due: DueForm = 'a date'): DueCount {
  if (nowMs > dueMs) {
    const dates = calendarDaysBetween(dueMs, nowMs, zone)
    return { kind: 'late', days: dates }
  }
  const ahead = calendarDaysBetween(nowMs, dueMs, zone)
  return ahead === 0 ? { kind: 'due-today', days: 0 } : { kind: 'due', days: ahead }
}

// ============================================================================ small readers

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * A `YYYY-MM-DD` key as a local `Date` at the start of that day, or null when it is not one.
 *
 * `parsePeriod` validates a day key and answers with strings, and `dayKey` goes the other way; there
 * is no exported reader that turns a key back into a Date, so this is one. Built from the parts and
 * round-trip checked through `dayKey` — the same guard `parsePeriod` uses — so 2026-02-30 is refused
 * rather than becoming 2 March.
 */
function localDay(key: string): Date | null {
  const parts = DAY_KEY.exec(key)
  if (parts === null) return null
  const [, y, m, d] = parts
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return dayKey(date) === key ? date : null
}

/**
 * Does this period lie wholly inside the window?
 *
 * `containsPeriod` in shared/planning.ts asks the same question of two PERIODS, and a window is not
 * one: no horizon has a period running from a Wednesday to the 15th. So the comparison is written
 * once here, in the range form, and nowhere else in this file.
 */
function wholeInside(window: DeadlineWindow, period: Period): boolean {
  return period.from >= window.from && period.to <= window.to
}

/**
 * Two decimal places, because hours are written like `2.5` and floating point is not.
 *
 * THE SAME ROUNDING `shared/planning.ts` APPLIES TO ITS OWN SUMS, and that is two places that must
 * agree. It is not exported there, so what makes them agree is a test: tests/deadlines.test.ts
 * builds allocations of 0.1 and 0.2 and asserts that `loadOf` and `deadlineOutlook` both answer 0.3.
 * Change one and that test goes red.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
