// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * COMMON LATEX IS DRAWN, IN THE MODE IT WAS WRITTEN IN.
 *
 * MathText draws with KaTeX. This file draws every expression in
 * tests/common-latex-from-papers-and-notes.ts, one test case per family, and the twelve hard
 * formulas both inline and displayed. An expression passes when it is drawn by KaTeX, shows no marked
 * box, and is a display only when it was asked to be one.
 *
 * WHAT IT DOES NOT COVER is how a formula looks: size, baseline and colour are checked by pictures,
 * and whether KaTeX drew the same symbols MathJax draws is the reference comparison. A refused
 * expression, and the drawing that failed to load, are in
 * tests/latex-that-cannot-be-drawn-shows-its-source-and-the-reason.test.ts.
 *
 * The test runner has no DOM, so the component is drawn to static markup. That runs no effects, so the
 * drawing code is loaded once, before anything is drawn, with the function the component itself uses.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { loadMathsDrawing, MathText } from '../src/web/components/MathText.tsx'
import { COMMON_LATEX, TWELVE_HARD_FORMULAS } from './common-latex-from-papers-and-notes.ts'

beforeAll(async () => {
  await loadMathsDrawing()
})

/** The markup with the hoisted <style> removed, so a class named in the stylesheet is not read as drawn. */
const draw = (tex: string, display?: boolean, label?: string): string =>
  renderToStaticMarkup(h(MathText, { tex, display, label })).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

/** What is wrong with how one expression was drawn, or null when nothing is. */
function whatIsWrong(tex: string, display: boolean): string | null {
  const html = draw(tex, display)
  if (html.includes(t('pageWords.MathText.001'))) return 'shows the marked box'
  if (html.includes('aria-busy')) return 'is still waiting for the drawing code'
  // KaTeX's own class for its drawing, and for an error it drew in place of one.
  if (!html.includes('class="katex"')) return 'holds no KaTeX drawing'
  if (html.includes('katex-error')) return 'holds an error KaTeX drew in its place'
  const displayed = html.includes('katex-display')
  if (displayed !== display) return display ? 'is drawn inline' : 'is drawn as a display'
  return null
}

const wrongIn = (inline: readonly string[], display: readonly string[]): string[] =>
  [
    ...inline.map((tex) => [tex, whatIsWrong(tex, false)] as const),
    ...display.map((tex) => [tex, whatIsWrong(tex, true)] as const),
  ].flatMap(([tex, wrong]) => (wrong === null ? [] : [`${tex} ${wrong}`]))

describe('common LaTeX is drawn, in the mode it was written in', () => {

  for (const { family, inline, display } of COMMON_LATEX) {
    it(family, () => {
      expect(wrongIn(inline, display)).toEqual([])
    })
  }

  it('draws the twelve hard formulas inline and displayed', () => {
    expect(TWELVE_HARD_FORMULAS).toHaveLength(12)
    expect(wrongIn(TWELVE_HARD_FORMULAS, TWELVE_HARD_FORMULAS)).toEqual([])
  })
})

describe('the delimiters decide the mode', () => {
  it('reads $$...$$ and \\[...\\] as a display, and $...$ and \\(...\\) as inline, whatever it was asked', () => {
    expect(draw('$$x^2$$')).toContain('katex-display')
    expect(draw('\\[x^2\\]')).toContain('katex-display')
    expect(draw('$x^2$', true)).not.toContain('katex-display')
    expect(draw('\\(x^2\\)', true)).not.toContain('katex-display')
    expect(draw('x^2', true)).toContain('katex-display')
    expect(draw('x^2')).not.toContain('katex-display')
  })
})

describe('a screen reader reads a formula once', () => {
  /**
   * THE WRAPPER'S LABEL IS THE ONE READING. KaTeX is asked for HTML only: its MathML would be a
   * second reading of the same formula, and the HTML it draws is hidden from a screen reader.
   */
  for (const display of [false, true]) {
    it(display ? 'when it is displayed' : 'when it is inline', () => {
      const html = draw('\\frac{a}{b}', display)
      expect(html.match(/role="math"/g)).toHaveLength(1)
      expect(html.match(/aria-label=/g)).toHaveLength(1)
      expect(html).toContain('aria-label="\\frac{a}{b}"')
      expect(html).not.toContain('<math')
      const hidden = html.indexOf('aria-hidden="true"')
      expect(hidden, 'nothing in the drawing is hidden from a screen reader').toBeGreaterThan(-1)
      expect(hidden, 'the drawing is not inside the hidden part').toBeLessThan(html.indexOf('class="katex"'))
    })
  }

  it('reads the label it was given in place of the source', () => {
    const html = draw('\\frac{a}{b}', false, 'a over b')
    expect(html).toContain('aria-label="a over b"')
    expect(html.match(/aria-label=/g)).toHaveLength(1)
  })
})

describe('what LaTeX itself would complain of, but KaTeX draws as it was typed', () => {
  /**
   * EACH OF KATEX'S STRICT CODES THAT IS ALLOWED, with an example that shows it is drawn and not
   * dropped: a character, or the class KaTeX gives the part it drew (a space, a strike-through line,
   * a line break). The ones that are refused, because the drawing would leave out or change what was
   * typed, are in the file about refused LaTeX.
   */
  const SHOWN: Array<[code: string, tex: string, display: boolean, shows: string]> = [
    ['unicodeTextInMathMode', '速度 v', false, '速度'],
    ['unicodeTextInMathMode', 'é', false, 'ˊ'],
    ['unknownSymbol', 'a — b', false, '—'],
    ['mathVsTextAccents', "\\'e", false, 'ˊ'],
    ['mathVsTextUnits', 'a\\mkern3pt b', false, 'mspace'],
    ['mathVsSout', '\\sout{x}', false, 'sout'],
    ['textEnv', '\\begin{array}{c} p & q \\end{array}', true, '>q<'],
    // Refusing this code would not refuse the formula: KaTeX would drop the line break silently.
    ['newLineInDisplayMode', 'a \\\\ b', true, 'newline'],
  ]
  for (const [code, tex, display, shows] of SHOWN) {
    it(`draws ${code}: ${tex}`, () => {
      expect(whatIsWrong(tex, display)).toBeNull()
      expect(draw(tex, display)).toContain(shows)
    })
  }
})
