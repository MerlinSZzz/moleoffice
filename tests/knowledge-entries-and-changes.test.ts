// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { KNOWLEDGE_KINDS } from '../src/shared/knowledge/constants.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let db: TestDb
let app: FastifyInstance
const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const unique = () => `case-${randomUUID().slice(0, 23)}`
const agents = new Map<string, { id: string; key: string }>()
const agent = (handle: string) => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': agents.get(handle)!.key })

async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, headers: Record<string, string> = person) {
  const response = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: response.statusCode, body: response.json() as Record<string, any>, text: response.body }
}
async function start(role: string, by: Record<string, string>) {
  const handle = unique()
  const response = await ask('POST', '/api/agents/started', { handle, name: handle, role }, by)
  expect(response.status, response.text).toBe(201)
  agents.set(handle, { id: response.body.agent.id, key: response.body.whatToGiveIt.key })
  return handle
}
async function posted(url: string, payload: unknown, headers: Record<string, string> = person) {
  const response = await ask('POST', url, payload, headers)
  expect(response.status, response.text).toBe(201)
  return response.body
}
beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)
afterAll(async () => { await app.close(); db.close() })

it('keeps entries, categories, bookmarks and changes with their reasons', async () => {
  const secretary = await start('secretary', person)
  const worker = await start('worker', agent(secretary))
  const projectA = unique(), projectB = unique()
  const workspaces = await import('../src/server/lib/workspaces.ts')
  workspaces.createWorkspace({ id: projectA, title: projectA })
  workspaces.createWorkspace({ id: projectB, title: projectB })
  const root = (await posted('/api/knowledge/categories', { title: 'General' })).category.id as string
  const child = (await posted('/api/knowledge/categories', { title: 'Specific', parent: root })).category.id as string
  const other = (await posted('/api/knowledge/categories', { title: 'Other', parent: root })).category.id as string
  const fields = {
    title: 'A useful procedure', category: child, opening: 'Begin here.', body: 'Follow the steps.',
    resources: [{ what: 'A reference', where: 'A shelf', how: 'Read it first.' }],
    sources: [{ url: 'https://example.invalid/reference' }], aliases: ['procedure'], language: 'en', reason: 'Initial version',
  }
  const tooLong = await ask('POST', '/api/knowledge/entries', { ...fields, opening: 'a'.repeat(201) }, agent(worker))
  expect(tooLong.status).toBe(400)
  expect(String(tooLong.body.error)).toMatch(/opening.*200/i)
  const entry = (await posted('/api/knowledge/entries', fields, agent(worker))).entry
  expect(entry).toMatchObject({ title: fields.title, summary: fields.opening, opening: fields.opening, data: { category: child, body: fields.body, resources: fields.resources, sources: fields.sources, aliases: fields.aliases, language: fields.language } })
  const id = entry.id as string
  const tree = await ask('GET', `/api/knowledge/categories/${root}`)
  expect(tree.body.subcategories.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining([child, other]))
  expect((await ask('GET', `/api/knowledge/categories/${child}`)).body.entries.map((e: { id: string }) => e.id)).toContain(id)
  const changed = await ask('PATCH', `/api/knowledge/entries/${id}`, { category: other, body: 'A sourced revision.', sources: fields.sources, reason: 'The reference changed' }, agent(worker))
  expect(changed.status, changed.text).toBe(200)
  expect(changed.body.entry.data).toMatchObject({ category: other, body: 'A sourced revision.' })
  expect((await ask('GET', `/api/knowledge/categories/${other}`)).body.entries.map((e: { id: string }) => e.id)).toContain(id)
  for (const project of [projectA, projectB]) await posted(`/api/knowledge/entries/${id}/bookmarks`, {}, { ...person, 'x-mole-office-workspace': project })
  let read = await ask('GET', `/api/knowledge/entries/${id}`)
  expect(read.body.projects.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining([projectA, projectB]))
  expect(read.body.history.map((h: { reason: string }) => h.reason)).toEqual(expect.arrayContaining(['Initial version', 'The reference changed']))
  const waiting = await ask('PATCH', `/api/knowledge/entries/${id}`, { body: 'A proposed revision.', sources: [], reason: 'A discovery' }, agent(worker))
  expect(waiting.status, waiting.text).toBe(202)
  expect(waiting.body.change.offeredTo).toMatchObject({ kind: 'agent', id: agents.get(secretary)!.id })
  read = await ask('GET', `/api/knowledge/entries/${id}`)
  expect(read.body.entry.data.body).toBe('A sourced revision.')
  expect(read.body.changeWaits).toBe(true)
  const refused = await ask('POST', `/api/knowledge/changes/${waiting.body.change.id}/confirm`, { reason: 'Agreed' }, agent(worker))
  expect(refused.status).toBe(403)
  expect(String(refused.body.error)).toMatch(/secretary|person/i)
  const confirmed = await ask('POST', `/api/knowledge/changes/${waiting.body.change.id}/confirm`, { reason: 'Checked' }, agent(secretary))
  expect(confirmed.status, confirmed.text).toBe(200)
  read = await ask('GET', `/api/knowledge/entries/${id}`)
  expect(read.body.entry.data.body).toBe('A proposed revision.')
  expect(read.body.changeWaits).toBe(false)
  expect(read.body.history.map((h: { reason: string }) => h.reason)).toContain('A discovery')
  const next = await ask('PATCH', `/api/knowledge/entries/${id}`, { body: 'Another proposal.', sources: [], reason: 'Another discovery' }, agent(worker))
  expect(next.status, next.text).toBe(202)
  const rejected = await ask('POST', `/api/knowledge/changes/${next.body.change.id}/refuse`, { reason: 'Not supported' }, agent(secretary))
  expect(rejected.status, rejected.text).toBe(200)
  read = await ask('GET', `/api/knowledge/entries/${id}`)
  expect(read.body.entry.data.body).toBe('A proposed revision.')
  expect(read.body.changeWaits).toBe(false)
})

it('keeps an unsourced new entry readable until a secretary answers it', async () => {
  const secretary = await start('secretary', person)
  const worker = await start('worker', agent(secretary))
  const category = (await posted('/api/knowledge/categories', { title: 'Review' })).category.id as string
  const fields = {
    title: 'An entry to check', category, opening: 'Start here.', body: 'A proposed procedure.',
    resources: [], sources: [], aliases: [], language: 'en', reason: 'Initial version',
  }
  const waiting = await ask('POST', '/api/knowledge/entries', fields, agent(worker))
  expect(waiting.status, waiting.text).toBe(202)
  expect(waiting.body.change).toMatchObject({ state: 'waiting', offeredTo: { kind: 'agent', id: agents.get(secretary)!.id } })
  const id = waiting.body.entry.id as string
  let read = await ask('GET', `/api/knowledge/entries/${id}`)
  expect(read.body.entry.data.body).toBe(fields.body)
  expect(read.body.entryStatus).toBe('waiting')
  expect(read.body.history).toHaveLength(0)
  const listed = await ask('GET', `/api/knowledge/categories/${category}`)
  expect(listed.body.entries).toEqual(expect.arrayContaining([expect.objectContaining({ id, entryStatus: 'waiting' })]))
  const denied = await ask('POST', `/api/knowledge/changes/${waiting.body.change.id}/confirm`, { reason: 'Checked' }, agent(worker))
  expect(denied.status).toBe(403)
  const confirmed = await ask('POST', `/api/knowledge/changes/${waiting.body.change.id}/confirm`, { reason: 'Checked' }, agent(secretary))
  expect(confirmed.status, confirmed.text).toBe(200)
  read = await ask('GET', `/api/knowledge/entries/${id}`)
  expect(read.body.entryStatus).toBe('in_force')
  expect(read.body.history.map((h: { reason: string }) => h.reason)).toContain(fields.reason)

  const another = await ask('POST', '/api/knowledge/entries', { ...fields, title: 'Another entry' }, agent(worker))
  expect(another.status, another.text).toBe(202)
  const rejected = await ask('POST', `/api/knowledge/changes/${another.body.change.id}/refuse`, { reason: 'Not supported' }, agent(secretary))
  expect(rejected.status, rejected.text).toBe(200)
  const refused = await ask('GET', `/api/knowledge/entries/${another.body.entry.id}`)
  expect(refused.status).toBe(200)
  expect(refused.body.entry.data.body).toBe(fields.body)
  expect(refused.body.entryStatus).toBe('refused')
  expect(refused.body.history).toHaveLength(0)

  const sourced = await ask('POST', '/api/knowledge/entries', { ...fields, title: 'A sourced entry', sources: [{ url: 'https://example.invalid/reference' }] }, agent(worker))
  expect(sourced.status, sourced.text).toBe(201)
  const sourcedRead = await ask('GET', `/api/knowledge/entries/${sourced.body.entry.id}`)
  expect(sourcedRead.body.entryStatus).toBe('in_force')
  expect(sourcedRead.body.history.map((h: { reason: string }) => h.reason)).toContain(fields.reason)
})

it('does not reach an ordinary project record through any knowledge id door', async () => {
  const id = (await posted('/api/records', { kind: 'note', title: unique(), data: { body: 'A project record.' } })).record.id as string
  const snapshot = () => ['records', 'links', 'changes', 'revisions'].map(table => db.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
  const before = snapshot()
  const doors: { method: 'GET' | 'POST' | 'PATCH'; url: string; payload?: unknown }[] = [
    { method: 'GET', url: `/api/knowledge/categories/${id}` },
    { method: 'GET', url: `/api/knowledge/entries/${id}` },
    { method: 'PATCH', url: `/api/knowledge/entries/${id}`, payload: { body: 'Changed.', reason: 'A reason.' } },
    { method: 'POST', url: `/api/knowledge/changes/${id}/confirm`, payload: { reason: 'A reason.' } },
    { method: 'POST', url: `/api/knowledge/changes/${id}/refuse`, payload: { reason: 'A reason.' } },
    { method: 'POST', url: `/api/knowledge/entries/${id}/bookmarks`, payload: {} },
  ]
  for (const door of doors) {
    const response = await ask(door.method, door.url, door.payload)
    expect(response.status, `${door.method} ${door.url}: ${response.text}`).toBe(404)
    expect(snapshot()).toEqual(before)
  }
})

it('refuses ordinary record creates and kind changes into knowledge kinds without writing', async () => {
  const id = (await posted('/api/records', { kind: 'note', title: unique(), data: { body: 'A project record.' } })).record.id as string
  const snapshot = () => ['records', 'links', 'changes', 'revisions'].map(table => db.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
  const before = snapshot()
  for (const kind of KNOWLEDGE_KINDS) {
    for (const request of [
      () => ask('POST', '/api/records', { kind, title: unique(), data: {} }),
      () => ask('PATCH', `/api/records/${id}`, { kind }),
    ]) {
      const response = await request()
      expect(response.status, response.text).toBe(403)
      expect(response.body.error).toBe('Use the knowledge doors to write knowledge records. Nothing was written.')
      expect(snapshot()).toEqual(before)
    }
  }
})
