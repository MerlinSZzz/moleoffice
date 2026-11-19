// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ADD TO NOTE, FROM THE RIGHT-CLICK BOX'S SEND WITH NOTE CHOSEN. What was pointed at is copied into a quick note as one
 * added part, with a link back to the page it came from. The part keeps the copy as it was when it was added, so it
 * stays the same when its source changes later. Words typed in the box go in the same write, as a words part kept just
 * under the added part, where the sheet draws them under it (`whereWordsWithAnAddedPartGo`).
 *
 * WHAT GOES IN, read from what the one listener answered (components/agent/pointing.ts) and the stored record:
 *   - words selected in a report block: the stored words the selection covers, cut at its two ends. Bold, italics, code
 *     or a link cut in the middle is closed again, and a formula or an image is kept whole;
 *   - a report block with no words selected, a picture among them: the block;
 *   - a table row, or one of its cells: the table with that one row;
 *   - a record: its card;
 *   - empty page: the page, by its name;
 *   - anything else: the words drawn there, as words.
 *
 * INTO WHICH NOTE: the one the box names, kept in that note's own project. The box first names the one the person last
 * wrote in, as the office answers it (`GET /api/records/my-notes/last-written-in`). Or a new note, filed in the
 * switcher's project, which opens no window: a browser lets a page open a window only in the press itself, before the
 * filing answers, and in the window app a page cannot ask the note window for a given note.
 */
import { inlinePieces, type InlinePiece } from '@shared/inline.ts'
import { blocksFieldOf } from '@shared/kinds.ts'
import type { QuickNoteAdded, QuickNoteCopy, QuickNotePage, QuickNotePart, QuickNoteWords } from '@shared/kinds/quick-note.ts'
import { theParts } from '@shared/my-notes.ts'
import { parseRoute } from '@shared/addresses.ts'
import { parseRegionId } from '@shared/regions.ts'
import { stampInZone, theClockZone } from '@shared/time.ts'
import type { Place, Span } from '@shared/targets.ts'
import type { PanelRecord } from '@shared/types.ts'
import { api } from '../api.ts'
import type { MessageContext } from '../components/agent/context.ts'
import { pointedAt, thePage } from '../components/agent/pointing.ts'
import { aNewPartId, whereAnAddedPartGoes, whereWordsWithAnAddedPartGo } from '../components/QuickNoteSheet.tsx'
import { theTitleFollowsTheWords, titleOf } from './quick-note-title.ts'
import { A_NOTE_WINDOWS_SIZE } from '../../desktop/the-quick-note.mjs'

/** What the one listener answered for the thing the menu was opened on. */
export interface WhatWasPointedAt {
  context: MessageContext
  /** What the page calls the thing, as the menu's chip draws it. */
  about: string
}

/** How wide an added part is placed: the note window's width less the sheet's margin either side. */
const AN_ADDED_PART_IS = A_NOTE_WINDOWS_SIZE.width - 40

type Block = Record<string, unknown>

/** The stored blocks of a record, by the field its kind keeps them in, or null when its kind keeps none. */
function blocksOf(record: PanelRecord): { field: string; blocks: Block[] } | null {
  const field = blocksFieldOf(record.kind)
  const held = field === null ? undefined : record.data[field]
  return field === null || !Array.isArray(held) ? null : { field, blocks: held as Block[] }
}

/** The block a field path such as `data.blocks[#b-1].text` is in, and the name of its field, or null. */
function blockAt(record: PanelRecord, path: string): { block: Block; name: string } | null {
  const stored = blocksOf(record)
  if (stored === null) return null
  const found = new RegExp(`^data\\.${stored.field}\\[#([^\\]]+)\\]\\.([A-Za-z]+)$`, 'u').exec(path)
  const block = found === null ? undefined : stored.blocks.find((one) => one['id'] === found[1])
  return block === undefined || found === null ? null : { block, name: found[2]! }
}

/** A piece's words and the markers either side of them, when its words may be cut and closed again. */
function markersOf(piece: InlinePiece): { open: string; words: string; close: string } | null {
  switch (piece.kind) {
    case 'bold':
      return { open: '**', words: piece.text, close: '**' }
    case 'italic':
      return { open: '*', words: piece.text, close: '*' }
    case 'code':
      return { open: '`', words: piece.text, close: '`' }
    case 'link':
      return { open: '[', words: piece.text, close: `](${piece.href})` }
    default:
      return null
  }
}

/**
 * THE STORED WORDS BETWEEN TWO OFFSETS, WITH EVERY MARK CLOSED. A piece the cut falls inside is cut inside its markers
 * and closed again, so the copy draws as it was drawn. A formula or an image is never cut: it is kept whole.
 */
export function theWordsBetween(stored: string, from: number, to: number): string {
  let out = ''
  let at = 0
  for (const piece of inlinePieces(stored)) {
    const start = at
    const end = at + piece.raw.length
    at = end
    if (end <= from || start >= to) continue
    if (start >= from && end <= to) {
      out += piece.raw
      continue
    }
    if (piece.kind === 'words') {
      out += piece.raw.slice(Math.max(from, start) - start, Math.min(to, end) - start)
      continue
    }
    const markers = markersOf(piece)
    if (markers === null) {
      out += piece.raw
      continue
    }
    const inside = start + markers.open.length
    const words = markers.words
    out += markers.open + words.slice(Math.max(from, inside) - inside, Math.min(to, inside + words.length) - inside) + markers.close
  }
  return out
}

/** The copy of the selected words, as the stored blocks they are in, or null when they are not in a stored block. */
function theSelectedWords(record: PanelRecord, place: Extract<Place, { at: 'words' | 'across' }>): Block[] | null {
  const first: Span = place.at === 'words' ? place.span : place.from
  const last: Span = place.at === 'words' ? place.span : place.to
  if (first.field === undefined || last.field === undefined) return null
  const from = blockAt(record, first.field)
  const to = blockAt(record, last.field)
  const stored = blocksOf(record)
  if (from === null || to === null || stored === null) return null
  const fromAt = stored.blocks.indexOf(from.block)
  const toAt = stored.blocks.indexOf(to.block)
  if (toAt < fromAt) return null
  return stored.blocks.slice(fromAt, toAt + 1).map((block, n) => {
    const name = n === 0 ? from.name : n === toAt - fromAt ? to.name : null
    if (name === null) return block
    const words = block[name]
    if (typeof words !== 'string') return block
    const start = n === 0 ? first.from : 0
    const end = n === toAt - fromAt ? last.to : words.length
    return { ...block, [name]: theWordsBetween(words, start, end) }
  })
}

/** The words drawn where the menu was opened, as one block of words: the answer for anything else. */
function theDrawnWords(pointed: WhatWasPointedAt): Block[] {
  const place = pointed.context.place
  const words =
    place?.at === 'words' ? place.span.quote : place?.at === 'across' ? `${place.from.quote} … ${place.to.quote}` : place?.at === 'quote' ? place.words : pointed.about
  return [{ id: 'words', type: 'text', text: words }]
}

/** One stored record, read in the project it is in, or in the switcher's when the target does not say. */
async function aRecord(id: string, workspaceId?: string): Promise<PanelRecord> {
  return (await api.getRecord(id, workspaceId === undefined ? undefined : { workspaceId })).record
}

/** The copy of what was pointed at, made from the stored record and never from what the page drew, where one is stored. */
async function theCopy(pointed: WhatWasPointedAt): Promise<{ copy: QuickNoteCopy; read: PanelRecord | null }> {
  const target = pointed.context.target
  const place = pointed.context.place
  switch (target.kind) {
    case 'page':
      return { copy: { type: 'page' }, read: null }
    case 'record': {
      const record = await aRecord(target.recordId, target.workspaceId)
      const summary = typeof record.summary === 'string' && record.summary.trim() !== '' ? { summary: record.summary } : {}
      return { copy: { type: 'card', recordId: record.id, kind: record.kind, title: record.title, ...summary }, read: record }
    }
    case 'reportBlock':
    case 'region':
    case 'tableRow':
    case 'tableCell': {
      const record = await aRecord(target.recordId)
      const blocks = theBlocks(record, target, place)
      return { copy: { type: 'blocks', blocks: blocks ?? theDrawnWords(pointed) }, read: record }
    }
    default:
      return { copy: { type: 'blocks', blocks: theDrawnWords(pointed) }, read: null }
  }
}

/** The stored blocks a target in a report names, or null when they cannot be found there. */
function theBlocks(
  record: PanelRecord,
  target: Extract<MessageContext['target'], { kind: 'reportBlock' | 'region' | 'tableRow' | 'tableCell' }>,
  place: Place | undefined,
): Block[] | null {
  if (place !== undefined && (place.at === 'words' || place.at === 'across')) {
    const words = theSelectedWords(record, place)
    if (words !== null) return words
  }
  const stored = blocksOf(record)
  if (stored === null) return null
  let blockId: string
  if (target.kind === 'region') {
    // A REGION NAMES ITS BLOCK BY THE STEPS OF ITS ID: the blocks field, then the block's own id.
    const steps = parseRegionId(target.regionId).read?.steps ?? []
    const key = steps[0]?.form === 'name' && steps[0].name === stored.field && steps[1]?.form === 'key' ? steps[1].key : null
    if (key === null) return null
    blockId = key
  } else blockId = target.blockId
  const block = stored.blocks.find((one) => one['id'] === blockId)
  if (block === undefined) return null
  if (target.kind === 'reportBlock' || target.kind === 'region') return [block]
  const rows = block['rows']
  const row = Array.isArray(rows) ? (rows as unknown[])[Number(target.rowKey) - 1] : undefined
  return row === undefined ? null : [{ ...block, rows: [row] }]
}

/** The page the thing was on: its address, its name, and the record it is the page of, when it is one. */
async function thePageItCameFrom(read: PanelRecord | null): Promise<QuickNotePage> {
  const route = thePage().route
  const address = `#${route}`
  const shown = parseRoute(address)
  if (shown.name === 'record') {
    const record = read !== null && read.id === shown.id ? read : await aRecord(shown.id)
    return { address, name: record.title, recordId: record.id }
  }
  // THE PAGE IS NAMED BY THE ONE LISTENER'S OWN ANSWER FOR A PRESS ON NOTHING, which reads the name the page draws.
  return { address, name: pointedAt(null, null).about }
}

/** The part what was pointed at becomes, placed below everything the note holds. */
async function theAddedPart(pointed: WhatWasPointedAt, parts: readonly QuickNotePart[]): Promise<QuickNoteAdded> {
  const { copy, read } = await theCopy(pointed)
  const from = await thePageItCameFrom(read)
  return {
    id: aNewPartId('added', parts),
    type: 'added',
    ...whereAnAddedPartGoes(parts),
    width: AN_ADDED_PART_IS,
    at: stampInZone(Date.now(), theClockZone()),
    from,
    copy,
  }
}

/** The added part, and after it the words typed with it, kept where the sheet draws them under it. Blank words add nothing. */
function withTheTypedWords(part: QuickNoteAdded, typed: string, parts: readonly QuickNotePart[]): QuickNotePart[] {
  if (typed.trim() === '') return [part]
  const words: QuickNoteWords = {
    id: aNewPartId('words', [...parts, part]),
    type: 'words',
    ...whereWordsWithAnAddedPartGo(part),
    width: part.width,
    text: typed,
  }
  return [part, words]
}

/**
 * ADD WHAT WAS POINTED AT TO A NOTE, and the words typed with it, in the note's own project, on the version just read. A
 * note changed between the read and the write is refused by the office with 409 and nothing is stored; the caller says
 * so. A note whose title follows its words is given the title its new parts give, in the same write, as the note page
 * does at each save. The note is given back with the title it now has.
 */
export async function addToANote(pointed: WhatWasPointedAt, note: PanelRecord, typed = ''): Promise<PanelRecord> {
  const read = await api.getRecord(note.id, { workspaceId: note.workspaceId })
  const parts = theParts(read.record)
  const next = [...parts, ...withTheTypedWords(await theAddedPart(pointed, parts), typed, parts)]
  const title = theTitleFollowsTheWords(read.record.title, parts) ? titleOf(next) : read.record.title
  await api.updateRecord(
    note.id,
    { ...(title === read.record.title ? {} : { title }), dataPatch: { parts: next }, ifVersion: read.version },
    note.workspaceId,
  )
  return { ...read.record, title }
}

/** ADD WHAT WAS POINTED AT TO A NEW NOTE, and the words typed with it, filed in the switcher's project, and give the note as filed. */
export async function addToANewNote(pointed: WhatWasPointedAt, typed = ''): Promise<PanelRecord> {
  const part = await theAddedPart(pointed, [])
  const parts = withTheTypedWords(part, typed, [])
  const filed = await api.fileAQuickNote({ title: titleOf(parts), data: { parts, from_page: part.from } })
  return filed.record
}
