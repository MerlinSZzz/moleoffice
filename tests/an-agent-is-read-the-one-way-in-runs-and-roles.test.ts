// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT IS READ THE ONE WAY ACROSS THE MERGE MACHINE, THE ROLE GATE AND INSPECTION.
 *
 * Criterion I2 of design/agents/IDENTITY-ACCEPTANCE.md: the id
 * and the name are separate, an id is the unique index, and every reader of an agent reference goes
 * through the one reading. This is the second half of piece I-3: src/server/lib/merge-state-machine.ts,
 * rolegate.ts, agentmemory.ts, lib/inspection.ts and honour.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH CASE IS FOR, AND THE MUTATION THAT TURNS IT RED AFTER A GREEN CONTROL
 * ---------------------------------------------------------------------------------------
 *
 *   1. INSPECTION FINDS THE AGENT behind a legacy handle, a minted registry id, and an agent RECORD
 *      id, and finds NOBODY for a stored string that is one agent's id and another agent's handle.
 *      The minted rows are written straight at the table, as
 *      tests/an-agent-whose-id-is-not-its-handle-writes-under-its-name.test.ts does, so each id is
 *      known in advance. The legacy row must be written there too, because the door now mints an id
 *      and never makes an agent whose id is its handle. The agent with a record is registered at the
 *      door, and its minted id is read from the door's answer.
 *      Mutation: put `theAgentOfARun` back on `agentByHandle(wrote) ?? listParticipants()...`, the
 *      old handle-first order, and the minted-id and record-id cases go red, and the ambiguous case
 *      goes red because a handle lookup answers one of the two agents.
 *
 *   2. THE ROLE GATE ANSWERS with the role of an agent whose id is not its handle, for the caller
 *      that sends the handle and for the one that sends the id.
 *      Mutation: `theRoleOfTheCaller` back on `agentByHandle(who.id)` answers null (rung 0) and the
 *      published role is null.
 *
 *   3. AN INDEPENDENT CHECKER is the one the run does not serve, and the run's own worker is refused
 *      whether it arrives by handle or by id.
 *      Mutation: compare the resolved caller id with the worker's HANDLE instead of its id.
 *
 *   4. THE WAITER HOLDS BY HANDLE even when the agent's id is not its handle, which is criterion I9's
 *      contract and the reason lib/handles.ts is unchanged by this piece.
 *      Mutation: `holdTheHandle`'s `agentByHandle(asked.handle)` replaced by a by-id read answers 404
 *      for a minted agent's handle.
 *
 * Every fixture here is synthetic, and the database is a throwaway under the temporary directory.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { execFileSync } from 'node:child_process'

import { apiApp, expectPanelError, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const WORKSPACE = 'default'

/** A legacy agent: its id is the name it was registered under. */
const LEGACY = { id: 'legacy-runner', handle: 'legacy-runner', name: 'Legacy Runner', role: 'worker' }
/** A minted agent: an id of its own, and a name that is not it. */
const MINTED = { id: 'Ym4kQ2mVb8Tz', handle: 'minted-runner', name: 'Minted Runner', role: 'worker' }
/** A minted agent holding the secretary card, for the merge machine's confirm door. */
const SECRETARY = { id: 'Zm5nR3wXc9Yr', handle: 'zz-minted-secretary', name: 'Minted Secretary', role: 'secretary' }
/** One string two agents answer: this is the FIRST agent's exact id AND the SECOND agent's handle. */
const AMBIGUOUS_FIRST = { id: 'shared-name', handle: 'shared-name-first', name: 'Shared First', role: 'worker' }
const AMBIGUOUS_SECOND = { id: 'Cn6pQ8rT2wXz', handle: 'shared-name', name: 'Shared Second', role: 'worker' }

let t: TestDb
let app: FastifyInstance
let inspection: typeof import('../src/server/lib/inspection.ts')
let tip = ''
/** The registry id the door minted for `record-runner`. */
let recordRunnerId = ''

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

function insertAgent(who: { id: string; handle: string; name: string; role?: string | null }): void {
  const avatar = `avatar-default-agent-${who.id}`
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(avatar, '2026-09-23 10:00:00')
  t.client.sqlite
    .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, role, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
    .run(who.id, who.name, who.handle, avatar, who.role ?? null, '2026-09-23 10:00:00')
}

/** A run record whose only identity is the stored reference under test. */
function aRun(serving: Record<string, unknown>): string {
  return t.api.createRecord({
    kind: 'session',
    title: 'Synthetic run for a stored agent reference',
    workspaceId: WORKSPACE,
    // A RUN OF ANOTHER AGENT IS FILED BY THE PERSON, from inside the office: since the filing door of round 30 a
    // session for an agent is filed only by that agent, those above it, the person proved, or the office.
    actor: serving['servingAgent'] === MINTED.handle ? { type: 'agent', id: MINTED.id } : { type: 'human', id: THE_PERSON },
    origin: 'fixture',
    data: { state: 'running', cutFrom: 'main', tip, workingDirectory: process.cwd(), ...serving },
  }).id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  inspection = await import('../src/server/lib/inspection.ts')
  tip = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  insertAgent(LEGACY)
  insertAgent(MINTED)
  insertAgent(SECRETARY)
  insertAgent(AMBIGUOUS_FIRST)
  insertAgent(AMBIGUOUS_SECOND)

  // AN AGENT WITH A RECORD, for the third spelling `theAgentOfARun` reads: the id of the agent's own
  // record in this project. It cannot be made by inserting at the table, because that writes no record.
  const created = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'record-runner', name: 'Record Runner', role: 'worker', workArea: ['src'] },
  })
  expect(created.statusCode, created.body).toBe(201)
  recordRunnerId = (created.json() as { agent: { id: string } }).agent.id
  expect(recordRunnerId, 'the door gave record-runner its handle as its id, not a minted id').not.toBe('record-runner')
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ================================================== 1. inspection reads a stored reference one way

describe('inspection.ts finds the agent a stored run name means, and nobody where two answer', () => {
  it('finds a legacy agent by the handle its id also is', () => {
    const found = inspection.theAgentOfARun({ data: { servingAgent: LEGACY.handle } })
    expect(found?.id).toBe(LEGACY.id)
    expect(found?.handle).toBe(LEGACY.handle)
  })

  it('finds a minted agent by its registry id and by its handle', () => {
    expect(inspection.theAgentOfARun({ data: { servingAgent: MINTED.id } })?.id).toBe(MINTED.id)
    expect(inspection.theAgentOfARun({ data: { servingAgent: MINTED.handle } })?.id).toBe(MINTED.id)
  })

  it('finds a minted agent whose servingAgentId is written beside the handle', () => {
    const found = inspection.theAgentOfARun({ data: { servingAgent: MINTED.handle, servingAgentId: MINTED.id } })
    expect(found?.id).toBe(MINTED.id)
  })

  it('still finds the agent an agent RECORD id names, which is the run o2RjuOUEIwpf story', () => {
    const row = t.client.sqlite
      .prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ?')
      .get(recordRunnerId) as { id: string }
    expect(inspection.theAgentOfARun({ data: { servingAgent: row.id } })?.id).toBe(recordRunnerId)
  })

  it('reads the seal binding the same way, for a name that is a handle rather than a record id', () => {
    const run = { data: { ranAs: [{ workspaceId: WORKSPACE, agentId: MINTED.id }] }, workspaceId: WORKSPACE }
    expect(inspection.theAgentOfARunForItsSeal(run)?.id).toBe(MINTED.id)
  })

  it('finds nobody for a string that is one agent id and another agent handle, and the check says so', () => {
    // The string is AMBIGUOUS_FIRST's exact id AND AMBIGUOUS_SECOND's live handle. A stored reader
    // must not pick either, and must not throw: the check reads the run as served by nobody.
    expect(inspection.theAgentOfARun({ data: { servingAgent: 'shared-name' } })).toBeNull()
    const decision = inspection.checkEligibilityForRun(aRun({ servingAgent: 'shared-name' }), WORKSPACE)
    expect(decision.eligible).toBe(false)
    expect(decision.missing.map((one) => one.fact)).toContain('workerServed')
  })
})

// ================================================== 2. the role gate and an id that is not a handle

describe('the role gate reads the role of an agent whose id is not its handle', () => {
  it('answers the caller that sends the handle', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/access', headers: asAgent(MINTED.handle) })
    expect(reply.statusCode, reply.body).toBe(200)
    expect((reply.json() as { caller: { role: string | null } }).caller.role).toBe('worker')
  })

  it('answers the caller that sends the id', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/access', headers: asAgent(MINTED.id) })
    expect(reply.statusCode, reply.body).toBe(200)
    expect((reply.json() as { caller: { role: string | null } }).caller.role).toBe('worker')
  })
})

// ================================================== 3. an independent checker

describe('an independent checker is compared by registry id, not by spelling', () => {
  it('refuses the run own worker arriving by handle and by id, and lets another agent through', () => {
    const run = aRun({ servingAgent: MINTED.handle })
    expectPanelError(t, () => inspection.requireIndependentChecker(run, WORKSPACE, { type: 'agent', id: MINTED.handle }), 403)
    expectPanelError(t, () => inspection.requireIndependentChecker(run, WORKSPACE, { type: 'agent', id: MINTED.id }), 403)
    expect(() => inspection.requireIndependentChecker(run, WORKSPACE, { type: 'agent', id: LEGACY.id })).not.toThrow()
  })
})

// ================================================== 4. the waiter holds by handle

describe('a waiter still holds a minted agent by its handle, which criterion I9 protects', () => {
  it('holds, beats and releases the handle of an agent whose id is not it', async () => {
    const session = t.api.createRecord({
      kind: 'session',
      title: 'A synthetic session holding a minted agent by its handle',
      workspaceId: WORKSPACE,
      data: { state: 'running', runtime: 'claude-code', doing: 'open in a terminal' },
      actor: { type: 'human', id: THE_PERSON },
    }).id

    const held = await app.inject({
      method: 'POST',
      url: `/api/handles/${MINTED.handle}/hold`,
      headers: AS_THE_PERSON,
      payload: { session, machine: 'a-machine', runtime: 'claude-code' },
    })
    expect(held.statusCode, held.body).toBe(201)

    const beat = await app.inject({
      method: 'POST',
      url: `/api/handles/${MINTED.handle}/beat`,
      headers: AS_THE_PERSON,
      payload: { session },
    })
    expect(beat.statusCode, beat.body).toBe(200)

    const released = await app.inject({
      method: 'POST',
      url: `/api/handles/${MINTED.handle}/release`,
      headers: AS_THE_PERSON,
      payload: { session, because: 'the synthetic waiter is done' },
    })
    expect(released.statusCode, released.body).toBe(200)
    expect((released.json() as { hold: { releasedBecause: string | null } }).hold.releasedBecause).toBe('the synthetic waiter is done')

    // AND THE AGENT IS READ BY ITS NAME AT THE DOOR, not by the string the row stores as an id.
    const one = await app.inject({ method: 'GET', url: `/api/handles/${MINTED.handle}`, headers: AS_THE_PERSON })
    expect(one.statusCode, one.body).toBe(200)
    expect((one.json() as { handle: string }).handle).toBe(MINTED.handle)
  })
})
