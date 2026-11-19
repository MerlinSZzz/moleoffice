// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * POINT MODE MARKS EXACTLY WHAT A PRESS WILL TAKE, AND TAKES NOTHING ELSE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * While the mode was on, one listener took EVERY press in the document. Its only exemption was the
 * host popups are drawn in, and a second exemption for the mode's own off button was added later.
 * Four things were broken by that and all four were measured in a browser on 20 August 2026, on an
 * instance holding a copy of the real corpus:
 *
 *   1. pressing the rail row `Modules` left the address at `#/` and opened a composer about the row;
 *   2. pressing the Reviews switch did not open the review column and opened a composer about the
 *      whole page;
 *   3. 106 elements were outlined and 89 of them could be chosen — the rail and the whole shell were
 *      marked as things a press would take, and a press on them took something else;
 *   4. every outline was the same dashed line, so nothing on the screen said which of two nested
 *      marked things a press would land on.
 *
 * Emission made the third one worse rather than better: since step 15 the shell itself carries
 * `page/<route>`, so "is anything addressable under this press" is yes for every pixel of the
 * window, and the mode would have swallowed the entire product.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS RUNS IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Every assertion below is about what is drawn or what a person can do. The first one compares the
 * set of elements the browser is DRAWING an outline on against the set a press would take — two
 * facts that live in two places on purpose, a CSS selector and a walk in TypeScript, and there is no
 * way to compare them without a browser that has resolved both. `tests/one-way-into-the-composer.
 * test.ts` asks what the rule decides; only this file can say the screen agrees with it.
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

/** Go to a page with the mode off and nothing open. */
async function fresh(route: string): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(webPort)}/#${route}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.px-point-switch').waitFor({ timeout: 30_000 })
  await page.keyboard.press('Escape')
  await page.waitForFunction(
    () => document.documentElement.getAttribute('data-pointing') !== '1',
    undefined,
    { timeout: 20_000 },
  )
}

/** Press the control in the rail that marks what can be talked about. */
async function enterPointMode(): Promise<void> {
  await page.getByRole('button', { name: 'Ask agent' }).click()
  await expect.poll(modeIsOn, { timeout: 15_000 }).toBe(true)
}

const modeIsOn = () => page.evaluate(() => document.documentElement.getAttribute('data-pointing') === '1')

/** What the composer says it is about, or null when there is no composer. */
const composerSays = () =>
  page.evaluate(() => {
    const chip = document.querySelector('.px-talk-quote')
    if (chip === null) return null
    const kind = chip.querySelector('.px-talk-chip-kind')?.textContent?.trim() ?? ''
    const what = chip.querySelector('.px-talk-chip-what')?.textContent?.trim() ?? ''
    return `${kind} ${what}`.trim()
  })

/** The middle of a thing on the screen, after scrolling it into view. */
async function middleOf(selector: string): Promise<{ x: number; y: number }> {
  const at = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (el === null) return null
    el.scrollIntoView({ block: 'center' })
    const box = el.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return null
    return { x: Math.round(box.left + Math.min(box.width / 2, 60)), y: Math.round(box.top + box.height / 2) }
  }, selector)
  if (at === null) throw new Error(`nothing on this page matched ${selector}`)
  return at
}

beforeAll(async () => {
  app = await liveApp({ name: 'point-mode', viewport: { width: 1440, height: 1000 } })
  webPort = app.webPort
  page = app.page
  // Two rows, so Home draws things of its own rather than only its panels.
  await post('/api/records', { kind: 'problem', title: 'The rail was swallowing its own presses', summary: 'Measured at 1440.' })
  await post('/api/records', { kind: 'idea', title: 'Two channels, so nesting survives greyscale', summary: 'Line style, never hue.' })
  await fresh('/')
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * Every element the browser is drawing an outline on, with its line style and whether it is inside
 * the page's own tree.
 */
async function outlinesNow(): Promise<{ key: string; style: string; onThePage: boolean; holdsHovered: boolean }[]> {
  return await page.evaluate(() => {
    const pageTree = document.getElementById('main')
    const drawn: { key: string; style: string; onThePage: boolean; holdsHovered: boolean }[] = []
    for (const el of document.querySelectorAll<HTMLElement>('[data-target]')) {
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      const style = getComputedStyle(el)
      if (style.outlineStyle === 'none' || style.outlineWidth === '0px') continue
      drawn.push({
        key: el.getAttribute('data-target') ?? '',
        style: style.outlineStyle,
        onThePage: pageTree !== null && pageTree !== el && pageTree.contains(el),
        holdsHovered: el.querySelector('[data-target]:hover') !== null,
      })
    }
    return drawn
  })
}

describe('what the mode draws is what a press would take', () => {
  /**
   * WHAT THIS ASSERTED UNTIL WAVE 5 STEP 8, AND WHY IT CHANGED.
   *
   * It asserted that the set of outlined elements EQUALS the set a press would take: every target
   * under `#main`, all at once. That was the right rule while a page carried a handful of targets.
   * Wave 5 step 7 gives a report one target per paragraph, bullet, heading, table and fenced block
   * — 276 of them on the owner's own m2Q0CybxoGNF — and outlining all of them draws hundreds of
   * nested boxes over the writing.
   *
   * So the emit rule changed, deliberately and in the design (semantic-regions.md §10.3): THE
   * OUTLINE FOLLOWS THE POINTER AND THE FOCUS. What this file still holds the mode to is the part
   * that was never about the count: nothing outside `#main` is ever outlined, the innermost thing
   * under the pointer is solid, everything holding it is dashed, and nothing else is drawn.
   */
  it('outlines nothing at all until the pointer is over something', async () => {
    await fresh('/')
    await enterPointMode()
    await page.mouse.move(2, 2)
    await sleep(200)
    const drawn = await outlinesNow()
    expect(
      drawn.map((one) => one.key),
      'the mode drew outlines with the pointer in the corner, over nothing',
    ).toEqual([])
  })

  it('outlines the thing under the pointer and nothing in the frame', async () => {
    await fresh('/')
    await enterPointMode()
    const at = await middleOf('#main [data-target]:not(:has([data-target]))')
    await page.mouse.move(at.x, at.y)
    await expect.poll(async () => (await outlinesNow()).length, { timeout: 15_000 }).toBeGreaterThan(0)
    const drawn = await outlinesNow()
    // THE CONTROL. Everything below is about which elements were drawn, and none of it means
    // anything if none were.
    expect(drawn.length, 'the mode outlined nothing at all with the pointer over a thing').toBeGreaterThan(0)
    expect(
      drawn.filter((one) => !one.onThePage).map((one) => one.key),
      'these are outlined and a press on them would do something else',
    ).toEqual([])
  })

  it('draws one solid thing and its holders dashed, so line style carries the nesting', async () => {
    await fresh('/')
    await enterPointMode()
    const at = await middleOf('#main [data-target]:not(:has([data-target]))')
    await page.mouse.move(at.x, at.y)
    await expect.poll(
      async () => (await outlinesNow()).filter((one) => one.style === 'solid').length,
      { timeout: 15_000 },
    ).toBe(1)
    const drawn = await outlinesNow()
    const solid = drawn.filter((one) => one.style === 'solid')
    const dashed = drawn.filter((one) => one.style === 'dashed')
    expect(solid.length, 'more than one thing was drawn as the thing a press lands on').toBe(1)
    expect(drawn.length - solid.length - dashed.length, 'something was drawn in a third channel').toBe(0)
    // A DASHED ONE IS A THING THAT HOLDS THE HOVERED ONE, never a thing beside it.
    expect(
      dashed.filter((one) => !one.holdsHovered).map((one) => one.key),
      'these were drawn as holding the thing under the pointer and do not hold it',
    ).toEqual([])
  })
})

describe('the frame keeps its presses while the mode is on', () => {
  it('lets the rail navigate', async () => {
    await fresh('/')
    await enterPointMode()
    const before = await page.evaluate(() => location.hash)
    // Test change (wave 13y round 165): the project's pages are listed on All pages now, so the row
    // pressed is the sidebar's All pages entry.
    await page.locator('nav.shell-nav a.shell-all-pages').waitFor({ timeout: 15_000 })
    await page.mouse.click(...Object.values(await middleOf('nav.shell-nav a.shell-all-pages')).map(Number) as [number, number])
    await expect.poll(() => page.evaluate(() => location.hash), { timeout: 15_000 }).toBe('#/all-pages')
    expect(before).toBe('#/')
    expect(await page.evaluate(() => location.hash), 'the rail did not navigate').toBe('#/all-pages')
    expect(await composerSays(), 'the rail opened a composer instead of navigating').toBe(null)
  })

  it('lets the Reviews switch open the review column', async () => {
    await fresh('/')
    await enterPointMode()
    const before = await page.evaluate(() => document.querySelector('.px-pane') !== null)
    const at = await middleOf('.px-review-switch')
    await page.mouse.click(at.x, at.y)
    await expect.poll(() => page.evaluate(() => document.querySelector('.px-pane') !== null), { timeout: 15_000 }).toBe(true)
    expect(before).toBe(false)
    expect(await page.evaluate(() => document.querySelector('.px-pane') !== null), 'the column did not open').toBe(true)
    expect(await composerSays(), 'the switch opened a composer instead of the column').toBe(null)
  })

  it('lets a second press of the control leave, with no dialog and nothing opened', async () => {
    await fresh('/')
    await enterPointMode()
    expect(await modeIsOn()).toBe(true)
    await page.getByRole('button', { name: 'Choose what to talk about' }).click()
    await expect.poll(modeIsOn, { timeout: 15_000 }).toBe(false)
    expect(await modeIsOn(), 'the mode did not end').toBe(false)
    expect(await composerSays(), 'leaving the mode opened a composer').toBe(null)
  })
})

describe('a press on one of the page’s own things is the subject', () => {
  it('opens the composer about the thing that was pressed and ends the mode', async () => {
    await fresh('/')
    await enterPointMode()
    const at = await middleOf('#main [data-target]:not(:has([data-target]))')
    await page.mouse.click(at.x, at.y)
    await expect.poll(composerSays, { timeout: 15_000 }).not.toBe(null)
    expect(await composerSays(), 'nothing opened').not.toBe(null)
    expect(await modeIsOn(), 'the mode outlived the press it was waiting for').toBe(false)
  })

  it('leaves a drag across words alone: the words stay chosen and nothing opens', async () => {
    await fresh('/')
    await enterPointMode()
    const chosen = await page.evaluate(() => {
      // A run of words a person could actually drag across: a leaf, long enough to have a middle,
      // wide enough that a drag inside it stays inside it, AND THE THING UNDER ITS OWN MIDDLE.
      //
      // THE LAST CLAUSE IS WHY THIS CASE WENT RED. A paragraph inside a closed fold still has a
      // box, so the old test picked one — a note in a folded explainer — and dragged across a part
      // of the panel that is not drawn. Nothing was selectable there and the case reported that the
      // drag chose no words. Asking the browser what is really under the middle of the element is
      // the smallest question that tells a drawn run of words from a clipped one.
      for (const el of document.querySelectorAll<HTMLElement>('#main *')) {
        if (el.children.length > 0) continue
        if ((el.textContent ?? '').trim().length < 24) continue
        const r = el.getBoundingClientRect()
        if (r.width < 160 || r.height === 0) continue
        const middle = document.elementFromPoint(
          Math.round(r.left + r.width / 2),
          Math.round(r.top + r.height / 2),
        )
        if (middle !== el) continue
        el.scrollIntoView({ block: 'center' })
        const box = el.getBoundingClientRect()
        return {
          x1: Math.round(box.left + 4),
          y1: Math.round(box.top + box.height / 2),
          x2: Math.round(box.left + Math.min(box.width - 4, 140)),
          y2: Math.round(box.top + box.height / 2),
          who: `<${el.tagName.toLowerCase()} class="${el.className}">`,
        }
      }
      return null
    })
    if (chosen === null) throw new Error('this page draws no run of words to drag across')
    await page.mouse.move(chosen.x1, chosen.y1)
    await page.mouse.down()
    await page.mouse.move(chosen.x2, chosen.y2, { steps: 14 })
    await page.mouse.up()
    await sleep(500)
    expect(
      await page.evaluate(() => (window.getSelection()?.toString() ?? '').length),
      `the drag chose no words on the drawn ${chosen.who}`,
    ).toBeGreaterThan(0)
    expect(await composerSays(), 'dragging across words opened a composer').toBe(null)
  })
})

describe('the mode is a state of looking, not of the document', () => {
  it('ends when the address changes', async () => {
    await fresh('/')
    await enterPointMode()
    expect(await modeIsOn()).toBe(true)
    await page.evaluate(() => {
      location.hash = '#/settings'
    })
    await expect.poll(modeIsOn, { timeout: 15_000 }).toBe(false)
    expect(await modeIsOn(), 'the mode survived a navigation').toBe(false)
  })
})
