// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT'S PAGE SCROLLS IN ITS OWN BOX, so its scrollbar stands at the right edge of its own column.
 *
 * On a window wider than a phone's, a report's page scrolls inside the page's own box and the window does not
 * scroll. The scrollbar then stands beside the words, and left of the chat or the review column when one is beside
 * the page, not at the window's right edge. What the window did for the page, the box does: the wheel over the
 * margin, the scrolling keys while nothing has the focus, a press that brings a place into view, and the place the
 * chat that covers the page gives back. Every other page, and a report on a phone, scrolls the window as before.
 *
 * In a real browser against a Mole Office of its own, with a made-up report of forty parts:
 *  1. At 1440 and at 1024 with nothing beside the page, the page scrolls in its box and the window does not, and the
 *     report's words reach the column's right edge while the checklists press is drawn at the top right.
 *  2. With the chat beside the page at 1440, and the review column beside it at 990, the box's scrollbar stands left
 *     of them.
 *  3. The wheel over the page's own left margin at 1440, and over the empty margin beside the page at 1920, scrolls
 *     the box.
 *  4. Page Down, Space, the down arrow, End, Page Up and Home scroll the box while nothing has the focus.
 *  5. A quote of a part, pressed in the chat beside the page, brings the part into view inside the box.
 *  6. Going to another report from far down this one starts the other at its top.
 *  7. At 990 the chat that covers the page gives the page back where it was, after the page moved under it.
 *  8. At 390 the window scrolls and the box does not, and at 1440 a page that is not a report scrolls the window.
 *  9. At 990 with a review collecting, the room under the report's last line is not the room the page keeps without
 *     the review and the tray's height added together.
 * 10. At 1440 an agent's comment on a part far below the first screen draws its count at the part and its card under
 *     it before the box is scrolled, and both move with the part as the box scrolls it into view.
 *
 * Find-in-page is the browser's own bar, which no test here can open.
 *
 * WHY A BROWSER OF ITS OWN: the shared test browser starts with --hide-scrollbars, so no scrollbar has a width in it,
 * and the checks of the box's bar and the window's bar could not fail there. This file's browser is the same Chromium,
 * started without that word.
 *
 * Everything here is made up.
 */
import type { Browser, BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { TARGET_ATTRIBUTE, targetAttributeValue } from '../src/shared/targets.ts'
import { CHAT_OPEN_KEY } from '../src/web/lib/chat-split.ts'
import { THE_SHELL_WIDTH } from '../src/web/lib/the-shell-width.ts'
import { liveApp, openRecordPagesAt, waitForThePage, type LiveApp } from './helpers.ts'
import { putThePageAt, thePageAtRest, toTheEndOfThePage, whereThePageIs } from './the-page-scroller.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AGENT = { name: 'Made-up Box Agent', handle: 'made-up-box-agent' }
const AS_THE_AGENT = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle }
/** Enough parts that the last of them is several screens below the first. */
const PARTS = 40

type Size = { width: number; height: number }
const WIDE: Size = { width: 1440, height: 900 }
/** The narrowest window the frame draws its sidebar beside the page in, read from the one number. */
const THE_LEAST_WIDE: Size = { width: THE_SHELL_WIDTH, height: 900 }
const BELOW_THE_SPLIT: Size = { width: 990, height: 900 }
const WIDER_THAN_THE_PAGE: Size = { width: 1920, height: 900 }
const PHONE: Size = { width: 390, height: 844 }

let app: LiveApp
let drawsBars: Browser | undefined
let agentKey = ''
let report = ''
let secondReport = ''
let note = ''

/** What the person's browser remembers before the first page, once for each window: `collecting` is a review's id, which the column shows. */
type Start = { with?: string; review?: 'open' | 'shut'; collecting?: string }

async function aWindow(size: Size, start: Start = {}): Promise<{ context: BrowserContext; page: Page }> {
  if (drawsBars === undefined) throw new Error('the browser that draws scrollbars is not started')
  const context = await drawsBars.newContext({ viewport: size })
  await openRecordPagesAt(context, 'full')
  await context.addInitScript(
    ([chatOpen, chatWith, review, collecting]) => {
      if (sessionStorage.getItem('box-test-set') === 'yes') return
      sessionStorage.setItem('box-test-set', 'yes')
      localStorage.setItem('mole-office.preset.theme', 'light')
      localStorage.setItem('mole-office.language', 'en')
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem(chatOpen, 'no')
      // WHETHER THE COLUMN IS OPEN, THEN WHAT IT SHOWS AND WHAT COLLECTS, each beside its project: stored() in src/web/lib/review.ts.
      localStorage.setItem('mole-office.review', collecting === '' ? `${review}||||` : `${review}|${collecting}|default|${collecting}|default`)
      if (chatWith !== '') localStorage.setItem('mole-office.chat.with', chatWith)
    },
    [CHAT_OPEN_KEY, start.with ?? '', start.review ?? 'shut', start.collecting ?? ''] as const,
  )
  const page = await context.newPage()
  return { context, page }
}

/** The selector of one part of a made-up report, as the page draws it. */
function thePart(recordId: string, n: number): string {
  return `[${TARGET_ATTRIBUTE}="${targetAttributeValue({ kind: 'reportBlock', recordId, blockId: `b-${String(n)}` })}"]`
}

/** Go to a made-up report and wait until its last part is drawn. */
async function theReport(page: Page, recordId = report): Promise<void> {
  await page.goto(`${app.site}/?lang=en#/r/${recordId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector(thePart(recordId, PARTS), { state: 'attached', timeout: 30_000 })
}

/** How the page scrolls and where its parts stand, as the browser drew them. */
type Drawn = {
  /** Whether the page's box scrolls what is in it, how far it can, and how wide its own scrollbar is. */
  boxScrolls: boolean
  boxRuns: number
  boxesBar: number
  /** How far the window can scroll down, and how wide the window's own scrollbar is. */
  windowRuns: number
  windowsBar: number
  /** The right edges of the box, of the column inside its padding, of the report's article and of its words. */
  boxRight: number
  columnRight: number
  articleRight: number
  wordsRight: number
}

async function whatIsDrawn(page: Page): Promise<Drawn> {
  return page.evaluate(() => {
    const main = document.getElementById('main')
    const article = document.querySelector('#main article.rp')
    // THE WORDS are the part of the article that holds the report's own parts, below its head.
    const words = document.querySelector('#main article.rp > .rp-sides')
    if (main === null || article === null || words === null) throw new Error('the report, its article or its words are not drawn')
    const style = getComputedStyle(main)
    const at = main.getBoundingClientRect()
    const root = document.documentElement
    return {
      boxScrolls: /^(auto|scroll)$/.test(style.overflowY),
      boxRuns: main.scrollHeight - main.clientHeight,
      boxesBar: main.offsetWidth - main.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth),
      windowRuns: root.scrollHeight - window.innerHeight,
      windowsBar: window.innerWidth - root.clientWidth,
      boxRight: Math.round(at.right),
      columnRight: Math.round(at.left + main.clientLeft + main.clientWidth - parseFloat(style.paddingRight)),
      articleRight: Math.round(article.getBoundingClientRect().right),
      wordsRight: Math.round(words.getBoundingClientRect().right),
    }
  })
}

/** The page scrolls in its own box: the box has a scrollbar and somewhere to go, and the window has neither. */
function scrollsInItsBox(drawn: Drawn, where: string): void {
  expect(drawn.boxScrolls, `${where}: the page's box does not scroll`).toBe(true)
  expect(drawn.boxRuns, `${where}: the box has nowhere to scroll, so this case would test nothing`).toBeGreaterThan(0)
  expect(drawn.boxesBar, `${where}: the box draws no scrollbar of its own`).toBeGreaterThan(0)
  expect(drawn.windowRuns, `${where}: the window scrolls as well as the box`).toBeLessThanOrEqual(0)
  expect(drawn.windowsBar, `${where}: the window draws a scrollbar`).toBe(0)
}

async function theWindowsPlace(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY)
}

async function leftEdge(page: Page, selector: string): Promise<number> {
  const its = await page.locator(selector).first().boundingBox()
  if (its === null) throw new Error(`${selector} is not drawn`)
  return Math.round(its.x)
}

async function say(headers: Record<string, string>, data: Record<string, unknown>): Promise<void> {
  const body = String(data.body)
  const said = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data }) })
  expect(said.status, await said.clone().text()).toBe(201)
}

async function aMadeUpReport(title: string): Promise<string> {
  const blocks = Array.from({ length: PARTS }, (_, at) => {
    const n = at + 1
    return { id: `b-${String(n)}`, type: 'text', heading: `Made-up part ${String(n)}`, text: `Made-up paragraph ${String(n)}. The pump for part ${String(n)} ran for six hours, and every made-up gauge on the line held its pressure through the night.` }
  })
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'report', title, data: { for: 'Made-up reader', date: '2026-11-14', blocks } }) })
  expect(made.status, await made.clone().text()).toBe(201)
  return ((await made.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-reports-page-scrolls-in-its-own-box', viewport: WIDE, workspace: 'default', opensAt: 'full' })
  const { chromium } = await import('playwright')
  drawsBars = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })
  const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }) })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const agents = ((await (await fetch(`${app.api}/api/participants`, { headers: PERSON })).json()) as { agents: { id: string; handle: string }[] }).agents
  const agentId = agents.find((one) => one.handle === AGENT.handle)?.id ?? ''
  expect(agentId).not.toBe('')
  agentKey = participantKey({ kind: 'agent', id: agentId })
  report = await aMadeUpReport('Made-up pump report')
  secondReport = await aMadeUpReport('Made-up second pump report')
  const other = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'note', title: 'Made-up note about the pumps', data: { body: 'made up' } }) })
  expect(other.status, await other.clone().text()).toBe(201)
  note = ((await other.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await drawsBars?.close()
  await app?.stop()
}, 60_000)

it('1. at 1440 and 1024 the page scrolls in its box, and the words reach the column beside the checklists press', async () => {
  for (const size of [WIDE, THE_LEAST_WIDE]) {
    const where = `${String(size.width)} wide`
    const { context, page } = await aWindow(size)
    try {
      await theReport(page)
      // THE PRESS AT THE TOP RIGHT KEEPS A ROOM BESIDE THE PAGE'S FIRST LINES. Without it drawn, nothing narrows the words.
      expect(await page.locator('.ckw').count(), `${where}: the checklists press is not drawn, so the words' width is not tested beside it`).toBe(1)
      const drawn = await whatIsDrawn(page)
      scrollsInItsBox(drawn, where)
      expect(drawn.articleRight, `${where}: the report's article stops short of the column's right edge`).toBe(drawn.columnRight)
      expect(drawn.wordsRight, `${where}: the report's words stop short of the column's right edge`).toBe(drawn.columnRight)
    } finally {
      await context.close()
    }
  }
}, 180_000)

it('2. the box\'s scrollbar stands left of the chat beside the page at 1440 and of the review column at 990', async () => {
  {
    const { context, page } = await aWindow(WIDE)
    try {
      await theReport(page)
      await page.click('.shell-side .shell-chat')
      await page.waitForSelector('aside.px-chat[data-where="split"]', { timeout: 20_000 })
      await page.waitForTimeout(300)
      const drawn = await whatIsDrawn(page)
      scrollsInItsBox(drawn, 'the chat beside at 1440')
      expect(drawn.boxRight, 'the box\'s scrollbar is not left of the chat').toBeLessThanOrEqual(await leftEdge(page, 'aside.px-chat'))
      expect(drawn.wordsRight, 'beside the chat the words stop short of the column\'s right edge').toBe(drawn.columnRight)
    } finally {
      await context.close()
    }
  }
  {
    const { context, page } = await aWindow(BELOW_THE_SPLIT, { review: 'open' })
    try {
      await theReport(page)
      await page.locator('.px-pane').waitFor({ timeout: 30_000 })
      await page.waitForTimeout(300)
      const drawn = await whatIsDrawn(page)
      scrollsInItsBox(drawn, 'the review column beside at 990')
      expect(drawn.boxRight, 'the box\'s scrollbar is not left of the review column').toBeLessThanOrEqual(await leftEdge(page, '.px-pane'))
    } finally {
      await context.close()
    }
  }
}, 180_000)

it('3. the wheel over the page\'s left margin at 1440 and over the empty margin beside the page at 1920 scrolls the box', async () => {
  for (const size of [WIDE, WIDER_THAN_THE_PAGE]) {
    const where = `${String(size.width)} wide`
    const { context, page } = await aWindow(size)
    try {
      await theReport(page)
      scrollsInItsBox(await whatIsDrawn(page), where)
      // AT 1440 THE PAGE REACHES THE WINDOW'S EDGE, so its margin is its own left padding. Wider, the page stops at its
      // greatest width, and the margin is the empty strip between the sidebar and the page.
      const point = await page.evaluate((outside) => {
        const main = document.getElementById('main')
        const side = document.querySelector('.shell-side')
        if (main === null || side === null) throw new Error('the frame or its page is not drawn')
        const at = main.getBoundingClientRect()
        const x = outside ? Math.round((side.getBoundingClientRect().right + at.left) / 2) : Math.round(at.left + parseFloat(getComputedStyle(main).paddingLeft) / 2)
        const y = Math.round(at.top + at.height / 2)
        const there = document.elementFromPoint(x, y)
        return { x, y, inThePage: there !== null && main.contains(there), inTheSidebar: there !== null && side.contains(there) }
      }, size.width > WIDE.width)
      expect(point.inTheSidebar, `${where}: the point is in the sidebar, not the margin`).toBe(false)
      expect(point.inThePage, `${where}: the point is ${size.width > WIDE.width ? 'inside' : 'outside'} the page's box`).toBe(size.width <= WIDE.width)
      await page.mouse.move(point.x, point.y)
      await page.mouse.wheel(0, 600)
      await expect.poll(() => whereThePageIs(page), { message: `${where}: the wheel over the margin did not scroll the box`, timeout: 5_000 }).toBeGreaterThan(0)
      await thePageAtRest(page)
      expect(await theWindowsPlace(page), `${where}: the wheel scrolled the window`).toBe(0)
    } finally {
      await context.close()
    }
  }
}, 180_000)

it('4. the scrolling keys scroll the box while nothing has the focus', async () => {
  const { context, page } = await aWindow(WIDE)
  try {
    await theReport(page)
    const drawn = await whatIsDrawn(page)
    scrollsInItsBox(drawn, 'the keys at 1440')
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    })
    expect(await page.evaluate(() => document.activeElement === document.body), 'something still has the focus').toBe(true)
    const after = async (key: string): Promise<number> => {
      await page.keyboard.press(key)
      await thePageAtRest(page)
      return whereThePageIs(page)
    }
    const pageDown = await after('PageDown')
    expect(pageDown, 'Page Down did not scroll the box').toBeGreaterThan(0)
    const space = await after('Space')
    expect(space, 'Space did not scroll the box').toBeGreaterThan(pageDown)
    const arrow = await after('ArrowDown')
    expect(arrow, 'the down arrow did not scroll the box').toBeGreaterThan(space)
    const end = await after('End')
    expect(end, 'End did not reach the end of the box').toBeGreaterThanOrEqual(drawn.boxRuns - 1)
    const pageUp = await after('PageUp')
    expect(pageUp, 'Page Up did not scroll the box back').toBeLessThan(end)
    expect(await after('Home'), 'Home did not bring the box to its top').toBe(0)
    expect(await theWindowsPlace(page), 'a key scrolled the window').toBe(0)
  } finally {
    await context.close()
  }
}, 120_000)

it('5. a quote of a part pressed in the chat beside the page brings the part into view inside the box', async () => {
  await say(AS_THE_AGENT, {
    body: 'Made-up note about part 33.',
    to: [{ kind: 'person', id: THE_PERSON }],
    quotes: [{ target: { kind: 'region', recordId: report, regionId: 'data.blocks[#b-33]' }, place: { at: 'quote', words: 'pump for part 33 ran' } }],
  })
  const { context, page } = await aWindow(WIDE, { with: agentKey })
  try {
    await theReport(page)
    await page.click('.shell-side .shell-chat')
    await page.waitForSelector('aside.px-chat[data-where="split"]', { timeout: 20_000 })
    scrollsInItsBox(await whatIsDrawn(page), 'the chat beside at 1440')
    const link = '.px-chat-said > li:has-text("about part 33") a.px-chat-quote-link'
    await page.waitForSelector(link, { timeout: 30_000 })
    const inTheBox = async (): Promise<boolean> =>
      page.locator(thePart(report, 33)).evaluate((part) => {
        const box = document.getElementById('main')?.getBoundingClientRect()
        const its = part.getBoundingClientRect()
        return box !== undefined && its.top >= box.top && its.top < box.bottom
      })
    expect(await inTheBox(), 'part 33 was in view before the press').toBe(false)
    await page.click(link)
    await page.waitForFunction((part) => document.querySelector(part)?.hasAttribute('data-quote-landed') === true, thePart(report, 33), { timeout: 5_000 })
    await thePageAtRest(page)
    expect(await inTheBox(), 'part 33 was not brought into view inside the box').toBe(true)
    expect(await whereThePageIs(page), 'the box did not move').toBeGreaterThan(0)
    expect(await theWindowsPlace(page), 'the press scrolled the window').toBe(0)
  } finally {
    await context.close()
  }
}, 120_000)

it('6. going to another report from far down this one starts the other at its top', async () => {
  const { context, page } = await aWindow(WIDE)
  try {
    await theReport(page)
    scrollsInItsBox(await whatIsDrawn(page), 'the first report at 1440')
    await putThePageAt(page, 1_500)
    await thePageAtRest(page)
    expect(await whereThePageIs(page), 'the first report did not scroll, so this case would test nothing').toBeGreaterThan(0)
    await page.evaluate((to) => {
      location.hash = `#/r/${to}`
    }, secondReport)
    await page.waitForSelector(thePart(secondReport, PARTS), { state: 'attached', timeout: 30_000 })
    await thePageAtRest(page)
    scrollsInItsBox(await whatIsDrawn(page), 'the second report at 1440')
    expect(await whereThePageIs(page), 'the second report did not start at its top').toBe(0)
  } finally {
    await context.close()
  }
}, 120_000)

it('7. at 990 the chat that covers the page gives the page back where it was', async () => {
  const { context, page } = await aWindow(BELOW_THE_SPLIT)
  try {
    await theReport(page)
    scrollsInItsBox(await whatIsDrawn(page), 'the report at 990')
    await putThePageAt(page, 900)
    await thePageAtRest(page)
    // THE CHAT KEEPS THE PLACE THE PAGE SETTLED AT, a moment after its last scroll, so it waits here as long as the
    // chat's case at 390 does. A press sooner would be given back the place from before this scroll.
    await page.waitForTimeout(400)
    const was = await whereThePageIs(page)
    expect(was, 'the page did not scroll, so this case would test nothing').toBeGreaterThan(0)
    await page.click('.shell-bar .shell-chat-phone')
    await page.waitForSelector('aside.px-chat[data-where="split"]', { timeout: 20_000 })
    await page.waitForTimeout(300)
    // THE PAGE CAN MOVE WHILE THE CHAT COVERS IT, which is why the chat keeps its place. It is put at its top here, so
    // the case asks that the back shape puts it back, and does not pass because nothing moved it.
    await putThePageAt(page, 0)
    await thePageAtRest(page)
    expect(await whereThePageIs(page), 'the page did not move under the chat, so this case would test nothing').toBe(0)
    await page.click('.px-chat-seam-back')
    await page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })
    await thePageAtRest(page)
    expect(await whereThePageIs(page), 'the page was not where it was left').toBe(was)
  } finally {
    await context.close()
  }
}, 120_000)

it('8. at 390 the window scrolls and the box does not, and at 1440 a page that is not a report scrolls the window', async () => {
  const theBoxScrolls = async (page: Page): Promise<boolean> =>
    page.evaluate(() => {
      const main = document.getElementById('main')
      if (main === null) throw new Error('the page is not drawn')
      return /^(auto|scroll)$/.test(getComputedStyle(main).overflowY)
    })
  {
    const { context, page } = await aWindow(PHONE)
    try {
      await theReport(page)
      expect(await theBoxScrolls(page), 'at 390 the page scrolls in its box').toBe(false)
      await page.evaluate(() => {
        window.scrollTo(0, 900)
      })
      await page.waitForTimeout(400)
      expect(await theWindowsPlace(page), 'at 390 the window did not scroll').toBeGreaterThan(0)
    } finally {
      await context.close()
    }
  }
  {
    const { context, page } = await aWindow(WIDE)
    try {
      await theReport(page)
      expect(await theBoxScrolls(page), 'the report at 1440 does not scroll in its box, so this case would test nothing').toBe(true)
      await page.evaluate((to) => {
        location.hash = `#/r/${to}`
      }, note)
      await page.waitForFunction((title) => document.querySelector('#main article.rp')?.textContent?.includes(title) === true, 'Made-up note about the pumps', { timeout: 30_000 })
      expect(await theBoxScrolls(page), 'the note at 1440 scrolls in its box').toBe(false)
    } finally {
      await context.close()
    }
  }
}, 180_000)

it('9. at 990 with a review collecting, the room under the last line is not the page\'s room and the tray\'s added together', async () => {
  // THE ROOM UNDER THE PAGE'S LAST LINE, with the page at its end: from the bottom of what the page drew to the
  // window's foot. Whatever the page keeps at its end is in it, inside the box and outside it.
  const theRoomUnderTheEnd = async (page: Page): Promise<number> => {
    await toTheEndOfThePage(page)
    await thePageAtRest(page)
    return page.evaluate(() => {
      const last = [...document.querySelectorAll('#main > :not(.page-layer)')].at(-1)
      if (last === undefined) throw new Error('the page draws nothing')
      return window.innerHeight - last.getBoundingClientRect().bottom
    })
  }
  let alone = 0
  {
    const { context, page } = await aWindow(BELOW_THE_SPLIT)
    try {
      await theReport(page)
      scrollsInItsBox(await whatIsDrawn(page), 'the report at 990 with no review')
      alone = await theRoomUnderTheEnd(page)
    } finally {
      await context.close()
    }
  }
  const started = await fetch(`${app.api}/api/reviews`, { method: 'POST', headers: PERSON, body: JSON.stringify({ entry: { target: { kind: 'record', recordId: report, workspaceId: 'default' } } }) })
  expect(started.ok, await started.clone().text()).toBe(true)
  const collecting = ((await started.json()) as { review: { id: string } }).review.id
  const { context, page } = await aWindow(BELOW_THE_SPLIT, { review: 'open', collecting })
  try {
    await theReport(page)
    await page.locator('.px-pane [data-part="your-review-bar"]').waitFor({ timeout: 30_000 })
    await page.waitForTimeout(300)
    scrollsInItsBox(await whatIsDrawn(page), 'the report at 990 with a review collecting')
    const room = await theRoomUnderTheEnd(page)
    const tray = await page.evaluate(() => window.innerHeight - (document.querySelector('.px-pane')?.getBoundingClientRect().top ?? window.innerHeight))
    expect(tray, 'the tray is not drawn at the foot, so this case would test nothing').toBeGreaterThan(0)
    expect(room, 'the page\'s last line is under the tray').toBeGreaterThanOrEqual(tray)
    // THE PAGE KEEPS ITS ROOM ONCE. The tray stands in the room at the foot that the page keeps for the corner button,
    // so the two are not added together: on a window that scrolls, the larger of them is kept.
    expect(room, `the room under the last line, ${String(room)} px, holds the ${String(alone)} px kept without a review and the tray's ${String(tray)} px added together`).toBeLessThan(alone + tray)
  } finally {
    await context.close()
  }
}, 180_000)

it('10. an agent\'s comment on a part far below the first screen draws its count and its card at that part', async () => {
  await say(AS_THE_AGENT, {
    body: 'Made-up question about part 36.',
    to: [{ kind: 'person', id: THE_PERSON }],
    target: { target: { kind: 'region', recordId: report, regionId: 'data.blocks[#b-36]' }, place: { at: 'surface' } },
  })
  // THE COUNT AND THE CARD FOR PART 36 ALONE: case 5's note about part 33 is on the same report.
  const COUNT = '.px-comment-circle[data-comments-on*="b-36"]'
  const CARD = '.px-said[data-said-on*="b-36"]'
  const { context, page } = await aWindow(WIDE)
  try {
    await theReport(page)
    await page.waitForFunction(() => document.documentElement.getAttribute('data-comment-circles') === 'placed', undefined, { timeout: 30_000 })
    scrollsInItsBox(await whatIsDrawn(page), 'the comment far down at 1440')
    const part = page.locator(thePart(report, 36))
    expect(await part.evaluate((its) => its.getBoundingClientRect().top > window.innerHeight), 'part 36 is on the first screen, so this case would test nothing').toBe(true)
    // BOTH ARE DRAWN BEFORE ANY SCROLL, and neither is measured again as the box scrolls, so each must scroll with its part.
    await page.waitForFunction(([count, card]) => document.querySelector(count) !== null && document.querySelector(card) !== null, [COUNT, CARD] as const, { timeout: 15_000 }).catch(() => undefined)
    expect(await page.locator(COUNT).count(), 'no count is drawn for the comment on part 36').toBe(1)
    expect(await page.locator(CARD).count(), 'no card is drawn for the comment on part 36').toBe(1)
    const where = () => page.evaluate(([selector, count, card]) => {
      const its = document.querySelector(selector)?.getBoundingClientRect()
      const circle = document.querySelector(count)?.getBoundingClientRect()
      const drawn = document.querySelector(card)?.getBoundingClientRect()
      if (its === undefined || circle === undefined || drawn === undefined) throw new Error('the part, its count or its card is not drawn')
      return { partTop: its.top, partBottom: its.bottom, circleTop: circle.top, circleBottom: circle.bottom, cardTop: drawn.top, windowHeight: window.innerHeight }
    }, [thePart(report, 36), COUNT, CARD] as const)
    const before = await where()
    await part.scrollIntoViewIfNeeded()
    await thePageAtRest(page)
    const after = await where()
    expect(after.partBottom, 'part 36 was not brought into the window').toBeLessThanOrEqual(after.windowHeight)
    expect(Math.abs((after.circleTop - after.partTop) - (before.circleTop - before.partTop)), 'the count did not move with its part').toBeLessThanOrEqual(1)
    expect(Math.abs((after.cardTop - after.partTop) - (before.cardTop - before.partTop)), 'the card did not move with its part').toBeLessThanOrEqual(1)
    expect(after.circleBottom, 'the count is not at its part').toBeGreaterThanOrEqual(after.partTop - 40)
    expect(after.circleTop, 'the count is not at its part').toBeLessThanOrEqual(after.partBottom)
    expect(after.cardTop, 'the card is not under its part').toBeGreaterThanOrEqual(after.partBottom - 1)
    expect(after.cardTop - after.partBottom, 'the card is not just under its part').toBeLessThan(40)
  } finally {
    await context.close()
  }
}, 120_000)
