// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * RETIRING AN AGENT KILLS ITS KEY, IN THE SAME ACT — DRIVEN, NOT READ OFF A ROW.
 *
 * Criterion P83, point 5, and the lesson of wave 1. Problem `cJHoRBVT6IG8` was exactly this shape
 * through a different door: ending a person's device credential wrote `standing = ended` and left
 * the key it bound alive, so a phone the office had just ended went on writing decisions and the
 * end press answered 200. The existing test asserted the ROW. The act was not driven, and the act
 * was the thing that was broken.
 *
 * So this drives the act. The agent is registered, and a note written with ONLY its key is
 * attributed to the agent. The agent is retired. The same note, with the same key, is then written
 * again — and the office no longer reads the key as that agent. A decision with the same key is
 * refused as a request that named nobody. The `held_keys` row is checked too, but it is the second
 * half of the evidence and not the first.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control)
 * ---------------------------------------------------------------------------------------
 *
 * Delete the `revokeEveryLiveKeyHeldBy(...)` call from the retire route in
 * src/server/api/participants.ts. The key survives retirement, and the note written after it is
 * attributed to the agent again — the case goes red. Restoring the call turns it green.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

/** A made-up office key, so a run key can be minted for an agent in the retirement case. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The key and nothing else, so the actor id can only have come from the key. */
const THE_KEY_ALONE = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }

interface Written {
  status: number
  error: string
  recordId: string
}

async function writeWithTheKey(
  key: string,
  payload: Record<string, unknown>,
): Promise<Written> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...THE_KEY_ALONE, 'x-mole-office-key': key },
    payload,
  })
  const body = reply.json() as { record?: { id?: string }; error?: string }
  return { status: reply.statusCode, error: body.error ?? '', recordId: body.record?.id ?? '' }
}

function actorOnTheChange(recordId: string): { type: string; id: string } | undefined {
  return t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(recordId) as { type: string; id: string } | undefined
}

/** The registry id the office gave the agent with this handle. Keys are kept under it, not the handle. */
function registryIdOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent row for ${handle}`).toBeDefined()
  return row!.id
}

function heldKeyRow(handle: string): { revoked_at: string | null; revoked_because: string | null } | undefined {
  return t.client.sqlite
    .prepare('SELECT revoked_at, revoked_because FROM held_keys WHERE whose_id = ? ORDER BY made_at DESC LIMIT 1')
    .get(registryIdOf(handle)) as { revoked_at: string | null; revoked_because: string | null } | undefined
}

/** How many live keys one holder has, and how many rows of any standing. */
function keyCounts(handle: string): { live: number; all: number } {
  const row = t.client.sqlite
    .prepare('SELECT COUNT(*) AS all_keys, SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) AS live FROM held_keys WHERE whose_id = ?')
    .get(registryIdOf(handle)) as { all_keys: number; live: number | null }
  return { live: row.live ?? 0, all: row.all_keys }
}

/**
 * FILE A RUNNING SESSION AS THE OFFICE'S WORKER, and hand back the run key the office mints for it.
 * The office mints a run key only on the write that files a running session it started, so this is
 * the same write the message worker makes.
 */
async function aRunKeyFor(handle: string): Promise<string> {
  const registry = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title: `${handle} answering a message`,
      data: {
        state: 'running',
        runtime: 'claude-code',
        startedByMoleOffice: true,
        servingAgent: registry?.id ?? '',
        doing: 'reading a message and answering it',
      },
    },
  })
  const body = filed.json() as { runKey?: { key?: string } }
  return String(body.runKey?.key ?? '')
}

beforeAll(async () => {
  t = await freshDb()
  // A MADE-UP KEY FILE, so a running session this test files as the office is minted a run key.
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a retired agent’s key is dead', () => {
  it('names the agent before retirement and stops naming it after, and the decision is refused', async () => {
    const registered = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle: 'retire-me', name: 'Retire Me', role: 'worker' },
    })
    expect(registered.statusCode, registered.body).toBe(201)
    const key = String((registered.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key)
    expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)

    // CONTROL: while the key lives, a note written with the key alone is the agent's. The change
    // carries the agent's registry id, which is not its handle.
    const retireMeId = registryIdOf('retire-me')
    const before = await writeWithTheKey(key, {
      kind: 'note',
      title: 'Before the retirement',
      data: { body: 'The key names me.' },
    })
    expect(before.status, before.error).toBe(201)
    expect(actorOnTheChange(before.recordId)).toEqual({ type: 'agent', id: retireMeId })

    // THE RETIREMENT, as the person. It revokes the key in the same act.
    const retired = await app.inject({
      method: 'POST',
      url: '/api/participants/agent/retire-me/retire',
      headers: AS_THE_PERSON,
      payload: { because: 'the test retires it' },
    })
    expect(retired.statusCode, retired.body).toBe(200)

    // THE ACT IS DRIVEN, NOT THE ROW: the same note with the same key no longer reads as the agent.
    const after = await writeWithTheKey(key, {
      kind: 'note',
      title: 'After the retirement',
      data: { body: 'The key names nobody now.' },
    })
    expect(after.status, after.error).toBe(201)
    expect(
      actorOnTheChange(after.recordId),
      'the retired agent’s key still named that agent',
    ).not.toEqual({ type: 'agent', id: retireMeId })

    // AND THE PERSON'S OWN ACT WITH THE DEAD KEY IS REFUSED, because a key the office has taken back
    // proves nothing and a request with no actor headers is not evidence of a person.
    const refused = await writeWithTheKey(key, {
      kind: 'decision',
      title: 'The dead key cannot decide',
      data: { because: 'the person’s alone' },
    })
    expect(refused.status, `the dead key wrote a decision: ${refused.recordId}`).toBe(403)
    expect(refused.error, 'the refusal says what the key no longer does').toContain('no actor headers')

    // THE SECOND HALF: the row is marked, and the reason names the retirement.
    const row = heldKeyRow('retire-me')
    expect(row?.revoked_at, 'the key is not marked revoked').not.toBeNull()
    expect(String(row?.revoked_because), 'the reason does not name the retirement').toContain('retired')
  })

  it('kills the run key too, because an agent may hold its registration key and a run key at once', async () => {
    const registered = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle: 'retire-both', name: 'Retire Both', role: 'worker' },
    })
    expect(registered.statusCode, registered.body).toBe(201)
    const registrationKey = String((registered.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key)
    expect(registrationKey).toMatch(/^[0-9a-f]{64}$/)

    // THE RUN KEY IS ONE MORE LIVE KEY OF THE SAME HOLDER, minted when a run starts.
    const runKey = await aRunKeyFor('retire-both')
    expect(runKey, 'the office minted a run no key').toMatch(/^[0-9a-f]{64}$/)
    expect(runKey, 'the run key is the registration key').not.toBe(registrationKey)
    expect(keyCounts('retire-both')).toEqual({ live: 2, all: 2 })

    // CONTROL: while it lives, the run key names the agent, by its registry id.
    const retireBothId = registryIdOf('retire-both')
    const withRunKey = await writeWithTheKey(runKey, {
      kind: 'note',
      title: 'Written with the run key',
      data: { body: 'The run key names me while the run lives.' },
    })
    expect(withRunKey.status, withRunKey.error).toBe(201)
    expect(actorOnTheChange(withRunKey.recordId)).toEqual({ type: 'agent', id: retireBothId })

    // THE RETIREMENT IS ONE ACT OVER THE HOLDER, so both keys die with it.
    const retired = await app.inject({
      method: 'POST',
      url: '/api/participants/agent/retire-both/retire',
      headers: AS_THE_PERSON,
      payload: { because: 'the test retires it with a run key alive' },
    })
    expect(retired.statusCode, retired.body).toBe(200)

    expect(keyCounts('retire-both'), 'a live key outlived the retirement').toEqual({ live: 0, all: 2 })

    // DRIVEN, NOT READ OFF A ROW: neither key names the agent any more, and the person's act is refused.
    for (const key of [registrationKey, runKey]) {
      const after = await writeWithTheKey(key, {
        kind: 'note',
        title: 'After the retirement',
        data: { body: 'This key names nobody now.' },
      })
      expect(after.status, after.error).toBe(201)
      expect(actorOnTheChange(after.recordId), 'a retired agent’s key still named that agent').not.toEqual({
        type: 'agent',
        id: retireBothId,
      })
      const refused = await writeWithTheKey(key, {
        kind: 'decision',
        title: 'A retired agent’s key cannot decide',
        data: { because: 'the person’s alone' },
      })
      expect(refused.status, `a retired agent’s key wrote a decision: ${refused.recordId}`).toBe(403)
    }
  })
})
