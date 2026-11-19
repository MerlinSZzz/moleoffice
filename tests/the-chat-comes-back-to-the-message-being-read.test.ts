// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT COMES BACK TO THE MESSAGE BEING READ. Wave 13y round 166, package CR, item CR-7.
 *
 * Leaving a conversation and coming back lands on the message they were reading, at the same
 * height, and not at the newest message. Before this round every opening of a conversation landed at its newest
 * message, so a reader who went to another conversation, another page, or closed the chat lost their place.
 *
 * In a real browser against a Mole Office of its own, at 1440 by 1000. The chat's button opens it beside the page, and
 * case 3 starts it in its own window as well. "The place" is the message in the middle of the list when the reader
 * left, and how far its top was below the list's top. Each case asks that it is drawn again within 2 px of that height,
 * and that the list is not at its newest message:
 *  1. Another conversation and back comes back to the place.
 *  2. Each conversation keeps its own place: two conversations read at two places each come back to their own.
 *  3. Closing the chat and opening it again comes back to the place: closed beside the page, and closed in its own
 *     window and opened beside the page.
 *  4. Another page and back comes back to the place: the chat page draws it, and Home's window draws it again after.
 *  5. A reload comes back to the place, two pages above the newest message.
 *  6. A conversation never opened lands at its newest message, and one left at its newest message comes back to its
 *     newest message, as before this round. This case passed before the change too.
 *  7. Messages that came while the reader was away do not move the place, and the mark that says new messages are below
 *     is drawn.
 *
 * THE FILM is taken only when W13Y_CHAT_RETURN names a folder outside the checkout: cases 1, 3 and 5 in one window at
 * 1440. It is made-up data, and it carries the label that says so.
 *
 * Everything here is made up.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, theAnswerToAWriteInATestOffice, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/** Three made-up agents. The first conversation is three pages long, so a place two pages up can be asked for. */
const AGENTS = [
  { name: 'Made-up Kiln Keeper', handle: 'made-up-kiln-keeper', messages: 130 },
  { name: 'Made-up Loom Keeper', handle: 'made-up-loom-keeper', messages: 60 },
  { name: 'Made-up Quill Keeper', handle: 'made-up-quill-keeper', messages: 60 },
] as const
type Agent = (typeof AGENTS)[number]
const [KILN, LOOM, QUILL] = AGENTS
const film = process.env.W13Y_CHAT_RETURN
const LABEL = 'Made-up data — an invented office, not real office data'
/**
 * The film's label goes above Home's heading, at the top of the page; the film opens on Home. Not above the first thing
 * in the page's main region, which on Home is an empty hidden block, and not in the sidebar, which is folded to its
 * icons while the chat is beside the page, so the label there was one word to a line and cut at the sidebar's edge.
 */
const HOMES_HEADING = '.hm-page-head'
/** The chat beside the page or in its own window: whichever it is in, and not the chat page. */
const SIDE = '.px-chat:not([data-where="page"])'
const PAGE = '.px-chat[data-where="page"]'
/** Eight pixels is the bottom, as the chat itself counts it. */
const BOTTOM_PX = 8
/** How near the message has to come back to where it was, in pixels. */
const SAME_HEIGHT_PX = 2

let app: LiveApp
const ids = new Map<string, string>()
/** How many messages each conversation holds now: the made-up lines, and those a case sends later. */
const held = new Map<string, number>(AGENTS.map((agent) => [agent.handle, agent.messages]))
function heldIn(agent: Agent): number {
  const count = held.get(agent.handle)
  if (count === undefined) throw new Error(`no count is kept for ${agent.handle}`)
  return count
}
const keyOf = (agent: Agent): string => participantKey({ kind: 'agent', id: ids.get(agent.handle) ?? '' })
const asThe = (agent: Agent): Record<string, string> => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent.handle })

async function say(headers: Record<string, string>, body: string, to: { kind: string; id: string }): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [to] } }) })
  expect(said.status, await said.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, { kind: 'message', data: { to: [to] } }))
}

/** Every third line is long, so the rows differ in height as a real conversation's do. */
function aLine(agent: Agent, n: number): string {
  const long = n % 3 === 0 ? ' The made-up log for this line runs on, so the row takes three or four lines of the window and the list is long enough to scroll a good way.' : ''
  return `Made-up line ${String(n)} with ${agent.name}.${long}`
}

/** The film's label, put in once Home's heading is drawn, which a reload has not yet done. */
async function labelTheFilm(page: Page): Promise<void> {
  const top = page.locator(HOMES_HEADING).first()
  await top.waitFor({ timeout: 30_000 })
  await putTheMadeUpLabelIn(page, LABEL, top, 'the-chat-comes-back')
}

/** A browser window in which the chat is set on the first agent's conversation, closed or open in its own window. */
async function aWindow(filmed = false, opened: 'no' | 'yes' = 'no'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ...(!filmed || film === undefined ? {} : { recordVideo: { dir: join(film, 'films'), size: { width: 1440, height: 1000 } } }),
  })
  // SET ONCE IN THIS WINDOW, so a reload keeps what the chat itself wrote since.
  await context.addInitScript(
    ([key, open]) => {
      if (sessionStorage.getItem('chat-test-set') === 'yes') return
      sessionStorage.setItem('chat-test-set', 'yes')
      localStorage.setItem('mole-office.preset.theme', 'light')
      localStorage.setItem('mole-office.language', 'en')
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.chat.open', open)
      localStorage.setItem('mole-office.chat.with', key)
    },
    [keyOf(KILN), opened] as const,
  )
  // THE FILM BLURS THE LINE THAT SAYS WHICH MACHINE A MESSAGE WAS WRITTEN ON, because it names the machine this test
  // runs on. The blur draws nothing new and moves nothing.
  if (filmed) {
    await context.addInitScript(() => {
      addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = '.px-chat-from { filter: blur(5px); }'
        document.head.append(style)
      })
    })
  }
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  if (filmed) await labelTheFilm(page)
  return { context, page }
}

/** Wait until the open conversation is this agent's and its newest page is drawn, then a moment for it to settle. */
async function drawn(page: Page, agent: Agent, panel = SIDE): Promise<void> {
  await page.locator(`${panel} .px-chat-them`, { hasText: agent.name }).waitFor({ timeout: 30_000 })
  await page.waitForFunction(
    ([list, n]) => document.querySelectorAll(`${list} .px-chat-said .px-chat-words`).length >= n,
    [panel, Math.min(agent.messages, 50)] as const,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(800)
}

/** Open the chat from its button, on the conversation it was left on. */
async function openTheChat(page: Page, agent: Agent): Promise<void> {
  await page.click('.px-chat-circle')
  await drawn(page, agent)
}

/** Close the chat by its own press: the seam's beside the page, the top row's in its own window. */
async function closeTheChat(page: Page): Promise<void> {
  if ((await page.locator('.px-chat[data-where="split"]').count()) > 0) await page.click('.px-chat-seam-away')
  else await page.click('.px-chat[data-where="corner"] .px-chat-close')
  await page.locator(SIDE).waitFor({ state: 'detached', timeout: 30_000 })
}

/** Leave the open conversation for the contact list, and open another one there, as a reader does. */
async function goTo(page: Page, agent: Agent): Promise<void> {
  await page.locator(`${SIDE} .px-chat-back`).first().click()
  await page.locator(`${SIDE} .px-chat-contact`, { hasText: agent.name }).first().click()
  await drawn(page, agent)
}

/** Scroll the list by the wheel, as a reader does, and give the chat a moment to keep where the reader is. */
async function wheel(page: Page, by: number, panel = SIDE): Promise<void> {
  const box = await page.locator(`${panel} .px-chat-said`).boundingBox()
  if (box === null) throw new Error('no list')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const step = by < 0 ? -100 : 100
  for (let gone = 0; Math.abs(gone) < Math.abs(by); gone += step) {
    await page.mouse.wheel(0, step)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(1_000)
}

/** The message row nearest the middle of the list: its words and how far its top is below the list's top. */
async function theRowInTheMiddle(page: Page, panel = SIDE): Promise<{ words: string; at: number }> {
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
  }, panel)
}

/** Where the row with these words is now, from the list's top, or null when it is not drawn. */
async function whereTheRowIs(page: Page, words: string, panel = SIDE): Promise<number | null> {
  return page.evaluate(
    ([selector, wanted]) => {
      const list = document.querySelector<HTMLElement>(`${selector} .px-chat-said`)
      if (list === null) return null
      for (const row of list.children) {
        if ((row.querySelector('.px-chat-words')?.textContent ?? '') === wanted) return Math.round(row.getBoundingClientRect().top - list.getBoundingClientRect().top)
      }
      return null
    },
    [panel, words] as const,
  )
}

/** How far the list is above its end, in pixels. */
async function theGap(page: Page, panel = SIDE): Promise<number> {
  return page.locator(`${panel} .px-chat-said`).evaluate((list) => Math.round(list.scrollHeight - list.clientHeight - list.scrollTop))
}

/** The message the reader was looking at is drawn again at the same height, and the list is not at its newest. */
async function backAt(page: Page, looking: { words: string; at: number }, panel = SIDE): Promise<void> {
  const after = await whereTheRowIs(page, looking.words, panel)
  const gap = await theGap(page, panel)
  expect(after, `"${looking.words.slice(0, 40)}" is not drawn; the list is ${String(gap)} px above its end`).not.toBeNull()
  expect(Math.abs((after ?? 0) - looking.at), `"${looking.words.slice(0, 40)}" was ${String(looking.at)} px below the list's top and is ${String(after)} px`).toBeLessThanOrEqual(SAME_HEIGHT_PX)
  expect(gap, 'the list is at its newest message').toBeGreaterThan(BOTTOM_PX)
}

/** Read the conversation's older pages, by scrolling to the top until every message is held, and stay at the very top. */
async function readEveryPage(page: Page, agent: Agent): Promise<void> {
  const box = await page.locator(`${SIDE} .px-chat-said`).boundingBox()
  if (box === null) throw new Error('no list')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let tries = 0; tries < 60; tries++) {
    if ((await page.locator(`${SIDE} .px-chat-said .px-chat-words`).count()) >= heldIn(agent)) break
    await page.mouse.wheel(0, -3_000)
    await page.waitForTimeout(150)
  }
  expect(await page.locator(`${SIDE} .px-chat-said .px-chat-words`).count()).toBe(heldIn(agent))
  // THE LAST PAGE READ IS PUT ABOVE WHERE THE READER WAS, so the list is not yet at its top.
  for (let tries = 0; tries < 20; tries++) {
    if ((await page.locator(`${SIDE} .px-chat-said`).evaluate((list) => Math.round(list.scrollTop))) <= 1) break
    await page.mouse.wheel(0, -3_000)
    await page.waitForTimeout(150)
  }
  expect(await page.locator(`${SIDE} .px-chat-said`).evaluate((list) => Math.round(list.scrollTop))).toBeLessThanOrEqual(1)
  await page.waitForTimeout(1_000)
}

/** Back to the newest message by the wheel, as a reader does. */
async function backToTheNewest(page: Page): Promise<void> {
  const box = await page.locator(`${SIDE} .px-chat-said`).boundingBox()
  if (box === null) throw new Error('no list')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let tries = 0; tries < 60; tries++) {
    if ((await theGap(page)) <= BOTTOM_PX) break
    await page.mouse.wheel(0, 3_000)
    await page.waitForTimeout(150)
  }
  expect(await theGap(page)).toBeLessThanOrEqual(BOTTOM_PX)
  await page.waitForTimeout(1_000)
}

/** Case 5's steps: read every page, go two pages up from the newest, and reload. */
async function readTwoPagesUpAndReload(page: Page, filmed = false): Promise<{ words: string; at: number }> {
  await readEveryPage(page, KILN)
  // FROM THE TOP, the wheel goes down to a message about twenty from the oldest, more than a hundred above the newest.
  await wheel(page, 400)
  const looking = await theRowInTheMiddle(page)
  expect(Number(/^Made-up line (\d+) /.exec(looking.words)?.[1] ?? '999'), looking.words).toBeLessThanOrEqual(KILN.messages - 100)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  if (filmed) await labelTheFilm(page)
  await drawn(page, KILN)
  // THE TWO OLDER PAGES the place is on are read before it can be drawn.
  await expect.poll(() => whereTheRowIs(page, looking.words), { timeout: 30_000, message: `"${looking.words.slice(0, 40)}" was not drawn after the reload` }).not.toBeNull()
  await page.waitForTimeout(800)
  return looking
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-chat-comes-back', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
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

it('comes back to the message being read after another conversation, at the same height', async () => {
  const { context, page } = await aWindow()
  try {
    await openTheChat(page, KILN)
    await wheel(page, -1_500)
    const looking = await theRowInTheMiddle(page)
    await goTo(page, LOOM)
    await goTo(page, KILN)
    await backAt(page, looking)
  } finally {
    await context.close()
  }
}, 180_000)

it('keeps a place for each conversation', async () => {
  const { context, page } = await aWindow()
  try {
    await openTheChat(page, KILN)
    await wheel(page, -1_200)
    const inKiln = await theRowInTheMiddle(page)
    await goTo(page, LOOM)
    await wheel(page, -700)
    const inLoom = await theRowInTheMiddle(page)
    await goTo(page, KILN)
    await backAt(page, inKiln)
    await goTo(page, LOOM)
    await backAt(page, inLoom)
  } finally {
    await context.close()
  }
}, 180_000)

it('comes back to the place after the chat is closed beside the page and opened again', async () => {
  const { context, page } = await aWindow()
  try {
    await openTheChat(page, KILN)
    await wheel(page, -1_500)
    const looking = await theRowInTheMiddle(page)
    await closeTheChat(page)
    await openTheChat(page, KILN)
    await backAt(page, looking)
  } finally {
    await context.close()
  }
}, 180_000)

it('comes back to the place after the chat is closed in its own window and opened beside the page', async () => {
  const { context, page } = await aWindow(false, 'yes')
  try {
    await drawn(page, KILN, '.px-chat[data-where="corner"]')
    await wheel(page, -1_200)
    const looking = await theRowInTheMiddle(page)
    await closeTheChat(page)
    await openTheChat(page, KILN)
    expect(await page.locator('.px-chat[data-where="split"]').count(), 'the chat did not open beside the page').toBe(1)
    await backAt(page, looking)
  } finally {
    await context.close()
  }
}, 180_000)

it('comes back to the place after another page, on the chat page and in the window after it', async () => {
  const { context, page } = await aWindow()
  try {
    await openTheChat(page, KILN)
    await wheel(page, -1_500)
    const looking = await theRowInTheMiddle(page)
    await page.evaluate(() => {
      location.hash = '#/chat'
    })
    await drawn(page, KILN, PAGE)
    await backAt(page, looking, PAGE)
    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.locator(PAGE).waitFor({ state: 'detached', timeout: 30_000 })
    if ((await page.locator(SIDE).count()) === 0) await page.click('.px-chat-circle')
    await drawn(page, KILN)
    await backAt(page, looking)
  } finally {
    await context.close()
  }
}, 180_000)

it('comes back to the place after a reload, two pages above the newest message', async () => {
  const { context, page } = await aWindow()
  try {
    await openTheChat(page, KILN)
    const looking = await readTwoPagesUpAndReload(page)
    await backAt(page, looking)
  } finally {
    await context.close()
  }
}, 240_000)

it('lands at the newest message of a conversation never opened, and of one left at its newest message', async () => {
  const { context, page } = await aWindow()
  try {
    await openTheChat(page, KILN)
    await goTo(page, QUILL)
    expect(await theGap(page), 'a conversation never opened did not land at its newest message').toBeLessThanOrEqual(BOTTOM_PX)
    await wheel(page, -800)
    expect(await theGap(page), 'the wheel did not move the list').toBeGreaterThan(BOTTOM_PX)
    await backToTheNewest(page)
    await goTo(page, LOOM)
    await goTo(page, QUILL)
    expect(await theGap(page), 'a conversation left at its newest message did not come back to it').toBeLessThanOrEqual(BOTTOM_PX)
  } finally {
    await context.close()
  }
}, 180_000)

it('keeps the place when messages came while the reader was away, and says that new messages are below', async () => {
  const { context, page } = await aWindow()
  try {
    await openTheChat(page, KILN)
    await wheel(page, -1_500)
    const looking = await theRowInTheMiddle(page)
    const before = await page.locator(`${SIDE} .px-chat-said .px-chat-words`).count()
    await goTo(page, LOOM)
    for (const n of [1, 2, 3]) {
      await say(asThe(KILN), `Made-up line that came meanwhile, number ${String(n)}.`, { kind: 'person', id: THE_PERSON })
      held.set(KILN.handle, heldIn(KILN) + 1)
    }
    await goTo(page, KILN)
    await page.waitForFunction((n) => document.querySelectorAll('.px-chat:not([data-where="page"]) .px-chat-said .px-chat-words').length >= n, before + 3, { timeout: 30_000 })
    await page.waitForTimeout(800)
    await backAt(page, looking)
    expect(await page.locator(`${SIDE} .px-chat-new-below`).count(), 'nothing says that new messages are below').toBe(1)
  } finally {
    await context.close()
  }
}, 180_000)

it.runIf(film)('films another conversation and back, a close and an open, and a reload, at 1440', async () => {
  if (film === undefined) throw new Error('the film needs W13Y_CHAT_RETURN')
  mkdirSync(join(film, 'films'), { recursive: true })
  const { context, page } = await aWindow(true)
  try {
    await page.waitForTimeout(800)
    await openTheChat(page, KILN)
    await wheel(page, -1_500)
    await goTo(page, LOOM)
    await page.waitForTimeout(600)
    await goTo(page, KILN)
    await page.waitForTimeout(1_200)
    await closeTheChat(page)
    await page.waitForTimeout(800)
    await openTheChat(page, KILN)
    await page.waitForTimeout(1_200)
    await readTwoPagesUpAndReload(page, true)
    await page.waitForTimeout(1_500)
  } finally {
    await context.close()
  }
  const video = page.video()
  if (video === null) throw new Error('the window recorded no film')
  await video.saveAs(join(film, 'films', 'the-chat-comes-back.webm'))
  await video.delete()
}, 300_000)
