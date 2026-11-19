// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HANDBOOK IN A PROJECT THE READER MAY NOT READ IS LEFT OUT OF THE HANDBOOK LISTS, TITLE AND ALL.
 *
 * GET /api/roles lists the live handbooks on each role card, and GET /api/flows/<id> the live handbooks on the flow, in
 * any state, so a draft is listed with its title. A handbook is a record of one project. A reader who may not read that
 * project is told neither the handbook nor its title: each list keeps only the handbooks filed in a project
 * `theProjectsAReaderMayRead` (src/server/db/the-projects-a-reader-may-read.ts, moved out of across-projects.ts) names, and the reply counts the rest in
 * `narrowedByPermission`, with `cause: 'permission'` and no ids, as src/shared/disclosure.ts says a reply narrowed by
 * permission does.
 *
 * No rule keeps a reader out of a whole project today, so this file makes one up: `theProjectsAReaderMayRead` is
 * mocked to leave the second project out for a reader who does not read every message. The person reads every message,
 * so the person reads both projects; an agent the office has not registered reads only the first. Every record here is
 * made up.
 *
 *   1. GET /api/roles as the agent: the worker card lists only the handbook filed in the first project. The reply holds
 *      neither the other handbook's title nor its id, and `narrowedByPermission` counts one handbook left out.
 *   2. GET /api/roles as the person: the worker card lists both, and `narrowedByPermission` is null.
 *   3. GET /api/flows/<id> as the agent, for a flow in the first project that both hang on: as case 1.
 *   4. GET /api/flows/<id> as the person: as case 2.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. src/server/lib/handbooks.ts: the handbook lists keep every live handbook whatever the reader may read → cases 1
 *      and 3 red, at the list.
 *   2. src/server/lib/handbooks.ts: the left-out count is not given, so `narrowedByPermission` is null → cases 1 and 3
 *      red, at `narrowedByPermission`.
 *   3. src/server/lib/handbooks.ts: a list that left nothing out says a group of none rather than null → cases 2 and 4
 *      red, at `narrowedByPermission`.
 *   4. src/server/api/roles.ts: the reply leaves `narrowedByPermission` out, so the server says null → case 1 red.
 *   5. src/server/lib/flows.ts: a flow's reply leaves it out the same way → case 3 red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type AcrossProjects = typeof import('../src/server/db/the-projects-a-reader-may-read.ts')

const HERE = 'default'
const THERE = 'orchard'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'pruner-q' }

const TITLE_HERE = 'MADE-UP draft handbook filed in the first project'
const TITLE_THERE = 'MADE-UP draft handbook filed in the orchard project'

let t: TestDb
let app: FastifyInstance
let flow = ''
let here = ''
let there = ''

async function inject(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object): Promise<{ status: number; text: string; json: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, text: reply.body, json: reply.json() as Record<string, unknown> }
}

/** File a record as the person, in the project the headers name, and answer its id. */
async function file(kind: string, title: string, data: Record<string, unknown>, headers: Record<string, string> = AS_THE_PERSON): Promise<string> {
  const made = await inject('POST', '/api/records', headers, { kind, title, data })
  expect(made.status, made.text).toBe(201)
  return String((made.json['record'] as { id: string }).id)
}

/** A draft handbook on the worker card and on the flow, with one language's text. */
function aDraftHandbook(): Record<string, unknown> {
  return {
    for: 'The made-up agent of this test.',
    state: 'draft',
    text: { en: { opening: 'MADE-UP opening.' } },
    hangs_on: [{ card: 'worker' }, { flow }],
    text_changes: [{ languages: ['en'], why: 'MADE-UP: the first text.' }],
  }
}

/** What a reply narrowed by permission says: one group, of one handbook, with no ids. */
function expectOneHandbookLeftOut(said: Record<string, unknown>): void {
  const narrowed = said['narrowedByPermission']
  expect(Array.isArray(narrowed), `narrowedByPermission is ${JSON.stringify(narrowed)}, not a list of groups`).toBe(true)
  expect(narrowed).toHaveLength(1)
  expect((narrowed as unknown[])[0]).toMatchObject({ cause: 'permission', count: 1, ids: null })
}

beforeAll(async () => {
  // THE MADE-UP RULE, before `freshDb`: it imports the server's record code, which brings in the one rule, and a
  // module already imported keeps the rule it was given. `freshDb` resets the modules and keeps this mock.
  vi.doMock('../src/server/db/the-projects-a-reader-may-read.ts', async (importOriginal) => {
    const real = await importOriginal<AcrossProjects>()
    return {
      ...real,
      theProjectsAReaderMayRead: (reader: Parameters<AcrossProjects['theProjectsAReaderMayRead']>[0]) =>
        real.theProjectsAReaderMayRead(reader).filter((project) => reader.readsEveryMessage || project.id !== THERE),
    }
  })
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await inject('POST', '/api/workspaces', AS_THE_PERSON, { id: THERE, title: 'Orchard' })
  expect(made.status, made.text).toBe(201)
  const source = await file('report', 'MADE-UP source of the flow', { blocks: [] })
  const step = (n: number) => ({ n, does: `MADE-UP step ${n}.`, evidence: 'a made-up commit', why: 'Without it the made-up work is not done.', sources: [source] })
  flow = await file('flow', 'MADE-UP flow in the first project', {
    declared_in: 'a made-up flow of this test',
    runs: 'a made-up worker',
    trigger: 'A made-up piece of work is asked for.',
    stages: [step(1), step(2)],
    leaves_behind: 'a made-up commit',
    governed_by: 'this test file',
    reviewed_at: '2026-11-08',
  })
  here = await file('handbook', TITLE_HERE, aDraftHandbook())
  there = await file('handbook', TITLE_THERE, aDraftHandbook(), { ...AS_THE_PERSON, 'x-mole-office-workspace': THERE })
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  vi.doUnmock('../src/server/db/the-projects-a-reader-may-read.ts')
})

/** The ids of the handbooks a list holds. */
const idsOf = (listed: unknown): string[] => (Array.isArray(listed) ? listed.map((one) => String((one as { id: unknown }).id)) : [])

describe('the Role cards list', () => {
  it('1. leaves out, title and all, a handbook in a project the reader may not read, and counts it', async () => {
    const said = await inject('GET', '/api/roles', AS_AN_AGENT)
    expect(said.status, said.text).toBe(200)
    expect(idsOf((said.json['handbooks'] as Record<string, unknown>)['worker'])).toEqual([here])
    expect(said.text, 'the reply names the left-out handbook').not.toContain(TITLE_THERE)
    expect(said.text, 'the reply gives the left-out handbook\'s id').not.toContain(there)
    expectOneHandbookLeftOut(said.json)
  })

  it('2. lists both to a reader who may read both projects, and says permission took nothing off', async () => {
    const said = await inject('GET', '/api/roles', AS_THE_PERSON)
    expect(said.status, said.text).toBe(200)
    expect(idsOf((said.json['handbooks'] as Record<string, unknown>)['worker'])).toEqual([here, there])
    expect(said.json['narrowedByPermission']).toBeNull()
  })
})

describe('a flow\'s list', () => {
  it('3. leaves out, title and all, a handbook in a project the reader may not read, and counts it', async () => {
    const said = await inject('GET', `/api/flows/${flow}`, AS_AN_AGENT)
    expect(said.status, said.text).toBe(200)
    expect(idsOf(said.json['handbooks'])).toEqual([here])
    expect(said.text, 'the reply names the left-out handbook').not.toContain(TITLE_THERE)
    expect(said.text, 'the reply gives the left-out handbook\'s id').not.toContain(there)
    expectOneHandbookLeftOut(said.json)
  })

  it('4. lists both to a reader who may read both projects, and says permission took nothing off', async () => {
    const said = await inject('GET', `/api/flows/${flow}`, AS_THE_PERSON)
    expect(said.status, said.text).toBe(200)
    expect(idsOf(said.json['handbooks'])).toEqual([here, there])
    expect(said.json['narrowedByPermission']).toBeNull()
  })
})
