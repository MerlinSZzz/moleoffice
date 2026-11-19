// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHEET OF A QUICK NOTE: WHERE THE PERSON WRITES AND DRAWS, AND WHERE EVERY PART OF A NOTE IS DRAWN.
 *
 * EVERY PART IS DRAWN IN THE ORDER IT IS KEPT, so a later part is drawn over an earlier one, as the kind says
 * (src/shared/kinds/quick-note.ts). Each part is one element placed by its own x and y, and a stroke or a line is a
 * picture only as big as itself, so a note of many strokes does not lay many sheet-sized pictures over each other.
 *
 * THE PEN DRAWS AND A PRESS WRITES. A press that does not move starts words where it lands, or opens the words it
 * lands on; a press that moves draws a stroke in the chosen colour. A press on a film, a link or a field is that
 * thing's own, and draws nothing. The eraser takes away every stroke, line, box, picture, film and added part it
 * passes over, and the lines of a box it takes; written words are taken away by deleting them, so a pass of the
 * eraser cannot take a paragraph.
 *
 * BOX DRAWS AND MOVES BOXES, AND LINE JOINS THEM. With Box chosen a drag draws a box and a press makes one, either
 * ready to be written in; a drag on a box moves it, and a press on it writes in it. With Line chosen a drag from one
 * box to another joins them. A line names the two boxes and not two points, so it follows a box that moves. Escape
 * during any of these drags cancels it, and nothing is drawn or moved.
 *
 * A PICTURE OR A FILM DROPPED ON THE SHEET IS PLACED WHERE IT IS DROPPED. The note checks and stores it
 * (src/web/components/quick-note-files.ts).
 *
 * ONE FINGER DRAWS. Two fingers move and zoom the sheet, without changing the note.
 *
 * A PICTURE OR A FILM IS ASKED FOR ONLY ONCE A SAVE THAT HOLDS IT HAS BEEN ANSWERED. The file door serves a stored
 * file only when a record names it, so until the note naming it is kept the part says it is being stored.
 */
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { t } from '@shared/i18n.ts'
import type {
  QuickNoteAdded,
  QuickNoteBox,
  QuickNoteColour,
  QuickNoteFile,
  QuickNoteLine,
  QuickNotePart,
  QuickNoteStroke,
  QuickNoteWords,
} from '@shared/kinds/quick-note.ts'
import type { ImageBlock } from '@shared/types.ts'
import { ImagePreview, renderMarkdown, SummaryStyle, usePictureBytes } from './SummaryBlocks.tsx'
import { Player } from './ReportMedia.tsx'
import { QuickNoteAddedPart } from './QuickNoteAddedPart.tsx'
import { QUICK_NOTE_COLOURS } from './quick-note-colours.ts'

/** What a press on the sheet does. */
export type QuickNoteTool = 'pen' | 'eraser' | 'box' | 'line'

/** How thick the pen draws, in pixels of the sheet. */
export const QUICK_NOTE_PEN_WIDTH = 2.5
/** How near the eraser must pass to a stroke or a line to take it, in pixels of the sheet. */
const ERASER_REACH = 10
/** How far a press may move and still be a press rather than a stroke, in pixels. */
const A_PRESS_MOVES_LESS_THAN = 4
/** The space kept round the sheet's own edge, in pixels: where new words start, and the room past the last part. */
const MARGIN = 20
/** How wide new words are at most, in pixels of the sheet, so a line of them stays easy to read in a wide window. */
const NEW_WORDS_ARE_AT_MOST = 560
/** The box a press makes with Box chosen, in pixels of the sheet: room for a few words on one line. */
const A_PRESSED_BOX = { width: 150, height: 64 }
/** The smallest box a drag draws, in pixels of the sheet, so a box drawn by a short drag still holds a word. */
const A_BOX_IS_AT_LEAST = { width: 40, height: 28 }
/** A resized box leaves room for one line of its words. */
const A_RESIZED_BOX_IS_AT_LEAST = { width: 40, height: 40 }
const ZOOM_MIN = 0.25
const ZOOM_MAX = 4
const ZOOM_STEP = 1.25

/** A new part's id: its type's first letter and six random characters, unlike every id the note holds. */
export function aNewPartId(type: QuickNotePart['type'], parts: readonly QuickNotePart[]): string {
  const taken = new Set(parts.map((part) => part.id))
  for (;;) {
    const id = `${type.charAt(0)}-${Math.random().toString(36).slice(2, 8)}`
    if (!taken.has(id)) return id
  }
}

/**
 * HOW WIDE WORDS OR AN ADDED PART ARE DRAWN: as wide as they were placed, or narrower when the sheet has less room, so
 * words written in a wide window are not drawn past the small window's edge. They are never drawn narrower than 160
 * pixels. The width the note keeps is the one they were placed at.
 */
function drawnWidthOf(part: { x: number; width: number }, roomWidth: number): number {
  return Math.min(part.width, Math.max(160, Math.max(roomWidth, 200) - part.x - MARGIN))
}

/** The rectangle a placed part covers on a sheet this wide, or null for a stroke or a line, placed by their points. */
function placeOf(part: QuickNotePart, roomWidth: number): { x: number; y: number; width: number; height: number } | null {
  switch (part.type) {
    case 'box':
    case 'picture':
    case 'video':
      return { x: part.x, y: part.y, width: part.width, height: part.height }
    case 'words':
    case 'added':
      // Words and an added part grow downwards as they are written, so only their top and width are kept.
      return { x: part.x, y: part.y, width: drawnWidthOf(part, roomWidth), height: 0 }
    case 'stroke':
    case 'line':
      return null
  }
}

/** The smallest rectangle round a stroke's points, widened by half the pen. */
function boundsOfStroke(stroke: Pick<QuickNoteStroke, 'points' | 'width'>): { left: number; top: number; right: number; bottom: number } {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (let i = 0; i + 1 < stroke.points.length; i += 2) {
    const x = stroke.points[i]!
    const y = stroke.points[i + 1]!
    left = Math.min(left, x)
    right = Math.max(right, x)
    top = Math.min(top, y)
    bottom = Math.max(bottom, y)
  }
  const half = stroke.width / 2 + 1
  return { left: left - half, top: top - half, right: right + half, bottom: bottom + half }
}

/** A stroke as an SVG path through its points, smoothed by drawing each turn as a curve through the midpoints. */
function pathOf(points: readonly number[], left: number, top: number): string {
  const at = (i: number): [number, number] => [points[i * 2]! - left, points[i * 2 + 1]! - top]
  const count = points.length / 2
  if (count === 1) {
    const [x, y] = at(0)
    return `M ${x} ${y} l 0.01 0`
  }
  const [x0, y0] = at(0)
  let d = `M ${x0} ${y0}`
  for (let i = 1; i < count - 1; i++) {
    const [x, y] = at(i)
    const [nx, ny] = at(i + 1)
    d += ` Q ${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`
  }
  const [lx, ly] = at(count - 1)
  return `${d} L ${lx} ${ly}`
}

/** How far a point is from the segment between two others. */
function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const length = dx * dx + dy * dy
  const along = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length))
  return Math.hypot(px - (ax + along * dx), py - (ay + along * dy))
}

/** Whether the eraser at a point touches a stroke. */
function touchesStroke(stroke: QuickNoteStroke, x: number, y: number): boolean {
  const reach = ERASER_REACH + stroke.width / 2
  const { points } = stroke
  if (points.length === 2) return Math.hypot(x - points[0]!, y - points[1]!) <= reach
  for (let i = 0; i + 3 < points.length; i += 2) {
    if (distanceToSegment(x, y, points[i]!, points[i + 1]!, points[i + 2]!, points[i + 3]!) <= reach) return true
  }
  return false
}

/** Where a line from a box's middle towards a point leaves the box. */
function edgeOf(box: QuickNoteBox, towardsX: number, towardsY: number): [number, number] {
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const dx = towardsX - cx
  const dy = towardsY - cy
  if (dx === 0 && dy === 0) return [cx, cy]
  const scale = Math.min(dx === 0 ? Infinity : box.width / 2 / Math.abs(dx), dy === 0 ? Infinity : box.height / 2 / Math.abs(dy))
  return [cx + dx * scale, cy + dy * scale]
}

/** The two ends of a line between two boxes, each on its box's edge, or null when either box is gone. */
export function endsOfLine(line: QuickNoteLine, parts: readonly QuickNotePart[]): [number, number, number, number] | null {
  const from = parts.find((part): part is QuickNoteBox => part.type === 'box' && part.id === line.from)
  const to = parts.find((part): part is QuickNoteBox => part.type === 'box' && part.id === line.to)
  if (from === undefined || to === undefined) return null
  const [ax, ay] = edgeOf(from, to.x + to.width / 2, to.y + to.height / 2)
  const [bx, by] = edgeOf(to, from.x + from.width / 2, from.y + from.height / 2)
  return [ax, ay, bx, by]
}

/** The height used for drawing a box, without changing the size kept in the note. */
function drawnBox(part: QuickNoteBox, heights: ReadonlyMap<string, number>): QuickNoteBox {
  return { ...part, height: Math.max(part.height, heights.get(part.id) ?? 0) }
}

/**
 * The drawn positions and reach on this sheet. Parts added from a page follow everything already on it, and so do words
 * kept with an added part, as whereWordsWithAnAddedPartGo says. `tops` holds the top each of those is drawn at.
 */
function reachOf(parts: readonly QuickNotePart[], roomWidth: number, heights: ReadonlyMap<string, number> = new Map()): { right: number; bottom: number; tops: Map<string, number> } {
  let right = 0
  let bottom = 0
  const tops = new Map<string, number>()
  for (const [i, part] of parts.entries()) {
    if (part.type === 'stroke') {
      const bounds = boundsOfStroke(part)
      right = Math.max(right, bounds.right)
      bottom = Math.max(bottom, bounds.bottom)
      continue
    }
    const place = placeOf(part, roomWidth)
    if (place === null) continue
    const before = parts[i - 1]
    const keptWith = before?.type === 'added' ? whereWordsWithAnAddedPartGo(before) : null
    const withTheAdded = part.type === 'words' && keptWith !== null && part.x === keptWith.x && part.y === keptWith.y
    const follows = part.type === 'added' || withTheAdded
    const top = follows ? Math.max(place.y, bottom === 0 ? place.y : bottom + MARGIN) : place.y
    if (follows) tops.set(part.id, top)
    right = Math.max(right, place.x + place.width)
    const height = part.type === 'words' || part.type === 'added' ? (heights.get(part.id) ?? 0) : place.height
    bottom = Math.max(bottom, top + height)
  }
  return { right, bottom, tops }
}

/** The stored y is a starting position; the sheet draws added parts below earlier parts using their measured heights. */
export function whereAnAddedPartGoes(parts: readonly QuickNotePart[]): { x: number; y: number } {
  return { x: MARGIN, y: parts.length === 0 ? MARGIN : reachOf(parts, 0).bottom + MARGIN }
}

/**
 * WHERE WORDS WRITTEN IN THE SAME WRITE AS AN ADDED PART ARE KEPT: at the added part's x, and one MARGIN under the y the
 * note keeps for it. Words kept there, as the part straight after their added part, are drawn as an added part is: one
 * MARGIN under the bottom of everything drawn before them, which right after the added part is its own drawn bottom. So
 * they stay under the added part however tall its copy is drawn. Words a pixel off that place, or with another part
 * between them and their added part, are drawn where they are kept, as all words were before this rule.
 *
 * The rule stores nothing new. Words of a note kept before it that sit at that place by chance are drawn under the
 * added part rather than over it. The words part's type in src/shared/kinds/quick-note.ts says the rule in pixels, for
 * a program that files a note through the office, so a change to MARGIN changes that comment too.
 */
export function whereWordsWithAnAddedPartGo(added: { x: number; y: number }): { x: number; y: number } {
  return { x: added.x, y: added.y + MARGIN }
}

/** The parts with one taken away, and every line that joined a box taken away with it. */
export function withoutPart(parts: readonly QuickNotePart[], id: string): QuickNotePart[] {
  return parts.filter((part) => part.id !== id && !(part.type === 'line' && (part.from === id || part.to === id)))
}

/** The element a press began on, when it is a thing of its own that the sheet must leave alone. */
function aThingOfItsOwn(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('textarea, input, button, a, video, audio, summary, select, [data-own-press]') !== null
}

/** The part a point of the screen is on, by the mark each placed part carries. Strokes and lines carry none. */
function partsAt(clientX: number, clientY: number): string[] {
  return document
    .elementsFromPoint(clientX, clientY)
    .map((element) => element.closest('[data-part]')?.getAttribute('data-part'))
    .filter((id): id is string => typeof id === 'string')
}

/** The box a drag draws: over the part of the sheet the drag passed, and never smaller than a box that holds a word. */
function boxOver(startX: number, startY: number, endX: number, endY: number): { x: number; y: number; width: number; height: number } {
  const width = Math.max(A_BOX_IS_AT_LEAST.width, Math.abs(endX - startX))
  const height = Math.max(A_BOX_IS_AT_LEAST.height, Math.abs(endY - startY))
  return { x: Math.max(0, endX < startX ? startX - width : startX), y: Math.max(0, endY < startY ? startY - height : startY), width, height }
}

/** The parts with one box placed at another point. Its lines name the box and not a point, so they follow it. */
function withTheBoxAt(parts: readonly QuickNotePart[], id: string, x: number, y: number): QuickNotePart[] {
  return parts.map((part) => (part.id === id && part.type === 'box' ? { ...part, x: Math.max(0, x), y: Math.max(0, y) } : part))
}

function withTheBoxSize(parts: readonly QuickNotePart[], id: string, width: number, height: number): QuickNotePart[] {
  return parts.map((part) => part.id === id && part.type === 'box'
    ? { ...part, width: Math.max(A_RESIZED_BOX_IS_AT_LEAST.width, width), height: Math.max(A_RESIZED_BOX_IS_AT_LEAST.height, height) }
    : part)
}

/** Where a picture or a film the person adds is placed on the sheet, and how wide it may be drawn there. */
export interface APlaceForFiles {
  x: number
  y: number
  /** The width of the sheet in view, inside its margins, so a file is drawn no wider than the person can see. */
  room: number
}

/** The top left of the part of the sheet in view, inside the margin: where a pasted or chosen file is placed. */
export function thePlaceInView(sheet: HTMLElement): APlaceForFiles {
  const paper = sheet.querySelector<HTMLElement>('.qn-paper')
  if (paper === null || paper.offsetWidth === 0) return { x: sheet.scrollLeft + MARGIN, y: sheet.scrollTop + MARGIN, room: sheet.clientWidth - MARGIN * 2 }
  const sheetRect = sheet.getBoundingClientRect()
  const paperRect = paper.getBoundingClientRect()
  const scale = paperRect.width / paper.offsetWidth
  return {
    x: Math.max(0, (sheetRect.left + sheet.clientLeft - paperRect.left) / scale) + MARGIN,
    y: Math.max(0, (sheetRect.top + sheet.clientTop - paperRect.top) / scale) + MARGIN,
    room: sheet.clientWidth / scale - MARGIN * 2,
  }
}

export interface QuickNoteSheetProps {
  parts: readonly QuickNotePart[]
  tool: QuickNoteTool
  colour: QuickNoteColour
  /** The paths of files a save the office has answered holds, so the file door can find the record that names them. */
  kept: ReadonlySet<string>
  /** The project the note is kept in, where its files are asked for, or undefined before the office has said. */
  project: string | undefined
  /** The note's own record, once the office has filed it, so the file door checks that record. */
  record?: string | undefined
  /** The words or the box being written in, or null. */
  writing: string | null
  setWriting: (id: string | null) => void
  /** Said once before each change the person can take back with one press of Undo. */
  aChangeBegins: () => void
  /** The parts after a change. */
  change: (next: QuickNotePart[]) => void
  /** Words start at the top of an empty sheet when it first draws, so the note opens ready to write. */
  startsWriting: boolean
  /** The element the sheet scrolls in, so the note can place a pasted file in the part of the sheet in view. */
  scroller: RefObject<HTMLDivElement | null>
  /** Check, store and place files dropped on the sheet. */
  addFiles: (files: File[], place: APlaceForFiles) => void
}

/** A gesture under way: what it began on and what it has drawn so far. */
type Gesture =
  | { kind: 'pen'; pointer: number; startX: number; startY: number; moved: boolean; points: number[]; on: string | null }
  | { kind: 'eraser'; pointer: number; took: boolean }
  | { kind: 'two-fingers'; pointers: Map<number, [number, number]>; lastX: number; lastY: number; distance: number }
  | { kind: 'pan'; pointer: number; startX: number; startY: number; fromX: number; fromY: number }
  | { kind: 'box'; pointer: number; startX: number; startY: number; moved: boolean }
  | { kind: 'move'; pointer: number; id: string; startX: number; startY: number; fromX: number; fromY: number; moved: boolean }
  | { kind: 'resize'; pointer: number; id: string; startX: number; startY: number; width: number; height: number; moved: boolean }
  | { kind: 'line'; pointer: number; from: QuickNoteBox; startX: number; startY: number; moved: boolean }

/** A drag that draws a box, draws a line or moves a box, as it stands, shown until it ends or is cancelled. */
type Shaping =
  | { kind: 'box'; x: number; y: number; width: number; height: number }
  | { kind: 'line'; from: QuickNoteBox; x: number; y: number }
  | { kind: 'move'; id: string; x: number; y: number }
  | { kind: 'resize'; id: string; width: number; height: number }

export function QuickNoteSheet(props: QuickNoteSheetProps) {
  const { parts, tool, colour, kept, project, record, writing, setWriting, aChangeBegins, change: changed, startsWriting, scroller, addFiles } = props
  const paper = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const touches = useRef(new Map<number, [number, number]>())
  // THE STROKE BEING DRAWN, drawn on top of everything until the pen lifts and it becomes a part.
  const [drawing, setDrawing] = useState<number[] | null>(null)
  const [shaping, setShaping] = useState<Shaping | null>(null)
  const [room, setRoom] = useState({ width: 0, height: 0 })
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(() => new Map())
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const [hand, setHand] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const space = useRef(false)
  const viewNow = useRef(view)
  const changeView = (next: typeof view) => {
    viewNow.current = next
    setView(next)
  }
  /** Change scale about a point on the screen, keeping the sheet point under it in place. */
  const zoomAt = (wanted: number, clientX: number, clientY: number) => {
    const node = scroller.current
    if (node === null) return
    const before = viewNow.current
    const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, wanted))
    const ratio = zoom / before.zoom
    const rect = node.getBoundingClientRect()
    const x = clientX - rect.left - node.clientLeft + node.scrollLeft
    const y = clientY - rect.top - node.clientTop + node.scrollTop
    changeView({ zoom, x: before.x + (x - before.x) * (1 - ratio), y: before.y + (y - before.y) * (1 - ratio) })
  }
  const zoomAtMiddle = (wanted: number) => {
    const rect = scroller.current?.getBoundingClientRect()
    if (rect !== undefined) zoomAt(wanted, rect.left + rect.width / 2, rect.top + rect.height / 2)
  }
  useEffect(() => {
    const node = scroller.current
    if (node === null) return
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      zoomAt(viewNow.current.zoom * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY)
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => node.removeEventListener('wheel', wheel)
  }, [])
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return
      if (!(event.target instanceof Element) || event.target.closest('.qn-note') === null) return
      const controls = 'button, a, summary, input, textarea, select, [contenteditable], [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="link"], [role="menuitem"], [role="tab"], [role="slider"]'
      if (event.target.closest(controls) !== null) return
      event.preventDefault()
      space.current = true
      setSpaceHeld(true)
    }
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      space.current = false
      setSpaceHeld(false)
    }
    const blur = () => { space.current = false; setSpaceHeld(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [])
  // THE LATEST PARTS, for the handlers of a gesture that began on an earlier drawing. A change sets them at once, so two
  // moves of the eraser before the next drawing do not bring back what the first one took.
  const latest = useRef(parts)
  latest.current = parts
  const change = (next: QuickNotePart[]) => {
    latest.current = next
    changed(next)
  }

  // THE SHEET IS AT LEAST AS BIG AS THE SPACE IT STANDS IN, and grows past it to hold every part with room to spare.
  useLayoutEffect(() => {
    const node = scroller.current
    if (node === null) return
    const measure = () => setRoom({ width: node.clientWidth, height: node.clientHeight })
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(node)
    return () => watch.disconnect()
  }, [])
  // Words, boxes and added parts grow with their contents. The same heights place additions, lines and the paper edge.
  useLayoutEffect(() => {
    const node = paper.current
    if (node === null) return
    const measured = new Set(parts.filter((part) => part.type === 'words' || part.type === 'added' || part.type === 'box').map((part) => part.id))
    const elements = Array.from(node.children).filter((element): element is HTMLElement => element instanceof HTMLElement && measured.has(element.dataset['part'] ?? ''))
    const targetOf = (element: HTMLElement) => element.classList.contains('qn-box') ? element.querySelector<HTMLElement>('.qn-written, .qn-field') ?? element : element
    const measure = () => {
      const next = new Map(elements.map((element) => {
        const target = targetOf(element)
        if (target === element) return [element.dataset['part']!, element.offsetHeight] as const
        const style = getComputedStyle(element)
        const surround = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
        return [element.dataset['part']!, Math.ceil(target.getBoundingClientRect().height / viewNow.current.zoom + surround)] as const
      }))
      setHeights((before) => before.size === next.size && [...next].every(([id, height]) => before.get(id) === height) ? before : next)
    }
    const watch = new ResizeObserver(measure)
    for (const element of elements) watch.observe(targetOf(element))
    measure()
    return () => watch.disconnect()
  }, [parts, room.width, writing])
  // A BOX BEING MOVED IS DRAWN WHERE IT IS DRAGGED, with its lines, and is kept there only when the drag ends.
  const shown = shaping?.kind === 'move' ? withTheBoxAt(parts, shaping.id, shaping.x, shaping.y)
    : shaping?.kind === 'resize' ? withTheBoxSize(parts, shaping.id, shaping.width, shaping.height) : parts
  const drawn = shown.map((part) => part.type === 'box' ? drawnBox(part, heights) : part)
  const reach = reachOf(drawing === null ? drawn : [...drawn, { id: '', type: 'stroke', colour, width: QUICK_NOTE_PEN_WIDTH, points: drawing }], room.width, heights)
  const width = Math.max(room.width, Math.ceil(reach.right + MARGIN))
  const height = Math.max(room.height, Math.ceil(reach.bottom + MARGIN * 4))

  /** A point of the screen, in pixels of the sheet. */
  const onSheet = (clientX: number, clientY: number): [number, number] => {
    const box = paper.current?.getBoundingClientRect()
    return box === undefined ? [clientX, clientY] : [Math.round((clientX - box.left) / viewNow.current.zoom), Math.round((clientY - box.top) / viewNow.current.zoom)]
  }

  /** New words where a press landed, as wide as the sheet allows, and the cursor in them. */
  const wordsAt = (x: number, y: number, aChange = true) => {
    const left = Math.max(0, x)
    const words: QuickNoteWords = {
      id: aNewPartId('words', latest.current),
      type: 'words',
      x: left,
      y: Math.max(0, y),
      width: drawnWidthOf({ x: left, width: NEW_WORDS_ARE_AT_MOST }, room.width),
      text: '',
    }
    if (aChange) aChangeBegins()
    change([...latest.current, words])
    setWriting(words.id)
  }

  // OPENS READY TO WRITE: an empty sheet starts words at its top, with the cursor in them. A kept note opens with the
  // focus on its sheet, so a picture pasted at once is pasted into it.
  const started = useRef(false)
  useEffect(() => {
    if (started.current || room.width === 0) return
    started.current = true
    if (!startsWriting) {
      paper.current?.focus({ preventScroll: true })
      return
    }
    // THE OPENING WORDS ARE NOT A CHANGE UNDO TAKES BACK: they are where the note starts.
    if (latest.current.length === 0) wordsAt(MARGIN, MARGIN - 4, false)
  })

  // ESCAPE DURING A DRAG THAT DRAWS A BOX, DRAWS A LINE OR MOVES A BOX CANCELS IT, and nothing is drawn or moved.
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      const now = gesture.current
      if (event.key !== 'Escape' || now === null || (now.kind !== 'box' && now.kind !== 'move' && now.kind !== 'resize' && now.kind !== 'line')) return
      event.preventDefault()
      gesture.current = null
      setShaping(null)
      if (paper.current?.hasPointerCapture(now.pointer) === true) paper.current.releasePointerCapture(now.pointer)
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [])

  /** The box at a point of the screen, when the part drawn on top there is a box. */
  const boxAt = (clientX: number, clientY: number): QuickNoteBox | null => {
    const top = partsAt(clientX, clientY)[0]
    const part = latest.current.find((one) => one.id === top)
    return part?.type === 'box' ? part : null
  }

  /** The end of a drag that draws a box, moves a box or draws a line, let go at a point of the screen. */
  const shapeEnds = (now: Gesture & { kind: 'box' | 'move' | 'resize' | 'line' }, clientX: number, clientY: number) => {
    const [x, y] = onSheet(clientX, clientY)
    if (now.kind === 'box') {
      // A DRAG DRAWS A BOX OVER THE DRAG, AND A PRESS MAKES ONE ROUND THE POINT PRESSED. Either opens to be written in.
      const place = now.moved
        ? boxOver(now.startX, now.startY, x, y)
        : { x: Math.max(0, now.startX - A_PRESSED_BOX.width / 2), y: Math.max(0, now.startY - A_PRESSED_BOX.height / 2), ...A_PRESSED_BOX }
      const box: QuickNoteBox = { id: aNewPartId('box', latest.current), type: 'box', ...place }
      aChangeBegins()
      change([...latest.current, box])
      setWriting(box.id)
      return
    }
    if (now.kind === 'move') {
      // A PRESS ON A BOX THAT DID NOT MOVE IT WRITES IN IT.
      if (!now.moved) {
        setWriting(now.id)
        return
      }
      aChangeBegins()
      change(withTheBoxAt(latest.current, now.id, now.fromX + x - now.startX, now.fromY + y - now.startY))
      return
    }
    if (now.kind === 'resize') {
      if (!now.moved) return
      aChangeBegins()
      change(withTheBoxSize(latest.current, now.id, now.width + x - now.startX, now.height + y - now.startY))
      return
    }
    // A LINE IS DRAWN ONLY WHEN IT IS LET GO ON ANOTHER BOX.
    const to = boxAt(clientX, clientY)
    if (to === null || to.id === now.from.id) return
    const line: QuickNoteLine = { id: aNewPartId('line', latest.current), type: 'line', from: now.from.id, to: to.id }
    aChangeBegins()
    change([...latest.current, line])
  }

  /** Take away every part the eraser touches at one point of the screen. */
  const eraseAt = (clientX: number, clientY: number, now: Gesture & { kind: 'eraser' }) => {
    const [x, y] = onSheet(clientX, clientY)
    const under = new Set(partsAt(clientX, clientY))
    const current = latest.current
    const hit = current.filter((part) => {
      if (part.type === 'words') return false
      if (part.type === 'stroke') return touchesStroke(part, x, y)
      if (part.type === 'line') {
        const ends = endsOfLine(part, current.map((one) => one.type === 'box' ? drawnBox(one, heights) : one))
        return ends !== null && distanceToSegment(x, y, ...ends) <= ERASER_REACH
      }
      return under.has(part.id)
    })
    if (hit.length === 0) return
    if (!now.took) aChangeBegins()
    now.took = true
    change(hit.reduce<QuickNotePart[]>((left, part) => withoutPart(left, part.id), [...current]))
  }

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return
    const moving = event.pointerType !== 'touch' && (event.button === 1 || event.button === 0 && (hand || space.current))
    if (moving) {
      event.preventDefault()
      paper.current?.focus({ preventScroll: true })
      paper.current?.setPointerCapture(event.pointerId)
      const before = viewNow.current
      gesture.current = { kind: 'pan', pointer: event.pointerId, startX: event.clientX, startY: event.clientY, fromX: before.x, fromY: before.y }
      return
    }
    const resize = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-resize-box]') : null
    if (resize === null && aThingOfItsOwn(event.target)) return
    if (event.pointerType === 'touch') {
      touches.current.set(event.pointerId, [event.clientX, event.clientY])
      if (touches.current.size === 2) {
        // A SECOND FINGER MOVES THE SHEET, and the stroke the first one began is not kept.
        const [[ax, ay], [bx, by]] = [...touches.current.values()] as [[number, number], [number, number]]
        setDrawing(null)
        setShaping(null)
        paper.current?.setPointerCapture(event.pointerId)
        gesture.current = { kind: 'two-fingers', pointers: touches.current, lastX: (ax + bx) / 2, lastY: (ay + by) / 2, distance: Math.hypot(ax - bx, ay - by) }
        return
      }
      if (touches.current.size > 2) return
    }
    event.preventDefault()
    // A PRESS ON THE SHEET ENDS THE WRITING AND PUTS THE FOCUS ON THE SHEET, as a press outside a field does anywhere,
    // so a picture pasted next is pasted into the note. The browser does not move it, because the sheet takes the press.
    paper.current?.focus({ preventScroll: true })
    paper.current?.setPointerCapture(event.pointerId)
    if (resize !== null) {
      const part = latest.current.find((one): one is QuickNoteBox => one.id === resize.dataset['resizeBox'] && one.type === 'box')
      if (part !== undefined) {
        const [x, y] = onSheet(event.clientX, event.clientY)
        gesture.current = { kind: 'resize', pointer: event.pointerId, id: part.id, startX: x, startY: y, width: part.width, height: part.height, moved: false }
      }
      return
    }
    if (tool === 'eraser') {
      const now: Gesture & { kind: 'eraser' } = { kind: 'eraser', pointer: event.pointerId, took: false }
      gesture.current = now
      eraseAt(event.clientX, event.clientY, now)
      return
    }
    const [x, y] = onSheet(event.clientX, event.clientY)
    if (tool === 'box') {
      const box = boxAt(event.clientX, event.clientY)
      gesture.current =
        box === null
          ? { kind: 'box', pointer: event.pointerId, startX: x, startY: y, moved: false }
          : { kind: 'move', pointer: event.pointerId, id: box.id, startX: x, startY: y, fromX: box.x, fromY: box.y, moved: false }
      return
    }
    if (tool === 'line') {
      // A LINE BEGINS ON A BOX, and a press anywhere else draws nothing.
      const from = boxAt(event.clientX, event.clientY)
      if (from !== null) gesture.current = { kind: 'line', pointer: event.pointerId, from, startX: x, startY: y, moved: false }
      return
    }
    const on = partsAt(event.clientX, event.clientY)[0] ?? null
    gesture.current = { kind: 'pen', pointer: event.pointerId, startX: x, startY: y, moved: false, points: [x, y], on }
  }

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const now = gesture.current
    if (now === null) return
    if (now.kind === 'two-fingers') {
      if (!now.pointers.has(event.pointerId)) return
      now.pointers.set(event.pointerId, [event.clientX, event.clientY])
      const [[ax, ay], [bx, by]] = [...now.pointers.values()] as [[number, number], [number, number]]
      const [mx, my] = [(ax + bx) / 2, (ay + by) / 2]
      const distance = Math.hypot(ax - bx, ay - by)
      if (now.distance > 0 && distance > 0) zoomAt(viewNow.current.zoom * distance / now.distance, now.lastX, now.lastY)
      const view = viewNow.current
      changeView({ ...view, x: view.x + mx - now.lastX, y: view.y + my - now.lastY })
      now.lastX = mx
      now.lastY = my
      now.distance = distance
      return
    }
    if (now.pointer !== event.pointerId) return
    if (now.kind === 'pan') {
      changeView({ ...viewNow.current, x: now.fromX + event.clientX - now.startX, y: now.fromY + event.clientY - now.startY })
      return
    }
    if (now.kind === 'eraser') {
      eraseAt(event.clientX, event.clientY, now)
      return
    }
    if (now.kind !== 'pen') {
      const [x, y] = onSheet(event.clientX, event.clientY)
      if (!now.moved && Math.hypot(x - now.startX, y - now.startY) < A_PRESS_MOVES_LESS_THAN) return
      now.moved = true
      if (now.kind === 'box') setShaping({ kind: 'box', ...boxOver(now.startX, now.startY, x, y) })
      else if (now.kind === 'move') setShaping({ kind: 'move', id: now.id, x: now.fromX + x - now.startX, y: now.fromY + y - now.startY })
      else if (now.kind === 'resize') setShaping({ kind: 'resize', id: now.id, width: now.width + x - now.startX, height: now.height + y - now.startY })
      else setShaping({ kind: 'line', from: now.from, x, y })
      return
    }
    // EVERY POINT THE BROWSER SAW, not only the last of each frame, so a fast stroke stays a curve.
    const seen = event.nativeEvent.getCoalescedEvents?.() ?? []
    for (const one of seen.length > 0 ? seen : [event.nativeEvent]) {
      const [x, y] = onSheet(one.clientX, one.clientY)
      const lastX = now.points[now.points.length - 2]!
      const lastY = now.points[now.points.length - 1]!
      if (Math.hypot(x - lastX, y - lastY) < 1.5) continue
      if (!now.moved && Math.hypot(x - now.startX, y - now.startY) >= A_PRESS_MOVES_LESS_THAN) now.moved = true
      now.points.push(x, y)
    }
    if (now.moved) setDrawing([...now.points])
  }

  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    touches.current.delete(event.pointerId)
    const now = gesture.current
    if (now === null) return
    if (now.kind === 'two-fingers') {
      if (now.pointers.size < 2) gesture.current = null
      return
    }
    if (now.pointer !== event.pointerId) return
    gesture.current = null
    if (now.kind === 'pan') return
    if (now.kind === 'eraser') return
    if (now.kind !== 'pen') {
      setShaping(null)
      if (event.type !== 'pointercancel') shapeEnds(now, event.clientX, event.clientY)
      return
    }
    setDrawing(null)
    if (event.type === 'pointercancel') return
    if (now.moved) {
      const stroke: QuickNoteStroke = { id: aNewPartId('stroke', latest.current), type: 'stroke', colour, width: QUICK_NOTE_PEN_WIDTH, points: now.points }
      aChangeBegins()
      change([...latest.current, stroke])
      return
    }
    // A PRESS THAT DID NOT MOVE WRITES: in the words or the box it landed on, or in new words where it landed.
    const on = now.on === null ? undefined : latest.current.find((part) => part.id === now.on)
    if (on !== undefined && (on.type === 'words' || on.type === 'box')) {
      setWriting(on.id)
      return
    }
    if (on !== undefined) return
    wordsAt(now.startX, now.startY - 12)
  }

  return (
    <div className="qn-sheet-frame">
    <div
      className="qn-sheet"
      ref={scroller}
      data-tool={tool}
      data-moving={hand || spaceHeld ? 'true' : undefined}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget || event.pointerType === 'touch') return
        if (event.button === 1 || (event.button === 0 && (hand || space.current))) down(event)
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event) => {
        const files = [...event.dataTransfer.files]
        if (files.length === 0) return
        event.preventDefault()
        // A DROPPED FILE GOES WHERE IT IS DROPPED, drawn no wider than the sheet in view.
        const [x, y] = onSheet(event.clientX, event.clientY)
        addFiles(files, { x, y, room: thePlaceInView(event.currentTarget).room })
      }}
    >
      <div
        className="qn-paper"
        ref={paper}
        role="application"
        aria-label={t('quickNote.sheet')}
        tabIndex={-1}
        style={{ width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {shown.map((part, order) => part.type === 'added' ? (
          <AddedDrawn key={part.id} part={part} order={order} roomWidth={room.width} top={reach.tops.get(part.id)} />
        ) : (
          <Part
            key={part.id}
            part={part}
            order={order}
            top={reach.tops.get(part.id)}
            parts={drawn}
            boxHeight={part.type === 'box' ? drawnBox(part, heights).height : undefined}
            kept={kept}
            project={project}
            record={record}
            writing={writing === part.id}
            empty={shown.length === 1}
            roomWidth={room.width}
            setWriting={setWriting}
            aChangeBegins={aChangeBegins}
            change={change}
            latest={latest}
          />
        ))}
        {drawing === null ? null : (
          <StrokeDrawn stroke={{ colour, width: QUICK_NOTE_PEN_WIDTH, points: drawing }} order={parts.length + 1} />
        )}
        {shaping?.kind === 'box' ? (
          <div
            className="qn-shaping"
            data-shaping="box"
            style={{ left: shaping.x, top: shaping.y, width: shaping.width, height: shaping.height, zIndex: parts.length + 1 }}
          />
        ) : null}
        {shaping?.kind === 'line' ? (
          <Arrow ends={[...edgeOf(drawnBox(shaping.from, heights), shaping.x, shaping.y), shaping.x, shaping.y]} order={parts.length + 1} shaping />
        ) : null}
      </div>
    </div>
    <div className="qn-view-controls">
      <button type="button" aria-label={t('quickNote.moveSheet')} title={t('quickNote.moveSheet')} aria-pressed={hand} onClick={() => setHand((before) => !before)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12V5a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v6c0 4-2 7-6 7h-2c-2 0-3-1-4-3l-3-5a1.5 1.5 0 0 1 2.5-1.5L8 14" /></svg>
      </button>
      <button type="button" aria-label={t('quickNote.zoomOut')} title={t('quickNote.zoomOut')} onClick={() => zoomAtMiddle(viewNow.current.zoom / ZOOM_STEP)}>−</button>
      <button type="button" aria-label={t('quickNote.resetZoom')} title={t('quickNote.resetZoom')} onClick={() => zoomAtMiddle(1)}>{Math.round(view.zoom * 100)}%</button>
      <button type="button" aria-label={t('quickNote.zoomIn')} title={t('quickNote.zoomIn')} onClick={() => zoomAtMiddle(viewNow.current.zoom * ZOOM_STEP)}>+</button>
    </div>
    </div>
  )
}

interface PartProps {
  part: QuickNotePart
  order: number
  /** The top the sheet draws the part at when it is not the one the note keeps: words kept with an added part. */
  top: number | undefined
  parts: readonly QuickNotePart[]
  boxHeight: number | undefined
  kept: ReadonlySet<string>
  project: string | undefined
  /** The note's own record, once the office has filed it, so the file door checks that record. */
  record: string | undefined
  writing: boolean
  /** Whether this part is the only one, so the first words show what the sheet is for. */
  empty: boolean
  /** How wide the space the sheet stands in is, so words written in a wider window are drawn within it. */
  roomWidth: number
  setWriting: (id: string | null) => void
  aChangeBegins: () => void
  change: (next: QuickNotePart[]) => void
  latest: { current: readonly QuickNotePart[] }
}

function Part(props: PartProps): ReactNode {
  const { part, order, parts } = props
  switch (part.type) {
    case 'stroke':
      return <StrokeDrawn stroke={part} order={order} />
    case 'line':
      return <LineDrawn line={part} parts={parts} order={order} />
    case 'words':
      return <WordsDrawn {...props} part={part} />
    case 'box':
      return <BoxDrawn {...props} part={part} />
    case 'picture':
    case 'video':
      return <FileDrawn part={part} order={order} kept={props.kept.has(part.path)} project={props.project} record={props.record} />
    case 'added':
      return <AddedDrawn part={part} order={order} roomWidth={props.roomWidth} />
  }
}

function StrokeDrawn({ stroke, order }: { stroke: Pick<QuickNoteStroke, 'colour' | 'width' | 'points'>; order: number }) {
  if (stroke.points.length < 2) return null
  const bounds = boundsOfStroke(stroke)
  return (
    <svg
      className="qn-stroke"
      aria-hidden="true"
      style={{ left: bounds.left, top: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top, zIndex: order }}
    >
      <path d={pathOf(stroke.points, bounds.left, bounds.top)} stroke={QUICK_NOTE_COLOURS[stroke.colour]} strokeWidth={stroke.width} />
    </svg>
  )
}

/** A line between two boxes, with a head at the box it goes to. */
function LineDrawn({ line, parts, order }: { line: QuickNoteLine; parts: readonly QuickNotePart[]; order: number }) {
  const ends = endsOfLine(line, parts)
  if (ends === null) return null
  return <Arrow ends={ends} order={order} />
}

/** An arrow between two points: a line's own, or the line being drawn, marked as such. */
export function Arrow({ ends, order, shaping = false }: { ends: [number, number, number, number]; order: number; shaping?: boolean }) {
  const [ax, ay, bx, by] = ends
  const pad = 8
  const left = Math.min(ax, bx) - pad
  const top = Math.min(ay, by) - pad
  const angle = Math.atan2(by - ay, bx - ax)
  const head = (turn: number): string => `${bx - left - 10 * Math.cos(angle + turn)} ${by - top - 10 * Math.sin(angle + turn)}`
  return (
    <svg
      className="qn-line"
      aria-hidden="true"
      data-shaping={shaping ? 'line' : undefined}
      style={{ left, top, width: Math.abs(bx - ax) + pad * 2, height: Math.abs(by - ay) + pad * 2, zIndex: order }}
    >
      <path d={`M ${ax - left} ${ay - top} L ${bx - left} ${by - top} M ${head(0.45)} L ${bx - left} ${by - top} L ${head(-0.45)}`} />
    </svg>
  )
}

/** Words a person writes in: a field while they write, and drawn with their formatting when they stop. */
function WordsDrawn({ part, order, top = part.y, writing, empty, roomWidth, setWriting, aChangeBegins, change, latest }: PartProps & { part: QuickNoteWords }) {
  return (
    <div className="qn-words" data-part={part.id} style={{ left: part.x, top, width: drawnWidthOf(part, roomWidth), zIndex: order }}>
      {writing ? (
        <Writing
          text={part.text}
          label={t('quickNote.words')}
          placeholder={empty ? t('quickNote.placeholder') : undefined}
          aChangeBegins={aChangeBegins}
          write={(text) => change(latest.current.map((one) => (one.id === part.id ? { ...part, text } : one)))}
          done={() => {
            setWriting(null)
            // WORDS THAT WERE ALL DELETED ARE TAKEN AWAY, because a note keeps no empty words.
            if (part.text.trim() === '' || latest.current.find((one) => one.id === part.id && one.type === 'words' && one.text.trim() === '')) {
              change(latest.current.filter((one) => one.id !== part.id))
            }
          }}
        />
      ) : (
        <div className="qn-written">{renderMarkdown(part.text, `qn-${part.id}`, null, null, { lineBreaks: true })}</div>
      )}
    </div>
  )
}

/** A box, with its words drawn in it, or a field for them while the person writes. */
function BoxDrawn({ part, order, writing, setWriting, aChangeBegins, change, latest, boxHeight }: PartProps & { part: QuickNoteBox }) {
  return (
    <div className="qn-box" data-part={part.id} style={{ left: part.x, top: part.y, width: part.width, height: boxHeight, zIndex: order }}>
      {writing ? (
        <Writing
          text={part.text ?? ''}
          label={t('quickNote.boxWords')}
          aChangeBegins={aChangeBegins}
          write={(text) =>
            change(
              latest.current.map((one) => {
                if (one.id !== part.id || one.type !== 'box') return one
                // A BOX WITH NO WORDS KEEPS NO TEXT KEY, as the kind asks.
                const { text: _old, ...rest } = one
                return text === '' ? rest : { ...rest, text }
              }),
            )
          }
          done={() => setWriting(null)}
        />
      ) : (
        <div className="qn-written">{part.text === undefined ? null : renderMarkdown(part.text, `qn-${part.id}`, null, null, { lineBreaks: true })}</div>
      )}
      <button
        type="button"
        className="qn-resize-box"
        data-resize-box={part.id}
        aria-label={t('quickNote.resizeBox')}
        title={t('quickNote.resizeBox')}
        onKeyDown={(event) => {
          const dx = event.key === 'ArrowRight' ? 10 : event.key === 'ArrowLeft' ? -10 : 0
          const dy = event.key === 'ArrowDown' ? 10 : event.key === 'ArrowUp' ? -10 : 0
          if (dx === 0 && dy === 0) return
          event.preventDefault()
          aChangeBegins()
          change(withTheBoxSize(latest.current, part.id, part.width + dx, part.height + dy))
        }}
      />
    </div>
  )
}

/** The field a person writes in: as tall as its words, with the cursor in it when it first draws. */
function Writing({ text, label, placeholder, aChangeBegins, write, done }: {
  text: string
  label: string
  placeholder?: string | undefined
  aChangeBegins: () => void
  write: (text: string) => void
  done: () => void
}) {
  const field = useRef<HTMLTextAreaElement>(null)
  const began = useRef(false)
  useLayoutEffect(() => {
    const node = field.current
    if (node === null) return
    node.style.height = '0px'
    node.style.height = `${node.scrollHeight}px`
  })
  useEffect(() => {
    const node = field.current
    if (node === null) return
    node.focus({ preventScroll: true })
    node.setSelectionRange(node.value.length, node.value.length)
  }, [])
  return (
    <textarea
      ref={field}
      className="qn-field"
      aria-label={label}
      value={text}
      rows={1}
      spellCheck
      {...(placeholder === undefined ? {} : { placeholder })}
      onChange={(event) => {
        // ONE PRESS OF UNDO TAKES BACK EVERYTHING WRITTEN SINCE THE FIELD OPENED.
        if (!began.current) aChangeBegins()
        began.current = true
        write(event.target.value)
      }}
      onBlur={done}
      onKeyDown={(event) => {
        if (event.key === 'Escape') field.current?.blur()
      }}
    />
  )
}

/** A picture or a film the office keeps, asked for once a save holding it has been answered. */
function FileDrawn({ part, order, kept, project, record }: {
  part: QuickNoteFile & { type: 'picture' | 'video'; alt?: string }
  order: number
  kept: boolean
  project: string | undefined
  record: string | undefined
}) {
  const alt = part.alt ?? part.name
  return (
    <figure className="qn-file" data-part={part.id} data-type={part.type} style={{ left: part.x, top: part.y, width: part.width, height: part.height, zIndex: order }}>
      {kept ? <StoredFile part={part} alt={alt} project={project} record={record} /> : <p className="qn-file-wait">{t('quickNote.picture.storing', { name: part.name })}</p>}
    </figure>
  )
}

function StoredFile({ part, alt, project, record }: { part: QuickNoteFile & { type: 'picture' | 'video' }; alt: string; project: string | undefined; record: string | undefined }) {
  // A FILM IS ASKED FOR ITS HEADERS ONLY, as a report's film is, and its player then asks for the bytes itself, in the
  // same project, which usePictureBytes writes into the player's address.
  const { outcome } = usePictureBytes(part.path, true, project, part.type === 'video', false, record)
  const picture: ImageBlock = { id: part.id, type: 'image', path: part.path, alt }
  return (
    <>
      {/* THE REPORT'S OWN STYLESHEET, because the picture, the film, the link that saves a film whole and every refusal
          are the report's own components. The note page is drawn in place of the shell, so nothing the shell draws
          brings this stylesheet with it. React de-duplicates it by href, so a note with many files gets one copy. */}
      <SummaryStyle />
      {part.type === 'video' ? (
        <Player block={{ id: part.id, type: 'video', path: part.path, alt }} outcome={outcome} />
      ) : (
        <ImagePreview block={picture} outcome={outcome} />
      )}
    </>
  )
}

/** Something copied in from a page: placed and framed here, and drawn inside by QuickNoteAddedPart. */
function AddedDrawn({ part, order, roomWidth, top = part.y }: { part: QuickNoteAdded; order: number; roomWidth: number; top?: number }) {
  return (
    <section className="qn-added" data-part={part.id} style={{ left: part.x, top, width: drawnWidthOf(part, roomWidth), zIndex: order }}>
      <QuickNoteAddedPart part={part} />
    </section>
  )
}
