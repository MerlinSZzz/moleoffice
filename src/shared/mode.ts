// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO WORDS FOR HOW MUCH OF MOLE OFFICE'S OWN MACHINERY IS SHOWN, AND NOTHING ELSE.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY TWO LINES HAVE A FILE OF THEIR OWN, AND WHY IT IS DOWN HERE
 * ---------------------------------------------------------------------------------------------
 *
 * `MODES` was declared in `src/web/lib/mode.ts`, beside the switch that sets it, the storage that
 * remembers it and the React hook that reads it. That is still where all of those live, and
 * `src/web/lib/mode.ts` re-exports these two under the names every caller already imports, so no
 * call site moved and there is one declaration rather than two.
 *
 * What moved, and why: `src/shared/words.ts` is the one table between what Mole Office stores and what a
 * person reads, and on 25 August 2026 it became a SHARED table because the server prints stored
 * words into sentences too. Every function in it takes the mode. `src/shared` may not import
 * `src/web` — the server would then be typed against a module whose siblings import React and read
 * `window` — so the two words the table's callers pass had to be reachable from both sides.
 *
 * WHAT IS DELIBERATELY NOT HERE. `MODE_LABELS` ("Normal"/"Developer"), `MODE_NOTES`, the switch,
 * the address override and the storage all stay in `src/web/lib/mode.ts`. They are browser things,
 * and two of them are sentences, which the sentence gate read by scanning `src/web` file by file
 * until that test was deleted on 12 November 2026.
 */

/**
 * The two positions of the Developer switch.
 *
 * `inspect` is the STORED word — it is what sits in `localStorage` and in `?mode=inspect`, so every
 * screenshot, test and bug report that names it goes on working. What the switch SAYS is
 * "Developer", and that reading is `MODE_LABELS` in `src/web/lib/mode.ts`. This is the same
 * separation everything in `src/shared/words.ts` makes: the machine keeps its spelling and the
 * reader gets a word they can use.
 */
export const MODES = ['normal', 'inspect'] as const
export type Mode = (typeof MODES)[number]
