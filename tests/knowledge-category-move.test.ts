// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { KNOWLEDGE_WORKSPACE } from '../src/shared/knowledge/constants.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let db: TestDb
let app: FastifyInstance
let records: typeof import('../src/server/lib/records.ts')
let knowledgeWrite: typeof import('../src/server/knowledge/guard.ts')['knowledgeWrite']
const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const unique = () => `case-${randomUUID().slice(0, 23)}`
async function ask(method: 'GET' | 'POST', url: string, payload?: unknown, headers = person) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, text: r.body }
}
async function posted(url: string, payload: unknown, headers = person) {
  const r = await ask('POST', url, payload, headers); expect(r.status, r.text).toBe(201); return r.body
}
const category = async (title: string, parent?: string) => (await posted('/api/knowledge/categories', { title, ...(parent ? { parent } : {}) })).category
const entry = async (category: string) => (await posted('/api/knowledge/entries', { title: 'A procedure', category, opening: 'Begin here', body: 'Continue here', language: 'en', resources: [], sources: [{ url: 'https://example.invalid/source' }], aliases: [], reason: 'A source' })).entry
const path = (...categories: { id: string; title: string }[]) => categories.map(({ id, title }) => ({ id, title }))
const move = (id: string, parent: string | null, reason = 'A better place', headers = person) => ask('POST', `/api/knowledge/categories/${id}/move`, { parent, reason }, headers)
beforeAll(async () => {
  db = await freshDb(); app = (await apiApp()).app; await app.ready()
  records = await import('../src/server/lib/records.ts')
  knowledgeWrite = (await import('../src/server/knowledge/guard.ts')).knowledgeWrite
}, 60_000)
afterAll(async () => { await app.close(); db.close() })

it('moves a branch, retaining its records and changing its paths and category queries', async () => {
  const old = await category('Old'), dest = await category('Destination'), branch = await category('Branch', old.id), child = await category('Child', branch.id)
  const e = await entry(child.id)
  const result = await move(branch.id, dest.id)
  expect(result.status, result.text).toBe(200); expect(result.body.path).toEqual(path(dest, branch))
  const readChild = await ask('GET', `/api/knowledge/categories/${child.id}`)
  expect(readChild.body.path).toEqual(path(dest, branch, child)); expect(readChild.body.entries).toEqual(expect.arrayContaining([expect.objectContaining({ id: e.id, title: e.title })]))
  expect((await ask('GET', `/api/knowledge/entries/${e.id}`)).body.path).toEqual(path(dest, branch, child))
  expect((await ask('GET', `/api/knowledge/categories/${old.id}`)).body.subcategories).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: branch.id })]))
  expect((await ask('GET', `/api/knowledge/categories/${dest.id}`)).body.subcategories).toEqual(expect.arrayContaining([expect.objectContaining({ id: branch.id })]))
  const history = db.client.sqlite.prepare('SELECT note FROM revisions WHERE record_id = ?').all(branch.id) as { note: string }[]
  expect(history.map(row => row.note)).toContain('A better place')
  expect((await ask('GET', `/api/knowledge/query/categories?ids=${old.id}`)).body.entries.map((row: { id: string }) => row.id)).not.toContain(e.id)
  expect((await ask('GET', `/api/knowledge/query/categories?ids=${dest.id}`)).body.entries.map((row: { id: string }) => row.id)).toContain(e.id)
  expect((await move(branch.id, null)).body.path).toEqual(path(branch))
  expect((await ask('GET', '/api/knowledge/categories')).body.categories).toEqual(expect.arrayContaining([expect.objectContaining({ id: branch.id })]))
})

it('refuses all invalid moves without changing the category or its history', async () => {
  const root = await category('Root'), branch = await category('Branch', root.id), child = await category('Child', branch.id), grandchild = await category('Grandchild', child.id)
  const projectRecord = (await posted('/api/records', { kind: 'note', title: unique(), data: { body: 'Project record' } })).record
  const snapshot = () => ({ record: records.getRecord(branch.id), changes: db.client.sqlite.prepare('SELECT * FROM changes WHERE record_id = ? ORDER BY rowid').all(branch.id) })
  const before = snapshot()
  for (const [id, parent, why, status] of [[projectRecord.id, null, 'reason', 404], [branch.id, projectRecord.id, 'reason', 404], [branch.id, branch.id, 'reason', 400], [branch.id, grandchild.id, 'reason', 400], [branch.id, null, '  ', 400], [branch.id, root.id, 'reason', 400]] as const) {
    const result = await move(id, parent, why); expect(result.status, result.text).toBe(status); expect(snapshot()).toEqual(before)
  }
  const missing = await ask('POST', `/api/knowledge/categories/${branch.id}/move`, { parent: null })
  expect(missing.status).toBe(400); expect(snapshot()).toEqual(before)
  const extra = await ask('POST', `/api/knowledge/categories/${branch.id}/move`, { parent: null, reason: 'reason', extra: true })
  expect(extra.status).toBe(400); expect(snapshot()).toEqual(before)
})

it('allows the person and an agent with its own key, and refuses other callers', async () => {
  const handle = unique(), started = await posted('/api/agents/started', { handle, name: handle, role: 'worker' })
  const agent = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': started.whatToGiveIt.key }
  const root = await category('Root'), branch = await category('Branch', root.id)
  const denied = await move(branch.id, null, 'reason', { 'x-mole-office-actor-type': 'system', 'x-mole-office-actor-id': unique() })
  expect(denied.status).toBe(403)
  expect((await move(branch.id, null, 'reason', agent)).status).toBe(200)
  expect((await move(branch.id, root.id)).status).toBe(200)
})

it('reports direct counts, whole-library totals, paths and ratings', async () => {
  const before = (await ask('GET', '/api/knowledge/categories')).body.totals
  const root = await category('Count root'), child = await category('Count child', root.id), e = await entry(child.id)
  const roots = (await ask('GET', '/api/knowledge/categories')).body
  expect(roots.totals).toEqual({ categories: before.categories + 2, entries: before.entries + 1 })
  expect(roots.tree).toEqual(expect.arrayContaining([expect.objectContaining({ id: root.id, parent: null, subcategoryCount: 1, entryCount: 0 }), expect.objectContaining({ id: child.id, parent: root.id, subcategoryCount: 0, entryCount: 1 })]))
  const read = (await ask('GET', `/api/knowledge/categories/${root.id}`)).body
  expect(read.path).toEqual(path(root)); expect(read.subcategories).toEqual(expect.arrayContaining([expect.objectContaining({ id: child.id, subcategoryCount: 0, entryCount: 1 })]))
  expect((await ask('GET', `/api/knowledge/entries/${e.id}`)).body.ratings).toEqual({ count: 0, average: null })
  knowledgeWrite(() => { for (const score of [2, 4]) records.createRecord({ kind: 'knowledge_rating', title: 'Rating', workspaceId: KNOWLEDGE_WORKSPACE, actor: { type: 'human', id: THE_PERSON }, data: { entry: e.id, score, text: 'Useful', suggestion: 'Add an example', run: unique(), project: unique() } }) })
  const entryRead = (await ask('GET', `/api/knowledge/entries/${e.id}`)).body
  expect(entryRead.path).toEqual(path(root, child)); expect(entryRead.ratings).toEqual({ count: 2, average: 3 })
})
