// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * BACK IN A NOTE SHOWS MY NOTES INSIDE THE NOTE'S OWN WINDOW. Point NU-3 of the notes after the person's use of 21
 * November: Back in a note floating over a page closed the note and took the page behind it to My notes.
 *
 * From two different pages, a new note is opened by the sidebar, floating over the page, and Back is pressed. The same
 * small window now shows My notes, in the same place and at the same size, and the page behind it has neither moved
 * address nor changed what it shows. From that list another note is opened, and it is drawn in the same window, while
 * the page behind still has not changed.
 *
 * Everything here is made up and its words say so. The database is the test's own.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Locator, Page } from 'playwright'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, openRecordPagesAt, theAnswerToAWriteInATestOffice, waitForThePage, type LiveApp } from './helpers.ts'

const HEADERS = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const NEW_NOTE = '#shell-side [data-target="uiSurface/rail.quicknote"]'
const THE_OTHER_NOTES_WORDS = 'Made-up note opened from the list'

let app: LiveApp
let reportId = ''
let otherNote = ''

async function file(input: { kind: string; title: string; data: Record<string, unknown> }): Promise<string> {
  const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers: HEADERS, body: JSON.stringify(input) })
  const body = await reply.text()
  expect(reply.status, body).toBe(theAnswerToAWriteInATestOffice(HEADERS, input))
  return (JSON.parse(body) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'back-in-a-note', viewport: { width: 1440, height: 900 } })
  reportId = await file({ kind: 'report', title: 'Made-up report behind a note', data: { for: 'Made-up team', date: '2026-11-21', blocks: [{ id: 'b-1', type: 'text', text: 'Made-up words of the report behind a note.' }] } })
  otherNote = await file({ kind: 'quick_note', title: THE_OTHER_NOTES_WORDS, data: { parts: [{ id: 'words-1', type: 'words', x: 24, y: 16, width: 320, text: THE_OTHER_NOTES_WORDS }] } })
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

/** What the page behind the note shows: its address and the words of its main part, the note's window left out. */
async function thePageBehind(page: Page): Promise<{ hash: string; words: string }> {
  return {
    hash: new URL(page.url()).hash,
    words: await page.locator('main').first().evaluate((main) => (main.textContent ?? '').replace(/\s+/gu, ' ').trim()),
  }
}

async function theWindow(beside: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await beside.boundingBox()
  if (box === null) throw new Error('The note\'s window is not drawn.')
  return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
}

const PAGES = { 'the home page': () => '/', 'a report\'s page': () => `/r/${reportId}` } as const

describe('Back in a note', () => {
  it.each(Object.keys(PAGES) as (keyof typeof PAGES)[])('shows My notes in the same window over %s, and opens another note there', async (which) => {
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addInitScript(() => localStorage.setItem('mole-office.chat.open', 'no'))
    await openRecordPagesAt(context, 'full')
    const page = await context.newPage()
    try {
      await page.goto(`${app.site}/?lang=en#${PAGES[which]()}`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await page.locator(NEW_NOTE).click()
      const beside = page.locator('[data-quick-note-beside]')
      await beside.locator('.qn-note').waitFor({ timeout: 30_000 })
      const behind = await thePageBehind(page)
      const where = await theWindow(beside)

      await beside.getByRole('button', { name: new RegExp(t('quickNote.back')) }).click()
      await beside.getByRole('heading', { name: t('myNotes.title'), exact: true }).waitFor({ timeout: 15_000 })
      const card = beside.locator(`[data-note="${otherNote}"]`)
      await card.waitFor({ timeout: 15_000 })
      expect(await theWindow(beside), 'My notes is shown in the same window, in the same place and at the same size').toEqual(where)
      expect(await thePageBehind(page), 'the page behind the note has not changed').toEqual(behind)

      await card.locator('[data-part="open"]').click()
      const title = beside.locator('.qn-title-field')
      await title.waitFor({ timeout: 15_000 })
      expect(await title.getAttribute('placeholder'), 'the note opened from the list is drawn in the same window').toBe(THE_OTHER_NOTES_WORDS)
      expect(await beside.count(), 'one note window').toBe(1)
      expect(await theWindow(beside), 'the note is drawn in the same window, in the same place and at the same size').toEqual(where)
      expect(await thePageBehind(page), 'the page behind the note has still not changed').toEqual(behind)
    } finally { await context.close() }
  }, 180_000)
})
