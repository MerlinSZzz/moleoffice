// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORK TO DO PAGE ASKS `GET /api/work?shape=page`, AND DRAWS FROM IT WHAT IT DREW FROM THE WHOLE LIST.
 *
 * `#/work` names a row by `name` and never draws its title, its one line or `within`. `?shape=page`
 * leaves those three out of every row and keeps everything else of the whole list as it is. The other
 * readers of the whole list, the planning drawer on `#/plan` and the plan table's picker on
 * `#/plans/<id>`, read those fields and still ask without a shape.
 *
 * WHAT HOLDS:
 *   - every row of the page shape is the whole list's row without `title`, `summary` and `within`, and
 *     every other field of the answer is the whole list's own;
 *   - `WorkList` draws the same markup from the page shape as from the whole list, on rows whose title,
 *     one line and `within` differ from their name.
 */
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AGENT, apiApp, freshDb, type TestDb } from './helpers.ts'
import type { WorkspacesReply } from '../src/server/api/workspaces.ts'
import type { WorkListReply, WorkPageReply } from '../src/server/lib/worklist.ts'

type Page = typeof import('../src/web/pages/family/WorkPage.tsx')

let t: TestDb
let app: FastifyInstance
let page: Page

const NOW = Date.parse('2026-10-11T09:00:00Z')

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'panelx', title: 'Mole Office' })
  // The page reaches src/web/api.ts and src/web/lib/mode.ts, both of which touch `window` at module scope.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  page = await import('../src/web/pages/family/WorkPage.tsx')

  t.api.createRecord({ workspaceId: 'panelx', kind: 'task', title: 'Descale the kettle', summary: 'Vinegar, then two rinses.', data: { state: 'doing' }, actor: AGENT })
  t.api.createRecord({ workspaceId: 'panelx', kind: 'task', title: 'Buy vinegar', summary: 'The white kind, a litre.', data: { state: 'todo', effort_hours: 1 }, actor: AGENT })
  t.api.createRecord({ workspaceId: 'panelx', kind: 'obligation', title: 'Return the library book', data: { due: '2026-10-20', state: 'open' }, actor: AGENT })
  const pipeline = t.api.createRecord({ workspaceId: 'panelx', kind: 'pipeline', title: 'Kitchen weekend', data: { blockIds: [] }, actor: AGENT })
  t.blocks.addBlock(pipeline.id, { name: 'Wipe the shelf', state: 'todo' }, AGENT)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

async function read<T>(url: string): Promise<T> {
  const res = await app.inject({ method: 'GET', url })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as T
}

const PROJECTS = {
  workspaces: [{ id: 'panelx', title: 'Mole Office', note: null, createdAt: '', updatedAt: '', records: 1, isDefault: false }],
} as unknown as WorkspacesReply

/** Markup with the hoisted style blocks removed. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

describe('GET /api/work?shape=page', () => {
  it('answers the whole list with each row lacking only its title, its one line and within', async () => {
    const whole = await read<WorkListReply>('/api/work')
    const shaped = await read<WorkPageReply>('/api/work?shape=page')
    expect(whole.rows.some((row) => row.within !== null), 'a block, so `within` is not null on every row').toBe(true)
    expect(whole.rows.some((row) => row.summary !== null)).toBe(true)
    const { rows: wholeRows, ...wholeRest } = whole
    const { rows: shapedRows, ...shapedRest } = shaped
    expect(shapedRest).toEqual(wholeRest)
    expect(shapedRows).toEqual(wholeRows.map(({ title: _title, summary: _summary, within: _within, ...row }) => row))
  })

  it('draws the Work to do list from it exactly as from the whole list, in both views', async () => {
    const whole = await read<WorkListReply>('/api/work')
    const shaped = await read<WorkPageReply>('/api/work?shape=page')
    for (const view of ['levels', 'flat'] as const) {
      const fromWhole = body(h(page.WorkList, { reply: whole, projects: PROJECTS, view, now: NOW }))
      expect(fromWhole).toContain('Buy vinegar')
      expect(body(h(page.WorkList, { reply: shaped, projects: PROJECTS, view, now: NOW }))).toBe(fromWhole)
    }
  })

})
