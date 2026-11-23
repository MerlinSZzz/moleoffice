// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THE CHAT IS: SHUT, BESIDE THE PAGE, OR IN A WINDOW OF ITS OWN. Design D of the chat.
 *
 * The chat opens the way the person last had it: beside the page, or in its window over the corner, which it opens in
 * the first time. Beside the page it splits the window at one seam into the page and the chat, both as tall as the
 * window. The seam swaps the two sides, sends the chat to a window of its own (the panel over the corner the chat always
 * had), and puts it away. Below 1024 pixels the chat beside the page covers the whole screen instead, and its seam is a
 * bar at the top.
 *
 * ONE STORE, BECAUSE FOUR PLACES READ IT. The chat draws itself from it; the sidebar's Chat row and the phone's bar
 * open the chat through it and draw the count it carries; and the sidebar folds while the split is drawn. Each of
 * them asking the browser's storage on its own would be four readings of one fact, so they subscribe here.
 *
 * IT IS REMEMBERED IN THIS BROWSER, as the chat's size and open contact are. The open state keeps the key and the
 * words it always had: `no` is shut and `yes` is the panel in its window, which is what `yes` meant before the split.
 * `split` is the new answer. So a browser that last had the panel open opens it the same way, and nothing stored
 * before this change is read as something else.
 */

import { CHAT_OPENS_AS_BEFORE_ANYBODY_CHOOSES, type ChatOpensAs } from '@shared/participants.ts'
import { readStored, writeStored } from './store.ts'
import { THE_WIDE_FROM } from './the-shell-width.ts'

/** Where the chat is. `window` is the panel over the corner; `split` is the chat beside the page. */
export type ChatIsWhere = 'closed' | 'split' | 'window'

/** Which side of the page the split puts the chat on. */
export type ChatSide = 'left' | 'right'

export interface ChatSplit {
  where: ChatIsWhere
  side: ChatSide
  /** The chat's width beside the page, in pixels, as the person last left it. Held inside the window when drawn. */
  width: number
}

/** The chat's open state, under the key it always had. */
export const CHAT_OPEN_KEY = 'mole-office.chat.open'
const SIDE_KEY = 'mole-office.chat.split-side'
const WIDTH_KEY = 'mole-office.chat.split-width'

/** How wide the chat is beside the page before anybody drags the seam. */
export const SPLIT_WIDTH_TO_START_WITH = 520
/** The narrowest the chat goes beside the page: a conversation and its writing box still fit. */
export const SPLIT_WIDTH_LEAST = 360
/** What the chat always leaves to the page and the folded sidebar, so the widest it goes is the window less this. */
export const SPLIT_LEAVES_THE_WINDOW = 480

/**
 * FROM WHICH WIDTH THE CHAT SITS BESIDE THE PAGE. It is the shell's own breakpoint, read from the one
 * place the width is written, src/web/lib/the-shell-width.ts: from here up the sidebar is in the flow
 * beside the page, and below it the sidebar is a drawer and the page has the whole width. Below it, an
 * open chat covers the screen.
 */
export const THE_SPLIT_FROM = THE_WIDE_FROM

/**
 * FROM WHICH WIDTH THE CHAT DRAWS THE LISTS BESIDE THE CONVERSATION, as the chat page does. It is the chat's own width:
 * beside the page with its seam, or its window's. Narrower, the chat draws one column, as it always did: the lists, or
 * the open conversation with its back press.
 *
 * At this width beside the page, the seam's 36 pixels and the lists' widest column of 336 leave the conversation 388.
 * That is wider than the 324 the chat beside the page keeps for a conversation at its narrowest. The chat goes as wide
 * as 960 beside the page in a window 1440 wide, so the change can be dragged across there.
 */
export const TWO_COLUMNS_FROM = 760

const STORED_AS: Record<ChatIsWhere, string> = { closed: 'no', split: 'split', window: 'yes' }

/**
 * WHAT THIS BROWSER REMEMBERS. A browser that refuses storage, or a word this build does not know, reads as shut, on the
 * right, at the starting width: whether the chat was open is a convenience, and shut is the honest answer when nothing
 * can be read.
 */
function remembered(): ChatSplit {
  const open = readStored(CHAT_OPEN_KEY)
  const side = readStored(SIDE_KEY)
  const width = readStored(WIDTH_KEY)
  const said = open.ok ? open.value : null
  const wide = width.ok && width.value !== null ? Number(width.value) : NaN
  return {
    where: said === 'split' ? 'split' : said === 'yes' ? 'window' : 'closed',
    side: side.ok && side.value === 'left' ? 'left' : 'right',
    width: Number.isFinite(wide) && wide > 0 ? Math.round(wide) : SPLIT_WIDTH_TO_START_WITH,
  }
}

let now: ChatSplit = remembered()
const watchers = new Set<() => void>()

/** Be told whenever the chat moves, opens, shuts, swaps sides or changes width. */
export function watchTheSplit(watcher: () => void): () => void {
  watchers.add(watcher)
  return () => {
    watchers.delete(watcher)
  }
}

/** Where the chat is now. The same object until something changes, so a subscriber redraws only on a change. */
export function theSplit(): ChatSplit {
  return now
}

function change(next: Partial<ChatSplit>): void {
  const was = now
  now = { ...now, ...next }
  if (now.where !== was.where) writeStored(CHAT_OPEN_KEY, STORED_AS[now.where])
  if (now.side !== was.side) writeStored(SIDE_KEY, now.side)
  if (now.width !== was.width) writeStored(WIDTH_KEY, String(now.width))
  for (const watcher of watchers) watcher()
}

/**
 * Open the chat beside the page, shut it, or send it to its own window. Put beside the page or in its window, that is
 * the way it opens next, in this page at once; the chat keeps it on the person's row for every page after.
 */
export function putTheChat(where: ChatIsWhere): void {
  if (where !== 'closed') openedHere = where
  if (where !== now.where) change({ where })
}

/** Open the chat beside the page, unless it is already open in either place. What the sidebar and the bar press. */
export function openTheChat(): void {
  if (now.where === 'closed') change({ where: 'split' })
}

/**
 * HOW THE CHAT OPENS: beside the page or in its window, the way the person last had it.
 *
 * FIRST, THE WAY IT WAS LAST OPEN IN THIS PAGE. A page loaded with the chat open, as this browser left it, has it open
 * that way from the start, and each press that opens it sets the way again. So the first press after a reload opens the
 * chat the way it was open, even before the person's row is read.
 *
 * THEN THE WAY KEPT ON THE PERSON'S ROW, which is theirs in every browser. The chat says it here once it has read the
 * row. A person with nothing kept has the chat open in its window.
 */
let openedHere: ChatOpensAs | null = now.where === 'closed' ? null : now.where
let keptOnTheRow: ChatOpensAs = CHAT_OPENS_AS_BEFORE_ANYBODY_CHOOSES

/** The way the chat was last open in this page, or null when it has not been open here since the row last changed. */
export function theWayItWasOpenHere(): ChatOpensAs | null {
  return openedHere
}

/**
 * The chat says how the chat opens for the person, from their row. A new way on the row comes after the way this page
 * had: the chat keeps this page's way on the row before it says the row, and a change made in the settings or in
 * another browser is newer.
 */
export function sayHowTheChatOpens(as: ChatOpensAs): void {
  if (as === keptOnTheRow) return
  keptOnTheRow = as
  openedHere = null
}

/** Open the chat the way the person last had it. What the circle, the sidebar's Chat row, the phone's bar and the chat key press. */
export function openTheChatAsChosen(): void {
  putTheChat(openedHere ?? keptOnTheRow)
}

/** Put the chat on the other side of the page. */
export function swapTheSides(): void {
  change({ side: now.side === 'right' ? 'left' : 'right' })
}

/**
 * THE WIDTH BESIDE THE PAGE, HELD INSIDE THIS WINDOW: never narrower than the least, never so wide that the page has
 * less than what the split always leaves it. A window too small for both gives the least, and that only happens below
 * the width the split is drawn from.
 */
export function widthInside(width: number, windowWidth: number): number {
  return Math.round(Math.max(SPLIT_WIDTH_LEAST, Math.min(width, windowWidth - SPLIT_LEAVES_THE_WINDOW)))
}

/** Remember the width the seam was left at, held inside the window it was dragged in. */
export function keepTheWidth(width: number, windowWidth: number): void {
  const held = widthInside(width, windowWidth)
  if (held !== now.width) change({ width: held })
}

// --------------------------------------------------------------------- what is drawn, for the rest of the shell

/**
 * WHICH SIDE THE SPLIT IS DRAWN ON NOW, or null while no split is drawn. It is not the same as `where`: the chat page
 * draws no split, and below 1024 pixels an open chat covers the screen instead. Only the chat sets it, from what it
 * draws, so the sidebar keeps its choice beside the chat exactly while the split is on the screen.
 */
let drawnOn: ChatSide | null = null
/** How wide the split is drawn, or 0 while none is. */
let drawnWidth = 0

/**
 * SAY WHICH SIDE THE SPLIT IS DRAWN ON, AND HOW WIDE, or that none is drawn. The page's room is made from the root's
 * `data-chat-split` and `--chat-split-w`, which only this writes. The shell's stylesheet gives the page its margin from
 * them, and the chat's own moves the strips fixed to the window's foot clear of the chat. The watchers are told of a
 * new width as well as a new side, since the sidebar asks whether the page has room for it beside the chat.
 */
export function sayTheSplitIsDrawn(side: ChatSide | null, width = 0): void {
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    if (side === null) {
      root.removeAttribute('data-chat-split')
      root.style.removeProperty('--chat-split-w')
    } else {
      root.setAttribute('data-chat-split', side)
      root.style.setProperty('--chat-split-w', `${String(width)}px`)
    }
  }
  const drawnAs = side === null ? 0 : width
  if (side === drawnOn && drawnAs === drawnWidth) return
  drawnOn = side
  drawnWidth = drawnAs
  for (const watcher of watchers) watcher()
}

/** Which side the split is drawn on, or null while none is. The sidebar keeps its choice beside the chat meanwhile. */
export function theSplitDrawnOn(): ChatSide | null {
  return drawnOn
}

/** How wide the split is drawn, or 0 while none is. */
export function theSplitDrawnWidth(): number {
  return drawnWidth
}

/**
 * WHETHER THE OPEN SIDEBAR FITS BESIDE THE PAGE AND THE CHAT. The chat never leaves the page and the folded sidebar
 * less than SPLIT_LEAVES_THE_WINDOW between them, so the page itself keeps that less the folded sidebar: 416 pixels at
 * the default density. The open sidebar goes beside the page only while the page keeps as much; otherwise it opens
 * over it.
 */
export function theSidebarFitsBeside(
  windowWidth: number,
  chatWidth: number,
  openWidth: number,
  foldedWidth: number,
): boolean {
  return windowWidth - chatWidth - openWidth >= SPLIT_LEAVES_THE_WINDOW - foldedWidth
}

// ------------------------------------------------------------------------------ the count the chat carries

/**
 * HOW MANY MESSAGES AND GROUPS WAIT FOR THE READER, AS THE CHAT COUNTS THEM, and whether the corner circle is drawing
 * that number. Null until the chat has counted. The chat is the one place the number is worked out (criterion M32's
 * two halves added together), and the sidebar's Chat row and the phone's bar draw it from here, so the three cannot
 * show two numbers.
 */
export interface ChatWaiting {
  count: number
  /** True while the corner circle is drawn, which then carries the number, so the sidebar's row does not repeat it. */
  onTheCircle: boolean
}

let waiting: ChatWaiting | null = null
const countWatchers = new Set<() => void>()

/** Be told when the count or the circle changes. */
export function watchTheCount(watcher: () => void): () => void {
  countWatchers.add(watcher)
  return () => {
    countWatchers.delete(watcher)
  }
}

/** What the chat last counted, or null because it has not counted yet. */
export function theCount(): ChatWaiting | null {
  return waiting
}

/** The chat says what it counted. Null when the chat is put away from the page, so nothing draws an old number. */
export function sayTheCount(next: ChatWaiting | null): void {
  if (next === waiting || (next !== null && waiting !== null && next.count === waiting.count && next.onTheCircle === waiting.onTheCircle)) return
  waiting = next
  for (const watcher of countWatchers) watcher()
}
