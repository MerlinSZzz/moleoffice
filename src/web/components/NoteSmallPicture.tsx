// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A QUICK NOTE'S SMALL PICTURE AND FIRST WORDS, as the My notes page draws them on each card (src/web/pages/MyNotesPage.tsx).
 *
 * THE PICTURE IS WORKED OUT FROM THE NOTE'S STORED PARTS EACH TIME IT IS DRAWN. No picture of the note is kept, so the
 * card cannot show a drawing the note no longer holds. It draws the note's strokes, boxes and the lines between boxes,
 * and nothing else: words, pictures, films and added things are counted on the card instead of drawn small.
 *
 * The functions are exported apart from the component so a test reads them with no DOM.
 */
import { quickNoteTitleOf, type QuickNoteColour, type QuickNotePart } from '@shared/kinds/quick-note.ts'
import { t } from '@shared/i18n.ts'
import { holdsADrawing } from '@shared/my-notes.ts'
import { theTitleFollowsTheWords } from '../lib/quick-note-title.ts'

/** Room left around the drawing, in the note's own units, so a stroke at the edge is not cut. */
const ROOM = 8

export interface TheSmallPicture {
  /** The part of the sheet the picture shows: every drawn part, with room around it. */
  frame: { x: number; y: number; width: number; height: number }
  strokes: { id: string; colour: QuickNoteColour; width: number; points: string }[]
  boxes: { id: string; x: number; y: number; width: number; height: number }[]
  /** Each line from the middle of one box to the middle of the other. The boxes are drawn over it. */
  lines: { id: string; x1: number; y1: number; x2: number; y2: number }[]
}

/**
 * The small picture of a note's drawing, or null when the note holds none. Whether it holds one is the rule the office
 * counts the "With a drawing" choice by, so a card has a picture exactly when that choice keeps its note.
 */
export function theSmallPictureOf(parts: readonly QuickNotePart[]): TheSmallPicture | null {
  if (!holdsADrawing(parts)) return null
  const strokes: TheSmallPicture['strokes'] = []
  const boxes: TheSmallPicture['boxes'] = []
  const middles = new Map<string, { x: number; y: number }>()
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  const holds = (x1: number, y1: number, x2: number, y2: number): void => {
    left = Math.min(left, x1)
    top = Math.min(top, y1)
    right = Math.max(right, x2)
    bottom = Math.max(bottom, y2)
  }
  for (const part of parts) {
    if (part.type === 'stroke') {
      const pairs: string[] = []
      const half = part.width / 2
      for (let at = 0; at + 1 < part.points.length; at += 2) {
        const x = part.points[at]!
        const y = part.points[at + 1]!
        pairs.push(`${String(x)},${String(y)}`)
        holds(x - half, y - half, x + half, y + half)
      }
      if (pairs.length > 0) strokes.push({ id: part.id, colour: part.colour, width: part.width, points: pairs.join(' ') })
    } else if (part.type === 'box') {
      boxes.push({ id: part.id, x: part.x, y: part.y, width: part.width, height: part.height })
      middles.set(part.id, { x: part.x + part.width / 2, y: part.y + part.height / 2 })
      holds(part.x, part.y, part.x + part.width, part.y + part.height)
    }
  }
  const lines: TheSmallPicture['lines'] = []
  for (const part of parts) {
    if (part.type !== 'line') continue
    const from = middles.get(part.from)
    const to = middles.get(part.to)
    // The kind refuses a line that names a box the note does not hold, so a stored note always has both ends.
    if (from === undefined || to === undefined) continue
    lines.push({ id: part.id, x1: from.x, y1: from.y, x2: to.x, y2: to.y })
  }
  return {
    frame: { x: left - ROOM, y: top - ROOM, width: right - left + 2 * ROOM, height: bottom - top + 2 * ROOM },
    strokes,
    boxes,
    lines,
  }
}

/** How many of the note's parts the small picture does not draw, by what the card calls them. */
export function whatTheSmallPictureLeavesOut(parts: readonly QuickNotePart[]): { pictures: number; videos: number; added: number } {
  const count = { pictures: 0, videos: 0, added: 0 }
  for (const part of parts) {
    if (part.type === 'picture') count.pictures += 1
    else if (part.type === 'video') count.videos += 1
    else if (part.type === 'added') count.added += 1
  }
  return count
}

/**
 * THE NOTE'S FIRST WORDS: its title by the kind's own rule, and the lines after it. Each line has its marks taken off
 * by the same rule the title is made by, which also cuts a long line at a word. A note with no words has no title, and
 * the card says so rather than inventing one.
 */
export function theFirstWordsOf(parts: readonly QuickNotePart[]): { title: string | null; after: string } {
  const lines: string[] = []
  for (const part of parts) {
    if (part.type !== 'words' && part.type !== 'box') continue
    for (const text of (part.text ?? '').split('\n')) {
      const line = quickNoteTitleOf([{ id: part.id, type: 'words', x: 0, y: 0, width: 0, text }])
      if (line !== null) lines.push(line)
    }
  }
  return { title: quickNoteTitleOf(parts), after: lines.slice(1).join(' ') }
}

/**
 * WHAT A NOTE'S CARD SAYS: a title the person gave the note, with all of its first words after it, or else its first
 * words as above. A title is one the person gave when the note's words do not give it, by the rule the note saves by.
 */
export function theCardWordsOf(title: string, parts: readonly QuickNotePart[]): { title: string | null; after: string } {
  const words = theFirstWordsOf(parts)
  if (theTitleFollowsTheWords(title, parts)) return words
  return { title, after: [words.title ?? '', words.after].filter((one) => one !== '').join(' ') }
}

/** The small picture of a note's drawing, as an SVG that fills the width it is given. Nothing when nothing is drawn. */
export function NoteSmallPicture({ parts }: { parts: readonly QuickNotePart[] }) {
  const picture = theSmallPictureOf(parts)
  if (picture === null) return null
  const { x, y, width, height } = picture.frame
  return (
    <svg
      className="nsp"
      data-part="small-picture"
      viewBox={`${String(x)} ${String(y)} ${String(width)} ${String(height)}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={t('myNotes.drawing')}
    >
      {picture.lines.map((line) => (
        <line key={line.id} className="nsp-line" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} vectorEffect="non-scaling-stroke" />
      ))}
      {picture.boxes.map((box) => (
        <rect key={box.id} className="nsp-box" x={box.x} y={box.y} width={box.width} height={box.height} rx={4} vectorEffect="non-scaling-stroke" />
      ))}
      {picture.strokes.map((stroke) => (
        <polyline
          key={stroke.id}
          className="nsp-stroke"
          data-colour={stroke.colour}
          points={stroke.points}
          strokeWidth={stroke.width}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}
