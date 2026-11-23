// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REFRESHING MARK SITS ON THE SIDEBAR'S FOOT AND NEVER COVERS ITS PRESSES.
 *
 * The "Refreshing…" words used to be drawn in a bar fixed across the foot of the window, starting
 * at the left edge, at the bar's layer. That bar covered the row with Settings at the sidebar's
 * foot, so a person could not reach Settings while a page took a newer answer. The mark had to show
 * somewhere else, for example by the person's own picture at the left of the foot.
 *
 * So this file holds two things in a real browser on a made-up office:
 *
 *   - while a read is held refreshing, the centre of Settings at the foot is still the press or
 *     inside it, at 1440, 990 and 660; the thin turning ring is on the disc at the foot. At 390 the
 *     sidebar is a drawer, so the ring is on the press that opens it. The ring takes no space and
 *     no pointer events, and stands still when reduced motion is asked for;
 *   - the disc draws the person's own picture when the person has one, and the letter when the
 *     person has none (or the picture cannot be loaded). The letter is what it drew before for a
 *     person with no picture.
 *
 * Criterion E5 is still proved by tests/a-page-that-rereads-keeps-what-it-has.test.ts: the page
 * keeps what it has until the newer answer, and a failed newer read says so in words. This file
 * does not repeat those two facts; it changes where the mark is drawn, not what it says.
 *
 * The pictures, when TEST_SHOTS names a folder: 1440, 990, 660 and 390, light and dark, English and
 * Chinese, with the ring showing, without it, and with a failed newer read.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page, Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { testShots } from './where-shots-go.ts'

let app: LiveApp

const THE_WIDTHS = [1440, 990, 660, 390] as const
const THE_DESK_WIDTHS = [1440, 660] as const
const THE_LOOKS = ['light', 'dark'] as const
const THE_LANGUAGES = ['en', 'zh'] as const

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

beforeAll(async () => {
  app = await liveApp({ name: 'reread-mark-on-the-foot', workspace: 'default', viewport: { width: 1440, height: 1000 } })
}, 240_000)

afterAll(async () => {
  await app.page.unroute('**/api/runtime').catch(() => undefined)
  await app?.stop()
}, 120_000)

/** Open the Runtime page, whose one press reads again, and wait until nothing is being re-read. */
async function openRuntime(page: Page, language = 'en'): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${language}#/runtime`)
  await page.waitForSelector('.rt-again', { timeout: 30_000 })
  await page.waitForSelector('.px-reread', { state: 'detached', timeout: 30_000 })
}

/** One held read: the server's own reply, kept back from the page until the test releases it. */
interface HeldRead {
  route: Route
  response: Promise<Awaited<ReturnType<Route['fetch']>>>
}

async function holdTheNextRead(route: Route, held: HeldRead[]): Promise<void> {
  const pending = route.fetch()
  held.push({ route, response: pending })
  await pending
}

async function waitForTheHold(held: HeldRead[], quietMs = 10_000): Promise<HeldRead | null> {
  const until = Date.now() + quietMs
  while (held.length === 0) {
    if (Date.now() > until) return null
    await new Promise((r) => setTimeout(r, 20))
  }
  return held.shift() as HeldRead
}

async function releaseTheRead(read: HeldRead): Promise<void> {
  const response = await read.response
  const headers = response.headers()
  delete headers['content-length']
  await read.route.fulfill({ status: response.status(), headers, body: await response.text() })
}

/** Refuse a read the way the door refuses, with the server's own headers and the door's own shape. */
async function refuseTheRead(route: Route): Promise<void> {
  const response = await route.fetch()
  const headers = response.headers()
  delete headers['content-length']
  await route.fulfill({ status: 500, headers, body: JSON.stringify({ error: 'a test refusal', reason: 'refused on purpose by the test' }) })
}

/** Start a re-read that is held, and answer the hold once the test has looked at the screen. */
async function startAHeldReRead(page: Page): Promise<HeldRead[]> {
  const held: HeldRead[] = []
  await page.route('**/api/runtime', (route) => holdTheNextRead(route, held))
  await page.click('.rt-again')
  await page.waitForSelector('.px-reread-what', { state: 'attached', timeout: 10_000 })
  return held
}

/** What the browser answers about a drawn ring: is it drawn, does it turn, and does it take a press? */
interface RingReading {
  drawn: boolean
  turning: boolean
  moving: boolean
  positioned: string
  pointerEvents: string
  boxWidth: number
}

async function theRingOn(page: Page, selector: string): Promise<RingReading> {
  const light = page.locator('canvas[data-wait-light]').last()
  await light.waitFor({ state: 'visible', timeout: 10_000 })
  const ring = await page.locator(selector).first().evaluate((element) => {
    const style = getComputedStyle(element)
    const after = getComputedStyle(element, '::after')
    const box = element.getBoundingClientRect()
    return {
      drawn: parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none',
      turning: after.display !== 'none' && after.content !== 'none' && after.animationName !== 'none',
      boxWidth: box.width,
      center: { x: box.left + box.width / 2, y: box.top + box.height / 2 },
    }
  })
  await expect.poll(async () => {
    const box = await light.boundingBox()
    return box !== null && ring.center.x >= box.x && ring.center.x <= box.x + box.width && ring.center.y >= box.y && ring.center.y <= box.y + box.height
  }, { timeout: 10_000 }).toBe(true)
  const sample = () => light.evaluate((element) => {
    const canvas = element as HTMLCanvasElement
    return Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data)
  })
  const first = await sample()
  const lap = await page.evaluate(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--motion-lap').trim()
    return parseFloat(value) * (value.endsWith('ms') ? 1 : 1000)
  })
  await page.waitForTimeout(lap / 4)
  const second = await sample()
  const style = await light.evaluate((element) => ({ positioned: getComputedStyle(element).position, pointerEvents: getComputedStyle(element).pointerEvents }))
  return { ...ring, ...style, moving: first.some((value, i) => value !== second[i]) }
}

/** The element under the centre of a press, and whether that element is the press or inside it. */
async function thePressAtTheCentre(page: Page, selector: string): Promise<{ reachable: boolean; under: string }> {
  return await page.locator(selector).evaluate((press) => {
    const box = press.getBoundingClientRect()
    const under = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return { reachable: under !== null && (press === under || press.contains(under)), under: under?.getAttribute('class') ?? 'nothing' }
  })
}

describe('the refreshing mark sits on the foot, not over its presses', () => {
  for (const width of THE_DESK_WIDTHS) {
    it(`keeps a press at the foot working while a read refreshes, and draws the ring on the disc, at ${String(width)}`, async () => {
      await app.page.setViewportSize({ width, height: 1000 })
      await openRuntime(app.page)
      const held = await startAHeldReRead(app.page)
      try {
        // BELOW 1024 THE SIDEBAR IS A DRAWER, so its foot is on screen only once the Menu press
        // opens it. The re-read is already in flight when the drawer opens.
        if (width < 1024) {
          await app.page.locator('.shell-menu').click()
          await app.page.locator('.shell-side').evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))) })
        }
        await app.page.locator('.sbp-settings').waitFor({ state: 'visible', timeout: 10_000 })
        await app.page.locator('.sbp-disc[data-refreshing="1"]').waitFor({ state: 'attached', timeout: 10_000 })

        const press = await thePressAtTheCentre(app.page, '.sbp-settings')
        expect(press.reachable, `at ${String(width)} the element at the centre of Settings is ${press.under}`).toBe(true)

        const ring = await theRingOn(app.page, '.sbp-disc')
        expect(ring.drawn, `at ${String(width)} the disc draws no ring`).toBe(true)
        expect(ring.turning, `at ${String(width)} the disc ring turns`).toBe(false)
        expect(ring.moving, `at ${String(width)} the light does not travel`).toBe(true)
        expect(ring.positioned, `at ${String(width)} the light is in the flow and would move the foot`).toBe('fixed')
        expect(ring.pointerEvents, `at ${String(width)} the ring takes a press`).toBe('none')
      } finally {
        const read = await waitForTheHold(held)
        if (read !== null) await releaseTheRead(read)
        await app.page.unroute('**/api/runtime')
      }
    }, 120_000)
  }

  it('draws the ring on the press that opens the sidebar where the sidebar is a drawer, at 390', async () => {
    await app.page.setViewportSize({ width: 390, height: 844 })
    await openRuntime(app.page)
    const held = await startAHeldReRead(app.page)
    try {
      await app.page.locator('.shell-menu[data-refreshing="1"]').waitFor({ state: 'visible', timeout: 10_000 })
      const ring = await theRingOn(app.page, '.shell-menu')
      expect(ring.drawn, 'the press that opens the sidebar draws no ring').toBe(true)
      expect(ring.turning, 'the border of the press turns').toBe(false)
      expect(ring.moving, 'the light on the press does not travel').toBe(true)
      expect(ring.positioned, 'the light on the press that opens the sidebar is in the flow').toBe('fixed')
      expect(ring.pointerEvents, 'the ring on the press that opens the sidebar takes a press').toBe('none')
      // The drawer is closed, so the disc is not what carries the mark at this width.
      expect(await app.page.locator('.sbp-disc[data-refreshing="1"]').isVisible()).toBe(false)
    } finally {
      const read = await waitForTheHold(held)
      if (read !== null) await releaseTheRead(read)
      await app.page.unroute('**/api/runtime')
    }
  }, 120_000)

  it('stands the ring still when reduced motion is asked for, and still draws it', async () => {
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.emulateMedia({ reducedMotion: 'reduce' })
    try {
      await openRuntime(app.page)
      const held = await startAHeldReRead(app.page)
      try {
        await app.page.locator('.sbp-disc[data-refreshing="1"]').waitFor({ state: 'attached', timeout: 10_000 })
        const ring = await theRingOn(app.page, '.sbp-disc')
        expect(ring.drawn, 'with reduced motion the disc draws no ring').toBe(true)
        expect(ring.turning, 'with reduced motion the ring still turns').toBe(false)
        expect(ring.moving, 'with reduced motion the light still travels').toBe(false)
      } finally {
        const read = await waitForTheHold(held)
        if (read !== null) await releaseTheRead(read)
        await app.page.unroute('**/api/runtime')
      }
    } finally {
      await app.page.emulateMedia({ reducedMotion: null })
    }
  }, 120_000)

  it('shows the newest read failed in words, at the foot of the page column and clear of the foot row, at 1440', async () => {
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await openRuntime(app.page)
    await app.page.route('**/api/runtime', refuseTheRead)
    try {
      await app.page.click('.rt-again')
      await app.page.locator('.px-reread .px-error').waitFor({ state: 'visible', timeout: 15_000 })
      const words = (await app.page.locator('.px-reread').textContent()) ?? ''
      expect(words).toContain('A newer read failed.')
      // THE FOOT OF THE PAGE COLUMN STARTS WHERE THE SIDEBAR ENDS, so it never covers the foot row.
      const laid = await app.page.evaluate(() => {
        const strip = document.querySelector('.px-reread')?.getBoundingClientRect()
        const side = document.querySelector('#shell-side')?.getBoundingClientRect()
        const foot = document.querySelector('.sbp-foot-row')?.getBoundingClientRect()
        if (strip === undefined || side === undefined || foot === undefined) return null
        return {
          startsAfterTheSidebar: strip.left >= side.right - 1,
          coversTheFoot: strip.right > foot.left && strip.left < foot.right && strip.bottom > foot.top && strip.top < foot.bottom,
        }
      })
      expect(laid, 'the strip or the sidebar is not on the page').not.toBe(null)
      expect(laid!.startsAfterTheSidebar, 'the failed read starts over the sidebar').toBe(true)
      expect(laid!.coversTheFoot, 'the failed read covers the foot row').toBe(false)
      // AND THE FOOT'S PRESSES STILL WORK BESIDE IT.
      const press = await thePressAtTheCentre(app.page, '.sbp-settings')
      expect(press.reachable, `the element at the centre of Settings is ${press.under}`).toBe(true)
    } finally {
      await app.page.unroute('**/api/runtime')
    }
  }, 120_000)
})

describe('the disc draws the person\'s own picture', () => {
  /** Put a picture on the test office's person, or take it away again. */
  async function setTheOwnersPicture(choice: 'a picture' | 'none'): Promise<void> {
    if (choice === 'none') {
      const reset = await fetch(`${app.api}/api/participants/person/${THE_TEST_OFFICES_OWNER.id}/avatar`, {
        method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify({ reset: true }),
      })
      expect(reset.status, await reset.clone().text()).toBe(201)
      return
    }
    const offered = await fetch(`${app.api}/api/avatars/drawn/chill-bee`, { headers: AS_THE_OWNER })
    expect(offered.status, await offered.clone().text()).toBe(200)
    const bytes = Buffer.from(await offered.arrayBuffer()).toString('base64')
    const stored = await fetch(`${app.api}/api/participants/person/${THE_TEST_OFFICES_OWNER.id}/avatar`, {
      method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify({ bytes }),
    })
    expect(stored.status, await stored.clone().text()).toBe(201)
  }

  /** Open the sidebar at the width, and answer what the disc draws. */
  async function openTheFoot(width: number): Promise<{ letter: string; pictures: number; shown: boolean }> {
    await app.page.setViewportSize({ width, height: 1000 })
    await app.page.goto('about:blank')
    await app.page.goto(`${app.site}/?lang=en#/office`)
    await waitForThePage(app.page, 60_000)
    if (width < 1024) await app.page.locator('.shell-menu').click()
    await app.page.locator('.sbp-person-name', { hasText: THE_TEST_OFFICES_OWNER.name }).waitFor({ timeout: 15_000 })
    return await app.page.locator('.sbp-disc').evaluate((disc) => {
      const picture = disc.querySelector('img.sbp-disc-picture')
      return {
        letter: (disc.textContent ?? '').trim(),
        pictures: disc.querySelectorAll('img.sbp-disc-picture').length,
        shown: picture !== null && getComputedStyle(picture).display !== 'none' && picture.getBoundingClientRect().width > 0,
      }
    })
  }

  it('draws the person\'s picture when there is one, and the letter when there is not, at 1440 and 390', async () => {
    await setTheOwnersPicture('none')
    try {
      for (const width of [1440, 390] as const) {
        await setTheOwnersPicture('none')
        const none = await openTheFoot(width)
        expect(none.letter, `at ${String(width)} a person with no picture draws no letter`).toBe(THE_TEST_OFFICES_OWNER.name.slice(0, 1))
        expect(none.pictures, `at ${String(width)} a person with no picture draws a picture`).toBe(0)

        await setTheOwnersPicture('a picture')
        const withPicture = await openTheFoot(width)
        expect(withPicture.pictures, `at ${String(width)} a person with a picture draws no picture`).toBe(1)
        expect(withPicture.shown, `at ${String(width)} the person's picture is not on the screen`).toBe(true)
        if (withPicture.shown && THE_SHOTS !== undefined) {
          await app.page.locator('.sbp-foot').screenshot({ path: join(THE_PICTURES, `foot-with-picture-${String(width)}.png`) })
        }
      }
    } finally {
      await setTheOwnersPicture('none')
    }
  }, 240_000)

  it('draws the letter when the person\'s picture cannot be loaded', async () => {
    await setTheOwnersPicture('a picture')
    try {
      // THE PICTURE IS THERE FIRST, so this case is about a picture that cannot be loaded rather
      // than about a person with none.
      const before = await openTheFoot(1440)
      expect(before.pictures, 'the picture case did not put a picture on the disc').toBe(1)
      await app.page.route('**/api/assets/**', (route) => route.abort('failed'))
      await app.page.goto('about:blank')
      await app.page.goto(`${app.site}/?lang=en#/office`)
      await waitForThePage(app.page, 60_000)
      await app.page.locator('.sbp-person-name', { hasText: THE_TEST_OFFICES_OWNER.name }).waitFor({ timeout: 15_000 })
      // THE PICTURE FAILS TWICE, then the component moves to the drawn one, which this test also
      // refuses; what must be left is the letter, not an empty disc.
      await expect.poll(async () => await app.page.locator('.sbp-disc').evaluate((disc) => {
        const picture = disc.querySelector('img.sbp-disc-picture')
        return picture !== null && getComputedStyle(picture).display !== 'none'
      }), { timeout: 15_000 }).toBe(false)
      const letter = (await app.page.locator('.sbp-disc').textContent())?.trim() ?? ''
      expect(letter).toBe(THE_TEST_OFFICES_OWNER.name.slice(0, 1))
    } finally {
      await app.page.unroute('**/api/assets/**')
      await setTheOwnersPicture('none')
    }
  }, 240_000)
})

const THE_SHOTS = process.env['TEST_SHOTS']
const THE_PICTURES = testShots('reread-mark-on-the-foot')

describe('the refreshing mark in pictures', () => {
  it.skipIf(THE_SHOTS === undefined)('photographs the foot at four widths, both themes, in English and Chinese, with the ring, without it, and with a failed newer read', async () => {
    const shots = THE_PICTURES
    mkdirSync(shots, { recursive: true })
    for (const look of THE_LOOKS) {
      const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
      await context.addInitScript(({ person, theme }: { person: string; theme: string }) => {
        localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
        localStorage.setItem('mole-office.preset.theme', theme)
      }, { person: THE_TEST_OFFICES_OWNER.id, theme: look })
      const page = await context.newPage()
      for (const language of THE_LANGUAGES) {
        for (const width of THE_WIDTHS) {
          await page.setViewportSize({ width, height: 1000 })
          await openRuntime(page, language)
          expect(await page.locator('html').getAttribute('data-theme'), `${language} ${look} ${String(width)}: not in the theme asked`).toBe(look)

          // WITHOUT THE RING.
          await page.screenshot({ path: join(shots, `reread-${language}-${look}-${String(width)}-quiet.png`) })

          // WITH THE RING SHOWING.
          const held = await startAHeldReRead(page)
          try {
            await page.screenshot({ path: join(shots, `reread-${language}-${look}-${String(width)}-refreshing.png`) })
            // A CLOSE-UP OF WHERE THE RING IS, because a ring a few pixels wide is hard to see on a
            // whole page. At the desk it is on the disc; below 1024 it is on the Menu press.
            const ringAt = width >= 1024 ? page.locator('.sbp-foot') : page.locator('.shell-menu')
            await ringAt.screenshot({ path: join(shots, `reread-${language}-${look}-${String(width)}-ring-close.png`) })
          } finally {
            const read = await waitForTheHold(held)
            if (read !== null) await releaseTheRead(read)
          }
          await page.waitForSelector('.px-reread', { state: 'detached', timeout: 15_000 })

          // WITH A FAILED NEWER READ.
          await page.route('**/api/runtime', refuseTheRead)
          try {
            await page.click('.rt-again')
            await page.locator('.px-reread .px-error').waitFor({ state: 'visible', timeout: 15_000 })
            await page.screenshot({ path: join(shots, `reread-${language}-${look}-${String(width)}-failed.png`) })
          } finally {
            await page.unroute('**/api/runtime')
          }
        }
      }
      await context.close()
    }
  }, 900_000)
})
