// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useWordGeneration } from '../../lib/word-settings.ts'
/**
 * THE BOX: what you selected, what you want, who it is for, and one press.
 *
 * ---------------------------------------------------------------------------------------
 * WHY ONE BOX AND NOT FIVE MENU ITEMS
 * ---------------------------------------------------------------------------------------
 *
 * Five things a message can mean were asked for — ask, discuss, review, change, start work — and
 * one compact interaction is clearer than five permanent actions. So
 * the five are a row of chips inside one box, and the box is what a right-click opens.
 *
 * The shape is small context chips above, then the main message composer, then a compact recipient
 * control below, such as To: [ relevant agent ▾ ].
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES, AND WHEN
 * ---------------------------------------------------------------------------------------
 *
 * THE FIRST THING WRITTEN IS ALWAYS THE NOTE, AND IT NEEDS NOBODY'S NAME. A person pointed at
 * something and said something: that is the durable fact, it is a record of kind `annotation`, and
 * nothing about who it might be sent to can refuse it or delay it.
 *
 * Review on: the note is written and that is the whole of it. NOTHING IS SENT, and the box does not
 * ask who it is for — that is said later, over the collected notes, when the review is finished.
 *
 * Review off: the note is written FIRST, then a conversation is started, the message carrying those
 * words is written into it and sent, and the note is stamped as sent. Four calls, in that order, so
 * that a refusal anywhere after the first still leaves the words stored. There is also a second
 * press that writes the note and stops, because deciding who something is for is a separate act and
 * may never happen at all.
 *
 * ROUND SEVEN WROTE ONLY THE MESSAGE, and that is what this replaces. A comment then lived inside
 * one conversation with one agent: it died with the thread, no second review could collect it, and
 * it was refused outright when the agent named was a fixture row — 66 of the 91 sessions in the
 * owner's corpus are fixture rows. The note is the fact; the message is what carries it.
 *
 * ---------------------------------------------------------------------------------------
 * AND IT IS WHERE A REVIEW IS STARTED FROM SOMETHING IN PARTICULAR
 * ---------------------------------------------------------------------------------------
 *
 * A review's scope is derived from where the person was standing when they started it. Until 19
 * August 2026 nobody could stand anywhere: the only control that started one passed the PAGE, a
 * page derives the widest scope there is, and so every review a person could start covered the
 * whole project. The careful derivation on the server — a total map over the thirteen kinds of
 * thing, containment as the only relationship that counts — was exercised by nothing anybody could
 * do.
 *
 * SO THE ENTRY IS WHAT IS UNDER THE POINTER, because this box already knows what that is. Pointing
 * at a module and starting a review collects that module; pointing where nothing more precise is
 * says the page, and the page is the whole project. That is the whole of the difference between
 * *review this module* and *review everything*, and it is a gesture rather than a menu.
 *
 * AND A NARROW REVIEW IS WHAT MADE "ADD TO REVIEW" ABLE TO LIE. While every review covered the
 * whole project, a remark written anywhere joined the one that was collecting. A review of one
 * module does not take a remark left on a different one, so this box asks Mole Office whether the review
 * collecting here reaches this thing, and names the press after what it will actually do.
 *
 * WHAT IT COLLECTS IS THE SERVER'S OWN SENTENCE, kept and drawn. This file never works it out: the
 * rule lives in one place and a second reading of it here would be free to disagree.
 *
 * ---------------------------------------------------------------------------------------
 * THE HAZARD THIS BOX IS THE LAST PLACE TO CATCH
 * ---------------------------------------------------------------------------------------
 *
 * Addressing "the agent working on X" must never quietly become "a new agent that has never heard
 * of X". So when the chosen run cannot be picked up where it left off, this box says so BEFORE
 * anything is sent, refuses to send, and offers the only two honest choices: start a new agent and
 * hand it this context, or stop. It never substitutes one for the other.
 */

import { columnRungOfRegion, partIdOfRegionId, shortFormLevelOfRegion } from '@shared/regions.ts'
import { theReportDrawnHere } from '../../lib/drawnreport.ts'
import { SHORT_FORM_SPECS, type ShortFormLevel, type SourceRegion } from '@shared/zoom.ts'
import { viewTheOriginal, type Landed } from './original.ts'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { content, t, type WordKey } from '@shared/i18n.ts'
import { useLanguage } from '../../lib/language.ts'
import { CUT_MARK } from '@shared/shortening.ts'
import {
  namesNoPlace,
  projectNamedByTarget,
  spanNamedBy,
  targetAttributes,
  textAttributes,
  wordsInNamedSpan,
  wordsNamedBy,
} from '@shared/targets.ts'
import type { SurfaceId } from '@shared/surfaces.ts'
import type { PanelRecord, RecordKind } from '@shared/types.ts'
import { ApiError, api, errorMessage, faultOf, revisionForComment, sendOneComment, type Fault } from '../../api.ts'
import { currentMode, useMode } from '../../lib/mode.ts'
import { kindWord } from '../../lib/words.ts'
import {
  draftAbout,
  droppedToMakeRoom,
  forgetDraft,
  howManyKept,
  KEEP_AT_MOST,
  instructionToSend,
  keepDraft,
  newDraftId,
  whatCameBack,
  whatKeepsTheWords,
  whereTheChangeIs,
  whereTheChangeIsWords,
  whyTheWordsMayBeLost,
  type DraftChange,
} from '../../lib/drafts.ts'
import { openReview, reviewChanged, useReviewChanges } from '../../lib/review.ts'
import { putOnTheClipboard, type ClipboardWrite } from '../../lib/clipboard.ts'
// START REVIEW starts the review the column's own press starts, from one statement of what this page is about.
import { startThisPagesReview } from './this-page.ts'
// WHICH KEY SENDS A MESSAGE. By a decision, the comment composer asks the one shared rule, so its
// Enter and the chat's composer cannot disagree.
import { aSendKeyPress, theKeysThatSend, theSendKeyMark, useSendKey } from '../../lib/send-key.ts'
import {
  Absence,
  Btn,
  ErrorNote,
  Explain,
  Overlay,
  TextArea,
  placePopup,
  useAsync,
  useCloseOnOutsidePress,
  useNarrow,
} from '../ui.tsx'
import { useProjectAsync } from '../../lib/project-async.ts'
import { navigate, pathFor, recordPath, RouteLink } from '../router.tsx'
import { FollowFromHere } from '../Leading.tsx'
import { StartANewAgentFromHere, useAgentsNobodyAnswersFor } from '../StartANewAgent.tsx'
import { useTheSubjectIsHere, whereTheOpenSubjectIsDrawn } from './MarkLayer.tsx'
import {
  chipWords,
  shortenToWords,
  type ShortenedWords,
  INTENT_WORDS,
  objectWord,
  lookupKey,
  namesOfPartsOnThisPage,
  partNameOnThisPage,
  shortName,
  wordOnTheChip,
  type MessageContext,
} from './context.ts'
import {
  recipientWords,
  type Recipient,
} from './Recipients.tsx'
// THE CONTACTS, READ AS THE CHAT READS THEM. By option B of a decision, the panel draws the
// chat's contacts as a short list, so the name and the dot of a row come from the chat's own
// file.
import { Dot, theNameBesideItsDate, theNameOfAContact, theTypedWordsFindARow } from '../ContactChooser.tsx'
// WHERE A MESSAGE GOES AND WHO THE CONTACTS ARE: the shared reads, so the panel and the chat ask
// once between them, and the chat event that opens a conversation.
import { readContactsOnce, readParticipantsOnce, readPresenceForAMinute } from '../../lib/oneread.ts'
import { openTheChatAt, openTheChatAtUnregistered } from '../../lib/open-chat.ts'
import { openTheLinkedNote } from '../../lib/open-a-quick-note.ts'
import { addToANewNote, addToANote, type WhatWasPointedAt } from '../../lib/add-to-a-note.ts'
import { thePageScroller, whenThePageChangesSize } from '../../lib/page-scroll.ts'
import { CONTACT_SIDES } from '@shared/contacts.ts'
import { MY_NOTES_PAGE_SIZE } from '@shared/my-notes.ts'
import { theClockZone } from '@shared/time.ts'
import { CANNOT_REACH_WORDS, CHAT_WORDS, participantKey, unregisteredName } from '@shared/messages.ts'
// THE CHAT'S QUOTE BLOCK, whose look the panel's quote bar wears.
import { QUOTES_CSS } from '../chat/Quotes.tsx'
import type { ParticipantKind } from '@shared/participants.ts'
import type { ParticipantForThePage, PresenceOnTheWire, ShortContactLine, ShortContactsReply } from '../../api.ts'
import type { SecretariesDutiesReply } from '../../api-parts/messages.ts'
import { theAgentToPreselect, type AgentRecipientOnTheWire } from '../../../shared/recipient-ranking.ts'
import { nameAttributes, partOfMoleOffice } from './pointing.ts'
import { moleOfficeKeepsTheMenu, touchPressIsInTheSelection, touchSelectionIsLive, useComposer } from './open.ts'
import { KeyQuestion, useAKeyQuestion } from '../AKeyQuestion.tsx'
import type { MessageIntent } from '../../../server/lib/agents.ts'
import type { RecipientCandidate } from '../../../server/lib/recipients.ts'

/**
 * THE UNSENT INSTRUCTION IS STORED, AND src/web/lib/drafts.ts IS WHERE IT LIVES.
 *
 * It used to be kept in this file. It moved because it stopped being a private convenience of the
 * composer: an instruction nobody has sent is now a thing a person can point at, so it has an id,
 * and an id is only worth having if what it names is still there after a reload. Keeping the words
 * and being able to point at them turned out to be one job.
 *
 * The two names below are re-exported because they are what a screen says about those words, and
 * two test files already ask this file for them. It is one binding, not a second copy.
 */
export { draftsFromStored, whatKeepsTheWords } from '../../lib/drafts.ts'

/**
 * ONE CONTACT THE MESSAGE CAN GO TO. A person, or a registered agent — exactly what the message
 * kind's `to` names and what the contact list holds. Criterion W4: never a session.
 */
export type ContactRef = { kind: ParticipantKind; id: string }

/** How tall the composer grows before it scrolls inside itself. */
const GROW_TO = 12

/**
 * WHAT THE `To` CONTROL SAYS, ON ONE LINE.
 *
 * A run's title is a sentence and one of them on this control ran off both edges of the box at 1440
 * on 18 August 2026, so a chosen agent's name is cut at a word and the whole is under the pointer.
 *
 * WORDS THAT NAMED SEVERAL AGENTS ARE NEVER CUT. `recipientWords` draws those as the words somebody
 * typed followed by *nobody chosen yet*, and the half that matters is the end: a cut that dropped it
 * would turn a refusal into what looks like a settled choice. That state is only reachable while a
 * review is collecting, where this control is not drawn at all, and it is guarded here anyway
 * because the type allows it and a quiet lie about who a message is for is the one thing this whole
 * screen exists to prevent.
 */
function toWords(recipient: Recipient): string {
  return recipient.kind === 'unresolved' ? recipientWords(recipient) : shortName(recipient.title)
}

/**
 * SOMEBODY POINTED AT THE INSTRUCTION IN THIS BOX AND ASKED TO CHANGE IT.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS THE ONE THING PHASE 7 ADDS, AND IT IS DELIBERATELY SMALL
 * ---------------------------------------------------------------------------------------
 *
 * The owner's case: write an instruction, do not send it, select a phrase inside what you have just
 * written, point at that phrase, and say what it should mean instead. Mole Office has to understand that
 * the second act is about the pending instruction and not about the report the first act was about.
 *
 * IT NEEDED NO MACHINERY OF ITS OWN, and that was the test. The composer's box says what it is with
 * the same `data-target` attribute every other addressable thing carries, the same document
 * listener finds it, and the same span arithmetic places the phrase inside it. What is different is
 * only what happens next: PointingLayer hands the answer back to THIS box rather than opening a
 * second one, so the composer is never replaced and the report it is about is never let go of.
 *
 * THERE IS NO THIRD LEVEL. The only element in the product carrying a `draft` target is the
 * composer's own instruction box, so the panel that opens here cannot itself be pointed at. That is
 * how the endless stack of boxes is prevented: by there being nothing to point at, rather than by a
 * depth counter somebody has to remember to check.
 */
export interface ChangeAsked {
  /** Which unsent instruction was pointed at. */
  draftId: string
  /** The phrase inside it, or null when the whole instruction was pointed at. */
  span: { quote: string; from: number; to: number } | null
  /** Where on the screen the panel opens. */
  at: { x: number; y: number }
}

/**
 * WHAT A CHANGE TO AN UNSENT INSTRUCTION IS ABOUT: one value, read by everything.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ONE VALUE
 * ---------------------------------------------------------------------------------------
 *
 * There are two cases. Somebody selected a phrase and pointed at it; or they pointed at no phrase,
 * and the change is about the whole instruction. Both the drawing on the screen and the change
 * that gets recorded have to say which case it was, and they used to work it out separately from
 * `asked.span` — `whole={asked.span == null}` on one line and `quote: phrase` twelve lines away.
 * Nothing made them agree. The audit of 20 August 2026 named exactly that: *nothing ties the drawn
 * mark to what the change is actually recorded against*, and a build whose panel said
 * `Whole instruction` while recording a collapsed caret would have passed every proof in the
 * harness.
 *
 * So there is one value. `markForTheChange` draws it and `makeTheChange` records it.
 */
export interface ChangeSubject {
  /** True when no phrase was pointed at, so the change is about the whole instruction. */
  whole: boolean
  /** The characters the change is recorded against. */
  quote: string
  /** Where those characters start in the instruction, counted from 0. */
  from: number
  /** Where they end. */
  to: number
}

/**
 * The one reading of what a change is about. Pure, so a test can put it without a browser.
 *
 * THE WHOLE-INSTRUCTION CASE RECORDS THE WHOLE INSTRUCTION, which is what a change about all of it
 * is: the characters are the body, the offsets are its two ends. Nothing here shortens anything —
 * see `markForTheChange`, which is where the difference between recording and drawing lives.
 */
export function subjectOfTheChange(
  span: { quote: string; from: number; to: number } | null,
  body: string,
): ChangeSubject {
  if (span !== null) return { whole: false, quote: span.quote, from: span.from, to: span.to }
  return { whole: true, quote: body, from: 0, to: body.length }
}

/**
 * WHAT THE PANEL DRAWS AS THE WORDS IT IS ABOUT: a quotation, or the state word. Never both.
 *
 * ---------------------------------------------------------------------------------------
 * THE WHOLE CASE CARRIES NO CHARACTERS, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * A quotation is a claim: these are the characters you chose. With nothing selected there are no
 * such characters, and the panel used to quote the first sixty of the instruction anyway. The audit
 * of 20 August 2026 put that drawing back in a different element and every proof still passed,
 * because the proof knew the drawing by its class name rather than by what it was.
 *
 * The repair here is that the whole case has nothing to draw a cut FROM. `{ word }` holds a state
 * word and no instruction, so no element of that panel — whatever its class — can quote sixty
 * characters of somebody's own sentence back at them.
 */
export type ChangeMark = { quoted: ShortenedWords } | { word: string }

export function markForTheChange(subject: ChangeSubject): ChangeMark {
  if (subject.whole) return { word: t('talk.state.wholeInstruction') }
  return { quoted: shortenToWords(subject.quote) }
}

/**
 * WHY A CHANGE CANNOT BE MADE. Two reasons, and neither of them is who the message is for.
 *
 * Exported so a test can put the question without a browser.
 */
export function whyNotChangeIt(said: string, thereAreWordsToChange: boolean): string | null {
  if (!thereAreWordsToChange) return t('talk.whyNotChange.noWords')
  return said.trim() === '' ? t('talk.whyNotChange.nothingSaid') : null
}

/**
 * WHY THE NOTE CANNOT BE WRITTEN DOWN. There is exactly one reason and it is having written nothing.
 *
 * WHO IT IS FOR IS NOT ON THIS LIST, and that is the whole of Phase 3 on this screen. A person
 * reading a report has not decided who their remark is for, and until 18 August 2026 Mole Office refused
 * to keep a single word until they did — "Say who this is for. Mole Office will not pick one for you"
 * was the answer to somebody trying to write a comment.
 *
 * Exported so a test can put the question without a browser. What is DRAWN from the answer is
 * proved in tests/seven-surfaces.test.ts, which presses the button in Chromium.
 */
export function whyNotWriteItDown(body: string): string | null {
  return body.trim() === '' ? t('talk.whyNotWrite') : null
}

/**
 * WHETHER WHAT IS WRITTEN HERE WILL JOIN A REVIEW. Three answers, and the third is a real one.
 *
 *   `true`  — a review is collecting and Mole Office says it reaches this thing.
 *   `false` — nothing will collect this. Either no review is collecting at all, or the one that is
 *             does not reach here.
 *   `null`  — Mole Office has not said yet. Either it has not said whether anything is collecting, or a
 *             review IS collecting and it has not said whether that one reaches here.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING COLLECTING IS `false`, AND CALLING IT `null` TOOK SEND OFF THE COMPOSER
 * ---------------------------------------------------------------------------------------
 *
 * Photographed in Chromium on 19 August 2026. With no review collecting — the ordinary state — the
 * composer offered only *Write it down and keep it*, and a sentence telling the reader to finish
 * the collecting "in the review beside the page" when there was no review beside the page. There
 * was no way to send a message to an agent from anywhere in Mole Office. Nothing failed and no test went
 * red, because `null` was standing for two different situations and only one of them means "wait
 * and see".
 *
 * ---------------------------------------------------------------------------------------
 * IT ASKS ABOUT EVERY REVIEW COLLECTING, AND NOT ABOUT ONE
 * ---------------------------------------------------------------------------------------
 *
 * It used to be given one review id — whichever one this browser had last opened the pane on — and
 * ask whether that one reached here. Several reviews can collect at once: Mole Office starts a new one
 * for each different scope, and a comment joins every collecting review whose scope reaches it. So
 * the browser's single id was both a second opinion about the server's state and an answer to a
 * narrower question than the one the person is asking, which is *will these words be collected*.
 *
 * BOTH LISTS COME FROM MOLE OFFICE AND EITHER CAN BE UNANSWERED. `null` while a request is in flight,
 * because answering `false` there would draw the send controls for a moment and then swap them for
 * the review press under somebody who was already reading.
 *
 * Exported so a test can put the question without a browser.
 */
export function joinsTheCollectingReview(asked: {
  /** Every review collecting in this project, by id, or null while Mole Office has not answered. */
  collecting: readonly string[] | null
  /** The reviews that reach this thing, by id, or null while Mole Office has not answered. */
  reaching: readonly string[] | null
}): boolean | null {
  if (asked.collecting === null) return null
  if (asked.collecting.length === 0) return false
  if (asked.reaching === null) return null
  const reaching = asked.reaching
  return asked.collecting.some((one) => reaching.includes(one))
}

/**
 * WHAT BECAME OF THE WORDS SOMEBODY SELECTED. Three answers, and the third is why this exists.
 *
 *   `placed`  — they are stored as a quote with its exact position, or nothing was selected.
 *   `across`  — this thing keeps its text where a quote can be found, and this selection ran
 *               across more than one piece of it.
 *   `nowhere` — nothing inside this thing says which stored string it draws, so no selection
 *               anywhere in it can be quoted.
 *
 * Which one it is, is decided in PointingLayer, from the element under the pointer.
 */
export type SelectedWords = 'placed' | 'across' | 'nowhere'

/**
 * WHAT THE BOX SAYS ABOUT WORDS IT COULD NOT PLACE, and null when there is nothing to say.
 *
 * ---------------------------------------------------------------------------------------
 * IT USED TO PRINT AN INSTRUCTION THAT WAS FALSE WHERE IT WAS PRINTED
 * ---------------------------------------------------------------------------------------
 *
 * One sentence covered both failures: *"This comment is about the whole record. Select inside one
 * paragraph to quote words exactly."* On a page where nothing says which stored string it draws,
 * the second half is an instruction that cannot be followed, and following it gives the same
 * sentence back. Measured on the owner's corpus on 19 August 2026 against record `wlWeXnjYsYEY`.
 *
 * THE FIRST HALF IS SAID IN BOTH CASES AND IS NOT NEGOTIABLE. The person selected words and the
 * comment is about to be about the whole thing. Widening what somebody chose without saying so is
 * the quiet substitution the second invariant forbids, and it is worse than a wrong instruction.
 *
 * WHAT REPLACES THE FALSE HALF IS NOT A LONGER EXPLANATION. design/UX-CONTRACT.md bans fixing a
 * screen by adding words. It is the one thing the reader can actually do about it: name the part
 * they mean in the comment itself, since Mole Office will not be carrying a quote.
 *
 * Exported so a test can put the question without a browser.
 */
export function wordsNotPlacedNote(words: SelectedWords, thing: string): string | null {
  if (words === 'placed') return null
  return t('talk.whole', { thing })
}

/**
 * WHO WOULD GET THIS, AND WHETHER THEY CAN BE REACHED. Four readings, one decision.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO THINGS THIS FIXES, BOTH MEASURED IN CHROMIUM ON 19 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * 1. TWO CONTROLS SET WHO A MESSAGE IS FOR. At rest the composer drew a labelled `To` row with a
 *    press in it AND, under it, a proposal with a second press. Both wrote the same field. `offering`
 *    is what stops that: while there is a proposal on the table it IS the control, and the way to
 *    somebody else is a press beside it.
 *
 * 2. THE WAY OUT OF AN UNREACHABLE AGENT WAS BEHIND CHOOSING IT. The two honest choices — start a
 *    new agent with this context, or stop — appeared only once a choice had been made. So somebody
 *    told "this agent cannot be picked up" had to choose that agent in order to be offered the
 *    alternative. `inTheChair` reads the proposal as well as the choice, so the escape is beside the
 *    refusal that causes it.
 *
 * `hazard` STAYS NARROWER THAN `cannotPickUp` ON PURPOSE. Only a CHOICE refuses a send: while
 * nothing has been chosen, Send is already refused for want of a recipient, and refusing it twice
 * for two reasons would put the wrong sentence on the screen.
 *
 * Exported so a test can put the question without a browser.
 */
export function whoWouldGetIt(
  recipient: Recipient | null,
  suggested: RecipientCandidate | null,
): {
  /** The candidate behind the choice, when the choice came from one. Null for a new agent. */
  chosen: RecipientCandidate | null
  offering: boolean
  inTheChair: RecipientCandidate | null
  cannotPickUp: string | null
  hazard: string | null
  /**
   * THE WARNING THAT THE RUN IN THE CHAIR IS EXPENSIVE TO PICK UP. Criterion T6.
   *
   * IT IS A WARNING AND NOT A REFUSAL, so it is deliberately separate from `hazard` and never
   * reaches `whyNotSendIt`: the send still goes. It is read from the server's candidate, so the
   * composer cannot warn about one run and send to another. Null when the server sent none.
   */
  pickUpCost: string | null
} {
  const chosen = recipient !== null && recipient.kind === 'session' ? recipient.from : null
  const inTheChair = chosen ?? (recipient === null ? suggested : null)
  // A run that cannot be picked up is a refusal to send, not a warning to read past. `unknown` is
  // not `no`: Mole Office could not find out, the dispatch may well work, and saying "no" would be a
  // guess dressed as a finding.
  const cannotPickUp = inTheChair !== null && inTheChair.pickUp.answer === 'no' ? inTheChair.pickUp.because : null
  const hazard = chosen !== null && chosen.pickUp.answer === 'no' ? chosen.pickUp.because : null
  // THE EXPENSIVE-PICK-UP WARNING, read from the candidate and never folded into the refusal above.
  const pickUpCost = inTheChair?.pickUpCost?.warning ?? null
  return { chosen, offering: recipient === null && suggested !== null, inTheChair, cannotPickUp, hazard, pickUpCost }
}

/**
 * Why it cannot be SENT, which is a different act and has a different answer.
 *
 * Sending to nobody is not a thing Mole Office can do, so this one does ask who it is for — and a run
 * that cannot be picked up where it left off is a refusal rather than a warning, because the only
 * alternative is quietly handing the words to an agent that has never heard of the work.
 */
export function whyNotSendIt(body: string, recipient: ContactRef | null): string | null {
  const words = whyNotWriteItDown(body)
  if (words !== null) return words
  if (recipient === null) return t('talk.sayWhoFirst')
  return null
}

/**
 * WHETHER A REFUSED SEND STILL STORED THE LETTER. A person's send to a retired agent, or to an agent nothing holds,
 * answers 409 with the letter stored and routed up the chain of starters, and the refusal still names the record. The
 * send forgets the box's words on it, and the note heads the box with the routed line on it: one reading for both.
 */
function theLetterWasStored(fault: Fault | null): fault is Fault & { stored: string } {
  return fault !== null && fault.stored !== null
}

/** What this box can say about a record it names: which kind of record it is, and what it is called. */
export interface RecordSaid {
  kind: RecordKind
  title: string
}

/**
 * WHICH RECORD THIS BOX HAS TO NAME, by id: the record the thing pointed at is, or is part of, and
 * none for anything else.
 *
 * The record whose page the writer met the thing on (`drawnIn.recordId`) is no longer read here.
 * The panel drew it as "Met under …", and a decision took that line away: the person was just
 * there, and the message still stores `drawnIn` for its reader.
 */
export function recordsThisBoxNames(context: MessageContext): string[] {
  // A PART OF A RECORD IS ASKED ABOUT TOO, because the quote bar names what kind of place it is,
  // and a declared section's title is declared per record kind. Without this read the bar could say
  // *Paragraph* and *Gist* but never *Section “What is still open around this”*.
  return context.target.kind === 'record' || context.target.kind === 'region' ? [context.target.recordId] : []
}

/**
 * WHAT EACH OF THOSE RECORDS IS, asked one by one, with a record Mole Office will not answer for
 * simply missing from the answer.
 *
 * ONE FAILED READ MUST NOT SILENCE THE OTHER. A link row whose far end is deleted is drawn as
 * broken and the read for it comes back 404 — and the record the writer was reading is still there
 * and still worth naming. `Promise.all` over the pair would lose both.
 *
 * A MISSING ANSWER IS SAID OUT LOUD IN THE BROWSER'S LOG rather than swallowed. Nothing on screen
 * pretends: the chip drops the words it cannot stand behind. `console.warn` is how this browser
 * already says a read was refused — see `theViewThisWasWrittenIn` in pointing.ts and `api.ts`.
 */
async function whatTheseRecordsAre(ids: readonly string[]): Promise<ReadonlyMap<string, RecordSaid>> {
  const read = await Promise.all(
    ids.map(async (id): Promise<readonly [string, RecordSaid] | null> => {
      try {
        return [id, await api.whatARecordIs(id)] as const
      } catch (err: unknown) {
        // ONE TEMPLATE, ON ONE LINE, AND THE WORDS AVOID THE ABSENCE IDIOM. What this record's
        // kind and title are is then left off the composer, which the docstring above says.
        // tests/absence-weight.test.ts reads this line: it keys on phrases like "cannot say" anywhere
        // in a component.
        console.warn(`Mole Office: the read for record ${id} was refused — ${errorMessage(err)}`)
        return null
      }
    }),
  )
  return new Map(read.filter((one): one is readonly [string, RecordSaid] => one !== null))
}

/**
 * WHERE A BOX OPENS, AND WHETHER IT HANGS UNDER AN ELEMENT. A gesture with no pointer (the keyboard menu,
 * Enter on an outlined thing) hangs the box under the element the person is standing on, and that is
 * where it stays (tests/one-listener-for-the-whole-product.test.ts). Only a box opened at a pointer is
 * moved off the thing it is about (`placeClearOfTheThing`).
 */
export interface HangsAt {
  x: number
  y: number
  /** True when the point is under an element: `Opened.underAnElement` in open.ts. */
  underAnElement?: boolean
}

export interface TalkBoxProps {
  context: MessageContext
  /** What the page already calls the thing, so the chip does not have to fetch it. */
  about: string
  /**
   * Where it opens, as a point in the window: the pointer for a right-click, the top left of the
   * handle for a press.
   *
   * IT IS REQUIRED, AND IT USED TO BE WORKED OUT HERE FROM THE BOX'S OWN DOM PARENT. That worked
   * only while the box was drawn inside the handle. It is now drawn in the overlay host, where its
   * parent is the host and its parent's position says nothing about where the person pressed. The
   * caller knows where the press was, so the caller says.
   */
  at: HangsAt
  /**
   * WHAT BECAME OF THE WORDS SOMEBODY SELECTED.
   *
   * The comment is about the whole thing whenever they could not be placed, and this box says so. A
   * selection running across a bold word or across two paragraphs covers characters that were never
   * drawn — the asterisks, the newline — so a quote taken across the join is not the stored text
   * between those two offsets. Mole Office will not store a span it cannot place. Saying nothing here
   * would be the same substitution made quietly.
   *
   * IT IS THREE ANSWERS AND NOT TWO, because the advice that fixes one of them is impossible in the
   * other. See `wordsNotPlacedNote`.
   */
  selectedWords?: SelectedWords
  /**
   * THE NAME OF THE FILE THE WORDS WERE SELECTED IN, when they were drawn by the office's reader of one file. The chip
   * calls the quote by that name, because the file's words are held in no record and the quote alone does not say
   * where they came from. Left out everywhere else. See `SHOWN_FILE_ATTRIBUTE` in pointing.ts.
   */
  inFile?: string
  /** THE PAGE OF A PDF THE WORDS WERE SELECTED ON, counted from 1, so the chip names it too. See `SHOWN_PAGE_ATTRIBUTE`. */
  inPage?: number
  /**
   * ONE MORE ELEMENT THAT COUNTS AS INSIDE THIS BOX: the control that turns pointing on.
   *
   * IT IS NOT INSIDE THE BOX IN THE TREE AND IT IS PART OF THE BOX TO THE PERSON. Everything that
   * floats is drawn in the overlay host, so the control is a sibling of this composer — and a press
   * that lands in neither of the elements this box names as inside closes it. Without this, pressing
   * the control while a composer is open destroys the instruction being written in it.
   *
   * THIS USED TO BE THE OFFER DRAWN BESIDE SELECTED WORDS, which was deleted on 20 August 2026:
   * selection identifies context and does not imply intent, so nothing is drawn because words were
   * selected. The control inherited the mechanism, which is why the mechanism is still here.
   *
   * The caller passes it because the caller owns both. It is a ref rather than a boolean so that a
   * control which is not drawn is simply an element that is not there.
   */
  alsoInside?: React.RefObject<HTMLElement | null>
  /**
   * SOMEBODY POINTED AT THE INSTRUCTION IN THIS BOX. See `ChangeAsked`.
   *
   * It is handed down rather than worked out here because the gesture is read at the document, by
   * the one listener that reads every other gesture in the product. This box draws the answer.
   */
  changing?: ChangeAsked | null
  /** The change was made, or the panel was closed. The caller takes its request back. */
  onDoneChanging?: () => void
  onClose: () => void
}

/** Why the recipient the box showed could not go with the comment into a review. */
type NotCarried = 'a person' | 'no record here'

/**
 * THE RECIPIENT THE BOX SHOWED GOES INTO THE REVIEW WITH THE COMMENT. Problem ZuhGWivnX7ug.
 *
 * The box shows "To" with an agent in it, chosen by the person or by the ranking, before Start review is pressed. Until
 * wave 13n round 54 that press wrote the comment and started the review and stored nobody, so the review went to the
 * page's writer: the secretary was chosen on wave 13p's report and the review went to the 13p supervisor.
 *
 * A REVIEW THIS PRESS STARTED goes to the shown agent, by the review's own door (POST /api/reviews/:id/recipient), so
 * the review column says that name before Send.
 *
 * A COMMENT THAT JOINS A REVIEW ALREADY COLLECTING STORES NO RECIPIENT OF ITS OWN, and this is not called for it. It
 * belongs to the review and goes where the review goes, which the column shows. Until wave 13y round 134 the box stored
 * the shown agent on such a comment where the review's recipient differed. The server reads a recipient stored on a
 * comment as an address, so the comment was handed to that agent at once, before the review was sent.
 *
 * Nothing is stored when the box showed nobody. A person, or an agent with no record here, cannot receive a review;
 * the answer says which, and the column then names whoever the review goes to.
 */
async function carryTheShownRecipient(shown: ContactRef | null, reviewId: string): Promise<NotCarried | null> {
  if (shown === null) return null
  if (shown.kind !== 'agent') return 'a person'
  const registries = await readParticipantsOnce()
  const record = registries.agents.find((one) => one.id === shown.id)?.record ?? null
  if (record === null) return 'no record here'
  await api.reviewRecipient(reviewId, { kind: 'agent', agentId: record })
  return null
}

export function TalkBox({
  context,
  about,
  at,
  selectedWords = 'placed',
  inFile,
  inPage,
  alsoInside,
  changing = null,
  onDoneChanging,
  onClose,
}: TalkBoxProps) {
  const sendKey = useSendKey()
  /** The keys that send, for the press the send key does, which carries their mark. */
  const theSendKeys = { shortcuts: theKeysThatSend(sendKey), mark: theSendKeyMark(sendKey) }
  /**
   * WHETHER THIS BOX STAYS OPEN WHEN THE PERSON CLICKS ELSEWHERE (decided on 8 November
   * 2026). A pinned box keeps its words while they select and copy text from another part of the page, which is what
   * a comment made of two passages needs. Unpinned, it closes as it always did.
   */
  const [pinned, setPinned] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const changeBox = useRef<HTMLDivElement>(null)
  /**
   * A COUNT THAT GOES UP WHENEVER ANYTHING WRITES TO A REVIEW, so the reads that want a fresh
   * answer after anything writes take one. Nothing on this panel decides from it today: a write of
   * a note is still a write into whatever review collects, and the frame and the strip read again
   * from this.
   */
  const reviewWrites = useReviewChanges()
  const selectedSpan = spanNamedBy(context)
  const selectedQuote = selectedSpan === null ? null : wordsInNamedSpan(selectedSpan)
  /**
   * WHICH KEPT INSTRUCTION THIS BOX IS OPENING ONTO: the THING, and not one selection inside it.
   *
   * IT USED TO CARRY THE OFFSET THE SELECTION STARTED AT, and that made a kept instruction
   * unreachable. Measured on 19 August 2026: an instruction written against one phrase of a
   * paragraph was kept under `reportBlock/…/b-prose:4`, and selecting a different run of words in
   * the same paragraph opened an empty box that said nothing about the words being held. Nothing in
   * Mole Office lists unsent instructions, so there was no other way back to them — the only way was to
   * reproduce the exact character the first selection started at.
   *
   * WHAT IT COSTS is that the words can come back beside a different selection from the one they
   * were begun against, and that is said rather than left to be noticed. See `whatCameBack` in
   * lib/drafts.ts, and `startedOn` beside it.
   */
  const key = lookupKey(context)
  const kept = draftAbout(key)
  /** True when this box opened onto words somebody had already started writing. Said, not implied. */
  const [cameBack] = useState(kept !== undefined)
  /** The words this instruction was begun about. Kept from the stored row, never re-stamped. */
  const [startedOn] = useState<string | null | undefined>(() =>
    kept === undefined ? selectedQuote : kept.startedOn,
  )

  /**
   * WHAT THE UNSENT INSTRUCTION IN THIS BOX IS CALLED, so it can be pointed at.
   *
   * It is minted when the box opens and written to this browser's store the moment anything is
   * typed. An id for words nobody has typed names nothing, so nothing is stored until there is
   * something to store — but the box says the id from the start, because the attribute an element
   * carries is either complete or absent and there is no half-wired state to detect.
   */
  const [draftId] = useState(() => kept?.id ?? newDraftId())
  /**
   * WHAT THE MESSAGE MEANT under the earlier panel's five chips. The chips are gone, and the words
   * are the message. The field is kept here because the draft
   * it sits on is stored with it and the store's own reader refuses a row without one. It never
   * changes now: nothing on this panel asks the question, so the answer stays what arrived.
   */
  const [intent, setIntent] = useState<MessageIntent>(kept?.intent ?? 'ask')
  void setIntent
  const [body, setBody] = useState(kept?.body ?? '')
  const [changes, setChanges] = useState<DraftChange[]>(kept?.changes ?? [])
  /** The changes somebody is still writing and has not made. See `beingWritten` in lib/drafts.ts. */
  const [beingWritten, setBeingWritten] = useState<DraftChange[]>(kept?.beingWritten ?? [])
  /**
   * WHO THIS MESSAGE IS FOR, as the contact list says it: one person or one registered agent.
   * Criterion W4: the right-click panel is contact based, like
   * the chat. There is no session here: the chooser below offers the same contacts the chat's own
   * list offers, and nobody else.
   *
   * `chosenByThePerson` is what somebody pressed, and it always wins. Until they press, the box
   * reads the one ranking of agents (src/shared/recipient-ranking.ts, item 5 of a decision) and
   * chooses its first entry, so a comment on a report an agent filed opens addressed to that agent
   * (problem Nu0y2IKdzPcw). When the ranking names nobody, or its first
   * agent cannot be written to, nobody is chosen, exactly as before. Nothing stands beside the
   * chosen name, and one press on another contact changes it.
   */
  const [chosenByThePerson, setRecipient] = useState<ContactRef | null>(null)
  const [ranked] = useProjectAsync(() => api.agentRanking(context), [key])
  const preselected = ranked.status === 'ready' && ranked.value !== null ? theAgentToPreselect(ranked.value.agents) : null
  const recipient: ContactRef | null =
    chosenByThePerson ?? (preselected === null ? null : { kind: 'agent', id: preselected.agentId })
  /**
   * WHO FILED WHAT THIS IS ABOUT, as the ranking says it, which the contact list puts first. Undefined while the ranking
   * is still being read, and null when it names no filer or could not be read, which the line under To says.
   */
  const filedBy: string | null | undefined =
    ranked.status === 'loading' ? undefined : ranked.status === 'ready' && ranked.value !== null ? theAgentThatFiledIt(ranked.value.agents) : null
  const [picking, setPicking] = useState(false)
  /**
   * WHAT SEND GOES TO: the contact chosen under To, or a quick note. Contact is chosen at open. With Note chosen, the
   * press on the right of the choice names the note, and Send adds what was right-clicked to it, with the words typed
   * (src/web/lib/add-to-a-note.ts). The contact chosen stays chosen while Note is.
   */
  const [sendTo, setSendTo] = useState<'contact' | 'note'>('contact')
  /**
   * THE NOTE THE PERSON LAST WROTE IN, which Note chooses first, as the office answers it. It is read when Note is first
   * chosen, and not at open, because most boxes go to a contact. The answer names no note when the person has written
   * in none, and Note then chooses New note.
   */
  const [noteWanted, setNoteWanted] = useState(false)
  const [lastNote] = useAsync(() => (noteWanted ? api.noteLastWrittenIn() : Promise.resolve(null)), [noteWanted])
  /** The note chosen in the list, or null for New note. Undefined until a note is chosen there or Send adds to one. */
  const [pickedNote, setPickedNote] = useState<PanelRecord | null | undefined>(undefined)
  const [pickingNote, setPickingNote] = useState(false)
  /**
   * THE NOTE SEND GOES INTO: the one chosen in the list, else the one last written in, else New note, which is null.
   * Undefined while the office has not said which note was last written in, or could not say.
   */
  const theNote: PanelRecord | null | undefined =
    pickedNote !== undefined ? pickedNote : lastNote.status === 'ready' && lastNote.value !== null ? lastNote.value.note : undefined
  /** What Send last added to a note: the note as it now is, and whether Send filed it. Null before. */
  const [addedTo, setAddedTo] = useState<{ note: PanelRecord; isNew: boolean } | null>(null)
  /**
   * WHETHER MORE IS OPEN. The panel opens with six things, and "Take me there with …" and the agents nobody answers for
   * wait behind one More press. Organise was behind it too until wave 13y round 169, when it went because nothing done
   * in it reached anyone. New quick note, Add to note and Add to a new note went in the same round, when Send could go
   * to a note.
   */
  const [more, setMore] = useState(false)
  /**
   * WHAT COPY TAKES, read by open.ts when the box opened, because opening the box can move the selection. Null only
   * when no box is open, and then Copy is not drawn.
   */
  const copies = useComposer().opened?.copies ?? null
  /** WHAT THE LAST COPY CAME TO, with the words it was given. Nothing else in the box is changed by a copy. */
  const [copied, setCopied] = useState<{ words: string; came: ClipboardWrite } | null>(null)
  /**
   * THE ANSWER IS SAID ONLY ABOUT THE WORDS IT WAS GIVEN. The same subject right-clicked again keeps this box, so a copy
   * of the words selected before is not said to be a copy of the words selected now.
   */
  const lastCopy = copied !== null && copied.words === copies ? copied.came : null
  const copy = async (words: string): Promise<void> => {
    setCopied(null)
    setCopied({ words, came: await putOnTheClipboard(words) })
  }
  /** WHICH PRESS IS WAITING. One press at a time: only that press draws the light, and the others are off. */
  const [sending, setSending] = useState<'send' | 'add' | 'keep' | 'note' | null>(null)
  /**
   * WHY THE LAST ACT FAILED: the caught error's message and its fault, so ErrorNote draws it by its one rule, and the
   * heading an act gives its own failure, when it gives one.
   */
  const [failed, setFailed] = useState<{ message: string; fault: Fault | null; label?: string } | null>(null)
  /** The message went to this contact. Kept so the frame says who it reached. */
  const [sent, setSent] = useState<ContactRef | null>(null)
  /** What was written down without sending, by the id it was stored under. */
  const [added, setAdded] = useState<string | null>(null)
  /**
   * WHAT START REVIEW DID WITH THE COMMENT, as the server answered: it started this page's review with the comment in it,
   * it added the comment to the review already collecting here, the review it started does not reach the comment, or the
   * review did not start and why. Null before the press.
   */
  /** What became of the recipient the box showed when Start review was pressed. Null before the press, or when it was stored. */
  const [carried, setCarried] = useState<NotCarried | { failed: string; fault: Fault | null } | null>(null)
  /**
   * AND WHAT ADD TO REVIEW DID WITH IT, as the message worker answered: a review holds it, none does, or the answer could
   * not be read. Problem 6yMD5gal_oXz.
   */
  const [inReview, setInReview] = useState<
    | { did: 'started' | 'added' | 'not-in-it' | 'held' | 'held-by-none' }
    | { did: 'not-started' | 'not-read'; why: string; fault: Fault | null }
    | null
  >(null)

  /** What this comment is about, in the words a person wrote, short enough to be a chip. */
  const scope = useMemo(() => chipWords(context, about), [context, about, useWordGeneration()])
  /** WHAT THE RECORD THIS BOX NAMES IS: its kind and title, asked once when the box opens. */
  const mode = useMode()
  const [named] = useProjectAsync(() => whatTheseRecordsAre(recordsThisBoxNames(context)), [key])
  const namedRecords = named.status === 'ready' ? named.value : null
  /** What the comment is about, when that is a whole record and Mole Office has said what it is. */
  const recordItIsAbout =
    context.target.kind !== 'record' ? null : (namedRecords?.get(context.target.recordId) ?? null)
  void recordItIsAbout
  /**
   * What the record this box's subject lives in is, when Mole Office has said.
   *
   * For a whole record that is the record itself; for a part of one it is the record holding it,
   * which is what lets the chip name a declared section by its title.
   */
  const theRecordItIsIn =
    context.target.kind === 'record' || context.target.kind === 'region'
      ? (namedRecords?.get(context.target.recordId) ?? null)
      : null
  /** The word in front of the title on the chip, or nothing when there is no word worth drawing. */
  //
  // A PART OF A MESSAGE IS CALLED THAT. A sentence, a picture or a quoted line of a chat message is a
  // region of the message's record (problem DowO7yEioWp0), and the region's own noun, "part of a
  // record", says less and is not in the word lists.
  //
  // WORDS QUOTED FROM A FILE THE OFFICE DRAWS ARE CALLED BY THE FILE'S NAME. The kind of the block or record that holds
  // the file says less, and the quote beside it does not say which file it is from. Words from a page of a PDF are
  // called by the page as well, because the quote does not say which page they are on.
  const chipWord =
    inFile !== undefined && wordsNamedBy(context) !== null
      ? inPage === undefined
        ? t('chatPoint.wordsOfAFile', { name: content(inFile) })
        : t('chatPoint.wordsOfAFilePage', { name: content(inFile), page: inPage })
      : context.target.kind === 'region' && theRecordItIsIn?.kind === 'message'
        ? t('chatPoint.partOfAMessage')
        : wordOnTheChip(context, theRecordItIsIn?.kind ?? null, mode)

  const remember = (next: {
    intent?: MessageIntent
    body?: string
    changes?: DraftChange[]
    beingWritten?: DraftChange[]
  }) => {
    keepDraft({
      id: draftId,
      key,
      intent: next.intent ?? intent,
      body: next.body ?? body,
      changes: next.changes ?? changes,
      beingWritten: next.beingWritten ?? beingWritten,
      startedOn,
      // A DRAFT KEPT BEFORE ORGANISE LEFT THIS BOX may hold the pieces it cut. Nothing reads them now. They are carried as
      // they arrived, so this box drops nothing stored, and they go with the draft when it is sent or emptied.
      pieces: kept?.pieces,
    })
  }

  /**
   * THE WHOLE OF WHAT THE PERSON IS SAYING: the instruction, and every change they made to it.
   *
   * ONE FUNCTION BUILDS IT, in lib/drafts.ts, and both presses read it. Writing it down and sending
   * it are two acts and they must not be two readings of what was said — that is the defect this
   * repository keeps finding, and here it would mean a change surviving one press and not the other.
   */
  const whatIsSaid = instructionToSend({ body, changes })

  /**
   * WHICH REVISION THIS COMMENT WILL SAY IT WAS WRITTEN AGAINST.
   *
   * It is asked when the box opens, and the whole decision is `revisionToStamp` in api.ts — the
   * revision the page in front of this person was drawn from, when the record still holds it.
   * Mole Office never fills one in, so a comment written on a page that has since moved on carries no
   * revision at all, and the box says so before anything is typed.
   */
  const [stamp] = useProjectAsync(() => revisionForComment(context.target), [key])
  const revision = stamp.status === 'ready' ? stamp.value.revision : null
  const changedSinceDrawn = stamp.status === 'ready' && stamp.value.changedSinceDrawn

  /** What is stored: what was pointed at, which words, and which revision — when there is one. */
  const stamped: MessageContext = revision === null ? context : { ...context, revision }

  // THIS BOX, THE PANEL THAT CHANGES ITS INSTRUCTION, AND THE OFFER BESIDE THE SELECTED WORDS ALL
  // COUNT AS INSIDE. All three are separate children of the overlay host, so a list naming only
  // this box would close the composer the moment somebody pressed one of the other two — and the
  // composer closing takes both of them with it. See `alsoInside` above for what that cost.
  const insideThis = useMemo(
    () => (alsoInside === undefined ? [box, changeBox] : [box, changeBox, alsoInside]),
    [alsoInside],
  )
  useCloseOnOutsidePress(insideThis, () => {
    if (!pinned && !touchPressIsInTheSelection()) onClose()
  })

  /** Why Send cannot go: nothing written, or nobody chosen. Nothing else refuses it. */
  const whyNotSend = whyNotSendIt(body, recipient)
  const whyNotWrite = whyNotWriteItDown(body)
  /**
   * WHY SEND CANNOT GO TO THE NOTE YET: the note is not known. Nothing typed is no reason, because what was right-clicked
   * is what goes in.
   */
  const whyNotAddToTheNote =
    theNote !== undefined ? null : lastNote.status === 'error' ? t('talk.note.chooseFirst') : t('talk.addToNote.reading')
  /** Why Send cannot go to what it is set to. */
  const whyNotSendThere = sendTo === 'note' ? whyNotAddToTheNote : whyNotSend

  /**
   * WHETHER A REVIEW IS COLLECTING WHAT THIS COMMENT IS ABOUT. Problem 6yMD5gal_oXz, wave 13x round 22.
   *
   * The owner pressed Start review on a flow page, wrote a second comment, and pressed this box's first press, which was
   * Send. It reached the secretary at once. The owner had thought it would be sent only at the last press, and had meant to
   * review it all and send it together. So while a review collects here, the first press is Add to review
   * and Send is the second, saying it sends now, outside the review (answer y_Vqv-Kab1Ga). Send is kept, because
   * a comment sent directly entering no review is a recorded decision (9BZZVKQxWV9Z, item 1).
   * That order held until item 72 of wave 13y round 134. Since then Send is the first press again and the yellow one, and
   * Add to review is the second. The send key does Add to review here. Since wave 13y round 169 no press draws the key's
   * mark then, and neither review press has a title, so each is its words alone.
   *
   * MOLE OFFICE IS ASKED, as before wave 13r's W4 took the question out: every review collecting in this project, and the
   * collecting ones whose scope reaches this thing. `joinsTheCollectingReview` decides from the two.
   *
   * ASKED AFRESH EACH TIME THE BOX OPENS, and not through the read the review frame shares (`readOnceForThisChange`).
   * That read is forgotten only when this tab writes to a review, so a review started in another tab, by an agent or by
   * a test's own server call was not seen, and Send stayed the first press over a collecting review (measured in
   * tests/a-comment-below-full-reaches-the-agent.test.ts in round 22).
   */
  const [collectingAnywhere] = useProjectAsync(() => api.reviews({ state: 'collecting' }), [reviewWrites])
  const [collectingHere] = useProjectAsync(() => api.reviews({ state: 'collecting', covers: key }), [key, reviewWrites])
  const joinsTheReview = joinsTheCollectingReview({
    collecting: collectingAnywhere.status === 'ready' ? collectingAnywhere.value.reviews.map((one) => one.id) : null,
    reaching: collectingHere.status === 'ready' ? collectingHere.value.reviews.map((one) => one.id) : null,
  })
  /**
   * A READ THAT FAILED IS SAID, and Send then does what its word says: it sends at once. While both are still being read,
   * no press is drawn and the send key does nothing, because the answer decides whether the second press is Start review
   * or Add to review, and which of the two presses the key does.
   */
  const reviewsNotRead =
    joinsTheReview !== null ? null : collectingAnywhere.status === 'error' ? collectingAnywhere : collectingHere.status === 'error' ? collectingHere : null
  const stillReading = joinsTheReview === null && reviewsNotRead === null ? t('talk.stillReadingTheReviews') : null
  const whyNotSendYet = whyNotSendThere ?? stillReading
  const whyNotKeepYet = whyNotWrite ?? stillReading

  /**
   * THE REQUEST TO CHANGE THIS INSTRUCTION, when it is about the instruction in THIS box.
   *
   * The id is checked rather than trusted. Only this component draws a `draft` target, so a request
   * naming a different one cannot be reached today — and an id that identifies a thing is worth
   * nothing if the thing it names is never the one that answers.
   */
  const asked = changing !== null && changing.draftId === draftId ? changing : null
  /** What the change is about, from one reading of the words that were pointed at. */
  const subject = asked === null ? null : subjectOfTheChange(asked.span, body)
  /**
   * THE CHANGE ALREADY BEING WRITTEN ABOUT THESE WORDS, when there is one.
   *
   * It is matched on the words AND on where they were, which is the same pair a change stores
   * everywhere else. Two panels opened on two different phrases each get their own, so abandoning
   * one to start another loses neither.
   */
  const alreadyWriting =
    subject === null
      ? null
      : (beingWritten.find(
          (one) => one.quote === subject.quote && one.from === subject.from && one.to === subject.to,
        ) ?? null)

  /**
   * KEEP WHAT IS BEING TYPED INTO THE PANEL, on every keystroke, with the instruction it belongs to.
   *
   * Nothing here makes the change: it is held, so that closing the panel does not throw it away.
   * Emptying the box takes it away again, because nothing typed is nothing to keep.
   */
  const holdWhatIsBeingWritten = (said: string) => {
    if (subject === null) return
    const others = beingWritten.filter((one) => one.id !== alreadyWriting?.id)
    const next =
      said.trim() === ''
        ? others
        : [
            ...others,
            { id: alreadyWriting?.id ?? newDraftId(), quote: subject.quote, from: subject.from, to: subject.to, said },
          ]
    setBeingWritten(next)
    remember({ beingWritten: next })
  }

  /**
   * The person pressed *Change it*: the change moves from being written to made.
   *
   * IT RECORDS THE SAME VALUE THE PANEL DREW. `subject` is the one reading of what was pointed at,
   * and `markForTheChange` above draws that same value, so a panel saying `Whole instruction` over
   * a change recorded against a phrase is not a thing this file can express.
   */
  const makeTheChange = (said: string) => {
    if (subject === null) return
    const change: DraftChange = {
      id: alreadyWriting?.id ?? newDraftId(),
      quote: subject.quote,
      from: subject.from,
      to: subject.to,
      said,
    }
    const nextChanges = [...changes, change]
    const nextWriting = beingWritten.filter((one) => one.id !== change.id)
    setChanges(nextChanges)
    setBeingWritten(nextWriting)
    remember({ changes: nextChanges, beingWritten: nextWriting })
    onDoneChanging?.()
  }

  /** Asked once before a comment that seems to hold a key is written or sent (by a recorded decision). */
  const keyQuestion = useAKeyQuestion()

  /** Run one act, keeping the box's pending and failed states in one place. `heading` names a failure of the act. */
  const doing = (press: 'send' | 'add' | 'keep' | 'note', act: () => Promise<void>, heading?: (err: unknown) => string) => {
    setSending(press)
    setFailed(null)
    setAddedTo(null)
    act().then(
      () => setSending(null),
      (err: unknown) => {
        setFailed({ message: errorMessage(err), fault: faultOf(err), ...(heading === undefined ? {} : { label: heading(err) }) })
        setSending(null)
      },
    )
  }

  /**
   * WRITE THE NOTE DOWN WITHOUT SENDING IT. The one durable act that has no reader yet.
   *
   * The draft is forgotten only after the server has answered, so a refused write leaves the words
   * in the box where they were typed.
   */
  const writeItDown = async (): Promise<string> => {
    const stored = await api.writeAnnotation({ body: whatIsSaid, context: stamped })
    forgetDraft(draftId)
    reviewChanged()
    return stored.record.id
  }

  /**
   * START REVIEW: KEEP THE COMMENT, THEN START THIS PAGE'S REVIEW OR COME BACK TO THE ONE COLLECTING HERE.
   *
   * The owner's first detail: this press replaced "Save without sending". The comment is written
   * first, so a review that will not start still leaves the words kept, and the frame says which of the two happened.
   * A review starting now takes in the comments kept on this page before it, this one included, in the write that
   * starts it (src/server/lib/reviews.ts). Whether the comment is in the review is read from the review, not assumed.
   * Nothing is sent.
   */
  const keep = (askedAboutAKey = false) => {
    if (whyNotKeepYet !== null) return
    if (!askedAboutAKey && keyQuestion.stopsTheSend({ body: whatIsSaid, target: stamped }, () => keep(true))) return
    doing('keep', async () => {
      const id = await writeItDown()
      setAdded(id)
      try {
        const begun = await startThisPagesReview()
        const detail = await api.oneReview(begun.review.id)
        const holds = [...detail.members, ...detail.saved].some((one) => one.id === id)
        setInReview({ did: !holds ? 'not-in-it' : begun.started ? 'started' : 'added' })
        // ONLY A REVIEW THIS PRESS STARTED takes the shown agent. A review it came back to keeps its own recipient,
        // and the comment stores none (`carryTheShownRecipient`).
        if (holds && begun.started) {
          try {
            setCarried(await carryTheShownRecipient(recipient, begun.review.id))
          } catch (err: unknown) {
            setCarried({ failed: errorMessage(err), fault: faultOf(err) })
          }
        }
        openReview(begun.review.id, true)
        reviewChanged()
      } catch (err: unknown) {
        setInReview({ did: 'not-started', why: errorMessage(err), fault: faultOf(err) })
      }
    })
  }

  /**
   * ADD TO REVIEW: WRITE THE COMMENT DOWN, AND SAY WHICH REVIEW HOLDS IT. Problem 6yMD5gal_oXz.
   *
   * Drawn in place of Start review while a review collects here. Nothing is started: Mole Office decides membership from
   * where a review collects, when it started and who wrote the comment, so the written comment is in the review already.
   * Which review holds it is read back from the message worker's own reading (`reviewHolding`), not assumed. The comment
   * stores no recipient of its own: it goes where the review goes (`carryTheShownRecipient` says why). Nothing is sent.
   */
  const add = (askedAboutAKey = false) => {
    if (whyNotWrite !== null) return
    if (!askedAboutAKey && keyQuestion.stopsTheSend({ body: whatIsSaid, target: stamped }, () => add(true))) return
    doing('add', async () => {
      const id = await writeItDown()
      setAdded(id)
      try {
        const holding = (await api.reviewHolding(id)).review
        if (holding === null) {
          setInReview({ did: 'held-by-none' })
          return
        }
        setInReview({ did: 'held' })
        openReview(holding.id, true)
        reviewChanged()
      } catch (err: unknown) {
        setInReview({ did: 'not-read', why: errorMessage(err), fault: faultOf(err) })
      }
    })
  }

  /** Forget the draft and empty the box, as a box opened afresh is. */
  const emptyTheBox = () => {
    forgetDraft(draftId)
    setBody('')
    setChanges([])
    setBeingWritten([])
  }

  const send = (askedAboutAKey = false) => {
    if (recipient === null || whyNotSendYet !== null) return
    if (!askedAboutAKey && keyQuestion.stopsTheSend({ body: whatIsSaid, target: stamped }, () => send(true))) return
    doing('send', async () => {
      // THE SEND IS THE CHAT'S OWN SEND, ABOUT A PLACE. One message record, addressed to the contact
      // this panel chose, that also says what it is about: the thing right-clicked and the revision
      // the page held. The server writes the delivery rows for `to` exactly as it does for every
      // message the chat writes, so this reaches the contact's conversation the same way. Criterion
      // W4.
      const stored = await api.sendMessageAbout(recipient, whatIsSaid, stamped).catch((err: unknown) => {
        // A REFUSAL THAT STORED THE LETTER SENT IT, so the box forgets the draft and empties at once, and a second
        // press makes no second letter. The routed line stays as the heading over the empty box.
        if (theLetterWasStored(faultOf(err))) emptyTheBox()
        throw err
      })
      void stored
      forgetDraft(draftId)
      setSent(recipient)
    })
  }

  /**
   * SEND, WITH NOTE CHOSEN: add what was right-clicked to the note the press names, or to a new one, with the words typed
   * kept under it, in the requests Add to note made (src/web/lib/add-to-a-note.ts). Once the note holds them the box is
   * emptied and says where they went, with a link that opens the note over the page. A note changed somewhere else
   * between the read and the write is refused with 409, and the box says so; the words stay in the box.
   */
  const sendToTheNote = (askedAboutAKey = false) => {
    if (theNote === undefined || whyNotSendYet !== null) return
    if (!askedAboutAKey && keyQuestion.stopsTheSend({ body: whatIsSaid, target: stamped }, () => sendToTheNote(true))) return
    const pointed: WhatWasPointedAt = { context, about }
    doing(
      'note',
      async () => {
        const note = theNote === null ? await addToANewNote(pointed, whatIsSaid) : await addToANote(pointed, theNote, whatIsSaid)
        emptyTheBox()
        setAddedTo({ note, isNew: theNote === null })
        setPickedNote(note)
        setPickingNote(false)
      },
      (err) => (err instanceof ApiError && err.status === 409 ? t('talk.addToNote.changedElsewhere') : t('talk.note.nothingAdded')),
    )
  }

  // ---- after a write with no reader, the box says so rather than vanishing.
  if (added !== null) {
    return (
      <Frame box={box} at={at} onClose={onClose} title={t('talk.writtenDown')} declares={{ surface: 'composer' }}>
        <p className="px-talk-said">
          {/* THE STATE, AND THE SENTENCE UNDER THE POINTER. Nothing was sent and nobody had to be
              named, which the frame's own title already says: this is the comment now. Saving and
              sending are two acts, and a person who saved is not waiting for anything to arrive. */}
          {inReview === null || (inReview.did !== 'started' && inReview.did !== 'added' && inReview.did !== 'held') ? (
            <span>{t('talk.state.keptNotSent')}</span>
          ) : (
            <span data-part="in-the-review">
              {inReview.did === 'started'
                ? t('talk.state.reviewStarted')
                : inReview.did === 'held'
                  ? t('talk.state.addedToTheReview')
                  : t('talk.state.inTheReview')}
            </span>
          )}
        </p>
        {inReview?.did === 'not-in-it' ? <p className="px-talk-note">{t('talk.state.notInThisReview')}</p> : null}
        {inReview?.did === 'held-by-none' ? <p className="px-talk-note">{t('talk.state.noReviewHoldsIt')}</p> : null}
        {carried === 'a person' ? <p className="px-talk-note" data-part="recipient-not-carried">{t('talk.state.reviewNotToAPerson')}</p> : null}
        {carried === 'no record here' ? <p className="px-talk-note" data-part="recipient-not-carried">{t('talk.state.recipientNoRecordHere')}</p> : null}
        {carried !== null && typeof carried === 'object' ? (
          <ErrorNote message={carried.failed} fault={carried.fault} label={t('talk.state.recipientNotKept')} />
        ) : null}
        {inReview?.did === 'not-started' ? (
          <ErrorNote message={inReview.why} fault={inReview.fault} label={t('talk.state.keptReviewNotStarted')} />
        ) : null}
        {inReview?.did === 'not-read' ? (
          <ErrorNote message={inReview.why} fault={inReview.fault} label={t('talk.state.holdingNotRead')} />
        ) : null}
        <Btn size="sm" onClick={onClose}>
          {t('talk.backToReading')}
        </Btn>
      </Frame>
    )
  }

  if (sent !== null) {
    return (
      <Frame box={box} at={at} onClose={onClose} title={t('talk.sent')} declares={{ surface: 'composer' }}>
        {/* WHO IT WENT TO, THE WAY THE CHOOSER GAVE THEM: a name would be this box asking its own
            registry twice. The chooser read the registries; the words it used are the words here. */}
        <p className="px-talk-said">
          {`${t('talk.sentTo')} `}
          <TheChosenContact who={sent} />
        </p>
        {/* THE PRESS FORWARD, WHICH IS THE CHAT'S OWN WAY IN. `openTheChatAt` is the one event the
            panel listens for, so the conversation this reaches is that ordinary one, not a second
            reading of where a message went. */}
        <Btn
          size="sm"
          onClick={() => {
            openTheChatAt(sent)
            onClose()
          }}
        >
          {t('talk.openTheConversation')}
        </Btn>
      </Frame>
    )
  }

  /**
   * THE WORDS KEPT IN THIS BROWSER ARE AT RISK, OR SOME WERE DROPPED, OR THE STORE IS FULL.
   *
   * A decision took away the line that said, on every keystroke, that the words are kept through a
   * reload: they are kept whether or not it is drawn. What stays is the same
   * sentence on the three paths where it warns of something, because each of those is true only
   * sometimes.
   */
  const wordsAtRisk =
    body.trim() !== '' &&
    (whyTheWordsMayBeLost() !== null || droppedToMakeRoom() > 0 || howManyKept() >= KEEP_AT_MOST)

  return (
    <>
      <Frame
        box={box}
        at={at}
        onClose={onClose}
        title={t('talk.panelName')}
        pinned={pinned}
        onPin={() => setPinned((was) => !was)}
        unsent={body.trim() !== '' || changes.length > 0}
        head={
          /* WHAT IS BEING TALKED ABOUT, AT THE TOP, BESIDE ✕. A decision: a quote bar
             drawn like the chat's quote block, so the panel and the message
             it sends look alike. The block's look is the chat's own stylesheet,
             drawn here by the same tag; the kind word and the words are this panel's reading of what was
             pointed at. */
          <>
            <div className="px-talk-quote-holder" {...partOfMoleOffice({ surface: 'composer.subject' })}>
              <style href="mole-office-chat-quotes" precedence="default">
                {QUOTES_CSS}
              </style>
              <blockquote className="px-chat-quote px-talk-quote">
                <span className="px-chat-quote-inside">
                  {chipWord === null ? null : <span className="px-chat-quote-name px-talk-chip-kind">{chipWord}</span>}
                  <span className="px-chat-quote-words px-talk-chip-what" title={scope.whole}>
                    {wordsNamedBy(context) === null ? scope.words : `“${scope.words}”`}
                    {scope.shortened ? <span className="px-talk-chip-cut">{CUT_MARK}</span> : null}
                  </span>
                  <TheSubjectIsSomewhereElse />
                </span>
              </blockquote>
            </div>
            {/* COPY, BESIDE WHAT THE BOX IS ABOUT, because it copies that: the selected words, or the text of the thing
                right-clicked. It is in the head and not in the press row, because the row is what is done with the
                words written here. The short word Copied is said beside it once the clipboard took the words. */}
            {copies === null ? null : (
              <>
                <Btn
                  size="sm"
                  onClick={() => copy(copies)}
                  pendingSucceeded={lastCopy?.wrote === true}
                  pendingFailed={lastCopy?.wrote === false}
                  {...(copies === '' ? { disabled: true, reason: t('talk.copyHasNoText') } : {})}
                >
                  {t('talk.copy')}
                </Btn>
                {lastCopy?.wrote === true ? (
                  <span className="px-talk-note" role="status" style={{ alignSelf: 'center' }}>
                    {t('talk.copied')}
                  </span>
                ) : null}
              </>
            )}
          </>
        }
        declares={{ surface: 'composer' }}
      >
      {/* A REFUSED COPY IS SAID IN ONE LINE UNDER THE HEAD, in the clipboard's own sentence: that nothing was copied,
          and why. Copied is not said then. */}
      {lastCopy === null || lastCopy.wrote ? null : (
        <p className="px-talk-refusal" role="status" style={{ margin: 0 }}>
          {lastCopy.because}
        </p>
      )}
      {/* WHAT THIS PROJECTION STANDS FOR, WHEN THE THING POINTED AT IS ONE. The owner's acceptance Act 3:
          at the shortest reading length, right-clicking the summary must name which parts of the
          full report it stands for, and View original must land on those parts. */}
      <WhatThisStandsFor context={context} />
      {/* AND THE SAME QUESTION ABOUT A PART OF THE REPORT, at reading levels 4, 5 and 6. A part is
          a projection too: it stands in place of the blocks it covers. */}
      <WhatAPartStandsFor context={context} />

      {/* THE PAGE HAS MOVED ON UNDER THE READER, AND THAT IS WORTH KNOWING BEFORE THEY WRITE. */}
      {changedSinceDrawn ? (
        <p className="px-talk-warn" data-alarm="1" title={t('talk.state.changedSinceDrawn.detail')}>
          {t('talk.state.changedSinceDrawn')}
          <span className="px-sr"> {t('talk.state.changedSinceDrawn.detail')}</span>
        </p>
      ) : null}

      {/* THE WORDS CAME BACK. Said rather than left for the reader to notice, because a box that
          silently refills is indistinguishable from one that has typed something by itself. */}
      {cameBack ? (
        <p className="px-talk-note">{whatCameBack(startedOn, selectedQuote)}</p>
      ) : null}

      {/* SAID BEFORE ANYTHING IS TYPED, because it changes what this comment will be about. */}
      {(() => {
        const said = wordsNotPlacedNote(selectedWords, objectWord(context).toLowerCase())
        return said === null ? null : <p className="px-talk-warn">{said}</p>
      })()}

      {/* THE BOX SAYS WHAT IT IS, WHICH IS WHAT MAKES AN UNSENT INSTRUCTION SOMETHING YOU CAN POINT
          AT. One `data-target` and the two text attributes, exactly as a paragraph of a report
          carries them — the document listener, the walk up the tree and the span arithmetic are all
          the ones that were already there.

          THE ATTRIBUTES SIT ON A WRAPPER RATHER THAN ON THE BOX because `TextArea` is the one
          component in the app that makes a multiline box grow with what is in it, and it takes a
          named set of props.

          THIS IS THE ONE BOX MOLE OFFICE KEEPS THE MENU IN, and the mark says so. Contract 5.5 gives
          every box a person types in to the browser, so that paste, spell-check and look-up are
          reachable; this box is the exception because pointing at a phrase of the instruction you
          are writing is the gesture that revises it, and there is no other way to ask for that. */}
      <div
        style={{ display: 'grid' }}
        {...targetAttributes({ kind: 'draft', draftId })}
        {...textAttributes('body', 0)}
        {...nameAttributes('the instruction you are writing')}
        {...moleOfficeKeepsTheMenu()}
      >
        <TextArea
          value={body}
          onChange={(next) => {
            keyQuestion.close()
            setBody(next)
            remember({ body: next })
          }}
          rows={3}
          growTo={GROW_TO}
          autoFocus={!touchSelectionIsLive()}
          placeholder={t('talk.placeholder')}
          aria-label={t('talk.boxLabel')}
          onKeyDown={aSendKeyPress<HTMLTextAreaElement>(sendKey, () => {
            // THE KEY DOES WHAT SEND DOES, AND NOTHING WHILE A SEND IS UNDER WAY: the press is pending
            // then, and `send` itself refuses a box with no recipient or nothing to send. While a review
            // collects here the key does Add to review instead, so it keeps the comment in the review
            // rather than sending it. No press draws the key's mark then.
            if (!sending) {
              if (joinsTheReview === true) add()
              else if (sendTo === 'note') sendToTheNote()
              else send()
            }
          })}
        />
      </div>

      {/* WHAT YOU CHANGED ABOUT YOUR OWN INSTRUCTION, BEFORE ANYBODY HAS SEEN IT — and the ones
          somebody is still writing, which are kept when the panel closes and so must be visible. */}
      {(() => {
        const held = beingWritten.filter((one) => one.id !== alreadyWriting?.id)
        return changes.length + held.length === 0 ? null : (
        <div role="group" aria-label={t('talk.changes')}>
          <p className="px-talk-note">{t('talk.changes')}</p>
          <div className="px-talk-scroller">
            {[...changes, ...held].map((change) => {
              const made = changes.some((one) => one.id === change.id)
              // OFFSETS ARE EVIDENCE AND ARE NEVER REPAIRED. Editing the instruction after making a
              // change can leave the quoted words somewhere else, or take them out altogether.
              // Mole Office says which of the three it is instead of quietly moving the change.
              const said = whereTheChangeIsWords(whereTheChangeIs(body, change))
              return (
                <div className="px-review-item" key={change.id}>
                  <div className="px-review-item-head">
                    <span className="px-review-quote">{`“${change.quote}”`}</span>
                    <span className="px-review-item-acts">
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (made) {
                            const left = changes.filter((one) => one.id !== change.id)
                            setChanges(left)
                            remember({ changes: left })
                            return
                          }
                          const left = beingWritten.filter((one) => one.id !== change.id)
                          setBeingWritten(left)
                          remember({ beingWritten: left })
                        }}
                      >
                        {made ? t('talk.undo') : t('talk.forgetIt')}
                      </Btn>
                    </span>
                  </div>
                  <p className="px-review-body">{change.said}</p>
                  {made ? null : (
                    // NOT MADE YET, AS A WORD. The row already carries a `Forget it` press and the
                    // words it is about; the sentence said what "not made" means and what finishes
                    // it, and both are behind the word rather than beside it.
                    <p className="px-talk-note" title={t('talk.state.notMade.detail')}>
                      {t('talk.state.notMade')}
                      <span className="px-sr"> {t('talk.state.notMade.detail')}</span>
                    </p>
                  )}
                  {said === null ? null : (
                    <p className="px-talk-warn" data-bad="1">
                      {said}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        )
      })()}

      {/* WHO THE MESSAGE IS FOR: the chat's contacts, in one region of the screen. Criterion W4:
          the same people and registered agents the chat offers, and never a session. Option B of a
          decision draws them as a short list with a filter box, one row
          each.
          THE PANEL OPENS WITH THE RANKING'S FIRST AGENT CHOSEN, or with nobody when the ranking
          names nobody (problem Nu0y2IKdzPcw), by item 5 of a decision. With
          nobody chosen, Send is refused for want of a reader until the list names one. */}
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gut)' }}
        {...partOfMoleOffice({ surface: 'composer.recipient' })}
      >
        <div className="px-talk-to">
          <span className="px-talk-to-label">{t('talk.to')}</span>
          {/* WHAT SEND GOES TO, a contact or a note. The press on its right names which contact or which note. */}
          <span className="px-talk-send-to" role="radiogroup" aria-label={t('talk.sendTo')}>
            {(['contact', 'note'] as const).map((one) => (
              <button
                key={one}
                type="button"
                role="radio"
                className="px-talk-send-to-one"
                data-send-to={one}
                aria-checked={sendTo === one}
                onClick={() => {
                  setSendTo(one)
                  if (one === 'note') setNoteWanted(true)
                  setPicking(false)
                  setPickingNote(false)
                }}
              >
                {t(one === 'contact' ? 'talk.sendTo.contact' : 'talk.sendTo.note')}
              </button>
            ))}
          </span>
          {sendTo === 'contact' ? (
            <button
              type="button"
              className="px-talk-to-btn"
              aria-haspopup="listbox"
              aria-expanded={picking}
              onClick={() => setPicking((v) => !v)}
            >
              {recipient === null ? t('talk.chooseAContact') : <TheChosenContact who={recipient} />}
              <span aria-hidden="true">{' ▾'}</span>
            </button>
          ) : (
            // WHILE THE OFFICE IS ASKED WHICH NOTE WAS LAST WRITTEN IN, the press names none and says it is busy.
            <button
              type="button"
              className="px-talk-note-btn"
              aria-haspopup="listbox"
              aria-expanded={pickingNote}
              aria-busy={theNote === undefined && lastNote.status !== 'error' ? true : undefined}
              onClick={() => setPickingNote((v) => !v)}
            >
              {theNote === null
                ? <NewNoteWords />
                : theNote !== undefined
                  ? theNotesOwnName(theNote)
                  : lastNote.status === 'error'
                    ? t('talk.note.choose')
                    : null}
              <span aria-hidden="true">{pickingNote ? ' ▴' : ' ▾'}</span>
            </button>
          )}
        </div>
        {/* A RANKING THAT COULD NOT BE READ IS SAID, not taken for an empty one: nobody is chosen
            either way, and only this line tells the two apart. */}
        {sendTo === 'contact' && ranked.status === 'error' ? (
          <ErrorNote message={ranked.message} fault={ranked.fault} label={t('r20recipient.rankingFailed')} />
        ) : null}
        {/* A LAST NOTE THAT COULD NOT BE READ IS SAID, and no note is chosen until the person chooses one. */}
        {sendTo === 'note' && lastNote.status === 'error' ? (
          <ErrorNote message={lastNote.message} fault={lastNote.fault} label={t('talk.note.lastNotRead')} />
        ) : null}
        {sendTo === 'note' && pickingNote ? (
          <TheNotes
            chosen={theNote}
            onChoose={(note) => {
              setPickedNote(note)
              setPickingNote(false)
            }}
          />
        ) : null}
        {/* THE LIST IS THE RECIPIENT CONTROL OPENED, so it is drawn inside the recipient region
            rather than beside it: a right-click anywhere in it answers `Recipient`, and there is one
            live element carrying that name. Criterion W4. */}
        <TheChatContacts
          open={picking}
          filedBy={filedBy}
          project={projectNamedByTarget(context.target) ?? undefined}
          chosen={recipient}
          onChoose={setRecipient}
          onDecideToLeave={() => setPicking(false)}
        />
      </div>

      {/* A REFUSAL THAT STILL STORED THE LETTER SAYS WHERE THE LETTER WENT. A person's send to a retired agent, or to an
          agent nothing holds, answers 409 with the letter stored and routed up the chain of starters, and the refusal's
          whole sentence is the routed line. "Nothing was written" would be false then, so the heading is that line. */}
      {failed === null ? null : (
        <ErrorNote
          message={failed.message}
          fault={failed.fault}
          label={failed.label ?? (theLetterWasStored(failed.fault) ? failed.fault.message : t('talk.nothingWritten'))}
        />
      )}
      {reviewsNotRead === null || reviewsNotRead.status !== 'error' ? null : (
        <ErrorNote message={reviewsNotRead.message} fault={reviewsNotRead.fault} label={t('talk.reviewsNotRead')} />
      )}

      <KeyQuestion question={keyQuestion} />

      {/* WHAT THIS BOX CAN DO IS ONE REGION: Send, Start review, and More. By a decision and the owner's first
          detail of a message, Send goes at once to the chosen contact and enters no review; Start review keeps the
          comment in this page's review, which sends nothing. Since
          item 72 of wave 13y round 134, Send is always the first press and the yellow one, and says "Send". While a
          review collects here, the second press is Add to review in Start review's place, and Send says on hover that
          it sends now, outside the review. No row of chips answers what the message means: the words are the
          message. */}
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gut)' }}
        {...partOfMoleOffice({ surface: 'composer.actions' })}
      >
      {/* EMPTY AND BUSY WHILE THE BOX IS STILL READING WHICH REVIEWS COLLECT, at its own height, and then drawn once. Drawn
          before the answer, one set of presses was swapped for another under somebody who was already reading. */}
      <div className="px-talk-do" aria-busy={stillReading === null ? undefined : true}>
        {stillReading !== null ? null : (
          <>
            <Btn
              variant="primary"
              onClick={() => (sendTo === 'note' ? sendToTheNote() : send())}
              pending={sending === 'send' || sending === 'note'}
              pendingFailed={failed !== null}
              {...(joinsTheReview === true ? {} : { keys: theSendKeys })}
              {...(whyNotSendThere !== null
                ? { disabled: true, reason: whyNotSendThere, title: whyNotSendThere }
                : sending !== null && sending !== 'send' && sending !== 'note'
                  ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') }
                  : joinsTheReview === true && sendTo === 'contact'
                    ? { title: t('talk.sendNow.title') }
                    : {})}
            >
              {t('talk.send')}
            </Btn>
            {joinsTheReview === true ? (
              <Btn
                onClick={() => add()}
                pending={sending === 'add'}
                pendingFailed={failed !== null}
                {...(whyNotWrite !== null
                  ? { disabled: true, reason: whyNotWrite }
                  : sending !== null && sending !== 'add'
                    ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') }
                    : {})}
              >
                {t('talk.addToReview')}
              </Btn>
            ) : (
              <Btn
                onClick={() => keep()}
                pending={sending === 'keep'}
                pendingFailed={failed !== null}
                {...(whyNotWrite !== null
                  ? { disabled: true, reason: whyNotWrite }
                  : sending !== null && sending !== 'keep'
                    ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') }
                    : {})}
              >
                {t('talk.startReview')}
              </Btn>
            )}
            <button
              type="button"
              className="px-btn px-talk-more-btn"
              data-variant="secondary"
              data-size="md"
              aria-expanded={more}
              onClick={() => setMore((v) => !v)}
            >
              {t('talk.more')}
              <span aria-hidden="true">{more ? ' ▴' : ' ▾'}</span>
            </button>
          </>
        )}
        {/*
          WHY SEND IS OFF, ONCE SOMETHING IS TYPED. A decision took away the line drawn at open: the
          empty box already says there is nothing to send. With words in the
          box, the one refusal left is that nobody is chosen, and it is said here before anybody
          presses.
          With Note chosen nothing typed is needed, so why Send is off is said at once.
        */}
        {sendTo === 'note' ? (
          whyNotAddToTheNote === null ? null : (
            <span className="px-talk-refusal" role="status">
              {whyNotAddToTheNote}
            </span>
          )
        ) : whyNotWrite !== null || whyNotSend === null ? null : (
          <span className="px-talk-refusal" role="status">
            {whyNotSend}
          </span>
        )}
        {sending === 'note' ? (
          <span className="px-talk-note px-talk-line" role="status">
            {t('talk.addToNote.adding')}
          </span>
        ) : null}
        {/* WHERE SEND PUT THE WORDS, with a link that opens the note over the page, as a card of My notes does. The box
            closes then, because the note is where the person goes next. */}
        {addedTo === null ? null : (
          <span className="px-talk-note px-talk-line" role="status">
            {addedTo.isNew ? t('talk.addedToANewNote') : t('talk.addedToNote', { name: theNotesName(addedTo.note) })}{' '}
            <a
              href={`#${recordPath(addedTo.note.id, 'quick_note')}`}
              onClick={(event) => {
                openTheLinkedNote(event, addedTo.note)
                if (event.defaultPrevented) onClose()
              }}
            >
              {t('talk.addToNote.open')}
            </a>
          </span>
        )}
        {wordsAtRisk ? (
          <span className="px-talk-note">
            {whatKeepsTheWords(whyTheWordsMayBeLost(), droppedToMakeRoom(), howManyKept())}
          </span>
        ) : null}
      </div>
      {more ? (
        <div className="px-talk-more">
          {/* THE PRESS THAT LETS AN AGENT TAKE THIS READER TO THINGS: a right-click anywhere can ask an
              agent to lead the reader to a report. It draws nothing when no agent could take anybody anywhere.
              See components/Leading.tsx. */}
          <FollowFromHere onDone={onClose} />
          {/* AND THE AGENTS NOTHING IS ANSWERING AS, as one line with a count. Criterion M78: starting a new
              agent has to work from the chat box, the contacts, the right-click and other places. */}
          <TheAgentsNobodyAnswersFor onDone={onClose} />
        </div>
      ) : null}
      </div>
      </Frame>

      {/* CHANGING THE INSTRUCTION IS A SEPARATE, LIGHTER PANEL — and the composer above stays
          exactly as it is while it is open. That is what keeps the report anchor attached and the
          contact unchanged: neither is touched, because nothing replaced the box holding them. */}
      {asked === null || subject === null ? null : (
        <ChangeThisInstruction
          key={`${String(subject.from)}:${String(subject.to)}`}
          box={changeBox}
          at={besideTheComposer(box.current, asked.at)}
          mark={markForTheChange(subject)}
          thereAreWordsToChange={subject.quote.trim() !== ''}
          startedWith={alreadyWriting?.said ?? ''}
          aboutWords={scope.words}
          forWords={recipient === null ? t('talk.change.nobodyYet') : <TheChosenContact who={recipient} />}
          onSaying={holdWhatIsBeingWritten}
          onClose={() => onDoneChanging?.()}
          onChange={makeTheChange}
        />
      )}
    </>
  )
}

// ============================================================================ the chosen contact

/**
 * THE CONTACT A CHOICE NAMES, in the words the contact list itself uses.
 *
 * The registries hold the name; this asks once through the shared read the chat and every floating
 * panel already use, so this panel cannot come to call one contact two things. Until the answer is
 * back the row draws no name: a name this panel invents would be the substitution the second
 * invariant forbids, and an id is shown only in developer mode.
 */
export function TheChosenContact({ who }: { who: ContactRef }) {
  useLanguage()
  const [registries] = useProjectAsync(async () => readParticipantsOnce(), [])
  if (registries.status !== 'ready') return <span className="px-talk-chosen" />
  const name = registries.value[who.kind === 'person' ? 'people' : 'agents']?.find(
    (one) => (one as { id: string }).id === who.id,
  )?.name
  return (
    <span className="px-talk-chosen">
      {shortName(name ?? (currentMode() === 'inspect' ? who.id : unregisteredName({ typed: null, said: who })))}
    </span>
  )
}

/**
 * THE CHAT'S CONTACTS IN THE CHAT'S ORDER, AS ONE LIST: the top groups in turn, the groups under
 * each in turn, and the rows of a group by their place in it. Option B of a decision draws them
 * without the headings, so the order is the only thing the groups still decide
 * here.
 *
 * Exported so a test can put the question without a browser.
 */
export function inTheChatsOrder(
  contacts: readonly ShortContactLine[],
  groups: readonly ShortContactsReply['contactGroups'][number][],
  sides: readonly { key: string }[],
): ShortContactLine[] {
  return sides.flatMap((side) =>
    groups
      .filter((group) => group.side === side.key)
      .flatMap((group) => contacts.filter((line) => line.group === group.key).sort((a, b) => a.at - b.at)),
  )
}

/** The agent the ranking says filed the record, on its strongest rung or another, or null when it names none. */
function theAgentThatFiledIt(ranking: readonly AgentRecipientOnTheWire[]): string | null {
  return ranking.find((one) => one.rung === 'filed-this-record' || one.alsoRungs.includes('filed-this-record'))?.agentId ?? null
}

/**
 * THE CONTACTS THE LIST PUTS ABOVE THE REST, in order, each once: the agent that filed the record, then the secretaries
 * with duties in its project. A secretary whose duties nobody recorded there is not pinned. No duties answer pins none.
 */
function theContactsPinnedFirst(
  filedBy: string | null,
  duties: SecretariesDutiesReply | null,
): { agent: string; relation: WordKey }[] {
  const pinned: { agent: string; relation: WordKey }[] = []
  if (filedBy !== null) pinned.push({ agent: filedBy, relation: 'talk.contacts.submittedThisRecord' })
  for (const one of duties?.secretaries ?? []) {
    if (one.duties === null || pinned.some((already) => already.agent === one.agent.id)) continue
    pinned.push({ agent: one.agent.id, relation: 'talk.contacts.thisProjectsSecretary' })
  }
  return pinned
}

/**
 * WHO THE MESSAGE CAN GO TO: THE CHAT'S CONTACTS, AS A SHORT LIST WITH A FILTER.
 *
 * Option B of a decision: the same contacts the chat's contacts tab offers, read the way
 * the chat reads them (the same three reads, and the chat's own name and dot for a row), drawn one
 * row each with a filter box at the top. There are no group headings and
 * no New or Edit presses: arranging the groups and starting an agent stay in the chat.
 *
 * A PRESS ON A ROW NAMES WHO THIS MESSAGE IS FOR, and the panel goes back to the words.
 *
 * A WRITER NOBODY REGISTERED CANNOT RECEIVE. The row carries the words they wrote and no way to
 * answer in place, so pressing it does what the chat's contacts do for the same row: it opens the
 * chat where that conversation already lives.
 *
 * TWO KINDS OF CONTACT ARE PINNED ABOVE THE REST, since wave 13y round 169, each with a few words
 * saying how it stands to what the box is about: the agent that filed the record, then each
 * secretary with duties in the record's project, in the order the duties door answers them. A
 * pinned agent is drawn once, as the first of the two it is. Nothing stands beside any other name.
 * The list is drawn only once both are read, so a pinned row never arrives under the person's
 * pointer after the rest.
 */
export function TheChatContacts({
  open,
  filedBy,
  project,
  chosen,
  onChoose,
  onDecideToLeave,
}: {
  open: boolean
  /** The agent that filed what the box is about, null for none, or undefined while that is still being read. */
  filedBy: string | null | undefined
  /** The project whose secretaries are pinned, or undefined for the switcher's. */
  project: string | undefined
  chosen: ContactRef | null
  onChoose: (who: ContactRef) => void
  onDecideToLeave: () => void
}) {
  useLanguage()
  const [book] = useProjectAsync(async () => {
    const [registries, contacts] = await Promise.all([readParticipantsOnce(), readContactsOnce()])
    return { registries, contacts }
  }, [open])
  // THE SECRETARIES ARE READ ONLY WHILE THE LIST IS OPEN. A closed list's answer is null, which is never drawn as "none".
  const [duties] = useProjectAsync(() => (open ? api.secretariesDutiesIn(project) : Promise.resolve(null)), [open, project])
  // WHO IS REACHABLE IS READ BESIDE THE LIST AND NOT BEFORE IT, at most once a minute (lib/oneread.ts). Until it
  // answers a row draws no dot, which says nothing, rather than a grey one, which would say something.
  const [seen] = useProjectAsync(async () => (await readPresenceForAMinute()).presence, [open])
  const [filter, setFilter] = useState('')
  const everybody = useMemo(() => {
    const out = new Map<string, ParticipantForThePage>()
    if (book.status !== 'ready') return out
    const registries = book.value.registries
    for (const one of registries.people ?? []) out.set(participantKey({ kind: 'person', id: one.id }), one)
    for (const one of registries.agents ?? []) out.set(participantKey({ kind: 'agent', id: one.id }), one)
    return out
  }, [book])
  if (open === false) return null
  if (book.status === 'error') return <ErrorNote message={book.message} fault={book.fault} />
  if (book.status !== 'ready' || filedBy === undefined) return null
  if (duties.status === 'loading' || (duties.status === 'ready' && duties.value === null)) return null
  const contacts = book.value.contacts
  const presence = seen.status === 'ready' ? seen.value : null
  const readingOf = (who: { kind: string; id: string }): PresenceOnTheWire | undefined =>
    presence?.find((one) => one.who.kind === who.kind && one.who.id === who.id)
  const pinned = theContactsPinnedFirst(filedBy, duties.status === 'ready' ? duties.value : null)
  const isPinned = (who: ContactRef | null): boolean => who !== null && who.kind === 'agent' && pinned.some((one) => one.agent === who.id)
  const rows: { line: Pick<ShortContactLine, 'key' | 'who' | 'unregistered'>; relation: WordKey | null }[] = [
    ...pinned.map((one) => ({
      line: { key: participantKey({ kind: 'agent', id: one.agent }), who: { kind: 'agent' as const, id: one.agent }, unregistered: null },
      relation: one.relation,
    })),
    ...inTheChatsOrder(
      contacts.contacts,
      contacts.contactGroups,
      contacts.contactSides ?? CONTACT_SIDES.map((one) => ({ key: one.key })),
    )
      .filter((line) => !isPinned(line.who))
      .map((line) => ({ line, relation: null })),
  ]
  // THE FILTER NARROWS BY THE NAME A ROW DRAWS AND AN AGENT'S HANDLE, the chat's own `theTypedWordsFindARow`, so the
  // two filters match the same rows for the same words.
  const shown = rows.filter(({ line }) => theTypedWordsFindARow(line, everybody, filter))
  return (
    <div className="px-talk-chooser">
      <input
        type="search"
        className="px-chat-filter px-talk-filter"
        value={filter}
        autoFocus
        placeholder={t('chat.contact.filterPlaceholder')}
        aria-label={t('chat.contact.filterLabel')}
        onChange={(event) => setFilter(event.target.value)}
      />
      {duties.status === 'error' ? <ErrorNote message={duties.message} fault={duties.fault} label={t('talk.contacts.secretariesNotRead')} /> : null}
      {rows.length === 0 ? (
        <p className="px-talk-contacts-none">
          <Absence title={CHAT_WORDS.noContacts} />
        </p>
      ) : shown.length === 0 ? (
        <p className="px-talk-contacts-none">
          <Absence title={t('talk.contacts.noMatch')} />
        </p>
      ) : (
        <ul className="px-talk-contacts" role="listbox" aria-label={t('talk.contacts')}>
          {shown.map(({ line, relation }) => {
            const them = line.who
            const one = them === null ? undefined : everybody.get(participantKey(them))
            const isChosen = them !== null && chosen !== null && them.kind === chosen.kind && them.id === chosen.id
            return (
              <li key={line.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isChosen}
                  className="px-talk-contact"
                  data-contact={line.key}
                  onClick={() => {
                    if (them !== null) {
                      onChoose(them)
                      onDecideToLeave()
                    } else if (line.unregistered !== null) {
                      openTheChatAtUnregistered(line.unregistered)
                      onDecideToLeave()
                    }
                  }}
                >
                  {them === null || presence === null ? null : <Dot reading={readingOf(them)} />}
                  <span className="px-talk-contact-name">
                    {them === null
                      ? unregisteredName(line.unregistered ?? { typed: null, said: null })
                      : theNameBesideItsDate(theNameOfAContact(line, everybody), one?.retiredAt)}
                  </span>
                  {them === null ? <span className="px-chat-unregistered">{CHAT_WORDS.unregistered}</span> : null}
                  {relation === null ? null : <span className="px-talk-contact-relation">{t(relation)}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** A note's name within a sentence, including the fallback title stored for a note with no words. */
function theNotesName(note: Pick<PanelRecord, 'title'>): string {
  return note.title.trim() === '' || note.title === t('quickNote.untitled') ? t('quickNote.untitledInSentence') : note.title
}

/** A note's name on its own, as the press and the list of notes draw it. */
function theNotesOwnName(note: Pick<PanelRecord, 'title'>): string {
  return note.title.trim() === '' ? t('quickNote.untitled') : note.title
}

/**
 * THE WORDS NEW NOTE, WITH A PLUS IN A CIRCLE BEFORE THEM, which sets them apart from the person's notes. The words say
 * what the plus is, so the drawing is hidden from a reader.
 */
function NewNoteWords() {
  return (
    <span className="px-talk-new-note">
      <svg className="px-talk-note-sign" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 8v8M8 12h8" />
      </svg>
      <span className="px-talk-notes-name">{t('talk.note.new')}</span>
    </span>
  )
}

/**
 * THE NOTES SEND CAN GO INTO, the list the press on the right of Note opens: New note, then one page of My notes, the
 * newest started first, as the my-notes door answers it. A line says how many older notes it does not list, and My notes
 * lists them. A list that could not be read says so, and still offers New note.
 */
function TheNotes({ chosen, onChoose }: { chosen: PanelRecord | null | undefined; onChoose: (note: PanelRecord | null) => void }) {
  useLanguage()
  const [read] = useAsync(() => api.myNotes({ q: '', only: 'all', zone: theClockZone(), limit: MY_NOTES_PAGE_SIZE, offset: 0 }), [])
  const notes = read.status === 'ready' ? read.value.notes : []
  const left = read.status === 'ready' ? read.value.left : 0
  return (
    <div className="px-talk-notes" aria-busy={read.status === 'loading' ? true : undefined}>
      <ul className="px-talk-notes-list" role="listbox" aria-label={t('talk.notes')}>
        <li className="px-talk-notes-new">
          <button type="button" role="option" aria-selected={chosen === null} className="px-talk-notes-one" onClick={() => onChoose(null)}>
            <NewNoteWords />
          </button>
        </li>
        {notes.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              role="option"
              aria-selected={chosen?.id === note.id}
              className="px-talk-notes-one"
              data-note={note.id}
              onClick={() => onChoose(note)}
            >
              <span className="px-talk-notes-name">{theNotesOwnName(note)}</span>
            </button>
          </li>
        ))}
      </ul>
      {left > 0 ? <p className="px-talk-notes-left">{t('talk.note.left', { n: left })}</p> : null}
      {read.status === 'error' ? <ErrorNote message={read.message} fault={read.fault} label={t('talk.notes.notRead')} /> : null}
    </div>
  )
}

/**
 * AGENTS NOTHING IS ANSWERING AS WITH MESSAGES THE PRESS WOULD CARRY, AS ONE LINE WITH A COUNT.
 * Behind More, one line says how many there are, and the list opens on a press. The selected row is
 * checked before a confirmation.
 *
 * THE COUNT AND THE LIST ARE ONE RULE. The count is read with `useAgentsNobodyAnswersFor` and the
 * list is `StartANewAgentFromHere`, which draws its rows from the same hook, both in
 * components/StartANewAgent.tsx. The line is not drawn while nobody is on the list, which is how the
 * list itself draws nothing when nothing is waiting. A read that failed is not hidden behind a line
 * that is not drawn: the list is drawn at once, and it says the fault.
 */
function TheAgentsNobodyAnswersFor({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const { agents, fault } = useAgentsNobodyAnswersFor()
  return (
    <>
      {agents.length === 0 ? null : (
        <button type="button" className="px-talk-more-line" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span>{t('talk.startANewAgentFor')}</span>
          <span className="px-talk-more-count">{t('talk.notAnswering', { n: agents.length })}</span>
        </button>
      )}
      {open || fault !== null ? <StartANewAgentFromHere onDone={onDone} /> : null}
    </>
  )
}
/**
 * WHERE THE PANEL OPENS: BESIDE THE COMPOSER, NOT ON TOP OF IT.
 *
 * Every other popup in this product opens at the pointer, because the pointer is where the person
 * is looking. This one may not, and the reason was photographed at 1440 on 19 August 2026: the
 * pointer is INSIDE the composer, so a panel placed there covered the instruction it exists to
 * change. A person narrowing one phrase of a sentence needs to see the sentence.
 *
 * THE POINTER IS STILL THE ANSWER WHEN THERE IS NOTHING TO SIT BESIDE, which is the case for one
 * render before the composer has been measured. `placePopup` pulls the result back inside the
 * window either way, so on a narrow screen the panel lands over the composer and that is the only
 * thing a 390px window has to offer.
 *
 * Exported so a test can put the question without a browser.
 */
/**
 * WHAT THE PROJECTION SOMEBODY POINTED AT STANDS FOR, AND THE WAY BACK TO THOSE PARTS.
 *
 * ---------------------------------------------------------------------------------------
 * THE OWNER'S ACT 3, WHICH NOBODY HAD EVER PRESSED
 * ---------------------------------------------------------------------------------------
 *
 * design/problem-03/ACCEPTANCE.md:538: *"At the shortest level, right-click the summary itself. It
 * must name which parts of the full report it stands for, and View original must land on those
 * parts rather than on a new object."* Measured on 1 September 2026: it named neither, and there
 * was no *View original* control anywhere in the product.
 *
 * ---------------------------------------------------------------------------------------
 * IT DRAWS NOTHING FOR ANYTHING THAT IS NOT A PROJECTION, AND THAT IS NOT SILENCE
 * ---------------------------------------------------------------------------------------
 *
 * A paragraph, a table, a whole record — none of them stands in place of anything, so there is no
 * question here to answer and a line saying so would be furniture on every composer in the product.
 * `shortFormLevelOfRegion` is the one function that says whether a region IS one of the six stored
 * forms, and it is asked rather than a string being tested. Where the answer is yes, a sentence is
 * always drawn: which parts the form stands for, or that it stands for the whole record because
 * nobody recorded any parts for it.
 *
 * ---------------------------------------------------------------------------------------
 * THE SENTENCE IS THE SERVER'S
 * ---------------------------------------------------------------------------------------
 *
 * `whatItStandsFor` in src/shared/zoom.ts writes it and the *Shorter forms* panel draws the same
 * string, so the composer and the panel cannot describe one stored fact two ways.
 */
/**
 * WHAT ONE PART OF THE REPORT STANDS FOR, when the thing pressed is one.
 *
 * ---------------------------------------------------------------------------------------
 * IT READS THIS PAGE AND ASKS THE SERVER NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * Which blocks a part covers is on the screen already: the drawing announced the parts it drew, and
 * the region tree it derived is what names a block. So there is no request here and no waiting
 * state — and no second opinion, because both come from the one drawing the reader is looking at.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS DRAWN FOR ANYTHING THAT IS NOT A PART
 * ---------------------------------------------------------------------------------------
 *
 * `partIdOfRegionId` is the one function that says whether a region IS one of the report's parts,
 * and it is asked rather than a string being tested. A press on a paragraph, a table or a whole
 * record answers null here and this draws nothing, which is not silence: none of those stands in
 * place of anything.
 */
function WhatAPartStandsFor({ context }: { context: MessageContext }) {
  const target = context.target
  const region = target.kind === 'region' ? target : null
  const partId = region === null ? null : partIdOfRegionId(region.regionId)
  const drawn = theReportDrawnHere()
  if (region === null || partId === null) return null
  if (drawn === null || drawn.recordId !== region.recordId || drawn.parts === null) return null
  const part = drawn.parts.find((one) => one.id === partId)
  if (part === undefined) return null
  const names = namesOfPartsOnThisPage(drawn.root, drawn.kind, drawn.title)
  return (
    <div className="px-talk-stands">
      <p className="px-talk-said">
        {whatAPartStandsForHere(names, drawn.blocksField, part.coverIds)}
      </p>
    </div>
  )
}

function WhatThisStandsFor({ context }: { context: MessageContext }) {
  const target = context.target
  const region = target.kind === 'region' ? target : null
  // WHICH READING LENGTH WAS PRESSED. Two ways of being one, and both are read rather than guessed.
  //
  //   a stored form   `data.shortForms.label.text`, which is the label and is the only whole-record
  //                   length still written beside a record.
  //   a column        the record's own title or its own summary, which ARE lengths 2 and 3 since
  //                   3 September 2026. The id alone does not say — the same summary is the
  //                   record's one-line summary in the header of a module — so what the report body
  //                   announced it drew is what decides. Criterion A14b.
  const drawn = theReportDrawnHere()
  const asColumn =
    region !== null && drawn !== null && drawn.recordId === region.recordId && drawn.form !== null &&
    drawn.form.regionId === region.regionId
      ? columnRungOfRegion(region.regionId)
      : null
  const which = region === null ? '' : `${region.recordId}/${region.regionId}`
  const levelNow = region === null ? null : (shortFormLevelOfRegion(region.regionId) ?? asColumn)
  // THE LEVEL IS KEPT ONCE IT IS KNOWN FOR THIS REGION. View original puts the page at Full, and
  // Full draws no conclusion, so drawn.form is null there and asColumn above answers null. Without
  // this the box drew nothing after the press, and the sentence saying where the press went was
  // lost with it (problem ZSQ8bXde_50E). The region pressed is still the same conclusion, so what
  // it stands for has not changed.
  const kept = useRef<{ which: string; level: NonNullable<typeof levelNow> } | null>(null)
  if (levelNow !== null) kept.current = { which, level: levelNow }
  const level = levelNow ?? (kept.current !== null && kept.current.which === which ? kept.current.level : null)
  const [reading] = useProjectAsync(
    async () => (region === null || level === null ? null : await api.shortForms(region.recordId)),
    [which],
  )
  const [went, setWent] = useState<Landed | null>(null)
  if (region === null || level === null) return null
  // WHILE THE READ IS OUT, NOTHING IS CLAIMED. A sentence drawn before the answer arrives would be
  // this box saying what a projection stands for on no evidence, which is the fault one level up.
  if (reading.status !== 'ready') return null
  const read = reading.value
  if (read === null) return null
  const here = read.levels.find((one) => one.level === level)
  // A POSITION WITH NO STANDS-FOR ANSWER IS NOT ONE OF THE THREE THIS BOX IS ABOUT. `level` above
  // came from a region that names one of the whole-record lengths, so this cannot happen today; it
  // is read rather than asserted, because a sentence about what a projection stands for is the one
  // thing this box may not make up.
  if (here === undefined || here.standsFor === null) return null
  // THE RECORDED PARTS, NAMED ON THIS PAGE. The server names them in English (`SourceRegion.name`);
  // each carries its region id, so the page names the same part in the page language.
  const recorded =
    here.standsFor.parts === null
      ? null
      : here.standsFor.parts.map((one) => ({
          ...one,
          name: partNameOnThisPage({ recordId: region.recordId, regionId: one.regionId }, read.kind),
        }))
  // A FORM WITH NO RECORDED PARTS STANDS FOR THE WHOLE RECORD BY RULE. `whatItStandsFor` in
  // src/shared/zoom.ts carries the rule and writes the
  // sentence this box draws, and the record it stands for is the record itself. So a form nobody
  // recorded sources for is not a form that stands for nothing: the press has somewhere to go.
  //
  // THE WHOLE RECORD IS READ OFF THIS PAGE'S OWN TREE and named by the one word table, so nothing
  // here invents a second name for the record. Where this page is not drawing the record's tree
  // there is no element to land on and no press, which is not the case the composer is ever in.
  const wholeRecord =
    recorded === null || recorded.length === 0
      ? drawn !== null && drawn.recordId === region.recordId
        ? [{ regionId: drawn.root.id, name: t('chatTriage.theWholeRecord', { kind: kindWord(drawn.kind).text }), stillThere: true }]
        : null
      : null
  const landOn = recorded !== null && recorded.length > 0 ? recorded : wholeRecord
  // A RECORDED LIST WITH NOTHING STILL THERE IS A DIFFERENT CASE, and it keeps its own sentence and
  // its own refusal: those words name parts this record no longer holds, so there is nowhere to go.
  const canGo = landOn !== null && landOn.some((one) => one.stillThere)
  // WHO WROTE THIS FORM, WHEN, AND IN WHICH RUN. A summary has to record who produced it, and this
  // box is now the ONLY place a person meets it.
  // The report's own opening line carried a mark saying it, and the *Shorter forms* panel carried a
  // line beside each stored form; both left the page on the evening of 2 September.
  // `whoWroteIt` is the one function that writes the phrase, so this box and the ledger cannot say
  // one stored fact two ways, and `by`, `at` and `session` arrive on the same reading this box
  // already asked for rather than through a second request.
  //
  // THE RUN IS A LINK: it goes straight to the agent session that made the
  // summary. `session` on the reading is a session record's id, so it is linked the way this box
  // links a record anywhere else. Criterion A9a.
  //
  // AND WHERE NOBODY RECORDED A WRITER, NOTHING IS WRITTEN AT ALL. This drew *nobody recorded who
  // wrote this* in its own line, and writing nothing is better. A
  // form stored before the writer was recorded is not a defective form and a line about it in the
  // place a writer's name goes is noise, so the line is gone rather than shortened.
  //
  // IN THE PAGE LANGUAGE. `whoWroteItHere` below says the same four cases as `whoWroteIt` in
  // src/shared/zoom.ts, with the words from the word lists (problem t_ox8XMOvu7a).
  //
  // ITS OWN CLASS AND NOT `px-talk-said`. That class is the sentence about what the projection
  // stands for, and `tests/view-original-lands-where-it-says.test.ts` counts those to know what the
  // box said before and after *View original* was pressed. This is a different fact, so it is a
  // different element rather than a third one of those.
  //
  // THE WRITER'S NAME WHERE THE READING GIVES ONE, AND WHAT IS STORED WHERE IT DOES NOT. A stored form
  // holds its writer's registry id, which says nothing to a person, and `byName` is that writer's name.
  // A form stored before the writer was stored by id, and a column, give no name, and draw as before.
  const wrote = whoWroteItHere(here.byName ?? here.by, here.at)
  const session = here.session
  return (
    <div className="px-talk-stands">
      <p className="px-talk-said">{standsForHere(here.text, recorded, level, kindWord(read.kind).text)}</p>
      {wrote === null ? null : (
        <p className="px-talk-wrote">
          {wrote}
          {session === null ? null : (
            <>
              {' · '}
              {/* THE CLASS EVERY RECORD LINK IN THIS APP WEARS, and not this box's own
                  px-talk-link. That one is sized for a line that is only a link — Open the
                  conversation, under a sent message — and would draw this one larger than the
                  sentence it sits inside. px-nav inherits the colour and the size of the words
                  around it and underlines at rest, which is what a link inside a line has to do. */}
              <RouteLink to={recordPath(session)} className="px-nav">
                {t('talk.theRunThatWroteIt')}
              </RouteLink>
            </>
          )}
        </p>
      )}
      {canGo && landOn !== null ? (
        <Btn size="sm" variant="ghost" onClick={() => viewTheOriginal(region.recordId, landOn, setWent)}>
          {t('talk.viewOriginal')}
        </Btn>
      ) : null}
      {went === null ? null : <p className="px-talk-said">{went.says}</p>}
    </div>
  )
}

/**
 * WHAT A PRESSED SHORT FORM STANDS FOR, IN THE PAGE LANGUAGE. Problem t_ox8XMOvu7a.
 *
 * The server writes this sentence in English as `standsFor.says`, with `whatItStandsFor` in
 * src/shared/zoom.ts, and the server's words stay English. This box reads the same facts off the
 * same reading, `text` and `standsFor.parts`, and says them with the word lists. The cases are the
 * server's four: nobody wrote this length; nobody recorded any part, so it stands for the whole
 * record; every recorded part is gone; some or none are gone. The English words are the server's
 * word for word.
 *
 * `holder` is what the record is called on this page, *report*, the way the server's `holder` is.
 *
 * `parts` are the recorded parts with the names this page gives them (`partNameOnThisPage`).
 */
function standsForHere(
  text: string | null,
  parts: readonly SourceRegion[] | null,
  level: ShortFormLevel,
  holder: string,
): string {
  const noun = t(`pointWords.length.${level}`)
  if (text === null) {
    return t(`chatEnglish.standsFor.nobodyWrote.${SHORT_FORM_SPECS[level].article}`, { noun, holder })
  }
  if (parts === null || parts.length === 0) return t('chatEnglish.standsFor.whole', { holder })
  const here = parts.filter((one) => one.stillThere).map((one) => one.name)
  const gone = parts.length - here.length
  if (here.length === 0) {
    return gone === 1
      ? t('chatEnglish.standsFor.allGone.one', { holder, noun })
      : t('chatEnglish.standsFor.allGone.many', { n: gone, holder, noun })
  }
  const named = t('chatEnglish.standsFor.parts', { parts: listHere(here) })
  if (gone === 0) return named
  const more = gone === 1
    ? t('chatEnglish.standsFor.someGone.one', { holder })
    : t('chatEnglish.standsFor.someGone.many', { n: gone, holder })
  return t('agentWords.twoSentences', { first: named, second: more })
}

/**
 * WHAT ONE PART OF A BY-PART SUMMARY STANDS FOR, IN THE PAGE LANGUAGE. Problem t_ox8XMOvu7a.
 *
 * The same cases as `whatAPartStandsFor` in src/shared/regions.ts, in its English word for word:
 * the part covers no block; every block it covers is gone; some are gone; none is. `names` is this
 * page's naming of the report's parts, so a block the report no longer holds has no name and is
 * counted rather than dropped.
 */
function whatAPartStandsForHere(
  names: ReadonlyMap<string, string>,
  blocksField: string,
  coverIds: readonly string[],
): string {
  const named: string[] = []
  let gone = 0
  for (const id of coverIds) {
    const name = names.get(`data.${blocksField}[#${id}]`)
    if (name === undefined) gone += 1
    else named.push(name)
  }
  if (named.length === 0) {
    if (gone === 0) return t('chatEnglish.partCovers.nothing')
    return gone === 1 ? t('chatEnglish.partCovers.allGone.one') : t('chatEnglish.partCovers.allGone.many', { n: gone })
  }
  const first = t('chatEnglish.standsFor.parts', { parts: listHere(named) })
  if (gone === 0) return first
  const more = gone === 1 ? t('chatEnglish.partCovers.someGone.one') : t('chatEnglish.partCovers.someGone.many', { n: gone })
  return t('agentWords.twoSentences', { first, second: more })
}

/** A list in a sentence, in the page language: *a, b and c*. */
function listHere(names: readonly string[]): string {
  const last = names[names.length - 1] ?? ''
  if (names.length <= 1) return last
  return t('chatEnglish.list.two', { first: names.slice(0, -1).join(t('chatEnglish.list.between')), last })
}

/**
 * WHO WROTE A FORM AND WHEN, IN THE PAGE LANGUAGE, or null when nobody recorded either. The same
 * four cases as `whoWroteIt` in src/shared/zoom.ts. The writer is the name the reading gives, or the
 * stored value where it gives none, and the time is the stored value.
 */
function whoWroteItHere(by: string | null, at: string | null): string | null {
  if (by !== null && at !== null) return t('chatEnglish.wrote.byAndAt', { by: content(by), at: content(at) })
  if (by !== null) return t('chatEnglish.wrote.by', { by: content(by) })
  if (at !== null) return t('chatEnglish.wrote.at', { at: content(at) })
  return null
}

export function besideTheComposer(
  composer: HTMLElement | null,
  pointer: { x: number; y: number },
): { x: number; y: number } {
  if (composer === null) return pointer
  const at = composer.getBoundingClientRect()
  if (at.width === 0 && at.height === 0) return pointer
  return { x: at.right + 8, y: at.top }
}

/**
 * CHANGE AN INSTRUCTION NOBODY HAS SENT — the second act, and it is deliberately not a second
 * composer.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS THIS SMALL
 * ---------------------------------------------------------------------------------------
 *
 * A lighter *change this instruction* experience was wanted rather than a full second chat
 * window opening on top of the first. So this asks one question and takes one press. There is no
 * recipient control, no row of what-you-mean chips, no review control and no send: none of those is
 * a question about the phrase somebody just pointed at, and every one of them would be a second
 * place to change something the box behind this one already holds.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT SAYS IT IS NOT CHANGING, AND WHY THAT IS ON THE SCREEN
 * ---------------------------------------------------------------------------------------
 *
 * The two chips say what the instruction is still about and who it is still for. Neither is a
 * control here and neither can be changed from here. They are drawn because the risk this whole
 * panel carries is that pointing at your own words quietly re-aims the message — at the phrase
 * instead of the report, or at a different agent. A person about to narrow an instruction is owed
 * the fact that narrowing it moves nothing else.
 *
 * NOTHING HERE REACHES THE SERVER. The change is kept in this browser with the instruction it
 * belongs to, and both go together at the moment the instruction is finally written down or sent.
 */
function ChangeThisInstruction({
  box,
  at,
  mark,
  thereAreWordsToChange,
  startedWith,
  aboutWords,
  forWords,
  onSaying,
  onClose,
  onChange,
}: {
  box: React.RefObject<HTMLDivElement | null>
  at: { x: number; y: number }
  /**
   * WHAT THIS PANEL IS ABOUT, AS THE THING TO DRAW AND NOT AS THE WORDS TO CUT.
   *
   * ---------------------------------------------------------------------------------------
   * WHY THE PANEL IS NOT GIVEN THE INSTRUCTION
   * ---------------------------------------------------------------------------------------
   *
   * This panel quotes the words somebody pointed at, and a quotation is a claim: these are the
   * characters you chose. With nothing selected there are no such characters, and the panel used to
   * quote the first sixty of the instruction anyway, under a note reading *Showing the first words
   * only.* Measured on 20 August 2026 through the campaign's own proof: right-clicking the box with
   * nothing selected drew `“Please create a Problem for the missing width contract and”` — a cut of
   * the person's own sentence, presented as the part of it they had aimed at. They had aimed at all
   * of it.
   *
   * Drawing the state word instead was the first repair, and the audit defeated it: the same cut,
   * put back in a different element, passed every proof. So the second repair is that this panel is
   * never handed the instruction at all. In the whole case `mark` is `{ word }` and holds no
   * characters, so there is nothing here to cut. Contract §6.8: *the subject is the whole
   * instruction and the slot draws the mark `Whole instruction`.* The words themselves are not lost
   * — they are in the draft box behind this panel, unchanged.
   */
  mark: ChangeMark
  /** Whether there is an instruction to change at all. The only thing the refusal below needs. */
  thereAreWordsToChange: boolean
  /**
   * WHAT WAS ALREADY BEING WRITTEN ABOUT THESE WORDS, or an empty string.
   *
   * This panel used to hold its words in its own state and nothing else, so pressing the page threw
   * away whatever had been typed into it — the one loss in this feature that was not announced. The
   * words now go to the composer's draft on every keystroke and come back here. See `beingWritten`
   * in lib/drafts.ts, which has the measurement.
   */
  startedWith: string
  /** What the instruction as a whole is about, in the chip's own words. */
  aboutWords: string
  /**
   * Who the instruction is for, in the same words the composer's own control uses. A node and not
   * a string, because the chosen contact's name is a read the chooser already made; this panel
   * draws it and does not own it.
   */
  forWords: React.ReactNode
  /** Every keystroke, so closing this panel cannot lose what is in it. Makes nothing. */
  onSaying: (said: string) => void
  onClose: () => void
  onChange: (said: string) => void
}) {
  const [said, setSaid] = useState(startedWith)
  // THE SAME SHARED SEND KEY the composer behind this panel uses: this box writes the message too.
  const sendKey = useSendKey()
  /** True when this panel opened onto words somebody had already started writing. Said, not implied. */
  const [cameBack] = useState(startedWith !== '')
  const why = whyNotChangeIt(said, thereAreWordsToChange)
  return (
    <Frame box={box} at={at} onClose={onClose} title={t('talk.change.title')} declares={{ surface: 'composer.change' }}>
      {/* THE WORDS THEY POINTED AT, QUOTED — OR THE STATE WORD, WHEN THEY POINTED AT NO WORDS.
          Both are the whole subject of this panel, so whichever it is comes first and the other is
          not drawn. See the `whole` prop above for what a quotation claims and why a cut of the
          instruction may not be one. */}
      {'word' in mark ? (
        <p className="px-talk-state">{mark.word}</p>
      ) : (
        <p className="px-review-quote">
          {`“${mark.quoted.words}”`}
          {/* NOT SHOWING ALL OF IT IS SAID IN THE SAME MARK THE SUBJECT CHIP ALREADY USES, and it
              is a mark rather than the sentence *Showing the first words only.* One symbol, one
              meaning, one place it is decided — the chip at `px-talk-chip-cut` is the other. */}
          {mark.quoted.shortened ? <span className="px-talk-chip-cut">{CUT_MARK}</span> : null}
        </p>
      )}
      {cameBack ? <p className="px-talk-state">{t('talk.state.wordsCameBack')}</p> : null}

      <TextArea
        value={said}
        onChange={(next) => {
          setSaid(next)
          onSaying(next)
        }}
        rows={2}
        growTo={8}
        autoFocus
        placeholder={t('talk.change.placeholder')}
        aria-label={t('talk.change.label')}
        onKeyDown={aSendKeyPress<HTMLTextAreaElement>(sendKey, () => {
          // ONLY WHEN THE PRESS WOULD ACT: the press is disabled, with its reason, whenever why names one.
          if (why === null) onChange(said)
        })}
      />

      {/* WHAT DOES NOT MOVE. See this component's own note above. */}
      <div className="px-talk-chips">
        <span className="px-talk-chip">
          <span className="px-talk-chip-kind">{t('talk.change.stillAbout')}</span>
          <span className="px-talk-chip-what">{aboutWords}</span>
        </span>
        <span className="px-talk-chip">
          <span className="px-talk-chip-kind">{t('talk.change.stillFor')}</span>
          <span className="px-talk-chip-what">{forWords}</span>
        </span>
      </div>

      <div className="px-talk-do">
        <Btn onClick={() => onChange(said)} {...(why === null ? {} : { disabled: true, reason: why })}>
          {t('talk.change.changeIt')}
        </Btn>
        <span className="px-talk-note">{t('talk.change.nothingIsSent')}</span>
        {why === null ? null : (
          <span className="px-talk-refusal" role="status">
            {why}
          </span>
        )}
      </div>
    </Frame>
  )
}

/**
 * THE THING THIS BOX IS ABOUT IS NOT ON THIS PAGE, SAID IN A WORD, WITH ONE PRESS BACK TO IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The composer survives a change of page, and until now it said nothing about it. Measured on 21
 * August 2026: open it on a block of a report, press the browser's own Back button, and the frame
 * was still there naming `Block of a report` over a page holding no blocks, with the mark on the
 * source gone and nothing connecting the two facts. That is step 58's CAF-9 and contract §13.19.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE FRAME STAYS RATHER THAN CLOSING
 * ---------------------------------------------------------------------------------------
 *
 * Because of what somebody has typed and not sent. Contract §6.2 says a person may go and check
 * something before writing, and closing the frame would take their words off the screen — kept in
 * this browser under the name of the thing they are about, but invisible, with nothing saying where
 * they had gone. That is the loss the whole composer exists to prevent, and it is measured in
 * design/round-nine/closing-the-audit-composer.md.
 *
 * ---------------------------------------------------------------------------------------
 * IT FOLLOWS THE THING, NOT THE ADDRESS
 * ---------------------------------------------------------------------------------------
 *
 * The word is drawn when the thing this box is about is not drawn on this page — the same one
 * lookup that decides whether the mark on the source can be drawn. A row of the rail is on every
 * page, so changing page with the composer open on one leaves nothing behind, and saying otherwise
 * would be a false statement beside a mark still framing the row.
 *
 * ---------------------------------------------------------------------------------------
 * ONE CASE IS NOT HANDLED, AND IT IS SAID HERE RATHER THAN LEFT TO BE FOUND
 * ---------------------------------------------------------------------------------------
 *
 * A thing could stop being drawn WITHOUT the address changing — a block dropped by a redraw, say.
 * `Show` would then go to the address the reader is already at, and do nothing. No path in the
 * product reaches that today: while this box is open, a press anywhere outside it closes it, so the
 * document only changes under an open composer when the address changes. Invariant 6 of USER.md
 * says not to build for a failure that has not happened, so this is written down instead of
 * guarded.
 */
function TheSubjectIsSomewhereElse() {
  const { opened } = useComposer()
  const here = useTheSubjectIsHere()
  if (opened === null || here) return null
  // INSIDE THE QUOTE BAR, as its last line: it says the quote points at something this page no
  // longer draws, and Show goes back to it. A decision keeps it, drawn only when
  // true.
  return (
    <span className="px-talk-away">
      <span className="px-talk-chip px-talk-chip-away">{t('talk.state.notOnThisPage')}</span>
      <button
        type="button"
        className="px-talk-chip px-talk-show"
        onClick={() => {
          navigate(opened.route)
        }}
        title={t('talk.state.notOnThisPage.detail')}
      >
        {t('talk.show')}
      </button>
    </span>
  )
}

/**
 * The shell: a popup with a head row and ✕, drawn in the overlay host, at the point the caller gives.
 *
 * THE HEAD ROW IS A TITLE, OR WHAT THE CALLER PUTS THERE. The panels drawn after Send and after Save,
 * and the panel that changes an instruction, keep their titles. The panel a right-click opens puts
 * its quote bar there instead: a decision took its heading away, because the quote bar already says
 * what the panel is about. `title` stays its accessible name either way.
 *
 * IT SAYS WHICH PART OF MOLE OFFICE IT IS, and that is what makes a right-click inside the composer be
 * about the composer. Until 20 August 2026 nothing in this box said anything except the instruction
 * box, so the walk up the tree ran past the whole popup and answered the page behind it — and the
 * composer was then re-aimed at that page, with the half-written instruction gone from the screen.
 *
 * THE CALLER SAYS WHICH NAME, because there are two frames and they are two different parts of the
 * screen: this box, and the lighter panel that changes an unsent instruction. One name on both
 * would put one id on two live elements, which paints one person's comment on both of them.
 */
function Frame({
  box,
  at,
  onClose,
  title,
  head,
  pinned,
  onPin,
  unsent,
  declares,
  children,
}: {
  box: React.RefObject<HTMLDivElement | null>
  at: HangsAt
  onClose: () => void
  /** The frame's accessible name, and the words of its head row when `head` is not given. */
  title: string
  /** What the head row draws beside ✕ instead of the title. */
  head?: React.ReactNode
  /** Whether the box stays open when the person clicks elsewhere. */
  pinned?: boolean
  /** The press that keeps the box open, drawn beside ✕ on a box that has one. */
  onPin?: () => void
  /** Whether what is in the box has not been sent: its own edge and word, so it cannot be mistaken for a sent one. */
  unsent?: boolean
  /** Which part of Mole Office's own screen this frame is. */
  declares: { surface: SurfaceId }
  children: React.ReactNode
}) {
  /**
   * WHERE IT SITS, AND WHY IT IS FIXED TO THE WINDOW RATHER THAN TO THE ROW.
   *
   * The object that was pressed can be inside anything: a list that scrolls, a table with a
   * scrolling body, a panel that clips. A box positioned inside that row is clipped by it —
   * measured in the browser on 18 August 2026, the top of the box and the whole recipient list were
   * cut off by the list they belonged to. So it is fixed to the window, placed at the point the
   * caller gives, and pulled back inside if it would hang off an edge.
   *
   * BEING FIXED WAS NOT ENOUGH ON ITS OWN, and that is why this box is now drawn in the overlay
   * host. A fixed box inside a frozen table cell is ranked against the page by the CELL, so the
   * composer opened in the plan table was painted under the rows below it however high its own
   * z-index was. See OverlayHost in components/ui.tsx.
   *
   * IT RE-MEASURES ON EVERY RENDER, AND WHENEVER ITS SIZE CHANGES. The box grows: opening the
   * contact list makes it taller, and parts that load later (the list's rows, what More holds) grow
   * it without this frame drawing again. A position worked out while it was short put its bottom,
   * and Send with it, below the window: problem EjkW5flkNFqf, measured on 27 September 2026. So a
   * size watcher places it again each time its size changes. The box keeps its own scroll when it is
   * taller than the window (`max-height` in agent-css.ts), and `placePopup` keeps its top inside.
   */
  /*
   * ON A PHONE IT IS A SHEET FROM THE BOTTOM, NOT A BOX AT THE POINTER (wave 13s round 13). At 390 a box
   * placed at the pointer covered the picture it was opened about and the heading under it, so a person
   * could not see what they had picked (the review of round 12's pictures, report 8eIIwl4erxDt). A
   * sheet leaves the top of the screen to the thing, and the thing is moved into that room when it opens.
   * Placing the box under the thing was the other way offered; it fails as soon as the thing is taller
   * than half the screen, which a picture often is.
   */
  // THE PHONE'S WIDTH IS NARROW_QUERY in ui.tsx, the one place it is written (check K7gPORymm8MT).
  const sheet = useNarrow()
  const asSheet = useRef(sheet)
  asSheet.current = sheet
  useLayoutEffect(() => {
    const el = box.current
    if (el === null) return
    if (sheet) {
      el.style.left = ''
      el.style.top = ''
      return
    }
    placeClearOfTheThing(el, at)
  })
  /** The point to place at, read by the size watcher, which is made once. */
  const placeAt = useRef(at)
  placeAt.current = at
  useLayoutEffect(() => {
    const el = box.current
    if (el === null) return
    const place = (): void => {
      if (!asSheet.current) placeClearOfTheThing(el, placeAt.current)
    }
    const watch = new ResizeObserver(place)
    watch.observe(el)
    // THE THING CAN MOVE WITH NOTHING HERE REDRAWN. Once a comment is written down, its circle gives the block
    // room above itself (CommentCircle.tsx), the paragraph moves down, and the box placed under it lay on it
    // at 1440, 990 and 660. The page grows by that room, so its size is watched as well, in whichever box the
    // page scrolls: on a report wider than a phone the body keeps the window's size, and only what is in the box grows.
    const stopHearingThePage = whenThePageChangesSize(place)
    return () => {
      watch.disconnect()
      stopHearingThePage()
    }
  }, [box])
  useLayoutEffect(() => {
    const el = box.current
    const thing = whereTheOpenSubjectIsDrawn()
    if (!sheet || el === null || thing === null) return
    bringAboveTheSheet(thing, el)
  }, [sheet, box])

  return (
    <Overlay>
      <div
        className="px-talk"
        ref={box}
        role="dialog"
        aria-label={title}
        data-sheet={sheet ? '1' : undefined}
        data-unsent={unsent === true ? '1' : undefined}
        {...partOfMoleOffice(declares)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      >
        <div className="px-talk-head">
          {head ?? <span className="px-talk-title">{title}</span>}
          {onPin === undefined ? null : (
            <button
              type="button"
              className="px-talk-pin"
              aria-pressed={pinned === true}
              aria-label={t(pinned === true ? 'talk.unpin' : 'talk.pin')}
              title={t(pinned === true ? 'talk.unpinTitle' : 'talk.pinTitle')}
              onClick={onPin}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
                <path d="M12 14v7" />
              </svg>
            </button>
          )}
          <button type="button" className="px-talk-close" onClick={onClose} aria-label={t('talk.close')}>
            <span aria-hidden="true">{'✕'}</span>
          </button>
        </div>
        {unsent === true ? (
          <p className="px-talk-unsent" data-part="not-sent">
            {t('talk.notSentYet')}
          </p>
        ) : null}
        {children}
      </div>
    </Overlay>
  )
}

/**
 * PLACE THE BOX AT THE POINT, AND OFF THE THING IT IS ABOUT. Placed at the pointer, its top lay on the
 * paragraph the person had just picked words in and covered the rest of that line, at 1440, 990 and 660
 * (wave 13r round 17, piece 2). So a box that would cover the thing goes under it, or over it when
 * there is no room under it. A thing too tall for either keeps the box at the point.
 */
function placeClearOfTheThing(el: HTMLElement, at: HangsAt): void {
  // The same function the context menu uses, so there is one rule about staying on screen.
  placePopup(el, at)
  // A BOX HUNG UNDER AN ELEMENT STAYS UNDER IT. Moved off the row the element is in, it opened 14px below the
  // element the person was standing on (merge entry xf_2jK-_Fjy_).
  if (at.underAnElement === true) return
  const thing = whereTheOpenSubjectIsDrawn()
  if (thing === null) return
  const box = el.getBoundingClientRect()
  const it = thing.getBoundingClientRect()
  const covers = box.top < it.bottom && box.bottom > it.top && box.left < it.right && box.right > it.left
  if (!covers) return
  const edge = 8
  if (it.bottom + edge + box.height <= window.innerHeight - edge) el.style.top = `${String(Math.round(it.bottom + edge))}px`
  else if (it.top - edge - box.height >= edge) el.style.top = `${String(Math.round(it.top - edge - box.height))}px`
}

/**
 * MOVE THE THING THE SHEET IS ABOUT INTO THE ROOM ABOVE THE SHEET, below the phone's top bar. A thing
 * taller than that room keeps its top in view. Nothing moves when it is already there.
 */
function bringAboveTheSheet(thing: Element, sheet: HTMLElement): void {
  const floor = sheet.getBoundingClientRect().top - 8
  const ceiling = (document.querySelector('.shell-bar')?.getBoundingClientRect().bottom ?? 0) + 8
  const at = thing.getBoundingClientRect()
  let by = at.bottom > floor ? at.bottom - floor : 0
  if (at.top - by < ceiling) by = at.top - ceiling
  if (Math.abs(by) < 1) return
  scrollerOf(thing).scrollBy(0, by)
}

/** The nearest box around an element that scrolls up and down, or the page itself. */
function scrollerOf(element: Element): Element {
  for (let up = element.parentElement; up !== null; up = up.parentElement) {
    const scrolls = /(auto|scroll)/.test(getComputedStyle(up).overflowY)
    if (scrolls && up.scrollHeight > up.clientHeight) return up
  }
  return thePageScroller()
}

/**
 * What a one-off message is called. The list of conversations is read by a person.
 *
 * IT IS CUT AT A SPACE, not at the sixtieth character. `shortenToWords` is the one place that rule
 * lives, so a conversation's name and the chip above the composer stop at the same kind of place.
 */
function directTitle(intent: MessageIntent, about: string): string {
  const short = shortenToWords(about)
  return `${INTENT_WORDS[intent].label}: ${short.words}${short.shortened ? CUT_MARK : ''}`
}
