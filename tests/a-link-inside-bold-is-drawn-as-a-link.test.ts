// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LINK INSIDE BOLD OR ITALICS IS DRAWN AS A LINK.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The inline reader tried bold and italics before a link, so `**heading ([report](#/r/abc))**`
 * came back as one bold run and its brackets and address were drawn as characters. The same text
 * in the chat reached a link by another path, so the two surfaces disagreed about one line.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS READ NOW, AND WHAT IS STILL NOT
 * ---------------------------------------------------------------------------------------
 *
 * A link inside bold or italics is read, with the same address test every other link gets: an
 * office page stays a live link in the same window, a web address opens in a new one, and a target
 * that is neither is shown as the words and the address rather than dressed up as a link. Other
 * nesting stays unread, and an underscore is still an ordinary character, because tau_max and a
 * file path are everywhere in this product.
 *
 * The strings here are made up for the test. No word a page draws is copied in.
 */

import { describe, expect, it } from 'vitest'
import { createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderInline } from '../src/shared/inline.ts'

/** The nodes of one line, drawn, with the hoisted stylesheets taken out. */
function drawn(src: string): string {
  const nodes: ReactNode[] = renderInline(src, 'k')
  return renderToStaticMarkup(h('p', null, nodes)).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

describe('a link inside bold or italics', () => {
  it('draws an office page as a live link inside bold', () => {
    const out = drawn('**heading ([report](#/r/abc123))**')
    expect(out).toContain('<strong>')
    expect(out).toContain('<a class="px-in-link" href="#/r/abc123">report</a>')
    expect(out).not.toContain('](#/r/abc123)')
  })

  it('draws a web address inside italics as a link that opens elsewhere', () => {
    const out = drawn('*the [paper](https://example.com/p.pdf) I read*')
    expect(out).toContain('<em>')
    expect(out).toContain('href="https://example.com/p.pdf"')
    expect(out).toContain('rel="noreferrer noopener"')
  })

  it('shows a target that is not an address as the words and the address, inside bold', () => {
    const out = drawn('**[my notes](file:///tmp/notes.md)**')
    expect(out).not.toContain('<a')
    expect(out).toContain('my notes')
    expect(out).toContain('file:///tmp/notes.md')
  })

  it('leaves other nesting as the characters typed', () => {
    const out = drawn('[**not bold**](https://example.com)')
    expect(out).toContain('**not bold**')
    expect(out).not.toContain('<strong>')
  })

  it('still leaves an underscore alone inside bold', () => {
    const out = drawn('**tau_max stays as it is**')
    expect(out).toContain('tau_max stays as it is')
    expect(out).not.toContain('<em>')
  })
})
