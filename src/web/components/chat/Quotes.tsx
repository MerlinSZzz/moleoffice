// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUOTE ABOVE A MESSAGE SENT BY POINTING, plan row C1b.
 *
 * A message sent from a right-click carries what it points at: a target, and a place that may hold
 * the words that were selected. It is drawn the way common chat apps draw a
 * reply quote: above the message's own words, a block holding the pointed words and the name of the
 * thing pointed at. The name is a link to where that thing is. A long quote is cut to a few lines on
 * screen; the whole words stay in the record. A message pointing at a whole thing, with no words,
 * draws the block with the name alone.
 *
 * AN AGENT'S MESSAGE IS DRAWN THE SAME WAY. The decision says agents may send by pointing too, and
 * nothing here asks who wrote the message.
 *
 * A MESSAGE MAY CARRY ANY NUMBER OF QUOTES, so the drawing takes a list and
 * draws each quote as its own block, in order, numbered when there is more than one. The list is the
 * message's `quotes`, which the server works out with `quotesOf` in src/shared/messages.ts: the one
 * place a comment was left on, then every entry of the message's own `quotes`.
 */

import { t } from '@shared/i18n.ts'
import { recordNamedByTarget, wordsNamedBy, type Context } from '@shared/targets.ts'
import type { PoolEntry } from '../../api.ts'
import { titleOrSentence } from '../../lib/titles.ts'
import { recordPath } from '../router.tsx'
// WHERE A COMMENT OPENS. One map from a stored context to an address, for the review column, a
// comment's own page, the messages page and this quote alike.
import { pageHolding, rememberTheCardACommentWasOn } from '../agent/ReviewBar.tsx'
// EACH QUOTE SAYS WHICH PART OF ITS MESSAGE IT IS, so a right-click on it takes that quote. Problem
// DowO7yEioWp0. The ids come from the one writer the server's region tree also uses.
import { messageQuoteRegions } from '@shared/regions.ts'
import { theRegion } from '../sections.ts'
import { nameAttributes } from '../agent/pointing.ts'
import { elementDrawing } from '../../lib/drawnhere.ts'

/**
 * A QUOTE WHOSE PART IS DRAWN ON THIS PAGE LANDS ON IT INSTEAD OF LEAVING THE PAGE. Pressing the
 * name scrolls the part into view, marks it, and lights the quoted words for a moment. A part this
 * page is not drawing is still an ordinary link, because there is nothing here to land on.
 *
 * THE LIT WORDS ARE PAINTED WITH THE CSS HIGHLIGHT API and not by wrapping the words in an element:
 * the words are already drawn by the report's own renderer, and wrapping them would change the
 * document the person is reading. The name is this file's own, so nothing else on the page is lit.
 */
const THE_HIGHLIGHT = 'px-chat-quote-landed'
const THE_MARK_LASTS_MS = 2500
let landing: { element: Element; timer: number } | null = null

function theHighlights(): Map<string, unknown> | undefined {
  return (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
}

function clearTheLanding(): void {
  if (landing === null) return
  window.clearTimeout(landing.timer)
  landing.element.removeAttribute('data-quote-landed')
  landing = null
  theHighlights()?.delete(THE_HIGHLIGHT)
}

/** The range around the quoted words inside the part, or null when those words are not drawn there. */
function aRangeAroundTheWords(element: Element, words: string): Range | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const at = (node.textContent ?? '').indexOf(words)
    if (at < 0) continue
    const range = document.createRange()
    range.setStart(node, at)
    range.setEnd(node, at + words.length)
    return range
  }
  return null
}

function landOnThePart(element: Element, context: Context): void {
  clearTheLanding()
  element.scrollIntoView({ block: 'center' })
  element.setAttribute('data-quote-landed', 'true')
  const words = wordsNamedBy(context)
  const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
  if (words !== null && HighlightCtor !== undefined) {
    const range = aRangeAroundTheWords(element, words)
    if (range !== null) theHighlights()?.set(THE_HIGHLIGHT, new HighlightCtor(range))
  }
  landing = { element, timer: window.setTimeout(clearTheLanding, THE_MARK_LASTS_MS) }
}

/**
 * THE QUOTES ONE MESSAGE CARRIES, IN ORDER, or none. Read from `quotes`, which `quotesOf` filled on
 * the server, and never from `target`, so the chat and every other page agree on what a message
 * quotes.
 */
export function quotesOfAMessage(entry: Pick<PoolEntry, 'quotes'>): readonly Context[] {
  return entry.quotes
}

/**
 * WHAT THE THING POINTED AT IS CALLED ON SCREEN.
 *
 * A thing inside a record is called by that record's title, which is content and keeps its own case.
 * A page and a part of Mole Office's own screen hold no title, so they are named by what they are.
 * Anything else is named as the place the message points at.
 */
function nameOfWhatIsPointedAt(context: Context, titles: Readonly<Record<string, string>>): string {
  const record = recordNamedByTarget(context.target)
  if (record !== null) return titleOrSentence(titles, record)
  if (context.target.kind === 'page') return t('chatPage.quote.aPage')
  if (context.target.kind === 'uiSurface') return t('chatPage.quote.aPartOfTheScreen')
  return t('chatPage.quote.thePlace')
}

/**
 * WHERE THE NAME TAKES THE READER, or null because nowhere can be named.
 *
 * `pageHolding` answers with an address, with the page the thing was seen on, or with a reason there
 * is no page. The first two are links; the third draws the name with no link, because a link that
 * took the reader somewhere else would be a guess.
 */
function whereTheNameGoes(context: Context): string | null {
  const where = pageHolding(context)
  if ('path' in where) return where.path
  if ('seenOn' in where) return where.seenOn
  const record = recordNamedByTarget(context.target)
  return record === null ? null : recordPath(record)
}

/** One quote: its number when there are several, the pointed words when there are any, and the name. */
function AQuote({
  context,
  number,
  titles,
  part,
}: {
  context: Context
  number: number | null
  titles: Readonly<Record<string, string>>
  /** Which part of a stored message this quote is, or null when the message is not stored. */
  part: { recordId: string; regionId: string } | null
}) {
  const words = wordsNamedBy(context)
  const name = nameOfWhatIsPointedAt(context, titles)
  const to = whereTheNameGoes(context)
  // THE QUOTE'S NAME ON THE RIGHT-CLICK BOX is the words it quotes, or the name of what it points at.
  const declares = part === null ? {} : { ...theRegion(part.recordId, part.regionId), ...nameAttributes(words ?? name) }
  return (
    <blockquote className="px-chat-quote" data-quote-words={words === null ? 'none' : 'some'} {...declares}>
      {number === null ? null : <span className="px-chat-quote-number">{number}</span>}
      <span className="px-chat-quote-inside">
        {words === null ? null : (
          <span className="px-chat-quote-words" title={words}>
            {words}
          </span>
        )}
        <span className="px-chat-quote-name">
          {to === null ? (
            name
          ) : (
            <a
              href={`#${to}`}
              className="px-chat-quote-link"
              onClick={(event) => {
                const drawn = elementDrawing(context.target)
                if (drawn !== null) {
                  // THE PART IS HERE. The press lands on it rather than leaving the page the reader
                  // is already reading, and the address stays exactly where it was.
                  event.preventDefault()
                  landOnThePart(drawn, context)
                }
                rememberTheCardACommentWasOn(context)
              }}
            >
              {name}
            </a>
          )}
        </span>
      </span>
    </blockquote>
  )
}

/**
 * EVERY QUOTE A MESSAGE CARRIES, drawn above its words. Nothing at all for a message that points at
 * nothing, which is most messages.
 */
export function Quotes({
  entry,
  titles,
  ofMessage,
  only,
}: {
  entry: Pick<PoolEntry, 'quotes'>
  titles: Readonly<Record<string, string>>
  /** The stored message these quotes belong to, when there is one: its id and its stored target. */
  ofMessage?: Pick<PoolEntry, 'id' | 'target'>
  /** Draw one quote while retaining its position in the message's region tree. */
  only?: number
}) {
  const quotes = quotesOfAMessage(entry)
  if (quotes.length === 0) return null
  const parts = ofMessage === undefined ? null : messageQuoteRegions(ofMessage.target, quotes.length)
  return (
    <div className="px-chat-quotes">
      <style href="mole-office-chat-quotes" precedence="default">
        {QUOTES_CSS}
      </style>
      {quotes.map((context, at) => only !== undefined && at !== only ? null : (
        <AQuote
          key={at}
          context={context}
          number={quotes.length > 1 ? at + 1 : null}
          titles={titles}
          part={ofMessage === undefined || parts?.[at] === undefined ? null : { recordId: ofMessage.id, regionId: parts[at].id }}
        />
      ))}
    </div>
  )
}

/**
 * THE BLOCK'S LOOK: a bar at its start and a quieter ground, the way a reply quote is drawn in a chat
 * app, so it reads as something the message is about and not as part of what was said. Every value is
 * a token. The pointed words are cut at three lines; the title holds them whole.
 *
 * EXPORTED FOR THE RIGHT-CLICK PANEL, whose quote bar is drawn like this block.
 */
export const QUOTES_CSS = `
.px-chat-quotes { display: flex; flex-direction: column; gap: 0.25rem; margin: 0 0 0.35rem; min-width: 0; }
.px-chat-quote {
  display: flex;
  gap: 0.4rem;
  margin: 0;
  padding: 0.25rem 0.5rem;
  border-left: 3px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  color: var(--text-2);
  font-size: var(--fs-1);
  min-width: 0;
}
.px-chat-quote-number { flex: none; font-weight: 600; color: var(--text-3); }
.px-chat-quote-inside { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
.px-chat-quote-words {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  color: var(--text);
}
.px-chat-quote-name { overflow-wrap: anywhere; }
.px-chat-quote-link { color: var(--text-2); text-decoration: underline; }
`
