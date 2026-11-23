// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS OF A PDF PAGE CAN BE SELECTED AND TALKED ABOUT, IN A REPORT AND ON THE PAGE FOR THE FILE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The owner wants to select words in a PDF shown in the office and talk with an agent about them. A
 * PDF used to be drawn in a frame of the browser's own reader, and the office's right-click could not
 * reach its words. Now the office's page draws each page of the PDF itself, with its words laid over
 * the drawing as the page's own text.
 *
 * This test puts a made-up report carrying a made-up two-page PDF in a real office and drives the
 * built page in Chromium:
 *
 *   1. One press on the report's PDF block draws both pages in the report, with no frame, and each
 *      page holds its own words.
 *   2. The words on page 2 can be selected with a drag of the mouse, as a person selects them.
 *   3. Words selected on page 2 and right-clicked open the office's right-click about those words.
 *      The chip names the file and page 2, and quotes the words. Words on page 1 give page 1.
 *   4. The block's Open press leads to the office's page for that one file. That page draws the same
 *      two pages, with no frame, and the same drag and right-click name the file and page 2 there.
 *   5. A comment written about page 2's words and kept is stored with a quote place that holds the
 *      words, the file's name and page 2, so what an agent is handed names the file and the page.
 *
 * On the code before the office drew a PDF itself, the PDF is a frame of the browser's own reader,
 * which holds no words this page can select, and the block has no Open press, so this test fails at
 * step 1. On the code before a quote place held a file and a page, the comment is stored with the
 * words alone, so the last case fails at step 5.
 *
 * The chip's sentence is read from the word list, never copied into the test.
 */

import type { Locator } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { recordPath, shownFilePath } from '../src/web/components/router.tsx'
import { keepTheCommentInAReview, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import type { Context } from '../src/shared/targets.ts'
import { aPdfOf, aStreamOf, wordsOnAPage } from './a-made-up-pdf.ts'

const HERE = 'default'
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The words each page writes, which no other page or fixture has any reason to hold. */
const PAGE_ONE_WORDS = 'Kittiwake-ledger-6201'
const PAGE_TWO_WORDS = 'Kittiwake-ledger-6202'
/** The part of page 2's words a drag inside them is sure to cover, whatever a pixel at either end does. */
const INSIDE_PAGE_TWO_WORDS = 'ledger'

/** Two Letter-size pages, each writing its own words in Helvetica. */
const THE_PDF = aPdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
  aStreamOf(wordsOnAPage(PAGE_ONE_WORDS)),
  aStreamOf(wordsOnAPage(PAGE_TWO_WORDS)),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
])

type Uploaded = { path: string; name: string; size: number; hash: string }

let app: LiveApp
let report: string
let pdf: Uploaded

beforeAll(async () => {
  expect(THE_PDF.includes(Buffer.from('/Count 2'))).toBe(true)
  expect(THE_PDF.includes(Buffer.from(PAGE_TWO_WORDS))).toBe(true)

  app = await liveApp({ name: 'the-words-of-a-pdf-page', opensAt: 'full', viewport: { width: 1440, height: 1000 } })

  const uploaded = await fetch(`${app.api}/api/report-files`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ bytes: THE_PDF.toString('base64'), name: 'made-up-two-pages.pdf' }),
  })
  expect(uploaded.status, await uploaded.clone().text()).toBe(201)
  pdf = ((await uploaded.json()) as { file: Uploaded }).file

  const created = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report carrying a two-page PDF',
      summary: 'A made-up two-page PDF the report draws inside itself, whose words can be selected.',
      data: {
        for: 'The PDF words test',
        date: '2026-11-22',
        blocks: [{ id: 'pdf', type: 'file', ...pdf, caption: 'A made-up PDF with words on each of its two pages.' }],
      },
    }),
  })
  expect(created.status, await created.clone().text()).toBe(201)
  report = ((await created.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openThe(address: string): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/#${address}`)
  await waitForThePage(app.page, 60_000)
}

/** One page of the drawn PDF, by its number from 1, inside this part of the office's page. */
function thePage(within: Locator, number: number): Locator {
  return within.locator(`[data-shown-page="${String(number)}"]`)
}

/** Wait until a drawn page holds its own words. */
async function theWordsAreDrawn(page: Locator, words: string): Promise<void> {
  await page.waitFor({ timeout: 20_000 })
  await expect.poll(async () => (await page.textContent()) ?? '', { timeout: 30_000 }).toContain(words)
}

/**
 * DRAG THE MOUSE ACROSS THE WORDS, AS A PERSON SELECTS THEM, AND READ WHAT THE BROWSER SELECTED. The drag
 * starts and ends a pixel inside the words, so it stays on them.
 */
async function dragAcross(within: Locator, words: string): Promise<string> {
  const element = within.getByText(words, { exact: false }).first()
  await element.waitFor({ timeout: 15_000 })
  await element.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const box = await element.boundingBox()
  if (box === null) throw new Error(`the words ${words} have no place on the page to drag across`)
  const y = box.y + box.height / 2
  await app.page.mouse.move(box.x + 1, y)
  await app.page.mouse.down()
  await app.page.mouse.move(box.x + box.width - 1, y, { steps: 8 })
  await app.page.mouse.up()
  const selected = await app.page.evaluate(() => window.getSelection()?.toString() ?? '')
  await app.page.evaluate(() => window.getSelection()?.removeAllRanges())
  return selected
}

/**
 * SELECT THE WORDS OF ONE ELEMENT AND RIGHT-CLICK ON THEM, and give back the box that opens. The selection is one
 * range over exactly the words, so the quote can be compared whole, and the right-click lands in the middle of them.
 */
async function openTheBoxAbout(within: Locator, words: string): Promise<Locator> {
  const element = within.getByText(words, { exact: false }).first()
  await element.waitFor({ timeout: 15_000 })
  await element.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const at = await element.evaluate((el, wanted) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode() as Text | null
    while (node !== null && !(node.textContent ?? '').includes(wanted)) node = walker.nextNode() as Text | null
    if (node === null) throw new Error(`no text node holds ${wanted}`)
    const start = (node.textContent ?? '').indexOf(wanted)
    const range = document.createRange()
    range.setStart(node, start)
    range.setEnd(node, start + wanted.length)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    const box = range.getClientRects()[0]
    if (box === undefined) throw new Error('the words have no box')
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, words)
  await app.page.mouse.click(at.x, at.y, { button: 'right' })
  const composer = app.page.locator('.px-talk[data-target="uiSurface/composer"]')
  await composer.waitFor({ timeout: 20_000 })
  return composer
}

/** Right-click the words as `openTheBoxAbout` does, read the chip, and close the box again. */
async function rightClickTheWords(within: Locator, words: string): Promise<{ kind: string; what: string }> {
  const composer = await openTheBoxAbout(within, words)
  const kind = (await composer.locator('.px-talk-chip-kind').textContent({ timeout: 10_000 })) ?? ''
  const what = (await composer.locator('.px-talk-chip-what').textContent({ timeout: 10_000 })) ?? ''
  await app.page.keyboard.press('Escape')
  await composer.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  return { kind, what }
}

/** What the chip says for words on this page of the made-up file. */
function theChipFor(page: number): string {
  return sayInEnglish('chatPoint.wordsOfAFilePage', { name: pdf.name, page })
}

it("lets a PDF page's words in a report be selected, and its right-click names the file and the page", async () => {
  await openThe(recordPath(report))
  const figure = app.page.locator('.sb-file').filter({ has: app.page.locator('.sb-file-name', { hasText: pdf.name }) })
  await figure.locator('.sb-file-show').click()
  const box = figure.locator('.sb-file-frame')
  await box.waitFor({ timeout: 20_000 })
  expect(await app.page.locator('iframe').count(), 'the PDF is drawn by the office page, not in a frame').toBe(0)

  await theWordsAreDrawn(thePage(box, 1), PAGE_ONE_WORDS)
  await theWordsAreDrawn(thePage(box, 2), PAGE_TWO_WORDS)
  expect(await thePage(box, 1).textContent()).not.toContain(PAGE_TWO_WORDS)

  expect(await dragAcross(thePage(box, 2), PAGE_TWO_WORDS), 'a drag across the words of page 2 selects them').toContain(
    INSIDE_PAGE_TWO_WORDS,
  )

  const second = await rightClickTheWords(thePage(box, 2), PAGE_TWO_WORDS)
  expect(second.kind, 'the chip names the file and page 2').toBe(theChipFor(2))
  expect(second.what, 'the chip quotes the words').toBe(`“${PAGE_TWO_WORDS}”`)

  const first = await rightClickTheWords(thePage(box, 1), PAGE_ONE_WORDS)
  expect(first.kind, 'the chip names the file and page 1').toBe(theChipFor(1))
  expect(first.what).toBe(`“${PAGE_ONE_WORDS}”`)
}, 180_000)

it("draws a PDF opened as a file on the office's page for it, where page 2's words are selected and named the same way", async () => {
  await openThe(recordPath(report))
  const figure = app.page.locator('.sb-file').filter({ has: app.page.locator('.sb-file-name', { hasText: pdf.name }) })
  await figure.locator('.sb-file-show').waitFor({ timeout: 15_000 })
  const open = figure.locator('.sb-file-open')
  expect(await open.count(), 'the PDF block has an Open press').toBe(1)
  expect(await open.getAttribute('href')).toBe(`#${shownFilePath(report, pdf.path)}`)
  await open.click()
  await expect.poll(() => new URL(app.page.url()).hash, { timeout: 15_000 }).toBe(`#${shownFilePath(report, pdf.path)}`)
  await waitForThePage(app.page, 60_000)

  const main = app.page.locator('main')
  expect(await main.locator('h1').innerText()).toBe(pdf.name)
  await theWordsAreDrawn(thePage(main, 1), PAGE_ONE_WORDS)
  await theWordsAreDrawn(thePage(main, 2), PAGE_TWO_WORDS)
  expect(await app.page.locator('iframe').count(), 'the PDF is drawn by the office page, not in a frame').toBe(0)
  expect(await app.page.locator('.sb-file-save').getAttribute('href')).toContain('download=1')

  expect(await dragAcross(thePage(main, 2), PAGE_TWO_WORDS), 'a drag across the words of page 2 selects them').toContain(
    INSIDE_PAGE_TWO_WORDS,
  )
  const chip = await rightClickTheWords(thePage(main, 2), PAGE_TWO_WORDS)
  expect(chip.kind, 'the chip on the page for the file names the file and page 2').toBe(theChipFor(2))
  expect(chip.what, 'the chip on the page for the file quotes the words').toBe(`“${PAGE_TWO_WORDS}”`)
}, 180_000)

it("keeps a comment about page 2's words with the file's name and page 2 in its quote", async () => {
  await openThe(recordPath(report))
  const figure = app.page.locator('.sb-file').filter({ has: app.page.locator('.sb-file-name', { hasText: pdf.name }) })
  await figure.locator('.sb-file-show').click()
  const box = figure.locator('.sb-file-frame')
  await theWordsAreDrawn(thePage(box, 2), PAGE_TWO_WORDS)

  const composer = await openTheBoxAbout(thePage(box, 2), PAGE_TWO_WORDS)
  const words = 'A made-up comment: which ledger is this?'
  await composer.locator('textarea').first().fill(words)
  await keepTheCommentInAReview(app.page)
  await app.page.waitForSelector('.px-talk-said', { timeout: 15_000 })

  const reply = await fetch(`${app.api}/api/messages/comments`, { headers: HEADERS })
  expect(reply.status, await reply.clone().text()).toBe(200)
  const comments = ((await reply.json()) as {
    comments?: { kind: string; data?: { body?: string; context?: Context; target?: Context } }[]
  }).comments ?? []
  const kept = comments.find((row) => row.data?.body === words)
  expect(kept, 'the comment about the words of page 2 was not kept').toBeDefined()
  const context = kept?.kind === 'annotation' ? kept.data?.context : kept?.data?.target
  expect(context?.place, "the quote holds the words, the file's name and the page").toEqual({
    at: 'quote',
    words: PAGE_TWO_WORDS,
    file: pdf.name,
    page: 2,
  })
}, 180_000)
