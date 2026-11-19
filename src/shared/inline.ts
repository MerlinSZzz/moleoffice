// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { OFFICE_PAGE_PATH_SOURCE } from './office-address.ts'

/**
 * ONE READING OF INLINE MARKDOWN, FOR EVERY SURFACE IN THIS PRODUCT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Inside a line, five things mean something: two asterisks make bold, one makes italic, back ticks
 * make code, square brackets and round brackets make a link, and dollar signs make mathematics:
 * one either side for a formula inside the line, two either side for a formula on a line of its own.
 * That answer used to be written once inside `SummaryBlocks.tsx`, where only a record could reach
 * it, so a plan printed its dollar signs while a record beside it drew the equation. The same fact
 * worked out in two places is the defect this repository keeps producing, so there is now one
 * reader and one drawing and both live here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT STAYS SEPARATE, AND WHY THAT IS NOT DRIFT
 * ---------------------------------------------------------------------------------------
 *
 * Only the INSIDE of a line is shared. Which lines are headings, bullets, tick boxes, numbered
 * items and tables is answered twice on purpose: `src/shared/plandoc.ts` for a plan, and
 * `renderMarkdown` in `SummaryBlocks.tsx` for a record. They are different jobs.
 *
 * A plan's block reader must be BYTE EXACT AND LINE ADDRESSABLE. Every line of a plan is a stored
 * row that somebody can file as work, give hours to and point at a record, so the reader has to
 * hand back every character it was given, in the same lines, with the same ids. A record's summary
 * has no stored lines and no addresses; it reflows paragraphs, joins wrapped lines and drops blank
 * ones, which a plan may never do.
 *
 * DO NOT MERGE THE BLOCK READERS. Making the plan reader reflow would silently rewrite what
 * somebody typed; making the record reader byte exact would give a summary a line model nothing
 * uses. The inside of a line has neither problem, which is exactly why it is the half that moved.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A FILE UNDER src/shared DRAWS REACT ELEMENTS
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared` means "read the same way by both ends". Everything else here is a pure function the
 * server also calls; this one is not. It imports `MathText` out of `src/web`, and the names hook
 * and the link words a record id is drawn with. That is on purpose and it is the smaller of two
 * evils: the alternative was to hand the maths drawing in as an argument at every call site, which
 * makes the second copy expensive to delete, and the second copy is the thing this file exists to
 * kill. NOTHING ON THE SERVER MAY IMPORT THIS FILE — it would pull React into Fastify. The pure
 * half, `inlinePieces`, is separated out below and is safe anywhere.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT READ
 * ---------------------------------------------------------------------------------------
 *
 * Underscore italics are not read, because max_width and ~/my_file are everywhere in this
 * app and turning half of them into italics would corrupt real values. A LINK INSIDE BOLD OR
 * ITALICS IS READ, with the same address test every other link gets, so a heading that holds a
 * report link draws a link on a report page and in the chat alike. OTHER MARKERS INSIDE BOLD OR
 * ITALICS ARE NOT READ and stay as the characters typed: bold inside a link, a second bold inside
 * bold, and code or maths inside either. One consequence, said so nobody has to find it: a link
 * written inside back ticks or dollar signs within bold is still drawn as a link, while the back
 * ticks or dollar signs around it stay characters. An image is not drawn — it says so, in place,
 * and shows the source, because an image belongs in an image block where its path is copyable.
 *
 * TWO DOLLAR SIGNS THAT CLOSE NOTHING STAY THE CHARACTERS TYPED, and the second of them opens no
 * inline formula with a later dollar sign. A FORMULA HOLDS NO BACK TICK, so a dollar sign inside
 * code stays a character even when a dollar sign before the code could pair with it. One thing is
 * still read wrong, as it always was: a dollar sign used for money pairs with the next dollar sign
 * on the line, which may be the first of a formula. Nothing in a line says which one is money.
 */

import { createElement as h, useContext, type ReactNode } from 'react'
import { MathText } from '../web/components/MathText.tsx'
import { HowLinksAreDrawn, theWordsOfALink } from '../web/components/ChatLinks.tsx'
import { recordPath } from '../web/components/router.tsx'
import { useInspect } from '../web/lib/mode.ts'
import { aRecordNameIsStillComing, useRecordNames } from '../web/lib/titles.ts'
import { CHAT_WORDS, piecesOfBody } from './messages.ts'

// ============================================================ where the words came from

/**
 * WHERE A STRETCH OF THE STRING BEING DRAWN IS STORED.
 *
 * A caller that knows which stored string it is drawing hands one of these in, and every run of
 * drawn text that really is a run of stored characters comes out carrying the two attributes that
 * say so — see the DOM contract in src/shared/targets.ts. A selection can then be turned back into
 * a range of the stored string by arithmetic, instead of being searched for.
 *
 * IT IS CALLED WITH THE POSITION AND LENGTH OF A STRETCH INSIDE THE STRING THIS FILE WAS GIVEN, and
 * it answers with the attributes, or with null when Mole Office cannot say. Null is a real answer and
 * happens for a reason: a sentence drawn out of two stored lines joined together is not one run of
 * stored characters, and claiming an offset for it would make Mole Office report later that text nobody
 * touched had changed.
 *
 * THE MARKERS ARE NOT PART OF WHAT IS DRAWN. Two asterisks are stored and never drawn, so the run
 * this file asks about is the text inside them, at the position that text sits in the stored
 * string. That is what makes the arithmetic come out right for bold, code and a link.
 */
export type TextOrigin = (from: number, length: number) => Record<string, string> | null

// ============================================================ the pure reader

/**
 * One stretch of a line, and what it means.
 *
 * `raw` is the characters this piece was made from, always. Every character of the source is in
 * exactly one piece, so joining the `raw` of every piece gives the source back unchanged — the
 * property tests/inline.test.ts proves, and the reason nothing here can lose a word.
 */
export type InlinePiece =
  /** Ordinary words. There is no `text` beside `raw` because they would always be equal. */
  | { kind: 'words'; raw: string }
  /** Two asterisks either side. A link inside it is drawn as a link. */
  | { kind: 'bold'; raw: string; text: string }
  /** One asterisk either side. A link inside it is drawn as a link. */
  | { kind: 'italic'; raw: string; text: string }
  /** Back ticks either side. Drawn in the mono face, never read for markers inside. */
  | { kind: 'code'; raw: string; text: string }
  /**
   * Dollar signs either side. `tex` is what is between them, for MathText to read. Two either side
   * make a display, drawn on a line of its own, and set `display`.
   */
  | { kind: 'maths'; raw: string; tex: string; display?: true }
  /** Square brackets then round brackets. `href` may not be a web address; see isWebAddress. */
  | { kind: 'link'; raw: string; text: string; href: string }
  /** An exclamation mark then a link. Said, not drawn — an image belongs in an image block. */
  | { kind: 'image'; raw: string }

/**
 * One pass, ordered so the longest markers are tried first: dollars and back ticks before
 * asterisks and brackets, and the image before the link it starts with.
 *
 * TWO DOLLAR SIGNS COME FIRST, so a display opens with its own two dollars rather than an inline
 * formula on the first one. Two that close nothing are the second group, matched only so that
 * their second dollar cannot open an inline formula; `inlinePieces` leaves them in the words.
 * A carriage return either side of a display is taken into it. That is the line break the chat
 * joins a paragraph's lines with, and beside a formula that is a line already it would draw an
 * empty line.
 */
const INLINE =
  /(\r?\$\$[^$`\n]+\$\$\r?)|(\$\$)|(\$[^$`\n]+\$)|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(!\[[^\]\n]*\]\([^)\s]*\))|(\[[^\]\n]+\]\([^)\s]+\))/g

/** The two dollar signs, and the line break beside them, round the formula of a display. */
const DISPLAY_EDGES = /^\r?\$\$|\$\$\r?$/g

/**
 * Split one line into its pieces. Pure: no React, no database, safe to call anywhere.
 *
 * Nothing is dropped and nothing is invented. Characters between two markers come back as `words`,
 * and a marker that never closes is `words` too, because half a marker is what somebody typed.
 */
export function inlinePieces(src: string): InlinePiece[] {
  const out: InlinePiece[] = []
  let last = 0
  INLINE.lastIndex = 0

  for (;;) {
    const found = INLINE.exec(src)
    if (found === null) break
    // Two dollar signs that close nothing: `last` stays, so they are words with the words round them.
    if (found[2] !== undefined) continue
    if (found.index > last) out.push({ kind: 'words', raw: src.slice(last, found.index) })
    out.push(pieceOf(found[0]))
    last = found.index + found[0].length
  }

  if (last < src.length) out.push({ kind: 'words', raw: src.slice(last) })
  return out
}

/** Which marker a matched token carries. The order matches the order in INLINE. */
function pieceOf(token: string): InlinePiece {
  if (token.startsWith('$$') || token.startsWith('\r')) {
    return { kind: 'maths', raw: token, tex: token.replace(DISPLAY_EDGES, ''), display: true }
  }
  if (token.startsWith('$')) return { kind: 'maths', raw: token, tex: token.slice(1, -1) }
  if (token.startsWith('`')) return { kind: 'code', raw: token, text: token.slice(1, -1) }
  if (token.startsWith('**')) return { kind: 'bold', raw: token, text: token.slice(2, -2) }
  if (token.startsWith('![')) return { kind: 'image', raw: token }
  if (token.startsWith('[')) {
    const split = token.indexOf('](')
    return { kind: 'link', raw: token, text: token.slice(1, split), href: token.slice(split + 2, -1) }
  }
  return { kind: 'italic', raw: token, text: token.slice(1, -1) }
}

/**
 * Whether a link target is an address a browser can open.
 *
 * Only http, https and mailto. Anything else — a file:// path, a javascript: URL — is shown as the
 * text and the target it is, so a link that could never work is not dressed up as one that could.
 */
export function isWebAddress(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href)
}

/**
 * WHETHER A LINK TARGET IS A PAGE OF THE OFFICE ITSELF: an address that starts with `#/`, as `#/r/<id>` does
 * (wave 13k round 35). Every record a report names is a link the reader can open. It
 * is a place in this page, so it is drawn as a live link that stays in the same window; it can reach no other
 * site and run nothing. Spaces are not an address. The shared page alphabet also excludes quotes, angle
 * brackets and query punctuation; the whole target must match, including its last character.
 */
const OFFICE_PAGE_ADDRESS = new RegExp(`^(?:${OFFICE_PAGE_PATH_SOURCE})$`)

export function isOfficeAddress(href: string): boolean {
  return OFFICE_PAGE_ADDRESS.test(href)
}

// ============================================================ the one drawing

/**
 * A LINK, FOUND INSIDE BOLD OR ITALICS.
 *
 * The one marker this file reads inside another. An image is left out with a look behind, so
 * `![alt](p.png)` inside bold stays the characters somebody typed rather than becoming a link
 * that starts one character late.
 */
const LINK_INSIDE = /(?<!!)\[[^\]\n]+\]\([^)\s]+\)/g

/**
 * The pieces of one line, drawn.
 *
 * Everything is built as React elements, never as an HTML string, so there is no path by which
 * text somebody typed can become markup. `keyPrefix` only has to be unique among its siblings.
 *
 * `origin` is optional and every caller that leaves it out gets exactly what this file drew before
 * it existed. A caller that supplies one gets the same drawing with the two provenance attributes
 * on each element whose text is a run of stored characters — see `TextOrigin`.
 */
export function renderInline(src: string, keyPrefix: string, origin?: TextOrigin): ReactNode[] {
  // Where each piece starts in `src`. Every character of `src` is in exactly one piece's `raw`, so
  // running the lengths up is the position, and nothing has to search for it.
  let at = 0
  return inlinePieces(src).flatMap((piece, n) => {
    const drawn = drawPiece(piece, `${keyPrefix}-i${n}`, at, origin)
    at += piece.raw.length
    return drawn
  })
}

/** The attributes a run of drawn text carries, or none when Mole Office cannot say where it came from. */
function marksOf(from: number, length: number, origin?: TextOrigin): Record<string, string> {
  if (origin === undefined) return {}
  return origin(from, length) ?? {}
}

/** One run of ordinary words, wrapped only when there is something to say about where it came from. */
function wordsAt(raw: string, key: string, from: number, origin?: TextOrigin): ReactNode {
  const marks = marksOf(from, raw.length, origin)
  // A bare string, so ordinary words stay ordinary text nodes.
  return Object.keys(marks).length > 0 ? h('span', { key, ...marks }, raw) : raw
}

/**
 * The parts of a run of ordinary words, when a record id is one of them. Null means there is none
 * and the caller draws the run as it always did.
 *
 * WHAT A RECORD ID IS HERE is what `piecesOfBody` in src/shared/messages.ts says it is, the rule the
 * chat has always read: twelve characters of the id alphabet standing alone, that are not a word made
 * only of letters, and not part of a page address. A commit hash or a code of the same shape passes
 * that test too, and that is why the guess is safe: `RecordIdLink` draws a link only when the office
 * answers with a record of that id, and draws everything else as the characters typed.
 */
function idsInside(raw: string, key: string, from: number, origin?: TextOrigin): ReactNode[] | null {
  const pieces = piecesOfBody(raw)
  if (!pieces.some((piece) => piece.what === 'record')) return null
  const out: ReactNode[] = []
  let at = 0
  pieces.forEach((piece, n) => {
    if (piece.what === 'record') {
      out.push(h(RecordIdLink, { key: `${key}-r${String(n)}`, recordId: piece.recordId, marks: marksOf(from + at, piece.text.length, origin) }))
    } else {
      // A PAGE ADDRESS IS WORDS HERE. The chat draws it as a press of its own, from these words.
      out.push(wordsAt(piece.text, `${key}-w${String(n)}`, from + at, origin))
    }
    at += piece.text.length
  })
  return out
}

/**
 * A RECORD ID IN THE WORDS, DRAWN AS A LINK TO ITS PAGE WITH THE RECORD'S SHORT NAME, when the office
 * knows the record. The names are read by `useRecordNames`, so every id drawn in one tick is asked
 * about in one request, and a long report adds one request however many ids it holds.
 *
 * AN ID THE OFFICE DOES NOT KNOW STAYS THE CHARACTERS TYPED, and names nothing. So does the id of a
 * record the reader may not read. The names door leaves both out of its answer alike, so the drawing
 * cannot tell them apart and says nothing about either. A read that failed draws the id the same way.
 * While the answer is coming the id is drawn as typed with a mark saying so, because its words may
 * change length when the name comes.
 *
 * THE LINK CARRIES NO OFFSET, because it draws the name and not the stored characters. The chat hands
 * down which name to draw and where the link sits, as the reader chose them. Elsewhere the defaults
 * are used.
 */
export function RecordIdLink({ recordId, marks }: { recordId: string; marks: Record<string, string> }): ReactNode {
  const { level, layout } = useContext(HowLinksAreDrawn)
  const inspect = useInspect()
  const named = useRecordNames([recordId], level).get(recordId) ?? null
  if (named !== null) {
    return h(
      'a',
      {
        className: 'px-in-link',
        href: `#${recordPath(recordId)}`,
        'data-named': named.from,
        'data-layout': layout,
        // Said only where the title stands in for a label nobody wrote.
        title: named.standingIn ? CHAT_WORDS.titleStandsInForTheLabel : undefined,
      },
      theWordsOfALink({ what: 'record', text: recordId, recordId }, named, inspect),
    )
  }
  if (aRecordNameIsStillComing(recordId, level)) return h('span', { 'data-named': 'reading', ...marks }, recordId)
  return Object.keys(marks).length > 0 ? h('span', marks, recordId) : recordId
}

function drawPiece(piece: InlinePiece, key: string, at: number, origin?: TextOrigin): ReactNode {
  switch (piece.kind) {
    case 'words':
      return idsInside(piece.raw, key, at, origin) ?? wordsAt(piece.raw, key, at, origin)
    case 'maths': {
      // WHERE THE FORMULA IS STORED rides on the element and is not drawn; see `marks` on MathText.
      const marks = marksOf(at + piece.raw.indexOf('$') + (piece.display ? 2 : 1), piece.tex.length, origin)
      return h(MathText, { key, tex: piece.tex, display: piece.display, ...(Object.keys(marks).length > 0 ? { marks } : {}) })
    }
    case 'code':
      return h('code', { key, className: 'px-in-code', ...marksOf(at + 1, piece.text.length, origin) }, piece.text)
    case 'bold':
      return drawMarker('strong', piece.text, 2, key, at, origin)
    case 'italic':
      return drawMarker('em', piece.text, 1, key, at, origin)
    case 'link':
      return drawLink(piece, key, marksOf(at + 1, piece.text.length, origin))
    case 'image':
      return h(
        'span',
        { key, className: 'px-in-note', role: 'note' },
        'not rendered: use an image block — ',
        h('code', null, piece.raw),
      )
  }
}

/**
 * Bold or italic, with a link inside it drawn as a link.
 *
 * THE OUTER ELEMENT CARRIES NO OFFSET WHEN IT HOLDS A LINK, because an element carrying an offset
 * must hold exactly the characters that offset names. The words around the link and the link's own
 * words carry their offsets instead, each over the run it really draws.
 */
function drawMarker(
  tag: 'strong' | 'em',
  text: string,
  marker: number,
  key: string,
  at: number,
  origin?: TextOrigin,
): ReactNode {
  const inside = linksInside(text, key, at + marker, origin) ?? idsInside(text, key, at + marker, origin)
  if (inside === null) return h(tag, { key, ...marksOf(at + marker, text.length, origin) }, text)
  return h(tag, { key }, inside)
}

/**
 * The parts of a bold or italic run, when a link is one of them. Null means there is no link and
 * the caller draws the run as one plain string, exactly as before.
 */
function linksInside(text: string, key: string, at: number, origin?: TextOrigin): ReactNode[] | null {
  const found = [...text.matchAll(LINK_INSIDE)]
  if (found.length === 0) return null
  const out: ReactNode[] = []
  let last = 0
  // The words around a link are words like any others, so a record id in them is drawn as one.
  const words = (raw: string, wordsKey: string, from: number): ReactNode[] =>
    idsInside(raw, wordsKey, from, origin) ?? [wordsAt(raw, wordsKey, from, origin)]
  found.forEach((one, n) => {
    const index = one.index ?? 0
    if (index > last) out.push(...words(text.slice(last, index), `${key}-w${String(n)}`, at + last))
    const piece = pieceOf(one[0])
    if (piece.kind === 'link') {
      out.push(drawLink(piece, `${key}-l${String(n)}`, marksOf(at + index + 1, piece.text.length, origin)))
    }
    last = index + one[0].length
  })
  if (last < text.length) out.push(...words(text.slice(last), `${key}-w${String(found.length)}`, at + last))
  return out
}

function drawLink(piece: Extract<InlinePiece, { kind: 'link' }>, key: string, marks: Record<string, string>): ReactNode {
  // A PAGE OF THE OFFICE OPENS HERE, in the same window, with the link's own look.
  if (isOfficeAddress(piece.href)) return h('a', { key, className: 'px-in-link', href: piece.href, ...marks }, piece.text)
  if (isWebAddress(piece.href)) {
    return h(
      'a',
      { key, className: 'px-in-link', href: piece.href, target: '_blank', rel: 'noreferrer noopener', ...marks },
      piece.text,
    )
  }
  // A DEAD LINK DRAWS ITS ADDRESS BESIDE ITS WORDS, so the outer element holds more characters than
  // the stored words. The provenance goes on an inner element around the words alone, and only when
  // there is any — an element carrying an offset must hold exactly the characters that offset names.
  const words = Object.keys(marks).length === 0 ? piece.text : h('span', { ...marks }, piece.text)
  return h(
    'span',
    { key, className: 'px-in-dead', title: 'Not a web address, so it is shown rather than linked' },
    words,
    ' ',
    h('code', null, piece.href),
  )
}

// ============================================================ styles

/**
 * The rules for what this file draws.
 *
 * A component that calls renderInline has to put this in its own stylesheet, because these class
 * names are only ever written here. It is one string so the drawing and its rules cannot drift.
 */
export const INLINE_CSS = `
.px-in-code { font-family: var(--font-mono); font-size: .92em; background: var(--panel-2);
  border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0 3px;
  overflow-wrap: anywhere; }
.px-in-link { color: var(--accent); text-underline-offset: 2px; }
.px-in-link:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px;
  border-radius: var(--radius-sm); }
.px-in-link[data-layout='own-line'] { display: inline-block; width: 100%; text-align: center; }
.px-in-link[data-layout='inline'] { display: inline; text-align: inherit; }
.px-in-dead { color: var(--text-2); }
.px-in-dead code { font-family: var(--font-mono); font-size: .92em; }
.px-in-note { color: var(--st-inferred); font-size: var(--fs-1); }
.px-in-note code { font-family: var(--font-mono); overflow-wrap: anywhere; }
`
