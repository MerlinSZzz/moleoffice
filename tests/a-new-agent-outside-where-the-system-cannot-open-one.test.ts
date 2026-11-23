// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW AGENT TO OPEN OUTSIDE, ON A SYSTEM THAT CANNOT OPEN A TERMINAL OUTSIDE. POST /api/agents/new
 * (src/server/api/new-agent.ts).
 *
 * The system's own answer is replaced: whyThisSystemCannotOpenATerminalOutside (src/server/lib/a-terminal-outside.ts)
 * says a made-up reason, as it does on a system the office does not open a terminal on. No terminal is opened and no
 * process is started. The office is a fresh test office with one Casting row of the worker card, for every project.
 *
 *   1. The new agent is refused 501 before anything is made. The answer gives the system's reason, and says that
 *      nothing was made. No agent record is written, and nothing in the answer says a terminal opened.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const THE_SYSTEMS_REASON = 'this made-up system has no terminal the office knows how to open'

vi.mock('../src/server/lib/a-terminal-outside.ts', async (original) => ({
  ...await original<typeof import('../src/server/lib/a-terminal-outside.ts')>(),
  whyThisSystemCannotOpenATerminalOutside: () => THE_SYSTEMS_REASON,
}))

const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance

async function call(method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) {
  return app.inject({ method, url, headers: PERSON, ...(payload === undefined ? {} : { payload: payload as never }) })
}

function theAgentCount(): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'agent' AND deleted_at IS NULL").get() as { n: number }).n
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // EVERY WORKER ROW THE NEW OFFICE HOLDS IS REMOVED, the marked row of each scope last, and one is added.
  const table = await call('GET', '/api/casting')
  expect(table.statusCode, table.body).toBe(200)
  const roles = (table.json() as { roles: { role: string; scopes: { castings: { id: number; marked: boolean }[] }[] }[] }).roles
  for (const scope of roles.find((one) => one.role === 'worker')?.scopes ?? []) {
    for (const row of [...scope.castings].sort((one, other) => Number(one.marked) - Number(other.marked))) {
      const removed = await call('DELETE', `/api/casting/rows/${String(row.id)}`)
      expect(removed.statusCode, removed.body).toBe(200)
    }
  }
  const added = await call('POST', '/api/casting/worker', { program: { value: 'claude-code' }, model: { value: 'claude-opus-5-5' }, effort: { value: 'high' } })
  expect(added.statusCode, added.body).toBe(201)
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a new agent to open outside, where the system cannot open a terminal outside', () => {
  it('1: is refused 501 before anything is made, and the answer gives the reason and says nothing opened', async () => {
    const agents = theAgentCount()
    const refused = await call('POST', '/api/agents/new', { name: 'nowhere-heron', opensIn: 'outside' })
    expect(refused.statusCode, refused.body).toBe(501)
    const error = String((refused.json() as { error?: unknown }).error)
    expect(error).toContain(THE_SYSTEMS_REASON)
    expect(error).toContain('Nothing was made.')
    expect(refused.body).not.toMatch(/"opened":true/)
    expect(theAgentCount()).toBe(agents)
    expect(t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'agent' AND json_extract(data, '$.handle') = ?").get('nowhere-heron')).toEqual({ n: 0 })
  })
})
