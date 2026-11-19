// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT ENDS ITS OWN RAISE, AND NEVER STARTS OR LENGTHENS ONE. An agent cannot start a raise
 * itself, but it may end its own.
 *
 * Through a real listener (the server on a port of its own, asked with fetch). Every agent here sends its own key.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The raised agent ends its own raise at POST /api/roles/raises/<id>/end, with its own key and name: 200, it is no
 *      longer raised, and the end is written on its agent record and on the run the raise was given in.
 *   2. Nobody else ends it: another secretary, itself raised, is refused 403 with the code raiseEndNotYours; the person,
 *      a keyless claim to be the raised agent, and the office's key are refused 403. Nothing is written either way, and
 *      the raise still holds. A raise that no longer holds is refused 409, and an id no raise has 404.
 *   3. No agent starts or lengthens a raise, raised or not: the grant door refuses the agent asking for itself and for
 *      another; the record door refuses a later end written onto its own agent record, and onto its run's raises; the
 *      end door takes no body. Nothing is written, and the raise ends at the time the person chose.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the commit that added this file names the logs)
 * ---------------------------------------------------------------------------------------
 *
 *   - the end door not asking whose raise it is (the `found.agentId !== caller.id` refusal taken out): case 2 goes red;
 *   - the end door refusing the raised agent too (the caller check made to refuse every agent): case 1 goes red (and
 *     case 2, whose refusals then say the other sentence);
 *   - the record door letting an agent write a later end onto its own agent record (`checkNobodyIsWritingTheirOwnCard`
 *     in src/server/lib/records.ts treating the card door as always open): case 3 goes red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, theOfficesKeyHeader, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import type { BuiltServer } from '../src/server/index.ts'

let t: TestDb
let app: BuiltServer
let base = ''
/** Each agent's own key, from its registration. Never printed. */
const keys: Record<string, string> = {}
/** The run the secretary is in when the person raises it, where the raise and its end are written. */
let argusRun = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** An agent's own name, its own key, and (for the secretary) its run. */
function asAgent(handle: string, withKey = true): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(withKey ? { 'x-mole-office-key': keys[handle] ?? '' } : {}),
    ...(handle === THE_TEST_OFFICES_SECRETARY.handle && argusRun !== '' ? { 'x-mole-office-session': argusRun } : {}),
  }
}

async function ask(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const { 'content-type': type, ...rest } = headers
  const reply = await fetch(`${base}${path}`, {
    method,
    headers: payload === undefined ? rest : { ...rest, 'content-type': type ?? 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  const text = await reply.text()
  let body: Record<string, any> = {}
  try {
    body = JSON.parse(text) as Record<string, any>
  } catch {
    body = { error: text }
  }
  return { status: reply.status, body }
}

/** Register an agent as the person, and keep its key. */
async function register(handle: string, role: string): Promise<void> {
  const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
  expect(started.status, JSON.stringify(started.body)).toBe(201)
  const key = String(started.body['whatToGiveIt']?.key ?? '')
  expect(key, `the registration of ${handle} answered no key`).toMatch(/^[0-9a-f]{64}$/)
  keys[handle] = key
}

/** The person's press, with the person's key, until a time. Answers the raise's id. */
async function raise(handle: string, until: string): Promise<string> {
  const given = await ask('POST', `/api/roles/elevation/${handle}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'a test raises it', endsWhen: 'at a time', until })
  expect(given.status, JSON.stringify(given.body)).toBe(201)
  return String(given.body['elevation'].id)
}

/** Who acts for the person now, by handle, as GET /api/roles says. */
async function whoIsRaised(): Promise<string[]> {
  const said = await ask('GET', '/api/roles', AS_THE_PERSON)
  expect(said.status, JSON.stringify(said.body)).toBe(200)
  return (said.body['elevation'].holding as { agent: string }[]).map((one) => one.agent).sort()
}

/** Everything a refused ask could have changed: the grants on the rows, and the run's raises. */
function whatAnEndCouldChange(): unknown {
  const rows = t.client.sqlite.prepare(`SELECT handle, elevation FROM agents WHERE handle IN ('${THE_TEST_OFFICES_SECRETARY.handle}', 'vesta') ORDER BY handle`).all()
  const run = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(argusRun) as { data: string }
  return { rows, raises: (JSON.parse(run.data) as { raises?: unknown }).raises ?? null }
}

const end = (id: string, headers: Record<string, string>, payload?: unknown) => ask('POST', `/api/roles/raises/${id}/end`, headers, payload)

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  base = await app.app.listen({ port: 0, host: '127.0.0.1' })
  await register(THE_TEST_OFFICES_SECRETARY.handle, 'secretary')
  await register('vesta', 'secretary')
  await register('wren', 'worker')
  // THE SECRETARY'S RUN, which it holds, so the person's press writes the raise on it.
  const session = await ask('POST', '/api/records', asAgent(THE_TEST_OFFICES_SECRETARY.handle), { kind: 'session', title: `${THE_TEST_OFFICES_SECRETARY.handle} answering`, data: { state: 'running' } })
  expect(session.status, JSON.stringify(session.body)).toBe(201)
  argusRun = String(session.body['record'].id)
  const held = await ask('POST', `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/hold`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), { session: argusRun, machine: 'a-machine', runtime: 'claude-code' })
  expect(held.status, JSON.stringify(held.body)).toBe(201)
})

afterEach(async () => {
  vi.useRealTimers()
  await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() })
  await ask('DELETE', '/api/roles/elevation/vesta', { ...AS_THE_PERSON, ...thePersonsKeyHeader() })
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('the raised agent', () => {
  it('1: ends its own raise with its own key and name, and the end is written on its record and its run', async () => {
    const id = await raise(THE_TEST_OFFICES_SECRETARY.handle, '2099-01-01 07:00')
    expect(await whoIsRaised()).toEqual([THE_TEST_OFFICES_SECRETARY.handle])
    const over = await end(id, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    expect(over.status, JSON.stringify(over.body)).toBe(200)
    expect(over.body['elevation']).toMatchObject({ id, endedAt: expect.any(String), endedBecause: `"${THE_TEST_OFFICES_SECRETARY.handle}" ended it itself.` })
    expect(over.body['writtenOnTheRun']).toBe(argusRun)
    expect(await whoIsRaised()).toEqual([])
    // ON ITS AGENT RECORD, through the record door, and ON THE RUN the person raised it in.
    const record = (await ask('GET', `/api/records/${String(over.body['writtenOn'])}`, AS_THE_PERSON)).body['record']
    expect((record.data.elevation as { id: string; endedAt?: string }[]).find((one) => one.id === id)?.endedAt).toEqual(expect.any(String))
    const run = (await ask('GET', `/api/records/${argusRun}`, AS_THE_PERSON)).body['record']
    expect((run.data.raises as Record<string, unknown>[]).find((one) => one['elevation'] === id)).toMatchObject({ endedBecause: `"${THE_TEST_OFFICES_SECRETARY.handle}" ended it itself.` })
    // AND ONCE ENDED IT CANNOT BE ENDED AGAIN: 409, and nothing is written.
    const before = whatAnEndCouldChange()
    const again = await end(id, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(String(again.body['error'])).toContain('is already over')
    expect(whatAnEndCouldChange()).toEqual(before)
  })
})

describe('nobody else', () => {
  it('2: another agent, raised or not, the person on this door, a keyless claim and the office key are refused, and nothing is written', async () => {
    const id = await raise(THE_TEST_OFFICES_SECRETARY.handle, '2099-01-01 07:00')
    await raise('vesta', '2099-01-01 07:00')
    expect(await whoIsRaised()).toEqual([THE_TEST_OFFICES_SECRETARY.handle, 'vesta'])
    const before = whatAnEndCouldChange()

    // ANOTHER SECRETARY, ITSELF RAISED, and a worker: the code the page would draw.
    for (const other of ['vesta', 'wren']) {
      const refused = await end(id, asAgent(other))
      expect(refused.status, `${other}: ${JSON.stringify(refused.body)}`).toBe(403)
      expect(refused.body, other).toMatchObject({ code: 'raiseEndNotYours', values: {} })
      expect(String(refused.body['error'])).toContain(`was given to "${THE_TEST_OFFICES_SECRETARY.handle}", not to "${other}"`)
    }
    // THE PERSON HAS THEIR OWN DOOR; A CLAIM TO BE THE SECRETARY WITH NO KEY, AND THE OFFICE'S KEY UNDER THE SECRETARY'S NAME, PROVE NO AGENT.
    for (const [who, headers] of [
      ['the person', { ...AS_THE_PERSON, ...thePersonsKeyHeader() }],
      [`${THE_TEST_OFFICES_SECRETARY.handle} with no key`, asAgent(THE_TEST_OFFICES_SECRETARY.handle, false)],
      [`the office key as ${THE_TEST_OFFICES_SECRETARY.handle}`, { ...asAgent(THE_TEST_OFFICES_SECRETARY.handle, false), ...theOfficesKeyHeader() }],
    ] as const) {
      const refused = await end(id, headers)
      expect(refused.status, `${who}: ${JSON.stringify(refused.body)}`).toBe(403)
      expect(String(refused.body['error']), who).toContain('This door is for the agent a raise was given to')
    }
    // AN ID NO RAISE HAS.
    const nothing = await end('elevation-made-up', asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    expect(nothing.status, JSON.stringify(nothing.body)).toBe(404)

    expect(whatAnEndCouldChange()).toEqual(before)
    expect(await whoIsRaised()).toEqual([THE_TEST_OFFICES_SECRETARY.handle, 'vesta'])
  })
})

describe('no agent starts or lengthens a raise', () => {
  it('3: the grant door, the record door and the end door refuse it, and the raise ends at the time the person chose', async () => {
    // NOT RAISED: an agent cannot start one, for itself or for another.
    for (const [asker, handle] of [[THE_TEST_OFFICES_SECRETARY.handle, THE_TEST_OFFICES_SECRETARY.handle], ['wren', 'vesta']] as const) {
      const started = await ask('POST', `/api/roles/elevation/${handle}`, asAgent(asker), { reason: 'I raise it myself', endsWhen: 'at a time', until: '2099-01-01 07:00' })
      expect(started.status, `${asker} for ${handle}: ${JSON.stringify(started.body)}`).toBe(403)
    }
    expect(await whoIsRaised()).toEqual([])

    // RAISED UNTIL THE TOP OF AN HOUR A LITTLE AHEAD, on the real clock, so the raise is written on the run the secretary holds.
    const endsAt = Math.ceil((Date.now() + 2 * 60 * 60_000) / (60 * 60_000)) * 60 * 60_000
    const until = localStamp(new Date(endsAt))
    const later = localStamp(new Date(endsAt + 24 * 60 * 60_000))
    const id = await raise(THE_TEST_OFFICES_SECRETARY.handle, until)
    const before = whatAnEndCouldChange()
    expect((before as { raises: Record<string, unknown>[] }).raises.find((one) => one['elevation'] === id), 'the raise is on the run').toMatchObject({ until })

    // THE GRANT DOOR, AGAIN, FROM THE RAISED AGENT: a later end is a new grant, and a raise does not carry it.
    const longer = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), { reason: 'a little longer', endsWhen: 'at a time', until: later })
    expect(longer.status, JSON.stringify(longer.body)).toBe(403)
    const forever = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), { reason: 'until I say', endsWhen: 'when you say' })
    expect(forever.status, JSON.stringify(forever.body)).toBe(403)

    // THE RECORD DOOR: a later end written onto its own agent record, and onto its run's raises.
    const recordId = t.client.sqlite.prepare(`SELECT m.record_id AS id FROM agent_records m JOIN agents a ON a.id = m.agent_id WHERE a.handle = '${THE_TEST_OFFICES_SECRETARY.handle}'`).get() as { id: string }
    const grants = (await ask('GET', `/api/records/${recordId.id}`, AS_THE_PERSON)).body['record'].data.elevation as Record<string, unknown>[]
    const lengthened = grants.map((one) => (one['id'] === id ? { ...one, until: later } : one))
    const onTheRecord = await ask('PATCH', `/api/records/${recordId.id}`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), { dataPatch: { elevation: lengthened } })
    expect(onTheRecord.status, JSON.stringify(onTheRecord.body)).toBe(403)
    const raises = (await ask('GET', `/api/records/${argusRun}`, AS_THE_PERSON)).body['record'].data.raises as Record<string, unknown>[]
    const onTheRun = await ask('PATCH', `/api/records/${argusRun}`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      dataPatch: { raises: raises.map((one) => (one['elevation'] === id ? { ...one, until: later } : one)) },
    })
    expect(onTheRun.status, JSON.stringify(onTheRun.body)).toBe(403)

    // THE END DOOR TAKES NO BODY, so it cannot carry a new end.
    const withABody = await end(id, asAgent(THE_TEST_OFFICES_SECRETARY.handle), { until: later })
    expect(withABody.status, JSON.stringify(withABody.body)).toBe(400)

    expect(whatAnEndCouldChange()).toEqual(before)
    // AND IT ENDS AT THE TIME THE PERSON CHOSE.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(endsAt - 1000)
    expect(await whoIsRaised(), 'a second before the end the person chose').toEqual([THE_TEST_OFFICES_SECRETARY.handle])
    vi.setSystemTime(endsAt)
    expect(await whoIsRaised(), 'at the end the person chose').toEqual([])
  })
})
