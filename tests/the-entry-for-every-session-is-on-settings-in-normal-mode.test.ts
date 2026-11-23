// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ENTRY FOR EVERY SESSION IS ON SETTINGS IN NORMAL MODE, as decided.
 *
 * The section and its press "Put the entry in place" were drawn in Developer mode only, so a person who followed the
 * release page in Normal mode found no such section. Normal mode now draws it as well, in the "Tools" category.
 *
 * At 1440 and at 390 wide, Settings opened in Normal mode by the address it names draws the section's heading and its
 * press. Every word is read from its key. Before the change, Normal mode drew the "Normal or Developer" section in its
 * place, so both cases here asked for something the page did not draw.
 *
 * The test world's person starts in Developer mode, so each case asks for Normal mode in the address.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'

import { createI18n } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const { t } = createI18n('en')
let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'entry-in-normal-mode', viewport: { width: 1440, height: 900 } })
}, 120_000)

afterAll(async () => {
  await app?.stop()
})

for (const width of [1440, 390] as const) {
  it(`draws the entry's heading and its press in Normal mode, ${width} wide`, async () => {
    await app.page.setViewportSize({ width, height: 900 })
    await app.page.goto(`${app.site}/?lang=en&mode=normal#/settings/entry`)
    await waitForThePage(app.page, 30_000)
    await app.page.locator('html[data-mode="normal"]').waitFor({ state: 'attached' })
    const section = app.page.locator('.set [data-settings-panel="settings.entry"]')
    await section.waitFor()
    expect(await section.locator('.sf-title').first().textContent()).toBe(t('settingsPanel.title.entry'))
    const press = section.getByRole('button', { name: t('settingsPanel.entry.put') })
    await press.waitFor()
    expect(await press.isVisible(), `the press is not seen ${width} wide`).toBe(true)
    // The category shown is the one the page says the panel is in, and it is not a developer category.
    expect(await section.evaluate((one) => one.closest('.sf-cat')?.getAttribute('data-category') ?? '')).toBe('tools')
  }, 120_000)
}
