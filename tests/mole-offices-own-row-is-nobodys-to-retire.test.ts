// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MOLE OFFICE'S OWN PARTICIPANT ROW IS NOBODY'S TO RETIRE. Wave 13r round X.
 *
 * Mole Office writes its own lines as a participant, and its row sits in the agents' registry. Every reading of its id
 * asks for exactly one live row with its handle. Before round X a supervisor or a secretary with its own key could
 * retire that row, and so could the person, a raised agent and a test world's starter. A retired row made the inbox,
 * the participant list, a profile, sending a message, every request made with the office's key and the dead-letter
 * sweep fail, no door put it back, and a restart did not mend it.
 *
 * WHAT IS ASKED HERE.
 *   1. The retire door refuses Mole Office's own row to every caller, the person included, in the words the office
 *      already gives for a rename, at both positions of the gate who-retires-an-agent, and the gate counts nothing.
 *      The row stays live, and the office still reads its id.
 *   2. The profile tells the person they may not retire it, so the page draws no press.
 *   3. A secretary cannot propose the row as a permanent resident, and the person cannot confirm a proposal that names
 *      it. Nothing is filed, and no space is made.
 *   4. The person cannot write themselves down as the row's starter.
 * One case is a control: the person still retires a made-up worker, so the door itself works in this run.
 *
 * No refusal's words are copied here. The retire and the starter cases ask for the office's own sentence, imported from
 * where it is written. The resident cases ask that the refusal names the row as the registry holds it.
 *
 * MUTATIONS, after a control run. Take out the first step of whoMayRetire, which refuses Mole Office's own row, and
 * every retire case goes red but the control. Take the Mole Office line out of whyThisAgentMayNotBeProposed, and both
 * resident cases go red. Take the Mole Office line out of sayYouStartedThisAgent, and the starter case goes red.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Every agent is made up and
 * holds the key the office answered. The test world is this process told so through its environment, and it is put
 * back after the case. The proposal that names Mole Office's row is a made-up worker's proposal with the agent it names
 * rewritten straight in the scratch database, which stands for a proposal filed before round X. If the office wrongly
 * lets a retire through, the case puts the row back straight in the scratch database. Every name and reason is made up.
 */

import type { FastifyInstance } from 'fastify'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { GATES } from '../src/config/gates.mjs'
import { MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_SLEEP_TIME, apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const SUPERVISOR = 'round-x-supervisor'
const SECRETARY = 'round-x-secretary'
const RAISED = 'round-x-raised-secretary'
const STARTER = 'round-x-world-starter'
const WORKER = 'round-x-worker'
const PROPOSED = 'round-x-proposed-worker'
const BECAUSE = 'A made-up reason for this test.'
const RETIRES = 'who-retires-an-agent'

let t: TestDb
let app: FastifyInstance
let moleOffice = ''
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const switched = new Set<string>()

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

/** The person starts an agent, and the key the office answered is kept. */
async function start(handle: string, role: 'secretary' | 'supervisor' | 'worker'): Promise<void> {
  const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
  expect(started.status, started.raw).toBe(201)
  keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
}

/** The person sets a gate's position, or takes their choice back with null; it is taken back after each case. */
async function setTheGate(gate: string, value: 'block' | 'off' | null): Promise<void> {
  const row = GATES.find((one) => one.id === gate)
  expect(row, `the gate list has no row "${gate}"`).toMatchObject({ group: 'who-may-act', whoMayChange: 'the-person' })
  const saved = await call('POST', '/api/office/settings', PERSON, { changes: [{ name: row!.setting, value }], because: 'A made-up reason for a gate' })
  expect(saved.status, saved.raw).toBe(200)
  switched.add(gate)
}

function counted(gate: string): { would_stop: number; stopped: number; reminded: number } {
  const row = t.client.sqlite.prepare('SELECT SUM(would_stop) AS would_stop, SUM(stopped) AS stopped, SUM(reminded) AS reminded FROM gate_counts WHERE gate = ?').get(gate) as Record<string, number | null>
  return { would_stop: row['would_stop'] ?? 0, stopped: row['stopped'] ?? 0, reminded: row['reminded'] ?? 0 }
}

/** Mole Office's own row as the registry holds it, in the columns the doors asked here could change. */
const moleOfficesRow = (): Record<string, unknown> =>
  t.client.sqlite
    .prepare('SELECT name, retired, retired_by_id, started_by_kind, started_by_id, resident_since FROM agents WHERE id = ?')
    .get(moleOffice) as Record<string, unknown>

/** Ask to retire Mole Office's own row. A press the office wrongly lets through is undone straight in the scratch database. */
async function retireMoleOffice(headers: Record<string, string>): Promise<Awaited<ReturnType<typeof call>>> {
  const before = moleOfficesRow()
  const reply = await call('POST', `/api/participants/agent/${moleOffice}/retire`, headers, { because: BECAUSE })
  if (reply.status < 300) {
    t.client.sqlite.prepare('UPDATE agents SET retired = 0, retired_because = NULL, retired_at = NULL, retired_by_kind = NULL, retired_by_id = NULL WHERE id = ?').run(moleOffice)
  }
  expect(reply.status, `the retire of Mole Office's own row: ${reply.raw}`).toBe(403)
  expect(reply.error, 'the retire was refused in other words than the office gives for Mole Office\'s own row').toContain(MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE)
  expect(moleOfficesRow(), 'a refused retire changed Mole Office\'s own row').toEqual(before)
  return reply
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [[SUPERVISOR, 'supervisor'], [SECRETARY, 'secretary'], [RAISED, 'secretary'], [STARTER, 'worker'], [WORKER, 'worker'], [PROPOSED, 'worker']] as const) {
    await start(handle, role)
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  moleOffice = (await import('../src/shared/participants.ts')).moleOfficeId()
  expect(moleOfficesRow(), 'the scratch office has no live row for Mole Office').toMatchObject({ retired: 0 })
}, 60_000)

afterEach(async () => {
  for (const gate of switched) await setTheGate(gate, null)
  switched.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the retire door refuses Mole Office\'s own row to every caller', () => {
  // The control: nothing here is about Mole Office's row, so it reads the door as it stands before round X.
  it('the person still retires a made-up worker, so the door itself works', async () => {
    const done = await call('POST', `/api/participants/agent/${WORKER}/retire`, PERSON, { because: BECAUSE })
    expect(done.status, done.raw).toBe(200)
  })

  it('the person, proved by their key, is refused, the row stays live, and the office still reads its id', async () => {
    const before = counted(RETIRES)
    await retireMoleOffice(PERSON)
    const { moleOfficeId } = await import('../src/shared/participants.ts')
    expect(moleOfficeId(), 'the office reads another id for itself after a refused retire').toBe(moleOffice)
    const listed = await call('GET', '/api/participants', PERSON)
    expect(listed.status, listed.raw).toBe(200)
    expect(counted(RETIRES), 'the person\'s refused retire was counted').toEqual(before)
  })

  for (const position of ['block', 'off'] as const) {
    it(`at ${position}, a supervisor and a secretary with their own keys, and a secretary the person raised, are refused, and the gate counts nothing`, async () => {
      if (position === 'off') await setTheGate(RETIRES, 'off')
      const before = counted(RETIRES)
      for (const handle of [SUPERVISOR, SECRETARY, RAISED]) await retireMoleOffice(as(handle))
      expect(counted(RETIRES), 'a refused retire of Mole Office\'s own row was counted').toEqual(before)
    })
  }

  it('inside a test world, the agent that started it is refused, though it holds the owner\'s authority there', async () => {
    const { forgetTheWorldsOwnAuthority } = await import('../src/server/lib/worldauthority.ts')
    process.env.MOLE_OFFICE_WORLD_STARTED_BY = STARTER
    forgetTheWorldsOwnAuthority()
    try {
      await retireMoleOffice(as(STARTER))
    } finally {
      delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
      forgetTheWorldsOwnAuthority()
    }
  })

  it('the profile tells the person they may not retire Mole Office\'s own row, so the page draws no press', async () => {
    const read = await call('GET', `/api/participants/agent/${moleOffice}/profile`, PERSON)
    expect(read.status, read.raw).toBe(200)
    expect(read.body.mayRetire?.may, 'the profile offers the person a retire of Mole Office\'s own row').toBe(false)
    expect(String(read.body.mayRetire?.whyNot ?? '')).toContain(MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE)
  })
})

describe('Mole Office\'s own row cannot be a permanent resident', () => {
  const proposals = (): number => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'proposal'").get() as { n: number }).n

  it('a secretary\'s proposal of the row is refused in words that name it, and nothing is filed', async () => {
    const before = proposals()
    const refused = await call('POST', '/api/residents/proposals', as(SECRETARY), { agentId: moleOffice, because: BECAUSE, sleepTime: A_SLEEP_TIME })
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.error, 'the refusal does not name Mole Office\'s own row').toContain(String(moleOfficesRow()['name']))
    expect(proposals(), 'a refused proposal filed a record').toBe(before)
    expect(moleOfficesRow()['resident_since']).toBeNull()
  })

  it('the person\'s confirm of a proposal that names the row is refused, the row is no resident, and no space is made', async () => {
    const proposed = await call('POST', '/api/residents/proposals', as(SECRETARY), { agentId: PROPOSED, because: BECAUSE, sleepTime: A_SLEEP_TIME })
    expect(proposed.status, proposed.raw).toBe(201)
    const id = String(proposed.body.proposal?.id ?? '')
    // A proposal filed before round X, standing for one: the agent it names is rewritten straight in the scratch database.
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.extra.residency.agentId', ?) WHERE id = ?").run(moleOffice, id)
    const refused = await call('POST', `/api/residents/proposals/${id}/confirm`, PERSON)
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.error, 'the refusal does not name Mole Office\'s own row').toContain(String(moleOfficesRow()['name']))
    expect(moleOfficesRow()['resident_since'], 'Mole Office\'s own row was made a resident').toBeNull()
    expect(existsSync(join(dirname(t.file), 'personal-spaces', moleOffice)), 'a space was made for Mole Office\'s own row').toBe(false)
  })
})

describe('nobody is written down as the starter of Mole Office\'s own row', () => {
  it('the person who says they started it is refused, and no starter is written', async () => {
    const refused = await call('PATCH', `/api/participants/agent/${moleOffice}`, PERSON, { startedBy: 'me' })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error, 'the starter was refused in other words than the office gives for Mole Office\'s own row').toContain(MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE)
    expect(moleOfficesRow(), 'a refused starter was written').toMatchObject({ started_by_kind: null, started_by_id: null })
  })
})
