// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT HAS A FULL-SCREEN PRESS AND A CLOSE PRESS AT THE TOP RIGHT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ASKED FOR
 * ---------------------------------------------------------------------------------------
 *
 * The chat gets a full-screen press, and a close press at the top right again that folds it. On a
 * phone there was no handy way to close it, above all at full screen. Criterion M104.
 *
 * Two presses, and the second sentence is the reason for both being needed at once. The panel is
 * collapsed by the circle at the bottom right (criterion M17: no close cross, because pressing the
 * circle folds it). A panel filling the window covers that circle, so
 * on a phone there would be no way out of it at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE PANEL HAD BEFORE
 * ---------------------------------------------------------------------------------------
 *
 * Measured at commit 4c77b62a: the panel carried three drag handles and nothing else of its own.
 * There was no full-screen press and no close press at any width, and at 390 the drag handles are
 * not drawn either, so the panel's whole chrome was empty.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED, 390 FIRST
 * ---------------------------------------------------------------------------------------
 *
 * At 390 because that is the phone width the fault was seen at. The panel really fills the window,
 * measured against the window's own box; the press goes back; the close press folds the panel; and
 * the close press is still reachable while the panel is full screen, which is the case the second sentence
 * is about. Then the same at 1440.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChatWindow } from './open-the-chat.ts'

let app: LiveApp

const PHONE = { width: 390, height: 844 }
const DESK = { width: 1440, height: 1000 }

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

async function openThePanel(size: { width: number; height: number }): Promise<void> {
  await app.page.setViewportSize(size)
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChatWindow(app.page)
  await app.page.waitForSelector('.px-chat-chrome', { timeout: 20_000 })
}

/** The panel's box against the window's. */
async function thePanel(): Promise<{
  left: number
  top: number
  right: number
  bottom: number
  window: { width: number; height: number }
  full: string | null
}> {
  return app.page.$eval('.px-chat', (one) => {
    const at = one.getBoundingClientRect()
    return {
      left: Math.round(at.left),
      top: Math.round(at.top),
      right: Math.round(at.right),
      bottom: Math.round(at.bottom),
      window: { width: window.innerWidth, height: window.innerHeight },
      full: one.getAttribute('data-full'),
    }
  })
}

/** Put the panel back in the corner, whatever the last case left it as. */
async function backToTheCorner(): Promise<void> {
  const said = await app.page.$eval('.px-chat-fill', (one) => one.getAttribute('aria-label'))
  if (said === CHAT_WORDS.backToTheCorner) await app.page.click('.px-chat-fill')
  await app.page.waitForFunction(
    () => document.querySelector('.px-chat')?.getAttribute('data-full') === 'no',
    undefined,
    { timeout: 15_000 },
  )
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-full-screen', viewport: PHONE })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Full Agent',
      data: { handle: 'full-agent', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

for (const size of [PHONE, DESK]) {
  describe(`the two presses at ${String(size.width)}`, () => {
    it('draws both of them at the top right of the panel', async () => {
      await openThePanel(size)
      await backToTheCorner()

      const where = await app.page.$eval('.px-chat', (panel) => {
        const box = panel.getBoundingClientRect()
        const read = (selector: string): { fromTheRight: number; fromTheTop: number } | null => {
          const one = panel.querySelector(selector)
          if (one === null) return null
          const at = one.getBoundingClientRect()
          return { fromTheRight: Math.round(box.right - at.right), fromTheTop: Math.round(at.top - box.top) }
        }
        return { fill: read('.px-chat-fill'), close: read('.px-chat-close') }
      })

      expect(where.fill, 'no full-screen press is drawn').not.toBeNull()
      expect(where.close, 'no close press is drawn').not.toBeNull()
      for (const one of [where.fill, where.close]) {
        expect(one?.fromTheRight, 'a press is not at the right of the panel').toBeLessThan(48)
        expect(one?.fromTheTop, 'a press is not at the top of the panel').toBeLessThan(24)
      }
      // THE CLOSE PRESS IS THE RIGHTMOST OF THE TWO, which is where a window's own close press is.
      expect(Number(where.close?.fromTheRight)).toBeLessThan(Number(where.fill?.fromTheRight))
    }, 180_000)

    it('fills the window when the first is pressed, and comes back when it is pressed again', async () => {
      await openThePanel(size)
      await backToTheCorner()
      const before = await thePanel()
      expect(before.full).toBe('no')

      await app.page.click('.px-chat-fill')
      await app.page.waitForFunction(
        () => document.querySelector('.px-chat')?.getAttribute('data-full') === 'yes',
        undefined,
        { timeout: 15_000 },
      )

      const now = await thePanel()
      expect(now.left, 'the panel does not reach the left edge').toBe(0)
      expect(now.top, 'the panel does not reach the top edge').toBe(0)
      expect(now.right, 'the panel does not reach the right edge').toBe(now.window.width)
      expect(now.bottom, 'the panel does not reach the bottom edge').toBe(now.window.height)
      // AND THERE IS NOTHING TO DRAG, because a panel that is the window has no edge to move.
      expect(await app.page.$$('.px-chat-grip:visible')).toEqual([])

      // THE SAME PRESS PUTS IT BACK, and it says so.
      const said = await app.page.$eval('.px-chat-fill', (one) => one.getAttribute('aria-label'))
      expect(said).toBe(CHAT_WORDS.backToTheCorner)
      await app.page.click('.px-chat-fill')
      await app.page.waitForFunction(
        () => document.querySelector('.px-chat')?.getAttribute('data-full') === 'no',
        undefined,
        { timeout: 15_000 },
      )
      const after = await thePanel()
      // AT 390 THE PANEL IS ALREADY BOTH EDGES WIDE AND STANDS ON THE FOOT OF THE WINDOW, which are its own
      // criteria, so the width and the foot say nothing there. What says it came back at every width is that its
      // top is below the window's top again.
      expect(after.top, 'the panel stayed at the top edge after coming back').toBeGreaterThan(0)
      if (size.width > 640) {
        expect(after.bottom, 'the panel stayed at the bottom edge after coming back').toBeLessThan(after.window.height)
        expect(after.left, 'the panel stayed at the left edge after coming back').toBeGreaterThan(0)
      }
    }, 180_000)

    it('folds the panel when the close press is pressed', async () => {
      await openThePanel(size)
      await backToTheCorner()
      await app.page.click('.px-chat-close')
      await app.page.waitForSelector('.px-chat', { state: 'detached', timeout: 15_000 })
      expect(await app.page.$('.px-chat'), 'the panel is still on screen after the close press').toBeNull()
      // AND THE SIDEBAR OPENS IT AGAIN, so closing folds the panel and loses nothing else. Design D draws the circle
      // only while the chat is shut and a message waits, so the test opens it the way a person has without one.
      await openTheChatWindow(app.page)
    }, 180_000)

    it('closes from full screen, which is the case the person wrote about', async () => {
      await openThePanel(size)
      await backToTheCorner()
      await app.page.click('.px-chat-fill')
      await app.page.waitForFunction(
        () => document.querySelector('.px-chat')?.getAttribute('data-full') === 'yes',
        undefined,
        { timeout: 15_000 },
      )

      // THE CIRCLE IS UNDER THE PANEL NOW, which is why the close press has to be there. Playwright
      // refuses a press another element would take, so this is the measurement as well as the act.
      await app.page.click('.px-chat-close', { timeout: 10_000 })
      await app.page.waitForSelector('.px-chat', { state: 'detached', timeout: 15_000 })

      // AND IT OPENS FULL SCREEN AGAIN, because that is what the reader last said they wanted.
      await openTheChatWindow(app.page)
      await app.page.waitForFunction(
        () => document.querySelector('.px-chat')?.getAttribute('data-full') === 'yes',
        undefined,
        { timeout: 15_000 },
      )
      await backToTheCorner()
    }, 180_000)
  })
}
