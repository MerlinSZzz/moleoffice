// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A made-up project checks that adding packages does not add a statement per row. */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const workspace = 'column-batches'
const headers = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': workspace,
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const response = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: workspace, title: 'Made-up project' } })
  expect(response.statusCode, response.body).toBe(201)
}, 60_000)

afterAll(async () => { await app.close(); t.close() })

it('reads each column with the same number of statements for two and eight packages', async () => {
  const file = async (kind: string, title: string, data: Record<string, unknown> = {}) => {
    const response = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
    expect(response.statusCode, response.body).toBe(201)
    return (response.json() as { record: { id: string } }).record.id
  }
  const parent = await file('task', 'Made-up parent')
  const module = await file('module', 'Made-up module', { context: 'Made-up work.' })
  const { fileAClaim } = await import('../src/server/lib/claims.ts')
  const requirements = await app.inject({ method: 'POST', url: `/api/records/${module}/requirements`, headers, payload: { items: [] } })
  expect(requirements.statusCode, requirements.body).toBe(200)
  const add = async (n: number) => {
    for (let i = 0; i < n; i++) {
      const point = await file('backlog_item', 'Made-up point', {
        line: 'example', number: String(i), placedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
        why: 'Made-up point.', doneWhen: 'Made-up completion.', state: 'todo',
      })
      const task = await file('task', 'Made-up brief')
      const response = await app.inject({ method: 'POST', url: `/api/delegation/${task}/package`, headers, payload: {
        forTheOutside: 'Made-up work.', acceptance: 'Made-up completion.', parent: { kind: 'task', id: parent }, pointIds: [point], moduleIds: [module],
      } })
      expect(response.statusCode, response.body).toBe(201)
      const taken = await app.inject({ method: 'POST', url: `/api/delegation/${task}/take-inside`, headers, payload: {} })
      expect(taken.statusCode, taken.body).toBe(201)
      const run = await file('session', 'Made-up run', { state: 'running' })
      fileAClaim({ workspaceId: workspace, claimant: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, run,
        things: [{ what: 'record', id: task }] }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    }
  }
  const { delegationColumn, delegationProgressColumn } = await import('../src/server/lib/delegation.ts')
  type Run = (this: { source: string }, ...params: unknown[]) => unknown
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, Run>
  const count = (read: () => unknown) => {
    let statements = 0
    const original = new Map<string, Run>()
    for (const method of ['all', 'get', 'iterate', 'run']) {
      const call = prototype[method]!
      original.set(method, call)
      prototype[method] = function (...params: unknown[]) { statements++; return call.apply(this, params) }
    }
    try { read() } finally { for (const [method, call] of original) prototype[method] = call }
    return statements
  }
  const reads = [
    () => delegationProgressColumn(workspace),
    () => delegationColumn(workspace, true),
    () => delegationColumn(workspace, true, true),
  ]
  await add(2)
  expect(delegationColumn(workspace, true).rows).toHaveLength(2)
  expect(delegationColumn(workspace, true, true).rows).toHaveLength(2)
  expect(delegationColumn(workspace, true).rows.every((row) => row.heldBy !== null)).toBe(true)
  const small = reads.map(count)
  await add(6)
  expect(delegationColumn(workspace, true).rows).toHaveLength(8)
  expect(delegationColumn(workspace, true, true).rows).toHaveLength(8)
  expect(delegationColumn(workspace, true).rows.every((row) => row.heldBy !== null)).toBe(true)
  expect(reads.map(count)).toEqual(small)
}, 60_000)
