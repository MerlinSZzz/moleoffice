// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT REGISTERED WITH NO KEY OF ITS OWN IS GIVEN NONE, AND A READ IN ITS NAME NEEDS A RUN KEY OR THE OFFICE'S KEY.
 * Wave 13j, the round after the self-start, item 1. The secretary decided the reads in message WcEGDLjbKX5u (answer A): "A
 * request in a run-keys-only agent's name is answered only with a run key or the office's key, for reads and writes
 * alike, whether the key window is open or closed." src/server/lib/run-keys-only.ts holds the rule and its sentences.
 *
 * EVERYTHING HERE IS MADE UP: the office, its keys and the agents. Every request goes over a real loopback listener.
 *
 * THE AGENTS. nk-starter is started by the person and holds its own key. It registers four agents with `noKey: true`
 * through its own key, so each is marked and nk-starter is its registered starter: nk-worker, nk-fresh, nk-late and
 * nk-granted. It starts nk-keyed without the field, as the control. nk-old is registered with no key and then has the
 * mark taken off in-process: it stands for a row from before the mark that never held a key.
 *
 * WHAT IS PROVED. Each door that can make a long-lived key refuses a marked agent, in one sentence that says why, and
 * writes nothing: no record, no change row and no key. Each answers an unmarked agent as before.
 *   1. The first key at POST /api/agents/register-myself, for a handle whose agent never held a key
 *      (`collectAFirstKey`). nk-old is answered a key; nk-fresh is refused.
 *   2. The new-key ask, POST /api/agents/register-myself with "newKey": true (`askForANewKey`). nk-keyed files one;
 *      nk-worker, asking with its own run key, is refused, and its starter is told nothing. And an ask granted before
 *      the doors closed is not collected: nk-granted's collect is refused and the grant stays unused.
 *   3. The grant of a new-key ask, POST /api/roles/requests/<id>/grant (`answerANewKeyAsk`), which revokes every live
 *      key of the agent, run keys included. nk-late's grant is refused and its run key still works. Refusing the ask
 *      is still answered, because a refusal makes no key.
 *   4. A starter's re-key, POST /api/participants/agent/<id>/new-key (`aStarterReKeysAnAgent`). nk-starter re-keys
 *      nk-keyed; its re-key of nk-worker is refused and nk-worker's run key still works.
 *   5. A read in nk-worker's name with no key, with a long-lived key made in-process, and with that key sent alone, is
 *      refused in one sentence. With its run key, or with the office's key, it is answered. A read in nk-keyed's name
 *      with no key, and a read that names nobody, are answered as before. After the person closes the key window,
 *      the read with no key and the read with the long-lived key are refused in the same sentence, and the run key and
 *      the office's key are still answered.
 *
 * AN ASK FILED OR GRANTED BEFORE THE DOORS CLOSED. Points 2 and 3 need an ask about a marked agent. After this round no
 * door files one, so the mark is taken off in-process while the ask is filed (and granted, for nk-granted), and put
 * back. That is the state an office that ran the mark before these doors were closed can hold.
 *
 * MUTATION PROOF (after a green control, each alone, restored with cp and checked with cmp, then green again): in the
 * commit that closes the doors (wave 13j, the round after the self-start), which names its logs. One mutation per
 * door, each removing that door's refusal, and one that answers a read in such an agent's name as before.
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
const keyAlone = (key: string): Record<string, string> => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': key })

/** The one sentence every door that makes a key answers such an agent. */
const THE_DOOR_SENTENCE = (handle: string): string =>
  `"${handle}" was registered with no key of its own, so no door makes it a key, files an ask for one or grants one. ` +
  "It writes and reads only with a run key or the office's key. Nothing was written."
/** The one sentence a read in such an agent's name is refused with. */
const THE_READ_SENTENCE = (handle: string): string =>
  `"${handle}" was registered with no key of its own, so a read in its name is answered only with a run key or the office's key, and this request carried neither, so nothing was read.`

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

const count = (sql: string, ...args: unknown[]): number => (t.client.sqlite.prepare(sql).get(...args) as { n: number }).n
const markOf = (handle: string): number => count('SELECT run_keys_only AS n FROM agents WHERE id = ?', idOf(handle))
const liveKeysOf = (handle: string): number =>
  count("SELECT count(*) AS n FROM held_keys WHERE whose_kind = 'agent' AND whose_id = ? AND revoked_at IS NULL", idOf(handle))
const keysEverHeldBy = (handle: string): number => count("SELECT count(*) AS n FROM held_keys WHERE whose_kind = 'agent' AND whose_id = ?", idOf(handle))

/** Everything a door might write, counted. */
function whatIsStored(): { records: number; changes: number; heldKeys: number; liveKeys: number } {
  return {
    records: count('SELECT count(*) AS n FROM records'),
    changes: count('SELECT count(*) AS n FROM changes'),
    heldKeys: count('SELECT count(*) AS n FROM held_keys'),
    liveKeys: count('SELECT count(*) AS n FROM held_keys WHERE revoked_at IS NULL'),
  }
}

/** The mark, taken off in-process for the length of `act` and put back. See the header. */
async function withTheMarkOff<T>(handle: string, act: () => Promise<T>): Promise<T> {
  t.client.sqlite.prepare('UPDATE agents SET run_keys_only = 0 WHERE id = ?').run(idOf(handle))
  try {
    return await act()
  } finally {
    t.client.sqlite.prepare('UPDATE agents SET run_keys_only = 1 WHERE id = ?').run(idOf(handle))
  }
}

/** Who a key alone proves: the actor the change log writes for a note sent with it and nothing else. */
async function whoTheKeyProves(key: string): Promise<string> {
  const note = await call('POST', '/api/records', keyAlone(key), { kind: 'note', title: `written with a key ${randomBytes(3).toString('hex')}` })
  if (note.status !== 201) return `refused ${String(note.status)}`
  const id = String((note.json['record'] as { id: string }).id)
  const row = t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(id) as { type: string; id: string }
  return `${row.type}:${row.id}`
}

/** The register-myself door, for a handle a live agent bears. `extra` carries "newKey" and "askSecret". */
const registerMyself = (handle: string, headers: Record<string, string>, extra: Record<string, unknown> = {}) =>
  call('POST', '/api/agents/register-myself', headers, { handle, name: `The agent ${handle}`, workingDirectory: DIR, ...extra })

const keyIn = (reply: { json: Record<string, unknown> }): string | null => {
  const headers = reply.json['headers'] as Record<string, string> | undefined
  const key = headers?.['x-mole-office-key']
  return key === undefined ? null : key
}

/** Whether the key was answered on a new-key ask. */
function keyAnsweredOn(requestId: string): boolean {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(requestId) as { data: string }
  const extra = (JSON.parse(row.data) as { extra?: { newKey?: { keyAnsweredAt?: string } } }).extra
  return typeof extra?.newKey?.keyAnsweredAt === 'string'
}
const answerOn = (requestId: string): unknown =>
  (JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(requestId) as { data: string }).data) as { answer?: unknown }).answer

/** Every new-key ask about this agent. */
const newKeyAsksAbout = (handle: string): number =>
  count("SELECT count(*) AS n FROM records WHERE kind = 'role_request' AND json_extract(data, '$.extra.newKey.agent') = ?", idOf(handle))

let starterKey = ''
let keyedKey = ''

/** nk-starter registers an agent with no key of its own through its own key. */
async function registerWithNoKey(handle: string): Promise<void> {
  const r = await call('POST', '/api/agents/started', asAgent('nk-starter', starterKey), { handle, name: handle, runtime: 'claude-code', noKey: true })
  expect(r.status, hidden(r.text)).toBe(201)
  expect(markOf(handle)).toBe(1)
  expect(keysEverHeldBy(handle)).toBe(0)
}

/** The office files its own start of the worker; hand starts need an asking run and are proved separately. */
async function aRunOf(handle: string, title: string): Promise<{ id: string; key: string }> {
  const filed = await call('POST', '/api/records', keyAlone(OFFICE_KEY), {
    kind: 'session',
    title,
    data: { state: 'running', startedByMoleOffice: true, runtime: 'claude-code', servingAgentId: idOf(handle), servingAgent: handle },
  })
  expect(filed.status, hidden(filed.text)).toBe(201)
  const key = String((filed.json['runKey'] as { key?: string } | undefined)?.key)
  expect(key, `the office minted ${handle}'s run no key`).toMatch(/^[0-9a-f]{64}$/)
  return { id: String((filed.json['record'] as { id: string }).id), key }
}

let workerRun = { id: '', key: '' }

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

  const starter = await call('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'nk-starter', name: 'nk-starter' })
  expect(starter.status, hidden(starter.text)).toBe(201)
  starterKey = String((starter.json['whatToGiveIt'] as { key?: string }).key)
  const keyed = await call('POST', '/api/agents/started', asAgent('nk-starter', starterKey), { handle: 'nk-keyed', name: 'nk-keyed', runtime: 'claude-code' })
  expect(keyed.status, hidden(keyed.text)).toBe(201)
  keyedKey = String((keyed.json['whatToGiveIt'] as { key?: string }).key)
  expect(keyedKey).toMatch(/^[0-9a-f]{64}$/)
  expect(markOf('nk-keyed')).toBe(0)
  for (const handle of ['nk-worker', 'nk-fresh', 'nk-late', 'nk-granted', 'nk-old']) await registerWithNoKey(handle)
  t.client.sqlite.prepare('UPDATE agents SET run_keys_only = 0 WHERE id = ?').run(idOf('nk-old'))
  workerRun = await aRunOf('nk-worker', 'A made-up run of nk-worker')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('1. the first key at register-myself', () => {
  it('answers a key to an unmarked agent that never held one, as before', async () => {
    const r = await registerMyself('nk-old', AS_THE_PERSON)
    expect(r.status, hidden(r.text)).toBe(200)
    expect(r.json['alreadyRegistered']).toBe(true)
    expect(keyIn(r), 'an unmarked agent that never held a key was answered no key').toMatch(/^[0-9a-f]{64}$/)
    expect(liveKeysOf('nk-old')).toBe(1)
  })

  it('refuses it to a marked agent, in one sentence, and writes nothing', async () => {
    const before = whatIsStored()
    const r = await registerMyself('nk-fresh', AS_THE_PERSON)
    expect(r.status, hidden(r.text)).toBe(403)
    expect(r.json['error']).toBe(THE_DOOR_SENTENCE('nk-fresh'))
    expect(keyIn(r)).toBeNull()
    expect(whatIsStored()).toEqual(before)
    expect(keysEverHeldBy('nk-fresh')).toBe(0)
  })
})

describe('2. the new-key ask, and collecting a key on it', () => {
  it('files an unmarked agent’s ask as before', async () => {
    const asked = await registerMyself('nk-keyed', asAgent('nk-keyed'), { newKey: true })
    expect(asked.status, hidden(asked.text)).toBe(202)
    expect(newKeyAsksAbout('nk-keyed')).toBe(1)
  })

  it('refuses a marked agent’s ask, made with its own run key, tells its starter nothing, and writes nothing', async () => {
    const before = whatIsStored()
    const asked = await registerMyself('nk-worker', asAgent('nk-worker', workerRun.key), { newKey: true })
    expect(asked.status, hidden(asked.text)).toBe(403)
    expect(asked.json['error']).toBe(THE_DOOR_SENTENCE('nk-worker'))
    expect(whatIsStored()).toEqual(before)
    expect(newKeyAsksAbout('nk-worker')).toBe(0)
  })

  it('does not hand over a key granted before the doors closed, and the grant stays unused', async () => {
    const run = await aRunOf('nk-granted', 'A made-up run of nk-granted')
    const { request, secret } = await withTheMarkOff('nk-granted', async () => {
      const asked = await registerMyself('nk-granted', asAgent('nk-granted', run.key), { newKey: true })
      expect(asked.status, hidden(asked.text)).toBe(202)
      const granted = await call('POST', `/api/roles/requests/${String(asked.json['request'])}/grant`, asAgent('nk-starter', starterKey), {})
      expect(granted.status, hidden(granted.text)).toBe(200)
      return { request: String(asked.json['request']), secret: String(asked.json['askSecret']) }
    })
    expect(liveKeysOf('nk-granted'), 'the grant left a live key').toBe(0)
    const before = whatIsStored()
    const collected = await registerMyself('nk-granted', AS_THE_PERSON, { newKey: true, askSecret: secret })
    expect(collected.status, hidden(collected.text)).toBe(403)
    expect(collected.json['error']).toBe(THE_DOOR_SENTENCE('nk-granted'))
    expect(keyIn(collected)).toBeNull()
    expect(whatIsStored()).toEqual(before)
    expect(keyAnsweredOn(request), 'the refused collect used the grant').toBe(false)
    expect(liveKeysOf('nk-granted')).toBe(0)
  })
})

describe('3. the grant of a new-key ask', () => {
  it('refuses the grant for a marked agent, revokes nothing, and still takes a refusal of the ask', async () => {
    const run = await aRunOf('nk-late', 'A made-up run of nk-late')
    const request = await withTheMarkOff('nk-late', async () => {
      const asked = await registerMyself('nk-late', asAgent('nk-late', run.key), { newKey: true })
      expect(asked.status, hidden(asked.text)).toBe(202)
      return String(asked.json['request'])
    })
    const before = whatIsStored()
    const granted = await call('POST', `/api/roles/requests/${request}/grant`, asAgent('nk-starter', starterKey), {})
    expect(granted.status, hidden(granted.text)).toBe(403)
    expect(granted.json['error']).toBe(THE_DOOR_SENTENCE('nk-late'))
    expect(whatIsStored()).toEqual(before)
    expect(answerOn(request)).toBeUndefined()
    expect(await whoTheKeyProves(run.key), 'the refused grant revoked the run key').toBe(`agent:${idOf('nk-late')}`)

    const refused = await call('POST', `/api/roles/requests/${request}/refuse`, asAgent('nk-starter', starterKey), {})
    expect(refused.status, hidden(refused.text)).toBe(200)
    expect(answerOn(request)).toBe('refused')
    expect(await whoTheKeyProves(run.key)).toBe(`agent:${idOf('nk-late')}`)
  })
})

describe('4. a starter’s re-key', () => {
  it('re-keys an unmarked agent as before', async () => {
    const done = await call('POST', '/api/participants/agent/nk-keyed/new-key', asAgent('nk-starter', starterKey), {})
    expect(done.status, hidden(done.text)).toBe(201)
    keyedKey = String(done.json['key'])
    expect(await whoTheKeyProves(keyedKey)).toBe(`agent:${idOf('nk-keyed')}`)
  })

  it('refuses to re-key a marked agent, writes nothing, and its run key still works', async () => {
    const before = whatIsStored()
    const done = await call('POST', '/api/participants/agent/nk-worker/new-key', asAgent('nk-starter', starterKey), {})
    expect(done.status, hidden(done.text)).toBe(403)
    expect(done.json['error']).toBe(THE_DOOR_SENTENCE('nk-worker'))
    expect(done.json).not.toHaveProperty('key')
    expect(whatIsStored()).toEqual(before)
    expect(await whoTheKeyProves(workerRun.key)).toBe(`agent:${idOf('nk-worker')}`)
  })
})

describe('5. a read in the name of an agent with no key of its own', () => {
  let longLived = ''

  it('is refused with no key, with a long-lived key, and with that key sent alone, in one sentence', async () => {
    // A LONG-LIVED KEY OF ITS OWN, made here in-process. No door gives one, so this stands for a key made some other way.
    const keys = await import('../src/server/lib/keys.ts')
    longLived = keys.makeAnAgentKey(idOf('nk-worker'), null)
    for (const [said, headers] of [
      ['no key', asAgent('nk-worker')],
      ['a long-lived key', asAgent('nk-worker', longLived)],
      ['a long-lived key sent alone', keyAlone(longLived)],
    ] as const) {
      const read = await call('GET', `/api/records/${workerRun.id}`, headers)
      expect(read.status, `${said}: ${hidden(read.text).slice(0, 400)}`).toBe(403)
      expect(read.json['error'], said).toBe(THE_READ_SENTENCE('nk-worker'))
      const waiting = await call('GET', '/api/messages?only=waiting-for-me', headers)
      expect(waiting.status, `${said}: ${hidden(waiting.text).slice(0, 400)}`).toBe(403)
      expect(waiting.json['error'], said).toBe(THE_READ_SENTENCE('nk-worker'))
    }
  })

  it('is answered with its run key and with the office’s key', async () => {
    for (const [said, headers] of [
      ['its run key', asAgent('nk-worker', workerRun.key)],
      ['its run key sent alone', keyAlone(workerRun.key)],
      ["the office's key", asAgent('nk-worker', OFFICE_KEY)],
    ] as const) {
      const read = await call('GET', `/api/records/${workerRun.id}`, headers)
      expect(read.status, `${said}: ${hidden(read.text).slice(0, 400)}`).toBe(200)
      const waiting = await call('GET', '/api/messages?only=waiting-for-me', headers)
      expect(waiting.status, `${said}: ${hidden(waiting.text).slice(0, 400)}`).toBe(200)
    }
  })

  it('leaves a keyless read in an unmarked agent’s name, and a read that names nobody, as they were', async () => {
    const unmarked = await call('GET', `/api/records/${workerRun.id}`, asAgent('nk-keyed'))
    expect(unmarked.status, hidden(unmarked.text).slice(0, 400)).toBe(200)
    const nobody = await call('GET', `/api/records/${workerRun.id}`, keyAlone(PERSON_KEY))
    expect(nobody.status, hidden(nobody.text).slice(0, 400)).toBe(200)
  })

  it('is refused in the same sentence after the person closes the key window, and still answered with its run key', async () => {
    // THE CLOSE IS REFUSED WHILE A LIVE AGENT HOLDS NO PROVED KEY, so each marked agent that may hold none gets a run.
    await aRunOf('nk-fresh', 'A made-up run of nk-fresh, so the window may close')
    await aRunOf('nk-granted', 'A made-up second run of nk-granted, so the window may close')
    await aRunOf('nk-late', 'A made-up second run of nk-late, so the window may close')
    const closed = await call('POST', '/api/office/key-window/close', AS_THE_PERSON, {})
    expect(closed.status, hidden(closed.text)).toBe(200)

    const keyless = await call('GET', `/api/records/${workerRun.id}`, asAgent('nk-worker'))
    expect(keyless.status, hidden(keyless.text).slice(0, 400)).toBe(403)
    expect(keyless.json['error']).toBe(THE_READ_SENTENCE('nk-worker'))
    const longLivedAfter = await call('GET', `/api/records/${workerRun.id}`, asAgent('nk-worker', longLived))
    expect(longLivedAfter.status, hidden(longLivedAfter.text).slice(0, 400)).toBe(403)
    expect(longLivedAfter.json['error']).toBe(THE_READ_SENTENCE('nk-worker'))
    const byItsRunKey = await call('GET', `/api/records/${workerRun.id}`, asAgent('nk-worker', workerRun.key))
    expect(byItsRunKey.status, hidden(byItsRunKey.text).slice(0, 400)).toBe(200)
    const byTheOffice = await call('GET', `/api/records/${workerRun.id}`, asAgent('nk-worker', OFFICE_KEY))
    expect(byTheOffice.status, hidden(byTheOffice.text).slice(0, 400)).toBe(200)
  })
})
