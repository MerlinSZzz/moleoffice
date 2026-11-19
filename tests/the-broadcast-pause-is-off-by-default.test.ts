// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BROADCAST PAUSE IS OFF BY DEFAULT. The gate `broadcast-pause` has an off position, 0 on its number row, and off
 * is its default in both kinds of office. With it off, no secretary's broadcasts pause, however many of them go
 * unanswered by the person. Set to a number, it pauses at that many, as it did before.
 *
 * WHAT THIS FILE PROVES, one tick of the reminder watcher at a time:
 *   (k) the gate unset reads off in an office that builds Mole Office and in an ordinary one; with it off, five
 *       unanswered broadcasts bring no pause and the reminder still goes, and a secretary that has sent no broadcast
 *       at all is reminded too;
 *   (l) set to 3, three unanswered broadcasts pause the schedule and no reminder goes.
 *
 * MADE-UP: the secretaries and every broadcast they send.
 *
 * MUTATION PROOF, after a control run, each restored byte-identical; the round's report names each run.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { gateDefaultHere, gateNumber, settingNamed } from '../src/config/settings.mjs'
import { gateNamed } from '../src/config/gates.mjs'
import { THE_PERSON } from '../src/shared/person.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')
type BroadcastLib = typeof import('../src/server/lib/broadcast.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib
let broadcast: BroadcastLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** OFF IS 0 ON THE GATE'S NUMBER ROW. It is the criterion, so it is spelt here. */
const OFF = '0'
const THE_PAUSE = gateNamed('broadcast-pause')

/** The broadcast settings the office reads here, each at its declared default, whatever the checkout's `.env` says. */
const THE_SETTINGS_READ = ['MOLE_OFFICE_BROADCAST_TIMES', 'MOLE_OFFICE_BROADCAST_LEAD_MINUTES', 'MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES'] as const

const FIRST = String(settingNamed('MOLE_OFFICE_BROADCAST_TIMES').fallback).split(',')[0]!
const LEAD = Number(settingNamed('MOLE_OFFICE_BROADCAST_LEAD_MINUTES').fallback)

/** The real clock, once, so every made-up moment here is measured from the operator's day. */
const R0 = new Date()

/** Inside the reminder window of the office's first time, on the local day `days` after R0's. */
function dueOn(days: number): Date {
  const [hours, minutes] = FIRST.split(':').map(Number) as [number, number]
  return new Date(R0.getFullYear(), R0.getMonth(), R0.getDate() + days, hours, minutes - LEAD + 1, 0, 0)
}

function tick(now: Date): ReturnType<RemindersLib['sendTheRemindersThatAreDue']> {
  return reminders.sendTheRemindersThatAreDue('default', now, new Date(now.getTime() - 86_400_000))
}

const idOf: Record<string, string> = {}

async function register(handle: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role: 'secretary' } })
  expect(reply.statusCode, `registering ${handle}: ${reply.body.slice(0, 300)}`).toBe(201)
  idOf[handle] = (reply.json() as { agent: { id: string } }).agent.id
}

/** `count` messages from one secretary to the person, each naming the office's first time and asking for a decision. */
function broadcastsFrom(handle: string, count: number): void {
  const agentId = idOf[handle]!
  for (let one = 0; one < count; one++) {
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'message',
      title: 'broadcast',
      data: { body: `${FIRST} 进度；需要决策；问题`, to: [{ kind: 'person', id: THE_PERSON }], sentBy: { kind: 'agent', id: agentId } },
      actor: { type: 'agent', id: agentId },
    })
  }
}

beforeAll(async () => {
  for (const name of THE_SETTINGS_READ) vi.stubEnv(name, settingNamed(name).fallback ?? '')
  vi.stubEnv('MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE', '')
  vi.stubEnv('MOLE_OFFICE_BROADCAST_BACKUP_REMINDER', '')
  vi.stubEnv(THE_PAUSE.setting, gateDefaultHere(THE_PAUSE) ?? '')
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  broadcast = await import('../src/server/lib/broadcast.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  for (const handle of ['many', 'none', 'three']) await register(handle)
}, 120_000)

afterAll(async () => {
  vi.unstubAllEnvs()
  await app?.close()
  t?.close()
})

describe('(k) the pause is off unless it is set', () => {
  it('reads off when it is unset, in an office that builds Mole Office and in an ordinary one', () => {
    expect(THE_PAUSE.positions).toMatchObject({ kind: 'number', fewest: Number(OFF) })
    expect(gateDefaultHere(THE_PAUSE, 'checkout')).toBe(OFF)
    expect(gateDefaultHere(THE_PAUSE, 'bundle')).toBe(OFF)
    expect(gateNumber('broadcast-pause', {})).toBe(Number(OFF))
  })

  it('brings no pause after five unanswered broadcasts, and the reminder still goes', () => {
    broadcastsFrom('many', 5)
    expect(broadcast.thePauseReadingFor(idOf['many']!)).toMatchObject({ paused: false, limit: Number(OFF), broadcasts: 5 })
    const pass = tick(dueOn(1))
    expect(pass.broadcastsPaused).not.toContain(idOf['many'])
    expect(pass.broadcastsReminded).toContain(idOf['many'])
  })

  it('reminds a secretary that has sent no broadcast at all', () => {
    expect(broadcast.thePauseReadingFor(idOf['none']!)).toMatchObject({ paused: false, broadcasts: 0 })
    const pass = tick(dueOn(2))
    expect(pass.broadcastsPaused).not.toContain(idOf['none'])
    expect(pass.broadcastsReminded).toContain(idOf['none'])
  })
})

describe('(l) set to a number, it pauses as before', () => {
  it('pauses after three unanswered broadcasts when it is set to 3, and sends no reminder', () => {
    vi.stubEnv(THE_PAUSE.setting, '3')
    broadcastsFrom('three', 2)
    expect(broadcast.thePauseReadingFor(idOf['three']!).paused).toBe(false)
    broadcastsFrom('three', 1)
    expect(broadcast.thePauseReadingFor(idOf['three']!)).toMatchObject({ paused: true, limit: 3, broadcasts: 3 })
    const pass = tick(dueOn(3))
    expect(pass.broadcastsPaused).toContain(idOf['three'])
    expect(pass.broadcastsReminded).not.toContain(idOf['three'])
  })
})
