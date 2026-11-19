// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * 6D — WHERE A WEEK'S HOURS GO, AND WHETHER THE PARTS ADD UP.
 *
 * The requirement is one sentence: *make the real single-person constraint visible*. There is one
 * person and one week; the projects do not know about each other, so three green weeks can add up
 * to an impossible one. `sharesOf` groups the same allocations `loadOf` counts by the project that
 * owns each row's work.
 *
 * The assertion this file exists for is the LAST ONE: the shares sum to the load. Two numbers on one
 * screen that are meant to be the same number, with nothing making them the same, is the defect this
 * repository keeps producing, and a share table is a good place for it to hide because every row
 * looks right on its own.
 */

import { describe, expect, it } from 'vitest'
import { loadOf, sharesOf, type Allocation, type OwnedAllocation } from '../src/shared/planning.ts'

function alloc(part: Partial<Allocation> & Pick<Allocation, 'recordId'>): Allocation {
  return {
    id: `a-${part.recordId}-${part.period ?? '2026-W36'}`,
    horizon: 'week',
    period: '2026-W36',
    plannedHours: null,
    actualHours: null,
    state: 'planned',
    note: null,
    createdAt: '2026-09-01 08:00',
    updatedAt: '2026-09-01 08:00',
    ...part,
  }
}

const own = (owner: string | null, part: Partial<Allocation> & Pick<Allocation, 'recordId'>): OwnedAllocation => ({
  allocation: alloc(part),
  owner,
})

/** A real week: two projects, a personal commitment, and one row nobody said a number for. */
function week(): OwnedAllocation[] {
  return [
    own('robotics', { recordId: 'r-1', plannedHours: 6 }),
    own('robotics', { recordId: 'r-2', plannedHours: 4 }),
    own('panelx', { recordId: 'p-1', plannedHours: 8 }),
    own('personal', { recordId: 'x-1', plannedHours: 1.5 }),
    own('personal', { recordId: 'x-2' }),
  ]
}

describe('a week is grouped by the project that owns the work', () => {
  it('adds each project up once and says how many rows gave no number', () => {
    const shares = sharesOf('week', '2026-W36', week())
    expect(shares.map((s) => s.owner)).toEqual(['robotics', 'panelx', 'personal'])

    const robotics = shares[0]
    expect(robotics?.plannedHours).toBe(10)
    expect(robotics?.allocations).toBe(2)
    expect(robotics?.unstated).toBe(0)

    const personal = shares[2]
    expect(personal?.plannedHours).toBe(1.5)
    expect(personal?.allocations).toBe(2)
    // The family call nobody put a number on is still a claim on the week, and the group says so
    // rather than either dropping it or counting it as zero hours.
    expect(personal?.stated).toBe(1)
    expect(personal?.unstated).toBe(1)
    expect(personal?.recordIds).toEqual(['x-1', 'x-2'])
  })

  it('groups work that is GONE under no owner rather than dropping it', () => {
    // An allocation pointing at a deleted record is a fact about the plan. A week that quietly lost
    // two hours would be worse than one that says two hours belong to something no longer there.
    const shares = sharesOf('week', '2026-W36', [...week(), own(null, { recordId: 'gone', plannedHours: 2 })])
    const orphan = shares.find((s) => s.owner === null)
    expect(orphan?.plannedHours).toBe(2)
    expect(orphan?.allocations).toBe(1)
  })

  it('counts only this period, because next week is not this week', () => {
    const rows = [...week(), own('robotics', { recordId: 'r-3', period: '2026-W37', plannedHours: 40 })]
    expect(sharesOf('week', '2026-W36', rows).find((s) => s.owner === 'robotics')?.plannedHours).toBe(10)
  })

  it('counts only this HORIZON, so a row whose two columns disagree is not read as a week', () => {
    // A period key says which horizon it belongs to on its own — 2026-W36 is a week and 2026-09-01
    // is a day, and the two can never collide — so filtering by period alone is almost always
    // enough. Almost: a row can be written by hand with `horizon` and `period` disagreeing, and
    // `checkPeriod` refuses that on the write path precisely because it means nothing.
    //
    // This asserts what `loadOf` already does with the same rows: believe the horizon column. The
    // two functions must agree or the share table and the week total drift apart on exactly the
    // rows nobody can explain.
    const bent = [own('robotics', { recordId: 'r-9', horizon: 'day', period: '2026-W36', plannedHours: 99 })]
    expect(sharesOf('week', '2026-W36', bent)).toEqual([])
    expect(loadOf('week', '2026-W36', bent.map((r) => r.allocation)).plannedHours).toBe(0)
  })

  it('draws the same way every time, and never hides a group with no hours', () => {
    const shares = sharesOf('week', '2026-W36', [
      own('b-project', { recordId: 'b-1' }),
      own('a-project', { recordId: 'a-1' }),
      own(null, { recordId: 'gone' }),
    ])
    // All three have 0 stated hours, so the tie is broken by name — with the gap last, because it
    // is a gap in the plan and not a project.
    expect(shares.map((s) => s.owner)).toEqual(['a-project', 'b-project', null])
    expect(shares).toHaveLength(3)
  })
})

describe('the parts add up to the whole', () => {
  it('sums to exactly what loadOf reports for the same rows', () => {
    const rows = [...week(), own(null, { recordId: 'gone', plannedHours: 2 }), own('panelx', { recordId: 'p-2', plannedHours: 0.1 }), own('panelx', { recordId: 'p-3', plannedHours: 0.2 })]
    const shares = sharesOf('week', '2026-W36', rows)
    const load = loadOf('week', '2026-W36', rows.map((r) => r.allocation))

    const hours = shares.reduce((total, s) => total + s.plannedHours, 0)
    expect(Math.round(hours * 100) / 100, 'the share table and the week total disagree').toBe(load.plannedHours)
    expect(shares.reduce((n, s) => n + s.allocations, 0)).toBe(load.allocations)
    expect(shares.reduce((n, s) => n + s.stated, 0)).toBe(load.stated)
    // And 0.1 + 0.2 is 0.3 on both sides, not 0.30000000000000004 on one of them.
    expect(shares.find((s) => s.owner === 'panelx')?.plannedHours).toBe(8.3)
  })

  it('sums to zero rows for a period with nothing in it, rather than inventing a group', () => {
    const shares = sharesOf('week', '2026-W40', week())
    expect(shares).toEqual([])
  })
})
