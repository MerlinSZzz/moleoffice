// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app: LiveApp
const gate = (id: string) => app.page.locator(`[data-gate="${id}"]`)
async function open() {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&mode=normal#/gates`)
  await waitForThePage(app.page, 30_000)
  await gate('checks-an-hour').waitFor()
}
async function edit(id: string) {
  await gate(id).getByRole('button', { name: 'Edit', exact: true }).click()
}
beforeAll(async () => {
  app = await liveApp({ name: 'gate-row-edit', workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.page.addInitScript((owner) => localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: owner })), THE_TEST_OFFICES_OWNER.id)
}, 240_000)
afterAll(async () => { await app?.stop() })

it('opens as a reading and edits only the row whose press was used', async () => {
  await open()
  const first = gate('checks-an-hour'), second = gate('conflict-resolving')
  expect(await app.page.locator('[data-gate] fieldset').count()).toBe(0)
  expect(await first.getByRole('button', { name: 'Edit', exact: true }).count()).toBe(1)
  expect(await second.getByRole('button', { name: 'Edit', exact: true }).count()).toBe(1)
  await edit('checks-an-hour')
  expect(await first.locator('fieldset').count()).toBe(1)
  expect(await second.locator('fieldset').count()).toBe(0)
  expect(new URL(app.page.url()).hash).toBe('#/gates')
}, 60_000)

it('returns the row to reading after a successful save', async () => {
  await open(); await edit('checks-an-hour')
  const row = gate('checks-an-hour')
  await row.getByLabel('From 1 to 6', { exact: true }).fill('3')
  await row.getByLabel('Reason (required)', { exact: true }).fill('A made-up change')
  await row.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => row.locator('fieldset').count()).toBe(0)
  await expect.poll(() => row.locator('.gates-position').innerText()).toContain('In force: 3')
  expect(await row.getByRole('button', { name: 'Edit', exact: true }).count()).toBe(1)
}, 60_000)

it('keeps a refused number and its reason in the open row', async () => {
  await open(); await edit('checks-an-hour')
  const row = gate('checks-an-hour')
  await row.getByLabel('From 1 to 6', { exact: true }).fill('7')
  await row.getByLabel('Reason (required)', { exact: true }).fill('A made-up refused number')
  const response = app.page.waitForResponse((r) => r.url().endsWith('/api/office/settings') && r.request().method() === 'POST')
  await row.getByRole('button', { name: 'Save', exact: true }).click()
  expect((await response).status()).toBe(400)
  expect(await row.getByLabel('From 1 to 6', { exact: true }).inputValue()).toBe('7')
  expect(await row.getByLabel('Reason (required)', { exact: true }).inputValue()).toBe('A made-up refused number')
  expect(await row.locator('fieldset').count()).toBe(1)
}, 60_000)

it('keeps the row and typed reason open when the office refuses a person-only change', async () => {
  await open(); await edit('test-batch-seats')
  const row = gate('test-batch-seats')
  await row.getByLabel('From 1 to 64', { exact: true }).fill('4')
  await row.getByLabel('Reason (required)', { exact: true }).fill('A made-up reason')
  await app.page.route('**/api/office/settings', async (route) => {
    const response = await route.fetch({ url: `${app.api}/api/office/gates`, method: 'GET', postData: undefined })
    await route.fulfill({ response, status: 403, json: { error: 'Only the person may change this.' } })
  })
  try {
    await row.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => row.innerText()).toContain('Only the person may change this.')
    expect(await row.getByLabel('From 1 to 64', { exact: true }).inputValue()).toBe('4')
    expect(await row.getByLabel('Reason (required)', { exact: true }).inputValue()).toBe('A made-up reason')
    expect(await row.locator('fieldset').count()).toBe(1)
  } finally { await app.page.unroute('**/api/office/settings') }
}, 60_000)


it('photographs a gate while reading, editing and refused at the requested widths and languages', async () => {
  const folder = process.env.W13R_ROW_SHOTS
  if (!folder) return
  const { mkdirSync } = await import('node:fs')
  const { join } = await import('node:path')
  mkdirSync(folder, { recursive: true })
  let savedValue = 150
  for (const language of ['en', 'zh']) for (const width of (language === 'en' ? [1440, 990, 660, 390] : [1440, 390])) for (const theme of ['light', 'dark']) {
    await app.page.setViewportSize({ width, height: 2000 })
    await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
    await app.page.goto('about:blank')
    await app.page.goto(`${app.site}/?lang=${language}&mode=normal&look=${theme}#/gates`)
    await waitForThePage(app.page, 30_000)
    const row = gate('test-batch-disk-limit')
    await row.waitFor()
    expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await putTheMadeUpLabelIn(app.page, 'Made-up test office — a gate row', row.locator('h5'), 'the gate row')
    await row.scrollIntoViewIfNeeded()
    await app.page.screenshot({ path: join(folder, `page-reading-${language}-${width}-${theme}.png`) })
    await row.screenshot({ path: join(folder, `gate-reading-${language}-${width}-${theme}.png`) })
    await row.locator(':scope > button').first().click()
    await row.scrollIntoViewIfNeeded()
    await app.page.screenshot({ path: join(folder, `page-editing-${language}-${width}-${theme}.png`) })
    await row.screenshot({ path: join(folder, `gate-editing-${language}-${width}-${theme}.png`) })
    await row.locator('input[type=number]').fill('100001')
    await row.locator('input[required]').fill('Made-up reason')
    const response = app.page.waitForResponse((r) => r.url().endsWith('/api/office/settings') && r.request().method() === 'POST')
    await row.locator('.gates-actions button').nth(-3).click()
    expect((await response).status()).toBe(400)
    await expect.poll(() => row.locator('[role=alert]').count()).toBeGreaterThan(0)
    await row.scrollIntoViewIfNeeded()
    await app.page.screenshot({ path: join(folder, `page-refused-${language}-${width}-${theme}.png`) })
    await row.screenshot({ path: join(folder, `gate-refused-${language}-${width}-${theme}.png`) })
    savedValue += 1
    await row.locator('input[type=number]').fill(String(savedValue))
    const saved = app.page.waitForResponse((r) => r.url().endsWith('/api/office/settings') && r.request().method() === 'POST')
    await row.locator('.gates-actions button').first().click()
    expect((await saved).status()).toBe(200)
    await expect.poll(() => row.locator('fieldset').count()).toBe(0)
    await expect.poll(() => row.locator('.gates-position').innerText()).toContain(String(savedValue))
    await expect.poll(() => row.locator('.gates-history').innerText()).toContain('Made-up reason')
    await row.scrollIntoViewIfNeeded()
    await app.page.screenshot({ path: join(folder, `page-saved-${language}-${width}-${theme}.png`) })
    await row.screenshot({ path: join(folder, `gate-saved-${language}-${width}-${theme}.png`) })
  }
}, 240_000)
