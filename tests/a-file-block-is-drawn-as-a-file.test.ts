// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FILE BLOCK IS DRAWN AS A FILE: ITS NAME, ITS SIZE, AND A PRESS TO OPEN OR SAVE IT.
 * Criterion R3.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Every file block is drawn as a thing to fetch by its address: its name, its size, and the press
 * that opens it and the press that saves it. The bytes are never copied into the report. A source
 * file such as a .md, a .json or a .ts shows no text in the page, whatever the viewer's media
 * choice is. Pictures and video are not changed by that decision.
 *
 * THE PURE DRAWING IS MEASURED IN A REAL BROWSER. `drawInABrowser` loads the rendered markup into
 * headless Chromium, so a class in a stylesheet is never mistaken for a drawing: what is asserted
 * is what the browser built. The fetch itself is not driven here — the drawing takes the address it
 * draws — and the fetch wiring has its own tests in the file beside this one.
 *
 * `FileFigure` is rendered too, to prove a .md, a .json and a .ts file block each reach the fetch
 * drawing rather than only that the drawing exists.
 *
 * THE HASH AND THE PATH ARE A DEVELOPER'S (wave 13s round 12). A person reading a report sees a
 * file's name and size; developer mode adds the hash and the path. The cases below that read the
 * hash or the path draw with `developer: true`, and one case holds that a person's drawing has
 * neither.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { FileBlock } from '../src/shared/types.ts'
import { sizeSaid } from '../src/shared/fileblocks.ts'
import { drawInABrowser } from './what-the-browser-draws.ts'

type SummaryApi = typeof import('../src/web/components/SummaryBlocks.tsx')

let s: SummaryApi

/** The file block the drawings are about. The values are fixed so the assertions can name them. */
const BLOCK: FileBlock = {
  id: 'b-file',
  type: 'file',
  path: `${THE_TEST_FIXTURE_ROOT}/report-files/AbC123.ts`,
  name: 'summary.ts',
  size: 20_480,
  hash: '0a1b2c3d4e5f6071',
}

beforeAll(async () => {
  s = await import('../src/web/components/SummaryBlocks.tsx')
})

/** The CSS the component ships, plus the hoisted style blocks React would have emitted. */
function markupFor(element: unknown): string {
  return `<style>${s.SUMMARY_CSS}</style>${renderToStaticMarkup(element as never)}`
}

// ================================================== the size, in a reader's words

describe('a file block says how big the file is', () => {
  it('says how big a file is in the words a reader uses', () => {
    expect(sizeSaid(0)).toBe('0 bytes')
    expect(sizeSaid(1)).toBe('1 byte')
    expect(sizeSaid(999)).toBe('999 bytes')
    expect(sizeSaid(20_480)).toBe('20.5 kB')
  })
})

// ================================================== what a person sees, in a browser

describe('a person sees a file by its name and size, and a developer also sees its hash and path', () => {
  it('draws no hash and no path for a person', async () => {
    const zip: FileBlock = { ...BLOCK, name: 'archive.zip', path: `${THE_TEST_FIXTURE_ROOT}/report-files/XyZ789.zip` }
    const html = markupFor(h(s.FileToFetch, { block: zip }))
    const browser = await drawInABrowser(html)
    try {
      expect(await browser.page.locator('.sb-file-hash').count()).toBe(0)
      expect(await browser.page.locator('.sb-file-path').count()).toBe(0)
      expect(await browser.page.locator('body').innerText()).not.toContain(`${THE_TEST_FIXTURE_ROOT}/report-files/`)
      expect(await browser.page.locator('.sb-file-name').allInnerTexts()).toEqual(['archive.zip'])
      expect(await browser.page.locator('.sb-file-size').allInnerTexts()).toEqual(['20.5 kB'])
    } finally {
      await browser.close()
    }
  })
})

// ================================================== the fetch drawing, in a browser

describe('a file block is drawn as a thing to fetch by its address', () => {
  it('shows a press that opens the file door, the address, and the same three facts', async () => {
    const block: FileBlock = { ...BLOCK, name: 'archive.zip', path: `${THE_TEST_FIXTURE_ROOT}/report-files/XyZ789.zip` }
    const html = markupFor(h(s.FileToFetch, { block, developer: true }))
    const browser = await drawInABrowser(html)
    try {
      const link = browser.page.locator('.sb-file-open')
      expect(await link.innerText()).toBe('Open the file')
      // The address is the preview door, with the path sent as it is stored and the project named,
      // because a link cannot send the project's header (problem YnVxZz0Md_G4).
      expect(await link.getAttribute('href')).toBe(`/api/file?path=${encodeURIComponent(block.path)}&workspace=default`)
      expect(await browser.page.locator('.sb-file-path').innerText()).toBe(block.path)
      expect(await browser.page.locator('.sb-file-name').innerText()).toBe('archive.zip')
      expect(await browser.page.locator('.sb-file-size').innerText()).toBe('20.5 kB')
      expect(await browser.page.locator('.sb-file-hash').innerText()).toBe(block.hash)
      // No code box: this build does not copy a file's text into the page.
      expect(await browser.page.locator('pre.sb-code').count()).toBe(0)
    } finally {
      await browser.close()
    }
  })
})

// ================================================== the block itself chooses

describe('a file block reaches the fetch drawing whatever its name says', () => {
  for (const name of ['notes.md', 'data.json', 'summary.ts']) {
    it(`draws the fetch drawing for a ${name} file block`, () => {
      const html = renderToStaticMarkup(
        h(s.FileFigure as never, { block: { ...BLOCK, name }, keyPrefix: 'f', place: null, mark: {} }),
      )
      // No effect runs on a static render, so the media choice is not read and the type is not
      // asked for. Neither changes which drawing a file block gets.
      expect(html).toContain('sb-file-fetch')
      expect(html).toContain('sb-file-open')
      expect(html).toContain('sb-file-save')
      expect(html).not.toContain('sb-file-code')
    })
  }

  it('routes a .zip file to the fetch drawing', () => {
    const html = renderToStaticMarkup(
      h(s.FileFigure as never, { block: { ...BLOCK, name: 'archive.zip' }, keyPrefix: 'f', place: null, mark: {} }),
    )
    expect(html).toContain('sb-file-fetch')
    expect(html).toContain('sb-file-open')
    expect(html).not.toContain('sb-file-code')
  })
})
