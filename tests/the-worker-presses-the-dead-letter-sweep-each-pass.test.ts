// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * M111 — THE WORKER PRESSES THE DEAD-LETTER SWEEP ONCE A PASS.
 *
 * THE RULE: after a time or a count the office broadcasts the
 * dead letters to every secretary. Something has to make that happen without a person pressing
 * anything, and the office has exactly one pulse: the message worker's pass, which the API server
 * starts and stops. So the worker presses POST /api/dead-letters/sweep once a pass, asked before the
 * queue read, beside the waits — the office's own bookkeeping and not about any one message.
 *
 * THE SWEEP WRITES NOTHING WHEN THERE IS NOTHING TO DO — the server's own words — so a pass with no
 * letter waiting costs one read and no write, and `deadLetters` in the pass report says what
 * happened or that nothing was there to do. A REFUSAL IS NEVER REPORTED AS A BROADCAST: a sweep that
 * could not run reads back as null, and the refusal is printed where a person reads the log.
 *
 * The sweep and the broadcast itself are proved in
 * tests/a-wild-message-is-kept-and-broadcast-to-the-secretaries.test.ts.
 *
 * Mutation: in src/worker/index.ts, `sweepTheDeadLetters`, change the path it presses from
 * '/api/dead-letters/sweep' to '/api/worker/queue' — the sweep is never pressed — and both cases
 * below go red: the pass that should broadcast says nothing happened, and the pass that should say
 * nothing was there says null.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { onePass, type WorkerSettings, type PassReport } from '../src/worker/index.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

let t: TestDb
let app: FastifyInstance
let outputs: string
let settings: WorkerSettings
// The registry id w-one's registration answered. A new agent's id is not its handle, and a dead
// letter's addressee is stored by the id.
let wOneId: string

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function get(path: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers })
  return reply.json() as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-dead-letters-'))
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: CHECKOUT,
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort() },
  }
  await post('/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }, AS_THE_PERSON)
  const wOne = await post('/api/agents/started', { handle: 'w-one', name: 'Worker One', role: 'worker' }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
  wOneId = (wOne.said as { agent: { id: string } }).agent.id
})

afterAll(async () => {
  await app.close()
  t.close()
  // The worker's output folder is this file's own, and nothing else removes it (problem ToxCUBqVhdPI).
  if (outputs !== undefined) rmSync(outputs, { recursive: true, force: true })
})

describe('one pass presses the sweep, and says what it did', () => {
  it('a pass with nothing waiting says nothing was there, and writes nothing', async () => {
    const report = await onePass(settings, [])
    expect(report.deadLetters).not.toBeNull()
    expect(report.deadLetters?.groupId).toBeNull()
    expect(report.deadLetters?.addressees).toEqual([])
    expect(report.deadLetters?.because).toContain('No dead letter is waiting')
    const groups = (await get('/api/groups', AS_THE_PERSON)) as { groups: { name: string }[] }
    expect((groups.groups ?? []).filter((one) => one.name === 'Dead letters')).toHaveLength(0)
  })

  it('twenty-one wild letters cross the count, and the pass that saw them broadcast them', async () => {
    await post('/api/agents/started', { handle: 'w-one', name: 'Worker One', role: 'worker' }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    for (let n = 1; n <= 21; n++) {
      const filed = await post(
        '/api/records',
        { kind: 'message', title: `x${String(n)}`, data: { body: `x${String(n)}`, to: [{ kind: 'agent', id: 'w-one' }] } },
        AS_THE_PERSON,
      )
      // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
      expect(filed.code).toBe(409)
    }
    const report = await onePass(settings, [])
    expect(report.deadLetters?.groupId).toBeTruthy()
    expect(report.deadLetters?.addressees).toContain(wOneId)
    expect(report.deadLetters?.because).toContain('past the threshold')
    const claims = (await get('/api/dead-letters', AS_THE_PERSON)) as { claims: { agentId: string; claimedAt: string | null }[] }
    expect(claims.claims.map((one) => one.agentId)).toContain(wOneId)
  })
})