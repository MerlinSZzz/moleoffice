// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { beforeAll, afterAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
let app: LiveApp
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
// The Working page's heading, which the page draws in every mode, before its reading has loaded.
const key = 'g6a.working.title'
const hostile = '<img src=x onerror="window.madeUpWordExecuted=true"> Made-up Working heading stays text.'
const example = 'Made-up Working heading'
async function initialise(page: Page, workspace = 'default') {
  await page.addInitScript(({ id, workspace }) => { localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id })); localStorage.setItem('mole-office.workspace', workspace); localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light') }, { id: THE_TEST_OFFICES_OWNER.id, workspace })
}
async function row() { const r = await fetch(app.api + '/api/words/table?key=' + key, { headers }); expect(r.status).toBe(200); return (await r.json()).words[0] }
beforeAll(async () => {
  app = await liveApp({ name: 'editable-page-words', workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await initialise(app.page)
  const project = await fetch(app.api + '/api/workspaces', { method: 'POST', headers, body: JSON.stringify({ id: 'word-setting-demo', title: 'Made-up second project' }) })
  expect(project.status).toBe(201)
}, 240_000)
afterAll(async () => { await app?.stop() }, 120_000)

it('a Settings press updates an open page without a reload, keeps hostile words as text, and restores the shipped word', async () => {
  const other = await app.browser.newContext()
  // This page's own re-read of the table after the save waits until the case lets it go, so the row is drawn again at a known point.
  let letTheReReadGo = () => {}
  const reReadHeld = new Promise<void>(resolve => { letTheReReadGo = resolve })
  const theTable = (url: URL) => url.pathname === '/api/words/table'
  try {
    const showing = await other.newPage(); await initialise(showing, 'word-setting-demo')
    await showing.goto(app.site + '/?lang=en&mode=normal#/working'); await waitForThePage(showing, 60_000)
    const original = (await row()).en
    await app.page.goto(app.site + '/?lang=en&mode=normal#/settings/words'); await waitForThePage(app.page, 60_000)
    const table = app.page.locator('[data-word-table]')
    await table.getByLabel('Find a word', { exact: true }).fill(key)
    const editor = table.locator(`[data-word-key="${key}"]`)
    await editor.locator(':scope > summary').click()
    await editor.getByLabel('English', { exact: true }).fill(hostile)
    await editor.getByLabel('Why change this word?', { exact: true }).fill('Made-up hostile-text check')
    await app.page.route(theTable, async route => { if (route.request().method() === 'GET') await reReadHeld; await route.continue() })
    await editor.getByRole('button', { name: 'Save word', exact: true }).click()
    await expect.poll(() => row().then(r => r.en), { timeout: 15_000 }).toBe(hostile)
    await expect.poll(() => showing.locator('.wrk-title').filter({ hasText: 'Made-up Working heading' }).innerText(), { timeout: 15_000 }).toBe(hostile)
    expect(await showing.locator('img[src="x"]').count()).toBe(0)
    expect(await showing.evaluate(() => (window as Window & { madeUpWordExecuted?: boolean }).madeUpWordExecuted ?? false)).toBe(false)
    // The saved history uses text nodes too, even for a value containing an HTML tag.
    // A row drawn again starts with "Previous choices" closed, so the history is opened on the row this page drew from its re-read.
    letTheReReadGo()
    await expect.poll(() => editor.locator(':scope > summary [lang="en"]').innerText(), { timeout: 15_000 }).toBe(hostile)
    await table.getByLabel('Find a word', { exact: true }).fill(key)
    const savedEditor = table.locator(`[data-word-key="${key}"]`)
    if (!await savedEditor.evaluate(e => (e as HTMLDetailsElement).open)) await savedEditor.locator(':scope > summary').click()
    await savedEditor.getByText('Previous choices', { exact: true }).click()
    await expect.poll(() => savedEditor.locator('pre').filter({ hasText: 'Made-up Working heading' }).count()).toBeGreaterThan(0)
    expect(await savedEditor.locator('img[src="x"]').count()).toBe(0)
    await savedEditor.getByLabel('Why change this word?', { exact: true }).fill('Made-up shipped-word check')
    await savedEditor.getByRole('button', { name: 'Use shipped word', exact: true }).click()
    await expect.poll(() => showing.locator('.wrk-title').filter({ hasText: original }).innerText(), { timeout: 15_000 }).toBe(original)
  } finally { letTheReReadGo(); await app.page.unroute(theTable); await other.close() }
}, 120_000)

it('draws the word table beside Chinese and an edited word at the widest and the narrowest width in the light theme', async () => {
  const current = await row()
  const save = await fetch(app.api + '/api/words/table', { method: 'POST', headers, body: JSON.stringify({ key, version: current.version, en: example, zh: 'Made-up Chinese-field example: the Working heading.', chineseMatchesEnglish: true, because: 'Made-up bilingual word-table picture' }) })
  expect(save.status, await save.clone().text()).toBe(200)
  const folder = process.env.W13R_WORD_SHOTS
  if (folder) mkdirSync(folder, { recursive: true })
  for (const route of ['settings/words', 'working']) for (const width of [1440, 390]) for (const theme of ['light']) {
    const page = app.page
    await page.setViewportSize({ width, height: 1100 })
    const url = app.site + `/?lang=en&look=${theme}&mode=normal#/${route}`
    // The same width-and-look URL as the last pass is not a new document, so it is reloaded: an editor left open would close on the next summary press.
    if (page.url() === url) await page.reload()
    else await page.goto(url)
    await waitForThePage(page, 60_000)
    if (route === 'settings/words') {
      const table = page.locator('[data-word-table]'); await table.getByLabel('Find a word', { exact: true }).fill(key)
      const editor = table.locator(`[data-word-key="${key}"]`); await editor.locator(':scope > summary').click()
      await editor.getByLabel('Why change this word?', { exact: true }).fill('Made-up word edit')
      expect(await editor.getByLabel('English', { exact: true }).inputValue()).toBe(example)
      expect(await editor.getByLabel('Chinese', { exact: true }).inputValue()).toContain('Made-up')
    } else expect(await page.locator('.wrk-title').filter({ hasText: example }).count()).toBe(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} ${width} ${theme}`).toBe(true)
    if (folder) {
      const above = route === 'settings/words' ? page.locator('[data-word-table]') : page.locator('.wrk-title').filter({ hasText: example })
      await putTheMadeUpLabelIn(page, 'Made-up test office — demonstration words, not real office data', above, route === 'settings/words' ? 'the Words page' : 'the Working page')
      await page.screenshot({ path: `${folder}/${route.replace('/', '-')}-${width}-${theme}.png`, fullPage: false })
    }
  }
}, 180_000)
