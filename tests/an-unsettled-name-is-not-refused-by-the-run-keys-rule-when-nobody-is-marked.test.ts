// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * An unsettled name still writes when nobody it could mean was registered without its own key.
 * This is the test mutation M15 lacked.
 *
 * The write creates a workspace through POST /api/workspaces over a real loopback socket.
 * It arrives as the session hook, whose agent name is claude-code, with no key.
 * One case makes that name a retired agent's id and a different live agent's handle.
 * The other gives it to two retired agents as their handle, with no live holder or exact id.
 * The real resolver refuses both names with 409, and neither candidate has run_keys_only set.
 * The registration rule exempts the session hook in AGENT_IDS_THAT_NEED_NO_REGISTRATION.
 * The fresh test office's key window is open, and this request comes from loopback.
 * The workspace door and createWorkspace do not resolve the actor again or require a role.
 * Deleting the marked.size === 0 return makes the run-key rule resolve the name and refuse this write.
 */

import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WRITER = 'claude-code'
const AS_THE_SESSION_HOOK = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': WRITER,
}

let t: TestDb
let app: FastifyInstance
let here: string
let caseNumber = 0
let madeAgents: string[] = []

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  madeAgents = []
})

afterEach(() => {
  // The registry fixtures are written straight into the tables, so they are taken away again;
  // the next case then reads exactly the two rows it made.
  for (const id of madeAgents) {
    t.client.sqlite.prepare('DELETE FROM agents WHERE id = ?').run(id)
    t.client.sqlite.prepare('DELETE FROM assets WHERE id = ?').run(`avatar-default-agent-${id}`)
  }
})

/** These registry fixtures include a legacy id, which a new registration no longer mints. */
function agentRow(id: string, handle: string, retired: boolean): void {
  madeAgents.push(id)
  const avatar = `avatar-default-agent-${id}`
  t.client.sqlite.prepare(
    'INSERT INTO assets (id, kind, origin, mime, created_at, licence_source) ' +
      "VALUES (?, 'avatar', 'default', 'image/svg+xml', ?, 'generated')",
  ).run(avatar, '2026-10-01 10:00:00')
  t.client.sqlite.prepare(
    'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, run_keys_only, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
  ).run(id, `The fixture agent ${id}`, handle, avatar, retired ? 1 : 0, retired ? '2026-10-02 10:00:00' : null, '2026-10-01 10:00:00')
}

it.each(['an id and another live agent’s handle', 'several retired agents’ handle'] as const)(
  'takes the session hook’s socket write when its name means %s and nobody is marked',
  async (caseName) => {
    const workspaceId = `unsettled-writer-${caseNumber}`
    if (caseName === 'an id and another live agent’s handle') {
      agentRow(WRITER, 'the-old-session-hook', true)
      agentRow('the-new-session-hook', WRITER, false)
    } else {
      agentRow('the-first-session-hook', WRITER, true)
      agentRow('the-second-session-hook', WRITER, true)
    }

    expect(t.api.AGENT_IDS_THAT_NEED_NO_REGISTRATION).toContain(WRITER)
    const candidates = t.client.sqlite.prepare(
      'SELECT run_keys_only AS marked FROM agents WHERE id = ? OR handle = ?',
    ).all(WRITER, WRITER)
    expect(candidates).toEqual([{ marked: 0 }, { marked: 0 }])
    const { participantForActor } = await import('../src/server/lib/participants.ts')
    expect(() => participantForActor({ type: 'agent', id: WRITER })).toThrow(
      expect.objectContaining({ status: 409 }),
    )

    const response = await fetch(`${here}/api/workspaces`, {
      method: 'POST',
      headers: AS_THE_SESSION_HOOK,
      body: JSON.stringify({ id: workspaceId, title: 'A workspace made by the session hook' }),
    })
    const body = await response.text()
    expect(response.status, body).toBe(201)
    expect(JSON.parse(body)).toMatchObject({ id: workspaceId, title: 'A workspace made by the session hook' })
    expect(t.client.sqlite.prepare('SELECT title FROM workspaces WHERE id = ?').get(workspaceId)).toEqual({
      title: 'A workspace made by the session hook',
    })
  },
)
