// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT OPENS BESIDE THE PAGE. Design D of the chat, the one chosen.
 *
 * Opening the chat splits the window at one seam into the page and the chat, both as tall as the window, with nothing
 * drawn over the page. The seam carries three shapes: swap the sides, open the chat in a window of its own, and put the
 * chat away. It is dragged to change the chat's width, and a double-click on it gives the page its reading width, the
 * token `--measure-read`. While the split is open the sidebar folds to its icons, without changing what the sidebar
 * remembers. With the unread-only button choice, the corner circle is drawn only while the chat is shut, a message waits, and the window is 1024 pixels or
 * wider; otherwise the sidebar's Chat row, or the phone's bar, carries the count. A quote press in the writing box takes
 * the words selected on the page into the next message. Pressing a quote in a message that names a part drawn on this
 * page scrolls to that part and marks it. Below 1024 pixels the open chat covers the whole screen, and the seam is a bar
 * at its top whose back shape returns to the page where it was left.
 *
 * In a real browser against a Mole Office of its own:
 *  1. Opening from the sidebar's Chat row splits the window at 1440, and the page keeps at least its reading width.
 *  2. The seam's three shapes swap the sides, send the chat to its own window, and put it away. Each is a shape with
 *     its word in its title, its label and a word only a screen reader reads.
 *  3. Dragging the seam changes the chat's width, held between 360 pixels and the window less 480. A double-click gives
 *     the page exactly its reading width. The width is remembered.
 *  4. The sidebar folds while the split is open and comes back when the chat is put away or sent to its window, and
 *     what the sidebar remembers does not change.
 *  5. The circle is drawn only while the chat is shut and a message waits, never on a phone, and the sidebar's Chat row
 *     or the phone's bar carries the count otherwise.
 *  6. A selection on the page is carried into the next message by the quote press; with no selection the page can be picked.
 *  7. Pressing a quote whose part is drawn on this page scrolls to it and marks it, for a quote stored under a region and
 *     for one under the older `reportBlock` name; a quote of something not drawn here is still a link.
 *  8. At 390 the open chat covers the screen, and its back shape puts it away with the page where it was.
 *
 * THE FILMS are taken only when W13Y_CHAT_SPLIT_FILM names a folder outside the checkout: one at 1440x900 in light
 * English and one at 390x844, each under about thirty seconds. THE PICTURES are taken only when W13Y_CHAT_SPLIT_PICTURES
 * names one: the chat shut and open at 1440, 990, 660 and 390, in both themes. Both are of made-up data, and both carry
 * the label that says so.
 *
 * Everything here is made up.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { LEADING, participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { TARGET_ATTRIBUTE, targetAttributeValue } from '../src/shared/targets.ts'
import { THE_SPLIT_FROM, TWO_COLUMNS_FROM } from '../src/web/lib/chat-split.ts'
import { liveApp, openRecordPagesAt, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AGENT = { name: 'Made-up Split Agent', handle: 'made-up-split-agent' }
const AS_THE_AGENT = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle }
const film = process.env.W13Y_CHAT_SPLIT_FILM
const LABEL = 'Made-up data — an invented office, not real office data'
const CALLED = 'the-chat-opens-beside-the-page'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
/** Enough parts that the last of them is well below the first screen. */
const PARTS = 30
/** The width the chat opens at beside the page, the least it goes to, and what it always leaves the page. */
const OPENS_AT = 520
const LEAST = 360
const LEAVES = 480

let app: LiveApp
let agentId = ''
let agentKey = ''
let report = ''
let note = ''

type Size = { width: number; height: number }
const WIDE: Size = { width: 1440, height: 900 }
const PHONE: Size = { width: 390, height: 844 }
/** The width the page changes at, read from the constant so this case moves with the one number. */
const SPLIT_AT = Number(/\d+/.exec(THE_SPLIT_FROM)?.[0])

/** What the person's browser remembers before the first page, once for each window. */
type Start = { with?: string; theme?: 'light' | 'dark'; filmed?: boolean; filmTo?: string }

async function aWindow(size: Size, start: Start = {}): Promise<{ context: BrowserContext; page: Page }> {
  const videoFolder = start.filmTo ?? (start.filmed === true ? film : undefined)
  const context = await app.browser.newContext({
    viewport: size,
    ...(videoFolder === undefined ? {} : { recordVideo: { dir: join(videoFolder, 'films'), size } }),
  })
  await openRecordPagesAt(context, 'full')
  await context.addInitScript(
    ([theme, chatWith]) => {
      if (sessionStorage.getItem('chat-test-set') === 'yes') return
      sessionStorage.setItem('chat-test-set', 'yes')
      localStorage.setItem('mole-office.preset.theme', theme)
      localStorage.setItem('mole-office.language', 'en')
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.chat.open', 'no')
      if (chatWith !== '') localStorage.setItem('mole-office.chat.with', chatWith)
    },
    [start.theme ?? 'light', start.with ?? ''] as const,
  )
  // THE FILM AND THE PICTURES BLUR THE LINE THAT SAYS WHICH MACHINE A MESSAGE WAS WRITTEN ON, because it names the
  // machine this test runs on. The blur draws nothing new and moves nothing.
  await context.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '.px-chat-from { filter: blur(5px); }'
      document.head.append(style)
    })
  })
  const page = await context.newPage()
  return { context, page }
}

/** The selector of one part of the made-up report, as the page draws it. */
function thePart(n: number): string {
  return `[${TARGET_ATTRIBUTE}="${targetAttributeValue({ kind: 'reportBlock', recordId: report, blockId: `b-${String(n)}` })}"]`
}

/** Go to the made-up report and wait until its last part is drawn. */
async function theReport(page: Page): Promise<void> {
  await page.goto(`${app.site}/?lang=en#/r/${report}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector(thePart(PARTS), { state: 'attached', timeout: 30_000 })
}

/** Open the split from the sidebar's Chat row and wait for it to be drawn. */
async function openFromTheSidebar(page: Page): Promise<void> {
  await page.click('.shell-side .shell-chat')
  await page.waitForSelector('aside.px-chat[data-where="split"]', { timeout: 20_000 })
  await page.waitForTimeout(300)
}

/**
 * Wait until every quote in the chat names what it points at. A quote whose record's title has not been read yet
 * draws a word in the title's place, so a picture taken at once showed that word where the report's title belongs.
 */
async function theQuoteNamesAreRead(page: Page, picture: string): Promise<void> {
  const unread = [LEADING.aRecord, LEADING.somewhereUnknown]
  await expect.poll(
    () => page.locator('.px-chat-quote-name').evaluateAll(
      (names, words) => names.filter((one) => words.includes(one.textContent?.trim() ?? '')).length,
      unread,
    ),
    { timeout: 15_000, message: `${picture}: a quote names its record by a word that stands in for a title not read` },
  ).toBe(0)
}

async function box(page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> {
  const its = await page.locator(selector).first().boundingBox()
  if (its === null) throw new Error(`${selector} is not drawn`)
  return { x: Math.round(its.x), y: Math.round(its.y), width: Math.round(its.width), height: Math.round(its.height) }
}

/** What `--measure-read` is in pixels in this window. */
async function theReadingWidth(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement('div')
    // THE WIDTH IS READ FROM THE TOKEN THE PAGE DEFINES, not copied out of the component that draws the page.
    const reading = getComputedStyle(document.documentElement).getPropertyValue('--measure-read').trim()
    probe.style.cssText = `position:absolute;visibility:hidden;width:${reading}`
    document.body.append(probe)
    const wide = probe.getBoundingClientRect().width
    probe.remove()
    return wide
  })
}

/** How wide the page's column is: the shell's page, less its own padding. */
async function thePagesWidth(page: Page): Promise<number> {
  return page.evaluate(() => {
    const it = document.querySelector<HTMLElement>('#main')
    if (it === null) throw new Error('no page')
    const style = getComputedStyle(it)
    return it.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  })
}

async function stored(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key)
}

async function theSplitSide(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute('data-chat-split'))
}

/**
 * THE FRAME AS THE BROWSER DRAWS IT: whether the top bar is shown, and whether the sidebar is standing
 * beside the page or is a drawer. Both are read from the drawn page, never from an attribute this case set.
 * At the wide layout the sidebar is a flex item in the flow; below it, it is fixed and closed until the
 * menu press opens it.
 */
async function theFrame(page: Page): Promise<{ bar: 'shown' | 'hidden'; sidebar: 'beside' | 'drawer' }> {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('.shell-bar')
    const side = document.querySelector<HTMLElement>('.shell-side')
    if (bar === null) throw new Error('the frame draws no top bar')
    if (side === null) throw new Error('the frame draws no sidebar')
    return {
      bar: getComputedStyle(bar).display === 'none' ? 'hidden' : 'shown',
      sidebar: getComputedStyle(side).position === 'fixed' ? 'drawer' : 'beside',
    }
  })
}

/** Whether the open chat sits beside the page or covers the whole screen, read from its drawn box. */
async function theOpenChat(page: Page): Promise<'beside' | 'covering'> {
  return page.evaluate(() => {
    const chat = document.querySelector<HTMLElement>('aside.px-chat[data-where="split"]')
    if (chat === null) throw new Error('the open chat is not drawn')
    const its = chat.getBoundingClientRect()
    const covering =
      Math.abs(its.x) <= 1 &&
      Math.abs(its.y) <= 1 &&
      Math.abs(its.width - window.innerWidth) <= 1 &&
      Math.abs(its.height - window.innerHeight) <= 1
    return covering ? 'covering' : 'beside'
  })
}

/** A point on the seam well below its shapes, where a press drags. */
async function onTheSeam(page: Page): Promise<{ x: number; y: number }> {
  const seam = await box(page, '.px-chat-seam')
  return { x: seam.x + seam.width / 2, y: seam.y + Math.round(seam.height * 0.6) }
}

async function dragTheSeamTo(page: Page, x: number): Promise<void> {
  const from = await onTheSeam(page)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(x, from.y, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}

/** A shape on a press: an svg of 24 by 24, its word in its title and label, and no word drawn but one only a screen reader reads. */
async function isAShape(page: Page, selector: string): Promise<{ title: string; label: string; spoken: string; viewBox: string; drawn: string }> {
  return page.locator(selector).first().evaluate((press) => {
    const shape = press.querySelector('svg')
    const spoken = press.querySelector('.sr-only')
    // THE WORDS A SIGHTED READER SEES are the press's text less what only a screen reader reads.
    const drawn = [...press.childNodes]
      .filter((one) => !(one instanceof Element && one.classList.contains('sr-only')))
      .map((one) => one.textContent ?? '')
      .join('')
      .trim()
    return {
      title: press.getAttribute('title') ?? '',
      label: press.getAttribute('aria-label') ?? '',
      spoken: spoken?.textContent ?? '',
      viewBox: shape?.getAttribute('viewBox') ?? '',
      drawn,
    }
  })
}

async function say(headers: Record<string, string>, data: Record<string, unknown>, expected = 201): Promise<string> {
  const body = String(data.body)
  const said = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data }) })
  expect(said.status, await said.clone().text()).toBe(expected)
  return ((await said.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: CALLED, viewport: WIDE, workspace: 'default', opensAt: 'full' })
  const choice = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: PERSON, body: JSON.stringify({ chatButtonStays: 'when-unread' }) })
  expect(choice.status, await choice.clone().text()).toBe(200)
  const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }) })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const agents = ((await (await fetch(`${app.api}/api/participants`, { headers: PERSON })).json()) as { agents: { id: string; handle: string }[] }).agents
  agentId = agents.find((one) => one.handle === AGENT.handle)?.id ?? ''
  expect(agentId).not.toBe('')
  agentKey = participantKey({ kind: 'agent', id: agentId })
  const blocks = Array.from({ length: PARTS }, (_, at) => {
    const n = at + 1
    return { id: `b-${String(n)}`, type: 'text', heading: `Made-up part ${String(n)}`, text: `Made-up paragraph ${String(n)}. The kiln for part ${String(n)} ran for six hours, and the glaze held on every made-up tile in the batch.` }
  })
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'report', title: 'Made-up kiln report', data: { for: 'Made-up reader', date: '2026-11-10', blocks } }) })
  expect(made.status, await made.clone().text()).toBe(201)
  report = ((await made.json()) as { record: { id: string } }).record.id
  const other = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'note', title: 'Made-up note about the glaze', data: { body: 'made up' } }) })
  expect(other.status, await other.clone().text()).toBe(201)
  note = ((await other.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('1. opening from the sidebar splits the window, and the page keeps its reading width', async () => {
  const { context, page } = await aWindow(WIDE)
  try {
    await theReport(page)
    expect(await page.locator('.px-chat').count(), 'the chat was open before the press').toBe(0)
    await openFromTheSidebar(page)
    expect(await box(page, 'aside.px-chat[data-where="split"]')).toEqual({ x: WIDE.width - OPENS_AT, y: 0, width: OPENS_AT, height: WIDE.height })
    expect(await theSplitSide(page)).toBe('right')
    // NOTHING OVER THE PAGE: the page's column ends where the chat begins.
    const body = await box(page, '.shell-body')
    expect(body.x + body.width).toBe(WIDE.width - OPENS_AT)
    expect(await page.locator('.px-chat-circle').count(), 'the circle was drawn beside an open chat').toBe(0)
    expect(await thePagesWidth(page)).toBeGreaterThanOrEqual(await theReadingWidth(page))
    expect(await stored(page, 'mole-office.chat.open')).toBe('split')
  } finally {
    await context.close()
  }
}, 120_000)

it('2. the seam swaps the sides, sends the chat to its own window, and puts it away, each by a shape', async () => {
  const { context, page } = await aWindow(WIDE)
  try {
    await theReport(page)
    await openFromTheSidebar(page)
    for (const press of ['.px-chat-seam-swap', '.px-chat-seam-window', '.px-chat-seam-away']) {
      const shape = await isAShape(page, press)
      expect(shape.viewBox, `${press} draws no shape of 24 by 24`).toBe('0 0 24 24')
      expect(shape.drawn, `${press} draws a word`).toBe('')
      expect(shape.title, `${press} has no title`).not.toBe('')
      expect([shape.label, shape.spoken], `${press} says different words`).toEqual([shape.title, shape.title])
    }
    await page.click('.px-chat-seam-swap')
    await page.waitForFunction(() => document.documentElement.getAttribute('data-chat-split') === 'left')
    await page.waitForTimeout(300)
    const side = await box(page, '.shell-side')
    const left = await box(page, 'aside.px-chat[data-where="split"]')
    expect(left.x, 'the chat on the left is not beside the sidebar').toBe(side.x + side.width)
    expect((await box(page, '.shell-body')).x, 'the page does not begin where the chat ends').toBe(left.x + left.width)
    expect(await stored(page, 'mole-office.chat.split-side')).toBe('left')
    await page.click('.px-chat-seam-swap')
    await page.waitForFunction(() => document.documentElement.getAttribute('data-chat-split') === 'right')

    await page.click('.px-chat-seam-window')
    await page.waitForSelector('aside.px-chat[data-where="corner"]', { timeout: 10_000 })
    expect(await theSplitSide(page), 'the page kept the split in window mode').toBeNull()
    expect(await stored(page, 'mole-office.chat.open')).toBe('yes')
    // BACK BESIDE THE PAGE, by the shape the window's own row carries.
    await page.click('.px-chat-beside')
    await page.waitForSelector('aside.px-chat[data-where="split"]', { timeout: 10_000 })

    await page.click('.px-chat-seam-away')
    await page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })
    expect(await theSplitSide(page)).toBeNull()
    expect(await stored(page, 'mole-office.chat.open')).toBe('no')
  } finally {
    await context.close()
  }
}, 120_000)

it('3. dragging the seam changes the width inside its limits, and a double-click gives the page its reading width', async () => {
  const { context, page } = await aWindow(WIDE)
  try {
    await theReport(page)
    await openFromTheSidebar(page)
    const pane = 'aside.px-chat[data-where="split"]'
    const from = await onTheSeam(page)
    await dragTheSeamTo(page, from.x - 200)
    expect((await box(page, pane)).width).toBe(OPENS_AT + 200)
    expect(await stored(page, 'mole-office.chat.split-width')).toBe(String(OPENS_AT + 200))
    await dragTheSeamTo(page, 5)
    expect((await box(page, pane)).width, 'the chat went wider than the window less what it leaves the page').toBe(WIDE.width - LEAVES)
    await dragTheSeamTo(page, WIDE.width - 5)
    expect((await box(page, pane)).width, 'the chat went narrower than the least').toBe(LEAST)

    const at = await onTheSeam(page)
    await page.mouse.dblclick(at.x, at.y)
    await page.waitForTimeout(300)
    expect(Math.abs((await thePagesWidth(page)) - (await theReadingWidth(page))), 'the page is not at its reading width').toBeLessThanOrEqual(1)
    const width = (await box(page, pane)).width
    expect(await stored(page, 'mole-office.chat.split-width')).toBe(String(width))
    // THE WIDTH IS REMEMBERED across a reload.
    await theReport(page)
    await page.waitForSelector(pane, { timeout: 20_000 })
    expect((await box(page, pane)).width).toBe(width)
  } finally {
    await context.close()
  }
}, 120_000)

it('4. the sidebar folds while the split is open, and what it remembers does not change', async () => {
  const { context, page } = await aWindow(WIDE)
  try {
    await theReport(page)
    const remembered = await stored(page, 'mole-office.shell.sidebar')
    const was = await page.getAttribute('.shell-side', 'data-state')
    expect(was).toBe('expanded')
    await openFromTheSidebar(page)
    expect(await page.getAttribute('.shell-side', 'data-state')).toBe('collapsed')
    expect(await stored(page, 'mole-office.shell.sidebar')).toBe(remembered)
    await page.click('.px-chat-seam-window')
    await page.waitForSelector('aside.px-chat[data-where="corner"]', { timeout: 10_000 })
    expect(await page.getAttribute('.shell-side', 'data-state'), 'the sidebar stayed folded beside the window').toBe('expanded')
    await page.click('.px-chat-beside')
    await page.waitForSelector('aside.px-chat[data-where="split"]', { timeout: 10_000 })
    expect(await page.getAttribute('.shell-side', 'data-state')).toBe('collapsed')
    await page.click('.px-chat-seam-away')
    await page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })
    expect(await page.getAttribute('.shell-side', 'data-state')).toBe('expanded')
    expect(await stored(page, 'mole-office.shell.sidebar')).toBe(remembered)
  } finally {
    await context.close()
  }
}, 120_000)

it('5. the circle is drawn only while the chat is shut and a message waits, never on a phone, and the row or the bar carries the count otherwise', async () => {
  const { context, page } = await aWindow(WIDE)
  const phone = await aWindow(PHONE)
  try {
    await theReport(page)
    await page.waitForTimeout(2_000)
    expect(await page.locator('.px-chat-circle').count(), 'the circle was drawn with nothing waiting').toBe(0)
    expect(await page.locator('.shell-side .shell-chat .shell-chat-count').count(), 'the row drew a count with nothing waiting').toBe(0)

    await say(AS_THE_AGENT, { body: 'Made-up line for the circle.', to: [{ kind: 'person', id: THE_PERSON }] })
    await page.waitForSelector('.px-chat-circle', { timeout: 30_000 })
    expect(await page.locator('.px-chat-circle').innerText()).toContain('1')
    expect(await page.locator('.shell-side .shell-chat .shell-chat-count').count(), 'the row repeated the circle\'s count').toBe(0)

    // A PRESS ON THE CIRCLE OPENS THE SPLIT, and then the row carries the count.
    await page.click('.px-chat-circle')
    await page.waitForSelector('aside.px-chat[data-where="split"]', { timeout: 10_000 })
    expect(await page.locator('.px-chat-circle').count(), 'the circle stayed beside the open chat').toBe(0)
    await page.waitForSelector('.shell-side .shell-chat .shell-chat-count', { timeout: 10_000 })
    expect(await page.locator('.shell-side .shell-chat .shell-chat-count').innerText()).toBe('1')
    await page.click('.px-chat-seam-away')
    await page.waitForSelector('.px-chat-circle', { timeout: 10_000 })

    await theReport(phone.page)
    await phone.page.waitForSelector('.shell-bar .shell-chat-phone .shell-chat-count', { timeout: 30_000 })
    expect(await phone.page.locator('.shell-bar .shell-chat-phone .shell-chat-count').innerText()).toBe('1')
    await phone.page.waitForTimeout(1_000)
    expect(await phone.page.locator('.px-chat-circle').count(), 'the circle was drawn on a phone').toBe(0)
  } finally {
    await phone.context.close()
    await context.close()
  }
}, 120_000)

it('6. the quote press carries selected words and offers a page to pick when none are selected', async () => {
  const { context, page } = await aWindow(WIDE, { with: agentKey })
  try {
    await theReport(page)
    await openFromTheSidebar(page)
    const press = '.px-chat-quote-press'
    await page.waitForSelector(press, { timeout: 20_000 })
    expect(await page.locator(`${press} [aria-hidden="true"]`).textContent()).toBe('"')
    expect(await page.locator(press).getAttribute('title')).toBe(t('chat.quote.press'))

    await page.click(press)
    await expect.poll(() => page.locator(press).getAttribute('aria-pressed')).toBe('true')
    await expect.poll(() => page.locator('html').getAttribute('data-pointing')).toBe('1')
    expect(await page.locator('.px-chat-quote-chip').count()).toBe(0)
    await page.keyboard.press('Escape')
    await expect.poll(() => page.locator('html').getAttribute('data-pointing')).not.toBe('1')

    const words = 'kiln for part 2 ran for six hours'
    const select = async (): Promise<void> => {
      await page.locator(thePart(2)).evaluate((part, wanted) => {
        const walker = document.createTreeWalker(part, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          const at = (node.textContent ?? '').indexOf(wanted)
          if (at < 0) continue
          const range = document.createRange()
          range.setStart(node, at)
          range.setEnd(node, at + wanted.length)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
          return
        }
        throw new Error('the words are not in the part')
      }, words)
    }
    await select()
    await page.click(press)
    await page.waitForSelector('.px-chat-quote-chip', { timeout: 5_000 })
    expect(await page.locator('.px-chat-quote-chip').innerText()).toContain(words)
    // THE CROSS TAKES THE QUOTE BACK OUT.
    await page.click('.px-chat-quote-chip-out')
    await page.waitForSelector('.px-chat-quote-chip', { state: 'detached', timeout: 5_000 })

    const before = 'Made-up lead. '
    await page.fill('.px-chat-write textarea', before)
    await page.locator('.px-chat-write textarea').press('End')
    await select()
    await page.click(press)
    const editor = page.locator('.px-chat-write [contenteditable=true]')
    await editor.locator('.px-chat-quote-chip').waitFor({ timeout: 5_000 })
    const composed = await editor.innerText()
    expect(composed.indexOf(before.trim())).toBeLessThan(composed.indexOf(words))
    const body = 'Made-up question about part two.'
    await editor.focus()
    await editor.press('End')
    await editor.pressSequentially(body)
    await page.click('.px-chat-send')
    await page.waitForSelector('.px-chat-quote-chip', { state: 'detached', timeout: 10_000 })
    const sent = page.locator('.px-chat-one', { hasText: body }).last()
    await expect.poll(async () => {
      const text = await sent.innerText()
      return text.indexOf(before.trim()) < text.indexOf(words) && text.indexOf(words) < text.indexOf(body)
    }).toBe(true)

    let quotes: { target: Record<string, unknown>; place?: { at: string; span?: { quote: string } } }[] = []
    await expect
      .poll(
        async () => {
          const listed = await fetch(`${app.api}/api/records?kind=message&shape=full`, { headers: PERSON })
          const { records } = (await listed.json()) as { records: { data: { body?: unknown; quotes?: typeof quotes } }[] }
          quotes = records.find((one) => one.data.body === before + body)?.data.quotes ?? []
          return quotes.length
        },
        { timeout: 20_000 },
      )
      .toBe(1)
    expect(quotes[0]?.target).toEqual({ kind: 'region', recordId: report, regionId: 'data.blocks[#b-2].text@0' })
    expect(quotes[0]?.place?.at).toBe('words')
    expect(quotes[0]?.place?.span?.quote).toBe(words)
  } finally {
    await context.close()
  }
}, 120_000)

it('7. a quote of a part drawn on this page scrolls to it and marks it, under either name; any other quote is a link', async () => {
  const quoted = 'kiln for part 27 ran'
  await say(AS_THE_AGENT, {
    body: 'Made-up note about part 27.',
    to: [{ kind: 'person', id: THE_PERSON }],
    quotes: [{ target: { kind: 'region', recordId: report, regionId: 'data.blocks[#b-27]' }, place: { at: 'quote', words: quoted } }],
  })
  await say(AS_THE_AGENT, {
    body: 'Made-up note about part 28.',
    to: [{ kind: 'person', id: THE_PERSON }],
    quotes: [{ target: { kind: 'region', recordId: report, regionId: 'data.blocks[#b-28]' } }],
  })
  await say(AS_THE_AGENT, {
    body: 'Made-up note about the glaze note.',
    to: [{ kind: 'person', id: THE_PERSON }],
    quotes: [{ target: { kind: 'record', recordId: note, workspaceId: 'default' } }],
  })
  const { context, page } = await aWindow(WIDE, { with: agentKey })
  try {
    // A QUOTE STORED UNDER THE OLDER NAME. The write door now stores every quote of a report's block as the region it
    // is, so a row under `reportBlock` is one written before that, and this browser is handed the part-28 quote as such
    // a row would be read.
    await page.route('**/api/messages/conversation**', async (route) => {
      const answer = await route.fetch()
      const read = (await answer.json()) as unknown
      const older = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(older)
        if (typeof value !== 'object' || value === null) return value
        const one = value as Record<string, unknown>
        if (one.kind === 'region' && one.recordId === report && one.regionId === 'data.blocks[#b-28]') return { kind: 'reportBlock', recordId: report, blockId: 'b-28' }
        return Object.fromEntries(Object.entries(one).map(([key, inside]) => [key, older(inside)]))
      }
      await route.fulfill({ response: answer, json: older(read) })
    })
    await theReport(page)
    const address = await page.evaluate(() => location.hash)
    await openFromTheSidebar(page)
    const link = (about: string): string => `.px-chat-said > li:has-text("${about}") a.px-chat-quote-link`
    await page.waitForSelector(link('about the glaze note'), { timeout: 30_000 })

    const inView = async (n: number): Promise<boolean> =>
      page.locator(thePart(n)).evaluate((part) => {
        const its = part.getBoundingClientRect()
        return its.top >= 0 && its.top < window.innerHeight
      })
    expect(await inView(27), 'part 27 was on the screen before the press').toBe(false)
    await page.click(link('about part 27'))
    await page.waitForFunction((part) => document.querySelector(part)?.hasAttribute('data-quote-landed') === true, thePart(27), { timeout: 5_000 })
    await page.waitForTimeout(1_000)
    expect(await inView(27), 'part 27 was not scrolled into view').toBe(true)
    expect(await page.evaluate(() => location.hash), 'the press left the page').toBe(address)
    const lit = await page.evaluate(() => {
      const highlights = (CSS as unknown as { highlights?: Map<string, Set<Range>> }).highlights
      return [...(highlights?.get('px-chat-quote-landed') ?? [])].map((range) => range.toString())
    })
    expect(lit, 'the quoted words were not lit').toEqual([quoted])
    await page.waitForFunction((part) => document.querySelector(part)?.hasAttribute('data-quote-landed') === false, thePart(27), { timeout: 5_000 })

    await page.click(link('about part 28'))
    await page.waitForFunction((part) => document.querySelector(part)?.hasAttribute('data-quote-landed') === true, thePart(28), { timeout: 5_000 })
    expect(await page.evaluate(() => location.hash)).toBe(address)

    await page.click(link('about the glaze note'))
    await page.waitForFunction((was) => location.hash !== was, address, { timeout: 10_000 })
    expect(await page.evaluate(() => location.hash)).toContain(note)
  } finally {
    await context.close()
  }
}, 120_000)

it('8. at 390 the open chat covers the screen, and its back shape returns to the page where it was', async () => {
  const { context, page } = await aWindow(PHONE, { with: agentKey })
  try {
    await theReport(page)
    await page.evaluate(() => {
      window.scrollTo(0, 900)
    })
    await page.waitForTimeout(400)
    const was = await page.evaluate(() => window.scrollY)
    expect(was, 'the page did not scroll, so this case proves nothing').toBeGreaterThan(0)
    await page.click('.shell-bar .shell-chat-phone')
    await page.waitForSelector('aside.px-chat[data-where="split"]', { timeout: 10_000 })
    expect(await box(page, 'aside.px-chat')).toEqual({ x: 0, y: 0, width: PHONE.width, height: PHONE.height })
    const seam = await box(page, '.px-chat-seam')
    expect([seam.x, seam.y, seam.width], 'the seam is not the bar across the top').toEqual([0, 0, PHONE.width])
    expect(await page.locator('.px-chat-seam-swap, .px-chat-seam-window').count(), 'the phone drew the seam\'s wide shapes').toBe(0)
    const back = await isAShape(page, '.px-chat-seam-back')
    expect(back.viewBox).toBe('0 0 24 24')
    expect(back.drawn).toBe('')
    await page.click('.px-chat-seam-back')
    await page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })
    expect(await page.evaluate(() => window.scrollY), 'the page was not where it was left').toBe(was)
    expect(await stored(page, 'mole-office.chat.open')).toBe('no')
  } finally {
    await context.close()
  }
}, 120_000)

it('9. at the split width and one pixel below it, the chat and the frame agree on narrow or wide', async () => {
  // ONE PIXEL EITHER SIDE OF THE ONE NUMBER. The 990 and 1440 pictures do not reach the boundary, and
  // a frame that still says 1024 while the chat says something else draws two layouts here.
  for (const width of [SPLIT_AT - 1, SPLIT_AT]) {
    const narrow = width < SPLIT_AT
    const { context, page } = await aWindow({ width, height: 900 })
    try {
      await theReport(page)
      expect(await theFrame(page), `${String(width)} drew the wrong frame before the chat opened`).toEqual({
        bar: narrow ? 'shown' : 'hidden',
        sidebar: narrow ? 'drawer' : 'beside',
      })
      await page.click(narrow ? '.shell-bar .shell-chat-phone' : '.shell-side .shell-chat')
      await page.waitForSelector('aside.px-chat[data-where="split"]', { timeout: 20_000 })
      await page.waitForTimeout(300)
      expect(await theOpenChat(page), `${String(width)} drew the wrong open chat`).toBe(narrow ? 'covering' : 'beside')
      expect(await theFrame(page), `${String(width)} drew the wrong frame beside the open chat`).toEqual({
        bar: narrow ? 'shown' : 'hidden',
        sidebar: narrow ? 'drawer' : 'beside',
      })
    } finally {
      await context.close()
    }
  }
}, 240_000)

const PICKED_GROUP = 'Made-up group for picking'
const PICKED_OTHER = { name: 'Made-up Second Agent', handle: 'made-up-second-agent' }
const GROUP_LINE = 'Made-up group line for picking.'
const CONTACT_LINE = 'Made-up contact line for picking.'
const BETWEEN_LINE = 'Made-up agents line for picking.'
let pickedFixture: Promise<void> | undefined

function preparePickedConversations(): Promise<void> {
  pickedFixture ??= (async () => {
    const other = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'agent', title: PICKED_OTHER.name, data: { handle: PICKED_OTHER.handle, runtime: 'claude-code', state: 'active' } }) })
    expect(other.status, await other.clone().text()).toBe(201)
    const group = await fetch(`${app.api}/api/groups`, { method: 'POST', headers: PERSON, body: JSON.stringify({
      name: PICKED_GROUP,
      because: 'Made-up conversations for the test.',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'Made-up member.' },
        { who: { kind: 'agent', id: agentId }, because: 'Made-up member.' },
      ],
    }) })
    expect(group.status, await group.clone().text()).toBe(201)
    const groupId = ((await group.json()) as { group: { id: string } }).group.id
    await say(PERSON, { body: GROUP_LINE, toGroup: groupId })
    await say(AS_THE_AGENT, { body: CONTACT_LINE, to: [{ kind: 'person', id: THE_PERSON }] })
    // NOTHING HOLDS THE SECOND AGENT IN THE TEST OFFICE, so the office stores this line, routes it and answers 409. The
    // line is stored all the same, and the between-agents conversation shows it.
    await say(AS_THE_AGENT, { body: BETWEEN_LINE, to: [{ kind: 'agent', id: PICKED_OTHER.handle }] }, 409)
  })()
  return pickedFixture
}

it.each([
  ['split', 'contact'], ['split', 'between'], ['window', 'contact'], ['window', 'between'],
] as const)('shows the picked %s %s conversation after a group', async (where, target) => {
  await preparePickedConversations()
  const filmTo = where === 'split' && target === 'contact' ? process.env.W13Y_CHAT_PICK_FILM : undefined
  const theme = process.env.W13Y_CHAT_PICK_THEME === 'dark' ? 'dark' : 'light'
  const { context, page } = await aWindow(WIDE, { filmTo, theme })
  try {
    await context.addInitScript(() => localStorage.setItem('mole-office.chat.size', '800x700'))
    await theReport(page)
    if (filmTo !== undefined) expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
    if (filmTo !== undefined) await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
    await openFromTheSidebar(page)
    if (where === 'split') await dragTheSeamTo(page, WIDE.width - 800)
    else {
      await page.click('.px-chat-seam-window')
      await page.locator('aside.px-chat[data-where="corner"]').waitFor({ timeout: 20_000 })
    }
    await page.locator('.px-chat-columns[data-columns="two"]').waitFor({ timeout: 20_000 })
    await page.click('.px-chat-tab[data-tab="groups"]')
    await page.locator('.px-chat-contact').filter({ hasText: PICKED_GROUP }).click({ timeout: 20_000 })
    const conversation = page.locator('.px-chat-columns-talk')
    await conversation.getByText(GROUP_LINE, { exact: false }).waitFor({ timeout: 20_000 })
    await page.click(`.px-chat-tab[data-tab="${target === 'contact' ? 'contacts' : 'between'}"]`)
    const row = target === 'contact'
      ? page.locator(`.px-chat-contact[data-contact="${agentKey}"]`)
      : page.locator('.px-chat-contact').filter({ hasText: PICKED_OTHER.name })
    await row.first().click({ timeout: 20_000 })
    await conversation.getByText(target === 'contact' ? CONTACT_LINE : BETWEEN_LINE, { exact: false }).waitFor({ timeout: 10_000 })
    expect(await conversation.getByText(GROUP_LINE, { exact: false }).count()).toBe(0)
  } finally {
    await context.close()
  }
}, 180_000)

it('keeps a layout choice on a person and refuses an invalid combined change', async () => {
  const person = `${app.api}/api/participants/person/${THE_PERSON}`
  const readPerson = async (): Promise<{ state: string | null; chatLayout: string | null }> => {
    const reply = await fetch(person, { headers: PERSON })
    expect(reply.status).toBe(200)
    return ((await reply.json()) as { participant: { state: string | null; chatLayout: string | null } }).participant
  }
  const before = await readPerson()
  try {
    const clear = await fetch(person, { method: 'PATCH', headers: PERSON, body: JSON.stringify({ chatLayout: '' }) })
    expect(clear.status).toBe(200)
    expect((await readPerson()).chatLayout).toBeNull()
    const invalid = await fetch(person, {
      method: 'PATCH', headers: PERSON, body: JSON.stringify({ state: 'Made-up different status', chatLayout: 'sideways' }),
    })
    expect(invalid.status).toBe(400)
    const after = await readPerson()
    expect(after.state).toBe(before.state)
    expect(after.chatLayout).toBeNull()
    const agent = await fetch(`${app.api}/api/participants/agent/${agentId}`, {
      method: 'PATCH', headers: PERSON, body: JSON.stringify({ chatLayout: 'one' }),
    })
    expect(agent.status).toBe(403)
  } finally {
    await fetch(person, { method: 'PATCH', headers: PERSON, body: JSON.stringify({ state: before.state ?? '', chatLayout: before.chatLayout ?? '' }) })
  }
}, 120_000)

it('switches between one and two columns and keeps the choice for the person', async () => {
  const clearChoice = () => fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: PERSON, body: JSON.stringify({ chatLayout: '' }),
  })
  const first = await aWindow(WIDE, { with: agentKey })
  let other: Awaited<ReturnType<typeof aWindow>> | undefined
  try {
    await theReport(first.page)
    await openFromTheSidebar(first.page)
    await dragTheSeamTo(first.page, WIDE.width - 800)
    const columns = first.page.locator('.px-chat-columns')
    const toggle = first.page.locator('.px-chat-layout-toggle')
    await columns.locator('.px-chat-them').waitFor({ timeout: 30_000 })
    await expect.poll(() => columns.getAttribute('data-columns')).toBe('two')
    expect(await toggle.getAttribute('title')).toBe(t('chat.layout.single'))
    await toggle.click()
    await expect.poll(() => columns.getAttribute('data-columns')).toBe('one')
    expect(await columns.locator('.px-chat-columns-lists').count()).toBe(0)
    await columns.locator('.px-chat-back').click()
    await columns.locator('.px-chat-columns-lists').waitFor({ timeout: 20_000 })
    await columns.locator(`.px-chat-contact[data-contact="${agentKey}"]`).click()
    await columns.locator('.px-chat-them').waitFor({ timeout: 20_000 })
    expect(await toggle.getAttribute('title')).toBe(t('chat.layout.sideBySide'))
    await toggle.click()
    await expect.poll(() => columns.getAttribute('data-columns')).toBe('two')
    await columns.locator('.px-chat-columns-lists').waitFor({ timeout: 20_000 })
    await toggle.click()
    await expect.poll(async () => {
      const reply = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { headers: PERSON })
      return ((await reply.json()) as { participant: { chatLayout?: string | null } }).participant.chatLayout
    }, { timeout: 20_000 }).toBe('one')
    other = await aWindow(WIDE, { with: agentKey })
    await theReport(other.page)
    await openFromTheSidebar(other.page)
    await dragTheSeamTo(other.page, WIDE.width - 800)
    await expect.poll(() => other!.page.locator('.px-chat-columns').getAttribute('data-columns')).toBe('one')
    // The same person's choice also applies to the chat's own page.
    await other.page.evaluate(() => { location.hash = '#/chat' })
    const pageChat = other.page.locator('.px-chat[data-where="page"]')
    const pagePanes = pageChat.locator('.px-chat-page-panes')
    await pagePanes.waitFor({ timeout: 30_000 })
    await expect.poll(() => pagePanes.getAttribute('data-columns')).toBe('one')
    await pageChat.locator('.px-chat-them .px-chat-back').click()
    await expect.poll(() => pageChat.locator('.px-chat-page-lists').isVisible()).toBe(true)
    await pageChat.locator(`.px-chat-contact[data-contact="${agentKey}"]`).click()
    await expect.poll(() => pageChat.locator('.px-chat-page-talk').isVisible()).toBe(true)
    await pageChat.locator('.px-chat-layout-toggle').click()
    await expect.poll(() => pagePanes.getAttribute('data-columns')).toBe('two')
    await expect.poll(() => pageChat.locator('.px-chat-page-lists').isVisible()).toBe(true)
    await expect.poll(() => pageChat.locator('.px-chat-page-talk').isVisible()).toBe(true)
  } finally {
    await other?.context.close()
    await first.context.close()
    await clearChoice()
  }
}, 240_000)

/** Save two columns, then put back the person's choices after a narrow-frame case. */
async function withTwoColumnsForThisCase(run: () => Promise<void>): Promise<void> {
  const person = `${app.api}/api/participants/person/${THE_PERSON}`
  const read = await fetch(person, { headers: PERSON })
  expect(read.status).toBe(200)
  const before = ((await read.json()) as { participant: { chatLayout: string | null; chatButtonStays: string | null; chatOpensAs: string | null } }).participant
  const change = (body: Record<string, string>) => fetch(person, { method: 'PATCH', headers: PERSON, body: JSON.stringify(body) })
  const saved = await change({ chatLayout: 'two', chatButtonStays: 'always', chatOpensAs: 'window' })
  expect(saved.status).toBe(200)
  try { await run() } finally {
    await change({ chatLayout: before.chatLayout ?? '', chatButtonStays: before.chatButtonStays ?? '', chatOpensAs: before.chatOpensAs ?? '' })
  }
}

it('a saved side-by-side choice leaves the phone chat page in one column', async () => {
  await withTwoColumnsForThisCase(async () => {
    const { context, page } = await aWindow(PHONE, { with: agentKey })
    try {
      await page.goto(`${app.site}/?lang=en#/chat`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      const chat = page.locator('.px-chat[data-where="page"]')
      const panes = chat.locator('.px-chat-page-panes')
      await panes.waitFor({ timeout: 30_000 })
      await chat.locator('.px-chat-them').waitFor({ timeout: 30_000 })
      await expect.poll(() => panes.getAttribute('data-columns')).toBe('one')
      expect(await chat.locator('.px-chat-layout-toggle').count()).toBe(0)
      expect(await chat.locator('.px-chat-page-lists').isVisible()).toBe(false)
      expect(await chat.locator('.px-chat-page-talk').isVisible()).toBe(true)
      await chat.locator('.px-chat-them .px-chat-back').click()
      expect(await chat.locator('.px-chat-page-lists').isVisible()).toBe(true)
      expect(await chat.locator('.px-chat-page-talk').isVisible()).toBe(false)
    } finally { await context.close() }
  })
}, 180_000)

it('a saved side-by-side choice leaves a narrow corner window in one column', async () => {
  await withTwoColumnsForThisCase(async () => {
    const { context, page } = await aWindow(WIDE, { with: agentKey })
    try {
      await theReport(page)
      await page.locator('.px-chat-circle').click({ timeout: 30_000 })
      const chat = page.locator('aside.px-chat[data-where="corner"]')
      const columns = chat.locator('.px-chat-columns')
      await chat.locator('.px-chat-them').waitFor({ timeout: 30_000 })
      expect((await chat.boundingBox())!.width).toBeLessThan(TWO_COLUMNS_FROM)
      await expect.poll(() => columns.getAttribute('data-columns')).toBe('one')
      expect(await chat.locator('.px-chat-layout-toggle').count()).toBe(0)
      expect(await columns.locator('.px-chat-columns-lists').count()).toBe(0)
      await columns.locator('.px-chat-them .px-chat-back').click()
      expect(await columns.locator('.px-chat-columns-lists').isVisible()).toBe(true)
      expect(await columns.locator('.px-chat-columns-talk').count()).toBe(0)
    } finally { await context.close() }
  })
}, 180_000)

it.runIf(process.env.W13Y_CHAT_LAYOUT_PICTURES)('photographs the layout choices where they fit at each width and theme', async () => {
  const folder = process.env.W13Y_CHAT_LAYOUT_PICTURES
  if (folder === undefined) throw new Error('The picture directory is missing')
  mkdirSync(folder, { recursive: true })
  try {
    for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark'] as const) {
      const clear = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
        method: 'PATCH', headers: PERSON, body: JSON.stringify({ chatLayout: '' }),
      })
      expect(clear.status).toBe(200)
      const { context, page } = await aWindow({ width, height: width === 390 ? 844 : 900 }, { with: agentKey, theme })
      try {
        await theReport(page)
        await page.click(width >= SPLIT_AT ? '.shell-side .shell-chat' : '.shell-bar .shell-chat-phone')
        await page.locator('aside.px-chat[data-where="split"]').waitFor({ timeout: 20_000 })
        if (width >= SPLIT_AT) await dragTheSeamTo(page, width - 800)
        const columns = page.locator('.px-chat-columns')
        const toggle = page.locator('.px-chat-layout-toggle')
        await columns.locator('.px-chat-them').waitFor({ timeout: 30_000 })
        await putTheMadeUpLabelIn(page, LABEL, width >= SPLIT_AT ? page.locator(THE_PAGE_TOP).first() : columns, CALLED)
        expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
        if (width < TWO_COLUMNS_FROM) {
          await expect.poll(() => columns.getAttribute('data-columns')).toBe('one')
          expect(await toggle.count()).toBe(0)
          await theQuoteNamesAreRead(page, `one-conversation-${String(width)}-${theme}`)
          await page.mouse.move(-1, -1)
          await page.screenshot({ path: join(folder, `one-conversation-${String(width)}-${theme}.png`) })
          await columns.locator('.px-chat-them .px-chat-back').click()
          await columns.locator('.px-chat-columns-lists').waitFor({ timeout: 20_000 })
          await theQuoteNamesAreRead(page, `one-list-${String(width)}-${theme}`)
          await page.mouse.move(-1, -1)
          await page.screenshot({ path: join(folder, `one-list-${String(width)}-${theme}.png`) })
        } else {
          if (await columns.getAttribute('data-columns') !== 'two') await toggle.click()
          await expect.poll(() => columns.getAttribute('data-columns')).toBe('two')
          await theQuoteNamesAreRead(page, `two-${String(width)}-${theme}`)
          await page.mouse.move(-1, -1)
          await page.screenshot({ path: join(folder, `two-${String(width)}-${theme}.png`) })
          await toggle.click()
          await expect.poll(() => columns.getAttribute('data-columns')).toBe('one')
          await theQuoteNamesAreRead(page, `one-${String(width)}-${theme}`)
          await page.mouse.move(-1, -1)
          await page.screenshot({ path: join(folder, `one-${String(width)}-${theme}.png`) })
        }
      } finally {
        await context.close()
      }
    }
  } finally {
    await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: PERSON, body: JSON.stringify({ chatLayout: '' }) })
  }
}, 600_000)
