// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REGISTRATION OF A NEW HANDLE THAT PROVES NOBODY WAITS FOR THE PERSON'S PRESS, EVEN WHILE THE
 * WINDOW IS OPEN. Problem ZtbZNZ735RYN; the secretary's decision Nc9QRT9R_IvF.
 *
 * On 25 September 2026 at 21:09 a process in a sandbox ran tools/register-myself.mjs with no key, and
 * the office made a durable agent and recorded the person as its starter. This drives the real door
 * over a real loopback listener, with the window open:
 *
 *   A1  a keyless registration of a new handle lands as a waiting row and makes no agent; the words
 *       say why it waits; the person's press admits it, and the ask after the press is answered the
 *       key once;
 *   A2  the same registration carrying the person's key is admitted at once;
 *   A3  a handle a live agent already bears keeps today's answer;
 *   and a registration proved by an agent's own key records that agent as the starter.
 *
 * MUTATIONS (after a green control):
 *   A1  in the register-myself door, make `windowIsClosed || !itProvedSomebody` read
 *       `windowIsClosed` → the keyless registration makes an agent at once, and A1 goes red.
 *   A2  make `itProvedSomebody` false → the person's key waits too, and A2 goes red.
 *   A3  move the new-handle check above the `existing` branch → A3 goes red.
 *   A4  make the admitting press's sentence (src/server/lib/newkey.ts) say "proved nobody" again → A1 goes red
 *       on the waiting row's first sentence check.
 *   A5  give a keyless registration the closed window's sentence → A1 goes red on the second.
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

const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
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

function agentRows(handle: string): { id: string; started_by_kind: string | null; started_by_id: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT id, started_by_kind, started_by_id FROM agents WHERE handle = ?')
    .all(handle) as { id: string; started_by_kind: string | null; started_by_id: string | null }[]
}

const register = (handle: string, headers: Record<string, string>, extra: Record<string, unknown> = {}) =>
  post('/api/agents/register-myself', { handle, name: `The agent ${handle}`, workingDirectory: DIR, ...extra }, headers)

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
  // THE CONTROL FOR EVERY CASE: the window is open on a fresh database.
  const kw = await import('../src/server/lib/keywindow.ts')
  expect(kw.theKeyWindowIsClosed()).toBe(false)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('A1: a keyless registration of a new handle, with the window open', () => {
  /** The one-time secret the first ask was answered with; only an ask sending it back collects the key. */
  let firstAsksSecret = ''
  it('lands as a waiting row, makes no agent, and says why', async () => {
    // THE NAME THE SESSION GAVE IS NOT ITS HANDLE, so a sentence that draws the handle cannot pass for one that draws
    // the name the person will look for.
    const displayName = 'The Stranger Who Proved Nobody'
    const asked = await register('nobody-proved', asAgent('nobody-proved'), { name: displayName })
    expect(asked.status, hidden(asked.text)).toBe(202)
    firstAsksSecret = String(asked.json['askSecret'])
    expect(asked.json['waiting']).toBe(true)
    expect(String(asked.json['says'])).toContain('proved nobody')
    expect(String(asked.json['says'])).not.toContain('window is closed')
    expect(agentRows('nobody-proved'), 'a keyless registration made an agent').toHaveLength(0)

    // THE WAITING LIST SAYS WHY IT WAITS, in the words every surface reads: the office cannot tell who sent
    // it. Those words are the word list's, so the sentence is read from there, and "proved nobody" is gone
    // from it.
    const waiting = await fetch(`${here}/api/waiting`, { headers: AS_THE_PERSON })
    const items = ((await waiting.json()) as { items: { id: string; because: { what: string }; thePress?: { asking: string } }[] }).items
    const row = items.find((one) => one.id === asked.json['request'])
    const { sayInEnglish } = await import('../src/shared/i18n.ts')
    expect(row?.because.what).not.toContain('proved nobody')
    expect(row?.because.what).toContain(sayInEnglish('cardAsk.admit.unproved', { handle: displayName, card: String(row?.thePress?.asking) }))
    expect(row?.because.what, 'the waiting sentence draws the handle').not.toContain('nobody-proved')

    // AND THE ASK'S OWN PAGE CARRIES THE PERSON'S PRESS, to the person and to nobody else.
    const asPerson = await fetch(`${here}/api/records/${String(asked.json['request'])}`, { headers: AS_THE_PERSON })
    const press = ((await asPerson.json()) as { waitingForThePersonsPress?: { press: string; name: string; says: string } }).waitingForThePersonsPress
    expect(press?.press).toBe('admit')
    expect(press?.name, 'the press carries the stored handle instead of the name the session gave').toBe(displayName)
    expect(press?.says).toContain('One press admits it as an agent')
    expect(press?.says, 'the press sentence draws the handle').not.toContain('nobody-proved')
    expect(press?.says, 'the press sentence does not draw the name the session gave').toContain(displayName)
    const asAnAgent = await fetch(`${here}/api/records/${String(asked.json['request'])}`, { headers: asAgent('nobody-proved') })
    expect((await asAnAgent.json()) as Record<string, unknown>).not.toHaveProperty('waitingForThePersonsPress')
  })

  it('is admitted by one press of the person, and the ask after it is answered the key once', async () => {
    const again = await register('nobody-proved', asAgent('nobody-proved'))
    expect(again.status, hidden(again.text)).toBe(202)
    const granted = await post(`/api/roles/requests/${String(again.json['request'])}/grant`, {}, { ...AS_THE_PERSON, 'x-mole-office-key': PERSON_KEY })
    expect(granted.status, hidden(granted.text)).toBe(201)
    expect(agentRows('nobody-proved')).toHaveLength(1)
    // THE ASK AFTER THE PRESS SENDS BACK THE FIRST ASK'S SECRET (finding 83): an ask without it
    // is answered no key, which tests/the-first-key-needs-proof.test.ts holds.
    const after = await register('nobody-proved', asAgent('nobody-proved'), { askSecret: firstAsksSecret })
    expect(after.status, hidden(after.text)).toBe(200)
    const key = String((after.json['headers'] as Record<string, string>)['x-mole-office-key'] ?? '')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    const once = await register('nobody-proved', asAgent('nobody-proved'))
    expect(once.text.includes(key), 'the key was answered twice').toBe(false)
  })
})

describe('A2: the same with the person key', () => {
  it('is admitted at once, with the person as its starter', async () => {
    const made = await register('the-person-proved', { ...asAgent('the-person-proved'), 'x-mole-office-key': PERSON_KEY })
    expect(made.status, hidden(made.text)).toBe(201)
    const rows = agentRows('the-person-proved')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.started_by_kind).toBe('person')
  })
})

describe('A3: a handle a live agent already bears', () => {
  it('keeps today’s answer: the registration it has, and nothing written', async () => {
    const started = await post('/api/agents/started', { handle: 'already-here', name: 'Already here' }, { ...AS_THE_PERSON, 'x-mole-office-key': PERSON_KEY })
    expect(started.status, hidden(started.text)).toBe(201)
    const again = await register('already-here', asAgent('already-here'))
    expect(again.status, hidden(again.text)).toBe(200)
    expect(again.json['alreadyRegistered']).toBe(true)
    expect(agentRows('already-here')).toHaveLength(1)
  })
})

describe('an agent’s own key proves a registration', () => {
  it('is admitted at once and records that agent as the starter', async () => {
    const started = await post('/api/agents/started', { handle: 'a-starter', name: 'A starter' }, { ...AS_THE_PERSON, 'x-mole-office-key': PERSON_KEY })
    expect(started.status, hidden(started.text)).toBe(201)
    const starterKey = String((started.json['whatToGiveIt'] as { key?: string }).key)
    const starterId = agentRows('a-starter')[0]?.id
    // THE HEADER NAMES THE KEY'S OWN AGENT, because a key sent under another agent's name is refused.
    const made = await register('started-by-a-key', { ...asAgent('a-starter'), 'x-mole-office-key': starterKey })
    expect(made.status, hidden(made.text)).toBe(201)
    const rows = agentRows('started-by-a-key')
    expect(rows[0]?.started_by_kind).toBe('agent')
    expect(rows[0]?.started_by_id).toBe(starterId)
  })
})
