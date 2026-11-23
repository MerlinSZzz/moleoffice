// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { REPORTS_PAGE_SIZE } from '../src/shared/reports-page.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { g7bRequest } from './g7b-fixture.ts'
import { putThePageAt, thePageAtRest, whereThePageIs } from './the-page-scroller.ts'

const { t } = createI18n('en')
let office: LiveApp
let moduleId = ''
beforeAll(async () => {
  office = await liveApp({ name: 'reports-return', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  moduleId = (await g7bRequest(office, '/api/records', 'POST', { kind: 'module', title: 'Made-up archive', data: { context: 'Reports for an archive.', parts: [] } })).record.id as string
  for (let n = 0; n < REPORTS_PAGE_SIZE * 2; n++) {
    await g7bRequest(office, '/api/records', 'POST', { kind: 'report', title: `Made-up archive report ${String(n).padStart(3, '0')}`, data: { for: 'Readers', date: '2026-01-01', read: 'read' }, links: [{ type: 'about', toId: moduleId }] })
  }
}, 300_000)
afterAll(async () => { await office?.stop() })

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 900 }]) {
  it(`returns to the same page, scope and scroll at ${String(viewport.width)}`, async () => {
    const context = await office.browser.newContext({ viewport })
    const page = await context.newPage()
    try {
      await page.goto(`${office.site}/?lang=en#/notes`)
      await waitForThePage(page, 60_000)
      await page.getByRole('button', { name: t('paging.next'), exact: true }).click()
      await expect.poll(() => page.url()).toContain(`offset=${String(REPORTS_PAGE_SIZE)}`)
      await page.goto(`${office.site}/?lang=en#/notes?show=reports&offset=${String(REPORTS_PAGE_SIZE)}&scope=${moduleId}`)
      await page.locator('.rpts-row').first().waitFor({ timeout: 60_000 })
      await putThePageAt(page, 1000)
      await thePageAtRest(page)
      const row = page.locator('.rpts-row').nth(20)
      await row.scrollIntoViewIfNeeded()
      await thePageAtRest(page)
      const before = await whereThePageIs(page)
      expect(before).toBeGreaterThan(100)
      await row.click({ position: { x: 5, y: 5 } })
      await page.goBack()
      await page.locator('.rpts-row').first().waitFor({ timeout: 60_000 })
      expect(page.url()).toContain(`offset=${String(REPORTS_PAGE_SIZE)}`)
      expect(page.url()).toContain(`scope=${moduleId}`)
      expect(page.url()).toContain('show=reports')
      await expect.poll(async () => Math.abs((await whereThePageIs(page)) - before), { timeout: 15_000 }).toBeLessThanOrEqual(40)
    } finally { await context.close() }
  }, 180_000)
}
