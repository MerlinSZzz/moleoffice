// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOME PAGE ASKS FOR THE MACHINE ONCE, AND ONE OPEN TAB DOES NOT ASK AGAIN IN TWO MINUTES.
 *
 * Criterion U7 part 1 of design/settings/ACCEPTANCE.md, and problem `XKsVmmINput5`. `GET /api/runtime`
 * is a machine sweep — it reads /proc and asks the GPU. On the owner's live office between 09:00 and
 * 11:50 on 13 September 2026 it was called 4,315 times at 373 ms each, the costliest thing the server
 * did, one call every 2.4 seconds.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED BEFORE ANYTHING CHANGED, IN A TEST STACK
 * ---------------------------------------------------------------------------------------
 *
 * A page whose served code is older than the checkout draws the wrong-world banner. On such a page
 * one tab made 41 requests to `/api/runtime` in 130 seconds: the two StrictMode mounts at 0.33 s and
 * 0.34 s, a third at 16.47 s when the banner appeared, and then one every 3.04 s — `WrongWorld`'s
 * own timer, which asked the door again every three seconds for as long as anything was wrong. A
 * healthy home page made two, one per StrictMode mount, because `WrongWorld` asked in an effect with
 * no in-flight guard.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 *   the count    one tab, a behind-the-checkout home page, two minutes: one sweep, the page
 *                load's. Until wave 13w round 25 a thirty-second refresh asked again; a decision
 *                replaced it with the server's `machine.changed`, and nothing in
 *                this window changes what a page holds of the machine.
 *   the sharing  one page load, the home page then the Runtime page then Settings: exactly one
 *                `/api/runtime` request, because all three draw the one shared reading.
 *
 * `tests/the-machine-reading-is-rate-limited.test.ts` holds the hour and the hidden page, where a
 * fake clock makes an hour exact.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO MINUTES ARE THE PAGE'S OWN, ON PLAYWRIGHT'S CLOCK
 * ---------------------------------------------------------------------------------------
 *
 * Any timer that asked again would run in the page, so the count case installs Playwright's
 * `page.clock` before the page loads. Once the line is up it stops the page's clock
 * and moves it on ten seconds at a time, twelve times, and after each step it waits in real time
 * until no sweep is out. Every timer inside a step still fires, so every read settles at the page
 * time it would have settled at, and the next timer would count from there, as in a real tab. Each
 * sweep is timed on the page's clock, not the test's. The server is not on this clock; it answers in
 * real time.
 *
 * THE GRACE BEFORE THE LINE IS TURNED DOWN. The page draws the line only after it has been behind
 * for longer than `MOLE_OFFICE_STALE_CODE_GRACE`, fifteen seconds by default. This file's own server
 * is started with it at 0, as tests/the-negative-control.test.ts does, so the line comes about a
 * second after the page first finds itself behind. The grace is not what this file is about.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THESE CASES CAN FAIL
 * ---------------------------------------------------------------------------------------
 *
 *   count    Put a thirty-second timer back in `readTheMachineOnce` in `src/web/lib/onemachine.ts`
 *            (`setInterval(() => void start(), 30_000)`). The page then sweeps at the load and
 *            every thirty seconds after, and the count case goes red.
 *   clock    Delete `await page.clock.runFor(10_000)` from the count case's loop. The page's clock then
 *            stands still, the page still makes one sweep, and only the four beats of the test's
 *            own thirty-second timer go red. They replace the old guard of at least three sweeps.
 *   sharing  Put `const [reading] = useAsync(() => api.runtime(), [])` back in `ThisComputer.tsx`
 *            instead of `useTheMachineState()`. Settings then makes a second request on one page
 *            load, the count is two, and the sharing case goes red.
 *
 * Each was run against the control and then restored; the report records what was seen.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page, Request } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

let app: LiveApp
let page: Page
let aLoad = 0
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** The grace setting as the runner had it, put back when this file ends. */
const graceBefore = process.env['MOLE_OFFICE_STALE_CODE_GRACE']

beforeAll(async () => {
  // THE SERVER THIS FILE STARTS DRAWS THE LINE WITH NO GRACE. See the head of this file.
  process.env['MOLE_OFFICE_STALE_CODE_GRACE'] = '0'
  app = await liveApp({
    name: 'machine-reading',
    viewport: { width: 1440, height: 1000 },
    workspace: 'default',
    // THE DEV SERVER, for the same reason tests/the-behind-the-checkout-line.test.ts asks for it:
    // the scenario is a page that is behind, and this file makes one by rewriting the served-stamp
    // module. A built page has no such module to rewrite.
    theDevServerBecause:
      'the scenario is a page that is behind, made by rewriting the served-stamp module a dev server serves',
  })
  page = app.page
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (graceBefore === undefined) delete process.env['MOLE_OFFICE_STALE_CODE_GRACE']
  else process.env['MOLE_OFFICE_STALE_CODE_GRACE'] = graceBefore
}, 60_000)

/** The virtual module that carries the page's own served stamp, matched by predicate (it has a colon). */
const theStampModule = (url: URL): boolean => url.pathname.includes('virtual:mole-office-served')

/** A stamp an hour before the newest file the page is built from, so the page is really behind. */
async function anHourBehind(): Promise<string> {
  const freshness = (await (
    await fetch(`${app.api}/api/runtime/freshness`, { headers: { 'x-mole-office-workspace': 'default' } })
  ).json()) as { freshness?: { newestForThePage?: string | null } }
  const newest = freshness.freshness?.newestForThePage ?? null
  if (newest === null) throw new Error('the server did not say when the newest page file changed')
  const at = new Date(new Date(newest.replace(' ', 'T')).getTime() - 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
    `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
  )
}

/** How many machine sweeps the page has sent that have not come back yet. */
let sweepsOut = 0

const isASweep = (req: Request): boolean => new URL(req.url()).pathname === '/api/runtime'

/**
 * Every request the page makes to the machine sweep while `run` runs, with the moment it started.
 * `now` is the clock the moments are read on: milliseconds since `run` began, by default in real
 * time.
 */
async function sweepTimes(run: () => Promise<void>, now?: () => number): Promise<number[]> {
  const seen: number[] = []
  const t0 = Date.now()
  const at = now ?? ((): number => Date.now() - t0)
  const watch = (req: Request): void => {
    if (!isASweep(req)) return
    seen.push(at())
    sweepsOut += 1
  }
  const back = (req: Request): void => {
    if (isASweep(req)) sweepsOut -= 1
  }
  sweepsOut = 0
  page.on('request', watch)
  page.on('requestfinished', back)
  page.on('requestfailed', back)
  try {
    await run()
  } finally {
    page.removeListener('request', watch)
    page.removeListener('requestfinished', back)
    page.removeListener('requestfailed', back)
  }
  return seen
}

/** Wait in real time until no sweep is out, so a read settles before the page's clock moves on. */
async function untilNoSweepIsOut(): Promise<void> {
  // A MOMENT FIRST, so a sweep the last second started has reached this process as a request.
  await sleep(50)
  const deadline = Date.now() + 30_000
  while (sweepsOut > 0) {
    if (Date.now() > deadline) throw new Error('a machine sweep was out for thirty seconds and never came back')
    await sleep(20)
  }
}

describe('the home page asks for the machine once, and not again in two minutes', () => {
  /**
   * MUTATION. A thirty-second timer back in `readTheMachineOnce` makes the count five and this goes red.
   */
  it('sweeps once in two minutes, with no re-read on a re-render or a timer', async () => {
    const stamp = await anHourBehind()
    await page.route(theStampModule, async (route) => {
      const response = await route.fetch()
      const original = await response.text()
      await route.fulfill({
        response,
        body: original.replace(/export const servedAt = "[^"]*"/, `export const servedAt = ${JSON.stringify(stamp)}`),
      })
    })
    let bannerAtMs: number | null = null
    let times: number[] = []
    // THE PAGE'S CLOCK, installed before the page loads. It runs at the real rate until it is
    // stopped below. The moments are real milliseconds since the load until then, and the stopped
    // moment plus the seconds the test has moved it on after.
    await page.clock.install()
    const t0 = Date.now()
    let stoppedAtMs: number | null = null
    let movedOnMs = 0
    let clockBeats = 0
    const onThePagesClock = (): number => (stoppedAtMs === null ? Date.now() - t0 : stoppedAtMs + movedOnMs)
    try {
      times = await sweepTimes(async () => {
        aLoad += 1
        await page.goto(`${app.site}/?asks-once=${String(aLoad)}#/`, { timeout: 60_000 })
        await waitForThePage(page, 60_000)
        // THE SCENARIO REALLY HAPPENED: the page is behind, so the one-line warning is up and the old
        // page asked the door every three seconds for as long as that lasted. It was `.px-ww`, the
        // blocking banner, until the freshness reading became a quiet line.
        await page.waitForSelector('.px-btc', { timeout: 30_000 })
        bannerAtMs = Date.now()
        // A THIRTY-SECOND TIMER OF THE TEST'S OWN, IN THE PAGE. It counts its beats on the page's clock,
        // so after the two minutes below it has beaten four times if that clock really moved.
        await page.evaluate(() => {
          const w = window as unknown as { moleClockBeats: number }
          w.moleClockBeats = 0
          setInterval(() => {
            w.moleClockBeats += 1
          }, 30_000)
        })
        // TWO MINUTES FROM THE BANNER, ON THE PAGE'S CLOCK. The first read was a moment before it, so
        // this covers the whole window the old loop hammered. The clock stops here, then moves on one
        // second at a time, and each read that second started comes back before the next.
        // IT STOPS TWO SECONDS AHEAD of the page's time now, because it cannot be stopped at a
        // moment that has already passed, and the call itself takes a moment.
        const pageNow = await page.evaluate(() => Date.now())
        const stopAt = Date.now() - t0 + 2000
        await page.clock.pauseAt(pageNow + 2000)
        stoppedAtMs = stopAt
        await untilNoSweepIsOut()
        // TEN SECONDS A STEP. The page's timers still fire inside each step: a thirty-second timer
        // beats at 30, 60, 90 and 120 seconds, so the four beats below still prove the clock moved.
        for (let step = 0; step < 12; step += 1) {
          await page.clock.runFor(10_000)
          movedOnMs += 10_000
          await untilNoSweepIsOut()
        }
        clockBeats = await page.evaluate(() => (window as unknown as { moleClockBeats: number }).moleClockBeats)
      }, onThePagesClock)
    } finally {
      await page.unroute(theStampModule)
      // THE CLOCK RUNS AGAIN, so the next case's page is not held still.
      await page.clock.resume()
    }
    expect(movedOnMs, 'the page was not given its two minutes').toBe(120_000)
    // AND THE PAGE'S CLOCK REALLY MOVED. One sweep is also what a page whose clock stood still would
    // make, so the count below proves nothing unless a thirty-second timer in the page beat four times.
    expect(clockBeats, 'the clock in the page did not move two minutes, so one sweep proves nothing').toBe(4)

    expect(bannerAtMs, 'the page was never behind, so the loop this test is about never ran').not.toBeNull()
    const said = `the page made ${String(times.length)} machine sweeps in two minutes, at ${times.join(', ')} ms`
    // ONE: the page load's. The two StrictMode mounts join one read, the banner draws from it, and
    // nothing on the page's clock asks again. A second sweep here is a timer or a re-render.
    expect(times.length, said).toBe(1)
  }, 180_000)

  /**
   * MUTATION. A direct `api.runtime()` in `ThisComputer.tsx` makes the count two and this goes red.
   */
  it('asks once for one page load, however many components draw the reading', async () => {
    const times = await sweepTimes(async () => {
      aLoad += 1
      await page.goto(`${app.site}/?sharing=${String(aLoad)}&mode=inspect#/`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      // TWO MORE SURFACES THAT DRAW THE READING, in the same document: the Runtime page and the
      // Settings band. A reload here would be a new page load and would prove nothing.
      await page.evaluate(() => {
        window.location.hash = '#/runtime'
      })
      await page.waitForSelector('.rt-facts', { timeout: 30_000 })
      await page.evaluate(() => {
        // The address names the panel, which opens it: every Settings panel is folded to its title otherwise.
        window.location.hash = '#/settings/thiscomputer'
      })
      await page.waitForSelector('.tcp', { timeout: 30_000 })
      await sleep(1200)
    })
    expect(times.length, `one page load made ${String(times.length)} machine sweeps`).toBe(1)
    // NON-VACUOUS: the Settings band drew its reading, so joining the shared one is what happened.
    // Five lines: four facts and, since wave 13n round 32, the read-only line for one setting.
    expect(await page.locator('.tcp-pair').count(), 'the Settings band drew no facts at all').toBe(5)
    // AND IT SAYS WHEN THE SHARED READING WAS TAKEN, so a reader can tell a fresh answer from an
    // old one. The label is uppercased by CSS, so the comparison is case-insensitive.
    expect((await page.locator('.tcp-read').innerText()).toLowerCase()).toContain('read at')
  }, 120_000)
})
