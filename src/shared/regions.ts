// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE TREE OF MEANINGFUL PARTS OF A REPORT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A REGION IS
 * ---------------------------------------------------------------------------------------
 *
 * A region is a meaningful part of a report: a section, a passage, a paragraph, a bullet group, a
 * bullet, a table, a row, a cell, a checklist item, a metric, a figure, a caption, a code block.
 *
 * It is NOT a DOM wrapper. A scroll box, a flex row, a `<strong>` and the `.sb-fit` container are
 * not regions and carry nothing.
 *
 * It is NOT a Block. `Block` is a durable addressable process unit of a pipeline and keeps that
 * meaning entirely. The blocks a report is written in are `SummaryBlock`s, and a region is derived
 * from one — or from a run of characters inside one.
 *
 * It is NOT stored. See `regionsOf`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A report's layout, what a right-click means, and what an annotation points at are today decided
 * by three separate mechanisms that share no structure: a four-track CSS grid chosen from the
 * stored block type, an upward DOM walk over `data-target`, and a target kind plus a character
 * span. Three mechanisms, three answers, free to disagree about what "here" means.
 *
 * This file is the one tree all three are meant to read. `design/round-ten/design/
 * semantic-regions.md` is the design; §4 is this file.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT READS IT TODAY, SAID PLAINLY SO NOBODY OVERSTATES IT
 * ---------------------------------------------------------------------------------------
 *
 * THIS SENTENCE USED TO READ "Nothing on a screen reads this file yet" AND THAT IS NO LONGER TRUE.
 * What reads it now, and what still does not:
 *
 *   · The server's region reader — `TARGET_READERS.region` in src/server/lib/targets.ts — derives
 *     the tree to answer whether a comment's part of a report is still there.
 *   · The report renderer — src/web/components/SummaryBlocks.tsx — puts a region `data-target` on
 *     the elements `carriesTarget` below allows one on.
 *   · The developer overlay — src/web/components/RegionOverlay.tsx — draws the boxes.
 *
 *   · The layout — the same renderer — reads the width each role wants, and writes `widthNeededBy`
 *     onto the markup as `data-needs`. IT NO LONGER DECIDES A WIDTH, and that changed on 28 August
 *     2026. For one day it did: a part holding nothing but sentences was shrunk to one reading line
 *     wide. That left a report drawing its parts at six different widths, so the rule came out and
 *     every part now takes the width the report gives it, with the reading measure as a track
 *     inside it. `data-needs` still says what a part holds and nothing reads it for a width.
 *     Before 27 August the layout read none of this and the stylesheet capped every paragraph at
 *     34rem instead.
 */

import {
  LINK_TYPES,
  type ItemState,
  type LinkType,
  type RecordKind,
  type SummaryBlock,
  type SummaryBlockType,
  type TableRow,
} from './types.ts'
// WHAT A RECORD PAGE IS MADE OF. `recordRegionsOf` at the foot of this file derives one region per
// declared section and nothing here restates which sections a kind has.
import {
  datedWordsIn,
  drawableAsWords,
  holdsDoors,
  holdsDatedWords,
  isWritten,
  LINK_RELATION_PHRASES,
  namesAParticipant,
  namesRecords,
  READING_MATTER_KEY,
  relationSectionsOf,
  SECTIONS_OF,
  titleOfSection,
  SUMMARY_LINE_FIELD,
  SUMMARY_LINE_KEY,
  theGovernsSectionDecides,
  TITLE_LINE_FIELD,
  TITLE_LINE_KEY,
  type SectionSpec,
} from './sections.ts'
// THE TWO SECTIONS WHOSE PANELS READ A SHAPE RATHER THAN A STRING. A short form and a consequence
// are both stored as objects, and the one reader of each is imported rather than written again.
import {
  readStoredParts,
  readStoredShortForms,
  PARTS_KEY,
  joined,
  SHORT_FORM_LEVELS,
  SHORT_FORM_SPECS,
  SHORT_FORMS_FIELD,
  type ShortFormLevel,
} from './zoom.ts'
import { readConsequence } from './work.ts'
// THE ONE READER OF A MESSAGE'S STORED PICTURES, for the regions `recordRegionsOf` cuts from them.
import { picturesOf, quotesOf, targetOfRecord } from './messages.ts'
// THE READER'S WORD FOR A STORED KIND. One table; the throw above puts a sentence on a screen.
import { kindWord, type LinkDirection } from './words.ts'
// THE ENGLISH WORD FOR EACH ROLE, read directly so the server stays English. `wordForRole` says why.
import { en } from './words/en.ts'
// AN ENGLISH READER OF THE WORD LISTS, so `nameOfRegionId` fills its two sentences in English on the
// server and on a page alike. The page names the same parts in its own language in
// src/web/components/agent/context.ts, from the same keys.
import { createI18n } from './i18n.ts'
// WHERE SOMEBODY WAS INSIDE A THING, from the one declaration of the five places. `placeFallsInside`
// at the foot of this file is total over that union, so a sixth place stops the build here rather
// than being answered by a default. A TYPE-ONLY import, and src/shared/targets.ts imports nothing
// from this file, so there is no cycle in either direction.
import type { Place } from './targets.ts'
// WHERE ONE CELL OF A TABLE TYPED INTO PROSE BEGINS AND ENDS. The same reader src/shared/plandoc.ts
// draws with, so a pipe inside maths, code or an escape cannot be read one way here and another way
// on the screen.
import { tableRowCells } from './table-row.ts'

/**
 * A REGION ID IS THE STORED PATH OF THE THING THE REGION DRAWS.
 *
 * It is a string with a declared grammar. It is never generated, never opaque and never stored.
 *
 *     regionId  := path
 *     path      := "data." field ( step )*
 *     step      := "[#" id "]"             a block, a tab or an item named by its own stored id
 *                | "[" index "]"           an array member with no id, counted from 0
 *                | "." field               a named field
 *                | "@" from [ ":" to ]     characters inside the field named by the last step
 *
 * EVERY ARRAY INDEX IS COUNTED FROM ZERO, because every array path this product already writes is:
 * `SummaryBlocks.tsx` writes `rows[r].cells[c]` from array indices, `server/lib/targets.ts` writes
 * `rows[row.index]` where `index = position − 1`, and the stored example at `kinds.ts` is
 * `data.blocks[#b-2].rows[1].cells[1]`.
 *
 * THE `@` STEP HAS TWO FORMS AND THE DIFFERENCE IS NOT DECORATION. A region derived from a run of
 * one stored string is named by where it STARTS (`…text@530`). A region derived from a run that
 * CONTAINS other derived regions is named by the half-open RANGE it covers (`…text@337:1204`).
 * Without that, a bullet group and its first bullet carry one id, and so do a markdown table and
 * its first row — measured, 18 collisions across the eight stored reports. With it, zero.
 */
export type RegionId = string

/**
 * WHAT A PART MEANS. A closed list.
 *
 * A ROLE IS CHOSEN FROM THE CONTENT, NEVER FROM WHICH STORED FIELD THE CONTENT ARRIVED IN. That is
 * the single rule that makes a table typed into prose the same kind of thing as a table stored as
 * a `table` block: today the first has no rows and no cells and the second has both, which is two
 * different amounts of meaning for the same thing on the screen.
 */
export const REGION_ROLES = [
  // the whole thing
  'reportBody',
  // the whole RECORD, which is a bigger thing than a report body: a report body is one section of it
  'recordRoot',
  // structure
  'section',
  'passage',
  'heading',
  'tabs',
  'tab',
  'columns',
  'grid',
  'beside',
  'besidePart',
  // prose
  'paragraph',
  'bulletGroup',
  'bullet',
  'quote',
  'source',
  'callout',
  'finding',
  'path',
  'file',
  // evidence with words
  'table',
  'tableRow',
  'tableCell',
  'keyValue',
  'keyValueItem',
  'checklist',
  'checklistItem',
  'metrics',
  'metric',
  'timeline',
  'timelineItem',
  // evidence without words
  'chart',
  'image',
  'figure',
  'caption',
  'math',
  // machine text
  'code',
  // a stored type this derivation does not know
  'refused',
] as const

export type RegionRole = (typeof REGION_ROLES)[number]

/**
 * HOW MUCH WIDTH A REGION'S CONTENT WANTS.
 *
 *   `read`      the width of a line somebody sits and reads. Prose.
 *   `measured`  as much as its own content measures, up to the whole of its parent's box. A table,
 *               a chart, a picture, a row of figures.
 *   `spanning`  the whole width its parent gave it. Either it lays out other regions inside it, or
 *               it draws to whatever box it is handed and has no width of its own to measure.
 *
 * THIS SAYS WHICH TRACK, NOT HOW MUCH SPACE. How much a part needs is `widthNeededBy`, which asks
 * what the part actually holds; a section of nothing but sentences spans the box it is given and
 * that box is one reading line wide.
 */
export const FITS = ['read', 'measured', 'spanning'] as const
export type Fit = (typeof FITS)[number]

/** The facts a role carries. Five booleans and one width word, and nothing else. */
export interface RoleFacts {
  /** Can a person point at this on its own? False for `figure`, `tab` strips and `reportBody`. */
  meaningful: boolean
  /** Does it hold characters that came out of storage byte for byte? */
  holdsText: boolean
  /** Is it a picture — dropped when the reader asks for words only? */
  isPicture: boolean
  /** Is it prose — the argument rather than the evidence? */
  isProse: boolean
  /** How much width its content wants. */
  fit: Fit
  /**
   * DOES THIS REGION JUST STACK OTHER PARTS OF THE REPORT, ONE UNDER ANOTHER?
   *
   * True means it has no layout of its own: it puts its children in a column and how much width it
   * needs is how much its widest child needs. A section, a passage, a callout and a bullet list are
   * all like this.
   *
   * False means the region lays its own insides out and needs the width it was given whatever its
   * children hold. A `columns` block is the clearest case: two columns of plain sentences still
   * need the whole width, because two 260px columns are not a comparison.
   *
   * `widthNeededBy` below is the only reader of this, and it is what stops a paragraph's region
   * claiming a band it never draws in.
   */
  stacksParts: boolean
}

/**
 * WHAT EVERY ROLE MEANS, AS FACTS AND NOT AS A BRANCH ANYBODY WRITES.
 *
 * It is a total map over `RegionRole` with no index signature, so a role added to the list above
 * stops the typecheck until somebody says what it is. That is the third of the three fixes CLAUDE.md
 * offers for one fact in two places — a failing build — rather than a comment asking for care.
 *
 * `meaningful: false` IS HOW "NOT EVERY WRAPPER IS A THING" IS ENFORCED MECHANICALLY. An element
 * drawn for a region whose role is not meaningful carries no target, so an upward walk passes
 * straight through it. Today the rule "a scroll box is not a thing" exists only as care.
 *
 * `holdsText` IS THE ANCHOR POLICY, and it is not a third field. A region whose role holds text may
 * carry a place that names characters — `words`, `across`, `run`. One whose role does not may carry
 * only `surface` or `quote`. A per-region anchor policy was considered and rejected: nothing in the
 * corpus wants two regions of the same role to anchor differently, and a field that is always equal
 * to a function of the role is the defect this repository names about itself.
 */
export const ROLE_OF: { readonly [K in RegionRole]: RoleFacts } = {
  // THE WHOLE THING. Not meaningful: pointing at the report body is pointing at the record, and the
  // record already has a target of its own. A second name for one thing is the promotion §8.3 of the
  // design says must stop.
  reportBody: { meaningful: false, holdsText: false, isPicture: false, isProse: false, fit: 'spanning', stacksParts: true },

  // THE WHOLE RECORD. The same six facts as `reportBody` above, and for the same reason: pointing at
  // the whole record page is pointing at the record, which already has a target of its own.
  //
  // ITS `fit` AND `stacksParts` ARE NEVER READ, AND THAT IS A FACT ABOUT THE CALL GRAPH RATHER THAN
  // ABOUT THESE TWO WORDS. `widthNeededBy` and `leastNeededBy` below are the width path, and every
  // caller of either hands them a region derived by `regionsOf` — which cannot produce this role.
  // `recordRegionsOf` derives it and nothing hands that tree to a width. The two words are still
  // written honestly, because `RoleFacts` is total and a role that lied here would be worse than a
  // role that is never asked. `tests/one-tree-of-meaningful-parts.test.ts` holds the check.
  recordRoot: { meaningful: false, holdsText: false, isPicture: false, isProse: false, fit: 'spanning', stacksParts: true },

  // STRUCTURE. Everything that lays out other regions spans, by the rule above.
  section: { meaningful: true, holdsText: false, isPicture: false, isProse: false, fit: 'spanning', stacksParts: true },
  passage: { meaningful: true, holdsText: true, isPicture: false, isProse: true, fit: 'spanning', stacksParts: true },
  heading: { meaningful: true, holdsText: true, isPicture: false, isProse: true, fit: 'read', stacksParts: false },
  tabs: { meaningful: true, holdsText: false, isPicture: false, isProse: false, fit: 'spanning', stacksParts: true },
  // A TAB IS NOT MEANINGFUL. What is under an unopened tab is not on the screen: the strip is a
  // control and the blocks under it are the regions.
  tab: { meaningful: false, holdsText: false, isPicture: false, isProse: false, fit: 'spanning', stacksParts: true },
  // COLUMNS AND A GRID PUT THEIR CHILDREN ACROSS THE PAGE, so they need the whole width even when
  // every one of those children is a plain sentence. Two 260px columns are not a comparison.
  columns: { meaningful: true, holdsText: false, isPicture: false, isProse: false, fit: 'spanning', stacksParts: false },
  grid: { meaningful: true, holdsText: false, isPicture: false, isProse: false, fit: 'spanning', stacksParts: false },
  // PARTS OF ONE THING, SEEN TOGETHER — writing beside a table beside a picture. It puts its parts
  // ACROSS the page, so it needs the whole width whatever they hold, for the same reason `columns`
  // and `grid` do.
  beside: { meaningful: true, holdsText: false, isPicture: false, isProse: false, fit: 'spanning', stacksParts: false },
  // ONE PART OF SUCH A COMPOSITION. It stacks its own blocks one under another, so what it needs is
  // what its widest block needs. It IS meaningful, because "the picture beside the text is too
  // narrow" is a sentence somebody has to be able to leave on the picture. It is deliberately not
  // modelled on `tab`: a tab is not meaningful because what is under an unopened one is not on the
  // screen, and a part always is.
  besidePart: { meaningful: true, holdsText: false, isPicture: false, isProse: false, fit: 'spanning', stacksParts: true },

  // PROSE.
  paragraph: { meaningful: true, holdsText: true, isPicture: false, isProse: true, fit: 'read', stacksParts: false },
  bulletGroup: { meaningful: true, holdsText: true, isPicture: false, isProse: true, fit: 'spanning', stacksParts: true },
  bullet: { meaningful: true, holdsText: true, isPicture: false, isProse: true, fit: 'read', stacksParts: false },
  quote: { meaningful: true, holdsText: true, isPicture: false, isProse: true, fit: 'spanning', stacksParts: true },
  source: { meaningful: true, holdsText: true, isPicture: false, isProse: true, fit: 'read', stacksParts: false },
  callout: { meaningful: true, holdsText: true, isPicture: false, isProse: true, fit: 'spanning', stacksParts: true },
  finding: { meaningful: true, holdsText: true, isPicture: false, isProse: true, fit: 'spanning', stacksParts: true },
  // A PATH IS A POINTER AT A FILE: a label and a path, neither of which is a part of the writing on
  // its own, so it produces one region and no children.
  path: { meaningful: true, holdsText: true, isPicture: false, isProse: false, fit: 'read', stacksParts: false },
  // A FILE A REPORT CARRIES. Criterion R3. It is not a picture and not prose: what a reader points
  // at is the file as a whole — its name, its size and its hash, and the code or the address drawn
  // under them. `measured` because a code file wants the width a code box takes, and a thing to
  // fetch is one line of facts rather than a paragraph to read at the measure.
  file: { meaningful: true, holdsText: true, isPicture: false, isProse: false, fit: 'measured', stacksParts: false },

  // EVIDENCE WITH WORDS. A table measures itself; its rows and cells are inside it.
  table: { meaningful: true, holdsText: true, isPicture: false, isProse: false, fit: 'measured', stacksParts: false },
  tableRow: { meaningful: true, holdsText: true, isPicture: false, isProse: false, fit: 'spanning', stacksParts: false },
  tableCell: { meaningful: true, holdsText: true, isPicture: false, isProse: false, fit: 'measured', stacksParts: false },
  // NAMES BESIDE VALUES IS A LAYOUT OF ITS OWN, and the value column takes whatever is left, so
  // there is no width here to measure. It was `measured`, which asked the browser for a width this
  // content does not have.
  keyValue: { meaningful: true, holdsText: true, isPicture: false, isProse: false, fit: 'spanning', stacksParts: false },
  keyValueItem: { meaningful: true, holdsText: true, isPicture: false, isProse: false, fit: 'read', stacksParts: false },
  checklist: { meaningful: true, holdsText: true, isPicture: false, isProse: false, fit: 'spanning', stacksParts: true },
  checklistItem: { meaningful: true, holdsText: true, isPicture: false, isProse: false, fit: 'read', stacksParts: false },
  // A ROW OF FIGURES FILLS WHAT IT IS GIVEN AND WRAPS. Its cards have no one width between them, so
  // asking the browser to measure it returns a number nobody chose. It was `measured` too.
  metrics: { meaningful: true, holdsText: true, isPicture: false, isProse: false, fit: 'spanning', stacksParts: false },
  metric: { meaningful: true, holdsText: true, isPicture: false, isProse: false, fit: 'measured', stacksParts: false },
  timeline: { meaningful: true, holdsText: true, isPicture: false, isProse: false, fit: 'spanning', stacksParts: false },
  timelineItem: { meaningful: true, holdsText: true, isPicture: false, isProse: false, fit: 'spanning', stacksParts: true },

  // EVIDENCE WITHOUT WORDS.
  // A CHART MEASURES ITS OWN BOX AND DRAWS TO IT, so it has no content width of its own to be
  // measured by. `measured` here would have collapsed it to the reading measure.
  chart: { meaningful: true, holdsText: false, isPicture: true, isProse: false, fit: 'spanning', stacksParts: false },
  image: { meaningful: true, holdsText: false, isPicture: true, isProse: false, fit: 'measured', stacksParts: false },
  // A FIGURE IS THE PICTURE AND ITS CAPTION TOGETHER. Pointing at it means pointing at one or the
  // other, and both of those are regions, so the wrapper is not meaningful.
  figure: { meaningful: false, holdsText: false, isPicture: true, isProse: false, fit: 'measured', stacksParts: false },
  caption: { meaningful: true, holdsText: true, isPicture: false, isProse: true, fit: 'read', stacksParts: false },
  math: { meaningful: true, holdsText: false, isPicture: true, isProse: false, fit: 'measured', stacksParts: false },

  // MACHINE TEXT. Never reflowed, so it measures itself.
  code: { meaningful: true, holdsText: true, isPicture: false, isProse: false, fit: 'measured', stacksParts: false },

  // A STORED TYPE THIS DERIVATION DOES NOT KNOW. It is drawn, it is pointable, and it says out loud
  // that nothing here knows what it means — which is the fifth invariant rather than a guess at a
  // role. `regionsOf` cannot produce one from the twenty declared types; it exists for a record
  // written by a newer version of the product than the one reading it.
  refused: { meaningful: true, holdsText: false, isPicture: false, isProse: false, fit: 'spanning', stacksParts: false },
}

/**
 * WHAT A PERSON CALLS A PART WITH THIS ROLE, IN ENGLISH, which is what the server writes.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORDS ARE IN THE WORD LISTS, NOT HERE
 * ---------------------------------------------------------------------------------------
 *
 * `ROLE_OF` above answers machine questions — may this be pointed at, does it hold characters, how
 * much width does it want — and every one of its answers changes what the product DOES. This one
 * changes only what a sentence READS, so its words are in src/shared/words/en.ts and zh.ts, under
 * `pointWord.role.<role>`, one list for the server and the page (problem M_Hy9q3iqcW9). The page
 * reads them through `t()` in the page language; this function reads the English list directly, so
 * the server's sentences stay English whatever language a page in the same process is drawn in.
 *
 * The lists cannot import this file for the role list: this file loads src/shared/sections.ts,
 * which reads words while it loads, before the lists exist. So the key is spelled from the role
 * here, and its TYPE is what keeps it total.
 *
 * TOTAL, WITH NO DEFAULT. Indexing `en` by `pointWord.role.${RegionRole}` is a type error while any
 * role in `REGION_ROLES` has no entry, so a new role stops the build until somebody says what to
 * call one, and zh.ts must hold every key en.ts holds. A default here would put the stored role
 * word — `bulletGroup`, `keyValueItem` — straight onto a screen.
 */
export function wordForRole(role: RegionRole): string {
  return en[`pointWord.role.${role}`]
}

/**
 * WHAT ONE PART OF A RECORD IS CALLED, IN THE WORDS A READER WOULD USE. No article; the caller adds
 * one, because a caller writing *the* and a caller writing *a* are both right in their own sentence.
 *
 * A SHORT FORM IS NAMED BY ITS LENGTH AND NOT BY ITS ROLE, and that is the one exception in here.
 * The six authored short forms are all derived with the role `paragraph`, so the role alone would
 * make a comment on the gist read exactly like a comment on the fourth paragraph of the body — the
 * defect this function exists to end, one level down. `shortFormRegionId` is the one writer of
 * those ids and it is what is compared against, so nothing here spells one by hand.
 */
export function wordForRegion(region: Region): string {
  const level = shortFormLevelOfRegion(region.id)
  return level === null ? wordForRole(region.role) : SHORT_FORM_SPECS[level].noun
}

/**
 * WHICH STORED SHORT FORM THIS REGION IS, or null when it is not one of them.
 *
 * `shortFormRegionId` is the one writer of those ids and it is what is compared against, so nothing
 * anywhere spells one by hand. Three callers ask this question now — what a part is called, what a
 * projection stands for, and whether a press landed on a projection at all — and asking it three
 * ways is how three answers about one region get onto one page.
 */
export function shortFormLevelOfRegion(regionId: string): ShortFormLevel | null {
  return SHORT_FORM_LEVELS.find((one) => shortFormRegionId(one) === regionId) ?? null
}

/**
 * THE KEY OF THE DECLARED SECTION THIS REGION IS, or null when the region is not a section at all.
 *
 * IT READS THE PATH WITH `parseRegionId` AND NEVER WITH A STRING TEST, so there is still one reader
 * of the grammar in this product. `section.subject of` has a space in it and `section.summary` has
 * no punctuation; both are one name step under the root `section`, which is what this asks for.
 *
 * A HEADED BLOCK IS NOT A DECLARED SECTION even though both carry the role `section`. Its id is
 * `data.blocks[#b-…]`, under the root `data`, so it comes back null here and is named by its role —
 * which is the honest difference between *the section* and *the section "Sources and history"*.
 */
export function declaredSectionKeyOf(regionId: string): string | null {
  const read = parseRegionId(regionId).read
  if (read === undefined || read.root !== 'section' || read.at !== null || read.steps.length !== 1) return null
  const step = read.steps[0]
  if (step === undefined || step.form !== 'name') return null
  return step.name
}

/**
 * WHAT ONE PART OF A RECORD IS CALLED IN A SENTENCE A READER READS. THE ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REPLACES, MEASURED THROUGH THE RUNNING API ON 1 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * Two surfaces named the place a comment was left on and they named it in two different ways.
 * `leftOn` in src/server/lib/annotations.ts said the KIND of part — nine places, six distinguishable
 * sentences. `TargetText.about` in src/server/lib/targets.ts, which is what the REVIEW PANE draws,
 * said `the part <id> of …`, and the pane strips ids for a reader — so a paragraph, a table, a
 * headed block, three different declared sections and two stored short forms, EIGHT different
 * places, all read:
 *
 *   the part of the report "…"
 *
 * character for character. One fact worked out in two places, and the weaker of the two was on the
 * surface their review flow uses. Both call this now.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE ANSWERS, IN THE ORDER THEY ARE ASKED
 * ---------------------------------------------------------------------------------------
 *
 *   a stored short form   its length's own noun — *the gist*, *the label*. `wordForRegion` says
 *                         why the role alone will not do: all six are derived as paragraphs.
 *   a declared section    *the section "What is still open around this"*, with the title read off
 *                         `SectionSpec.title`, which is the one place a section's name is written
 *                         and is what the panel on the record page draws its heading from. Three
 *                         sections of one record cannot read alike, which is the whole point.
 *   anything else         its role's word, from `wordForRole` — *paragraph*, *table*, *section*.
 *
 * A RELATION LIST FALLS TO THE KEY, AND THE KEY IS THE PHRASE. `section.subject of` is not declared
 * by any kind — it exists because somebody wrote a link — so `titleOfSection` answers null and the
 * key itself is what a reader sees those rows under. Nothing is invented.
 *
 * NO ARTICLE. The caller writes *the* or *a* in its own sentence, exactly as `wordForRegion` leaves
 * it, so this can sit in both.
 */
export function nameOfRegion(region: Region, kind: RecordKind): string {
  return nameOfRegionId(region.id, kind) ?? wordForRegion(region)
}

/**
 * WHAT A PART IS CALLED WHEN ALL ANYBODY HAS IS ITS ID, or null because the id does not say.
 *
 * Two of the three answers above are read off the id alone: a declared section carries its key and
 * a stored short form carries its length. The third — a paragraph, a table, a row — is a fact about
 * the derived region and cannot be read from a string, so it comes back null here and `nameOfRegion`
 * answers it from the region.
 *
 * THIS EXISTS FOR THE COMPOSER'S CHIP, which has a region id and a record id and no region tree: a
 * declared section is drawn by a panel of the record page and is not in the body tree the page
 * derives. Splitting the question this way is what stops the chip growing a second opinion about
 * what a part is called — it asks this, and then it asks `wordForRegion`, which are the two halves
 * of `nameOfRegion` and not a copy of either.
 *
 * A NULL `kind` IS "NOBODY HAS SAID YET" AND NOT A DEFAULT. A section's title is declared per record
 * kind, so with no kind there is no title to read and the honest answer is that this cannot say.
 */
export function nameOfRegionId(regionId: string, kind: RecordKind | null): string | null {
  const named = whatARegionIdNames(regionId, kind)
  if (named === null) return null
  switch (named.is) {
    case 'shortForm':
      return SHORT_FORM_SPECS[named.level].noun
    case 'section':
      return inEnglish.t('pointWords.section', { title: named.title })
    case 'links':
      return inEnglish.t('pointWords.linksReadAs', { phrase: named.phrase })
  }
}

/** The word lists read in English, whatever language a page in this process is drawn in. */
const inEnglish = createI18n('en')

/**
 * WHAT A REGION ID ALONE SAYS A PART IS, as facts rather than words, or null because it does not say.
 *
 * `nameOfRegionId` above turns this into the English the server writes. The right-click box on a
 * page turns the same answer into the page language (problem _n8ae-YG6qmU). Both read this one
 * function, so the two cannot disagree about which kind of part an id names.
 *
 *   shortForm   a stored short form, by its length.
 *   section     a section the kind declares, with that kind and its English title from
 *               `SectionSpec.title`.
 *   links       a list of links, with the phrase the rows are drawn under and the one link type
 *               and direction that phrase is the word of. A page draws that type's word in its own
 *               language; the English phrase is what the id stores.
 */
export type WhatARegionIdNames =
  | { is: 'shortForm'; level: ShortFormLevel }
  | { is: 'section'; kind: RecordKind; key: string; title: string }
  | { is: 'links'; phrase: string; type: LinkType; direction: LinkDirection }

export function whatARegionIdNames(regionId: string, kind: RecordKind | null): WhatARegionIdNames | null {
  const level = shortFormLevelOfRegion(regionId)
  if (level !== null) return { is: 'shortForm', level }
  const key = declaredSectionKeyOf(regionId)
  if (key === null) return null
  if (kind === null) return null
  const title = titleOfSection(kind, key)
  if (title !== null) return { is: 'section', kind, key, title }
  // A RELATION LIST IS NOT A SECTION WITH A TITLE, AND SAYING SO PUT A STORED KEY IN A READER'S
  // QUOTATION MARKS. `titleOfSection` answers for the sections a KIND declares; a relation section
  // exists because somebody wrote a link, so it answered null and the line used to fall back on the
  // key — drawing *the section “about”* over rows that have no heading called *about* and no
  // heading at all. `LinkRows` in src/web/components/LinkPanel.tsx says it in its own words: *"The
  // relation is written on the group with `nameAttributes` because there is no heading here to
  // point at."* Swept over LINK_TYPES that was thirty more lowercase phrases in title quotes.
  //
  // WHAT A READER REALLY SEES IS THE PHRASE, over the rows, drawn by `rd-link-verb` on the rail.
  // So the phrase is quoted as a phrase and nothing is called a title. `LINK_RELATION_PHRASES` is
  // derived from `LINK_TYPES`, so a fourteenth link type reads this way without anybody editing
  // this line.
  if (LINK_RELATION_PHRASES.has(key)) {
    const link = theLinkThatReadsAs(key)
    return { is: 'links', phrase: key, type: link.type, direction: link.direction }
  }
  // A SECTION KEY THIS KIND DOES NOT DECLARE AND NO LINK READS AS. Nothing here knows what it is
  // called, so nothing here says: `nameOfRegion` falls to the role's own word, *section*, which is
  // true of it whatever its name was. Inventing a title out of the key is what this arm replaced.
  return null
}

/**
 * THE LINK TYPE AND DIRECTION WHOSE WORD IS THIS PHRASE.
 *
 * Every phrase in `LINK_RELATION_PHRASES` is one type's forward or reverse word. A symmetric type
 * has the same word both ways, and then the forward direction is the answer. A phrase in that set
 * that no type reads as is a broken assumption, so it throws rather than naming some other link.
 */
function theLinkThatReadsAs(phrase: string): { type: LinkType; direction: LinkDirection } {
  for (const [type, def] of Object.entries(LINK_TYPES) as [LinkType, (typeof LINK_TYPES)[LinkType]][]) {
    if (def.forward === phrase) return { type, direction: 'forward' }
    if (def.reverse === phrase) return { type, direction: 'reverse' }
  }
  throw new Error(`No link type reads as "${phrase}", although LINK_RELATION_PHRASES holds it.`)
}

// ============================================================================ which part, not what kind

/**
 * How many characters of a part's own words a name quotes before they are cut at a space.
 *
 * Sixty is the number the composer's chip already cuts a quotation at — `SHOWN_CHARACTERS` in
 * src/web/components/agent/context.ts — so a part quoted in a sentence and the same part quoted on
 * a chip come out the same length rather than two lengths nobody chose.
 */
const QUOTED_IN_A_NAME = 60

/**
 * THE WORDS ONE PART OF A RECORD HOLDS, in the order a reader meets them, or '' when it holds none.
 *
 * A HEADING IS THE NAME ITS AUTHOR GAVE THE PART, so a part that has one is quoted by it and not by
 * the paragraph underneath. `headingNamesItsHolder` is the one function that says whether a heading
 * region is the name of the part holding it; without that arm a headed block came out quoted as its
 * heading and its first sentence run together — *What you can now do that you could not The report
 * now draws…* — which reads as neither.
 *
 * A PART THAT HOLDS NO CHARACTERS OF ITS OWN ANSWERS WITH ITS CHILDREN'S, which is the same rule
 * `whatARegionHolds` in src/server/lib/targets.ts follows for the same reason: a section holds
 * paragraphs and has no run of its own, and answering '' would say it holds no words, which is
 * false. A row of a table answers with its cells, in the order they are written.
 */
export function wordsOfRegion(region: Region): string {
  const heading = region.children.find((one) => headingNamesItsHolder(one))
  if (heading !== undefined && heading.text.trim() !== '') return heading.text.trim()
  if (region.text.trim() !== '') return region.text.trim()
  const held: string[] = []
  for (const child of region.children) {
    const words = wordsOfRegion(child)
    if (words !== '') held.push(words)
  }
  return held.join(' ')
}

/** A part's words, on one line, cut at a space with an ellipsis when they are too long to quote. */
function quotable(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  if (one.length <= QUOTED_IN_A_NAME) return one
  const cut = one.slice(0, QUOTED_IN_A_NAME)
  const space = cut.lastIndexOf(' ')
  return `${(space === -1 ? cut : cut.slice(0, space)).trimEnd()}…`
}

/**
 * `4th`, `21st`. Written by the rule and not by a table, because the rule is three lines and a
 * table of ordinals would run out at whatever number somebody stopped typing at.
 */
function ordinal(n: number): string {
  const inTens = n % 100
  const last = n % 10
  const suffix =
    inTens >= 11 && inTens <= 13 ? 'th' : last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'
  return `${String(n)}${suffix}`
}

/**
 * WHICH PART OF A RECORD EACH ONE IS, IN THE READER'S WORDS. THE ONE PLACE, AND NO TWO ALIKE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REPLACES, MEASURED ON THE OWNER'S OWN REPORT ON 1 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * `nameOfRegion` above answers what KIND of part something is. That is the right answer for a
 * sentence that carries the part's id beside it, and it is the wrong one for a sentence that has to
 * say WHICH part — so a projection standing for two headed blocks of report `OOOt4Kouc5dT` read, on
 * the screen:
 *
 *   Stands for the section and the section.
 *
 * Over all 488 parts of that report the kind alone takes 27 distinct values, 260 of them the
 * identical *cell of a table*. A reader cannot get from such a name to a part. This function gives
 * those same 488 parts 488 different names.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A PART IS NAMED, IN THE ORDER IT IS TRIED
 * ---------------------------------------------------------------------------------------
 *
 *   1. its kind, from `nameOfRegion` — which is where a declared section's title and a stored short
 *      form's noun come from. Nothing here re-answers that question;
 *   2. and the words it holds, quoted: *paragraph “The short answer is that…”*;
 *   3. and, only where that still does not tell it from another part of the same record, where it
 *      sits: *cell of a table “3” in the row of a table “…”*, walking up one holder at a time and
 *      no further than it has to;
 *   4. and, for parts that hold no words at all and share one holder — the seven figures of a row
 *      of figures — its position: *4th figure*.
 *
 * NO ARTICLE, exactly as `nameOfRegion` leaves it, so a caller writes *the* or *a* in its own
 * sentence. The holder inside a name carries one, because it is inside this sentence and not the
 * caller's.
 *
 * IT IS ASKED OF THE WHOLE RECORD AT ONCE, and that is not an optimisation. Whether a name tells
 * one part from another is a question about the record, not about the part, so a function handed
 * one region could not answer it — it would either quote everything, which is noise, or quote
 * nothing, which is the defect above.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO WHOLES ARE NAMED BY THE RECORD'S TITLE, WHICH IS WHY `title` IS ASKED FOR
 * ---------------------------------------------------------------------------------------
 *
 * `data` IS the record and `data.blocks` IS the body of its report, so the words underneath them
 * are the record's whole content and not a name for it. Quoting those words the way a paragraph's
 * are quoted put a record's own prose inside a reader's title marks. Measured through the running
 * API on 2 September 2026, on 754 of the 759 records stored, the *Shorter forms* panel and the
 * landing sentence of *View original* both read:
 *
 *   the record “The short answer How to read the words below What you can…”
 *
 * on a record titled *Round ten: what was built, what was not, and what is waiting on you*. That is
 * a quotation presented as a name, and it is not the name. The record HAS one, and these two are
 * the only parts of it whose name is the record's own — every other part is named by the words it
 * holds, which is what tells one paragraph from another.
 *
 * A NULL TITLE IS "NOBODY HANDED THE RECORD'S OWN WORDS" AND IT IS NOT A DEFAULT, exactly as a null
 * `kind` is on `nameOfRegionId` above. A caller with a tree and no record — a panel drawing one
 * module's curated blocks — has no title to give, and the two wholes are then named by what they
 * are, *the record* and *the body of the report*, with nothing in quotation marks. What must never
 * happen again is the words underneath standing in for a name nobody handed over.
 */
/**
 * IS THIS PART THE RECORD ITSELF, RATHER THAN SOMETHING INSIDE IT? THE ONE ANSWER.
 *
 * There are exactly two: `data`, which IS the record, and `data.blocks`, which IS the body of its
 * report. `namesOfParts` asks this to name those two by the record's own title rather than by the
 * words underneath them, which are the record's whole content.
 *
 * `whereAPartIs` below reads the two roles itself, because it says something DIFFERENT about each
 * — *the whole of the report “…”* and *the body of the report “…”* — and a boolean cannot carry
 * that. What the two may not do is disagree about WHICH parts these are, and
 * `tests/a-projection-names-which-part.test.ts` puts every role through both and holds them to it.
 */
function isAWholeOfTheRecord(role: RegionRole): boolean {
  return role === 'recordRoot' || role === 'reportBody'
}

/**
 * THE FOUR WORDINGS A NAME IS BUILT FROM. The server's are English and are the default; a page hands
 * in its own, read from the word lists in the page language (src/web/components/agent/context.ts).
 * One namer, two readings: which part is named, and how far up it has to go to be told apart, is
 * worked out here once whichever words it is said in.
 */
export interface PartWords {
  /** What one part is called on its own: its kind, a declared section's title, a length's noun. */
  nameOf: (region: Region, kind: RecordKind) => string
  /** That name with the part's own words quoted after it. */
  withWords: (name: string, words: string) => string
  /** A part named inside the part that holds it. */
  inside: (part: string, holder: string) => string
  /** The nth of several parts that read alike, counted from one. */
  nth: (n: number, name: string) => string
}

/** The server's words, in English. */
export const ENGLISH_PART_WORDS: PartWords = {
  nameOf: nameOfRegion,
  withWords: (name, words) => `${name} “${words}”`,
  inside: (part, holder) => `${part} in the ${holder}`,
  nth: (n, name) => `${ordinal(n)} ${name}`,
}

export function namesOfParts(
  root: Region,
  kind: RecordKind,
  title: string | null,
  words: PartWords = ENGLISH_PART_WORDS,
): ReadonlyMap<RegionId, string> {
  /** Every part, in the order a reader meets them, and what holds each. */
  const all: Region[] = []
  const heldBy = new Map<RegionId, Region>()
  const walk = (one: Region): void => {
    all.push(one)
    for (const child of one.children) {
      heldBy.set(child.id, one)
      walk(child)
    }
  }
  walk(root)

  /**
   * What one part is called on its own: its kind, and the words it holds.
   *
   * A PART THAT ALREADY CARRIES A NAME SOMEBODY WROTE IS NOT ALSO QUOTED. A declared section is
   * named by its title and a stored short form by its length's noun — both come out of
   * `nameOfRegion` — and quoting the text underneath as well gave *section “The report” “The short
   * answer How to read the words below…”*, which is one part wearing two names.
   *
   * AND THE TWO WHOLES CARRY THE RECORD'S OWN NAME, for the reason in the header: the words under
   * them are the record's whole content, so quoting those quoted a record's prose as its title. A
   * title nobody handed over, and a record whose title column is blank, leave the quotation off
   * altogether rather than falling back on the words underneath.
   */
  const alone = new Map<RegionId, string>()
  for (const one of all) {
    const named = declaredSectionKeyOf(one.id) !== null || shortFormLevelOfRegion(one.id) !== null
    const quoted = isAWholeOfTheRecord(one.role) ? (title ?? '').trim() : named ? '' : quotable(wordsOfRegion(one))
    alone.set(one.id, quoted === '' ? words.nameOf(one, kind) : words.withWords(words.nameOf(one, kind), quoted))
  }

  /** That, then its holder, then its holder's holder: as much of the name as anybody has to read. */
  const upwards = (one: Region): string[] => {
    const chain: string[] = []
    let at: Region | undefined = one
    while (at !== undefined) {
      chain.push(alone.get(at.id) ?? '')
      at = heldBy.get(at.id)
    }
    return chain
  }
  const chains = new Map<RegionId, string[]>(all.map((one) => [one.id, upwards(one)]))
  const said = (id: RegionId, deep: number): string => {
    const [first = '', ...holders] = (chains.get(id) ?? []).slice(0, deep)
    return holders.reduce((part, holder) => words.inside(part, holder), first)
  }

  /**
   * SAY AS LITTLE AS TELLS THEM APART. Every part starts as its own name alone; any name two parts
   * share grows by one holder, and they are asked again. It stops when nothing moved, which is
   * either because every name is now distinct or because the parts sharing one have run out of
   * holders — and those are the ones step 4 numbers.
   */
  const deep = new Map<RegionId, number>(all.map((one) => [one.id, 1]))
  for (;;) {
    const sharing = new Map<string, Region[]>()
    for (const one of all) {
      const name = said(one.id, deep.get(one.id) ?? 1)
      const together = sharing.get(name)
      if (together === undefined) sharing.set(name, [one])
      else together.push(one)
    }
    let moved = false
    for (const [, together] of sharing) {
      if (together.length < 2) continue
      // NAMING THE HOLDER ONLY HELPS WHEN THE HOLDERS DIFFER. Seven figures of one row of figures
      // share every holder they have, so walking up added the same 450 characters to all seven and
      // left them still reading alike. They are numbered below instead.
      const next = together.map((one) => said(one.id, (deep.get(one.id) ?? 1) + 1))
      if (new Set(next).size < 2) continue
      for (const one of together) {
        const at = deep.get(one.id) ?? 1
        if (at >= (chains.get(one.id) ?? []).length) continue
        deep.set(one.id, at + 1)
        moved = true
      }
    }
    if (!moved) break
  }

  const names = new Map<RegionId, string>()
  const stillSharing = new Map<string, Region[]>()
  for (const one of all) {
    const name = said(one.id, deep.get(one.id) ?? 1)
    names.set(one.id, name)
    const together = stillSharing.get(name)
    if (together === undefined) stillSharing.set(name, [one])
    else together.push(one)
  }
  // A part with no words of its own, sharing a holder with others exactly like it, has nothing left
  // to be told apart by except where it comes. Counted from one, in the order a reader meets them.
  for (const [name, together] of stillSharing) {
    if (together.length < 2) continue
    together.forEach((one, at) => names.set(one.id, words.nth(at + 1, name)))
  }
  return names
}

/**
 * WHERE ONE PART OF A RECORD IS, IN ONE SENTENCE A READER READS. THE ONE ASSEMBLY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REPLACES, MEASURED IN A BROWSER ON 2 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * Two surfaces put this sentence together and they put it together differently. The RECORD PAGE
 * (`leftOn` in src/server/lib/annotations.ts) wrote *the table in the report “Round eight”* and the
 * REVIEW PANE (`whatARegionHolds` in src/server/lib/targets.ts) wrote *the table of the report
 * "Round eight"* — a different preposition and a different pair of quotation marks around one fact.
 * Only the middle fragment, what the part is called, was shared. Both call this now.
 *
 * THE PANE'S HALF ALSO PUT THE STORED KIND ON THE SCREEN. It spelled the holder `the ${record.kind}`
 * — the word in the database — so a `stopping_point` read *the stopping_point*. `kindWord` is the
 * one table that turns a stored kind into words and the caller passes what it says.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO WHOLES ABSORB THE HOLDER, BECAUSE OTHERWISE THEY SAY IT TWICE
 * ---------------------------------------------------------------------------------------
 *
 * `data` IS the record and `data.blocks` IS the body of its report. Naming them like any other part
 * gave, on the owner's own report, in their own review pane:
 *
 *   the record of the report "Round ten: …"
 *   the body of the report of the report "Round ten: …"
 *
 * Neither is English, and the first is not even true twice over: the part named and the thing it is
 * said to be inside are the same object. So those two are said as what they are — *the whole of the
 * report “…”* and *the body of the report “…”* — and the holder is said once.
 *
 * A WHOLE CARRIES NO REGION ID INTO THE SENTENCE, and that is deliberate rather than an omission.
 * There are exactly two of them and the sentence names which; and `withoutIds` in the browser takes
 * a sentence's ids out by removing the exact strings, so the id `data` — four letters a reader's own
 * title may hold — would be cut out of the title beside it. See the note in that function.
 */
export interface PartInASentence {
  /**
   * What the part is called: `namesOfParts` where the record still holds it, or the target
   * declaration's own noun where it does not. Nothing here re-answers that question.
   */
  name: string
  /**
   * The part's role, which is what says whether it is one of the two wholes, or null when the
   * record no longer holds it and there is no role to read.
   */
  role: RegionRole | null
  /** The region's id, on a surface that carries ids for Developer detail; null where it must not. */
  regionId: string | null
}

/** The record a part is in, in the words every other screen names it with. */
export interface HolderInASentence {
  /** The kind, in the reader's word. `kindWord` is where that word comes from. */
  word: string
  title: string
  /** The record's id, on a surface that carries ids; null where it must not. */
  recordId: string | null
}

export function whereAPartIs(part: PartInASentence, holder: HolderInASentence): string {
  const said = `the ${holder.word} “${holder.title}”${holder.recordId === null ? '' : `, ${holder.recordId}`}`
  if (part.role === 'recordRoot') return `the whole of ${said}`
  if (part.role === 'reportBody') return `the body of ${said}`
  return `the ${part.name}${part.regionId === null ? '' : ` ${part.regionId}`} in ${said}`
}

/**
 * ONE MEANINGFUL PART OF A REPORT.
 *
 * `children` is the tree; `parentId` is the same fact read upwards, and both are here because both
 * walks happen — the renderer goes down and the targeting walk goes up.
 */
export interface Region {
  /** Derived. The stored path of what this region draws, with a character offset where needed. */
  id: RegionId
  /** The id of the region that holds this one. Null for the report body. */
  parentId: RegionId | null
  /** What this region MEANS. */
  role: RegionRole
  /** How much width its content wants. Always `ROLE_OF[role].fit`; see `fitOf`. */
  fit: Fit
  /** The stored field this region's characters live in, when it holds text. Null otherwise. */
  field: string | null
  /** The half-open character range inside `field` this region covers. Null when `field` is null. */
  range: { from: number; to: number } | null
  /**
   * The characters this region covers — the slice of `field` at `range`, or '' when `field` is
   * null. CUT ONCE, by the pass that made the range, and never recut anywhere else. Two later
   * readers need these characters — whether an edit moved a comment, and whether a stored place
   * falls inside a region — and both read this rather than reaching for the record again.
   */
  text: string
  /**
   * IS THIS REGION A BLOCK ITS AUTHOR ADDRESSED TO THE OWNER?
   *
   * True on the region derived from a block carrying `forOwner: true`, and false everywhere else.
   * The field on the block is `BlockCommon.forOwner` in `src/shared/types.ts`, which says why it is
   * called that and what marking a block does.
   *
   * A PROJECTION OF THE REPORT READS THIS TO DECIDE WHAT TO KEEP. A marked block is promoted at
   * every level of semantic zoom including the lowest,
   * so the thing that chooses what a level draws has to be able to see the mark from a region. That
   * is what this fact is for. It is a fact about ONE REGION and therefore not on `RoleFacts` above,
   * which says what a ROLE means and is the same answer for every region sharing a role.
   *
   * IT DOES NOT RUN DOWN THE TREE. A paragraph inside a marked `text` block, or a block inside a
   * marked `section`, is false here. The mark is a statement its author made about one block, and
   * copying it onto everything underneath would make "which blocks did the author mark" unanswerable
   * from the tree. A reader that wants everything under a marked region already has `children`.
   */
  forOwner: boolean
  /**
   * THE IDS OF THE REPORT'S BLOCKS THIS REGION STANDS FOR, or null because it stands for itself.
   *
   * Only a region derived from a part of the by-part summary has these. A part is a short form of
   * several blocks, so pointing at the part points, through it, at those blocks — which is what
   * criterion M16 asks a comment written below Full to carry. The ids are the ones the part itself
   * stores in `StoredPart.covers`, copied and not worked out again.
   *
   * NULL IS NOT AN EMPTY LIST. Null means this region is not a part and covers nothing but its own
   * characters; an empty list would be a part that covers no block, which the write door refuses.
   */
  covers: readonly string[] | null
  /**
   * HOW THE WORK THIS REGION DESCRIBES WAS GOING, IN ITS AUTHOR'S OWN WORD, OR NULL.
   *
   * One of `todo`, `doing`, `done`, `failed`, `blocked` on the region derived from a `finding`
   * block, a checklist item or a timeline item — the three stored things that carry a state — and
   * null everywhere else.
   *
   * NULL MEANS NOBODY SAID, AND IT IS NOT `todo`. A finding whose author wrote no state has not
   * been declared unfinished and has not been declared done. Invariant 5 of USER.md is the reason
   * this is a null rather than a default: a guess here would put a paragraph into a projection of
   * the report on the strength of a state nobody wrote.
   *
   * A PROJECTION OF THE REPORT READS THIS TO KEEP UNFINISHED WORK. Important
   * unfinished work survives at the low reading lengths, so the thing that chooses what a length
   * draws has to be able to see, from a region, that its author had not finished it.
   *
   * IT DOES NOT RUN DOWN THE TREE, for the same reason `forOwner` does not: a paragraph of a
   * finding's evidence is not itself a piece of work with a state.
   */
  state: ItemState | null
  /**
   * WAS THIS PART OF THE PAGE DECLARED, RATHER THAN CUT OUT OF SOMEBODY'S WRITING?
   *
   * True on a section region and false on every other region. A section is a place a record page
   * HAS — *Summary*, *What happens if this is left alone*, *Sources and history* — declared in
   * src/shared/sections.ts, drawn by a panel, and named by a reader who is asked what they are
   * looking at. A paragraph is not declared: it exists because somebody wrote those characters.
   *
   * IT IS WHAT LETS AN EMPTY SECTION STILL BE POINTED AT. `carriesTarget` below refuses a target to
   * a region holding no characters and no children, because an empty table cell is not a thing a
   * person can mean. A section with nothing written in it yet is different: the heading is on the
   * screen, a reader can point at it, and "nobody has written this" is what they would be
   * commenting on.
   *
   * IT IS NOT A SECOND SPELLING OF `role === 'section'`, AND THAT IS THE POINT OF ITS BEING A
   * BOOLEAN. A `section` block inside a report also carries the role `section`, and it is a run of
   * somebody's writing rather than a declared place on the page — so it is `declared: false` and it
   * has to hold something to be pointable, exactly as it did before this field existed.
   */
  declared: boolean
  /** The regions inside this one, in reading order. */
  children: readonly Region[]
}

// ---------------------------------------------------------------------------------------
// THE GRAMMAR OF A REGION ID, READ IN ONE PLACE
// ---------------------------------------------------------------------------------------

/**
 * WHAT A REGION ID IS MADE OF.
 *
 * A region id is a ROOT WORD, then steps, then at most one character count:
 *
 *     data                                    the whole record page
 *     data.blocks                             the report body
 *     data.blocks[#b-5]                       one stored block, by its own id
 *     data.blocks[#b-5].text                  one stored string inside it
 *     data.blocks[#b-5].text@412              the paragraph starting at character 412 of it
 *     data.blocks[#b-5].text@337:1204         the bullet group covering characters 337 to 1204
 *     data.parts[0]                           the first entry of a stored list
 *     section.summary                         a declared section of the record page
 *
 * THERE ARE TWO ROOT WORDS AND THREE STEP FORMS AND THAT IS THE WHOLE LANGUAGE. `section` was added
 * on 30 August 2026 and it added no step form: it is a root word followed by an ordinary name step,
 * spelled and separated exactly as `data.blocks` is, which is why every reader that finds one id
 * inside another by looking for the separator kept working unchanged.
 *
 * WHY IT IS WRITTEN DOWN HERE RATHER THAN IN THE FOUR PLACES THAT USED TO READ IT. Before this,
 * `stabilityOf` scanned back from the end for a step opener, `identityOf` and `offsetOf` each
 * looked for the last `@`, and `src/server/lib/layout.ts` decided containment by "same string, or
 * starts with it and then a dot or a bracket" — twice, once in `isUnder` and once in `boxOf`. Four
 * hand-written readings of one grammar, free to disagree the moment the grammar gained a word. This
 * repository's recurring defect is exactly that, and it had already produced it here: the renderer
 * and this file once carried separate width maps that disagreed about nine block types.
 *
 * So `parseRegionId` below is the only thing that reads the shape of an id, `spellRegionId` is the
 * only thing that writes one, and `stabilityOf`, `identityOf`, `offsetOf` and `isInsideRegionId`
 * are four views of the one answer it gives.
 */
export type RegionRoot = 'data' | 'section'

/**
 * The root words, as data, so a third one cannot be added to the type without being added here.
 * `Record<RegionRoot, true>` has no index signature, so widening the union stops the build.
 */
const REGION_ROOTS: Record<RegionRoot, true> = { data: true, section: true }

/** One step of a region id. */
export type RegionStep =
  /** `.text` — a named field of whatever the step before it reached. */
  | { readonly form: 'name'; readonly name: string }
  /** `[#b-5]` — one entry of a list, by the id the entry carries. Survives reordering. */
  | { readonly form: 'key'; readonly key: string }
  /** `[2]` — one entry of a list, by where it sits. An insert above it moves it. */
  | { readonly form: 'index'; readonly index: number }

/**
 * THE CHARACTER COUNT AT THE END OF AN ID, when it has one.
 *
 * `@412` names where a run of writing STARTS and has no end: it is a paragraph, a bullet, a row.
 * `@337:1204` names the half-open run a container COVERS, and a container is named by its range
 * because its first child would otherwise carry the same id. So `to` being null is not a missing
 * value — it is the difference between the two forms, and `closeRanges` above is what turns one
 * into the other.
 */
export interface RegionSpan {
  readonly from: number
  readonly to: number | null
}

/** A region id read back into its parts. */
export interface ReadRegionId {
  readonly root: RegionRoot
  readonly steps: readonly RegionStep[]
  /** The character count, or null when the id names a thing rather than a place in a string. */
  readonly at: RegionSpan | null
  /** The id with the character count taken off. See `identityOf`. */
  readonly identity: RegionId
  /** Whether the last step names a thing or a position. See `stabilityOf`. */
  readonly stability: Stability
}

/**
 * WHY ONE ID COULD NOT BE READ, IN WORDS AND WITH THE STEP NAMED.
 *
 * IT IS RETURNED AND NOT THROWN, and that is the point of it. The server refuses a malformed id
 * with this sentence and a 400; the browser has no reason to fall over because somebody typed one.
 * A thrown error would have made the caller choose between crashing and swallowing, and swallowing
 * is how "Mole Office cannot read that name" became "that part is not there", which is a different
 * claim and a false one.
 */
export interface RegionIdProblem {
  /** The id as it was given, so the sentence can quote it. */
  readonly id: string
  /** The step that is wrong, written out exactly as it appears. */
  readonly step: string
  /** Where that step begins in the id, counted in characters from zero. */
  readonly from: number
  /** What is wrong with it, in plain words, ready to be read by a person. */
  readonly why: string
}

/** Either the id read, or the reason it could not be. Exactly one of the two is set. */
export type RegionIdRead =
  | { readonly read: ReadRegionId; readonly problem?: undefined }
  | { readonly read?: undefined; readonly problem: RegionIdProblem }

/** Where the next step of an id begins, from `at`. */
function stepEnd(id: string, at: number): number {
  let next = at
  while (next < id.length && id[next] !== '.' && id[next] !== '[' && id[next] !== '@') next += 1
  return next
}

/**
 * READ ONE REGION ID, or say which step of it cannot be read.
 *
 * THE ONLY READER OF THE SHAPE OF AN ID IN THIS PRODUCT. Everything that used to work one out for
 * itself now asks this.
 *
 * IT IS STRICT ON PURPOSE ABOUT `section`. A section is a root word and exactly one name — there is
 * nothing inside a section that is named by extending the section's own id, because the regions
 * under a section are the record's own fields and they are named `data.…`. So `section.summary.text`
 * is refused rather than parsed into something nothing derives. If somebody later derives a region
 * whose id extends a section's, they have to widen this, which is the whole point of there being
 * one of it.
 */
export function parseRegionId(id: string): RegionIdRead {
  const wrong = (from: number, step: string, why: string): RegionIdRead => ({ problem: { id, step, from, why } })
  if (id === '') return wrong(0, '', 'it is empty, and an empty name points at nothing')

  const rootEnd = stepEnd(id, 0)
  const word = id.slice(0, rootEnd)
  if (!Object.prototype.hasOwnProperty.call(REGION_ROOTS, word)) {
    return wrong(
      0,
      word,
      `a part of a report is named from "data" or from "section", and this one starts with "${word}"`,
    )
  }
  const root = word as RegionRoot

  const steps: RegionStep[] = []
  let at: RegionSpan | null = null
  let cursor = rootEnd
  while (cursor < id.length) {
    const start = cursor
    const ch = id[start]

    if (ch === '.') {
      cursor = stepEnd(id, start + 1)
      const name = id.slice(start + 1, cursor)
      if (name === '') {
        return wrong(start, '.', 'a dot is followed by the name of a field, and this one is followed by nothing')
      }
      steps.push({ form: 'name', name })
      continue
    }

    if (ch === '[') {
      // A CLOSING BRACKET IS THE FIRST ONE FOUND, because nothing that builds an id escapes one:
      // `blockRegions` writes `[#${block.id}]` and `columnPath` writes `[${n}]`. Measured over the
      // 2,485 ids the corpus derives on 30 August 2026, no entry id holds a `]`.
      const close = id.indexOf(']', start)
      if (close === -1) return wrong(start, id.slice(start), 'a "[" is closed by a "]" and this one never is')
      const inside = id.slice(start + 1, close)
      cursor = close + 1
      if (inside.startsWith('#')) {
        const key = inside.slice(1)
        if (key === '') return wrong(start, '[#]', '"[#…]" names one entry by the id it carries, and no id is written here')
        steps.push({ form: 'key', key })
        continue
      }
      if (!/^\d+$/.test(inside)) {
        return wrong(
          start,
          `[${inside}]`,
          'a bracket holds either "#" and the id an entry carries, or its position counted from zero',
        )
      }
      steps.push({ form: 'index', index: Number(inside) })
      continue
    }

    // A CHARACTER THAT OPENS NO STEP. A `]` is followed by the start of another step or by the end
    // of the id, and `data.blocks[0]x` is neither. Said before the `@` arm below, because without
    // it that arm would read the `x` as an empty character count and blame an `@` that is not
    // there — a refusal naming the wrong thing is only a little better than no refusal.
    if (ch !== '@') {
      return wrong(start, id.slice(start), 'a step starts with ".", with "[" or with "@", and this one starts with none of them')
    }

    // `@` — HOW FAR INTO A STORED STRING THE WRITING STARTS, AND HOW FAR IT RUNS. It is the last
    // thing in an id and it runs to the end, so everything after the `@` is read here and the loop
    // stops. A second `@` is therefore not a second step to be refused separately: it lands inside
    // this one's number and is named there, which is why there is no "counted twice" arm.
    const count = id.slice(start + 1)
    if (count === '') return wrong(start, '@', '"@" says which character the writing starts at, and no number follows it')
    const colon = count.indexOf(':')
    const fromText = colon === -1 ? count : count.slice(0, colon)
    const toText = colon === -1 ? null : count.slice(colon + 1)
    if (!/^\d+$/.test(fromText)) {
      return wrong(start, `@${count}`, `after "@" comes a character count, and "${fromText}" is not one`)
    }
    if (toText !== null && !/^\d+$/.test(toText)) {
      return wrong(start, `@${count}`, `after ":" comes the character the writing runs to, and "${toText}" is not one`)
    }
    const from = Number(fromText)
    const to = toText === null ? null : Number(toText)
    if (to !== null && to < from) {
      return wrong(start, `@${count}`, `a run of writing cannot end at ${String(to)} and start at ${String(from)}`)
    }
    at = { from, to }
    cursor = id.length
  }

  if (root === 'section') {
    const only = steps[0]
    if (only === undefined) {
      return wrong(0, 'section', '"section" on its own names no section; a section is "section." and the section\'s key')
    }
    if (only.form !== 'name') {
      return wrong(rootEnd, id.slice(rootEnd), 'a section is named by a key after a dot, not by an entry of a list')
    }
    if (steps.length > 1) {
      return wrong(
        rootEnd,
        id.slice(rootEnd),
        `a section is "section." and one key; what is inside "${only.name}" is named from "data", not from the section`,
      )
    }
    if (at !== null) {
      return wrong(0, id, 'a section has no writing of its own to count characters in; the writing inside it is named from "data"')
    }
  }

  const last = steps[steps.length - 1]
  return {
    read: {
      root,
      steps,
      at,
      identity: spellRegionId({ root, steps, at: null }),
      stability: at !== null || last?.form === 'index' ? 'position' : 'identity',
    },
  }
}

/**
 * WRITE ONE REGION ID BACK OUT. The only place the punctuation of the grammar is spelled.
 *
 * `spellRegionId(parseRegionId(id).read) === id` for every one of the 2,485 ids the corpus derives,
 * and the test that says so is what makes "one grammar, one place" a measurement rather than a
 * claim: if the reader and the writer ever came apart, that round trip would break.
 */
export function spellRegionId(read: { root: RegionRoot; steps: readonly RegionStep[]; at: RegionSpan | null }): RegionId {
  let out: string = read.root
  for (const step of read.steps) {
    switch (step.form) {
      case 'name':
        out += `.${step.name}`
        break
      case 'key':
        out += `[#${step.key}]`
        break
      case 'index':
        out += `[${String(step.index)}]`
        break
      default: {
        // A FOURTH STEP FORM STOPS THE BUILD HERE rather than being written out as nothing.
        const unhandled: never = step
        void unhandled
      }
    }
  }
  const at = read.at
  if (at !== null) out += at.to === null ? `@${String(at.from)}` : `@${String(at.from)}:${String(at.to)}`
  return out
}

/**
 * WHETHER ONE REGION ID NAMES A PLACE INSIDE ANOTHER, or the same place.
 *
 * THE THIRD AND LAST COPY OF THIS TEST. It was written out twice in src/server/lib/layout.ts — in
 * `isUnder`, which decides whether a region is under one already found hidden, and in `boxOf`,
 * which decides which column of a comparison a block stands in. Both now call this.
 *
 * IT LOOKS FOR THE SEPARATOR AND NOT MERELY FOR THE CHARACTERS, and that is the whole of it. The
 * corpus really holds `data.why` and `data.why_it_hurts` on the same kind, and the sections derived
 * from them are `section.why` and `section.why_it_hurts`. Without the dot or the bracket, hiding
 * *Why this matters* would have hidden *Why it hurts* too, silently. The test in
 * tests/one-parser-for-one-region-grammar.test.ts checks this against the parser over every ordered
 * pair of ids the corpus derives, so "same characters then a separator" and "same steps then more
 * steps" are shown to be the same question rather than assumed to be.
 *
 * IT BUILDS NO STRING IN A CALL. The test in tests/one-parser-for-one-region-grammar.test.ts asks
 * it for every ordered pair of ids the corpus derives, so it reads the one character after the
 * prefix — 46 for `.` and 91 for `[` — and compares that, rather than making a new string for each
 * separator. It tests the exact match first, then the length and the one character after the prefix,
 * and the prefix last, so most pairs that cannot be inside are refused before the prefix is compared.
 *
 * A CHARACTER COUNT IS NOT A STEP AND SO IS NOT INSIDE. `data.summary@0` is not inside
 * `data.summary`: there is no region called `data.summary` — the field is a place ids are cut from,
 * not a region — and the paragraph's own parent is the section that declares the field.
 */
export function isInsideRegionId(inner: RegionId, outer: RegionId): boolean {
  if (inner === outer) return true
  if (inner.length <= outer.length) return false
  const next = inner.charCodeAt(outer.length)
  if (next !== 46 && next !== 91) return false
  return inner.startsWith(outer)
}

/**
 * WHETHER A REGION ID NAMES A THING OR A POSITION, computed from its last step.
 *
 *   last step is `[#id]` or `.field`  → `identity`. It survives inserts, deletes and reordering.
 *   last step is `[index]` or `@…`    → `position`. An edit above it moves it.
 *
 * IT IS COMPUTED AND NOT STORED, and it is not written into a sentence anybody reads. A POSITION IS
 * NOT A REASON TO ANSWER "GONE": a paragraph that moved is still there, and the reader that decides
 * whether a comment's region survived answers by containment.
 *
 * This deliberately does not use `isPosition` on the target declaration, which is declared per
 * identifier and cannot vary per region.
 *
 * AN ID THIS CANNOT READ ANSWERS `identity`, WHICH IS WHAT IT ANSWERED BEFORE THERE WAS A PARSER.
 * It is written here rather than left to fall through, and it is not a guess standing in for an
 * answer: an unreadable id has no last step to ask about, `checkTarget` refuses one at the write
 * door, and every id the corpus derives parses — 2,485 of 2,485, measured. The same sentence covers
 * `identityOf` and `offsetOf` below.
 */
export type Stability = 'identity' | 'position'

export function stabilityOf(id: RegionId): Stability {
  return parseRegionId(id).read?.stability ?? 'identity'
}

/**
 * WHETHER A REGION ID NAMES ONE ENTRY OF A LIST BY WHERE IT SITS — `…rows[1]`, `…cells[0]`.
 *
 * ---------------------------------------------------------------------------------------
 * WHO ASKS, AND WHAT THEY DO WITH THE ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * `readContext` in src/server/lib/agents.ts. A comment on a thing named by where it sits, with
 * nothing quoted, cannot be answered: add a row above and row 2 is a different row, holding
 * something the comment was never about. That reading answers `unknown` and says so, and
 * src/shared/targets.ts promises exactly that on the `rowKey` identifier in so many words.
 *
 * It used to be answered from `isPosition` on the target declaration alone, which is declared once
 * per kind. A row of a table is now STORED as the region it is — see `theRegionItNames` in
 * src/server/lib/targets.ts — and every region shares one declaration, so the promise had to be
 * askable of one id rather than of a kind. Without this, a comment on a row came back *Still
 * there* about a row somebody may have pushed down, which is a position reported as an identity.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT `stabilityOf` ABOVE, AND THE DIFFERENCE IS THE OFFSET
 * ---------------------------------------------------------------------------------------
 *
 * `stabilityOf` answers `position` for a character count too — `data.blocks[#b-5].text@412` — and
 * that is right for what it is used for. It is the wrong question here: a paragraph is FOUND again
 * by containment when the characters above it move, so the reader can say what covers that place
 * now, and answering "Mole Office cannot say" about every paragraph comment would be a shrug where
 * there is a real answer. An entry of a list has no such second reading: nothing distinguishes row
 * 2 from the row that has taken its place.
 *
 * IT READS THE PARSER'S OWN STEPS rather than looking at the end of the string, so there is no
 * second reading of the id grammar here. An id nothing can read has no last step and answers false,
 * which is the same answer this question had before it was asked: `checkTarget` refuses an
 * unreadable id at the write door, so nothing stored reaches this.
 */
export function namesOneEntryByItsPosition(id: RegionId): boolean {
  const steps = parseRegionId(id).read?.steps ?? []
  return steps[steps.length - 1]?.form === 'index'
}

/**
 * THE PART OF A REGION ID THAT NAMES A THING, WITHOUT THE OFFSET THAT NAMES A POSITION.
 *
 * `data.blocks[#b-5].text@412` names the `text` field of block `b-5`, at character 412. The field
 * is an identity: it survives every edit of the characters inside it. The offset is a position and
 * an edit above it moves it.
 *
 * Splitting the two is what stops `gone` being said about a paragraph that only moved. The
 * identity steps decide between `gone` and `changed`; the offset decides only WHICH region is
 * handed back. See the region reader in src/server/lib/targets.ts.
 *
 * An id this cannot read is handed back whole: see `stabilityOf` above.
 */
export function identityOf(id: RegionId): string {
  return parseRegionId(id).read?.identity ?? id
}

/**
 * The character offset a region id names, or null when it names none.
 *
 * Both forms of the `@` step answer: `…text@412` answers 412, and `…text@337:1204` answers 337,
 * which is where the range starts.
 *
 * An id this cannot read answers null: see `stabilityOf` above.
 */
export function offsetOf(id: RegionId): number | null {
  return parseRegionId(id).read?.at?.from ?? null
}

/** The width a role wants. One reading, so nothing works it out a second time. */
export function fitOf(role: RegionRole): Fit {
  return ROLE_OF[role].fit
}

/**
 * WHAT A STORED BLOCK MEANS, BY ITS TYPE. One map, read by the derivation below and by the drawing.
 *
 * THIS IS WHY THE REPORT CAN ONLY HAVE ONE ANSWER ABOUT A BLOCK'S WIDTH. Until 27 August 2026 the
 * renderer carried a width map of its own — four words, one per block type — beside this file's
 * three, and the two disagreed about nine of the twenty types with nothing failing. The renderer now
 * asks here. `Record<SummaryBlockType, RegionRole>` with no index signature means a twenty-first
 * block type stops the typecheck until somebody says what it means.
 */
export const ROLE_OF_BLOCK: Record<SummaryBlockType, RegionRole> = {
  text: 'passage',
  heading: 'heading',
  finding: 'finding',
  callout: 'callout',
  metrics: 'metrics',
  keyvalue: 'keyValue',
  list: 'bulletGroup',
  checklist: 'checklist',
  code: 'code',
  quote: 'quote',
  path: 'path',
  chart: 'chart',
  math: 'math',
  table: 'table',
  timeline: 'timeline',
  // A PICTURE AND ITS CAPTION ARE ONE THING ON THE PAGE, so the block draws a figure and the picture
  // itself is a region inside it.
  image: 'figure',
  // A FILE A REPORT CARRIES. Criterion R3. Not a picture: a reader points at the block and the three
  // facts on it, and the code or the address is drawn inside.
  file: 'file',
  // A SOUND OR A FILM THE REPORT PLAYS is a stored file with the same four
  // facts, drawn with a player. A reader points at it as at a file block.
  audio: 'file',
  video: 'file',
  section: 'section',
  columns: 'columns',
  grid: 'grid',
  tabs: 'tabs',
  beside: 'beside',
  // A TEST WORLD IS A PASSAGE, not a figure. Criterion C31: what a reader points at in it is the
  // words saying what to go and look at, and the address is a press rather than something quoted.
  world: 'passage',
  // A QUESTION FOR THE PERSON IS A PASSAGE: what a reader points at in it is
  // its words, the question, the sentence asking for words, or the button's label. A box is a titled
  // run of blocks, which is what a section is.
  choice: 'passage',
  fillin: 'passage',
  button: 'passage',
  box: 'section',
}

/**
 * WHAT ONE STORED BLOCK MEANS. The map above, plus the one rule that reads the block and not its
 * type: a paragraph block with a heading on it is a small section rather than a passage.
 */
export function roleOfBlock(block: SummaryBlock): RegionRole {
  if (block.type === 'text' && block.heading !== undefined && block.heading !== '') return 'section'
  return ROLE_OF_BLOCK[block.type] ?? 'refused'
}

/**
 * HOW MUCH WIDTH ONE PART OF A REPORT NEEDS.
 *
 *   `reading`  one reading line is the whole of it. Nothing beside it is drawn in.
 *   `wide`     it needs more than a reading line: a table, a picture, columns, a chart.
 *
 * THIS IS THE ANSWER TO THE OWNER'S COMPLAINT ABOUT THE EMPTY HALF OF A REPORT. A part used to
 * claim the whole width whenever it held other parts, so a paragraph inside it drew at the reading
 * measure and the rest of the claimed width was drawn in by nobody — and pointing at that emptiness
 * selected the part, with nothing in the selected box. A part now asks what it holds. Prose alone
 * needs a reading line, so the part is a reading line wide and the space beside it belongs to
 * nobody, because nobody claimed it. Anything wide inside makes the whole part wide, and then the
 * width is used rather than stranded.
 *
 * IT IS COMPUTED FROM THE TREE AND NEVER STORED. There is one walk over a report's stored text and
 * this reads its result.
 */
export type WidthNeeded = 'reading' | 'wide'

export function widthNeededBy(region: Region): WidthNeeded {
  const facts = ROLE_OF[region.role]
  if (facts.stacksParts) {
    for (const child of region.children) if (widthNeededBy(child) === 'wide') return 'wide'
    return 'reading'
  }
  return facts.fit === 'read' ? 'reading' : 'wide'
}

/**
 * HOW NARROW ONE PART OF A COMPOSITION MAY BE DRAWN, BY WHAT IT HOLDS.
 *
 * A composition is a run of parts seen beside each other. Each part has a smallest width it is
 * still worth drawing at, and that smallest width depends on what is in the part: writing needs
 * the most, a table or a code block less, a picture least.
 *
 * THREE ANSWERS AND NO NUMBERS. A count of pixels is not a fact about meaning, and this file holds
 * none. What each of these three turns into on a screen is written in exactly one place, and that
 * place is not here. It does not exist yet either: it arrives with the stored composition block.
 *
 * IT RECURSES ON `stacksParts`, EXACTLY AS `widthNeededBy` ABOVE DOES, AND THAT IS THE WHOLE OF IT.
 * A region that lays its own insides out answers for itself and its children are never visited; a
 * region that merely stacks parts answers with its widest part. That is why an `image` block —
 * role `figure`, `stacksParts` false, `isPicture` true — answers `figure` and its caption is never
 * reached. Walking every descendant looking for `isProse` instead would call every captioned
 * picture, table, chart, formula and code block writing, because `caption` is `isProse: true`
 * above, and would then hold a captioned picture open to the width of a line of prose.
 */
export const LEASTS = ['figure', 'panel', 'sentence'] as const // narrowest to widest
export type Least = (typeof LEASTS)[number]

export function leastNeededBy(region: Region): Least {
  const facts = ROLE_OF[region.role]
  if (!facts.stacksParts) {
    if (facts.isProse) return 'sentence'
    if (facts.isPicture) return 'figure'
    return 'panel'
  }
  // A PART THAT ONLY STACKS THINGS NEEDS WHAT ITS WIDEST CHILD NEEDS. Which of two answers is
  // wider is read off `LEASTS`, whose comment says it is in that order, rather than written out
  // again as a ladder of `if`s here — a second copy of the order could disagree with the first.
  // A part holding nothing answers `figure`, the narrowest: there is nothing in it to keep open.
  let widest: Least = LEASTS[0]
  for (const child of region.children) {
    const seen = leastNeededBy(child)
    if (LEASTS.indexOf(seen) > LEASTS.indexOf(widest)) widest = seen
  }
  return widest
}

/** The same question about a run of stored blocks that is not a region yet. Pure; stores nothing. */
export function leastNeededByBlocks(blocks: readonly SummaryBlock[]): Least {
  return leastNeededBy(regionsOf({ field: 'blocks', blocks }))
}

/**
 * THE STORED PATH OF ONE COLUMN OF A COMPARISON.
 *
 * A COLUMN IS NOT A REGION AND THIS IS NOT A REGION ID. The columns of a `columns` block are a bare
 * array of arrays of blocks: no id, no object to hang one on, and nothing a comment could be
 * anchored to. So there is no region for a column, and the blocks inside one hang directly off the
 * `columns` block's own region.
 *
 * IT STILL HAS A PATH, AND TWO PLACES NEED THE SAME ONE. `blockRegions` below builds the region id
 * of every block inside a column from it, and `src/server/lib/layout.ts` needs it to say which
 * column of a comparison one of those blocks stands in. Written out in both places, the two would
 * be free to disagree — which is the defect this repository keeps producing — so it is written
 * here once and both call it.
 */
export function columnPath(columnsRegionId: RegionId, n: number): string {
  return `${columnsRegionId}.columns[${String(n)}]`
}

// ---------------------------------------------------------------------------------------
// THE MARKDOWN WALK
// ---------------------------------------------------------------------------------------

/** A region under construction: what the walk knows before its children are attached. */
interface Draft {
  id: RegionId
  parentId: RegionId | null
  role: RegionRole
  field: string | null
  from: number
  /** Set on a container derived from a run of text once the run closes. */
  to: number
  /** Set while the container is open, so its id can be rewritten from its final range. */
  openContainer: boolean
  /**
   * Set only on the draft that IS a stored block, and only when that block carries the mark. Left
   * out everywhere else, which `regionsOf` reads as false. See `Region.forOwner` above.
   */
  forOwner?: boolean
  /**
   * Set only on the draft that IS a part of a by-part summary. Left out everywhere else, which both
   * builders read as null. See `Region.covers`.
   */
  covers?: readonly string[]
  /**
   * Set only on a draft whose stored thing carries a state — a `finding` block, a checklist item, a
   * timeline item. Left out everywhere else, which `regionsOf` reads as null. See `Region.state`.
   */
  state?: ItemState
  /**
   * Set only on a draft that IS a declared section of a record page. Left out everywhere else,
   * which both builders read as false. See `Region.declared`.
   */
  declared?: boolean
}

/**
 * ONE PASS OVER ONE STORED STRING.
 *
 * A blank line closes whatever is open. A run of lines beginning `|` is a table; a line whose cells
 * are all dashes is the rule under the head and is not a row; each other line is a row and each
 * cell is a leaf. A line beginning `#` is a heading. A line beginning with a bullet marker opens a
 * bullet, and a following non-blank line that is not itself a marker CONTINUES that bullet rather
 * than opening a paragraph. A fenced block is `code`. Anything else opens a paragraph and continues
 * to the next blank line.
 *
 * THE ROLE COMES FROM THE CHARACTERS AND NEVER FROM THE BLOCK TYPE. That is what makes a table
 * typed into prose the same kind of thing as a table stored as a block.
 */
function prose(field: string, source: string, parentId: RegionId, out: Draft[]): void {
  const text = String(source ?? '')
  if (text === '') return
  let at = 0
  let mode: '' | 'para' | 'bullet' | 'table' = ''
  let open: Draft | null = null
  let fenced = false
  let fenceStart = 0
  for (const line of text.split('\n')) {
    const start = at
    at += line.length + 1
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      if (!fenced) {
        fenced = true
        fenceStart = start
      } else {
        fenced = false
        out.push(leaf('code', field, fenceStart, at, parentId))
      }
      mode = ''
      open = null
      continue
    }
    if (fenced) continue

    if (trimmed === '') {
      mode = ''
      open = null
      continue
    }

    if (trimmed.startsWith('|')) {
      const cells = tableRowCells(line)
      if (mode !== 'table' || open === null) {
        open = container('table', field, start, parentId)
        out.push(open)
        mode = 'table'
      }
      open.to = at
      // THE RULE UNDER THE HEAD IS NOT A ROW. `|---|---|` is punctuation.
      if (cells.every((cell) => /^\s*:?-{2,}:?\s*$/.test(cell.text))) continue
      const row = container('tableRow', field, start, open.id)
      row.to = at
      out.push(row)
      for (const cell of cells) {
        out.push(leaf('tableCell', field, start + cell.from, start + cell.to, row.id))
      }
      continue
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      out.push(leaf('heading', field, start, at, parentId))
      mode = ''
      open = null
      continue
    }

    if (/^([-*+]|\d+\.)\s/.test(trimmed)) {
      if (mode !== 'bullet' || open === null) {
        open = container('bulletGroup', field, start, parentId)
        out.push(open)
        mode = 'bullet'
      }
      open.to = at
      out.push(leaf('bullet', field, start, at, open.id))
      continue
    }

    // A CONTINUATION LINE OF THE OPEN BULLET, not a new paragraph. Somebody who indents a second
    // line under a bullet wrote one bullet.
    if (mode === 'bullet' && open !== null) {
      open.to = at
      continue
    }

    if (mode !== 'para') {
      out.push(leaf('paragraph', field, start, at, parentId))
      mode = 'para'
    } else {
      const last = out[out.length - 1]
      if (last !== undefined && last.role === 'paragraph') last.to = at
    }
  }
}

/** A region derived from a run of text that holds no other regions: named by where it STARTS. */
function leaf(role: RegionRole, field: string, from: number, to: number, parentId: RegionId): Draft {
  return { id: `${field}@${from}`, parentId, role, field, from, to, openContainer: false }
}

/**
 * A region derived from a run of text that CONTAINS other regions: named by the half-open RANGE it
 * covers. Its `to` is not known until the run closes, so its id is rewritten by `closeRanges`.
 */
function container(role: RegionRole, field: string, from: number, parentId: RegionId): Draft {
  return { id: `${field}@${from}:${role}`, parentId, role, field, from, to: from, openContainer: true }
}

// ---------------------------------------------------------------------------------------
// THE DERIVATION, PER STORED BLOCK TYPE
// ---------------------------------------------------------------------------------------

/**
 * THE TWENTY STORED BLOCK TYPES AND WHAT EACH DERIVES.
 *
 * A `SummaryBlockType` missing from this switch is a compile error, because `blockRegions` returns
 * through a total switch over the union. That is what stops a twenty-first block type drawing as
 * `refused` without anybody deciding it should.
 */
function blockRegions(block: SummaryBlock, arrayPath: string, parentId: RegionId, out: Draft[]): void {
  const path = `${arrayPath}[#${block.id}]`
  // WHAT THIS BLOCK MEANS, READ FROM THE ONE MAP. The switch below says what a block is MADE OF; it
  // no longer also says what it IS, because a second opinion about that is what let the renderer
  // and this file disagree about nine block types.
  const role = roleOfBlock(block)
  // WHETHER ITS AUTHOR ADDRESSED THIS BLOCK TO THE OWNER, asked once. `here` below and the `heading`
  // arm are the only two places a draft is pushed with the block's own path as its id, which is the
  // only region this may land on: see `Region.forOwner`, which says why it does not run downwards.
  const forOwner = block.forOwner === true
  // HOW THE WORK THIS BLOCK DESCRIBES WAS GOING, where the block is the kind that says. `finding`
  // is the ONE block type with a state of its own; the other two stored things that carry one are
  // items, and their arms below read them directly. Written as a narrow on `block.type` rather than
  // as a lookup on an unknown key, so a twenty-second block type that gains a state has to be added
  // here on purpose.
  const state = block.type === 'finding' ? block.state : undefined
  const here = (role: RegionRole, field: string | null = null, from = 0, to = 0): RegionId => {
    out.push({ id: path, parentId, role, field, from, to, openContainer: false, forOwner, ...(state === undefined ? {} : { state }) })
    return path
  }
  const named = (role: RegionRole, field: string, value: string, holder: RegionId): void => {
    out.push({ id: `${path}.${field}`, parentId: holder, role, field: `${path}.${field}`, from: 0, to: value.length, openContainer: false })
  }

  switch (block.type) {
    case 'text': {
      const holder = here(role)
      if (block.heading !== undefined && block.heading !== '') named('heading', 'heading', block.heading, holder)
      prose(`${path}.text`, block.text, holder, out)
      return
    }
    case 'heading': {
      out.push({ id: path, parentId, role, field: `${path}.text`, from: 0, to: block.text.length, openContainer: false, forOwner })
      return
    }
    case 'finding': {
      const holder = here(role, `${path}.text`, 0, block.text.length)
      if (block.detail !== undefined && block.detail !== '') prose(`${path}.detail`, block.detail, holder, out)
      return
    }
    case 'callout': {
      const holder = here(role)
      if (block.title !== undefined && block.title !== '') named('heading', 'title', block.title, holder)
      prose(`${path}.text`, block.text, holder, out)
      return
    }
    case 'quote': {
      const holder = here(role)
      prose(`${path}.text`, block.text, holder, out)
      if (block.source !== undefined && block.source !== '') named('source', 'source', block.source, holder)
      return
    }
    case 'metrics': {
      const holder = here(role)
      for (const item of block.items ?? []) {
        out.push({ id: `${path}.items[#${item.id}]`, parentId: holder, role: 'metric', field: null, from: 0, to: 0, openContainer: false })
      }
      return
    }
    case 'keyvalue': {
      const holder = here(role)
      for (const item of block.items ?? []) {
        out.push({ id: `${path}.items[#${item.id}]`, parentId: holder, role: 'keyValueItem', field: null, from: 0, to: 0, openContainer: false })
      }
      return
    }
    case 'checklist': {
      const holder = here(role)
      for (const item of block.items ?? []) {
        out.push({ id: `${path}.items[#${item.id}]`, parentId: holder, role: 'checklistItem', field: `${path}.items[#${item.id}].text`, from: 0, to: item.text.length, openContainer: false, state: item.state })
      }
      return
    }
    case 'timeline': {
      const holder = here(role)
      for (const item of block.items ?? []) {
        const id = `${path}.items[#${item.id}]`
        out.push({ id, parentId: holder, role: 'timelineItem', field: `${id}.text`, from: 0, to: item.text.length, openContainer: false, ...(item.state === undefined ? {} : { state: item.state }) })
        if (item.detail !== undefined && item.detail !== '') prose(`${id}.detail`, item.detail, id, out)
      }
      return
    }
    case 'list': {
      const holder = here(role)
      ;(block.items ?? []).forEach((item, at) => {
        const id = `${path}.items[${at}]`
        out.push({ id, parentId: holder, role: 'bullet', field: id, from: 0, to: String(item).length, openContainer: false })
      })
      return
    }
    case 'table': {
      const holder = here(role)
      ;(block.rows ?? []).forEach((row: TableRow, r) => {
        const rowId = `${path}.rows[${r}]`
        out.push({ id: rowId, parentId: holder, role: 'tableRow', field: null, from: 0, to: 0, openContainer: false })
        ;(row.cells ?? []).forEach((cell, c) => {
          const cellId = `${rowId}.cells[${c}]`
          out.push({ id: cellId, parentId: rowId, role: 'tableCell', field: cellId, from: 0, to: String(cell).length, openContainer: false })
        })
      })
      if (block.caption !== undefined && block.caption !== '') named('caption', 'caption', block.caption, holder)
      return
    }
    case 'code': {
      const holder = here(role, `${path}.code`, 0, block.code.length)
      if (block.caption !== undefined && block.caption !== '') named('caption', 'caption', block.caption, holder)
      return
    }
    case 'math': {
      const holder = here(role)
      if (block.caption !== undefined && block.caption !== '') named('caption', 'caption', block.caption, holder)
      return
    }
    case 'chart': {
      const holder = here(role)
      if (block.caption !== undefined && block.caption !== '') named('caption', 'caption', block.caption, holder)
      return
    }
    case 'image': {
      const holder = here(role)
      named('image', 'path', block.path, holder)
      if (block.caption !== undefined && block.caption !== '') named('caption', 'caption', block.caption, holder)
      return
    }
    case 'path': {
      here(role, `${path}.label`, 0, block.label.length)
      return
    }
    case 'file':
    case 'audio':
    case 'video': {
      // A FILE A REPORT CARRIES, OR ONE IT PLAYS. Criterion R3. The block's own region is the whole thing; the path
      // it is served from is a region inside it, so a reader can point at the address. The name, the
      // size and the hash are facts rather than stored text fields, so they carry no offset of their
      // own. The caption is prose and is named, like every other caption.
      const holder = here(role)
      named('path', 'path', block.path, holder)
      if (block.caption !== undefined && block.caption !== '') named('caption', 'caption', block.caption, holder)
      return
    }
    case 'world': {
      here(role, `${path}.label`, 0, block.label.length)
      return
    }
    case 'choice': {
      here(role, `${path}.question`, 0, block.question.length)
      return
    }
    case 'fillin': {
      here(role, `${path}.asks`, 0, block.asks.length)
      return
    }
    case 'button': {
      here(role, `${path}.label`, 0, block.label.length)
      return
    }
    case 'box':
    case 'section': {
      const holder = here(role)
      if (block.title !== undefined && block.title !== '') named('heading', 'title', block.title, holder)
      for (const child of block.blocks ?? []) blockRegions(child, `${path}.blocks`, holder, out)
      return
    }
    case 'grid': {
      const holder = here(role)
      for (const child of block.blocks ?? []) blockRegions(child, `${path}.blocks`, holder, out)
      return
    }
    case 'columns': {
      const holder = here(role)
      ;(block.columns ?? []).forEach((column, n) => {
        for (const child of column) blockRegions(child, columnPath(path, n), holder, out)
      })
      return
    }
    case 'tabs': {
      const holder = here(role)
      for (const tab of block.tabs ?? []) {
        const id = `${path}.tabs[#${tab.id}]`
        out.push({ id, parentId: holder, role: 'tab', field: null, from: 0, to: 0, openContainer: false })
        for (const child of tab.blocks ?? []) blockRegions(child, `${id}.blocks`, id, out)
      }
      return
    }
    case 'beside': {
      // PARTS SEEN BESIDE EACH OTHER. Modelled on the `tabs` arm above, which is the one other case
      // that makes a region per named slot rather than per block.
      //
      // THE `.blocks` STEP IS NOT DECORATION. `inside(place, key)` in SummaryBlocks.tsx builds
      // `${place.path}.${key}` and `placeOf` then appends `[#id]`, so the renderer hands a block
      // inside a part the path `parts[#p-1].blocks` — exactly as the tabs renderer hands one
      // `tabs[#id].blocks`. Two of three earlier drafts of the design dropped this step, which
      // would have made every block inside a part unfindable in the region index, silently.
      const holder = here(role)
      for (const part of block.parts ?? []) {
        const id = `${path}.parts[#${part.id}]`
        out.push({ id, parentId: holder, role: 'besidePart', field: null, from: 0, to: 0, openContainer: false })
        for (const child of part.blocks ?? []) blockRegions(child, `${id}.blocks`, id, out)
      }
      return
    }
    default: {
      // A STORED TYPE THIS BUILD DOES NOT KNOW, at runtime: a record written by a newer version of
      // the product than the one reading it.
      //
      // THE LINE BELOW IS THE COMPILE STOP, AND UNTIL 28 AUGUST 2026 IT WAS NOT HERE. The comment
      // that used to be here said `block` is `never` for the declared types and that a new type is
      // therefore a compile error. MEASURED: it was not. The cast on the next line accepts any
      // object, so adding a twenty-first block type produced no error here at all and the new type
      // would have derived as `refused`, with no parts inside it, silently. Binding `block` to
      // `never` is what actually stops the build until somebody writes its arm.
      const unhandled: never = block
      void unhandled
      const unknown = unhandled as { id?: unknown; type?: unknown }
      out.push({
        id: `${arrayPath}[#${String(unknown.id ?? '')}]`,
        parentId,
        role: 'refused',
        field: null,
        from: 0,
        to: 0,
        openContainer: false,
      })
      return
    }
  }
}

/** Every block type this derivation handles, so a test can assert it handles all twenty. */
export const DERIVED_BLOCK_TYPES: readonly SummaryBlockType[] = [
  'text',
  'heading',
  'finding',
  'callout',
  'metrics',
  'keyvalue',
  'list',
  'checklist',
  'code',
  'quote',
  'path',
  'chart',
  'math',
  'table',
  'timeline',
  'image',
  'file',
  'audio',
  'video',
  'section',
  'columns',
  'grid',
  'tabs',
  'beside',
  'world',
  'choice',
  'fillin',
  'button',
  'box',
]

/**
 * CLOSE EVERY OPEN CONTAINER'S RANGE, AND REWRITE ITS ID AND ITS CHILDREN'S PARENT.
 *
 * This is the second production of the grammar, and it exists because the measurement demanded it
 * and not because it looked tidy: without it a bullet group and its first bullet carry one id, and
 * so do a markdown table and its first row.
 */
function closeRanges(drafts: Draft[]): void {
  // A table and its first row begin at the same character. Their temporary ids must
  // differ before parents are rewritten; otherwise the row becomes its own parent.
  const closed = new Map<string, string>()
  for (const draft of drafts) {
    if (draft.openContainer) closed.set(draft.id, `${draft.field ?? ''}@${draft.from}:${draft.to}`)
  }
  for (const draft of drafts) {
    // A one-row table also has exactly its row's range. Keep the table's range id
    // and address that row by its start, a form the region grammar already reads.
    if (draft.openContainer && draft.role === 'tableRow' && draft.parentId !== null && closed.get(draft.id) === closed.get(draft.parentId)) {
      closed.set(draft.id, `${draft.field ?? ''}@${draft.from}`)
    }
  }
  for (const draft of drafts) {
    if (draft.parentId !== null) draft.parentId = closed.get(draft.parentId) ?? draft.parentId
    draft.id = closed.get(draft.id) ?? draft.id
    draft.openContainer = false
  }
}

/** What the derivation needs from a record: its stored blocks and nothing else. */
export interface RegionSource {
  /** The stored array the report is written in, e.g. `blocks` or `summaryBlocks`. */
  field: string
  blocks: readonly SummaryBlock[]
}

/**
 * EVERY REGION OF ONE REPORT, AS A TREE, DERIVED FROM STORED CONTENT BY ONE PURE FUNCTION.
 *
 * IT IS PURE AND IT IS IN `src/shared`, so the browser calls it to draw and the server calls it to
 * answer whether a comment's region is still there. There is no second walk over stored text.
 *
 * NOTHING IS WRITTEN TO ANY RECORD. The 151 stored block ids across the eight reports become the
 * middle of derived region ids; the thirteen nested blocks become addressable with no new rule,
 * because their path already runs all the way down.
 *
 * The root is the report body. Its id is `data.<field>` and it is not meaningful: pointing at the
 * whole report is pointing at the record, which already has a name of its own.
 */
export function regionsOf(source: RegionSource): Region {
  const rootId = `data.${source.field}`
  const drafts: Draft[] = []
  for (const block of source.blocks ?? []) blockRegions(block, rootId, rootId, drafts)
  closeRanges(drafts)

  const textOf = (draft: Draft): string => {
    if (draft.field === null) return ''
    const holder = fieldText(source, draft.field)
    if (holder === null) return ''
    return holder.slice(draft.from, draft.to)
  }

  type BuildingRegion = Omit<Region, 'children'> & { children: Region[] }
  const build = (draft: Draft): BuildingRegion => ({
    id: draft.id,
    parentId: draft.parentId,
    role: draft.role,
    fit: fitOf(draft.role),
    field: draft.field,
    range: draft.field === null ? null : { from: draft.from, to: draft.to },
    text: textOf(draft),
    forOwner: draft.forOwner === true,
    covers: draft.covers ?? null,
    state: draft.state ?? null,
    // NOTHING CUT OUT OF A REPORT IS DECLARED. Every region here exists because somebody wrote the
    // characters it covers or stored the block it draws. The declared places are the sections of a
    // record page and they are derived by `recordRegionsOf`.
    declared: false,
    children: [],
  })

  const root: BuildingRegion = {
    id: rootId,
    parentId: null,
    role: 'reportBody',
    fit: fitOf('reportBody'),
    field: null,
    range: null,
    text: '',
    // THE REPORT BODY IS NOT A BLOCK, so nobody can have addressed it to anybody.
    forOwner: false,
    // AND IT IS NOT A PART, so it stands for nothing but itself.
    covers: null,
    // AND IT IS NOT A PIECE OF WORK, so nobody can have said how it was going.
    state: null,
    // AND IT IS NOT A DECLARED SECTION EITHER. `recordRegionsOf` re-parents this root under the
    // section that declares it, and the section — not this root — is the declared thing.
    declared: false,
    children: [],
  }
  // Allocate each node once, then attach it. Stack depth no longer depends on the
  // number of derived regions, and a wide report costs one pass through its nodes.
  const nodes = new Map<RegionId, BuildingRegion>([[rootId, root]])
  for (const draft of drafts) nodes.set(draft.id, build(draft))
  for (const draft of drafts) {
    const parent = nodes.get(draft.parentId ?? rootId)
    if (parent !== undefined) parent.children.push(nodes.get(draft.id)!)
  }
  return root
}

// ---------------------------------------------------------------------------------------
// THE WHOLE RECORD PAGE, WITH THE REPORT BODY AS ONE SECTION OF IT
// ---------------------------------------------------------------------------------------

/**
 * WHAT THE DERIVATION NEEDS FROM A RECORD: its kind and its stored data, and nothing else.
 *
 * IT IS A SEPARATE SHAPE FROM `RegionSource` ABOVE AND DOES NOT REPLACE IT. `leastNeededByBlocks`
 * is called with a bare array of blocks — no record and no kind — at four places in this product,
 * so `RegionSource` cannot be widened to want a record without those four callers having a record
 * to give, and they do not have one. The new derivation therefore sits ABOVE the old one and
 * re-parents its output.
 */
export interface RecordRegionSource {
  kind: RecordKind
  /** The record's stored `data` object, read and never written. */
  data: Record<string, unknown>
  /**
   * THE RECORD'S OWN TITLE — the envelope column, not a key of `data`.
   *
   * IT IS REQUIRED FOR THE REASON `summary` BELOW IS. Since 3 September 2026 the title is reading
   * length 2 of a record with a reading ladder, so the body of a report draws it and a person can
   * point at it; a derivation without it would hold no `section.titleLine` and the server would
   * answer *that part is not there* about the line somebody is reading. Criterion A14b.
   */
  title: string
  /**
   * THE RECORD'S ONE-LINE SUMMARY — the envelope column beside `title`, not `data.summary`.
   *
   * IT IS REQUIRED FOR THE REASON `relations` IS. It is not in `data`, so a derivation without it
   * would hold no summary section, and a comment anchored to `section.summaryLine` would come back
   * *that part is not there* about the paragraph under the title that the writer was looking at. A
   * caller whose record has none says `null`, which is a statement about the record.
   */
  summary: string | null
  /**
   * THE RELATION PHRASES THIS RECORD HAS LINKS OF, from this record's end, in the order the page
   * draws them — `ResolvedLink.label`, which is what `LINK_TYPES` declares for that type and
   * direction.
   *
   * IT IS REQUIRED, AND THAT IS THE WHOLE OF THE DECISION. A record's links are in another table
   * and `data` cannot answer for them, so a default of "none" would mean every caller that had not
   * been taught to read links derived a page with no relation sections — and a comment anchored to
   * `section.subject of` would come back *that part is not there* about a list of eighteen rows
   * somebody is looking at. A caller with no links to give says so by passing `[]`, which is a
   * statement about the record rather than about the caller.
   */
  relations: readonly string[]
}

/** The id of the region that is the whole record. One word, spelled once, read three times below. */
export const RECORD_ROOT_ID: RegionId = 'data'

/**
 * The region id of one declared section, spelled through the one writer of the grammar, so the
 * punctuation of a section id is written in `spellRegionId` and nowhere else.
 */
export function sectionRegionId(key: string): RegionId {
  return spellRegionId({ root: 'section', steps: [{ form: 'name', name: key }], at: null })
}

/**
 * THE REGION ID OF ONE AUTHORED SHORT FORM — the label, the title, the gist, the card, the brief.
 *
 * WHY IT IS A FUNCTION AND NOT A TEMPLATE AT THREE CALL SITES. Three surfaces draw the same stored
 * line: the *Shorter forms* panel, the opening lines of the report body, and `recordRegionsOf`,
 * which is what puts the region in the tree the server resolves against. Three spellings of one id
 * is the defect this repository keeps finding, and it fails silently — the panel would carry a name
 * the tree does not hold and the server would answer *that part is not there*.
 */
export function shortFormRegionId(level: string): RegionId {
  return spellRegionId({
    root: 'data',
    steps: [
      { form: 'name', name: SHORT_FORMS_FIELD },
      { form: 'name', name: level },
      // THE STORED SHAPE HAS THE WORDS UNDER `text` and carries `madeFrom` and `writtenBy` beside
      // them. The region is the words, not the record of who wrote them.
      { form: 'name', name: 'text' },
    ],
    at: null,
  })
}

/**
 * THE REGION ID OF ONE PART OF THE BY-PART SUMMARY — what a reader right-clicks at levels 4, 5 and 6.
 *
 * IT CARRIES THE PART'S OWN ID AND NOT THE READING LEVEL, and that is the whole point. The same
 * part pressed at level 4 and at level 6 has to give one id, because it is one part: a heading at a
 * low level maps straight to the same heading and its paragraph at a high level. An id with the
 * level in it would make a comment left at level 4 read as being about something else at level 6.
 *
 * IT IS A FUNCTION FOR THE REASON `shortFormRegionId` ABOVE IS ONE: the page spells it to put the
 * target on the drawn part, and the reader spells it again to recognise a press. Two spellings of
 * one id fail silently — the composer would carry a name nothing else holds.
 */
export function partRegionId(partId: string): RegionId {
  return spellRegionId({
    root: 'data',
    steps: [
      { form: 'name', name: SHORT_FORMS_FIELD },
      { form: 'name', name: PARTS_KEY },
      { form: 'key', key: partId },
    ],
    at: null,
  })
}

/**
 * THE REGION ID OF ONE PICTURE A MESSAGE CARRIES. Problem DowO7yEioWp0.
 *
 * The region is the picture's stored path, as it is for a picture in a report: `.path` under the
 * picture's own id. It is a function for the reason `partRegionId` above is one: the chat spells it
 * to put the target on the drawn picture, and `recordRegionsOf` spells it to put the region in the
 * tree the server resolves against. One writer, so the two cannot differ.
 */
export function messagePictureRegionId(pictureId: string): RegionId {
  return spellRegionId({
    root: 'data',
    steps: [
      { form: 'name', name: 'pictures' },
      { form: 'key', key: pictureId },
      { form: 'name', name: 'path' },
    ],
    at: null,
  })
}

/**
 * THE REGION OF EACH QUOTE A MESSAGE CARRIES, in the order `quotesOf` reads them. Problem
 * DowO7yEioWp0.
 *
 * A message sent by pointing stores what it points at: one place in `data.target`, or a list in
 * `data.quotes` (the message door refuses a message holding both). The chat draws each as a quote
 * block above the message's words, so a right-click on one takes that quote. `target` is the stored
 * value of `data.target`; `howMany` is how many quotes `quotesOf` read, which the chat receives as the
 * message's `quotes`. The chat and `recordRegionsOf` both call this, so the two cannot differ.
 *
 * AN ENTRY OF `quotes` IS NAMED BY ITS PLACE AMONG THE QUOTES `quotesOf` KEEPS. That is its stored
 * index on every row the door wrote, because the door refuses an entry that is not a quote.
 */
export function messageQuoteRegions(target: unknown, howMany: number): { id: RegionId; field: 'target' | 'quotes' }[] {
  const single = targetOfRecord({ kind: 'message', data: { target } }) !== null
  return Array.from({ length: howMany }, (_, at) =>
    single && at === 0
      ? { id: spellRegionId({ root: 'data', steps: [{ form: 'name', name: 'target' }], at: null }), field: 'target' as const }
      : {
          id: spellRegionId({
            root: 'data',
            steps: [
              { form: 'name', name: 'quotes' },
              { form: 'index', index: single ? at - 1 : at },
            ],
            at: null,
          }),
          field: 'quotes' as const,
        },
  )
}

/**
 * WHICH PART OF THE BY-PART SUMMARY THIS REGION IS, or null when it is not one.
 *
 * `partRegionId` above is the one writer of those ids and it is what is compared against, so
 * nothing anywhere spells one by hand. It reads the path with `parseRegionId` and never with a
 * string test, so there is still one reader of the grammar in this product.
 */
export function partIdOfRegionId(regionId: string): string | null {
  const read = parseRegionId(regionId).read
  if (read === undefined || read.root !== 'data' || read.at !== null || read.steps.length !== 3) return null
  const [under, key, part] = read.steps
  if (under === undefined || under.form !== 'name' || under.name !== SHORT_FORMS_FIELD) return null
  if (key === undefined || key.form !== 'name' || key.name !== PARTS_KEY) return null
  if (part === undefined || part.form !== 'key') return null
  return part.key
}

/**
 * WHAT ONE PART OF A BY-PART SUMMARY STANDS FOR, in the sentence the composer draws.
 *
 * *Stands for the heading “Method”, the finding and the chart.*
 *
 * IT NAMES THE BLOCKS WITH `namesOfParts`, WHICH IS THE ONE THING THAT SAYS WHICH PART A PART IS.
 * The role word alone will not do here, and that is measured rather than assumed: a report with two
 * headings in it gave *Stands for heading and finding* for one part and the same five words for the
 * other, which names neither. `namesOfParts` quotes a part's own words and disambiguates two parts
 * of one kind, and it is the same namer the review pane and a comment's own sentence use.
 *
 * A BLOCK THE REPORT NO LONGER HOLDS IS COUNTED AND NOT DROPPED, which is the rule `whatItStandsFor`
 * in ./zoom.ts already follows for a stored form's recorded sources: a part quietly losing one of
 * the blocks it stands for is the exact harm the coverage rule exists to prevent.
 */
export function whatAPartStandsFor(
  root: Region,
  kind: RecordKind,
  title: string | null,
  blocksField: string,
  coverIds: readonly string[],
): string {
  const names = namesOfParts(root, kind, title)
  const named: string[] = []
  let gone = 0
  for (const id of coverIds) {
    const name = names.get(`data.${blocksField}[#${id}]`)
    if (name === undefined) {
      gone += 1
      continue
    }
    named.push(name)
  }
  if (named.length === 0) {
    return gone === 0
      ? 'This part covers no block of the report.'
      : `This report no longer holds ${gone === 1 ? 'the one block' : `any of the ${String(gone)} blocks`} this part covers.`
  }
  const missing =
    gone === 0
      ? ''
      : ` ${gone === 1 ? 'One more block' : `${String(gone)} more blocks`} this part covers, this report no longer holds.`
  return `Stands for ${joined(named)}.${missing}`
}

/**
 * THE REGION A LINE DRAWN FROM A STORED PATH IS, or null when that path names no region.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A report body opens with the shortest things somebody wrote about it, and every one of those
 * lines already says which stored field it came from — `ReportLine.field`, drawn as
 * `data-drawn-from`. Measured on report `OOOt4Kouc5dT` on 30 August 2026: all five of those lines
 * resolved six levels up to the whole record, and at reading length 1 the ONE line that IS the
 * whole projection resolved to the record too. That is C9's pointability half.
 *
 * ---------------------------------------------------------------------------------------
 * NULL IS AN ANSWER AND IT IS NOT A FAILURE
 * ---------------------------------------------------------------------------------------
 *
 * THE TWO COLUMNS ARE READING LENGTHS 2 AND 3 AND THEY HAVE THEIR OWN SECTIONS. Since 3 September
 * 2026 — criterion A14b — the body of a report draws its own `title` at length 2 and its own
 * `summary` at length 3, so both are places a person points at. Neither string is in `data`, so
 * neither can hang a region under a `data.…` path; each is the declared section that carries its
 * characters, `section.titleLine` and `section.summaryLine`. Those are the ids the record's own
 * region tree holds, so a press names a part the server can find.
 *
 * WHAT THAT REPLACED, and it is why this paragraph is here. Both paths answered null: a press on
 * the level-2 line or the level-3 paragraph walked past them to the report and the composer named
 * the whole report. That was right while neither column was a reading length and is wrong now.
 *
 * Answering the caller's question with a made-up id would be the silent falsehood this cluster
 * exists to remove: the composer would open on a name, and the server would answer `gone`.
 *
 * IT READS THE PATH WITH `parseRegionId` and never with a string test, so there is one reader of
 * the grammar in this product and this is not a fourth.
 */
export function regionOfDrawnLine(field: string): RegionId | null {
  if (field === TITLE_LINE_FIELD) return sectionRegionId(TITLE_LINE_KEY)
  if (field === SUMMARY_LINE_FIELD) return sectionRegionId(SUMMARY_LINE_KEY)
  const read = parseRegionId(field).read
  if (read === undefined || read.root !== 'data' || read.at !== null || read.steps.length !== 2) return null
  const [under, level] = read.steps
  if (under === undefined || under.form !== 'name' || under.name !== SHORT_FORMS_FIELD) return null
  if (level === undefined || level.form !== 'name') return null
  if (!(SHORT_FORM_LEVELS as readonly string[]).includes(level.name)) return null
  return shortFormRegionId(level.name)
}

/**
 * WHICH READING LENGTH A REGION IS, WHERE IT IS ONE OF THE RECORD'S OWN COLUMNS, or null.
 *
 * `section.titleLine` is reading length 2 and `section.summaryLine` is length 3. It is the reverse
 * of `regionOfDrawnLine` above for those two ids, and it is a function for the reason every other
 * id reader in this file is one: the composer recognises a press and the body spells the id, and
 * two spellings of one id fail silently.
 *
 * IT DOES NOT SAY WHAT THE PLACE IS CALLED, and the caller must not read it that way. The same
 * summary is the record's one-line summary in the header of a module and the report's conclusion
 * in the body of a report at length 3. WHERE it is drawn is what decides, and the drawing is what
 * knows that — see `theReportDrawnHere` in src/web/lib/drawnhere.ts.
 */
export function columnRungOfRegion(regionId: string): 'title' | 'gist' | null {
  if (regionId === sectionRegionId(TITLE_LINE_KEY)) return 'title'
  if (regionId === sectionRegionId(SUMMARY_LINE_KEY)) return 'gist'
  return null
}

/**
 * EVERY REGION OF ONE RECORD PAGE, AS A TREE, WITH THE REPORT BODY HANGING UNDER ITS SECTION.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A person right-clicks a paragraph on a record page and the browser walks UP until it finds
 * something that says what it is. Measured on 29 August 2026 across the five records the owner
 * named, that walk found one answer and one only on four of the five: the record itself. Twenty-one
 * headings on module `cegP4HnIk9nd`, twenty-one targets, all of them the whole module. The
 * mechanical cause is that 24 of the 26 kinds derive no region tree at all, so there was nothing
 * between the paragraph and the record for the walk to stop at.
 *
 * This is the tree between them: one region per section the kind declares, plus the regions cut
 * from what this record wrote in them.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY ID UNDER THE REPORT BODY IS UNCHANGED, CHARACTER FOR CHARACTER
 * ---------------------------------------------------------------------------------------
 *
 * That is the hardest thing this function has to be true of, because region ids are STORED: a
 * comment's target holds one, and an id that changed its spelling would be a comment that quietly
 * stopped pointing at anything.
 *
 * So `regionsOf` is called exactly as the renderer calls it, and its root is re-parented by COPYING
 * the root object with a new `parentId`. The `children` array is the same array — shared, not
 * rebuilt — so nothing beneath the root is visited, let alone rewritten. There is no second walk,
 * and no id under the body is spelled a second time anywhere in this function.
 *
 * ---------------------------------------------------------------------------------------
 * THE TEXT IS CARRIED, NOT LOOKED UP AGAIN
 * ---------------------------------------------------------------------------------------
 *
 * Each cutter below is handed the string this function already read out of `data`, and `carried`
 * holds that string under the same path the drafts covering it name. `fieldText` is not called and
 * is not touched: it walks a path INTO A BLOCK ARRAY and answers null for anything else, so a
 * record field would have come back null and every new region would have derived an empty string.
 * `carriesTarget` would then have refused a target on a paragraph a reader can see, silently.
 *
 * ---------------------------------------------------------------------------------------
 * A SECTION IS HERE WHEN IT IS ON THIS RECORD'S PAGE, NOT MERELY WHEN THE KIND DECLARES IT
 * ---------------------------------------------------------------------------------------
 *
 * A body section whose field this record has not written is not drawn, and the consequence panel is
 * drawn only for a consequence somebody recorded with a bearer. Deriving those anyway would put a
 * region, and so a target, on a place that is nowhere on the screen. `sectionsOnThisRecord` above
 * asks the readers the page asks, and the browser asks that same function before a panel declares
 * itself — so the tree and the screen cannot come to two answers about which sections exist.
 *
 * IT ASKS `isWritten` AND NOT `filledBodySections`, AND THAT WAS MEASURED RATHER THAN CHOSEN.
 * `filledBodySections` also drops a value the FOLD STACK cannot print as words, and the fold stack
 * is not the only thing that draws a body section: `ModuleView` draws Context, Parts and Paths as
 * panels of their own. Counted over the 750 non-deleted records on 30 August 2026, asking
 * `filledBodySections` here would have left three field sections undrawn in this tree while their
 * panels were on the page — `parts` on 20 modules and `paths` on 11 — and *Implementation* is one
 * of the five sections the owner's own test right-clicks on a module.
 *
 * THE SAME COUNT FOUND ONE CASE GOING THE OTHER WAY, AND IT IS RECORDED RATHER THAN HIDDEN.
 * `stoppedAtEntries` is written on one `stopping_point` record, is a list of objects, and the
 * stopping-point page has no panel for it — so this derives a section for a place that is on no
 * screen. It is inert: nothing draws an element for it, so nothing can put a target on it. It is a
 * defect in the stopping-point page, which draws a written field nowhere, and it belongs to that
 * page rather than to this function.
 */
/**
 * THE SECTIONS THIS RECORD ACTUALLY HAS, out of the ones its kind declares.
 *
 * A kind DECLARING a section says the page can have it. This says this record does. The two differ
 * for a field nobody has written and for a consequence with nobody behind it, and both of those are
 * places that are nowhere on the screen.
 *
 * IT IS EXPORTED BECAUSE THE BROWSER ASKS THE SAME QUESTION FOR THE SAME REASON. A panel that draws
 * one section puts that section's target on itself, and a panel drawn over an empty field — the
 * Paths panel of a module with no paths, which still draws its own "none linked" — must NOT, or the
 * press would name a region this record does not have. `recordRegionsOf` below reads this same
 * function, so the region a press lands on and the region the tree holds cannot be two answers.
 */
export function sectionsOnThisRecord(source: RecordRegionSource): readonly SectionSpec[] {
  // A KIND MOLE OFFICE DOES NOT KNOW GETS NO SECTIONS. `SECTIONS_OF` is total over the kinds this
  // build knows, and a record written by a newer version of the product can still reach a reader —
  // so the lookup is checked rather than trusted, exactly as `bodySectionsDeclaredBy` checks it.
  const declared = (SECTIONS_OF as Partial<Record<RecordKind, readonly SectionSpec[]>>)[source.kind] ?? []
  const sections = declared.filter((spec) => {
    switch (spec.from.holds) {
      // A FIELD THIS RECORD HAS NOT WRITTEN IS NOT A PLACE ON ITS PAGE. The "Add:" row at the foot
      // of the body offers the rest by name, and an offer is a control rather than a section.
      //
      // A HEADLINE FIELD IS ASKED THE SAME QUESTION AND FOR THE SAME REASON. `ProposalGovernance`
      // draws *No question was written here* over an unwritten one, exactly as the Paths panel of a
      // module with no paths draws its own "none linked": an absence somebody can read is not a
      // place in the record, and a target on it would name a region this record does not have.
      //
      // A DECISION'S GOVERNS SECTION IS ASKED BY ITS THREE PARTS. It is filled by the pages, the files or what no page fits,
      // and the files and what no page fits are drawn inside it rather than as places of their own.
      case 'field':
      case 'headlineField':
        return theGovernsSectionDecides(source.kind, spec.key, source.data) ?? isWritten(source.data[spec.key])
      // THE ONE-LINE SUMMARY, WHEN THERE IS ONE. The header draws *No summary was written for this
      // record* when there is not, and that paragraph declares nothing for the reason above.
      case 'summaryLine':
        return isWritten(source.summary)
      // THE RECORD'S OWN TITLE, WHICH IS READING LENGTH 2. The column is `NOT NULL` and non-empty
      // on every record in this corpus, so this is true wherever the kind declares the section;
      // it is asked rather than assumed, because a blank title is a record with no length 2.
      case 'titleLine':
        return isWritten(source.title)
      // THE PANEL IS DRAWN FOR A RECORDED CONSEQUENCE WITH SOMEBODY BEHIND IT AND FOR NOTHING ELSE
      // — `KindHeadline` in RecordPage.tsx drops a `bearer: none`, which is somebody having looked
      // and found no one waiting. Asking `readConsequence` here is asking the reader the panel
      // asks; a section derived from the bare stored value would claim a panel that is not there.
      case 'consequence': {
        const stored = readConsequence(source.data)
        return stored !== null && stored.bearer !== 'none'
      }
      // THE REST HAVE NO STORED FIELD OF THEIR OWN AND ARE ALWAYS HERE: the reading matter, the
      // short forms, the two provenance sections, *Where this lives*, *What this was made of*, and
      // the seven panels Mole Office works out about a record — *Links*, *Where this module
      // stands*, *Claimed source*, *How this subsystem may evolve*, *Reports about this …*, *Where
      // this work sits, and how big it is* and *Who made this, and whose move it is*.
      //
      // THE LAST OF THE SEVEN IS NOT ASKED `isWritten` OF `whose_move`, AND THAT IS DELIBERATE.
      // `WhoseMoveSays` draws the broken ring and *nobody has said* over an unwritten field rather
      // than disappearing, and it draws who filed the record beside it whatever the field holds —
      // so the panel is on the page on every record of those four kinds. That is the same reading
      // the six above get and the opposite of the Paths rule, which is about a panel that has
      // nothing but the field. Their panels are always drawn — each draws its own empty
      // state rather than disappearing, and which KINDS draw them at all is decided once, in
      // src/shared/sections.ts, which is what stops this filter and the page disagreeing.
      default:
        return true
    }
  })
  // ONE SECTION PER RELATION THIS RECORD HAS LINKS OF, after the sections its kind declares.
  //
  // THEY ARE NOT FILTERED, because the filter above asks whether a declared place is filled and
  // these are built FROM what fills them: a relation is here exactly when a link with that phrase
  // is, so a relation section is never empty. `relationSectionsOf` drops repeats, and eighteen
  // *subject of* rows are one list under one heading.
  //
  // A RELATION WHOSE PHRASE IS ALREADY A SECTION KEY OF THIS KIND STOPS HERE, LOUDLY. Two regions
  // with one id is the fault this cluster exists to remove, and it would be silent: the panel and
  // the row would both draw `section.about` and a comment on one would be painted on the other.
  // `tests/sections.test.ts` puts the same question of all 26 kinds against all 33 phrases, so this
  // throw is the second line of defence and not the first.
  const claimed = new Set(sections.map((spec) => spec.key))
  const relations = relationSectionsOf(source.relations)
  for (const spec of relations) {
    if (!claimed.has(spec.key)) continue
    // THE KIND IS NAMED IN THE READER'S WORD AND NOT THE STORED ONE. A stored word reaching a
    // sentence somebody reads is what `tests/the-machine-word-gate.test.ts` refuses, and this
    // sentence goes on a screen: it throws where a panel is being drawn.
    const said = kindWord(source.kind).text
    throw new Error(
      `This ${said} has links read as "${spec.key}", and a ${said} also declares a section keyed ` +
        `"${spec.key}". Both would be region "section.${spec.key}" of one record. Rename the section key in ` +
        `src/shared/sections.ts.`,
    )
  }
  return [...sections, ...relations]
}

export function recordRegionsOf(source: RecordRegionSource): Region {
  const declared = sectionsOnThisRecord(source)
  const drafts: Draft[] = []
  /** The strings this function read out of `data`, under the path the drafts covering them name. */
  const carried = new Map<string, string>()
  /** The report body, re-parented under its section. Null on the 24 kinds that store no blocks. */
  let body: Region | null = null

  const section = (spec: SectionSpec): RegionId => {
    const id = sectionRegionId(spec.key)
    drafts.push({
      id,
      parentId: spec.inside === null ? RECORD_ROOT_ID : sectionRegionId(spec.inside),
      role: 'section',
      field: null,
      from: 0,
      to: 0,
      openContainer: false,
      declared: true,
    })
    return id
  }

  /** One stored string, cut into the paragraphs, bullets and tables inside it. */
  const cut = (path: string, text: string, holder: RegionId): void => {
    if (text === '') return
    carried.set(path, text)
    prose(path, text, holder, drafts)
  }

  /** One stored string drawn whole, as one region: a short form, a consequence, a list entry. */
  const whole = (path: string, text: string, role: RegionRole, holder: RegionId): void => {
    if (text === '') return
    carried.set(path, text)
    drafts.push({ id: path, parentId: holder, role, field: path, from: 0, to: text.length, openContainer: false })
  }

  for (const spec of declared) {
    const from = spec.from
    switch (from.holds) {
      case 'summaryLine': {
        // WHETHER THIS RECORD HAS ONE WAS ASKED ONCE, ABOVE, by `sectionsOnThisRecord`. A section
        // reaching this line with nothing stored would be that filter having changed its mind.
        const line = source.summary
        if (line === null || line === '') {
          throw new Error('a summary-line section was derived for a record with no summary')
        }
        // THE SECTION CARRIES THE CHARACTERS ITSELF, WHICH IS THE ONE PLACE IN THIS DERIVATION
        // WHERE A SECTION DOES. Every other section holds regions cut out of a field under it, and
        // those regions are named by extending the field's path — `data.cause@0`. This string is
        // not in `data`: its path is the bare word `summary`, and `data` and `section` are the only
        // two root words a region id may start with, so `summary@0` is a name `parseRegionId`
        // refuses. Naming the whole line here keeps the id inside the grammar AND keeps the words
        // reachable: `whatARegionHolds` on the server answers with this one string, which is what
        // lets `quoteWhatItHolds` store the exact sentence somebody was reading.
        const id = sectionRegionId(spec.key)
        carried.set(SUMMARY_LINE_FIELD, line)
        drafts.push({
          id,
          parentId: RECORD_ROOT_ID,
          role: 'section',
          field: SUMMARY_LINE_FIELD,
          from: 0,
          to: line.length,
          openContainer: false,
          declared: true,
        })
        continue
      }
      case 'titleLine': {
        // THE RECORD'S OWN TITLE, DRAWN AS READING LENGTH 2 BY THE BODY OF A REPORT.
        //
        // IT CARRIES THE CHARACTERS ITSELF, exactly as the summary line above does and for the same
        // reason: this string is not in `data`, its path is the bare word `title`, and `data` and
        // `section` are the only two root words a region id may start with — so `title@0` is a name
        // `parseRegionId` refuses. Naming the whole line here keeps the id inside the grammar and
        // keeps the words reachable, so a comment left on the title stores the sentence somebody
        // was reading.
        //
        // ONE LINE, NOT PARAGRAPHS. A title is one line by construction, and cutting it into
        // paragraphs would put a region under it that no reader of this product names.
        const line = source.title
        if (line === '') {
          throw new Error('a title-line section was derived for a record with no title')
        }
        const id = sectionRegionId(spec.key)
        carried.set(TITLE_LINE_FIELD, line)
        drafts.push({
          id,
          parentId: RECORD_ROOT_ID,
          role: 'section',
          field: TITLE_LINE_FIELD,
          from: 0,
          to: line.length,
          openContainer: false,
          declared: true,
        })
        continue
      }
      case 'field':
      case 'headlineField': {
        // WHETHER THIS RECORD HAS THE SECTION AT ALL WAS ASKED ONCE, ABOVE, by
        // `sectionsOnThisRecord`. What is left here is what to cut out of the value, and that is
        // the same work for both arms: a headline field is one stored string or list, drawn by the
        // kind's own panel instead of by the fold stack, and where it is DRAWN changes nothing
        // about what is stored in it.
        const value = source.data[spec.key]
        const holder = section(spec)
        // A LIST OF RECORD IDS DRAWS THE RECORDS' NAMES AND NOT THE STORED STRINGS, so there are no
        // characters under it that a reader is reading. `NamedRecordList` in RecordPage.tsx leaves
        // the quote mark off those rows for the same reason: the stored string is an id and the
        // drawn words are somebody else's title. The section is still pointable, because it was
        // declared and its heading is on the screen.
        //
        // A PARTICIPANT AND A LIST OF DOORS ARE THE SAME CASE. The participant is drawn by the
        // registry's name and each door by what it does, so neither section holds the stored
        // characters a quote would look for. Their sections are still pointable.
        if (namesRecords(source.kind, spec.key)) continue
        if (namesAParticipant(source.kind, spec.key) || holdsDoors(source.kind, spec.key)) continue
        // THE PICTURES A MESSAGE CARRIES, ONE REGION EACH. Problem DowO7yEioWp0. The chat draws each
        // picture on its own, so a right-click on one takes that picture. Only the message kind is
        // read this way; `picturesOf` is the one reader of the stored list.
        // THE QUOTES A MESSAGE SENT BY POINTING CARRIES, ONE REGION EACH, under the section of the
        // field that holds them. `messageQuoteRegions` says which quote is which part.
        if (source.kind === 'message' && (spec.key === 'target' || spec.key === 'quotes')) {
          const quotes = messageQuoteRegions(source.data['target'], quotesOf({ kind: 'message', data: source.data }).length)
          for (const quote of quotes) {
            if (quote.field !== spec.key) continue
            drafts.push({ id: quote.id, parentId: holder, role: 'quote', field: null, from: 0, to: 0, openContainer: false })
          }
          continue
        }
        if (source.kind === 'message' && spec.key === 'pictures') {
          for (const picture of picturesOf(source.data)) {
            const id = messagePictureRegionId(picture.id)
            carried.set(id, picture.path)
            drafts.push({ id, parentId: holder, role: 'image', field: id, from: 0, to: picture.path.length, openContainer: false })
          }
          continue
        }
        // A SHAPE THE PAGE DRAWS AS A PANEL RATHER THAN AS WORDS GETS ITS SECTION AND NO REGIONS
        // INSIDE IT. A module's `parts` is a list of objects with their own checklist items, drawn
        // by the Parts panel in ModuleView; cutting paragraphs out of it would mean writing
        // "[object Object]" into a region's text and calling it something somebody wrote.
        //
        // A SECTION FILLED ONLY BY THE FIELDS DRAWN INSIDE IT has no words of its own to cut. A decision's Governs
        // section is on the page when only its files or what no page fits are written, and its own field is then unwritten.
        if (!isWritten(value)) continue
        if (!drawableAsWords(source.kind, spec.key, value)) continue
        // A LIST OF DATED WORDS: one region for each entry's words, at the path that names them.
        if (holdsDatedWords(source.kind, spec.key)) {
          for (const entry of datedWordsIn(value)) {
            whole(`data.${spec.key}[${String(entry.index)}].words`, entry.words, 'bullet', holder)
          }
          continue
        }
        if (Array.isArray(value)) {
          value.forEach((line, at) => {
            whole(`data.${spec.key}[${String(at)}]`, String(line), 'bullet', holder)
          })
          continue
        }
        cut(`data.${spec.key}`, String(value), holder)
        continue
      }
      case 'readingMatter': {
        const holder = section(spec)
        // THE PARAGRAPH ABOVE THE BLOCKS, on a kind that stores one. A module is the only kind that
        // stores both, and this is where the two are one section rather than two.
        const prosePath = from.prose
        if (prosePath !== null) {
          const written = source.data[prosePath]
          if (typeof written === 'string') cut(`data.${prosePath}`, written, holder)
        }
        // THE REPORT BODY, RE-PARENTED BY COPYING THE ROOT. `children` is the same array; nothing
        // underneath it is visited and no id underneath it is rewritten.
        const blocksField = from.blocks
        if (blocksField !== null) {
          const blocks = source.data[blocksField]
          if (Array.isArray(blocks) && blocks.length > 0) {
            const root = regionsOf({ field: blocksField, blocks: blocks as SummaryBlock[] })
            body = { ...root, parentId: holder }
          }
        }
        continue
      }
      case 'shortForms': {
        const holder = section(spec)
        const written = readStoredShortForms(source.data[from.field])
        for (const level of SHORT_FORM_LEVELS) {
          const form = written[level]
          if (form === undefined) continue
          whole(shortFormRegionId(level), form.text, 'paragraph', holder)
        }
        // AND EVERY PART OF THE BY-PART SUMMARY, WHICH LEVELS 4 TO 6 DRAW.
        //
        // Without these the tree held the three written short forms and nothing else, so every part
        // target the page handed out — and the page has been putting one on every drawn part since
        // the pointing layer was built — resolved to `gone` and the write door answered "There is
        // no part of a record to point at". So a comment sent from a low level, to a chosen agent,
        // failed. Criterion M16, problem `Kyr3b1hr3jjR`.
        //
        // THE HEADING IS WHAT THE REGION HOLDS, because it is the one text drawn at all three of
        // levels 4, 5 and 6. `partRegionId` deliberately carries no level, so one part pressed at
        // two levels gives one id; a region whose characters changed with the level would undo that
        // — a comment made at level 4 would quote something a reader at level 6 never saw.
        const parts = readStoredParts(source.data[from.field])
        for (const part of parts?.parts ?? []) {
          const id = partRegionId(part.id)
          if (part.heading === '') continue
          carried.set(id, part.heading)
          drafts.push({
            id,
            parentId: holder,
            role: 'heading',
            field: id,
            from: 0,
            to: part.heading.length,
            openContainer: false,
            covers: part.covers,
          })
        }
        continue
      }
      case 'consequence': {
        // WHETHER THE PANEL IS DRAWN AT ALL WAS ASKED ONCE, ABOVE, by `sectionsOnThisRecord`. The
        // read is made again here because this arm needs the WORDS, and a section that reached this
        // line with nothing stored would be that filter having changed its mind — so it throws
        // rather than deriving an empty paragraph nobody wrote.
        const stored = readConsequence(source.data)
        if (stored === null) throw new Error('a consequence section was derived for a record with no consequence')
        const holder = section(spec)
        whole(`data.${from.field}.what`, stored.what, 'paragraph', holder)
        continue
      }
      case 'relation':
      case 'history':
      case 'changeLog':
      // WHAT WAS SPENT, added for problem kkxhj88hCHEj: token and time totals this product worked
      // out from the change log. None of it is this record's writing.
      case 'spent':
      case 'openAround':
      // WHAT WAS ALREADY SETTLED HERE, added 7 September 2026, in this arm for the same reason as
      // the one above it: the panel draws OTHER records' titles — decisions, and the forks they
      // settled — and each row names the record it is about. Nothing in it is this record's writing.
      case 'decidedHere':
      // THE CHECKLISTS ABOUT A MODULE, in this arm for the reason above: each row is another record's title and items.
      case 'checklistsAbout':
      case 'whereItLives':
      case 'madeOf':
      // A RUN'S TOOL USES, added in wave 13s round 33. The rows are in `tool_uses`, not in this record, so the
      // panel holds no region of it. Its test_file_runs children also live outside the record;
      // no record region or file-results read panel is introduced by migration 0279.
      case 'toolUses':
      // THE SIX PANELS MOLE OFFICE WORKS OUT ABOUT A RECORD, added 31 August 2026. They belong in
      // this arm and nowhere else, and for the reason the six above are in it: none of them holds
      // a region, because the words inside them are not this record's writing. *Links* holds the
      // relation lists, and each of those holds rows that name ANOTHER record. *Where this module
      // stands* holds a stored word and a count. *Claimed source* holds file patterns read from the
      // implementation map. *How this subsystem may evolve* holds other records' titles. *Reports
      // about this …* holds report rows. *Where this work sits* holds the record that contains this
      // one and an estimate. In every case the row says what it is through the `{about: …}` arm of
      // `Declares`, and the section is what says which panel it was met in.
      case 'links':
      case 'standing':
      case 'claimedSource':
      case 'mayEvolve':
      case 'reportsAbout':
      case 'whereItSits':
      // WHO MADE THIS, AND WHOSE MOVE IT IS, added 31 August 2026, and it is in this arm for the
      // same reason as the six above: it holds no region. Neither of the two things the panel draws
      // is a paragraph somebody wrote. Who filed the record is a name read off the change ledger,
      // and whose move it is is one of three stored words drawn with the sentence that says what
      // that word means — words this product wrote, from `g2b.move.*` in the word lists, and not
      // the record's.
      case 'whoseMove': {
        // NOT STORED IN `data`. These six are what Mole Office knows about the record from its two
        // ledgers, its links and the repository on disk, and none of them holds a region, because
        // the words drawn inside them are not this record's writing: a link row draws ANOTHER
        // record's title, and that record is what a press on the row names. A change row draws one
        // write to one field, and that WRITE is what a press on it names — see the `change` kind in
        // src/shared/targets.ts. Each row says so itself, through the `{about: …}` arm of
        // `Declares`, and the section is what says which relation, or which ledger, it was met in.
        //
        // The provenance sections are drawn on every kind, so they are here on every kind. A
        // relation section is here exactly when a link with that phrase is. *Where this lives* and
        // *What this was made of* are here on the kinds whose page draws them, and src/shared/
        // sections.ts is the one place that says which kinds those are.
        section(spec)
        continue
      }
      default: {
        // A SEVENTH WAY FOR A SECTION TO GET ITS CONTENT STOPS THE BUILD HERE. `SectionFrom` in
        // src/shared/sections.ts is a closed union, and binding it to `never` is what makes adding
        // an arm there a compile error rather than a section that silently derives nothing.
        const unhandled: never = from
        void unhandled
        continue
      }
    }
  }

  closeRanges(drafts)

  const textOf = (draft: Draft): string => {
    if (draft.field === null) return ''
    const holder = carried.get(draft.field)
    // THE LINE THAT PUSHED THIS DRAFT IS THE LINE THAT CARRIED ITS TEXT. `cut` and `whole` above
    // each do both, and they are the only two ways a draft with a field is made here. So there is
    // no honest empty string to return: a miss means a third way was added and did not carry, and
    // an empty region would report a paragraph as blank rather than reporting the defect.
    if (holder === undefined) throw new Error(`no text was carried for ${draft.field}`)
    return holder.slice(draft.from, draft.to)
  }

  const byParent = new Map<RegionId, Draft[]>()
  for (const draft of drafts) {
    const key = draft.parentId ?? RECORD_ROOT_ID
    const list = byParent.get(key)
    if (list === undefined) byParent.set(key, [draft])
    else list.push(draft)
  }

  const readingMatterId = sectionRegionId(READING_MATTER_KEY)
  const build = (draft: Draft): Region => {
    const inside = (byParent.get(draft.id) ?? []).map(build)
    return {
      id: draft.id,
      parentId: draft.parentId,
      role: draft.role,
      fit: fitOf(draft.role),
      field: draft.field,
      range: draft.field === null ? null : { from: draft.from, to: draft.to },
      text: textOf(draft),
      forOwner: draft.forOwner === true,
      covers: draft.covers ?? null,
      state: draft.state ?? null,
      declared: draft.declared === true,
      // THE REPORT BODY GOES AFTER THE PARAGRAPH ABOVE IT AND BEFORE THE SECTIONS UNDER IT, which
      // is the order the page draws them in. It is spliced rather than pushed, because the body
      // sections are children of this same section.
      children: draft.id === readingMatterId && body !== null ? withBody(inside, body) : inside,
    }
  }

  return {
    id: RECORD_ROOT_ID,
    parentId: null,
    role: 'recordRoot',
    fit: fitOf('recordRoot'),
    field: null,
    range: null,
    text: '',
    // A RECORD IS NOT A BLOCK, so nobody can have addressed it to anybody.
    forOwner: false,
    // AND IT IS NOT A PART, so it stands for nothing but itself.
    covers: null,
    // A RECORD'S OWN STATE IS NOT THIS FIELD. `state` here is the word a finding or a checklist item
    // carries about the work it describes; a record's state is a field of the record.
    state: null,
    // THE ROOT IS NOT A SECTION. It is the record, which already has a target of its own.
    declared: false,
    children: (byParent.get(RECORD_ROOT_ID) ?? []).map(build),
  }
}

/**
 * The reading matter's children with the report body in the middle: first the prose cut from the
 * record's own summary field, then the body, then the sections that sit inside the reading matter.
 *
 * The split is found by looking for the first DECLARED child, because that is what a section is and
 * the prose cut above it never is. Reading a count off the cutter instead would be this file
 * knowing how many regions `prose` made, which is a second copy of that answer.
 */
function withBody(inside: readonly Region[], body: Region): readonly Region[] {
  const at = inside.findIndex((one) => one.declared)
  if (at === -1) return [...inside, body]
  return [...inside.slice(0, at), body, ...inside.slice(at)]
}

/** Every region of a report, flattened, in reading order. The root comes first. */
export function flatten(region: Region): Region[] {
  const out: Region[] = []
  const pending = [region]
  while (pending.length > 0) {
    const next = pending.pop()!
    out.push(next)
    for (let i = next.children.length - 1; i >= 0; i--) pending.push(next.children[i]!)
  }
  return out
}

/**
 * THE CHARACTERS A FIELD PATH NAMES, or null when the path does not reach a string.
 *
 * It reads the same paths `regionsOf` writes, so the two cannot disagree about what a path means.
 * A path that reaches nothing answers null rather than an empty string: NOTHING IS THERE and NOBODY
 * HAS LOOKED are different answers, and an empty string would say the first when the truth is that
 * the walk fell off.
 */
export function fieldText(source: RegionSource, fieldPath: string): string | null {
  const prefix = `data.${source.field}`
  if (!fieldPath.startsWith(`${prefix}[`)) return null
  let cursor: unknown = source.blocks
  let at = prefix.length
  while (at < fieldPath.length) {
    const ch = fieldPath[at]
    if (ch === '[') {
      const close = fieldPath.indexOf(']', at)
      if (close === -1) return null
      const step = fieldPath.slice(at + 1, close)
      at = close + 1
      if (!Array.isArray(cursor)) return null
      if (step.startsWith('#')) {
        const id = step.slice(1)
        cursor = (cursor as { id?: string }[]).find((one) => one?.id === id)
      } else {
        cursor = (cursor as unknown[])[Number(step)]
      }
      if (cursor === undefined) return null
      continue
    }
    if (ch === '.') {
      const next = fieldPath.slice(at + 1).search(/[.[]/)
      const end = next === -1 ? fieldPath.length : at + 1 + next
      const name = fieldPath.slice(at + 1, end)
      at = end
      if (cursor === null || typeof cursor !== 'object') return null
      cursor = (cursor as Record<string, unknown>)[name]
      if (cursor === undefined) return null
      continue
    }
    return null
  }
  return typeof cursor === 'string' ? cursor : typeof cursor === 'number' ? String(cursor) : null
}

// ---------------------------------------------------------------------------------------
// WHAT CARRIES A TARGET, AND HOW A REGION IS FOUND AGAIN AFTERWARDS
// ---------------------------------------------------------------------------------------

/**
 * THERE IS NO `data-region` ATTRIBUTE, AND THE DESIGN ASKED FOR ONE. HERE IS WHY NOT.
 *
 * `design/round-ten/design/semantic-regions.md` §8.2 draws each region with `data-region="<id>"`
 * beside `data-target="region/<recordId>/<id>"`. Those are the same id on the same element, written
 * twice. This repository's own rule about one fact in two places says to delete one of the two, and
 * `data-target` is the one that has to stay: the upward walk reads it, the server resolves it, and
 * it is percent-encoded so an id holding a slash is safe.
 *
 * WHAT `data-region` WOULD HAVE ADDED is a name on the regions that carry no target — the report
 * body, a figure wrapper, an empty cell. Nothing needs one: the developer overlay draws what a
 * press would reach, which is exactly the set carrying a target, and a box round something a press
 * walks past would be the overlay answering its own question wrongly.
 *
 * `data-drawn-from` therefore stays on blocks, unchanged, and is not a second spelling of anything
 * a region carries: a block's element carries `reportBlock` until window B, and no region target.
 */

/**
 * WHETHER AN ELEMENT DRAWN FOR THIS REGION CARRIES A `data-target`. ONE RULE, ONE PLACE.
 *
 * Two conditions, and the design (§8.2) states both:
 *
 *   · THE ROLE HAS TO BE MEANINGFUL. A report body, a record root, a figure wrapper and a tab strip
 *     are drawn and are not things a person can mean, so the upward walk passes through them.
 *   · IT HAS TO HOLD SOMETHING, OR BE A DECLARED SECTION. An empty table cell and a blank paragraph
 *     have a stored path, so they are regions and they have ids — and there is nothing there for a
 *     person to mean. The useful answer to a press inside one is the row or the section that holds
 *     it.
 *
 * "Holds something" is one non-space character of its own, or one child region. It is computed
 * from the region the caller is already holding; it is not a stored field and not a per-region
 * policy, because a field that is always equal to a function of the content is the defect this
 * repository names about itself.
 *
 * A DECLARED SECTION IS POINTABLE WHETHER OR NOT IT HOLDS ANYTHING, and that is the one thing
 * `declared` changes here. A section is a place the page HAS: its heading is drawn, a reader can
 * point at it, and "nobody has written this yet" is a thing worth saying about it. `Region.declared`
 * says why it is a member and not a second reading of the role.
 *
 * IT IS ALSO WHAT STOPS A MIS-DECLARED SECTION LYING. A section declared over a field path nothing
 * stores derives no children and carries no text, so it is pointable and holds nothing — and every
 * region UNDER it, which is where the words would have been, still has to hold something to be
 * pointable. A widened field coming back empty therefore shows as a section with nothing in it
 * rather than as a paragraph target that resolves to no words.
 *
 * THE RENDERER AND THE DEVELOPER OVERLAY BOTH ASK THIS FUNCTION. If they each wrote the condition
 * out, the overlay would draw a box round something a press could not reach, which is the overlay
 * answering the question it exists to answer with a lie.
 */
export function carriesTarget(region: Region): boolean {
  if (!ROLE_OF[region.role].meaningful) return false
  return region.declared || region.text.trim() !== '' || region.children.length > 0
}

/**
 * WHETHER A HEADING IS THE NAME OF THE REGION THAT HOLDS IT, or a part of its own standing among
 * that region's other parts.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE QUESTION EXISTS AND WHO ASKS IT
 * ---------------------------------------------------------------------------------------
 *
 * There are two ways a heading reaches the region tree, and they name different things.
 *
 *   A `section`'s `title`, a `text` block's `heading`, a `callout`'s `title`. `named` below pushes
 *   these with the HOLDER as their parent, so the heading names the whole of what its parent holds.
 *
 *   A `heading` BLOCK. Its arm pushes one leaf region standing beside its siblings, so it names the
 *   blocks that follow it, not the container they all sit in.
 *
 * `src/shared/outline.ts` asks this to work out what a heading it drew stands over, and the answer
 * is opposite in the two cases. Reading the parent for a heading block would say it stands over the
 * whole report.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS ANSWERED FROM THE ONE PLACE THE TWO IDS ARE SPELLED, WHICH IS THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * `named` writes ONE string into both `id` and `field` — `${path}.title` — because a name is the
 * whole of the field it lives in. The `heading` block arm writes the block's own path as the id and
 * `${path}.text` as the field, because a block is not its own text. So the two cases differ in the
 * derivation and this reads that difference rather than restating either rule.
 *
 * IT IS ONLY ASKED OF A HEADING, and that narrowing is not decoration. A table cell and a bullet are
 * also written with one string in both places, and neither is the name of anything. The guard below
 * makes the question unanswerable for them rather than answering it wrongly.
 */
export function headingNamesItsHolder(region: Region): boolean {
  if (region.role !== 'heading') return false
  return region.field === region.id
}

/** One region by its exact id, anywhere in the tree, or null when no region has that id. */
export function findRegion(root: Region, id: RegionId): Region | null {
  if (root.id === id) return root
  for (const child of root.children) {
    const found = findRegion(child, id)
    if (found !== null) return found
  }
  return null
}

/**
 * EVERY REGION CUT FROM ONE STORED STRING, or an empty list when the string holds none.
 *
 * A FIELD IS NOT ITSELF A REGION, and that is why this exists. `data.blocks[#b-1].text` names a
 * stored string; the regions cut from it are the paragraphs, bullets and tables inside it, each
 * carrying that path as its `field`. So "is the field still there" is answered by asking whether
 * anything was cut from it, not by looking for a region with the field's own name.
 */
export function regionsInField(root: Region, field: string): Region[] {
  return flatten(root).filter((region) => region.field === field)
}

/**
 * THE NARROWEST REGION OF ONE STORED STRING WHOSE CHARACTERS COVER `offset`, or null when none does.
 *
 * NARROWEST, because a bullet group and its first bullet both cover the group's first character and
 * the bullet is the more useful answer — it is what a press there would reach.
 *
 * NULL IS A REAL ANSWER AND NOT A FAILURE. Delete the last two paragraphs of a block and an offset
 * that used to be inside it is past the end of the string. Nothing covers it, and what to hand back
 * then is the caller's decision and not this function's.
 */
export function regionHolding(root: Region, field: string, offset: number): Region | null {
  let best: Region | null = null
  let width = Number.POSITIVE_INFINITY
  for (const region of regionsInField(root, field)) {
    const range = region.range
    if (range === null || offset < range.from || offset >= range.to) continue
    if (range.to - range.from < width) {
      best = region
      width = range.to - range.from
    }
  }
  return best
}

/**
 * THE REGION ONE OF THE THREE OLDER TARGET KINDS NAMES, or null when the kind names no region.
 *
 * `reportBlock`, `tableRow` and `tableCell` each name a part of a report that the region tree also
 * names, in a different spelling. This is the conversion between the two, and it is the only one:
 * the server's region reader uses it so an old comment resolves against the new tree, and the
 * `contexts-to-regions` migration uses it to rewrite stored contexts.
 *
 * IT TAKES THE RECORD'S BLOCK FIELD, BECAUSE `blocks` IS NOT THE ONLY ONE. A module keeps its
 * curated summary in `summaryBlocks`, and a `reportBlock` target covers a block of either. A pure
 * function of the target alone cannot know which, so it would have to guess, and a guess here puts
 * a comment on a part of a record that is not the part it was written about. `blocksFieldOf` in
 * src/shared/kinds.ts is what the caller asks.
 *
 * IT SUBTRACTS ONE. `rowKey` and `columnKey` are counted from 1 — the declaration in
 * src/shared/targets.ts says so in those words — and every array step of a region id is counted
 * from 0.
 */
export function regionIdOfLegacyTarget(
  target: { kind: string; blockId?: string; rowKey?: string; columnKey?: string },
  blocksField: string | null,
): RegionId | null {
  if (blocksField === null) return null
  const blockId = target.blockId
  if (blockId === undefined) return null
  const block = `data.${blocksField}[#${blockId}]`
  if (target.kind === 'reportBlock') return block
  const row = Number(target.rowKey)
  if (!Number.isInteger(row) || row < 1) return null
  if (target.kind === 'tableRow') return `${block}.rows[${String(row - 1)}]`
  if (target.kind === 'tableCell') {
    const column = Number(target.columnKey)
    if (!Number.isInteger(column) || column < 1) return null
    return `${block}.rows[${String(row - 1)}].cells[${String(column - 1)}]`
  }
  return null
}

/**
 * WHAT A REGION IS, WITHOUT ITS CHILDREN OR ITS CHARACTERS.
 *
 * It is what the server hands back when a comment's region has moved: enough to say which part of
 * the report the comment is now beside, and no copy of the text, which the caller already has in
 * the resolution's `strings`.
 */
export interface RegionSummary {
  id: RegionId
  role: RegionRole
  field: string | null
  range: { from: number; to: number } | null
}

/** One region, as the summary above. */
export function summaryOf(region: Region): RegionSummary {
  return { id: region.id, role: region.role, field: region.field, range: region.range }
}

// ============================================================================ is the place drawn here

/**
 * DID THIS DRAWING DRAW THE CHARACTERS THE COMMENT WAS WRITTEN ON? Total over the five places.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT THE SAME QUESTION AS `wordsOnScreen`, AND BOTH ARE ASKED
 * ---------------------------------------------------------------------------------------
 *
 * This one asks: ARE THE CHARACTERS PART OF WHAT THIS VIEW DREW — a question about the derived
 * tree, answerable before a single pixel is painted, and therefore answerable for a view the reader
 * is not at. `wordsOnScreen` in src/web/components/agent/MarkLayer.tsx asks whether the PAINTED DOM
 * ended up holding them, and answers `lit`, `moved` or `cannot say`.
 *
 * The first chooses which of §9.7's four cases a comment is in, which is what decides whether the
 * mark is drawn at full strength or reduced. The second decides what that mark looks like once the
 * case is chosen. Neither is derived from the other and neither replaces it: a region can be drawn
 * and the paint still fail, and characters can be absent from the drawing with the DOM perfectly
 * healthy.
 *
 * ---------------------------------------------------------------------------------------
 * ONE ARM PER PLACE, BECAUSE FOUR OF THE FIVE HAVE DIFFERENT ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * An earlier draft asked "does this offset fall inside the region" and that has NO ANSWER for the
 * majority of what is stored. Counted on a copy of the corpus: of the annotations carrying a place,
 * most carry `{at:'quote'}` — words kept verbatim because nothing stored can be shown to hold them
 * — and a quote names characters, not an offset. So a quote is answered by looking for its
 * characters in what the region holds, which is a different question with a real answer.
 *
 * `undefined` MEANS NO PLACE WAS RECORDED, and the region is then the whole of what the comment
 * names. It is drawn: there is nothing finer to be missing.
 *
 * A QUOTE WHOSE CHARACTERS APPEAR TWICE IS NOT ANSWERED HERE and gets no new answer. `wordsOnScreen`
 * already owns that case and already says `cannot say`.
 */
export function placeFallsInside(drawn: Region, place: Place | undefined): boolean {
  if (place === undefined) return true
  switch (place.at) {
    // NAMES THE REGION AND NOTHING NARROWER. Whatever was drawn is the whole answer.
    case 'surface':
      return true
    // ONE OFFSET, ONE REGION: containment, read off the range the derivation cut.
    case 'words':
      return covers(drawn, place.span.from)
    case 'run':
      return covers(drawn, place.offset, place.field)
    // TWO ENDS, AND BOTH HAVE TO BE HERE. One end inside and one outside is a comment whose subject
    // runs off this drawing, and saying it is here would be saying it is smaller than it is.
    case 'across':
      return covers(drawn, place.from.from) && covers(drawn, place.to.from)
    // KEPT WORDS, LOOKED FOR IN WHAT THE REGION HOLDS. `Region.text` is the slice the derivation
    // already cut, so this reads the characters rather than reaching for the record a second time.
    case 'quote':
      return place.words !== '' && drawn.text.includes(place.words)
  }
}

/**
 * Whether one character offset of one stored field lies in what this region covers.
 *
 * THE FIELD HAS TO MATCH AND NOT ONLY THE NUMBER. Two blocks of a report each hold a field with
 * character 40 in it, and a region of one covering offset 40 says nothing at all about the other.
 * Where the caller has no field to give — a `words` place carries its field on the span, which is
 * optional on the older stored shape — the number alone is checked and the caller is the one that
 * chose to ask a weaker question.
 */
function covers(drawn: Region, offset: number, field?: string): boolean {
  if (drawn.range === null || drawn.field === null) return false
  if (field !== undefined && field !== drawn.field) return false
  return offset >= drawn.range.from && offset < drawn.range.to
}
