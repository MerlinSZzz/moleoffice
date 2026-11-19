// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NORMAL and INSPECT: how much of Mole Office's own machinery the interface shows.
 *
 * ---------------------------------------------------------------------------------------------
 * THE PROBLEM THIS SOLVES
 * ---------------------------------------------------------------------------------------------
 *
 * Mole Office knows an enormous amount about every row it holds: which actor wrote it and in which
 * session, whether a value is stored or derived, how it entered the corpus, which links point at it
 * and which way each one reads, its id, and the raw shape of every structured field. All of that is
 * TRUE and all of it is worth keeping. None of it is what a person came to the page to find out.
 *
 * The owner's review of the first daily-use candidate failed on exactly this: *technically precise,
 * but it exposes too much of its internal ontology, storage model and explanatory prose directly to
 * the user.* Ordinary pages were dominated by AUTHORED, BOTH DIRECTIONS, Stored fields, "What this
 * record's own state says" and record ids — not because anybody decided a reader needed them, but
 * because the backend knew them.
 *
 * ---------------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------------
 *
 * **Nothing is destroyed and nothing becomes unreachable.** Inspect is one switch away on every
 * page, it is remembered, and it is announced in the sidebar so it can be found without being told.
 * What changes is only what has to be READ to use the product.
 *
 * The test applied per item, and it is a test about decisions rather than about tidiness:
 *
 *     If this disappeared until I asked for it, would I make a WORSE IMMEDIATE DECISION?
 *
 * If no, it does not belong in normal mode's first glance. A record id fails that test on every
 * page in the product. A deadline that has already passed passes it on all of them.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE MODE IS NOT A THEME
 * ---------------------------------------------------------------------------------------------
 *
 * The presets in PresetBar.tsx are value swaps: they change tokens and never change what is on the
 * page. This changes WHAT IS RENDERED, so components read it and branch. `data-mode` is still
 * written onto <html>, because some of the difference is genuinely presentational and a CSS rule is
 * cheaper and more reliable than threading a prop through nine components — but anything with real
 * content behind it must be conditionally rendered rather than hidden, or a screen reader would
 * still read out every id on the page while the screen showed none of them.
 */

import { useSyncExternalStore } from 'react'
import type { Reader } from '@shared/audience.ts'
import { content, readStoredWord } from '@shared/i18n.ts'
import { MODES, type Mode } from '@shared/mode.ts'
import { clearStored, makeBroadcast, readStored, storeFault, writeStored, type StoreFault } from './store.ts'

/**
 * THE TWO WORDS ARE DECLARED IN src/shared/mode.ts AND RE-EXPORTED HERE, NOT COPIED.
 *
 * Everything that makes a mode a mode is still in this file: the switch's labels, the caption, the
 * address override, the storage and the hook. What went down a layer is the two words themselves,
 * because `src/shared/words.ts` — the one table between what Mole Office stores and what a person reads
 * — takes a mode, and the server reads that table now. A shared module may not import `src/web`.
 *
 * The re-export means every one of the caller sites that imports `MODES` or `Mode` from here goes
 * on working and there is still one declaration. See src/shared/mode.ts.
 */
export { MODES, type Mode }

/**
 * The two words on the switch.
 *
 * "Developer", not "Inspect". "Inspect" is a browser word: it tells a stranger nothing about what
 * pressing it will do, and it reads as an invitation to look at this record more closely rather
 * than as a product-wide setting. "Developer" tells them to leave it alone, which is the correct
 * instruction for a reader who is not one.
 *
 * THE STORED WORD DOES NOT CHANGE. `inspect` is the value in `MODES`, in `localStorage` and in
 * `?mode=inspect`, so every screenshot, test and bug report that names it goes on working. This is
 * the same separation `DISPLAY_WORDS` in src/shared/work.ts makes for stored state words: the
 * database keeps its spelling and the reader gets a word they can use.
 */
export const MODE_LABELS: Readonly<Record<Mode, string>> = {
  // The words are in the word lists, under the keys the switch draws, so there is one wording.
  get normal() { return readStoredWord('settingsPanel.mode.normal') },
  get inspect() { return readStoredWord('settingsPanel.mode.developer') },
}

/**
 * The one sentence anybody gets about this, in the page's language.
 *
 * The switch on the Settings page (ViewSwitch.tsx) draws the same two word-list keys, so the
 * setting is explained one way wherever it is read.
 */
export const MODE_NOTES: Readonly<Record<Mode, string>> = {
  // Both name the same four things ON PURPOSE. The discovery problem is "what will pressing this
  // give me?", and a caption that only describes the position you are already in never answers it.
  get normal() { return readStoredWord('settingsPanel.mode.noteNormal') },
  get inspect() { return readStoredWord('settingsPanel.mode.noteDeveloper') },
}

const KEY = 'mole-office.mode'

const broadcast = makeBroadcast()

/**
 * The address may override the remembered choice for one page load, and does not save it.
 *
 * `?mode=inspect` before the hash — `http://127.0.0.1:5173/?mode=inspect#/r/abc`. This exists so a
 * screenshot tool, a test and a bug report can all name a view precisely instead of describing how
 * to reach it. It deliberately does NOT persist: a link somebody sent you must not change how your
 * product looks tomorrow.
 */
function fromAddress(): Mode | null {
  // `window.location?.search` rather than `window.location.search`: this module is imported by the
  // component library, so it is loaded by every test that renders a component, and those install a
  // window stand-in that has no location. An absent address is not a fallback with a meaning — it
  // is the absence of an address, which is exactly "nobody asked for a mode".
  if (typeof window === 'undefined') return null
  const asked = new URLSearchParams(window.location?.search ?? '').get('mode')
  return MODES.find((m) => m === asked) ?? null
}

function restore(): { mode: Mode; faults: StoreFault[] } {
  const faults: StoreFault[] = []
  const override = fromAddress()
  if (override !== null) return { mode: override, faults }
  if (typeof window === 'undefined') return { mode: 'normal', faults }

  const read = readStored(KEY)
  if (!read.ok) {
    faults.push(storeFault(KEY, 'frameWords.mode.cannotRead', { reason: content(read.reason) }))
    return { mode: 'normal', faults }
  }
  if (read.value === null) return { mode: 'normal', faults }
  const found = MODES.find((m) => m === read.value)
  if (found === undefined) {
    faults.push(storeFault(KEY, 'frameWords.mode.unknownView', { value: content(read.value) }))
    clearStored(KEY)
    return { mode: 'normal', faults }
  }
  return { mode: found, faults }
}

/**
 * Read at import time, before React renders anything, for the same reason the presets are: an
 * effect runs after the first paint, so restoring there would show one frame of the wrong page.
 */
const BOOT = restore()
let mode: Mode = BOOT.mode
let faults: StoreFault[] = BOOT.faults
/** True when the address is deciding, so the switch can say why it will not be remembered. */
export const modeIsFromAddress: boolean = fromAddress() !== null

if (typeof document !== 'undefined') document.documentElement.setAttribute('data-mode', mode)

export function currentMode(): Mode {
  return mode
}

export function modeFaults(): StoreFault[] {
  return faults
}

/**
 * Change the mode.
 *
 * Applies first and persists second, so the visible result never depends on whether the browser
 * allowed the write — and if it did not, the switch says the change will not survive a reload.
 * Works with no document at all, which is what lets a test render a component in either mode.
 */
export function setMode(next: Mode): void {
  if (next === mode) return
  mode = next
  // The attribute is for CSS and belongs to the document; the memory belongs to the browser. They
  // are separate conditions because they fail separately — a test has a window and no document.
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-mode', next)
  if (typeof window !== 'undefined') {
    const written = writeStored(KEY, next)
    faults = written.ok
      ? faults.filter((f) => f.key !== KEY)
      : [
          ...faults.filter((f) => f.key !== KEY),
          storeFault(KEY, 'frameWords.mode.cannotWrite', { reason: content(written.reason) }),
        ]
  }
  broadcast.announce()
}

/** The current mode, re-rendering the component when it changes. */
export function useMode(): Mode {
  return useSyncExternalStore(broadcast.subscribe, currentMode, currentMode)
}

/**
 * WHICH OF THE THREE READERS THIS BROWSER IS. A browser is never an agent.
 *
 * `Reader` has three words and `Mode` has two, and that is not an oversight. The third reader is an
 * agent, which nothing in a browser can be, so this function can only ever answer two of the three
 * — and the word still has to exist, because the rule in `src/shared/audience.ts` is written over
 * all three and is asked by the server-side reads as well.
 *
 * THE STORED WORD DOES NOT CHANGE. `inspect` stays the value in `MODES`, in `localStorage` and in
 * `?mode=inspect`. This is the same separation `MODE_LABELS` above already makes: the database
 * keeps its spelling and the reader gets a word they can use. Now the code gets a third word too.
 *
 * `design/round-ten/design/projections.md` §10.3. The build plan's wave 1 step 9 names a new file,
 * `src/web/lib/reader.ts`, for this function. It is here instead, in the file that already holds
 * the stored word it reads, because the two would otherwise have to import each other: `useInspect`
 * below is now expressed through this, so that "which reader is this" is worked out once rather
 * than by two functions that could come to disagree.
 */
export function useReader(): Reader {
  return useMode() === 'inspect' ? 'developer' : 'normal'
}

/**
 * `true` when the reader has asked to see the machinery.
 *
 * The name is the question a component should be asking. `useMode() === 'inspect'` spelt out in
 * forty components is forty chances to write `!==` by accident and hide the product instead.
 *
 * Its 51 call sites do not move. It is re-expressed through `useReader` rather than reading the
 * mode a second time, so a change to what counts as a developer reaches both at once.
 */
export function useInspect(): boolean {
  return useReader() === 'developer'
}
