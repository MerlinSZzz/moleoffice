// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION I2: a problem's fix does not close the incident.
 *
 * design/incidents/ACCEPTANCE.md: an incident links its problems, and a problem going `fixed` changes
 * nothing on the incident but the line that names it, which then says fixed. The incident's own
 * state moves only by a write that says what was corrected, what was changed in the rules or the
 * office, and what was verified, each as its own field.
 *
 * WHAT THIS FILE HOLDS UP, and the mutation that proves it:
 *
 *   - an incident with two problems linked `about` it; every linked problem is patched `fixed`,
 *     one after the other, and the incident reads exactly as it did — still `open`, no
 *     `closedWith`, not one field of its data moved;
 *   - the problems themselves read `fixed`, which is the line the incident page names them by:
 *     the page reads each linked problem's state off the problem's own record at display time
 *     (criterion I3), so the fix shows on the incident without a single write to the incident;
 *   - the incident's state DOES move — but only by its own deliberate write, the one that says
 *     what was corrected and what was changed in the rules or the office (the corrective actions,
 *     each naming the problem, decision or criterion it became) and what was verified (the
 *     verification field), each as its own field on the record;
 *   - MUTATION: in `patchRecord` in src/server/lib/records.ts, immediately after the record write
 *     (`db.update(records).set(write)…`), make a problem whose state has just gone `fixed` close
 *     every incident linked to it `about` — the "close on the last fix" the criterion refuses. The
 *     first test goes red exactly there: the incident reads `closed` after the last fix instead
 *     of the `open` it was filed with.
 *
 * WHY THE POSITIVE TEST IS IN THE SAME FILE: "state moves only by a write that says …" has two
 * halves — nothing else moves it, and a deliberate write does. Proving only the first would leave
 * the second asserted but never seen.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

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

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
}

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

interface ReadRecord {
  data: Record<string, unknown>
  links: { type: string; other: { id: string; kind: string }; broken?: boolean }[]
}

async function getRecord(id: string): Promise<ReadRecord> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  const said = reply.json() as { record: { data: Record<string, unknown> }; links: ReadRecord['links'] }
  return { data: said.record.data, links: said.links }
}

const A_MOMENT = {
  id: 'm-1',
  at: '2026-09-09 14:02',
  who: 'the operator',
  what: 'Something happened.',
  evidence: 'ev-placeholder',
}

async function fileIncident(): Promise<string> {
  const said = await post(AS_THE_PERSON, '/api/records', {
    kind: 'incident',
    title: `an incident ${Math.random().toString(36).slice(2, 8)}`,
    data: { loss: 'Two near-misses.', timeline: [A_MOMENT], state: 'open' },
  })
  expect(said.status, said.body).toBe(201)
  return (said.json as { record: { id: string } }).record.id
}

async function fileProblem(by: Record<string, string>): Promise<string> {
  const said = await post(by, '/api/records', {
    kind: 'problem',
    title: `a problem ${Math.random().toString(36).slice(2, 8)}`,
    data: { state: 'open' },
  })
  expect(said.status, said.body).toBe(201)
  return (said.json as { record: { id: string } }).record.id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: 'builder-one', name: 'Builder One', role: 'worker' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('fixing every linked problem moves nothing on the incident', () => {
  it('the incident reads exactly as it did — still open, no closedWith', async () => {
    const incidentId = await fileIncident()
    const problemOne = await fileProblem(asAgent('builder-one'))
    const problemTwo = await fileProblem(asAgent('builder-one'))
    expect(
      (await post(asAgent('builder-one'), '/api/links', { fromId: incidentId, toId: problemOne, type: 'about' })).status,
    ).toBe(201)
    expect(
      (await post(asAgent('builder-one'), '/api/links', { fromId: incidentId, toId: problemTwo, type: 'about' })).status,
    ).toBe(201)

    const before = await getRecord(incidentId)
    expect(before.data['state']).toBe('open')

    const fixedOne = await patch(asAgent('builder-one'), problemOne, { dataPatch: { state: 'fixed' } })
    expect(fixedOne.status, fixedOne.body).toBe(200)
    const fixedTwo = await patch(asAgent('builder-one'), problemTwo, { dataPatch: { state: 'fixed' } })
    expect(fixedTwo.status, fixedTwo.body).toBe(200)

    const after = await getRecord(incidentId)
    expect(after.data).toEqual(before.data)
    expect(after.data['state']).toBe('open')
    expect(after.data['closedWith']).toBeUndefined()
  })

  it('the linked problems read fixed — the line the incident names them by', async () => {
    const incidentId = await fileIncident()
    const problemId = await fileProblem(asAgent('builder-one'))
    expect(
      (await post(asAgent('builder-one'), '/api/links', { fromId: incidentId, toId: problemId, type: 'about' })).status,
    ).toBe(201)

    const fixed = await patch(asAgent('builder-one'), problemId, { dataPatch: { state: 'fixed' } })
    expect(fixed.status, fixed.body).toBe(200)

    const incident = await getRecord(incidentId)
    const link = incident.links.find((l) => l.type === 'about' && l.other.id === problemId)
    expect(link, 'the link stands, broken by nothing').toBeTruthy()
    const problem = await getRecord(problemId)
    expect(problem.data['state']).toBe('fixed')
  })
})

describe('the state moves only by its own deliberate write', () => {
  it('a write that says what was corrected, what was changed in the rules or the office, and what was verified — each as its own field', async () => {
    const incidentId = await fileIncident()
    const problemId = await fileProblem(asAgent('builder-one'))
    expect(
      (await post(asAgent('builder-one'), '/api/links', { fromId: incidentId, toId: problemId, type: 'about' })).status,
    ).toBe(201)
    await patch(asAgent('builder-one'), problemId, { dataPatch: { state: 'fixed' } })

    const said = await patch(asAgent('builder-one'), incidentId, {
      dataPatch: {
        state: 'corrected',
        corrective_actions: [
          {
            id: 'ca-1',
            text: 'Latch the speed limit fresh on every resume, not only on first activation.',
            becameRecordId: problemId,
            becameRecordKind: 'problem',
          },
          { id: 'ca-2', text: 'The resume check was written into the bench checklist as a rule.', becameCriterion: 'I6' },
        ],
        verification: { how: 'Pause and resume an EGM session and read the speed limit before the first move.', verified: false },
      },
    })
    expect(said.status, said.body).toBe(200)

    const after = await getRecord(incidentId)
    expect(after.data['state']).toBe('corrected')
    const actions = after.data['corrective_actions'] as { becameRecordId?: string; becameCriterion?: string }[]
    expect(actions).toHaveLength(2)
    expect(actions[0]?.['becameRecordId']).toBe(problemId)
    expect(actions[1]?.['becameCriterion']).toBe('I6')
    expect(after.data['verification']).toEqual({
      how: 'Pause and resume an EGM session and read the speed limit before the first move.',
      verified: false,
    })
  })
})
