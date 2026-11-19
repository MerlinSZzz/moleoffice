// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Locator } from 'playwright'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import type { AChapterPreview, TheSelectedChapters } from '../src/shared/chapter-edit.ts'

let app: LiveApp, db: TestDb, brokenId: string
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
beforeAll(async () => {
  db = await freshDb()
  db.client.sqlite.prepare('UPDATE people SET name=? WHERE id=?').run('Made-up caretaker', THE_TEST_OFFICES_OWNER.id)
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  copyTheDefaultRegulationsOnce()
  const row = db.client.sqlite.prepare("SELECT id, data FROM records WHERE kind='module' AND json_extract(data, '$.extra.chapter')=2").get() as { id: string; data: string }
  brokenId = row.id
  // This is deliberately broken before the office starts. Recovery must still have a page press.
  db.client.sqlite.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify({ ...JSON.parse(row.data), summaryBlocks: [] }), brokenId)
  const { migrateInPlace } = await import('../src/server/db/migrate.ts')
  migrateInPlace(db.client.sqlite, resolve('drizzle'))
  expect((db.client.sqlite.prepare("SELECT json_array_length(data, '$.summaryBlocks') AS rules FROM records WHERE id=?").get(brokenId) as { rules: number }).rules).toBe(0)
  app = await liveApp({ name: 'chapter-edit-pages', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.context.addInitScript(() => { localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light') })
})
afterAll(async () => { await app?.stop(); db?.close() })
async function open(width = 1440, theme = 'light') {
  await app.page.setViewportSize({ width, height: 1100 })
  const url = app.site + `/?lang=en&look=${theme}&mode=normal#/regulations`
  if (app.page.url() === url) await app.page.reload()
  else await app.page.goto(url)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('[data-chapter-editor="1"]').waitFor()
  expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
  if (await app.page.locator('.ofc-mode button').count()) await app.page.locator('.ofc-mode button').click()
}
const editor = (n = 1) => app.page.locator(`[data-chapter-editor="${n}"]`)
const section = (n = 1) => app.page.locator('.ofc-ch').filter({ has: editor(n) })
async function press(name: string, n = 1) { await editor(n).getByRole('button', { name, exact: true }).click() }
async function preview(n = 1) {
  const [reply] = await Promise.all([
    app.page.waitForResponse(reply => reply.url().endsWith('/api/office-regulations/chapters/preview')),
    press('Preview chapter', n),
  ])
  expect(reply.status(), await reply.text()).toBe(200)
  await editor(n).locator('[data-chapter-preview]').waitFor()
  return await reply.json() as AChapterPreview
}
async function apply(n = 1, restore = false) {
  await editor(n).getByLabel('Why change this chapter?', { exact: true }).fill('Made-up browser change.')
  const [reply] = await Promise.all([
    app.page.waitForResponse(reply => reply.request().method() === 'POST' && reply.url().endsWith('/api/office-regulations/chapters' + (restore ? '/restore' : ''))),
    press(restore ? 'Restore chapter' : 'Apply chapter', n),
  ])
  expect(reply.status(), await reply.text()).toBe(200)
  await editor(n).locator('[data-chapter-form]').waitFor({ state: 'detached' })
  await editor(n).waitFor()
}
async function chapters(): Promise<TheSelectedChapters> {
  const response = await fetch(app.api + '/api/office-regulations/chapters', { headers })
  expect(response.status).toBe(200)
  return response.json()
}
async function picture(target: Locator, state: string, width: number, theme: string) {
  const folder = process.env.W13R_CHAPTER_SHOTS
  if (folder) await putTheMadeUpLabelIn(app.page, 'Made-up test office — chapter examples', target, 'the Regulations page')
  expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${state} ${width} ${theme}`).toBe(true)
  if (folder) await app.page.screenshot({ path: `${folder}/regulations-${state}-${width}-${theme}.png`, fullPage: false })
}

it('edits and restores by presses, photographs every state, repairs an unusable record, and hides writers from an agent', async () => {
  await open()
  const original = (await chapters()).chapters.find(one => one.n === 1)!
  const shippedOriginal = original.shipped
  if (shippedOriginal === null) throw new Error('Chapter 1 answered no shipped text, and this case restores it.')
  await press('Edit chapter')
  await editor().getByLabel('English text for r-1', { exact: true }).fill('Made-up first browser rule.')
  await editor().getByLabel('Chinese text for r-1', { exact: true }).fill('')
  await preview()
  expect(await editor().locator('[data-chapter-preview] [role="alert"]').count()).toBe(1)
  expect(await editor().getByRole('button', { name: 'Apply chapter', exact: true }).isDisabled()).toBe(true)
  await editor().getByLabel('Chinese text for r-1', { exact: true }).fill('虚构的第一条浏览器规则。')
  await preview()
  expect(await editor().locator('[data-chapter-preview]').innerText()).toContain('Made-up first browser rule.')
  expect((await chapters()).chapters.find(one => one.n === 1)!.chapter).toEqual(original.chapter)
  expect(await editor().getByRole('button', { name: 'Apply chapter', exact: true }).isDisabled()).toBe(true)
  await apply()
  await expect.poll(() => section().locator('.ofc-rule-text').first().innerText()).toBe('Made-up first browser rule.')
  await press('Edit chapter')
  await editor().getByLabel('English text for r-1', { exact: true }).fill('Made-up second browser rule.')
  await editor().getByLabel('Chinese text for r-1', { exact: true }).fill('虚构的第二条浏览器规则。')
  await preview(); await apply()
  await expect.poll(() => section().locator('.ofc-rule-text').first().innerText()).toBe('Made-up second browser rule.')
  await press('Chapter history')
  const older = editor().locator('[data-chapter-history] article').nth(1)
  await older.waitFor()
  await older.locator('summary').click()
  expect(await older.innerText()).toContain('Made-up first browser rule.')
  expect(await older.innerText()).toContain('Made-up browser change.')
  expect(await older.innerText()).toContain(THE_TEST_OFFICES_OWNER.id)
  await older.getByRole('button', { name: /Restore version/ }).click()
  await preview(); await apply(1, true)
  await expect.poll(() => section().locator('.ofc-rule-text').first().innerText()).toBe('Made-up first browser rule.')
  if (await editor().getByRole('button', { name: 'Chapter history', exact: true }).count()) await press('Chapter history')
  await press('Restore the shipped chapter')
  const shippedPreview = await preview()
  expect(shippedPreview.ownWords).toBeNull()
  expect(shippedPreview.changes.map(change => change.rule)).toEqual(['r-1'])
  expect(shippedPreview.changes[0]!.becomes!.zh).toBeNull()
  await apply(1, true)
  const restored = (await chapters()).chapters.find(one => one.n === 1)!.chapter!
  expect({ ...restored, zh: null, rules: restored.rules.map(rule => ({ ...rule, zh: null })) }).toEqual(shippedOriginal)
  expect(restored.rules[0]!.zh).toBeNull()
  expect(restored.rules[1]!.zh).toEqual(original.chapter!.rules[1]!.zh)
  const status = editor().getByRole('status').filter({ hasText: 'The Chinese for these parts was removed' })
  expect(await status.innerText()).toContain(shippedOriginal.rules[0]!.heading)

  const folder = process.env.W13R_CHAPTER_SHOTS
  if (folder) mkdirSync(folder, { recursive: true })
  for (const width of [1440, 390]) for (const theme of ['light']) {
    await open(width, theme)
    await picture(section(), 'reading', width, theme)
    await picture(editor(2).locator('[data-chapter-recovery]'), 'alert', width, theme)
    expect(await editor(2).getByRole('alert').innerText()).toContain('The office is reading the shipped chapter.')
    expect(await editor(2).getByRole('alert').getByRole('link', { name: brokenId }).getAttribute('href')).toContain(brokenId)
    expect((await chapters()).chapters.find(one => one.n === 2)!.notUsed!.problems.length).toBeGreaterThan(0)
    await press('Edit chapter')
    await editor().getByLabel('English text for r-1', { exact: true }).fill('Made-up words for the chapter preview.')
    await editor().getByLabel('Chinese heading for r-1', { exact: true }).fill('虚构的预览规则')
    await editor().getByLabel('Chinese text for r-1', { exact: true }).fill('虚构的章节预览文字。')
    await picture(editor().locator('[data-chapter-form]'), 'edit', width, theme)
    await editor().getByLabel('English title', { exact: true }).fill('')
    await preview()
    expect(await editor().getByRole('button', { name: 'Apply chapter', exact: true }).isDisabled()).toBe(true)
    expect(await editor().locator('[data-chapter-preview] [role="alert"]').count()).toBe(1)
    await picture(editor().locator('[data-chapter-preview]'), 'problem', width, theme)
    await editor().getByLabel('English title', { exact: true }).fill(shippedOriginal.title)
    await preview()
    expect(await editor().locator('[data-chapter-preview]').innerText()).toContain('The chapter passed the check.')
    await picture(editor().locator('[data-chapter-preview]'), 'preview', width, theme)
    await press('Cancel chapter edit'); await press('Chapter history')
    await editor().locator('[data-chapter-history] article').first().waitFor()
    await editor().locator('[data-chapter-history] article summary').first().click()
    await picture(editor().locator('[data-chapter-history]'), 'history', width, theme)
  }

  await open()
  const problems = (await chapters()).chapters.find(one => one.n === 2)!.notUsed!.problems
  for (const problem of problems) expect(await editor(2).getByRole('alert').innerText()).toContain(problem)
  await press('Restore the shipped chapter', 2); await preview(2); await apply(2, true)
  await editor(2).getByRole('alert').waitFor({ state: 'detached' })
  expect(await editor(2).getByRole('alert').count()).toBe(0)
  expect((await chapters()).chapters.find(one => one.n === 2)).toMatchObject({ inUse: 'stored', notUsed: null })
  await app.page.evaluate(() => localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'made-up-reader' })))
  await open()
  expect(await app.page.locator('.ce').getByRole('button', { name: /Edit chapter|Restore|File the shipped/ }).count()).toBe(0)
  await press('Chapter history')
  await editor().locator('[data-chapter-history] article').first().waitFor()
  expect(await editor().getByRole('button', { name: /Restore/ }).count()).toBe(0)
}, 240_000)
