// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAIRED PAGE READS A SHOWN FILE WITH BOTH HALVES, AND THE PAGE FOR ONE FILE SAVES IT BY A TICKET (wave 13y, round
 * 175).
 *
 * A browser proves the person with two halves of one device key: a cookie half the browser keeps, and a header half
 * the page keeps and sends on its own calls. One half alone proves nothing. At home the office refuses a request that
 * carries one half and names somebody, with 401 (src/server/lib/keyheader.ts). A report reads a shown file's words
 * and a PDF's bytes by a fetch of its own, so that fetch must carry both halves at home. A link the browser follows
 * itself carries the cookie half alone, so the Save link on the office's page for one file goes by a ticket, as a
 * report's own Save does. tests/a-ticketed-load-asks-again-once.test.ts pins the report's Save; this file pins the two
 * readers and the page for one file.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, IN A REAL BROWSER PAIRED AS THE PERSON
 * ---------------------------------------------------------------------------------------
 *
 *   1. one press of Show on a text file's block asks the file door for its words, and that request carries the header
 *      half the pairing gave; the words are drawn;
 *   2. one press of Show on a PDF's block asks the file door for its bytes with open=1&shown=1, and that request
 *      carries the same half; the PDF's first page is drawn with its words;
 *   3. on the office's page for the text file, the Save link's own address is the record's page and names no file
 *      address, and a press on it asks the ticket door for that file and that record, and saves the file's bytes;
 *   4. in a context that keeps no half, the page for the text file asks for its words with no header half, and its
 *      Save link is the file door's plain address with download, as it was before pairing.
 *
 * A TEST WORLD DOES NOT REFUSE ONE HALF, so each case reads the header its request carries, and not only what came
 * back. The office here is started with neither of the two settings that make a test world.
 *
 * On the code before the two readers carried both halves, cases 1 and 2 fail at the header, and the office refuses
 * each read with 401. On the code before the page for one file saved by a ticket, case 3 fails at the Save link's
 * address. Case 4 passes on both, because a page that keeps no half reads and saves as it always has.
 *
 * THE FILES ARE MADE HERE: a text file of one line and a PDF of one page, sent to the test office's own store of
 * report files, which goes when the office stops. The header half is compared by equality, and no half and no ticket
 * is printed.
 */

import { readFileSync } from 'node:fs'
import type { Page, Request } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEVICE_HALF_HEADER } from '../src/config/key-header.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath, shownFilePath } from '../src/web/components/router.tsx'
import { aPdfOf, aStreamOf, wordsOnAPage } from './a-made-up-pdf.ts'
import { pairTheContext, type APairedContext } from './a-paired-context.ts'
import { liveApp, openRecordPagesAt, waitForThePage, type LiveApp } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The words each file holds, which no other page or fixture has any reason to hold. */
const TEXT_WORDS = 'Shearwater-ledger-8401'
const PDF_WORDS = 'Shearwater-ledger-8402'

/** A text file of one line. */
const THE_TEXT = Buffer.from(`${TEXT_WORDS} is a made-up line of a made-up text file.\n`, 'utf8')

/** One Letter-size page that writes its words in Helvetica. */
const THE_PDF = aPdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  aStreamOf(wordsOnAPage(PDF_WORDS)),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
])

type Uploaded = { path: string; name: string; size: number; hash: string }

let app: LiveApp
let paired: APairedContext
let report = ''
let textFile: Uploaded
let pdf: Uploaded

/** The page's own fetch of the file door for this path, asking these as well, such as words=1. */
function theReadOf(path: string, asked: Record<string, string>): (request: Request) => boolean {
  return (request) => {
    if (request.method() !== 'GET' || request.resourceType() !== 'fetch') return false
    const url = new URL(request.url())
    if (url.pathname !== '/api/file' || url.searchParams.get('path') !== path) return false
    return Object.entries(asked).every(([name, value]) => url.searchParams.get(name) === value)
  }
}

/** The path and the record a ticket ask names, read from the page's own request. */
function theTicketAsked(request: Request): { path: unknown; record: unknown } {
  try {
    const body = JSON.parse(request.postData() ?? '{}') as { path?: unknown; record?: unknown }
    return { path: body.path, record: body.record }
  } catch {
    return { path: undefined, record: undefined }
  }
}

async function open(page: Page, address: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** The figure of one file block, found by the name the block draws. */
function figureFor(name: string) {
  return app.page.locator('.sb-file').filter({ has: app.page.locator('.sb-file-name', { hasText: name }) })
}

beforeAll(async () => {
  expect(THE_PDF.includes(Buffer.from(PDF_WORDS))).toBe(true)
  app = await liveApp({ name: 'a-paired-page-reads-a-shown-file', opensAt: 'full', viewport: { width: 1440, height: 1000 } })

  async function upload(name: string, bytes: Buffer): Promise<Uploaded> {
    const answer = await fetch(`${app.api}/api/report-files`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ bytes: bytes.toString('base64'), name }),
    })
    expect(answer.status, await answer.clone().text()).toBe(201)
    return ((await answer.json()) as { file: Uploaded }).file
  }
  textFile = await upload('made-up-line.txt', THE_TEXT)
  pdf = await upload('made-up-page.pdf', THE_PDF)

  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report with a made-up text file and a made-up PDF',
      summary: 'A file block of a text file and one of a PDF. The test made both files.',
      data: {
        for: 'The test of a paired page reading a shown file',
        date: '2026-11-22',
        blocks: [
          { id: 'b-1', type: 'text', text: 'The two files below were made by the test. Neither is a real observation.' },
          { id: 'b-text', type: 'file', ...textFile, caption: 'A made-up text file.' },
          { id: 'b-pdf', type: 'file', ...pdf, caption: 'A made-up PDF of one page.' },
        ],
      },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  report = ((await filed.json()) as { record: { id: string } }).record.id

  // PAIRED AS THE PERSON, so the page keeps the header half and the browser the cookie half.
  paired = await pairTheContext(app.context, app.api)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a paired page reads a shown file with both halves', () => {
  it("1: sends the header half on the request for a text file's words, and draws the words", async () => {
    await open(app.page, recordPath(report))
    const figure = figureFor(textFile.name)
    await figure.locator('.sb-file-show').waitFor({ timeout: 30_000 })
    const reading = app.page.waitForRequest(theReadOf(textFile.path, { words: '1' }), { timeout: 30_000 })
    await figure.locator('.sb-file-show').click()
    const headers = await (await reading).allHeaders()
    expect(headers[DEVICE_HALF_HEADER] === paired.headerHalf, 'the words request carries the header half the pairing gave').toBe(true)
    const reader = figure.locator('.sb-file-words')
    await reader.waitFor({ timeout: 20_000 })
    await expect.poll(async () => reader.innerText(), { timeout: 20_000 }).toContain(TEXT_WORDS)
  }, 180_000)

  it("2: sends the header half on the request for a PDF's bytes, and draws its first page", async () => {
    await open(app.page, recordPath(report))
    const figure = figureFor(pdf.name)
    await figure.locator('.sb-file-show').waitFor({ timeout: 30_000 })
    const reading = app.page.waitForRequest(theReadOf(pdf.path, { open: '1', shown: '1' }), { timeout: 30_000 })
    await figure.locator('.sb-file-show').click()
    const headers = await (await reading).allHeaders()
    expect(headers[DEVICE_HALF_HEADER] === paired.headerHalf, 'the PDF request carries the header half the pairing gave').toBe(true)
    const first = figure.locator('[data-shown-page="1"]')
    await first.waitFor({ timeout: 30_000 })
    await expect.poll(async () => (await first.textContent()) ?? '', { timeout: 30_000 }).toContain(PDF_WORDS)
  }, 180_000)

  it("3: links the file page's Save to the record's page, and a press asks a ticket for that file and record", async () => {
    await open(app.page, shownFilePath(report, textFile.path))
    const save = app.page.locator('a.sb-file-save')
    await save.waitFor({ timeout: 30_000 })
    const href = (await save.getAttribute('href')) ?? ''
    expect(href, 'the Save link holds a file address').not.toContain('/api/file')
    expect(href, 'the Save link holds a ticket').not.toContain('ticket')
    expect(new URL(href, app.page.url()).hash, "the Save link leads to the record's page").toBe(`#${recordPath(report)}`)

    const asking = app.page.waitForRequest(
      (request) => {
        if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/file/ticket') return false
        const asked = theTicketAsked(request)
        return asked.path === textFile.path && asked.record === report
      },
      { timeout: 30_000 },
    )
    const saving = app.page.waitForEvent('download', { timeout: 30_000 })
    await save.click()
    const [, saved] = await Promise.all([asking, saving])
    expect(readFileSync(await saved.path()).equals(THE_TEXT), "the saved bytes are not the text file's").toBe(true)
  }, 120_000)

  it('4: in a context that keeps no half, reads the words with no header half and saves by the plain address', async () => {
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
    try {
      // THE SAME READING LEVEL AS THE PAIRED CONTEXT, so the only difference between the two is the pairing.
      await openRecordPagesAt(context, 'full')
      const page = await context.newPage()
      const reading = page.waitForRequest(theReadOf(textFile.path, { words: '1' }), { timeout: 60_000 })
      await open(page, shownFilePath(report, textFile.path))
      const headers = await (await reading).allHeaders()
      expect(DEVICE_HALF_HEADER in headers, 'the words request of a page that keeps no half carries a header half').toBe(false)
      const reader = page.locator('.sb-file-words')
      await reader.waitFor({ timeout: 20_000 })
      await expect.poll(async () => reader.innerText(), { timeout: 20_000 }).toContain(TEXT_WORDS)

      const save = page.locator('a.sb-file-save')
      await save.waitFor({ timeout: 30_000 })
      expect(await save.getAttribute('download'), 'the Save link saves').not.toBeNull()
      const address = new URL((await save.getAttribute('href')) ?? '', page.url())
      expect(address.pathname, 'the Save link is the file door').toBe('/api/file')
      expect(address.searchParams.get('path'), 'the Save link names the file').toBe(textFile.path)
      expect(address.searchParams.get('record'), 'the Save link names the record').toBe(report)
      expect(address.searchParams.get('download'), 'the Save link asks for a save').toBe('1')
      expect(address.searchParams.has('ticket'), 'the Save link holds a ticket').toBe(false)
    } finally {
      await context.close()
    }
  }, 180_000)
})
