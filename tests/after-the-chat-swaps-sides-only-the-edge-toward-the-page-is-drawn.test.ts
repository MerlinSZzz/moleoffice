// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AFTER THE CHAT SWAPS SIDES, ONLY THE EDGE TOWARD THE PAGE IS DRAWN.
 *
 * The chat beside the page draws one dark edge, on its side toward the page. While a review is being collected, the
 * review ring frames the page as well. The ring is fixed to the window and measured from the page's box. A swap moves
 * the page by the chat's width and leaves its size as it was. The ring was measured again only when that box changed
 * size, so after a swap it stayed where the page had been. The chat covered part of it, and the rest was a dark frame
 * over the page, ending at the seam. In the light theme the ring has the same colour as the chat's edge.
 *
 * In a real browser against a Mole Office of its own, with a review being collected and a made-up report open, at 1440
 * and at one pixel above the width the split is drawn from, starting once with the chat on the right and once on the
 * left:
 *  1. The seam's swap press is pressed twenty times, so the chat goes ten times each way. After each press the test
 *     waits until the chat, the page and the ring are in the same place in two frames in a row.
 *  2. After each swap the chat draws its edge toward the page and none at its far side, and its seam draws its line
 *     toward the conversation only.
 *  3. After each swap the ring has the page's left edge and width.
 *  4. After each swap every tall edge in the chat's frame colour outside the chat and the sidebar is where it was in the
 *     page before the first swap, measured from the page's left edge. The sidebar keeps its own line, which is not over
 *     the page. An edge left behind on the screen is found here.
 *
 * By a reading of the code before the fix that comes with this test, it fails at the first swap: the ring keeps the
 * place the page had before the swap.
 *
 * Everything here is made up.
 */
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { TARGET_ATTRIBUTE, targetAttributeValue } from '../src/shared/targets.ts'
import { CHAT_OPEN_KEY, THE_SPLIT_FROM } from '../src/web/lib/chat-split.ts'
import { liveApp, openRecordPagesAt, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const CALLED = 'after-the-chat-swaps-sides-only-the-edge-toward-the-page-is-drawn'
/** Enough parts that the report is taller than the window. */
const PARTS = 30
const SWAPS_EACH_WAY = 10
const HEIGHT = 900
const WIDE = 1440
/** The width the split is drawn from, read from the constant so this test moves with the one number. */
const SPLIT_AT = Number(/\d+/.exec(THE_SPLIT_FROM)?.[0])

type Side = 'left' | 'right'
type Edges = { left: number; right: number }
type Span = { left: number; width: number }

/** What the window draws after a swap, as the browser draws it. */
type Drawn = {
  side: string | null
  page: Span
  ring: Span | null
  chat: Edges
  seam: Edges
  /** Each tall edge in the chat's frame colour outside the chat and the sidebar, measured from the page's left edge. */
  edges: string[]
}

let app: LiveApp
let report = ''

beforeAll(async () => {
  expect(SPLIT_AT, 'the width the split is drawn from was not read').toBeGreaterThan(0)
  app = await liveApp({ name: CALLED, viewport: { width: WIDE, height: HEIGHT }, workspace: 'default', opensAt: 'full' })
  // THE CHAT OPENS THE WAY THE PERSON LAST HAD IT, read from their row, so the row says beside the page.
  const way = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: PERSON, body: JSON.stringify({ chatOpensAs: 'split' }) })
  expect(way.status, await way.clone().text()).toBe(200)
  const blocks = Array.from({ length: PARTS }, (_, at) => {
    const n = at + 1
    return { id: `b-${String(n)}`, type: 'text', heading: `Made-up part ${String(n)}`, text: `Made-up paragraph ${String(n)}. The made-up kiln ran for six hours.` }
  })
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'report', title: 'Made-up kiln report', data: { for: 'Made-up reader', date: '2026-11-22', blocks } }) })
  expect(made.status, await made.clone().text()).toBe(201)
  report = ((await made.json()) as { record: { id: string } }).record.id
  // THE RING IS DRAWN ONLY WHILE A REVIEW IS BEING COLLECTED, so one is started before any window opens.
  const noted = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'note', title: 'Made-up note under review', data: { body: 'made up' } }) })
  expect(noted.status, await noted.clone().text()).toBe(201)
  const note = ((await noted.json()) as { record: { id: string; workspaceId: string } }).record
  const review = await fetch(`${app.api}/api/reviews`, {
    method: 'POST',
    headers: PERSON,
    body: JSON.stringify({ entry: { target: { kind: 'record', recordId: note.id, workspaceId: note.workspaceId } } }),
  })
  expect(review.status, await review.clone().text()).toBeLessThan(300)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** A window of this width whose browser remembers the chat as shut, on the given side. */
async function aWindow(width: number, side: Side): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width, height: HEIGHT } })
  await openRecordPagesAt(context, 'full')
  await context.addInitScript(
    ([openKey, startOn]) => {
      if (sessionStorage.getItem('swap-test-set') === 'yes') return
      sessionStorage.setItem('swap-test-set', 'yes')
      localStorage.setItem('mole-office.preset.theme', 'light')
      localStorage.setItem('mole-office.language', 'en')
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem(openKey, 'no')
      localStorage.setItem('mole-office.chat.split-side', startOn)
    },
    [CHAT_OPEN_KEY, side] as const,
  )
  const page = await context.newPage()
  return { context, page }
}

/** The made-up report with its last part drawn, the ring drawn, and the chat opened beside it on the given side. */
async function theReportWithTheChatBeside(page: Page, side: Side): Promise<void> {
  const last = targetAttributeValue({ kind: 'reportBlock', recordId: report, blockId: `b-${String(PARTS)}` })
  await page.goto(`${app.site}/?lang=en#/r/${report}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector(`[${TARGET_ATTRIBUTE}="${last}"]`, { state: 'attached', timeout: 30_000 })
  await page.locator('.px-strip-ring').waitFor({ state: 'attached', timeout: 20_000 })
  await page.click('.shell-side .shell-chat')
  await page.waitForSelector('aside.px-chat[data-where="split"]', { timeout: 20_000 })
  await page.waitForFunction((on) => document.documentElement.getAttribute('data-chat-split') === on, side, { timeout: 10_000 })
}

/** Wait until the chat, the page and the ring are in the same place in two frames in a row. False if they never are. */
async function untilStill(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const where = (selector: string): string => {
      const it = document.querySelector(selector)
      if (it === null) return 'none'
      const box = it.getBoundingClientRect()
      return [box.left, box.top, box.width, box.height].join(',')
    }
    let last = ''
    for (let frame = 0; frame < 120; frame++) {
      await new Promise<void>((done) => requestAnimationFrame(() => done()))
      const now = ['aside.px-chat[data-where="split"]', '.shell-body', '.px-strip-ring'].map(where).join(' ')
      if (now === last) return true
      last = now
    }
    return false
  })
}

async function whatIsDrawn(page: Page): Promise<Drawn> {
  return page.evaluate(() => {
    const one = (selector: string): Element => {
      const it = document.querySelector(selector)
      if (it === null) throw new Error(`${selector} is not drawn`)
      return it
    }
    const span = (box: DOMRect): { left: number; width: number } => ({ left: Math.round(box.left), width: Math.round(box.width) })
    const side = document.documentElement.getAttribute('data-chat-split')
    const chat = getComputedStyle(one('aside.px-chat[data-where="split"]'))
    const seam = getComputedStyle(one('.px-chat-seam'))
    const body = one('.shell-body').getBoundingClientRect()
    const ring = document.querySelector('.px-strip-ring')
    // THE CHAT'S FRAME COLOUR is the colour of its edge toward the page.
    const frame = side === 'left' ? chat.borderRightColor : chat.borderLeftColor
    const edges: string[] = []
    for (const element of document.querySelectorAll('body *')) {
      if (element.closest('aside.px-chat, .shell-side') !== null) continue
      const box = element.getBoundingClientRect()
      if (box.height < window.innerHeight / 2 || box.bottom <= 0 || box.top >= window.innerHeight) continue
      const style = getComputedStyle(element)
      if (style.visibility !== 'visible') continue
      const classes = (element.getAttribute('class') ?? '').split(/\s+/).filter((name) => name !== '')
      const what = [element.tagName.toLowerCase(), ...classes].join('.')
      if (parseFloat(style.borderLeftWidth) > 0 && style.borderLeftColor === frame) {
        edges.push(`${what}: left edge at ${String(Math.round(box.left - body.left))}`)
      }
      if (parseFloat(style.borderRightWidth) > 0 && style.borderRightColor === frame) {
        edges.push(`${what}: right edge at ${String(Math.round(box.right - body.left))}`)
      }
    }
    edges.sort()
    return {
      side,
      page: span(body),
      ring: ring === null ? null : span(ring.getBoundingClientRect()),
      chat: { left: parseFloat(chat.borderLeftWidth), right: parseFloat(chat.borderRightWidth) },
      seam: { left: parseFloat(seam.borderLeftWidth), right: parseFloat(seam.borderRightWidth) },
      edges,
    }
  })
}

/** What must hold with the chat on this side: its one edge toward the page, the ring on the page, nothing left behind. */
function onlyTheEdgeTowardThePage(drawn: Drawn, side: Side, before: string[], said: string): void {
  expect(drawn.side, `${said}: the split is drawn on the wrong side`).toBe(side)
  const toward = side === 'right' ? 'left' : 'right'
  const far = side === 'right' ? 'right' : 'left'
  expect(drawn.chat[toward], `${said}: the chat draws no edge toward the page`).toBeGreaterThan(0)
  expect(drawn.chat[far], `${said}: the chat draws an edge at its far side`).toBe(0)
  expect(drawn.seam[toward], `${said}: the seam draws a second edge toward the page`).toBe(0)
  expect(drawn.seam[far], `${said}: the seam draws no line toward the conversation`).toBeGreaterThan(0)
  expect(drawn.ring, `${said}: no review ring is drawn`).not.toBeNull()
  expect(drawn.ring, `${said}: the review ring is not where the page is`).toEqual(drawn.page)
  expect(drawn.edges, `${said}: a tall edge in the chat's frame colour is not where it was in the page`).toEqual(before)
}

it.each<[number, Side]>([
  [WIDE, 'right'],
  [WIDE, 'left'],
  [SPLIT_AT + 1, 'right'],
  [SPLIT_AT + 1, 'left'],
])('at %i, starting with the chat on the %s, ten swaps each way leave only the edge toward the page', async (width, start) => {
  const { context, page } = await aWindow(width, start)
  try {
    await theReportWithTheChatBeside(page, start)
    // THE POINTER STAYS ON THE SWAP PRESS, inside the chat, so no part of the page is drawn as hovered.
    await page.hover('.px-chat-seam-swap')
    expect(await untilStill(page), `at ${String(width)} the page did not come to rest after the chat opened`).toBe(true)
    const first = await whatIsDrawn(page)
    onlyTheEdgeTowardThePage(first, start, first.edges, `at ${String(width)}, before the first swap`)
    let side: Side = start
    for (let swap = 1; swap <= SWAPS_EACH_WAY * 2; swap++) {
      side = side === 'right' ? 'left' : 'right'
      const said = `at ${String(width)}, swap ${String(swap)}, to the ${side}`
      await page.click('.px-chat-seam-swap')
      await page.waitForFunction((on) => document.documentElement.getAttribute('data-chat-split') === on, side, { timeout: 10_000 })
      await page.hover('.px-chat-seam-swap')
      expect(await untilStill(page), `${said}: the page did not come to rest`).toBe(true)
      onlyTheEdgeTowardThePage(await whatIsDrawn(page), side, first.edges, said)
    }
  } finally {
    await context.close()
  }
}, 180_000)
