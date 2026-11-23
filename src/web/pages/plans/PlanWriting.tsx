// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { stillOnThisPage } from '../../lib/pagechoice.ts'
import { t } from '@shared/i18n.ts'
/**
 * WRITING IN A PLAN: ONE TEXT BOX HOLDING THE WHOLE DOCUMENT, AND NOTHING ELSE.
 *
 * ---------------------------------------------------------------------------------------
 * THIS FILE DRAWS THE BOX. THE PAGE DECIDES WHAT IS BESIDE IT.
 * ---------------------------------------------------------------------------------------
 *
 * The box used to carry a pane of its own with three settings, and the page carried a second
 * control that also chose what was on screen. Two controls for one question is how they came to
 * disagree, and one of the two offered a word ("the document as it reads") the other also used.
 * OnePlanPage.tsx now holds the one control and the one arrangement; this file holds the writing.
 *
 * ---------------------------------------------------------------------------------------
 * THE SUBSTRATE IS THE BROWSER'S, AND THAT IS THE WHOLE DESIGN
 * ---------------------------------------------------------------------------------------
 *
 * Selection, undo, redo, where the caret lands when you click, select all, cut, copy and paste are
 * the browser's here, and nothing in this file touches any of them. There is one textarea and it
 * holds the plan.
 *
 * That is a correction, not a preference. The build before this one gave every line its own
 * editable element. A browser cannot select across separate elements, cannot keep one undo history
 * over them, and cannot put the caret where you clicked in an element it is not focused on — so
 * that build had to reimplement all of it, and a person who had never seen Mole Office measured the
 * result as worse than a Markdown file: indentation that grew silently until four typed spaces
 * stored forty-six, an undo that removed three of five characters, no way to select two lines, and
 * no way to copy the plan out. design/PLANNING-WORKSPACE.md section 1 has the measurements.
 *
 * IF YOU FIND YOURSELF WRITING KEY HANDLING FOR ANY OF THOSE, THAT IS THE MISTAKE COMING BACK.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS EATEN AND NOTHING AUTOCOMPLETES
 * ---------------------------------------------------------------------------------------
 *
 * No handler here adds, removes or normalises whitespace. The box's characters are the plan's
 * characters: the page saves the string the box holds, `linesOfBody` splits it on the newline and
 * nothing else, and `bodyOfLines` joins it back. What the person typed is what is stored, byte for
 * byte, and tests/plandoc.test.ts proves that round trip.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE KEY MOLE OFFICE ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * Alt and the up or down arrow move the line the caret is in together with every line indented
 * under it. A text file cannot do that, which is why it is worth a key.
 *
 * WHAT THE KEYS DO IS BEHIND THE `?` MARK ON THE BOX'S LABEL, not printed under the box. It was a
 * standing 57-word paragraph and the owner named it: keyboard instructions that are always on the
 * page make the page harder to scan. Nothing was deleted — the mark is the product's one help affordance and
 * every word is still there, including the one surprise, which is that Tab leaves the box.
 *
 * ---------------------------------------------------------------------------------------
 * AND WHAT MAKES AN ITEM IS SHOWN IN THE EMPTY BOX, BECAUSE NOTHING TAUGHT IT
 * ---------------------------------------------------------------------------------------
 *
 * Three people who had never seen Mole Office drove a plan end to end and none of them was taught the
 * syntax by the product: they guessed it from two plans on the list, and the shape they guessed —
 * an outline indented with spaces — is the one shape that makes a plan of nothing but prose. The
 * help said "Indent with spaces instead" and stopped there, which pointed the same wrong way.
 *
 * The empty box now draws the shape as its placeholder — `THE_SHAPE_OF_A_PLAN` — and a save that
 * understood nothing as an item says so where the person is looking. Neither is a paragraph of
 * instructions, which `docs/UX-CONTRACT.md` forbids as an answer to a confusing surface.
 *
 * AND A LINE CAN CARRY FOUR THINGS, WHICH THE PRODUCT USED TO TEACH NOWHERE. A size, a when, a
 * project and a note go in the line's own words — `- Build the controller {size: 15h}` — and on 16
 * August 2026 not one curly bracket appeared anywhere on this surface once the box had words in it.
 * Writing is the tab a plan opens on, so somebody starting there could not attach a size, a period
 * or a note and had no way to learn that they could. There is now a press for each, always on
 * screen, carrying the exact characters it writes. `valueOnLine` is where it is decided.
 *
 * The move goes through the browser's own insert command, so it lands on the browser's undo history
 * and Ctrl+Z walks it back like anything else. src/shared/planwrite.ts works out which characters
 * to replace and proves it without a browser.
 *
 * ---------------------------------------------------------------------------------------
 * HOW SAVING WORKS, AND WHAT HAPPENS WHEN IT CANNOT
 * ---------------------------------------------------------------------------------------
 *
 * Typing changes a string in the browser and nothing else. A save runs 600ms after typing stops,
 * and at once after a move — so it is one request per pause, never one per keystroke. One save is
 * in flight at a time and anything typed during a flight goes in the next one. The save is the
 * whole document through PUT /api/plans/:id/body, which is one transaction.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY SAVE NAMES THE COPY IT WAS BUILT ON, AND A STALE ONE IS REFUSED RATHER THAN WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * Two readers open one plan. One saves. The other saves its older copy, and the first person's
 * writing is gone with nothing said. So a read of a plan hands back a token naming exactly what it
 * holds, this page carries that token into every save, and the server refuses a save built on a copy
 * somebody has already replaced. NOTHING IS WRITTEN when it does.
 *
 * A REFUSAL IS NOT A FAILURE AND IS NOT DRAWN AS ONE. A failed save is worth trying again; a refused
 * one cannot succeed until a person decides, because typing more does not change the copy it was
 * built on. So THE AUTOSAVE STOPS — see `schedule` for the whole reason — and the page says what
 * happened, offers to read what is stored, and offers to replace it only after that has been read.
 *
 * IT DOES NOT MERGE AND IT DOES NOT RELOAD THE BOX. Mole Office cannot tell which of two versions of a
 * sentence somebody meant, and putting the stored words where the person is writing would throw away
 * what they typed, which is the same loss from the other direction.
 *
 * A PLAN CAN MOVE WITHOUT ANYBODY WRITING A WORD — filing a line as work from the table beside this
 * box does exactly that — so a refusal is looked at rather than believed. See `sendNow`.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE BOX NEVER WRITES BACK WORDS IT HAS NOT SEEN, WHICH THE TOKEN ALONE DOES NOT GIVE YOU
 * ---------------------------------------------------------------------------------------
 *
 * The guard above compares TOKENS. There is one way for the words to go stale while the token stays
 * fresh, and it lost a person's edit: type in a cell of the table beside this box, click straight
 * into the writing box and type, with no pause. The cell write lands, the table reads the plan back
 * and hands over the new words AND the new token — and a save is already owed, so the words are
 * refused and only the token is taken. The next save then writes the box's older document on the
 * newest token, the server takes it, and the cell edit is gone with "Stored." on screen.
 *
 * SO THE TOKEN IS ONLY EVER TAKEN WITH THE WORDS IT NAMES. `putSaved` is where that is decided and
 * the whole account is on it. The case is a 0ms gap between the two edits, and the file
 * `tests/plan-writing-split-loss.test.ts` drives exactly that.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE VALUES THAT LEFT THE WRITING ARE SHOWN BESIDE IT
 * ---------------------------------------------------------------------------------------
 *
 * Filing a line as work moves its size, its hours and its project to the record and takes them out
 * of the words. `WhatTheseLinesBecame` reads them back beside the box, marked, and not editable
 * there. It is the third layer of this screen and it is never put back in the box; that component
 * says why in full.
 *
 * IT SAYS THE VALUE AND STOPS. Where the one stored copy lives is Inspect's business, and the panel
 * used to spend 87 of its 176 words on one sentence about it, repeated once per value.
 *
 * ---------------------------------------------------------------------------------------
 * A LINE THAT LOSES ITS WORK IS REMEMBERED UNTIL SOMEBODY MENDS IT
 * ---------------------------------------------------------------------------------------
 *
 * Rewriting a filed line's words drops the record it pointed at. That is deliberate and it stays.
 * What was wrong was afterwards: one note, one press that made the note go away, gone on reload,
 * and the easiest next thing on the screen was the press that files a SECOND piece of work. So the
 * list of lost lines is remembered in this browser per plan, and the repair — point a line at that
 * work again — is on the notice itself. `RemovedWork` and `LostWork` have the whole account.
 *
 * ---------------------------------------------------------------------------------------
 * THE NAME IS SAVED BY THIS HOOK TOO, AND THAT IS A FIX
 * ---------------------------------------------------------------------------------------
 *
 * ONE SAVE STATE COVERS THE WHOLE PLAN: the words in the box and the plan's name. The word on
 * screen is about both, so it cannot be true of one and false of the other.
 *
 * Measured, and the worst defect this product can have: the name used to save on blur or Enter and
 * had no unsaved state of its own, while the status line beside it was about the document. A person
 * renamed a plan, closed the tab, and the rename was gone. The page said "Stored." the whole time
 * and the browser asked nothing, because the tab-close guard read the document's state and the
 * document was stored.
 *
 * That was the same fact worked out in two places. There is now one place. The name goes on the
 * same 600ms timer as the words, `saveState` covers both, and the tab-close guard reads the one
 * state — so it now stops a close over an unsaved name.
 *
 * THE WORDS GO FIRST AND THE NAME SECOND, and a failure says which of the two did not store. The
 * server refuses an empty name, so clearing the name to retype it fails for as long as it is empty;
 * saving the words first means that refusal cannot hold the writing hostage.
 *
 * WHEN A SAVE FAILS, THE PAGE SAYS SO LOUDLY AND KEEPS EVERY CHARACTER. The words stay in the box,
 * the next keystroke tries again, there is a press to try again now, and the browser asks before
 * the tab is closed. Nothing is thrown away and nothing is claimed to be stored that is not.
 *
 * The plan is never re-fetched into the box while somebody is writing, because a refetch would
 * fight the caret. The stored LINES are re-read after a press files or binds one, which does not
 * touch the box.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO PRESSES, AND THE HOLE ONE OF THEM CLOSES
 * ---------------------------------------------------------------------------------------
 *
 * An interface must not take away a useful control only because the automatic way
 * usually works. So there is a **Save now** press that forces the save rather than
 * waiting out the pause, and a **Save and close** press that stores everything and goes back to the
 * plans list. It was called Done until 18 August 2026; see the press itself for why it is not. Autosave
 * is unchanged and still runs.
 *
 * BOTH PRESSES SAY WHAT HAPPENED, INCLUDING WHEN NOTHING HAPPENED. "There was nothing to save" is a
 * real answer to pressing Save and it is not a reason to sit there silently.
 *
 * EVERY ANSWER CARRIES THE MOMENT IT WAS GIVEN, so pressing Save twice changes the screen twice.
 * Measured: the second press of Save now changed not one character on the page, because the answer
 * to the first press was still sitting there and the words were the same. A person pressing Save to
 * check their work is safe read a sentence their press had not produced.
 *
 * AND THE ANSWER GOES AS SOON AS THE PLAN CHANGES, because it is only true of the plan as it was
 * when the press was made. Measured: "Nothing to save. Every character was already stored." sat on
 * screen underneath "Your writing is not stored." It is shown only while the change count it was
 * given at is still the change count now, so it cannot outlive the plan it was about.
 *
 * CTRL+S AND CMD+S ARE THE SAME PRESS. It is the gesture everybody has, and the browser's own
 * answer to it — a dialog offering to save the page as a file — is not one.
 *
 * SAVE AND CLOSE REFUSES TO LEAVE WITH WORDS UNSAVED, and that is the point of it. Leaving this page by the
 * browser's Back button is a hash change, a hash change does not fire `beforeunload`, and the
 * unmount used to CANCEL the pending save with `clearTimeout` — so up to 600ms of typing went
 * nowhere and nothing said so. Two things fix it: the press waits for the save and stays put if it
 * fails, and the unmount now SENDS the owed save instead of cancelling it. A save fired on the way
 * out has nobody left to report to, which is exactly why that press exists and waits.
 */

import { TieredPress } from '../../components/TieredPress.tsx'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { api, ApiError, errorMessage, faultOf, type Fault, type PlanLineWithWork, type VersionToWriteOn } from '../../api.ts'
// THE WORDS THE TABLE'S COLUMNS ARE HEADED WITH, read from where the table reads them. These two
// screens are two views of one plan, and a value called one thing in one and another thing in the
// other is two values as far as the reader is concerned. This used to be a second copy of the three
// words with a comment asking whoever changed one to change the other.
// AND THE COUNT OF WHAT BECAME AN ITEM, read from the function the table's own rows are built from.
// A save that said how many lines it stored and a table that said how many of them were items were
// two readings of one document, and a person who wrote an outline with no markers was told the good
// half by one and the true half by the other.
// AND WHAT THE TABLE BESIDE THE BOX IS HOLDING THAT NOBODY HAS STORED. The line above both views
// says whether the plan is stored, so it has to be able to see a cell somebody is typing in. See
// `planTypingNow` in that file for the measurement.
// AND THE ONE READER THAT TAKES MOLE OFFICE'S IDS OUT OF A SENTENCE THE SERVER WROTE. The receipts under
// the table and the refusals on this page are the same sentences, so they are cleaned the same way
// in one place rather than twice with nothing keeping the two alike.
import {
  planItemsOf,
  planTypingNow,
  PLANNING_WORDS,
  watchPlanTyping,
  withoutRecordIds,
  type PlanTyping,
} from '../../components/plans/planitems.tsx'
import { lineWithMaths } from '../../components/plans/PlanMaths.tsx'
// A WEEK NAMED THE WAY A PERSON SAYS IT, from the one function in this app that names periods.
// The panel under the writing box and the notice after a rename both draw sentences the server
// wrote with the stored key in them. See `periodsInWords`.
import { InReachMark, reachBox, useReach } from '../../components/InReach.tsx'
import { periodsInWords } from '../../components/Planning.tsx'
import { navigate, plansPath } from '../../components/router.tsx'
import { clearStored, readStored, writeStored } from '../../lib/store.ts'
import { useInspect } from '../../lib/mode.ts'
import { Absence, Btn, ErrorNote, Hint, parseStamp, ServerNote, Stamp } from '../../components/ui.tsx'
import { bodyOfLines } from '@shared/plandoc.ts'
// THE FOUR THINGS A LINE CAN CARRY, and the reader of the syntax, both from the one file that
// declares them. The presses above the box are built from `PLANNING_KEYS`, so a fifth key added
// there gets a press with nothing to keep in step.
import { PLANNING_KEYS, parsePlanLine, type PlanningKey } from '@shared/planline.ts'
import { moveSubtree } from '@shared/planwrite.ts'
import { nowStamp } from '@shared/time.ts'

/** How long after the last keystroke a save runs, in milliseconds. */
const AFTER_TYPING_STOPS = 600

/**
 * What the page has to say about whether your writing is stored.
 *
 * `conflict` is its own word and not a kind of failure. A failed save is worth trying again; a
 * refused one cannot succeed until a person decides what to do, because the copy it was built on is
 * the copy somebody else has already replaced.
 */
type SaveState = 'stored' | 'waiting' | 'storing' | 'failed' | 'conflict'

/**
 * WHAT ONE SAVE DID, as facts. The words are made from this in one place, `sayOfSave` below.
 *
 * `nothing` is a real outcome and the reason this type exists: pressing Save when every character
 * is already stored must answer, and the answer is that there was nothing to send.
 *
 * `stored-then-typed` is the editSeq guard showing through. The save stored the characters that
 * were in the box when it started, and more were typed while it was on its way, so the document as
 * a whole is NOT stored. Reporting that as a plain success is the exact lie the guard exists for.
 */
export type SaveDone =
  | { did: 'nothing'; at: string }
  | { did: 'stored'; what: SavedWhat; at: string }
  | { did: 'stored-then-typed'; what: SavedWhat; at: string }
  | { did: 'failed'; what: PartOfPlan; why: string; at: string }
  | { did: 'refused'; why: string; at: string; cause?: ClashCause }

/**
 * WHO MOVED THE PLAN OUT FROM UNDER THIS PAGE, when this page can say for itself.
 *
 * `table` is the one thing it can say: the table beside the writing box handed over words that are
 * not the words in the box, and the box was in the middle of a save. Nobody else on this page can
 * do that, so it is a fact rather than a reading of a status code.
 *
 * LEFT OUT MEANS THIS PAGE CANNOT SAY WHO WROTE, which is the ordinary case for a save the server
 * refused: another tab, an agent, or somebody at another desk. The page then says what it knows,
 * which is that somebody wrote first.
 */
export type ClashCause = 'table'

/** Which half of the plan a sentence is about. Both are the person's writing and neither is "the plan". */
export type PartOfPlan = 'the writing' | 'the name'

function partWords(part: PartOfPlan): string {
  return part === 'the writing' ? t('g8.writing.theWriting') : t('g8.writing.theName')
}

/** What one save actually sent. `lines` is null when the writing was already stored. */
export interface SavedWhat {
  writing: boolean
  name: boolean
  lines: number | null
  /**
   * HOW MANY OF THOSE LINES MOLE OFFICE READ AS AN ITEM, or null when the writing was not sent.
   *
   * Counted by `planItemsOf`, which is the very function the table's rows are built from. A person
   * who typed an outline with no markers has written a plan of eighteen lines and no items, and a
   * save that answered "Saved the writing" and stopped there let them believe the opposite while
   * the table beside it said the truth. The two sentences now come from one count.
   */
  items: number | null
}

/** A save that did not go through: which half it was about, and the server's own sentence. */
export interface SaveFault {
  what: PartOfPlan
  why: string
  /** How the refusal is drawn, when the server's reply said: a coded refusal is drawn in the page language. */
  fault?: Fault | null
  /**
   * THE NAME THE PLAN HOLDS NOW, WHEN SOMEBODY RENAMED IT AFTER THIS PAGE READ IT (problem GR4LcaNI-XZk).
   *
   * Set only on that refusal. The page shows it and offers the two ways on: take that name, or keep the one typed here.
   */
  storedName?: string
}

/**
 * What one send of the whole document did.
 *
 * `moved` IS NOT THE SAME AS "SOMEBODY ELSE IS WRITING". It says the plan is not the copy the token
 * named any more, which happens when somebody writes AND when a line beside the box is filed as
 * work. The two are told apart by looking, not by the status code.
 */
type DocumentWritten =
  | {
      ok: true
      lines: number
      /**
       * The stored lines the write came back with, so the caller can count what became an item.
       *
       * THE ROWS AND NOT A COUNT, because counting them means parsing the document, and a parse
       * that threw in here would come out as "the save failed" over a save that went through. The
       * caller counts them where a throw is a throw. See `sendNow`.
       */
      rows: readonly PlanLineWithWork[]
    }
  | { ok: false; moved: boolean; why: string }

/**
 * WHEN MOLE OFFICE LAST HAD A FACT ABOUT THIS PLAN FROM THE SERVER, and how it got it.
 *
 * The page never asks the server again while somebody is writing, so "Stored." is a fact about a
 * moment that has passed and not a claim about the server right now. Two tabs open on one plan both
 * said "Stored." while one had just written over the other's line, and neither had any way to know.
 * Mole Office cannot fix that this pass. It can stop stating a present tense it has not checked, so the
 * moment is on screen beside the word.
 */
export interface LastKnown {
  how: 'read' | 'sent'
  at: string
}

/**
 * ONE STORED VALUE AS A PERSON READS IT. TWO MENDS, BOTH ABOUT WORDS NOBODY WOULD SAY OUT LOUD.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIRST: `null` IS NOT A WORD
 * ---------------------------------------------------------------------------------------
 *
 * Measured on a plan's Writing view on 18 August 2026, under "What these lines became":
 *
 *     Schedule — null hours in 2026-08-17
 *     Schedule — null hours in Week of 17 August
 *
 * The sentence is composed where the value is read — `derivedValuesOf` in
 * `src/server/lib/plans.ts` — by putting the allocation's planned hours into a string. Nobody
 * having said how many hours is a real and ordinary answer, and it is stored as an absence, so the
 * absence went into the sentence as the four characters a programmer sees.
 *
 * **THE FIX BELONGS WHERE THE SENTENCE IS COMPOSED, AND THIS IS NOT THAT PLACE.** When this was
 * written the server files belonged to another agent, so the mend is here, at the last point before a person
 * reads it. It says the same fact in words: nobody has said how many hours yet. If the sentence on
 * the server is ever written properly, this stops matching and nothing changes on screen.
 *
 * ---------------------------------------------------------------------------------------
 * THE SECOND: A STORED WEEK KEY IS NOT A NAME
 * ---------------------------------------------------------------------------------------
 *
 * `periodsInWords` names `2026-W34` the way a person says it, in Normal mode only, and its own
 * header explains why Inspect keeps the key. The `null` mend is in BOTH modes, because `null` is
 * not the stored value either — nothing in the database says "null", so showing it in Inspect
 * would not be showing anybody what is stored.
 */
export function valueInWords(says: string, inspect: boolean): string {
  const said = says.startsWith('null hours') ? t('g8.writing.noHoursYet', { value1: says.slice('null hours'.length) }) : says
  return inspect ? said : periodsInWords(said)
}

/**
 * ONE VALUE THIS PLAN REACHED THROUGH A LINE AND CANNOT REACH NOW.
 *
 * `says` is the value as a screen draws it — "3 hours", "3 hours in 2026-08-18", "Greenhouse" — and
 * `key` is which of the plan's three columns it belongs under, so the notice can head it with the
 * word the table already uses.
 */
export interface LostValue {
  key: Exclude<PlanningKey, 'note'>
  says: string
}

/**
 * A line that is gone and was filed as work. The record itself was not touched.
 *
 * `lost` IS WHAT THAT COST, and it is the half this notice was missing. See `RemovedWork` for the
 * measurement. It is null only for a loss this browser remembered before Mole Office recorded the cost,
 * which is "nobody wrote it down" and is never drawn as "nothing was lost".
 */
export interface RemovedBinding {
  text: string
  recordId: string
  title: string | null
  lost: readonly LostValue[] | null
}

/**
 * THE LOST LINES THIS BROWSER IS STILL HOLDING, AND WHETHER IT CAN HOLD THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS SURVIVES A RELOAD, WHEN NOTHING ELSE ON THIS PAGE DOES
 * ---------------------------------------------------------------------------------------
 *
 * Rewriting the words of a line drops the record it was filed as, and that is deliberate, specified
 * and staying: the alternative is guessing that one line "is" another and moving somebody's work
 * onto a line nobody bound. What was wrong was the aftermath. The page said so once, in a note with
 * a press that made the note go away, and a reload made it go away by itself — so the person was
 * left with a piece of work nothing points at and no way to find out which one.
 *
 * So the list is remembered in this browser, per plan, until it is dealt with. It is remembered
 * rather than asked for, because nothing on the server records that a line USED to point at a
 * record: the row is deleted and the record simply has no line. There is no read that could bring
 * this back, which is exactly why it must not be dropped.
 *
 * `fault` IS NOT NOTHING. A browser can refuse to remember — a locked-down profile, private
 * browsing — and a notice that quietly stops surviving reloads is worse than one that says it will
 * not. The words are drawn where the list is.
 */
interface LostWork {
  removed: readonly RemovedBinding[]
  /** Why this browser cannot remember the list, or null. */
  fault: string | null
}

/** Where one plan's lost lines are remembered. One key per plan, so two plans cannot mix. */
function lostWorkKey(planId: string): string {
  return `mole-office.plan.${planId}.lost-work`
}

/**
 * Read the lost lines this browser remembers for one plan.
 *
 * IT IS THE RAW LIST AND NOT WHAT IS DRAWN. Whether one of them is still lost is worked out on
 * every read, from the plan's own lines — see `stillLost`, which is the only place that decides it.
 *
 * ANYTHING THIS BUILD CANNOT READ IS DROPPED AND SAID, never repaired into a shape that looks
 * right: the words in it are what a person reads to find their work again.
 */
function rememberedLostWork(planId: string): LostWork {
  const read = readStored(lostWorkKey(planId))
  if (!read.ok) return { removed: [], fault: read.reason }
  if (read.value === null) return { removed: [], fault: null }
  let held: unknown
  try {
    held = JSON.parse(read.value)
  } catch (err) {
    clearStored(lostWorkKey(planId))
    return {
      removed: [],
      fault: t('g8.writing.whatThisBrowserRememberedCouldNotBeReadSo', { value1: errorMessage(err) }),
    }
  }
  const losses = Array.isArray(held) ? held.map(oneRemovedBinding) : null
  if (losses === null || losses.some((one) => one === null)) {
    clearStored(lostWorkKey(planId))
    return {
      removed: [],
      fault: t('g8.writing.whatThisBrowserRememberedWasNotAListOf'),
    }
  }
  return { removed: losses.filter((one): one is RemovedBinding => one !== null), fault: null }
}

/**
 * WHICH OF THE REMEMBERED LOSSES ARE STILL LOSSES: the ones no line in this plan points at.
 *
 * ONE PLACE, AND IT IS WORKED OUT ON EVERY READ RATHER THAN WHEN THE LIST CHANGES. A record gets a
 * line back in more than one way — the press on the notice below, the same press in the table, an
 * agent — and the remembered list cannot know which happened or when. Asking the plan is the only
 * answer that is true whoever mended it, and it is true the moment they do.
 *
 * A NOTICE SAYING A RECORD HAS NO LINE, BESIDE A LINE POINTING STRAIGHT AT IT, is the product
 * lying about its own corpus. That is what this stops.
 */
function stillLost(
  remembered: readonly RemovedBinding[],
  lines: readonly PlanLineWithWork[],
): readonly RemovedBinding[] {
  if (remembered.length === 0) return remembered
  const pointedAt = new Set(lines.map((entry) => entry.line.recordId).filter((id): id is string => id !== null))
  return remembered.filter((one) => !pointedAt.has(one.recordId))
}

/**
 * ONE LOST LINE, READ FROM WHAT THE SERVER SENT OR FROM WHAT THIS BROWSER REMEMBERED, or null when
 * it is not one.
 *
 * ONE READER FOR BOTH DOORS. A loss arrives in a save's reply and it comes back out of this browser
 * after a reload, and the same words have to survive both — so the shape is checked in one place
 * rather than believed on one door and checked on the other.
 *
 * `lost` MISSING IS "NOBODY WROTE IT DOWN" AND IS KEPT. That is a loss this browser remembered
 * before Mole Office recorded what a loss costs, and dropping it would throw away the only record
 * anywhere that a piece of work lost its line. `lost` PRESENT AND UNREADABLE IS NOT: this build
 * cannot say what that entry means, and the caller drops the list and says so.
 */
function oneRemovedBinding(value: unknown): RemovedBinding | null {
  if (typeof value !== 'object' || value === null) return null
  const one = value as Record<string, unknown>
  const text = one['text']
  const recordId = one['recordId']
  const title = one['title']
  if (typeof text !== 'string' || typeof recordId !== 'string') return null
  if (title !== null && typeof title !== 'string') return null
  const lost = one['lost']
  if (lost === undefined) return { text, recordId, title, lost: null }
  if (!Array.isArray(lost) || !lost.every(isLostValue)) return null
  return { text, recordId, title, lost }
}

/**
 * Whether one entry of `lost` is a value this build can draw.
 *
 * The keys come from `PLANNING_KEYS`, which is the one declaration of what a plan line can carry, so
 * a fifth key added there is a key this reader knows about with nothing to keep in step. A note is
 * not one of them: it never moves off the line, so a binding cannot take one away.
 */
function isLostValue(value: unknown): value is LostValue {
  if (typeof value !== 'object' || value === null) return false
  const one = value as Record<string, unknown>
  const key = one['key']
  if (typeof key !== 'string' || typeof one['says'] !== 'string') return false
  return key !== 'note' && (PLANNING_KEYS as readonly string[]).includes(key)
}

/**
 * One planning value read back from the record a line was filed as.
 *
 * Taken from the reply's own shape rather than named again here, so the day the server adds or
 * renames a field this page is told by the type checker instead of quietly drawing one fewer thing.
 */
export type DerivedValue = PlanLineWithWork['derived'][number]

/**
 * A SAVE THAT WAS REFUSED BECAUSE SOMEBODY ELSE WROTE IN THIS PLAN FIRST. Nothing was written.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS AND WHAT IT IS DELIBERATELY NOT
 * ---------------------------------------------------------------------------------------
 *
 * Two readers open one plan. One saves. The other saves its older copy, and the first person's
 * writing is gone with nothing said. That is the failure this exists to prevent, and the owner
 * asked for exactly this much: detect it, refuse it, and offer a way to reload and compare.
 *
 * THERE IS NO MERGE HERE AND THERE IS NOT MEANT TO BE. Mole Office cannot tell which of two versions of
 * a sentence somebody meant. It shows both and a person decides.
 *
 * AND NOTHING IS RELOADED FOR YOU. Taking the stored document and putting it in the box would throw
 * away what the person typed, which is the same loss arriving from the other direction.
 */
export interface PlanConflict {
  /** The server's own sentence: what moved, who wrote it and when. */
  why: string
  /**
   * WHO MOVED THE PLAN, when this page can say. See `ClashCause`.
   *
   * Left out, the panel says the thing that is always true — somebody wrote in this plan first —
   * because naming the table when the page has not seen the table write would be a guess.
   */
  cause?: ClashCause
  /** When Mole Office was refused. */
  at: string
  /** The stored plan, once the person has asked to see it. Null until they do. */
  stored: StoredNow | null
  /** Why the stored plan could not be read, or null. */
  readFailed: string | null
}

/** The plan as it is stored right now, read so a person can compare it with what they have. */
export interface StoredNow {
  /** The whole document, as it is stored. */
  body: string
  /** The token naming it, so a deliberate replacement can be built on this exact copy. */
  version: string
  /** When it was read. */
  at: string
}

export interface PlanWritingState {
  /** Which plan this is. The presses in the table beside the box name it to the server. */
  planId: string
  /** The whole plan, as the characters the box holds. */
  body: string
  /** Called with the box's own value. It normalises nothing. */
  write: (body: string) => void
  /** The plan's name, as the field holds it. Saved by the same timer as the words. */
  name: string
  /** Called with the name field's own value. It normalises nothing. */
  writeName: (name: string) => void
  /** The lines as the server last confirmed them, which is what the table view reads. */
  saved: readonly PlanLineWithWork[]
  /**
   * True when the box and the last confirmed save no longer say the same thing.
   *
   * IT IS ABOUT THE WRITING BOX AND THE NAME AND NOTHING ELSE, on purpose. The table beside the box
   * reads it to decide whether a cell may write at all, so folding the table's own typing into it
   * would make every cell refuse itself the moment somebody typed in one.
   */
  behind: boolean
  /**
   * WHETHER THIS PLAN IS STORED — the words, the name, AND the cells of the table beside them.
   *
   * `waiting` is somebody has typed, `storing` is it is on its way, `stored` is the server has it,
   * and `conflict` is it was refused. Those four are the whole of what this line may say.
   */
  saveState: SaveState
  /** What is typed and not stored in the table beside the box. Zero and zero is the ordinary case. */
  typedInTable: PlanTyping
  failure: SaveFault | null
  /**
   * A save that was refused because somebody wrote in this plan first, or null.
   *
   * While this is set NOTHING IS SENT. See `PlanConflict` and the autosave note in `schedule`.
   */
  conflict: PlanConflict | null
  /** Read the plan as it is stored now, so the person can compare it with what they have. */
  readStored: () => Promise<void>
  /**
   * Save what is on this page over what is stored, built on the copy the person has just read.
   *
   * IT REFUSES UNTIL THEY HAVE READ IT. Replacing writing you have not seen is the overwrite this
   * whole mechanism exists to stop, with one press in front of it.
   */
  replaceStored: () => Promise<SaveDone>
  /**
   * How many times the plan has changed since this page opened.
   *
   * What it is for: a sentence about a save is only true of the plan the save was about, so the
   * sentence is drawn only while this number is the number it was given at.
   */
  changeCount: number
  /**
   * The same number, for code that cannot wait for a render.
   *
   * A press reads this AFTER its save has come back, and by then more may have been typed than the
   * render it was built in knows about. One writer sets both, which is what stops them disagreeing
   * — the same arrangement `saveState` and `sayRef` are in, a few lines above.
   */
  changeCountNow: () => number
  /** When Mole Office last had this plan from the server, and how. */
  lastKnown: LastKnown
  /** Force the save now and say what it did. Answers `nothing` when there was nothing to send. */
  saveNow: () => Promise<SaveDone>
  /** Read the stored lines again, without touching the box. For after a press files or binds one. */
  refreshSaved: () => Promise<void>
  /**
   * WHICH COPY OF THIS PLAN A WRITE FROM THIS PAGE IS BUILT ON, or why there is none to write on.
   *
   * The table's cells write through this too, so a cell's save carries the same version as the writing box's and is
   * refused, not written, when somebody else wrote first (problem GR4LcaNI-XZk). It may throw when the plan cannot be
   * read.
   */
  versionToWriteOn: () => Promise<VersionToWriteOn>
  /** After somebody renamed the plan: take the name it holds now, and owe nothing. */
  takeStoredName: (stored: string) => void
  /** After somebody renamed the plan: write the name typed here over it, on purpose. */
  keepMyName: (stored: string) => Promise<SaveDone>
  /**
   * Take lines somebody else has just written, and put the words in the box as well.
   *
   * THIS IS WHAT MAKES THE TABLE AND THE DOCUMENT TWO VIEWS OF ONE STORE. The table can change the
   * characters of a line. Without this, the page went on holding the words it had, and the next
   * keystroke saved the old document back over the table's edit — measured in a browser, silently.
   *
   * IT REFUSES WHEN SOMETHING IS OWED. If a save is waiting or on its way, the person's own typing
   * is newer than these lines and must not be overwritten. It takes the lines for the table and
   * leaves the words alone, and the table already says it is showing the last stored moment.
   *
   * `version` IS THE TOKEN THE READ THESE LINES CAME FROM HANDED BACK. Without it this page no
   * longer knows which copy of the plan it is writing on top of, and the next save has to read the
   * plan to find out before it can send anything — see `versionToWriteOn`. Pass it whenever you have
   * it, which is whenever these lines came from a plan read.
   */
  putSaved: (lines: readonly PlanLineWithWork[], version?: string) => void
  /**
   * How many times the words have been adopted from somewhere else on this page.
   *
   * The box owns its characters, so React cannot be asked to put new ones in it — that is the rule
   * at the top of this file and it is measured. This number is the signal instead: when it changes,
   * the component writes the box's value by hand, once.
   */
  adoptedSeq: number
  /**
   * Lines that were filed as work and are no longer in this plan, oldest first.
   *
   * It survives a reload and it is remembered per plan in this browser, because nothing on the
   * server records that a line used to point at a record. See `LostWork`.
   */
  removed: readonly RemovedBinding[]
  /** Why this browser cannot remember that list, or null. Drawn with the list. */
  removedFault: string | null
  clearRemoved: () => void
  /**
   * POINT A LINE AT WORK THAT LOST ITS LINE. It creates nothing and changes no record.
   *
   * This is the repair for the one thing rewriting a plan destroys, and it is here so that the
   * easiest thing to do about a lost binding is to mend it. The easiest thing used to be the row's
   * own "Make it real work", which files a SECOND piece of work and leaves the first one where it
   * was, with its state and its hours, pointed at by nothing.
   *
   * A refusal comes back as words rather than a throw: the server refuses a line that already
   * points somewhere and says which record it points at, and that sentence is what the person needs.
   */
  pointAgain: (recordId: string, lineId: string) => Promise<{ ok: true } | { ok: false; why: string }>
  /** Why a move press did nothing, or null. */
  refused: string | null
  setRefused: (why: string | null) => void
}

/**
 * The document being written in, and everything that writes it back.
 *
 * It lives in a hook rather than in the component so the page can hand the same lines to the table
 * view. One store, two views, which is the rule the plan page already keeps.
 */
export function usePlanWriting(
  planId: string,
  initial: readonly PlanLineWithWork[],
  initialName: string,
  /**
   * The token naming the copy of the plan these lines came from. Every save carries it back.
   *
   * OPTIONAL, AND A PAGE THAT LEAVES IT OUT IS NOT LEFT UNPROTECTED. The page then does not know
   * which copy it is writing on top of, and the next save reads the plan to find out before it
   * sends anything — see `versionToWriteOn`. That read costs a request, so pass this when you have
   * it. What it must never do is send no precondition at all and call the save safe.
   */
  initialVersion?: string,
): PlanWritingState {
  const [body, setBody] = useState(() => bodyOfLines(initial.map((entry) => entry.line.text)))
  const [name, setName] = useState(initialName)
  const [saved, setSaved] = useState<readonly PlanLineWithWork[]>(initial)
  const [saveState, setSaveShown] = useState<SaveState>('stored')
  // Bumped when words arrive from somewhere else on this page, so the box can be written by
  // hand. React may not put characters in that box; the rule and the measurement are above.
  const [adoptedSeq, setAdoptedSeq] = useState(0)
  const [failure, setFailure] = useState<SaveFault | null>(null)
  const [conflict, setConflictShown] = useState<PlanConflict | null>(null)
  // WHAT THIS BROWSER STILL REMEMBERS ABOUT LINES THAT LOST THEIR WORK, exactly as it is stored.
  // Which of them are still lost is `stillLost`, worked out on every read. See `LostWork`.
  const [lost, setLostShown] = useState<LostWork>(() => rememberedLostWork(planId))
  const [refused, setRefused] = useState<string | null>(null)
  const [changeCount, setChangeCount] = useState(0)
  // The page has just read the plan, which is the only fact about the server it has. `nowStamp` is
  // read once, at mount, rather than on every render: a moment that keeps moving is not a moment.
  const [lastKnown, setLastKnown] = useState<LastKnown>(() => ({ how: 'read', at: nowStamp() }))

  // The characters a save sends. It is written where the text changes and NOT during a render: a
  // render can run with a state value older than the last keystroke, and a save reading that would
  // send the document as it was one character ago.
  const bodyRef = useRef(body)
  const nameRef = useRef(name)
  /**
   * WHAT THE SERVER HAS TAKEN, for the words and for the name.
   *
   * A save compares against these to work out what is owed, so "there is nothing to save" is a
   * comparison of characters and not a reading of the word on screen. It used to be the latter, and
   * that made the press and the status line the same fact worked out in two places.
   */
  const storedBodyRef = useRef(body)
  const storedNameRef = useRef(name)
  // The record each line was filed as, by line id. A body save returns rows and not records, and
  // the records are the server's while the words are the browser's, so this is kept from the fetches
  // the page has made rather than asked for again on every keystroke.
  const workRef = useRef(new Map(initial.map((entry) => [entry.line.id, entry.work])))
  /**
   * WHAT EACH LINE'S RECORD SAYS BACK — its size, its hours, its project — by line id.
   *
   * Kept beside `workRef` and for the same reason: a body save hands back rows and not records, so
   * the page carries what it last read rather than asking again on every keystroke.
   *
   * A LINE THAT IS NOT IN HERE HAS NONE, AND THAT IS THE TRUTH RATHER THAN A GAP. A save gives a
   * line whose words changed a new id and drops its binding, so a line Mole Office has never seen has no
   * record and therefore nothing to read back.
   */
  const derivedRef = useRef(new Map(initial.map((entry) => [entry.line.id, entry.derived])))
  /**
   * WHAT EACH LINE SAYS ABOUT TIME THAT NOBODY HAS SCHEDULED, in the person's own words, by line id.
   *
   * Carried exactly as `derivedRef` above is carried, and for the same reason: a body save hands
   * back rows and not what the server read from them, so the page keeps what it last read rather
   * than asking again on every keystroke. A line that is not in here has none.
   */
  const keptRef = useRef(new Map(initial.map((entry) => [entry.line.id, entry.kept])))
  /**
   * THE HOURS EACH LINE'S WORK HOLDS, planned against done, by line id.
   *
   * Carried exactly as `workRef` is carried and for the same reason: a body save hands back rows and
   * not allocations, so the planned-against-done drawing keeps what it last read rather than showing
   * "not stated" for hours that are still on the calendar. A line that is not in here has none.
   */
  const hoursRef = useRef(new Map(initial.map((entry) => [entry.line.id, entry.hours])))
  /**
   * THE RECORD'S OWN WORDS FOR EACH LINE — the explanation drawn beside it and the shorter form it
   * may take — by line id.
   *
   * Carried exactly as `workRef` is carried and for the same reason: a body save hands back rows and
   * not records, so the page keeps what it last read rather than asking again on every keystroke. A
   * line that is not in here has neither, which is the truth about a line nobody has filed.
   */
  const recordWordsRef = useRef(
    new Map(
      initial.map((entry) => [entry.line.id, { explanation: entry.explanation, shortForm: entry.shortForm }]),
    ),
  )
  /**
   * WHICH COPY OF THIS PLAN THE BOX IS BUILT ON, or null because this page does not know.
   *
   * Every save carries it back as `ifVersion`, which is what makes the server refuse a save built on
   * writing somebody has already replaced. It moves forward on every write this page makes and on
   * every read it takes, and it goes to null when lines arrive from elsewhere without one.
   */
  const versionRef = useRef<string | null>(initialVersion ?? null)

  /**
   * THE SAVE STATE, AND A REF HOLDING THE SAME VALUE FOR CODE THAT CANNOT WAIT FOR A RENDER.
   *
   * ONE WRITER writes both, which is what stops them disagreeing. The press handlers read the state
   * (a click handler is rebuilt on every render, so it always has the newest value); the unmount
   * cleanup and the queued saves read the ref, because they run outside React's render.
   */
  const sayRef = useRef<SaveState>('stored')
  const setSaveState = useCallback((next: SaveState) => {
    sayRef.current = next
    setSaveShown(next)
  }, [])

  /** The refused save, in the same one-writer arrangement, for the presses that run outside render. */
  const conflictRef = useRef<PlanConflict | null>(null)
  const setConflict = useCallback((next: PlanConflict | null) => {
    conflictRef.current = next
    setConflictShown(next)
  }, [])

  /**
   * THE LOST LINES, IN THE SAME ONE-WRITER ARRANGEMENT, AND WRITTEN INTO THIS BROWSER AS THEY MOVE.
   *
   * The ref is what a save reads — a save runs outside React's render and adds to the list — and
   * the remembering happens here rather than in an effect so that one call changes all three: the
   * ref, the screen, and what survives a reload.
   */
  const lostRef = useRef<LostWork>(lost)
  const rememberLost = useCallback(
    (next: readonly RemovedBinding[]) => {
      const key = lostWorkKey(planId)
      let fault: string | null = null
      if (next.length === 0) {
        clearStored(key)
      } else {
        const written = writeStored(key, JSON.stringify(next))
        // SAY WHEN THIS BROWSER WILL NOT REMEMBER IT. The list is the only record anywhere that a
        // piece of work has lost its line, so a storage refusal is worth a sentence rather than a
        // shrug — the alternative is a notice that quietly stops surviving reloads.
        if (!written.ok) {
          fault = t('g8.writing.browserWouldNotRememberList', { reason: written.reason })
        }
      }
      const held: LostWork = { removed: next, fault }
      lostRef.current = held
      setLostShown(held)
    },
    [planId],
  )

  /**
   * HOW MANY TIMES THE DOCUMENT HAS CHANGED, so a save cannot claim to have stored a keystroke it
   * never saw.
   *
   * Measured defect, kept fixed here: typing during a save that was already on its way left the
   * timer for the next save running, and the reply of the first one then said "Stored." A person
   * typed five more characters, read the word Stored, and those five characters were still only in
   * the browser. A save compares the count it started with against the count now, and says stored
   * only when they are the same.
   */
  const editSeq = useRef(0)
  /** The save on its way, or null. Only ever one, and the next one waits for it. */
  const flightRef = useRef<Promise<SaveDone> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * SOMEBODY WROTE IN THIS PLAN FIRST, SO NOTHING WAS WRITTEN. One place decides what that means.
   *
   * The failure banner is cleared, because this is not a failure and trying again would not fix it.
   * Every character stays in the box and in the string.
   */
  const refuse = useCallback(
    (why: string, cause?: ClashCause): SaveDone => {
      const at = nowStamp()
      setFailure(null)
      // AND THE SAVE THAT WAS ABOUT TO RUN IS CALLED OFF. A timer armed before the refusal would
      // fire into a plan this page may not write, spend a read finding that out, and be refused
      // again. `schedule` already arms no new one while a refusal stands.
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = null
      setConflict({ why, at, stored: null, readFailed: null, ...(cause === undefined ? {} : { cause }) })
      setSaveState('conflict')
      return { did: 'refused', why, at, ...(cause === undefined ? {} : { cause }) }
    },
    [setConflict, setSaveState],
  )

  /**
   * WHICH COPY OF THIS PLAN THE NEXT SAVE IS BUILT ON. It never guesses and never sends nothing.
   *
   * Usually the page knows: it was handed the token with the lines it opened on, and every write and
   * every read moves it forward. It does not know in two situations — when lines arrived from the
   * table without one (`putSaved`), and after a save was refused. Then this reads the plan and
   * compares what is stored against the words this page last saw as stored. Equal means nothing has
   * moved since and the fresh token is the right one to write on. Different means somebody wrote in
   * the meantime, and that is a conflict, not a version to write over.
   *
   * THE COMPARISON IS THE WHOLE SAFETY PROPERTY: this page never writes over words it has not seen.
   *
   * IT MAY THROW. A read that will not go through is reported by the caller as a save that did not
   * go through, which is what it is.
   */
  const versionToWriteOn = useCallback(async (): Promise<VersionToWriteOn> => {
    const held = versionRef.current
    if (held !== null) return { ok: true, version: held }
    const reply = await api.planBlocks(planId)
    workRef.current = new Map(reply.lines.map((entry) => [entry.line.id, entry.work]))
    derivedRef.current = new Map(reply.lines.map((entry) => [entry.line.id, entry.derived]))
    keptRef.current = new Map(reply.lines.map((entry) => [entry.line.id, entry.kept]))
    hoursRef.current = new Map(reply.lines.map((entry) => [entry.line.id, entry.hours]))
    recordWordsRef.current = new Map(
      reply.lines.map((entry) => [entry.line.id, { explanation: entry.explanation, shortForm: entry.shortForm }]),
    )
    setSaved(reply.lines)
    setLastKnown({ how: 'read', at: nowStamp() })
    const stored = bodyOfLines(reply.lines.map((entry) => entry.line.text))
    if (stored !== storedBodyRef.current) {
      return {
        ok: false,
        why:
          t('g8.writing.thisPlanHasChangedSinceThisPageReadIt', { n: reply.lines.length }),
      }
    }
    versionRef.current = reply.version
    return { ok: true, version: reply.version }
  }, [planId])

  /**
   * SEND THE WHOLE DOCUMENT ONCE, ON ONE TOKEN. It never throws; every ending is an outcome.
   *
   * `moved` true means the plan is no longer the copy that token names, so NOTHING was written.
   * Whether that is a conflict is not decided here — see the two calls in `sendNow`.
   */
  const putDocument = useCallback(
    async (sendBody: string, base: string): Promise<DocumentWritten> => {
      // ONLY THE REQUEST IS IN THE TRY. Everything after it is bookkeeping about a write that has
      // already happened, and a throw from any of it must not come out as "the save failed".
      let reply: Awaited<ReturnType<typeof api.writePlanBody>>
      try {
        reply = await api.writePlanBody(planId, sendBody, base)
      } catch (err) {
        const why = errorMessage(err)
        return { ok: false, moved: err instanceof ApiError && err.status === 409, why }
      }
      storedBodyRef.current = sendBody
      versionRef.current = reply.version
      const rows = reply.lines.map((line) => {
        const words = recordWordsRef.current.get(line.id)
        return {
          line,
          work: workRef.current.get(line.id) ?? null,
          derived: derivedRef.current.get(line.id) ?? [],
          kept: keptRef.current.get(line.id) ?? [],
          explanation: words?.explanation ?? null,
          shortForm: words?.shortForm ?? null,
          hours: hoursRef.current.get(line.id),
        }
      })
      setSaved(rows)
      // WHAT EACH LOST BINDING COST IS READ OFF THE REPLY HERE, through the same reader that reads
      // the list back after a reload. The route sends it — `RemovedBinding.lost` in
      // src/server/lib/plans.ts — while src/web/api.ts still types the reply with three fields and
      // is not this pass's file to widen, so the cost is checked at this door rather than believed.
      //
      // A COST THIS BUILD CANNOT READ NEVER COSTS THE PERSON THE WARNING. The loss is kept either
      // way, from the three fields the reply's own type guarantees, and the notice then says the
      // cost was not recorded rather than drawing the line as having reached nothing.
      const arrived = reply.removedBindings.map(
        (one) => oneRemovedBinding(one) ?? { text: one.text, recordId: one.recordId, title: one.title, lost: null },
      )
      if (arrived.length > 0) {
        rememberLost([...lostRef.current.removed, ...arrived])
      }
      return { ok: true, lines: reply.lines.length, rows }
    },
    [planId, rememberLost],
  )

  /**
   * WRITE THE PLAN'S NAME ON THE COPY THIS PAGE LAST SAW, AND NEVER OVER A NAME IT HAS NOT SEEN (problem GR4LcaNI-XZk).
   * It never throws: every ending is an outcome.
   *
   * `saw` is the name this page last saw stored. The write carries the page's version, so the server refuses it with
   * the code planChangedSinceRead when anybody wrote in the plan since. Whether that refusal is about THE NAME is
   * decided the way `sendNow` decides it for the words: by reading the plan and comparing.
   *
   * - The stored name is not `saw`: somebody renamed the plan. Nothing is written, and the refusal carries the stored
   *   name so the page can show it and offer the two ways on.
   * - The stored name is still `saw`: only other parts of the plan moved, and a name write cannot undo them. The name
   *   is written on the version just read. If the plan moves again in between, that refusal is returned as it is.
   *
   * THE VERSION IS KEPT ONLY WITH THE WORDS IT NAMES, the rule `putSaved` states. After a write on the page's own
   * version, the new version names the words this page holds, so it is kept. After a write on a version just read, it
   * is kept only when the stored words are still the ones this page last saw as stored; otherwise it is dropped, and
   * the next save of the words reads the plan and finds the conflict.
   */
  const putName = useCallback(
    async (
      title: string,
      saw: string,
    ): Promise<
      | { ok: true; plan: { title: string } }
      | { ok: false; why: string; fault: Fault | null; storedName?: string }
    > => {
      const lookAgain = async () => {
        const reply = await api.planBlocks(planId)
        return {
          title: reply.plan.title,
          version: reply.version,
          wordsSame: bodyOfLines(reply.lines.map((entry) => entry.line.text)) === storedBodyRef.current,
        }
      }
      const failed = (err: unknown) => ({ ok: false as const, why: errorMessage(err), fault: faultOf(err) })
      let version = versionRef.current
      let keepsWords = version !== null
      if (version === null) {
        let looked: Awaited<ReturnType<typeof lookAgain>>
        try {
          looked = await lookAgain()
        } catch (err) {
          return failed(err)
        }
        if (looked.title !== saw) {
          // FOUND BY THIS PAGE, not refused by the server, so there is no reply to draw. The sentence is the one the
          // server's code draws, so the two ways of meeting this read the same.
          return { ok: false, why: t('server.planChangedSinceRead'), fault: null, storedName: looked.title }
        }
        version = looked.version
        keepsWords = looked.wordsSame
      }
      try {
        const written = await api.savePlan(planId, { title }, version)
        versionRef.current = keepsWords ? written.version : null
        return { ok: true, plan: written.plan }
      } catch (err) {
        if (!(err instanceof ApiError && err.code === 'planChangedSinceRead')) return failed(err)
        let looked: Awaited<ReturnType<typeof lookAgain>>
        try {
          looked = await lookAgain()
        } catch {
          // The plan could not be read to tell the two cases apart, so the refusal stands as the server gave it.
          return failed(err)
        }
        if (looked.title !== saw) return { ...failed(err), storedName: looked.title }
        try {
          const written = await api.savePlan(planId, { title }, looked.version)
          versionRef.current = looked.wordsSame ? written.version : null
          return { ok: true, plan: written.plan }
        } catch (again) {
          return failed(again)
        }
      }
    },
    [planId],
  )

  /**
   * Send whatever the server has not taken, once. It never throws: a failure comes back as an
   * outcome.
   *
   * THE WORDS GO FIRST AND THE NAME SECOND. The server refuses a plan with no name, so a person who
   * selects the name and starts retyping it has an empty name for a moment; sending the words first
   * means that refusal cannot stop the writing being stored. A failure names which of the two it
   * was, because "not stored" over stored writing is its own kind of lie.
   *
   * EVERY WRITE CARRIES THE COPY IT WAS BUILT ON, and a 409 back means the plan moved. Whether that
   * is a conflict is decided by `versionToWriteOn`, not by the status: see `putDocument`.
   */
  const sendNow = useCallback(async (): Promise<SaveDone> => {
    const sendBody = bodyRef.current
    const sendName = nameRef.current
    const bodyOwed = sendBody !== storedBodyRef.current
    const nameOwed = sendName !== storedNameRef.current
    if (!bodyOwed && !nameOwed) {
      // NOTHING IS OWED, so nothing is sent and the word is the true one. This is the only place
      // that decides it, and it decides it by comparing characters.
      setFailure(null)
      setSaveState('stored')
      return { did: 'nothing', at: nowStamp() }
    }

    setSaveState('storing')
    const sentAt = editSeq.current
    let lines: number | null = null
    let items: number | null = null
    if (bodyOwed) {
      const asFailure = (why: string): SaveDone => {
        // FAIL LOUDLY AND KEEP EVERYTHING. The characters stay in the box and in the string; only
        // the claim that they are stored is withdrawn.
        setFailure({ what: 'the writing', why })
        setSaveState('failed')
        return { did: 'failed', what: 'the writing', why, at: nowStamp() }
      }
      let wrote: DocumentWritten
      try {
        const on = await versionToWriteOn()
        if (!on.ok) return refuse(on.why)
        wrote = await putDocument(sendBody, on.version)
        if (!wrote.ok && wrote.moved) {
          // THE PLAN MOVED, AND WHETHER THAT IS A CONFLICT IS NOT THE STATUS CODE'S TO SAY. Asking
          // again is what tells the two apart, and it is the same question `versionToWriteOn`
          // already answers: have the stored WORDS moved away from the ones this page last saw?
          versionRef.current = null
          const after = await versionToWriteOn()
          if (!after.ok) return refuse(after.why)
          wrote = await putDocument(sendBody, after.version)
          // Moved again between looking and writing. Somebody is writing right now; stop and say so.
          if (!wrote.ok && wrote.moved) return refuse(wrote.why)
        }
      } catch (err) {
        return asFailure(errorMessage(err))
      }
      if (!wrote.ok) return asFailure(wrote.why)
      lines = wrote.lines
      // WHAT THE SAVE UNDERSTOOD, counted where the table counts it. It is outside the try above on
      // purpose: this reads the stored document, and a document the two parsers disagree about is a
      // programming fault that must throw rather than be reported as a save that did not happen.
      items = planItemsOf(wrote.rows).items.length
    }
    if (nameOwed) {
      const named = await putName(sendName, storedNameRef.current)
      if (!named.ok) {
        setFailure({
          what: 'the name',
          why: named.why,
          fault: named.fault,
          ...(named.storedName === undefined ? {} : { storedName: named.storedName }),
        })
        setSaveState('failed')
        return { did: 'failed', what: 'the name', why: named.why, at: nowStamp() }
      }
      {
        const written = named
        // The server's own answer, not the characters that were sent. A server that stored
        // something else would otherwise be drawn as having stored what was asked for.
        storedNameRef.current = written.plan.title
        // AND THE FIELD IS PUT RIGHT WHEN THE TWO DIFFER. The server trims a name, so " My plan "
        // is stored as "My plan"; leaving the space in the field would leave the page owing a save
        // for ever while saying the plan was stored, which is the exact defect this is a fix for.
        // Only when nobody typed during the flight, or this would take a character out from under
        // a caret.
        if (written.plan.title !== sendName && editSeq.current === sentAt) {
          nameRef.current = written.plan.title
          setName(written.plan.title)
        }
      }
    }

    setFailure(null)
    const at = nowStamp()
    setLastKnown({ how: 'sent', at })
    // ONLY IF NOTHING WAS TYPED WHILE THIS WAS ON ITS WAY. Otherwise a save is still owed, a
    // timer is already running for it, and the honest word is that it is not stored yet.
    const typedSince = editSeq.current !== sentAt
    setSaveState(typedSince ? 'waiting' : 'stored')
    const what: SavedWhat = { writing: bodyOwed, name: nameOwed, lines, items }
    return typedSince ? { did: 'stored-then-typed', what, at } : { did: 'stored', what, at }
  }, [putName, refuse, setSaveState, versionToWriteOn])

  /**
   * Send the document, waiting for any save already on its way.
   *
   * ONE REQUEST AT A TIME, which was true before and is still true. What changed is that the second
   * request now WAITS for the first instead of setting a flag, so the caller gets back the outcome
   * of its own save rather than of somebody else's. Characters typed during the first flight go in
   * the second, exactly as before, because the second reads the box when it starts.
   */
  const save = useCallback((): Promise<SaveDone> => {
    const before = flightRef.current
    const mine: Promise<SaveDone> =
      before === null
        ? sendNow()
        : before.then(async (prev) => {
            const next = await sendNow()
            /**
             * NOTHING WAS LEFT TO SEND, BECAUSE THE SAVE ALREADY ON ITS WAY SENT IT. The honest
             * answer to this caller is that save's outcome and not "there was nothing to do".
             *
             * Measured: pressing "Save now" takes the focus out of the writing box, leaving the box
             * starts a save at once, and the press then chained behind it and answered "Nothing to
             * save." A person who had just typed a paragraph read that as Mole Office ignoring them.
             * `sendNow` returning nothing is the proof that the earlier save stored exactly what is
             * on screen, so its outcome is a true statement about this document.
             */
            return next.did === 'nothing' && prev.did === 'stored' ? prev : next
          }, () => sendNow())
    flightRef.current = mine
    void mine.then(() => {
      if (flightRef.current === mine) flightRef.current = null
    })
    return mine
  }, [sendNow])

  /**
   * WHAT A REFUSED SAVE DOES TO THE AUTOSAVE: IT STOPS IT, UNTIL A PERSON DECIDES.
   *
   * ---------------------------------------------------------------------------------------
   * WHY, AND WHY NOT THE OTHER TWO THINGS IT COULD DO
   * ---------------------------------------------------------------------------------------
   *
   * The autosave runs 600ms after typing stops. A save that was refused was built on a copy of the
   * plan somebody has already replaced, and TYPING MORE DOES NOT CHANGE THAT COPY. So a retry would
   * send the same precondition and be refused again, 600ms after every pause, for as long as the
   * person keeps writing. That is a request that cannot succeed, sent on a loop, with a banner
   * flickering above it.
   *
   * IT MUST NOT TAKE THE NEW VERSION AND SAVE ANYWAY. That is the silent overwrite this whole
   * mechanism exists to stop, arriving as a convenience.
   *
   * IT MUST NOT THROW AWAY WHAT THE PERSON TYPED EITHER. Nothing is reloaded into the box. Every
   * character stays where it is, the browser still asks before the tab closes, and Save and close still
   * refuses to leave.
   *
   * So typing is still counted and still kept, and nothing is sent until the person reads what is
   * stored and says what to do about it. The two ways out are on screen: read it and compare, or
   * copy your writing out of the browser.
   */
  const schedule = useCallback(
    (atOnce: boolean): Promise<SaveDone> => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = null
      const refused = conflictRef.current
      if (refused !== null) {
        return Promise.resolve<SaveDone>({
          did: 'refused',
          why: refused.why,
          at: nowStamp(),
          ...(refused.cause === undefined ? {} : { cause: refused.cause }),
        })
      }
      if (atOnce) {
        return save()
      }
      if (sayRef.current !== 'storing') setSaveState('waiting')
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void save()
      }, AFTER_TYPING_STOPS)
      // A scheduled save has not happened yet. Nothing waits on this promise; the presses call the
      // branch above, which does.
      return Promise.resolve<SaveDone>({ did: 'nothing', at: nowStamp() })
    },
    [save, setSaveState],
  )

  /** One keystroke, anywhere in the plan: count it, stop any stale answer, and owe a save. */
  const changed = useCallback(() => {
    editSeq.current += 1
    setChangeCount(editSeq.current)
    void schedule(false)
  }, [schedule])

  const write = useCallback(
    (next: string) => {
      // The ref first, and the state after it. A save started in this same turn reads the ref, and
      // React has not re-rendered yet — the whole point of holding the characters in one.
      bodyRef.current = next
      setBody(next)
      setRefused(null)
      changed()
    },
    [changed],
  )

  /** The plan's name. Same refs, same counter, same timer, same word on screen. */
  const writeName = useCallback(
    (next: string) => {
      nameRef.current = next
      setName(next)
      changed()
    },
    [changed],
  )

  /**
   * FORCE THE SAVE NOW AND SAY WHAT IT DID.
   *
   * Nothing to send is answered rather than ignored, and `sendNow` is the one place that decides
   * whether anything is owed — by comparing the characters the server has taken against the ones on
   * screen. This used to read the word the status line shows, which made the press and the line
   * beside it the same fact worked out twice.
   */
  const saveNow = useCallback((): Promise<SaveDone> => schedule(true), [schedule])

  /**
   * THE TWO WAYS ON AFTER SOMEBODY RENAMED THE PLAN (problem GR4LcaNI-XZk). `stored` is the name the refusal carried.
   *
   * Both first record that `stored` is what the plan holds, so the next name write is built on it. Then taking it puts
   * it in the field, and nothing about the name is owed. Keeping yours leaves the field as it is, so the name typed
   * here is owed and is sent at once, on top of the stored name. If the plan was renamed again in between, that write
   * is refused in the same way.
   */
  const takeStoredName = useCallback(
    (stored: string) => {
      storedNameRef.current = stored
      nameRef.current = stored
      setName(stored)
      setFailure(null)
      void schedule(true)
    },
    [schedule],
  )
  const keepMyName = useCallback(
    (stored: string): Promise<SaveDone> => {
      storedNameRef.current = stored
      setFailure(null)
      return schedule(true)
    },
    [schedule],
  )

  /**
   * READ THE STORED LINES AGAIN. It does not touch the box and it does not touch `body`.
   *
   * Filing a line as work changes the LINE on the server and nothing in the document, so after such
   * a press the browser's copy of the stored lines is one fact out of date. Re-reading the whole
   * plan is how the table learns the record's kind and state, which the filing reply does not carry
   * and which this file must not invent.
   */
  const refreshSaved = useCallback(async (): Promise<void> => {
    // Wait for a save on its way, so this cannot read the plan as it was before it landed.
    const flight = flightRef.current
    if (flight !== null) await flight
    const reply = await api.planBlocks(planId)
    workRef.current = new Map(reply.lines.map((entry) => [entry.line.id, entry.work]))
    derivedRef.current = new Map(reply.lines.map((entry) => [entry.line.id, entry.derived]))
    keptRef.current = new Map(reply.lines.map((entry) => [entry.line.id, entry.kept]))
    hoursRef.current = new Map(reply.lines.map((entry) => [entry.line.id, entry.hours]))
    recordWordsRef.current = new Map(
      reply.lines.map((entry) => [entry.line.id, { explanation: entry.explanation, shortForm: entry.shortForm }]),
    )
    // THE VERSION IS KEPT ONLY WITH THE WORDS IT NAMES (problem GR4LcaNI-XZk). This read does not touch the box, so
    // when somebody else changed the words, keeping this version would let the next save write the box's older words
    // over theirs with no refusal. Then the version is dropped, and the next save reads the plan and finds the conflict.
    const words = bodyOfLines(reply.lines.map((entry) => entry.line.text))
    versionRef.current = words === storedBodyRef.current ? reply.version : null
    setSaved(reply.lines)
    setLastKnown({ how: 'read', at: nowStamp() })
  }, [planId])

  /**
   * READ THE PLAN AS IT IS STORED NOW, so a person can see what they would be replacing.
   *
   * It changes nothing on this page except the panel that shows the two side by side. THE BOX IS NOT
   * TOUCHED: putting the stored words into it would throw away what the person typed, which is the
   * loss this whole mechanism exists to prevent, arriving from the other direction.
   */
  const readStored = useCallback(async (): Promise<void> => {
    try {
      const reply = await api.planBlocks(planId)
      const held = conflictRef.current
      if (held === null) return
      setConflict({
        ...held,
        readFailed: null,
        stored: {
          body: bodyOfLines(reply.lines.map((entry) => entry.line.text)),
          version: reply.version,
          at: nowStamp(),
        },
      })
    } catch (err) {
      const held = conflictRef.current
      if (held === null) return
      setConflict({ ...held, readFailed: errorMessage(err) })
    }
  }, [planId, setConflict])

  /**
   * SAVE WHAT IS ON THIS PAGE OVER WHAT IS STORED, on the copy the person has just read.
   *
   * IT REFUSES UNTIL THEY HAVE READ IT, and that refusal is the whole safety of the press: replacing
   * writing nobody has looked at is the silent overwrite with one button in front of it.
   *
   * The two refs are put right together, because after this press the page is writing on top of the
   * OTHER person's document: the token names their copy and "what the server has taken" is their
   * words. So a person who has typed nothing new is told there is nothing to save — which is true,
   * their document and the stored one now agree — and a person who has typed replaces it. If a third
   * write lands in between, this is refused again and they have to look again.
   */
  const replaceStored = useCallback(async (): Promise<SaveDone> => {
    const held = conflictRef.current
    if (held === null) return { did: 'nothing', at: nowStamp() }
    if (held.stored === null) {
      return {
        did: 'refused',
        why:
          t('g8.writing.nothingWasWrittenReadTheStoredPlanFirstThis'),
        at: nowStamp(),
      }
    }
    storedBodyRef.current = held.stored.body
    versionRef.current = held.stored.version
    setConflict(null)
    setSaveState('waiting')
    return save()
  }, [save, setConflict, setSaveState])

  /**
   * Take lines somebody else on this page has just written, words and all.
   *
   * The table can change the characters of a line. It writes the server and reads the plan back, and
   * before this the page went on holding the words it had — so the next keystroke saved the OLD
   * document over the table's edit, with nothing said. A checker measured exactly that and it made
   * the claim that the two views read one store false.
   *
   * WHEN SOMETHING IS OWED, THE WORDS ARE LEFT ALONE. A save waiting or in flight means the person's
   * own typing is newer than these lines, and overwriting it would be this fix causing the defect it
   * removes. The stored rows are still taken, because the table's record facts are the server's; only
   * the words are refused, and the table already says which moment it is showing.
   *
   * ---------------------------------------------------------------------------------------
   * AND THEN THE BOX MUST NOT WRITE BACK WORDS IT NEVER TOOK. THAT IS THE FIX HERE.
   * ---------------------------------------------------------------------------------------
   *
   * MEASURED, AND IT LOST A PERSON'S EDIT. Type in a cell of the table, click straight into the
   * writing box, and type: no pause between the two. The cell write lands, the table reads the plan
   * back and hands the fresh words and the fresh token over — and a save is already owed, so the
   * words are refused and only the TOKEN is taken. Six hundred milliseconds later the box saves the
   * document it has been holding all along, built on a token that names the document it has not
   * seen, and the server takes it. The cell edit is gone from the screen and from the corpus. The
   * status line read "Stored." throughout. A 0ms gap lost it every time; 500ms and above kept it,
   * because at 500ms nothing was owed and the words were adopted.
   *
   * THE TWO-TAB GUARD CANNOT CATCH THAT, and it is worth being exact about why: the guard compares
   * TOKENS, and the token this page sends is the freshest one there is. Only the WORDS are stale.
   *
   * SO THE TOKEN IS TAKEN ONLY WITH THE WORDS IT NAMES. When words arrive that the box has not
   * taken, this page says it does not know which copy it is writing on top of — which is the truth —
   * and it refuses, at once, with the same mechanism a stale save is refused by: nothing is sent,
   * every character stays in the box, the stored plan can be read and compared, and replacing it is
   * a deliberate press. It does not merge, for the reason this whole file gives: Mole Office cannot tell
   * which of two versions of a line somebody meant.
   *
   * WORDS THAT DID NOT CHANGE ARE NOT A CLASH. Filing a line as work, or giving it time, moves the
   * plan without touching a character, and the box's document is still exactly what is stored. The
   * fresh token is then the right one to write on and nothing is at risk — refusing that would be
   * showing somebody a conflict with themselves for pressing a button that is there to be pressed.
   *
   * THE COPY THIS PAGE IS WRITING ON TOP OF MOVES WITH THE LINES. A write from the table changes the
   * plan, so the token this page holds is out of date the moment these lines arrive. Given one, it is
   * taken. Given none, the page says it does not know rather than writing on a token it has made up,
   * and the next save reads the plan to find out — `versionToWriteOn`.
   *
   * AND WHEN THE WORDS ARE ADOPTED THEY ARE MARKED AS STORED, because they came from the server. This
   * used to leave the page owing a save of characters the server already had.
   */
  const putSaved = useCallback(
    (lines: readonly PlanLineWithWork[], version?: string) => {
      workRef.current = new Map(lines.map((entry) => [entry.line.id, entry.work]))
      derivedRef.current = new Map(lines.map((entry) => [entry.line.id, entry.derived]))
      keptRef.current = new Map(lines.map((entry) => [entry.line.id, entry.kept]))
      hoursRef.current = new Map(lines.map((entry) => [entry.line.id, entry.hours]))
      recordWordsRef.current = new Map(
        lines.map((entry) => [entry.line.id, { explanation: entry.explanation, shortForm: entry.shortForm }]),
      )
      setSaved(lines)
      setLastKnown({ how: 'read', at: nowStamp() })
      const words = bodyOfLines(lines.map((entry) => entry.line.text))
      if (sayRef.current === 'stored') {
        // NOTHING IS OWED, so the box takes the words and the token that names them together.
        versionRef.current = version ?? null
        if (words === bodyRef.current) return
        bodyRef.current = words
        storedBodyRef.current = words
        setBody(words)
        setAdoptedSeq((was) => was + 1)
        return
      }
      if (words === storedBodyRef.current) {
        // The plan moved and not one character of it did. See the note above.
        versionRef.current = version ?? null
        return
      }
      // WORDS THE BOX HAS NEVER HELD, and a save owed on top of them. This page does not know which
      // copy its characters are built on any more, and it says so rather than writing on a token
      // that names a document it has not read.
      versionRef.current = null
      if (conflictRef.current !== null) return
      refuse(
        t('g8.writing.theTableBesideYourWritingChangedALineWhile'),
        'table',
      )
    },
    [refuse],
  )

  /**
   * WHAT THE TABLE BESIDE THIS BOX IS HOLDING THAT NOBODY HAS STORED.
   *
   * ---------------------------------------------------------------------------------------
   * THE MEASUREMENT THIS IS A FIX FOR
   * ---------------------------------------------------------------------------------------
   *
   * Two testers watched the line above the plan say "Stored." while what they had typed was
   * unstored and about to be lost. It was true of the writing box and the name, which is all this
   * hook could see, and it was false about the plan — a person typing in a cell of the table is
   * typing into the same plan, and one line above both views claims to answer for it.
   *
   * A status line that says stored when nothing is stored is the first engineering invariant broken
   * in the smallest space there is.
   *
   * Measured in Chromium at 1600 on 17 August 2026, on the Table view: typing "2h" into a cell and
   * leaving it there read "Stored." beside the plan's name, and it still read "Stored." through six
   * cell writes that were on their way to the server. It now reads "Not stored yet." and "Storing…"
   * at those two moments, and "Stored." only once the server has it.
   *
   * IT IS READ AT RENDER AS WELL AS WATCHED, so a page drawn on the server draws the true word.
   */
  const typedInTable = useSyncExternalStore(
    useCallback((on: () => void) => watchPlanTyping(planId, on), [planId]),
    useCallback(() => planTypingNow(planId), [planId]),
    useCallback(() => planTypingNow(planId), [planId]),
  )
  /**
   * THE WORD FOR THE WHOLE PLAN. The document's own state wins whenever it has anything to say,
   * because a failure and a refusal both need reading, and the table is only asked when the
   * document has nothing owed.
   */
  const wholePlanState: SaveState =
    saveState !== 'stored'
      ? saveState
      : typedInTable.saving > 0
        ? 'storing'
        : typedInTable.typed > 0
          ? 'waiting'
          : 'stored'

  // ASK BEFORE THE TAB CLOSES ON UNSAVED WORDS OR AN UNSAVED NAME. A lost paragraph is the worst
  // thing this feature could do, and the browser's own question is the only thing that can stop a
  // close. One state covers both halves of the plan, so a rename is now guarded like a paragraph —
  // and now a cell of the table too, for the same reason: what is typed there is in this plan.
  const unstored = wholePlanState !== 'stored'
  useEffect(() => {
    if (!unstored) return
    const ask = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [unstored])

  /**
   * LEAVING THIS PAGE SENDS WHAT IS OWED. It used to cancel it.
   *
   * Measured: the browser's Back button changes the hash, a hash change does not fire
   * `beforeunload`, and this cleanup called `clearTimeout` and stopped there — so the last 600ms of
   * typing was thrown away silently. Now the timer is cleared and the save is SENT.
   *
   * A save fired here has nowhere to report a failure: this component is gone. That is not a hole
   * being papered over, it is the reason the Save and close press exists and waits for its own save.
   *
   * A REFUSED SAVE IS NOT SENT ON THE WAY OUT. It was built on a copy somebody has already replaced,
   * so the server would refuse it again and nobody would be there to hear. Sending a request that
   * cannot succeed is not a way of keeping somebody's writing. Save and close refuses to leave while it stands,
   * and the browser asks before the tab closes.
   */
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      if (sayRef.current !== 'stored' && sayRef.current !== 'conflict') void saveRef.current()
    },
    [],
  )

  /**
   * POINT A LINE AT WORK THAT LOST ITS LINE, and stop remembering the loss once it is mended.
   *
   * IT WRITES NOTHING BUT THE POINTER. The record keeps its kind, its state, its hours and its
   * title; the line keeps its words. That is the whole difference between this and filing the line
   * again, which makes a second piece of work and leaves the first one where it was.
   *
   * THE PLAN IS READ AGAIN AFTERWARDS, because the row beside the box has to show the work it now
   * points at, and the reply of this write does not carry the record's kind or its state.
   */
  const pointAgain = useCallback(
    async (recordId: string, lineId: string): Promise<{ ok: true } | { ok: false; why: string }> => {
      try {
        await api.pointLineAtWork(planId, lineId, { recordId })
      } catch (err) {
        // THE SERVER'S OWN SENTENCE. It names the record a line already points at, which is the only
        // thing a person can act on, and flattening it into "that did not work" throws that away.
        return { ok: false, why: errorMessage(err) }
      }
      await refreshSaved()
      rememberLost(lostRef.current.removed.filter((one) => one.recordId !== recordId))
      return { ok: true }
    },
    [planId, refreshSaved, rememberLost],
  )

  return {
    planId,
    body,
    write,
    name,
    writeName,
    saved,
    behind: saveState !== 'stored',
    saveState: wholePlanState,
    typedInTable,
    failure,
    conflict,
    readStored,
    replaceStored,
    changeCount,
    changeCountNow: () => editSeq.current,
    lastKnown,
    saveNow,
    refreshSaved,
    versionToWriteOn,
    takeStoredName,
    keepMyName,
    putSaved,
    adoptedSeq,
    // WHAT IS STILL LOST, worked out from the lines this page holds rather than from when the list
    // was written. A record somebody has pointed a line at is not lost, whoever did it.
    removed: stillLost(lost.removed, saved),
    removedFault: lost.fault,
    clearRemoved: () => rememberLost([]),
    pointAgain,
    refused,
    setRefused,
  }
}

/**
 * The words for one save's outcome. ONE PLACE, so the press and the tests read the same sentence.
 *
 * EVERY OUTCOME CARRIES A MOMENT, including the one where nothing was sent. The moment is what makes
 * a second press of Save visible: the words for "nothing to save" are the same words every time, so
 * without it the screen after the press is the screen before it and the press looks broken.
 */
export function sayOfSave(done: SaveDone): { words: string; at: string } {
  switch (done.did) {
    case 'nothing':
      return { words: t('g8.writing.nothingToSaveEveryCharacterWasAlreadyStored'), at: done.at }
    case 'stored':
      return { words: t('g8.writing.saved', { value1: storedWhat(done.what), value2: howAnItemStarts(done.what) }), at: done.at }
    case 'stored-then-typed':
      return {
        words:
          t('g8.writing.savedAsItWasWhenYouPressedYouHave', { value1: storedWhat(done.what) }),
        at: done.at,
      }
    case 'failed':
      return {
        words: t('g8.writing.couldNotSaveEveryCharacterIsStillOnThis', { value1: partWords(done.what) }),
        at: done.at,
      }
    case 'refused':
      return {
        words:
          done.cause === 'table'
            ? t('g8.writing.nothingWasSavedTheTableBesideYourWritingChanged')
            : t('g8.writing.nothingWasSavedSomebodyWroteInThisPlanAfter'),
        at: done.at,
      }
  }
}

/**
 * THE SHAPE OF AN ITEM, SHOWN WHEN A SAVE MADE NONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SAVE SAYS THIS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Measured on three people who had never seen Mole Office: all three typed an outline indented with
 * spaces and no markers, pressed Ctrl+S, and read "Saved the writing — this plan holds 18 lines."
 * Every one of those lines was prose. The table beside the box knew — it said so, in its own words,
 * on the screen they were not looking at — and the sentence they WERE looking at reported plain
 * success for a save that had understood nothing.
 *
 * SO IT IS SAID WHERE THE PERSON IS LOOKING, and it shows the shape rather than explaining the
 * idea: three characters, in the order they go in. `docs/UX-CONTRACT.md` forbids answering a
 * confusing surface with a paragraph, and this is the shortest true thing that can be said.
 *
 * IT IS SILENT WHEN ANYTHING BECAME AN ITEM. A person who has one item does not need to be told
 * what an item looks like, and a sentence on every save is furniture.
 */
function howAnItemStarts(what: SavedWhat): string {
  if (what.items !== 0 || what.lines === null || what.lines === 0) return ''
  return t('g8.writing.aLineBecomesAnItemWhenItStartsWith')
}

/**
 * A moment as a clock time, for the answer to a press.
 *
 * NOT `Stamp`, WHICH IS RELATIVE, AND THAT IS THE POINT. `Stamp` renders anything under 45 seconds
 * old as "just now", so pressing Save twice in a row produced two answers whose every character was
 * the same and the screen did not change. Measured: the second press of Save looked broken. A press
 * is answered with the time it was answered at.
 *
 * A stamp Mole Office cannot read is shown as it is rather than guessed at.
 */
function clockOf(stamp: string): string {
  const at = parseStamp(stamp)
  if (at === null) return stamp
  const pad = (n: number) => String(n).padStart(2, '0')
  return t('g8.writing.at', { value1: pad(at.getHours()), value2: pad(at.getMinutes()), value3: pad(at.getSeconds()) })
}

/**
 * Which halves of the plan a save sent, in words. It never says it sent something it did not.
 *
 * AND HOW MUCH OF IT MOLE OFFICE UNDERSTOOD AS WORK. The line count on its own is a measure of typing;
 * the item count is what the rest of the product can act on, and the two are far apart in exactly
 * the plan a new person writes. Both come from the save that just happened.
 */
function storedWhat(what: SavedWhat): string {
  const lines =
    what.lines === null
      ? ''
      : t('g8.writing.thisPlanHolds', { value1: what.lines, value2: what.lines === 1 ? t('g8.onePlan.line') : t('g8.onePlan.lines'), value3: itemsIn(what.items) })
  if (what.writing && what.name) return t('g8.writing.theNameAndTheWriting', { value1: lines })
  if (what.name) return t('g8.writing.theName')
  return t('g8.writing.theWritingAt1628', { value1: lines })
}

/** How many of those lines became items. Nothing is said where nothing was counted. */
function itemsIn(items: number | null): string {
  if (items === null) return ''
  if (items === 0) return t('g8.writing.andNoItems')
  return t('g8.writing.and', { value1: items, value2: items === 1 ? t('g8.writing.item') : t('g8.writing.items') })
}

// ---------------------------------------------------------------------------- the document

/**
 * WHAT A PLAN LOOKS LIKE, DRAWN IN THE EMPTY BOX INSTEAD OF EXPLAINED BESIDE IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEASUREMENT THIS EXISTS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Three people who had never seen Mole Office drove a plan from end to end. None of them was taught the
 * syntax by the product: all three worked it out from two seeded plans on the list, and the shape
 * they guessed wrong — an outline indented with spaces and no markers — is the one shape that
 * produces a plan of nothing but prose. The only help on this surface pointed the same way.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A PLACEHOLDER AND NOT A SENTENCE, AND NOT A BUTTON THAT FILLS THE BOX
 * ---------------------------------------------------------------------------------------
 *
 * `docs/UX-CONTRACT.md`: do not answer a confusing surface by adding instructions. So the shape is
 * shown where the writing happens, in the writing's own font, and it is gone at the first keystroke.
 *
 * NOTHING HERE IS EVER STORED. A placeholder is not a value: an empty plan is empty, the save owes
 * nothing, and a person who types over it is typing into an empty box. A press that wrote these
 * lines into the plan would be Mole Office putting words in somebody's document.
 *
 * EVERY LINE OF IT IS TRUE OF THE PARSER. `src/shared/plandoc.ts` reads the hash, the dash, the tick
 * box and the number, and reads everything else as writing — which is exactly what the last line
 * says about itself.
 */
function shapeOfAPlan(): string {
  return t('g8.writing.whatThisPlanIsForSomethingToDoA')
}

/**
 * WHERE A SIZE, A WHEN, A PROJECT OR A NOTE GOES ON THE LINE THE CURSOR IS IN.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEASUREMENT THIS EXISTS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A line can carry four things in its own words — `- Build the controller {size: 15h}` — and on 16
 * August 2026 the product taught that NOWHERE. Measured in Chromium on a plan with words in it: the
 * whole writing surface offered one round `?` and not one curly bracket anywhere on the page, and
 * the empty box's shape is drawn only while the box is empty. Writing is the tab a plan opens on, so
 * somebody starting there had no way to attach a size, a period or a note and no way to find out
 * that they could.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A PRESS THAT DOES IT, NOT A SENTENCE THAT DESCRIBES IT
 * ---------------------------------------------------------------------------------------
 *
 * `docs/UX-CONTRACT.md` forbids answering a confusing surface with instructions. So each press
 * carries the exact characters it writes, and pressing it puts them in the line and leaves the
 * cursor between the colon and the bracket, where the words go. Nothing has to be read first.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT GOES AT THE END OF THE LINE, AND WHY A SECOND PRESS MOVES THE CURSOR INSTEAD
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/planline.ts` reads only the run of groups at the END of a line, so a group dropped
 * where the cursor happens to sit would be prose. It goes at the end of the line the cursor is in.
 *
 * A LINE THAT ALREADY SAYS THIS IS NOT GIVEN A SECOND ONE. Two sizes on one line are two answers and
 * Mole Office moves neither — it will not pick one of two things somebody wrote. So the press selects the
 * words already there, and typing replaces them. Nothing is added and nothing is thrown away.
 */
export interface ValueOnLine {
  /** The characters to put in, or null when the line already says this and none are added. */
  put: string | null
  /** The stretch they replace. Empty — from equal to to — when nothing is being replaced. */
  from: number
  to: number
  /** Where the cursor is left afterwards, as a selection so that typing replaces what is there. */
  caretFrom: number
  caretTo: number
}

/**
 * Work out what pressing one of those does to this document, without a browser.
 *
 * `caret` is where the cursor is. The line it is in is the line that gets the value.
 */
export function valueOnLine(body: string, caret: number, key: PlanningKey): ValueOnLine {
  const at = Math.max(0, Math.min(caret, body.length))
  const lineStart = body.lastIndexOf('\n', at - 1) + 1
  const ends = body.indexOf('\n', at)
  const lineEnd = ends === -1 ? body.length : ends
  const line = body.slice(lineStart, lineEnd)
  const parsed = parsePlanLine(line)

  // THE GROUPS ARE THE RUN AT THE END, so where each one starts is the words plus every group before
  // it. `before` is the spaces between two groups, and both are kept exactly as typed.
  let walked = lineStart + parsed.text.length
  for (const value of parsed.values) {
    walked += value.before.length
    const groupStart = walked
    walked += value.source.length
    if (value.key !== key) continue
    // Inside the brackets, after the colon, past the spaces the person left there.
    const colon = value.source.indexOf(':')
    const inside = value.source.slice(colon + 1, value.source.length - 1)
    const lead = inside.length - inside.trimStart().length
    const wordsStart = groupStart + colon + 1 + lead
    return {
      put: null,
      from: wordsStart,
      to: wordsStart + value.value.length,
      caretFrom: wordsStart,
      caretTo: wordsStart + value.value.length,
    }
  }

  // A space before it unless the line is empty or already ends in one, so the group is its own word.
  const needsSpace = line !== '' && !/[ \t]$/.test(line)
  const put = `${needsSpace ? ' ' : ''}{${key}: }`
  return {
    put,
    from: lineEnd,
    to: lineEnd,
    // Between the colon and the closing bracket, which is where the words go.
    caretFrom: lineEnd + put.length - 1,
    caretTo: lineEnd + put.length - 1,
  }
}

export function PlanWriting({ state }: { state: PlanWritingState }) {
  const box = useRef<HTMLTextAreaElement>(null)
  const { body } = state

  /**
   * THE PLAN IS HANDED TO THE BOX ONCE, BY HAND, AND REACT NEVER TOUCHES ITS CONTENT AGAIN.
   * DO NOT PUT A `value` OR A `defaultValue` ON THAT TEXTAREA. THIS IS MEASURED, NOT CAUTIOUS.
   *
   * React writes the element's `defaultValue` after every keystroke — for a controlled box and for
   * an uncontrolled one alike, and even when the string it writes is identical. Writing
   * `defaultValue` replaces the textarea's child text node, and Chromium THROWS THE UNDO HISTORY
   * AWAY when that happens. Measured on this page in Chromium: two DOM changes per keystroke, five
   * characters typed, one Ctrl+Z, four still there.
   *
   * That is the same failure this whole rebuild is a correction of — "Ctrl+Z removed three of five
   * typed characters" — arriving by a different door. So the box owns the characters, every change
   * comes back through `onChange`, and the string held in React is a copy kept for the table.
   */
  const opened = useRef(body)
  useLayoutEffect(() => {
    const el = box.current
    if (el === null) return
    el.value = opened.current
    // A plan with nothing in it opens with the cursor in the box, because a document you have to
    // press something to start is not where anybody thinks. A plan with words in it does not, or
    // somebody who came to read would have the page taken away from them.
    if (opened.current === '') el.focus({ preventScroll: true })
  }, [])

  /**
   * WORDS THAT ARRIVED FROM THE TABLE, PUT INTO THE BOX BY HAND.
   *
   * The rule above stands: React never writes this element's content, because doing so throws
   * Chromium's undo history away. This is the one other writer, it runs only when `putSaved` has
   * adopted words that came from somewhere else, and it never runs on a keystroke.
   *
   * The undo history IS lost when it runs, and that is the honest trade. The alternative was
   * measured: the box kept the old document and the next keystroke saved it back over the table's
   * edit, silently. Losing an undo stack that no longer matches the document beats losing the edit.
   *
   * `adoptedSeq` rather than `body` is what this watches. Keying it on the string would fire on
   * every keystroke, which is the forbidden thing wearing a different hat.
   */
  const adopted = useRef(state.adoptedSeq)
  useLayoutEffect(() => {
    if (adopted.current === state.adoptedSeq) return
    adopted.current = state.adoptedSeq
    const el = box.current
    if (el === null) return
    el.value = state.body
  }, [state.adoptedSeq, state.body])

  const move = (way: 'up' | 'down') => {
    const el = box.current
    if (el === null) return
    const moved = moveSubtree(el.value, el.selectionStart, way)
    if (!moved.moved) {
      state.setRefused(moved.refused)
      return
    }
    state.setRefused(null)
    // THE BROWSER'S OWN INSERT, so the move joins the browser's undo history and Ctrl+Z walks it
    // back. Setting the box's value instead would throw that history away, which is the failure
    // this whole page is a correction of.
    el.setSelectionRange(moved.from, moved.to)
    const done = document.execCommand('insertText', false, moved.text)
    if (!done) {
      state.setRefused(
        t('g8.writing.thisBrowserWouldNotAddTheMoveToIts'),
      )
      return
    }
    el.setSelectionRange(moved.caret, moved.caret)
    state.write(el.value)
    void state.saveNow()
  }

  /**
   * PUT A SIZE, A WHEN, A PROJECT OR A NOTE ON THE LINE THE CURSOR IS IN.
   *
   * `valueOnLine` above decides what happens; this does it to the box. The insert goes through the
   * browser's own command so it lands on the browser's undo history and Ctrl+Z walks it back, which
   * is the same rule the Alt+arrow move follows and the reason neither writes the box's value.
   *
   * NOTHING IS SAVED FASTER THAN TYPING IS. The person is about to type the words, and the ordinary
   * pause after typing stores the line with them in it.
   */
  const addToLine = (key: PlanningKey) => {
    const el = box.current
    if (el === null) return
    el.focus({ preventScroll: true })
    const where = valueOnLine(el.value, el.selectionStart, key)
    if (where.put === null) {
      // The line already says this. The words already there are selected, so typing replaces them.
      state.setRefused(null)
      el.setSelectionRange(where.caretFrom, where.caretTo)
      return
    }
    el.setSelectionRange(where.from, where.to)
    const done = document.execCommand('insertText', false, where.put)
    if (!done) {
      state.setRefused(
        t('g8.writing.thisBrowserWouldNotAddToYourUndoHistory', { value1: where.put.trim() }),
      )
      return
    }
    state.setRefused(null)
    el.setSelectionRange(where.caretFrom, where.caretTo)
    state.write(el.value)
  }

  return (
    <div className="pw">
      <style href="mole-office-plan-writing" precedence="default">
        {PLAN_WRITING_CSS}
      </style>

      <RemovedWork state={state} />

      <div className="pw-write">
        {/* THE VISIBLE LABEL IS GONE AND THE NAME OF THE BOX IS NOT.
            It read "The plan itself", above the only writing box on the plan's own page, under a
            field already labelled "Name of this plan". A label tells one thing apart from another
            and there is nothing here to tell it apart from. What it was really doing was stopping
            people typing their plan into the name field, and the four things that fixed that are
            all on the name field itself — see `PlanName` in OnePlanPage.tsx.

            THE BOX STILL HAS A NAME, on `aria-label`, because a control a screen reader cannot name
            is worse than a label nobody needed. The words are the same words. */}
        <div className="pw-box-head">
          {/* WHAT THE KEYS DO, INCLUDING THE ONE THAT DOES NOT DO WHAT YOU EXPECT. Tab leaving the
              box is a decision and not an oversight: a box that swallowed Tab would be a box a
              keyboard could not get out of, so the plan is indented with spaces and the box is
              monospaced to make them countable. It was a paragraph under the box and the owner
              asked for standing instructions to go behind help; every word is still here. */}
          <Hint label={t('g8.writing.whatTheKeysDo')}>{t('planWriting.keysHint')}</Hint>
          {/* WHAT A LINE CAN CARRY, OFFERED WHERE THE WRITING IS.
              Each press names the value it adds at the end of the current line,
              and leaves the cursor where the words go. See `valueOnLine`.

              IT IS ALWAYS ON SCREEN, not on hover and not behind the help mark. Somebody scanning
              this page never hovers, and a control that appears only on hover is invisible to the
              person deciding whether Mole Office can do the thing they want.

              THE FOUR COME FROM `PLANNING_KEYS`, which is the file that reads them. A fifth key
              added there gets a press here with nothing to keep in step. */}
          <span className="pw-add-say" id="pw-add-say">{t('g8.writing.addToTheLineYouAreOn')}</span>
          <div className="pw-adds" role="group" aria-labelledby="pw-add-say">
            {PLANNING_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className="pw-add"
                // The words the table's column uses, so a reader meets one name for one thing.
                aria-label={t('g8.writing.putsAtTheEndOfTheLineYouAre', { value1: PLANNING_WORDS[key] })}
                onClick={() => addToLine(key)}
              >
                {PLANNING_WORDS[key]}
              </button>
            ))}
          </div>
        </div>
        <textarea
          ref={box}
          id="pw-plan-body"
          className="pw-box"
          aria-label={t('g8.writing.thePlanItself')}
          spellCheck={false}
          /* THE SHAPE OF A PLAN, SHOWN IN THE BOX A PERSON IS ABOUT TO TYPE IN.
             This is the fix for the thing nothing in the product taught: three people who had never
             seen Mole Office guessed the syntax from two plan cards on the list, and an outline indented
             with spaces and no markers — the shape they were most likely to guess — makes a plan of
             nothing but prose. The contract forbids answering that with a paragraph of instructions,
             so the shape is shown where the writing starts and it goes as soon as a character is
             typed. It is a placeholder and never a value: nothing here is ever stored, and the box
             is empty when the plan is empty. */
          placeholder={shapeOfAPlan()}
          onChange={(event) => state.write(event.currentTarget.value)}
          // Leaving the box saves at once rather than waiting out the pause. Only when something
          // is owed: a save on every blur would mark the plan as written in when nobody wrote.
          onBlur={() => {
            if (state.saveState !== 'stored') void state.saveNow()
          }}
          onKeyDown={(event) => {
            // THE ONLY KEY THIS PAGE ANSWERS. Everything else — selecting, undoing, cutting,
            // pasting, selecting all — is the browser's and is deliberately not touched.
            if (!event.altKey || event.ctrlKey || event.metaKey) return
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
            event.preventDefault()
            move(event.key === 'ArrowUp' ? 'up' : 'down')
          }}
        />
        {state.refused === null ? null : <p className="pw-refused">{state.refused}</p>}
      </div>

      <WhatTheseLinesBecame state={state} />
    </div>
  )
}

/**
 * WHAT EACH LINE'S SIZE, HOURS AND PROJECT SAY NOW, BESIDE THE WRITING AND NEVER IN IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE THIRD LAYER OF THIS SCREEN, AND WHY IT IS NOT IN THE BOX
 * ---------------------------------------------------------------------------------------
 *
 * A line may say how big it is, when it is to be done and which project it is in, in its own words:
 * `- Build the controller {size: 15h}`. Filing the line as work moves each of those to the place
 * Mole Office keeps that kind of fact and TAKES IT OUT OF THE WORDS, because the same fact in two places
 * is the defect this repository keeps finding.
 *
 * That left the values nowhere a person writing could see them. The owner named it: no duplicate
 * storage must not become canonical facts disappearing from one of the two views of a plan. So the
 * screen has three layers — what you typed, in the box; what it became, here; and where it lives
 * now, which is the record.
 *
 * THEY ARE NOT PUT BACK IN THE BOX, and that is the whole design. The box is what the person typed.
 * Writing a stored value into it would make it editable as prose, so a typo would become a record
 * write — and once it is in there nothing can tell it from what they wrote, which is the second
 * store coming back through another door. Beside, marked, and read-only keeps the honesty and loses
 * nothing: the value is on screen and the words say where it lives.
 *
 * NOTHING HERE IS TYPED IN. There is no field, no border and no press: it is a reading, and the
 * places these are changed are the record and the table.
 *
 * ---------------------------------------------------------------------------------------
 * IT SAYS EACH THING ONCE, AND IT NO LONGER EXPLAINS THE DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * Measured in Chromium on 16 August 2026: 176 words in a panel 495px wide, of which 87 were ONE
 * sentence repeated three times, once per value — "You wrote this and nothing has been scheduled
 * from it. It is kept exactly as you wrote it, it adds nothing to any week and it uses no capacity."
 * The owner read it and said normal mode must stop defending storage semantics to an engineer.
 *
 * SO THE VALUE STAYS AND THE ACCOUNT OF WHERE IT LIVES MOVES TO INSPECT. What a reader needs here is
 * the value beside the line it belongs to, and, for words nothing was made of, that nothing has been
 * scheduled from them. That is two words and it is drawn once per value. Where the one stored copy
 * is, and the paragraph about what filing moved, are the machinery, and `docs/UX-CONTRACT.md` puts
 * derived-against-stored diagnostics in Inspect. Nothing is deleted and nothing needs a search.
 */
function WhatTheseLinesBecame({ state }: { state: PlanWritingState }) {
  const inspect = useInspect()
  const rows = state.saved.filter((entry) => entry.derived.length > 0)
  if (rows.length === 0) return null
  return (
    <div className="pw-became">
      <h3 className="pw-became-head" data-title-is="its-label">{t('g8.writing.whatTheseLinesBecame')}</h3>
      <ul className="pw-became-list">
        {rows.map((entry) => (
          <li key={entry.line.id} className="pw-became-row">
            <p className="pw-became-line">
              {entry.line.text.trim() === '' ? t('g8.writing.aBlankLine') : entry.line.text}
            </p>
            <dl className="pw-became-values">
              {sameThingSaidOnce(entry.derived).map((value, at) => (
                <div className="pw-became-value" key={`${value.key}-${at}`} data-kept={!value.canonical}>
                  <dt className="pw-became-key">{PLANNING_WORDS[value.key]}</dt>
                  <dd className="pw-became-said">
                    {/* THE WEEK IS NAMED THE WAY A PERSON SAYS IT, and Inspect keeps the stored
                        key. The same rule as the Time given cell of the table, from the same one
                        namer, so the panel and the cell cannot call one week two things. */}
                    <span className="pw-became-words">{valueInWords(value.says, inspect)}</span>
                    {/* HOW MANY OF THEM THERE ARE, when there is more than one. The same words used
                        to be listed twice, drawn identically, with nothing to tell the two apart —
                        so a reader could not tell whether they had written it once or twice. */}
                    {value.times === 1 ? null : <span className="pw-became-times">{howMany(value.times)}</span>}
                    {/* WORDS NOBODY COULD SCHEDULE SAY SO, with a label of their own. They are
                        not a fact, they enter no total, and a panel that drew them exactly like an
                        allocation would be claiming an interpretation nobody made. */}
                    {value.canonical ? null : <span className="pw-became-state">{t('g8.writing.notScheduledYet')}</span>}
                    {!inspect ? null : (
                      <span className="pw-became-where">
                        {value.canonical ? t('g8.writing.storedIn', { value1: value.storedIn }) : t('g8.writing.nothingScheduled', { value1: value.storedIn })}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One derived value, with how many identical ones the line carries. */
export type DerivedValueSeen = DerivedValue & { times: number }

/**
 * THE SAME VALUE, SAID ONCE, WITH HOW MANY OF THEM THERE ARE.
 *
 * Two identical values are two rows in the store — two kept phrases, or two allocations of the same
 * hours in the same week — and drawing them as two identical lines of a panel tells a reader nothing
 * except that they are seeing double. Measured on the owner's screen: "sometime next week" listed
 * twice, character for character, with no way to tell the two apart.
 *
 * NOTHING IS DROPPED AND NOTHING IS MERGED IN THE STORE. Both rows are still there and the count is
 * what says so. Values differing in any part — the words, the key, whether they are canonical, where
 * they are stored — are different facts and stay on their own lines.
 */
export function sameThingSaidOnce(values: readonly DerivedValue[]): DerivedValueSeen[] {
  const seen: DerivedValueSeen[] = []
  for (const value of values) {
    const same = seen.find(
      (one) =>
        one.key === value.key &&
        one.says === value.says &&
        one.canonical === value.canonical &&
        one.storedIn === value.storedIn,
    )
    if (same === undefined) seen.push({ ...value, times: 1 })
    else same.times += 1
  }
  return seen
}

/** How many of one identical value there are, in words. Never drawn for one. */
function howMany(times: number): string {
  return times === 2 ? t('g8.writing.twice') : t('g8.writing.times', { value1: times })
}


/**
 * WHETHER THIS PLAN IS STORED, AND THE TWO PRESSES THAT STORE IT.
 *
 * IT IS ABOUT THE WHOLE PLAN — the name and the words — and it is drawn on every view of the plan,
 * because the name can be written in on every view. It used to sit inside the writing view only,
 * about the words only, an inch from a name field it said nothing about.
 *
 * THE STATUS LINE IS THE SAME SIZE AS THE WRITING and sits next to the press that changes it. It
 * used to be the smallest, faintest text on a page whose box is 60vh tall, and it is the only
 * evidence that anything survived.
 */
export function PlanSaveBar({ state }: { state: PlanWritingState }) {
  /**
   * WHAT THE LAST PRESS DID, and the plan it was true of.
   *
   * `atChange` is the plan's change count when the answer was given. The sentence is drawn only
   * while that is still the change count now, so an answer cannot outlive the plan it described.
   * Measured: "Nothing to save. Every character was already stored." sat under a red banner saying
   * the writing was not stored, because the sentence had no way to go.
   */
  const [said, setSaid] = useState<{ words: string; at: string; atChange: number } | null>(null)
  const [busy, setBusy] = useState<'save' | 'done' | null>(null)

  const pressSave = useCallback(async () => {
    setBusy('save')
    const done = await state.saveNow()
    const words = sayOfSave(done)
    setSaid({ ...words, atChange: state.changeCountNow() })
    setBusy(null)
  }, [state])

  const pressDone = async () => {
    const stillHere = stillOnThisPage()
    setBusy('done')
    const done = await state.saveNow()
    setBusy(null)
    /**
     * IT ALSO REFUSES TO LEAVE ON A CELL NOBODY HAS STORED, and that is the same rule as the rest of
     * this press. `saveNow` saves the writing box and the name; a cell of the table beside them is
     * written by the table, and leaving the page takes the row off the screen with the characters
     * still in it. The plan is what this press is about, so it waits for all of the plan.
     */
    const inTable = state.typedInTable
    if ((done.did === 'nothing' || done.did === 'stored') && inTable.typed === 0 && inTable.saving === 0) {
      if (stillHere()) navigate(plansPath())
      return
    }
    if (done.did === 'nothing' || done.did === 'stored') {
      setSaid({
        words:
          inTable.saving > 0
            ? t('g8.writing.youAreStillHereBecauseAChangeInThe')
            : t('g8.writing.youAreStillHereBecauseACellInThe'),
        at: done.at,
        atChange: state.changeCountNow(),
      })
      return
    }
    // IT REFUSES TO LEAVE, AND SAYS SO. Walking away from a failed save is how a paragraph is lost.
    setSaid({
      words:
        done.did === 'failed'
          ? t('g8.writing.youAreStillHereBecauseIsNotStoredThe', { value1: partWords(done.what) })
          : done.did === 'refused'
            ? t('g8.writing.youAreStillHereBecauseYourWritingIsNot')
            : t('g8.writing.youAreStillHereBecauseYouTypedWhileThat'),
      at: done.at,
      atChange: state.changeCountNow(),
    })
  }

  /**
   * CTRL+S AND CMD+S ARE THE SAME PRESS AS "Save now".
   *
   * It is on the window and not on the box, because a person who has just pressed something else on
   * this page still means "save my plan" — and because the browser's own answer, a dialog offering
   * to save the page as an HTML file, is a wrong answer to that gesture on a page that saves.
   *
   * This is not the key handling the top of this file warns about. Selecting, undo, cut, copy,
   * paste and select all are still untouched.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 's' && event.key !== 'S') return
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      event.preventDefault()
      void pressSave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pressSave])

  const showSaid = said !== null && said.atChange === state.changeCount

  return (
    <div className="pw-bar">
      <style href="mole-office-plan-writing" precedence="default">
        {PLAN_WRITING_CSS}
      </style>
      <SaveSay state={state} />
      <div className="pw-acts">
        <Btn variant="secondary" size="sm" onClick={() => void pressSave()} pending={busy === 'save'}>{t('g8.schedulePage.saveNow')}</Btn>
        {/* IT SAID "Done" UNTIL 18 AUGUST 2026 AND THAT WAS THE WRONG WORD.
            A tester listed three things called Done and found they meant two different things: this
            one, which stops writing; a record whose state is done, which means the work is finished;
            and the schedule's Done press, which also means the work is finished. The two that mean
            the work is finished keep the word. This one says what it does — it stores everything and
            takes you back to the plans list — and the plan table below it now draws a "Say it is
            done" press on a row whose work is unfinished, so both words are on this very screen. */}
        <Btn variant="primary" size="sm" onClick={() => void pressDone()} pending={busy === 'done'}>{t('g8.writing.saveAndClose')}</Btn>
        {/* "Ctrl+S saves too." used to sit here. It was the same fact as the sentence under the
            writing box, in two places, free to disagree. The key is named once, behind the mark on
            the box's label. */}
      </div>
      {!showSaid ? null : (
        <p className="pw-said" role="status">
          {said.words} <span className="pw-said-at">{clockOf(said.at)}</span>
        </p>
      )}
    </div>
  )
}

/**
 * WORK THAT LOST ITS LINE, AND THE ONE PRESS THAT GIVES IT ANOTHER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED, AND WHY IT IS STAYING THAT WAY
 * ---------------------------------------------------------------------------------------
 *
 * A line keeps the record it was filed as only while its characters are unchanged, because the
 * alternative is guessing which line "is" which and moving somebody's work onto a line nobody bound.
 * So rewriting a filed line's words takes the record off it. That is deliberate, specified and
 * tested, and it stays.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG WAS EVERYTHING AFTER IT
 * ---------------------------------------------------------------------------------------
 *
 * The page said so once, in a note whose only press made the note go away, and a reload made it go
 * away by itself. Afterwards the row beside the box said "Nobody has filed this line as work" and
 * the easiest thing on the screen was "Make it real work" — which files a SECOND piece of work and
 * leaves the first one exactly where it was, with its state, its hours and its links, pointed at by
 * nothing. A person following the easiest path ended up with two records for one job and no sign
 * that they had.
 *
 * THREE THINGS ARE DIFFERENT HERE. The list survives a reload, because nothing on the server
 * remembers that a line used to point at a record and this browser is the only place it is written
 * down. The repair is on the notice, so mending the line is easier than filing it again. And the
 * sentence names what filing it again would do, because that press is still one column away and
 * nothing else on the screen says.
 *
 * AND A FOURTH, ADDED 17 AUGUST 2026: EACH LOSS NAMES WHAT IT COST. The notice said a line was gone
 * and offered the repair while saying nothing about the estimate, the hours and the project that
 * went with it — so a plan's total fell by three hours with the reason on screen and unreadable.
 * `WhatItNoLongerReaches` below draws it, and it is remembered with the loss so a reload keeps it.
 *
 * THE RECORD ITSELF IS UNTOUCHED and the first sentence says so, because that is the thing a person
 * is afraid of when they read this.
 */
function RemovedWork({ state }: { state: PlanWritingState }) {
  const inspect = useInspect()
  /**
   * What the last press did, for the whole notice.
   *
   * It is held here rather than on the row because a row that is mended LEAVES THE LIST — the whole
   * point of the press — and a sentence held inside it would go with it, so the press would look
   * like nothing had happened.
   */
  const [said, setSaid] = useState<string | null>(null)
  if (state.removed.length === 0 && said === null) return null
  const count = state.removed.length
  // LINES THAT COULD POINT AT IT: the ones in this plan that point at nothing. A line that already
  // names a record is not offered, because pointing it somewhere else would be this notice causing
  // the loss it is about.
  const free = state.saved.filter(
    (entry) => entry.line.recordId === null && entry.line.text.trim() !== '',
  )
  return (
    <div className="pw-lost" role="status">
      {count === 0 ? null : (
        <>
          <p className="pw-lost-say">{t('planWriting.lostCount', { n: count })}</p>
          <ul className="pw-lost-list">
            {state.removed.map((one, at) => (
              <LostLine
                key={`${one.recordId}-${at}`}
                lost={one}
                free={free}
                pointAgain={state.pointAgain}
                onSaid={setSaid}
              />
            ))}
          </ul>
          {state.removedFault === null ? null : (
            <p className="pw-lost-keep">
              {inspect ? state.removedFault : t('g8.writing.cannotRememberLostLines')}
            </p>
          )}
          {/* IT SAYS WHAT IT DOES AND NOT WHAT IT MEANS. This press stops Mole Office remembering the
              loss; it does not mend anything and it does not touch the work. "Got it" used to sit
              here, which reads as agreement and was the only press on the notice. */}
          <Btn variant="secondary" size="sm" onClick={state.clearRemoved}>{t('g8.writing.stopShowingThis')}</Btn>
        </>
      )}
      {said === null ? null : <p className="pw-lost-said">{said}</p>}
    </div>
  )
}

/**
 * ONE PIECE OF WORK THAT LOST ITS LINE, AND THE LINE A PERSON CHOOSES FOR IT.
 *
 * NOTHING IS CHOSEN FOR THEM. Mole Office could look for the line whose words are most like the ones
 * that went, and that is precisely the guess the binding rule refuses to make on their behalf —
 * a near match would put somebody's work on a line they did not mean. So the list opens on nothing
 * chosen, and the press says so rather than acting on a line it picked itself.
 */
function LostLine({
  lost,
  free,
  pointAgain,
  onSaid,
}: {
  lost: RemovedBinding
  free: readonly PlanLineWithWork[]
  pointAgain: PlanWritingState['pointAgain']
  onSaid: (words: string) => void
}) {
  const inspect = useInspect()
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)
  // THE WORK'S OWN NAME, AND NEVER ITS ID AT A NORMAL READER. A record with no title here is one
  // Mole Office cannot find at all, which is a different thing from a nameless one, so it is said in
  // words rather than by printing the id somebody would have to go and look up.
  const named = lost.title ?? (inspect ? lost.recordId : t('g8.writing.workMoleOfficeCannotFindAnyMore'))

  const point = async () => {
    const line = free.find((entry) => entry.line.id === chosen)
    if (line === undefined) {
      onSaid(t('g8.writing.nothingWasWrittenChooseTheLineThatShouldPoint', { value1: named }))
      return
    }
    setBusy(true)
    const done = await pointAgain(lost.recordId, line.line.id)
    setBusy(false)
    onSaid(
      done.ok
        ? t('g8.writing.thatLinePointsAtNowAndNoNewWork', { value1: named })
        : // THE SERVER'S OWN REFUSAL, WITH ITS IDS TAKEN OUT FOR A NORMAL READER. It names the work
          // the line already points at, which is the half a person acts on, and the id beside that
          // name is the half they cannot. See `withoutRecordIds`.
          t('g8.writing.nothingWasWritten', { value1: inspect ? done.why : withoutRecordIds(done.why) }),
    )
  }

  return (
    <li className="pw-lost-one">
      <p className="pw-lost-was">
        <span className="pw-lost-text">{lost.text === '' ? t('g8.writing.aBlankLine') : lineWithMaths(lost.text)}</span>
        <span className="pw-lost-work">{t('g8.writing.wasFiledAs', { value1: named })}</span>
      </p>
      <WhatItNoLongerReaches lost={lost.lost} />
      {free.length === 0 ? (
        <p className="pw-lost-none">{t('planWriting.noFreeLine')}</p>
      ) : (
        <div className="pw-lost-fix">
          <label className="pw-lost-pick">
            <span className="pw-lost-pick-say">{t('g8.writing.theLineThatMeans', { value1: named })}</span>
            <select
              className="pw-lost-choose"
              value={chosen}
              onChange={(event) => setChosen(event.currentTarget.value)}
            >
              <option value="">{t('g8.writing.chooseALine')}</option>
              {free.map((entry) => (
                <option key={entry.line.id} value={entry.line.id}>
                  {entry.line.text.trim()}
                </option>
              ))}
            </select>
          </label>
          <Btn variant="secondary" size="sm" onClick={() => void point()} pending={busy}>{t('g8.writing.pointThatLineAtIt')}</Btn>
        </div>
      )}
    </li>
  )
}

/**
 * WHAT THE PLAN REACHED THROUGH THAT LINE AND CANNOT REACH NOW.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEASUREMENT THIS EXISTS FOR, 16 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * Somebody renamed a line that was filed as work, saved, and reloaded. The line lost the work it
 * named, a three-hour estimate and the hours it held on 2026-08-18, and the plan's total fell from
 * nine hours to six. The notice above said a line was no longer in the plan and offered to point one
 * at the work again. IT DID NOT SAY WHAT THE PLAN HAD JUST STOPPED COUNTING, so the only visible
 * change was a total that was three hours smaller than it had been a second earlier.
 *
 * THE VALUES ARE THE SERVER'S AND ARE NOT WORKED OUT AGAIN HERE. The save's reply carries them, read
 * from the same function that says what a bound line shows, so "what this line reaches" and "what
 * this line stopped reaching" cannot come to mean two different things. The heading over each one is
 * `PLANNING_WORDS`, which is what the table heads the same value with.
 *
 * THEY SURVIVE A RELOAD because they are remembered with the loss — see `LostWork`. A warning that
 * only exists in the tab that caused it is a warning the person who reloads never gets, and this one
 * is about a number they will next see on a different day.
 *
 * NOTHING WAS DELETED, AND THAT IS THE LAST SENTENCE. Every value here is still on the work,
 * unchanged; what changed is that no line of this plan points at it.
 */
function WhatItNoLongerReaches({ lost }: { lost: readonly LostValue[] | null }) {
  const inspect = useInspect()
  // THE TWO EMPTY ANSWERS ARE DRAWN APART, which is what `Absence` exists for and is the fifth
  // invariant on a screen. NOBODY WROTE IT DOWN is a loss this browser remembered before Mole Office
  // recorded what one costs; NONE is Mole Office having looked and found nothing to lose. Neither is a
  // sentence a person has to act on, so both are a word beside the line rather than a paragraph,
  // and the whole sentence is on the mark for whoever wants it.
  if (lost === null) {
    return (
      <p className="pw-lost-cost-none">
        {t('g8.writing.whatItReached')}{' '}
        <Absence
          tier="told-apart"
          looked={false}
          word={t('g8.writing.notRecorded')}
          title={t('g8.writing.thisLossWasRememberedBeforeMoleOfficeStartedRecording')}
        />
      </p>
    )
  }
  if (lost.length === 0) {
    return (
      <p className="pw-lost-cost-none">
        {t('g8.writing.whatItReached')}{' '}
        <Absence
          tier="told-apart"
          looked
          word={t('absence.none')}
          title={t('g8.writing.nothingWasStoredOnItSoNoNumbersLeft')}
        />
      </p>
    )
  }
  return (
    <div className="pw-lost-cost">
      <p className="pw-lost-cost-say">{t('g8.writing.thisPlanCanNoLongerSee')}</p>
      <dl className="pw-lost-cost-list">
        {lost.map((one, at) => (
          <div className="pw-lost-cost-one" key={`${one.key}-${at}`}>
            <dt className="pw-lost-cost-key">{PLANNING_WORDS[one.key]}</dt>
            {/* THE WEEK IS NAMED THE WAY A PERSON SAYS IT. The hours that left this plan sat in a
                week, and the server writes that week as the key it is stored under. Inspect keeps
                the sentence as it was sent. */}
            <dd className="pw-lost-cost-said">{valueInWords(one.says, inspect)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * Whether this plan is stored, in one line. It covers the name and the words.
 *
 * IT NEVER SAYS STORED WHEN IT IS NOT. A failed save is a loud note with the server's own sentence,
 * a press to try again, and two presses that get the writing out of the browser.
 *
 * AND IT SAYS WHEN, BECAUSE "Stored." ON ITS OWN IS A CLAIM ABOUT NOW THAT NOBODY HAS CHECKED.
 * Measured: two tabs open on one plan both said "Stored." while one had just written over a line
 * the other still had on screen. This page never asks the server again while somebody is writing —
 * a re-fetch would fight the caret — so the honest form of the word is a moment and how Mole Office got
 * it. The three words already drawn are unchanged; the moment is the sentence after them.
 */
function SaveSay({ state }: { state: PlanWritingState }) {
  /**
   * THE BANNER STAYS UP WHILE THE RETRY IS ON ITS WAY, and that is a fix, not a detail.
   *
   * It used to be drawn from `saveState === 'failed'` alone, so a retry swapped the whole banner
   * for the word "Storing…" and swapped it back a moment later. Measured: pressing "Copy the whole
   * plan" took the focus out of the writing box, leaving the box started a fresh save, the banner
   * came off the screen between the press going down and coming up, and the press was swallowed —
   * a button that got the writing out of a broken save, silently doing nothing.
   *
   * It is also the truer drawing. A save that failed and is being tried again has not stored
   * anything yet, so the honest line to show is still the failure, with a word saying it is trying.
   */
  // SOMEBODY ELSE WROTE FIRST. It is drawn before the failure banner because it is not a failure and
  // the two cannot both be true: a refused save clears the failure and a failed save clears this.
  if (state.conflict !== null) return <SomebodyElseWrote state={state} conflict={state.conflict} />
  const fault = state.failure
  if (fault !== null) {
    return (
      // THE WAYS OUT SIT UNDER THE NOTE AND NOT INSIDE IT. Measured at 390: the note's own row of
      // presses does not wrap, so two more presses in it ran off the right edge of the screen and
      // the page scrolled sideways, which this product does nowhere.
      <div className="pw-fault">
        <ErrorNote
          label={t('g8.writing.isNotStored', { value1: upperFirst(partWords(fault.what)) })}
          message={fault.why}
          fault={fault.fault ?? null}
          // TRYING AGAIN CANNOT HELP A NAME SOMEBODY ELSE CHANGED: it would be refused the same way. The two presses
          // below are the ways on instead.
          {...(fault.storedName === undefined ? { retry: () => void state.saveNow() } : {})}
        />
        {fault.storedName === undefined ? null : <StoredNameChoice state={state} stored={fault.storedName} />}
        <WaysOut state={state} />
        {/* IT SITS UNDER THE PRESSES AND NOT ABOVE THEM, AND THAT IS NOT A TASTE. Pressing one of
            those presses takes the focus out of the writing box, leaving the box starts a save, and
            a line appearing above the presses moved them down between the mouse going down and
            coming up — so the press landed on nothing and the person's writing did not come out.
            Measured. Nothing that appears while a save is running may sit above a press. */}
        {state.saveState === 'storing' ? <p className="pw-trying">{t('g8.writing.tryingAgain')}</p> : null}
      </div>
    )
  }
  const say =
    state.saveState === 'stored' ? t('g8.writing.stored') : state.saveState === 'storing' ? t('g8.writing.storing') : t('g8.writing.notStoredYet')
  return (
    <div className="pw-say-box">
      <span className="pw-say" data-state={state.saveState} aria-live="polite">
        {say}
      </span>
      {/* THE MOMENT STAYS ON SCREEN AND THE CAVEAT GOES BEHIND THE MARK. "Stored." with no moment
          beside it is a claim about now that nobody has checked, so the moment is first-glance. Why
          the moment matters is a sentence the reader does not act on, so it is one press away. */}
      <div className="pw-say-when">
        <span>
          {state.lastKnown.how === 'sent' ? t('g8.writing.sentAndAccepted') : t('g8.writing.readFromTheServer')}{' '}
          <Stamp at={state.lastKnown.at} />
        </span>
      </div>
    </div>
  )
}

/**
 * SOMEBODY RENAMED THE PLAN AFTER THIS PAGE READ IT, AND THE TWO WAYS ON (problem GR4LcaNI-XZk).
 *
 * The name the plan holds now is shown as it is stored, because it is content. Taking it puts it in the field; keeping
 * yours writes the name in the field over it, on purpose, now that it has been seen.
 */
function StoredNameChoice({ state, stored }: { state: PlanWritingState; stored: string }) {
  return (
    <div className="pw-name-clash">
      <p className="pw-name-clash-say">{t('planStores.storedNameIs', { name: stored })}</p>
      <div className="pw-out-acts">
        <Btn size="sm" variant="secondary" onClick={() => state.takeStoredName(stored)}>{t('planStores.useStoredName')}</Btn>
        <Btn size="sm" variant="secondary" onClick={() => void state.keepMyName(stored)}>{t('planStores.keepMyName')}</Btn>
      </div>
    </div>
  )
}

/** "the writing" becomes "The writing", so a label can start with it. */
function upperFirst(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * SOMEBODY WROTE IN THIS PLAN FIRST, AND WHAT A PERSON CAN DO ABOUT IT.
 *
 * ---------------------------------------------------------------------------------------
 * THREE THINGS THIS DELIBERATELY DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * IT DOES NOT MERGE. Mole Office cannot tell which of two versions of a sentence somebody meant, and a
 * product that picked one would be inventing the answer. It shows both and a person decides.
 *
 * IT DOES NOT RELOAD THE BOX. Putting the stored words where the person is writing would throw away
 * what they typed — the same loss this exists to prevent, arriving from the other direction.
 *
 * IT DOES NOT REPLACE ANYTHING UNTIL SOMEBODY HAS READ WHAT THEY ARE REPLACING. The press that
 * writes over the other person's plan appears only after the stored plan is on screen.
 *
 * The server's own sentence is behind a mark rather than on the page: it is written for whoever
 * calls the route, so it names the route, and a route name is not something to put in front of
 * somebody who was writing a plan. Every word of it is still here, one press away.
 */
function SomebodyElseWrote({ state, conflict }: { state: PlanWritingState; conflict: PlanConflict }) {
  const [busy, setBusy] = useState<'read' | 'replace' | null>(null)
  const [said, setSaid] = useState<{ words: string; at: string } | null>(null)

  const read = async () => {
    setBusy('read')
    setSaid(null)
    await state.readStored()
    setBusy(null)
  }

  const replace = async () => {
    setBusy('replace')
    const done = await state.replaceStored()
    setBusy(null)
    setSaid(sayOfSave(done))
  }

  const stored = conflict.stored
  return (
    <div className="pw-fault">
      <div className="pw-clash" role="status">
        {/* WHO WROTE, WHEN THIS PAGE KNOWS, AND THE ALWAYS-TRUE SENTENCE WHEN IT DOES NOT.
            The table beside this box can move the plan without anybody else being involved, and
            telling a person that "somebody wrote in this plan first" when the somebody was their own
            press is a conflict with themselves. Where the page did not see it happen it says what it
            knows and no more. See `ClashCause`. */}
        <p className="pw-clash-lead">
          {conflict.cause === 'table'
            ? t('g8.writing.theTableBesideYourWritingChangedALineWhileAt2644')
            : t('g8.writing.somebodyWroteInThisPlanFirstSoNothingWas')}
        </p>
        <div className="pw-clash-when">
          <span>
            {t('g8.writing.refused')}<Stamp at={conflict.at} />
          </span>
          <ServerNote text={conflict.why} />
        </div>
        <div className="pw-out-acts">
          <Btn size="sm" variant="secondary" onClick={() => void read()} pending={busy === 'read'}>
            {stored === null ? t('g8.writing.readWhatIsStoredNow') : t('g8.writing.readItAgain')}
          </Btn>
        </div>
        {conflict.readFailed === null ? null : (
          <p className="pw-clash-fault">{t('g8.writing.theStoredPlanCouldNotBeReadSoThere', { value1: conflict.readFailed })}</p>
        )}
        {stored === null ? null : (
          <div className="pw-clash-stored">
            <p className="pw-clash-head">
              {t('g8.writing.whatIsStoredNowRead')}<Stamp at={stored.at} /> —{' '}
              {stored.body === '' ? '—' : t('g8.writing.lines', { value1: countLines(stored.body) })}
            </p>
            <StoredPlan body={stored.body} />
            <div className="pw-out-acts">
              <TieredPress tier="confirm" size="sm" press={t('g8.writing.replaceItWithWhatIsOnThisPage')}
                pending={t('g8.schedulePage.saving')} cancel={t('g8.onePlan.keepIt')} disabled={busy !== null}
                question={t('g8.writing.replaceTheStoredPlan')} quote={state.name}
                warning={t('g8.writing.thisReplacesTheStoredWritingShownAboveWithThe')}
                onPress={replace} />
            </div>
            {/* WHAT IT COSTS, SAID BEFORE IT IS PRESSED — and whose writing it is. Where the table
                made the change there is no "they": the person is about to write over their own
                edit, and telling them somebody else made it would be the wrong warning. */}
            <p className="pw-clash-warn">
              {conflict.cause === 'table'
                ? t('g8.writing.thatWritesYourDocumentOverTheOneAboveThe')
                : t('g8.writing.thatWritesYourDocumentOverTheOneAboveWhat')}
            </p>
          </div>
        )}
        {said === null ? null : (
          <p className="pw-clash-said" role="status">
            {said.words} <span className="pw-said-at">{clockOf(said.at)}</span>
          </p>
        )}
      </div>
      <WaysOut state={state} />
    </div>
  )
}

/** How many lines a document holds. One line with no ending is one line, and so is an empty one. */
function countLines(body: string): number {
  return body.split('\n').length
}

/**
 * THE PLAN AS IT IS STORED, TO READ AGAINST WHAT IS IN THE BOX, WITH ITS EDGES MARKED.
 *
 * It is capped at 30vh and scrolls, which is right — the whole of somebody else's plan does not
 * belong in a warning — but a reader deciding whether to replace their words with these needs to
 * know they are not looking at all of them. See components/InReach.tsx.
 */
function StoredPlan({ body }: { body: string }) {
  const reach = useReach(body)
  return (
    <InReachMark reach={reach}>
      <pre className="pw-clash-body" {...reachBox(reach, t('g8.writing.theStoredPlan'))}>
        {body === '' ? '—' : body}
      </pre>
    </InReachMark>
  )
}

/**
 * TWO WAYS TO GET THE WRITING OUT OF THE BROWSER WHEN A SAVE WILL NOT GO THROUGH.
 *
 * A tester called "Do not close this tab until it says stored" the right sentence in the wrong
 * place: there was nothing they could do but wait, and waiting is not a plan when the server is
 * down. So the plan can be copied, or downloaded as a file. Neither touches the server.
 *
 * BOTH SAY WHAT HAPPENED, AND SAY IT WHEN IT DID NOT HAPPEN. A browser can refuse the clipboard, and
 * a refusal that looked like a copy would be the worst possible answer here — the person would close
 * the tab on an empty clipboard.
 */
function WaysOut({ state }: { state: PlanWritingState }) {
  const [said, setSaid] = useState<string | null>(null)

  /**
   * THE BROWSER'S OWN COPY COMMAND, WHICH ANSWERS. `navigator.clipboard.writeText` returns a
   * promise that a browser may simply never settle — measured here in headless Chromium, where the
   * press produced no message at all, ever. Silence is the worst answer this button can give,
   * because the person then closes the tab on an empty clipboard. `document.execCommand('copy')`
   * comes back true or false, in the same turn, and is the same mechanism the line move already
   * trusts a few lines up.
   */
  const copy = () => {
    const carrier = document.createElement('textarea')
    carrier.value = state.body
    carrier.setAttribute('aria-hidden', 'true')
    carrier.style.position = 'fixed'
    carrier.style.top = '0'
    carrier.style.opacity = '0'
    document.body.appendChild(carrier)
    let done = false
    try {
      carrier.select()
      done = document.execCommand('copy')
    } finally {
      carrier.remove()
    }
    setSaid(
      done
        ? t('g8.writing.copiedTheWholePlanIsOnYourClipboardPaste')
        : t('g8.writing.thisBrowserRefusedToCopyAndNothingWasCopied'),
    )
  }

  const download = () => {
    try {
      const file = new Blob([state.body], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = `${fileNameOf(state.name)}.md`
      document.body.appendChild(link)
      link.click()
      // THE ADDRESS IS LET GO LATER, NOT IN THIS TURN. Chromium starts the download after the
      // click returns, so taking the address away at once sometimes meant no file arrived at all —
      // measured, as a test that passed alone and failed beside seven others. Ten seconds is long
      // enough for any browser to have started, and one address costs nothing until then.
      setTimeout(() => {
        link.remove()
        URL.revokeObjectURL(url)
      }, 10_000)
      setSaid(t('g8.writing.yourBrowserWasGivenTheFileMdCheckYour', { value1: fileNameOf(state.name) }))
    } catch (err) {
      setSaid(t('g8.writing.theFileCouldNotBeMadeNothingWasDownloaded', { value1: errorMessage(err) }))
    }
  }

  return (
    <div className="pw-out">
      <div className="pw-out-acts">
        <Btn size="sm" variant="secondary" onClick={copy}>{t('g8.writing.copyTheWholePlan')}</Btn>
        <Btn size="sm" variant="secondary" onClick={download}>{t('g8.writing.downloadItAsAFile')}</Btn>
      </div>
      {said === null ? null : (
        <p className="pw-out-said" role="status">
          {said}
        </p>
      )}
    </div>
  )
}

/**
 * The plan's name, made safe to be a file name.
 *
 * ONLY THE FILE NAME IS CHANGED. The file's contents are the plan's characters, byte for byte. A
 * name with nothing usable left in it becomes the word "plan", which is a file name and not a claim
 * about anything.
 */
function fileNameOf(name: string): string {
  const safe = name.replace(/[^\p{L}\p{N} _-]+/gu, ' ').trim().slice(0, 60).trim()
  return safe === '' ? 'plan' : safe
}

/**
 * The writing surface's own geometry. It fills whatever column the page gives it.
 *
 * THE PAGE DECIDES THE COLUMNS, NOT THIS FILE. `.op-plan` in OnePlanPage.tsx is the one grid, so
 * writing on its own is full width, writing beside the table is half, and nothing here has to know
 * which.
 *
 * The box is monospaced on purpose. Leading spaces are how nesting is written in a plan and the
 * reviewer of the last build could not see them accumulating; in a fixed-width font two spaces look
 * like two spaces, and a pipe table lines up while it is being typed.
 */
const PLAN_WRITING_CSS = `
.pw { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }

/* Is this plan stored, and the two presses that store it. One row where there is room, stacked
   where there is not. It is about the name and the words together, so it is drawn above both. */
.pw-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pad) var(--gut);
  min-width: 0;
}
.pw-acts { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px var(--pad); }

/* THE ONLY EVIDENCE THE WRITING SURVIVED. Same size as the writing, not the smallest text here. */
/* Wide enough for the sentence under the word, and no wider: the presses sit next to the words
   that say whether they are needed, which is the whole reason the two are in one row. */
.pw-say-box { display: flex; flex-direction: column; gap: 2px; margin: 0; min-width: 12rem; flex: 0 1 var(--measure); }
.pw-say {
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
}
.pw-say[data-state='stored'] { color: var(--text-2); font-weight: 400; }
.pw-say[data-state='waiting'], .pw-say[data-state='storing'] { font-weight: 600; }
/* The moment behind the word, and the mark that says why it is there. Quiet, because it qualifies
   the word rather than competing with it — but never hidden, because the word on its own is a claim
   about now that nobody has checked. */
.pw-say-when {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
  min-width: 0;
}

/* A save that will not go through: the note, then the ways of getting the writing out. The whole
   block takes its own row of the bar, because it is the only thing worth reading while it is up. */
.pw-fault { flex: 1 0 100%; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.pw-trying { margin: 0; font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text); }
.pw-out { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.pw-out-acts { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.pw-out-said {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
  max-width: var(--measure-in-box);
}

/* What the last press did, including when it did nothing. */
.pw-said {
  flex: 1 0 100%;
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
  max-width: var(--measure-in-box);
}
/* The time the press was answered at, so two presses in a row are two answers on screen. */
.pw-said-at { color: var(--text-3); }
.pw-store-fault { margin: 0; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); }

.pw-write { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

/* The mark holding what the keys do. It sits above the left corner of the box, where the label it no
   longer needs used to be, so it reads as belonging to the box under it. At the other end of the row
   it read as belonging to whatever was in the next column. */
.pw-box-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }

/* WHAT A LINE CAN CARRY, above the box and always on screen. The presses carry the exact characters
   they write, so the row shows the shape instead of describing it. */
.pw-add-say { font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); }
.pw-adds { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.pw-add {
  padding: 2px 6px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  cursor: pointer;
  white-space: nowrap;
}
.pw-add:hover { background: var(--panel-2); }
.pw-add:focus-visible { outline: var(--border-w) solid var(--accent); outline-offset: 2px; }

/* The plan itself. One box, the browser's own, holding every character that is stored. */
.pw-box {
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-height: 60vh;
  margin: 0;
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--fs-2);
  line-height: var(--lh-read);
  tab-size: 2;
  resize: vertical;
  min-width: 0;
}
.pw-box:focus { outline: var(--border-w) solid var(--accent); outline-offset: 2px; }
/* The shape of a plan, in the empty box. Quiet enough to read as an example and never as writing,
   and it is gone at the first keystroke. */
.pw-box::placeholder { color: var(--placeholder); opacity: 1; }

@media (max-width: 60rem) {
  .pw-box { min-height: 40vh; }
}

.pw-refused {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
}

/* Somebody else wrote in this plan first. It is the only thing worth reading while it is up, so it
   takes a whole row of the bar, exactly as a failed save does. */
.pw-clash {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  min-width: 0;
}
.pw-clash-lead {
  margin: 0;
  font-size: var(--fs-3);
  font-weight: 600;
  line-height: var(--lh-body);
  color: var(--text);
}
.pw-clash-warn, .pw-clash-fault, .pw-clash-said, .pw-clash-head {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
  max-width: var(--measure-in-box);
}
.pw-clash-warn, .pw-clash-head { color: var(--text-2); }
.pw-clash-when {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px var(--pad);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
  min-width: 0;
}
.pw-clash-stored { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
/* Somebody renamed the plan: the name it holds now, and the two presses under it. The name wraps, so a long one never
   pushes the page sideways. */
.pw-name-clash { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.pw-name-clash-say {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
  max-width: var(--measure-in-box);
  overflow-wrap: anywhere;
}
/* The stored plan, to read against what is in the box. It is read-only and it never scrolls the
   page sideways: a long line wraps inside this box and the box scrolls down on its own. */
.pw-clash-body {
  margin: 0;
  padding: var(--pad);
  max-height: 30vh;
  overflow: auto;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  line-height: var(--lh-read);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  min-width: 0;
}

/* WHAT EACH LINE'S SIZE, HOURS AND PROJECT SAY NOW. A reading, not a field: no border, no box and
   nothing to type in, because these are stored on the record and are changed there. */
.pw-became {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  max-width: var(--measure-in-box);
}
.pw-became-head {
  margin: 0;
  font-size: var(--fs-3);
  font-weight: 600;
  line-height: var(--lh-body);
  color: var(--text);
}
.pw-became-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--pad);
  min-width: 0;
}
/* One line of the plan and what it became. The rail says the values belong to the line above them. */
.pw-became-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: var(--pad);
  border-left: 3px solid var(--border);
  min-width: 0;
}
.pw-became-line {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.pw-became-values { margin: 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pw-became-value { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--pad); min-width: 0; }
.pw-became-key {
  flex: 0 0 auto;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
}
/* The value, then the small marks about it, on one line until the column is too narrow for them. */
.pw-became-said { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; min-width: 0; }
.pw-became-words {
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
  overflow-wrap: anywhere;
}
/* How many identical ones there are, and whether anything was scheduled from the words. Both are
   small marks rather than sentences: they are read at a glance and never explained. */
.pw-became-times, .pw-became-state {
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  white-space: nowrap;
}
/* Where the one stored copy is. Inspect only, and it takes a line of its own because it is prose. */
.pw-became-where {
  flex: 1 0 100%;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
  overflow-wrap: anywhere;
}
/* Words somebody wrote that nothing was made of. They are not a fact and they must not read as one,
   so the words are drawn as writing rather than as a value and the sentence beside them says so. */
.pw-became-value[data-kept='true'] .pw-became-words {
  font-style: italic;
  color: var(--text-2);
}

/* Lines that were filed as work and are no longer in the document. */
.pw-lost {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  min-width: 0;
  max-width: var(--measure-in-box);
}
.pw-lost-say { margin: 0; font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text); }
.pw-lost-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--pad);
  font-size: var(--fs-1);
  align-self: stretch;
  min-width: 0;
}
/* One piece of work that lost its line: what it was, then the line a person gives it. The rail ties
   the repair to the loss above it, exactly as the derived values are tied to their line. */
.pw-lost-one {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: var(--pad);
  border-left: 3px solid var(--border);
  min-width: 0;
}
.pw-lost-was { margin: 0; display: flex; flex-wrap: wrap; gap: 4px var(--pad); min-width: 0; }
.pw-lost-text { color: var(--text); overflow-wrap: anywhere; }
.pw-lost-work { color: var(--text-3); }
/* The repair. It wraps rather than scrolls: this notice sits in a column half the page wide. */
.pw-lost-fix { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px var(--pad); min-width: 0; }
.pw-lost-pick { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 14rem; }
.pw-lost-pick-say { font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-3); }
.pw-lost-choose {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 6px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  min-width: 0;
}
.pw-lost-none, .pw-lost-keep, .pw-lost-cost-none {
  margin: 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
  max-width: var(--measure-in-box);
}
/* What the plan can no longer see. It is drawn the same way the values a line reached are drawn in
   the panel above, because it is the same list of values with the word gone in front of it. */
.pw-lost-cost { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pw-lost-cost-say {
  margin: 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
}
.pw-lost-cost-list { margin: 0; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pw-lost-cost-one { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--pad); min-width: 0; }
.pw-lost-cost-key {
  flex: 0 0 auto;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
}
.pw-lost-cost-said {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
  overflow-wrap: anywhere;
  min-width: 0;
}
/* What the last press did. Same size as the writing, because it is the only evidence the repair
   happened at all — the row it was about leaves the list the moment it works. */
.pw-lost-said {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
  max-width: var(--measure-in-box);
}
`
