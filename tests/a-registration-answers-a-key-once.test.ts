// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REGISTRATION ANSWERS A KEY ONCE, AND NO READ EVER ANSWERS IT AGAIN.
 *
 * Criterion P83, point 5. Agent keys are put in the way in by an owner's decision. The
 * plan report Shs0dwOcmIkm measured that neither registration door answered one. This proves both doors
 * now do, that the office keeps only the SHA-256, and that the second read of the same agent — the
 * record, the registry row or its profile — never shows the value again.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO DOORS ARE ONE CRITERION
 * ---------------------------------------------------------------------------------------
 *
 * `POST /api/agents/started` is how a starter registers what it started. `POST /api/records` with
 * kind `agent` is the other door, and on 7 September 2026 an agent on another machine came through
 * THAT one (src/server/lib/registrationgate.ts's header records the measurement). An agent should
 * not have to know which door registered it to find its own key, so both answer it and both tell
 * the same sentence, read from the one constant in src/server/lib/keys.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT "ONCE" MEANS HERE
 * ---------------------------------------------------------------------------------------
 *
 * The value is answered in the reply to the write that made the agent and nowhere else. It is 32
 * random bytes; only `keyHash(value)` is stored, so no later read CAN produce it — but that is a
 * property to hold rather than assume, so this drives the reads and looks.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control)
 * ---------------------------------------------------------------------------------------
 *
 * Drop `key: agentKey` from `whatToGiveIt` in src/server/api/participants.ts and the first case goes
 * red because the started-agent door answers no key; restoring it turns it green. The records.ts
 * half is covered by the third case, and its own mutation is recorded with the run in the report.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

interface StartedReply {
  record?: string
  error?: string
  whatToGiveIt?: { handle?: string; key?: string; keySays?: string }
}

async function registerStarted(body: Record<string, unknown>): Promise<{ code: number; said: StartedReply }> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: body })
  return { code: reply.statusCode, said: reply.json() as StartedReply }
}

async function fileAnAgent(handle: string): Promise<{ code: number; said: StartedReply & { record?: { id: string } } }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: {
      kind: 'agent',
      title: handle,
      data: { handle, state: 'active', runtime: 'claude-code' },
    },
  })
  return { code: reply.statusCode, said: reply.json() as StartedReply & { record?: { id: string } } }
}

/** The row `held_keys` holds for one owner, or undefined. */
/** The id of the one agent with this handle. A new agent's id is minted, so it is not the handle. */
function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** The newest key held by the agent with this handle. A key is held under the agent's registry id. */
function heldKeyRow(handle: string): { whose_kind: string; whose_id: string; key_hash: string; revoked_at: string | null } | undefined {
  return t.client.sqlite
    .prepare('SELECT whose_kind, whose_id, key_hash, revoked_at FROM held_keys WHERE whose_id = ? ORDER BY made_at DESC LIMIT 1')
    .get(idOf(handle)) as { whose_kind: string; whose_id: string; key_hash: string; revoked_at: string | null } | undefined
}

/** The key's SHA-256, from the one product function, so the test cannot disagree with the office. */
async function hashOf(value: string): Promise<string> {
  const { keyHash } = await import('../src/server/lib/keys.ts')
  return keyHash(value)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the started-agent door answers a key once', () => {
  it('answers 32 random bytes, keeps only the SHA-256, and says this is the only time it is shown', async () => {
    const { code, said } = await registerStarted({ handle: 'builder-key-one', name: 'Builder Key One', role: 'worker' })
    expect(code, JSON.stringify(said)).toBe(201)

    const key = said.whatToGiveIt?.key
    expect(typeof key, 'the registration answered no key').toBe('string')
    expect(key, 'a key is 64 lower-case hex characters').toMatch(/^[0-9a-f]{64}$/)
    expect(said.whatToGiveIt?.handle).toBe('builder-key-one')
    expect(String(said.whatToGiveIt?.keySays)).toContain('only time this key is shown')

    const row = heldKeyRow('builder-key-one')
    expect(row, 'no key row was written').toBeDefined()
    expect(row?.whose_kind).toBe('agent')
    expect(row?.whose_id).toBe(idOf('builder-key-one'))
    expect(row?.revoked_at).toBeNull()
    // THE VALUE IS NOT STORED. Only its SHA-256 is, which is what makes a copied database carry
    // nothing anybody can present.
    expect(row?.key_hash).toBe(await hashOf(key as string))
    expect(row?.key_hash, 'the value itself was stored').not.toBe(key)
  })

  it('never answers it again, on the record, the registry row or the profile', async () => {
    const { code, said } = await registerStarted({ handle: 'builder-key-read', name: 'Builder Key Read', role: 'worker' })
    expect(code).toBe(201)
    const key = said.whatToGiveIt?.key as string
    expect(key).toMatch(/^[0-9a-f]{64}$/)

    const reads = [
      `/api/records/${String(said.record)}`,
      '/api/participants/agent/builder-key-read',
      '/api/participants/agent/builder-key-read/profile',
    ]
    for (const url of reads) {
      const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
      expect(reply.statusCode, `${url}: ${reply.body}`).toBe(200)
      expect(reply.body, `${url} answered the key a second time`).not.toContain(key)
    }
  })
})

describe('the records door answers the same way', () => {
  it('answers a key for an agent filed through the ordinary record door, with the one sentence', async () => {
    const { code, said } = await fileAnAgent('builder-key-two')
    expect(code, JSON.stringify(said)).toBe(201)

    const key = said.whatToGiveIt?.key
    expect(typeof key, 'the records door answered no key').toBe('string')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(said.whatToGiveIt?.handle).toBe('builder-key-two')
    expect(String(said.whatToGiveIt?.keySays)).toContain('only time this key is shown')

    const row = heldKeyRow('builder-key-two')
    expect(row?.whose_kind).toBe('agent')
    expect(row?.key_hash).toBe(await hashOf(key as string))

    // AND A READ OF THE RECORD IT JUST WROTE DOES NOT ANSWER IT AGAIN.
    const reply = await app.inject({ method: 'GET', url: `/api/records/${said.record?.id ?? ''}`, headers: AS_THE_PERSON })
    expect(reply.statusCode).toBe(200)
    expect(reply.body).not.toContain(key)
  })
})
