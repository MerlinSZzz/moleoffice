// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S KEY NEVER PASSES AS THE OFFICE. Problem QWLvqvebC52J, found on 29 September 2026 following the
 * inspector's aside on run yYI5r-EONy9M: with the key window closed, an agent holding its own key sent it with the actor
 * type `system`, or under one of the office's own writer names ('mole-office/the-api-server',
 * 'mole-office/the-message-worker'), and ended another agent's run, which revokes that run's key. The hook that refuses
 * an agent's key under another name (src/server/lib/keyheader.ts) let both through: `system` is a type `actorFrom`
 * accepts, and the office's writer names name no registered agent.
 *
 * WHAT IS REAL: a scratch office with a real listener, because a request no listener carried is the office's own call
 * and is never asked for a key; the key window closed with the person's key, as the live office's is; two agents the
 * person registered, each with the key the office answered.
 *
 *   1. An agent's key under the type system is refused, on a write and on a read, and the run it tried to end still runs.
 *      The header names the key's own holder, so the type alone is what is refused.
 *   2. An agent's key under a name no registered agent answers to is refused: the office's two writer names, the session
 *      hook's writer name and a made-up one. The run still runs.
 *   3. What must still pass does: an agent ends its own run with its own key, and the office's own key ends a run under
 *      the message worker's name, as the office's processes do.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone in src/server/lib/keyheader.ts
 * ---------------------------------------------------------------------------------------
 *
 *   a. An agent's key under a type other than agent let through, as before: case 1 goes red, the run ended.
 *   b. An agent's key under a name no registered agent answers to let through, as before: case 2 goes red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const WORKSPACE = { 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance
let door = ''
const keys = new Map<string, string>()

async function ask(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: Record<string, unknown>; error: string }> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const read = (await res.json()) as Record<string, unknown>
  return { status: res.status, body: read, error: typeof read['error'] === 'string' ? read['error'] : '' }
}

function as(handle: string): Record<string, string> {
  return { ...WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle) ?? '' }
}

/** A running run of the lead's, filed with its own key. */
async function aRunOfTheLeads(title: string): Promise<string> {
  const filed = await ask('POST', '/api/records', as('a-lead'), { kind: 'session', title, data: { state: 'running', runtime: 'claude-code', servingAgent: 'a-lead' } })
  expect(filed.status, filed.error).toBe(201)
  return String((filed.body['record'] as { id: string }).id)
}

function stateOf(run: string): string {
  return (t.client.sqlite.prepare("SELECT json_extract(data, '$.state') AS s FROM records WHERE id = ?").get(run) as { s: string }).s
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  for (const handle of ['a-worker', 'a-lead']) {
    const made = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { ...PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY, 'content-type': 'application/json' },
      payload: { handle, name: handle },
    })
    expect(made.statusCode, made.body).toBe(201)
    keys.set(handle, String((made.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? ''))
  }
  const closed = await ask('POST', '/api/office/key-window/close', { ...PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY })
  expect(closed.status, closed.error).toBe(200)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe("an agent's key never passes as the office", () => {
  it('refuses an agent key under the type system, on a write and on a read, and the run still runs', async () => {
    const run = await aRunOfTheLeads('the lead at work, case 1')
    // THE KEY'S OWN HOLDER BY NAME, so nothing but the type is wrong with this request.
    const system = { ...WORKSPACE, 'x-mole-office-actor-type': 'system', 'x-mole-office-actor-id': 'a-worker', 'x-mole-office-key': keys.get('a-worker') ?? '' }
    const ended = await ask('PATCH', `/api/records/${run}`, system, { dataPatch: { state: 'crashed' } })
    expect(stateOf(run), 'the run was ended by an agent claiming to be the office').toBe('running')
    expect(ended.status, ended.error).toBe(403)
    expect(ended.error).toContain('its header names the type "system"')
    expect(ended.error).toContain('never the office')
    const read = await ask('GET', `/api/records/${run}`, system)
    expect(read.status, read.error).toBe(403)
  })

  it('refuses an agent key under a name no registered agent answers to, the office writer names among them', async () => {
    for (const name of ['mole-office/the-api-server', 'mole-office/the-message-worker', 'claude-code', 'nobody-registered']) {
      const run = await aRunOfTheLeads(`the lead at work, under ${name}`)
      const ended = await ask('PATCH', `/api/records/${run}`, { ...WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': name, 'x-mole-office-key': keys.get('a-worker') ?? '' }, { dataPatch: { state: 'crashed' } })
      expect(stateOf(run), `the run was ended by an agent sending its key under ${name}`).toBe('running')
      expect(ended.status, `${name}: ${ended.error}`).toBe(403)
      expect(ended.error).toContain(`its header names "${name}", which no registered agent answers to`)
    }
  })

  it('still lets an agent end its own run with its own key, and the office end a run with the office key', async () => {
    const own = await aRunOfTheLeads('the lead at work, ended by itself')
    // CRASHED, which a run with no work area to seal may be; finishing would ask for a seal.
    const byItself = await ask('PATCH', `/api/records/${own}`, as('a-lead'), { dataPatch: { state: 'crashed' } })
    expect(byItself.status, byItself.error).toBe(200)
    expect(stateOf(own)).toBe('crashed')
    const other = await aRunOfTheLeads('the lead at work, ended by the office')
    const byTheOffice = await ask('PATCH', `/api/records/${other}`, { ...WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker', 'x-mole-office-key': A_MADE_UP_OFFICE_KEY }, { dataPatch: { state: 'crashed' } })
    expect(byTheOffice.status, byTheOffice.error).toBe(200)
    expect(stateOf(other)).toBe('crashed')
  })
})
