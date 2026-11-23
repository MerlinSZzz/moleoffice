// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING AND WRITING PLANS: THE DOCUMENTS A PERSON WRITES BEFORE ANYTHING HAS AN HOUR ON IT.
 *
 * ---------------------------------------------------------------------------------------
 * PLANNING IS WRITING. SCHEDULING IS GIVING HOURS. THIS FILE IS THE FIRST ONE
 * ---------------------------------------------------------------------------------------
 *
 * A plan holds prose, headings, bullets, tick boxes and tables. Nothing in it is project truth,
 * nothing in it is parsed for meaning, and nothing in it becomes a record because Mole Office read it.
 * Writing a plan creates no record, no link and no change row.
 *
 * A line crosses out of the plan and into the project only when a person presses one of three
 * things, and all three are in this file:
 *
 *   - `fileLineAsWork` creates the record and binds the line to it IN ONE TRANSACTION, so a line
 *     that is half filed cannot exist.
 *   - `bindLineToWork` points a line at a record that already exists. It creates nothing.
 *   - `giveLineTime` writes one ordinary allocation, through the same `createAllocation` every
 *     other surface uses, and stamps it with the line it came from.
 *
 * Nothing crosses on its own. No plan is committed as a whole.
 *
 * ---------------------------------------------------------------------------------------
 * FILING A LINE KEEPS THE PLACE THE PLAN ALREADY GAVE IT
 * ---------------------------------------------------------------------------------------
 *
 * A person writes their breakdown as Markdown headings and nested bullets, and
 * `src/shared/planoutline.ts` reads that back as a tree. So when a line is filed as work and the
 * item it is written under is ALREADY filed as work, `fileLineAsWork` writes one `part_of` link
 * from the new record to that one, in the same transaction as the record itself.
 *
 * WHEN THE ITEM ABOVE IS NOT FILED, NO LINK IS WRITTEN AND NO PARENT IS INVENTED. It does not walk
 * further up looking for a filed ancestor, because "part of the heading two levels above" is not
 * what the document says. The reply names the item above and says whether a link was written and,
 * when it was not, why — a caller cannot see a link it did not ask for.
 *
 * ---------------------------------------------------------------------------------------
 * FILING A LINE DOES NOT COPY THE TITLE
 * ---------------------------------------------------------------------------------------
 *
 * At the moment of filing, the line's words seed the new record's title — the words, without the
 * bullet, the hashes, the number or the tick box, which are how the line is drawn rather than
 * something anybody wrote about the work. That is the last moment the two have anything to do with
 * each other. After it they are two separate facts — "what I wrote
 * about this" and "what this record is called" — and NOTHING in this file derives one from the
 * other, repairs one from the other, or warns that they differ. `linesWithWork` returns both, so
 * the page can draw the disagreement. Disagreement is drawn, never repaired.
 *
 * ---------------------------------------------------------------------------------------
 * THE BOUNDARY, WHICH IS THE SAME ONE THE REST OF THE PLANNING LAYER KEEPS
 * ---------------------------------------------------------------------------------------
 *
 * A plan spans projects, so these routes take no project and these tables have no `workspace_id`. A
 * plan line naming a record is not a way to READ that project: the only record read here is by
 * primary key, through `resolveAllocated` in lib/planning.ts, which is the one reader that rule is
 * written on. There is no query in this file that ranges over a workspace.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PERSON WRITES ABOUT A LINE IS IN THE LINE, UNTIL FILING MOVES IT
 * ---------------------------------------------------------------------------------------
 *
 * How big something is, how much time it gets, which project it is in and what to remember about it
 * are all written in the line's own words, as a trailing run of `{key: value}` groups.
 * `src/shared/planline.ts` is the one reader and writer of that syntax and nothing here spells it
 * out a second time.
 *
 * NONE OF IT IS A FACT ABOUT THE PROJECT AND NONE OF IT ENTERS ARITHMETIC. `{time: 15h this week}`
 * on a line nobody has filed adds nothing to that week, uses no capacity and counts as no work
 * planned. It is a thing somebody wrote down.
 *
 * `fileLineAsWork` is what moves each value to the place Mole Office keeps that kind of fact — the size
 * to the record's estimate, the project to the project the record is filed in, the time to an
 * allocation — and a value that moved is TAKEN OFF THE LINE, because the same fact in two places is
 * the defect this repository keeps finding. Every value is reported either way: what moved and
 * where it went, or what stayed and why.
 *
 * AND THE REPLY SAYS IT IN ONE SENTENCE AS WELL, in `whatLeftTheLine`. Filing takes out of the
 * writing exactly the values Mole Office could read and leaves the ones it could not, and a person
 * watching some of their words vanish and others stay has no way to see that rule from a list of
 * entries. The sentence names each value that left and where it is now.
 *
 * THE NOTE NEVER MOVES. It has no canonical home and needs none, so it stays in the words — which
 * is what makes it survive an edit. It used to live in `plan_lines.remark`, where saving an edited
 * document destroyed it silently: `writeBody` matches stored rows by their exact text and
 * re-inserted the changed ones with no remark at all. Problem `6DIqEdKWuMgN`.
 *
 * ---------------------------------------------------------------------------------------
 * AND EVERY READ SAYS WHAT THE VALUES BECAME, SO NOTHING IS REACHABLE FROM ONE VIEW ONLY
 * ---------------------------------------------------------------------------------------
 *
 * A value that moved is gone from the writing, so the writing on its own no longer shows it. That is
 * correct storage and a bad screen. Storing a fact only once must never make that fact
 * disappear from one of the two views of a plan.
 *
 * So `linesWithWork` carries `derived` on every line: the size, the hours and the project read back
 * out of the record the line names, plus any words kept as an intent, each naming where it was read
 * from. THE INVARIANT IT SERVES: for every line, the planning values a reader can reach are exactly
 * what is in its text plus what is derived from its record. Nothing is reachable from the table
 * alone. It is worked out on every read and NEVER written back into `plan_lines.text` — see
 * `DerivedPlanningValue` for why putting it back in the words would be the second store returning.
 *
 * ---------------------------------------------------------------------------------------
 * EDITING THE WORDS OF A FILED LINE KEEPS ITS WORK, SINCE 17 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * Until that day, saving a document with one word changed on a filed line took the work off it. The
 * loss was reported in full and there was a way back, and it was still wrong: a filed or bound line
 * must not lose access to its canonical work merely because its visible words changed, since editing
 * prose is normal planning (design/ROUND-SEVEN-OWNER-MESSAGE.md section 5). So the row now survives
 * the edit, and the binding survives with it.
 *
 * WHAT MAKES THAT SAFE IS SHAPE, NOT SIMILARITY. `writeBody` below states the whole construction:
 * the exact-characters match runs first, and only then, where the alignment shows exactly one line
 * removed and exactly one added between the same two unchanged lines, the stored row is carried onto
 * the new line. Nothing compares two lines. Where more than one line changed in the same place
 * Mole Office cannot say which is which, so the binding is dropped and reported exactly as before.
 *
 * SO A BINDING IS STILL LOST SOMETIMES, AND THE REPLY STILL SAYS WHAT THAT COST. `removedBindings`
 * names the estimate, the hours and the project the plan could reach through that binding, and says
 * how to point a line at it again. It is answered by saving a document, by removing one line and by
 * deleting a whole plan, so no path drops a binding in silence.
 *
 * ---------------------------------------------------------------------------------------
 * A PLAN REFUSES A WRITE BUILT ON A COPY SOMEBODY HAS ALREADY REPLACED
 * ---------------------------------------------------------------------------------------
 *
 * `versionOfPlan` is a short token naming exactly what a plan holds: its title, its state and its
 * lines. Every read hands it back, and every write that changes the document takes it back as
 * `ifVersion` and answers 409 when the plan has moved. It is the same arrangement `versionOf` gives
 * a record in lib/records.ts, for the same reason: two readers load one plan, one saves, and the
 * other saves its older copy over the top with nothing said. There is no collaborative editor here
 * and none is wanted — this detects and refuses.
 */

import { createHash } from 'node:crypto'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { anOfficeId } from './ids.ts'
import { nowStamp } from '@shared/time.ts'
import {
  CONTAINMENT_LINK,
  hasParentAlready,
  wouldMakeCycle,
  type ContainmentLink,
} from '@shared/containment.ts'
import { KIND_SPECS } from '@shared/kinds.ts'
import { matchLines, replacedInPlace } from '@shared/plandiff.ts'
import { blocksOf, isPlanState, linesOfBody, PLAN_STATES, type PlanState } from '@shared/plandoc.ts'
import {
  lineWithNote,
  parsePlanLine,
  whyALineIsOverItsBudget,
  whyNoteCannotBeWritten,
  writePlanLine,
  type PlanningKey,
  type PlanningValue,
} from '@shared/planline.ts'
import type { PlanLineFact } from '@shared/targets.ts'
// THE LADDER'S OWN BUDGETS, ITS OWN WORD COUNT AND THE ONE FUNCTION THAT TURNS THE TWO INTO A
// REFUSAL SENTENCE. Called, never copied: a plan door and the record door must refuse an
// over-length text in the same words, or the two rules drift with nothing failing.
import { readHoursWords, readTimeWords, type Allocation, type Grain } from '@shared/planning.ts'
import { flattenOutline, outlineOf, type OutlineItem, type OutlineItemKind } from '@shared/planoutline.ts'
import {
  ANSWERING_LINK_TYPES,
  isAnAnsweringLink,
  type ActorType,
  type AnsweringLinkType,
  type PanelRecord,
  type RecordKind,
} from '@shared/types.ts'
import { db, sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import {
  allocations as allocationsTable,
  links as linksTable,
  planLineRevisions,
  planningIntents,
  planLines,
  plans as plansTable,
  records as recordsTable,
} from '../db/schema.ts'
import {
  ALLOCATABLE_KINDS,
  allocationsOf,
  createAllocation,
  keptWordsNowAbout,
  keptWordsOfLine,
  keptWordsOfLines,
  readingOfIntent,
  resolveAllocated,
  type AllocatedWork,
  type PlanningIntent,
} from './planning.ts'
import {
  allLinks,
  blockMustBeFiledInAPipeline,
  createLink,
  createRecordWithReport,
  listRecords,
  aRaiseCarriesIt,
  writtenFromAStaleCopy,
  type Actor,
} from './records.ts'
import { PanelError } from './panel-error.ts'
import { theSecretarysName, whoPressedItUnderTheGrant } from './the-persons-own-words.ts'
import { requireWorkspace } from './require-workspace.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
import type { AMessageReader } from './messages.ts'
import { getPlan } from './get-plan.ts'
import { toPlan } from './get-plan.ts'
import { linesOf } from '../db/lines-of.ts'
import { toLine } from '../db/lines-of.ts'
import type { PlanLine, LineRow } from '../db/types/plans.ts'

/** A plan as a caller sees it. Every field is stored; nothing here is worked out. */
export interface Plan {
  id: string
  title: string
  state: PlanState
  /** When somebody last said they had read this plan, or null because nobody ever has. */
  readAt: string | null
  /**
   * The secretary that marked this plan as read under the person's grant, by its registry id, and the id of that grant.
   * Null in both when a person marked it, or nobody has: a person's own mark sets both back to null (migration 0295).
   */
  readByAgent: string | null
  readUnderGrant: string | null
  createdAt: string
  updatedAt: string
  createdBy: string
  /**
   * The rough draft this plan was moved from by migration 0196, or null because it was written as
   * a plan. Stored, never worked out; `plans.moved_from_draft` in db/schema-parts/planning.ts says what it means.
   */
  movedFromDraft: string | null
}

export type { PlanLine, LineRow } from '../db/types/plans.ts'

/**
 * A PLANNING VALUE READ BACK OUT OF THE PLACE PROMOTION PUT IT. Worked out on every read.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS: PROMOTION TOOK A VALUE OUT OF THE WRITING AND NOTHING PUT IT BACK ON SCREEN
 * ---------------------------------------------------------------------------------------
 *
 * Filing a line as work moves `{size: 15h}` to the record's estimate and takes it out of the line's
 * words, because the same fact in two places is the defect this repository keeps finding. That is
 * right for storage and wrong for the person: the value then existed nowhere they could see it
 * while they were writing. Avoiding duplicate storage must not make a canonical fact disappear from
 * one of the two Plan views.
 *
 * So every read of a plan carries, per line, the values promotion moved, each naming the record
 * they were read from. NOTHING HERE IS STORED. It is not written back into `plan_lines.text` and it
 * is not a column: it is read from the record, its allocations and its intents every time.
 *
 * IT IS DELIBERATELY NOT PUT BACK IN THE LINE'S WORDS. The words are what the person typed. Writing
 * a promoted value into them would make a canonical value editable as prose — a typo would become a
 * record write — and once it is in the box nothing can tell it from what the person wrote, which is
 * the duplicate store arriving through another door.
 */
export interface DerivedPlanningValue {
  key: PlanLineFact
  /** What it says now, in plain words, ready to be drawn. */
  says: string
  /** The record this was read from, or null when words were kept without one. */
  recordId: string | null
  /** Where the one stored copy is now, in plain words. */
  storedIn: string
  /**
   * True when this is the stored fact Mole Office defends and counts.
   *
   * False for words somebody wrote that nothing could be made of. Those are kept exactly as typed,
   * they enter no total and no capacity, and a screen that drew them the same way as an allocation
   * would be claiming an interpretation nobody made.
   */
  canonical: boolean
}

/**
 * WORDS SOMEBODY WROTE ABOUT WHEN THIS LINE IS TO BE DONE, WHICH MOLE OFFICE HAS NOT SCHEDULED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY EVERY READ OF A PLAN CARRIES THIS, FILED OR NOT
 * ---------------------------------------------------------------------------------------
 *
 * The two views of a plan have to be able to draw the same words. They did not: the Table read the
 * line's own text for what it said about time, filing MOVED that text into a kept intent, and after
 * that the Table said nobody had given the work any time while the same words were still on the
 * screen in Writing. One plan, two views, and they contradicted each other about a phrase the
 * person had typed once.
 *
 * So this is on every line of every plan read, BOTH BEFORE AND AFTER the line is filed or pointed at
 * work, and it is the same list in both states — filing moves where the words are stored and does
 * not change what they say.
 *
 * NOTHING HERE IS IN ANY TOTAL. These are words, not hours: they add nothing to a week, use no
 * capacity, and count as no work planned. `canScheduled` says whether committing them is even
 * possible, so a screen can offer that press only where it would work.
 *
 * IT IS A LIST BECAUSE A DATABASE MAY HOLD MORE THAN ONE. One line says one thing about time and
 * `createIntent` keeps it that way, but rows written before that rule are in this installation's
 * corpus. Drawing one of two would hide the other for ever.
 */
export interface KeptWords {
  /** The id, which is what a screen sends to remove these words. */
  id: string
  /** What the person wrote, exactly as they wrote it. */
  said: string
  /** The period Mole Office read from the words, or null because it read none. Never a guess. */
  period: string | null
  horizon: Grain | null
  /** The hours Mole Office read, or null because it read none. Null is not zero. */
  hours: number | null
  /** What Mole Office made of the words, in one plain sentence, or why it made nothing. Always something. */
  reading: string
  /** The work these words are about, or null because the line names none yet. */
  recordId: string | null
  /**
   * True when these words could become hours: they name a period AND a piece of work.
   *
   * False is the ordinary state of rough writing and is not a fault. A screen offers the press only
   * where it is true, rather than offering one that answers with a refusal.
   */
  canScheduled: boolean
}

/**
 * A line with the record it names, when it names one, and what that record says back about it.
 *
 * `work` is null in two different situations and the caller can tell them apart: a line with no
 * `recordId` was never filed, and a line whose `recordId` finds no row names a record that has been
 * hard-deleted. The first is the ordinary state of most writing; the second is a hole worth showing.
 *
 * `derived` is the planning values promotion moved off this line, read back from where it put them.
 * Empty for a line nobody has filed, which is the ordinary case. See `DerivedPlanningValue`.
 *
 * `kept` is what this line says about time that Mole Office has not scheduled, in the person's own words,
 * present whether or not the line has been filed. See `KeptWords`. The two overlap on purpose and
 * cannot disagree: the `time` entries in `derived` that say `canonical: false` are built from this
 * same list, in one place, so a surface may draw either and get the same words.
 */
export interface PlanLineWithWork {
  line: PlanLine
  work: AllocatedWork | null
  derived: DerivedPlanningValue[]
  kept: KeptWords[]
  /**
   * THE RECORD'S OWN EXPLANATION, DRAWN BESIDE THE LINE AND NEVER WRITTEN INTO IT.
   *
   * Its level-3 conclusion — the record's `summary` column — where the record has one, and its
   * level-2 title where it has none. Null on a line that names no record, because there is no
   * record to explain. See P2 of design/planning/ACCEPTANCE.md.
   */
  explanation: PlanExplanation | null
  /**
   * THE FORM OF THE RECORD A LINE MAY TAKE INTO ITSELF, when somebody presses for it.
   *
   * The record's level-1 label where one is written, and its level-2 title where none is. Null on
   * a line that names no record: there is nothing to take, so the line is written by hand.
   */
  shortForm: PlanShortForm | null
  /**
   * WHAT THIS LINE'S WORK HOLDS ON THE CALENDAR, read back so a plan can draw planned against done.
   *
   * It is worked out on every read from the allocations that name the record and is stored nowhere —
   * the same rule `derived` follows. Null where nothing was ever given hours, which is not zero.
   * See `LineHours` for what each number means and what is deliberately counted rather than summed.
   *
   * ABSENT ON A LINE THE BROWSER HAS JUST WRITTEN. A body save hands back rows and not allocations,
   * and the page carries the last read's hours beside each line id rather than inventing a zero. A
   * read from the server always carries it; absence means the same as `NO_HOURS`.
   */
  hours?: LineHours
}

/**
 * THE HOURS A LINE'S WORK HOLDS, planned against what was actually spent.
 *
 * ---------------------------------------------------------------------------------------
 * AN ABSENT NUMBER IS NOT A ZERO, THREE TIMES OVER
 * ---------------------------------------------------------------------------------------
 *
 * `planned` and `actual` are NULL when no allocation on this work states that number. A person may
 * commit a week's time without saying how long it takes — `plannedHours: null` is a real answer that
 * counts as unstated in every total — and an allocation nobody has completed states no actual. So
 * summing nulls to zero would turn "nobody said" into "nothing", which is the defect this product
 * removes wherever it appears.
 *
 * `plannedUnstated` and `actualUnstated` count the allocations that said nothing, so a reader is
 * told how many rows the sum does not cover. `allocations` is the whole count, including any whose
 * record is gone: an allocation that names a deleted record is a fact about this plan and is counted
 * rather than dropped.
 */
export interface LineHours {
  planned: number | null
  actual: number | null
  allocations: number
  plannedUnstated: number
  actualUnstated: number
}

/** Nothing was ever given hours here: three nothings and a count of zero. */
const NO_HOURS: LineHours = {
  planned: null,
  actual: null,
  allocations: 0,
  plannedUnstated: 0,
  actualUnstated: 0,
}

/** Sum the stated hours and count the unstated ones, so neither is drawn as the other. */
function hoursOn(allocations: readonly Allocation[]): LineHours {
  const stated = allocations.filter((one) => one.plannedHours !== null)
  const spent = allocations.filter((one) => one.actualHours !== null)
  return {
    planned: stated.length === 0 ? null : stated.reduce((sum, one) => sum + (one.plannedHours ?? 0), 0),
    actual: spent.length === 0 ? null : spent.reduce((sum, one) => sum + (one.actualHours ?? 0), 0),
    allocations: allocations.length,
    plannedUnstated: allocations.length - stated.length,
    actualUnstated: allocations.length - spent.length,
  }
}

/** The record's own words drawn beside a filed line, and which rung of the ladder they are. */
export interface PlanExplanation {
  /** `conclusion` is the record's level 3; `title` is its level 2. */
  level: 'conclusion' | 'title'
  /** The words themselves, exactly as the record holds them. */
  text: string
}

/** The record's own shorter form a line may take, and which rung of the ladder it came from. */
export interface PlanShortForm {
  /** `label` is the record's level 1; `title` is its level 2. */
  level: 'label' | 'title'
  /** The words themselves, exactly as the record holds them. */
  text: string
}

/** What a plan looks like in a list, without sending the whole document. */
export interface PlanSummary {
  plan: Plan
  /** The token naming what this plan holds. Send it back as `ifVersion` on a write. */
  version: string
  /** How many lines it holds, blank lines included, because a blank line is something written. */
  lines: number
  /** How many of those lines somebody has filed as work. */
  filedAsWork: number
  /**
   * How many lines have no hours on any period at all.
   *
   * A line has time when some allocation names the record it was filed as, at any horizon and any
   * period. A line nobody filed has no record, so it can have no time — it is counted here, because
   * "nothing is planned for this" is exactly what the reader is being told.
   */
  withNoTimeOnAnyPeriod: number
  /** The first two lines as written, so a card can show what this plan opens with. */
  firstLines: string[]
}

export type PlanRow = typeof plansTable.$inferSelect

export { toPlan } from './get-plan.ts'

export { toLine } from '../db/lines-of.ts'

/** Who is writing, in the one form every stamp in this database uses. */
function stampOf(actor: Actor): string {
  return `${actor.type}:${actor.id}`
}

function checkTitle(title: string): string {
  const trimmed = title.trim()
  if (trimmed === '') {
    throw new PanelError('A plan needs a name — one line saying what this writing is about.')
  }
  return trimmed
}

function checkState(state: string): PlanState {
  if (isPlanState(state)) return state
  throw new PanelError(
    `A plan is one of: ${PLAN_STATES.join(', ')}. It is "${state}". "done" means the writing did what ` +
      'it was for; "dropped" means it did not and nobody will finish it.',
  )
}

// ---------------------------------------------------------------------------- what a line is

/**
 * A WHOLE DOCUMENT AS THE LINES A PLAN STORES. A STORED LINE HOLDS ITS WORDS AND NO LINE ENDING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS: A CARRIAGE RETURN SURVIVED BEING STORED AND DID NOT SURVIVE BEING EDITED
 * ---------------------------------------------------------------------------------------
 *
 * A plan pasted in from a Windows file arrives with `\r\n` at the end of every line. Splitting that
 * on the newline alone leaves a `\r` on the end of every stored line's text. Then the person opens
 * the plan and types one character. The writing box is an HTML textarea, and the HTML standard says
 * a textarea gives its value back with every line ending turned into a plain newline — so the save
 * carries no carriage returns at all. `matchLines` compares characters, exactly and deliberately, so
 * EVERY line looks changed, every row is deleted and replaced, and every binding to real work in the
 * document is dropped by one keystroke. Measured in a browser: a three-line plan with one line filed
 * as work lost that binding on the first character typed.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE TRUTH IS: THE CARRIAGE RETURN WAS NEVER A CHARACTER ANYBODY TYPED
 * ---------------------------------------------------------------------------------------
 *
 * It is half of a line ending. A document is lines plus a convention for ending them, and Mole Office
 * stores lines. Storing the `\r` stored a piece of the ending as if it were a piece of the words,
 * and the proof that it is not the words is that no person can produce one: the box a plan is
 * written in cannot return a carriage return, whatever the person does to it.
 *
 * So this reads a document with ANY line ending — carriage return and newline, newline alone, or
 * carriage return alone — and stores none of them. That is the same rule the writing box follows,
 * which is the point: the store and the box now agree about where a line ends, so a document
 * survives being opened and saved.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT A SILENT NORMALISATION, WHICH INVARIANT 2 FORBIDS
 * ---------------------------------------------------------------------------------------
 *
 * TWO REASONS, AND BOTH HAVE TO HOLD.
 *
 * It is not silent. `carriageReturns` says how many line endings were written with a carriage
 * return, and the reply of both routes that store a document says so in words when that count is
 * not zero. The routes' own declarations state the rule, so a caller reads it before sending.
 *
 * It is not a normalisation of anybody's writing. NO WORD, NO SPACE AND NO BLANK LINE IS TOUCHED.
 * Trailing spaces are kept, runs of blank lines are kept, and a document ending in a line ending
 * still ends in an empty line — every one of those is something a person typed, and this changes
 * none of them. What changes is only which characters count as the end of a line.
 *
 * AND IT IS NOT MATCHING BY SIMILARITY. `src/shared/plandiff.ts` is untouched and still matches on
 * exact characters. Two lines are the same line here only when they are character for character the
 * same, once the line ending is off — which happens before any matching, to the document, not to a
 * pair of lines being compared. Loosening the match instead would have moved a record binding onto a
 * line nobody bound, which is the thing that file exists to refuse.
 *
 * DERIVED FROM `linesOfBody`, NOT A SECOND SPLITTER. `linesOfBody` is the one place that says what a
 * newline does, and it stays exactly what it says it is. This prepares its input and calls it, so
 * there is no second answer to "what are the lines of this document" that could drift from the first.
 */
interface DocumentLines {
  /** The lines, in order, each holding its words and no line ending. */
  texts: string[]
  /** How many of this document's line endings were written with a carriage return. */
  carriageReturns: number
}

function linesOfDocument(body: string): DocumentLines {
  const carriageReturns = (body.match(/\r/g) ?? []).length
  const newlinesOnly = carriageReturns === 0 ? body : body.replace(/\r\n?/g, '\n')
  return { texts: linesOfBody(newlinesOnly), carriageReturns }
}

/**
 * Refuse one line's text that holds a line ending, rather than storing a line that is not a line.
 *
 * THE ROUTES THAT WRITE ONE LINE WRITE ONE LINE. Storing a line ending inside a line's text would
 * break the rule `linesOfDocument` states, and the whole document would then be rewritten the next
 * time anybody saved it — the same destruction, through a quieter door. Splitting it into several
 * lines here instead would be Mole Office doing something other than what was asked, which is invariant 2.
 * So it is refused, and the refusal names the route that writes several lines at once.
 *
 * AND IT IS WHERE EVERY SINGLE-LINE WRITE MEETS THE WORD BUDGET. `addLine`, `patchLine` and
 * `writeLines` all come through this function, so the rule is written once and cannot be applied on
 * one door and not another. `createPlan` and `writeBody` take a whole document and call
 * `checkLineBudget` per line themselves, because there is no single line to hand this.
 */
function checkLineText(text: string, what: string): string {
  if (/[\r\n]/.test(text)) {
    throw new PanelError(
      `${what} holds a line ending, and a plan line is one line. Nothing was written. Mole Office will not ` +
        'split it into several lines for you, because you asked to write one. Send the whole document to ' +
        'PUT /api/plans/<plan>/body, which is what writes several lines at once.',
    )
  }
  checkLineBudget(text, what)
  return text
}

/**
 * REFUSE A LINE OR A HEADING WHOSE WORDS ARE OVER ITS BUDGET — THE UPPER BOUND ONLY.
 *
 * The rule itself is `whyALineIsOverItsBudget` in src/shared/planline.ts, with the reasons for both
 * budgets. It moved there from here so migration 0196 holds a moved draft's lines to the same rule
 * without opening the database this file opens; this is the door's half, which refuses.
 */
function checkLineBudget(text: string, what: string): void {
  const problem = whyALineIsOverItsBudget(text)
  if (problem === null) return
  throw new PanelError(`${what} is over its budget. ${problem} Nothing was written.`)
}

// ---------------------------------------------------------------------------- reading

export { linesOf } from '../db/lines-of.ts'

/**
 * THE PLANNING VALUES ONE LINE'S RECORD SAYS BACK, in the order the plan's own columns read.
 *
 * Every one of these was taken out of the line's words when the line was filed. This is the read
 * that puts them back on screen without putting them back in the writing. See
 * `DerivedPlanningValue` for why they may not simply be written into the text.
 */
function derivedValuesOf(
  work: AllocatedWork | null,
  allocations: readonly Allocation[],
  /**
   * THE SAME LIST THE LINE HANDS BACK AS `kept`, passed in rather than read again here.
   *
   * Two reads of one thing is the defect this repository keeps finding, and this is where it would
   * arrive: the Table would draw `kept`, Writing would draw `derived`, and the day the filter on one
   * of them changed the two views would disagree about the person's own words with nothing failing.
   */
  kept: readonly KeptWords[],
  /**
   * What each project in this installation is called, so the project this line landed in is said by
   * NAME. `says` is prose a screen draws, and a stored id — `unassigned`, `default` — is not a name.
   */
  projectNames: ReadonlyMap<string, string>,
): DerivedPlanningValue[] {
  const found: DerivedPlanningValue[] = []
  if (work !== null) {
    if (work.effortHours !== null) {
      found.push({
        key: 'size',
        says: `${work.effortHours} hours`,
        recordId: work.id,
        storedIn: `the estimate on the work this line is filed as, "${work.name}"`,
        canonical: true,
      })
    }
    for (const allocation of allocations) {
      // THE STATE IS PART OF WHAT IT SAYS. An allocation that was done or dropped is still hours
      // somebody gave this work, and drawing it as if it were still planned would be a claim about
      // the week that the row itself contradicts.
      const state = allocation.state === 'planned' ? '' : ` — ${allocation.state}`
      found.push({
        key: 'time',
        says: `${allocation.plannedHours} hours in ${allocation.period}${state}`,
        recordId: work.id,
        storedIn: 'the hours given to this work',
        canonical: true,
      })
    }
    found.push({
      key: 'project',
      // THE PROJECT'S NAME, NOT ITS STORED ID. Every project is in the registry, so the second half
      // is only reached on a database somebody edited by hand — and then the id is printed, which
      // is the true name of what is stored and is never some other project's title. That is the
      // same rule `projectName` states for the browser in src/web/lib/projects.ts.
      says: projectNames.get(work.workspaceId) ?? work.workspaceId,
      recordId: work.id,
      storedIn: 'the project the work this line is filed as sits in',
      canonical: true,
    })
  }
  for (const words of kept) {
    found.push({
      key: 'time',
      says: words.said,
      recordId: words.recordId,
      storedIn: 'kept exactly as you wrote it',
      canonical: false,
    })
  }
  return found
}

/** Stored words as the line hands them back, with what Mole Office made of them beside them. */
function keptWordsOf(intent: PlanningIntent): KeptWords {
  return {
    id: intent.id,
    said: intent.said,
    period: intent.period,
    horizon: intent.horizon,
    hours: intent.hours,
    reading: readingOfIntent(intent),
    recordId: intent.recordId,
    // THE TWO THINGS COMMITTING NEEDS, asked here so a screen does not offer a press that answers
    // with a refusal. `commitIntent` asks the same two and is still the only thing that decides.
    canScheduled: intent.period !== null && intent.recordId !== null,
  }
}

/**
 * Every line of a plan with the record it names and what that record says back about it.
 *
 * The records are read BY PRIMARY KEY and only the ones these lines already name, which is the
 * boundary rule the header states. Nothing here filters by project, because a plan legitimately
 * spans several and every row says which one it is in.
 *
 * THE HOURS, THE KEPT WORDS AND THE PROJECT NAMES ARE READ FOR THE WHOLE PLAN, NOT PER LINE. One
 * read of the intents, one of the registry, and one per record named, rather than two queries per
 * line, because a plan of two hundred lines is an ordinary plan.
 */
export function linesWithWork(planId: string): PlanLineWithWork[] {
  const lines = linesOf(planId)
  const named = lines.filter((line): line is PlanLine & { recordId: string } => line.recordId !== null)
  const work = resolveAllocated(named)
  // WHAT EACH PROJECT IS CALLED. A plan spans projects, so this is the whole registry rather than
  // one row, and it is a handful of rows in every installation.
  const projectNames = new Map(listWorkspaces().map((one) => [one.id, one.title]))

  const hoursOf = new Map<string, Allocation[]>()
  for (const line of named) {
    if (!hoursOf.has(line.recordId)) hoursOf.set(line.recordId, allocationsOf(line.recordId))
  }
  // WHAT EVERY LINE OF THIS PLAN SAYS ABOUT TIME AND MOLE OFFICE HAS NOT SCHEDULED, in one read, keyed
  // by line. It is asked for by line id rather than read whole and filtered, so a plan does not
  // walk every intent in the installation to find its own.
  const keptOn = keptWordsOfLines(lines.map((line) => line.id))

  return lines.map((line) => {
    const found = line.recordId === null ? null : (work.get(line.recordId) ?? null)
    const kept = (keptOn.get(line.id) ?? []).map(keptWordsOf)
    return {
      line,
      work: found,
      derived: derivedValuesOf(
        found,
        line.recordId === null ? [] : (hoursOf.get(line.recordId) ?? []),
        kept,
        projectNames,
      ),
      kept,
      explanation: explanationOf(found),
      shortForm: shortFormOf(found),
      // PLANNED AGAINST DONE, from the allocations this line's work already holds. Read from the
      // same map the derived values read, so an hours figure on the drawing and the hours named
      // beside the line cannot come to disagree.
      hours: line.recordId === null ? NO_HOURS : hoursOn(hoursOf.get(line.recordId) ?? []),
    }
  })
}

/**
 * ONE ANSWER TO A PLAN'S LINE: WHICH WORK, WHICH PLANNED STATE, WHICH WAY, WHO SAID IT AND WHEN.
 *
 * `workTitle` is the record's LIVE title, read here rather than copied from the line's words, because
 * renaming a record does not rewrite the line that filed it. `toTitle` is the planned state's title.
 * A title that is no longer on file is null, and the drawing says the record is gone rather than
 * inventing one. `by` is null when the link predates the column that says which kind of actor wrote
 * it: an old link says nothing about that, and the drawing says so rather than guessing.
 */
export interface PlanAnswer {
  id: string
  workId: string
  workTitle: string | null
  toId: string
  toTitle: string | null
  type: AnsweringLinkType
  at: string
  by: { actorType: ActorType; actorId: string } | null
}

/**
 * EVERY ANSWER ON THE WORK THIS PLAN'S LINES NAME, and no other.
 *
 * The plan's lines are the boundary. No link whose `fromId` is work this plan does not name is read:
 * a plan's page says who answered THIS plan, not which other plans the same work appears in.
 *
 * Two reads, not two per line. The work ids are the ids the lines already carry, so the links are
 * selected in one statement, and the planned states' titles are one read of the records those links
 * point at. A plan with no filed lines makes no query at all.
 *
 * Oldest first, so the list reads in the order the answers were said. Two answers written in the
 * same second are ordered by id, which is stable and is not a claim about which came first.
 */
export function answersOnPlan(lines: readonly PlanLineWithWork[]): PlanAnswer[] {
  const workTitles = new Map<string, string | null>()
  for (const entry of lines) {
    if (entry.line.recordId === null) continue
    if (!workTitles.has(entry.line.recordId)) workTitles.set(entry.line.recordId, entry.work?.title ?? null)
  }
  const workIds = [...workTitles.keys()]
  if (workIds.length === 0) return []

  const rows = db
    .select({
      id: linksTable.id,
      fromId: linksTable.fromId,
      toId: linksTable.toId,
      type: linksTable.type,
      createdAt: linksTable.createdAt,
      createdBy: linksTable.createdBy,
      createdByType: linksTable.createdByType,
    })
    .from(linksTable)
    .where(and(inArray(linksTable.fromId, workIds), inArray(linksTable.type, [...ANSWERING_LINK_TYPES])))
    .all()
  if (rows.length === 0) return []

  const toTitles = new Map(
    db
      .select({ id: recordsTable.id, title: recordsTable.title })
      .from(recordsTable)
      .where(inArray(recordsTable.id, [...new Set(rows.map((row) => row.toId))]))
      .all()
      .map((row) => [row.id, row.title]),
  )

  return rows
    .filter((row) => isAnAnsweringLink(row.type))
    .sort((left, right) =>
      left.createdAt === right.createdAt ? left.id.localeCompare(right.id) : left.createdAt.localeCompare(right.createdAt),
    )
    .map((row) => ({
      id: row.id,
      workId: row.fromId,
      workTitle: workTitles.get(row.fromId) ?? null,
      toId: row.toId,
      toTitle: toTitles.get(row.toId) ?? null,
      // The SQL selected only these two types; the filter above says so at runtime too.
      type: row.type as AnsweringLinkType,
      at: row.createdAt,
      by: row.createdByType === null ? null : { actorType: row.createdByType, actorId: row.createdBy },
    }))
}

/**
 * THE RECORD'S EXPLANATION, WHICH THE PAGE DRAWS BESIDE A FILED LINE.
 *
 * Its level-3 conclusion where the record has one, and its level-2 title where it has none. A
 * record with no title cannot exist — the title is required to file it — so a line that names a
 * record always has an explanation; the fallback is a real rung and not a blank.
 */
function explanationOf(work: AllocatedWork | null): PlanExplanation | null {
  if (work === null) return null
  const conclusion = work.summary?.trim() ?? ''
  if (conclusion !== '') return { level: 'conclusion', text: conclusion }
  return { level: 'title', text: work.title }
}

/**
 * THE FORM OF THE RECORD A LINE MAY TAKE, WHICH SOMEBODY HAS TO PRESS FOR.
 *
 * The level-1 label where the record has one, and its level-2 title where none is written. The
 * words are handed over exactly as the record holds them and are never cut: a title longer than a
 * plan line's budget is refused by the same door that refuses a long line, rather than shortened
 * here. Nothing derives a line's words from this — the press in the browser sends them back.
 */
function shortFormOf(work: AllocatedWork | null): PlanShortForm | null {
  if (work === null) return null
  const label = work.label?.trim() ?? ''
  if (label !== '') return { level: 'label', text: label }
  return { level: 'title', text: work.title }
}

export { getPlan } from './get-plan.ts'

/** The same read with the refusal every route wants, so no route writes that sentence itself. */
export function mustGetPlan(id: string): Plan {
  const plan = getPlan(id)
  // The same shape as a record that is not there: what a person reads says there is nothing here
  // and why there might not be; the id goes to `detail`, where an id belongs. Finding 10 names this
  // address as having the same fault as `#/r/<a bad id>`, plus no way back at all.
  if (plan === null) {
    throw new PanelError(
      'There is no plan at this address. It may have been deleted, or the link may be wrong.',
      404,
      `No plan has the id "${id}".`,
    )
  }
  return plan
}

// ------------------------------------------------------------ which plan you wrote against

/**
 * A short token naming exactly what this plan holds. Same content, same token, on any machine.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS OVER THE LINES, NOT OVER THE PLAN ROW
 * ---------------------------------------------------------------------------------------
 *
 * A plan has no body column; the document IS the lines. So a token built from the `plans` row alone
 * would be the same before and after somebody rewrote every line of the document, which is a
 * precondition that passes a stale write and calls it safe. It covers the title, the state, and
 * every line's words and record binding, in order — everything a write to this plan can change and
 * that a second writer would lose.
 *
 * WHAT IT DELIBERATELY LEAVES OUT. `read_at` is a note about somebody's eyes rather than the
 * document, and refusing a save because a person pressed "Mark as read" would be a refusal that
 * costs work and prevents none. `updated_at` is a wall-clock stamp to the second, which is why the
 * token is content and not a stamp at all — two writes inside one second carry the same stamp, and
 * `versionOf` in lib/records.ts spells out what that costs.
 *
 * A LINE'S ID IS NOT CONTENT. Two plans holding the same words are the same document to a caller
 * that read one of them, and saving a document deletes and re-inserts every row whose words moved.
 */
export function versionOfPlan(plan: Pick<Plan, 'title' | 'state'>, lines: readonly PlanLine[]): string {
  const shape = JSON.stringify([plan.title, plan.state, lines.map((line) => [line.text, line.recordId])])
  return createHash('sha256').update(shape).digest('hex').slice(0, 16)
}

/** The token for a plan that is on file. One read, so a route cannot hand back a stale one. */
export function planVersion(planId: string): string {
  return versionOfPlan(mustGetPlan(planId), linesOf(planId))
}

/**
 * ONE PLAN WRITE, WITH THE DATABASE'S WRITE LOCK TAKEN BEFORE ITS FIRST READ (problem rpOBGf7h_3Tj).
 *
 * Every exported function in this file that writes is wrapped in this. It opens the write as `BEGIN IMMEDIATE`, so
 * the version check in `refuseStaleWrite`, the reads that decide what to write, and the writes are one step that no
 * other program can write into the middle of.
 *
 * WHAT IT WAS BEFORE. The writes ran in better-sqlite3's default transaction, `BEGIN DEFERRED`, with the version
 * check and most of the reads before it. The office is not the only program that writes to its database file: a
 * script does, a second server does, and in a test so does the test's own server beside the one the browser talks
 * to. A deferred transaction reads from a snapshot and asks for the write lock only at its first write. If another
 * program has written in between, SQLite refuses that write at once with SQLITE_BUSY_SNAPSHOT, without waiting,
 * because no wait makes the old snapshot current. The person got a 500 "internal error". On 1 October 2026 it was
 * caught in a loaded test run, filing a plan line as work, at the record insert in lib/records.ts. The second fault
 * made no noise: two programs could both pass the version check, and the second write replaced the first with
 * nothing refused.
 *
 * WHAT HAPPENS NOW. While another program holds the write lock, this one waits in SQLite's own busy wait
 * (better-sqlite3's 5-second default, which this does not change), then reads what is stored by then. So a write
 * built on an older copy is refused by `refuseStaleWrite` with `planChangedSinceRead`, exactly as it is when both
 * writers are in one process. A lock held for longer than that wait still fails with SQLITE_BUSY. That has not been
 * seen, and nothing here answers it.
 *
 * Inside a transaction that is already open it is a savepoint, as every better-sqlite3 transaction is.
 */
function oneWrite<A extends unknown[], R>(write: (...args: A) => R): (...args: A) => R {
  return (...args) => sqlite.transaction(() => write(...args)).immediate()
}

/**
 * REFUSE A WRITE BUILT ON A COPY OF THIS PLAN THAT SOMEBODY HAS ALREADY REPLACED.
 *
 * `ifVersion` is optional, exactly as it is on a record: leaving it out writes as before, and
 * sending it says which plan you were looking at. When it does not match, NOTHING is written and
 * the refusal says what the plan holds now and who wrote in it last, because "it changed" on its
 * own leaves the reader with nothing to compare.
 *
 * There is no merge and no collaborative editor here. This detects and refuses; the way out is to
 * read the plan again, put your change on top of what is there now, and save that.
 *
 * The refusal is the gate `writes-from-a-stale-copy` (wave 13r round N). At off this returns, and the write goes on.
 */
export function refuseStaleWrite(planId: string, ifVersion: string | undefined, actor?: Actor): void {
  if (ifVersion === undefined) return
  const plan = mustGetPlan(planId)
  const lines = linesOf(planId)
  const now = versionOfPlan(plan, lines)
  if (ifVersion === now) return

  // WHAT MOVED, as far as what is stored can say. A line stores when it was last written and by
  // whom, and nothing stores when it first appeared, so this cannot say which lines were added and
  // which were changed — and it does not guess. `writtenSinceRead` says the same thing for the same
  // reason. The lines written by somebody who is not the caller are the useful half of the answer:
  // that is the two-tab case and the agent-at-two-in-the-morning case both.
  const latest = lines.reduce<string | null>(
    (newest, line) => (newest === null || line.updatedAt > newest ? line.updatedAt : newest),
    null,
  )
  const you = actor === undefined ? null : stampOf(actor)
  const written = lines.filter((line) => line.updatedAt === latest)
  const byOthers = you === null ? written : written.filter((line) => line.updatedBy !== you)
  const shown = (byOthers.length > 0 ? byOthers : written).slice(0, 3)
  const who = [...new Set((byOthers.length > 0 ? byOthers : written).map((line) => line.updatedBy))].sort()
  const rest = (byOthers.length > 0 ? byOthers : written).length - shown.length
  const holds = `The plan holds ${lines.length} line${lines.length === 1 ? '' : 's'} now.`
  const moved =
    latest === null
      ? 'The plan holds no lines at all now.'
      : `${holds} The last writing in it was at ${latest}, by ${who.join(', ')}: ` +
        `${shown.map((line) => JSON.stringify(line.text === '' ? '(a blank line)' : line.text)).join(', ')}` +
        `${rest > 0 ? `, and ${rest} more` : ''}. Mole Office cannot say which of those lines were added and ` +
        'which were changed, because nothing stores when a line first appeared.'

  // THE GATE writes-from-a-stale-copy: at off the write goes on, and it is counted either way.
  writtenFromAStaleCopy(new PanelError(
    `This plan has changed since you read it, so nothing was written. You sent ifVersion "${ifVersion}"; it ` +
      `is now "${now}". ${moved} Read the plan again with GET /api/plans/${planId}, put your change on top of ` +
      'what is there now, and save that. Mole Office will not merge two documents for you: it cannot tell which ' +
      'of two versions of a sentence somebody meant.',
    409,
    undefined,
    undefined,
    'This plan changed after you read it, so nothing was written.',
    // THE PAGE'S READING (problem GR4LcaNI-XZk). The plan pages draw this code in the page language; the English above
    // stays whole for an agent, with the two tokens and the route it names.
    { code: 'planChangedSinceRead', values: {} },
  ))
}

/**
 * Plans, most recently written in first, with the counts a list needs.
 *
 * `state` picks which are wanted; leaving it out returns every plan, closed ones included. The
 * counts are computed from three reads of the whole planning layer rather than one query per plan:
 * these tables are small, and a per-plan query would be the thing that stops being small first.
 */
export function listPlans(opts: { state?: PlanState } = {}): PlanSummary[] {
  const rows = db.select().from(plansTable).all().map(toPlan)
  const wanted = opts.state === undefined ? rows : rows.filter((plan) => plan.state === opts.state)
  wanted.sort((a, b) => (a.updatedAt === b.updatedAt ? (a.id < b.id ? 1 : -1) : a.updatedAt < b.updatedAt ? 1 : -1))

  const allLines = db.select().from(planLines).all().map(toLine)
  const recordsWithTime = new Set(
    db.select({ recordId: allocationsTable.recordId }).from(allocationsTable).all().map((row) => row.recordId),
  )

  const byPlan = new Map<string, PlanLine[]>()
  for (const line of allLines) {
    const list = byPlan.get(line.planId)
    if (list === undefined) byPlan.set(line.planId, [line])
    else list.push(line)
  }

  return wanted.map((plan) => {
    const lines = (byPlan.get(plan.id) ?? []).sort((a, b) => a.position - b.position)
    return {
      plan,
      version: versionOfPlan(plan, lines),
      lines: lines.length,
      filedAsWork: lines.filter((line) => line.recordId !== null).length,
      withNoTimeOnAnyPeriod: lines.filter(
        (line) => line.recordId === null || !recordsWithTime.has(line.recordId),
      ).length,
      // THE PLAN, NOT ITS SOURCE. This was `line.text` — the stored characters — so a card in the
      // plans list read "# big title Do this {size: large} {note: remember this note}". A list row
      // exists to help somebody pick this plan out of four, and `{size: 1er}` does not help with
      // that; it is the storage syntax shown raw. Both strippers here are the ones the rest of the
      // product already uses — `blocksOf` takes the hashes, the bullet and the box off, and
      // `parsePlanLine` takes the trailing groups off — so this is not a second parser.
      // Finding 33 of the language audit, 19 August 2026. The plan EDITOR still shows the syntax,
      // which is right: somebody writing in a markup language may be shown that language.
      firstLines: openingWords(lines),
    }
  })
}

/**
 * The first two lines of a plan as a person would read them, for the card in the plans list.
 *
 * A blank line is skipped here and only here: a card showing two lines has room for two lines that
 * say something, and the spacing somebody typed is part of the DOCUMENT rather than part of a
 * preview of it. Everything else about the words is untouched.
 */
function openingWords(lines: readonly LineRow[]): string[] {
  const blocks = blocksOf(lines.map((line) => ({ id: line.id, text: line.text })))
  const said: string[] = []
  for (const block of blocks) {
    if (said.length === 2) break
    if (block.kind === 'blank') continue
    // A table and an unreadable run have no single line of words; the card shows what was typed,
    // which is what the plan's own page does with them too.
    const text =
      block.kind === 'table' || block.kind === 'notUnderstood'
        ? (block.lines[0]?.text ?? '')
        : parsePlanLine(block.text).text.trim()
    if (text !== '') said.push(text)
  }
  return said
}

/** How many plans are closed, which is the number under the list of open ones. */
export function countClosedPlans(): number {
  return db
    .select()
    .from(plansTable)
    .all()
    .filter((row) => row.state !== 'open').length
}

/**
 * What has been written to this plan since the reader last said they had read it.
 *
 * A line counts when it was written at or after `read_at` BY SOMEBODY ELSE. Your own writing is not
 * news to you, and an agent writing to a plan at two in the morning is exactly what this exists to
 * surface.
 *
 * AT OR AFTER, NOT AFTER, and the second is one word away from losing news silently. A stamp here
 * is a local wall-clock string counted in whole seconds, so a line an agent wrote in the same second
 * you pressed "Mark as read" carries the same stamp as the read. Reporting it is a line you have
 * probably seen; not reporting it is a line nobody will ever tell you about.
 *
 * IT CANNOT SAY HOW MANY LINES WERE ADDED AND HOW MANY WERE CHANGED, and it says so rather than
 * guessing. A line stores when it was last written and who wrote it, and nothing stores when it
 * first appeared, so "added" and "changed" are indistinguishable in what is stored. The brief's
 * sentence *"6 lines added, 1 changed since you read this"* needs a `created_at` on `plan_lines`
 * that the design does not have; until it does, the honest sentence is the one this answers.
 */
export interface PlanReadingSince {
  /** Null when nobody has ever marked this plan as read, so nothing can be "since" anything. */
  readAt: string | null
  /** The lines written after `read_at` by somebody who is not the reader asking. */
  written: PlanLine[]
  /** Everyone who wrote them, so the page can say who without inventing a name for them. */
  writtenBy: string[]
  /** True when this cannot be answered because nobody has marked the plan as read. */
  neverRead: boolean
  /**
   * The secretary that marked the plan as read under the person's grant, by the name it is said by, and the grant. Null
   * when a person marked it, or nobody has. A secretary's mark is not the person's reading, so the page says who made it.
   * It is read from the secretary's column alone, so a row that names a secretary is never shown as a person's mark; the
   * grant is null only on a row written by hand, since the one write stores both.
   */
  markedUnderTheGrant: { secretary: string; grant: string | null } | null
}

export function writtenSinceRead(planId: string, actor: Actor): PlanReadingSince {
  const plan = mustGetPlan(planId)
  const reader = stampOf(actor)
  if (plan.readAt === null) return { readAt: null, written: [], writtenBy: [], neverRead: true, markedUnderTheGrant: null }
  const readAt = plan.readAt
  const written = linesOf(planId).filter((line) => line.updatedAt >= readAt && line.updatedBy !== reader)
  return {
    readAt: plan.readAt,
    written,
    writtenBy: [...new Set(written.map((line) => line.updatedBy))].sort(),
    neverRead: false,
    markedUnderTheGrant:
      plan.readByAgent === null ? null : { secretary: theSecretarysName({ id: plan.readByAgent }), grant: plan.readUnderGrant },
  }
}

// ---------------------------------------------------------------------------- writing a plan

/** What starting a plan did. */
export interface PlanCreated {
  plan: Plan
  lines: PlanLine[]
  /** How many of the document's line endings were written with a carriage return. */
  carriageReturns: number
}

/**
 * Start a plan.
 *
 * A whole document may arrive as `body`, and `linesOfDocument` reads it into lines. So a Markdown
 * file pastes in whole and comes back out whole, which is the workflow this replaces and must not
 * damage — and a file written on Windows is one of those files, which is why the line ending comes
 * off rather than being stored as the last character of every line.
 */
export const createPlan = oneWrite(function createPlan(input: { title: string; body?: string }, actor: Actor): PlanCreated {
  const title = checkTitle(input.title)
  const stamp = nowStamp()
  const by = stampOf(actor)
  const planRow: PlanRow = {
    id: anOfficeId(),
    title,
    state: 'open',
    readAt: null,
    readByAgent: null,
    readUnderGrant: null,
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: by,
    // Written as a plan, so it was never a draft. Only migration 0196 writes anything else here.
    movedFromDraft: null,
  }
  // A plan with no body has no lines at all, rather than one empty line. "Nothing is written yet"
  // and "one blank line is written" are different facts and the empty screen says the first one.
  const document =
    input.body === undefined || input.body === ''
      ? { texts: [], carriageReturns: 0 }
      : linesOfDocument(input.body)
  const texts = document.texts
  // A WHOLE DOCUMENT IS HELD TO THE SAME BUDGET AS ONE LINE, before anything is written, so a body
  // with one over-long line refuses the whole plan rather than storing part of it.
  for (const text of texts) checkLineBudget(text, 'A line of the document')
  const lineRows: LineRow[] = texts.map((text, index) => ({
    id: anOfficeId(),
    planId: planRow.id,
    position: index + 1,
    text,
    recordId: null,
    remark: null,
    updatedAt: stamp,
    updatedBy: by,
  }))

  sqlite.transaction(() => {
    db.insert(plansTable).values(planRow).run()
    if (lineRows.length > 0) db.insert(planLines).values(lineRows).run()
  })()

  return { plan: toPlan(planRow), lines: lineRows.map(toLine), carriageReturns: document.carriageReturns }
})

/** Change a plan's name or say that it has ended. Neither touches a line. */
export const patchPlan = oneWrite(function patchPlan(
  id: string,
  patch: { title?: string; state?: string },
  actor: Actor,
  ifVersion?: string,
): Plan {
  mustGetPlan(id)
  refuseStaleWrite(id, ifVersion, actor)
  const next: Partial<PlanRow> = { updatedAt: nowStamp() }
  if (patch.title !== undefined) next.title = checkTitle(patch.title)
  if (patch.state !== undefined) next.state = checkState(patch.state)
  db.update(plansTable).set(next).where(eq(plansTable.id, id)).run()
  // The actor is taken and not stored: a plan records who started it, and who last wrote in it is a
  // fact about a LINE. Two answers to "who last touched this" would be two facts that can disagree.
  void actor
  return mustGetPlan(id)
})

/**
 * Mark the plan as read, now. A PERSON MAY, AND A SECRETARY MAY FOR THEM ONLY UNDER THEIR GRANT.
 *
 * ---------------------------------------------------------------------------------------
 * "I HAVE READ THIS" IS A STATEMENT ABOUT A PERSON, SO AN AGENT IS REFUSED
 * ---------------------------------------------------------------------------------------
 *
 * Marking a plan as read moves `read_at` to now, and `writtenSinceRead` counts from `read_at`. So
 * this one write hides every line written before this moment — including the lines the caller just
 * wrote. An agent that writes to a plan and then marks it read erases the only signal that its
 * writing arrived. That was measured: an agent wrote two lines, the plan correctly said "2 lines
 * written since you read this, by agent:nightly-bot", the agent posted this route, and the plan then
 * said 0. The lines were still there and nothing on any screen said they had come.
 *
 * No agent has a reason to make this claim. It is not a claim about the document, which an agent may
 * change freely; it is a claim about what a person's eyes have been over, and only that person knows.
 *
 * BOTH REFUSALS ARE THE SAME TWO `assertMayWrite` IN lib/records/may-write.ts MAKES for a governance act, and
 * for the same reasons. An agent is refused because it is not the person. A request that sent no
 * actor headers is refused because an absent header is not evidence that a person made it — and a
 * guard that only reads the header would be routed around by dropping it, which is the misspelt
 * header defect again. `stated` is false only for a request that arrived over HTTP with no actor
 * header at all; an in-process caller leaves it undefined and is not affected.
 *
 * ONE `read_at` PER PLAN AND NOT ONE PER READER, which is right while Mole Office has one person in it
 * and would be wrong the day it has two. `reader_anchors` is the table that answers per reader for
 * records, and this is deliberately not that: the whole planning layer is person-level already, so
 * a second reader would change what every one of these tables means and not just this column.
 *
 * ---------------------------------------------------------------------------------------
 * A SECRETARY UNDER THE PERSON'S GRANT, AND THE PLAN SAYS IT WAS THE SECRETARY
 * ---------------------------------------------------------------------------------------
 *
 * The owner made marking a plan as read a door of its own on the list of what the grant carries, `plan.mark-read`, and
 * the secretary card keeps it for the person. Where this office's person lets the grant press it, a secretary may mark a
 * plan as read for them. That is not the person's reading, so the plan stores the secretary's registry id and the grant
 * beside `read_at` (migration 0295), and the plan's page says which secretary marked it. A person's own mark sets both
 * back to null. A secretary the list does not let press it is refused in the check's own words, and every other agent
 * gets the refusal below.
 */
export const markPlanRead = oneWrite(function markPlanRead(id: string, actor: Actor): Plan {
  const plan = mustGetPlan(id)
  // WHAT IS AT STAKE, said the same way in both refusals, because it is the same thing both times.
  const cost =
    'Marking a plan as read hides every line written before this moment, and the lines an agent writes ' +
    'are exactly what that band exists to show.'
  const carried = actor.type === 'agent' && aRaiseCarriesIt(actor)
  const pressed = carried ? whoPressedItUnderTheGrant(actor) : null
  if (carried && pressed === null) {
    throw new PanelError(
      `The person's grant carried this mark for "${actor.id}", but the request has no press, so Mole Office cannot ` +
        'store which secretary marked the plan. Nothing was written. This is a fault in Mole Office.',
      500,
    )
  }
  if (actor.type !== 'human' && pressed === null) {
    throw new PanelError(
      `Only a person can say they have read a plan, and this request came from ${actor.type} ` +
        `"${actor.id}". Nothing was written. ` +
        (plan.readAt === null
          ? 'Nobody has ever marked this plan as read, and that is still true. '
          : `The plan is still marked as read at ${plan.readAt}, so everything written since then is ` +
            'still reported. ') +
        `${cost} An agent marking a plan read hides its own writing. Write what you have to write; the ` +
        'person says when they have read it. A secretary may mark it for them only under their grant, where this ' +
        "office's list of what the grant carries lets the grant press it; the plan then says which secretary marked it.",
      403,
    )
  }
  if (actor.stated === false) {
    throw new PanelError(
      'Only a person can say they have read a plan, and this request sent no actor headers, so nothing ' +
        'said who is asking. Ordinary writes take that as the person typing by hand; this one may not, ' +
        `because an absent header is not evidence that a person read anything. ${cost} Nothing was ` +
        'written. Send x-mole-office-actor-type: human and x-mole-office-actor-id: <who you are>. The browser does ' +
        'this for you; the actor selector in the sidebar is what sets it.',
      403,
    )
  }
  db.update(plansTable)
    .set({ readAt: nowStamp(), readByAgent: pressed?.by.id ?? null, readUnderGrant: pressed?.grant ?? null })
    .where(eq(plansTable.id, id))
    .run()
  return mustGetPlan(id)
})

/** What deleting a whole plan left behind. Nothing canonical was touched by any of it. */
export interface PlanDeleted {
  plan: Plan
  /** How many lines went with it. */
  lines: number
  /** Every line that was filed as work, and what nothing points at from this plan now. */
  removedBindings: RemovedBinding[]
  /** Words about time written on those lines. Not deleted. See `KeptWordsAdrift`. */
  keptWordsAdrift: KeptWordsAdrift[]
  /** Rows elsewhere that still name lines of this plan. See `StillNamesAGoneLine`. */
  stillNamesIt: StillNamesAGoneLine
}

/**
 * Delete a plan and its lines, in one transaction, and say what that left behind.
 *
 * NOTHING CANONICAL IS TOUCHED. Records that lines were filed as stay exactly as they are — they
 * are project truth and were never the plan's to remove — and allocations that came from these
 * lines stay too, because the hours were still given. Those allocations keep the id of a line that
 * is now gone, and a reader of `from_plan_line` that finds nothing must say the line was deleted
 * rather than showing nothing at all.
 *
 * THAT IS EXACTLY WHY IT NOW SAYS SO. Deleting a plan that held ten filed lines used to answer with
 * a count of lines and one sentence promising nothing canonical had gone. True, and not enough: ten
 * pieces of work were left with nothing naming them and nobody was told which ten.
 */
export const deletePlan = oneWrite(function deletePlan(id: string): PlanDeleted {
  const plan = mustGetPlan(id)
  const lines = linesOf(id)
  const adriftOn = keptWordsOfLines(lines.map((line) => line.id))
  const keptWordsAdrift: KeptWordsAdrift[] = lines.flatMap((line) =>
    (adriftOn.get(line.id) ?? []).map((intent) => ({ text: line.text, said: intent.said, intentId: intent.id })),
  )
  const stillNamesIt = stillNamesTheseLines(lines.map((line) => line.id))
  // NO LINE OF THIS PLAN POINTS AT ANYTHING AFTERWARDS, because there is no plan. So the way back is
  // a line of some other plan, or the record itself.
  const removedBindings = bindingsThatLeftThePlan(
    lines,
    new Set<string>(),
    (recordId) =>
      `It is still on file. Read it at GET /api/records/${recordId}, or point a line of another plan at ` +
      `it with PATCH /api/plans/<plan>/lines/<line> and {"recordId":"${recordId}"}.`,
  )
  sqlite.transaction(() => {
    db.delete(planLines).where(eq(planLines.planId, id)).run()
    db.delete(plansTable).where(eq(plansTable.id, id)).run()
  })()
  return { plan, lines: lines.length, removedBindings, keptWordsAdrift, stillNamesIt }
})

// ---------------------------------------------------------------------------- a line's revisions

/**
 * THE THREE WORDS A CHANGE TO A PLAN LINE IS KEPT UNDER. Criterion P3: "Reordering, adding or
 * dropping a line is a revision with a reason and a time." These are that sentence's own three
 * words, so the stored token and the criterion cannot drift apart.
 *
 * AN EDIT TO A LINE'S TEXT IS NOT ONE OF THEM. P3 names three acts and a text edit is not one, so
 * `patchLine` and the writing box write no row here. That gap is deliberate and reported, not
 * hidden: a reader of a line's history is told the ledger starts when it starts.
 */
export const PLAN_LINE_CHANGE_OPS = ['added', 'reordered', 'dropped'] as const
export type PlanLineChangeOp = (typeof PLAN_LINE_CHANGE_OPS)[number]

/** One change to a plan line, as the read-back hands it to a reader. */
export interface PlanLineRevision {
  id: string
  planId: string
  lineId: string
  /** 1-based and per line, so oldest first has an answer even when two changes share a moment. */
  seq: number
  /** `added`, `reordered` or `dropped`. */
  op: PlanLineChangeOp
  /** The writer's own words. Required on the write and never generated. */
  reason: string
  /** LOCAL wall clock. */
  at: string
  /** `${actor.type}:${actor.id}`, the stamp shape every planning table uses. */
  changedBy: string
}

/**
 * WHAT A LINE THAT PREDATES THE TABLE READS BACK WITH. A sentence and never a guess.
 *
 * An empty list on its own would read as "nothing ever happened to this line", which is false for a
 * line somebody added before migration 0170. The sentence says what the absence really means.
 */
export const NO_REVISIONS_YET =
  'No revision of this line is on record. The ledger starts when it starts: a line that was already ' +
  'here before the reasons were kept has none stored, and Mole Office will not invent one for it.'

/**
 * ONE REFUSAL FOR ALL THREE ACTS, because the missing thing and the reason for asking are the same
 * in each. The plan's other refusals are written the same way — what is wrong, then "Nothing was
 * written", then what to send instead — and this follows that shape.
 */
const A_REASON_IS_REQUIRED =
  'A reason is required on every add, reorder and drop of a plan line, and this request sent none: the ' +
  'reason is the part of the change that only the writer can say, and Mole Office keeps it beside the ' +
  "change so whoever reads the line's history can see why it moved. Nothing was written. Send `reason` " +
  'in your own words.'

/**
 * The reason as it will be stored, or the refusal. A reason that is only whitespace is no reason.
 *
 * It is trimmed rather than stored with its padding: the leading and trailing spaces are not part of
 * what somebody meant, and a row holding a space would pass a `!= ''` check while saying nothing.
 */
function checkLineReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim()
  if (trimmed === '') throw new PanelError(A_REASON_IS_REQUIRED)
  return trimmed
}

/**
 * Keep one change, inside the transaction that made it, and give it the next `seq` for that line.
 *
 * The next number is `max(seq) + 1` for THIS line, taken inside the same transaction as the write it
 * belongs to, exactly as `saveRevision` numbers a record's revisions. The unique index on
 * `(line_id, seq)` is what makes two writers unable to agree on one number.
 */
function recordLineRevision(input: {
  planId: string
  lineId: string
  op: PlanLineChangeOp
  reason: string
  at: string
  changedBy: string
}): void {
  const highest = db
    .select({ seq: sql<number | null>`max(${planLineRevisions.seq})` })
    .from(planLineRevisions)
    .where(eq(planLineRevisions.lineId, input.lineId))
    .get()
  db.insert(planLineRevisions)
    .values({
      id: anOfficeId(),
      planId: input.planId,
      lineId: input.lineId,
      seq: (highest?.seq ?? 0) + 1,
      op: input.op,
      reason: input.reason,
      at: input.at,
      changedBy: input.changedBy,
    })
    .run()
}

/**
 * One line's changes, oldest first. A read, and it says nothing it does not hold.
 *
 * It does NOT require the line to still exist: a dropped line's reason has to be readable, which is
 * why `plan_id` and `line_id` carry no foreign key. The route decides whether a line that is gone
 * and has no rows is a 404, so this function never guesses about a line it cannot see.
 */
export function lineRevisionsOf(planId: string, lineId: string): PlanLineRevision[] {
  return db
    .select()
    .from(planLineRevisions)
    .where(and(eq(planLineRevisions.planId, planId), eq(planLineRevisions.lineId, lineId)))
    .all()
    .map((row) => ({
      id: row.id,
      planId: row.planId,
      lineId: row.lineId,
      seq: row.seq,
      op: row.op as PlanLineChangeOp,
      reason: row.reason,
      at: row.at,
      changedBy: row.changedBy,
    }))
    .sort((a, b) => a.seq - b.seq)
}

/** What one line's read-back answers: its changes oldest first, and the sentence to read beside them. */
export interface LineRevisionReadback {
  lineId: string
  revisions: PlanLineRevision[]
  /** The office's own sentence about what the list is, or is not. */
  note: string
}

/**
 * Read one line's changes back, oldest first, with the sentence that makes the list honest.
 *
 * A LINE WITH NO ROWS THAT STILL EXISTS mentions the empty sentence rather than a guess: it predates
 * the table, and saying "nothing ever happened" would be false. A LINE THAT IS GONE AND HAS NO ROWS
 * is a 404 — the route cannot say "the ledger starts when it starts" about a line it has never seen,
 * and a dropped line that DOES have rows keeps them, which is why the existence check only runs when
 * the list is empty.
 */
export function readLineRevisions(planId: string, lineId: string): LineRevisionReadback {
  mustGetPlan(planId)
  const revisions = lineRevisionsOf(planId, lineId)
  if (revisions.length === 0) {
    mustGetLine(planId, lineId)
    return { lineId, revisions, note: NO_REVISIONS_YET }
  }
  return {
    lineId,
    revisions,
    note:
      `${revisions.length} change${revisions.length === 1 ? '' : 's'} to this line ` +
      `${revisions.length === 1 ? 'is' : 'are'} on record, oldest first. Each carries who made it, ` +
      'when, what kind of change it was and the reason they gave.',
  }
}

// ---------------------------------------------------------------------------- writing lines

/** One line as the caller sends it. An `id` means "this is the line you already have". */
export interface LineInput {
  id?: string
  text: string
  remark?: string | null
}

/**
 * THE WORDS TO STORE FOR A LINE, ONCE THE NOTE HAS BEEN PUT WHERE THE NOTE LIVES.
 *
 * `remark` is still the word the API uses for a line's note, because that is what the box on the
 * screen is called. What changed is where it goes: into the line's own words, as a `{note: …}`
 * group, rather than into a column nothing can see from the writing box.
 *
 * SENDING `remark` DECIDES THE NOTE, and it replaces whatever note the sent text already carried —
 * one request, one answer, rather than two statements about one note in one body. Leaving `remark`
 * out leaves the text exactly as sent, note and all.
 *
 * An empty note is no note: the group comes off. A note holding a curly bracket or a line ending
 * cannot be written into a line at all, and that is refused here rather than stored broken.
 */
function textWithNote(text: string, remark: string | null | undefined, what: string): string {
  if (remark === undefined) return text
  if (remark !== null) {
    const why = whyNoteCannotBeWritten(remark)
    if (why !== null) throw new PanelError(`${what} ${why} Nothing was written.`)
  }
  return lineWithNote(text, remark)
}

function mustGetLine(planId: string, lineId: string): PlanLine {
  const row = db
    .select()
    .from(planLines)
    .where(and(eq(planLines.id, lineId), eq(planLines.planId, planId)))
    .get()
  if (row === undefined) throw new PanelError(`No line "${lineId}" is in the plan "${planId}".`, 404)
  return toLine(row)
}

/**
 * Write the whole document: the lines that are there afterwards are exactly the ones sent.
 *
 * This is what saving an edited plan does, and it is one transaction, so a save cannot half happen.
 *
 * TWO THINGS IT IS CAREFUL ABOUT, and both are about telling a reader the truth later:
 *
 *   - A LINE SENT WITH AN ID KEEPS ITS RECORD. Editing the words of a filed line does not unfile it
 *     and does not touch the record — that is the whole point of the link being a column.
 *   - A LINE THAT DID NOT CHANGE IS NOT RESTAMPED. `updated_at` and `updated_by` are what "changed
 *     since you read this" is computed from, so restamping every line on every save would report
 *     the whole document as written by whoever pressed Done.
 */
export const writeLines = oneWrite(function writeLines(
  planId: string,
  incoming: readonly LineInput[],
  actor: Actor,
  ifVersion?: string,
  reason?: string,
): PlanLine[] {
  mustGetPlan(planId)
  refuseStaleWrite(planId, ifVersion, actor)
  const before = linesOf(planId)
  const existing = new Map(before.map((line) => [line.id, line]))
  const stamp = nowStamp()
  const by = stampOf(actor)

  const seen = new Set<string>()
  // THE WORDS TO STORE, WORKED OUT BEFORE ANYTHING IS WRITTEN, because a note that cannot go into a
  // line refuses the whole document rather than half of it.
  const texts: string[] = []
  for (const line of incoming) {
    checkLineText(line.text, 'One of the lines sent')
    texts.push(textWithNote(line.text, line.remark, 'One of the notes sent cannot be stored.'))
    if (line.id === undefined) continue
    if (!existing.has(line.id)) {
      throw new PanelError(
        `The line "${line.id}" is not in this plan, so Mole Office will not write it. Nothing was saved. Send a ` +
          'line with no id to add one.',
        404,
      )
    }
    if (seen.has(line.id)) {
      throw new PanelError(`The line "${line.id}" was sent twice. Nothing was saved.`)
    }
    seen.add(line.id)
  }

  // ---------------------------------------------------------------------------------------
  // WHAT THIS WRITE REALLY IS: AN ADD, A DROP, A REORDER, OR ONLY AN EDIT OF WORDS
  // ---------------------------------------------------------------------------------------
  //
  // P3 names three acts and asks a reason for each. A line with no id is being added. An existing
  // line whose id is not sent is being dropped. An existing line has been reordered when its place
  // AMONG THE SURVIVORS differs from its place before — a line shifted up only because a neighbour
  // was dropped did not move relative to the others and is not a reorder. A text edit is none of
  // the three, and a write that only edits words needs no reason and keeps no revision.
  const added = incoming.map((line) => (line.id === undefined ? anOfficeId() : undefined))
  const droppedIds = before.filter((line) => !seen.has(line.id)).map((line) => line.id)
  const beforeSurvivors = before.map((line) => line.id).filter((id) => seen.has(id))
  const afterSurvivors = incoming.filter((line) => line.id !== undefined).map((line) => line.id!)
  const movedIds = new Set(afterSurvivors.filter((id, index) => beforeSurvivors[index] !== id))
  const isARevision = added.some((id) => id !== undefined) || droppedIds.length > 0 || movedIds.size > 0
  const changeReason = isARevision ? checkLineReason(reason) : null

  sqlite.transaction(() => {
    for (const id of droppedIds) {
      db.delete(planLines).where(eq(planLines.id, id)).run()
      recordLineRevision({ planId, lineId: id, op: 'dropped', reason: changeReason!, at: stamp, changedBy: by })
    }
    incoming.forEach((line, index) => {
      const position = index + 1
      const text = texts[index]!
      if (line.id === undefined) {
        const id = added[index]!
        db.insert(planLines)
          .values({
            id,
            planId,
            position,
            text,
            recordId: null,
            // The column is dead: db/plan-note-migration.ts emptied it. See `toLine`.
            remark: null,
            updatedAt: stamp,
            updatedBy: by,
          })
          .run()
        recordLineRevision({ planId, lineId: id, op: 'added', reason: changeReason!, at: stamp, changedBy: by })
        return
      }
      const was = existing.get(line.id)!
      const changed = was.text !== text || was.position !== position
      if (!changed) return
      db.update(planLines)
        .set({ position, text, updatedAt: stamp, updatedBy: by })
        .where(eq(planLines.id, line.id))
        .run()
      if (movedIds.has(line.id)) {
        recordLineRevision({
          planId,
          lineId: line.id,
          op: 'reordered',
          reason: changeReason!,
          at: stamp,
          changedBy: by,
        })
      }
    })
    db.update(plansTable).set({ updatedAt: stamp }).where(eq(plansTable.id, planId)).run()
  })()

  return linesOf(planId)
})

/**
 * A line that is gone and was bound to a record. The record itself was not touched.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS SAYS SO MUCH: RENAMING A FILED LINE TOOK REAL WORK AWAY AND SAID NOTHING USEFUL
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 16 August 2026. A reader renamed a line that was filed as work, saved, and reloaded.
 * The row had lost its record, its estimate of 3 hours and its allocation on 2026-08-18, and the
 * plan's total fell from 9 hours to 6. The hours were still in the schedule under the record's old
 * name and the plan could no longer reach them. The reply said which record the line had named and
 * nothing about what that cost, and there was no way back.
 *
 * RENAMING A LINE NO LONGER COSTS ANYTHING. That rule was reversed on 17 August 2026 and
 * `writeBody` states the whole construction: a line rewritten in place keeps its row, so it keeps
 * its record. What is left here is the case Mole Office genuinely cannot follow — a line removed with no
 * single line standing where it stood, a line deleted outright, a whole plan deleted — and for those
 * the loss is named rather than left to be discovered.
 *
 * TWO THINGS:
 *
 *   - `lost` names the values this plan could reach through the binding and cannot reach now — the
 *     estimate, the hours on every period, the project — read from the SAME function that says what
 *     a line shows, so the two cannot come to disagree about what a binding is worth.
 *   - `putItBack` says what was lost and how to get it back, in words, for whoever is reading.
 *
 * THERE USED TO BE A THIRD, `putItBackOn`, and it has become the rule instead of an offer. It named
 * the one line a removed record could be pointed at again, on exactly the shape — one line removed
 * and one added between the same two unchanged lines — that now keeps the binding without anybody
 * pressing anything. A field that could only ever be null afterwards is padding, so it is gone.
 */
export interface RemovedBinding {
  /** The words that were on the line, so the page can name it without inventing a name. */
  text: string
  recordId: string
  /** The record's title now, or null when the record it named has been deleted. */
  title: string | null
  /**
   * What this plan reached through that binding and cannot reach any more: the record's estimate,
   * the hours it holds on every period, and the project it sits in.
   *
   * NOTHING HERE WAS DELETED. Every one of these is still on the record, exactly as it was; what
   * changed is that no line of this plan points at it, so the plan's own columns and totals no
   * longer see it. Empty when the record itself is gone, which is a different loss and is said in
   * `putItBack`, and empty when another line of this plan still points at the same record, because
   * then the plan reaches all of it still.
   */
  lost: { key: PlanLineFact; says: string }[]
  /** What was lost and how to put it back, in plain words. Always there. */
  putItBack: string
}

/**
 * WHAT THE PLAN LOST WHEN THESE LINES WENT, said once for every path that can lose it.
 *
 * Three paths take a bound line out of a plan — saving a document without it, removing one line,
 * and deleting the whole plan — and until 17 August 2026 only the first one said so. The other two
 * were silent, which is the fifth invariant broken by a delete button. They now answer this, and
 * they answer it from this one function rather than from three sentences that could drift apart.
 *
 * `stillNamed` is the records that a line of this plan STILL points at after the write. Nothing
 * forbids two lines naming one record, so "no line of this plan points at it now" is a sentence that
 * can be false, and Mole Office does not print sentences it has not checked.
 *
 * `wayBack` is the caller's own sentence saying how to point a line at this record again, because
 * the answer differs: a plan that still exists has lines to point, and a plan that has just been
 * deleted has none.
 */
function bindingsThatLeftThePlan(
  gone: readonly PlanLine[],
  stillNamed: ReadonlySet<string>,
  wayBack: (recordId: string) => string,
): RemovedBinding[] {
  const goneAndBound = gone.filter((line): line is PlanLine & { recordId: string } => line.recordId !== null)
  if (goneAndBound.length === 0) return []
  const work = resolveAllocated(goneAndBound)
  // WHAT EACH PROJECT IS CALLED, read only when something bound was removed, because a plan that
  // lost nothing has nothing to name. Same registry `linesWithWork` reads, for the same reason.
  const projectNames = new Map(listWorkspaces().map((one) => [one.id, one.title]))
  return goneAndBound.map((line) => {
    const held = work.get(line.recordId) ?? null
    const alsoOnAnotherLine = stillNamed.has(line.recordId)
    // THE VALUES COME FROM `derivedValuesOf`, which is the same function that says what a line shows
    // while it IS bound. One reader, so "what this line reaches" and "what this line just stopped
    // reaching" cannot come to mean different things. The kept words are passed as none on purpose:
    // those are the person's own words about time, they belong to the line rather than to the
    // record, and `keptWordsAdrift` beside this reports them without saying it twice.
    const lost =
      held === null || alsoOnAnotherLine
        ? []
        : derivedValuesOf(held, allocationsOf(line.recordId), [], projectNames).map((one) => ({
            key: one.key,
            says: one.says,
          }))
    const name = held === null ? line.recordId : `"${held.title}"`
    const said = lost.map(sayLost)
    const listed = said.length <= 1 ? (said[0] ?? '') : `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]!}`
    const putItBack =
      held === null
        ? `The line pointed at ${line.recordId} and no record has that id now, so there is nothing to ` +
          'point a line at. Nothing here deleted it.'
        : alsoOnAnotherLine
          ? `${name} was on that line and is still on another line of this plan, so the plan still reaches ` +
            'everything it holds. Nothing left the plan.'
          : `${name} is not on any line of this plan now. ` +
            (lost.length === 0
              ? 'Nothing was stored on it, so no numbers left this plan with it. '
              : `This plan can no longer reach ${listed}. All of it is still on the work and unchanged. `) +
            (held.deleted
              ? 'That work has been deleted, so no line can point at it. Restore it first if the plan is right.'
              : wayBack(line.recordId))
    return { text: line.text, recordId: line.recordId, title: held?.title ?? null, lost, putItBack }
  })
}

/** The records that lines of a plan still point at. See `bindingsThatLeftThePlan`. */
function recordsStillNamedBy(lines: readonly PlanLine[]): Set<string> {
  const named = new Set<string>()
  for (const line of lines) {
    if (line.recordId !== null) named.add(line.recordId)
  }
  return named
}

/** How to point a line of this plan at a record again, in the sentence a reader can act on. */
function pointALineAtItAgain(planId: string, recordId: string): string {
  return `Point a line at it again with PATCH /api/plans/${planId}/lines/<line> and {"recordId":"${recordId}"}.`
}

/**
 * WORDS SOMEBODY WROTE ABOUT TIME ON A LINE THAT THIS SAVE TOOK OUT OF THE DOCUMENT.
 *
 * They are NOT deleted. Nobody asked for them to be, and a save quietly throwing away a person's
 * own sentence is exactly the loss this whole layer exists to prevent. What changes is where they
 * can be seen: the line they were written on is gone, so the plan cannot draw them any more, and
 * the schedule's list of what somebody wrote about time is where they are now.
 *
 * SAYING SO IS THE POINT. `removedBindings` beside this reports the same kind of loss for a record
 * binding, and it exists for the same reason: a save that changed something the writer cannot see
 * is the fifth invariant broken by a text box.
 */
export interface KeptWordsAdrift {
  /** The words of the line they were written on, as that line last read. */
  text: string
  /** What the person wrote about time. */
  said: string
  /** The id, which still reaches them — to read, or to remove. */
  intentId: string
}

/** What writing the whole document did. */
export interface BodyWritten {
  lines: PlanLine[]
  /** Lines that were bound to work and are no longer in the document. The work still exists. */
  removedBindings: RemovedBinding[]
  /**
   * Words about time that were written on lines this save removed. Empty in the ordinary case.
   *
   * A line that was filed as work and rewritten in place keeps its row, so its words about time stay
   * on it. A line that was really removed takes its row with it, and the words that were written on
   * that row are then attached to nothing in this plan — not deleted, and reported here so that
   * nobody has to find out by looking. See `KeptWordsAdrift`.
   *
   * A LINE THAT WAS NEVER FILED IS A DIFFERENT CASE, and its words do go adrift when it is rewritten,
   * because only a bound row is carried across an edit. That is stated here rather than hidden: the
   * rule carries work, and words about time on a line nobody filed are not work yet.
   */
  keptWordsAdrift: KeptWordsAdrift[]
  /** How many stored rows the new text kept, added and removed. */
  kept: number
  added: number
  removed: number
  /** How many of the document's line endings were written with a carriage return. */
  carriageReturns: number
}

/**
 * WHAT MAKES A LINE THE SAME LINE WHEN A WHOLE DOCUMENT IS SAVED: ITS WORDS, WITHOUT THE GROUPS.
 *
 * ---------------------------------------------------------------------------------------
 * THE PLANNING GROUPS ARE NOT PART OF A LINE'S IDENTITY, AND THIS IS WHY
 * ---------------------------------------------------------------------------------------
 *
 * The note used to be a column, and saving a document destroyed it silently. It moved into the
 * line's own words to fix that. But `writeBody` matched stored rows against the new text by their
 * WHOLE text, so the moment the note was part of that text, writing a note made the line look like a
 * different line: the row was deleted, a new one was inserted in its place, and THE RECORD BINDING
 * WENT WITH IT. That is problem `6DIqEdKWuMgN` arriving through the door that was built to close it.
 *
 * So a line is the same line when its WORDS are the same — the line with its trailing run of
 * `{key: value}` groups taken off, which is exactly what `parsePlanLine` hands back as `text`.
 * Adding a note, changing a size, or taking a promoted group off a line does not unbind it.
 *
 * THIS IS NOT MATCHING BY SIMILARITY, which src/shared/plandiff.ts exists to refuse. Two lines match
 * only when their words are the same CHARACTER FOR CHARACTER. What is left out of the comparison is
 * not "a bit of difference" — it is a run of groups with its own parser, which the Table draws as
 * fields rather than as writing, and which filing a line MOVES OUT of the text on its own.
 *
 * ONE EDGE, SAID PLAINLY RATHER THAN HIDDEN. Spaces typed before a group belong to the group, so a
 * line whose words end in spaces changes its identity the first time somebody adds a group to it:
 * `- baseline   ` has the words `- baseline   ` and `- baseline   {size: 2h}` has the words
 * `- baseline`. That line loses its binding, and the loss is REPORTED in `removedBindings`. It is
 * the safe direction of the two: trimming the ends to hide it would let a binding survive a real
 * edit to somebody's words, and nothing would say so.
 */
function wordsOfLine(text: string): string {
  return parsePlanLine(text).text
}

/**
 * WHICH STORED ROW EACH LINE OF THE SAVED DOCUMENT IS, INCLUDING THE ROWS WHOSE WORDS WERE REWRITTEN.
 *
 * ---------------------------------------------------------------------------------------
 * THE OLD RULE WAS REVERSED ON 17 AUGUST 2026, AND THIS IS THE WHOLE OF THE NEW ONE
 * ---------------------------------------------------------------------------------------
 *
 * The old rule was that a line whose words changed was a line removed and a line added, so the work
 * filed on it came off. That was deliberate, it was tested so nobody would "fix" it with a
 * similarity match, and it is now the other way: a filed or bound line keeps its canonical work
 * when only its visible words change, because editing the words is a normal part of planning
 * (design/ROUND-SEVEN-OWNER-MESSAGE.md, section 5).
 *
 * MATCHING BY SIMILARITY IS STILL FORBIDDEN AND NOTHING HERE DOES IT. The construction is in two
 * passes and the order is what makes it safe:
 *
 *   1. `matchLines` runs first, on the exact characters of the words. Every line whose words did not
 *      change is paired with its stored row, wherever it moved to.
 *   2. Then, and only for the stored rows that pass left over, `replacedInPlace` reads the shape of
 *      that alignment: between the two nearest lines that did not change, was exactly one line
 *      removed and exactly one line added? Where it was, the row is carried onto the new line.
 *
 * PASS TWO IS A POSITIONAL FACT AND NOT A GUESS ABOUT WORDS. It says "one line was replaced by one
 * line, in the same place". It never compares two lines, so it cannot be fooled by a resemblance and
 * it does not need one: a line rewritten from end to end keeps its work, and a line that merely looks
 * like another one gets nothing.
 *
 * WHERE MORE THAN ONE LINE CHANGED IN THE SAME PLACE, NOTHING IS CARRIED. Two lines rewritten between
 * the same two unchanged lines could have been swapped, merged or split, and Mole Office cannot tell which
 * is which. Both bindings are dropped and both are reported, exactly as they were before this change.
 * That is the fifth invariant: absence rather than a guess.
 *
 * IT CARRIES A BINDING AND NOTHING ELSE. A stored row with no record on it is left to the first pass,
 * so what a save counts as kept, added and removed is what it always counted. This pass exists to
 * stop real work falling off a plan, and it does the least that achieves that.
 */
function rowForEachLine(storedLines: readonly PlanLine[], words: readonly string[]): (number | null)[] {
  const match = matchLines(storedLines.map((line) => wordsOfLine(line.text)), words)
  // `replacedInPlace` answers only for stored rows the first pass matched to nothing, so a row is
  // never claimed twice and the new line it names is never one the first pass already spoke for.
  for (const [storedIndex, newIndex] of replacedInPlace(match, storedLines.length)) {
    if (storedLines[storedIndex]!.recordId === null) continue
    match[newIndex] = storedIndex
  }
  return match
}

/**
 * ONE VALUE THE PLAN CAN NO LONGER REACH, in the words of a sentence about losing it.
 *
 * `says` is the value as a screen draws it — "3 hours", "3 hours in 2026-08-18", "Greenhouse" — and
 * on its own in a list it does not say what kind of thing it is. This is the one place that puts a
 * word in front of it, and it is keyed on `PlanLineFact` so a fourth kind of value fails the type
 * check here rather than quietly reading as bare text.
 */
function sayLost(one: { key: PlanLineFact; says: string }): string {
  if (one.key === 'size') return `an estimate of ${one.says}`
  if (one.key === 'time') return one.says
  return `the project ${one.says}`
}

/**
 * WRITE THE WHOLE DOCUMENT AS ONE PIECE OF TEXT, KEEPING THE ROW OF EVERY LINE THAT DID NOT CHANGE.
 *
 * A plan is written in one text box, so a save is one document. A plan is STORED as rows, because a
 * line carries the record it was filed as. This is what joins the two.
 *
 * WHICH ROW EACH LINE IS COMES FROM `rowForEachLine` ABOVE, which states the rule in full and is
 * where to argue with it. In short:
 *
 *   - a line whose words are unchanged keeps its row and its record, wherever it moved;
 *   - a line that was filed as work and was rewritten IN PLACE — one line removed and one added
 *     between the same two unchanged lines — keeps its row, so it keeps its work;
 *   - a line that was not there before is a new row, bound to nothing;
 *   - a line that is not there any more is deleted, and if it was bound to work its record is
 *     reported back so the page can say so. THE RECORD ITSELF IS NEVER TOUCHED — it is project
 *     truth and was never this plan's to remove.
 *
 * SO EDITING THE WORDS OF A FILED LINE NO LONGER COSTS THE WORK. Where two lines changed in the same
 * place Mole Office still cannot say which is which, so the bindings there are dropped and named in
 * `removedBindings` — the honest cost of refusing to guess, now paid only where the guess would be
 * real.
 *
 * THE GROUPS ARE STORED AS SENT, ON EVERY LINE, MATCHED OR NOT. The text box is the document: a note
 * typed into it is stored, and a note deleted from it is deleted, because it is the person's own
 * writing either way. Keeping the stored groups over the sent ones would make the box unable to
 * change a note that is written in the box, which is the same note held in two places again.
 *
 * A LINE WHOSE TEXT DID NOT CHANGE IS NOT RESTAMPED, not even when it moved. `updated_at` is what
 * "written since you read this" counts, and it means when these words were last written; a line
 * that was pushed down by an insert above it was not written by the person who typed the insert. A
 * line whose groups DID change was written, so it is restamped: somebody typed that.
 */
export const writeBody = oneWrite(function writeBody(planId: string, body: string, actor: Actor, ifVersion?: string): BodyWritten {
  mustGetPlan(planId)
  refuseStaleWrite(planId, ifVersion, actor)
  const stored = linesOf(planId)
  const document = linesOfDocument(body)
  const texts = document.texts
  // THE SAME BUDGET AS ONE LINE, PER LINE, BEFORE ANYTHING IS WRITTEN. This is the door the writing
  // box saves through, so without it a whole document would be the way around the rule.
  for (const text of texts) checkLineBudget(text, 'A line of the document')
  const match = rowForEachLine(stored, texts.map(wordsOfLine))

  const keptIds = new Set<string>()
  for (const from of match) {
    if (from !== null) keptIds.add(stored[from]!.id)
  }
  const gone = stored.filter((line) => !keptIds.has(line.id))
  // WORDS ABOUT TIME ON THE LINES THIS SAVE REMOVES, read BEFORE the rows go. They are not deleted
  // and they are not moved onto some other line: nothing here knows which line the writer meant,
  // and guessing would put somebody's sentence against work they never wrote it about.
  const adriftOn = keptWordsOfLines(gone.map((line) => line.id))
  const keptWordsAdrift: KeptWordsAdrift[] = gone.flatMap((line) =>
    (adriftOn.get(line.id) ?? []).map((intent) => ({
      text: line.text,
      said: intent.said,
      intentId: intent.id,
    })),
  )

  const stamp = nowStamp()
  const by = stampOf(actor)

  sqlite.transaction(() => {
    for (const line of gone) db.delete(planLines).where(eq(planLines.id, line.id)).run()
    texts.forEach((text, index) => {
      const position = index + 1
      const from = match[index]
      if (from === null || from === undefined) {
        db.insert(planLines)
          .values({
            id: anOfficeId(),
            planId,
            position,
            text,
            recordId: null,
            remark: null,
            updatedAt: stamp,
            updatedBy: by,
          })
          .run()
        return
      }
      const was = stored[from]!
      // THE SAME LINE, AND ITS GROUPS MAY STILL HAVE BEEN WRITTEN. The words matched; the run of
      // groups at the end of them is stored as sent, and a line whose text really changed is
      // restamped because somebody typed that. A line that only moved is not.
      if (was.text !== text) {
        db.update(planLines)
          .set({ position, text, updatedAt: stamp, updatedBy: by })
          .where(eq(planLines.id, was.id))
          .run()
        return
      }
      if (was.position === position) return
      db.update(planLines).set({ position }).where(eq(planLines.id, was.id)).run()
    })
    db.update(plansTable).set({ updatedAt: stamp }).where(eq(plansTable.id, planId)).run()
  })()

  // WHAT EACH LOST BINDING COST, worked out after the write, from the rows the plan holds now: a
  // record another line still points at has not left this plan, and only the saved document can say
  // whether one does.
  const now = linesOf(planId)
  const removedBindings = bindingsThatLeftThePlan(gone, recordsStillNamedBy(now), (recordId) =>
    pointALineAtItAgain(planId, recordId),
  )

  const kept = keptIds.size
  return {
    lines: now,
    removedBindings,
    keptWordsAdrift,
    kept,
    added: texts.length - kept,
    removed: gone.length,
    carriageReturns: document.carriageReturns,
  }
})

/**
 * Add one line, either at the end or straight after a line that is already there.
 *
 * The new position is the midpoint between the line it follows and the next one, which is what
 * `position` being a real number buys: inserting in the middle of a long document rewrites one row
 * rather than all of them.
 */
export const addLine = oneWrite(function addLine(
  planId: string,
  input: { text: string; remark?: string | null; afterLineId?: string; reason?: string },
  actor: Actor,
  ifVersion?: string,
): PlanLine {
  mustGetPlan(planId)
  refuseStaleWrite(planId, ifVersion, actor)
  // THE REASON FIRST, before the words are even checked: a request that cannot be kept should be
  // refused for the missing thing it was asked for, not for a second fault behind it.
  const reason = checkLineReason(input.reason)
  checkLineText(input.text, 'The line sent')
  const text = textWithNote(input.text, input.remark, 'The note sent cannot be stored.')
  const lines = linesOf(planId)
  let position: number
  if (input.afterLineId === undefined) {
    position = lines.length === 0 ? 1 : lines[lines.length - 1]!.position + 1
  } else {
    const at = lines.findIndex((line) => line.id === input.afterLineId)
    if (at === -1) throw new PanelError(`No line "${input.afterLineId}" is in the plan "${planId}".`, 404)
    const before = lines[at]!.position
    const next = lines[at + 1]
    position = next === undefined ? before + 1 : (before + next.position) / 2
    if (position === before || position === next?.position) {
      throw new PanelError(
        'There is no room left between those two lines for another one. Save the whole document, which ' +
          'numbers the lines again from the top, and then add this line.',
        409,
      )
    }
  }
  const stamp = nowStamp()
  const by = stampOf(actor)
  const row: LineRow = {
    id: anOfficeId(),
    planId,
    position,
    text,
    recordId: null,
    // The column is dead: db/plan-note-migration.ts emptied it. The note is in the words. See `toLine`.
    remark: null,
    updatedAt: stamp,
    updatedBy: by,
  }
  sqlite.transaction(() => {
    db.insert(planLines).values(row).run()
    recordLineRevision({ planId, lineId: row.id, op: 'added', reason, at: stamp, changedBy: by })
    db.update(plansTable).set({ updatedAt: stamp }).where(eq(plansTable.id, planId)).run()
  })()
  return toLine(row)
})

/**
 * Change one line's words or its note. The record it names is not touched.
 *
 * THE NOTE IS PART OF THE WORDS, so changing it changes the line's text — that is the point of the
 * change, and it is what makes a note survive an edit. A request sending both new words and a note
 * gets the note written into those new words.
 */
export const patchLine = oneWrite(function patchLine(
  planId: string,
  lineId: string,
  patch: { text?: string; remark?: string | null },
  actor: Actor,
  ifVersion?: string,
): PlanLine {
  mustGetPlan(planId)
  refuseStaleWrite(planId, ifVersion, actor)
  const line = mustGetLine(planId, lineId)
  if (patch.text !== undefined) checkLineText(patch.text, 'The words sent for this line')
  const stamp = nowStamp()
  const next: Partial<LineRow> = { updatedAt: stamp, updatedBy: stampOf(actor) }
  const words = patch.text === undefined ? line.text : patch.text
  if (patch.text !== undefined || 'remark' in patch) {
    next.text = textWithNote(words, 'remark' in patch ? (patch.remark ?? null) : undefined, 'That note cannot be stored.')
  }
  sqlite.transaction(() => {
    db.update(planLines).set(next).where(eq(planLines.id, lineId)).run()
    db.update(plansTable).set({ updatedAt: stamp }).where(eq(plansTable.id, planId)).run()
  })()
  return mustGetLine(planId, lineId)
})

/**
 * ROWS ELSEWHERE THAT STILL NAME A PLAN LINE THAT HAS BEEN REMOVED.
 *
 * Two columns hold a plan line's id and neither is a foreign key, on purpose, stated in the schema:
 * `allocations.from_plan_line` in db/schema-parts/planning.ts says where hours came from, and
 * `planning_intents.plan_line_id` in db/schema-parts/planning.ts says which line somebody wrote about time on.
 * Removing the line leaves both pointing at a row that is gone.
 *
 * NOTHING IS REPAIRED AND NOTHING IS DELETED. The hours were still given and the words were still
 * written, so clearing either column would be Mole Office destroying a fact because a different fact
 * moved. What was missing is that nobody was told, and this is what tells them.
 */
export interface StillNamesAGoneLine {
  /**
   * Hours that were given from this line. They are still given, on the same work, in the same
   * period; what changed is that the line they came from is no longer there to read.
   */
  allocations: { id: string; recordId: string; horizon: string; period: string; plannedHours: number | null }[]
  /**
   * What somebody wrote about time on this line, in their own words, including any that have since
   * become hours. `state` says which: `committed` words are an allocation's account of where it came
   * from, and the other two are words nobody has scheduled anything from.
   */
  keptWords: { intentId: string; said: string; state: string }[]
}

/** Every row that still names these plan lines. See `StillNamesAGoneLine`. */
function stillNamesTheseLines(lineIds: readonly string[]): StillNamesAGoneLine {
  if (lineIds.length === 0) return { allocations: [], keptWords: [] }
  // IN PIECES (src/server/db/in-pieces.ts): deleting a plan names every line of it, and nothing caps
  // how many lines a plan has. Neither read has an ORDER BY, so the order was SQLite's before and is
  // SQLite's within each piece now, the pieces following the plan's lines. All the rows of one line
  // are in one piece, and both reads stay inside the delete's transaction.
  const allocations = readInPieces(lineIds, (piece) =>
    db.select().from(allocationsTable).where(inArray(allocationsTable.fromPlanLine, piece)).all(),
  ).map((row) => ({
    id: row.id,
    recordId: row.recordId,
    horizon: row.horizon,
    period: row.period,
    plannedHours: row.plannedHours,
  }))
  const keptWords = readInPieces(lineIds, (piece) =>
    db.select().from(planningIntents).where(inArray(planningIntents.planLineId, piece)).all(),
  ).map((row) => ({ intentId: row.id, said: row.said, state: row.state }))
  return { allocations, keptWords }
}

/** What removing one line left behind. Nothing canonical was touched by any of it. */
export interface LineRemoved {
  /** The line as it last read, so a reply can say what was removed. */
  line: PlanLine
  /**
   * The work this line was filed as, when it was filed as any, and what the plan can no longer reach
   * through it. At most one entry, and empty for a line nobody had filed.
   *
   * THE WORK IS ALIVE AND THAT IS RIGHT. A plan is a document about work, not the work itself, so
   * taking a line out of a document has never been a reason to delete a record. Until 17 August 2026
   * this path said nothing at all, which left "the work is still tracked, it is just not on this
   * plan" as something a person had to work out for themselves.
   */
  removedBindings: RemovedBinding[]
  /** Words about time that were written on this line. Not deleted. See `KeptWordsAdrift`. */
  keptWordsAdrift: KeptWordsAdrift[]
  /** Rows elsewhere that still name this line by its id. See `StillNamesAGoneLine`. */
  stillNamesIt: StillNamesAGoneLine
}

/**
 * Remove one line, and say what that left behind.
 *
 * The record it was filed as is not touched, for the reason `deletePlan` gives: it is project truth
 * and was never this plan's to remove. What this answers is the rest of that sentence — which work
 * is still tracked and no longer on this plan, which of the person's own words about time are now
 * attached to no line, and which rows still name the line that has gone.
 */
export const deleteLine = oneWrite(function deleteLine(planId: string, lineId: string, actor: Actor, reason?: string): LineRemoved {
  mustGetPlan(planId)
  const line = mustGetLine(planId, lineId)
  // THE REASON BEFORE ANYTHING IS READ, so a request with nothing to keep is refused before it does
  // work it will throw away.
  const keptReason = checkLineReason(reason)
  // READ BEFORE THE ROW GOES, all of it. Afterwards there is no line to read these from, and a
  // reply that said nothing because it asked too late would be the silence this is here to end.
  const keptWordsAdrift: KeptWordsAdrift[] = keptWordsOfLine(lineId).map((intent) => ({
    text: line.text,
    said: intent.said,
    intentId: intent.id,
  }))
  const stillNamesIt = stillNamesTheseLines([lineId])
  const stamp = nowStamp()
  const by = stampOf(actor)
  sqlite.transaction(() => {
    db.delete(planLines).where(eq(planLines.id, lineId)).run()
    recordLineRevision({ planId, lineId, op: 'dropped', reason: keptReason, at: stamp, changedBy: by })
    db.update(plansTable).set({ updatedAt: stamp }).where(eq(plansTable.id, planId)).run()
  })()
  const removedBindings = bindingsThatLeftThePlan([line], recordsStillNamedBy(linesOf(planId)), (recordId) =>
    pointALineAtItAgain(planId, recordId),
  )
  return { line, removedBindings, keptWordsAdrift, stillNamesIt }
})

// ---------------------------------------------------------------------------- the three crossings

/**
 * Where the plan puts this line, in the three answers there are.
 *
 * `not an item` and `nothing above` are different facts and are kept apart. A paragraph written
 * under a heading is NOT at the top of the document — the tree simply does not place it, because
 * prose is the writing between the items rather than an item. Saying "nothing is above this line"
 * about it would be a false sentence on a screen.
 */
type ItemAbove =
  | { placed: 'not an item' }
  | { placed: 'nothing above' }
  | {
      placed: 'under'
      /** The words of the item above, with the hashes or the bullet taken off. */
      text: string
      /** The record that item was filed as, or null because nobody has filed it. */
      recordId: string | null
    }

/**
 * One item written DIRECTLY under a line, and what the plan already knows about it.
 *
 * It is here because a person planning coarse to fine writes the detail before the heading as often
 * as the other way round, so filing a line has to look down as well as up.
 */
interface ItemBelow {
  /** Its words, with the hashes or the bullet taken off. */
  text: string
  /** The record it is already filed as, or null because nobody has filed it. */
  recordId: string | null
  /** How many items under IT, at any depth, are already filed as work. */
  filedDeeper: number
}

/** Where the plan puts one line: its own item, the item above it, and the items under it. */
interface PlaceInPlan {
  /** This line's own item, or null when the line is prose, a blank line or part of a table. */
  mine: OutlineItem | null
  above: ItemAbove
  /** The items written directly under this line, in the order they are written. */
  below: readonly ItemBelow[]
}

/** How many items under this one, at any depth, are already filed as work. */
function filedUnder(item: OutlineItem, filedAs: (one: OutlineItem) => string | null): number {
  let count = 0
  for (const child of item.children) {
    if (filedAs(child) !== null) count += 1
    count += filedUnder(child, filedAs)
  }
  return count
}

/**
 * Where the plan puts this line, worked out from the words of the plan.
 *
 * ONE PARSER AND ONE TREE. The blocks come from `blocksOf` and the tree from `outlineOf`, which are
 * the same two functions the writing page and the table read, so the parent Mole Office links to is the
 * parent the person can see on screen. Nothing here stores a level or a parent.
 *
 * TWO ANSWERS FROM ONE READ, deliberately. The new record's title comes from `mine` and the parent
 * link comes from `above`, and both are the same parse. Reading the line's own words a second way —
 * by trimming the stored text — is what made a reply say the line was "- the tray clamp" in its
 * title and "the tray clamp" in its `under.text`, about the one line, in the one answer.
 *
 * IT LOOKS AT THE IMMEDIATE PARENT AND NO FURTHER, and at the immediate children and no deeper. A
 * heading two levels up is not what the document says this line is part of, and a grandchild is
 * what the document says its own parent holds.
 */
function placeInPlan(lines: readonly PlanLine[], lineId: string): PlaceInPlan {
  const blocks = blocksOf(lines.map((line) => ({ id: line.id, text: line.text })))
  const flat = flattenOutline(outlineOf(blocks))
  const found = flat.find((row) => row.item.lineIds.includes(lineId))
  if (found === undefined) return { mine: null, above: { placed: 'not an item' }, below: [] }
  const mine = found.item
  const byId = new Map(lines.map((line) => [line.id, line]))
  /** The record one item is already filed as: the first of its lines that names one. */
  const filedAs = (item: OutlineItem): string | null => {
    for (const id of item.lineIds) {
      const held = byId.get(id)
      if (held !== undefined && held.recordId !== null) return held.recordId
    }
    return null
  }
  const below: ItemBelow[] = mine.children.map((child) => ({
    text: child.text,
    recordId: filedAs(child),
    filedDeeper: filedUnder(child, filedAs),
  }))
  const parent = found.path[found.path.length - 1]
  const above: ItemAbove =
    parent === undefined
      ? { placed: 'nothing above' }
      : { placed: 'under', text: parent.text, recordId: filedAs(parent) }
  return { mine, above, below }
}

/**
 * What to call each marker when a line holds one and no words. For the person reading the refusal.
 *
 * Keyed on `OutlineItemKind`, so a kind added to the outline fails the type check here rather than
 * quietly getting no name.
 */
const MARKER_NAMES: Readonly<Record<OutlineItemKind, string>> = {
  heading: 'a heading mark',
  bullet: 'a bullet',
  tickbox: 'a tick box',
  numbered: 'a number',
}

/**
 * THE STATE A LINE STARTS IN WHEN SOMEBODY FILES IT AS WORK, one kind at a time, with the reason.
 *
 * ---------------------------------------------------------------------------------------
 * WHY ANY STATE IS WRITTEN AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Filing wrote none, so every record a plan made landed on the work page reading "No state written"
 * while Home counted it among the records with no state anybody can read. The product was making the
 * very thing it complains about, on every press.
 *
 * A CALLER THAT FILES A LINE HAS SAID SOMETHING, and that is what makes writing a state honest
 * rather than a guess. `kinds.ts` says of a task's state "leaving it out means it has never been
 * given one; nothing infers `todo` for you" — and nothing does. This is not Mole Office reading a state
 * out of somebody's writing; it is Mole Office storing what the act means. Filing a line as work says:
 * this is work, and nobody has started it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HERE AND NOT IN THE BROWSER, WHICH IS WHERE IT WAS
 * ---------------------------------------------------------------------------------------
 *
 * The press worked this out and sent it. So the same act through the same route produced a record
 * with a state when a person pressed the button and a record with NO state when an agent posted to
 * `POST /api/plans/:id/lines/:lineId/file-as-work` — which is the door agents use, and the one this
 * product exists to serve. What a record MEANS then depended on which door it came through, and
 * nothing on any screen could say which. That is the defect this repository keeps finding: one fact
 * worked out in two places.
 *
 * It is written here because this is the one place both callers pass through.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT A GUESS, WHICH INVARIANT 5 FORBIDS
 * ---------------------------------------------------------------------------------------
 *
 * THREE THINGS, AND ALL THREE HOLD.
 *
 * A caller who knows better says so and is obeyed exactly. Sending `data.state` writes that word and
 * this table is not consulted. A word the kind does not declare is refused by the schema in
 * `createRecord` and nothing at all is written — null included, which is not one of the words any of
 * these kinds declares. So a caller cannot reach a record with no state by asking for one; what it
 * can do is name a different one.
 *
 * It is not silent. Every filing answers with `startsIn`, which says what was written, whether the
 * caller named it, and why. This is the same arrangement `linesOfDocument` above is in.
 *
 * It is not read out of anybody's writing. Nothing here looks at the words of the line, and a ticked
 * box in the plan is still NOT copied into a state — the note on `fileLineAsWork` says why, and this
 * changes nothing about it.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH KINDS ARE HERE, AND THE TWO THAT ARE DELIBERATELY NOT
 * ---------------------------------------------------------------------------------------
 *
 * `direction` is absent because it has no state field at all — how far a direction has been taken is
 * stored another way — so there is nothing to write and nothing is invented.
 *
 * `block` is absent for a different reason, and it is the only kind of its sort: a block HAS a state
 * field and can hold hours, so it is in `ALLOCATABLE_KINDS`, but it cannot be filed on its own at
 * all. `blockMustBeFiledInAPipeline` in lib/records/pipeline-blocks.ts refuses it, because a block's place in its
 * pipeline's order and half of its own title live on that pipeline. An entry here would be a rule
 * about something that can never happen. tests/plan-table.test.ts files a line as every kind on this
 * table and as every kind left off it, against the real server, so neither absence can quietly stop
 * being true.
 *
 * The words differ between kinds because the vocabularies do: a task has not been started, an
 * obligation is owed, a problem is unfixed. Each word is checked against the vocabulary its own kind
 * declares in `shared/kinds.ts`, by the same test.
 */
export const STATE_A_FILED_LINE_STARTS_IN: Readonly<
  Partial<Record<RecordKind, { state: string; because: string }>>
> = {
  task: { state: 'todo', because: 'somebody has decided to do it and nobody has started it' },
  obligation: { state: 'open', because: 'it is owed and nobody has discharged it' },
  problem: { state: 'open', because: 'the thing is wrong and nobody has fixed it' },
}

/** Where the state on a newly filed record came from. Every filing answers with one of these. */
export interface StateOnFiling {
  /** The state the new record was written with, or null because it was written with none. */
  state: string | null
  /** True when the caller named the state. False when Mole Office wrote the one filing means. */
  named: boolean
  /** What happened and why, in a sentence. Never null — "none was written" is an answer. */
  why: string
}

/**
 * What state to write, and the sentence saying where it came from.
 *
 * `named` is whether the caller mentioned `state` AT ALL. Whether what it named is any good is the
 * schema's question, and `createRecord` answers it: a word the kind does not declare refuses the
 * whole request and writes nothing, null included. So this fills a silence and never argues with a
 * statement, and the sentence it hands back is only ever about a record that really exists.
 */
function stateForFiling(
  kind: RecordKind,
  data: Record<string, unknown> | undefined,
): { data: Record<string, unknown>; startsIn: StateOnFiling } {
  const said = data ?? {}
  const starts = STATE_A_FILED_LINE_STARTS_IN[kind]
  if (data !== undefined && 'state' in data) {
    const named = data['state']
    return {
      data: said,
      startsIn: {
        state: typeof named === 'string' ? named : null,
        named: true,
        why: `You named the state ${JSON.stringify(named)}, so that is what was written and nothing here changed it.`,
      },
    }
  }
  if (starts === undefined) {
    return {
      data: said,
      startsIn: {
        state: null,
        named: false,
        why: `Nothing was written for the state, because a ${kind} does not have one. How far it has been taken is recorded another way.`,
      },
    }
  }
  return {
    data: { ...said, state: starts.state },
    startsIn: {
      state: starts.state,
      named: false,
      why:
        `You named no state, so Mole Office wrote "${starts.state}", which is what filing a line as work ` +
        `means: ${starts.because}. Change it on the record whenever you like, or send data.state to ` +
        'say something else when you file.',
    },
  }
}

/**
 * What the plan says is above a line that was just filed, and what Mole Office did about it.
 *
 * IT IS ALWAYS THERE, even when nothing was linked, because "no link was written" is the answer a
 * caller most needs and is the one it cannot see for itself. `why` says which of the reasons it
 * was, in a sentence, and it is null only when a link WAS written.
 */
export interface FiledUnder {
  /** The words of the item this line is written under, or null when the plan puts it under none. */
  text: string | null
  /** The record that item was filed as, or null because nobody has filed it. */
  recordId: string | null
  /** The "part of" link written from the new record to that one, or null because none was. */
  linkId: string | null
  /** Why no link was written, in words. Null when one was. */
  why: string | null
}

// ------------------------------------------------------ moving what a line says to where it lives

/**
 * WHAT FILING A LINE DID WITH ONE OF THE PLANNING VALUES WRITTEN ON IT.
 *
 * There is always one of these per value, whether it moved or not. A caller cannot see for itself
 * that Mole Office read `{size: 15h}` and decided it could not move it, and a value that quietly stayed
 * behind is the same silence this whole design is trying to remove.
 */
export interface PlanningValueFiled {
  key: PlanningKey
  /** What the person wrote between the colon and the closing bracket, exactly. */
  said: string
  /** True when it moved to its canonical home and left the line's words. */
  moved: boolean
  /** Where it went, in plain words. Null when it did not move. */
  wentTo: string | null
  /**
   * WHERE IT IS NOW, IN TWO OR THREE WORDS: "the estimate", "hours in the schedule". Null when it
   * did not move.
   *
   * It is the short half of `wentTo`, and it exists because of a measured failure. All three
   * first-time readers typed a time on a line, filed it, and watched the words disappear out of
   * the text they were editing; one said their first thought was that they had deleted it themselves.
   * Nothing had been lost — the value had gone to its canonical home and was drawn in a panel
   * below the fold — but the sentence that said so was long enough to be skipped, and the rule a
   * person then infers from watching some words vanish and others stay is that Mole Office takes what
   * it feels like taking.
   *
   * So a value that moves has a phrase short enough to sit in one sentence beside the words the
   * person typed, and `whatLeftTheLine` on the reply is that sentence. Both are built here, once.
   */
  nowIn: string | null
  /** Why it stayed on the line, in plain words. Null when it moved. */
  stayed: string | null
}

/**
 * WHAT IS TO HAPPEN TO ONE VALUE WHEN THE LINE IS FILED. Decided before anything is written.
 *
 * THE WORDS ARE READ BY THE ONE READER OF LOOSE TIME, `readTimeWords` and `readHoursWords` in
 * shared/planning.ts. Nothing in this file knows what "this week" means or how many hours "2.5 hrs"
 * is, and that is deliberate: a second reader of those words would be the same fact worked out in
 * two places, and the two would disagree the first time one of them learnt a new phrase.
 */
type ValuePlan =
  | { value: PlanningValue; move: 'estimate'; hours: number; wentTo: string }
  | { value: PlanningValue; move: 'project'; wentTo: string }
  | { value: PlanningValue; move: 'time'; horizon: Grain; period: string; hours: number; wentTo: string }
  | { value: PlanningValue; move: 'no'; stayed: string }

/** Does this kind of record have an estimate at all? Read from the declaration, never listed here. */
function hasEstimate(kind: RecordKind): boolean {
  return KIND_SPECS[kind].fields.some((field) => field.key === 'effort_hours')
}

/**
 * WHAT TO DO WITH EVERY PLANNING VALUE ON A LINE BEING FILED, decided before anything is written.
 *
 * The rules, one key at a time:
 *
 *   size     goes to the record's `effort_hours`. A kind with no such field keeps the value on the
 *            line and says so — a `direction` and a `problem` have no estimate, and inventing a
 *            field for one would be worse than leaving the words where the person put them.
 *   project  goes to the project the record is filed in. It moves only when the two agree, because
 *            Mole Office is not choosing between two statements about where this work belongs.
 *   time     goes to an allocation, and only when the hours AND the period both read cleanly.
 *            Words that do not read cleanly STAY ON THE LINE, exactly as an unreadable size does.
 *   note     never moves. It has no canonical home and does not need one.
 *
 * NOTHING LEAVES THE LINE UNLESS IT REACHED A CANONICAL HOME. `design/ROUND-FIVE.md` decision 1 gives
 * one reason for taking a group out of the words — the value is now stored somewhere else, so leaving
 * it in the text would be one fact in two places — and the same decision says a value that cannot be
 * promoted stays in the text and says why. Filing used to take `{time: next week}` out of the words
 * and write it into `planning_intents` as words nobody had interpreted. That is not a canonical home:
 * it is the same phrase in another table, entering no total and answering no arithmetic. So the words
 * left the one place the person could see them and landed in a panel below the fold on three of four
 * ordinary window sizes, measured 17 August 2026. They now stay where they were typed.
 *
 * A KEY WRITTEN TWICE MOVES NOTHING. Two sizes on one line are two answers, and picking one would
 * be the guess the fifth rule forbids.
 */
function planTheValues(
  parsed: ReturnType<typeof parsePlanLine>,
  kind: RecordKind,
  workspace: { id: string; title: string },
  data: Record<string, unknown> | undefined,
): ValuePlan[] {
  const counts = new Map<PlanningKey, number>()
  for (const value of parsed.values) counts.set(value.key, (counts.get(value.key) ?? 0) + 1)

  return parsed.values.map((value): ValuePlan => {
    if ((counts.get(value.key) ?? 0) > 1) {
      return {
        value,
        move: 'no',
        stayed:
          `This line says ${value.key} more than once, so nothing was moved. Mole Office will not pick one of ` +
          'two things you wrote. Leave one of them on the line.',
      }
    }

    if (value.key === 'note') {
      return {
        value,
        move: 'no',
        stayed:
          'A note has nowhere else to live, so it stays in the line\'s own words. That is what keeps it when ' +
          'you edit the line.',
      }
    }

    if (value.key === 'size') {
      if (!hasEstimate(kind)) {
        return {
          value,
          move: 'no',
          stayed:
            `A ${kind} has no estimate, so "${value.value}" stays on the line as planning intent. It is still ` +
            'what you wrote and it is still there; there is simply no field on this kind of item for it to ' +
            'move into.',
        }
      }
      const read = readHoursWords(value.value)
      if (!read.read) {
        return {
          value,
          move: 'no',
          stayed: `The estimate stays on the line as planning intent. ${read.why}`,
        }
      }
      const hours = read.hours
      const said = data?.['effort_hours']
      if (said !== undefined && said !== hours) {
        return {
          value,
          move: 'no',
          stayed:
            `You filed this with an estimate of ${JSON.stringify(said)} and the line says "${value.value}". ` +
            'Mole Office did not choose between them, so the record has the one you sent and the line keeps what it ' +
            'says.',
        }
      }
      return { value, move: 'estimate', hours, wentTo: `the record's estimate: ${hours} hours` }
    }

    if (value.key === 'project') {
      const said = value.value.trim()
      const same = said === workspace.id || said.toLowerCase() === workspace.title.trim().toLowerCase()
      if (!same) {
        return {
          value,
          move: 'no',
          stayed:
            `This line is filed in the project "${workspace.id}" ("${workspace.title}") and it says ` +
            `"${said}". Mole Office did not move the record, so the line keeps what it says. File it in ` +
            `"${said}" instead, or change the line.`,
        }
      }
      return { value, move: 'project', wentTo: `the project the record is filed in: "${workspace.id}"` }
    }

    // ---- time
    if (value.value.trim() === '') {
      return {
        value,
        move: 'no',
        stayed: 'This line says {time:} with nothing after it, so there was nothing to read and nothing to keep.',
      }
    }
    const read = readTimeWords(value.value, new Date())
    if (read.hours.read && read.period.read) {
      return {
        value,
        move: 'time',
        horizon: read.period.period.horizon,
        period: read.period.period.key,
        hours: read.hours.hours,
        wentTo: `an allocation of ${read.hours.hours} hours in ${read.period.period.key}`,
      }
    }
    // NOT SCHEDULED, NOT GUESSED AT, AND NOT MOVED EITHER. Nothing canonical could be made of these
    // words, so they stay in the line, which is where the person can see them and edit them. Writing
    // them into `planning_intents` instead would take them out of the prose without making them a
    // fact anywhere — the same phrase in a second table, still in no total.
    const why =
      `${read.hours.read ? `"${value.value}" says how long but not when.` : read.hours.why} ` +
      `${read.period.read ? '' : read.period.why}`.trim()
    return {
      value,
      move: 'no',
      stayed:
        `Nothing was scheduled from "${value.value}", so it stays in the line where you typed it. ${why} ` +
        'It is in no total and it uses no capacity. Change the words when you know when, and file the ' +
        'time then.',
    }
  })
}

/**
 * One item written under the line that has just been filed, and what happened to it.
 *
 * WHY THIS EXISTS. Filing a child writes a "part of" link only when the item above it is already
 * work. Somebody planning coarse to fine files the detail first, so the link is not written, and
 * until now nothing went back and wrote it when the parent line was filed. The plan then looked
 * nested on screen and was FLAT to every total that adds up a tree: one reader's week came out
 * 28.5 hours where the plan said 37.5. Filing a line now adopts what is already filed under it, and
 * every one of them is named here, adopted or not.
 */
export interface ChildAdopted {
  /** The words of the item written under the filed line, with its marker taken off. */
  text: string
  /** The record that item is already filed as, or null because nobody has filed it. */
  recordId: string | null
  /** The "part of" link written from it to the new record, or null because none was written. */
  linkId: string | null
  /** Why no link was written, or null because one was. Never silent. */
  why: string | null
  /**
   * The same reason in one plain sentence, with no ids and nothing about storage. Null when a link
   * was written.
   *
   * WHY THERE ARE TWO. `why` is the whole account — which record, which id, what to do about it —
   * and it is what a developer view and an agent need. This is what a person reads after pressing a
   * button, and the rule for that is one or two plain sentences with no ids in them. It is
   * built from the same branch that builds `why`, so the two cannot come to disagree about what
   * happened; they differ only in how much they say.
   */
  plainly: string | null
}

/** What filing a line did. */
export interface LineFiled {
  line: PlanLine
  recordId: string
  title: string
  /** Where the plan puts this line, and whether that became a link. */
  under: FiledUnder
  /**
   * Every item written directly under this line that the reply has something to say about.
   *
   * One entry per item already filed as work — with the link that made it part of this one, or the
   * reason there is none — and one per item that is NOT filed but has filed work under it, because
   * that work stays outside this record until the item holding it is filed too. Empty when there is
   * nothing under this line and nothing under it has ever been filed.
   */
  adopted: ChildAdopted[]
  /**
   * The state the new record starts in, and where that came from.
   *
   * IT IS ALWAYS THERE, for the same reason `under` always is: a caller cannot see for itself what
   * Mole Office wrote when it named nothing, and a record that lands with no state anybody can read is
   * the state Home spends a line complaining about.
   */
  startsIn: StateOnFiling
  /**
   * Every planning value the line was carrying, and what filing did with each one.
   *
   * IT IS ALWAYS THERE AND IT IS NEVER SILENT. A value that moved has left the line's words, and a
   * caller that is not told which ones moved cannot tell its own copy of the document from the one
   * Mole Office now holds.
   */
  promoted: PlanningValueFiled[]
  /**
   * ONE SENTENCE NAMING EVERY VALUE THAT LEFT THE LINE'S WORDS AND WHERE IT IS NOW. Null when
   * nothing left them, which is the ordinary case for a line that said nothing about itself.
   *
   * WHY THE REPLY SAYS THIS AS WELL AS `promoted`. Filing takes out of the writing exactly the
   * values Mole Office could read and leaves the ones it could not, and until this existed nobody was
   * told that rule anywhere. "probably large" stayed because no hours could be read from it; "3h"
   * was taken because they could; and to the person editing the text the difference looked
   * arbitrary. `promoted` is the whole account, one entry per value, and it is what a developer
   * view and an agent read. This is what a person reads in the second the words vanish.
   *
   * IT IS BUILT FROM `promoted` AND CANNOT DISAGREE WITH IT. Same list, same `said`, same `nowIn`.
   */
  whatLeftTheLine: string | null
  /** The allocation the line's time became, or null because none was written. */
  allocationId: string | null
  /**
   * The words this line was ALREADY holding about time that say the same thing as its `{time: …}`
   * group, or null because it was holding none.
   *
   * FILING NEVER WRITES ONE. It used to: time it could not read as hours and a period was taken out
   * of the line's words and written into `planning_intents`. That took what somebody typed out of
   * the one place they could see it and put it somewhere that is not canonical either — no
   * allocation, no total, no arithmetic — so nothing was promoted and the removal was unearned. Time
   * that cannot be scheduled now stays in the line, exactly as `{size: probably large}` does.
   *
   * SO WHY THIS IS STILL HERE. A person may have pressed "keep these words" in the table before
   * filing, which stores a row of its own, sometimes with a period they pressed. Filing leaves that
   * row exactly as it is and points it at the new work, and this names it so nobody has to guess
   * where their words went. `kept` below is the whole list; this is the one that matches the group.
   */
  intentId: string | null
  /**
   * OTHER WORK IN THIS PROJECT THAT IS ALREADY CALLED THIS. Empty in the ordinary case.
   *
   * IT IS AN OFFER AND NEVER A REFUSAL, since 17 August 2026. Filing a line used to be refused when
   * a record in the project already had this title, and refused again when a DELETED one did. Both
   * refusals are gone. An id is what makes a record itself, and titles may repeat. A record with the
   * same title may be worth showing as one the line could link to, but a shared title must never
   * make Mole Office treat two records as one or refuse a record that is genuinely different.
   *
   * So the record is filed, and this says what else answers to the name, so that a screen can ask
   * whether the person meant that one instead and take no for an answer. Pointing the line at the
   * other record is PATCH /api/plans/<plan>/lines/<line> with a `recordId` and `replacing`.
   *
   * LIVE RECORDS ONLY, and never the record this filing just made. A deleted record holds its title
   * for ever and no line may point at one, so offering it would be offering a press that is refused.
   */
  alsoCalledThis: { id: string; kind: RecordKind; title: string }[]
  /**
   * What this line says about time now, in the person's own words. Empty when it says nothing.
   *
   * The same shape every plan read hands back per line, so a caller that has just filed a line does
   * not have to read the plan again to draw the row it is looking at.
   */
  kept: KeptWords[]
}

/**
 * ADOPT THE ITEMS ALREADY FILED AS WORK DIRECTLY UNDER A LINE THAT HAS JUST BEEN FILED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY FILING LOOKS DOWN AND NOT ONLY UP
 * ---------------------------------------------------------------------------------------
 *
 * Filing a line writes a "part of" link to the item above it only when that item is ALREADY work.
 * People plan coarse to fine and they also plan fine to coarse: three readers who had never seen
 * Mole Office all filed a detail line before the heading it sits under. The child's reply said honestly
 * that no link was written, and then nothing ever went back to write one. The plan looked nested on
 * the screen and was flat to every total that adds up a tree — 28.5 hours where the plan said 37.5.
 * The screen and the arithmetic disagreed with nothing failing, which is the defect this repository
 * keeps finding.
 *
 * THE ALTERNATIVE WAS REJECTED. Leaving the link unwritten and warning the person at the time means
 * the product knows the plan is wrong and asks somebody to repair it by hand, and every reader would
 * have to be taught which nesting is real. Adopting writes the thing the document already says.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT ADOPTS, AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * ONLY THE ITEMS WRITTEN DIRECTLY UNDER THE LINE. The plan says a grandchild is part of its own
 * parent, not of this line, so linking it here would be Mole Office inventing a structure the document
 * does not state. Filing that middle item adopts the grandchild in turn, so filing every line of a
 * tree in any order ends with the same tree.
 *
 * A CHILD IT CANNOT ADOPT DOES NOT UNDO THE FILING. The person pressed "file this line". Refusing
 * that because of a record somebody filed days ago would throw away what they asked for, so the
 * reason is reported instead. Four reasons, each named: the record is gone, it is deleted, it is in
 * another project — a link cannot join two — or it is already part of something else.
 *
 * IT ASKS THE SAME TWO QUESTIONS `createLink` ASKS, through `@shared/containment.ts`, which is the
 * one reader of every containment store. Asking here first is what turns a refusal that would roll
 * the whole filing back into a sentence in the reply. It is not a second rule: `createLink` still
 * asks, and a disagreement between the two would surface as a refused filing rather than a bad link.
 */
function adoptChildrenAlreadyFiled(
  below: readonly ItemBelow[],
  newRecordId: string,
  workspaceId: string,
  actor: Actor,
): ChildAdopted[] {
  const answer: ChildAdopted[] = []
  const filed = below.flatMap((one) => (one.recordId === null ? [] : [one.recordId]))
  const held = resolveAllocated(filed.map((recordId) => ({ recordId })))
  // Read once, and only when there is something to adopt. The links written below are added to it
  // as they are written, so the second child is checked against the graph the first one left.
  const context: { records: readonly PanelRecord[]; links: ContainmentLink[] } =
    filed.length === 0
      ? { records: [], links: [] }
      : { records: listRecords({ workspaceId, includeDeleted: true }), links: [...allLinks(workspaceId)] }

  for (const child of below) {
    if (child.recordId === null) {
      // NOT FILED, BUT HOLDING WORK THAT IS. Those records stay outside this one, and saying so is
      // the difference between a total that is complete and a total that looks complete.
      if (child.filedDeeper === 0) continue
      const one = child.filedDeeper === 1
      answer.push({
        text: child.text,
        recordId: null,
        linkId: null,
        why:
          `"${child.text}" is written under this line and nobody has filed it as work, and ` +
          `${child.filedDeeper} item${one ? '' : 's'} under IT ${one ? 'is' : 'are'} filed. ` +
          `${one ? 'That one stays' : 'Those stay'} outside this record until "${child.text}" is filed too, ` +
          `because the plan says ${one ? 'it is' : 'they are'} part of "${child.text}" and not of this line.`,
        plainly:
          `"${child.text}" is not filed as work, so what is filed under it stays outside this one. File ` +
          'that item too and they join up.',
      })
      continue
    }
    const recordId = child.recordId
    const work = held.get(recordId) ?? null
    const nothing = (why: string, plainly: string): void => {
      answer.push({ text: child.text, recordId, linkId: null, why, plainly })
    }
    if (work === null) {
      nothing(
        `"${child.text}" names the record ${recordId}, which is not in Mole Office any more, so nothing could be ` +
          'made part of this one.',
        `"${child.text}" names work that is not in Mole Office any more, so it was not made part of this one.`,
      )
      continue
    }
    if (work.deleted) {
      nothing(
        `"${child.text}" is filed as "${work.title}" (${work.id}), and that record has been deleted, so it ` +
          'was not made part of this one. Restore it and link the two by hand if that is wrong.',
        `"${child.text}" has been deleted, so it was not made part of this one.`,
      )
      continue
    }
    if (work.workspaceId !== workspaceId) {
      nothing(
        `"${child.text}" is filed as "${work.title}" (${work.id}) in the project "${work.workspaceId}", and ` +
          `this line was filed in "${workspaceId}". A "part of" link cannot join two projects, so it was not ` +
          'made part of this one. Move one of them into the other\'s project and link them by hand.',
        `"${child.text}" is in another project, so it was not made part of this one.`,
      )
      continue
    }
    const loop = wouldMakeCycle(recordId, newRecordId, context)
    if (loop.refuse) {
      nothing(
        `"${child.text}" was not made part of this one. ${loop.sentence}`,
        `"${child.text}" was not made part of this one: this one is already inside it.`,
      )
      continue
    }
    const second = hasParentAlready(recordId, context)
    if (second.refuse) {
      nothing(
        `"${child.text}" was not made part of this one. ${second.sentence}`,
        `"${child.text}" was not made part of this one: it is already part of something else.`,
      )
      continue
    }
    const link = createLink({ fromId: recordId, toId: newRecordId, type: 'part_of', actor })
    context.links.push({ id: link.id, fromId: recordId, toId: newRecordId, type: CONTAINMENT_LINK })
    answer.push({ text: child.text, recordId, linkId: link.id, why: null, plainly: null })
  }
  return answer
}

/**
 * FILE A LINE AS WORK: create the record, bind the line to it, and keep the place the plan gave it.
 *
 * The line's words become the record's title, ONCE. Nothing derives one from the other afterwards.
 *
 * THE MARKER IS NOT PART OF THE WORDS. Filing "- the tray clamp" makes a record called "the tray clamp",
 * and the hashes of a heading, the number of a numbered item and the box of a tick box come off the
 * same way — through `placeInPlan`, which is `blocksOf` and `outlineOf` and not a second stripper.
 * A marker says how the line is DRAWN. It is not something a person wrote about the work, and a
 * record called "- the tray clamp" is a record whose title carries a fact about a document it is no
 * longer attached to. The reply's own `under.text` already had its marker off, so the two halves of
 * one answer used to disagree about one line.
 *
 * A TICKED BOX IS A MARKER TOO, so "- [x] fix the mount" files a record called "fix the mount". The
 * tick is not written anywhere else either: whether the work is done is the record's own state
 * field, and the plan's box and the record's state stay two facts — exactly as the line's words and
 * the record's title do. Copying the tick into a state here would be a second place saying whether
 * the work is finished, and the two would then be able to disagree with nothing failing. So filing
 * "- [x] fix the mount" writes the state a filed line starts in, exactly as filing an unticked line
 * does, and the box is left where it is.
 *
 * A CALLER THAT NAMES NO STATE GETS THE ONE FILING MEANS, and the reply says so. That rule is
 * `STATE_A_FILED_LINE_STARTS_IN` above, with the reason it is on this side of the wire.
 *
 * A LINE THAT IS NOT AN ITEM keeps every character it has. Prose, a table row and a run of lines
 * Mole Office could not read are filed under their exact text, because nothing has read a marker off
 * them and inventing one here would be a parser this file does not share with the screen.
 *
 * Only the kinds a plan can give time to may be filed this way, and the refusal names them. A line
 * filed as a kind the schedule cannot allocate would be a press that leads nowhere, and the button
 * that offers these kinds reads the same list.
 *
 * WHEN THE ITEM ABOVE THIS ONE IS ALREADY FILED AS WORK, one `part_of` link is written from the new
 * record to that one. When it is not filed, no link is written and no parent is invented. Either
 * way the answer says which, because a caller cannot see a link it did not ask for.
 *
 * AND IT LOOKS DOWN AS WELL AS UP. Work already filed on the items written directly under this line
 * is made part of the new record in the same transaction — see `adoptChildrenAlreadyFiled`, which
 * holds the whole reason. `adopted` in the reply names every one of them and says what happened.
 *
 * ---------------------------------------------------------------------------------------
 * FILING IS WHAT MOVES WHAT THE LINE SAYS ABOUT ITSELF
 * ---------------------------------------------------------------------------------------
 *
 * The size goes to the record's estimate, the project to the project the record is filed in, and
 * the time to an allocation when the hours and the period both read cleanly. A value that moved is
 * TAKEN OFF THE LINE, and `promoted` in the reply names every value, what happened to it and why.
 *
 * A VALUE THAT CANNOT MOVE STAYS AND IS NOT A REFUSAL. A `direction` and a `problem` have no
 * estimate at all, so `{size: 5h}` on a line filed as one of those stays where it is and the reply
 * says the estimate is still planning intent because this kind of item has no estimate. The filing
 * itself is exactly as successful as it was before. Nothing is dropped and no field is invented.
 *
 * TIME THAT COULD NOT BE SCHEDULED IS ONE OF THOSE. `{time: next week}` with no hours in it stays in
 * the line, and filing writes nothing about it anywhere. It used to be taken out of the words and
 * written into `planning_intents`, which reads like a promotion and is not one: an intent nobody has
 * interpreted enters no total and answers no question, so the words had left the only place the
 * person could see them without becoming a fact anywhere. `design/ROUND-FIVE.md` decision 1 already
 * said this — "a value that cannot be promoted stays in the text and says why" — and this is the
 * code catching up with it.
 *
 * A PLANNING VALUE IS NOT PART OF THE TITLE. The plan is read for the title and the parent with the
 * trailing groups off every line, so filing `- Build it {size: 15h}` makes a record called
 * "Build it" — the same words the table draws, with the size drawn as a field beside them.
 *
 * ONE TRANSACTION, so a half-filed line cannot exist: either the record, the binding, the link, the
 * hours and the new words of the line are all there, or none of them happened. Every refusal below
 * leaves the plan and the project exactly as they were.
 */
export const fileLineAsWork = oneWrite(function fileLineAsWork(
  planId: string,
  lineId: string,
  input: { kind: string; workspaceId: string; summary?: string | null; data?: Record<string, unknown> },
  actor: Actor,
  // WHO READS THE ANSWER, when the door knows it: `alsoCalledThis` names no message this reader may not
  // read. Absent, every record of the name is listed.
  reader?: AMessageReader,
): LineFiled {
  mustGetPlan(planId)
  const stored = linesOf(planId)
  const line = mustGetLine(planId, lineId)

  if (line.recordId !== null) {
    throw new PanelError(
      `That line is already filed as ${line.recordId}. Filing it again would make a second record for one ` +
        'line, and nothing could say which of them the line meant.',
      409,
    )
  }
  // A PLANNING VALUE IS NOT PART OF THE TITLE. `{size: 15h}` says how big the work is; it is not
  // something anybody wrote about what the work IS. So the plan is read for its place and its title
  // with the trailing groups off every line — the same words a person sees on the screen, because
  // the table draws those groups as fields rather than as text.
  const parsed = parsePlanLine(line.text)
  const lines = stored.map((one) => ({ ...one, text: parsePlanLine(one.text).text }))
  // THE PLAN IS READ ONCE, HERE, and both the title and the parent link come out of that one read.
  const place = placeInPlan(lines, lineId)
  const title = (place.mine === null ? parsed.text : place.mine.text).trim()
  if (title === '') {
    throw new PanelError(
      place.mine === null || parsed.text.trim() === ''
        ? 'That line is empty, and a record needs a title. Write the line first, then file it.'
        : `That line is only ${MARKER_NAMES[place.mine.kind]} with no words after it, and a record needs a ` +
          'title. Write what the work is, then file it.',
    )
  }
  if (!(ALLOCATABLE_KINDS as readonly string[]).includes(input.kind)) {
    throw new PanelError(
      `A plan line is filed as work a plan can give time to: ${ALLOCATABLE_KINDS.join(', ')}. ` +
        `It cannot be filed as a ${input.kind}. File that kind of record on the records page and link to it.`,
    )
  }
  // A BLOCK IS REFUSED HERE, AT THE GATE, IN THE SENTENCE THE RECORD LAYER WOULD HAVE USED.
  //
  // `block` is in `ALLOCATABLE_KINDS` because a block may hold hours, and it cannot be filed on its
  // own at all: half its title and its place in its pipeline's order live on the pipeline.
  // `createRecord` refuses it, so this filing always failed — but it failed INSIDE the transaction,
  // after the record row, the allocation, the rewritten line and the parent link had all been
  // attempted and rolled back. Every other refusal in this function is before the transaction so
  // that nothing is half written, and this one was not.
  //
  // THE SENTENCE IS `blockMustBeFiledInAPipeline`'S, imported rather than written again here, so
  // the refusal a caller gets from the plan and the one they get from the records page are the same
  // words and cannot drift.
  if (input.kind === 'block') throw new PanelError(blockMustBeFiledInAPipeline(title))
  // THE PROJECT HAS TO EXIST, and it is checked through the one gate every route uses. Every other
  // write reaches that gate through the `x-mole-office-workspace` header; this one takes the project in
  // its body, because a plan spans projects and has none of its own — so without this line a
  // misspelt project id would file the record into a project nobody has, and nothing spelling it
  // correctly would ever find it again. `stated: true` because the caller named it.
  const workspace = requireWorkspace(input.workspaceId, true)

  const above = place.above
  const parent =
    above.placed !== 'under' || above.recordId === null
      ? null
      : (resolveAllocated([{ recordId: above.recordId }]).get(above.recordId) ?? null)

  // TWO STATED FACTS THAT CONTRADICT EACH OTHER, SO NOTHING IS WRITTEN. The caller said which
  // project this record goes in; the plan says it is written under an item filed in a different
  // one. A link may not join two projects, so one of the two has to give, and Mole Office cannot tell
  // which was meant. It is refused here, before anything is written, rather than inside the
  // transaction — a refusal from `createLink` would name a record id that the rollback then took
  // away, and tell the caller to move a record that no longer exists.
  if (above.placed === 'under' && parent !== null && !parent.deleted && parent.workspaceId !== input.workspaceId) {
    throw new PanelError(
      `The item above this line, "${above.text}", is filed as "${parent.title}" (${parent.id}) in the ` +
        `project "${parent.workspaceId}", and you asked for this line to go in "${input.workspaceId}". Filing ` +
        'a line writes a "part of" link to the item above it, and a link cannot join two projects. Nothing ' +
        `was written. File this line in "${parent.workspaceId}" as well, or move "${parent.title}" into ` +
        `"${input.workspaceId}" first.`,
      409,
    )
  }

  // WORK CALLED THIS MAY ALREADY EXIST, AND THAT IS NOT A REASON TO REFUSE THE FILING.
  //
  // Two 409s stood here until 17 August 2026: one when a live record in this project already had
  // this title, and one when a DELETED record did. The second of them was met in use: a plan line was
  // removed, written again, and refused because the work already existed under a name held by a
  // record just deleted. Identity is the id; a title is only what is shown, and titles may repeat.
  // A record with the same title may be offered as an existing one to link to, but an equal title
  // never makes Mole Office assume the same identity or refuse a distinct record.
  //
  // SO THE FILING HAPPENS AND THE REPLY CARRIES WHAT ELSE IS CALLED THIS. `createRecordWithReport`
  // asks the question once, in lib/records.ts, and answers `sameTitle`; nothing here asks it a
  // second time. A screen can then offer the existing work — "there is already work called this —
  // did you mean it?" — with PATCH /api/plans/<plan>/lines/<line> and a recordId, and take no for
  // an answer.
  //
  // WHERE THIS RECORD STARTS, worked out once, here, for every caller of this route. A press in the
  // browser and an agent posting the same body now file the same record; before this the browser
  // worked it out for itself and an agent got a record with no state at all.
  const starting = stateForFiling(input.kind as RecordKind, input.data)

  // WHAT EACH PLANNING VALUE ON THE LINE IS TO BECOME, decided before anything is written so that a
  // value Mole Office cannot move is a sentence in the reply rather than a refusal of the whole filing.
  const plans = planTheValues(parsed, input.kind as RecordKind, workspace, input.data)
  const estimate = plans.find((one) => one.move === 'estimate')
  const filingData = estimate === undefined ? starting.data : { ...starting.data, effort_hours: estimate.hours }

  return sqlite.transaction((): LineFiled => {
    // `createRecordWithReport` rather than `createRecord`, for one field: `sameTitle`, the work in
    // this project that is already called this. It is the same call either way — `createRecord` is
    // this function with the report dropped — and the report is what the filing now hands back.
    const filed = createRecordWithReport({
      kind: input.kind as RecordKind,
      title,
      summary: input.summary ?? null,
      data: filingData,
      workspaceId: input.workspaceId,
      actor,
      ...(reader === undefined ? {} : { reader }),
    })
    const record = filed.record
    const alsoCalledThis = (filed.sameTitle ?? []).filter((one) => one.id !== record.id)

    // WHAT THE LINE SAID ABOUT TIME, PUT WHERE THAT KIND OF FACT LIVES — WHEN THERE IS ONE.
    //
    // Hours and a period that both read cleanly become one ordinary allocation, through
    // `createAllocation`, so every rule the schedule already has holds here too. That is the only
    // canonical home time has, and it is the only thing that takes the words off the line.
    //
    // WORDS THAT DO NOT READ CLEANLY ARE NOT WRITTEN ANYWHERE. They stay in the line. Filing used to
    // put them in `planning_intents` and take them out of the text, and that is the bug this pass
    // corrects: an intent nobody has interpreted is not a canonical row, it is the same phrase in
    // another table. Writing one now would be a second copy of words that are still in the line —
    // the one-fact-in-two-places defect, arriving through the door meant to prevent it.
    //
    // A REFUSED ALLOCATION DOES NOT UNDO THE FILING. The hours may be refused for reasons that have
    // nothing to do with this line — the same work already has an allocation in that period, or the
    // period would count one piece of work twice — and dropping the record because of that would
    // throw away the thing the person actually pressed. So that one refusal is caught, the words
    // stay in the line, and the reply repeats what was said. Nothing is half written: every refusal
    // in `createAllocation` happens before its only write.
    let allocationId: string | null = null
    let timeRefused: string | null = null
    const wants = plans.find((one) => one.move === 'time')
    // WHAT THIS LINE WAS ALREADY SAYING ABOUT TIME, read before anything is written. A person may
    // have pressed "keep these words" in the table, which stores a row of its own against the line.
    // Filing writes no such row and removes none: it reports the one that says the same thing as the
    // line's own `{time: …}` group, so a person can see that their two ways of writing one thing
    // have not become two different answers.
    const heldAlready = keptWordsOfLine(lineId)
    const saidOfTime = parsed.values.find((value) => value.key === 'time')?.value
    const intentId =
      saidOfTime === undefined ? null : (heldAlready.find((one) => one.said === saidOfTime)?.id ?? null)
    if (wants !== undefined) {
      try {
        const allocation = createAllocation(
          {
            horizon: wants.horizon,
            period: wants.period,
            recordId: record.id,
            plannedHours: wants.hours,
            note: null,
          },
          actor,
        )
        db.update(allocationsTable)
          .set({ fromPlanLine: lineId })
          .where(eq(allocationsTable.id, allocation.id))
          .run()
        allocationId = allocation.id
      } catch (err) {
        if (!(err instanceof PanelError)) throw err
        timeRefused = err.message
      }
    }

    // THE WORDS THIS LINE WAS HOLDING ARE ABOUT THIS WORK NOW. They were written on the line before
    // anybody decided it was work, which is the ordinary order — you write "next week" against a
    // line and then decide to file it. Left pointing at nothing they could never be scheduled, and
    // the refusal would have said, honestly and for ever, that they are about no piece of work.
    // What they say afterwards is read back into `kept` below rather than assumed here.
    keptWordsNowAbout(lineId, record.id)

    // WHAT MOVED, AND THEREFORE WHAT LEAVES THE LINE. A value in two places is the defect this
    // repository keeps finding, so a value that reached its canonical home is taken out of the words.
    //
    // AND ONLY THAT. `moved: true` here is what deletes a group from the text below, so every branch
    // that sets it has to name a canonical home the value really reached: the record's estimate, the
    // project the record is filed in, or an allocation with hours and a period. Nothing else may set
    // it. A value that ends anywhere less than that stays in the line and says why.
    const promoted: PlanningValueFiled[] = plans.map((one) => {
      const said = one.value.value
      if (one.move === 'no') {
        return { key: one.value.key, said, moved: false, wentTo: null, nowIn: null, stayed: one.stayed }
      }
      if (one.move === 'time' && timeRefused !== null) {
        return {
          key: one.value.key,
          said,
          moved: false,
          wentTo: null,
          nowIn: null,
          stayed: `Nothing was written for the time and "${said}" stays on the line: ${timeRefused}`,
        }
      }
      // WHERE THIS ONE IS NOW, in the two or three words a sentence can carry. The period a time
      // landed in is deliberately not here: `wentTo` says it, `kept` and `derived` say it, and a
      // stored period key is not something to put in front of somebody who typed "Tuesday".
      const nowIn =
        one.move === 'estimate' ? 'the estimate' : one.move === 'project' ? 'the project' : 'hours in the schedule'
      return { key: one.value.key, said, moved: true, wentTo: one.wentTo, nowIn, stayed: null }
    })
    // WHAT LEFT THE WORDS, IN ONE SENTENCE, built from the list above so the two cannot disagree.
    const left = promoted.filter((one): one is PlanningValueFiled & { nowIn: string } => one.nowIn !== null)
    const whatLeftTheLine =
      left.length === 0
        ? null
        : left.length === 1
          ? `${JSON.stringify(left[0]!.said)} left the words you typed and is now ${left[0]!.nowIn}.`
          : `These left the words you typed: ` +
            `${left.map((one) => `${JSON.stringify(one.said)} is now ${one.nowIn}`).join(', and ')}.`
    const gone = new Set(plans.filter((_, at) => promoted[at]!.moved).map((one) => one.value))
    const text = writePlanLine({ ...parsed, values: parsed.values.filter((value) => !gone.has(value)) })

    const stamp = nowStamp()
    db.update(planLines)
      .set({ recordId: record.id, text, updatedAt: stamp, updatedBy: stampOf(actor) })
      .where(eq(planLines.id, lineId))
      .run()
    db.update(plansTable).set({ updatedAt: stamp }).where(eq(plansTable.id, planId)).run()

    // WHERE THE PLAN PUTS THIS LINE, in the words the reply hands back. Every branch that writes no
    // link says why it wrote none, because that is the half a caller cannot see for itself.
    const nowhere = { text: null, recordId: null, linkId: null }
    let under: FiledUnder
    if (above.placed === 'not an item') {
      under = {
        ...nowhere,
        why:
          'This line is not a heading, a bullet, a tick box or a numbered item, so the plan does not say ' +
          'what it is part of. No "part of" link was written.',
      }
    } else if (above.placed === 'nothing above') {
      under = {
        ...nowhere,
        why: 'Nothing is written above this line in the plan, so it was not made part of anything.',
      }
    } else if (above.recordId === null) {
      under = {
        text: above.text,
        recordId: null,
        linkId: null,
        why:
          `It is written under "${above.text}", and nobody has filed that as work, so there was nothing to ` +
          'point at. Mole Office did not pick a different parent for this record.',
      }
    } else if (parent === null) {
      under = {
        text: above.text,
        recordId: above.recordId,
        linkId: null,
        why:
          `It is written under "${above.text}", which names the record ${above.recordId} — and that record ` +
          'is not in Mole Office any more, so nothing could be linked to it.',
      }
    } else if (parent.deleted) {
      under = {
        text: above.text,
        recordId: above.recordId,
        linkId: null,
        why:
          `It is written under "${above.text}", which is filed as "${parent.title}" (${parent.id}) — and that ` +
          'record has been deleted, so nothing was linked to it. Restore it and link the two by hand if that ' +
          'is wrong.',
      }
    } else {
      const link = createLink({ fromId: record.id, toId: parent.id, type: 'part_of', actor })
      under = { text: above.text, recordId: parent.id, linkId: link.id, why: null }
    }

    // WHAT WAS ALREADY FILED UNDER THIS LINE IS MADE PART OF IT NOW, in the same transaction. It
    // runs after the link above is written so that the containment check sees the whole graph this
    // filing leaves behind, and not the one it started from.
    const adopted = adoptChildrenAlreadyFiled(place.below, record.id, input.workspaceId, actor)

    return {
      line: mustGetLine(planId, lineId),
      recordId: record.id,
      title: record.title,
      under,
      adopted,
      startsIn: starting.startsIn,
      promoted,
      whatLeftTheLine,
      allocationId,
      intentId,
      alsoCalledThis,
      // READ BACK, not assembled from what this function was holding. `nowAbout` is used to know
      // whether anything moved; what the line SAYS is what the store says it says.
      kept: keptWordsOfLine(lineId).map(keptWordsOf),
    }
  })()
})

/** What pointing a line at work that already exists did. */
export interface LineBound {
  line: PlanLine
  /** The work the line points at now. */
  work: AllocatedWork
  /**
   * The record the line pointed at before this request, or null because it pointed at nothing.
   *
   * When it is the same id as `work.id` the line already pointed there and nothing was written. The
   * caller reads that off these two fields rather than being told twice.
   */
  was: string | null
  /**
   * What this line says about time now, in the person's own words, and what it is about.
   *
   * POINTING A LINE AT WORK CARRIES THE WORDS WITH IT. Somebody writes "next week" against a line
   * and then says which piece of work the line means; the words were written on the line, so they
   * are about that work from then on. Without this they would keep pointing at nothing, and
   * committing them would be refused for ever with a sentence about having no work to point at.
   */
  kept: KeptWords[]
}

/**
 * POINT A LINE AT WORK THAT ALREADY EXISTS. Nothing is created and no record is changed.
 *
 * This is the other half of `fileLineAsWork` and the repair for the one thing editing a plan
 * destroys. Saving a document matches stored rows to the new text by their exact characters, so
 * changing the words of a line deletes its row and the record binding with it — deliberately, and
 * reported — and until this existed nothing could put that binding back.
 *
 * IT IS ALSO THE POINT OF IT. A plan line should be able to name canonical work rather than always
 * making new work, so that two plans mentioning one task mean the same task.
 *
 * IT IS REFUSED, NAMING WHAT IS WRONG, when the record does not exist, when it has been deleted,
 * when it is a kind a plan cannot give time to, and when the line already points at something. That
 * last one is not refused for ever: the caller sends `replacing` holding the id the line points at
 * NOW, which is a statement about the world that Mole Office can check. A boolean would prove somebody
 * pressed the button; naming the record proves they were looking at the same line Mole Office has.
 *
 * NOTHING ELSE MOVES. The record's title is not written from the line's words and the line's words
 * are not written from the title — after this they are two facts, exactly as they are after filing.
 * No `part_of` link is written either: the record already exists and already sits wherever somebody
 * put it, and moving it because of where a line happens to be written would be this file rearranging
 * the project.
 */
export const bindLineToWork = oneWrite(function bindLineToWork(
  planId: string,
  lineId: string,
  input: { recordId: string; replacing?: string },
  actor: Actor,
  ifVersion?: string,
): LineBound {
  mustGetPlan(planId)
  refuseStaleWrite(planId, ifVersion, actor)
  const line = mustGetLine(planId, lineId)

  // BY PRIMARY KEY, through the one reader lib/planning.ts already has. A plan spans projects, so a
  // line may point at work in any of them, and this asks for exactly one id.
  const work = resolveAllocated([{ recordId: input.recordId }]).get(input.recordId) ?? null
  if (work === null) {
    throw new PanelError(
      `No record has the id "${input.recordId}", so there is nothing for this line to point at.`,
      404,
    )
  }
  if (work.deleted) {
    throw new PanelError(
      `"${work.title}" has been deleted, so a plan line cannot point at it. Restore it first if the plan is ` +
        'right.',
    )
  }
  // ASKED AGAIN AFTER THE BINDING EXISTS, SINCE 18 AUGUST 2026, and not here. `PATCH
  // /api/records/:id` has taken `kind` since 17 August, so a record bound to a line could become a
  // note the day after this check passed. `refuseAKindThisRecordCannotBecome` in lib/records.ts now
  // refuses that while a line, an allocation, a span or a routine points at the record, and it reads
  // the same list this does. So this stays the check at the moment of binding and is no longer the
  // only time the question is asked.
  if (!(ALLOCATABLE_KINDS as readonly string[]).includes(work.kind)) {
    throw new PanelError(
      `A plan line points at work a plan can give time to: ${ALLOCATABLE_KINDS.join(', ')}. "${work.title}" ` +
        `is a ${work.kind}. Write the connection on the record itself, or point this line at the task that ` +
        'does the work.',
    )
  }

  if (input.replacing !== undefined && line.recordId === null) {
    throw new PanelError(
      `You said this line points at "${input.replacing}" and it points at nothing, so there is nothing to ` +
        'replace. Nothing was written. Send the record id on its own.',
      409,
    )
  }
  if (input.replacing !== undefined && input.replacing !== line.recordId) {
    throw new PanelError(
      `You said this line points at "${input.replacing}" and it points at ${line.recordId}. Nothing was ` +
        'written, because the line is not the one you were looking at.',
      409,
    )
  }
  if (line.recordId !== null && line.recordId !== input.recordId && input.replacing === undefined) {
    const held = resolveAllocated([{ recordId: line.recordId }]).get(line.recordId) ?? null
    throw new PanelError(
      `This line already points at ${line.recordId}` +
        (held === null ? ', which is a record Mole Office cannot find any more' : ` ("${held.title}")`) +
        '. Nothing was written. To point it somewhere else, send that id back as `replacing`, which is how ' +
        'Mole Office knows you meant to drop it.',
      409,
    )
  }

  // ALREADY THERE, SO NOTHING IS WRITTEN — and the caller is told that rather than being told
  // "stored". Restamping the line would report it on "written since you read this" as a change that
  // did not happen.
  if (line.recordId === input.recordId) {
    return { line, work, was: line.recordId, kept: keptWordsOfLine(lineId).map(keptWordsOf) }
  }

  const stamp = nowStamp()
  sqlite.transaction(() => {
    db.update(planLines)
      .set({ recordId: input.recordId, updatedAt: stamp, updatedBy: stampOf(actor) })
      .where(eq(planLines.id, lineId))
      .run()
    db.update(plansTable).set({ updatedAt: stamp }).where(eq(plansTable.id, planId)).run()
    // AND THE WORDS THIS LINE HOLDS ABOUT TIME GO WITH IT, in the same transaction, for the reason
    // in `LineBound.kept`. Nothing is created and nothing anybody wrote is changed: the only thing
    // written is which piece of work the words are about.
    keptWordsNowAbout(lineId, input.recordId)
  })()
  return {
    line: mustGetLine(planId, lineId),
    work,
    was: line.recordId,
    kept: keptWordsOfLine(lineId).map(keptWordsOf),
  }
})

/** What taking the work off a line did. */
export interface LineUnbound {
  line: PlanLine
  /**
   * The record the line pointed at, and what the plan can no longer reach through this line.
   *
   * It is the same `RemovedBinding` a save and a removal answer with, from the same function, so
   * "this line stopped naming work" means one thing however it happened.
   */
  removed: RemovedBinding
  /**
   * What this line says about time, in the person's own words, and what those words are about NOW.
   *
   * UNBINDING LEAVES THEM POINTING AT THE WORK. They were written on the line, the line said which
   * work it meant, and taking the record off the line is not a statement that the words were about
   * something else. Rewriting them to be about nothing would throw away a fact nobody corrected.
   * They are handed back here so that what they still say is visible rather than surprising.
   */
  kept: KeptWords[]
}

/**
 * TAKE THE WORK OFF A LINE AND LEAVE BOTH OF THEM ALIVE.
 *
 * ---------------------------------------------------------------------------------------
 * THERE WAS NO WAY TO DO THIS, AND DELETING THE LINE WAS THE ONLY WAY OUT
 * ---------------------------------------------------------------------------------------
 *
 * `recordId` on the line patch was declared as a non-empty string, so it could be changed and never
 * cleared. A person who had pointed a line at the wrong work could delete the line, or leave it
 * wrong. The owner met the second half of that on 17 August 2026 and it is a hole in the model
 * rather than a safety feature: binding is a claim a person makes, and a person may withdraw a claim.
 *
 * THE RECORD IS NOT TOUCHED. It is project truth, it existed before any line named it, and nothing
 * about it is this plan's to remove. The line keeps its own words too — they were the person's words
 * before the binding and they are their words after it.
 *
 * IT SAYS WHAT THE PLAN CAN NO LONGER REACH, in the same shape a save and a removal use, because a
 * line that stops naming work costs the plan the same estimate and the same hours whichever act did
 * it.
 */
export const unbindLine = oneWrite(function unbindLine(planId: string, lineId: string, actor: Actor, ifVersion?: string): LineUnbound {
  mustGetPlan(planId)
  refuseStaleWrite(planId, ifVersion, actor)
  const line = mustGetLine(planId, lineId)
  if (line.recordId === null) {
    throw new PanelError(
      'This line does not point at any work, so there is nothing to take off it. Nothing was written.',
      409,
    )
  }
  const stamp = nowStamp()
  sqlite.transaction(() => {
    db.update(planLines)
      .set({ recordId: null, updatedAt: stamp, updatedBy: stampOf(actor) })
      .where(eq(planLines.id, lineId))
      .run()
    db.update(plansTable).set({ updatedAt: stamp }).where(eq(plansTable.id, planId)).run()
  })()
  // THE LINE IS STILL IN THE PLAN, so `bindingsThatLeftThePlan` is asked about the line as it was —
  // and the plan it is asked about is the plan as it is NOW, where another line may still point at
  // the same work.
  const removed = bindingsThatLeftThePlan([line], recordsStillNamedBy(linesOf(planId)), (recordId) =>
    pointALineAtItAgain(planId, recordId),
  )[0]!
  return { line: mustGetLine(planId, lineId), removed, kept: keptWordsOfLine(lineId).map(keptWordsOf) }
})

/**
 * GIVE A LINE TIME: write one ordinary allocation, and record which line it came from.
 *
 * It goes through `createAllocation`, so every rule the schedule already has still holds here —
 * which kinds may have time, that a period key has to parse, and that one record has at most one
 * allocation per period. There is no second way to write hours in this product.
 *
 * The line must be filed first. Hours name a record, and a line that is only words names nothing.
 */
export const giveLineTime = oneWrite(function giveLineTime(
  planId: string,
  lineId: string,
  input: { horizon: string; period: string; plannedHours?: number | null; note?: string | null },
  actor: Actor,
): { line: PlanLine; allocationId: string } {
  mustGetPlan(planId)
  const line = mustGetLine(planId, lineId)
  if (line.recordId === null) {
    throw new PanelError(
      'Hours are given to a piece of work, and this line has not been filed as one yet. Press "File as ' +
        'work" first, then give it time.',
      409,
    )
  }

  return sqlite.transaction((): { line: PlanLine; allocationId: string } => {
    const allocation = createAllocation(
      {
        horizon: input.horizon,
        period: input.period,
        recordId: line.recordId!,
        plannedHours: input.plannedHours ?? null,
        note: input.note ?? null,
      },
      actor,
    )
    db.update(allocationsTable)
      .set({ fromPlanLine: lineId })
      .where(eq(allocationsTable.id, allocation.id))
      .run()
    return { line, allocationId: allocation.id }
  })()
})

/**
 * The plan lines that put hours on these allocations, by allocation id.
 *
 * An allocation whose `from_plan_line` names a line that has been deleted is NOT reported as having
 * come from nowhere: it is absent from this map, and the caller knows the difference between an
 * allocation with no `from_plan_line` at all and one whose line is gone.
 */
export function planLinesOfAllocations(allocationIds: readonly string[]): Map<string, PlanLine> {
  if (allocationIds.length === 0) return new Map()
  const rows = db
    .select()
    .from(allocationsTable)
    .where(and(inArray(allocationsTable.id, [...allocationIds]), isNotNull(allocationsTable.fromPlanLine)))
    .all()
  const lineIds = rows.map((row) => row.fromPlanLine).filter((id): id is string => id !== null)
  if (lineIds.length === 0) return new Map()
  const lines = new Map(
    db.select().from(planLines).where(inArray(planLines.id, lineIds)).all().map((row) => [row.id, toLine(row)]),
  )
  const answer = new Map<string, PlanLine>()
  for (const row of rows) {
    const line = row.fromPlanLine === null ? undefined : lines.get(row.fromPlanLine)
    if (line !== undefined) answer.set(row.id, line)
  }
  return answer
}
