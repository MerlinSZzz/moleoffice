// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO COLOURS REVIEW DRAWS ITS MARKS IN, KEPT IN THIS BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * ONE VALUE, ONE PLACE
 * ---------------------------------------------------------------------------------------
 *
 * A chosen colour is written straight onto `<html>` as `--review-local` or `--review-global`, which
 * is the same custom property `src/web/tokens.css` declares a default for in each of the seven
 * palettes. So there is ONE value for a mark's ink and every drawing reads it. The alternative — a
 * React state that components read and a stylesheet that also has an opinion — is the defect
 * `CLAUDE.md` names as this repository's own.
 *
 * ---------------------------------------------------------------------------------------
 * A DEFAULT IS THE ABSENCE OF A CHOICE, NEVER A STORED COPY OF THE DEFAULT
 * ---------------------------------------------------------------------------------------
 *
 * Putting a colour back removes the key and removes the custom property from `<html>`, so the mark
 * falls through to whichever palette is on. A stored copy of light's blue would follow a reader
 * into the dark theme and sit there at the wrong contrast, and nothing would say why.
 *
 * ---------------------------------------------------------------------------------------
 * STORAGE CAN REFUSE, AND A REFUSAL IS NEVER SWALLOWED SILENTLY
 * ---------------------------------------------------------------------------------------
 *
 * A browser with site storage turned off throws on `getItem`. The read falls back to the default —
 * which is what the screen would draw anyway — and the write reports through the same
 * `detailStorageFault` channel the rest of Settings uses, so one refusal is drawn once rather than
 * once per control.
 */

import { noteStorageFault } from './detailchoice.ts'

/** The two roles the register names, keyed the way a reader thinks of them. */
export type MarkColourKey = 'local' | 'global'

/** The custom property each key writes. The same names `tokens.css` declares. */
export const MARK_TOKENS: Readonly<Record<MarkColourKey, string>> = {
  local: '--review-local',
  global: '--review-global',
}

const KEYS: Readonly<Record<MarkColourKey, string>> = {
  local: 'mole-office.review.local',
  global: 'mole-office.review.global',
}

/**
 * What the colour picker shows when nothing has been chosen.
 *
 * These are `light`'s declared values, and they are here rather than read out of the stylesheet
 * because an `<input type="color">` needs a literal `#rrggbb` and `getComputedStyle` on the server
 * has nothing to read. Choosing nothing writes nothing, so the DRAWING still falls through to the
 * palette that is on; this pair is only what the control is showing before a choice is made.
 */
export const DEFAULT_MARK_COLOURS: Readonly<Record<MarkColourKey, string>> = {
  local: '#1d4ed8',
  global: '#7f4f01',
}

/** True for the one shape an `<input type="color">` produces and a custom property can hold. */
export function isColour(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

/** The stored pair, falling back to the defaults for anything unchosen or unreadable. */
export function readMarkColours(): Record<MarkColourKey, string> {
  const out = { ...DEFAULT_MARK_COLOURS }
  for (const key of ['local', 'global'] as const) {
    try {
      const raw = window.localStorage.getItem(KEYS[key])
      if (isColour(raw)) out[key] = raw
    } catch (err: unknown) {
      noteStorageFault(err)
    }
  }
  return out
}

/** Keep one choice, or forget it. `null` forgets, which is what puts the palette's own back. */
export function writeMarkColour(key: MarkColourKey, to: string | null): void {
  try {
    if (to === null) window.localStorage.removeItem(KEYS[key])
    else if (isColour(to)) window.localStorage.setItem(KEYS[key], to)
  } catch (err: unknown) {
    noteStorageFault(err)
  }
}

/**
 * Put the chosen pair onto the document, or take it off where it equals the default.
 *
 * A value equal to the default is REMOVED rather than written, so the palette keeps deciding and a
 * theme swap moves the mark with it.
 */
export function applyMarkColours(colours: Record<MarkColourKey, string>, root?: HTMLElement): void {
  const on = root ?? document.documentElement
  for (const key of ['local', 'global'] as const) {
    const value = colours[key]
    if (!isColour(value) || value === DEFAULT_MARK_COLOURS[key]) on.style.removeProperty(MARK_TOKENS[key])
    else on.style.setProperty(MARK_TOKENS[key], value)
  }
}

/**
 * Read what is stored and put it on the document, once, when this module is first imported.
 *
 * Guarded on `document` so a Node test can import this file, and guarded on `window` because
 * `readMarkColours` reads storage. Outside a browser there is genuinely nothing to restore onto —
 * that is an absence, not a swallowed failure.
 */
export function restoreMarkColours(root?: HTMLElement): Record<MarkColourKey, string> {
  if (typeof document === 'undefined' || typeof window === 'undefined') return { ...DEFAULT_MARK_COLOURS }
  const colours = readMarkColours()
  applyMarkColours(colours, root)
  return colours
}

// THE IMPORT-TIME RESTORE, the same shape `PresetBar.tsx` uses and for the same reason: the
// document has to carry the chosen ink before the first mark is painted, or a reader watches the
// default flash and be replaced.
restoreMarkColours()
