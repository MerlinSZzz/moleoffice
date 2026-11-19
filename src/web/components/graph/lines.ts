// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * HOW HEAVILY EACH KIND OF LINE IS DRAWN, and the one ordering between them that is not negotiable.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A TABLE AND NOT FOUR NUMBERS IN A STYLESHEET
 * ---------------------------------------------------------------------------------------
 *
 * The approved decision about the `carries` bundle has two halves. The first is that the bundle is
 * not drawn by default and comes back when a card is pressed; that half is in `EdgeDrawn` in
 * model.ts, it is exercised by `litBySelection`, and the test suite holds it.
 *
 * The second half is that THE GATE AND DEPENDENCY GRAPH STAYS THE VISUALLY DOMINANT SIGNAL. That
 * half was written down in a CSS comment and in nothing else, and it was wrong: a revealed `carries`
 * line was 2.5px against a hard gate's 2.25px, so pressing a module made seven accent-blue lines the
 * heaviest strokes on a canvas whose subject is its dependencies. A photograph found it. A rule that
 * lives only in a comment beside the value it constrains is a rule nothing checks.
 *
 * So the weights are declared here, `Canvas.tsx` builds its CSS from them, and `lineWeightsAreOrdered`
 * states the ordering as an assertion a test can make without a DOM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT DECIDE
 * ---------------------------------------------------------------------------------------
 *
 * COLOUR. Colour in this product is spent on state, from the `--st-` tokens, and a line's tone comes
 * from its gate. The one exception is already argued in Canvas.tsx: a REVEALED line carries the
 * accent, because a selection is not a property of any record — it is where the reader is looking, it
 * is stored nowhere, and it is gone the moment they press elsewhere. Weight is the channel this file
 * owns, and weight is the one that had the defect.
 *
 * ROUTES AND POSITIONS. Those are layout.ts, and none of it is stored.
 */

import type { World } from '@shared/world.ts'

/**
 * Stroke width in screen pixels, at every zoom. `vector-effect: non-scaling-stroke` keeps them in
 * screen pixels, so a drawing shrunk to its whole shape still has lines rather than half-pixels.
 *
 *   `plain`          — a stored typed link carrying no gate. The ordinary weight.
 *   `gate`           — a line with a gate on it, hard or partial. The subject of a pipeline drawing,
 *                      so it is the heaviest thing on the canvas.
 *   `carries`        — a module carries a block. Held back by default; this is the weight it has in
 *                      the one drawing that does show them all, the folded one.
 *   `carriesRevealed` — a `carries` line brought back by a selection. HEAVIER THAN A HELD-BACK ONE,
 *                      because it is the answer to what was just pressed and has to be followable,
 *                      and LIGHTER THAN A GATE, because it must not take the picture over.
 */
export const LINE_WEIGHT = {
  plain: 2,
  gate: 2.25,
  carries: 1.5,
  carriesRevealed: 1.75,
} as const

export type LineWeightName = keyof typeof LINE_WEIGHT

/**
 * The orderings that must hold, each with the sentence saying why, or `[]` when they all do.
 *
 * RETURNS THE REASONS RATHER THAN A BOOLEAN, so a failing test names which rule broke and what the
 * rule is for. A boolean would report "the weights are wrong" and leave the next reader to work out
 * which of three constraints they had violated.
 */
/**
 * ADDED, NOT CHANGED: the three families a link is DRAWN as, and what decides the arrowhead.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THREE AND NOT THIRTEEN
 * ---------------------------------------------------------------------------------------
 *
 * `LINK_TYPES` in shared/types.ts holds thirteen types and the planning graph drew every one of
 * them as the same 1.5px grey arrow. Six of them appear on the live drawing at once — `implements`,
 * `part of`, `derived from`, `relates to`, `about` and `blocks` — and a reader could not tell from
 * the picture which line meant "this waits for that" and which meant "somebody joined these". The
 * word was on the line, in a pill, and the pills were what made the drawing three windows wide.
 *
 * A reader of a PLANNING drawing has three questions about a line and no more:
 *
 *   `sequence`  — one thing waits for another. The subject of a plan, so it is the heaviest stroke.
 *   `builds`    — this contributes to that. The ordinary weight.
 *   `related`   — somebody joined these and this drawing is not claiming a dependency. Dotted.
 *
 * ---------------------------------------------------------------------------------------
 * THE ARROWHEAD IS NOT THIS TABLE'S TO DECIDE
 * ---------------------------------------------------------------------------------------
 *
 * An audit reported that `relates to` AND `about` are symmetric and must lose their arrowheads.
 * Half of that is right: `LINK_TYPES.relates_to.symmetric` is `true`, and drawing a direction on it
 * asserts something the row does not hold. `about` is `symmetric: false` — it reads `about` one way
 * and `subject of` the other — so taking its arrowhead away would assert LESS than the row holds,
 * which is the same defect pointing the other way.
 *
 * So the family decides weight and dash, and `LINK_TYPES[type].symmetric` decides the arrowhead.
 * There is one declaration of which links have a direction and it is the shared one.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY TYPE IS HERE, AND A NEW ONE MUST FAIL RATHER THAN LAND IN `related`
 * ---------------------------------------------------------------------------------------
 *
 * A `Record<string, LinkFamily>` with a `?? 'related'` behind it would silently draw a fourteenth
 * link type as a dotted line nobody chose — rule 2, in the place it is hardest to see. So the
 * lookup returns `null` for a type nobody classified and `unclassifiedLinkTypes` states the gap for
 * a test to fail on.
 */
export const LINK_FAMILIES = ['sequence', 'builds', 'intent', 'related'] as const

export type LinkFamily = (typeof LINK_FAMILIES)[number]

/** Which family each of shared/types.ts's link types is drawn as. Every one of them is here. */
export const LINK_FAMILY_OF: Readonly<Record<string, LinkFamily>> = {
  // One thing waits for another. The only type that states an order in time.
  blocks: 'sequence',
  // This contributes to that: the thing at the tail is part of, or makes, the thing at the head.
  part_of: 'builds',
  implements: 'builds',
  derived_from: 'builds',
  produces: 'builds',
  consumes: 'builds',
  resolves: 'builds',
  supersedes: 'builds',
  // What one step hands the next: the tail leads to the head.
  feeds: 'builds',
  // NOTHING ON THIS LINE HAS HAPPENED YET — either end is an intention, or the tail is meant to
  // become or to answer the head. It is a fourth family and not a dash, because `Canvas.tsx` states
  // the rule that a dashed line in this app means "Mole Office worked this out and nobody confirmed it",
  // and spending it twice would make an inferred link and a planned one the same thing.
  plans_for: 'intent',
  realises: 'intent',
  instead_of: 'intent',
  // A GOAL HAS NOT HAPPENED EITHER. `serves` points from work at the goal it is meant to bring
  // about, so the head of the line is an intention and this is the family that says so. Criterion
  // P1 of design/planning/ACCEPTANCE.md.
  serves: 'intent',
  // Joined, with no dependency claimed. `about` and `discusses` point at a subject; `contradicts`
  // and `measures` are statements about a record rather than steps toward it.
  relates_to: 'related',
  about: 'related',
  discusses: 'related',
  contradicts: 'related',
  measures: 'related',
  // The same question asked twice. It is a statement ABOUT two records rather than a step from one
  // to the other, so it is drawn here and not in `builds` — `builds` reads *the first one leads to
  // the second*, and a duplicate does not lead anywhere, it repeats.
  duplicate_of: 'related',
  // Two decisions that both stand. Neither leads to the other, so it is drawn here and not in `builds`.
  coexists_with: 'related',
}

/** How one family is stroked. Screen pixels; `dash` is an SVG dash array or null for a solid line. */
export interface LineFamilyStyle {
  /** What the key calls it. A name a reader can say, not a type name. */
  label: string
  /** What it means, for the key. One clause. */
  note: string
  width: number
  dash: string | null
}

/**
 * THE LABELS ARE PLAIN WORDS, and that is a rule rather than a preference. `sequence` and `builds
 * toward` were the names of the code's own categories, printed on a key for a person to read;
 * `waits for` and `leads to` are what those lines mean when you say them out loud. The one reader
 * of these two fields is the plan graph's key.
 */
export const LINE_FAMILY_STYLE: Readonly<Record<LinkFamily, LineFamilyStyle>> = {
  sequence: { get label() { return t('g7b.lines.waits_for') }, get note() { return t('g7b.lines.one_thing_waits_for_another') }, width: 2.25, dash: null },
  builds: { get label() { return t('g7b.lines.leads_to') }, get note() { return t('g7b.lines.the_first_one_leads_to_the_second') }, width: 1.5, dash: null },
  intent: { get label() { return t('g7b.lines.planned') }, get note() { return t('g7b.lines.intended_not_yet_done') }, width: 1, dash: null },
  related: { get label() { return t('g7b.lines.related') }, get note() { return t('g7b.lines.joined_and_neither_waits_for_the_other') }, width: 1.5, dash: '3 4' },
}

/**
 * The family a stored link type is drawn as, or null when nobody classified it. Never a default.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ENDS ARE AN ARGUMENT, AND WHAT GOES WRONG WITHOUT THEM
 * ---------------------------------------------------------------------------------------
 *
 * THE FAMILY IS NOT A PROPERTY OF THE TYPE ALONE. `supersedes` is kept for one plan replacing
 * another AND is used between four pairs of ordinary records in this corpus. One type, two worlds.
 *
 * `LINK_FAMILY_OF.supersedes` is `builds`, whose key label is **leads to** — *the first one leads to
 * the second*. So `trj2 supersedes trj1`, drawn off the table alone, reads as *trj2 leads to trj1*:
 * backwards, and in the language of things that happened, on a relation between two intentions.
 * That is the exact drawing fault `instead_of` was split out of `supersedes` to avoid, left standing
 * on the one use of `supersedes` that was kept.
 *
 * So: BOTH ENDS INTENDED means `intent`, whatever the type says. A relation between two intentions
 * is itself intended — there is nothing for the actual language to be about.
 *
 * `ends` is optional and the fallback is unchanged, so every existing caller keeps working and
 * `unclassifiedLinkTypes` below still reads the table.
 */
export function linkFamilyOf(type: string, ends?: { from: World; to: World }): LinkFamily | null {
  if (ends !== undefined && ends.from === 'intended' && ends.to === 'intended') return 'intent'
  return LINK_FAMILY_OF[type] ?? null
}

/**
 * The link types this file does not classify, so a test can fail instead of a drawing guessing.
 *
 * Takes the type names rather than importing `LINK_TYPES`, because this module is the drawing's
 * side of the boundary and the caller is the one that already holds the shared table.
 */
export function unclassifiedLinkTypes(types: readonly string[]): string[] {
  return types.filter((type) => linkFamilyOf(type) === null)
}

/**
 * The orderings the four families must keep, or `[]`. Same shape as `lineWeightsAreOrdered`, and
 * for the same reason: a failing test should name the rule it broke.
 */
export function lineFamiliesAreOrdered(
  style: Record<LinkFamily, LineFamilyStyle> = LINE_FAMILY_STYLE,
): string[] {
  const broken: string[] = []
  if (!(style.sequence.width > style.builds.width)) {
    broken.push(
      `A sequence line is ${style.sequence.width}px and a builds-toward line is ${style.builds.width}px. What waits ` +
        'for what is the question a plan is opened to answer, so it cannot be drawn at or below the weight of a ' +
        'line that only says one thing contributes to another.',
    )
  }
  if (style.related.dash === null) {
    broken.push(
      'The `related` family is drawn solid. A dependency and a "somebody joined these" have to differ by more than ' +
        'a stroke width, because a drawing at fit zoom is where the widths stop being tellable apart.',
    )
  }
  // NOTHING THAT HAS HAPPENED MAY BE OUTWEIGHED BY SOMETHING INTENDED. A plan drawn as heavily as
  // the work is a plan a reader takes for the work.
  if (!(style.intent.width < style.builds.width)) {
    broken.push(
      `An intent line is ${style.intent.width}px and a builds-toward line is ${style.builds.width}px. An intent ` +
        'line joins things that have not happened, so it cannot be drawn at or above the weight of a line between ' +
        'things that have.',
    )
  }
  // AND IT IS NOT DASHED. The dash in this app means "Mole Office worked this out and nobody confirmed
  // it". A planned line is something a person DID confirm — they wrote it down on purpose — and
  // spending the dash on it would make an inferred link and an intended one one thing.
  if (style.intent.dash !== null) {
    broken.push(
      'An intent line is dashed. The dash in this app means Mole Office inferred something and nobody confirmed it; a ' +
        'plan is the opposite of inferred, and one stroke cannot carry both meanings.',
    )
  }
  return broken
}

export function lineWeightsAreOrdered(weights: Record<LineWeightName, number> = LINE_WEIGHT): string[] {
  const broken: string[] = []
  if (!(weights.carriesRevealed < weights.gate)) {
    broken.push(
      `A revealed \`carries\` line is ${weights.carriesRevealed}px and a gate line is ${weights.gate}px. The gate and ` +
        'dependency graph must stay the visually dominant signal: pressing one module reveals every block it ' +
        'carries, which on the seeded pipeline is seven lines at once, and seven lines heavier than the gates is a ' +
        'picture of the wrong fact.',
    )
  }
  if (!(weights.carriesRevealed > weights.carries)) {
    broken.push(
      `A revealed \`carries\` line is ${weights.carriesRevealed}px and a held-back one is ${weights.carries}px. A ` +
        'line brought back by a selection is the answer to what was just pressed and has to read as one, rather ' +
        'than as a line that was always there and went unnoticed.',
    )
  }
  if (!(weights.gate > weights.plain)) {
    broken.push(
      `A gate line is ${weights.gate}px and a plain link is ${weights.plain}px. How hard a dependency is is what a ` +
        'pipeline drawing is opened to read, so it cannot be the lightest thing on it.',
    )
  }
  return broken
}
