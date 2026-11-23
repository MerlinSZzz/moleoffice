// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { SHIPPED_CHAPTER_NUMBERS } from '../src/shared/chapter-check.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { theWordAPageDraws } from './words-waiting-for-translation.ts'

let app: LiveApp, db: TestDb
const unsupported: string[] = []
beforeAll(async () => {
  db = await freshDb()
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  copyTheDefaultRegulationsOnce()
  // These records predate startup. The reader must hear about both unsupported chapter numbers, which are past the
  // last shipped chapter, so the shipped file holds neither however many chapters it ships.
  const last = Math.max(...SHIPPED_CHAPTER_NUMBERS)
  for (const n of [last + 1, last + 2]) {
    const record = db.api.createRecord({ workspaceId: 'default', kind: 'module', title: `Made-up unsupported chapter ${n}`, actor: db.api.HUMAN,
      data: { state: 'active', parts: [], extra: { chapter: n }, summaryBlocks: [] },
    })
    unsupported.push(record.id)
  }
  const { migrateInPlace } = await import('../src/server/db/migrate.ts')
  migrateInPlace(db.client.sqlite, resolve('drizzle'))
  app = await liveApp({ name: 'unsupported-chapter-page', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.context.addInitScript(() => { localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light') })
})
afterAll(async () => { await app?.stop(); db?.close() })

async function open(width: number, theme: string, language = 'en') {
  await app.page.setViewportSize({ width, height: 1100 })
  const url = app.site + `/?lang=${language}&look=${theme}&mode=normal#/regulations`
  if (app.page.url() === url) await app.page.reload()
  else await app.page.goto(url)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('[data-chapter-editor="1"]').waitFor()
}

it('names every unsupported record to both readers in the page language at 1440 and 390 in the light theme', async () => {
  const shots = process.env.W13R_CHAPTER_SHOTS
  const widths = shots ? [1440, 990, 660, 390] : [1440, 390]
  const themes: readonly ('light' | 'dark')[] = shots ? ['light', 'dark'] : ['light']
  for (const theme of themes) for (const width of widths) {
    await open(width, theme)
    const notice = app.page.locator('[data-unsupported-chapters]')
    expect(await notice.count()).toBe(1)
    expect(await notice.getAttribute('role')).toBe('status')
    expect(await notice.innerText()).toContain(sayInEnglish('regulationsPage.notInUse'))
    for (const id of unsupported) expect(await notice.getByRole('link', { name: id, exact: true }).getAttribute('href')).toContain(id)
    expect(await notice.getByRole('link').count()).toBe(2)
    expect(await notice.evaluate(node => Boolean(node.compareDocumentPosition(document.querySelector('.ofc-read')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
    if (process.env.W13R_CHAPTER_SHOTS) {
      mkdirSync(process.env.W13R_CHAPTER_SHOTS, { recursive: true })
      await app.page.screenshot({ path: resolve(process.env.W13R_CHAPTER_SHOTS, `regulations-unsupported-${width}-${theme}.png`) })
    }
  }
  await open(390, 'light', 'zh')
  expect(await app.page.locator('[data-unsupported-chapters]').innerText()).toContain(theWordAPageDraws('zh', 'regulationsPage.notInUse'))
  await app.page.evaluate(() => localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'made-up-reader' })))
  await open(390, 'light')
  const notice = app.page.locator('[data-unsupported-chapters]')
  expect(await notice.getByRole('link').count()).toBe(2)
  expect(await notice.innerText()).toContain(sayInEnglish('regulationsPage.notInUse'))
  expect(await app.page.locator('.ce').getByRole('button', { name: /Edit chapter|Restore/ }).count()).toBe(0)
}, 120_000)
