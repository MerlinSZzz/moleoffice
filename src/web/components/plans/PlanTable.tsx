// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useInspect } from '../../lib/mode.ts'
import { endOfSentence, listJoined, t } from '@shared/i18n.ts'
/**
 * THE DENSE PLANNING TABLE: MANY PIECES OF WORK SEEN TOGETHER, AND EDITED WHERE THEY ARE SEEN.
 *
 * ---------------------------------------------------------------------------------------
 * A ROW IS AN ITEM, NOT A STORED LINE
 * ---------------------------------------------------------------------------------------
 *
 * A plan is a document. Its blank lines and its prose are the writing between the things being
 * planned, and giving each of them a row made a table that was mostly empty. A row here is an ITEM:
 * a heading, a bullet, a tick box, a numbered item, or a row of one of the writer's own pipe
 * tables. What is left over is counted under the table rather than dropped quietly.
 *
 * The depth of a row is worked out from the text by `src/shared/planoutline.ts` and is never stored.
 * Parents collapse. One press flattens the whole table and moves the ancestor path into a column of
 * its own, which is how a person sees every level at once while scheduling.
 *
 * ---------------------------------------------------------------------------------------
 * THE DOCUMENT IS THE STORE, SO EDITING A CELL EDITS THE DOCUMENT
 * ---------------------------------------------------------------------------------------
 *
 * Changing the words of a row rewrites that line of the document keeping its marker, so a heading
 * stays a heading. Ticking a plain bullet writes a tick box into the line, visibly, where the
 * writing view will show it. That is what makes the document and the table two readings of one
 * thing rather than an editor and a report. The writing lives in `planitems.tsx`, shared with the
 * pane beside the writing box, because two independent drawings of one item is the defect this
 * repository keeps producing.
 *
 * ---------------------------------------------------------------------------------------
 * AND ADDING A ROW IS WRITING A NEW LINE, DIRECTLY AFTER THE ONE YOU PRESSED
 * ---------------------------------------------------------------------------------------
 *
 * The plus at the end of a row opens a box where the new item will be, drawn at the depth it will
 * have, with the characters Mole Office will write in front of it. Typing the words and pressing Enter
 * writes ONE LINE of the document and opens the next box; nothing is written until words are typed.
 * `newItemAfter` in planitems.tsx holds the rule about where it goes and what it is written as, and
 * says why.
 *
 * ---------------------------------------------------------------------------------------
 * AND SO THE PAGE, NOT THIS TABLE, HOLDS THE PLAN — `onWrote` IS WHAT MAKES THAT TRUE
 * ---------------------------------------------------------------------------------------
 *
 * MEASURED DEFECT, AND IT IS WHY THIS PROP EXISTS. This table used to keep the lines it had read
 * back in a state of its own and tell nobody. A row's words were changed to "CALIBRATED-IN-TABLE";
 * the server stored it; the table showed it; the writing box was still holding the plan as it was
 * before, and one character typed there stored the OLD words back over the new ones. The edit
 * vanished with nothing said. Two copies of one document, and the stale one won.
 *
 * So every re-read this table makes is handed to `onWrote`, which is the page's own copy — the same
 * copy the writing box is seeded from. There is one holder of the plan's text on the page and this
 * table is not it.
 *
 * A CALLER THAT GIVES NO `onWrote` MAY NOT REWRITE A LINE, and the three controls that would are
 * not drawn. That is not caution: without somewhere to put the answer, storing new words here is
 * exactly the write that was silently undone. The rest of the table — the estimate, your note,
 * filing, pointing at work, giving it time — is offered as usual, because none of those changes a
 * character of the document.
 *
 * ---------------------------------------------------------------------------------------
 * ONE DECLARATION PER COLUMN
 * ---------------------------------------------------------------------------------------
 *
 * `COLUMNS` below is the only place a column is described: its heading, what it is made of, what it
 * is about, how it sorts, and whether it is worth its width when there is little room. There is one
 * arrangement, so there is one place a heading is written and one place it is drawn — the row of
 * headings at the top of the table. `RecordsPage.tsx` holds the same idea as two separate objects
 * and its own comment records its labels having drifted; this is that defect not being copied.
 *
 * The writer's own pipe-table headings become columns beside Mole Office's, and THE WRITER DECLARES
 * NOTHING. The earlier design made them press each heading to say what it meant, and its own author named that as
 * its weakest part: a table whose columns are never declared totals nothing. Mole Office supplies the
 * planning columns instead, so nothing has to be declared for the hours to be real.
 *
 * ---------------------------------------------------------------------------------------
 * ONE ARRANGEMENT AT EVERY WIDTH, AND IT IS THE TABLE. A NARROW COLUMN SHEDS COLUMNS, NOT DENSITY
 * ---------------------------------------------------------------------------------------
 *
 * There used to be a second arrangement here: below 760px each item became a CARD carrying a label
 * beside every value. It was written for a phone and it was drawn on a desk, because beside the
 * writing box at a 1400px window this table's column measures 557px. Measured on a plan of fourteen
 * items: the cards were 105px tall and six of them filled the screen, each one repeating "Pick",
 * "What it is", "Where it stands" and "My note". The same fourteen items in the table are 27px tall,
 * every one of them is on the screen at once, and each of those four words is written ONCE, in the
 * row of headings. A planning table has to be dense, with many pieces of work visible
 * together and no repeated labels; the cards were the least dense thing in the product and
 * the largest source of repeated labels on this page. They are deleted.
 *
 * SO WHAT DOES A NARROW COLUMN DO INSTEAD? It sheds columns. Below `WIDE_ENOUGH_FOR_THE_TABLE` the
 * table leaves off the writer's own pipe-table columns and says under itself which ones it left off,
 * with one press that brings them back. A shed column is a column a reader can ask for; a card is a
 * shape they cannot argue with.
 *
 * EVERY COLUMN MOLE OFFICE SUPPLIES SURVIVES THE NARROWING, AND THAT IS A CORRECTION. How big, Time given
 * and Project used to be shed, and this table's own column measures 659px beside the writing box —
 * so in the view the owner was using they were not drawn at all. The owner reported four columns as
 * fake.
 * Three of them were absent. Problem `ERdnKAOJcRID`, and `keepWhenNarrow` below is where it is
 * answered.
 *
 * TWO ARRANGEMENTS WAS ALSO THE DEFECT THIS REPOSITORY KEEPS PRODUCING. Which record columns fold
 * into one cell on an unfiled row was worked out twice, once in `PlanRow` and once in the card, and
 * nothing made the two agree. There is one now.
 *
 * ---------------------------------------------------------------------------------------
 * THE TABLE MEASURES ITS OWN COLUMN, NOT THE WINDOW
 * ---------------------------------------------------------------------------------------
 *
 * How many columns are drawn is decided by how much room this table has, read off its own box. It
 * used to be decided by the width of the WINDOW, and beside the writing box at a 1400px window that
 * was wrong by half: the column measures 557px and the window said wide. `useNarrowHere` below holds
 * the reading and says why a container query does not answer it.
 *
 * ---------------------------------------------------------------------------------------
 * AND A COLUMN THE BOX CANNOT SHOW IS NAMED, WITH A PRESS THAT BRINGS IT HERE
 * ---------------------------------------------------------------------------------------
 *
 * MEASURED DEFECT, 16 AUGUST 2026, AND IT IS WHY THE LINE ABOVE THE TABLE EXISTS. Keeping every
 * column Mole Office supplies at every width fixed one fault and made another: the table is then wider
 * than its box and the box clips the rest. Measured in Chromium on a plan of six items —
 *
 *   1440, Writing and table: box 659px, table 977px. Time given 103 of 140px, PROJECT 0 of 140px,
 *   MY NOTE 0 of 140px. The scrollbar gutter measured 0px, so nothing on the screen said there was
 *   anything to the right at all.
 *   390, either view: box 366px, table 989px. How big, Time given, Project and My note all 0 of
 *   140px.
 *
 * Those are editable columns. A person could type in none of them and nothing said why. The one
 * sentence under the table was about three columns Mole Office has never had — waiting on, when it is
 * owed, who carries it — so a reader looking for the note column was told about columns that do not
 * exist. It is deleted.
 *
 * WHAT IS THERE INSTEAD: the table measures which of its own headings the box is not showing, on
 * every scroll and every resize, and names them above itself. Each name is a press that scrolls
 * that column into the box. The list is live, so scrolling right names what has gone off the left.
 * A column can still be out of sight; it can no longer be out of sight and unmentioned.
 *
 * ---------------------------------------------------------------------------------------
 * AND AT 1440 THERE IS NOW NOTHING TO NAME, WHICH IS THE BETTER ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * Naming a column that is off the edge is honest. Not putting it off the edge is better, and at the
 * width the owner works at it turned out to be possible. The owner read the 1440 case again on 20
 * August 2026 and reported it as a clip: the Schedule column ending mid-word at the right edge. It was
 * named above the table the whole time, and the owner still read it as broken, because six columns adding
 * up to 1105px in a 659px box is a broken table whatever is written over it.
 *
 * `columnWidths` below fits them to the room, and at 1440 in Writing and table all six are now on
 * the screen. At 390 they still cannot be — six columns need 588px in a 366px box — so there the
 * widths are left alone and the names above the table are still the answer. The mark at the edge
 * comes from `components/InReach.tsx`, which this table's own measuring code became.
 *
 * ---------------------------------------------------------------------------------------
 * AN EMPTY COLUMN IS A CLAIM, SO A COLUMN MOLE OFFICE CANNOT FILL IS ABSENT
 * ---------------------------------------------------------------------------------------
 *
 * ONE COLUMN IS ABOUT THE RECORD AND ONLY ONE, which is why a row nobody has filed says so in that
 * one cell — where it stands — and fills the rest as usual. How big, Time given and Project are the
 * line's own words until the line is filed, so they are boxes on every row and would be wrong to
 * blank out. This used to cover four columns with one sentence, back when all four needed a record.
 *
 * ---------------------------------------------------------------------------------------
 * SORTING IS TEMPORARY, SAYS SO, AND FLATTENS
 * ---------------------------------------------------------------------------------------
 *
 * The stored order is the order the document is written in, and that order IS the tree. Sorting a
 * tree by size would move a child away from its parent and leave an indent that lies, so sorting
 * flattens the table in the same press and the sentence above it says both. One press puts it back.
 */

import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import {
  faultOf,
  api,
  errorMessage,
  getActor,
  type PlanLineWithWork,
} from '../../api.ts'
// THE THREE ATTRIBUTES THAT MAKE AN ELEMENT ADDRESSABLE, declared once in src/shared/targets.ts.
// Nothing here calls a hook: carrying the attribute IS the wiring, and one listener at the document
// reads it. See components/agent/pointing.ts.
import { targetAttributes, textAttributes, type PlanLineFact } from '@shared/targets.ts'
// And what the thing is CALLED, which is not one of the three: it carries no promise about where
// the characters are stored. See NAME_ATTRIBUTE in components/agent/pointing.ts.
import { nameAttributes } from '../agent/pointing.ts'
// THE ONE ANSWER TO "IS ANYTHING OFF THE EDGE". It was written in this file and it moved, so that
// the twelve boxes that scrolled in silence beside it can draw the same mark from the same reading.
import { InReachBox, useReach } from '../InReach.tsx'
import { whenTheLookMayChange } from '../PresetBar.tsx'
import { recordPath, RouteLink } from '../router.tsx'
import { Absence, ErrorNote, useAsync } from '../ui.tsx'
import { effortOf, whatWasNotRead, type EffortReading, type EffortTotals } from '@shared/envelope.ts'
// THE LADDER'S OWN BUDGETS AND THE OFFICE'S OWN WORD COUNT, called rather than copied: the mark this
// table draws on an over-long line is measured by the same numbers the door refuses by, so a line
// cannot be drawn as over budget while the door accepts it, or the other way round.
import { SHORT_FORM_SPECS, wordsAgainstACeiling } from '@shared/zoom.ts'
import { clearStored, readStored, writeStored } from '../../lib/store.ts'
import {
  AddAnItem,
  atLeastSaid,
  A_FIRST_ITEM,
  GiveItTime,
  ItemCell,
  ItemEstimate,
  ItemHours,
  ItemKept,
  ItemNote,
  ItemPlanned,
  ItemProject,
  ItemShortForm,
  ItemsOriginNote,
  ItemStands,
  ItemTick,
  ItemType,
  ItemWords,
  MakeItWork,
  newItemAfter,
  PointAtWork,
  planItemsOf,
  parentKeysOf,
  pickedAfter,
  PLANNING_WORDS,
  PLAN_ITEM_CSS,
  serverDay,
  shareOf,
  subtreesOf,
  TickAgainstState,
  useWorkList,
  whereACellSits,
  wordsOf,
  writtenValue,
  type ItemActs,
  type NewItem,
  type PickedShare,
  type PlanItem,
} from './planitems.tsx'
import { holdsMaths, lineWithMaths } from './PlanMaths.tsx'

/** One column: its heading, what it is made of, what it is about, and how it sorts. */
export interface Column {
  key: string
  /** The heading on the wide table AND the label on a phone. One string, so they cannot differ. */
  heading: string
  /**
   * What the column is about: the item's own words, one of the writer's own pipe-table columns, or
   * EITHER — the line until it is tracked and the record after.
   *
   * Drawn, because a reader looking at nine columns cannot otherwise tell which of them Mole Office
   * would change if the record changed.
   *
   * `either` IS THE OWNER'S CORRECTION AND FOUR COLUMNS HAVE IT. Type, Estimate, Schedule and
   * Project can be written on any line, tracked or not. Before it is tracked the words live in the
   * line itself; tracking moves each value to the place Mole Office keeps that kind of fact, and the cell
   * reads the record from then on. Tracking promotes what you know; it does not unlock saying it.
   *
   * THERE IS NO `record` ANY MORE. One column had it — Where it stands — and that column is gone:
   * its state word is a mark beside the task and its kind is the Type column. Nothing on this table
   * is now drawable only after a line is tracked, so no cell has to be merged away on an untracked
   * row, and the merge that did it is deleted with the word.
   */
  about: 'line' | 'either' | 'yours'
  /**
   * WHICH FACT BESIDE THE LINE THIS COLUMN DRAWS, where it draws one of them.
   *
   * A cell with one says so on itself as a `planLineFact` target, so a right-click on it opens the
   * composer about that fact rather than about the whole line (problem ON-vXSmgokHf). Absent on the
   * columns that draw the line's own words, where the line is the answer.
   */
  fact?: PlanLineFact
  /**
   * What this column sorts on, or null when it does not sort.
   *
   * A row with nothing in this column sorts last whichever way the column is pointing, because
   * "nobody wrote this" is not a small number and is not an early letter.
   */
  sortOn: ((item: PlanItem) => string | number | null) | null
  /**
   * TRUE WHERE THIS COLUMN IS WORTH ITS WIDTH IN A NARROW COLUMN, and it is the whole of what a
   * narrow table does differently.
   *
   * EVERY COLUMN MOLE OFFICE SUPPLIES IS TRUE, AND THAT IS A CORRECTION. How big, Time given and Project
   * were false, so beside the writing box — where this table's own column measures 659px — they were
   * not drawn at all. The owner used that view, saw four columns they could not fill, and reported
   * them as fake. A column that is absent and a column that is broken look identical to somebody
   * trying to use one. Problem `ERdnKAOJcRID`.
   *
   * What is left is the writer's own pipe-table columns, which are named under the table with one
   * press that draws them anyway. Nothing is hidden and nothing becomes a card.
   */
  keepWhenNarrow: boolean
  /**
   * THE NARROWEST THIS COLUMN GOES BEFORE ITS OWN HEADING AND CONTROLS ARE CLIPPED, in pixels, or
   * absent where nobody has measured it.
   *
   * MEASURED, 21 AUGUST 2026, and not chosen. The table is `table-layout: fixed`, so a browser draws
   * a column at whatever width it is handed and clips what does not fit inside the cell. To find
   * where that starts, the three plans in the owner's corpus were each drawn with
   * `table-layout: auto; width: min-content` and every heading's box read off. Chromium answered, at
   * the widest of the three: Type 74, Estimate 87, Schedule 105, Project 62, Note 48. Estimate and
   * Schedule are rounded up to 88 and 106. Project also has to fit its picker: that day the picker
   * needed 69px for “Default”, plus the cell's padding, so its floor is 84px. The picker's part held
   * on that machine only, so the picker is also measured on the page, and where it needs more it
   * lifts this floor (`useWhatTheProjectChoiceNeeds`, problem QigTxPnCtF4s).
   *
   * THE TASK COLUMN IS NOT ONE OF THOSE. Its floor is `NARROWEST_THE_TASK_STARTS_AT`, 184, which is
   * a different measurement — what its contents need, taken at 390 in the same browser — and is
   * already the one number deciding how narrow the words go.
   *
   * ABSENT MEANS NOBODY HAS MEASURED IT, AND SUCH A COLUMN IS NEVER SQUEEZED. Where it sits and the
   * writer's own pipe-table columns hold text this table knows nothing about, so there is no width
   * at which their contents are known to survive. `columnWidths` treats their own width as their
   * floor rather than guessing one.
   *
   * WHAT IT IS FOR: `columnWidths` below fits the whole table into the room whenever the room can
   * hold every column at or above this width, so that a reader at 1440 sees six columns rather than
   * three columns and a mark. Below these widths a column is not narrow, it is clipped, so the table
   * stops squeezing and names what is off the edge instead.
   */
  narrowest?: number
  /**
   * What to draw in this cell.
   *
   * `canRewrite` says whether this table may change the CHARACTERS of a line of the document. Only
   * the writer's own pipe-table columns read it, because only they write into the line; the record
   * columns write to the record and are unaffected. See the head of this file.
   *
   * `envelope` is this row's own reading from `src/shared/envelope.ts` — what it says it takes, what
   * its parts add up to, and by how much the parts go over. Undefined where the table could not read
   * an envelope at all. Only the Estimate column reads it, and no column may add anything up.
   */
  cell: (
    item: PlanItem,
    acts: ItemActs,
    open: OpenPress,
    canRewrite: boolean,
    envelope: EffortReading | undefined,
  ) => React.ReactNode
}

/** Which form is open under which row, so only one is ever on screen. */
interface OpenPress {
  which: 'file' | 'point' | 'time' | null
  on: string | null
  show: (which: 'file' | 'point' | 'time' | null, on: string | null) => void
}

/**
 * The plus at the end of one row: what it says, what it opens, and where the new item would go.
 *
 * It is worked out once per row and both the press and the box read it, so the label cannot promise
 * one place and the write land in another.
 */
interface AddPress {
  /** What the new item would be and where. `newItemAfter` decides it; nothing here repeats the rule. */
  plan: NewItem
  /** The label on the press. It is the only place the row's own words appear on the press. */
  label: string
  open: boolean
  press: () => void
}

/**
 * The plus for one row, or nothing where this table may not write the document.
 *
 * A CALLER WITH NOWHERE TO PUT A RE-READ MAY NOT ADD A LINE, for the reason at the head of this
 * file: the words would be stored, the writing box would still hold the plan without them, and the
 * next keystroke would save them away again.
 */
function addPressFor(
  item: PlanItem,
  canRewrite: boolean,
  addingAfter: string | null,
  onAdd: (item: PlanItem) => void,
): AddPress | undefined {
  if (!canRewrite) return undefined
  const plan = newItemAfter(item)
  // UNDER, NOT AFTER, WHERE THE NEW ITEM IS A LEVEL DEEPER. The word is read off the depth the plan
  // itself carries rather than off the row's kind, so it says what will really happen.
  const where = plan.depth > item.depth ? t('g8.table.under') : t('g8.table.after')
  return {
    plan,
    // THE WORDS WITHOUT THE PLANNING VALUES. A line may end in a run of them, and a press that read
    // "Add an item after "rewrite it {size: 15h} {time: 15h this week}"" is a label nobody can hear.
    label: t('g8.table.addAnItem', { value1: where, value2: wordsOf(item) }),
    open: addingAfter === item.key,
    press: () => onAdd(item),
  }
}

/**
 * HOW FAR OVER ITS BUDGET A LINE OR A HEADING IS, OR NULL WHEN IT IS NOT.
 *
 * A body line is held to the ladder's level-2 budget and a heading to its level-1 budget, which is
 * the same pair the plan door refuses by. The count is over the line's own words — the marker, the
 * hashes and the trailing `{key: value}` groups are not part of what the line says — read by the
 * ladder's own `wordsAgainstACeiling`, so the mark and the refusal can never disagree about a number.
 *
 * IT IS A READING, NOT AN EDIT. An over-budget line is drawn exactly as it was written and marked;
 * nothing shortens it, renumbers it or hides it. P2 of design/planning/ACCEPTANCE.md.
 */
function overBudget(item: PlanItem): { words: number; max: number } | null {
  const heading = item.kind === 'heading'
  const words = heading ? item.text : wordsOf(item)
  const max = heading ? SHORT_FORM_SPECS.label.maxWords : SHORT_FORM_SPECS.title.maxWords
  const count = wordsAgainstACeiling(words)
  return count > max ? { words: count, max } : null
}

/**
 * THE TASK: its depth, its tick box, the box you type its words into, and where it stands.
 *
 * WHERE IT STANDS LOST ITS COLUMN AND MOVED IN HERE ON 17 AUGUST 2026, which is the owner's own
 * instruction: a status such as todo, open or done stays a small state mark near the task rather than
 * taking a major column, unless it earns one. A tracked row carries its state word
 * beside its words; an untracked one carries the press that tracks it.
 */
function WhatItIs({
  item,
  acts,
  canRewrite,
  add,
  open,
  children,
}: {
  item: PlanItem
  acts: ItemActs
  /** Whether this table may change the characters of the line. See the head of this file. */
  canRewrite: boolean
  /** The plus that opens a box for a new item under or after this one. */
  add?: AddPress | undefined
  /** Which form is open under which row, so the Track press can open its own. */
  open: OpenPress
  children?: React.ReactNode
}) {
  const work = item.entry.work
  // THE LINE'S OWN BUDGET, MARKED WHERE THE LINE IS DRAWN. See `overBudget`.
  const over = overBudget(item)
  return (
    <div className="pt-what">
      <div className="pt-what-line">
        {children}
        <ItemTick item={item} acts={acts} canRewrite={canRewrite} />
        <ItemWords item={item} acts={acts} canRewrite={canRewrite} />
        {/* ONE CHARACTER, NOT A WORD. Every row carries this press, and "Add an item" written out
            forty times is the repeated text this table exists to remove. What it will do is on
            its label for a screen reader and under the pointer as a tooltip, and pressing it draws
            the box where the item will go — which says it better than any label could. */}
        {add === undefined ? null : (
          <button
            type="button"
            className="pt-add"
            aria-expanded={add.open}
            aria-label={add.label}
            title={add.label}
            onClick={add.press}
          >
            +
          </button>
        )}
        {/* WHERE IT STANDS, OR THE PRESS THAT STARTS TRACKING IT. One of the two, always, at the end
            of the line. It used to be a column of its own; see the note above this component. */}
        {work === null ? <TrackPress item={item} open={open} /> : <ItemStands item={item} />}
      </div>
      {/* OVER ITS BUDGET: A MARK, NOT A REFUSAL AND NOT AN EDIT. The words above are left exactly
          as they were written — this says which budget they are over and by how many words, and
          nothing here shortens, renumbers or hides anything. A line already over budget is drawn
          this way rather than refused, because the refusal is on the write and this line was
          written before it. P2 of design/planning/ACCEPTANCE.md. */}
      {over === null ? null : (
        <span className="pt-over">
          {t('g8.table.overTheWordBudgetBy', { value1: over.max, value2: over.words - over.max })}
        </span>
      )}
      {/* THE RECORD'S OWN WORDS, BESIDE THE LINE AND NEVER INSIDE IT. Its conclusion where the
          record has one and its title where it has none, named as what it is. The line's own text
          above is not touched by this, and this is not the note column: the writer's note lives in
          the line and never moves to a record, which is the other direction entirely. */}
      {work === null || item.entry.explanation === null ? null : (
        <RouteLink
          to={recordPath(work.id)}
          className="pt-explanation"
          title={t('g8.table.openTheRecordFor', { value1: work.title })}
        >
          <span className="pt-explanation-level">
            {item.entry.explanation.level === 'conclusion' ? t('g8.table.conclusion') : t('g8.table.title')}
          </span>
          <span className="pt-explanation-text">{item.entry.explanation.text}</span>
        </RouteLink>
      )}
      {/* TAKE THE RECORD'S OWN SHORTER FORM INTO THIS LINE. A press somebody makes, never something
          the machine does on its own; the words are the record's and are never cut to fit. */}
      <ItemShortForm item={item} acts={acts} canRewrite={canRewrite} />
      {/* THE TICK AND THE STATE SAYING DIFFERENT THINGS, UNDER THE LINE THEY ARE BOTH ON.
          Two testers ticked a tracked line, watched the tick go on, and read "to do" on the same row
          a moment later with nothing saying why. It is drawn here rather than inside the line
          because it is a sentence and a press, and neither fits in a dense row at 390. See
          `TickAgainstState` for which of the two facts wins and why neither does. */}
      <TickAgainstState item={item} acts={acts} />
    </div>
  )
}

/**
 * A ROW NOBODY IS TRACKING YET, AND THE PRESS THAT STARTS.
 *
 * ---------------------------------------------------------------------------------------
 * THE PRESS IS CALLED "TRACK", A SHORT, PLAIN WORD
 * ---------------------------------------------------------------------------------------
 *
 * It read *"Make it real work"*. The owner found that phrase visually heavy and repeated many times.
 * It read *"Make it real work"*, a phrase that was visually heavy and repeated many times.
 * The action means, roughly, start tracking this plan item as canonical work in Mole Office. It
 * needs a short, plain label such as Track, and internal terms such as promote or canonicalize are
 * not used in Normal mode.
 * Track is what it is to the reader: from here on, Mole Office keeps this. It is not "file", "promote" or
 * "canonicalize" — those name the mechanism, and the seventh rule says name a thing after what it is
 * to the person reading it.
 *
 * ONE PRESS, NOT TWO. Both ways of tracking a line — making a record and pointing at work that
 * already exists — are inside the form this opens. Measured at 1440 on a plan of twenty-four lines:
 * two presses on every untracked row put two phrases on the screen fifteen times each and left the
 * words themselves squeezed into a fifth of the width.
 *
 * ---------------------------------------------------------------------------------------
 * HOW LOUDLY IT SAYS THERE IS NO RECORD, WHICH IS TWO ANSWERS AND NOT ONE
 * ---------------------------------------------------------------------------------------
 *
 * NOBODY IS TRACKING THIS LINE is ordinary emptiness by the test in `design/ROUND-FOUR.md`: the
 * reader does not have to do anything about it, and the press beside it already says what they would
 * do. So it is a dimmed dash with the sentence on the mark, through `Absence`.
 *
 * IT WAS TRACKED AND THAT RECORD HAS SINCE BEEN DELETED is a different fact and it stays legible. It
 * is the pair the fifth invariant is about: a blank reading as "nobody tracked this" when the truth
 * is "somebody did and the record is gone" is the guess this product refuses to make. It is rare — a
 * record has to have been deleted — so it costs nothing on an ordinary plan.
 */
function TrackPress({ item, open }: { item: PlanItem; open: OpenPress }) {
  const showing = open.on === item.key && open.which !== null
  const wasTracked = item.entry.line.recordId !== null
  return (
    <span className="pt-unfiled">
      {wasTracked ? (
        <span className="pt-gone" title={t('g8.table.thisLineWasTrackedAsWorkAndThatRecord')}>{t('g8.table.recordDeleted')}</span>
      ) : (
        // "so it has no record to read a state from" was the database explaining itself. The Track
        // button is in the same row and carries the rest. Nit 34, 19 August 2026.
        <Absence title={t('g8.table.notTrackedAsWorkYet')} />
      )}
      <button
        type="button"
        className="pt-press"
        aria-expanded={showing}
        aria-label={t('g8.table.trackAsWorkInMoleOffice', { value1: wordsOf(item) })}
        onClick={() => open.show(showing ? null : 'file', item.key)}
      >{t('g8.table.track')}</button>
    </span>
  )
}

/**
 * The two ways one line becomes real work, side by side, under the row it is about.
 *
 * Filing makes a record. Pointing binds the line to one that exists, which is also the repair for
 * the one thing editing a plan destroys: saving the document matches lines by their exact
 * characters, so changing a line's words drops the record it was pointed at.
 */
function FileOrPoint({ item, acts, onDone }: { item: PlanItem; acts: ItemActs; onDone: () => void }) {
  const [way, setWay] = useState<'file' | 'point'>('file')
  return (
    <div className="pt-ways">
      <div className="pt-way-pick" role="group" aria-label={t('g8.table.howMoleOfficeStartsTrackingThisLine')}>
        <button type="button" className="pt-press" aria-pressed={way === 'file'} onClick={() => setWay('file')}>{t('g8.table.makeANewRecord')}</button>
        <button type="button" className="pt-press" aria-pressed={way === 'point'} onClick={() => setWay('point')}>{t('g8.table.pointAtWorkThatExists')}</button>
      </div>
      {way === 'file' ? (
        <MakeItWork items={[item]} acts={acts} onDone={onDone} />
      ) : (
        <PointAtWork item={item} acts={acts} onDone={onDone} />
      )}
    </div>
  )
}

/**
 * MOLE OFFICE'S OWN COLUMNS, IN THE ORDER THEY ARE READ: Task, Type, Estimate, Schedule, Project, Note.
 *
 * ---------------------------------------------------------------------------------------
 * THE OWNER SET THESE SIX ON 17 AUGUST 2026, AND EACH ONE ANSWERS ONE QUESTION
 * ---------------------------------------------------------------------------------------
 *
 * The column names were still too indirect. What was here before mixed two questions in
 * one column twice over:
 *
 *   "Where it stands" drew the record's STATE and its KIND in one cell, which mixed the
 *   item's state with what the item actually is. So the state is now a small mark beside the
 *   words — it is scanned, never edited here — and the kind became a column of its own, which is
 *   what a person actually changes.
 *
 *   "Time given" drew an estimate's neighbour, a scheduled period and an allocation under one word,
 *   and estimate hours, scheduled dates and allocations must not be combined into one
 *   ambiguous "Time given" concept. Estimate answers how much work this probably takes. Schedule answers when the person
 *   means to work on it. They are two facts and THEY NEVER SHARE A CELL.
 *
 * ---------------------------------------------------------------------------------------
 * AND EVERY ONE OF THEM IS EDITABLE BEFORE THE LINE IS TRACKED AND AFTER
 * ---------------------------------------------------------------------------------------
 *
 * That is the rule round five got backwards and the owner corrected: filing a line as real work
 * should bind and promote the information, not unlock the ability to express it. Before tracking, a value is
 * planning intent and lives in the line's own trailing groups. After tracking it is canonical — the
 * estimate is on the record, the project is the record's project — and the plan read DERIVES it back
 * into the writing view, so it is stored once and seen in both places.
 *
 * TYPE IS THE ONE THAT NEEDED A NEW ROUTE, and it arrived in this same pass. `PATCH
 * /api/records/:id` now takes a `kind` and answers with every field the new kind had no place for
 * and where it was kept. The cell writes through it and draws that sentence, because a screen that
 * showed the new kind and dropped the report would hide a person's own answers moving.
 */
/**
 * THE NARROWEST THE TASK COLUMN STARTS AT, and how much of a small box it may start with.
 *
 * ---------------------------------------------------------------------------------------
 * MEASURED, 17 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * The Task column holds still while the rest of the table scrolls, so a reader who brings another
 * column into view can still tell which row they are looking at. At 390 the table's box is 366px,
 * and a Task column at its own 320px left EIGHTEEN PIXELS for whatever was brought into view — the
 * reported defect solved into a different one.
 *
 * So on a small box it starts at a share of that box instead, with a floor: 184px is the narrowest
 * the cell's own contents go before they are clipped, measured in Chromium at 390 — the words, the
 * tick box, the plus and the Track press with nothing to spare.
 *
 * A DEFAULT MAY DEPEND ON THE ROOM. A WIDTH SOMEBODY SET MAY NOT. This is only where the column
 * starts when nobody has dragged it; a width this person chose is theirs at every size, which is the
 * whole of `WIDTH_BY_DEFAULT` above and the whole of what was asked for.
 */
const NARROWEST_THE_TASK_STARTS_AT = 184
const SHARE_OF_A_SMALL_BOX_THE_TASK_STARTS_WITH = 0.45

const COLUMNS: readonly Column[] = [
  {
    key: 'what',
    get heading() { return t('g8.table.task') },
    about: 'line',
    sortOn: (item) => item.text.trim().toLowerCase(),
    keepWhenNarrow: true,
    narrowest: NARROWEST_THE_TASK_STARTS_AT,
    cell: () => null,
  },
  {
    key: 'type',
    get heading() { return t('g8.table.type') },
    about: 'either',
    sortOn: (item) => item.entry.work?.kind ?? null,
    keepWhenNarrow: true,
    narrowest: 74,
    cell: (item, acts) => <ItemType item={item} acts={acts} />,
  },
  {
    key: 'big',
    fact: 'size',
    get heading() { return PLANNING_WORDS.size },
    about: 'either',
    sortOn: (item) => item.entry.work?.effortHours ?? null,
    keepWhenNarrow: true,
    narrowest: 88,
    cell: (item, acts, _open, canRewrite, envelope) => (
      <ItemEstimate item={item} acts={acts} canRewrite={canRewrite} envelope={envelope} />
    ),
  },
  {
    key: 'time',
    fact: 'time',
    get heading() { return PLANNING_WORDS.time },
    about: 'either',
    // NOT SORTABLE ON PURPOSE. Hours at a month, a week and a day are three answers to three
    // questions and shared/planning.ts refuses to add them, so there is no one number to sort on.
    sortOn: null,
    keepWhenNarrow: true,
    narrowest: 106,
    cell: (item, acts, open, canRewrite) =>
      item.entry.work === null ? (
        // NOBODY HAS TRACKED THIS LINE, so there is no record to give hours to and nothing to give
        // them in. What the line says about time is still worth writing, and it is written here.
        <ItemPlanned item={item} acts={acts} which="time" canRewrite={canRewrite} />
      ) : (
        <div className="pt-time">
          <ItemHours item={item} acts={acts} />
          <ItemKept item={item} acts={acts} which="time" canRewrite={canRewrite} />
          <button
            type="button"
            className="pt-press"
            aria-expanded={open.which === 'time' && open.on === item.key}
            onClick={() => open.show(open.which === 'time' && open.on === item.key ? null : 'time', item.key)}
          >{t('g8.table.giveItTime')}</button>
        </div>
      ),
  },
  {
    key: 'project',
    fact: 'project',
    get heading() { return PLANNING_WORDS.project },
    about: 'either',
    sortOn: (item) => item.entry.work?.workspaceId ?? writtenValue(item, 'project').said,
    keepWhenNarrow: true,
    narrowest: 84,
    cell: (item, acts, _open, canRewrite) => <ItemProject item={item} acts={acts} canRewrite={canRewrite} />,
  },
  {
    key: 'note',
    get heading() { return PLANNING_WORDS.note },
    about: 'line',
    sortOn: (item) => writtenValue(item, 'note').said,
    keepWhenNarrow: true,
    narrowest: 48,
    cell: (item, acts, _open, canRewrite) => <ItemNote item={item} acts={acts} canRewrite={canRewrite} />,
  },
]

/** The column that only exists once the table is flat, because that is the only time it says more. */
const WHERE_IT_SITS: Column = {
  key: 'sits',
  get heading() { return t('g8.table.whereItSits') },
  about: 'line',
  sortOn: (item) => item.above.map((one) => one.text).join(' › ').toLowerCase(),
  // It replaces the indent, which is the depth this table draws, so it survives a narrow column for
  // the same reason the words do.
  keepWhenNarrow: true,
  cell: (item) =>
    item.above.length === 0 ? (
      // ORDINARY EMPTINESS. A top-level item has nothing above it, most of a plan's headings are
      // top-level, and the reader does nothing about it. It was a phrase at reading weight on every
      // such row; it is a dimmed dash with the sentence on the mark.
      <Absence title={t('g8.table.thisItemIsAtTheTopLevelSoNothing')} />
    ) : (
      // EACH LINE ABOVE IS READ ALONE, so a dollar sign in one never pairs with one in the next.
      <span className="pt-path">
        {item.above.map((one, n) => (
          <Fragment key={one.key}>
            {n === 0 ? null : ' › '}
            {lineWithMaths(one.text)}
          </Fragment>
        ))}
      </span>
    ),
}

/** One of the writer's own pipe-table columns, drawn from their heading and their cells. */
function yourColumn(heading: string): Column {
  return {
    key: `yours:${heading}`,
    heading,
    about: 'yours',
    // A column of the writer's own is their data and is never dropped for being theirs; it is dropped
    // for the same reason Mole Office's own extra columns are, and it is named under the table with them.
    keepWhenNarrow: false,
    sortOn: (item) => {
      const cell = item.cells.find((one) => one.heading === heading)
      if (cell === undefined || cell.value.trim() === '') return null
      const asNumber = Number(cell.value)
      return Number.isFinite(asNumber) ? asNumber : cell.value.toLowerCase()
    },
    cell: (item, acts, _open, canRewrite) => {
      const cell = item.cells.find((one) => one.heading === heading)
      if (cell === undefined) {
        // ORDINARY EMPTINESS, and it is on almost every row: only the rows of one pipe table are in
        // this column at all. One drawing for every absence on this page, so it cannot be read as a
        // value.
        return <Absence title={t('g8.table.thisRowIsNotFromATableOfYours', { value1: heading })} />
      }
      return <ItemCell item={item} cell={cell} acts={acts} canRewrite={canRewrite} />
    },
  }
}

/**
 * WHICH COLUMNS THIS TABLE DRAWS AND WHICH IT LEAVES OFF, from the three things that decide it.
 *
 * It is a function of its own so that the rule can be read and tested without a browser: which
 * columns survive a narrow table is what the owner reported as broken, and the measurement that
 * decides `tight` needs a laid-out box that a server render does not have. The component calls this
 * and draws what it hands back, so there is no second answer anywhere.
 */
export function columnsOfTable(input: {
  /** True while the table is flat, which is the only time the ancestor path is a column. */
  flat: boolean
  /** The headings of the writer's own pipe tables, in the order they first appear. */
  yourColumns: readonly string[]
  /** True while the table has too little room for every column and the reader has not asked for them. */
  tight: boolean
}): { drawn: Column[]; leftOff: Column[] } {
  const every: Column[] = [
    COLUMNS[0]!,
    ...(input.flat ? [WHERE_IT_SITS] : []),
    ...COLUMNS.slice(1),
    ...input.yourColumns.map(yourColumn),
  ]
  if (!input.tight) return { drawn: every, leftOff: [] }
  return {
    drawn: every.filter((one) => one.keepWhenNarrow),
    leftOff: every.filter((one) => !one.keepWhenNarrow),
  }
}

/**
 * WHAT THIS PLAN TAKES, READ AS ENVELOPES: one call into the one effort arithmetic Mole Office has.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THE OWNER MET, 17 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * The footer of this table said 44h where the Schedule, over the same nesting, said 12h. It added
 * every tracked row's estimate with a plain sum, so a piece of work and a part of that same work
 * were both counted. The owner's rule is that a parent's time is an envelope and its children's time
 * is its breakdown, never an addition to it. One structure must never produce two arithmetic answers in two views.
 *
 * IT ALSO ROUNDED NOTHING, so two estimates of 0.1 and 0.2 printed as 0.30000000000000004 on a
 * planning screen. `effortOf` rounds every sum to two places and that is why.
 *
 * ---------------------------------------------------------------------------------------
 * THE TREE IS THE DOCUMENT'S, AND THAT IS THE HONEST ONE HERE
 * ---------------------------------------------------------------------------------------
 *
 * A row's parent is the item it is written under in the plan — `item.above`, whose last entry is the
 * nearest one. That is the nesting a person reading this table can see, and it is the nesting they
 * mean when they say a heading holds its bullets. It is NOT read from the records' own `part_of`
 * links: tracking a line adopts the children already tracked directly under it, so the two usually
 * agree, and where they do not it is the document a reader of this table is looking at.
 *
 * EVERY ROW GOES IN, TRACKED OR NOT. An untracked row has no estimate — what its line says about
 * size is words rather than hours, and it is counted separately under the table — but it still HOLDS
 * the rows written under it. Leaving it out would break the chain and make its children roots, and
 * they would then be added on top of whatever holds the whole branch.
 *
 * NOTHING IS SUMMED IN THIS FILE. A test deleted on 13 November 2026 walked src/ and failed when a second
 * effort arithmetic appeared anywhere.
 */
export function planEffortOf(items: readonly PlanItem[]) {
  return effortOf(
    items.map((item) => ({
      id: item.key,
      parentId: item.above[item.above.length - 1]?.key ?? null,
      ownHours: item.entry.work?.effortHours ?? null,
    })),
  )
}

/**
 * THE FIRST SENTENCE UNDER THE TABLE: what this plan comes to, or why it comes to nothing.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT, REPRODUCED TWICE BY FIRST-TIME USERS ON 18 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * A new plan with `2h` typed into the estimate cell of one untracked row read:
 *
 *     Nobody has sized anything in this plan. · 10 nobody has sized · 10 not tracked as work ·
 *     1 sized in the plan only, which is in no total · 3 blank lines are not shown
 *
 * The first sentence is false and the fourth clause says so. The lead read the TRACKED total and
 * the clauses read what the plan's own lines say, so the two halves of one paragraph denied each
 * other. A person who has sized three lines and tracked none must not be told nobody has sized
 * anything.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT `total` BEING NULL ACTUALLY MEANS, WHICH IS WHAT THIS NOW SAYS
 * ---------------------------------------------------------------------------------------
 *
 * Every row of the table goes into the arithmetic, tracked or not, so an estimate on any tracked row
 * reaches a top-level row as part of its breakdown. `total` is therefore null in exactly one case:
 * nothing tracked as work carries an estimate. That is a fact about tracking, and it says nothing at
 * all about what the plan's own lines say — which is `sizedInThePlan`, counted and named beside it.
 *
 * WHERE THE FLOOR IS ABOUT TO BE PRINTED, THIS SAYS WHICH READING IT IS. `total` is what the plan
 * says and `atLeastTotal` is the least it can take. The two are different numbers on one screen, so
 * the first one now says what it is rather than leaving the reader to work out which is which.
 */
export function planTotalSaid(effort: EffortTotals, sizedInThePlan: number): string {
  // NO TOTAL IS SAID IN WORDS, not with the short mark: the line goes on "· 3 not sized as work", and a
  // lone mark before it read as a stray dash (problem ZPNVOJkn1oVp). Which of the two it is matters.
  if (effort.total === null) {
    return sizedInThePlan === 0 ? t('planTable.total.nothingSized') : t('planTable.total.none')
  }
  return t('g8.table.hInAllFromOfTopLevelRows', { value1: effort.total, value2: effort.totalFrom, value3: effort.roots })
}

// ============================================================================ the person owns the widths

/**
 * HOW WIDE EVERY COLUMN IS UNTIL SOMEBODY MOVES IT, in pixels, and the floor nothing may go under.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THAT WAS REPORTED
 * ---------------------------------------------------------------------------------------
 *
 * Three things were reported and two were asked for. The split view could crush Note and Project
 * into columns almost one character wide. It could make the page scroll sideways. And it sometimes
 * changed a column's width unexpectedly after somebody interacted with a row. This hurt usability
 * a great deal. The person has to be able to adjust column widths naturally and keep the layout
 * they chose, and no interaction may rewrite a layout the person had just set.
 *
 * THE THIRD OF THOSE DEFECTS IS THE ONE THAT DECIDED THE MECHANISM. A browser laying a table out
 * automatically re-decides every column from the contents on every draw, so typing a long note
 * really did rewrite the widths of a table somebody had just got the way they wanted. Nothing in a
 * stylesheet can stop that while the layout is automatic.
 *
 * SO THE COLUMNS ARE FIXED AND THIS IS WHERE THEY START. Every column is drawn at an explicit
 * width, the table is exactly as wide as its columns add up to, and NOTHING BUT A DRAG CHANGES ONE.
 * Sorting does not, folding does not, typing does not, and reading the plan again does not.
 *
 * THE TABLE NO LONGER STRETCHES TO FILL ITS BOX, and that is the trade. A browser asked to stretch a
 * fixed table shares the extra space out over the columns — which is exactly the unasked-for rewrite
 * above, arriving from the other direction. A little unused space on the right of a wide screen is
 * the smaller fault, and the person can drag a column into it.
 *
 * ---------------------------------------------------------------------------------------
 * THE TASK COLUMN WENT TO 352 FOR A PRESS THAT IS NO LONGER THERE, AND IS 320 AGAIN
 * ---------------------------------------------------------------------------------------
 *
 * Round seven ended every line with a mark that talked to an agent about it, and 32px was measured
 * on 18 August 2026 as what that mark cost: at 320 the cell's contents came to 340px on a row two
 * levels deep, so those rows went from 29px to 59px. The whole row is the line now — one listener
 * at the document reads the attribute the row carries — so there is no press in the cell and the
 * 32px goes back. Kept as the reason the number moved twice.
 */
const WIDTH_BY_DEFAULT: Readonly<Record<string, number>> = {
  what: 320,
  sits: 180,
  type: 104,
  big: 108,
  time: 200,
  project: 148,
  note: 220,
}

/** One of the writer's own pipe-table columns, which Mole Office knows nothing about the contents of. */
const WIDTH_OF_A_WRITERS_COLUMN = 140

/**
 * THE FLOOR, IN PIXELS. Below this a column is the column almost one character wide that the owner
 * reported, and
 * dragging past it is far more likely to be a slip than an intention.
 */
export const NARROWEST_COLUMN = 48

/** The ceiling. A column wider than this is a drag that ran away, not a layout anybody wanted. */
export const WIDEST_COLUMN = 900

/** The round pick control's column. Not resizable: it holds one 14px control and always will. */
const WIDTH_OF_THE_PICK_COLUMN = 28

/** How far one press of an arrow key moves an edge. Big enough to see, small enough to aim. */
const A_KEYPRESS_OF_WIDTH = 16


/**
 * The width this column is drawn at when nobody has moved it.
 *
 * `room` is how wide the table's own box measured, or 0 where nothing has measured it — a server
 * render and a runtime with no ResizeObserver both get the plain widths, which hide nothing.
 */
export function widthByDefault(key: string, room = 0): number {
  const own = WIDTH_BY_DEFAULT[key] ?? WIDTH_OF_A_WRITERS_COLUMN
  if (key !== 'what' || room <= 0) return own
  return Math.min(own, Math.max(NARROWEST_THE_TASK_STARTS_AT, Math.round(room * SHARE_OF_A_SMALL_BOX_THE_TASK_STARTS_WITH)))
}

/** A width with the floor and the ceiling applied, rounded to a whole pixel. */
export function widthWithin(px: number): number {
  return Math.round(Math.min(WIDEST_COLUMN, Math.max(NARROWEST_COLUMN, px)))
}

/**
 * THE WIDTH EVERY DRAWN COLUMN IS GIVEN, FITTED TO THE ROOM WHEN THE ROOM CAN HOLD THEM ALL.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FIXES, MEASURED AT 1440 ON 21 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * 1440 is the width the owner works at. In Writing and table the plan's own box is 659px and the six
 * columns added up to 1105px, so Schedule ended mid-word at the right edge and Project and Note were
 * not on the screen at all. Three of six columns off the edge, at the owner's own desk, on the view
 * they use.
 *
 * The columns added up to more than the box because every column but one was drawn at a fixed number
 * of pixels that did not know how much room there was. The Task column already did know — it starts
 * at a share of a small box — and its own note above states the rule this extends: A DEFAULT MAY
 * DEPEND ON THE ROOM. A WIDTH SOMEBODY SET MAY NOT.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * Every column keeps its own width where they all fit. Where they do not, the columns nobody has
 * dragged give up space in proportion to what they asked for, and none of them goes below the width
 * its contents were measured at. Where even those measured widths will not fit, NOTHING IS SQUEEZED:
 * the table draws its own widths, scrolls, and names above itself which columns are off the edge.
 * That is 390, where six columns need 588px and the box is 366px, and squeezing there would clip
 * every cell instead of the last two columns and tell nobody.
 *
 * A WIDTH THIS PERSON SET IS NEVER SQUEEZED, and it counts against the room like a wall. Somebody
 * who drags Schedule to 400px on a 659px box has said what they want; the other columns fit around
 * it or the table scrolls.
 *
 * IT IS PURE AND IT IS THE ONLY PLACE A WIDTH IS DECIDED, so the number in the `colgroup`, the
 * number the table's own width is added up from and the number the resize handle starts at are one
 * number. `room` is 0 on a server render and where nothing has measured, and then every column gets
 * its own width, which hides nothing.
 */
export function columnWidths(
  columns: readonly { key: string; narrowest?: number }[],
  room: number,
  chosen: Readonly<Record<string, number>>,
): Record<string, number> {
  const own = (col: { key: string }) => chosen[col.key] ?? widthByDefault(col.key, room)
  const out: Record<string, number> = {}
  for (const col of columns) out[col.key] = own(col)
  const total = () => columns.reduce((all, col) => all + (out[col.key] ?? 0), WIDTH_OF_THE_PICK_COLUMN)
  if (room <= 0 || total() <= room) return out

  // A column that can give: nobody has dragged it, and somebody has measured how narrow it goes.
  const canGive = columns.filter((col) => chosen[col.key] === undefined && col.narrowest !== undefined)
  const floor = (col: { key: string; narrowest?: number }) => col.narrowest ?? own(col)
  const held = columns
    .filter((col) => !canGive.includes(col))
    .reduce((all, col) => all + own(col), WIDTH_OF_THE_PICK_COLUMN)
  // EVEN AT EVERY MEASURED FLOOR IT WILL NOT FIT, so nothing is squeezed and the table announces.
  if (held + canGive.reduce((all, col) => all + floor(col), 0) > room) return out

  // Share what is left over, in proportion to what each column asked for, lifting any column the
  // share puts below its floor and dividing again over the rest. Each pass either settles at least
  // one column or settles them all, so it runs at most once per column.
  let sharing = [...canGive]
  let left = room - held
  while (sharing.length > 0) {
    const asked = sharing.reduce((all, col) => all + own(col), 0)
    const short = sharing.filter((col) => (own(col) * left) / asked < floor(col))
    if (short.length === 0) {
      let given = 0
      sharing.forEach((col, at) => {
        // The last one takes the rounding, so the columns add up to the room exactly rather than to
        // the room give or take a pixel, which is a scrollbar nobody asked for.
        const px = at === sharing.length - 1 ? left - given : Math.floor((own(col) * left) / asked)
        out[col.key] = px
        given += px
      })
      return out
    }
    for (const col of short) {
      out[col.key] = floor(col)
      left -= floor(col)
    }
    sharing = sharing.filter((col) => !short.includes(col))
  }
  return out
}

/** Where one person's column widths are kept. Per person, because two people share this machine. */
export function widthsKey(): string {
  const actor = getActor()
  return `mole-office.plan.widths.${actor.type}:${actor.id}`
}

/**
 * WHAT WAS STORED, READ INTO WIDTHS — or nothing at all, with the reason, when this build cannot use
 * it.
 *
 * A VALUE THIS BUILD DOES NOT RECOGNISE IS DROPPED AND ANNOUNCED, never quietly part-used. That is
 * the house rule for every remembered setting in this app and `readChoice` in lib/store.ts enforces
 * it for the simple ones. A half-used layout is worse than none: the person sees a table they did
 * not arrange and nothing says why.
 *
 * IT IS PURE, so the rule can be read and tested without a browser. The caller does the reading and
 * the dropping.
 */
export function widthsFromStored(raw: string | null): { widths: Record<string, number>; why: string | null } {
  if (raw === null) return { widths: {}, why: null }
  const dropped = (because: string) => ({
    widths: {},
    why: t('g8.table.moleOfficeDroppedTheColumnWidthsItHadRemembered', { value1: because }),
  })
  let read: unknown
  try {
    read = JSON.parse(raw)
  } catch {
    return dropped(t('g8.table.whatWasStoredIsNotReadable'))
  }
  if (typeof read !== 'object' || read === null || Array.isArray(read)) {
    return dropped(t('g8.table.whatWasStoredIsNotAListOfColumn'))
  }
  const widths: Record<string, number> = {}
  for (const [key, value] of Object.entries(read as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return dropped(t('g8.table.theWidthStoredForIsNotANumberOf', { value1: key }))
    }
    if (value < NARROWEST_COLUMN || value > WIDEST_COLUMN) {
      return dropped(t('g8.table.theWidthStoredForIsPixelsWhichThisBuild', { value1: key, value2: String(value) }))
    }
    widths[key] = Math.round(value)
  }
  return { widths, why: null }
}

/**
 * THE EDGE BETWEEN TWO COLUMNS, WHICH A PERSON DRAGS AND CAN ALSO REACH FROM THE KEYBOARD.
 *
 * A drag alone would be a control that does not exist for anybody using a keyboard, and this is one
 * of the few places in the product where the layout itself is the thing being changed. Left and
 * right move the edge; that is the whole of it.
 */
function WidthGrip({
  heading,
  width,
  onWidth,
}: {
  heading: string
  width: number
  /** `settled` is true when the person has let go, which is when the choice is remembered. */
  onWidth: (px: number, settled: boolean) => void
}) {
  const from = useRef<{ x: number; width: number } | null>(null)
  return (
    <span
      className="pt-grip"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('g8.table.changeTheWidthOf', { value1: heading })}
      aria-valuenow={width}
      aria-valuemin={NARROWEST_COLUMN}
      aria-valuemax={WIDEST_COLUMN}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault()
        from.current = { x: event.clientX, width }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const start = from.current
        if (start === null) return
        onWidth(start.width + (event.clientX - start.x), false)
      }}
      onPointerUp={(event) => {
        const start = from.current
        from.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
        // REMEMBERED WHEN THE PERSON LETS GO, not sixty times a second on the way there.
        if (start !== null) onWidth(start.width + (event.clientX - start.x), true)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        onWidth(width + (event.key === 'ArrowLeft' ? -A_KEYPRESS_OF_WIDTH : A_KEYPRESS_OF_WIDTH), true)
      }}
    />
  )
}

/** Which column a reader has sorted by, and which way. Null is the order the plan is written in. */
interface Sorted {
  key: string
  /** True when the smallest, earliest or emptiest is at the top. */
  up: boolean
}

export interface PlanTableProps {
  /**
   * WHICH PLAN THESE LINES BELONG TO, from the caller that already knows.
   *
   * IT EXISTS BECAUSE A PLAN WITH NO LINES STILL HAS AN ID. This was read off the lines alone,
   * which answers for every plan somebody has written in and fails on the one screen where it
   * matters most: a plan nobody has typed into has no line to read it from, so the table could not
   * offer to write the first item. That is the emptiest shelf in the product and the one a stranger
   * meets.
   *
   * THE LINES ARE STILL READ, AS A CHECK, so this is not one fact in two places that can drift.
   * `whichPlan` below throws when a line says it belongs to somewhere else, so a caller naming the
   * wrong plan writes nothing — it fails, loudly, in front of the person who pressed.
   *
   * IT IS REQUIRED. It was optional while a test file drew the table without it, and a caller that
   * named no plan got the plan read off the lines and no press to add a first item. Every caller
   * names the plan now: the plan page does, and so does every test. So that second way of learning
   * the plan is gone, and with it the row that could not be pointed at because nothing named its
   * plan (problem rXyS9aQqnMpZ).
   */
  plan: string
  lines: readonly PlanLineWithWork[]
  /**
   * Hand the plan's lines back to whoever holds them for the page, after this table has read the
   * plan again because one of its own presses changed it.
   *
   * WITHOUT IT THE PAGE'S COPY GOES STALE AND THE NEXT KEYSTROKE IN THE WRITING BOX UNDOES WHAT WAS
   * WRITTEN HERE. That was measured, not feared; the account is at the head of this file. So a
   * caller that does not give one gets a table whose words, own-table cells and tick boxes are read
   * only, and the table says where they can be changed instead.
   *
   * The page that owns a plan holds its lines in one place and seeds the writing box from them.
   * Passing that place's setter here is what makes the table and the document two views of one
   * store rather than two stores that have to agree.
   *
   * THE SECOND ARGUMENT IS THE TOKEN THE READ CAME BACK WITH, naming the copy of the plan those
   * lines are. The page's next save carries it as `ifVersion`; without it the page does not know
   * which copy it is writing on top of and has to read the plan again before it can send anything.
   */
  onWrote?: (lines: readonly PlanLineWithWork[], version?: string) => void
  /**
   * True when the writing box holds characters that have not reached the server yet.
   *
   * Editing a cell writes one line and saving the writing box writes the whole document; both at
   * once would be two writers for one document and the later save would silently undo the earlier
   * edit. While this is true the editable cells refuse and say why, rather than writing something
   * that is about to be overwritten.
   */
  behind?: boolean
  /** Which copy of the plan a write from this table is built on. Required: see `versionToWriteOn` in ItemActs. */
  versionToWriteOn: ItemActs['versionToWriteOn']
}

/**
 * WHICH PLAN THIS TABLE IS DRAWING.
 *
 * ONE ANSWER, FROM TWO STATEMENTS OF IT THAT ARE MADE TO AGREE. The caller names the plan and every
 * stored line carries the plan it belongs to, so this throws the moment the two disagree rather
 * than picking one — a cell that wrote into a plan nobody is looking at would leave the words in a
 * document the writer never opens, and nothing would say so.
 *
 * THE CALLER'S ID IS THE ANSWER, because it is the only one that survives a plan with no lines.
 */
function whichPlan(plan: string, entries: readonly PlanLineWithWork[]): string {
  const ids = new Set(entries.map((entry) => entry.line.planId))
  ids.delete(plan)
  if (ids.size > 0) {
    throw new Error(
      t('g8.table.theTableWasToldItWasDrawingThePlan', { value1: plan, value2: listJoined([...ids]) }),
    )
  }
  return plan
}

/**
 * Put a re-read of the plan back everywhere the plan is held: this table's drawing, and the page's
 * own copy.
 *
 * ONE FETCH, TWO HOLDERS, WRITTEN IN THE SAME TURN. It is a function of its own so that "a re-read
 * goes to the page as well" is stated once and can be tested once, rather than being a line inside
 * a handler that nothing in this repository can reach. Dropping the second call is what produced
 * the defect written up at the head of this file.
 */
export function putReadBack(
  toThisTable: (lines: readonly PlanLineWithWork[]) => void,
  toThePage: ((lines: readonly PlanLineWithWork[], version?: string) => void) | undefined,
): (lines: readonly PlanLineWithWork[], version?: string) => void {
  return (lines, version) => {
    toThisTable(lines)
    // THE TOKEN GOES WITH THE LINES. The page holds both or neither: lines from a read it cannot
    // name leave its next save with no precondition to send, and it then spends a whole extra read
    // working out what this one already knew.
    toThePage?.(lines, version)
  }
}

/**
 * How wide this table's own column has to be before every column fits in it, in pixels.
 *
 * ONE PLACE. Nothing in the stylesheet below switches on this number, so the columns the reader gets
 * and the number here cannot come apart. It is not one of the app's page breakpoints and must not be
 * confused with one: those are about the window, and this is about a column inside it.
 */
export const WIDE_ENOUGH_FOR_THE_TABLE = 760

/**
 * TRUE WHILE THE SPACE THIS TABLE HAS IS TOO NARROW FOR EVERY COLUMN. It measures the element,
 * not the window.
 *
 * MEASURED DEFECT, WHICH IS WHY IT IS NOT A MEDIA QUERY. This used to ask `useNarrow`, and
 * `useNarrow` asks the VIEWPORT. In the Writing and table view the table sits in one of two columns:
 * at a 1400px window that column measures 557px and the window said "wide". The question was never
 * how wide the window is. It is how much room this table has, and the only thing that knows that is
 * the table's own box.
 *
 * A CONTAINER QUERY WOULD NOT ANSWER IT EITHER. Which columns are drawn decides what is in the
 * MARKUP — a table cannot lose a cell from every row and keep the row of headings straight by
 * styling alone — and CSS cannot add or remove a cell. And the only container declared in this app
 * is `.px-panel`, which the plan page does not use, so a container query written here would find no
 * container at all and resolve against the viewport, which is the wrong width this note is about.
 *
 * IT ANSWERS "WIDE" UNTIL IT HAS MEASURED, and where there is nothing to measure with. A server
 * render and a runtime with no ResizeObserver both get every column, which is the answer that hides
 * nothing. The reading is taken in a layout effect, before the browser paints, so a narrow column
 * does not show every column for a frame first.
 */
function useNarrowHere(): [React.RefObject<HTMLDivElement | null>, boolean, number] {
  const box = useRef<HTMLDivElement>(null)
  // HOW WIDE THE BOX MEASURED, and 0 until something has measured it. The Task column's own starting
  // width is a share of it on a small screen, so the number is wanted and not only the answer.
  const [room, setRoom] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    // A box of no width has not been laid out yet, or is not on screen. Neither is a narrow column,
    // and reading either as one would stack the table for a moment on a desk.
    const read = () => setRoom(el.clientWidth)
    read()
    const watch = new ResizeObserver(read)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  return [box, room > 0 && room < WIDE_ENOUGH_FOR_THE_TABLE, room]
}

/**
 * HOW WIDE THE PROJECT COLUMN HAS TO BE FOR EVERY PROJECT PICKER IN IT TO SHOW ITS WHOLE CHOICE, in
 * pixels, measured on this page, or null while no picker is drawn.
 *
 * MEASURED HERE, BECAUSE A NUMBER WRITTEN DOWN WAS WRONG ON ANOTHER MACHINE (problem QigTxPnCtF4s).
 * The column's floor is 84, and that included the picker as one machine drew it. On the merge machine
 * the picker was squeezed to 72px and its choice needed 73, so the end of “Default” was cut off.
 * How wide a menu has to be depends on the face the browser finds, the text size and the look: in
 * this sandbox at 660, the mono font needs 83 in the light look and 81 in the dark one, and the large
 * text size needs 74. No number holds for all of those, so the page measures what it drew.
 *
 * HOW. Each picker is copied, in its own font and with no width of its own, the copy's width is read
 * and the copy is taken away again, all in one layout effect, so nothing is painted. The cell's own
 * padding and side borders are added, because the column's width is the cell's. A picker with the
 * same font, look and choices as one already measured is not measured again.
 *
 * IT FOLLOWS THE LOOK, because the t key and the operating system's own switch change it without
 * redrawing this table, and the light look needs 2px more than the dark one. Without this the dark
 * look's width stayed after the switch and the end of the choice was cut off again
 * (tests/g8-plan-words.test.ts). It listens in a layout effect rather than holding the look in state,
 * because this table is also drawn on a server, where there is no look and no effect runs.
 */
function useWhatTheProjectChoiceNeeds(box: React.RefObject<HTMLDivElement | null>): number | null {
  const [needs, setNeeds] = useState<number | null>(null)
  const measured = useRef(new Map<string, number>())
  const [, lookChanged] = useState(0)
  useLayoutEffect(() => whenTheLookMayChange(() => lookChanged((times) => times + 1)), [])
  useLayoutEffect(() => {
    const el = box.current
    if (el === null) return
    let most: number | null = null
    for (const pick of el.querySelectorAll<HTMLSelectElement>('td select.pi-project-pick')) {
      const cell = pick.closest('td')
      if (cell === null) continue
      const drawn = getComputedStyle(pick)
      const around = getComputedStyle(cell)
      const sides = [around.paddingLeft, around.paddingRight, around.borderLeftWidth, around.borderRightWidth]
      const key = [drawn.font, drawn.colorScheme, ...sides, ...Array.from(pick.options, (one) => one.text)].join('\n')
      let need = measured.current.get(key)
      if (need === undefined) {
        const copy = pick.cloneNode(true) as HTMLSelectElement
        copy.setAttribute('aria-hidden', 'true')
        copy.tabIndex = -1
        copy.style.cssText = `position:fixed;left:0;top:0;visibility:hidden;width:max-content;max-width:none;min-width:0;font:${drawn.font}`
        el.append(copy)
        need = Math.ceil(copy.getBoundingClientRect().width + sides.reduce((all, side) => all + parseFloat(side), 0))
        copy.remove()
        measured.current.set(key, need)
      }
      most = Math.max(most ?? 0, need)
    }
    setNeeds(most)
  })
  return needs
}
/* THE MEASUREMENT THAT SAYS WHAT IS OFF THE EDGE LIVES IN components/InReach.tsx.
   It was written here and it was the only one in the product, so twelve other boxes scrolled in
   silence beside it. It moved so that they can all use it; this table still draws the richer
   answer on top of the mark, because it is the one box whose parts have names. */

export function PlanTable({ plan, lines, onWrote, behind = false, versionToWriteOn }: PlanTableProps) {
  const [sorted, setSorted] = useState<Sorted | null>(null)
  const [flat, setFlat] = useState(false)
  const [shut, setShut] = useState<ReadonlySet<string>>(new Set())
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [openWhich, setOpenWhich] = useState<'file' | 'point' | 'time' | null>(null)
  const [openOn, setOpenOn] = useState<string | null>(null)
  // WHICH ROW HAS A BOX FOR A NEW ITEM UNDER IT, by the stored line's id, or AT_THE_END for a plan
  // with no items at all. One at a time, like the three presses above.
  const [addingAfter, setAddingAfter] = useState<string | null>(null)
  const [reloadFailed, setReloadFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  // WHETHER THE READER HAS ASKED FOR THE COLUMNS A NARROW TABLE LEAVES OFF. It is their choice and
  // not a measurement, so it is separate from `narrow`: the cells stay tight either way, and this
  // only decides whether the extra columns are drawn and the box scrolls sideways to hold them.
  const [showEveryColumn, setShowEveryColumn] = useState(false)
  /**
   * HOW WIDE THIS PERSON HAS MADE EACH COLUMN, read before the first paint rather than in an effect.
   *
   * An effect runs after the browser has drawn, so the table would appear at its own widths and jump
   * to the person's a frame later. That is the same reason `mode.ts` reads its setting at import time
   * and `OnePlanPage` reads the layout in a state initialiser, which is the shape copied here.
   */
  const [rememberedWidths] = useState(() => {
    const read = readStored(widthsKey())
    if (!read.ok) {
      return {
        widths: {} as Record<string, number>,
        why: t('g8.table.thisBrowserWillNotLetMoleOfficeRememberYour', { value1: read.reason }),
      }
    }
    const made = widthsFromStored(read.value)
    // THE UNUSABLE VALUE IS TAKEN OUT OF STORAGE, so the complaint is made once rather than on every
    // load for ever. `readChoice` in lib/store.ts does the same for the settings it reads.
    if (made.why !== null) clearStored(widthsKey())
    return made
  })
  const [widths, setWidths] = useState<Record<string, number>>(rememberedWidths.widths)
  const inspect = useInspect()
  const [widthFault, setWidthFault] = useState<string | null>(rememberedWidths.why)
  const [box, narrow, room] = useNarrowHere()
  const projectChoiceNeeds = useWhatTheProjectChoiceNeeds(box)
  const [workList, reloadWork] = useWorkList()
  // THE SERVER'S OWN DAY, READ ONCE FOR THE WHOLE TABLE. Every cell that says what it read out of
  // words like "next week" reads this one answer, so two rows cannot land in two different weeks,
  // and it is the same day `GiveItTime` and the schedule are written with. It is never this
  // browser's clock: see `today` on ItemActs.
  const [todayRead] = useAsync(() => api.today(), [])

  // THE LINES THE PAGE HANDED OVER, AND THE LINES THIS TABLE HAS SINCE READ BACK. A write from a
  // cell changes the plan, so the table asks the server for the plan again rather than patching its
  // own copy — a patched copy would be a second reading of a record that only the server has read.
  // When the page fetches again the new lines win, because that fetch is the newer answer.
  //
  // EVERY RE-READ IS ALSO HANDED TO THE PAGE, through `onWrote`. One fetch, written to the page's
  // copy and to this drawing in the same turn, is what stops the two saying different things — and
  // the page's copy is the one the writing box is seeded from. See the head of this file.
  const [rows, setRows] = useState<readonly PlanLineWithWork[]>(lines)
  const given = useRef(lines)
  if (given.current !== lines) {
    given.current = lines
    setRows(lines)
  }

  const planId = whichPlan(plan, rows)
  const readBack = putReadBack(setRows, onWrote)
  // IT IS AWAITED BY THE BOX THAT ADDS AN ITEM, which is why it hands back a promise. It still never
  // rejects: a read that failed is drawn above the table instead.
  const reload = async (): Promise<void> => {
    setReloadFailed(null)
    // AND THE WORK LIST, because a line just filed as work is a record the hours were read before.
    // Without this the row it made says "this work is not on the list Mole Office read the hours from",
    // which is true of the list in hand and reads as a fault in the thing that was just written.
    reloadWork()
    try {
      const reply = await api.planBlocks(planId)
      readBack(reply.lines, reply.version)
    } catch (err) {
      setReloadFailed({ message: errorMessage(err), fault: faultOf(err) })
    }
  }

  // Whether a rewritten line gets back to the copy of the plan the writing box reads. See the head
  // of this file and `CanRewrite` in planitems.tsx.
  const canRewrite = onWrote !== undefined
  /**
   * Whether a line can be ADDED here, which needs somewhere to put the re-read. The plan to write
   * it to is always named by the caller.
   *
   * A PLAN WITH NO LINES CAN BE GIVEN ITS FIRST ITEM FROM HERE. The id used to be read off the lines
   * alone, and a plan nobody has written in has none, so the one screen where adding the first item
   * is the only thing to do was the one screen that could not offer it.
   */
  const canAdd = canRewrite

  const { items, yourColumns, notItems } = planItemsOf(rows)
  const parents = parentKeysOf(items)
  // WHAT THIS PLAN TAKES, AS ENVELOPES. One reading for the whole table: the footer prints its
  // total and every Estimate cell is handed its own row's line of it, so the number under the table
  // and the red mark on a row cannot come from two different pieces of arithmetic.
  const effort = planEffortOf(items)
  const couldNotCount = whatWasNotRead(effort)
  // WHICH COLUMNS THIS TABLE HAS ROOM FOR, and which it has left off. A narrow table is the same
  // table with fewer columns; it is never a different arrangement. See the head of this file.
  const tight = narrow && !showEveryColumn
  const { drawn: columns, leftOff } = columnsOfTable({ flat, yourColumns, tight })
  // WHICH OF THE DRAWN COLUMNS THE BOX IS NOT SHOWING IN FULL, measured in the browser. Drawing a
  // column is not the same as a person being able to reach it, and this table is regularly wider
  // than the room it has. See the head of this file for what that measured.
  const reach = useReach(`${columns.map((one) => one.key).join('|')}#${items.length}`)
  const { outOfReach, bringHere } = reach
  const pastTheEdge = columns.filter((one) => outOfReach.includes(one.key))
  // THE READER ASKED FOR THE COLUMNS A NARROW TABLE LEAVES OFF AND GOT THEM ALL, so the only thing
  // left to say is how to go back.
  const askedForEveryColumn = showEveryColumn && narrow && leftOff.length === 0
  // NOTHING IS KEPT FROM ANYBODY, so the line above the table says nothing and takes no room. It is
  // still in the page, because it is the place this table announces a column going out of reach and
  // a reader whose screen reader is listening should hear that where it happens.
  const saysNothing = pastTheEdge.length === 0 && leftOff.length === 0 && !askedForEveryColumn

  const acts: ItemActs = {
    planId,
    reload,
    behind,
    workList: workList.status === 'ready' ? workList.value : null,
    today: todayRead.status === 'ready' ? serverDay(todayRead.value.day) : null,
    versionToWriteOn,
  }
  const open: OpenPress = {
    which: openWhich,
    on: openOn,
    show: (which, on) => {
      setOpenWhich(which)
      setOpenOn(on)
    },
  }

  /**
   * How wide every column is drawn, fitted to the room where the room can hold them all.
   *
   * THE PROJECT COLUMN GOES NO NARROWER THAN ITS PICKERS WERE MEASURED TO NEED, where that is more
   * than its floor (`useWhatTheProjectChoiceNeeds`). It never goes wider than its own width for it: a
   * choice wider than that is cut off at that width whether or not the table is squeezed.
   */
  const drawnAt = columnWidths(
    columns.map((col) =>
      col.key === 'project' && col.narrowest !== undefined && projectChoiceNeeds !== null
        ? { key: col.key, narrowest: Math.min(Math.max(col.narrowest, projectChoiceNeeds), widths[col.key] ?? widthByDefault(col.key, room)) }
        : col,
    ),
    room,
    widths,
  )
  const widthOf = (key: string): number => drawnAt[key] ?? widthByDefault(key, room)
  /**
   * HOW WIDE THE WHOLE TABLE IS, WHICH IS ITS COLUMNS ADDED UP.
   *
   * It is stated rather than left to the browser because a table with no width of its own shares
   * whatever it has out over the columns, and a column then measures something other than what the
   * person set. See the stylesheet at the foot of this file.
   */
  const tableWidth = columns.reduce((all, col) => all + widthOf(col.key), WIDTH_OF_THE_PICK_COLUMN)
  /**
   * Set one column's width. IT APPLIES FIRST AND IS REMEMBERED AFTER, which is the order every
   * remembered setting in this app uses: a browser that refuses storage must not also refuse the
   * change, and the refusal is drawn rather than swallowed.
   */
  const setWidth = (key: string, px: number, settled: boolean) => {
    const next = { ...widths, [key]: widthWithin(px) }
    setWidths(next)
    if (!settled) return
    const wrote = writeStored(widthsKey(), JSON.stringify(next))
    setWidthFault(
      wrote.ok
        ? null
        : t('g8.table.thisBrowserWillNotLetMoleOfficeRememberYourAt1500', { value1: wrote.reason }),
    )
  }
  /** Put every column back to its own width, and forget what was remembered. */
  const resetWidths = () => {
    setWidths({})
    clearStored(widthsKey())
    setWidthFault(null)
  }

  // EVERY ROW WITH EVERYTHING WRITTEN UNDER IT, worked out once. Two things read it: how many rows a
  // folded parent is hiding, and which rows one press of the pick control acts on. One walk, so the
  // number on the fold mark and the rows the press takes cannot disagree.
  const subtrees = subtreesOf(items)
  const subtreeOf = (key: string): string[] => subtrees.get(key) ?? [key]
  const under = (key: string): number => subtreeOf(key).length - 1
  const hidden = (item: PlanItem) => !flat && item.above.some((above) => shut.has(above.key))

  const column = sorted === null ? null : (columns.find((one) => one.key === sorted.key) ?? null)
  const visible = items.filter((item) => !hidden(item))
  const shown =
    column === null || column.sortOn === null ? visible : sortItems(visible, column, sorted?.up === true)

  const filed = items.filter((item) => item.entry.work !== null)
  const sized = filed.filter((item) => item.entry.work?.effortHours != null)
  // ROWS WHOSE SIZE IS ONLY WRITTEN IN THE PLAN, counted and named. It is what somebody wrote down
  // and it is not on a record, so it is in no total on this page or anywhere else — and a total
  // that stayed silent about it would read as though those rows had never been sized at all.
  const sizedInThePlan = items.filter((item) => writtenValue(item, 'size').said !== null).length
  const pickedItems = items.filter((item) => picked.has(item.key))

  /**
   * Open a box for a new item under one row.
   *
   * IT ALSO UNFOLDS THAT ROW. Adding under a folded heading would write the line at the top of what
   * is hidden, and the reader would press, type, and see nothing appear.
   */
  const startAdding = (item: PlanItem) => {
    setShut((was) => {
      if (!was.has(item.key)) return was
      const next = new Set(was)
      next.delete(item.key)
      return next
    })
    setAddingAfter(addingAfter === item.key ? null : item.key)
  }
  /** The box moves under the line that was just written, so a list is typed one item after another. */
  const keepAdding = (line: { id: string }) => setAddingAfter(line.id)
  const stopAdding = () => setAddingAfter(null)

  const press = (key: string) => {
    // Sorting flattens, because an indent under a row that is no longer its parent is a lie.
    setFlat(true)
    setSorted((was) => (was === null || was.key !== key ? { key, up: true } : was.up ? { key, up: false } : null))
  }
  // ONE PRESS OF ONE PICK CONTROL, and the rule is `pickedAfter` in planitems.tsx for both the rows
  // and the head of the column. Nothing here decides anything: this hands it the rows the control is
  // about.
  const pick = (keys: readonly string[]) => setPicked((was) => pickedAfter(keys, was))
  // HOW MUCH OF THE WHOLE TABLE IS PICKED, for the control at the head of the pick column. It is
  // every row and not only the rows on screen, because a row folded away is under a row that is on
  // screen, and picking that row picks it.
  const everyKey = items.map((item) => item.key)
  const everyShare = shareOf(everyKey, picked)

  return (
    // `data-room` is the measurement and nothing else reads the number: it is how the cells get
    // tighter in a narrow column while the arrangement stays one arrangement.
    <div className="pt" ref={box} data-room={narrow ? 'narrow' : undefined}>
      <style href="mole-office-plan-items" precedence="default">
        {PLAN_ITEM_CSS}
      </style>
      <style href="mole-office-plan-table" precedence="default">
        {PLAN_TABLE_CSS}
      </style>

      {reloadFailed === null ? null : (
        <ErrorNote message={reloadFailed.message} fault={reloadFailed.fault} label={t('g8.table.moleOfficeCouldNotReadThePlanAgain')} retry={reload} />
      )}

      {items.length === 0 ? null : (
        <div className="pt-bar">
          <button type="button" className="pt-press" aria-pressed={flat} onClick={() => setFlat(!flat)}>
            {flat ? t('g8.table.showTheLevelsAgain') : t('g8.table.showEveryLevelFlat')}
          </button>
          {flat || parents.size === 0 ? null : (
            <button
              type="button"
              className="pt-press"
              onClick={() => setShut(shut.size === 0 ? new Set(parents) : new Set())}
            >
              {shut.size === 0 ? t('g8.table.foldEveryLevel') : t('g8.table.openEveryLevel')}
            </button>
          )}
          {/* ONLY WHERE THERE IS SOMETHING TO PUT BACK. A press that would do nothing is a press a
              reader has to think about on every plan they open. */}
          {Object.keys(widths).length === 0 ? null : (
            <button type="button" className="pt-press" onClick={resetWidths}>{t('g8.table.resetWidths')}</button>
          )}
          {column === null ? null : (
            <span className="pt-sorted">
              {t('g8.table.sortedBy')}{column.heading}
              {sorted?.up === true ? '' : t('g8.table.backwards')}{t('g8.table.everyLevelFlat')}<button type="button" className="pt-press" onClick={() => setSorted(null)}>{t('g8.table.backToMyOrder')}</button>
            </span>
          )}
        </div>
      )}

      {/* A BROWSER THAT WILL NOT REMEMBER THE LAYOUT SAYS SO, rather than forgetting it on every
          load with nothing to explain why. The same rule the mode switch and the sidebar follow. */}
      {widthFault === null ? null : <p className="pt-readonly">{inspect ? widthFault : t('planTable.widthsNotKept')}</p>}

      {pickedItems.length === 0 ? null : (
        <div className="pt-picked">
          <p className="pt-picked-say">{t('g8.table.picked', { n: pickedItems.length })}</p>
          <button
            type="button"
            className="pt-press"
            aria-expanded={openWhich === 'file' && openOn === EVERY_PICKED}
            onClick={() => open.show(openWhich === 'file' && openOn === EVERY_PICKED ? null : 'file', EVERY_PICKED)}
          >{t('g8.table.trackThem')}</button>
          <button
            type="button"
            className="pt-press"
            aria-expanded={openWhich === 'time' && openOn === EVERY_PICKED}
            onClick={() => open.show(openWhich === 'time' && openOn === EVERY_PICKED ? null : 'time', EVERY_PICKED)}
          >{t('g8.table.giveThemTime')}</button>
          <button type="button" className="pt-press" onClick={() => setPicked(new Set())}>{t('g8.table.clear')}</button>
        </div>
      )}

      {openOn === EVERY_PICKED && openWhich === 'file' ? (
        <MakeItWork items={pickedItems} acts={acts} onDone={() => open.show(null, null)} />
      ) : null}
      {openOn === EVERY_PICKED && openWhich === 'time' ? (
        <GiveItTime items={pickedItems} acts={acts} onDone={() => open.show(null, null)} />
      ) : null}

      {/* WHAT THIS TABLE IS NOT SHOWING YOU, IN ONE LINE, ABOVE IT.
          Three things can keep a column from a reader and they are one sentence each here, because
          to the person trying to type in that column they are the same problem: the column is not
          on the screen. It is above the table and not under it — a plan of twenty rows puts the
          foot of the table off the bottom of a phone, and a note about what you cannot see is worth
          nothing under the thing you cannot see it in. */}
      <div className="pt-missing pt-reach" data-nothing={saysNothing ? '1' : undefined} role="status">
        {pastTheEdge.length === 0 ? null : (
          <>
            {t('g8.table.offTheEdgeOfThisTable')}{pastTheEdge.map((col) => (
              <button
                key={col.key}
                type="button"
                className="pt-press"
                aria-label={t('g8.table.bringIntoView', { value1: col.heading })}
                title={t('g8.table.bringIntoView', { value1: col.heading })}
                onClick={() => bringHere(col.key)}
              >
                {col.heading}
              </button>
            ))}
          </>
        )}
        {leftOff.length === 0 ? null : (
          <>
            {t('g8.table.noRoomHereFor')}{joinWords(leftOff.map((one) => one.heading))}{endOfSentence()}
            <button type="button" className="pt-press" onClick={() => setShowEveryColumn(true)}>{t('g8.table.showEveryColumn')}</button>
          </>
        )}
        {!askedForEveryColumn ? null : (
          <>
            {t('g8.table.everyColumnIsDrawn')}<button type="button" className="pt-press" onClick={() => setShowEveryColumn(false)}>{t('g8.table.fitItToThisWidth')}</button>
          </>
        )}
      </div>

      {items.length === 0 ? (
        <div className="pt-first">
          {/* THE DOCUMENT IS STILL THE OTHER WAY IN, and it is said even where the press below is
              offered: writing a bullet in the box puts a row here, which is the whole claim these
              two views make about each other. */}
          <p className="pt-nothing"><Absence /></p>
          {!canAdd ? null : addingAfter === AT_THE_END ? (
            <AddAnItem plan={A_FIRST_ITEM} acts={acts} onDone={stopAdding} onAdded={keepAdding} />
          ) : (
            <button type="button" className="pt-press" onClick={() => setAddingAfter(AT_THE_END)}>{t('g8.table.addTheFirstItem')}</button>
          )}
        </div>
      ) : (
        // THE MARK IS DRAWN BY THE SHARED COMPONENT, on the side the measurement says there is more.
        // The row above the table is what says WHICH columns; the mark says THAT there are some.
        <InReachBox reach={reach} box="pt-wrap" name={t('g8.table.boxName')}>
          <table className="pt-table" style={{ width: `${tableWidth}px` }}>
            {/* EVERY COLUMN IS DRAWN AT AN EXPLICIT WIDTH, and this is the one place that happens.
                A browser laying a table out automatically re-decides every column from its contents
                on every draw, which is the column width changing unexpectedly after somebody
                interacted with a row, as the owner reported. See WIDTH_BY_DEFAULT. */}
            <colgroup>
              <col style={{ width: `${WIDTH_OF_THE_PICK_COLUMN}px` }} />
              {columns.map((col) => (
                <col key={col.key} style={{ width: `${widthOf(col.key)}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {/* THE SAME CONTROL THE ROWS CARRY, so it lines up with them. It used to be a bare
                    tick box with no class at all, which is the alignment fault the owner noticed:
                    the rows drew a 14px control with no margin and this drew the browser's own. */}
                <th scope="col" className="pt-pickcol">
                  <span className="px-sr">{t('g8.table.pickedAt1738')}</span>
                  <Pick
                    share={everyShare}
                    label={
                      everyShare === 'all'
                        ? t('g8.table.stopPickingEveryRowOfThisPlan')
                        : t('g8.table.pickEveryRowOfThisPlanIncludingAnyFolded')
                    }
                    press={() => pick(everyKey)}
                  />
                </th>
                {columns.map((col) => (
                  // `data-col` is what the reach measurement reads. It is the column's own key, so
                  // the heading measured and the name on the press cannot come apart.
                  <th key={col.key} scope="col" data-about={col.about} data-col={col.key}>
                    <span className="pt-head">
                      {col.sortOn === null ? (
                        <span>{col.heading}</span>
                      ) : (
                        <button
                          type="button"
                          className="pt-sort"
                          aria-pressed={sorted?.key === col.key}
                          onClick={() => press(col.key)}
                        >
                          {col.heading}
                          <span aria-hidden="true" className="pt-arrow">
                            {sorted?.key === col.key ? (sorted.up ? '↑' : '↓') : ''}
                          </span>
                        </button>
                      )}
                    </span>
                    <WidthGrip
                      heading={col.heading}
                      width={widthOf(col.key)}
                      onWidth={(px, settled) => setWidth(col.key, px, settled)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <Fragment key={item.key}>
                  <PlanRow
                    item={item}
                    columns={columns}
                    acts={acts}
                    open={open}
                    canRewrite={canRewrite}
                    add={addPressFor(item, canAdd, addingAfter, startAdding)}
                    flat={flat}
                    parent={parents.has(item.key)}
                    shut={shut.has(item.key)}
                    under={under(item.key)}
                    fold={() =>
                      setShut((was) => {
                        const next = new Set(was)
                        if (next.has(item.key)) next.delete(item.key)
                        else next.add(item.key)
                        return next
                      })
                    }
                    share={shareOf(subtreeOf(item.key), picked)}
                    pick={() => pick(subtreeOf(item.key))}
                    envelope={effort.byId.get(item.key)}
                  />
                  {addingAfter !== item.key ? null : (
                    <tr className="pt-newrow">
                      <td className="pt-pickcol" />
                      <td colSpan={columns.length}>
                        <div className="pt-newwrap">
                          {/* THE BOX SITS AT THE DEPTH THE ITEM WILL HAVE, drawn with the same
                              indent step as the rows, so where it lands is visible before it is
                              written. Flat, every row is at the left edge and so is this. */}
                          <span
                            className="pt-indent"
                            style={{ width: `${(flat ? 0 : newItemAfter(item).depth) * 14}px` }}
                            aria-hidden="true"
                          />
                          <AddAnItem
                            plan={newItemAfter(item)}
                            acts={acts}
                            onDone={stopAdding}
                            onAdded={keepAdding}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </InReachBox>
      )}

      {/* THE TOTAL IS AN ENVELOPE, NOT A SUM, AND IT SAYS WHAT IT COULD NOT COUNT.
          See `planEffortOf` above for the arithmetic and for the 44h-against-12h defect it fixes. */}
      <p className="pt-totals">{t('g8.table.notSizedAsWorkNotTrackedAsWork', { value1: planTotalSaid(effort, sizedInThePlan), value2: effort.ownHoursAdded === null || effort.ownHoursAdded === effort.total
          ? ''
          : ` · ${t('schedule.rowsAddUp', { rows: effort.ownHoursAdded })}`, value3: effort.atLeastTotal === null || effort.total === null || effort.atLeastTotal <= effort.total
          ? ''
          : t('planTable.partsOver', { atLeast: atLeastSaid(effort.atLeastTotal) }), value4: effort.withoutOwn, value5: items.length - filed.length, value6: sizedInThePlan === 0 ? '' : t('planTable.sizedInPlanOnly', { n: sizedInThePlan }), value7: notItems.blank === 0 ? '' : t('g8.table.blankNotShown', { value1: notItems.blank, value2: notItems.blank === 1 ? t('g8.table.lineIs') : t('g8.table.linesAre') }), value8: notItems.prose === 0
          ? ''
          : t('planTable.proseLines', { n: notItems.prose, lines: notItems.prose === 1 ? t('g8.onePlan.line') : t('g8.onePlan.lines') }), value9: notItems.unreadable === 0
          ? ''
          : t('planTable.unreadLines', { n: notItems.unreadable, lines: notItems.unreadable === 1 ? t('g8.onePlan.line') : t('g8.onePlan.lines') }), value10: couldNotCount === null ? '' : ` · ${couldNotCount}` })}</p>

      <ItemsOriginNote />
    </div>
  )
}

/** A list of names as a person would say it: "a, b and c". */
function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? ''
  return t('g8.table.and', { value1: listJoined(words.slice(0, -1)), value2: words[words.length - 1] ?? '' })
}

/** The key the bulk presses open their form under. Not a line id, so it can never be one. */
const EVERY_PICKED = 'the rows you picked'

/** The key the box for the first item of an empty plan opens under. Not a line id, for that reason. */
const AT_THE_END = 'the end of the plan'

/**
 * THE CONTROL THAT PICKS ROWS FOR THE PRESSES THAT ACT ON SEVERAL AT ONCE, AND IT IS NOT A TICK BOX.
 *
 * ---------------------------------------------------------------------------------------
 * PICKING A ROW AND TICKING IT OFF WERE THE SAME PICTURE, AND THEY DO DIFFERENT THINGS
 * ---------------------------------------------------------------------------------------
 *
 * Both were a plain tick box with the same size, the same accent and the same shape, a few pixels
 * apart on the same row: one chose the row for a bulk press, the other wrote a tick into the
 * document. The owner reported them as confusing and was right — nothing on the screen told them
 * apart. Ticking keeps the box, because a tick is a tick. Picking is round, so the two cannot be
 * mistaken for each other at a glance, and the word on it says "pick" where the other says "tick".
 *
 * ---------------------------------------------------------------------------------------
 * IT DRAWS THREE STATES, BECAUSE PICKING A PIECE OF WORK PICKS THE WHOLE OF IT
 * ---------------------------------------------------------------------------------------
 *
 * Picking a parent picks everything written under it and letting it go lets them all go, which is
 * the point: acting on a large piece of work should not mean pressing every part of
 * it. So a row whose subtree is partly picked is neither picked nor unpicked, and the third drawing
 * — a bar across the middle — is that answer. Pressing it picks the rest.
 */
export function Pick({ share, label, press }: { share: PickedShare; label: string; press: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      className="pt-pick"
      aria-checked={share === 'some' ? 'mixed' : share === 'all'}
      aria-label={label}
      title={label}
      onClick={press}
    >
      <span className="pt-pick-mark" aria-hidden="true" />
    </button>
  )
}

/** What the control on one row says it will do, in words, for the pointer and the screen reader. */
export function pickLabel(item: PlanItem, share: PickedShare, under: number): string {
  const words = wordsOf(item)
  const what = under === 0 ? `"${words}"` : t('g8.table.andTheWrittenUnderIt', { value1: words, value2: under })
  return share === 'all' ? t('g8.table.stopPicking', { value1: what }) : t('g8.table.pick', { value1: what })
}

/** Whichever of the three presses is open on this row, drawn under it. */
function OpenForm({ item, acts, open }: { item: PlanItem; acts: ItemActs; open: OpenPress }) {
  if (open.on !== item.key) return null
  if (open.which === 'file' || open.which === 'point') {
    return <FileOrPoint item={item} acts={acts} onDone={() => open.show(null, null)} />
  }
  if (open.which === 'time') return <GiveItTime items={[item]} acts={acts} onDone={() => open.show(null, null)} />
  return null
}

/**
 * WHERE THE CHARACTERS THIS CELL DRAWS SIT IN THE LINE, said only by the cells that draw characters.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FIXES, MEASURED IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * This table drew no run of stored text anywhere, so a right-click on any cell recorded *no place
 * finer than the thing was recorded* and Mole Office framed the whole row. Measured at 1440 on 21 August
 * 2026, on both of this page's routes: no element in any row carried the offset attribute. A press
 * on the cell holding `Priya` was answered exactly as a press on the row around it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY ONLY A COLUMN OF THE WRITER'S OWN TABLE SAYS IT
 * ---------------------------------------------------------------------------------------
 *
 * A column of the writer's own pipe table draws the characters the line holds and nothing else, so it can
 * say where they start. Every other column draws a FACT ABOUT the line — how big it is, where it
 * stands, what it is tracked as, how deep it sits — and those characters are in no stored string at
 * all. A cell claiming an offset for them would put a comment's quote at a position the line never
 * held, and Mole Office would later report untouched words as changed. So those cells go on saying the
 * one true thing, which is that nothing finer than the row was recorded.
 *
 * THE OFFSET IS CHECKED AGAINST THE LINE, in `whereACellSits`, and a line that does not agree gets
 * no offset. That is the one reading of where a cell sits: the same function the writing path uses
 * to decide which characters a cell replaces.
 *
 * A CELL HOLDING A FORMULA SAYS IT ON EACH RUN OF WORDS INSIDE IT, and not on the cell, because a
 * drawn formula is not its characters. `ItemCell` places those runs through the same function.
 */
function whereItsCharactersAre(col: Column, item: PlanItem): Record<string, string> {
  if (col.about !== 'yours') return {}
  const cell = item.cells.find((one) => one.heading === col.heading)
  if (cell === undefined || holdsMaths(cell.value)) return {}
  const at = whereACellSits(item.entry.line.text, cell)
  return at === null ? {} : textAttributes('text', at)
}

/**
 * WHICH FACT THIS CELL DRAWS, said on the cell, where the column draws one.
 *
 * A right-click inside the cell then reaches the fact before it reaches the row, because the
 * pointer walks up to the nearest element that says what it is. Its name on the composer's chip is
 * the column's heading and the line's words, so the person sees which fact of which line they chose.
 * A box a person types in inside the cell still gives the browser's own menu, as everywhere else.
 */
function factAttributes(col: Column, item: PlanItem, planId: string): Record<string, string> {
  if (col.fact === undefined) return {}
  return {
    ...targetAttributes({ kind: 'planLineFact', planId, lineId: item.entry.line.id, fact: col.fact }),
    ...nameAttributes(t('planTable.factOfLine', { fact: col.heading, line: wordsOf(item) })),
  }
}

/** One row of the wide table, and the form it opens under itself. */
function PlanRow({
  item,
  columns,
  acts,
  open,
  canRewrite,
  add,
  flat,
  parent,
  shut,
  under,
  fold,
  share,
  pick,
  envelope,
}: {
  item: PlanItem
  columns: readonly Column[]
  acts: ItemActs
  open: OpenPress
  /** Whether this table may change the characters of a line. See the head of this file. */
  canRewrite: boolean
  /** The plus that opens a box for a new item under or after this one. */
  add?: AddPress | undefined
  flat: boolean
  parent: boolean
  shut: boolean
  /** How many rows are written under this one. */
  under: number
  fold: () => void
  /** How much of this row and everything under it is picked. */
  share: PickedShare
  /** One press of this row's pick control. The rule is `pickedAfter` in planitems.tsx. */
  pick: () => void
  /** This row's own line of the plan's effort reading. See `planEffortOf`. */
  envelope: EffortReading | undefined
}) {
  const unfiled = item.entry.work === null
  const rest = columns.slice(1)
  const isOpen = open.on === item.key && open.which !== null
  // THIS ROW IS THE LINE, so the row is what talking to an agent is about. Every row can be
  // pointed at, because the caller always names the plan.

  return (
    <>
      <tr
        data-filed={unfiled ? undefined : '1'}
        data-kind={item.kind}
        {...targetAttributes({ kind: 'planLine', planId: acts.planId, lineId: item.entry.line.id })}
        /* WHAT THIS ROW IS CALLED: the line's own words, and not the row as it is drawn. The
           composer's chip used to read the words back with everything around them — measured at
           1440 on 18 August 2026 as "level 2 round1 todo Open the record for round1 task", which is
           the indent said in words, the line, its state and two presses.

           `wordsOf` AND NOT THE STORED LINE. It is the one reader of the planning groups a line may
           end in, and it is the same function the box on this row draws from, so the chip says
           exactly what the person can see. Writing the stored line here would also put a heading's
           marker into the markup, which tests/plan-table.test.ts reads the whole document for. */
        {...nameAttributes(wordsOf(item))}
      >
        <td className="pt-pickcol">
          <Pick share={share} label={pickLabel(item, share, under)} press={pick} />
        </td>
        <td>
          <WhatItIs
            item={item}
            acts={acts}
            canRewrite={canRewrite}
            add={add}
            open={open}
          >
            {/* The depth is drawn as an indent. It is also said in words for a reader who cannot
                see the indent, because an indent alone is a fact stated by position only. */}
            <span
              className="pt-indent"
              style={{ width: `${(flat ? 0 : item.depth) * 14}px` }}
              aria-hidden="true"
            />
            <span className="px-sr">{item.depth === 0 ? t('g8.table.topLevel') : t('g8.table.level', { value1: item.depth + 1 })}</span>
            {parent && !flat ? (
              <button
                type="button"
                className="pt-fold"
                aria-expanded={!shut}
                aria-label={shut ? t('g8.table.openTheUnder', { value1: under, value2: item.text }) : t('g8.table.foldTheUnder', { value1: under, value2: item.text })}
                onClick={fold}
              >
                {shut ? '▸' : '▾'}
                {/* HOW MANY ARE HIDDEN, ON THE PRESS THAT HIDES THEM. It was a phrase under the row
                    — "5 folded under this" — on every folded parent, which is the repeated text the
                    owner asked to be rid of and made a folded row taller than an open one. The
                    number is beside the mark that put them away, and the press's own label reads
                    the same count out in a sentence. */}
                {shut ? <span className="pt-fold-count" aria-hidden="true">{under}</span> : null}
              </button>
            ) : (
              <span className="pt-fold pt-fold-none" aria-hidden="true" />
            )}
          </WhatItIs>
        </td>
        {/* EVERY CELL IS DRAWN ON EVERY ROW NOW. Cells used to be MERGED on an untracked row,
            because one column — Where it stands — could only be read off a record. That column is
            gone: its state is a mark beside the task and its kind is the Type column, which is
            editable before there is a record. So there is nothing left that an untracked row cannot
            answer, and a row of the table is the same shape whether it is tracked or not. */}
        {rest.map((col) => (
          // AND A CELL DRAWING CHARACTERS OF THE LINE SAYS WHERE THEY SIT. See
          // `whereItsCharactersAre` above for which cells those are and why the rest say nothing.
          <td key={col.key} {...whereItsCharactersAre(col, item)} {...factAttributes(col, item, acts.planId)}>
            {col.cell(item, acts, open, canRewrite, envelope)}
          </td>
        ))}
      </tr>
      {isOpen ? (
        <tr className="pt-openrow">
          <td colSpan={columns.length + 1}>
            <OpenForm item={item} acts={acts} open={open} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

/**
 * The rows in one column's order.
 *
 * A row with nothing in that column sorts to the bottom whichever way the column points. "Nobody
 * wrote this" is not a small number and not an early letter, and putting it first would make an
 * unsized row look like the smallest job on the list.
 */
function sortItems(items: readonly PlanItem[], column: Column, up: boolean): PlanItem[] {
  const read = column.sortOn
  if (read === null) return [...items]
  return [...items].sort((a, b) => {
    const left = read(a)
    const right = read(b)
    if (left === null && right === null) return 0
    if (left === null) return 1
    if (right === null) return -1
    if (typeof left === 'number' && typeof right === 'number') return up ? left - right : right - left
    const l = String(left)
    const r = String(right)
    return up ? l.localeCompare(r) : r.localeCompare(l)
  })
}

const PLAN_TABLE_CSS = `
.pt { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }

.pt-bar, .pt-picked {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px var(--pad);
  min-width: 0;
}
.pt-picked {
  padding: 4px var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
}
.pt-picked-say { margin: 0; font-size: var(--fs-2); font-weight: 600; color: var(--text); }
.pt-sorted {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-size: var(--fs-1);
  color: var(--text-2);
}

/* One press, drawn as a word rather than as a heavy button, because a dense grid holds many of
   them and a grid of buttons reads as a control panel rather than as a plan. */
.pt-press {
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  padding: 1px var(--pad);
  cursor: pointer;
  white-space: nowrap;
}
.pt-press:hover { border-color: var(--accent); }
.pt-press[aria-pressed='true'], .pt-press[aria-expanded='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}

/* The table scrolls inside this box. The page never scrolls sideways.

   THE POSITION IS WHAT MAKES THE SECOND SENTENCE TRUE, AND IT IS MEASURED. Every row of this table
   carries a screen-reader span saying its level out loud, and that span is positioned absolutely.
   Without a positioned ancestor its containing block is the page, so it is NOT
   clipped by this box: at a 1400px window with every column drawn, those spans sat at x=1542 and the
   WHOLE PAGE scrolled 142px sideways, which this product does nowhere. The table itself was clipped
   correctly the whole time, so nothing looked wrong — only the scrollbar at the bottom of the
   window. */
.pt-wrap { position: relative; overflow-x: auto; max-width: 100%; }
/* THE SCROLLBAR IS ASKED FOR AND IS NOT WHAT THIS RELIES ON. Measured in Chromium on this machine
   with these two lines in place: the gutter is still 0px, because the platform draws a bar that is
   not there until a pointer moves. So it is asked for, for the platforms that do keep one, and
   everything below is what actually tells a person the table goes on. */
.pt-wrap { scrollbar-width: thin; scrollbar-color: var(--border-strong) var(--panel-2); }

/* THE EDGE THE TABLE CARRIES ON PAST IS MARKED BY components/InReach.tsx, which this table's own
   fade became. That fade was 20px of gradient into the page colour and no rule, so against a page
   of the same colour there was nothing to see: the owner read the result as a clip at 1440, with
   the Schedule column ending mid-word and no edge. The shared mark adds the 2px rule. It says THAT
   there is more; the row above the table is what says WHICH columns. */

/* THE COLUMNS ARE FIXED AND THE PERSON OWNS THEM.

   A table laid out automatically re-decides every column from its contents on every draw, which is
   the column width changing unexpectedly after somebody interacted with a row, as the owner
   reported: typing a long note really did move the edges of a table somebody had just arranged. Fixed layout reads the
   widths off the colgroup the component writes and nothing else, so only a drag moves one.

   THE WIDTH IS SET IN PIXELS BY THE COMPONENT, and it is the columns added up. Two other answers
   were measured and both let the contents back in: 100 per cent makes a browser share the extra
   space out over the columns, and max-content asks the browser what the contents want and then
   shares the difference out the same way — at 390 that made a 148-pixel column 184 and a
   108-pixel one 115. A number is the only answer that cannot drift.

   THE BORDERS ARE SEPARATE, WITH NO SPACING BETWEEN THEM. That draws identically to a collapsed
   table here, because every rule is one cell's own border-bottom, and it is what lets the first two
   columns hold still while the rest scrolls: a collapsed table drops the borders of a sticky cell. */
.pt-table {
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--text);
}
/* DENSITY IS THE POINT: a row that is 74px tall shows nine rows on a laptop. The padding here is
   two pixels and every cell is set on one line height, so a row is about 24px and forty of them
   fit on a laptop screen. */
.pt-table th, .pt-table td {
  border-bottom: var(--border-w) solid var(--border);
  padding: 2px 6px;
  text-align: left;
  vertical-align: top;
}
.pt-table td { overflow: hidden; }
.pt-table th {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-2);
  white-space: nowrap;
  border-bottom: var(--border-w) solid var(--border-strong);
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 1;
}
.pt-table th[data-about='yours'] { font-style: italic; }
/* The heading and its help mark on one line, with room at the right for the edge you drag. */
.pt-head { display: inline-flex; align-items: baseline; gap: 4px; min-width: 0; }

/* THE PICK CONTROL AND THE TASK HOLD STILL WHILE THE REST OF THE TABLE SCROLLS.

   MEASURED DEFECT, ROUND SIX. At phone width, pressing the name of a column above the table to
   bring it into view scrolled the words off the left-hand edge — so a reader arrived at the column
   they wanted looking at rows they could no longer identify. The owner's rule is that the Task
   column must always be reachable, and holding it still is the only arrangement where that is true
   at every scroll position rather than at most of them.

   THE BACKGROUND IS NOT DECORATION. A sticky cell with no background of its own has the rest of the
   table scroll visibly underneath it. */
.pt-pickcol { position: sticky; left: 0; z-index: 2; background: var(--bg); }
/* THE OFFSET IS THE PICK COLUMN'S OWN WIDTH, READ FROM THE ONE PLACE IT IS DECLARED. It used to be
   written here as 28px as well as in the component, which is this repository's recurring defect:
   the same fact worked out twice, free to disagree with nothing failing. */
.pt-table th:nth-child(2), .pt-table td:nth-child(2) {
  position: sticky;
  left: ${WIDTH_OF_THE_PICK_COLUMN}px;
  z-index: 2;
  background: var(--bg);
}
.pt-table thead th:nth-child(1), .pt-table thead th:nth-child(2) { z-index: 3; }
/* The two rows that draw on the panel's own ground keep it in the columns that hold still too. */
.pt-newrow td:nth-child(2), .pt-openrow td:nth-child(2), .pt-newrow .pt-pickcol { background: var(--panel-2); }
/* A heading may take two lines where a word will not fit. A row may not: the rows are the density. */
.pt[data-room='narrow'] .pt-table th { white-space: normal; }

/* THE EDGE BETWEEN TWO COLUMNS, WHICH IS WHAT YOU DRAG. It is wider than it looks — a two-pixel
   target is a target nobody hits — and it shows itself under the pointer and when it has focus.

   IT SITS WHOLLY INSIDE ITS OWN HEADING AND NOT ACROSS THE JOIN. Measured in Chromium: hanging it
   three pixels over the edge put it under the NEXT heading, which is a later sibling at the same
   stacking level, so every press on it landed on the column to the right and nothing moved. The last
   column was the only one that could be dragged. */
.pt-grip {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 7px;
  cursor: col-resize;
  touch-action: none;
  z-index: 4;
}
.pt-grip::after {
  content: '';
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: 1px;
  background: none;
}
.pt-grip:hover::after, .pt-grip:focus-visible::after { background: var(--accent); }
/* NOTHING HERE SETS position to relative, and that is deliberate. Every heading is already sticky,
   and sticky is a positioned value, so the grip inside one is placed against that heading. Setting
   relative would take the stickiness away and the row of headings would scroll off the top of a
   long plan. */

/* PICKING A ROW IS NOT TICKING IT OFF, SO IT IS NOT DRAWN AS A TICK BOX. Round, not square: empty
   when nothing under this row is picked, filled when all of it is, and barred across the middle
   when some of it is. The tick box beside an item's words keeps the square and the tick.
   The same control heads the column, so the two line up. */
.pt-pick {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  margin: 1px 0 0;
  padding: 0;
  width: 14px;
  height: 14px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: 50%;
  background: var(--panel);
  cursor: pointer;
}
.pt-pick:hover { border-color: var(--accent); }
.pt-pick[aria-checked='true'] { background: var(--accent); border-color: var(--accent); }
/* Some of what is under this row is picked and some is not. A bar, which is neither empty nor full
   and reads as neither. */
.pt-pick-mark { display: block; width: 8px; height: 2px; border-radius: 1px; background: none; }
.pt-pick[aria-checked='mixed'] .pt-pick-mark { background: var(--text); }
.pt-sort {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  padding: 0;
  cursor: pointer;
}
.pt-sort:hover { text-decoration: underline; }
.pt-arrow { color: var(--accent); }

/* A row nobody has filed as work: dashed on its left edge, and it says which it is in words too. */
.pt-table tr:not([data-filed]) td:nth-child(2) { border-left: var(--rail) dashed var(--border-strong); }
.pt-table tr[data-filed='1'] td:nth-child(2) { border-left: var(--rail) solid var(--border); }
.pt-openrow td { background: var(--panel-2); }

.pt-what { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
/* THE CELL WRAPS RATHER THAN LOSING WHAT IS IN IT. Every column is a fixed width now, so anything
   that does not fit is CLIPPED — and measured beside the writing box, the state mark and the Track
   press were cut in half on every row. What is in this cell drops to a second line instead, which
   makes the row taller and keeps all of it. The words keep a floor so they are not squeezed to one
   character while a press sits beside them. */
.pt-what-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; }
.pt-what-line .pi-words-box { flex: 1 1 7rem; min-width: 7rem; }
.pt-indent { flex: none; display: inline-block; }
.pt-fold {
  flex: none;
  min-width: 1rem;
  border: 0;
  background: none;
  color: var(--text-2);
  font: inherit;
  font-size: var(--fs-1);
  line-height: 1;
  padding: 0;
  cursor: pointer;
}
.pt-fold { display: inline-flex; align-items: center; gap: 2px; }
.pt-fold-none { cursor: default; }
/* How many are hidden, on the press that hid them. Tabular so a column of them lines up. */
.pt-fold-count { font-size: var(--fs-1); color: var(--text-3); font-variant-numeric: tabular-nums; }

/* The plus that opens a box for a new item. Quiet, because a dense table holds one per row and a
   grid of buttons reads as a control panel; it darkens under the pointer and when it is open. */
.pt-add {
  flex: none;
  width: 1.1rem;
  border: 0;
  background: none;
  color: var(--text-3);
  font: inherit;
  font-size: var(--fs-2);
  line-height: 1;
  padding: 0;
  cursor: pointer;
}
.pt-add:hover, .pt-add:focus-visible { color: var(--accent); }
.pt-add[aria-expanded='true'] { color: var(--accent); font-weight: 700; }

/* The row a new item is typed into: the panel's own quiet ground, so it reads as somewhere to type
   rather than as one more row of the plan. */
.pt-newrow td { background: var(--panel-2); }
/* THE BOX AND ITS TWO PRESSES STAY IN THE FIRST PART OF THE TABLE, and that is not tidiness. Beside
   the writing box the table is wider than its pane and scrolls sideways inside it; a row that
   stretched the whole width put Add and Cancel off the right-hand edge, so the reader saw a box to
   type in and neither press. Measured at 1440 with both views on screen. */
.pt-newwrap { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: 28rem; }
.pt-newwrap .pi-new { flex: 1 1 auto; min-width: 0; }
.pt-first { display: flex; flex-wrap: wrap; align-items: center; gap: 6px var(--pad); min-width: 0; }

/* THE RECORD'S OWN EXPLANATION, UNDER ITS LINE. It is a way to the record as well as its words, so
   it is a link; the level says which rung of the ladder the words are, so a reader can tell a
   conclusion from a title. It is not the note column: the writer's note lives in the line. */
.pt-explanation { font-size: var(--fs-1); color: var(--text-2); text-decoration: none; overflow-wrap: anywhere; }
.pt-explanation:hover { text-decoration: underline; }
.pt-explanation-level { font-variant: small-caps; letter-spacing: 0.02em; }
.pt-explanation-text { margin-left: 4px; }
/* OVER ITS BUDGET, SAID IN WORDS AND NOT AS A COLOUR ONLY. It marks the line above it and changes
   nothing about it. */
.pt-over { font-size: var(--fs-1); color: var(--text-2); font-style: italic; }
/* A LINE WHOSE RECORD HAS BEEN DELETED. It is quiet, and it is NOT drawn the way an ordinary
   absence is: a dash beside it would say "nobody filed this line", which is a different answer and
   the one the fifth invariant refuses to guess at. Two words and the whole sentence on the mark. */
.pt-gone { font-size: var(--fs-1); color: var(--text-2); font-style: italic; white-space: nowrap; }
/* THE PATH WRAPS INSIDE ITS CELL. Flattening exists so a person can see every level at once while
   scheduling, and the column's width does not grow for a long line. A line longer than the column
   used to be cut at the cell's edge; it now breaks at spaces onto further rows, a word longer than
   the column breaks anywhere (the next rule), and the row grows to hold its tallest cell. The
   column's width, its place and every other column are unchanged. */
.pt-table .pt-path { color: var(--text-2); font-size: var(--fs-1); white-space: normal; }
.pt-path { color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }

/* THE MARK AND THE PRESS STAY ON ONE LINE, and that is what keeps an unfiled row one line tall.
   They used to wrap, and beside the writing box on a plan with ordinary sentences in it the press
   dropped under the mark on every unfiled row: measured at a 1400px window, 27px rows became 49px
   and one fewer item was on the screen. The cell asks the table for the width it needs, and the
   table gives what is left to the words. */
.pt-unfiled { display: inline-flex; flex-wrap: nowrap; align-items: center; gap: 4px; min-width: 0; }
.pt-time { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; }

.pt-ways { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pt-way-pick { display: flex; flex-wrap: wrap; gap: 4px; }

.pt-totals, .pt-missing, .pt-nothing, .pt-readonly {
  margin: 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  max-width: var(--measure-in-box);
}
.pt-totals { color: var(--text); }
/* The short line and the presses beside it sit on one baseline. */
.pt-missing { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
/* NOTHING IS BEING KEPT FROM ANYBODY, so this says nothing and takes no room — not even the gap
   between it and the table. The element stays in the page: it is where this table announces a
   column going out of reach, and a live announcement has to be somewhere before it happens. */
.pt-missing[data-nothing] { display: none; }
/* The names of the columns that are off the edge run on past the width of the line if there are
   several, so this one is allowed the whole width rather than a reading measure. */
.pt-reach { max-width: none; }
`
