// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FIXED DEADLINE IS ARITHMETIC, AND THE HARD HALF OF IT IS WHAT NOBODY KNOWS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS ARE PINNING
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/deadlines.ts` answers one question over an ordinary `obligation`: a date is fixed and
 * something is owed by it — is there enough time left? Getting the sums right is the easy part. The
 * part these tests exist for is everything the sums CANNOT see:
 *
 *   - work nobody estimated is not zero hours, so a buffer built on it is NOT a number;
 *   - capacity nobody stated is not zero and not a full working week, so the same;
 *   - a due written as a condition in words is not a date, so there is no time remaining at all,
 *     and "mid September" is not quietly turned into the 15th;
 *   - a plan written at the week horizon is not nothing just because the day horizon was counted.
 *
 * Each of those has a test below that FAILS IF THE ANSWER BECOMES A PLAUSIBLE NUMBER. That is the
 * only kind of test worth writing here: an arithmetic bug shows up as a wrong total, and a doctrine
 * bug shows up as a total where there should have been a null.
 *
 * NO DATABASE AND NO SERVER. Every function under test is pure and takes plain data.
 *
 * ---------------------------------------------------------------------------------------
 * THE CALENDAR THESE TESTS STAND ON
 * ---------------------------------------------------------------------------------------
 *
 *   now                2026-09-01 09:00, a Tuesday, inside ISO week 2026-W36 (31 Aug – 6 Sep)
 *   2026-W37           7 – 13 September, the one whole week between the 1st and the 18th
 *   a bare due date    the END of that day, which is `parseDueStamp`'s rule and not a second copy
 */

import { describe, expect, it } from 'vitest'
import {
  DEADLINE_GAPS,
  DEADLINE_GAP_SENTENCES,
  deadlineOutlook,
  deadlineTiming,
  estimateOf,
  periodsIn,
  windowOf,
  type CapacityStatement,
  type DeadlineInput,
  type DeadlineWork,
} from '../src/shared/deadlines.ts'
import { loadOf, type Allocation, type Grain } from '../src/shared/planning.ts'
import { readDue } from '../src/shared/work.ts'
// The REAL due-stamp reader, the one the attention rule uses, so a bare date means the end of that
// day here for exactly the reason it does everywhere else. tests/attention-rule.test.ts imports it
// the same way.
import { parseDueStamp } from '../src/web/lib/attention.ts'

const NOW = new Date(2026, 8, 1, 9, 0, 0).getTime()

/** An allocation without a database. */
function alloc(part: Partial<Allocation> & Pick<Allocation, 'horizon' | 'period' | 'recordId'>): Allocation {
  return {
    id: `a-${part.horizon}-${part.period}-${part.recordId}`,
    plannedHours: null,
    actualHours: null,
    state: 'planned',
    note: null,
    createdAt: '2026-09-01 08:00',
    updatedAt: '2026-09-01 08:00',
    ...part,
  }
}

/** `hours` on each of the given day keys. */
function dayCapacity(hours: number, ...days: string[]): CapacityStatement[] {
  return days.map((period) => ({ horizon: 'day' as Grain, period, hours }))
}

const WORKING_WEEK = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']

/** The ordinary case, which each test then breaks in exactly one place. */
function outlook(over: Partial<DeadlineInput> = {}) {
  return deadlineOutlook({
    now: NOW,
    due: readDue({ due: '2026-09-05' }),
    dueMs: parseDueStamp,
    horizon: 'day',
    work: [
      { id: 'task-a', effortHours: 10 },
      { id: 'task-b', effortHours: 6 },
    ],
    allocations: [
      alloc({ horizon: 'day', period: '2026-09-01', recordId: 'task-a', plannedHours: 3 }),
      alloc({ horizon: 'day', period: '2026-09-02', recordId: 'task-a', plannedHours: 4 }),
      alloc({ horizon: 'day', period: '2026-09-03', recordId: 'task-b', plannedHours: 2 }),
    ],
    capacity: dayCapacity(4, ...WORKING_WEEK),
    ...over,
  })
}

// ============================================================================ everything known

describe('a deadline where every input is known', () => {
  it('reports the deadline, the time left, the work, the plan, the capacity and the buffer', () => {
    const result = outlook()

    // The deadline itself, read through work.ts and nowhere else.
    expect(result.deadline.standing).toBe('dated')
    expect(result.deadline.date).toBe('2026-09-05')
    expect(result.deadline.past).toBe(false)
    // 1 Sep 09:00 to the end of 5 Sep: four days and just under fifteen hours.
    expect(result.deadline.remainingMs).toBe(parseDueStamp('2026-09-05')! - NOW)

    expect(result.between).not.toBeNull()
    const between = result.between!
    expect(between.window).toEqual({ from: '2026-09-01', to: '2026-09-05', days: 5 })

    // How big the work is, from `effort_hours` on the work and nothing else.
    expect(result.estimate).toEqual({ hours: 16, items: 2, estimated: 2, unestimated: 0 })

    // What the plan gives it, from `plannedHours` on the allocations and nothing else.
    expect(between.planned.hours).toBe(9)
    expect(between.planned.allocations).toBe(3)
    expect(between.planned.stated).toBe(3)
    expect(between.planned.unstated).toBe(0)
    expect(between.planned.periods).toEqual(WORKING_WEEK)

    // Estimated work with no time on it yet: 10 − 7 for A, 6 − 2 for B.
    expect(between.unplaced.hours).toBe(7)
    expect(between.unplaced.counted).toBe(2)
    expect(between.unplaced.uncounted).toBe(0)

    expect(between.capacity.hours).toBe(20)
    expect(between.capacity.stated).toBe(5)
    expect(between.capacity.unstated).toBe(0)
    expect(between.capacity.partial).toEqual([])

    expect(result.buffer).toEqual({ hours: 4, fits: true })

    // AND NOTHING WAS LEFT UNCOUNTED. This is the assertion that makes every `gaps` check below
    // mean something: the list is empty exactly when every input was there.
    expect(result.gaps).toEqual([])
  })

  it('reports each piece of work separately, because one number over two tasks is a different week', () => {
    const result = outlook()
    expect(result.work).toEqual([
      { recordId: 'task-a', effortHours: 10, plannedHours: 7, allocations: 2, stated: 2, unplacedHours: 3 },
      { recordId: 'task-b', effortHours: 6, plannedHours: 2, allocations: 1, stated: 1, unplacedHours: 4 },
    ])
  })

  it('counts the day `now` falls in whole, and says that it did', () => {
    // The one overstatement in the file, said out loud instead of hidden. Nothing records how a
    // day's hours sit inside it, so cutting today down by the hours already gone would be a number
    // nobody wrote — the alternative is to count it and report it, which is this.
    expect(outlook().between?.capacity.periodsAlreadyStarted).toBe(1)
  })
})

// ============================================================================ nobody estimated it

describe('work nobody has estimated', () => {
  it('DOES NOT COUNT AS ZERO HOURS, and refuses to say whether it fits', () => {
    const result = outlook({
      work: [
        { id: 'task-a', effortHours: null },
        { id: 'task-b', effortHours: null },
      ],
    })

    expect(result.estimate).toEqual({ hours: 0, items: 2, estimated: 0, unestimated: 2 })
    expect(result.gaps).toContain('nothing-estimated')

    // THE ONE THAT MATTERS. There are twenty hours of capacity and two tasks of unknown size. The
    // tempting answer is 20 − 0 = 20 hours spare, and it is false in the direction that makes
    // somebody miss a deadline.
    expect(result.buffer.hours).toBeNull()
    expect(result.buffer.hours).not.toBe(20)
    expect(result.buffer.fits).toBeNull()
    expect(result.buffer.fits).not.toBe(true)

    // And there is no unplaced work to state either: nothing to subtract the plan from.
    expect(result.between?.unplaced.hours).toBeNull()
    expect(result.between?.unplaced.counted).toBe(0)
    expect(result.between?.unplaced.uncounted).toBe(2)
    // The nine hours the plan gives them are still reported — against work of unknown size.
    expect(result.between?.unplaced.hoursAgainstUnestimated).toBe(9)
    expect(result.between?.planned.hours).toBe(9)
  })

  it('says how many pieces it could not size when only some carry an estimate', () => {
    const result = outlook({
      work: [
        { id: 'task-a', effortHours: 10 },
        { id: 'task-b', effortHours: null },
      ],
    })
    expect(result.estimate).toEqual({ hours: 10, items: 2, estimated: 1, unestimated: 1 })
    expect(result.gaps).toContain('some-work-unestimated')
    // The buffer is computed over the ten hours somebody DID estimate, and the count that says it
    // covers one task of two travels with it. A reader who ignores that count is reading a buffer
    // that has no idea how big task-b is.
    expect(result.buffer).toEqual({ hours: 10, fits: true })
    expect(result.estimate.unestimated).toBe(1)
    expect(result.between?.unplaced.hours).toBe(3)
    expect(result.between?.unplaced.hoursAgainstUnestimated).toBe(2)
  })

  it('never fills an unstated allocation in from the estimate on the work', () => {
    const result = outlook({
      allocations: [alloc({ horizon: 'day', period: '2026-09-01', recordId: 'task-a' })],
    })
    // Somebody committed to working on a ten-hour task on Tuesday without saying for how long.
    // Putting ten hours into a Tuesday nobody promised ten hours to is the substitution this checks.
    expect(result.between?.planned.hours).toBe(0)
    expect(result.between?.planned.hours).not.toBe(10)
    expect(result.between?.planned.allocations).toBe(1)
    expect(result.between?.planned.stated).toBe(0)
    expect(result.between?.planned.unstated).toBe(1)
    expect(result.gaps).toContain('some-allocations-without-hours')
  })

  it('names no work at all as its own answer, not as work nobody estimated', () => {
    const result = outlook({ work: [], allocations: [] })
    expect(result.gaps).toContain('no-work-named')
    expect(result.gaps).not.toContain('nothing-estimated')
    expect(result.estimate).toEqual({ hours: 0, items: 0, estimated: 0, unestimated: 0 })
    expect(result.buffer.hours).toBeNull()
  })
})

// ============================================================================ nobody stated capacity

describe('capacity nobody has stated', () => {
  it('is not zero and is not a full working week', () => {
    const result = outlook({ capacity: [] })
    expect(result.between?.capacity.hours).toBeNull()
    expect(result.between?.capacity.stated).toBe(0)
    expect(result.between?.capacity.unstated).toBe(5)
    expect(result.gaps).toContain('no-capacity-stated')

    // Sixteen hours of estimated work and no idea how many hours the five days hold. "It does not
    // fit" would be a verdict on evidence nobody has, and `false` is the answer that would get a
    // deadline moved for no reason.
    expect(result.buffer.hours).toBeNull()
    expect(result.buffer.fits).toBeNull()
    expect(result.buffer.fits).not.toBe(false)
  })

  it('keeps a stated zero apart from nobody having said', () => {
    // A week somebody is away is a real answer, and it must not read as a gap in the record.
    const result = outlook({ capacity: dayCapacity(0, ...WORKING_WEEK) })
    expect(result.between?.capacity.hours).toBe(0)
    expect(result.between?.capacity.stated).toBe(5)
    expect(result.gaps).not.toContain('no-capacity-stated')
    expect(result.buffer).toEqual({ hours: -16, fits: false })
  })

  it('says how much of the window the capacity covers when only some days state one', () => {
    const result = outlook({ capacity: dayCapacity(4, '2026-09-01', '2026-09-02') })
    expect(result.between?.capacity.hours).toBe(8)
    expect(result.between?.capacity.stated).toBe(2)
    expect(result.between?.capacity.unstated).toBe(3)
    expect(result.gaps).toContain('some-periods-without-capacity')
    // The buffer is computed on eight hours over five days, and the count beside it is what stops
    // that reading as "the whole window holds eight hours".
    expect(result.buffer).toEqual({ hours: -8, fits: false })
  })
})

// ============================================================================ not a date at all

describe('a due that is not a date', () => {
  it('HAS NO TIME REMAINING, and no date is invented so that it can be counted', () => {
    const result = outlook({ due: readDue({ due: { condition: 'the reprint is on the bench' } }) })

    expect(result.deadline.standing).toBe('waiting-on-a-condition')
    expect(result.deadline.date).toBeNull()
    expect(result.deadline.condition).toBe('the reprint is on the bench')
    expect(result.deadline.atMs).toBeNull()
    expect(result.deadline.remainingMs).toBeNull()
    // NULL IS NOT FALSE. A promise owed when the reprint lands is waiting, not on time.
    expect(result.deadline.past).toBeNull()
    expect(result.deadline.past).not.toBe(false)

    // No window, and therefore no capacity, no plan and no buffer — they are questions with no
    // subject rather than zeroes. Grouped in one object so none of them can be read on its own.
    expect(result.between).toBeNull()
    expect(result.buffer).toEqual({ hours: null, fits: null })
    expect(result.gaps).toContain('no-date')

    // How big the work is was never a question about time, so that survives.
    expect(result.estimate.hours).toBe(16)
    expect(result.work).toEqual([
      { recordId: 'task-a', effortHours: 10, plannedHours: null, allocations: null, stated: null, unplacedHours: null },
      { recordId: 'task-b', effortHours: 6, plannedHours: null, allocations: null, stated: null, unplacedHours: null },
    ])
  })

  it('does not turn "mid September" into a date', () => {
    // The exact substitution this file exists to refuse. An invented 15 September would be
    // indistinguishable afterwards from a date somebody wrote, and every number below it would be
    // evidence about a deadline nobody agreed.
    const result = outlook({ due: readDue({ due: 'mid September' }) })
    expect(result.deadline.standing).toBe('date-unreadable')
    // The stored words are kept exactly as written, and read as words rather than as a deadline.
    expect(result.deadline.date).toBe('mid September')
    expect(result.deadline.atMs).toBeNull()
    expect(result.deadline.remainingMs).toBeNull()
    expect(result.between).toBeNull()
    expect(result.buffer.hours).toBeNull()
    expect(result.gaps).toContain('no-date')
  })

  it('waits on a record without checking it, and without a deadline appearing', () => {
    const result = outlook({ due: readDue({ due: { recordId: 'rec_1' } }) })
    expect(result.deadline.standing).toBe('waiting-on-a-record')
    expect(result.deadline.recordId).toBe('rec_1')
    expect(result.deadline.remainingMs).toBeNull()
    expect(result.between).toBeNull()
  })

  it('says nothing at all is written, which is not the same as waiting', () => {
    const result = outlook({ due: readDue({}) })
    expect(result.deadline.standing).toBe('no-due-recorded')
    expect(result.deadline.remainingMs).toBeNull()
    expect(result.gaps).toContain('no-date')
  })

  it('keeps a condition written beside a date, and lets the date decide', () => {
    const result = outlook({
      due: readDue({ due: { date: '2026-09-05', condition: 'the reprint is on the bench' } }),
    })
    expect(result.deadline.standing).toBe('dated')
    expect(result.deadline.condition).toBe('the reprint is on the bench')
    expect(result.between).not.toBeNull()
  })
})

// ============================================================================ already past

describe('a deadline that has already gone', () => {
  it('says so, and reports no window ahead rather than an empty one', () => {
    const result = outlook({ due: readDue({ due: '2026-08-20' }) })

    expect(result.deadline.standing).toBe('dated')
    expect(result.deadline.past).toBe(true)
    expect(result.deadline.remainingMs).not.toBeNull()
    expect(result.deadline.remainingMs!).toBeLessThan(0)

    // There is no stretch of time between now and a date that has gone, so capacity, the plan
    // inside the window and the buffer have nothing to be about. This is a DIFFERENT gap from
    // `no-date`: one is a passed deadline, the other is no deadline, and they do not want the same
    // sentence on a screen.
    expect(result.between).toBeNull()
    expect(result.gaps).toContain('deadline-passed')
    expect(result.gaps).not.toContain('no-date')
    expect(result.buffer).toEqual({ hours: null, fits: null })
  })

  it('still has a window on the day the deadline itself falls', () => {
    const result = outlook({ due: readDue({ due: '2026-09-01' }) })
    expect(result.deadline.past).toBe(false)
    expect(result.between?.window).toEqual({ from: '2026-09-01', to: '2026-09-01', days: 1 })
  })
})

// ============================================================================ more planned than estimated

describe('more time planned than the work was ever estimated at', () => {
  it('reports the negative rather than clamping it to zero', () => {
    const result = outlook({
      work: [{ id: 'task-a', effortHours: 2 }],
      allocations: [
        alloc({ horizon: 'day', period: '2026-09-01', recordId: 'task-a', plannedHours: 3 }),
        alloc({ horizon: 'day', period: '2026-09-02', recordId: 'task-a', plannedHours: 2 }),
      ],
    })
    expect(result.estimate.hours).toBe(2)
    expect(result.between?.planned.hours).toBe(5)
    // Five hours placed against a two-hour estimate is −3, and it usually means the estimate is
    // stale. Clamping it to zero would hide the only signal that says so.
    expect(result.between?.unplaced.hours).toBe(-3)
    expect(result.work[0]?.unplacedHours).toBe(-3)
  })
})

// ============================================================================ it does not fit

describe('a window that does not hold the work', () => {
  it('says by how much, and says it does not fit', () => {
    // Ten hours available over five days, sixteen hours of estimated work.
    const result = outlook({ capacity: dayCapacity(2, ...WORKING_WEEK) })
    expect(result.between?.capacity.hours).toBe(10)
    expect(result.estimate.hours).toBe(16)
    expect(result.buffer).toEqual({ hours: -6, fits: false })
    // Nothing was missing — this is a verdict, not a gap.
    expect(result.gaps).toEqual([])
  })
})

// ============================================================================ one horizon at a time

describe('the plan and the capacity are counted at one horizon, and it says which', () => {
  it('does not add a week and the days inside it together', () => {
    const result = outlook({
      allocations: [
        alloc({ horizon: 'week', period: '2026-W36', recordId: 'task-a', plannedHours: 8 }),
        alloc({ horizon: 'day', period: '2026-09-01', recordId: 'task-a', plannedHours: 3 }),
      ],
    })
    // A week planning 8 hours and a Tuesday planning 3 of them is 8 hours of work, not 11. Counted
    // at the day horizon, it is the 3.
    expect(result.between?.planned.hours).toBe(3)
    expect(result.between?.planned.horizon).toBe('day')
  })

  it('SAYS SO when the work is planned at a horizon that was not counted', () => {
    const result = outlook({
      allocations: [alloc({ horizon: 'week', period: '2026-W36', recordId: 'task-a', plannedHours: 8 })],
    })
    // Zero planned hours at the day horizon reads as "nothing is planned", and the truth is
    // "nothing is planned AT THIS HORIZON". Without this count the report would be a lie that no
    // number in it could contradict.
    expect(result.between?.planned.hours).toBe(0)
    expect(result.between?.planned.atOtherHorizons).toBe(1)
    expect(result.gaps).toContain('plan-at-another-horizon')
  })

  it('ignores an allocation for other work entirely', () => {
    const result = outlook({
      allocations: [alloc({ horizon: 'day', period: '2026-09-01', recordId: 'somebody-elses', plannedHours: 8 })],
    })
    expect(result.between?.planned.hours).toBe(0)
    expect(result.between?.planned.allocations).toBe(0)
    expect(result.between?.planned.atOtherHorizons).toBe(0)
  })

  it('ignores an allocation on this work outside the window', () => {
    const result = outlook({
      allocations: [alloc({ horizon: 'day', period: '2026-09-30', recordId: 'task-a', plannedHours: 8 })],
    })
    expect(result.between?.planned.hours).toBe(0)
    expect(result.between?.planned.allocations).toBe(0)
    expect(result.between?.planned.atOtherHorizons).toBe(0)
  })
})

// ============================================================================ whole periods only

describe('a period the window only clips is named and not counted', () => {
  it('counts the one whole week between the 1st and the 18th and names the two it clips', () => {
    const result = deadlineOutlook({
      now: NOW,
      due: readDue({ due: '2026-09-18' }),
      dueMs: parseDueStamp,
      horizon: 'week',
      work: [{ id: 'task-a', effortHours: 10 }],
      allocations: [
        alloc({ horizon: 'week', period: '2026-W36', recordId: 'task-a', plannedHours: 4 }),
        alloc({ horizon: 'week', period: '2026-W37', recordId: 'task-a', plannedHours: 6 }),
      ],
      capacity: [
        { horizon: 'week', period: '2026-W36', hours: 20 },
        { horizon: 'week', period: '2026-W37', hours: 30 },
        { horizon: 'week', period: '2026-W38', hours: 25 },
      ],
    })

    const between = result.between!
    expect(between.window).toEqual({ from: '2026-09-01', to: '2026-09-18', days: 18 })
    expect(between.capacity.periods).toEqual(['2026-W37'])
    // W36 runs from 31 August and W37+1 runs to 20 September. Both overlap the window and neither
    // lies inside it, so both are NAMED and neither is counted.
    expect(between.capacity.partial).toEqual(['2026-W36', '2026-W38'])
    expect(result.gaps).toContain('periods-overlap-the-window')

    // AND NOT PRORATED. W36 states 20 hours and six of its days are in the window; nothing records
    // how those 20 hours sit inside the week, so a share of them would be a number nobody wrote.
    // 30, not 30 + some fraction of 20 and 25.
    expect(between.capacity.hours).toBe(30)
    expect(between.planned.hours).toBe(6)
    expect(between.capacity.periodsAlreadyStarted).toBe(0)
  })

  it('says it could count nothing when no whole period fits in the window', () => {
    const result = outlook({
      horizon: 'month',
      due: readDue({ due: '2026-09-18' }),
      capacity: [{ horizon: 'month', period: '2026-09', hours: 160 }],
      allocations: [alloc({ horizon: 'month', period: '2026-09', recordId: 'task-a', plannedHours: 12 })],
    })
    // September runs to the 30th and the window stops on the 18th, so the month is clipped. A
    // capacity of null here says "nothing could be counted at this horizon"; 160 would claim the
    // whole month is available before a deadline in the middle of it.
    expect(result.between?.capacity.periods).toEqual([])
    expect(result.between?.capacity.partial).toEqual(['2026-09'])
    expect(result.between?.capacity.hours).toBeNull()
    expect(result.between?.planned.hours).toBe(0)
    expect(result.gaps).toContain('no-whole-period-in-window')
    expect(result.buffer.hours).toBeNull()
  })

  it('lists the periods of a window through the same keys planning.ts writes', () => {
    expect(periodsIn('day', { from: '2026-09-01', to: '2026-09-03', days: 3 })).toEqual({
      whole: ['2026-09-01', '2026-09-02', '2026-09-03'],
      partial: [],
    })
    expect(periodsIn('week', { from: '2026-09-01', to: '2026-09-18', days: 18 })).toEqual({
      whole: ['2026-W37'],
      partial: ['2026-W36', '2026-W38'],
    })
  })
})

// ============================================================================ the pieces on their own

describe('the pure pieces, so a caller can use them without the whole report', () => {
  it('reads time remaining as lateness with its sign turned round', () => {
    const timing = deadlineTiming(readDue({ due: '2026-09-05' }), NOW, parseDueStamp)
    expect(timing.remainingMs).toBe(parseDueStamp('2026-09-05')! - NOW)
    expect(timing.atMs).toBe(parseDueStamp('2026-09-05'))
  })

  it('sizes work without any deadline being involved', () => {
    expect(estimateOf([{ id: 'a', effortHours: 3 }, { id: 'b', effortHours: null }])).toEqual({
      hours: 3,
      items: 2,
      estimated: 1,
      unestimated: 1,
    })
    expect(estimateOf([])).toEqual({ hours: 0, items: 0, estimated: 0, unestimated: 0 })
  })

  it('has no window when there is no date, and none when the date has gone', () => {
    const noDate = deadlineTiming(readDue({ due: { condition: 'the reprint lands' } }), NOW, parseDueStamp)
    expect(windowOf(noDate, NOW)).toBeNull()
    const gone = deadlineTiming(readDue({ due: '2026-08-20' }), NOW, parseDueStamp)
    expect(windowOf(gone, NOW)).toBeNull()
  })
})

// ============================================================================ agreement with the model it sits on

describe('it does not disagree with shared/planning.ts', () => {
  it('rounds a sum of hours the way `loadOf` rounds one', () => {
    // `round2` is private in both files, so a test is what makes the two agree — the fix CLAUDE.md
    // names for "two places that must agree, with nothing making them agree". 0.1 + 0.2 is
    // 0.30000000000000004, and a plan that printed that would be true in a way nobody can read.
    const allocations = [
      alloc({ horizon: 'day', period: '2026-09-01', recordId: 'task-a', plannedHours: 0.1 }),
      alloc({ horizon: 'day', period: '2026-09-01', recordId: 'task-b', plannedHours: 0.2 }),
    ]
    const load = loadOf('day', '2026-09-01', allocations)
    const result = deadlineOutlook({
      now: NOW,
      due: readDue({ due: '2026-09-01' }),
      dueMs: parseDueStamp,
      horizon: 'day',
      work: [
        { id: 'task-a', effortHours: null },
        { id: 'task-b', effortHours: null },
      ],
      allocations,
      capacity: [],
    })
    expect(load.plannedHours).toBe(0.3)
    expect(result.between?.planned.hours).toBe(load.plannedHours)
    // And the counts come from the same doctrine, so a window of one period is `loadOf` restricted
    // to the work this deadline names.
    expect(result.between?.planned.allocations).toBe(load.allocations)
    expect(result.between?.planned.stated).toBe(load.stated)
  })

  it('adds its rows up to its totals, so the two cannot disagree', () => {
    const result = outlook()
    const rows = result.work
    const planned = rows.reduce((sum, row) => sum + (row.plannedHours ?? 0), 0)
    const allocations = rows.reduce((sum, row) => sum + (row.allocations ?? 0), 0)
    const unplaced = rows.reduce((sum, row) => sum + (row.unplacedHours ?? 0), 0)
    expect(result.between?.planned.hours).toBe(planned)
    expect(result.between?.planned.allocations).toBe(allocations)
    expect(result.between?.unplaced.hours).toBe(unplaced)
    expect(result.estimate.hours).toBe(rows.reduce((sum, row) => sum + (row.effortHours ?? 0), 0))
  })

  it('names each piece of work once when a caller names it twice', () => {
    const result = outlook({
      work: [
        { id: 'task-a', effortHours: 10 },
        { id: 'task-a', effortHours: 10 },
      ],
    })
    expect(result.work).toHaveLength(1)
    expect(result.estimate.hours).toBe(10)
    expect(result.between?.planned.hours).toBe(7)
  })
})

describe('time planned in a period the window clips is not counted, and not counted silently', () => {
  it('leaves the hours out and says how many allocations it left out', () => {
    // NOW is Tuesday 2026-09-01, so the window starts mid-week and 2026-W36 is clipped. Eight hours
    // are planned there. Prorating them would invent a number — nothing records which part of a week
    // its hours sit in — but reporting "0 planned, 10 unplaced" as though the week were empty would
    // be worse: it is the same claim, with the uncertainty removed.
    const result = outlook({
      horizon: 'week',
      due: readDue({ due: '2026-09-18' }),
      work: [{ id: 'task-a', effortHours: 10 }],
      allocations: [alloc({ horizon: 'week', period: '2026-W36', recordId: 'task-a', plannedHours: 8 })],
    })
    expect(result.between?.planned.periods).not.toContain('2026-W36')
    expect(result.between?.planned.hours).toBe(0)
    expect(result.between?.planned.inClippedPeriods).toBe(1)
    expect(result.gaps).toContain('plan-in-a-clipped-period')
    // And the unplaced total is therefore a CEILING, which is what the gap sentence says.
    expect(result.work[0]?.unplacedHours).toBe(10)
    expect(DEADLINE_GAP_SENTENCES['plan-in-a-clipped-period']).toContain('ceiling')
  })

  it('counts nothing as clipped when every period lies wholly inside the window', () => {
    const result = outlook({
      horizon: 'week',
      due: readDue({ due: '2026-09-18' }),
      work: [{ id: 'task-a', effortHours: 10 }],
      allocations: [alloc({ horizon: 'week', period: '2026-W37', recordId: 'task-a', plannedHours: 8 })],
    })
    expect(result.between?.planned.hours).toBe(8)
    expect(result.between?.planned.inClippedPeriods).toBe(0)
    expect(result.gaps).not.toContain('plan-in-a-clipped-period')
  })
})

// ============================================================================ the vocabulary

describe('every gap this report can report has words for it', () => {
  it('publishes a sentence for each', () => {
    for (const gap of DEADLINE_GAPS) {
      expect(DEADLINE_GAP_SENTENCES[gap], `no sentence is published for "${gap}"`).toBeTruthy()
    }
  })

  it('says out loud that a condition is not turned into a date, and that absent is not zero', () => {
    expect(DEADLINE_GAP_SENTENCES['no-date']).toContain('will not turn')
    expect(DEADLINE_GAP_SENTENCES['nothing-estimated']).toContain('not zero')
    expect(DEADLINE_GAP_SENTENCES['no-capacity-stated']).toContain('not zero')
    expect(DEADLINE_GAP_SENTENCES['periods-overlap-the-window']).toContain('NOT counted')
  })

  it('reports every gap it names and no gap it does not', () => {
    // Nothing may reach `gaps` that has no sentence, which is what keeps a screen from printing a
    // key nobody wrote words for.
    const seen = new Set<string>()
    for (const result of [
      outlook(),
      outlook({ work: [] }),
      outlook({ work: [{ id: 'task-a', effortHours: null }] }),
      outlook({ work: [{ id: 'task-a', effortHours: 10 }, { id: 'task-b', effortHours: null }] }),
      outlook({ due: readDue({ due: { condition: 'the reprint lands' } }) }),
      outlook({ due: readDue({ due: '2026-08-20' }) }),
      outlook({ horizon: 'month', due: readDue({ due: '2026-09-18' }) }),
      outlook({ capacity: [] }),
      outlook({ capacity: dayCapacity(4, '2026-09-01') }),
      outlook({ allocations: [alloc({ horizon: 'day', period: '2026-09-01', recordId: 'task-a' })] }),
      outlook({ allocations: [alloc({ horizon: 'week', period: '2026-W36', recordId: 'task-a', plannedHours: 8 })] }),
      // The week TODAY falls in, counted at the week horizon: clipped by the window, so its hours
      // are not added in and the total says how many allocations it could not count.
      outlook({
        horizon: 'week',
        due: readDue({ due: '2026-09-18' }),
        allocations: [alloc({ horizon: 'week', period: '2026-W36', recordId: 'task-a', plannedHours: 8 })],
      }),
      deadlineOutlook({
        now: NOW,
        due: readDue({ due: '2026-09-18' }),
        dueMs: parseDueStamp,
        horizon: 'week',
        work: [{ id: 'task-a', effortHours: 10 }],
        allocations: [],
        capacity: [{ horizon: 'week', period: '2026-W37', hours: 30 }],
      }),
    ]) {
      for (const gap of result.gaps) seen.add(gap)
    }
    // Every declared gap is reachable, and nothing reaches `gaps` that is not declared.
    expect([...seen].sort()).toEqual([...DEADLINE_GAPS].sort())
  })
})
