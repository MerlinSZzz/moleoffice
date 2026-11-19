// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST ENTRY: A NEW OFFICE GREYS EVERYTHING BUT ONE PLACE, SHOWS THE CHAT, THEN THE CHECKLIST, AND ENDS ON THE REPORT.
 * Item 74 of wave 13y, part b (round 138): a decision, with the shape settled in
 * JC2_JG3WNjp- points 1, 2 and 5. Part c's browser half is here too: a press
 * on the link inside the item's words opens the report, and the item's facts stay closed.
 *
 * Every office here is started fresh, owned by nobody named, and the person names it in the welcome guide, as a new
 * person does. Every name and word in it is made up. In a browser:
 *   1. after the name is given, one layer greys the office, and a press outside its gap does nothing: the page stays
 *      where it is and the press lands on the grey;
 *   2. step one: the gap is over the sidebar's Chat row, the words say this is the chat and that no buttons need
 *      pressing, and there is a Next button; the row can be pressed through the gap, and the split it opens is in the
 *      gap too;
 *   3. the keyboard cannot leave the gap and the words: every Tab lands in one of them;
 *   4. step two, after Next: the gap moves to the checklist press, whose ring pulses (and is drawn steady, still
 *      lit, when the reader asks for less motion); the sidebar's Chat row is grey now;
 *   5. the checklist opens through the gap, its one item holds the report's title as a link, and a press on that link
 *      opens the report and leaves the item's facts closed; the layer is gone, and the office says the first entry
 *      ended, by the person. The item is standing, which is never counted, so the list draws no "0 of 0 done" line,
 *      and the press says 0 (round 139, decision nYVpu3pQE5dM);
 *   6. after a reload, and at another address, the layer is not drawn again;
 *   7. a browser where the checklist is switched off (the switch may be left from an older office at the same
 *      address) is not trapped: step two switches it on, says so, and lights it, and the first entry ends from it as
 *      in step two above (decision s17K3PIf0zV5). It stays on afterwards.
 *   8. on a phone, at 390, the open checklist is as wide as the window, so the ring around it and the press takes in
 *      the header. A press on the Menu button there still lands on the grey, and no menu opens (round 139, the
 *      refusal of round 138's check).
 *   9. the checklists page draws no bar for the getting-started list either, in its row or on the list's own page,
 *      and the list's own page still says how many are still to do: "0 still to do" (round 139).
 *  10. at 1440 and 390, in light and in dark, the pulse is plain over the grey: held at its middle and at its start,
 *      the grey around the gap changes by at least the bounds below, and toward the office's press colour
 *      (round 139: it blinks and glows so that it draws a press).
 *
 * PICTURES AND A FILM. With FIRST_ENTRY_SHOTS naming a folder, the last cases photograph both steps and the report at
 * 1440, 990, 660 and 390 in light and dark, and film a first start from the welcome guide to the report at 1440.
 * With GETTING_STARTED_PICTURES naming a folder, a case photographs the two pictures the report carries, from a made-up
 * office with one made-up agent asking at the Embassy. Without them, those cases are skipped.
 *
 * MUTATIONS, each after a green control run, then restored: listed in round 138's report, and for cases 5, 8, 9 and
 * 10 in round 139's.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { sayInEnglish, type WordKey } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const OWNER_SETTINGS = ['MOLE_OFFICE_OWNER_ID', 'MOLE_OFFICE_OWNER_NAME'] as const
const NAME = 'A made-up newcomer'
const say = (key: string, values?: Record<string, string | number>): string => sayInEnglish(key as WordKey, values)
/**
 * HOW PLAIN STEP TWO'S PULSE MUST BE OVER THE GREY, as colour distances from 0 (the same colour) to 441 (black to white),
 * each the mean over a band of grey around the gap, between the pulse's middle and its start. NEAR is the first 8
 * pixels, WIDE the 12 after them. Round 138's soft halo, which was found too faint, measured 12 to 28 near and 6 to
 * 11 wide at 1440 and 390 in both looks; the bounds are well above that and well below what the new pulse draws.
 */
const NEAR_CHANGE = 90
const NEAR_TOWARD = 90
const WIDE_CHANGE = 40

/**
 * THE FRESH OFFICE'S PERSON, by the id that office writes for them, read from its owner door. An office started with
 * both owner settings empty has its own id for its person, which is not the one this test process holds.
 */
async function thePersonOf(app: LiveApp): Promise<string> {
  const reply = await fetch(`${app.api}/api/office/owner`)
  expect(reply.status).toBe(200)
  return String(((await reply.json()) as { id: string }).id)
}

async function asThePerson(app: LiveApp): Promise<Record<string, string>> {
  return { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': await thePersonOf(app) }
}

/** An office owned by nobody named: both owner settings EMPTY in its environment, as tests/the-first-run-guide.test.ts starts one. */
async function aFreshOffice(name: string, width = 1440): Promise<LiveApp> {
  const saved = OWNER_SETTINGS.map((key) => [key, process.env[key]] as const)
  for (const key of OWNER_SETTINGS) process.env[key] = ''
  try {
    return await liveApp({ name, viewport: { width, height: 900 } })
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

async function openFresh(page: Page, url: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(url, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** The person names the office in the welcome guide and lands on Home. */
async function nameTheOffice(app: LiveApp, page: Page = app.page): Promise<void> {
  await openFresh(page, `${app.site}/?lang=en#/welcome`)
  await page.locator('.wlc-input').fill(NAME)
  await page.getByRole('button', { name: 'Open my office' }).click()
  await page.waitForFunction(() => location.hash === '#/', undefined, { timeout: 30_000 })
  await waitForThePage(page, 60_000)
}

interface TheFirstEntry {
  state: 'none' | 'on' | 'ended'
  report: string | null
  checklist: string | null
  shows: boolean
  ended: { by: { type: string; id: string }; at: string } | null
}

async function theFirstEntry(app: LiveApp): Promise<TheFirstEntry> {
  const reply = await fetch(`${app.api}/api/getting-started`, { headers: await asThePerson(app) })
  expect(reply.status, await reply.clone().text()).toBe(200)
  return (await reply.json()) as TheFirstEntry
}

async function theReportTitle(app: LiveApp, id: string): Promise<string> {
  const reply = await fetch(`${app.api}/api/records/${id}`, { headers: await asThePerson(app) })
  expect(reply.status).toBe(200)
  return String(((await reply.json()) as { record: { title: string } }).record.title)
}

/** The rectangle the layer leaves open, and what a press at a point would land on. */
async function theGap(page: Page): Promise<{ left: number; top: number; right: number; bottom: number }> {
  return page.locator('.fe-ring').evaluate((el) => {
    const box = el.getBoundingClientRect()
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
  })
}

async function whatAPressLandsOn(page: Page, selector: string): Promise<{ inLayer: boolean; inTarget: boolean }> {
  return page.evaluate((target) => {
    const el = document.querySelector(target)
    if (el === null) throw new Error(`${target} is not on the page`)
    const box = el.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return { inLayer: hit?.closest('.fe-layer') !== null && hit?.closest('.fe-words') === null, inTarget: hit !== null && el.contains(hit) }
  }, selector)
}

const inside = (inner: { left: number; top: number; right: number; bottom: number }, outer: { left: number; top: number; right: number; bottom: number }): boolean =>
  inner.left >= outer.left - 0.5 && inner.top >= outer.top - 0.5 && inner.right <= outer.right + 0.5 && inner.bottom <= outer.bottom + 0.5

async function aBox(page: Page, selector: string): Promise<{ left: number; top: number; right: number; bottom: number }> {
  return page.locator(selector).first().evaluate((el) => {
    const box = el.getBoundingClientRect()
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
  })
}

type Box = { left: number; top: number; right: number; bottom: number }
type Colour = readonly [number, number, number]

/** The office's own press colour in the look the page is in: the colour of its main presses and of the chat button. */
async function thePressColour(page: Page): Promise<Colour> {
  return page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.background = 'var(--button-primary-bg)'
    document.body.append(probe)
    const [r = NaN, g = NaN, b = NaN] = (getComputedStyle(probe).backgroundColor.match(/\d+(\.\d+)?/g) ?? []).map(Number)
    probe.remove()
    return [r, g, b] as const
  })
}

/** The pulse held at one point of its cycle (0 its start, 0.5 its middle), and a picture of the window then. */
async function theWindowAtThePulse(page: Page, at: number): Promise<string> {
  await page.evaluate((point) => {
    const ring = document.querySelector('.fe-ring')
    if (ring === null) throw new Error('the ring is not on the page')
    const pulses = document.getAnimations().filter((one) => {
      const target = one.effect instanceof KeyframeEffect ? one.effect.target : null
      return target !== null && ring.contains(target)
    })
    if (pulses.length === 0) throw new Error('the ring has no animation')
    for (const one of pulses) {
      one.pause()
      one.currentTime = Number(one.effect?.getTiming().duration) * point
    }
  }, at)
  return (await page.screenshot()).toString('base64')
}

interface ABand {
  /** The mean colour distance between the pulse's middle and its start, 0 to 441. */
  change: number
  /** How much nearer the press colour the middle is than the start, on the same scale. */
  toward: number
  pixels: number
}

/**
 * WHAT THE PULSE DOES TO THE GREY in a band from `from` to `to` pixels outside the gap, leaving out the words. Both
 * pictures are of one window, taken a moment apart with nothing else moving, so the pulse is all that differs.
 */
async function theBand(page: Page, pictures: { middle: string; start: string }, gap: Box, words: Box, colour: Colour, from: number, to: number): Promise<ABand> {
  return page.evaluate(
    async ({ pictures, gap, words, colour, from, to }) => {
      const read = async (png: string): Promise<ImageData> => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob())
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const drawn = canvas.getContext('2d')
        if (drawn === null) throw new Error('no canvas to read the picture with')
        drawn.drawImage(bitmap, 0, 0)
        return drawn.getImageData(0, 0, bitmap.width, bitmap.height)
      }
      const [middle, start] = [await read(pictures.middle), await read(pictures.start)]
      const scale = middle.width / window.innerWidth
      const apart = (data: Uint8ClampedArray, at: number, other: readonly number[]): number =>
        Math.hypot(data[at]! - other[0]!, data[at + 1]! - other[1]!, data[at + 2]! - other[2]!)
      let change = 0
      let toward = 0
      let pixels = 0
      const [x0, x1] = [Math.max(0, Math.floor((gap.left - to) * scale)), Math.min(middle.width, Math.ceil((gap.right + to) * scale))]
      const [y0, y1] = [Math.max(0, Math.floor((gap.top - to) * scale)), Math.min(middle.height, Math.ceil((gap.bottom + to) * scale))]
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const [cx, cy] = [(x + 0.5) / scale, (y + 0.5) / scale]
          const away = Math.hypot(Math.max(gap.left - cx, 0, cx - gap.right), Math.max(gap.top - cy, 0, cy - gap.bottom))
          if (away < from || away >= to) continue
          if (cx >= words.left - 4 && cx <= words.right + 4 && cy >= words.top - 4 && cy <= words.bottom + 4) continue
          const at = (y * middle.width + x) * 4
          change += Math.hypot(middle.data[at]! - start.data[at]!, middle.data[at + 1]! - start.data[at + 1]!, middle.data[at + 2]! - start.data[at + 2]!)
          toward += apart(start.data, at, colour) - apart(middle.data, at, colour)
          pixels++
        }
      }
      return { change: pixels === 0 ? 0 : change / pixels, toward: pixels === 0 ? 0 : toward / pixels, pixels }
    },
    { pictures, gap, words, colour, from, to },
  )
}

describe('a new office’s first entry', () => {
  let app: LiveApp
  let report = ''
  let title = ''
  beforeAll(async () => {
    app = await aFreshOffice('first-entry')
    await app.page.addInitScript(() => {
      if (localStorage.getItem('mole-office.preset.theme') === null) localStorage.setItem('mole-office.preset.theme', 'light')
    })
    await nameTheOffice(app)
    // This case exercises the explicit unread-only choice.
    const person = await thePersonOf(app)
    const unreadOnly = await fetch(`${app.api}/api/participants/person/${person}`, {
      method: 'PATCH', headers: await asThePerson(app), body: JSON.stringify({ chatButtonStays: 'when-unread' }),
    })
    expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
    // The choice was written outside this page, so load it before asking what the page draws.
    await app.page.reload({ timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    const entry = await theFirstEntry(app)
    expect(entry).toMatchObject({ state: 'on', shows: true })
    report = String(entry.report)
    title = await theReportTitle(app, report)
  }, 240_000)
  afterAll(async () => {
    await app?.stop()
  })

  it('1: greys the office, and a press outside the gap does nothing', async () => {
    await app.page.locator('.fe-layer[data-step="chat"]').waitFor({ timeout: 30_000 })
    // Test change (wave 13y round 165): All records is listed on All pages now, so the press outside
    // the gap lands on the sidebar's All pages entry.
    const records = 'a.shell-link.shell-all-pages'
    expect(await whatAPressLandsOn(app.page, records)).toEqual({ inLayer: true, inTarget: false })
    const box = await aBox(app.page, records)
    await app.page.mouse.click((box.left + box.right) / 2, (box.top + box.bottom) / 2)
    await app.page.waitForTimeout(300)
    expect(await app.page.evaluate(() => location.hash)).toBe('#/')
    expect(await app.page.locator('.ckw-panel').count()).toBe(0)
    expect(await whatAPressLandsOn(app.page, '.ckw-press')).toEqual({ inLayer: true, inTarget: false })
  })

  it("2: step one lights the sidebar's Chat row, says what it is, and has a Next button", async () => {
    const words = app.page.locator('.fe-words')
    expect(await words.locator('.fe-words-title').textContent()).toBe(say('firstEntry.chat.title'))
    expect(await words.locator('.fe-words-text').textContent()).toBe(say('firstEntry.chat.text'))
    expect(say('firstEntry.chat.text')).toContain('No buttons need pressing')
    await words.getByRole('button', { name: say('firstEntry.next') }).waitFor()
    // NOTHING WAITS, so design D draws no circle: the row is the way in.
    expect(await app.page.locator('.px-chat-circle').count()).toBe(0)
    expect(inside(await aBox(app.page, '.shell-chat'), await theGap(app.page))).toBe(true)
    expect(await whatAPressLandsOn(app.page, '.shell-chat')).toEqual({ inLayer: false, inTarget: true })
    // The chat opens through the gap, and the gap grows to hold the open split.
    await app.page.locator('.shell-chat').click()
    await app.page.locator('.px-chat[data-where="split"]').waitFor({ timeout: 10_000 })
    await expect.poll(async () => inside(await aBox(app.page, '.px-chat[data-where="split"]'), await theGap(app.page)), { timeout: 5_000 }).toBe(true)
    // The close drawn beside the page is in the gap too, and pressing it closes the chat.
    expect(inside(await aBox(app.page, '.px-chat-seam-away'), await theGap(app.page))).toBe(true)
    await app.page.locator('.px-chat-seam-away').click()
    await app.page.locator('.px-chat[data-where="split"]').waitFor({ state: 'detached', timeout: 10_000 })
  })

  it('3: the keyboard stays in the gap and the words', async () => {
    const where: string[] = []
    for (let n = 0; n < 12; n++) {
      await app.page.keyboard.press(n % 4 === 3 ? 'Shift+Tab' : 'Tab')
      where.push(
        await app.page.evaluate(() => {
          const el = document.activeElement
          if (el === null || el === document.body) return 'nowhere'
          if (el.closest('.fe-words') !== null) return 'words'
          if (el.closest('.px-chat-circle, .px-chat, .shell-chat, .shell-chat-phone') !== null) return 'chat'
          return `outside: ${el.outerHTML.slice(0, 80)}`
        }),
      )
    }
    expect(where.filter((one) => one !== 'words' && one !== 'chat')).toEqual([])
    expect(where).toContain('chat')
  })

  it("4: after Next, the checklist press glows and pulses, and the sidebar's Chat row is grey", async () => {
    await app.page.locator('.fe-words').getByRole('button', { name: say('firstEntry.next') }).click()
    await app.page.locator('.fe-layer[data-step="checklist"]').waitFor({ timeout: 10_000 })
    expect(await app.page.locator('.fe-words-title').textContent()).toBe(say('firstEntry.checklist.title'))
    expect(await app.page.locator('.fe-words-text').textContent()).toBe(say('firstEntry.checklist.text'))
    expect(inside(await aBox(app.page, '.ckw-press'), await theGap(app.page))).toBe(true)
    expect(await whatAPressLandsOn(app.page, '.ckw-press')).toEqual({ inLayer: false, inTarget: true })
    expect(await whatAPressLandsOn(app.page, '.shell-chat')).toEqual({ inLayer: true, inTarget: false })
    expect(await app.page.locator('.fe-ring').getAttribute('data-pulse')).toBe('yes')
    const mark = app.page.locator('.fe-ring .fe-ring-mark')
    expect(await mark.evaluate((el) => getComputedStyle(el).animationName)).not.toBe('none')
    await app.page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await mark.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
    // Steady, it still glows: the halo is drawn without the pulse.
    expect(await mark.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none')
    await app.page.emulateMedia({ reducedMotion: 'no-preference' })
  })

  it('5: the item’s link opens the report, its facts stay closed, and the first entry ends', async () => {
    await app.page.locator('.ckw-press').click()
    const panel = app.page.locator('.ckw-panel')
    await panel.waitFor({ timeout: 10_000 })
    await expect.poll(async () => inside(await aBox(app.page, '.ckw-panel'), await theGap(app.page)), { timeout: 5_000 }).toBe(true)
    const link = panel.locator('.ckp-words a', { hasText: title })
    await link.waitFor({ timeout: 30_000 })
    expect(await link.getAttribute('href')).toBe(`#/report/${report}`)
    // ITS ONE ITEM IS STANDING, which is never counted, so the list draws no "0 of 0 done" line, and the press says 0.
    // Soft, so that a failure here still lets the case end the first entry, and the cases after it start as they should.
    const group = panel.locator('.ckw-group', { has: app.page.locator('.ckw-group-title', { hasText: say('gettingStarted.checklist.title') }) })
    expect.soft(await group.count()).toBe(1)
    expect.soft(await group.locator('.ckp-progress').count()).toBe(0)
    expect.soft(await app.page.locator('.ckw-count').textContent()).toBe('0')
    // THE PANEL IS STILL OPENING AT THE READ, and a second later the press lands on the link, so this waits for the press to land on the link.
    await expect.poll(async () => await whatAPressLandsOn(app.page, '.ckp-words a'), { timeout: 5_000 }).toEqual({ inLayer: false, inTarget: true })
    await link.click()
    await app.page.waitForFunction((id) => location.hash === `#/report/${id}`, report, { timeout: 10_000 })
    expect(await panel.locator('details.ckp-open', { has: app.page.locator('.ckp-words a', { hasText: title }) }).evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false)
    await app.page.locator('.fe-layer').waitFor({ state: 'detached', timeout: 10_000 })
    await expect.poll(async () => (await theFirstEntry(app)).state, { timeout: 10_000 }).toBe('ended')
    const entry = await theFirstEntry(app)
    expect(entry.shows).toBe(false)
    expect(entry.ended?.by).toEqual({ type: 'human', id: await thePersonOf(app) })
  })

  it('6: after a reload, and at another address, the layer is not drawn again', async () => {
    for (const address of ['#/', '#/records']) {
      await openFresh(app.page, `${app.site}/?lang=en${address}`)
      await app.page.locator('.ckw-press').waitFor({ timeout: 30_000 })
      await app.page.waitForTimeout(500)
      expect(await app.page.locator('.fe-layer').count(), address).toBe(0)
    }
  })

  it('9: on the checklists page, the list with only its standing item draws no "0 of 0 done" line, and still says what is to do', async () => {
    const checklist = String((await theFirstEntry(app)).checklist)
    const name = say('gettingStarted.checklist.title')
    await openFresh(app.page, `${app.site}/?lang=en#/checklists/${checklist}`)
    const row = app.page.locator('.ckb-row', { has: app.page.locator('.ckb-row-title', { hasText: name }) })
    await row.waitFor({ timeout: 30_000 })
    expect(await row.locator('.ckp-progress').count()).toBe(0)
    const one = app.page.locator('.ck1')
    await one.locator('.ck1-title', { hasText: name }).waitFor({ timeout: 30_000 })
    expect(await one.locator('.ckp-progress').count()).toBe(0)
    expect(await one.locator('.ck1-counts').textContent()).toBe(say('checklists.countsNoneWaiting', { open: 0 }))
  })
})

describe('a browser where the checklist is switched off', () => {
  it('7: is not trapped: step two switches the checklist on, says so, and the first entry ends from it', async () => {
    const app = await aFreshOffice('first-entry-no-checklist')
    try {
      await openFresh(app.page, `${app.site}/?lang=en#/welcome`)
      // Set once, before the shell is drawn, as an older office at this address would have left it.
      await app.page.evaluate(() => localStorage.setItem('mole-office.checklists.window', 'off'))
      await app.page.locator('.wlc-input').fill(NAME)
      await app.page.getByRole('button', { name: 'Open my office' }).click()
      await app.page.waitForFunction(() => location.hash === '#/', undefined, { timeout: 30_000 })
      await waitForThePage(app.page, 60_000)
      const report = String((await theFirstEntry(app)).report)
      const title = await theReportTitle(app, report)
      await app.page.locator('.fe-layer[data-step="chat"]').waitFor({ timeout: 30_000 })
      expect(await app.page.locator('.ckw-press').count(), 'step one switched the checklist on').toBe(0)
      await app.page.locator('.fe-words').getByRole('button', { name: say('firstEntry.next') }).click()
      await app.page.locator('.fe-layer[data-step="checklist"]').waitFor({ timeout: 10_000 })
      await app.page.locator('.ckw-press').waitFor({ timeout: 10_000 })
      expect(await app.page.evaluate(() => localStorage.getItem('mole-office.checklists.window'))).toBe('on')
      expect(await app.page.locator('.fe-words-note').textContent()).toBe(say('firstEntry.checklist.switchedOn'))
      expect(await app.page.locator('.fe-words-text').textContent()).toBe(say('firstEntry.checklist.text'))
      await expect.poll(async () => inside(await aBox(app.page, '.ckw-press'), await theGap(app.page)), { timeout: 5_000 }).toBe(true)
      expect(await app.page.locator('.fe-ring').getAttribute('data-pulse')).toBe('yes')
      await app.page.locator('.ckw-press').click()
      const link = app.page.locator('.ckw-panel .ckp-words a', { hasText: title })
      await link.waitFor({ timeout: 30_000 })
      await link.click()
      await app.page.waitForFunction((id) => location.hash === `#/report/${id}`, report, { timeout: 10_000 })
      await app.page.locator('.fe-layer').waitFor({ state: 'detached', timeout: 10_000 })
      await expect.poll(async () => (await theFirstEntry(app)).state, { timeout: 10_000 }).toBe('ended')
      await openFresh(app.page, `${app.site}/?lang=en#/`)
      await app.page.locator('.ckw-press').waitFor({ timeout: 30_000 })
      expect(await app.page.evaluate(() => localStorage.getItem('mole-office.checklists.window'))).toBe('on')
    } finally {
      await app.stop()
    }
  }, 240_000)
})

describe('the checklist press’s pulse in step two', () => {
  for (const width of [1440, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      it(`10: at ${String(width)} in ${theme}, a wide halo in the press colour comes and goes plainly over the grey`, async () => {
        const app = await aFreshOffice(`first-entry-pulse-${theme}-${String(width)}`, width)
        try {
          await app.page.addInitScript((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
          await nameTheOffice(app)
          await app.page.locator('.fe-layer[data-step="chat"]').waitFor({ timeout: 30_000 })
          await app.page.locator('.fe-words').getByRole('button', { name: say('firstEntry.next') }).click()
          await app.page.locator('.fe-layer[data-step="checklist"]').waitFor({ timeout: 10_000 })
          await expect.poll(async () => inside(await aBox(app.page, '.ckw-press'), await theGap(app.page)), { timeout: 5_000 }).toBe(true)
          await app.page.waitForTimeout(400)
          const gap = await theGap(app.page)
          const words = await aBox(app.page, '.fe-words')
          const colour = await thePressColour(app.page)
          const pictures = { middle: await theWindowAtThePulse(app.page, 0.5), start: await theWindowAtThePulse(app.page, 0) }
          // NEAR: the first 8 pixels of grey around the gap; WIDE: the 12 pixels after them.
          const near = await theBand(app.page, pictures, gap, words, colour, 1, 9)
          const wide = await theBand(app.page, pictures, gap, words, colour, 9, 21)
          const said = `near ${JSON.stringify(near)}, wide ${JSON.stringify(wide)}, press colour ${colour.join(',')}`
          expect(near.pixels, said).toBeGreaterThan(100)
          expect(wide.pixels, said).toBeGreaterThan(100)
          expect(near.change, said).toBeGreaterThanOrEqual(NEAR_CHANGE)
          expect(near.toward, said).toBeGreaterThanOrEqual(NEAR_TOWARD)
          expect(wide.change, said).toBeGreaterThanOrEqual(WIDE_CHANGE)
        } finally {
          await app.stop()
        }
      }, 240_000)
    }
  }
})

describe('a first entry on a phone', () => {
  it('8: at 390, with the checklist open in step two, a press on the Menu button lands on the grey and opens no menu', async () => {
    const app = await aFreshOffice('first-entry-phone', 390)
    try {
      await nameTheOffice(app)
      await app.page.locator('.fe-layer[data-step="chat"]').waitFor({ timeout: 30_000 })
      // THE TOP BAR'S CHAT PRESS IS THE WAY IN ON A PHONE, and it is the place the gap holds.
      expect(inside(await aBox(app.page, '.shell-chat-phone'), await theGap(app.page))).toBe(true)
      expect(await whatAPressLandsOn(app.page, '.shell-chat-phone')).toEqual({ inLayer: false, inTarget: true })
      await app.page.locator('.fe-words').getByRole('button', { name: say('firstEntry.next') }).click()
      await app.page.locator('.fe-layer[data-step="checklist"]').waitFor({ timeout: 10_000 })
      await app.page.locator('.ckw-press').click()
      await app.page.locator('.ckw-panel .ckp-words a').waitFor({ timeout: 30_000 })
      await expect.poll(async () => inside(await aBox(app.page, '.ckw-panel'), await theGap(app.page)), { timeout: 5_000 }).toBe(true)
      // The open checklist is as wide as the window, so the box holding it and the press takes in the whole header.
      const menu = app.page.locator('.shell-menu')
      expect(inside(await aBox(app.page, '.shell-menu'), await theGap(app.page)), 'the Menu button is inside the ring').toBe(true)
      expect(await menu.getAttribute('aria-expanded')).toBe('false')
      expect(await whatAPressLandsOn(app.page, '.shell-menu')).toEqual({ inLayer: true, inTarget: false })
      const box = await aBox(app.page, '.shell-menu')
      await app.page.mouse.click((box.left + box.right) / 2, (box.top + box.bottom) / 2)
      await app.page.waitForTimeout(300)
      expect(await menu.getAttribute('aria-expanded')).toBe('false')
      expect(await app.page.locator('.fe-layer[data-step="checklist"]').count()).toBe(1)
      expect(await app.page.locator('.ckw-panel').count()).toBe(1)
    } finally {
      await app.stop()
    }
  }, 240_000)
})

describe('pictures and a film of the first entry', () => {
  it.skipIf(!process.env['FIRST_ENTRY_SHOTS'])('photographs both steps and the report at four widths in both looks', async () => {
    const shots = process.env['FIRST_ENTRY_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        const app = await aFreshOffice(`first-entry-shots-${theme}-${String(width)}`, width)
        try {
          await app.page.addInitScript((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
          await nameTheOffice(app)
          const report = String((await theFirstEntry(app)).report)
          await app.page.locator('.fe-layer[data-step="chat"]').waitFor({ timeout: 30_000 })
          await app.page.waitForTimeout(400)
          await app.page.screenshot({ path: `${shots}/step-one-${String(width)}-${theme}.png` })
          await app.page.locator('.fe-words').getByRole('button', { name: say('firstEntry.next') }).click()
          await app.page.locator('.fe-layer[data-step="checklist"]').waitFor({ timeout: 10_000 })
          await app.page.waitForTimeout(400)
          await app.page.screenshot({ path: `${shots}/step-two-${String(width)}-${theme}.png` })
          await app.page.locator('.ckw-press').click()
          await app.page.locator('.ckw-panel .ckp-words a').waitFor({ timeout: 30_000 })
          await app.page.waitForTimeout(400)
          await app.page.screenshot({ path: `${shots}/step-two-open-${String(width)}-${theme}.png` })
          await app.page.locator('.ckw-panel .ckp-words a').click()
          await app.page.waitForFunction((id) => location.hash === `#/report/${id}`, report, { timeout: 10_000 })
          await app.page.locator('.fe-layer').waitFor({ state: 'detached', timeout: 10_000 })
          await app.page.locator('.ckw-close').click()
          await waitForThePage(app.page, 60_000)
          await app.page.waitForTimeout(400)
          await app.page.screenshot({ path: `${shots}/the-report-${String(width)}-${theme}.png`, fullPage: true })
        } finally {
          await app.stop()
        }
      }
    }
  }, 1_200_000)

  it.skipIf(!process.env['FIRST_ENTRY_SHOTS'])('films a first start from the welcome guide to the report, at 1440', async () => {
    const dir = join(process.env['FIRST_ENTRY_SHOTS'] as string, 'film')
    mkdirSync(dir, { recursive: true })
    const app = await aFreshOffice('first-entry-film')
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir, size: { width: 1440, height: 900 } } })
    await context.addInitScript(() => localStorage.setItem('mole-office.preset.theme', 'light'))
    const filmed = await context.newPage()
    try {
      await openFresh(filmed, `${app.site}/?lang=en#/welcome`)
      await filmed.waitForTimeout(1200)
      await filmed.locator('.wlc-input').fill(NAME)
      await filmed.waitForTimeout(800)
      await filmed.getByRole('button', { name: 'Open my office' }).click()
      await filmed.locator('.fe-layer[data-step="chat"]').waitFor({ timeout: 30_000 })
      await filmed.waitForTimeout(3000)
      await filmed.locator('.fe-words').getByRole('button', { name: say('firstEntry.next') }).click()
      await filmed.waitForTimeout(3000)
      await filmed.locator('.ckw-press').click()
      await filmed.locator('.ckw-panel .ckp-words a').waitFor({ timeout: 30_000 })
      await filmed.waitForTimeout(2000)
      await filmed.locator('.ckw-panel .ckp-words a').click()
      await filmed.locator('.fe-layer').waitFor({ state: 'detached', timeout: 10_000 })
      await filmed.locator('.ckw-close').click()
      await filmed.waitForTimeout(3000)
    } finally {
      await context.close()
      await app.stop()
    }
    const video = filmed.video()
    if (video === null) throw new Error('the window recorded no film')
    await video.saveAs(join(dir, 'the-first-entry.webm'))
    await video.delete()
  }, 300_000)

  it.skipIf(!process.env['GETTING_STARTED_PICTURES'])('photographs the two pictures the report carries, from a made-up office', async () => {
    const shots = process.env['GETTING_STARTED_PICTURES'] as string
    mkdirSync(shots, { recursive: true })
    const app = await liveApp({ name: 'getting-started-pictures', viewport: { width: 1440, height: 900 } })
    try {
      const asked = await fetch(`${app.api}/api/agents/register-myself`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'a-made-up-helper' },
        body: JSON.stringify({ handle: 'a-made-up-helper', name: 'A made-up helper', workingDirectory: '/tmp', requestedRole: 'worker' }),
      })
      expect(asked.status, (await asked.text()).replace(/[0-9a-f]{64}/g, '<a key>')).toBe(202)
      await app.page.addInitScript(() => {
        localStorage.setItem('mole-office.preset.theme', 'light')
        localStorage.setItem('mole-office.workspace', 'default')
      })
      await openFresh(app.page, `${app.site}/?lang=en#/embassy`)
      await app.page.locator('.door-ask[data-door-ask="a-made-up-helper"]').waitFor({ timeout: 30_000 })
      await app.page.waitForTimeout(400)
      // The Embassy is listed on All pages, and the sidebar marks the All pages entry on its page (wave 13y
      // round 165). The entry is scrolled into the window first, and the clip is kept inside it.
      await app.page.locator('a.shell-link.shell-all-pages').scrollIntoViewIfNeeded()
      const embassy = await aBox(app.page, 'a.shell-link.shell-all-pages')
      const sidebar = await aBox(app.page, '.shell-side')
      const height = 320
      await app.page.screenshot({
        path: `${shots}/the-embassy-in-the-list.png`,
        clip: { x: sidebar.left, y: Math.min(Math.max(0, embassy.top - height / 2), 900 - height), width: sidebar.right - sidebar.left, height },
      })
      await app.page.locator('.door-asks').first().screenshot({ path: `${shots}/an-agent-asking-at-the-embassy.png` })
    } finally {
      await app.stop()
    }
  }, 240_000)
})
