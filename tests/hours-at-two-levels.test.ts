// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * IN ONE PERIOD, A PIECE OF WORK MAY HOLD HOURS AND SO MAY ITS PARTS. THE PERIOD COUNTS IT ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE GUARDS, AND WHAT IT USED TO GUARD
 * ---------------------------------------------------------------------------------------
 *
 * This file was `tests/hours-counted-twice.test.ts` and it guarded a refusal: hours went to a piece
 * of work or to its parts, never to both, and `createAllocation` refused the second write. The
 * reason was arithmetic — `loadOf` added the two rows, so three hours on a task and two on a task
 * inside it made the week report five hours for three hours of work.
 *
 * The owner plans coarse first and refines later: 15 hours on a large piece of work this week, then
 * 5 on one part and 4 on another, with the rest not yet broken down. The refusal made that
 * impossible, so round five removed it and made the arithmetic tree-aware instead. The hours on the
 * highest allocated piece of work are the whole of it, the hours below explain part of it, and the
 * period counts the piece of work once: **15, and never 24.**
 *
 * So what these tests pin is the number rather than the refusal:
 *
 *   - the write goes through, both rows are stored, and NOTHING is quietly dropped;
 *   - the period's total counts each piece of work once, however deep the parts are;
 *   - the rows themselves are still available, added up, as `rowHours` — the two answer different
 *     questions and a person reading 3 above rows that add to 5 has to be able to see both;
 *   - parts that come to MORE than the work holding them are a real conflict: shown, never refused,
 *     and the period then costs the larger number;
 *   - a row whose containment Mole Office could not read is counted on its own AND named, because a
 *     total quietly missing somebody's hours is worse than one that says what it could not place.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROLS COME FIRST, AND THEY MATTER MORE THAN THEY DID
 * ---------------------------------------------------------------------------------------
 *
 * Two unrelated pieces of work in one week are five hours, and two parts of one thing whose parent
 * has no hours are five hours as well. Arithmetic that counted every week once — by keeping the
 * largest row, say — would pass every "it counted the tree once" test below and make the product
 * lose hours somebody committed. These two are what stop that.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let planning: typeof import('../src/server/lib/planning.ts')
// Each case plans in a week of its own, so a total over a week sees only that case's rows.
let WEEK = '2026-W36'
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { planningRoutes } = await import('../src/server/api/planning.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  planning = await import('../src/server/lib/planning.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(planningRoutes, { prefix: '/api' })
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  // The even weeks from 22 to 44 are free for the twelve cases, and the week after each is odd.
  WEEK = `2026-W${String(20 + caseNumber * 2)}`
})

/** The Monday of an ISO week, so a day case sits inside the week its case plans. */
function theMondayOf(week: string): string {
  const [, year, number] = /^(\d{4})-W(\d{2})$/.exec(week) ?? []
  const jan4 = new Date(Date.UTC(Number(year), 0, 4))
  const weekday = jan4.getUTCDay() || 7
  return new Date(Date.UTC(Number(year), 0, 4 - (weekday - 1) + (Number(number) - 1) * 7))
    .toISOString()
    .slice(0, 10)
}

/** The ISO week after this one. */
function theWeekAfter(week: string): string {
  const [, year, number] = /^(\d{4})-W(\d{2})$/.exec(week) ?? []
  return `${year}-W${String(Number(number) + 1).padStart(2, '0')}`
}

/** A task worth planning. */
function task(title: string, workspaceId = 'default'): string {
  return t.api.createRecord({ workspaceId, kind: 'task', title, data: { state: 'todo' }, actor: AGENT }).id
}

/** `part` becomes part of `whole`, which is the one containment link. */
function partOf(part: string, whole: string): void {
  t.api.createLink({ fromId: part, toId: whole, type: 'part_of', actor: AGENT })
}

interface Reply {
  status: number
  body: Record<string, unknown>
}

async function give(recordId: string, hours: number, period = WEEK, horizon = 'week'): Promise<Reply> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/planning/allocations',
    payload: { horizon, period, recordId, plannedHours: hours },
  })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> }
}

/** The sentence a refusal put in front of the caller. */
const said = (reply: Reply): string => String(reply.body['message'] ?? reply.body['error'] ?? JSON.stringify(reply.body))

/** One piece of work in a period, with whatever is planned inside it. */
interface Tree {
  recordId: string
  title: string
  hours: number | null
  inside: Tree[]
  assignedHours: number
  notYetBrokenDownHours: number | null
  overAssignedByHours: number | null
  contributesHours: number
}

interface WeekLoad {
  plannedHours: number
  rowHours: number
  allocations: number
  envelopes: {
    trees: Tree[]
    hours: number
    assignedHours: number
    notYetBrokenDownHours: number
    couldNotPlace: { recordId: string; title: string; why: string }[]
  }
  countedTwice: {
    pairs: { outer: { id: string; title: string }; inner: { id: string; title: string } }[]
    notChecked: { recordId: string; title: string; why: string }[]
  }
}

/** What the week comes to, read back through the route every surface reads. */
async function weekLoad(period = WEEK): Promise<WeekLoad> {
  const res = await app.inject({ method: 'GET', url: `/api/planning/week/${period}` })
  expect(res.statusCode, res.body).toBe(200)
  return (JSON.parse(res.body) as { fit: { load: WeekLoad } }).fit.load
}

/** Which work has hours in the week, in the order the reply lists it. */
async function rowsIn(period = WEEK): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: `/api/planning/week/${period}` })
  expect(res.statusCode, res.body).toBe(200)
  const body = JSON.parse(res.body) as { entries: { allocation: { recordId: string } }[] }
  return body.entries.map((e) => e.allocation.recordId)
}

// ============================================================================ the controls

describe('a week holds several pieces of work, and every one of their hours is counted', () => {
  it('adds up two unrelated pieces of work', async () => {
    const first = await give(task('Fix the gripper'), 3)
    const second = await give(task('Read the ICRA papers'), 2)
    expect(first.status, said(first)).toBe(201)
    expect(second.status, said(second)).toBe(201)

    const load = await weekLoad()
    // FIVE HOURS, BECAUSE FIVE HOURS WERE COMMITTED. Nothing above these two rows holds hours, so
    // there is no tree and nothing to count once.
    expect(load.plannedHours).toBe(5)
    expect(load.rowHours).toBe(5)
    expect(load.envelopes.trees).toEqual([])
  })

  it('adds up two parts of the same piece of work when the work itself has no hours', async () => {
    // THE HALF THE ARITHMETIC MUST NOT BREAK. Breaking a week down onto the parts is the whole point
    // of having parts, and a total that kept only the largest row would pass every test below while
    // losing two hours somebody planned.
    const whole = task('Tray clamp work')
    const one = task('Replace the fingers')
    const two = task('Re-run the grasp tests')
    partOf(one, whole)
    partOf(two, whole)
    const first = await give(one, 3)
    const second = await give(two, 2)
    expect(first.status, said(first)).toBe(201)
    expect(second.status, said(second)).toBe(201)

    const load = await weekLoad()
    expect(load.plannedHours).toBe(5)
    expect(load.rowHours).toBe(5)
    // The work holding them has no hours here, so it is not in this week at all.
    expect(load.envelopes.trees).toEqual([])
  })
})

// ============================================================================ coarse, then fine

describe('hours on a piece of work and hours on its parts are the same hours, counted once', () => {
  it('writes the part when the whole already has hours, and the week costs the whole', async () => {
    const whole = task('Tray clamp work')
    const part = task('Replace the fingers')
    partOf(part, whole)

    const first = await give(whole, 3)
    expect(first.status, said(first)).toBe(201)
    const second = await give(part, 2)
    // THE REFUSAL THAT WAS HERE UNTIL 16 AUGUST 2026. Planning the whole and then a part of it is
    // how the owner plans, and it is written rather than refused.
    expect(second.status, said(second)).toBe(201)

    // AND BOTH ROWS ARE THERE. A write reported as made and then dropped would be the fake success
    // this product exists to prevent.
    expect(await rowsIn()).toEqual([whole, part])

    const load = await weekLoad()
    // THREE HOURS OF WORK, not five: the two hours on the part explain part of the three.
    expect(load.plannedHours).toBe(3)
    // And the rows themselves are still readable as what they are.
    expect(load.rowHours).toBe(5)
    expect(load.allocations).toBe(2)

    const tree = load.envelopes.trees[0]
    expect(load.envelopes.trees).toHaveLength(1)
    expect(tree?.recordId).toBe(whole)
    expect(tree?.title).toBe('Tray clamp work')
    expect(tree?.hours).toBe(3)
    expect(tree?.assignedHours).toBe(2)
    expect(tree?.notYetBrokenDownHours).toBe(1)
    expect(tree?.overAssignedByHours).toBeNull()
    expect(tree?.contributesHours).toBe(3)
    expect(tree?.inside.map((child) => child.recordId)).toEqual([part])
    expect(tree?.inside[0]?.hours).toBe(2)

    // The period's own summary of the same reading, which is what a screen puts beside the total.
    expect(load.envelopes.assignedHours).toBe(2)
    expect(load.envelopes.notYetBrokenDownHours).toBe(1)
    expect(load.envelopes.couldNotPlace).toEqual([])

    // AND IT NAMES BOTH ENDS. "Some of this is inside something else" without saying which two rows
    // is not something a person can act on.
    expect(load.countedTwice.pairs).toHaveLength(1)
    expect(load.countedTwice.pairs[0]?.outer.id).toBe(whole)
    expect(load.countedTwice.pairs[0]?.inner.id).toBe(part)
    expect(load.countedTwice.pairs[0]?.outer.title).toBe('Tray clamp work')
  })

  it('writes the whole when a part already has hours, and the order changes nothing', async () => {
    const whole = task('Tray clamp work')
    const part = task('Replace the fingers')
    partOf(part, whole)

    const first = await give(part, 2)
    expect(first.status, said(first)).toBe(201)
    const second = await give(whole, 3)
    expect(second.status, said(second)).toBe(201)

    const load = await weekLoad()
    // THE SAME WEEK EITHER WAY ROUND. The arithmetic reads what contains what, not what was written
    // first, and a total that depended on the order of two writes would be unreadable.
    expect(load.plannedHours).toBe(3)
    expect(load.rowHours).toBe(5)
    expect(load.envelopes.trees[0]?.recordId).toBe(whole)
    expect(load.envelopes.trees[0]?.inside.map((child) => child.recordId)).toEqual([part])
    expect(load.envelopes.trees[0]?.notYetBrokenDownHours).toBe(1)
  })

  it('counts work two levels down inside the piece of work above it, not only its own parts', async () => {
    // The rule is about ANY ancestor. Arithmetic that looked only one level up would pass the two
    // tests above and report eight hours here.
    const goal = task('Get the arm handing over reliably')
    const middle = task('Tray clamp work')
    const small = task('Replace the fingers')
    partOf(middle, goal)
    partOf(small, middle)

    expect((await give(goal, 6)).status).toBe(201)
    const deeper = await give(small, 2)
    expect(deeper.status, said(deeper)).toBe(201)

    const load = await weekLoad()
    expect(load.plannedHours).toBe(6)
    expect(load.rowHours).toBe(8)
    const tree = load.envelopes.trees[0]
    expect(tree?.recordId).toBe(goal)
    expect(tree?.title).toBe('Get the arm handing over reliably')
    // `middle` holds no hours this week, so it is not a row here; the work below it still sits
    // inside the goal.
    expect(tree?.inside.map((child) => child.recordId)).toEqual([small])
    expect(tree?.assignedHours).toBe(2)
    expect(tree?.notYetBrokenDownHours).toBe(4)
  })

  it('reads a pipeline stored order as containment, not only a part-of link', async () => {
    // Containment is stored three ways and a pipeline's `blockIds` is one of them. A block whose
    // pipeline is part of an allocated task is inside that task, and arithmetic that only read links
    // would miss it entirely and report eight hours.
    const goal = task('Get the arm handing over reliably')
    const pipeline = t.api.createRecord({
      workspaceId: 'default',
      kind: 'pipeline',
      title: 'Handover campaign',
      data: { blockIds: [] },
      actor: AGENT,
    }).id
    const block = t.blocks.addBlock(pipeline, { name: 'Wave 1 — the gripper', state: 'todo' }, AGENT).block.id
    partOf(pipeline, goal)

    expect((await give(goal, 6)).status).toBe(201)
    const inside = await give(block, 2)
    expect(inside.status, said(inside)).toBe(201)

    const load = await weekLoad()
    expect(load.plannedHours).toBe(6)
    expect(load.rowHours).toBe(8)
    expect(load.envelopes.trees[0]?.recordId).toBe(goal)
    expect(load.envelopes.trees[0]?.inside.map((child) => child.recordId)).toEqual([block])
  })
})

// ============================================================================ when the parts are bigger

describe('parts that come to more than the work holding them are a conflict, shown and not refused', () => {
  it('writes them, costs the period the larger number, and says by how much', async () => {
    // PRETENDING THE PARTS FIT WOULD BE THE ARITHMETIC LYING TO PROTECT A RULE. Ten hours are
    // committed below a row that says six, so the week costs ten and says what is wrong with it.
    const whole = task('Tray clamp work')
    const one = task('Replace the fingers')
    const two = task('Re-run the grasp tests')
    partOf(one, whole)
    partOf(two, whole)

    expect((await give(whole, 6)).status).toBe(201)
    expect((await give(one, 6)).status).toBe(201)
    const last = await give(two, 4)
    expect(last.status, said(last)).toBe(201)

    const load = await weekLoad()
    expect(load.plannedHours).toBe(10)
    expect(load.rowHours).toBe(16)
    const tree = load.envelopes.trees[0]
    expect(tree?.recordId).toBe(whole)
    expect(tree?.hours).toBe(6)
    expect(tree?.assignedHours).toBe(10)
    expect(tree?.overAssignedByHours).toBe(4)
    expect(tree?.contributesHours).toBe(10)
    // Nothing is left over when the parts have already exceeded the work above them.
    expect(tree?.notYetBrokenDownHours).toBe(0)
  })
})

// ============================================================================ what the rule is NOT

describe('a tree is read inside one period at one horizon, and nothing wider', () => {
  it('counts the part in a different week as its own week’s work', async () => {
    const whole = task('Tray clamp work')
    const part = task('Replace the fingers')
    partOf(part, whole)
    expect((await give(whole, 3, WEEK)).status).toBe(201)
    const next = await give(part, 2, theWeekAfter(WEEK))
    expect(next.status, said(next)).toBe(201)

    expect((await weekLoad()).plannedHours).toBe(3)
    expect((await weekLoad(theWeekAfter(WEEK))).plannedHours).toBe(2)
  })

  it('allows the part on a day inside the week the whole was planned in', async () => {
    // A week and a day are NEVER added together — `loadOf` sums one horizon and says which — so
    // planning the week at one level and a day at another counts nothing twice.
    const whole = task('Tray clamp work')
    const part = task('Replace the fingers')
    partOf(part, whole)
    expect((await give(whole, 3, WEEK, 'week')).status).toBe(201)
    const monday = await give(part, 2, theMondayOf(WEEK), 'day')
    expect(monday.status, said(monday)).toBe(201)

    // The week still costs three: the day's two hours are a finer answer about the same work, not a
    // part of this week's total.
    expect((await weekLoad()).plannedHours).toBe(3)
  })
})

// ============================================================================ when it cannot tell

describe('a row whose containment cannot be read is counted on its own and named, never guessed into a tree', () => {
  /**
   * A `part_of` ROW WRITTEN STRAIGHT INTO THE TABLE, ON PURPOSE, FOR THE SAME REASON
   * `settleLinkBypassingTheGate` IN helpers.ts EXISTS.
   *
   * `createLink` refuses a second parent and refuses a loop, so a record with two parents can no
   * longer be MADE through any code path. It can still ARRIVE: rows written before that gate
   * existed are in the live corpus, and an archive restored tomorrow carries whatever it carried.
   * A test that could not build the state would quietly stop proving that the total says what it
   * could not read, and the day such a row arrived nothing would fail.
   */
  function storeContainmentRowDirectly(part: string, whole: string): void {
    const stamp = t.api.localStamp(new Date())
    t.client.sqlite
      .prepare(
        'INSERT INTO links (owner_id, id, workspace_id, from_id, to_id, type, created_by, created_at, updated_at) ' +
          `VALUES ('${THE_TEST_OFFICES_OWNER.id}', ?, 'default', ?, ?, 'part_of', '${THE_TEST_OFFICES_OWNER.id}', ?, ?)`,
      )
      .run(`raw-${part}-${whole}`.slice(0, 24), part, whole, stamp, stamp)
  }

  it('says which record it could not place, in the reader’s own words, and still counts its hours', async () => {
    // Two things say they hold one record, so `ancestorsOf` will not choose between them and answers
    // that the chain is incomplete. Read as "nothing above it", those two hours would silently sit
    // inside a tree they may not belong to; read as nothing at all, the week would lose them. So the
    // hours are counted on their own and the row is named.
    const goal = task('Get the arm handing over reliably')
    const other = task('Tray clamp work')
    const small = task('Replace the fingers')
    storeContainmentRowDirectly(small, goal)
    storeContainmentRowDirectly(small, other)

    expect((await give(goal, 6)).status).toBe(201)
    const written = await give(small, 2)
    // NOT REFUSED. The write door asks nothing about containment since 16 August 2026; the total is
    // where an unreadable chain is reported.
    expect(written.status, said(written)).toBe(201)

    const load = await weekLoad()
    // Eight hours, which may be too high — and the note beside it is what says so.
    expect(load.plannedHours).toBe(8)
    expect(load.envelopes.trees).toEqual([])
    expect(load.envelopes.couldNotPlace.map((row) => row.recordId)).toEqual([small])
    const why = load.envelopes.couldNotPlace[0]?.why ?? ''
    // The reader's own sentence, not a second wording of it invented here.
    expect(why).toContain('and a record is part of one thing')
    expect(why).toContain('Get the arm handing over reliably')
    expect(why).toContain('Tray clamp work')
    // The same row, said the same way, in the containment reading the arithmetic was built on.
    expect(load.countedTwice.notChecked.map((row) => row.recordId)).toEqual([small])
  })
})

// ============================================================================ what is already stored

describe('the one reader of containment for a period', () => {
  it('reports a pair made by a link written after both allocations', async () => {
    // A `part_of` link made AFTER two allocations makes a tree out of two rows that were written as
    // separate work. Nothing refuses that and nothing needs to: the reader finds the pair and the
    // period's arithmetic counts the tree once from then on.
    const whole = task('Tray clamp work')
    const part = task('Replace the fingers')
    expect((await give(whole, 3)).status).toBe(201)
    expect((await give(part, 2)).status).toBe(201)
    expect((await weekLoad()).plannedHours).toBe(5)

    partOf(part, whole)

    const found = planning.hoursCountedTwiceIn('week', WEEK)
    expect(found.notChecked).toEqual([])
    expect(found.pairs).toHaveLength(1)
    const pair = found.pairs[0]!
    expect(pair.outer.id).toBe(whole)
    expect(pair.inner.id).toBe(part)
    expect(pair.outer.title).toBe('Tray clamp work')
    expect(pair.outer.allocations.map((a) => a.plannedHours)).toEqual([3])
    expect(pair.inner.allocations.map((a) => a.plannedHours)).toEqual([2])

    // And the week reads three hours from that moment on, without either row being touched.
    expect((await weekLoad()).plannedHours).toBe(3)
    expect((await weekLoad()).rowHours).toBe(5)
  })

  it('says nothing is inside anything when nothing is', async () => {
    // The other direction, and it is what stops the reader being satisfied by reporting a pair for
    // every week it is handed.
    const one = task('Fix the gripper')
    const two = task('Read the ICRA papers')
    expect((await give(one, 3)).status).toBe(201)
    expect((await give(two, 2)).status).toBe(201)
    expect(planning.hoursCountedTwiceIn('week', WEEK)).toEqual({ horizon: 'week', period: WEEK, pairs: [], notChecked: [] })
  })
})
