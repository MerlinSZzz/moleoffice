// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * M111 — A SECRETARY CLAIMS ONE ADDRESSEE'S DEAD LETTERS, ONCE, AND NOBODY ELSE MAY.
 *
 * Each claims its own: the office broadcasts the dead letters to
 * every secretary, and each claims the ones that are its to handle. Settled by the secretary
 * then: a claim is per ADDRESSEE — the agent the letters were for — not per letter. One addressee has
 * one standing claim, ever; new letters for an addressee already claimed are still that claim's to
 * find, the same way a work claim covers what its claimant does after the claim is filed.
 *
 * WHAT A CLAIM DOES NOT DO. The letters themselves are message_delivery rows and a claim moves
 * none of them: the claim says who has taken the addressee on, and that is the one fact nothing
 * else holds.
 *
 * The sweep that names the addressees is proved in
 * tests/a-wild-message-is-kept-and-broadcast-to-the-secretaries.test.ts; the press that runs it
 * each pass, in tests/the-worker-presses-the-dead-letter-sweep-each-pass.test.ts.
 *
 * Mutation, named, after a control run: in src/server/lib/deadletters.ts,
 * `claimDeadLetters`, delete the refusal
 * `if (row.claimedAt !== null) { throw ... }` — a second claim overwrites the first — and the
 * second-claim case below goes red. A second mutation proved the other half of the same door:
 * deleting the secretary check lets the worker and the person claim, and those two cases go red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
// The registry ids the registrations answered. A new agent's id is not its handle, and a claim and
// a letter store the id.
let argusId: string
let wOneId: string

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function get(path: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers })
  return reply.json() as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const idOf = (said: Record<string, unknown>): string => (said as { agent: { id: string } }).agent.id
  argusId = idOf((await post('/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }, AS_THE_PERSON)).said)
  // a second secretary, so the claim is not refused for there being nobody but the claimant
  await post('/api/agents/started', { handle: 'fern', name: 'Fern', role: 'secretary' }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
  wOneId = idOf((await post('/api/agents/started', { handle: 'w-one', name: 'Worker One', role: 'worker' }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))).said)
  await post('/api/agents/started', { handle: 'w-two', name: 'Worker Two', role: 'worker' }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
  for (let n = 1; n <= 21; n++) {
    const filed = await post(
      '/api/records',
      { kind: 'message', title: `x${String(n)}`, data: { body: `x${String(n)}`, to: [{ kind: 'agent', id: 'w-one' }] } },
      AS_THE_PERSON,
    )
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(filed.code).toBe(409)
  }
  const swept = await post('/api/dead-letters/sweep', {}, AS_THE_PERSON)
  expect(swept.code, JSON.stringify(swept.said).slice(0, 200)).toBe(200)
  expect((swept.said as { groupId: string | null }).groupId).not.toBeNull()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a secretary claims one addressee, once', () => {
  it(`${THE_TEST_OFFICES_SECRETARY.handle} claims the dead letters for w-one, and the claim names her and her words`, async () => {
    const { code, said } = await post('/api/dead-letters/claims', { agentId: 'w-one', because: 'These are the workers I started, so they are mine to chase.' }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    expect(code, JSON.stringify(said).slice(0, 300)).toBe(200)
    const claim = (said as { claim: { agentId: string; claimedBy: { kind: string; id: string }; claimedAt: string; claimedBecause: string } }).claim
    expect(claim.agentId).toBe(wOneId)
    expect(claim.claimedBy).toEqual({ kind: 'agent', id: argusId })
    expect(claim.claimedAt).toBeTruthy()
    expect(claim.claimedBecause).toContain('mine to chase')
  })

  it('a claim is once: a second claim is refused, naming who claimed it and when', async () => {
    const { code, said } = await post('/api/dead-letters/claims', { agentId: 'w-one', because: 'Mine now.' }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    expect(code).toBe(409)
    const why = String(said['error'])
    expect(why).toContain('already claimed')
    expect(why).toContain(`"${THE_TEST_OFFICES_SECRETARY.handle}"`)
  })

  it('the claim is per addressee: w-two was never named, and claiming it is refused by name', async () => {
    const { code, said } = await post('/api/dead-letters/claims', { agentId: 'w-two', because: '' }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    expect(code).toBe(404)
    expect(String(said['error'])).toContain('w-two')
    expect(String(said['error'])).toContain('not been named in a broadcast')
  })

  it('the letters themselves are not moved by a claim', async () => {
    const listed = (await get('/api/dead-letters', AS_THE_PERSON)) as { letters: { messageId: string; to: { id: string } }[] }
    const wOneLetters = listed.letters.filter((one) => one.to.id === wOneId)
    expect(wOneLetters).toHaveLength(21)
    const message = await get(`/api/messages/${String(wOneLetters[0]?.messageId)}`, AS_THE_PERSON) as {
      message?: { deliveries?: { mark: string }[] }
    }
    expect((message.message?.deliveries ?? []).every((one) => one.mark === 'queued')).toBe(true)
  })
})

describe('only a registered, un-retired secretary may claim', () => {
  it('a plain worker is refused, with the owner’s words saying who claims', async () => {
    const { code, said } = await post('/api/dead-letters/claims', { agentId: 'w-one', because: '' }, asAgent('w-two'))
    expect(code).toBe(403)
    expect(String(said['error'])).toContain('secretary')
    expect(String(said['error'])).toContain('w-two')
  })

  it('the person is refused too: the broadcast is to secretaries and they claim', async () => {
    const { code, said } = await post('/api/dead-letters/claims', { agentId: 'w-one', because: 'Mine, then.' }, AS_THE_PERSON)
    expect(code).toBe(403)
    expect(String(said['error'])).toContain('secretary')
  })

  it('an addressee nobody named is refused by name', async () => {
    const { code, said } = await post('/api/dead-letters/claims', { agentId: 'nobody-at-all', because: '' }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    expect(code).toBe(404)
  })
})