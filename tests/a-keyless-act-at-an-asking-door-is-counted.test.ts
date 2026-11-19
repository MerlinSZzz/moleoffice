// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every agent, key and hold in this test is made up. The server listens on a free port of this machine and serves a
 * throwaway database, never the live office.
 *
 * AN ACT AT A DOOR THAT ASKS FOR A KEY IS COUNTED WHERE IT IS REFUSED (wave 13r round AA). The gate
 * an-act-at-a-keyed-door-needs-a-key is counted once for each refusal, at the one place every such door refuses: a
 * request a listener carried that came with no key this office knows, or with a key that proves nobody. A request no
 * listener carried is the office itself and is never refused, so it is never counted, and neither is an act whose key
 * proves its name.
 *
 * WHAT GOES RED. Control run first. Take the count out of the refusal, count before the request is known to be
 * refused, or count a door's own refusal that comes after the key, and a case here turns red.
 */
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { KEY_COOKIE } from '../src/config/key-header.mjs'

const WORKSPACE = 'default'
const KEY_HEADER = 'x-mole-office-key'
/** A key that proves nobody rides in the cookie. In the header it is refused before any door, in its own words. */
const A_COOKIE_THAT_PROVES_NOBODY = `${KEY_COOKIE}=a-made-up-key-this-office-never-made`
const GATE = 'an-act-at-a-keyed-door-needs-a-key'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': WORKSPACE })

let t: TestDb
let app: FastifyInstance
let thisMachine = ''
/** The made-up holder's own key, from the registration door. Never printed. */
let theHoldersKey = ''
let session = ''

async function throughTheListener(url: string, headers: Record<string, string>, payload: unknown): Promise<{status: number; error: string}> {
  const res = await fetch(`${thisMachine}${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) })
  const body = (await res.json()) as Record<string, unknown>
  return { status: res.status, error: typeof body['error'] === 'string' ? body['error'] : '' }
}
/** The gate's refusals so far, today and every day, as the table holds them. */
function counted(): {wouldStop: number; stopped: number} {
  const row = t.client.sqlite.prepare('SELECT coalesce(sum(would_stop), 0) AS wouldStop, coalesce(sum(stopped), 0) AS stopped FROM gate_counts WHERE gate = ?').get(GATE) as {wouldStop: number; stopped: number}
  return { wouldStop: row.wouldStop, stopped: row.stopped }
}
const HOLD = () => ({ url: '/api/handles/holder-one/hold', payload: { session, machine: 'the-test-machine', runtime: 'claude-code' } })

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const register = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
    expect(reply.statusCode, reply.body.replace(/[0-9a-f]{64}/g, '<a key>')).toBe(201)
    return reply.json() as { whatToGiveIt?: { key?: string } }
  }
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  theHoldersKey = (await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'holder-one', name: 'Holder One', role: 'worker', workArea: ['src'] })).whatToGiveIt?.key ?? ''
  expect(theHoldersKey, 'the registration answered no key for the holder').not.toBe('')
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent('holder-one'), payload: { kind: 'session', title: 'A made-up terminal answering as holder-one', data: { state: 'running', runtime: 'claude-code', doing: 'answering as holder-one' } } })
  expect(filed.statusCode, filed.body).toBe(201)
  session = (filed.json() as { record: { id: string } }).record.id
}, 180_000)

afterAll(async () => {
  await app.close()
  t.close()
}, 60_000)

// Mutation: take the gateMet call out of refuseAnActWithNoKey, and the first two counts stay at zero.
it('counts each act a listener carried with no key, or with a key that proves nobody, once where it is refused', async () => {
  expect(counted()).toEqual({ wouldStop: 0, stopped: 0 })
  const noKey = await throughTheListener(HOLD().url, asAgent('holder-one'), HOLD().payload)
  expect(noKey.status, noKey.error).toBe(403)
  expect(noKey.error).toContain('came with no key, so it was not taken.')
  expect(counted()).toEqual({ wouldStop: 1, stopped: 1 })
  const provesNobody = await throughTheListener(HOLD().url, { ...asAgent('holder-one'), cookie: A_COOKIE_THAT_PROVES_NOBODY }, HOLD().payload)
  expect(provesNobody.status, provesNobody.error).toBe(403)
  expect(provesNobody.error).toContain('came with a key that proves nobody here, so it was not taken.')
  expect(counted()).toEqual({ wouldStop: 2, stopped: 2 })
  // Another door that asks refuses at the same place, and is counted on the same gate.
  const atTheMergeTool = await throughTheListener('/api/merge-queue/no-such-entry/tool-ended', asAgent('mole-office/the-message-worker'), { session: 'no-such-tool-run', reason: 'Made-up: it ended.' })
  expect(atTheMergeTool.status, atTheMergeTool.error).toBe(403)
  expect(counted()).toEqual({ wouldStop: 3, stopped: 3 })
}, 60_000)

// Mutation: count at the top of refuseAnActWithNoKey, before it knows the request is refused, and these turn red.
it('counts nothing for the office itself, for an act whose key proves its name, or for a door refusing on its own rules', async () => {
  const before = counted()
  const inProcess = await app.inject({ method: 'POST', url: '/api/merge-queue/no-such-entry/tool-ended', headers: asAgent('mole-office/the-message-worker'), payload: { session: 'no-such-tool-run', reason: 'Made-up: it ended.' } })
  expect(inProcess.statusCode, inProcess.body).toBe(404)
  expect(counted()).toEqual(before)
  const withItsKey = await throughTheListener(HOLD().url, { ...asAgent('holder-one'), [KEY_HEADER]: theHoldersKey }, HOLD().payload)
  expect(withItsKey.error).not.toContain('so it was not taken')
  expect(counted()).toEqual(before)
}, 60_000)
