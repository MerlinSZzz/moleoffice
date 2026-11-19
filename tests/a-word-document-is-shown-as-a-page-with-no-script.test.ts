// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORD DOCUMENT IS SERVED AS ONE PAGE OF ITS OWN WORDS, WITH NO SCRIPT, OR IS REFUSED WHOLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * A person reading the report meets a .docx attached to one and has to download it before he can
 * read it. The work asks that one press shows it inside the office, readable, with no script of its
 * own. This test is the door's half: the page the file door answers, before any browser draws it.
 *
 *   1. A plain GET of the .docx is exactly today's answer: the Word content type, the file's own
 *      bytes, and no page policy. Adding the type to the preview list must not turn a download into
 *      a page.
 *   2. The report's press, open=1&shown=1, answers text/html; charset=utf-8 under
 *      default-src 'none'; style-src 'unsafe-inline'; sandbox, with nosniff. The page has the
 *      heading, bold words, a list and a table, shows the text
 *      `<script>alert('made-up')</script>` as those characters and has no script element, and says
 *      the document's picture is not shown. A heading is found by its style's w:name as well as by
 *      HeadingN, so a Chinese Word document's own style id still comes out as a heading.
 *   2b. THE CHAT'S OPEN IS THE ANSWER AT THE CUT: open=1 alone of a Word document or a text file is
 *      the file itself, whole and of its own type, at every size, and the report's press on a
 *      Word or text file over the page cap is a 413 page that says why.
 *   3. A document carrying a DOCTYPE is refused with its sentence, and none of its own words is
 *      served.
 *   4. A document whose document.xml inflates past the reader's limit is refused with its sentence,
 *      and nothing of it is served. This is made with the office's own zip writer, so the archive
 *      really is a small file holding a large document.
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

/** What the generated page is served as and under. Written out, not read from the door. */
const THE_PAGE_TYPE = 'text/html; charset=utf-8'
const THE_PAGE_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
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
    '<w:tc><w:p><w:r><w:t>Made-up cell two</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
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

let t: TestDb
let app: FastifyInstance
let previousRoots: string | undefined
let roots = ''

const named = { word: '', styled: '', lists: '', doctype: '', huge: '', notword: '', large: '' }
/** One MiB over the page's cap, so the report's press must answer with a page and not the file. */
const LARGE_BYTES = MAX_PREVIEW_BYTES + 1024 * 1024

async function ask(path: string, more = ''): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(path)}${more}`, headers: OWNER })
}

beforeAll(async () => {
  t = await freshDb()
  roots = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-word-page-')))
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
  writeFileSync(named.word, READABLE)
  writeFileSync(named.styled, WITH_A_STYLE_HEADING)
  writeFileSync(named.lists, WITH_LISTS)
  writeFileSync(named.doctype, WITH_A_DOCTYPE)
  writeFileSync(named.huge, TOO_MUCH)
  writeFileSync(named.notword, 'not a zip, and not a Word document')
  writeFileSync(named.large, '')
  truncateSync(named.large, LARGE_BYTES)

  t.api.createRecord({
    workspaceId: HERE,
    kind: 'module',
    title: 'The Word files this door test points at',
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
      ],
    },
    actor: t.api.HUMAN,
  })
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  await app?.close()
  t?.close()
  if (roots !== '') rmSync(roots, { recursive: true, force: true })
})

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

describe('the report\'s press serves the document as one page with no script', () => {
  it('answers a page of its words under the generated page policy', async () => {
    const res = await ask(named.word, '&open=1&shown=1')
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['content-type']).toBe(THE_PAGE_TYPE)
    expect(res.headers['content-security-policy']).toBe(THE_PAGE_POLICY)
    expect(res.headers['x-content-type-options']).toBe('nosniff')

    expect(res.body).toContain('<h1>Made-up heading</h1>')
    expect(res.body).toContain('<html>')
    expect(res.body).toContain('<strong>Made-up bold words</strong>')
    expect(res.body).toContain('<li')
    expect(res.body).toContain('<table>')
    expect(res.body).toContain('Made-up cell one')
    expect(res.body).toContain('Made-up cell two')
    // THE SCRIPT-LIKE TEXT IS TEXT. Its characters are in the page, escaped, and no element is.
    expect(res.body).toContain('&lt;script&gt;alert(&#39;made-up&#39;)&lt;/script&gt;')
    expect(res.body).not.toContain('<script')
    expect(res.body).toContain('a &amp; b')
    // THE PICTURE IS LEFT OUT, AND THE PAGE SAYS SO IN THE WORD LIST'S SENTENCE.
    expect(res.body).toContain(sayInEnglish('sb.word.picturesLeftOut'))
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

describe('the report\'s press on a Word or text file over the page cap says why', () => {
  it('answers open=1&shown=1 with a 413 page and never the file', async () => {
    const res = await ask(named.large, '&open=1&shown=1')
    expect(res.statusCode, res.body.slice(0, 300)).toBe(413)
    expect(res.headers['content-type']).toBe(THE_PAGE_TYPE)
    expect(res.headers['content-security-policy']).toBe(THE_PAGE_POLICY)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.body).toContain(sayInEnglish('sb.file.tooLargeToShow', { limit: MAX_PREVIEW_BYTES }))
    expect(res.body.length).toBeLessThan(20_000)
  })
})

describe('a Word heading is found by its style name, not only by HeadingN', () => {
  it('draws the paragraph whose style id 1 styles.xml calls heading 1', async () => {
    const res = await ask(named.styled, '&open=1&shown=1')
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['content-type']).toBe(THE_PAGE_TYPE)
    expect(res.body).toContain('<h1>Made-up styled heading</h1>')
  })
})

describe('a Word document with numbering.xml is not refused', () => {
  it('reads the lists under the numbering root and draws one unordered and one ordered', async () => {
    const res = await ask(named.lists, '&open=1&shown=1')
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['content-type']).toBe(THE_PAGE_TYPE)
    expect(res.headers['content-security-policy']).toBe(THE_PAGE_POLICY)
    expect(res.body).toContain('<ul><li class="word-list-level-0">Made-up bullet item</li></ul>')
    expect(res.body).toContain('<ol><li class="word-list-level-0">Made-up numbered item</li></ol>')
    expect(res.body).not.toContain(sayInEnglish('sb.word.notAWord'))
  })
})

describe('a Word document that asks for more than the reader gives is refused whole', () => {
  it('refuses a document carrying a DOCTYPE with its sentence, and serves none of its words', async () => {
    const res = await ask(named.doctype, '&open=1&shown=1')
    expect(res.statusCode, res.body.slice(0, 300)).toBe(415)
    expect(res.headers['content-type']).toBe(THE_PAGE_TYPE)
    expect(res.headers['content-security-policy']).toBe(THE_PAGE_POLICY)
    expect(res.body).toContain(sayInEnglish('sb.word.definitionRefused'))
    expect(res.body).not.toContain('made-up secret words')
  })

  it('refuses a document that inflates past the limit with its sentence, and serves nothing of it', async () => {
    const res = await ask(named.huge, '&open=1&shown=1')
    expect(res.statusCode, res.body.slice(0, 300)).toBe(413)
    expect(res.headers['content-type']).toBe(THE_PAGE_TYPE)
    expect(res.headers['content-security-policy']).toBe(THE_PAGE_POLICY)
    expect(res.body).toContain(sayInEnglish('sb.word.tooMuchText'))
    // IT IS A SENTENCE, NOT A PIECE OF THE DOCUMENT.
    expect(res.body.length).toBeLessThan(20_000)
    expect(res.body).not.toContain('xxxxxxxxxx')
  })

  it('refuses bytes that are not a Word document with its sentence', async () => {
    const res = await ask(named.notword, '&open=1&shown=1')
    expect(res.statusCode, res.body.slice(0, 300)).toBe(415)
    expect(res.body).toContain(sayInEnglish('sb.word.notAWord'))
    expect(res.body).not.toContain('not a zip')
  })
})
