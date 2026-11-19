// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { resolve } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { AChapterWritten } from '../src/shared/chapter-edit.ts'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'

let app: LiveApp, db: TestDb
let releaseReads: (() => void) | undefined
beforeAll(async () => {
  db = await freshDb()
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  copyTheDefaultRegulationsOnce()
  const { migrateInPlace } = await import('../src/server/db/migrate.ts')
  migrateInPlace(db.client.sqlite, resolve('drizzle'))
  app = await liveApp({ name: 'chapter-reopen-after-write', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
})
afterAll(async () => { releaseReads?.(); await app?.stop(); db?.close() })

it('uses the saved words and version for Edit and Restore while the page reread is held back', async () => {
  await app.page.goto(app.site + '/?lang=en&mode=normal#/regulations')
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.ofc-mode button').click()
  const panel = app.page.locator('[data-chapter-editor="1"]')
  await panel.waitFor()
  const press = (name: string) => panel.getByRole('button', { name, exact: true }).click()
  const preview = async () => { await press('Preview chapter'); await panel.locator('[data-chapter-preview]').waitFor() }
  const write = async (restore = false): Promise<AChapterWritten> => {
    await panel.getByLabel('Why change this chapter?', { exact: true }).fill('A made-up change while the page is rereading.')
    const [reply] = await Promise.all([
      app.page.waitForResponse(reply => reply.request().method() === 'POST' && reply.url().endsWith('/api/office-regulations/chapters' + (restore ? '/restore' : ''))),
      press(restore ? 'Restore chapter' : 'Apply chapter'),
    ])
    expect(reply.status(), await reply.text()).toBe(200)
    await panel.locator('[data-chapter-form]').waitFor({ state: 'detached' })
    return reply.json()
  }
  let readsHeld = 0
  const mayRead = new Promise<void>(resolve => { releaseReads = resolve })
  await app.page.route('**/api/office-regulations/chapters', async route => {
    if (route.request().method() === 'GET') { readsHeld++; await mayRead }
    await route.continue()
  })
  try {
    await press('Edit chapter')
    const firstWords = 'Keep these made-up words after the next edit.'
    await panel.getByLabel('English text for r-1', { exact: true }).fill(firstWords)
    await panel.getByLabel('Chinese text for r-1', { exact: true }).fill('下次编辑后保留这些测试文字。')
    await preview()
    const first = await write()
    await expect.poll(() => readsHeld).toBeGreaterThan(0)

    // The parent still holds the original reply, but the write itself supplied the next draft.
    await press('Edit chapter')
    expect(await panel.getByLabel('English text for r-1', { exact: true }).inputValue()).toBe(firstWords)
    expect(await panel.getByLabel('Chinese text for r-1', { exact: true }).inputValue()).toBe('下次编辑后保留这些测试文字。')
    await panel.getByLabel('English heading for r-1', { exact: true }).fill('The second made-up heading')
    await panel.getByLabel('Chinese heading for r-1', { exact: true }).fill('第二个测试标题')
    await preview()
    const second = await write()
    expect(second.version).not.toBe(first.version)
    expect(second.chapter!.rules.find(rule => rule.id === 'r-1')).toMatchObject({ heading: 'The second made-up heading', text: firstWords })

    await press('Chapter history')
    await panel.locator('[data-chapter-history] article').first().waitFor()
    await press('Restore the shipped chapter')
    await preview()
    const restored = await write(true)
    const shippedText = restored.shipped
    if (shippedText === null) throw new Error('The restored chapter answered no shipped text.')
    expect(restored.written).toBe(true)
    expect(restored.chapter!.rules[0]!.text).toBe(shippedText.rules[0]!.text)
  } finally {
    releaseReads?.()
    await app.page.unrouteAll({ behavior: 'wait' })
  }
}, 120_000)
