// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OPENED NOTE STANDS IN FRONT OF THE CHAT, IS RESIZED BY ITS CORNER AND MOVED BY ITS HEAD. A NOTE JUST ADDED SHOWS ON
 * MY NOTES AT ONCE, WITHOUT A RELOAD. Point NT-1 of the notes after the person's use of 20 November, read in Chromium on
 * a made-up office at 1440 and at 390.
 *
 * IN FRONT IS WHAT A PRESS REACHES. Where the note and the chat cover the same place, the browser is asked which element
 * is there, and it must be inside the note. Before this point the note stood under the chat, and the chat was there.
 *
 * AT 390 THE NOTE IS MADE SMALLER AND MOVED DOWN FIRST. It fills the window when it opens, and the press that opens the
 * chat is in the top bar under it. The chat then opens in its own window, at both widths, and the test leaves it there.
 * At 390 the note covers the window's press that puts the chat beside the page, because the note stands in front of the
 * chat. So the test does not press it.
 */
import type { BrowserContext, Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, openRecordPagesAt, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { SIDEBAR_KEY } from '../src/web/components/Sidebar.tsx'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const NEW_NOTE = '#shell-side [data-target="uiSurface/rail.quicknote"]'
const BESIDE = '[data-quick-note-beside]'
/** The two widths the point asks for. */
const WIDTHS = [1440, 390] as const

let app: LiveApp
let noteId = ''

type Box = { x: number; y: number; width: number; height: number }

/** A window of one width, with the chat shut and the sidebar open, as the other note tests start. */
async function aWindow(width: number): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 900 } })
  await context.addInitScript((key) => {
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.chat.open', 'no')
    localStorage.setItem(key, 'expanded')
  }, SIDEBAR_KEY)
  await openRecordPagesAt(context, 'full')
  return { context, page: await context.newPage() }
}

async function go(page: Page, hash: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#${hash}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Open a new note from the sidebar, through the menu where the sidebar is a drawer. */
async function openANewNote(page: Page, width: number): Promise<Locator> {
  if (width <= 390) {
    await page.locator('.shell-menu').click()
    await page.locator('#shell-side[data-drawer="open"]').waitFor()
  }
  await page.locator(NEW_NOTE).click()
  const beside = page.locator(BESIDE)
  await beside.locator('.qn-note').waitFor({ timeout: 20_000 })
  return beside
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (box === null) throw new Error('It is not drawn')
  return box
}

/** Within a pixel, because the browser may place a box on a half pixel. */
function near(found: number, wanted: number, what: string): void {
  expect(Math.abs(found - wanted), `${what}: ${String(found)}, not ${String(wanted)}`).toBeLessThanOrEqual(1)
}

/** Press at one point, move by dx and dy in steps, and let go. */
async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 })
  await page.mouse.up()
}

/** Drag the note by the empty top-left corner of its head, where no press is. */
async function moveTheNote(page: Page, beside: Locator, dx: number, dy: number): Promise<void> {
  const head = await boxOf(beside.locator('.qn-beside-head'))
  await drag(page, { x: head.x + 3, y: head.y + 3 }, dx, dy)
}

beforeAll(async () => {
  app = await liveApp({ name: 'quick-note-in-front', viewport: { width: 1440, height: 900 } })
  const note = { kind: 'quick_note', title: 'Made-up note already kept', data: { parts: [{ id: 'words-1', type: 'words', x: 24, y: 16, width: 320, text: 'Made-up note already kept' }] } }
  const response = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify(note) })
  const body = await response.text()
  expect(response.status, body).toBe(theAnswerToAWriteInATestOffice(AS_THE_PERSON, note))
  noteId = (JSON.parse(body) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('an opened note', () => {
  it.each(WIDTHS)('is resized by its corner, moved by its head, held inside the window and drawn in front of the chat at %i', async (width) => {
    const { context, page } = await aWindow(width)
    try {
      await go(page, '/')
      const beside = await openANewNote(page, width)
      const opened = await boxOf(beside)

      // THE CORNER IS AT THE FOOT ON THE LEFT, so a drag right and up makes the note narrower and shorter, and its top
      // and its right edge stay where they were.
      const corner = await boxOf(beside.getByRole('button', { name: sayInEnglish('quickNote.resizeNote'), exact: true }))
      await drag(page, { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 }, 80, -300)
      const resized = await boxOf(beside)
      near(resized.width, opened.width - 80, 'the width after the resize')
      near(resized.height, opened.height - 300, 'the height after the resize')
      near(resized.y, opened.y, 'the top after the resize')
      near(resized.x + resized.width, opened.x + opened.width, 'the right edge after the resize')

      const by = width <= 390 ? { dx: -60, dy: 250 } : { dx: -400, dy: 200 }
      await moveTheNote(page, beside, by.dx, by.dy)
      const moved = await boxOf(beside)
      near(moved.x, resized.x + by.dx, 'the left edge after the move')
      near(moved.y, resized.y + by.dy, 'the top after the move')
      near(moved.width, resized.width, 'the width after the move')
      near(moved.height, resized.height, 'the height after the move')

      // A NOTE DRAGGED PAST THE WINDOW'S EDGE STOPS AT IT, so its head and its corner can always be reached.
      await moveTheNote(page, beside, 1 - (moved.x + 3), 1 - (moved.y + 3))
      const heldIn = await boxOf(beside)
      near(heldIn.x, 0, 'the left edge held at the window')
      near(heldIn.y, 0, 'the top held at the window')
      near(heldIn.width, moved.width, 'the width held at the window')
      await moveTheNote(page, beside, moved.x, moved.y)

      await openTheChat(page)
      const chat = await boxOf(page.locator('.px-chat').first())
      const before = await boxOf(beside)
      await moveTheNote(
        page,
        beside,
        Math.round(chat.x + chat.width / 2 - (before.x + before.width / 2)),
        Math.round(chat.y + chat.height / 2 - (before.y + before.height / 2)),
      )
      const note = await boxOf(beside)
      const shared = {
        left: Math.max(note.x, chat.x),
        top: Math.max(note.y, chat.y),
        right: Math.min(note.x + note.width, chat.x + chat.width),
        bottom: Math.min(note.y + note.height, chat.y + chat.height),
      }
      expect(shared.right - shared.left, 'the note and the chat cover the same columns').toBeGreaterThan(40)
      expect(shared.bottom - shared.top, 'the note and the chat cover the same rows').toBeGreaterThan(40)
      const reached = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x as number, y as number)?.closest('[data-quick-note-beside]') !== null,
        [Math.round((shared.left + shared.right) / 2), Math.round((shared.top + shared.bottom) / 2)],
      )
      expect(reached, 'a press where the note and the chat both are reaches the note').toBe(true)
    } finally {
      await context.close()
    }
  }, 180_000)
})

describe('a note just added', () => {
  it.each(WIDTHS)('shows on My notes at once, without a reload, at %i', async (width) => {
    const { context, page } = await aWindow(width)
    try {
      await go(page, '/my-notes')
      await page.locator(`[data-note="${noteId}"]`).waitFor({ timeout: 30_000 })
      await page.evaluate(() => {
        ;(window as unknown as { theSameDocument: boolean }).theSameDocument = true
      })
      const words = `Made-up note added at ${String(width)}`
      const beside = await openANewNote(page, width)
      await beside.locator('.qn-field').fill(words)
      await expect.poll(() => page.locator('.mn-card', { hasText: words }).count(), { timeout: 30_000 }).toBe(1)
      expect(await page.evaluate(() => (window as unknown as { theSameDocument?: boolean }).theSameDocument), 'the page was not loaded again').toBe(true)
      expect(new URL(page.url()).hash).toBe('#/my-notes')
    } finally {
      await context.close()
    }
  }, 180_000)
})
