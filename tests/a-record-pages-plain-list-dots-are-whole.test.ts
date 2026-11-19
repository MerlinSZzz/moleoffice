// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLAIN LIST'S DOTS ARE DRAWN WHOLE, INSIDE THE RECORD PAGE'S CONTENT.
 *
 * The fault: on a record page, every plain list of stored values (`ul.rd-list`) sits inside a
 * body fold (`details.rd-fold`), and the fold's own content box is clipped while it opens
 * (`details.rd-fold::details-content { overflow: clip }`, src/web/styles.css). Chromium draws the
 * outside disc marker in the space before an item's words. At 14px type that space is 17px, and
 * `.rd-list` kept only `var(--pad-lg)` — 14px at the default density — so a dot's left 3px fell
 * outside the list's box into the fold's clip and were cut at the page content's left edge. The
 * reports' first reading walked ancestor ELEMENTS and found no clipping box; the clip is on a
 * pseudo-element box, which is why it was missed.
 *
 * WHY THE CHECK IS PIXELS. A dot is not an element: the browser draws a `::marker` box and offers
 * no geometry for it. Nor can a walk of the element ancestors see the `::details-content` box that
 * clips it. So this file reads what the browser actually drew: it shoots the list and its left
 * margin as drawn, lifts the fold's clip, shoots the same rectangle again, and asks that not one
 * pixel changed. On the cut, the lift reveals the dot's missing left pixels. It then finds each
 * item's leftmost ink and asks that it starts inside the page content rather than flush with its
 * edge. A dot drawn whole and inside the page changes no pixel when the clip is lifted.
 *
 * THE PIXEL READ MUST NOT FLICKER. Both shots are taken after the page has drawn, with the fonts
 * loaded and the fold's opening animation finished, so the same code draws the same pixels twice.
 *
 * MADE-UP RECORD: one problem filed in this test's own office, with a two-place `seen_in` list,
 * whose title says it is made up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import sharp from 'sharp'
import { createI18n } from '../src/shared/i18n.ts'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/** The page's words come from the word lists, never copied here. */
const SAYS = createI18n('en')

/** Room kept left of the list in both shots, so a dot hanging past the list is in the picture. */
const AROUND = 20

/** How far into the page content the dot's leftmost ink must start, in pixels. */
const INSIDE = 1

let app: LiveApp
let db: TestDb
let problemId = ''

beforeAll(async () => {
  db = await freshDb()
  problemId = db.api.createRecord({
    kind: 'problem',
    title: 'A made-up problem seen in two made-up places',
    workspaceId: 'default',
    actor: db.api.HUMAN,
    data: { symptom: 'A made-up symptom.', seen_in: ['Made-up first place', 'Made-up second place'] },
  }).id
  app = await liveApp({ name: 'plain-list-dots', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.context.addInitScript(
    ({ person }) => {
      localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
      localStorage.setItem('mole-office.preset.theme', 'light')
    },
    { person: THE_TEST_OFFICES_OWNER.id },
  )
}, 240_000)

afterAll(async () => {
  await app?.stop()
  db?.close()
}, 120_000)

/** Open the made-up problem and the fold holding its two-place Seen in list. */
async function openTheList(page: Page): Promise<void> {
  await page.goto(`${app.site}/?lang=en&look=light#/r/${problemId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('article.rp').waitFor({ timeout: 30_000 })
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  const fold = page.locator('article.rp details.rd-fold-body', {
    has: page.locator(':scope > summary', { hasText: SAYS.t('record.section.seen_in') }),
  })
  expect(await fold.count(), 'the page drew more than one fold headed with the Seen in word').toBe(1)
  await fold.locator(':scope > summary').click()
  await fold.locator('ul.rd-list').waitFor({ timeout: 10_000 })
  // The fold's opening is an animation; shoot only once it has finished.
  await page.waitForTimeout(400)
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
  })
}

type Geometry = {
  contentLeft: number
  list: { left: number; top: number; width: number; height: number }
  rows: { top: number; bottom: number }[]
}

/** The page content's left edge, the list's box, and each item's box, in viewport pixels. */
async function theListGeometry(page: Page): Promise<Geometry> {
  const list = page.locator('article.rp details.rd-fold-body ul.rd-list')
  await list.scrollIntoViewIfNeeded()
  const geometry = await list.evaluate((element) => {
    const article = element.closest('article.rp')
    if (article === null) throw new Error('the list is not on a record page')
    const box = element.getBoundingClientRect()
    return {
      contentLeft: article.getBoundingClientRect().left,
      list: { left: box.left, top: box.top, width: box.width, height: box.height },
      rows: [...element.querySelectorAll(':scope > li')].map((item) => {
        const row = item.getBoundingClientRect()
        return { top: row.top, bottom: row.bottom }
      }),
    }
  })
  expect(geometry.rows.length, 'the made-up list drew no items').toBe(2)
  return geometry
}

/** The rectangle both shots read: the list plus room to its left. Kept inside the window. */
function theRectangle(geometry: Geometry): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.max(0, Math.floor(geometry.list.left - AROUND)),
    y: Math.max(0, Math.floor(geometry.list.top - 6)),
    width: Math.ceil(geometry.list.width + AROUND * 2),
    height: Math.ceil(geometry.list.height + 12),
  }
}

/** A shot's RGBA pixels, for reading what the browser drew. */
async function itsPixels(shot: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(shot).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** How many pixels two shots of the same rectangle disagree about. */
function differingPixels(one: { data: Buffer; width: number; height: number }, other: { data: Buffer; width: number; height: number }): number {
  if (one.width !== other.width || one.height !== other.height) {
    throw new Error(`the two shots are different sizes: ${String(one.width)}x${String(one.height)} and ${String(other.width)}x${String(other.height)}`)
  }
  let differing = 0
  for (let at = 0; at < one.data.length; at += 4) {
    if (one.data[at] !== other.data[at] || one.data[at + 1] !== other.data[at + 1] || one.data[at + 2] !== other.data[at + 2] || one.data[at + 3] !== other.data[at + 3]) differing += 1
  }
  return differing
}

describe('a record page’s plain list', () => {
  it('draws every item’s dot whole, inside the page content, and lifting the fold’s clip changes no pixel of it', async () => {
    const page = app.page
    await openTheList(page)
    const geometry = await theListGeometry(page)
    const rectangle = theRectangle(geometry)

    const asDrawn = await page.screenshot({ clip: rectangle })
    // THE CLIP THE DOT IS CUT BY. It sits on the fold's content box, which is a pseudo-element and
    // so cannot be found by walking the list's element ancestors. Lifting it changes no layout.
    const lift = await page.addStyleTag({ content: 'article.rp details.rd-fold::details-content { overflow: visible !important }' })
    await page.evaluate(async () => {
      await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
    })
    const withTheClipLifted = await page.screenshot({ clip: rectangle })
    await lift.evaluate((element) => {
      element.parentNode?.removeChild(element)
    })

    const drawn = await itsPixels(asDrawn)
    const lifted = await itsPixels(withTheClipLifted)
    const differing = differingPixels(drawn, lifted)
    expect(differing, 'the fold’s clip cuts pixels of the list: lifting it draws ink the page had hidden').toBe(0)

    // WHERE EACH DOT'S INK STOPS, read from the shot as drawn. The dot is the leftmost ink in the
    // band between the list's left edge and the start of its words; the background colour is read
    // from the page so the test holds in either theme.
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const channels = /(\d+)\D+(\d+)\D+(\d+)/u.exec(background)
    if (channels === null) throw new Error(`the page's background colour was not a colour: ${background}`)
    const [red, green, blue] = [Number(channels[1]), Number(channels[2]), Number(channels[3])]
    const contentLeftInTheShot = geometry.contentLeft - rectangle.x
    const starts: number[] = []
    for (const row of geometry.rows) {
      const top = Math.max(0, Math.round(row.top - rectangle.y) + 2)
      const bottom = Math.min(drawn.height, Math.round(row.bottom - rectangle.y) - 2)
      let leftmost: number | null = null
      for (let y = top; y < bottom; y++) {
        for (let x = Math.max(0, contentLeftInTheShot - 8); x < Math.min(drawn.width, contentLeftInTheShot + 12); x++) {
          const at = (y * drawn.width + x) * 4
          const ink = Math.max(Math.abs(drawn.data[at]! - red), Math.abs(drawn.data[at + 1]! - green), Math.abs(drawn.data[at + 2]! - blue))
          if (ink > 80 && (leftmost === null || x < leftmost)) leftmost = x
        }
      }
      if (leftmost === null) throw new Error('the shot holds no dot left of the list item’s words')
      starts.push(leftmost - contentLeftInTheShot)
    }
    expect(
      Math.min(...starts),
      `a dot starts at the page content’s left edge, where the fold’s clip can cut it (offsets: ${starts.join(', ')})`,
    ).toBeGreaterThan(INSIDE)
  }, 240_000)
})
