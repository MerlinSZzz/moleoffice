// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LONG-POLL HOLD IS COUNTED ONCE AN HOUR, NOT STORED ONE ROW EACH. Criterion U6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * By the owner's decision a long-poll hold is no longer one row each, it is counted by
 * the hour. Five operations carry the declaration: handle.waiting,
 * worker.held, worker.waits and worker.wait-over, which the decision names, and handle.beat, which is the
 * secretary's extension of them and is named as such on the declaration itself.
 *
 *   1. A call at a folded operation writes no `api_calls` row and one counted row.
 *   2. A hundred calls in one hour by one listener at one operation make ONE counted row of 100.
 *   3. Two listeners, two operations, or two hours make separate rows.
 *   4. A call at an unfolded operation still writes its `api_calls` row, unchanged.
 *   5. `operationReadings` adds the folded counts back, and says how much of a count is folded.
 *   6. The declared list is EXACTLY those five (and no second list lives in the recorder).
 *   7. A call at one of them that did NOT answer is stored one row each, and is read back on the
 *      per-operation refused count and on the refusals list. The secretary ruled it: a refused hold is not
 *      a hold, so the count is a count of the calls the office answered.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   drop `countedByTheHour` from the declaration   → every case that expects a counted row
 *   ignore the declaration and insert anyway       → "writes no api_calls row"
 *   leave the count out of operationReadings        → "adds the folded counts back"
 *   key the upsert on the hour and not the listener → "separates two listeners"
 *   fold two hours into one row                     → "two hours"
 *   fold without asking whether the call answered   → "a call ... that did not answer", both cases
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE HOURS ARE DRIVEN
 * ---------------------------------------------------------------------------------------
 *
 * `localStamp` and the recorder both read the clock, so two hours are two `vi.setSystemTime` calls
 * with only `Date` faked. Real timers stay real, because the server under test uses them.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { OPERATIONS, type Operation } from '../src/shared/ops.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

/**
 * EACH CASE GETS ITS OWN PROJECT. The usage doors answer for the project in the request's header,
 * and a project per case is what keeps one case's counted calls out of another's totals. The raw
 * table readings below still read every row, and take what the case added by comparing with the ids
 * that were there when it started.
 */
let WORKSPACE = 'default'
let caseNumber = 0
const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The five operations the criterion names: four of the owner's, and the beat on the secretary's ruling. */
const FOLDED = ['handle.beat', 'handle.waiting', 'worker.held', 'worker.wait-over', 'worker.waits'] as const

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** The ids of the rows that were already in the two tables when this case started. */
let countedIdsAtTheStart = new Set<string>()
let storedIdsAtTheStart = new Set<string>()

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `hold-case-${String(caseNumber)}`
  OWNER['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: `Hold case ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
  countedIdsAtTheStart = new Set(
    (t.client.sqlite.prepare('SELECT id FROM hourly_calls').all() as { id: string }[]).map((row) => row.id),
  )
  storedIdsAtTheStart = new Set(
    (t.client.sqlite.prepare('SELECT id FROM api_calls').all() as { id: string }[]).map((row) => row.id),
  )
})

afterEach(() => {
  // THE CLOCK IS PUT BACK. A case that faked `Date` must leave the office reading the real one.
  vi.useRealTimers()
})

/** A header set for one listener, so "which waiter" is visible in the counted row. */
function asListener(listener: string): Record<string, string> {
  return { ...OWNER, 'x-mole-office-actor-id': listener }
}

async function get(path: string, headers: Record<string, string> = OWNER): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url: path, headers })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = OWNER,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'POST', url: path, headers, payload: JSON.stringify(body) })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

/** A durable agent, so the waiting door has a handle to answer for. */
async function aFreshAgent(handle: string): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: `A waiter for ${handle}`,
    data: { handle, runtime: 'claude-code', state: 'active' },
  })
  const listed = await get('/api/participants')
  const found = ((listed.body['agents'] ?? []) as { id: string; handle: string }[]).find((one) => one.handle === handle)
  if (found === undefined) throw new Error(`the agent ${handle} is not in the participant registry`)
  return found.id
}

interface CountedRow {
  hour: string
  operation: string
  workspace_id: string
  listener: string
  calls: number
}

/**
 * Every counted row this case added, in the order the fold writes them. The table is read whole;
 * the rows that were there when the case started are then left out, so the reading still sees
 * everything and the assertion still sees only what this case wrote.
 */
function countedRows(operation?: string): CountedRow[] {
  const rows = (
    operation === undefined
      ? t.client.sqlite.prepare('SELECT * FROM hourly_calls ORDER BY hour, operation, listener').all()
      : t.client.sqlite
          .prepare('SELECT * FROM hourly_calls WHERE operation = ? ORDER BY hour, operation, listener')
          .all(operation)
  ) as (CountedRow & { id: string })[]
  return rows.filter((row) => !countedIdsAtTheStart.has(row.id))
}

/** How many rows the request log stored one row each for one operation in this case. */
function storedRows(operation: string): number {
  const rows = t.client.sqlite.prepare('SELECT id FROM api_calls WHERE operation = ?').all(operation) as { id: string }[]
  return rows.filter((row) => !storedIdsAtTheStart.has(row.id)).length
}

// ============================================================================ the declaration

describe('the declaration', () => {
  it('marks exactly the five operations the criterion names, one of them the secretary’s extension', () => {
    // THIS IS THE CONTROL FOR THE WHOLE FILE. If the declaration loses a name, the cases below that
    // expect a counted row go red rather than passing quietly; if it gains one, this line says so.
    const every: readonly Operation[] = OPERATIONS
    expect(
      every
        .filter((one) => one.countedByTheHour === true)
        .map((one) => one.name)
        .sort(),
    ).toEqual([...FOLDED].sort())
  })
})

// ============================================================================ the fold

describe('a call at a folded operation', () => {
  it('writes no api_calls row and one counted row', async () => {
    await aFreshAgent('fold-one')
    await get('/api/handles/fold-one/waiting', asListener('listener-a'))

    expect(storedRows('handle.waiting'), 'a folded call was stored one row each anyway').toBe(0)
    const rows = countedRows('handle.waiting')
    expect(rows.length).toBe(1)
    expect(rows[0]!.calls).toBe(1)
    // THE LISTENER IS THE CALLER. "Which waiter" is the actor id, and it is stored as it was sent.
    expect(rows[0]!.listener).toBe('listener-a')
    expect(rows[0]!.workspace_id).toBe(WORKSPACE)
  }, 30_000)

  it('folds a hundred calls by one listener in one hour into ONE counted row of 100', async () => {
    await aFreshAgent('fold-hundred')
    for (let i = 0; i < 100; i += 1) {
      const answer = await get('/api/handles/fold-hundred/waiting', asListener('listener-hundred'))
      expect(answer.status).toBe(200)
    }
    expect(storedRows('handle.waiting'), 'a hundred folded calls left a hundred rows').toBe(0)
    const rows = countedRows('handle.waiting')
    expect(rows.length, 'a hundred calls in one hour did not make one counted row').toBe(1)
    expect(rows[0]!.calls, 'the count did not reach a hundred').toBe(100)
  }, 90_000)

  it('separates two listeners, two operations and two hours into separate rows', async () => {
    await aFreshAgent('fold-separate')
    await get('/api/handles/fold-separate/waiting', asListener('listener-one'))
    await get('/api/handles/fold-separate/waiting', asListener('listener-two'))

    // TWO LISTENERS: two rows, one call each.
    const byListener = countedRows('handle.waiting')
    expect(byListener.map((row) => row.listener).sort()).toEqual(['listener-one', 'listener-two'])
    expect(byListener.every((row) => row.calls === 1)).toBe(true)

    // TWO OPERATIONS: the same listener asking a different question is a different row.
    await get('/api/worker/waits', asListener('listener-one'))
    expect(countedRows('worker.waits').length).toBe(1)

    // TWO HOURS: the same listener and operation two hours apart is two rows. Only `Date` is faked,
    // because the server under test still needs real timers to answer.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2099, 0, 1, 9, 30, 0))
    await get('/api/handles/fold-separate/waiting', asListener('listener-one'))
    vi.setSystemTime(new Date(2099, 0, 1, 10, 30, 0))
    await get('/api/handles/fold-separate/waiting', asListener('listener-one'))
    vi.useRealTimers()

    const hours = countedRows('handle.waiting').map((row) => row.hour)
    expect(hours, 'the two faked hours did not make two rows').toContain('2099-01-01 09')
    expect(hours).toContain('2099-01-01 10')
    expect(hours.filter((hour) => hour.startsWith('2099-01-01')).length).toBe(2)
  }, 30_000)

  it('still writes its api_calls row unchanged at an operation that is not folded', async () => {
    await get('/api/records', asListener('listener-unfolded'))
    const stored = (
      t.client.sqlite.prepare("SELECT id, waits FROM api_calls WHERE operation = 'record.list'").all() as {
        id: string
        waits: number
      }[]
    ).filter((row) => !storedIdsAtTheStart.has(row.id))
    expect(stored.length, 'an unfolded call stopped being stored one row each').toBe(1)
    expect(stored[0]!.waits).toBe(0)
    expect(countedRows('record.list').length, 'an unfolded operation was folded anyway').toBe(0)
  }, 30_000)
})

// ============================================================================ a refused call is kept

/**
 * A REFUSED HOLD IS NOT A HOLD. The secretary ruled this on 13 September 2026, inside the owner's
 * decision: only the calls that answered are counted by the hour. A call at one of the five
 * operations that was turned away or failed is stored one row each, like any other call, because a
 * refusal is the evidence the measurement layer exists to keep and the Usage page's refusal list is
 * drawn from stored rows.
 *
 * WHAT WOULD MAKE THESE GO RED. Fold on the declaration alone, without asking whether the call
 * answered, and the refused call vanishes from the request log, from the per-operation refused
 * count and from the refusals list.
 */
describe('a call at a folded operation that did not answer', () => {
  it('is stored one row each with its status, and is not counted into the hour', async () => {
    await aFreshAgent('fold-refused')
    // ANSWERED: folded. The door answers at once for a handle it knows.
    await get('/api/handles/fold-refused/waiting', asListener('listener-refused'))
    // REFUSED: stored. No durable agent has this handle, so the door turns the call away with 404.
    const refused = await get('/api/handles/nobody-has-this-handle/waiting', asListener('listener-refused'))
    expect(refused.status, 'the call this case needs to be refused was answered').toBe(404)

    const stored = (
      t.client.sqlite
        .prepare("SELECT id, status, waits, trace_id FROM api_calls WHERE operation = 'handle.waiting'")
        .all() as { id: string; status: number; waits: number; trace_id: string | null }[]
    ).filter((row) => !storedIdsAtTheStart.has(row.id))
    expect(stored.length, 'a refused call at a folded operation was folded away').toBe(1)
    expect(stored[0]!.status).toBe(404)

    // AND THE COUNTED ROW HOLDS THE ANSWERED CALL ONLY, so the count is a count of calls answered.
    const counted = countedRows('handle.waiting')
    expect(counted.length).toBe(1)
    expect(counted[0]!.calls, 'the refused call was counted into the hour as well').toBe(1)
  }, 30_000)

  it('is read back on the per-operation refused count and on the refusals list', async () => {
    await aFreshAgent('fold-refusals-list')
    await get('/api/handles/fold-refusals-list/waiting', asListener('listener-list'))
    await get('/api/handles/nobody-has-this-handle/waiting', asListener('listener-list'))

    // THE PER-OPERATION TABLE: the count is the answered call plus the refused one, `foldedCalls`
    // says one of them was counted by the hour, and `refused` sees the refusal again.
    const operations = await get('/api/usage/operations')
    const rows = (operations.body['operations'] ?? []) as { operation: string; calls: number; foldedCalls: number; refused: number }[]
    const waiting = rows.find((row) => row.operation === 'handle.waiting')
    expect(waiting, 'the folded operation is missing from the per-operation table').toBeDefined()
    expect(waiting!.calls).toBe(2)
    expect(waiting!.foldedCalls, 'only the answered call is counted by the hour').toBe(1)
    expect(waiting!.refused, 'the refused call is not on the per-operation refused count').toBe(1)

    // THE REFUSALS LIST, which is drawn from stored rows and would be blind to a folded refusal.
    const agents = await get('/api/usage/agents')
    const refusals = (agents.body['refusals'] ?? []) as { status: number; count: number; operations: { operation: string | null; count: number }[] }[]
    const notFound = refusals.find((one) => one.status === 404)
    expect(notFound, 'the refusals list lost the refused hold').toBeDefined()
    expect(notFound!.operations.map((one) => one.operation)).toContain('handle.waiting')
  }, 30_000)
})

// ============================================================================ the count comes back

describe('the count comes back where the rows were', () => {
  it('reads the folded counts back through the route the Usage page draws from', async () => {
    await aFreshAgent('fold-reads')
    for (let i = 0; i < 3; i += 1) await get('/api/handles/fold-reads/waiting', asListener('listener-reads'))
    await get('/api/worker/waits', asListener('listener-reads'))

    const reply = await get('/api/usage/operations')
    expect(reply.status).toBe(200)
    const rows = (reply.body['operations'] ?? []) as { operation: string; calls: number; foldedCalls: number }[]
    const waiting = rows.find((row) => row.operation === 'handle.waiting')
    expect(waiting, 'the folded operation is missing from the per-operation table').toBeDefined()
    expect(waiting!.calls).toBe(3)
    expect(waiting!.foldedCalls, 'the count is drawn but says it was folded').toBe(3)
    const waits = rows.find((row) => row.operation === 'worker.waits')
    expect(waits!.calls).toBe(1)
    expect(waits!.foldedCalls).toBe(1)
  }, 30_000)

  it('is the reading that adds them, for an operation that has no rows at all', async () => {
    const { operationReadings } = await import('../src/server/lib/usage-reads.ts')
    // A PROJECT NOBODY HAS CALLED, so the only thing the reading can draw is the count handed in.
    const { readings } = operationReadings(0, 'a-project-nobody-called', new Map([['handle.waiting', 7]]))
    expect(readings).toHaveLength(1)
    expect(readings[0]).toMatchObject({ operation: 'handle.waiting', calls: 7, foldedCalls: 7, bytes: 0 })
  })

  it('says the summary’s stored-call total and the folded total separately', async () => {
    // THE SUMMARY IS A READING OVER THE WHOLE OFFICE, so it is taken at the start of the case and
    // the case's own call is what the difference has to be.
    const start = (await get('/api/usage/summary')).body['foldedCalls'] as number
    await aFreshAgent('fold-summary')
    await get('/api/handles/fold-summary/waiting', asListener('listener-summary'))
    const reply = await get('/api/usage/summary')
    expect(reply.status).toBe(200)
    // THE REQUEST LOG STORES NO ROW FOR IT; THE COUNTED ROW HOLDS IT. A reader that saw only the
    // first number would draw the office as having been asked less than it was.
    expect(reply.body['foldedCalls']).toBe(start + 1)
    expect(reply.body['calls']).toBeGreaterThanOrEqual(0)
  }, 30_000)
})

// ============================================================================ the saving, measured

describe('the saving, measured on a scratch office', () => {
  it('writes one counted row where a hundred unfolded calls write a hundred rows', async () => {
    await aFreshAgent('fold-saving')
    for (let i = 0; i < 100; i += 1) await get('/api/handles/fold-saving/waiting', asListener('saving-listener'))
    for (let i = 0; i < 100; i += 1) await get('/api/records', asListener('saving-listener'))

    // THE RATIO, COUNTED FROM THE TABLES THEMSELVES. One hundred folded calls wrote one counted row
    // and no request rows; one hundred calls at an ordinary operation wrote one hundred request rows.
    expect(storedRows('handle.waiting')).toBe(0)
    expect(countedRows('handle.waiting').length).toBe(1)
    expect(countedRows('handle.waiting')[0]!.calls).toBe(100)
    expect(storedRows('record.list')).toBe(100)
  }, 120_000)
})

// ============================================================================ piece 1's door

describe('piece 1’s waiting door is not changed by the fold', () => {
  it('still answers at once when it is not asked to hold, and that answer is counted', async () => {
    await aFreshAgent('fold-piece-one')
    // AN INSTANT ANSWER: no parameter, the shape it always had.
    const instant = await get('/api/handles/fold-piece-one/waiting', asListener('listener-piece-one'))
    expect(instant.status).toBe(200)
    expect(instant.body['waiting']).toEqual([])
    // The door really answered rather than held — the three-field shape is the proof, and the hold
    // registry is empty the whole time.
    const holdLib = await import('../src/server/lib/waiting-hold.ts')
    expect(holdLib.waitersHeld()).toBe(0)

    // THE COUNTED ROW CARRIES IT, and no request row exists. What remains true of piece 1's
    // per-request held mark is that the door answers at once when it is not asked to hold and holds
    // when it is; the mark's own `waits = 0` row no longer exists, because the whole operation is
    // counted by the hour. `tests/the-waiting-door-holds-until-a-message-arrives.test.ts` holds the
    // holding half, and its own mark case now asserts this same truth.
    const rows = countedRows('handle.waiting')
    expect(rows.length).toBe(1)
    expect(rows[0]!.calls).toBe(1)
    expect(rows[0]!.listener).toBe('listener-piece-one')
    expect(storedRows('handle.waiting'), 'the folded waiting door still wrote api_calls rows').toBe(0)
  }, 30_000)
})
