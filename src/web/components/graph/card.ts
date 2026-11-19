// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * WHAT A CARD ON THE CANVAS SAYS, AND HOW BIG THE BOX AROUND THEM ALL IS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT INSIDE Canvas.tsx
 * ---------------------------------------------------------------------------------------
 *
 * The test runner has no DOM, so `Canvas.tsx` — which imports React Flow, its stylesheet and,
 * through layout.ts, 8 MB of compiled Java — cannot be loaded in a test at all. That is stated in
 * its own header as a deliberate boundary: exactly one file is untestable and everything else in
 * this directory can be held by the suite.
 *
 * These decisions were inside that file and they are the ones most worth checking, because every
 * one of them was WRONG in a photograph and fixed afterwards:
 *
 *   - what a card carries at each detail level, which is why the modules drawing was legible only
 *     at a third size, and why a step nobody carries said so twice on the same card;
 *   - how a step says which side of a wall it is on, which was a two-line paragraph on six cards;
 *   - how a written fact is cut, which has to work in a script with no spaces;
 *   - how tall the canvas box is, which used to be fixed and left 400px of empty grey.
 *
 * None of them needs React or a browser. They are pure functions of the meaning `model.ts` builds,
 * so they live here and the drawing imports them.
 *
 * ---------------------------------------------------------------------------------------
 * THE PRINCIPLE ALL OF THEM SERVE
 * ---------------------------------------------------------------------------------------
 *
 * SCAN FIRST, EXPLAIN ON DEMAND — and nothing is deleted. A canvas opens FITTED, so every extra
 * line on a card makes every card smaller: a card holding a paragraph is a card nobody can read at
 * the size the drawing opens at. So the card carries what a person scans by — the name, the state,
 * a count — and the reading layer one press away under "List" prints every fact whole, in a
 * stated order, searchable and printable.
 *
 * THE READING LAYER IS THE COMPLETE GRAPH; THE CANVAS DRAWS A PROJECTION OF IT. This file is about
 * one card and that has not changed — every level counts what it left off, in `withheld`. What did
 * change is above it: the canvas may be handed fewer CARDS than the graph holds, and the boundary
 * for that is written in StructureView.tsx, which retired the invariant that the two compositions
 * render one object. Nothing here decides which cards exist, and nothing here may.
 *
 * ---------------------------------------------------------------------------------------
 * THREE DETAIL LEVELS: THIS FILE SAYS WHAT, THE RENDERER SAYS WHEN
 * ---------------------------------------------------------------------------------------
 *
 * `DETAIL_LEVELS` in shared/presentation.ts names them and this file fills them in:
 *
 *   `title`        — the ordinal and the name, and nothing else. For a far or overview zoom, where
 *                    a second line is four pixels tall and stealing width from the one thing that
 *                    can still be read.
 *   `title-state`  — what a drawing OPENS at. The name, the state chip, and the first few badges:
 *                    counts and single words, one row of pills. No paragraph, no fact lines, no
 *                    list of attached records — those are what made twelve module cards fit only at
 *                    a third size, which was photographed.
 *   `expanded`     — one card, selected. Its own words, every fact, every attached record with the
 *                    sentence saying why it needs a person, and the whole wall sentence.
 *
 * THE LEVEL IS A DECISION ABOUT ROOM, AND THE RENDERER OWNS IT. Zoom and selection are things only
 * something with a viewport can know, so nothing here reads either. What this file exports is a
 * table — `CARD_AT_LEVEL` — and one function that applies it, so the canvas, the reading layer and
 * a test all get the same answer to "what does this card carry at this level".
 *
 * NOTHING VANISHES BETWEEN LEVELS WITHOUT BEING COUNTED. `CardContent.withheld` says what this level
 * left off, how much of it, and where to read it — and `withheldAcrossCanvas` adds that up into the
 * one sentence a drawing prints about itself. A card that quietly showed less at one zoom than at
 * another would be the silent fallback this product bans, drawn instead of typed.
 */

import type { DetailLevel, NodeRole } from '@shared/presentation.ts'
// THE SEVEN-POSITION LADDER, WHICH IS THE PRODUCT'S AND NOT THE GRAPH'S. A card is at one of its
// positions; `levelLabel` is how that position is named to a reader, in one place, so a card and the
// control on a report cannot come to two names for one level.
import { RUNGS, levelLabel, positionOf, type LevelAbsence, type Rung } from '@shared/detail.ts'
// WHICH POSITIONS ARE WRITTEN BY PART, asked of the declaration in shared/zoom.ts rather than by
// testing a word against a list written again here.
import { isByPartLevel } from '@shared/zoom.ts'
import type { DrawnPart } from '@shared/reportrungs.ts'
// THE ONE TABLE THAT SAYS HOW A RESTRICTION IS DRAWN. Read here; never copied here. See
// `restrictionOnCard` for what this file takes from it and what it deliberately leaves.
import {
  restrictionDrawing,
  worstSeverity,
  type RestrictionSeverity,
} from '@shared/restriction.ts'
import type { AlarmLevel, PanelState } from '../ui.tsx'
import {
  countPhrase,
  markOf,
  MARK_WORDS,
  THE_TWO_READINGS,
  type Badge,
  type CardFact,
  type CardMark,
  identityFor,
  type GraphNode,
  type GraphRung,
  type NodeIdentity,
  type StructureGraph,
} from './model.ts'

/**
 * ONE COUNT MARK AS THIS CARD DRAWS IT: the count, the shape, and the word if there is room.
 *
 * `word` IS NULL WHERE THE CARD HAS NO ROOM FOR WORDS, which is every rung below the one that
 * prints the record's own line. The mark still carries its whole sentence, so the fact is never
 * only a numeral: it is a numeral, a shape and a sentence a reader can hover to read. Criterion D20.
 */
export interface CardMarkDrawn extends CardMark {
  word: string | null
}

// ============================================================================ what a card prints

/**
 * How many attached records a CARD prints before it counts the rest.
 *
 * A card is not the archive. Twelve modules with every attached record on each is a canvas of
 * columns rather than cards, and the reading layer already prints all of them in order.
 *
 * THE LEVEL TABLE BELOW IS THE ANSWER NOW, and this number is the one the canvas applied before
 * there were levels: a scanned card prints NO attached record and counts them by kind in its badges
 * instead. It is kept exported because `Canvas.tsx` still imports it, and it should go when that
 * file reads `cardAt` — which is the same bargain, said once, per level.
 */
export const ATTACHED_ON_A_CARD = 4

/**
 * How many of a record's PARTS a card prints before it counts the rest.
 *
 * A card at level 4, 5 or 6 draws the record written by part — the same headings and texts the
 * report page draws. A report with twenty-four parts is a document, and a document in a box on a
 * canvas is the fault the whole ladder exists to prevent, so a card draws the first few and
 * `withheld` counts the others by name. Three is what fits beside a title and a mark row in the
 * widest card this drawing has.
 */
export const PARTS_ON_A_CARD = 3

/**
 * Facts a card never prints at any level, because the drawing already states them as lines.
 *
 * Keyed by node kind and exhaustive over it, so a new kind of node stops this compiling rather than
 * quietly getting an empty card.
 */
export const DRAWN_AS_LINES: Readonly<Record<GraphNode['kind'], readonly string[]>> = {
  module: [],
  pipeline: [],
  get step() { return [t('g7b.card.waits_on')] },
  // A plan card's facts are the plan's own — its role, its due, its hours — and none of them is a
  // line on the drawing. The lines there are the stored links, whose word rides on the line itself.
  plan: [],
}

/**
 * The fact lines this node's card prints at a given detail level, in the order `model.ts` put them.
 *
 * TWO THINGS ARE LEFT OFF AT EVERY LEVEL, and each has its own reason.
 *
 * `waits on` IS THE LINES. Every one of a step's `needs` is drawn between two cards with its gate on
 * it, and printing what is already drawn is how a picture becomes a list with boxes round it. That
 * is `DRAWN_AS_LINES`, and it is per kind because it is a fact about the drawing rather than about
 * the fact.
 *
 * ONE FACT, ONE LINE. A step nobody carries had it written twice on the same card — once as the
 * `carried by` fact ("no module carries this step. Nobody owns it yet, and somebody recorded that")
 * and once as the note under it ("No module carries this step — nobody owns it yet. That is a
 * recorded answer, not a field to fill in."). A photograph found it, on two of twelve step cards.
 * The note is the fuller sentence and it is the one kept; `model.ts` sets a note on a step for
 * exactly this case and no other.
 *
 * THE DEFAULT IS THE FULLEST ANSWER, on purpose. A caller that does not say which level it is
 * drawing is asking what this card CAN print, and answering with a silently narrowed subset is the
 * kind of quiet default this product bans — in an argument as much as on a screen.
 */
export function factsOnCard(node: GraphNode, rung: RungName = 'R8'): CardFact[] {
  if (CARD_RUNGS[rung].facts === 0) return []
  const drawn = DRAWN_AS_LINES[node.kind]
  return node.facts.filter(
    (fact) => !drawn.includes(fact.label) && !(node.note !== null && fact.label === t('g7b.card.carried_by')),
  )
}

// ============================================================================ the nine rungs

/**
 * HOW MUCH ONE OBJECT MAY SAY, AS NINE POSITIONS. This is the ladder the whole drawing is built on.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The drawing used to have three card levels and four distances, and zooming changed ONE thing: how
 * much prose each card printed. Measured on the campaign drawing, every card at every distance:
 * 1,203 characters at the farthest, 10,657 at the closest. The farthest level drew every card's full
 * name at under five pixels tall, and the closest drew a 187-character sentence on 27 cards and a
 * list of 34 attached records on one. That is a document whose prose is progressively shortened, and
 * a graph is not one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A RUNG IS
 * ---------------------------------------------------------------------------------------
 *
 * A RUNG SAYS WHICH PARTS OF A CARD ARE DRAWN AND HOW MANY OF EACH. It never says how many
 * characters. What the whole canvas costs falls out of two other things — how many objects are drawn
 * with words at all, and how many of those are near what the reader pointed at.
 *
 * A CHARACTER BUDGET USED TO BE SPENT HERE IN A FIXED ORDER, AND IT IS DELETED. It went on the
 * ordinal, then the name, then the state word, then the count marks, then the counts standing in for
 * lines, then the record's own line, and whatever ran out of room was counted in `withheld`. Once
 * names stopped being cut a long name spent the whole budget, so the card lost its state chip and
 * every mark it had. See the note on `CardRung`.
 *
 * NO RUNG INVENTS A CHARACTER, AND NO RUNG CUTS ONE EITHER. Every rung names the stored field it
 * draws and draws all of it or none of it.
 *
 * ---------------------------------------------------------------------------------------
 * THE NINE, AND THE TWO THAT ARE NOT ON THE CANVAS
 * ---------------------------------------------------------------------------------------
 *
 *   R0    0     the shape alone. Kind is the outline, state is the fill and the border, a block
 *               holding a pipeline of its own keeps its stacked edge, a walled step carries the
 *               wall mark. No character at all.
 *   R1   ≤5     R0 plus the numbers where a number IS the meaning: a step's ordinal, one count
 *               drawn as a mark — `11/17`, `3` — with an icon saying which count it is.
 *   R2   ≤10    R1 plus the name, whole. Ten is what the COUNTS on the card may spend, not the name.
 *   R3   ≤20    R2 with a longer clip and a second mark. State is still a mark, not a word.
 *   R4   ≤40    the name as far as it fits, plus the state as a WORD. This is where words start.
 *   R5   ≤80    R4 plus the one count that stands in for something the picture does not draw.
 *   R6   ≤200   R5 plus the record's own line — the `summary` column, whole.
 *   R7   ≤500   the compact card: R6 plus up to three written facts and the wall in words.
 *   R8   full   the record's own page.
 *
 * R7 AND R8 ARE NOT DRAWN ON THE CANVAS, and that is the owner's line rather than a shortcut: a
 * ~500 or full representation is an inspect experience, not prose sprayed across a graph node. The
 * reading layer under the drawing prints R8 for every object already. `CANVAS_RUNGS` is the six the
 * canvas may use. `tests/graph-card.test.ts` reads it to check that no fact line, note or wall
 * sentence is drawn at any of the six. Nothing checks that the canvas asks for these six only: the
 * zoom bands that chose a rung were deleted, and so was the test that held them.
 */
export const RUNG_NAMES = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'] as const
export type RungName = (typeof RUNG_NAMES)[number]

/** The six a card on the canvas may be drawn at. R7 and R8 are the inspect experience. */
export const CANVAS_RUNGS: readonly RungName[] = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6']

/**
 * WHAT ONE RUNG DRAWS. COUNTS OF THINGS, AND NEVER A COUNT OF CHARACTERS.
 *
 * A CHARACTER BUDGET USED TO SIT AT THE TOP OF THIS AND IT IS DELETED. It was 0, 5, 10, 20, 40, 80,
 * 200, 500 and infinity, and `cardAt` spent it in order: the ordinal first, then the name, then the
 * state, then the counts. Once names stopped being cut, a long name spent the whole of it, and the
 * card lost its state chip and every one of its marks — silently, with nothing on the card saying a
 * mark had been dropped. Measured on the seed: `LeafCam 2 overhead camera` is 25 characters at a rung
 * that allowed 10, so that card drew a name and nothing else at all.
 *
 * A restriction mark that vanishes because somebody wrote a long title is the same fault as an empty
 * box, one field along, so this table now rations only things a reader can count — how many marks,
 * how many counts in words, how many facts, how many attached records — and `design/round-ten/design/
 * graph.md` §6 says the same in one sentence: the graph's own character budgets are deleted.
 */
export interface CardRung {
  name: RungName
  /** True when the ordinal and the count marks are drawn. */
  marks: boolean
  /** How many count marks at most. The rest are counted in `withheld`. */
  markCount: number
  /**
   * WHICH POSITION OF THE DETAIL LADDER THE NAME IS READ AT. Null where this rung draws no name —
   * and no rung the canvas can reach has null here, which is `CARD_RUNG_AT`'s whole job.
   *
   * `nameChars` USED TO SIT BESIDE IT AND IT IS DELETED. It was 8 at R2 and 14 at R3, and "eight
   * characters of a name" is not a thing that exists.
   */
  nameAt: GraphRung | null
  /** True when the state is a word beside the mark. False: the mark alone carries it. */
  stateWord: boolean
  /** How many counts that stand in for lines this drawing holds back are drawn IN WORDS. */
  standsIn: number
  /** True when the record's own line — the `summary` column — is drawn. */
  ownLine: boolean
  /** How many written facts. Zero at every rung the canvas uses. */
  facts: number
  /** How the wall a step stands at is drawn. */
  wall: 'mark' | 'words' | 'sentence'
  /** How many attached records are printed. Zero at every rung the canvas uses. */
  attached: number
  /** True when the fuller sentence a node writes about itself is printed. */
  note: boolean
}

/**
 * THE SHORTEST STRETCH OF THE RECORD'S OWN LINE WORTH DRAWING.
 *
 * IT NO LONGER GUARDS A NAME. A name is never cut, so there is no such thing as a name too short to
 * be worth drawing. What is left is the record's own line: a stored `summary` of three characters
 * or fewer is a row somebody started and did not finish, and a line of it on a card would read as
 * the record's answer. Four characters is about one short word in Latin script and two characters
 * in Chinese.
 */
export const NAME_FLOOR = 4

export const CARD_RUNGS: Readonly<Record<RungName, CardRung>> = {
  R0: { name: 'R0', marks: false, markCount: 0, nameAt: null, stateWord: false, standsIn: 0, ownLine: false, facts: 0, wall: 'mark', attached: 0, note: false },
  R1: { name: 'R1', marks: true, markCount: 1, nameAt: null, stateWord: false, standsIn: 0, ownLine: false, facts: 0, wall: 'mark', attached: 0, note: false },
  R2: { name: 'R2', marks: true, markCount: 1, nameAt: 'label', stateWord: false, standsIn: 0, ownLine: false, facts: 0, wall: 'mark', attached: 0, note: false },
  R3: { name: 'R3', marks: true, markCount: 2, nameAt: 'label', stateWord: false, standsIn: 0, ownLine: false, facts: 0, wall: 'mark', attached: 0, note: false },
  R4: { name: 'R4', marks: true, markCount: 2, nameAt: 'title', stateWord: true, standsIn: 0, ownLine: false, facts: 0, wall: 'mark', attached: 0, note: false },
  R5: { name: 'R5', marks: true, markCount: 4, nameAt: 'title', stateWord: true, standsIn: 1, ownLine: false, facts: 0, wall: 'mark', attached: 0, note: false },
  R6: { name: 'R6', marks: true, markCount: 6, nameAt: 'title', stateWord: true, standsIn: 2, ownLine: true, facts: 0, wall: 'mark', attached: 0, note: false },
  R7: { name: 'R7', marks: true, markCount: 8, nameAt: 'title', stateWord: true, standsIn: 4, ownLine: true, facts: 3, wall: 'words', attached: 0, note: true },
  R8: { name: 'R8', marks: true, markCount: 99, nameAt: 'title', stateWord: true, standsIn: 99, ownLine: true, facts: 99, wall: 'sentence', attached: 99, note: true },
}

/** Where a rung sits on the ladder, 0 to 8. Used to move one step and to compare two. */
export function rungPosition(name: RungName): number {
  return RUNG_NAMES.indexOf(name)
}

/** The rung this many steps along, stopping at both ends. */
export function rungStep(name: RungName, by: number): RungName {
  const at = Math.min(RUNG_NAMES.length - 1, Math.max(0, rungPosition(name) + by))
  return RUNG_NAMES[at] as RungName
}

/**
 * The level a card is drawn at after the stored `role` has had its say.
 *
 * THIS IS WHERE PRESENTATION INTENT REACHES THE CARD. `compact` and `prominent` are a rank rather
 * than a size in pixels, and the honest way to spend a rank is on how much of itself a node shows: a
 * node somebody marked `compact` is present for completeness and draws one rung lower; one marked
 * `prominent` is what to land on first and draws one rung higher.
 *
 * NEITHER CAN REACH R6. That rung is the object the reader pointed at, and a stored hint that put a
 * paragraph on the canvas by default is the exact failure this pass exists to remove.
 */
export function rungWithRole(rung: RungName, role: NodeRole): RungName {
  if (role === 'compact') return rungStep(rung, -1)
  if (role === 'prominent') return rungPosition(rung) >= rungPosition('R5') ? rung : rungStep(rung, 1)
  return rung
}

/**
 * THREE DETAIL LEVELS USED TO SIT HERE AND THEY WERE THE WRONG SHAPE.
 *
 * `CARD_AT_LEVEL` was a table of three — `title`, `title-state`, `expanded` — and every card on the
 * canvas drew the same one. `LevelRule` and `levelWithRole` are deleted rather than moved: the nine
 * rungs above replace them, `rungWithRole` is the same decision about stored intent said against the
 * new ladder, and `DetailLevel` stays where it belongs, in shared/presentation.ts, for the surfaces
 * that are documents rather than drawings.
 */

/** What a level left off this card, counted, with where the whole of it can be read. */
export interface Withheld {
  /** A plural noun phrase: "counts", "attached records", "what this module is for". */
  what: string
  count: number
  /** Where to read it. Always a place, never "elsewhere". */
  where: string
}

/**
 * THE STATE AS A WORD, at the rungs that have room for words.
 *
 * THE KIND USED TO BE THE OTHER HALF OF THIS TYPE and it is deleted. A record with no state word
 * drew its kind in the chip — `module`, `pipeline` — on 79 to 116 characters per drawing. The kind
 * is the OUTLINE of the box, and a word repeating the outline is the definition of prose the picture
 * already draws. A node with no state now draws no chip at all.
 */
export interface CardChip {
  at: 'state'
  state: PanelState
  word: string
  alarm: AlarmLevel | undefined
}

/**
 * Stored words a card draws, and the exact field they were read out of.
 *
 * `field` is the assertion a test makes. A card that says it drew the summary column and drew
 * something else is a card nobody can check, and a character count would pass either way.
 */
export interface CardWords {
  /**
   * THE CHARACTERS DRAWN. Every one of them was stored, and every stored one is here.
   *
   * NOTHING ON THIS CANVAS CUTS A NAME ANY MORE. `clipTo` cut the stored words to a rung's character
   * budget and a wedge beside them said so; `Mole Office d` and `Wave 5 — Plann` are what that produced,
   * and the reader could not tell five different blocks apart. A rung is a request for a stored form
   * now, not a budget that cuts, so `text` and `full` are the same string and the second is kept
   * only because a title attribute and a popover both want it under a name of their own.
   */
  text: string
  /** The stored characters. Equal to `text`: nothing here shortens anything. */
  full: string
  /** The rung of the detail ladder this distance asked for. */
  asked: Rung
  /** The rung that actually answered. Equal to `asked` when somebody wrote at that length. */
  drew: Rung
  /** The stored path, such as `summary` or `data.shortForms.label`. */
  field: string
}

/** Everything a renderer needs to draw one card at one rung, and nothing it has to work out. */
export interface CardContent {
  /** The rung asked for, before the stored role had its say. */
  asked: RungName
  /** The rung actually drawn. It differs from `asked` only where a role is stored on the node. */
  rung: RungName
  /**
   * HOW MANY CHARACTERS THIS CARD DREW. A measurement of the finished card, and nothing decides
   * anything from it. `tests/graph-no-empty-boxes.test.ts` adds it up over a whole drawing to hold
   * the one bound this file still has: the canvas is a picture at every position and not a document.
   */
  chars: number
  /** Where this object sits relative to what the reader pointed at. */
  tier: FocusTier
  /** Why this object carries words at all here, or null when it is drawn as a shape. */
  earns: InclusionReason | null
  /** How much the whole drawing says, or null when the caller asked for a rung directly. */
  says: Rung | null
  /** The step's number. Drawn from R1: a number that IS the meaning. */
  ordinal: string | null
  /** The name, WHOLE. Null only at a rung that draws no name, which no canvas position reaches. */
  name: CardWords | null
  /** The drawn name as a bare string, for a renderer. Null where no name is drawn. */
  title: string | null
  /**
   * WHERE THE NAME ON THIS CARD CAME FROM.
   *
   *   `node`       the node's own name — a record's title column, or a step's name inside its
   *                pipeline. This is the answer wherever nobody wrote a shorter one.
   *   `shortForm`  somebody wrote a shorter name at rung 1 and this distance is drawing it.
   *
   * IT IS NOT A FALLBACK AND IT IS NOT SILENT. The two are different facts about the record and the
   * card says which one it is drawing.
   */
  nameFrom: 'node' | 'shortForm'
  /**
   * The record's own line about itself — the `summary` column — at the one rung that has room.
   *
   * NULL IS TWO DIFFERENT ANSWERS AND THE CARD SAYS NEITHER OF THEM WRONGLY: this rung draws no own
   * line, or nobody wrote a summary for this record. `withheld` counts the second case.
   */
  body: CardWords | null
  /**
   * WHICH POSITION OF THE LADDER THIS CARD IS AT, or null when the caller asked for a bare rung.
   *
   * It is the fact a comment right-clicked onto this card records as the view it was written in,
   * and `readingWordOnACard` in CardFace.tsx is the one place it becomes the attribute.
   */
  level: Rung | null
  /**
   * THE RECORD'S PARTS, at levels 4, 5 and 6, in the order they are written. Empty at every other
   * level, and empty where nobody wrote them.
   *
   * They and `body` are never both drawn: the parts are what those levels are written as.
   */
  parts: readonly DrawnPart[]
  /**
   * A LEVEL THE READER ASKED FOR BY NAME THAT THIS RECORD HAS NOT GOT, and why, or null.
   *
   * The card draws that in words. It is never a lower level dressed up as the one asked for.
   */
  missing: MissingLevel | null
  /** The state as a WORD. Null below R4, where the state is the fill and the border instead. */
  chip: CardChip | null
  /** Counts drawn as a numeral and an icon. The compact form of a badge. */
  marks: CardMarkDrawn[]
  /** Counts drawn in WORDS, and only the ones standing in for lines this drawing holds back. */
  badges: Badge[]
  /** Written facts. Empty at every rung the canvas uses — they are R7 and above. */
  facts: CardFact[]
  /** Attached records. Empty at every rung the canvas uses — a list is not a picture. */
  attached: GraphNode['attached']
  /** Attached records this card had no room for, named by kind. Null when it had room for them all. */
  more: { count: number; named: string } | null
  /**
   * Which side of a wall a step stands on. `words` is null on the canvas: the side is a MARK and a
   * position, and the sentence naming the records whose gates put it there is R7 and above.
   */
  wall: { at: 'at' | 'behind' | 'unplaced'; words: string | null } | null
  note: string | null
  withheld: Withheld[]
}

/**
 * WHICH STORED FIELD A NODE'S OWN NAME IS.
 *
 * A module and a pipeline draw their record's title column. A BLOCK does not: its title column is
 * qualified by the pipeline it belongs to, so the name on the card is the step's name inside that
 * pipeline — a different stored string, and the card says which one it drew rather than letting a
 * test compare the drawn characters against the wrong column.
 */
const NAME_FIELD: Readonly<Record<GraphNode['kind'], string>> = {
  module: 'title',
  pipeline: 'title',
  get step() { return t('g7b.card.the_step_s_name_inside_its_pipeline') },
  // A plan card draws the name the planning route split for it: the record's title column, except
  // on a block, where the title is qualified by its pipeline and the name is what is left.
  get plan() { return t('g7b.card.the_record_s_name_on_the_plan') },
}


/**
 * WHICH BADGES MAY BE DRAWN IN WORDS: only the counts standing in for lines nobody can see, and
 * never a count of zero.
 *
 * A COUNT OF ZERO IS AN ABSENCE, AND AN ABSENCE IS A SHAPE. `nobody carries this` was a badge on 38
 * of 38 step cards and `carries no step` on every module carrying nothing — a sentence repeated
 * until it is wallpaper, which is the owner's own example of prose a mark should replace. The card's
 * left rail goes dotted instead, and the numeral zero stands beside the carries shape.
 *
 * A COUNT OF NONE IS DIFFERENT AND KEEPS ITS WORDS. `runs independently` and `dependencies written
 * down` have no numeral at all, so there is no mark that could carry them; they are the answer to
 * which of two silences a pipeline is in, and nothing else on the drawing says it.
 */
function standInBadges(node: GraphNode): Badge[] {
  return node.badges.filter((badge) => badge.standsInForLines && badge.count !== 0)
}

/**
 * WHAT ONE OBJECT DRAWS AT ONE RUNG.
 *
 * PURE, AND THE ONLY ANSWER. The canvas draws what this returns, a test asserts on what this
 * returns, and the reading layer prints R8 of it. Three renderers with their own idea of what a card
 * says is how the same node came to state one fact twice, which a photograph found.
 *
 * THE BUDGET IS SPENT IN THIS ORDER AND STOPS WHEN IT RUNS OUT: the ordinal, the name, the state
 * word, the counts that stand in for lines the drawing holds back, the other counts as marks, and
 * the record's own line. Everything that did not fit is counted in `withheld` and printed once under
 * the canvas.
 *
 * WHAT IT DELIBERATELY DOES NOT CARRY IS THE LINKS. An opened module should show its related work,
 * and those are EDGES: they belong to two nodes rather than one, and `graph.edges` filtered by this
 * node's id is the whole of it — which is what `Outline.tsx` already does.
 */
export function cardAt(node: GraphNode, asked: RungName | CardPlan): CardContent {
  const plan: CardPlan =
    typeof asked === 'string'
      ? {
          rung: asked,
          tier: 'ordinary',
          earns: null,
          says: null,
          level: null,
          size: null,
          room: null,
          height: null,
          width: null,
          levelFrom: null,
          missing: null,
          identity: null,
        }
      : asked
  const askedRung = plan.rung
  const rungName = rungWithRole(askedRung, node.presentation.role)
  const rung = CARD_RUNGS[rungName]

  // ---- the ordinal: a number that IS the meaning -----------------------------------------------
  const ordinal = rung.marks && node.ordinal !== null ? node.ordinal : null

  // ---- the name, WHOLE ---------------------------------------------------------------------------
  //
  // THE RUNG DECIDES WHICH TEXT, PER CARD. This is the first clause of the rule: the node's name
  // goes from level 1 to level 2 as
  // it grows. `rung.nameAt` is already the level the name line is at: `label` at the two smallest
  // rungs and `title` from R4 up. So at level 1 the card draws the written label, and at level 2 and
  // above it draws the record's own name.
  //
  // IT USED TO BE DECIDED ONCE FOR THE WHOLE DRAWING AND NEVER MOVED. `plan.identity` answered at
  // every rung, so a card with a written label drew the label at every size and the record's own
  // title at none, and a card without one drew the title at both levels. Either way the name line
  // did not change, and that is the first step a reader looks for.
  //
  // WHAT `identity` STILL DECIDES IS LEVEL 1, AND IT HAS TO BE DECIDED FOR THE DRAWING. Whether
  // `Wave 5` tells this block apart from the one beside it is a fact about the whole picture, so a
  // card cannot pick a short name on its own. `identityFor` in model.ts compares every name against
  // every other and hands the answer down here.
  //
  // WHERE NO LABEL IS WRITTEN THE RECORD'S OWN NAME STANDS IN AT LEVEL 1, and the card says so —
  // `drew` is `title` and `nameFrom` reads `node`, which is what a chat link does when the label it
  // asked for is not written. A box with no word in it is the identity invariant broken.
  //
  // NOTHING IS CUT. `room`, `clipTo` and `NAME_FLOOR` used to sit here and produce `Mole Office d` on
  // five different blocks at once. A rung is a request for a stored form; it is not a budget.
  const identity = plan.identity
  const ownName = { text: node.title, drew: 'title' as Rung, field: NAME_FIELD[node.kind] }
  const atLevelOne =
    identity === null
      ? ownName
      : {
          text: identity.text,
          drew: identity.from === 'label' ? ('label' as Rung) : ('title' as Rung),
          field: identity.field,
        }
  const stored: { text: string; asked: Rung; drew: Rung; field: string } | null =
    rung.nameAt === null ? null : { ...(rung.nameAt === 'label' ? atLevelOne : ownName), asked: rung.nameAt as Rung }
  let name: CardWords | null = null
  if (stored !== null && stored.text.length > 0) {
    name = { text: stored.text, full: stored.text, asked: stored.asked, drew: stored.drew, field: stored.field }
  }
  const shortName = name !== null && name.drew === 'label'

  // ---- the state as a word, where the rung has room for words ----------------------------------
  // BELOW R4 THE STATE IS THE FILL AND THE BORDER. The kind word is gone at every rung: the kind is
  // the outline of the box, and a word repeating the outline is prose the picture already draws.
  const stateWord = node.stateWord ?? node.state
  // THE NAME'S LENGTH HAS NO SAY IN THIS. It used to: a twenty-five-character name at a rung allowing
  // ten left nothing for the state, so `LeafCam 2 overhead camera` drew a name and no state at all.
  const chip: CardChip | null =
    rung.stateWord && node.state !== null && stateWord !== null
      ? { at: 'state', state: node.state, word: stateWord, alarm: node.alarm }
      : null

  // ---- the counts that stand in for lines this drawing does not draw, in words -------------------
  // A `carries` line is held back until a card is pressed, so `carries 7 steps` is the only place on
  // the whole drawing that number appears. Those badges — and only those — earn words.
  const standIns = standInBadges(node)
  const badges: Badge[] = []
  for (const badge of standIns) {
    if (badges.length >= rung.standsIn) break
    badges.push(badge)
  }

  // ---- every other count as a mark: a numeral, an icon, and a word where there is room ----------
  //
  // THE WORD IS CRITERION D20. A numeral beside a square told a reader nothing, so a card that has
  // room for words draws two or three of them beside the numeral, and
  // the whole sentence stays on the mark for the smaller cards that have room for neither.
  //
  // `rung.ownLine` IS WHAT "HAS ROOM" MEANS HERE, and it is not a new judgement: it is the same
  // flag that decides whether the card prints the record's own line. A card printing a sentence has
  // room for three words beside a numeral; a card drawing nothing but shapes has not.
  const marks: CardMarkDrawn[] = []
  const chosen = new Set(badges.map((badge) => badge.key))
  const available: CardMark[] = []
  for (const badge of node.badges) {
    if (chosen.has(badge.key)) continue
    const mark = markOf(badge)
    if (mark !== null) available.push(mark)
  }
  for (const mark of available) {
    if (marks.length >= rung.markCount) break
    marks.push({ ...mark, word: rung.ownLine ? MARK_WORDS[mark.kind] : null })
  }

  // ---- the record's parts, at the three levels written by part ---------------------------------
  //
  // READ THROUGH THE SAME READER THE REPORT PAGE READS. `levelsOf` in model.ts asked `reportAt` in
  // shared/reportrungs.ts for them, once, when the node was built. A second walk over the stored
  // parts here would be this repository's named defect: two readings of one structure, free to
  // disagree about which blocks a part covers, with nothing failing.
  //
  // A CARD IS NOT THE REPORT. It draws the first few parts and counts the rest in `withheld`, which
  // is the bargain every other thing on a card already makes.
  const level = plan.level
  const partsHere = level !== null && isByPartLevel(level) ? (node.levels.parts[level] ?? []) : []
  const parts = partsHere.slice(0, PARTS_ON_A_CARD)

  // ---- the record's own line, whole, at the one rung with room for it --------------------------
  //
  // NEVER BESIDE THE PARTS. Levels 4 to 6 draw the record's parts INSTEAD of its own line: the parts
  // are what those levels are written as, and a card drawing both would be saying the same record
  // twice at two lengths.
  const bodyAnswer = rung.ownLine && parts.length === 0 ? node.words.gist : undefined
  let body: CardWords | null = null
  if (bodyAnswer !== undefined && bodyAnswer.kind === 'text' && bodyAnswer.drew === 'gist' && bodyAnswer.text.length >= NAME_FLOOR) {
    body = {
      text: bodyAnswer.text,
      full: bodyAnswer.text,
      asked: bodyAnswer.asked,
      drew: bodyAnswer.drew,
      field: bodyAnswer.field,
    }
  }

  const facts = factsOnCard(node, rungName).slice(0, rung.facts)
  const attached = node.attached.slice(0, rung.attached)
  const rest = node.attached.slice(attached.length)

  const withheld: Withheld[] = []
  // ONE BADGE THAT WENT UNDRAWN IS ONE THING WITHHELD, not two. A badge can reach the card either as
  // words or as a mark, so counting the two channels separately reported a card as withholding twice
  // what it had.
  const candidates = new Set<string>([...standIns, ...node.badges.filter((badge) => markOf(badge) !== null)].map((badge) => badge.key))
  const countsLeft = candidates.size - badges.length - marks.length
  if (countsLeft > 0) {
    withheld.push({
      what: t('g7b.counts'),
      count: countsLeft,
      where: t('g7b.card.on_this_card_when_it_is_pressed'),
    })
  }
  // AGAINST WHAT THE READING LAYER PRINTS, not against every fact the node holds. `waits on` is
  // never on a card at any rung because it IS the lines, so counting it would promise a reader
  // something that pressing the card is not going to give them.
  const openable = factsOnCard(node, 'R8').length
  if (openable > facts.length) {
    withheld.push({
      what: t('g7b.card.written_facts'),
      count: openable - facts.length,
      where: t('g7b.card.in_the_reading_layer_under_the_drawing'),
    })
  }
  if (rest.length > 0) {
    withheld.push({
      what: t('g7b.card.attached_records'),
      count: rest.length,
      where: t('g7b.card.counted_by_the_marks_above_and_printed'),
    })
  }
  // NOBODY WROTE ONE IS A FACT, AND IT IS COUNTED RATHER THAN LEFT AS A BLANK LINE. A rung with room
  // for the record's own line and no line to draw is not the same as a rung with no room for it.
  if (rung.ownLine && body === null && parts.length === 0) {
    withheld.push({
      what: t('g7b.card.records_with_no_summary_written'),
      count: 1,
      where: t('g7b.card.on_the_record_itself_nobody_has_written'),
    })
  }
  // THE PARTS THIS CARD HAD NO ROOM FOR. A card at level 4, 5 or 6 draws the first few parts of the
  // record and this is the rest of them, counted where every other fold on a card is counted.
  if (partsHere.length > parts.length) {
    withheld.push({
      what: t('g7b.card.parts_of_this_record'),
      count: partsHere.length - parts.length,
      where: t('g7b.card.on_the_record_itself_where_every_part'),
    })
  }

  const chars =
    (ordinal?.length ?? 0) +
    (name?.text.length ?? 0) +
    (chip?.word.length ?? 0) +
    badges.reduce((total, badge) => total + badge.short.length, 0) +
    marks.reduce((total, mark) => total + mark.text.length, 0) +
    (body?.text.length ?? 0) +
    parts.reduce((total, part) => total + part.heading.length + (part.text?.length ?? 0), 0) +
    facts.reduce((total, fact) => total + fact.label.length + shorten(fact.value).text.length, 0) +
    attached.reduce((total, item) => total + item.title.length, 0) +
    (rung.note && node.note !== null ? node.note.length : 0)

  return {
    asked: askedRung,
    rung: rungName,
    chars,
    tier: plan.tier,
    earns: plan.earns,
    says: plan.says,
    ordinal,
    name,
    title: name === null ? null : name.text,
    nameFrom: shortName ? 'shortForm' : 'node',
    level,
    body,
    parts,
    missing: plan.missing,
    chip,
    marks,
    badges,
    facts,
    attached,
    more: rest.length === 0 ? null : { count: rest.length, named: byKind(rest) },
    wall:
      node.wall === null
        ? null
        : {
            at: node.wall.at,
            words: rung.wall === 'mark' ? null : rung.wall === 'sentence' ? node.wall.sentence : WALL_WORDS[node.wall.at],
          },
    note: rung.note ? node.note : null,
    withheld,
  }
}

/**
 * Everything this drawing is not showing at this level, added up across every object.
 *
 * ONE STRIP UNDER THE CANVAS, NOT ONE SENTENCE PER CARD. The per-card version of this was tried: an
 * italic line on every card saying its paragraph had been cut, printed twelve times on the modules
 * drawing. It is said once, about the whole picture, with the exact numbers.
 *
 * IT TAKES THE PLAN AND NOT A DISTANCE, because the objects drawn as a shape are the biggest thing
 * a level withholds and only the plan knows which those are. A drawing that dropped an object's
 * words and did not count them here would be the silent fold this product bans.
 */
export function withheldAcrossCanvas(graph: StructureGraph, plan: CanvasPlan): Withheld[] {
  const total = new Map<string, Withheld>()
  let shapes = 0
  for (const node of graph.nodes) {
    const at = plan.cards.get(node.id)
    if (at === undefined) continue
    if (at.rung === 'R0') shapes += 1
    for (const entry of cardAt(node, at).withheld) {
      const found = total.get(entry.what)
      if (found === undefined) total.set(entry.what, { ...entry })
      else found.count += entry.count
    }
  }
  if (shapes > 0) {
    total.set(t('g7b.card.objects_drawn_as_a_shape_with_no'), {
      what: t('g7b.card.objects_drawn_as_a_shape_with_no'),
      count: shapes,
      // WHY THEY ARE SHAPES AND NOT MISSING. Nothing is removed from the drawing: the box, its
      // outline, its state and its lines are all there. What a distant level takes away is the
      // words, and zooming in gives them back.
      //
      // IT NO LONGER OFFERS A PRESS. At the farthest distance no card carries words at all, so
      // "press one to read its name" was an instruction that does nothing on the one level a reader
      // most needs it. Zooming in is true at every distance.
      where: t('g7b.card.still_on_the_drawing_as_a_box'),
    })
  }
  return [...total.values()].sort((a, b) => b.count - a.count)
}

/**
 * Where a step stands relative to the walls across its pipeline, in as few words as will carry it.
 *
 * The full sentence names the records whose gates put the step here and runs to two lines; on six
 * step cards of one pipeline that is six paragraphs inside a picture, and the picture stops being
 * one. Which side of the wall a step is on is what you scan for, and it is drawn ON the card that
 * is that side. `StepWallMark.sentence` says the whole of it in the reading layer.
 *
 * The third answer is the honest one and it is why these are not two words each: a step on a
 * parallel branch neither leads to the step the wall stands at nor follows from it, and nothing
 * stored says which side of the wall it is on. "not walled" would be a verdict Mole Office does not have.
 */
export const WALL_WORDS: Readonly<Record<'at' | 'behind' | 'unplaced', string>> = {
  get at() { return t('g7b.card.as_far_as_you_may_go') },
  get behind() { return t('g7b.card.behind_the_wall') },
  get unplaced() { return t('g7b.card.nothing_says_which_side_of_the_wall') },
}

// ============================================================================ cutting a fact

/**
 * How much of a written fact a card prints before it stops.
 *
 * A module's `context` is a few sentences by design — it is the reason the module exists, and it is
 * the last thing anybody remembers. Printed whole on a card it made the cards 380px tall, twelve of
 * them stacked to 2,300px, and the whole canvas fitted the screen only at a quarter size where no
 * card could be read at all. That was photographed before this line existed.
 */
export const FACT_CHARS = 130

/** The first sentence, in any script this product holds, and whether there was more after it. */
export function shorten(value: string): { text: string; shortened: boolean } {
  if (value.length <= FACT_CHARS) return { text: value, shortened: false }
  // The full stop of every script that appears in these records, not only the ASCII one. A Chinese
  // sentence ends in `。` and never in `.`, and cutting only on `.` would print a whole paragraph.
  const stop = value.slice(0, FACT_CHARS).search(/[。．.!?！？;；]/)
  if (stop > 20) return { text: value.slice(0, stop + 1), shortened: true }
  return { text: `${value.slice(0, FACT_CHARS).trimEnd()}…`, shortened: true }
}

// ================================================== the three reductions: inclusion, rung, focus

/**
 * WHERE AN OBJECT SITS RELATIVE TO WHAT THE READER POINTED AT.
 *
 * THIS IS THE THIRD REDUCTION AND IT IS THE ONE THE PRODUCT DID BACKWARDS. Measured on the campaign
 * drawing at the closest distance before this pass: the selected card drew 274 characters and the
 * ordinary cards averaged 618. The card the reader had pressed was the SMALLEST kind of card on the
 * drawing, because selection moved it one distance closer and there was nowhere left to go while
 * every other card had just expanded.
 *
 * Rich detail belongs to the object somebody pointed at and to the work next to it. Everything else
 * is context, and context that grows with the subject buries it.
 *
 * THE FOUR ARE DECLARED AS DATA AND THE TYPE IS READ OFF THEM. A walk over every tier is what
 * `canvasSaysAt` needs, and a list written out beside the type is a fifth tier waiting to exist in
 * one of the two and not the other.
 */
export const FOCUS_TIERS = ['selected', 'neighbour', 'ordinary', 'background'] as const
export type FocusTier = (typeof FOCUS_TIERS)[number]

/**
 * WHY AN OBJECT CARRIES WORDS AT A DISTANT LEVEL, in the order the drawing spends its room.
 *
 * THIS IS THE FIRST REDUCTION: fewer objects are drawn WITH WORDS as the reader moves away. Nothing
 * leaves the drawing — every object is still a box with its outline, its state and its lines — but
 * the words go to the objects that earn them, and the strip under the canvas counts the rest.
 *
 * IT IS A RANKED RULE AND NOT A SCORE. A reader can be told it in one sentence each:
 *
 *   `pressed`      the object you pressed. Whatever else is true, you get to read what you pointed at.
 *   `beside`       an object one line away from it. It is the answer to what you just asked.
 *   `frame`        an object that holds others on this drawing — a pipeline box. It is the structure
 *                  the far view is FOR.
 *   `where-work-is` an object whose state is `doing` or `blocked`. Where the work is now.
 *   `frontier`     the first object in reading order that is not done. Where the work goes next.
 *   `stopped`      an object carrying a count of work that began and did not finish.
 *   `end`          a source or a sink of the lines: where the structure starts and where it stops.
 *   `in-order`     everything else, in reading order, while there is room.
 *
 * TWO CANDIDATE RULES WERE MEASURED AND REJECTED, and the measurement is why they are not here.
 * "Draw whatever has something to say" selected 18 of 18 objects on the campaign drawing, because
 * `nobody carries this` is on nearly every step; a rule that selects everything is not a rule.
 * "Draw whatever the attention rule raised" selected 0 of 18, because every alarm level on these
 * structural records is null or faded. That is a fact about the corpus rather than a defect in
 * attention, and the ladder must not lean on it.
 */
export const INCLUSION_ORDER = [
  'pressed',
  'beside',
  'frame',
  'where-work-is',
  'frontier',
  'stopped',
  'end',
  'in-order',
] as const
export type InclusionReason = (typeof INCLUSION_ORDER)[number]

/** What one object was given at one position, and why. */
export interface CardPlan {
  rung: RungName
  tier: FocusTier
  /** Where it ranks against everything else on the drawing. Never null: every object carries words. */
  earns: InclusionReason | null
  /** The position of the detail ladder the whole drawing is at. Null when a rung was asked for directly. */
  says: Rung | null
  /**
   * THIS CARD'S OWN POSITION ON THE LADDER, after its size, its detail tick, any level its reader
   * chose by hand, and focus. Null only when the caller asked `cardAt` for a bare rung.
   *
   * IT IS WHAT THE CARD DRAWS ITS BODY FROM. The rung above says how much furniture there is room
   * for; this says which level the words under the title are read at, and the two answer different
   * questions rather than the same one twice.
   */
  level: Rung | null
  /** Which of the five words this card's room has reached, or null with a bare rung. */
  size: SizeWord | null
  /**
   * HOW MUCH ROOM THIS CARD HAS, as a share of the width its role asks for. Null with a bare rung.
   *
   * IT IS WHAT THE CARD IS DRAWN AT, and `size` above is which word that share has reached. Two
   * facts and not one: the share is continuous because a drag is, and the word is what decides how
   * many levels the card says.
   */
  room: number | null
  /**
   * HOW TALL THIS CARD IS DRAWN, in the layout's own pixels, or null where nobody dragged it.
   *
   * IT IS THE HEIGHT AND NOT A FLOOR UNDER ONE — criteria D39 and D40. It was a floor until
   * 7 September 2026, and a floor let a level's content push the card taller than the reader had
   * asked for: measured on the owner's pipeline, one 20-pixel step of a bottom grip made a card 38.6 pixels
   * taller. What does not fit now runs on below inside the card under a fade. See `CardChoice.height`.
   */
  height: number | null
  /**
   * HOW WIDE A PIPELINE'S BOX IS DRAWN, in the layout's own pixels, or null on anything else.
   *
   * A CARD HAS NO NUMBER HERE. Its width is its role's width times `room` above, worked out once by
   * `widthOf` in Canvas.tsx, and a second number saying the same thing would drift from it. A box
   * has no role width at all — its size is whatever fits its steps — so its own pixels are the only
   * answer there is, and criterion D42 needs them here so the frame follows the pointer without
   * waiting for a layout.
   */
  width: number | null
  /** Whether the size ladder or the reader's own hand decided the level. Null with a bare rung. */
  levelFrom: 'size' | 'byHand' | null
  /** A level asked for by hand that this record has not got, and why, or null. See `CardSaying`. */
  missing: MissingLevel | null
  /**
   * WHAT THIS OBJECT IS CALLED ON THIS DRAWING, decided for the whole drawing at once.
   *
   * Null only when the caller asked `cardAt` for a bare rung and so has no drawing to be unique
   * within — a unit test, or the reading layer printing one node. The canvas always has one.
   */
  identity: NodeIdentity | null
}

/** What the whole canvas was given at one position. One answer for the drawing, worked out once. */
export interface CanvasPlan {
  /** How much this drawing says. One position for every card on it. */
  says: Rung
  cards: ReadonlyMap<string, CardPlan>
  /**
   * HOW MANY OBJECTS CARRY ANY WORDS AT ALL. It is every object on the drawing, at every position,
   * and it is kept as a number rather than deleted because the strip under the canvas prints it and
   * a reader is owed the count that proves it.
   */
  withWords: number
  /** How many are drawn with no name. Zero, at every position, by construction. */
  shapes: number
}

// ================================================== how much a drawing says, which zoom never decides

/**
 * THE THREE-STEP CONTROL OVER A DRAWING IS GONE, AND `CANVAS_SAYS` WENT WITH IT — CRITERION D14.
 *
 * `CANVAS_SAYS` was the three positions that control offered and `SAYS_WORDS` was what each of them
 * was called on screen; `canvasSaysAt` said which of the three a position marked. The control went:
 * pressing it made the picture jump, and its name, detail, was also the name of the tick on a card.
 * Nothing above a drawing sets what its cards say now.
 *
 * WHERE A CARD STARTS INSTEAD: `DRAWING_PLACES[…].opensAt` in model.ts, which is the drawing's own
 * configuration, through `SIZE_A_CARD_STARTS_AT` below.
 */

/**
 * WHICH CARD RUNG EACH LEVEL DRAWS, PER TIER — and every cell of it draws a name.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS INDEXED BY THE CARD'S OWN LEVEL, AND IT USED TO BE INDEXED BY THE DRAWING'S
 * ---------------------------------------------------------------------------------------
 *
 * Every card on a drawing was at the drawing's one position, so the row was the same for all of
 * them and the tier was the only difference. A card now has a level of its own — its size, its
 * detail tick and any level its reader chose by hand — and `levelOfACard` below works it out. This
 * table is read at THAT level, so two cards on one drawing can be on two different rows.
 *
 * ---------------------------------------------------------------------------------------
 * THE TIER IS NOT IN THIS TABLE, BECAUSE A PRESS MAY NOT CHANGE THE SIZE OF A CARD
 * ---------------------------------------------------------------------------------------
 *
 * It used to have a column per tier: the card the reader pressed was given a rung one level up, so
 * it drew more marks, and everything else was pushed down. A card that draws more marks is a taller
 * card, so a press changed the height of every box on the drawing and the layout had to run again —
 * which showed as a flash and a jump: the card grew and the view moved. Criterion D12: a press
 * focuses a card and changes nothing about its size or place.
 *
 * WHAT A PRESS CHANGES NOW: the card is outlined, its own controls appear over it, and the lines it
 * carries are drawn. None of those is in the box ELK placed, so none of them asks for a new layout.
 *
 * ---------------------------------------------------------------------------------------
 * THE ROWS FROM `gist` UP CARRY THE SAME FURNITURE, AND THAT IS NOT THE OLD FLATNESS
 * ---------------------------------------------------------------------------------------
 *
 * It used to say positions 4 and above ADD NOTHING TO A CARD. That is no longer true: a card at
 * levels 4, 5 and 6 draws the record's parts — its headings, and their texts — which `cardAt` reads
 * from the same `reportAt` the report page reads. What these rows decide is the furniture: how many
 * marks, whether the state is a word, how many counts stand in for lines. That does not change with
 * the level, so the cells do not either. What changes with the level is the BODY, and the level
 * decides that directly.
 *
 * R0 AND R1 APPEAR NOWHERE IN IT. They are the two rungs with `nameAt: null`, and a canvas that can
 * reach them is a canvas that can draw an empty box. `tests/graph-no-empty-boxes.test.ts` asserts
 * that over every cell rather than over the cells anybody remembered to check.
 */
export const CARD_RUNG_AT: Readonly<Record<Rung, RungName>> = {
  // R2 IS THE FLOOR THAT STILL DRAWS A NAME.
  label: 'R2',
  title: 'R4',
  // THE THIRD LEVEL IS WHERE THE RECORD'S OWN LINE ARRIVES, and that is what a gist IS on this
  // product's ladder: the useful conclusion, one line. Before the character budget was deleted an
  // ordinary card could not carry one — the name had already spent the rung — so levels 1, 2 and
  // 3 differed by a state word and nothing else, and the row read as a control that did nothing.
  gist: 'R6',
  // LEVELS 4 TO 6 DRAW THE RECORD'S PARTS INSTEAD OF ITS OWN LINE, and `cardAt` decides which of
  // the two from the level. The furniture is a card's furniture at any of them.
  outline: 'R6',
  sketch: 'R6',
  digest: 'R6',
  // A CARD IS NEVER AT `full`: the record itself is the reading layer's job, and `CARD_LEVELS`
  // leaves it out. The row is here because the table is total over the ladder, and it is the row a
  // drawing set to Full on the settings page falls to — see `canvasSaysAt`.
  full: 'R6',
}

// ==================================================== how much room one card has, and what it says

/**
 * HOW MUCH ROOM ONE CARD HAS. FIVE WORDS, AND THEY ARE THE READER'S WORDS AS WELL AS THE KEYS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY FIVE
 * ---------------------------------------------------------------------------------------
 *
 * The owner's rule for what a node says as it grows has three steps before its detail tick and
 * three after it, and they share the same sizes: the title goes from level 1 to level 2, then a
 * level-3 line arrives under it, and with the tick on that same step shows level 4 and the two
 * steps above it show levels 5 and 6. That is 1, 2 and then three body steps: five positions.
 *
 * THE WORDS ARE PLAIN AND THEY ARE WHAT A PERSON READS. `smallest` and `largest` are the ends, so a
 * refusal can name the state it is in — *Already as big as it goes* — without a second table
 * of reader's words that could disagree with this one.
 */
/**
 * WHAT ONE NODE WAS GIVEN, or the drawing's own position when the plan does not name it.
 *
 * A node the plan has never heard of is a node the drawing has just been handed and has not planned
 * for yet — one render, before the memo settles. IT STILL DRAWS ITS NAME: this used to answer `R0`,
 * a box with no word in it, and one render of an empty box is one render of the drawing lying about
 * what it knows. The ordinary rung of the position the drawing is at is the honest answer, and the
 * memo settles on the same one.
 */
export function planFor(plan: CanvasPlan, id: string): CardPlan {
  return (
    plan.cards.get(id) ?? {
      rung: CARD_RUNG_AT[plan.says],
      tier: 'ordinary',
      earns: null,
      says: plan.says,
      // THE LEVEL THE DRAWING STARTS A CARD AT, for the one render before the memo settles. It is
      // the same answer the plan is about to give, worked out from the same table.
      level: plan.says,
      size: SIZE_A_CARD_STARTS_AT[plan.says],
      room: WIDTH_AT_SIZE[SIZE_A_CARD_STARTS_AT[plan.says]],
      height: null,
      width: null,
      levelFrom: 'size',
      missing: null,
      identity: null,
    }
  )
}

export const CARD_SIZES = ['smallest', 'small', 'usual', 'large', 'largest'] as const
export type SizeWord = (typeof CARD_SIZES)[number]

/** Where a size sits, 0 upwards. Used to move one step and to compare two. */
export function sizePosition(size: SizeWord): number {
  return CARD_SIZES.indexOf(size)
}

/**
 * THE SIZE ONE STEP BIGGER OR SMALLER, OR NULL AT EITHER END OF THE FIVE.
 *
 * NULL IS WHAT REFUSES THE PRESS, and it is the same answer for both ends, so the control on a card
 * carries no rule of its own about where the sizes stop.
 */
export function sizeStep(size: SizeWord, by: 1 | -1): SizeWord | null {
  return CARD_SIZES[sizePosition(size) + by] ?? null
}

/** The size at this position, clamped to the ends. Used where a step must not fall off the ladder. */
function sizeAt(position: number): SizeWord {
  return CARD_SIZES[Math.min(CARD_SIZES.length - 1, Math.max(0, position))] as SizeWord
}

/**
 * WHERE A CARD STARTS, FROM THE ONE POSITION THE GRAPH-WIDE CONTROL SETS.
 *
 * This is the whole of what the graph-wide detail control does now: it says which size every card
 * on the drawing opens at, and the card's own controls take it from there. The owner kept that
 * control as a DEFAULT — *A global detail control may remain as a graph-wide default, but it must
 * not be the only implementation of semantic zoom* — and a default is a starting position.
 *
 * LEVELS 4 AND ABOVE START A CARD AT `usual` AND NOT LARGER, because the three levels written by
 * part are behind the card's own detail tick and the graph-wide control does not tick it. A drawing
 * set to level 5 on the settings page therefore opens with its cards at level 3, and `canvasSaysAt`
 * says so rather than marking a step the drawing is not at.
 */
export const SIZE_A_CARD_STARTS_AT: Readonly<Record<Rung, SizeWord>> = {
  label: 'smallest',
  title: 'small',
  gist: 'usual',
  outline: 'usual',
  sketch: 'usual',
  digest: 'usual',
  full: 'usual',
}

/**
 * HOW WIDE A CARD IS DRAWN AT EACH SIZE, as a share of the width its stored role asks for.
 *
 * A SHARE AND NOT A PIXEL COUNT, because the role already sets a width — 224, 288 and 352 for a
 * card, and three narrower numbers for a step — and a second table of pixels beside it would be two
 * places deciding one box. `widthOf` in Canvas.tsx multiplies the two and rounds once.
 */
export const WIDTH_AT_SIZE: Readonly<Record<SizeWord, number>> = {
  smallest: 0.62,
  small: 0.8,
  usual: 1,
  large: 1.3,
  largest: 1.7,
}

/**
 * THE ROOM A CARD HAS IS A NUMBER, AND THE FIVE WORDS ARE THE THRESHOLDS IT CROSSES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A NUMBER AND NOT ONE OF THE FIVE WORDS
 * ---------------------------------------------------------------------------------------
 *
 * A card is enlarged by dragging its edge or corner, the way the box a person types in is, and as it
 * grows it moves from level 1 to level 2 and then to level 3. A drag is continuous, so what it sets
 * has to be continuous, and
 * criterion D13 says what the five words then are: *the size words become the thresholds the width
 * crosses*. So a card holds a share of the width its role asks for — 1 is the ordinary width — and
 * `sizeWordFor` says which word that share has reached.
 *
 * A SHARE AND NOT A PIXEL COUNT, for the reason `WIDTH_AT_SIZE` already gives: a card's role sets
 * its width, three roles set three widths, and a stored pixel count would be a second opinion about
 * one box. The share multiplies whatever the role asks for, so a card dragged half again as wide
 * stays half again as wide whatever the role is.
 */
export const LEAST_ROOM = WIDTH_AT_SIZE.smallest
export const MOST_ROOM = WIDTH_AT_SIZE.largest

/**
 * HOW WIDE EACH ROLE ASKS A BOX TO BE, in the layout's own pixels, at a share of 1.
 *
 * IT LIVES BESIDE `WIDTH_AT_SIZE` BECAUSE THE TWO ARE ONE MULTIPLICATION. `widthOf` in Canvas.tsx
 * multiplies a role's width by the reader's share and rounds once, and the share's own sanity range
 * below is worked out from these numbers — a share is only meaningful as a multiple of one of them.
 * They were in Canvas.tsx, which no test can load, so nothing could check the two halves agreed.
 */
export const CARD_WIDTH: Readonly<Record<NodeRole, number>> = { compact: 224, normal: 288, prominent: 352 }
export const STEP_WIDTH: Readonly<Record<NodeRole, number>> = { compact: 196, normal: 252, prominent: 308 }

/** The widest and narrowest a role asks for, read off the two tables rather than typed again. */
const WIDEST_ROLE = Math.max(...Object.values(CARD_WIDTH), ...Object.values(STEP_WIDTH))
const NARROWEST_ROLE = Math.min(...Object.values(CARD_WIDTH), ...Object.values(STEP_WIDTH))

/**
 * THE SHORTEST AND LONGEST A SIDE OF ANYTHING ON A DRAWING MAY BE DRAGGED TO — CRITERION D39.
 *
 * ONE PAIR OF NUMBERS FOR BOTH AXES OF BOTH A CARD AND A BOX, and that is the point of them. There
 * used to be three ranges: a card's height inside [44, 760], a box's side inside [44, 20000], and
 * both shares inside one cap on the area. Three ranges in two currencies is what made a drag stop
 * in one direction and not another, which is the sticky feel the owner has reported three rounds running.
 *
 * THE FLOOR is about the height of a card drawing a name and one mark row, so a drag cannot leave a
 * box smaller than the smallest thing it could hold, and cannot leave one at nothing at all.
 *
 * THE CEILING is a sanity limit on a stored number and not a design number: a side longer than this
 * was written by something this browser cannot place. The owner's own pipeline's box is 3578 pixels wide,
 * so a ceiling near a card's own size would be a limit on the owner's real drawing rather than a check.
 *
 * NEITHER IS A LEVEL'S SIZE, which is what D39 forbids. Between them the size is exactly what the
 * pointer asked for, and the level is read off the size afterwards.
 */
export const LEAST_SIDE = 44
export const A_SIDE_AT_MOST = 20_000

/** A side a reader dragged something to, held inside those two, in the layout's own pixels — D39. */
export function sideWithin(side: number): number {
  return Math.min(A_SIDE_AT_MOST, Math.max(LEAST_SIDE, Math.round(side)))
}

/**
 * WHAT A STORED SHARE MAY LOOK LIKE — CRITERION D39. IT IS NOT A LIMIT ON A DRAG.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TWO NUMBERS USED TO BE, AND WHY THEY WERE THE DEFECT
 * ---------------------------------------------------------------------------------------
 *
 * They were `MOST_ROOM * MOST_ROOM` and `LEAST_ROOM * LEAST_ROOM` — 2.89 and 0.3844 — and they were
 * applied to a live drag. So a drag stopped when the share reached the square of the largest word's
 * share, whatever the pointer went on asking for. Measured at 1440 on the owner's pipeline on 7 September
 * 2026, at the size the drawing opens at: dragging a card's right edge followed the pointer to
 * within 0.6 pixels for 140 pixels and then held at 209.5 for the remaining 160, ending 148.4
 * pixels short of the ask.
 *
 * The size was to follow the mouse
 * freely and it did not. D39 says it plainly: dragging any edge or corner moves that edge or corner
 * with the pointer, pixel for pixel, at every size.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THEY ARE NOW
 * ---------------------------------------------------------------------------------------
 *
 * A drag is held in PIXELS, by `sideWithin` below, and nothing else holds it at all. These two are
 * only what a share read back out of storage may look like, and they are worked out from the pixel
 * range so the two cannot disagree: the smallest side anything may be, over the widest role, and the
 * largest side anything may be, over the narrowest. A share outside them was written by something
 * this browser cannot place.
 */
export const MOST_ON_ONE_AXIS = A_SIDE_AT_MOST / NARROWEST_ROLE
export const LEAST_ON_ONE_AXIS = LEAST_SIDE / WIDEST_ROLE

/** True when this is a share a card can actually have. Used on a value read back out of storage. */
export function isRoom(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= LEAST_ON_ONE_AXIS && value <= MOST_ON_ONE_AXIS
}

/** The share, held inside what a stored share may look like. Never a limit on a live drag — D39. */
export function roomWithin(room: number): number {
  return Math.min(MOST_ON_ONE_AXIS, Math.max(LEAST_ON_ONE_AXIS, room))
}

/**
 * WHICH OF THE FIVE WORDS A SHARE HAS REACHED, WITH NO HISTORY — CRITERION D40.
 *
 * A word is reached at `THE_SHARE_A_LEVEL_APPEARS_AT` of its own share, not at the whole of it, so
 * a level's content is drawn while the card still has only four fifths of the room that level wants.
 * The fifth that does not fit runs on below inside the card, under the border, with a fade — which
 * is what D40 asks for.
 *
 * A share below the smallest word's appearing share is the smallest word, which is the honest
 * answer to a stored value from somewhere else.
 */
export function sizeWordFor(room: number): SizeWord {
  let reached: SizeWord = CARD_SIZES[0] as SizeWord
  for (const word of CARD_SIZES) if (room > shareALevelAppearsAt(word)) reached = word
  return reached
}

/**
 * WHEN THE CONTENT OF A LEVEL APPEARS, AND WHEN IT IS GIVEN UP — CRITERION D40.
 *
 * ---------------------------------------------------------------------------------------
 * THE EXAMPLE IT STARTED FROM
 * ---------------------------------------------------------------------------------------
 *
 * An example, not a requirement: the area is not limited at all and only what is drawn inside it is
 * controlled, with room left covered or empty; a level's content might change once 80% of it is
 * covered, and the next level come at 120%. The first band built from that example was not what was
 * wanted.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, IN NUMBERS
 * ---------------------------------------------------------------------------------------
 *
 * A word needs an AREA of its own, as a share of the area the card has at its ordinary size: 0.62,
 * 0.8, 1.0, 1.3, 1.7 — the five numbers in `WIDTH_AT_SIZE`, read as areas. Two fractions of that one
 * number are the whole rule:
 *
 *   A LEVEL'S CONTENT APPEARS PAST 0.8 OF THE AREA IT NEEDS: 0.496, 0.64, 0.80, 1.04, 1.36.
 *   A LEVEL IS GIVEN UP BELOW 0.6 OF THE AREA IT NEEDS:      0.372, 0.48, 0.60, 0.78, 1.02.
 *
 * So a level is drawn while the card still has only four fifths of the room that level wants, and
 * the fifth that does not fit runs on below inside the card, under the border, with a fade at the
 * bottom saying there is more. Growing the card reveals the rest without changing what is drawn.
 * That is D40's whole sentence, and it is why the appearing share is below 1 rather than the
 * example's 1.2: at 1.2 a level would always fit with room to spare, nothing would ever overflow,
 * and there would be nothing for the fade to show.
 *
 * WHAT IT TAKES TO HOLD A LEVEL, as a share of the area that revealed it, is 0.6/0.8 — three
 * quarters, at every rung. That is the band that stops the level flickering: a card has to lose a
 * quarter of the area that revealed a level before the level goes.
 *
 * PAST AND NOT AT, WHICH IS D40'S OWN WORD — *when the card's area PASSES a fixed share*. It is not
 * a nicety. `SIZE_A_CARD_STARTS_AT` opens a card at a word's own number, so an opening card sits
 * EXACTLY on the share the word above appears past at one rung of the ladder, and `at` would open
 * every drawing set to level 2 with its cards at level 3. Measured on the owner's pipeline before this was
 * `past`: the box opened at R6 instead of R4 and drew 37 pixels more.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE TWO FUNCTIONS RETURN A SQUARE ROOT
 * ---------------------------------------------------------------------------------------
 *
 * The number they are compared against is `sizeShareOf`, which is the square root of the area share
 * — a card's average side rather than its area, so that the five words keep their meaning as widths
 * on a card nobody has made taller. The rule above is about AREA, so the fraction is taken of the
 * area and the square root is taken of the result. It is the same comparison either way round; the
 * root is here so there is one currency at the comparison instead of two.
 *
 * THE BAND IS A REAL BAND AT EVERY RUNG. A card at word k gives it up below 0.6·W[k] of area and
 * takes the word above at 0.8·W[k+1], and 0.6·W[k] < 0.8·W[k] < 0.8·W[k+1], so the two ends never
 * cross and one pixel of hand movement can never change the word twice.
 *
 * NOTHING ABOUT THE CARD'S SIZE CHANGES AT EITHER NUMBER — criterion D39. The size is the pointer's
 * at every pixel in both directions; these two numbers decide only what is drawn inside it.
 *
 * WHICH WORD A CARD IS AT THEREFORE DEPENDS ON HOW IT GOT THERE, and that is what a band is. The
 * word is stored beside the size — `CardChoice.size` — because it cannot be worked out from the
 * size alone. The two fractions are filed as proposal `t29v9sRzAAFT` with the alternative that was
 * rejected, because the fork is the owner's.
 */
export const THE_SHARE_A_LEVEL_APPEARS_AT = 0.8
export const THE_SHARE_A_LEVEL_IS_LEFT_AT = 0.6

/**
 * The size at which a card takes this word and draws its content, overflow and all — D40.
 *
 * In `sizeShareOf`'s currency, which is the square root of the area share. See the paragraph above
 * on why the root is here. The smallest word is the bottom of the ladder: a card is at it at any
 * size at all, so nothing here can put a card below the ladder.
 */
export function shareALevelAppearsAt(word: SizeWord): number {
  if (sizePosition(word) <= 0) return Number.NEGATIVE_INFINITY
  return Math.sqrt(THE_SHARE_A_LEVEL_APPEARS_AT * WIDTH_AT_SIZE[word])
}

/**
 * The size below which a card at this word gives it up and draws the word below — D40.
 *
 * The smallest word has nothing below it and is never given up, which this says as a size no card
 * can be at.
 */
export function shareALevelIsLeftAt(word: SizeWord): number {
  if (sizePosition(word) <= 0) return Number.NEGATIVE_INFINITY
  return Math.sqrt(THE_SHARE_A_LEVEL_IS_LEFT_AT * WIDTH_AT_SIZE[word])
}

/**
 * WHICH WORD A CARD IS AT NOW, given the area it has and the word it had — CRITERION D40.
 *
 * A CARD NOBODY HAS DRAGGED HAS NO HISTORY, and the honest answer for it is the plain reading of its
 * area: `sizeWordFor`. A band only exists between two readings, and there has only been one.
 *
 * IT IS IDEMPOTENT AND IT WALKS. Called again with the word it just returned and the same share it
 * returns that word, so a caller that reads it twice gets one answer; and a share that has jumped
 * several words — a press, or a stored value from another visit — walks all the way rather than
 * moving one step per call.
 */
export function sizeWordAfter(share: number, had: SizeWord | null): SizeWord {
  if (had === null) return sizeWordFor(share)
  let at = sizePosition(had)
  if (at < 0) return sizeWordFor(share)
  while (at + 1 < CARD_SIZES.length && share > shareALevelAppearsAt(CARD_SIZES[at + 1] as SizeWord)) at += 1
  while (at > 0 && share < shareALevelIsLeftAt(CARD_SIZES[at] as SizeWord)) at -= 1
  return CARD_SIZES[at] as SizeWord
}

/** True when this is one of the five words. Used on a value read back out of storage. */
export function isSizeWord(value: unknown): value is SizeWord {
  return typeof value === 'string' && (CARD_SIZES as readonly string[]).includes(value)
}

/**
 * THE LEVELS A CARD CAN BE AT: the six below the record itself.
 *
 * `full` IS THE RECORD, AND A CARD IS A BOX ON A CANVAS. The reading layer under the drawing prints
 * every record whole, so a card that tried to draw one would be the document the canvas is not.
 * Derived from `RUNGS` rather than typed out, so a seventh position declared in shared/detail.ts
 * arrives here rather than being silently left off.
 */
export const CARD_LEVELS: readonly Rung[] = RUNGS.filter((rung) => rung !== 'full')

/**
 * THE LEVELS A CARD DRAWS UNDER ITS TITLE LINE: the record's own line, then the three written by
 * part.
 *
 * Levels 1 and 2 are the title line itself and draw nothing under it. Everything from level 3 up is
 * a body, and which of them a card is at is what the size ladder and the detail tick decide.
 */
export const CARD_BODY_LEVELS: readonly Rung[] = CARD_LEVELS.filter(
  (rung) => positionOf(rung) >= positionOf('gist'),
)

/** The three levels the detail tick opens: the ones written by part. */
export const CARD_DETAIL_LEVELS: readonly Rung[] = CARD_BODY_LEVELS.filter((rung) => isByPartLevel(rung))

/** What one reader has asked of one card. Every field is a thing they pressed. */
export interface CardChoice {
  /**
   * HOW MUCH ROOM THIS CARD HAS, as a share of the width its role asks for, or null where this
   * reader has not said.
   *
   * NULL IS AN ABSENCE AND NOT A DEFAULT: a card nobody has dragged is at the share the place opens
   * it at, and a card somebody HAS dragged is at exactly the share they dragged it to.
   *
   * IT WAS ONE OF FIVE WORDS UNTIL 6 SEPTEMBER 2026. A drag is continuous, so what it sets has to
   * be — see `sizeWordFor`, which is where the five words became the thresholds it crosses.
   */
  room: number | null
  /**
   * HOW TALL THIS CARD IS, IN THE LAYOUT'S OWN PIXELS, or null where this reader has not said.
   *
   * ---------------------------------------------------------------------------------------
   * CRITERION D21, AND WHY IT IS PIXELS WHERE THE WIDTH IS A SHARE
   * ---------------------------------------------------------------------------------------
   *
   * A card that was dragged grew sideways whichever way it was pulled, and never up or down. A card
   * had no height of its own at all — its
   * height was whatever its words came to — so a corner drag could only ever set the width.
   *
   * THE WIDTH IS A SHARE BECAUSE A ROLE ALREADY SETS ONE: 224, 288 and 352 for a card and three
   * narrower numbers for a step, so a stored pixel count would be a second opinion about a box
   * something else decides. NOTHING SETS A CARD'S HEIGHT. There is no role height, no table of
   * heights and nothing else with an opinion, so a number of pixels here is the only reading of it
   * and cannot disagree with anything.
   *
   * IT IS A FLOOR AND NEVER A CEILING. The card is drawn with this as its smallest height, so a
   * card dragged taller than its words is taller and a card dragged shorter than its words is as
   * tall as its words. Cutting the words to a dragged height would be the identity invariant
   * broken by a drag; what makes a card shorter is the same drag taking its room away, which takes
   * the card down the ladder and leaves it with fewer words to draw.
   */
  height: number | null
  /**
   * HOW MUCH TALLER THE READER HAS MADE THIS CARD THAN ITS WORDS ASK FOR, as a share, or null where
   * they have not touched its height — CRITERION D33.
   *
   * ---------------------------------------------------------------------------------------
   * WHY A SHARE BESIDE THE PIXELS, AND NOT THE PIXELS ON THEIR OWN
   * ---------------------------------------------------------------------------------------
   *
   * The level follows the card's AREA, and an area needs both sides in the same currency. The width
   * is a share already. The height is pixels, and pixels cannot be turned into a share by dividing
   * by anything the card knows, because the number to divide by is the height the card's own words
   * come to — and that grows every time the level does.
   *
   * MEASURED, ON THE FIRST TRY AT DOING IT THAT WAY. Dividing the dragged height by the height the
   * card had before the drag started fed the level back into itself: 30 pixels of corner drag took
   * the CaP planner bridge card from 51 screen pixels tall to 146, because the level had gone up
   * and the words needed the room. That read as the reader having made it 2.4 times taller, the
   * area cap was spent at once, and the card could then not be widened past 272 screen pixels —
   * a smaller cap than the one the owner complained about.
   *
   * So the share is set by the drag and by nothing else: a drag that adds a tenth to the card's
   * height adds a tenth here. Words growing under it change the pixels and leave this alone.
   */
  rise: number | null
  /**
   * HOW WIDE AND HOW TALL THE READER DRAGGED A PIPELINE'S BOX, in the drawing's own pixels, or null
   * where they have not — CRITERION D35.
   *
   * ---------------------------------------------------------------------------------------
   * WHY A BOX IS MEASURED IN PIXELS WHERE A CARD IS MEASURED IN SHARES
   * ---------------------------------------------------------------------------------------
   *
   * A card's width is its role's width times `room`, and the role's width is a real number: 224,
   * 288 or 352. A BOX HAS NO ROLE WIDTH. Its width is whatever ELK needed to fit its steps inside
   * it, which is 3578 pixels on the pipeline this was measured on and a different number on every other pipeline. So
   * a share of it is a share of something that moves, and the two ways of saying the box's width
   * would drift apart the first time a step was added.
   *
   * WHAT THIS IS FOR. It is the smallest box the reader will accept, handed to the layout as the
   * box's minimum size. The layout then lays the steps out inside a box at least that big and
   * routes the lines between them, which is the whole of what D35 asks for: a change of size
   * rearranges the blocks and the lines it touches.
   *
   * `room` AND `rise` ARE STILL WHAT THE BOX SAYS. They decide its reading level exactly as they do
   * for a card, and the same drag moves both — the pixels say how big the box is, the shares say
   * how much it says.
   */
  width: number | null
  /**
   * WHICH OF THE FIVE WORDS THIS CARD HAS SETTLED AT, or null where nobody has dragged it — D38.
   *
   * THE ONLY FIELD HERE THAT IS NOT A PRESS. Everything else on this object is what the reader did;
   * this is where the last reading of it left the card, and it is stored because the rule that
   * reads it depends on which way the card came. A card steps up to a word at that word's own
   * share and gives it up only at the share the word below is reached at — see `sizeWordAfter` —
   * so the same size can be either of two words, and nothing but this says which.
   *
   * IT IS NOT A SECOND OPINION ABOUT THE SIZE. `sizeOf` walks it to whatever the area now demands
   * before anything draws from it, so a value left behind by an older visit, or by a writer that
   * changed the room and forgot this, is corrected rather than believed.
   */
  size: SizeWord | null
  /** Whether this card's detail tick is on, which is what opens levels 4 to 6. */
  detail: boolean
  /** A level this reader chose by hand, which wins over the sizes. Null where they chose none. */
  level: Rung | null
}

/** A card nobody has pressed anything on. Every field is the absence of a press. */
export const NOTHING_PRESSED: CardChoice = { room: null, height: null, rise: null, width: null, size: null, detail: false, level: null }

/**
 * HOW MUCH ROOM THIS CARD ACTUALLY HAS: the size its reader chose, or where the drawing starts it
 * with focus having had its one step.
 *
 * ONE ANSWER, READ BY FOUR THINGS — what the card says, how wide it is drawn, which layout it
 * belongs to, and what its own size control shows and moves. A second opinion anywhere among those
 * is a card drawn at one size and labelled another.
 */
export function roomOf(choice: CardChoice, says: Rung): number {
  return choice.room ?? WIDTH_AT_SIZE[SIZE_A_CARD_STARTS_AT[says]]
}

/**
 * HOW MUCH TALLER THE READER HAS MADE THIS CARD, as a share. 1 where they have not touched it.
 *
 * A stored value outside what one side may reach counts as no change, the same way a stored width
 * share outside its range does: it was written by something this browser cannot place.
 */
export function riseOf(choice: CardChoice): number {
  const rise = choice.rise
  return typeof rise === 'number' && Number.isFinite(rise) && rise >= LEAST_ON_ONE_AXIS && rise <= MOST_ON_ONE_AXIS
    ? rise
    : 1
}

/**
 * THE SIZE A LEVEL IS CHOSEN FROM: THE AREA, NOT THE WIDTH — CRITERION D33.
 *
 * The question was whether the level was tied to the width rather than the area. It was. The level was
 * `sizeWordFor(roomOf(choice))` — the width share and nothing else — so a card pulled twice as tall
 * said exactly what it said before, and a card one hundredth narrower after a long pull down
 * dropped a whole level. Measured at 1440 on the owner's own pipeline: the level changed once, at 60 pixels
 * of a corner drag, and never again over the next 690 pixels of pulling down.
 *
 * IT IS THE SQUARE ROOT OF THE AREA SHARE, so the five thresholds keep their meaning. A card at the
 * ordinary width and the ordinary height is at 1, exactly as before; a card dragged 1.7 times wider
 * and 1.7 times taller is at 1.7, the largest word — where under the old rule the height counted
 * for nothing at all.
 */
export function sizeShareOf(choice: CardChoice, says: Rung): number {
  return Math.sqrt(roomOf(choice, says) * riseOf(choice))
}

/**
 * WHICH OF THE FIVE WORDS THIS CARD IS AT. What the card says is read from this.
 *
 * IT IS THE AREA AND THE WORD THE CARD CAME FROM — criterion D38. A card steps up to a word at that
 * word's own share and gives it up only at the share the word below is reached at, so the area
 * alone cannot answer this and `sizeWordAfter` is where both ends of the band are read.
 */
export function sizeOf(choice: CardChoice, says: Rung): SizeWord {
  return sizeWordAfter(sizeShareOf(choice, says), choice.size)
}

/**
 * THE WIDTH SHARE THAT PUTS THIS CARD AT ONE OF THE FIVE WORDS, at the height it already has.
 *
 * The two buttons on a selected card step by word, and a word is a share of the AREA — so this is
 * the word's own number divided by the height share the card already has, and the product of the
 * two is the area the word asks for. On a card nobody has made taller it is the word's own number,
 * which is exactly what `roomOf` opens a card at, so a press and an opening agree.
 *
 * IT WAS THE WORD'S NUMBER SQUARED UNTIL 7 SEPTEMBER 2026, which put the area at W² rather than W —
 * a press for `small` landed the card at 0.64 of the ordinary area where the drawing opens a small
 * card at 0.8 of it. With the level's thresholds written as fractions of the area, that difference
 * is a whole rung: pressing `small` drew `smallest`.
 */
export function roomForSize(word: SizeWord, rise: number): number {
  return roomWithin(WIDTH_AT_SIZE[word] / (rise <= 0 ? 1 : rise))
}

/** True when this is a side something on a drawing can actually have. Used on a stored value. */
export function isCardHeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= LEAST_SIDE && value <= A_SIDE_AT_MOST
}

/** What a card says at one size: which level, where that came from, and what nobody wrote. */
export interface CardSaying {
  /** The card's own position on the ladder. One of `CARD_LEVELS`. */
  level: Rung
  /** `size` when the sizes decided it, `byHand` when the reader chose the level themselves. */
  from: 'size' | 'byHand'
  /**
   * A LEVEL THE READER CHOSE BY HAND THAT NOBODY WROTE FOR THIS RECORD, or null.
   *
   * It is never set by the sizes. The two cases have two different rules: the automatic zoom SKIPS a
   * level nobody wrote and
   * moves only among the ones that exist; a level chosen by hand that does not exist is shown as
   * not existing. So growing a card never says *level 5 is not written*; asking for level 5 does.
   */
  missing: MissingLevel | null
}

/**
 * A LEVEL A READER ASKED FOR THAT THE RECORD HAS NOT GOT, and which of the three reasons it is.
 *
 * THE REASON TRAVELS WITH THE LEVEL because the card says it in words, and the three sentences are
 * three different pieces of advice: write it, or write more in the record, or nothing can be
 * written here at all. `LevelAbsence` in @shared/detail.ts is where the three are told apart.
 */
export interface MissingLevel {
  level: Rung
  why: LevelAbsence
}

/**
 * FOCUS USED TO BE ONE SIZE STEP AND IT IS NOW NO STEP AT ALL, which is criterion D12.
 *
 * `sizeWithFocus` lived here: the pressed card was drawn one size larger and every other card one
 * size smaller. Every one of those is a different box, so one press asked for a whole new layout,
 * and that showed as a flash and a jump. A card's size is now the reader's own choice and the
 * place's default, and nothing else.
 *
 * WHERE THE SIZE COMES FROM INSTEAD: the reader drags the card's edge (`CardGrips` in CardFace.tsx),
 * which is the rule: bigger on a drag, the way the chat box grows, and not on a press.
 */

/**
 * WHAT ONE CARD SAYS AT ONE SIZE — the owner's ladder, in their order, said once.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE'S CLAUSES, AND WHAT EACH ONE IS HERE
 * ---------------------------------------------------------------------------------------
 *
 * Section 15 of design/messages/ACCEPTANCE.md:
 *
 *   the title goes from level 1 to level 2       `smallest` is level 1, `small` is level 2
 *   then a level-3 line under the title          `usual` is level 3
 *   higher levels need a detail tick             `detail` is what puts the by-part levels on the ladder
 *   the step that showed 3 shows 4               with the tick on, `usual` is level 4
 *   growing again moves through 4 to 6           `large` is level 5, `largest` is level 6
 *   the title rule is unchanged                  levels 3 and up all draw the title at level 2
 *   a level chosen by hand stays                 `byHand` wins, whatever the size is
 *
 * ---------------------------------------------------------------------------------------
 * A LEVEL NOBODY WROTE IS SKIPPED, AND `has` IS WHAT SAYS WHICH THOSE ARE
 * ---------------------------------------------------------------------------------------
 *
 * `has` is the list of positions this record actually has words at — `levelsOf` in model.ts builds
 * it from `rungsFor` and `formsWrittenIn`, which are the two answers this product already has to
 * *what does this record hold*. The ladder below is filtered by it, so a record with no level 5
 * moves straight from 4 to 6 and never draws an empty step.
 *
 * WHERE THE FILTER LEAVES NOTHING, THE CARD DRAWS ITS NAME AND NOTHING UNDER IT. That is the honest
 * answer to a record with no summary and no parts, and it says nothing false: `missing` stays
 * null, because nobody asked for a level by name.
 *
 * EVERY LEVEL IS FILTERED BY `has`, LEVEL 1 AND LEVEL 2 INCLUDED. The rule has no exception in
 * it. Level 1 is the written label and most records have none, so the smallest size skips it and
 * lands on level 2 — and the readout then says Level 2, which is the level the words on the card
 * actually are. It used to say Level 1 while drawing the record's own title, which is a level number
 * the record does not have.
 */
export function whatACardSays(
  choice: CardChoice,
  says: Rung,
  has: readonly Rung[],
  /**
   * WHY THE RECORD HAS NOT GOT EACH LEVEL IT HAS NOT GOT. `levelsOf` in model.ts asks
   * `whyEachLevelIsMissing` once, with the record in hand, and hands the answer down here.
   *
   * EMPTY MEANS NOBODY ASKED, and then a level this record has not got is reported as one nobody
   * wrote — which is the commonest of the three and the one a caller with no record could only be
   * guessing at. A caller that has the record always has this.
   */
  why: Readonly<Partial<Record<Rung, LevelAbsence>>> = {},
): CardSaying {
  const byHand = choice.level
  if (byHand !== null) {
    if (has.includes(byHand)) return { level: byHand, from: 'byHand', missing: null }
    // ASKED FOR BY NAME AND THE RECORD HAS NOT GOT IT. The card still draws its name — every
    // position of this ladder draws a name — and says which level is missing, and why, instead of
    // drawing a lower one.
    return { level: theNameLine(has), from: 'byHand', missing: { level: byHand, why: why[byHand] ?? 'notWritten' } }
  }
  // THE LEVELS THIS SIZE WOULD WALK, THIS ONE FIRST. A size is a position on the ladder, so the
  // level a size shows is the level at that position — and where nobody wrote it, the next one up
  // that somebody did. So the automatic zoom skips a missing level: it is
  // stepped over rather than drawn empty or named while something else is drawn.
  const step = sizePosition(sizeOf(choice, says))
  const body = choice.detail ? CARD_DETAIL_LEVELS : [CARD_BODY_LEVELS[0] as Rung]
  const from = step <= 1 ? 0 : Math.min(step - 2, body.length - 1)
  const wanted: readonly Rung[] = [
    ...(step <= 0 ? ['label' as Rung] : []),
    ...(step <= 1 ? ['title' as Rung] : []),
    ...body.slice(from),
  ]
  const here = wanted.find((rung) => has.includes(rung))
  // NOTHING FROM THIS SIZE UP IS WRITTEN, so the card draws its name line and nothing under it.
  return { level: here ?? theNameLine(has), from: 'size', missing: null }
}

/**
 * THE LEVEL OF THE CARD'S NAME LINE — the one position every card can always be drawn at.
 *
 * Level 2 is the record's own `title` column, which is `NOT NULL`, so this is level 2 on every
 * record that has a title. A record whose title column is blank and whose label somebody wrote is
 * drawn at level 1 instead. Where neither is there the card still draws a name line: `cardAt` puts
 * the record's own name in it and marks which field it read.
 */
function theNameLine(has: readonly Rung[]): Rung {
  if (has.includes('title')) return 'title'
  return has.includes('label') ? 'label' : 'title'
}

/**
 * THE WORDS ON THE LINES ARE ALWAYS DRAWN, AND `lineWordsAt` IS WHY THEY WERE NOT — CRITERION D16.
 *
 * It answered false below level 3, so on a drawing whose cards opened at level 2 — which is every
 * drawing, by `DRAWING_PLACES[…].opensAt` — no line carried a word at all. The opposite was wanted:
 * lines and their labels, such as gate, hard gate and carry, are shown by default. A line's word
 * says what it means, and a picture of unlabelled arrows is the drawing withholding what it knows.
 *
 * WHAT IS STILL HELD BACK is the gate's own explanation — the prose somebody wrote about how far you
 * may go — because it is 240 characters on one line and it is an answer to a question. It opens on a
 * press of the gate's mark, and it is not shown by default. See `LineWordLevel` in Canvas.tsx.
 */


/**
 * THE NAMES OF THE FOUR STATES A READER MOVES ON A DRAWING, in one place.
 *
 * THEY ARE FOUR STATES AND THE OWNER COULD NOT TELL THAT THEY WERE. Problem 5 asked for four
 * distinct concepts again: canvas zoom, card size, semantic detail, and focus or selection. It asked
 * for compact, consistent product words in place of unstable explanatory labels such as
 * `How much each card says`. So each one is a noun a person already owns, written
 * once here and drawn wherever that state has a control — the drawing's own row, and the strip on
 * the card the reader pressed.
 *
 * `DETAIL` IS ONE WORD FOR ONE STATE AT TWO SCOPES, and that is deliberate rather than a collision:
 * the row over the drawing sets where every card starts, and the tick on a card moves that card.
 * Two words for one axis would say they were two axes.
 */
export const DRAWING_WORDS = {
  get says() { return t('g7b.card.detail') },
  get zoom() { return t('g7b.card.zoom') },
  get size() { return t('g7b.card.size') },
  get level() { return t('g7b.card.level') },
  /**
   * THE TWO WAYS OF READING ONE DRAWING — CRITERION D26.
   *
   * They were the two control names until they were changed to Graph and List, because the old two
   * did not say what they meant.
   *
   * THEY ARE HERE BECAUSE TWO PLACES DRAW THEM: the module and pipeline drawings in
   * StructureView.tsx and the plan drawing in PlanGraph.tsx. Both had their own copy of both words,
   * and every sentence on both pages that named a control spelled it again — so a rename meant
   * finding eleven strings and hoping. One declaration, read by every one of them.
   */
  get graph() { return THE_TWO_READINGS.graph },
  get list() { return THE_TWO_READINGS.list },
} as const

/**
 * WHAT A CARD SAYS WHEN A READER ASKED FOR A LEVEL THIS RECORD HAS NOT GOT. THREE SENTENCES.
 *
 * They are three sentences because they are three different pieces of advice, and one of them is
 * the only one a reader can act on:
 *
 *   `notWritten`  somebody can write it. This is the sentence the card always used to say.
 *   `tooShort`    nobody can write it: a level longer than the record would have to say more than
 *                 the record does. Writing it changes nothing, and the write door refuses it.
 *   `noPlace`     this kind of record has no parts, so it has none of the levels written by part.
 *
 * THE CARD SAID THE FIRST ONE IN ALL THREE CASES. A reader told nobody had written a level went and
 * wrote it, and the card still would not draw it.
 */
export function notWrittenHere(missing: MissingLevel): string {
  const level = levelLabel(missing.level)
  if (missing.why === 'tooShort') {
    return t('g7b.card.this_record_is_too_short_for_a', { v1: level.toLowerCase() })
  }
  if (missing.why === 'noPlace') {
    return t('g7b.card.this_kind_of_record_has_no_parts', { v1: level.toLowerCase() })
  }
  return t('g7b.card.is_not_written_for_this_record', { v1: level })
}

/** Why a press on a card's size control would do nothing, in the words of the state it is in. */
export function sizeRefusal(size: SizeWord): string {
  // WHAT THE CAP IS, SAID ON THE CARD — criterion D33. It is one cap on the card's area, the same
  // for its width and its height, and it is where the card is already saying everything it has, so
  // the sentence says that rather than naming a number.
  return size === 'largest'
    ? t('g7b.card.already_as_big_as_it_goes_it')
    : t('g7b.card.already_the_smallest_a_card_goes')
}

/** Why a press on a card's level control would do nothing, named by the level it is already at. */
export function levelRefusal(level: Rung): string {
  return t('g7b.card.already_at_which_is_as_far_as', { v1: levelLabel(level).toLowerCase() })
}

// ============================================================ which layout the positions belong to

/** Everything about one card that changes the box ELK has to place. */
export interface CardShapeForLayout {
  plan: CardPlan
  /** How many people the drawing is drawing on this card. Each one is a row of its own. */
  presence: number
  /** Whether a restriction mark is drawn, which puts a mark row on a card that had none. */
  restricted: boolean
  /**
   * How much room this card has, as a share of the width its role asks for.
   *
   * IT IS THE SHARE AND NOT THE WORD. A drag sets a share, so two cards at the same word can be two
   * different boxes, and a key on the word would leave a card dragged from 1.05 to 1.25 drawn over
   * its neighbour with no new layout asked for.
   */
  room: number | null
}

/**
 * WHICH LAYOUT THE POSITIONS ON SCREEN BELONG TO. Every fact that changes a box's size, and no other.
 *
 * ---------------------------------------------------------------------------------------
 * THE TIER AND THE REASON A CARD EARNS ITS WORDS ARE NOT IN IT, AND THAT IS CRITERION D12
 * ---------------------------------------------------------------------------------------
 *
 * Both used to be. Both change on a press and neither changes a box: the tier is an outline and the
 * card's own controls, drawn over the card rather than in it, and `earns` is an attribute nothing
 * draws. So a press asked for a whole new layout, every card was placed again, and the picture
 * jumped under a reader who had only pointed at something. That is what the owner reported on
 * 6 September 2026, and taking these two out of the key is what stops it.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAULT THIS REPLACES, WHICH WAS KEYED ON THE RUNG ALONE
 * ---------------------------------------------------------------------------------------
 *
 * `Canvas.tsx` used to build this as the drawing's key and the rungs of its cards, and nothing else.
 * A rung is one of nine words and a great many things change a card's height without changing it:
 *
 *   - a card gains a person working on it, which is a row about 17px tall — and nothing about that
 *     is in the rung, so no new layout was asked for and the card grew over its neighbour;
 *   - a card gains a restriction mark, which puts a mark row on a card that had none;
 *   - an identity gets longer and wraps to a second line at the same rung;
 *   - a reader picks a wider size word for one card — 252px to 448px, wave 11's step 6c in its own
 *     words: *changes no rung, asks for no new layout, and is drawn 196px over its neighbour.*
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE WHOLE IDENTITY STRING AND NOT ITS LENGTH
 * ---------------------------------------------------------------------------------------
 *
 * Two names of the same length wrap differently — `Model-to-bench check` and `Airflow map
 * bring-up` are both 20 characters and break in different places. A key on the length is a key that
 * misses half the cases it was written for, and a string comparison of a few hundred characters
 * once per draw costs nothing worth measuring.
 *
 * THE ORDER OF THE CARDS IS PART OF THE KEY. Two drawings holding the same cards in a different
 * order are two different layouts, and joining with a separator rather than sorting is what keeps
 * that true.
 */
export function layoutKeyFor(drawing: string, cards: readonly CardShapeForLayout[]): string {
  const each = cards.map((one) => {
    const plan = one.plan
    return [
      plan.rung,
      // THE LEVEL, WHICH IS THE BODY OF THE CARD. Four of the seven levels share the rung `R6`, so a
      // card moved from level 4 to level 5 by hand draws three longer paragraphs and did not move
      // this key at all. The rung says how much furniture; the level says how many words.
      plan.level ?? '',
      plan.says ?? '',
      one.room === null ? '' : one.room.toFixed(3),
      // HOW TALL THE READER DRAGGED IT. A taller card is a different box, so it is a different
      // layout, exactly as a wider one is. Criterion D21.
      plan.height === null ? '' : String(plan.height),
      String(one.presence),
      one.restricted ? 'r' : '',
      plan.identity?.text ?? '',
    ].join(':')
  })
  return `${drawing}#${each.join('|')}`
}


// ==================================================== the reserved empty mark row, measured and refused

/**
 * THE RESERVED EMPTY MARK ROW IS NOT KEPT, AND THIS IS THE MEASUREMENT THAT DECIDED IT.
 *
 * Round ten wave 11's step 13 asked for a reserved empty mark row — about 17px per card at the
 * middle position — *measured before it is kept*, on the ground that *today every card in the
 * corpus carries no marks*, so cards would jump in height the day one gained a mark.
 *
 * MEASURED ON A COPY OF THE OWNER'S OWN CORPUS, 26 August 2026, by
 * `design/round-ten/scratch/w11-step13-empty-mark-row.mjs` over a `VACUUM INTO` copy:
 *
 *     167 cards, over 12 drawings that have any cards on them, in three workspaces.
 *     ZERO of them draw an empty mark row. Every single card carries at least one mark.
 *
 * THE FIGURE IS THE OPPOSITE OF THE ONE THE STEP ASSUMED, so the change it asks for is not made. A
 * reserved row costs 167 cards about 17px each — roughly 2.8k of vertical space across the corpus —
 * to prevent a jump that cannot happen on any card that exists. If a card ever does draw an empty
 * row, the row is drawn conditionally in `CardFace.tsx` and the height it would reserve is the same
 * 17px, so nothing has been made harder.
 *
 * THIS IS RECORDED RATHER THAN LEFT AS AN ABSENCE. A step nobody built and a step somebody measured
 * and decided against are different facts, and the second one is only a fact if it is written down.
 */
export const CARDS_WITH_AN_EMPTY_MARK_ROW = {
  measuredOn: 'a VACUUM INTO copy of the owner\'s corpus, 26 August 2026',
  drawingsWithCards: 12,
  cards: 167,
  withNoMarkAtAll: 0,
  decision: 'no row is reserved: there is no card in the corpus that would ever draw an empty one',
} as const


// ================================================================ what may not be claimed, on a card

/**
 * WHAT A CARD DRAWS ABOUT WHAT MAY NOT BE CLAIMED FROM THE WORK IT STANDS FOR.
 *
 * Five fields, and four of the five are read straight off `RESTRICTION_MARKS` in
 * `src/shared/restriction.ts`. This file holds no copy of that table and adds no row to any other
 * mark family. Round ten wave 0, collision 9 settled that: joining the restriction marks into the
 * composition family takes the pair walk from 12 marks and 66 pairs to 18 and 153 and turns a
 * shipped acceptance row red, for no reader's benefit.
 *
 * `glyph` IS THE INSIDE OF THE MARK AND `edge` IS ITS BORDER. They are two of the four channels a
 * `StateMark` carries, and they are the two a card has room for. The other two — `form` and
 * `where` — are about a left margin, and this drawing has already spent its cards' leading edge on
 * the kind family and on urgency.
 *
 * SEVERITY IS NEVER A HUE HERE. It is a shape and a word, exactly as it is on a record page. Three
 * severities across seven palettes is twenty-one colours and a contrast census, for a fact two
 * shapes already carry.
 */
export interface CardRestriction {
  /** How many restrictions still stand against this record. Never zero: no mark is drawn at zero. */
  count: number
  /** The worst severity among them. The shape is this one's, and the numeral is all of them. */
  severity: RestrictionSeverity
  /** The inside of the mark, from the table's entry for this severity. */
  glyph: string
  /** The border of the mark, from the table's entry for this severity. */
  edge: string
  /** That entry's word, for the hover and for a reader who asks what the shape means. */
  word: string
  /** That entry's sentence, saying what may and may not be claimed. */
  detail: string
}

/** One restriction as the read hands it back. Only the two fields a card looks at. */
export interface RestrictionOnRecord {
  severity: RestrictionSeverity
  standing: { state: string; resolvedAt?: string | null }
}

/**
 * WHETHER THIS POSITION DRAWS A RESTRICTION MARK AT ALL.
 *
 * IT DECIDES ON THE POSITION AND NOT ON THE RUNG, and that is the whole point of the function
 * existing. A selected card is drawn a rung higher than an ordinary one on the same drawing. Key
 * this on the rung and a blocking restriction appears when the reader presses the card and vanishes
 * when they press elsewhere — a mark that hides when nobody is looking at it.
 *
 * The far position draws no numerals on any card, and a count needs one. What the far position
 * draws instead is who is working here, which is the other half of this row.
 */
export function restrictionMarkDrawnAt(says: Rung): boolean {
  return says !== 'label'
}

/**
 * THE ONE MARK A CARD DRAWS FOR EVERY RESTRICTION REACHING IT: the count of what still stands, at
 * the weight of the worst one present.
 *
 * THE COUNT AND THE SHAPE ANSWER DIFFERENT QUESTIONS AND BOTH ARE NEEDED. Three harmless slots and
 * one that stops final validation is a `4` in the blocking shape. Drawing four separate marks
 * spends a 196px card on one field; drawing the count alone hides the blocking one behind three
 * that do not matter, which is the owner's named fault — *do not make harmless placeholders
 * visually equivalent to production-blocking ones* — reached by arithmetic instead of by colour.
 *
 * A JUDGED RESTRICTION IS ALREADY GONE AND A RESOLVED-UNCHECKED ONE IS NOT. The reader drops a
 * reading entirely once somebody has looked at this record and said the work still stands, so
 * anything still in the list at `resolved-unchecked` is work nobody has re-checked. Resolving a
 * restriction makes nothing valid, and that is the loudest rule the whole feature has. `resolved`
 * readings do come back for `harmless` restrictions, and those stop counting here.
 *
 * NULL FOR A PAIR THE TABLE HAS NO ROW FOR, rather than a fallback shape. `restrictionDrawing`
 * returns null when the severity and the standing name no entry, which means the reader grew a word
 * this table did not; drawing that as the nearest shape would be a blocking restriction wearing a
 * harmless one's mark.
 */
export function restrictionOnCard(
  readings: readonly RestrictionOnRecord[],
  says: Rung,
): CardRestriction | null {
  if (!restrictionMarkDrawnAt(says)) return null
  const standing = readings.filter((one) => one.standing.state !== 'resolved')
  if (standing.length === 0) return null
  let worst = standing[0]!.severity
  for (const one of standing) worst = worstSeverity(worst, one.severity)
  // THE WORD IS THE ACTIVE ONE FOR THE WORST SEVERITY PRESENT, and it is asked for at `active`
  // deliberately. The two resolved rows' words carry a `{date}` and a date belongs to ONE
  // restriction; this mark stands for however many reach the card, so a single day on it would be
  // a fact about one of them presented as a fact about all.
  const drawing = restrictionDrawing(worst, 'active', null)
  if (drawing === null) return null
  return {
    count: standing.length,
    severity: worst,
    glyph: drawing.mark.glyph,
    edge: drawing.mark.edge,
    word: drawing.word,
    detail: drawing.detail,
  }
}


// ============================================================================ planning one canvas

/** What the reader has pointed at, and what is one line away from it. */
export interface CanvasFocus {
  selected: ReadonlySet<string>
  neighbours: ReadonlySet<string>
}

/** Nothing pressed. The ordinary state of a drawing somebody has just opened. */
export const NO_FOCUS: CanvasFocus = { selected: new Set(), neighbours: new Set() }

/**
 * WHAT IS ONE LINE AWAY FROM WHAT THE READER PRESSED.
 *
 * Every line, including the `carries` lines this drawing holds back until something is pressed —
 * because pressing a module is exactly how a reader asks what it carries, and the answer must be
 * the tier that gets the words.
 */
export function neighboursOf(graph: StructureGraph, selected: ReadonlySet<string>): Set<string> {
  const near = new Set<string>()
  if (selected.size === 0) return near
  for (const edge of graph.edges) {
    if (selected.has(edge.from) && !selected.has(edge.to)) near.add(edge.to)
    if (selected.has(edge.to) && !selected.has(edge.from)) near.add(edge.from)
  }
  // A step's own box is beside it in the plainest sense there is: it is drawn around it.
  for (const node of graph.nodes) {
    if (node.parentId === null) continue
    if (selected.has(node.parentId) && !selected.has(node.id)) near.add(node.id)
    if (selected.has(node.id) && node.parentId !== null && !selected.has(node.parentId)) near.add(node.parentId)
  }
  return near
}

/**
 * WHAT THE DRAWING PUTS A BOUNDARY ROUND: a pipeline, drawn as a frame with its steps inside it.
 *
 * ONE ANSWER FOR THE PLAN AND FOR THE RENDERER. `Canvas.tsx` gives a node the group renderer when
 * its kind is `pipeline`, so that is the question asked here too. Working it out from "is anything
 * inside it" instead would be the same fact decided in two places, and the two would disagree the
 * moment a reader folded a frame — a folded pipeline has no children in the graph at all, and it is
 * still the frame.
 *
 * A MODULES DRAWING HAS NO BOUNDARY. Every object on it is a module, drawn as a card. That is why
 * the farthest distance draws no characters at all there, and the acceptance in
 * `design/round-nine/graph-ladder-and-prose-audit.md` section 5.1 says so.
 */
export function isBoundary(node: GraphNode): boolean {
  return node.kind === 'pipeline'
}

/** Why each object earns words, in the ranked order, or null when nothing does. */
function reasonsFor(graph: StructureGraph, focus: CanvasFocus): Map<string, InclusionReason> {
  const frames = new Set(graph.nodes.filter(isBoundary).map((node) => node.id))
  const outgoing = new Set<string>()
  const incoming = new Set<string>()
  for (const edge of graph.edges) {
    if (edge.drawn !== 'always') continue
    outgoing.add(edge.from)
    incoming.add(edge.to)
  }
  // THE FRONTIER IS ONE OBJECT PER DRAWING: the first in reading order that is not done. It is what
  // a reader looks for on a pipeline, and it is the one object a done-count on the frame cannot name.
  let frontier: string | null = null
  for (const node of graph.nodes) {
    if (frames.has(node.id)) continue
    if (node.state === 'done') continue
    frontier = node.id
    break
  }
  const stopped = new Set(
    graph.nodes
      .filter((node) => node.badges.some((badge) => badge.key.endsWith('stopped') && (badge.count ?? 0) > 0))
      .map((node) => node.id),
  )
  const reasons = new Map<string, InclusionReason>()
  for (const node of graph.nodes) {
    const reason: InclusionReason = focus.selected.has(node.id)
      ? 'pressed'
      : focus.neighbours.has(node.id)
        ? 'beside'
        : frames.has(node.id)
          ? 'frame'
          : node.state === 'doing' || node.state === 'blocked'
            ? 'where-work-is'
            : node.id === frontier
              ? 'frontier'
              : stopped.has(node.id)
                ? 'stopped'
                : (outgoing.has(node.id) && !incoming.has(node.id)) || (incoming.has(node.id) && !outgoing.has(node.id))
                  ? 'end'
                  : 'in-order'
    reasons.set(node.id, reason)
  }
  return reasons
}

/**
 * WHAT EVERY OBJECT ON ONE DRAWING IS GIVEN AT ONE POSITION. The one function that decides a rung.
 *
 * IT IS THE ONLY PLACE THE REDUCTIONS MEET, and that is the point of it. A renderer that worked out
 * its own level is how the same node came to state one fact twice, which a photograph found; the
 * rung an object draws at is `(position, focus, stored role)` and there is one function of those
 * three in this tree.
 *
 * ---------------------------------------------------------------------------------------
 * NO OBJECT IS EVER REFUSED ITS NAME HERE, AND THAT IS THE CHANGE
 * ---------------------------------------------------------------------------------------
 *
 * This function used to take a zoom band, ask it how many objects it had ROOM for, and put every
 * object past that number at `R0` — a box with an outline and no word in it. On the campaign
 * drawing at `Fit all` the answer was zero objects, so every card was empty. There is no room
 * arithmetic left: every object is planned, every object draws its identity, and `shapes` comes back
 * zero at every position because nothing on this canvas is a nameless box any more.
 *
 * THE IDENTITY IS DECIDED HERE, ONCE, FOR THE WHOLE DRAWING. `identityFor` compares every name on
 * the picture against every other, so it cannot be asked per card — a card deciding its own name
 * cannot know what the card beside it is called. It runs on the drawn set and there is no cache to
 * go stale, because there is no cache.
 */
export function planCanvas(
  graph: StructureGraph,
  says: Rung,
  focus: CanvasFocus = NO_FOCUS,
  /**
   * WHAT THE READER HAS PRESSED ON EACH CARD, keyed by the node's id on this drawing.
   *
   * EMPTY IS THE ORDINARY CASE and it is not a default standing in for a choice: a card nobody has
   * pressed anything on starts where `SIZE_A_CARD_STARTS_AT` says the graph-wide control starts it,
   * with its detail tick off and no level chosen by hand. `cardhere.ts` is where a reader's presses
   * are kept, and it hands this map in.
   */
  chosen: ReadonlyMap<string, CardChoice> = new Map(),
): CanvasPlan {
  const reasons = reasonsFor(graph, focus)
  const identities = identityFor(graph.nodes)
  const cards = new Map<string, CardPlan>()
  let withWords = 0
  let shapes = 0
  // SOMETHING IS PRESSED, SO EVERYTHING ELSE IS BACKGROUND. `background` was declared and never
  // assigned before this pass, which is why focus changed nothing a reader reads: every card that
  // was neither pressed nor beside the pressed one came back `ordinary`, the same tier a drawing
  // with nothing pressed gives to all of them.
  const anythingPressed = focus.selected.size > 0
  for (const node of graph.nodes) {
    const tier: FocusTier = focus.selected.has(node.id)
      ? 'selected'
      : focus.neighbours.has(node.id)
        ? 'neighbour'
        : anythingPressed
          ? 'background'
          : 'ordinary'
    const choice = chosen.get(node.id) ?? NOTHING_PRESSED
    const saying = whatACardSays(choice, says, node.levels.has, node.levels.why)
    const rung = CARD_RUNG_AT[saying.level]
    if (CARD_RUNGS[rung].nameAt === null) shapes += 1
    else withWords += 1
    cards.set(node.id, {
      rung,
      tier,
      earns: reasons.get(node.id) ?? null,
      says,
      level: saying.level,
      size: sizeOf(choice, says),
      room: roomOf(choice, says),
      // HOW BIG THE READER DRAGGED THIS. Null on anything nobody has dragged, which is every card
      // until somebody does; the width is a pipeline box's own and null on a card. D39 and D42.
      height: choice.height,
      width: choice.width,
      levelFrom: saying.from,
      missing: saying.missing,
      identity: identities.get(node.id) ?? null,
    })
  }
  return { says, cards, withWords, shapes }
}

/**
 * "1 pipeline, 2 tasks" — what a card did not have room for, named rather than counted alone.
 *
 * The plural rule comes from `countPhrase` in model.ts rather than being written again here. Two
 * copies of a plural rule is how "1 links" reaches a screen, which this product has already had to
 * fix once in a server reply.
 */
export function byKind(items: readonly { kind: string }[]): string {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([kind, count]) => countPhrase(count, kind))
    .join(', ')
}

// ============================================================================ how tall the box is

/**
 * How tall the canvas box is: the shape of the DRAWING, between two limits.
 *
 * A FIXED HEIGHT WASTES THE DIFFERENCE. The modules drawing is about three times as wide as it is
 * tall, so fitting it to the width of the page left 400px of empty grey inside a 760px box — on a
 * page whose whole purpose this pass is to make shorter. A drawing that is tall and narrow has the
 * opposite problem and is squeezed.
 *
 * Both limits are stated beside the arithmetic that uses them rather than in the stylesheet,
 * because a number that computes a height and the numbers that bound it must not live in two files.
 */
export const BOX_MIN = 300
export const BOX_MAX = 760
/** The same padding `fitView` is asked for. One number, used by the height and by the fit. */
export const FIT_PADDING = 0.12
/**
 * THE FURTHEST IN A READER MAY ZOOM. One number, and this is it.
 *
 * IT WAS TWO NUMBERS THAT DISAGREED. `layout.ts` declared its own `MAX_ZOOM = 2` and `Canvas.tsx`
 * imported that one, so the canvas stopped at 200 % while the fit above stopped at 160 % and asked
 * for a box sized for a zoom the drawing could exceed. A browser measurement spent an hour on why
 * the zoom bar read 200 % against a ladder measured at 160. `layout.ts` now imports this and
 * re-exports it, so there is one number and everything reads it.
 *
 * 160 IS THE NUMBER BECAUSE THE LADDER WAS MEASURED AGAINST IT. Past this the cards are bigger than
 * the words need, and the closest distance starts at 145, so a reader still reaches every distance.
 */
export const MAX_ZOOM = 1.6

/** Where one node ended up. The subset of `Placement` this arithmetic needs. */
export interface PlacedBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The height the box should have for this drawing, at this width.
 *
 * It measures the bounding box of the TOP-LEVEL nodes only: a step's position is relative to the
 * pipeline box it sits in, so adding a child's offset to the canvas origin would count the same
 * space twice and ask for a box about twice as tall as the drawing.
 *
 * Returns null when there is nothing to measure — no placements, or a width the browser has not
 * settled yet — and the caller then leaves the stylesheet's own height alone rather than setting a
 * guess. A canvas that sized itself from a width of zero would collapse to the minimum and stay
 * there.
 */
export function heightFor(
  graph: StructureGraph,
  placements: ReadonlyMap<string, PlacedBox>,
  availableWidth: number,
): number | null {
  if (availableWidth <= 0) return null
  let contentWidth = 0
  let contentHeight = 0
  for (const node of graph.nodes) {
    if (node.parentId !== null) continue
    const at = placements.get(node.id)
    if (at === undefined) continue
    contentWidth = Math.max(contentWidth, at.x + at.width)
    contentHeight = Math.max(contentHeight, at.y + at.height)
  }
  if (contentWidth <= 0 || contentHeight <= 0) return null
  const usable = availableWidth * (1 - 2 * FIT_PADDING)
  const zoom = Math.min(MAX_ZOOM, usable / contentWidth)
  const wanted = (contentHeight * zoom) / (1 - 2 * FIT_PADDING)
  return Math.round(Math.min(BOX_MAX, Math.max(BOX_MIN, wanted)))
}
