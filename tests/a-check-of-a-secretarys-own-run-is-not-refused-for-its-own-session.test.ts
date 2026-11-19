// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK OF A SECRETARY'S OWN RUN IS NOT REFUSED FOR WRITING ON ITS OWN SESSION.
 *
 * Problem SnD9A9nXHpT4. A secretary filed a check session for the inspector, to check the secretary's own run.
 * The inspector wrote on its own check session as it worked, and its release was refused with 403: "the
 * inspector changed the work it was checking. It changed 1 record the run it is checking wrote", naming the
 * check session. The verdict door counted every record the run's agent created as the run's work. The secretary
 * created both the run's work and the check session, so the check session was counted too.
 *
 * Now the door tells the two apart by what the record is. A session that serves the inspector, and in which a
 * check of this run was assembled, is a check of this run. It is not the run's work. Who created it does not
 * matter.
 *
 * WHAT THIS FILE MEASURES, against a real database and the real doors:
 *   (a) the case in the problem: the inspector writes on the check session the secretary filed for it, and its
 *       release is written (201);
 *   (b) the inspector changes a record the secretary's run really wrote: the release is still refused (403), and
 *       the refusal names that record and not the check session;
 *   (c) the inspector changes another session the secretary filed for it, in which no check of this run was
 *       assembled: that is still counted as the run's work and refused (403).
 *
 * MUTATION PROOFS, each after a green control, are in the commit message that meets this file:
 *   - the check sessions not left out in `whatTheInspectorChanged`: (a) goes red;
 *   - `whatTheInspectorChanged` made to answer nothing: (b) and (c) go red;
 *   - a session read as a check of this run without an assembly of this run in it: (c) goes red.
 *
 * Every record here is synthetic, in a fresh database. Nothing reaches the live office.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const WORKSPACE = 'default'
const SECRETARY = 'cs-secretary'
const INSPECTOR = 'cs-inspector'
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

async function register(payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A record the secretary files, through the real record door. */
async function theSecretaryFiles(payload: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(SECRETARY), payload })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

/** The secretary's own run, finished, with nothing sealed: the run under check. */
async function theSecretarysOwnRun(title: string): Promise<string> {
  const run = await theSecretaryFiles({
    kind: 'session',
    title,
    data: { state: 'running', servingAgent: SECRETARY, workingDirectory: process.cwd(), doing: 'Test: the work under check' },
  })
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(run)
  return run
}

/** A session the secretary files for the inspector, as tools/register-a-run.mjs --handle <inspector> does. */
function aSessionForTheInspector(title: string): Promise<string> {
  return theSecretaryFiles({ kind: 'session', title, data: { state: 'running', servingAgent: INSPECTOR, doing: 'Test: checking' } })
}

/** The check of `run` begins: the inspector assembles it under the check's own session. */
async function assemble(run: string, check: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent(INSPECTOR, check), payload: { changes: [] } })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** The inspector writes on a record, under the check's own session: a session's doing line, or a note's body. */
async function theInspectorWritesOn(record: string, check: string, field: 'doing' | 'body' = 'doing'): Promise<void> {
  const reply = await app.inject({
    method: 'PATCH',
    url: `/api/records/${record}`,
    headers: asAgent(INSPECTOR, check),
    payload: { dataPatch: { [field]: 'Test: the inspector wrote this line' } },
  })
  expect(reply.statusCode, reply.body).toBe(200)
}

function release(run: string, check: string) {
  return app.inject({
    method: 'POST',
    url: `/api/checks/${run}`,
    headers: asAgent(INSPECTOR, check),
    payload: { verdict: 'released', check: 'Test: read the run. Nothing is missing.', chaptersRead: [] },
  })
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register({ handle: SECRETARY, name: 'Synthetic secretary', role: 'secretary' })
  await register({ handle: INSPECTOR, name: 'Synthetic inspector', role: 'inspector' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe("a check of a secretary's own run, on a check session the secretary filed", () => {
  it('(a) is released when the inspector wrote only on its own check session', async () => {
    const run = await theSecretarysOwnRun("Test: a secretary's own run")
    const check = await aSessionForTheInspector('Test: the check of that run')
    await assemble(run, check)
    await theInspectorWritesOn(check, check)

    const released = await release(run, check)
    expect(released.statusCode, released.body).toBe(201)
    expect((released.json() as { verdict: string }).verdict).toBe('released')
  })

  it('(b) is still refused when the inspector changed a record the run really wrote', async () => {
    const run = await theSecretarysOwnRun("Test: a secretary's run whose note was changed")
    const note = await theSecretaryFiles({ kind: 'note', title: 'Test: a note the run wrote', data: { body: 'Test: what the run wrote' } })
    const check = await aSessionForTheInspector('Test: the check that changed a note')
    await assemble(run, check)
    await theInspectorWritesOn(check, check)
    await theInspectorWritesOn(note, check, 'body')

    const refused = await release(run, check)
    expect(refused.statusCode, refused.body).toBe(403)
    const said = String((refused.json() as { error?: unknown }).error ?? refused.body)
    expect(said).toContain('changed the work it was checking')
    expect(said).toContain(note)
    expect(said, 'the check session is not the run\'s work').not.toContain(check)
  })

  it('(c) is still refused when the inspector changed a session of its own in which no check of this run was assembled', async () => {
    const run = await theSecretarysOwnRun("Test: a secretary's run, and another session of the inspector")
    const other = await aSessionForTheInspector('Test: a session of the inspector that checks nothing here')
    const check = await aSessionForTheInspector('Test: the check of this run')
    await assemble(run, check)
    await theInspectorWritesOn(other, check)

    const refused = await release(run, check)
    expect(refused.statusCode, refused.body).toBe(403)
    expect(String((refused.json() as { error?: unknown }).error ?? refused.body)).toContain(other)
  })
})
