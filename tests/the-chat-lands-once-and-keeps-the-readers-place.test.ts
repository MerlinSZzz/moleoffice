// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OPENING THE CHAT LANDS ONCE, AND A READER WHO SCROLLED UP STAYS WHERE THEY SCROLLED. Wave 13y round 134, item 72 d.
 *
 * The problem as the person saw it: sometimes the chat moved up and down when it was opened, and a reader who scrolled
 * up was pulled back to the bottom. Measured in this round, on a made-up conversation of three pages: after a reload,
 * the chat drew the 130 messages it had kept, and read the conversation again from its newest page. That page replaced
 * the 130 with 50. A reader who had scrolled up 600 px while the read was on its way was put back at the bottom, and
 * for one frame the list said that new messages were below, though none had come.
 *
 * In a real browser against a Mole Office of its own, each case reads the list after every frame the browser paints:
 *  1. After a reload with the chat open, every painted frame that holds a message shows the newest one, at the bottom.
 *     This case passed before the change too. No painted frame away from the newest message was found, on a first
 *     opening or on a reload. The case stays to show that the change still lands on the newest message.
 *  2. After a reload, a reader who scrolls up while the conversation is read again stays where they scrolled: the
 *     message they were looking at stays at the same height, the list never goes back to the bottom, and nothing says
 *     that new messages are below, because none came.
 * Each read of the conversation is held back, 1,500 ms in the first case and 3,000 ms in the second, so on every run
 * the read lands after the page is drawn, as it does on a large office.
 *
 * Test change (wave 13y round 166, package CR, item CR-7): the chat now comes back to the message a reader was reading
 * when they left, across a reload too. Case 2 reads every page by scrolling to the top, so its reload would come back
 * there and the reader's scroll up would measure nothing. So case 2, and the film, go back to the newest message after
 * reading every page and before the reload. A reader who left at the newest message comes back to it, so the case
 * still asks what it asked: a scroll up while the read is on its way is kept.
 *
 * THE FILM is taken only when W13Y_CHAT_FILM names a folder outside the checkout: both cases in one window at 1440. It is
 * made-up data, and it carries the label that says so.
 *
 * Everything here is made up.
 */
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
const AGENT = { name: 'Made-up Long Agent', handle: 'made-up-long-agent' }
const AS_THE_AGENT = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle }
const film = process.env.W13Y_CHAT_FILM
const LABEL = 'Made-up data — an invented office, not real office data'
/** The first thing the page draws in its main region. The film's label goes above it, at the top of the page. */
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
/** How many messages the conversation holds: two full pages of fifty and part of a third. */
const MESSAGES = 130
/** Eight pixels is the bottom, as the chat itself counts it. */
const BOTTOM_PX = 8

let app: LiveApp
let agentKey = ''

/** The list after one painted frame, or null while there is no list. */
type Frame = { t: number; top: number; gap: number; rows: number; below: boolean } | null

async function say(headers: Record<string, string>, body: string, to: { kind: string; id: string }): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [to] } }) })
  expect(said.status, await said.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, { kind: 'message', data: { to: [to] } }))
}

/** Hold back every read of a conversation, so the read takes as long as it can on a large office. */
async function holdTheReadsBack(on: Page, ms: number): Promise<void> {
  await on.unroute('**/api/messages/conversation**')
  await on.route('**/api/messages/conversation**', async (route) => {
    await new Promise((done) => setTimeout(done, ms))
    await route.continue()
  })
}

/**
 * READ THE LIST IN EVERY FRAME, IMMEDIATELY BEFORE IT IS PAINTED. A resize observer made in the frame's callback is the
 * newest, so the browser calls it after the page's own in the same frame: after the frame's layout and after the chat's
 * own observer has kept the list at the bottom, and no task can run between it and the paint. A task posted from the
 * frame's callback, which this read used before, can run after another task has changed the list and before the next
 * frame's observer puts it back, so it could read a state that was never painted (problem EQKEfgngKK4j). The page runs
 * this function itself, from a step of the test or from the start of a page that is loading.
 */
function theWatcher(): void {
  const w = window as unknown as { listFrames: unknown[]; listWatched: boolean; listFrom: number }
  w.listFrames = []
  w.listFrom = performance.now()
  if (w.listWatched) return
  w.listWatched = true
  const read = (): void => {
    const list = document.querySelector<HTMLElement>('.px-chat-said')
    w.listFrames.push(
      list === null
        ? null
        : {
            t: Math.round(performance.now() - w.listFrom),
            top: Math.round(list.scrollTop),
            gap: Math.round(list.scrollHeight - list.clientHeight - list.scrollTop),
            rows: list.querySelectorAll('.px-chat-words').length,
            below: document.querySelector('.px-chat-new-below') !== null,
          },
    )
  }
  const tick = (): void => {
    if (!w.listWatched) return
    const atThePaint = new ResizeObserver(() => {
      atThePaint.disconnect()
      read()
    })
    atThePaint.observe(document.documentElement)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function watchTheList(on: Page): Promise<void> {
  await on.evaluate(theWatcher)
}

async function theFrames(on: Page): Promise<Frame[]> {
  return (await on.evaluate(() => {
    const w = window as unknown as { listFrames: unknown[]; listWatched: boolean }
    w.listWatched = false
    return w.listFrames
  })) as Frame[]
}

/** The frames as lines, one line for each change, for a failure to show what was painted. */
function told(frames: Frame[]): string {
  const out: string[] = []
  let last = ''
  for (const f of frames) {
    const one = f === null ? 'no list' : `top ${String(f.top)} gap ${String(f.gap)} rows ${String(f.rows)}${f.below ? ' new-below' : ''}`
    if (one !== last) out.push(`${f === null ? '' : `@${String(f.t)}ms `}${one}`)
    last = one
  }
  return out.join('\n')
}

/** The film's label, put in once the page has drawn its first block, which a reload has not yet done. */
async function labelTheFilm(page: Page): Promise<void> {
  const top = page.locator(THE_PAGE_TOP).first()
  await top.waitFor({ timeout: 30_000 })
  await putTheMadeUpLabelIn(page, LABEL, top, 'the-chat-lands-once')
}

/** Open a window in which the chat is closed and set on the made-up agent's conversation. */
async function aWindow(filmed = false): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ...(!filmed || film === undefined ? {} : { recordVideo: { dir: join(film, 'films'), size: { width: 1440, height: 1000 } } }),
  })
  // SET ONCE IN THIS WINDOW, so a reload keeps what the chat itself wrote since.
  await context.addInitScript((key) => {
    if (sessionStorage.getItem('chat-test-set') === 'yes') return
    sessionStorage.setItem('chat-test-set', 'yes')
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.language', 'en')
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'no')
    localStorage.setItem('mole-office.chat.with', key)
  }, agentKey)
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

/** The message row nearest the middle of the list: its words and how far its top is below the list's top. */
async function theRowInTheMiddle(on: Page): Promise<{ words: string; at: number }> {
  return on.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.px-chat-said')
    if (list === null) throw new Error('no list')
    const box = list.getBoundingClientRect()
    const middle = box.top + box.height / 2
    for (const row of list.children) {
      const its = row.getBoundingClientRect()
      if (its.bottom >= middle) return { words: row.querySelector('.px-chat-words')?.textContent ?? '', at: Math.round(its.top - box.top) }
    }
    throw new Error('no row reaches the middle of the list')
  })
}

/** Where the row with these words is now, from the list's top, or null when it is not drawn. */
async function whereTheRowIs(on: Page, words: string): Promise<number | null> {
  return on.evaluate((wanted) => {
    const list = document.querySelector<HTMLElement>('.px-chat-said')
    if (list === null) return null
    for (const row of list.children) {
      if ((row.querySelector('.px-chat-words')?.textContent ?? '') === wanted) return Math.round(row.getBoundingClientRect().top - list.getBoundingClientRect().top)
    }
    return null
  }, words)
}

/** Open the chat for the first time in this window. It stays open, and it keeps what it drew for the next drawing. */
async function openForTheFirstTime(page: Page): Promise<void> {
  await page.click('.px-chat-circle')
  await page.waitForFunction((n) => document.querySelectorAll('.px-chat-said .px-chat-words').length >= n, 50, { timeout: 30_000 })
  // WHAT THE CHAT KEEPS FOR THE NEXT DRAWING is written when the list changes; a moment lets it be written.
  await page.waitForTimeout(1_000)
}

/** A read of the conversation that has not come back yet, and whether it has. */
function theNextRead(page: Page): { read: Promise<unknown>; landed: () => boolean } {
  let landed = false
  const read = page.waitForResponse((reply) => reply.url().includes('/api/messages/conversation'), { timeout: 30_000 }).then(() => {
    landed = true
  })
  read.catch(() => undefined)
  return { read, landed: () => landed }
}

/** Case 1: reload with the chat left open, and read every frame the browser paints from the start of the page. */
async function reloadWithTheChatOpen(page: Page, filmed = false): Promise<Frame[]> {
  await page.addInitScript(theWatcher)
  await holdTheReadsBack(page, 1_500)
  const theRead = theNextRead(page)
  await page.reload({ timeout: 60_000 })
  if (filmed) await labelTheFilm(page)
  await theRead.read
  await page.waitForTimeout(1_500)
  return theFrames(page)
}

/** Read the conversation's older pages, by scrolling to the top until every message is held. */
async function readEveryPage(page: Page): Promise<void> {
  await page.unroute('**/api/messages/conversation**')
  const box = await page.locator('.px-chat-said').boundingBox()
  if (box === null) throw new Error('no list')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let tries = 0; tries < 60; tries++) {
    if ((await page.locator('.px-chat-said .px-chat-words').count()) >= MESSAGES) break
    await page.mouse.wheel(0, -3_000)
    await page.waitForTimeout(150)
  }
  expect(await page.locator('.px-chat-said .px-chat-words').count()).toBe(MESSAGES)
}

/** Back to the newest message after reading every page, so the chat keeps the newest as the place being read. */
async function backToTheNewest(page: Page): Promise<void> {
  const box = await page.locator('.px-chat-said').boundingBox()
  if (box === null) throw new Error('no list')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let tries = 0; tries < 60; tries++) {
    const gap = await page.locator('.px-chat-said').evaluate((list) => list.scrollHeight - list.clientHeight - list.scrollTop)
    if (gap <= BOTTOM_PX) break
    await page.mouse.wheel(0, 3_000)
    await page.waitForTimeout(150)
  }
  expect(await page.locator('.px-chat-said').evaluate((list) => list.scrollHeight - list.clientHeight - list.scrollTop)).toBeLessThanOrEqual(BOTTOM_PX)
  // WHAT THE CHAT KEEPS FOR THE NEXT DRAWING, the place being read among it, is written as the list moves; a moment lets it be written.
  await page.waitForTimeout(1_000)
}

/** Case 2: reload with the chat left open, and scroll up 600 px while the conversation is read again. */
async function reloadAndScrollUpDuringTheRead(page: Page, filmed = false): Promise<{ frames: Frame[]; looking: { words: string; at: number }; earlyRead: boolean; after: number | null }> {
  await holdTheReadsBack(page, 3_000)
  const theRead = theNextRead(page)
  await page.reload({ timeout: 60_000 })
  if (filmed) await labelTheFilm(page)
  await page.waitForFunction((n) => document.querySelectorAll('.px-chat-said .px-chat-words').length >= n, MESSAGES, { timeout: 30_000 })
  await page.waitForTimeout(200)
  const box = await page.locator('.px-chat-said').boundingBox()
  if (box === null) throw new Error('no list')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await watchTheList(page)
  for (let n = 0; n < 6; n++) {
    await page.mouse.wheel(0, -100)
    await page.waitForTimeout(50)
  }
  await page.waitForTimeout(150)
  const looking = await theRowInTheMiddle(page)
  const earlyRead = theRead.landed()
  // THE READ LANDS in this wait: it was asked when the page drew the chat and is held back 3,000 ms.
  await theRead.read
  await page.waitForTimeout(1_500)
  const frames = await theFrames(page)
  return { frames, looking, earlyRead, after: await whereTheRowIs(page, looking.words) }
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-chat-lands-once', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }) })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const agents = ((await (await fetch(`${app.api}/api/participants`, { headers: PERSON })).json()) as { agents: { id: string; handle: string }[] }).agents
  const id = agents.find((one) => one.handle === AGENT.handle)?.id ?? ''
  expect(id).not.toBe('')
  agentKey = participantKey({ kind: 'agent', id })
  // EVERY THIRD MESSAGE IS LONG, so the rows differ in height as a real conversation's do.
  for (let n = 1; n <= MESSAGES; n += 1) {
    const long = n % 3 === 0 ? ' The made-up kiln log for this line runs on, so the row takes three or four lines of the panel and the list is long enough to scroll a good way.' : ''
    if (n % 2 === 0) await say(AS_THE_AGENT, `Made-up line ${String(n)} from the agent.${long}`, { kind: 'person', id: THE_PERSON })
    else await say(PERSON, `Made-up line ${String(n)} from the reader.${long}`, { kind: 'agent', id })
  }
}, 600_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('after a reload with the chat open, every painted frame that holds a message shows the newest one', async () => {
  const { context, page } = await aWindow()
  try {
    await openForTheFirstTime(page)
    const frames = await reloadWithTheChatOpen(page)
    const drawn = frames.filter((one): one is NonNullable<Frame> => one !== null && one.rows > 0)
    expect(drawn.length, told(frames)).toBeGreaterThan(0)
    expect(drawn.filter((one) => one.gap > BOTTOM_PX), told(frames)).toEqual([])
  } finally {
    await context.close()
  }
}, 180_000)

it('after a reload, a reader who scrolls up while the conversation is read again stays where they scrolled', async () => {
  const { context, page } = await aWindow()
  try {
    await openForTheFirstTime(page)
    await readEveryPage(page)
    await backToTheNewest(page)
    const { frames, looking, earlyRead, after } = await reloadAndScrollUpDuringTheRead(page)
    // THE READER SCROLLED BEFORE THE READ CAME BACK, or this case would test nothing.
    expect(earlyRead).toBe(false)
    const painted = frames.filter((one): one is NonNullable<Frame> => one !== null)
    const firstStep = painted.findIndex((one) => one.gap > BOTTOM_PX)
    expect(firstStep, told(frames)).toBeGreaterThanOrEqual(0)
    // NEVER BACK AT THE BOTTOM, from the reader's first step up until the end.
    expect(painted.slice(firstStep).filter((one) => one.gap <= BOTTOM_PX), told(frames)).toEqual([])
    // THE MESSAGE THEY WERE LOOKING AT IS STILL THERE, AT THE SAME HEIGHT.
    expect(after, `${looking.words}\n${told(frames)}`).not.toBeNull()
    expect(Math.abs((after ?? 0) - looking.at), `${looking.words} was at ${String(looking.at)} px\n${told(frames)}`).toBeLessThanOrEqual(1)
    // AND NOTHING SAYS THAT NEW MESSAGES ARE BELOW, because none came.
    expect(painted.filter((one) => one.below), told(frames)).toEqual([])
  } finally {
    await context.close()
  }
}, 240_000)

