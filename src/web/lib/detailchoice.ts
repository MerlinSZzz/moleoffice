// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW MUCH EACH SURFACE SAYS, IN THIS BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/detail.ts` decides the ANSWER: which of the six positions a surface should be saying,
 * given what a person set, what the thing being read asks for, and what Mole Office's own setting is. It
 * runs in the browser and on the server and it touches no storage.
 *
 * This file is the browser half: it reads the three stored choices out of `localStorage` and
 * `sessionStorage`, hands them to `rungFor`, and tells every surface on the screen when one of them
 * changes. It decides nothing. The order of the five deciders is in `DETAIL_PRECEDENCE` and nowhere
 * else, which is what stops a surface growing its own idea of what beats what.
 *
 * ---------------------------------------------------------------------------------------
 * ONE CHANGE, EVERY SURFACE, WITHOUT A ROUTER
 * ---------------------------------------------------------------------------------------
 *
 * Setting `Everywhere` on the Settings grid has to move eleven surfaces, some of which are on other
 * pages and some of which are on this one. `storage` events only fire in OTHER tabs, so a store
 * that relied on them would leave the page you are standing on unchanged — the exact defect this
 * campaign has found six times, wearing a browser API. So writes go through this file and this file
 * tells its listeners.
 *
 * ---------------------------------------------------------------------------------------
 * A STORAGE THAT REFUSES IS SAID, NOT SWALLOWED
 * ---------------------------------------------------------------------------------------
 *
 * Safari in private browsing and some locked-down profiles throw on `localStorage`. A control that
 * quietly forgot every choice would be worse than one that says it cannot remember, so the last
 * fault is kept and the Settings panel draws it. Nothing here falls back to a value nobody chose
 * without saying so: an unreadable stored value is simply not a setting, and the next decider in
 * `DETAIL_PRECEDENCE` answers.
 */
import { useEffect, useState } from 'react'
import {
  DETAIL_KEY_EVERYWHERE,
  DETAIL_ROWS,
  DETAIL_SURFACES,
  detailKeyForHere,
  detailKeyForSurface,
  FLOORED_KIND,
  FLOORED_SURFACE,
  readWithPrecedence,
  rungFor,
  type Chosen,
  type DetailRow,
  type DetailSurface,
  type Rung,
  type RungChoice,
} from '@shared/detail.ts'
import { content, readStoredWord } from '@shared/i18n.ts'
import { isPictures, PICTURES_DEFAULT, PICTURES_KEY_HERE, type Pictures } from '@shared/pictures.ts'

/**
 * WHAT EACH OF THE TEN SURFACES IS CALLED WHERE SOMEBODY SETS IT.
 *
 * The names are what a reader sees on the screen, not the keys the values are stored under:
 * `moduleCards` is a key and `Module cards` is a place on a page. The map is total over
 * `DetailSurface`, so a surface added to `src/shared/detail.ts` stops the typecheck until somebody
 * says what it is called.
 */
export const DETAIL_SURFACE_NAMES: Readonly<Record<DetailSurface, string>> = {
  home: 'Home cards',
  review: 'Review pane',
  composer: 'Composer',
  recipients: 'Recipient picker',
  messages: 'Agent messages',
  reportIndex: 'Report index',
  reportContent: 'Report content',
  moduleCards: 'Module cards',
  graph: 'Pipeline graph',
  tables: 'Tables',
}

/** What a row of the Settings grid is, and the rows in the grid's order. Declared in @shared/detail.ts, where the server counts by them. */
export { DETAIL_ROWS, type DetailRow }

/** What that row is called. `Everywhere` is the row the other ten inherit from. */
export function detailRowName(row: DetailRow): string {
  return row === 'everywhere' ? 'Everywhere' : DETAIL_SURFACE_NAMES[row]
}


// ------------------------------------------------------------------------------- storage

/** What the browser said the last time storage refused, or null. Kept as its own fact: it is not a missing setting. */
let lastFault: string | null = null

/**
 * The sentence for the last refusal, or null. Read by the Settings panel and drawn there.
 *
 * It is made when it is read, so it is in the page's language at that moment. The browser's own
 * words inside it are content. Under Node, where a unit test may call it, it is English.
 */
export function detailStorageFault(): string | null {
  return lastFault === null ? null : readStoredWord('frameFiles.detail.cannotKeep', { reason: content(lastFault) })
}

/**
 * ONE SENTENCE FOR ONE FACT: THIS BROWSER WILL NOT KEEP SETTINGS.
 *
 * There were three of these — one for a failed read, one for a failed write, one for a failed write
 * of a choice that lasts a visit — and they were three phrasings of the same thing. What CHANGED is
 * not carried by the sentence and does not need to be: the grid redraws from storage, so the marks
 * on it are the answer to "did that take effect", and a second clause claiming it did or did not
 * would be a sentence competing with the drawing beside it.
 *
 * This keeps only the browser's own words; `detailStorageFault` above says the one sentence around them.
 */
function refused(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Report a storage refusal through the one channel Settings draws it in.
 *
 * `src/web/lib/markcolours.ts` keeps two values in the same `localStorage` and a browser that
 * refuses one refuses both. One sentence, drawn once, is the point of `refused` above; a second
 * fault channel for the second control would draw the same refusal twice.
 */
export function noteStorageFault(err: unknown): void {
  lastFault = refused(err)
}

function readLocal(key: string): unknown {
  try {
    return window.localStorage.getItem(key)
  } catch (err: unknown) {
    lastFault = refused(err)
    return null
  }
}

function readSession(key: string): unknown {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    // Already reported by the read above if it is the same refusal, and a choice made for this
    // visit only is the one that matters least. It is simply not a setting.
    return null
  }
}

// -------------------------------------------------------------------- telling the screen

type Listener = () => void
const listeners = new Set<Listener>()

/** Every surface on the screen redraws when a choice changes. Returns the way to stop listening. */
export function subscribeToDetail(listener: Listener): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

function changed(): void {
  for (const listener of [...listeners]) listener()
}

// -------------------------------------------------------------------------- the answers

/**
 * HOW MUCH THIS SURFACE SHOULD BE SAYING, AND WHAT DECIDED IT.
 *
 * `kind` is the kind of record being drawn, or null where the surface draws no one record. Only a
 * report has the reader floor, so `rungFor` cannot answer without it. The caller says, for the same
 * reason it passes `recommended`: only the caller has the record.
 *
 * `recommended` is what the thing being read asked for. It is passed by the caller because only the
 * caller has the record; it loses to every setting a person made, by its position in
 * `DETAIL_PRECEDENCE`.
 */
export function detailFor(surface: DetailSurface, kind: string | null, recommended?: unknown): RungChoice {
  return rungFor(surface, kind, recommended, {
    here: readSession(detailKeyForHere(surface)),
    thisSurface: readLocal(detailKeyForSurface(surface)),
    everywhere: readLocal(DETAIL_KEY_EVERYWHERE),
  })
}

/** The stored word for one row, or null where nobody set one. Unchecked: it came out of storage. */
export function storedFor(row: DetailRow): unknown {
  return row === 'everywhere' ? readLocal(DETAIL_KEY_EVERYWHERE) : readLocal(detailKeyForSurface(row))
}

/** The stored word for this visit only, or null. */
export function storedHere(surface: DetailSurface): unknown {
  return readSession(detailKeyForHere(surface))
}

/**
 * HAS THIS VISIT REVEALED THE MACHINERY ON THIS RECORD?
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS A KEY OF ITS OWN AND NOT A RUNG
 * ---------------------------------------------------------------------------------------------
 *
 * `projections.md` §8.3. Two ways to avoid a second key were considered and both are worse.
 * Forcing it into `setDetailHere(surface, rung)` would give one stored word two independent
 * meanings — how much this report says, and whether its machinery is revealed — which is exactly
 * the collapse this campaign is against. Sharing the `reportContent` here-key is worse still:
 * pressing the length control writes that key, and the revealed block would vanish mid-read.
 *
 * SO: `mole-office.here.machinery.<recordId>`, holding `1` or absent, in sessionStorage. It is PER
 * RECORD because revealing the machinery of one report says nothing about the next one, and PER
 * VISIT because it is a way of reading a page and not a setting somebody made.
 *
 * IT IS DELIBERATELY OUTSIDE THE `mole-office.detail` NAMESPACE, because it is not a detail choice. It
 * lives in this file because this file already owns per-visit view state, the `readSession` helper,
 * the refusal reporting through `lastFault` and the `changed()` notification — a second file would
 * be a second copy of all four.
 *
 * WITH NO RECORD ID THERE IS NO KEY. `machineryRevealedHere(undefined)` is false and there is
 * nothing to write. That is not a hole: §8.3 says what a surface with no record id draws instead —
 * the count, with the sentence *turn on Developer mode to read it* — because a stated absence with
 * no route to the thing is worse than either half.
 */
export function machineryRevealedHere(recordId: string | undefined): boolean {
  if (recordId === undefined || recordId === '') return false
  return readSession(machineryKeyFor(recordId)) === '1'
}

/** Reveal this record's machinery for this visit, or put it away again. */
export function setMachineryRevealedHere(recordId: string, on: boolean): void {
  const key = machineryKeyFor(recordId)
  try {
    if (on) window.sessionStorage.setItem(key, '1')
    else window.sessionStorage.removeItem(key)
    lastFault = null
  } catch (err: unknown) {
    lastFault = refused(err)
  }
  changed()
}

/** The one place the key is spelled. Exported so a test names the key rather than guessing it. */
export function machineryKeyFor(recordId: string): string {
  return `mole-office.here.machinery.${recordId}`
}

/**
 * SET A ROW, OR CLEAR IT.
 *
 * `null` REMOVES the key rather than writing a word meaning "nothing", because the difference
 * between "this row inherits" and "this row is set to whatever Everywhere happens to say" is the
 * difference the `○` and `●` glyphs draw. A stored copy of the inherited value would stop following
 * it silently the next time Everywhere moved.
 */
export function setDetailFor(row: DetailRow, rung: Rung | null): void {
  const key = row === 'everywhere' ? DETAIL_KEY_EVERYWHERE : detailKeyForSurface(row)
  try {
    if (rung === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, rung)
    lastFault = null
  } catch (err: unknown) {
    lastFault = refused(err)
  }
  changed()
}

/**
 * Set how much one surface says for this visit only, or clear that choice.
 *
 * IT ANSWERS WHETHER THE WRITE TOOK, AND THE ANSWER IS NOT DECORATION. *View original* puts the
 * reading length to Full and then says what the reader can see; measured on 1 September 2026 with
 * `sessionStorage` writes refused — Safari in private browsing, and some locked-down profiles, do
 * exactly this — the report body was 4,525 characters before the press and 4,525 after it, 34 of
 * 141 regions, no preset drawn as chosen, and the sentence still read "with the whole report
 * drawn". The refusal went into `lastFault`, which the Settings panel draws and the composer had no
 * way to ask about, and `changed()` was called exactly as if the write had worked.
 *
 * IT ALSO CLEARS `lastFault` ON A WRITE THAT TOOK, which the two writers beside it already did and
 * this one did not: a refusal from an earlier press stayed on the Settings panel after a later
 * write had succeeded, which is a true sentence about the past drawn as a fact about now.
 */
export function setDetailHere(surface: DetailSurface, rung: Rung | null): boolean {
  const key = detailKeyForHere(surface)
  let stored = true
  try {
    if (rung === null) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, rung)
    lastFault = null
  } catch (err: unknown) {
    lastFault = refused(err)
    stored = false
  }
  changed()
  return stored
}

// ------------------------------------------------------------------------------ the hook

/**
 * HOW MUCH THIS SURFACE SAYS, KEPT UP TO DATE.
 *
 * Every reader calls this rather than reading storage, so there is one reader of these keys and one
 * place that knows when they moved.
 */
/**
 * ALL TEN AT ONCE, FOR THE SETTINGS GRID.
 *
 * The grid has eleven rows and one of them is not a surface, so it cannot call `useDetail` once per
 * row without calling a hook conditionally. It reads all ten here, in one place, once.
 *
 * THE REPORT CONTENT ROW RESOLVES AS A REPORT DOES, which is what that row is named for and the
 * only kind the reader floor is for. So the mark the grid draws on that row and the position a
 * report page draws are one answer. Every other row draws no one record, so it asks with null and
 * keeps all seven — including a module drawing its curated summary from this same row, which the
 * row's own words say. Criterion A19.
 */
export function useDetailAll(): Readonly<Record<DetailSurface, RungChoice>> {
  const read = (): Record<DetailSurface, RungChoice> =>
    Object.fromEntries(
      DETAIL_SURFACES.map((s) => [s, detailFor(s, s === FLOORED_SURFACE ? FLOORED_KIND : null)]),
    ) as Record<DetailSurface, RungChoice>
  const [all, setAll] = useState(read)
  useEffect(() => {
    setAll(read())
    return subscribeToDetail(() => setAll(read()))
    // `read` is a new closure every render and is deliberately not a dependency; it reads storage
    // and takes nothing else. See `useAsync` in ui.tsx, which says the same thing about `load`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return all
}

/**
 * HOW MUCH THIS SURFACE SAYS, FOR THE KIND OF RECORD IT IS DRAWING, KEPT UP TO DATE.
 *
 * `kind` is null where the surface draws no one record. It is a dependency of the effect below, so
 * a surface handed a different record redraws at that record's own position.
 */
export function useDetail(surface: DetailSurface, kind: string | null, recommended?: unknown): RungChoice {
  const [choice, setChoice] = useState(() => detailFor(surface, kind, recommended))
  useEffect(() => {
    const reread = (): void => setChoice(detailFor(surface, kind, recommended))
    reread()
    return subscribeToDetail(reread)
  }, [surface, kind, recommended])
  return choice
}

// --------------------------------------------------- the second dimension of a report view

/**
 * WHETHER A REPORT'S PICTURES ARE DRAWN LIVES IN THIS FILE FOR ONE REASON: THERE IS ONE NOTIFIER.
 *
 * WHETHER THEY ARE FETCHED IS NOT HERE. That is the person's own setting, criterion U5, declared in
 * `@shared/mediaload.ts`, kept on their registry row, and read by `lib/mediaload.ts`. This file only
 * answers whether a picture that is already loaded is DRAWN, and it answers for this visit.
 *
 * Turning the pictures off has to move the report and the control that turned them off. `storage`
 * events only fire in OTHER tabs, so the listener set above is what tells this page. A second file
 * with a second set would leave half the screen behind, and that failure has been found in this
 * codebase six times already wearing a browser API.
 *
 * The precedence RULE is not restated here. `readWithPrecedence` walks `DETAIL_PRECEDENCE`, and
 * each dimension brings only its own vocabulary: a check on the stored value and its own default.
 *
 * HOW LARGE THE TYPE IS IS NOT HERE AND MUST NOT COME HERE. `Text size` is an axis on the
 * appearance bar — `PresetBar.tsx`, stored at `mole-office.preset.size` — and it scales the root, so
 * every rem in the product follows it, including the reading measure. A second text size, read
 * through this chain and applied to one surface, would be two controls with one name.
 */

/**
 * WHETHER PICTURES ARE DRAWN IN THIS REPORT, FOR THIS VISIT, AND WHAT DECIDED IT.
 *
 * ONE DECIDER, NOT FOUR, AND THE ABSENCES ARE THE DESIGN. There is no durable key: whether media
 * are FETCHED is the person's own setting, criterion U5, read from their registry row in
 * `lib/mediaload.ts` and applied by `ImageFigure` — not a browser key. There is no per-surface key
 * because only one surface draws pictures, and there is no `recommended` because a record asking
 * for its own charts to be hidden would be an author overruling a reader.
 *
 * THE ONE DECIDER THAT DOES BELONG HERE IS `here`: a reader may turn a report's pictures off for
 * this visit, and the next visit starts drawn. That was always the session half of this setting;
 * the durable half is gone because nothing wrote it and the person's own setting answers what it
 * pretended to answer.
 */
export function picturesFor(): Chosen<Pictures> {
  return readWithPrecedence({ here: readSession(PICTURES_KEY_HERE) }, isPictures, PICTURES_DEFAULT)
}

/** Set whether pictures are drawn for this visit only, or clear that choice. */
export function setPicturesHere(value: Pictures | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(PICTURES_KEY_HERE)
    else window.sessionStorage.setItem(PICTURES_KEY_HERE, value)
  } catch (err: unknown) {
    lastFault = refused(err)
  }
  changed()
}

/** The choice made for this visit only, or null. Unchecked: it came out of storage. */
export function picturesHere(): unknown {
  return readSession(PICTURES_KEY_HERE)
}

/** Whether pictures are drawn, kept up to date the same way `useDetail` is. */
export function usePictures(): Chosen<Pictures> {
  const [choice, setChoice] = useState(picturesFor)
  useEffect(() => {
    const reread = (): void => setChoice(picturesFor())
    reread()
    return subscribeToDetail(reread)
  }, [])
  return choice
}

