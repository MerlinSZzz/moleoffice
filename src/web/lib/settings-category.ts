// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH SETTINGS CATEGORY THIS BROWSER LAST OPENED (wave 13y round 125, item 62). Settings draws one category at a
 * time, and opens on the one the person last chose here.
 *
 * It is this browser's, like the Decisions page's view in lib/queueview.ts beside it, and it fails the same way: a
 * browser that will not remember it says so above the list, and the choice still holds while the page is open. A
 * stored word this build has no category for is dropped and said, by store.ts. A fault is handed back whole, because
 * its words are read in the page's language when it is drawn (storeFault in store.ts).
 *
 * The categories themselves are SettingsPage.tsx's, so the list of allowed words is passed in, not written here.
 */

import { readChoice, writeChoice, type StoreFault } from './store.ts'

/** Where the choice is kept in this browser. */
export const SETTINGS_CATEGORY_KEY = 'mole-office.settings.category'

/** The category this browser last opened, or the fallback when it has opened none, and anything that went wrong. */
export function rememberedSettingsCategory<T extends string>(categories: readonly T[], fallback: T): { category: T; fault: StoreFault | null } {
  const faults: StoreFault[] = []
  const category = readChoice(SETTINGS_CATEGORY_KEY, categories, fallback, faults)
  return { category, fault: faults[0] ?? null }
}

/** Remember it for next time. Null when it was written; the store's fault when the browser would not keep it. */
export function rememberSettingsCategory(category: string): StoreFault | null {
  const faults: StoreFault[] = []
  writeChoice(SETTINGS_CATEGORY_KEY, category, faults)
  return faults[0] ?? null
}
