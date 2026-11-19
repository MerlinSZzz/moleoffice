// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PDF OPENED IN A REPORT IS FITTED TO THE FRAME'S WIDTH AT EVERY WIDTH.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A report's PDF was drawn in the report's own frame, but the reader opened it at 100 per cent.
 * On a telephone the page was wider than the frame, so a person saw one piece of it and had to
 * pinch to read the rest. The owner asked for the frame to open the document in the viewer's own
 * fit-width view at every width.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS MEASURES, AND IN WHICH BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The full Chromium Playwright installs as channel "chromium". The default headless shell draws
 * no PDF at all: the frame never navigates and no page appears. If that browser is missing or will
 * not start, this file fails and says so; it does not skip, because a skip would report a PDF that
 * nobody had looked at.
 *
 * THE PAGE ITSELF SAYS WHERE ITS EDGES ARE. The made-up document is one white page with a red
 * stripe down its left edge and a blue stripe down its right edge, and a red block in the middle
 * that carries PAGE 1 in white. A viewport picture is cut to the frame's own box, and the columns
 * that hold the two edge stripes are counted. That gives the page's drawn width, from its left
 * edge to its right edge, without reading anything out of the viewer's shadow root.
 *
 * The reader also opens its thumbnail panel beside the page, and its fit-width view fits the page
 * to what is left after that panel, not to the frame. The panel's edge is found as a one-pixel
 * separator in the same picture; when it is there, the page does not fill the frame and the test
 * says the panel is open rather than dividing by the smaller area. With the panel closed, a fitted
 * page fills the frame's width; a page at 100 per cent fills only its own 816 pixels and leaves the
 * rest empty, and a page wider than the frame loses its right stripe. So the two claims are measured
 * separately:
 *
 *   1. the frame asks for the fit-width view with the panel closed, and
 *   2. the page's drawn width is at least 95 per cent of the whole frame's width and no wider than
 *      the frame, at 1440, 990, 660 and 390.
 *
 * The test opens the report again at each width rather than resizing one open frame, because the
 * claim is about what a person sees when a PDF is opened at that width.
 *
 * WHAT IS REAL HERE: the office, the upload door, the file door with its PDF policy, the built
 * report page and Chromium's own PDF reader. The document and the report are made up for this
 * test, and the office is a throwaway.
 *
 * WITH PDF_FIT_SHOTS SET, the report is photographed at the four widths in light and dark with the
 * made-up label as a strip along the window's top edge, outside the report's own blocks.
 */

import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright'
import sharp from 'sharp'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { join } from 'node:path'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { THE_PDF_FIT_WIDTH_VIEW } from '../src/web/components/SummaryBlocks.tsx'
import { freshDb, openRecordPagesAt, theBuiltPage, waitForThePage, type TestDb } from './helpers.ts'
import { putTheMadeUpLabelIn, takeTheMadeUpLabelOut } from './the-made-up-label-above-the-page.ts'
import { testShots } from './where-shots-go.ts'

const HERE = 'default'
const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The page's own width and height, in points, as the made-up file states them. */
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
/** The page's edges, in the PDF's own coordinates: a red stripe and a blue stripe, 30 points wide. */
const EDGE = 30
/** How much of the whole frame the drawn page must fill. A page at 100 per cent in the report's 1164px
 * frame is 816px wide, 70 per cent of the frame, and a page fitted behind the thumbnail panel filled
 * 73 per cent at 1440 and 67 per cent at 990, measured on 18 November 2026. With the panel closed the
 * fitted page filled 97 to 98 per cent, so 95 per cent separates the old drawing from the fitted one
 * by its picture and not only by its address. */
const FITTED_AT_LEAST = 0.95
const WIDTHS = [1440, 990, 660, 390] as const
const THEMES = ['light', 'dark'] as const
const THE_LABEL = 'Made-up data: a test office, and a made-up PDF in a made-up report.'

/**
 * ONE PAGE WHOSE EDGES ARE A RED STRIPE AND A BLUE STRIPE, with a red block in the middle that says
 * PAGE 1 in white. The stripes are what the picture measures; the block is what a reader sees.
 */
function theMadeUpPdf(): Buffer {
  const objects: string[] = []
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(PAGE_WIDTH)} ${String(PAGE_HEIGHT)}] ` +
      '/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  )
  const stream =
    `q 1 1 1 rg 0 0 ${String(PAGE_WIDTH)} ${String(PAGE_HEIGHT)} re f Q ` +
    `q 0.85 0.15 0.15 rg 0 0 ${String(EDGE)} ${String(PAGE_HEIGHT)} re f Q ` +
    `q 0.15 0.2 0.85 rg ${String(PAGE_WIDTH - EDGE)} 0 ${String(EDGE)} ${String(PAGE_HEIGHT)} re f Q ` +
    'q 0.85 0.15 0.15 rg 156 300 300 200 re f Q ' +
    'BT /F1 48 Tf 1 1 1 rg 206 380 Td (PAGE 1) Tj ET'
  objects.push(`<< /Length ${String(Buffer.byteLength(stream, 'latin1'))} >>\nstream\n${stream}\nendstream`)
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offsets: number[] = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${String(index + 1)} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`
  for (let index = 1; index <= objects.length; index++) {
    out += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  out += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

const PDF = theMadeUpPdf()
const SHOTS = process.env['PDF_FIT_SHOTS'] === undefined ? null : testShots('a-pdf-opens-fitted')

let database: TestDb
let office: FastifyInstance
let origin = ''
let report = ''
let browser: Browser
let context: BrowserContext
let page: Page

async function post(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers: OWNER, body: JSON.stringify(body) })
  expect(response.status, await response.clone().text()).toBeGreaterThanOrEqual(200)
  expect(response.status).toBeLessThan(300)
  return response.json()
}

beforeAll(async () => {
  expect(PDF.includes(Buffer.from(`/MediaBox [0 0 ${String(PAGE_WIDTH)} ${String(PAGE_HEIGHT)}]`))).toBe(true)
  expect(PDF.includes(Buffer.from('PAGE 1'))).toBe(true)

  database = await freshDb()
  const webDir = await theBuiltPage()
  try {
    browser = await chromium.launch({ headless: true, channel: 'chromium' })
  } catch (error) {
    throw new Error(
      'This PDF test needs the full Chromium that Playwright installs as channel "chromium"; the ' +
        'default headless shell draws no PDF in a frame. It was missing or would not start, so the ' +
        `PDF was not looked at. The browser said: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const { buildApp } = await import('../src/server/index.ts')
  office = (await buildApp({ production: true, webDir, webAppUrl: 'http://localhost:5173', logLevel: false })).app
  await office.listen({ port: 0, host: '127.0.0.1' })
  const address = office.server.address()
  if (address === null || typeof address === 'string') throw new Error('The made-up office did not listen')
  origin = `http://127.0.0.1:${String(address.port)}`
  const owner = (await (await fetch(`${origin}/api/office/owner`)).json()) as { named: boolean }
  if (!owner.named) await post('/api/office/owner', { name: 'Made-up reader', language: 'en' })

  const uploaded = await fetch(`${origin}/api/report-files`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({ bytes: PDF.toString('base64'), name: 'made-up-one-page.pdf' }),
  })
  expect(uploaded.status, await uploaded.clone().text()).toBe(201)
  const file = ((await uploaded.json()) as { file: { path: string; name: string; size: number; hash: string } }).file
  report = (
    await post('/api/records', {
      kind: 'report',
      title: 'A made-up report carrying a made-up PDF',
      summary: 'A made-up one-page PDF the report carries, opened fitted to the frame at every width.',
      data: {
        for: 'The PDF fit test',
        date: '2026-11-18',
        blocks: [{ id: 'pdf', type: 'file', ...file, caption: 'A made-up PDF with a red left edge and a blue right edge.' }],
      },
    })
  ).record.id

  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await openRecordPagesAt(context, 'full')
  page = await context.newPage()
}, 300_000)

afterAll(async () => {
  await context?.close()
  await browser?.close()
  await office?.close()
  database?.close()
}, 60_000)

interface Fit {
  frameWidth: number
  pageLeft: number
  pageRight: number
  pageWidth: number
  ratio: number
}

/**
 * THE ONE-PIXEL SEPARATOR AFTER THE VIEWER'S THUMBNAIL PANEL, found as a mid-grey column with dark
 * columns on both sides. No separator means the panel is closed (or the compact telephone viewer
 * hides it), and the page area is the whole frame.
 */
function pageAreaStart(data: Buffer, width: number, height: number, channels: number, y: number): number {
  const grey = (x: number): number => {
    const at = (y * width + x) * channels
    return ((data[at] ?? 0) + (data[at + 1] ?? 0) + (data[at + 2] ?? 0)) / 3
  }
  for (let x = 10; x < width - 10; x++) {
    const at = grey(x)
    if (at < 60 || at > 180) continue
    if (grey(x - 1) < 70 && grey(x + 1) < 70 && grey(x + 2) < 70) return x
  }
  return 0
}

/** THE PAGE'S DRAWN WIDTH INSIDE THE FRAME, FROM THE TWO EDGE STRIPES IN A PICTURE OF THE VIEWPORT. */
async function theFit(frame: Locator): Promise<Fit> {
  const box = await frame.boundingBox()
  if (box === null) throw new Error('The PDF frame has no place on the page to measure')
  const whole = await page.screenshot({ animations: 'disabled' })
  const viewport = page.viewportSize() ?? { width: 1440, height: 1000 }
  const left = Math.max(0, Math.round(box.x))
  const top = Math.max(0, Math.round(box.y))
  const width = Math.max(1, Math.min(Math.round(box.width), viewport.width - left))
  const height = Math.max(1, Math.min(Math.round(box.height), viewport.height - top))
  const cut = await sharp(whole)
    .extract({ left, top, width, height })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // THE THUMBNAIL PANEL HOLDS A LITTLE COPY OF THE PAGE, WITH THE SAME TWO EDGE STRIPES. A page
  // measured against the whole frame with that copy in it would read the copy as the page's left
  // edge. The panel is therefore a failure in its own right: the page cannot fill the frame while
  // the panel holds part of it.
  const areaStart = pageAreaStart(cut.data, cut.info.width, cut.info.height, cut.info.channels, Math.round(cut.info.height / 2))
  if (areaStart !== 0) {
    throw new Error(
      `the viewer's thumbnail panel is open, ending ${String(areaStart)}px into a ${String(cut.info.width)}px frame, so the page does not fill the frame's width`,
    )
  }
  const rows: number[] = []
  for (let y = 90; y < cut.info.height - 10; y += 2) rows.push(y)
  const red = new Map<number, number>()
  const blue = new Map<number, number>()
  for (const y of rows) {
    for (let x = 0; x < cut.info.width; x++) {
      const at = (y * cut.info.width + x) * cut.info.channels
      const r = cut.data[at] ?? 0
      const g = cut.data[at + 1] ?? 0
      const b = cut.data[at + 2] ?? 0
      if (r > 150 && g < 120 && b < 120) red.set(x, (red.get(x) ?? 0) + 1)
      else if (b > 150 && r < 120 && g < 120) blue.set(x, (blue.get(x) ?? 0) + 1)
    }
  }
  const enough = Math.max(3, Math.round(rows.length * 0.2))
  const redColumns = [...red.entries()].filter(([, count]) => count >= enough).map(([x]) => x)
  const blueColumns = [...blue.entries()].filter(([, count]) => count >= enough).map(([x]) => x)
  if (redColumns.length === 0) throw new Error('the PDF page has no red left edge in the frame, so no page was drawn')
  if (blueColumns.length === 0) throw new Error('the PDF page has no blue right edge in the frame, so its page is wider than the frame')

  const pageLeft = Math.min(...redColumns)
  const pageRight = Math.max(...blueColumns)
  return {
    frameWidth: cut.info.width,
    pageLeft,
    pageRight,
    pageWidth: pageRight - pageLeft,
    ratio: (pageRight - pageLeft) / cut.info.width,
  }
}

/**
 * Wait until the viewer's own frame has reported that it is at the file, then let it draw and
 * settle. The reader draws the page at 100 per cent first and applies the fragment after that, so a
 * page that has appeared is not yet the page a person is left with; the width is read until two
 * reads half a second apart agree.
 */
async function waitForTheReader(): Promise<void> {
  await expect
    .poll(() => page.frames().some((candidate) => candidate.url().includes(`${origin}/api/file?`)), { timeout: 30_000 })
    .toBe(true)
  const frame = page.locator('.sb-file-frame')
  let last = -1
  for (let turn = 0; turn < 60; turn++) {
    try {
      const fit = await theFit(frame)
      if (fit.pageWidth > 0 && fit.pageWidth === last) return
      last = fit.pageWidth
    } catch (error) {
      if (error instanceof Error && error.message.includes('thumbnail panel is open')) throw error
    }
    await page.waitForTimeout(500)
  }
  throw new Error('the PDF reader never settled on a page width')
}

/** Open the report at this width and press the block's show press. */
async function openThePdfAt(width: number): Promise<void> {
  await page.setViewportSize({ width, height: 1000 })
  // A GOTO TO THE ADDRESS ALREADY OPEN IS NOT A NAVIGATION. The second width would keep the first
  // width's report with its frame already shown, its press gone and its page drawn at the old size.
  await page.goto('about:blank')
  await page.goto(`${origin}/#${recordPath(report)}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  const press = page.locator('.sb-file-show')
  await press.waitFor({ timeout: 20_000 })
  await press.click()
  const frame = page.locator('.sb-file-frame')
  await frame.waitFor({ state: 'visible', timeout: 20_000 })
  await frame.scrollIntoViewIfNeeded()
  await waitForTheReader()
}

it('opens the PDF in the fit-width view, with the page filling the frame at 1440, 990, 660 and 390', async () => {
  for (const width of WIDTHS) {
    await openThePdfAt(width)
    const frame = page.locator('.sb-file-frame')
    const source = await frame.getAttribute('src')
    expect(source, `at ${String(width)}px the frame asked for ${String(source)}`).not.toBeNull()
    expect(new URL(source ?? '', origin).hash, `at ${String(width)}px the frame did not ask for the fit-width view`).toBe(
      THE_PDF_FIT_WIDTH_VIEW,
    )
    expect(source ?? '').toContain('open=1&shown=1')
    expect(await frame.getAttribute('sandbox')).toBeNull()

    const sideways = await page.evaluate(() => ({
      drawn: document.scrollingElement?.scrollWidth ?? 0,
      window: window.innerWidth,
    }))
    expect(sideways.drawn, `at ${String(width)}px the page is drawn ${String(sideways.drawn)} wide in a ${String(sideways.window)}px window`).toBeLessThanOrEqual(sideways.window)

    const fit = await theFit(frame)
    expect(
      fit.pageWidth,
      `at ${String(width)}px the page is drawn ${String(fit.pageWidth)} wide inside a frame ${String(fit.frameWidth)} wide`,
    ).toBeLessThanOrEqual(fit.frameWidth + 1)
    expect(
      fit.ratio,
      `at ${String(width)}px the page fills ${String(Math.round(fit.ratio * 100))}% of the whole ${String(fit.frameWidth)}px frame (page ${String(fit.pageWidth)}px)`,
    ).toBeGreaterThanOrEqual(FITTED_AT_LEAST)
    console.log(`PDF fit at ${String(width)}px: page ${String(fit.pageWidth)}px in the whole ${String(fit.frameWidth)}px frame, ${String(Math.round(fit.ratio * 100))}%`)
  }
}, 300_000)

it('has a picture at each width and theme, with the made-up label as a strip outside the page', async () => {
  if (SHOTS === null) return
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      await openThePdfAt(width)
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)
      const frame = page.locator('.sb-file-frame')
      await putTheMadeUpLabelIn(page, THE_LABEL, frame, `the PDF in a report at ${String(width)}, ${theme}`, {
        stripOutsideThePage: true,
      })
      await page.mouse.move(0, 0)
      await page.screenshot({ path: join(SHOTS, `pdf-fitted-${String(width)}-${theme}.png`) })
      await takeTheMadeUpLabelOut(page)
    }
  }
}, 300_000)
