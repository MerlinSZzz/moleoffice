// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NUMBERED LIST IN A REPORT KEEPS COUNTING PAST A PARAGRAPH INDENTED INSIDE ONE OF ITS ITEMS.
 * Problem wcvJmktc4VAL.
 *
 * A report's text block held a numbered list whose item 2 had a short list under it, a blank line, and
 * then a paragraph indented under the item; the next item, 3, was drawn as 1. `readList` in
 * src/web/components/SummaryBlocks.tsx ended the list at any blank line not followed by another item,
 * so the indented paragraph closed it and item 3 opened a new `ol`, which a browser starts at one.
 * It now reads a line written at least two spaces deeper than the list's items, after a blank line, as
 * a paragraph inside the item above it (CommonMark's list-item continuation), and the list goes on.
 *
 * The shape below is exactly that block's: "1." then "2." holding a three-space-indented sub-list, a
 * blank line and a three-space-indented paragraph, then "3." and on. The words are made up.
 *
 * MUTATION, proved on 3 October 2026: the continuation branch in readList taken out (the blank line
 * ending the list again): the first case goes red, three lists instead of one.
 */
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')

let sb: SummaryBlocksModule
let h: typeof import('react').createElement
let toMarkup: (el: ReactNode) => string

beforeAll(async () => {
  // The component library reaches src/web/api.ts, which reads window.localStorage while it is being
  // evaluated: the same stand-in tests/summary-markdown.test.ts uses.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const react = await import('react')
  const server = await import('react-dom/server')
  h = react.createElement
  toMarkup = (el) => server.renderToStaticMarkup(el as never)
  sb = await import('../src/web/components/SummaryBlocks.tsx')
})

/** One report text block, drawn, with the hoisted stylesheets taken out. */
function drawn(md: string): string {
  return toMarkup(h('div', null, sb.renderMarkdown(md, 't', null, null))).replace(/<style[\s\S]*?<\/style>/g, '')
}

const THE_SHAPE = [
  '1. **Who may press the stop button in the kiln room?** Only the studio lead today.',
  '2. **Delete the duplicate glaze photos?** Two kinds are second copies:',
  '   - the copies the camera kept;',
  '   - the raw scans, whose cleaned versions are saved.',
  '',
  '   The recommendation is to delete both kinds, after a dry run.',
  '3. **Must a decision in the studio lead\'s name quote the lead?**',
  '   - A: only the lead\'s own words.',
  '   - B: as now, but marked.',
  '',
  '   The recommendation is A.',
  '4. **Which grouping for the shelf list?**',
].join('\n')

describe('a numbered list with a paragraph indented inside an item', () => {
  it('is one list, so item 3 is drawn as the third item and not as a new first one', () => {
    const html = drawn(THE_SHAPE)
    const lists = html.match(/<ol\b/g) ?? []
    expect(lists, html).toHaveLength(1)
    // The items of that one list are the four the author numbered, in order.
    const outer = /<ol\b[^>]*>([\s\S]*)<\/ol>/.exec(html)![1]!
    const topItems = outer.split(/<li\b/).length - 1 - (outer.match(/<ul\b[\s\S]*?<\/ul>/g) ?? []).reduce((n, ul) => n + (ul.split(/<li\b/).length - 1), 0)
    expect(topItems, html).toBe(4)
  })

  it('draws the indented paragraph inside its item, after the item\'s own list', () => {
    const html = drawn(THE_SHAPE)
    const second = /<li\b[^>]*>(?:(?!<li\b)[\s\S])*?Delete the duplicate glaze photos[\s\S]*?(?=<li\b[^>]*>(?:<strong>)?Must a decision)/.exec(html)?.[0] ?? ''
    expect(second, html).toContain('the raw scans')
    expect(second, html).toContain('<p class="sb-li-p"')
    expect(second.indexOf('the raw scans'), 'the paragraph comes after the list it follows').toBeLessThan(second.indexOf('The recommendation is to delete'))
  })

  it('still ends the list at a paragraph that is not indented under it', () => {
    const html = drawn(['1. One.', '2. Two.', '', 'A paragraph of its own.', '', '1. A new list.'].join('\n'))
    expect(html.match(/<ol\b/g) ?? [], html).toHaveLength(2)
    expect(html).toMatch(/<\/ol><p[^>]*>A paragraph of its own\.<\/p>/)
  })
})
