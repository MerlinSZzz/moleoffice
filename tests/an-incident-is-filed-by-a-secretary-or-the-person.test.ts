// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION I4: an incident is filed by a secretary or the person, and every agent may add evidence
 * to its timeline.
 *
 * design/incidents/ACCEPTANCE.md: filing, and changing the responsibility sentences,
 * are the secretary's or the person's; a worker may append a timeline moment with evidence and may link a
 * problem. Test at the door for each role.
 *
 * WHAT THIS FILE HOLDS UP, and the mutation that proves each door:
 *
 *   - the person may file one;
 *   - a secretary-carded agent may file one;
 *   - a plain agent is refused filing, and the refusal names criterion I4
 *     — MUTATION: let `checkWhoMayFileAnIncident` in src/server/lib/records/who-files-an-incident.ts return early for
 *       every actor, so a worker can file one;
 *   - a plain agent is refused RECLASSIFYING another record into an incident, the same as filing
 *     it outright — the create path and the kind-change path are one rule, not two;
 *   - the person may change `responsibility` on an incident already filed;
 *   - a secretary-carded agent may change it too;
 *   - a plain agent is refused changing it, and nothing moves
 *     — MUTATION: let `checkTheIncidentResponsibility` return early for every actor;
 *   - a plain agent MAY append a timeline moment through its own door — the positive half of I4,
 *     and the point the mutation above must not also break;
 *   - a plain agent MAY link a problem to an incident with an ordinary POST /api/links;
 *   - nobody, including the person, may write `timeline` through an ordinary PATCH — it is the
 *     door's alone, criterion I1's own enforcement, checked here because I4 is what makes "every
 *     agent" a real question for this field.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as {
    elevation: { onlyThisCardCanHoldIt: string }
  }
  return said.elevation.onlyThisCardCanHoldIt
}

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
}

const A_MOMENT = (n: number) => ({
  id: `m-${String(n)}`,
  at: '2026-09-09 14:0' + String(n),
  who: 'the operator',
  what: 'Something happened.',
  evidence: 'ev-placeholder',
})

interface Said {
  status: number
  body: string
  json: Record<string, unknown> | null
}

async function post(headers: Record<string, string>, url: string, payload: Record<string, unknown>): Promise<Said> {
  const reply = await app.inject({ method: 'POST', url, headers, payload })
  return { status: reply.statusCode, body: reply.body, json: reply.statusCode < 300 ? (reply.json() as Record<string, unknown>) : null }
}

async function patch(headers: Record<string, string>, id: string, payload: Record<string, unknown>): Promise<Said> {
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload })
  return { status: reply.statusCode, body: reply.body, json: reply.statusCode < 300 ? (reply.json() as Record<string, unknown>) : null }
}

async function getRecord(id: string): Promise<{ data: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { record: { data: Record<string, unknown> } }).record
}

async function file(headers: Record<string, string>, extra: Record<string, unknown> = {}): Promise<Said> {
  return post(headers, '/api/records', {
    kind: 'incident',
    title: `an incident ${Math.random().toString(36).slice(2, 8)}`,
    data: { loss: 'Two near-misses.', timeline: [A_MOMENT(1)], ...extra },
  })
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: theSecretaryCard() })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-one', name: 'Builder One', role: 'worker' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. who may file

describe('filing', () => {
  it('the person may file one', async () => {
    const said = await file(AS_THE_PERSON)
    expect(said.status, said.body).toBe(201)
  })

  it('a secretary-carded agent may file one', async () => {
    const said = await file(asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    expect(said.status, said.body).toBe(201)
  })

  it('a plain agent is refused, and the refusal says filing is the secretary\'s or the person\'s own act', async () => {
    const said = await file(asAgent('builder-one'))
    expect(said.status, said.body).toBe(403)
    expect(said.body).toContain("Filing an incident is the secretary's or the person's own act.")
    expect(said.body).toContain('builder-one')
  })

  it('a plain agent is refused reclassifying another record into an incident, the same as filing it', async () => {
    const note = await post(asAgent('builder-one'), '/api/records', {
      kind: 'note',
      title: `a note to reclassify ${Math.random().toString(36).slice(2, 8)}`,
    })
    expect(note.status, note.body).toBe(201)
    const noteId = (note.json as { record: { id: string } }).record.id
    const said = await patch(asAgent('builder-one'), noteId, { kind: 'incident' })
    expect(said.status, said.body).toBe(403)
    expect(said.body).toContain("Filing an incident is the secretary's or the person's own act.")
  })
})

// ============================================================ 2. who may change responsibility

describe('changing responsibility', () => {
  const RESPONSIBILITY = {
    person: { sentence: 'Approved the design.', uncertainty: 'the owner’s own words' },
    agents: { sentence: 'No agent reviewed it.', uncertainty: 'measured', handles: [] as string[] },
    office: { sentence: 'Nothing stopped it.', uncertainty: 'measured' },
  }

  it('the person may change it', async () => {
    const filed = await file(AS_THE_PERSON)
    const id = (filed.json as { record: { id: string } }).record.id
    const said = await patch(AS_THE_PERSON, id, { dataPatch: { responsibility: RESPONSIBILITY } })
    expect(said.status, said.body).toBe(200)
    const after = await getRecord(id)
    expect(after.data['responsibility']).toEqual(RESPONSIBILITY)
  })

  it('a secretary-carded agent may change it', async () => {
    const filed = await file(AS_THE_PERSON)
    const id = (filed.json as { record: { id: string } }).record.id
    const said = await patch(asAgent(THE_TEST_OFFICES_SECRETARY.handle), id, { dataPatch: { responsibility: RESPONSIBILITY } })
    expect(said.status, said.body).toBe(200)
  })

  it('a plain agent is refused, and nothing moves', async () => {
    const filed = await file(AS_THE_PERSON)
    const id = (filed.json as { record: { id: string } }).record.id
    const said = await patch(asAgent('builder-one'), id, { dataPatch: { responsibility: RESPONSIBILITY } })
    expect(said.status, said.body).toBe(403)
    expect(said.body).toContain("Changing responsibility on an incident is the secretary's or the person's own act.")
    const after = await getRecord(id)
    expect(after.data['responsibility']).toBeUndefined()
  })

  it('a write that leaves responsibility unchanged is not asked the question, even sent by a plain agent', async () => {
    const filed = await file(AS_THE_PERSON, { responsibility: RESPONSIBILITY })
    const id = (filed.json as { record: { id: string } }).record.id
    const said = await patch(asAgent('builder-one'), id, { summary: 'a plain agent may say this' })
    expect(said.status, said.body).toBe(200)
  })
})

// ============================================================ 3. every agent may append a moment

describe('every agent may append a timeline moment — the positive half of I4', () => {
  it('a plain agent may append one through the door', async () => {
    const filed = await file(AS_THE_PERSON)
    const id = (filed.json as { record: { id: string } }).record.id
    const evidence = await post(AS_THE_PERSON, '/api/records', { kind: 'note', title: `evidence ${Math.random().toString(36).slice(2, 8)}` })
    const evidenceId = (evidence.json as { record: { id: string } }).record.id
    const said = await post(asAgent('builder-one'), `/api/records/${id}/timeline`, {
      at: '2026-09-09 14:05', who: 'the run', what: 'Something else happened.', evidence: evidenceId,
    })
    expect(said.status, said.body).toBe(201)
    const after = await getRecord(id)
    const timeline = after.data['timeline'] as { evidence: string }[]
    expect(timeline).toHaveLength(2)
    expect(timeline[1]?.evidence).toBe(evidenceId)
  })

  it('refuses evidence that names nothing in this project', async () => {
    const filed = await file(AS_THE_PERSON)
    const id = (filed.json as { record: { id: string } }).record.id
    const said = await post(asAgent('builder-one'), `/api/records/${id}/timeline`, {
      at: '2026-09-09 14:05', who: 'the run', what: 'Something else happened.', evidence: 'nothing-answers-to-this',
    })
    expect(said.status, said.body).toBe(404)
  })
})

// ============================================================ 4. every agent may link a problem

describe('every agent may link a problem — the other positive half of I4', () => {
  it('a plain agent may link a problem to an incident with an ordinary POST /api/links', async () => {
    const filed = await file(AS_THE_PERSON)
    const id = (filed.json as { record: { id: string } }).record.id
    const problem = await post(asAgent('builder-one'), '/api/records', {
      kind: 'problem', title: `a problem to link ${Math.random().toString(36).slice(2, 8)}`,
    })
    const problemId = (problem.json as { record: { id: string } }).record.id
    const said = await post(asAgent('builder-one'), '/api/links', { fromId: id, toId: problemId, type: 'about' })
    expect(said.status, said.body).toBe(201)
  })
})

// ============================================================ 5. timeline is the door's alone, for anybody

describe('nobody writes timeline through an ordinary PATCH, not even the person', () => {
  it('refuses the person, and says to use the door', async () => {
    const filed = await file(AS_THE_PERSON)
    const id = (filed.json as { record: { id: string } }).record.id
    const said = await patch(AS_THE_PERSON, id, { dataPatch: { timeline: [A_MOMENT(1), A_MOMENT(2)] } })
    expect(said.status, said.body).toBe(403)
    expect(said.body).toContain('/timeline')
  })
})
