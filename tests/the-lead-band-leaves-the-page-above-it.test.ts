// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LEAD'S BAND LEAVES THE PAGE ABOVE IT, AT 390 AND 660, IN BOTH LOOKS.
 *
 * Round 172: at 390 the offer the guide sent Home was drawn over the Agents at work row. Scrolling
 * could bring that row out from under the band, but the first view still had the card on top of the
 * page's words. The lead's box is fixed to the window, so reserving room at the page's foot can only
 * clear the last line once the reader scrolls there.
 *
 * So below the lead's own line the page keeps a box of its own: the shell is a column of the page and
 * the band, and the page scrolls inside the room left above the band. The band and its actions stay
 * on screen, and no part of the page is drawn underneath it, at the first view or after any scroll.
 *
 * WHAT IS MEASURED, in a real browser on a test office of this file's own, at 390 and 660 in the light
 * and the dark look. A made-up guide offers Home a lead to a made-up report:
 *   1. The shell's page box ends at or above the band's top. Nothing of the page is drawn under it.
 *   2. The page still scrolls: it is longer than its box, it moves, and the band does not move with it.
 *   3. Take me there and Not now are drawn, inside the band and inside the window.
 *   4. A resize that changes the band's height does not throw the page back to where it was when the
 *      band first took its room, and closing the band leaves the page where the reader had it.
 *
 * MUTATION: draw the band fixed again (remove the narrow `data-lead-band` layout), and part 1 is red at
 * every case, with the page box ending below the band's top.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putThePageAt, thePageScroller, toTheEndOfThePage, whereThePageIs } from './the-page-scroller.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const GUIDE = 'made-up-lead-guide'
const GUIDE_NAME = 'Made-up Guide'
const REPORT = 'A made-up report with a title long enough to wrap on a narrow screen'
const WIDTHS = [390, 660] as const
const THEMES = ['light', 'dark'] as const

let app: LiveApp
let guideKey = ''
let reportId = ''

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<any> {
  const answer = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  if (!answer.ok) throw new Error(`POST ${path} answered ${String(answer.status)}: ${text}`)
  return text === '' ? {} : (JSON.parse(text) as Record<string, any>)
}

async function aLead(): Promise<string> {
  const sent = await post('/api/records', {
    kind: 'message',
    title: 'A made-up lead with a long sentence',
    data: {
      body: 'Made-up words that the guide said about the report, long enough to take two lines on a phone.',
      to: [{ kind: 'person', id: THE_PERSON }],
      lead: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' } },
    },
  }, { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': GUIDE, 'x-mole-office-key': guideKey })
  return String(sent.record.id)
}

async function markRead(message: string): Promise<void> {
  await fetch(`${app.api}/api/messages/${message}/mark`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify({ mark: 'seen' }) })
}

interface Shape {
  page: { bottom: number; top: number }
  band: { bottom: number; top: number; left: number; right: number }
  scroller: string
  pageTop: number
  pageLength: number
  offers: number
  goes: number
  nots: number
  window: { width: number; height: number }
}

async function theShape(page: Page): Promise<Shape> {
  const scroller = await thePageScroller(page)
  try {
    const name = await scroller.evaluate((box) => box === document.scrollingElement ? 'the window' : `${box.tagName.toLowerCase()}#${box.id}`)
    const shape = await page.evaluate(() => {
      const box = (one: Element | null): { bottom: number; top: number; left: number; right: number } => {
        if (one === null) return { bottom: 0, top: 0, left: 0, right: 0 }
        const r = one.getBoundingClientRect()
        return { bottom: r.bottom, top: r.top, left: r.left, right: r.right }
      }
      const main = document.querySelector('.shell-main')!
      const band = document.querySelector('.px-lead-here')!
      const pageBox = document.getElementById('main')!
      return {
        page: box(main),
        band: box(band),
        pageTop: pageBox.scrollTop,
        pageLength: pageBox.scrollHeight,
        offers: document.querySelectorAll('.px-lead-offer').length,
        goes: document.querySelectorAll('.px-lead-go').length,
        nots: document.querySelectorAll('.px-lead-not').length,
        window: { width: window.innerWidth, height: window.innerHeight },
      }
    })
    return { ...shape, scroller: name }
  } finally { await scroller.dispose() }
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-lead-band-leaves-the-page-above-it', viewport: { width: 390, height: 900 } })
  reportId = String((await post('/api/records', { kind: 'report', title: REPORT, data: { blocks: [{ id: 'b1', type: 'text', text: 'Made-up words of a made-up report.' }] } }, AS_THE_PERSON)).record.id)
  const started = await post('/api/agents/started', { handle: GUIDE, name: GUIDE_NAME, role: 'worker', runtime: 'claude-code' }, AS_THE_PERSON)
  guideKey = String(started.whatToGiveIt.key)
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

for (const theme of THEMES) for (const width of WIDTHS) {
  it(`leaves Home above the band and scrolling at ${String(width)} in the ${theme} look`, async () => {
    const lead = await aLead()
    const context = await app.browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript((look: string) => {
      localStorage.setItem('mole-office.preset.theme', look)
      localStorage.setItem('mole-office.chat.open', 'no')
    }, theme)
    const page = await context.newPage()
    try {
      await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset['theme']), { timeout: 30_000 }).toBe(theme)
      await page.locator('.px-lead-offer').waitFor({ timeout: 30_000 })
      await expect.poll(() => page.locator('.px-lead-offer .px-lead-words').first().textContent(), { timeout: 30_000 })
        .toContain(GUIDE_NAME)
      await page.mouse.move(0, 0)

      const first = await theShape(page)
      expect(first.offers, 'the offer is drawn').toBeGreaterThan(0)
      expect(first.page.bottom, `${String(width)} ${theme}: the page's box ends above the band's top`)
        .toBeLessThanOrEqual(first.band.top + 0.5)
      expect(first.pageLength, `${String(width)} ${theme}: the page is longer than the window`).toBeGreaterThan(first.window.height)
      expect(first.goes, `${String(width)} ${theme}: Take me there is drawn`).toBeGreaterThan(0)
      expect(first.nots, `${String(width)} ${theme}: Not now is drawn`).toBeGreaterThan(0)
      for (const maker of ['.px-lead-go', '.px-lead-not']) {
        const box = await page.locator(maker).first().boundingBox()
        expect(box, `${String(width)} ${theme}: ${maker} has a box`).not.toBeNull()
        expect(box!.width, `${String(width)} ${theme}: ${maker} is inside the window sideways`).toBeGreaterThan(0)
        expect(box!.x, `${String(width)} ${theme}: ${maker} starts inside the window`).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width, `${String(width)} ${theme}: ${maker} ends inside the window`).toBeLessThanOrEqual(first.window.width + 0.5)
        expect(box!.y, `${String(width)} ${theme}: ${maker} starts inside the window`).toBeGreaterThanOrEqual(0)
        expect(box!.y + box!.height, `${String(width)} ${theme}: ${maker} ends inside the window`).toBeLessThanOrEqual(first.window.height + 0.5)
      }

      const half = Math.floor((await page.evaluate(() => document.getElementById('main')!.scrollHeight)) / 2)
      await putThePageAt(page, half)
      await expect.poll(() => whereThePageIs(page)).toBeGreaterThan(0)
      const middle = await theShape(page)
      expect(middle.band.top, `${String(width)} ${theme}: the band stays at the foot while the page moves`).toBeCloseTo(first.band.top, 0)
      expect(middle.page.bottom, `${String(width)} ${theme}: the page's box still ends above the band's top`).toBeLessThanOrEqual(middle.band.top + 0.5)

      await toTheEndOfThePage(page)
      const end = await theShape(page)
      expect(end.pageTop, `${String(width)} ${theme}: the page reached its foot`).toBeGreaterThan(0)
      expect(end.band.top, `${String(width)} ${theme}: the band is still at the foot`).toBeCloseTo(first.band.top, 0)
      expect(end.page.bottom, `${String(width)} ${theme}: the page's box still ends above the band's top`).toBeLessThanOrEqual(end.band.top + 0.5)
      expect(end.scroller, `${String(width)} ${theme}: the page scrolls in a box`).not.toBe('the window')

      await page.setViewportSize({ width: width === 390 ? 660 : 390, height: 900 })
      await page.waitForTimeout(300)
      const resized = await theShape(page)
      expect(resized.pageTop, `${String(width)} ${theme}: a resize threw the page back to the top`).toBeGreaterThan(0)

      await page.locator('.px-lead-not').first().click()
      await page.locator('.px-lead-here').waitFor({ state: 'detached', timeout: 20_000 })
      const afterClose = await whereThePageIs(page)
      expect(afterClose, `${String(width)} ${theme}: closing the band threw the page back to the top`).toBeGreaterThan(0)
    } finally {
      await markRead(lead)
      await context.close()
    }
  }, 180_000)
}
