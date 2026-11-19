// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SENT MESSAGE'S MARKED PARTS, PAINTED ON ITS MARKDOWN, AND THE PARTS THAT CANNOT BE.
 *
 * A part names characters of the stored body. The body is drawn as Markdown, so some of those characters are drawn
 * where they were written, some are drawn as something else, and some are not drawn at all. This file paints a part
 * only on drawn characters whose place in the body is known: a run of drawn text says where it is stored on its two
 * provenance attributes, or on the attribute of a run drawn across line breaks, and the drawn text is checked against
 * the body before anything is painted on it.
 *
 * ONE DRAWN ELEMENT IS PAINTED WHOLE OR NOT AT ALL. A formula, a record id drawn as its record's name, and a page
 * address drawn as a press do not draw their stored characters, so none of their characters can be painted alone.
 * When one part covers the whole source of such an element, the whole element is painted.
 *
 * WHAT CANNOT BE PAINTED IS COUNTED, NEVER GUESSED. A part is not shown in the words when the drawing paints none of
 * it, when it covers some of one drawn element and not all, when it meets something drawn whose place in the body is
 * not known, or when its quote no longer matches the body. The foot of the bubble says how many.
 *
 * ONE WALK DOES BOTH. `markTheDrawing` paints and writes down what it saw, and the count reads what it wrote down
 * from the same drawing, so a part cannot be painted and also counted as not shown, or the other way round.
 */

import { Fragment, cloneElement, isValidElement, useMemo, type ReactElement, type ReactNode } from 'react'

import { RecordIdLink } from '@shared/inline.ts'
import { trimmed } from '@shared/intent.ts'
import type { TheFlagsOfAPerson } from '@shared/intent-mark.ts'
import { piecesOfBody, theMessageInOrder, type BodyPiece } from '@shared/messages.ts'
import { TEXT_FIELD_ATTRIBUTE, TEXT_LINES_ATTRIBUTE, TEXT_OFFSET_ATTRIBUTE } from '@shared/targets.ts'

import { MathText } from '../MathText.tsx'
import { linesOfARun, renderMarkdown, wordsOfATypedTable, type MarkdownOptions } from '../SummaryBlocks.tsx'
import { MarkedPartCount, theDrawingOfAPart, type AMarkedPartToDraw } from './MarkedWords.tsx'

/** The stored field a message keeps its words in, as a region path names it. */
export const MESSAGE_BODY_FIELD = 'data.body'

/** How a message's words are drawn as Markdown, in the chat and on the message's own page. */
export const THE_MARKDOWN_OF_A_MESSAGE: MarkdownOptions = { lineBreaks: true, typedNumbers: true }

/** What a message must carry for its parts to be drawn and counted. */
export interface AMessageWithParts {
  body: string
  quotes: readonly unknown[]
  quotePositions?: readonly number[] | null
  markedParts?: readonly AMarkedPartToDraw[]
}

/**
 * THE PARTS THAT CAN BE DRAWN AT ALL: each a run inside the body whose quote still matches the body's characters there.
 * A part that fails is counted as not shown by `thePartsNotShown`.
 */
export function thePartsToDraw(entry: { body: string; markedParts?: readonly AMarkedPartToDraw[] }): AMarkedPartToDraw[] {
  return (entry.markedParts ?? []).filter((part) => Number.isInteger(part.from) && Number.isInteger(part.to) && part.from >= 0 && part.to > part.from && part.to <= entry.body.length && entry.body.slice(part.from, part.to) === part.quote)
}

/**
 * The message in its stored order, each run of words with where it starts in the body. The chat draws each run as
 * Markdown of its own, and the count reads the same runs.
 */
export function theMessageInPlaces<T>(body: string, quotes: readonly T[], positions: readonly number[] | null): ({ kind: 'words'; text: string; at: number } | { kind: 'quote'; quote: T })[] {
  let at = 0
  return theMessageInOrder(body, quotes, positions).map((part) => {
    if (part.kind === 'quote') return part
    const start = at
    at += part.text.length
    return { ...part, at: start }
  })
}

/** Whether any words under this node hold a record id or a page address, outside code. */
export function drawsPressesInside(node: ReactNode): boolean {
  if (typeof node === 'string') return piecesOfBody(node).some((piece) => piece.what !== 'words')
  if (Array.isArray(node)) return (node as ReactNode[]).some(drawsPressesInside)
  if (isValidElement(node)) {
    if (node.type === 'code') return false
    return drawsPressesInside((node.props as { children?: ReactNode }).children)
  }
  return false
}

/** The attributes a run that will not draw its stored characters loses: none of them would be true of it. */
export const NO_PLACE = { [TEXT_FIELD_ATTRIBUTE]: undefined, [TEXT_OFFSET_ATTRIBUTE]: undefined, [TEXT_LINES_ATTRIBUTE]: undefined }

/** Whether a run says where its characters are stored. */
export function saysWhereItIs(props: Record<string, unknown>): boolean {
  return props[TEXT_OFFSET_ATTRIBUTE] !== undefined || props[TEXT_LINES_ATTRIBUTE] !== undefined
}

/** What the walk saw, in the order it is drawn. Every place is counted in the whole body. */
type Seen =
  /** Drawn characters whose place in the body is known. */
  | { what: 'placed'; from: number; to: number }
  /** One drawn element that is painted whole or not at all, and the run of the body it is drawn from. */
  | { what: 'whole'; from: number; to: number }
  /** Something drawn whose place in the body is not known. */
  | { what: 'unplaced' }

/** How one walk is made. */
export interface HowToMark {
  /** The stored words this drawing was made from: one run of the body. */
  source: string
  /** Where `source` starts in the body. */
  sourceOffset: number
  /** The parts to paint, placed in the whole body. */
  parts: readonly AMarkedPartToDraw[]
  /** The reader's flags, or null to paint nothing and only write down what is drawn. */
  flags: TheFlagsOfAPerson | null
  /** How a page address is drawn as a press, or null where no press is drawn, as inside a table. */
  press: ((piece: Extract<BodyPiece, { what: 'page' }>, key: number) => ReactNode) | null
}

/**
 * THE DRAWING WITH THE PARTS PAINTED ON IT, AND THE PAGE ADDRESSES IN IT DRAWN AS PRESSES, and what was seen.
 *
 * The presses are drawn as `pressesInside` in Chat.tsx draws them: code and a link's words are left alone, and a run
 * that will not draw its stored characters loses the attributes that say where they are.
 */
export function markTheDrawing(node: ReactNode, how: HowToMark): { drawn: ReactNode; seen: Seen[] } {
  const seen: Seen[] = []
  return { drawn: walk(node, how, seen, 'b'), seen }
}

function walk(node: ReactNode, how: HowToMark, seen: Seen[], key: string): ReactNode {
  if (typeof node === 'string') {
    if (node.trim() !== '') seen.push({ what: 'unplaced' })
    return how.press === null ? node : <Fragment key={key}>{piecesOfBody(node).map((piece, at) => (piece.what === 'page' ? how.press?.(piece, at) : <span key={at}>{piece.text}</span>))}</Fragment>
  }
  if (Array.isArray(node)) return (node as ReactNode[]).map((one, at) => walk(one, how, seen, `${key}.${String(at)}`))
  if (!isValidElement(node)) return node

  if (node.type === MathText) return paintedWhole(node, placeOfAFormula(node, how), how, seen)
  if (node.type === RecordIdLink) return paintedWhole(node, placeOfARecordId(node, how), how, seen)
  // A TABLE'S CELLS ARE DRAWN BY ITS COMPONENT, after this walk. They are read here only to write down what they
  // draw, and they are painted when the table draws them, through `PaintTheWords`.
  const cells = wordsOfATypedTable(node)
  if (cells !== null) {
    walk(cells, { ...how, flags: null, press: null }, seen, key)
    return node
  }

  const props = node.props as Record<string, unknown> & { children?: ReactNode }
  // A TYPED LIST NUMBER IS DRAWN BY THE STYLESHEET from an attribute, so its characters are drawn and have no place.
  if (typeof props['data-typed'] === 'string') seen.push({ what: 'unplaced' })
  const held = props.children
  const element = node as ReactElement<{ children?: ReactNode }>
  const presses = how.press !== null && node.type !== 'code' && node.type !== 'a'
  const redrawn = presses && saysWhereItIs(props) && drawsPressesInside(held)
  const places = placesOf(props, held, how)
  if (places !== null) return cloneElement(element, redrawn ? (NO_PLACE as never) : undefined, paintedInside(held, places, how, presses, seen))
  if (held === undefined) {
    // A COMPONENT THAT DRAWS WHAT ITS PROPS SAY, and says nothing about where it is stored.
    if (typeof node.type !== 'string' && node.type !== Fragment) seen.push({ what: 'unplaced' })
    return node
  }
  return cloneElement(element, redrawn ? (NO_PLACE as never) : undefined, walk(held, presses ? how : { ...how, press: null }, seen, `${key}c`))
}

/** Where one run of drawn words starts in `source`, and how long it is. A run drawn across line breaks has several. */
interface APlace {
  at: number
  length: number
}

/**
 * WHERE AN ELEMENT'S DRAWN WORDS ARE STORED, or null when it does not say, or says something its drawn words are not.
 * Its words are read as they are drawn and compared with the stored characters at each place.
 */
function placesOf(props: Record<string, unknown>, held: ReactNode, how: HowToMark): APlace[] | null {
  if (props[TEXT_FIELD_ATTRIBUTE] === MESSAGE_BODY_FIELD) {
    const at = Number(props[TEXT_OFFSET_ATTRIBUTE])
    const drawn = linesDrawnIn(held)
    if (!Number.isInteger(at) || at < 0 || drawn === null || drawn.length !== 1) return null
    const words = drawn[0] ?? ''
    return how.source.slice(at, at + words.length) === words ? [{ at, length: words.length }] : null
  }
  const run = linesOfARun(props[TEXT_LINES_ATTRIBUTE])
  if (run === null || run.field !== MESSAGE_BODY_FIELD) return null
  const drawn = linesDrawnIn(held)
  if (drawn === null || drawn.length !== run.lines.length) return null
  const places = run.lines.map(([at, length]) => ({ at, length }))
  return places.every((place, n) => drawn[n] === how.source.slice(place.at, place.at + place.length) && drawn[n]?.length === place.length) ? places : null
}

/** The words drawn under a node, one string for each line, a `br` between each two; null when a component draws any. */
function linesDrawnIn(node: ReactNode): string[] | null {
  const lines = ['']
  const read = (one: ReactNode): boolean => {
    if (typeof one === 'string') {
      lines[lines.length - 1] += one
      return true
    }
    if (Array.isArray(one)) return (one as ReactNode[]).every(read)
    if (isValidElement(one)) {
      if (one.type === 'br') {
        lines.push('')
        return true
      }
      if (typeof one.type !== 'string' && one.type !== Fragment) return false
      return read((one.props as { children?: ReactNode }).children)
    }
    return one === null || one === undefined || typeof one === 'boolean'
  }
  return read(node) ? lines : null
}

/** The words under a placed element, painted where the parts cover them; each `br` moves on to the next line's place. */
function paintedInside(held: ReactNode, places: readonly APlace[], how: HowToMark, presses: boolean, seen: Seen[]): ReactNode {
  let line = 0
  let cursor = places[0]?.at ?? 0
  const inside = (one: ReactNode, pressing: boolean, key: string): ReactNode => {
    if (typeof one === 'string') {
      const start = cursor
      cursor += one.length
      if (!pressing) return paintedWords(one, start, how, seen)
      let at = start
      return (
        <Fragment key={key}>
          {piecesOfBody(one).map((piece, n) => {
            const from = at
            at += piece.text.length
            if (piece.what === 'page') return paintedWhole(how.press?.(piece, n) ?? null, { from, to: at }, how, seen, n)
            return <span key={n}>{paintedWords(piece.text, from, how, seen)}</span>
          })}
        </Fragment>
      )
    }
    if (Array.isArray(one)) return (one as ReactNode[]).map((each, n) => inside(each, pressing, `${key}.${String(n)}`))
    if (!isValidElement(one)) return one
    if (one.type === 'br') {
      line += 1
      cursor = places[line]?.at ?? cursor
      return one
    }
    const below = (one.props as { children?: ReactNode }).children
    if (below === undefined) return one
    return cloneElement(one as ReactElement<{ children?: ReactNode }>, undefined, inside(below, pressing && one.type !== 'code' && one.type !== 'a', `${key}c`))
  }
  return inside(held, presses, 'w')
}

/** A run of drawn words that starts at `start` in `source`, cut where a part begins or ends and painted under each part. */
function paintedWords(words: string, start: number, how: HowToMark, seen: Seen[]): ReactNode {
  const from = start + how.sourceOffset
  const to = from + words.length
  if (words !== '') seen.push({ what: 'placed', from, to })
  if (how.flags === null) return words
  const over = how.parts.filter((part) => part.from < to && part.to > from).sort((a, b) => a.from - b.from)
  if (over.length === 0) return words
  const out: ReactNode[] = []
  let at = from
  for (const part of over) {
    const begin = Math.max(at, part.from)
    const end = Math.min(to, part.to)
    if (end <= begin) continue
    if (begin > at) out.push(words.slice(at - from, begin - from))
    out.push(thePaint(part, how.flags, begin, end, false, `${String(begin)}-${String(end)}`, words.slice(begin - from, end - from)))
    at = end
  }
  if (at < to) out.push(words.slice(at - from))
  return out
}

/**
 * ONE DRAWN ELEMENT, PAINTED WHOLE when one part covers all of its source, and written down as one element either way.
 * An element whose place is not known is written down as unplaced and drawn as it is.
 */
function paintedWhole(node: ReactNode, place: { from: number; to: number } | null, how: HowToMark, seen: Seen[], key?: number): ReactNode {
  if (place === null) {
    seen.push({ what: 'unplaced' })
    return node
  }
  const from = place.from + how.sourceOffset
  const to = place.to + how.sourceOffset
  seen.push({ what: 'whole', from, to })
  const part = how.flags === null ? undefined : how.parts.find((one) => one.from <= from && one.to >= to)
  if (part === undefined || how.flags === null) return node
  return thePaint(part, how.flags, from, to, true, key ?? (isValidElement(node) ? node.key : null) ?? `${String(from)}-${String(to)}`, node)
}

/** The paint itself: the flag's words colour on what it holds, and the flag's own colour beneath. */
function thePaint(part: AMarkedPartToDraw, flags: TheFlagsOfAPerson, from: number, to: number, whole: boolean, key: string | number, held: ReactNode): ReactNode {
  const drawing = theDrawingOfAPart(part, flags)
  return (
    <span
      key={key}
      className="px-chat-marked px-label-ink"
      data-colour={drawing.flagColour}
      data-words-colour={drawing.wordsColour}
      data-flag-colour={drawing.flagColour}
      data-flag-name={drawing.name}
      data-from={from}
      data-to={to}
      data-whole={whole ? 'yes' : undefined}
      title={drawing.name || undefined}
    >
      {held}
    </span>
  )
}

/**
 * WHERE A FORMULA IS STORED: the run of `source` between its dollar signs, without the spaces at either end, which
 * draw nothing. Null when the formula does not say, or says something the stored characters are not.
 */
function placeOfAFormula(node: ReactElement, how: HowToMark): { from: number; to: number } | null {
  const { tex, marks } = node.props as { tex: string; marks?: Record<string, string> }
  if (marks === undefined) return null
  if (marks[TEXT_FIELD_ATTRIBUTE] === MESSAGE_BODY_FIELD) {
    const at = Number(marks[TEXT_OFFSET_ATTRIBUTE])
    if (!Number.isInteger(at) || at < 0 || how.source.slice(at, at + tex.length) !== tex) return null
    return trimmed(how.source, at, at + tex.length)
  }
  // A FORMULA WRITTEN ACROSS A LINE BREAK is drawn on one line, so its `tex` is not its stored characters. Each of its
  // lines was checked against them when the attribute was written.
  const run = linesOfARun(marks[TEXT_LINES_ATTRIBUTE])
  const first = run?.lines[0]
  const last = run?.lines[run.lines.length - 1]
  if (run === null || run.field !== MESSAGE_BODY_FIELD || first === undefined || last === undefined) return null
  return trimmed(how.source, first[0], last[0] + last[1])
}

/** Where a record id is stored, or null when it does not say, or says something the stored characters are not. */
function placeOfARecordId(node: ReactElement, how: HowToMark): { from: number; to: number } | null {
  const { recordId, marks } = node.props as { recordId: string; marks: Record<string, string> }
  if (marks[TEXT_FIELD_ATTRIBUTE] !== MESSAGE_BODY_FIELD) return null
  const at = Number(marks[TEXT_OFFSET_ATTRIBUTE])
  if (!Number.isInteger(at) || at < 0 || how.source.slice(at, at + recordId.length) !== recordId) return null
  return { from: at, to: at + recordId.length }
}

/**
 * HOW MANY OF A MESSAGE'S PARTS ARE NOT SHOWN IN ITS WORDS, read from the drawing the chat makes of each run of them.
 *
 * Where something is drawn whose place is not known, all the body between the known places either side of it is
 * counted as unknown, and a part that meets it is not shown. That can count a part beside it that was shown, which
 * says less than is true and never more.
 */
export function thePartsNotShown(entry: AMessageWithParts): number {
  const all = entry.markedParts ?? []
  if (all.length === 0) return 0
  const parts = thePartsToDraw(entry)
  const painted = new Set<AMarkedPartToDraw>()
  const notShown = new Set<AMarkedPartToDraw>()
  for (const run of theMessageInPlaces(entry.body, entry.quotes, entry.quotePositions ?? null)) {
    if (run.kind === 'quote') continue
    const drawing = renderMarkdown(run.text, 'chat', { field: MESSAGE_BODY_FIELD, stored: run.text }, null, THE_MARKDOWN_OF_A_MESSAGE)
    const { seen } = markTheDrawing(drawing, { source: run.text, sourceOffset: run.at, parts, flags: null, press: () => null })
    const known = seen.map((one, n) => ({ one, n })).filter((each): each is { one: Exclude<Seen, { what: 'unplaced' }>; n: number } => each.one.what !== 'unplaced')
    const unknown = seen.flatMap((one, n) => {
      if (one.what !== 'unplaced') return []
      const before = known.filter((each) => each.n < n).at(-1)?.one.to ?? run.at
      const after = known.find((each) => each.n > n)?.one.from ?? run.at + run.text.length
      return [{ from: Math.min(before, after), to: Math.max(before, after) }]
    })
    for (const part of parts) {
      for (const { one } of known) {
        const covers = part.from <= one.from && part.to >= one.to
        const meets = part.from < one.to && part.to > one.from
        if (one.what === 'placed' ? meets : covers) painted.add(part)
        if (one.what === 'whole' && meets && !covers) notShown.add(part)
      }
      if (unknown.some((one) => part.from < one.to && part.to > one.from)) notShown.add(part)
    }
  }
  return all.length - parts.length + parts.filter((part) => !painted.has(part) || notShown.has(part)).length
}

/** THE BUBBLE'S FOOT FOR A MESSAGE'S PARTS: how many it has, and how many of them are not shown in the words. */
export function MarkedPartsFoot({ entry }: { entry: AMessageWithParts }): React.JSX.Element | null {
  const { body, quotes, quotePositions, markedParts } = entry
  const notShown = useMemo(() => thePartsNotShown({ body, quotes, quotePositions, markedParts }), [body, quotes, quotePositions, markedParts])
  return (
    <>
      {notShown > 0 ? <MarksOnMarkdownStyle /> : null}
      <MarkedPartCount parts={markedParts ?? []} notShown={notShown} />
    </>
  )
}

/** The rules below, drawn once wherever a part is painted on Markdown or counted as not shown. */
export function MarksOnMarkdownStyle(): React.JSX.Element {
  return (
    <style href="mole-office-marks-on-markdown" precedence="default">
      {MARKS_ON_MARKDOWN_CSS}
    </style>
  )
}

/** The paint on a whole element: its own colours give way to the flag's words colour, and the line sits beneath it. */
export const MARKS_ON_MARKDOWN_CSS = `
.px-chat-marked[data-whole='yes'] { text-decoration: none; border-bottom: 2px solid var(--label-ink); }
.px-chat-marked[data-whole='yes'] a, .px-chat-marked[data-whole='yes'] button { color: inherit; }
.px-chat-marked-not-shown { color: var(--muted); font-size: 0.72rem; }
`
