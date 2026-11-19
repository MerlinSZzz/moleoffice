// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LINES AT THE TOP OF THE PAGE LEAVE THE SIDEBAR WHOLE, INSIDE THE WINDOW, AT EVERY WIDTH.
 *
 * The owner's report of 26 October 2026 (wave 13y round 87): two lines came back at the top of the
 * page, and they pushed Settings, the last entry of the left sidebar, below the window. The lines sat
 * above the whole frame, so the frame and the sidebar in it started lower by the lines' height. The
 * sidebar is as tall as the window, so its foot ended below it by the same height.
 *
 * WHAT THIS FILE PROVES, in a real browser on a test office with both lines showing, at 1440, 990, 660
 * and 390 pixels wide, with the page scrolled to the top:
 *   1. both lines are drawn, inside the window;
 *   2. the sidebar's box lies inside the window, top and bottom. Below 1024 pixels the sidebar is a
 *      drawer, and it is opened first;
 *   3. Settings is inside the window once the sidebar itself is scrolled to its end, and the page
 *      itself is not scrolled.
 *
 * THE TWO LINES ARE MADE AS THEY HAPPEN. The moved-home line: the test office's database holds this
 * installation's former home, closed, and the page keeps that former home, as in
 * tests/the-moved-home-line-goes-once-the-home-is-adopted.test.ts. The line saying the code is behind
 * the checkout: every reply's freshness header is rewritten to say the server's code has been behind
 * for four minutes, which is what a server says when it is.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, liveApp, waitForThePage, type TestDb } from './helpers.ts'
import { FRESHNESS_HEADER, formatFreshnessHeader } from '../src/config/freshness-header.mjs'

let t: TestDb
/** The identity of the database that was home before the move. */
let formerHome: string

beforeAll(async () => {
  const old = await freshDb()
  const world = await import('../src/server/lib/world.ts')
  world.forgetTheWorld()
  const said = world.theWorldThisDatabaseIs()
  if (said === null) throw new Error('the former test database has no identity')
  formerHome = said
  const installation = world.theInstallationThisDatabaseBelongsTo()
  if (installation === null || installation === '') throw new Error('the former test database belongs to no installation')
  old.close()
  t = await freshDb()
  // freshDb() resets the modules, so the world is read again through the ones it opened.
  const now = await import('../src/server/lib/world.ts')
  now.forgetTheWorld()
  t.client.sqlite.prepare('UPDATE installation SET id = ? WHERE only_row = 1').run(installation)
  const office = await import('../src/server/lib/office.ts')
  const made = office.registerWorldHere({
    name: 'a home before the move',
    kind: 'home',
    startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    checkout: null,
    head: null,
    databaseIdentity: formerHome,
    address: null,
    addressForOtherMachines: null,
    standing: 'canonical',
    parentWorld: null,
    installation,
  })
  office.closeWorldHere(made.id, 'the office moved to a new database')
})

afterAll(() => {
  t.close()
})

/** The four widths every screen is looked at, each with a window height of its kind. */
const WINDOWS = [
  { width: 1440, height: 900 },
  { width: 990, height: 800 },
  { width: 660, height: 800 },
  { width: 390, height: 844 },
]

it('with both lines showing, the sidebar and its Settings entry stay inside the window at every width', async () => {
  const { HOME_WORLD_KEY } = await import('../src/web/lib/world.ts')
  const live = await liveApp({
    name: 'r87-lines-leave-the-sidebar-whole',
    viewport: WINDOWS[0]!,
    workspace: 'default',
    database: t.file,
  })
  try {
    const page = live.page
    // THE FORMER HOME, before every load's code runs, so every load is told its home has moved.
    await page.addInitScript(
      ({ key, home }) => {
        window.localStorage.setItem(key, JSON.stringify({ database: home, head: null }))
      },
      { key: HOME_WORLD_KEY, home: formerHome },
    )
    // THE SERVER'S CODE BEHIND FOR FOUR MINUTES, on every reply but the stream, which never ends.
    const behind = formatFreshnessHeader({ verdict: 'stale', staleFor: 240, grace: 15 })
    await page.route(`${live.api}/api/**`, async (route) => {
      if (new URL(route.request().url()).pathname === '/api/events') return route.continue()
      const response = await route.fetch()
      await route.fulfill({ response, headers: { ...response.headers(), [FRESHNESS_HEADER]: behind } })
    })
    const moved = page.locator('[data-name="the office has moved home"]')
    const codeBehind = page.locator('[data-name="the code is behind the checkout"]')

    const found: string[] = []
    for (const window_ of WINDOWS) {
      const at = `${String(window_.width)}x${String(window_.height)}`
      await page.setViewportSize(window_)
      await page.goto(live.site, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await moved.waitFor({ timeout: 30_000 })
      await codeBehind.waitFor({ timeout: 30_000 })
      await page.evaluate(() => window.scrollTo(0, 0))

      // BELOW 1024 PIXELS THE SIDEBAR IS A DRAWER, opened from the bar at the top.
      if (window_.width < 1024) {
        await page.locator('.shell-menu').click()
        await page.locator('#shell-side .shell-side-inner').waitFor({ state: 'visible', timeout: 10_000 })
      }
      const measured = await page.evaluate(() => {
        const box = (one: Element | null) => {
          if (one === null) return null
          const r = one.getBoundingClientRect()
          return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
        }
        const inner = document.querySelector('#shell-side .shell-side-inner')
        const sidebar = box(inner)
        // TO THE SIDEBAR'S OWN END, the page itself left where it is.
        if (inner !== null) inner.scrollTop = inner.scrollHeight
        return {
          window: window.innerHeight,
          scrolled: Math.round(window.scrollY),
          sidebar,
          settings: box(document.querySelector('#shell-side .sbp-settings')),
          moved: box(document.querySelector('[data-name="the office has moved home"]')),
          behind: box(document.querySelector('[data-name="the code is behind the checkout"]')),
        }
      })
      const inside = (one: { top: number; bottom: number } | null): boolean =>
        one !== null && one.top >= 0 && one.bottom <= measured.window
      if (measured.scrolled !== 0) found.push(`${at}: the page was scrolled to ${String(measured.scrolled)}`)
      if (!inside(measured.moved)) found.push(`${at}: the moved-home line is at ${JSON.stringify(measured.moved)}`)
      if (!inside(measured.behind)) found.push(`${at}: the behind-the-checkout line is at ${JSON.stringify(measured.behind)}`)
      if (!inside(measured.sidebar)) {
        found.push(`${at}: the sidebar is at ${JSON.stringify(measured.sidebar)} in a window ${String(measured.window)} high`)
      }
      if (!inside(measured.settings)) {
        found.push(`${at}: Settings is at ${JSON.stringify(measured.settings)} in a window ${String(measured.window)} high`)
      }
    }
    expect(found, 'with both lines showing, something left the window').toEqual([])
  } finally {
    await live.stop()
  }
}, 300_000)
