// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAUSED BROADCAST SCHEDULE IS COUNTED ONCE, WHEN THE SECRETARY IS TOLD.
 *
 * Every agent, message and moment here is made up. No worker starts and no clock is waited on.
 *
 * The row `broadcast-pause` is counted inside `sendTheBroadcastRemindersThatAreDue`, in the branch
 * that tells a paused secretary, and nowhere else. A second pass while the schedule stays paused
 * writes no second line and adds no second count. Reading the page's broadcast reading counts
 * nothing.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')
type BroadcastLib = typeof import('../src/server/lib/broadcast.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib
let broadcast: BroadcastLib
let secretary: string

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The real clock, once, so the made-up moments below are on the operator's day. */
const R0 = new Date()

function theMoment(days: number, hours: number, minutes: number): Date {
  return new Date(R0.getFullYear(), R0.getMonth(), R0.getDate() + days, hours, minutes, 0, 0)
}

/** One made-up broadcast from the secretary to the person, its body naming the slot back. */
function aBroadcast(slot: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'Made-up broadcast',
    data: {
      body: `Made-up ${slot} progress; needs a decision`,
      to: [{ kind: 'person', id: THE_PERSON }],
      sentBy: { kind: 'agent', id: secretary },
    },
    actor: { type: 'agent', id: secretary },
  }).id
}

/** The made-up gate row as the table holds it, read past every door. */
function count(): { would_stop: number; stopped: number; reminded: number } | undefined {
  return t.client.sqlite
    .prepare("SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = 'broadcast-pause'")
    .get() as { would_stop: number; stopped: number; reminded: number } | undefined
}

const watchingSince = new Date(R0.getTime() - 86_400_000)

beforeAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,13:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_LEAD_MINUTES = '30'
  process.env.MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT = '3'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  broadcast = await import('../src/server/lib/broadcast.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  const made = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'made-up-quiet-secretary', name: 'Made-up quiet secretary', role: 'secretary' },
  })
  expect(made.statusCode, made.body).toBe(201)
  secretary = (made.json() as { agent: { id: string } }).agent.id
})

afterAll(async () => {
  await app.close()
  t.close()
})

it('before the pause is reached, a pass sends a reminder and the count row is undefined', () => {
  const due = theMoment(0, 17, 45)
  const pass = reminders.sendTheRemindersThatAreDue('default', due, watchingSince)
  expect(pass.broadcastsReminded).toContain(secretary)
  expect(count()).toBeUndefined()
})

it('the pass that says the pause writes one count, a second paused pass leaves it, and reading the page leaves it', () => {
  aBroadcast('18:00')
  aBroadcast('18:00')
  aBroadcast('18:00')
  expect(broadcast.thePauseReadingFor(secretary).paused).toBe(true)

  const due = theMoment(0, 17, 45)
  const first = reminders.sendTheRemindersThatAreDue('default', due, watchingSince)
  expect(first.broadcastsPaused).toContain(secretary)
  expect(first.broadcastsReminded).not.toContain(secretary)
  expect(count()).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })

  const second = reminders.sendTheRemindersThatAreDue('default', due, watchingSince)
  expect(second.broadcastsPaused).not.toContain(secretary)
  expect(count()).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })

  broadcast.theBroadcastReadingFor(secretary, due)
  expect(count()).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })
})
