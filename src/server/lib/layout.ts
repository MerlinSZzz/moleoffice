// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT WOULD HAPPEN TO WHAT AN AGENT ASKED FOR, ANSWERED IN WORDS AND WITH NO BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * An Agent's proportions are preferences within a valid composition, not absolute pixel or
 * percentage commands, and the layout stays responsible for keeping every
 * part readable, adapting ratios and stacking on a narrow screen. A layout that can disagree with
 * the Agent is only worth having if the Agent can find out that it did.
 *
 * So this file turns one stored record into that answer: for every composition in it, what each
 * part was asked to be worth, what each part is worth, what would be drawn at a width, and every
 * preference that was not given, each with the part named and the reason in words.
 *
 * THE ACCEPTANCE TEST IT SERVES IS THEIRS: state a preference the layout must refuse, and see it
 * refused for a stated reason. `GET /api/records/:id/layout?width=&gutter=&rem=&read=&reader=` is that
 * test, and it needs no screen.
 *
 * ---------------------------------------------------------------------------------------
 * IT DECIDES NO WIDTH OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * Every number and every sentence comes from `src/shared/beside.ts`, which is the whole authority
 * and holds each of its numbers once. Every region id comes from `regionsOf` in
 * `src/shared/regions.ts`, which is the one walk over stored content. What is left here is the
 * joining: find the compositions, look up what each part stored, ask, and hand back the answer.
 *
 * THE TWO THINGS IT DOES KNOW, said plainly rather than left to be discovered:
 *
 *   · how to read a stored value back out of a record by the region id that names it, and even
 *     that is built from `stepsOfPath` in src/shared/fielddiff.ts rather than from a second
 *     reading of the path grammar;
 *   · WHICH BOX EACH COMPOSITION STANDS IN, which is the walk down the region tree in
 *     `inBoxesOf` below. It works out no width there either — every width it hands a child comes
 *     out of `drawnAt` — but it does decide which of those widths a child is asked about, and the
 *     comment on `compositionsAt` says what the three cases are and what happened when this file
 *     had no walk at all.
 */

import { readerSees, type Reader } from '@shared/audience.ts'
import {
  drawnAs,
  drawnAt,
  equalColumns,
  measureDrawn,
  roomFor,
  sayWhatHappens,
  type MeasureAsked,
  type PartAsked,
  type RoomPlan,
} from '@shared/beside.ts'
import { byId, stepsOfPath } from '@shared/fielddiff.ts'
import { blocksFieldOf } from '@shared/kinds.ts'
import type { LayoutReport } from '@shared/presentation.ts'
import {
  columnPath,
  flatten,
  isInsideRegionId,
  leastNeededBy,
  leastNeededByBlocks,
  regionsOf,
  type Least,
  type Region,
} from '@shared/regions.ts'
import type { PanelRecord, SummaryBlock } from '@shared/types.ts'

// ---------------------------------------------------------------------------- what comes back

/** One part of one composition, before any width is known. */
export interface PartPlanned {
  /** The part's region id, which is what a comment, a target or a screenshot names it by. */
  regionId: string
  /** What the part holds, which is what decides how narrow it may be drawn: the `least` it needs. */
  holds: Least
  /** What the report asked this part to be worth beside the others, or null when it asked nothing. */
  asked: number | null
  /** What it is worth. The same as `asked` when the report said, and Mole Office's reading when not. */
  share: number
  /** How wide the writing inside it was asked to read. Absent unless the report said. */
  measure?: MeasureAsked
}

/**
 * One composition, before any width is known, AS ONE READER IS DRAWN IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A READER IS PART OF THE QUESTION
 * ---------------------------------------------------------------------------------------
 *
 * A `beside` block's parts are filtered by audience before anything is drawn. `SummaryBlocks.tsx`
 * keeps a part only when at least one of that part's own blocks is one this reader is shown, and
 * where fewer than two parts are left it draws what remains as ordinary blocks across the whole
 * box — no row, no part and no share anywhere on the screen.
 *
 * UNTIL 29 AUGUST 2026 THIS ANSWERED ABOUT THE STORED REPORT INSTEAD. Measured in Chromium at a
 * 1440 pixel window with an 1164 pixel report body, on two parts asking 6 to 4 whose second part
 * holds one block marked for developers: a normal reader was drawn no row at all and one block
 * 1164 pixels wide, and this file said two parts of 687.6 and 458.4 pixels with nothing refused.
 * So it named a part that reader is not shown, gave widths nothing was drawn at, and called
 * honoured a share that reader never receives.
 *
 * A COMPARISON IS NEVER FILTERED. The renderer's `columns` arm draws every column whoever is
 * reading, so `notShownToThisReader` is always empty for one and `besideEachOther` is always true.
 */
export interface CompositionPlanned {
  /** The composition's own region id. */
  regionId: string
  /**
   * WHAT THE PARTS OF THIS COMPOSITION ARE, and whether a person can point at one.
   *
   *   `regions`  the parts of a `beside` block. Each is a Semantic Region with its own id, and a
   *              comment, a screenshot or a target can name it.
   *   `columns`  the columns of a comparison. A column is not a region — there is nothing stored to
   *              hang an id on — so the id reported for one is its stored path and nothing can be
   *              anchored to it.
   */
  partsAre: 'regions' | 'columns'
  /**
   * The parts of this composition this reader is NOT shown, by region id, in the order they were
   * written. Empty when the reader is shown all of them, which is every composition in the corpus
   * until one is written for developers.
   *
   * They are named rather than left out. A part dropped in silence is a part of somebody's report
   * that no answer mentions, and this route is the only place an agent finds out what became of
   * what it wrote.
   */
  notShownToThisReader: string[]
  /**
   * WHETHER THIS READER IS SHOWN THESE PARTS BESIDE EACH OTHER AT ALL.
   *
   * False when audience filtering left fewer than two parts. There is then no row to describe, so
   * `chosenBy`, `parts`, `exactAboveRem`, `stackBelowRem` and `gaps` are ABSENT rather than filled
   * with numbers about an arrangement nobody draws, and `drawnAcrossTheWholeBox` says what is drawn
   * instead. This is the same shape of answer `boxPx: null` already gives for a composition inside
   * a grid: absence, because nobody worked it out, rather than a value that reads like one.
   */
  besideEachOther: boolean
  /**
   * WHAT IS DRAWN INSTEAD, by region id, when `besideEachOther` is false: the parts still left,
   * each drawn as ordinary blocks across the whole box, one after another. It holds one entry, or
   * none at all when every part of the composition is written for a reader this one is not.
   *
   * ABSENT when `besideEachOther` is true, because then the parts ARE beside each other.
   */
  drawnAcrossTheWholeBox?: string[]
  /**
   * Who decided the proportions. See `RoomPlan.chosenBy` in src/shared/beside.ts for the three.
   * Absent when `besideEachOther` is false.
   */
  chosenBy?: RoomPlan['chosenBy']
  /**
   * WHAT THE REPORT ASKED FOR, IN THE SPELLING IT USED: "60/40", "3:2", "60%/40%". Absent when the
   * report asked for nothing, when Mole Office chose, and for a composition whose parts this reader
   * is not all shown.
   *
   * IT IS NOT THE SHARES SAID AGAIN. The shares under `parts` are the same proportion reduced to
   * whole numbers, so 60/40 and 3:2 both come out as 3 and 2 and neither can say which was written.
   * This is what makes the reducing lossless, and it is why `sentence` can quote the author.
   */
  askedAs?: string
  /** The parts this reader IS shown, beside each other. Absent when `besideEachOther` is false. */
  parts?: PartPlanned[]
  /**
   * Wider than this many rem, every part is drawn at exactly the share it asked for. IN REM, and
   * the gaps between the parts are not counted in it: the gap is a token whose pixels depend on the
   * reader's density setting, so a threshold in pixels would be right on one screen and wrong on
   * the next. Absent when `besideEachOther` is false.
   */
  exactAboveRem?: number
  /**
   * Narrower than this many rem, the parts are drawn one under another. In rem, gaps not counted.
   * Absent when `besideEachOther` is false.
   */
  stackBelowRem?: number
  /** How many gaps sit between the parts. Absent when `besideEachOther` is false. */
  gaps?: number
  /** What happens to what was asked for, in one plain sentence. */
  sentence: string
}

/** The same composition with a width supplied: what would actually be drawn, and what was refused. */
export interface CompositionDrawn extends CompositionPlanned {
  /**
   * HOW WIDE THE BOX THIS COMPOSITION IS DRAWN IN IS, in pixels, which is NOT the width of the
   * report for a composition nested inside something that divides its width. Null when nothing
   * here worked it out, which is a composition inside a `grid` block and nothing else.
   */
  boxPx: number | null
  /**
   * What each part is drawn at, beside each other, in pixels. `null` means there is not room for
   * them side by side at this width and they are drawn one under another.
   *
   * ABSENT, rather than null, WHEN `boxPx` IS NULL. Nobody worked out how wide this box is, so
   * nobody worked out what is drawn in it, and that is a different answer from "they are drawn one
   * under another".
   */
  across?: { regionId: string; px: number }[] | null
  /**
   * WHAT IS DRAWN, AS PROPORTIONS OF THE ROW: "60/40", "74/26". Whole numbers adding up to 100.
   *
   * IT IS `across` READ A SECOND WAY, ON PURPOSE, and it is here so it can be read against
   * `askedAs` in one glance. Absent when the parts are drawn one under another, and absent when
   * `boxPx` is null, because in neither case is there a row divided into anything.
   */
  drawnAs?: string
  /**
   * PREFERENCES WHOSE DRAWN RESULT IS WHAT WAS ASKED FOR. Absent when `boxPx` is null.
   *
   * THAT IS THE WHOLE MEANING OF THE WORD, and it is the same meaning for a share and for a reading
   * measure. Anything else is in `unhonoured` with the reason. It used to mean two different things
   * in the two cases: a share was honoured when the part was drawn at the share it asked for, and a
   * reading measure was honoured whenever the engine had not overridden it outright — so a `wide`
   * measure in a 573 pixel column, where the writing fills its column and the stated 60rem maximum
   * does nothing at all, came back honoured, while a `0.4` measure in the same column, where the
   * writing also fills its column, came back unhonoured. Same drawn result, opposite words.
   */
  honoured?: string[]
  /** Preferences it could not, each naming the part, what was asked, and why it was not given. */
  unhonoured?: LayoutReport['unhonoured']
}

/**
 * One composition as this file works with it, FOR ONE READER.
 *
 * `row` is null when audience filtering left fewer than two parts for this reader. There is then
 * no arrangement to plan and nothing to be worth anything against, so nothing here invents one.
 */
interface Composition {
  regionId: string
  partsAre: CompositionPlanned['partsAre']
  /** The parts this reader is not shown, by region id, in the order they were written. */
  notShown: string[]
  /** The parts this reader IS shown, by region id, in the order they were written. */
  shown: string[]
  /** The row this reader is drawn, or null when fewer than two parts are left for them. */
  row: { plan: RoomPlan; asked: PartAsked[] } | null
}

// ---------------------------------------------------------------------------- reading the record

/**
 * THE STORED OBJECT A REGION ID NAMES, or null when the path does not reach one.
 *
 * A part's region id is a path — `data.blocks[#b-beside].parts[#p-writing]` — and `regionsOf`
 * builds it from the same stored arrays this walks back down. `[#id]` steps are resolved through
 * `byId`, the same function the change log uses, so an array whose entries are identified is
 * addressed by identity here exactly as it is everywhere else.
 */
function storedAt(record: PanelRecord, path: string): Record<string, unknown> | null {
  let here: unknown = { data: record.data }
  for (const step of stepsOfPath(path)) {
    if (Array.isArray(here)) {
      const identified = byId(here)
      if (identified === null) return null
      const next = identified.get(step)
      if (next === undefined) return null
      here = next
      continue
    }
    if (typeof here !== 'object' || here === null) return null
    here = (here as Record<string, unknown>)[step]
  }
  if (typeof here !== 'object' || here === null || Array.isArray(here)) return null
  return here as Record<string, unknown>
}

/**
 * EVERY COMPOSITION IN ONE RECORD, PLANNED. Empty when the record holds none.
 *
 * A PART WHOSE STORED FORM CANNOT BE FOUND THROWS RATHER THAN BEING TREATED AS SILENT. The region
 * tree is derived from the same stored blocks, so a part region with nothing behind it means the
 * two walks have come apart — and the quiet version of that failure is a part reported as having
 * asked for nothing when it asked for 9, which is the write response lying about the write.
 */
export function compositionsIn(record: PanelRecord, reader: Reader): CompositionPlanned[] {
  return plansIn(record, reader).map(described)
}

/**
 * WHAT ONE REGION IS AS A COMPOSITION, or null when it is not one.
 *
 * TWO STORED BLOCKS PUT THINGS SIDE BY SIDE AND BOTH ARE ANSWERED HERE. A `beside` block is a row
 * whose parts may be worth different amounts because an Agent said so; a `columns` block is a row
 * whose columns are all worth the same. They fold to one arrangement in the stylesheet and go
 * through one engine, so one of them being answered here and the other not was the route
 * under-reporting what a report draws side by side. Measured on report ulbs6FHMndo2 on 29 August
 * 2026: ten rows drawn side by side, nine reported.
 *
 * A COLUMN IS NOT A REGION, AND ITS ID IS NOT A REGION ID. `regionsOf` names no region for a column
 * — the columns of a `columns` block are a bare array of arrays with nothing to hang an id on — so
 * the id reported for one is its stored path, from `columnPath` in src/shared/regions.ts, which is
 * the same function the region ids of the blocks inside it are built from. `partsAre` on the answer
 * says which of the two a caller is looking at, so nothing has to read the shape of an id to find
 * out whether it can be pointed at.
 */
function compositionOf(record: PanelRecord, region: Region, reader: Reader): Composition | null {
  if (region.role === 'beside') {
    // THE SAME FILTER THE RENDERER APPLIES, AND IT IS APPLIED FIRST. `SummaryBlocks.tsx` keeps a
    // part when at least one of that part's OWN top-level blocks is one this reader is shown, and
    // it does not look inside those blocks. Anything else here would be a second opinion about
    // what is on the screen.
    const all = region.children.filter((part) => part.role === 'besidePart')
    const shown = all.filter((part) => partIsShown(record, part, reader))
    const notShown = all.filter((part) => !shown.includes(part)).map((part) => part.id)

    // FEWER THAN TWO PARTS IS NOT A COMPOSITION, and the renderer says the same thing in the same
    // words: it draws what is left straight into the box its parent gives it.
    if (shown.length < 2) {
      return { regionId: region.id, partsAre: 'regions', notShown, shown: shown.map((part) => part.id), row: null }
    }
    const asked: PartAsked[] = shown.map((part) => askedOf(record, part))
    // THE REPORT'S OWN SPELLING OF THE PROPORTION, so the answer quotes what was asked rather than
    // what it was reduced to. It is the stored `proportions` and nothing is derived from it: the
    // shares on the parts are what the arithmetic reads, and this is the sentence beside them.
    //
    // NULL WHEN THE ROW WAS FILTERED. A composition whose parts this reader is not all shown is no
    // longer the row the report asked about — "60/40" names two parts and one of them is not on
    // this screen — so the spelling is dropped rather than quoted at a row it is not about.
    const storedRow = storedAt(record, region.id)
    const spelling = storedRow === null ? undefined : storedRow['proportions']
    const askedAs = typeof spelling === 'string' && shown.length === all.length ? spelling : null
    return {
      regionId: region.id,
      partsAre: 'regions',
      notShown,
      shown: shown.map((part) => part.id),
      row: { plan: roomFor(region.id, asked, askedAs), asked },
    }
  }
  if (region.role !== 'columns') return null
  const stored = storedAt(record, region.id)
  const held = stored === null ? null : stored['columns']
  if (!Array.isArray(held)) {
    throw new Error(
      `the report holds a comparison at ${region.id} that its own stored blocks do not, so how many columns it ` +
        'draws cannot be read',
    )
  }
  // WHAT EACH COLUMN HOLDS, ASKED THE SAME WAY THE RENDERER ASKS IT. `leastNeededByBlocks` is the
  // one answer to how narrow a run of blocks may be drawn, and the renderer's `columns` arm calls
  // it on the same array. Nothing about a column is asked for, so nothing is passed as a share:
  // `equalColumns` gives every column the 1 the stylesheet draws.
  const columns = (held as SummaryBlock[][]).map((blocks, n) => ({
    id: columnPath(region.id, n),
    least: leastNeededByBlocks(blocks),
  }))
  // A COMPARISON IS NEVER FILTERED BY AUDIENCE. The renderer's `columns` arm draws every column
  // whoever is reading — a column is a bare array with nowhere to write an audience and no rule
  // that removes one — so every column is shown and there is nothing to leave out here.
  return {
    regionId: region.id,
    partsAre: 'columns',
    notShown: [],
    shown: columns.map((c) => c.id),
    row: {
      plan: equalColumns(region.id, columns),
      asked: columns.map((c) => ({ id: c.id, least: c.least })),
    },
  }
}

/**
 * IS THIS READER SHOWN THIS PART AT ALL?
 *
 * The rule is `readerSees` in src/shared/audience.ts, asked of the part's own top-level blocks, and
 * this file states no part of it. A part with no stored blocks answers no, the same way an empty
 * `some` does in the renderer.
 */
function partIsShown(record: PanelRecord, part: Region, reader: Reader): boolean {
  const stored = storedAt(record, part.id)
  if (stored === null) {
    throw new Error(
      `the report holds a part at ${part.id} that its own stored blocks do not, so who is shown it cannot be read`,
    )
  }
  const blocks = stored['blocks']
  if (!Array.isArray(blocks)) return false
  return (blocks as SummaryBlock[]).some((block) => readerSees(block.audience, reader))
}

/**
 * EVERY COMPOSITION IN ONE RECORD, IN THE ORDER THEY ARE WRITTEN, WITH NO WIDTH ANYWHERE.
 *
 * `flatten` walks the region tree from the top down, so this is the same order the width-resolving
 * walk below produces and the two answers line up entry for entry.
 */
function plansIn(record: PanelRecord, reader: Reader): Composition[] {
  const root = rootRegionOf(record)
  if (root === null) return []
  const out: Composition[] = []
  for (const region of flatten(root)) {
    const composition = compositionOf(record, region, reader)
    if (composition !== null) out.push(composition)
  }
  return out
}

/** The one region tree of a record's stored blocks, or null when the kind holds none. */
function rootRegionOf(record: PanelRecord): Region | null {
  const field = blocksFieldOf(record.kind)
  if (field === null) return null
  const held = record.data[field]
  if (!Array.isArray(held)) return null
  return regionsOf({ field, blocks: held as SummaryBlock[] })
}

/** One plan as the answer a caller reads. Everything in it is on the plan or on what was asked. */
function described(composition: Composition): CompositionPlanned {
  const { regionId, partsAre, notShown, shown, row } = composition
  const common = { regionId, partsAre, notShownToThisReader: notShown }

  // NOTHING IS BESIDE ANYTHING FOR THIS READER. The five keys that describe a row are absent
  // rather than filled in, and the sentence says what is drawn in its place.
  if (row === null) {
    return {
      ...common,
      besideEachOther: false,
      drawnAcrossTheWholeBox: shown,
      sentence: sayWhatThisReaderGets(notShown.length + shown.length, notShown.length, shown.length),
    }
  }

  const { plan, asked } = row
  return {
    ...common,
    besideEachOther: true,
    chosenBy: plan.chosenBy,
    ...(plan.askedAs === null ? {} : { askedAs: plan.askedAs }),
    parts: plan.parts.map((part, i) => ({
      regionId: part.id,
      holds: part.least,
      asked: asked[i]?.share ?? null,
      share: part.share,
      ...(part.measure === undefined ? {} : { measure: part.measure }),
    })),
    exactAboveRem: plan.exactAboveRem,
    stackBelowRem: plan.stackBelowRem,
    gaps: plan.gaps,
    sentence:
      notShown.length === 0
        ? sayWhatHappens(plan)
        : `${sayWhatHappens(plan)} ${String(notShown.length)} of its ${String(notShown.length + plan.parts.length)} ` +
          'parts are written for developers, so this reader is not shown them and they are not counted in the ' +
          'shares above.',
  }
}

/**
 * WHAT A READER IS DRAWN WHERE FEWER THAN TWO PARTS ARE LEFT FOR THEM, in one plain sentence.
 *
 * It is a sentence and not a repetition of the numbers beside it because a caller reading the
 * answer aloud needs to know what happened, and "besideEachOther: false" is a field rather than an
 * explanation.
 */
function sayWhatThisReaderGets(parts: number, hidden: number, left: number): string {
  const of = `${String(hidden)} of its ${String(parts)} parts ${hidden === 1 ? 'is' : 'are'} written for developers`
  if (left === 0) {
    return `Every one of this composition's ${String(parts)} parts is written for developers, so this reader is shown none of it and nothing is drawn here at all.`
  }
  return (
    `${of}, so this reader is shown ${String(left)} of them — fewer than two, which is not a composition. ` +
    'What is left is drawn as ordinary blocks across the whole box, with no row and no share anywhere.'
  )
}

/** One part as it was written, with what it holds read off the region tree. */
function askedOf(record: PanelRecord, part: Region): PartAsked {
  const stored = storedAt(record, part.id)
  if (stored === null) {
    throw new Error(
      `the report holds a part at ${part.id} that its own stored blocks do not, so what it asked for cannot be read`,
    )
  }
  const share = stored['share']
  const measure = stored['measure']
  return {
    id: part.id,
    least: leastNeededBy(part),
    ...(typeof share === 'number' ? { share } : {}),
    ...(typeof measure === 'string' || typeof measure === 'number' ? { measure: measure as MeasureAsked } : {}),
  }
}

// ---------------------------------------------------------------- what is drawn, at one width

/**
 * EVERY COMPOSITION IN ONE RECORD, EACH ONE RESOLVED AGAINST THE BOX IT IS ACTUALLY IN.
 *
 * `widthPx` is the width of the box the REPORT is drawn in, `gutterPx` the gap between parts,
 * `remPx` the reader's root font size and `readPx` how wide the `narrow` reading measure comes
 * out. All four are the caller's to supply: guessing any of them would answer about a screen
 * nobody has.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS WALKS THE NESTING, AND WHAT IT USED TO DO INSTEAD
 * ---------------------------------------------------------------------------------------
 *
 * UNTIL 29 AUGUST 2026 IT GAVE EVERY COMPOSITION IN THE REPORT THE ONE WIDTH IT WAS HANDED. Three
 * reviewers reported the same consequence independently, on their own fixture: the route said a
 * nested composition drew 859.5|286.5 and listed it under `honoured`, and the browser drew 395|160
 * with the picture pinned at its floor.
 *
 * MEASURED AGAIN HERE, on the fixture in tests/the-box-each-composition-is-drawn-in.test.ts, in
 * Chromium on 29 August 2026 at a 1440 pixel window with an 1164 pixel report body. THE PIXELS
 * BELOW WERE MEASURED WHILE A PICTURE'S FLOOR WAS 10rem; it was raised later the same day and the
 * new value is in `LEAST_REM` in src/shared/beside.ts, which is the only place it is written. The
 * fault these numbers describe, and the walk that fixes it, are the same at any floor. Two of the
 * nine compositions in the fixture are the two shapes of the fault:
 *
 *   · `b-inner` asks for 9 to 1 and sits inside a part 687.6 pixels wide. The browser draws it
 *     509.59|160, the picture held at the 10rem floor. Without the walk the route answered about
 *     the report's own 1164 and said 986|160 in a box of 1164 — wrong by 476 pixels on the writing,
 *     and wrong about which box it was in.
 *   · `b-flipinner` asks for 3 to 2 and sits inside a part 458.41 pixels wide. There is not room
 *     there for a 20rem floor beside a 10rem floor, so the browser draws the two parts ONE UNDER
 *     ANOTHER. Without the walk the route said 687.6|458.4, side by side, and put the composition
 *     in `honoured`.
 *
 * THE SECOND ONE REPORTED AS HONOURED EXACTLY THE PREFERENCE THE BROWSER REFUSES, which is the
 * owner's first acceptance test — "state a preference the layout must refuse, and check that it
 * refuses it for a stated reason" — inverted.
 *
 * SO EACH COMPOSITION IS RESOLVED AGAINST ITS OWN BOX, by walking down the region tree the same way
 * the browser walks down the markup: a composition's answer decides how wide each of its parts is,
 * and a composition inside one of those parts is asked about that width.
 *
 * THE THREE THINGS A BOX CAN BE, and there are only three because the stylesheet has only three:
 *
 *   · a `beside` block's part, or a `columns` block's column — as wide as this function just said
 *     it is drawn, or the whole box when the row is drawn one under another;
 *   · a `grid` block's cell — NOT WORKED OUT. A grid wraps its cells at a width only a browser
 *     knows, so a composition inside one comes back with `boxPx: null` and no drawn answer at all.
 *     A guess there would be wrong by exactly the amount the grid divided by and would look like a
 *     measurement;
 *   · anything else — a section, a tab, a callout, the report body itself — which gives what it
 *     holds the whole of its own width. Measured in Chromium on 29 August 2026: a section, a
 *     section body and a tab panel each declare no padding of their own and draw their children at
 *     the width of the box they stand in.
 */
export function compositionsAt(
  record: PanelRecord,
  widthPx: number,
  gutterPx: number,
  remPx: number,
  readPx: number,
  reader: Reader,
): CompositionDrawn[] {
  const out: CompositionDrawn[] = []
  const root = rootRegionOf(record)
  if (root !== null) inBoxesOf(record, root, widthPx, { gutterPx, remPx, readPx, reader }, out, new Map(), new Set())
  return out
}

/**
 * The facts every step of the walk needs, carried together rather than one by one: three about the
 * screen, and which of the three readers is asking.
 */
interface Screen {
  gutterPx: number
  remPx: number
  readPx: number
  reader: Reader
}

/**
 * ONE STEP OF THE WALK: answer about this region if it is a composition, then hand each child the
 * width of the box that child stands in.
 *
 * `columnPx` collects, as it goes, how wide the box each region stands in is drawn. Every region
 * inherits its parent's entry unless the parent divides its width, so the second answer below —
 * every block that stated a reading measure of its own — reads its column out of the same walk
 * rather than working the nesting out a second time.
 */
function inBoxesOf(
  record: PanelRecord,
  region: Region,
  boxPx: number | null,
  screen: Screen,
  out: CompositionDrawn[],
  columnPx: Map<string, number | null>,
  hidden: Set<string>,
): void {
  columnPx.set(region.id, boxPx)
  const composition = compositionOf(record, region, screen.reader)

  // NOT A COMPOSITION. A grid divides its width in a way only a browser knows; everything else
  // gives what it holds the whole of its own width.
  if (composition === null) {
    const inner = region.role === 'grid' ? null : boxPx
    for (const child of region.children) {
      markHidden(record, child, screen.reader, hidden)
      inBoxesOf(record, child, inner, screen, out, columnPx, hidden)
    }
    return
  }

  // A COMPOSITION IN A BOX NOBODY WORKED OUT. It is still reported — a caller asking what a report
  // holds must be told about it — with no drawn widths and no two lists, because there is no width
  // to draw it at. `boxPx: null` and the three absent keys are the same answer said twice, and the
  // absence is what stops a reader taking `across: null` for "the parts are one under another".
  if (boxPx === null) {
    out.push({ ...described(composition), boxPx: null })
    for (const child of region.children) {
      markHidden(record, child, screen.reader, hidden)
      inBoxesOf(record, child, null, screen, out, columnPx, hidden)
    }
    return
  }

  // NOTHING IS BESIDE ANYTHING FOR THIS READER. What is left is drawn as ordinary blocks across the
  // whole box, so `across` says that and every part still shown keeps the box's own width. The
  // shares the report asked for are named in `unhonoured`, because the report did ask and this
  // reader is not given it.
  if (composition.row === null) {
    out.push({
      ...described(composition),
      boxPx,
      across: composition.shown.map((regionId) => ({ regionId, px: boxPx })),
      honoured: [],
      unhonoured: [
        {
          target: composition.regionId,
          hint: `${String(composition.notShown.length + composition.shown.length)} parts beside each other`,
          because:
            `this reader is not shown ${String(composition.notShown.length)} of them, so fewer than two are ` +
            'left and what remains is drawn across the whole box rather than beside anything',
        },
      ],
    })
    for (const child of region.children) {
      markHidden(record, child, screen.reader, hidden)
      inBoxesOf(record, child, boxPx, screen, out, columnPx, hidden)
    }
    return
  }

  const drawing = drawnAt(composition.row.plan, boxPx, screen.gutterPx, screen.remPx, screen.readPx)
  out.push({
    ...described(composition),
    boxPx,
    across: drawing.across === null ? null : drawing.across.map((part) => ({ regionId: part.id, px: part.px })),
    // WHAT IS ACTUALLY DRAWN, AS PROPORTIONS, so it can be read straight against `askedAs` above.
    // "You asked for 60/40 and this is drawn 74/26" is one sentence a person can check; two lists
    // of pixels are not. Absent when the parts are one under another, because there is then no
    // division of a row to state — `across: null` is the answer and this would repeat it.
    ...(drawing.across === null ? {} : { drawnAs: drawnAs(drawing.across) }),
    honoured: drawing.report.honoured,
    unhonoured: drawing.report.unhonoured,
  })

  // EVERY PART'S OWN WIDTH, AND THE WHOLE BOX WHEN THE ROW IS DRAWN ONE UNDER ANOTHER.
  const drawnPart = new Map<string, number>()
  if (drawing.across !== null) for (const part of drawing.across) drawnPart.set(part.id, part.px)
  for (const child of region.children) {
    markHidden(record, child, screen.reader, hidden)
    inBoxesOf(record, child, boxOf(child, composition, drawnPart, boxPx), screen, out, columnPx, hidden)
  }
}

/**
 * WRITE DOWN THAT THIS READER IS NOT SHOWN THIS REGION, so the second answer can leave it out.
 *
 * A part of a `beside` block this reader is not shown is already known from the filter above; this
 * is the other case, a stored BLOCK carrying `audience`. A marked block takes everything under it
 * with it, which is why a region whose parent is already hidden is hidden too and nothing looks at
 * its own `audience` a second time.
 */
function markHidden(record: PanelRecord, region: Region, reader: Reader, hidden: Set<string>): void {
  const stored = storedAt(record, region.id)
  const audience = stored === null ? undefined : stored['audience']
  const seen =
    (audience === 'everyone' || audience === 'developers' ? readerSees(audience, reader) : true) &&
    !isUnder(region.id, hidden)
  if (!seen) hidden.add(region.id)
}

/**
 * Whether this region id is one of, or inside one of, the regions already found hidden.
 *
 * WHAT COUNTS AS INSIDE IS NOT DECIDED HERE. It is `isInsideRegionId` in src/shared/regions.ts,
 * beside the grammar it reads, because this file used to answer that question twice — here and in
 * `boxOf` below — and two hand-written readings of one grammar is this repository's recurring
 * defect. This is now only the loop.
 */
function isUnder(regionId: string, hidden: Set<string>): boolean {
  for (const one of hidden) {
    if (isInsideRegionId(regionId, one)) return true
  }
  return false
}

/**
 * HOW WIDE THE BOX ONE CHILD OF A COMPOSITION IS DRAWN.
 *
 * A part of a `beside` block is a region and is named by its own id. A column of a comparison is
 * not a region, so the blocks inside it hang straight off the comparison and which column they are
 * in is read off the front of their path — which is `columnPath`, the same string the region ids
 * were built from.
 */
function boxOf(
  child: Region,
  composition: Composition,
  drawnPart: Map<string, number>,
  boxPx: number,
): number {
  if (composition.partsAre === 'regions') return drawnPart.get(child.id) ?? boxPx
  for (const part of composition.row?.plan.parts ?? []) {
    // THE SAME QUESTION `isUnder` ABOVE ASKS, ASKED THROUGH THE SAME FUNCTION. A column's path is
    // not a region id, but it is spelled by `columnPath` in the same grammar and the blocks inside
    // it extend it by the same separators, so one reading answers for both.
    if (isInsideRegionId(child.id, part.id)) {
      return drawnPart.get(part.id) ?? boxPx
    }
  }
  return boxPx
}

// ---------------------------------------------------------------------------- a block's own measure

/**
 * ONE BLOCK THAT SAID HOW WIDE THE WRITING INSIDE IT READS, AND WHAT BECAME OF THAT.
 *
 * This is layer 4 written on a block rather than on a part of a composition, which is the case the
 * owner described: "For a single prose part, however, the Agent authoring the Report may optionally
 * express a prose-width / whitespace preference." A measure written on a PART is reported through
 * `CompositionDrawn` above instead, with the part's own drawn width, because a part's column is
 * worked out by the share arithmetic and a block's is not.
 */
export interface MeasureDrawn {
  /** The region id of the block that stated it, which is what a comment or a screenshot names it by. */
  regionId: string
  /** What it asked for: one of the four preset names, or a ratio of its column. */
  measure: MeasureAsked
  /**
   * How wide the column this block stands in is drawn, in pixels, or null when nothing here worked
   * that out — which is a block inside a `grid` block and nothing else.
   */
  columnPx: number | null
  /**
   * How wide the writing in this block is drawn, in pixels. Absent when the column is not known.
   */
  drawnPx?: number
  /**
   * WHY THE WRITING DOES NOT READ AT WHAT WAS ASKED, in one plain sentence, or null when it does.
   *
   * THE KEY IS ABSENT WHEN THE COLUMN IS NOT KNOWN, and that is a third answer rather than a tidier
   * way of writing the second. Present and null means somebody worked it out and the answer was
   * yes; absent means nobody worked it out here. A route that returned null for both would be
   * saying "it was honoured" about a block nothing had looked at.
   */
  because?: string | null
}

/**
 * EVERY BLOCK IN ONE RECORD THAT STATED A MEASURE, AT ONE WIDTH. Empty when none did.
 *
 * A BLOCK IS TOLD FROM EVERYTHING ELSE BY ITS STORED `type`. `regionsOf` names regions for things
 * smaller than a block too — a paragraph, a bullet, a heading inside a passage — and for a part of a
 * composition, which is not a block and carries no `type`. Only a stored block has one, so reading
 * for it is the same walk the region tree already did rather than a second reading of the path
 * grammar.
 *
 * THE COLUMN COMES FROM THE SAME WALK THE COMPOSITIONS COME FROM. Until 29 August 2026 this said
 * `columnPx: null` for every block inside a `beside`, `columns` or `grid` block, because nothing
 * here had worked out how wide those divide their width. The walk above now does, for two of the
 * three, so a block inside a part of a composition is answered about the part's own drawn width.
 * A grid is still not worked out and still says so.
 */
export function measuresAt(
  record: PanelRecord,
  widthPx: number,
  gutterPx: number,
  remPx: number,
  readPx: number,
  reader: Reader,
): MeasureDrawn[] {
  const root = rootRegionOf(record)
  if (root === null) return []
  const columnPx = new Map<string, number | null>()
  const hidden = new Set<string>()
  inBoxesOf(record, root, widthPx, { gutterPx, remPx, readPx, reader }, [], columnPx, hidden)

  const out: MeasureDrawn[] = []
  for (const region of flatten(root)) {
    // A BLOCK THIS READER IS NOT SHOWN IS NOT DRAWN, so there is no width at which its writing
    // reads and nothing here to report. Reporting one would be answering about a box that is not
    // on this reader's screen, which is the fault this whole reply was corrected for.
    if (isUnder(region.id, hidden)) continue
    const stored = storedAt(record, region.id)
    if (stored === null || typeof stored['type'] !== 'string') continue
    const measure = stored['measure']
    if (typeof measure !== 'string' && typeof measure !== 'number') continue
    const column = columnPx.get(region.id) ?? null
    if (column === null) {
      out.push({ regionId: region.id, measure: measure as MeasureAsked, columnPx: null })
      continue
    }
    const outcome = measureDrawn(measure as MeasureAsked, column, remPx, readPx)
    out.push({
      regionId: region.id,
      measure: measure as MeasureAsked,
      columnPx: column,
      drawnPx: outcome.drawnPx,
      because: outcome.because,
    })
  }
  return out
}
