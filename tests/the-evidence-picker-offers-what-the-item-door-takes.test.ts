// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EVIDENCE PICKER OFFERS WHAT THE ITEM DOOR TAKES. Wave 13n round 52, by point 4 of a decision: evidence for "done"
 * is picked, never typed.
 *
 * `GET /api/checklists/evidence-choices?kind=` is what the checklists window's picker reads. This file holds:
 *
 * 1. each kind offers its own things in this project and nothing else: reports, runs, landed commits (a merge
 *    entry that has not landed is not offered) and the blocks of a report as manual sections;
 * 2. every choice it offers is taken by the item door as it stands, so picking one marks the item done;
 * 3. `words` keeps the choices whose title holds every word, and the pages are 25 long with what is left said.
 *
 * CONTROL: 3 passed. MUTATION: `everyChoice` in src/server/lib/checklist-evidence.ts offered every merge entry, not
 * only the landed ones; case 1 went red (1 failed, 2 passed). RESTORE: 3 passed.
 *
 * Every record here is made up, in this test's own database.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance

const asPerson = (workspace = 'default'): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
})
const PERSON = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id }

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, workspace = 'default'): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers: asPerson(workspace), ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

function made(workspaceId: string, kind: string, title: string, data: Record<string, unknown>): string {
  return t.api.createRecord({ workspaceId, kind: kind as never, title, data, actor: PERSON }).id
}

/**
 * A MERGE ENTRY WRITTEN STRAIGHT INTO THIS TEST'S DATABASE. Only the merge queue writes one through the doors, and
 * driving a whole merge to land one is not what this file is about.
 */
function anEntry(id: string, title: string, data: Record<string, unknown>): string {
  t.client.sqlite
    .prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data) ' +
        "VALUES (?, 'default', ?, '2026-10-09 09:00:00', '2026-10-09 09:00:00', 'merge_entry', ?, ?)",
    )
    .run(id, THE_TEST_OFFICES_OWNER.id, title, JSON.stringify(data))
  return id
}

const ids: Record<string, string> = {}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  expect((await call('POST', '/api/workspaces', { id: 'elsewhere', title: 'Another project' })).status).toBeLessThan(300)
  ids['report'] = made('default', 'report', 'Kiln firing report', { blocks: [{ id: 'b-1', type: 'text', heading: 'How the kiln is loaded', text: 'Made up.' }] })
  ids['otherReport'] = made('elsewhere', 'report', 'A report in another project', { blocks: [] })
  ids['landed'] = anEntry('entry-landed', 'Glaze timer lands', {
    state: 'landed',
    integrated: { entry: 'made-up', mainBefore: '1111111111111111111111111111111111111111', mainAfter: 'abcdef0123456789abcdef0123456789abcdef01', at: '2026-10-09 09:00:00' },
  })
  ids['waiting'] = anEntry('entry-queued', 'Still in the queue', {
    state: 'queued',
    integrated: { entry: 'made-up', mainBefore: '1111111111111111111111111111111111111111', mainAfter: '2222222222222222222222222222222222222222', at: '2026-10-09 09:30:00' },
  })
  for (let n = 0; n < 30; n += 1) made('default', 'report', `Shelf note ${String(n)}`, { blocks: [] })
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

async function choices(kind: string, extra = ''): Promise<Record<string, any>> {
  const r = await call('GET', `/api/checklists/evidence-choices?kind=${encodeURIComponent(kind)}${extra}`)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body
}

describe('the evidence picker offers what the item door takes', () => {
  it('offers each kind its own things in this project: landed commits only, and the blocks of a report', async () => {
    const reports = await choices('report', '&words=kiln')
    expect(reports['choices'].map((one: any) => one.evidence)).toEqual([{ kind: 'report', record: ids['report'] }])
    const commits = await choices('commit')
    expect(commits['choices']).toEqual([
      { evidence: { kind: 'commit', commit: 'abcdef0123456789abcdef0123456789abcdef01' }, title: 'Glaze timer lands', detail: 'abcdef012 · 2026-10-09 09:00' },
    ])
    const sections = await choices('manual section', '&words=loaded')
    expect(sections['choices']).toEqual([
      { evidence: { kind: 'manual section', record: ids['report'], block: 'b-1' }, title: 'How the kiln is loaded', detail: 'Kiln firing report' },
    ])
    const runs = await choices('run')
    expect(runs['choices']).toEqual([])
    expect(runs['says']).toContain('Nothing of the kind "run"')
  })

  it('offers only what the item door then takes: picking a commit and a section marks the item done', async () => {
    const list = await call('POST', '/api/checklists', { title: 'Kiln list', items: [{ words: 'Fire the kiln' }, { words: 'Write how it is loaded', mustBeInManual: true }] })
    expect(list.status, JSON.stringify(list.body)).toBe(201)
    const id = list.body['checklist'].id as string
    const [commit] = (await choices('commit'))['choices'] as { evidence: object }[]
    const first = await call('PATCH', `/api/checklists/${id}/items/i-1`, { state: 'done', addEvidence: [commit!.evidence] })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    const [section] = (await choices('manual section', '&words=loaded'))['choices'] as { evidence: object }[]
    const second = await call('PATCH', `/api/checklists/${id}/items/i-2`, { state: 'done', addEvidence: [section!.evidence] })
    expect(second.status, JSON.stringify(second.body)).toBe(200)
  })

  it('keeps the choices holding every word, and gives 25 at a time with what is left', async () => {
    const shelves = await choices('report', '&words=shelf%20note')
    expect(shelves['matched']).toBe(30)
    expect(shelves['choices']).toHaveLength(25)
    expect(shelves['left']).toBe(5)
    const rest = await choices('report', '&words=shelf%20note&offset=25')
    expect(rest['choices']).toHaveLength(5)
    expect(rest['left']).toBe(0)
    expect((await choices('report', '&words=shelf%20kiln'))['matched']).toBe(0)
  })
})
