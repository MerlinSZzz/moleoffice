// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THREE PAGES DRAW NO EXPLANATION: the explanatory text is removed, not folded away, as decided. A hint that is truly
 * needed is one sentence behind a small "?" on its heading.
 *
 * WHAT THIS FILE PROVES, on each page's own drawing, in English, with nothing fetched:
 *   1. #/your-words draws no fold, and where the words came from is one sentence behind the "?" beside its heading;
 *   2. #/casting draws no explanation and no fold: the page omits explanatory text, and the rules of the roll are fixed
 *      lines on its Rules tab, which
 *      the-casting-work-groups-in-the-browser reads;
 * Before, #/your-words drew its explanation word for word in a closed fold.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   a fold drawn on the page again                                          → the case for that page
 *   the sentence dropped from the "?" beside the #/your-words heading       → the case for #/your-words
 *   a fold or the old rule drawn on #/casting again                         → the case for #/casting
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'


/** The English words for a key, read through the pages' own word table and escaped as the page draws them. */
let said: (key: string) => string = () => {
  throw new Error('the words are read after freshPages')
}

async function freshPages(): Promise<void> {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  vi.resetModules()
  const i18n = await import('../src/shared/i18n.ts')
  i18n.setWordLanguage('en')
  said = (key) => {
    const words = i18n.t(key as never)
    expect(words, key).not.toBe(key)
    return renderToStaticMarkup(h('span', null, words)).replace(/^<span>|<\/span>$/gu, '')
  }
}

describe('the pages draw no explanation', () => {
  it('on #/your-words, where the one sentence is behind the "?" beside the heading', async () => {
    await freshPages()
    const { YourWordsPage } = await import('../src/web/pages/YourWordsPage.tsx')
    const html = renderToStaticMarkup(h(YourWordsPage, {}))
    expect(html).not.toContain('<details class="px-explain"')
    const hints = [...html.matchAll(/<details class="px-hint-mark"[^>]*>([\s\S]*?)<\/details>/gu)]
    expect(hints).toHaveLength(1)
    expect(hints[0]![1]).toContain(said('w13q.yourWords.what'))
    expect(html.indexOf('</h1>'), 'the "?" stands after the heading').toBeLessThan(html.indexOf('px-hint-mark'))
  })

  it('on #/casting, where nothing is folded because the page draws no explanation', async () => {
    await freshPages()
    const { TheCasting } = await import('../src/web/pages/CastingPage.tsx')
    const html = renderToStaticMarkup(h(TheCasting, { reading: { roles: [], programs: [], labels: [], rules: [], harnesses: [] } as never, projects: [] }))
    expect(html).not.toContain('<details')
    for (const key of ['w13q.casting.ruleMeaning', 'w13q.casting.ruleOpens', 'casting.rule', 'casting.lede', 'casting.projectReplaces']) {
      expect(html, key).not.toContain(said(key))
    }
  })
})
