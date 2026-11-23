// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT SAVES AS ONE HTML FILE. A press in a report's head opens a menu of formats, and its HTML item hands the
 * browser one file. The file holds no script. Every picture, video and file of the report is inside it as a data:
 * address. It holds none of the office's own marks and no address of the office or of the machine.
 *
 * One made-up office serves the built page from its own origin. One made-up report holds a heading, a paragraph, a
 * list, a table, a button, a maths block, a picture, a video, a file, a link to another host and a link to a record
 * page of the office. The person's media choice is on-press, so the picture and the video are held when the press is
 * made.
 * The cases:
 *   1. One file is handed over, named after the report's title.
 *   2. It holds the words of the heading, the paragraph, the list and the table. A column head keeps its words
 *      without its sort arrow. It holds no width grip, no reading-length control and not the label that control drew.
 *      The button block keeps its label, and holds no press.
 *   3. It holds no script, no on* attribute, no id outside an svg, and none of the elements that run or take input.
 *      Every data attribute is named in the file's own style, and every value that is not empty is compared there.
 *   4. With the data: contents taken out, it holds no record id, no project id, no id of the author, no address of
 *      the page, no port, no loopback host and no door of the office.
 *   5. The picture, the video and the file link are data: addresses whose bytes are the made-up files. The file
 *      link saves under the file's name.
 *   6. The html element has the page's language and the page's theme.
 *   7. Opened with JavaScript off, it asks for nothing but data: addresses, and the heading and paragraph are shown.
 *   8. The link to another host keeps its address. The link to the record page is words with no address.
 *   9. A second report whose file was taken off the disk is refused. The refusal names the file, and no file was
 *      handed over.
 */
import { readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { BrowserContext, Download, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { freshDb, openRecordPagesAt, theBrowserThisWorkerShares, theBuiltPage, type TestDb } from './helpers.ts'

const PICTURE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const FILE = Buffer.from('Made-up words in a made-up file.\n', 'utf8')
const FILE_NAME = 'made-up-notes.txt'
const GONE_NAME = 'made-up-gone.txt'
const TITLE = 'Made-up report to save'
const HEADING = 'Made-up heading of the saved report'
const PARAGRAPH = 'Made-up paragraph words that the file keeps.'
const OUTSIDE_WORDS = 'the made-up maker'
const OUTSIDE = 'https://example.org/made-up-maker'
const RECORD_WORDS = 'the made-up linked report'
const ITEMS = ['Made-up first item', 'Made-up second item']
const COLUMN = 'Made-up part'
const CELL = 'Made-up bracket'
const PRESS_LABEL = 'Made-up press words'
const PICTURE_ALT = 'Made-up dot'
const FILM_ALT = 'Made-up film'
/** The project the made-up office files everything in. */
const PROJECT = 'default'
/** The attributes on the root that carry the page's theme. */
const THEME_ATTRIBUTES = ['data-theme', 'data-theme-from', 'data-boot-theme', 'data-size', 'data-density', 'data-radius', 'data-font']

let database: TestDb | undefined
let office: FastifyInstance | undefined
let origin = ''
let port = ''
let folder = ''
let report = ''
let linked = ''
let broken = ''
let filmBytes = Buffer.alloc(0)
let saved = ''
let savedName = ''
let downloads = 0
let pageLanguage: string | null = null
let pageRoot: Record<string, string> = {}
let readingLengthLabels: string[] = []

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

async function context(): Promise<BrowserContext> {
  const browser = await theBrowserThisWorkerShares()
  const result = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  await openRecordPagesAt(result, 'full')
  // A THEME OF ITS OWN, so the file is shown to carry the one the page has and not the one a page has by default.
  await result.addInitScript(() => {
    if (location.protocol.startsWith('http')) localStorage.setItem('mole-office.preset.theme', 'dark')
  })
  return result
}

/** Open one report's page and wait until its blocks are drawn, its media held by the on-press choice. */
async function openTheReport(page: Page, id: string, held: number): Promise<void> {
  await page.goto(`${origin}/#/r/${id}`, { timeout: 60_000 })
  await page.locator('.rd-report .sb-fit').first().waitFor({ timeout: 60_000 })
  await page.waitForFunction(
    (count) => document.querySelectorAll('.sb-image-held[data-media-load="on-press"]').length === count,
    held,
    { timeout: 60_000 },
  )
  await page.locator('.rd-report .sb-file-save').first().waitFor({ timeout: 60_000 })
}

/**
 * The export press in the record's head, and the menu's HTML item, found by their English words. The item is found in
 * the page and not in the head, because the shared menu draws in the overlay host.
 */
async function pressExport(page: Page): Promise<void> {
  const head = page.locator('.rp-head')
  await head.getByRole('button', { name: sayInEnglish('reports.export.press'), exact: true }).click({ timeout: 60_000 })
  await page.getByRole('menuitem', { name: sayInEnglish('reports.export.html'), exact: true }).click({ timeout: 30_000 })
}

/** The bytes of a data: address, or null when it is not one written in base64. */
function bytesOf(address: string | null | undefined): Buffer | null {
  if (typeof address !== 'string' || !address.startsWith('data:')) return null
  const comma = address.indexOf(',')
  if (comma < 0 || !address.slice(0, comma).endsWith(';base64')) return null
  return Buffer.from(address.slice(comma + 1), 'base64')
}

interface WhatTheFileHolds {
  words: string
  tags: string[]
  classes: string[]
  onAttributes: string[]
  idsOutsideSvg: string[]
  attributes: { tag: string; name: string; value: string }[]
  selectors: { name: string; op: string | null; value: string | null }[]
  root: Record<string, string>
  picture: string | null
  film: string | null
  fileLink: { href: string | null; download: string | null } | null
  outside: { tag: string; href: string | null } | null
  record: { tag: string; href: string | null } | null
  linksToTheRecordPage: number
  /** The button block's words and the presses left in it, or null when the file holds no button block. */
  buttonBlock: { words: string; presses: number } | null
}

/** Read the saved file in the browser, with a parser that loads nothing and runs nothing. */
async function readTheFile(page: Page, text: string): Promise<WhatTheFileHolds> {
  return page.evaluate(
    ({ text, pictureAlt, filmAlt, outsideWords, recordWords }) => {
      const doc = new DOMParser().parseFromString(text, 'text/html')
      const all = [...doc.querySelectorAll('*')]
      const style = [...doc.querySelectorAll('style')].map((element) => element.textContent ?? '').join('\n')
      const selectors: { name: string; op: string | null; value: string | null }[] = []
      for (const found of style.matchAll(/\[\s*(data-[\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*(?:[is]\s*)?)?\]/g)) {
        selectors.push({ name: found[1]!, op: found[2] ?? null, value: found[2] === undefined ? null : (found[3] ?? found[4] ?? found[5] ?? '') })
      }
      const byWords = (words: string) =>
        all.find((element) => element.children.length === 0 && (element.textContent ?? '').replace(/\s+/g, ' ').trim() === words) ?? null
      const outside = byWords(outsideWords)
      const record = byWords(recordWords)
      const fileLink = all.find((element) => element.tagName === 'A' && element.hasAttribute('download')) ?? null
      const buttonBlock = doc.querySelector('.rq-button')
      return {
        words: (doc.body.textContent ?? '').replace(/\s+/g, ' '),
        tags: all.map((element) => element.tagName.toLowerCase()),
        classes: all.flatMap((element) => [...element.classList]),
        onAttributes: all.flatMap((element) => [...element.attributes].filter((one) => /^on/i.test(one.name)).map((one) => one.name)),
        idsOutsideSvg: all.filter((element) => element.hasAttribute('id') && element.closest('svg') === null).map((element) => element.id),
        attributes: all.flatMap((element) => [...element.attributes].map((one) => ({ tag: element.tagName.toLowerCase(), name: one.name, value: one.value }))),
        selectors,
        root: Object.fromEntries([...doc.documentElement.attributes].map((one) => [one.name, one.value])),
        picture: doc.querySelector(`img[alt="${pictureAlt}"]`)?.getAttribute('src') ?? null,
        film: doc.querySelector(`video[aria-label="${filmAlt}"]`)?.getAttribute('src') ?? doc.querySelector('video')?.getAttribute('src') ?? null,
        fileLink: fileLink === null ? null : { href: fileLink.getAttribute('href'), download: fileLink.getAttribute('download') },
        outside: outside === null ? null : { tag: outside.tagName.toLowerCase(), href: outside.getAttribute('href') },
        record: record === null ? null : { tag: record.tagName.toLowerCase(), href: record.getAttribute('href') },
        linksToTheRecordPage: all.filter((element) => (element.getAttribute('href') ?? '').includes('#/r/')).length,
        buttonBlock: buttonBlock === null ? null : {
          words: (buttonBlock.textContent ?? '').replace(/\s+/g, ' ').trim(),
          presses: buttonBlock.querySelectorAll('button, [role="button"]').length,
        },
      }
    },
    { text, pictureAlt: PICTURE_ALT, filmAlt: FILM_ALT, outsideWords: OUTSIDE_WORDS, recordWords: RECORD_WORDS },
  )
}

/** Whether the file's style compares this data attribute's value, whole by `=` or word by word by `~=`. */
function comparedInTheStyle(held: WhatTheFileHolds, name: string, value: string): boolean {
  const named = held.selectors.filter((selector) => selector.name === name)
  if (named.some((selector) => selector.op === '=' && selector.value === value)) return true
  const words = value.split(/\s+/).filter((word) => word !== '')
  return words.length > 0 && words.every((word) => named.some((selector) => selector.op === '~=' && selector.value === word))
}

let held: WhatTheFileHolds | undefined
let checker: BrowserContext | undefined
let checkerPage: Page | undefined

beforeAll(async () => {
  database = await freshDb()
  folder = dirname(database.file)
  const built = await theBuiltPage()
  const browser = await theBrowserThisWorkerShares()
  const recording = await browser.newContext({ recordVideo: { dir: folder, size: { width: 320, height: 180 } }, viewport: { width: 320, height: 180 } })
  const filming = await recording.newPage()
  await filming.setContent('<body style="background:#346;color:white">Made-up film</body>')
  await filming.waitForTimeout(1_000)
  const film = filming.video()
  if (film === null) throw new Error('The browser did not record the made-up film')
  await recording.close()
  filmBytes = readFileSync(await film.path())

  const { buildApp } = await import('../src/server/index.ts')
  office = (await buildApp({ production: true, webDir: built, webAppUrl: 'http://localhost:5173', logLevel: false })).app
  await office.listen({ port: 0, host: '127.0.0.1' })
  const address = office.server.address()
  if (address === null || typeof address === 'string') throw new Error('The made-up office did not listen')
  port = String(address.port)
  origin = `http://127.0.0.1:${port}`
  const person = await (await fetch(`${origin}/api/office/owner`)).json() as { named: boolean }
  if (!person.named) await post('/api/office/owner', { name: 'Made-up reader', language: 'en' })

  const picture = await aFileOf('made-up-dot.png', PICTURE)
  const filmFile = await aFileOf('made-up-film.webm', filmBytes)
  const notes = await aFileOf(FILE_NAME, FILE)
  linked = (await post('/api/records', { kind: 'report', title: 'Made-up linked report', data: { blocks: [{ id: 'words', type: 'text', text: 'Made-up words.' }] } })).record.id
  report = (await post('/api/records', {
    kind: 'report',
    title: TITLE,
    data: {
      blocks: [
        { id: 'heading', type: 'heading', text: HEADING },
        { id: 'paragraph', type: 'text', text: `${PARAGRAPH} See [${OUTSIDE_WORDS}](${OUTSIDE}) and [${RECORD_WORDS}](#/r/${linked}).` },
        { id: 'list', type: 'list', items: ITEMS },
        { id: 'table', type: 'table', columns: [{ label: COLUMN }, { label: 'Made-up grams', align: 'right' }], rows: [{ cells: [CELL, 12] }] },
        { id: 'press', type: 'button', label: PRESS_LABEL },
        { id: 'maths', type: 'math', tex: 'E = mc^2' },
        { id: 'picture', type: 'image', path: picture.path, alt: PICTURE_ALT },
        { id: 'film', type: 'video', ...filmFile, alt: FILM_ALT },
        { id: 'notes', type: 'file', ...notes },
      ],
    },
  })).record.id
  const gone = await aFileOf(GONE_NAME, FILE)
  broken = (await post('/api/records', { kind: 'report', title: 'Made-up report whose file is gone', data: { blocks: [{ id: 'words', type: 'text', text: 'Made-up words.' }, { id: 'gone', type: 'file', ...gone }] } })).record.id
  rmSync(gone.path)

  // THE PERSON'S MEDIA CHOICE IS ON-PRESS before any page opens, so the page reads it on its first load.
  const set = await fetch(`${origin}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: owner(), body: JSON.stringify({ mediaLoad: 'on-press' }) })
  expect(set.status, await set.clone().text()).toBe(200)

  const reading = await context()
  try {
    const page = await reading.newPage()
    page.on('download', () => { downloads += 1 })
    await openTheReport(page, report, 2)
    await page.locator('.rd-report .sb-math .katex').first().waitFor({ timeout: 60_000 })
    pageLanguage = await page.evaluate(() => document.documentElement.getAttribute('lang'))
    pageRoot = await page.evaluate(() => Object.fromEntries([...document.documentElement.attributes].map((one) => [one.name, one.value])))
    // THE READING-LENGTH LABELS AS THE PAGE DRAWS THEM, read before the press. The file is checked against these words.
    readingLengthLabels = await page.evaluate(() =>
      [...document.querySelectorAll('.rd-report .sb-level-label')].map((one) => (one.textContent ?? '').replace(/\s+/g, ' ').trim()))
    const handed: Promise<Download> = page.waitForEvent('download', { timeout: 120_000 })
    await pressExport(page)
    const download = await handed
    savedName = download.suggestedFilename()
    saved = join(folder, 'the-saved-report.html')
    await download.saveAs(saved)
    // A SECOND FILE WOULD COME AT ONCE; two seconds is long enough to see one.
    await page.waitForTimeout(2_000)
  } finally { await reading.close() }

  // THE FILE IS READ ON A BLANK PAGE, which asks the office for nothing.
  checker = await (await theBrowserThisWorkerShares()).newContext()
  checkerPage = await checker.newPage()
  held = await readTheFile(checkerPage, readFileSync(saved, 'utf8'))
}, 300_000)

afterAll(async () => { await checker?.close(); await office?.close(); database?.close() }, 60_000)

function theFile(): WhatTheFileHolds {
  if (held === undefined) throw new Error('No file was saved, so there is nothing to read')
  return held
}

it('hands over one file, named after the report', () => {
  expect(downloads).toBe(1)
  expect(savedName).toBe(`${TITLE}.html`)
  expect(readFileSync(saved, 'utf8').startsWith('<!doctype html>')).toBe(true)
})

it('holds the words of the heading, the paragraph, the list and the table', () => {
  const file = theFile()
  for (const said of [TITLE, HEADING, PARAGRAPH, ...ITEMS, COLUMN, CELL]) expect(file.words).toContain(said)
  // A COLUMN HEAD KEEPS ITS WORDS, AND ITS SORT ARROW GOES. The width grip and the reading-length control go too.
  expect(file.words).not.toContain('⇅')
  expect(file.classes).not.toContain('sb-level')
  expect(file.classes).not.toContain('sb-grab')
  expect(readingLengthLabels.length).toBeGreaterThan(0)
  for (const label of readingLengthLabels) {
    expect(label).not.toBe('')
    expect(file.words).not.toContain(label)
  }
  // A BUTTON BLOCK'S LABEL IS THE REPORT'S OWN WORDS, so its press gives way to them.
  expect(file.words).toContain(PRESS_LABEL)
  expect(file.buttonBlock).not.toBeNull()
  expect(file.buttonBlock?.words).toContain(PRESS_LABEL)
  expect(file.buttonBlock?.presses).toBe(0)
})

it('holds no script, nothing that runs or takes input, and no data attribute its style does not read', () => {
  const file = theFile()
  for (const tag of ['script', 'noscript', 'iframe', 'object', 'embed', 'canvas', 'button', 'input', 'select', 'textarea', 'form', 'link', 'base']) {
    expect(file.tags, tag).not.toContain(tag)
  }
  expect(file.onAttributes).toEqual([])
  expect(file.idsOutsideSvg).toEqual([])
  const named = new Set(file.selectors.map((selector) => selector.name))
  const data = file.attributes.filter((one) => one.name.startsWith('data-'))
  expect(data.filter((one) => !named.has(one.name)).map((one) => one.name)).toEqual([])
  expect(data.filter((one) => one.value !== '' && !comparedInTheStyle(file, one.name, one.value))).toEqual([])
})

it('holds no id, no address of the page and no door of the office, once its data: contents are taken out', () => {
  const text = readFileSync(saved, 'utf8').replace(/data:[^"'()\s>]*/g, 'data:')
  for (const mark of [report, linked, broken, THE_PERSON, origin, `:${port}`, '127.0.0.1', 'localhost', '/api/', 'workspace=', 'x-mole-office']) {
    expect(text, mark).not.toContain(mark)
  }
  // THE PROJECT'S ID IS A COMMON WORD, and the page's style compares it as a value (data-density's default). So it is
  // looked for as a value of its own: no attribute holds it, except a data attribute whose value the style compares.
  const file = theFile()
  expect(file.attributes.filter((one) => one.value === PROJECT && !(one.name.startsWith('data-') && comparedInTheStyle(file, one.name, one.value)))).toEqual([])
})

it('holds the picture, the video and the file as data: addresses of their own bytes', () => {
  const file = theFile()
  expect(bytesOf(file.picture)?.equals(PICTURE)).toBe(true)
  expect(bytesOf(file.film)?.equals(filmBytes)).toBe(true)
  expect(file.fileLink?.download).toBe(FILE_NAME)
  expect(bytesOf(file.fileLink?.href)?.equals(FILE)).toBe(true)
})

it("carries the page's language and theme on its html element", () => {
  const root = theFile().root
  expect(pageLanguage).not.toBeNull()
  expect(root['lang']).toBe(pageLanguage)
  expect(pageRoot['data-theme']).toBe('dark')
  expect(root['data-theme']).toBe('dark')
  for (const name of THEME_ATTRIBUTES) {
    if (pageRoot[name] === undefined) continue
    expect(root[name], name).toBe(comparedInTheStyle(theFile(), name, pageRoot[name]!) ? pageRoot[name] : '')
  }
})

it('asks for nothing but data: addresses with JavaScript off, and shows the heading and the paragraph', async () => {
  const off = await (await theBrowserThisWorkerShares()).newContext({ javaScriptEnabled: false })
  try {
    const page = await off.newPage()
    const address = pathToFileURL(saved).href
    const asked: string[] = []
    page.on('request', (request) => { asked.push(request.url()) })
    await page.goto(address, { waitUntil: 'load', timeout: 60_000 })
    await page.waitForTimeout(1_000)
    expect(asked.filter((url) => url !== address && !url.startsWith('data:'))).toEqual([])
    expect(await page.getByText(HEADING, { exact: true }).first().isVisible()).toBe(true)
    expect(await page.getByText(PARAGRAPH).first().isVisible()).toBe(true)
  } finally { await off.close() }
}, 120_000)

it('keeps the link to another host, and makes the link to the record page words', () => {
  const file = theFile()
  expect(file.outside).toEqual({ tag: 'a', href: OUTSIDE })
  expect(file.record).not.toBeNull()
  expect(file.record?.tag).not.toBe('a')
  expect(file.record?.href).toBeNull()
  expect(file.linksToTheRecordPage).toBe(0)
})

it('refuses a report whose file cannot be read, names the file, and hands over nothing', async () => {
  const reading = await context()
  try {
    const page = await reading.newPage()
    let handed = 0
    page.on('download', () => { handed += 1 })
    await openTheReport(page, broken, 0)
    await pressExport(page)
    const alert = page.locator('.rp-head [role="alert"]')
    await alert.first().waitFor({ timeout: 120_000 })
    const said = (await alert.first().innerText()).trim()
    const [before, after] = sayInEnglish('reports.export.fileUnread', { name: GONE_NAME, reason: '\u0000' }).split('\u0000')
    expect(said.startsWith(before!), said).toBe(true)
    expect(said.endsWith(after!), said).toBe(true)
    expect(said).toContain(GONE_NAME)
    expect(handed).toBe(0)
  } finally { await reading.close() }
}, 180_000)
