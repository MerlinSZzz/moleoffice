// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Criterion before production: OLD the generic header called a derived repair word stored.
 * NEW both actual problem headers read only data.state, including in Developer tooltips.
 * WHY X0AsCcI2hTQO keeps generic stateOf literal. The asynchronous record read is supplied
 * here; the actual page, header and StoredState components render unchanged, with no effects.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { MAIN_SUITE_FIX_EXAMPLE, mainSuiteFixSchema } from '../src/shared/main-suite-fix.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { RecordPageData } from '../src/web/pages/RecordPage.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type UseAsync = (load: () => Promise<unknown>, deps: readonly unknown[], options?: { keep?: string }) => unknown
const supplied = vi.hoisted(() => ({ page: null as RecordPageData | null, useAsync: null as UseAsync | null }))
vi.mock('../src/web/components/ui.tsx', async (original) => {
  const real = await original<typeof import('../src/web/components/ui.tsx')>()
  const useAsync = (load: () => Promise<unknown>, deps: readonly unknown[], options: { keep?: string } = {}) =>
    options.keep?.startsWith('record:')
      ? [{ status: 'ready', value: supplied.page }, () => {}]
      : real.useAsync(load, deps, options)
  supplied.useAsync = useAsync
  return { ...real, useAsync }
})
// The record page's read goes through useProjectAsync, which hands it to useAsync. ui.tsx imports
// Planning.tsx, which imports project-async.ts, so the real ui.tsx loaded above gives project-async.ts
// the real useAsync. This mock hands the read to the useAsync above instead.
vi.mock('../src/web/lib/project-async.ts', () => ({
  useProjectAsync: (load: () => Promise<unknown>, deps: readonly unknown[], options?: { keep?: string }) => {
    if (supplied.useAsync === null) throw new Error('useProjectAsync was called before the mock of ui.tsx was made')
    return supplied.useAsync(load, deps, options)
  },
}))
let page: typeof import('../src/web/pages/RecordPage.tsx')
let problem: typeof import('../src/web/pages/ProblemPage.tsx')
let mode: typeof import('../src/web/lib/mode.ts')
beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = { getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) }
  Object.assign(globalThis, { window: { localStorage: storage, sessionStorage: storage,
    location: { hash: '#/r/synthetic-header-problem', search: '' }, addEventListener: () => {}, removeEventListener: () => {} } })
  page = await import('../src/web/pages/RecordPage.tsx')
  problem = await import('../src/web/pages/ProblemPage.tsx')
  mode = await import('../src/web/lib/mode.ts')
})
afterEach(() => mode?.setMode('normal'))

function specimen(state: 'absent' | 'open'): PanelRecord {
  return { id: 'synthetic-header-problem', workspaceId: 'default', ownerId: THE_TEST_OFFICES_OWNER.id,
    kind: 'problem', title: 'Synthetic header state specimen', summary: 'Made-up state provenance input.', origin: 'fixture',
    createdAt: '2026-10-15 10:00:00', updatedAt: '2026-10-15 10:00:00', deletedAt: null,
    data: { ...(state === 'absent' ? {} : { state }),
      mainSuiteFix: mainSuiteFixSchema.parse({ ...structuredClone(MAIN_SUITE_FIX_EXAMPLE), outcome: { returned: 'synthetic-returned-change' } }) } }
}
function supply(record: PanelRecord): void {
  // The page's real read reply, with no links, history, restrictions or other records to draw.
  supplied.page = { detail: { record, incomplete: [], version: 'synthetic-version', revisionSeq: null,
      history: { versions: 0, baselineOnly: false }, links: [], changes: [], onThePersonsWords: [],
      restrictions: { found: [], couldNotCheck: [], skippedDeleted: 0, walk: [] } },
    log: { changes: [], sessions: [] }, titles: null, unfilledByRecord: new Map(), titleById: new Map(),
    records: [], links: [], projects: [], participants: { people: [], agents: [] } } as unknown as RecordPageData
}
it('both actual problem headers keep derived-only state absent and explicit state stored', () => {
  for (const state of ['absent', 'open'] as const) {
    const record = specimen(state)
    const before = JSON.stringify(record)
    supply(record)
    for (const inspect of [false, true]) {
      mode.setMode(inspect ? 'inspect' : 'normal')
      for (const element of [h(page.RecordPage, { id: record.id, waiting: { status: 'loading' } }), h(problem.ProblemPage, { id: record.id })]) {
        const drawn = renderToStaticMarkup(element).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
        const standing = drawn.match(/<div class="(?:rp|pp)-standing">([\s\S]*?)<\/div>/)?.[1]
        expect(standing, 'the actual page rendered its state chip').toBeDefined()
        expect(standing).not.toContain('worked_around')
        expect(standing).not.toContain('Derived state')
        if (state === 'absent') {
          expect(standing).toContain('no state')
          if (inspect) expect(standing).toContain('No state word is stored')
        } else {
          expect(standing).toContain('open')
          if (inspect) expect(standing).toContain('The stored state word is &quot;open&quot;')
        }
      }
    }
    expect(JSON.stringify(record)).toBe(before)
    expect(Object.hasOwn(record.data, 'state')).toBe(state !== 'absent')
  }
})
