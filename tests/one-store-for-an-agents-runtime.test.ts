// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S RUNTIME IS STORED ONCE, ON ITS AGENT RECORD.
 *
 * Problem `KVvt74765Na1`, proposal `nfETNdLvpE5P`: the runtime is stored in one place. A decision took option A,
 * which accepted the proposal. The participants row used to carry a second copy of the
 * runtime, written at registration and not changeable afterwards, while the agent record's `data.runtime` was the
 * door a PATCH could change. On 14 September 2026 a dsh worker was resumed as a Claude subagent and the record was
 * corrected while the row was not, so the two doors answered two runtimes for one agent.
 *
 * WHAT THIS PROVES, BY DRIVING THE REAL DOORS:
 *
 *   · a runtime changed once, on the record, is the SAME word from GET /api/participants/agent/<handle>,
 *     from GET /api/participants, and from GET /api/records/<record>;
 *   · a word outside the closed list is refused, and the refusal names the list;
 *   · a row that still carries the old column answers the RECORD's word and not the row's, so the
 *     dead copy can never win again.
 *
 * The registry row's `runtime` column is left in place and dead rather than dropped: decision A
 * says the row reads the record, and this file proves a stale value on it is not read. It is set
 * below through raw SQL on purpose — no door writes it any more, which is the change being tested.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** Register an agent the ordinary way, and hand back the record id it filed. */
async function register(
  handle: string,
  runtime: string,
  actor: string | null = null,
  role = 'worker',
): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: actor === null ? AS_THE_PERSON : asAgent(actor),
    payload: { handle, name: handle, role, runtime },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return String((reply.json() as { record: string }).record)
}

async function readOne(handle: string): Promise<string | null> {
  const reply = await app.inject({
    method: 'GET',
    url: `/api/participants/agent/${handle}`,
    headers: AS_THE_PERSON,
  })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { participant: { runtime: string | null } }).participant.runtime
}

async function readTheList(handle: string): Promise<string | null> {
  const reply = await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  const agents = (reply.json() as { agents: { handle: string; runtime: string | null }[] }).agents
  return agents.find((one) => one.handle === handle)?.runtime ?? null
}

async function readTheRecord(recordId: string): Promise<string | null> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${recordId}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { record: { data: Record<string, unknown> } }).record.data['runtime'] as string | null
}

async function patchRuntime(recordId: string, runtime: string): Promise<{ code: number; said: string }> {
  const reply = await app.inject({
    method: 'PATCH',
    url: `/api/records/${recordId}`,
    headers: AS_THE_PERSON,
    payload: { dataPatch: { runtime } },
  })
  const body = reply.json() as { error?: string }
  return { code: reply.statusCode, said: body.error ?? reply.body }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  // The starter every registration below is made under. The person registers it, which is how a
  // secretary is appointed.
  await register(THE_TEST_OFFICES_SECRETARY.handle, 'claude-code', null, 'secretary')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('one store: the record is the runtime both doors answer', () => {
  it('a runtime changed once on the record is the same word at both participants doors and the record', async () => {
    const record = await register('runtime-changed', 'dsh', THE_TEST_OFFICES_SECRETARY.handle)
    expect(await readTheRecord(record)).toBe('dsh')

    const changed = await patchRuntime(record, 'claude-code')
    expect(changed.code, changed.said).toBe(200)

    // THE ACTUAL DEFECT, MEASURED: before this change the participants row still said `dsh` and
    // the record said `claude-code`. One fact, one answer, at all three reads.
    expect(await readOne('runtime-changed')).toBe('claude-code')
    expect(await readTheList('runtime-changed')).toBe('claude-code')
    expect(await readTheRecord(record)).toBe('claude-code')
  })

  it('refuses a word outside the closed list, and names every word on it', async () => {
    const record = await register('runtime-refused', 'claude-code', THE_TEST_OFFICES_SECRETARY.handle)
    const before = await readOne('runtime-refused')

    const refused = await patchRuntime(record, 'a-runtime-nobody-declared')

    expect(refused.code, refused.said).toBe(400)
    for (const word of ['claude-code', 'codex', 'dsh', 'opencode', 'kimi']) {
      expect(refused.said, `the refusal does not name "${word}"`).toContain(word)
    }
    // A REFUSAL WRITES NOTHING.
    expect(await readOne('runtime-refused')).toBe(before)
  })

  it('answers the record, not a stale value on the row the column still carries', async () => {
    const record = await register('runtime-old-row', 'dsh', THE_TEST_OFFICES_SECRETARY.handle)
    // A row written before the change genuinely carries a word in that column. No door writes it
    // now, so it is put there by hand: this is the stale copy the test exists to refuse to read.
    const changed = t.client.sqlite
      .prepare('UPDATE agents SET runtime = ? WHERE handle = ?')
      .run('codex', 'runtime-old-row')
    expect(changed.changes).toBe(1)
    const stale = t.client.sqlite.prepare('SELECT runtime FROM agents WHERE handle = ?').get('runtime-old-row') as {
      runtime: string | null
    }
    expect(stale.runtime, 'the stale column was not set, so the case proves nothing').toBe('codex')

    // The record is the one store, so the answer is its word and never the row's.
    expect(await readOne('runtime-old-row')).toBe('dsh')
    expect(await readTheList('runtime-old-row')).toBe('dsh')
    expect(await readTheRecord(record)).toBe('dsh')
  })
})
