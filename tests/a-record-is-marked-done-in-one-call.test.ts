// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD IS MARKED DONE IN ONE CALL. Wave 13s round 142, the fifth part of item 38 of the line's requirements, on the
 * owner's decision of 29 October 2026: marking a record done took a nested body, it took a secretary three tries, and a
 * secretary closes dozens a day.
 *
 * WHAT IT DOES. POST /api/records/:id/done, in src/server/api/done.ts. A task and a backlog item are left "done". An
 * obligation is discharged as its fulfil door discharges it, "fulfilled", with a note saying what settled it, and a
 * daily one has its next day written in the same write. A record already done is not written again. Any other kind is
 * refused, and so is a note on a kind that keeps none, rather than dropped.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The agent is a made-up
 * agent with a made-up handle, holding the key the office answered. Every record here is made up.
 *
 * THE CASES, in order, on one world:
 *   1. a task is marked done with no body, by the agent who asked; a second call writes nothing and says so;
 *   2. a backlog item is marked done, and nothing else of it changes;
 *   3. an obligation is fulfilled with the note sent, and a daily one names its next day in the reply; one sent with
 *      no note is refused with 400 and nothing is written;
 *   4. a note on a task, and a record of a kind the door does not mark done, are refused with 400 and nothing is
 *      written.
 *
 * RED BEFORE: every case, as no door answered POST /api/records/:id/done.
 *
 * MUTATIONS, each run alone after a green control and restored after (29 October 2026):
 *   - a record already done is said to be done now: case 1 is red;
 *   - a backlog item is left "dropped": case 2 is red;
 *   - an obligation is changed by a plain patch and not discharged: case 3 is red;
 *   - an obligation with no note is no longer refused at the door: case 3 is red;
 *   - a note on a task is dropped rather than refused: case 4 is red;
 *   - an idea is marked done too, as "dropped": case 4 is red.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_WORKER } from '../src/shared/roles.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const WRITER = 'record-closing-worker'

let t: TestDb
let app: FastifyInstance
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
let agentKey = ''

const asTheAgent = (): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': WRITER,
  'x-mole-office-key': agentKey,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST', url: string, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers: asTheAgent(), ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const filed = await call('POST', '/api/records', { kind, title, summary: `${title}, made up.`, data })
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.body.record.id)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function read(id: string): Promise<any> {
  const got = await call('GET', `/api/records/${id}`)
  expect(got.status, got.raw).toBe(200)
  return got.body.record
}

/** How many change rows one record has, so a call that wrote nothing can be told from one that wrote. */
function changesOf(id: string): number {
  return (t.client.sqlite.prepare('SELECT count(*) AS n FROM changes WHERE record_id = ?').get(id) as { n: number }).n
}

/** A made-up obligation owed to the made-up owner. */
function anObligation(more: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    due: '2026-11-03 06:30',
    owedTo: 'the made-up owner',
    why: 'Made-up: the made-up owner reads it before the day starts.',
    what_proves_it_done: 'Made-up: the made-up report is in the made-up chat.',
    consequence: { bearer: 'outside', what: 'Made-up: the made-up owner starts the day without it.' },
    state: 'open',
    ...more,
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: WRITER, name: WRITER, role: THE_WORKER } })
  expect(started.statusCode, started.body).toBe(201)
  agentKey = String(started.json().whatToGiveIt?.key ?? '')
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a record is marked done in one call', () => {
  it('1. a task is marked done with no body, and a second call writes nothing and says so', async () => {
    const id = await file('task', 'Made-up task to close', { state: 'doing' })
    const done = await call('POST', `/api/records/${id}/done`)
    expect(done.status, done.raw).toBe(200)
    expect(done.body.record.data.state).toBe('done')
    expect(done.body.alreadyDone).toBe(false)
    expect(done.body.doneNote).toContain('Made-up task to close')
    expect((await read(id)).data.state).toBe('done')
    const by = t.client.sqlite
      .prepare("SELECT actor_type AS type, actor_id AS who FROM changes WHERE record_id = ? AND op = 'update'")
      .all(id) as { type: string; who: string }[]
    expect(by.length).toBeGreaterThan(0)
    expect(by.every((row) => row.type === 'agent' && row.who === WRITER), JSON.stringify(by)).toBe(true)

    const before = changesOf(id)
    const again = await call('POST', `/api/records/${id}/done`)
    expect(again.status, again.raw).toBe(200)
    expect(again.body.alreadyDone).toBe(true)
    expect(again.body.doneNote).toContain('Nothing was written')
    expect(changesOf(id)).toBe(before)
  })

  it('2. a backlog item is marked done, and nothing else of it changes', async () => {
    const data = {
      line: 'made-up line',
      number: '7',
      placedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      why: 'Made-up: the made-up owner asked for it.',
      doneWhen: 'Made-up: the made-up page shows the made-up list.',
      state: 'todo',
    }
    const id = await file('backlog_item', 'Made-up backlog item to close', data)
    const done = await call('POST', `/api/records/${id}/done`, {})
    expect(done.status, done.raw).toBe(200)
    expect(done.body.alreadyDone).toBe(false)
    expect((await read(id)).data).toEqual({ ...data, state: 'done' })
  })

  it('3. an obligation is fulfilled with the note sent, a daily one names its next day, and one with no note is refused', async () => {
    const id = await file('obligation', 'Made-up promise to close', anObligation())
    const done = await call('POST', `/api/records/${id}/done`, { note: 'Made-up: the made-up report was sent.' })
    expect(done.status, done.raw).toBe(200)
    expect(done.body.alreadyDone).toBe(false)
    const kept = (await read(id)).data
    expect(kept.done).toBe(true)
    expect(kept.state).toBe('fulfilled')
    expect(kept.fulfilledNote).toBe('Made-up: the made-up report was sent.')
    expect(typeof kept.fulfilledAt).toBe('string')

    const daily = await file('obligation', 'Made-up daily promise to close', anObligation({ repeat: 'daily' }))
    const dailyDone = await call('POST', `/api/records/${daily}/done`, { note: 'Made-up: sent.' })
    expect(dailyDone.status, dailyDone.raw).toBe(200)
    const nextDay = dailyDone.body.record.data.nextDay
    expect(typeof nextDay, 'the reply does not name the next day').toBe('string')
    expect(dailyDone.body.doneNote).toContain(nextDay)
    expect((await read(nextDay)).data.due).toBe('2026-11-04 06:30')

    const unsaid = await file('obligation', 'Made-up promise closed with nothing said', anObligation())
    const before = changesOf(unsaid)
    for (const body of [undefined, {}, { note: '   ' }]) {
      const refused = await call('POST', `/api/records/${unsaid}/done`, body)
      expect(refused.status, refused.raw).toBe(400)
      expect(refused.error).toContain('note')
    }
    expect(changesOf(unsaid)).toBe(before)
    expect((await read(unsaid)).data.state).toBe('open')
  })

  it('4. refuses a note on a task, and a kind the door does not mark done, and writes nothing', async () => {
    const task = await file('task', 'Made-up task closed with words', { state: 'doing' })
    const idea = await file('idea', 'Made-up idea to close', { state: 'active' })
    const before = { task: changesOf(task), idea: changesOf(idea) }

    const noted = await call('POST', `/api/records/${task}/done`, { note: 'Made-up: finished.' })
    expect(noted.status, noted.raw).toBe(400)
    expect(noted.error).toContain('note')
    const other = await call('POST', `/api/records/${idea}/done`)
    expect(other.status, other.raw).toBe(400)
    expect(other.error).toContain('idea')
    expect(other.error).toContain(`PATCH /api/records/${idea}`)
    const unknown = await call('POST', `/api/records/${task}/done`, { state: 'done' })
    expect(unknown.status, unknown.raw).toBe(400)

    expect({ task: changesOf(task), idea: changesOf(idea) }).toEqual(before)
    expect((await read(task)).data.state).toBe('doing')
    expect((await read(idea)).data.state).toBe('active')
  })
})
