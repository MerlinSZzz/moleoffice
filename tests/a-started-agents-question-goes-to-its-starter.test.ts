// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A QUESTION A STARTED AGENT ASKS THE PERSON GOES TO ITS STARTER FIRST — CRITERION P55.
 *
 * ---------------------------------------------------------------------------------------
 * THE QUESTION, AND WHAT WAS MET
 * ---------------------------------------------------------------------------------------
 *
 * A problem had reached the owner that the owner could not close. The question it raised:
 * should an agent's question not go first to the agent that started it, to settle whether it is for the person or can be closed?
 *
 * Before this, an agent writing `whose_move: "person"` put the record on the owner’s list at once and
 * whoever started that agent never saw it. Measured on the owner’s own corpus on 6 September: problem
 * `ymuGFCaA-zZn`, filed by an agent, on the owner’s list within twenty seconds of being written, and the
 * only two answers the product had for it were the owner’s.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, AND BOTH DIRECTIONS ARE
 * ---------------------------------------------------------------------------------------
 *
 *   · a question from a started agent is NOT on the owner’s list, and the reading says who it is with;
 *   · the starter passing it on IS what puts it there, and the row then names who passed it on;
 *   · a chain of three goes up one rung at a time and not straight to the top;
 *   · only whoever it is with may pass it on, under their own name, one entry at a time, and an
 *     entry already written can never be changed or removed — through the route AND through a
 *     hand-written PATCH, because a rule enforced on one door is not a rule;
 *   · the starter may close it or take the question off it while it is still theirs;
 *   · ONCE IT HAS REACHED THE OWNER NOTHING MOVED: the closing gate refuses the same agent in the same
 *     words it always did. That is the half a suite proving only the new permission would miss;
 *   · an agent nobody recorded a starter for still reaches the owner, and the reading says which of the
 *     four unfollowable chains it was. Holding those back would lose the question silently.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `whereTheQuestionIs` in src/server/lib/confirming.ts return `reachedThePerson: true`
 *     always → the question is on the owner’s list from the moment it is written, the starter's close is
 *     refused, and the two-rung walk collapses. Seven cases go red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CONFIRMED_BY } from '../src/shared/confirming.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})
const WORKSPACE = { 'x-mole-office-workspace': 'default' }

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<number> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  return reply.statusCode
}

/** A problem that asks the person something, filed by whoever is named. Returns its id. */
async function asks(who: Record<string, string>, title: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...WORKSPACE, ...who, 'content-type': 'application/json' },
    payload: { kind: 'problem', title, data: { whose_move: 'person', symptom: 'the arm stops short' } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

/** What `GET /api/waiting` says: the ids on the owner’s list, and what it left out and why. */
async function theOwnersList(): Promise<{
  ids: string[]
  rows: { id: string; passedOnBy: { who: { kind: string; id: string }; at: string } | null }[]
  excluded: { reason: string; count: number }[]
}> {
  const reply = await app.inject({ method: 'GET', url: '/api/waiting', headers: WORKSPACE })
  expect(reply.statusCode, reply.body).toBe(200)
  const said = reply.json() as {
    items: { id: string; passedOnBy: { who: { kind: string; id: string }; at: string } | null }[]
    excluded: { reason: string; count: number }[]
  }
  return { ids: said.items.map((one) => one.id), rows: said.items, excluded: said.excluded }
}

/** Pass a question on, as somebody. Returns the code and what came back. */
async function passItOn(who: Record<string, string>, id: string): Promise<{ code: number; said: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/records/${id}/pass-the-question-on`,
    headers: { ...WORKSPACE, ...who },
  })
  return { code: reply.statusCode, said: reply.body }
}

/** An ordinary PATCH, so every rule is proved on the door a caller actually has. */
async function patch(
  who: Record<string, string>,
  id: string,
  body: Record<string, unknown>,
): Promise<{ code: number; said: string }> {
  const reply = await app.inject({
    method: 'PATCH',
    url: `/api/records/${id}`,
    headers: { ...WORKSPACE, ...who, 'content-type': 'application/json' },
    payload: body,
  })
  return { code: reply.statusCode, said: reply.body }
}

/**
 * THE REGISTRY ID OF THE AGENT REGISTERED UNDER A HANDLE. A new agent's id is minted and is not its
 * handle, and what a record stores about an agent is its id.
 */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent is registered under the handle ${handle}`).toBeDefined()
  return row!.id
}

/** What the record holds now. */
async function stored(id: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: WORKSPACE })
  return (reply.json() as { record: { data: Record<string, unknown> } }).record.data
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  // THE LADDER THE OWNER HAS: the person starts the secretary, the secretary starts a supervisor, and the
  // supervisor starts a worker. Registration refuses a chain that does not reach the person, so
  // every row here has a chain and the walk has something real to walk.
  expect(await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })).toBe(201)
  expect(await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-pa', name: 'Builder PA', role: 'worker' })).toBe(201)
  expect(await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'sup-one', name: 'Supervisor One', role: 'supervisor' })).toBe(201)
  expect(await register(asAgent('sup-one'), { handle: 'builder-pb', name: 'Builder PB', role: 'worker' })).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. it does not reach the owner at all

describe('a question a started agent asks', () => {
  let id = ''
  beforeEach(async () => {
    id = await asks(asAgent('builder-pa'), 'the seed window closed')
  })

  it('is not on the person\'s list, and the list says how many are with a starter', async () => {
    const list = await theOwnersList()
    expect(list.ids).not.toContain(id)
    const bucket = list.excluded.find((one) => one.reason === 'with-a-starter')
    expect(bucket, 'nothing said the question had gone to a starter').toBeDefined()
    expect(bucket?.count).toBeGreaterThanOrEqual(1)
  })

  it('says on the record who it is with, by name', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: WORKSPACE })
    const said = reply.json() as { whereTheQuestionIs?: { with: { id: string } | null; says: string } }
    expect(said.whereTheQuestionIs?.with?.id).toBe(idOf(THE_TEST_OFFICES_SECRETARY.handle))
    expect(said.whereTheQuestionIs?.says).toContain(THE_TEST_OFFICES_SECRETARY.handle)
  })

  it('reaches the owner once its starter passes it on, and the row names who did', async () => {
    expect((await passItOn(asAgent(THE_TEST_OFFICES_SECRETARY.handle), id)).code).toBe(201)
    const list = await theOwnersList()
    expect(list.ids).toContain(id)
    const row = list.rows.find((one) => one.id === id)
    expect(row?.passedOnBy?.who).toEqual({ kind: 'agent', id: idOf(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(row?.passedOnBy?.at).toMatch(/^\d{4}-\d{2}-\d{2} /)
  })

  it('is the starter\'s to close while it is still theirs', async () => {
    const done = await patch(asAgent(THE_TEST_OFFICES_SECRETARY.handle), id, { dataPatch: { state: 'fixed' } })
    expect(done.code, done.said).toBe(200)
    expect((await stored(id))['state']).toBe('fixed')
  })

  it('is the starter\'s to take the question off, while it is still theirs', async () => {
    const done = await patch(asAgent(THE_TEST_OFFICES_SECRETARY.handle), id, { dataPatch: { whose_move: null } })
    expect(done.code, done.said).toBe(200)
    // A null in a merge patch REMOVES the key, so the record holds no value rather than a null one.
    expect((await stored(id))['whose_move']).toBeUndefined()
  })

  it('is refused to an agent that is not the one it is with', async () => {
    const no = await patch(asAgent('builder-pb'), id, { dataPatch: { state: 'fixed' } })
    expect(no.code).toBe(403)
    // The refusal names who it IS with, so the refused agent knows who to ask.
    expect(no.said).toContain(THE_TEST_OFFICES_SECRETARY.handle)
    expect((await stored(id))['state']).toBeUndefined()
  })
})

// ============================================================ 2. one rung at a time

describe('a chain of three', () => {
  it('goes up one rung at a time, and only the top rung puts it on the owner’s list', async () => {
    const id = await asks(asAgent('builder-pb'), 'the gripper reads zero on every trial')
    expect((await theOwnersList()).ids).not.toContain(id)

    // ITS OWN STARTER FIRST. The secretary is two rungs up and it is not the secretary's turn.
    const tooEarly = await passItOn(asAgent(THE_TEST_OFFICES_SECRETARY.handle), id)
    expect(tooEarly.code).toBe(403)
    expect(tooEarly.said).toContain('sup-one')

    expect((await passItOn(asAgent('sup-one'), id)).code).toBe(201)
    // STILL NOT THE OWNER'S. One rung was climbed, and the next one is the secretary.
    expect((await theOwnersList()).ids).not.toContain(id)

    expect((await passItOn(asAgent(THE_TEST_OFFICES_SECRETARY.handle), id)).code).toBe(201)
    const list = await theOwnersList()
    expect(list.ids).toContain(id)
    // BOTH ARE KEPT, oldest first: the list is the path, not the last step of it.
    const held = (await stored(id))[CONFIRMED_BY] as { who: { id: string } }[]
    expect(held.map((one) => one.who.id)).toEqual([idOf('sup-one'), idOf(THE_TEST_OFFICES_SECRETARY.handle)])
  })
})

// ============================================================ 3. nothing moved once it is the owner’s

describe('a question that has reached the owner', () => {
  it('is refused to the agent that passed it on, in the words the gate always used', async () => {
    const id = await asks(asAgent('builder-pa'), 'the second camera never opens')
    expect((await passItOn(asAgent(THE_TEST_OFFICES_SECRETARY.handle), id)).code).toBe(201)
    expect((await theOwnersList()).ids).toContain(id)

    const no = await patch(asAgent(THE_TEST_OFFICES_SECRETARY.handle), id, { dataPatch: { state: 'fixed' } })
    expect(no.code).toBe(403)
    expect(no.said).toContain('answers the question for them')
    expect((await stored(id))['state']).toBeUndefined()
  })

  it('cannot be passed on again, because there is nobody left to pass it to', async () => {
    const id = await asks(asAgent('builder-pa'), 'the log rotates mid-run')
    expect((await passItOn(asAgent(THE_TEST_OFFICES_SECRETARY.handle), id)).code).toBe(201)
    const again = await passItOn(asAgent(THE_TEST_OFFICES_SECRETARY.handle), id)
    expect(again.code, again.said).toBe(403)
    expect(again.said).toContain('already reached the person')
  })
})

// ============================================================ 4. the path cannot be forged

describe('the path a question took', () => {
  it('is not written under somebody else\'s name', async () => {
    const id = await asks(asAgent('builder-pa'), 'the tool tip drifts after an hour')
    const no = await patch(asAgent('builder-pb'), id, {
      dataPatch: { [CONFIRMED_BY]: [{ who: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-06 20:00:00' }] },
    })
    expect(no.code).toBe(403)
    expect(no.said).toContain('under your own name')
    expect((await stored(id))[CONFIRMED_BY]).toBeUndefined()
  })

  it('is not written by an agent it is not with, even under its own name', async () => {
    const id = await asks(asAgent('builder-pa'), 'the arm parks in the wrong pose')
    const no = await patch(asAgent('builder-pb'), id, {
      dataPatch: { [CONFIRMED_BY]: [{ who: { kind: 'agent', id: 'builder-pb' }, at: '2026-09-06 20:00:00' }] },
    })
    expect(no.code).toBe(403)
    expect(no.said).toContain('passed on by whoever it is with')
  })

  it('is only ever added to, one entry at a time', async () => {
    const id = await asks(asAgent('builder-pb'), 'the bag tears on the third fold')
    expect((await passItOn(asAgent('sup-one'), id)).code).toBe(201)

    // REMOVING one is refused.
    const removing = await patch(asAgent(THE_TEST_OFFICES_SECRETARY.handle), id, { dataPatch: { [CONFIRMED_BY]: [] } })
    expect(removing.code).toBe(403)
    expect(removing.said).toContain('only ever added to')

    // REWRITING one is refused: same length, different name.
    const rewriting = await patch(asAgent(THE_TEST_OFFICES_SECRETARY.handle), id, {
      dataPatch: { [CONFIRMED_BY]: [{ who: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-06 20:00:00' }] },
    })
    expect(rewriting.code).toBe(403)

    // AND TWO AT ONCE is refused, which is how one caller would climb the whole chain in one write.
    const both = await patch(asAgent(THE_TEST_OFFICES_SECRETARY.handle), id, {
      dataPatch: {
        [CONFIRMED_BY]: [
          { who: { kind: 'agent', id: 'sup-one' }, at: '2026-09-06 20:00:00' },
          { who: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-06 20:00:01' },
          { who: { kind: 'agent', id: 'builder-pb' }, at: '2026-09-06 20:00:02' },
        ],
      },
    })
    expect(both.code).toBe(403)

    const held = (await stored(id))[CONFIRMED_BY] as { who: { id: string } }[]
    expect(held.map((one) => one.who.id)).toEqual([idOf('sup-one')])
  })

  it('cannot arrive on a record that is being filed', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WORKSPACE, ...asAgent('builder-pa'), 'content-type': 'application/json' },
      payload: {
        kind: 'problem',
        title: 'filed with a path already on it',
        data: {
          whose_move: 'person',
          symptom: 'none',
          [CONFIRMED_BY]: [{ who: { kind: 'agent', id: 'builder-pa' }, at: '2026-09-06 20:00:00' }],
        },
      },
    })
    expect(reply.statusCode).toBe(403)
    expect(reply.body).toContain('asks the person nothing')
  })
})

// ============================================================ 5. a chain that cannot be followed

describe('a question from an agent nobody recorded a starter for', () => {
  it('reaches the owner as it always did, and the reading says why', async () => {
    // A ROW WRITTEN THE WAY THE OWNER'S OLD ONES WERE: an agent record with no starter at all.
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'agent',
      title: 'Permissions drafter',
      data: { handle: 'drafter-old', runtime: 'claude-code', state: 'active' },
      actor: { type: 'human', id: THE_PERSON },
    })
    const id = await asks(asAgent('drafter-old'), 'the corpus dates are fixed')
    expect((await theOwnersList()).ids).toContain(id)

    const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: WORKSPACE })
    const said = reply.json() as { whereTheQuestionIs?: { with: unknown; says: string } }
    expect(said.whereTheQuestionIs?.with).toBeNull()
    expect(said.whereTheQuestionIs?.says).toContain('drafter-old')
  })

  it('reaches the owner when the writer is in no registry at all, and says that instead', async () => {
    const id = await asks(asAgent('claude-code/builder-dh'), 'an unregistered writer asked something')
    expect((await theOwnersList()).ids).toContain(id)
    const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: WORKSPACE })
    const said = reply.json() as { whereTheQuestionIs?: { says: string } }
    expect(said.whereTheQuestionIs?.says).toContain('is registered as the agent')
  })
})
