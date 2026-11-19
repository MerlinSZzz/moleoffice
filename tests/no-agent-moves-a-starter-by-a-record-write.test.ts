// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO AGENT MOVES AN AGENT'S STARTER BY AN ORDINARY RECORD WRITE. Wave 13u, round 185.
 *
 * The starter answers for an agent: its keys, its letters and its next round. The registry row's starter follows a
 * new `data.startedBy` on the agent's record, so before this round any agent with its own key could make itself any
 * agent's starter with one PATCH. Round 184 tried five such writes in a throwaway office and each answered 200.
 *
 *   1. Each of those five changes, sent by an agent with its own key, is refused, and the row keeps its starter. So is
 *      the change sent by the agent's own starter. The refusal names the door the change goes through.
 *   2. A write that carries the starter the row already holds is not a change, and an agent may send it.
 *   3. A record can hold a starter its row does not: a registration in a second project under a live agent's handle
 *      writes the registering agent as the starter and leaves the row alone. A later write of that record that leaves
 *      the field as it is would still move the row, so it is refused for an agent too.
 *   4. Since round 186 the person's own write is refused too, with the same sentence, because the door has landed:
 *      the person changes a starter by a press on the agent's page, which checks the change and tells who it touches.
 *   5. The person retires the agent of case 3, whose second record holds a starter its row does not. The retire door
 *      writes every live record of the agent, and the guard refused that write until round 186, so the agent could
 *      not be retired at all. Now it is retired in both projects and its row keeps its own starter.
 *   6. Inside a test world, its starter holds the person's authority there (criterion P84). It moves a starter through
 *      the door, as the person does, and its record write is refused. Another agent in the same world is refused at
 *      the door.
 *
 * Every agent, project and name here is made up.
 */

import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const SECOND = 'made-up-second'
const PERSON_KEY = randomBytes(32).toString('hex')
const OFFICE_KEY = randomBytes(32).toString('hex')

let t: TestDb
let app: FastifyInstance
let theStarterDoor = ''
const keys: Record<string, string> = {}

type Headers = Record<string, string>
const asAgent = (handle: string, workspace = 'default'): Headers => ({
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys[handle]!,
})
const asThePerson = (workspace = 'default'): Headers => ({
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-key': PERSON_KEY,
})

/** The answer, with every key-shaped string hidden so a failure never prints one. */
async function call(method: 'POST' | 'PATCH', url: string, headers: Headers, payload: object): Promise<{ status: number; body: any; said: string }> {
  const res = await app.inject({ method, url, headers, payload })
  let body: unknown = null
  try {
    body = JSON.parse(res.body)
  } catch {
    body = null
  }
  return { status: res.statusCode, body, said: res.body.replace(/[0-9a-f]{64}/g, '<a key>') }
}

const idOf = (handle: string): string => (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id

function theRecordOf(handle: string, workspace = 'default'): string {
  const row = t.client.sqlite
    .prepare('SELECT r.id AS id FROM agent_records m JOIN records r ON r.id = m.record_id WHERE m.agent_id = ? AND r.workspace_id = ?')
    .get(idOf(handle), workspace) as { id: string } | undefined
  if (row === undefined) throw new Error(`${handle} has no record in ${workspace}`)
  return row.id
}

/** The registry row's starter, as every reader of it reads it. */
const theStarterOf = (handle: string): unknown =>
  t.client.sqlite.prepare('SELECT started_by_kind AS kind, started_by_id AS id FROM agents WHERE id = ?').get(idOf(handle))

const anAgentNamed = (handle: string): { kind: string; id: string } => ({ kind: 'agent', id: idOf(handle) })

async function start(handle: string, headers: Headers, role?: string): Promise<void> {
  const made = await call('POST', '/api/agents/started', headers, { handle, name: `The agent ${handle}`, ...(role === undefined ? {} : { role }) })
  expect(made.status, made.said).toBe(201)
  if (made.body.whatToGiveIt?.key !== undefined) keys[handle] = String(made.body.whatToGiveIt.key)
}

/** One write of `data.startedBy` on an agent's record, and the row's starter before and after it. */
async function moveTheStarter(headers: Headers, handle: string, to: unknown): Promise<{ status: number; said: string; error: string; before: unknown; after: unknown }> {
  const before = theStarterOf(handle)
  const sent = await call('PATCH', `/api/records/${theRecordOf(handle)}`, headers, { dataPatch: { startedBy: to } })
  return { status: sent.status, said: sent.said, error: String(sent.body?.error ?? ''), before, after: theStarterOf(handle) }
}

describe('no agent moves a starter by an ordinary record write', () => {
  beforeAll(async () => {
    t = await freshDb()
    writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: PERSON_KEY, office: OFFICE_KEY, providers: {} }, null, 2)}\n`, {
      mode: 0o600,
    })
    app = (await apiApp()).app
    await app.ready()
    // THE DOOR THE REFUSAL NAMES, read from the code that names it. Read by name on the module, so this file still
    // runs where the code does not have it yet, and fails there on the case that asks for it.
    const records = await import('../src/server/lib/records.ts')
    theStarterDoor = String(Reflect.get(records, 'THE_STARTER_DOOR') ?? '')
    const made = await call('POST', '/api/workspaces', asThePerson(), { id: SECOND, title: 'A made-up second project' })
    expect(made.status, made.said).toBe(201)
    await start('top-a', asThePerson(), 'supervisor')
    await start('top-b', asThePerson(), 'supervisor')
    await start('under-a', asAgent('top-a'))
    await start('under-a-two', asAgent('top-a'))
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    t?.close()
  })

  it("1: each of round 184's five changes, and the starter's own, is refused when an agent sends it", async () => {
    const tries: [string, Headers, string, unknown][] = [
      ['an agent puts another agent under itself', asAgent('top-b'), 'under-a', anAgentNamed('top-b')],
      ['an agent puts itself under another agent', asAgent('under-a-two'), 'under-a-two', anAgentNamed('top-b')],
      ['an agent puts its own starter under itself, a loop', asAgent('under-a-two'), 'top-a', anAgentNamed('under-a-two')],
      ['an agent puts another agent under a name nobody bears', asAgent('top-a'), 'top-b', { kind: 'agent', id: 'made-up-nobody' }],
      ['an agent puts itself under itself', asAgent('under-a'), 'under-a', anAgentNamed('under-a')],
      ["an agent's own starter moves it to another agent", asAgent('top-a'), 'under-a', anAgentNamed('top-b')],
    ]
    for (const [what, headers, handle, to] of tries) {
      const sent = await moveTheStarter(headers, handle, to)
      expect(sent.status, `${what}: ${sent.said}`).toBe(403)
      expect(sent.after, what).toEqual(sent.before)
      expect(sent.error, what).toContain('"startedBy"')
      expect(sent.error, what).toContain(theStarterDoor)
      expect(sent.error, what).toContain('Nothing was written.')
    }
    expect(theStarterDoor, 'records.ts exports no THE_STARTER_DOOR for the refusal to name').not.toBe('')
  })

  it('2: a write that carries the starter the row already holds is not a change', async () => {
    const sent = await call('PATCH', `/api/records/${theRecordOf('under-a')}`, asAgent('under-a'), {
      title: 'The agent under-a, renamed by itself',
      dataPatch: { startedBy: anAgentNamed('top-a') },
    })
    expect(sent.status, sent.said).toBe(200)
    expect(theStarterOf('under-a')).toEqual(anAgentNamed('top-a'))
  })

  it("3: a record holding a starter its row does not is refused a write that would move the row, though the write leaves the field alone", async () => {
    // A REGISTRATION IN A SECOND PROJECT UNDER A LIVE AGENT'S HANDLE joins that agent's row, writes the registering
    // agent as the record's starter, and leaves the row's starter as it was.
    const joined = await call('POST', '/api/agents/started', asAgent('top-b', SECOND), { handle: 'under-a-two', name: 'The agent under-a-two' })
    expect(joined.status, joined.said).toBe(201)
    const record = theRecordOf('under-a-two', SECOND)
    const held = (t.client.sqlite.prepare("SELECT data -> '$.startedBy' AS s FROM records WHERE id = ?").get(record) as { s: string }).s
    expect(JSON.parse(held)).toEqual(anAgentNamed('top-b'))
    expect(theStarterOf('under-a-two')).toEqual(anAgentNamed('top-a'))
    const sent = await call('PATCH', `/api/records/${record}`, asAgent('top-b', SECOND), { title: 'The agent under-a-two, in the second project' })
    expect(sent.status, sent.said).toBe(403)
    expect(theStarterOf('under-a-two')).toEqual(anAgentNamed('top-a'))
  })

  it("4: the person's own write is refused too, and the refusal names the door", async () => {
    const tries: [string, unknown][] = [
      ['top-a', anAgentNamed('under-a-two')],
      ['top-b', { kind: 'agent', id: 'made-up-nobody' }],
      ['under-a', anAgentNamed('under-a')],
      ['under-a', anAgentNamed('top-b')],
    ]
    for (const [handle, to] of tries) {
      const sent = await moveTheStarter(asThePerson(), handle, to)
      expect(sent.status, sent.said).toBe(403)
      expect(sent.after).toEqual(sent.before)
      expect(sent.error).toContain(theStarterDoor)
      expect(sent.error).toContain('Nothing was written.')
    }
  })

  it('5: the person retires an agent whose second record holds a starter its row does not, and the row keeps its starter', async () => {
    const second = theRecordOf('under-a-two', SECOND)
    const held = (t.client.sqlite.prepare("SELECT data -> '$.startedBy' AS s FROM records WHERE id = ?").get(second) as { s: string }).s
    expect(JSON.parse(held), 'case 3 left the second record holding another starter').toEqual(anAgentNamed('top-b'))
    expect(theStarterOf('under-a-two')).toEqual(anAgentNamed('top-a'))
    const retired = await call('POST', `/api/participants/agent/${idOf('under-a-two')}/retire`, asThePerson(), { because: 'A made-up agent, retired.' })
    expect(retired.status, retired.said).toBe(200)
    expect(theStarterOf('under-a-two')).toEqual(anAgentNamed('top-a'))
    expect(t.client.sqlite.prepare('SELECT retired FROM agents WHERE id = ?').get(idOf('under-a-two'))).toEqual({ retired: 1 })
    for (const record of [theRecordOf('under-a-two'), second]) {
      expect(t.client.sqlite.prepare("SELECT data ->> '$.state' AS state FROM records WHERE id = ?").get(record), record).toEqual({ state: 'retired' })
    }
  })
})

describe("inside a test world, its starter holds the person's authority there", () => {
  const WORLD_STARTER = 'made-up-world-starter'
  const held = { startedBy: process.env.MOLE_OFFICE_WORLD_STARTED_BY, secretaries: process.env.MOLE_OFFICE_WORLD_SECRETARIES }
  const inTheWorld = (handle: string): Headers => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

  beforeAll(async () => {
    // A WORLD OF ITS OWN, built after the office above is closed, so every helper of this file reads this one. The
    // setting is the one the test-world tool writes, set before the app is built because it is read once.
    t = await freshDb()
    process.env.MOLE_OFFICE_WORLD_STARTED_BY = WORLD_STARTER
    delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
    forgetTheWorldsOwnAuthority()
    app = (await apiApp()).app
    await app.ready()
    for (const handle of [WORLD_STARTER, 'made-up-stranger', 'made-up-moved']) await start(handle, asThePerson())
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    t?.close()
    for (const [name, value] of [['MOLE_OFFICE_WORLD_STARTED_BY', held.startedBy], ['MOLE_OFFICE_WORLD_SECRETARIES', held.secretaries]] as const) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    forgetTheWorldsOwnAuthority()
  })

  it("6: the world's starter moves a starter there through the door, and not by a record write; another agent is refused", async () => {
    const byAWrite = await moveTheStarter(inTheWorld(WORLD_STARTER), 'made-up-moved', anAgentNamed('made-up-stranger'))
    expect(byAWrite.status, byAWrite.said).toBe(403)
    expect(byAWrite.after).toEqual(byAWrite.before)
    const atTheDoor = (handle: string) =>
      call('POST', `/api/agents/${idOf('made-up-moved')}/starter`, inTheWorld(handle), { to: idOf('made-up-stranger'), because: 'A made-up reason.' })
    const before = theStarterOf('made-up-moved')
    const refused = await atTheDoor('made-up-stranger')
    expect(refused.status, refused.said).toBe(403)
    expect(theStarterOf('made-up-moved')).toEqual(before)
    const moved = await atTheDoor(WORLD_STARTER)
    expect(moved.status, moved.said).toBe(200)
    expect(theStarterOf('made-up-moved')).toEqual(anAgentNamed('made-up-stranger'))
  })
})
