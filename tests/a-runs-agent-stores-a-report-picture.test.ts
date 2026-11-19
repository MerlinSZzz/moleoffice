// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A run's agent can use the store the report reminder names. Mutation: refuse agents at POST /api/report-files. */
import { randomBytes, createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64')
const OFFICE_KEY = randomBytes(32).toString('hex')
const PERSON_KEY = randomBytes(32).toString('hex')
const PROJECT = 'picture-project'
const HANDLE = 'picture-supervisor'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let t: TestDb
let app: FastifyInstance
let previousRoots: string | undefined

beforeAll(async () => {
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: PERSON_KEY, office: OFFICE_KEY, providers: {} }), { mode: 0o600 })
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = dirname(t.file)
  app = (await apiApp()).app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
})

it('an agent with a live run key stores a PNG in its project and gets its path, name, size and short sha256', async () => {
  const project = await app.inject({ method: 'POST', url: '/api/workspaces', headers: PERSON, payload: { id: PROJECT, title: 'Picture project' } })
  expect(project.statusCode, project.body).toBe(201)
  const headers = { ...PERSON, 'x-mole-office-workspace': PROJECT }
  const registered = await app.inject({
    method: 'POST', url: '/api/agents/started', headers,
    payload: { handle: HANDLE, name: 'Picture supervisor', role: 'supervisor', runtime: 'claude-code' },
  })
  // Do not include a registration or run response in a failing assertion: it can carry a key.
  expect(registered.statusCode).toBe(201)
  const agent = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(HANDLE) as { id: string }
  const filed = await app.inject({
    method: 'POST', url: '/api/records',
    headers: { 'x-mole-office-workspace': PROJECT, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker', 'x-mole-office-key': OFFICE_KEY },
    payload: { kind: 'session', title: 'A run storing its report picture', data: { state: 'running', runtime: 'claude-code', servingAgentId: agent.id, servingAgent: HANDLE, startedByMoleOffice: true } },
  })
  expect(filed.statusCode).toBe(201)
  const run = filed.json() as { record: { id: string }; runKey: { key: string } }
  expect(typeof run.runKey?.key === 'string' && /^[0-9a-f]{64}$/.test(run.runKey.key), 'the run got a key').toBe(true)
  expect(t.client.sqlite.prepare("SELECT count(*) AS n FROM held_keys WHERE id = (SELECT json_extract(data, '$.extra.runKeyId') FROM records WHERE id = ?) AND revoked_at IS NULL").get(run.record.id)).toEqual({ n: 1 })

  const uploaded = await app.inject({
    method: 'POST', url: '/api/report-files',
    headers: { 'x-mole-office-workspace': PROJECT, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': HANDLE, 'x-mole-office-session': run.record.id, 'x-mole-office-key': run.runKey.key },
    payload: { bytes: PNG.toString('base64'), name: 'shot.png' },
  })
  expect(uploaded.statusCode, uploaded.body).toBe(201)
  const file = (uploaded.json() as { file: { path: string; name: string; size: number; hash: string } }).file
  expect(file).toEqual({ path: expect.any(String), name: 'shot.png', size: PNG.length, hash: createHash('sha256').update(PNG).digest('hex').slice(0, 16) })
  expect(file.path.startsWith(join(dirname(t.file), 'report-files') + '/')).toBe(true)
  expect(readFileSync(file.path)).toEqual(PNG)
})
