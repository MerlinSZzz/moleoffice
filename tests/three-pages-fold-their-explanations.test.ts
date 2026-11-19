// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THREE PAGES KEEP THEIR FACTS IN SIGHT AND FOLD THEIR EXPLANATIONS: the first sweep of a decision,
 * concise by default and the detail one press away.
 *
 * WHAT THIS FILE PROVES, on each page's own drawing, in English, with nothing fetched:
 *   1. #/your-words shows where the words came from, and what Confirm and "Not what I said" store sits in a closed fold;
 *   2. #/casting draws no explanation and no fold: the page omits explanatory text, and the rules of the roll are fixed
 *      lines on its Rules tab, which
 *      the-casting-work-groups-in-the-browser reads;
 *   3. #/merge-queue shows what the page is, and what a lane and a bus are sits in a closed fold.
 * Each explanation is still drawn, word for word: it is moved down one step and never deleted.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   an explanation drawn outside its fold again, or the fold drawn open   → the case for that page
 *   the explanation's sentence dropped from the fold                        → the case for that page
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

/** The one fold on the page: whether it is drawn open, its summary and its body; and the page outside the fold. */
function theFold(html: string): { open: boolean; summary: string; body: string; outside: string } {
  const folds = [...html.matchAll(/<details class="px-explain"([^>]*)>([\s\S]*?)<\/details>/gu)]
  expect(folds).toHaveLength(1)
  const [whole, attributes, inner] = folds[0]!
  const summary = /<summary[^>]*>([\s\S]*?)<\/summary>/u.exec(inner!)?.[1] ?? ''
  return { open: /\sopen/u.test(attributes!), summary, body: inner!.replace(summary, ''), outside: html.replace(whole, '') }
}

describe('the explanations are one press down', () => {
  it('on #/your-words', async () => {
    await freshPages()
    const { YourWordsPage } = await import('../src/web/pages/YourWordsPage.tsx')
    const fold = theFold(renderToStaticMarkup(h(YourWordsPage, {})))
    expect(fold.open).toBe(false)
    expect(fold.summary).toContain(said('w13q.yourWords.what'))
    expect(fold.summary).toContain(said('w13q.yourWords.whatThePressesStore'))
    for (const key of ['w13q.yourWords.confirmDoes', 'w13q.yourWords.notWhatISaidDoes', 'w13q.yourWords.whereNotRecorded']) {
      expect(fold.body).toContain(said(key))
      expect(fold.outside).not.toContain(said(key))
    }
  })

  it('on #/casting, where nothing is folded because the page draws no explanation', async () => {
    await freshPages()
    const { TheCasting } = await import('../src/web/pages/CastingPage.tsx')
    const html = renderToStaticMarkup(h(TheCasting, { reading: { roles: [], programs: [], labels: [], rules: [] } as never, projects: [] }))
    expect(html).not.toContain('<details')
    for (const key of ['w13q.casting.ruleMeaning', 'w13q.casting.ruleOpens', 'casting.rule', 'casting.lede', 'casting.projectReplaces']) {
      expect(html, key).not.toContain(said(key))
    }
  })

  it('on #/merge-queue', async () => {
    await freshPages()
    const { MergeQueuePage } = await import('../src/web/pages/MergeQueuePage.tsx')
    const fold = theFold(renderToStaticMarkup(h(MergeQueuePage)))
    expect(fold.open).toBe(false)
    expect(fold.summary).toContain(said('w13q.mergeQueue.meaning'))
    expect(fold.summary).toContain(said('w13q.mergeQueue.termsOpen'))
    expect(fold.body).toContain(said('mergeQueuePage.intro'))
    expect(fold.outside).not.toContain(said('mergeQueuePage.intro'))
  })
})
