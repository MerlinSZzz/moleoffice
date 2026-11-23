// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT EXPORTS AS A PDF. The Export press in a report's head offers two choices: an HTML file, then a PDF file.
 * The PDF choice makes the report into one HTML page for printing, sends that page to the office's PDF door, and hands
 * the browser the PDF the door answers. In the page it sends, a video is a picture of its first frame followed by its
 * name, and a sound and a file are their names alone.
 *
 * One made-up office serves the built page from its own origin. One made-up report holds a heading, a paragraph, a
 * video, a sound and a file. The person's media choice is on-press, so the video and the sound are held when the press
 * is made.
 *
 * THE DOOR'S ANSWER IS MADE UP BY THIS TEST. The door prints the page with a program that needs a window, and this
 * browser test cannot start one. So the test answers the page's request to the door itself: with made-up bytes that
 * begin as a PDF does, or with a made-up coded refusal. It keeps the body the page sent. Each answer carries the
 * headers of a real answer of the made-up office, because the page refuses an answer without them.
 *
 * The cases:
 *   1. The Export press shows "HTML file", then "PDF file", in the words of the word lists.
 *   2. One request goes to the PDF door. The page it sends holds the heading's and the paragraph's words. It holds no
 *      video or audio element. It holds a picture with a PNG data: address, followed by the video's name. It holds the
 *      sound's name and the file's name. It holds no data: address of the video's, the sound's or the file's own type,
 *      and no script element.
 *   3. The browser is handed one file, named after the report's title with the ending .pdf, whose bytes are the
 *      made-up answer's bytes.
 *   4. A coded refusal of the door saves nothing. The words beside the press are the code's words in the page's
 *      language, from the shared word lists, and the page does not say the made-up English message.
 *   5. The HTML choice still saves a file named after the title with the ending .html, and sends nothing to the PDF
 *      door.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { BrowserContext, Download, Page, Route } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n, isLanguage, WORD_LISTS, type WordKey } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RefusalCode } from '../src/shared/refusal-codes.ts'
import { freshDb, openRecordPagesAt, theBrowserThisWorkerShares, theBuiltPage, type TestDb } from './helpers.ts'

const TITLE = 'Made-up report to print'
const HEADING = 'Made-up heading of the printed report'
const PARAGRAPH = 'Made-up paragraph words that the PDF keeps.'
const FILM_NAME = 'made-up-film.webm'
const FILM_ALT = 'Made-up film'
const SOUND_NAME = 'made-up-sound.wav'
const SOUND_ALT = 'Made-up sound'
const FILE_NAME = 'made-up-notes.txt'
const FILE = Buffer.from('Made-up words in a made-up file.\n', 'utf8')
/**
 * THE PDF DOOR'S ANSWER, MADE UP. These bytes begin as a PDF does, and they are no printed report. The door prints with
 * a program that needs a window, and this browser test cannot start one, so the test answers in the door's place.
 */
const MADE_UP_PDF = Buffer.from('%PDF-1.7\n% Made-up bytes in the place of a printed report.\n%%EOF\n', 'latin1')
/** The made-up coded refusal of the door: a code the door declares, with no values, and made-up English words. */
const REFUSED_STATUS = 409
const REFUSED_CODE: RefusalCode = 'reportPdfNoDisplay'
const REFUSED_MESSAGE = 'Made-up English refusal of the PDF door.'
const REFUSED_REASON = 'Made-up English reason of the PDF door.'
/** The door the page sends the page for printing to. */
const DOOR = '/api/report-pdf'
/** The project the made-up office files everything in. */
const PROJECT = 'default'

let database: TestDb | undefined
let office: FastifyInstance | undefined
let origin = ''
let folder = ''
let report = ''
let checker: BrowserContext | undefined
let checkerPage: Page | undefined
/** The type each of the video, the sound and the file is served with by the file door, as the export reads it. */
let servedTypes: string[] = []
/** The page's language when the report was open, and a reader of the shared word lists in it. */
let words: ReturnType<typeof createI18n> | undefined
/** The menu's choices, in order, as the page drew them. */
let menuWords: string[] = []
/** Every body the page sent to the PDF door on the first press. */
const sent: string[] = []
let savedName = ''
let savedBytes = Buffer.alloc(0)
let downloads = 0

function owner(): Record<string, string> {
  return { 'content-type': 'application/json', 'x-mole-office-workspace': PROJECT, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
}

async function post(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers: owner(), body: JSON.stringify(body) })
  expect(response.status, await response.clone().text()).toBeGreaterThanOrEqual(200)
  expect(response.status).toBeLessThan(300)
  return response.json()
}

async function aFileOf(name: string, bytes: Buffer): Promise<{ path: string; name: string; size: number; hash: string }> {
  return (await post('/api/report-files', { name, bytes: bytes.toString('base64') })).file
}

/** Half a second of silence as a WAV file: 8,000 samples a second, one channel, 16 bits. */
function aMadeUpSound(): Buffer {
  const rate = 8_000
  const data = Buffer.alloc(rate)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

/** The type the file door serves one file of the report with, without its parameters. */
async function theServedTypeOf(path: string): Promise<string> {
  const answer = await fetch(`${origin}/api/file?path=${encodeURIComponent(path)}&record=${encodeURIComponent(report)}&download=1`, { headers: owner() })
  expect(answer.status, path).toBe(200)
  await answer.arrayBuffer()
  return (answer.headers.get('content-type') ?? '').replace(/[\s"'\\,]/g, '').toLowerCase().split(';')[0] ?? ''
}

async function context(): Promise<BrowserContext> {
  const browser = await theBrowserThisWorkerShares()
  const result = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  await openRecordPagesAt(result, 'full')
  return result
}

/** Open the report's page and wait until its blocks are drawn, the video and the sound held by the on-press choice. */
async function openTheReport(page: Page): Promise<void> {
  await page.goto(`${origin}/#/r/${report}`, { timeout: 60_000 })
  await page.locator('.rd-report .sb-fit').first().waitFor({ timeout: 60_000 })
  await page.waitForFunction(() => document.querySelectorAll('.sb-image-held[data-media-load="on-press"]').length === 2, undefined, { timeout: 60_000 })
  await page.locator('.rd-report .sb-file-save').first().waitFor({ timeout: 60_000 })
}

/** The reader of the shared word lists in the language of the open page. */
async function theWordsOf(page: Page): Promise<ReturnType<typeof createI18n>> {
  const language = await page.evaluate(() => document.documentElement.getAttribute('lang'))
  if (!isLanguage(language)) throw new Error(`The page's language is not one of the word lists: ${String(language)}`)
  return createI18n(language, WORD_LISTS)
}

/**
 * Open the Export menu in the record's head. The press is found by its words. The menu is read in the page and not in
 * the head, because the shared menu draws in the overlay host.
 */
async function openTheMenu(page: Page, reader: ReturnType<typeof createI18n>): Promise<void> {
  await page.locator('.rp-head').getByRole('button', { name: reader.t('reports.export.press'), exact: true }).click({ timeout: 60_000 })
  await page.getByRole('menu').waitFor({ timeout: 30_000 })
}

async function choose(page: Page, reader: ReturnType<typeof createI18n>, choice: WordKey): Promise<void> {
  await page.getByRole('menuitem', { name: reader.t(choice), exact: true }).click({ timeout: 30_000 })
}

/** Whether a request goes to the PDF door. */
function toTheDoor(url: URL | string): boolean {
  return new URL(url).pathname === DOOR
}

/**
 * Answer one request to the PDF door in the door's place. The answer carries the headers of a real answer of the
 * made-up office, which say which office and which world answered, and the page refuses an answer without them.
 */
async function answerInTheDoorsPlace(route: Route, status: number, contentType: string, body: Buffer | string): Promise<void> {
  const real = await route.fetch({ method: 'GET', url: `${origin}/api`, postData: '' })
  await route.fulfill({ response: real, status, contentType, body })
}

interface WhatThePageHolds {
  words: string
  tags: string[]
  /** Every picture, with whether its address is a PNG data: address and the element after it. */
  pictures: { png: boolean; next: { tag: string; words: string } | null }[]
}

/** Read the page sent to the door in the browser, with a parser that loads nothing and runs nothing. */
async function readThePage(page: Page, text: string): Promise<WhatThePageHolds> {
  return page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'text/html')
    const all = [...doc.querySelectorAll('*')]
    return {
      words: (doc.body.textContent ?? '').replace(/\s+/g, ' '),
      tags: all.map((element) => element.tagName.toLowerCase()),
      pictures: [...doc.querySelectorAll('img')].map((picture) => {
        const next = picture.nextElementSibling
        return {
          png: (picture.getAttribute('src') ?? '').startsWith('data:image/png'),
          next: next === null ? null : { tag: next.tagName.toLowerCase(), words: (next.textContent ?? '').replace(/\s+/g, ' ').trim() },
        }
      }),
    }
  }, text)
}

beforeAll(async () => {
  database = await freshDb()
  folder = dirname(database.file)
  const built = await theBuiltPage()
  const browser = await theBrowserThisWorkerShares()
  // THE VIDEO IS RECORDED AS THE HTML EXPORT'S TEST RECORDS ITS OWN, 320 by 180.
  const recording = await browser.newContext({ recordVideo: { dir: folder, size: { width: 320, height: 180 } }, viewport: { width: 320, height: 180 } })
  const filming = await recording.newPage()
  await filming.setContent('<body style="background:#346;color:white">Made-up film</body>')
  await filming.waitForTimeout(1_000)
  const film = filming.video()
  if (film === null) throw new Error('The browser did not record the made-up film')
  await recording.close()
  const filmBytes = readFileSync(await film.path())

  const { buildApp } = await import('../src/server/index.ts')
  office = (await buildApp({ production: true, webDir: built, webAppUrl: 'http://localhost:5173', logLevel: false })).app
  await office.listen({ port: 0, host: '127.0.0.1' })
  const address = office.server.address()
  if (address === null || typeof address === 'string') throw new Error('The made-up office did not listen')
  origin = `http://127.0.0.1:${address.port}`
  const person = await (await fetch(`${origin}/api/office/owner`)).json() as { named: boolean }
  if (!person.named) await post('/api/office/owner', { name: 'Made-up reader', language: 'en' })

  const filmFile = await aFileOf(FILM_NAME, filmBytes)
  const soundFile = await aFileOf(SOUND_NAME, aMadeUpSound())
  const notes = await aFileOf(FILE_NAME, FILE)
  report = (await post('/api/records', {
    kind: 'report',
    title: TITLE,
    data: {
      blocks: [
        { id: 'heading', type: 'heading', text: HEADING },
        { id: 'paragraph', type: 'text', text: PARAGRAPH },
        { id: 'film', type: 'video', ...filmFile, alt: FILM_ALT },
        { id: 'sound', type: 'audio', ...soundFile, alt: SOUND_ALT },
        { id: 'notes', type: 'file', ...notes },
      ],
    },
  })).record.id
  servedTypes = [await theServedTypeOf(filmFile.path), await theServedTypeOf(soundFile.path), await theServedTypeOf(notes.path)]

  // THE PERSON'S MEDIA CHOICE IS ON-PRESS before any page opens, so the page reads it on its first load.
  const set = await fetch(`${origin}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: owner(), body: JSON.stringify({ mediaLoad: 'on-press' }) })
  expect(set.status, await set.clone().text()).toBe(200)

  const reading = await context()
  try {
    const page = await reading.newPage()
    page.on('download', () => { downloads += 1 })
    await page.route(toTheDoor, async (route) => {
      sent.push(route.request().postData() ?? '')
      await answerInTheDoorsPlace(route, 200, 'application/pdf', MADE_UP_PDF)
    })
    await openTheReport(page)
    const reader = await theWordsOf(page)
    words = reader
    await openTheMenu(page, reader)
    menuWords = (await page.getByRole('menu').getByRole('menuitem').allInnerTexts()).map((said) => said.trim())
    const handed: Promise<Download> = page.waitForEvent('download', { timeout: 120_000 })
    await choose(page, reader, 'reports.export.pdf')
    const download = await handed
    savedName = download.suggestedFilename()
    const saved = join(folder, 'the-exported-report.pdf')
    await download.saveAs(saved)
    savedBytes = readFileSync(saved)
    // A SECOND FILE OR A SECOND REQUEST WOULD COME AT ONCE; two seconds is long enough to see one.
    await page.waitForTimeout(2_000)
  } finally { await reading.close() }

  // THE PAGE SENT TO THE DOOR IS READ ON A BLANK PAGE, which asks the office for nothing.
  checker = await (await theBrowserThisWorkerShares()).newContext()
  checkerPage = await checker.newPage()
}, 300_000)

afterAll(async () => { await checker?.close(); await office?.close(); database?.close() }, 60_000)

function theReader(): ReturnType<typeof createI18n> {
  if (words === undefined) throw new Error('The report was not opened, so its language was not read')
  return words
}

it('shows the HTML file and then the PDF file as the Export choices', () => {
  const reader = theReader()
  expect(menuWords).toEqual([reader.t('reports.export.html'), reader.t('reports.export.pdf')])
})

it('sends one page to the PDF door, with a frame for the video and names for the sound and the file', async () => {
  expect(sent).toHaveLength(1)
  const body = JSON.parse(sent[0]!) as Record<string, unknown>
  expect(Object.keys(body)).toEqual(['html'])
  const html = body['html']
  if (typeof html !== 'string') throw new Error(`The page sent no html: ${sent[0]!.slice(0, 200)}`)
  if (checkerPage === undefined) throw new Error('No blank page was opened to read the sent page on')
  const held = await readThePage(checkerPage, html)
  for (const said of [HEADING, PARAGRAPH, SOUND_NAME, FILE_NAME]) expect(held.words).toContain(said)
  for (const tag of ['video', 'audio', 'script']) expect(held.tags, tag).not.toContain(tag)
  expect(held.pictures.filter((picture) => picture.png && picture.next !== null && picture.next.tag === 'span' && picture.next.words === FILM_NAME)).toHaveLength(1)
  expect(servedTypes).toHaveLength(3)
  for (const type of servedTypes) {
    expect(type).not.toBe('')
    expect(html.toLowerCase(), type).not.toContain(`data:${type}`)
  }
})

it("hands the browser one PDF named after the report, holding the door's bytes", () => {
  expect(downloads).toBe(1)
  expect(savedName).toBe(`${TITLE}.pdf`)
  expect(savedBytes.equals(MADE_UP_PDF)).toBe(true)
})

it("saves nothing on a coded refusal, and says the code's words in the page's language", async () => {
  const reading = await context()
  try {
    const page = await reading.newPage()
    let handed = 0
    page.on('download', () => { handed += 1 })
    await page.route(toTheDoor, (route) => answerInTheDoorsPlace(route, REFUSED_STATUS, 'application/json', JSON.stringify({
      error: REFUSED_MESSAGE, reason: REFUSED_REASON, code: REFUSED_CODE, values: {},
    })))
    await openTheReport(page)
    const reader = await theWordsOf(page)
    await openTheMenu(page, reader)
    await choose(page, reader, 'reports.export.pdf')
    const alert = page.locator('.rp-head [role="alert"]')
    await alert.first().waitFor({ timeout: 120_000 })
    await page.waitForTimeout(2_000)
    const said = (await alert.first().innerText()).trim()
    expect(said).toBe(reader.t(`server.${REFUSED_CODE}`, {}))
    expect(said).not.toContain(REFUSED_MESSAGE)
    expect(said).not.toContain(REFUSED_REASON)
    expect(handed).toBe(0)
  } finally { await reading.close() }
}, 180_000)

it('still saves the HTML file on the HTML choice, and sends nothing to the PDF door', async () => {
  const reading = await context()
  try {
    const page = await reading.newPage()
    const asked: string[] = []
    page.on('request', (request) => { if (toTheDoor(request.url())) asked.push(request.url()) })
    let handed = 0
    page.on('download', () => { handed += 1 })
    await openTheReport(page)
    const reader = await theWordsOf(page)
    const arrived: Promise<Download> = page.waitForEvent('download', { timeout: 120_000 })
    await openTheMenu(page, reader)
    await choose(page, reader, 'reports.export.html')
    const download = await arrived
    await page.waitForTimeout(2_000)
    expect(download.suggestedFilename()).toBe(`${TITLE}.html`)
    expect(handed).toBe(1)
    expect(asked).toEqual([])
  } finally { await reading.close() }
}, 180_000)
