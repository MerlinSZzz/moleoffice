// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COUNTER THAT WAITS FOR A COUNT SAYS SO BESIDE ITS NEXT DUE TIME, AND A TIMER STILL FIRES.
 *
 * Problem tp7FJQ6oo7IE. `isATimer` is true only when `mayAdd` names nobody and
 * `follows` is empty. Every other counter needs a count of at least 1 before an every or quiet
 * trigger will fire. Its every trigger still answered a next due time with a sentence saying the
 * hours had passed, so the reply said a firing was coming when nothing would happen.
 *
 * WHAT IS PROVED HERE, one claim at a time:
 *
 *   1. A counter like the problem's — an every trigger, `mayAdd` naming one agent, count 0 — does NOT
 *      fire at its due moment.
 *   2. Its reply names the moment and carries the reason beside it: the count is 0 and it waits for
 *      a count.
 *   3. A counter with `mayAdd` empty is a timer, carries no such reason beside its due moment, and
 *      fires at the same moment.
 *
 * MUTATION, after a control run: change the `because` sentence in readTrigger's every branch back
 * to the sentence it used to give (`${hours} hours have passed: it was due at ...`), and the claim
 * that the reply says the count is 0 goes red.
 *
 * THE CLOCK IS THE TEST'S, the same way tests/a-counter-fires-on-its-triggers.test.ts keeps it:
 * `vi.setSystemTime` moves every stamp the product writes, and the tick takes its `now` as an
 * argument as well.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let counters: typeof import('../src/server/lib/counters.ts')

const START = new Date('2026-09-23T09:00:00')

const asPerson = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const asKeeper = { ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'counter-keeper' }

/** File a counter through its own door, and hand back its id. */
async function aCounter(body: Record<string, unknown>): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/counters', headers: asKeeper, payload: body })
  expect(r.statusCode, r.body).toBe(201)
  return (JSON.parse(r.body) as { counter: { id: string } }).counter.id
}

/** One counter as its own door reads it back, with the fields this file is about. */
async function read(id: string): Promise<{
  counter: {
    count: number
    nextDue: { at: string; because?: string } | null
    triggers: { holdsNow: boolean }[]
  }
  rows: { what: string }[]
}> {
  const r = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: asPerson })
  expect(r.statusCode, r.body).toBe(200)
  return JSON.parse(r.body) as never
}

/** One tick of the counters' own watcher, at a moment this test chooses. */
function tickAt(when: Date): ReturnType<typeof counters.fireTheCountersThatAreDue> {
  vi.setSystemTime(when)
  return counters.fireTheCountersThatAreDue(when)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  counters = await import('../src/server/lib/counters.ts')
  const r = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: asPerson,
    payload: { handle: 'counter-keeper', name: 'Synthetic counter-keeper' },
  })
  expect(r.statusCode, r.body).toBe(201)
}, 60_000)

afterAll(async () => {
  vi.useRealTimers()
  await app?.close()
  t?.close()
})

afterEach(() => {
  vi.setSystemTime(START)
})

describe('a counter that waits for a count says so, and a timer fires', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
  })

  it('does not fire with a count of 0, says why beside its due time, and the timer beside it fires', async () => {
    // THE PROBLEM'S COUNTER: a daily wake-up, filed with somebody named who may add, and nothing added.
    const waiting = await aCounter({
      title: 'The daily news desk wake-up',
      counts: 'News to send, which nobody has added yet.',
      mayAdd: { anyone: false, who: [{ kind: 'agent', id: 'counter-keeper' }] },
      triggers: [{ kind: 'every', hours: 1, from: '2026-09-23 09:30:00' }],
      action: { kind: 'task', title: 'Send the news' },
    })
    // A TIMER BESIDE IT: the same trigger, nobody named, following nothing.
    const timer = await aCounter({
      title: 'A real timer',
      counts: 'Nothing: it is a timer, and it fires on the hour whatever has happened.',
      mayAdd: { anyone: false, who: [] },
      triggers: [{ kind: 'every', hours: 1, from: '2026-09-23 09:30:00' }],
      action: { kind: 'task', title: 'The hourly look' },
    })

    // THE REPLY NAMES THE MOMENT, AND THE REASON RIDES BESIDE IT.
    const before = await read(waiting)
    expect(before.counter.count, 'nothing has been added').toBe(0)
    expect(before.counter.triggers[0]?.holdsNow, 'its trigger claims to hold with a count of 0').toBe(false)
    expect(before.counter.nextDue?.at, 'the reply does not name its due moment').toBe('2026-09-23 09:30:00')
    expect(before.counter.nextDue?.because, 'the reply does not say why it will not fire').toContain('The count is 0')
    expect(before.counter.nextDue?.because, 'the reply does not say it waits for a count').toContain('waits for a count')

    // A TIMER IS NOT TOLD IT WAITS. Its moment carries no such reason.
    const timerBefore = await read(timer)
    expect(timerBefore.counter.nextDue?.at, 'the timer does not name its due moment').toBe('2026-09-23 09:30:00')
    expect(timerBefore.counter.nextDue?.because, 'a timer was told it waits for a count').toBeUndefined()

    // PAST THE MOMENT: the timer fires, the counter that waits does not.
    const pass = tickAt(new Date('2026-09-23T09:31:00'))
    expect(pass.fired, 'a counter that waits for a count fired with a count of 0').not.toContain(waiting)
    expect(pass.fired, 'the timer did not fire at its due time').toContain(timer)

    // AND IT STILL SAYS WHY, with the moment unchanged because it never fired.
    const after = await read(waiting)
    expect(after.rows.some((row) => row.what === 'firing'), 'the waiting counter wrote a firing').toBe(false)
    expect(after.counter.nextDue?.at, 'the moment moved although it never fired').toBe('2026-09-23 09:30:00')
    expect(after.counter.nextDue?.because, 'the reason was lost after the tick').toContain('The count is 0')
  })
})
