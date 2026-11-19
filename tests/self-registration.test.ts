// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE DOOR A SESSION A PERSON STARTED REGISTERS ITSELF THROUGH. F15 point 2; problem pHFu8nivPZ_O.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * On 14 September 2026 a new agent took about twenty tool calls and met two refusals to become
 * registered. `POST /api/agents/register-myself` is the one request in their place. This file drives
 * the real server and checks:
 *
 *   · an unregistered caller registers itself in one request, and the key is named exactly once;
 *   · the same handle asked twice answers the registration it has and makes no second row;
 *   · a registration from another machine is refused, naming the Embassy;
 *   · the door grants no card, the ask reaches GET /api/needs-you and the citizen's page, and the
 *     person's press grants it;
 *   · with the window closed, a registration waits and nothing is registered until the press; with
 *     the window open, one carrying the person's key is admitted at once, and one carrying no key
 *     waits for the owner's press too and appears on the header-only list (decision Nc9QRT9R_IvF);
 *   · the work area is recorded with who registered it (P85's `how`).
 *
 * EVERY CASE IS PROVED BY MUTATION AFTER A CONTROL RUN. The mutations are named at each case.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ApiRoute } from '../src/server/api/kinds.ts'

let t: TestDb
let app: FastifyInstance
let listRoutes: () => readonly ApiRoute[]
let here: string
let elsewhere: Server
let anotherMachine: string

const HANDLE = 'self-registration'
/** A made-up person key: a new handle is admitted at once only when a key proves the request. */
const PERSON_KEY = randomBytes(32).toString('hex')
const AS_ITSELF = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
}
const AS_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(url: string, body: unknown, headers: Record<string, string>): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${here}${url}`, {
    method: 'POST',
    headers: { ...AS_ITSELF, ...headers },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: res.status, json, text }
}

async function getJson(url: string, headers: Record<string, string> = AS_PERSON): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url, headers })
  return { status: res.statusCode, json: res.json() as Record<string, unknown> }
}

/** Reopen the one-version window by clearing the installation row and the process cache. */
async function openTheWindow(): Promise<void> {
  t.client.sqlite
    .prepare('UPDATE installation SET window_closed_at = NULL, window_closed_by_kind = NULL, window_closed_by_id = NULL WHERE only_row = 1')
    .run()
  const kw = await import('../src/server/lib/keywindow.ts')
  kw.forgetTheKeyWindowThisProcessRead()
}

/** Close it through the one writer, so the cache is replaced with what was written. */
async function closeTheWindow(): Promise<void> {
  const kw = await import('../src/server/lib/keywindow.ts')
  kw.closeTheKeyWindow({ kind: 'person', id: THE_PERSON })
}

// THE KEY FILE HOLDS PERSON_KEY AS THE OWNER'S KEY. Once the window is closed the owner's press needs it: a write a
// listener carried with no key is refused then (keys wave piece 6a).
beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  const built = await apiApp()
  app = built.app
  listRoutes = built.listApiRoutes
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  elsewhere = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((elsewhere.address() as AddressInfo).port)}`
})

afterAll(async () => {
  await new Promise<void>((done) => elsewhere.close(() => done()))
  await app.close()
  t.close()
})

describe('the door registers a session in one request', () => {
  it('answers the key exactly once, and the next ask never shows it again', async () => {
    const made = await post(
      '/api/agents/register-myself',
      {
        handle: HANDLE,
        name: 'Self registration',
        runtime: 'codex',
        workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
        workArea: ['src/server'],
        requestedRole: 'supervisor',
      },
      { ...AS_ITSELF, 'x-mole-office-key': PERSON_KEY },
    )
    expect(made.status, made.text).toBe(201)
    const headers = made.json['headers'] as Record<string, string>
    const key = String(headers['x-mole-office-key'] ?? '')
    expect(key, 'the key is answered').not.toBe('')
    expect(key.length).toBeGreaterThan(20)
    // NAMED EXACTLY ONCE IN THIS REPLY: the value appears in the headers and nowhere else.
    expect(made.text.split(key).length - 1, 'the key is written once in the reply').toBe(1)

    // THE SAME HANDLE ASKED TWICE ANSWERS THE REGISTRATION IT HAS, AND NO SECOND ROW IS MADE.
    const again = await post(
      '/api/agents/register-myself',
      { handle: HANDLE, name: 'Self registration', workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx` },
      AS_ITSELF,
    )
    expect(again.status, again.text).toBe(200)
    expect(again.json['alreadyRegistered']).toBe(true)
    expect(again.text.includes(key), 'the key is never answered again').toBe(false)

    // ONE ROW. MUTATION: remove the `agentByHandle` short circuit and this case sees two rows.
    const rows = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM agents WHERE handle = ?').get(HANDLE) as { n: number }
    expect(rows.n).toBe(1)
  })

  it('records the work area with who registered it, P85', async () => {
    // MUTATION: drop the `extra.workAreaChange` from the create and the mark is null.
    const profile = await getJson(`/api/participants/agent/${HANDLE}/profile`)
    expect(profile.status).toBe(200)
    const mark = profile.json['workAreaChange'] as { how: string; by: { kind: string; id: string } | null } | null
    expect(mark, 'the work area change is recorded').not.toBeNull()
    expect(mark?.how).toBe('the-owner')
    expect(mark?.by?.id).toBe(HANDLE)
  })

  it('grants no card, and raises the ask where the person answers it', async () => {
    const profile = await getJson(`/api/participants/agent/${HANDLE}/profile`)
    const ask = profile.json['cardAsk'] as { requestId: string; asking: string; admitsAnAgent: boolean } | null
    expect(ask, 'the citizen page carries the ask').not.toBeNull()
    expect(ask?.asking).toBe('supervisor')
    expect(ask?.admitsAnAgent, 'this registration was admitted at once, so no admission waits').toBe(false)

    const needs = await getJson('/api/needs-you')
    const actions = needs.json['actions'] as { act: string; recordId: string; asking?: string }[]
    const onTheList = actions.find((one) => one.recordId === ask?.requestId)
    expect(onTheList, 'the ask is on the needs-you list').toBeDefined()
    expect(onTheList?.act).toBe('give-card')
    expect(onTheList?.asking).toBe('supervisor')

    // THE OWNER'S PRESS GRANTS IT. MUTATION: remove the ask and this 404s.
    const granted = await post(`/api/roles/requests/${ask?.requestId ?? ''}/grant`, {}, AS_PERSON)
    expect([200, 201], granted.text).toContain(granted.status)
    expect((granted.json['agent'] as string) ?? '').toBe(HANDLE)
    const after = await getJson(`/api/participants/agent/${HANDLE}/profile`)
    expect((after.json['participant'] as { role?: string }).role).toBe('supervisor')
  })

  it('waits for their press while the window is open when it carries no key, and appears on the header-only list', async () => {
    // The handle above already registered; a second handle shows the header-only list half without
    // colliding with the idempotency case.
    const fresh = 'self-registration-open'
    const made = await post(
      '/api/agents/register-myself',
      { handle: fresh, name: 'Open window', workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx` },
      { ...AS_ITSELF, 'x-mole-office-actor-id': fresh },
    )
    // MUTATION: drop `!itProvedSomebody` from the door's waiting condition and this is a 201.
    expect(made.status, made.text).toBe(202)
    const rows = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM agents WHERE handle = ?').get(fresh) as { n: number }
    expect(rows.n, 'a keyless registration made an agent').toBe(0)
    const list = await getJson('/api/office/header-only-calls')
    const callers = list.json['callers'] as { actorId: string }[]
    expect(callers.map((one) => one.actorId)).toContain(fresh)
  })
})

describe('a registration from another machine is refused', () => {
  it('answers 403 and names the Embassy', async () => {
    const res = await fetch(`${anotherMachine}/api/agents/register-myself`, {
      method: 'POST',
      headers: { ...AS_ITSELF, 'x-mole-office-actor-id': 'from-elsewhere' },
      body: JSON.stringify({ handle: 'from-elsewhere', name: 'Elsewhere', workingDirectory: '/tmp' }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error?: string; detail?: string }
    expect(body.error ?? '').toContain('another computer')
    expect(body.detail ?? '').toContain('/api/agents/register-myself')
  })
})

describe('with the window closed, a registration waits for one press', () => {
  it('writes a waiting row, registers nothing, and one press admits it and gives the card', async () => {
    await closeTheWindow()
    const waitingHandle = 'self-registration-waiting'
    const waiting = await post(
      '/api/agents/register-myself',
      {
        handle: waitingHandle,
        name: 'Waiting registration',
        workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
        requestedRole: 'supervisor',
      },
      { ...AS_ITSELF, 'x-mole-office-actor-id': waitingHandle },
    )
    expect(waiting.status, waiting.text).toBe(202)
    expect(waiting.json['waiting']).toBe(true)
    const requestId = String(waiting.json['request'])
    // NOTHING IS REGISTERED UNTIL THE PRESS. MUTATION: register anyway and this fails.
    const before = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM agents WHERE handle = ?').get(waitingHandle) as { n: number }
    expect(before.n).toBe(0)

    const needs = await getJson('/api/needs-you')
    const actions = needs.json['actions'] as { act: string; recordId: string }[]
    expect(actions.find((one) => one.recordId === requestId)?.act).toBe('admit-agent')

    // ONE PRESS ADMITS THE AGENT AND GIVES THE CARD. MUTATION: grant only the card and no agent exists.
    const granted = await post(`/api/roles/requests/${requestId}/grant`, {}, { ...AS_PERSON, 'x-mole-office-key': PERSON_KEY })
    expect(granted.status, granted.text).toBe(201)
    const after = t.client.sqlite.prepare('SELECT handle FROM agents WHERE handle = ?').get(waitingHandle) as { handle: string } | undefined
    expect(after?.handle).toBe(waitingHandle)
    const profile = await getJson(`/api/participants/agent/${waitingHandle}/profile`)
    expect((profile.json['participant'] as { role?: string }).role).toBe('supervisor')

    // AND THE KEY IS ANSWERED ON THE FIRST ASK AFTER THE PRESS THAT SENDS BACK THE WAITING ROW'S
    // ONE-TIME SECRET, ONCE (finding 83; tests/the-first-key-needs-proof.test.ts holds the rest).
    const firstAsk = await post(
      '/api/agents/register-myself',
      {
        handle: waitingHandle,
        name: 'Waiting registration',
        workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
        askSecret: String(waiting.json['askSecret']),
      },
      { ...AS_ITSELF, 'x-mole-office-actor-id': waitingHandle },
    )
    expect(firstAsk.status, firstAsk.text).toBe(200)
    const key = String((firstAsk.json['headers'] as Record<string, string>)['x-mole-office-key'] ?? '')
    expect(key, 'the key is answered after the press').not.toBe('')
    const secondAsk = await post(
      '/api/agents/register-myself',
      { handle: waitingHandle, name: 'Waiting registration', workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx` },
      { ...AS_ITSELF, 'x-mole-office-actor-id': waitingHandle },
    )
    expect(secondAsk.text.includes(key), 'and never again').toBe(false)
    await openTheWindow()
  })
})

describe('which project, never default', () => {
  it('asks which project when the working directory matches nothing, and writes nothing to default', async () => {
    const before = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records WHERE workspace_id = ?').get('default') as { n: number }
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/register-myself',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'nowhere-session',
      },
      payload: { handle: 'nowhere-session', name: 'Nowhere', workingDirectory: '/no/such/place/at/all' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json<{ error: string }>().error).toContain('which project')
    const after = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records WHERE workspace_id = ?').get('default') as { n: number }
    expect(after.n).toBe(before.n)
  })
})
