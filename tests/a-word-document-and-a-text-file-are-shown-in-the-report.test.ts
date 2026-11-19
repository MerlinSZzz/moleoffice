// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORD DOCUMENT AND TEXT FILES ATTACHED TO A REPORT ARE SHOWN INSIDE THE REPORT ON ONE PRESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * A person reading the report meets a .docx attached to one and has to download it before he can
 * read it. The work asks that one press shows it in the report, readable, with no script of its own.
 * The supervisor added the text files: .txt, .log, .md, .csv and .json open with the same press, as
 * their own text, escaped, with no script, and Markdown shows as its text rather than formatted.
 *
 * This test puts a made-up report in a real office and drives the built page in Chromium:
 *
 *   1. Before any press there is no frame, the page has read only the HEAD that names each type, and
 *      each file block still has its own one press and its save press.
 *   2. One press on the Word block draws a frame whose sandbox is empty (no script of its own): the
 *      heading, the bold words, the list, the table, and the picture note are drawn, the text
 *      `<script>...</script>` is those characters, and the frame holds no script element.
 *   3. One press on each of the five text blocks (.txt, .md, .log, .csv and .json) draws their
 *      words in their own frames, with the ampersand and the script-like text exactly as written,
 *      and the Markdown's '#' still a '#' rather than a heading. None of those frames holds a
 *      script element, and none draws a heading of its own.
 *   4. Every frame asked the file door with open=1&shown=1, every answer carried the generated page
 *      policy, every save press is the door's download answer, and the office's page is unchanged.
 *   5. A .txt file over the page cap, pressed in the report, draws the 413 page that says the file is
 *      too large: it is a sentence in the frame, never a blank rectangle and never the raw file.
 *
 * The sentence about the picture is read from the word list, never copied into the test.
 */

import { mkdirSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { recordPath } from '../src/web/components/router.tsx'
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
const THE_MARKDOWN = '# Marram-ostrich-7315\n\nA made-up note that must not become a heading.'
const THE_LOG = 'Marram-ostrich-7316 was written to a made-up log.'
const THE_CSV = 'name,word\nmade-up,Marram-ostrich-7317'
const THE_JSON = '{"word":"Marram-ostrich-7318","a":"a & b"}'

const THE_PAGE_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

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

let app: LiveApp
let report: string
let word: { path: string; name: string }
let textFile: { path: string; name: string }
let markdownFile: { path: string; name: string }
let logFile: { path: string; name: string }
let csvFile: { path: string; name: string }
let jsonFile: { path: string; name: string }
let largePath = ''
const LARGE_BYTES = MAX_PREVIEW_BYTES + 1024 * 1024

/** What the browser asked the file door, by stored path, and the policy on the GET's answer. */
const requestsByPath = new Map<string, { method: string; open: string | null; shown: string | null }[]>()
const policyByPath = new Map<string, string | null>()

beforeAll(async () => {
  app = await liveApp({ name: 'word-and-text-in-report', opensAt: 'full', viewport: { width: 1440, height: 1000 } })

  async function upload(name: string, bytes: Buffer): Promise<{ path: string; name: string; size: number; hash: string }> {
    const answer = await fetch(`${app.api}/api/report-files`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ bytes: bytes.toString('base64'), name }),
    })
    expect(answer.status, await answer.clone().text()).toBe(201)
    return ((await answer.json()) as { file: { path: string; name: string; size: number; hash: string } }).file
  }

  const wordFile = await upload('made-up-word.docx', THE_WORD_FILE)
  const textUpload = await upload('made-up-words.txt', Buffer.from(THE_TEXT, 'utf8'))
  const markdownUpload = await upload('made-up-notes.md', Buffer.from(THE_MARKDOWN, 'utf8'))
  const logUpload = await upload('made-up-run.log', Buffer.from(THE_LOG, 'utf8'))
  const csvUpload = await upload('made-up-table.csv', Buffer.from(THE_CSV, 'utf8'))
  const jsonUpload = await upload('made-up-facts.json', Buffer.from(THE_JSON, 'utf8'))
  word = { path: wordFile.path, name: wordFile.name }
  textFile = { path: textUpload.path, name: textUpload.name }
  markdownFile = { path: markdownUpload.path, name: markdownUpload.name }
  logFile = { path: logUpload.path, name: logUpload.name }
  csvFile = { path: csvUpload.path, name: csvUpload.name }
  jsonFile = { path: jsonUpload.path, name: jsonUpload.name }

  // A FILE OVER THE PAGE CAP. The report-files store beside the test database is a preview root,
  // and the report points at a file put there without a 25 MB upload. Its bytes are never read by
  // the page's frame: the door answers its size with the refusal page before opening it.
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
      summary: 'A Word document and text files the report shows inside itself on one press.',
      data: {
        for: 'The Word and text attachment test',
        date: '2026-11-17',
        blocks: [
          { id: 'word', type: 'file', ...wordFile, caption: 'A made-up Word document.' },
          { id: 'text', type: 'file', ...textUpload, caption: 'A made-up text file.' },
          { id: 'markdown', type: 'file', ...markdownUpload, caption: 'A made-up Markdown file.' },
          { id: 'log', type: 'file', ...logUpload, caption: 'A made-up log file.' },
          { id: 'csv', type: 'file', ...csvUpload, caption: 'A made-up CSV file.' },
          { id: 'json', type: 'file', ...jsonUpload, caption: 'A made-up JSON file.' },
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
    list.push({ method: request.method(), open: url.searchParams.get('open'), shown: url.searchParams.get('shown') })
    requestsByPath.set(path, list)
  })
  app.page.on('response', async (response) => {
    const url = new URL(response.url())
    if (url.pathname !== '/api/file' || response.request().method() !== 'GET') return
    const path = url.searchParams.get('path')
    if (path !== null) policyByPath.set(path, (await response.allHeaders())['content-security-policy'] ?? null)
  })
}, 240_000)

afterAll(async () => {
  if (largePath !== '') rmSync(largePath, { force: true })
  await app?.stop()
}, 60_000)

async function openTheReport(): Promise<void> {
  await app.page.goto('about:blank')
  requestsByPath.clear()
  policyByPath.clear()
  await app.page.goto(`${app.site}/#${recordPath(report)}`)
  await waitForThePage(app.page, 60_000)
}

it('draws the Word document in an empty-sandbox frame, and the text files as their own text', async () => {
  await openTheReport()

  const figures = app.page.locator('.sb-file')
  await figures.first().waitFor({ timeout: 10_000 })
  expect(await figures.count()).toBe(7)
  expect(await app.page.locator('.sb-file-frame').count()).toBe(0)
  // THE WORD TYPE IS NEITHER A PLAYER NOR A SMALL PICTURE. The report draws the file block as a
  // file, not as media the door never said it was.
  expect(await figures.nth(0).locator('video').count()).toBe(0)
  expect(await figures.nth(0).locator('.sb-file-preview').count()).toBe(0)
  expect(await figures.nth(0).locator('img').count()).toBe(0)
  const files = [
    { file: word, words: null as string | null },
    { file: textFile, words: THE_TEXT },
    { file: markdownFile, words: THE_MARKDOWN },
    { file: logFile, words: THE_LOG },
    { file: csvFile, words: THE_CSV },
    { file: jsonFile, words: THE_JSON },
  ]
  // BEFORE THE PRESS THE PAGE READ ONLY THE TYPE OF EACH FILE, INCLUDING THE OVER-CAP ONE.
  for (const { file } of files) {
    expect((requestsByPath.get(file.path) ?? []).filter((request) => request.method !== 'HEAD')).toEqual([])
  }
  // BEFORE THE PRESS NOTHING OPENS THE OVER-CAP FILE. Its type read may ask again with a GET when
  // the plain HEAD is refused, but that GET is the refusal, never an open=1 frame.
  expect((requestsByPath.get(largePath) ?? []).every((request) => request.open !== '1')).toBe(true)

  // THE WORD BLOCK: one press, one frame with an empty sandbox, and the document's own reading.
  const wordFigure = figures.nth(0)
  expect(await wordFigure.locator('.sb-file-show').count()).toBe(1)
  await wordFigure.locator('.sb-file-show').click()
  const wordFrameLocator = wordFigure.locator('.sb-file-frame')
  await wordFrameLocator.waitFor({ timeout: 15_000 })
  expect(await wordFrameLocator.getAttribute('sandbox')).toBe('')
  expect(await wordFrameLocator.getAttribute('src')).toContain('open=1&shown=1')

  const wordFrame = app.page.frameLocator('.sb-file-frame').first()
  await expect.poll(async () => wordFrame.locator('h1').innerText(), { timeout: 15_000 }).toBe(THE_HEADING)
  expect(await wordFrame.locator('strong').innerText()).toBe(THE_BOLD)
  expect(await wordFrame.locator('li').innerText()).toContain('A made-up list item')
  expect(await wordFrame.locator('td').innerText()).toBe(THE_CELL)
  expect(await wordFrame.locator('body').innerText()).toContain("<script>alert('made-up')</script>")
  expect(await wordFrame.locator('script').count()).toBe(0)
  expect(await wordFrame.locator('body').innerText()).toContain(sayInEnglish('sb.word.picturesLeftOut'))

  // THE TEXT BLOCKS: one press each, their words exactly as written in a pre, no heading in the Markdown.
  for (let index = 1; index < files.length; index++) await figures.nth(index).locator('.sb-file-show').click()
  await expect.poll(async () => app.page.locator('.sb-file-frame').count(), { timeout: 15_000 }).toBe(6)

  const frames = app.page.frameLocator('.sb-file-frame')
  for (let index = 1; index < files.length; index++) {
    const expected = files[index]?.words as string
    const frame = frames.nth(index)
    await expect.poll(async () => frame.locator('pre').innerText(), { timeout: 15_000 }).toBe(expected)
    expect(await frame.locator('script').count()).toBe(0)
    expect(await frame.locator('h1').count()).toBe(0)
  }

  // THE OVER-CAP TEXT BLOCK: its press draws the page that says why, not the file and not a blank frame.
  const largeFigure = figures.nth(6)
  expect(await largeFigure.locator('.sb-file-show').count()).toBe(1)
  await largeFigure.locator('.sb-file-show').click()
  await expect.poll(async () => app.page.locator('.sb-file-frame').count(), { timeout: 15_000 }).toBe(7)
  const largeFrame = app.page.frameLocator('.sb-file-frame').nth(6)
  await expect.poll(async () => largeFrame.locator('body').innerText(), { timeout: 15_000 }).toContain(
    sayInEnglish('sb.file.tooLargeToShow', { limit: MAX_PREVIEW_BYTES }),
  )
  expect(await largeFrame.locator('script').count()).toBe(0)

  // EACH FRAME ASKED WITH open=1&shown=1, AND EACH ANSWER CARRIED THE GENERATED PAGE POLICY.
  for (const { file } of files) {
    const get = (requestsByPath.get(file.path) ?? []).find((request) => request.method === 'GET')
    expect(get?.open).toBe('1')
    expect(get?.shown).toBe('1')
    expect(policyByPath.get(file.path)).toBe(THE_PAGE_POLICY)
  }
  const largeGet = (requestsByPath.get(largePath) ?? []).find((request) => request.method === 'GET')
  expect(largeGet?.open).toBe('1')
  expect(largeGet?.shown).toBe('1')
  expect(policyByPath.get(largePath)).toBe(THE_PAGE_POLICY)

  // THE OFFICE'S PAGE IS UNCHANGED, AND EVERY BLOCK STILL SAVES THE FILE IT NAMES.
  expect(new URL(app.page.url()).hash).toBe(`#${recordPath(report)}`)
  expect(await app.page.locator('.sb-file-name').count()).toBe(7)
  for (let index = 0; index < 7; index++) {
    expect(await figures.nth(index).locator('.sb-file-save').getAttribute('href')).toContain('download=1')
  }
}, 120_000)
