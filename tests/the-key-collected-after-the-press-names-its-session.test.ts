// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ASK THAT COLLECTS ITS KEY AFTER THE PERSON'S PRESS IS TOLD WHICH SESSION RECORD THE PRESS FILED FOR IT.
 *
 * A registration that proves nobody waits for the person's press. The press admits the agent and files its session
 * record (`registerTheSessionItself` in src/server/lib/selfregistration.ts), and the press's own reply names that
 * record. The agent never sees the press's reply. It asks the register door again with its one-time secret, and that
 * 200 reply gave the key and named no session, so a new agent had to look for its own session record by its title.
 *
 * Now the press writes the session beside the agent it admitted, the collecting ask reads it back, and the 200 reply
 * names it as `session` and sends it in `x-mole-office-session` among the headers. The case then writes once with the
 * new key and that header, which shows the session named is one the new key holds.
 *
 * A row the person admitted before the press wrote the session holds none, and its collecting ask names none: the
 * reply's `session` is null and the headers carry no session.
 *
 * Every request goes through the real doors over a loopback listener, with the window open.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS (after a green control), each alone
 * ---------------------------------------------------------------------------------------
 *
 *   a. The press writes no `session` beside the agent it admitted (src/server/api/roles.ts): the first case goes red.
 *   b. `theFirstKeyOn` reads no `session` (src/server/lib/selfregistration.ts): the first case goes red.
 *   c. The door's 200 reply leaves `session` out (src/server/api/participants.ts): both cases go red on `session`.
 *   d. The door's headers take only the asker's own session header, as before: the first case goes red on the header.
 */

import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let here = ''
let personKey = ''

const DIR = `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`

/** A reply shown in a failure message with every key in it replaced, so no log ever carries a key. */
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a key>')

const asAgent = (handle: string, extra: Record<string, string> = {}): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...extra,
})
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(url: string, body: unknown, headers: Record<string, string>): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${here}${url}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: res.status, json, text }
}

const register = (handle: string, extra: Record<string, unknown> = {}) =>
  post('/api/agents/register-myself', { handle, name: `The agent ${handle}`, workingDirectory: DIR, ...extra }, asAgent(handle))

/**
 * A keyless registration that waits, and the person's press that admits it. Hands back the ask's one-time secret, the
 * waiting row and the session record the press filed.
 */
async function waitAndAdmit(handle: string): Promise<{ secret: string; request: string; session: string }> {
  const asked = await register(handle)
  expect(asked.status, hidden(asked.text)).toBe(202)
  const secret = String(asked.json['askSecret'])
  const request = String(asked.json['request'])
  const granted = await post(`/api/roles/requests/${request}/grant`, {}, { ...AS_THE_PERSON, 'x-mole-office-key': personKey })
  expect(granted.status, hidden(granted.text)).toBe(201)
  const session = granted.json['session']
  expect(typeof session, 'the press named no session record').toBe('string')
  return { secret, request, session: String(session) }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  personKey = (JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8')) as { person: string }).person
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  // THE CONTROL FOR EVERY CASE: the window is open on a fresh database.
  const kw = await import('../src/server/lib/keywindow.ts')
  expect(kw.theKeyWindowIsClosed()).toBe(false)
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the ask that collects the key after the press', () => {
  it('names the session record the press filed, sends it among the headers, and the new key holds it', async () => {
    const admitted = await waitAndAdmit('told-its-session')
    const collected = await register('told-its-session', { askSecret: admitted.secret })
    expect(collected.status, hidden(collected.text)).toBe(200)
    expect(collected.json['session'], 'the reply did not name the session the press filed').toBe(admitted.session)
    const headers = collected.json['headers'] as Record<string, string>
    expect(headers['x-mole-office-session'], 'the headers did not carry the session the press filed').toBe(admitted.session)
    const key = String(headers['x-mole-office-key'] ?? '')
    expect(/^[0-9a-f]{64}$/.test(key), 'the ask after the press was answered no key').toBe(true)

    // AND THE HEADERS IT ANSWERED ARE ONES A WRITE MAY SEND: the new key holds the session they name.
    const wrote = await post('/api/records', { kind: 'note', title: 'the first note of a new agent', data: { body: 'written in its own run' } }, { 'content-type': 'application/json', ...headers })
    expect(wrote.status, hidden(wrote.text)).toBe(201)
    const id = String((wrote.json['record'] as { id?: string } | undefined)?.id ?? '')
    const row = t.client.sqlite.prepare("SELECT session_id AS session FROM changes WHERE record_id = ? AND op = 'create' LIMIT 1").get(id) as
      | { session: string | null }
      | undefined
    expect(row?.session).toBe(admitted.session)
  })

  it('names no session for a row admitted before the press wrote one beside the agent', async () => {
    const admitted = await waitAndAdmit('admitted-before')
    // THE ROW AS A PRESS BEFORE THIS CHANGE LEFT IT: the agent it admitted, and no session.
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.extra.firstKey.session') WHERE id = ?").run(admitted.request)
    const collected = await register('admitted-before', { askSecret: admitted.secret })
    expect(collected.status, hidden(collected.text)).toBe(200)
    expect(collected.json['session']).toBeNull()
    const headers = collected.json['headers'] as Record<string, string>
    expect(headers).not.toHaveProperty('x-mole-office-session')
    expect(/^[0-9a-f]{64}$/.test(String(headers['x-mole-office-key'] ?? '')), 'the ask after the press was answered no key').toBe(true)
  })
})
