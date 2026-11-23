// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change (wave 13s round 281, problem dWyVAhGRCn-v): the test opens Home's Late or stuck fold
// before it taps a row.
// Since HD-2d, Home draws Late or stuck inside a closed fold. The record row the late obligation
// makes is inside it. So the test opens the fold with a tap before Mole Office is armed, and takes
// the row from inside the fold. Before, the test took the first record row anywhere on Home, and the
// row it meant was drawn closed.
/**
 * `Ask agent` IS REACHABLE BY TAP, WHICH IS THE ONLY WAY IN ON A TOUCH SCREEN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS PATH NEEDS ITS OWN TEST
 * ---------------------------------------------------------------------------------------
 *
 * Right-click is the fastest way into the composer and it does not exist on a phone, on a tablet,
 * or for anybody driving Mole Office without a mouse. The control in the rail is the path that does: tap
 * it to arm, tap the thing, and the composer opens on that thing. `Shift+F10` is the third path and
 * `tests/one-way-into-the-composer.test.ts` holds it.
 *
 * The whole path rests on ONE piece of state: after the first tap, Mole Office is waiting for the next
 * press and takes it as the subject. Without that state the control has nothing to do on a touch
 * screen — a tap is a press with no button, so there is no gesture left to carry "and this is the
 * thing I mean".
 *
 * MUTATION: make `whatThePressDoes` never answer `mark`, which is the arm state removed. The two
 * touch-path tests below go red, and the words test goes red with them because the control then
 * describes something it does not do.
 *
 * ---------------------------------------------------------------------------------------
 * IT USES REAL TOUCH EVENTS, NOT A CLICK
 * ---------------------------------------------------------------------------------------
 *
 * `page.tap` on a context with `hasTouch` sends `touchstart`/`touchend`, which is what a finger
 * sends. A `click()` would pass on a build where every touch handler had been deleted.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

// `PointingLayer.tsx` reaches `api.ts`, which reads the chosen workspace out of `window` at import
// time, so the module is loaded after the shim below rather than at the top of this file.
let pointing: typeof import('../src/web/components/agent/PointingLayer.tsx')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let app: LiveApp
let page: Page

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
}

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  pointing = await import('../src/web/components/agent/PointingLayer.tsx')
  app = await liveApp({ name: 'ask-agent-tap', viewport: { width: 1440, height: 1000 }, hasTouch: true })
  page = app.page
  await post('/api/records', { kind: 'problem', title: 'A tap has no button to press with', summary: 'Measured at 1440.' })
  // A PROMISE PAST ITS DATE, so Home's Late or stuck draws a record row. Since the approved Home
  // a record that is neither late nor waiting on the person is on no Home
  // section, and the second tap below is on a record row. The row is inside Late or stuck's fold,
  // which `beforeAll` opens below.
  await post('/api/records', { kind: 'obligation', title: 'A tap is owed an answer', data: { due: '2020-03-01', owedTo: 'the touch review', state: 'open' } })
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // LATE OR STUCK IS A CLOSED FOLD ON HOME, and the row the second tap means is inside it. A finger
  // opens it here, before the first tap arms Mole Office, as a person would. The fold is drawn once
  // the projects' readings arrive.
  const fold = '#main [data-home-late-open]'
  await page.waitForSelector(fold, { timeout: 60_000 })
  await page.tap(`${fold} > summary`)
  // The click a tap makes may land after `page.tap` returns, so the fold's open property is read
  // until it is true, for at most five seconds. A fold still closed fails here, by its own name.
  await page
    .waitForFunction((at) => document.querySelector<HTMLDetailsElement>(at)?.open === true, fold, { timeout: 5_000 })
    .catch((err: unknown) => {
      throw new Error(`a tap on Late or stuck's summary did not open its fold, so no row in it can be tapped: ${String(err)}`)
    })
  await sleep(900)
  await page.keyboard.press('Escape')
  await sleep(150)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

const armed = () => page.evaluate(() => document.documentElement.getAttribute('data-pointing') === '1')

const composerSays = () =>
  page.evaluate(() => {
    const chip = document.querySelector('.px-talk-quote')
    if (chip === null) return null
    const kind = chip.querySelector('.px-talk-chip-kind')?.textContent?.trim() ?? ''
    const what = chip.querySelector('.px-talk-chip-what')?.textContent?.trim() ?? ''
    return `${kind} ${what}`.trim()
  })


describe('the arm state, which is the whole touch path', () => {
  it('answers mark on a page with something to point at, and thePage on one without', () => {
    expect(pointing.whatThePressDoes(false, true)).toBe('mark')
    expect(pointing.whatThePressDoes(false, false)).toBe('thePage')
    expect(pointing.whatThePressDoes(true, true)).toBe('stop')
  })

  it('arms on a tap, with nothing open yet', async () => {
    expect(await armed(), 'Mole Office was already armed before the tap').toBe(false)
    await page.tap('.px-point-switch')
    await sleep(400)
    expect(await armed(), 'a tap did not arm Mole Office').toBe(true)
    expect(await composerSays(), 'the first tap opened the composer, so nothing was chosen').toBeNull()
  })

  it('opens the composer on the thing the second tap lands on', async () => {
    // A RECORD ROW ON HOME, which says what it is and is not the control itself. Home's rows name
    // their records so they can be talked about (Row's target prop in ui.tsx says why: on 18 August
    // 2026 Home had none). It is the row inside Late or stuck's fold, which `beforeAll` opened.
    // Test change (wave 13s round 281): before, this took the first record row anywhere on Home.
    const at = await page.evaluate(() => {
      const one = document.querySelector('#main [data-home-late-open] [data-target^="record/"]:not(:has([data-target]))')
      if (one === null) return null
      one.scrollIntoView({ block: 'center' })
      const box = one.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return null
      return { x: Math.round(box.left + Math.min(box.width / 2, 60)), y: Math.round(box.top + box.height / 2) }
    })
    expect(at, 'no record row on Home was marked as something to talk about').not.toBeNull()
    await page.touchscreen.tap(at!.x, at!.y)
    await sleep(600)
    const says = await composerSays()
    expect(says, 'the second tap did not open the composer').not.toBeNull()
    expect(says).not.toBe('')
    // And the mode ended with it: it is a gesture, not a mode a person has to leave.
    expect(await armed()).toBe(false)
  })
})
