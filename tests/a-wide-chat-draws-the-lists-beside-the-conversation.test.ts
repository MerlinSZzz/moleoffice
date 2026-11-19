// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WIDE CHAT DRAWS THE LISTS BESIDE THE CONVERSATION. Wave 13y round 166, package CR, item CR-4.
 *
 * The chat beside the page, or its window, draws the contacts on the left and the open
 * conversation on the right once it is wide enough, the same drawing as the chat page. Before this round the chat drew
 * one column at every width: the lists, or the conversation with a back press to the lists.
 *
 * THE WIDTH IS THE CHAT'S OWN, from `TWO_COLUMNS_FROM` in src/web/lib/chat-split.ts: the width of the chat beside the
 * page, seam included, or of its window. Narrower, it draws one column as before. In a real browser against a Mole
 * Office of its own:
 *  1. Beside the page at 1440, on the right and on the left. The chat opens at its starting width in one column, on a
 *     conversation read some way up. Dragging the seam to that width draws two columns: the lists on the left, the same
 *     conversation on the right, no narrower than the chat beside the page draws a conversation at its narrowest, and
 *     the message being read at the same height. One pixel narrower draws one column again, with the same conversation
 *     and the same place.
 *  2. Beside the page at 2560: the same, at the starting width and at a width far past the change.
 *  3. The window at 1440: at its starting size one column; filling the window two columns, with the same conversation;
 *     back to its size one column again, with the same conversation. Then, read some way up one pixel short of the
 *     width and dragged by its left edge across it, two columns with the same place, and one pixel back, one column
 *     with the same place. Filling the window and folding it back put the list at its newest message before this
 *     change as well, which is a problem of its own, so the place is not asked there.
 *  4. With no conversation open, two columns draw the lists on the left and nothing on the right. A contact row opens
 *     its conversation on the right while the lists stay, and the conversation's back press leaves the lists.
 *  5. Below the split width the chat covers the screen: at 990 it is wider than the width and draws two columns; at 660
 *     and at 390 it draws one.
 *  6. The chat page still draws its own two panes, and nothing of the chat beside the page. This case passed before the
 *     change too.
 *  7. The window filled, folded back, and dragged across the width and back: every frame the chat paints has the
 *     column count its width calls for, and none has the count of the width it had a moment before.
 *
 * THE PICTURES are taken only when W13Y_CHAT_COLUMNS names a folder outside the checkout: beside the page at 1440 and
 * 2560 on either side, the window filling 1440, and the covering chat at 990, 660 and 390, light and dark. They are
 * made-up data, and each carries the label that says so. The picture case asks nothing, so it photographs the code
 * before this change as well.
 *
 * Everything here is made up.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { SPLIT_WIDTH_LEAST, SPLIT_WIDTH_TO_START_WITH, TWO_COLUMNS_FROM } from '../src/web/lib/chat-split.ts'
import { liveApp, waitForThePage, theAnswerToAWriteInATestOffice, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/** Three made-up agents. The first conversation is long enough to be read some way up. */
const AGENTS = [
  { name: 'Made-up Kiln Keeper', handle: 'made-up-kiln-keeper', messages: 90 },
  { name: 'Made-up Loom Keeper', handle: 'made-up-loom-keeper', messages: 4 },
  { name: 'Made-up Quill Keeper', handle: 'made-up-quill-keeper', messages: 2 },
] as const
type Agent = (typeof AGENTS)[number]
const [KILN, LOOM] = AGENTS
const output = process.env.W13Y_CHAT_COLUMNS
const LABEL = 'Made-up data — an invented office, not real office data'
/** The label goes above Home's heading, unless the chat covers it; then above the conversation's own head. */
const HOMES_HEADING = '.hm-page-head'
/** The chat beside the page or in its own window, and not the chat page. */
const SIDE = '.px-chat:not([data-where="page"])'
const SPLIT = '.px-chat[data-where="split"]'
const WINDOW = '.px-chat[data-where="corner"]'
/** How near the message has to come back to where it was, in pixels. */
const SAME_HEIGHT_PX = 2
/** Eight pixels is the bottom, as the chat itself counts it. */
const BOTTOM_PX = 8
/** The widths the pictures draw the chat beside the page at: past the change at each window width. */
const PICTURED_AT = { 1440: 860, 2560: 1100 } as const

type Where = 'right' | 'left' | 'window'
type Box = { x: number; y: number; width: number; height: number }

let app: LiveApp
const ids = new Map<string, string>()
const keyOf = (agent: Agent): string => participantKey({ kind: 'agent', id: ids.get(agent.handle) ?? '' })
const asThe = (agent: Agent): Record<string, string> => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent.handle })

async function say(headers: Record<string, string>, body: string, to: { kind: string; id: string }): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [to] } }) })
  expect(said.status, await said.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, { kind: 'message', data: { to: [to] } }))
}

/** Every third line is long, so the rows differ in height and wrap again when the conversation narrows. */
function aLine(agent: Agent, n: number): string {
  const long = n % 3 === 0 ? ' The made-up log for this line runs on, so the row takes three or four lines of the chat and the list is long enough to scroll a good way.' : ''
  return `Made-up line ${String(n)} with ${agent.name}.${long}`
}

/** A browser window with the chat open beside the page on one side, or in its own window, on a conversation or on the lists. */
async function aWindow(size: { width: number; height: number }, where: Where, start: { theme?: 'light' | 'dark'; on?: Agent | null } = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: size, colorScheme: start.theme ?? 'light' })
  // SET ONCE IN THIS WINDOW, so a reload keeps what the chat itself wrote since.
  await context.addInitScript(
    ([theme, open, side, key]) => {
      if (sessionStorage.getItem('chat-test-set') === 'yes') return
      sessionStorage.setItem('chat-test-set', 'yes')
      localStorage.setItem('mole-office.preset.theme', theme)
      localStorage.setItem('mole-office.language', 'en')
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.chat.open', open)
      localStorage.setItem('mole-office.chat.split-side', side)
      localStorage.setItem('mole-office.chat.with', key)
    },
    [start.theme ?? 'light', where === 'window' ? 'yes' : 'split', where === 'left' ? 'left' : 'right', start.on === null ? '' : keyOf(start.on ?? KILN)] as const,
  )
  // THE PICTURES BLUR THE LINE THAT SAYS WHICH MACHINE A MESSAGE WAS WRITTEN ON, because it names the machine this test
  // runs on. The blur draws nothing new and moves nothing.
  await context.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '.px-chat-from { filter: blur(5px); }'
      document.head.append(style)
    })
  })
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(SIDE).waitFor({ timeout: 30_000 })
  return { context, page }
}

/** Wait until the open conversation is this agent's and its newest page is drawn, then a moment for it to settle. */
async function drawn(page: Page, agent: Agent): Promise<void> {
  await page.locator(`${SIDE} .px-chat-them`, { hasText: agent.name }).waitFor({ timeout: 30_000 })
  await page.waitForFunction(
    ([list, n]) => document.querySelectorAll(`${list} .px-chat-said .px-chat-words`).length >= n,
    [SIDE, Math.min(agent.messages, 50)] as const,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(800)
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox()
  if (box === null) throw new Error(`${selector} is not drawn`)
  return box
}

/**
 * WHAT THE CHAT DRAWS NOW. The lists are there when the reader's own row at their top is drawn, and the conversation
 * when its message list is. Two columns are both, the lists' right edge at or left of the conversation's left edge; one
 * column is either alone.
 */
async function theColumns(page: Page): Promise<{ columns: 'two' | 'one' | string; lists: Box | null; talk: Box | null }> {
  return page.evaluate((selector) => {
    const frame = document.querySelector(selector)
    const place = (one: Element | null | undefined) => {
      if (one === null || one === undefined) return null
      const r = one.getBoundingClientRect()
      return r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
    }
    const lists = place(frame?.querySelector('.px-chat-me'))
    const talk = place(frame?.querySelector('.px-chat-said'))
    const columns =
      lists !== null && talk !== null
        ? lists.x + lists.width <= talk.x + 1
          ? 'two'
          : `the lists (${String(Math.round(lists.x))} to ${String(Math.round(lists.x + lists.width))}) are not left of the conversation (from ${String(Math.round(talk.x))})`
        : lists !== null || talk !== null
          ? 'one'
          : 'neither the lists nor a conversation'
    return { columns, lists, talk }
  }, SIDE)
}

/** Drag the seam until the chat beside the page is this wide, from a point well below the seam's shapes. */
async function dragTheSeamUntil(page: Page, width: number): Promise<void> {
  const chat = await boxOf(page, SPLIT)
  const seam = await boxOf(page, '.px-chat-seam')
  const from = { x: seam.x + seam.width / 2, y: seam.y + Math.round(seam.height * 0.6) }
  const left = (await page.evaluate(() => document.documentElement.getAttribute('data-chat-split'))) === 'left'
  const to = left ? from.x + (width - chat.width) : from.x - (width - chat.width)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to, from.y, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(600)
  expect((await boxOf(page, SPLIT)).width, 'the seam did not leave the chat at the width asked').toBe(width)
}

/** Drag the window's left edge until the window is this wide. */
async function dragTheWindowUntil(page: Page, width: number): Promise<void> {
  const chat = await boxOf(page, WINDOW)
  const grip = await boxOf(page, `${WINDOW} .px-chat-grip[data-edge="left"]`)
  const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x - (width - chat.width), from.y, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(600)
  expect((await boxOf(page, WINDOW)).width, 'the left edge did not leave the window at the width asked').toBe(width)
}

/** Scroll the list by the wheel, as a reader does, and give the chat a moment to keep where the reader is. */
async function wheel(page: Page, by: number): Promise<void> {
  const box = await boxOf(page, `${SIDE} .px-chat-said`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const step = by < 0 ? -100 : 100
  for (let gone = 0; Math.abs(gone) < Math.abs(by); gone += step) {
    await page.mouse.wheel(0, step)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(1_000)
}

/** The message row nearest the middle of the list: its words and how far its top is below the list's top. */
async function theRowInTheMiddle(page: Page): Promise<{ words: string; at: number }> {
  return page.evaluate((selector) => {
    const list = document.querySelector<HTMLElement>(`${selector} .px-chat-said`)
    if (list === null) throw new Error('no list')
    const box = list.getBoundingClientRect()
    const middle = box.top + box.height / 2
    for (const row of list.children) {
      const words = row.querySelector('.px-chat-words')?.textContent ?? ''
      const its = row.getBoundingClientRect()
      if (words !== '' && its.bottom >= middle) return { words, at: Math.round(its.top - box.top) }
    }
    throw new Error('no row reaches the middle of the list')
  }, SIDE)
}

/** The conversation open is the agent's. */
async function sameConversation(page: Page, agent: Agent): Promise<void> {
  expect(await page.locator(`${SIDE} .px-chat-them`).first().textContent(), 'another conversation is open').toContain(agent.name)
}

/** The same conversation is open, and the message being read is drawn again at the same height, above the newest. */
async function stillReading(page: Page, agent: Agent, looking: { words: string; at: number }): Promise<void> {
  await sameConversation(page, agent)
  const now = await page.evaluate(
    ([selector, wanted]) => {
      const list = document.querySelector<HTMLElement>(`${selector} .px-chat-said`)
      if (list === null) return { at: null, gap: 0 }
      const gap = Math.round(list.scrollHeight - list.clientHeight - list.scrollTop)
      for (const row of list.children) {
        if ((row.querySelector('.px-chat-words')?.textContent ?? '') === wanted) return { at: Math.round(row.getBoundingClientRect().top - list.getBoundingClientRect().top), gap }
      }
      return { at: null, gap }
    },
    [SIDE, looking.words] as const,
  )
  expect(now.at, `"${looking.words.slice(0, 40)}" is not drawn; the list is ${String(now.gap)} px above its end`).not.toBeNull()
  expect(Math.abs((now.at ?? 0) - looking.at), `"${looking.words.slice(0, 40)}" was ${String(looking.at)} px below the list's top and is ${String(now.at)} px`).toBeLessThanOrEqual(SAME_HEIGHT_PX)
  expect(now.gap, 'the list went to its newest message').toBeGreaterThan(BOTTOM_PX)
}

/** Two columns: the lists on the left and the conversation on the right, the conversation no narrower than the narrowest the chat beside the page draws. */
async function inTwoColumns(page: Page): Promise<void> {
  const drawing = await theColumns(page)
  expect(drawing.columns, 'the chat did not draw the lists beside the conversation').toBe('two')
  // THE SEAM COUNTS only where it stands beside the chat; where the chat covers the screen it is the bar across the top.
  const seam = await page.evaluate(() => {
    const strip = document.querySelector('.px-chat-seam')?.getBoundingClientRect()
    return strip !== undefined && strip.height > strip.width ? strip.width : 0
  })
  expect(drawing.talk?.width ?? 0, 'the conversation is narrower than the chat beside the page at its narrowest').toBeGreaterThanOrEqual(SPLIT_WIDTH_LEAST - seam)
}

async function inOneColumn(page: Page, what: 'lists' | 'conversation'): Promise<void> {
  const drawing = await theColumns(page)
  expect(drawing.columns, 'the chat did not draw one column').toBe('one')
  expect(what === 'lists' ? drawing.lists : drawing.talk, `the one column is not the ${what}`).not.toBeNull()
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-wide-chat-two-columns', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  for (const agent of AGENTS) {
    const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'agent', title: agent.name, data: { handle: agent.handle, runtime: 'claude-code', state: 'active' } }) })
    expect(filed.status, await filed.clone().text()).toBe(201)
  }
  const agents = ((await (await fetch(`${app.api}/api/participants`, { headers: PERSON })).json()) as { agents: { id: string; handle: string }[] }).agents
  for (const agent of AGENTS) {
    const id = agents.find((one) => one.handle === agent.handle)?.id ?? ''
    expect(id, agent.handle).not.toBe('')
    ids.set(agent.handle, id)
  }
  for (const agent of AGENTS) {
    const id = ids.get(agent.handle) ?? ''
    for (let n = 1; n <= agent.messages; n += 1) {
      if (n % 2 === 0) await say(asThe(agent), aLine(agent, n), { kind: 'person', id: THE_PERSON })
      else await say(PERSON, aLine(agent, n), { kind: 'agent', id })
    }
  }
}, 600_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

for (const side of ['right', 'left'] as const) {
  it(`1. beside the page at 1440 on the ${side}, the seam dragged across the width changes the columns and keeps the conversation and the place`, async () => {
    expect(TWO_COLUMNS_FROM, 'chat-split.ts names no width the chat draws two columns from').toBeTypeOf('number')
    const { context, page } = await aWindow({ width: 1440, height: 1000 }, side)
    try {
      await drawn(page, KILN)
      expect((await boxOf(page, SPLIT)).width).toBe(SPLIT_WIDTH_TO_START_WITH)
      await inOneColumn(page, 'conversation')
      await wheel(page, -1_200)
      const looking = await theRowInTheMiddle(page)
      await dragTheSeamUntil(page, TWO_COLUMNS_FROM)
      await inTwoColumns(page)
      await stillReading(page, KILN, looking)
      await dragTheSeamUntil(page, TWO_COLUMNS_FROM - 1)
      await inOneColumn(page, 'conversation')
      await stillReading(page, KILN, looking)
      await dragTheSeamUntil(page, TWO_COLUMNS_FROM + 150)
      await inTwoColumns(page)
      await stillReading(page, KILN, looking)
    } finally {
      await context.close()
    }
  }, 180_000)
}

it('2. beside the page at 2560, one column at the starting width and two far past the change', async () => {
  expect(TWO_COLUMNS_FROM, 'chat-split.ts names no width the chat draws two columns from').toBeTypeOf('number')
  const { context, page } = await aWindow({ width: 2560, height: 1200 }, 'right')
  try {
    await drawn(page, KILN)
    await inOneColumn(page, 'conversation')
    await wheel(page, -1_500)
    const looking = await theRowInTheMiddle(page)
    await dragTheSeamUntil(page, PICTURED_AT[2560])
    await inTwoColumns(page)
    await stillReading(page, KILN, looking)
  } finally {
    await context.close()
  }
}, 180_000)

it('3. the window at 1440: one column at its size, two filling the window, one back at its size, two dragged to the width', async () => {
  expect(TWO_COLUMNS_FROM, 'chat-split.ts names no width the chat draws two columns from').toBeTypeOf('number')
  const { context, page } = await aWindow({ width: 1440, height: 1000 }, 'window')
  try {
    await drawn(page, KILN)
    expect((await boxOf(page, WINDOW)).width, 'the window is wide enough for two columns at its starting size').toBeLessThan(TWO_COLUMNS_FROM)
    await inOneColumn(page, 'conversation')
    await page.click(`${WINDOW} .px-chat-fill`)
    await page.waitForSelector(`${WINDOW}[data-full="yes"]`, { timeout: 10_000 })
    await page.waitForTimeout(600)
    await inTwoColumns(page)
    await sameConversation(page, KILN)
    await page.click(`${WINDOW} .px-chat-fill`)
    await page.waitForSelector(`${WINDOW}[data-full="no"]`, { timeout: 10_000 })
    await page.waitForTimeout(600)
    await inOneColumn(page, 'conversation')
    await sameConversation(page, KILN)
    // ONE PIXEL SHORT OF THE WIDTH FIRST. Widening the window from its own size makes the room between the
    // conversation's head and its list 25 px shorter, so the list's top edge moves up, and the chat keeps the row still
    // on the screen rather than at its height below the list's top. From one pixel short, the place is asked across
    // the width alone.
    await dragTheWindowUntil(page, TWO_COLUMNS_FROM - 1)
    await wheel(page, -2_000)
    const looking = await theRowInTheMiddle(page)
    await dragTheWindowUntil(page, TWO_COLUMNS_FROM)
    await inTwoColumns(page)
    await stillReading(page, KILN, looking)
    await dragTheWindowUntil(page, TWO_COLUMNS_FROM - 1)
    await inOneColumn(page, 'conversation')
    await stillReading(page, KILN, looking)
  } finally {
    await context.close()
  }
}, 180_000)

it('4. with no conversation open, two columns draw the lists alone, a contact opens beside them, and back leaves them', async () => {
  expect(TWO_COLUMNS_FROM, 'chat-split.ts names no width the chat draws two columns from').toBeTypeOf('number')
  const { context, page } = await aWindow({ width: 1440, height: 1000 }, 'right', { on: null })
  try {
    await page.locator(`${SIDE} .px-chat-me`).waitFor({ timeout: 30_000 })
    await inOneColumn(page, 'lists')
    await dragTheSeamUntil(page, TWO_COLUMNS_FROM + 100)
    // THE LISTS STAY ON THE LEFT, and the right is the empty half of the drawing the chat page has.
    expect((await theColumns(page)).columns, 'the lists alone are not drawn').toBe('one')
    const lists = (await theColumns(page)).lists
    const chat = await boxOf(page, SPLIT)
    expect(lists?.width ?? chat.width, 'the lists fill the chat when no conversation is open').toBeLessThan(chat.width / 2)
    await page.locator(`${SIDE} .px-chat-contact`, { hasText: LOOM.name }).first().click()
    await drawn(page, LOOM)
    await inTwoColumns(page)
    await page.locator(`${SIDE} .px-chat-back`).first().click()
    await page.locator(`${SIDE} .px-chat-them`).waitFor({ state: 'detached', timeout: 10_000 })
    await inOneColumn(page, 'lists')
    expect((await theColumns(page)).lists?.width ?? chat.width, 'the lists fill the chat after the back press').toBeLessThan(chat.width / 2)
    await page.locator(`${SIDE} .px-chat-contact`, { hasText: KILN.name }).first().click()
    await drawn(page, KILN)
    await inTwoColumns(page)
  } finally {
    await context.close()
  }
}, 180_000)

for (const [width, columns] of [
  [990, 'two'],
  [660, 'one'],
  [390, 'one'],
] as const) {
  it(`5. below the split width the covering chat at ${String(width)} draws ${columns === 'two' ? 'two columns' : 'one column'}`, async () => {
    expect(TWO_COLUMNS_FROM, 'chat-split.ts names no width the chat draws two columns from').toBeTypeOf('number')
    const { context, page } = await aWindow({ width, height: width === 390 ? 844 : 1000 }, 'right')
    try {
      await drawn(page, KILN)
      const chat = await boxOf(page, SPLIT)
      expect(chat.width, 'the chat does not cover the screen').toBe(width)
      if (columns === 'two') await inTwoColumns(page)
      else await inOneColumn(page, 'conversation')
    } finally {
      await context.close()
    }
  }, 180_000)
}

it('6. the chat page still draws its own two panes and nothing of the chat beside the page', async () => {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
  try {
    await context.addInitScript((key) => {
      localStorage.setItem('mole-office.preset.theme', 'light')
      localStorage.setItem('mole-office.language', 'en')
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.chat.open', 'no')
      localStorage.setItem('mole-office.chat.with', key)
    }, keyOf(KILN))
    const page = await context.newPage()
    await page.goto(`${app.site}/?lang=en#/chat`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const onThePage = '.px-chat[data-where="page"]'
    await page.locator(`${onThePage} .px-chat-them`, { hasText: KILN.name }).waitFor({ timeout: 30_000 })
    const lists = await boxOf(page, `${onThePage} .px-chat-page-lists`)
    const talk = await boxOf(page, `${onThePage} .px-chat-page-talk`)
    expect(lists.x + lists.width, 'the page\'s lists are not left of its conversation').toBeLessThanOrEqual(talk.x + 1)
    expect(await page.locator(`${onThePage} .px-chat-seam`).count()).toBe(0)
  } finally {
    await context.close()
  }
}, 120_000)

it('7. every frame the window paints has the column count its width calls for, through the fill, the fold and a drag across the width', async () => {
  expect(TWO_COLUMNS_FROM, 'chat-split.ts names no width the chat draws two columns from').toBeTypeOf('number')
  const { context, page } = await aWindow({ width: 1440, height: 1000 }, 'window')
  try {
    await drawn(page, KILN)
    // A SIZE WATCHER OF THE TEST'S OWN, made after the chat's, so for each change of size the browser calls it after the
    // chat's and before that frame is painted. What it reads is what that frame paints.
    await page.evaluate(
      ([selector, from]) => {
        const frame = document.querySelector(selector)
        if (frame === null) throw new Error('no window')
        const seen: string[] = []
        Object.assign(window, { columnsSeen: seen })
        new ResizeObserver(() => {
          const width = frame.getBoundingClientRect().width
          const drawing = frame.querySelector('.px-chat-columns')?.getAttribute('data-columns') ?? 'no columns'
          const wanted = width >= from ? 'two' : 'one'
          seen.push(`${String(Math.round(width))} px drew ${drawing}${drawing === wanted ? '' : `, not ${wanted}`}`)
        }).observe(frame)
      },
      [WINDOW, TWO_COLUMNS_FROM] as const,
    )
    await page.click(`${WINDOW} .px-chat-fill`)
    await page.waitForSelector(`${WINDOW}[data-full="yes"]`, { timeout: 10_000 })
    await page.waitForTimeout(600)
    await page.click(`${WINDOW} .px-chat-fill`)
    await page.waitForSelector(`${WINDOW}[data-full="no"]`, { timeout: 10_000 })
    await page.waitForTimeout(600)
    await dragTheWindowUntil(page, TWO_COLUMNS_FROM)
    await dragTheWindowUntil(page, TWO_COLUMNS_FROM - 1)
    const seen = await page.evaluate(() => (window as unknown as { columnsSeen: string[] }).columnsSeen)
    expect(seen.length, 'the size watcher saw too few changes of size').toBeGreaterThan(4)
    expect(seen.filter((one) => one.includes(', not ')), `a painted frame had the old width's columns; every frame: ${seen.join('; ')}`).toEqual([])
  } finally {
    await context.close()
  }
}, 180_000)

it.runIf(output)('photographs the chat beside the page at 1440 and 2560 on either side, the window filling 1440, and the covering chat at 990, 660 and 390, light and dark', async () => {
  if (output === undefined) throw new Error('the pictures need W13Y_CHAT_COLUMNS')
  const dir = join(output, 'pictures')
  mkdirSync(dir, { recursive: true })
  const shots: { name: string; size: { width: number; height: number }; where: Where; splitWidth?: number; full?: boolean }[] = [
    { name: 'right-1440', size: { width: 1440, height: 1000 }, where: 'right', splitWidth: PICTURED_AT[1440] },
    { name: 'left-1440', size: { width: 1440, height: 1000 }, where: 'left', splitWidth: PICTURED_AT[1440] },
    { name: 'right-2560', size: { width: 2560, height: 1200 }, where: 'right', splitWidth: PICTURED_AT[2560] },
    { name: 'left-2560', size: { width: 2560, height: 1200 }, where: 'left', splitWidth: PICTURED_AT[2560] },
    { name: 'window-full-1440', size: { width: 1440, height: 1000 }, where: 'window', full: true },
    { name: 'right-990', size: { width: 990, height: 1000 }, where: 'right' },
    { name: 'right-660', size: { width: 660, height: 1000 }, where: 'right' },
    { name: 'right-390', size: { width: 390, height: 844 }, where: 'right' },
  ]
  for (const theme of ['light', 'dark'] as const) {
    for (const shot of shots) {
      const { context, page } = await aWindow(shot.size, shot.where, { theme })
      try {
        await drawn(page, KILN)
        if (shot.splitWidth !== undefined) await dragTheSeamUntil(page, shot.splitWidth)
        if (shot.full === true) {
          await page.click(`${WINDOW} .px-chat-fill`)
          await page.waitForSelector(`${WINDOW}[data-full="yes"]`, { timeout: 10_000 })
        }
        await page.waitForTimeout(600)
        const name = `${shot.name}-${theme}`
        const covers = await page.evaluate((heading) => {
          const head = document.querySelector(heading)?.getBoundingClientRect()
          if (head === undefined) return true
          return (document.elementFromPoint(head.left + head.width / 2, head.top + head.height / 2)?.closest('.px-chat') ?? null) !== null
        }, HOMES_HEADING)
        await putTheMadeUpLabelIn(page, LABEL, page.locator(covers ? `${SIDE} .px-chat-them` : HOMES_HEADING).first(), name)
        await page.waitForTimeout(400)
        await page.screenshot({ path: join(dir, `${name}.png`) })
      } finally {
        await context.close()
      }
    }
  }
}, 600_000)
