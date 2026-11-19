// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECT NAMES ITS MASTER PIPELINE, AND ONLY A SECRETARY WITH A REASON OR THE OWNER MAY CHANGE IT. Wave 13u round
 * 216, package BV. The mark is stored in `workspaces.master_pipeline`, one record id per project.
 *
 * WHAT THIS FILE PROVES, in its own empty office:
 *   1. Nobody has marked one: the reading says "unmarked" and no change is recorded, although a live pipeline is
 *      there. A project that is not there is a coded 404.
 *   2. The owner's press marks one with no reason, and the change is kept with who. The same press again writes no
 *      second change.
 *   3. A secretary with its own key is refused without a reason, and marks one with a reason, which the change keeps.
 *   4. Another agent with its own key, and a secretary's name with no key, are refused, and nothing is changed.
 *   5. A record that is not there, one that is not a pipeline and a pipeline of another project are each refused with
 *      a coded 400, and nothing is changed.
 *   6. A marked pipeline that is deleted reads "broken", and the other live pipeline is not read in its place.
 *      Marking none reads "unmarked" again.
 *
 * WHERE THE RULES LIVE: src/server/lib/master-pipeline.ts (the one reading and the writer) and
 * src/server/api/project-board.ts (who may change it, and the change log).
 *
 * MUTATIONS, each after a control run, each file copied first and restored with cp and checked with cmp. The cases
 * run in order on one office, so a case that starts from the mark an earlier case set goes red after it:
 *   1. in the reading, answer the first live pipeline of the project when the column is NULL: cases 1 and 6 go red,
 *      and so does case 2, because the owner's press then leaves the guessed mark as it was and writes no change.
 *   2. in the door, drop the owner's way in: case 2 goes red, and cases 3 to 6 after it.
 *   3. in the door, ask no reason of a secretary: case 3 goes red.
 *   4. in the door, let any agent through as a secretary: case 4 goes red, and cases 5 and 6 after it.
 *   5. in the writer, skip the check of the record: case 5 goes red, and case 6 after it.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const idOf: Record<string, string> = {}
const keyOf: Record<string, string> = {}

async function register(handle: string, role: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role } })
  expect(reply.statusCode, `registering ${handle}: ${reply.body.slice(0, 300)}`).toBe(201)
  const body = reply.json() as { agent: { id: string }; whatToGiveIt?: { key?: string } }
  idOf[handle] = body.agent.id
  keyOf[handle] = String(body.whatToGiveIt?.key ?? '')
  expect(keyOf[handle], `${handle} was given a key`).toMatch(/^[0-9a-f]{64}$/)
}

/** The headers of an agent's request, proved by its own key unless `keyed` is false. */
function asAgent(handle: string, keyed = true): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(keyed ? { 'x-mole-office-key': keyOf[handle]! } : {}),
  }
}

interface Reading {
  project: string
  state: 'marked' | 'unmarked' | 'broken'
  id?: string
  title?: string
  because?: string
  lastChange: { id: string; by: { type: string; id: string }; field: string | null; from: string | null; to: string | null } | null
}

async function reading(project = 'default'): Promise<Reading> {
  const reply = await app.inject({ method: 'GET', url: `/api/projects/${project}/master-pipeline`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  return reply.json() as Reading
}

function mark(headers: Record<string, string>, payload: object, project = 'default') {
  return app.inject({ method: 'PUT', url: `/api/projects/${project}/master-pipeline`, headers, payload })
}

// Made-up records: two pipelines here, one module here, one pipeline in a second project.
let first: string
let second: string
let aModule: string
let elsewhere: string

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'made-up-second', title: 'A made-up second project' })
  const make = (kind: 'pipeline' | 'module', title: string, workspaceId = 'default') =>
    t.api.createRecord({ kind, title, workspaceId, origin: 'fixture', actor: t.api.HUMAN, data: kind === 'pipeline' ? { blockIds: [] } : {} }).id
  first = make('pipeline', 'A made-up master')
  second = make('pipeline', 'A made-up other pipeline')
  aModule = make('module', 'A made-up module')
  elsewhere = make('pipeline', 'A made-up pipeline elsewhere', 'made-up-second')
  await register('clerk', 'secretary')
  await register('mason', 'worker')
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a project names its master pipeline', () => {
  it('1. nobody has marked one, and a project that is not there is a coded 404', async () => {
    const read = await reading()
    expect(read).toMatchObject({ project: 'default', state: 'unmarked', lastChange: null })
    expect(read).not.toHaveProperty('id')
    const missing = await app.inject({ method: 'GET', url: '/api/projects/no-such-project/master-pipeline', headers: AS_THE_PERSON })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toMatchObject({ code: 'masterPipelineNoSuchProject' })
  })

  it("2. the owner's press marks one with no reason, and the same press again writes no second change", async () => {
    const pressed = await mark(AS_THE_PERSON, { pipeline: first })
    expect(pressed.statusCode, pressed.body.slice(0, 300)).toBe(200)
    expect(pressed.json()).toMatchObject({ state: 'marked', id: first, title: 'A made-up master' })
    const read = await reading()
    expect(read).toMatchObject({ state: 'marked', id: first })
    expect(read.lastChange?.by).toEqual({ type: 'human', id: THE_PERSON })
    expect(read.lastChange?.to).toContain(first)
    const again = await mark(AS_THE_PERSON, { pipeline: first })
    expect(again.statusCode).toBe(200)
    expect((await reading()).lastChange?.id).toBe(read.lastChange?.id)
  })

  it('3. a secretary with its own key gives a reason, and the change keeps it', async () => {
    const bare = await mark(asAgent('clerk'), { pipeline: second })
    expect(bare.statusCode).toBe(400)
    expect(bare.json()).toMatchObject({ code: 'masterPipelineNeedsAReason' })
    expect((await reading()).id).toBe(first)
    const given = await mark(asAgent('clerk'), { pipeline: second, because: 'the made-up reason' })
    expect(given.statusCode, given.body.slice(0, 300)).toBe(200)
    const read = await reading()
    expect(read).toMatchObject({ state: 'marked', id: second })
    expect(read.lastChange?.by).toEqual({ type: 'agent', id: 'clerk' })
    expect(read.lastChange?.field).toContain('the made-up reason')
  })

  it("4. another agent, and a secretary's name with no key, are refused and change nothing", async () => {
    for (const headers of [asAgent('mason'), asAgent('clerk', false)]) {
      const refused = await mark(headers, { pipeline: first, because: 'a made-up reason' })
      expect(refused.statusCode).toBe(403)
      expect(refused.json()).toMatchObject({ code: 'masterPipelineNotAllowed' })
    }
    expect((await reading()).id).toBe(second)
  })

  it('5. a missing record, a module and a pipeline of another project are refused, and nothing is changed', async () => {
    const cases = [
      ['madeUpNoSuch', 'masterPipelineNoSuchRecord'],
      [aModule, 'masterPipelineNotAPipeline'],
      [elsewhere, 'masterPipelineInAnotherProject'],
    ] as const
    for (const [pipeline, code] of cases) {
      const refused = await mark(AS_THE_PERSON, { pipeline })
      expect(refused.statusCode, `${pipeline}: ${refused.body.slice(0, 200)}`).toBe(400)
      expect(refused.json()).toMatchObject({ code })
    }
    expect((await reading()).id).toBe(second)
  })

  it('6. a deleted master reads broken with no other pipeline in its place, and marking none reads unmarked', async () => {
    t.api.deleteRecord(second, t.api.HUMAN)
    expect(await reading()).toMatchObject({ state: 'broken', id: second, because: 'deleted' })
    const none = await mark(AS_THE_PERSON, { pipeline: null })
    expect(none.statusCode, none.body.slice(0, 300)).toBe(200)
    expect(await reading()).toMatchObject({ state: 'unmarked' })
  })
})
