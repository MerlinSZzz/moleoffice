// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONVERSATION WITH AN AGENT IS FOUND WHETHER THE AGENT IS NAMED BY ITS HANDLE OR ITS ID.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROTECTS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion I2 of design/agents/IDENTITY-ACCEPTANCE.md. GET /api/messages/conversation names the
 * other side in its query (`kind` and `id`). That is an ARRIVING reference, so an agent may be named
 * by its registry id or by its handle, and it resolves through the one resolver. Since the mint
 * (criterion I1) a new agent's id is not its handle. Before this, the door read the query by exact
 * id, and a conversation asked for by handle answered 404. The chat and the comment panel ask by
 * the name they hold.
 *
 * Wave 13c changes what this handler marks as delivered. This file is about which agent the query
 * names and nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   In the handler, read the query as it came (`const them = asked`), and the handle case fails
 *   with a 404 and the pair case answers where it must refuse.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const WS = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WS,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function register(handle: string): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, runtime: 'claude-code' } })
  expect(reply.statusCode, reply.body).toBe(201)
  const id = (reply.json() as { agent: { id: string } }).agent.id
  expect(id, `the registration of ${handle} set its id to its handle`).not.toBe(handle)
  return id
}

async function theConversationWith(id: string): Promise<{ status: number; body: string; json: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url: `/api/messages/conversation?kind=agent&id=${encodeURIComponent(id)}`, headers: AS_THE_PERSON })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, body: reply.body, json }
}

let convId: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  convId = await register('conv-agent')
  const sent = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'message', title: 'a word to conv-agent', data: { body: 'hello', to: [{ kind: 'agent', id: convId }] } },
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(sent.statusCode, sent.body).toBe(409)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the conversation door reads the agent it is asked about', () => {
  it('finds the conversation when the agent is named by its handle, and answers with its registry id', async () => {
    const said = await theConversationWith('conv-agent')
    expect(said.status, said.body).toBe(200)
    expect(said.json['them']).toEqual({ kind: 'agent', id: convId })
    expect((said.json['messages'] as unknown[]).length).toBe(1)
  })

  it('finds the same conversation when the agent is named by its id', async () => {
    const said = await theConversationWith(convId)
    expect(said.status, said.body).toBe(200)
    expect(said.json['them']).toEqual({ kind: 'agent', id: convId })
    expect((said.json['messages'] as unknown[]).length).toBe(1)
  })

  it('answers 404 for a name nobody bears, quoting the name that was sent', async () => {
    const said = await theConversationWith('nobody-bears-this')
    expect(said.status, said.body).toBe(404)
    expect(String(said.json['error'])).toContain('"nobody-bears-this"')
  })

  it('refuses a string that is one agent\'s id and another live agent\'s handle, naming both', async () => {
    // A legacy agent renamed in place keeps its handle-shaped id; a new agent then takes that string.
    t.client.sqlite
      .prepare(
        'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
          "licence_source) VALUES ('avatar-default-agent-conv-twin', 'avatar', 'default', NULL, 'image/svg+xml', NULL, " +
          "'2026-08-27 10:00:00', NULL, NULL, 'generated') ON CONFLICT(id) DO NOTHING",
      )
      .run()
    t.client.sqlite
      .prepare(
        'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at) ' +
          "VALUES ('conv-twin', 'Conv twin, renamed', 'conv-twin-renamed', 'avatar-default-agent-conv-twin', 0, NULL, '2026-08-27 10:00:00')",
      )
      .run()
    await register('conv-twin')
    const said = await theConversationWith('conv-twin')
    expect(said.status, said.body).toBe(409)
    const error = String(said.json['error'])
    expect(error).toContain('names two agents')
    // THE LEGACY AGENT BY ITS NAME, AND THE NEW ONE (registered with its handle as its name).
    expect(error).toContain('Conv twin, renamed')
    expect(error).toContain('the handle of conv-twin')
  })
})
