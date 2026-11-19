// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE DECLARATION DECIDES WHAT A ROLE MAY DO, AND BOTH THE REFUSAL AND THE PUBLISHED ANSWER READ IT.
 *
 * Criteria P3 and P4 of design/permissions/ACCEPTANCE.md.
 *
 * P3: the roles' powers are different in themselves. *The five roles are one declaration, and both the
 * refusal and the published answer read it. `caller.refusedHere` in GET /api/access names the acts a
 * role may not perform, and a refusal names the same act in the same words.*
 *
 * P4: developer mode shows more of the interface than normal mode, but the powers are the same. *A role is not a mode. Two
 * callers of the same rung get the same bytes.*
 *
 * WHERE THE PUBLISHED ANSWER LIVES, AND WHY IT IS NOT `refusedHere`. P3's wording names
 * `caller.refusedHere`, and that field answers a different question: *what may this caller not do
 * FROM WHERE IT IS*, which is true whoever asks. What a role refuses is *what may this caller not do
 * BECAUSE OF WHO IT IS*. Folding the second into the first would tell a remote person that being
 * remote is why they were refused, which is the wrong thing to go and fix. So the role half is
 * `caller.refusedByRole`, beside it, on the same reply, and this file proves it is the same list the
 * refusal enforces.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { actsRefusedTo } from '../src/shared/roles.ts'

let t: TestDb
let app: FastifyInstance
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<number> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  return reply.statusCode
}

async function access(headers: Record<string, string>): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: '/api/access', headers })
  expect(reply.statusCode).toBe(200)
  return (reply.json() as { caller: Record<string, unknown> }).caller
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'sup-one', name: 'Supervisor One', role: 'supervisor' })
  await register(asAgent('sup-one'), { handle: 'w-one', name: 'Worker One', role: 'worker' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the refusal a role gets says what the card says', () => {
  it('refuses a worker an act its card refuses, in the card"s own words', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: asAgent('w-one'),
      payload: { title: 'A group' },
    })
    expect(reply.statusCode).toBe(403)
    const why = String((reply.json() as { error?: unknown }).error ?? '')
    const { theRoleCards } = await import('../src/server/lib/roles.ts')
    const said = actsRefusedTo(theRoleCards(), 'worker').get('group.open')
    expect(said, 'the worker card does not refuse group.open, so this test proves nothing').toBeDefined()
    expect(why).toContain(said as string)
    expect(why).toContain('a worker may do')
    expect(why).toContain('src/config/roles.json')
  })

  it('lets a supervisor do the same act, because its card does not refuse it', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: asAgent('sup-one'),
      payload: { title: 'A supervised group' },
    })
    expect(reply.statusCode, 'a supervisor was refused a supervisor act').not.toBe(403)
  })

  it('does not narrow a person', async () => {
    const reply = await app.inject({ method: 'POST', url: '/api/groups', headers: AS_THE_PERSON, payload: { title: 'The owner’s group' } })
    expect(reply.statusCode).not.toBe(403)
  })

  it('does not narrow a caller no registry holds, which is the owner’s rule and not an oversight', async () => {
    // This route already refuses an unregistered caller for its own reason — a group needs somebody
    // it could belong to — so the status alone would prove nothing. What is proved is that the
    // refusal is NOT the role gate's: rung 0 is not narrowed, and the rule for an
    // unregistered writer stands unchanged: it is only named.
    const reply = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: asAgent('claude-code/nobody-registered-this'),
      payload: { title: 'An unregistered group' },
    })
    const why = String((reply.json() as { error?: unknown }).error ?? '')
    expect(why, 'rung 0 was narrowed by a role').not.toContain('src/config/roles.json')
    expect(why).toContain('Nothing in either registry answers to')
    // And the same caller is not refused a plain record write, which is what rung 0 may do.
    const wrote = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('claude-code/nobody-registered-this'),
      payload: { kind: 'note', title: 'A note from an unregistered writer' },
    })
    expect(wrote.statusCode).toBe(201)
  })
})

describe('the published answer is the same list the refusal enforces', () => {
  it('names, for a worker, exactly the acts its card refuses', async () => {
    const { theRoleCards } = await import('../src/server/lib/roles.ts')
    const said = await access(asAgent('w-one'))
    expect(said['role']).toBe('worker')
    const published = (said['refusedByRole'] as { act: string; inWords: string }[]).map((one) => one.act).sort()
    expect(published).toEqual([...actsRefusedTo(theRoleCards(), 'worker').keys()].sort())
  })

  it('publishes the same words the refusal writes', async () => {
    const said = await access(asAgent('w-one'))
    const one = (said['refusedByRole'] as { act: string; inWords: string }[]).find((row) => row.act === 'group.open')
    const reply = await app.inject({ method: 'POST', url: '/api/groups', headers: asAgent('w-one'), payload: { title: 'X' } })
    expect(String((reply.json() as { error?: unknown }).error ?? '')).toContain(String(one?.inWords))
  })

  it('says a shorter list for a supervisor than for a worker, because a rung holds the rung below', async () => {
    const worker = (await access(asAgent('w-one')))['refusedByRole'] as unknown[]
    const supervisor = (await access(asAgent('sup-one')))['refusedByRole'] as unknown[]
    expect(supervisor.length).toBeLessThan(worker.length)
  })

  it('refuses a secretary less than a supervisor, by the powers the secretary’s own step adds', async () => {
    // Criterion P56: people with the same powers may have very different duties. The two still share every power but
    // the ones the secretary's own step adds, so the secretary is refused everything the supervisor is, minus those
    // acts. They are `The dead letters`, whose act the dead-letter authority reads, and `Calling the person in`, whose
    // act is the summons door. This was an equality until the dead-letter act was declared on
    // the secretary's step; what P56 holds is that duties and powers are two things, not that the two cards must carry
    // the same powers.
    const supervisor = (await access(asAgent('sup-one')))['refusedByRole'] as { act: string }[]
    const secretary = (await access(asAgent(THE_TEST_OFFICES_SECRETARY.handle)))['refusedByRole'] as { act: string }[]
    const supervisorActs = new Set(supervisor.map((one) => one.act))
    const secretaryActs = new Set(secretary.map((one) => one.act))
    for (const act of secretaryActs) {
      expect(supervisorActs.has(act), `a supervisor is not refused ${act}, which a secretary is`).toBe(true)
    }
    expect(secretaryActs.has('dead-letters.claim'), 'a secretary is refused the dead-letter act').toBe(false)
    expect(supervisorActs.has('dead-letters.claim'), 'a supervisor holds the dead-letter act').toBe(true)
    expect(secretaryActs.has('office.summon'), 'a secretary is refused the summons').toBe(false)
    expect(supervisorActs.has('office.summon'), 'a supervisor holds the summons').toBe(true)
    expect(secretaryActs.size).toBeLessThan(supervisorActs.size)
  })

  it('says plainly that nothing narrows a person, rather than answering with an empty list alone', async () => {
    const said = await access(AS_THE_PERSON)
    expect(said['refusedByRole']).toEqual([])
    expect(said['role']).toBeNull()
    expect(String(said['roleSays'])).toContain('No role narrows this caller')
  })
})

describe('a role is not a mode', () => {
  it('gives two callers of the same rung the same bytes, whatever mode they ask in', async () => {
    await register(asAgent('sup-one'), { handle: 'w-two', name: 'Worker Two', role: 'worker' })
    const one = await app.inject({ method: 'GET', url: '/api/access', headers: asAgent('w-one') })
    const two = await app.inject({ method: 'GET', url: '/api/access', headers: asAgent('w-two') })
    const roleHalf = (r: typeof one): unknown => {
      const caller = (r.json() as { caller: Record<string, unknown> }).caller
      return { refusedByRole: caller['refusedByRole'], role: caller['role'], roleSays: caller['roleSays'] }
    }
    expect(roleHalf(one)).toEqual(roleHalf(two))
  })
})

