// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT PANEL CAN BE CLOSED AT 390, WHICH IS THE ONLY WIDTH WHERE IT COULD NOT BE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M17 took the close cross off the chat panel, because pressing the circle at the
 * bottom right folded it. Before design D, the circle at the bottom right was the whole of how the
 * panel was closed. Design D draws no circle below the width at which the page turns wide (THE_SHELL_WIDTH): the top bar's chat press opens the
 * panel, and the panel's own back press closes it.
 *
 * At 390 the panel was `left: 0; right: 0; bottom: 0`, so it covered the bottom of the screen and
 * the circle was inside it. Both carry `z-index: var(--z-drawer)`, so the panel — later in the
 * document — painted over the circle and the press could not land. The panel could only be closed
 * by making the window wider. Problem `vKXFAHteKv-O`, found by Builder BC taking the round-six
 * photographs on 4 September 2026: Playwright refused the press and said the panel intercepted it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED, AND WHY IT IS CHECKED TWICE
 * ---------------------------------------------------------------------------------------
 *
 * The press is the thing the person does, so the press is the test: open the panel at 390, press
 * its close press, and the panel is gone. The old geometry check, the panel clear of the circle,
 * has nothing left to measure below the width at which the page turns wide (THE_SHELL_WIDTH). So what is measured now is that the panel covers the whole
 * window at 390, and that a press at its middle reaches the chat.
 *
 * And the panel's own close press is read for, at both widths. That case used to read the panel for
 * the ABSENCE of one, because criterion M17 had taken every close control off and the cheapest way
 * to make the circle's press work would have been to put one back. Criterion M104 put one back on
 * a later request, at the top right, beside a press that makes the panel fill the window — and the
 * reason given is this file's own subject: a panel filling the window covers the circle. So the
 * case now reads that at 390 there is one back press at the top, and at 1440 one close press at the
 * top right, and that no conversation header draws one, which is the half of M17 that still governs.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'
import { THE_SHELL_WIDTH } from '../src/web/lib/the-shell-width.ts'

let app: LiveApp

/** A phone. 390 is one of the four widths every screen in this product is photographed at. */
const PHONE = { width: 390, height: 844 }
/** The desk, for the half of this that is about M17 rather than about the phone. */
const DESK = { width: 1440, height: 1000 }

beforeAll(async () => {
  app = await liveApp({ name: 'chat-closes-390', viewport: PHONE })
}, 180_000)

afterAll(async () => {
  await app.stop()
})

/** Open the page at one width and press the chat's drawn opener until the panel is up. */
async function openThePanel(size: { width: number; height: number }): Promise<void> {
  await app.page.setViewportSize(size)
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page)
  if (size.width < THE_SHELL_WIDTH) {
    // DESIGN D'S DRAWN WAY BELOW THE WIDTH AT WHICH THE PAGE TURNS WIDE (THE_SHELL_WIDTH): THE TOP BAR'S CHAT PRESS, WHICH COVERS THE SCREEN WITH THE CHAT.
    await app.page.waitForSelector('.shell-bar .shell-chat-phone', { timeout: 20_000 })
    if ((await app.page.$('.px-chat')) === null) await app.page.click('.shell-bar .shell-chat-phone')
    // THE CHAT OPENS THE WAY THE PERSON LAST HAD IT, and the corner window when nothing is kept. These cases are about
    // the chat that covers the screen beside the page, so a window is put there by its own press.
    await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
    if ((await app.page.$('.px-chat[data-where="corner"]')) !== null) await app.page.click('.px-chat[data-where="corner"] .px-chat-beside')
    await app.page.waitForSelector('.px-chat[data-where="split"]', { timeout: 20_000 })
  } else {
    await openTheChat(app.page)
  }
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
}

/** Where an element is on the screen, or null when it is not drawn. */
async function boxOf(selector: string): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const element = await app.page.$(selector)
  if (element === null) return null
  return element.boundingBox()
}

describe('the panel the phone bar opens can be closed by its close press', () => {
  it('collapses when its back press is pressed at 390', async () => {
    await openThePanel(PHONE)

    // The press itself. The click is refused if something covers the back press, so this line
    // catches that. The old fault cannot come back at 390: no corner circle is drawn there.
    await app.page.click('.px-chat-seam-back', { timeout: 10_000 })

    await app.page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })
    expect(await app.page.$('.px-chat'), 'the panel is still on screen after the back press was pressed').toBeNull()
  }, 120_000)

  it('covers the whole window at 390, rather than sitting clear of a circle that is not drawn', async () => {
    await openThePanel(PHONE)

    const panel = await boxOf('.px-chat')
    expect(panel, 'the panel is not on screen').not.toBeNull()
    if (panel === null) return

    // DESIGN D DRAWS NO CORNER CIRCLE BELOW THE WIDTH AT WHICH THE PAGE TURNS WIDE (THE_SHELL_WIDTH). The top bar opens the chat, and the panel covers
    // the whole window rather than being drawn clear of a floating button.
    expect(panel, `the panel (${JSON.stringify(panel)}) is not the whole window`).toEqual({
      x: 0,
      y: 0,
      width: PHONE.width,
      height: PHONE.height,
    })

    // AND THE PANEL IS WHAT A PRESS AT THE MIDDLE OF THE WINDOW REACHES.
    const atTheCentre = await app.page.evaluate(
      ([x, y]) => {
        const found = document.elementFromPoint(x as number, y as number)
        return found === null ? null : found.closest('.px-chat') === null ? 'something else' : 'the chat'
      },
      [PHONE.width / 2, PHONE.height / 2] as const,
    )
    expect(atTheCentre, 'something else is drawn over the middle of the panel').toBe('the chat')
  }, 120_000)

  it('has exactly one drawn close press, at 390 and at 1440', async () => {
    // THE CLOSE PRESS ABOVE IS THE DRAWN ONE; this case reads its place.
    //
    // Criterion M17 took every close control off the panel, because pressing the circle at the
    // bottom right folded it, and this case read the panel for the absence
    // of one. Criterion M104 put one back at the top right, together with the full-screen
    // press, because on a phone a panel with no close press was hard to leave, above all at
    // full screen: a panel filling the window covers the circle.
    //
    // So what is read now is that there is ONE and it is where M104 puts it. More than one is
    // the state M17 was about: a cross in a header that closes the whole panel when what somebody
    // wanted was to stop editing a line.
    for (const size of [PHONE, DESK]) {
      await openThePanel(size)
      if (size.width < THE_SHELL_WIDTH) {
        // DESIGN D'S COVERING PANEL DRAWS ONE BACK PRESS, and no top-right close press. The close
        // press at the top right belongs to the chat's own window, which this file opens at 1440.
        const backs = await app.page.$$('.px-chat .px-chat-seam-back')
        expect(backs.length, `the panel does not draw exactly one back press at ${String(size.width)}`).toBe(1)
        const where = await app.page.evaluate(() => {
          const panel = document.querySelector('.px-chat')
          const press = document.querySelector('.px-chat-seam-back')
          if (panel === null || press === null) return null
          const box = panel.getBoundingClientRect()
          const at = press.getBoundingClientRect()
          return { fromTheTop: Math.round(at.top - box.top), inside: at.left >= box.left && at.right <= box.right }
        })
        expect(where, `no back press is drawn at ${String(size.width)}`).not.toBeNull()
        expect(where?.fromTheTop, `the back press is not at the top at ${String(size.width)}`).toBeLessThan(24)
        expect(where?.inside, `the back press is outside the panel at ${String(size.width)}`).toBe(true)
        const crosses = await app.page.$$('.px-chat .px-chat-shut, .px-chat .px-chat-close')
        expect(crosses.length, `the covering panel draws a top-right close press at ${String(size.width)}`).toBe(0)
      } else {
        const crosses = await app.page.$$('.px-chat .px-chat-shut, .px-chat .px-chat-close')
        expect(crosses.length, `the panel does not draw exactly one close press at ${String(size.width)}`).toBe(1)
        const where = await app.page.evaluate(() => {
          const panel = document.querySelector('.px-chat')
          const press = document.querySelector('.px-chat-close')
          if (panel === null || press === null) return null
          const box = panel.getBoundingClientRect()
          const at = press.getBoundingClientRect()
          return { fromTheRight: Math.round(box.right - at.right), fromTheTop: Math.round(at.top - box.top) }
        })
        expect(where, `no close press is drawn at ${String(size.width)}`).not.toBeNull()
        expect(where?.fromTheRight, `the close press is not at the right at ${String(size.width)}`).toBeLessThan(24)
        expect(where?.fromTheTop, `the close press is not at the top at ${String(size.width)}`).toBeLessThan(24)
      }
      // AND NOTHING IN A CONVERSATION'S HEADER CLOSES THE PANEL, which is criterion M17's own half.
      const inAHeader = await app.page.$$('.px-chat-me .px-chat-close, .px-chat-them .px-chat-close')
      expect(inAHeader.length, `a header draws a close press at ${String(size.width)}`).toBe(0)
    }
  }, 180_000)
})
