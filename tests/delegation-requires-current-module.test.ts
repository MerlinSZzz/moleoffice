// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let db: TestDb
let app: FastifyInstance
let person: Record<string, string>
let secretary: Record<string, string>
const outside = { forTheOutside: 'A made-up task.', suits: 'desk_work', acceptance: 'The made-up task is done.', acceptanceSource: { file: 'made-up', criterion: 'made-up', commit: 'made-up' } }
const inside = { forTheOutside: 'A made-up task.', acceptance: 'The made-up task is done.' }

async function call(method: 'GET' | 'POST', url: string, payload?: object, headers = person) {
  const result = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: result.statusCode, body: result.json() as Record<string, any>, raw: result.body }
}
async function file(kind: string, title: string, data: object = {}) {
  const result = await call('POST', '/api/records', { kind, title: `Made-up ${title}`, data })
  expect(result.status, result.raw).toBe(201)
  return String(result.body.record.id)
}
const module = () => file('module', 'chat module', { context: 'Made-up chat.', parts: [] })
const task = () => file('task', 'delegation')
const decision = () => file('decision', 'parent decision', { replaces: [] })
const point = () => file('backlog_item', 'work point', { line: 'made-up-line', number: 'made-up', why: 'A made-up test.', doneWhen: 'Done.', state: 'todo' })
const update = (id: string, text = 'A made-up requirement.') => call('POST', `/api/records/${id}/requirements`, { items: [{ id: 'made-up-line', text, state: 'todo' }] }, secretary)
const packageIt = (id: string, payload: object) => call('POST', `/api/delegation/${id}/package`, payload)
function snapshot() {
  const records = db.client.sqlite.prepare('SELECT id, kind, data, updated_at FROM records ORDER BY id').all()
  const changes = db.client.sqlite.prepare('SELECT * FROM changes ORDER BY append_order').all()
  const links = db.client.sqlite.prepare('SELECT * FROM links ORDER BY id').all()
  return JSON.stringify({ records, changes, links })
}

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
  const made = await call('POST', '/api/agents/started', { handle: 'made-up-secretary', name: 'Made-up secretary', role: 'secretary' })
  expect(made.status, made.raw).toBe(201)
  secretary = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-secretary', 'x-mole-office-key': String(made.body.whatToGiveIt.key) }
}, 120_000)
afterAll(async () => { await app?.close(); db?.close() })

describe('a package follows its module requirements', () => {
  it('refuses absent or empty moduleIds with no writes', async () => {
    const id = await task()
    const before = snapshot()
    for (const fields of [{}, { moduleIds: [] }]) {
      const refused = await packageIt(id, { ...outside, ...fields })
      expect(refused.status, refused.raw).toBe(400)
      const { A_PACKAGE_NEEDS_A_MODULE } = await import('../src/server/lib/module-requirements.ts')
      expect(refused.body.error).toContain(A_PACKAGE_NEEDS_A_MODULE)
      expect(snapshot()).toBe(before)
    }
  })

  it('refuses older requirements, accepts the same package after an update, and applies the rule on replacement', async () => {
    const id = await task()
    const moduleId = await module()
    expect((await update(moduleId)).status).toBe(200)
    const parent = await decision()
    const item = await point()
    const body = { ...inside, parent: { kind: 'decision', id: parent }, pointIds: [item], moduleIds: [moduleId] }
    const before = snapshot()
    const stale = await packageIt(id, body)
    expect(stale.status, stale.raw).toBe(400)
    const { UPDATE_MODULE_REQUIREMENTS_FIRST } = await import('../src/server/lib/module-requirements.ts')
    expect(stale.body.error).toContain(UPDATE_MODULE_REQUIREMENTS_FIRST)
    expect(stale.body.error).toContain(`/api/records/${moduleId}/requirements`)
    expect(snapshot()).toBe(before)
    expect((await update(moduleId, 'A changed made-up requirement.')).status).toBe(200)
    const first = await packageIt(id, body)
    expect(first.status, first.raw).toBe(201)
    const later = await decision()
    const replacement = { ...body, parent: { kind: 'decision', id: later } }
    const beforeReplacement = snapshot()
    const refused = await packageIt(id, replacement)
    expect(refused.status, refused.raw).toBe(400)
    expect(snapshot()).toBe(beforeReplacement)
    expect((await update(moduleId, 'A third made-up requirement.')).status).toBe(200)
    const accepted = await packageIt(id, replacement)
    expect(accepted.status, accepted.raw).toBe(201)
    expect(accepted.body.replacedBundleId).toBe(first.body.bundle.id)
  })

  it('uses the nearest decision through a task parent, and requires an update even with no decision', async () => {
    const moduleId = await module()
    const parent = await decision()
    const item = await point()
    const parentTask = await task()
    expect((await update(moduleId)).status).toBe(200)
    const made = await packageIt(parentTask, { ...inside, parent: { kind: 'decision', id: parent }, pointIds: [item], moduleIds: [moduleId] })
    expect(made.status, made.raw).toBe(201)
    const child = await task()
    const childPackage = await packageIt(child, { ...inside, parent: { kind: 'task', id: parentTask }, pointIds: [item], moduleIds: [moduleId] })
    expect(childPackage.status, childPackage.raw).toBe(201)
    const neverUpdated = await module()
    const outsideTask = await task()
    const before = snapshot()
    const refused = await packageIt(outsideTask, { ...outside, moduleIds: [neverUpdated] })
    expect(refused.status, refused.raw).toBe(400)
    expect(snapshot()).toBe(before)
    expect((await update(neverUpdated)).status).toBe(200)
    expect((await packageIt(outsideTask, { ...outside, moduleIds: [neverUpdated] })).status).toBe(201)
  })
})
