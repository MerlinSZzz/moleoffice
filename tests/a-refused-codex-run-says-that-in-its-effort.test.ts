// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSED CODEX RUN'S EFFORT PART SAYS THE RUN IS REFUSED, not that the owner set no effort for an unnamed model.
 *
 * The answer refuses a Codex run answering a message that names no model and has no Casting row to take one from. Its
 * effort part used to say the owner had set no effort for an unnamed model, which is true of a run that could start
 * but not of one that cannot. The refused run now says so there.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED: the answer carries the old unnamed-model sentence and no refusal code. The
 * mutation puts the old sentence back.
 */
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inEnglish, saying } from '../src/shared/dev-sayings.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance
let runModels: typeof import('../src/server/lib/run-models.ts')
let agentId = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  runModels = await import('../src/server/lib/run-models.ts')
  t.client.sqlite.prepare('DELETE FROM casting_rows').run()
  t.client.sqlite.prepare('DELETE FROM run_models').run()
  const handle = `refused-${randomUUID().slice(0, 8)}`
  const made = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle, name: 'Refused Codex', role: THE_WORKER, runtime: 'codex', workArea: ['src'] },
  })
  expect(made.statusCode, made.body).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }
  agentId = row.id
  expect(agentId).toBeTruthy()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a refused Codex run', () => {
  it('says the run is refused in its effort part', () => {
    const read = runModels.theModelARunGets({ place: 'conversation', agentId, runtime: 'codex', project: WORKSPACE }, {})
    expect(read.refused, read.says).toBeTruthy()
    expect(read).toMatchObject({ model: null, effort: null, effortFrom: 'none' })
    const refused = inEnglish(saying('effortTheRunIsRefused', {}))
    const unnamed = inEnglish(saying('effortNoModel', {}))
    expect(read.says).toContain(refused)
    expect(read.says).not.toContain(unnamed)
  })
})
