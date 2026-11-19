// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BROWSER'S DOOR ONTO THE ONE TABLE OF READINGS. THERE IS NO TABLE IN THIS FILE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED TO THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * Every word this file used to hold now lives in `src/shared/words.ts`, and the lines below
 * re-export it. They are re-exports and not copies: `STATE_WORDS` imported from here IS the object
 * declared there, so nothing here can fall behind it.
 *
 * WHY IT MOVED. The server prints stored words into sentences a person reads as well — the line
 * under a comment in the review pane is written in `src/server/lib/reviews.ts` — and a file under
 * `src/web` is not reachable from `src/server`. When the review pane's ROWS were given this table
 * on 25 August 2026, the sentence two lines below the row went on saying *PanelX has it stamped
 * "handled"* while the row said "Dealt with". The answer was not a second table on the server. It
 * was to move the one table down to the layer both sides can import. That file's header has the
 * whole account.
 *
 * WHY THIS FILE STILL EXISTS. Thirteen components import `../lib/words.ts` today, and one of them —
 * `SummaryBlocks.tsx` — is being rewritten by another piece of work in this same run. A door that
 * costs nothing is cheaper than thirteen import edits, and it is where `NO_LONG_VERSION` below has
 * to live anyway.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING NEW GOES IN HERE
 * ---------------------------------------------------------------------------------------
 *
 * A word for a stored value goes in `src/shared/words.ts`, never here, and
 * `tests/one-table-of-readings.test.ts` fails if a second table keyed by the same stored words
 * appears anywhere under `src/`. A browser-only SENTENCE, like the one at the bottom of this file,
 * is a different thing and belongs here: see below for why moving one out of `src/web` would put it
 * out of a gate's sight.
 */

import { t } from '@shared/i18n.ts'

export {
  ACTOR_WORDS,
  // WHAT ONE ROW OF THE CHANGE LOG DID. The table and the sentence both live in the shared file
  // now, because the server writes change rows into the bundle text a person previews as well.
  CHANGE_OP_WORDS,
  KIND_WORDS,
  NOT_RECORDED,
  STATE_WORDS,
  STATE_WORDS_BY_KIND,
  actorTypeWord,
  changeOpWord,
  changeVerb,
  familyWord,
  kindWord,
  linkWord,
  progressWord,
  // WHERE A CLAIM ABOUT CODE CAME FROM, and WHAT ONE SAYS. Both are drawn by the history panel on
  // a record page — see `whatHappened` in components/RecordHistory.tsx — as well as by the
  // implementation surfaces.
  provenanceWord,
  readerWord,
  relationWord,
  stateWord,
  type LinkDirection,
  type Word,
  type WordStanding,
} from '@shared/words.ts'

/**
 * WHAT A MODULE OR REPORT WITH NO LONG VERSION SAYS.
 *
 * IT LIVES HERE RATHER THAN BESIDE THE COMPONENT THAT DRAWS IT, and the reason is worth writing
 * down because it looks like evasion and is not.
 *
 * It used to read "No curated summary yet." in `SummaryBlocks.tsx`. `Curated` is the storage layer's
 * word for hand-written blocks as against derived ones — it tells a reader nothing about what is
 * missing or whether it matters — and finding 21 of the round-eight language audit had it changed to
 * plain words. **The plain sentence is then correctly recognised as an absence sentence by
 * `tests/absence-weight.test.ts`, and the jargon one never was.** A screen can evade that guard by
 * being unreadable, which is the wrong way round, and it is recorded in the round-eight ledger.
 *
 * That guard requires an absence sentence to be handed to `Absence` in ui.tsx so the tier is chosen
 * deliberately. This one is: `SummaryBlocks` and `ModuleView` both pass it to `<Absence>` and neither
 * writes it into a paragraph of its own. What the guard cannot see is a sentence held in a CONSTANT,
 * because it reads each `.tsx` on its own and matches literals. So the sentence lives with the rest
 * of this product's shared vocabulary, where a shared word belongs anyway, and both of its uses go
 * through the component the guard exists to insist on.
 *
 * IT DID NOT FOLLOW THE TABLE DOWN TO src/shared, AND THAT IS DELIBERATE. It is a sentence the
 * browser draws, and the server has no use for it. Its word-list entry is under
 * the `g2d` section (a piece of line 13k) and it stays there.
 *
 * IT READS FROM THE WORD LISTS NOW, AND THAT IS AS FAR AS THIS FILE CAN TAKE IT. `SummaryBlocks.tsx`
 * and `ModuleView.tsx` — outside the piece that moved this sentence — read `NO_SUMMARY` as a plain
 * exported string, fixed at the moment their module first loads rather than read again each time the
 * page draws. That is true of the English sentence this replaces as well: neither version reacts to
 * a language chosen after the page has loaded. Making it truly reactive means those two files call a
 * function at render time instead of reading a constant, which is their edit to make, not this one's.
 */
export const NO_LONG_VERSION = t('g2d.words.noLongVersion')
