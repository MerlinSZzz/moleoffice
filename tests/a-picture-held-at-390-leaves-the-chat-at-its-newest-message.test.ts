// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PICTURE HELD AT 390 LEAVES THE CHAT AT ITS NEWEST MESSAGE.
 *
 * At 390 by 844 the chat covers the whole screen. A conversation is open at its newest message. Holding a picture to
 * send draws the held picture's row above the writing box, so the message list gets shorter. The list should still end
 * at its newest message: its scrollHeight minus scrollTop minus clientHeight is under 1 px once the row has settled.
 *
 * On 14 Nov this was measured at 25 px: the foot of the newest message, with its time, was cut off under the held
 * picture's row, and it was the same 1.5 s later. The list had reached its end and was then scrolled back 25 px. The
 * chat was beside the page on the left in dark, and on the right in light. The cause was never found by reading the
 * code, so this test is the measurement. If it fails on main's code, the fault is still there. If it passes, the fault
 * is gone and this test keeps it gone.
 *
 * Each case also checks that the list did get shorter, so a case that passes has asked the question.
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
const AGENT = { name: 'Made-up Kiln Keeper', handle: 'made-up-kiln-keeper', messages: 30 } as const
/** A one pixel png, so what is held is a real picture. */
const A_REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
/** The chat beside the page, which covers the screen at 390. */
const SIDE = '.px-chat[data-where="split"]'
/** How long the held picture's row is given to settle, as in the measurement. */
const SETTLE_MS = 1_500
/** Under one pixel from the end is the newest message. */
const AT_THE_END_PX = 1

let app: LiveApp
let agentId = ''

async function say(headers: Record<string, string>, body: string, to: { kind: string; id: string }): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [to] } }) })
  expect(said.status, await said.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, { kind: 'message', data: { to: [to] } }))
}

/** Every third line is long, so the rows differ in height and the list is long enough to scroll. */
function aLine(n: number): string {
  const long = n % 3 === 0 ? ' The made-up log for this line runs on, so the row takes three or four lines of the chat and the list scrolls.' : ''
  return `Made-up line ${String(n)} with ${AGENT.name}.${long}`
}

/** A phone-sized window with the chat beside the page on one side, open on the made-up agent's conversation. */
async function aPhone(side: 'left' | 'right', theme: 'light' | 'dark'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme })
  await context.addInitScript(
    ([look, where, key]) => {
      localStorage.setItem('mole-office.preset.theme', look)
      localStorage.setItem('mole-office.language', 'en')
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.chat.open', 'split')
      localStorage.setItem('mole-office.chat.split-side', where)
      localStorage.setItem('mole-office.chat.with', key)
    },
    [theme, side, participantKey({ kind: 'agent', id: agentId })] as const,
  )
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(`${SIDE} .px-chat-them`, { hasText: AGENT.name }).waitFor({ timeout: 30_000 })
  await page.waitForFunction(
    ([list, n]) => document.querySelectorAll(`${list} .px-chat-said .px-chat-words`).length >= n,
    [SIDE, AGENT.messages] as const,
    { timeout: 30_000 },
  )
  await page.locator(`${SIDE} .px-chat-write textarea`).waitFor({ timeout: 30_000 })
  return { context, page }
}

/** How far the message list is above its end, and how tall it is. */
async function theList(page: Page): Promise<{ gap: number; height: number }> {
  return page.evaluate((selector) => {
    const list = document.querySelector<HTMLElement>(`${selector} .px-chat-said`)
    if (list === null) throw new Error('no message list is drawn')
    return { gap: list.scrollHeight - list.scrollTop - list.clientHeight, height: list.clientHeight }
  }, SIDE)
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-picture-held-at-390', viewport: { width: 390, height: 844 }, workspace: 'default' })
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

for (const [side, theme] of [
  ['left', 'dark'],
  ['right', 'light'],
] as const) {
  it(`a picture held at 390 with the chat beside the page on the ${side} in ${theme} leaves the list at its newest message`, async () => {
    const { context, page } = await aPhone(side, theme)
    try {
      const chat = await page.locator(SIDE).boundingBox()
      expect(chat?.width, 'the chat does not cover the screen').toBe(390)
      await expect
        .poll(async () => (await theList(page)).gap, { message: 'the conversation did not open at its newest message', timeout: 10_000 })
        .toBeLessThan(AT_THE_END_PX)
      const before = await theList(page)

      await page.setInputFiles(`${SIDE} .px-chat-attach-file`, { name: 'made-up-shot.png', mimeType: 'image/png', buffer: A_REAL_PNG })
      // HELD AS A PICTURE, drawn and loaded. A file chosen before the picture types are read is held as a file first
      // and decided again once they are, so this waits for the picture itself.
      await page.waitForFunction(
        (selector) => ((document.querySelector(`${selector} .px-chat-attach-held img`) as HTMLImageElement | null)?.naturalWidth ?? 0) > 0,
        SIDE,
        { timeout: 15_000 },
      )
      await page.waitForTimeout(SETTLE_MS)

      const after = await theList(page)
      expect(after.height, 'holding the picture did not make the list shorter, so this case asks nothing').toBeLessThan(before.height)
      expect(after.gap, `the list rests ${String(Math.round(after.gap))} px short of its newest message`).toBeLessThan(AT_THE_END_PX)
    } finally {
      await context.close()
    }
  }, 180_000)
}
