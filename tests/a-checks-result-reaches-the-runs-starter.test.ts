// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK'S RESULT REACHES THE AGENT THAT STARTED THE RUN.
 *
 * The report in message G6qf7eXmisNe. On 6 October two releases of runs by a worker seemed not to
 * reach the worker's starter, and nobody confirmed them for hours. The live rows showed that the office did write its line to
 * the starter both times, and that both lines reached the starter's waiting session at once (message Hl1DXVCXILP-).
 * The loss was after that, outside the office. So this file builds nothing new. It proves the one way that
 * exists: the verdict door's own line to the run's starter.
 *
 * WHAT THIS FILE MEASURES, against a real database and the real doors, for a worker a secretary started:
 *   (a) a release of the worker's run writes one line to the secretary, about that run, and the secretary is
 *       handed it when it asks for what waits for it;
 *   (b) a refusal of the worker's run does the same;
 *   (c) the run's release names the secretary as the one it was reported to.
 *
 * MUTATION PROOFS, each after a green control, are in the commit message that meets this file.
 *
 * Every record here is synthetic, in a fresh database. Nothing reaches the live office.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const WORKSPACE = 'default'
const SECRETARY = 'st-secretary'
const WORKER = 'st-worker'
const INSPECTOR = 'st-inspector'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string, session?: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

let t: TestDb
let app: FastifyInstance
/** The secretary's id in the registry, which is not its handle. */
let secretaryId: string

/** Registers an agent and answers with its id in the registry. */
async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

/** The worker's run, finished, with nothing sealed: the run under check. */
async function theWorkersRun(title: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(WORKER),
    payload: { kind: 'session', title, data: { state: 'running', servingAgent: WORKER, workingDirectory: process.cwd(), doing: 'Test: the work under check' } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const run = (reply.json() as { record: { id: string } }).record.id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(run)
  return run
}

/** The inspector's check of `run`, assembled under its own session, and its verdict. */
async function theCheckSays(run: string, verdict: Record<string, unknown>): Promise<void> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(INSPECTOR),
    payload: { kind: 'session', title: `Test: the check of ${run}`, data: { state: 'running', servingAgent: INSPECTOR, doing: 'Test: checking' } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  const check = (filed.json() as { record: { id: string } }).record.id
  const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent(INSPECTOR, check), payload: { changes: [] } })
  expect(assembled.statusCode, assembled.body).toBe(201)
  const said = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent(INSPECTOR, check), payload: verdict })
  expect(said.statusCode, said.body).toBe(201)
}

/** The messages about `run` addressed to the secretary, with the secretary's delivery row for each. */
function theLinesToTheSecretary(run: string): { id: string; title: string; mark: string | null }[] {
  const rows = t.client.sqlite
    .prepare(
      `SELECT r.id AS id, r.title AS title, d.mark AS mark FROM records r
         LEFT JOIN message_delivery d ON d.message_id = r.id AND d.recipient_kind = 'agent' AND d.recipient_id = ?
        WHERE r.kind = 'message' AND json_extract(r.data, '$.aboutRun') = ?
          AND EXISTS (SELECT 1 FROM json_each(r.data, '$.to') AS one WHERE json_extract(one.value, '$.id') = ?)`,
    )
    .all(secretaryId, run, secretaryId) as { id: string; title: string; mark: string | null }[]
  return rows
}

/** What the secretary is handed when it asks for what waits for it. */
async function whatWaitsForTheSecretary(): Promise<string[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/messages?only=waiting-for-me&limit=25', headers: asAgent(SECRETARY) })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { messages: { id: string }[] }).messages.map((one) => one.id)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  secretaryId = await register(AS_THE_PERSON, { handle: SECRETARY, name: 'Synthetic secretary', role: 'secretary' })
  await register(AS_THE_PERSON, { handle: INSPECTOR, name: 'Synthetic inspector', role: 'inspector' })
  await register(asAgent(SECRETARY), { handle: WORKER, name: 'Synthetic worker', role: 'worker', workArea: ['tests'] })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a check of a worker a secretary started', () => {
  let releasedRun: string

  it('(a) a release writes one line to the secretary, and the secretary is handed it', async () => {
    releasedRun = await theWorkersRun('Test: a run that is released')
    await theCheckSays(releasedRun, { verdict: 'released', check: 'Test: read the run. Nothing is missing.', chaptersRead: [] })
    const lines = theLinesToTheSecretary(releasedRun)
    expect(lines, 'one line about the released run is addressed to the secretary').toHaveLength(1)
    expect(lines[0]!.mark, 'the line has a delivery row for the secretary').not.toBeNull()
    expect(await whatWaitsForTheSecretary()).toContain(lines[0]!.id)
  })

  it('(b) a refusal writes one line to the secretary, and the secretary is handed it', async () => {
    const run = await theWorkersRun('Test: a run that is refused')
    await theCheckSays(run, {
      verdict: 'refused',
      check: 'Test: read the run. A test has no mutation proof.',
      missing: ['Test: no mutation proof for the new test'],
      says: { chapter: 5 },
      chaptersRead: [],
    })
    const lines = theLinesToTheSecretary(run)
    expect(lines, 'one line about the refused run is addressed to the secretary').toHaveLength(1)
    expect(lines[0]!.mark, 'the line has a delivery row for the secretary').not.toBeNull()
    expect(await whatWaitsForTheSecretary()).toContain(lines[0]!.id)
  })

  it('(c) the release names the secretary as the one it was reported to', () => {
    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(releasedRun) as { data: string }
    const released = (JSON.parse(row.data) as { released: { reportedTo?: { kind: string; id: string }; report?: string } }).released
    expect(released.reportedTo).toEqual({ kind: 'agent', id: secretaryId })
    expect(released.report).toBe(theLinesToTheSecretary(releasedRun)[0]!.id)
  })
})
