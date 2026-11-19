// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OBLIGATION CAN REPEAT DAILY. Wave 13s round 142, the fourth part of item 38 of the line's requirements, on the
 * owner's decision of 29 October 2026: a report owed every day at 06:30 and 17:30 was a new obligation filed by hand
 * each day.
 *
 * WHAT IT DOES. `repeat: "daily"` on an obligation, declared in src/shared/kinds.ts. When a daily obligation is
 * fulfilled, the office writes the next day's in the same write, due at the same time on the day after this one's
 * due, and names it in this one's `nextDay`. Only the duty is carried over: who it is owed to, why, what proves it
 * done, what happens if it is late, the effort, the source and the repeat. Cancelling a day stops the repeating, as
 * for a booking. A daily obligation is due on a date, because a condition or a record has no next day.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The agent is a made-up
 * agent with a made-up handle, holding the key the office answered. Every obligation and date here is made up.
 *
 * THE CASES, in order, on one world:
 *   1. an obligation declares `repeat` and `nextDay`, and its rules say how a daily one is due and how it stops;
 *   2. a daily obligation fulfilled at the fulfil door has the next day's written by the office, at the same time
 *      the next day, over a year's end, with the duty and nothing of the day;
 *   3. one fulfilled by a change of its data, due on a bare date at a month's end, has its next day written once: a
 *      later change, or a reopening and a second fulfilment, writes no second; one filed already fulfilled has its
 *      next day written in the same write;
 *   4. a cancelled daily obligation, and a fulfilled one that does not repeat, have no next day written;
 *   5. a daily obligation due on a condition, or with no due, is refused with 400 and nothing is written.
 *
 * RED BEFORE: every case, as an obligation declared no `repeat` and a write naming it was refused as an unknown key.
 *
 * MUTATIONS, each run alone after a green control and restored after (29 October 2026):
 *   - a change no longer writes the next day: cases 2 and 3 are red, as the fulfil door is a change;
 *   - a create no longer writes the next day: case 3 is red;
 *   - a cancelled day writes the next day too: case 4 is red;
 *   - `blocked_by` is carried to the next day: case 2 is red;
 *   - the next day is due on the same day: cases 2 and 3 are red;
 *   - a daily obligation is no longer refused when its due is not a date: case 5 is red;
 *   - a day naming its next day writes another all the same: cases 2 and 3 are red;
 *   - `nextDay` is no longer drawn as a record: case 1 is red.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { KIND_SPECS } from '../src/shared/kinds.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { namesRecords } from '../src/shared/sections.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const WRITER = 'obligation-keeping-worker'

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
async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
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

/** How many obligations the table holds, deleted or not. */
function obligationsStored(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'obligation'").get() as { n: number }).n
}

/** The duty of a made-up daily report, as it is carried from one day to the next. */
function theDuty(more: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    owedTo: 'the made-up owner',
    why: 'Made-up: the made-up owner reads it before the day starts.',
    what_proves_it_done: 'Made-up: the made-up report is in the made-up chat.',
    consequence: { bearer: 'outside', what: 'Made-up: the made-up owner starts the day without it.' },
    repeat: 'daily',
    ...more,
  }
}

async function fileAnObligation(title: string, data: Record<string, unknown>): Promise<string> {
  const filed = await call('POST', '/api/records', { kind: 'obligation', title, summary: `${title}, made up.`, data })
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.body.record.id)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function read(id: string): Promise<any> {
  const got = await call('GET', `/api/records/${id}`)
  expect(got.status, got.raw).toBe(200)
  return got.body.record
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

describe('an obligation', () => {
  it('1. declares a daily repeat and the next day, and its rules say how a daily one is due and how it stops', () => {
    const spec = KIND_SPECS.obligation
    const field = (key: string) => {
      const found = spec.fields.find((one) => one.key === key)
      expect(found, `an obligation declares no ${key}`).toBeDefined()
      return found!
    }
    expect(field('repeat').type).toBe("'daily'")
    expect(field('repeat').required).toBe(false)
    expect(field('nextDay').type).toBe('string')
    expect(field('nextDay').required).toBe(false)
    expect(namesRecords('obligation', 'nextDay')).toBe(true)
    const rules = spec.rules ?? []
    expect(rules.some((rule) => rule.includes('daily') && rule.includes('due') && rule.includes('cancelled')), 'no rule says how a daily obligation is due and how it stops').toBe(true)
  })

  it('2. fulfilled at the fulfil door, has the next day written by the office, with the duty and nothing of the day', async () => {
    const id = await fileAnObligation('Made-up morning report', theDuty({
      due: '2026-12-31 06:30',
      state: 'open',
      blocked_by: 'Made-up: the made-up numbers came late.',
    }))
    const before = obligationsStored()
    const fulfilled = await call('POST', `/api/records/${id}/fulfil`, { note: 'Made-up: the made-up report was sent.' })
    expect(fulfilled.status, fulfilled.raw).toBe(200)
    const nextId = fulfilled.body.record.data.nextDay
    expect(typeof nextId, 'the reply does not name the next day').toBe('string')
    expect(nextId).not.toBe(id)
    expect(obligationsStored()).toBe(before + 1)

    const next = await read(nextId)
    expect(next.kind).toBe('obligation')
    expect(next.workspaceId).toBe('default')
    expect(next.title).toBe('Made-up morning report')
    expect(next.summary).toBe('Made-up morning report, made up.')
    expect(next.data).toEqual(theDuty({ due: '2027-01-01 06:30', state: 'open' }))
    const made = t.client.sqlite.prepare("SELECT actor_type AS type FROM changes WHERE record_id = ? AND op = 'create'").all(nextId) as { type: string }[]
    expect(made.map((row) => row.type)).toEqual(['system'])
  })

  it('3. has its next day written once, when fulfilled by a change or filed fulfilled, on a bare date too', async () => {
    const id = await fileAnObligation('Made-up evening report', theDuty({ due: '2026-10-31' }))
    const fulfilled = await call('PATCH', `/api/records/${id}`, {
      dataPatch: { done: true, state: 'fulfilled', fulfilledAt: '2026-10-31 17:40', fulfilledNote: 'Made-up: sent.' },
    })
    expect(fulfilled.status, fulfilled.raw).toBe(200)
    const nextId = fulfilled.body.record.data.nextDay
    expect(typeof nextId, 'the reply does not name the next day').toBe('string')
    expect((await read(nextId)).data.due).toBe('2026-11-01')

    const before = obligationsStored()
    const changed = await call('PATCH', `/api/records/${id}`, { dataPatch: { fulfilledNote: 'Made-up: sent, and read.' } })
    expect(changed.status, changed.raw).toBe(200)
    const reopened = await call('PATCH', `/api/records/${id}`, { dataPatch: { done: null, state: 'open', fulfilledAt: null, fulfilledNote: null } })
    expect(reopened.status, reopened.raw).toBe(200)
    const again = await call('POST', `/api/records/${id}/fulfil`, { note: 'Made-up: sent again.' })
    expect(again.status, again.raw).toBe(200)
    expect(again.body.record.data.nextDay).toBe(nextId)
    expect(obligationsStored()).toBe(before)

    const filedDone = await fileAnObligation('Made-up report filed when sent', theDuty({
      due: '2026-10-29T17:30',
      done: true,
      state: 'fulfilled',
      fulfilledNote: 'Made-up: sent before it was filed.',
    }))
    const itsNext = (await read(filedDone)).data.nextDay
    expect(typeof itsNext, 'an obligation filed fulfilled has no next day').toBe('string')
    expect((await read(itsNext)).data.due).toBe('2026-10-30T17:30')
  })

  it('4. has no next day when it is cancelled, or when it does not repeat', async () => {
    const cancelledId = await fileAnObligation('Made-up report on a made-up holiday', theDuty({ due: '2026-11-02 06:30' }))
    const once = { ...theDuty({ due: '2026-11-02 06:30' }) }
    delete once['repeat']
    const onceId = await fileAnObligation('Made-up report owed once', once)
    const before = obligationsStored()
    const cancelled = await call('POST', `/api/records/${cancelledId}/fulfil`, { note: 'Made-up: nobody reads it on a holiday.', state: 'cancelled' })
    expect(cancelled.status, cancelled.raw).toBe(200)
    expect(cancelled.body.record.data.nextDay).toBeUndefined()
    const kept = await call('POST', `/api/records/${onceId}/fulfil`, { note: 'Made-up: sent.' })
    expect(kept.status, kept.raw).toBe(200)
    expect(kept.body.record.data.nextDay).toBeUndefined()
    expect(obligationsStored()).toBe(before)
  })

  it('5. refuses a daily obligation due on a condition or with no due, and writes nothing', async () => {
    const before = obligationsStored()
    for (const due of [{ due: { condition: 'the made-up numbers are in' } }, {}]) {
      const refused = await call('POST', '/api/records', { kind: 'obligation', title: 'Made-up daily report with no time', data: theDuty(due) })
      expect(refused.status, refused.raw).toBe(400)
      expect(refused.raw).toContain('data.repeat')
    }
    expect(obligationsStored()).toBe(before)

    const once = { ...theDuty({ due: { condition: 'the made-up numbers are in' } }) }
    delete once['repeat']
    const id = await fileAnObligation('Made-up report owed on a condition', once)
    const refused = await call('PATCH', `/api/records/${id}`, { dataPatch: { repeat: 'daily' } })
    expect(refused.status, refused.raw).toBe(400)
    expect(refused.raw).toContain('data.repeat')
    expect((await read(id)).data.repeat).toBeUndefined()
  })
})
