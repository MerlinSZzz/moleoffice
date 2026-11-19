// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OPEN OR SHUT THE REVIEW TRAY'S LIST, in any language. A review in the tray at the foot of the window is one row at
 * first (wave 13y round 146, item 73a), and its recipient line, its comments and More are in the list that the row's
 * Show comments press opens. The open list stands over the page's foot, so a case that goes on to press the page shuts
 * it again with Hide comments, as a person would. That press is the only one in the row that says whether what it opens
 * is open (`aria-expanded`), so a list already as asked is left as it is, and the step ends when the press says so.
 */
import type { Page } from 'playwright'

export async function setTheReviewTraysList(page: Page, to: 'open' | 'shut'): Promise<void> {
  const expanded = to === 'open' ? 'true' : 'false'
  const press = page.locator('[data-part="your-review-bar"] button[aria-expanded]')
  await press.waitFor({ timeout: 30_000 })
  if ((await press.getAttribute('aria-expanded')) !== expanded) await press.click()
  await page.locator(`[data-part="your-review-bar"] button[aria-expanded="${expanded}"]`).waitFor({ timeout: 30_000 })
}
