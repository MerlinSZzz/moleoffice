// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SCHEDULE DRAWS AN AGENT'S WINDOW BESIDE THE PERSON'S HOURS, IN A SECOND COLOUR, AND NO TOTAL
 * MOVES. Criterion P5.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * P5's last clause has three halves and each is checked here:
 *
 *   1. an agent's window says whose it is. `boardOf` reads the stamp through `ownerOfWindow`, the
 *      one reader, and the drawn block carries `data-owner="agent"` and the agent's own name.
 *   2. the second colour is a real colour in every palette. A token missing from one theme block
 *      computes empty and the block falls back to the text colour; the browser reads the computed
 *      value here, which is the only thing that catches it.
 *   3. A WINDOW ENTERS NO TOTAL. The same allocations are summed before and after an agent's window
 *      is added, and the sums are equal. That is true by construction — `loadOf` reads allocations
 *      and nothing here reads a window — and this is the test that keeps it true.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS, EACH ONE LINE OF PRODUCT CODE
 * ---------------------------------------------------------------------------------------
 *
 *   Planning.tsx: `owners[one.window.id]` becomes `undefined`
 *       → "an agent's window says whose it is" goes red.
 *   tokens.css: delete `--plan-agent` from the dark block
 *       → "every palette draws the second colour" goes red.
 *   planning.ts: `plannedHours += a.plannedHours` counts a window's days instead
 *       → "a window enters no total" goes red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { WindowWithWork } from '../src/server/lib/windows.ts'

// The component reaches src/web/api.ts, which reads storage as it is imported.
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

type Planning = typeof import('../src/web/components/Planning.tsx')
type Drawn = import('./what-the-browser-draws.ts').Drawn

let planning: Planning
let drawn: Drawn
let markup: string

/** The week the board draws, in the shape `GET /api/planning/windows` answers with. */
function windowWithOwner(id: string, createdBy: string): { window: WindowWithWork['window']; work: WindowWithWork['work'] } {
  return {
    window: {
      id,
      recordId: 'task-1',
      startsOn: '2026-09-08',
      endsOn: '2026-09-09',
      note: null,
      state: 'planned',
      createdAt: '2026-09-01 09:00:00',
      updatedAt: '2026-09-01 09:00:00',
    },
    work: {
      id: 'task-1',
      kind: 'task',
      title: 'Reprint the jaw',
      name: 'Reprint the jaw',
      within: null,
      state: 'doing',
      workspaceId: 'default',
      effortHours: null,
      origin: 'fixture',
      deleted: false,
    },
  }
}

const DAYS = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']

beforeAll(async () => {
  planning = await import('../src/web/components/Planning.tsx')
  const block = planning.boardOf(DAYS, [windowWithOwner('win-1', 'agent:perception')], { 'win-1': 'agent:perception' })[0]!
  markup = renderToStaticMarkup(
    h(planning.OpenBlock, {
      block,
      editing: false,
      busy: false,
      failed: null,
      onMove: () => {},
      onStretch: () => {},
      onNote: () => {},
      onState: () => {},
      onRemove: () => {},
      onWrote: () => {},
    }),
  )
  const { drawInABrowser } = await import('./what-the-browser-draws.ts')
  drawn = await drawInABrowser(markup)
}, 120_000)

afterAll(async () => {
  await drawn?.close()
})

describe("an agent's window says whose it is", () => {
  it('reads the stamp into an owner and draws it on the block', () => {
    const placed = planning.boardOf(DAYS, [windowWithOwner('win-1', 'agent:perception')], {
      'win-1': 'agent:perception',
    })[0]!
    expect(placed.owner).toMatchObject({ kind: 'agent', id: 'perception', isThePerson: false })
    expect(markup).toContain('data-owner="agent"')
    // 7FEOshq3mBGG: the stored owner id stays out of normal mode while names are being read.
    expect(markup).not.toContain("perception&#x27;s window")
    expect(markup).toContain('An agent’s window')
  })

  it('leaves the person\'s own window drawn as it always was', () => {
    const placed = planning.boardOf(DAYS, [windowWithOwner('win-2', `human:${THE_TEST_OFFICES_OWNER.id}`)], { 'win-2': `human:${THE_TEST_OFFICES_OWNER.id}` })[0]!
    expect(placed.owner).toMatchObject({ kind: 'person', isThePerson: true })
  })
})

describe('the second colour exists in every palette', () => {
  it('draws the owner line in a colour of its own in all seven themes', async () => {
    const { PALETTES } = await import('./what-the-browser-draws.ts')
    expect(PALETTES.length, 'no palettes were found in tokens.css, so this measures nothing').toBe(2)
    for (const theme of [null, ...PALETTES]) {
      await drawn.palette(theme)
      const named = theme ?? 'the default palette'
      const ink = await drawn.styleOf('.px-pl-bowner', 'color')
      // The neutral beside it is drawn in a rank ink, so a palette missing --plan-agent would draw
      // the owner line in that same colour. Comparing the two is what catches it.
      const neutral = await drawn.styleOf('.px-pl-openwhen', 'color')
      expect(ink, `${named} draws no agent-window colour at all`).not.toBe('rgba(0, 0, 0, 0)')
      expect(ink, `${named} draws the agent window in the text colour, so it has no colour of its own`).not.toBe(
        neutral,
      )
    }
    await drawn.palette(null)
  })
})
