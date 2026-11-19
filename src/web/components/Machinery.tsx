// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DIAGNOSTIC: SOMETHING MOLE OFFICE KNOWS ABOUT ITSELF, DRAWN FROM THE VALUE RATHER THAN FROM A
 * STORED SENTENCE.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------------
 *
 * Mole Office composes English sentences out of numbers it is already holding, ships the sentence, and
 * a normal reader meets it on the page. One measured example, from
 * `design/round-ten/design/projections.md` §5.1: under "Shorter forms" a reader is told
 * *"Nobody has written any of the 5 shorter forms of this record … POST
 * /api/records/NHtlTgnKAG8h/short-forms is how they are written."* — a record id and an HTTP route,
 * on a page nobody asked a question about routes on.
 *
 * The sentence goes and the numbers stay. The words are made at the moment of drawing, at one call
 * site, in one string, and only a developer reads them. An agent gets the number in the JSON, with
 * no words anywhere. That is one fact, three presentations, and one string.
 *
 * ---------------------------------------------------------------------------------------------
 * THREE THINGS THIS COMPONENT DOES, AND EACH ONE IS LOAD-BEARING
 * ---------------------------------------------------------------------------------------------
 *
 * 1. IT RENDERS NOTHING FOR A NORMAL READER — `null`, not `display:none` and not `px-sr`. An
 *    off-screen span still reaches `document.body.innerText` and still reaches a screen reader, so
 *    hiding it that way would read out every id on a page that shows none. Measured: a page holding
 *    `<span class="px-sr">SRTEXT</span><span hidden>HIDDENTEXT</span>` gives an innerText of
 *    "visible\nSRTEXT". The `px-sr` version is the mutation that must turn the sweep red.
 *
 * 2. ITS CHILDREN ARE WORDS, NOT ELEMENTS, AND THAT IS THE FLOOR'S GUARD. Typing children as
 *    strings and numbers means `<Machinery><Absence …/></Machinery>` does not compile, so none of
 *    the ten things a reader must always be shown (`settings-and-governance.md` §6) can be placed
 *    inside one. There is no test for this because there is no test to forget: it is a type.
 *    Widening these children back to `ReactNode` would delete the only enforcement that rule has.
 *
 * 3. `fact` AND `value` GO ONTO THE ELEMENT, so a sweep can COUNT machinery on a page rather than
 *    grep for words that might be somebody's writing. The Normal-mode sweep asserts
 *    `[data-fact]` is 0 on thirty pages.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------------
 *
 * IT IS NOT A GENERAL PROJECTION ENGINE AND MUST NOT BECOME ONE. It draws one class of thing: a
 * diagnostic a normal reader has no use for. A fact a normal reader DOES need is not a
 * `<Machinery>` with a normal branch — it is a different element, designed for that screen: a
 * count, a chip, a shape, an `Absence`. Never a second wording of the same sentence.
 *
 * A DEVELOPER-ONLY REGION IS NOT A `<Machinery>`. A table of implementation paths, a telemetry
 * trace, a work-domain overlap list — those are regions of a page, and the mechanism for them is
 * `useInspect()` at the call site, which is already at 51 sites and named in `docs/UX-CONTRACT.md`.
 * The rule that separates them: `<Machinery>` is words about a value; `useInspect()` is a region.
 *
 * IT CANNOT GO INSIDE AN ATTRIBUTE. It is an element, so it cannot be put in a `title=` or an
 * `aria-label=`. A diagnostic that has to reach one of those is a conditional string built at the
 * call site with `useInspect()`, and the Normal-mode sweep's second pass is what catches a leak
 * through that channel, because a `[data-fact]` count cannot see one.
 */

import { readerSees } from '@shared/audience.ts'
import { useReader } from '../lib/mode.ts'

export function Machinery({ fact, value, children }: {
  /** What this is about, as a stable key a sweep can count. Not a sentence: `shortForms.written`. */
  fact: string
  /** The value the words were made from. It is put on the element so it can be read without parsing. */
  value: string | number | boolean | null
  /** The words, made from the value at the call site. Strings and numbers only — see 2 above. */
  children: string | number | readonly (string | number)[]
}) {
  const reader = useReader()
  // ONE RULE, ASKED RATHER THAN REPEATED. `readerSees` in src/shared/audience.ts is the only place
  // "does this reader see this?" is worked out, so if the owner settles proposal Ys8Oy7Oy5BNg with
  // four audiences instead of two, this call site does not move.
  if (!readerSees('developers', reader)) return null
  return (
    <span className="px-mach" data-fact={fact} data-value={String(value)}>
      {children}
    </span>
  )
}
