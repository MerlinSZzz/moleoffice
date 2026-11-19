// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARIAT GROUP: ONE STANDING GROUP, THE OWNER AND EVERY SECRETARY.
 *
 * THE RULE: every secretary is put into the Secretariat group automatically,
 * and the owner is in it too. The office keeps one standing group holding the owner and every agent that
 * holds the secretary card; a secretary joins it when it is registered with the card or given it and
 * leaves when retired.
 *
 * WHAT THIS FILE PROVES. The group exists from a server start with the owner in it. A registration
 * that names the secretary card puts the new secretary in it. Giving the card to an agent already
 * registered does the same, and taking the card away takes it out. A second registration never makes
 * a second group. A retired secretary leaves. And the group is filed in the installation's own
 * project, so `GET /api/groups` answers with it and its members.
 *
 * WHERE THE RULES LIVE. src/server/lib/secretariat.ts is the one place that decides who belongs;
 * every door that can change a secretary calls `syncTheSecretariatGroup` after its own write. The
 * boot call is in src/server/index.ts, inside `buildApp`.
 *
 * Mutation, named, after a control run: in src/server/api/participants.ts, in the
 * `POST /api/participants/agent/:id/retire` handler, delete the `bringTheSecretariatGroupInStep()`
 * call — a retired secretary is left in the group — and the "a retired secretary leaves it" case
 * below goes red. The restore is byte-identical, sha256 checked before and after.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

interface GroupRow {
  id: string
  name: string
  workspaceId: string
  openedBy: { kind: string; id: string }
  /** True for the office's own standing group, which the chat draws in a pinned category first. */
  pinned: boolean
  members: { who: { kind: string; id: string } }[]
}

async function groups(): Promise<GroupRow[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/groups', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  return (reply.json() as { groups: GroupRow[] }).groups ?? []
}

function theSecretariat(rows: GroupRow[]): GroupRow {
  const found = rows.filter((one) => one.name === 'Secretariat')
  expect(found, 'there is exactly one group named Secretariat').toHaveLength(1)
  return found[0]!
}

function memberIds(group: GroupRow): string[] {
  return group.members.map((one) => `${one.who.kind}:${one.who.id}`)
}

async function register(handle: string, role: string, headers: Record<string, string>): Promise<void> {
  const { code, said } = await post('/api/agents/started', { handle, name: handle, role }, headers)
  expect(code, `registering ${handle} as ${role}: ${JSON.stringify(said).slice(0, 300)}`).toBe(201)
}

/** The registry id of the agent registered under this handle. A new agent's id is not its handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
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

describe('the group is standing, and the owner is in it from the start', () => {
  it('a server start makes the group once, with the owner and nobody else', async () => {
    const group = theSecretariat(await groups())
    expect(group.workspaceId, 'the group is filed in the installation\'s own project').toBe('default')
    expect(group.openedBy).toEqual({ kind: 'agent', id: theOfficesOwnId(t) })
    expect(group.pinned, 'GET /api/groups does not mark the standing group pinned').toBe(true)
    expect(memberIds(group)).toEqual([`person:${THE_PERSON}`])
  })

  it('and GET /api/groups/:id draws it like any group, with its members', async () => {
    const group = theSecretariat(await groups())
    const reply = await app.inject({ method: 'GET', url: `/api/groups/${group.id}`, headers: AS_THE_PERSON })
    expect(reply.statusCode).toBe(200)
    const said = reply.json() as { group: GroupRow; yours: boolean }
    expect(said.group.name).toBe('Secretariat')
    expect(said.yours, 'the owner is in it').toBe(true)
    expect(memberIds(said.group)).toContain(`person:${THE_PERSON}`)
  })
})

describe('a secretary joins it when it is registered with the card or given it', () => {
  it('a registration naming the secretary card puts the new secretary in', async () => {
    await register(THE_TEST_OFFICES_SECRETARY.handle, 'secretary', AS_THE_PERSON)
    const group = theSecretariat(await groups())
    expect(memberIds(group)).toContain(`agent:${idOf(THE_TEST_OFFICES_SECRETARY.handle)}`)
  })

  it('giving the card to an agent already registered puts it in too', async () => {
    await register('w-one', 'worker', asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    expect(memberIds(theSecretariat(await groups()))).not.toContain(`agent:${idOf('w-one')}`)
    const { code, said } = await post('/api/roles/card/w-one', { role: 'secretary' }, AS_THE_PERSON)
    expect(code, JSON.stringify(said).slice(0, 300)).toBe(201)
    expect(memberIds(theSecretariat(await groups()))).toContain(`agent:${idOf('w-one')}`)
  })

  it('taking the card away takes it out again', async () => {
    const { code } = await post('/api/roles/card/w-one', { role: 'worker' }, AS_THE_PERSON)
    expect(code).toBe(201)
    expect(memberIds(theSecretariat(await groups()))).not.toContain(`agent:${idOf('w-one')}`)
  })

  it('a second secretary joins the same group, and no second group is made', async () => {
    await register('fern', 'secretary', AS_THE_PERSON)
    const all = await groups()
    expect(all.filter((one) => one.name === 'Secretariat')).toHaveLength(1)
    expect(memberIds(theSecretariat(all))).toContain(`agent:${idOf('fern')}`)
  })

  it('a plain worker registration adds nobody', async () => {
    await register('w-two', 'worker', asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    const members = memberIds(theSecretariat(await groups()))
    expect(members).not.toContain(`agent:${idOf('w-two')}`)
    // SORTED, because two joins in the same second are ordered by their membership ids rather than
    // by which happened first, and this test is about who is in the group and not about that order.
    expect([...members].sort()).toEqual([`agent:${idOf(THE_TEST_OFFICES_SECRETARY.handle)}`, `agent:${idOf('fern')}`, `person:${THE_PERSON}`].sort())
  })
})

describe('a retired secretary leaves it', () => {
  it('retiring fern takes her out and leaves the rest in', async () => {
    const { code, said } = await post('/api/participants/agent/fern/retire', { because: 'Her work is done.' }, AS_THE_PERSON)
    expect(code, JSON.stringify(said).slice(0, 300)).toBe(200)
    const group = theSecretariat(await groups())
    expect(memberIds(group)).not.toContain(`agent:${idOf('fern')}`)
    expect(memberIds(group)).toContain(`agent:${idOf(THE_TEST_OFFICES_SECRETARY.handle)}`)
    expect(memberIds(group)).toContain(`person:${THE_PERSON}`)
  })
})
