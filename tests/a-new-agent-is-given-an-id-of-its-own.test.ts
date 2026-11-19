// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW AGENT IS GIVEN AN ID OF ITS OWN, AND AN OLD ONE KEEPS THE ID IT HAS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROTECTS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion I1 of design/agents/IDENTITY-ACCEPTANCE.md: an agent row has an id of its own, in the
 * shape every record id has (twelve characters from `newParticipantId()`), distinct from its handle. A decision
 * chose this: the id is the index and the handle is only a name. A second
 * answer keeps every agent registered before the change on the id it has, which is its
 * handle, so nothing stored about those agents is rewritten. A decision later reopens that exception for every
 * handle-shaped id, including the office: the code reads the product row by its handle.
 *
 * The registration is `keepTheAgentRegistryInStep` in src/server/lib/participants.ts, reached here
 * through the record library, the way every door that registers an agent reaches it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   Put back `const id = handle` in keepTheAgentRegistryInStep, and the first two cases fail: the
 *   new row's id is its handle again. The second-record case stays green either way: it controls
 *   that registration touches no existing row. A decision changes the product-row case: it now re-mints the synthetic
 *   row, and restoring the handle comparison makes that case red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
}, 60_000)

afterAll(() => {
  t.close()
})

const AS_THE_PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** Register an agent by filing its record, and hand back the record's id. */
function register(handle: string): string {
  const made = t.api.createRecord({
    workspaceId: 'default',
    actor: AS_THE_PERSON,
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active' },
  })
  return made.id
}

/** The registry row a record was mapped to, read straight from the table. */
function theRowOf(recordId: string): { id: string; handle: string } {
  const row = t.client.sqlite
    .prepare('SELECT a.id, a.handle FROM agents a JOIN agent_records r ON r.agent_id = a.id WHERE r.record_id = ?')
    .get(recordId) as { id: string; handle: string } | undefined
  expect(row, `no registry row is mapped to record ${recordId}`).toBeDefined()
  return row as { id: string; handle: string }
}

describe('a new registration mints the id', () => {
  it('gives the new agent a twelve-character id that is not its handle', () => {
    const row = theRowOf(register('fresh-builder'))
    expect(row.handle).toBe('fresh-builder')
    expect(row.id, 'the registration set the id to the handle').not.toBe('fresh-builder')
    expect(row.id).toMatch(/^[A-Za-z0-9_-]{12}$/)
  })

  it('gives two new agents two different ids', () => {
    const one = theRowOf(register('first-builder'))
    const two = theRowOf(register('second-builder'))
    expect(one.id).not.toBe('first-builder')
    expect(two.id).not.toBe('second-builder')
    expect(one.id).not.toBe(two.id)
  })
})

describe('an agent that already has an id keeps it', () => {
  // This test cites a decision.
  it('recognises the product row after its id changes', async () => {
    const shared = await import('../src/shared/participants.ts')
    const row = t.client.sqlite.prepare("SELECT id, handle FROM agents WHERE handle = 'mole-office'").get() as { id: string; handle: string }
    const { newParticipantId } = await import('../src/server/lib/participants.ts')
    const id = newParticipantId()
    t.client.sqlite.prepare('UPDATE agents SET id = ? WHERE id = ?').run(id, row.id)
    try {
      expect(shared.isMoleOffice({ kind: 'agent', id })).toBe(true)
      expect(shared.isMoleOffice({ kind: 'agent', id: row.id })).toBe(false)
    } finally {
      // The product row is the office's own; the next case gets it under the id it found.
      t.client.sqlite.prepare('UPDATE agents SET id = ? WHERE id = ?').run(row.id, id)
    }
  })

  it('maps a second record under a registered handle onto the row that is there, with no new id', async () => {
    const first = theRowOf(register('two-records'))
    // A second project's record under the same handle is the same agent, so it gets no row of its own.
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'other', title: 'Other' })
    const second = t.api.createRecord({
      workspaceId: 'other',
      actor: AS_THE_PERSON,
      kind: 'agent',
      title: 'two-records',
      data: { handle: 'two-records', state: 'active' },
    })
    expect(theRowOf(second.id).id).toBe(first.id)
    const count = t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM agents WHERE handle = 'two-records'").get() as { n: number }
    expect(count.n).toBe(1)
  })
})
