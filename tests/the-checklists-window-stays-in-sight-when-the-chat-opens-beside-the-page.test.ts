// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECKLISTS WINDOW STAYS OPEN AND IN SIGHT WHEN THE CHAT OPENS BESIDE THE PAGE, on the right and on the left, at
 * 1440 and at 1024 wide.
 *
 * The window is fixed at the top right of the browser window. The chat beside the page is fixed to one edge of the
 * browser window, as tall as it, and drawn over everything the page draws there. On the right it stood over the
 * checklists window, so the window looked gone, although it was still open.
 *
 * WHAT THIS FILE HOLDS, once at 1440 and once at 1024 wide: with the window open, the chat is opened beside the page on
 * the right, and then put on the left by the seam's swap press. Before the chat opens, and after each of the two, the
 * window's panel is open, and the points at the middle of its press and at the middle of its panel belong to the
 * window, not to the chat.
 *
 * On main's code before the fix that came with this file, both cases are red: with the chat on the right, the points
 * at the middle of the press and of the panel belong to the chat.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database, and the browser is the person. The
 * checklist here is made up, and nothing is asked of the live office.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let list = ''

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1024, height: 900 },
] as const

/** The person's headers, read when a request is sent. */
function asThePerson(): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
  }
}

async function send(method: string, url: string, body: object): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers: asThePerson(), body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text.slice(0, 600)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

beforeAll(async () => {
  app = await liveApp({ name: 'checklists-window-beside-the-chat', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  // THE CHAT OPENS THE WAY THE PERSON LAST HAD IT, read from their row: here, beside the page.
  await send('PATCH', `/api/participants/person/${THE_PERSON}`, { chatOpensAs: 'split' })
  list = (await send('POST', '/api/checklists', { title: 'Made-up checklist beside the chat', items: [{ words: 'Made-up item to read' }] }))['checklist'].id as string
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * WHAT THE WINDOW SHOWS NOW: whether it is open, and what is drawn at the middle of its press and at the middle of its
 * panel. A point is named "the window" when it is inside the window, "the chat" when it is inside the chat, and else by
 * the element found there.
 */
async function theWindowNow(page: Page): Promise<{ open: boolean; press: string; panel: string }> {
  return page.evaluate(() => {
    const checklists = document.querySelector<HTMLElement>('.ckw')
    const press = document.querySelector<HTMLElement>('.ckw-press')
    const panel = document.querySelector<HTMLElement>('.ckw-panel')
    const whatIsAtTheMiddleOf = (element: HTMLElement | null): string => {
      if (element === null) return 'nothing: it is not drawn'
      const box = element.getBoundingClientRect()
      const there = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      if (there === null) return 'nothing: the point is outside the browser window'
      if (checklists !== null && checklists.contains(there)) return 'the window'
      if (there.closest('.px-chat') !== null) return 'the chat'
      return `${there.tagName.toLowerCase()} ${there.getAttribute('class') ?? ''}`
    }
    return {
      open:
        checklists?.getAttribute('data-open') === 'yes' &&
        press?.getAttribute('aria-expanded') === 'true' &&
        panel !== null &&
        panel.getAttribute('aria-hidden') !== 'true',
      press: whatIsAtTheMiddleOf(press),
      panel: whatIsAtTheMiddleOf(panel),
    }
  })
}

const IN_SIGHT = { open: true, press: 'the window', panel: 'the window' }

for (const size of SIZES) {
  const wide = `${String(size.width)} wide`
  it(`at ${wide}, the open checklists window stays open and in sight when the chat opens beside the page on the right, and then on the left`, async () => {
    // NO MOTION, so the panel is drawn where it ends up from the first frame.
    const context = await app.browser.newContext({ viewport: size, reducedMotion: 'reduce' })
    try {
      await context.addInitScript(() => {
        localStorage.setItem('mole-office.language', 'en')
        localStorage.setItem('mole-office.workspace', 'default')
        localStorage.setItem('mole-office.chat.open', 'no')
        localStorage.setItem('mole-office.chat.split-side', 'right')
      })
      const page = await context.newPage()
      page.setDefaultTimeout(20_000)
      await page.goto(`${app.site}/?lang=en#/decisions`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)

      await page.click('.ckw-press')
      await page.locator(`.ckw-panel .cks-card[data-list="${list}"]`).waitFor({ timeout: 30_000 })
      expect(await theWindowNow(page), `${wide}: the window is not open and in sight before the chat opens`).toEqual(IN_SIGHT)

      await page.click('.shell-side .shell-chat')
      await page.waitForSelector('aside.px-chat[data-where="split"]', { timeout: 20_000 })
      await page.waitForFunction(() => document.documentElement.getAttribute('data-chat-split') === 'right')
      await expect
        .poll(() => theWindowNow(page), { timeout: 5_000, message: `${wide}: with the chat beside the page on the right, the window is not open and in sight` })
        .toEqual(IN_SIGHT)

      await page.click('.px-chat-seam-swap')
      await page.waitForFunction(() => document.documentElement.getAttribute('data-chat-split') === 'left')
      await expect
        .poll(() => theWindowNow(page), { timeout: 5_000, message: `${wide}: with the chat beside the page on the left, the window is not open and in sight` })
        .toEqual(IN_SIGHT)
    } finally {
      await context.close()
    }
  }, 120_000)
}
