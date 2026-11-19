// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECEIPTS DOOR ANSWERS THE RECEIPTS ALONE.
 *
 * `GET /api/usage/agents` carries what the runs' usage receipts say over a window, under `receipts`,
 * after every arrival of every agent in that window. A reader who wants only the receipts, by tool,
 * by model or by agent, had to take the arrivals too. `GET /api/usage/receipts?days=N` answers the
 * receipts alone, from the same `receiptUsage`, so no second summation exists.
 *
 * WHAT IS PROVED:
 *   1. its receipts are the ones GET /api/usage/agents answers for the same days, and it carries
 *      nothing but the window, the receipts and the `narrowedByPermission` every reply carries;
 *   2. `days` decides which runs are read: a run filed three days ago is counted in a week and not
 *      in a day;
 *   3. a `days` that is not a whole number from 1 up to the traced window, and any other word in the
 *      query, is refused with a 400 that names it.
 *
 * The run is a fixture this file files, with a receipt this file makes up.
 *
 * MUTATIONS, in the commit message.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { ReceiptUsage } from '../src/shared/usage-receipts.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'

const DAY = 24 * 60 * 60 * 1000
const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let run: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  run = historicalSession(t, {
    workspaceId: 'default',
    actor: { type: 'agent', id: 'receipts-door-test' },
    kind: 'session',
    title: 'A fixture run with a made-up receipt',
    data: {
      state: 'finished', servingAgent: 'receipts-agent', model: 'model-one', runtime: 'claude-code', adaptedTool: 'claude-code',
      usageReceipt: { runtime: 'claude-code', model: 'model-one', inputTokens: 100, cachedInputTokens: 20, cacheCreationInputTokens: 10, outputTokens: 50, inputIncludesCached: false },
    },
  }).id
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

async function get(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url, headers: AS_THE_OWNER })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** Every run id the receipts name, by the tool each run declared. */
function runsIn(body: Record<string, unknown>): string[] {
  return (body['receipts'] as ReceiptUsage).byRuntime.flatMap((row) => row.runs)
}

it('answers the receipts GET /api/usage/agents answers for the same days, and nothing else', async () => {
  const agents = await get('/api/usage/agents?days=7')
  const alone = await get('/api/usage/receipts?days=7')
  expect([agents.status, alone.status], JSON.stringify(alone.body)).toEqual([200, 200])

  expect(alone.body['receipts']).toEqual(agents.body['receipts'])
  // The reply hook in src/server/lib/http.ts adds narrowedByPermission to every successful object reply.
  expect(Object.keys(alone.body).sort()).toEqual(['narrowedByPermission', 'receipts', 'window'])
  expect(alone.body['narrowedByPermission']).toBeNull()
  expect(alone.body['window']).toMatchObject({ days: 7 })
  const byTool = (alone.body['receipts'] as ReceiptUsage).byRuntime.find((row) => row.name === 'claude-code')
  expect(byTool?.runs).toContain(run)
  // Input without the cache counts, so the summation adds both cache counts to it: 100 + 20 + 10.
  expect(byTool?.values).toMatchObject({ inputTokens: 130, outputTokens: 50 })
})

it('reads the runs filed inside the days asked for', async () => {
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(localStamp(new Date(Date.now() - 3 * DAY)), run)

  const day = await get('/api/usage/receipts?days=1')
  const week = await get('/api/usage/receipts?days=7')

  expect([day.status, week.status]).toEqual([200, 200])
  expect(runsIn(day.body)).not.toContain(run)
  expect(runsIn(week.body)).toContain(run)
})

it.each([
  ['days=0', 'days'],
  ['days=181', 'days'],
  ['days=a-week', 'days'],
  ['days=7&tool=claude-code', 'tool'],
])('refuses the query %s and names %s', async (query, named) => {
  const { status, body } = await get(`/api/usage/receipts?${query}`)
  expect(status, JSON.stringify(body)).toBe(400)
  expect(String(body['error'])).toContain(named)
})
