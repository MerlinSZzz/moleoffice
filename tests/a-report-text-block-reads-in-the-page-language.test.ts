// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT'S TEXT BLOCK IS DRAWN IN THE PAGE'S LANGUAGE WHEN IT HOLDS BOTH, AND SAYS NOTHING ABOUT ITS LANGUAGES.
 *
 * Wave 13s found, in its round 17, that on a Chinese page a report's text block drew its English and
 * not the Chinese stored beside it: nothing in src/web read a block's `zh`. A text block carries its
 * Chinese in `zh` ({heading, text, from}), where `from` is `englishHash([heading, text])` of the English
 * it was written from (src/shared/english-hash.ts). The chapter records already read it that way;
 * `theChineseOfATextBlock` in src/shared/office-rules.ts is now the one reader for every record.
 *
 * WHAT IS CLAIMED
 *
 *   1. A block whose Chinese was written from its English is drawn in Chinese on a Chinese page, and in
 *      English on an English page.
 *   2. A block whose Chinese was written from another English is drawn in its current English on a Chinese
 *      page, and its out-of-date Chinese is not drawn.
 *   3. A block with no Chinese is drawn as it is written, on a Chinese page and an English one.
 *   4. Nothing under a block says which languages it holds, in Normal mode or Developer mode, on a Chinese page
 *      or an English one. A block with no Chinese, and a block whose Chinese was written from another English,
 *      each draw their heading and their text and nothing else. The person found such a line strange and of no
 *      use, and under every paragraph it took up much of a report.
 *
 * MUTATIONS, EACH AFTER A CONTROL RUN (the commit that added this file names the logs):
 *   - SummaryBlocks.tsx drawing `block.text` whatever the Chinese says: cases 1 and 2's Chinese half go red;
 *   - `theChineseOfATextBlock` leaving out the `from` check: case 2 goes red;
 *   - a note drawn again under a block with no Chinese in Developer mode, or under a block whose Chinese was
 *     written from another English in either mode: case 4 goes red. The commit that changed case 4 names those logs.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { englishHash } from '../src/shared/english-hash.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')
type I18n = typeof import('../src/shared/i18n.ts')

let sb: SummaryBlocksModule
let i18n: I18n
let mode: typeof import('../src/web/lib/mode.ts')
let h: typeof import('react').createElement
let toMarkup: (el: ReactNode) => string

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage while it is evaluated; the same stand-in
  // tests/summary-markdown.test.ts uses.
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
  i18n = await import('../src/shared/i18n.ts')
  mode = await import('../src/web/lib/mode.ts')
})

afterEach(() => {
  i18n.setWordLanguage('en')
  mode.setMode('normal')
})

const HEADING = 'What the shell did'
const TEXT = 'The shell cracked at setting 15, on the third print.'
const ZH_HEADING = '外壳怎么了'
const ZH_TEXT = '外壳在第 15 档裂开，是第三次打印的时候。'

/** A block written in one language only. */
const ENGLISH_ONLY = { id: 'b-one', type: 'text', heading: HEADING, text: TEXT }
/** A block whose Chinese was written from an English it no longer holds. */
const FROM_OTHER_ENGLISH = {
  id: 'b-shell',
  type: 'text',
  heading: HEADING,
  text: TEXT,
  zh: { heading: ZH_HEADING, text: ZH_TEXT, from: englishHash([HEADING, 'An earlier English.']) },
}

function drawn(block: Record<string, unknown>, language: 'en' | 'zh'): string {
  i18n.setWordLanguage(language)
  return toMarkup(h(sb.SummaryBlocks, { blocks: [block] as never })).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** The words a reader sees in the markup: every tag taken out. */
function wordsIn(markup: string): string {
  return markup.replace(/<[^>]*>/g, '')
}

describe('a report text block in the page language', () => {
  it('1. draws its Chinese on a Chinese page when the Chinese was written from this English', () => {
    const block = {
      id: 'b-shell',
      type: 'text',
      heading: HEADING,
      text: TEXT,
      zh: { heading: ZH_HEADING, text: ZH_TEXT, from: englishHash([HEADING, TEXT]) },
    }
    const zh = drawn(block, 'zh')
    expect(zh).toContain(ZH_HEADING)
    expect(zh).toContain(ZH_TEXT)
    expect(zh).not.toContain(TEXT)
    expect(zh).not.toContain(HEADING)
    const en = drawn(block, 'en')
    expect(en).toContain(HEADING)
    expect(en).toContain(TEXT)
    expect(en).not.toContain(ZH_TEXT)
  })

  it('1b. a block with no heading hashes its heading as the empty string', () => {
    const block = { id: 'b-plain', type: 'text', text: TEXT, zh: { heading: '', text: ZH_TEXT, from: englishHash(['', TEXT]) } }
    const zh = drawn(block, 'zh')
    expect(zh).toContain(ZH_TEXT)
    expect(zh).not.toContain(TEXT)
  })

  it('2. draws its current English when the Chinese was written from another English', () => {
    const zh = drawn(FROM_OTHER_ENGLISH, 'zh')
    expect(zh).toContain(HEADING)
    expect(zh).toContain(TEXT)
    expect(zh).not.toContain(ZH_HEADING)
    expect(zh).not.toContain(ZH_TEXT)
    const en = drawn(FROM_OTHER_ENGLISH, 'en')
    expect(en).toContain(TEXT)
    expect(en).not.toContain(ZH_TEXT)
  })

  it('3. draws a block with no Chinese as it is written, on a Chinese page or an English one', () => {
    for (const language of ['zh', 'en'] as const) {
      const page = drawn(ENGLISH_ONLY, language)
      expect(page, language).toContain(HEADING)
      expect(page, language).toContain(TEXT)
    }
  })

  it('4. says nothing about a block\'s languages under it, in Normal mode or Developer mode, on a Chinese page or an English one', () => {
    // Every one of the eight is read before any is compared, so a red run names each place a note is drawn.
    const read: Record<string, string> = {}
    for (const asked of ['normal', 'inspect'] as const) {
      mode.setMode(asked)
      expect(mode.currentMode(), 'the mode this half is drawn in').toBe(asked)
      for (const [which, block] of [['no Chinese', ENGLISH_ONLY], ['Chinese from another English', FROM_OTHER_ENGLISH]] as const) {
        for (const language of ['zh', 'en'] as const) {
          read[`a block with ${which}, on the ${language} page, in ${asked} mode`] = wordsIn(drawn(block, language))
        }
      }
    }
    expect(Object.keys(read)).toHaveLength(8)
    expect(read).toEqual(Object.fromEntries(Object.keys(read).map((where) => [where, HEADING + TEXT])))
  })
})
