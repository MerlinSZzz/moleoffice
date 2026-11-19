// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Page } from 'playwright'

/**
 * CHOOSE A SETTINGS CATEGORY, OR EACH IN TURN, for a test that reads what is inside its panels. Since wave 13y round
 * 125 (item 62) the Settings page draws one category at a time, chosen in its list, with every panel of it open
 * (src/web/components/SettingsFolds.tsx). A panel of another category is not drawn at all, so a test that reads a
 * panel chooses its category first, the way a person does, and a test that read every panel at once reads them
 * category by category.
 *
 * Before that round, a decision folded every panel to its title and these helpers pressed the
 * folds.
 */

/** The categories in the page's list, in its order. */
export async function settingsCategories(page: Page): Promise<string[]> {
  await page.locator('.set .sf-jump').first().waitFor()
  return page.locator('.set .sf-jump').evaluateAll((all) => all.map((one) => one.getAttribute('data-category') ?? ''))
}

/** Choose one category in the list, and wait until it is drawn and none of its panels is still loading. */
export async function chooseSettingsCategory(page: Page, category: string): Promise<void> {
  await page.locator(`.set .sf-jump[data-category="${category}"]`).click()
  await page.locator(`.set .sf-cat[data-category="${category}"]`).waitFor()
  await page.waitForFunction(() => document.querySelectorAll('.set .px-loading').length === 0, undefined, { timeout: 30_000 })
}

/** Choose each category in turn, in the list's order, and read it before the next is chosen. */
export async function readEverySettingsCategory(page: Page, read: (category: string) => Promise<void>): Promise<void> {
  for (const category of await settingsCategories(page)) {
    await chooseSettingsCategory(page, category)
    await read(category)
  }
}

/** Show what a selector names inside Settings: when nothing it names is drawn, choose each category until it is. */
export async function chooseTheCategoryThatDraws(page: Page, selector: string): Promise<void> {
  const drawn = page.locator(`.set ${selector}`)
  for (const category of await settingsCategories(page)) {
    if ((await drawn.count()) > 0) break
    await chooseSettingsCategory(page, category)
  }
  await drawn.first().waitFor()
}

/** Show one Settings panel by its surface id: when it is not drawn, choose each category until it is. */
export async function openSettingsPanel(page: Page, surface: string): Promise<void> {
  await chooseTheCategoryThatDraws(page, `[data-settings-panel="${surface}"]`)
}
