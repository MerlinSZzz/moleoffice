// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Page } from 'playwright'

/** Inspect only the requested part of a page; content and untranslated neighbours can be excluded. */
export async function visibleTextOutsideTestWords(page: Page, selector = 'body'): Promise<string[]> {
  return page.locator(selector).evaluateAll((roots) => {
    const found: string[] = []
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode
        const parent = node.parentElement
        if (parent === null || parent.closest('script, style, [hidden], [aria-hidden="true"]') !== null) continue
        if (!parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue
        const outside = (node.textContent ?? '').replace(/⟦[^⟧]*⟧/g, '').trim()
        if (outside !== '') found.push(outside)
      }
    }
    return found
  })
}
