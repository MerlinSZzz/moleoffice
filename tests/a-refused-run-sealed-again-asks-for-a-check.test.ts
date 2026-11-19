// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSED RUN SEALED AGAIN ASKS FOR A CHECK, AND WHOEVER FILED THE REFUSED CHECK IS TOLD.
 *
 * Problem oSbOIC2Jypn0. On 29 September a refused run was sealed again, and the only note of it went to the
 * refusal's group. The agent that files the checks was not in that group. The office asked for nothing either,
 * because it asked only when a run's state changed to finished, and a refused run already says finished. The check
 * waited about two hours, until somebody wrote by hand.
 *
 * Now a write that seals a refused run again is the worker's answer to the refusal. The office asks for a fresh
 * check, and it writes to whoever filed the refused check's session: directly, as the office, and not in a group
 * (the secretary's answer for wave 13y, message LA1ZbbRWX9sj).
 *
 * WHAT THIS FILE MEASURES, against a real database and the real doors. A secretary started the worker and filed
 * the check session for the inspector, as tools/register-a-run.mjs --handle <inspector> does:
 *   (a) the worker seals its refused run again, and the office asks for a check: the reply carries it, and the
 *       refusal is marked answered;
 *   (b) the secretary gets one line about that run, written by the office, addressed to the secretary alone, and
 *       is handed it when it asks for what waits for it;
 *   (c) sealing the same run once more, with the refusal already answered, asks for nothing new and writes the
 *       secretary nothing new.
 *
 * MUTATION PROOFS, each after a green control, are in the commit message that meets this file.
 *
 * Every record here is synthetic, in a fresh database. Nothing reaches the live office.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { moleOffice } from '../src/shared/participants.ts'

const WORKSPACE = 'default'
const SECRETARY = 'rs-secretary'
const WORKER = 'rs-worker'
const INSPECTOR = 'rs-inspector'
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
/** Read after the fresh database exists, as tests/every-office-notice-says-whether-it-wakes.test.ts does. */
let notices: typeof import('../src/server/lib/notices.ts')
/** The secretary's id in the registry, which is not its handle. */
let secretaryId: string
let run: string

/** Registers an agent and answers with its id in the registry. */
async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

/** The messages about the run addressed to the secretary, each with its whole `to` and its delivery mark. */
function theLinesToTheSecretary(): { id: string; data: { to?: { kind: string; id: string }[]; sentBy?: unknown; notice?: unknown }; mark: string | null }[] {
  const rows = t.client.sqlite
    .prepare(
      `SELECT r.id AS id, r.data AS data, d.mark AS mark FROM records r
         LEFT JOIN message_delivery d ON d.message_id = r.id AND d.recipient_kind = 'agent' AND d.recipient_id = ?
        WHERE r.kind = 'message' AND json_extract(r.data, '$.aboutRun') = ?
          AND EXISTS (SELECT 1 FROM json_each(r.data, '$.to') AS one WHERE json_extract(one.value, '$.id') = ?)`,
    )
    .all(secretaryId, run, secretaryId) as { id: string; data: string; mark: string | null }[]
  return rows.map((one) => ({ ...one, data: JSON.parse(one.data) as { to?: { kind: string; id: string }[]; sentBy?: unknown; notice?: unknown } }))
}

/** The worker says its run is finished again, which seals it again. Answers the reply's `theCheck`. */
async function theWorkerSealsItAgain(): Promise<Record<string, unknown> | undefined> {
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent(WORKER), payload: { dataPatch: { state: 'finished' } } })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { theCheck?: Record<string, unknown> }).theCheck
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  notices = await import('../src/server/lib/notices.ts')
  secretaryId = await register(AS_THE_PERSON, { handle: SECRETARY, name: 'Synthetic secretary', role: 'secretary' })
  await register(AS_THE_PERSON, { handle: INSPECTOR, name: 'Synthetic inspector', role: 'inspector' })
  await register(asAgent(SECRETARY), { handle: WORKER, name: 'Synthetic worker', role: 'worker', workArea: ['tests'] })

  // The worker's run, finished, with nothing sealed: the run under check.
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(WORKER),
    payload: { kind: 'session', title: 'Test: a run refused and sealed again', data: { state: 'running', servingAgent: WORKER, workingDirectory: process.cwd(), doing: 'Test: the work under check' } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  run = (filed.json() as { record: { id: string } }).record.id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(run)

  // The secretary files the check session for the inspector, and the inspector refuses the run in it.
  const check = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(SECRETARY),
    payload: { kind: 'session', title: 'Test: the check that refuses', data: { state: 'running', servingAgent: INSPECTOR, doing: 'Test: checking' } },
  })
  expect(check.statusCode, check.body).toBe(201)
  const session = (check.json() as { record: { id: string } }).record.id
  const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent(INSPECTOR, session), payload: { changes: [] } })
  expect(assembled.statusCode, assembled.body).toBe(201)
  const refused = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}`,
    headers: asAgent(INSPECTOR, session),
    payload: { verdict: 'refused', check: 'Test: read the run. A test has no mutation proof.', missing: ['Test: no mutation proof'], says: { chapter: 5 }, chaptersRead: [] },
  })
  expect(refused.statusCode, refused.body).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a refused run sealed again', () => {
  it('(a) asks for a check, and marks the refusal answered', async () => {
    const theCheck = await theWorkerSealsItAgain()
    expect(theCheck, 'the reply says a check was asked for').toBeDefined()
    expect(theCheck?.['askedOf']).toBe(INSPECTOR)
    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
    const refusal = (JSON.parse(row.data) as { refused: { reworked?: unknown } }).refused
    expect(refusal.reworked, 'the refusal is marked answered by the rework').toBeDefined()
  })

  it('(b) tells the secretary who filed the refused check, directly and as the office', async () => {
    const lines = theLinesToTheSecretary().filter((one) => JSON.stringify(one.data).includes('sealed again'))
    expect(lines, 'one line about the reseal is addressed to the secretary').toHaveLength(1)
    const line = lines[0]!
    expect(line.data.sentBy, 'the office wrote it').toEqual(moleOffice())
    expect(line.data.notice, 'it carries its kind').toBe('aResealAsksForACheck')
    expect(notices.whyThisWakesNoWaiter(moleOffice(), line.data.notice), 'its kind wakes the one asked for the check').toBeNull()
    expect(line.data.to, 'it is addressed to the secretary alone').toEqual([{ kind: 'agent', id: secretaryId }])
    expect(line.mark, 'the line has a delivery row for the secretary').not.toBeNull()
    const waiting = await app.inject({ method: 'GET', url: '/api/messages?only=waiting-for-me&limit=25', headers: asAgent(SECRETARY) })
    expect(waiting.statusCode, waiting.body).toBe(200)
    expect((waiting.json() as { messages: { id: string }[] }).messages.map((one) => one.id)).toContain(line.id)
  })

  it('(c) sealed once more, with the refusal answered, asks nothing new', async () => {
    const before = theLinesToTheSecretary().length
    const theCheck = await theWorkerSealsItAgain()
    expect(theCheck, 'no check is asked for again').toBeUndefined()
    expect(theLinesToTheSecretary()).toHaveLength(before)
  })
})
