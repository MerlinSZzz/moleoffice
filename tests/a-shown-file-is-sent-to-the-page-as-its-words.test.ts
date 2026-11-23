// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORD DOCUMENT, A TEXT FILE OR A MARKDOWN FILE IS SENT TO THE PAGE AS ITS WORDS, OR IS REFUSED
 * WHOLE WITH THE SENTENCE IT HAD BEFORE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The report draws a Word document, a text file and a Markdown file in the office's own page, so
 * the office's right-click can reach their words. This test is the door's half: what the file door
 * answers on words=1, before any browser draws it.
 *
 *   1. A plain GET of the .docx is exactly today's answer: the Word content type, the file's own
 *      bytes, and no page policy.
 *   2. words=1 answers JSON under nosniff and no-store. A Word document is its blocks as data: the
 *      heading and its level, the bold run, the list, the table and its cells, and a note that a
 *      picture was left out. The text `<script>alert('made-up')</script>` is a string in the data,
 *      never markup. A heading is found by its style's w:name as well as by HeadingN, and a bullet
 *      list and a numbered list are told apart by numbering.xml.
 *   3. words=1 of a text, log, CSV or JSON file is its text, and of a Markdown file is its text
 *      under the Markdown kind, so the page draws it as Markdown. The file's name is the name the
 *      record gives it.
 *   4. What the Word reader refused before is still refused, with the same status and the same
 *      sentence, and nothing of the file is in the answer: a DOCTYPE, a document that inflates past
 *      the limit, bytes that are not a Word document. A text file that is not UTF-8 is refused with
 *      its sentence, and a file over the page cap is refused with the sentence that says so.
 *   5. words=1 of a kind the page does not draw as words is refused, and so is words=1 beside a save,
 *      an open or a metadata read.
 *   6. THE OLD GENERATED PAGE IS GONE. open=1&shown=1 of a Word document or a text file is the file
 *      itself, as open=1 alone is: no page of HTML is made from a file any more.
 *   7. The chat's Open, open=1 alone, and the report's type read of a file over the cap are unchanged.
 *
 * The sentences are read from the word list with sayInEnglish, never copied into the test.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { MAX_PREVIEW_BYTES } from '../src/shared/preview-limit.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { writeZip } from '../src/server/lib/zip-export/zip.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

const THE_WORD_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const DOCUMENT_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
const DOCUMENT_TAIL = '</w:body></w:document>'

function aWordFile(document: string, styles?: string, numbering?: string): Buffer {
  return writeZip([
    { name: '[Content_Types].xml', bytes: Buffer.from('<Types/>') },
    { name: 'word/document.xml', bytes: Buffer.from(document) },
    ...(styles === undefined ? [] : [{ name: 'word/styles.xml', bytes: Buffer.from(styles) }]),
    ...(numbering === undefined ? [] : [{ name: 'word/numbering.xml', bytes: Buffer.from(numbering) }]),
  ])
}

const READABLE = aWordFile(
  DOCUMENT_HEAD +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Made-up heading</w:t></w:r></w:p>' +
    '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Made-up bold words</w:t></w:r>' +
    '<w:r><w:t xml:space="preserve"> and a &amp; b</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' +
    '<w:r><w:t>Made-up first item</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' +
    '<w:r><w:t>Made-up second item</w:t></w:r></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Made-up cell one</w:t></w:r></w:p></w:tc>' +
    '<w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Made-up cell two</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '<w:p><w:r><w:t>&lt;script&gt;alert(&apos;made-up&apos;)&lt;/script&gt;</w:t></w:r></w:p>' +
    '<w:p><w:r><w:drawing/></w:r></w:p>' +
    DOCUMENT_TAIL,
)

/** One bulleted list and one numbered list, whose kinds only word/numbering.xml gives. */
const THE_NUMBERING =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>' +
  '<w:abstractNum w:abstractNumId="11"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>' +
  '<w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>' +
  '<w:num w:numId="2"><w:abstractNumId w:val="11"/></w:num>' +
  '</w:numbering>'

const WITH_LISTS = aWordFile(
  DOCUMENT_HEAD +
    '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' +
    '<w:r><w:t>Made-up bullet item</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>' +
    '<w:r><w:t>Made-up numbered item</w:t></w:r></w:p>' +
    DOCUMENT_TAIL,
  undefined,
  THE_NUMBERING,
)

/** The same kind of file with a definition declaration, carrying words nobody may be served. */
const WITH_A_DOCTYPE = aWordFile(
  '<!DOCTYPE made-up [<!ENTITY secret "made-up secret words">]>' +
    DOCUMENT_HEAD +
    '<w:p><w:r><w:t>made-up secret words</w:t></w:r></w:p>' +
    DOCUMENT_TAIL,
)

/** A paragraph whose style id is `1`, which only styles.xml says means heading 1. */
const WITH_A_STYLE_HEADING = aWordFile(
  DOCUMENT_HEAD +
    '<w:p><w:pPr><w:pStyle w:val="1"/></w:pPr><w:r><w:t>Made-up styled heading</w:t></w:r></w:p>' +
    DOCUMENT_TAIL,
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/>' +
    '<w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>',
)

/** A small archive holding a document that inflates past the reader's 8 MB limit. */
const TOO_MUCH = aWordFile(
  DOCUMENT_HEAD +
    '<w:p><w:r><w:t>' +
    'x'.repeat(9 * 1024 * 1024) +
    '</w:t></w:r></w:p>' +
    DOCUMENT_TAIL,
)

const THE_TEXT = '﻿Made-up text a & b <b>not bold</b>\nA second made-up line.'
const THE_MARKDOWN = '# Made-up Markdown heading\n\nA made-up paragraph with [a made-up link](https://example.invalid/).'
const THE_LOG = 'Made-up log line one.\nMade-up log line two.'
const THE_CSV = 'name,word\nmade-up,made-up word'
const THE_JSON = '{"word":"made-up","a":"a & b"}'
/** Bytes that are not UTF-8: a lone continuation byte and a byte UTF-8 never uses. */
const NOT_UTF8 = Buffer.from([0x4d, 0x61, 0x64, 0x65, 0x80, 0xff, 0x2d, 0x75, 0x70])

let t: TestDb
let app: FastifyInstance
let previousRoots: string | undefined
let roots = ''
let moduleId = ''

const named = {
  word: '', styled: '', lists: '', doctype: '', huge: '', notword: '', large: '',
  text: '', markdown: '', log: '', csv: '', json: '', notutf8: '', picture: '',
}
/** One MiB over the page's cap, so the words must be refused and the file never read. */
const LARGE_BYTES = MAX_PREVIEW_BYTES + 1024 * 1024

async function ask(path: string, more = ''): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(path)}${more}`, headers: OWNER })
}

function errorOf(res: LightMyRequestResponse): string {
  return (JSON.parse(res.body) as { error: string }).error
}

beforeAll(async () => {
  t = await freshDb()
  roots = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-shown-words-')))
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = roots
  app = (await apiApp()).app
  await app.ready()

  const store = join(roots, 'store')
  mkdirSync(store, { recursive: true })
  named.word = join(store, 'made-up.docx')
  named.styled = join(store, 'made-up-styled.docx')
  named.lists = join(store, 'made-up-lists.docx')
  named.doctype = join(store, 'made-up-doctype.docx')
  named.huge = join(store, 'made-up-huge.docx')
  named.notword = join(store, 'made-up-not-a-word.docx')
  named.large = join(store, 'made-up-over-cap.txt')
  named.text = join(store, 'made-up-words.txt')
  named.markdown = join(store, 'made-up-notes.md')
  named.log = join(store, 'made-up-run.log')
  named.csv = join(store, 'made-up-table.csv')
  named.json = join(store, 'made-up-facts.json')
  named.notutf8 = join(store, 'made-up-not-utf8.txt')
  named.picture = join(store, 'made-up-picture.png')
  writeFileSync(named.word, READABLE)
  writeFileSync(named.styled, WITH_A_STYLE_HEADING)
  writeFileSync(named.lists, WITH_LISTS)
  writeFileSync(named.doctype, WITH_A_DOCTYPE)
  writeFileSync(named.huge, TOO_MUCH)
  writeFileSync(named.notword, 'not a zip, and not a Word document')
  writeFileSync(named.large, '')
  truncateSync(named.large, LARGE_BYTES)
  writeFileSync(named.text, THE_TEXT, 'utf8')
  writeFileSync(named.markdown, THE_MARKDOWN, 'utf8')
  writeFileSync(named.log, THE_LOG, 'utf8')
  writeFileSync(named.csv, THE_CSV, 'utf8')
  writeFileSync(named.json, THE_JSON, 'utf8')
  writeFileSync(named.notutf8, NOT_UTF8)
  writeFileSync(named.picture, Buffer.from('made-up bytes that a picture would be'))

  const created = t.api.createRecord({
    workspaceId: HERE,
    kind: 'module',
    title: 'The shown files this door test points at',
    data: {
      context: 'A module that points at each file, which is what lets the door read it.',
      parts: [],
      paths: [
        { id: 'word', label: 'A made-up Word document', path: named.word, kind: 'other' },
        { id: 'styled', label: 'A made-up Word document with a styled heading', path: named.styled, kind: 'other' },
        { id: 'lists', label: 'A made-up Word document with a bulleted and a numbered list', path: named.lists, kind: 'other' },
        { id: 'doctype', label: 'A made-up document with a definition', path: named.doctype, kind: 'other' },
        { id: 'huge', label: 'A made-up document that inflates past the limit', path: named.huge, kind: 'other' },
        { id: 'notword', label: 'Made-up bytes that are not a Word document', path: named.notword, kind: 'other' },
        { id: 'large', label: 'A made-up text file over the page cap', path: named.large, kind: 'other' },
        { id: 'text', label: 'A made-up text file', path: named.text, kind: 'other' },
        { id: 'markdown', label: 'A made-up Markdown file', path: named.markdown, kind: 'other' },
        { id: 'log', label: 'A made-up log file', path: named.log, kind: 'other' },
        { id: 'csv', label: 'A made-up CSV file', path: named.csv, kind: 'other' },
        { id: 'json', label: 'A made-up JSON file', path: named.json, kind: 'other' },
        { id: 'notutf8', label: 'A made-up text file that is not UTF-8', path: named.notutf8, kind: 'other' },
        { id: 'picture', label: 'A made-up picture', path: named.picture, kind: 'other' },
      ],
    },
    actor: t.api.HUMAN,
  })
  moduleId = created.id
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  await app?.close()
  t?.close()
  if (roots !== '') rmSync(roots, { recursive: true, force: true })
})

/** The headers every words answer carries. */
function expectAWordsAnswer(res: LightMyRequestResponse): void {
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  expect(String(res.headers['content-type'])).toContain('application/json')
  expect(res.headers['x-content-type-options']).toBe('nosniff')
  expect(res.headers['cache-control']).toBe('no-store')
  expect(res.headers['content-security-policy']).toBeUndefined()
  expect(res.headers['content-disposition']).toBeUndefined()
  expect(res.headers['x-mole-office-record']).toBe(moduleId)
}

/** A refusal: JSON with the sentence, and no word of the file. */
function expectARefusal(res: LightMyRequestResponse, status: number, sentence: string): void {
  expect(res.statusCode, res.body.slice(0, 300)).toBe(status)
  expect(String(res.headers['content-type'])).toContain('application/json')
  expect(errorOf(res)).toBe(sentence)
  expect(res.body.length).toBeLessThan(20_000)
}

describe('a plain read of a Word file is today\'s download', () => {
  it('names the Word type, sends the file whole and carries no page policy', async () => {
    const res = await ask(named.word)
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['content-type']).toBe(THE_WORD_TYPE)
    expect(res.headers['content-security-policy']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(Buffer.compare(res.rawPayload, READABLE)).toBe(0)
  })
})

describe('words=1 sends a Word document as its blocks, as data', () => {
  it('answers the heading, the runs, the list, the table and the picture note, and no markup', async () => {
    const res = await ask(named.word, '&words=1')
    expectAWordsAnswer(res)
    const plain = (text: string) => ({ text, bold: false, italic: false })
    expect(JSON.parse(res.body)).toEqual({
      name: 'made-up.docx',
      kind: 'word',
      blocks: [
        { kind: 'heading', level: 1, runs: [plain('Made-up heading')] },
        { kind: 'paragraph', runs: [{ text: 'Made-up bold words', bold: true, italic: false }, plain(' and a & b')] },
        { kind: 'list', ordered: false, items: [{ level: 0, runs: [plain('Made-up first item')] }, { level: 0, runs: [plain('Made-up second item')] }] },
        {
          kind: 'table',
          rows: [{
            cells: [
              { span: 1, blocks: [{ kind: 'paragraph', runs: [plain('Made-up cell one')] }] },
              { span: 2, blocks: [{ kind: 'paragraph', runs: [{ text: 'Made-up cell two', bold: false, italic: true }] }] },
            ],
          }],
        },
        // THE SCRIPT-LIKE TEXT IS A STRING IN THE DATA. The page draws it as text; nothing here is markup.
        { kind: 'paragraph', runs: [plain("<script>alert('made-up')</script>")] },
      ],
      picturesLeftOut: true,
    })
    expect(res.body).not.toContain('&lt;')
    expect(res.body).not.toContain('<html')
    expect(res.body).not.toContain('<strong')
  })

  it('finds a heading by its style name, not only by HeadingN', async () => {
    const res = await ask(named.styled, '&words=1')
    expectAWordsAnswer(res)
    expect((JSON.parse(res.body) as { blocks: unknown[] }).blocks).toEqual([
      { kind: 'heading', level: 1, runs: [{ text: 'Made-up styled heading', bold: false, italic: false }] },
    ])
  })

  it('reads the lists under the numbering root as one unordered and one ordered', async () => {
    const res = await ask(named.lists, '&words=1')
    expectAWordsAnswer(res)
    expect((JSON.parse(res.body) as { blocks: unknown[] }).blocks).toEqual([
      { kind: 'list', ordered: false, items: [{ level: 0, runs: [{ text: 'Made-up bullet item', bold: false, italic: false }] }] },
      { kind: 'list', ordered: true, items: [{ level: 0, runs: [{ text: 'Made-up numbered item', bold: false, italic: false }] }] },
    ])
  })
})

describe('words=1 sends a text file as its text, and a Markdown file as Markdown', () => {
  it('answers a text file\'s words exactly, with the byte order mark left out', async () => {
    const res = await ask(named.text, '&words=1')
    expectAWordsAnswer(res)
    expect(JSON.parse(res.body)).toEqual({ name: 'made-up-words.txt', kind: 'text', text: THE_TEXT.slice(1) })
  })

  it('answers a Markdown file under the Markdown kind, so the page draws it as Markdown', async () => {
    const res = await ask(named.markdown, '&words=1')
    expectAWordsAnswer(res)
    expect(JSON.parse(res.body)).toEqual({ name: 'made-up-notes.md', kind: 'markdown', text: THE_MARKDOWN })
  })

  it('answers a log, a CSV and a JSON file as text', async () => {
    for (const [path, name, text] of [
      [named.log, 'made-up-run.log', THE_LOG],
      [named.csv, 'made-up-table.csv', THE_CSV],
      [named.json, 'made-up-facts.json', THE_JSON],
    ] as const) {
      const res = await ask(path, '&words=1')
      expectAWordsAnswer(res)
      expect(JSON.parse(res.body), name).toEqual({ name, kind: 'text', text })
    }
  })
})

describe('what the Word reader refused before is still refused, with the same sentence', () => {
  it('refuses a document carrying a DOCTYPE, and serves none of its words', async () => {
    const res = await ask(named.doctype, '&words=1')
    expectARefusal(res, 415, sayInEnglish('sb.word.definitionRefused'))
    expect(res.body).not.toContain('made-up secret words')
  })

  it('refuses a document that inflates past the limit, and serves nothing of it', async () => {
    const res = await ask(named.huge, '&words=1')
    expectARefusal(res, 413, sayInEnglish('sb.word.tooMuchText'))
    expect(res.body).not.toContain('xxxxxxxxxx')
  })

  it('refuses bytes that are not a Word document', async () => {
    const res = await ask(named.notword, '&words=1')
    expectARefusal(res, 415, sayInEnglish('sb.word.notAWord'))
    expect(res.body).not.toContain('not a zip')
  })

  it('refuses a text file that is not UTF-8', async () => {
    const res = await ask(named.notutf8, '&words=1')
    expectARefusal(res, 415, sayInEnglish('sb.word.notText'))
  })

  it('refuses a file over the page cap with the sentence that says so, and never reads it', async () => {
    const res = await ask(named.large, '&words=1')
    expectARefusal(res, 413, sayInEnglish('sb.file.tooLargeToShow', { limit: MAX_PREVIEW_BYTES }))
  })
})

describe('words=1 is asked only of a kind the page draws as words, and alone', () => {
  it('refuses words=1 of a picture, and sends none of its bytes', async () => {
    const res = await ask(named.picture, '&words=1')
    expect(res.statusCode, res.body.slice(0, 300)).toBe(415)
    expect(String(res.headers['content-type'])).toContain('application/json')
    expect(res.body).not.toContain('made-up bytes')
  })

  it('refuses words=1 beside a save, an open or a metadata read', async () => {
    for (const more of ['&words=1&download=1', '&words=1&open=1', '&words=1&metadata=1']) {
      const res = await ask(named.word, more)
      expect(res.statusCode, more).toBe(400)
      expect(String(res.headers['content-type']), more).toContain('application/json')
    }
  })
})

describe('no page of HTML is made from a file any more', () => {
  it('answers open=1&shown=1 of a Word document as the file itself', async () => {
    const res = await ask(named.word, '&open=1&shown=1')
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['content-type']).toBe(THE_WORD_TYPE)
    expect(Buffer.compare(res.rawPayload, READABLE)).toBe(0)
  })

  it('answers open=1&shown=1 of a text file as the file itself', async () => {
    const res = await ask(named.text, '&open=1&shown=1')
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(String(res.headers['content-type'])).toContain('text/plain')
    expect(res.body).not.toContain('<pre>')
    expect(res.rawPayload.toString('utf8')).toBe(THE_TEXT)
  })
})

describe('the chat\'s Open is the answer at the cut', () => {
  it('answers open=1 alone of a Word document as the file itself, whole and unread', async () => {
    const res = await ask(named.word, '&open=1')
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['content-type']).toBe(THE_WORD_TYPE)
    expect(res.headers['content-security-policy']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(Buffer.compare(res.rawPayload, READABLE)).toBe(0)
  })

  it('answers open=1 alone of a text file over the cap as the whole raw file', async () => {
    const res = await ask(named.large, '&open=1')
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(String(res.headers['content-type'])).toContain('text/plain')
    expect(res.headers['content-security-policy']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.rawPayload.length).toBe(LARGE_BYTES)
  })
})

describe('the report can read the type of a file over the page cap without reading it', () => {
  it('answers HEAD&download=1 with the text type and no bytes, the door\'s existing no-cap type read', async () => {
    const res = await app.inject({ method: 'HEAD', url: `/api/file?path=${encodeURIComponent(named.large)}&download=1`, headers: OWNER })
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(String(res.headers['content-type'])).toContain('text/plain')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.rawPayload.length).toBe(0)
  })

  it('still refuses a plain HEAD of the same file as its plain GET is refused', async () => {
    const res = await app.inject({ method: 'HEAD', url: `/api/file?path=${encodeURIComponent(named.large)}`, headers: OWNER })
    expect(res.statusCode).toBe(413)
    expect(res.rawPayload.length).toBe(0)
  })
})
