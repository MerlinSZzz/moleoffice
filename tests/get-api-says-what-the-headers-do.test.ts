// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ACTOR HEADER REFUSALS SAY WHAT THE OFFICE DOES WITH THEM.
 *
 * The notes said two things the office no longer does. The session note told a run to send its run name before it had
 * filed a session record. A write that carries a key may name only a run the key holds
 * (src/server/lib/the-run-a-key-holds.ts), and a run name nothing is bound to is no such run, so a new agent with its
 * key that did as the note said was refused. The type note said a request that sends no actor header is filed as
 * human. Once the person closes the key window, a write with no key is refused whatever it sends
 * (`refuseAKeylessWriteAfterTheClose` in src/server/lib/http.ts), and before the close only some callers are taken.
 * The id note said that leaving the id off means the office's owner. A request that sends the type or the session
 * header and leaves the id off is refused (`refusePartialIdentity` in src/server/lib/http.ts), and a request that
 * sends none of the three is the one the type note speaks of.
 *
 * One made-up office, on a real loopback listener, with the person's key from the test office's own key file:
 *
 *   1. an agent with its own key sends a run name before any session is filed: refused, and nothing is written;
 *   2. after the person closes the key window, a write with no key and no actor header comes in through the listener:
 *      refused, and nothing is written;
 *   4. an agent with its own key sends the type header and no id: refused, in a sentence that names the id header,
 *      and nothing is written.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS (after a green control), each alone
 * ---------------------------------------------------------------------------------------
 *
 *   b. `refuseASessionHeaderTheKeyDoesNotHold` in src/server/lib/http.ts returns before it checks anything: case 1 goes
 *      red.
 *   c. `refuseAKeylessWriteAfterTheClose` in src/server/lib/http.ts returns before it checks anything, and so does the
 *      refusal after it of a request nobody proved: case 2 goes red.
 *   f. `refusePartialIdentity` in src/server/lib/http.ts returns before it checks anything: case 4 goes red.
 */

import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ACTOR_HEADERS, WORKSPACE_HEADER } from '../src/shared/request-headers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HANDLE = 'a-header-reader'

let t: TestDb
let app: FastifyInstance
let here = ''
let personKey = ''
let agentKey = ''
/** The status case 1 was refused with: a run name sent with a key before any session was filed. */
let aRunNameWasRefusedWith: number | null = null
/** The status case 2 was refused with: a write with no key and no actor header, after the close. */
let aKeylessWriteWasRefusedWith: number | null = null
/** The status case 4 was refused with: a write with an agent's key and the type header, and no id header. */
let aClaimWithNoIdWasRefusedWith: number | null = null

const IN_THE_PROJECT = { 'content-type': 'application/json', [WORKSPACE_HEADER]: 'default' }

function asThePerson(): Record<string, string> {
  return { ...IN_THE_PROJECT, [ACTOR_HEADERS.type]: 'human', [ACTOR_HEADERS.id]: THE_PERSON, 'x-mole-office-key': personKey }
}

function asTheAgent(session?: string): Record<string, string> {
  return {
    ...IN_THE_PROJECT,
    [ACTOR_HEADERS.type]: 'agent',
    [ACTOR_HEADERS.id]: HANDLE,
    'x-mole-office-key': agentKey,
    ...(session === undefined ? {} : { [ACTOR_HEADERS.session]: session }),
  }
}

async function ask(url: string, headers: Record<string, string>, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url, headers, payload: payload as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** The words of a reply, for a failure message. A key in it is replaced. */
function said(body: unknown): string {
  const text = typeof body === 'string' ? body : String((body as Record<string, unknown>)['error'] ?? JSON.stringify(body))
  return text.replace(/[0-9a-f]{64}/g, '<a key>')
}

function notesTitled(title: string): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'note' AND title = ?").get(title) as { n: number }).n
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  personKey = (JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8')) as { person: string }).person
  const made = await ask('/api/agents/started', asThePerson(), { handle: HANDLE, name: 'A header reader', runtime: 'claude-code', role: 'worker' })
  expect(made.status, said(made.body)).toBe(201)
  agentKey = String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key ?? '')
  expect(/^[0-9a-f]{64}$/.test(agentKey), 'the registration answered no key').toBe(true)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('what the office does with the two headers', () => {
  it('1. refuses a run name an agent sends with its key before any session is filed, and writes nothing', async () => {
    const title = 'a note under a run name nobody filed'
    const wrote = await ask('/api/records', asTheAgent('my-first-run'), { kind: 'note', title, data: { body: title } })
    expect(wrote.status, said(wrote.body)).toBeGreaterThanOrEqual(400)
    expect(said(wrote.body), 'the refusal is not about the run the header names').toContain('"my-first-run"')
    expect(notesTitled(title), 'a refused write was stored all the same').toBe(0)
    aRunNameWasRefusedWith = wrote.status
  })

  it('2. refuses, after the person closes the key window, a write with no key and no actor header, and writes nothing', async () => {
    const closed = await app.inject({ method: 'POST', url: '/api/office/key-window/close', headers: asThePerson() })
    expect(closed.statusCode, said(closed.body)).toBe(200)
    const title = 'a note that names nobody'
    const reply = await fetch(`${here}/api/records`, {
      method: 'POST',
      headers: IN_THE_PROJECT,
      body: JSON.stringify({ kind: 'note', title, data: { body: title } }),
    })
    const text = await reply.text()
    expect(reply.status, said(text)).toBeGreaterThanOrEqual(400)
    expect(notesTitled(title), 'a refused write was stored all the same').toBe(0)
    aKeylessWriteWasRefusedWith = reply.status
  })
})

describe('the id header, left off', () => {
  it('4. refuses a write that sends the actor type and no actor id, in a sentence that names the id, and writes nothing', async () => {
    const title = 'a note that says what it is and not who'
    const withNoId = asTheAgent()
    delete withNoId[ACTOR_HEADERS.id]
    const wrote = await ask('/api/records', withNoId, { kind: 'note', title, data: { body: title } })
    expect(wrote.status, said(wrote.body)).toBeGreaterThanOrEqual(400)
    expect(said(wrote.body), 'the refusal does not name the header that was left off').toContain(ACTOR_HEADERS.id)
    expect(notesTitled(title), 'a refused write was stored all the same').toBe(0)
    aClaimWithNoIdWasRefusedWith = wrote.status
  })
})
