// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT DOES NOT WRITE ITSELF A CARD OR A GRANT THROUGH THE ORDINARY RECORD DOOR.
 * Problem mz5ddKDITE3j, criterion P82.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, BEFORE ANY OF THIS WAS BUILT
 * ---------------------------------------------------------------------------------------
 *
 * A verification run (report at ~/.cache/mole-office/<an agent's folder>/verify-1/REPORT.md, probe at
 * ~/.cache/mole-office/worktrees/of-verify-1/tests/a-worker-cannot-write-itself-a-card.test.ts)
 * drove the running office and got these answers. Re-measured here on 8 September 2026 before the
 * fix, on this branch:
 *
 *   1. the person registers `low-one` with no card             201, the row reads as a worker
 *   2. `low-one` reads its own agent record                    200
 *   3. `low-one` PATCHes its own record, role: secretary       200, "Saved. What changed: role."
 *   4. `low-one` PATCHes an elevation grant onto it            200, "Saved. What changed: elevation."
 *   5. the registry row                                        role: secretary, roleReadAs: secretary
 *   6. `low-one` writes a decision with no authority           201
 *
 * Step 6 is the one that matters. A decision is a governance act and an ordinary agent is refused
 * it; a plain worker asking for that exact request is answered 403. The 201 says the card and the
 * grant the agent wrote for itself were read back as the person's own authority.
 *
 * The path is not a mystery: `keepTheAgentRegistryInStep` copies a non-empty role and a non-empty
 * elevation list from the record down to the registry row (src/server/lib/participants.ts, about
 * lines 592 to 611), `theElevationHeldBy` reads the row (src/server/lib/elevation.ts about line
 * 143), and `actsForThePerson` hands that grant to the actor. `checkAgentRole` on the write path
 * only asked whether the WORD was a declared card; nothing asked who was allowed to write it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED HERE
 * ---------------------------------------------------------------------------------------
 *
 *   · the two writes are refused, through `dataPatch` and through a whole-object `data`, with a
 *     sentence naming the act and the door that does it;
 *   · nothing is written: the record and the registry row are as they were;
 *   · the governance act is refused again, which is what the two writes were for;
 *   · the doors that DO appoint and elevate still work — the person's appointment lands, and a
 *     supervisor registering a worker still writes that worker's card;
 *   · an ordinary edit to an agent record that leaves the card alone is not refused.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   take `checkNobodyIsWritingTheirOwnCard` off the two write paths in src/server/lib/records.ts
 *   and steps 3, 4, 5 and 6 answer as they did in the measurement above.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}

const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

let t: TestDb
let app: FastifyInstance
/** The agent record `low-one` was registered with, found the way the probe found it. */
let ownRecord = ''

const AGRANT = [
  { id: 'elevation-self-written-1', endsWhen: 'when you say', grantedAt: '2026-09-08 00:00:00', grantedBy: THE_PERSON },
]

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; body: string; json: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, body: reply.body, json }
}

/** One registry row, as the participants list answers it. */
async function rowFor(handle: string): Promise<Record<string, unknown>> {
  const said = await ask('GET', `/api/participants/agent/${handle}`, AS_THE_PERSON)
  expect(said.status, said.body).toBe(200)
  return said.json['participant'] as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await ask('POST', '/api/agents/started', AS_THE_PERSON, {
    handle: 'low-one',
    name: 'Low One',
    runtime: 'claude-code',
  })
  expect(made.status, made.body).toBe(201)
  const mine = await ask('GET', '/api/records?kind=agent&shape=full', asAgent('low-one'))
  const rows = (mine.json['records'] ?? []) as { id: string; data?: { handle?: string } }[]
  ownRecord = rows.find((row) => row.data?.handle === 'low-one')?.id ?? ''
  expect(ownRecord, 'the agent can read its own record, which is how it found this').not.toBe('')
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. the two writes

describe('an agent writing its own card', () => {
  it('is refused through dataPatch, with the act and the door named', async () => {
    const said = await ask('PATCH', `/api/records/${ownRecord}`, asAgent('low-one'), {
      dataPatch: { role: 'secretary' },
    })
    expect(said.status, said.body).toBe(403)
    expect(said.body, 'which field').toContain('role')
    expect(said.body, 'whose act it is').toContain('the person')
    expect(said.body, 'and the door that does it').toContain('/api/roles/card/')
    expect(said.body).toContain('Nothing was written')
  })

  it('is refused through a whole-object data as well, because one path is not a rule', async () => {
    const held = await ask('GET', `/api/records/${ownRecord}`, asAgent('low-one'))
    const data = (held.json['record'] as { data: Record<string, unknown> }).data
    const said = await ask('PATCH', `/api/records/${ownRecord}`, asAgent('low-one'), {
      data: { ...data, role: 'secretary' },
      replace: true,
    })
    expect(said.status, said.body).toBe(403)
    expect(said.body).toContain('Nothing was written')
  })

  /**
   * WHAT THIS MEASURED UNTIL 8 SEPTEMBER 2026. The record and the row held NO card, because a
   * registration that named none wrote none. Criterion P75 writes the worker card at registration
   * with a mark saying the rule chose it, so what this measures now is that the refused write
   * changed NOTHING: the card is still the one the registration wrote, and the mark still says the
   * rule chose it rather than this agent.
   */
  it('writes nothing: the record and the registry row are as they were', async () => {
    const held = await ask('GET', `/api/records/${ownRecord}`, AS_THE_PERSON)
    expect((held.json['record'] as { data: Record<string, unknown> }).data['role']).toBe('worker')
    const row = await rowFor('low-one')
    expect(row['role'], 'the card the registration wrote, and not the one it asked for').toBe('worker')
    expect(row['roleReadAs'], 'and every refusal reads it as that').toBe('worker')
    expect(row['cardChosenBy'], 'and the rule still chose it, not this agent').toEqual({
      how: 'the-rule',
      who: null,
    })
  })
})

describe('an agent writing itself a grant to act for the person', () => {
  it('is refused, with the act and the door named', async () => {
    const said = await ask('PATCH', `/api/records/${ownRecord}`, asAgent('low-one'), {
      dataPatch: { elevation: AGRANT },
    })
    expect(said.status, said.body).toBe(403)
    expect(said.body, 'which field').toContain('elevation')
    expect(said.body, 'and the door that does it').toContain('/api/roles/elevation/')
    expect(said.body).toContain('Nothing was written')
  })

  it('writes nothing', async () => {
    const held = await ask('GET', `/api/records/${ownRecord}`, AS_THE_PERSON)
    expect((held.json['record'] as { data: Record<string, unknown> }).data['elevation']).toBeUndefined()
  })
})

// ============================================================ 2. what the two writes were for

describe('the governance act the self-written card was for', () => {
  it('is refused, as it is to any other worker', async () => {
    const said = await ask('POST', '/api/records', asAgent('low-one'), {
      kind: 'decision',
      title: 'A decision low-one should not make',
      data: { decided_by: 'low-one', because: 'This is the self-elevation probe.' },
    })
    expect(said.status, said.body).toBe(403)
  })

  it('leaves no decision behind', async () => {
    const said = await ask('GET', '/api/records?kind=decision&shape=full', AS_THE_PERSON)
    expect((said.json['records'] ?? []) as unknown[]).toEqual([])
  })
})

// ============================================================ 3. the doors that do this still work

describe('the doors that appoint and elevate', () => {
  it('let the person appoint a card, which is what the refusal points at', async () => {
    const said = await ask('POST', '/api/roles/card/low-one', AS_THE_PERSON, { role: 'supervisor' })
    expect(said.status, said.body).toBe(201)
    expect((await rowFor('low-one'))['role']).toBe('supervisor')
  })

  it('let a starter write the card of an agent it registers', async () => {
    const said = await ask('POST', '/api/agents/started', asAgent('low-one'), {
      handle: 'lower-one',
      name: 'Lower One',
      role: 'worker',
      runtime: 'claude-code',
    })
    expect(said.status, said.body).toBe(201)
    expect((await rowFor('lower-one'))['role']).toBe('worker')
  })

  it('let the person grant a secretary the right to act for them', async () => {
    const made = await ask('POST', '/api/roles/card/low-one', AS_THE_PERSON, { role: 'secretary' })
    expect(made.status, made.body).toBe(201)
    const said = await ask('POST', '/api/roles/elevation/low-one', { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'a test raises it', endsWhen: 'when you say' })
    expect(said.status, said.body).toBe(201)
  })
})

// ============================================================ 4. an ordinary edit is not refused

describe('an ordinary edit to an agent record', () => {
  it('is left alone when it does not touch the card or the grant', async () => {
    const said = await ask('PATCH', `/api/records/${ownRecord}`, asAgent('low-one'), {
      dataPatch: { notes: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/scratch/low-one` },
    })
    expect(said.status, said.body).toBe(200)
  })

  it('is left alone when it resends the card already stored, which is what a whole-object edit does', async () => {
    const held = await ask('GET', `/api/records/${ownRecord}`, asAgent('low-one'))
    const data = (held.json['record'] as { data: Record<string, unknown> }).data
    expect(data['role'], 'the person appointed it above, so the whole object carries a card').toBe('secretary')
    const said = await ask('PATCH', `/api/records/${ownRecord}`, asAgent('low-one'), {
      data: { ...data, notes: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/scratch/low-one-again` },
      replace: true,
    })
    expect(said.status, said.body).toBe(200)
  })
})
