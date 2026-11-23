// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PDF ATTACHED TO A REPORT IS READ INSIDE THE REPORT ON ONE PRESS, EVERY PAGE, WITHOUT DOWNLOADING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The made-up PDF has three pages and says so in its own bytes.
 *   2. Before the press the report draws the file's facts and one press, and no box. The file's
 *      body is not fetched for drawing before the press.
 *   3. One press draws the box, and the box holds no frame: the office's page draws the PDF itself.
 *      The page asks for the file with open=1&shown=1, and the reply carries default-src 'none';
 *      sandbox, so the same address opened on its own still runs nothing.
 *   4. The box holds three pages, one under another, each a canvas: page 1 red, page 2 green and
 *      page 3 blue. The colours are read out of each canvas, so they are what the page drew.
 *   5. A wheel over the box scrolls it to the last page: the count from the file and the last page
 *      in view together say every page is there.
 *   6. Nothing was downloaded, and the office's page still shows the report and the box.
 *   7. In a second case, the file door's answer is held back. While it is held, the box holds the
 *      office's own reading state, with the file's name, and no page. Once the answer goes on and
 *      page 1 is drawn, the reading state is gone.
 *
 * On the code before the office drew a PDF itself, the box was a frame of the browser's own PDF
 * reader, which holds no canvas this page can read, so this test fails at step 4. On the code
 * before the box drew a reading state, the box was empty while the answer was held, so the second
 * case fails at step 7.
 *
 * Only Chromium is driven here.
 */

import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { freshDb, openRecordPagesAt, storeNormalModeWhereNothingIsStored, theBuiltPage, type TestDb } from './helpers.ts'

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
 * A three-page PDF whose pages are solid red, green and blue with the page number in white, so the
 * colours read out of a page's canvas say which page it drew.
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
const answers: { method: string; path: string; open: string | null; shown: string | null; status: number; policy: string | null }[] = []

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
  browser = await chromium.launch({ headless: true })
  const { buildApp } = await import('../src/server/index.ts')
  office = (await buildApp({ production: true, webDir, webAppUrl: 'http://localhost:5173', logLevel: false })).app
  office.addHook('onResponse', async (request, reply) => {
    if (!request.url.startsWith('/api/file?')) return
    const url = new URL(request.url, 'http://test')
    answers.push({
      method: request.method,
      path: url.searchParams.get('path') ?? '',
      open: url.searchParams.get('open'),
      shown: url.searchParams.get('shown'),
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
  await storeNormalModeWhereNothingIsStored(context)
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
 * THE COLOURS EACH PAGE OF THE BOX DREW, read out of its canvas.
 *
 * Every sixty-fourth pixel of a page's canvas is counted. A page that has not been drawn yet counts
 * nothing, so a caller polls until the counts are there; reading one point would depend on where the
 * page's words happened to fall.
 */
async function pageColours(box: Locator): Promise<{ page: string | null; red: number; green: number; blue: number }[]> {
  return box.locator('[data-shown-page]').evaluateAll((pages) =>
    pages.map((element) => {
      const counts = { page: element.getAttribute('data-shown-page'), red: 0, green: 0, blue: 0 }
      const canvas = element.querySelector('canvas')
      const drawing = canvas?.getContext('2d') ?? null
      if (canvas === null || drawing === null || canvas.width === 0 || canvas.height === 0) return counts
      const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height).data
      for (let at = 0; at + 2 < pixels.length; at += 4 * 64) {
        const r = pixels[at] ?? 0
        const g = pixels[at + 1] ?? 0
        const b = pixels[at + 2] ?? 0
        if (r > 150 && g < 120 && b < 120) counts.red++
        else if (r < 120 && g > 150 && b < 120) counts.green++
        else if (r < 120 && g < 120 && b > 150) counts.blue++
      }
      return counts
    }),
  )
}

/** The colour a page's counts are mostly, or null when no colour has a thousand samples. */
function theColourOf(counts: { red: number; green: number; blue: number }): string | null {
  const each: [string, number][] = [['red', counts.red], ['green', counts.green], ['blue', counts.blue]]
  const [colour, count] = each.sort((one, other) => other[1] - one[1])[0] ?? ['', 0]
  return count > 1000 ? colour : null
}

it('draws the three pages inside the report on one press, in the office page itself, with the PDF policy on the reply', async () => {
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
  const box = page.locator('.sb-file-frame')
  await box.waitFor({ timeout: 20_000 })
  expect(await page.locator('.sb-file iframe').count(), 'the PDF is drawn by the office page, not in a frame').toBe(0)
  await box.scrollIntoViewIfNeeded()

  // EVERY PAGE IS DRAWN, EACH IN ITS OWN COLOUR. The file itself states the count.
  await expect
    .poll(async () => (await pageColours(box)).map((counts) => [counts.page, theColourOf(counts)]), { timeout: 30_000 })
    .toEqual([
      ['1', 'red'],
      ['2', 'green'],
      [String(PAGES), 'blue'],
    ])

  // THE PAGES ARE ONE UNDER ANOTHER, and a wheel over the box scrolls it to the last one.
  const places = await box.locator('[data-shown-page]').evaluateAll((pages) => pages.map((element) => element.getBoundingClientRect().top))
  expect(places.length).toBe(PAGES)
  expect(places.every((top, index) => index === 0 || top > (places[index - 1] ?? Infinity)), `the pages' tops were ${JSON.stringify(places)}`).toBe(true)
  const room = await box.evaluate((element) => ({ height: element.scrollHeight, shown: element.clientHeight }))
  expect(room.height, 'three pages do not fit in the box, so the box scrolls').toBeGreaterThan(room.shown)
  const where = await box.boundingBox()
  if (where === null) throw new Error('The PDF box has no place on the page to scroll over')
  await page.mouse.move(where.x + where.width / 2, where.y + Math.min(where.height / 2, 400))
  for (let turn = 0; turn < 40; turn++) {
    const scrolled = await box.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1)
    if (scrolled) break
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(100)
  }
  const last = await box.locator(`[data-shown-page="${String(PAGES)}"]`).boundingBox()
  const after = await box.boundingBox()
  if (last === null || after === null) throw new Error('The last page or the box has no place on the page')
  expect(last.y + last.height, 'the last page ends inside the box once it is scrolled').toBeLessThanOrEqual(after.y + after.height + 1)
  expect(last.y + last.height).toBeGreaterThan(after.y)

  // THE PAGE ASKED FOR THE FILE WITH open=1&shown=1, AND THE REPLY CARRIES THE POLICY.
  const read = answers.filter((answer) => answer.path === pdfPath && answer.method === 'GET')
  expect(read.length).toBeGreaterThan(0)
  expect(read.every((answer) => answer.open === '1' && answer.shown === '1')).toBe(true)
  expect(read[read.length - 1]?.policy).toBe(THE_PDF_POLICY)
  expect(read.every((answer) => answer.status === 200 || answer.status === 206)).toBe(true)

  // THE OFFICE'S PAGE IS STILL THE REPORT, and nothing was downloaded.
  expect(new URL(page.url()).hash).toBe(`#${recordPath(report)}`)
  expect(await page.locator('.sb-file-name').innerText()).toBe('made-up-three-pages.pdf')
  expect(await page.locator('.sb-file-frame').count()).toBe(1)
}, 180_000)

it('draws the office reading state in the box while the PDF is on its way, and takes it away once a page is drawn', async () => {
  const waiting = await context.newPage()
  // THE FILE DOOR'S ANSWER FOR THE PDF'S BYTES IS HELD until the box has been read, so the box is read
  // at a moment when nothing of the PDF can have been drawn.
  let letItGo = (): void => {}
  const goesOn = new Promise<void>((resolve) => {
    letItGo = resolve
  })
  let held = 0
  await waiting.route(
    (url) => url.pathname === '/api/file' && url.searchParams.get('path') === pdfPath && url.searchParams.get('shown') === '1',
    async (route) => {
      if (route.request().method() === 'GET') {
        held++
        await goesOn
      }
      await route.continue()
    },
  )
  try {
    await waiting.goto(`${origin}/#${recordPath(report)}`, { timeout: 60_000 })
    await waiting.locator('.sb-file-show').waitFor({ timeout: 20_000 })
    await waiting.locator('.sb-file-show').click()
    const box = waiting.locator('.sb-file-frame')
    await box.waitFor({ timeout: 20_000 })
    await expect.poll(() => held, { timeout: 20_000 }).toBeGreaterThan(0)

    // WHILE THE ANSWER IS HELD, the box holds the office's own reading state, named by the file, and no page.
    const reading = box.locator('.px-loading[role="status"]')
    expect(await reading.count(), 'the box draws the office reading state while the PDF is on its way').toBe(1)
    expect(await reading.textContent()).toContain('made-up-three-pages.pdf')
    expect(await box.locator('[data-shown-page]').count()).toBe(0)

    // ONCE THE ANSWER GOES ON AND PAGE 1 IS DRAWN, the reading state is gone.
    letItGo()
    await box.locator('[data-shown-page="1"] canvas').waitFor({ timeout: 30_000 })
    await expect.poll(() => reading.count(), { timeout: 10_000 }).toBe(0)
  } finally {
    letItGo()
    await waiting.close()
  }
}, 120_000)
