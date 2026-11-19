// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PDF ATTACHED TO A REPORT IS READ INSIDE THE REPORT ON ONE PRESS, EVERY PAGE, WITHOUT DOWNLOADING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TEST LAUNCHES ITS OWN BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The Chromium Playwright starts by default is its headless shell, and it does not draw a PDF in a
 * frame at all: the frame never navigates to the PDF and no PDF frame appears. The full Chromium
 * that Playwright installs as channel "chromium" does draw it, with the PDF reader's own frame and
 * page controls, so this test launches that browser by name. If that browser is missing or does
 * not start, this test fails and says so; it does not skip, because a skip would report a PDF that
 * nobody had looked at. The real built page is still the page driven, and the real office and file
 * door are still the ones serving the file.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The made-up PDF has three pages and says so in its own bytes.
 *   2. Before the press the report draws the file's facts and one press, and no frame. The file's
 *      body is not fetched for drawing before the press.
 *   3. One press draws a frame with no sandbox attribute, asking for the file with open=1&shown=1. The
 *      reply carries default-src 'none'; sandbox and still says nosniff.
 *   4. The frame draws page 1 (red). A wheel scroll over the frame reaches the last page, page 3
 *      (blue): the count from the file and the last page drawn together say every page is there.
 *   5. Nothing was downloaded, and the office's page still shows the report and the frame.
 *
 * Only Chromium is measured here. Firefox and Safari use their own PDF readers, and nobody in this
 * office has looked at this frame in either of them.
 */

import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright'
import sharp from 'sharp'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { freshDb, openRecordPagesAt, theBuiltPage, type TestDb } from './helpers.ts'

const HERE = 'default'
const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** What a PDF reply carries when the page asks to show it. Written out, not read from the door. */
const THE_PDF_POLICY = "default-src 'none'; sandbox"
/** The page count the made-up file itself states. */
const PAGES = 3

/**
 * A three-page PDF whose pages are solid red, green and blue with the page number in white, so a
 * screenshot can say which page is drawn without reading anything out of a plugin's shadow DOM.
 */
function theThreePagePdf(): Buffer {
  const objects: string[] = []
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push(`<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count ${String(PAGES)} >>`)
  const colours = [
    [0.85, 0.2, 0.2],
    [0.2, 0.7, 0.2],
    [0.2, 0.3, 0.85],
  ] as const
  // ALL THE PAGES FIRST, THEN ALL THEIR STREAMS. A page at object 3+i names content 6+i, which is
  // only true if the six objects are pushed in that order; pushing a stream beside its page would
  // make page one point at page two's green stream, and this test would then read the wrong page.
  const pages: string[] = []
  const streams: string[] = []
  for (let index = 0; index < PAGES; index++) {
    const colour = colours[index]!
    pages.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${String(6 + index)} 0 R ` +
        '/Resources << /Font << /F1 9 0 R >> >> >>',
    )
    const stream =
      `q ${String(colour[0])} ${String(colour[1])} ${String(colour[2])} rg 0 0 612 792 re f Q ` +
      `BT /F1 84 Tf 1 1 1 rg 180 380 Td (PAGE ${String(index + 1)}) Tj ET`
    streams.push(`<< /Length ${String(Buffer.byteLength(stream, 'latin1'))} >>\nstream\n${stream}\nendstream`)
  }
  objects.push(...pages, ...streams)
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

const PDF = theThreePagePdf()

let database: TestDb
let office: FastifyInstance
let origin = ''
let report = ''
let pdfPath = ''
let browser: Browser
let context: BrowserContext
let page: Page
const answers: { method: string; path: string; status: number; policy: string | null }[] = []

async function post(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers: OWNER, body: JSON.stringify(body) })
  expect(response.status, await response.clone().text()).toBeGreaterThanOrEqual(200)
  expect(response.status).toBeLessThan(300)
  return response.json()
}

beforeAll(async () => {
  expect(PDF.includes(Buffer.from(`/Count ${String(PAGES)}`))).toBe(true)
  expect(PDF.includes(Buffer.from('PAGE 3'))).toBe(true)

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
  office.addHook('onResponse', async (request, reply) => {
    if (!request.url.startsWith('/api/file?')) return
    const url = new URL(request.url, 'http://test')
    answers.push({
      method: request.method,
      path: url.searchParams.get('path') ?? '',
      status: reply.statusCode,
      policy: reply.getHeader('content-security-policy') === undefined ? null : String(reply.getHeader('content-security-policy')),
    })
  })
  await office.listen({ port: 0, host: '127.0.0.1' })
  const address = office.server.address()
  if (address === null || typeof address === 'string') throw new Error('The made-up office did not listen')
  origin = `http://127.0.0.1:${String(address.port)}`
  const owner = await (await fetch(`${origin}/api/office/owner`)).json() as { named: boolean }
  if (!owner.named) await post('/api/office/owner', { name: 'Made-up reader', language: 'en' })

  const uploaded = await fetch(`${origin}/api/report-files`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({ bytes: PDF.toString('base64'), name: 'made-up-three-pages.pdf' }),
  })
  expect(uploaded.status, await uploaded.clone().text()).toBe(201)
  const file = ((await uploaded.json()) as { file: { path: string; name: string; size: number; hash: string } }).file
  pdfPath = file.path
  report = (await post('/api/records', {
    kind: 'report',
    title: 'A report carrying a PDF',
    summary: 'A made-up three-page PDF the report carries, read inside the report on one press.',
    data: {
      for: 'The PDF attachment test',
      date: '2026-11-17',
      blocks: [{ id: 'pdf', type: 'file', ...file, caption: 'A made-up PDF with three coloured pages.' }],
    },
  })).record.id

  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  await openRecordPagesAt(context, 'full')
  page = await context.newPage()
}, 240_000)

afterAll(async () => {
  await context?.close()
  await browser?.close()
  await office?.close()
  database?.close()
}, 60_000)

/**
 * THE COLOURS THE VIEWPORT SHOWS WHERE THE FRAME IS.
 *
 * An element screenshot of the PDF iframe does not capture the PDF's plugin layer: it comes back
 * blank or the colour behind it. The browser's own viewport screenshot is composited, so the frame
 * is cut out of that at its place on the screen and every eighth pixel of the cut is counted. A
 * solid page of a colour reaches the count even when the page is only part of what is visible;
 * reading one point would depend on where its page happened to be scrolled.
 */
async function frameColours(frame: Locator): Promise<{ red: number; green: number; blue: number }> {
  const box = await frame.boundingBox()
  if (box === null) throw new Error('The PDF frame has no place on the page to read')
  const whole = await page.screenshot({ animations: 'disabled' })
  const viewport = page.viewportSize() ?? { width: 1440, height: 1000 }
  const left = Math.max(0, Math.round(box.x))
  const top = Math.max(0, Math.round(box.y))
  const cut = await sharp(whole).extract({
    left,
    top,
    width: Math.max(1, Math.min(Math.round(box.width), viewport.width - left)),
    height: Math.max(1, Math.min(Math.round(box.height), viewport.height - top)),
  }).raw().toBuffer({ resolveWithObject: true })
  let red = 0
  let green = 0
  let blue = 0
  for (let y = 0; y < cut.info.height; y += 8) {
    for (let x = 0; x < cut.info.width; x += 8) {
      const at = (y * cut.info.width + x) * cut.info.channels
      const r = cut.data[at] ?? 0
      const g = cut.data[at + 1] ?? 0
      const b = cut.data[at + 2] ?? 0
      if (r > 150 && g < 120 && b < 120) red++
      else if (r < 120 && g > 150 && b < 120) green++
      else if (r < 120 && g < 120 && b > 150) blue++
    }
  }
  return { red, green, blue }
}

it('draws the three pages inside the report on one press, with no sandbox attribute and the PDF policy', async () => {
  await page.goto(`${origin}/#${recordPath(report)}`, { timeout: 60_000 })
  await page.locator('.sb-file-name').waitFor({ timeout: 60_000 })
  expect(await page.locator('.sb-file-name').innerText()).toBe('made-up-three-pages.pdf')
  // THE PRESS APPEARS only after the page's HEAD has named the type. Give it ten seconds, then
  // count: on a build without the press this waits ten seconds and fails on the count below, so the
  // absence is the failure rather than a wait that never says what was missing.
  await page.locator('.sb-file-show').waitFor({ timeout: 10_000 }).catch(() => {})
  expect(await page.locator('.sb-file-show').count()).toBe(1)
  expect(await page.locator('.sb-file-frame').count()).toBe(0)
  expect(answers.filter((answer) => answer.path === pdfPath && answer.method !== 'HEAD')).toEqual([])

  await page.locator('.sb-file-show').click()
  const frame = page.locator('.sb-file-frame')
  await frame.waitFor({ timeout: 20_000 })
  expect(await frame.getAttribute('sandbox')).toBeNull()
  expect(await frame.getAttribute('src')).toContain('open=1&shown=1')
  await frame.scrollIntoViewIfNeeded()

  // THE PDF READER'S OWN FRAME, drawn by full Chromium. Nothing but a real reader produces it.
  await expect.poll(() => page.frames().some((candidate) => candidate.url().includes(`${origin}/api/file?`)), {
    timeout: 30_000,
  }).toBe(true)

  // EVERY PAGE IS DRAWN: page one at the top, then a wheel through the reader until page two's
  // green and page three's blue have both been seen. The file itself states the count.
  const box = await frame.boundingBox()
  if (box === null) throw new Error('The PDF frame has no place on the page to scroll over')
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 400))
  const seen = new Set<string>()
  let counts = { red: 0, green: 0, blue: 0 }
  // PAGE ONE FIRST, WITHOUT SCROLLING: a wheel sent before it is drawn would carry the test past
  // the page it is waiting for.
  for (let turn = 0; turn < 60 && counts.red <= 100; turn++) {
    counts = await frameColours(frame)
    if (counts.red <= 100) await page.waitForTimeout(500)
  }
  expect(counts.red, `page one was not drawn; the colours counted were ${JSON.stringify(counts)}`).toBeGreaterThan(100)
  seen.add('red')
  // THEN A WHEEL THROUGH THE READER until page two's green and page three's blue have both been seen.
  for (let turn = 0; turn < 24 && seen.size < 3; turn++) {
    await page.mouse.wheel(0, 500)
    await page.waitForTimeout(500)
    counts = await frameColours(frame)
    if (counts.green > 100) seen.add('green')
    if (counts.blue > 100) seen.add('blue')
  }
  expect([...seen].sort(), `the pages drawn were ${String(seen.size)}; the colours counted were ${JSON.stringify(counts)}`).toEqual(['blue', 'green', 'red'])

  // THE REPLY CARRIES THE POLICY, ON THE GET THE READER READ.
  const read = answers.filter((answer) => answer.path === pdfPath && answer.method === 'GET')
  expect(read.length).toBeGreaterThan(0)
  expect(read[read.length - 1]?.policy).toBe(THE_PDF_POLICY)
  expect(read.every((answer) => answer.status === 200 || answer.status === 206)).toBe(true)

  // THE OFFICE'S PAGE IS STILL THE REPORT, and nothing was downloaded.
  expect(new URL(page.url()).hash).toBe(`#${recordPath(report)}`)
  expect(await page.locator('.sb-file-name').innerText()).toBe('made-up-three-pages.pdf')
  expect(await page.locator('.sb-file-frame').count()).toBe(1)
}, 180_000)
