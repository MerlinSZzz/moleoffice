// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const { t } = createI18n('en')
const key = 'noticeRules.title'
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'open-word-history', workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.context.addInitScript(({ person }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  }, { person: THE_TEST_OFFICES_OWNER.id })
  const read = await fetch(app.api + '/api/words/table?key=' + key, { headers })
  expect(read.status).toBe(200)
  const row = (await read.json()).words[0]
  const saved = await fetch(app.api + '/api/words/table', { method: 'POST', headers, body: JSON.stringify({ key, version: row.version, en: 'Made-up earlier notice heading', zh: row.zh, chineseMatchesEnglish: false, because: 'Made-up earlier choice for the history' }) })
  expect(saved.status, await saved.clone().text()).toBe(200)
}, 240_000)
afterAll(async () => { await app?.stop() }, 120_000)

async function openEditor(width: number, theme: string) {
  const page = app.page
  await page.setViewportSize({ width, height: 1100 })
  const url = app.site + `/?lang=en&look=${theme}&mode=normal#/settings/words`
  if (page.url() === url) await page.reload()
  else await page.goto(url)
  await waitForThePage(page, 60_000)
  expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
  const table = page.locator('[data-word-table]')
  await table.getByLabel(t('wordTable.find'), { exact: true }).fill(key)
  const editor = table.locator(`[data-word-key="${key}"]`)
  await editor.locator(':scope > summary').click()
  return { page, editor, history: editor.locator('details').filter({ has: page.getByText(t('wordTable.history'), { exact: true }) }) }
}

for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) {
  it(`keeps Previous choices open after saving and re-reading at ${width} in ${theme}`, async () => {
    const { page, editor, history } = await openEditor(width, theme)
    await history.locator(':scope > summary').click()
    await expect.poll(() => history.locator('pre').first().isVisible(), { timeout: 15_000 }).toBe(true)
    const choice = `Made-up notice heading at ${width} in ${theme}`
    await editor.getByLabel(t('wordTable.english'), { exact: true }).fill(choice)
    await editor.getByLabel(t('wordTable.reason'), { exact: true }).fill('Made-up reason to keep reading the previous choices')
    await editor.getByRole('button', { name: t('wordTable.save'), exact: true }).click()
    // The summary reads the saved row, so this waits for the table re-read, not just the save reply.
    await expect.poll(() => editor.locator(':scope > summary').innerText(), { timeout: 15_000 }).toContain(choice)
    try {
      expect(await editor.evaluate(node => (node as HTMLDetailsElement).open)).toBe(true)
      expect(await history.evaluate(node => (node as HTMLDetailsElement).open)).toBe(true)
      await expect.poll(() => history.getByText(choice, { exact: true }).isVisible(), { timeout: 15_000 }).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    } finally {
      const folder = process.env.W13R_HISTORY_SHOTS
      if (folder) {
        mkdirSync(folder, { recursive: true })
        await putTheMadeUpLabelIn(page, 'Made-up test office: word history after saving, with no real office data', history, 'the saved word history')
        await page.screenshot({ path: `${folder}/word-history-${width}-${theme}.png`, fullPage: false })
      }
    }
  }, 90_000)
}

it('keeps a history closed when the person closes it before saving', async () => {
  const { editor, history } = await openEditor(1440, 'light')
  await history.locator(':scope > summary').click()
  await expect.poll(() => history.locator('pre').first().isVisible(), { timeout: 15_000 }).toBe(true)
  await history.locator(':scope > summary').click()
  await expect.poll(() => history.evaluate(node => (node as HTMLDetailsElement).open)).toBe(false)
  const choice = 'Made-up notice heading with the history closed'
  await editor.getByLabel(t('wordTable.english'), { exact: true }).fill(choice)
  await editor.getByLabel(t('wordTable.reason'), { exact: true }).fill('Made-up reason after closing the history')
  await editor.getByRole('button', { name: t('wordTable.save'), exact: true }).click()
  await expect.poll(() => editor.locator(':scope > summary').innerText(), { timeout: 15_000 }).toContain(choice)
  expect(await history.evaluate(node => (node as HTMLDetailsElement).open)).toBe(false)
}, 90_000)
