// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A small office compares progress with the delegation column and counts claim reads. */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const workspace = 'progress-shared-claims'
const headers = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': workspace,
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: workspace, title: 'Progress' } })
  expect(made.statusCode, made.body).toBe(201)
}, 60_000)

afterAll(async () => { await app.close(); t.close() })

it('counts the same briefs as the column while reading claims once for the whole progress request', async () => {
  const file = async (kind: string, title: string, data: Record<string, unknown> = {}) => {
    const response = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
    expect(response.statusCode, response.body).toBe(201)
    return (response.json() as { record: { id: string } }).record.id
  }
  const parent = await file('task', 'Parent')
  const module = await file('module', 'Made-up module', { context: 'A made-up module for a progress test.' })
  const requirements = await app.inject({ method: 'POST', url: `/api/records/${module}/requirements`, headers, payload: { items: [] } })
  expect(requirements.statusCode, requirements.body).toBe(200)
  for (const name of ['First', 'Second']) {
    const point = await file('backlog_item', `${name} point`, {
      line: 'example', number: name, placedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      why: 'Made-up point.', doneWhen: 'Made-up completion.', state: 'todo',
    })
    const task = await file('task', `${name} brief`)
    const packaged = await app.inject({ method: 'POST', url: `/api/delegation/${task}/package`, headers, payload: {
      forTheOutside: 'Made-up work.', acceptance: 'Made-up completion.', parent: { kind: 'task', id: parent }, pointIds: [point], moduleIds: [module],
    } })
    expect(packaged.statusCode, packaged.body).toBe(201)
  }
  const { delegationColumn } = await import('../src/server/lib/delegation.ts')
  const expected = delegationColumn(workspace, true)
  expect(expected.rows).toHaveLength(2)

  type Run = (this: { source: string }, ...params: unknown[]) => unknown
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, Run>
  const original = new Map<string, Run>()
  const claimReads: string[] = []
  for (const method of ['all', 'get', 'iterate']) {
    const call = prototype[method]!
    original.set(method, call)
    prototype[method] = function (...params: unknown[]) {
      if (/\bfrom\s+["`]?work_claims["`]?/i.test(this.source)) claimReads.push(this.source)
      return call.apply(this, params)
    }
  }
  let response: Awaited<ReturnType<typeof app.inject>>
  try {
    response = await app.inject({ method: 'GET', url: '/api/backlog/progress', headers })
  } finally {
    for (const [method, call] of original) prototype[method] = call
  }
  expect(response.statusCode, response.body).toBe(200)
  const body = response.json() as { briefs: Record<string, number>; couldNotRead: unknown[] }
  expect(body.briefs.total).toBe(expected.rows.length)
  expect(body.briefs.waiting).toBe(expected.rows.filter((row) => row.state === 'to_do').length)
  expect(body.briefs.checkedRefused).toBe(expected.rows.filter((row) => row.inside?.check === 'refused').length)
  expect(body.couldNotRead).toEqual(expected.couldNotRead)
  expect(claimReads, 'one live-claims reading serves both briefs').toHaveLength(1)
})
