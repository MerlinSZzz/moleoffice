// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE READING OF THE INSIDE OF A LINE, FOR A PLAN AND FOR A RECORD.
 *
 * `src/shared/inline.ts` is the answer to "what do two asterisks, a back tick, a bracket and a
 * dollar sign mean". It used to be written inside SummaryBlocks.tsx where only a record could reach
 * it, so the owner's own plan printed "$H_2 O$" with its dollar signs while a record beside it drew
 * the equation. This file holds that reading to two promises.
 *
 * THE FIRST IS THAT NOTHING IS LOST. Every character of a line is in exactly one piece, so joining
 * the pieces back up gives the line again. That is the same promise plandoc.ts makes about whole
 * lines, for the same reason: a reader that can quietly drop a character will.
 *
 * THE SECOND IS THAT A LINK THAT COULD NEVER WORK IS NOT DRESSED UP AS ONE THAT COULD. Only http,
 * https and mailto become an anchor. A file:// path is shown as the text and the target it is.
 */

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { describe, expect, it } from 'vitest'
import { createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { inlinePieces, isWebAddress, renderInline } from '../src/shared/inline.ts'

/** The nodes of one line, drawn, with the hoisted stylesheets taken out. */
function drawn(src: string): string {
  const nodes: ReactNode[] = renderInline(src, 'k')
  return renderToStaticMarkup(h('p', null, nodes)).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** The lines the round trip is proved on, each here for a shape that gets normalised by accident. */
const LINES: Record<string, string> = {
  'the owner’s own maths line': '$H_2 O$',
  'ordinary words': 'test with the pipeline',
  'every marker at once': 'a **bold** and *slanted* `code` [link](https://example.com) and $x^2$',
  'a marker that never closes': 'this **never closes and that is fine',
  'an underscore in a name': `tau_max in ${THE_TEST_FIXTURE_ROOT}/my_file stays as it is`,
  'two markers touching': '**one****two**',
  'nothing at all': '',
  'only a dollar sign': '$',
  'an image': 'before ![alt](pic.png) after',
  'a line ending in a marker': 'trailing `code`',
}

describe('the inside of a line', () => {
  describe('every character comes back', () => {
    for (const [name, src] of Object.entries(LINES)) {
      it(name, () => {
        expect(inlinePieces(src).map((piece) => piece.raw).join('')).toBe(src)
      })
    }
  })

  it('reads each marker as itself', () => {
    expect(inlinePieces('**bold**')).toEqual([{ kind: 'bold', raw: '**bold**', text: 'bold' }])
    expect(inlinePieces('*slanted*')).toEqual([{ kind: 'italic', raw: '*slanted*', text: 'slanted' }])
    expect(inlinePieces('`code`')).toEqual([{ kind: 'code', raw: '`code`', text: 'code' }])
    expect(inlinePieces('$H_2 O$')).toEqual([{ kind: 'maths', raw: '$H_2 O$', tex: 'H_2 O' }])
    expect(inlinePieces('[go](https://a.b)')).toEqual([
      { kind: 'link', raw: '[go](https://a.b)', text: 'go', href: 'https://a.b' },
    ])
    expect(inlinePieces('![alt](p.png)')).toEqual([{ kind: 'image', raw: '![alt](p.png)' }])
  })

  it('leaves an underscore alone, because tau_max and my_file are real values here', () => {
    expect(inlinePieces('tau_max')).toEqual([{ kind: 'words', raw: 'tau_max' }])
    expect(drawn(`${THE_TEST_FIXTURE_ROOT}/my_file`)).toContain(`${THE_TEST_FIXTURE_ROOT}/my_file`)
    expect(drawn(`${THE_TEST_FIXTURE_ROOT}/my_file`)).not.toContain('<em>')
  })

  it('draws maths as maths, not as dollar signs', () => {
    const out = drawn('$H_2 O$')
    expect(out).toContain('role="math"')
    expect(out).not.toContain('$')
  })

  it('draws bold, italic and code as themselves', () => {
    expect(drawn('**heavy**')).toContain('<strong>heavy</strong>')
    expect(drawn('*slanted*')).toContain('<em>slanted</em>')
    expect(drawn('`npm test`')).toContain('npm test')
    expect(drawn('`npm test`')).toContain('px-in-code')
  })

  it('links only what a browser can open, and shows the rest as what it is', () => {
    expect(isWebAddress('https://example.com')).toBe(true)
    expect(isWebAddress(`mailto:${THE_TEST_OFFICES_OWNER.id}@example.com`)).toBe(true)
    expect(isWebAddress(`file://${THE_TEST_FIXTURE_ROOT}/plan.md`)).toBe(false)
    expect(isWebAddress('javascript:alert(1)')).toBe(false)

    const live = drawn('[the paper](https://example.com/p.pdf)')
    expect(live).toContain('<a')
    expect(live).toContain('href="https://example.com/p.pdf"')

    const dead = drawn(`[my notes](file://${THE_TEST_FIXTURE_ROOT}/plan.md)`)
    expect(dead).not.toContain('<a')
    expect(dead).toContain('my notes')
    expect(dead).toContain(`${THE_TEST_FIXTURE_ROOT}/plan.md`)
  })

  it('says an image is not drawn rather than drawing nothing', () => {
    const out = drawn('![a photo](p.png)')
    expect(out).toContain('not rendered')
    expect(out).toContain('image block')
    expect(out).toContain('p.png')
  })

  /**
   * Everything is built as React elements, never as an HTML string, so there is no path by which
   * something typed into a plan becomes markup on the page.
   */
  it('cannot turn typed text into markup', () => {
    const out = drawn('**<script>alert(1)</script>**')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })
})
