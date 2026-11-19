// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE LISTENER, AND A KEYBOARD THAT REACHES THE SAME BOX, MEASURED IN THE RUNNING PRODUCT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * tests/one-way-into-the-composer.test.ts asks what the dispatch decides. It cannot ask three
 * things, and all three are the point of the step:
 *
 *   1. How many `contextmenu` listeners the whole product ends up with once every component has
 *      mounted. A second one that called `stopPropagation` would make a dead spot on the page that
 *      nothing on screen could show and no type could catch.
 *   2. Whether a real engine raises the keyboard menu with the fields the dispatch reads.
 *   3. Where the box actually lands, in pixels, for a person who never touched a mouse.
 *
 * ---------------------------------------------------------------------------------------
 * CHROMIUM ONLY, AND THAT IS A MEASUREMENT RATHER THAN A CHOICE
 * ---------------------------------------------------------------------------------------
 *
 * Claim `wKR0jkvl_7sz`, 20 August 2026, three engines headless and headed: Firefox 153 and WebKit
 * 26.5 raise **no** `contextmenu` event at all from `Shift+F10` or the menu key. The key presses
 * arrive; nothing follows. So the keyboard route can be exercised in Chromium and cannot be
 * exercised in the other two, and this file says so rather than implying the route was proved
 * everywhere. What those two engines do with the same gesture is an open limit, written down in
 * design/round-nine/step13-one-dispatch.md.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS NO LONGER STARTS ITS OWN SERVERS
 * ---------------------------------------------------------------------------------------
 *
 * This file used to carry its own copy of the port-and-process harness, copied from
 * tests/seven-surfaces.test.ts before `liveApp` in helpers.ts existed. Its own `freePort` asked the
 * operating system for a free port, closed the probe, and handed the number back, leaving a gap
 * between choosing a port and the child binding it that anything else on the machine could win in.
 * `liveApp`'s `reservePort` holds the probe socket open until the instant before the child is
 * spawned, and retries on a losing port instead of failing the file outright — helpers.ts records
 * the exact incident that made that necessary: fourteen test files running at once, "Vite exited
 * before it answered: Port 39399 is already in use", because the port was chosen five seconds
 * before Vite bound it and something else took it in between. tests/how-long-a-test-may-take.ts
 * records this file failing the same way for a different reason on 4 September 2026, at load
 * average 31 — three cases here timed out at the runner's five-second default before this file
 * was taught to ask for thirty, which it still does (it names `chromium` and `child_process`, so
 * `startsSomethingOutsideTheTestProcess` already gives it the longer budget; that part was never
 * this file's problem). What is still this file's problem is that it never adopted the harness
 * that fixed the OTHER load-sensitive fault in the same class: a port chosen and then lost to
 * another test file's server before this one's child could bind it. Moving to `liveApp` removes
 * the file's own weaker copy of a race the shared helper already solved, rather than adding a
 * third copy of the fix beside the two `liveApp` already unified.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { theTimeLeftIn, type TheTimeLeft } from './how-long-a-test-may-take.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

// ============================================================================ what is on the screen

let app: LiveApp

/**
 * COUNT EVERY `contextmenu` LISTENER THE PAGE EVER REGISTERS, and say what each one is on.
 *
 * It wraps `addEventListener` before any of the product's own code runs, and it wraps `remove` as
 * well so a listener that was taken off again is not counted as live. React attaches its own
 * listeners for delegated events on the element it renders into, so the answer is read per target
 * rather than as one number: Mole Office's own listener is the one on the document.
 */
const COUNT_LISTENERS = `
  (() => {
    const live = []
    window.__pxMenuListeners = live
    const nameOf = (thing) => {
      if (thing === document) return 'document'
      if (thing === window) return 'window'
      if (thing && thing.tagName) return thing.tagName.toLowerCase() + (thing.id ? '#' + thing.id : '')
      return String(thing)
    }
    const add = EventTarget.prototype.addEventListener
    const remove = EventTarget.prototype.removeEventListener
    EventTarget.prototype.addEventListener = function (type, fn, options) {
      if (type === 'contextmenu') live.push({ on: nameOf(this), fn })
      return add.call(this, type, fn, options)
    }
    EventTarget.prototype.removeEventListener = function (type, fn, options) {
      if (type === 'contextmenu') {
        const n = live.findIndex((one) => one.fn === fn)
        if (n >= 0) live.splice(n, 1)
      }
      return remove.call(this, type, fn, options)
    }
  })()
`

async function menuListeners(): Promise<string[]> {
  return await app.page.evaluate('window.__pxMenuListeners.map((one) => one.on)')
}

beforeAll(async () => {
  app = await liveApp({ name: 'one-listener', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  await app.page.addInitScript(COUNT_LISTENERS)

  // One record, so the records table has a row that says what it is and holds a link to focus.
  const res = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({
      kind: 'note',
      title: 'Why the pad is the suspect',
      data: { body: 'It has been on the finger since March and the surface is glazed.' },
    }),
  })
  if (!res.ok) throw new Error(`the record would not save: ${String(res.status)} ${await res.text()}`)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

/**
 * EVERY WAIT IN THIS FILE TAKES WHAT IS LEFT OF ITS TEST, and none carries a number of its own.
 *
 * Problem `jddGW981fri2`. The composer wait here was ten seconds inside a test that the rule in
 * tests/how-long-a-test-may-take.ts gives thirty, and it went red at load average 12 on a page that
 * drew correctly a moment later. Each wait now asks `theTimeLeftIn` for the rest of the test's own
 * budget, so there is one number, and a wait that runs out is named by Playwright's own error before
 * the runner stops the test.
 */
async function open(where: string, time: TheTimeLeft): Promise<void> {
  await app.page.goto(`${app.site}/#${where}`, { timeout: time.forAWait(`the page #${where} to load`) })
  await waitForThePage(app.page, time.forAWait(`the ready mark on #${where}`))
  await new Promise((r) => setTimeout(r, 400))
}

/** The first row of the records table, which is one of the things a person can point at. */
const ROW = 'tr[data-target]'

// ============================================================================ 1. how many listeners

describe('the product has one contextmenu listener', () => {
  it('registers exactly one on the document, however many pages have been visited', async ({ task }) => {
    const time = theTimeLeftIn(task)
    await open('/records', time)
    await app.page.waitForSelector(ROW, { timeout: time.forAWait('a row of the records table') })
    expect((await menuListeners()).filter((on) => on === 'document')).toEqual(['document'])

    // A second route, in the same page load, because a listener added by a page's own components is
    // exactly what this is looking for and it would not be there on the first screen.
    await open('/plan', time)
    await new Promise((r) => setTimeout(r, 400))
    await open('/records', time)
    await app.page.waitForSelector(ROW, { timeout: time.forAWait('a row of the records table, the second time') })
    expect((await menuListeners()).filter((on) => on === 'document')).toEqual(['document'])
  })
})

// ============================================================================ 2. the keyboard menu

describe('a menu raised from the keyboard opens the frame under the focused thing', () => {
  /**
   * The old detector was `clientX === 0 && clientY === 0`, and the keyboard menu arrives at the
   * centre of the focused element, so the branch behind it never ran. This asserts where the box
   * IS — its left edge on the focused element's left edge, its top six pixels under it — which is a
   * different place from both the centre of the element and the corner of the window.
   */
  it('places the frame at the focused element, not at the point the event reports', async ({ task }) => {
    const time = theTimeLeftIn(task)
    await open('/records', time)
    const row = app.page.locator(ROW).first()
    await row.waitFor({ timeout: time.forAWait('a row of the records table') })
    const focusable = row.locator('a, button').first()
    expect(await focusable.count(), 'the row has nothing focusable inside it to stand on').toBeGreaterThan(0)
    await focusable.evaluate((el: HTMLElement) => el.focus())

    const on = await focusable.boundingBox()
    expect(on).not.toBeNull()
    await app.page.keyboard.press('Shift+F10')
    const frame = app.page.locator('.px-talk')
    await frame.waitFor({ timeout: time.forAWait('the composer to open after Shift+F10') })
    const box = await frame.boundingBox()
    expect(box).not.toBeNull()
    expect(Math.round(box?.x ?? -1)).toBe(Math.round(on?.x ?? -2))
    expect(Math.round(box?.y ?? -1)).toBe(Math.round((on?.y ?? 0) + (on?.height ?? 0) + 6))
    await app.page.keyboard.press('Escape')
  })
})

// ============================================================================ 3. the mode that stayed on

describe('a right-click ends point mode, whichever way the composer was opened', () => {
  /**
   * Only the press listener used to end the mode. So a person who pressed the control and then
   * right-clicked something got a composer with every element on the page still outlined, the
   * control still reading as pressed, and the next ordinary press still swallowed.
   */
  it('leaves nothing outlined and the control unpressed', async ({ task }) => {
    const time = theTimeLeftIn(task)
    await open('/records', time)
    await app.page.waitForSelector(ROW, { timeout: time.forAWait('a row of the records table') })
    await app.page.locator('.px-point-switch').first().click({ timeout: time.forAWait('the point control to take a press') })
    await app.page.waitForSelector('html[data-pointing="1"]', { timeout: time.forAWait('point mode to start') })

    await app.page.locator(ROW).first().click({ button: 'right', timeout: time.forAWait('the row to take a right-click') })
    await app.page.locator('.px-talk').waitFor({ timeout: time.forAWait('the composer to open after the right-click') })
    expect(await app.page.locator('html[data-pointing="1"]').count()).toBe(0)
    expect(await app.page.locator('.px-point-switch[aria-pressed="true"]').count()).toBe(0)
    await app.page.keyboard.press('Escape')
  })
})
