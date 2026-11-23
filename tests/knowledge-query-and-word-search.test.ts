// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const person = { type: 'human', id: THE_PERSON } as const
const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const unique = () => `case-${randomUUID().slice(0, 23)}`
const fields = (category: string, title: string) => ({
  category, title, opening: `Opening for ${title}`, body: 'A made-up procedure.', resources: [],
  sources: [{ url: 'https://example.invalid/reference' }], aliases: [], language: 'en', reason: 'A made-up reason.',
})
let db: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']
let library: typeof import('../src/server/knowledge/library.ts')
let records: typeof import('../src/server/lib/records.ts')
async function get(url: string, extra: Record<string, string> = {}) {
  const response = await app.inject({ method: 'GET', url, headers: { ...headers, ...extra } })
  expect(response.statusCode, response.body).toBe(200)
  return response.json() as Record<string, any>
}
async function request(method: 'POST' | 'PATCH', url: string, payload: unknown, extra: Record<string, string> = {}) {
  const response = await app.inject({ method, url, headers: { ...headers, ...extra }, payload: payload as never })
  return { status: response.statusCode, body: response.json() as Record<string, any>, text: response.body }
}
const flatten = (nodes: any[]): any[] => nodes.flatMap(node => [node, ...flatten(node.subcategories ?? [])])

describe('knowledge queries in a small made-up library', () => {
  let root: string, child: string, deep: string, ids: string[], project: string, run: string
  beforeAll(async () => {
    db = await freshDb(); app = (await apiApp()).app; await app.ready()
    library = await import('../src/server/knowledge/library.ts')
    records = await import('../src/server/lib/records.ts')
    const workspaces = await import('../src/server/lib/workspaces.ts')
    project = unique(); workspaces.createWorkspace({ id: project, title: 'Made-up project' })
    run = records.createRecord({ kind: 'session', title: 'Made-up run', workspaceId: project, actor: person, origin: 'fixture', data: { state: 'running' } }).id
    root = library.createCategory({ title: 'Root' }, person).category.id
    child = library.createCategory({ title: 'Child', parent: root }, person).category.id
    deep = library.createCategory({ title: 'Deep', parent: child }, person).category.id
    ids = [root, child, deep].map((category, i) => library.createEntry({ ...fields(category, `Entry ${i}`),
      ...(i === 1 ? { aliases: ['aliasneedle'] } : {}),
      ...(i === 2 ? { resources: [{ what: 'A tool', where: 'A shelf', how: 'howneedle' }] } : {}),
    }, person, project).entry.id)
  }, 60_000)
  afterAll(async () => { await app.close(); db.close() })

  it('opens the whole tree and searches, recording each query and later reads', async () => {
    const asRun = { 'x-mole-office-workspace': project, 'x-mole-office-session': run }
    await get(`/api/knowledge/entries/${ids[0]}`, asRun)
    expect(records.listRecords({ workspaceId: 'knowledge', kind: 'knowledge_query' })).toHaveLength(0)
    const first = await get('/api/knowledge/query', asRun)
    const nodes = flatten(first.categories)
    expect(nodes.map(n => n.id)).toEqual(expect.arrayContaining([root, child, deep]))
    expect(nodes.flatMap(n => n.entries).map((e: any) => e.id).sort()).toEqual([...ids].sort())
    for (const [i, id] of ids.entries()) expect(nodes.flatMap(n => n.entries).find((e: any) => e.id === id)).toMatchObject({ title: `Entry ${i}`, opening: `Opening for Entry ${i}` })
    const second = await get(`/api/knowledge/query/categories?ids=${child},${deep}`, asRun)
    expect(second.entries.map((e: any) => e.id).sort()).toEqual([ids[1], ids[2]].sort())
    const alias = await get('/api/knowledge/search?q=aliasneedle', asRun)
    expect(alias.results.map((r: any) => r.record.id)).toEqual([ids[1]])
    const how = await get('/api/knowledge/search?q=howneedle&level=3', asRun)
    expect(how.results.map((r: any) => r.record.id)).toEqual([ids[2]])
    expect(how.results[0].record.atLevel.asked).toBe('3')
    const logs = [first, second, alias, how].map(answer => records.getRecord(answer.queryId)!)
    expect(logs.map(row => row.data.way)).toEqual(['first', 'categories', 'words', 'words'])
    expect(logs.map(row => (row.data.answered as string[]).slice().sort())).toEqual([[root, child, deep, ...ids].sort(), [ids[1], ids[2]].sort(), [ids[1]], [ids[2]]])
    expect(logs.map(row => row.data.asked)).toEqual([{}, { ids: [child, deep] }, { q: 'aliasneedle' }, { q: 'howneedle', level: '3' }])
    for (const row of logs) expect(row.data).toMatchObject({ run, project, readAfter: [] })
    await get(`/api/knowledge/entries/${ids[0]}`, asRun)
    expect(records.getRecord(how.queryId)!.data.readAfter).toEqual([ids[0]])
    expect(records.getRecord(alias.queryId)!.data.readAfter).toEqual([])
    expect((await get(`/api/knowledge/entries/${ids[1]}`)).projects.map((p: any) => p.id)).toContain(project)
  })

  it('answers entries at every depth below requested categories without duplicates', async () => {
    const top = library.createCategory({ title: 'Empty root' }, person).category.id
    const middle = library.createCategory({ title: 'Middle', parent: top }, person).category.id
    const bottom = library.createCategory({ title: 'Bottom', parent: middle }, person).category.id
    const descendants = [middle, bottom].map((category, i) =>
      library.createEntry(fields(category, `Descendant ${i}`), person, project).entry.id)

    for (const requested of [[top], [top, middle]]) {
      const answer = await get(`/api/knowledge/query/categories?ids=${requested.join(',')}`)
      expect(answer.entries.map((entry: any) => entry.id).sort()).toEqual([...descendants].sort())
      expect((records.getRecord(answer.queryId)!.data.answered as string[]).slice().sort()).toEqual([...descendants].sort())
    }
  })

  it('says an entry waits on every read and lifts the wait only on an applied sourced change', async () => {
    const created = await request('POST', '/api/knowledge/entries', { ...fields(child, 'Waiting entry'), sources: [], aliases: ['waitneedle'] })
    expect(created.status, created.text).toBe(202)
    const id = created.body.entry.id
    expect((await get(`/api/knowledge/entries/${id}`)).entryStatus).toBe('waiting')
    expect((await get(`/api/knowledge/categories/${child}`)).entries.find((e: any) => e.id === id).entryStatus).toBe('waiting')
    const bookmarked = await request('POST', `/api/knowledge/entries/${id}/bookmarks`, {}, { 'x-mole-office-workspace': project })
    expect(bookmarked.body.entryStatus).toBe('waiting')
    expect(flatten((await get('/api/knowledge/query')).categories).flatMap(n => n.entries).find((e: any) => e.id === id).entryStatus).toBe('waiting')
    expect((await get(`/api/knowledge/query/categories?ids=${child}`)).entries.find((e: any) => e.id === id).entryStatus).toBe('waiting')
    expect((await get('/api/knowledge/search?q=waitneedle')).results.find((r: any) => r.record.id === id).record.entryStatus).toBe('waiting')
    expect((await request('PATCH', `/api/knowledge/entries/${id}`, { body: 'A proposed change.', reason: 'Unconfirmed.' })).status).toBe(202)
    expect((await get(`/api/knowledge/entries/${id}`)).entryStatus).toBe('waiting')
    expect((await request('PATCH', `/api/knowledge/entries/${id}`, { body: 'A sourced change.', sources: [{ url: 'https://example.invalid/source' }], reason: 'Supported.' })).status).toBe(200)
    const after = await get(`/api/knowledge/entries/${id}`)
    expect(after.entryStatus).toBe('in_force')
    expect(after.history.map((h: any) => h.reason)).toContain('Supported.')
    expect((await request('PATCH', `/api/knowledge/entries/${id}`, { opening: 'x'.repeat(201), reason: 'Too long.' })).status).toBe(400)
  })
})

describe('a larger made-up knowledge library', () => {
  let roots: string[], children: string[]
  beforeAll(async () => {
    db = await freshDb(); app = (await apiApp()).app; await app.ready()
    library = await import('../src/server/knowledge/library.ts')
    roots = Array.from({ length: 2 }, (_, i) => library.createCategory({ title: `Root ${i}` }, person).category.id)
    children = roots.map((parent, i) => library.createCategory({ title: `Child ${i}`, parent }, person).category.id)
    for (let i = 0; i < 500; i++) library.createEntry(fields(children[i % 2]!, `Entry ${i}`), person, 'default')
  }, 60_000)
  afterAll(async () => { await app.close(); db.close() })
  it('stops before a whole level and counts every entry under unopened categories', async () => {
    const answer = await get('/api/knowledge/query')
    expect(answer.categories.map((c: any) => c.id).sort()).toEqual([...roots].sort())
    const nodes = flatten(answer.categories)
    expect(nodes.map(n => n.id).sort()).toEqual([...roots, ...children].sort())
    for (const node of nodes.filter(n => children.includes(n.id))) {
      expect(node.opened).toBe(false)
      expect(node.entryCount).toBe(250)
      expect(node.entries).toEqual([])
    }
    expect(nodes.flatMap(n => n.entries)).toHaveLength(0)
  })
})
