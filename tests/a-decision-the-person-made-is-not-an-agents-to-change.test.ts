// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION THE PERSON MADE IS NOT AN AGENT'S TO CHANGE. Criterion P76.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE AND THE DESIGN
 * ---------------------------------------------------------------------------------------
 *
 * Whoever made the decision may change it, and the administrator may
 * too. The decision kind's fields are split into the decision itself (the option taken, the words
 * why, the title, the words added after the press) and the notes around it (when to revisit, what
 * was rejected, links, provenance). A decision the person made is therefore closed to every agent;
 * the notes are open to any agent, and the change log says who and when.
 *
 * The design is `design/permissions/DESIGN-2026-09-08-perm-5.md`, version 2 of 15:15 on 8 September
 * 2026, under F7: the guard reads `recorded_by` (who wrote the decision down) and not `decided_by`
 * (who is named as decider), so an agent cannot write itself the right.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT TURNS THIS RED
 * ---------------------------------------------------------------------------------------
 *
 * Drop the maker check from `assertMayWrite` and the first case below goes red: an agent changes the
 * `because` of a decision the person made, and the write is allowed.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

let t: TestDb
let app: FastifyInstance
let decision: string

const THE_OWNER = 'the owner'

async function recordOf(id: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

const dataOf = async (id: string): Promise<Record<string, unknown>> => {
  const held = (await recordOf(id))['record'] as Record<string, unknown>
  return (held['data'] ?? {}) as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  // A LIVE RECORD CARRYING THE PERSON'S WORDS, so that if the maker check were dropped the rest of
  // the authority rule would still be satisfied and the write would go through. Without it the
  // mutation would be caught by a missing field rather than by the maker check this file is for.
  const words = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'note', title: 'A note about the controller', data: { body: 'stay on position control' } },
  })
  expect(words.statusCode, words.body).toBe(201)
  const reference = ((words.json() as { record: { id: string } }).record).id

  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: {
      kind: 'decision',
      title: 'Stay on the measured controller',
      data: { ...governsTheWholeProject(), replaces: [],
        option_taken: 'a — position control',
        because: 'it is the only one that was measured',
        decided_by: THE_OWNER,
        authority: 'the owner said so',
        authority_reference: reference,
      },
    },
  })
  expect(made.statusCode, made.body).toBe(201)
  decision = ((made.json() as { record: { id: string } }).record).id
})

describe('the decision itself is closed to an agent', () => {
  it('refuses an agent that changes the words why, and writes nothing', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${decision}`,
      headers: asAgent('claude-code/a-worker'),
      payload: { dataPatch: { because: 'an agent rewrote the reason' } },
    })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(403)
    expect(reply.body, 'the refusal names the two halves').toContain('THE DECISION AND THE NOTES AROUND IT')
    expect(reply.body, 'the refusal names who may change it').toContain('only whoever made it, or the person')
    expect((await dataOf(decision))['because'], 'nothing was written').toBe('it is the only one that was measured')
  })

  it('refuses an agent that changes the option taken', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${decision}`,
      headers: asAgent('claude-code/a-worker'),
      payload: { dataPatch: { option_taken: 'b — force control' } },
    })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(403)
    expect((await dataOf(decision))['option_taken']).toBe('a — position control')
  })

  it('refuses an agent that renames the decision, because the title is part of it', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${decision}`,
      headers: asAgent('claude-code/a-worker'),
      payload: { title: 'A name an agent chose' },
    })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(403)
    const held = (await recordOf(decision))['record'] as Record<string, unknown>
    expect(held['title']).toBe('Stay on the measured controller')
  })

  it('refuses an agent that changes the words added after the press, whatever it cites', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${decision}`,
      headers: asAgent('claude-code/a-worker'),
      payload: {
        dataPatch: { words_since: [{ at: '2026-09-13 10:00', words: 'an agent wrote this' }] },
      },
    })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(403)
    expect((await dataOf(decision))['words_since'], 'nothing was written').toBeUndefined()
  })
})

describe('the person can still change their own decision', () => {
  it('lets the person change the words why', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${decision}`,
      headers: AS_THE_PERSON,
      payload: { dataPatch: { because: 'I changed my mind about the reason' } },
    })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    expect((await dataOf(decision))['because']).toBe('I changed my mind about the reason')
  })
})
