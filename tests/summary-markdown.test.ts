// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RECORD'S PROSE LOOKS LIKE, AND THAT IT IS DRAWN BY THE SHARED READER.
 *
 * A curated summary is the one place in Mole Office where a person wrote prose on purpose, and until
 * this file nothing checked what happened to it. That mattered on the day SummaryBlocks stopped
 * reading the inside of a line itself and started calling `renderInline` from src/shared/inline.ts:
 * a rendering that quietly starts eating characters, or a rename that quietly loses a stylesheet,
 * is a data problem wearing a cosmetic hat, and neither the type checker nor any other test here
 * would have said a word.
 *
 * The tests are in two halves.
 *
 * THE INSIDE OF A LINE. Bold, italic, code, links, maths and images must draw on a record exactly
 * as they draw in a plan, because there is now one reader for both. These are the shapes that were
 * measured on the old local reader before it was deleted, so a change to either end shows up here.
 *
 * THE BLOCKS AROUND IT. Which lines are headings, lists, code and quotes is still answered inside
 * SummaryBlocks, separately from src/shared/plandoc.ts, and that is deliberate: a summary reflows a
 * wrapped paragraph and drops blank lines, which a plan may never do because its lines are stored
 * rows. The reflow is checked here so nobody "fixes" the duplication by merging the two.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')

let sb: SummaryBlocksModule
let h: typeof import('react').createElement
let toMarkup: (el: ReactNode) => string

beforeAll(async () => {
  // The component library reaches src/web/api.ts, which reads window.localStorage while it is
  // being evaluated. The smallest stand-in that lets the import happen; the same one
  // tests/file-preview.test.ts uses.
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

/** One text block of a curated summary, drawn: the markup, with the hoisted stylesheets taken out. */
function prose(md: string): string {
  return whole(md).markup
}

/** The same, kept whole, because two tests below need the stylesheet the component emitted. */
function whole(md: string): { markup: string; css: string } {
  const html = toMarkup(h(sb.SummaryBlocks, { blocks: [{ type: 'text', id: 't', text: md }] }))
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '')
  return { markup: html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ''), css: styles.join('\n') }
}

describe('the inside of a line, on a record', () => {
  it('draws bold, italic and code', () => {
    expect(prose('a **heavy** word')).toContain('<strong>heavy</strong>')
    expect(prose('a *slanted* word')).toContain('<em>slanted</em>')
    const code = prose('run `npm test` now')
    expect(code).toContain('npm test')
    expect(code).toMatch(/<code class="[^"]*">npm test<\/code>/)
  })

  it('draws maths rather than printing the dollar signs', () => {
    // The defect that started this: a plan printed $H_2 O$ while a record beside it drew it.
    const out = prose('the ratio is $H_2 O$ exactly')
    expect(out).toContain('role="math"')
    expect(out).not.toContain('$')
  })

  it('leaves an underscore alone, because tau_max and my_file are real values here', () => {
    const out = prose(`tau_max in ${THE_TEST_FIXTURE_ROOT}/my_file`)
    expect(out).toContain('tau_max')
    expect(out).toContain(`${THE_TEST_FIXTURE_ROOT}/my_file`)
    expect(out).not.toContain('<em>')
  })

  it('keeps a marker that never closes as the characters somebody typed', () => {
    expect(prose('this **never closes')).toContain('this **never closes')
  })

  it('links what a browser can open and shows the rest as what it is', () => {
    const live = prose('see [the paper](https://example.com/p.pdf) first')
    expect(live).toContain('href="https://example.com/p.pdf"')
    expect(live).toContain('rel="noreferrer noopener"')

    const dead = prose(`see [my notes](file://${THE_TEST_FIXTURE_ROOT}/plan.md) first`)
    expect(dead).not.toContain('<a')
    expect(dead).toContain('my notes')
    expect(dead).toContain(`${THE_TEST_FIXTURE_ROOT}/plan.md`)
  })

  it('says an image is not drawn rather than drawing nothing', () => {
    const out = prose('before ![a photo](p.png) after')
    expect(out).toContain('not rendered')
    expect(out).toContain('image block')
    expect(out).toContain('p.png')
  })

  it('cannot turn text somebody typed into markup', () => {
    const out = prose('**<script>alert(1)</script>**')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  /**
   * THE RENAME GUARD. The classes on a code span, a link and an image note come from
   * src/shared/inline.ts, and their rules come from INLINE_CSS, which this component has to emit
   * beside its own stylesheet. Miss it and the page still says every word while losing the mono
   * face, the link colour and the border -- nothing fails, and nobody notices for a month.
   */
  it('emits a rule for every class it draws, including the shared ones', () => {
    const drawn = whole(
      'a **heavy** word, `some code`, [a link](https://example.com), ' +
        '[notes](file:///tmp/x.md), $x^2$ and ![a photo](p.png)',
    )
    const classes = new Set(
      [...drawn.markup.matchAll(/class="([^"]+)"/g)].flatMap((m) => (m[1] ?? '').split(/\s+/)),
    )
    expect(classes.size, 'nothing was measured, so this test proved nothing').toBeGreaterThan(5)
    const unstyled = [...classes].filter((name) => !drawn.css.includes(`.${name}`))
    expect(unstyled, 'these classes are on the page with no rule anywhere in what it emitted')
      .toEqual([])
  })
})

describe('the blocks around it, which a record reads its own way', () => {
  it('draws headings one to three under the panel heading', () => {
    expect(prose('# Top')).toContain('<h3')
    expect(prose('## Middle')).toContain('<h4')
    expect(prose('### Small')).toContain('<h5')
  })

  it('draws bullet and numbered lists', () => {
    const bullets = prose('- first\n- second')
    expect(bullets).toContain('<ul')
    expect(bullets).toMatch(/<li[^>]*>first<\/li>/)
    const numbered = prose('1. first\n2. second')
    expect(numbered).toContain('<ol')
    expect(numbered).toMatch(/<li[^>]*>second<\/li>/)
  })

  it('keeps a fenced block as code, markers and all', () => {
    const out = prose('```\nnot **bold** here\n```')
    expect(out).toContain('<pre')
    expect(out).toContain('not **bold** here')
    expect(out).not.toContain('<strong>')
  })

  it('keeps a quoted line as somebody else words', () => {
    const out = prose('> the person said it broke')
    expect(out).toContain('<blockquote')
    expect(out).toContain('the person said it broke')
    expect(out).not.toContain('&gt; the person said')
  })

  it('draws a table typed into the words as a real table, through the one pipe reader', () => {
    const out = prose('| a | b |\n| - | - |\n| 1 | 2 |')
    expect(out).toContain('<table')
    expect(out).toContain('<th')
    expect(out).not.toContain('Not rendered')
  })

  it('prints pipe lines that are not a table exactly as typed, with the reason', () => {
    // No row of dashes under the heading. plandoc says why, in the words a plan uses for the same
    // run of lines, so a person meets one sentence rather than two.
    const out = prose('| a | b |\n| 1 | 2 |')
    expect(out).not.toContain('<table')
    expect(out).toContain('no row of dashes')
    expect(out).toContain('| a | b |')
  })

  /**
   * A SUMMARY REFLOWS, AND A PLAN MAY NOT. This is the difference that keeps the two block readers
   * apart. If somebody merges renderMarkdown into src/shared/plandoc.ts, either this goes red or a
   * plan starts rewriting what its author typed.
   */
  it('joins a wrapped paragraph into one and drops the blank line between two', () => {
    const out = prose('one line\nwrapped here\n\nsecond paragraph')
    expect(out).toContain('one line wrapped here')
    expect((out.match(/<p /g) ?? []).length).toBe(2)
  })
})

/**
 * THE CHAT'S SWITCH: A SINGLE NEWLINE IS A LINE BREAK. It is settled
 * on proposal kG2sFXVKNgkt. The chat turns `lineBreaks` on and every report
 * leaves it off, so the same text draws two ways and each way is checked here.
 */
describe('the line-break switch the chat turns on', () => {
  /** What renderMarkdown draws, as markup, with or without the switch. */
  function drawn(md: string, lineBreaks: boolean | undefined): string {
    const options = lineBreaks === undefined ? undefined : { lineBreaks }
    return toMarkup(h('div', null, sb.renderMarkdown(md, 't', null, null, options)))
  }

  it('draws a single newline as a break, in English and in Chinese', () => {
    expect(drawn('one\ntwo', true)).toMatch(/<p[^>]*>one<br\/>two<\/p>/)
    expect(drawn('第一行\n第二行', true)).toContain('第一行<br/>第二行')
  })

  it('keeps bold that runs across the break as one bold run', () => {
    expect(drawn('say **one\ntwo** now', true)).toContain('say <strong>one<br/>two</strong> now')
  })

  it('reads a formula written over two lines as a report does, with no break in it', () => {
    expect(drawn('see $a +\nb$ here', true)).toBe(drawn('see $a +\nb$ here', false))
    expect(drawn('see $a +\nb$ here', true)).not.toContain('<br')
  })

  it('breaks the lines of a quote and of a list item as well', () => {
    expect(drawn('> one\n> two', true)).toMatch(/<blockquote[^>]*>one<br\/>two<\/blockquote>/)
    expect(drawn('- one\n  two', true)).toMatch(/<li[^>]*>one<br\/>two<\/li>/)
  })

  it('still starts a new paragraph at a blank line', () => {
    const out = drawn('one\n\ntwo', true)
    expect((out.match(/<p /g) ?? []).length).toBe(2)
    expect(out).not.toContain('<br')
  })

  it('left off, or left out, draws a single newline as it always has', () => {
    for (const off of [false, undefined]) {
      expect(drawn('one\ntwo', off)).toContain('one two')
      expect(drawn('第一行\n第二行', off)).toContain('第一行第二行')
      expect(drawn('say **one\ntwo** now', off)).toContain('<strong>one two</strong>')
      expect(drawn('> one\n> two\n\n- three\n  four', off)).not.toContain('<br')
    }
  })
})
