// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DELEGATION COLUMN READS A CLAIM AS THE RECORD PAGE READS IT, for a run of each standing.
 *
 * The column reads every claim of a project at once, and a record page reads the claims on one record through
 * `liveClaimsOnRecord`. Each claim lives or ends on where its run stands. So, for a run of each standing, the two
 * readings give the same claims, and the column's row shows who holds the package and whether it is taken.
 *
 * The standing itself has two readers: `howARunStands`, which works it out from the run's stored data, and
 * `whereARunStands`, which adds the run's agent and its sentences to that. Each run here is read by both, and the two
 * give the same standing.
 *
 * The runs are made-up runs of a made-up project. Each one is filed running and claims its own package, and then its
 * stored data is set to the standing it stands for.
 *
 * Mutation: have the column keep a claim whose run was released, refused or confirmed, and the claims differ.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const workspace = 'column-standings'
const headers = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': workspace,
}
const owner = { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }
const at = '2026-11-19 00:00:00'

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const response = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: workspace, title: 'Made-up project' } })
  expect(response.statusCode, response.body).toBe(201)
}, 60_000)

afterAll(async () => { await app.close(); t.close() })

it('gives the column the claims the record page gives, for a run of each standing', async () => {
  const file = async (kind: string, title: string, data: Record<string, unknown> = {}) => {
    const response = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
    expect(response.statusCode, response.body).toBe(201)
    return (response.json() as { record: { id: string } }).record.id
  }
  const store = (id: string, data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      t.client.sqlite.prepare('UPDATE records SET data = json_set(data, ?, json(?)) WHERE id = ?').run(`$.${key}`, JSON.stringify(value), id)
    }
  }
  const { fileAClaim, liveClaimsForColumn, liveClaimsIn, liveClaimsOnRecord } = await import('../src/server/lib/claims.ts')
  const { delegationColumn } = await import('../src/server/lib/delegation.ts')
  const { whereARunStands } = await import('../src/server/lib/inspection.ts')
  const { getRecord } = await import('../src/server/lib/records.ts')
  const { howARunStands } = await import('../src/shared/releasing.ts')

  const parent = await file('task', 'Made-up parent')
  const module = await file('module', 'Made-up module', { context: 'Made-up work.' })
  const requirements = await app.inject({ method: 'POST', url: `/api/records/${module}/requirements`, headers, payload: { items: [] } })
  expect(requirements.statusCode, requirements.body).toBe(200)

  const release = { by: owner, how: 'its starter', at }
  const cases = [
    { name: 'working', data: {}, standing: 'working', live: true },
    { name: 'inspecting', data: { state: 'finished' }, standing: 'inspecting', live: true },
    { name: 'ended', data: { state: 'crashed' }, standing: 'working', live: false },
    { name: 'released', data: { state: 'finished', released: release }, standing: 'reporting', live: false },
    { name: 'refused', data: { state: 'finished', refused: { by: owner, at, missing: [] } }, standing: 'rebuttal', live: false },
    { name: 'confirmed', data: { state: 'finished', released: release, confirmed: { by: owner, at, because: 'Made-up confirmation.' } }, standing: 'closed', live: false },
  ] as const

  const made: { name: string; task: string; run: string; standing: string; live: boolean }[] = []
  for (const [i, one] of cases.entries()) {
    const point = await file('backlog_item', `Made-up point for the ${one.name} run`, {
      line: 'example', number: String(i), placedBy: owner, why: 'Made-up point.', doneWhen: 'Made-up completion.', state: 'todo',
    })
    const task = await file('task', `Made-up brief for the ${one.name} run`)
    const packaged = await app.inject({ method: 'POST', url: `/api/delegation/${task}/package`, headers, payload: {
      forTheOutside: 'Made-up work.', acceptance: 'Made-up completion.', parent: { kind: 'task', id: parent }, pointIds: [point], moduleIds: [module],
    } })
    expect(packaged.statusCode, packaged.body).toBe(201)
    const run = await file('session', `Made-up ${one.name} run`, { state: 'running' })
    fileAClaim({ workspaceId: workspace, claimant: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, run,
      things: [{ what: 'record', id: task }] }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    made.push({ name: one.name, task, run, standing: one.standing, live: one.live })
  }
  for (const [i, one] of cases.entries()) store(made[i]!.run, one.data)

  const column = liveClaimsForColumn(workspace)
  expect(column).toEqual(liveClaimsIn(workspace))
  const rows = delegationColumn(workspace, true).rows
  expect(rows).toHaveLength(cases.length)
  for (const one of made) {
    const run = getRecord(one.run)
    expect(run, one.name).not.toBeNull()
    expect(howARunStands(run!.data).standing, one.name).toBe(one.standing)
    expect(whereARunStands(run!).standing, one.name).toBe(one.standing)

    const onRecord = liveClaimsOnRecord(one.task, workspace)
    expect(onRecord.length > 0, one.name).toBe(one.live)
    const onTheColumn = column.filter((claim) => claim.things.some((thing) => thing.what === 'record' && thing.id === one.task))
    expect(onTheColumn, one.name).toEqual(onRecord)

    const row = rows.find((candidate) => candidate.recordId === one.task)
    expect(row, one.name).toBeDefined()
    expect(row!.heldBy, one.name).toEqual(onRecord[0]?.claimant ?? null)
    expect(row!.state, one.name).toBe(one.live ? 'taken' : 'to_do')
  }
}, 60_000)
