// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH FAMILY PAGE, AND THE PIPELINES PAGE, ASKS FOR THE RECORDS IT DRAWS AND NO OTHERS. Wave 13y round 15, finding 2.
 *
 * MEASURED FIRST: GET /api/records with no kind answered the owner's browser 142 MB, twice on 9 October 2026. Every
 * family page asked for the whole project; the Work page, which reads GET /api/work, then used none of it.
 * tests/a-family-page-reads-its-own-family.test.ts holds the server's side; this holds what each page asks.
 *
 * CONTROL: passes at the tip. MUTATIONS, each run and each red:
 *   1. `readFor('findings')` asks `api.listRecords()` (src/web/pages/family/FamilyPage.tsx): the whole-project read
 *      is asked.
 *   2. `loadPage` drops the far ends from the records (src/web/pages/PipelinePage.tsx): the decision a module is
 *      linked to is missing, which the drawing would call deleted.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { RecordListItem, RecordListReply } from '../src/web/api.ts'

type Family = typeof import('../src/web/pages/family/FamilyPage.tsx')
type Pipelines = typeof import('../src/web/pages/PipelinePage.tsx')
type Api = typeof import('../src/web/api.ts')

let family: Family
let pipelines: Pipelines
let apiModule: Api

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope. Same stand-in as tests/graph-scale.test.ts.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  family = await import('../src/web/pages/family/FamilyPage.tsx')
  pipelines = await import('../src/web/pages/PipelinePage.tsx')
  apiModule = await import('../src/web/api.ts')
})

const row = (id: string, kind: string): RecordListItem =>
  ({ id, kind, title: `Test ${id}`, summary: null, data: {}, createdAt: '2026-10-09 09:00:00', updatedAt: '2026-10-09 09:00:00', deletedAt: null, incompleteCount: 0 }) as unknown as RecordListItem

const reply = (records: RecordListItem[], farEnds?: RecordListItem[]): RecordListReply => ({
  records,
  matched: records.length,
  returned: records.length,
  left: 0,
  truncated: false,
  next: null,
  ...(farEnds === undefined ? {} : { farEnds }),
})

/** Every ask a page makes, with the whole-project read counted apart. */
function watchTheAsks(): { asked: unknown[]; whole: () => number } {
  vi.restoreAllMocks()
  const asked: unknown[] = []
  vi.spyOn(apiModule.api, 'recordsOf').mockImplementation(async (ask) => {
    asked.push(ask)
    return reply([])
  })
  const whole = vi.spyOn(apiModule.api, 'listRecords').mockResolvedValue(reply([]))
  return { asked, whole: () => whole.mock.calls.length }
}

describe('a family page asks for its own kinds', () => {
  const expected: Record<string, unknown[]> = {
    findings: [{ family: 'findings' }],
    ideas: [{ family: 'ideas' }],
    structure: [{ family: 'structure' }, { kind: 'problem', shape: 'light' }],
    modules: [{ kind: 'module' }, { kind: 'problem', shape: 'light' }],
  }
  for (const [surface, asks] of Object.entries(expected)) {
    it(`${surface} asks ${JSON.stringify(asks)} and never the whole project`, async () => {
      const watched = watchTheAsks()
      await family.readFor(surface as Parameters<Family['readFor']>[0])
      expect(watched.whole(), 'the whole-project read').toBe(0)
      expect(watched.asked).toEqual(asks)
    })
  }
})

describe('the Pipelines page asks for the structure family and the far ends of its links', () => {
  it('asks once, and draws the far ends beside the family', async () => {
    vi.restoreAllMocks()
    const asked: unknown[] = []
    vi.spyOn(apiModule.api, 'recordsOf').mockImplementation(async (ask) => {
      asked.push(ask)
      return reply([row('m1', 'module')], [row('d1', 'decision')])
    })
    const whole = vi.spyOn(apiModule.api, 'listRecords').mockResolvedValue(reply([]))
    vi.spyOn(apiModule.api, 'attention').mockResolvedValue({ visible: [], remainder: [] } as unknown as Awaited<ReturnType<Api['api']['attention']>>)
    vi.spyOn(apiModule.api, 'listLinks').mockResolvedValue([])
    const loaded = await pipelines.loadPage()
    expect(whole.mock.calls.length, 'the whole-project read').toBe(0)
    expect(asked).toEqual([{ family: 'structure', farEnds: 'light' }])
    expect(loaded.records.map((one) => one.id).sort(), 'the far end is there to draw its chip').toEqual(['d1', 'm1'])
  })
})
