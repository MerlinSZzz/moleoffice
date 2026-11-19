// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DURABLE AGENT THAT LOST ITS KEY GETS A NEW ONE, FROM THE PERSON OR FROM ITS REGISTERED STARTER.
 * Problem x8ktQfHS5yGr; src/server/lib/newkey.ts.
 *
 * Driven through the real doors over a real loopback listener, and every key is checked by what it
 * proves on a real write, not by a row:
 *
 *   B1  the agent asks, the person presses, the agent asks again: the new key proves the agent and
 *       the old key proves nothing;
 *   B2  a third ask gets no key;
 *   B3  an agent that is not the starter, a keyless claim naming the starter, and the agent itself
 *       cannot grant; the starter with its own key can, and the grant is recorded as its;
 *   B4  the starter re-keys an agent it started in one request, and the act is recorded with the
 *       starter as the one who answers for it.
 *
 * MUTATIONS (after a green control):
 *   B1  drop `revokeEveryLiveKeyHeldBy` from `answerANewKeyAsk` (count = 0) → the old key still
 *       proves the agent, red.
 *   B2  drop the `patchRecord` that marks the ask used in `askForANewKey` → the third ask is
 *       answered a key, red.
 *   B1b skip the one-time secret check in `askForANewKey` → an ask without the secret after the
 *       press is answered the key, red.
 *   B3  in `theStarterProvedItsOwnKey`, drop `holder.id === starter.id` → another agent's key grants,
 *       red.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let here = ''

const PERSON_KEY = randomBytes(32).toString('hex')
const OFFICE_KEY = randomBytes(32).toString('hex')
const DIR = `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`

/** A reply shown in a failure message with every key in it replaced, so no log ever carries a key. */
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a key>')

const asAgent = (handle: string, key?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-key': PERSON_KEY,
}

async function call(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${here}${url}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: res.status, json, text }
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent row for ${handle}`).toBeDefined()
  return row!.id
}

/** Start an agent through the door and hand back its key. */
async function start(handle: string, headers: Record<string, string>): Promise<string> {
  const made = await call('POST', '/api/agents/started', headers, { handle, name: `The agent ${handle}` })
  expect(made.status, hidden(made.text)).toBe(201)
  const key = String((made.json['whatToGiveIt'] as { key?: string }).key)
  expect(key).toMatch(/^[0-9a-f]{64}$/)
  return key
}

/** Who a key alone proves: the actor the change log writes for a note sent with it and nothing else. */
async function whoTheKeyProves(key: string): Promise<string> {
  const note = await call('POST', '/api/records', { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': key }, {
    kind: 'note',
    title: `written with a key ${randomBytes(3).toString('hex')}`,
    data: { body: 'which agent does this key prove?' },
  })
  if (note.status !== 201) return `refused ${String(note.status)}`
  const id = String((note.json['record'] as { id: string }).id)
  const row = t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(id) as { type: string; id: string }
  return `${row.type}:${row.id}`
}

/** An agent asks for a new key, with no key: it lost its own. The collecting ask sends its one-time secret. */
const askForANewKey = (handle: string, askSecret?: string) =>
  call('POST', '/api/agents/register-myself', asAgent(handle), {
    handle,
    name: `The agent ${handle}`,
    workingDirectory: DIR,
    newKey: true,
    ...(askSecret === undefined ? {} : { askSecret }),
  })

/** Whether a new-key ask has been used: the key was answered on it. */
function keyAnsweredOn(requestId: string): boolean {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(requestId) as { data: string }
  const extra = (JSON.parse(row.data) as { extra?: { newKey?: { keyAnsweredAt?: string } } }).extra
  return typeof extra?.newKey?.keyAnsweredAt === 'string'
}

const keyIn = (reply: { json: Record<string, unknown> }): string | null => {
  const headers = reply.json['headers'] as Record<string, string> | undefined
  const key = headers?.['x-mole-office-key']
  return key === undefined ? null : key
}

let lostKey = ''
let lostOnesSecret = ''
let childsSecret = ''
let starterKey = ''
let childKey = ''
let otherKey = ''

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  lostKey = await start('lost-one', AS_THE_PERSON)
  starterKey = await start('a-starter', AS_THE_PERSON)
  otherKey = await start('another-agent', AS_THE_PERSON)
  childKey = await start('its-child', asAgent('a-starter', starterKey))
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('B1: ask, the person’s press, ask again', () => {
  it('answers a key that proves the agent, and the old key proves nothing', async () => {
    // THE CONTROL: the old key proves the agent before anything happens.
    expect(await whoTheKeyProves(lostKey)).toBe(`agent:${idOf('lost-one')}`)

    const asked = await askForANewKey('lost-one')
    expect(asked.status, hidden(asked.text)).toBe(202)
    expect(keyIn(asked) === null, 'the ask was answered a key before any grant').toBe(true)
    const request = String(asked.json['request'])
    const secret = String(asked.json['askSecret'])
    lostOnesSecret = secret
    expect(secret, 'the first ask was answered no one-time secret').toMatch(/^[0-9a-f]{64}$/)
    // THE ASK WAITS ON THE PERSON, whose press is on the ask's own page, and it has changed nothing yet.
    const page = await call('GET', `/api/records/${request}`, AS_THE_PERSON)
    expect((page.json['waitingForThePersonsPress'] as { press?: string } | undefined)?.press).toBe('new-key')
    expect(await whoTheKeyProves(lostKey)).toBe(`agent:${idOf('lost-one')}`)

    const granted = await call('POST', `/api/roles/requests/${request}/grant`, AS_THE_PERSON, {})
    expect(granted.status, hidden(granted.text)).toBe(200)
    expect(granted.json['grantedAs']).toBe('the-person')
    expect(await whoTheKeyProves(lostKey), 'the old key still proves the agent after the grant').not.toBe(`agent:${idOf('lost-one')}`)
    const pageAfter = await call('GET', `/api/records/${request}`, AS_THE_PERSON)
    expect(pageAfter.json).not.toHaveProperty('waitingForThePersonsPress')

    // SOMEBODY ELSE NAMING THE HANDLE AFTER THE PRESS: no secret, or a wrong one, gets no key, and the
    // grant stays unused. MUTATION: skip the secret check in askForANewKey and this is a 200 with a key.
    const noSecret = await askForANewKey('lost-one')
    expect(noSecret.status, hidden(noSecret.text)).toBe(403)
    expect(keyIn(noSecret) === null, 'an ask without the secret was answered a key').toBe(true)
    expect(String(noSecret.json['error'])).toContain('carries no secret')
    expect(keyAnsweredOn(request), 'an ask without the secret used the grant').toBe(false)
    const wrong = await askForANewKey('lost-one', randomBytes(32).toString('hex'))
    expect(wrong.status, hidden(wrong.text)).toBe(403)
    expect(keyIn(wrong) === null, 'an ask with a wrong secret was answered a key').toBe(true)
    expect(keyAnsweredOn(request)).toBe(false)

    const again = await askForANewKey('lost-one', secret)
    expect(again.status, hidden(again.text)).toBe(200)
    expect(keyAnsweredOn(request)).toBe(true)
    const newKey = keyIn(again)
    expect(newKey).toMatch(/^[0-9a-f]{64}$/)
    expect(await whoTheKeyProves(newKey!)).toBe(`agent:${idOf('lost-one')}`)
  })
})

describe('B2: a third ask', () => {
  it('gets no key, and files a new ask that waits for a new grant', async () => {
    // THE SAME SECRET AGAIN collects nothing: the ask it belonged to is used.
    const third = await askForANewKey('lost-one', lostOnesSecret)
    expect(third.status, hidden(third.text)).toBe(202)
    expect(keyIn(third) === null, 'a third ask was answered a key').toBe(true)
  })
})

describe('B3: who may grant an agent’s ask', () => {
  let request = ''
  it('is answered by its registered starter', async () => {
    const asked = await askForANewKey('its-child')
    expect(asked.status, hidden(asked.text)).toBe(202)
    request = String(asked.json['request'])
    childsSecret = String(asked.json['askSecret'])
    expect(asked.json['answersTo']).toEqual({ kind: 'agent', id: idOf('a-starter') })
  })

  it('refuses another agent with its own key, a keyless claim naming the starter, and the agent itself', async () => {
    const another = await call('POST', `/api/roles/requests/${request}/grant`, asAgent('another-agent', otherKey), {})
    expect(another.status, hidden(another.text)).toBe(403)
    const claim = await call('POST', `/api/roles/requests/${request}/grant`, asAgent('a-starter'), {})
    expect(claim.status, hidden(claim.text)).toBe(403)
    const itself = await call('POST', `/api/roles/requests/${request}/grant`, asAgent('its-child', childKey), {})
    expect(itself.status, hidden(itself.text)).toBe(403)
    // NONE OF THEM CHANGED ANYTHING: the child's key still proves it.
    expect(await whoTheKeyProves(childKey)).toBe(`agent:${idOf('its-child')}`)
  })

  it('lets the starter grant it with its own key, and records the grant as the starter’s', async () => {
    const granted = await call('POST', `/api/roles/requests/${request}/grant`, asAgent('a-starter', starterKey), {})
    expect(granted.status, hidden(granted.text)).toBe(200)
    expect(granted.json['grantedAs']).toBe('its-starter')
    expect(await whoTheKeyProves(childKey)).not.toBe(`agent:${idOf('its-child')}`)
    const wrote = t.client.sqlite
      .prepare('SELECT actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC, rowid DESC LIMIT 1')
      .get(request) as { id: string }
    expect([idOf('a-starter'), 'a-starter']).toContain(wrote.id)
    const again = await askForANewKey('its-child', childsSecret)
    expect(again.status, hidden(again.text)).toBe(200)
    childKey = keyIn(again)!
    expect(await whoTheKeyProves(childKey)).toBe(`agent:${idOf('its-child')}`)
  })
})

describe('B4: the starter re-keys an agent it started, in one request', () => {
  it('refuses anybody but the starter proving itself with its own key', async () => {
    const another = await call('POST', '/api/participants/agent/its-child/new-key', asAgent('another-agent', otherKey), {})
    expect(another.status, hidden(another.text)).toBe(403)
    const claim = await call('POST', '/api/participants/agent/its-child/new-key', asAgent('a-starter'), {})
    expect(claim.status, hidden(claim.text)).toBe(403)
    expect(await whoTheKeyProves(childKey)).toBe(`agent:${idOf('its-child')}`)
  })

  it('revokes the old key, hands the new one to the starter once, and records the starter', async () => {
    const done = await call('POST', '/api/participants/agent/its-child/new-key', asAgent('a-starter', starterKey), { because: 'its key file was deleted' })
    expect(done.status, hidden(done.text)).toBe(201)
    const key = String(done.json['key'])
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(done.text.split(key).length - 1, 'the key is written once in the reply').toBe(1)
    expect(await whoTheKeyProves(key)).toBe(`agent:${idOf('its-child')}`)
    expect(await whoTheKeyProves(childKey)).not.toBe(`agent:${idOf('its-child')}`)
    const record = await call('GET', `/api/records/${String(done.json['request'])}`, AS_THE_PERSON)
    const data = (record.json['record'] as { data: Record<string, unknown> }).data
    expect(data['answer']).toBe('granted')
    expect(data['answersTo']).toEqual({ kind: 'agent', id: idOf('a-starter') })
    expect((data['extra'] as { newKey: { grantedAs: string } }).newKey.grantedAs).toBe('its-starter')
    const wrote = t.client.sqlite
      .prepare('SELECT actor_id AS id FROM changes WHERE record_id = ? ORDER BY at ASC, rowid ASC LIMIT 1')
      .get(String(done.json['request'])) as { id: string }
    expect([idOf('a-starter'), 'a-starter']).toContain(wrote.id)
  })

  it('is not open to the agents the person started', async () => {
    const refused = await call('POST', '/api/participants/agent/lost-one/new-key', asAgent('a-starter', starterKey), {})
    expect(refused.status, hidden(refused.text)).toBe(403)
  })
})
