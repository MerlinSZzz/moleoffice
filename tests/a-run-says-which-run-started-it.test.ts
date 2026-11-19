// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN SAYS WHICH RUN STARTED IT.
 *
 * Criterion P11 of design/permissions/ACCEPTANCE.md, on the owner’s (c). *`parentAttachment` is written for
 * every run a supervisor or the worker starts. Measured today: 0 of 904.*
 *
 * WHY NOTHING EVER WROTE ONE. The `session` kind has carried `parentAttachment` since August and
 * nothing knew the answer: no registry recorded who started whom. Now the registration route does,
 * and the run doing the registering writes itself down at the only moment anybody knows.
 *
 * IT IS WRITTEN ONCE AND SAID OUT LOUD. Only when the caller sent no parent of its own, only for the
 * agent's FIRST run, and the reply names the field, the value and the reason. A second run of the
 * same agent gets nothing, because an agent has many runs and only the first was started by the run
 * that registered it — filling the rest in would be a guess wearing a fact's clothes.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string, session?: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

/** A session record filed by whoever the headers say, as any run files its own. */
async function fileARun(
  headers: Record<string, string>,
  title: string,
  data: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'session', title, data: { state: 'running', ...data } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json() as Record<string, unknown>
}

let argusRun: string

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' },
  })
  // The run the secretary is doing this work in. It files its own session record, like any run.
  argusRun = String(((await fileARun(asAgent(THE_TEST_OFFICES_SECRETARY.handle), `The run of ${THE_TEST_OFFICES_SECRETARY.name}`))['record'] as { id: string }).id)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the registration records the run that did it', () => {
  it('writes the caller"s session on the registry row', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle, argusRun),
      payload: { handle: 'builder-pa', name: 'Builder PA', role: 'worker' },
    })
    expect(reply.statusCode).toBe(201)
    const row = t.client.sqlite.prepare("SELECT * FROM agents WHERE handle = 'builder-pa'").get() as Record<string, unknown>
    expect(row['started_by_run']).toBe(argusRun)
  })

  it('records nothing when the caller sent no session, and says nothing knows', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { handle: 'builder-nr', name: 'Builder NR', role: 'worker' },
    })
    const said = reply.json() as { whatToGiveIt: Record<string, unknown> }
    expect(said.whatToGiveIt['startedByRun']).toBeNull()
    const row = t.client.sqlite.prepare("SELECT * FROM agents WHERE handle = 'builder-nr'").get() as Record<string, unknown>
    expect(row['started_by_run']).toBeNull()
  })
})

describe('a person mends a chain of starters that reaches nobody', () => {
  /**
   * Problem `MAZyrG2KH_jo`. An agent registered before migration 0135 has no starter, and the
   * registration route refuses to file anybody under it: a chain that reaches nobody has nobody
   * answering for the agents on it. Its refusal names the way out and there was no door.
   */
  it('refuses a registration under an agent nobody is down as having started', async () => {
    // A registry row the way one written before the starter column looks: no starter at all.
    await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      // A SUPERVISOR, because a worker may not make a worker: what is being measured here is the
      // chain of starters and not the ladder, so the ladder has to be satisfied for the refusal
      // under test to be the only one in the way.
      payload: {
        kind: 'agent',
        title: 'Older Than The Column',
        data: { handle: 'older-than-the-column', state: 'active', role: 'supervisor' },
      },
    })
    const under = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: asAgent('older-than-the-column'),
      payload: { handle: 'a-builder-under-it', name: 'A Builder Under It', role: 'worker' },
    })
    expect(under.statusCode).toBe(403)
    expect(under.body).toContain('reaches nobody')
  })

  it('refuses an agent saying it started one, because it has nobody\'s agreement to give', async () => {
    const said = await app.inject({
      method: 'PATCH',
      url: '/api/participants/agent/older-than-the-column',
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { startedBy: 'me' },
    })
    expect(said.statusCode).toBe(403)
    expect(said.body).toContain('Only a person')
  })

  it('lets a person say they started it, and then the registration goes through and the chain reaches them', async () => {
    const said = await app.inject({
      method: 'PATCH',
      url: '/api/participants/agent/older-than-the-column',
      headers: AS_THE_PERSON,
      payload: { startedBy: 'me' },
    })
    expect(said.statusCode, said.body).toBe(200)
    const row = t.client.sqlite
      .prepare("SELECT started_by_kind, started_by_id FROM agents WHERE handle = 'older-than-the-column'")
      .get() as Record<string, unknown>
    expect(row['started_by_kind']).toBe('person')
    expect(row['started_by_id']).toBe(THE_PERSON)

    const under = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: asAgent('older-than-the-column'),
      payload: { handle: 'a-builder-under-it', name: 'A Builder Under It', role: 'worker' },
    })
    expect(under.statusCode, under.body).toBe(201)
    // AND THE CHAIN REACHES THE PERSON, which is the whole point of mending it.
    const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON }).then((r) => r.json())) as {
      agents?: { handle: string; startedBy: { kind: string; id: string } | null }[]
    }
    const builder = (listed.agents ?? []).find((one) => one.handle === 'a-builder-under-it')
    // The starter is stored by its registry id, which is not its handle.
    const olderId = (
      t.client.sqlite.prepare("SELECT id FROM agents WHERE handle = 'older-than-the-column'").get() as { id: string }
    ).id
    expect(builder?.startedBy).toEqual({ kind: 'agent', id: olderId })
    const mended = (listed.agents ?? []).find((one) => one.handle === 'older-than-the-column')
    expect(mended?.startedBy).toEqual({ kind: 'person', id: THE_PERSON })
  })

  it('refuses to move an agent that already has a starter to somebody else', async () => {
    const again = await app.inject({
      method: 'PATCH',
      url: '/api/participants/agent/older-than-the-column',
      headers: AS_THE_PERSON,
      payload: { startedBy: 'me' },
    })
    expect(again.statusCode).toBe(409)
    const { itAlreadyHasAStarter } = await import('../src/server/lib/participants.ts')
    expect(again.body).toContain(itAlreadyHasAStarter('Older Than The Column', { kind: 'person', id: THE_PERSON }))
  })
})

describe('the first run of that agent says which run started it', () => {
  it('writes parentAttachment, and says in the reply that Mole Office wrote it and why', async () => {
    const said = await fileARun(asAgent('builder-pa'), 'The first run of Builder PA', { servingAgent: 'builder-pa' })
    const record = said['record'] as { id: string; data: Record<string, unknown> }
    expect(record.data['parentAttachment']).toBe(argusRun)
    const wrote = said['moleOfficeWrote'] as Record<string, unknown>
    expect(wrote['field']).toBe('parentAttachment')
    expect(wrote['value']).toBe(argusRun)
    expect(String(wrote['because'])).toContain(`The run of ${THE_TEST_OFFICES_SECRETARY.name}`)
    expect(String(wrote['because'])).toContain('first run')
  })

  it('leaves a second run of the same agent alone, rather than guessing', async () => {
    const said = await fileARun(asAgent('builder-pa'), 'The second run of Builder PA', { servingAgent: 'builder-pa' })
    const record = said['record'] as { id: string; data: Record<string, unknown> }
    expect(record.data['parentAttachment']).toBeUndefined()
    expect(said['moleOfficeWrote']).toBeUndefined()
  })

  it('believes a caller that named a parent itself, and says nothing', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle, argusRun),
      payload: { handle: 'builder-own', name: 'Builder Own', role: 'worker' },
    })
    const mine = String(((await fileARun(AS_THE_PERSON, 'Some other run'))['record'] as { id: string }).id)
    const said = await fileARun(asAgent('builder-own'), 'A run that named its own parent', {
      servingAgent: 'builder-own',
      parentAttachment: mine,
    })
    const record = said['record'] as { id: string; data: Record<string, unknown> }
    expect(record.data['parentAttachment']).toBe(mine)
    expect(said['moleOfficeWrote']).toBeUndefined()
  })

  it('writes nothing for an agent whose registration recorded no run', async () => {
    const said = await fileARun(asAgent('builder-nr'), 'The first run of Builder NR', { servingAgent: 'builder-nr' })
    const record = said['record'] as { id: string; data: Record<string, unknown> }
    expect(record.data['parentAttachment']).toBeUndefined()
    expect(said['moleOfficeWrote']).toBeUndefined()
  })

  it('writes nothing for a caller no registry holds', async () => {
    const said = await fileARun(asAgent('claude-code/nobody'), 'A run of an unregistered writer')
    const record = said['record'] as { id: string; data: Record<string, unknown> }
    expect(record.data['parentAttachment']).toBeUndefined()
  })
})
