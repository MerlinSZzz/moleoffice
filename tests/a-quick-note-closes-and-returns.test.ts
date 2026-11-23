// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Navigation from a note does not draw the office inside the note. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { t, type WordKey } from '../src/shared/i18n.ts'
import * as quickNoteAddress from '../src/config/the-quick-note-address.mjs'
import { THE_SYSTEM_MARK, THE_WINDOW_MARK } from '../src/config/the-window-mark.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { quickNotePath } from '../src/web/components/router.tsx'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { liveApp, openRecordPagesAt, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

let app: LiveApp
let reportId = ''
let noteId = ''
let selectionCode = ''

beforeAll(async () => {
  const bundle = await bundlePageCode({
    stdin: { contents: `window.selectMadeUpWords = (selector) => {
      const el = document.querySelector(selector);
      const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 20);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      const rect = range.getClientRects()[0]; return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }`, resolveDir: process.cwd(), loader: 'js' },
    bundle: true, write: false, platform: 'browser',
  })
  selectionCode = bundle.outputFiles[0]!.text
  app = await liveApp({ name: 'note-navigation', viewport: { width: 1440, height: 900 } })
  const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  const report = { kind: 'report', title: 'Made-up navigation report', data: { for: 'Made-up team', date: '2026-11-14', blocks: [{ id: 'b-1', type: 'text', text: 'Made-up words long enough to select in this report.' }] } }
  const note = { kind: 'quick_note', title: 'Made-up navigation note', data: { parts: [{ id: 'words-1', type: 'words', x: 24, y: 16, width: 320, text: 'Made-up navigation note' }] } }
  for (const [input, keep] of [[report, 'report'], [note, 'note']] as const) {
    const response = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(input) })
    const body = await response.text()
    expect(response.status, body).toBe(theAnswerToAWriteInATestOffice(headers, input))
    const id = (JSON.parse(body) as { record: { id: string } }).record.id
    if (keep === 'report') reportId = id
    else noteId = id
  }
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

async function go(page: Page, path: string) {
  await page.goto(`${app.site}/?lang=en#${path}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

async function openFromMenu(page: Page) {
  await go(page, `/r/${reportId}`)
  const field = page.locator('[data-text-field="data.blocks[#b-1].text"]')
  await field.waitFor({ timeout: 30_000 })
  await field.scrollIntoViewIfNeeded()
  await page.addScriptTag({ content: selectionCode })
  const point = await page.evaluate(() => (window as unknown as { selectMadeUpWords(selector: string): { x: number; y: number } }).selectMadeUpWords('[data-text-field="data.blocks[#b-1].text"]'))
  await page.mouse.click(point.x, point.y, { button: 'right' })
  await page.locator('.px-talk-do:not([aria-busy="true"])').waitFor({ timeout: 20_000 })
  // TEST CHANGE (wave 13y round 169, point RC-1 of the right-click box): More no longer holds New quick note. The box's
  // way to a note is Send to Note, New note, and then the link in the line that says where the words went, which opens
  // the note floating over the page.
  await page.locator('.px-talk [role="radio"][data-send-to="note"]').click({ timeout: 20_000 })
  await page.locator('.px-talk .px-talk-note-btn').click()
  await page.locator('.px-talk .px-talk-notes:not([aria-busy="true"])').getByRole('option', { name: t('talk.note.new'), exact: true }).click()
  await page.locator('.px-talk .px-talk-do > button').first().click()
  await page.locator('.px-talk [role="status"]', { hasText: t('talk.addedToANewNote') }).getByRole('link', { name: t('talk.addToNote.open'), exact: true }).click()
}

async function checkEntry(entry: 'sidebar' | 'menu', action: 'done' | 'back', blocked = false) {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript((block) => {
    localStorage.setItem('mole-office.chat.open', 'no')
    if (block) window.open = () => null
  }, blocked)
  await openRecordPagesAt(context, 'full')
  const page = await context.newPage()
  const popups: Page[] = []
  page.on('popup', (popup) => popups.push(popup))
  try {
    if (entry === 'sidebar') {
      await go(page, '/')
      await page.locator('#shell-side [data-target="uiSurface/rail.quicknote"]').click()
    } else await openFromMenu(page)
    await expect.poll(async () => popups.length > 0 || await page.locator('[data-quick-note-beside]').count() > 0, { timeout: 20_000 }).toBe(true)
    const popup = popups[0]
    const scope = popup === undefined ? page.locator('[data-quick-note-beside]') : popup.locator('main.qn-page')
    await scope.locator('.qn-note').waitFor({ timeout: 30_000 })
    const press = scope.getByRole('button', { name: action === 'done' ? t('quickNote.done') : new RegExp(t('quickNote.back')) })
    const behind = new URL(page.url()).hash
    if (popup !== undefined) {
      const closed = popup.waitForEvent('close', { timeout: 10_000 })
      const clicked = press.click({ noWaitAfter: true }).catch((error: unknown) => { if (!popup.isClosed()) throw error })
      await Promise.all([closed, clicked])
    } else if (action === 'back') {
      // TEST CHANGE (point NU-3 of the notes after the person's use of 21 November): Back in a note floating over a page
      // used to close the note and take the page to My notes, and this read the page's address as #/my-notes and the My
      // notes heading on the page. Back now shows My notes inside the note's own window, and the page behind it stays
      // where it was, so this reads the heading inside the window and the page's address as it was before the press.
      await press.click()
      await scope.getByRole('heading', { name: t('myNotes.title'), exact: true }).waitFor({ timeout: 10_000 })
      expect(new URL(page.url()).hash, 'the page behind the note stays where it was').toBe(behind)
    } else {
      await press.click()
      await scope.waitFor({ state: 'detached', timeout: 10_000 })
    }
    if (action === 'back' && popup !== undefined) {
      await expect.poll(() => new URL(page.url()).hash, { timeout: 10_000 }).toBe('#/my-notes')
      await page.getByRole('heading', { name: t('myNotes.title'), exact: true }).waitFor()
    }
    expect(await scope.locator('.shell').count().catch(() => 0), 'no office drawn inside the note').toBe(0)
  } finally { await context.close() }
}

describe('note navigation', () => {
  for (const entry of ['sidebar', 'menu'] as const) {
    for (const action of ['done', 'back'] as const) {
      it(`${entry}: ${action} leaves the note`, async () => { await checkEntry(entry, action) }, 120_000)
    }
  }
  for (const action of ['done', 'back'] as const) {
    it(`a blocked popup: ${action} leaves the note`, async () => { await checkEntry('sidebar', action, true) }, 120_000)
  }
  it('Back from an opened and reloaded note goes to My notes', async () => {
    const context = await app.browser.newContext()
    await openRecordPagesAt(context, 'full')
    const page = await context.newPage()
    try {
      await go(page, '/my-notes')
      await page.locator(`[data-note="${noteId}"] [data-part="open"]`).click()
      await page.locator('.qn-note').waitFor({ timeout: 30_000 })
      const floating = page.locator('[data-quick-note-beside]')
      if (await floating.count() > 0) {
        await floating.getByRole('button', { name: new RegExp(t('quickNote.back')) }).click()
        // TEST CHANGE (point NU-3): this waited for the floating note to close. Back now shows My notes inside it, so
        // this waits for the My notes heading there, and the page behind is still My notes, where the note was opened.
        await floating.getByRole('heading', { name: t('myNotes.title'), exact: true }).waitFor()
        await expect.poll(() => new URL(page.url()).hash).toBe('#/my-notes')
        await go(page, quickNotePath(noteId))
      }
      await page.reload()
      await page.locator('.qn-note').waitFor({ timeout: 30_000 })
      expect(new URL(page.url()).hash).toBe(`#${quickNotePath(noteId)}`)
      await page.getByRole('button', { name: new RegExp(t('quickNote.back')) }).click()
      await expect.poll(() => new URL(page.url()).hash).toBe('#/my-notes')
      await page.getByRole('heading', { name: t('myNotes.title'), exact: true }).waitFor()
      expect(await page.locator('.qn-page').count()).toBe(0)
    } finally { await context.close() }
  }, 120_000)

  it('Back after a direct note address goes to My notes, even when history leads elsewhere', async () => {
    const context = await app.browser.newContext()
    await openRecordPagesAt(context, 'full')
    const page = await context.newPage()
    try {
      await go(page, '/')
      await page.evaluate((path) => { window.location.hash = `#${path}` }, quickNotePath(noteId))
      await page.locator('.qn-note').waitFor({ timeout: 30_000 })
      await page.getByRole('button', { name: new RegExp(t('quickNote.back')) }).click()
      await expect.poll(() => new URL(page.url()).hash).toBe('#/my-notes')
      await page.getByRole('heading', { name: t('myNotes.title'), exact: true }).waitFor()
      expect(await page.locator('.qn-page').count()).toBe(0)
    } finally { await context.close() }
  }, 120_000)

  it('keeps a window note open when the office cannot show My notes, and allows another try', async () => {
    const marker = (quickNoteAddress as unknown as { THE_QUICK_NOTE_WINDOW_MARKER?: string }).THE_QUICK_NOTE_WINDOW_MARKER
    expect(typeof marker).toBe('string')
    const userAgent = await app.page.evaluate(() => navigator.userAgent)
    const context = await app.browser.newContext({ userAgent: `${userAgent} ${THE_WINDOW_MARK} ${THE_SYSTEM_MARK}linux` })
    await openRecordPagesAt(context, 'full')
    const page = await context.newPage()
    try {
      await page.goto(`${app.site}/?lang=en&${encodeURIComponent(marker!)}=1#${quickNotePath(noteId)}`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await page.locator('.qn-note').waitFor({ timeout: 30_000 })
      const back = page.getByRole('button', { name: new RegExp(t('quickNote.back')) })
      for (let attempt = 0; attempt < 2; attempt++) {
        await back.click()
        await page.getByRole('status').filter({ hasText: t('quickNote.returnFailed' as WordKey) }).waitFor({ timeout: 10_000 })
        expect(page.isClosed()).toBe(false)
        expect(new URL(page.url()).hash).toBe(`#${quickNotePath(noteId)}`)
      }
    } finally { await context.close() }
  }, 120_000)

  it('Done from a note in a regular tab leaves the note page', async () => {
    const context = await app.browser.newContext()
    await openRecordPagesAt(context, 'full')
    const page = await context.newPage()
    try {
      await go(page, quickNotePath(noteId))
      await page.locator('.qn-note').waitFor({ timeout: 30_000 })
      await page.getByRole('button', { name: t('quickNote.done'), exact: true }).click()
      await page.locator('.qn-page').waitFor({ state: 'detached', timeout: 10_000 })
    } finally { await context.close() }
  }, 120_000)
})
