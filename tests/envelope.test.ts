// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * COARSE FIRST, FINE LATER: A PARENT HOLDS AN ENVELOPE AND ITS PARTS EXPLAIN SOME OF IT.
 *
 * ---------------------------------------------------------------------------------------
 * TWO HALVES, TWO QUANTITIES, ONE IDEA
 * ---------------------------------------------------------------------------------------
 *
 * THE FIRST HALF is about ALLOCATED hours — how much time one week gives a piece of work. That is
 * `envelopesOf` and `loadOf` in src/shared/planning.ts, and it was built on 16 August 2026.
 *
 * THE SECOND HALF, from the divider below, is about the ESTIMATE — how big the whole job is, with
 * no period in the question. That is `effortOf` in src/shared/envelope.ts, built on 17 August 2026
 * because nothing understood containment for estimates and the Plan footer said 44h where the
 * Schedule said 12h over the same nesting.
 *
 * They are two files and two quantities and they are never added together. They are tested beside
 * each other because the arithmetic is the same arithmetic, and a reader who checks one against the
 * other is doing exactly the thing this pass exists to make possible.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * Until 16 August 2026 a piece of work and a part of it could not both hold hours in one period.
 * The write was refused, because `loadOf` added the two rows and the week then reported five hours
 * for three hours of work.
 *
 * The owner plans the other way round. First a large piece of work gets about 15 hours this week.
 * Later it is broken down: Controller gets 5, Perception gets 4, and the rest is not yet decided.
 * The refusal made that impossible to write down at all.
 *
 * So the refusal is gone and the arithmetic reads containment instead. The hours on the highest
 * allocated piece of work are the ENVELOPE. The hours below it are ASSIGNED. What is left is NOT YET
 * BROKEN DOWN. The tree contributes the envelope to the week and never the sum.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH TEST HERE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The first is the owner's own example, in their numbers. The second is the CONTROL, and it is what
 * stops the rest being satisfied by arithmetic that always answers the largest row: three unrelated
 * pieces of work still add up. The rest pin one behaviour each — no reading means no tree, parts
 * that exceed the envelope, three levels deep, an envelope nobody stated, a row that could not be
 * placed, and the capacity arithmetic reading the same number.
 *
 * The last two go through the real server, because the refusal being gone is a fact about the write
 * path and not about the arithmetic.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MAX_CONTAINMENT_DEPTH } from '../src/shared/containment.ts'
import { effortOf, whatWasNotRead } from '../src/shared/envelope.ts'
import { fitOf, loadOf, type Allocation, type HoursCountedTwice } from '../src/shared/planning.ts'
import { AGENT, freshDb, type TestDb } from './helpers.ts'

const WEEK = '2026-W36'
let t: TestDb
let workspaces: typeof import('../src/server/lib/workspaces.ts')
let caseNumber = 0
let WORKSPACE = 'envelope-case-0'
let SERVER_WEEK = '2026-W36'

beforeAll(async () => {
  t = await freshDb()
  workspaces = await import('../src/server/lib/workspaces.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

/** A project of this case's own, and a week of its own so the whole-office week reading sees only this case. */
function thisCasesProject(): void {
  caseNumber += 1
  WORKSPACE = `envelope-case-${String(caseNumber)}`
  SERVER_WEEK = `2026-W${String(35 + caseNumber)}`
  workspaces.createWorkspace({ id: WORKSPACE, title: `Mole Office case ${String(caseNumber)}` })
}

/** An allocation without a database, for the arithmetic. */
function alloc(recordId: string, plannedHours: number | null): Allocation {
  return {
    id: `a-${recordId}`,
    horizon: 'week',
    period: WEEK,
    recordId,
    plannedHours,
    actualHours: null,
    state: 'planned',
    note: null,
    createdAt: '2026-08-16 09:00',
    updatedAt: '2026-08-16 09:00',
  }
}

/** A containment reading of the week, written the way the server's reader writes it. */
function reading(pairs: [string, string][], notChecked: HoursCountedTwice['notChecked'] = []): HoursCountedTwice {
  return {
    horizon: 'week',
    period: WEEK,
    pairs: pairs.map(([outer, inner]) => ({ outer: { id: outer, title: outer }, inner: { id: inner, title: inner } })),
    notChecked,
  }
}

// ============================================================================ the owner's example

describe("the owner's worked example reads as they wrote it", () => {
  it('15h on Baseline with 5h and 4h inside it is 15 hours, 9 assigned and 6 not yet broken down', () => {
    const rows = [alloc('baseline', 15), alloc('controller', 5), alloc('perception', 4)]
    const load = loadOf('week', WEEK, rows, reading([['baseline', 'controller'], ['baseline', 'perception']]))

    // THE WHOLE POINT. The week costs 15 hours. It has never cost 24.
    expect(load.plannedHours).toBe(15)
    expect(load.rowHours).toBe(24)

    const tree = load.envelopes?.trees[0]
    expect(tree?.recordId).toBe('baseline')
    expect(tree?.hours).toBe(15)
    expect(tree?.assignedHours).toBe(9)
    expect(tree?.notYetBrokenDownHours).toBe(6)
    expect(tree?.overAssignedByHours).toBeNull()
    expect(tree?.inside.map((part) => part.recordId).sort()).toEqual(['controller', 'perception'])

    // And the same three numbers at the level of the period, for a surface that draws one line.
    expect(load.envelopes?.hours).toBe(15)
    expect(load.envelopes?.assignedHours).toBe(9)
    expect(load.envelopes?.notYetBrokenDownHours).toBe(6)
  })
})

// ============================================================================ the control

describe('unrelated work still adds up, which is what makes the envelope mean anything', () => {
  it('three pieces of work that contain nothing of each other are their sum', () => {
    // WITHOUT THIS TEST every other test here would pass with arithmetic that simply reported the
    // largest row in the week.
    const rows = [alloc('gripper', 3), alloc('papers', 2), alloc('dentist', 1)]
    const load = loadOf('week', WEEK, rows, reading([]))
    expect(load.plannedHours).toBe(6)
    expect(load.rowHours).toBe(6)
    expect(load.envelopes?.trees).toEqual([])
  })

  it('two parts of one piece of work, with nothing on the parent, are their sum', () => {
    const rows = [alloc('controller', 5), alloc('perception', 4)]
    // No allocation on the parent, so no pair: a tree with no envelope contributes the sum of its
    // parts, which is what happened before any of this existed.
    const load = loadOf('week', WEEK, rows, reading([]))
    expect(load.plannedHours).toBe(9)
  })
})

// ============================================================================ what the numbers mean

describe('a total says whether anybody read what contains what', () => {
  it('is the plain sum of the rows when nobody looked, and says so twice', () => {
    const rows = [alloc('baseline', 15), alloc('controller', 5)]
    const load = loadOf('week', WEEK, rows)
    expect(load.plannedHours).toBe(20)
    expect(load.rowHours).toBe(20)
    // NULL IS NOT "NO TREE". It is nobody having looked, and both fields say it.
    expect(load.envelopes).toBeNull()
    expect(load.countedTwice).toBeNull()
  })

  it('refuses a reading of another period rather than counting the wrong week', () => {
    const rows = [alloc('baseline', 15)]
    const other: HoursCountedTwice = { ...reading([]), period: '2026-W37' }
    expect(() => loadOf('week', WEEK, rows, other)).toThrow(/2026-W36.*2026-W37/s)
  })
})

describe('when the parts exceed the envelope, that is shown and not hidden', () => {
  it('costs the larger number, names how far over it is, and refuses nothing', () => {
    const rows = [alloc('baseline', 10), alloc('controller', 8), alloc('perception', 5)]
    const load = loadOf('week', WEEK, rows, reading([['baseline', 'controller'], ['baseline', 'perception']]))

    // 13 hours are assigned inside a 10 hour envelope. Reporting 10 would be the arithmetic lying to
    // protect a rule, and reporting 23 would be counting the parent's hours a second time.
    expect(load.plannedHours).toBe(13)
    const tree = load.envelopes?.trees[0]
    expect(tree?.hours).toBe(10)
    expect(tree?.assignedHours).toBe(13)
    expect(tree?.overAssignedByHours).toBe(3)
    expect(tree?.notYetBrokenDownHours).toBe(0)
  })
})

describe('the envelope arithmetic reads every level, not only the top one', () => {
  it('counts a part of a part once, inside the part that holds it', () => {
    // Baseline 15h, Controller 5h inside it, and Tuning 2h inside Controller. Controller's 5 hours
    // already cover Tuning's 2, so Baseline has 5 assigned and not 7.
    const rows = [alloc('baseline', 15), alloc('controller', 5), alloc('tuning', 2)]
    const load = loadOf(
      'week',
      WEEK,
      rows,
      reading([
        ['baseline', 'controller'],
        ['baseline', 'tuning'],
        ['controller', 'tuning'],
      ]),
    )
    expect(load.plannedHours).toBe(15)
    const top = load.envelopes?.trees[0]
    expect(top?.recordId).toBe('baseline')
    expect(top?.assignedHours).toBe(5)
    expect(top?.notYetBrokenDownHours).toBe(10)
    const middle = top?.inside[0]
    expect(middle?.recordId).toBe('controller')
    expect(middle?.assignedHours).toBe(2)
    expect(middle?.notYetBrokenDownHours).toBe(3)
  })
})

describe('an envelope nobody stated is not an envelope of zero', () => {
  it('contributes what the parts say and answers null for what is left', () => {
    const rows = [alloc('baseline', null), alloc('controller', 5), alloc('perception', 4)]
    const load = loadOf('week', WEEK, rows, reading([['baseline', 'controller'], ['baseline', 'perception']]))
    expect(load.plannedHours).toBe(9)
    const tree = load.envelopes?.trees[0]
    expect(tree?.hours).toBeNull()
    expect(tree?.assignedHours).toBe(9)
    // NOTHING CAN SAY WHAT IS LEFT OF A NUMBER NOBODY GAVE.
    expect(tree?.notYetBrokenDownHours).toBeNull()
    expect(load.stated).toBe(2)
    expect(load.allocations).toBe(3)
  })
})

describe('a row nobody could place is counted and named, never dropped', () => {
  it('keeps its hours in the total and says the total may be too high', () => {
    const rows = [alloc('baseline', 15), alloc('controller', 5), alloc('mystery', 2)]
    const load = loadOf(
      'week',
      WEEK,
      rows,
      reading(
        [['baseline', 'controller']],
        [{ recordId: 'mystery', title: 'mystery', why: 'It says it is part of two things.' }],
      ),
    )
    // 15 for the tree, and the 2 hours of the row nothing could place. Dropping them would lose
    // hours somebody committed; guessing them into the tree would invent a containment.
    expect(load.plannedHours).toBe(17)
    expect(load.envelopes?.couldNotPlace.map((row) => row.recordId)).toEqual(['mystery'])
    expect(load.envelopes?.couldNotPlace[0]?.why).toContain('part of two things')
  })
})

describe('everything downstream reads the same number', () => {
  it('capacity is measured against what the period costs, not against the sum of the rows', () => {
    const rows = [alloc('baseline', 15), alloc('controller', 5), alloc('perception', 4)]
    const load = loadOf('week', WEEK, rows, reading([['baseline', 'controller'], ['baseline', 'perception']]))
    const fit = fitOf(load, 20)
    // 20 hours in the week and 15 planned leaves 5 free. Reading the rows as 24 would have said the
    // week was over by four, and the person would have been told to cancel something.
    expect(fit.freeHours).toBe(5)
    expect(fit.overcommitted).toBe(false)
  })
})

// ============================================================================ through the product

describe('the write path lets a person plan coarse and then refine', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const { planningRoutes } = await import('../src/server/api/planning.ts')
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    app = Fastify()
    installErrorHandling(app)
    await app.register(planningRoutes, { prefix: '/api' })
    await app.ready()
  }, 60_000)

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    thisCasesProject()
  })

  const task = (title: string): string =>
    t.api.createRecord({ workspaceId: WORKSPACE, kind: 'task', title, data: { state: 'todo' }, actor: AGENT }).id

  const partOf = (part: string, whole: string): void => {
    t.api.createLink({ fromId: part, toId: whole, type: 'part_of', actor: AGENT })
  }

  async function give(recordId: string, hours: number): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/planning/allocations',
      payload: { horizon: 'week', period: SERVER_WEEK, recordId, plannedHours: hours },
    })
    return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> }
  }

  const said = (reply: { body: Record<string, unknown> }): string =>
    String(reply.body['message'] ?? reply.body['error'] ?? JSON.stringify(reply.body))

  it('accepts hours on a piece of work and then on its parts, and reports 15h with 9 assigned', async () => {
    const baseline = task('Baseline')
    const controller = task('Controller')
    const perception = task('Perception')
    partOf(controller, baseline)
    partOf(perception, baseline)

    const coarse = await give(baseline, 15)
    expect(coarse.status, said(coarse)).toBe(201)
    // THIS IS THE WRITE THAT USED TO BE REFUSED WITH A 409.
    const first = await give(controller, 5)
    expect(first.status, said(first)).toBe(201)
    const second = await give(perception, 4)
    expect(second.status, said(second)).toBe(201)

    const week = await app.inject({ method: 'GET', url: `/api/planning/week/${SERVER_WEEK}` })
    const body = JSON.parse(week.body) as {
      fit: { load: { plannedHours: number; rowHours: number; envelopes: { assignedHours: number; notYetBrokenDownHours: number } } }
      note: string
    }
    expect(body.fit.load.plannedHours).toBe(15)
    expect(body.fit.load.rowHours).toBe(24)
    expect(body.fit.load.envelopes.assignedHours).toBe(9)
    expect(body.fit.load.envelopes.notYetBrokenDownHours).toBe(6)
    // The sentence a person reads says why 15 sits above rows that add to 24.
    expect(body.note).toContain('not yet broken down')
    expect(body.note).toContain('add up to 24')
  })

  it('still refuses a second allocation for the same work in the same period', async () => {
    // THE RULE THAT DID NOT GO. Two rows for one record in one period cannot say whether they add
    // up or correct each other, which is a different question from planning at two levels.
    const gripper = task('Fix the gripper')
    expect((await give(gripper, 3)).status).toBe(201)
    const again = await give(gripper, 4)
    expect(again.status, said(again)).toBe(409)
    expect(said(again)).toContain('already has an allocation')
  })
})

// ###########################################################################################
// ###  THE SECOND HALF: THE ESTIMATE, NOT THE ALLOCATION.  src/shared/envelope.ts          ###
// ###########################################################################################

/**
 * The defect the owner met: the Plan page footer said 44h where the Schedule, over the same
 * nesting, said 12h. `PlanTable.tsx:1053` added every filed row's estimate with no containment
 * check at all. The owner's rule is "parent time is an envelope; child time is its breakdown, never an
 * addition", and `effortOf` is the only place in Mole Office that does that arithmetic for estimates.
 *
 * Every test below pins one behaviour. The one named CONTROL is what stops the rest passing with
 * arithmetic that simply reports the largest number it was given.
 */

// ============================================================================ the owner's example

describe('an estimate on a parent is an envelope its parts explain', () => {
  it('15h with 5h and 4h inside it shows 15, breaks 9 down, leaves 6, and totals 15', () => {
    const totals = effortOf([
      { id: 'baseline', ownHours: 15 },
      { id: 'controller', parentId: 'baseline', ownHours: 5 },
      { id: 'perception', parentId: 'baseline', ownHours: 4 },
    ])

    const parent = totals.byId.get('baseline')
    expect(parent?.shown).toBe(15)
    expect(parent?.breakdown).toBe(9)
    expect(parent?.notBrokenDown).toBe(6)
    expect(parent?.over).toBeNull()
    expect(parent?.atLeast).toBe(15)

    // THE WHOLE POINT. The plan is 15 hours of work. It has never been 24.
    expect(totals.total).toBe(15)
    // And the number that explains the difference, for the sentence a screen writes.
    expect(totals.ownHoursAdded).toBe(24)
    expect(totals.rootIds).toEqual(['baseline'])
  })

  it('CONTROL: three unrelated items still add up', () => {
    // WITHOUT THIS every test here would pass with arithmetic that answered the largest item.
    const totals = effortOf([
      { id: 'gripper', ownHours: 3 },
      { id: 'papers', ownHours: 2 },
      { id: 'dentist', ownHours: 1 },
    ])
    expect(totals.total).toBe(6)
    expect(totals.atLeastTotal).toBe(6)
    expect(totals.roots).toBe(3)
  })
})

// ============================================================================ no envelope stated

describe('a parent nobody sized takes its size from its parts', () => {
  it('shows 9 for a parent with no estimate of its own and 5h and 4h inside it', () => {
    const totals = effortOf([
      { id: 'baseline' },
      { id: 'controller', parentId: 'baseline', ownHours: 5 },
      { id: 'perception', parentId: 'baseline', ownHours: 4 },
    ])
    const parent = totals.byId.get('baseline')
    // NOBODY SAID, so `own` is absent — and it is not an envelope of nought hours.
    expect(parent?.own).toBeNull()
    expect(parent?.breakdown).toBe(9)
    expect(parent?.shown).toBe(9)
    // Nothing can say what is left of a number nobody gave.
    expect(parent?.notBrokenDown).toBeNull()
    expect(parent?.over).toBeNull()
    expect(totals.total).toBe(9)
    expect(totals.withoutOwn).toBe(1)
  })
})

// ============================================================================ parts exceed the parent

describe('parts that add up to more than the parent are shown, never corrected', () => {
  it('keeps the stated 15h, names the 3h over, and answers 18 to a capacity question', () => {
    const totals = effortOf([
      { id: 'baseline', ownHours: 15 },
      { id: 'controller', parentId: 'baseline', ownHours: 10 },
      { id: 'perception', parentId: 'baseline', ownHours: 8 },
    ])
    const parent = totals.byId.get('baseline')
    expect(parent?.shown).toBe(15)
    expect(parent?.breakdown).toBe(18)
    expect(parent?.over).toBe(3)
    expect(parent?.notBrokenDown).toBeNull()
    // TWO NUMBERS ON PURPOSE. An explicit 15h stays on the screen as it was entered, and
    // capacity arithmetic must not pretend 18 fits inside 15 to preserve the envelope.
    expect(parent?.atLeast).toBe(18)
    expect(totals.total).toBe(15)
    expect(totals.atLeastTotal).toBe(18)
  })

  it('carries an overflow three levels down up to the top, which `shown` cannot do', () => {
    // Baseline says 15. Controller says 5 and shows 5, so the breakdown at the top is 5 and the
    // screen prints 15. But 20 hours are stated inside Controller, so the honest floor is 20.
    const totals = effortOf([
      { id: 'baseline', ownHours: 15 },
      { id: 'controller', parentId: 'baseline', ownHours: 5 },
      { id: 'tuning', parentId: 'controller', ownHours: 12 },
      { id: 'rig', parentId: 'controller', ownHours: 8 },
    ])
    expect(totals.byId.get('controller')?.shown).toBe(5)
    expect(totals.byId.get('controller')?.over).toBe(15)
    expect(totals.byId.get('baseline')?.breakdown).toBe(5)
    expect(totals.byId.get('baseline')?.shown).toBe(15)
    expect(totals.total).toBe(15)
    expect(totals.atLeastTotal).toBe(20)
  })
})

// ============================================================================ absent is absent

describe('nobody having sized something is never nought hours', () => {
  it('answers absent for an item with no estimate and no parts, everywhere', () => {
    const totals = effortOf([{ id: 'direction' }])
    const only = totals.byId.get('direction')
    expect(only?.own).toBeNull()
    expect(only?.breakdown).toBeNull()
    expect(only?.shown).toBeNull()
    expect(only?.notBrokenDown).toBeNull()
    expect(only?.over).toBeNull()
    expect(only?.atLeast).toBeNull()
    // AND NOT AT THE LEVEL OF THE SET EITHER. A total of 0 would say somebody looked and found
    // nothing to do; null says nobody has sized any of it.
    expect(totals.total).toBeNull()
    expect(totals.atLeastTotal).toBeNull()
    expect(totals.ownHoursAdded).toBeNull()
    expect(totals.totalFrom).toBe(0)
    expect(totals.roots).toBe(1)
    expect(totals.withoutOwn).toBe(1)
  })

  it('leaves an unsized item out of the total instead of adding it as nought', () => {
    const totals = effortOf([
      { id: 'sized', ownHours: 4 },
      { id: 'unsized' },
    ])
    expect(totals.total).toBe(4)
    expect(totals.totalFrom).toBe(1)
    expect(totals.roots).toBe(2)
    expect(totals.withoutOwn).toBe(1)
  })

  it('keeps a stated nought apart from nobody having said', () => {
    // Zero is a real answer somebody can write, and it has to stay different from silence.
    const totals = effortOf([{ id: 'nothing-to-do', ownHours: 0 }])
    expect(totals.byId.get('nothing-to-do')?.own).toBe(0)
    expect(totals.byId.get('nothing-to-do')?.shown).toBe(0)
    expect(totals.total).toBe(0)
    expect(totals.totalFrom).toBe(1)
    expect(totals.withoutOwn).toBe(0)
  })
})

// ============================================================================ a circle

describe('a circle in what holds what is broken and said, never walked', () => {
  it('answers rather than looping when two items hold each other, and names the link it refused', () => {
    const totals = effortOf([
      { id: 'a', parentId: 'b', ownHours: 3 },
      { id: 'b', parentId: 'a', ownHours: 4 },
    ])
    expect(totals.cyclesBroken.length).toBe(1)
    expect(totals.cyclesBroken[0]?.why).toContain('came back round to')
    // The hours are still there. Dropping them would lose something somebody wrote down.
    expect(totals.total).toBe(4)
    expect(totals.byId.get('b')?.breakdown).toBe(3)
  })

  it('refuses an item that says it is part of itself', () => {
    const totals = effortOf([{ id: 'a', parentId: 'a', ownHours: 3 }])
    expect(totals.cyclesBroken[0]?.why).toContain('part of itself')
    expect(totals.total).toBe(3)
    expect(totals.rootIds).toEqual(['a'])
  })

  it('stops at twenty levels, the same cap the containment reader uses, and says so', () => {
    // Twenty-two items in one chain. The reader walks twenty and refuses the rest, exactly as
    // MAX_CONTAINMENT_DEPTH does in shared/containment.ts.
    const chain = Array.from({ length: MAX_CONTAINMENT_DEPTH + 2 }, (_unused, at) => ({
      id: `n${String(at)}`,
      parentId: at === 0 ? null : `n${String(at - 1)}`,
      ownHours: 1,
    }))
    const totals = effortOf(chain)
    expect(totals.tooDeep.length).toBe(1)
    expect(totals.tooDeep[0]?.id).toBe(`n${String(MAX_CONTAINMENT_DEPTH + 1)}`)
    expect(totals.tooDeep[0]?.why).toContain('20 levels deep')
    expect(totals.rootIds).toEqual(['n0', `n${String(MAX_CONTAINMENT_DEPTH + 1)}`])
  })
})

// ============================================================================ a parent nobody handed in

describe('a parent that is not in the set leaves its child standing on its own', () => {
  it('counts the child as a root and says how many were left that way', () => {
    const totals = effortOf([
      { id: 'controller', parentId: 'somewhere-else', ownHours: 5 },
      { id: 'perception', ownHours: 4 },
    ])
    expect(totals.parentNotHere.length).toBe(1)
    expect(totals.parentNotHere[0]?.id).toBe('controller')
    expect(totals.parentNotHere[0]?.why).toContain('not in this set')
    expect(totals.rootIds).toEqual(['controller', 'perception'])
    expect(totals.total).toBe(9)
    // AND IT SAYS WHAT THE RISK IS, precisely. The child on its own is counted right; the danger is
    // that the parent nobody handed in is itself inside something that IS here.
    expect(whatWasNotRead(totals)).toContain('counts the same work twice')
  })

  it('says nothing was missed when nothing was', () => {
    expect(whatWasNotRead(effortOf([{ id: 'a', ownHours: 1 }]))).toBeNull()
  })
})

// ============================================================================ floating point

describe('hours are rounded to two places, because floating point is not', () => {
  it('adds 0.1 and 0.2 to 0.3 and never to 0.30000000000000004', () => {
    // MEASURED BEFORE: two allocations of 0.1 and 0.2 printed 0.30000000000000004 on a screen, and
    // PlanTable.tsx:1053 rounds nothing at all today.
    const totals = effortOf([
      { id: 'parent' },
      { id: 'a', parentId: 'parent', ownHours: 0.1 },
      { id: 'b', parentId: 'parent', ownHours: 0.2 },
    ])
    expect(totals.byId.get('parent')?.breakdown).toBe(0.3)
    expect(totals.byId.get('parent')?.shown).toBe(0.3)
    expect(totals.total).toBe(0.3)
    expect(totals.atLeastTotal).toBe(0.3)
    expect(totals.ownHoursAdded).toBe(0.3)
  })

  it('rounds what is left over as well as what is added', () => {
    const totals = effortOf([
      { id: 'parent', ownHours: 0.3 },
      { id: 'a', parentId: 'parent', ownHours: 0.1 },
    ])
    expect(totals.byId.get('parent')?.notBrokenDown).toBe(0.2)
  })
})

// ============================================================================ input a caller got wrong

describe('input this arithmetic cannot read is named rather than guessed at', () => {
  it('counts the first item with an id and says the repeat was not counted', () => {
    const totals = effortOf([
      { id: 'a', ownHours: 5 },
      { id: 'a', ownHours: 9 },
    ])
    expect(totals.total).toBe(5)
    expect(totals.idUsedTwice.length).toBe(1)
    expect(totals.idUsedTwice[0]?.why).toContain('more than once')
  })

  it('reads an estimate that is not a number as nobody having sized it, and says so', () => {
    // `effort_hours` comes out of stored JSON as `unknown`, so NaN is a thing that can arrive.
    const totals = effortOf([{ id: 'a', ownHours: Number.NaN }])
    expect(totals.byId.get('a')?.own).toBeNull()
    expect(totals.total).toBeNull()
    expect(totals.notANumber[0]?.why).toContain('not a number of hours')
  })
})

// ============================================================================ through the product

/**
 * THE TWO SERVER TOTALS THAT HAND AN AGENT A NUMBER.
 *
 * Both added every record on its own until 17 August 2026, so a piece of work and a part of that
 * same work were both counted and the agent was told the doubled number as a fact. These go through
 * the real routes, because what is being proved is what a caller gets back.
 */
describe('the totals an agent is handed count a piece of work once', () => {
  let served: FastifyInstance

  /** A stated human, for the library calls; the same person as the headers below. */
  const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
  const HUMAN_HEADERS = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

  beforeAll(async () => {
    // ONE ROUTE GROUP, rather than the whole server, for the same reason the first server section
    // above builds its own: the reply being checked is this one.
    const { planningRoutes } = await import('../src/server/api/planning.ts')
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    served = Fastify()
    installErrorHandling(served)
    await served.register(planningRoutes, { prefix: '/api' })
    await served.ready()
  }, 60_000)

  afterAll(async () => {
    await served.close()
  })

  beforeEach(() => {
    thisCasesProject()
  })

  /**
   * Baseline is 15 hours. Controller is 5 of them and Perception is 4, both stored as part of it.
   *
   * TASKS RATHER THAN A MODULE HOLDING TASKS, because `effort_hours` is declared on `task`, `block`
   * and `obligation` only — see `effortField` in shared/kinds/kind-common.ts — so a module cannot carry an
   * estimate at all and a module and its tasks were never the case that doubled.
   */
  function seedNesting(): { baseline: string; controller: string; perception: string } {
    const task = (title: string, hours: number): string =>
      t.api.createRecord({
        workspaceId: WORKSPACE,
        kind: 'task',
        title,
        data: { state: 'todo', effort_hours: hours },
        actor: AGENT,
      }).id
    const baseline = task('Baseline', 15)
    const controller = task('Controller', 5)
    const perception = task('Perception', 4)
    for (const part of [controller, perception]) {
      t.api.createLink({ fromId: part, toId: baseline, type: 'part_of', actor: AGENT })
    }
    return { baseline, controller, perception }
  }

  it('the plan context says 15h where the three rows add up to 24h', async () => {
    const { baseline, controller, perception } = seedNesting()
    const { createPlan, bindLineToWork } = await import('../src/server/lib/plans.ts')
    const { readPlanContext } = await import('../src/server/lib/planreview.ts')

    const plan = createPlan(
      { title: 'Robotics week', body: ['- Baseline', '  - Controller', '  - Perception'].join('\n') },
      HUMAN,
    )
    const bind = (says: string, recordId: string): void => {
      const line = plan.lines.find((one) => one.text.includes(says))
      expect(line, `no line says ${says}`).toBeDefined()
      bindLineToWork(plan.plan.id, line?.id ?? '', { recordId }, HUMAN)
    }
    bind('Baseline', baseline)
    bind('Controller', controller)
    bind('Perception', perception)

    const { calculated } = readPlanContext(plan.plan.id, { origin: null })

    // THE DEFECT: this was 24 before, because a plain reduce added the parent and both its parts.
    expect(calculated.estimatedHours).toBe(15)
    expect(calculated.everyEstimateAdded).toBe(24)
    expect(calculated.estimatedAtLeastHours).toBe(15)
    expect(calculated.estimatedFrom).toBe(3)
    expect(calculated.countedAtTop).toBe(1)
    expect(calculated.nestingNotRead).toBeNull()
  })

  it('the plan context counts a part on its own when the plan does not point at what holds it', async () => {
    // THE CONTROL FOR THE ONE ABOVE. Without it, arithmetic that always answered the largest row
    // would pass. Here the plan names only the two parts, so nothing contains them here and the
    // honest answer is 9.
    const { controller, perception } = seedNesting()
    const { createPlan, bindLineToWork } = await import('../src/server/lib/plans.ts')
    const { readPlanContext } = await import('../src/server/lib/planreview.ts')

    const plan = createPlan({ title: 'Just the parts', body: ['- Controller', '- Perception'].join('\n') }, HUMAN)
    bindLineToWork(plan.plan.id, plan.lines[0]?.id ?? '', { recordId: controller }, HUMAN)
    bindLineToWork(plan.plan.id, plan.lines[1]?.id ?? '', { recordId: perception }, HUMAN)

    const { calculated } = readPlanContext(plan.plan.id, { origin: null })
    expect(calculated.estimatedHours).toBe(9)
    expect(calculated.everyEstimateAdded).toBe(9)
    expect(calculated.countedAtTop).toBe(2)
  })

  // THE DRAFT CONTEXT IS GONE AND ITS ARITHMETIC MOVED. `GET /api/planning/drafts/:id/context` handed an agent the
  // structure of a whole project with these totals over it; migration 0196 made every draft a plan, and the plan
  // context hands over the same structure for each project it reads, with the same totals, as
  // `calculated.projects`. These two cases are the draft context's two, asked of a plan that names no work, with
  // the project named by `?projects=` as a moved draft's review asks for it.
  it('the plan context says 15h over a project where the three records add up to 24h', async () => {
    seedNesting()
    const { createPlan } = await import('../src/server/lib/plans.ts')
    const { readPlanContext } = await import('../src/server/lib/planreview.ts')
    const plan = createPlan({ title: 'Next month', body: 'rough thinking' }, HUMAN)

    const { calculated, facts } = readPlanContext(plan.plan.id, { projects: [WORKSPACE], origin: null })

    // THE WORST OF THE THREE: seven kinds in one flat list, so a whole and its parts were both in it.
    expect(calculated.projects.estimated).toBe(15)
    expect(calculated.projects.everyEstimateAdded).toBe(24)
    expect(calculated.projects.estimatedFrom).toBe(3)
    expect(calculated.projects.countedAtTop).toBe(1)
    expect(calculated.projects.withoutEstimate).toBe(0)
    expect(calculated.projects.nestingNotRead).toBeNull()
    expect(facts.structure.task.length).toBe(3)
  })

  it('says nobody has sized any of the project rather than answering nought hours', async () => {
    t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'task',
      title: 'Something nobody sized',
      data: { state: 'todo' },
      actor: AGENT,
    })
    const { createPlan } = await import('../src/server/lib/plans.ts')
    const { readPlanContext } = await import('../src/server/lib/planreview.ts')
    const plan = createPlan({ title: 'Next month', body: 'rough thinking' }, HUMAN)
    const { calculated } = readPlanContext(plan.plan.id, { projects: [WORKSPACE], origin: null })
    expect(calculated.projects.estimated).toBeNull()
    expect(calculated.projects.everyEstimateAdded).toBeNull()
    expect(calculated.projects.withoutEstimate).toBe(1)
  })
})
