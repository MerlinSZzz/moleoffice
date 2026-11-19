// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PERSON WROTE ABOUT TIME IS KEPT, AND ONLY WHAT WAS COMMITTED IS COUNTED.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS FILE DEFENDS
 * ---------------------------------------------------------------------------------------
 *
 * The owner set it on 16 August 2026: humans express intent, agents and parsers translate it, and
 * Mole Office validates and commits it. A person may write `probably 15h this week` and Mole Office must keep
 * those words rather than refuse them for not being canonical.
 *
 * The dangerous half is the other one. **Nothing but a committed intent ever enters arithmetic.** A
 * kept intent adds to no week, uses no capacity and counts as no work planned. A surface that added
 * it into a total would be claiming an interpretation had happened when it had not, which is
 * invariant 5 of USER.md broken with extra steps.
 *
 * `a kept intent adds nothing to the week it names` is the load-bearing test of this layer. It fails
 * the moment writing words starts moving a number.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH TEST HERE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The first group is the arithmetic gate. The second is what is kept and what is read from it. The
 * third is committing, which is the only door into a canonical row and is the SAME door every other
 * write uses: the same kinds, the same period check, the same one-row-per-record-per-period rule.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
// Type-free of any database: shared/planning.ts is pure, and this is the product's own week reader
// rather than a second one written here. "This week" is a fact about the day the test runs on.
import { weekKey } from '../src/shared/planning.ts'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

let t: TestDb
let app: FastifyInstance

const WEEK = '2026-W36'

/**
 * WHAT THE OFFICE ALREADY HELD WHEN THIS CASE BEGAN.
 *
 * The week's arithmetic, the allocation table and the list of intents are each read over the whole
 * office, on purpose. A shared office holds the rows cases before this one filed, so each case reads
 * these once before it writes and compares the reading after with it.
 */
let loadAtStart: { allocations: number; plannedHours: number; freeHours: number | null; entries: number }
let rowsAtStart = 0
let intentsAtStart = { kept: 0, offered: 0 }

beforeAll(async () => {
  t = await freshDb()
  const { planningRoutes } = await import('../src/server/api/planning.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(planningRoutes, { prefix: '/api' })
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  rowsAtStart = allocationRows()
  loadAtStart = await week()
  const list = await get('/api/planning/intents')
  intentsAtStart = list.body['counts'] as { kept: number; offered: number }
})

interface Reply {
  status: number
  body: Record<string, unknown>
}

const said = (reply: Reply): string => String(reply.body['message'] ?? reply.body['error'] ?? JSON.stringify(reply.body))

/**
 * THE PERSON, SAYING SO, ON EVERY WRITE THIS FILE MAKES — as the browser does on every request.
 *
 * Committing an intent is a governance act from 25 August 2026: it writes hours into the one table
 * arithmetic reads, and `assertMayCommitAnIntent` refuses it to an agent AND to a request that sent
 * no actor headers at all, on owner decision §36's reasoning that an absent header is not evidence
 * that a person made the act. The apply route beside it has refused the same two since before this.
 * These injections used to send no headers, so they were the second case.
 */
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

async function post(url: string, payload?: Record<string, unknown>): Promise<Reply> {
  const res = await app.inject({
    method: 'POST',
    url,
    headers: PERSON,
    ...(payload === undefined ? {} : { payload }),
  })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> }
}

async function get(url: string): Promise<Reply> {
  const res = await app.inject({ method: 'GET', url })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> }
}

const task = (title: string): string =>
  t.api.createRecord({ workspaceId: 'default', kind: 'task', title, data: { state: 'todo' }, actor: AGENT }).id

interface Intent {
  id: string
  said: string
  state: string
  period: string | null
  horizon: string | null
  hours: number | null
  recordId: string | null
  planLineId: string | null
}

const intentIn = (reply: Reply): Intent => reply.body['intent'] as Intent

/** What the week's own reply says about itself: the arithmetic, and how many rows it counted. */
async function week(): Promise<{
  allocations: number
  plannedHours: number
  freeHours: number | null
  entries: number
}> {
  const reply = await get(`/api/planning/week/${WEEK}`)
  const body = reply.body as unknown as {
    entries: unknown[]
    fit: { freeHours: number | null; load: { allocations: number; plannedHours: number } }
  }
  return {
    allocations: body.fit.load.allocations,
    plannedHours: body.fit.load.plannedHours,
    freeHours: body.fit.freeHours,
    entries: body.entries.length,
  }
}

/** Rows in the allocations table, read straight from SQLite. Nothing can hide behind a reply here. */
const allocationRows = (): number =>
  (t.client.sqlite.prepare('SELECT count(*) AS n FROM allocations').get() as { n: number }).n

// ============================================================ the arithmetic gate

describe('nothing but a committed intent ever enters arithmetic', () => {
  it('a kept intent adds nothing to the week it names', async () => {
    // THE LOAD-BEARING TEST. These words name a week and a number of hours, and they are only words.
    const work = task('Baseline')
    await app.inject({
      method: 'PUT',
      url: `/api/planning/capacity/week/${WEEK}`,
      payload: { hours: 20 },
    })

    const made = await post('/api/planning/intents', { said: 'probably 15h this week', recordId: work })
    expect(made.status, said(made)).toBe(201)
    expect(intentIn(made).state).toBe('kept')

    const after = await week()
    expect(after.allocations - loadAtStart.allocations).toBe(0)
    expect(after.plannedHours - loadAtStart.plannedHours).toBe(0)
    expect(after.entries - loadAtStart.entries).toBe(0)
    // AND CAPACITY IS UNTOUCHED. A week that looked 15 hours fuller because somebody wrote a
    // sentence would be the interpretation happening behind their back. The 20 hours this case gave the
    // week, less what cases before it planned there, which the lines above say this intent left alone.
    expect(after.freeHours).toBe(20 - loadAtStart.plannedHours)
    expect(allocationRows() - rowsAtStart).toBe(0)
  })

  it('an offered intent adds nothing either, because an offer is not a commitment', async () => {
    const work = task('Baseline')
    const made = await post('/api/planning/intents', { said: '5h this week', recordId: work })
    expect(made.status, said(made)).toBe(201)
    // It read cleanly, so there is something to accept — and accepting is a separate act.
    expect(intentIn(made).state).toBe('offered')
    expect(intentIn(made).hours).toBe(5)

    const after = await week()
    expect(after.plannedHours - loadAtStart.plannedHours).toBe(0)
    expect(after.allocations - loadAtStart.allocations).toBe(0)
    expect(allocationRows() - rowsAtStart).toBe(0)
  })
})

// ============================================================ what is kept, and what is read

describe('the words are kept exactly, and an interpretation is offered only when it is honest', () => {
  it('keeps a phrase nobody can read as a date, and says nothing has been scheduled', async () => {
    const made = await post('/api/planning/intents', { said: 'sometime next week' })
    expect(made.status, said(made)).toBe(201)
    const intent = intentIn(made)
    expect(intent.state).toBe('kept')
    expect(intent.period).toBeNull()
    expect(intent.horizon).toBeNull()
    expect(String(made.body['interpretation'])).toContain('Nothing has been scheduled')
    // AND IT SAYS WHICH WORD STOPPED IT, so the person can correct their own sentence.
    expect(String(made.body['interpretation'])).toContain('sometime')
  })

  it('stores what was typed, character for character', async () => {
    const typed = '  Around 5h,  Tuesday AFTERNOON if I can  '
    const made = await post('/api/planning/intents', { said: typed })
    expect(intentIn(made).said).toBe(typed)
    const back = await get(`/api/planning/intents/${intentIn(made).id}`)
    expect((back.body['intent'] as Intent).said).toBe(typed)
  })

  it('belongs to a plan line that has not been filed as work', async () => {
    // THE CASE THE NULLABLE COLUMN IS FOR. A person writes time on a line before it is real work.
    const { createPlan } = await import('../src/server/lib/plans.ts')
    const written = createPlan({ title: 'This week', body: '- Build the controller' }, AGENT)
    const line = written.lines[0]
    expect(line?.recordId ?? null).toBeNull()

    const made = await post('/api/planning/intents', { said: '15h this week', planLineId: line?.id })
    expect(made.status, said(made)).toBe(201)
    expect(intentIn(made).planLineId).toBe(line?.id)
    expect(intentIn(made).recordId).toBeNull()
    expect(intentIn(made).period).toBe(weekKey(new Date()))
    expect(intentIn(made).hours).toBe(15)
    // AND IT IS STILL ONLY WORDS. A line that is not work has nothing for hours to point at.
    const refused = await post(`/api/planning/intents/${intentIn(made).id}/commit`)
    expect(refused.status, said(refused)).toBe(409)
    expect(allocationRows() - rowsAtStart).toBe(0)
  })

  it('takes the canonical form from anybody who wants to speak it', async () => {
    const work = task('Baseline')
    const made = await post('/api/planning/intents', { said: 'the week after the demo', recordId: work, period: WEEK, hours: 3 })
    expect(made.status, said(made)).toBe(201)
    expect(intentIn(made).period).toBe(WEEK)
    expect(intentIn(made).horizon).toBe('week')
    expect(intentIn(made).hours).toBe(3)
    // The words are still the words. The canonical form did not replace them.
    expect(intentIn(made).said).toBe('the week after the demo')
  })

  it('refuses a period nothing can place on a calendar, because that column is strict', async () => {
    const work = task('Baseline')
    const made = await post('/api/planning/intents', { said: 'week 99', recordId: work, period: '2026-W99' })
    expect(made.status, said(made)).toBe(400)
    expect(said(made)).toContain('2026-W36')
  })

  it('lists what is waiting and says plainly that none of it is in a total', async () => {
    const work = task('Baseline')
    await post('/api/planning/intents', { said: 'sometime next week', recordId: work })
    await post('/api/planning/intents', { said: '5h this week', recordId: work })
    const list = await get('/api/planning/intents')
    const counts = list.body['counts'] as { kept: number; offered: number }
    expect(counts.kept - intentsAtStart.kept).toBe(1)
    expect(counts.offered - intentsAtStart.offered).toBe(1)
    expect(String(list.body['note'])).toContain('ONLY THE COMMITTED ONES ARE IN ANY TOTAL')
  })
})

// ============================================================ committing

describe('committing is the one door, and it is the door every allocation goes through', () => {
  it('moves the number, and only then', async () => {
    const work = task('Baseline')
    const made = await post('/api/planning/intents', { said: `5h ${WEEK}`, recordId: work })
    expect(intentIn(made).state).toBe('offered')
    expect((await week()).plannedHours - loadAtStart.plannedHours).toBe(0)

    const done = await post(`/api/planning/intents/${intentIn(made).id}/commit`)
    expect(done.status, said(done)).toBe(201)
    expect((done.body['intent'] as Intent).state).toBe('committed')

    const after = await week()
    expect(after.plannedHours - loadAtStart.plannedHours).toBe(5)
    expect(after.allocations - loadAtStart.allocations).toBe(1)
    expect(allocationRows() - rowsAtStart).toBe(1)
    // The words are still there beside the hours, which is the whole point of keeping them.
    const back = await get(`/api/planning/intents/${intentIn(made).id}`)
    expect((back.body['intent'] as Intent).said).toBe(`5h ${WEEK}`)
  })

  it('refuses to commit words it could not read, and keeps them', async () => {
    const work = task('Baseline')
    const made = await post('/api/planning/intents', { said: 'sometime next week', recordId: work })
    const refused = await post(`/api/planning/intents/${intentIn(made).id}/commit`)
    expect(refused.status, said(refused)).toBe(409)
    expect(said(refused)).toContain('read no period')
    expect(said(refused)).toContain('kept')
    expect(allocationRows() - rowsAtStart).toBe(0)
    // AND THE INTENT IS UNCHANGED. A refusal that had quietly moved it on would be worse than one
    // that refused.
    const back = await get(`/api/planning/intents/${intentIn(made).id}`)
    expect((back.body['intent'] as Intent).state).toBe('kept')
  })

  it('refuses to commit an intent that names no work, because the hours would point at nothing', async () => {
    const made = await post('/api/planning/intents', { said: `5h ${WEEK}` })
    const refused = await post(`/api/planning/intents/${intentIn(made).id}/commit`)
    expect(refused.status, said(refused)).toBe(409)
    expect(said(refused)).toContain('filed as work')
    expect(allocationRows() - rowsAtStart).toBe(0)
  })

  it('runs the same kind check every allocation runs', async () => {
    // A plan gives time to work, and a note is not work. The intent is keepable; committing it is
    // not, and the refusal is the one `createAllocation` has always given.
    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Some thinking', actor: AGENT }).id
    const made = await post('/api/planning/intents', { said: `5h ${WEEK}`, recordId: note })
    expect(made.status, said(made)).toBe(201)
    const refused = await post(`/api/planning/intents/${intentIn(made).id}/commit`)
    expect(refused.status, said(refused)).toBe(400)
    expect(said(refused)).toContain('A plan gives time to work')
    expect(allocationRows() - rowsAtStart).toBe(0)
  })

  it('refuses a second commit rather than writing the hours twice', async () => {
    const work = task('Baseline')
    const made = await post('/api/planning/intents', { said: `5h ${WEEK}`, recordId: work })
    expect((await post(`/api/planning/intents/${intentIn(made).id}/commit`)).status).toBe(201)
    const again = await post(`/api/planning/intents/${intentIn(made).id}/commit`)
    expect(again.status, said(again)).toBe(409)
    expect(said(again)).toContain('already been committed')
    expect(allocationRows() - rowsAtStart).toBe(1)
  })
})
