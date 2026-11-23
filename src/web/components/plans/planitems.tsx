// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { isARecordId, TWELVE_ID_CHARACTERS } from '@shared/messages.ts'
import { en } from '@shared/words/en.ts'
/**
 * THE ITEMS IN A PLAN, AND THE CONTROLS THAT ACT ON ONE OF THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS, AND WHY IT IS NOT INSIDE THE TABLE
 * ---------------------------------------------------------------------------------------
 *
 * Two surfaces draw the same thing: the dense planning table, and the pane beside the writing box.
 * Both list the items a plan holds, at their real depth, saying which are real work and what each
 * one has. If each drew its own, the two would drift — that is the defect CLAUDE.md names, and it
 * is exactly how the phone labels on the records page came apart from the headings above them.
 *
 * So the model and the row controls live here and both surfaces read them. What each surface keeps
 * is its own ARRANGEMENT: the table lays the items out in columns, the pane lays them out in a list.
 *
 * ---------------------------------------------------------------------------------------
 * THE DOCUMENT IS THE STORE. EVERY WRITE HERE IS A WRITE TO A LINE OF IT
 * ---------------------------------------------------------------------------------------
 *
 * Editing the words of an item rewrites that line KEEPING ITS MARKER, so a heading stays a heading
 * and a bullet stays a bullet. Ticking a plain bullet writes a tick box into the line, in the text,
 * where the writing view will show it. Nothing on these surfaces stores a level, a parent, a tick
 * or a set of words anywhere but in the line itself, which is what makes the document and the table
 * two readings of one thing rather than two stores that have to agree.
 *
 * THE MARKER IS NEVER RE-PARSED HERE. `src/shared/plandoc.ts` reads a line into a kind and its
 * words, and the words are always the TAIL of the line, so the marker is what is left when the
 * words are taken off the end. A second set of regular expressions in this file would be a second
 * answer to "what is this line", and a heading pattern changed in one place would silently rewrite
 * the wrong characters here.
 *
 * ---------------------------------------------------------------------------------------
 * A ROW OF THE WRITER'S OWN PIPE TABLE IS AN ITEM TOO
 * ---------------------------------------------------------------------------------------
 *
 * A plan holding a pipe table is holding a list of things, one per row. Those rows are items: they
 * sit under the nearest heading above the table, one level deeper, which is the same rule a bullet
 * follows. The FIRST cell of the row is the item's words. The remaining heading cells become
 * columns of the writer's own, and nothing asks them to declare what any of them means.
 *
 * `src/shared/planoutline.ts` is still the one place a depth comes from. It says nothing about pipe
 * tables — they are not items in the outline — so their depth is read off the heading item it
 * already produced, and never worked out again from the hashes.
 *
 * ---------------------------------------------------------------------------------------
 * ADDING AN ITEM IS WRITING A NEW LINE, AT A PLACE THE READER CAN SEE
 * ---------------------------------------------------------------------------------------
 *
 * A new item is new TEXT in the document, one line, written directly after the line the reader
 * pressed on. That is where a text editor puts it, and it is the only place a person can predict
 * without being told. `newItemAfter` below decides the characters that go before the words, and the
 * draft row draws those characters, so what will be written is on screen before it is written.
 *
 * NOTHING IS WRITTEN UNTIL WORDS ARE TYPED. Pressing the plus makes a draft row in the browser and
 * no line anywhere; the write happens when the reader adds it. Writing an empty bullet into
 * somebody's plan because they pressed a button would be Mole Office putting characters in a document
 * that nobody typed, and what the writer typed is what is stored is the rule this whole editor rests on.
 */

import { PlanUndoPress, changeWorkWithUndo } from './PlanUndo.tsx'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EffortReading } from '@shared/envelope.ts'
import { declaredTypeOf, KIND_SPECS } from '@shared/kinds.ts'
import { blocksOf } from '@shared/plandoc.ts'
import { parsePlanLine, writePlanLine, type PlanningKey, type PlanningValue } from '@shared/planline.ts'
import { flattenOutline, outlineOf, type OutlineItem } from '@shared/planoutline.ts'
import { progressOf } from '@shared/work.ts'
// WHERE THE WORDS DRAWN HERE SIT IN THE STORED LINE. The three attributes that make an element
// addressable are declared once in src/shared/targets.ts and never written out by hand.
import { textAttributes } from '@shared/targets.ts'
import type { TextOrigin } from '@shared/inline.ts'
import {
  dayKey,
  hoursReadingSaid,
  parsePeriod,
  readHoursBox,
  readPeriodWords,
  readTimeWords,
  timeWordsSaid,
  type Grain,
  type HoursBoxRead,
  type Period,
} from '@shared/planning.ts'
import type { RecordKind } from '@shared/types.ts'
import {
  api,
  ApiError,
  errorMessage,
  ESTIMATE_FIELD,
  moleOfficeRequest,
  type LineFiled,
  type PlanLine,
  type PlanLineWithWork,
  type VersionToWriteOn,
  type WorkListReply,
  type WorkRow,
} from '../../api.ts'
/** Same reason as every other type here: the shape is the server's declaration, not a copy of it. */
import { useProjects, type ProjectRow as ProjectListRow } from '../../lib/projectlist.ts'
import { useInspect, useMode } from '../../lib/mode.ts'
// THE ONE FUNCTION IN THE BROWSER THAT NAMES A PROJECT. It is imported from src/web/lib/projects.ts
// rather than from components/projects.tsx because that file pulls in React and the whole HTTP
// client; the lib module is the React-free half and exists for exactly this.
import { planProjectName as projectName } from './PlanWords.ts'
import { holdsMaths, lineWithMaths, wordsWithMaths } from './PlanMaths.tsx'
import { kindWord, stateWord } from '../../lib/words.ts'
import { currentWorkspace } from '../../lib/workspace.ts'
// WHAT A PERIOD IS CALLED IN ORDINARY WORDS, from the one function in this app that says so. The
// schedule and the plan page already name a week with `periodSaid`, so this table naming it a second
// way would be one fact worked out in two places. See `PeriodInWords` below.
//
// `endingWordsOf` IS READ FROM THE SCHEDULE FOR THE SAME REASON. It answers "which of this kind's
// state words mean the work is finished", out of the declaration `POST /api/records` validates
// against. Working that out a second time here is how a kind that gains a word gains it on one
// surface only. See `TickAgainstState`.
import { endingWordsOf, periodSaid, periodsInWords } from '../Planning.tsx'
import { recordPath, RouteLink } from '../router.tsx'
import {
  Absence,
  Btn,
  ErrorNote,
  OriginMark,
  StoredState,
  Tag,
  UnmarkedRowsNote,
  useAsync,
  type AsyncState,
} from '../ui.tsx'

// ============================================================================ the model

/** Which sort of line an item was written as. */
export type PlanItemKind = 'heading' | 'bullet' | 'tickbox' | 'numbered' | 'tableRow'

/** One cell of a row of the writer's own pipe table. */
export interface PlanItemCell {
  /** The heading the writer typed above this cell. */
  heading: string
  value: string
  /** Which cell of the stored pipe row this is, counting from zero. */
  at: number
}

/** One item of a plan: a heading, a bullet, a tick box, a numbered item or a pipe-table row. */
export interface PlanItem {
  /** Unique on the page. It is the stored line's id, because every item is one stored line. */
  key: string
  /** The stored line and the record it names, exactly as the server sent them. */
  entry: PlanLineWithWork
  kind: PlanItemKind
  /** How many hashes a heading was written with. Null for everything else. */
  level: number | null
  /**
   * The digits a numbered item was written with, exactly as typed. Null for everything else.
   *
   * It is here so that adding an item after "3. find bugs" can write "4. " rather than a second
   * "3. ". The digits come from `src/shared/plandoc.ts`, which already read them out of the line;
   * counting them out of the characters again here would be a second reader of the same fact.
   */
  number: string | null
  /** How deep it sits, worked out by src/shared/planoutline.ts. A top-level item is 0. */
  depth: number
  /** The words, with the hashes, the bullet, the number or the pipes taken off. */
  text: string
  /** The items it sits under, outermost first. */
  above: readonly { key: string; text: string }[]
  /**
   * Whether its tick box is ticked, or NULL when this kind of item cannot hold one.
   *
   * A bullet with no box reads as `false`: it has no tick, and ticking it writes one into the line.
   * A heading, a numbered item and a pipe row read as null, so no box is drawn on them at all —
   * `src/shared/plandoc.ts` does not read a box after a number, so writing one there would put
   * characters in the document that Mole Office would then not read back as a tick.
   */
  ticked: boolean | null
  /** The other cells of the writer's own pipe row. Empty for every other kind of item. */
  cells: readonly PlanItemCell[]
  /** Which cell of the stored pipe row holds the words. Null for every other kind of item. */
  wordsCell: number | null
}

/** What is in a plan besides its items, counted rather than dropped quietly. */
export interface NotItems {
  /** Empty lines. The spacing somebody typed. */
  blank: number
  /** Ordinary lines of prose: the writing between the items. */
  prose: number
  /** Lines Mole Office could not read. They are printed as typed in the document view. */
  unreadable: number
}

/** A plan read as items, with the columns the writer's own pipe tables ask for. */
export interface PlanItems {
  items: PlanItem[]
  /**
   * The headings of the writer's own pipe tables, in the order they first appear.
   *
   * The first heading of each table is NOT here, because its cells are the items' words and would
   * otherwise be printed twice on one row.
   */
  yourColumns: string[]
  notItems: NotItems
}

function refOf(item: OutlineItem): { key: string; text: string } {
  const id = item.lineIds[0]
  if (id === undefined) {
    throw new Error(t('g8.planitems.anOutlineItemWasBuiltFromNoLineAt'))
  }
  return { key: id, text: item.text }
}

/**
 * A plan's stored lines read as items.
 *
 * The blocks come from `blocksOf` and the depths from `outlineOf`, both of which the server used to
 * answer for the same plan. Nothing is re-parsed here.
 */
export function planItemsOf(entries: readonly PlanLineWithWork[]): PlanItems {
  const byId = new Map(entries.map((entry) => [entry.line.id, entry]))
  const blocks = blocksOf(entries.map((entry) => ({ id: entry.line.id, text: entry.line.text })))
  const flat = flattenOutline(outlineOf(blocks))

  const items: PlanItem[] = []
  const yourColumns: string[] = []
  const notItems: NotItems = { blank: 0, prose: 0, unreadable: 0 }
  /** The heading item the reader last passed, which is what a pipe table sits under. */
  let underHeading: { ref: { key: string; text: string }; depth: number; above: readonly { key: string; text: string }[] } | null =
    null
  let at = 0

  const entryFor = (id: string): PlanLineWithWork => {
    const entry = byId.get(id)
    if (entry === undefined) {
      throw new Error(
        t('g8.planitems.aBlockWasBuiltFromThePlanLineAnd', { value1: id }),
      )
    }
    return entry
  }

  for (const block of blocks) {
    if (block.kind === 'blank') {
      notItems.blank += 1
      continue
    }
    if (block.kind === 'paragraph') {
      notItems.prose += 1
      continue
    }
    if (block.kind === 'notUnderstood') {
      notItems.unreadable += block.lines.length
      continue
    }

    if (block.kind === 'table') {
      // The heading row and the row of dashes are furniture and are not items. Every other row is.
      for (const heading of block.heading.slice(1)) {
        if (!yourColumns.includes(heading)) yourColumns.push(heading)
      }
      block.rows.forEach((row, index) => {
        const line = block.lines[index + 2]
        if (line === undefined) {
          throw new Error(
            t('g8.planitems.aPipeTableCameBackWithMoreRowsThan'),
          )
        }
        items.push({
          key: line.id,
          entry: entryFor(line.id),
          kind: 'tableRow',
          level: null,
          number: null,
          depth: underHeading === null ? 0 : underHeading.depth + 1,
          text: row[0] ?? '',
          above: underHeading === null ? [] : [...underHeading.above, underHeading.ref],
          ticked: null,
          cells: block.heading
            .map((heading, cell) => ({ heading, value: row[cell] ?? '', at: cell }))
            .slice(1),
          wordsCell: 0,
        })
      })
      continue
    }

    // Everything left is an item the outline knows about, and the outline is walked in the same
    // order the blocks are, so the two lists line up one for one. That is an assumption about
    // another file, so it is checked rather than trusted.
    const flatItem = flat[at]
    at += 1
    const first = block.lines[0]
    if (flatItem === undefined || first === undefined || flatItem.item.lineIds[0] !== first.id) {
      throw new Error(
        t('g8.planitems.thePlanOutlineAndThePlanBlocksNoLonger'),
      )
    }
    const ref = refOf(flatItem.item)
    const above = flatItem.path.map(refOf)
    items.push({
      key: ref.key,
      entry: entryFor(ref.key),
      kind: block.kind,
      level: block.kind === 'heading' ? block.level : null,
      number: block.kind === 'numbered' ? block.number : null,
      depth: flatItem.item.depth,
      text: block.text,
      above,
      ticked: block.kind === 'tickbox' ? block.done : block.kind === 'bullet' ? false : null,
      cells: [],
      wordsCell: null,
    })
    if (block.kind === 'heading') underHeading = { ref, depth: flatItem.item.depth, above }
  }

  return { items, yourColumns, notItems }
}

/** Which items hold other items. Read off the items themselves, so it cannot disagree with them. */
export function parentKeysOf(items: readonly PlanItem[]): Set<string> {
  const parents = new Set<string>()
  for (const item of items) for (const above of item.above) parents.add(above.key)
  return parents
}

/**
 * EVERY ITEM WITH EVERYTHING WRITTEN UNDER IT, by key, worked out in one pass.
 *
 * A row's own key is first and its descendants follow. Picking a piece of work is picking the whole
 * of it, so the control on a row acts on this list rather than on the row alone, and the count of
 * how many are folded away under a row is read off the same list. One walk of `above`, so the two
 * cannot disagree about what is under a row.
 */
export function subtreesOf(items: readonly PlanItem[]): Map<string, string[]> {
  const under = new Map<string, string[]>()
  for (const item of items) under.set(item.key, [item.key])
  for (const item of items) {
    for (const above of item.above) under.get(above.key)?.push(item.key)
  }
  return under
}

/** How much of a list of rows is picked: none of it, some of it, or all of it. */
export type PickedShare = 'none' | 'some' | 'all'

/**
 * HOW MUCH OF ONE LIST OF ROWS IS PICKED, and it is the only place that question is answered.
 *
 * The control on a row asks it about that row and everything under it, and the control at the head
 * of the table asks it about every row. An empty list is `none`: there is nothing picked in it.
 */
export function shareOf(keys: readonly string[], picked: ReadonlySet<string>): PickedShare {
  let on = 0
  for (const key of keys) if (picked.has(key)) on += 1
  if (on === 0) return 'none'
  return on === keys.length ? 'all' : 'some'
}

/**
 * WHICH ROWS ARE PICKED AFTER ONE PRESS OF ONE PICK CONTROL, and it is the whole rule.
 *
 * PICKING A PARENT PICKS EVERYTHING UNDER IT AND LETTING IT GO LETS THEM ALL GO, because
 * acting on a large piece of work should not mean pressing every part of it in turn. A press
 * on a row whose subtree is only partly picked picks the rest, which is what a person means when
 * they press a control that is showing neither answer.
 *
 * ONE RULE FOR THE ROWS AND FOR THE HEAD OF THE COLUMN. The control at the top is handed every row
 * in the table and behaves exactly the same way, so "pick everything" and "let everything go" are
 * not a second rule that could come to disagree with this one.
 */
export function pickedAfter(keys: readonly string[], picked: ReadonlySet<string>): Set<string> {
  const next = new Set(picked)
  const off = shareOf(keys, picked) === 'all'
  for (const key of keys) {
    if (off) next.delete(key)
    else next.add(key)
  }
  return next
}

// ============================================================================ writing a line back

/** Everything of a line before its words: the hashes, the bullet, the number, the tick box. */
function markerOf(item: PlanItem): string {
  const raw = item.entry.line.text
  if (!raw.endsWith(item.text)) {
    throw new Error(
      t('g8.planitems.moleOfficeReadOutOfTheLineAndThose', { value1: item.text, value2: raw }),
    )
  }
  return raw.slice(0, raw.length - item.text.length)
}

/**
 * Where one cell of a stored pipe row starts and ends, in the characters of the line itself.
 *
 * IT ANSWERS RATHER THAN RAISING, because it now has two callers wanting opposite things from the
 * same reading. A write must stop and say why. A cell that is only saying WHERE its characters are
 * must draw itself and say nothing about where — the line Mole Office is holding now can be a newer line
 * than the row was drawn from, and "nobody can say" is a real answer there.
 *
 * SO IT HANDS BACK THE COUNT AND NOT A SENTENCE. The words the write raises are written where the
 * write raises them, exactly as before, and this stays a reading with no prose in it.
 */
function cellSpan(raw: string, at: number): { from: number; to: number } | { cells: number } {
  const bars: number[] = []
  for (let index = 0; index < raw.length; index += 1) if (raw[index] === '|') bars.push(index)
  const contentEnds = raw.trimEnd().length
  const trailing = bars.length > 0 && bars[bars.length - 1] === contentEnds - 1
  const count = trailing ? bars.length - 1 : bars.length
  const opens = bars[at]
  if (at < 0 || at >= count || opens === undefined) return { cells: count }
  return { from: opens + 1, to: bars[at + 1] ?? contentEnds }
}

/**
 * WHERE THE CHARACTERS OF ONE OF THE WRITER'S OWN CELLS SIT IN THE LINE, or null when the line does
 * not hold exactly those characters there.
 *
 * THE OFFSET IS CHECKED AND NEVER TRUSTED, which is the same promise `ItemWords` makes about the
 * words of an item: an element carrying an offset is saying the stored string holds exactly these
 * characters at exactly that position, and a wrong offset makes Mole Office report untouched words as
 * changed. So the line is asked, and a line that does not agree gets no offset at all.
 *
 * The leading spaces of the cell are stepped over because they are the writer's spacing and are not
 * the value drawn in the cell. `withCellReplaced` steps over the same characters when it writes, so
 * the two cannot disagree about where a cell's value begins.
 */
export function whereACellSits(raw: string, cell: PlanItemCell): number | null {
  const span = cellSpan(raw, cell.at)
  if ('cells' in span) return null
  const inside = raw.slice(span.from, span.to)
  const at = span.from + (inside.length - inside.trimStart().length)
  return raw.slice(at, at + cell.value.length) === cell.value ? at : null
}

/**
 * One cell of a pipe row replaced, with every other character of the line left exactly as typed.
 *
 * The spacing inside the cell is kept too: a writer who types `|1|2|` gets `|x|2|` back and not
 * `| x |2|`. What the writer typed is what is stored is the rule the whole plan editor is built on.
 */
export function withCellReplaced(raw: string, at: number, value: string): string {
  if (value.includes('|')) {
    throw new Error(t('g8.planitems.aCellOfYourTableCannotHoldAPipe'))
  }
  if (value.includes('\n')) throw new Error(t('g8.planitems.aPlanLineIsOneLineSoItCannot'))
  const span = cellSpan(raw, at)
  if ('cells' in span) {
    throw new Error(
      t('g8.planitems.theLineHasCellsAndMoleOfficeWasAsked', { value1: raw, value2: span.cells, value3: at + 1 }),
    )
  }
  const { from, to } = span
  const was = raw.slice(from, to)
  const lead = was.slice(0, was.length - was.trimStart().length)
  const trail = was.slice(was.trimEnd().length)
  return raw.slice(0, from) + lead + value + trail + raw.slice(to)
}

/**
 * THE ITEM'S WORDS WITHOUT THE PLANNING VALUES WRITTEN AFTER THEM.
 *
 * A line may end in a run of `{size: …}` groups, and those have columns of their own on this table.
 * The box you type an item's words into shows this, so a row does not print the same size twice —
 * once as characters in the words and once as a value in the How big column.
 *
 * NOTHING IS HIDDEN AND NOTHING IS LOST. Every group is drawn in its own column, editable, on the
 * same row; the Writing view shows the line exactly as it is stored; and `lineWithWords` puts the
 * groups back when the words are changed, so editing the words of an item does not throw away what
 * the line says about it.
 */
export function wordsOf(item: PlanItem): string {
  return parsePlanLine(item.text).text
}

/**
 * The item's marker, checked against the characters a write is actually being built on.
 *
 * A cell writes a whole line, and the line it writes may be newer than the row it was drawn with —
 * see `storeOneLine`. The marker is not touched by any of these writes, so a base that no longer
 * starts with it is a base this cannot safely take apart, and it says so rather than guessing where
 * the marker ends.
 */
function markerOn(item: PlanItem, base: string): string {
  const marker = markerOf(item)
  if (!base.startsWith(marker)) {
    throw new Error(
      t('g8.planitems.thisLineNowReadsWhichDoesNotStartWith', { value1: JSON.stringify(base), value2: JSON.stringify(marker) }),
    )
  }
  return marker
}

/**
 * The line this item is stored as, with different words, the same marker and the same planning
 * values.
 */
export function lineWithWords(item: PlanItem, words: string): string {
  return lineWithWordsOn(item, item.entry.line.text, words)
}

/** The same, built on the characters the line holds NOW rather than the ones the row was drawn with. */
export function lineWithWordsOn(item: PlanItem, base: string, words: string): string {
  if (words.includes('\n')) throw new Error(t('g8.planitems.aPlanLineIsOneLineSoItCannot'))
  if (item.kind === 'tableRow') {
    if (item.wordsCell === null) throw new Error(t('g8.planitems.thisRowOfYourTableHasNoCellHolding'))
    return withCellReplaced(base, item.wordsCell, words)
  }
  const marker = markerOn(item, base)
  return marker + writePlanLine({ ...parsePlanLine(base.slice(marker.length)), text: words })
}

/** The line this item is stored as, with one of the writer's own cells changed. */
export function lineWithCell(item: PlanItem, cell: PlanItemCell, value: string): string {
  return withCellReplaced(item.entry.line.text, cell.at, value)
}

const BOX = /\[[ xX]\]/

/**
 * The line this item is stored as, with its tick box ticked or cleared.
 *
 * A PLAIN BULLET GAINS A TICK BOX. That is the visible half of this: `- Measure at 390` becomes
 * `- [x] Measure at 390` in the document, so ticking in the table is something the writing view
 * shows you afterwards, not a state kept somewhere else.
 */
export function lineWithTick(item: PlanItem, ticked: boolean): string {
  return lineWithTickOn(item, item.entry.line.text, ticked)
}

/** The same, built on the characters the line holds NOW rather than the ones the row was drawn with. */
export function lineWithTickOn(item: PlanItem, base: string, ticked: boolean): string {
  // WHAT KIND OF LINE THIS IS COMES FIRST, and that order is a fix. A row of somebody's own table
  // cannot hold a tick box at all, and working out where its marker ends throws a sentence about
  // markers at a person whose real answer is "a table row does not have one of these".
  if (item.kind !== 'tickbox' && item.kind !== 'bullet') {
    throw new Error(t('g8.planitems.aCannotHoldATickBoxSoNothingWas', { value1: ITEM_WORDS[item.kind] }))
  }
  const box = ticked ? '[x]' : '[ ]'
  const marker = markerOn(item, base)
  const rest = base.slice(marker.length)
  if (item.kind === 'bullet') return `${marker}${box} ${rest}`
  if (!BOX.test(marker)) {
    throw new Error(t('g8.planitems.moleOfficeReadATickBoxOutOfAnd', { value1: base }))
  }
  return marker.replace(BOX, box) + rest
}

// ============================================================================ what a line says about itself

/**
 * WHAT EACH PLANNING VALUE IS CALLED ON SCREEN, IN ONE PLACE.
 *
 * The columns of the planning table are headed with these very words, and every sentence about one
 * of them reads them here. `size`, `time`, `project` and `note` are the words the syntax uses inside
 * a line; they are not what a person is shown.
 *
 * ---------------------------------------------------------------------------------------
 * THE OWNER RENAMED TWO OF THESE ON 17 AUGUST 2026, AND THE RENAME IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * "How big" is now ESTIMATE and "Time given" is now SCHEDULE, because those are the two questions a
 * person is really asking and the old words did not ask them:
 *
 *   Estimate answers "how much work does this probably take?"
 *   Schedule answers "when do I intend to work on it?"
 *
 * The rule is exact: estimate hours, scheduled dates and allocations are not to be
 * combined into one ambiguous "Time given" concept. "Time given" read as an amount, so a number of hours and a
 * week could sit under one word and nothing on the screen said which question either answered.
 * They are two facts and they never share a cell.
 *
 * "My note" is now NOTE. The possessive was the table telling a reader whose note it was on every
 * row of a surface only one person writes in.
 */
export const PLANNING_WORDS: Readonly<Record<PlanningKey, string>> = {
  get size() { return t('g8.planitems.estimate') },
  get time() { return t('g8.schedulePage.schedule') },
  get project() { return t('g8.planitems.project') },
  get note() { return t('g8.planitems.note') },
}

/**
 * WHAT AN EMPTY CELL SAYS, SO THAT AN EMPTY CELL IS NOT BLANK.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FIXES, MEASURED IN A BROWSER ON 16 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * Four of the five typable columns drew a COMPLETELY BLANK cell when the line said nothing: My note
 * on every row, and How big, Time given and Project on every row nobody had filed. The owner found
 * that they could type in one of them only by clicking blank space and watching what happened, and
 * said that a user eventually discovering that an empty area is clickable does not count as
 * successful design.
 *
 * A VALUE HINTS THAT IT IS A FIELD. AN EMPTY CELL HAS NOTHING TO HINT WITH, which is why these
 * exist. They are lower case and one or two words long, because forty rows of them is furniture and
 * furniture is read once.
 *
 * THEY ARE NOT THE COLUMN HEADING SAID AGAIN. "when" rather than "Time given", "how big" rather
 * than "How big": the heading names the column and these name what you type into it.
 */
export const PLANNING_PLACEHOLDERS: Readonly<Record<PlanningKey, string>> = {
  get size() { return t('g8.planitems.howBig') },
  get time() { return t('g8.planitems.when') },
  get project() { return t('g8.planitems.projectAt608') },
  get note() { return t('g8.planitems.noteAt609') },
}

/** What one line says about itself for one of the four keys, and whether it can be edited here. */
export interface WrittenValue {
  /** The words exactly as typed, or null when the line says nothing with this key. */
  said: string | null
  /** Why Mole Office will not write this value here, or null when it will. */
  refused: string | null
}

/**
 * WHAT THIS LINE SAYS ABOUT ITSELF FOR ONE KEY, read off the values the server parsed.
 *
 * A LINE THAT SAYS THE SAME THING TWICE IS NOT EDITED HERE. Two sizes on one line are two answers
 * and Mole Office will not pick one of them — the same rule filing follows, in `src/server/lib/plans.ts`.
 * Nothing is hidden: both are in the line's own words, where the Writing view shows them.
 */
export function writtenValue(item: PlanItem, key: PlanningKey): WrittenValue {
  const said = item.entry.line.planning.filter((one) => one.key === key)
  const first = said[0]
  if (first === undefined) return { said: null, refused: null }
  if (said.length > 1) {
    return {
      said: null,
      refused:
        t('g8.planitems.thisLineSaysSoMoleOfficeWillNotPick', { value1: PLANNING_WORDS[key], value2: said.length === 2 ? t('g8.writing.twice') : t('g8.writing.times', { value1: said.length }) }),
    }
  }
  return { said: first.value, refused: null }
}

/**
 * Why these words cannot be stored in a line, or null when they can be.
 *
 * A sentence rather than a throw, because the person typed it and the box has to be able to say why
 * it is refusing. The two characters are the ones the syntax itself is made of, and
 * `src/shared/planline.ts` refuses them for a note for the same reason.
 */
export function whyValueCannotBeWritten(key: PlanningKey, value: string): string | null {
  if (value.includes('{') || value.includes('}')) {
    return t('g8.planitems.isKeptInTheLineSOwnWordsAnd', { value1: PLANNING_WORDS[key] })
  }
  if (/[\r\n]/.test(value)) {
    return t('g8.planitems.isPartOfOneLineOfThePlanSo', { value1: PLANNING_WORDS[key] })
  }
  return null
}

/**
 * THE LINE WITH ONE PLANNING VALUE WRITTEN INTO IT: added, replaced, or taken off when the words are
 * emptied.
 *
 * Every group already on the line with this key comes off first, so writing in a box twice cannot
 * leave two answers behind. The words in front of the groups are not touched.
 *
 * IT IS BUILT WITH `src/shared/planline.ts` AND CHECKED AGAINST IT. That file is the one reader of
 * the syntax; this puts a group together and then reads the whole line back through it, so a line
 * this cannot produce correctly throws in front of the person who pressed rather than storing words
 * Mole Office will not read again. Check `whyValueCannotBeWritten` first: this does not, because a
 * refusal belongs to the box that is refusing.
 */
export function lineWithPlanningValue(line: string, key: PlanningKey, value: string): string {
  const parsed = parsePlanLine(line)
  const kept = parsed.values.filter((one) => one.key !== key)
  const words = value.trim()
  if (words === '') return writePlanLine({ ...parsed, values: kept })
  // A group needs a space in front of it, unless there would be nothing at all in front of it.
  const alone = parsed.text === '' && kept.length === 0
  const added: PlanningValue = {
    key,
    value: words,
    source: `{${key}: ${words}}`,
    before: alone ? '' : ' ',
  }
  const written = writePlanLine({ ...parsed, values: [...kept, added] })
  const back = parsePlanLine(written).values.filter((one) => one.key === key)
  if (back.length !== 1 || back[0]!.value !== words) {
    throw new Error(
      t('g8.planitems.moleOfficeWroteIntoTheLineAsAndReads', { value1: PLANNING_WORDS[key], value2: JSON.stringify(written) }),
    )
  }
  return written
}

/** Does this kind of record hold an estimate at all? Read from the kind's own declaration. */
export function kindHasEstimate(kind: RecordKind): boolean {
  return KIND_SPECS[kind].fields.some((field) => field.key === ESTIMATE_FIELD)
}

// ============================================================================ adding a line

/**
 * A LINE THAT IS NOT WRITTEN YET: where it goes, what it will be, and what its characters are.
 *
 * `lineFor` is the whole line built from the words somebody types. `marker` is the part of that line
 * Mole Office supplies, and the draft row draws it, so the reader sees the characters before they are
 * stored rather than being told about them in a sentence.
 */
export interface NewItem {
  /** The stored line this one is written directly after, or null for the end of the plan. */
  afterLineId: string | null
  /** Which sort of item it will be, once Mole Office reads the document back. */
  kind: PlanItemKind
  /** How deep it will sit. The draft row is drawn at this depth. */
  depth: number
  /** The characters written before the words. Empty for a row of the writer's own table. */
  marker: string
  /** The whole line, from the words somebody typed. */
  lineFor: (words: string) => string
}

/**
 * WHERE A NEW ITEM GOES, AND WHAT IT IS WRITTEN AS. One rule per sort of row, and each is the only
 * answer that does not need explaining.
 *
 * DIRECTLY AFTER THE ROW YOU PRESSED, ALWAYS. That is where a text editor puts the next line, and
 * it is the one place a person can predict. "At the end of its parent" cannot be predicted while the
 * table is folded or sorted, because the end of the parent is then off screen or somewhere else.
 *
 * AND AT THE SAME LEVEL, except under a heading. A heading is a place to put work rather than work
 * itself, so the thing you add under one is an item, one level deeper — which is also the only way
 * to give a heading its first item from this table. Every other sort of row gets a sibling: the same
 * marker, so the same depth, because `src/shared/planoutline.ts` works the depth out from these very
 * characters.
 *
 * A TICK BOX STARTS UNTICKED, whatever the row above it says. Copying "[x]" would file a claim that
 * the new item is already done, which nobody made.
 *
 * A NUMBERED ITEM TAKES THE NEXT NUMBER. The numbers below it are then one behind, and they are the
 * writer's to fix — Mole Office renumbering the rest of their list would rewrite lines they did not
 * touch.
 */
export function newItemAfter(item: PlanItem): NewItem {
  const after = item.entry.line.id
  if (item.kind === 'heading') {
    return { afterLineId: after, kind: 'bullet', depth: item.depth + 1, marker: '- ', lineFor: (w) => `- ${w}` }
  }
  if (item.kind === 'tableRow') {
    return {
      afterLineId: after,
      kind: 'tableRow',
      depth: item.depth,
      marker: '',
      lineFor: (w) => emptyRowLike(item, w),
    }
  }
  const marker = markerOf(item)
  if (item.kind === 'tickbox') {
    // MOLE OFFICE LOOKS FOR THE BOX RATHER THAN COMPARING TWO STRINGS. Replacing "[ ]" with "[ ]" leaves
    // the marker exactly as it was, so "the string did not change" would read an item that is
    // already unticked as a line with no box in it, and refuse to add anything under it.
    if (!BOX.test(marker)) {
      throw new Error(t('g8.planitems.moleOfficeReadATickBoxOutOfAnd', { value1: item.entry.line.text }))
    }
    const unticked = marker.replace(BOX, '[ ]')
    return { afterLineId: after, kind: 'tickbox', depth: item.depth, marker: unticked, lineFor: (w) => unticked + w }
  }
  if (item.kind === 'numbered') {
    const next = nextNumberMarker(item, marker)
    return { afterLineId: after, kind: 'numbered', depth: item.depth, marker: next, lineFor: (w) => next + w }
  }
  return { afterLineId: after, kind: 'bullet', depth: item.depth, marker, lineFor: (w) => marker + w }
}

/**
 * The first item of a plan that has none: a bullet at the top level, at the end of the document.
 *
 * The end, and not the top, because the lines already there are somebody's writing and a new item
 * pushed above them would move the words they wrote.
 */
export const A_FIRST_ITEM: NewItem = {
  afterLineId: null,
  kind: 'bullet',
  depth: 0,
  marker: '- ',
  lineFor: (words) => `- ${words}`,
}

/**
 * The marker for the item after a numbered one: the same indentation, and one number on.
 *
 * BIGINT, because the digits are whatever somebody typed and `\d+` has no upper bound. Read as an
 * ordinary number, a twenty-digit list marker would come back as an approximation and this would
 * write a number nobody can see the reason for.
 */
function nextNumberMarker(item: PlanItem, marker: string): string {
  if (item.number === null) {
    throw new Error(
      t('g8.planitems.aNumberedItemCameBackWithoutTheNumberIt'),
    )
  }
  const indent = marker.slice(0, marker.length - marker.trimStart().length)
  return `${indent}${BigInt(item.number) + 1n}. `
}

/**
 * A row of the writer's own pipe table, with their spacing, their cell count, and every cell but the
 * first left empty.
 *
 * It is built by emptying the cells of the row above it rather than by writing pipes from scratch,
 * so the new row has exactly as many cells as their heading — a row with one cell too few makes
 * `src/shared/plandoc.ts` print the whole table as typed instead of reading it, and their table would
 * stop being a table because Mole Office added a line to it.
 */
function emptyRowLike(item: PlanItem, words: string): string {
  if (item.wordsCell === null) throw new Error(t('g8.planitems.thisRowOfYourTableHasNoCellHolding'))
  // Emptied from the last cell back, so that replacing one cell cannot move the cell before it.
  let line = item.entry.line.text
  for (const cell of [...item.cells].sort((a, b) => b.at - a.at)) {
    line = withCellReplaced(line, cell.at, '')
  }
  return withCellReplaced(line, item.wordsCell, words)
}

// ============================================================================ the hours already given

/** Every piece of work in every project, fetched once for whichever surface is on screen. */
export function useWorkList(): [AsyncState<WorkListReply>, () => void] {
  return useAsync(() => api.work(), [])
}

/** What Mole Office can say about the hours one record already has. */
export interface HoursReading {
  /** The periods it has hours in, or null when Mole Office cannot say. Empty means it has none. */
  periods: WorkRow['hoursGiven'] | null
  /** Why it cannot say, in plain words. Null when `periods` is an answer. */
  because: string | null
}

/**
 * The hours a record already has, or the reason Mole Office cannot say.
 *
 * NULL IS NOT ZERO, and this is the cell where that matters most: only three pieces of work in the
 * live corpus have any hours at all, so a cell that drew "cannot say" and "none" the same way would
 * be wrong two hundred times and right three.
 */
export function hoursOf(reply: WorkListReply | null, work: { id: string; kind: string }): HoursReading {
  if (reply === null) {
    return { periods: null, because: t('g8.planitems.moleOfficeHasNotFinishedReadingTheHours') }
  }
  const row = reply.rows.find((candidate) => candidate.id === work.id)
  if (row !== undefined) return { periods: row.hoursGiven, because: null }
  if (!reply.kinds.includes(work.kind)) {
    return {
      periods: null,
      because: t('g8.planitems.moleOfficeListsHoursForAndThisIsA', { value1: reply.kinds.join(', '), value2: work.kind }),
    }
  }
  if (reply.leftOut > 0) {
    return {
      periods: null,
      because: t('g8.planitems.theWorkListStoppedAtOfPiecesOfWork', { value1: reply.returned, value2: reply.counted }),
    }
  }
  return { periods: null, because: t('g8.planitems.thisWorkIsNotOnTheListMoleOffice') }
}

// ============================================================================ what a press did

/**
 * What one press wrote, in the server's own words, or why it was refused.
 *
 * THE SERVER'S SENTENCE IS SHOWN AND NEVER FLATTENED. Every refusal these presses meet names the
 * row in the way — the record a line already points at, the row that already holds the hours in
 * this period — and that name is the whole of what a reader needs to fix it.
 */
export interface PressOutcome {
  ok: boolean
  said: string
  /**
   * The records that sentence names, when the reply also handed them over as rows.
   *
   * ---------------------------------------------------------------------------------------
   * THE DEFECT THIS EXISTS FOR, MEASURED IN A BROWSER ON 18 AUGUST 2026
   * ---------------------------------------------------------------------------------------
   *
   * Tracking a line whose title another record already held answered: *"Work in this project was
   * already called "Close-up camera": task ...."* — four dots and no way to reach the record. The
   * server writes the id into the sentence, `withoutRecordIds` below takes ids out for a reader in
   * Normal mode, and the two together left a warning that says a clash exists and then refuses to
   * say which record it is about.
   *
   * NAMING THE RECORD BY ITS TITLE WOULD NOT HELP: the whole point of the warning is that both
   * records answer to the same title. The id is the only thing that tells them apart, and the id is
   * exactly what a person cannot use. So what a person gets is the thing an id is for — a way to
   * open the record — and `PressReport` draws these as links. See `SaidWithRecords`.
   */
  records?: readonly ReachableRecord[]
}

/**
 * A record the browser holds the identity of, so a sentence naming it can be followed to it.
 *
 * NOT `NamedRecord`, which pages/RecordPage.tsx already exports and which means something else: a
 * record a form can show the title of while storing its id. Two different ideas with one name in
 * two files is a reader tripping over the wrong one, so this says what it is for.
 */
export interface ReachableRecord {
  id: string
  kind: RecordKind
  title: string
}

/** Run one write, keeping whatever the server said about it either way. */
export async function press(
  run: () => Promise<{ note: string; records?: readonly ReachableRecord[] }>,
): Promise<PressOutcome> {
  try {
    const reply = await run()
    return { ok: true, said: reply.note, ...(reply.records === undefined ? {} : { records: reply.records }) }
  } catch (err) {
    return { ok: false, said: errorMessage(err) }
  }
}

/**
 * WHETHER A RUN OF CHARACTERS IN A SENTENCE IS ONE OF MOLE OFFICE'S OWN IDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SHAPE AND NOT A LIST OF IDS
 * ---------------------------------------------------------------------------------------
 *
 * These sentences are written by the server, and some of them name a record the browser has never
 * held: a refusal says which record a line already points at, and the whole point of that refusal is
 * that the browser's copy was out of date. So there is no list of ids to subtract. What is left is
 * the shape.
 *
 * WHAT AN ID IS: isARecordId in src/shared/messages.ts, the one rule every reader of ids in text uses.
 * A twelve-letter word, a capitalised one and lower-case words joined by - or _ are not ids there, so
 * `consistently`, `Presentation` and `well-behaved` stay in a person's sentence.
 *
 * A run of exactly twelve is required, so a longer word cannot have twelve of itself matched.
 */

/**
 * THE SAME SENTENCE WITH MOLE OFFICE'S OWN IDS TAKEN OUT OF IT, for a reader in Normal mode.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEASUREMENT, 17 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * Giving a line two hours answered: *"3 hours. One allocation written (hkLnSG9FYPQ5) in 2026-W35,
 * and it records that it came from this line."* `docs/UX-CONTRACT.md` puts record ids in the
 * Developer view, and this is an ordinary confirmation of an ordinary press. The id tells a person
 * nothing they can do anything with, and it is the first thing in the sentence their eye stops on.
 *
 * THE SENTENCE IS THE SERVER'S AND STAYS THE SERVER'S. `src/server/api/plans.ts` writes the id into
 * the words at line 858, and that file belongs to somebody else this pass. So this takes the id out
 * of what Normal mode draws and Developer mode still shows the sentence exactly as it was sent —
 * nothing is destroyed and nothing becomes unreachable, which is the contract's own rule for the
 * two modes.
 *
 * ---------------------------------------------------------------------------------------
 * THREE PLACES AN ID SITS IN THESE SENTENCES, AND WHAT IS LEFT WHEN IT GOES
 * ---------------------------------------------------------------------------------------
 *
 *   `Vb7Qk2Ln9Xz1 ("Reprint the mount")`  →  `"Reprint the mount"` — the name is right there, so
 *      the sentence keeps its subject and loses only the id.
 *   `written (hkLnSG9FYPQ5) in 2026-W35`  →  `written in 2026-W35` — an aside in brackets goes
 *      whole, with the space in front of it.
 *   anything else                          →  `…` — an elision, because a word has been taken out
 *      and pretending otherwise would read as a sentence somebody wrote badly.
 *
 * A QUOTED TITLE IS NEVER TOUCHED unless the whole of it is an id, because what is inside those
 * quotation marks is somebody's own writing and this may not edit that.
 */
export function withoutRecordIds(said: string): string {
  const named = said.replace(
    /(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{12})(?![A-Za-z0-9_-]) \("([^"]*)"\)/g,
    (whole, id: string, title: string) => (isARecordId(id) ? `"${title}"` : whole),
  )
  const asides = named.replace(
    / ?\((?<![A-Za-z0-9_-])([A-Za-z0-9_-]{12})(?![A-Za-z0-9_-])\)/g,
    (whole, id: string) => (isARecordId(id) ? '' : whole),
  )
  const quoted = asides.replace(
    /"(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{12})(?![A-Za-z0-9_-])"/g,
    (whole, id: string) => (isARecordId(id) ? '…' : whole),
  )
  return quoted.replace(TWELVE_ID_CHARACTERS, (word) => (isARecordId(word) ? '…' : word))
}

/**
 * WHERE TO SAY A RECORD IS, IN A LIST OF SEVERAL, WITHOUT USING ITS ID.
 *
 * Two records with one title cannot be told apart by name — that is what the warning is about — so
 * a list of them is told apart by position and nothing else. Past the tenth the position is a
 * number, which is plainer than inventing more words.
 */
const PLACE_IN_A_LIST = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
] as const

/**
 * THE SERVER'S SENTENCE, WITH THE RECORDS IT NAMES DRAWN AS LINKS A PERSON CAN FOLLOW.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ON SCREEN BEFORE THIS, AND WHY IT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A tester tracked a plan line whose title another record already held and read: *"Work in this
 * project was already called "Close-up camera": task ...."*. The sentence told the tester a clash existed and
 * then refused to say which record — the id had been elided by `withoutRecordIds` and nothing was
 * left in its place but three dots and the full stop after them.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A LINK RATHER THAN THE ID BACK, AND WHY NOT THE TITLE
 * ---------------------------------------------------------------------------------------
 *
 * PUTTING THE ID BACK WOULD NOT HELP A PERSON. `docs/UX-CONTRACT.md` keeps ids in Inspect for the
 * reason this whole elision exists: the id is not something a reader can act on. Its own overriding
 * rule is the one that was being broken — *nothing is destroyed and nothing becomes unreachable* —
 * and a link satisfies both, because it is the id doing its job without being read out.
 *
 * NAMING IT BY TITLE WOULD NOT HELP EITHER. The two records share a title; that IS the warning. So
 * a list of them is told apart by position, and each entry is a press that opens one.
 *
 * ---------------------------------------------------------------------------------------
 * THE LINK SWALLOWS THE KIND WORD IN FRONT OF THE ID
 * ---------------------------------------------------------------------------------------
 *
 * The server writes `task hkLnSG9FYPQ5`, so the two characters of English in front of the id are
 * part of the name it is building. The link takes them with it and prints the reader's word for the
 * kind — a block is called a step on screen — which is why this reads `kindWord` rather than
 * repeating the stored word the sentence carries.
 *
 * Every other id in the sentence is elided exactly as before: these are the records this browser was
 * handed rows for, and no others.
 */
export function SaidWithRecords({
  said,
  records,
  plain,
}: {
  said: string
  records: readonly ReachableRecord[]
  /** What to do with the text between the links. The caller's, because each surface says periods its own way. */
  plain: (text: string) => string
}) {
  const byId = new Map(records.map((one) => [one.id, one] as const))
  const parts: React.ReactNode[] = []
  let from = 0
  let found = 0
  // A FRESH READER OVER THE SAME SHAPE. `TWELVE_ID_CHARACTERS` is a global regular expression and a
  // global one carries a position between calls, so scanning with the shared object would make where
  // this sentence starts depend on what was read last. Only an id of a record in the list is linked.
  for (const match of said.matchAll(new RegExp(TWELVE_ID_CHARACTERS.source, 'g'))) {
    const one = byId.get(match[0])
    if (one === undefined || match.index === undefined) continue
    const before = said.slice(from, match.index)
    const stored = `${one.kind} `
    parts.push(plain(before.endsWith(stored) ? before.slice(0, -stored.length) : before))
    const word = kindWord(one.kind).text
    const place = records.length === 1 ? '' : `${PLACE_IN_A_LIST[found] ?? String(found + 1)} `
    parts.push(
      <RouteLink
        key={`${one.id}-${found}`}
        to={recordPath(one.id)}
        className="pi-reach"
        title={t('g8.planitems.openTheCalled', { value1: place, value2: word, value3: one.title })}
      >
        {t('g8.planitems.openThe')}{place}
        {word}
        <span className="px-sr">{t('g8.planitems.called', { value1: one.title })}</span>
      </RouteLink>,
    )
    from = match.index + match[0].length
    found += 1
  }
  parts.push(plain(said.slice(from)))
  return (
    <>
      {parts.map((part, at) => (
        <Fragment key={at}>{part}</Fragment>
      ))}
    </>
  )
}

// ============================================================================ the cells

/** What every control below needs to write and to say what happened. */
export interface ItemActs {
  planId: string
  /**
   * Read the plan again, because a write changed it. It never rejects: a read that failed is drawn
   * by whoever owns the table.
   *
   * IT IS AWAITABLE BECAUSE ADDING AN ITEM NEEDS IT TO BE. After one item is added the draft box
   * moves to sit under it, and the row it moves under does not exist here until this read lands.
   * Moving first left the box on screen for one fetch with no row to belong to, and anything typed
   * in that moment went nowhere.
   */
  reload: () => Promise<void>
  /**
   * True when the document has characters on their way to the server.
   *
   * Editing a cell writes one line; saving the writing box writes the whole document. Both at once
   * would be two writers for one document and the later one would silently undo the earlier, so
   * while a document save is in flight the cells refuse and say why.
   */
  behind: boolean
  /** Every piece of work in every project, for the hours and for the picker. Null while reading. */
  workList: WorkListReply | null
  /**
   * THE SERVER'S OWN DAY, so a cell can say what it read out of words like "next week".
   *
   * NULL WHILE IT HAS NOT ARRIVED, and a cell that has no day says nothing rather than reading the
   * words against this browser's clock. Both would be wrong at a day boundary and only one of them
   * would look wrong. It is the same day `GiveItTime` reads and the same day the schedule is
   * written with — one answer for the page, so two cells cannot land in two different weeks.
   */
  today: Date | null
  /**
   * WHICH COPY OF THE PLAN A CELL'S WRITE IS BUILT ON (problem GR4LcaNI-XZk). Every write from the table sends it, so a
   * write built on a copy somebody has since changed is refused rather than written over their work.
   *
   * REQUIRED, so a table that forgets it does not compile. On the plan page it is the writing box's own, because the
   * rows drawn here are the lines that box last stored. It may throw when the plan cannot be read.
   */
  versionToWriteOn: () => Promise<VersionToWriteOn>
}

/** The one sentence a cell shows when it will not write because the document is being saved. */
export const BEHIND_SENTENCE =
  en['g8.planitems.whatYouTypedInTheWritingBoxHasNot']

// ============================================================================ one writer per plan

/**
 * EVERY CELL WRITE ON ONE PLAN GOES THROUGH HERE, ONE AT A TIME, AND EACH ONE IS BUILT ON WHAT THE
 * ONE BEFORE IT STORED.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEASUREMENT THIS EXISTS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A tester made six cell edits across three rows inside 134 milliseconds and BOTH of the sizes that
 * a person can count with were gone afterwards. The same edits 400 milliseconds apart lost nothing.
 * A note left for about 1.5 seconds went the same way.
 *
 * Reproduced in Chromium at 1600 on 17 August 2026, six edits committed in one turn of the browser,
 * 18 milliseconds end to end: `{size: 2h}`, `{size: 6h}` and `{size: maybe half a day}` were all
 * three gone from the stored plan and the three times written beside them were all three kept. With
 * this in place, the same burst at 11 milliseconds keeps all six.
 *
 * WHY. Each cell built the whole new line out of the characters its own row was DRAWN with, and a
 * row is drawn once and then sits there. Write the size, and before the table has read the plan back
 * write the time in the next column: the second write is built on the line as it was before the
 * first one landed, it replaces the whole line, and the size is gone. Nothing failed, nothing was
 * refused, and the row simply came back one value short. Four hundred milliseconds is enough for the
 * read to land and the row to be drawn again, which is why the slow run kept everything.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO THINGS THAT FIX IT, AND WHY BOTH ARE NEEDED
 * ---------------------------------------------------------------------------------------
 *
 * ONE WRITE AT A TIME, FOR THE WHOLE PLAN. Two writes in the air at once can land in either order,
 * and so can the two reads that follow them — which is how the table could end up drawing an older
 * plan than the one that is stored, and how the writing box beside it could be handed those older
 * words as though they were what the server holds.
 *
 * AND EACH WRITE IS BUILT ON THE NEWEST CHARACTERS THIS PAGE HAS SEEN, which is the line the write
 * before it stored, taken from that write's own reply. Ordering alone does not fix anything: the
 * second write would still be built from the stale row it was drawn with.
 *
 * IT NEVER WRITES FROM A VERSION OF THE LINE IT HAS NOT SEEN. What is carried forward is used only
 * when the row this box was drawn with is one this page has already written from or written to. A
 * row showing characters this page has never seen is newer news than anything it is holding — an
 * agent, another tab, or the writing box wrote it — so that is what the write is built on instead.
 * Guessing the other way is how this mechanism would become the defect it removes.
 */

/** One line's newest stored characters, and every version of that line this page has handled. */
interface CarriedLine {
  /** What the server stored for this line when this page last wrote it. */
  to: string
  /**
   * Every version of this line this page has written FROM or written TO.
   *
   * It is what tells "the row on screen is behind my own writes" from "somebody else has written
   * here". Only the first carries anything forward. See the note above.
   */
  seen: Set<string>
}

/** What somebody has typed on one plan that the server does not have. */
export interface PlanTyping {
  /** How many boxes are holding characters that are not what is stored. */
  typed: number
  /** How many writes are on their way to the server. */
  saving: number
}

/** Nothing typed and nothing on its way. One object, so a reader can compare snapshots by identity. */
const NOTHING_TYPED: PlanTyping = { typed: 0, saving: 0 }

/** Everything one plan's table is in the middle of. */
interface PlanWrites {
  /** The writes queued for this plan. It never rejects. */
  chain: Promise<void>
  /** How many writes have been asked for and not finished. */
  owed: number
  carried: Map<string, CarriedLine>
  /** The boxes holding characters that are not stored, by a name of their own. */
  typed: Set<string>
  watchers: Set<() => void>
  /** The snapshot handed to a watcher. Replaced only when the counts change. */
  now: PlanTyping
}

const WRITING = new Map<string, PlanWrites>()

function writesOf(planId: string): PlanWrites {
  const held = WRITING.get(planId)
  if (held !== undefined) return held
  const made: PlanWrites = {
    chain: Promise.resolve(),
    owed: 0,
    carried: new Map(),
    typed: new Set(),
    watchers: new Set(),
    now: NOTHING_TYPED,
  }
  WRITING.set(planId, made)
  return made
}

/** Tell whoever is watching, and only when something a reader can see has actually changed. */
function tell(held: PlanWrites): void {
  if (held.typed.size === held.now.typed && held.owed === held.now.saving) return
  held.now = { typed: held.typed.size, saving: held.owed }
  for (const watcher of held.watchers) watcher()
}

/**
 * WHAT IS TYPED AND NOT STORED ON THIS PLAN RIGHT NOW.
 *
 * The page that says whether the plan is stored reads this, because a person typing in a cell of the
 * table is typing into the same plan as a person typing in the writing box, and one line above both
 * of them says whether the plan is stored.
 */
export function planTypingNow(planId: string): PlanTyping {
  return WRITING.get(planId)?.now ?? NOTHING_TYPED
}

/** Watch it. The answer is the press that stops watching. */
export function watchPlanTyping(planId: string, on: () => void): () => void {
  const held = writesOf(planId)
  held.watchers.add(on)
  return () => {
    held.watchers.delete(on)
  }
}

/** One box is holding characters that are not what is stored, or has stopped holding them. */
export function markTyped(planId: string, box: string, holding: boolean): void {
  if (planId === '') return
  const held = writesOf(planId)
  if (holding) held.typed.add(box)
  else held.typed.delete(box)
  tell(held)
}

/** What one write does to a line: all of its characters, or the writer's own note about it. */
export type LineWrite = { text: string } | { remark: string | null }

/** What one write did. The server's own sentence when it did not go through. */
export type LineStored = { ok: true } | { ok: false; why: string }

/**
 * WRITE ONE LINE OF ONE PLAN, BEHIND EVERY WRITE ALREADY ASKED FOR ON THAT PLAN.
 *
 * `drawnFrom` is the line as the row that is calling was drawn with. `build` is handed the newest
 * characters this page knows of — which is usually the same string, and is not when a write that
 * has not been read back yet has already changed the line.
 *
 * THE PLAN IS READ AGAIN WHEN THE LAST OF THEM IS DONE, once, rather than once per write. Six edits
 * used to mean six reads racing each other home.
 *
 * IT NEVER REJECTS. A build that throws and a request that fails both come back as an outcome, so a
 * cell can print the sentence beside the box the person typed in.
 */
/**
 * THE VERSION THE LAST WRITE OF A BURST HANDED BACK, by the plan's queue (problem GR4LcaNI-XZk). Only `storeOneLine`
 * reads and writes it.
 *
 * The table reads the plan back once, after the last write of a burst, so until then the version the page holds is the
 * one from before the burst. The second write of a burst is built on the first one's result, so it is sent with the
 * first one's version, and a write by somebody else in between still refuses it. It is forgotten when the burst ends
 * and when a write is refused.
 */
const BURST_VERSION = new WeakMap<PlanWrites, string>()

export async function storeOneLine(
  acts: ItemActs,
  lineId: string,
  drawnFrom: string,
  build: (base: string) => LineWrite,
): Promise<LineStored> {
  const held = writesOf(acts.planId)
  held.owed += 1
  tell(held)

  const run = async (): Promise<LineStored> => {
    const carried = held.carried.get(lineId)
    // WHETHER THE ROW THIS BOX WAS DRAWN WITH IS ONE THIS PAGE HAS ALREADY HANDLED. If it is, the
    // characters carried forward are newer than it. If it is not, the row is showing somebody
    // else's writing and that is the newest thing anybody here knows.
    const behindMyOwnWrites = carried !== undefined && carried.seen.has(drawnFrom)
    const base = behindMyOwnWrites ? carried.to : drawnFrom
    let patch: LineWrite
    try {
      patch = build(base)
    } catch (err) {
      return { ok: false, why: errorMessage(err) }
    }
    // THE COPY THIS WRITE IS BUILT ON. The burst's own version when there is one, and otherwise the page's.
    let version = BURST_VERSION.get(held)
    if (version === undefined) {
      let on: VersionToWriteOn
      try {
        on = await acts.versionToWriteOn()
      } catch (err) {
        return { ok: false, why: errorMessage(err) }
      }
      // The stored words are no longer the ones the rows were drawn from: the same refusal, found before sending.
      if (!on.ok) return { ok: false, why: t('planStores.lineRefused') }
      version = on.version
    }
    try {
      const reply = await api.saveLine(acts.planId, lineId, patch, version)
      BURST_VERSION.set(held, reply.version)
      const seen = behindMyOwnWrites ? carried.seen : new Set<string>()
      seen.add(drawnFrom)
      seen.add(base)
      seen.add(reply.line.text)
      held.carried.set(lineId, { to: reply.line.text, seen })
      return { ok: true }
    } catch (err) {
      BURST_VERSION.delete(held)
      // SOMEBODY ELSE WROTE IN THIS PLAN FIRST, so nothing was written. The sentence says so and says the way on: the
      // table reads the plan back when this burst ends, below, and the row then shows what is stored.
      if (err instanceof ApiError && err.code === 'planChangedSinceRead') return { ok: false, why: t('planStores.lineRefused') }
      return { ok: false, why: errorMessage(err) }
    }
  }

  // BEHIND EVERYTHING ALREADY ASKED FOR. `run` never rejects, and the rejection handler is there so
  // that a queue which somehow broke still runs the write behind it rather than swallowing it.
  const queued = held.chain.then(run, run)
  const after = async () => {
    held.owed -= 1
    // THE BURST IS OVER, so its version is forgotten: the read below hands the page a newer one.
    if (held.owed === 0) BURST_VERSION.delete(held)
    // THE READ IS INSIDE THE COUNT ON PURPOSE. Until the table has been told, the row on screen is
    // still the row from before the write, and a page that said "Stored." at that moment would be
    // pointing at characters nobody has stored.
    if (held.owed === 0) await acts.reload()
    tell(held)
  }
  held.chain = queued.then(after, after)
  return queued
}

/**
 * WHETHER THIS SURFACE CAN REWRITE A LINE OF THE DOCUMENT.
 *
 * Three of the controls below — the words, one of the writer's own cells, and the tick box — change
 * the CHARACTERS of a line. The rest change the record, or the writer's private note, and touch the
 * document not at all.
 *
 * A surface may only offer those three when what it writes gets back to whoever holds the
 * document's text for the page. When it does not, the writing box would still be holding the words
 * as they were, and the next character typed there would store the old words over the new ones —
 * measured, and the reason this flag exists. See the head of PlanTable.tsx.
 */
export interface CanRewrite {
  /** True when a rewritten line reaches the copy of the plan the writing box reads. */
  canRewrite: boolean
}

/** A tick box, drawn only where the document can hold one. */
export function ItemTick({ item, acts, canRewrite }: { item: PlanItem; acts: ItemActs } & CanRewrite) {
  const [failed, setFailed] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  if (item.ticked === null) return null
  if (!canRewrite) {
    // ONLY A LINE THAT REALLY HOLDS A TICK BOX GETS A MARK. A plain bullet reads as `false` above
    // because ticking one WRITES a box into the line — that is an offer, not a fact about the
    // document. Where the offer cannot be made, drawing an empty box on a bullet would put a mark
    // on the screen that is in nobody's plan.
    if (item.kind !== 'tickbox') return null
    // The mark the person typed, said in words as well, because a glyph alone states a fact by
    // shape only. The same two halves the document view draws it with.
    return (
      <span className="pi-tick-read" data-done={item.ticked ? '1' : undefined}>
        <span aria-hidden="true">{item.ticked ? '☑' : '☐'}</span>
        <span className="px-sr">{item.ticked ? t('g8.planitems.ticked') : t('g8.planitems.notTicked')}</span>
      </span>
    )
  }

  const flip = async () => {
    if (acts.behind) {
      setFailed(t('g8.planitems.whatYouTypedInTheWritingBoxHasNot'))
      return
    }
    setSaving(true)
    setFailed(null)
    const done = await storeOneLine(acts, item.entry.line.id, item.entry.line.text, (base) => ({
      text: lineWithTickOn(item, base, !item.ticked),
    }))
    setSaving(false)
    if (!done.ok) setFailed(done.why)
  }

  return (
    <>
      <input
        type="checkbox"
        className="pi-tick"
        checked={item.ticked}
        disabled={saving}
        aria-label={item.ticked ? t('g8.planitems.untick', { value1: item.text }) : t('g8.planitems.tick', { value1: item.text })}
        onChange={() => void flip()}
      />
      {failed === null ? null : (
        <span className="pi-said" data-ok="0">
          {failed}
        </span>
      )}
    </>
  )
}

/**
 * One cell you type in: a box with no edges until the cursor is in it, that GROWS to fit its words.
 *
 * IT IS A TEXT AREA AND NOT A ONE-LINE BOX, for the reason the plan's own name is one. Measured at
 * 390 and at 1440: a one-line box cut "measure the offset at the transplant pose" off at "at", with
 * the rest reachable only by scrolling inside a control whose edges nobody can see. Nothing you
 * typed is ever hidden is the rule this whole surface is built on.
 *
 * ENTER SAVES rather than making a second line, because one item is one line of the document.
 *
 * IT IS UNCONTROLLED, with the stored words as its key. React never rewrites the box while somebody
 * is typing in it, so the browser's own undo inside it survives; when the stored words change the
 * key changes and the box shows what is now stored.
 *
 * ARRIVING IN A CELL SELECTS ITS WORDS. Measured in a browser: clicking a cell dropped the cursor
 * wherever inside the words the pointer landed, so the next thing typed went into the middle of the
 * old value — "CALIBRATED" typed over "replace clamp" came out as "replace CALIBRATEDclamp".
 * A cell of a planning table is read as one value, so arriving in one offers to replace it, which
 * is what the same press does in every spreadsheet.
 *
 * PRESSING AGAIN INSIDE A CELL YOU ARE ALREADY IN PUTS THE CURSOR WHERE YOU PRESSED. That is not an
 * exception to the rule above, it is the rest of it: the selection happens on ARRIVAL, and once you
 * are in the cell the box is an ordinary box again, which is how one word of a long line is
 * corrected. Focus fires once per arrival, so this needs no state of its own beyond the flag that
 * stops the browser collapsing the fresh selection when the button comes back up.
 */
/**
 * HOW MANY LINES A GROWING BOX MAY REACH BEFORE IT SCROLLS INSIDE ITSELF.
 *
 * Sixteen, which is the same number `TextArea` in components/ui.tsx uses, because it is the same
 * rule: the owner set it on 17 August 2026 about every multiline box a person writes in. Pressing
 * Enter should visibly make the box taller, up to a sensible limit, before it starts scrolling inside
 * itself, and a three-line note should not look like one cramped line.
 *
 * IT IS TWO CONSTANTS AND NOT ONE, and that is worth saying plainly: this file may not import from
 * ui.tsx's internals, and ui.tsx keeps its own. The number is a shared JUDGEMENT rather than a shared
 * fact — a box drawn from either declaration is correct on its own — so the two cannot make each
 * other wrong. If they drift, one surface scrolls a line earlier than another and nothing is untrue.
 */
const GROW_TO_LINES = 16

/**
 * Make a box as tall as the words in it, up to a stated number of lines, then let it scroll.
 *
 * One function, because two boxes on this surface grow: the cell you edit and the box you type a
 * new item into. Two copies of "set the height from the scroll height" is the smallest possible
 * version of the defect this repository keeps producing.
 *
 * A LINE HEIGHT OF "normal" READS BACK AS NaN, and then there is no ceiling this can honestly
 * compute. The box grows to fit rather than guessing a number of pixels — the same choice `TextArea`
 * makes, for the same reason.
 */
function fitToText(el: HTMLTextAreaElement | null, growTo?: number): void {
  if (el === null) return
  el.style.height = 'auto'
  const wanted = el.scrollHeight
  if (growTo === undefined) {
    el.style.height = `${wanted}px`
    return
  }
  const line = Number.parseFloat(window.getComputedStyle(el).lineHeight)
  const ceiling = Number.isFinite(line) ? line * growTo : null
  el.style.height = `${ceiling === null ? wanted : Math.min(wanted, ceiling)}px`
  el.style.overflowY = ceiling !== null && wanted > ceiling ? 'auto' : 'hidden'
}

/**
 * HOW LONG A BOX WAITS AFTER THE LAST KEYSTROKE BEFORE IT STORES WHAT IS IN IT, in milliseconds.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEASURED DEFECT THIS EXISTS FOR, ROUND SIX
 * ---------------------------------------------------------------------------------------
 *
 * A cell used to store its words only when the cursor LEFT it. A tester typed a note, waited ten
 * seconds, reloaded the page, and the note was gone. The line above the table did say "Not stored
 * yet." and that was true — but it sits a long way from the cell, and nobody reads a status line
 * about a box they are still typing in.
 *
 * So a box now stores itself when the typing stops, whether or not the cursor is still in it. The
 * owner's acceptance list asks that a reload lose nothing a person was in the middle of writing once
 * the page has said it was saved, and this is the half that makes the saying true.
 *
 * ONE AND A HALF SECONDS RATHER THAN A KEYSTROKE. A write per character would put a request in the
 * air for every letter of a sentence, and the queue in this file runs them one at a time. This is
 * long enough that ordinary typing writes once at the end of a phrase, and short enough that
 * somebody who stops to think has already been saved.
 */
const STORE_AFTER_TYPING_STOPS = 1500

function GrowBox({
  value,
  label,
  heading,
  placeholder,
  title,
  fill = false,
  planned = false,
  typing,
  growTo = GROW_TO_LINES,
  drawsMaths = false,
  origin,
  onStore,
  failed,
}: {
  value: string
  label: string
  /** The heading level, when this box holds a heading's words, so the weight follows the level. */
  heading?: number | null
  /** The words in an empty box, where an empty box would otherwise say nothing. */
  placeholder?: string
  /** The whole sentence about this box, for a reader who rests on it. */
  title?: string
  /**
   * TRUE WHERE THIS BOX IS THE WHOLE OF ITS TABLE CELL, so the whole cell is the click target.
   *
   * Measured at 1440 on 16 August 2026: the cell was 122 by 26.5 pixels and the box inside it was
   * 110 by 21, so a press anywhere near the cell's edge landed on the cell and did nothing — on
   * dead space drawn exactly like the field. The box reaches the cell's own edges instead, and
   * carries the padding the cell used to, so the words do not move.
   *
   * It is false where the box shares its cell with something else: the words share theirs with the
   * tick box and the depth marks, and a kept value shares its with the stored one.
   */
  fill?: boolean
  /**
   * TRUE WHERE THIS BOX HOLDS WHAT SOMEBODY WROTE IN THE PLAN rather than a stored fact.
   *
   * It is drawn differently — quieter, in italics, on a dashed rule — because the two are different
   * things and a reader has to be able to tell at a glance which one they are looking at. A value in
   * the plan enters no total anywhere until the line is filed as work.
   */
  planned?: boolean
  /**
   * WHICH PLAN THIS BOX BELONGS TO AND WHAT TO CALL IT, so that characters sitting in it unstored
   * are counted where the page says whether the plan is stored.
   *
   * Measured, and the second half of what was rejected: a person typed in a cell of the table
   * while the line above the table said "Stored." A box holding characters that are not what is
   * stored is the plainest possible case of the plan not being stored, and it was the one case that
   * line could not see. Left out where a box writes nothing anybody could lose.
   */
  typing?: { planId: string; box: string }
  /** How tall it may grow before it scrolls inside itself, in lines. Sixteen unless a caller says. */
  growTo?: number
  /**
   * TRUE WHERE THESE ARE A PERSON'S WORDS, so the maths in them is drawn while the cursor is
   * elsewhere. See `drawn` below. Left out for a box holding time words or a size, which are not
   * prose: a dollar sign there is a price.
   */
  drawsMaths?: boolean
  /** Where the drawn words sit in the stored line, by their position in `value`. See PlanMaths.tsx. */
  origin?: TextOrigin
  onStore: (next: string) => void
  failed: string | null
}) {
  const box = useRef<HTMLTextAreaElement>(null)
  // THE NAME OF THIS BOX, HELD STILL, so the cleanup below takes back what this instance said and
  // not what some later render would have said.
  const named = useRef(typing)
  named.current = typing

  /**
   * EVERY SPELLING OF WHAT THIS BOX HAS ALREADY STORED, so a read-back of its own words does not
   * throw the cursor out of it.
   *
   * The box is uncontrolled and keyed on the stored value, which is what lets a person's own undo
   * work inside it. That key is also a trap once a box stores itself while somebody is still typing:
   * the write lands, the plan is read again, the value this box was drawn with becomes the very
   * words in it, the key changes, React builds a NEW text area, and the cursor is gone mid-sentence.
   *
   * So the key only changes for words this box did not write. Somebody else's write still replaces
   * what is on screen, which is right — that is newer news than anything here.
   *
   * BOTH THE TYPED WORDS AND THEIR TRIMMED FORM ARE REMEMBERED, because a planning value is stored
   * trimmed: typing "5h " and pausing stores "5h", and without this the box would be rebuilt around
   * a value it had just sent itself.
   */
  const stored = useRef<Set<string>>(new Set())
  const shownKey = useRef(value)
  if (value !== shownKey.current && !stored.current.has(value)) shownKey.current = value

  useEffect(() => {
    const held = named.current
    if (held === undefined) return
    return () => markTyped(held.planId, held.box, false)
  }, [])
  const hold = (raw: string) => {
    const held = named.current
    if (held !== undefined) markTyped(held.planId, held.box, raw !== value)
  }
  // True between the cell taking focus and the mouse button coming back up. A press selects the
  // words on focus and the browser would then collapse that selection to the point pressed, so the
  // one mouse-up that follows the arrival is refused. See the note above the component.
  const arriving = useRef(false)

  /**
   * THE MATHS IS DRAWN UNTIL THE CURSOR ARRIVES, AND THEN THE CHARACTERS ARE SHOWN.
   *
   * A formula cannot be typed into as a drawing, and a box that showed `$m = \rho V$` for ever would
   * be the plan not drawing its maths. So the words are drawn while nobody is in them, and a press
   * or a Tab turns them into this same box, holding exactly the characters stored, all selected as
   * on any arrival. Leaving the box stores it, as before.
   *
   * THE BOX STAYS WHILE IT HOLDS CHARACTERS THAT ARE NOT STORED. Between leaving it and the plan
   * being read again, the value here is still the old one, and drawing that would show the person
   * their old formula and hide what they typed. When a store is refused the box stays with the
   * reason under it, exactly as a box with no maths does. `typed` is what was left in the box and
   * `over` the value it was typed over; any new value ends the wait, whether it is this box's own
   * write read back or somebody else's.
   *
   * A BOX WITH NO MATHS IN IT IS NEVER DRAWN, so every such box is the text area it always was.
   */
  const [editing, setEditing] = useState(false)
  const unstored = useRef<{ typed: string; over: string } | null>(null)
  if (unstored.current !== null && value !== unstored.current.over) unstored.current = null
  const drawn = drawsMaths && !editing && unstored.current === null && holdsMaths(value)
  const leave = (typed: string) => {
    unstored.current = typed === value || typed.trim() === value ? null : { typed, over: value }
    setEditing(false)
  }
  // THE BOX TAKES THE CURSOR THE MOMENT IT REPLACES THE DRAWING. Its own focus handler then selects
  // the words, which is the arrival every other box on this surface makes.
  useLayoutEffect(() => {
    if (editing && box.current !== null && document.activeElement !== box.current) box.current.focus()
  }, [editing])

  const fit = () => fitToText(box.current, growTo)
  useLayoutEffect(fit, [value, drawn])

  /**
   * THE TIMER THAT STORES WHAT IS IN THE BOX WHEN THE TYPING STOPS. See `STORE_AFTER_TYPING_STOPS`.
   */
  const owed = useRef(0)
  const dropTimer = () => {
    if (owed.current === 0) return
    window.clearTimeout(owed.current)
    owed.current = 0
  }
  useEffect(() => dropTimer, [])
  const commit = (next: string) => {
    dropTimer()
    stored.current.add(next)
    stored.current.add(next.trim())
    onStore(next)
  }
  const commitWhenTypingStops = (next: string) => {
    dropTimer()
    // NOTHING TO STORE, so no write is queued. This is the same check every `onStore` below makes
    // first; making it here as well is what keeps a paused reader from putting a request in the air
    // for a box they only clicked into.
    if (next === value) return
    if (typeof window.setTimeout !== 'function') return
    owed.current = window.setTimeout(() => {
      owed.current = 0
      const el = box.current
      if (el === null) return
      commit(el.value)
    }, STORE_AFTER_TYPING_STOPS)
  }

  // IT REFITS WHEN THE COLUMN CHANGES WIDTH, and that is not a nicety. Flattening the table adds a
  // column, every other column narrows, and a box measured at the old width then clips its words
  // with no scrollbar and no sign that anything is missing. Measured at 1440: "measure the offset
  // at the transplant pose" lost its last three words the moment the table was flattened. The width
  // is remembered so that setting the height, which is itself a resize, cannot loop.
  useLayoutEffect(() => {
    const el = box.current
    const around = el?.parentElement ?? null
    if (el === null || around === null || typeof ResizeObserver === 'undefined') return
    // The box AROUND the words is watched, not the words themselves: setting the height of the words
    // changes their own size and would answer its own question for ever. Only the width is acted on,
    // and the refit is left to the next frame, which is what keeps the browser from reporting a
    // resize loop.
    let wide = around.clientWidth
    let owed = 0
    const watch = new ResizeObserver(() => {
      if (around.clientWidth === wide) return
      wide = around.clientWidth
      window.cancelAnimationFrame(owed)
      owed = window.requestAnimationFrame(fit)
    })
    watch.observe(around)
    return () => {
      window.cancelAnimationFrame(owed)
      watch.disconnect()
    }
    // Again when the drawing gives way to the box, because only the box is watched.
  }, [drawn])

  return (
    <span className="pi-words-box" data-fill={fill ? 'cell' : undefined}>
      {drawn ? (
        <span
          className="pi-words pi-words-drawn"
          role="textbox"
          tabIndex={0}
          aria-label={label}
          title={title}
          data-heading={heading == null ? undefined : String(heading)}
          onFocus={() => setEditing(true)}
          onMouseDown={(event) => {
            // ONLY THE MAIN BUTTON OPENS THE BOX. A right press is how the composer is opened on
            // these words, and it would otherwise focus the drawing and turn it into characters
            // under the menu.
            event.preventDefault()
            if (event.button === 0) setEditing(true)
          }}
        >
          {wordsWithMaths(value, origin)}
        </span>
      ) : (
      <textarea
        ref={box}
        key={shownKey.current}
        className="pi-words"
        rows={1}
        defaultValue={value}
        aria-label={label}
        title={title}
        placeholder={placeholder}
        data-heading={heading == null ? undefined : String(heading)}
        data-said={planned ? 'plan' : undefined}
        onInput={(event) => {
          fit()
          hold(event.currentTarget.value)
          commitWhenTypingStops(event.currentTarget.value)
        }}
        onFocus={(event) => {
          arriving.current = true
          event.currentTarget.select()
          setEditing(true)
        }}
        onMouseUp={(event) => {
          if (!arriving.current) return
          arriving.current = false
          event.preventDefault()
        }}
        onBlur={(event) => {
          arriving.current = false
          commit(event.currentTarget.value)
          leave(event.currentTarget.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit(event.currentTarget.value)
          }
        }}
      />
      )}
      {failed === null ? null : (
        <span className="pi-said" data-ok="0">
          {failed}
        </span>
      )}
    </span>
  )
}

/**
 * The words of an item, written straight back into the line.
 *
 * THE PLANNING VALUES AT THE END OF THE LINE ARE NOT IN THIS BOX and are not touched by it. They
 * have columns of their own on this table, and printing the same size in two cells of one row is
 * how a person comes to change one and believe they have changed both. See `wordsOf` above.
 */
export function ItemWords({ item, acts, canRewrite }: { item: PlanItem; acts: ItemActs } & CanRewrite) {
  const [failed, setFailed] = useState<string | null>(null)
  const said = wordsOf(item)
  const named = { planId: acts.planId, box: `${item.entry.line.id}:words` }

  const store = async (words: string) => {
    if (words === said) {
      // NOTHING TO STORE, so this box is not holding anything unstored either. Without this the
      // line above the plan would sit on "Not stored yet." over a cell whose characters the server
      // already has — the same lie as "Stored." over unstored ones, pointing the other way.
      markTyped(named.planId, named.box, false)
      return
    }
    if (acts.behind) {
      setFailed(t('g8.planitems.whatYouTypedInTheWritingBoxHasNot'))
      return
    }
    setFailed(null)
    const done = await storeOneLine(acts, item.entry.line.id, item.entry.line.text, (base) => ({
      text: lineWithWordsOn(item, base, words),
    }))
    if (done.ok) markTyped(named.planId, named.box, false)
    else setFailed(done.why)
  }

  /**
   * WHERE THESE WORDS SIT IN THE LINE AS IT IS STORED, so a selection inside them can be quoted.
   *
   * The stored string is the whole line — its marker, its words and any planning groups after
   * them. What is drawn here is the words alone. So the offset is the length of the marker, and
   * it is CHECKED against the stored line before it is written: an element carrying an offset
   * promises that the stored string holds exactly these characters at exactly that position, and
   * this is the one place that promise is made about a plan line. A pipe row's cell is not the
   * end of its line, so the check fails there and nothing is written — a comment is then about
   * the row, which is honest, rather than about characters somewhere else in the line.
   *
   * WORDS HOLDING A FORMULA CARRY THE OFFSET ON EACH RUN OF WORDS AND NOT ON THE WHOLE, because
   * a drawn formula is not its characters. See PlanMaths.tsx.
   */
  const raw = item.entry.line.text
  const at = raw.length - item.text.length
  const placed = at >= 0 && raw.slice(at, at + said.length) === said
  const origin: TextOrigin | undefined = placed ? (from) => textAttributes('text', at + from) : undefined

  if (!canRewrite) {
    const maths = holdsMaths(said)
    return (
      <span
        className="pi-words-read"
        data-heading={item.kind === 'heading' && item.level !== null ? String(item.level) : undefined}
        {...(placed && !maths ? textAttributes('text', at) : {})}
      >
        {maths ? wordsWithMaths(said, origin) : said}
      </span>
    )
  }

  return (
    <GrowBox
      value={said}
      label={t('g8.planitems.theWordsOfThisItem')}
      heading={item.kind === 'heading' ? item.level : null}
      typing={named}
      drawsMaths
      origin={origin}
      failed={failed}
      onStore={(next) => void store(next)}
    />
  )
}

/**
 * TAKE THE RECORD'S OWN SHORTER FORM INTO THIS LINE, WHEN SOMEBODY PRESSES.
 *
 * ---------------------------------------------------------------------------------------
 * A PRESS, NOT A DERIVATION
 * ---------------------------------------------------------------------------------------
 *
 * A line that names a record carries that record's level-1 label, or its level-2 title where no
 * label is written, in `shortForm` on the plan read. This press puts those words into the line's
 * own words — the marker and the planning groups stay — and the door holds the result to the same
 * budget a hand-written line is held to. THE WORDS ARE NEVER CUT TO FIT: a title longer than a plan
 * line's budget is refused by the door and the refusal is drawn here, rather than shortened.
 *
 * NOTHING DERIVES THE LINE. The server hands the form over and this sends it back only when
 * somebody presses; a plan whose lines rewrote themselves out of their records would be the machine
 * planning, which P2 forbids.
 *
 * IT IS ALSO NOT THE EXPLANATION. The explanation is the record's words drawn BESIDE the line by
 * the table; taking the form is what moves words INTO the line, and the writer asked for it.
 */
export function ItemShortForm({
  item,
  acts,
  canRewrite,
}: { item: PlanItem; acts: ItemActs } & CanRewrite) {
  const [failed, setFailed] = useState<string | null>(null)
  const form = item.entry.shortForm
  if (form === null || !canRewrite) return null

  const store = async () => {
    if (acts.behind) {
      setFailed(t('g8.planitems.whatYouTypedInTheWritingBoxHasNot'))
      return
    }
    setFailed(null)
    const done = await storeOneLine(acts, item.entry.line.id, item.entry.line.text, (base) => ({
      text: lineWithWordsOn(item, base, form.text),
    }))
    if (!done.ok) setFailed(done.why)
  }

  return (
    <span className="pi-shortform">
      <button type="button" className="pt-press" onClick={() => void store()}>
        {form.level === 'label' ? t('g8.planitems.useTheLabel') : t('g8.planitems.useTheTitle')}
      </button>
      {failed === null ? null : (
        <span className="pi-said" data-ok="0">
          {failed}
        </span>
      )}
    </span>
  )
}

/** One of the writer's own cells, written straight back into their pipe row. */
export function ItemCell({
  item,
  cell,
  acts,
  canRewrite,
}: { item: PlanItem; cell: PlanItemCell; acts: ItemActs } & CanRewrite) {
  const [failed, setFailed] = useState<string | null>(null)
  const named = { planId: acts.planId, box: `${item.entry.line.id}:cell${cell.at}` }

  const store = async (value: string) => {
    if (value === cell.value) {
      markTyped(named.planId, named.box, false)
      return
    }
    if (acts.behind) {
      setFailed(t('g8.planitems.whatYouTypedInTheWritingBoxHasNot'))
      return
    }
    setFailed(null)
    const done = await storeOneLine(acts, item.entry.line.id, item.entry.line.text, (base) => ({
      text: withCellReplaced(base, cell.at, value),
    }))
    if (done.ok) markTyped(named.planId, named.box, false)
    else setFailed(done.why)
  }

  // A CELL HOLDING A FORMULA CARRIES ITS OFFSET ON EACH RUN OF WORDS, and the table leaves it off
  // the cell. A cell without one is placed by the table, on the cell, as before. See PlanMaths.tsx.
  const at = holdsMaths(cell.value) ? whereACellSits(item.entry.line.text, cell) : null
  const origin: TextOrigin | undefined = at === null ? undefined : (from) => textAttributes('text', at + from)

  if (!canRewrite) return <span className="pi-words-read">{wordsWithMaths(cell.value, origin)}</span>

  return (
    <GrowBox
      value={cell.value}
      label={t('g8.planitems.fromYourOwnTable', { value1: cell.heading })}
      typing={named}
      // EACH CELL IS READ ALONE, so a dollar sign in one cell never pairs with one in the next.
      drawsMaths
      origin={origin}
      failed={failed}
      onStore={(next) => void store(next)}
    />
  )
}

/**
 * The writer's own note about this item. The one planning value that never moves to a record.
 *
 * IT IS A LINE OF THE DOCUMENT LIKE ANY OTHER NOW, so `canRewrite` governs it. The note used to be
 * a column of its own in the database and this box wrote to that column, which changed no character
 * of the document; since the note moved into the line's own words, storing one rewrites the line —
 * and a surface that cannot hand the new line back to whoever holds the plan would have the writing
 * box store the old words over it on the next keystroke. That is the defect at the head of
 * PlanTable.tsx, and it applies to this box now.
 *
 * THE WORDS GO THROUGH `remark` AND NOT THROUGH THE TEXT, because the server already writes a note
 * into a line for every caller that sends one, using the one writer of the syntax. Building the new
 * line here as well would be a second writer of the same value.
 */
export function ItemNote({ item, acts, canRewrite }: { item: PlanItem; acts: ItemActs } & CanRewrite) {
  const [failed, setFailed] = useState<string | null>(null)
  const written = writtenValue(item, 'note')
  const stored = written.said ?? ''
  const named = { planId: acts.planId, box: `${item.entry.line.id}:note` }

  const store = async (value: string) => {
    if (value === stored) {
      markTyped(named.planId, named.box, false)
      return
    }
    if (acts.behind) {
      setFailed(t('g8.planitems.whatYouTypedInTheWritingBoxHasNot'))
      return
    }
    const why = whyValueCannotBeWritten('note', value)
    if (why !== null) {
      setFailed(why)
      return
    }
    setFailed(null)
    // An emptied note is CLEARED and not stored as an empty string, so "nobody wrote one" stays
    // one answer rather than two that draw the same.
    //
    // IT GOES THROUGH THE SAME QUEUE AS THE WRITES THAT CHANGE CHARACTERS, even though the server
    // writes this one into the line itself. A note stored while a size was on its way used to be
    // written and then wiped out by the size's own line, because that line was built without it.
    const done = await storeOneLine(acts, item.entry.line.id, item.entry.line.text, () => ({
      remark: value.trim() === '' ? null : value,
    }))
    if (done.ok) markTyped(named.planId, named.box, false)
    else setFailed(done.why)
  }

  if (written.refused !== null) return <Absence word={t('g8.planitems.writtenTwice')} title={written.refused} />
  if (!canRewrite) {
    // A DASH AND NO SENTENCE. This line holds no note, the heading above says what the column is,
    // and a sentence here would be one more thing repeated on every row of the table.
    return written.said === null ? <Absence /> : <span className="pi-words-read">{wordsWithMaths(written.said)}</span>
  }

  return (
    <GrowBox
      value={stored}
      label={t('g8.planitems.yourOwnNoteAboutThisItem')}
      // THE EMPTY NOTE IS THE CELL THE OWNER FOUND BY ACCIDENT. See PLANNING_PLACEHOLDERS.
      placeholder={PLANNING_PLACEHOLDERS.note}
      typing={named}
      fill
      // IT GROWS WITH THE NOTE, up to sixteen lines, and then scrolls inside itself — the rule the
      // owner set on 17 August 2026 about every multiline box a person writes in. A note is ONE LINE
      // of the document, so it holds no line endings; sixteen lines is what wrapping reaches in a
      // narrow column, and it is the same ceiling `TextArea` in components/ui.tsx uses.
      growTo={GROW_TO_LINES}
      drawsMaths
      failed={failed}
      onStore={(next) => void store(next)}
    />
  )
}

/**
 * WHAT SOMEBODY WROTE THAT NOTHING WAS SCHEDULED FROM, read off this line's own read.
 *
 * These are the words Mole Office kept and could not turn into a date — `next week` before the reader
 * pressed anything, `sometime in September`, `before Friday`. They live in the intent layer, they
 * are in no total and they give nothing any time. The server hands them back with every read of the
 * plan, marked as not canonical, so this is a reading of the same rows the Writing view reads.
 */
export function keptWordsOf(item: PlanItem, which: PlanningKey): string[] {
  return item.entry.derived.filter((one) => one.key === which && !one.canonical).map((one) => one.says)
}

/** One row of kept words as the plan read hands it back, with the id it is stored under. */
export type KeptTimeWords = PlanLineWithWork['kept'][number]

/**
 * THE SAME KEPT WORDS, WITH THE ID EACH ONE IS STORED UNDER, so a box can write to it.
 *
 * `keptWordsOf` above reads the derived list, which carries the words and nothing else. The server
 * builds that list FROM this one, in one place, and says so — so these are the same words one step
 * closer to where they live. A box that changes them needs the id, which is why this exists.
 *
 * IT IS NOT A SECOND ANSWER, AND A TEST HOLDS THAT. `tests/time-given-stays-editable.test.ts` checks
 * that the words here and the words in `keptWordsOf` are the same list in the same order, so the two
 * cannot drift into saying different things about one line.
 *
 * TIME AND NOTHING ELSE. Kept words are what somebody wrote about WHEN; a size and a project have no
 * intent layer, so the answer for those keys is that there are none.
 */
export function keptRowsOf(item: PlanItem, which: PlanningKey): readonly KeptTimeWords[] {
  return which === 'time' ? item.entry.kept : []
}

/**
 * THE KEPT WORDS, DRAWN IN THE CELL, BEFORE AND AFTER THE LINE IS FILED.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FIXES: TWO VIEWS OF ONE PLAN SAYING OPPOSITE THINGS
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 16 August 2026, in one browser window, on one line: the Table's Time given cell read
 * "no hours", meaning nobody had given this work any time, while the Writing view of the same plan
 * an inch below read "next week — you wrote this and nothing has been scheduled from it". The words
 * were kept, the Table had no reader for them, and so the Table denied they existed.
 *
 * WHY IT IS SAID IN WORDS AND NOT IN A TOOLTIP. A tooltip is hover-only, so it is not there on a
 * phone and not there for anybody scanning. Three words are the whole of what a reader needs:
 * these are your words, and no week has them.
 *
 * ---------------------------------------------------------------------------------------
 * THE SECOND DEFECT: THE MARK USED TO DENY THE HOURS PRINTED DIRECTLY ABOVE IT
 * ---------------------------------------------------------------------------------------
 *
 * The mark read "not scheduled". Measured in Chromium on 17 August 2026, two rows of one table:
 *
 *     Build the arm controller   2026-W35 20h
 *                                next week    not scheduled
 *
 * The work really has 20 hours in that week. "not scheduled" has no subject, so a reader takes it
 * for the nearest thing it could be about, which is the allocation an inch above it.
 *
 * "gave nothing any time" is a verb phrase, and its subject is the words immediately to its left.
 * It says the one fact the mark exists to carry — Mole Office kept these words and no hours came out of
 * them — and it cannot be read as a claim about the work. It is true wherever the mark is drawn,
 * because these are by definition the values Mole Office could not turn into hours, so it is ONE phrase
 * and not a phrase per situation: a mark with two wordings is a fact worked out twice.
 *
 * IT SHARES NO WORD WITH THE TWO MARKS IT SITS BESIDE, and that is deliberate. "gave no hours" was
 * tried first and rejected: the empty cell already draws an Absence reading "no hours", meaning the
 * WORK has none anywhere, so a reader scanning past "gave no hours" beside 20 stored hours would
 * have met the same defect one step quieter. It is the sentence this cell's own tooltip has always
 * carried — "so it is in no total and gives nothing any time" — said in the past tense.
 */
export const KEPT_WORDS_MARK = en['g8.planitems.gaveNothingAnyTime']

/**
 * THE THIRD DEFECT, MEASURED IN CHROMIUM ON 17 AUGUST 2026: FILING TOOK THE WORDS OUT OF REACH
 * ---------------------------------------------------------------------------------------
 *
 * One row, one window, 1440 by 900. Before the line was filed, its Time given cell was a box you
 * type in, labelled "Time given" for this item, in your own words, holding `next week`. Filing the
 * line with "Make it real work" moved `{time: next week}` out of the prose and into the kept words,
 * and the cell became a read-only chip. The words were still on screen and there was no longer
 * anywhere to change them or clear them. A tester spent 45 seconds trying and gave up.
 *
 * The How big column of the same row already showed what right looks like: the canonical hours box
 * and the person's own words side by side, both boxes, before and after filing. So the kept words
 * get a box too, with the same label, the same placeholder and the same drawing they had before
 * filing. What changed at filing is where Mole Office keeps the words. That is Mole Office's business, not
 * something a person should have to notice.
 *
 * WHERE THE BOX WRITES. `POST /api/planning/intents` — the same one door `GiveItTime` uses. The
 * server replaces what this line last said about time in one transaction, so typing here cannot
 * leave the line holding two answers and cannot leave it holding none. Emptying the box is a
 * DELETE, which is how a person takes their own words off a line.
 *
 * NOTHING IT WRITES IS A SCHEDULE. Kept words are the first layer of the eighth rule: they enter no
 * total, use no capacity, and make no week look full. The mark beside the box goes on saying so.
 */
export function KeptWords({
  item,
  which,
  acts,
}: {
  item: PlanItem
  which: PlanningKey
  /**
   * The surface to write through, where this cell has no other box for the same words.
   *
   * LEFT OUT MEANS READ-ONLY, AND THAT IS NOT CAUTION. A cell must not offer two boxes for one
   * question: on a line nobody has filed, `ItemPlanned` already draws the box that holds what the
   * line says about time, and a second box beside it holding nearly the same words is the "one cell,
   * two answers" defect `StoredEstimate` names. The caller decides, because the caller is what knows
   * the rest of the cell.
   */
  acts?: ItemActs
}) {
  const kept = keptRowsOf(item, which)
  if (kept.length === 0) return null
  return (
    <span className="pi-kepts">
      {kept.map((row) => (
        <KeptWordsOne key={row.id} item={item} row={row} acts={acts} />
      ))}
    </span>
  )
}

/** One kept phrase: the words, and the mark that says no hours came out of them. */
function KeptWordsOne({ item, row, acts }: { item: PlanItem; row: KeptTimeWords; acts?: ItemActs }) {
  const [failed, setFailed] = useState<string | null>(null)
  /**
   * WHAT ELSE THIS WRITE TOOK OFF THE LINE, when it took anything a person had not just retyped.
   *
   * A line holds one answer about time and the server replaces the old one on every write. Where the
   * row being edited is the only one, that is the ordinary case and there is nothing to report.
   * Where a line holds more — databases written before that rule existed hold them, and this
   * installation's own corpus is one of them — writing here also takes the others away, and a person
   * who is not told cannot tell a replacement from rows they now have to go and find.
   */
  const [alsoWent, setAlsoWent] = useState<string | null>(null)

  const named = { planId: acts?.planId ?? '', box: `${item.entry.line.id}:kept:${row.id}` }

  const store = async (typed: string) => {
    if (acts === undefined) return
    setFailed(null)
    setAlsoWent(null)
    const change = await changeKeptWords(item, row, typed)
    if (!change.outcome.ok) {
      setFailed(change.outcome.said)
      return
    }
    if (change.alsoWent.length > 0) {
      setAlsoWent(
        t('g8.planitems.thisLineAlsoSaidAboutTimeALineHolds', { value1: change.alsoWent.map((one) => JSON.stringify(one.said)).join(' and ') }),
      )
    }
    markTyped(named.planId, named.box, false)
    if (change.did !== 'nothing') acts.reload()
  }

  if (acts === undefined) {
    return (
      <span className="pi-kept">
        <span className="pi-kept-words">{row.said}</span>
        <span className="pi-kept-mark">{t('g8.planitems.gaveNothingAnyTime')}</span>
      </span>
    )
  }

  return (
    <span className="pi-kept" data-edit="1">
      <GrowBox
        value={row.said}
        // THE SAME LABEL THE BOX HAD BEFORE THE LINE WAS FILED. It is the same question about the
        // same line, and the two are never drawn together — see `acts` on KeptWords.
        label={t('g8.planitems.forThisItemInYourOwnWords', { value1: PLANNING_WORDS.time })}
        placeholder={PLANNING_PLACEHOLDERS.time}
        title={
          t('g8.planitems.whatYouWroteAboutWhenKeptExactlyAsYou')
        }
        typing={named}
        planned
        failed={failed}
        onStore={(next) => void store(next)}
      />
      <span className="pi-kept-mark">{t('g8.planitems.gaveNothingAnyTime')}</span>
      {alsoWent === null ? null : (
        <span className="pi-said" data-ok="1">
          {alsoWent}
        </span>
      )}
    </span>
  )
}

/**
 * WHAT MOLE OFFICE READ OUT OF THE TIME WORDS ON THIS LINE, BEFORE ANYBODY HAS FILED IT AS WORK.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FIXES: THE THIRD QUESTION WAS ANSWERED ON ONE SIDE OF FILING ONLY
 * ---------------------------------------------------------------------------------------
 *
 * A scheduling surface has to answer three things — when, how much, and what did Mole Office understand.
 * Measured in a browser on 16 August 2026: `next week` typed into the Time given cell of a line
 * nobody had filed was kept perfectly, through both views, a save and a reload, and Mole Office never
 * said what it made of it. The live reading lived inside the "Give it time" control, and that press
 * is only drawn on a row already filed as work. So the question was answered after filing and never
 * before it.
 *
 * READING WORDS COSTS NOTHING AND COMMITS NOTHING, which is why this needs no record: it says what
 * the readers in src/shared/planning.ts made of the words and it writes nowhere.
 *
 * ---------------------------------------------------------------------------------------
 * IT SAYS "not scheduled" IN THE SAME BREATH, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * `reads 2026-W35` on its own would look like something had been put in that week. Nothing has, and
 * nothing can be until the line is work: a period needs a record to give hours to.
 *
 * THIS ONE STAYS "not scheduled" WHILE `KeptWords` ABOVE SAYS "gave nothing any time", and the
 * difference
 * is the subject. `KeptWords` marks WORDS somebody wrote, and it is drawn beside stored hours, so
 * it has to say what it is about. This marks a PERIOD Mole Office read, on a line nobody has filed as
 * work, where no hours can exist at all — so there is nothing here for it to be mistaken for, and
 * "not scheduled" is the exact thing a reader needs told about a bare week key.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS ONE LINE, WITH NO BOX AROUND IT, AND THAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The owner has twice said scheduling feedback takes over this table. Drawn as a bordered chip like
 * the kept words above, this reading wrapped onto three lines in a 140px column and took a row from
 * 27 pixels to 63 — measured at 1440 on 17 August 2026. So it is plain text, at the smallest size
 * on this surface, and short enough to sit on one line: the period key, then the state. The verb is
 * left out for the same reason; the words it was read from are directly above it in the same cell.
 *
 * The whole of what the two readers said — which word stopped them, what shapes they read — is on
 * the line for a reader who rests on it, and is never the only place anything is said.
 */
export function ReadOfTimeWords({ said, today }: { said: string; today: Date | null }) {
  if (said.trim() === '') return null
  // NO DAY, NO READING. "next week" is only a week once you know which day it is being read from,
  // and this browser's own clock is not that day. See `today` in ItemActs.
  if (today === null) return null
  /**
   * ONE READER, ASKED TWICE: once for the sentence it writes about the whole phrase, and once for
   * the parts of what it read, so the period can be drawn as a person says it.
   *
   * `timeWordsSaid` is a formatter over `readTimeWords` — it calls it and joins its answers into one
   * string. So these two cannot disagree about anything: they are the same reading, and nothing here
   * reads the words for itself. See `PeriodInWords` for why the key is not what is drawn.
   */
  const reading = timeWordsSaid(said, today)
  const parts = readTimeWords(said, today)
  return (
    <span className="pi-read" title={reading.how}>
      <span className="pi-read-said">
        {reading.read === null ? (
          t('g8.planitems.noDateRead')
        ) : (
          <>
            {parts.period.read ? <PeriodInWords period={parts.period.period.key} /> : null}
            {parts.period.read && parts.hours.read ? ', ' : null}
            {parts.hours.read ? t('g8.progress.h', { value1: parts.hours.hours }) : null}
          </>
        )}
      </span>
      {/* THE STATE IS SAID WHERE A READING COULD BE MISTAKEN FOR ONE, AND NOWHERE ELSE. "Week of 24
          August" on its own looks like something put in that week; nothing was, and nothing can be
          until the line is work. "no date read" cannot be mistaken for a schedule, so it is left to
          stand on its own — which is also the difference between one line in this column and two. */}
      {reading.read === null ? null : <span className="pi-kept-mark">{t('g8.planitems.notScheduled')}</span>}
    </span>
  )
}

/**
 * A PERIOD DRAWN THE WAY A PERSON SAYS IT, WITH THE STORED KEY KEPT FOR INSPECT.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT, MEASURED IN CHROMIUM ON 17 AUGUST 2026 AT 1440 BY 900
 * ---------------------------------------------------------------------------------------
 *
 * A cell of the plan table read "2026-W35 20h", and the row under it read "2026-W35 · not
 * scheduled". A person should not be required to know an internal way of writing a date.
 * `2026-W35` is a stored key — ISO-8601, Monday first, and the year in it is the
 * week-year rather than the calendar year. It is exactly right and no reader should have to know it.
 *
 * SO NORMAL MODE SAYS "Week of 24 August" AND INSPECT KEEPS THE KEY. Nothing is destroyed and
 * nothing becomes unreachable, which is what docs/UX-CONTRACT.md asks of every raw stored value:
 * the key is conditionally rendered in Inspect rather than hidden with CSS, so a screen reader on a
 * page showing none does not read it out. The days the period covers are on the mark for anybody who
 * rests on it.
 *
 * NOTHING STORED OR SENT CHANGES. This is drawing. The key is what the schedule is written with, what
 * a period address is, and what every request carries; only the characters on this cell change.
 *
 * IT IS `periodSaid` AND NOT A SECOND NAMER. That function names a period for the schedule and for
 * the plan page already. A week called "Week of 24 August" here and something else there would be
 * one fact worked out in two places, which is the defect this repository keeps finding.
 *
 * THE DAY IS DELIBERATELY NOT PASSED IN. `periodSaid` can say "This week" and "Next week" when it
 * knows what day it is, and in this column it must not: the cell already prints the words a person
 * typed, which are often "next week", and Mole Office answering "Next week" beside them would put the
 * same two words on screen meaning two different things — what the person wrote, and what Mole Office read. A
 * dated name cannot be confused with either.
 */
export function PeriodInWords({ period }: { period: string }) {
  const inspect = useInspect()
  const said = periodSaid(period, null)
  // A KEY NOTHING CAN PLACE ON A CALENDAR IS PRINTED AS IT IS STORED, which is what `periodSaid`
  // already answers with, and its range says why. Drawing the key twice in Inspect would be the
  // stored value said once as a name and once as itself.
  const placed = parsePeriod(period) !== null
  return (
    <span className="pi-period-key" title={said.range}>
      {said.name}
      {inspect && placed ? <span className="pi-period-stored">{period}</span> : null}
    </span>
  )
}

/**
 * ONE PLANNING VALUE AS THE LINE ITSELF SAYS IT, WRITTEN BACK INTO THE LINE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS: YOU ESTIMATE IN ORDER TO DECIDE WHETHER TO FILE, NOT THE OTHER WAY ROUND
 * ---------------------------------------------------------------------------------------
 *
 * How big something is, how much time it gets and which project it belongs to could only be written
 * on a line somebody had already filed as work. That is backwards: filing an
 * item as real work must PROMOTE what you know about it, not unlock the ability to say it. So every
 * one of these can be written on any line, and until the line is filed the words live in the line
 * itself, where the Writing view shows them.
 *
 * ---------------------------------------------------------------------------------------
 * AND WHAT IS WRITTEN HERE IS NOT A FACT ABOUT THE PROJECT
 * ---------------------------------------------------------------------------------------
 *
 * It is what somebody wrote down. It is in no total, uses no capacity, and counts as no work
 * planned; filing the line is what moves each value to the place Mole Office keeps that kind of fact.
 * The box says so — it is drawn quietly, in italics, on a dashed rule, and carries the sentence —
 * because a number that looks stored and is not is the worst thing a planning surface can draw.
 */
export function ItemPlanned({
  item,
  acts,
  which,
  canRewrite,
}: { item: PlanItem; acts: ItemActs; which: PlanningKey } & CanRewrite) {
  const [failed, setFailed] = useState<string | null>(null)
  const written = writtenValue(item, which)
  const word = PLANNING_WORDS[which]
  /**
   * ONE SHORT SENTENCE, AND IT IS NOT THE ONLY PLACE THIS IS SAID.
   *
   * It used to be three clauses, and it was the whole explanation of what a planned value is,
   * carried by a native tooltip — hover-only, so it did not exist on a phone and did not exist for
   * anybody scanning the table. The drawing says it now: quieter ink, italics and a dashed rule,
   * which is what tells a value somebody wrote from a value Mole Office stores and counts.
   */
  const sentence = t('g8.planitems.asYouWroteItSoItIsInNo', { value1: word })
  /**
   * TRUE WHERE THIS BOX IS THE WHOLE CELL. An unfiled line has no stored value in these columns, so
   * the box is the cell and takes all of it. A filed line's cell holds the stored value first and
   * this box beside it, so it may not.
   */
  const wholeCell = item.entry.work === null
  /**
   * WHAT MOLE OFFICE MADE OF THE TIME WORDS, WHEREVER THE LINE'S OWN TIME WORDS ARE DRAWN.
   *
   * It is the time column and no other. A size and a project are not read against a calendar, so
   * there is nothing for a reader to say about them here; hours written into the time words ARE read,
   * because "15h this week" is one sentence holding both halves. See `ReadOfTimeWords`.
   */
  const reading =
    which === 'time' && written.said !== null ? (
      <ReadOfTimeWords said={written.said} today={acts.today} />
    ) : null

  const named = { planId: acts.planId, box: `${item.entry.line.id}:${which}` }

  const store = async (value: string) => {
    if (value.trim() === (written.said ?? '')) {
      markTyped(named.planId, named.box, false)
      return
    }
    if (acts.behind) {
      setFailed(t('g8.planitems.whatYouTypedInTheWritingBoxHasNot'))
      return
    }
    const why = whyValueCannotBeWritten(which, value)
    if (why !== null) {
      setFailed(why)
      return
    }
    setFailed(null)
    const done = await storeOneLine(acts, item.entry.line.id, item.entry.line.text, (base) => ({
      text: lineWithPlanningValue(base, which, value),
    }))
    if (done.ok) markTyped(named.planId, named.box, false)
    else setFailed(done.why)
  }

  if (written.refused !== null) return <Absence word={t('g8.planitems.writtenTwice')} title={written.refused} />
  if (!canRewrite) {
    // A DASH AND NO SENTENCE, for the reason in ItemNote above: the line says nothing here, and a
    // sentence saying so would be repeated on every row of three columns.
    return (
      <>
        {written.said === null ? (
          <Absence />
        ) : (
          <span className="pi-words-read" data-said="plan" title={sentence}>
            {written.said}
          </span>
        )}
        {reading}
        {wholeCell ? <KeptWords item={item} which={which} /> : null}
      </>
    )
  }

  return (
    <>
      <GrowBox
        value={written.said ?? ''}
        label={t('g8.planitems.forThisItemInYourOwnWords', { value1: word })}
        // AN EMPTY CELL SAYS WHAT GOES IN IT. Three of the four blank columns the owner met are
        // this component with nothing written in the line. See PLANNING_PLACEHOLDERS.
        placeholder={PLANNING_PLACEHOLDERS[which]}
        fill={wholeCell}
        title={sentence}
        typing={named}
        planned
        failed={failed}
        onStore={(next) => void store(next)}
      />
      {reading}
      {/* THE WORDS MOLE OFFICE KEPT AND SCHEDULED NOTHING FROM, on an unfiled line. A filed line's cell
          draws them beside the stored hours instead — see ItemHours — so drawing them here as well
          would print the same kept words twice in one cell. */}
      {wholeCell ? <KeptWords item={item} which={which} /> : null}
    </>
  )
}

/**
 * The same box, drawn only where the line still says something.
 *
 * It is what a cell puts BESIDE a stored value: a line filed as work usually has its planning values
 * moved onto the record and taken out of the text, and the ones that could not move stay in the line
 * — a size on a kind with no estimate, a project that disagrees with the one it was filed in, a time
 * nobody could read. Those must stay visible in the Table, or the Table becomes the one place a
 * value written in the plan cannot be seen.
 */
export function ItemKept({
  item,
  acts,
  which,
  canRewrite,
}: { item: PlanItem; acts: ItemActs; which: PlanningKey } & CanRewrite) {
  const written = writtenValue(item, which)
  if (written.said === null && written.refused === null) return null
  return <ItemPlanned item={item} acts={acts} which={which} canRewrite={canRewrite} />
}

/**
 * WHERE A TRACKED ITEM STANDS: a small mark beside its words, and its record one press away.
 *
 * ---------------------------------------------------------------------------------------
 * IT LOST ITS COLUMN ON 17 AUGUST 2026, AND THAT IS THE OWNER'S CORRECTION
 * ---------------------------------------------------------------------------------------
 *
 * This used to head a column of its own called "Where it stands". The owner pointed out that it
 * mixed the item's state with what the item actually is, and asked that a status such as todo, open
 * or done stay a small state mark near the task rather than take a major column, unless it earns one.
 *
 * A column earns its width by being scanned or edited. Nothing on this table edits a state — the
 * state belongs to the record — and `todo` on almost every row is not worth a sixth of the table.
 * So the mark moved next to the words, where a person reads it as part of the line, and the width
 * it was using went to Estimate, Schedule, Project and Note, which ARE edited here.
 */
export function ItemStands({ item }: { item: PlanItem }) {
  const work = item.entry.work
  if (work === null) return null
  return (
    <span className="pi-stands">
      <StoredState state={work.state} source={work.stateSource} progress={progressOf(work.state)} kind={work.kind} />
      <OriginMark record={{ origin: work.origin }} only="exceptions" />
      {/* THE WAY TO THE RECORD, AS A MARK RATHER THAN THE WORD "open".
          MEASURED, 17 AUGUST 2026, once the state mark moved next to the task: a row of an obligation
          read "open open" — the state, and the link to the record, a few pixels apart in the same
          cell. One of them is a state a person acts on and the other is a way out of this page, and
          the two were the same word. It is an arrow now, with the whole sentence on its label. */}
      <RouteLink
        to={recordPath(work.id)}
        className="pi-open"
        title={t('g8.table.openTheRecordFor', { value1: work.title })}
      >
        <span aria-hidden="true">↗</span>
        <span className="px-sr">{t('g8.table.openTheRecordFor', { value1: work.title })}</span>
      </RouteLink>
    </span>
  )
}

// ============================================================================ the tick and the state

/**
 * A TICK IN THE DOCUMENT AND A STATE ON THE RECORD ARE TWO FACTS, AND THIS ROW SAYS WHEN THEY
 * DISAGREE.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT, MEASURED BY TWO TESTERS ON 18 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * Focus the tick box on a tracked line and press Space. The tick goes on. The state mark a few
 * centimetres away on the SAME ROW still reads "to do", and nothing says why. One tester
 * photographed the two in one frame. Underneath, the tick had written `- [x]` into the plan's text
 * and touched no record at all.
 *
 * ---------------------------------------------------------------------------------------
 * THE ANSWER TAKEN, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * **THE TICK STAYS THE DOCUMENT'S, AND THE ROW SAYS WHEN THE TWO DISAGREE, WITH THE PRESS THAT
 * SETTLES IT.** Both facts are real and Mole Office may not quietly make one of them mean the other:
 *
 *   A TICK BOX IS SOMEBODY'S OWN WRITING. `- [x]` is characters in a document a person typed, and
 *   the writing view shows it as text. Writing a record's state from a keystroke in a document
 *   would make Mole Office author a claim on the record that nobody made there.
 *
 *   A STATE IS THE RECORD'S ANSWER AND EVERY OTHER SURFACE COUNTS IT. The schedule, the deadline
 *   report and Home all read it.
 *
 * **THE DECIDING REASON IS THAT THE OTHER DIRECTION CANNOT BE CLOSED.** Finishing work on the
 * schedule, or on the record's own page, writes the record and no document anywhere. So even if a
 * tick wrote the state, a row could still show an empty box beside "done" and nothing would say so.
 * A tick that wrote state would fix half of a disagreement and hide the other half — and hiding it
 * is the thing that was wrong here in the first place.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OTHER ANSWER WOULD HAVE COST
 * ---------------------------------------------------------------------------------------
 *
 * The other defensible answer is that ticking a tracked line MARKS THE WORK DONE, because that is
 * plainly what a person ticking a box means. Its price, written down so nobody has to work it out
 * again:
 *
 *   1. THE FINISHING WORD IS THE KIND'S. A task and a block finish at `done`, an obligation at
 *      `fulfilled` or `cancelled`, a problem at `fixed`, `worked_around` or `accepted`, and a
 *      direction has no state field at all. So a tick box would have to open several words as
 *      presses — a control that shows a menu when you press Space, which is not what a tick box
 *      does anywhere else, and which cannot be finished from the keyboard in one press.
 *   2. UNTICKING HAS NO HONEST ANSWER. "Not finished" is `todo` on one record and `doing` on
 *      another, and the line does not know which this was. Writing either is a guess, which the
 *      fifth invariant forbids; asking is a second menu on a tick box.
 *   3. IT WOULD STILL LEAVE THE OTHER HALF SILENT, for the reason above.
 *
 * That is three controls and one guess to fix one direction. This is one sentence and one press,
 * and it fixes both directions.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN THERE IS NOTHING TO SAY
 * ---------------------------------------------------------------------------------------
 *
 * ONLY A LINE THAT REALLY HOLDS A TICK BOX CAN DISAGREE WITH ANYTHING. A plain bullet reads as "not
 * ticked" because ticking one WRITES a box into it — that is an offer, not a mark in the document —
 * so an unticked bullet beside finished work is not a contradiction and gets no sentence. That is
 * the same rule `ItemTick` above draws by.
 */
export function TickAgainstState({ item, acts }: { item: PlanItem; acts: ItemActs }) {
  const [busy, setBusy] = useState(false)
  const work = item.entry.work
  if (work === null || item.kind !== 'tickbox' || item.ticked === null) return null
  const finished = progressOf(work.state) === 'finished'
  const disagrees = item.ticked !== finished
  const endings = endingWordsOf(work.kind)
  const write = async (word: string) => {
    setBusy(true)
    try {
      const undo = await changeWorkWithUndo(work, word)
      await acts.reload()
      return async () => { await undo(); await acts.reload() }
    } finally { setBusy(false) }
  }
  return <div className={disagrees ? 'pi-apart' : undefined}>
    {disagrees ? finished ? <span>{t('g8.planitems.whereTheWorkStandsIsThisLineIsNot', { value1: stateWord(work.state).text })}</span> : <span>
      {work.state === null
        ? t('g8.planitems.youTickedThisLineNobodyHasWrittenWhereThe')
        : t('g8.planitems.youTickedThisLineWhereTheWorkStandsIs', { value1: stateWord(work.state).text })}
    </span> : null}
    {disagrees && !finished && endings.length === 0 ? <span className="pi-apart-none">{t('g8.planitems.aDoesNotRecordBeingFinishedSoTheTick', { value1: kindWord(work.kind).text })}</span> : null}
    <div className="pi-apart-acts">
      {endings.map(word => <PlanUndoPress key={word}
        press={t('g8.planitems.sayItIs', { value1: stateWord(word).text })} done={t('g8.planitems.theWorkStateChanged')}
        available={disagrees && !finished} disabled={busy} onPress={() => write(word)} />)}
    </div>
  </div>
}


// ============================================================================ what sort of thing it is

/** What a line is tracked as when nobody has said otherwise. Almost every line of a plan is one. */
export const A_LINE_IS_A_TASK_UNLESS_YOU_SAY: RecordKind = 'task'

/**
 * WHAT `Track` WILL FILE ONE LINE AS, BEFORE IT IS TRACKED, held for as long as the page is open.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT STORED ANYWHERE AND THE CELL SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * Estimate, Schedule, Project and Note each have a place in the line itself — the trailing
 * `{size: …}` groups that `src/shared/planline.ts` reads — so writing one of those in a cell writes
 * a character of the document and survives a reload. THERE IS NO SUCH GROUP FOR A TYPE. That file
 * declares four keys and it is not this pass's file to change.
 *
 * So what this holds is a CHOICE THAT HAS NOT BEEN MADE YET, not a stored fact, and it is drawn as
 * one: the column's own help says plainly that nothing keeps it until Track is pressed. That is
 * honest, and it is still the owner's correction — Type and Project should already be available
 * where they belong in the table — because the choice has moved out of a form nobody could see
 * into the column that shows the concept.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A MAP HERE RATHER THAN STATE IN THE TABLE
 * ---------------------------------------------------------------------------------------
 *
 * Two things read it: the cell, and the press that tracks the line. The press is inside a form the
 * cell does not contain, and passing the choice down through the column declaration would put it in
 * the shape of every other cell that has no use for it. This is the same arrangement `WRITING` above
 * uses for the same reason, in the same file.
 */
const KIND_FOR_TRACKING = new Map<string, RecordKind>()
const kindWatchers = new Set<() => void>()

function kindKey(planId: string, lineId: string): string {
  return `${planId}:${lineId}`
}

/** What Track will file this line as. A task, until somebody says otherwise in the Type cell. */
export function kindChosenFor(planId: string, lineId: string): RecordKind {
  return KIND_FOR_TRACKING.get(kindKey(planId, lineId)) ?? A_LINE_IS_A_TASK_UNLESS_YOU_SAY
}

/** Say what Track should file this line as. Nothing is written until Track is pressed. */
export function chooseKindFor(planId: string, lineId: string, kind: RecordKind): void {
  KIND_FOR_TRACKING.set(kindKey(planId, lineId), kind)
  for (const on of kindWatchers) on()
}

/**
 * WHAT SORT OF THING THIS LINE IS: chosen before it is tracked, and changed on the record after.
 *
 * ---------------------------------------------------------------------------------------
 * A MISTAKEN FIRST CHOICE MUST NOT LOCK THE RECORD
 * ---------------------------------------------------------------------------------------
 *
 * The owner, 17 August 2026: after filing or tracking a planning line, there was no natural way to
 * change what kind of thing it is. A mistaken first choice must not lock the record for good, and the
 * type must be changeable from the normal surface.
 *
 * So one menu, on both sides of tracking, and only what it WRITES changes: before, it is the choice
 * `Track` will use, held for as long as the page is open; after, it is a write to the record.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING STORED IS DISCARDED, AND THE CELL SAYS WHERE IT WENT
 * ---------------------------------------------------------------------------------------
 *
 * Where changing the type makes some canonical fields invalid, what can be
 * kept is kept and the real incompatibility is shown, and no data is ever silently discarded. A
 * field the new kind has no place for is
 * moved into `extra` by the server, and the reply names every one of them. That sentence is drawn in
 * the cell, because it is the only place a person is told their stored answers moved.
 */
export function ItemType({ item, acts }: { item: PlanItem; acts: ItemActs }) {
  const mode = useMode()
  const inspect = useInspect()
  const [, redraw] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)
  const [moved, setMoved] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)
  useEffect(() => {
    const on = () => redraw((n) => n + 1)
    kindWatchers.add(on)
    return () => {
      kindWatchers.delete(on)
    }
  }, [])

  const work = item.entry.work
  const chosen = work === null ? kindChosenFor(acts.planId, item.entry.line.id) : work.kind

  const change = async (to: RecordKind) => {
    if (work === null) {
      chooseKindFor(acts.planId, item.entry.line.id, to)
      return
    }
    if (to === work.kind) return
    setChanging(true)
    setFailed(null)
    setMoved(null)
    try {
      const reply = await api.setWorkKind(work.id, to, work.workspaceId)
      // WHERE THE ANSWERS THAT DID NOT FIT WENT. Said only when something really moved: a receipt
      // reading "nothing moved" on every change is noise on a dense table.
      const kept = reply.kindChange?.kept ?? []
      if (kept.length > 0) setMoved(reply.kindChange?.note ?? null)
      await acts.reload()
    } catch (err) {
      setFailed(inspect ? errorMessage(err) : withoutRecordIds(errorMessage(err)))
    }
    setChanging(false)
  }

  return (
    <span className="pi-pickbox">
      <select
        className="pi-type-pick"
        value={chosen}
        disabled={changing}
        aria-label={
          work === null
            ? t('g8.planitems.whatSortOfThingIsOnceYouTrackIt', { value1: wordsOf(item) })
            : t('g8.planitems.whatSortOfThingIs', { value1: work.name })
        }
        onChange={(event) => void change(event.currentTarget.value as RecordKind)}
      >
        {/* THE KIND THE RECORD ALREADY IS, WHEREVER IT IS NOT ONE OF THE FOUR. A plan can point a
            line at any piece of work, including a kind a plan line cannot be tracked as, and a menu
            that quietly showed a different word would say the record is something it is not. */}
        {work !== null && !KINDS_A_PLAN_LINE_CAN_BE_FILED_AS.includes(work.kind) ? (
          <option value={work.kind}>{kindWord(work.kind, mode).text}</option>
        ) : null}
        {KINDS_A_PLAN_LINE_CAN_BE_FILED_AS.map((one) => (
          <option key={one} value={one}>
            {kindWord(one, mode).text}
          </option>
        ))}
      </select>
      {failed === null ? null : (
        <span className="pi-said" data-ok="0">
          {failed}
        </span>
      )}
      {moved === null ? null : (
        <span className="pi-said" data-ok="1">
          {moved}
        </span>
      )}
    </span>
  )
}

// ============================================================================ which project owns it

/**
 * EVERY PROJECT, READ ONCE FOR THE WHOLE PAGE however many rows ask for it.
 *
 * MOVED TO src/web/lib/projectlist.ts and re-exported here, so every caller that imported it from
 * this file goes on working. It moved because ui.tsx needed it too — `ErrorNote` has to name the
 * project a record is really in — and this file imports ui.tsx, so ui.tsx could not import this.
 * There is still one request, one cache, and one idea of what the projects are.
 */
// IMPORTED AS WELL AS RE-EXPORTED. A bare `export … from` forwards the name without binding it in
// this module's scope, and this file calls it four lines down — the exact mistake this repository's
// ledger records being made twice, from the same instinct that a re-export is a move.
export { useProjects } from '../../lib/projectlist.ts'
type ProjectRow = ProjectListRow

/**
 * WHICH PROJECT A TRACKED LINE'S WORK IS IN, AND THE MENU THAT MOVES IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE OWNER'S CORRECTION, 17 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * The owner pointed out that the page had a Project column while the actual project choice appeared
 * inside the expanded Make a new record form, and that this was backwards. So the choice is here, in the column that
 * shows the concept, on both sides of tracking: before, it writes the line's own `{project: …}`;
 * after, it MOVES THE RECORD, through the route that already exists for moving one.
 *
 * MOVING IS NOT AN EDIT AND THE REFUSAL PROVES IT. A move carries the record's links, its change
 * rows and its ledger rows, and it may have to carry other records — a pipeline and its blocks, or
 * the far end of a link. When it does, the server refuses and names every record and the
 * relationship that forces it. That sentence is drawn exactly as sent, because it is the whole of
 * what a reader needs, and confirming a move of several records is deliberately not something a
 * table cell offers.
 */
function ProjectOfTrackedLine({ item, acts }: { item: PlanItem; acts: ItemActs }) {
  const work = item.entry.work
  const projects = useProjects()
  const inspect = useInspect()
  const [failed, setFailed] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  if (work === null) return null

  // THE PROJECT'S OWN NAME, WORKED OUT BY THE SERVER, which is what the read hands back with every
  // tracked line. This cell used to print `work.workspaceId` — the stored id — so the Writing view
  // of one plan said "Unassigned" where this column said "unassigned".
  const derived = item.entry.derived.find((one) => one.key === 'project')

  const move = async (to: string) => {
    if (to === work.workspaceId) return
    setMoving(true)
    setFailed(null)
    const outcome = await press(() => api.moveWorkToProject(work.id, work.workspaceId, to))
    setMoving(false)
    if (outcome.ok) {
      await acts.reload()
      return
    }
    setFailed(inspect ? outcome.said : withoutRecordIds(outcome.said))
  }

  if (projects === null) {
    return derived === undefined ? (
      <Absence title={t('g8.planitems.thisReadDidNotSayWhichProjectThisLine')} />
    ) : (
      <Tag tone="quiet">{!inspect && derived.says === work.workspaceId ? '—' : derived.says}</Tag>
    )
  }

  return (
    <span className="pi-pickbox">
      <select
        className="pi-project-pick"
        value={work.workspaceId}
        disabled={moving}
        aria-label={t('g8.planitems.whichProjectIsIn', { value1: work.name })}
        onChange={(event) => void move(event.currentTarget.value)}
      >
        {/* THE PROJECT THE RECORD IS IN IS ALWAYS ONE OF THE CHOICES, even when the list this
            browser read does not hold it. A menu that quietly showed the first project instead
            would say the record is somewhere it is not. */}
        {projects.some((one) => one.id === work.workspaceId) ? null : (
          <option value={work.workspaceId}>{inspect ? (derived?.says ?? work.workspaceId) : (derived?.says === work.workspaceId ? '—' : derived?.says ?? '—')}</option>
        )}
        {projects.map((one) => (
          <option key={one.id} value={one.id}>
            {projectName(one.id, one.title)}
          </option>
        ))}
      </select>
      {failed === null ? null : (
        <span className="pi-said" data-ok="0">
          {failed}
        </span>
      )}
    </span>
  )
}

/**
 * WHICH PROJECT OWNS THIS ITEM, on both sides of tracking.
 *
 * Before it is tracked the words live in the line, where the Writing view shows them. After it is
 * tracked the record's project is the fact, and whatever the line still says about a project is
 * drawn beside it — filing moves that value only where the two agree, and the one that did not move
 * is still the writer's.
 */
export function ItemProject({ item, acts, canRewrite }: { item: PlanItem; acts: ItemActs } & CanRewrite) {
  if (item.entry.work === null) {
    return <ItemPlanned item={item} acts={acts} which="project" canRewrite={canRewrite} />
  }
  return (
    <span className="pi-pair">
      <ProjectOfTrackedLine item={item} acts={acts} />
      <ItemKept item={item} acts={acts} which="project" canRewrite={canRewrite} />
    </span>
  )
}

/**
 * What an unmarked row means, said once by whichever surface draws `ItemStands`.
 *
 * `OriginMark` above hides the ordinary authored mark so a plan of authored work does not carry the
 * same chip on every row. That is only honest if the page says what a row with no mark is, and
 * tests/provenance-ui.test.ts checks that the two live in one file.
 */
export function ItemsOriginNote() {
  return <UnmarkedRowsNote />
}

/**
 * HOW BIG THIS ITEM IS: the record's estimate once it has one, and what the line says until then.
 *
 * ---------------------------------------------------------------------------------------
 * THE BOX IS OFFERED ON EVERY LINE, FILED OR NOT
 * ---------------------------------------------------------------------------------------
 *
 * A line nobody has filed gets the box that writes into the line's own words. That is the whole of
 * the owner's correction: you estimate in order to decide whether something is worth filing, so
 * filing cannot be the thing that lets you estimate. The cell says which of the two it is editing.
 *
 * ---------------------------------------------------------------------------------------
 * AND IT IS NOT DRAWN ON A FILED ROW WHOSE KIND HAS NO ESTIMATE. Problem `j2qxRpdJyaQ1`
 * ---------------------------------------------------------------------------------------
 *
 * A `direction` and a `problem` declare no `effort_hours`, so a box on one of those rows accepts a
 * number and has nowhere to put it — a fake affordance, which `docs/UX-CONTRACT.md` forbids by
 * name. The row says so in one short word instead, and whatever the line itself says stays on
 * screen: filing a line does not move a size onto a kind that has no room for one, and a value
 * Mole Office would not move is a value it must not hide.
 */
export function ItemEstimate({
  item,
  acts,
  canRewrite,
  envelope,
}: { item: PlanItem; acts: ItemActs; envelope?: EffortReading | undefined } & CanRewrite) {
  const work = item.entry.work
  const inside = <PartsInside envelope={envelope} />
  if (work === null) {
    const planned = <ItemPlanned item={item} acts={acts} which="size" canRewrite={canRewrite} />
    // THE BOX IS THE WHOLE CELL WHERE THERE IS NOTHING BESIDE IT, and wrapping it in a row would
    // take that away — a press near the cell's edge would land on dead space drawn exactly like the
    // field, which is the defect `fill` on GrowBox was written for.
    if (!saysWhatIsInside(envelope)) return planned
    return (
      <span className="pi-pair">
        {planned}
        {inside}
      </span>
    )
  }
  const kept = <ItemKept item={item} acts={acts} which="size" canRewrite={canRewrite} />
  if (!kindHasEstimate(work.kind)) {
    return (
      <span className="pi-pair">
        <NoEstimateField kind={work.kind} />
        {kept}
        {inside}
      </span>
    )
  }
  return (
    <span className="pi-pair">
      {/* WHETHER ANYTHING ELSE IN THIS CELL ALREADY SAYS HOW BIG THIS IS. See `saidAlready`. The
          breakdown of the parts counts: a cell reading "not sized" beside "9h from its parts" gives
          two answers to one question, which is the defect `saidAlready` was written for. */}
      <StoredEstimate
        work={work}
        acts={acts}
        saidAlready={writtenValue(item, 'size').said !== null || (envelope?.breakdown ?? null) !== null}
      />
      {kept}
      {inside}
    </span>
  )
}

/**
 * WHAT THE PARTS OF THIS ITEM ADD UP TO, WHEN THAT IS WORTH SAYING. Three cases and no others.
 *
 * ---------------------------------------------------------------------------------------
 * THE OWNER'S RULE
 * ---------------------------------------------------------------------------------------
 *
 * A parent's time is an envelope and its children's time is its breakdown, never an addition to it.
 * Where a parent has an explicit value, the parent's value is the one to display.
 *
 * So an item that says 15h keeps saying 15h whatever is written under it, and the three cases below
 * are the ones where the reader would otherwise be missing something:
 *
 *   NOBODY SIZED THIS AND ITS PARTS ARE SIZED. The row would read "not sized" while the plan knows
 *   perfectly well that 9h of work sits under it. The number is drawn as DERIVED — quiet, and
 *   labelled "from its parts" — because it is not stored anywhere and typing in the box beside it
 *   replaces it with something that is.
 *
 *   THE PARTS ADD UP TO MORE THAN THIS SAYS. The rule, with an example: keep
 *   the explicit 15h visible, and place a clear red warning beside it. Clicking the warning may
 *   explain that the parts currently total 18h and exceed the plan by 3h. Nothing is corrected and nothing is
 *   hidden; both numbers are true and only a person can say which one is wrong.
 *
 *   THE LEAST THIS ROW CAN TAKE, WHERE THAT IS MORE THAN THE NUMBER THE ROW PRINTS. This is the
 *   third case and it is new, because of what a first-time user met on 18 August 2026: a row of 8h
 *   holding parts of 6h and 5h, with the table's footer underneath saying the plan takes at least
 *   11h. Both readings are right — 8h is the envelope, 11h is the floor — and NOTHING ON THE SCREEN
 *   JOINED THEM, so 8h and 11h an inch apart read as the product being broken. The floor is now
 *   drawn on the row it comes from, in the same three words the footer uses.
 *
 *   IT REACHES THE ROWS ABOVE, WHICH THE RED MARK DOES NOT. `over` is this row's own parts against
 *   this row's own number, so an overflow two levels down leaves every ancestor unmarked while the
 *   footer still counts it. `atLeast` walks the whole way up — see `EffortReading.atLeast` — which
 *   is why a row can carry the floor without carrying the red mark.
 *
 * THE ARITHMETIC IS NOT DONE HERE. Every number on this component comes off one `EffortReading`
 * from `src/shared/envelope.ts`, which is the only place in Mole Office effort is added over a tree.
 */
/** Whether `PartsInside` has anything to draw for this row. Three cases; see the component. */
function saysWhatIsInside(envelope: EffortReading | undefined): boolean {
  if (envelope === undefined) return false
  if (envelope.over !== null || floorUnder(envelope) !== null) return true
  return envelope.own === null && envelope.breakdown !== null
}

/**
 * THE LEAST THIS ROW CAN TAKE, when that is more than the number the row prints. Null otherwise.
 *
 * `shown` is what the row prints — the stated estimate, or the breakdown where nobody stated one.
 * `atLeast` is the honest floor over everything inside it. They are the same number on an ordinary
 * row, and this says so by answering null: a mark repeating the number beside it is noise.
 */
function floorUnder(envelope: EffortReading): number | null {
  if (envelope.atLeast === null || envelope.shown === null) return null
  return envelope.atLeast > envelope.shown ? envelope.atLeast : null
}

/**
 * THE FLOOR IN WORDS, AND THE ONE WRITER OF THEM.
 *
 * The row and the table's footer say the same three words about the same arithmetic, so a reader
 * who has met one has met both. Two spellings of it would be the defect this repository keeps
 * finding, one screen apart.
 */
export function atLeastSaid(hours: number): string {
  return t('g8.planitems.atLeastH', { value1: hours })
}

function PartsInside({ envelope }: { envelope?: EffortReading | undefined }) {
  if (envelope === undefined) return null
  const floor = floorUnder(envelope)
  return (
    <>
      {envelope.over === null ? null : (
        <details className="pi-over">
          <summary aria-label={t('g8.planitems.thePartsAddUpToMoreThanThisSays')} title={t('g8.planitems.thePartsAddUpToMoreThanThisSays')}>
            <span aria-hidden="true">!</span>
          </summary>
          <div className="pi-over-body">{t('g8.planitems.thePartsOfThisAddUpToHWhich', { value1: envelope.breakdown ?? '—', value2: envelope.over, value3: envelope.own ?? '—' })}</div>
        </details>
      )}
      {envelope.own !== null || envelope.breakdown === null ? null : (
        <span
          className="pi-derived"
          title={t('g8.planitems.nobodyHasSizedThisItemThisIsWhatThe')}
        >{t('g8.planitems.hFromItsParts', { value1: envelope.breakdown })}</span>
      )}
      {floor === null ? null : (
        <span
          className="pi-floor"
          title={
            t('g8.planitems.thisRowSaysHWhichIsWhatThePlan', { value1: String(envelope.shown), value2: String(floor) })
          }
        >
          {atLeastSaid(floor)}
        </span>
      )}
    </>
  )
}

/** What a row says where its kind holds no estimate at all. Not an emptiness: there is no field. */
function NoEstimateField({ kind }: { kind: RecordKind }) {
  const mode = useMode()
  return (
    <Absence

      title={t('g8.planitems.aHasNoEstimateSoThereIsNowhereOn', { value1: kindWord(kind, mode).text })}
    />
  )
}

/**
 * The estimate as stored on the record, where every other surface reads it.
 *
 * IT READS WHAT SOMEBODY TYPED WITH THE PRODUCT'S ONE HOURS READER, so `5h` here means what it
 * means everywhere else. It used to be `Number(typed)`, which refused `5h` in a column headed
 * How big while the box two panels over read the same characters as five hours.
 */
function StoredEstimate({
  work,
  acts,
  saidAlready,
}: {
  work: NonNullable<PlanItem['entry']['work']>
  acts: ItemActs
  /**
   * TRUE WHEN SOMETHING ELSE IN THIS CELL ALREADY ANSWERS "HOW BIG IS THIS", which is the line's
   * own words, kept beside this box because filing could not turn them into hours.
   *
   * ---------------------------------------------------------------------------------------
   * THE DEFECT THIS FIXES: ONE CELL, TWO ANSWERS TO ONE QUESTION
   * ---------------------------------------------------------------------------------------
   *
   * Measured in a browser on 16 August 2026, on a filed row: the How big cell said "not sized" in
   * this box and, under it, "probably large" in the line's own words. Both were true — nobody had
   * put hours on the record, and the line really does say that — and at a glance the cell gave two
   * answers to one question, the second contradicting the first.
   *
   * SO THIS BOX SAYS "not sized" ONLY WHERE NOTHING ELSE IN THE CELL SAYS HOW BIG. "not sized" is an
   * ANSWER: nobody has said how long this takes. Where the line's own words have already answered,
   * this box says what you type into it instead, which is not an answer and does not compete with
   * one. Neither fact is lost: the words stay exactly where they were, and the box is still empty,
   * which is the whole of "no hours are stored on this record".
   */
  saidAlready: boolean
}) {
  const [failed, setFailed] = useState<string | null>(null)
  /** What Mole Office made of words it could read but nobody typed as a plain number. Never a refusal. */
  const [read, setRead] = useState<string | null>(null)
  // ARRIVING IN THIS CELL SELECTS ITS NUMBER, for the reason written above GrowBox. A cell of this
  // table behaves one way wherever you press it, and typing 3 into a cell holding 12 has to leave 3
  // rather than 132.
  const arriving = useRef(false)
  const stored = work.effortHours === null ? '' : String(work.effortHours)

  const store = async (typed: string) => {
    if (typed.trim() === stored) return
    setFailed(null)
    setRead(null)
    const said = readHoursBox(typed)
    // AN EMPTIED BOX CLEARS THE ESTIMATE, and clearing is not writing zero: nobody has sized this
    // and somebody looked and said it takes no time are two different answers.
    if (said.said === 'nothing') {
      try {
        await api.setEstimateHours(work.id, null, work.workspaceId)
        acts.reload()
      } catch (err) {
        setFailed(errorMessage(err))
      }
      return
    }
    if (said.said === 'words') {
      // NOTHING IS WRITTEN AND THE WORDS STAY IN THE BOX. There is no place on a record to keep
      // "about a day", and writing a guessed number would be the eighth rule broken at the door
      // that is meant to be strict.
      setFailed(t('g8.planitems.nothingWasWrittenEmptyTheBoxToSayNobody', { value1: said.why }))
      return
    }
    if (said.hours < 0) {
      setFailed(t('g8.planitems.hoursCannotBeNegativeSoNothingWasWrittenThis', { value1: stored === '' ? t('g8.planitems.notSized') : t('g8.progress.h', { value1: stored }) }))
      return
    }
    try {
      await api.setEstimateHours(work.id, said.hours, work.workspaceId)
      // WHAT MOLE OFFICE MADE OF THE WORDS, where the words were typed. Only when the characters and the
      // number are not the same thing: saying "5 is 5 hours" back to somebody who typed 5 is noise.
      // ONE WRITER OF THIS SENTENCE, shared with every other hours box. It is a receipt here rather
      // than a live reading because this box is uncontrolled: it takes the stored value on every
      // read, and holding what is typed in state as well would be the same value in two places.
      setRead(hoursReadingSaid(typed))
      acts.reload()
    } catch (err) {
      setFailed(errorMessage(err))
    }
  }

  return (
    <span className="pi-words-box">
      <input
        key={stored}
        className="pi-hours"
        type="text"
        /* NO DECIMAL KEYPAD. The box takes words as well as numbers now, and a keypad with no
           letters on it would be the product promising otherwise. */
        defaultValue={stored}
        /* AN ANSWER WHERE NOTHING ELSE ANSWERS, AND OTHERWISE WHAT YOU TYPE IN HERE. See
           `saidAlready` above: two answers to "how big is this" in one cell is the defect. */
        placeholder={saidAlready ? t('g8.planitems.hours') : t('g8.planitems.notSized')}
        aria-label={t('g8.planitems.howManyHoursTakes', { value1: work.name })}
        onFocus={(event) => {
          arriving.current = true
          event.currentTarget.select()
        }}
        onMouseUp={(event) => {
          if (!arriving.current) return
          arriving.current = false
          event.preventDefault()
        }}
        onBlur={(event) => {
          arriving.current = false
          void store(event.currentTarget.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void store(event.currentTarget.value)
          }
        }}
      />
      {failed === null ? null : <span className="pi-said" data-ok="0">{failed}</span>}
      {read === null ? null : (
        <span className="pi-said" data-ok="1">
          {read}
        </span>
      )}
    </span>
  )
}

/**
 * The hours a piece of work already has, one period at a time and never added together.
 *
 * "NOBODY LOOKED" AND "THERE ARE NONE" ARE TOLD APART AND BOTH ARE QUIET. This is the cell that pair
 * matters most in: almost no work in this corpus has hours, so a cell drawing the two the same way
 * would be wrong on nearly every row. It used to draw both as a grey phrase at the same weight — the
 * reason Mole Office could not say ran to a whole sentence on every row of a plan whose work list had not
 * arrived — and the reader acts on neither. So both go through `Absence` at the told-apart tier: a
 * dashed mark for the one Mole Office has not read, a plain one for the one it has, and the sentence
 * behind each of them.
 */
export function ItemHours({ item, acts }: { item: PlanItem; acts: ItemActs }) {
  const work = item.entry.work
  if (work === null) return null
  const reading = hoursOf(acts.workList, work)
  // THE WORDS THIS LINE STILL CARRIES, whatever the allocations say. Filing a line does not throw
  // them away, so the cell may not stop drawing them at that moment. See KeptWords.
  const kept = keptWordsOf(item, 'time')
  /**
   * WHETHER THE KEPT WORDS ARE THIS CELL'S OWN BOX, or something else in it already edits them.
   *
   * A filed row's Time given cell holds the stored periods, the kept words, and — where filing could
   * not move the line's own time value — `ItemKept`, which draws a box for THAT value. Two boxes for
   * one question in one cell is the defect `StoredEstimate` above names, so where the line still says
   * something about time, that is the box and these words stay a chip beside it.
   */
  const editKept = writtenValue(item, 'time').said === null ? acts : undefined
  if (reading.periods === null) {
    return (
      <span className="pi-periods">
        <Absence
          tier="told-apart"
          looked={false}
          word={t('g8.planitems.notRead')}
          title={reading.because ?? t('g8.planitems.moleOfficeCannotSayWhatHoursThisWorkHas')}
        />
        <KeptWords item={item} which="time" acts={editKept} />
      </span>
    )
  }
  if (reading.periods.length === 0) {
    // NOBODY GAVE IT ANY IS NOT SAID WHILE WORDS EXIST. It was, and the Writing view of the same
    // line in the same window said the opposite — one plan, two views, two contradicting claims.
    // The words are the answer to "what time does this have"; there is no emptiness to report.
    if (kept.length > 0) {
      return (
        <span className="pi-periods">
          <KeptWords item={item} which="time" acts={editKept} />
        </span>
      )
    }
    return (
      <Absence

        title={t('g8.planitems.moleOfficeReadTheHoursForThisWorkAnd')}
      />
    )
  }
  return (
    <span className="pi-periods">
      {reading.periods.map((given) => (
        <span key={`${given.horizon}-${given.period}`} className="pi-period">
          <PeriodInWords period={given.period} />
          <span className="pi-period-hours num">
            {given.plannedHours === null ? '—' : t('g8.progress.h', { value1: given.plannedHours })}
          </span>
        </span>
      ))}
      <KeptWords item={item} which="time" acts={editKept} />
    </span>
  )
}

// ============================================================================ adding an item

/**
 * What each sort of item is called on screen, in plain words.
 *
 * ONE WORD LIST. Every sentence in this file that names a sort of item reads it, so a refusal and a
 * box cannot call the same thing two different things.
 */
export const ITEM_WORDS: Readonly<Record<PlanItemKind, string>> = {
  get heading() { return t('g8.planitems.heading') },
  get bullet() { return t('g8.planitems.bullet') },
  get tickbox() { return t('g8.planitems.tickBox') },
  get numbered() { return t('g8.planitems.numberedItem') },
  get tableRow() { return t('g8.planitems.rowOfYourTable') },
}

/** What is about to be written, in words, for a reader who cannot see the marker beside the box. */
export function sayWhatIsBeingAdded(plan: NewItem): string {
  const where = plan.depth === 0 ? t('g8.planitems.theTopLevel') : t('g8.table.level', { value1: plan.depth + 1 })
  return t('g8.planitems.aNewAt', { value1: ITEM_WORDS[plan.kind], value2: where })
}

/**
 * THE BOX A NEW ITEM IS TYPED INTO, drawn where the item will be.
 *
 * IT WRITES ONE LINE OF THE DOCUMENT AND NOTHING ELSE. The words typed here become a line through
 * `POST /api/plans/:id/lines`, the plan is read again, and the re-read goes back to whoever holds
 * the plan for the page — so the writing box shows the new item as text. A surface that cannot hand
 * a re-read back may not draw this at all, for the reason at the head of PlanTable.tsx.
 *
 * ENTER ADDS IT AND OPENS THE NEXT ONE, so a list is typed the way a list is typed. Enter on an
 * empty box ends it, which is what pressing Enter twice does in every editor.
 *
 * ESCAPE CLOSES IT. Clicking away does NOT: the words stay in the box until they are added or the
 * box is closed, because throwing away something somebody typed is the one thing this surface must
 * never do quietly.
 */
export function AddAnItem({
  plan,
  acts,
  onDone,
  onAdded,
}: {
  plan: NewItem
  acts: ItemActs
  onDone: () => void
  /** Called with the line that was written, after the plan has been read again. */
  onAdded: (line: PlanLine) => void
}) {
  const [words, setWords] = useState('')
  // WHY THIS ITEM IS BEING ADDED. Criterion P3: a line added is a revision with a reason, so the
  // server refuses an add with none. The box asks for it here rather than letting the refusal arrive
  // after the words were typed and thrown away.
  const [reason, setReason] = useState('')
  const [failed, setFailed] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const reasonBox = useRef<HTMLTextAreaElement>(null)

  // The cursor lands in the box the press opened. A press that puts a box on screen and leaves the
  // cursor somewhere else asks a person to press twice to type once.
  useLayoutEffect(() => {
    box.current?.focus()
  }, [])

  const add = async () => {
    const typed = words.trim()
    // Nothing typed is not an error and not an empty item: it is the reader saying they are done.
    if (typed === '') {
      onDone()
      return
    }
    // The reason is required by the server. Sending the add without one would be refused and the
    // words would have to be typed again, so the box sends the reader to the reason first.
    if (reason.trim() === '') {
      reasonBox.current?.focus()
      return
    }
    if (acts.behind) {
      setFailed(t('g8.planitems.whatYouTypedInTheWritingBoxHasNot'))
      return
    }
    setSaving(true)
    setFailed(null)
    try {
      // THE COPY THIS ADD IS BUILT ON (problem GR4LcaNI-XZk). A plan somebody changed since is refused, not written into.
      const on = await acts.versionToWriteOn()
      if (!on.ok) {
        setFailed(t('planStores.lineRefused'))
        await acts.reload()
        return
      }
      const { line } = await api.addLineAfter(acts.planId, plan.lineFor(typed), plan.afterLineId, reason.trim(), on.version)
      // THE PLAN IS READ AGAIN BEFORE THE BOX MOVES. See `reload` in ItemActs.
      await acts.reload()
      onAdded(line)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'planChangedSinceRead') {
        // Nothing was added. The sentence says the table reads the plan again, and this is that read. The words typed
        // in this box stay in it.
        setFailed(t('planStores.lineRefused'))
        await acts.reload()
        return
      }
      setFailed(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pi-new">
      <div className="pi-new-line">
        {/* THE CHARACTERS MOLE OFFICE WILL WRITE, shown rather than described. They say the level and the
            sort of item at once, and they cannot disagree with what is stored because they are it. */}
        {plan.marker === '' ? null : (
          <span className="pi-new-marker" aria-hidden="true">
            {plan.marker}
          </span>
        )}
        <span className="px-sr">{sayWhatIsBeingAdded(plan)}</span>
        <textarea
          ref={box}
          className="pi-words"
          rows={1}
          value={words}
          aria-label={t('g8.planitems.theWordsOfTheNewItem')}
          onChange={(event) => {
            setWords(event.currentTarget.value)
            fitToText(event.currentTarget)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void add()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              onDone()
            }
          }}
        />
        <Btn
          variant="primary"
          size="sm"
          pending={saving}
          disabled={words.trim() === '' || reason.trim() === ''}
          reason={words.trim() === '' ? t('g8.planitems.typeTheItemFirst') : t('g8.planitems.sayWhyThisItemIsBeingAdded')}
          onClick={() => void add()}
        >{t('g8.planitems.add')}</Btn>
        <Btn variant="ghost" size="sm" onClick={onDone}>{t('g8.shelf.cancel')}</Btn>
      </div>
      <div className="pi-new-line">
        {/* THE REASON IS PART OF ADDING, NOT AN AFTER-THOUGHT. It is what the line's history keeps,
            and the server refuses an add without one. An accessible name rather than a label, so the
            box stays as small as the writing box above it. */}
        <textarea
          ref={reasonBox}
          className="pi-words"
          rows={1}
          value={reason}
          aria-label={t('g8.planitems.whyThisItemIsBeingAdded')}
          onChange={(event) => {
            setReason(event.currentTarget.value)
            fitToText(event.currentTarget)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void add()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              onDone()
            }
          }}
        />
      </div>
      {failed === null ? null : (
        <span className="pi-said" data-ok="0">
          {failed}
        </span>
      )}
    </div>
  )
}

// ============================================================================ the three presses

/**
 * THE KINDS ONE LINE OF A PLAN CAN BE FILED AS.
 *
 * IT USED TO BE `KINDS_A_PLAN_CAN_GIVE_HOURS_TO` AND THAT WAS ONE LIST ANSWERING TWO QUESTIONS.
 * That list says which kinds may HOLD HOURS, and it holds `block`. Measured against the running
 * server: filing a line as a block is refused every time, with "A block belongs to a pipeline, so
 * it cannot be filed on its own" — a block's place in its pipeline's order and half of its own
 * title live on that pipeline, so a block filed alone would have neither. The menu was therefore
 * offering a choice that could only ever fail.
 *
 * So this is its own list, and `tests/plan-table.test.ts` files a real line as every kind on it and
 * as every kind left off it, against the real server. It goes red when one of these stops being
 * fileable and when one of the others starts.
 */
export const KINDS_A_PLAN_LINE_CAN_BE_FILED_AS: readonly RecordKind[] = [
  'task',
  'obligation',
  'problem',
  'direction',
]

/** The older name for the same list, kept because the tests and the table read it. */
export const FILEABLE_KINDS: readonly RecordKind[] = KINDS_A_PLAN_LINE_CAN_BE_FILED_AS

/**
 * THE STATE A LINE STARTS IN WHEN SOMEBODY FILES IT, one kind at a time, with the reason.
 *
 * ---------------------------------------------------------------------------------------
 * WHY ANYTHING IS WRITTEN AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Filing wrote no state, so every record a plan made landed on the work page reading "No state
 * written" while Home counted it among the records with no state anybody can read. The product was
 * making the very thing it complains about, on every press.
 *
 * A PERSON PRESSING THIS HAS SAID SOMETHING, and that is what makes writing a state honest rather
 * than a guess. `kinds.ts` says of a task's state "leaving it out means it has never been given
 * one; nothing infers `todo` for you" — and nothing does. This is not Mole Office inferring; it is
 * Mole Office storing what the press means. Pressing "Make it real work" on a line of your own plan is
 * saying: this is work, and nobody has started it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A `direction` GETS NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * A direction has no state field at all — how far it has been taken is stored another way — so
 * there is nothing to write and nothing is invented. The form says so where the choice is made,
 * because a person who has just been told the other three get a state would otherwise read the
 * silence as a fault.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE WORDS DIFFER BETWEEN KINDS
 * ---------------------------------------------------------------------------------------
 *
 * A task has not been started; an obligation is owed; a problem is unfixed. The three vocabularies
 * are declared in `shared/kinds.ts` and are not the same alphabet, so one word cannot serve all
 * three. `tests/plan-table.test.ts` checks every word here against the vocabulary that kind
 * actually declares, so a state renamed there fails the suite rather than a write.
 */
export const STATE_A_FILED_LINE_STARTS_IN: Readonly<Partial<Record<RecordKind, string>>> = {
  // Somebody has decided to do it and nobody has begun. `progressOf('todo')` is `not_started`.
  task: 'todo',
  // Owed and not yet discharged. An obligation has no "not started": it is not a thing you begin,
  // it is a thing you owe, and `open` is the word its own vocabulary uses for still owing it.
  obligation: 'open',
  // The thing is wrong and nobody has fixed it. That is what writing a problem down asserts.
  problem: 'open',
  // `direction` is deliberately absent rather than null: it has no state field to write to.
}

/**
 * What one press of "Make it real work" sends for one kind, in one place.
 *
 * The press calls it and so does `tests/plan-table.test.ts`, so a test proving that a filed line
 * lands with a state is proving it about the very thing the press sends. Written out separately for
 * that reason alone: the press itself is inside a click handler no test in this repository can
 * reach, so a test that rebuilt the body by hand would pass with the press sending nothing.
 */
export function whatFilingSends(
  kind: RecordKind,
  workspaceId: string,
): { kind: RecordKind; workspaceId: string; data?: Record<string, unknown> } {
  const startsIn = STATE_A_FILED_LINE_STARTS_IN[kind]
  // THE STATE IS PART OF THE PRESS, not a default filled in afterwards. A kind with no state field
  // is sent none rather than an empty one. See the table above.
  return { kind, workspaceId, ...(startsIn === undefined ? {} : { data: { state: startsIn } }) }
}

/**
 * WHAT ONE FILING IS REPORTED AS: the sentence a reader gets, and the records that sentence names.
 *
 * Written out separately for the same reason `whatFilingSends` above is: the press itself is inside
 * a click handler no test in this repository can reach, so a test that rebuilt the answer by hand
 * would pass with the press reporting anything at all. `tests/plan-table-names-the-clash.test.ts`
 * calls this with a real reply from a real filing.
 *
 * WHERE IT WAS PUT IS HALF THE ANSWER. Filing writes one "part of" link to the item above, and only
 * when that item is itself real work. When it is not, no link was written and no parent was
 * invented, and `under.why` is the sentence saying which. A screen that dropped it would tell the
 * reader their item was placed under something when it was not.
 *
 * `why` is null when a link WAS written, and the server usually says the sentence once inside `note`
 * already. Adding it again produced a report that repeated the same two sentences back to back, so
 * it is added only when it is there to add and is missing.
 *
 * `records` IS THE HALF THAT WAS BEING THROWN AWAY. The reply carries the same news twice — the
 * sentence with the ids written into it, and the records as rows — and the browser used only the
 * sentence. So a person was told that other work answers to this name and then shown three dots
 * where the name should be. See `SaidWithRecords` for the measurement.
 */
export function whatFilingSaid(reply: LineFiled & { note: string }): {
  note: string
  records: readonly ReachableRecord[]
} {
  const why = reply.under.why
  const placed =
    reply.under.linkId === null
      ? ''
      : t('g8.planitems.itIsPartOf', { value1: reply.under.text === null ? t('g8.planitems.theItemAboveIt') : `"${reply.under.text}"` })
  return {
    note: why === null || reply.note.includes(why) ? reply.note + placed : `${reply.note} ${why}`,
    records: reply.alsoCalledThis,
  }
}

/**
 * WHICH PROJECT ONE LINE IS TRACKED INTO, AND HOW MOLE OFFICE WORKED THAT OUT.
 *
 * ---------------------------------------------------------------------------------------
 * THE FORM STOPPED ASKING, BECAUSE THE COLUMN ALREADY ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * The same question is not to be asked again in a hidden filing form unless there is
 * a real reason. The Project column is where a person says which project a line belongs to, on
 * every row, before and after tracking. So this reads that answer instead of asking for it again.
 *
 * ---------------------------------------------------------------------------------------
 * AND IT SAYS WHAT IT MADE OF THE WORDS, WHICH IS THE EIGHTH RULE
 * ---------------------------------------------------------------------------------------
 *
 * The words in the cell are a person's, so they may be an id, a project's name, or a project this
 * installation has not got. Matching is by the stored id first and then by the title, both ignoring
 * case and surrounding spaces. WORDS THAT NAME NO PROJECT ARE NOT GUESSED AT: the line is tracked
 * into the project on screen and `why` says so in the form, before the press, so nobody finds out
 * afterwards.
 */
export function projectForTracking(
  item: PlanItem,
  projects: readonly ProjectRow[] | null,
  here: string,
): { id: string; why: string | null } {
  const said = writtenValue(item, 'project').said
  if (said === null || said.trim() === '') return { id: here, why: null }
  const words = said.trim().toLowerCase()
  const found = (projects ?? []).find(
    (one) => one.id.toLowerCase() === words || one.title.trim().toLowerCase() === words,
  )
  if (found !== undefined) return { id: found.id, why: null }
  if (projects === null) {
    return {
      id: here,
      why:
        t('g8.planitems.thisLineSaysTheProjectIsMoleOfficeHas', { value1: said, value2: here }),
    }
  }
  return {
    id: here,
    why:
      t('g8.planitems.thisLineSaysTheProjectIsAndThereIs', { value1: said, value2: here }),
  }
}

/**
 * TRACK ONE LINE, OR EVERY LINE PICKED: make the record and bind the line to it.
 *
 * ---------------------------------------------------------------------------------------
 * IT ASKS NOTHING, BECAUSE THE TABLE ALREADY HOLDS BOTH ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * This form used to hold a four-button type picker with a paragraph under each, and a project menu.
 * Both questions now live in the columns that show them — Type and Project — which is the owner's
 * §6 and §7 in one change, and it is why the owner expected this form to become much smaller.
 *
 * WHAT IS LEFT IS WHAT A PERSON CANNOT SEE FOR THEMSELVES: how many rows this press acts on, what
 * each will be tracked as, where each will go, and anything Mole Office could not read out of the words.
 */
export function MakeItWork({
  items,
  acts,
  onDone,
}: {
  items: readonly PlanItem[]
  acts: ItemActs
  onDone: () => void
}) {
  const [running, setRunning] = useState(false)
  const [said, setSaid] = useState<{ text: string; outcome: PressOutcome }[]>([])
  const projects = useProjects()
  const here = currentWorkspace()
  const mode = useMode()
  // WHAT THIS PRESS WILL DO, ROW BY ROW, worked out once and both read by the sentence above the
  // press and used by the press itself. One answer, so the sentence cannot promise one project and
  // the write land in another.
  const plan = items.map((item) => ({
    item,
    kind: kindChosenFor(acts.planId, item.entry.line.id),
    project: projectForTracking(item, projects, here),
  }))

  const run = async () => {
    setRunning(true)
    const results: { text: string; outcome: PressOutcome }[] = []
    for (const one of plan) {
      const item = one.item
      const outcome = await press(async () =>
        whatFilingSaid(
          await api.fileLineAsWork(acts.planId, item.entry.line.id, whatFilingSends(one.kind, one.project.id)),
        ),
      )
      results.push({ text: item.text, outcome })
    }
    setSaid(results)
    setRunning(false)
    acts.reload()
  }

  /** Where each row goes, said once per project rather than once per row. */
  const goingTo = [...new Set(plan.map((one) => one.project.id))]
  /** Every reading Mole Office could not make out of the words, in the order the rows are in. */
  const couldNotRead = plan.filter((one) => one.project.why !== null)
  /**
   * WHY THE PRESS IS REFUSED, or null when it is not.
   *
   * A line that names a project and a browser that has not read the projects yet is the one case
   * where pressing now would put the work somewhere the person did not ask for. Waiting is the
   * honest answer; guessing and reporting it afterwards is the fifth invariant broken politely.
   */
  const notYet =
    projects === null && plan.some((one) => writtenValue(one.item, 'project').said !== null)
      ? t('g8.planitems.moleOfficeHasNotFinishedReadingYourProjectsSo')
      : null

  return (
    <div className="pi-form">
      {/* WHAT THIS PRESS WILL DO, IN ONE SENTENCE. Nothing here is a question: the Type column says
          what each row is and the Project column says where it goes, so this is a receipt written
          before the press rather than a form. See the note above the component. */}
      {/* A `div`, NOT A `p`. `Hint` renders a `<details>` holding a `<summary>`, and neither may be
          inside a `<p>`: the browser closes the paragraph at the `<details>` and reopens it after,
          so React hydrates into a tree it did not build. `.pi-form-say` sets its own margin, so
          nothing moves. A test deleted on 13 November 2026 found this one; the browser
          never reached it, because it is drawn only once the Track box is open. */}
      <div className="pi-form-say">
        {items.length === 1
          ? t('g8.planitems.trackedAsAIn', { value1: kindWord(plan[0]?.kind ?? A_LINE_IS_A_TASK_UNLESS_YOU_SAY, mode).text, value2: goingTo.join('", "') })
          : t('g8.planitems.itemsEachTrackedAsTheTypeInItsOwn', { value1: items.length, value2: goingTo.length === 1 ? `"${goingTo[0] ?? ''}"` : t('g8.planitems.projects', { value1: goingTo.length }) })}
      </div>
      {couldNotRead.length === 0 ? null : (
        <ul className="pi-form-said">
          {couldNotRead.map((one) => (
            <li key={one.item.key}>{one.project.why}</li>
          ))}
        </ul>
      )}
      <div className="pi-form-row">
        <Btn
          variant="primary"
          size="sm"
          pending={running}
          {...(notYet === null ? {} : { disabled: true, reason: notYet })}
          onClick={() => void run()}
        >
          {items.length === 1 ? t('g8.table.track') : t('g8.planitems.trackAll', { value1: items.length })}
        </Btn>
        <Btn variant="ghost" size="sm" onClick={onDone}>{t('g8.planitems.close')}</Btn>
      </div>
      <PressReport results={said} />
    </div>
  )
}

/** Point an item at work that already exists, anywhere in any project. */
export function PointAtWork({
  item,
  acts,
  onDone,
}: {
  item: PlanItem
  acts: ItemActs
  onDone: () => void
}) {
  const projects = useProjects()
  const [looking, setLooking] = useState('')
  const [said, setSaid] = useState<PressOutcome | null>(null)
  const [running, setRunning] = useState(false)

  const rows = acts.workList === null ? [] : acts.workList.rows
  const words = looking.trim().toLowerCase()
  const found =
    words === ''
      ? rows.slice(0, 12)
      : rows.filter((row) => row.name.toLowerCase().includes(words) || row.title.toLowerCase().includes(words)).slice(0, 12)

  const choose = async (row: WorkRow) => {
    setRunning(true)
    const already = item.entry.line.recordId
    const outcome = await press(() =>
      api.pointLineAtWork(acts.planId, item.entry.line.id, {
        recordId: row.id,
        ...(already === null ? {} : { replacing: already }),
      }),
    )
    setSaid(outcome)
    setRunning(false)
    if (outcome.ok) acts.reload()
  }

  return (
    <div className="pi-form">
      {/* NO LEAD SENTENCE. It read "Point this line at work that already exists. Nothing new is
          made." — and the press that opens this form already reads "Point at work that exists",
          with a list of work under it. The press report says what the write did, in the server's
          own words, which is where "nothing was created" is true rather than promised. */}
      <input
        className="pi-find"
        type="search"
        value={looking}
        placeholder={t('g8.planitems.narrowByName')}
        aria-label={t('g8.planitems.narrowTheWorkByName')}
        onChange={(event) => setLooking(event.currentTarget.value)}
      />
      {acts.workList === null ? (
        <p className="pi-none">{t('g8.planitems.moleOfficeHasNotFinishedReadingTheWork')}</p>
      ) : found.length === 0 ? (
        <p className="pi-none"><Absence title={acts.workList.leftOut > 0
          ? t('g8.planitems.theListStoppedAtOfPiecesOfWork', { value1: acts.workList.returned, value2: acts.workList.counted })
          : t('g8.planitems.allPiecesOfWorkWereRead', { value1: acts.workList.counted })} /></p>
      ) : (
        <ul className="pi-found">
          {found.map((row) => (
            <li key={row.id}>
              <button type="button" className="pi-found-one" disabled={running} onClick={() => void choose(row)}>
                <span className="pi-found-name">{row.name}</span>
                <span className="pi-found-where">
                  {kindWord(row.kind).text} · {projectName(row.workspaceId, projects?.find((project) => project.id === row.workspaceId)?.title)}
                  {row.above.length === 0 ? '' : t('g8.planitems.under', { value1: row.above.map((step) => step.title).join(' › ') })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="pi-form-row">
        <Btn variant="ghost" size="sm" onClick={onDone}>{t('g8.planitems.close')}</Btn>
      </div>
      {said === null ? null : <PressReport results={[{ text: item.text, outcome: said }]} />}
    </div>
  )
}

/**
 * THE HOURS BOX IS READ BY `readHoursBox` IN `@shared/planning.ts`, AND SO IS EVERY OTHER ONE.
 *
 * It used to be written here, beside the box that needed it first, while the rest of the product
 * went on reading its own hours boxes with `Number(…)`. That is the defect this repository keeps
 * producing — one question answered in more than one place — and it was measurable: `5h` was five
 * hours in this box and "not a number of hours" in the five others. The reader moved to the shared
 * module and every box now calls it. What it answers and why is written above it there.
 */

/**
 * KEEP WHAT SOMEBODY WROTE ABOUT TIME AND SCHEDULE NOTHING FROM IT.
 *
 * This is where words Mole Office cannot read as hours go. NO ALLOCATION IS WRITTEN: an allocation
 * carrying no hours is this product's way of saying somebody committed to work here without saying
 * for how long, and turning a typo into that sentence is the lie `readHoursBox` exists to stop. The
 * words are stored exactly as typed, against this line and against the work it names, and they
 * enter no total — the eighth rule's first layer, whose one door is `POST /api/planning/intents`.
 *
 * THE PERIOD IS SENT BECAUSE IT WAS PRESSED, NOT READ. A button said "this week"; nothing was
 * interpreted to get it, so keeping it beside the words claims nothing about them.
 *
 * NOTHING IS REFUSED, so the person is not sent to another page, and the work is left free to take
 * the hours the moment they retype them.
 */
async function keepTheWords(item: PlanItem, period: string, typed: string, why: string): Promise<{ note: string }> {
  const bound = item.entry.line.recordId
  const kept = await moleOfficeRequest<{ interpretation: string; note: string }>('/api/planning/intents', {
    method: 'POST',
    body: JSON.stringify({
      // EXACTLY AS TYPED. Not trimmed and not tidied: what comes back has to be what they wrote.
      said: typed,
      planLineId: item.entry.line.id,
      period,
      ...(bound === null ? {} : { recordId: bound }),
    }),
  })
  return { note: t('g8.planitems.noHoursWereWrittenAndThisWorkWasGiven', { value1: why, value2: period, value3: kept.note }) }
}

/**
 * KEEP WORDS THAT NAME NO PERIOD AT ALL, exactly as they were typed.
 *
 * `keepTheWords` above is for words typed into the hours box when the period is already settled. This
 * is for the other half: the reader wrote when they mean and Mole Office could read no date from it, so
 * there is no period to put beside the words and none is invented. The server reads the words itself
 * — through the same `readTimeWords` this browser used — and stores what it can defend, which is
 * usually nothing at all. Nothing enters any total either way.
 *
 * WHAT IT REPLACED COMES BACK WITH IT. A line holds one answer about time, so this write takes off
 * whatever the line said before. The rows it took are handed back so that a box which has just
 * retyped one of them can tell "you replaced your own words" from "your other words went too".
 */
async function keepWordsWithNoPeriod(
  item: PlanItem,
  said: string,
): Promise<{ note: string; replaced: { id: string; said: string }[] }> {
  const bound = item.entry.line.recordId
  const kept = await moleOfficeRequest<{
    interpretation: string
    note: string
    replaced: { id: string; said: string }[]
  }>('/api/planning/intents', {
    method: 'POST',
    body: JSON.stringify({
      // EXACTLY AS TYPED. Not trimmed and not tidied: what comes back has to be what they wrote.
      said,
      planLineId: item.entry.line.id,
      ...(bound === null ? {} : { recordId: bound }),
    }),
  })
  return { note: kept.note, replaced: kept.replaced }
}

/**
 * TAKE KEPT WORDS OFF A LINE. The way out, beside the way in.
 *
 * A surface that can write a thing and cannot remove it leaves a person stuck with whatever is
 * there. `DELETE /api/planning/intents/<id>` refuses a committed one and says what to remove
 * instead, because its hours are a stored allocation — that refusal is the server's and is shown
 * exactly as it arrives.
 */
async function forgetTheseWords(intentId: string): Promise<{ note: string }> {
  return moleOfficeRequest<{ note: string }>(`/api/planning/intents/${intentId}`, { method: 'DELETE' })
}

/** What one press of the Time given box did to one line's kept words. */
export interface KeptWordsChange {
  /** Nothing was sent, the words were replaced, or the words were taken off the line. */
  did: 'nothing' | 'kept' | 'forgotten'
  /**
   * OTHER kept words this write took off the line, never the row that was being retyped.
   *
   * A line holds one answer about time, so writing one takes the old one away. Replacing your own
   * words is not news; losing a second phrase you wrote somewhere else is, and a person who is not
   * told cannot tell the two apart. Empty is the ordinary case.
   */
  alsoWent: readonly { id: string; said: string }[]
  /** The server's own sentence, or its refusal. `ok` is false only when nothing was written. */
  outcome: PressOutcome
}

/**
 * THE WHOLE OF WHAT TYPING IN THE TIME GIVEN BOX DOES TO ONE LINE'S KEPT WORDS.
 *
 * It is out here rather than inside the component so that the press and the test call the same
 * function, which is how `giveItemTimeFromWords` above is written and for the same reason.
 *
 * THREE OUTCOMES AND NO FOURTH. The same characters store nothing at all. Words store words, through
 * the one door — `POST /api/planning/intents` — which replaces what the line last said about time in
 * one transaction, so a line cannot come out of this holding two answers or none. An EMPTIED box
 * takes the words off the line, which is a different thing from keeping an empty phrase: "nobody
 * wrote anything about when" and "somebody wrote nothing" would otherwise be two rows drawn the same.
 *
 * NOTHING HERE IS A SCHEDULE. Kept words enter no total, use no capacity and make no week look full.
 */
export async function changeKeptWords(
  item: PlanItem,
  row: KeptTimeWords,
  typed: string,
): Promise<KeptWordsChange> {
  if (typed === row.said) {
    return { did: 'nothing', alsoWent: [], outcome: { ok: true, said: t('g8.planitems.theseAreTheSameWordsSoNothingWasWritten') } }
  }
  if (typed.trim() === '') {
    const gone = await press(() => forgetTheseWords(row.id))
    return { did: gone.ok ? 'forgotten' : 'nothing', alsoWent: [], outcome: gone }
  }
  let replaced: readonly { id: string; said: string }[] = []
  const kept = await press(async () => {
    const done = await keepWordsWithNoPeriod(item, typed)
    replaced = done.replaced
    return { note: done.note }
  })
  return {
    did: kept.ok ? 'kept' : 'nothing',
    alsoWent: kept.ok ? replaced.filter((one) => one.id !== row.id) : [],
    outcome: kept,
  }
}

/**
 * THE SERVER'S DAY AS A DATE, CHECKED AGAINST THE PRODUCT'S OWN WRITER OF A DAY.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SERVER'S DAY AND NOT THE BROWSER'S CLOCK
 * ---------------------------------------------------------------------------------------
 *
 * Reading "next week" needs to know what week this is, and the schedule reads the SERVER's answer.
 * A browser working it out for itself is the same question answered in two places: a machine an
 * hour behind midnight would give hours to a week the schedule does not agree exists. So the day
 * comes from `GET /api/planning/today` and every reading in this file is made against it.
 *
 * IT IS CHECKED RATHER THAN TRUSTED. The date is built from the key and then written back out
 * through `dayKey`, the product's one writer of a day, and a disagreement returns null — at which
 * point the control says Mole Office could not read the date and keeps the words. A guessed day would be
 * a guessed week, and a guessed week is a commitment nobody made.
 */
export function serverDay(day: string): Date | null {
  // A date-time with no zone on it is the machine's own local time, which is what every date in
  // Mole Office is. See src/shared/time.ts.
  const at = new Date(`${day}T00:00:00`)
  if (Number.isNaN(at.getTime())) return null
  return dayKey(at) === day ? at : null
}

/** What one press of the scheduling control will do, worked out before anything is written. */
export interface WhatThePressWillDo {
  /** The period Mole Office read from the when words, or null when it read none. Never a guess. */
  period: Period | null
  /** What the hours box says. */
  hours: HoursBoxRead
  /**
   * What the press does: write hours in a period, keep the words with nothing scheduled, or —
   * where both boxes are empty — nothing, because there is nothing to write and nothing to keep.
   */
  press: 'give' | 'keep' | 'nothing'
  /**
   * THE WORDS THAT WILL BE KEPT, when the press keeps rather than schedules. Empty otherwise.
   *
   * IT IS BOTH BOXES, AND THAT IS BECAUSE ONE LINE HOLDS ONE ANSWER ABOUT TIME. The server replaces
   * what a line last said about time on every write — deliberately, and it says so — so keeping the
   * two boxes as two rows would have the second silently take the first away. Measured: writing
   * "before Friday" and then "about half a day" left only the second in the database. So one press
   * keeps one statement, and it holds everything that was typed, in the order the boxes are read.
   */
  keepSaid: string
  /** The short reading under the fields. Null only where nothing has been typed. */
  reading: string | null
  /** The whole of why Mole Office read no date, for behind a press. Null where it read one. */
  why: string | null
}

/**
 * WHAT MOLE OFFICE MADE OF THE TWO BOXES, AND WHAT THE PRESS WILL THEREFORE DO.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS: THE OWNER COULD NOT SAY "NEXT WEEK"
 * ---------------------------------------------------------------------------------------
 *
 * The control held three buttons — today, this week, this month — and an hours box, and nothing
 * else. There was no way to type a period at all. A tester reached "next week" only by typing it
 * into the box labelled Hours, which the tester found by reading the page's markup; and the press that
 * keeps words was DISABLED until one of the three buttons had been pressed, so the only way to
 * preserve "next week" was to first tell Mole Office it was this week. Every one of those is the eighth
 * rule failing in the one place it is meant to hold: a person may write what they mean.
 *
 * ---------------------------------------------------------------------------------------
 * ONE READER, AND IT IS THE PRODUCT'S
 * ---------------------------------------------------------------------------------------
 *
 * `readPeriodWords` and `readHoursBox` in src/shared/planning.ts read both boxes. Nothing here
 * matches a word, and the three shortcut presses do not bypass them: a shortcut writes its own
 * words into the when box and they are read exactly as typed words are. So "this week" pressed and
 * "this week" typed cannot come out as two different weeks.
 *
 * NOTHING IS GUESSED AND NOTHING IS REFUSED. Words that name no date are kept; the press that keeps
 * them is never disabled; and where Mole Office has no day to read against, it says so and still keeps.
 */
export function whatGivingTimeWillDo(when: string, hours: string, today: Date | null): WhatThePressWillDo {
  const hoursRead = readHoursBox(hours)
  const saidWhen = when.trim()
  const nothingTyped = saidWhen === '' && hoursRead.said === 'nothing'
  // BOTH BOXES, IN THE ORDER THEY ARE READ, and neither is tidied. See `keepSaid`.
  const keepSaid = [when, hours].filter((box) => box.trim() !== '').join(', ')

  const noDay = today === null
  const read = saidWhen === '' || noDay ? null : readPeriodWords(when, today)

  if (read !== null && read.read) {
    const aboutHours =
      hoursRead.said === 'hours'
        ? ` ${hoursRead.how}`
        : hoursRead.said === 'words'
          ? t('g8.planitems.moleOfficeReadNoHoursFromYourWordsThey')
          : ''
    return {
      period: read.period,
      hours: hoursRead,
      press: 'give',
      keepSaid: '',
      reading: `${read.how}${aboutHours}`,
      why: null,
    }
  }

  if (nothingTyped) {
    return { period: null, hours: hoursRead, press: 'nothing', keepSaid: '', reading: null, why: null }
  }

  return {
    period: null,
    hours: hoursRead,
    press: 'keep',
    keepSaid,
    // SHORT, AND THE WHOLE OF IT IS TRUE. The reader's own sentence names which word stopped it and
    // what it can read; that runs to three lines, so it goes behind a press as `why`.
    reading:
      saidWhen === ''
        ? t('g8.planitems.nothingSaysWhenSoNothingIsScheduledYourWords')
        : t('g8.planitems.moleOfficeReadNoDateFromTheseWordsNothing'),
    why: noDay
      ? t('g8.planitems.moleOfficeCouldNotReadTheDayFromThe')
      : saidWhen === ''
        ? t('g8.planitems.nothingWasWrittenInTheWhenBoxSoThere')
        : (read?.read === false ? read.why : null),
  }
}

/**
 * THE WHOLE OF WHAT ONE PRESS OF THE SCHEDULING CONTROL DOES TO ONE ITEM, from the two boxes.
 *
 * It is out here rather than inside the component so that the press and the test call the same
 * function, and it decides nothing itself: `whatGivingTimeWillDo` above says what will happen and
 * this carries it out.
 *
 * WHERE NO DATE COULD BE READ, ONE STATEMENT IS KEPT AND IT HOLDS BOTH BOXES. A line holds one
 * answer about time and the server replaces the old one on every write, so two rows would mean the
 * second box taking the first one's words away. See `keepSaid`.
 */
export async function giveItemTimeFromWords(
  planId: string,
  item: PlanItem,
  when: string,
  hours: string,
  today: Date | null,
): Promise<PressOutcome> {
  const will = whatGivingTimeWillDo(when, hours, today)
  if (will.press === 'nothing') {
    return { ok: false, said: t('g8.planitems.nothingWasWrittenInEitherBoxSoNothingWas') }
  }
  if (will.period !== null) {
    // THE SAME FUNCTION THE PERIOD PRESSES ALWAYS CALLED. Which of its two writes happens is still
    // decided by `readHoursBox` and by nothing here.
    return giveItemTime(planId, item, { horizon: will.period.horizon, period: will.period.key }, hours)
  }
  return press(() => keepWordsWithNoPeriod(item, will.keepSaid))
}

/**
 * THE WHOLE OF WHAT ONE PRESS OF "Give it time" DOES TO ONE ITEM, once the period is settled.
 *
 * It is out here rather than inside the component so that the press and the test call the same
 * function. Which of the two writes happens is decided by `readHoursBox` and by nothing else.
 */
export async function giveItemTime(
  planId: string,
  item: PlanItem,
  when: { horizon: Grain; period: string },
  typed: string,
): Promise<PressOutcome> {
  const read = readHoursBox(typed)
  if (read.said === 'words') return press(() => keepTheWords(item, when.period, typed, read.why))
  return press(async () => {
    const done = await api.giveLineTime(planId, item.entry.line.id, {
      horizon: when.horizon,
      period: when.period,
      // LEFT OUT MEANS SOMEBODY COMMITTED TO THIS WITHOUT SAYING FOR HOW LONG. That is a real answer
      // and nothing fills it in from the estimate. An EMPTY BOX is the only thing that reaches it —
      // see `readHoursBox` for what used to reach it as well, and what that cost.
      ...(read.said === 'nothing' ? {} : { plannedHours: read.hours }),
    })
    // WHAT MOLE OFFICE MADE OF THE WORDS, kept beside what it wrote, so the receipt still says it after
    // the box has been retyped.
    return { note: read.said === 'nothing' ? done.note : `${read.how} ${done.note}` }
  })
}

/**
 * THE THREE SHORTCUTS, AS WORDS RATHER THAN AS THE INTERACTION.
 *
 * They are what most presses want and they stay. What changed is what they are: a shortcut now
 * TYPES ITS OWN WORDS INTO THE WHEN BOX, so it goes through the same reader every typed word goes
 * through and nothing can make "this week" mean two different weeks. They used to be the only way
 * to name a period at all, which is the defect this pass exists to correct.
 */
const WHEN_SHORTCUTS = ['today', 'this week', 'this month'] as const

/**
 * SAY WHEN, IN YOUR OWN WORDS, AND SAY HOW MUCH.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PERSON HAS TO BE ABLE TO DO HERE
 * ---------------------------------------------------------------------------------------
 *
 * Write "next week", or "Tuesday afternoon", or "before Friday", and have the plan hold it. The
 * owner's sentence for this pass is "do this next week; it is probably large; remember this note",
 * and the first clause of it was impossible: this control offered three fixed buttons and an hours
 * box, so the only way to say next week was to type it into the box labelled Hours.
 *
 * ---------------------------------------------------------------------------------------
 * THE SHAPE, AND WHY IT IS THIS SHAPE
 * ---------------------------------------------------------------------------------------
 *
 * When comes first and it is a box you type in, because that is the question this control exists to
 * answer. The three shortcuts sit beside it as small presses that fill the box in. Hours is its own
 * field, plainly separate, because how long is not when — running the two together is what made a
 * reader type a period into the hours box.
 *
 * UNDER THEM, IN ONE SHORT LINE, WHAT MOLE OFFICE UNDERSTOOD. It is there before anything is written,
 * which is what lets a typo be fixed rather than undone. The long reason a date could not be read
 * is behind a press: this control turned into a large explanatory box, and the normal path has to
 * stay light — when, how much, what did Mole Office understand.
 */
export function GiveItTime({
  items,
  acts,
  onDone,
}: {
  items: readonly PlanItem[]
  acts: ItemActs
  onDone: () => void
}) {
  const [now] = useAsync(() => api.today(), [])
  const [when, setWhen] = useState('')
  const [hours, setHours] = useState('')
  const [running, setRunning] = useState(false)
  const [said, setSaid] = useState<{ text: string; outcome: PressOutcome }[]>([])
  const inspect = useInspect()

  // THE DAY COMES FROM THE SERVER. See `serverDay`: a browser working out its own week is the same
  // question answered in two places, and the schedule reads the server's answer.
  const today = now.status === 'ready' ? serverDay(now.value.day) : null
  const will = whatGivingTimeWillDo(when, hours, today)

  const run = async () => {
    setRunning(true)
    const results: { text: string; outcome: PressOutcome }[] = []
    for (const item of items) {
      results.push({ text: item.text, outcome: await giveItemTimeFromWords(acts.planId, item, when, hours, today) })
    }
    setSaid(results)
    setRunning(false)
    acts.reload()
  }

  return (
    <div className="pi-form">
      {/* THE COUNT IS ALL THAT IS LEFT OF THE LEAD SENTENCE, because a reader cannot see how many
          rows a press is about. Everything else it said is the fields and the button. */}
      {items.length === 1 ? null : <p className="pi-form-say">{t('g8.planitems.piecesOfWorkPicked', { value1: items.length })}</p>}
      {now.status === 'error' ? <ErrorNote message={now.message} fault={now.fault} label={t('g8.planitems.moleOfficeCouldNotReadTheDate')} /> : null}
      <div className="pi-form-row">
        <label className="pi-label pi-when-label">
          {t('g8.planitems.whenAt4237')}<input
            className="pi-when"
            type="text"
            value={when}
            /* THE PLACEHOLDER IS THREE REAL ANSWERS, not a description of a format. It is the whole
               of the instruction this box needs. */
            placeholder={t('g8.planitems.nextWeekTuesday')}
            onChange={(event) => setWhen(event.currentTarget.value)}
          />
        </label>
        <span className="pi-shortcuts">
          {WHEN_SHORTCUTS.map((one) => (
            <button
              key={one}
              type="button"
              className="pi-period-pick"
              aria-pressed={when.trim().toLowerCase() === one}
              onClick={() => setWhen(one)}
            >
              {t(one === 'today' ? 'g8.planitems.today' : one === 'this week' ? 'g8.planitems.thisWeek' : 'g8.planitems.thisMonth')}
            </button>
          ))}
        </span>
      </div>
      <div className="pi-form-row">
        <label className="pi-label">
          {t('g8.planitems.hoursAt4264')}{/* PLAIN TEXT, AND NO DECIMAL KEYPAD. The box takes words as well as numbers, and a
              keypad with no letters on it would be the product promising otherwise. */}
          <input
            className="pi-hours-box"
            type="text"
            value={hours}
            placeholder={t('g8.planitems.notSaid')}
            onChange={(event) => setHours(event.currentTarget.value)}
          />
        </label>
        {/* THE BUTTON SAYS WHAT IT WILL DO, and it is disabled only where there is nothing at all to
            write and nothing to keep. Keeping what somebody wrote is never refused: the press that
            kept words used to be disabled until a canonical period had been pressed, so the only
            way to preserve "next week" was to first say it was this week. */}
        <Btn
          variant="primary"
          size="sm"
          pending={running}
          disabled={will.press === 'nothing'}
          reason={t('g8.planitems.writeWhenYouMeanToDoItOrHow')}
          onClick={() => void run()}
        >
          {will.press === 'keep' ? t('g8.planitems.keepTheseWords') : t('g8.table.giveItTime')}
        </Btn>
        <Btn variant="ghost" size="sm" onClick={onDone}>{t('g8.planitems.close')}</Btn>
      </div>
      {/* WHAT MOLE OFFICE MADE OF THE TWO BOXES, BEFORE ANYTHING IS WRITTEN. This is what the twelve lost
          minutes bought: the reading is on the screen while there is still a typo to fix. */}
      {will.reading === null ? null : (
        <p className="pi-form-say" aria-live="polite">
          {/* THE WEEK IT LANDED ON, NAMED THE WAY A PERSON SAYS IT. This sentence answers "what did
              Mole Office understand?" and it used to answer with the stored key: "next week" is
              2026-W35. Inspect keeps the reader's own sentence, key and all. */}
          {inspect ? will.reading : periodsInWords(will.reading)}
        </p>
      )}
      <PressReport results={said} />
    </div>
  )
}

/**
 * What every press did, one line per item, in the server's own words.
 *
 * A RUN THAT PART SUCCEEDED SAYS SO. Filing twelve items can leave nine filed and three refused,
 * and one cheerful sentence over the top of that would be the first invariant broken.
 *
 * IN NORMAL MODE THE IDS COME OUT OF THOSE WORDS. Everything else in the sentence is kept, including
 * every refusal, because the row a refusal names is what a person acts on. See `withoutRecordIds`
 * for the measurement and for what is left where an id was.
 */
export function PressReport({ results }: { results: readonly { text: string; outcome: PressOutcome }[] }) {
  const inspect = useInspect()
  if (results.length === 0) return null
  const done = results.filter((one) => one.outcome.ok).length
  return (
    <div className="pi-report">
      <p className="pi-report-say">{t('g8.planitems.ofWritten', { value1: done, value2: results.length, value3: done === results.length ? '.' : t('g8.planitems.refused', { value1: results.length - done }) })}</p>
      <ul className="pi-report-list">
        {results.map((one, index) => (
          <li key={`${one.text}-${index}`} data-ok={one.outcome.ok ? '1' : '0'}>
            <span className="pi-report-what">{lineWithMaths(one.text)}</span>
            <span className="pi-said" data-ok={one.outcome.ok ? '1' : '0'}>
              {/* TWO THINGS COME OUT OF AN ORDINARY CONFIRMATION AND NEITHER IS DESTROYED: the
                  record id the server writes into the words, and the stored key of the week it
                  wrote the hours into. Developer mode below draws the sentence exactly as sent.

                  AN ID THIS BROWSER WAS HANDED A ROW FOR BECOMES A PRESS THAT OPENS THAT RECORD,
                  rather than three dots. See `SaidWithRecords` for the measurement. */}
              {inspect ? (
                one.outcome.said
              ) : one.outcome.records === undefined || one.outcome.records.length === 0 ? (
                periodsInWords(withoutRecordIds(one.outcome.said))
              ) : (
                <SaidWithRecords
                  said={one.outcome.said}
                  records={one.outcome.records}
                  plain={(text) => periodsInWords(withoutRecordIds(text))}
                />
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================================================ the stylesheet

/**
 * The drawing of an item's parts, shared by both surfaces.
 *
 * NO BACKTICK ANYWHERE INSIDE THIS STRING, including in a comment. A stylesheet in this project
 * lives inside a template literal in a .tsx file, so one backtick closes the string and turns the
 * rest of the file into nonsense with an error pointing at a line of prose.
 */
export const PLAN_ITEM_CSS = `
/* An item's words. A box with no edges until the cursor is in it, so a dense grid of them does not
   read as a form. The same treatment the plan's own name has. */
.pi-words-box { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pi-words, .pi-hours {
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 1px 2px;
  border: 0;
  /* THE RULE UNDER A FIELD IS THE EDGE OF THE FIELD, so it is drawn with the token that means that.
     It was var(--border), which is the DECORATION token and is the very same declaration the table
     draws its row rules with — one pixel doing two jobs, measured at 1.48:1 against the page, so a
     field and a ruled line were literally the same pixel. tokens.css states the rule this broke:
     --border-strong is "the line that IS the object — the edge of a button, an input, a select". */
  border-bottom: var(--border-w) solid var(--border-strong);
  border-radius: 0;
  background: none;
  font: inherit;
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--text);
  min-width: 0;
}
/* The words box grows with its words rather than hiding their tail. See GrowBox above. */
.pi-words { display: block; resize: none; overflow: hidden; overflow-wrap: anywhere; }
/* THE SAME BOX WITH ITS MATHS DRAWN, while the cursor is elsewhere. It keeps the box's edge, ground
   and weight, so a cell does not change shape when it is pressed. See GrowBox. */
.pi-words-drawn { cursor: text; }
.pi-hours { font-variant-numeric: tabular-nums; text-align: right; }
/* AN EMPTY FIELD GETS A GROUND AS WELL, because an empty field is the case that has nothing to hint
   with — the owner found the note column by clicking blank space to see what would happen. A field
   holding words does not need it: the words are the hint, and a ground on every cell of a dense
   table is the permanent form chrome the contract forbids in the same breath.
   TWO CHANNELS, NEVER ONE. In the high-contrast theme every surface token is the same white, so the
   ground says nothing there and the edge above is pure black, which is why both are drawn. */
.pi-words:placeholder-shown, .pi-hours:placeholder-shown { background: var(--panel-2); }
.pi-words:hover, .pi-hours:hover { background: var(--panel-2); }
.pi-words:focus, .pi-hours:focus { outline: none; border-bottom-color: var(--accent); background: var(--panel-2); }
.pi-words::placeholder, .pi-hours::placeholder { color: var(--placeholder); font-style: italic; }

/* THE WHOLE CELL IS THE FIELD, so a press anywhere in the cell lands in the box.
   Measured at 1440 on 16 August 2026: the cell was 122 by 26.5 pixels and the box 110 by 21, so
   about a fifth of every cell was dead space drawn exactly like the field. The box reaches back
   over the cell's own padding and takes that padding on itself, so nothing moves on screen and
   there is no strip left over. THE NUMBERS ARE THE CELL'S OWN PADDING, negated: .pt-table td in
   PlanTable.tsx sets 2px 6px, and tests/plan-table-cells.test.ts fails if the two stop agreeing. */
.pi-words-box[data-fill='cell'] { margin: -2px -6px; height: 100%; box-sizing: border-box; }
.pi-words-box[data-fill='cell'] > .pi-words,
.pi-words-box[data-fill='cell'] > .pi-hours { padding: 3px 8px; flex: 1 0 auto; }
.pi-words-box[data-fill='cell'] > .pi-said { padding: 0 8px; }

/* WORDS SOMEBODY WROTE ABOUT TIME THAT NOTHING WAS SCHEDULED FROM. The words are the value; the two
   quiet words beside them are the whole state, said out loud rather than hidden in a tooltip that
   only exists under a pointer. Dashed, like every other box on this surface holding what a person
   wrote rather than what Mole Office stores and counts. */
.pi-kepts { display: inline-flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.pi-kept {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 0 4px;
  border: var(--border-w) dashed var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: var(--fs-1);
  min-width: 0;
}
.pi-kept-words { color: var(--text-2); font-style: italic; overflow-wrap: anywhere; }
.pi-kept-mark { color: var(--text-3); }
/* THE SAME KEPT WORDS WITH A BOX ROUND THEM, ON A ROW SOMEBODY HAS FILED. No chip edge here: the
   box carries its own dashed rule, which is this surface's one mark for what a person wrote rather
   than what Mole Office stores, and a dashed border inside a dashed border reads as two objects. It takes
   the whole width so the words and the mark under them are laid out exactly as they were before the
   line was filed. See KeptWords. */
.pi-kept[data-edit='1'] { display: block; border: 0; padding: 0; width: 100%; }
.pi-kept[data-edit='1'] > .pi-kept-mark { display: block; line-height: var(--lh-tight); }
/* WHAT MOLE OFFICE READ OUT OF SOMEBODY'S TIME WORDS. One line, no box: a bordered chip here wrapped to
   three lines in a 140px column and took the row from 27 pixels to 63. The dot is the separator this
   table already uses in the line under it. See ReadOfTimeWords. */
.pi-read { display: block; font-size: var(--fs-1); line-height: var(--lh-tight); min-width: 0; }
.pi-read > .pi-kept-mark::before { content: ' · '; }
/* Upright, not italic: the italics on this surface mean "these are the characters a person typed",
   and this is Mole Office answering, not the person writing. Tabular figures, because it prints a period
   key and a number of hours and those are read down a column. */
.pi-read-said { color: var(--text-2); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
/* A heading keeps the weight it was typed with, so the levels are legible down the column. */
.pi-words[data-heading='1'] { font-weight: 700; }
.pi-words[data-heading='2'] { font-weight: 650; }
.pi-words[data-heading='3'] { font-weight: 600; }
.pi-words[data-heading='4'], .pi-words[data-heading='5'], .pi-words[data-heading='6'] { font-weight: 550; }

/* A BOX HOLDING WHAT SOMEBODY WROTE IN THE PLAN, rather than a value stored on a record.
   Quieter ink, italic, and a dashed rule under it instead of a solid one. The two are different
   things — one is in the totals and one is not — so they may not be drawn the same way. The whole
   sentence is on the box for a reader who rests on it. */
.pi-words[data-said='plan'], .pi-words-read[data-said='plan'] { color: var(--text-2); font-style: italic; }
.pi-words[data-said='plan'] { border-bottom-style: dashed; }
/* A stored value and the words the line still carries, side by side in one cell. */
.pi-pair { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 4px; min-width: 0; }

/* An item's words where this surface may not rewrite them. Same size and weight as the box above,
   so a row does not change shape, and no rule under it: there is nowhere to type. */
.pi-words-read {
  display: block;
  padding: 1px 2px;
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--text);
  overflow-wrap: anywhere;
  min-width: 0;
}
.pi-words-read[data-heading='1'] { font-weight: 700; }
.pi-words-read[data-heading='2'] { font-weight: 650; }
.pi-words-read[data-heading='3'] { font-weight: 600; }
.pi-words-read[data-heading='4'], .pi-words-read[data-heading='5'], .pi-words-read[data-heading='6'] { font-weight: 550; }

/* The box a new item is typed into. It sits where the item will sit, and the characters Mole Office
   will write before the words are drawn to the left of it, dimmed. */
.pi-new { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pi-new-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; }
.pi-new-line .pi-words { flex: 1 1 8rem; }
.pi-new-marker {
  flex: none;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  white-space: pre;
}

.pi-tick { flex: none; margin: 0; width: 14px; height: 14px; accent-color: var(--accent); cursor: pointer; }
/* The tick as the characters somebody typed, where this surface may not change them. */
.pi-tick-read { flex: none; color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-tight); }
.pi-tick-read[data-done='1'] { color: var(--text); }

/* WHAT SORT OF THING A ROW IS. A menu before it is tracked, and the record's own word after — the
   two are drawn differently because only one of them is a control. */
.pi-type { font-size: var(--fs-1); color: var(--text-2); white-space: nowrap; }
/* A CELL WHOSE CONTROL IS A MENU, not a box you type in. It deliberately does not share the class a
   text box on this surface has: a test measures the narrowest of those boxes to check the WORDS are
   not squeezed to a few characters on a phone, and a menu in that measurement makes it about the
   wrong column. */
.pi-pickbox { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pi-type-pick, .pi-project-pick {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 1px 2px;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  cursor: pointer;
}
.pi-type-pick:hover, .pi-project-pick:hover { border-color: var(--border-strong); }

/* THE PARTS ADD UP TO MORE THAN THIS SAYS. Red, small, and it opens: the explicit number stays
   visible with a clear warning beside it that explains itself when pressed.
   A native details, so it works from the keyboard and on a phone with no handler of its own. */
.pi-over { display: inline-block; position: relative; }
.pi-over > summary {
  list-style: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: var(--st-failed-bg);
  color: var(--st-failed);
  border: var(--border-w) solid var(--st-failed-line);
  font-size: var(--fs-1);
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.pi-over > summary::-webkit-details-marker { display: none; }
.pi-over-body {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: var(--z-popover);
  width: min(22rem, calc(100vw - 4rem));
  padding: var(--pad);
  border: var(--border-w) solid var(--st-failed-line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  box-shadow: var(--elev-2);
  white-space: normal;
}

/* WHAT THE PARTS OF AN UNSIZED ITEM ADD UP TO. Quiet and italic, like every other value on this
   surface that is worked out rather than stored, so it cannot be read as an estimate somebody gave. */
.pi-derived {
  font-size: var(--fs-1);
  font-style: italic;
  color: var(--text-2);
  white-space: nowrap;
}

/* THE LEAST THIS ROW CAN TAKE, where the parts inside it hold more than the row says. Worked out
   rather than stored, so it is quiet and italic like the derived number above it, and it carries a
   dotted rule so the two cannot be read as one value. The same three words are under the table. */
.pi-floor {
  font-size: var(--fs-1);
  font-style: italic;
  color: var(--text-2);
  white-space: nowrap;
  border-bottom: var(--border-w) dotted var(--border-strong);
}

.pi-stands { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; }

/* THE TICK AND THE STATE SAYING DIFFERENT THINGS, ON THE ROW WHERE IT HAPPENS.
   Full-strength text and a warning rail, because this is not furniture: somebody has to decide which
   of the two answers is right. It wraps under the line rather than sitting inside it, since a
   sentence and a press cannot fit in a dense row at 390. */
.pi-apart {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px var(--pad);
  margin: 2px 0 0;
  padding-left: var(--pad);
  border-left: var(--rail) solid var(--st-blocked, var(--border-strong));
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text);
  min-width: 0;
}
.pi-apart-acts { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.pi-apart-none { color: var(--text-2); }
.pi-open { font-size: var(--fs-1); color: var(--text-2); text-decoration: underline; }

.pi-none { color: var(--text-3); font-size: var(--fs-1); }

.pi-periods { display: inline-flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.pi-period {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 0 4px;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--fs-1);
}
.pi-period-key { color: var(--text-2); font-variant-numeric: tabular-nums; }
/* THE STORED PERIOD KEY, IN INSPECT ONLY. Quieter than the name beside it and in the product's own
   fixed-width ink, because it is a value to be read exactly rather than a phrase to be read at a
   glance. See PeriodInWords. */
/* IT IS NEVER BROKEN ACROSS TWO LINES. Measured in Inspect at 1440 in a 140px column: the key came
   out as "2026-" and "W35", and a stored value a person is meant to read exactly must arrive whole.
   It wraps to the next line as one word instead. */
.pi-period-stored { color: var(--text-3); font-family: var(--font-mono); font-size: var(--fs-1); white-space: nowrap; }
.pi-period-stored::before { content: ' '; }
.pi-period-hours { color: var(--text); }

/* A form that opens under a row. It is quiet furniture: the row above it is the thing being read. */
.pi-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  min-width: 0;
}
.pi-form-say { margin: 0; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); }
.pi-form-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px var(--pad); min-width: 0; }
.pi-label { display: flex; flex-direction: column; gap: 2px; font-size: var(--fs-1); color: var(--text-2); }
.pi-select, .pi-hours-box, .pi-find, .pi-when {
  box-sizing: border-box;
  padding: 2px 4px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: var(--fs-2);
}
/* Wide enough for the words it now takes. It was 6rem, which fitted a number and hid a sentence. */
.pi-hours-box { width: 9rem; }
.pi-find { width: 100%; max-width: 24rem; }

/* WHEN IS THE PRIMARY FIELD OF THIS CONTROL, so it is the widest thing in it and it comes first.
   It takes a sentence — "the first half of September" — and a box that fits "next week" and hides
   the rest would be the product telling somebody their answer is too long. */
.pi-when { width: 100%; max-width: 20rem; }
/* AS WIDE AS THE BOX AND NO WIDER, so the shortcuts sit beside the box they fill in. Given room to
   grow, the label took the whole row and pushed them to the far edge of the panel, where they read
   as three separate controls rather than as three ways of filling this one in. */
.pi-when-label { flex: 0 1 20rem; min-width: 0; }
.pi-when-label .pi-when { font-size: var(--fs-3); }
/* The shortcuts sit beside the box they fill in, small, because they are a convenience and not the
   interaction. They were the whole interaction, and that is the defect this pass corrects. */
.pi-shortcuts { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; }

.pi-period-pick {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 2px var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: var(--fs-1);
  cursor: pointer;
}
.pi-period-pick[aria-pressed='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}
/* The period key inherits the chosen pill's ink. It was the quiet grey below, which on the accent
   ground was all but invisible — measured in a photograph on 14 August. */
.pi-period-pick[aria-pressed='true'] .pi-period-key { color: inherit; }

.pi-found { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 15rem; overflow-y: auto; }
.pi-found-one {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  text-align: left;
  padding: 2px var(--pad);
  border: var(--border-w) solid transparent;
  border-radius: var(--radius-sm);
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.pi-found-one:hover { border-color: var(--border-strong); background: var(--panel); }
.pi-found-name { font-size: var(--fs-2); color: var(--text); overflow-wrap: anywhere; }
.pi-found-where { font-size: var(--fs-1); color: var(--text-3); overflow-wrap: anywhere; }

/* What a press did, in the server's own sentence. Refused rows are told apart by a rail and a word,
   never by colour alone. */
/* What Mole Office could not read out of a row's own words, said BEFORE the press rather than after it.
   One line per row it is about, so a press on twenty rows does not repeat one sentence twenty times
   about the nineteen it read perfectly well. */
.pi-form-said {
  margin: 0;
  padding-left: 1.1rem;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
}
.pi-said { font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); overflow-wrap: anywhere; }
.pi-said[data-ok='0'] { color: var(--st-failed, var(--text)); }
/* TAKING THE RECORD'S SHORTER FORM: one press and the refusal under it, laid out like the other
   presses on a row so a plan with several of them does not grow a different shape each time. */
.pi-shortform { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; }
/* A RECORD NAMED INSIDE A SENTENCE, DRAWN AS THE WAY TO IT. Full-strength text inside grey prose,
   because the rest of the sentence is a receipt and this is the one part of it a person presses. */
.pi-reach { color: var(--text); text-decoration: underline; }
.pi-report { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pi-report-say { margin: 0; font-size: var(--fs-1); color: var(--text); }
.pi-report-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.pi-report-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 2px var(--pad);
  padding-left: var(--pad);
  border-left: var(--rail) solid var(--border);
  min-width: 0;
}
.pi-report-list li[data-ok='0'] { border-left-color: var(--st-failed, var(--border-strong)); }
.pi-report-what { font-size: var(--fs-1); color: var(--text); overflow-wrap: anywhere; }
`
