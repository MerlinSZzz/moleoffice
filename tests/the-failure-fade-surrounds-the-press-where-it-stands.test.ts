// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSED "I have read this" FADES AROUND THE PRESS WHERE IT NOW STANDS.
 *
 * On Home at 1440 the failure line is drawn beside the press, and drawing it pushes the press along
 * the row. The light's last animation frame was painted before that line existed, so a failure that
 * faded there drew the canvas over the line instead of around the press.
 *
 * THIS CASE READS BOTH BOXES AT THE MOMENT THE FADE STARTS, by wrapping the canvas's own `animate`
 * before the page loads. It proves the canvas box contains the press box then, and that the press
 * really moved from where it waited, so the case is the one the fix is for.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { WORLD_HEADER } from '../src/config/world-header.mjs'
import { t } from '../src/shared/i18n.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON_HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** Where the init script leaves the two boxes it read when the fade started. */
const THE_FADE_AT_START = '__theFailureFadeAtStart'

type Box = { left: number; top: number; right: number; bottom: number }
type BoxesAtTheStart = { canvas: Box | null; press: Box | null }

let app: LiveApp
/** Which world the test office says answered, copied onto the made-up refusal. */
let worldAnswered = ''
/** The reply headers a page is allowed to read, copied from the real office's own health answer. */
let exposedHeaders = ''

beforeAll(async () => {
  app = await liveApp({ name: 'failure-fade-around-the-press', viewport: { width: 1440, height: 900 } })
  const health = await fetch(`${app.api}/api/health`)
  worldAnswered = health.headers.get(WORLD_HEADER) ?? ''
  exposedHeaders = health.headers.get('access-control-expose-headers') ?? ''
  if (worldAnswered === '') throw new Error('the test office did not say which world answered GET /api/health')
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

/**
 * THE CORS HEADERS A REPLY OWES A PAGE ON ANOTHER LOOPBACK PORT, as the sibling outcome test says:
 * without them the browser refuses this made-up answer and the component sees a network error.
 */
function theHeadersThePageMayRead(): Record<string, string> {
  return {
    'access-control-allow-origin': app.site,
    vary: 'Origin',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': exposedHeaders,
    [WORLD_HEADER]: worldAnswered,
  }
}

/** Before the page loads, note the canvas and press boxes at the moment the fade animation is made. */
async function readTheBoxesWhenTheFadeStarts(page: Page): Promise<void> {
  await page.addInitScript((recordKey: string) => {
    const animate = HTMLCanvasElement.prototype.animate
    HTMLCanvasElement.prototype.animate = function (this: HTMLCanvasElement, frames: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
      const press = document.querySelector('.att-rep-press .px-btn')
      const box = (rect: DOMRect | null): Box | null => rect === null ? null : { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
      ;(window as unknown as Record<string, BoxesAtTheStart>)[recordKey] = {
        canvas: box(this.getBoundingClientRect()),
        press: press === null ? null : box(press.getBoundingClientRect()),
      }
      return animate.call(this, frames, options)
    }
  }, THE_FADE_AT_START)
}

/**
 * ONE PRESS, ONE HELD WRITE, ONE REFUSAL. The report is seeded the way the sibling outcome test
 * seeds it, and the read mark's own write is held so the waiting light is drawn before the refusal
 * arrives. The refusal is answered with the world header and the CORS headers above.
 */
it('draws the refused reading point\'s fade around the press where it now stands', async () => {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: PERSON_HEADERS,
    body: JSON.stringify({
      kind: 'report',
      title: 'The reading point moved with the failure line',
      data: {
        for: THE_TEST_OFFICES_OWNER.name,
        date: '2026-11-10',
        blocks: [{ id: 'b-1', type: 'text', heading: 'What I found', text: 'The failure line arrives beside the press.' }],
      },
    }),
  })
  if (!made.ok) throw new Error(`seeding a report answered ${String(made.status)}: ${await made.text()}`)
  const report = ((await made.json()) as { record: { id: string } }).record

  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await readTheBoxesWhenTheFadeStarts(page)

  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let held = false
  await page.route((url) => url.pathname === `/api/records/${report.id}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    held = true
    await gate
    await route.fulfill({ status: 500, headers: theHeadersThePageMayRead(), contentType: 'application/json', body: JSON.stringify({ error: 'The reading point could not be stored in this test.' }) })
  })
  try {
    await page.goto(`${app.site}/#/`)
    await waitForThePage(page)
    const press = page.locator('.att-rep-press .px-btn')
    await press.waitFor({ timeout: 30_000 })
    expect(await press.innerText()).toContain(t('home.iHaveRead'))

    await press.click()
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    // THE LIGHT IS DELAYED, so the refusal must not be released before the canvas it fades exists.
    const light = page.locator('canvas[data-wait-light]')
    await expect.poll(() => light.count(), { timeout: 10_000, message: 'the press draws its waiting light' }).toBe(1)
    const whereItWaited = await press.evaluate((element) => element.getBoundingClientRect().left)

    release()
    await page.locator('.att-rep-failed').waitFor({ timeout: 30_000 })
    expect(await page.locator('.att-rep-failed').innerText()).toBe(t('home.reportReadFailed'))

    const atTheFade = await page.evaluate((recordKey) => (window as unknown as Record<string, BoxesAtTheStart | undefined>)[recordKey] ?? null, THE_FADE_AT_START)
    expect(atTheFade, 'the light fades after a refusal').not.toBeNull()
    expect(atTheFade?.canvas ?? null, 'the fade canvas is still drawn').not.toBeNull()
    expect(atTheFade?.press ?? null, 'the press is still on the page when the fade starts').not.toBeNull()
    if (atTheFade === null || atTheFade.canvas === null || atTheFade.press === null) throw new Error('the fade did not record both boxes')

    const moved = Math.abs(atTheFade.press.left - whereItWaited)
    expect(moved, 'the failure line pushed the press before the fade started, so this is the case the fix is for').toBeGreaterThan(8)

    expect(atTheFade.canvas.left, 'the fade canvas starts at or before the press it surrounds').toBeLessThanOrEqual(atTheFade.press.left)
    expect(atTheFade.canvas.top, 'the fade canvas starts at or above the press it surrounds').toBeLessThanOrEqual(atTheFade.press.top)
    expect(atTheFade.canvas.right, 'the fade canvas ends at or after the press it surrounds').toBeGreaterThanOrEqual(atTheFade.press.right)
    expect(atTheFade.canvas.bottom, 'the fade canvas ends at or below the press it surrounds').toBeGreaterThanOrEqual(atTheFade.press.bottom)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await context.close()
  }
}, 120_000)
