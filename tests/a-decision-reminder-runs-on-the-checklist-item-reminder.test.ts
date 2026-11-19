// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * THE DECISION REMINDER RUNS ON A CHECKLIST ITEM'S OWN REMINDER, AND THESE ARE THE THREE THINGS IT LEANS ON.
 *
 * One decision sets how another is carried out. Point 2 of the message the first came in says: put it on a
 * checklist with a timed reminder; then no new code is needed, only a decision reminder
 * flow. A secretary that
 * asks the owner to decide, or finds work blocked by the owner's decision, puts an item "waiting on the owner" on its own checklist
 * and switches the item's reminder on 2 hours later. When it fires and the owner has not answered, the secretary nudges them
 * once in chat and switches the reminder on once more. When the owner answers, the secretary switches the reminder off.
 * The flow is a record in the office, The decision reminder; no code sends a nudge.
 *
 * So the flow leans on three things `src/server/lib/checklists.ts` already does, and this file holds them:
 *
 *   1. a reminder the secretary switches on for its own "waiting on the owner" item fires once, to the secretary;
 *   2. switched on again after it fired, it fires a second time, which is the second nudge;
 *   3. switched off, or on an item that has closed, it does not fire, which is the nudge stopping.
 *
 * Wave 13j round 55. Each case was proved by chapter 5's three runs, written in the round's report.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'

let t: TestDb
let app: FastifyInstance
let reminders: typeof import('../src/server/lib/reminders.ts')

const asPerson = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

const idOf: Record<string, string> = {}

/** The real clock, once, so every made-up moment is measured from the operator's day. */
const R0 = new Date()
function at(days: number, hours: number, minutes: number): Date {
  return new Date(R0.getFullYear(), R0.getMonth(), R0.getDate() + days, hours, minutes, 0, 0)
}

/** One tick of the office's reminder watcher at `now`. */
function tick(now: Date): ReturnType<typeof reminders.sendTheRemindersThatAreDue> {
  return reminders.sendTheRemindersThatAreDue('default', now, new Date(now.getTime() - 86_400_000))
}

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

/** A made-up report, to stand as the evidence that closes an item. */
function aReport(title: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title,
    data: { blocks: [{ id: 'b-1', type: 'text', text: 'A made-up report for this test.' }] },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  }).id
}

/** How many office lines saying a checklist item is due went to one participant id. */
function dueLinesTo(id: string): number {
  return (
    t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) AND data LIKE '%A checklist item is due%'",
      )
      .all() as { data: string }[]
  ).filter((one) => (JSON.parse(one.data) as { to: { id: string }[] }).to.some((to) => to.id === id)).length
}

/** The secretary's own checklist, with one item waiting on the owner. */
async function aWaitingItem(words: string): Promise<{ list: string; item: string }> {
  const made = await call('POST', '/api/checklists', asAgent('clerk'), { title: `Waiting on the owner: ${words}` })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const list = made.body['checklist'].id as string
  const added = await call('POST', `/api/checklists/${list}/items`, asAgent('clerk'), { words, state: 'waiting on the owner' })
  expect(added.status, JSON.stringify(added.body)).toBe(201)
  return { list, item: added.body['item'].id as string }
}

async function switchOn(list: string, item: string, when: Date): Promise<void> {
  const on = await call('PUT', `/api/checklists/${list}/items/${item}/reminder`, asAgent('clerk'), { on: true, at: localStamp(when) })
  expect(on.status, JSON.stringify(on.body)).toBe(200)
}

beforeAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_LEAD_MINUTES = '30'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  app = (await apiApp()).app
  await app.ready()
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle: 'clerk', name: 'clerk', role: 'secretary' } })
  expect(r.statusCode, r.body).toBe(201)
  idOf['clerk'] = (r.json() as { agent: { id: string } }).agent.id
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the decision reminder leans on the checklist item reminder', () => {
  it('a reminder 2 hours on fires once, at its time, to the secretary that owns the item', async () => {
    const { list, item } = await aWaitingItem('The person has not said whether to make the third version.')
    const asked = at(2, 13, 45)
    const first = new Date(asked.getTime() + 2 * 3_600_000)
    await switchOn(list, item, first)
    const before = dueLinesTo(idOf['clerk']!)
    expect(tick(new Date(first.getTime() - 60_000)).checklistItemsReminded).toEqual([])
    expect(tick(new Date(first.getTime() + 30_000)).checklistItemsReminded).toEqual([`${list}/${item}`])
    expect(tick(new Date(first.getTime() + 90_000)).checklistItemsReminded).toEqual([])
    expect(dueLinesTo(idOf['clerk']!)).toBe(before + 1)
  })

  it('switched on again after it fired, it fires a second time: the second nudge', async () => {
    const { list, item } = await aWaitingItem('The person has not chosen between the two pictures.')
    const first = at(3, 10, 0)
    await switchOn(list, item, first)
    expect(tick(new Date(first.getTime() + 30_000)).checklistItemsReminded).toEqual([`${list}/${item}`])
    const second = at(3, 16, 0)
    // THE SWITCH IS ASKED AT A MOMENT AFTER THE FIRST FIRED, as the secretary asks it after nudging the owner.
    const on = await app.inject({
      method: 'PUT',
      url: `/api/checklists/${list}/items/${item}/reminder`,
      headers: asAgent('clerk'),
      payload: { on: true, at: localStamp(second) },
    })
    expect(on.statusCode, on.body).toBe(200)
    expect((on.json() as { item: { reminder: { firedAt?: string } } }).item.reminder.firedAt).toBeUndefined()
    expect(tick(new Date(second.getTime() - 60_000)).checklistItemsReminded).toEqual([])
    expect(tick(new Date(second.getTime() + 30_000)).checklistItemsReminded).toEqual([`${list}/${item}`])
  })

  it('switched off when the person answers, or on an item that has closed, it does not fire', async () => {
    const off = await aWaitingItem('The person has not said which day the review is.')
    const closed = await aWaitingItem('The person has not said whether the old page stays.')
    const when = at(4, 11, 0)
    await switchOn(off.list, off.item, when)
    await switchOn(closed.list, closed.item, when)
    const switched = await call('PUT', `/api/checklists/${off.list}/items/${off.item}/reminder`, asAgent('clerk'), { on: false })
    expect(switched.status, JSON.stringify(switched.body)).toBe(200)
    const done = await call('PATCH', `/api/checklists/${closed.list}/items/${closed.item}`, asAgent('clerk'), {
      state: 'done',
      evidence: [{ kind: 'report', record: aReport('A made-up report that closes the item') }],
    })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(tick(new Date(when.getTime() + 30_000)).checklistItemsReminded).toEqual([])
  })
})
