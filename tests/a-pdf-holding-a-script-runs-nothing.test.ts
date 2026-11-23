// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PDF HOLDING A SCRIPT RUNS NOTHING WHEN THE OFFICE DRAWS IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The office's page draws a PDF itself, in the page that holds the office's own powers. A PDF can carry
 * scripts and form fields, and a reader that ran them would run a stranger's code beside the office. So
 * the office opens a document with no scripting, no forms, and `isEvalSupported` false.
 *
 * This test makes a one-page PDF whose script would write a mark: it asks a small server this test runs
 * for an address, in five ways a PDF script can, and sets the window's name and the page's title. The
 * script is the document's open action, its named script, its page's open action, a text field's
 * keystroke, format and focus actions, and a link's action. The test drives the built page in Chromium:
 *
 *   1. One press on the report's PDF block draws the page and its words, so the document was read.
 *   2. The server was never asked for anything, no dialog opened, and the window's name and the page's
 *      title are not the mark.
 *   3. The box holds no field a person could type in or press, and no layer of annotations.
 *   4. A click on the link and on the field does nothing: the mark is still not written, the office's
 *      page is still the report, and no other page opened.
 *   5. The office asked the PDF reader's worker to open the document with `isEvalSupported` false and
 *      `enableXfa` false, read off the message the page sent the worker.
 *
 * On the code before the office drew a PDF itself, the PDF is a frame of the browser's own reader,
 * which draws no page this test can read, so this test fails at step 1.
 */

import { createServer, type Server } from 'node:http'
import type { Locator } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { aPdfOf, aStreamOf, wordsOnAPage } from './a-made-up-pdf.ts'

const HERE = 'default'
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The words the page writes, so the test knows the document was drawn. */
const THE_WORDS = 'Petrel-quarry-7401'
/** What the script writes into the window's name and the page's title if it ever runs. */
const THE_MARK = 'a-made-up-pdf-script-ran'
/** The page's size in points, and where the link and the field sit on it, in the PDF's own coordinates. */
const PAGE = { width: 612, height: 792 }
const LINK = { left: 72, bottom: 400, right: 300, top: 430 }
const FIELD = { left: 72, bottom: 500, right: 300, top: 530 }

/** The script, which tries every way this test knows for a PDF script to reach the server or the page. */
function theScript(markAddress: string): string {
  return [
    `var mark = "${markAddress}";`,
    'try { app.alert("A made-up script ran."); } catch (e) {}',
    'try { app.launchURL(mark + "?by=launchURL", true); } catch (e) {}',
    'try { this.submitForm({ cURL: mark + "?by=submitForm" }); } catch (e) {}',
    'try { this.getURL(mark + "?by=getURL"); } catch (e) {}',
    'try { if (typeof fetch === "function") fetch(mark + "?by=fetch"); } catch (e) {}',
    `try { if (typeof window === "object") window.name = "${THE_MARK}"; } catch (e) {}`,
    `try { if (typeof document === "object") document.title = "${THE_MARK}"; } catch (e) {}`,
  ].join('\n')
}

/** A rectangle in the PDF's coordinates, as a PDF writes it. */
function rect(place: { left: number; bottom: number; right: number; top: number }): string {
  return `[${String(place.left)} ${String(place.bottom)} ${String(place.right)} ${String(place.top)}]`
}

/**
 * THE MADE-UP PDF. Object 7 is the script's action, and every place a PDF can run a script names it.
 */
function thePdfWithAScript(markAddress: string): Buffer {
  return aPdfOf([
    '<< /Type /Catalog /Pages 2 0 R /OpenAction 7 0 R /Names << /JavaScript << /Names [(made-up) 7 0 R] >> >> ' +
      '/AcroForm << /Fields [8 0 R] /NeedAppearances true /DA (/Helv 12 Tf 0 g) >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(PAGE.width)} ${String(PAGE.height)}] /Contents 4 0 R ` +
      '/Resources << /Font << /F1 5 0 R >> >> /Annots [8 0 R 9 0 R] /AA << /O 7 0 R >> >>',
    aStreamOf(wordsOnAPage(THE_WORDS)),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    aStreamOf(theScript(markAddress)),
    '<< /Type /Action /S /JavaScript /JS 6 0 R >>',
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (made-up-field) /V (made-up value) /Rect ${rect(FIELD)} /P 3 0 R /F 4 ` +
      '/DA (/Helv 12 Tf 0 g) /AA << /K 7 0 R /F 7 0 R /Fo 7 0 R /PO 7 0 R >> >>',
    `<< /Type /Annot /Subtype /Link /Rect ${rect(LINK)} /Border [0 0 0] /A 7 0 R >>`,
  ])
}

type Uploaded = { path: string; name: string; size: number; hash: string }

let app: LiveApp
let report: string
let pdf: Uploaded
let marks: Server | null = null
/** Every address the mark server was asked for. */
const asked: string[] = []
/** Every dialog the page opened. */
const dialogs: string[] = []

beforeAll(async () => {
  marks = createServer((request, reply) => {
    asked.push(request.url ?? '')
    reply.writeHead(204, { 'access-control-allow-origin': '*' })
    reply.end()
  })
  const server = marks
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('The mark server did not listen')
  const markAddress = `http://127.0.0.1:${String(address.port)}/the-script-ran`
  const bytes = thePdfWithAScript(markAddress)
  expect(bytes.includes(Buffer.from('/S /JavaScript'))).toBe(true)
  expect(bytes.includes(Buffer.from(markAddress))).toBe(true)

  app = await liveApp({ name: 'a-pdf-holding-a-script', opensAt: 'full', viewport: { width: 1440, height: 1000 } })
  app.page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })
  // THE MESSAGE THAT OPENS A DOCUMENT IN THE PDF READER'S WORKER, read as the page sends it. Only the two
  // settings this test is about are kept.
  await app.page.addInitScript(() => {
    const seen: { isEvalSupported: unknown; enableXfa: unknown }[] = []
    Object.defineProperty(window, '__theOpeningsAskedOfAPdfWorker', { value: seen })
    const send = Worker.prototype.postMessage as (this: Worker, ...args: unknown[]) => void
    Worker.prototype.postMessage = function (this: Worker, message: unknown, ...rest: unknown[]): void {
      const opening = message as { action?: unknown; data?: { enableXfa?: unknown; evaluatorOptions?: { isEvalSupported?: unknown } } } | null
      if (opening !== null && typeof opening === 'object' && opening.action === 'GetDocRequest') {
        seen.push({ isEvalSupported: opening.data?.evaluatorOptions?.isEvalSupported, enableXfa: opening.data?.enableXfa })
      }
      send.call(this, message, ...rest)
    } as typeof Worker.prototype.postMessage
  })

  const uploaded = await fetch(`${app.api}/api/report-files`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ bytes: bytes.toString('base64'), name: 'made-up-with-a-script.pdf' }),
  })
  expect(uploaded.status, await uploaded.clone().text()).toBe(201)
  pdf = ((await uploaded.json()) as { file: Uploaded }).file

  const created = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report carrying a PDF that holds a script',
      summary: 'A made-up PDF whose script would write a mark, drawn by the office with nothing run.',
      data: {
        for: 'The PDF script test',
        date: '2026-11-22',
        blocks: [{ id: 'pdf', type: 'file', ...pdf, caption: 'A made-up PDF holding a script.' }],
      },
    }),
  })
  expect(created.status, await created.clone().text()).toBe(201)
  report = ((await created.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
  const server = marks
  if (server !== null) await new Promise<void>((resolve) => server.close(() => resolve()))
}, 60_000)

/** That the script has written its mark nowhere this test can read. */
async function expectNoMark(when: string): Promise<void> {
  const page = await app.page.evaluate(() => ({ name: window.name, title: document.title }))
  expect(asked, `${when}: the mark server was asked for nothing`).toEqual([])
  expect(dialogs, `${when}: no dialog opened`).toEqual([])
  expect(page.name, `${when}: the window's name is not the mark`).not.toBe(THE_MARK)
  expect(page.title, `${when}: the page's title is not the mark`).not.toBe(THE_MARK)
}

/** Click the middle of a rectangle of the PDF's page, as the canvas shows it. */
async function clickOn(canvas: Locator, place: { left: number; bottom: number; right: number; top: number }): Promise<void> {
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  if (box === null) throw new Error('The PDF page has no place on the page to click on')
  const scale = box.width / PAGE.width
  await app.page.mouse.click(
    box.x + ((place.left + place.right) / 2) * scale,
    box.y + (PAGE.height - (place.bottom + place.top) / 2) * scale,
  )
}

it('draws a PDF holding a script and runs none of it, with no live field and no eval in the worker', async () => {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/#${recordPath(report)}`)
  await waitForThePage(app.page, 60_000)
  const pagesBefore = app.page.context().pages().length

  const figure = app.page.locator('.sb-file').filter({ has: app.page.locator('.sb-file-name', { hasText: pdf.name }) })
  await figure.locator('.sb-file-show').click()
  const box = figure.locator('.sb-file-frame')
  await box.waitFor({ timeout: 20_000 })
  const page = box.locator('[data-shown-page="1"]')
  await page.waitFor({ timeout: 20_000 })
  await expect.poll(async () => (await page.textContent()) ?? '', { timeout: 30_000 }).toContain(THE_WORDS)
  // A SCRIPT THAT RAN AT OPENING HAS HAD ITS TIME. The words are drawn after the document is read.
  await app.page.waitForTimeout(1_500)

  await expectNoMark('when the PDF was drawn')

  expect(await box.locator('input, textarea, select, button, [contenteditable]').count(), 'the box holds no live field').toBe(0)
  expect(await box.locator('.annotationLayer, a[href]').count(), 'the box holds no layer of annotations and no link').toBe(0)
  expect(await app.page.locator('iframe').count(), 'the PDF is drawn by the office page, not in a frame').toBe(0)

  const canvas = page.locator('canvas')
  await clickOn(canvas, LINK)
  await clickOn(canvas, FIELD)
  await app.page.waitForTimeout(1_000)
  await expectNoMark('after a click on the link and on the field')
  expect(new URL(app.page.url()).hash, 'the office page is still the report').toBe(`#${recordPath(report)}`)
  expect(app.page.context().pages().length, 'no other page opened').toBe(pagesBefore)

  const openings = await app.page.evaluate(
    () => (window as unknown as { __theOpeningsAskedOfAPdfWorker?: unknown[] }).__theOpeningsAskedOfAPdfWorker ?? [],
  )
  expect(openings.length, "the page sent the PDF reader's worker no message opening a document").toBeGreaterThan(0)
  expect(openings.every((one) => JSON.stringify(one) === JSON.stringify({ isEvalSupported: false, enableXfa: false })), JSON.stringify(openings)).toBe(true)
}, 180_000)
