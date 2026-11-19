// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { resolve } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import type { AChapterPreview, AChapterWritten, ChapterContent, TheSelectedChapters } from '../src/shared/chapter-edit.ts'

let app: LiveApp, db: TestDb
const held = new Map<string, { title: string; text: string }>()
beforeAll(async () => {
  db = await freshDb()
  // Two pre-existing records deliberately claim the same number. All changes after startup use presses.
  for (const which of ['First', 'Second']) {
    const title = `${which} made-up chapter record`, text = `${which} made-up stored rule.`
    const record = db.api.createRecord({ workspaceId: 'default', kind: 'module', title, summary: 'Read this made-up chapter.', actor: db.api.HUMAN,
      data: { state: 'active', parts: [], extra: { chapter: 1 }, summaryBlocks: [{ id: 'r-1', type: 'text', heading: 'A made-up rule', text }] },
    })
    held.set(record.id, { title, text })
  }
  const { migrateInPlace } = await import('../src/server/db/migrate.ts')
  migrateInPlace(db.client.sqlite, resolve('drizzle'))
  app = await liveApp({ name: 'chapter-preview-kept-record', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
})
afterAll(async () => { await app?.stop(); db?.close() })

it('previews the other stored record, applies exactly that preview, and restores shipped by presses', async () => {
  const [initialReply] = await Promise.all([
    app.page.waitForResponse(reply => reply.request().method() === 'GET' && reply.url().endsWith('/api/office-regulations/chapters')),
    app.page.goto(app.site + '/?lang=en&mode=normal#/regulations'),
  ])
  expect(initialReply.status()).toBe(200)
  const initial = (await initialReply.json() as TheSelectedChapters).chapters.find(one => one.n === 1)!
  expect(initial.inUse).toBe('shipped')
  const keep = initial.notUsed!.records.find(id => id !== initial.record)!
  expect(held.has(keep)).toBe(true)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.ofc-mode button').click()
  const panel = app.page.locator('[data-chapter-editor="1"]')
  await panel.getByRole('button', { name: 'Edit chapter', exact: true }).click()
  expect(await panel.getByRole('button', { name: 'Preview chapter', exact: true }).isDisabled()).toBe(true)
  const chapter: ChapterContent = { label: 'Made-up kept chapter', title: 'Words for the kept chapter', conclusion: 'Keep the words that were previewed.', zh: { label: '保留的测试章节', title: '保留章节的文字', conclusion: '保存预览过的文字。' }, rules: [{ id: 'r-1', heading: 'A changed made-up rule', text: 'These are the words for the chosen record.', zh: { heading: '更改的测试条文', text: '这些是选定记录的文字。' } }] }
  for (const [name, value] of [
    ['English label', chapter.label], ['English title', chapter.title], ['English conclusion', chapter.conclusion],
    ['Chinese label', chapter.zh!.label], ['Chinese title', chapter.zh!.title], ['Chinese conclusion', chapter.zh!.conclusion],
    ['English heading for r-1', chapter.rules[0]!.heading], ['English text for r-1', chapter.rules[0]!.text],
    ['Chinese heading for r-1', chapter.rules[0]!.zh!.heading], ['Chinese text for r-1', chapter.rules[0]!.zh!.text],
  ]) await panel.getByLabel(name!, { exact: true }).fill(value!)
  await panel.getByLabel('Which record should keep this chapter?', { exact: true }).selectOption(keep)
  const [previewReply] = await Promise.all([
    app.page.waitForResponse(reply => reply.url().endsWith('/api/office-regulations/chapters/preview')),
    panel.getByRole('button', { name: 'Preview chapter', exact: true }).click(),
  ])
  expect(previewReply.status()).toBe(200)
  expect(previewReply.request().postDataJSON().keep).toBe(keep)
  const preview = await previewReply.json() as AChapterPreview
  expect(preview.problems).toEqual([])
  expect(preview.ownWords!.was.title).toBe(held.get(keep)!.title)
  expect(preview.changes[0]!.was!.text).toBe(held.get(keep)!.text)
  const predicted = { ...preview.ownWords!.becomes, rules: preview.changes.map(change => ({ id: change.rule, ...change.becomes! })) }
  expect(predicted).toEqual(chapter)
  await panel.getByLabel('Why change this chapter?', { exact: true }).fill('Keep the other record with the words shown in Preview.')
  const [writtenReply, readBackReply] = await Promise.all([
    app.page.waitForResponse(reply => reply.request().method() === 'POST' && reply.url().endsWith('/api/office-regulations/chapters')),
    app.page.waitForResponse(reply => reply.request().method() === 'GET' && reply.url().endsWith('/api/office-regulations/chapters')),
    panel.getByRole('button', { name: 'Apply chapter', exact: true }).click(),
  ])
  expect(writtenReply.status()).toBe(200)
  expect(writtenReply.request().postDataJSON().keep).toBe(keep)
  const written = await writtenReply.json() as AChapterWritten
  expect(written).toMatchObject({ written: true, record: keep, inUse: 'stored', notUsed: null, chapter: predicted })
  expect((await readBackReply.json() as TheSelectedChapters).chapters.find(one => one.n === 1)!.chapter).toEqual(predicted)
  await expect.poll(() => app.page.locator('.ofc-ch').filter({ has: panel }).locator('.ofc-rule-text').first().innerText()).toBe(chapter.rules[0]!.text)
  await panel.getByRole('button', { name: 'Chapter history', exact: true }).click()
  await panel.getByRole('button', { name: 'Restore the shipped chapter', exact: true }).click()
  await panel.getByRole('button', { name: 'Preview chapter', exact: true }).click()
  await panel.locator('[data-chapter-preview]').waitFor()
  await panel.getByLabel('Why change this chapter?', { exact: true }).fill('Put the shipped chapter back after the made-up edit.')
  const [restoredReply] = await Promise.all([
    app.page.waitForResponse(reply => reply.url().endsWith('/api/office-regulations/chapters/restore')),
    panel.getByRole('button', { name: 'Restore chapter', exact: true }).click(),
  ])
  expect(restoredReply.status()).toBe(200)
  const restored = await restoredReply.json() as AChapterWritten
  expect(restored.record).toBe(keep)
  expect(restored.chapter).toEqual(restored.shipped)
}, 120_000)
