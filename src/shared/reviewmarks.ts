// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EIGHT MARK STATES A REVIEW DRAWS, AND THE TWO ALARMS THAT ARE NOT AMONG THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS SEPARATELY FROM THE COLOUR REGISTER
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/review.md` section 8.2 names eight mark states in two ladders of four —
 * a quote mark filling up as a set of comments becomes ready, an arrow filling up as it is carried
 * to somebody — and it says in its own words that it *"names the roles and their non-colour
 * channels and does not choose hues, because that register is another thread's"*. So the SHAPE of
 * a mark is declared here and the HUE of a mark is declared in `src/shared/colourroles.ts`. The
 * test that stopped the two drifting apart was deleted on 12 November 2026.
 *
 * ---------------------------------------------------------------------------------------
 * `hue` IS ON EVERY ENTRY AND IT IS `null` ON EVERY ENTRY TODAY
 * ---------------------------------------------------------------------------------------
 *
 * review.md 8.2 names no default for the eight mark states, because the person named none. A
 * field that is null everywhere looks like a field nobody needed until you read what the register
 * test does with it: a mark may only draw a hue its own register row declares, so the field is the
 * hinge the test turns on. Give one of the eight a hue and the register row that does not declare
 * it fails the build. That is the whole point — the defect this pair exists to prevent is the one
 * review.md names, two threads choosing colours independently until success, failure, global scope
 * and semantic level are all the same grey.
 *
 * ---------------------------------------------------------------------------------------
 * FAILED AND NEEDS ATTENTION ARE NOT AMONG THE EIGHT, AND THAT IS SECTION 8.2's OWN SHAPE
 * ---------------------------------------------------------------------------------------
 *
 * Its heading is *"Eight states, eight shapes, and the alarm always wins"* — the alarm is named
 * beside the eight, not inside them, and its two members are the only rows in that section printed
 * in bold. They are here as `REVIEW_ALARM_MARKS` so the vocabulary is complete and so the register
 * test can hold them to the same rule: neither may draw a hue while neither has a register row.
 * Wave 14 wrote ten review rows — the eight states, `review.local` and `review.global` — and these
 * two are the named remainder rather than a silent one.
 *
 * NOTHING IN `src/web` DRAWS THESE YET. Review's marker component is not built; this is the
 * vocabulary it will draw from, and the register row is written before the first hue is chosen so
 * that choosing one is a change to the register rather than a change to a stylesheet.
 */

/** A quote mark for readiness, an arrow for dispatch, a cross and a triangle for the two alarms. */
export type MarkGlyph = 'quote' | 'arrow' | 'cross' | 'triangle'

/** How full the glyph is drawn. `full-notched` is `full` with a tick cut into it. */
export type MarkFill = 'hollow' | 'quarter' | 'half' | 'full' | 'full-notched'

export interface ReviewMark {
  /** The word a reader is shown, and what a screen reader says at the `label` rung. */
  word: string
  /** Which of section 8.2's two ladders this belongs to, or `alarm`. */
  family: 'readiness' | 'dispatch' | 'alarm'
  glyph: MarkGlyph
  fill: MarkFill
  /**
   * The hue token this mark draws, or null for none. A non-null value must be declared by this
   * mark's own row in the colour role register; see the note at the head of this file.
   */
  hue: string | null
}

/**
 * The eight. Order is the order a set of comments moves through: written, gathered, grouped, ready
 * to go, and then queued, delivered, opened and dealt with.
 */
export const REVIEW_MARK_STATES: Readonly<Record<string, ReviewMark>> = {
  draft: { word: 'Draft', family: 'readiness', glyph: 'quote', fill: 'hollow', hue: null },
  collected: { word: 'Collected', family: 'readiness', glyph: 'quote', fill: 'quarter', hue: null },
  organised: { word: 'Organised', family: 'readiness', glyph: 'quote', fill: 'half', hue: null },
  ready: { word: 'Ready', family: 'readiness', glyph: 'quote', fill: 'full', hue: null },
  queued: { word: 'Queued', family: 'dispatch', glyph: 'arrow', fill: 'hollow', hue: null },
  delivered: { word: 'Delivered', family: 'dispatch', glyph: 'arrow', fill: 'quarter', hue: null },
  pickedUp: { word: 'Picked up', family: 'dispatch', glyph: 'arrow', fill: 'half', hue: null },
  handled: { word: 'Handled', family: 'dispatch', glyph: 'arrow', fill: 'full-notched', hue: null },
} as const

/**
 * The two alarms. A cross says the attempt is over and did not work; a triangle says a person has
 * to do something. They are different shapes because section 8.2's first version gave both a
 * triangle and separated them by colour, on the same page that says colour is never load-bearing.
 */
export const REVIEW_ALARM_MARKS: Readonly<Record<string, ReviewMark>> = {
  failed: { word: 'Failed', family: 'alarm', glyph: 'cross', fill: 'full', hue: null },
  needsAttention: { word: 'Needs attention', family: 'alarm', glyph: 'triangle', fill: 'full', hue: null },
} as const

/** Every mark a review can draw, the eight and the two alarms, in one map. */
export const ALL_REVIEW_MARKS: Readonly<Record<string, ReviewMark>> = {
  ...REVIEW_MARK_STATES,
  ...REVIEW_ALARM_MARKS,
}
