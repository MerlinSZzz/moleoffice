// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PDF OPENED IN A REPORT IS FITTED TO THE BOX'S WIDTH AT EVERY WIDTH.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A report's PDF was drawn in the report's own box, but the reader opened it at 100 per cent.
 * On a telephone the page was wider than the box, so a person saw one piece of it and had to
 * pinch to read the rest. The owner asked for the document to open fitted to the box's width at
 * every width.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The office's page draws each page of a PDF into a canvas of its own, inside the box. So the
 * measures are read out of the page itself:
 *
 *   1. the box holds no frame, and it does not scroll sideways;
 *   2. the page's canvas is drawn as wide as the inside of the box, to within a pixel;
 *   3. the canvas holds the whole page: its first columns are the page's red left edge and its last
 *      columns the blue right edge, read out of the canvas's own pixels;
 *   4. the canvas is drawn at the size it is shown, so the page is not a smaller drawing stretched;
 *   5. the office's page does not scroll sideways either,
 *
 * at 1440 and 390. The test opens the report again at each width rather than resizing one open
 * box, because the claim is about what a person sees when a PDF is opened at that width.
 *
 * On the code before the office drew a PDF itself, the box was a frame of the browser's own PDF
 * reader, which holds no canvas this page can read, so this test fails at the first width.
 *
 * WHAT IS REAL HERE: the office, the upload door, the file door with its PDF policy, the built
 * report page and the office's own PDF drawing. The document and the report are made up for this
 * test, and the office is a throwaway.
 */

import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { freshDb, openRecordPagesAt, storeNormalModeWhereNothingIsStored, theBuiltPage, waitForThePage, type TestDb } from './helpers.ts'

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
const WIDTHS = [1440, 390] as const

/**
 * ONE PAGE WHOSE EDGES ARE A RED STRIPE AND A BLUE STRIPE, with a red block in the middle that says
 * PAGE 1 in white. The stripes are what the canvas is read for; the block is what a reader sees.
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
  browser = await chromium.launch({ headless: true })
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
      summary: 'A made-up one-page PDF the report carries, opened fitted to the box at every width.',
      data: {
        for: 'The PDF fit test',
        date: '2026-11-18',
        blocks: [{ id: 'pdf', type: 'file', ...file, caption: 'A made-up PDF with a red left edge and a blue right edge.' }],
      },
    })
  ).record.id

  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await storeNormalModeWhereNothingIsStored(context)
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
  /** The inside of the box: its width without its border or a scrollbar. */
  boxWidth: number
  /** How far the box's own contents reach sideways. */
  boxReach: number
  /** The page's canvas as it is shown. */
  pageWidth: number
  /** The canvas's own pixels across, and what that is in shown pixels at this screen's density. */
  drawnWidth: number
  shownInPixels: number
  /** Whether the canvas's first columns are the red edge and its last columns the blue edge. */
  redLeft: boolean
  blueRight: boolean
}

/** THE PAGE'S FIT IN THE BOX, read off the box and out of the first page's canvas. Null until a page has a canvas. */
async function theFit(box: Locator): Promise<Fit | null> {
  return box.evaluate((element) => {
    const canvas = element.querySelector('[data-shown-page] canvas')
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width < 8 || canvas.height < 8) return null
    const drawing = canvas.getContext('2d')
    if (drawing === null) return null
    const row = drawing.getImageData(0, Math.floor(canvas.height / 2), canvas.width, 1).data
    const isRed = (x: number): boolean => (row[x * 4] ?? 0) > 150 && (row[x * 4 + 1] ?? 0) < 120 && (row[x * 4 + 2] ?? 0) < 120
    const isBlue = (x: number): boolean => (row[x * 4] ?? 0) < 120 && (row[x * 4 + 1] ?? 0) < 120 && (row[x * 4 + 2] ?? 0) > 150
    return {
      boxWidth: element.clientWidth,
      boxReach: element.scrollWidth,
      pageWidth: canvas.getBoundingClientRect().width,
      drawnWidth: canvas.width,
      shownInPixels: Math.round(canvas.getBoundingClientRect().width * window.devicePixelRatio),
      redLeft: isRed(1) && isRed(2),
      blueRight: isBlue(canvas.width - 2) && isBlue(canvas.width - 3),
    }
  })
}

/** The fit once the page is drawn whole at the box's width, or the last fit read when it never is. */
async function theSettledFit(box: Locator, width: number): Promise<Fit> {
  let fit: Fit | null = null
  for (let turn = 0; turn < 60; turn++) {
    fit = await theFit(box)
    if (fit !== null && fit.redLeft && fit.blueRight && Math.abs(fit.drawnWidth - fit.shownInPixels) <= 2) return fit
    await page.waitForTimeout(500)
  }
  throw new Error(`at ${String(width)}px the PDF page was never drawn whole at the box's width; the last read was ${JSON.stringify(fit)}`)
}

/** Open the report at this width and press the block's show press. */
async function openThePdfAt(width: number): Promise<Locator> {
  await page.setViewportSize({ width, height: 1000 })
  // A GOTO TO THE ADDRESS ALREADY OPEN IS NOT A NAVIGATION. The second width would keep the first
  // width's report with its box already shown, its press gone and its page drawn at the old size.
  await page.goto('about:blank')
  await page.goto(`${origin}/#${recordPath(report)}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  const press = page.locator('.sb-file-show')
  await press.waitFor({ timeout: 20_000 })
  await press.click()
  const box = page.locator('.sb-file-frame')
  await box.waitFor({ state: 'visible', timeout: 20_000 })
  await box.scrollIntoViewIfNeeded()
  return box
}

it('draws the PDF page as wide as the box, whole and at its shown size, at 1440 and 390', async () => {
  for (const width of WIDTHS) {
    const box = await openThePdfAt(width)
    expect(await page.locator('.sb-file iframe').count(), `at ${String(width)}px the PDF is drawn by the office page, not in a frame`).toBe(0)

    const fit = await theSettledFit(box, width)
    expect(fit.boxReach, `at ${String(width)}px the box's contents reach ${String(fit.boxReach)}px in a ${String(fit.boxWidth)}px box`).toBeLessThanOrEqual(fit.boxWidth)
    expect(
      Math.abs(fit.pageWidth - fit.boxWidth),
      `at ${String(width)}px the page is drawn ${String(fit.pageWidth)} wide inside a box ${String(fit.boxWidth)} wide`,
    ).toBeLessThanOrEqual(1)

    const sideways = await page.evaluate(() => ({
      drawn: document.scrollingElement?.scrollWidth ?? 0,
      window: window.innerWidth,
    }))
    expect(sideways.drawn, `at ${String(width)}px the page is drawn ${String(sideways.drawn)} wide in a ${String(sideways.window)}px window`).toBeLessThanOrEqual(sideways.window)
    console.log(`PDF fit at ${String(width)}px: page ${String(fit.pageWidth)}px in a ${String(fit.boxWidth)}px box, ${String(fit.drawnWidth)} pixels drawn`)
  }
}, 300_000)
