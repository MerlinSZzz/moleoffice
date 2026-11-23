// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CORNER CHAT BUTTON LEAVES THE LAST LINE OF A PAGE VISIBLE. Problem -n3fg3ZAdXfY.
 *
 * The chat button is fixed to the window's bottom-right corner. Wave 13n's pictures found it over the
 * last line of a list row at 390 wide and over the last line of the review pane at 990. The
 * .shell-main rule in App.tsx now leaves --fab-room (tokens.css) under the page and inside the
 * review pane.
 *
 * WHAT IS MEASURED. Design D draws the corner circle only while the chat is shut, a message waits and
 * the window is 1024 pixels or wider (src/web/lib/chat-split.ts is the breakpoint's one home). One
 * made-up message is left waiting, so at 1440 in English and in Chinese a long page is scrolled to its
 * end, and the bottom of the lowest line of text in the content area must be at or above the top of the
 * circle. At 990 and 390 the circle is not drawn: the case checks that it is not, because the
 * phone's bar is held at the window's top and cannot cover a last line at the foot. At 1440 and 990,
 * where the review pane is a column beside the page, the pane is opened and made long with twenty
 * made-up lines the test adds at its end; at 1440 its lowest line is measured the same way, and at 990
 * the case checks that no circle is drawn there either. An unscrolled page is where the pane once ran
 * below the window (problem ouJEpnWO96RD). At 660 and 390 the pane is a band above the page, not at the
 * foot, so it is not measured.
 *
 * WHAT CHANGED WITH DESIGN D. The old expectation was a corner button at all four widths, and the
 * test waited for one at 990, 660 and 390. The new expectation is the line above the button where the
 * button is drawn, and no button below 1024 pixels while the message waits.
 *
 * The servers come from `liveApp` in tests/helpers.ts, with a test office of its own and made-up
 * records. Nothing here touches the live office. With W13Q_FAB_SHOTS set to a folder, the test also
 * saves each measured window as a picture there.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SPLIT_FROM } from '../src/web/lib/chat-split.ts'

let app: LiveApp
const shots = process.env.W13Q_FAB_SHOTS
const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const WIDTHS = [1440, 990, 390] as const
const THEMES = ['light'] as const

beforeAll(async () => {
  app = await liveApp({ name: 'corner-button-room', viewport: { width: 1440, height: 800 } })
  // This case exercises the explicit unread-only choice.
  const unreadOnly = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: headers, body: JSON.stringify({ chatButtonStays: 'when-unread' }),
  })
  expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
  // ONE MADE-UP MESSAGE WAITS FOR THE READER, which is what draws the corner circle design D keeps for 1024 pixels and
  // wider. The test is about the room the page leaves for that circle, so the circle must be the one the design draws.
  const writer = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'agent', title: 'A made-up waiting writer', data: { handle: 'corner-room-writer', runtime: 'codex', state: 'active' } }),
  })
  expect(writer.status, await writer.clone().text()).toBe(201)
  const registered = (await (await fetch(`${app.api}/api/participants/agent/corner-room-writer`, { headers })).json()) as { participant: { id: string } }
  const waiting = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': registered.participant.id },
    body: JSON.stringify({ kind: 'message', title: 'A made-up waiting line', data: { body: 'A made-up line waiting for the reader.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(waiting.status, await waiting.clone().text()).toBe(201)
  for (let i = 1; i <= 40; i++) {
    const made = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'task', title: `Test task ${String(i)} · sort the paper lamps by colour`, data: { state: 'todo' } }),
    })
    expect(made.status, await made.clone().text()).toBe(201)
  }
  if (shots) mkdirSync(shots, { recursive: true })
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

interface Measured {
  /** The bottom of the lowest visible line of text inside the box, in window coordinates. */
  lastLine: number
  /** The top of the corner button, in window coordinates. */
  button: number
  /** How far the box can scroll, so a page too short to reach the button is not a pass. */
  overflow: number
  windowHeight: number
  /** How far the page itself is scrolled when the box is measured. */
  pageScrolled: number
}

/** Scrolls the box to its end and measures its lowest line of text against the corner button. */
async function measure(page: Page, box: 'page' | 'pane'): Promise<Measured> {
  return page.evaluate((which) => {
    const root =
      which === 'page' ? document.querySelector('main.page') : document.querySelector<HTMLElement>('.px-pane')
    const button = document.querySelector('.px-chat-circle')
    if (root === null || button === null) throw new Error(`no ${which} or no corner button on this page`)
    let overflow: number
    if (which === 'page') {
      overflow = document.documentElement.scrollHeight - innerHeight
      scrollTo(0, document.documentElement.scrollHeight)
    } else {
      // THE PAGE STAYS AT ITS TOP. There the pane starts below what is drawn above it, and before
      // problem ouJEpnWO96RD was fixed its foot ran below the window. Only the pane is scrolled.
      const pane = root as HTMLElement
      overflow = pane.scrollHeight - pane.clientHeight
      pane.scrollTop = pane.scrollHeight
    }
    let lastLine = -Infinity
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.nodeValue ?? '').trim() === '') continue
      const parent = node.parentElement
      if (parent === null || parent.closest('style, script, .px-sr') !== null) continue
      if (!parent.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) if (rect.height > 0) lastLine = Math.max(lastLine, rect.bottom)
    }
    return { lastLine, button: button.getBoundingClientRect().top, overflow, windowHeight: innerHeight, pageScrolled: scrollY }
  }, box)
}

async function openAt(width: number, height: number, theme: string, address: string, paneOpen = false) {
  const context = await app.browser.newContext({ viewport: { width, height } })
  await context.addInitScript((chosen) => localStorage.setItem('mole-office.preset.theme', chosen), theme)
  // The review column's own stored state (src/web/lib/review.ts): open, showing nothing, collecting
  // nothing. The Reviews press that opens it sits in the rail, which is folded away at some widths.
  if (paneOpen) await context.addInitScript(() => localStorage.setItem('mole-office.review', 'open||||'))
  const page = await context.newPage()
  await page.goto(`${app.site}/${address}`)
  await waitForThePage(page, 30_000)
  // THE BREAKPOINT IS READ FROM ITS ONE HOME, not copied as a number that can change. It is read in the browser after the
  // page has its size, because the answer is the one this page is drawn at.
  const wide = await page.evaluate((query) => window.matchMedia(query).matches, THE_SPLIT_FROM)
  // DESIGN D DRAWS THE CIRCLE ONLY WHERE THE CHAT SITS BESIDE THE PAGE. At the narrow widths the true expectation is that
  // no circle is drawn, so the test reads that instead of waiting for a button the design does not put there.
  if (wide) await page.locator('.px-chat-circle').waitFor()
  else expect(await page.locator('.px-chat-circle').count(), 'the corner circle was drawn where the chat does not sit beside the page').toBe(0)
  expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
  return { context, page, wide }
}

it('ends every long page above the corner button where design D draws it, and draws no button below 1024', async () => {
  const cases: [number, string, string][] = []
  for (const width of WIDTHS) cases.push([width, 'light', 'en'])
  cases.push([1440, 'light', 'zh'])
  for (const [width, theme, language] of cases) {
    {
      const { context, page, wide } = await openAt(width, 800, theme, `?lang=${language}#/records`)
      try {
        await page.getByText('Test task 40 ·').first().waitFor()
        const where = `the records page at ${String(width)} wide in the ${theme} look, in ${language}`
        if (shots) await page.screenshot({ path: join(shots, `records-end-${String(width)}-${theme}-${language}.png`) })
        if (wide) {
          const seen = await measure(page, 'page')
          expect(seen.overflow, `${where} is not long enough to reach the button`).toBeGreaterThan(0)
          expect(seen.lastLine, `${where}: the last line ends under the corner button`).toBeLessThanOrEqual(seen.button)
        } else {
          const overflow = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
          expect(overflow, `${where} is not long enough to reach its foot`).toBeGreaterThan(0)
          expect(await page.locator('.px-chat-circle').count(), `${where}: the corner circle is drawn where the chat does not sit beside the page`).toBe(0)
        }
      } finally {
        await context.close()
      }
    }
  }
}, 240_000)

it('ends the review pane above the corner button where the button is drawn, and draws none below 1024', async () => {
  for (const width of [1440, 990] as const) {
    for (const theme of THEMES) {
      const { context, page, wide } = await openAt(width, 800, theme, '#/records', true)
      try {
        await page.locator('.px-pane').waitFor()
        // BELOW 1024 THERE IS NO CORNER BUTTON TO MEASURE THE PANE AGAINST. The phone's bar is at the window's top, so the
        // true expectation at that width is that no circle is drawn; openAt has already read it, and this reads it here.
        if (!wide) {
          expect(await page.locator('.px-chat-circle').count(), 'the corner circle was drawn where the chat does not sit beside the page').toBe(0)
          continue
        }
        // THE PANE IS MADE LONG BY THE TEST. With no review in this test office the pane holds a few
        // lines, so the test adds twenty made-up lines at its end, standing in for a long refusal.
        await page.locator('.px-pane').evaluate((pane) => {
          const block = document.createElement('div')
          block.className = 'test-long-ending'
          for (let i = 1; i <= 20; i++) {
            const line = document.createElement('p')
            line.textContent = `Made-up line ${String(i)} added by the test to make the pane long.`
            block.append(line)
          }
          pane.append(block)
        })
        const seen = await measure(page, 'pane')
        if (shots) await page.screenshot({ path: join(shots, `review-pane-end-${String(width)}-${theme}.png`) })
        const where = `the review pane at ${String(width)} wide in the ${theme} look, with the page at its top`
        expect(seen.pageScrolled, `${where}: the page was scrolled`).toBe(0)
        expect(seen.overflow, `${where} does not scroll, so it cannot reach the button`).toBeGreaterThan(0)
        expect(seen.lastLine, `${where}: the last line ends under the corner button`).toBeLessThanOrEqual(seen.button)
        // THE PAGE AT ITS END. The pane reads its own top again in the frame after a scroll, so the
        // test waits two frames before it measures.
        await page.evaluate(
          () =>
            new Promise<void>((done) => {
              scrollTo(0, document.documentElement.scrollHeight)
              requestAnimationFrame(() => requestAnimationFrame(() => done()))
            }),
        )
        const atEnd = await measure(page, 'pane')
        const whereAtEnd = `the review pane at ${String(width)} wide in the ${theme} look, with the page at its end`
        expect(atEnd.pageScrolled, `${whereAtEnd}: the page did not scroll`).toBeGreaterThan(0)
        expect(atEnd.overflow, `${whereAtEnd} does not scroll, so it cannot reach the button`).toBeGreaterThan(0)
        expect(atEnd.lastLine, `${whereAtEnd}: the last line ends under the corner button`).toBeLessThanOrEqual(atEnd.button)
      } finally {
        await context.close()
      }
    }
  }
}, 240_000)
