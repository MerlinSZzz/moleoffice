// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHANGE LOG BY A FIELD AND A VALUE, AFTER A MOMENT.
 *
 * The change log can be narrowed to a record, a session and a pair of times, and nothing can ask "which runs became
 * finished after this moment" without reading the whole list. A caller that only wants what took one field to one
 * value, from one moment onward, has to download everything and filter it itself.
 *
 * WHAT THIS FILE HOLDS, against a test office of its own:
 *   1. A run that became the state this project calls finished, at or after the moment, is answered: its row is in
 *      `changes`, its record id is the run, and its new value is that state.
 *   2. A run that became that state before the moment is not answered.
 *   3. A field that never took the value is not answered, neither a state word the run never took nor another field.
 *   4. The filter holds on the no-session branch (with `recordId`) and on the session branch (with the run's id and
 *      with its title).
 *   5. `matched` and `truncated` are counted through the whole filter: two runs became the value inside a window that
 *      also holds a third state change, so the list is capped at one but the count is two and says it is truncated.
 *   6. `field` alone, `value` alone and either one empty are refused, in one sentence that names both and says they
 *      are one filter.
 *   7. The note GET /api serves for the route names `field=`, `value=`, and `since=`.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb`), never the live office. The words used are read from
 * SESSION_STATES and STILL_GOING_STATES, and the note is read through GET /api, exactly as
 * tests/server-surface.test.ts reads it, so neither is copied here.
 *
 * MUTATIONS, each after a control run and each put back from the commit, with the cases the run showed red:
 *   - the `field` condition taken out of `changesWhere`: case 3 goes red;
 *   - the `value` condition taken out of `changesWhere`: cases 3 and 5 go red;
 *   - the pair taken out of the filter the count uses: case 5 goes red;
 *   - the pair taken out of the session filter object: case 4 goes red.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { SESSION_STATES, STILL_GOING_STATES, type Change, type SessionState } from '../src/shared/types.ts'
import type { ApiIndex } from '../src/server/api/kinds.ts'

const HERE = 'default'
const OWNER = {
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const asAgent = (handle: string, run: string): Record<string, string> => ({
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-session': run,
})
/** An agent writing about itself before its run record exists, when there is no session to name yet. */
const AS_THE_RUNS_AGENT = {
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
}

let t: TestDb
let app: FastifyInstance

interface Reply {
  status: number
  body: string
  json: Record<string, unknown>
}

async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
  const reply = await app.inject({
    method,
    url,
    headers: payload === undefined ? headers : { ...headers, 'content-type': 'application/json' },
    ...(payload === undefined ? {} : { payload: payload as never }),
  })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, body: reply.body, json }
}

interface ChangesAnswer {
  changes: Change[]
  matched: number
  truncated: boolean
  session?: { recordId: string | null; matchedValues: string[] }
  sessions: unknown[]
  spent?: unknown
}

/** Read the change log as the route serves it, or fail with the server's own sentence. */
async function changesFrom(query: string): Promise<ChangesAnswer> {
  const reply = await ask('GET', `/api/changes?${query}`, OWNER)
  expect(reply.status, reply.body).toBe(200)
  return reply.json as unknown as ChangesAnswer
}

/** The sentence GET /api serves for one endpoint, read the way tests/server-surface.test.ts reads it. */
async function noteFor(method: string, path: string): Promise<string> {
  const reply = await ask('GET', '/api', OWNER)
  expect(reply.status, reply.body).toBe(200)
  const listed = (reply.json as unknown as ApiIndex).endpoints.find((one) => one.method === method && one.path === path)
  if (!listed) throw new Error(`GET /api does not list ${method} ${path} at all`)
  if (listed.description === null) throw new Error(`GET /api lists ${method} ${path} with no description`)
  return listed.description
}

/** One state word the declaration holds, or a failure naming what was looked for. */
function aStateWhere(says: (state: SessionState) => boolean, what: string): SessionState {
  const found = SESSION_STATES.find(says)
  if (found === undefined) throw new Error(`SESSION_STATES holds no ${what}`)
  return found
}

/** The word a run is still going in, read from the one declaration rather than written here. */
const STILL_GOING = aStateWhere((state) => STILL_GOING_STATES.includes(state), 'state in which a run is still going')
/** The state this office calls finished: the first word the declaration says is not still going. */
const FINISHED = aStateWhere((state) => !STILL_GOING_STATES.includes(state), 'state for a run that is no longer going')
/** A state word this test's runs never take, so a field filter for it must answer nothing. */
const NEVER_TAKEN = aStateWhere(
  (state) => state !== STILL_GOING && state !== FINISHED,
  'third state for a run that this test never gives one',
)

let runNumber = 0

/** File a run in a state that is still going, as the agent that will end it, and give back its id and title. */
async function aRunThatIsStillGoing(): Promise<{ id: string; title: string }> {
  runNumber += 1
  const title = `a run for the field filter ${String(runNumber)}`
  const filed = await ask('POST', '/api/records', AS_THE_RUNS_AGENT, {
    kind: 'session',
    title,
    data: { state: STILL_GOING, doing: 'holding' },
  })
  expect(filed.status, filed.body).toBe(201)
  return { id: (filed.json['record'] as { id: string }).id, title }
}

/** PATCH one run's data.state through the record door, writing as that run, as its own process would. */
async function became(run: string, state: SessionState): Promise<void> {
  const patched = await ask('PATCH', `/api/records/${run}`, asAgent('claude-code', run), { dataPatch: { state } })
  expect(patched.status, patched.body).toBe(200)
}

/** The change row for one run's change of data.state, read from its own record's change log. */
async function itsStateRow(run: string): Promise<Change> {
  const own = await changesFrom(`recordId=${encodeURIComponent(run)}`)
  const row = own.changes.find((one) => one.recordId === run && one.field === 'data.state')
  if (row === undefined) throw new Error(`the change log holds no data.state row for ${run}`)
  return row
}

/** A stored moment, one second after the one given. */
function oneSecondAfter(stamp: string): string {
  const [date, time] = stamp.split(' ')
  const [y, mo, d] = date!.split('-').map(Number)
  const [h, mi, s] = time!.split(':').map(Number)
  const later = new Date(y!, mo! - 1, d!, h!, mi!, s! + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())} ${pad(later.getHours())}:${pad(later.getMinutes())}:${pad(later.getSeconds())}`
}

/** Pretend it is this moment. Only Date is faked, so no timer this file waits on is affected. */
function pretendItIs(local: string): void {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/.exec(local)
  if (!m) throw new Error(`pretendItIs needs local wall-clock 'YYYY-MM-DD HH:MM:SS', got '${local}'`)
  const [, y, mo, d, h, mi, sec] = m
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec)))
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the change log by a field and a value, after a moment', () => {
  it('1. answers the row of a run that became the value at or after the moment', async () => {
    const run = await aRunThatIsStillGoing()
    await became(run.id, FINISHED)
    const row = await itsStateRow(run.id)

    const asked = await changesFrom(
      `field=data.state&value=${encodeURIComponent(FINISHED)}&since=${encodeURIComponent(row.at)}`,
    )
    const found = asked.changes.find((one) => one.recordId === run.id)
    expect(found, asked.changes.map((one) => one.recordId).join(', ')).toBeDefined()
    expect(found?.field).toBe('data.state')
    expect(found?.newValue).toBe(FINISHED)
  })

  it('2. does not answer a run that became the value before the moment', async () => {
    const run = await aRunThatIsStillGoing()
    await became(run.id, FINISHED)
    const row = await itsStateRow(run.id)

    const asked = await changesFrom(
      `recordId=${encodeURIComponent(run.id)}&field=data.state&value=${encodeURIComponent(FINISHED)}` +
        `&since=${encodeURIComponent(oneSecondAfter(row.at))}`,
    )
    expect(asked.changes.filter((one) => one.recordId === run.id)).toEqual([])
  })

  it('3. does not answer a field that never took the value', async () => {
    const run = await aRunThatIsStillGoing()
    await became(run.id, FINISHED)

    const otherState = await changesFrom(
      `recordId=${encodeURIComponent(run.id)}&field=data.state&value=${encodeURIComponent(NEVER_TAKEN)}`,
    )
    expect(otherState.changes.filter((one) => one.recordId === run.id)).toEqual([])

    const otherField = await changesFrom(
      `recordId=${encodeURIComponent(run.id)}&field=data.title&value=${encodeURIComponent(FINISHED)}`,
    )
    expect(otherField.changes.filter((one) => one.recordId === run.id)).toEqual([])
  })

  it('4. holds on the no-session branch and on the session branch', async () => {
    const run = await aRunThatIsStillGoing()
    await became(run.id, FINISHED)
    const row = await itsStateRow(run.id)
    const narrowed = `field=data.state&value=${encodeURIComponent(FINISHED)}&since=${encodeURIComponent(row.at)}`

    const byRecord = await changesFrom(`recordId=${encodeURIComponent(run.id)}&${narrowed}`)
    expect(byRecord.changes.map((one) => one.id)).toContain(row.id)
    expect(byRecord.changes.find((one) => one.id === row.id)?.recordId).toBe(run.id)

    const byId = await changesFrom(`session=${encodeURIComponent(run.id)}&${narrowed}`)
    expect(byId.changes.map((one) => one.id)).toContain(row.id)
    expect(byId.session?.recordId).toBe(run.id)

    const byTitle = await changesFrom(`session=${encodeURIComponent(run.title)}&${narrowed}`)
    expect(byTitle.changes.map((one) => one.id)).toContain(row.id)
    expect(byTitle.session?.recordId).toBe(run.id)
    expect(byTitle.session?.matchedValues).toContain(run.id)

    const neverTaken = await changesFrom(
      `session=${encodeURIComponent(run.id)}&field=data.state&value=${encodeURIComponent(NEVER_TAKEN)}` +
        `&since=${encodeURIComponent(row.at)}`,
    )
    expect(neverTaken.changes.filter((one) => one.recordId === run.id)).toEqual([])
  })

  it('5. counts matched and truncated through the whole filter, not the page', async () => {
    pretendItIs('2026-02-01 10:00:00')
    const first = await aRunThatIsStillGoing()
    const second = await aRunThatIsStillGoing()
    const other = await aRunThatIsStillGoing()

    pretendItIs('2026-02-01 11:00:00')
    await became(first.id, FINISHED)
    pretendItIs('2026-02-01 11:00:01')
    await became(second.id, FINISHED)
    pretendItIs('2026-02-01 11:00:02')
    await became(other.id, NEVER_TAKEN)

    const asked = await changesFrom(
      `field=data.state&value=${encodeURIComponent(FINISHED)}` +
        `&since=${encodeURIComponent('2026-02-01 10:59:59')}&until=${encodeURIComponent('2026-02-01 11:00:02')}` +
        '&limit=1',
    )
    expect(asked.changes).toHaveLength(1)
    expect([first.id, second.id]).toContain(asked.changes[0]?.recordId)
    expect(asked.matched, JSON.stringify(asked)).toBe(2)
    expect(asked.truncated).toBe(true)
  })

  it('6. refuses field alone, value alone and an empty one, naming both', async () => {
    for (const query of [
      'field=data.state',
      `value=${encodeURIComponent(FINISHED)}`,
      `field=&value=${encodeURIComponent(FINISHED)}`,
      'field=data.state&value=',
    ]) {
      const refused = await ask('GET', `/api/changes?${query}`, OWNER)
      expect(refused.status, `${query} was answered ${refused.body}`).toBe(400)
      const said = String(refused.json['error'] ?? '')
      expect(said).toContain('field')
      expect(said).toContain('value')
      expect(said).toMatch(/one filter/i)
    }
  })

  it('7. says in the route note that field and value are one filter with since', async () => {
    const note = await noteFor('GET', '/api/changes')
    expect(note).toContain('field=')
    expect(note).toContain('value=')
    expect(note).toContain('since=')
  })
})
