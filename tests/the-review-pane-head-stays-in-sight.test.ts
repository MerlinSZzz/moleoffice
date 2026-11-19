// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PANE'S HEADING STAYS IN THE WINDOW, AND UNDER NOTHING, WHEN THE PAGE IS SCROLLED.
 * Problem gs69YsWqZih6.
 *
 * Where the pane is a column beside the page (1440 and 990 wide here), it is held in the window as
 * the page scrolls. Two faults were measured with the page scrolled:
 * (1) below 1024 wide the phone bar is held at the window's top as well, drawn over the pane, and
 *     the pane was held at the window's top too, so its first 54px were under the bar;
 * (2) at the page's very end the pane was pushed 80px above the window, because the row it sits in
 *     keeps room at its foot for the corner chat button and a held box stays inside its row.
 *
 * WHAT IS MEASURED. A window 800 tall, the records page with forty made-up tasks, the pane open and
 * made long with twenty made-up lines the test adds at its end. With the page scrolled 200px, and
 * with the page scrolled to its end, the test waits two frames and then checks: the point 10px
 * below the pane's top is the pane's, not the bar's; the pane's top is at or below the window's top
 * and the bar's foot; the pane's heading is inside the window and is what is drawn at its own
 * middle. Then, where design D draws the corner circle (1440, while the made-up message below
 * waits), the pane alone is scrolled to its end, and its lowest line of text must end at or above the
 * circle's top, which is round 19's rule (problem ouJEpnWO96RD). At 990 the phone's bar replaces the
 * circle, so the case checks that no circle is drawn instead; the head measures
 * stay at both widths.
 *
 * WHAT CHANGED WITH DESIGN D. The old expectation was a corner button at 1440 and 990 and a pane
 * foot under it at both. The new expectation is that foot at 1440 only; at 990, below the design's
 * 1024-pixel breakpoint, no corner button is drawn while the message waits.
 *
 * The servers come from `liveApp` in tests/helpers.ts, with a test office of its own and made-up
 * records. Nothing here touches the live office. With W13N_PANE_SHOTS set to a folder, the test
 * also photographs the pane scrolled a little and at the page's end, at 1440, 990, 660 and 390 in
 * the light and the dark look, into that folder.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SPLIT_FROM } from '../src/web/lib/chat-split.ts'

let app: LiveApp
const shots = process.env.W13N_PANE_SHOTS
const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeAll(async () => {
  app = await liveApp({ name: 'review-pane-head', viewport: { width: 1440, height: 800 } })
  // This case exercises the explicit unread-only choice.
  const unreadOnly = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: headers, body: JSON.stringify({ chatButtonStays: 'when-unread' }),
  })
  expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
  // ONE MADE-UP MESSAGE WAITS FOR THE READER, which is what draws the corner circle design D keeps for 1024 pixels and
  // wider. At 990 the same waiting message is there and the case checks that the circle is not.
  const writer = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'agent', title: 'A made-up waiting writer', data: { handle: 'pane-head-writer', runtime: 'codex', state: 'active' } }),
  })
  expect(writer.status, await writer.clone().text()).toBe(201)
  const registered = (await (await fetch(`${app.api}/api/participants/agent/pane-head-writer`, { headers })).json()) as { participant: { id: string } }
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
      body: JSON.stringify({ kind: 'task', title: `Test task ${String(i)} · wind the brass clocks`, data: { state: 'todo' } }),
    })
    expect(made.status, await made.clone().text()).toBe(201)
  }
  if (shots) mkdirSync(shots, { recursive: true })
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

/** Opens the records page with the review pane open, and makes the pane long. */
async function openWithTheLongPane(width: number, theme: string) {
  const context = await app.browser.newContext({ viewport: { width, height: 800 } })
  await context.addInitScript((chosen) => localStorage.setItem('mole-office.preset.theme', chosen), theme)
  // The review column's own stored state (src/web/lib/review.ts): open, showing nothing.
  await context.addInitScript(() => localStorage.setItem('mole-office.review', 'open||||'))
  const page = await context.newPage()
  await page.goto(`${app.site}/#/records`)
  await waitForThePage(page, 30_000)
  await page.getByText('Test task 40 ·').first().waitFor()
  // THE BREAKPOINT IS READ FROM ITS ONE HOME, not copied as a number that can change. It is read in the browser after the
  // page has its size, because the answer is the one this page is drawn at.
  const wide = await page.evaluate((query) => window.matchMedia(query).matches, THE_SPLIT_FROM)
  // DESIGN D DRAWS THE CIRCLE ONLY WHERE THE CHAT SITS BESIDE THE PAGE, while a message waits. At 990 the true expectation
  // is that no circle is drawn, so that is what the case reads there.
  if (wide) await page.locator('.px-chat-circle').waitFor()
  else expect(await page.locator('.px-chat-circle').count(), 'the corner circle was drawn where the chat does not sit beside the page').toBe(0)
  await page.locator('.px-pane .px-pane-title').first().waitFor()
  expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
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
  return { context, page, wide }
}

/** Scrolls the page to a place, or to its end, and waits two frames, because the pane reads its
 *  place again in the frame after a scroll. */
async function scrollThePage(page: Page, to: number | 'end'): Promise<void> {
  await page.evaluate(
    (where) =>
      new Promise<void>((done) => {
        scrollTo(0, where === 'end' ? document.documentElement.scrollHeight : where)
        requestAnimationFrame(() => requestAnimationFrame(() => done()))
      }),
    to,
  )
}

interface Seen {
  pageScrolled: number
  pageEnd: number
  windowHeight: number
  paneTop: number
  paneBottom: number
  /** The foot of the phone bar in the window, or 0 where no bar is drawn. */
  barBottom: number
  /** Whether the point 10px below the pane's top is inside the pane. */
  tenBelowTopIsThePane: boolean
  /** What is drawn there, as its class, for the failure message. */
  tenBelowTopIs: string
  headingTop: number
  headingBottom: number
  /** Whether the point at the middle of the heading is the heading. */
  headingIsDrawn: boolean
}

async function look(page: Page): Promise<Seen> {
  return page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>('.px-pane')
    const heading = pane?.querySelector<HTMLElement>('.px-pane-title')
    const bar = document.querySelector<HTMLElement>('.shell-bar')
    if (!pane || !heading || !bar) throw new Error('no pane, no pane heading or no phone bar on this page')
    const box = pane.getBoundingClientRect()
    const head = heading.getBoundingClientRect()
    const barBox = bar.getBoundingClientRect()
    const barBottom = getComputedStyle(bar).display === 'none' ? 0 : Math.max(0, barBox.bottom)
    const at = document.elementFromPoint(box.left + box.width / 2, box.top + 10)
    const atHead = document.elementFromPoint(head.left + Math.min(10, head.width / 2), head.top + head.height / 2)
    return {
      pageScrolled: scrollY,
      pageEnd: document.documentElement.scrollHeight - innerHeight,
      windowHeight: innerHeight,
      paneTop: box.top,
      paneBottom: box.bottom,
      barBottom,
      tenBelowTopIsThePane: at !== null && pane.contains(at),
      tenBelowTopIs: at === null ? 'nothing' : `${at.tagName.toLowerCase()}.${String(at.className)}`,
      headingTop: head.top,
      headingBottom: head.bottom,
      headingIsDrawn: atHead !== null && heading.contains(atHead),
    }
  })
}

/** Scrolls the pane alone to its end and measures its lowest line against the corner button. */
async function lastLineOfThePane(page: Page): Promise<{ lastLine: number; button: number; overflow: number }> {
  return page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>('.px-pane')
    const button = document.querySelector('.px-chat-circle')
    if (pane === null || button === null) throw new Error('no pane or no corner button on this page')
    const overflow = pane.scrollHeight - pane.clientHeight
    pane.scrollTop = pane.scrollHeight
    let lastLine = -Infinity
    const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.nodeValue ?? '').trim() === '') continue
      const parent = node.parentElement
      if (parent === null || parent.closest('style, script, .px-sr') !== null) continue
      if (!parent.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) if (rect.height > 0) lastLine = Math.max(lastLine, rect.bottom)
    }
    const measured = { lastLine, button: button.getBoundingClientRect().top, overflow }
    pane.scrollTop = 0
    return measured
  })
}

it('keeps the pane heading in the window and under nothing, scrolled a little and at the end, at 1440 and 990', async () => {
  for (const width of [1440, 990] as const) {
    const { context, page, wide } = await openWithTheLongPane(width, 'light')
    try {
      for (const to of [200, 'end'] as const) {
        await scrollThePage(page, to)
        const seen = await look(page)
        const where = `the review pane at ${String(width)} wide, the page scrolled ${to === 'end' ? 'to its end' : `${String(to)}px`}`
        console.log(`${where}: ${JSON.stringify(seen)}`)
        expect.soft(seen.pageScrolled, `${where}: the page did not scroll`).toBeGreaterThan(0)
        if (to === 'end') expect.soft(seen.pageScrolled, `${where}: the page is not at its end`).toBeGreaterThanOrEqual(seen.pageEnd - 1)
        // FAULT (1): the top of the pane under the phone bar.
        expect.soft(seen.tenBelowTopIsThePane, `${where}: the point 10px below the pane's top is ${seen.tenBelowTopIs}`).toBe(true)
        // FAULT (2): the top of the pane above the window, or above the bar's foot.
        expect.soft(seen.paneTop, `${where}: the pane's top is above the window or the bar`).toBeGreaterThanOrEqual(Math.max(0, seen.barBottom) - 0.5)
        expect.soft(seen.headingTop, `${where}: the heading is above the window or under the bar`).toBeGreaterThanOrEqual(seen.barBottom - 0.5)
        expect.soft(seen.headingBottom, `${where}: the heading is below the window`).toBeLessThanOrEqual(seen.windowHeight)
        expect.soft(seen.headingIsDrawn, `${where}: something is drawn over the heading`).toBe(true)
        expect.soft(seen.paneBottom, `${where}: the pane runs below the window`).toBeLessThanOrEqual(seen.windowHeight + 0.5)
        if (wide) {
          // ROUND 19'S RULE STILL HOLDS WHERE THE CIRCLE IS DRAWN: the pane's last line ends above it.
          const last = await lastLineOfThePane(page)
          console.log(`${where}, the pane scrolled to its end: ${JSON.stringify(last)}`)
          expect.soft(last.overflow, `${where}: the pane does not scroll, so it cannot reach the button`).toBeGreaterThan(0)
          expect.soft(last.lastLine, `${where}: the pane's last line ends under the corner button`).toBeLessThanOrEqual(last.button)
        } else {
          // WHERE THE PHONE'S BAR IS AT THE WINDOW'S TOP, design D draws no corner circle to measure against.
          expect.soft(await page.locator('.px-chat-circle').count(), `${where}: the corner circle is drawn where the chat does not sit beside the page`).toBe(0)
        }
      }
    } finally {
      await context.close()
    }
  }
}, 240_000)

it.runIf(Boolean(shots))('photographs the pane scrolled a little and at the end, at four widths in both looks', async () => {
  for (const width of [1440, 990, 660, 390] as const) {
    for (const theme of ['light', 'dark'] as const) {
      const { context, page } = await openWithTheLongPane(width, theme)
      try {
        for (const to of [200, 'end'] as const) {
          await scrollThePage(page, to)
          const name = `review-pane-${String(width)}-${theme}-${to === 'end' ? 'page-end' : 'scrolled-200'}.png`
          await page.screenshot({ path: join(shots ?? '', name) })
        }
      } finally {
        await context.close()
      }
    }
  }
}, 240_000)
