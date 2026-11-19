// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO DOLLAR SIGNS INSIDE A LINE OF TEXT DRAW A DISPLAY FORMULA.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The inline reader in src/shared/inline.ts knew one dollar sign only. A paragraph holding
 * `$$x^2$$` was read as a dollar sign, the inline formula x^2 and another dollar sign. So a report
 * or a message showed two stray dollar signs round a small formula inside the line, where its
 * writer had asked for a formula on a line of its own.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS ASSERTS, ONE CASE FOR EACH RULE
 * ---------------------------------------------------------------------------------------
 *
 * - `$$…$$` inside text is a display formula. It is drawn on its own line and centred, with the
 *   drawing a report's maths block gives the same formula.
 * - `$…$` stays an inline formula, also in the paragraph that holds a display.
 * - A lone `$$`, or one that never closes, stays the characters typed. Its second dollar does not
 *   open an inline formula with a later dollar sign.
 * - A dollar sign inside code stays a character. That holds also when a dollar sign earlier on the
 *   line would otherwise pair with it.
 *
 * Three halves. The first reads the pieces the reader cuts a line into. The second draws a report
 * paragraph and a chat message to static markup. The third opens a report in the built app, at 1440
 * and at 390, and measures where the display sits. Run `npm run build` before this file, because the
 * third half reads dist/web.
 *
 * Set DOLLAR_DISPLAY_SHOTS to a folder to photograph the report at the four widths in both themes.
 * The ordinary run and the mutation runs take no picture.
 *
 * The formulas are textbook ones written for this file: the area of a circle, the mean of a sample
 * and the sides of a right triangle.
 */

import { mkdirSync } from 'node:fs'
import { createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { inlinePieces } from '../src/shared/inline.ts'
import { loadMathsDrawing, MathText } from '../src/web/components/MathText.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')

const AREA = '\\pi r^2'
const MEAN = '\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i'
const SIDES = 'a^2 + b^2 = c^2'

/** A report paragraph holding both forms: two inline formulas, and a display between them. */
const BOTH_FORMS = `The mean $\\bar{x}$ of a sample is $$${MEAN}$$ where each $x_i$ is one reading.`

// ============================================================ half one: the pieces

describe('the reader cuts a line into the pieces its dollar signs ask for', () => {
  /** Every case below, with the pieces it must give. Each one's pieces also join back into it. */
  const CASES: Array<[name: string, line: string, pieces: unknown[]]> = [
    [
      'two dollar signs inside text make a display formula',
      `The area is $$${AREA}$$ for a circle.`,
      [
        { kind: 'words', raw: 'The area is ' },
        { kind: 'maths', raw: `$$${AREA}$$`, tex: AREA, display: true },
        { kind: 'words', raw: ' for a circle.' },
      ],
    ],
    [
      'one dollar sign either side stays an inline formula',
      'the side $a$ and the side $b$',
      [
        { kind: 'words', raw: 'the side ' },
        { kind: 'maths', raw: '$a$', tex: 'a' },
        { kind: 'words', raw: ' and the side ' },
        { kind: 'maths', raw: '$b$', tex: 'b' },
      ],
    ],
    [
      'a lone pair of dollar signs stays as text, and its second dollar opens nothing',
      'a lone $$ sign, then the side $c$',
      [
        { kind: 'words', raw: 'a lone $$ sign, then the side ' },
        { kind: 'maths', raw: '$c$', tex: 'c' },
      ],
    ],
    [
      'a pair of dollar signs that never closes stays as text',
      'it opens $$x^2 and the side $b$ stays inline',
      [
        { kind: 'words', raw: 'it opens $$x^2 and the side ' },
        { kind: 'maths', raw: '$b$', tex: 'b' },
        { kind: 'words', raw: ' stays inline' },
      ],
    ],
    [
      'a dollar sign inside code stays a character, though a dollar before the code could pair with it',
      'a price of $5 and the marker `$$` in code',
      [
        { kind: 'words', raw: 'a price of $5 and the marker ' },
        { kind: 'code', raw: '`$$`', text: '$$' },
        { kind: 'words', raw: ' in code' },
      ],
    ],
    [
      'code that holds two dollar signs does not stop a display after it',
      `write \`$$\` to open one: $$${SIDES}$$`,
      [
        { kind: 'words', raw: 'write ' },
        { kind: 'code', raw: '`$$`', text: '$$' },
        { kind: 'words', raw: ' to open one: ' },
        { kind: 'maths', raw: `$$${SIDES}$$`, tex: SIDES, display: true },
      ],
    ],
  ]

  for (const [name, line, pieces] of CASES) {
    it(name, () => {
      const read = inlinePieces(line)
      expect(read).toEqual(pieces)
      expect(read.map((piece) => piece.raw).join('')).toBe(line)
    })
  }
})

// ============================================================ half two: the drawing

describe('a report paragraph and a chat message draw the display on a line of its own', () => {
  let sb: SummaryBlocksModule

  beforeAll(async () => {
    // The component library reaches src/web/api.ts, which reads window.localStorage while it is
    // being evaluated. The same stand-in tests/summary-markdown.test.ts uses.
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
    sb = await import('../src/web/components/SummaryBlocks.tsx')
    // Static markup runs no effects, so the drawing code is loaded first, as MathText loads it.
    await loadMathsDrawing()
  })

  /** Markup with the hoisted stylesheets taken out, so a class named in a stylesheet is not read as drawn. */
  const markupOf = (node: ReactNode): string =>
    renderToStaticMarkup(node as never).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

  const report = (blocks: unknown[]): string => markupOf(h(sb.SummaryBlocks, { blocks: blocks as never }))
  const paragraph = (text: string): string => report([{ type: 'text', id: 't', text }])
  const chat = (text: string): string =>
    markupOf(h('div', null, ...sb.renderMarkdown(text, 'chat', null, null, { lineBreaks: true })))
  const displayOf = (tex: string): string => markupOf(h(MathText, { tex, display: true }))

  /** Each `<p>` element in the markup that holds a `<div>`, which HTML cannot nest. */
  const blocksInsideAParagraph = (markup: string): string[] =>
    [...markup.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1] ?? '').filter((inside) => inside.includes('<div'))

  it('draws one display and two inline formulas in a paragraph holding both forms', () => {
    const drawn = paragraph(BOTH_FORMS)
    expect(drawn.match(/class="katex"/g), 'the three formulas are not all drawn by KaTeX').toHaveLength(3)
    expect(drawn.match(/katex-display/g), 'the display is not drawn as a display').toHaveLength(1)
    expect(drawn.match(/class="mt mt-display"/g)).toHaveLength(1)
    expect(drawn).not.toContain('$')
    expect(drawn).toContain('The mean ')
    expect(drawn).toContain(' of a sample is ')
    expect(drawn).toContain(' is one reading.')
  })

  it("gives the display the drawing a report's maths block gives the same formula", () => {
    const display = displayOf(MEAN)
    expect(display).toContain('katex-display')
    expect(report([{ type: 'math', id: 'm', tex: MEAN }])).toContain(display)
    expect(paragraph(BOTH_FORMS)).toContain(display)
  })

  it('keeps the paragraph a p, and the p holds no block', () => {
    // A screen reader moves by paragraph, so a paragraph holding a display is still one. HTML
    // closes a p at the first div inside it, so the display may not be drawn as one.
    const drawn = paragraph(BOTH_FORMS)
    expect(drawn).toMatch(/<p[^>]*class="sb-p"/)
    expect(drawn).not.toMatch(/<div[^>]*class="sb-p"/)
    expect(blocksInsideAParagraph(drawn), 'a p holds a block').toEqual([])
  })

  it('draws a lone pair of dollar signs, and a dollar sign inside code, as the characters typed', () => {
    const lone = paragraph('a lone $$ sign, then the side $c$')
    expect(lone).toContain('a lone $$ sign, then the side ')
    expect(lone.match(/role="math"/g)).toHaveLength(1)
    expect(lone).toContain('aria-label="c"')

    const code = paragraph('a price of $5 and the marker `$$` in code')
    expect(code).not.toContain('role="math"')
    expect(code).toContain('a price of $5 and the marker ')
    expect(code).toMatch(/<code class="[^"]*">\$\$<\/code>/)
  })

  it('draws a display in a chat message on its own line, with no line break beside it', () => {
    // A line break beside a display would draw an empty line, because the display is a line already.
    const drawn = chat(`first line\n$$${SIDES}$$\nlast line`)
    expect(drawn).toContain(displayOf(SIDES))
    expect(drawn.match(/<br\s*\/?>/g) ?? []).toEqual([])
    expect(blocksInsideAParagraph(drawn), 'a p holds a block').toEqual([])
    expect(drawn).toContain('first line')
    expect(drawn).toContain('last line')
  })

  it('still draws the other line breaks of a chat message', () => {
    expect(chat('first line\nsecond line with $a$').match(/<br\s*\/?>/g)).toHaveLength(1)
  })
})

// ============================================================ half three: in a browser

/** Where one box sits on the page, in CSS pixels. */
interface Box {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

/** What the page measured of the paragraph holding both forms, and of the maths block below it. */
interface Measured {
  paragraph: Box
  display: Box
  displayFormula: Box
  displayAlign: string
  displayKind: string
  wordsBefore: Box
  wordsAfter: Box
  inline: Array<{ kind: string; height: number }>
  block: Box
  blockFormula: Box
  lineHeight: number
}

const REPORT = [
  { id: 'b-1', type: 'text', heading: 'A formula of its own inside a paragraph', text: BOTH_FORMS },
  { id: 'b-2', type: 'math', tex: MEAN },
]

async function measure(page: Page): Promise<Measured> {
  return await page.evaluate(() => {
    const box = (r: DOMRect) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height })
    // WHERE THE FORMULA IS DRAWN: KaTeX's own box for a display is as wide as the line, so the
    // formula is the boxes of its parts, which KaTeX calls bases, put together.
    const drawnIn = (holder: Element): Box => {
      const parts = [...holder.querySelectorAll('.katex-html > .base')].map((one) => one.getBoundingClientRect())
      if (parts.length === 0) throw new Error('a display holds no drawn formula')
      const left = Math.min(...parts.map((r) => r.left))
      const right = Math.max(...parts.map((r) => r.right))
      const top = Math.min(...parts.map((r) => r.top))
      const bottom = Math.max(...parts.map((r) => r.bottom))
      return { left, right, top, bottom, width: right - left, height: bottom - top }
    }
    const holder = [...document.querySelectorAll('.sb-text .sb-p')].find((p) => p.querySelector('.mt-display') !== null)
    if (holder === undefined) throw new Error('no paragraph on the page holds a display formula')
    const display = holder.querySelector('.mt-display') as HTMLElement
    // The words either side of the display, measured as the text they are rather than their element.
    const textNode = (words: string): Box => {
      const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const at = (node.textContent ?? '').indexOf(words)
        if (at === -1) continue
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + words.length)
        return box(range.getBoundingClientRect())
      }
      throw new Error(`the words "${words}" are not in the paragraph`)
    }
    const block = document.querySelector('.sb-math .mt-display') as HTMLElement | null
    if (block === null) throw new Error('the maths block is not on the page')
    return {
      paragraph: box(holder.getBoundingClientRect()),
      display: box(display.getBoundingClientRect()),
      displayFormula: drawnIn(display),
      displayAlign: getComputedStyle(display).textAlign,
      displayKind: getComputedStyle(display).display,
      wordsBefore: textNode('of a sample is'),
      wordsAfter: textNode('where each'),
      inline: [...holder.querySelectorAll('.mt:not(.mt-display)')].map((one) => ({
        kind: getComputedStyle(one).display,
        height: one.getBoundingClientRect().height,
      })),
      block: box(block.getBoundingClientRect()),
      blockFormula: drawnIn(block),
      lineHeight: parseFloat(getComputedStyle(holder).lineHeight),
    }
  })
}

describe('in the built app, the display sits on its own line, centred, as a maths block does', () => {
  let app: LiveApp
  let page: Page
  let reportId: string

  beforeAll(async () => {
    app = await liveApp({ opensAt: 'full', name: 'two-dollar-signs-draw-a-display', viewport: { width: 1440, height: 1000 } })
    page = app.page
    const res = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'report',
        title: 'A paragraph with a formula of its own',
        summary: 'A made-up report, so where a display formula inside a paragraph sits can be measured.',
        data: { blocks: REPORT },
      }),
    })
    if (!res.ok) throw new Error(`filing the report answered ${String(res.status)}: ${await res.text()}`)
    reportId = ((await res.json()) as { record: { id: string } }).record.id
    await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    // Three formulas in the paragraph and one in the block, all drawn, with KaTeX's fonts in.
    await page.locator('.katex').nth(3).waitFor({ timeout: 60_000 })
    await page.evaluate(async () => {
      await document.fonts.ready
    })
  }, 240_000)

  afterAll(async () => {
    try {
      await photograph()
    } finally {
      await app?.stop()
    }
  }, 180_000)

  /** The pictures, taken only when a folder for them is given. */
  async function photograph(): Promise<void> {
    const shots = process.env['DOLLAR_DISPLAY_SHOTS']
    if (!shots || page === undefined) return
    mkdirSync(shots, { recursive: true })
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 1000 })
        await page.emulateMedia({ colorScheme: theme })
        await page.locator('.sb-text .sb-p:has(.mt-display)').scrollIntoViewIfNeeded()
        await page.waitForTimeout(300)
        await page.screenshot({ path: `${shots}/paragraph-with-both-forms-${String(width)}-${theme}.png` })
      }
    }
  }

  for (const width of [1440, 390]) {
    it(`at ${String(width)} pixels wide`, async () => {
      await page.setViewportSize({ width, height: 1000 })
      await page.waitForTimeout(300)
      const at = await measure(page)

      // ON ITS OWN LINE: as wide as the paragraph, below the words before it and above the words after.
      expect(at.displayKind).toBe('block')
      expect(Math.abs(at.display.left - at.paragraph.left), 'the display does not start at the paragraph edge').toBeLessThanOrEqual(1)
      expect(Math.abs(at.display.right - at.paragraph.right), 'the display does not reach the paragraph edge').toBeLessThanOrEqual(1)
      expect(at.wordsBefore.bottom, 'the words before the display share its line').toBeLessThanOrEqual(at.display.top + 1)
      expect(at.wordsAfter.top, 'the words after the display share its line').toBeGreaterThanOrEqual(at.display.bottom - 1)

      // CENTRED: as much room to the left of the drawn formula as to its right.
      expect(at.displayAlign).toBe('center')
      const roomLeft = at.displayFormula.left - at.display.left
      const roomRight = at.display.right - at.displayFormula.right
      expect(Math.abs(roomLeft - roomRight), `the formula is not centred: ${String(roomLeft)} left, ${String(roomRight)} right`).toBeLessThanOrEqual(2)

      // THE SAME AS A MATHS BLOCK: the same formula is drawn at the same size, in a box as tall.
      const sizes = `paragraph ${JSON.stringify([at.displayFormula, at.display])}, block ${JSON.stringify([at.blockFormula, at.block])}`
      expect(Math.abs(at.displayFormula.width - at.blockFormula.width), sizes).toBeLessThanOrEqual(0.5)
      expect(Math.abs(at.displayFormula.height - at.blockFormula.height), sizes).toBeLessThanOrEqual(0.5)
      expect(Math.abs(at.display.height - at.block.height), sizes).toBeLessThanOrEqual(0.5)

      // THE TWO INLINE FORMULAS stay inside their lines.
      expect(at.inline).toHaveLength(2)
      for (const one of at.inline) {
        expect(one.kind).toBe('inline')
        expect(one.height).toBeLessThan(at.lineHeight * 1.5)
      }
    }, 60_000)
  }
})
