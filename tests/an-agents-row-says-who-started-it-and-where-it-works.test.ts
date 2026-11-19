// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO STARTED AN AGENT, WHAT IT MAY DO, AND WHERE IT WORKS.
 *
 * Criteria P2 and P43 of design/permissions/ACCEPTANCE.md.
 *
 * P2: *The agents registry carries a starter and a role. Two column pairs on the `agents` table:
 * `started_by_kind`/`started_by_id`, and `role`. A row with no role reads as worker, and the page
 * says "no role set" rather than drawing a word nobody chose.*
 *
 * P43: the work area, such as folders and files, is registered when an agent worker registers and starts,
 * which makes a change easy to place: *A registration records the work area: the
 * folders and files that agent may change.*
 *
 * WHAT IS NOT PROVED HERE. Whether a starter is a chain that reaches the person is P9, and the
 * refusal that names a starter is P5; both are their own tests. This one is about the three facts
 * being stored, being read back, and being told apart from their own absence.
 */

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS, NO_ROLE_SET } from '../src/shared/roles.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

/** The work area a real registration carries: a worktree, and two files inside it. */
const AN_AREA = [
  `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/permissions-1`,
  'src/server/lib/roles.ts',
  'src/config/roles.json',
]

function fileAnAgent(title: string, data: Record<string, unknown>): void {
  t.api.createRecord({
    workspaceId: 'panelx',
    kind: 'agent',
    title,
    data,
    actor: { type: 'human', id: THE_PERSON },
  })
}

/** One agent as GET /api/participants publishes it. */
async function readBack(handle: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: '/api/participants' })
  expect(reply.statusCode).toBe(200)
  const said = reply.json() as { agents: Record<string, unknown>[] }
  const one = said.agents.find((row) => row['handle'] === handle)
  expect(one, `no agent called ${handle} came back`).toBeDefined()
  return one as Record<string, unknown>
}

function rowFor(handle: string): Record<string, unknown> {
  return t.client.sqlite.prepare('SELECT * FROM agents WHERE handle = ?').get(handle) as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the three columns are there and hold what was written', () => {
  it('stores the starter, the role and the work area a registration carried', () => {
    fileAnAgent('Builder PA', {
      handle: 'builder-pa',
      runtime: 'claude-code',
      state: 'active',
      startedBy: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle },
      role: 'worker',
      workArea: AN_AREA,
    })
    const row = rowFor('builder-pa')
    expect(row['started_by_kind']).toBe('agent')
    expect(row['started_by_id']).toBe(THE_TEST_OFFICES_SECRETARY.handle)
    expect(row['role']).toBe('worker')
    expect(JSON.parse(String(row['work_area']))).toEqual(AN_AREA)
  })

  it('publishes all three on GET /api/participants, so nothing has to read the table', async () => {
    const said = await readBack('builder-pa')
    expect(said['startedBy']).toEqual({ kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle })
    expect(said['role']).toBe('worker')
    expect(said['workArea']).toEqual(AN_AREA)
  })

  it('leaves all three empty for an agent nobody said any of it about', async () => {
    fileAnAgent('Builder Old', { handle: 'builder-old', runtime: 'claude-code', state: 'active' })
    const row = rowFor('builder-old')
    expect(row['started_by_kind']).toBeNull()
    expect(row['started_by_id']).toBeNull()
    expect(row['role']).toBeNull()
    expect(row['work_area']).toBeNull()
    const said = await readBack('builder-old')
    expect(said['startedBy']).toBeNull()
    expect(said['role']).toBeNull()
    expect(said['workArea']).toBeNull()
  })
})

describe('a row with no role is read as a worker, and the page does not draw that word', () => {
  it('says the enforcement reads it as a worker', async () => {
    const said = await readBack('builder-old')
    expect(said['roleReadAs']).toBe(A_ROW_WITH_NO_ROLE_READS_AS)
    expect(said['roleReadAs']).toBe('worker')
  })

  it('says "no role set" for a screen, so no word nobody chose is drawn as a choice', async () => {
    const said = await readBack('builder-old')
    expect(said['role']).toBeNull()
    expect(said['roleSays']).toBe(NO_ROLE_SET)
    expect(said['roleSays']).toBe('no role set')
  })

  it('says nothing for a screen where somebody did choose, so nothing draws both', async () => {
    const said = await readBack('builder-pa')
    expect(said['role']).toBe('worker')
    expect(said['roleSays']).toBeNull()
  })
})

describe('a role is one of the words a card declares', () => {
  it('refuses a word no card holds, and names every word there is', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: {
        kind: 'agent',
        title: 'Builder Wrong',
        data: { handle: 'builder-wrong', runtime: 'claude-code', state: 'active', role: 'overlord' },
      },
    })
    expect(reply.statusCode).toBe(400)
    const said = String((reply.json() as { error?: unknown }).error ?? '')
    expect(said).toContain('"overlord"')
    for (const word of ['worker', 'supervisor', 'secretary', 'inspector']) {
      expect(said, `the refusal does not name ${word}`).toContain(word)
    }
    expect(said).toContain('src/config/roles.json')
    // And nothing was written, which is what "Nothing was written" in the refusal claims.
    expect(rowFor('builder-wrong')).toBeUndefined()
  })

  it('accepts every word the cards do declare', async () => {
    const { theRoleCards } = await import('../src/server/lib/roles.ts')
    for (const card of theRoleCards().cards) {
      const handle = `role-${card.name}`
      fileAnAgent(`A ${card.name}`, { handle, runtime: 'claude-code', state: 'active', role: card.name })
      expect(rowFor(handle)['role'], `${card.name} was not stored`).toBe(card.name)
    }
  })
})

describe('nobody recorded a work area is not the same answer as there is no work area', () => {
  it('keeps an empty list as an empty list', async () => {
    fileAnAgent('Builder Nowhere', {
      handle: 'builder-nowhere',
      runtime: 'claude-code',
      state: 'active',
      workArea: [],
    })
    expect(JSON.parse(String(rowFor('builder-nowhere')['work_area']))).toEqual([])
    const said = await readBack('builder-nowhere')
    expect(said['workArea']).toEqual([])
    // The one above, which said nothing at all, is null and not an empty list.
    expect((await readBack('builder-old'))['workArea']).toBeNull()
  })
})
