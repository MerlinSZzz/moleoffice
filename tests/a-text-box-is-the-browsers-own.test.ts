// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RIGHT-CLICK IN A TEXT BOX GIVES THE BROWSER'S OWN MENU. EVERYWHERE ELSE PANELX ANSWERS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Measured 21 August 2026 against a copy of the owner's corpus, on the build before this file:
 * a right-click inside the search box on `/records` and inside both boxes on `/plan` was taken by
 * Mole Office. The page cancelled the event and opened the composer. So paste, spell-check and look-up
 * were unreachable in every box in the product. That is CAF-8 in
 * `design/round-nine/step59-reconciliation.md` and contract 5.5 is the rule it asks for.
 *
 * The probe is `design/round-nine/caf8-probe-boxes.mjs` and its numbers are in
 * `design/round-nine/caf8-the-browsers-own-menu.md`.
 *
 * ---------------------------------------------------------------------------------------
 * HOW "THE BROWSER'S MENU APPEARED" IS READ, SINCE NO TEST CAN SEE ONE
 * ---------------------------------------------------------------------------------------
 *
 * The browser draws its menu itself, outside the page, and a headless browser draws none at all.
 * One bit decides whether it is drawn: whether the page cancelled the `contextmenu` event. That bit
 * is read here from a listener registered after the app's own, which is the same thing
 * `tests/the-menu-is-never-refused.test.ts` reads.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH OF THESE GO RED
 * ---------------------------------------------------------------------------------------
 *
 * Proved by mutation with a control run first; the table is in
 * `design/round-nine/caf8-the-browsers-own-menu.md`.
 *
 *   delete the editable answer from `whatTheMenuDoes`   → the text box case
 *   take `data-px-menu` off the composer's draft box    → the draft box case
 *   let every input count as a box you type in          → the tick box case
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * A plan, because one page draws all three kinds of thing this file asks about: a box you type in
 * (the writing box), a box you do not (the tick box on the fourth line), and ordinary words (every
 * cell of the table).
 */
const BODY = [
  '# Tray clamp rebuild',
  '- rewrite the controller {size: 15h}',
  '- replace the mount {project: robotics}',
  '- [ ] read the paper',
].join('\n')

let app: LiveApp
let page: Page
let webPort = 0
let planId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'browsers-own-box', viewport: { width: 1440, height: 1000 } })
  webPort = app.webPort
  page = app.page
  const made = await fetch(`${app.api}/api/plans`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'A plan with a box you type in', body: BODY }),
  })
  if (!made.ok) throw new Error(`starting a plan answered ${String(made.status)}: ${await made.text()}`)
  planId = ((await made.json()) as { plan: { id: string } }).plan.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Load a route and watch every `contextmenu` from after the app's own listener. */
async function go(route: string): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(webPort)}/#${route}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await sleep(900)
  await page.keyboard.press('Escape')
  await sleep(150)
  await page.evaluate(() => {
    ;(window as unknown as { theMenu: unknown }).theMenu = null
    document.addEventListener('contextmenu', (e) => {
      ;(window as unknown as { theMenu: unknown }).theMenu = { kept: !e.defaultPrevented }
    })
  })
}

/** What is true on the screen after a gesture: did the browser keep its menu, and what opened. */
async function afterTheGesture(): Promise<{ browserKeptItsMenu: boolean | null; composer: string | null }> {
  return await page.evaluate(() => {
    const seen = (window as unknown as { theMenu: { kept: boolean } | null }).theMenu
    const chip = document.querySelector('.px-talk-quote')
    const kind = chip?.querySelector('.px-talk-chip-kind')?.textContent?.trim() ?? ''
    const what = chip?.querySelector('.px-talk-chip-what')?.textContent?.trim() ?? ''
    return {
      browserKeptItsMenu: seen === null ? null : seen.kept,
      composer: chip === null ? null : `${kind} ${what}`.trim(),
    }
  })
}

/** Right-click the middle of the first thing that matches, and say what happened. */
async function rightClick(selector: string): Promise<{ browserKeptItsMenu: boolean | null; composer: string | null }> {
  const at = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (el === null) return null
    el.scrollIntoView({ block: 'center' })
    const box = el.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return null
    return { x: Math.round(box.left + Math.min(box.width / 2, 50)), y: Math.round(box.top + box.height / 2) }
  }, selector)
  if (at === null) throw new Error(`nothing drawn on this page matched ${selector}`)
  await page.evaluate(() => {
    ;(window as unknown as { theMenu: unknown }).theMenu = null
  })
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await sleep(400)
  return await afterTheGesture()
}

describe('a right-click in a box you type in, and a right-click on ordinary words', () => {
  /**
   * THE TWO HALVES ARE ONE CASE ON PURPOSE. Either half alone is met by a product that never
   * answers, or by one that always does. What CAF-8 asks for is that the same page gives two
   * different answers to the same gesture, decided by what is under the pointer.
   */
  it('gives the box to the browser and the words to Mole Office, on one page', async () => {
    await go(`/plans/${planId}`)

    const inTheBox = await rightClick('textarea')
    expect(inTheBox.browserKeptItsMenu, 'Mole Office took the menu inside a box you type in').toBe(true)
    expect(inTheBox.composer, 'a box you type in opened the composer').toBe(null)

    const onTheWords = await rightClick('.pt-wrap tbody td')
    expect(onTheWords.browserKeptItsMenu, 'ordinary words gave the browser its menu').toBe(false)
    expect(onTheWords.composer, 'ordinary words opened no composer').not.toBe(null)
    expect(onTheWords.composer, 'the composer said nothing about what it is about').not.toBe('')
    await page.keyboard.press('Escape')
  }, 120_000)

  /**
   * A TICK BOX IS AN `input` AND IT IS NOT A BOX YOU TYPE IN. The rule is about what a person can do
   * in the thing: paste, spell-check and look-up need typed text. Exempting every `input` would make
   * a dead spot out of every tick box and every choice of one option, where the browser's menu
   * offers nothing a person came for.
   */
  it('still answers on a tick box, which is an input a person cannot type in', async () => {
    await go(`/plans/${planId}`)
    const onTheTick = await rightClick('input.pi-tick')
    expect(onTheTick.browserKeptItsMenu, 'a tick box gave the browser its menu').toBe(false)
    expect(onTheTick.composer, 'a tick box opened no composer').not.toBe(null)
    await page.keyboard.press('Escape')
  }, 120_000)
})

describe('the one box Mole Office keeps', () => {
  /**
   * THE COMPOSER'S OWN INSTRUCTION BOX IS THE EXCEPTION, and contract 5.5 names it: pointing at a
   * phrase of the instruction you are writing is the one gesture that has to reach Mole Office from
   * inside a box. It is marked, so the rule reads a declaration rather than a class name.
   *
   * What it costs is paste-by-right-click in that one box. Ctrl and V still work there, and Shift
   * with a right-click reaches the browser's own menu there as it does everywhere.
   */
  it('keeps the menu inside the instruction you are writing, and opens the panel that changes it', async () => {
    await go(`/plans/${planId}`)
    const opened = await rightClick('.pt-wrap tbody td')
    expect(opened.composer, 'no composer opened to write an instruction in').not.toBe(null)

    await page.locator('.px-talk textarea').first().click()
    await page.keyboard.type('Ask Sam whether this is still the right order.')
    await sleep(200)
    const inTheDraft = await rightClick('.px-talk textarea')
    expect(inTheDraft.browserKeptItsMenu, 'the composer handed its own instruction box to the browser').toBe(false)

    const panels = await page.evaluate(() =>
      [...document.querySelectorAll('.px-talk')].map((el) => el.getAttribute('data-target') ?? ''),
    )
    expect(panels, 'pointing at the instruction did not open the panel that changes it').toContain(
      'uiSurface/composer.change',
    )
    await page.keyboard.press('Escape')
  }, 120_000)
})
