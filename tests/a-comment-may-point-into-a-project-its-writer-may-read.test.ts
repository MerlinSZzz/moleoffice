// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE MAY POINT AT A RECORD IN ANOTHER PROJECT, WHEN ITS WRITER MAY READ THAT PROJECT. Problem 8zw4lqj3ZNm_.
 *
 * Wave 13n's round 26 kept every message in the message centre, which is no project, and let a
 * comment point at a message from any project's page (problem rJzSELmOPUas). A comment on any other record still had to
 * be in the project of the page it was written on: "a conversation is about one project's work". That stopped being so
 * when messages left the projects. A comment is now a message kept in the message centre, and it is in the view of the
 * project whose record it points at (`aCommentOnARecordOf` in src/server/lib/message-centre.ts), so that project's pages
 * and reviews find it.
 *
 * So the check asks the one reader rule, `theProjectsAReaderMayRead` in src/server/lib/across-projects.ts, and looks the
 * record up in its own project. What this file holds:
 *
 *   1. The person writes, on a page of one project, a message pointing at a record of another: it is stored.
 *   2. An agent does the same: it is stored too, because no rule keeps a reader out of a project today.
 *   3. A quote of a record in another project is stored the same way.
 *   4. An id the other project does not hold is still refused, and the refusal names the id: the record is looked up,
 *      in its own project, and not waved through.
 *   5. A project nobody has is refused.
 *
 * MUTATION, red: make `theProjectsAReaderMayRead` answer no project. Cases 1, 2 and 3 are refused again.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const THERE = 'orchard'

const AS_THE_PERSON = {
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'pruner-q' }

let t: TestDb
let app: FastifyInstance
/** A note filed in the other project. */
let noteThere = ''

async function post(headers: Record<string, string>, url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers })
  return { status: res.statusCode, body: res.json() }
}

function aMessage(data: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: 'message',
    title: 'About the pruning log',
    data: { body: 'Look at this one.', to: [{ kind: 'person', id: THE_PERSON }], ...data },
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await post(AS_THE_PERSON, '/api/workspaces', { id: THERE, title: 'Orchard' })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const agent = await post(AS_THE_PERSON, '/api/records', {
    kind: 'agent',
    title: 'Pruner Q',
    data: { handle: 'pruner-q', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, JSON.stringify(agent.body)).toBe(201)
  const note = await post({ ...AS_THE_PERSON, 'x-mole-office-workspace': THERE }, '/api/records', {
    kind: 'note',
    title: 'The pruning log',
    data: { body: 'Cut back the pear trees.' },
  })
  expect(note.status, JSON.stringify(note.body)).toBe(201)
  noteThere = note.body.record.id as string
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a message pointing at a record in another project', () => {
  it('is stored when the person writes it on a page of this project', async () => {
    const res = await post(AS_THE_PERSON, '/api/records', aMessage({
      target: { target: { kind: 'record', recordId: noteThere, workspaceId: THERE } },
    }))
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(res.body.record.data.target.target.recordId).toBe(noteThere)
  })

  it('is stored when an agent writes it, because no rule keeps a reader out of a project today', async () => {
    const res = await post(AS_AN_AGENT, '/api/records', aMessage({
      target: { target: { kind: 'record', recordId: noteThere, workspaceId: THERE } },
    }))
    expect(res.status, JSON.stringify(res.body)).toBe(201)
  })

  it('is stored as a quote too', async () => {
    const res = await post(AS_THE_PERSON, '/api/records', aMessage({
      quotes: [{ target: { kind: 'record', recordId: noteThere, workspaceId: THERE } }],
    }))
    expect(res.status, JSON.stringify(res.body)).toBe(201)
  })

  it('is still refused, naming the id, when the other project holds no such record', async () => {
    const res = await post(AS_THE_PERSON, '/api/records', aMessage({
      target: { target: { kind: 'record', recordId: 'no-such-note-7', workspaceId: THERE } },
    }))
    expect(res.status).toBe(404)
    expect(JSON.stringify(res.body)).toContain('no-such-note-7')
  })

  it('is refused when it names a project nobody has', async () => {
    const res = await post(AS_THE_PERSON, '/api/records', aMessage({
      target: { target: { kind: 'record', recordId: noteThere, workspaceId: 'no-such-project' } },
    }))
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(res.body)).toContain('no-such-project')
  })
})
