// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `GET /api/planning/deadline/:id` — THE WIRING, not the arithmetic.
 *
 * `tests/deadlines.test.ts` proves the arithmetic against plain data. This file proves the four
 * things that can only go wrong at the seam between the stored corpus and that arithmetic, and each
 * of them is a way the route could return a confident number that means nothing:
 *
 *   the stamp is read by the SAME reader the rest of the product uses  — or a deadline is late a
 *                                                                        day early on one surface
 *   an obligation owed on a CONDITION gets no window                   — or words become a date
 *   allocations are found across the window and across projects        — planning is person-level
 *   work nobody named is reported as a gap, never as zero              — the whole doctrine
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

// EVERY CASE READS A FIXED CLOCK, never the machine's date (problem m5v7Z9nQQ_cK). The route reads
// Date.now(), so a case that read the real clock could pass or fail by the day it ran. This file
// was red on main at ten past midnight on Monday 5 October 2026 for that reason alone. Only Date is
// faked; the database and the server keep their real timers.
const THE_CLOCK = '2026-10-05T00:10:00' // local time, as the product keeps it

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(THE_CLOCK))
  t = await freshDb()
  const { planningRoutes } = await import('../src/server/api/planning.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(planningRoutes, { prefix: '/api' })
  await app.ready()
})

afterEach(async () => {
  await app.close()
  t.close()
  vi.useRealTimers()
})

async function outlookOf(id: string, query = ''): Promise<Record<string, never> & any> {
  const res = await app.inject({ method: 'GET', url: `/api/planning/deadline/${id}${query}` })
  const body = JSON.parse(res.body) as Record<string, any>
  expect(res.statusCode, JSON.stringify(body)).toBe(200)
  return body
}

function obligation(due: unknown, title: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'obligation',
    title,
    data: {
      state: 'open',
      owedTo: 'the grant review',
      why: 'the payment is gated on it',
      ...(due === undefined ? {} : { due }),
    },
    actor: AGENT,
  }).id
}

function task(title: string, effortHours: number | null): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'task',
    title,
    data: { state: 'todo', ...(effortHours === null ? {} : { effort_hours: effortHours }) },
    actor: AGENT,
  }).id
}

describe('a record that is not there, and one that has no date', () => {
  it('404s an id nothing answers to', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/planning/deadline/no-such-record' })
    expect(res.statusCode).toBe(404)
    expect(String((JSON.parse(res.body) as { error: string }).error)).toContain('no-such-record')
  })

  it('gives an obligation owed on a CONDITION no window and no fabricated date', async () => {
    // "when the durability proof is rebuilt" is not a date and nothing here may make it one.
    const id = obligation({ condition: 'the durability proof is rebuilt' }, 'Rebuild the restore proof')
    const body = await outlookOf(id)
    const o = body['outlook']
    expect(o.deadline.date).toBeNull()
    expect(o.deadline.atMs).toBeNull()
    expect(o.deadline.remainingMs).toBeNull()
    // `between` is ONE nullable object, so no windowed number can be read out of a report with no
    // window — not capacity, not planned hours, not a buffer.
    expect(o.between).toBeNull()
    expect(o.buffer.hours).toBeNull()
    expect(o.gaps).toContain('no-date')
    expect(o.deadline.condition).toBe('the durability proof is rebuilt')
  })
})

describe('the stamp is read by the reader the rest of the product uses', () => {
  it('a bare date is due at the END of that day, not at midnight starting it', async () => {
    const id = obligation('2026-08-04', 'ESA report: grip-force section')
    const body = await outlookOf(id)
    const atMs = body['outlook'].deadline.atMs as number
    const at = new Date(atMs)
    // The END of the 4th, local. Midnight-starting-the-4th would make it late a whole day early,
    // which is exactly the drift `parseDueStamp` exists to stop.
    expect(at.getDate()).toBe(4)
    expect(at.getHours()).toBe(23)
    expect(at.getMinutes()).toBe(59)
  })
})

describe('work is what the caller named, and unknown is a gap rather than a zero', () => {
  it('names no work at all as a gap, and does not read it off the corpus', async () => {
    task('A task the deadline does not know about', 40)
    const id = obligation('2027-01-01', 'Something owed next year')
    const o = (await outlookOf(id))['outlook']
    expect(o.gaps).toContain('no-work-named')
    expect(o.estimate.items).toBe(0)
    // AND the 40-hour task in the same project was NOT counted. Which work is relevant is the
    // caller's answer; a route that swept the workspace would find it.
    expect(o.estimate.hours).toBe(0)
    expect(o.work).toHaveLength(0)
  })

  it('counts an id nothing answers to, rather than dropping it out of the total in silence', async () => {
    // A total covering three of the four records you named, drawn as though it covered four, is the
    // confident number about nothing this whole report exists to prevent. The route used to filter
    // an unknown id out and say nothing; the browser surface had to compare what it asked for
    // against what came back to notice.
    const real = task('Write the two pages', 6)
    const id = obligation('2027-01-01', 'Something owed next year')
    const body = await outlookOf(id, `?work=${real},no-such-record,also-not-here`)
    expect(body['named']).toEqual({ asked: 3, sized: 1, missing: ['no-such-record', 'also-not-here'] })
    // And the sizing is honest about what it DID count.
    expect(body['outlook'].estimate.items).toBe(1)
  })

  it('counts estimated work, reports the unestimated separately, and never adds it as zero', async () => {
    const big = task('Write the two pages', 6)
    const unknown = task('Redo the figures', null)
    const id = obligation('2027-01-01', 'Something owed next year')
    const o = (await outlookOf(id, `?work=${big},${unknown}`))['outlook']
    expect(o.estimate.items).toBe(2)
    expect(o.estimate.estimated).toBe(1)
    expect(o.estimate.unestimated).toBe(1)
    expect(o.estimate.hours).toBe(6)
    // Six hours over two items is not "six hours of work" — the reply says one of them is uncounted.
    expect(o.gaps).toContain('some-work-unestimated')
  })
})

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/**
 * The date `days` calendar days from the clock, at the same local time of day. Calendar days, not
 * `days * 24` hours: three weeks of hours from ten past midnight on 5 October 2026 end on Sunday
 * 25 October at ten past eleven, because the clock goes back an hour that night. That is how this
 * file's Monday case chose the wrong week.
 */
function daysFromNow(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

/** A yyyy-mm-dd stamp `days` from the clock, local, which is the only calendar this product keeps. */
function stampIn(days: number): string {
  const d = daysFromNow(days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// THE CASES THAT READ A WINDOW RUN AT EACH OF THESE CLOCKS: every day of one week, Monday first and
// at the minute this file failed on main; a week that crosses a month end; a week that crosses a
// year end. A window case that holds on one weekday only is the fault this list exists to catch.
const CLOCKS: ReadonlyArray<readonly [string, string]> = [
  ['Monday 5 October 2026, ten past midnight', '2026-10-05T00:10:00'],
  ['Tuesday 6 October 2026', '2026-10-06T09:00:00'],
  ['Wednesday 7 October 2026', '2026-10-07T13:30:00'],
  ['Thursday 8 October 2026', '2026-10-08T18:00:00'],
  ['Friday 9 October 2026, ten to midnight', '2026-10-09T23:50:00'],
  ['Saturday 10 October 2026', '2026-10-10T08:00:00'],
  ['Sunday 11 October 2026, a minute to midnight', '2026-10-11T23:59:00'],
  ['Wednesday 30 September 2026, in a week that crosses a month end', '2026-09-30T12:00:00'],
  ['Monday 28 December 2026, in a week that crosses a year end', '2026-12-28T08:00:00'],
  ['Thursday 31 December 2026, half an hour before the year ends', '2026-12-31T23:30:00'],
]

describe.each(CLOCKS)('the plan is read across the window, and says what it could not count, at %s', (_when, clock) => {
  beforeEach(() => {
    vi.setSystemTime(new Date(clock))
  })

  it('adds up the whole weeks between now and the deadline, and leaves the work its unplaced hours', async () => {
    const { createAllocation } = await import('../src/server/lib/planning.ts')
    const { weekKey } = await import('../src/shared/planning.ts')

    const work = task('Write the two pages', 6)
    // A week that lies WHOLLY inside a four-week window, so nothing about it is clipped.
    const nextWeek = weekKey(daysFromNow(8))
    createAllocation({ horizon: 'week', period: nextWeek, recordId: work, plannedHours: 2 }, HUMAN)
    const id = obligation(stampIn(28), 'Owed in four weeks')

    const o = (await outlookOf(id, `?work=${work}`))['outlook']
    const row = o.work.find((r: { recordId: string }) => r.recordId === work)
    expect(row.plannedHours).toBe(2)
    expect(row.allocations).toBe(1)
    // Four of the six hours have nowhere to be yet, and that is the number worth having.
    expect(row.unplacedHours).toBe(4)
    expect(o.between.planned.periods).toContain(nextWeek)
  })

  it('does not count time planned in the week the window CLIPS — and says how much it did not count', async () => {
    // Not counting a clipped week is right: nothing records which part of a week its hours sit in,
    // and prorating would invent a number. Counting it as ZERO in silence is what would be wrong —
    // the deadline would report all six hours unplaced while a week inside it already holds two.
    //
    // The window runs from the clock to the end of the day three weeks on. The week holding the
    // start is clipped unless the clock is on a Monday; the week holding the end falls on the same
    // weekday, so it is clipped whenever the start is not. One of the two is always the case this
    // test is about. This case once read the real clock, and failed on 17 August 2026 (a Monday,
    // when it assumed the first week was clipped) and on 5 October 2026 (a Monday, when 21 days of
    // hours ended on the Sunday before the clock change). Both were the test's fault, not the route's.
    const { createAllocation } = await import('../src/server/lib/planning.ts')
    const { weekKey } = await import('../src/shared/planning.ts')

    const work = task('Write the two pages', 6)
    const isMonday = new Date().getDay() === 1
    const clippedWeek = weekKey(isMonday ? daysFromNow(21) : new Date())
    createAllocation({ horizon: 'week', period: clippedWeek, recordId: work, plannedHours: 2 }, HUMAN)
    const id = obligation(stampIn(21), 'Owed in three weeks')

    const o = (await outlookOf(id, `?work=${work}`))['outlook']
    expect(o.between.planned.periods).not.toContain(clippedWeek)
    expect(o.between.planned.hours).toBe(0)
    // THE ASSERTION THIS TEST EXISTS FOR: the total says how many rows it could not count.
    expect(o.between.planned.inClippedPeriods).toBe(1)
    expect(o.gaps).toContain('plan-in-a-clipped-period')
    expect(o.gaps).toContain('periods-overlap-the-window')
  })

  it('does not add a day allocation into a week total, and says the plan is at another horizon', async () => {
    const { createAllocation } = await import('../src/server/lib/planning.ts')
    const { weekKey, dayKey } = await import('../src/shared/planning.ts')

    const work = task('Write the two pages', 6)
    const inTen = daysFromNow(10)
    createAllocation({ horizon: 'week', period: weekKey(inTen), recordId: work, plannedHours: 2 }, HUMAN)
    createAllocation({ horizon: 'day', period: dayKey(inTen), recordId: work, plannedHours: 1 }, HUMAN)
    const id = obligation(stampIn(28), 'Owed in four weeks')

    const o = (await outlookOf(id, `?work=${work}&horizon=week`))['outlook']
    // A week planning 2 hours with 1 of them on a Tuesday is 2 hours, never 3.
    expect(o.between.planned.hours).toBe(2)
    expect(o.between.planned.atOtherHorizons).toBe(1)
    expect(o.gaps).toContain('plan-at-another-horizon')
  })

  it('has no capacity answer until somebody states one, and null is not a full working week', async () => {
    const { createAllocation, setCapacity } = await import('../src/server/lib/planning.ts')
    const { weekKey } = await import('../src/shared/planning.ts')

    const work = task('Write the two pages', 6)
    const soon = daysFromNow(8)
    createAllocation({ horizon: 'week', period: weekKey(soon), recordId: work, plannedHours: 2 }, HUMAN)
    const id = obligation(stampIn(28), 'Owed in four weeks')

    const before = (await outlookOf(id, `?work=${work}`))['outlook']
    expect(before.between.capacity.hours).toBeNull()
    expect(before.buffer.hours).toBeNull()
    expect(before.gaps).toContain('no-capacity-stated')

    setCapacity('week', weekKey(soon), 30, null, HUMAN)
    const after = (await outlookOf(id, `?work=${work}`))['outlook']
    expect(after.between.capacity.hours).toBe(30)
    expect(after.between.capacity.stated).toBe(1)
    // The other whole weeks in the window still say nothing, and the reply says so rather than
    // reading their silence as zero hours available.
    expect(after.between.capacity.unstated).toBeGreaterThan(0)
    expect(after.gaps).toContain('some-periods-without-capacity')
  })
})

describe('every route in this region says what IT answers, in GET /api', () => {
  it('gives the four routes the region paragraph does not describe their own line', async () => {
    // `GET /api` promises one sentence per endpoint saying what that endpoint is for. A shared
    // paragraph about planning periods keeps that promise for `GET /planning/week/2026-W36` and
    // for nothing else: an agent looking for how to apply an approved change set, or what a
    // deadline reply carries, would read about ISO week numbers and stop.
    const { trackApiRoutes } = await import('../src/server/api/kinds.ts')
    const { planningRoutes, PLANNING_ROUTE_NOTE } = await import('../src/server/api/planning.ts')
    const probe = Fastify()
    const routes = trackApiRoutes(probe)
    await probe.register(planningRoutes, { prefix: '/api' })
    await probe.ready()

    const noteFor = (method: string, path: string): string => {
      const found = routes().find((r) => r.method === method && r.path === path)
      expect(found, `${method} ${path} is not registered`).toBeDefined()
      expect(found?.note, `${method} ${path} publishes no sentence at all`).toBeTruthy()
      return found?.note ?? ''
    }

    const own: [string, string, string][] = [
      ['GET', '/api/planning/deadline/:id', 'buffer'],
      ['GET', '/api/planning/review/:horizon/:period', 'review'],
      ['GET', '/api/planning/today', 'today'],
      // `GET /api/planning/drafts/:id/context` was the fifth, until migration 0196 moved every draft into a plan
      // and an agent reviews it through GET /api/plans/:id/context.
      ['POST', '/api/planning/proposals/:id/apply', 'transaction'],
    ]
    for (const [method, path, word] of own) {
      const note = noteFor(method, path)
      expect(note, `${method} ${path} still serves the region paragraph`).not.toBe(PLANNING_ROUTE_NOTE)
      expect(note.toLowerCase(), `${method} ${path} does not mention ${word}`).toContain(word)
    }

    // And the ordinary period route still carries the region paragraph, which is right for it.
    expect(noteFor('GET', '/api/planning/:horizon/:period')).toBe(PLANNING_ROUTE_NOTE)
    await probe.close()
  })
})
