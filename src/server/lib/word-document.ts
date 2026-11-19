// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORD DOCUMENT READ AS BLOCKS, AND DRAWN AS ONE SAFE HTML PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ONE FILE OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * The file door decides what may be read and which record names it. This file is about one format:
 * what a .docx holds, which of it a reader can see, and how to put it into a page without letting
 * the file's own markup become the page. It imports no package. A .docx is a ZIP, Node ships zlib,
 * and a WordprocessingML document is a small enough vocabulary to read with one scanner.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT READS, AND WHAT IT LEAVES OUT
 * ---------------------------------------------------------------------------------------
 *
 * Headings, paragraphs, bold and italic runs, line breaks and tabs, bullet and decimal lists, and
 * tables. Pictures are not decoded, and the page says so when the document had any. A field's
 * instruction text, deleted text and section properties are left out. Every character of the
 * document's text is escaped before it enters the page, so a document that contains
 * `<script>alert(1)</script>` shows exactly those characters and creates no element.
 *
 * ---------------------------------------------------------------------------------------
 * THE REFUSALS, AND WHY THEY REFUSE RATHER THAN GUESS
 * ---------------------------------------------------------------------------------------
 *
 * Encrypted entries, ZIP64, central-directory sizes that disagree with the bytes, a CRC that does
 * not match, a document.xml over 8 MB, more than 40 MB of uncompressed entries, more than 4,000
 * entries, and any document type or entity declaration are refused with a sentence. A truncated or
 * guessed document is a different document presented as this one.
 *
 * The page it produces has no script and no address of its own: `THE_GENERATED_PAGE_POLICY` allows inline
 * styles and nothing else, and the caller puts it in a frame with an empty sandbox. The page is the
 * whole file and nothing but the file: no record, no person and no office is named on it.
 */

import { inflateRawSync } from 'node:zlib'
import { sayInEnglish } from '@shared/i18n.ts'
import { PanelError } from './panel-error.ts'
import { crc32 } from './zip-export/zip.ts'

/**
 * What a generated page may do: draw its own words and styles and nothing else. It is stated here
 * because every generated page has the same promise, and the file door reads this constant.
 */
export const THE_GENERATED_PAGE_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

/** The most a generated page's body may be before the file is refused rather than cut. */
const MOST_GENERATED_PAGE_BYTES = 25 * 1024 * 1024
/** How many elements a document may hold, so a tiny archive cannot become a huge tree. */
const MOST_XML_NODES = 500_000
const MOST_XML_DEPTH = 512

const MOST_UNCOMPRESSED_BYTES = 40 * 1024 * 1024
const MOST_DOCUMENT_BYTES = 8 * 1024 * 1024
const MOST_OTHER_PART_BYTES = 2 * 1024 * 1024
const MOST_ENTRIES = 4_000
const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_RECORD = 0x06054b50

/** The MIME type of the page a generated type is answered as. */
export const THE_GENERATED_PAGE_TYPE = 'text/html; charset=utf-8'

/** The one place text becomes HTML text. Every caller that has a person's words goes through it. */
export function escapedForHtml(text: string): string {
  return text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

/**
 * THE PAGE A READER SEES WHEN A DOCUMENT IS REFUSED. The sentence is the refusal's own, escaped, so
 * the frame shows the reason instead of a download or a blank rectangle.
 */
export function theRefusalPage(sentence: string): string {
  return thePage('', `<div class="word-refusal" lang="en">${escapedForHtml(sentence)}</div>`)
}

/** The whole generated page, with one inline stylesheet and no script of any kind. */
function thePage(title: string, body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light">
<title>${escapedForHtml(title)}</title>
<style>
  body { margin: 0; padding: 28px 24px 44px; background: #fbfaf7; color: #24201a;
    font: 16px/1.55 Georgia, 'Times New Roman', serif; }
  main { max-width: 54rem; margin: 0 auto; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.2; margin: 1.5em 0 0.45em; }
  h1 { font-size: 1.9rem; } h2 { font-size: 1.55rem; } h3 { font-size: 1.3rem; }
  h4 { font-size: 1.15rem; } h5, h6 { font-size: 1rem; }
  p { margin: 0.55em 0; }
  strong { font-weight: 700; } em { font-style: italic; }
  ul, ol { margin: 0.5em 0 0.7em 1.6em; padding: 0; }
  li { margin: 0.22em 0; }
  table { border-collapse: collapse; width: 100%; margin: 0.9em 0; font-size: 0.95rem; }
  th, td { border: 1px solid #b9b1a4; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #efe9de; }
  pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere;
    font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .word-note { margin-top: 2.4em; padding-top: 0.8em; border-top: 1px solid #d8d0c3; color: #6b5d4a;
    font-size: 0.9rem; }
  .word-refusal { max-width: 42rem; margin: 10vh auto 0; padding: 18px 20px; border: 1px solid #b9b1a4;
    border-radius: 8px; background: #fff; font: 16px/1.55 system-ui, sans-serif; }
  .word-list-level-1 { margin-left: 1.2em; } .word-list-level-2 { margin-left: 2.4em; }
  .word-list-level-3 { margin-left: 3.6em; } .word-list-level-4 { margin-left: 4.8em; }
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`
}

// ============================================================================ the zip

interface ZipPart {
  name: string
  method: number
  crc: number
  compressed: number
  uncompressed: number
  localAt: number
}

function refusal(key: Parameters<typeof sayInEnglish>[0], status: number): PanelError {
  return new PanelError(sayInEnglish(key), status)
}

function readU32(bytes: Buffer, at: number): number {
  return bytes.readUInt32LE(at)
}

function readU16(bytes: Buffer, at: number): number {
  return bytes.readUInt16LE(at)
}

/**
 * The central directory of a ZIP, read without trusting a local header's lengths to decide anything.
 * Every size it reads is checked against the bytes that are really there before an entry is used.
 */
function thePartsOf(bytes: Buffer): Map<string, ZipPart> {
  if (bytes.length < 22) throw refusal('sb.word.notAWord', 415)
  let end = -1
  const earliest = Math.max(0, bytes.length - 22 - 0xffff)
  for (let at = bytes.length - 22; at >= earliest; at--) {
    if (readU32(bytes, at) !== END_RECORD) continue
    const comment = readU16(bytes, at + 20)
    if (at + 22 + comment === bytes.length) { end = at; break }
  }
  if (end < 0) throw refusal('sb.word.notAWord', 415)
  if (readU16(bytes, end + 4) !== 0 || readU16(bytes, end + 6) !== 0) throw refusal('sb.word.multiDisk', 415)
  const onThisDisk = readU16(bytes, end + 8)
  const entries = readU16(bytes, end + 10)
  const centralSize = readU32(bytes, end + 12)
  const centralAt = readU32(bytes, end + 16)
  if (entries === 0xffff || centralSize === 0xffffffff || centralAt === 0xffffffff) throw refusal('sb.word.zip64', 415)
  if (entries !== onThisDisk) throw refusal('sb.word.multiDisk', 415)
  if (entries > MOST_ENTRIES) throw refusal('sb.word.tooManyParts', 415)
  if (centralAt + centralSize > bytes.length) throw refusal('sb.word.notAWord', 415)

  const parts = new Map<string, ZipPart>()
  let totalUncompressed = 0
  let at = centralAt
  for (let index = 0; index < entries; index++) {
    if (at + 46 > bytes.length || readU32(bytes, at) !== CENTRAL_HEADER) throw refusal('sb.word.notAWord', 415)
    const flags = readU16(bytes, at + 8)
    const method = readU16(bytes, at + 10)
    const crc = readU32(bytes, at + 16)
    const compressed = readU32(bytes, at + 20)
    const uncompressed = readU32(bytes, at + 24)
    const nameLength = readU16(bytes, at + 28)
    const extraLength = readU16(bytes, at + 30)
    const commentLength = readU16(bytes, at + 32)
    const localAt = readU32(bytes, at + 42)
    const nameAt = at + 46
    if (nameAt + nameLength + extraLength + commentLength > bytes.length) throw refusal('sb.word.notAWord', 415)
    const name = bytes.toString('utf8', nameAt, nameAt + nameLength)
    at = nameAt + nameLength + extraLength + commentLength

    if ((flags & 0x1) !== 0) throw refusal('sb.word.encrypted', 415)
    if (compressed === 0xffffffff || uncompressed === 0xffffffff || localAt === 0xffffffff) throw refusal('sb.word.zip64', 415)
    if (method !== 0 && method !== 8) throw refusal('sb.word.notAWord', 415)
    if (name.includes('\\') || name.startsWith('/') || name.split('/').includes('..') || name.includes('\0')) {
      throw refusal('sb.word.unfitPart', 415)
    }
    totalUncompressed += uncompressed
    if (totalUncompressed > MOST_UNCOMPRESSED_BYTES) throw refusal('sb.word.tooMuchText', 413)
    if (name === 'word/document.xml' || name === 'word/numbering.xml' || name === 'word/styles.xml') {
      parts.set(name, { name, method, crc, compressed, uncompressed, localAt })
    }
  }
  if (!parts.has('word/document.xml')) throw refusal('sb.word.notAWord', 415)
  return parts
}

function theBytesOf(bytes: Buffer, part: ZipPart): Buffer {
  const at = part.localAt
  if (at + 30 > bytes.length || readU32(bytes, at) !== LOCAL_HEADER) throw refusal('sb.word.notAWord', 415)
  const nameLength = readU16(bytes, at + 26)
  const extraLength = readU16(bytes, at + 28)
  const dataAt = at + 30 + nameLength + extraLength
  if (dataAt + part.compressed > bytes.length) throw refusal('sb.word.notAWord', 415)
  const packed = bytes.subarray(dataAt, dataAt + part.compressed)
  let whole: Buffer
  try {
    whole = part.method === 0
      ? Buffer.from(packed)
      : inflateRawSync(packed, { maxOutputLength: part.name === 'word/document.xml' ? MOST_DOCUMENT_BYTES : MOST_OTHER_PART_BYTES })
  } catch {
    throw refusal('sb.word.tooMuchText', 413)
  }
  if (whole.length !== part.uncompressed || crc32(whole) !== part.crc) throw refusal('sb.word.notAWord', 415)
  return whole
}

// ============================================================================ the xml

interface XmlNode {
  name: string
  attrs: Map<string, string>
  children: (XmlNode | string)[]
}

/** The local name after any namespace prefix, so a document with another prefix still reads. */
function localName(name: string): string {
  const colon = name.lastIndexOf(':')
  return colon === -1 ? name : name.slice(colon + 1)
}

/** One attribute by its local name, whichever prefix it was written with. */
function attribute(node: XmlNode, name: string): string | null {
  for (const [key, value] of node.attrs) if (localName(key) === name) return value
  return null
}

function childNamed(node: XmlNode, name: string): XmlNode | null {
  for (const child of node.children) if (typeof child !== 'string' && child.name === name) return child
  return null
}

function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((child): child is XmlNode => typeof child !== 'string' && child.name === name)
}

/**
 * THE FIVE NAMED ENTITIES AND NUMERIC REFERENCES, and nothing else. A sequence this does not know
 * stays exactly as it was written, which the page then escapes. That is how `a & b` and `&madeup;`
 * both show as themselves rather than disappearing.
 */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/gu, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    switch (body) {
      case 'amp': return '&'
      case 'lt': return '<'
      case 'gt': return '>'
      case 'quot': return '"'
      case 'apos': return "'"
      default: return whole
    }
  })
}

/**
 * A DOCUMENT TYPE OR ENTITY DECLARATION IS REFUSED BEFORE THE SCANNER SEES IT. Neither is needed by
 * a Word document, and both are the door to a parser expansion this reader does not perform.
 */
function parseXml(text: string, wanted = 'document'): XmlNode {
  if (/<!DOCTYPE/iu.test(text) || /<!ENTITY/iu.test(text)) throw refusal('sb.word.definitionRefused', 415)
  let at = 0
  const root: XmlNode = { name: '#root', attrs: new Map(), children: [] }
  const stack: XmlNode[] = [root]
  const current = (): XmlNode => stack[stack.length - 1] as XmlNode
  let nodes = 0
  while (at < text.length) {
    const open = text.indexOf('<', at)
    if (open === -1) {
      const tail = text.slice(at)
      if (tail !== '') current().children.push(decodeEntities(tail))
      break
    }
    if (open > at) current().children.push(decodeEntities(text.slice(at, open)))
    if (text.startsWith('<!--', open)) {
      const close = text.indexOf('-->', open + 4)
      if (close === -1) throw refusal('sb.word.notAWord', 415)
      at = close + 3
      continue
    }
    if (text.startsWith('<![CDATA[', open)) {
      const close = text.indexOf(']]>', open + 9)
      if (close === -1) throw refusal('sb.word.notAWord', 415)
      current().children.push(text.slice(open + 9, close))
      at = close + 3
      continue
    }
    if (text.startsWith('<?', open)) {
      const close = text.indexOf('?>', open + 2)
      if (close === -1) throw refusal('sb.word.notAWord', 415)
      at = close + 2
      continue
    }
    if (text.startsWith('<!', open)) throw refusal('sb.word.definitionRefused', 415)
    const close = text.indexOf('>', open + 1)
    if (close === -1) throw refusal('sb.word.notAWord', 415)
    const body = text.slice(open + 1, close)
    if (body.startsWith('/')) {
      const name = localName(body.slice(1).trim())
      if (stack.length === 1 || current().name !== name) throw refusal('sb.word.notAWord', 415)
      stack.pop()
      at = close + 1
      continue
    }
    const selfClosing = body.endsWith('/')
    const inner = selfClosing ? body.slice(0, -1) : body
    const space = inner.search(/[\s]/u)
    const name = localName((space === -1 ? inner : inner.slice(0, space)).trim())
    if (name === '') throw refusal('sb.word.notAWord', 415)
    const attrs = new Map<string, string>()
    if (space !== -1) {
      const rest = inner.slice(space)
      const pattern = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/gu
      for (const found of rest.matchAll(pattern)) {
        attrs.set(found[1] as string, decodeEntities(found[3] ?? found[4] ?? ''))
      }
    }
    nodes++
    if (nodes > MOST_XML_NODES || stack.length >= MOST_XML_DEPTH) throw refusal('sb.word.notAWord', 415)
    const node: XmlNode = { name, attrs, children: [] }
    current().children.push(node)
    if (!selfClosing) stack.push(node)
    at = close + 1
  }
  if (stack.length !== 1) throw refusal('sb.word.notAWord', 415)
  const document = childNamed(root, wanted)
  if (document === null) throw refusal('sb.word.notAWord', 415)
  return document
}

// ============================================================================ what the page shows

interface Run {
  text: string
  bold: boolean
  italic: boolean
}

interface Block {
  html: string
  list: { ordered: boolean; level: number } | null
}

/** Whether an element with this local name is on (Word writes `<w:b/>` or `<w:b w:val="0"/>`). */
function isOn(node: XmlNode): boolean {
  const value = attribute(node, 'val')
  return value === null || !(value === '0' || value.toLowerCase() === 'false' || value.toLowerCase() === 'off')
}

function containsPictures(node: XmlNode): boolean {
  for (const child of node.children) {
    if (typeof child === 'string') continue
    if (child.name === 'drawing' || child.name === 'pict' || child.name === 'object') return true
    if (containsPictures(child)) return true
  }
  return false
}

function textOfRun(node: XmlNode): string {
  let text = ''
  for (const child of node.children) {
    if (typeof child === 'string') continue
    if (child.name === 't') {
      for (const piece of child.children) if (typeof piece === 'string') text += piece
    } else if (child.name === 'tab') {
      text += '\t'
    } else if (child.name === 'br' || child.name === 'cr') {
      text += '\n'
    } else if (child.name !== 'delText' && child.name !== 'instrText' && child.name !== 'rPr') {
      text += textOfRun(child)
    }
  }
  return text
}

function runsIn(node: XmlNode): Run[] {
  const runs: Run[] = []
  for (const child of node.children) {
    if (typeof child === 'string') continue
    if (child.name === 'r') {
      const properties = childNamed(child, 'rPr')
      const bold = properties !== null && childrenNamed(properties, 'b').some(isOn)
      const italic = properties !== null && childrenNamed(properties, 'i').some(isOn)
      const text = textOfRun(child)
      if (text !== '') runs.push({ text, bold, italic })
    } else if (child.name !== 'pPr' && child.name !== 'rPr') {
      runs.push(...runsIn(child))
    }
  }
  return runs
}

function inlineHtml(runs: Run[]): string {
  return runs
    .map((run) => {
      let text = escapedForHtml(run.text).replace(/\t/gu, '    ').replace(/\n/gu, '<br>')
      if (text === '') return ''
      if (run.bold) text = `<strong>${text}</strong>`
      if (run.italic) text = `<em>${text}</em>`
      return text
    })
    .join('')
}

function theHeading(style: string | null): number | null {
  if (style === null) return null
  if (/^Title$/iu.test(style)) return 1
  const heading = /^Heading\s*([1-9])$/iu.exec(style)
  return heading === null ? null : Number(heading[1])
}

interface WordStyle {
  /** The style's own name, which Word writes as `heading 1` whatever language the UI is in. */
  name: string | null
  /** Its outline level, where 0 is heading 1 and 9 is body text. */
  outline: number | null
}

/** The paragraph styles by styleId, so a heading can be found by its name or outline, not only its id. */
function theStyles(root: XmlNode | null): Map<string, WordStyle> {
  const styles = new Map<string, WordStyle>()
  if (root === null) return styles
  for (const style of childrenNamed(root, 'style')) {
    const id = attribute(style, 'styleId')
    if (id === null) continue
    const nameNode = childNamed(style, 'name')
    const properties = childNamed(style, 'pPr')
    const outlineNode = properties === null ? null : childNamed(properties, 'outlineLvl')
    const outlineValue = outlineNode === null ? null : Number(attribute(outlineNode, 'val') ?? '')
    const outline = outlineValue !== null && Number.isSafeInteger(outlineValue) && outlineValue >= 0 && outlineValue <= 8
      ? outlineValue : null
    styles.set(id, { name: nameNode === null ? null : attribute(nameNode, 'val'), outline })
  }
  return styles
}

/**
 * A heading by its style id, then by what styles.xml says that id is: Word in Chinese writes ids
 * such as `1`, and styles.xml is where the id is mapped to `heading 1` or to outline level 0.
 */
function theHeadingIn(style: string | null, styles: Map<string, WordStyle>): number | null {
  const direct = theHeading(style)
  if (direct !== null) return direct
  if (style === null) return null
  const described = styles.get(style)
  if (described === undefined) return null
  if (described.name !== null) {
    const named = /^heading\s*([1-9])$/iu.exec(described.name.trim())
    if (named !== null) return Number(named[1])
  }
  return described.outline === null ? null : described.outline + 1
}

/** The numbering's kind, by numId and level, from numbering.xml; bullets when nothing says otherwise. */
function theNumbering(root: XmlNode | null): Map<string, boolean> {
  const ordered = new Map<string, boolean>()
  if (root === null) return ordered
  const abstracts = new Map<string, Map<string, boolean>>()
  for (const abstract of childrenNamed(root, 'abstractNum')) {
    const id = attribute(abstract, 'abstractNumId')
    if (id === null) continue
    const levels = new Map<string, boolean>()
    for (const level of childrenNamed(abstract, 'lvl')) {
      const at = attribute(level, 'ilvl')
      const format = childNamed(level, 'numFmt')
      if (at === null || format === null) continue
      const kind = attribute(format, 'val') ?? ''
      levels.set(at, !/^(bullet|none)$/iu.test(kind))
    }
    abstracts.set(id, levels)
  }
  for (const num of childrenNamed(root, 'num')) {
    const id = attribute(num, 'numId')
    const abstract = childNamed(num, 'abstractNumId')
    const abstractId = abstract === null ? null : attribute(abstract, 'val')
    if (id === null || abstractId === null) continue
    const levels = abstracts.get(abstractId)
    if (levels === undefined) continue
    for (const [level, isOrdered] of levels) ordered.set(`${id}:${level}`, isOrdered)
  }
  return ordered
}

function paragraphBlock(node: XmlNode, numbering: Map<string, boolean>, styles: Map<string, WordStyle>): Block | null {
  const properties = childNamed(node, 'pPr')
  const styleNode = properties === null ? null : childNamed(properties, 'pStyle')
  const style = styleNode === null ? null : attribute(styleNode, 'val')
  let heading = theHeadingIn(style, styles)
  if (heading === null && properties !== null) {
    const outlineNode = childNamed(properties, 'outlineLvl')
    const outline = outlineNode === null ? Number.NaN : Number(attribute(outlineNode, 'val') ?? '')
    if (Number.isSafeInteger(outline) && outline >= 0 && outline <= 8) heading = outline + 1
  }
  const runs = runsIn(node)
  const inline = inlineHtml(runs)
  const numPr = properties === null ? null : childNamed(properties, 'numPr')
  let list: Block['list'] = null
  if (numPr !== null && heading === null) {
    const numIdNode = childNamed(numPr, 'numId')
    const levelNode = childNamed(numPr, 'ilvl')
    const numId = numIdNode === null ? null : attribute(numIdNode, 'val')
    const level = Number(levelNode === null ? '0' : attribute(levelNode, 'val') ?? '0')
    if (numId !== null) {
      list = { ordered: numbering.get(`${numId}:${String(Number.isSafeInteger(level) ? level : 0)}`) ?? false,
        level: Number.isSafeInteger(level) && level >= 0 && level < 9 ? level : 0 }
    }
  }
  if (inline === '' && list === null) return null
  if (heading !== null) return { html: `<h${String(heading)}>${inline}</h${String(heading)}>`, list: null }
  return { html: `<p>${inline}</p>`, list }
}

function tableHtml(node: XmlNode, numbering: Map<string, boolean>, styles: Map<string, WordStyle>): string {
  const rows: string[] = []
  for (const row of childrenNamed(node, 'tr')) {
    const cells: string[] = []
    for (const cell of childrenNamed(row, 'tc')) {
      const inner: string[] = []
      for (const block of blocksOf(cell, numbering, styles)) {
        if (block.list !== null) {
          const words = block.html.replace(/^<p>|<\/p>$/gu, '')
          inner.push(`<p class="word-list-level-${String(block.list.level)}">${words}</p>`)
        } else {
          inner.push(block.html)
        }
      }
      const span = childNamed(cell, 'tcPr')
      const grid = span === null ? null : childNamed(span, 'gridSpan')
      const colspan = grid === null ? null : Number(attribute(grid, 'val') ?? '1')
      const across = Number.isSafeInteger(colspan) && colspan !== null && colspan > 1 && colspan < 100
        ? ` colspan="${String(colspan)}"` : ''
      cells.push(`<td${across}>${inner.join('')}</td>`)
    }
    if (cells.length > 0) rows.push(`<tr>${cells.join('')}</tr>`)
  }
  return rows.length === 0 ? '' : `<table><tbody>${rows.join('')}</tbody></table>`
}

/** Paragraphs and tables in one container, descending through the wrappers Word puts around them. */
function blocksOf(node: XmlNode, numbering: Map<string, boolean>, styles: Map<string, WordStyle>): Block[] {
  const blocks: Block[] = []
  for (const child of node.children) {
    if (typeof child === 'string') continue
    if (child.name === 'p') {
      const paragraph = paragraphBlock(child, numbering, styles)
      if (paragraph !== null) blocks.push(paragraph)
    } else if (child.name === 'tbl') {
      const table = tableHtml(child, numbering, styles)
      if (table !== '') blocks.push({ html: table, list: null })
    } else if (
      child.name === 'sdt' || child.name === 'sdtContent' || child.name === 'customXml' ||
      child.name === 'ins' || child.name === 'smartTag'
    ) {
      blocks.push(...blocksOf(child, numbering, styles))
    }
  }
  return blocks
}

function blocksAsHtml(blocks: Block[]): string {
  let html = ''
  let open: Block['list'] = null
  const close = (): void => {
    if (open !== null) html += open.ordered ? '</ol>' : '</ul>'
    open = null
  }
  for (const block of blocks) {
    if (block.list !== null) {
      if (open === null || open.ordered !== block.list.ordered) {
        close()
        html += block.list.ordered ? '<ol>' : '<ul>'
        open = block.list
      }
      html += `<li class="word-list-level-${String(block.list.level)}">${block.html.replace(/^<p>|<\/p>$/gu, '')}</li>`
    } else {
      close()
      html += block.html
    }
  }
  close()
  return html
}

// ============================================================================ the two pages

/**
 * THE WORD DOCUMENT AS ONE PAGE. `limit` is the door's own limit for a file shown whole; a document
 * over it is refused before the ZIP is read, so the page a reader gets is whole or is a sentence.
 */
export function wordDocumentPage(bytes: Buffer, name: string, limit: number): string {
  if (bytes.length > limit) throw new PanelError(sayInEnglish('sb.file.tooLargeToShow', { limit }), 413)
  const parts = thePartsOf(bytes)
  const documentBytes = theBytesOf(bytes, parts.get('word/document.xml') as ZipPart)
  const documentText = documentBytes.toString('utf8')
  const document = parseXml(documentText)
  const numberingPart = parts.get('word/numbering.xml')
  const numbering = theNumbering(numberingPart === undefined ? null : parseXml(theBytesOf(bytes, numberingPart).toString('utf8'), 'numbering'))
  const stylesPart = parts.get('word/styles.xml')
  const styles = theStyles(stylesPart === undefined ? null : parseXml(theBytesOf(bytes, stylesPart).toString('utf8'), 'styles'))
  const body = childNamed(document, 'body')
  if (body === null) throw refusal('sb.word.notAWord', 415)
  const blocks = blocksOf(body, numbering, styles)
  const shown = blocksAsHtml(blocks)
  const pictures = containsPictures(body)
  const note = pictures ? `<p class="word-note" lang="en">${escapedForHtml(sayInEnglish('sb.word.picturesLeftOut'))}</p>` : ''
  if (shown === '' && note === '') {
    return aPageThatFits(thePage(name, `<p class="word-note" lang="en">${escapedForHtml(sayInEnglish('sb.word.nothingToShow'))}</p>`))
  }
  return aPageThatFits(thePage(name, shown + note))
}

/** Refuse rather than hand back a page larger than the door will show. */
function aPageThatFits(page: string): string {
  if (Buffer.byteLength(page, 'utf8') > MOST_GENERATED_PAGE_BYTES) {
    throw new PanelError(sayInEnglish('sb.file.tooLargeToShow', { limit: MOST_GENERATED_PAGE_BYTES }), 413)
  }
  return page
}

/** A text file as one escaped page. The whole file or a sentence, never a cut one. */
export function textFilePage(bytes: Buffer, name: string, limit: number): string {
  if (bytes.length > limit) throw new PanelError(sayInEnglish('sb.file.tooLargeToShow', { limit }), 413)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new PanelError(sayInEnglish('sb.word.notText'), 415)
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return aPageThatFits(thePage(name, `<pre>${escapedForHtml(text)}</pre>`))
}
