// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT SAVED AS ONE HTML FILE.
 *
 * The press in a report's head (src/web/components/ReportExport.tsx) hands this file the element the report's blocks
 * are drawn in, the record, and the page's document. This file answers the text of one HTML file and the name to save
 * it under, or the sentence that says why it made none. It writes nothing to the office.
 *
 * WHAT THE FILE HOLDS. The blocks as the page draws them now, inside a copy of the elements around them, under a
 * heading of the report's title. The page's whole style is written into one style element. Every picture, video,
 * sound and file of the report is inside the file as a data: address, read again from the file door.
 *
 * WHAT IT HOLDS NONE OF. No script, and nothing that runs or takes input. No id outside a drawing, and no data
 * attribute the style does not read. None of the marks the comment and agent layers put on the blocks, and not the
 * office's reading-length control. No address of this office or of this machine: a link to one becomes its words,
 * and anything else that would load one stops the file.
 *
 * A REFUSAL SAVES NOTHING. A file that cannot be read, a style sheet that cannot be read, and a part that cannot be
 * copied each stop the whole file, with a sentence that names what stopped it.
 *
 * THE COPY IS MADE IN A DOCUMENT OF ITS OWN, which shows nothing and loads nothing. A copy made in the page's own
 * document would ask the door for every video it holds as soon as it was made.
 *
 * THE SAME FILE IS MADE IN TWO FORMS. The HTML form is the file a person saves. The PDF form is the page the office's
 * PDF door prints, and paper cannot play or save anything. So in the PDF form a video is a picture of its first frame
 * followed by its name, a sound is its name, and a file's save link is its name. Everything else is the same.
 */
import { t } from '@shared/i18n.ts'
import { parseRegionId } from '@shared/regions.ts'
import { DRAWN_FROM_ATTRIBUTE } from '@shared/targets.ts'
import { moleOfficeHeaders } from '../api.ts'
import { ROOM_ATTRIBUTE } from '../components/agent/CommentCircle.tsx'
import { LANDED_ON } from '../components/agent/original.ts'
import { isBrowserLoadable, previewUrl, readPreviewError, readPreviewReason } from '../components/SummaryBlocks.tsx'
import { theHoldOnThisRequest } from './the-device-half.ts'
import { whatARequestCarries, whereRequestsGo } from './visiting.ts'

/** The record a file is made of: its id, which the file door checks; its title; and its stored data, where each block is read. */
export interface TheReportSaved {
  id: string
  title: string
  data: Record<string, unknown>
}

/** The file's text and the name it is saved under, or the sentence that says why there is no file. */
export type TheFileOrWhyNot = { ok: true; text: string; name: string } | { ok: false; said: string }

/** Which form of the file is made: the HTML file a person saves, or the page the PDF door prints. */
export type TheForm = 'html' | 'pdf'

/** Why no file was made. Thrown inside this file, and caught in one place, `theReportAsOneFile`. */
class NotSaved extends Error {}

/** One file read whole: its data: address, and its type without the parameters. */
interface ReadWhole {
  address: string
  type: string
}

const SVG = 'http://www.w3.org/2000/svg'
const HTML = 'http://www.w3.org/1999/xhtml'

/** The attributes on the page's root that carry its theme. The file's root carries them under the rule for data attributes. */
const THE_THEME_ATTRIBUTES = ['data-theme', 'data-theme-from', 'data-boot-theme', 'data-size', 'data-density', 'data-radius', 'data-font']

/**
 * ATTRIBUTES NO ELEMENT OF THE FILE KEEPS, besides every `on…` and every id outside a drawing. They name other
 * elements by their ids, take input, or move the focus. The ids are gone, and nothing in the file takes input.
 */
const NEVER_KEPT = new Set([
  'tabindex', 'contenteditable', 'draggable', 'autofocus', 'accesskey', 'for', 'form', 'name',
  'aria-controls', 'aria-owns', 'aria-describedby', 'aria-labelledby', 'aria-activedescendant', 'aria-details',
  'aria-errormessage', 'aria-flowto',
])

/** Elements the file never holds, with all they hold. A style element's rules are in the file's one style already. */
const NEVER_HELD = 'script, noscript, template, link, base, iframe, object, embed, style'

/** The reading-length control goes whole: it is the office's control, and without its presses its label says nothing. */
const READING_LENGTH = '.sb-level'

/** The links beside a picture, a video and a sound that save it from the door. The file holds the thing itself. */
const SAVE_LINKS = 'a.sb-picture-save, a.sb-video-save'

/** What holds a report's file on the page: a picture, a player, the stand drawn before it is loaded, and a file's save link. */
const MEDIA = 'img, video, audio, source, .sb-image-stand, a.sb-file-save'

/**
 * THE STANDS THAT ARE REPLACED BY WHAT THEY STAND FOR: a medium the person's choice holds back, and one not asked for
 * yet. A stand that says a file was refused, is missing, or is not played is what the page shows, and stays as its words.
 */
const NOT_YET_LOADED = new Set(['held', 'not-asked', 'asking'])

/** Presses, which go with what they hold. A press holding a picture leaves the picture, and a press holding the report's own words leaves them. */
const PRESSES = 'button, [role="button"], input[type="button" i], input[type="submit" i], input[type="reset" i], input[type="image" i]'

/** The places whose presses hold the report's own words: a column head holds a column's name, and a button block's line holds its label. */
const WHERE_PRESSES_HOLD_THE_REPORTS_WORDS = 'th, .rq-press-line'

/** The grip in a column head that changes the column's width. It does nothing in a file with no script, so it goes with the presses. */
const WIDTH_GRIPS = 'span.sb-grab'

/** The attributes that make an element load an address. A style's url() is read as well. */
const LOADING = new Set(['src', 'srcset', 'href', 'poster', 'action', 'formaction', 'ping'])

/** One url() in a style, quoted either way or not at all. */
const URL_IN_STYLE = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)"'\s]*))\s*\)/gi

/** One url() in a drawing's attribute that names an element of the page by its id. */
const AN_ID_IN_A_URL = /url\(\s*["']?#([^"')\s]+)["']?\s*\)/g

/** One attribute selector on a data attribute, with its comparison and value when it has them. */
const DATA_SELECTOR = /\[\s*(data-[\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*(?:[is]\s*)?)?\]/g

/**
 * THE ELEMENT A REPORT'S BLOCKS ARE DRAWN IN, found from the press: the press's article, the one report drawing in it,
 * and the one box of blocks in that. Null when there is not exactly one of each. The report's tag, its byline and its
 * boxes for editing sit beside that box, so they stay out of the file.
 */
export function theDrawnBlocksOf(press: Element): HTMLElement | null {
  const reports = press.closest('article')?.querySelectorAll('.rd-report')
  if (reports === undefined || reports.length !== 1) return null
  const boxes = reports[0]!.querySelectorAll<HTMLElement>('.sb-fit')
  return boxes.length === 1 ? boxes[0]! : null
}

/**
 * THE NAME THE FILE IS SAVED UNDER: the title, with each character a file name may not hold turned into a dash,
 * trimmed, at most 120 characters, then the ending, `.html` or `.pdf`. A title that leaves nothing is saved under the
 * word for a report.
 */
export function theFileNameFor(title: string, ending: TheForm): string {
  const cleaned = title.replace(/[/\\:*?"<>|\u0000-\u001f\u007f-\u009f]/g, '-').trim()
  const name = Array.from(cleaned).slice(0, 120).join('').trim()
  return `${name === '' ? t('reports.export.untitled') : name}.${ending}`
}

/**
 * The report as one HTML file in the form asked for, or why there is none. The name ends as the form does. Only a
 * refusal of this file's own is answered; anything else is thrown.
 */
export async function theReportAsOneFile(blocks: HTMLElement, record: TheReportSaved, page: Document, form: TheForm): Promise<TheFileOrWhyNot> {
  try {
    return { ok: true, text: await theFile(blocks, record, page, form), name: theFileNameFor(record.title, form) }
  } catch (err) {
    if (err instanceof NotSaved) return { ok: false, said: err.message }
    throw err
  }
}

async function theFile(blocks: HTMLElement, record: TheReportSaved, page: Document, form: TheForm): Promise<string> {
  const reads = theReadsFor(record.id, page)
  const pageStyle = await theStyleOf(page, reads)
  const out = page.implementation.createHTMLDocument('')
  const copy = out.importNode(blocks, true)
  // EACH COPY IS PAIRED WITH THE ELEMENT IT WAS COPIED FROM, before anything is changed, so a field's words and a
  // block's place in the record are read from the page itself.
  const lives = everyElementOf(blocks)
  const liveOf = new Map<Element, Element>(everyElementOf(copy).map((one, at) => [one, lives[at]!]))

  if (copy.querySelector('canvas') !== null) throw new NotSaved(t('reports.export.drawing'))
  await putTheFilesInside(copy, liveOf, record, reads, out, form, page)
  for (const one of [...copy.querySelectorAll(`${SAVE_LINKS}, ${NEVER_HELD}, ${READING_LENGTH}`)]) one.remove()
  takeThePressesOut(copy, liveOf, out)
  const style = withTheDrawingsNewIds(pageStyle, renameTheDrawingsIds(copy))
  putItInItsFrame(blocks, copy, record, page, out)
  const root = out.documentElement
  for (const name of ['lang', 'dir', ...THE_THEME_ATTRIBUTES, 'style']) {
    const value = page.documentElement.getAttribute(name)
    if (value !== null) root.setAttribute(name, value)
  }
  out.head.replaceChildren()
  takeTheLayerMarksOff(out.body)
  makeTheAddressesOfHereWords(root, page, out)
  keepWhatTheStyleReads(root, theSelectorsIn(style))

  const charset = out.createElement('meta')
  charset.setAttribute('charset', 'utf-8')
  const title = out.createElement('title')
  title.textContent = theTitleOf(record)
  const sheet = out.createElement('style')
  // A style element ends at the first "</style" in it, even inside a string, so that one is written with an escape.
  sheet.textContent = style.replace(/<\/style/gi, '<\\/style')
  out.head.append(charset, title, sheet)
  return `<!doctype html>\n${root.outerHTML}`
}

function everyElementOf(root: Element): Element[] {
  return [root, ...root.querySelectorAll('*')]
}

function isAnObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function theTitleOf(record: TheReportSaved): string {
  return record.title.trim() === '' ? t('reports.export.untitled') : record.title
}

// ============================================================ reading

/**
 * EVERY READ ONE FILE MAKES, EACH FILE READ ONCE. A report's file is read from the file door as a save, as the page
 * reads it, with the headers every request of the page carries. A file of the page's style is read from where the
 * style names it: the page's own origin is sent the office's headers, and another host is sent none.
 */
function theReadsFor(recordId: string, page: Document) {
  const files = new Map<string, Promise<ReadWhole | string>>()
  const styleFiles = new Map<string, Promise<ReadWhole | null>>()
  return {
    /** One file of the report, or the refusal that names it. */
    async aFile(path: string, name: string): Promise<ReadWhole> {
      let reading = files.get(path)
      if (reading === undefined) {
        reading = aFileOfTheReport(path, recordId, page)
        files.set(path, reading)
      }
      const read = await reading
      if (typeof read === 'string') throw new NotSaved(t('reports.export.fileUnread', { name, reason: read }))
      return read
    },
    /** One file the page's style uses, at its whole address, or the refusal that names it. */
    async aStyleFile(address: string): Promise<ReadWhole> {
      let reading = styleFiles.get(address)
      if (reading === undefined) {
        reading = aFileOfTheStyle(address, page)
        styleFiles.set(address, reading)
      }
      const read = await reading
      if (read === null) throw new NotSaved(t('reports.export.styleFileUnread', { address }))
      return read
    },
  }
}

type TheReads = ReturnType<typeof theReadsFor>

/**
 * ONE FILE OF THE REPORT, or the reason it was not read, in the door's own words when the door gave some. A path the
 * page loads itself, a web address or one beside the page, is read from that address with no office headers.
 */
async function aFileOfTheReport(path: string, recordId: string, page: Document): Promise<ReadWhole | string> {
  const said = path.trim()
  if (/^data:/i.test(said)) return { address: said, type: (said.slice(5).split(/[;,]/)[0] ?? '').toLowerCase() }
  try {
    if (isBrowserLoadable(said)) {
      const answer = await fetch(new URL(said, page.baseURI).href, { credentials: 'omit' })
      return answer.ok ? await asADataAddress(answer) : readPreviewError(answer.status, await answer.text())
    }
    const asked = `${previewUrl(path, recordId)}&download=1`
    const held = theHoldOnThisRequest()
    if (held !== undefined) await held
    const answer = await fetch(whereRequestsGo(asked), { method: 'GET', ...whatARequestCarries(asked, moleOfficeHeaders()) })
    if (answer.ok) return await asADataAddress(answer)
    const body = await answer.text()
    return readPreviewReason(body) ?? readPreviewError(answer.status, body)
  } catch (err) {
    // A REQUEST THAT DID NOT ARRIVE, OR AN ANSWER CUT OFF, is said in the browser's own words inside the refusal.
    return err instanceof Error ? err.message : String(err)
  }
}

/** One file the style uses, or null when it could not be read. The refusal names its address, which is all there is to say. */
async function aFileOfTheStyle(address: string, page: Document): Promise<ReadWhole | null> {
  try {
    const home = new URL(address).origin === new URL(page.baseURI).origin
    if (home) {
      const held = theHoldOnThisRequest()
      if (held !== undefined) await held
    }
    const answer = await fetch(address, home ? { credentials: 'same-origin', headers: moleOfficeHeaders() } : { credentials: 'omit' })
    return answer.ok ? await asADataAddress(answer) : null
  } catch {
    return null
  }
}

/**
 * THE BYTES OF AN ANSWER AS A DATA: ADDRESS, typed by the type the answer gave. Spaces, quotes and commas are taken out
 * of the type, so the address is one unbroken word and its type ends where the bytes begin.
 */
async function asADataAddress(answer: Response): Promise<ReadWhole> {
  const type = (answer.headers.get('content-type') ?? '').replace(/[\s"'\\,]/g, '').toLowerCase()
  const bytes = new Uint8Array(await answer.arrayBuffer())
  let binary = ''
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return { address: `data:${type === '' ? 'application/octet-stream' : type};base64,${btoa(binary)}`, type: type.split(';')[0] ?? '' }
}

// ============================================================ the style

/**
 * THE PAGE'S WHOLE STYLE AS ONE TEXT: every sheet in order, each rule as the browser writes it. An import is read in
 * its place. Every file a rule uses is read and written in as a data: address. A sheet the browser will not let the
 * page read stops the file, because a file without it would not look like the page.
 */
async function theStyleOf(page: Document, reads: TheReads): Promise<string> {
  const parts: string[] = []
  for (const sheet of Array.from(page.styleSheets)) {
    if (!sheet.disabled) parts.push(await theRulesOf(sheet, page, reads))
  }
  return parts.join('\n')
}

async function theRulesOf(sheet: CSSStyleSheet, page: Document, reads: TheReads): Promise<string> {
  let rules: CSSRuleList
  try {
    rules = sheet.cssRules
  } catch {
    throw new NotSaved(t('reports.export.sheetUnread', { address: sheet.href ?? '' }))
  }
  const base = sheet.href ?? page.baseURI
  const written: string[] = []
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSImportRule) {
      if (rule.styleSheet === null) throw new NotSaved(t('reports.export.sheetUnread', { address: new URL(rule.href, base).href }))
      written.push(await theRulesOf(rule.styleSheet, page, reads))
    } else {
      written.push(await withItsFilesInside(rule.cssText, base, reads))
    }
  }
  const all = written.join('\n')
  // A SHEET FOR ONE KIND OF SCREEN, or for print, keeps to it in the file.
  const media = sheet.media.mediaText
  return media === '' ? all : `@media ${media} {\n${all}\n}`
}

/**
 * ONE RULE WITH EVERY FILE IT USES WRITTEN IN. An address already data: stays. An address that is an id alone names a
 * part of the document and not a file, so it stays too. Any other is read from its whole address, worked out from the
 * sheet's own address or, for a style element, from the page's.
 */
async function withItsFilesInside(css: string, base: string, reads: TheReads): Promise<string> {
  let written = ''
  let from = 0
  for (const found of css.matchAll(URL_IN_STYLE)) {
    const raw = (found[1] ?? found[2] ?? found[3] ?? '').replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gi, (_whole, hex: string | undefined, plain: string | undefined) =>
      hex === undefined ? (plain ?? '') : String.fromCodePoint(parseInt(hex, 16)))
    written += css.slice(from, found.index)
    from = found.index + found[0].length
    if (/^data:/i.test(raw) || raw.startsWith('#')) {
      written += found[0]
      continue
    }
    let address: string
    try {
      address = new URL(raw, base).href
    } catch {
      throw new NotSaved(t('reports.export.styleFileUnread', { address: raw }))
    }
    written += `url("${(await reads.aStyleFile(address)).address}")`
  }
  return written + css.slice(from)
}

/** Which data attributes the style names, and which of their values it compares, whole by `=` or word by word by `~=`. */
interface TheSelectors {
  named: Set<string>
  whole: Map<string, Set<string>>
  words: Map<string, Set<string>>
}

function theSelectorsIn(style: string): TheSelectors {
  const read: TheSelectors = { named: new Set(), whole: new Map(), words: new Map() }
  for (const found of style.matchAll(DATA_SELECTOR)) {
    const name = found[1]!
    read.named.add(name)
    const value = found[3] ?? found[4] ?? found[5]
    if (value === undefined) continue
    const compared = found[2] === '=' ? read.whole : found[2] === '~=' ? read.words : null
    if (compared === null) continue
    const values = compared.get(name) ?? new Set<string>()
    values.add(value)
    compared.set(name, values)
  }
  return read
}

/**
 * WHAT A DATA ATTRIBUTE KEEPS: null when no selector names it, so it goes; its value when a selector compares exactly
 * that value; under `~=`, each word a selector compares; and otherwise an empty value. The style draws the file as it
 * drew the page, and no value the style never reads is carried into the file.
 */
function theValueKept(selectors: TheSelectors, name: string, value: string): string | null {
  if (!selectors.named.has(name)) return null
  if (selectors.whole.get(name)?.has(value) === true) return value
  const words = selectors.words.get(name)
  return words === undefined ? '' : value.split(/\s+/).filter((word) => words.has(word)).join(' ')
}

// ============================================================ the blocks

/**
 * THE STORED VALUE A DRAWN ELEMENT NAMES as where it is stored, read from the record's data by the one reader of that
 * name's shape. Undefined when the name cannot be read or names nothing stored.
 */
function theStoredAt(path: string, data: Record<string, unknown>): unknown {
  const read = parseRegionId(path).read
  if (read === undefined || read.root !== 'data' || read.at !== null) return undefined
  let at: unknown = data
  for (const step of read.steps) {
    if (step.form === 'name') at = isAnObject(at) ? at[step.name] : undefined
    else if (step.form === 'index') at = Array.isArray(at) ? (at as unknown[])[step.index] : undefined
    else at = Array.isArray(at) ? (at as unknown[]).find((one) => isAnObject(one) && one['id'] === step.key) : undefined
  }
  return at
}

/**
 * The name of a block's file, which a refusal gives and the PDF form writes in a file's place: the name it was stored
 * with, else its description, else the end of its path.
 */
function theNameOf(block: Record<string, unknown>): string {
  for (const field of ['name', 'alt']) {
    const said = block[field]
    if (typeof said === 'string' && said.trim() !== '') return said
  }
  const path = String(block['path'])
  return path.split(/[\\/]/).filter((part) => part !== '').pop() ?? path
}

/** A picture's description, else the name of its file. A picture keeps it, and a player is named by it. */
function theDescriptionOf(block: Record<string, unknown>): string {
  return typeof block['alt'] === 'string' ? block['alt'] : theNameOf(block)
}

/**
 * EVERY FILE OF THE REPORT PUT INSIDE THE COPY. Each element that holds a file is matched to its block by the place
 * the block is stored, and the block's file is read once. A picture, a player and a source get it as their address,
 * and a file's save link saves it under the file's name. A stand drawn before a medium is loaded becomes the medium.
 *
 * IN THE PDF FORM, a sound and a file's save link become their names, and their bytes are not read: the page holds
 * nothing of them but the name. A video becomes a picture of its first frame, followed by its name.
 */
async function putTheFilesInside(
  copy: Element, liveOf: Map<Element, Element>, record: TheReportSaved, reads: TheReads, out: Document, form: TheForm, page: Document,
): Promise<void> {
  for (const one of [...copy.querySelectorAll(MEDIA)]) {
    const holder = liveOf.get(one)?.closest(`[${DRAWN_FROM_ATTRIBUTE}]`) ?? null
    const block = holder === null ? undefined : theStoredAt(holder.getAttribute(DRAWN_FROM_ATTRIBUTE) ?? '', record.data)
    if (!isAnObject(block) || typeof block['path'] !== 'string') continue
    const stand = one.classList.contains('sb-image-stand')
    if (stand && !NOT_YET_LOADED.has(one.getAttribute('data-preview') ?? '')) continue
    const name = theNameOf(block)
    if (form === 'pdf' && (one.localName === 'a' || (stand ? thePlayerTheBlockNames(block) : one.localName) === 'audio')) {
      one.replaceWith(aSpanSaying(name, out))
      continue
    }
    const read = await reads.aFile(block['path'], name)
    const tag = stand ? theTagFor(block, read) : one.localName
    if (form === 'pdf' && tag === 'audio') {
      one.replaceWith(aSpanSaying(name, out))
    } else if (form === 'pdf' && tag === 'video') {
      one.replaceWith(await theFirstFrameOf(block, read, page, out), aSpanSaying(name, out))
    } else if (stand) {
      one.replaceWith(theMediumFor(block, read, out))
    } else if (one.localName === 'a') {
      one.setAttribute('href', read.address)
      one.setAttribute('download', name)
    } else {
      one.setAttribute('src', read.address)
      one.removeAttribute('srcset')
      if (!(one.getAttribute('poster') ?? '').startsWith('data:')) one.removeAttribute('poster')
    }
  }
}

/** The player a block names for itself: a video block's or a sound block's. Null for any other block, whose bytes decide. */
function thePlayerTheBlockNames(block: Record<string, unknown>): 'video' | 'audio' | null {
  const drawn = block['type']
  return drawn === 'video' || drawn === 'audio' ? drawn : null
}

/** The element a stand becomes: the player its block names, else the element the type of its bytes asks for. */
function theTagFor(block: Record<string, unknown>, read: ReadWhole): 'video' | 'audio' | 'img' {
  return thePlayerTheBlockNames(block) ?? (read.type.startsWith('video/') ? 'video' : read.type.startsWith('audio/') ? 'audio' : 'img')
}

/**
 * WHAT A STAND BECOMES: the player a sound or a video block draws once loaded, or, for a picture or a file, the
 * element the type of its bytes asks for. A picture keeps its description, and a player is named by it.
 */
function theMediumFor(block: Record<string, unknown>, read: ReadWhole, out: Document): Element {
  const tag = theTagFor(block, read)
  const medium = out.createElement(tag)
  medium.setAttribute('src', read.address)
  const words = theDescriptionOf(block)
  if (tag === 'img') {
    medium.setAttribute('alt', words)
  } else {
    medium.setAttribute('controls', '')
    medium.setAttribute('aria-label', words)
  }
  return medium
}

/**
 * A VIDEO'S FIRST FRAME AS A PICTURE, for the PDF form. It keeps the video's description. A frame that cannot be drawn
 * stops the file with the refusal for a file that could not be read. The reason is the browser's own words, and when
 * the browser gave none, the words the page says of a file it cannot show as a picture or a video.
 */
async function theFirstFrameOf(block: Record<string, unknown>, read: ReadWhole, page: Document, out: Document): Promise<Element> {
  const drawn = await theFirstFrameDrawn(read.address, page)
  if (!drawn.ok) {
    const reason = drawn.said.trim() === '' ? t('sb.stand.tag.undecodable') : drawn.said
    throw new NotSaved(t('reports.export.fileUnread', { name: theNameOf(block), reason }))
  }
  const picture = out.createElement('img')
  picture.setAttribute('src', drawn.address)
  picture.setAttribute('alt', theDescriptionOf(block))
  return picture
}

/**
 * THE FRAME AT TIME 0 OF A VIDEO, AS A PNG data: ADDRESS, drawn from the bytes already read. The video and the canvas
 * are made in the page and not in the copy, because the copy's document shows nothing and loads nothing. The canvas
 * is the video's own width and height. The frame is drawn once the browser says the frame at time 0 is ready. When it
 * cannot be drawn, the answer holds the browser's words, which are empty when it gave none.
 */
function theFirstFrameDrawn(address: string, page: Document): Promise<{ ok: true; address: string } | { ok: false; said: string }> {
  return new Promise((done) => {
    const film = page.createElement('video')
    film.muted = true
    film.preload = 'auto'
    film.addEventListener('loadeddata', () => {
      const width = film.videoWidth
      const height = film.videoHeight
      const canvas = page.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const pen = width === 0 || height === 0 ? null : canvas.getContext('2d')
      if (pen === null) {
        done({ ok: false, said: '' })
        return
      }
      try {
        pen.drawImage(film, 0, 0, width, height)
        done({ ok: true, address: canvas.toDataURL('image/png') })
      } catch (err) {
        done({ ok: false, said: err instanceof Error ? err.message : String(err) })
      }
    }, { once: true })
    film.addEventListener('error', () => { done({ ok: false, said: film.error?.message ?? '' }) }, { once: true })
    film.src = address
  })
}

/**
 * NOTHING IN THE FILE IS PRESSED OR TYPED INTO. A tab becomes its words. A press in a column head or in a button
 * block gives way to what it holds, without what it hides from a screen reader, so the column's name and the button's
 * label stay and the sort arrow goes. Every other press goes with what it holds, except the pictures it holds, and a
 * column's width grip goes with the presses. A field becomes its value, or the chosen option's words. A box that is
 * ticked or not becomes ☑ or ☐. A form becomes a plain box. A fold stays, because it opens with no script.
 */
function takeThePressesOut(copy: Element, liveOf: Map<Element, Element>, out: Document): void {
  for (const tab of [...copy.querySelectorAll('[role="tab"]')]) tab.replaceWith(aSpanSaying(tab.textContent ?? '', out))
  // A SORTABLE COLUMN DRAWS ITS NAME INSIDE ITS SORT PRESS, AND A BUTTON BLOCK ITS LABEL INSIDE ITS PRESS, so those presses
  // give way to their words before the presses go.
  const holdingTheReportsWords = [...copy.querySelectorAll(PRESSES)].filter(
    (press) => (press.parentElement?.closest(WHERE_PRESSES_HOLD_THE_REPORTS_WORDS) ?? null) !== null,
  )
  for (const press of holdingTheReportsWords) {
    for (const hidden of [...press.querySelectorAll('[aria-hidden="true"]')]) hidden.remove()
    press.replaceWith(...press.childNodes)
  }
  for (const press of [...copy.querySelectorAll(`${PRESSES}, ${WIDTH_GRIPS}`)]) {
    const pictures = [...press.querySelectorAll('img')]
    if (pictures.length > 0) press.replaceWith(...pictures)
    else press.remove()
  }
  for (const field of [...copy.querySelectorAll('input, textarea, select')]) {
    field.replaceWith(aSpanSaying(theWordsShownIn(liveOf.get(field) ?? field), out))
  }
  for (const form of [...copy.querySelectorAll('form')]) {
    const box = out.createElement('div')
    for (const name of ['class', 'style']) {
      const value = form.getAttribute(name)
      if (value !== null) box.setAttribute(name, value)
    }
    box.append(...form.childNodes)
    form.replaceWith(box)
  }
}

function aSpanSaying(words: string, out: Document): HTMLSpanElement {
  const span = out.createElement('span')
  span.textContent = words
  return span
}

function theWordsShownIn(field: Element): string {
  if (field instanceof HTMLSelectElement) return [...field.selectedOptions].map((one) => one.text).join(', ')
  if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) return field.checked ? '☑' : '☐'
  // AN EMPTY FIELD SAYS NOTHING. Its placeholder is a hint, and in the file it would read as an answer.
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) return field.value
  return field.textContent ?? ''
}

/**
 * A DRAWING'S IDS ARE RENAMED e1, e2 AND ON, and every reference to one inside a drawing is renamed with it, so a
 * drawing's own parts still find each other and no id of the page is carried. A reference to an element the copy does
 * not hold stops the file, because the drawing would be drawn without it.
 */
function renameTheDrawingsIds(copy: Element): ReadonlyMap<string, string> {
  const drawings = everyElementOf(copy).filter((one) => one.namespaceURI === SVG)
  const renamed = new Map<string, string>()
  for (const one of drawings) {
    const id = one.getAttribute('id')
    if (id === null) continue
    const fresh = renamed.get(id) ?? `e${String(renamed.size + 1)}`
    renamed.set(id, fresh)
    one.setAttribute('id', fresh)
  }
  const theNewNameOf = (id: string): string => {
    const fresh = renamed.get(id)
    if (fresh === undefined) throw new NotSaved(t('reports.export.drawingUsesThePage'))
    return fresh
  }
  for (const one of drawings) {
    for (const attribute of [...one.attributes]) {
      if (attribute.localName === 'id') continue
      let value = attribute.value.replace(AN_ID_IN_A_URL, (_whole, id: string) => `url(#${theNewNameOf(id)})`)
      if (attribute.localName === 'href' && value.startsWith('#')) value = `#${theNewNameOf(value.slice(1))}`
      if (value !== attribute.value) attribute.value = value
    }
  }
  return renamed
}

/**
 * THE STYLE NAMES EACH DRAWING BY ITS NEW ID. A diagram carries a style element of its own, and its rules name the
 * diagram by its id. Those rules are in the file's one style, so each id renamed in the copy is renamed there too,
 * wherever the style names it whole: a `#`, the id as the browser writes it, and no further character of a name. All
 * are renamed in one pass, so a new name is never renamed again.
 *
 * AN ID THAT READS AS A COLOUR IS NOT RENAMED IN THE STYLE, so no colour is ever changed. A diagram's task can be
 * given an id such as `a12`, and `#a12` is a colour too. A diagram's own rules name it by an id that begins
 * `sb-diagram-`, which never reads as one.
 */
function withTheDrawingsNewIds(style: string, renamed: ReadonlyMap<string, string>): string {
  const asAColour = /^(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i
  const freshOf = new Map([...renamed].filter(([id]) => !asAColour.test(id)).map(([id, fresh]) => [CSS.escape(id), fresh]))
  if (freshOf.size === 0) return style
  const names = [...freshOf.keys()].sort((one, other) => other.length - one.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return style.replace(new RegExp(`#(${names.join('|')})(?![-\\w\\\\]|[^\\x00-\\x7f])`, 'g'), (_whole, name: string) => `#${freshOf.get(name)!}`)
}

/**
 * THE FRAME: each element the blocks sit in, from the body down, copied with its tag, its class and its data
 * attributes, each holding only the next. The body keeps its style attribute as well. The blocks go in the innermost,
 * after a heading of the report's title. The page's style then lays the blocks out as it does on the page.
 */
function putItInItsFrame(blocks: HTMLElement, copy: Element, record: TheReportSaved, page: Document, out: Document): void {
  const around: Element[] = []
  for (let at = blocks.parentElement; at !== null && at !== page.body; at = at.parentElement) around.unshift(at)
  copyTheLook(page.body, out.body, true)
  let holder: Element = out.body
  for (const live of around) {
    const one = out.createElement(live.localName)
    copyTheLook(live, one, false)
    holder.append(one)
    holder = one
  }
  const heading = out.createElement('h1')
  heading.textContent = theTitleOf(record)
  holder.append(heading, copy)
}

function copyTheLook(from: Element, to: Element, withStyle: boolean): void {
  for (const attribute of [...from.attributes]) {
    if (attribute.name === 'class' || attribute.name.startsWith('data-') || (withStyle && attribute.name === 'style')) {
      to.setAttribute(attribute.name, attribute.value)
    }
  }
}

/** The marks the comment and agent layers put on the blocks go, and the words they mark stay. */
function takeTheLayerMarksOff(root: Element): void {
  for (const one of everyElementOf(root)) {
    one.removeAttribute(ROOM_ATTRIBUTE)
    if (!one.classList.contains(LANDED_ON)) continue
    one.classList.remove(LANDED_ON)
    if (one.classList.length === 0) one.removeAttribute('class')
  }
}

/**
 * AN ADDRESS OF HERE: one beside the page, an id alone, this page's own host, a loopback host, a file on this
 * machine, or this page's memory. The file opens somewhere else, where none of them leads anywhere. A data: address
 * is the file's own, and a web address on another host is the same everywhere.
 */
function isAnAddressOfHere(address: string, page: Document): boolean {
  const said = address.trim()
  if (/^data:/i.test(said)) return false
  if (!/^[a-z][a-z\d+.-]*:/i.test(said)) return true
  let url: URL
  try {
    url = new URL(said)
  } catch {
    return true
  }
  if (url.protocol === 'file:' || url.protocol === 'blob:' || url.protocol === 'javascript:') return true
  const host = url.hostname.toLowerCase()
  return (
    host === new URL(page.baseURI).hostname.toLowerCase() ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '[::1]' ||
    /^127(\.\d{1,3}){3}$/.test(host)
  )
}

/**
 * A LINK TO HERE BECOMES ITS WORDS. Any other element that would still load an address of here stops the file, and
 * the refusal names its tag. A drawing's references to its own parts were renamed above and are its own.
 */
function makeTheAddressesOfHereWords(root: Element, page: Document, out: Document): void {
  for (const one of everyElementOf(root)) {
    const link = one.localName === 'a' && one.namespaceURI === HTML ? one.getAttribute('href') : null
    if (link !== null && isAnAddressOfHere(link, page)) {
      const words = out.createElement('span')
      words.append(...one.childNodes)
      one.replaceWith(words)
      continue
    }
    const drawing = one.namespaceURI === SVG
    for (const attribute of [...one.attributes]) {
      const name = attribute.localName
      if (drawing && name === 'href' && attribute.value.startsWith('#')) continue
      const loads = LOADING.has(name) && isAnAddressOfHere(attribute.value, page)
      const styled = name === 'style' && [...attribute.value.matchAll(URL_IN_STYLE)].some((found) => {
        const raw = found[1] ?? found[2] ?? found[3] ?? ''
        return !(drawing && raw.startsWith('#')) && isAnAddressOfHere(raw, page)
      })
      if (loads || styled) throw new NotSaved(t('reports.export.pointsHere', { tag: one.localName }))
    }
  }
}

/**
 * EVERY ATTRIBUTE THE FILE MAY NOT CARRY GOES: each `on…`, each id outside a drawing, and the ones in `NEVER_KEPT`.
 * A data attribute keeps what `theValueKept` says. Every other attribute stays as the page drew it.
 */
function keepWhatTheStyleReads(root: Element, selectors: TheSelectors): void {
  for (const one of everyElementOf(root)) {
    const drawing = one.namespaceURI === SVG
    for (const attribute of [...one.attributes]) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || NEVER_KEPT.has(name) || (name === 'id' && !drawing)) {
        one.removeAttributeNode(attribute)
        continue
      }
      if (!name.startsWith('data-')) continue
      const kept = theValueKept(selectors, name, attribute.value)
      if (kept === null) one.removeAttributeNode(attribute)
      else if (kept !== attribute.value) attribute.value = kept
    }
  }
}
