// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OPEN IN A WINDOW STILL OPENS THE NOTE AFTER A SAVE FAILED. Point NU-5 of the notes after the person's use of 21
 * November: once a save was refused, or a save never answered, Open in a window closed the window it had opened, every
 * time, until the page was loaded again, and in the desktop app until it was started again.
 *
 * The note is filed, opened over My notes, and changed while the office refuses its saves, or while a save is never
 * answered. Open in a window then opens a window at the note's address, which draws the note the office keeps. The
 * floating note stays open beside it with the change that was not kept, so nothing is lost without being said. The
 * page is never loaded again.
 *
 * Everything here is made up and its words say so. The database is the test's own.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page, Route } from 'playwright'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { quickNotePath } from '../src/web/components/router.tsx'
import { WORLD_HEADER } from '../src/config/world-header.mjs'
import { liveApp, openRecordPagesAt, theAnswerToAWriteInATestOffice, waitForThePage, type LiveApp } from './helpers.ts'

const HEADERS = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const A_REFUSAL = 'Made-up refusal of a save'

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'note-window-after-a-failed-save', viewport: { width: 1440, height: 900 } })
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

async function aNote(words: string): Promise<string> {
  const input = { kind: 'quick_note', title: words, data: { parts: [{ id: 'words-1', type: 'words', x: 24, y: 16, width: 320, text: words }] } }
  const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers: HEADERS, body: JSON.stringify(input) })
  const body = await reply.text()
  expect(reply.status, body).toBe(theAnswerToAWriteInATestOffice(HEADERS, input))
  return (JSON.parse(body) as { record: { id: string } }).record.id
}

async function theKeptTitle(id: string): Promise<string> {
  const reply = await fetch(`${app.api}/api/records/${encodeURIComponent(id)}`, { headers: HEADERS })
  const body = await reply.text()
  expect(reply.status, body).toBe(200)
  return (JSON.parse(body) as { record: { title: string } }).record.title
}

/**
 * THE HEADERS THE TEST OFFICE PUTS ON A REPLY TO THE PAGE, read from one of its real replies: which office answered, and
 * the headers that let a page on another origin read that. The page takes a reply without them for a reply from another
 * office, and then it is not a refused save.
 */
async function theOfficesHeaders(id: string): Promise<Record<string, string>> {
  const reply = await fetch(`${app.api}/api/records/${encodeURIComponent(id)}`, { headers: { ...HEADERS, origin: new URL(app.site).origin } })
  const body = await reply.text()
  expect(reply.status, body).toBe(200)
  const office = Object.fromEntries([...reply.headers].filter(([name]) => name === WORLD_HEADER || name.startsWith('access-control-')))
  expect(office[WORLD_HEADER], 'the test office says which office answered').toBeDefined()
  expect(office['access-control-expose-headers'], 'the test office lets the page read which office answered').toContain(WORLD_HEADER)
  return office
}

const WAYS = {
  'refused': async (route: Route, office: Record<string, string>) => {
    await route.fulfill({ status: 400, contentType: 'application/json', headers: office, body: JSON.stringify({ error: A_REFUSAL }) })
  },
  'never answered': async (_route: Route, _office: Record<string, string>) => { /* The save is held and never answered, as a save that got stuck. */ },
} as const

describe('Open in a window after a failed save', () => {
  it.each(Object.keys(WAYS) as (keyof typeof WAYS)[])('opens the note when the save was %s', async (way) => {
    const words = `Made-up note whose save is ${way}`
    const id = await aNote(words)
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addInitScript(() => localStorage.setItem('mole-office.chat.open', 'no'))
    await openRecordPagesAt(context, 'full')
    const page = await context.newPage()
    let loads = 0
    page.on('load', () => { loads += 1 })
    try {
      await page.goto(`${app.site}/?lang=en#/my-notes`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await page.locator(`[data-note="${id}"] [data-part="open"]`).click()
      const beside = page.locator('[data-quick-note-beside]')
      await beside.locator('.qn-title-field').waitFor({ timeout: 30_000 })
      const loadsBefore = loads

      // ONLY THIS PAGE'S SAVES OF THE NOTE FAIL. The window opened below is another page, and reads the note as usual.
      const office = await theOfficesHeaders(id)
      await page.route(`**/api/records/${id}`, async (route) => {
        if (route.request().method() === 'PATCH') await WAYS[way](route, office)
        else await route.continue()
      })
      const notKept = 'Made-up title the office did not keep'
      await beside.locator('.qn-title-field').fill(notKept)
      if (way === 'refused') await beside.getByRole('alert').filter({ hasText: A_REFUSAL }).waitFor({ timeout: 15_000 })
      else await beside.getByRole('status').filter({ hasText: t('quickNote.saving') }).waitFor({ timeout: 15_000 })

      const opened: Page[] = []
      page.on('popup', (popup) => opened.push(popup))
      await beside.getByRole('button', { name: t('quickNotes.popOut'), exact: true }).click()
      await expect.poll(() => opened.length, { timeout: 15_000 }).toBeGreaterThan(0)
      const noteWindow = opened[0]!
      await expect.poll(() => (noteWindow.isClosed() ? 'closed' : new URL(noteWindow.url()).hash), { timeout: 30_000 }).toBe(`#${quickNotePath(id)}`)
      const inTheWindow = noteWindow.locator('main.qn-page .qn-title-field')
      // THE WINDOW IS A WHOLE START OF THE OFFICE PAGE, so it is given as long as the first page is given above.
      await inTheWindow.waitFor({ timeout: 60_000 })
      expect(await theKeptTitle(id), 'the office kept nothing of the failed save').toBe(words)
      expect(await inTheWindow.getAttribute('placeholder'), 'the window draws the note the office keeps').toBe(words)
      expect(await inTheWindow.inputValue(), 'the window does not draw the change that was not kept').not.toBe(notKept)

      expect(await beside.locator('.qn-title-field').inputValue(), 'the floating note still holds the change that was not kept').toBe(notKept)
      expect(loads, 'the page was not loaded again').toBe(loadsBefore)
    } finally { await context.close() }
  }, 180_000)
})
