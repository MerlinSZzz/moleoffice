// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S LIST NAMES A FORK'S STORED SUPERSEDES LINK, AS THE FORK DESK DOES. Problem lXf2ecxwr3sk.
 *
 * A `supersedes` link an agent made on one of the owner's forks does not take it off the owner's
 * list, and must not. GET /api/forks says the claim was made and why it did not count
 * (`replacedButStillHere`). GET /api/waiting carried the same fork with nothing about the link, so
 * the owner was asked the question again with the answer stored beside it.
 *
 * WHAT IS PROVED
 *   1. The waiting row of such a fork carries the fork desk's own `replacedButStillHere`, and its
 *      `why` ends with the desk's sentence. The row is still on the list.
 *   2. A fork nobody claimed anything about carries null, and its `why` says nothing about a link.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the waiting row stops reading the fork desk's claim   → case 1
 *   the claim is carried but left out of `why`             → case 1
 *
 * Nothing here opens ./data/panelx.db: `freshDb` in tests/helpers.ts makes a throwaway database.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ForksReply } from '../src/server/api/forks.ts'
import type { WaitingReply } from '../src/server/api/waiting.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance

const PROJECT = 'panelx'
const asAgent: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': PROJECT,
}
const asPerson: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: PROJECT, title: 'Mole Office' } })
  expect(made.statusCode, made.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

async function fileFork(title: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asPerson,
    payload: { kind: 'proposal', title, data: { question: 'Is a module card a boundary?', options: ['a — yes', 'b — no'], who_settles_it: 'the owner' } },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function read<T>(url: string): Promise<T> {
  const res = await app.inject({ method: 'GET', url, headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as T
}

/**
 * An agent's supersedes link, written straight into the tables as the 24 August 2026 row got there,
 * because the door refuses it today. See tests/a-fork-something-replaced-says-so.test.ts. The row names
 * its owner itself, as that row did: links.owner_id has no default since the owner comes from the installer.
 */
function anAgentsOldLink(fromId: string, toId: string): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO links (owner_id, id, workspace_id, from_id, to_id, type, created_by, created_at, updated_at) ' +
        `VALUES ('${THE_TEST_OFFICES_OWNER.id}', ?, ?, ?, ?, 'supersedes', ?, ?, ?)`,
    )
    .run('legacy-super1', PROJECT, fromId, toId, 'claude-round-ten', '2026-08-24 17:38:47', '2026-08-24 17:38:47')
  t.client.sqlite
    .prepare(
      'INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, field, new_value, at) ' +
        "VALUES (?, ?, ?, 'link', 'agent', 'claude-round-ten', 'supersedes', ?, ?)",
    )
    .run('legacy-chg1', fromId, PROJECT, toId, '2026-08-24 17:38:47')
}

describe("the owner's list names a replaced fork's link", () => {
  it('carries the fork desk’s claim on the waiting row, and says it in why', async () => {
    const old = await fileFork('Is a module card a boundary?')
    const fresh = await fileFork('The module-label question, asked again')
    anAgentsOldLink(fresh, old)

    const desk = one((await read<ForksReply>('/api/forks')).forks.filter((fork) => fork.recordId === old), 'the fork on the desk')
    expect(desk.replacedButStillHere).not.toBeNull()

    const row = one((await read<WaitingReply>('/api/waiting')).items.filter((item) => item.id === old), "the fork on the owner's list")
    expect(row.tier).toBe('settle')
    expect(row.replacedButStillHere).toEqual(desk.replacedButStillHere)
    expect(row.why.endsWith(` ${String(desk.replacedButStillHere?.sentence)}`), row.why).toBe(true)
    expect(row.why).toContain(fresh)
  })

  it('carries nothing on a fork nobody claimed was replaced', async () => {
    const lone = await fileFork('Is a module card a boundary?')
    const row = one((await read<WaitingReply>('/api/waiting')).items.filter((item) => item.id === lone), "the fork on the owner's list")
    expect(row.replacedButStillHere).toBeNull()
    expect(row.why).not.toContain('did not take it off your queue')
  })
})
