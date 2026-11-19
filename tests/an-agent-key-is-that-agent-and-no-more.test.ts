// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST CARRYING AN AGENT'S KEY IS THAT AGENT, AND NOTHING MORE.
 *
 * Criterion P83, point 5. The whole of the point is one sentence: *a request with an agent key is
 * that agent and no more*. So this drives two acts through the key and reads what the office made
 * of each:
 *
 *   · a note written with ONLY the key — no actor headers — is written and attributed to the agent;
 *   · the person's own act, a decision, written with the same key, is refused.
 *
 * The first is what makes the second mean something. Without it, a refusal could just be the office
 * refusing everything, or reading an unrecognised key as nobody.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE KEY IS THE ONLY THING ON THE REQUEST
 * ---------------------------------------------------------------------------------------
 *
 * If the actor headers were sent too, the office would attribute the write to the header id whether
 * or not it understood the key, and the test would pass with the recognition deleted. Sending the
 * key alone is the measurement: the actor id can only have come from the key.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control)
 * ---------------------------------------------------------------------------------------
 *
 * In src/server/lib/keys.ts, change `return { how: 'an-agent-key', whoseId: held.whose_id }` to
 * `return undefined`, so a held key proves nothing. The note with only the key is then a headerless
 * request, which the office reads as the person, and the attribution case goes red. Restoring the
 * line turns it green.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let agentKey = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The key and nothing else: no actor headers, so the actor id can only come from the key. */
const THE_KEY_ALONE = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }

interface Answer {
  status: number
  error: string
  recordId: string
}

async function write(payload: Record<string, unknown>, headers: Record<string, string>): Promise<Answer> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload })
  const body = reply.json() as { record?: { id?: string }; error?: string }
  return { status: reply.statusCode, error: body.error ?? '', recordId: body.record?.id ?? '' }
}

/** Who the office attributed a change to, read off the change row the write itself made. */
function actorOnTheChange(recordId: string): { type: string; id: string } | undefined {
  return t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(recordId) as { type: string; id: string } | undefined
}

/** The registry id the office gave the agent with this handle. */
function registryIdOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent row for ${handle}`).toBeDefined()
  return row!.id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'keyed-worker', name: 'Keyed Worker', role: 'worker' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  agentKey = String((reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key)
  expect(agentKey, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('an agent key is that agent', () => {
  it('writes a note with the key alone, and the office attributes it to the agent', async () => {
    const wrote = await write(
      { kind: 'note', title: 'Written with the key alone', data: { body: 'The key named me.' } },
      { ...THE_KEY_ALONE, 'x-mole-office-key': agentKey },
    )
    expect(wrote.status, wrote.error).toBe(201)
    // The office stamps the agent's registry id, which is not its handle.
    expect(actorOnTheChange(wrote.recordId)).toEqual({ type: 'agent', id: registryIdOf('keyed-worker') })
  })

  it('refuses the person’s own act, a decision, because an agent key is not the person', async () => {
    const refused = await write(
      { kind: 'decision', title: 'An agent cannot write this', data: { because: 'it is the person’s' } },
      { ...THE_KEY_ALONE, 'x-mole-office-key': agentKey },
    )
    expect(refused.status, `the decision was written: ${refused.recordId}`).toBe(403)
    expect(refused.error.length, 'the refusal carried no sentence').toBeGreaterThan(0)
  })
})
