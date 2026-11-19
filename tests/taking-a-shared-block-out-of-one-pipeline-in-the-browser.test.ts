// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { blockNameIn } from '../src/shared/blocks.ts'
import { g7bFixture, g7bRequest } from './g7b-fixture.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const { t } = createI18n('en')
let office: LiveApp
let page: Page
beforeAll(async () => {
  office = await liveApp({ name: 'shared-block', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  page = office.page
  page.setDefaultTimeout(15_000)
}, 240_000)
afterAll(async () => { await office?.stop() })

async function setup() {
  const fixture = await g7bFixture(office)
  await g7bRequest(office, `/api/records/${fixture.empty.id}`, 'PATCH', { dataPatch: { blockIds: [fixture.second.id] } })
  return fixture
}
async function open(pipelineId: string, blockTitle: string) {
  await page.goto(`${office.site}/?lang=en#/pipeline/${pipelineId}`)
  await waitForThePage(page, 30_000)
  await page.locator('.gx-loading').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: t('g7b.StructureView.edit'), exact: true }).click()
  await page.locator('.gx-drawer').getByRole('button', { name: t('g7b.Edit.add_or_edit_a_block'), exact: true }).click()
  await page.locator('.gx-order-row').filter({ hasText: blockTitle }).getByRole('button', { name: t('g7b.press.removeBlock'), exact: true }).click()
}
async function question() {
  const dialog = page.getByRole('dialog')
  expect(await dialog.textContent()).toContain(t('sharedBlock.removeQuestion' as never))
  expect(await dialog.textContent()).toContain(t('sharedBlock.removeWarning' as never))
  return dialog
}
async function refreshedOrder(removed: string, titles: string[]) {
  await expect.poll(() => page.locator('.gx-order-row').filter({ hasText: removed }).count(), { timeout: 15_000 }).toBe(0)
  expect(await page.locator('.gx-order-name').allTextContents()).toEqual(titles)
}
async function confirm() {
  await page.getByRole('dialog').getByRole('button', { name: t('g7b.press.removeBlock'), exact: true }).click()
  await page.locator('.gx-outcome-said').waitFor()
}

it('says the block stays in the other pipeline, then says when it is deleted', async () => {
  const f = await setup()
  await open(f.pipe.id, f.second.title)
  await question()
  await confirm()
  await refreshedOrder(f.second.title, [blockNameIn(f.first.title, f.pipe.title), blockNameIn(f.last.title, f.pipe.title)])
  expect(await page.locator('.gx-outcome-said').innerText()).toContain(t('sharedBlock.removedStillListed' as never, { v1: f.second.title, v2: f.pipe.title, v3: f.empty.title }))
  expect((await g7bRequest(office, `/api/records/${f.empty.id}`)).record.data.blockIds).toEqual([f.second.id])
  await open(f.empty.id, f.second.title)
  await question()
  await confirm()
  await refreshedOrder(f.second.title, [])
  expect(await page.locator('.gx-outcome-said').innerText()).toContain(t('g7b.Edit.was_position_of_and_is_now_deleted', { v1: f.second.title, v2: 1, v3: f.empty.title }))
}, 180_000)

it('waits for the reloaded order before showing the outcome and enabling presses', async () => {
  const f = await setup()
  await open(f.pipe.id, f.second.title)
  await question()
  let release!: () => void
  let reached!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  const requested = new Promise<void>((resolve) => { reached = resolve })
  const isRecordsReload = (url: URL) => url.pathname === '/api/records' && url.searchParams.get('family') === 'structure'
  await page.route(isRecordsReload, async (route) => {
    reached()
    await held
    await route.continue()
  })
  try {
    const deletion = page.waitForResponse((response) => response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname === `/api/records/${f.pipe.id}/blocks/${f.second.id}`)
    await page.getByRole('dialog').getByRole('button', { name: t('g7b.press.removeBlock'), exact: true }).click()
    expect((await deletion).ok()).toBe(true)
    await requested
    const dialog = page.getByRole('dialog')
    expect(await dialog.isVisible()).toBe(true)
    const confirmPress = dialog.locator('button').last()
    expect(await confirmPress.isDisabled()).toBe(true)
    expect(await confirmPress.textContent()).toContain(t('sheet.button.saving'))
    expect(await dialog.getByRole('button', { name: t('g7b.press.cancel'), exact: true }).isDisabled()).toBe(true)
    expect(await page.locator('.gx-outcome-said').count()).toBe(0)
    const row = page.locator('.gx-order-row').filter({ hasText: f.second.title })
    expect(await row.count()).toBe(1)
    expect(await row.locator('.tiered-press > button').isDisabled()).toBe(true)
    expect(await row.locator('.gx-order-move').first().isDisabled()).toBe(true)
    expect(await page.locator('.pp-rereading').isVisible()).toBe(true)
    release()
    await dialog.waitFor({ state: 'detached' })
    await refreshedOrder(f.second.title, [blockNameIn(f.first.title, f.pipe.title), blockNameIn(f.last.title, f.pipe.title)])
    await page.locator('.gx-outcome-said').waitFor()
    expect(await page.locator('.pp-rereading').count()).toBe(0)
    expect(await page.locator('.gx-outcome-said').innerText()).toContain(t('sharedBlock.removedStillListed' as never, { v1: f.second.title, v2: f.pipe.title, v3: f.empty.title }))
  } finally {
    release()
    await page.unroute(isRecordsReload)
  }
}, 180_000) // Measured alone: 0.476 seconds in run alone.

it('keeps the successful write and enables presses if rereading fails', async () => {
  const f = await setup()
  await open(f.pipe.id, f.second.title)
  await question()
  const isRecordsReload = (url: URL) => url.pathname === '/api/records' && url.searchParams.get('family') === 'structure'
  await page.route(isRecordsReload, (route) => route.fulfill({ status: 500, body: 'Reload failed' }))
  try {
    const deletion = page.waitForResponse((response) => response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname === `/api/records/${f.pipe.id}/blocks/${f.second.id}`)
    await page.getByRole('dialog').getByRole('button', { name: t('g7b.press.removeBlock'), exact: true }).click()
    expect((await deletion).ok()).toBe(true)
    await page.locator('.gx-outcome-said').waitFor()
    expect(await page.locator('.gx-outcome-said').innerText()).toContain(t('sharedBlock.removedStillListed' as never, { v1: f.second.title, v2: f.pipe.title, v3: f.empty.title }))
    const row = page.locator('.gx-order-row').filter({ hasText: f.second.title })
    await expect.poll(() => row.getByRole('button', { name: t('g7b.press.removeBlock'), exact: true }).isEnabled()).toBe(true)
    expect(await page.locator('.gx-drawer').isVisible()).toBe(true)
    expect(await page.locator('.pp-rereading').count()).toBe(0)
  } finally {
    await page.unroute(isRecordsReload)
  }
}, 180_000) // Measured alone: 0.461 seconds in run alone.

