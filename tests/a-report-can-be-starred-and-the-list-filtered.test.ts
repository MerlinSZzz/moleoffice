// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { g7bHeaders, g7bRequest } from './g7b-fixture.ts'

const { t } = createI18n('en')
let office: LiveApp
let moduleId = ''
const reports: string[] = []
const otherPerson = { ...g7bHeaders, 'x-mole-office-actor-id': 'another-person' }
const agent = { ...g7bHeaders, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'test-agent' }

async function star(id: string, starred: boolean, headers = g7bHeaders) {
  return fetch(`${office.api}/api/records/report-stars/${id}`, { method: 'PUT', headers, body: JSON.stringify({ starred }) })
}
async function stars(headers = g7bHeaders) {
  const response = await fetch(`${office.api}/api/records/report-stars`, { headers })
  expect(response.status).toBe(200)
  return (await response.json() as { stars: string[] }).stars
}
async function list(query: string) {
  const response = await fetch(`${office.api}/api/records/reports-and-notes?show=reports&limit=50&${query}`, { headers: g7bHeaders })
  expect(response.status).toBe(200)
  return response.json() as Promise<{ matched: number; rows: { id: string }[] }>
}

beforeAll(async () => {
  office = await liveApp({ name: 'report-stars', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  moduleId = (await g7bRequest(office, '/api/records', 'POST', { kind: 'module', title: 'Made-up archive', data: { context: 'Archive reports.', parts: [] } })).record.id as string
  for (let n = 0; n < 53; n++) {
    reports.push((await g7bRequest(office, '/api/records', 'POST', {
      kind: 'report', title: `Made-up report ${String(n).padStart(2, '0')}`,
      data: { for: 'Readers', date: '2026-01-01', ...(n === 52 ? { read: 'read' } : {}) },
      links: [{ type: 'about', toId: moduleId }],
    })).record.id as string)
  }
}, 300_000)
afterAll(async () => { await office?.stop() })

it('keeps each person’s stars and refuses an agent', async () => {
  expect((await star(reports[0]!, true)).status).toBe(200)
  expect(await stars()).toContain(reports[0])
  expect(await stars(otherPerson)).not.toContain(reports[0])
  expect((await star(reports[1]!, true, otherPerson)).status).toBe(200)
  expect(await stars()).not.toContain(reports[1])
  expect((await star(reports[2]!, true, agent)).status).toBe(403)
  expect((await star(reports[0]!, false)).status).toBe(200)
  expect(await stars()).not.toContain(reports[0])
})

it('counts and pages the filtered reports before cutting the page', async () => {
  for (const id of reports.slice(0, 52)) expect((await star(id, true)).status).toBe(200)
  for (const [query, total] of [['filter=unread', 52], ['filter=starred', 52], [`scope=${moduleId}`, 53]] as const) {
    const first = await list(query)
    const second = await list(`${query}&offset=50`)
    expect(first.matched).toBe(total)
    expect(first.rows).toHaveLength(50)
    expect(second.matched).toBe(total)
    expect(second.rows).toHaveLength(total - 50)
    expect(second.rows.every(row => !first.rows.some(firstRow => firstRow.id === row.id))).toBe(true)
  }
})

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 900 }]) {
  it(`stars and filters reports at ${viewport.width}`, async () => {
    expect((await star(reports[52]!, true)).status).toBe(200)
    const context = await office.browser.newContext({ viewport })
    const page = await context.newPage()
    try {
      await page.goto(`${office.site}/?lang=en#/notes`)
      await waitForThePage(page, 60_000)
      const row = page.locator('.rpts-row').first().locator('..')
      const button = row.getByRole('button', { name: t('reports.star.remove' as never) })
      await button.click()
      await row.getByRole('button', { name: t('reports.star.add' as never) }).click()
      await page.reload()
      await row.getByRole('button', { name: t('reports.star.remove' as never) }).waitFor({ timeout: 60_000 })
      await page.getByRole('button', { name: t('reports.filter.unread' as never), exact: true }).click()
      await expect.poll(() => page.url()).toContain('filter=unread')
      await page.getByRole('button', { name: t('reports.filter.starred' as never), exact: true }).click()
      await expect.poll(() => page.url()).toContain('filter=starred')
      await page.locator('.rpts-modules summary').click()
      await page.getByRole('button', { name: 'Made-up archive', exact: true }).click()
      await expect.poll(() => page.url()).toContain(`scope=${moduleId}`)
      await page.locator('.rpts-row').first().click()
      await expect.poll(() => page.locator('.rpts-row').count()).toBe(0)
      await page.getByRole('button', { name: t('reports.star.remove' as never) }).click()
      await page.getByRole('button', { name: t('reports.star.add' as never) }).click()
      await page.reload()
      await page.getByRole('button', { name: t('reports.star.remove' as never) }).waitFor({ timeout: 60_000 })
      await page.goBack()
      await expect.poll(() => page.url()).toContain('filter=starred')
      expect(page.url()).toContain(`scope=${moduleId}`)
    } finally { await context.close() }
  }, 180_000)
}
