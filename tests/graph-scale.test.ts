// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STRUCTURE DRAWING ON A BIG WORKSPACE: the two things that broke, measured before they were fixed.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE TWO AND NOT A SUITE OF TIMINGS
 * ---------------------------------------------------------------------------------------
 *
 * `design/adversarial/shapes.md` reported that the pipeline page dies at about 1,350 module,
 * pipeline and block records and blames the server for it. That was reproduced and then taken apart
 * on scratch copies of the real database, densified 1× to 40×, served on ports 39001/39002. The
 * costs, at 4,160 structural records (40× the corpus, fifteen thousand records):
 *
 *   reading every structural record's links   443 ms of server time
 *   building the StructureGraph               570 ms
 *   ELK                                       510 ms
 *   React Flow drawing 1,080 cards            page settled in 3,955 ms, 22,716 DOM nodes
 *
 * Not one of those is the failure. Every one of them is under a second and all of them together
 * draw the page. The failure is that the reads went out in ONE TICK: 2,084 `fetch` calls created,
 * 1,358 reached the server, 726 refused by Chromium with ERR_INSUFFICIENT_RESOURCES before they
 * left the browser, and a page of 207 DOM nodes saying "Cannot reach the Mole Office server".
 *
 * That was first fixed with a pool — eight reads in flight, never more — which kept the page alive
 * at 15,120 records but left the NUMBER of requests growing with the workspace. `GET /api/links`
 * removed the growth: the page asks for the graph once. So the first test below is about how many
 * requests the page makes and about nothing else, and the second is that the one request is really
 * where the lines come from.
 *
 * The second is what the measuring found on the way past: on a big drawing `Fit all` offered a zoom
 * the canvas is not allowed to go to, and then went there.
 *
 * NEITHER OF THESE IS A TIMING TEST. A timing test on this machine would be a test of this machine.
 * Both check a property that is true at any size: a bound on concurrency, and a floor under a zoom.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PanelRecord } from '../src/shared/types.ts'

type Page = typeof import('../src/web/pages/PipelinePage.tsx')
type Api = typeof import('../src/web/api.ts')
type Layout = typeof import('../src/web/components/graph/layout.ts')

let page: Page
let apiModule: Api
let layout: Layout

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope to restore who you are acting as, and
  // the page reaches it through the component library.
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
  page = await import('../src/web/pages/PipelinePage.tsx')
  apiModule = await import('../src/web/api.ts')
  layout = await import('../src/web/components/graph/layout.ts')
})

/** A module record, enough of one for the loader to decide it is structural. */
function moduleRecord(n: number): PanelRecord & { incompleteCount: number } {
  return {
    id: `m${n}`,
    kind: 'module',
    title: `module ${n}`,
    summary: null,
    data: {},
    createdAt: '2026-08-10 09:00:00',
    updatedAt: '2026-08-10 09:00:00',
    deletedAt: null,
    incompleteCount: 0,
  } as PanelRecord & { incompleteCount: number }
}

describe('the pipeline page asks for the links once, so no browser can refuse them', () => {
  /** Runs `loadPage` against a workspace of `count` modules and counts what it asked for. */
  async function loadWith(count: number): Promise<{ perRecord: number; bulk: number; links: number }> {
    const records = Array.from({ length: count }, (_, i) => moduleRecord(i))
    let perRecord = 0
    let bulk = 0

    vi.spyOn(apiModule.api, 'recordsOf').mockResolvedValue({
      records,
      matched: records.length,
      returned: records.length,
      left: 0,
      truncated: false,
      next: null,
    })
    vi.spyOn(apiModule.api, 'attention').mockResolvedValue({
      visible: [],
      remainder: [],
    } as unknown as Awaited<ReturnType<Api['api']['attention']>>)
    vi.spyOn(apiModule.api, 'getRecord').mockImplementation(async (id: string) => {
      perRecord++
      return { record: records[0], links: [] } as unknown as Awaited<ReturnType<Api['api']['getRecord']>>
    })
    vi.spyOn(apiModule.api, 'listLinks').mockImplementation(async () => {
      bulk++
      // A real reply crosses a socket. Resolving in the same tick would let a page that reads the
      // links in some later, unawaited pass look as if it had them.
      await new Promise((resolve) => setTimeout(resolve, 0))
      return []
    })

    const loaded = await page.loadPage()
    expect(loaded.records).toHaveLength(count)
    const links = loaded.links.length
    vi.restoreAllMocks()
    return { perRecord, bulk, links }
  }

  it('asks the same number of times for two thousand records as for ten', async () => {
    // Two thousand structural records: past the ~1,356 outstanding fetches Chromium will queue, and
    // the size at which the page was a total loss before this. The count is what the test is about,
    // so it is stated here rather than derived from anything.
    const small = await loadWith(10)
    const large = await loadWith(2_000)

    // THE ASSERTION THIS FILE EXISTS FOR. It used to be one read per structural record — 2,000 of
    // them, created in one tick, 726 refused by the browser without ever reaching the server. A
    // pool made that eight at a time, which kept the page alive and left the NUMBER of requests
    // growing with the workspace. One request for the whole graph makes it a constant.
    expect(large.bulk).toBe(small.bulk)
    expect(large.bulk).toBe(1)

    // And it reads them the new way and not both ways. A page that kept the per-record reads as
    // well would pass the line above and still die at two thousand records.
    expect(large.perRecord).toBe(0)
    expect(small.perRecord).toBe(0)
  })

  it('draws the lines the one read carries, rather than an empty graph that cannot fail', async () => {
    // The test above counts requests, and a `loadPage` that asked once and threw the answer away
    // would satisfy every line of it. This is the other half: what came back is what the page has.
    const link = {
      id: 'l1',
      fromId: 'm0',
      toId: 'm1',
      type: 'blocks',
      inferred: false,
      createdAt: '2026-08-10 09:00:00',
      createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
      gate: { kind: 'hard' },
      gateLabel: 'must finish first',
      gateProblem: null,
      broken: false,
    }
    const twoModules = [moduleRecord(0), moduleRecord(1)]
    vi.spyOn(apiModule.api, 'recordsOf').mockResolvedValue({
      records: twoModules,
      matched: twoModules.length,
      returned: twoModules.length,
      left: 0,
      truncated: false,
      next: null,
    })
    vi.spyOn(apiModule.api, 'attention').mockResolvedValue({
      visible: [],
      remainder: [],
    } as unknown as Awaited<ReturnType<Api['api']['attention']>>)
    vi.spyOn(apiModule.api, 'listLinks').mockResolvedValue([
      link as unknown as Awaited<ReturnType<Api['api']['listLinks']>>[number],
    ])

    const loaded = await page.loadPage()

    expect(loaded.links).toHaveLength(1)
    // Both ends by id, in the stored direction, with the gate read — which is the whole of what
    // the old per-record path needed a point of view and a deduplication to arrive at.
    expect(loaded.links[0]).toMatchObject({
      linkId: 'l1',
      fromId: 'm0',
      toId: 'm1',
      type: 'blocks',
      broken: false,
      gate: { at: 'gate', gate: { kind: 'hard' } },
    })

    vi.restoreAllMocks()
  })
})

describe('a drawing too big for the canvas says so instead of promising to fit it', () => {
  it('never zooms out past the floor MIN_ZOOM exists to enforce, and reports what that cost', () => {
    // 1,080 module cards laid out by ELK come to 319,156 × 364 pixels — measured, on the 40×
    // database. Fitting that into a 1,400 × 760 window needs zoom 0.004, and MIN_ZOOM is 0.1
    // because "below this a card is a grey rectangle". `setViewport` obeys whatever it is handed,
    // so before this the button drove the canvas to 0.004: the whole drawing became a line 1,276
    // pixels wide and one and a half tall, and the readout said 0%.
    const huge = { minX: 0, minY: 0, width: 319_156, height: 364 }
    expect(layout.fitZoomFor(huge, 1400, 760)).toBeLessThan(layout.MIN_ZOOM)

    const fit = layout.fitAllFor(huge, 1400, 760)
    expect(fit.zoom).toBe(layout.MIN_ZOOM)
    // It cannot show the whole shape, and it says which rather than claiming it did.
    expect(fit.whole).toBe(false)
    expect(fit.shows).toBeLessThan(1)
    expect(fit.shows).toBeCloseTo(layout.visibleFraction(huge, 1400, 760, layout.MIN_ZOOM), 10)

    // In windows, which is the unit a reader can act on: 194 across at the zoom it opens at.
    const windows = layout.windowsOf(huge, 1400, 760, layout.openingZoom(huge, 1400, 760))
    expect(windows.across).toBe(194)
    expect(windows.down).toBe(1)
  })

  it('still fits a drawing that fits, and still says the whole shape is there', () => {
    // The seeded workspace: 27 modules, 7,924 × 364, which fits at 0.17 — above the floor, so
    // nothing about this size changed and `Fit all` means what it says.
    const seeded = { minX: 0, minY: 0, width: 7_924, height: 364 }
    const fit = layout.fitAllFor(seeded, 1400, 760)
    expect(fit.zoom).toBeGreaterThan(layout.MIN_ZOOM)
    expect(fit.zoom).toBe(layout.fitZoomFor(seeded, 1400, 760))
    expect(fit.whole).toBe(true)
    expect(fit.shows).toBeCloseTo(1, 10)
  })
})
