// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD WRITE UNDER AN AGENT ID THE REGISTRY DOES NOT HOLD IS REFUSED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * On 16 September 2026 at 13:27 a run filed report `QLRmWBrZIBES` with
 * `x-mole-office-actor-id: HANDLE`, a placeholder its brief had not filled in. The office stored
 * it, and the create change row says `HANDLE` for ever, so nobody can place the author. Problem
 * `tClP6DIMlOpz`. `whyAnUnregisteredAgentMayNotWrite` in src/server/lib/records/unregistered-agent.ts is the rule the
 * records door now asks before it reads a body, and this file proves four things about it:
 *
 *   1. a write under an id no registry holds is refused, and NOTHING is written — no record and no
 *      change row — so the permanent log never learns the made-up name;
 *   2. the very same write is accepted once the id has been registered, so the refusal is about the
 *      registration and not about the record;
 *   3. a person's write is untouched;
 *   4. every id declared in `AGENT_IDS_THAT_NEED_NO_REGISTRATION` still writes.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL SOCKET AND NOT `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * The rule reads `actor.from`, which is written by the listener that accepted the connection. An
 * injected request is on no socket, so its arrival is `undefined` — which means *the rule does not
 * apply*, the honest answer for the seed, a migration or a script, and the line that keeps
 * criterion M14 whole: a row already written under a name no registry answers to is still accepted
 * in process and still named. A test that reached the refusal in-process would be proving something
 * about a caller this rule is not about. So this file listens on a port and drives it with `fetch`,
 * which is what curl, the browser and every JavaScript agent are.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
/** The door Mole Office really answers on: `app.listen()`, stamped `this machine` by buildApp. */
let base: string
/**
 * THE DECLARED EXCEPTIONS, IMPORTED AFTER A DATABASE EXISTS. src/server/lib/records.ts reaches
 * src/server/db/client.ts, so a static import here would open the database `.env` names before
 * `freshDb()` could name this test's own — the failure tests/no-test-opens-the-live-corpus.test.ts
 * exists to catch. Read inside `beforeAll`, after `freshDb()`.
 */
let declaredExceptions: readonly string[]

const THE_PERSON = THE_TEST_OFFICES_OWNER.id

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The headers a run sends when its brief left its actor id unfilled. */
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

interface Answer {
  status: number
  body: string
  /** The parsed body, or null when the reply is not JSON. */
  said: Record<string, unknown> | null
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  payload: unknown,
  headers: Record<string, string>,
): Promise<Answer> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  const body = await res.text()
  let said: Record<string, unknown> | null = null
  try {
    said = JSON.parse(body) as Record<string, unknown>
  } catch {
    said = null
  }
  return { status: res.status, body, said }
}

/** Every actor id in the change log, exactly as the log stored it. */
async function writers(): Promise<string[]> {
  const log = await ask('GET', '/api/changes', undefined, AS_THE_PERSON)
  const rows = (log.said?.['changes'] ?? []) as { actorId: string }[]
  return rows.map((row) => row.actorId)
}

/** The ids of every live record holding this title. */
async function holdingTitle(title: string): Promise<string[]> {
  const listed = await ask('GET', '/api/records', undefined, AS_THE_PERSON)
  const rows = (listed.said?.['records'] ?? []) as { id: string; title: string }[]
  return rows.filter((row) => row.title === title).map((row) => row.id)
}

beforeAll(async () => {
  t = await freshDb()
  declaredExceptions = (await import('../src/server/lib/records.ts')).AGENT_IDS_THAT_NEED_NO_REGISTRATION
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** An id that answers to no registry row, which is what a brief's placeholder does in practice. */
const A_PLACEHOLDER = 'a-placeholder-the-brief-never-filled'

describe('a write under an agent id no registry holds is refused', () => {
  it('refuses the create, and leaves no record and no change row behind', async () => {
    const title = 'A note filed under a made-up agent id'
    const refused = await ask(
      'POST',
      '/api/records',
      { kind: 'note', title, data: { body: 'written by a placeholder' } },
      asAgent(A_PLACEHOLDER),
    )

    expect(refused.status, refused.body).toBe(403)
    const why = String(refused.said?.['error'] ?? '')
    expect(why, 'the refusal must name the id it refused').toContain(A_PLACEHOLDER)
    expect(why, 'the refusal must say the registry has nobody by that name').toContain('Nothing is registered as the agent')
    expect(why, 'the refusal must say nothing was written').toContain('Nothing was written')
    expect(why, 'the refusal must say a registration comes first').toContain('register-myself')
    expect(why, 'the refusal must say a registration comes first').toContain('agents/started')

    // NOTHING WAS WRITTEN, counted rather than inferred: the record is not there and the permanent
    // log never learnt the name.
    expect(await holdingTitle(title), 'a refused write left the record behind').toEqual([])
    expect(await writers(), 'a refused write left a change row under the made-up name').not.toContain(A_PLACEHOLDER)
  })

  it('refuses a patch under the same kind of id, and leaves the record exactly as it was', async () => {
    const title = 'A note a person wrote, which a placeholder will try to change'
    const made = await ask('POST', '/api/records', { kind: 'note', title, data: { body: 'their words' } }, AS_THE_PERSON)
    expect(made.status, made.body).toBe(201)
    const id = String((made.said?.['record'] as { id?: unknown } | undefined)?.id ?? '')
    expect(id).not.toBe('')

    const refused = await ask('PATCH', `/api/records/${id}`, { dataPatch: { body: 'not their words' } }, asAgent(A_PLACEHOLDER))
    expect(refused.status, refused.body).toBe(403)
    expect(String(refused.said?.['error'] ?? '')).toContain(A_PLACEHOLDER)

    const read = await ask('GET', `/api/records/${id}`, undefined, AS_THE_PERSON)
    const stored = (read.said?.['record'] as { data?: { body?: string } } | undefined)?.data?.['body']
    expect(stored, 'a refused patch still moved the record').toBe('their words')
  })

  it('accepts the same write once the id has been registered first', async () => {
    const handle = 'registered-before-it-wrote'
    const registration = await ask(
      'POST',
      '/api/agents/started',
      { handle, name: 'Registered Before It Wrote' },
      AS_THE_PERSON,
    )
    expect(registration.status, registration.body).toBe(201)

    const title = 'A note filed after the registration'
    const accepted = await ask(
      'POST',
      '/api/records',
      { kind: 'note', title, data: { body: 'written by a registered agent' } },
      asAgent(handle),
    )
    expect(accepted.status, accepted.body).toBe(201)
    expect(await writers(), 'the accepted write is not attributed to the registered handle').toContain(handle)
  })

  it("leaves a person's own write untouched", async () => {
    const title = 'A note the person wrote'
    const accepted = await ask('POST', '/api/records', { kind: 'note', title, data: { body: 'by hand' } }, AS_THE_PERSON)
    expect(accepted.status, accepted.body).toBe(201)
    expect(await writers()).toContain(THE_PERSON)
  })

  it('lets every declared office writer and tool write', async () => {
    // THE LIST IS IMPORTED, NOT RETYPED, so this test and the refusal cannot come to disagree about
    // who is excepted. One write each, and the reply must be a create.
    expect(declaredExceptions.length).toBeGreaterThan(0)
    for (const id of declaredExceptions) {
      const title = `A note from ${id}`
      const accepted = await ask(
        'POST',
        '/api/records',
        { kind: 'note', title, data: { body: `written by ${id}` } },
        asAgent(id),
      )
      expect(accepted.status, `${id} was refused: ${accepted.body}`).toBe(201)
    }
  })
})
