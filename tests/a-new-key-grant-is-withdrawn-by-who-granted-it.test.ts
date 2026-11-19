// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW-KEY GRANT IS WITHDRAWN BY THE AGENT THAT GRANTED IT, NOT BY WHOEVER STARTS THE AGENT NOW.
 * Keys wave, round 6; src/server/lib/newkey.ts, `withdrawANewKeyGrant`.
 *
 * Until this round the withdrawal check asked for the agent's CURRENT registered starter. So once the
 * starter changed after a grant, the new starter could withdraw a grant it never made, and the agent
 * that made it could not. Now the check reads who granted it from the grant: the ask says it was
 * granted as the starter, and the revision that wrote `answer: granted` says whose own key proved it.
 *
 * THE STARTER IS MOVED BY THE PERSON'S PRESS, `POST /api/agents/<id>/starter`, which writes the registry
 * row and the agent's records. Since wave 13u round 186 that is the one door that moves an agent that
 * already has a starter to another; a record write of `startedBy` is refused, even the person's, and
 * `PATCH /api/participants/agent/<id>` with `"startedBy": "me"` only fills in a starter nobody recorded.
 * The test then reads the row to see the move landed.
 *
 * One scratch office on a real loopback listener, with its own person key.
 *
 * MUTATION (after a green control; red, then restored): in `withdrawANewKeyGrant`, read the agent's
 * current starter again instead of the agent that granted it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let here = ''

const PERSON_KEY = randomBytes(32).toString('hex')
const OFFICE_KEY = randomBytes(32).toString('hex')
const DIR = `${THE_TEST_FIXTURE_ROOT}/checkout`

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

/** The starter the registry row holds now. */
function theStarterOnTheRow(handle: string): { kind: string | null; id: string | null } {
  const row = t.client.sqlite.prepare('SELECT started_by_kind AS kind, started_by_id AS id FROM agents WHERE id = ?').get(idOf(handle)) as {
    kind: string | null
    id: string | null
  }
  return row
}

let firstKey = ''
let secondKey = ''

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
  firstKey = await start('first-starter', AS_THE_PERSON)
  secondKey = await start('second-starter', AS_THE_PERSON)
  await start('moved-child', asAgent('first-starter', firstKey))
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** Move moved-child to the second starter, through the person's press on its page. */
async function moveTheStarter(): Promise<void> {
  const moved = await call('POST', `/api/agents/${idOf('moved-child')}/starter`, AS_THE_PERSON, {
    to: idOf('second-starter'),
    because: 'A made-up reason: the second starter leads this work now.',
  })
  expect(moved.status, hidden(moved.text)).toBe(200)
  expect(theStarterOnTheRow('moved-child')).toEqual({ kind: 'agent', id: idOf('second-starter') })
}

describe('after the starter changes, a grant the first starter made', () => {
  let request = ''
  it('is refused to the new starter, with the sentence naming the agent that granted it', async () => {
    ;({ request } = await askAndGrant('moved-child', asAgent('first-starter', firstKey)))
    expect(newKeyOn(request)['grantedAs']).toBe('its-starter')
    await moveTheStarter()

    const before = revisionsOf(request)
    const refused = await call('POST', `/api/roles/requests/${request}/withdraw`, asAgent('second-starter', secondKey), {})
    expect(refused.status, `the new starter withdrew a grant it never made: ${hidden(refused.text)}`).toBe(403)
    expect(String(refused.json['error'])).toBe(
      `Only the person, by their own press, or "first-starter", the agent that granted ${request} as the starter of ` +
        '"moved-child", sending its own key, may withdraw this grant. This request was neither. Nothing was written.',
    )
    expect(revisionsOf(request)).toBe(before)
    expect(dataOf(request)['answer']).toBe('granted')
  })

  it('may be withdrawn by the starter that granted it, with its own key', async () => {
    const withdrawn = await call('POST', `/api/roles/requests/${request}/withdraw`, asAgent('first-starter', firstKey), {})
    expect(withdrawn.status, hidden(withdrawn.text)).toBe(200)
    expect(withdrawn.json['withdrawnAs']).toBe('its-starter')
    expect(dataOf(request)['answer']).toBe('withdrawn')
  })

  it('may still be withdrawn by the person', async () => {
    // A NEW ASK, granted by the second starter, which the row names now. The person withdraws it.
    const asked = await askForANewKey('moved-child')
    expect(asked.status, hidden(asked.text)).toBe(202)
    const next = String(asked.json['request'])
    const granted = await call('POST', `/api/roles/requests/${next}/grant`, asAgent('second-starter', secondKey), {})
    expect(granted.status, hidden(granted.text)).toBe(200)
    const withdrawn = await call('POST', `/api/roles/requests/${next}/withdraw`, AS_THE_PERSON, {})
    expect(withdrawn.status, hidden(withdrawn.text)).toBe(200)
    expect(withdrawn.json['withdrawnAs']).toBe('the-person')
  })
})
