// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PLANNING: WHEN THIS PERSON WILL SPEND REAL TIME ON WORK THAT ALREADY EXISTS.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO SETTLED RULES THIS FILE IS BUILT ON
 * ---------------------------------------------------------------------------------------
 *
 * **Planning is allocation, not duplication.** A plan never copies a task, a block or an obligation.
 * It names one and says how much time it is getting. So there is no title here, no state of the
 * work, no summary — nothing that could disagree with the record it points at. `explore.md` holds
 * both decisions in full; the second is the one that shapes this file most:
 *
 * **A planning period is not workspace-owned.** It is a person-level overlay across workspace-owned
 * canonical work. The two answer different questions:
 *
 *     a workspace answers   which project owns this work?
 *     planning answers      when will this person allocate real time to it?
 *
 * A week may therefore hold Mole Office work, greenhouse work and a dentist appointment at once,
 * and that is not a merge: each allocation names a record that stays in its own project, and an
 * allocation carries no authority — it is an id and a number of hours, and reading the record it
 * names goes through the same workspace gate as every other read.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO QUANTITIES, AND WHY THEY ARE NOT THE SAME NUMBER
 * ---------------------------------------------------------------------------------------
 *
 * `effort_hours` lives on the WORK and means *how big this is, in total*.
 * `plannedHours` lives on an ALLOCATION and means *how much time this slice is giving it*.
 *
 *     Task "complete experiment"     effort_hours = 20
 *       September                    plannedHours = 20
 *       week 2026-W36                plannedHours = 8
 *       Monday 2026-09-07            plannedHours = 3
 *
 * Those four numbers do not disagree about anything. They answer four different questions, and
 * flattening them into one is exactly what "planning is allocation, not duplication" rules out.
 * **They are never added across horizons** — see `loadOf`, which sums one horizon at a time and
 * says which.
 *
 * AND AN UNKNOWN ALLOCATION IS NOT THE WHOLE OF THE WORK. `plannedHours` may be null, meaning
 * somebody has committed to doing this in this period without saying how long for. Defaulting that
 * to `effort_hours` would put 20 hours into a Monday nobody promised 20 hours to.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PERIOD IS A STRING, AND WHY THAT STRING IS PARSED RATHER THAN TRUSTED
 * ---------------------------------------------------------------------------------------
 *
 * `2026-09`, `2026-W36`, `2026-09-07`. One column, one vocabulary, and every one of them is a key a
 * person can type and read. The alternative — a start date and an end date per row — stores the same
 * fact twice and lets a "week" be eight days long.
 *
 * Weeks are ISO-8601: Monday starts them, and week 1 is the one holding the 4th of January. That is
 * a choice rather than an obvious truth, and it is written down here because half the world starts a
 * week on Sunday. It is deterministic, which is what capacity arithmetic needs.
 *
 * All of it is LOCAL wall-clock, like every other date in Mole Office. A day here is the operator's day.
 */

import { calendarDaysBetweenDayKeys } from './time.ts'

/** The three horizons a plan is written at. Ordered coarse to fine, which several readers rely on. */
export const GRAINS = ['month', 'week', 'day'] as const
export type Grain = (typeof GRAINS)[number]

/**
 * Where an allocation has got to.
 *
 * `done` means THIS SLICE OF TIME was completed, and it says nothing about the work — settled by the
 * owner on 2026-08-12, and it is the whole reason a plan can be honest about work that spans days.
 * `dropped` is the day that did not happen, which is a different fact from one that was never
 * planned and the one a review needs in order to say anything true about planned against actual.
 */
export const ALLOCATION_STATES = ['planned', 'done', 'dropped'] as const
export type AllocationState = (typeof ALLOCATION_STATES)[number]

/** Two digits, so a month or a day is the same width every time. */
const pad = (n: number): string => String(n).padStart(2, '0')

/** A local calendar date with no time on it, built from the parts rather than from a UTC instant. */
function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day)
}

/** A `YYYY-MM-DD` day key as a local Date, built from its parts; null for anything that is not one. */
export function readDayKey(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  return match === null ? null : localDate(Number(match[1]), Number(match[2]), Number(match[3]))
}

/** `YYYY-MM-DD` for a Date, read in local time. */
export function dayKey(when: Date): string {
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
}

/** `YYYY-MM` for a Date, read in local time. */
export function monthKey(when: Date): string {
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}`
}

/**
 * `YYYY-Www` for a Date — ISO-8601, so Monday starts the week and week 1 holds 4 January.
 *
 * The year in the key is the ISO week-year, which is NOT always the calendar year: 1 January 2027
 * is a Friday, so it is in week 53 of 2026 and its key is `2026-W53`. Getting that wrong is how a
 * week's capacity ends up counted twice at a year boundary.
 */
export function weekKey(when: Date): string {
  const d = localDate(when.getFullYear(), when.getMonth() + 1, when.getDate())
  // Thursday of this week decides the year, which is the ISO rule stated as arithmetic.
  const dayOfWeek = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - dayOfWeek + 3)
  const isoYear = d.getFullYear()
  const firstThursday = localDate(isoYear, 1, 4)
  const firstDayOfWeek = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDayOfWeek + 3)
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return `${isoYear}-W${pad(week)}`
}

/** The key for a moment at a given horizon. One function, so the three cannot drift apart. */
export function periodKey(horizon: Grain, when: Date): string {
  if (horizon === 'month') return monthKey(when)
  if (horizon === 'week') return weekKey(when)
  return dayKey(when)
}

/** A period read back: which horizon it is, and the local days it covers, both ends included. */
export interface Period {
  horizon: Grain
  key: string
  /** First day, `YYYY-MM-DD`. */
  from: string
  /** Last day, `YYYY-MM-DD`. */
  to: string
}

const MONTH_KEY = /^(\d{4})-(\d{2})$/
const WEEK_KEY = /^(\d{4})-W(\d{2})$/
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Read a period key, or `null` when it is not one.
 *
 * PARSED RATHER THAN TRUSTED, and the range is computed rather than stored, so `2026-W99` and
 * `2026-13` are refused at the door instead of becoming a period nobody can place on a calendar.
 */
export function parsePeriod(key: string): Period | null {
  const month = MONTH_KEY.exec(key)
  if (month !== null) {
    const [, y, m] = month
    const year = Number(y)
    const mon = Number(m)
    if (mon < 1 || mon > 12) return null
    const last = localDate(year, mon + 1, 0).getDate()
    return { horizon: 'month', key, from: `${y}-${m}-01`, to: `${y}-${m}-${pad(last)}` }
  }

  const week = WEEK_KEY.exec(key)
  if (week !== null) {
    const [, y, w] = week
    const year = Number(y)
    const num = Number(w)
    if (num < 1 || num > 53) return null
    // Monday of ISO week `num`, from the week holding 4 January.
    const jan4 = localDate(year, 1, 4)
    const jan4DayOfWeek = (jan4.getDay() + 6) % 7
    const monday = localDate(year, 1, 4 - jan4DayOfWeek + (num - 1) * 7)
    // A 53rd week that does not exist in this year lands in the next one; refuse it rather than
    // silently answering about a week the caller did not name.
    if (weekKey(monday) !== key) return null
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)
    return { horizon: 'week', key, from: dayKey(monday), to: dayKey(sunday) }
  }

  const day = DAY_KEY.exec(key)
  if (day !== null) {
    const [, y, m, d] = day
    const date = localDate(Number(y), Number(m), Number(d))
    // Round-trip check, which is what catches 2026-02-30 becoming 2 March.
    if (dayKey(date) !== key) return null
    return { horizon: 'day', key, from: key, to: key }
  }

  return null
}

/**
 * Is `inner` wholly inside `outer`?
 *
 * Used to say how much of a week's plan has been given to particular days, and it is deliberately
 * NOT used to add the two together. A week that plans 8 hours and a Monday that plans 3 of them is
 * 8 hours of work, not 11.
 *
 * A week can straddle two months, so `containsPeriod('2026-09', '2026-W40')` is honestly false when
 * that week runs into October. Nothing here rounds a week into the month holding most of it.
 */
export function containsPeriod(outer: Period, inner: Period): boolean {
  return inner.from >= outer.from && inner.to <= outer.to
}

/** One allocation, as every reader of planning sees it. No field here restates the work. */
export interface Allocation {
  id: string
  horizon: Grain
  /** The period key: `2026-09`, `2026-W36`, `2026-09-07`. */
  period: string
  /** The canonical work this gives time to. It lives in its own workspace and stays there. */
  recordId: string
  /**
   * Hours committed to this work in this period, or `null` — which means somebody planned to work
   * on it here without saying for how long. NEVER filled in from the record's `effort_hours`.
   */
  plannedHours: number | null
  /** Hours actually spent, once somebody says. `null` until then; never inferred from `planned`. */
  actualHours: number | null
  state: AllocationState
  /** Why this slice, when there is something to say. */
  note: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Where a work window has got to.
 *
 * THE SAME THREE WORDS AS `ALLOCATION_STATES` AND A SEPARATE DECLARATION ON PURPOSE. They are two
 * facts about two different things — one is a span somebody meant to work in, the other is hours
 * given to a period — so one of them may gain a word without the other having to. Sharing the array
 * would tie two vocabularies that have no reason to stay equal. `done` on a window completes THE
 * WINDOW and says nothing about the work, exactly as `done` on an allocation completes that slice
 * and nothing else. `dropped` is the span that did not happen, which is different from one that was
 * never planned.
 */
export const WINDOW_STATES = ['planned', 'done', 'dropped'] as const
export type WindowState = (typeof WINDOW_STATES)[number]

/**
 * WHEN SOMEBODY MEANS TO WORK ON A PIECE OF WORK. A first day and a last day, both included.
 *
 * **A WINDOW CARRIES NO HOURS AND ENTERS NO TOTAL.** It answers *when*, not *how much*, and that is
 * the whole of it. `loadOf`, `fitOf` and every other number in this file read `Allocation` and read
 * nothing here. A surface that added a window into a week would be claiming somebody had committed
 * hours they never said.
 *
 * Both ends are day keys, `YYYY-MM-DD`, and both are INSIDE the window: 20 August to 26 August is
 * seven days. They go through `parsePeriod` like every other date in this product, so nothing here
 * is a second date reader. A window may cross a week or a month boundary, which is exactly why it
 * is two columns where an allocation's period is one string.
 */
export interface WorkWindow {
  id: string
  /** The canonical work this is about. It lives in its own workspace and stays there. */
  recordId: string
  /** First day, `YYYY-MM-DD`, included. */
  startsOn: string
  /** Last day, `YYYY-MM-DD`, included. Never before `startsOn`. */
  endsOn: string
  /** What to know when you come back to this block, or `null` because nobody wrote a note. */
  note: string | null
  state: WindowState
  createdAt: string
  updatedAt: string
}

/** How many days a window covers, both ends included. Nothing here turns days into hours. */
export function windowDays(window: { startsOn: string; endsOn: string }): number {
  return daysBetween(window.startsOn, window.endsOn)
}

/**
 * ONE PLACE A PERIOD HOLDS HOURS AT TWO LEVELS: hours on a piece of work, and hours on a part of
 * that same work. Both ends are named, because "two of these rows are related" without saying
 * which two is not something a reader can do anything about.
 *
 * THE NAME IS OLDER THAN WHAT IT MEANS NOW, and it is kept only so that the files naming it go on
 * compiling. Until round five this pair was a defect: a parent and a child could not both hold hours
 * in one period, `createAllocation` refused the second one, and a pair that reached a total meant
 * the total was adding one piece of work up twice. Planning now goes from coarse to fine, so a
 * parent may hold an envelope and its children may explain part of it. The
 * pair is ordinary, and `envelopesOf` below is what reads it. See the note in `Load.plannedHours`.
 */
export interface HoursCountedTwicePair {
  /** The work that holds the other. Its hours are the envelope over the work below it. */
  outer: { id: string; title: string }
  /** The work inside it. Its hours explain part of the outer row's hours. */
  inner: { id: string; title: string }
}

/**
 * WHAT READING CONTAINMENT FOR ONE PERIOD FOUND — the pairs, and the rows it could not read.
 *
 * `hoursCountedTwiceIn` in `src/server/lib/planning.ts` produces exactly this: it is the one reader
 * of containment for a period. **Nothing here recomputes it.** A second reading of the same fact
 * could disagree with the first, and then a week would be one number on one screen and another
 * number on the next.
 *
 * That server type carries more per row than this does — every allocation at each end, which a
 * sentence naming the rows needs and a total does not. It is assignable to this, and
 * `tests/planning-counted-twice.test.ts` fails to compile if it stops being, which is what keeps one
 * shape from becoming two.
 */
export interface HoursCountedTwice {
  horizon: Grain
  period: string
  /** Every pair where one row's work is inside another's. Empty is the ordinary answer. */
  pairs: readonly HoursCountedTwicePair[]
  /**
   * Every row here whose containment could not be read, with the reader's own sentence.
   *
   * NOT EMPTY MEANS THE PAIRS ARE INCOMPLETE — there may be more, and nothing has looked.
   */
  notChecked: readonly { recordId: string; title: string; why: string }[]
}

// ------------------------------------------------------- coarse first, fine later: the envelope

/**
 * ONE PIECE OF WORK IN ONE PERIOD, WITH THE ALLOCATED WORK INSIDE IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The owner plans coarse first and refines later: 15 hours on Baseline this week, then 5 on
 * Controller and 4 on Perception, with the rest not yet broken down. Those three rows are not 24
 * hours of work. They are 15 hours, of which 9 are now assigned to named parts.
 *
 * So the hours on the highest allocated piece of work are an ENVELOPE, the hours below it are
 * ASSIGNED, and what is left is NOT YET BROKEN DOWN. The tree contributes the envelope to the
 * period's total and never the sum.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN THE PARTS EXCEED THE ENVELOPE
 * ---------------------------------------------------------------------------------------
 *
 * That is a real conflict and it is SHOWN, not refused, and the tree then contributes the larger
 * number. Pretending the parts fit inside an envelope they exceed would be the arithmetic lying to
 * protect a rule.
 */
export interface EnvelopeNode {
  recordId: string
  title: string
  /**
   * Hours on this record in this period, or `null` when its rows gave no number.
   *
   * On the top of a tree this is the envelope. Null means somebody committed to the work here
   * without saying how long for, so there is no envelope and the parts are all that is known.
   */
  hours: number | null
  /** The allocated work directly inside this one. Empty on the deepest rows. */
  inside: EnvelopeNode[]
  /** What the work inside contributes, added up. Zero when there is none. */
  assignedHours: number
  /**
   * Envelope minus assigned, when the envelope is stated and larger. Zero when the parts fill it.
   *
   * `null` when this record's rows stated no hours: nothing can say what is left of a number
   * nobody gave.
   *
   * ON A ROW WITH NOTHING PLANNED INSIDE IT THIS IS THE WHOLE OF ITS HOURS, because none of them
   * has been given to a part yet. That is the same arithmetic as everywhere else and not a special
   * case; a surface drawing a row with no parts usually has no reason to show it.
   */
  notYetBrokenDownHours: number | null
  /** Assigned minus envelope, when the parts exceed it. `null` when they do not. */
  overAssignedByHours: number | null
  /** What this record and everything inside it add to the period's total. */
  contributesHours: number
}

/**
 * WHAT ONE PERIOD'S HOURS COME TO ONCE CONTAINMENT IS READ.
 *
 * `hours` is the number a person should act on. It is the sum of what every tree and every row on
 * its own contributes, so a parent with children in it counts once.
 */
export interface Envelopes {
  horizon: Grain
  period: string
  /**
   * Every tree in this period: a top record with allocated work inside it.
   *
   * A row with nothing allocated inside it is not a tree and is not listed here. Its hours are in
   * `hours` like everything else.
   */
  trees: EnvelopeNode[]
  /** The period's hours, counting each tree once. This is the total, not the sum of the rows. */
  hours: number
  /** Of those hours, how many are assigned to named parts inside a tree. */
  assignedHours: number
  /** Of those hours, how many are inside a tree and not yet broken down. */
  notYetBrokenDownHours: number
  /**
   * Every row this could not place in a tree, with the reader's own sentence.
   *
   * NOT EMPTY MEANS THE TOTAL MAY BE TOO HIGH. A row whose containment could not be read may be
   * inside one of the trees above, and it is counted on its own rather than guessed into one.
   */
  couldNotPlace: readonly { recordId: string; title: string; why: string }[]
}

/**
 * Refuse a containment reading of another period, in one place, for the two readers that take one.
 *
 * A note naming the wrong week is worse than no note, and this used to be written out inside
 * `loadOf` alone — so `envelopesOf` could have been handed a reading of another week and said
 * nothing.
 */
function sameSubject(horizon: Grain, period: string, reading: HoursCountedTwice): void {
  if (reading.horizon === horizon && reading.period === period) return
  throw new Error(
    `This total is for ${horizon} ${period}, and it was handed a reading of ` +
      `${reading.horizon} ${reading.period}. Read the period being totalled, or hand over ` +
      `nothing and the total will say nobody looked.`,
  )
}

/**
 * Read one period as trees: what holds an envelope, what is assigned inside it, and what the
 * period comes to.
 *
 * ---------------------------------------------------------------------------------------
 * IT READS CONTAINMENT AND DOES NOT WORK IT OUT
 * ---------------------------------------------------------------------------------------
 *
 * The pairs come from `hoursCountedTwiceIn` in `src/server/lib/planning.ts`, which is the one
 * reader of what contains what. This function only arranges them. A second reader here would be the
 * defect this repository keeps producing: the same fact worked out twice, free to disagree.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A TREE IS BUILT FROM PAIRS
 * ---------------------------------------------------------------------------------------
 *
 * A pair says one record is somewhere above another, at any distance. The reader gives every
 * ancestor of a record, so the record's own parent is the ancestor that has the most ancestors of
 * its own. A record with no allocated ancestor is the top of a tree. That is the whole of it, and
 * it works because a record is part of one thing: the ancestors of a record are a chain, so exactly
 * one of them has none of its own.
 *
 * NOTHING IS DROPPED. A row nothing could place — because the reader said so, or because the pairs
 * handed in form a loop — is counted on its own AND named in `couldNotPlace`, so the total is never
 * quietly short of hours somebody committed.
 */
export function envelopesOf(
  horizon: Grain,
  period: string,
  allocations: readonly Allocation[],
  containment: HoursCountedTwice,
): Envelopes {
  sameSubject(horizon, period, containment)
  const mine = allocations.filter((a) => a.horizon === horizon && a.period === period)

  // Hours per record. `null` means every row for it said nothing, which is not zero — see the
  // header of this file.
  const hoursOf = new Map<string, number | null>()
  for (const a of mine) {
    const held = hoursOf.get(a.recordId)
    if (a.plannedHours === null) {
      if (!hoursOf.has(a.recordId)) hoursOf.set(a.recordId, null)
      continue
    }
    hoursOf.set(a.recordId, round2((held ?? 0) + a.plannedHours))
  }

  const titles = new Map<string, string>()
  const ancestors = new Map<string, Set<string>>()
  for (const pair of containment.pairs) {
    // A pair naming work that holds no hours here is about some other question. It happens when the
    // reader was asked what a write WOULD make, and it is not part of this period's arithmetic.
    if (!hoursOf.has(pair.inner.id) || !hoursOf.has(pair.outer.id)) continue
    titles.set(pair.outer.id, pair.outer.title)
    titles.set(pair.inner.id, pair.inner.title)
    const above = ancestors.get(pair.inner.id)
    if (above === undefined) ancestors.set(pair.inner.id, new Set([pair.outer.id]))
    else above.add(pair.outer.id)
  }

  /** The nearest allocated ancestor: the one that has the most ancestors of its own. */
  const parentOfRecord = (id: string): string | null => {
    const above = [...(ancestors.get(id) ?? [])]
    if (above.length === 0) return null
    above.sort((a, b) => {
      const byDepth = (ancestors.get(b)?.size ?? 0) - (ancestors.get(a)?.size ?? 0)
      // Sorted by id when two are equally deep, so the same period always reads the same way.
      return byDepth !== 0 ? byDepth : a < b ? -1 : a > b ? 1 : 0
    })
    return above[0] ?? null
  }

  const inside = new Map<string, string[]>()
  const roots: string[] = []
  for (const id of hoursOf.keys()) {
    const parent = parentOfRecord(id)
    if (parent === null) {
      roots.push(id)
      continue
    }
    const held = inside.get(parent)
    if (held === undefined) inside.set(parent, [id])
    else held.push(id)
  }

  const couldNotPlace: { recordId: string; title: string; why: string }[] = containment.notChecked.map((row) => ({
    ...row,
  }))
  const placed = new Set<string>()

  const nodeOf = (id: string): EnvelopeNode => {
    placed.add(id)
    const children = (inside.get(id) ?? [])
      .filter((child) => {
        if (!placed.has(child)) return true
        // Only reachable from a reading whose pairs form a loop. The row is counted on its own
        // below rather than walked round for ever, and it is named.
        couldNotPlace.push({
          recordId: child,
          title: titles.get(child) ?? child,
          why: 'The pairs handed to this total put this work inside itself, so nothing can say where it sits.',
        })
        return false
      })
      .sort((a, b) => {
        const left = titles.get(a) ?? a
        const right = titles.get(b) ?? b
        return left < right ? -1 : left > right ? 1 : a < b ? -1 : a > b ? 1 : 0
      })
      .map(nodeOf)
    const assignedHours = round2(children.reduce((n, child) => n + child.contributesHours, 0))
    const envelope = hoursOf.get(id) ?? null
    const overAssignedByHours =
      envelope !== null && assignedHours > envelope ? round2(assignedHours - envelope) : null
    return {
      recordId: id,
      title: titles.get(id) ?? id,
      hours: envelope,
      inside: children,
      assignedHours,
      notYetBrokenDownHours: envelope === null ? null : round2(Math.max(0, envelope - assignedHours)),
      overAssignedByHours,
      // THE LARGER OF THE TWO, NEVER THE SUM. The envelope is what this costs the period; when the
      // parts exceed it, the parts are what it costs, and the conflict is shown beside the number.
      contributesHours: envelope === null ? assignedHours : Math.max(envelope, assignedHours),
    }
  }

  const tops = roots
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map(nodeOf)
  let hours = round2(tops.reduce((n, top) => n + top.contributesHours, 0))

  // A row that is in no tree at all. It cannot happen from a reading this codebase produces; it can
  // happen from one handed in by a caller. Counted, and named, rather than silently lost.
  for (const [id, held] of hoursOf) {
    if (placed.has(id)) continue
    couldNotPlace.push({
      recordId: id,
      title: titles.get(id) ?? id,
      why: 'Nothing in the containment reading says where this work sits, so its hours are counted on their own.',
    })
    hours = round2(hours + (held ?? 0))
  }

  const trees = tops.filter((top) => top.inside.length > 0)
  return {
    horizon,
    period,
    trees,
    hours,
    assignedHours: round2(trees.reduce((n, tree) => n + tree.assignedHours, 0)),
    notYetBrokenDownHours: round2(
      trees.reduce((n, tree) => n + (tree.notYetBrokenDownHours ?? 0), 0),
    ),
    couldNotPlace,
  }
}

/**
 * What a period's plan adds up to. Every number here says how many rows it could not see.
 *
 * THE COUNTS ARE NOT DECORATION. An unknown `plannedHours` is common and honest, so a total of 6
 * hours over four allocations means something different depending on whether all four said a number
 * or only two did. A capacity report that hid that would say a week fits when nobody has looked.
 */
export interface Load {
  horizon: Grain
  period: string
  /**
   * WHAT THIS PERIOD COSTS, counting a piece of work and the parts of it inside it once.
   *
   * With a containment reading — `countedTwice` below, which every route hands over — this is
   * `envelopes.hours`: each tree contributes its envelope, so 15 hours on Baseline with 5 on
   * Controller and 4 on Perception is 15 and never 24. Without one it is the plain sum of the rows,
   * and `countedTwice: null` beside it says nobody read what contains what.
   *
   * IT CHANGED IN ROUND FIVE. Until 16 August 2026 hours on a piece of work and hours on a part of
   * it could not both exist, so this was always the plain sum; a pair that reached a total meant the
   * total was wrong and the note beside it said so. Planning now goes coarse first and is refined
   * later, so the pair is now ordinary and the arithmetic reads it. `rowHours` is the old number and
   * is still here, because the two answer different questions.
   */
  plannedHours: number
  /**
   * The plain sum of the rows, with nothing about containment in it.
   *
   * Kept beside the total because they differ exactly when this period plans at two levels, and a
   * reader who wants to know what the rows themselves say should not have to add them up again.
   */
  rowHours: number
  /**
   * The trees in this period and what each one is holding, or `null` when nobody read containment.
   *
   * `null` here and `countedTwice: null` are the same absence, said twice for two readers.
   */
  envelopes: Envelopes | null
  /** How many allocations there are in this period, at this horizon. */
  allocations: number
  /** How many of them said how long. `allocations - stated` is how many did not. */
  stated: number
  /** Sum of `actualHours` where recorded, and how many rows that was. */
  actualHours: number
  actualStated: number
  /** How many are finished, and how many were dropped. */
  done: number
  dropped: number
  /**
   * WHICH OF THESE ROWS HOLD WORK INSIDE ANOTHER ROW'S WORK — and `null` when nobody looked.
   *
   * `null` is not "none". It means no caller handed this total a containment reading, so nothing
   * knows whether these hours plan one piece of work at two levels. An empty `pairs` is the other
   * answer: somebody read the period and every row stands on its own.
   *
   * WHAT IT MEANS NOW. A parent holding an envelope with its children explaining part of it is
   * ordinary planning since 16 August 2026, so a pair is not a defect. `plannedHours` above reads
   * these pairs and counts each tree once; `envelopes` above is the same reading arranged as trees.
   * The field keeps its old name so that the surfaces naming it go on working, and the name is due
   * to change — see `HoursCountedTwicePair`.
   */
  countedTwice: HoursCountedTwice | null
}

/**
 * Add up one horizon's allocations. One horizon at a time, always — see the file header.
 *
 * `countedTwice` is the period's containment reading, from `hoursCountedTwiceIn` in
 * `src/server/lib/planning.ts`. **Leaving it out means nobody looked**, and the total is then the
 * plain sum of the rows and says so, rather than claiming to have counted a tree once. Handing over
 * a reading of a DIFFERENT period throws, because a note naming the wrong week is worse than no
 * note.
 *
 * WITH A READING, THE TOTAL IS TREE-AWARE: 15 hours on a piece of work, 5 and 4 on parts of it, is
 * 15 hours in this period and never 24. `envelopesOf` above is where that happens and why.
 */
export function loadOf(
  horizon: Grain,
  period: string,
  allocations: readonly Allocation[],
  countedTwice?: HoursCountedTwice | null,
): Load {
  if (countedTwice != null) sameSubject(horizon, period, countedTwice)
  const mine = allocations.filter((a) => a.horizon === horizon && a.period === period)
  const envelopes = countedTwice == null ? null : envelopesOf(horizon, period, mine, countedTwice)
  let plannedHours = 0
  let stated = 0
  let actualHours = 0
  let actualStated = 0
  let done = 0
  let dropped = 0
  for (const a of mine) {
    if (a.plannedHours !== null) {
      plannedHours += a.plannedHours
      stated++
    }
    if (a.actualHours !== null) {
      actualHours += a.actualHours
      actualStated++
    }
    if (a.state === 'done') done++
    if (a.state === 'dropped') dropped++
  }
  // ROUNDED HERE TOO, and it was not: `fitOf` and `spreadOf` rounded their arithmetic and this
  // function handed them — and the screen, and the sentence a person reads — the raw sum. Two
  // allocations of 0.1 and 0.2 produced "0.30000000000000004 hours planned". Found by an
  // independent reviewer; the test beside it asserted only `fitOf`'s answer, which was the one
  // number already rounded, so it passed with the defect in place.
  return {
    horizon,
    period,
    // THE TREE-AWARE NUMBER WHEN THERE IS ONE, and the plain sum when nobody read containment.
    // Which of the two this is is not left to the reader to work out: `envelopes` and
    // `countedTwice` are both null in the second case.
    plannedHours: envelopes === null ? round2(plannedHours) : envelopes.hours,
    rowHours: round2(plannedHours),
    envelopes,
    allocations: mine.length,
    stated,
    actualHours: round2(actualHours),
    actualStated,
    done,
    dropped,
    countedTwice: countedTwice ?? null,
  }
}

/**
 * How a period's plan sits against the hours available in it.
 *
 * `capacityHours` null means nobody has said how many hours this period holds — which is NOT zero
 * and not a full week. Every field that would need it is then null too, rather than computed from a
 * number nobody gave.
 */
export interface Fit {
  load: Load
  capacityHours: number | null
  /** capacity − planned, when there is a capacity. Negative means the period is over-committed. */
  freeHours: number | null
  overcommitted: boolean | null
  /** How many allocations gave no number. Free hours are only as true as this is small. */
  unstated: number
}

export function fitOf(load: Load, capacityHours: number | null): Fit {
  const unstated = load.allocations - load.stated
  if (capacityHours === null) {
    return { load, capacityHours: null, freeHours: null, overcommitted: null, unstated }
  }
  const freeHours = round2(capacityHours - load.plannedHours)
  return { load, capacityHours, freeHours, overcommitted: freeHours < 0, unstated }
}

/**
 * How much of a coarser period's plan has been given to finer periods inside it.
 *
 * THIS IS THE ONE PLACE TWO GRAINS MEET, and it is a comparison rather than a sum. Of the 8 hours
 * planned for a week, 3 are on a Monday: that is 3 scheduled and 5 not yet placed on a day. It is
 * reported per record, because "5 hours unscheduled" spread over one task and over five is a
 * different week.
 */
export interface Spread {
  recordId: string
  /** Hours the coarser period gave this record, or null if it did not say. */
  plannedHours: number | null
  /** Hours the finer periods inside it gave the same record. */
  scheduledHours: number
  /** How many finer allocations there are, and how many of those said a number. */
  finer: number
  finerStated: number
  /**
   * planned − scheduled, or null when the coarser period gave no number. Negative means more time
   * has been placed on days than the week ever committed to, which is a real answer and is reported
   * rather than clamped.
   */
  unscheduledHours: number | null
}

export function spreadOf(
  outer: Period,
  finerGrain: Grain,
  allocations: readonly Allocation[],
): Spread[] {
  const coarse = allocations.filter((a) => a.horizon === outer.horizon && a.period === outer.key)
  const finer = allocations.filter((a) => {
    if (a.horizon !== finerGrain) return false
    const p = parsePeriod(a.period)
    return p !== null && containsPeriod(outer, p)
  })

  const byRecord = new Map<string, Spread>()
  const ensure = (recordId: string): Spread => {
    const found = byRecord.get(recordId)
    if (found !== undefined) return found
    const made: Spread = { recordId, plannedHours: null, scheduledHours: 0, finer: 0, finerStated: 0, unscheduledHours: null }
    byRecord.set(recordId, made)
    return made
  }

  for (const a of coarse) {
    const row = ensure(a.recordId)
    if (a.plannedHours !== null) row.plannedHours = round2((row.plannedHours ?? 0) + a.plannedHours)
  }
  for (const a of finer) {
    const row = ensure(a.recordId)
    row.finer++
    if (a.plannedHours !== null) {
      row.scheduledHours = round2(row.scheduledHours + a.plannedHours)
      row.finerStated++
    }
  }
  for (const row of byRecord.values()) {
    row.unscheduledHours = row.plannedHours === null ? null : round2(row.plannedHours - row.scheduledHours)
  }
  return [...byRecord.values()]
}

// ============================================================================ 6D — one person

/**
 * WHERE A PERIOD'S HOURS GO, BY WHO OWNS THE WORK.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONSTRAINT THIS EXISTS TO MAKE VISIBLE
 * ---------------------------------------------------------------------------------------
 *
 * The owner's requirement for this is one sentence — *make the real single-person constraint
 * visible* — and the example is a week holding greenhouse work, Mole Office, paper reading, a
 * visitor, a family call, exercise and a buffer. There is one person and one week, and the projects
 * do not know about each other. A plan that only ever showed one project at a time could show three
 * green weeks that add up to an impossible one.
 *
 * So this groups the SAME allocations `loadOf` counts by the project that owns each row's work, and
 * that is the whole of it: no new table, no category field, no cross-workspace link. Owner decision
 * §35 is what makes it legitimate — a planning period is a person-level overlay across
 * workspace-owned work — and the grouping key is the workspace each record already states. Personal
 * commitments are records in their own project and group like any other; nothing here invents a
 * taxonomy of life.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT TAKES ROWS RATHER THAN READING THEM
 * ---------------------------------------------------------------------------------------
 *
 * Pure, like everything else in this file: the caller hands over each allocation with the project
 * its work belongs to, already resolved. `src/server/lib/planning.ts` is the only thing that reads
 * records, by primary key, and it must stay that way — a grouping function that fetched by workspace
 * would be the one query the planning layer is not allowed to have.
 *
 * WORK THAT IS GONE is grouped under `owner: null` rather than dropped. An allocation pointing at a
 * deleted record is a fact about the plan, and a week that quietly lost two hours would be worse
 * than one that says two hours belong to something no longer there.
 */
export interface Share {
  /** The project that owns this row's work, or `null` when the work is gone. */
  owner: string | null
  /** Sum of `plannedHours` over the rows in this group that carry one. */
  plannedHours: number
  /** How many allocations are in this group. */
  allocations: number
  /** How many of them said how long, and how many did not. Hours are only as true as `unstated` is small. */
  stated: number
  unstated: number
  /** The record ids in this group, so a surface can list them without a second pass. */
  recordIds: string[]
}

/** One allocation and the project that owns the work it names. `owner` is null when it is gone. */
export interface OwnedAllocation {
  allocation: Allocation
  owner: string | null
}

/**
 * Group one period's plan by project.
 *
 * THE PARTS ADD UP TO `loadOf`'s TOTAL, and that is not a comment — `tests/planning-shares.test.ts`
 * runs both over the same rows and fails when they disagree. Two numbers on one screen that are
 * supposed to be the same number, with nothing making them the same, is the defect this repository
 * keeps producing; a share table is a particularly good place for it to hide, because each row looks
 * right on its own.
 *
 * Sorted by hours, then by name, so the same week always draws the same way. A group with no stated
 * hours sorts last and still appears: three unestimated commitments are a real claim on a week.
 */
export function sharesOf(
  horizon: Grain,
  period: string,
  rows: readonly OwnedAllocation[],
): Share[] {
  const mine = rows.filter((r) => r.allocation.horizon === horizon && r.allocation.period === period)
  // KEYED ON THE OWNER ITSELF, null included, because a Map takes null as a key and it cannot
  // collide with a project. This used to key on a string and stand in for "no owner" with a raw NUL
  // byte, `'\0gone'`, written as the byte itself rather than an escape. Nothing said it was there.
  // What that cost: `file` reported this source as binary data, `grep` matched nothing anywhere in
  // it, and an agent read a missing match as a missing declaration. No sentinel replaces it, so the
  // question of which string could never be a project id does not arise.
  const byOwner = new Map<string | null, Share>()

  for (const { allocation, owner } of mine) {
    let share = byOwner.get(owner)
    if (share === undefined) {
      share = { owner, plannedHours: 0, allocations: 0, stated: 0, unstated: 0, recordIds: [] }
      byOwner.set(owner, share)
    }
    share.allocations++
    share.recordIds.push(allocation.recordId)
    if (allocation.plannedHours === null) share.unstated++
    else {
      share.plannedHours = round2(share.plannedHours + allocation.plannedHours)
      share.stated++
    }
  }

  return [...byOwner.values()].sort((a, b) => {
    if (a.plannedHours !== b.plannedHours) return b.plannedHours - a.plannedHours
    // A null owner sorts last among equals: it is a gap in the plan, not a project.
    if (a.owner === null) return 1
    if (b.owner === null) return -1
    return a.owner.localeCompare(b.owner)
  })
}

// ============================================================ reading time out of ordinary words

/**
 * A PERIOD READ OUT OF WHAT SOMEBODY WROTE, OR NOTHING AND WHY. NEVER A GUESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS BESIDE `parsePeriod` AND NOT INSIDE IT
 * ---------------------------------------------------------------------------------------
 *
 * `parsePeriod` reads the three canonical keys and stays the only thing that does. It answers
 * "is this a period key" and its answer is stored. This answers a different question — "did somebody
 * name a period in these words" — and its answer is an INTERPRETATION of what a person wrote, which
 * is shown beside their words and waits for them. The two must not be one function: a reader of
 * loose words inside the parser would let a guess reach the database through the door that is meant
 * to be strict.
 *
 * ---------------------------------------------------------------------------------------
 * IT READS A SHORT LIST AND REFUSES EVERYTHING ELSE
 * ---------------------------------------------------------------------------------------
 *
 * today, tomorrow, this week, next week, this month, next month, a weekday, a month by name, a date
 * like `aug 24`, a canonical key, and a range of days that covers exactly one day, week or month.
 * Anything else reads as nothing, including a phrase that is nearly one of those — `sometime next
 * week` is not `next week`, because the person said they had not decided.
 *
 * A RANGE ONLY READS AS A PERIOD WHEN IT IS EXACTLY ONE. Mole Office plans by the month, the week or the
 * day, so `7 to 9 September` is three days and none of those. Rounding it up to the week holding it
 * would be inventing a commitment nobody made.
 *
 * **THOSE WORDS ARE NOT NOTHING, THOUGH, AND THAT IS THE CHANGE OF 17 AUGUST 2026.** `aug 24-28` and
 * `before friday` are WINDOWS — a first day and a last day, which is when somebody means to work on
 * something. `readWindowWords` below reads them, this function still answers `read: false` for them
 * because they name no period, and its `why` now says which window it read instead of implying that
 * nothing was understood. One reader for both: the range and the deadline are parsed once, in
 * `windowIn`, and both functions read its answer.
 */
export type PeriodWords =
  | {
      read: true
      period: Period
      /** What was made of the words, in a sentence, so a person can see the interpretation. */
      how: string
    }
  | { read: false; why: string }

/** Hours read out of what somebody wrote, or nothing and why. */
export type HoursWords = { read: true; hours: number; how: string } | { read: false; why: string }

/**
 * What one sentence about time says: how long, when, and across what span. Each answers for itself.
 *
 * `period` and `window` are two different facts and a sentence may name either, both or neither.
 * `next week` names a period. `aug 24-28` names a window and no period. `monday to sunday` names
 * both, and they agree because the period is computed from the same two days the window holds.
 */
export interface TimeWords {
  hours: HoursWords
  period: PeriodWords
  /** The span these words name, or the reason they name none. A window never carries hours. */
  window: WindowWords
}

/**
 * Words that say the writer has not decided. Their presence stops any reading of the whole phrase.
 *
 * THE LIST IS FOR THE SENTENCE, NOT FOR SAFETY. Safety is that the reader knows a short list of
 * shapes and refuses everything else, so `sometime next week` would read as nothing whether or not
 * `sometime` were listed here. What the list buys is a reply that says WHICH word stopped it, which
 * is the difference between a person correcting their sentence and a person retyping it at random.
 */
const UNSETTLED_WORDS = [
  'sometime',
  'some time',
  'maybe',
  'perhaps',
  'probably',
  'possibly',
  'around',
  'about',
  'roughly',
  'approximately',
  'approx',
  'hopefully',
  'ideally',
  'before',
  'after',
  'by',
  'early',
  'late',
  'or so',
  'ish',
] as const

/** The four parts of a day. Mole Office plans by the day, so these name the day and nothing finer. */
const PARTS_OF_DAY = ['morning', 'afternoon', 'evening', 'night'] as const

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const

/**
 * The month a name or a short form means, 0 for January, or null when nothing does.
 *
 * A SHORT FORM HAS TO NAME EXACTLY ONE MONTH. `aug` is August and `sept` is September, because no
 * other month begins with either. `ma` is refused, because March and May both do and picking one
 * would be the guess this whole layer exists to avoid. Three letters is the shortest that is ever
 * allowed, so a stray word cannot become a month.
 */
function monthNamed(said: string): number | null {
  const exact = MONTHS.indexOf(said as (typeof MONTHS)[number])
  if (exact >= 0) return exact
  if (said.length < 3) return null
  const starting = MONTHS.map((m, i) => (m.startsWith(said) ? i : -1)).filter((i) => i >= 0)
  return starting.length === 1 ? (starting[0] ?? null) : null
}

/** Lower case, one space between words, no full stop at the end. Nothing else is changed. */
function tidy(words: string): string {
  return words.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '')
}

/** The unsettled word in these words, or null. Matched whole, so "maybe" does not match "maybel". */
function unsettledWordIn(said: string): string | null {
  for (const word of UNSETTLED_WORDS) {
    const pattern = new RegExp(`(^|[^a-z])${word}([^a-z]|$)`)
    if (pattern.test(said)) return word
  }
  return null
}

/** The `YYYY-MM-DD` of a day this many days from a local date. */
function dayAfter(from: Date, days: number): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + days)
}

/** A `YYYY-MM-DD` key back as a local date. Only ever called on a key `parsePeriod` accepted. */
function dateOfDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1)
}

/** One day named by words, with the sentence saying what was made of them. */
interface DayWords {
  day: string
  how: string
}

/**
 * One day out of words: `today`, `tomorrow`, a weekday, `aug 24`, or a date like `2026-09-07`.
 *
 * A weekday means the NEXT one, and today counts as itself: `monday` written on a Monday is that
 * Monday. That is a stated convention rather than a guess, and it is stated in `how` so that the
 * person sees which date it made before anything is committed.
 *
 * A MONTH NAME WITH A DAY AND NO YEAR takes the next month of that name, INCLUDING THE ONE WE ARE
 * IN — the same convention `readPeriodWords` already states for a bare month name, kept identical so
 * there are not two rules about the same words. So `aug 5` written on 12 August 2026 is 5 August
 * 2026, which has gone; the date is in `how`, and a person who meant next year writes the year.
 * Reading it as 2027 instead would be a second rule nobody stated.
 */
function readDayWords(said: string, now: Date): DayWords | null {
  let words = said
  let partOfDay: string | null = null
  for (const part of PARTS_OF_DAY) {
    if (words.endsWith(` ${part}`)) {
      partOfDay = part
      words = words.slice(0, -part.length - 1).trim()
      break
    }
  }
  // Mole Office's finest grain is a day, so the part of the day is read and then said out loud rather
  // than stored. The words themselves are kept whole by whoever asked.
  const narrower =
    partOfDay === null ? '' : ` Mole Office plans by the day, so "${partOfDay}" is in your words and not in the plan.`

  const named = (day: string, how: string): DayWords => ({ day, how: how + narrower })

  if (words === 'today') return named(dayKey(now), `"today" is ${dayKey(now)}.`)
  if (words === 'tomorrow') {
    const day = dayKey(dayAfter(now, 1))
    return named(day, `"tomorrow" is ${day}.`)
  }

  const monthDay = /^([a-z]+) (\d{1,2})$/.exec(words)
  if (monthDay !== null) {
    const month = monthNamed(monthDay[1] ?? '')
    const dayOfMonth = Number(monthDay[2])
    if (month !== null && dayOfMonth >= 1) {
      const year = month >= now.getMonth() ? now.getFullYear() : now.getFullYear() + 1
      const day = dayKey(localDate(year, month + 1, dayOfMonth))
      // THE ROUND TRIP IS WHAT CATCHES "february 30". `localDate` rolls it forward into March, and a
      // date nobody typed is exactly what this reader must never answer with. The month and the day
      // both have to come back as they went in.
      const back = parsePeriod(day)
      if (back !== null && Number(day.slice(5, 7)) === month + 1 && Number(day.slice(8)) === dayOfMonth) {
        return named(day, `"${words}" is ${day}.`)
      }
    }
  }

  const weekday = WEEKDAYS.indexOf(words as (typeof WEEKDAYS)[number])
  if (weekday >= 0) {
    const todayIndex = (now.getDay() + 6) % 7
    const forward = (weekday - todayIndex + 7) % 7
    const day = dayKey(dayAfter(now, forward))
    return named(
      day,
      forward === 0
        ? `"${words}" is today, ${day}.`
        : `"${words}" is the next ${words}, ${day}.`,
    )
  }

  const key = parsePeriod(words)
  if (key !== null && key.horizon === 'day') return named(key.key, `"${words}" is the day ${key.key}.`)
  return null
}

/** The canonical period covering exactly these two days, or null when none does. */
function periodCovering(from: string, to: string): Period | null {
  if (from > to) return null
  const start = dateOfDayKey(from)
  for (const key of [dayKey(start), weekKey(start), monthKey(start)]) {
    const period = parsePeriod(key)
    if (period !== null && period.from === from && period.to === to) return period
  }
  return null
}

/**
 * How long the days from `from` to `to` are, both ends included, for a sentence that has to say why. Counted as
 * calendar dates by `calendarDaysBetweenDayKeys` in shared/time.ts, the one counter of days the person reads.
 */
function daysBetween(from: string, to: string): number {
  const between = calendarDaysBetweenDayKeys(from, to)
  // Both keys come from `dayKey` or a validated period, so a null is a broken caller, said rather than counted.
  if (between === null) throw new RangeError(`"${from}" to "${to}" is not two dates`)
  return between + 1
}

const WHAT_IT_READS =
  'It reads today, tomorrow, this week, next week, this month, next month, a weekday, a month by ' +
  'name, a date like 2026-09-07 or aug 24, a key like 2026-W36 or 2026-09, and a range of days that ' +
  'covers exactly one day, week or month. A range of any other length, and "before friday", are read ' +
  'as a window instead — a span to work across, which is not a period.'

/**
 * A SPAN OF DAYS READ OUT OF WHAT SOMEBODY WROTE: A FIRST DAY AND A LAST DAY. NEVER A GUESS.
 *
 * A window says WHEN somebody means to work on something. It carries no hours and enters no total,
 * so reading one commits nothing and claims nothing about how big the work is.
 *
 * IT READS TWO SHAPES AND REFUSES EVERYTHING ELSE:
 *
 *     a range     `aug 24-28`, `aug 24 to 28`, `monday to friday`, `2026-09-07 to 2026-09-09`.
 *                 An en dash, an em dash and a hyphen all separate, with or without spaces around
 *                 the dash, and `to` and `until` do the same job.
 *     a deadline  `before friday`, `before aug 24` — a window that ENDS on that day and starts
 *                 today, because today is when you can start. Both ends are said out loud in `how`.
 *
 * A SINGLE DAY, A WEEK OR A MONTH IS NOT READ HERE. Those are periods, `readPeriodWords` reads them,
 * and a caller that wants one as a span takes `from` and `to` off the period it answered with. Two
 * readers answering for the same words is the defect this repository keeps finding.
 */
export type WindowWords =
  | {
      read: true
      window: { startsOn: string; endsOn: string }
      /** What was made of the words, in a sentence, so a person can see the interpretation. */
      how: string
    }
  | { read: false; why: string }

/**
 * The window these words name, the reason they name a broken one, or `null` for "not a window at all".
 *
 * THE THIRD ANSWER IS WHY THIS IS SEPARATE FROM `readWindowWords`. `readPeriodWords` has to tell
 * "these words are not a window shape, carry on trying the other shapes" apart from "these words are
 * a window and here is what is wrong with it", and a two-answer type cannot say both.
 */
function windowIn(said: string, now: Date): WindowWords | null {
  // A DEADLINE FIRST, because `before` is in UNSETTLED_WORDS for every other shape and has to keep
  // stopping them. "before friday" names an end; "sometime before friday" does not reach here,
  // because the unsettled word is not at the front and the caller checks for it.
  const deadline = /^before (.+)$/.exec(said)
  if (deadline !== null) {
    const rest = deadline[1] ?? ''
    if (unsettledWordIn(rest) !== null) return null
    const end = readDayWords(rest, now)
    if (end === null) return null
    const start = dayKey(now)
    if (end.day < start) {
      return {
        read: false,
        why:
          `"${said}" ends on ${end.day}, which has gone. A window cannot end before today, ${start}. ` +
          'Mole Office read no window from these words and kept them exactly as they are.',
      }
    }
    const long = daysBetween(start, end.day)
    return {
      read: true,
      window: { startsOn: start, endsOn: end.day },
      how:
        `"${said}" is a window ending on ${end.day}. It starts today, ${start}. ` +
        `That is ${long} day${long === 1 ? '' : 's'}.`,
    }
  }

  const ends = rangeEnds(said)
  if (ends === null) return null
  const [leftWords, rightWords] = ends
  const from = readDayWords(leftWords, now)
  if (from === null) return null
  // THE SECOND DAY IS READ FROM THE FIRST ONE. "monday to sunday" means the Monday and then the
  // Sunday after it; read from today instead, the two ends can come out in the wrong order and a
  // week reads as nothing. A date on the right ignores this, because a date says its own day.
  const to = dayOfMonthWords(rightWords, from.day) ?? readDayWords(rightWords, dateOfDayKey(from.day))
  if (to === null) return null
  if (to.day < from.day) {
    return {
      read: false,
      why:
        `These words end on ${to.day}, which is before they start on ${from.day}. ` +
        'Mole Office read no period from them and kept them exactly as they are.',
    }
  }
  const days = daysBetween(from.day, to.day)
  return {
    read: true,
    window: { startsOn: from.day, endsOn: to.day },
    how: `${from.how} ${to.how} That is ${days} day${days === 1 ? '' : 's'}, ${from.day} to ${to.day}.`,
  }
}

/**
 * The two halves of a range, or null when these words are not one.
 *
 * FOUR PATTERNS AND NOT ONE, because a hyphen is inside every date key this product uses. `to` and
 * `until` need spaces around them; a dash may have none. A bare hyphen with no spaces only splits
 * `aug 24-28`, a month name and two day numbers, so `2026-09-07` is never torn in half.
 */
function rangeEnds(said: string): [string, string] | null {
  for (const pattern of [
    /^(.+?) (?:to|until) (.+)$/,
    /^(.+?)\s*[–—]\s*(.+)$/,
    /^(.+?) - (.+)$/,
    /^([a-z]+ \d{1,2})-(\d{1,2})$/,
  ]) {
    const found = pattern.exec(said)
    const left = found?.[1]
    const right = found?.[2]
    if (left !== undefined && right !== undefined) return [left, right]
  }
  return null
}

/**
 * A bare day number on the right of a range: `aug 24-28`, where 28 means the 28th of that month.
 *
 * NULL WHEN THE NUMBER IS NOT A DAY OF THAT MONTH — `aug 24-40` reads as nothing rather than as some
 * day in September. The month and the day both have to come back as they went in.
 */
function dayOfMonthWords(said: string, from: string): DayWords | null {
  if (!/^\d{1,2}$/.test(said)) return null
  const start = dateOfDayKey(from)
  const dayOfMonth = Number(said)
  if (dayOfMonth < 1) return null
  const day = dayKey(localDate(start.getFullYear(), start.getMonth() + 1, dayOfMonth))
  if (Number(day.slice(5, 7)) !== start.getMonth() + 1 || Number(day.slice(8)) !== dayOfMonth) return null
  return { day, how: `"${said}" is day ${dayOfMonth} of the same month, ${day}.` }
}

/**
 * Read a window out of ordinary words, or answer that it read none and say why.
 *
 * `now` is handed in rather than read from the clock, for the same reason `readPeriodWords` takes it:
 * "before friday" is about the person's day, and the caller is the one holding it.
 */
export function readWindowWords(words: string, now: Date): WindowWords {
  const said = tidy(words)
  if (said === '') return { read: false, why: 'Nothing was written, so there is no window to read.' }

  const found = windowIn(said, now)
  if (found !== null) return found

  const unsettled = unsettledWordIn(said)
  if (unsettled !== null) {
    return {
      read: false,
      why:
        `These words include "${unsettled}", which says the time is not settled. ` +
        'Mole Office read no window from them and kept them exactly as they are.',
    }
  }
  return {
    read: false,
    why:
      'Mole Office could not read a window from these words. It reads a range of days such as aug 24-28, ' +
      'aug 24 to 28 or monday to friday, and a deadline such as before friday.',
  }
}

/**
 * Read a period out of ordinary words, or answer that it read none and say why.
 *
 * `now` is handed in rather than read from the clock, because a reading of "today" is about the
 * person's day and the caller is the one holding it. Everything here is local wall-clock time, like
 * every other date in Mole Office.
 */
export function readPeriodWords(words: string, now: Date): PeriodWords {
  const said = tidy(words)
  if (said === '') {
    return { read: false, why: 'Nothing was written, so there is no period to read.' }
  }

  // A SPAN FIRST, because "monday to friday" holds a weekday that would otherwise read on its own,
  // and because "before friday" holds a weekday behind a word that stops every other shape. Whatever
  // a window makes of these words, this function answers about a PERIOD: a span that is exactly one
  // day, one week or one month is that period, and any other span is not a period at all.
  const window = windowIn(said, now)
  if (window !== null) {
    if (!window.read) return { read: false, why: window.why }
    const period = periodCovering(window.window.startsOn, window.window.endsOn)
    if (period !== null) {
      return { read: true, period, how: `${window.how} Those days are exactly the ${period.horizon} ${period.key}.` }
    }
    return {
      read: false,
      why:
        `${window.how} Mole Office plans by the month, the week or the day, and those days are none of them. ` +
        'It read a window from these words instead — a span to work across — and no period.',
    }
  }

  const unsettled = unsettledWordIn(said)
  if (unsettled !== null) {
    return {
      read: false,
      why:
        `These words include "${unsettled}", which says the time is not settled. ` +
        'Mole Office read no period from them and kept them exactly as they are.',
    }
  }

  const notRead = { read: false as const, why: `Mole Office could not read a period from these words. ${WHAT_IT_READS}` }

  const day = readDayWords(said, now)
  if (day !== null) {
    const period = parsePeriod(day.day)
    if (period !== null) return { read: true, period, how: day.how }
  }

  const weekAhead = said === 'next week' ? 7 : said === 'this week' ? 0 : null
  if (weekAhead !== null) {
    const period = parsePeriod(weekKey(dayAfter(now, weekAhead)))
    if (period !== null) return { read: true, period, how: `"${said}" is ${period.key}, ${period.from} to ${period.to}.` }
  }

  if (said === 'this month' || said === 'next month') {
    const first = new Date(now.getFullYear(), now.getMonth() + (said === 'next month' ? 1 : 0), 1)
    const period = parsePeriod(monthKey(first))
    if (period !== null) return { read: true, period, how: `"${said}" is ${period.key}.` }
  }

  // A month by name, with or without a year. Without one it is the next month of that name,
  // including this one — stated here and stated again in `how`, so nobody has to guess which.
  const month = /^([a-z]+)(?: (\d{4}))?$/.exec(said)
  if (month !== null) {
    const index = MONTHS.indexOf((month[1] ?? '') as (typeof MONTHS)[number])
    if (index >= 0) {
      const named = month[2]
      const year =
        named !== undefined ? Number(named) : index >= now.getMonth() ? now.getFullYear() : now.getFullYear() + 1
      const period = parsePeriod(monthKey(new Date(year, index, 1)))
      if (period !== null) {
        return {
          read: true,
          period,
          how:
            named !== undefined
              ? `"${said}" is the month ${period.key}.`
              : `"${said}" is the next ${month[1] ?? ''}, ${period.key}.`,
        }
      }
    }
  }

  // Upper case only for a week key: `parsePeriod` reads `2026-W36` and a person may type the w small.
  const canonical = parsePeriod(said.toUpperCase())
  if (canonical !== null) {
    return { read: true, period: canonical, how: `"${said}" is the ${canonical.horizon} ${canonical.key}.` }
  }

  return notRead
}

/**
 * Read a number of hours out of ordinary words, or answer that it read none.
 *
 * A UNIT IS REQUIRED. `5` on its own is not read as five hours: in a sentence a person wrote it may
 * be a date, a count of anything, or five hours, and choosing one of those would be a guess. `5h`,
 * `5 hours` and `2.5 hrs` are read. Nothing here checks whether the number is a sensible number of
 * hours — `checkHours` on the server owns that, and owns it alone.
 */
export function readHoursWords(words: string): HoursWords {
  const said = tidy(words)
  if (said === '') return { read: false, why: 'Nothing was written, so there are no hours to read.' }

  const unsettled = unsettledWordIn(said)
  if (unsettled !== null) {
    return {
      read: false,
      why:
        `These words include "${unsettled}", which says the number is not settled. ` +
        'Mole Office read no hours from them and kept them exactly as they are.',
    }
  }

  const found = [...said.matchAll(/(^|[^a-z0-9.])(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)(?![a-z])/g)]
  if (found.length === 0) {
    return {
      read: false,
      why: 'Mole Office could not read a number of hours from these words. It reads 5h, 5 hours and 2.5 hrs.',
    }
  }
  if (found.length > 1) {
    // Two numbers of hours in one sentence, and nothing here can say which is meant or whether they
    // add up. Refusing is the honest answer and the words are kept.
    return {
      read: false,
      why:
        'These words name hours more than once, and Mole Office cannot say which you meant or whether they ' +
        'add up. Your words are kept as they are.',
    }
  }
  const hours = Number(found[0]?.[2])
  if (!Number.isFinite(hours)) {
    return { read: false, why: 'Mole Office could not read a number of hours from these words.' }
  }
  return { read: true, hours, how: `"${found[0]?.[2] ?? ''}${found[0]?.[3] ?? ''}" is ${hours} hours.` }
}

/** What an hours box made of what somebody typed into it. Three answers, and none is a guess. */
export type HoursBoxRead =
  | { said: 'nothing' }
  | { said: 'hours'; hours: number; how: string }
  | { said: 'words'; why: string }

/**
 * WHAT AN HOURS BOX MAKES OF WHAT SOMEBODY TYPED. Three answers, and none of them is a guess.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT `Number(what they typed)`
 * ---------------------------------------------------------------------------------------
 *
 * It was, in the box that gives a plan line time, and that was the worst lie in the product.
 * `Number("5h")` is `NaN`, `JSON.stringify` turns `NaN` into `null`, and `null` is that route's
 * LEGITIMATE value for "somebody committed to this work here without saying for how long". So
 * typing `5h` wrote an allocation and Mole Office then said no hours had been stated. All three readers
 * who had never seen the product hit it on their first try.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 *   `nothing`  the box is empty. That is a real answer: on a box that writes an allocation it means
 *              somebody committed to the work without saying for how long, and on a box that writes
 *              a field it means nobody has said. It is the ONLY way any of them becomes null.
 *   `hours`    a number Mole Office can defend, with its own sentence saying what it read.
 *   `words`    it could not read a number of hours, so it reads none. The words are kept exactly as
 *              typed, the caller writes nothing, and the caller says why in these words.
 *
 * A BARE NUMBER IS HOURS, AND THAT IS NOT A GUESS: every box that calls this is labelled in hours,
 * so the unit is stated. `readHoursWords` demands a unit because it reads a whole sentence, where
 * `5` could be a date, a count of anything, or five hours.
 *
 * ---------------------------------------------------------------------------------------
 * ONE READER FOR EVERY HOURS BOX IN THE PRODUCT, AND WHY IT LIVES HERE
 * ---------------------------------------------------------------------------------------
 *
 * It was written beside the box that needed it first, and the rest of the product went on reading
 * its own boxes with `Number(…)`. Measured in a browser on 16 August 2026, `5h` was read as five
 * hours by the "Give it time" box on a plan and refused as "not a number of hours" by the hours
 * cell on a week, the week's capacity, the hours each press commits, the box on a day, and the
 * How big cell. One string, six boxes, two answers — the eighth rule broken in five places and the
 * same question answered in three. So the reader sits beside `readHoursWords`, which it calls, and
 * every box in the product reads through it. Whether the number is a sensible one is still the
 * server's question and it answers it in its own words.
 */
export function readHoursBox(typed: string): HoursBoxRead {
  const trimmed = typed.trim()
  if (trimmed === '') return { said: 'nothing' }
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
    const hours = Number(trimmed)
    // Whether it is a sensible number of hours is the server's question and it answers it in its
    // own words. A negative number reaches it and is refused there, naming the rule.
    return { said: 'hours', hours, how: `${hours} hours.` }
  }
  const read = readHoursWords(trimmed)
  if (read.read) return { said: 'hours', hours: read.hours, how: read.how }
  return { said: 'words', why: read.why }
}

/**
 * WHAT AN HOURS BOX MADE OF WHAT IS IN IT, IN ONE SENTENCE, or nothing where there is nothing to say.
 *
 * The eighth rule's second layer: an interpretation is a claim about somebody's words, so it is
 * shown beside them and never instead of them. Every hours box in the product says this same
 * sentence, from this one writer, because four boxes each phrasing it their own way is four
 * sentences that can drift from each other and from what was written.
 *
 * IT IS SILENT WHERE THE CHARACTERS AND THE NUMBER ARE THE SAME THING. Saying "5 is 5 hours" back to
 * somebody who typed `5` is noise, and noise on every row is how a sentence that matters stops being
 * read. It is silent on words it could not read as well: that is a refusal, it belongs in the words
 * of whichever box refused, and those say what was NOT written.
 */
export function hoursReadingSaid(typed: string): string | null {
  const read = readHoursBox(typed)
  if (read.said !== 'hours') return null
  const trimmed = typed.trim()
  return trimmed === String(read.hours) ? null : `Read “${trimmed}” as ${read.hours}h.`
}

/**
 * Read what one sentence says about time: how long, when, and across what span.
 *
 * The hours are taken out of the sentence and the rest is read as a period and as a window, so
 * `15h this week` reads as hours and a period, and `aug 24-28` reads as a window and nothing else.
 * EACH ANSWERS FOR ITSELF: `15h` gives hours and no period and no window, and a caller with only one
 * of the three knows exactly which one it has.
 */
export function readTimeWords(said: string, now: Date): TimeWords {
  const hours = readHoursWords(said)
  const rest = tidy(said).replace(/(^|[^a-z0-9.])(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)(?![a-z])/g, '$1').trim()
  // THREE ANSWERS FROM ONE SENTENCE, and none of them is derived from another. A window is not a
  // period and carries no hours, so a caller that can only place one of the three takes that one and
  // leaves the rest as words.
  return { hours, period: readPeriodWords(rest, now), window: readWindowWords(rest, now) }
}

/** What Mole Office made of somebody's time words, short enough to print in a cell of a dense table. */
export interface TimeWordsSaid {
  /**
   * What it read, written the way this product writes a period and a number of hours everywhere
   * else: `2026-W35`, `15h`, or `2026-W35, 15h`. NULL WHEN IT READ NEITHER, which is a real answer
   * and not an error — see the eighth rule.
   */
  read: string | null
  /** Everything both readers said, in their own sentences, for a reader who wants the whole of it. */
  how: string
}

/**
 * WHAT MOLE OFFICE MADE OF ONE LINE'S TIME WORDS, IN AS FEW CHARACTERS AS THE TRUTH TAKES.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FIXES: THE THIRD QUESTION WAS ANSWERED ON ONE SIDE OF FILING ONLY
 * ---------------------------------------------------------------------------------------
 *
 * A scheduling surface answers three things: when, how much, and WHAT DID MOLE OFFICE UNDERSTAND.
 * Measured in a browser on 16 August 2026: typing `next week` into the Time given cell of a line
 * nobody had filed kept the words perfectly — through both views, a save and a reload — and said
 * nothing at all about what Mole Office made of them. The reading, and the words that keep it honest,
 * lived behind the "Give it time" press, and that press exists only on a line already filed as work.
 *
 * READING WORDS COSTS NOTHING AND COMMITS NOTHING, so the honest half needs no record. This is that
 * half: it reads, it says what it read, and it writes nowhere.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT A SECOND READER
 * ---------------------------------------------------------------------------------------
 *
 * `readTimeWords` above does the reading, which is `readPeriodWords` and `readHoursWords` and
 * nothing else. This puts their two answers into the words the Time given column already prints
 * once a piece of work has hours, so what Mole Office understood before filing and what it shows after
 * filing are the same characters. Nothing here matches a word or guesses a date.
 */
export function timeWordsSaid(said: string, now: Date): TimeWordsSaid {
  const { hours, period } = readTimeWords(said, now)
  const parts: string[] = []
  if (period.read) parts.push(period.period.key)
  if (hours.read) parts.push(`${hours.hours}h`)
  return {
    read: parts.length === 0 ? null : parts.join(', '),
    how: `${period.read ? period.how : period.why} ${hours.read ? hours.how : hours.why}`,
  }
}

/**
 * Two decimal places, because hours are written like `2.5` and floating point is not.
 *
 * `0.1 + 0.2` is `0.30000000000000004`, and a capacity report that showed that would be telling the
 * truth in a way nobody can read. Rounding is applied to sums, never to what somebody typed.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * WHAT THE SCHEDULE'S PRIMARY PRESS SAYS ON A DATED PERIOD, so a refusal can name the press a person
 * has to find. It is the same words as 'schedule.planWeek', 'scheduleDesign.planMonth' and
 * 'scheduleDesign.planDay' in src/shared/words/en.ts; tests/the-schedule-as-designed.test.ts fails
 * when the two come apart. It lives in this shared file so a test can read it without opening a database; the server does
 * not load the word lists, which is why the words are written here.
 */
export const PLAN_PRESS: Readonly<Record<Grain, string>> = {
  week: 'Plan this week',
  month: 'Plan this month',
  day: 'Plan this day',
}
