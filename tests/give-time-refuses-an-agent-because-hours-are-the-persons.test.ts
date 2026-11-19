// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOURS ARE THE PERSON'S ON EVERY DOOR, NOT JUST THE INTENT DOOR.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE WAS WRITTEN RED AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * Problem pOTggQdXY6AZ, filed by an agent on 15 September 2026. `POST
 * /api/plans/:id/lines/:lineId/give-time` reached `createAllocation` with no actor-type check,
 * so a request carrying `x-mole-office-actor-type: agent` wrote hours onto the owner's calendar
 * through the plan's own door. The same act was refused 403 on the intent door, because
 * `commitIntent` calls `assertMayCommitAnIntent`. One rule, two doors, and only one door carried
 * it. The measurement was a reading of the code path; this file is the run that proves it.
 *
 * It was run against the unfixed tree first and the give-time case answered 201 and wrote the
 * row. `createAllocation` now calls `assertMayCommitTheHours` — the same sentence
 * `assertMayCommitAnIntent` speaks — so every path that writes an allocation carries the clause.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. The give-time door refuses an agent, in the existing sentence, and writes no row.
 *   2. The give-time door still accepts the person, so the guard is not "refuse everybody".
 *   3. `POST /api/planning/allocations` — the other door into the same table — carries the same
 *      sentence and refuses the same act.
 *   4. Filing a line as work whose own words already read as time does not schedule the hours for
 *      an agent: the filing (a write an agent may make) happens, the allocation does not, and the
 *      reply says why.
 *
 * `tests/an-agent-cannot-schedule-the-owners-week.test.ts` covers the intent-commit door itself.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { BuiltServer } from '../src/server/index.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: BuiltServer['app']

/** The owner, as the browser sends the owner on every request. */
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
/** An agent, saying so. */
const AN_AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'g5-agentplans' }

beforeAll(async () => {
  t = await freshDb()
  const { apiApp } = await import('./helpers.ts')
  app = (await apiApp()).app
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  // THE ALLOCATIONS TABLE STARTS EMPTY, as it did when each case made its own database. Every case
  // here counts the rows in it, and the hours one case schedules are not this case's.
  t.client.sqlite.prepare('DELETE FROM allocations').run()
})

type Json = Record<string, unknown>
const bodyOf = (res: { body: string }): Json => JSON.parse(res.body) as Json

/** Rows in the allocations table, read straight from SQLite. Nothing hides behind a reply. */
const allocationRows = (): number =>
  (t.client.sqlite.prepare('SELECT count(*) AS n FROM allocations').get() as { n: number }).n

/** A plan with one line, filed as work, so hours have a record to name. */
async function planWithFiledLine(): Promise<{ planId: string; lineId: string; recordId: string }> {
  const made = await app.inject({ method: 'POST', url: '/api/plans', payload: { title: 'A plan of hours' } })
  expect(made.statusCode, made.body).toBe(201)
  const planId = (bodyOf(made)['plan'] as { id: string }).id

  const line = await app.inject({
    method: 'POST',
    url: `/api/plans/${planId}/lines`,
    payload: { text: '- build the controller', reason: 'the fixture needs a line to file' },
  })
  expect(line.statusCode, line.body).toBe(201)
  const lineId = (bodyOf(line)['line'] as { id: string }).id

  const filed = await app.inject({
    method: 'POST',
    url: `/api/plans/${planId}/lines/${lineId}/file-as-work`,
    payload: { kind: 'task', workspaceId: 'default' },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  return { planId, lineId, recordId: bodyOf(filed)['recordId'] as string }
}

/** A task any door may name, made by the test itself. */
function aTask(title: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'task',
    title,
    data: { state: 'todo' },
    actor: { type: 'agent', id: 'g5-agentplans' },
  }).id
}

describe('the plan give-time door', () => {
  it('refuses an agent in the intent door’s own sentence, and writes no hours', async () => {
    const { planId, lineId } = await planWithFiledLine()

    const refused = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/lines/${lineId}/give-time`,
      payload: { horizon: 'week', period: '2026-W36', plannedHours: 4 },
      headers: AN_AGENT,
    })
    expect(refused.statusCode, refused.body).toBe(403)
    const said = String(bodyOf(refused)['error'])
    // THE SENTENCE `assertMayCommitAnIntent` ALREADY SPEAKS, not a second one written here.
    expect(said).toContain('Turning words about time into hours on the calendar is the person’s own act')
    expect(said).toContain('g5-agentplans')
    // The way out an agent can actually take, and where the person does it instead.
    expect(said).toContain('POST /api/planning/intents')
    expect(said).toContain('Give it that time')
    // AND NOTHING WAS WRITTEN. A 403 that wrote the row anyway would be worse than no guard.
    expect(allocationRows()).toBe(0)
  })

  it('still accepts the person, so the guard is not a refusal of everybody', async () => {
    const { planId, lineId } = await planWithFiledLine()

    const made = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/lines/${lineId}/give-time`,
      payload: { horizon: 'week', period: '2026-W36', plannedHours: 4 },
      headers: PERSON,
    })
    expect(made.statusCode, made.body).toBe(201)
    expect(allocationRows()).toBe(1)
  })
})

describe('the other door into the same table', () => {
  it('refuses an agent posting an allocation, in the same sentence', async () => {
    const recordId = aTask('Bring the second listener up')

    const refused = await app.inject({
      method: 'POST',
      url: '/api/planning/allocations',
      payload: { horizon: 'week', period: '2026-W36', recordId, plannedHours: 2 },
      headers: AN_AGENT,
    })
    expect(refused.statusCode, refused.body).toBe(403)
    expect(String(bodyOf(refused)['error'])).toContain(
      'Turning words about time into hours on the calendar is the person’s own act',
    )
    expect(allocationRows()).toBe(0)
  })

  it('accepts the person posting the same allocation', async () => {
    const recordId = aTask('Bring the second listener up')

    const made = await app.inject({
      method: 'POST',
      url: '/api/planning/allocations',
      payload: { horizon: 'week', period: '2026-W36', recordId, plannedHours: 2 },
      headers: PERSON,
    })
    expect(made.statusCode, made.body).toBe(201)
    expect(allocationRows()).toBe(1)
  })
})

describe('filing a line whose words already read as time', () => {
  it('files the record for an agent but does not schedule the hours', async () => {
    const made = await app.inject({ method: 'POST', url: '/api/plans', payload: { title: 'A plan of hours' } })
    const planId = (bodyOf(made)['plan'] as { id: string }).id
    const line = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/lines`,
      payload: { text: '- baseline {time: 4h this week}', reason: 'the fixture needs a line with time words' },
    })
    const lineId = (bodyOf(line)['line'] as { id: string }).id

    const filed = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/lines/${lineId}/file-as-work`,
      payload: { kind: 'task', workspaceId: 'default' },
      headers: AN_AGENT,
    })
    // The filing is an ordinary write an agent may make; only the hours are refused.
    expect(filed.statusCode, filed.body).toBe(201)
    expect(allocationRows()).toBe(0)
    // And the reply says in the intent door's sentence why the time did not move.
    expect(filed.body).toContain('the person’s own act')
  })
})

describe('the one function every allocation path goes through', () => {
  it('refuses an agent at createAllocation itself, so no path can go round it', async () => {
    // ASKED OF THE FUNCTION, not of a route: `createAllocation` is the only insert into the
    // allocations table, and this is the proof that the clause lives at that choke point rather
    // than being repeated (or forgotten) at each door. The import is dynamic so the fresh database
    // is the one it opens.
    const { createAllocation } = await import('../src/server/lib/planning.ts')
    const recordId = aTask('Bring the second listener up')

    expect(() =>
      createAllocation(
        { horizon: 'week', period: '2026-W36', recordId, plannedHours: 2 },
        { type: 'agent', id: 'g5-agentplans' },
      ),
    ).toThrow(/the person’s own act/)
    expect(allocationRows()).toBe(0)
  })
})
