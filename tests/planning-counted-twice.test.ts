// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERIOD'S TOTAL READS WHAT IS PLANNED INSIDE WHAT, AND COUNTS EACH PIECE OF WORK ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A piece of work and parts of it may both hold hours in one period: the owner plans coarse first
 * and refines later. `loadOf` therefore has to be told what contains what before it can say what a
 * period costs, and `Load.countedTwice` is that reading, handed in by the caller.
 *
 * Three answers, and the tests below are one per answer:
 *
 *     null              nobody looked. NOT "none". The total is then the plain sum of the rows.
 *     pairs: []         somebody read the period and no row sits inside another.
 *     pairs: [...]      these two rows are one piece of work and a part of it.
 *
 * ---------------------------------------------------------------------------------------
 * THE NUMBER MOVES, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * The test that matters most here is `a piece of work with parts inside it costs the period once`.
 * Until 16 August 2026 this file asserted the opposite — that the total was the same number with or
 * without a reading — because the pair could then only be a defect and subtracting hours nobody
 * removed would have handed a person a total nobody wrote.
 *
 * Round five made the pair ordinary, so the arithmetic reads it: 6 hours on a piece of work with 2
 * hours on a part of it is 6 hours of work in this period, not 8. WHAT IS NOT ALLOWED TO HAPPEN IS
 * A ROW GOING MISSING: `rowHours` beside the total is still the plain sum of everything somebody
 * wrote, and every other field of the total is untouched by the reading.
 *
 * ---------------------------------------------------------------------------------------
 * MEASURED ON THE LIVE CORPUS, 2026-08-14
 * ---------------------------------------------------------------------------------------
 *
 * Read through the running server: 203 pieces of work, 3 of them with any hours at all, all three
 * in week `2026-W33`, **no piece of work with a part of it planned beside it, and no row whose
 * containment could not be read**. So this is a footnote today rather than a headline, and the
 * reason to build it is that `null` and `pairs: []` are different claims and only one of them is
 * true of a period nobody has read.
 */

import { describe, expect, it } from 'vitest'
import { loadOf, type Allocation, type HoursCountedTwice } from '../src/shared/planning.ts'
// TYPE ONLY, so nothing here opens a database. The runtime reader lives on the server and has its
// own tests in tests/hours-at-two-levels.test.ts; what this file pins is the shape it hands over.
import type { CountedTwice } from '../src/server/lib/planning.ts'

const WEEK = '2026-W36'

/** An allocation without a database, for the arithmetic. */
function alloc(part: Partial<Allocation> & Pick<Allocation, 'horizon' | 'period' | 'recordId'>): Allocation {
  return {
    id: `a-${part.period}-${part.recordId}`,
    plannedHours: null,
    actualHours: null,
    state: 'planned',
    note: null,
    createdAt: '2026-08-14 09:00',
    updatedAt: '2026-08-14 09:00',
    ...part,
  }
}

/** A week holding six hours on a pipeline and two on one of its steps. */
const rows = [
  alloc({ horizon: 'week', period: WEEK, recordId: 'outer-1', plannedHours: 6 }),
  alloc({ horizon: 'week', period: WEEK, recordId: 'inner-1', plannedHours: 2 }),
]

/** What the server's reader would return for that week, once those two rows are related. */
const foundOnePair: HoursCountedTwice = {
  horizon: 'week',
  period: WEEK,
  pairs: [
    {
      outer: { id: 'outer-1', title: 'Wave 6 — weekly and monthly planning' },
      inner: { id: 'inner-1', title: 'Wave 6 — weekly and monthly planning › the review page' },
    },
  ],
  notChecked: [],
}

describe('a total says what it read about which of its rows sit inside which', () => {
  it('says nobody looked when it was given no reading, which is not the same as none', () => {
    const load = loadOf('week', WEEK, rows)
    // NULL IS NOT AN EMPTY LIST. No caller read this period's containment, so nothing knows whether
    // these eight hours hold a piece of work and a part of it, and the total adds every row.
    expect(load.countedTwice).toBeNull()
  })

  it('says it looked and found nothing, which is a different claim', () => {
    const load = loadOf('week', WEEK, rows, { horizon: 'week', period: WEEK, pairs: [], notChecked: [] })
    expect(load.countedTwice).not.toBeNull()
    expect(load.countedTwice?.pairs).toEqual([])
    expect(load.countedTwice?.notChecked).toEqual([])
  })

  it('names both ends of every pair, because "some of this sits inside something else" is not actionable', () => {
    const load = loadOf('week', WEEK, rows, foundOnePair)
    expect(load.countedTwice?.pairs).toHaveLength(1)
    expect(load.countedTwice?.pairs[0]?.outer.id).toBe('outer-1')
    expect(load.countedTwice?.pairs[0]?.inner.id).toBe('inner-1')
    // The title comes over as well: an id alone is not a thing a person recognises.
    expect(load.countedTwice?.pairs[0]?.inner.title).toContain('the review page')
  })

  it('a piece of work with parts inside it costs the period once', () => {
    const clean = loadOf('week', WEEK, rows)
    const flagged = loadOf('week', WEEK, rows, foundOnePair)
    // NOBODY LOOKED, SO THE ROWS ARE ALL THERE IS: eight hours, and `countedTwice: null` beside them
    // saying that nothing has read whether one of these rows is inside the other.
    expect(clean.plannedHours).toBe(8)
    expect(clean.rowHours).toBe(8)
    expect(clean.envelopes).toBeNull()

    // WITH THE READING, SIX. Six hours are planned on the piece of work and two of them are now
    // explained by a part of it, so this week is six hours of work and never eight.
    expect(flagged.plannedHours).toBe(6)
    expect(flagged.envelopes?.hours).toBe(6)
    expect(flagged.envelopes?.assignedHours).toBe(2)
    expect(flagged.envelopes?.notYetBrokenDownHours).toBe(4)

    // AND NOT ONE ROW HAS GONE MISSING. The plain sum of what somebody wrote is still reported
    // beside the total, so a person reading 6 above two rows that add to 8 can see both numbers.
    expect(flagged.rowHours).toBe(8)
    expect(flagged.allocations).toBe(clean.allocations)
    expect(flagged.stated).toBe(clean.stated)
    // NOTHING ELSE MOVED. Putting back the three fields the reading is allowed to change gives the
    // total that was computed without it, field for field — which is what stops a containment
    // reading quietly altering the hours recorded as spent, the count of finished rows, or anything
    // else a period reports.
    expect({
      ...flagged,
      plannedHours: clean.plannedHours,
      envelopes: null,
      countedTwice: null,
    }).toEqual(clean)
  })

  it('carries the rows whose containment could not be read, because the pairs are then incomplete', () => {
    const partial: HoursCountedTwice = {
      horizon: 'week',
      period: WEEK,
      pairs: [],
      notChecked: [{ recordId: 'inner-1', title: 'the review page', why: 'The chain is deeper than 6 steps.' }],
    }
    const load = loadOf('week', WEEK, rows, partial)
    // An empty `pairs` beside a non-empty `notChecked` does NOT mean the period is clean. The
    // reader's own sentence comes over whole rather than being summarised into a count.
    expect(load.countedTwice?.pairs).toEqual([])
    expect(load.countedTwice?.notChecked[0]?.why).toBe('The chain is deeper than 6 steps.')
  })

  it('refuses a reading of another period rather than printing a note about the wrong week', () => {
    const otherWeek: HoursCountedTwice = { ...foundOnePair, period: '2026-W37' }
    expect(() => loadOf('week', WEEK, rows, otherWeek)).toThrow(/2026-W36.*2026-W37/s)
    const otherGrain: HoursCountedTwice = { ...foundOnePair, horizon: 'day' }
    expect(() => loadOf('week', WEEK, rows, otherGrain)).toThrow(/week/)
  })
})

describe('one shape, not two', () => {
  it('what the server reader returns is what a total accepts', () => {
    // A COMPILE-TIME TEST. `hoursCountedTwiceIn` in src/server/lib/planning.ts is the one reader of
    // containment for a period; `Load` in src/shared/planning.ts is what a screen reads. If either
    // renames a field, this assignment stops compiling and `npm run build` fails — which is what
    // stops one fact from being described in two places that can disagree.
    const accepts: (reading: CountedTwice) => HoursCountedTwice = (reading) => reading
    expect(typeof accepts).toBe('function')
  })
})
