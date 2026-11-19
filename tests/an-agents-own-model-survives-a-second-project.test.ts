// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S OWN MODEL IS STILL ITS OWN AFTER IT IS REGISTERED IN A SECOND PROJECT. Problem BfidkGT3LOzh.
 *
 * The model was read from the agent's newest agent record in any project. Registering the agent in a second project
 * writes a newer record there with no model, so the model set on its profile stopped counting, in every project, and
 * the run-models door answered from the Casting table or .env with nothing said. The model is now read from the newest
 * live record that names one (`theModelOnTheAgentRecord` in src/server/lib/participants.ts).
 *
 * WHAT THIS FILE PROVES, against a real server with a database of its own:
 *   1. a model set on the profile is still the agent's own, and still what a builder run gets, after the agent is
 *      registered in a second project;
 *   2. a model set after that is the one read, and clearing it clears it everywhere, so no older project's model
 *      comes back as the agent's own.
 *
 * Everybody and everything here is made up.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { AnAgentsRunModel, TheModelARunGets } from '../src/shared/run-models.ts'

const PERSON_IN = (workspace: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': workspace,
})
const PERSON = PERSON_IN('default')

let t: TestDb
let app: FastifyInstance

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}

async function setAgent(agent: string, model: string | null): Promise<AnAgentsRunModel> {
  const reply = await call('POST', `/api/office/run-models/agent/${agent}`, PERSON, { model, variant: null })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as AnAgentsRunModel
}

async function ownModel(agent: string): Promise<AnAgentsRunModel> {
  const reply = await call('GET', `/api/office/run-models/agent/${agent}`, PERSON)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as AnAgentsRunModel
}

async function forABuilder(agent: string): Promise<TheModelARunGets> {
  const reply = await call('GET', `/api/office/run-models/for/${agent}?place=builder`, PERSON)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as TheModelARunGets
}

async function registerIn(workspace: string, handle: string): Promise<void> {
  const reply = await call('POST', '/api/agents/started', PERSON_IN(workspace), { handle, name: 'Morgan Vale', role: 'worker', runtime: 'claude-code', workArea: ['src'] })
  expect(reply.statusCode, reply.body).toBe(201)
}

function agentRecordsOf(handle: string): number {
  const row = t.client.sqlite
    .prepare('SELECT COUNT(*) AS n FROM agent_records m JOIN agents a ON a.id = m.agent_id WHERE a.handle = ? AND a.retired = 0')
    .get(handle) as { n: number }
  return row.n
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await call('POST', '/api/workspaces', PERSON, { id: 'kiln-two', title: 'Kiln two' })
  expect(made.statusCode, made.body).toBeLessThan(300)
}, 90_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("an agent's own model, across two projects", () => {
  it('is still its own, and still what a builder run gets, after a second registration', async () => {
    await registerIn('default', 'morgan-vale')
    await setAgent('morgan-vale', 'claude-glaze-1')
    expect((await forABuilder('morgan-vale')).from).toBe('the agent')

    await registerIn('kiln-two', 'morgan-vale')
    // THE SECOND REGISTRATION WROTE A SECOND, NEWER RECORD, which is the case the problem is about.
    expect(agentRecordsOf('morgan-vale')).toBe(2)

    expect((await ownModel('morgan-vale')).model).toBe('claude-glaze-1')
    const builder = await forABuilder('morgan-vale')
    expect(builder.from).toBe('the agent')
    expect(builder.model).toBe('claude-glaze-1')
  })

  it('reads a model set later, and a clear clears it in every project', async () => {
    await setAgent('morgan-vale', 'claude-glaze-2')
    expect((await ownModel('morgan-vale')).model).toBe('claude-glaze-2')
    expect((await forABuilder('morgan-vale')).model).toBe('claude-glaze-2')

    await setAgent('morgan-vale', null)
    expect((await ownModel('morgan-vale')).model).toBeNull()
    expect((await forABuilder('morgan-vale')).from).not.toBe('the agent')
  })
})
