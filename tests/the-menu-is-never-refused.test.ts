// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RIGHT-CLICK INSIDE PANELX ALWAYS ANSWERS, AND SAYS WHAT IT ANSWERED ABOUT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS DELETED, AND WHY ONLY NOW
 * ---------------------------------------------------------------------------------------
 *
 * `onMenu` used to begin with a refusal: where the walk up the tree found nothing that said what it
 * was, the listener returned and the browser kept its own menu. Nearly every pixel of the product
 * said nothing about itself, so nearly every right-click was refused.
 *
 * The refusal could not be deleted before emission. Reversed, ten mute surfaces would have answered
 * one identical `page/<route>` string, and a comment saved against one of them could never have been
 * drawn on it again — the mark layer builds `[data-target="…"]` selectors, and nothing emitted a page
 * key. Steps 15 and 16 put a key on the shell and a name on 306 containers, and this file is the
 * assertion that the gate is now unnecessary rather than merely gone.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHAT IS DELIBERATELY NOT
 * ---------------------------------------------------------------------------------------
 *
 * Not a share of pixels. The record page already answers 95.6% of its pixels and every one of those
 * answers is "the whole record", so a share is maximised by exactly the wrapper that causes the
 * defect. What is asserted is the WORDS the composer draws for named places a person would point at,
 * and that places a person would call different things give different answers.
 *
 * The wider version of this proof — thirteen places on six routes against a copy of the real corpus,
 * including a report card, the reading-style text of a report, a cell of a table inside one and the
 * composer's own chrome — is `design/round-nine/step17-18-places.mjs`, and its numbers are in
 * `design/round-nine/step17-18-the-gate.md`. It needs a corpus; this file needs none, so this is the
 * one that runs in the suite.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let app: LiveApp
let page: Page
let webPort = 0

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
}

/** Watch the next `contextmenu`, so a test can say whether the browser kept its own menu. */
async function watchTheMenu(): Promise<void> {
  await page.evaluate(() => {
    ;(window as unknown as { theMenu: unknown }).theMenu = null
    document.addEventListener('contextmenu', (e) => {
      ;(window as unknown as { theMenu: unknown }).theMenu = { kept: !e.defaultPrevented }
    })
  })
}

const browserKeptItsMenu = () =>
  page.evaluate(() => {
    const seen = (window as unknown as { theMenu: { kept: boolean } | null }).theMenu
    return seen === null ? null : seen.kept
  })

/** Wait until the contextmenu listener this test plants has seen the gesture. */
async function waitForTheMenu(): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { theMenu: unknown }).theMenu !== null,
    undefined,
    { timeout: 15_000 },
  )
}

const composerSays = () =>
  page.evaluate(() => {
    const chip = document.querySelector('.px-talk-quote')
    if (chip === null) return null
    const kind = chip.querySelector('.px-talk-chip-kind')?.textContent?.trim() ?? ''
    const what = chip.querySelector('.px-talk-chip-what')?.textContent?.trim() ?? ''
    return `${kind} ${what}`.trim()
  })

async function go(route: string): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(webPort)}/#${route}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.px-point-switch').waitFor({ timeout: 30_000 })
  await page.keyboard.press('Escape')
}

/** Right-click the middle of a thing, and say what the composer made of it. */
async function rightClick(selector: string): Promise<string | null> {
  const at = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (el === null) return null
    el.scrollIntoView({ block: 'center' })
    const box = el.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return null
    return { x: Math.round(box.left + Math.min(box.width / 2, 50)), y: Math.round(box.top + box.height / 2) }
  }, selector)
  if (at === null) throw new Error(`nothing on this page matched ${selector}`)
  await watchTheMenu()
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await waitForTheMenu()
  await page.locator('.px-talk-quote').waitFor({ timeout: 15_000 })
  return await composerSays()
}

beforeAll(async () => {
  app = await liveApp({ name: 'menu-gate', viewport: { width: 1440, height: 1000 } })
  webPort = app.webPort
  page = app.page
  await post('/api/records', { kind: 'problem', title: 'A right-click on a mute surface got the browser’s menu', summary: 'Measured 20 August.' })
  await go('/')
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('places a person would point at, and what each one says it is', () => {
  /**
   * SIX PLACES ON THREE ROUTES, each named after what a person would call it. The assertion is the
   * words, and that the six are not one word repeated — which is the failure the record page already
   * has and the reason a share of pixels proves nothing.
   */
  it('gives a different answer for places a person would call different things', async () => {
    const said: Record<string, string | null> = {}
    await go('/')
    // Test change (wave 13y round 165): Modules and All records are listed on All pages now. The two
    // rail rows pointed at are Reports, in front, and the All pages entry.
    await page.locator('nav.shell-nav a.shell-all-pages').waitFor({ timeout: 15_000 })
    said['the rail row Reports'] = await rightClick('nav.shell-nav a.shell-link[data-target="uiSurface/rail.notes"]')
    await page.keyboard.press('Escape')
    said['the rail row All pages'] = await rightClick('nav.shell-nav a.shell-all-pages')
    await page.keyboard.press('Escape')
    said['a panel on Home'] = await rightClick('#main [data-target]')
    await page.keyboard.press('Escape')
    await go('/settings')
    said['a control on Settings'] = await rightClick('#main [data-target]')
    await page.keyboard.press('Escape')
    await go('/records')
    said['the records list'] = await rightClick('#main [data-target]')
    await page.keyboard.press('Escape')

    for (const [place, answer] of Object.entries(said)) {
      expect(answer, `${place} opened no composer`).not.toBe(null)
      expect(answer, `${place} answered with nothing`).not.toBe('')
    }
    expect(new Set(Object.values(said)).size, `five places gave these answers: ${JSON.stringify(said)}`).toBeGreaterThanOrEqual(4)
  }, 60_000)

  /**
   * THE GAP BETWEEN THINGS IS THE ONE PLACE THAT MAY BE COARSE, and it says so. Before the floor was
   * emitted this pixel got the browser's menu; before the gate was deleted it still could, on any
   * surface that stopped declaring.
   */
  it('answers the page where nothing smaller is under the pointer', async () => {
    await go('/settings')
    const at = await page.evaluate(() => {
      // WHERE THE GAP IS, FOUND RATHER THAN GUESSED.
      //
      // This used to be `the last panel's bottom plus 40, clamped to the viewport`. Both halves are
      // wrong once the page is taller than the window: the bottom is off screen, and the clamp then
      // names a pixel INSIDE a panel, so the test asserted the page answer at a point that is not
      // the page. It passed only while the settings page happened to fit in 1000 px, and the detail
      // grid growing by eight lines was enough to break it. What is DEMANDED is unchanged — the
      // browser keeps no menu and the composer says `Page Settings`; only the search for the pixel
      // moved, and it now fails loudly when there is no gap to click rather than clicking a panel.
      // A CLOSED FOLD IS A PANEL TOO, though it declares nothing until it opens (only the summons mail's entry
      // names itself while closed). With a second Tools entry after the mail's, the pixel under the last
      // [data-target] was the gap between two folds, inside the category (the coordinator, answering for the
      // settings page's wave, message 4gIqAcePbIgs, 7 October 2026). So the search starts under the last panel or fold.
      window.scrollTo(0, document.documentElement.scrollHeight)
      const panels = [...document.querySelectorAll<HTMLElement>('#main [data-target], #main [data-settings-panel]')]
      const last = panels[panels.length - 1]
      if (last === undefined) return null
      const box = last.getBoundingClientRect()
      const x = Math.round(box.left + 40)
      for (let y = Math.round(box.bottom) + 2; y < window.innerHeight - 2; y += 2) {
        const under = document.elementFromPoint(x, y)
        if (under === null) continue
        // NOTHING SMALLER IS UNDER THE POINTER: the nearest declared thing is the page itself.
        const holder = under.closest('[data-target]')
        const says = holder === null ? '' : (holder.getAttribute('data-target') ?? '')
        if (says.startsWith('page/')) return { x, y }
      }
      return null
    })
    if (at === null) throw new Error('no pixel under the last panel answers with the page')
    await watchTheMenu()
    await page.mouse.click(at.x, at.y, { button: 'right' })
    await waitForTheMenu()
    expect(await browserKeptItsMenu(), 'the browser kept its menu on the space under the last panel').toBe(false)
    await expect.poll(composerSays, { timeout: 15_000 }).toBe('Page Settings')
    await page.keyboard.press('Escape')
  })

  /** The composer is drawn in the shell, so a right-click on its own chrome answers too. */
  it('answers inside the composer itself rather than refusing', async () => {
    await go('/')
    await rightClick('#main [data-target]')
    const at = await page.evaluate(() => {
      const el = document.querySelector('.px-talk-head')
      if (el === null) return null
      const box = el.getBoundingClientRect()
      return { x: Math.round(box.left + 20), y: Math.round(box.top + box.height / 2) }
    })
    if (at === null) throw new Error('no composer opened')
    await watchTheMenu()
    await page.mouse.click(at.x, at.y, { button: 'right' })
    await waitForTheMenu()
    expect(await browserKeptItsMenu(), 'the composer refused the gesture it exists to serve').toBe(false)
    await expect.poll(composerSays, { timeout: 15_000 }).not.toBe(null)
    await page.keyboard.press('Escape')
  })
})

describe('what Mole Office still does not take', () => {
  it('hands the menu back when Shift is held, on a place it would otherwise take', async () => {
    await go('/')
    // Test change (wave 13y round 165): Modules is listed on All pages now, so the rail row is All pages.
    await page.locator('nav.shell-nav a.shell-all-pages').waitFor({ timeout: 15_000 })
    const at = await page.evaluate(() => {
      const el = document.querySelector('a.shell-link.shell-all-pages')
      if (el === null) return null
      const box = el.getBoundingClientRect()
      return { x: Math.round(box.left + 40), y: Math.round(box.top + box.height / 2) }
    })
    if (at === null) throw new Error('there is no rail on this page')
    await watchTheMenu()
    await page.keyboard.down('Shift')
    await page.mouse.click(at.x, at.y, { button: 'right' })
    await page.keyboard.up('Shift')
    await waitForTheMenu()
    expect(await browserKeptItsMenu(), 'Shift did not reach the browser').toBe(true)
    expect(await composerSays(), 'Shift opened the composer anyway').toBe(null)
  })

  /** A touch context menu must not cover the office menu. A bare event does not start a hold. */
  it('suppresses the touch browser menu without opening on a bare event', async () => {
    await go('/')
    const answer = await page.evaluate(() => {
      const target = document.querySelector('#main [data-target]')
      if (target === null) return null
      const e = new PointerEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, pointerType: 'touch' })
      target.dispatchEvent(e)
      return { kept: !e.defaultPrevented }
    })
    await sleep(300)
    expect(answer, 'this page declares nothing at all').not.toBe(null)
    expect(answer?.kept, 'the browser menu was not suppressed').toBe(false)
    expect(await composerSays(), 'a touch opened the composer').toBe(null)
  })
})

describe('a menu raised from the keyboard', () => {
  /**
   * THE SECOND EDIT OF STEP 17, AND THE ONE NOBODY SCHEDULED. The listener placed a keyboard-raised
   * frame by reading `found.element`, and deleting the gate is exactly what makes `found` null. Both
   * edits, or the first keyboard menu on a mute surface throws and nothing opens at all.
   *
   * `document.body` is outside `.shell`, so the walk finds nothing there — and body is where focus
   * sits straight after a page loads, which is where a person's first `Shift+F10` lands.
   */
  it('opens about the page where nothing above the gesture says what it is, and throws nothing', async () => {
    await go('/')
    const thrown: string[] = []
    const listen = (e: Error) => thrown.push(String(e))
    page.on('pageerror', listen)
    // FOCUS OUTSIDE THE SHELL, which is what a person has straight after a page loads. The body is
    // made focusable for the length of this test so that the engine raises the menu on it; the real
    // gesture is the two keys below and nothing about the event is invented.
    await page.evaluate(() => {
      document.body.setAttribute('tabindex', '-1')
      document.body.focus()
    })
    await watchTheMenu()
    await page.keyboard.press('Shift+F10')
    await waitForTheMenu()
    const raised = await page.evaluate(() => {
      const seen = (window as unknown as { theMenu: { kept: boolean } | null }).theMenu
      document.body.removeAttribute('tabindex')
      return seen
    })
    page.off('pageerror', listen)
    expect(raised, 'this engine raises no context menu from the keyboard').not.toBe(null)
    expect(thrown, 'the keyboard route threw where nothing caught it').toEqual([])
    expect(raised?.kept, 'the browser kept its menu on a keyboard gesture').toBe(false)
    await expect.poll(composerSays, { timeout: 15_000 }).toBe('Page Home')
    await page.keyboard.press('Escape')
  }, 60_000)
})

describe('selecting words still adds nothing at all', () => {
  /**
   * The passive half of the owner's invariant, asked again here because this step changed what a
   * press and a menu mean and both listeners run over the same pixels a selection covers.
   */
  it('draws no composer, no highlight, and leaves the words chosen', async () => {
    await go('/')
    const box = await page.evaluate(() => {
      for (const el of document.querySelectorAll<HTMLElement>('#main *')) {
        if (el.children.length > 0) continue
        if ((el.textContent ?? '').trim().length < 24) continue
        const r = el.getBoundingClientRect()
        if (r.width < 160 || r.height === 0) continue
        el.scrollIntoView({ block: 'center' })
        const at = el.getBoundingClientRect()
        return { x1: Math.round(at.left + 4), y1: Math.round(at.top + at.height / 2), x2: Math.round(at.left + Math.min(at.width - 4, 140)), y2: Math.round(at.top + at.height / 2) }
      }
      return null
    })
    if (box === null) throw new Error('this page draws no run of words to drag across')
    await page.mouse.move(box.x1, box.y1)
    await page.mouse.down()
    await page.mouse.move(box.x2, box.y2, { steps: 14 })
    await page.mouse.up()
    await sleep(600)
    const after = await page.evaluate(() => ({
      chosen: (window.getSelection()?.toString() ?? '').length,
      collapsed: window.getSelection()?.isCollapsed ?? true,
      highlights: CSS.highlights === undefined ? 'no registry in this engine' : CSS.highlights.size,
      composer: document.querySelector('.px-talk-quote') !== null,
    }))
    expect(after.chosen, 'the drag chose no words').toBeGreaterThan(0)
    expect(after.collapsed).toBe(false)
    expect(after.highlights, 'Mole Office painted something over a selection nobody invoked on').toBe(0)
    expect(after.composer, 'selecting opened a composer').toBe(false)
  })
})
