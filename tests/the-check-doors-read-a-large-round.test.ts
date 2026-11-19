// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO DOORS THAT TAKE THE CHANGES TO CHECK READ A ROUND OF SEVERAL MEGABYTES.
 *
 * POST /api/checks/:run/prompt and POST /api/checks/:run/assembled take the round's whole diff as their body.
 * On the server's default limit of 1 MiB, wave 13q's round 3 (a 1.84 MB diff) was answered 413 "Request body is
 * too large", so no check could read it. THE_CHANGES_TO_CHECK_BODY_LIMIT in src/server/api/inspection.ts gives
 * the two doors 8 MiB.
 *
 * WHAT IS PROVED HERE, over a throwaway database with made-up runs and made-up changes:
 *   1. a prompt request carrying about 2 MiB of changes is answered 200;
 *   2. an assembly request carrying the same is answered 201;
 *   3. a prompt request past 8 MiB is refused with 413;
 *   4. another route keeps the default: a record write past 1 MiB is refused with 413.
 *
 * MUTATION (after a green control, then restored): the prompt door's `bodyLimit` option taken out, so it is back
 * on the default. Case 1 goes red with 413.
 */
import { execFileSync } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const asAgent = (id: string) => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': WORKSPACE })
const MIB = 1024 * 1024
/** The tip the fixture run names. A run meant to be checked records a real commit, as the other inspection fixtures do. */
const fixtureTip = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

let t: TestDb
let app: FastifyInstance
let run = ''

/** Made-up changes to files inside the worker's area, about `bytes` long in all. */
function changesOf(bytes: number): { path: string; changes: string }[] {
  const files = 20
  const line = '+ a made-up line of a large synthetic round\n'
  const each = line.repeat(Math.ceil(bytes / files / line.length))
  return Array.from({ length: files }, (_, i) => ({ path: `src/server/lib/synthetic-${String(i)}.ts`, changes: each }))
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-large', name: 'Builder Large', role: 'worker', workArea: ['src/server/lib'] })
  run = historicalSession(t, {
    workspaceId: WORKSPACE, kind: 'session', title: 'A made-up round with a large diff', actor: { type: 'agent', id: 'builder-large' },
    data: { state: 'finished', servingAgent: 'builder-large', cutFrom: 'main', tip: fixtureTip, doing: 'a large round' },
  }).id
})

afterAll(async () => {
  await app.close()
  t.close()
})

it('reads a prompt request carrying about 2 MiB of changes', async () => {
  const payload = JSON.stringify({ changes: changesOf(2 * MIB) })
  expect(payload.length).toBeGreaterThan(2 * MIB)
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: { ...asAgent('inspector-one'), 'content-type': 'application/json' }, payload })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
})

it('reads an assembly request carrying about 2 MiB of changes', async () => {
  const payload = JSON.stringify({ changes: changesOf(2 * MIB) })
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: { ...asAgent('inspector-one'), 'content-type': 'application/json' }, payload })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(201)
})

it('refuses a prompt request past 8 MiB with 413', async () => {
  const payload = JSON.stringify({ changes: changesOf(8 * MIB + 64 * 1024) })
  expect(payload.length).toBeGreaterThan(8 * MIB)
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: { ...asAgent('inspector-one'), 'content-type': 'application/json' }, payload })
  expect(reply.statusCode).toBe(413)
})

it('keeps every other route at its own limit: a record write past 1 MiB is refused with 413', async () => {
  const payload = JSON.stringify({ kind: 'note', title: 'A made-up note that is too large', data: { body: 'x'.repeat(MIB + 1024) } })
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: { ...AS_THE_PERSON, 'content-type': 'application/json' }, payload })
  expect(reply.statusCode).toBe(413)
})
