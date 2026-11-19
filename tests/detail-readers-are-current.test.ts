// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

import { DETAIL_READERS } from '../src/shared/detail-readers.generated.ts'
import { RUNGS } from '../src/shared/detail.ts'
import { detailSupplyOf } from '../src/shared/detailsupply.ts'
import type { PanelRecord } from '../src/shared/types.ts'

// `DetailSays.tsx` reaches `api.ts`, which reads the chosen workspace out of `window` at import
// time. The same shim `tests/how-much-each-thing-says.test.ts` uses, for the same reason.
let says: typeof import('../src/web/components/DetailSays.tsx')

beforeAll(async () => {
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
  says = await import('../src/web/components/DetailSays.tsx')
})

describe('the reader source scan', () => {
  it('ignores calls in comments and keeps a call after a URL string', async () => {
    const { countReadersInText } = await import('../tools/detail-readers.mjs')
    const source = [
      "// useDetail('reportContent', kind)",
      "/* detailFor('reportContent') */",
      "const url = 'https://example.test/path//part'; useDetail('reportContent', kind)",
      "detailFor('reportContent')",
    ].join('\n')

    expect(countReadersInText(source, ['reportContent'])).toEqual({ reportContent: 2 })
  })
})

/** Two records, so the grid draws rows and a preview and neither is an empty-corpus special case. */
const CORPUS: PanelRecord[] = [
  {
    id: 'aaaaaaaaaaaa',
    kind: 'note',
    title: 'A note this corpus holds',
    summary: 'A summary long enough that more than one position has something to say about it.',
    state: null,
    workspace: 'panelx',
    createdAt: '2026-08-26T09:00:00',
    updatedAt: '2026-08-26T09:00:00',
    data: {},
  } as unknown as PanelRecord,
  {
    id: 'bbbbbbbbbbbb',
    kind: 'report',
    title: 'A report this corpus holds',
    summary: 'Another summary, different from the first, so the preview has something to choose.',
    state: null,
    workspace: 'panelx',
    createdAt: '2026-08-26T09:00:00',
    updatedAt: '2026-08-26T09:00:00',
    data: {},
  } as unknown as PanelRecord,
]

// `DetailGrid` draws what GET /api/records/detail-supply answers, and `detailSupplyOf` is that door's
// own counting, so the corpus is handed to it as the server would count it. No cast: a change to what
// the grid takes is then a type error here, not a crash at run time.
const draw = (): string => renderToStaticMarkup(h(says.DetailGrid, { answer: detailSupplyOf(CORPUS) }))

describe('the Settings row draws the count it was generated with', () => {
  it('really drew the grid, so a search of an empty string cannot pass quietly', () => {
    const html = draw()
    expect(html).toContain('Everywhere')
    expect(html).toContain('Report content')
  })

  /**
   * THE CONSUMPTION PROOF, AND IT ASSERTS ON WHAT IS DRAWN. Three surfaces with three different
   * counts today — `home` 1, `reportContent` 2, `review` 0 — so a constant drawn on the row instead
   * of the generated number cannot satisfy all three whatever constant is chosen.
   */
  it('draws each row the number the generated file holds for that surface', () => {
    const html = draw()
    const found: Record<string, string> = {}
    for (const m of html.matchAll(/data-detail-row="([a-zA-Z]+)"/g)) found[m[1] ?? ''] = ''
    const drawn = [...html.matchAll(/<span class="dsay-readers"[^>]*data-readers="(\d+)"[^>]*>read by (\d+)<\/span>/g)]
    expect(drawn.length, 'no row drew a reader count at all').toBeGreaterThan(0)
    // The attribute and the words are the same number on every row it drew.
    for (const one of drawn) expect(one[1]).toBe(one[2])
    const counts = drawn.map((one) => Number(one[1])).sort((a, b) => a - b)
    const expected = Object.values(DETAIL_READERS).sort((a, b) => a - b)
    expect(counts).toEqual(expected)
  })

  it('separates the row name from the count in the TEXT, and not with a margin', () => {
    // ab0eaba named this exact string as the defect its photographs found — "Home cardsread by 1" —
    // and fixed it with "One margin". A margin is not a space: the element's own text still ran the
    // two words together, so a screen reader said "Home cardsread by one" and a search of the page
    // for the row's name found nothing. This reads the markup with the tags taken out, which is
    // what a screen reader and a text search both see.
    // THE STYLESHEET IS DRAWN INTO THE MARKUP by this component, and its own comment quotes the
    // defect string, so the style element goes first or this test would be reading its own history.
    const text = draw()
      .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&[a-z]+;/g, ' ')
    expect(text, 'the row name and its reader count are one word in the text').not.toMatch(/[a-z]read by \d/)
    // AND THE SEPARATOR IS THERE, so this is not passing because nothing drew.
    expect(text).toMatch(/\sread by \d/)
  })

  it('draws the number on the row rather than only in a tooltip', () => {
    // THE NUMBER IS A VISIBLE RUN OF TEXT. A tooltip would put it inside a `title=` and this fails.
    //
    // IT WAS THE LITERAL `read by 2` UNTIL 2 SEPTEMBER 2026, and that is what changed here. The
    // record page's *Shorter forms* panel became a second reader of `reportContent` that day, the
    // scan went to 3, and no surface scanned to 2 any more — so the literal stopped naming any row
    // and this test went red on a product that was drawing the number correctly. A literal here is
    // a second copy of a generated count, which is this repository's recurring defect at its
    // smallest size. It is read off the generated file now.
    const most = Math.max(...Object.values(DETAIL_READERS))
    expect(most, 'every surface scans to zero, so there is no number to look for').toBeGreaterThan(0)
    expect(draw()).toContain(`read by ${String(most)}`)
  })
})

describe('a count of zero hides nothing', () => {
  /**
   * §3.4's measured case: a control that works and scans to zero. If `0` ever gates the drawing,
   * this goes red — and it is the one test in this file that could not be replaced by reading the
   * generated file, because it asks what the person can reach on the page.
   */
  it('still draws the full radio group for a surface the scan counted zero for', () => {
    const zeros = Object.entries(DETAIL_READERS).filter(([, readers]) => readers === 0)
    expect(zeros.length, 'no surface scans to zero, so this test proves nothing today').toBeGreaterThan(0)
    const html = draw()
    for (const [surface] of zeros) {
      const cells = [...html.matchAll(new RegExp(`data-detail-row="${surface}"`, 'g'))]
      expect(cells.length, `${surface} drew ${cells.length} cells, not ${RUNGS.length}`).toBe(RUNGS.length)
      // And the group itself is there, with its own name, so a keyboard can reach it.
      expect(html).toContain(`data-readers="0"`)
    }
  })

  it('leaves every cell of a zero-count row pressable, so a stored choice stays reachable', () => {
    const html = draw()
    const zero = Object.entries(DETAIL_READERS).find(([, readers]) => readers === 0)?.[0] ?? ''
    // Every cell of that row is a real button. A hidden or disabled row would draw none of these.
    const buttons = [...html.matchAll(new RegExp(`<button[^>]*data-detail-row="${zero}"[^>]*>`, 'g'))]
    expect(buttons.length).toBe(RUNGS.length)
    for (const one of buttons) expect(one[0]).not.toContain('disabled')
  })
})
