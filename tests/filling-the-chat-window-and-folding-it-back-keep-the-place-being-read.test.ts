// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FILLING THE CHAT WINDOW AND FOLDING IT BACK KEEP THE PLACE BEING READ.
 *
 * At 1440 by 900 the chat is open as its window, on a long conversation, scrolled some way up from its newest message.
 * Pressing the press that fills the window, and pressing it again to fold the window back, should leave the message
 * being read where it was. It was measured in wave 13y: both presses put the list at its newest message.
 *
 * WHERE IT WAS, as the chat keeps it (keepThePlace in src/web/components/Chat.tsx): when both edges of the list move,
 * the row being read keeps its distance from the list's bottom edge. Filling the window and folding it back move both
 * edges. So this test asks that the row's top stays within 2 px of its distance from the list's bottom edge, and that
 * the list is more than 8 px above its end, which the chat counts as the newest message.
 *
 * The code was read on today's main, and the place is kept there, so this test is expected to pass on main's code. If
 * it fails, the fault is still there.
 *
 * Everything here is made up: the agent and every message. The servers come from `liveApp` in tests/helpers.ts.
 */
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, theAnswerToAWriteInATestOffice, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/** A made-up agent whose conversation is long enough to be read some way up. */
const AGENT = { name: 'Made-up Kiln Keeper', handle: 'made-up-kiln-keeper', messages: 90 } as const
const WINDOW = '.px-chat[data-where="corner"]'
/** How near the row has to stay to its distance from the list's bottom edge, in pixels. */
const SAME_PLACE_PX = 2
/** Eight pixels is the bottom, as the chat itself counts it. */
const BOTTOM_PX = 8

type Reading = { words: string; fromTheBottom: number }

let app: LiveApp
let agentId = ''

async function say(headers: Record<string, string>, body: string, to: { kind: string; id: string }): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [to] } }) })
  expect(said.status, await said.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, { kind: 'message', data: { to: [to] } }))
}

/** Every third line is long, so the rows differ in height and wrap again when the conversation widens. */
function aLine(n: number): string {
  const long = n % 3 === 0 ? ' The made-up log for this line runs on, so the row takes three or four lines of the chat and the list is long enough to scroll a good way.' : ''
  return `Made-up line ${String(n)} with ${AGENT.name}.${long}`
}

/** A browser window with the chat open as its window, on the made-up agent's conversation. */
async function aWindow(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })
  await context.addInitScript(
    ([key]) => {
      localStorage.setItem('mole-office.preset.theme', 'light')
      localStorage.setItem('mole-office.language', 'en')
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.chat.open', 'yes')
      localStorage.setItem('mole-office.chat.with', key)
    },
    [participantKey({ kind: 'agent', id: agentId })] as const,
  )
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(`${WINDOW} .px-chat-them`, { hasText: AGENT.name }).waitFor({ timeout: 30_000 })
  await page.waitForFunction(
    ([list, n]) => document.querySelectorAll(`${list} .px-chat-said .px-chat-words`).length >= n,
    [WINDOW, 50] as const,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(800)
  return { context, page }
}

/** Scroll the list up by the wheel, as a reader does, and give the chat a moment to keep where the reader is. */
async function wheelUp(page: Page, by: number): Promise<void> {
  const box = await page.locator(`${WINDOW} .px-chat-said`).boundingBox()
  if (box === null) throw new Error('the message list is not drawn')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let gone = 0; gone < by; gone += 100) {
    await page.mouse.wheel(0, -100)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(1_000)
}

/** The message row across the middle of the list: its words and how far its top is above the list's bottom edge. */
async function theRowInTheMiddle(page: Page): Promise<Reading> {
  return page.evaluate((selector) => {
    const list = document.querySelector<HTMLElement>(`${selector} .px-chat-said`)
    if (list === null) throw new Error('no list')
    const box = list.getBoundingClientRect()
    const middle = box.top + box.height / 2
    for (const row of list.children) {
      const words = row.querySelector('.px-chat-words')?.textContent ?? ''
      const its = row.getBoundingClientRect()
      if (words !== '' && its.bottom >= middle) return { words, fromTheBottom: Math.round(box.bottom - its.top) }
    }
    throw new Error('no row reaches the middle of the list')
  }, WINDOW)
}

/** The same message is drawn at the same distance from the list's bottom edge, and the list is not at its newest message. */
async function stillReading(page: Page, looking: Reading, after: string): Promise<void> {
  const now = await page.evaluate(
    ([selector, wanted]) => {
      const list = document.querySelector<HTMLElement>(`${selector} .px-chat-said`)
      if (list === null) return { fromTheBottom: null, gap: 0 }
      const gap = Math.round(list.scrollHeight - list.clientHeight - list.scrollTop)
      const box = list.getBoundingClientRect()
      for (const row of list.children) {
        if ((row.querySelector('.px-chat-words')?.textContent ?? '') === wanted) return { fromTheBottom: Math.round(box.bottom - row.getBoundingClientRect().top), gap }
      }
      return { fromTheBottom: null, gap }
    },
    [WINDOW, looking.words] as const,
  )
  const what = `"${looking.words.slice(0, 40)}" ${after}`
  expect(now.fromTheBottom, `${what} is not drawn; the list is ${String(now.gap)} px above its end`).not.toBeNull()
  expect(
    Math.abs((now.fromTheBottom ?? 0) - looking.fromTheBottom),
    `${what} was ${String(looking.fromTheBottom)} px above the list's bottom edge and is ${String(now.fromTheBottom)} px`,
  ).toBeLessThanOrEqual(SAME_PLACE_PX)
  expect(now.gap, `${after}, the list went to its newest message`).toBeGreaterThan(BOTTOM_PX)
}

beforeAll(async () => {
  app = await liveApp({ name: 'filling-the-chat-window', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }) })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const agents = ((await (await fetch(`${app.api}/api/participants`, { headers: PERSON })).json()) as { agents: { id: string; handle: string }[] }).agents
  agentId = agents.find((one) => one.handle === AGENT.handle)?.id ?? ''
  expect(agentId, AGENT.handle).not.toBe('')
  const asTheAgent = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle }
  for (let n = 1; n <= AGENT.messages; n += 1) {
    if (n % 2 === 0) await say(asTheAgent, aLine(n), { kind: 'person', id: THE_PERSON })
    else await say(PERSON, aLine(n), { kind: 'agent', id: agentId })
  }
}, 600_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('filling the chat window and folding it back keep the message being read at its distance from the list\'s bottom edge', async () => {
  const { context, page } = await aWindow()
  try {
    await wheelUp(page, 2_000)
    const looking = await theRowInTheMiddle(page)

    await page.click(`${WINDOW} .px-chat-fill`)
    await page.waitForSelector(`${WINDOW}[data-full="yes"]`, { timeout: 10_000 })
    await page.waitForTimeout(600)
    await stillReading(page, looking, 'after filling the window')

    await page.click(`${WINDOW} .px-chat-fill`)
    await page.waitForSelector(`${WINDOW}[data-full="no"]`, { timeout: 10_000 })
    await page.waitForTimeout(600)
    await stillReading(page, looking, 'after folding the window back')
  } finally {
    await context.close()
  }
}, 180_000)
