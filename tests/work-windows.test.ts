// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old creation sweep covered ordinary kinds. It now explicitly rejects office-only sealed_tip from allocatable kinds; every existing scheduling assertion remains. */
/**
 * A WINDOW SAYS WHEN SOMEBODY MEANS TO WORK ON SOMETHING. IT NEVER SAYS HOW MUCH.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS FILE DEFENDS
 * ---------------------------------------------------------------------------------------
 *
 * A piece of work can be placed across a span without first working out how many hours belong on
 * each day. If a task is to be worked on from one Thursday to the next Wednesday, it is placed
 * across that span. The span means the work is meant to happen in that window, not that it fills
 * every hour of every day.
 *
 * So a window is a first day and a last day and nothing else. **It carries no hours and enters no
 * total.** `a window changes no number on the week it covers` is the load-bearing test here: it
 * fails the moment placing a span starts moving the arithmetic, which would be Mole Office claiming
 * somebody had committed time they never said.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH GROUP IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The first group is that rule. The second is what is stored and what is refused. The third is
 * moving, stretching and finishing one. The fourth is reading a board: overlap, not containment,
 * because a window that started last week is still on this week.
 *
 * EVERY DATE HERE IS WRITTEN OUT rather than computed from the clock, so a failure names a day this
 * file can be read against.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { WINDOW_STATES, windowDays } from '../src/shared/planning.ts'
import { AGENT, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

/** Monday 24 August 2026 to Sunday 30 August 2026 is the ISO week 2026-W35. */
const WEEK = '2026-W35'
const MONDAY = '2026-08-24'
const THURSDAY = '2026-08-27'
const SUNDAY = '2026-08-30'
/** The Wednesday of the week after, which is what makes the owner's span cross a week boundary. */
const NEXT_WEDNESDAY = '2026-09-02'

beforeAll(async () => {
  t = await freshDb()
  const { planningRoutes } = await import('../src/server/api/planning.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(planningRoutes, { prefix: '/api' })
  await app.ready()
}, 60_000)

/**
 * WINDOWS AND ALLOCATIONS ARE PERSON-LEVEL: one board holds every window, whatever project the work
 * lives in, and the week arithmetic reads every allocation. Every case measures a reading over the
 * whole office, so each case puts those two tables back as it found them instead of narrowing the
 * reading. A case's own records are then the only ones in it.
 */
afterEach(() => {
  t.client.sqlite.prepare('delete from work_windows').run()
  t.client.sqlite.prepare('delete from allocations').run()
})

afterAll(async () => {
  await app.close()
  t.close()
})

interface Reply {
  status: number
  body: Record<string, unknown>
}

const said = (reply: Reply): string => String(reply.body['message'] ?? reply.body['error'] ?? JSON.stringify(reply.body))

/** The three headers a write carries, exactly as lib/http.ts spells them. */
const HEADERS = {
  'x-mole-office-actor-type': AGENT.type,
  'x-mole-office-actor-id': AGENT.id,
  'x-mole-office-session': AGENT.sessionId,
}

/**
 * HOURS ARE THE PERSON'S, so an allocation is posted as the person and not as the agent.
 *
 * The window writes above stay the agent's. Problem pOTggQdXY6AZ closed the give-time and
 * allocations doors to an agent, so this test's allocation — which exists only to prove that
 * deleting a window leaves the hours alone — is now made by the person who owns the hours.
 */
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

async function post(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = HEADERS,
): Promise<Reply> {
  const res = await app.inject({ method: 'POST', url, payload, headers })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> }
}

async function patch(url: string, payload: Record<string, unknown>): Promise<Reply> {
  const res = await app.inject({ method: 'PATCH', url, payload, headers: HEADERS })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> }
}

async function del(url: string): Promise<Reply> {
  const res = await app.inject({ method: 'DELETE', url, headers: HEADERS })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> }
}

async function get(url: string): Promise<Reply> {
  const res = await app.inject({ method: 'GET', url })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> }
}

interface Window {
  id: string
  recordId: string
  startsOn: string
  endsOn: string
  note: string | null
  state: string
}

const windowOf = (reply: Reply): Window => reply.body['window'] as unknown as Window

const task = (title: string): string =>
  t.api.createRecord({ workspaceId: 'default', kind: 'task', title, data: { state: 'todo' }, actor: AGENT }).id

/** Place work across a span, and fail loudly rather than returning a half-made window. */
async function place(recordId: string, startsOn: string, endsOn: string, note?: string): Promise<Window> {
  const made = await post('/api/planning/windows', {
    recordId,
    startsOn,
    endsOn,
    ...(note === undefined ? {} : { note }),
  })
  if (made.status !== 201) throw new Error(`placing ${startsOn}..${endsOn} failed: ${said(made)}`)
  return windowOf(made)
}

// ==================================================== a window is not hours, and never becomes any

describe('a window says when, and nothing about how much', () => {
  it('changes no number on the week it covers', async () => {
    // THE LOAD-BEARING TEST OF THIS LAYER. Every number the week reports is read before the window
    // exists and again after it, and they have to be the same numbers.
    const gripper = task('Test gripper')
    const before = await get(`/api/planning/week/${WEEK}`)
    const fitBefore = JSON.stringify(before.body['fit'])

    await place(gripper, THURSDAY, NEXT_WEDNESDAY)

    const after = await get(`/api/planning/week/${WEEK}`)
    expect(JSON.stringify(after.body['fit']), 'placing a window moved the week arithmetic').toBe(fitBefore)
    expect(after.body['entries'], 'a window turned up among the week’s allocations').toEqual([])
    expect(String(after.body['note']), 'the week’s own sentence counts a window as something planned').toContain(
      'Nothing is planned',
    )
  })

  it('leaves the hours alone when it is taken off, and the window alone when hours are', async () => {
    const gripper = task('Test gripper')
    const window = await place(gripper, THURSDAY, NEXT_WEDNESDAY)
    const allocation = await post(
      '/api/planning/allocations',
      {
        horizon: 'week',
        period: WEEK,
        recordId: gripper,
        plannedHours: 6,
      },
      PERSON,
    )
    expect(allocation.status).toBe(201)

    // Deleting the window leaves the hours where they were: they were never part of it.
    expect((await del(`/api/planning/windows/${window.id}`)).status).toBe(200)
    const week = await get(`/api/planning/week/${WEEK}`)
    expect((week.body['fit'] as { load: { plannedHours: number } }).load.plannedHours).toBe(6)
  })

  it('says so in its own reply, so nobody reads a span as a commitment of time', async () => {
    const made = await post('/api/planning/windows', {
      recordId: task('Test gripper'),
      startsOn: THURSDAY,
      endsOn: NEXT_WEDNESDAY,
    })
    expect(said(made)).toContain('NO HOURS WERE WRITTEN')
  })
})

// ============================================================ what is stored and what is refused

describe('what a window stores', () => {
  it('keeps both days, and both of them are inside it', async () => {
    const window = await place(task('Test gripper'), THURSDAY, NEXT_WEDNESDAY)
    expect(window.startsOn).toBe(THURSDAY)
    expect(window.endsOn).toBe(NEXT_WEDNESDAY)
    // Thursday 27 August to Wednesday 2 September, both included, is seven days.
    expect(windowDays(window)).toBe(7)
    expect(window.state).toBe('planned')
  })

  it('crosses a week boundary, which is the whole reason it is two columns', async () => {
    // The owner's own example: this Thursday until next Wednesday. No period key can name that, so
    // an allocation's single `period` column could not hold it.
    const window = await place(task('Test gripper'), THURSDAY, NEXT_WEDNESDAY)
    expect(window.startsOn < SUNDAY && window.endsOn > SUNDAY).toBe(true)
  })

  it('records who wrote it, from the actor headers, like every other write', async () => {
    const window = await place(task('Test gripper'), MONDAY, THURSDAY)
    const row = t.client.sqlite.prepare('select created_by from work_windows where id = ?').get(window.id) as {
      created_by: string
    }
    expect(row.created_by).toBe(`${AGENT.type}:${AGENT.id}`)
  })

  it('carries a note that is there when the block is opened again', async () => {
    const note = 'Grip starts slipping above 15N; recalibrate before the next test.'
    const window = await place(task('Test gripper'), THURSDAY, NEXT_WEDNESDAY, note)
    expect(window.note).toBe(note)
    const board = await get(`/api/planning/windows?from=${MONDAY}&to=${SUNDAY}`)
    const rows = board.body['windows'] as { window: Window; work: { name: string } | null }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.window.note).toBe(note)
    expect(rows[0]?.work?.name).toBe('Test gripper')
  })

  it('allows several windows on one piece of work, and lets them overlap', async () => {
    // Two spans are two facts. Two rows of hours in one period are not, which is why THAT is refused
    // and this is not.
    const gripper = task('Test gripper')
    await place(gripper, MONDAY, THURSDAY)
    const second = await post('/api/planning/windows', {
      recordId: gripper,
      startsOn: THURSDAY,
      endsOn: NEXT_WEDNESDAY,
    })
    expect(second.status, said(second)).toBe(201)
  })
})

describe('what a window refuses, naming what is wrong', () => {
  it('refuses an end before the start, and names both days', async () => {
    const refused = await post('/api/planning/windows', {
      recordId: task('Test gripper'),
      startsOn: NEXT_WEDNESDAY,
      endsOn: THURSDAY,
    })
    expect(refused.status).toBe(400)
    expect(said(refused)).toContain(NEXT_WEDNESDAY)
    expect(said(refused)).toContain(THURSDAY)
  })

  it('refuses a week key or a month key, and says a window is two days', async () => {
    for (const notADay of [WEEK, '2026-08', '2026-02-30', 'next week']) {
      const refused = await post('/api/planning/windows', {
        recordId: task(`Test gripper ${notADay}`),
        startsOn: notADay,
        endsOn: SUNDAY,
      })
      expect(refused.status, notADay).toBe(400)
      expect(said(refused), notADay).toContain('2026-09-07')
    }
  })

  it('refuses work that is not there, and work that has been deleted', async () => {
    const missing = await post('/api/planning/windows', {
      recordId: 'nothing-has-this-id',
      startsOn: MONDAY,
      endsOn: THURSDAY,
    })
    expect(missing.status).toBe(404)

    const gone = task('Deleted work')
    t.api.deleteRecord(gone, AGENT)
    const refused = await post('/api/planning/windows', { recordId: gone, startsOn: MONDAY, endsOn: THURSDAY })
    expect(refused.status).toBe(400)
    expect(said(refused)).toContain('deleted')
  })

  it('takes exactly the kinds an allocation takes, read from the one declaration', async () => {
    // NOT A SECOND LIST. The schedule's vocabulary of what can be placed is `ALLOCATABLE_KINDS` in
    // lib/planning.ts, which reads shared/work.ts. This test is what stops the two drifting: adding
    // a kind to one and not the other fails here rather than being found on a screen.
    const { ALLOCATABLE_KINDS } = await import('../src/server/lib/planning.ts')
    const { RECORD_KINDS } = await import('../src/shared/types.ts')

    // A block is filed through its pipeline and cannot be made on its own, so it is made the way the
    // product makes one. Everything else is an ordinary record.
    const pipeline = t.api.createRecord({
      workspaceId: 'default',
      kind: 'pipeline',
      title: 'A pipeline for the board',
      data: {},
      actor: AGENT,
    })

    const accepted: string[] = []
    for (const kind of RECORD_KINDS) {
      // A FLOW RUN is written by the office beside a run and by nothing else (wave 13p round 25).
      // A CHECKLIST is written only through its own doors at /api/checklists (w13n round 46).
      // A BOOKING only through its own at /api/bookings (w13s round 29).
      // A SECRETARY'S DUTIES name a live secretary and rest on the person's decisions, which this board has neither of
      // (w13s round 92). A plan gives them no hours.
      // AN EMERGENCY PUSH only through its two doors at /api/merge-queue/emergency-pushes (w13u round 82).
      // A HOST JOB only through its own doors at /api/host-jobs.
      // A PROJECT CHAPTER only through its own doors at /api/office-regulations/projects/current/chapters, and A DESIGN
      // REVIEW only through its own at /api/designs/<id>/reviews (wave 13s round 226).
      // A DESIGN REMINDER is written by the office before a seal and judged only at /api/design-reminders/<id>/judgement
      // (wave 13s round 228).
      if (kind === 'sealed_tip' || kind === 'merge_entry' || kind === 'counter' || kind === 'flow_run' || kind === 'checklist' || kind === 'booking' || kind === 'notice_rules' || kind === 'secretary_duties' || kind === 'emergency_push' || kind === 'host_job' || kind === 'project_chapter' || kind === 'design_review' || kind === 'design_reminder') { expect(ALLOCATABLE_KINDS).not.toContain(kind); continue }
      // TWO KINDS CANNOT BE FILED ON THEIR OWN and both are the product refusing rather than an
      // exception this test makes. A block's title and position live on its pipeline; a
      // `ran_instead` record's canonical method and its restriction's target both live on its
      // step. Each is filed the way its own route files one.
      const id =
        kind === 'block'
          ? t.blocks.addBlock(pipeline.id, { name: `A block for the board`, state: 'todo' }, AGENT).block.id
          : kind === 'ran_instead'
            ? (() => {
                const step = t.blocks.addBlock(
                  pipeline.id,
                  { name: `A step for the board`, state: 'todo' },
                  AGENT,
                ).block
                t.api.patchRecord(step.id, { dataPatch: { method: 'the canonical method' } }, AGENT)
                return t.api.fileRanInstead(
                  step.id,
                  {
                    ran: 'something else',
                    because: 'the canonical method would not run',
                    since: '2026-08-30',
                    allowed_uses: ['downstream plumbing'],
                    disallowed_claims: ['that the canonical method works'],
                    severity: 'limits_claims',
                  },
                  AGENT,
                ).record.id
              })()
          : t.api.createRecord({
              workspaceId: 'default',
              kind,
              title: `A ${kind} for the board`,
              // EMPTY EXCEPT FOR A MESSAGE, which names who it is to: since 4 September 2026 a
              // message that names nobody and points at nothing is refused, and this loop is about
              // which kinds the schedule accepts. An incident is the one other kind whose door
              // refuses an empty create — I1 refuses one with no loss and no timeline — so it gets
              // the least that passes its door, and the loop still tests the schedule, not the kind.
              data:
                kind === 'message'
                  ? { to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }] }
                  : kind === 'incident'
                    ? { loss: 'A loss for the board.', timeline: [{ id: 'm-1', at: 'now', who: 'the board', what: 'Something happened.', evidence: 'ev-placeholder' }] }
                    : {},
              // A HUMAN, because a `decision` is a kind only a person may file, and this loop is
              // about which kinds the schedule accepts rather than about who may write them.
              actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, sessionId: 'sess-test' },
            }).id
      const made = await post('/api/planning/windows', {
        recordId: id,
        startsOn: MONDAY,
        endsOn: THURSDAY,
      })
      if (made.status === 201) accepted.push(kind)
      else expect(said(made), kind).toContain('not one of the kinds it can')
    }
    expect(accepted.sort()).toEqual([...ALLOCATABLE_KINDS].sort())
  })
})

// ============================================================ moving, stretching and finishing

describe('moving a window, stretching it, and saying what became of it', () => {
  it('moves to another week when both days are sent', async () => {
    const window = await place(task('Test gripper'), MONDAY, THURSDAY)
    const moved = await patch(`/api/planning/windows/${window.id}`, {
      startsOn: '2026-08-31',
      endsOn: '2026-09-03',
    })
    expect(moved.status, said(moved)).toBe(200)
    expect(windowOf(moved).startsOn).toBe('2026-08-31')
    expect(windowOf(moved).endsOn).toBe('2026-09-03')
  })

  it('stretches when one day is sent, and keeps the other end where it was', async () => {
    const window = await place(task('Test gripper'), MONDAY, THURSDAY)
    const stretched = await patch(`/api/planning/windows/${window.id}`, { endsOn: NEXT_WEDNESDAY })
    expect(stretched.status, said(stretched)).toBe(200)
    expect(windowOf(stretched).startsOn).toBe(MONDAY)
    expect(windowOf(stretched).endsOn).toBe(NEXT_WEDNESDAY)
  })

  it('refuses a stretch that would drag one end past the other, naming both', async () => {
    // ONE FIELD ARRIVED AND TWO ARE CHECKED. A patch that only looked at what was sent would accept
    // this and store a window running backwards.
    const window = await place(task('Test gripper'), THURSDAY, NEXT_WEDNESDAY)
    const refused = await patch(`/api/planning/windows/${window.id}`, { endsOn: MONDAY })
    expect(refused.status).toBe(400)
    expect(said(refused)).toContain(THURSDAY)
    expect(said(refused)).toContain(MONDAY)
    // And nothing was written: the window is where it was.
    const still = await get(`/api/planning/windows?from=${MONDAY}&to=${NEXT_WEDNESDAY}`)
    const rows = still.body['windows'] as { window: Window }[]
    expect(rows[0]?.window.endsOn).toBe(NEXT_WEDNESDAY)
  })

  it('writes a note onto a window that had none', async () => {
    const window = await place(task('Test gripper'), MONDAY, THURSDAY)
    const noted = await patch(`/api/planning/windows/${window.id}`, {
      note: 'Grip starts slipping above 15N; recalibrate before the next test.',
    })
    expect(windowOf(noted).note).toContain('15N')
  })

  it('completes THE WINDOW and never the work it names', async () => {
    const gripper = task('Test gripper')
    const window = await place(gripper, MONDAY, THURSDAY)
    const done = await patch(`/api/planning/windows/${window.id}`, { state: 'done' })
    expect(windowOf(done).state).toBe('done')
    expect(said(done)).toContain('THIS WINDOW')
    // The record still says what it said. Completing a span never completed the work.
    expect(t.api.getRecord(gripper)?.data['state']).toBe('todo')
  })

  it('refuses a state that is not one of the three, and names them', async () => {
    const window = await place(task('Test gripper'), MONDAY, THURSDAY)
    const refused = await patch(`/api/planning/windows/${window.id}`, { state: 'finished' })
    expect(refused.status).toBe(400)
    for (const state of WINDOW_STATES) expect(said(refused)).toContain(state)
  })

  it('refuses a patch that says nothing', async () => {
    const window = await place(task('Test gripper'), MONDAY, THURSDAY)
    const refused = await patch(`/api/planning/windows/${window.id}`, {})
    expect(refused.status).toBe(400)
  })

  it('answers 404 for a window that is not there, on patch and on delete', async () => {
    expect((await patch('/api/planning/windows/nope', { state: 'done' })).status).toBe(404)
    expect((await del('/api/planning/windows/nope')).status).toBe(404)
  })
})

// ============================================================ reading a board

describe('the board asks for a span of days and gets what overlaps it', () => {
  it('includes a window that started before the span and one that ends after it', async () => {
    // OVERLAP, NOT CONTAINMENT. A board that only showed windows starting inside its own days would
    // lose exactly the spans this table exists for.
    const gripper = task('Test gripper')
    const arm = task('Rebuild arm mount')
    const paper = task('Write the paper')
    await place(gripper, '2026-08-20', THURSDAY) // starts before the week, ends inside it
    await place(arm, THURSDAY, NEXT_WEDNESDAY) // starts inside, ends after
    await place(paper, '2026-09-14', '2026-09-18') // nowhere near

    const board = await get(`/api/planning/windows?from=${MONDAY}&to=${SUNDAY}`)
    const rows = board.body['windows'] as { window: Window; work: { name: string } | null }[]
    expect(rows.map((r) => r.work?.name).sort()).toEqual(['Rebuild arm mount', 'Test gripper'])
  })

  it('says plainly when nothing is placed, rather than answering with an empty list alone', async () => {
    const board = await get(`/api/planning/windows?from=${MONDAY}&to=${SUNDAY}`)
    expect(board.body['windows']).toEqual([])
    expect(String(board.body['note'])).toContain('Nothing is placed')
  })

  it('refuses a span that is not two days, and a span that runs backwards', async () => {
    expect((await get(`/api/planning/windows?from=${WEEK}&to=${SUNDAY}`)).status).toBe(400)
    expect((await get(`/api/planning/windows?from=${SUNDAY}&to=${MONDAY}`)).status).toBe(400)
  })

  it('names the work in whatever project it lives in, and says which project that is', async () => {
    // A window is person-level, like an allocation: one board holds work from every project. The
    // record stays where it is and the reply says which project owns it.
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'robotics', title: 'Robotics' })
    const arm = t.api.createRecord({
      workspaceId: 'robotics',
      kind: 'task',
      title: 'Rebuild arm mount',
      data: { state: 'todo' },
      actor: AGENT,
    }).id
    await place(arm, MONDAY, THURSDAY)
    const board = await get(`/api/planning/windows?from=${MONDAY}&to=${SUNDAY}`)
    const rows = board.body['windows'] as { work: { workspaceId: string } | null }[]
    expect(rows[0]?.work?.workspaceId).toBe('robotics')
  })
})
