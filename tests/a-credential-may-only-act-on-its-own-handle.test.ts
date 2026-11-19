// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CREDENTIAL MAY ONLY ACT ON ITS OWN HANDLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * Piece 2 of the visitor flow plan (plan `J_RIKvfdVUMn`), and section 3.6
 * of design/permissions/ACCEPTANCE.md: one credential per agent. The nine
 * handle doors of src/server/api/handles.ts are all `remote` and none of them read a key, a credential
 * or an actor, so before this piece any caller holding any credential could hold, beat, take and
 * release any handle. This file holds the rule that closes that: a request that carries a credential
 * and names a handle in its path must name the credential's OWN handle.
 *
 * ---------------------------------------------------------------------------------------
 * THE NARROW READING, WHICH IS THE WHOLE POINT
 * ---------------------------------------------------------------------------------------
 *
 * The refusal fires only when a request carries a credential. A request carrying none — every local
 * waiter, which sends the office's key and no credential — is left exactly as it was. That is
 * deliberate: a rule written one word wider would refuse the office's own waiters. The last case here
 * is the control for that, and it is the reason this piece does not narrow any read or close the
 * keyless route from off-loopback callers (P83 point 6, which stays the owner's press).
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE CREDENTIAL IS BUILT, AND WHY NO SECRET IS WRITTEN ANYWHERE
 * ---------------------------------------------------------------------------------------
 *
 * The token is taken out of the real issue door's 201 reply into a local variable and replayed as a
 * header, exactly as tests/a-visiting-agent-holds-its-own-credential.test.ts does. No token is a
 * literal, no fixture, no environment file, and none is asserted or printed: the two things this file
 * asserts about the wire are the two handles, which are public.
 *
 * A credential is issued here over `app.inject()`, which carries no socket and so is the office
 * itself. That is enough for this piece: the rule this file is about reads the credential's handle
 * and the path, and neither of those is measured from a socket.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

interface Answer {
  status: number
  body: Record<string, unknown>
}

async function ask(
  method: 'GET' | 'POST',
  path: string,
  headers: Record<string, string> = AS_THE_OWNER,
  payload?: unknown,
): Promise<Answer> {
  const reply = await app.inject({
    method,
    url: path,
    headers,
    ...(payload === undefined ? {} : { payload: payload as never }),
  })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** The three headers a visitor sends on every request afterwards, plus the actor it writes under. */
function carrying(
  token: string,
  handle: string,
  facts: { conversation: string; startedIn: string },
): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-credential': token,
    'x-mole-office-conversation': facts.conversation,
    'x-mole-office-start-directory': facts.startedIn,
  }
}

interface Confirmed {
  token: string
  credentialId: string
  agentId: string
  handle: string
  conversation: string
  startedIn: string
}

/**
 * ISSUE A CREDENTIAL FOR ONE HANDLE AND HAVE THE OWNER CONFIRM IT, which is the only state in which a
 * credential may work at all. The confirm writes the agent row the handle answers as, so the handle
 * this credential is bound to is a real durable agent by the time the doors below are driven.
 */
async function aConfirmedCredential(handle: string): Promise<Confirmed> {
  const conversation = `/transcripts/${handle}`
  const startedIn = `${THE_TEST_FIXTURE_ROOT}/work/loquat`
  const asked = await ask('POST', '/api/office/visitors', AS_THE_OWNER, {
    handle,
    name: handle,
    role: 'worker',
    conversationPath: conversation,
    startDirectory: startedIn,
    runtime: 'claude-code',
    sessionRecord: `sess-${handle}`,
  })
  expect(asked.status, JSON.stringify(asked.body)).toBe(201)
  const credential = asked.body.credential as { id: string }
  const confirmed = await ask('POST', `/api/office/visitors/${credential.id}/confirm`, AS_THE_OWNER)
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
  const citizen = confirmed.body.citizen as { agent: { id: string } }
  return {
    token: asked.body.token as string,
    credentialId: credential.id,
    agentId: citizen.agent.id,
    handle,
    conversation,
    startedIn,
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a trusted credential acts on its own handle', () => {
  it('holds, beats, takes and releases the handle its credential was issued to', async () => {
    const one = await aConfirmedCredential('loquat-one')
    const session = (
      await ask('POST', '/api/records', AS_THE_OWNER, {
        kind: 'session',
        title: 'A terminal on loquat',
        data: { state: 'running', runtime: 'claude-code', doing: 'answering as loquat-one' },
      })
    ).body.record as { id: string }
    const headers = carrying(one.token, one.handle, { conversation: one.conversation, startedIn: one.startedIn })

    // HOLD. The hold's own reply names the handle the session is answering as.
    const held = await ask('POST', `/api/handles/${one.handle}/hold`, headers, {
      session: session.id,
      runtime: 'claude-code',
    })
    expect(held.status, JSON.stringify(held.body)).toBe(201)
    expect((held.body.hold as { handle: string }).handle).toBe(one.handle)

    // BEAT.
    const beat = await ask('POST', `/api/handles/${one.handle}/beat`, headers, { session: session.id })
    expect(beat.status, JSON.stringify(beat.body)).toBe(200)
    expect((beat.body.hold as { handle: string }).handle).toBe(one.handle)

    // TAKE. A message to the agent it answers as, queued, then given to the live session.
    const message = (
      await ask('POST', '/api/records', AS_THE_OWNER, {
        kind: 'message',
        title: 'A message for loquat-one',
        data: { body: 'Are you there?', to: [{ kind: 'agent', id: one.agentId }] },
      })
    ).body.record as { id: string }
    const took = await ask('POST', `/api/handles/${one.handle}/took`, headers, {
      session: session.id,
      message: message.id,
    })
    expect(took.status, JSON.stringify(took.body)).toBe(200)
    expect(took.body.mark).toBe('delivered')

    // RELEASE.
    const released = await ask('POST', `/api/handles/${one.handle}/release`, headers, {
      session: session.id,
      because: 'the run finished',
    })
    expect(released.status, JSON.stringify(released.body)).toBe(200)
    expect((released.body.hold as { releasedAt: string | null }).releasedAt).not.toBeNull()
  })

  it('is refused on another agent’s handle, and the refusal names both handles', async () => {
    // A HANDLE OF ITS OWN. The case above already confirmed "loquat-one" in this database, and a
    // visitor may not ask under a handle a live agent bears (problem z-9zXhVeAPvA).
    const one = await aConfirmedCredential('loquat-three')
    const two = await aConfirmedCredential('loquat-two')
    const session = (
      await ask('POST', '/api/records', AS_THE_OWNER, {
        kind: 'session',
        title: 'A terminal on loquat',
        data: { state: 'running', runtime: 'claude-code', doing: 'answering as loquat-two' },
      })
    ).body.record as { id: string }
    const headers = carrying(one.token, one.handle, { conversation: one.conversation, startedIn: one.startedIn })

    const message = (
      await ask('POST', '/api/records', AS_THE_OWNER, {
        kind: 'message',
        title: 'A message for loquat-two',
        data: { body: 'Are you there?', to: [{ kind: 'agent', id: two.agentId }] },
      })
    ).body.record as { id: string }

    const refused = [
      await ask('POST', `/api/handles/${two.handle}/hold`, headers, { session: session.id, runtime: 'claude-code' }),
      await ask('POST', `/api/handles/${two.handle}/beat`, headers, { session: session.id }),
      await ask('POST', `/api/handles/${two.handle}/took`, headers, { session: session.id, message: message.id }),
      await ask('POST', `/api/handles/${two.handle}/release`, headers, { session: session.id, because: 'not mine' }),
    ]
    for (const answer of refused) {
      expect(answer.status, JSON.stringify(answer.body)).toBe(403)
      // BOTH HANDLES ARE ON THE REFUSAL. The credential's own, and the one it reached for.
      expect(String(answer.body.error)).toContain(one.handle)
      expect(String(answer.body.error)).toContain(two.handle)
      // THE CREDENTIAL HAS A ROW OF ITS OWN, written by its confirm, so the refusal is the one that
      // compares agents by id (criterion I5) rather than handle strings.
      expect(String(answer.body.error)).toContain('may act only for the agent it was issued to')
    }

    // AND NOTHING IT REACHED FOR CHANGED. The other agent's handle is still free.
    const answer = await ask('GET', `/api/handles/${two.handle}`, AS_THE_OWNER)
    expect(answer.status).toBe(200)
    expect((answer.body.answering as { how: string }).how).toBe('nobody')
    // THE MESSAGE WAS NOT MARKED DELIVERED under the reach.
    const read = await ask('GET', `/api/messages/${message.id}`, AS_THE_OWNER)
    const deliveries = (read.body.message as { deliveries?: { mark: string }[] }).deliveries ?? []
    expect(deliveries.map((one) => one.mark)).toContain('queued')
  })
})

describe('a request with no credential is unchanged', () => {
  it('holds and releases any handle, as every local waiter does today', async () => {
    const handle = 'loquat-local'
    // A durable agent and a session, both written the way a local registration writes them.
    const agent = (
      await ask('POST', '/api/records', AS_THE_OWNER, {
        kind: 'agent',
        title: 'A local agent',
        data: { handle, state: 'active', runtime: 'claude-code' },
      })
    ).body.record as { id: string }
    expect(agent.id).toBeTruthy()
    const session = (
      await ask('POST', '/api/records', AS_THE_OWNER, {
        kind: 'session',
        title: 'A terminal on this machine',
        data: { state: 'running', runtime: 'claude-code', doing: 'answering as loquat-local' },
      })
    ).body.record as { id: string }

    // NO CREDENTIAL HEADER AT ALL. This is the shape every waiter sends.
    const local = {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': handle,
    }
    const held = await ask('POST', `/api/handles/${handle}/hold`, local, { session: session.id, runtime: 'claude-code' })
    expect(held.status, JSON.stringify(held.body)).toBe(201)
    expect((held.body.hold as { handle: string }).handle).toBe(handle)

    const released = await ask('POST', `/api/handles/${handle}/release`, local, {
      session: session.id,
      because: 'done',
    })
    expect(released.status, JSON.stringify(released.body)).toBe(200)
  })
})
