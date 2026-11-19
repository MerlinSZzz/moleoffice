// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A REVIEW'S COMMENT WOULD GO NAMES ONLY THE PROJECTS ITS READER MAY READ.
 *
 * GET /api/reviews/<id>/send gives each comment the agent its address stands for, in `resolvedAgent`, with the
 * projects that agent has a record in. The pane offers to move the agent from one of those projects. A project the
 * reader may not read is not named there, and an address held by a record in such a project names no agent at all.
 *
 * No rule keeps a reader out of a whole project today, so this file makes one up, as
 * tests/a-handbook-in-a-project-the-reader-may-not-read-is-left-out.test.ts does: `theProjectsAReaderMayRead` is mocked
 * to leave the second project out FOR EVERY READER, the person included. Every record here is made up.
 *
 *   1. A comment addressed to the agent's record in the first project: the agent is named, with the first project only.
 *   2. A comment addressed to the agent's record in the second project: no agent is named.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type AcrossProjects = typeof import('../src/server/db/the-projects-a-reader-may-read.ts')

const HERE = 'default'
const THERE = 'orchard'

const AS_THE_PERSON = {
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let agent = ''
let recordHere = ''
let recordThere = ''

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object): Promise<{ status: number; text: string; json: any }> {
  const reply = await app.inject({ method, url, headers: AS_THE_PERSON, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, text: reply.body, json: reply.json() }
}

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await call('POST', '/api/records', { kind, title, data })
  expect(made.status, made.text).toBe(201)
  return String(made.json.record.id)
}

beforeAll(async () => {
  // THE MADE-UP RULE, before `freshDb`, for the reason the handbook test gives.
  vi.doMock('../src/server/db/the-projects-a-reader-may-read.ts', async (importOriginal) => {
    const real = await importOriginal<AcrossProjects>()
    return {
      ...real,
      theProjectsAReaderMayRead: (reader: Parameters<AcrossProjects['theProjectsAReaderMayRead']>[0]) =>
        real.theProjectsAReaderMayRead(reader).filter((project) => project.id !== THERE),
    }
  })
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const workspaces = await import('../src/server/lib/workspaces.ts')
  workspaces.createWorkspace({ id: THERE, title: 'Orchard' })

  // ONE AGENT WITH A RECORD IN EACH PROJECT. It registers in the first; the record in the second is written beside it,
  // as tests/agent-project-move.test.ts writes one.
  const started = await call('POST', '/api/agents/started', { handle: 'made-up-pruner', name: 'made-up-pruner', runtime: 'claude-code' })
  expect(started.status, started.text).toBe(201)
  agent = String(started.json.agent.id)
  recordHere = (t.client.sqlite
    .prepare('SELECT r.id AS id FROM agent_records a JOIN records r ON r.id = a.record_id WHERE a.agent_id = ? AND r.workspace_id = ?')
    .get(agent, HERE) as { id: string }).id
  recordThere = t.api.createRecord({
    kind: 'agent',
    workspaceId: THERE,
    origin: 'fixture',
    actor: { type: 'human', id: THE_PERSON },
    title: 'made-up-pruner in the orchard',
    data: {},
  }).id
  t.client.sqlite.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run(recordThere, agent)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  vi.doUnmock('../src/server/db/the-projects-a-reader-may-read.ts')
})

/** A collected review of one comment, addressed to one agent record, and the plan line for that comment. */
async function theLineFor(agentRecord: string, body: string): Promise<{ resolvedAgent?: { agent: string; projects: string[] } | null }> {
  const gripper = await file('module', 'The gripper', { context: 'x' })
  const started = await call('POST', '/api/reviews', { entry: { target: { kind: 'record', recordId: gripper, workspaceId: HERE } } })
  expect(started.status, started.text).toBe(201)
  const review = String(started.json.review.id)
  const comment = await file('annotation', body.slice(0, 40), { body, context: { target: { kind: 'record', recordId: gripper, workspaceId: HERE } } })
  const chosen = await call('PATCH', `/api/records/${comment}`, { dataPatch: { chosenRecipient: { kind: 'agent', agentId: agentRecord } } })
  expect(chosen.status, chosen.text).toBe(200)
  const collected = await call('POST', `/api/reviews/${review}/finish-collecting`)
  expect(collected.status, collected.text).toBe(200)

  const plan = await call('GET', `/api/reviews/${review}/send`)
  expect(plan.status, plan.text).toBe(200)
  const line = (plan.json.comments as { id: string; resolvedAgent?: { agent: string; projects: string[] } | null }[]).find((one) => one.id === comment)
  expect(line, plan.text).toBeDefined()
  return line!
}

describe('the agent a review comment is addressed to', () => {
  it('1. is named with only the projects the reader may read', async () => {
    const line = await theLineFor(recordHere, 'The first number is wrong.')
    expect(line.resolvedAgent).toEqual({ agent, projects: [HERE] })
  })

  it('2. is not named when its address is a record in a project the reader may not read', async () => {
    const line = await theLineFor(recordThere, 'The second number is wrong as well.')
    expect(line.resolvedAgent).toBeNull()
  })
})
