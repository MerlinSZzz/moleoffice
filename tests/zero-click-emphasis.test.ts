// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A ROW SAYS BEFORE ANYBODY PRESSES ANYTHING.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO DEFECTS THESE TESTS EXIST FOR, BOTH MEASURED IN A BROWSER ON 2026-08-12
 * ---------------------------------------------------------------------------------------
 *
 * UX-4 — QUERIES DENSITY. 112 of the Queries page's 153 leaf text nodes at 1440 were set below
 * 13px, and the largest single group of them was the row summary: one full sentence per row at
 * --fs-1, the size tokens.css reserves for "labels, meta, chips", on twenty-one rows. A list whose
 * evidence is set in label type is a report, not a list to scan.
 *
 * UX-3 — HOME IS MONOCHROME. Seven ranked rows were a grey state chip, a grey age, a grey kind and
 * a title. Two of them carried the safety mark and said so; the other five were drawn identically,
 * and one of them was owed to a grant review, one was holding up other work, and one had nothing at
 * all recorded about what is at stake. The order said one was above another; nothing said why, and
 * every answer was one press away on every row.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PINNED, AND WHAT IS DELIBERATELY NOT
 * ---------------------------------------------------------------------------------------
 *
 * These pin RULES, not pictures. Nothing here asserts a colour, a pixel or a chip's shape — a
 * screenshot review does that, and a test that froze the drawing would fail on every deliberate
 * change. What they assert is what a reader can and cannot get without pressing:
 *
 *   1. a result row's evidence is set at the size the product calls body text, never at label size;
 *   2. a ranked row carries the strongest RECORDED reason it matters, closed;
 *   3. it carries exactly one, so the strip stays scannable;
 *   4. and it invents nothing for a row that records nothing — an absent consequence draws no mark
 *      on the closed row and is still said in words, in full, one press away.
 *
 * SINCE WAVE 13K'S ROUND 19 THE RANKED LIST IS GONE, by item 6 of a decision, so 2 to 4 are
 * measured on the row that is kept: `QuietRow`, the row a "by reason" group builds when it opens. It
 * draws the same closed lead (`RowLead` and its `WhyMark`) the ranked row drew. Mutations: make
 * `WhyMark` return null and the four cases about who is waiting, the consequence, the bearer word
 * and the worked-out edge go red; let it draw for a safety row and "spends one mark per row" goes
 * red; let it draw a mark when no consequence is recorded and "draws NOTHING" goes red.
 *
 * SINCE WAVE 13K'S ROUND 22 THAT ROW IS GONE AS WELL. Item 3 of another decision put the "by
 * reason" groups on no page, so `QuietRow`, which only those groups drew, was removed with them, and
 * so were the cases for 2 to 4 and the mutations above that name `WhyMark`. No page draws a row that
 * carries these marks today. What is left here is 1, the query result row.
 *
 * The runner has no DOM, so components are rendered to static markup and the closed state is read
 * off the `<summary>` elements — the same technique tests/records-queries-pages.test.ts uses.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

type QP = typeof import('../src/web/pages/QueriesPage.tsx')

let qp: QP

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
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  qp = await import('../src/web/pages/QueriesPage.tsx')
})

// ============================================================ UX-4: the size a result row is read at

/**
 * THE SUMMARY IS THE ROW'S EVIDENCE, SO IT IS SET LIKE TEXT AND NOT LIKE A LABEL.
 *
 * tokens.css names both sizes and says what each is for: --fs-1 is "labels, meta, chips" and --fs-2
 * is "UI body, row text; the size most of the app is set in". A sentence is not a label. This reads
 * the page's own stylesheet rather than a screenshot, because the defect was a token choice.
 */
describe('a query result row is set at body size, not at label size', () => {
  const styleOf = (html: string) => (/<style[^>]*>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '')
  const ruleFor = (css: string, selector: string) =>
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''

  it('sets the row summary in the body token and never in the label token', () => {
    const css = styleOf(renderToStaticMarkup(h(qp.QueriesPage)))
    expect(css, 'the page ships no stylesheet at all').not.toBe('')
    const meta = ruleFor(css, '.qp .px-row-meta')
    expect(meta, 'the query page does not size its own row summary').not.toBe('')
    expect(meta).toContain('var(--fs-2)')
    expect(meta, 'the summary is back at label size').not.toContain('var(--fs-1)')
  })

  it('sets the row stamp at the same size, because how long a result has sat is the finding', () => {
    const css = styleOf(renderToStaticMarkup(h(qp.QueriesPage)))
    expect(ruleFor(css, '.qp .px-row-right')).toContain('var(--fs-2)')
  })
})
