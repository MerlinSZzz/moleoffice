// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLAN: WHEN THIS PERSON WILL SPEND REAL TIME ON WORK THAT ALREADY EXISTS.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO SETTLED RULES EVERY TEST BELOW IS PINNING
 * ---------------------------------------------------------------------------------------
 *
 * **Completing an allocation completes that slice of time and nothing else.** Owner decision,
 * 2026-08-12. It is what lets a six-hour task be worked on for two hours on Tuesday without either
 * duplicating the task per day or reporting it finished when it is not. The test that matters most
 * in this file is the one that marks an allocation `done` and then reads the record back unchanged.
 *
 * **A planning period is not workspace-owned.** It is a person-level overlay across workspace-owned
 * canonical work, so one week may hold Mole Office work, robotics work and a dentist appointment. What
 * that must NOT become is a way to read another project, and the boundary test below is written to
 * fail if planning ever grows a query that ranges over a workspace.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE TWO NUMBERS THAT ARE NOT THE SAME NUMBER
 * ---------------------------------------------------------------------------------------
 *
 * `effort_hours` on the work is how big it is in total. `plannedHours` on an allocation is how much
 * time one period gives it. A twenty-hour task with eight hours in a week and three on a Monday is
 * not thirty-one hours of anything, and `null` planned hours means nobody said — never zero, and
 * never quietly filled in from the estimate.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  containsPeriod,
  fitOf,
  loadOf,
  parsePeriod,
  periodKey,
  spreadOf,
  weekKey,
  type Allocation,
} from '../src/shared/planning.ts'
import { buildTheFirstOfficeInAHook, AGENT, freshDb, type TestDb, settleLinkBypassingTheGate } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

// ============================================================================ the period vocabulary

describe('a period is a key that can be placed on a calendar, or it is refused', () => {
  it('reads the three shapes', () => {
    expect(parsePeriod('2026-09')).toEqual({ horizon: 'month', key: '2026-09', from: '2026-09-01', to: '2026-09-30' })
    expect(parsePeriod('2026-09-07')).toEqual({ horizon: 'day', key: '2026-09-07', from: '2026-09-07', to: '2026-09-07' })
    const week = parsePeriod('2026-W36')
    // ISO-8601: Monday starts the week. Written out rather than computed, because half the world
    // starts a week on Sunday and this is the choice being pinned.
    expect(week).toEqual({ horizon: 'week', key: '2026-W36', from: '2026-08-31', to: '2026-09-06' })
  })

  it('refuses what is not a period rather than answering about a different one', () => {
    for (const bad of ['2026-13', '2026-00', '2026-W99', '2026-W00', '2026-02-30', 'next week', '', '2026']) {
      expect(parsePeriod(bad), `${bad} was read as a period`).toBeNull()
    }
  })

  it('gets February right in a leap year and an ordinary one', () => {
    expect(parsePeriod('2028-02')?.to).toBe('2028-02-29')
    expect(parsePeriod('2026-02')?.to).toBe('2026-02-28')
  })

  it('puts a January day in last year\'s week when ISO says so', () => {
    // 1 January 2027 is a Friday, so it belongs to week 53 of 2026. Getting this wrong is how a
    // week's capacity gets counted twice at a year boundary.
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-W53')
    expect(periodKey('month', new Date(2027, 0, 1))).toBe('2027-01')
  })

  it('round-trips: every day of a year lands in a week that contains it', () => {
    // The cheapest possible proof that the two functions agree, over 365 chances to disagree.
    const wrong: string[] = []
    for (let i = 0; i < 365; i++) {
      const day = new Date(2026, 0, 1 + i)
      const dayP = parsePeriod(periodKey('day', day))
      const weekP = parsePeriod(periodKey('week', day))
      if (dayP === null || weekP === null) {
        wrong.push(`${periodKey('day', day)} produced an unreadable key`)
      } else if (!containsPeriod(weekP, dayP)) {
        wrong.push(`${dayP.key} is not inside ${weekP.key} (${weekP.from}..${weekP.to})`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('does not round a week into the month holding most of it', () => {
    // A week straddling two months is in neither wholly, and saying otherwise would put hours in a
    // month they were not planned for.
    const september = parsePeriod('2026-09')
    const straddling = parsePeriod('2026-W36')
    expect(september).not.toBeNull()
    expect(straddling).not.toBeNull()
    if (september === null || straddling === null) return
    expect(containsPeriod(september, straddling)).toBe(false)
  })
})

// ============================================================================ the arithmetic

/** An allocation without a database, for the arithmetic tests. */
function alloc(part: Partial<Allocation> & Pick<Allocation, 'horizon' | 'period' | 'recordId'>): Allocation {
  return {
    id: `a-${part.period}-${part.recordId}`,
    plannedHours: null,
    actualHours: null,
    state: 'planned',
    note: null,
    createdAt: '2026-08-12 09:00',
    updatedAt: '2026-08-12 09:00',
    ...part,
  }
}

describe('the arithmetic says what it could not count', () => {
  it('adds one horizon at a time and never across them', () => {
    const all = [
      alloc({ horizon: 'week', period: '2026-W36', recordId: 'r1', plannedHours: 8 }),
      alloc({ horizon: 'day', period: '2026-09-01', recordId: 'r1', plannedHours: 3 }),
    ]
    // 8 hours of work with 3 of them placed on a Tuesday is 8 hours, not 11. This is the whole of
    // "no duplication across horizons" as one assertion.
    expect(loadOf('week', '2026-W36', all).plannedHours).toBe(8)
    expect(loadOf('day', '2026-09-01', all).plannedHours).toBe(3)
  })

  it('counts how many said nothing, because a total without that is unreadable', () => {
    const all = [
      alloc({ horizon: 'week', period: '2026-W36', recordId: 'r1', plannedHours: 6 }),
      alloc({ horizon: 'week', period: '2026-W36', recordId: 'r2' }),
    ]
    const load = loadOf('week', '2026-W36', all)
    expect(load.plannedHours).toBe(6)
    expect(load.allocations).toBe(2)
    // Six hours over two allocations means something different depending on this number.
    expect(load.stated).toBe(1)
  })

  it('has no answer about fit when nobody has said how many hours the period holds', () => {
    const load = loadOf('week', '2026-W36', [
      alloc({ horizon: 'week', period: '2026-W36', recordId: 'r1', plannedHours: 6 }),
    ])
    const unknown = fitOf(load, null)
    // NOT zero, and not a working week. "Nobody has looked" is a different answer from "it does not
    // fit", and a default capacity would give the wrong one of the two.
    expect(unknown.freeHours).toBeNull()
    expect(unknown.overcommitted).toBeNull()

    const known = fitOf(load, 30)
    expect(known.freeHours).toBe(24)
    expect(known.overcommitted).toBe(false)
  })

  it('says a period is over-committed rather than clamping it to zero', () => {
    const load = loadOf('day', '2026-09-01', [
      alloc({ horizon: 'day', period: '2026-09-01', recordId: 'r1', plannedHours: 5 }),
      alloc({ horizon: 'day', period: '2026-09-01', recordId: 'r2', plannedHours: 4 }),
    ])
    const fit = fitOf(load, 6)
    expect(fit.freeHours).toBe(-3)
    expect(fit.overcommitted).toBe(true)
  })

  it('adds hours without floating-point noise — in the sum itself, not only in the difference', () => {
    const load = loadOf('day', '2026-09-01', [
      alloc({ horizon: 'day', period: '2026-09-01', recordId: 'r1', plannedHours: 0.1, actualHours: 0.1 }),
      alloc({ horizon: 'day', period: '2026-09-01', recordId: 'r2', plannedHours: 0.2, actualHours: 0.2 }),
    ])
    // 0.1 + 0.2 is 0.30000000000000004, which is true and unreadable.
    //
    // THE FIRST TWO ASSERTIONS ARE THE ONES THAT WERE MISSING. This test asserted only `fitOf`'s
    // answer, which was already rounded — so it passed while `loadOf` handed 0.30000000000000004
    // to the screen and into the sentence a person reads. Found by an independent reviewer, not by
    // this file. A test that only checks the number downstream of the bug is not checking the bug.
    expect(load.plannedHours).toBe(0.3)
    expect(load.actualHours).toBe(0.3)
    expect(fitOf(load, 1).freeHours).toBe(0.7)
  })
})

describe('how much of a week has reached the days inside it', () => {
  const week = parsePeriod('2026-W36')

  it('reports scheduled and unscheduled per record, as a comparison and not a sum', () => {
    expect(week).not.toBeNull()
    if (week === null) return
    const all = [
      alloc({ horizon: 'week', period: '2026-W36', recordId: 'r1', plannedHours: 8 }),
      alloc({ horizon: 'day', period: '2026-09-01', recordId: 'r1', plannedHours: 3 }),
      alloc({ horizon: 'day', period: '2026-09-02', recordId: 'r1', plannedHours: 2 }),
    ]
    const [row] = spreadOf(week, 'day', all)
    expect(row?.plannedHours).toBe(8)
    expect(row?.scheduledHours).toBe(5)
    expect(row?.unscheduledHours).toBe(3)
  })

  it('reports a negative when more has been placed on days than the week committed to', () => {
    expect(week).not.toBeNull()
    if (week === null) return
    const all = [
      alloc({ horizon: 'week', period: '2026-W36', recordId: 'r1', plannedHours: 2 }),
      alloc({ horizon: 'day', period: '2026-09-01', recordId: 'r1', plannedHours: 5 }),
    ]
    // Reported rather than clamped: it is a real state of a real plan and the person should see it.
    expect(spreadOf(week, 'day', all)[0]?.unscheduledHours).toBe(-3)
  })

  it('leaves unscheduled unknown when the week never said a number', () => {
    expect(week).not.toBeNull()
    if (week === null) return
    const all = [
      alloc({ horizon: 'week', period: '2026-W36', recordId: 'r1' }),
      alloc({ horizon: 'day', period: '2026-09-01', recordId: 'r1', plannedHours: 3 }),
    ]
    const [row] = spreadOf(week, 'day', all)
    expect(row?.plannedHours).toBeNull()
    // Not -3. Nothing is known about how much is left of a number nobody gave.
    expect(row?.unscheduledHours).toBeNull()
    expect(row?.scheduledHours).toBe(3)
  })

  it('ignores days outside the week, so a month cannot leak into it', () => {
    expect(week).not.toBeNull()
    if (week === null) return
    const all = [
      alloc({ horizon: 'week', period: '2026-W36', recordId: 'r1', plannedHours: 8 }),
      // 2026-09-30 is nowhere near week 36.
      alloc({ horizon: 'day', period: '2026-09-30', recordId: 'r1', plannedHours: 4 }),
    ]
    expect(spreadOf(week, 'day', all)[0]?.scheduledHours).toBe(0)
  })
})

// ============================================================================ against the server

interface Harness {
  db: TestDb
  app: FastifyInstance
}

async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { planningRoutes } = await import('../src/server/api/planning.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(planningRoutes, { prefix: '/api' })
  await app.ready()
  return { db, app }
}

let t: TestDb
let app: FastifyInstance

beforeEach(async () => {
  const h = await freshApp()
  t = h.db
  app = h.app
})

afterEach(async () => {
  await app.close()
  t.close()
})

/** A task worth planning, in whichever project is asked for. */
function task(title: string, workspaceId = 'default', effortHours?: number): string {
  return t.api.createRecord({
    workspaceId,
    kind: 'task',
    title,
    data: { state: 'todo', ...(effortHours === undefined ? {} : { effort_hours: effortHours }) },
    actor: AGENT,
  }).id
}

async function post(
  url: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'POST', url, payload })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> }
}

describe('completing an allocation completes that slice of time and nothing else', () => {
  it('leaves the work exactly as it was — the settled rule, as one assertion', async () => {
    const id = task('Complete experiment', 'default', 20)
    const made = await post('/api/planning/allocations', {
      horizon: 'day',
      period: '2026-09-07',
      recordId: id,
      plannedHours: 3,
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const allocationId = (made.body['allocation'] as { id: string }).id

    const before = t.api.getRecord(id)
    const done = await app.inject({
      method: 'PATCH',
      url: `/api/planning/allocations/${allocationId}`,
      payload: { state: 'done', actualHours: 4 },
    })
    expect(done.statusCode).toBe(200)

    const after = t.api.getRecord(id)
    // THE ASSERTION THIS FILE EXISTS FOR. A task larger than a day is the normal case, so a plan
    // that closed it would be wrong most of the time.
    expect(after?.data).toEqual(before?.data)
    expect((after?.data as { state?: string }).state).toBe('todo')
    expect(after?.updatedAt).toBe(before?.updatedAt)
    // And the reply says so, rather than leaving the reader to find out next week.
    expect(JSON.parse(done.body)['note']).toContain('never completes the work')
  })

  it('records the hours actually spent without touching the estimate on the work', async () => {
    const id = task('Complete experiment', 'default', 20)
    const made = await post('/api/planning/allocations', {
      horizon: 'day',
      period: '2026-09-07',
      recordId: id,
      plannedHours: 3,
    })
    const allocationId = (made.body['allocation'] as { id: string }).id
    await app.inject({
      method: 'PATCH',
      url: `/api/planning/allocations/${allocationId}`,
      payload: { actualHours: 5 },
    })
    // "planned 3, spent 5" is a fact about a Monday. It is NOT a correction to how big the task is.
    expect((t.api.getRecord(id)?.data as { effort_hours?: number }).effort_hours).toBe(20)
  })
})

describe('the two numbers answer different questions', () => {
  it('lets a month, a week and a day each give the same work different hours', async () => {
    const id = task('Complete experiment', 'default', 20)
    for (const [horizon, period, hours] of [
      ['month', '2026-09', 20],
      ['week', '2026-W36', 8],
      ['day', '2026-09-07', 3],
    ] as const) {
      const made = await post('/api/planning/allocations', { horizon, period, recordId: id, plannedHours: hours })
      expect(made.status, JSON.stringify(made.body)).toBe(201)
    }
    // The estimate on the work is untouched by any of them, and none of the three disagrees with it.
    expect((t.api.getRecord(id)?.data as { effort_hours?: number }).effort_hours).toBe(20)

    const week = await app.inject({ method: 'GET', url: '/api/planning/week/2026-W36' })
    const body = JSON.parse(week.body) as { fit: { load: { plannedHours: number } } }
    expect(body.fit.load.plannedHours).toBe(8)
  })

  it('never fills an unstated allocation in from the estimate', async () => {
    const id = task('Complete experiment', 'default', 20)
    const made = await post('/api/planning/allocations', { horizon: 'day', period: '2026-09-07', recordId: id })
    expect(made.status).toBe(201)
    // 20 hours into a Monday nobody promised 20 hours to would be the whole defect.
    expect((made.body['allocation'] as { plannedHours: number | null }).plannedHours).toBeNull()

    const day = await app.inject({ method: 'GET', url: '/api/planning/day/2026-09-07' })
    const body = JSON.parse(day.body) as { fit: { load: { plannedHours: number; stated: number; allocations: number } }; note: string }
    expect(body.fit.load.plannedHours).toBe(0)
    expect(body.fit.load.allocations).toBe(1)
    expect(body.fit.load.stated).toBe(0)
    // And the words say the total is a floor rather than the whole.
    expect(body.note).toContain('not say how long')
  })
})

describe('a plan spans projects without merging them', () => {
  it('holds work from three projects in one week, each saying which project owns it', async () => {
    const workspaces = await import('../src/server/lib/workspaces.ts')
    workspaces.createWorkspace({ id: 'robotics', title: 'Robotics' })
    workspaces.createWorkspace({ id: 'personal', title: 'Personal' })
    const here = task('Wave 5 planning', 'default', 6)
    const there = task('Recalibrate the gripper', 'robotics', 2)
    const dentist = task('Dentist', 'personal', 1)

    for (const id of [here, there, dentist]) {
      const made = await post('/api/planning/allocations', {
        horizon: 'week',
        period: '2026-W36',
        recordId: id,
        plannedHours: 2,
      })
      expect(made.status, JSON.stringify(made.body)).toBe(201)
    }

    const week = await app.inject({ method: 'GET', url: '/api/planning/week/2026-W36' })
    const body = JSON.parse(week.body) as {
      entries: { work: { workspaceId: string; title: string } | null }[]
      fit: { load: { plannedHours: number } }
    }
    expect(body.fit.load.plannedHours).toBe(6)
    // Each row says which project owns it. A week that spanned three and reported one would be the
    // merge this must not be.
    expect(body.entries.map((e) => e.work?.workspaceId).sort()).toEqual(['default', 'personal', 'robotics'])
  })

  it('is not a way to read another project — the reply carries only what the plan named', async () => {
    const workspaces = await import('../src/server/lib/workspaces.ts')
    workspaces.createWorkspace({ id: 'robotics', title: 'Robotics' })
    const named = task('The one thing planned', 'robotics', 2)
    task('A robotics secret nobody planned', 'robotics', 9)
    task('Another one', 'robotics')

    await post('/api/planning/allocations', {
      horizon: 'week',
      period: '2026-W36',
      recordId: named,
      plannedHours: 2,
    })

    const week = await app.inject({ method: 'GET', url: '/api/planning/week/2026-W36' })
    const body = JSON.parse(week.body) as { entries: { work: { id: string } | null }[] }
    // Exactly the record the plan pointed at, and nothing else from that project. Allocating time
    // to one robotics task must never become a way to list robotics.
    expect(body.entries.map((e) => e.work?.id)).toEqual([named])
  })
})

describe('a plan row is readable, which is a different thing from being correct', () => {
  it('calls a block by its own name, with its pipeline beside it rather than in front', async () => {
    // MEASURED ON 2026-08-12, dogfooding Mole Office's own campaign into its own week. A block's title
    // is qualified by its pipeline, so three blocks of one pipeline in one week came back as three
    // rows reading "Mole Office development campaign — waves 4A to 9, from 20…" and nothing else. The
    // plan was right and unusable.
    const pipeline = t.api.createRecord({
      workspaceId: 'default',
      kind: 'pipeline',
      title: 'Mole Office development campaign',
      data: { blockIds: [] },
      actor: AGENT,
    })
    const one = t.blocks.addBlock(pipeline.id, { name: 'Wave 5 — Planning MVP', state: 'doing' }, AGENT)
    const two = t.blocks.addBlock(pipeline.id, { name: 'Wave 6 — weekly review', state: 'todo' }, AGENT)

    for (const block of [one.block, two.block]) {
      const made = await post('/api/planning/allocations', {
        horizon: 'week',
        period: '2026-W36',
        recordId: block.id,
        plannedHours: 4,
      })
      expect(made.status, JSON.stringify(made.body)).toBe(201)
    }

    const week = await app.inject({ method: 'GET', url: '/api/planning/week/2026-W36' })
    const body = JSON.parse(week.body) as { entries: { work: { name: string; within: string | null; title: string } | null }[] }
    const names = body.entries.map((e) => e.work?.name)
    expect(names).toContain('Wave 5 — Planning MVP')
    expect(names).toContain('Wave 6 — weekly review')
    // Two rows of one pipeline must not read the same. This is the assertion, not the names.
    expect(new Set(names).size).toBe(2)
    // The pipeline is still said, beside rather than in front — read from the pipeline's own order
    // since a decision, because the block's title no longer carries it.
    expect(body.entries[0]?.work?.within).toBe('Mole Office development campaign')
    // And the canonical title is the block's own name, which is what to DRAW.
    expect(body.entries[0]?.work?.title).toBe(body.entries[0]?.work?.name)
  })

  it('keeps a name that contains the separator, and says which pipeline it is in', async () => {
    // THIS USED TO BE A TEST ABOUT TWO SPLITTERS DISAGREEING. A block's title carried its pipeline's,
    // so every reader had to cut the stored title, and two readers cut it in different places. There is nothing to cut
    // since a decision: the name is the title, and which pipeline it is in is read from that pipeline's own
    // order. A block whose own name contains a `›` was the case that exposed the disagreement,
    // so it is the case kept here.
    const pipeline = t.api.createRecord({
      workspaceId: 'default',
      kind: 'pipeline',
      title: 'Campaign',
      data: { blockIds: [] },
      actor: AGENT,
    })
    const made = t.blocks.addBlock(pipeline.id, { name: 'Wave 5 › Planning MVP', state: 'doing' }, AGENT)
    await post('/api/planning/allocations', {
      horizon: 'week',
      period: '2026-W36',
      recordId: made.block.id,
      plannedHours: 1,
    })

    const week = await app.inject({ method: 'GET', url: '/api/planning/week/2026-W36' })
    const body = JSON.parse(week.body) as { entries: { work: { name: string; within: string | null; title: string } | null }[] }
    const work = body.entries[0]?.work
    // THE WHOLE NAME, SEPARATOR AND ALL, because nothing cuts it any more.
    expect(work?.name).toBe('Wave 5 › Planning MVP')
    expect(work?.title).toBe('Wave 5 › Planning MVP')
    expect(work?.within).toBe('Campaign')
  })

  it('names the work the spread points at, even when this period allocates none of it', async () => {
    // MEASURED IN THE BROWSER, twice, by two agents: at the month horizon the "how much has reached
    // the finer periods" panel printed three rows reading like records called `PiQzVdq42ufa`. A month
    // usually has no allocations of its own, so no entry carried a name and the page had nothing else
    // to print. Raw ids where titles belong is the productization defect this whole round is about.
    const pipeline = t.api.createRecord({
      workspaceId: 'default',
      kind: 'pipeline',
      title: 'Campaign',
      data: { blockIds: [] },
      actor: AGENT,
    })
    const made = t.blocks.addBlock(pipeline.id, { name: 'Wave 5 — Planning MVP', state: 'doing' }, AGENT)
    // A week WHOLLY inside the month — 2026-W37 is 7 to 13 September — and nothing on the month
    // itself. 2026-W36 would straddle the boundary and `spreadOf` deliberately does not count a
    // period the month only partly contains.
    await post('/api/planning/allocations', {
      horizon: 'week',
      period: '2026-W37',
      recordId: made.block.id,
      plannedHours: 4,
    })

    const month = await app.inject({ method: 'GET', url: '/api/planning/month/2026-09' })
    const body = JSON.parse(month.body) as {
      entries: unknown[]
      spread: { recordId: string }[]
      alsoNamed: { id: string; name: string; workspaceId: string }[]
    }
    expect(body.entries, 'the month should allocate nothing itself, or this proves nothing').toHaveLength(0)
    expect(body.spread.map((r) => r.recordId)).toContain(made.block.id)
    const named = body.alsoNamed.find((w) => w.id === made.block.id)
    expect(named?.name, 'the spread row has no name to print but its id').toBe('Wave 5 — Planning MVP')
    expect(named?.workspaceId).toBe('default')
  })

  it('lets a period go back to nobody having said, which is not zero', async () => {
    // MEASURED BY AN INDEPENDENT REVIEWER: they typed a number into a week to see what the control
    // did and could not take it back. No browser control, no DELETE route, and `hours: null` refused
    // by the schema — rightly, because a capacity of null is not a capacity of nothing. So a number
    // typed by mistake was permanent, on the one field whose entire doctrine is that unknown must
    // stay reachable. Their stray row is still in the live corpus as I write this.
    const url = '/api/planning/capacity/week/2026-W36'
    await app.inject({ method: 'PUT', url, payload: { hours: 25, note: 'review week, light' } })
    expect(JSON.parse((await app.inject({ method: 'GET', url: '/api/planning/week/2026-W36' })).body).capacity.hours).toBe(25)

    const gone = await app.inject({ method: 'DELETE', url })
    expect(gone.statusCode).toBe(200)
    expect(JSON.parse(gone.body).removed).toBe(true)

    const after = JSON.parse((await app.inject({ method: 'GET', url: '/api/planning/week/2026-W36' })).body)
    // NULL, NOT ZERO, and the arithmetic that depends on it goes back to having no answer too.
    expect(after.capacity).toBeNull()
    expect(after.fit.capacityHours).toBeNull()
    expect(after.fit.freeHours).toBeNull()

    // And taking back what was never said writes nothing and says so, rather than reporting success.
    const again = await app.inject({ method: 'DELETE', url })
    expect(JSON.parse(again.body).removed).toBe(false)
    expect(String(JSON.parse(again.body).note)).toContain('nothing was written')
  })

  it('does not clear the capacity note when a caller says nothing about it', async () => {
    // MEASURED BY AN INDEPENDENT REVIEWER, on the live corpus: they typed 30 into a week that
    // already held 30, pressed the button, and "Mole Office development, this week" was gone. The
    // browser's control sent only a number and absence meant null, so every adjustment to a week's
    // hours silently deleted its label — and nothing in the UI could put it back.
    const put = (body: Record<string, unknown>) =>
      app.inject({
        method: 'PUT',
        url: '/api/planning/capacity/week/2026-W36',
        payload: body,
      })

    expect((await put({ hours: 30, note: 'Mole Office development, this week' })).statusCode).toBe(200)

    const same = JSON.parse((await put({ hours: 30 })).body) as { capacity: { note: string | null } }
    expect(same.capacity.note, 'a write that said nothing about the note deleted it').toBe(
      'Mole Office development, this week',
    )

    // And null still clears it, because a caller that ASKS to clear it must be able to.
    const cleared = JSON.parse((await put({ hours: 30, note: null })).body) as { capacity: { note: string | null } }
    expect(cleared.capacity.note).toBeNull()
  })

  it('leaves anything that is not a block alone', async () => {
    const id = task('An ordinary task with › in it, oddly')
    await post('/api/planning/allocations', { horizon: 'week', period: '2026-W36', recordId: id, plannedHours: 1 })
    const week = await app.inject({ method: 'GET', url: '/api/planning/week/2026-W36' })
    const body = JSON.parse(week.body) as { entries: { work: { name: string; within: string | null } | null }[] }
    // Only a block's title is qualified, so only a block is split. A task that happens to contain
    // the separator keeps its whole name.
    expect(body.entries[0]?.work?.name).toBe('An ordinary task with › in it, oddly')
    expect(body.entries[0]?.work?.within).toBeNull()
  })
})

describe('what a plan refuses', () => {
  it('refuses a period that is not a period, rather than storing one nothing can place', async () => {
    const id = task('Anything')
    const bad = await post('/api/planning/allocations', {
      horizon: 'week',
      period: '2026-W99',
      recordId: id,
      plannedHours: 1,
    })
    expect(bad.status).toBe(400)
    expect(String(bad.body['error'])).toContain('2026-W36')
  })

  it('refuses a key of the wrong horizon, which would make every total that read it wrong', async () => {
    const id = task('Anything')
    const bad = await post('/api/planning/allocations', {
      horizon: 'day',
      period: '2026-09',
      recordId: id,
      plannedHours: 1,
    })
    expect(bad.status).toBe(400)
    expect(String(bad.body['error'])).toContain('is a month')
  })

  it('refuses a container, naming why and what to allocate instead', async () => {
    const pipeline = t.api.createRecord({
      workspaceId: 'default',
      kind: 'pipeline',
      title: 'Transplant v2',
      data: { blockIds: [] },
      actor: AGENT,
    })
    const bad = await post('/api/planning/allocations', {
      horizon: 'week',
      period: '2026-W36',
      recordId: pipeline.id,
      plannedHours: 4,
    })
    expect(bad.status).toBe(400)
    // Allocating to a pipeline AND to its blocks is two totals with nothing able to say which
    // was meant, so the refusal explains rather than just listing the kinds.
    expect(String(bad.body['error'])).toContain('container')
  })

  it('refuses a second allocation for the same work in the same period', async () => {
    const id = task('Complete experiment')
    const first = await post('/api/planning/allocations', {
      horizon: 'day',
      period: '2026-09-07',
      recordId: id,
      plannedHours: 2,
    })
    expect(first.status).toBe(201)
    const second = await post('/api/planning/allocations', {
      horizon: 'day',
      period: '2026-09-07',
      recordId: id,
      plannedHours: 3,
    })
    // Two rows saying 2 and 3 hours is five hours by one reading and a correction by another.
    expect(second.status).toBe(409)
    const refusal = String(second.body['error'])
    // THE WAY OUT IS THE TWO PRESSES THAT DO IT, not `PATCH /api/planning/allocations/<id>`, which
    // is what this said until 2026-08-14 and is the one thing the person reading it cannot do.
    expect(refusal).toContain('Change the row it already has instead')
    expect(refusal).toContain('under Schedule')
    // CRITERION CHANGE (wave 13j round 12): it read 'press Edit'. The press is the Schedule's
    // primary press now, "Plan this day" on a dated day.
    expect(refusal).toContain('press "Plan this day"')
    expect(refusal).not.toContain('/api/')
    // AND THE ROW IS STILL NAMED, because id is identity and titles may repeat.
    expect(refusal).toContain(String((first.body['allocation'] as { id: string }).id))
  })

  it('refuses work that does not exist, and work that has been deleted', async () => {
    const missing = await post('/api/planning/allocations', {
      horizon: 'day',
      period: '2026-09-07',
      recordId: 'nothing-here',
      plannedHours: 1,
    })
    expect(missing.status).toBe(404)

    const id = task('Doomed')
    t.api.deleteRecord(id, AGENT)
    const deleted = await post('/api/planning/allocations', {
      horizon: 'day',
      period: '2026-09-07',
      recordId: id,
      plannedHours: 1,
    })
    expect(deleted.status).toBe(400)
    expect(String(deleted.body['error'])).toContain('deleted')
  })

  it('refuses more hours than a week has, because that is a typo and not a plan', async () => {
    const id = task('Anything')
    const bad = await post('/api/planning/allocations', {
      horizon: 'day',
      period: '2026-09-07',
      recordId: id,
      plannedHours: 800,
    })
    expect(bad.status).toBe(400)
  })
})

describe('an empty period is a different answer from a full one', () => {
  it('says nothing is planned rather than reporting zero hours as if that were a plan', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/planning/week/2026-W36' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { note: string; capacity: unknown; fit: { freeHours: number | null } }
    expect(body.note).toContain('Nothing is planned')
    // And it distinguishes "no plan" from "no capacity", which are different facts about a week.
    expect(body.capacity).toBeNull()
    expect(body.fit.freeHours).toBeNull()
  })

  it('says how many hours a period holds once somebody has said', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/planning/capacity/week/2026-W36',
      payload: { hours: 30, note: 'three teaching days' },
    })
    expect(put.statusCode).toBe(200)
    const res = await app.inject({ method: 'GET', url: '/api/planning/week/2026-W36' })
    const body = JSON.parse(res.body) as { capacity: { hours: number } | null; fit: { freeHours: number | null } }
    expect(body.capacity?.hours).toBe(30)
    expect(body.fit.freeHours).toBe(30)
  })
})

// ============================================================================ the note beside a total

/**
 * EVERY TOTAL THESE ROUTES SERVE HAS READ WHAT IS PLANNED INSIDE WHAT.
 *
 * `loadOf` takes the period's containment reading as a fourth argument and reports `null` — "nobody
 * looked" — when it is left out. Nothing passed it, so every total in the running product carried
 * that null: honest, and useless, because `null` and "no row sits inside another" are different
 * claims and only one of them is true of a period somebody has read.
 *
 * THE NUMBER MOVES WHEN THE READING SAYS IT SHOULD, and that is asserted before and after rather
 * than argued for. Since 16 August 2026 a piece of work and parts of it may both hold hours in one
 * period, and the period then costs the piece of work rather than the sum of the two rows. The rows
 * themselves are still reported, added up, as `rowHours`.
 *
 * `tests/planning-counted-twice.test.ts` proves the arithmetic in isolation. These tests prove the
 * routes ASK — which is the part that was missing, and the part nothing else would notice.
 */
describe('a period reply has read which of its rows sit inside which', () => {
  /**
   * A `part_of` ROW WRITTEN STRAIGHT INTO THE TABLE, for the same reason
   * `settleLinkBypassingTheGate` in helpers.ts exists: `createLink` now refuses a link that would
   * put two already-allocated records into an ancestor relationship inside one period, so this
   * state can no longer be MADE through any code path. It can still ARRIVE — rows written before
   * the rule existed are in the live corpus, and an archive restored tomorrow carries what it
   * carries — and reporting it is the whole reason the field exists.
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

  async function week(period = '2026-W36'): Promise<{
    fit: {
      load: {
        plannedHours: number
        rowHours: number
        allocations: number
        stated: number
        countedTwice: unknown
        envelopes: { trees: { recordId: string; assignedHours: number; notYetBrokenDownHours: number }[] } | null
      }
    }
    finer: { period: string; countedTwice: unknown }[] | null
  }> {
    const res = await app.inject({ method: 'GET', url: `/api/planning/week/${period}` })
    expect(res.statusCode, res.body).toBe(200)
    return JSON.parse(res.body) as never
  }

  it('says "no pair here" for an ordinary period, which is not the same as nobody looking', async () => {
    const id = task('Rewrite the table')
    await post('/api/planning/allocations', { horizon: 'week', period: '2026-W36', recordId: id, plannedHours: 4 })

    const load = (await week()).fit.load

    expect(load.countedTwice, 'the route did not read the period, so its total says nobody looked').not.toBeNull()
    expect((load.countedTwice as { pairs: unknown[] }).pairs).toEqual([])
    expect((load.countedTwice as { notChecked: unknown[] }).notChecked).toEqual([])
    expect((load.countedTwice as { horizon: string; period: string }).horizon).toBe('week')
    expect((load.countedTwice as { horizon: string; period: string }).period).toBe('2026-W36')
  })

  it('names both ends of a pair, and counts the piece of work holding them once', async () => {
    const whole = task('Replace the gripper')
    const part = task('Order the new fingers')
    // Both written while nothing says one is inside the other, so they start as two separate pieces
    // of work in one week.
    await post('/api/planning/allocations', { horizon: 'week', period: '2026-W36', recordId: whole, plannedHours: 3 })
    await post('/api/planning/allocations', { horizon: 'week', period: '2026-W36', recordId: part, plannedHours: 2 })

    const before = (await week()).fit.load
    expect(before.plannedHours).toBe(5)
    expect(before.rowHours).toBe(5)
    expect((before.countedTwice as { pairs: unknown[] }).pairs).toEqual([])

    storeContainmentRowDirectly(part, whole)
    const after = (await week()).fit.load

    // THE NUMBER MOVES, BECAUSE THE WEEK CHANGED MEANING. One of these rows is now a part of the
    // other, so the week holds three hours of work and not five. Until 16 August 2026 this write was
    // refused and this test asserted the total did not move; round five allows planning coarse first
    // and refining later, so the arithmetic reads the tree instead.
    expect(after.plannedHours).toBe(3)
    // AND NOTHING WAS TAKEN AWAY. Both rows are still there, and what they add up to is still
    // reported beside the total.
    expect(after.rowHours).toBe(5)
    expect(after.allocations).toBe(before.allocations)
    expect(after.stated).toBe(before.stated)
    expect(after.envelopes?.trees).toHaveLength(1)
    expect(after.envelopes?.trees[0]?.recordId).toBe(whole)
    expect(after.envelopes?.trees[0]?.assignedHours).toBe(2)
    expect(after.envelopes?.trees[0]?.notYetBrokenDownHours).toBe(1)
    // And beside it, the sentence: this row is a part of that one.
    const pairs = (after.countedTwice as { pairs: { outer: { id: string }; inner: { id: string } }[] }).pairs
    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.outer.id).toBe(whole)
    expect(pairs[0]?.inner.id).toBe(part)
  })

  it('reads each finer period for itself, so a month\'s weeks each carry their own answer', async () => {
    const id = task('Rewrite the table')
    await post('/api/planning/allocations', { horizon: 'week', period: '2026-W36', recordId: id, plannedHours: 4 })
    const res = await app.inject({ method: 'GET', url: '/api/planning/month/2026-09' })
    expect(res.statusCode, res.body).toBe(200)
    const body = JSON.parse(res.body) as { finer: { period: string; countedTwice: { period: string } | null }[] }

    expect(body.finer.length).toBeGreaterThan(0)
    for (const finer of body.finer) {
      expect(finer.countedTwice, `${finer.period} was totalled without being read`).not.toBeNull()
      // Its OWN period. `loadOf` throws when handed another period's reading, and this is what
      // would catch one reading being reused across all the weeks of a month.
      expect(finer.countedTwice?.period).toBe(finer.period)
    }
  })

  /**
   * WHAT GET /api SAYS ABOUT THESE ROUTES HAS TO BE TRUE OF THESE ROUTES.
   *
   * The endpoint list is built by walking the router, so a route can never be missing from it. The
   * SENTENCES are written by hand, and a sentence that no longer matches the route is a stale
   * document that reads like a contract. This checks the claims that changed in round five: a piece
   * of work and its parts may both hold hours here, and the period then costs the piece of work
   * rather than the sum.
   *
   * IT ALSO CHECKS THAT THE OLD PROMISE IS GONE. The note used to say `IT CHANGES NO NUMBER` about
   * the containment reading, and that promise is now false — the test above watches the same route
   * report three hours for two rows adding to five. A published note carrying it would be the
   * product telling an agent the opposite of what it does.
   */
  it('makes the claim GET /api makes about it', async () => {
    const { apiApp } = await import('./helpers.ts')
    const whole = await apiApp()
    try {
      await whole.app.ready()
      const { PLANNING_ROUTE_NOTE } = await import('../src/server/api/planning.ts')
      const index = await whole.app.inject({ method: 'GET', url: '/api' })
      expect(index.statusCode, index.body).toBe(200)
      const listed = (JSON.parse(index.body) as { endpoints: { method: string; path: string; description: string | null }[] })
        .endpoints.find((e) => e.method === 'GET' && e.path === '/api/planning/:horizon/:period')
      expect(listed?.description).toBe(PLANNING_ROUTE_NOTE)
      expect(PLANNING_ROUTE_NOTE).toContain(
        'A PIECE OF WORK AND THE PARTS OF IT MAY BOTH HOLD HOURS IN ONE PERIOD',
      )
      expect(PLANNING_ROUTE_NOTE).toContain('THE PERIOD THEN COSTS 15 AND NEVER 24')
      expect(
        PLANNING_ROUTE_NOTE,
        'the note still promises the containment reading changes no number, which the route no longer does',
      ).not.toContain('IT CHANGES NO NUMBER')

      // And the route does it. An empty period is the hardest case for the claim, because there is
      // nothing to read and "nothing to read" must still come back as a reading rather than a null.
      const res = await whole.app.inject({ method: 'GET', url: '/api/planning/week/2026-W36' })
      expect(res.statusCode, res.body).toBe(200)
      const body = JSON.parse(res.body) as { fit: { load: { countedTwice: unknown } } }
      expect(body.fit.load.countedTwice, 'GET /api says every total was read; this one was not').not.toBeNull()
    } finally {
      await whole.app.close()
    }
  })

  it('says it in a review of a past period too', async () => {
    const id = task('Rewrite the table')
    await post('/api/planning/allocations', { horizon: 'week', period: '2026-W36', recordId: id, plannedHours: 4 })
    const res = await app.inject({ method: 'GET', url: '/api/planning/review/week/2026-W36' })
    expect(res.statusCode, res.body).toBe(200)
    const body = JSON.parse(res.body) as { load: { plannedHours: number; countedTwice: unknown } }
    expect(body.load.plannedHours).toBe(4)
    expect(body.load.countedTwice, 'a review reported hours without reading the period').not.toBeNull()
  })
})

// ============================================================================ what waits on a person

/**
 * THE QUEUE OF HUMAN-ONLY ACTS, and the two ways an agent was able to move things on and off it.
 *
 * Both found by an independent reviewer executing them, not by reading. Writing a decision is
 * refused to agents and that guard held; the LINK that marks a fork settled was not guarded, and the
 * link is what resolution is derived from.
 */
describe('only the human can take a fork off the human queue', () => {
  async function needsYou(): Promise<{ actions: { recordId: string; blocking: number }[] }> {
    const { needsYouRoutes } = await import('../src/server/api/needs-you.ts')
    const app2 = Fastify()
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    installErrorHandling(app2)
    await app2.register(needsYouRoutes, { prefix: '/api' })
    await app2.ready()
    const res = await app2.inject({ method: 'GET', url: '/api/needs-you' })
    await app2.close()
    return JSON.parse(res.body) as { actions: { recordId: string; blocking: number }[] }
  }

  function fork(title: string): string {
    return t.api.createRecord({
      workspaceId: 'default',
      kind: 'proposal',
      title,
      data: {
        question: 'which way?',
        options: ['a — one way', 'b — the other'],
      // HANDED UP BY THE AGENT THAT FILED IT, which is what puts a fork on the owner's queue since
      // 3 September 2026: a fork an agent files says "an agent" unless the agent names somebody
      // else, because an engineering question is the agent's
      // (`design/messages/ACCEPTANCE.md` W3). Naming the owner here is the agent's own statement and it is
      // the case these tests are about.
      who_settles_it: 'the owner',
      },
      actor: AGENT,
    }).id
  }

  it('does not let an agent point an old decision at a fork and have it vanish', async () => {
    const id = fork('A fork nobody has settled')
    expect((await needsYou()).actions.map((a) => a.recordId)).toContain(id)

    // A decision the human really made, about something else entirely.
    const decision = t.api.createRecord({
      workspaceId: 'default',
      kind: 'decision',
      title: 'An old, unrelated decision about fonts',
      data: { because: 'it was' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })
    // An agent-made settling link, written straight into the tables because `assertMaySettleFork`
    // now refuses to make one — see the helper. This is the row that arrives from before the gate
    // existed or out of a restored archive, and the queue must go on refusing to read it as an
    // answer.
    settleLinkBypassingTheGate(t, {
      fromId: decision.id,
      toId: id,
      actorType: 'agent',
      actorId: AGENT.id,
    })

    // The fork is still the human's. Nobody decided anything.
    expect(
      (await needsYou()).actions.map((a) => a.recordId),
      'an agent linking an existing decision emptied the human queue',
    ).toContain(id)
  })

  it('takes it off when the human makes the link, which is what settling is', async () => {
    const id = fork('A fork the human settles')
    const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
    const decision = t.api.createRecord({
      workspaceId: 'default',
      kind: 'decision',
      title: 'What I decided',
      data: { because: 'this' },
      actor: HUMAN,
    })
    t.api.createLink({ fromId: decision.id, toId: id, type: 'derived_from', actor: HUMAN })
    expect((await needsYou()).actions.map((a) => a.recordId)).not.toContain(id)
  })

  it('stops counting work that has been deleted as work it is holding up', async () => {
    const id = fork('A fork holding something up')
    const blocked = task('The thing it was holding up')
    t.api.createLink({ fromId: id, toId: blocked, type: 'blocks', actor: AGENT })
    expect((await needsYou()).actions.find((a) => a.recordId === id)?.blocking).toBe(1)

    t.api.deleteRecord(blocked, AGENT)
    // `shared/attention.ts` already takes this view of a broken link: it is a fact about the
    // archive, not a piece of work. Two places computing the same thing must not disagree.
    expect(
      (await needsYou()).actions.find((a) => a.recordId === id)?.blocking,
      'a deleted record is still counted as work waiting on this fork',
    ).toBe(0)
  })
})
