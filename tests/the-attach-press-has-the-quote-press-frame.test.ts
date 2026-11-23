// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ATTACH PRESS HAS THE QUOTE PRESS'S FRAME (wave 13y).
 *
 * The person asked for a frame on the attach press in the chat's writing row, so that it matches the quote press beside
 * it. The quote press has an edge, rounded corners and a ground under the pointer. The attach press had no edge.
 *
 * In a real browser against a Mole Office of its own, at 1440, with the chat beside the page and open at a made-up
 * agent, in the light theme and in the dark: the two presses are drawn with the same frame at rest, under the pointer
 * and pressed. The frame is the size, the edge on each side, the rounding of each corner and the ground. The shape
 * inside each press keeps its own colour, so the colour is not compared. Each press has an edge at rest.
 *
 * Everything here is made up: the agent. The servers come from `liveApp` in tests/helpers.ts, on a database in its own
 * temporary folder.
 */

import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { type LiveApp, liveApp, openRecordPagesAt, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const ATTACH = '.px-chat-write .px-chat-attach-add'
const QUOTE = '.px-chat-write .px-chat-quote-press'

let app: LiveApp
let agentKey = ''

beforeAll(async () => {
  app = await liveApp({ name: 'the-attach-press-frame', viewport: { width: 1440, height: 900 }, workspace: 'default', opensAt: 'full' })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Frame Agent', data: { handle: 'made-up-frame-agent', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  const agentId = agents.find((one) => one.handle === 'made-up-frame-agent')?.id ?? ''
  expect(agentId, 'made-up-frame-agent has no registry row').not.toBe('')
  agentKey = participantKey({ kind: 'agent', id: agentId })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** A browser window of its own in this theme, with the chat beside the page and open at the made-up agent. */
async function aWindow(theme: 'light' | 'dark'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme })
  await openRecordPagesAt(context, 'full')
  await context.addInitScript(
    ([look, chatWith]) => {
      localStorage.setItem('mole-office.preset.theme', look)
      localStorage.setItem('mole-office.language', 'en')
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.chat.open', 'split')
      localStorage.setItem('mole-office.chat.split-side', 'right')
      localStorage.setItem('mole-office.chat.with', chatWith)
    },
    [theme, agentKey] as const,
  )
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(ATTACH).waitFor({ state: 'visible', timeout: 30_000 })
  await page.locator(QUOTE).waitFor({ state: 'visible', timeout: 30_000 })
  expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
  return { context, page }
}

/** The frame of one press as drawn: its size, the edge on each side, the rounding of each corner and its ground. */
async function theFrame(page: Page, selector: string): Promise<Record<string, string>> {
  return page.locator(selector).evaluate((press) => {
    const style = getComputedStyle(press)
    const box = press.getBoundingClientRect()
    const frame: Record<string, string> = {
      width: box.width.toFixed(1),
      height: box.height.toFixed(1),
      ground: style.backgroundColor,
    }
    for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
      frame[`edge${side}`] = `${style.getPropertyValue(`border-${side.toLowerCase()}-width`)} ${style.getPropertyValue(`border-${side.toLowerCase()}-style`)} ${style.getPropertyValue(`border-${side.toLowerCase()}-color`)}`
    }
    for (const corner of ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const) {
      frame[corner] = style.getPropertyValue(`border-${corner}-radius`)
    }
    return frame
  })
}

/** The middle of a press, where the pointer goes. */
async function middleOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox()
  if (box === null) throw new Error(`${selector} is not drawn`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** The frame of a press under the pointer, and pressed: the pointer held down on it. It is let go off the press. */
async function underThePointer(page: Page, selector: string): Promise<{ over: Record<string, string>; pressed: Record<string, string> }> {
  const at = await middleOf(page, selector)
  await page.mouse.move(at.x, at.y)
  const over = await theFrame(page, selector)
  await page.mouse.down()
  const pressed = await theFrame(page, selector)
  // LET GO OFF THE PRESS, so the press does nothing: no file chooser and no picking.
  await page.mouse.move(1, 1)
  await page.mouse.up()
  return { over, pressed }
}

describe('the attach press and the quote press', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`share one frame at rest, under the pointer and pressed, in the ${theme} theme`, async () => {
      const { context, page } = await aWindow(theme)
      try {
        await page.mouse.move(1, 1)
        const rest = { attach: await theFrame(page, ATTACH), quote: await theFrame(page, QUOTE) }
        expect(rest.attach['edgeTop'], 'the attach press has no edge').not.toMatch(/^0px|none/)
        expect(rest.attach, 'the two presses differ at rest').toEqual(rest.quote)
        const attach = await underThePointer(page, ATTACH)
        const quote = await underThePointer(page, QUOTE)
        expect(attach.over, 'the two presses differ under the pointer').toEqual(quote.over)
        expect(attach.over.ground, 'the attach press has no ground under the pointer').not.toBe(rest.attach['ground'])
        expect(attach.pressed, 'the two presses differ pressed').toEqual(quote.pressed)
        expect(await page.locator(QUOTE).getAttribute('aria-pressed'), 'letting go off the quote press started picking').toBe('false')
      } finally {
        await context.close()
      }
    }, 180_000)
  }
})
