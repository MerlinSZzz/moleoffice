// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORD DOCUMENT READ AS BLOCKS, AND A TEXT FILE READ AS ITS TEXT, FOR THE OFFICE'S PAGE TO DRAW.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ONE FILE OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * The file door decides what may be read and which record names it. This file is about one format:
 * what a .docx holds and which of it a reader can see. It imports no package. A .docx is a ZIP, Node
 * ships zlib, and a WordprocessingML document is a small enough vocabulary to read with one scanner.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT READS, AND WHAT IT LEAVES OUT
 * ---------------------------------------------------------------------------------------
 *
 * Headings, paragraphs, bold and italic runs, line breaks and tabs, bullet and decimal lists, and
 * tables. Pictures are not decoded, and the answer says when the document had any. A field's
 * instruction text, deleted text and section properties are left out. A link's words are kept as
 * words; its address is never read, so nothing on the page can follow it.
 *
 * ---------------------------------------------------------------------------------------
 * NO MARKUP LEAVES THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * The answer is data in the shape src/shared/shown-file.ts names: blocks that hold runs of plain
 * text. No HTML is made here, and none of the document's own markup is passed on. The page draws
 * each run as text, so a document that contains `<script>alert(1)</script>` shows exactly those
 * characters and creates no element.
 *
 * ---------------------------------------------------------------------------------------
 * THE REFUSALS, AND WHY THEY REFUSE RATHER THAN GUESS
 * ---------------------------------------------------------------------------------------
 *
 * Encrypted entries, ZIP64, central-directory sizes that disagree with the bytes, a CRC that does
 * not match, a document.xml over 8 MB, more than 40 MB of uncompressed entries, more than 4,000
 * entries, and any document type or entity declaration are refused with a sentence. A truncated or
 * guessed document is a different document presented as this one. The door refuses a file over its
 * own limit before any of it is read here.
 */

import { inflateRawSync } from 'node:zlib'
import { sayInEnglish } from '@shared/i18n.ts'
import type { ShownBlock, ShownRun } from '@shared/shown-file.ts'
import { PanelError } from './panel-error.ts'
import { crc32 } from './zip-export/zip.ts'

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

// ============================================================================ what the page draws

/**
 * A block as it is read, before the list items in one container are gathered into lists. An item
 * keeps its kind and level until then.
 */
type ReadBlock =
  | Exclude<ShownBlock, { kind: 'list' }>
  | { kind: 'item'; ordered: boolean; level: number; runs: ShownRun[] }

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

function runsIn(node: XmlNode): ShownRun[] {
  const runs: ShownRun[] = []
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

function paragraphBlock(node: XmlNode, numbering: Map<string, boolean>, styles: Map<string, WordStyle>): ReadBlock | null {
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
  const numPr = properties === null ? null : childNamed(properties, 'numPr')
  let list: { ordered: boolean; level: number } | null = null
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
  if (runs.length === 0 && list === null) return null
  if (heading !== null) return { kind: 'heading', level: heading, runs }
  if (list !== null) return { kind: 'item', ordered: list.ordered, level: list.level, runs }
  return { kind: 'paragraph', runs }
}

function tableBlock(node: XmlNode, numbering: Map<string, boolean>, styles: Map<string, WordStyle>): Extract<ShownBlock, { kind: 'table' }> | null {
  const rows: { cells: { span: number; blocks: ShownBlock[] }[] }[] = []
  for (const row of childrenNamed(node, 'tr')) {
    const cells: { span: number; blocks: ShownBlock[] }[] = []
    for (const cell of childrenNamed(row, 'tc')) {
      const properties = childNamed(cell, 'tcPr')
      const grid = properties === null ? null : childNamed(properties, 'gridSpan')
      const across = grid === null ? 1 : Number(attribute(grid, 'val') ?? '1')
      const span = Number.isSafeInteger(across) && across > 1 && across < 100 ? across : 1
      cells.push({ span, blocks: gathered(blocksOf(cell, numbering, styles)) })
    }
    if (cells.length > 0) rows.push({ cells })
  }
  return rows.length === 0 ? null : { kind: 'table', rows }
}

/** Paragraphs and tables in one container, descending through the wrappers Word puts around them. */
function blocksOf(node: XmlNode, numbering: Map<string, boolean>, styles: Map<string, WordStyle>): ReadBlock[] {
  const blocks: ReadBlock[] = []
  for (const child of node.children) {
    if (typeof child === 'string') continue
    if (child.name === 'p') {
      const paragraph = paragraphBlock(child, numbering, styles)
      if (paragraph !== null) blocks.push(paragraph)
    } else if (child.name === 'tbl') {
      const table = tableBlock(child, numbering, styles)
      if (table !== null) blocks.push(table)
    } else if (
      child.name === 'sdt' || child.name === 'sdtContent' || child.name === 'customXml' ||
      child.name === 'ins' || child.name === 'smartTag'
    ) {
      blocks.push(...blocksOf(child, numbering, styles))
    }
  }
  return blocks
}

/** The items of one container gathered into lists: items next to each other, of one kind, are one list. */
function gathered(read: ReadBlock[]): ShownBlock[] {
  const blocks: ShownBlock[] = []
  let open: Extract<ShownBlock, { kind: 'list' }> | null = null
  for (const block of read) {
    if (block.kind !== 'item') {
      open = null
      blocks.push(block)
      continue
    }
    if (open === null || open.ordered !== block.ordered) {
      open = { kind: 'list', ordered: block.ordered, items: [] }
      blocks.push(open)
    }
    open.items.push({ level: block.level, runs: block.runs })
  }
  return blocks
}

// ============================================================================ the two answers

/** A Word document's blocks, and whether it held a picture this reader leaves out. */
export function wordDocumentBlocks(bytes: Buffer): { blocks: ShownBlock[]; picturesLeftOut: boolean } {
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
  return { blocks: gathered(blocksOf(body, numbering, styles)), picturesLeftOut: containsPictures(body) }
}

/** A text file's text, whole, or a refusal when it is not UTF-8. A byte order mark is not its text. */
export function textFileText(bytes: Buffer): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new PanelError(sayInEnglish('sb.word.notText'), 415)
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text
}
