// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE SESSION ON ANOTHER MACHINE GETS ONE ROW. Criterion P81's collision rule.
 *
 * ---------------------------------------------------------------------------------------
 * THE OWNER'S CASE, AND WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P81 records what happened on the live office on 8 September 2026: the Codex session on
 * the owner's other machine registered TWICE, under two handles, and they had to work out which of the two
 * rows was which.
 *
 * REPRODUCED BEFORE THIS BRANCH, on the same day: one credential was confirmed, and two
 * registrations were made under it from one machine by one program, naming two handles. Both were
 * answered 201. Two rows were left, `codex-a` and `codex-b`, both carrying the same credential id.
 *
 * A credential is issued to ONE agent — the issuing door says so in its own words — so a second
 * registration under it is one session asking twice rather than a second agent arriving. It is
 * answered with the row that is already there, and nothing is written.
 *
 * Three things:
 *
 *   · the second registration writes no second row, and the registry holds exactly one for the
 *     credential;
 *   · it is answered with that row and a sentence, rather than refused, so a caller that simply
 *     asked twice has a handle it can use;
 *   · a different credential is a different agent and still gets its own row, so the rule has not
 *     become "one row per machine".
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. In src/server/api/participants.ts, delete the `theRowThisCredentialAlreadyHas` block at the
 *      top of POST /api/agents/started → two rows again, and the first two cases fail.
 *   2. In src/server/lib/participants.ts, have `theRowThisCredentialAlreadyHas` ignore its argument
 *      and answer the first row in the table → the third case fails, because a second credential is
 *      handed the first one's row.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let here: string
let loquat: string
const extraDoors: Server[] = []

const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

async function open(server: Server): Promise<string> {
  extraDoors.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

async function ask(
  door: string,
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** A confirmed credential on loquat, and the headers a request under it sends. */
async function aConfirmedSession(handle: string, conversation: string): Promise<{
  id: string
  headers: Record<string, string>
}> {
  const asked = await ask(loquat, 'POST', '/api/office/visitors', {
    handle,
    name: `The ${handle} session`,
    role: 'worker',
    conversationPath: conversation,
    runtime: 'codex',
  })
  expect(asked.status, JSON.stringify(asked.body).slice(0, 300)).toBe(201)
  const credential = asked.body.credential as { id: string }
  const token = asked.body.token as string
  const done = await ask(here, 'POST', `/api/office/visitors/${credential.id}/confirm`, {}, PERSON)
  expect(done.status, JSON.stringify(done.body).slice(0, 300)).toBe(200)
  return {
    id: credential.id,
    headers: {
      'x-mole-office-credential': token,
      'x-mole-office-conversation': conversation,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': handle,
    },
  }
}

/** Every registry row carrying one credential, by handle. */
async function rowsCarrying(credential: string): Promise<string[]> {
  const said = await ask(here, 'GET', '/api/participants')
  const agents = said.body.agents as { handle: string; credential?: string | null }[]
  return agents.filter((one) => one.credential === credential).map((one) => one.handle)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const { stampArrival } = await import('../src/server/lib/http.ts')
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  loquat = await open(
    createServer((raw, res) => {
      stampArrival(raw, 'another machine', 'the caller')
      app.routing(raw, res)
    }),
  )
})

afterAll(async () => {
  for (const s of extraDoors) await new Promise<void>((r) => s.close(() => r()))
  await app.close()
  t.close()
})

describe('one credential, two registrations', () => {
  it('writes one row, not two', async () => {
    const session = await aConfirmedSession('codex-one', '/tmp/codex-one.jsonl')
    // THE CONFIRM ITSELF ALREADY MADE THE ROW, criterion P81's other half. So the FIRST registration
    // under this credential is already a second ask, and both of these must be answered with it.
    const first = await ask(loquat, 'POST', '/api/agents/started', { handle: 'codex-a', name: 'Codex A' }, session.headers)
    const second = await ask(loquat, 'POST', '/api/agents/started', { handle: 'codex-b', name: 'Codex B' }, session.headers)
    expect(first.status, JSON.stringify(first.body).slice(0, 300)).toBeLessThan(300)
    expect(second.status, JSON.stringify(second.body).slice(0, 300)).toBeLessThan(300)
    const carried = await rowsCarrying(session.id)
    expect(carried, 'one credential, one row').toEqual(['codex-one'])
    const a = await ask(here, 'GET', '/api/participants/agent/codex-a')
    const b = await ask(here, 'GET', '/api/participants/agent/codex-b')
    expect(a.status, 'no row was written under the first extra handle').toBe(404)
    expect(b.status, 'nor under the second').toBe(404)
  })

  it('is answered with the row that exists, rather than refused', async () => {
    const session = await aConfirmedSession('codex-two', '/tmp/codex-two.jsonl')
    const again = await ask(loquat, 'POST', '/api/agents/started', { handle: 'codex-c', name: 'Codex C' }, session.headers)
    expect(again.status, 'answered, not refused').toBe(200)
    expect(again.body.alreadyRegistered).toBe(true)
    const agent = again.body.agent as { handle: string }
    expect(agent.handle, 'and it names the handle to write under').toBe('codex-two')
    expect(String(again.body.says)).toContain('codex-two')
    expect(String(again.body.says), 'and says nothing was written').toContain('Nothing was written')
  })

  it('still gives a second credential its own row, because that is a second agent', async () => {
    const one = await aConfirmedSession('codex-three', '/tmp/codex-three.jsonl')
    const two = await aConfirmedSession('codex-four', '/tmp/codex-four.jsonl')
    expect(await rowsCarrying(one.id)).toEqual(['codex-three'])
    expect(await rowsCarrying(two.id)).toEqual(['codex-four'])
  })
})
