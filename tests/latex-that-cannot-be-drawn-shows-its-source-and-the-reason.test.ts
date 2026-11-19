// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * LATEX THAT CANNOT BE DRAWN SHOWS ITS SOURCE AND THE REASON, IN THE MARKED BOX.
 *
 * A formula drawn wrong is worse than one not drawn, because nobody can see that it is wrong. So
 * when KaTeX throws, when a command is refused, and when the drawing code did not load, MathText
 * shows the marked box: its tag word, the source exactly as it was typed, and the reason. The reason
 * is KaTeX's own message, or a sentence of MathText's own where the cause is not KaTeX's.
 *
 * AND THE BOX MEANS ONLY THAT. Before the drawing code has arrived, the source is shown quietly in
 * the formula's own place, marked busy; that is waiting, and it is not the box.
 *
 * The test runner has no DOM, so the component is drawn to static markup.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { AN_EMPTY_EXPRESSION, loadMathsDrawing, MathText, THE_DRAWING_DID_NOT_LOAD } from '../src/web/components/MathText.tsx'
import { A_COMMENT_WOULD_HIDE_THE_REST_OF_ITS_LINE } from '../src/web/components/maths-drawing.ts'

const THE_LOADER = '../src/web/components/maths-drawing.ts'

beforeAll(async () => {
  await loadMathsDrawing()
})

/** The markup with the hoisted <style> removed, so a class named in the stylesheet is not read as drawn. */
const markup = (el: React.ReactElement): string =>
  renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

/** The text of an element, with the five characters React escapes read back. */
const unescape = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')

/** What the marked box says, or null when there is no box. */
function theBox(html: string): { source: string; reason: string } | null {
  if (!html.includes(t('pageWords.MathText.001'))) return null
  const source = /<code class="mt-unsupported-src">([\s\S]*?)<\/code>/.exec(html)
  const reason = /<span class="mt-unsupported-why">([\s\S]*?)<\/span>/.exec(html)
  if (source === null || reason === null) return null
  return { source: unescape(source[1] ?? ''), reason: unescape(reason[1] ?? '') }
}

describe('refused LaTeX shows the marked box, with the source as typed and the reason', () => {
  /** Each case: what it is, the source, whether it is displayed, and what the reason must name. */
  const REFUSED: Array<[what: string, tex: string, display: boolean, names: string]> = [
    ['an unknown command', '\\unknowncmd x', false, '\\unknowncmd'],
    ['an unclosed brace', '\\frac{a}{b', false, "'}'"],
    ['a closing brace with nothing to close', 'a}', false, "'}'"],
    ['two superscripts on one base', 'x^2^3', false, 'superscript'],
    ['a \\left with no \\right', '\\left( a', false, '\\right'],
    ['an alignment mark outside a table', 'a & b', false, "'&'"],
    ['a link', '\\href{https://example.org}{a}', false, '\\href'],
    ['a web address', '\\url{https://example.org}', false, '\\url'],
    ['a picture', '\\includegraphics{plot.png}', false, '\\includegraphics'],
    ['an HTML class', '\\htmlClass{wide}{x}', false, '\\htmlClass'],
    ['an HTML id', '\\htmlId{here}{x}', false, '\\htmlId'],
    ['an HTML style', '\\htmlStyle{color: red}{x}', false, '\\htmlStyle'],
    ['HTML data', '\\htmlData{k=v}{x}', false, '\\htmlData'],
    // KaTeX's strict code commentAtEnd: the comment runs to the end of the formula.
    ['a % comment at the end, which would hide what follows it', 'p = 50%', false, '%'],
    ['a % comment before a line break, which would hide the rest of its line', 'x % note\n+ y', true, A_COMMENT_WOULD_HIDE_THE_REST_OF_ITS_LINE],
    ['nothing at all', '', false, AN_EMPTY_EXPRESSION],
    ['nothing but spaces', '   ', true, AN_EMPTY_EXPRESSION],
  ]

  for (const [what, tex, display, names] of REFUSED) {
    it(what, () => {
      const html = markup(h(MathText, { tex, display }))
      const box = theBox(html)
      expect(box, `no marked box for ${JSON.stringify(tex)}: ${html}`).not.toBeNull()
      expect(box?.source).toBe(tex)
      expect(box?.reason).toContain(names)
      // Nothing KaTeX drew is shown beside the box: neither a drawing nor an error in its place.
      expect(html).not.toContain('class="katex')
    })
  }

  it('keeps a long source whole, so it can be copied out and fixed', () => {
    const tex = '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\unknowncmd'
    expect(theBox(markup(h(MathText, { tex, display: true })))?.source).toBe(tex)
  })
})

describe('the loader', () => {
  afterEach(() => {
    vi.doUnmock(THE_LOADER)
    vi.resetModules()
  })

  it('is not loaded when MathText is imported, and is started by the first MathText drawn', async () => {
    vi.resetModules()
    let loaded = false
    vi.doMock(THE_LOADER, () => {
      loaded = true
      return { drawMaths: () => ({ ok: true, html: '<span class="katex">made up</span>' }) }
    })
    const fresh = await import('../src/web/components/MathText.tsx')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(loaded, 'importing MathText loaded the drawing code').toBe(false)
    renderToStaticMarkup(h(fresh.MathText, { tex: 'x^2' }))
    await vi.waitFor(() => expect(loaded, 'drawing a MathText did not start the drawing code loading').toBe(true))
  })

  it('shows the source quietly, marked busy and not as the box, until the drawing code is there', async () => {
    vi.resetModules()
    vi.doMock(THE_LOADER, () => new Promise<never>(() => {}))
    const fresh = await import('../src/web/components/MathText.tsx')
    for (const display of [false, true]) {
      const html = markup(h(fresh.MathText, { tex: 'x^2 + 1', display }))
      expect(theBox(html)).toBeNull()
      expect(html).not.toContain(t('pageWords.MathText.001'))
      expect(html).toContain('aria-busy="true"')
      expect(html).toContain('role="math"')
      expect(html).toContain('aria-label="x^2 + 1"')
      expect(html).toContain('x^2 + 1</span>')
      expect(html).not.toContain('class="katex')
    }
  })

  it('shows the box with the source, and says the drawing code did not load and why, when it fails', async () => {
    vi.resetModules()
    vi.doMock(THE_LOADER, () => {
      throw new Error('made-up failure: the file could not be fetched')
    })
    const fresh = await import('../src/web/components/MathText.tsx')
    const failed: unknown = await fresh.loadMathsDrawing().then(
      () => null,
      (err: unknown) => err,
    )
    expect(failed, 'the loader said it was ready').toBeInstanceOf(Error)
    // Vitest wraps an error thrown while it makes a stand-in module, and keeps the one thrown as the cause.
    expect(((failed as Error).cause as Error | undefined)?.message).toBe('made-up failure: the file could not be fetched')
    for (const display of [false, true]) {
      const box = theBox(markup(h(fresh.MathText, { tex: '\\frac{a}{b}', display })))
      expect(box).not.toBeNull()
      expect(box?.source).toBe('\\frac{a}{b}')
      expect(box?.reason.startsWith(THE_DRAWING_DID_NOT_LOAD)).toBe(true)
      expect(box?.reason).toContain((failed as Error).message)
    }
  })
})
