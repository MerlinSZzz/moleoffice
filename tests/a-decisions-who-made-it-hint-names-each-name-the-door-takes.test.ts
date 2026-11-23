// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION'S WHO-MADE-IT DOOR TAKES THE AGENT'S ID AND ITS HANDLE.
 *
 * The record page shows a person hint above the box for `decided_by`. It said to write "the owner" or the
 * handle of the agent that made the choice. Since the agents were given ids apart from their handles, the
 * decision door takes an agent's id as well as its handle there: `sameAgent` in src/server/lib/records.ts
 * resolves both, and a refusal offers both. A person reading the hint was told only half of what is taken.
 *
 * WHAT IS CLAIMED:
 *   1. the decision door takes a decision an agent made itself when `decided_by` is the agent's id, and when it
 *      is the agent's handle.
 *
 * THE AGENT IS MADE UP for this file: its id, handle and name name nobody.
 *
 * The Chinese and the other languages are not read here. A changed English word waits for the translation
 * round, and the waiting list says so.
 *
 * MUTATIONS, each after a control run (the commit that adds this file names the logs):
 *   2. the door's check of who signed it takes the handle and not the id: case 1 goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

/** MADE-UP: an agent whose id and handle differ, and whose handle names it alone. */
const AGENT = { id: 'Hn4qT7wB2xKe', handle: 'leaf-counter', name: 'Leaf counter' }

const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** Write an agent row straight at the table, with the picture row its foreign key needs. */
function insertAgent(who: { id: string; handle: string; name: string }): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${who.id}`, '2026-11-07 10:00:00')
  t.client.sqlite
    .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) VALUES (?, ?, ?, ?, 0, ?)')
    .run(who.id, who.name, who.handle, `avatar-default-agent-${who.id}`, '2026-11-07 10:00:00')
}

/** Send a decision the agent made itself, signed with one of its names, and give back the status and the words. */
async function aDecisionSignedBy(decidedBy: string, title: string): Promise<{ code: number; said: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(AGENT.id),
    payload: { kind: 'decision', title, data: {
      ...governsTheWholeProject(), replaces: [], decided_by: decidedBy, authority: 'a measurement', because: 'The counter missed 2 leaves in 50.' } },
  })
  return { code: reply.statusCode, said: reply.body }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  insertAgent(AGENT)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe("a decision's hint for who made it", () => {
  // MUTATION 2: the door takes the handle and not the id: red.
  it('1. the door takes a decision an agent made itself, signed with its id and signed with its handle', async () => {
    const byId = await aDecisionSignedBy(AGENT.id, 'Count the leaves by hand')
    expect(byId.code, `a decision signed with the agent's id was refused: ${byId.said}`).toBe(201)
    const byHandle = await aDecisionSignedBy(AGENT.handle, 'Count the leaves by hand, signed with the handle')
    expect(byHandle.code, `a decision signed with the agent's handle was refused: ${byHandle.said}`).toBe(201)
  })
})
