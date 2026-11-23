// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HOSTILE WORD DOCUMENT, TEXT FILE OR MARKDOWN FILE SHOWN IN THE OFFICE RUNS NOTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * A Word document, a text file and a Markdown file are drawn in the office's own page, and no longer
 * in a frame with an empty sandbox. They must stay as safe as the frame was. Each made-up file here
 * holds a script, a picture with an error handler, a raw HTML link and an iframe, all in its text, and
 * the Markdown file holds a Markdown picture, a Markdown link and a link to a script address too.
 *
 * In a report's file block, and on the office's page for the file:
 *
 *   1. The file's words are drawn, and the HTML in them is shown as its characters.
 *   2. No element is made from the file's text: no script, picture, frame, object, form or style
 *      element, and no element with an on... handler.
 *   3. No script ran: the marks the hostile text would set on the window are not there.
 *   4. No request left for the picture's address or for the link's address.
 *   5. A link is not followed unless pressed. The Word document and the text file draw no link at
 *      all. The Markdown file's one web link opens a new tab, and only when it is pressed. Its
 *      script address is no link.
 *   6. The office's own page address does not change.
 */

import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { recordPath, shownFilePath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { writeZip } from '../src/server/lib/zip-export/zip.ts'

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The words each file draws, which no other page or fixture has any reason to hold. */
const THE_WORD_MARK = 'Shingle-heron-4411'
const THE_TEXT_MARK = 'Shingle-heron-4412'
const THE_MARKDOWN_MARK = 'Shingle-heron-4413'

/** The addresses the hostile text names. Nothing on the page may ask for either. */
const PICTURE_ADDRESS = 'made-up-picture.png'
const FOLLOWED_ADDRESS = 'made-up-followed'

let app: LiveApp
let report: string
let files: { kind: 'word' | 'text' | 'markdown'; path: string; name: string; mark: string }[] = []
const asked: string[] = []

/** The hostile HTML every file carries in its text, aimed at this test's own API server. */
function theHostileHtml(): string {
  const at = `http://127.0.0.1:${String(app.apiPort)}`
  return [
    '<script>window.__madeUpScriptRan = true</script>',
    `<img src="${at}/${PICTURE_ADDRESS}" onerror="window.__madeUpHandlerRan = true">`,
    `<a href="${at}/${FOLLOWED_ADDRESS}">a made-up raw link</a>`,
    `<iframe src="${at}/${FOLLOWED_ADDRESS}"></iframe>`,
    '<style>body { display: none }</style>',
  ].join(' ')
}

function escapedForXml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;')
}

function theHostileWordFile(): Buffer {
  const hostile = escapedForXml(theHostileHtml())
  return writeZip([
    { name: '[Content_Types].xml', bytes: Buffer.from('<Types/>') },
    {
      name: 'word/document.xml',
      bytes: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' +
          `<w:p><w:r><w:t>${THE_WORD_MARK}</w:t></w:r></w:p>` +
          `<w:p><w:r><w:t>${hostile}</w:t></w:r></w:p>` +
          `<w:p><w:hyperlink r:id="rId1"><w:r><w:t>a made-up Word link</w:t></w:r></w:hyperlink></w:p>` +
          '</w:body></w:document>',
      ),
    },
    {
      name: 'word/_rels/document.xml.rels',
      bytes: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" ` +
          `Target="http://127.0.0.1:${String(app.apiPort)}/${FOLLOWED_ADDRESS}" TargetMode="External"/>` +
          '</Relationships>',
      ),
    },
  ])
}

function theHostileMarkdown(): string {
  const at = `http://127.0.0.1:${String(app.apiPort)}`
  return [
    `# ${THE_MARKDOWN_MARK}`,
    '',
    theHostileHtml(),
    '',
    `![a made-up picture](${at}/${PICTURE_ADDRESS})`,
    '',
    `[a made-up link](${at}/${FOLLOWED_ADDRESS})`,
    '',
    '[a made-up script link](javascript:window.__madeUpLinkRan=true)',
  ].join('\n')
}

beforeAll(async () => {
  app = await liveApp({ name: 'hostile-file-shown', opensAt: 'full', viewport: { width: 1440, height: 1000 } })

  async function upload(name: string, bytes: Buffer): Promise<{ path: string; name: string; size: number; hash: string }> {
    const answer = await fetch(`${app.api}/api/report-files`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ bytes: bytes.toString('base64'), name }),
    })
    expect(answer.status, await answer.clone().text()).toBe(201)
    return ((await answer.json()) as { file: { path: string; name: string; size: number; hash: string } }).file
  }

  const word = await upload('made-up-hostile.docx', theHostileWordFile())
  const text = await upload('made-up-hostile.txt', Buffer.from(`${THE_TEXT_MARK}\n${theHostileHtml()}`, 'utf8'))
  const markdown = await upload('made-up-hostile.md', Buffer.from(theHostileMarkdown(), 'utf8'))
  files = [
    { kind: 'word', path: word.path, name: word.name, mark: THE_WORD_MARK },
    { kind: 'text', path: text.path, name: text.name, mark: THE_TEXT_MARK },
    { kind: 'markdown', path: markdown.path, name: markdown.name, mark: THE_MARKDOWN_MARK },
  ]

  const created = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report carrying three hostile made-up files',
      summary: 'A Word document, a text file and a Markdown file whose text is hostile HTML.',
      data: {
        for: 'The hostile file test',
        date: '2026-11-21',
        blocks: [
          { id: 'word', type: 'file', ...word, caption: 'A made-up hostile Word document.' },
          { id: 'text', type: 'file', ...text, caption: 'A made-up hostile text file.' },
          { id: 'markdown', type: 'file', ...markdown, caption: 'A made-up hostile Markdown file.' },
        ],
      },
    }),
  })
  expect(created.status, await created.clone().text()).toBe(201)
  report = ((await created.json()) as { record: { id: string } }).record.id

  app.page.context().on('request', (request) => {
    asked.push(request.url())
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openThe(address: string): Promise<void> {
  await app.page.goto('about:blank')
  asked.length = 0
  await app.page.goto(`${app.site}/#${address}`)
  await waitForThePage(app.page, 60_000)
}

/** Every element under the reader that the file's text could have made, by tag. */
async function whatTheTextMade(reader: Locator): Promise<{ made: string[]; handlers: string[] }> {
  return reader.evaluate((root) => {
    const made = [...root.querySelectorAll('script, img, picture, iframe, frame, object, embed, svg, form, input, button, style, link, meta, base, video, audio')]
      .map((element) => element.tagName.toLowerCase())
    const handlers: string[] = []
    for (const element of [root, ...root.querySelectorAll('*')]) {
      for (const name of element.getAttributeNames()) if (name.toLowerCase().startsWith('on')) handlers.push(`${element.tagName.toLowerCase()} ${name}`)
    }
    return { made, handlers }
  })
}

async function nothingRan(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const marks = window as unknown as Record<string, unknown>
    return [marks.__madeUpScriptRan, marks.__madeUpHandlerRan, marks.__madeUpLinkRan]
  })
}

/** Hold the reader to every promise in the head of this file, and press the one link it may hold. */
async function holdTheReader(reader: Locator, file: (typeof files)[number], address: string): Promise<void> {
  await expect.poll(async () => reader.innerText(), { timeout: 15_000 }).toContain(file.mark)
  // THE HTML IS ITS CHARACTERS. The Markdown reader may draw a line differently, so the one part
  // every reader keeps whole is held: the script element's own words.
  expect(await reader.innerText(), file.name).toContain('<script>window.__madeUpScriptRan = true</script>')
  expect(await whatTheTextMade(reader), file.name).toEqual({ made: [], handlers: [] })
  expect(await nothingRan(app.page), file.name).toEqual([undefined, undefined, undefined])
  // A moment for anything the page might have started on its own, then nothing was asked.
  await app.page.waitForTimeout(1_000)
  expect(asked.filter((url) => url.includes(PICTURE_ADDRESS)), file.name).toEqual([])
  expect(asked.filter((url) => url.includes(FOLLOWED_ADDRESS)), file.name).toEqual([])

  const links = reader.locator('a')
  if (file.kind !== 'markdown') {
    expect(await links.count(), `${file.name} drew a link`).toBe(0)
  } else {
    // ONE LINK, THE WEB ONE. The script address is drawn as words, never as a link.
    expect(await links.count(), file.name).toBe(1)
    const link = links.first()
    expect(await link.getAttribute('href')).toBe(`http://127.0.0.1:${String(app.apiPort)}/${FOLLOWED_ADDRESS}`)
    expect(await link.getAttribute('target')).toBe('_blank')
    expect(await link.getAttribute('rel')).toContain('noopener')
    expect(await reader.innerText()).toContain('javascript:window.__madeUpLinkRan=true')
    // PRESSED, IT OPENS A NEW TAB, AND THE OFFICE'S OWN PAGE STAYS WHERE IT WAS.
    const [opened] = await Promise.all([app.page.context().waitForEvent('page', { timeout: 15_000 }), link.click()])
    await expect.poll(() => asked.some((url) => url.includes(FOLLOWED_ADDRESS)), { timeout: 15_000 }).toBe(true)
    await opened.close()
  }
  expect(new URL(app.page.url()).hash).toBe(`#${address}`)
  expect(await nothingRan(app.page), file.name).toEqual([undefined, undefined, undefined])
}

it('runs nothing from a hostile file drawn in a report\'s file block', async () => {
  for (const file of files) {
    await openThe(recordPath(report))
    const figure = app.page.locator('.sb-file').filter({ has: app.page.locator('.sb-file-name', { hasText: file.name }) })
    await figure.locator('.sb-file-show').click()
    const reader = figure.locator('.sb-file-words')
    await reader.waitFor({ timeout: 15_000 })
    expect(await app.page.locator('iframe').count(), file.name).toBe(0)
    await holdTheReader(reader, file, recordPath(report))
  }
}, 180_000)

it('runs nothing from a hostile file drawn on the office\'s page for the file', async () => {
  for (const file of files) {
    const address = shownFilePath(report, file.path)
    await openThe(address)
    const reader = app.page.locator('.sb-file-words')
    await reader.waitFor({ timeout: 15_000 })
    expect(await app.page.locator('iframe').count(), file.name).toBe(0)
    await holdTheReader(reader, file, address)
  }
}, 180_000)
