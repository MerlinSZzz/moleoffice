// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GRANTED NEW-KEY ASK THAT NOBODY COLLECTED MAY BE WITHDRAWN, BY THE PERSON OR BY THE STARTER THAT
 * GRANTED IT. Point 9 of a decision; src/server/lib/newkey.ts, `withdrawANewKeyGrant`; the door
 * POST /api/roles/requests/<id>/withdraw.
 *
 * Driven through the real doors over a real loopback listener:
 *
 *   W1  the person withdraws a grant nobody collected: the ask ends as `withdrawn`, says when and as
 *       whom, the old secret collects nothing, and the agent's next ask files a new ask with a new
 *       one-time secret, which a new grant lets it collect;
 *   W2  another agent with its own key, a keyless claim naming the starter and the agent itself are
 *       refused with the sentence naming who may; the starter that granted it withdraws with its own
 *       key; a starter may not withdraw a grant the person made;
 *   W3  a grant already collected cannot be withdrawn, and nothing is written.
 *
 * MUTATIONS (after a green control):
 *   W1  drop the `patchRecord` in `withdrawANewKeyGrant` → the ask stays granted, the next ask is
 *       refused for its secret instead of filing a new ask, red.
 *   W2  drop the `how === null` refusal in `withdrawANewKeyGrant` → another agent's withdrawal goes
 *       through, red.
 *   W3  drop the `ask.keyAnsweredAt !== null` refusal in `withdrawANewKeyGrant` → a collected grant is
 *       withdrawn, red.
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

/** An agent asks for a new key, with no key: it lost its own. The collecting ask sends its one-time secret. */
const askForANewKey = (handle: string, askSecret?: string) =>
  call('POST', '/api/agents/register-myself', asAgent(handle), {
    handle,
    name: `The agent ${handle}`,
    workingDirectory: DIR,
    newKey: true,
    ...(askSecret === undefined ? {} : { askSecret }),
  })

/** The ask's data as stored. */
function dataOf(requestId: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(requestId) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}
const newKeyOn = (requestId: string): Record<string, unknown> =>
  ((dataOf(requestId)['extra'] as Record<string, unknown>)['newKey'] as Record<string, unknown>)

/** The number of revisions written on a record, so a refusal can be shown to have written nothing. */
function revisionsOf(requestId: string): number {
  const row = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes WHERE record_id = ?').get(requestId) as { n: number }
  return row.n
}

const keyIn = (reply: { json: Record<string, unknown> }): string | null => {
  const headers = reply.json['headers'] as Record<string, string> | undefined
  const key = headers?.['x-mole-office-key']
  return key === undefined ? null : key
}

/** File an ask and grant it, and hand back the ask's id and its one-time secret. */
async function askAndGrant(handle: string, granter: Record<string, string>): Promise<{ request: string; secret: string }> {
  const asked = await askForANewKey(handle)
  expect(asked.status, hidden(asked.text)).toBe(202)
  const request = String(asked.json['request'])
  const secret = String(asked.json['askSecret'])
  expect(secret).toMatch(/^[0-9a-f]{64}$/)
  const granted = await call('POST', `/api/roles/requests/${request}/grant`, granter, {})
  expect(granted.status, hidden(granted.text)).toBe(200)
  return { request, secret }
}

let starterKey = ''
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
  await start('lost-its-secret', AS_THE_PERSON)
  starterKey = await start('a-starter', AS_THE_PERSON)
  otherKey = await start('another-agent', AS_THE_PERSON)
  await start('its-child', asAgent('a-starter', starterKey))
  await start('its-second-child', asAgent('a-starter', starterKey))
  await start('collected-one', AS_THE_PERSON)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('W1: the person withdraws a grant nobody collected', () => {
  it('ends the ask, and the agent’s next ask files a new one with a new secret', async () => {
    const { request, secret } = await askAndGrant('lost-its-secret', AS_THE_PERSON)
    // THE CONTROL: before the withdrawal, the ask is granted and the person's page offers the press.
    const before = await call('GET', `/api/records/${request}`, AS_THE_PERSON)
    expect((before.json['grantToWithdraw'] as { requestId?: string } | undefined)?.requestId).toBe(request)
    // AND ONLY THE PERSON IS OFFERED IT: an agent reading the same page is not.
    const agentReads = await call('GET', `/api/records/${request}`, asAgent('another-agent', otherKey))
    expect(agentReads.json).not.toHaveProperty('grantToWithdraw')

    const withdrawn = await call('POST', `/api/roles/requests/${request}/withdraw`, AS_THE_PERSON, {})
    expect(withdrawn.status, hidden(withdrawn.text)).toBe(200)
    expect(withdrawn.json['answer']).toBe('withdrawn')
    expect(withdrawn.json['withdrawnAs']).toBe('the-person')
    expect(withdrawn.json['keysRevoked']).toBe(0)
    expect(String(withdrawn.json['note'])).toContain('stay revoked')

    // THE ASK HAS ENDED, and says when and as whom.
    expect(dataOf(request)['answer']).toBe('withdrawn')
    expect(typeof newKeyOn(request)['withdrawnAt']).toBe('string')
    expect(newKeyOn(request)['withdrawnAs']).toBe('the-person')
    expect(newKeyOn(request)['keyAnsweredAt'], 'the withdrawal marked the ask collected').toBeUndefined()
    const after = await call('GET', `/api/records/${request}`, AS_THE_PERSON)
    expect(after.json).not.toHaveProperty('grantToWithdraw')
    expect(after.json).not.toHaveProperty('waitingForThePersonsPress')

    // A SECOND WITHDRAWAL, A GRANT AND A REFUSAL are all refused: the ask is answered.
    const again = await call('POST', `/api/roles/requests/${request}/withdraw`, AS_THE_PERSON, {})
    expect(again.status, hidden(again.text)).toBe(409)
    const grantAgain = await call('POST', `/api/roles/requests/${request}/grant`, AS_THE_PERSON, {})
    expect(grantAgain.status, hidden(grantAgain.text)).toBe(409)
    expect(String(grantAgain.json['error'])).toContain(`was already withdrawn at ${String(newKeyOn(request)['withdrawnAt'])}`)

    // THE AGENT'S NEXT ASK, even sending the old secret, collects nothing and files a new ask with a new secret.
    const next = await askForANewKey('lost-its-secret', secret)
    expect(next.status, hidden(next.text)).toBe(202)
    expect(keyIn(next) === null, 'the next ask was answered a key').toBe(true)
    const nextRequest = String(next.json['request'])
    expect(nextRequest).not.toBe(request)
    const nextSecret = String(next.json['askSecret'])
    expect(nextSecret).toMatch(/^[0-9a-f]{64}$/)
    expect(nextSecret).not.toBe(secret)

    // AND THE NEW ASK WORKS AS ANY ASK DOES: granted, it is collected with its own secret.
    const granted = await call('POST', `/api/roles/requests/${nextRequest}/grant`, AS_THE_PERSON, {})
    expect(granted.status, hidden(granted.text)).toBe(200)
    const collected = await askForANewKey('lost-its-secret', nextSecret)
    expect(collected.status, hidden(collected.text)).toBe(200)
    expect(keyIn(collected)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('W2: who may withdraw', () => {
  let request = ''
  it('refuses another agent, a keyless claim naming the starter, and the agent itself, with the sentence', async () => {
    ;({ request } = await askAndGrant('its-child', asAgent('a-starter', starterKey)))
    const before = revisionsOf(request)
    const refusals = [
      await call('POST', `/api/roles/requests/${request}/withdraw`, asAgent('another-agent', otherKey), {}),
      await call('POST', `/api/roles/requests/${request}/withdraw`, asAgent('a-starter'), {}),
      await call('POST', `/api/roles/requests/${request}/withdraw`, asAgent('its-child'), {}),
    ]
    for (const refused of refusals) {
      expect(refused.status, hidden(refused.text)).toBe(403)
      expect(String(refused.json['error'])).toBe(
        `Only the person, by their own press, or "a-starter", the agent that granted ${request} as the starter of ` +
          '"its-child", sending its own key, may withdraw this grant. This request was neither. Nothing was written.',
      )
    }
    // NONE OF THEM WROTE ANYTHING.
    expect(revisionsOf(request)).toBe(before)
    expect(dataOf(request)['answer']).toBe('granted')
  })

  it('lets the starter that granted it withdraw it with its own key', async () => {
    const withdrawn = await call('POST', `/api/roles/requests/${request}/withdraw`, asAgent('a-starter', starterKey), {})
    expect(withdrawn.status, hidden(withdrawn.text)).toBe(200)
    expect(withdrawn.json['withdrawnAs']).toBe('its-starter')
    expect(dataOf(request)['answer']).toBe('withdrawn')
    const wrote = t.client.sqlite
      .prepare('SELECT actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC, rowid DESC LIMIT 1')
      .get(request) as { id: string }
    expect([idOf('a-starter'), 'a-starter']).toContain(wrote.id)
  })

  it('does not let a starter withdraw a grant the person made', async () => {
    const { request: byThePerson } = await askAndGrant('its-second-child', AS_THE_PERSON)
    const refused = await call('POST', `/api/roles/requests/${byThePerson}/withdraw`, asAgent('a-starter', starterKey), {})
    expect(refused.status, hidden(refused.text)).toBe(403)
    expect(String(refused.json['error'])).toContain(`Only the person may withdraw the grant on ${byThePerson}, by their own press.`)
    expect(dataOf(byThePerson)['answer']).toBe('granted')
  })
})

describe('W3: a collected grant', () => {
  it('cannot be withdrawn, and nothing is written', async () => {
    const { request, secret } = await askAndGrant('collected-one', AS_THE_PERSON)
    const collected = await askForANewKey('collected-one', secret)
    expect(collected.status, hidden(collected.text)).toBe(200)
    const page = await call('GET', `/api/records/${request}`, AS_THE_PERSON)
    expect(page.json).not.toHaveProperty('grantToWithdraw')
    const before = revisionsOf(request)
    const refused = await call('POST', `/api/roles/requests/${request}/withdraw`, AS_THE_PERSON, {})
    expect(refused.status, hidden(refused.text)).toBe(409)
    expect(String(refused.json['error'])).toContain('was collected at')
    expect(revisionsOf(request)).toBe(before)
    expect(dataOf(request)['answer']).toBe('granted')
  })
})
