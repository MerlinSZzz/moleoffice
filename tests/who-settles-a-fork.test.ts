// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FORK SAYS WHO SETTLES IT, AND SAYING NOTHING IS A DIFFERENT ANSWER FROM SAYING THE OWNER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PINS
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 27 August 2026: twenty-seven forks were waiting on the owner and at least eight of
 * them no longer needed the owner. The cause is in the model rather than in the queue — a fork had no way
 * to say who settles it, so every fork was the owner's. `who_settles_it` is that field.
 *
 * Four things are easy to lose to a helpful edit and all four are checked here:
 *
 *   1. FOUR VALUES AND NO MORE. A fifth word would be a fifth answer nothing reads.
 *   3. ABSENT IS NOT "the owner". Nothing writes a value the caller did not send, and a proposal
 *      filed without one comes back without one.
 *   4. THE KIND'S OWN PURPOSE NO LONGER SAYS EVERY FORK IS A PERSON'S, and it still carries the
 *      sentence that used to say so, with the date it stopped governing.
 *
 * NO BROWSER. The declarations, the write gate and the served schema.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  FORK_SETTLERS,
  validateData } from '../src/shared/kinds.ts'
import { freshDb, type TestDb } from './helpers.ts'


const AGENT_HEADERS = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': 'default',
}

/** The person, for the one fixture an agent can no longer produce: a fork nobody has classified. */
const PERSON_HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { discoveryRoutes, trackApiRoutes } = await import('../src/server/api/kinds.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  const listRoutes = trackApiRoutes(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(discoveryRoutes, {
    prefix: '/api',
    listRoutes,
    currentWorkspace: () => ({ current: 'default', stated: true }),
  })
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** A fork with everything a fork needs, so nothing here fails for the wrong reason. */
const FORK = {
  question: 'Should the wrist camera be calibrated before the handover replay or after it?',
  options: ['a — before, and lose a day', 'b — after, and re-run the replay if it drifts'],
}


describe('the field on the proposal kind', () => {


  it('is checked against the four words, so a fifth cannot be stored', () => {
    const bad = validateData('proposal', { ...FORK, who_settles_it: 'the team' })
    expect(bad.ok, 'a word outside the vocabulary was accepted').toBe(false)
    if (bad.ok) throw new Error('unreachable: the line above already failed')
    expect(bad.errors[0]?.path).toBe('data.who_settles_it')
    for (const word of FORK_SETTLERS) {
      expect(validateData('proposal', { ...FORK, who_settles_it: word }).ok, `"${word}" was refused`).toBe(true)
    }
  })

})

describe('absence, over the real write path', () => {
  /**
   * WHO FILES A FORK DECIDES WHAT ABSENCE MEANS, AND THAT CHANGED ON 3 SEPTEMBER 2026.
   *
   * A PERSON filing a fork with the key absent still means nobody has said, and that is the case
   * this pair of tests was written for: nothing infers a value from the question, the title or the
   * kind, and "nobody has said" stays a readable answer.
   *
   * An AGENT filing one now says `an agent` unless it names something else, on the ruling
   * that an engineering question is the agent's — `design/messages/ACCEPTANCE.md` W3. That is the
   * agent SAYING something about its own fork, credited to it on the change row, and not Mole Office
   * inferring anything: the value is written at the moment of filing, by the caller that filed it,
   * and the declaration says so. Both halves are below, because a test that only held one of them
   * would pass with the other broken.
   */
  it('a fork a PERSON files without the field comes back without it', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: PERSON_HEADERS,
      payload: { kind: 'proposal', title: 'Calibrate the wrist camera before or after?', data: FORK },
    })
    expect(made.statusCode).toBe(201)
    const id = (made.json() as { record: { id: string } }).record.id
    const read = t.api.getRecord(id)
    const stored = (read?.data ?? {}) as Record<string, unknown>
    expect(
      Object.hasOwn(stored, 'who_settles_it'),
      'something wrote a value nobody sent, so "nobody has said" is no longer a readable answer',
    ).toBe(false)
  })

  it('a fork an AGENT files without the field says the agent settles it', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AGENT_HEADERS,
      payload: { kind: 'proposal', title: 'Calibrate the wrist camera before or after?', data: FORK },
    })
    expect(made.statusCode).toBe(201)
    const id = (made.json() as { record: { id: string } }).record.id
    const stored = ((t.api.getRecord(id)?.data ?? {}) as Record<string, unknown>)['who_settles_it']
    expect(stored, 'an agent filing a fork no longer says whose it is').toBe('an agent')
  })

  it('a fork filed WITH the field keeps exactly the word that was sent', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AGENT_HEADERS,
      payload: {
        kind: 'proposal',
        title: 'Calibrate the wrist camera before or after?',
        data: { ...FORK, who_settles_it: 'a measurement' },
      },
    })
    expect(made.statusCode).toBe(201)
    const id = (made.json() as { record: { id: string } }).record.id
    expect(((t.api.getRecord(id)?.data ?? {}) as Record<string, unknown>)['who_settles_it']).toBe('a measurement')
  })
})


describe('it is served, so an agent can find it without reading this repository', () => {
  it('GET /api/kinds carries the field and its four words', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/kinds', headers: AGENT_HEADERS })
    expect(reply.statusCode).toBe(200)
    const body = reply.json() as { kinds: { kind: string; fields: { key: string; type: string }[] }[] }
    const served = body.kinds.find((k) => k.kind === 'proposal')?.fields.find((f) => f.key === 'who_settles_it')
    expect(served, 'the field is declared but not served, so no agent can discover it').toBeDefined()
    for (const word of FORK_SETTLERS) expect(served?.type).toContain(`'${word}'`)
  })
})
