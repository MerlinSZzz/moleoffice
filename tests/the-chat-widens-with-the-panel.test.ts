// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT'S MESSAGES WIDEN WITH THE PANEL.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Widening the panel did not widen the message boxes (perhaps the max was narrow), while narrowing
 * it worked. Criterion M102.
 *
 * Measured at commit 4c77b62a: src/web/components/Chat.tsx drew a message box at
 * `max-width: 15rem`, which is 240 pixels whatever the panel is. The panel starts at 21rem and a
 * person may drag it out to the window's width, so a panel dragged to 900 pixels drew a 240 pixel
 * message with 600 pixels of nothing beside it. The guess in the brackets was right.
 *
 * Narrowing worked for this reason: below about 300 pixels the row itself is
 * narrower than 240 and the fixed cap never applies.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED
 * ---------------------------------------------------------------------------------------
 *
 * The box's width against the list's own width, at the three widths the panel is drawn at with its
 * stored size (660, 990, 1440) and at a panel dragged out to the window. The reading is a share
 * rather than a number of pixels, because the number is what changes and the share is what the
 * criterion is about. Narrowing is checked too, at 390, where the panel is the whole screen.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { TWO_COLUMNS_FROM } from '../src/web/lib/chat-split.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChatWindow } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

/** Long enough to fill any width this test gives it. */
const A_LONG_ONE =
  'A message long enough to reach whatever width the box is given, because the thing being measured ' +
  'is the cap on the box and not the length of the words. It has to be longer than the panel at 1440 ' +
  'and longer again than a panel dragged out to the whole window, so it goes on for a while yet, and ' +
  'here it still is.'

async function say(body: string): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'message',
      title: body.slice(0, 30),
      data: { body, to: [{ kind: 'agent', id: 'wide-agent' }] },
    }),
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(said.status, await said.clone().text()).toBe(409)
}

async function openTheConversation(size: { width: number; height: number }): Promise<void> {
  await app.page.setViewportSize(size)
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChatWindow(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-said')) === null) {
    await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
    await app.page.click('.px-chat-contact:has(.px-chat-name:text-is("Wide Agent"))')
  }
  await app.page.waitForSelector('.px-chat-bubble', { timeout: 20_000 })
}

/** The widest message box on screen, and the list it is drawn in. */
async function theWidths(): Promise<{ bubble: number; list: number; panel: number }> {
  return app.page.evaluate(() => {
    const bubbles = [...document.querySelectorAll('.px-chat-bubble')]
    const widest = Math.max(...bubbles.map((one) => one.getBoundingClientRect().width))
    const list = document.querySelector('.px-chat-said')
    const panel = document.querySelector('.px-chat')
    return {
      bubble: Math.round(widest),
      list: Math.round(list === null ? 0 : list.clientWidth),
      panel: Math.round(panel === null ? 0 : panel.getBoundingClientRect().width),
    }
  })
}

/** Drag the panel's left edge out by this many pixels, as a pointer really does it. */
async function widenThePanel(by: number): Promise<void> {
  const at = await app.page.$eval('.px-chat-grip[data-edge="left"]', (one) => {
    const box = one.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })
  await app.page.mouse.move(at.x, at.y)
  await app.page.mouse.down()
  await app.page.mouse.move(at.x - by / 2, at.y, { steps: 4 })
  await app.page.mouse.move(at.x - by, at.y, { steps: 4 })
  await app.page.mouse.up()
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-wide', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Wide Agent',
      data: { handle: 'wide-agent', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  await say(A_LONG_ONE)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('a message box takes the room the panel has', () => {
  for (const width of [660, 990, 1440]) {
    it(`fills most of the panel at ${String(width)}`, async () => {
      await openTheConversation({ width, height: 1000 })
      const seen = await theWidths()
      expect(seen.list, 'the list has no width, so nothing is being measured').toBeGreaterThan(100)
      // MOST OF THE ROW, AND NEVER MORE THAN IT. The cap is a share, so this is the share.
      expect(seen.bubble / seen.list).toBeGreaterThan(0.7)
      expect(seen.bubble).toBeLessThanOrEqual(seen.list)
      // AND THE FIXED CAP IS GONE. 15rem was 240 pixels whatever the panel was.
      expect(seen.bubble, 'the box is still held at the old fixed cap').toBeGreaterThan(245)
    }, 180_000)
  }

  it('grows when the panel itself is dragged wider, which is what the person did', async () => {
    await openTheConversation({ width: 1440, height: 1000 })
    const before = await theWidths()

    // STAY IN ONE COLUMN FIRST because a wider chat draws its lists beside the conversation.
    await widenThePanel(TWO_COLUMNS_FROM * 0.9 - before.panel)
    await app.page.waitForFunction(
      (was) => {
        const panel = document.querySelector('.px-chat')
        return panel !== null && panel.getBoundingClientRect().width > was + 200
      },
      before.panel,
      { timeout: 15_000 },
    )

    const after = await theWidths()
    expect(after.panel, 'the panel did not widen, so nothing is being measured').toBeGreaterThan(before.panel + 200)
    expect(after.bubble, 'the message box did not grow with the panel').toBeGreaterThan(before.bubble + 150)
    expect(after.bubble / after.list).toBeGreaterThan(0.7)

    await widenThePanel(TWO_COLUMNS_FROM * 1.1 - after.panel)
    await app.page.waitForSelector('.px-chat-columns[data-columns="two"]', { timeout: 15_000 })
    const wider = await theWidths()
    expect(wider.bubble, 'the message box is not wider than before the first drag').toBeGreaterThan(before.bubble)
    expect(wider.bubble / wider.list).toBeGreaterThan(0.7)
  }, 180_000)

  it('still narrows at 390, where the panel is the whole screen', async () => {
    await openTheConversation({ width: 390, height: 844 })
    const seen = await theWidths()
    expect(seen.bubble).toBeLessThanOrEqual(seen.list)
    expect(seen.bubble / seen.list).toBeGreaterThan(0.6)
    // AND NOTHING SCROLLS SIDEWAYS because a box grew past the panel.
    const sideways = await app.page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(sideways, 'the page scrolls sideways at 390').toBe(false)
  }, 180_000)
})
