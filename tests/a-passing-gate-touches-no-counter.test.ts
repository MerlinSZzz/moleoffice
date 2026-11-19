// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Native SQLite tracing observes three real doors in a fresh made-up office. No worker starts. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aWorktreeOfItsOwn } from './a-worktree-of-its-own.ts'
const observed = vi.hoisted(() => ({capturing: false, statements: [] as string[]}))
vi.mock('better-sqlite3', async importOriginal => {
  const actual = await importOriginal<{default: typeof import('better-sqlite3')}>()
  return {default: new Proxy(actual.default, {construct(target, args) {
    const options = args[1] as {verbose?: (statement: string) => void} | undefined
    return Reflect.construct(target, [args[0], {...options, verbose(statement: string) {
      if (observed.capturing) observed.statements.push(statement)
      options?.verbose?.(statement)
    }}])
  }})}
})
let t: TestDb, app: FastifyInstance, home: string
const person = {type: 'human', id: THE_TEST_OFFICES_OWNER.id} as const
const headers = {'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': person.id}
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'passing-gate-'))
  vi.stubEnv('HOME', home)
  t = await freshDb(); app = (await apiApp()).app; await app.ready()
})
afterEach(async () => { observed.capturing = false; await app?.close(); t?.close(); vi.unstubAllEnvs(); rmSync(home, {recursive: true, force: true}) })
async function watching<T>(work: () => Promise<T> | T) {
  observed.statements = []; observed.capturing = true
  try { const answer = await work(); return {answer, all: observed.statements.length, counters: observed.statements.filter(sql => /\bgate_counts\b/i.test(sql))} }
  finally { observed.capturing = false }
}
async function agent(handle: string) {
  const made = await app.inject({method: 'POST', url: '/api/agents/started', headers, payload: {handle, name: 'Made-up SQL observer participant', role: 'supervisor', runtime: 'claude-code', workArea: ['src']}})
  expect(made.statusCode, made.body).toBe(201)
  const id = made.json().agent.id as string
  const {makeAnAgentKey} = await import('../src/server/lib/keys.ts')
  return {id, headers: {...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-key': makeAnAgentKey(id, null)}}
}
it('runs no counter SQL for a doing-line PATCH, a territory with no overlap, or an ordinary held message', async () => {
  const {gateMet} = await import('../src/server/lib/gate-counts.ts')
  const positive = await watching(() => gateMet('house-rule-reds', 'block'))
  expect(positive.counters.length, 'the native tracer must see a real counter upsert').toBeGreaterThan(0)
  const one = await agent('made-up-sql-one'), other = await agent('made-up-sql-other')
  const run = (id: string, territory: string[]) => t.api.createRecord({kind: 'session', workspaceId: 'default', title: 'Made-up run for SQL observation', actor: {type: 'agent', id, provedBy: 'an-agent-key', keyHolder: id}, data: {state: 'running', runtime: 'claude-code', servingAgentId: id, ...aWorktreeOfItsOwn(home), territory}}).id
  const id = run(one.id, []); run(other.id, ['src/shared/'])
  const doing = await watching(() => app.inject({method: 'PATCH', url: `/api/records/${id}`, headers: one.headers, payload: {dataPatch: {doing: 'Made-up doing line for a passing gate.'}}}))
  expect(doing.answer.statusCode, doing.answer.body).toBe(200)
  expect(doing.all).toBeGreaterThan(0)
  expect(doing.counters).toEqual([])
  const territory = await watching(() => app.inject({method: 'PATCH', url: `/api/records/${id}`, headers: one.headers, payload: {dataPatch: {territory: ['src/server/']}}}))
  expect(territory.answer.statusCode, territory.answer.body).toBe(200)
  expect(territory.answer.json().territoryOverlaps).toEqual({compared: true, overlaps: []})
  expect(territory.all).toBeGreaterThan(0)
  expect(territory.counters).toEqual([])
  const message = t.api.createRecord({kind: 'message', workspaceId: 'default', title: 'Made-up ordinary held message', actor: person, data: {body: 'Made-up waiting unrelated to a check.', to: [{kind: 'agent', id: one.id}]}}).id
  const held = await watching(() => app.inject({method: 'POST', url: `/api/worker/messages/${message}/held`, headers: {...headers, ...theOfficesKeyHeader(), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker'}, payload: {to: {kind: 'agent', id: one.id}, because: 'Made-up ordinary hold.'}}))
  expect(held.answer.statusCode, held.answer.body).toBe(200)
  expect(held.answer.json().secretary).toBeNull()
  expect(held.all).toBeGreaterThan(0)
  expect(held.counters).toEqual([])
})
