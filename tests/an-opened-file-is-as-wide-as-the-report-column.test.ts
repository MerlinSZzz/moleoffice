// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OPENED FILE IS AS WIDE AS THE REPORT'S READING COLUMN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * A file attached to a report was drawn in a frame only as wide as its card, about 300 to 340
 * pixels at every window width, so at 1440 a page was drawn narrow beside an empty column. The
 * decision says an opened file is as wide as the report's own reading column, and the whole width
 * of the window on a telephone.
 *
 * This test puts a made-up report carrying an HTML file in a real office, opens the report, presses
 * the block's show press and reads the frame's edges against the edges of the report's reading
 * column at 1440, 990 and 660. At 390 it reads them against the window's own two edges, because on
 * a telephone the reading column is the window and the frame takes the page's padding as well.
 *
 * The tolerance is one CSS pixel. Both edges are read from the same drawn layout, so only the
 * rounding of a subpixel box can move an edge, and it moves it by less than a pixel.
 *
 * HTML is the kind of file used because the existing HTML attachment test proves it draws in the
 * Chromium this test runs in; a PDF is proved only in full Chromium.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { recordPath } from '../src/web/components/router.tsx'
import { liveApp, theResizeIsDrawn, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const HERE = 'default'
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The page the report carries. Its words are not the subject; its drawing is. */
const THE_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>A made-up page</title>
<style>body { margin: 0; padding: 24px; background: #f2eadb; color: #2c2118; font: 20px/1.5 Georgia, serif; }</style>
</head>
<body><p>Marram-ostrich-9901</p></body>
</html>
`

interface Edges {
  readonly left: number
  readonly right: number
}

interface Boxes {
  readonly frame: Edges
  readonly column: Edges
  readonly window: Edges
}

let app: LiveApp
let report: string

beforeAll(async () => {
  app = await liveApp({
    name: 'an-opened-file-is-as-wide-as-the-report-column',
    opensAt: 'full',
    viewport: { width: 1440, height: 1000 },
  })

  const uploaded = await fetch(`${app.api}/api/report-files`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ bytes: Buffer.from(THE_PAGE, 'utf8').toString('base64'), name: 'made-up-page.html' }),
  })
  expect(uploaded.status, await uploaded.clone().text()).toBe(201)
  const file = ((await uploaded.json()) as { file: { path: string; name: string; size: number; hash: string } }).file

  const created = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      kind: 'report',
      title: 'A made-up report carrying an HTML file',
      summary: 'A made-up page the report carries, drawn inside the report on one press.',
      data: {
        for: 'The opened file width test',
        date: '2026-11-18',
        blocks: [{ id: 'page', type: 'file', ...file, caption: 'A made-up page.' }],
      },
    }),
  })
  expect(created.status, await created.clone().text()).toBe(201)
  report = ((await created.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The frame, the reading column that holds it, and the window, in whole drawn pixels. */
async function theBoxes(): Promise<Boxes> {
  return app.page.evaluate(() => {
    const whole = (n: number): number => Math.round(n)
    const frame = document.querySelector('.sb-file-frame')
    const figure = document.querySelector('.sb-file')
    const column = figure?.closest('.sb-reads') ?? null
    if (frame === null || figure === null || column === null) {
      throw new Error('The report did not draw the frame, the file figure and the reading column.')
    }
    const edges = (element: Element): { left: number; right: number } => {
      const box = element.getBoundingClientRect()
      return { left: whole(box.left), right: whole(box.right) }
    }
    return {
      frame: edges(frame),
      column: edges(column),
      window: { left: 0, right: whole(window.innerWidth) },
    }
  })
}

function theGap(one: Edges, other: Edges): number {
  return Math.max(Math.abs(one.left - other.left), Math.abs(one.right - other.right))
}

/** How far the page is drawn past the window, which the frame's negative margins could cause. */
async function theSidewaysOverflow(): Promise<{ drawn: number; window: number }> {
  return app.page.evaluate(() => ({
    drawn: document.scrollingElement?.scrollWidth ?? 0,
    window: window.innerWidth,
  }))
}

async function expectNoSidewaysScroll(width: number): Promise<void> {
  const sideways = await theSidewaysOverflow()
  expect(
    sideways.drawn,
    `at ${String(width)}px the page is drawn ${String(sideways.drawn)} wide in a ${String(sideways.window)}px window`,
  ).toBeLessThanOrEqual(sideways.window)
}

it('draws the opened file as wide as the reading column, and as the window on a telephone', async () => {
  await app.page.goto(`${app.site}/#${recordPath(report)}`)
  await waitForThePage(app.page, 60_000)

  const press = app.page.locator('.sb-file-show')
  await press.waitFor({ timeout: 15_000 })
  await press.click()
  await app.page.locator('.sb-file-frame').waitFor({ state: 'visible', timeout: 15_000 })

  for (const width of [1440, 990, 660]) {
    await app.page.setViewportSize({ width, height: 1000 })
    await theResizeIsDrawn(app.page)
    await expectNoSidewaysScroll(width)
    const boxes = await theBoxes()
    expect(
      theGap(boxes.frame, boxes.column),
      `at ${String(width)}px the frame is ${String(boxes.frame.left)}..${String(boxes.frame.right)} ` +
        `and the reading column is ${String(boxes.column.left)}..${String(boxes.column.right)}`,
    ).toBeLessThanOrEqual(1)
  }

  await app.page.setViewportSize({ width: 390, height: 1000 })
  await theResizeIsDrawn(app.page)
  await expectNoSidewaysScroll(390)
  const telephone = await theBoxes()
  expect(
    theGap(telephone.frame, telephone.window),
    `at 390px the frame is ${String(telephone.frame.left)}..${String(telephone.frame.right)} ` +
      `and the window is ${String(telephone.window.left)}..${String(telephone.window.right)}`,
  ).toBeLessThanOrEqual(1)
}, 120_000)
