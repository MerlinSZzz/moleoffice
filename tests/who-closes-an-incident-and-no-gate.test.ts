// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION I7: who closes an incident, and no gate.
 *
 * A decision on the secretary's recommendation, agreed in its point 1: the
 * person or a secretary closes an incident when its corrective decisions are done, with one line
 * saying so; nothing in the office is gated on an incident's state.
 *
 * WHAT THIS FILE HOLDS UP, and the mutation that proves the door:
 *
 *   - the person may close one, with a note, and `closedWith` records the note, who, and when;
 *   - a secretary-carded agent may close one;
 *   - a plain agent is refused, and nothing moves;
 *   - closing with no note is refused — "one line saying so" is not optional;
 *   - `state` cannot move to `closed` through an ordinary PATCH, not even sent by the person
 *     — MUTATION: let `checkTheIncidentClosing` in src/server/lib/records.ts return immediately,
 *       so a plain `dataPatch: {"state":"closed"}` closes one with no note at all;
 *   - moving OFF `closed` is an ordinary edit, open to any agent — nothing locks a reopened
 *     incident, because nothing in the decision asks for that lock;
 *   - and the second half of the criterion, "no gate": once closed, every other door on the record
 *     stays exactly as open as it was — a plain agent may still append a timeline moment, link a
 *     problem, and patch an ordinary field. Closing records a fact; it restricts nothing.
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

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
}

const A_MOMENT = { id: 'm-1', at: '2026-09-09 14:02', who: 'the operator', what: 'Something happened.', evidence: 'ev-placeholder' }

async function file(headers: Record<string, string> = AS_THE_PERSON): Promise<string> {
  const said = await post(headers, '/api/records', {
    kind: 'incident',
    title: `an incident ${Math.random().toString(36).slice(2, 8)}`,
    data: { loss: 'Two near-misses.', timeline: [A_MOMENT] },
  })
  expect(said.status, said.body).toBe(201)
  return (said.json as { record: { id: string } }).record.id
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

describe('who may close', () => {
  it('the person may close it, with one line, and closedWith records it', async () => {
    const id = await file()
    const said = await post(AS_THE_PERSON, `/api/records/${id}/close-incident`, {
      note: 'Every linked corrective decision is done and the fresh-activation check is verified.',
    })
    expect(said.status, said.body).toBe(200)
    const after = await getRecord(id)
    expect(after.data['state']).toBe('closed')
    const closedWith = after.data['closedWith'] as { note: string; by: string; at: string }
    expect(closedWith.note).toContain('corrective decision is done')
    expect(closedWith.by).toBe(THE_PERSON)
    expect(closedWith.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('a secretary-carded agent may close it', async () => {
    const id = await file()
    const said = await post(asAgent(THE_TEST_OFFICES_SECRETARY.handle), `/api/records/${id}/close-incident`, { note: 'Done.' })
    expect(said.status, said.body).toBe(200)
    const after = await getRecord(id)
    expect((after.data['closedWith'] as { by: string }).by).toBe(THE_TEST_OFFICES_SECRETARY.handle)
  })

  it('a plain agent is refused, and nothing moves', async () => {
    const id = await file()
    const said = await post(asAgent('builder-one'), `/api/records/${id}/close-incident`, { note: 'Done.' })
    expect(said.status, said.body).toBe(403)
    const after = await getRecord(id)
    expect(after.data['state']).toBeUndefined()
    expect(after.data['closedWith']).toBeUndefined()
  })

  it('refuses closing with no note — "one line saying so" is not optional', async () => {
    const id = await file()
    const said = await post(AS_THE_PERSON, `/api/records/${id}/close-incident`, {})
    expect(said.status, said.body).toBe(400)
    const after = await getRecord(id)
    expect(after.data['state']).toBeUndefined()
  })
})

describe('state moves to closed only through the door', () => {
  it('refuses a plain PATCH setting state to closed, even sent by the person', async () => {
    const id = await file()
    const said = await patch(AS_THE_PERSON, id, { dataPatch: { state: 'closed' } })
    expect(said.status, said.body).toBe(403)
    expect(said.body).toContain('close-incident')
    const after = await getRecord(id)
    expect(after.data['state']).toBeUndefined()
  })

  it('moving OFF closed is an ordinary edit, open to any agent', async () => {
    const id = await file()
    await post(AS_THE_PERSON, `/api/records/${id}/close-incident`, { note: 'Done.' })
    const said = await patch(asAgent('builder-one'), id, { dataPatch: { state: 'investigating' } })
    expect(said.status, said.body).toBe(200)
    const after = await getRecord(id)
    expect(after.data['state']).toBe('investigating')
  })
})

describe('no gate: closing restricts nothing else on the record', () => {
  it('a plain agent may still append a timeline moment once it is closed', async () => {
    const id = await file()
    await post(AS_THE_PERSON, `/api/records/${id}/close-incident`, { note: 'Done.' })
    const evidence = await post(AS_THE_PERSON, '/api/records', { kind: 'note', title: `evidence ${Math.random().toString(36).slice(2, 8)}` })
    const evidenceId = (evidence.json as { record: { id: string } }).record.id
    const said = await post(asAgent('builder-one'), `/api/records/${id}/timeline`, {
      at: '2026-09-10 09:00', who: 'a later reader', what: 'Added a moment after closing.', evidence: evidenceId,
    })
    expect(said.status, said.body).toBe(201)
  })

  it('a plain agent may still link a problem to it once it is closed', async () => {
    const id = await file()
    await post(AS_THE_PERSON, `/api/records/${id}/close-incident`, { note: 'Done.' })
    const problem = await post(asAgent('builder-one'), '/api/records', { kind: 'problem', title: `a problem ${Math.random().toString(36).slice(2, 8)}` })
    const problemId = (problem.json as { record: { id: string } }).record.id
    const said = await post(asAgent('builder-one'), '/api/links', { fromId: id, toId: problemId, type: 'about' })
    expect(said.status, said.body).toBe(201)
  })

  it('a plain agent may still patch an ordinary field once it is closed', async () => {
    const id = await file()
    await post(AS_THE_PERSON, `/api/records/${id}/close-incident`, { note: 'Done.' })
    const said = await patch(asAgent('builder-one'), id, { summary: 'still an ordinary edit' })
    expect(said.status, said.body).toBe(200)
  })
})
