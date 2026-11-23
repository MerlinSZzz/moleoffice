// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORD DOCUMENT, A TEXT FILE AND A MARKDOWN FILE ARE DRAWN IN THE OFFICE'S OWN PAGE, AND THEIR WORDS
 * CAN BE TALKED ABOUT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The owner wants to select words in a Word document, a text file or a Markdown file shown in the
 * office, and talk with an agent about them. The report used to draw these files in a frame with an
 * empty sandbox, so the office's right-click could not reach their words. Now the file door sends the
 * file's words as data, and the page draws them as its own elements.
 *
 * This test puts a made-up report in a real office and drives the built page in Chromium:
 *
 *   1. Before any press the page has read only the HEAD that names each type. Each file block has its
 *      Show press and its Save press, and nothing of a file is drawn.
 *   2. One press on the Word block draws its words in the report itself, with no frame: the heading,
 *      the bold words, the list, the table and the picture note are page elements. The text
 *      `<script>...</script>` is those characters, and no script element is made.
 *   3. One press on each text block (.txt, .log, .csv and .json) draws its words exactly as written.
 *      The Markdown block is drawn as Markdown: its '#' line is a heading.
 *   4. Every press asked the file door with words=1, and none asked for the old generated page.
 *   5. A .txt file over the page cap, pressed in the report, draws the sentence that says the file is
 *      too large, and nothing of the file.
 *   6. Words selected in the Word, text and Markdown blocks and right-clicked open the office's
 *      right-click about those words. The chip names the file and quotes the words.
 *   7. The block's Open press leads to the office's page for that one file. That page draws the same
 *      reader, with no frame, and the same right-click names the file there too. Save is still the
 *      door's download answer.
 *
 * The sentences are read from the word list, never copied into the test.
 */

import type { Locator } from 'playwright'
import { mkdirSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { recordPath, shownFilePath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { writeZip } from '../src/server/lib/zip-export/zip.ts'
import { MAX_PREVIEW_BYTES } from '../src/shared/preview-limit.ts'

const HERE = 'default'
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The words the files draw, which no other page or fixture has any reason to hold. */
const THE_HEADING = 'Marram-ostrich-7311'
const THE_BOLD = 'Marram-ostrich-7312'
const THE_CELL = 'Marram-ostrich-7313'
const THE_TEXT = 'Marram-ostrich-7314 a & b <script>alert(1)</script>'
const THE_MARKDOWN_HEADING = 'Marram-ostrich-7315'
const THE_MARKDOWN_SENTENCE = 'Marram-ostrich-7319 is a made-up note under the heading.'
const THE_MARKDOWN = `# ${THE_MARKDOWN_HEADING}\n\n${THE_MARKDOWN_SENTENCE}`
const THE_LOG = 'Marram-ostrich-7316 was written to a made-up log.'
const THE_CSV = 'name,word\nmade-up,Marram-ostrich-7317'
const THE_JSON = '{"word":"Marram-ostrich-7318","a":"a & b"}'

const DOCUMENT_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
const DOCUMENT_TAIL = '</w:body></w:document>'

const THE_WORD_FILE = writeZip([
  { name: '[Content_Types].xml', bytes: Buffer.from('<Types/>') },
  {
    name: 'word/document.xml',
    bytes: Buffer.from(
      DOCUMENT_HEAD +
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${THE_HEADING}</w:t></w:r></w:p>` +
        `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${THE_BOLD}</w:t></w:r></w:p>` +
        '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' +
        '<w:r><w:t>A made-up list item</w:t></w:r></w:p>' +
        `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>${THE_CELL}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>` +
        '<w:p><w:r><w:t>&lt;script&gt;alert(&apos;made-up&apos;)&lt;/script&gt;</w:t></w:r></w:p>' +
        '<w:p><w:r><w:drawing/></w:r></w:p>' +
        DOCUMENT_TAIL,
    ),
  },
])

type Uploaded = { path: string; name: string; size: number; hash: string }

let app: LiveApp
let report: string
let word: Uploaded
let textFile: Uploaded
let markdownFile: Uploaded
let logFile: Uploaded
let csvFile: Uploaded
let jsonFile: Uploaded
let largePath = ''
const LARGE_BYTES = MAX_PREVIEW_BYTES + 1024 * 1024

/** What the browser asked the file door, by stored path. */
const requestsByPath = new Map<string, { method: string; open: string | null; shown: string | null; words: string | null }[]>()

beforeAll(async () => {
  app = await liveApp({ name: 'word-and-text-in-report', opensAt: 'full', viewport: { width: 1440, height: 1000 } })

  async function upload(name: string, bytes: Buffer): Promise<Uploaded> {
    const answer = await fetch(`${app.api}/api/report-files`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ bytes: bytes.toString('base64'), name }),
    })
    expect(answer.status, await answer.clone().text()).toBe(201)
    return ((await answer.json()) as { file: Uploaded }).file
  }

  word = await upload('made-up-word.docx', THE_WORD_FILE)
  textFile = await upload('made-up-words.txt', Buffer.from(THE_TEXT, 'utf8'))
  markdownFile = await upload('made-up-notes.md', Buffer.from(THE_MARKDOWN, 'utf8'))
  logFile = await upload('made-up-run.log', Buffer.from(THE_LOG, 'utf8'))
  csvFile = await upload('made-up-table.csv', Buffer.from(THE_CSV, 'utf8'))
  jsonFile = await upload('made-up-facts.json', Buffer.from(THE_JSON, 'utf8'))

  // A FILE OVER THE PAGE CAP. The report-files store beside the test database is a preview root,
  // and the report points at a file put there without a 25 MB upload. Its bytes are never read for
  // the page: the door answers its size with the refusal before opening it.
  largePath = join(app.dir, 'report-files', 'made-up-over-cap.txt')
  mkdirSync(join(app.dir, 'report-files'), { recursive: true })
  writeFileSync(largePath, '')
  truncateSync(largePath, LARGE_BYTES)

  const created = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report carrying a Word document and text files',
      summary: 'A Word document and text files the report draws inside itself on one press.',
      data: {
        for: 'The Word and text attachment test',
        date: '2026-11-21',
        blocks: [
          { id: 'word', type: 'file', ...word, caption: 'A made-up Word document.' },
          { id: 'text', type: 'file', ...textFile, caption: 'A made-up text file.' },
          { id: 'markdown', type: 'file', ...markdownFile, caption: 'A made-up Markdown file.' },
          { id: 'log', type: 'file', ...logFile, caption: 'A made-up log file.' },
          { id: 'csv', type: 'file', ...csvFile, caption: 'A made-up CSV file.' },
          { id: 'json', type: 'file', ...jsonFile, caption: 'A made-up JSON file.' },
          {
            id: 'large',
            type: 'file',
            path: largePath,
            name: 'made-up-over-cap.txt',
            size: LARGE_BYTES,
            hash: '0'.repeat(16),
            caption: 'A made-up text file over the page cap.',
          },
        ],
      },
    }),
  })
  expect(created.status, await created.clone().text()).toBe(201)
  report = ((await created.json()) as { record: { id: string } }).record.id

  app.page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname !== '/api/file') return
    const path = url.searchParams.get('path')
    if (path === null) return
    const list = requestsByPath.get(path) ?? []
    list.push({
      method: request.method(),
      open: url.searchParams.get('open'),
      shown: url.searchParams.get('shown'),
      words: url.searchParams.get('words'),
    })
    requestsByPath.set(path, list)
  })
}, 240_000)

afterAll(async () => {
  if (largePath !== '') rmSync(largePath, { force: true })
  await app?.stop()
}, 60_000)

async function openThe(address: string): Promise<void> {
  await app.page.goto('about:blank')
  requestsByPath.clear()
  await app.page.goto(`${app.site}/#${address}`)
  await waitForThePage(app.page, 60_000)
}

/** The figure of one file block, found by the name the block draws. */
function figureFor(name: string): Locator {
  return app.page.locator('.sb-file').filter({ has: app.page.locator('.sb-file-name', { hasText: name }) })
}

/**
 * SELECT THE WORDS OF ONE ELEMENT, RIGHT-CLICK ON THEM, AND READ THE CHIP. The selection is made the
 * way a person's drag leaves it, as one range over the element's first text node, and the right-click
 * lands in the middle of those words.
 */
async function rightClickTheWords(within: Locator, words: string): Promise<{ kind: string; what: string }> {
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
  const kind = (await composer.locator('.px-talk-chip-kind').textContent({ timeout: 10_000 })) ?? ''
  const what = (await composer.locator('.px-talk-chip-what').textContent({ timeout: 10_000 })) ?? ''
  await app.page.keyboard.press('Escape')
  await composer.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  return { kind, what }
}

it('draws the Word document and the text files as the page\'s own elements, with no frame', async () => {
  await openThe(recordPath(report))

  const figures = app.page.locator('.sb-file')
  await figures.first().waitFor({ timeout: 10_000 })
  expect(await figures.count()).toBe(7)
  expect(await app.page.locator('iframe').count()).toBe(0)
  expect(await app.page.locator('.sb-file-words').count()).toBe(0)
  // THE WORD TYPE IS NEITHER A PLAYER NOR A SMALL PICTURE. The report draws the file block as a
  // file, not as media the door never said it was.
  const wordFigure = figureFor(word.name)
  expect(await wordFigure.locator('video').count()).toBe(0)
  expect(await wordFigure.locator('.sb-file-preview').count()).toBe(0)
  expect(await wordFigure.locator('img').count()).toBe(0)
  const texts = [
    { file: textFile, words: THE_TEXT },
    { file: logFile, words: THE_LOG },
    { file: csvFile, words: THE_CSV },
    { file: jsonFile, words: THE_JSON },
  ]
  // BEFORE THE PRESS THE PAGE READ ONLY THE TYPE OF EACH FILE, INCLUDING THE OVER-CAP ONE.
  for (const file of [word, markdownFile, ...texts.map((one) => one.file)]) {
    expect((requestsByPath.get(file.path) ?? []).filter((request) => request.method !== 'HEAD')).toEqual([])
  }
  expect((requestsByPath.get(largePath) ?? []).every((request) => request.words !== '1')).toBe(true)

  // THE WORD BLOCK: one press, and the document's own reading drawn in the report.
  await wordFigure.locator('.sb-file-show').click()
  const wordReader = wordFigure.locator('.sb-file-words')
  await wordReader.waitFor({ timeout: 15_000 })
  await expect.poll(async () => wordReader.locator('h3').first().innerText(), { timeout: 15_000 }).toBe(THE_HEADING)
  expect(await wordReader.locator('strong').innerText()).toBe(THE_BOLD)
  expect(await wordReader.locator('li').innerText()).toContain('A made-up list item')
  expect(await wordReader.locator('td').innerText()).toBe(THE_CELL)
  expect(await wordReader.innerText()).toContain("<script>alert('made-up')</script>")
  expect(await wordReader.locator('script').count()).toBe(0)
  expect(await wordReader.innerText()).toContain(sayInEnglish('sb.word.picturesLeftOut'))
  expect(await wordFigure.locator('iframe').count()).toBe(0)

  // THE TEXT BLOCKS: one press each, and their words exactly as written.
  for (const { file, words } of texts) {
    const figure = figureFor(file.name)
    await figure.locator('.sb-file-show').click()
    const reader = figure.locator('.sb-file-words')
    await expect.poll(async () => reader.locator('pre').innerText(), { timeout: 15_000 }).toBe(words)
    expect(await reader.locator('script').count(), file.name).toBe(0)
    expect(await reader.locator('h1, h2, h3, h4, h5, h6').count(), file.name).toBe(0)
  }

  // THE MARKDOWN BLOCK: drawn as Markdown, so its '#' line is a heading and the sentence a paragraph.
  const markdownFigure = figureFor(markdownFile.name)
  await markdownFigure.locator('.sb-file-show').click()
  const markdownReader = markdownFigure.locator('.sb-file-words')
  await expect.poll(async () => markdownReader.locator('h3').first().innerText(), { timeout: 15_000 }).toBe(THE_MARKDOWN_HEADING)
  expect(await markdownReader.locator('p').first().innerText()).toBe(THE_MARKDOWN_SENTENCE)
  expect(await markdownReader.innerText()).not.toContain('#')

  // THE OVER-CAP TEXT BLOCK: its press draws the sentence that says why, and nothing of the file.
  const largeFigure = figureFor('made-up-over-cap.txt')
  await largeFigure.locator('.sb-file-show').click()
  await expect.poll(async () => largeFigure.innerText(), { timeout: 15_000 }).toContain(
    sayInEnglish('sb.file.tooLargeToShow', { limit: MAX_PREVIEW_BYTES }),
  )
  expect(await largeFigure.locator('iframe').count()).toBe(0)
  expect(await largeFigure.locator('pre').count()).toBe(0)

  // EACH PRESS ASKED THE DOOR FOR THE WORDS, AND NONE ASKED FOR THE OLD GENERATED PAGE.
  for (const file of [word, markdownFile, ...texts.map((one) => one.file), { path: largePath }]) {
    const gets = (requestsByPath.get(file.path) ?? []).filter((request) => request.method === 'GET')
    expect(gets.some((request) => request.words === '1'), file.path).toBe(true)
    expect(gets.some((request) => request.shown === '1'), file.path).toBe(false)
  }

  // THE OFFICE'S PAGE IS UNCHANGED, THERE IS STILL NO FRAME, AND EVERY BLOCK STILL SAVES ITS FILE.
  expect(new URL(app.page.url()).hash).toBe(`#${recordPath(report)}`)
  expect(await app.page.locator('iframe').count()).toBe(0)
  for (let index = 0; index < 7; index++) {
    expect(await figures.nth(index).locator('.sb-file-save').getAttribute('href')).toContain('download=1')
  }
}, 180_000)

it('opens the office\'s right-click about words selected in a shown file, and the chip names the file', async () => {
  await openThe(recordPath(report))
  const cases = [
    { file: word, words: THE_BOLD },
    { file: textFile, words: 'Marram-ostrich-7314' },
    { file: markdownFile, words: 'Marram-ostrich-7319' },
  ]
  for (const { file, words } of cases) {
    const figure = figureFor(file.name)
    await figure.locator('.sb-file-show').click()
    const reader = figure.locator('.sb-file-words')
    await reader.waitFor({ timeout: 15_000 })
    const chip = await rightClickTheWords(reader, words)
    expect(chip.kind, `the chip for ${file.name} does not name the file`).toContain(file.name)
    expect(chip.what, `the chip for ${file.name} does not quote the words`).toBe(`“${words}”`)
  }
}, 180_000)

it('leads the block\'s Open press to the office\'s page for the file, which draws the same reader', async () => {
  await openThe(recordPath(report))
  const wordFigure = figureFor(word.name)
  await wordFigure.locator('.sb-file-show').waitFor({ timeout: 15_000 })
  const open = wordFigure.locator('.sb-file-open')
  expect(await open.getAttribute('href')).toBe(`#${shownFilePath(report, word.path)}`)
  await open.click()
  await expect.poll(() => new URL(app.page.url()).hash, { timeout: 15_000 }).toBe(`#${shownFilePath(report, word.path)}`)
  await waitForThePage(app.page, 60_000)

  const cases = [
    { file: word, words: THE_BOLD, drawn: 'strong' },
    { file: textFile, words: 'Marram-ostrich-7314', drawn: 'pre' },
    { file: markdownFile, words: 'Marram-ostrich-7319', drawn: 'p' },
  ]
  for (const { file, words, drawn } of cases) {
    if (file !== word) await openThe(shownFilePath(report, file.path))
    const reader = app.page.locator('.sb-file-words')
    await reader.waitFor({ timeout: 15_000 })
    await expect.poll(async () => reader.locator(drawn).first().innerText(), { timeout: 15_000 }).toContain(words)
    expect(await app.page.locator('iframe').count(), file.name).toBe(0)
    expect(await app.page.locator('main h1').innerText(), file.name).toBe(file.name)
    expect(await app.page.locator('.sb-file-save').getAttribute('href'), file.name).toContain('download=1')

    const chip = await rightClickTheWords(reader, words)
    expect(chip.kind, `the chip on the page of ${file.name} does not name the file`).toContain(file.name)
    expect(chip.what, `the chip on the page of ${file.name} does not quote the words`).toBe(`“${words}”`)
  }
}, 180_000)
