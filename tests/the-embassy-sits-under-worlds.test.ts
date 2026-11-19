// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY'S BUTTON IS IN THE SIDEBAR, DIRECTLY UNDER WORLDS, ON EVERY PAGE. CRITERION M56.
 *
 * The Embassy's button goes in the sidebar, under where World is.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WAS
 * ---------------------------------------------------------------------------------------
 *
 * The Embassy had no row. It was reached by a link on the Worlds page and by nothing else, so
 * getting to it meant two presses and remembering which page carried the link.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND WHY EACH PART IS NEEDED
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE ROW IS THERE AND IT IS DIRECTLY UNDER WORLDS. Order is read off the column as drawn, not
 *    off the declaration, because "under World" is a fact about the screen. A row drawn somewhere
 *    else in the column would satisfy "the Embassy has a row" and not what was asked for.
 * 2. IT IS THERE ON A SECOND PAGE. Putting it in the sidebar puts it on every page, in effect:
 *    the sidebar is the frame, and a row drawn on one page only is not a row in the frame.
 * 3. PRESSING IT OPENS THE EMBASSY. A row that names the page and opens something else is worse
 *    than no row.
 * 4. THE PRESS FROM THE WORLDS PAGE STILL WORKS. The brief asks for the row as well as the link,
 *    not instead of it, and a change that moved the link would pass the first three cases.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * Every case waits for the sidebar's own rows before asserting anything about them, and case 1
 * asserts Worlds is in the column it read. Without that, a sidebar that failed to draw at all would
 * make "the Embassy is not above Worlds" true for the wrong reason.
 *
 * TEST CHANGE (wave 13y round 165): the owner's later choice puts only a few pages in front in the
 * sidebar and lists every other page on All pages, in the sidebar's groups. The column read is the
 * All pages page, reached by pressing the sidebar's All pages entry on the page the case opens.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { DESTINATIONS, PAGE_TITLES } from '../src/web/components/Sidebar.tsx'
import { pathFor } from '../src/web/components/router.tsx'
import { TARGET_ATTRIBUTE, targetAttributeValue } from '../src/shared/targets.ts'

let app: LiveApp

/**
 * One destination's address, read off the row rather than typed.
 *
 * `pathFor` cannot answer for Home: its address is "/" and it has no segment in FLAT_ROUTES. Every
 * row already carries the address it opens, and shell-nav.test.ts proves each one parses back to
 * the page the row claims, so reading it here is reading the same fact those rows are checked on.
 */
function addressOf(key: string): string {
  const found = DESTINATIONS.find((one) => one.key === key)
  if (found === undefined) throw new Error(`No destination called "${key}".`)
  return found.to
}

/** The attribute value the Embassy's row carries, asked for rather than typed. */
const EMBASSY_ROW = targetAttributeValue({ kind: 'uiSurface', surfaceId: 'rail.embassy' })
const WORLDS_ROW = targetAttributeValue({ kind: 'uiSurface', surfaceId: 'rail.worlds' })

/** Every row of the navigation column, in the order the column draws them, reached from the sidebar's All pages entry. */
async function theColumn(): Promise<string[]> {
  await app.page.click('nav.shell-nav a.shell-all-pages')
  await app.page.waitForSelector(`#main .ap-list [${TARGET_ATTRIBUTE}]`, { timeout: 20_000 })
  return app.page.$$eval(
    `#main .ap-list [${TARGET_ATTRIBUTE}]`,
    (all, attribute: string) => all.map((one) => one.getAttribute(attribute) ?? ''),
    TARGET_ATTRIBUTE,
  )
}

beforeAll(async () => {
  // 1440 wide: the sidebar is in the flow from 1024 up, and below that it is a drawer that has to
  // be opened first. What was asked about is the column at the desk.
  app = await liveApp({ name: 'embassy-under-worlds', viewport: { width: 1440, height: 1000 } })
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('the Embassy has a row of its own under Office', () => {
  it('draws it under Office and keeps Worlds behind developer mode', async () => {
    await app.page.goto(`${app.site}/#${addressOf('home')}`)
    await waitForThePage(app.page, 30_000)
    const rows = await theColumn()
    // The column drew enough rows to check their group membership.
    expect(rows.length, 'the navigation column drew no rows, so nothing below is measured').toBeGreaterThan(5)
    expect(rows).not.toContain(WORLDS_ROW)

    expect(rows, 'the Embassy has no row in the sidebar').toContain(EMBASSY_ROW)
    // Embassy is in Office; Worlds belongs to Developer.
    expect(await app.page.locator(`[data-group="office"] [${TARGET_ATTRIBUTE}="${EMBASSY_ROW}"]`).count()).toBe(1)
    // AND ONCE. Two rows to one page reads as a bug in a column whose job is to say where you can go.
    expect(rows.filter((one) => one === EMBASSY_ROW).length, 'the Embassy has two rows').toBe(1)
  }, 120_000)

  it('draws it on another page too, because the sidebar is the frame', async () => {
    await app.page.goto(`${app.site}/#${addressOf('records')}`)
    await waitForThePage(app.page, 30_000)
    const rows = await theColumn()
    expect(rows).not.toContain(WORLDS_ROW)
    expect(rows, 'the Embassy has no row on this page').toContain(EMBASSY_ROW)
    expect(await app.page.locator(`[data-group="office"] [${TARGET_ATTRIBUTE}="${EMBASSY_ROW}"]`).count()).toBe(1)
  }, 120_000)

  it('opens the Embassy when it is pressed, and says so on the row', async () => {
    await app.page.goto(`${app.site}/#${addressOf('home')}`)
    await waitForThePage(app.page, 30_000)
    await app.page.click('nav.shell-nav a.shell-all-pages')
    await app.page.waitForSelector(`#main .ap-list [${TARGET_ATTRIBUTE}="${EMBASSY_ROW}"]`, { timeout: 20_000 })
    // AND THE ROW SAYS THE NAME OF THE PAGE IT OPENS, read off the declaration rather than typed:
    // the row's words and the page's title are one string in this product, and this is that string.
    const words = await app.page.$eval(
      `#main .ap-list [${TARGET_ATTRIBUTE}="${EMBASSY_ROW}"]`,
      (one) => one.textContent ?? '',
    )
    await app.page.click(`#main .ap-list [${TARGET_ATTRIBUTE}="${EMBASSY_ROW}"]`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.emb-title', { timeout: 20_000 })
    expect(new URL(app.page.url()).hash).toBe(`#${pathFor('embassy')}`)
    expect(words).toContain(PAGE_TITLES.embassy)
    expect(DESTINATIONS.find((one) => one.key === 'embassy')?.label).toBe(PAGE_TITLES.embassy)
  }, 120_000)

  it('keeps the press from the Worlds page, which is where it used to be the only way in', async () => {
    await app.page.goto(`${app.site}/#${addressOf('worlds')}`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.wd-embassy', { timeout: 20_000 })
    await app.page.click('.wd-embassy')
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.emb-title', { timeout: 20_000 })
    expect(new URL(app.page.url()).hash).toBe(`#${pathFor('embassy')}`)
  }, 120_000)
})
