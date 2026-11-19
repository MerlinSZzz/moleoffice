// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORD DOOR READS WHICH AGENT A RUN SERVES WITH THE SAME ONE READER AS THE MESSAGE WORKER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROTECTS
 * ---------------------------------------------------------------------------------------
 *
 * USER.md invariant 9: one fact is worked out in one place. Which agent a run serves is read by
 * `theAgentARunServes` in src/server/lib/worker.ts. It reads `servingAgentId` where the run has
 * one; otherwise it reads `servingAgent` as a stored reference; and only where no registry row
 * answers that string at all, it reads the string as the id of the agent's own record, the spelling
 * some runs were written with (run o2RjuOUEIwpf, 7 September 2026).
 *
 * Two checks in src/server/lib/records.ts ask the same question: `assertMayWriteASandbox` (a run's
 * own agent may not name the run's sandbox) and `theRunThatStartedThisOne` (only the first run of
 * an agent is said to have been started by the run that registered it). Wave 13b built them in one
 * piece and the reader in another, and the two read the older spelling differently: the checks in
 * records.ts found nobody where the worker found the agent. This file proves that they now ask
 * the one reader, with a run whose `servingAgent` holds the agent's RECORD id.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   In assertMayWriteASandbox, read the served agent with `servingAgentId ?? servingAgent` and
 *   `sameAgent` again, as before the join, and the first case fails: the run's own agent names
 *   the sandbox. In theRunThatStartedThisOne, read an earlier run with the stored-stamp reader
 *   alone, and the second case fails: a second run is said to have been started by the
 *   registering run.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
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
const asAgent = (id: string, session?: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

/** A session record filed by whoever the headers say, as any run files its own. */
async function fileARun(headers: Record<string, string>, title: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'session', title, data: { state: 'running', ...data } } })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json() as Record<string, unknown>
}

/** The id of the agent record a registration filed. */
function theAgentsRecord(handle: string): string {
  const row = t.client.sqlite
    .prepare('SELECT r.record_id AS id FROM agent_records r JOIN agents a ON a.id = r.agent_id WHERE a.handle = ?')
    .get(handle) as { id: string } | undefined
  expect(row, `no agent record is mapped for ${handle}`).toBeDefined()
  return (row as { id: string }).id
}

let argusRun: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const secretary = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' } })
  expect(secretary.statusCode, secretary.body).toBe(201)
  argusRun = String(((await fileARun(asAgent(THE_TEST_OFFICES_SECRETARY.handle), `The run of ${THE_TEST_OFFICES_SECRETARY.name}`, {}))['record'] as { id: string }).id)
  // AN AGENT REGISTERED BY THE SECRETARY'S RUN, so its registry row records the run that started it.
  for (const handle of ['rec-runner', 'rec-first']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle, argusRun), payload: { handle, name: handle, role: 'worker' } })
    expect(made.statusCode, made.body).toBe(201)
  }
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a run whose servingAgent holds its agent\'s record id', () => {
  it('is still the run of that agent, so the agent may not name the run\'s sandbox', async () => {
    const run = await fileARun(AS_THE_PERSON, 'A run written with the older spelling', { servingAgent: theAgentsRecord('rec-runner') })
    const runId = (run['record'] as { id: string }).id
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${runId}`,
      headers: asAgent('rec-runner'),
      payload: { dataPatch: { sandbox: { template: 'mole-office-dev', container: 'a-row', folder: '/anywhere' } } },
    })
    expect(reply.statusCode, reply.body).toBe(403)
    expect(reply.body).toContain('A run does not name its own sandbox')
  })

  it('counts as the agent\'s earlier run, so a later run is not said to be started by the registering run', async () => {
    await fileARun(AS_THE_PERSON, 'An earlier run written with the older spelling', { servingAgent: theAgentsRecord('rec-first') })
    const later = await fileARun(asAgent('rec-first'), 'A later run of rec-first', { servingAgent: 'rec-first' })
    const record = later['record'] as { data: Record<string, unknown> }
    expect(record.data['parentAttachment']).toBeUndefined()
    expect(later['moleOfficeWrote']).toBeUndefined()
  })
})
