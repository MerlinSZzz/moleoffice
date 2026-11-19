// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MOVED-HOME LINE GOES ONCE THE HOME IS ADOPTED, HOWEVER OFTEN THE PAGE IS LOADED AGAIN.
 *
 * The owner's report of 26 October 2026 (wave 13y round 87): the line saying Mole Office has moved
 * to a new home came back a few seconds after every load, a forced reload too, and pushed the
 * sidebar's last entry out of the window.
 *
 * WHY IT CAME BACK. A read is answered with a version tag and `Cache-Control: private, no-cache`
 * (src/server/lib/version-tags.ts), so the browser keeps the answer and asks again with
 * If-None-Match. The tag is a digest of the body alone. The first load after the move sent the
 * former home, so its answers carried the moved header, and the browser kept them with it. On every
 * later load the page sends the new home and the server answers 304 with no moved header. The
 * browser then hands the page the answer it kept, headers and all, and a header the 304 does not
 * name stays as it was kept. So the page was told again that its home had moved, adopted the home
 * it already kept, and drew the line again.
 *
 * WHAT THIS FILE PROVES:
 *   1. without a browser: a moved header naming the home the page already keeps writes nothing and
 *      raises no line, while one naming a different home still does;
 *   2. in a real browser on a test office whose database holds this installation's former home,
 *      closed: the first load with the former home remembered draws the line and keeps the new home,
 *      and a reload sends the new home and draws no line once the page has read the answers the
 *      browser asked about again.
 *
 * THE TWO DATABASES are made as in tests/the-person-key-outranks-the-remembered-world.test.ts: the
 * first is made, its identity and installation read, and closed, so the former home is a real
 * database identity of this installation.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, liveApp, waitForThePage, type TestDb } from './helpers.ts'
import { HOME_HEADER, HOME_MOVED_HEADER } from '../src/config/visit-headers.mjs'

let t: TestDb
/** The identity of the database the test office answers from, which is home now. */
let here: string
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
  // BOTH DATABASES ARE ONE INSTALLATION, which the former home row below is checked against.
  t.client.sqlite.prepare('UPDATE installation SET id = ? WHERE only_row = 1').run(installation)
  const thisHome = now.theWorldThisDatabaseIs()
  if (thisHome === null) throw new Error('this test database has no identity')
  here = thisHome
  // THE FORMER HOME, CLOSED, as the worlds table holds it after a move.
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

/** A window with a storage of its own, for the part of the page that runs without a browser. */
function aStandInWindow(): { restore: () => void } {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  const before = (globalThis as { window?: unknown }).window
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', origin: 'http://127.0.0.1:41600', hostname: '127.0.0.1', reload: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  return {
    restore: () => {
      ;(globalThis as { window?: unknown }).window = before
    },
  }
}

describe('the rule, without a browser', () => {
  it('a moved header naming the home the page already keeps writes nothing and raises no line', async () => {
    const stand = aStandInWindow()
    try {
      const page = await import('../src/web/lib/world.ts')
      page.forgetTheWorldOnThisPage()
      page.forgetTheHomeWorld()
      const kept = JSON.stringify({ database: here, head: '905d1df' })
      window.localStorage.setItem(page.HOME_WORLD_KEY, kept)

      page.adoptTheHomeWorld({ database: here, head: null })
      expect(page.theHomeMovedOnThisPage(), 'the page said its home had moved to the home it already kept').toBe(false)
      expect(window.localStorage.getItem(page.HOME_WORLD_KEY), 'the kept home was written again').toBe(kept)

      // AND A HOME THAT REALLY CHANGES STILL RAISES IT, so the rule above is not a line that never shows.
      page.forgetTheHomeWorld()
      window.localStorage.setItem(page.HOME_WORLD_KEY, JSON.stringify({ database: formerHome, head: null }))
      page.adoptTheHomeWorld({ database: here, head: null })
      expect(page.theWorldThisPageCallsHome(), 'the page did not adopt the home the reply named').toBe(here)
      expect(page.theHomeMovedOnThisPage(), 'a real move raised no line').toBe(true)
    } finally {
      stand.restore()
    }
  })
})

describe('in a browser, across a reload', () => {
  it('draws the line on the load that adopts the new home and not on the next one', async () => {
    const { HOME_WORLD_KEY } = await import('../src/web/lib/world.ts')
    const live = await liveApp({
      name: 'r87-moved-home-once',
      viewport: { width: 1440, height: 900 },
      workspace: 'default',
      database: t.file,
    })
    try {
      const page = live.page
      // THE FORMER HOME IS WRITTEN ONCE, before the first load's code runs, and never again. The
      // mark in this tab's session storage outlives a reload, so the second load starts from what
      // the first one left in the page's storage, as the owner's browser does.
      await page.addInitScript(
        ({ key, home }) => {
          if (window.sessionStorage.getItem('r87.theFormerHomeWasWritten') !== null) return
          window.sessionStorage.setItem('r87.theFormerHomeWasWritten', 'yes')
          window.localStorage.setItem(key, JSON.stringify({ database: home, head: null }))
        },
        { key: HOME_WORLD_KEY, home: formerHome },
      )
      type Answer = { path: string; home: string | null; status: number; askedAgain: boolean; moved: string | null }
      const answers: Answer[] = []
      const pending: Promise<unknown>[] = []
      page.on('response', (response) => {
        if (!response.url().startsWith(`${live.api}/api/`)) return
        const path = new URL(response.url()).pathname + new URL(response.url()).search
        // THE HEADERS AS THEY WENT AND CAME, read with allHeaders(), because the tag the browser asks
        // with is added by its cache and the plain headers() leave it out.
        pending.push(
          Promise.all([response.request().allHeaders(), response.allHeaders()]).then(
            ([sent, came]) => {
              answers.push({
                path,
                home: sent[HOME_HEADER] ?? null,
                status: response.status(),
                askedAgain: sent['if-none-match'] !== undefined,
                moved: came[HOME_MOVED_HEADER] ?? null,
              })
            },
          ),
        )
      })
      const settled = async (): Promise<Answer[]> => {
        while (pending.length > 0) await Promise.all(pending.splice(0))
        return answers.splice(0)
      }
      const line = page.locator('[data-name="the office has moved home"]')

      // THE FIRST LOAD: the former home is sent, the reply names the new one, and the page keeps it.
      await page.goto(live.site, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await line.waitFor({ timeout: 30_000 })
      const firstLoad = await settled()
      const told = firstLoad.filter((one) => one.home === formerHome && one.moved === here).map((one) => one.path)
      expect(told.length, 'no answer of the first load named the new home').toBeGreaterThan(0)
      expect(
        await page.evaluate((key) => window.localStorage.getItem(key), HOME_WORLD_KEY),
        'the first load did not keep the new home',
      ).toContain(here)

      // THE SECOND LOAD. The browser asks again about the answers it kept, and the page reads each
      // answer to a door the first load was told on before this looks at the line.
      const toldAgain = page.waitForResponse(
        (response) => told.includes(new URL(response.url()).pathname + new URL(response.url()).search),
        { timeout: 60_000 },
      )
      await page.reload({ timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await (await toldAgain).finished()
      // One turn of the page's own loop, so the handler of every answer above has run and drawn.
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0))))
      const secondLoad = await settled()
      const seen = secondLoad
        .filter((one) => told.includes(one.path))
        .map((one) => `${one.path} ${String(one.status)}${one.askedAgain ? ' asked again' : ''}${one.moved === null ? '' : ' moved'}`)
      // A door the page asks without its headers, the owner's name and a picture, sends no home at all.
      expect(
        secondLoad.filter((one) => one.home !== null && one.home !== here).map((one) => `${one.path} sent ${String(one.home)}`),
        'the second load sent a home other than the one the first load adopted',
      ).toEqual([])
      expect(
        secondLoad.some((one) => one.askedAgain),
        `the browser asked about no kept answer again: ${seen.join('; ')}`,
      ).toBe(true)
      expect(await line.count(), `the moved-home line came back on a load whose home had not moved: ${seen.join('; ')}`).toBe(0)
    } finally {
      await live.stop()
    }
  }, 300_000)
})
