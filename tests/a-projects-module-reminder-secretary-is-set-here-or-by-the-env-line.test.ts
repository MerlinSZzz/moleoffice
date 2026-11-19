// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECT'S MODULE REMINDER SECRETARY IS SET ON THE SETTINGS PAGE, OR BY THE .ENV LINE WHEN NOTHING IS SET THERE.
 * Wave 13p round 29, on decision aZGg6gerakM1.
 *
 * WHAT THIS FILE PROVES, in its own empty office:
 * 1. Set here beats the .env line: the reading says "set here" and names the agent chosen here.
 * 2. The .env line counts when nothing is set here, and counts again once the choice here is taken away.
 * 3. A .env line that cannot be read is said in the reading, and the reading still answers 200 for every project.
 * 4. The owner's press sets it, with no reason, and the change is kept with who and when.
 * 5. A secretary with its own key sets it only with a reason, and the reason is kept with the change.
 * 6. Another agent is refused, with its own key or without one, and nothing is changed.
 * 7. The record-duty check reminds the secretary set here, not the one the .env line names.
 *
 * WHERE THE RULES LIVE: src/server/lib/module-reminder-secretaries.ts (the one reading and the writer),
 * src/server/api/module-reminder-secretaries.ts (who may change it), and src/server/lib/stale-records.ts (the check).
 *
 * MUTATIONS, each proved red after a control run and restored (/tmp/r29/settings/proofs.md):
 *   1. the reading asks the .env line before the stored choice turns cases 1 and 7 red.
 *   2. the reading ignores the .env line turns case 2 red.
 *   3. the reading no longer catches the .env reader's refusal turns case 3 red.
 *   4. the door no longer lets the owner through turns case 4 red.
 *   5. the door no longer asks a secretary for a reason turns case 5 red.
 *   6. the door lets any agent through turns case 6 red.
 *   7. the check reads the .env line alone again turns case 7 red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const DAY = 86_400_000
const R0 = new Date()
const NOW = new Date(R0.getFullYear(), R0.getMonth(), R0.getDate(), 12, 0, 0, 0)

const idOf: Record<string, string> = {}
const keyOf: Record<string, string> = {}

async function register(handle: string, role: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role } })
  expect(reply.statusCode, `registering ${handle}: ${reply.body.slice(0, 300)}`).toBe(201)
  const body = reply.json() as { agent: { id: string }; whatToGiveIt?: { key?: string } }
  idOf[handle] = body.agent.id
  keyOf[handle] = String(body.whatToGiveIt?.key ?? '')
  expect(keyOf[handle], `${handle} was given a key`).toMatch(/^[0-9a-f]{64}$/)
}

/** The headers of an agent's request, proved by its own key unless `keyed` is false. */
function asAgent(handle: string, keyed = true): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(keyed ? { 'x-mole-office-key': keyOf[handle]! } : {}),
  }
}

interface Row {
  project: string
  inForce: { from: string; agent?: { id: string; handle: string }; handle?: string }
  storedHere: string | null
  because: string | null
  says: string
}

async function reading(): Promise<{ status: number; body: { projects: Row[]; envLine: { readable: boolean; why?: string } } }> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/module-reminder-secretaries', headers: AS_THE_PERSON })
  return { status: reply.statusCode, body: reply.json() }
}

async function theDefaultRow(): Promise<Row> {
  const read = await reading()
  expect(read.status, JSON.stringify(read.body).slice(0, 300)).toBe(200)
  return read.body.projects.find((one) => one.project === 'default')!
}

function choose(headers: Record<string, string>, payload: object) {
  return app.inject({ method: 'POST', url: '/api/office/module-reminder-secretaries/default', headers, payload })
}

/** The newest kept change to this setting. */
async function theLastChange(): Promise<{ by: { type: string; id: string }; to: string | null } | null> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/setting-changes', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  return reply.json().settings['module-reminder-secretaries']
}

beforeAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = 'default=clerk'
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register('clerk', 'secretary')
  await register('scribe', 'secretary')
  await register('mason', 'worker')
}, 120_000)

afterAll(async () => {
  process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = ''
  await app?.close()
  t?.close()
})

describe('the reading in force', () => {
  it('2. the .env line counts when nothing is set here', async () => {
    const row = await theDefaultRow()
    expect(row.storedHere).toBeNull()
    expect(row.inForce).toEqual({ from: 'from the .env line', handle: 'clerk' })
    expect(row.says).toBe('clerk is reminded. From the .env line, because nothing is set here.')
  })

  it('4. the owner\'s press sets it with no reason, and the change is kept with who', async () => {
    const pressed = await choose(AS_THE_PERSON, { secretary: idOf.scribe })
    expect(pressed.statusCode, pressed.body.slice(0, 300)).toBe(200)
    expect(pressed.json().projects.find((one: Row) => one.project === 'default').storedHere).toBe(idOf.scribe)
    const last = await theLastChange()
    expect(last?.by).toEqual({ type: 'human', id: THE_PERSON })
    expect(last?.to).toContain(idOf.scribe)
  })

  it('1. set here beats the .env line', async () => {
    const row = await theDefaultRow()
    expect(row.inForce.from).toBe('set here')
    expect(row.inForce.agent?.id).toBe(idOf.scribe)
    expect(row.says).toBe('scribe is reminded. Set here.')
  })

  it('3. a .env line that cannot be read is said, not thrown', async () => {
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = 'default:clerk'
    try {
      // A SECOND PROJECT, with nothing set here, so the reading has a project that depends on the line.
      const made = await app.inject({ method: 'POST', url: '/api/workspaces', headers: AS_THE_PERSON, payload: { id: 'fixture-garden', title: 'Fixture garden' } })
      expect(made.statusCode, made.body.slice(0, 300)).toBeLessThan(300)
      const read = await reading()
      expect(read.status, JSON.stringify(read.body).slice(0, 300)).toBe(200)
      expect(read.body.envLine.readable).toBe(false)
      expect(read.body.envLine.why).toContain('MOLE_OFFICE_MODULE_REMINDER_SECRETARIES contains "default:clerk"')
      const garden = read.body.projects.find((one) => one.project === 'fixture-garden')!
      expect(garden.inForce).toEqual({ from: '.env line unreadable' })
      expect(garden.says).toBe('No secretary is reminded. Nothing is set here, and the .env line cannot be read.')
      // THE PROJECT WITH A CHOICE HERE keeps it: the line it does not need cannot take it away.
      expect(read.body.projects.find((one) => one.project === 'default')!.inForce.from).toBe('set here')
    } finally {
      process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = 'default=clerk'
    }
  })
})

describe('who may change it', () => {
  it('5. a secretary with its own key is asked for a reason, and the reason is kept', async () => {
    for (const payload of [{ secretary: 'clerk' }, { secretary: 'clerk', because: '   ' }]) {
      const refused = await choose(asAgent('scribe'), payload)
      expect(refused.statusCode, refused.body.slice(0, 300)).toBe(400)
      expect(refused.json()).toMatchObject({ code: 'moduleReminderSecretaryNeedsAReason' })
    }
    expect((await theDefaultRow()).storedHere).toBe(idOf.scribe)
    const done = await choose(asAgent('scribe'), { secretary: 'clerk', because: 'the coordinator fills it' })
    expect(done.statusCode, done.body.slice(0, 300)).toBe(200)
    const row = await theDefaultRow()
    expect(row.storedHere).toBe(idOf.clerk)
    expect(row.because).toBe('the coordinator fills it')
    const last = await theLastChange()
    expect(last?.by).toEqual({ type: 'agent', id: 'scribe' })
    expect(last?.to).toContain('the coordinator fills it')
  })

  it('6. another agent is refused, with its own key or without one, and nothing is changed', async () => {
    for (const headers of [asAgent('mason'), asAgent('mason', false), asAgent('clerk', false)]) {
      const refused = await choose(headers, { secretary: 'scribe', because: 'a fixture asks' })
      expect(refused.statusCode, refused.body.slice(0, 300)).toBe(403)
      expect(refused.json()).toMatchObject({ code: 'moduleReminderSecretaryNotAllowed' })
    }
    expect((await theDefaultRow()).storedHere).toBe(idOf.clerk)
  })

  it('2b. taking the choice here away hands the project back to the .env line', async () => {
    const pressed = await choose(AS_THE_PERSON, { secretary: null })
    expect(pressed.statusCode, pressed.body.slice(0, 300)).toBe(200)
    const row = await theDefaultRow()
    expect(row.storedHere).toBeNull()
    expect(row.because).toBeNull()
    expect(row.inForce).toEqual({ from: 'from the .env line', handle: 'clerk' })
  })
})

describe('the record-duty check', () => {
  it('7. reminds the secretary set here, not the one the .env line names', async () => {
    const id = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'Fixture still module', data: { state: 'active' }, actor: { type: 'human', id: THE_PERSON } }).id
    t.client.sqlite.prepare('UPDATE records SET updated_at = ? WHERE id = ?').run(localStamp(new Date(NOW.getTime() - 20 * DAY)), id)
    const pressed = await choose(AS_THE_PERSON, { secretary: 'scribe' })
    expect(pressed.statusCode, pressed.body.slice(0, 300)).toBe(200)
    expect(process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES).toBe('default=clerk')
    const pass = reminders.sendTheRemindersThatAreDue('default', NOW, new Date(NOW.getTime() - DAY))
    expect(pass.staleReminded).toEqual(['scribe about 1 modules in default'])
  })
})
