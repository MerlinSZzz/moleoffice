// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { stillOnThisPage } from '../../lib/pagechoice.ts'
import { behaviorForJump } from '../../lib/motion.ts'
/**
 * THE REVIEW PANE: the switch that starts collecting, and the column that holds what you wrote.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A COLUMN BESIDE THE PAGE AND NOT A BANNER ABOVE IT
 * ---------------------------------------------------------------------------------------
 *
 * A banner can hold a count and a press. A review needs a LIST, because the thing a person does
 * with a review is look down it: this one is about the second paragraph, that one quotes words that
 * have since moved, this one has nobody chosen. The banner's list was folded away behind "Show the
 * comments", so the ordinary state of the surface was a number.
 *
 * The pane is a column beside the reading. It takes horizontal space from the row the page sits in,
 * which is why the reading measure composes with it: `.prose-measure` is a CAP on the space an
 * element is given, never a width, so the text narrows and nothing scrolls sideways. Below 1024px
 * there is no room for a column, so it becomes a band above the page — the slot the banner had.
 *
 * ---------------------------------------------------------------------------------------
 * ONE PRESS ON A COMMENT TAKES YOU TO WHAT IT IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * That is what a paper-review tool does and it is what this could not do. Pressing a row changes
 * the address to the page holding the thing, waits for the thing to appear, scrolls it to the
 * middle of the window and briefly lights the exact words. The address is worked out here, from the
 * target's own ids — the browser owns its routes — and the scrolling and lighting are in
 * MarkLayer.tsx, which is the one place that knows how a stored quote becomes characters on screen.
 *
 * ---------------------------------------------------------------------------------------
 * A ROW SAYS WHEN ITS QUOTE HAS GONE STALE
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 18 August 2026: with two of seven quotes stale, all seven rows drew the quote and
 * nothing else. A comment whose words moved is the one a person most needs to see, because it may
 * now be about something else. Every row carries the server's reading of its own context —
 * `GET /api/reviews/:id` works one out per member on every request — and the row draws it.
 *
 * ---------------------------------------------------------------------------------------
 * TWO PRESSES, TWO MEANINGS, AND THE GAP BETWEEN THEM IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * FINISH COLLECTING writes down what was in the review and SENDS NOTHING. After it, a link made
 * next week cannot change what last week's review contained.
 *
 * SEND REVIEW IS NOT OFFERED, because Mole Office cannot do it. It used to be the pane's primary button
 * after Finish collecting, and every press answered 409: `setState` in src/server/lib/reviews.ts
 * refuses "sent" by name, since marking a review sent would say work had been handed to somebody
 * when none had. design/UX-CONTRACT.md allows a control that cannot work exactly two answers — make
 * it work, or take it out — and names the third, leaving it there with a sentence explaining the
 * failure, as forbidden. It is out.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MOLE OFFICE MADE OF A COMMENT IS DRAWN BESIDE THE COMMENT
 * ---------------------------------------------------------------------------------------
 *
 * A review that has been read carries one sentence per comment, stored on the comment itself. This
 * pane drew none of them: it printed "Mole Office has read these comments" over five rows showing only
 * the bodies, which is a claim with the thing claimed hidden. `ReadingBesideIt` below is the two
 * columns — what the person wrote, and what Mole Office made of it — with the press that changes the
 * reading and the press that takes it away.
 *
 * THE READING IS NEVER DRAWN INSTEAD OF THE WORDS, at any width. The pane is 22rem wide and two
 * readable columns do not fit in it, so in the pane they stack — the words first, then the reading,
 * each under its own heading. Side by side is what the comment's own record page draws, where there
 * is room for two columns; the pair is the same pair and the layout is the surface's business.
 *
 * WHAT CAN BE DONE TODAY IS SENDING ONE COMMENT TO ONE AGENT, and it is offered only AFTER
 * collecting has finished. Offered while collecting, it is the two boundaries collapsed into
 * nothing: a review dispatched a comment at a time with neither press made. It is the same four
 * calls the composer makes when nothing is being collected — `sendOneComment` in api.ts is the one
 * copy of them.
 *
 * ---------------------------------------------------------------------------------------
 * A FINISHED REVIEW IS STILL FINDABLE
 * ---------------------------------------------------------------------------------------
 *
 * Closing the column used to be the end of a review: nothing in the browser listed reviews, no page
 * drew one, and the only handle on it was an id in this browser's own storage. So the column opens
 * on the LIST of this project's reviews, and one press opens any of them — including one whose
 * collecting finished last week.
 *
 * Opening the column also no longer creates a review. It used to, on the press that opened it, and
 * there is no route that deletes one.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE HOLDS A COMMENT
 * ---------------------------------------------------------------------------------------
 *
 * Every comment is read from the server on every visit, because that is where it was written the
 * moment somebody typed it. A copy in this component would be a second answer to "what is waiting"
 * — and above all, a reload, a navigation and a browser
 * accident must all keep the review.
 */

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import {
  api,
  askAnAgentToRead,
  errorMessage,
  faultOf,
  findTheReadingAsked,
  moleOfficeRequest,
  type CommentOnThePage,
  type Fault,
  type RecordListItem,
} from '../../api.ts'
import { nameOfProject, useProjects } from '../../lib/projectlist.ts'
import { MESSAGE_CENTRE } from '../../../shared/workspaces.ts'
import {
  currentReview,
  leaveReview,
  lookAgain,
  openReview,
  openReviewList,
  readOnceForThisChange,
  readOnceForThisLook,
  reviewChangedTo,
  reviewChanged,
  useCountPresses,
  useLooks,
  useReview,
  useReviewChanges,
} from '../../lib/review.ts'
// THE THREE SETTINGS PRIMITIVES THIS DIRECTORY ALREADY USES: read a stored choice and complain
// once about one this build has no meaning for, write one back, and tell React it changed.
import { makeBroadcast, readChoice, writeStored, type StoreFault } from '../../lib/store.ts'
import { currentWorkspace, setWorkspace } from '../../lib/workspace.ts'
// WHICH KEY SENDS A MESSAGE. By a decision, every comment and reading box here asks the one shared
// rule, so its Enter and the chat composer's cannot disagree.
import { aSendKeyPress, useSendKey } from '../../lib/send-key.ts'
// THE SENTENCE FOR A CLAIM ABOUT SEVERAL COMMENTS AT ONCE, written where the sentence beside one
// comment's words is written. One writer, so the pair cannot come to read as two different voices.
import { saidWithOthers } from '@shared/intent.ts'
import { Absence, Btn, ErrorNote, Loading, Overlay, ServerNote, TextArea } from '../ui.tsx'
import { useProjectAsync } from '../../lib/project-async.ts'
import { notesWaiting } from './marks.ts'
// WHAT THEY CAN DO WITH A COMMENT THEY SAVED WITHOUT SENDING: send it, change it, remove it (problem 7VI4cV5ppiFQ).
import { theFaultANoteDraws, WhatASavedCommentCanDo } from './SavedComment.tsx'
import { keptDrafts } from './MarkLayer.tsx'
import { targetKey } from '@shared/targets.ts'
import { elementDrawing } from '../../lib/drawnhere.ts'
import { AGENT_CSS } from './agent-css.ts'
import { SHELL_BAND_QUERY } from '../../lib/shell-layout.ts'
import { whenThePageScrolls } from '../../lib/page-scroll.ts'
import { watchTheSplit } from '../../lib/chat-split.ts'
import { InReachMark, reachBox, useReach } from '../InReach.tsx'
import { SHOWN_CHARACTERS, shortName, shortenToWords, wherePartIsOnThisPage, withoutIds } from './context.ts'
import { useInspect, type Mode } from '../../lib/mode.ts'
import { readParticipantsOnce } from '../../lib/oneread.ts'
import { t, type WordKey } from '@shared/i18n.ts'
import { deliveryReasonKey, WHAT_THE_NOT_IN_READING_LEAVES_OUT } from '@shared/review-pane-words.ts'
import { AgentProjectMove } from '../AgentProjectMove.tsx'
// THE READER'S WORD FOR A STORED ONE, from the one table that holds them. `standsWords` below is
// the only caller here, and it is the reason a row stopped drawing `picked_up` at the owner.
import { kindWord, stateWord } from '../../lib/words.ts'
// WHO A REVIEW GOES TO IS CHOSEN FROM THE CHAT'S CONTACTS, drawn by the right-click panel's own list, so the chat,
// the panel and the review read one source of contacts (problem sLyxTMlvze6A).
import { TheChosenContact, type ContactRef } from './TalkBox.tsx'
// THE LIST ITSELF IS THE ONE CHOSEN FOR THE REVIEW PANE'S PICKER by item 5 of a decision: the same
// contacts, one short list with a filter, in the order and with the reasons of one shared
// function.
import { ContactsInOrder, type WhatThePickIsAbout } from '../ContactsInOrder.tsx'
import { navigate, pathFor, pipelineDrawingPath, pipelinePath, planPath, recordPath } from '../router.tsx'
import {
  recordNamedByTarget,
  spanNamedBy,
  targetAttributes,
  TARGET_ATTRIBUTE,
  targetAttributeValue,
  type Context,
  targetSpec,
  type Target,
  type TargetKind,
  WHY_AN_ACTION_INSIDE_A_READING_HAS_NO_IDENTITY,
  WHY_A_DRAFT_IS_NOT_ON_THE_SERVER,
} from '@shared/targets.ts'
import { showMeThat, stopShowing, useShowing, wordForPlace, type Showing } from './MarkLayer.tsx'
import { startThisPagesReview } from './this-page.ts'
// WHERE A READER IS ON A DRAWING, kept per visit. A press on a comment writes the card it is about
// into it, and the drawing reads it when it opens. Its own header says it is keyed by the drawing
// and the record so that a comment can be taken back to the card it was written on.
import { openTheCardOn } from '../graph/cardhere.ts'
import { scopeKey } from '../graph/model.ts'
import { type WaitingNote } from './marks.ts'
import type { ContextReading } from '../../../server/lib/agents.ts'
import type {
  CommentNotInReview,
  CommentsNotInReview,
  FoundMember,
  MissingMember,
  NotInItReason,
  ReviewDetail,
  ReviewListReply,
  ReviewMember,
  ReviewState,
  ReviewView,
  SendOutcome,
  TakenOutBecause,
  WhereOneCommentGoes,
} from '../../../server/lib/reviews.ts'
import type { ThreadDetail } from '../../../server/lib/agents.ts'
import type { ShortFormForRow } from '../../../server/lib/zoom.ts'
import { surfaceLabel, type SurfaceId } from '../../../shared/surfaces'
import { CHECKLISTS_PRESS } from '../ChecklistParts.tsx'
import { sayANewAgent, sayTheKeptReading, sayTheLine, sayThePlan, sayTheSend, sayTheTakeOut, sayWhyNotKept, type SendPlanSentence } from '../../../shared/send-plan-words.ts'

/**
 * WHAT KIND OF THING A REVIEW OR A COMMENT IS ABOUT, in the page's language.
 *
 * In English it is exactly `objectWord` in ./context.ts, the target declaration's noun with a
 * capital: `review.pane.subject.*` in src/shared/words/en.ts is built from the same noun, and
 * tests/the-review-pane-in-words-and-chinese.test.ts holds the two equal for every kind. It is not
 * `objectWord` itself because that word is also put inside English sentences elsewhere.
 *
 * The stored kind only picks the key; the word drawn is the word list's. tests/machine-word-
 * allowlist.json names the expression all the same, because its scanner reads text and sees a
 * stored value inside a template.
 */
function subjectWord(context: Context): string {
  return t(`review.pane.subject.${context.target.kind}` as WordKey)
}

/** What kind of record it is and what it is called, as `whatARecordIs` answers, by record id. */
type ThingNames = ReadonlyMap<string, { kind: string; title: string }>

/**
 * THE RECORDS THESE REVIEWS ARE OF, NAMED, IN ONE READ FOR THE WHOLE LIST (problem viFpIR398ecU).
 *
 * One request per record, not per review: two reviews of one record ask once. A record that could
 * not be read is left out, and `subjectOf` then says the kind of thing, which is what it knows.
 */
function useThingNames(entries: readonly Context[]): ThingNames {
  const ids = [...new Set(entries.map((entry) => recordNamedByTarget(entry.target)).filter((id): id is string => id !== null))].sort()
  const [named] = useProjectAsync(async () => {
    const answers = await Promise.all(ids.map(async (id) => [id, await whatOneThingIs(id)] as const))
    return new Map(answers.flatMap(([id, one]) => (one === null ? [] : [[id, one] as const])))
  }, [ids.join(',')])
  return named.status === 'ready' ? named.value : new Map()
}

/**
 * WHAT EACH RECORD IS, ASKED ONCE A PAGE, by project and record id, as lib/titles.ts keeps the titles it has read.
 *
 * The pane is built again on every read of the review, and each build asked again for every record its rows were
 * written on: 92 requests for one press of Send on an office of their size (wave 13r round 15). A record renamed while
 * the page is open keeps its old name here until the page is loaded again, as a title in lib/titles.ts does.
 */
const thingsAsked = new Map<string, Promise<{ kind: string; title: string } | null>>()

function whatOneThingIs(id: string): Promise<{ kind: string; title: string } | null> {
  const key = `${currentWorkspace()}|${id}`
  const held = thingsAsked.get(key)
  if (held !== undefined) return held
  const asked = api.whatARecordIs(id).then(
    (one) => one,
    () => {
      // NOT A FAULT OF THE LIST. The record is gone or cannot be read, and the row says the kind of thing instead of a
      // name, which is all that is known. It is asked again next time, because the next answer may be different.
      thingsAsked.delete(key)
      return null
    },
  )
  thingsAsked.set(key, asked)
  return asked
}

/**
 * WHAT A REVIEW IS OF, NAMED: the kind of record and its title, and the kind of part where it was
 * started on a part of one (problem viFpIR398ecU).
 *
 * The column's head used to say only the kind — "Collecting · Record · 0 comments" for a review of a
 * module called The gripper — so a person with two reviews could not tell which was collecting. The
 * contract's pane header names the subject (design/ROUND-NINE-INTERACTION-CONTRACT.md 6.13, 6.15).
 *
 * THE KIND IS WHAT IS SAID UNTIL THE NAME IS KNOWN, and it is all that is said for a thing that is
 * not in a record — a page, a part of Mole Office's own screen — or a record that could not be read.
 * The title is cut at the length a chip shows, and the whole of it is under the pointer.
 */
function subjectOf(context: Context, names: ThingNames): { words: string; whole: string } {
  const word = subjectWord(context)
  const id = recordNamedByTarget(context.target)
  const named = id === null ? undefined : names.get(id)
  if (named === undefined) return { words: word, whole: word }
  const kindText = kindWord(named.kind).text
  const kind = kindText.charAt(0).toUpperCase() + kindText.slice(1)
  const say = (title: string): string =>
    context.target.kind === 'record'
      ? t('review.pane.subject.thing', { kind, title })
      : t('review.pane.subject.partOfThing', { part: word, kind, title })
  return { words: say(shortName(named.title, SHOWN_CHARACTERS)), whole: say(named.title) }
}

/**
 * WHERE A COMMENT WAS WRITTEN, said as the head line says the review's subject when it was written on a whole record:
 * the kind and the title, in the page's language (report cu3k8UH1DiRT: a Chinese page drew the server's English,
 * the note "…", under each comment).
 *
 * A COMMENT ON A PART is said in the page language too, from the word lists (`wherePartIsOnThisPage`), and says WHICH
 * part where this page draws the record (tests/the-review-pane-names-which-part.test.ts). The server's sentence said
 * that in English on a Chinese page (wave 13r round 16). A record the page has not named yet, or could not read, keeps
 * the server's sentence. Developer detail keeps the server's sentence whole, ids and all.
 */
function whereItWasWritten(about: string, context: Context | null, names: ThingNames, inspect: boolean): string {
  if (inspect || context === null) return about
  const id = recordNamedByTarget(context.target)
  const named = id === null ? undefined : names.get(id)
  if (named === undefined) return withoutIds(about, context)
  if (context.target.kind === 'record') return subjectOf(context, names).whole
  if (context.target.kind === 'region') return wherePartIsOnThisPage(context.target, named.kind, named.title)
  return withoutIds(about, context)
}

// ---------------------------------------------------------------------------- the switch

/**
 * Open and close the review column. This is the whole entry point, and it sits at the top of the
 * frame.
 *
 * WHY THE TOP OF THE SIDEBAR. The control belongs high on the page, such as the top-right
 * area. Above 1024px this app has no top bar at all — the frame is the left sidebar — so the top
 * of the sidebar is what "top right" means on a desktop, and it is the one place present on every
 * page at every width. The alternative, a control on each page, would be a different control per
 * page for one product-wide state.
 *
 * IT OPENS A COLUMN AND WRITES NOTHING. It used to start a review on the press, so an accidental
 * press created a review row that no route can delete, and it read "Review is on" — a state where
 * an action belongs, whose press stopped the review with nothing on screen saying so. Starting is
 * now a press inside the column, next to the list of reviews that already exist.
 *
 * THE DOT SAYS WHETHER ANYTHING IS COLLECTING, which is the one thing about a review worth knowing
 * from a page that is not showing it. It stays lit while the column is CLOSED, because collecting
 * does not stop when a column does — see `leaveReview` in lib/review.ts, and the measurement there.
 *
 * THE DOT ASKS MOLE OFFICE, THROUGH THE SAME READ AS THE RING (problem 38r1U3Cu6lxc). It used to
 * read this browser's own store, which only a press in the column corrects. So a review started in
 * another browser left it hollow under a ring that said a review was collecting, and a review ended
 * elsewhere left it lit for ever. `useTheCollectingReview` below is the one read both of them draw.
 * While that read is out, or when it failed, the dot is not lit: nothing has said a review is
 * collecting.
 */
export function ReviewSwitch({ getOutOfTheWay }: { getOutOfTheWay?: () => void } = {}) {
  const review = useReview()
  const collecting = useTheCollectingReview()
  return (
    <>
      <style href="mole-office-agent" precedence="default">
        {AGENT_CSS}
      </style>
      <button
        type="button"
        className="px-review-switch"
        aria-pressed={review.open}
        onClick={() => {
          // THE DRAWER CLOSES ON THE PRESS, AND WITHOUT THAT THIS IS UNREACHABLE ON A PHONE. Below
          // 1024px the sidebar is a drawer over the page, so the only way to reach this control is
          // to open the menu — and the menu is then covering the column the press just opened.
          // Photographed at 390 on 5 September 2026: the drawer stood over the whole column and
          // only the word Close showed past its edge.
          //
          // IT MATTERS MORE THAN IT DID. Until that day a band across the top of every page carried
          // a way in, so a phone had one outside the drawer. The band was removed —
          // problem `Wa-23qH_zbPx` — and this is the only way in there is now.
          //
          // IT IS THE FRAME THAT CLOSES IT, not this button, because whether anything is covering
          // the page is a fact about that column. Above 1024px it is in the flow, `open` is already
          // false, and this does nothing.
          getOutOfTheWay?.()
          if (review.open) leaveReview()
          else openReviewList()
        }}
      >
        {/* ITS ICON IS DRAWN AS THE SIDEBAR'S ICONS ARE, at their size: a ring, filled while a review is
            collecting. It is the sidebar's own ring (r 8.5, as Today's); at r 7 it read smaller than the icons. */}
        <svg className="shell-ico px-review-dot" viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-on={collecting !== null ? '1' : undefined}>
          <circle cx="12" cy="12" r="8.5" />
        </svg>
        <span className="px-review-switch-words">{t('review.pane.switch.words')}</span>
      </button>
    </>
  )
}

// ---------------------------------------------------------------------------- how it is drawn

/**
 * WHAT A PERSON MAY CHANGE ABOUT THE REVIEW FRAME, and what they may not.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SETTING IS ALLOWED HERE AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * The frame is drawn on every page of the application while a review collects, so it is the one
 * piece of this product a person cannot walk away from. The brief asks for it to be customisable
 * by name. `Edge` takes the ring. `Accent` is a tint and never the signal, so whichever hue is
 * chosen the ring is still drawn. `Source marks` turns off the wash on the words a comment quoted,
 * and not the rows in the pane: a setting that could hide a comment would lose work.
 *
 * THERE USED TO BE THREE EDGES AND THERE ARE TWO. `band` meant "no ring, keep the band across the
 * top of every page", and the band was removed — problem
 * `Wa-23qH_zbPx`. With no band to keep, `band` and `off` would have been two words for one
 * behaviour, which is a vocabulary lying about what it offers. A browser that had stored `band`
 * reads `frame` and says so, through the same fault path every other unreadable setting uses.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS LEFT WHEN THE RING IS TAKEN
 * ---------------------------------------------------------------------------------------
 *
 * The rule was that the weakest setting still left two channels: `Edge` took the ring and the
 * hatch and could not take the word or the glyph, because those were in the band. The band is
 * gone, so with `Edge: off` the one thing on screen that says a review is collecting while the
 * column is closed is the lit dot on the sidebar's Reviews control.
 *
 * THAT DOT NOW STANDS IN FOR IT, and until 30 September 2026 it could not (problem
 * `VsCAN2HSUQS1`). It was drawn from `useReview().on`, this browser's own store, so it knew about a
 * review this browser started and not about one started anywhere else. Measured on 5 September
 * 2026 in a real browser, on a page where a review had been started through the API: the dot
 * carried no `data-on` at all. It is drawn now from `useTheCollectingReview`, the same read as the
 * ring, and tests/the-review-strip-and-the-ladder.test.ts measures it lit with the ring taken.
 *
 * NOTHING IN THE PRODUCT CAN SET THIS TODAY. `setReviewLook` has no caller anywhere in `src`, so
 * every reader gets the ring.
 */
export const REVIEW_EDGES = ['frame', 'off'] as const
export type ReviewEdge = (typeof REVIEW_EDGES)[number]
export const REVIEW_ACCENTS = ['neutral', 'blue', 'green', 'plum'] as const
export type ReviewAccent = (typeof REVIEW_ACCENTS)[number]
export const REVIEW_SWITCHES = ['on', 'off'] as const
export type ReviewSwitchValue = (typeof REVIEW_SWITCHES)[number]
export const REVIEW_MOTIONS = ['pulse', 'still'] as const
export type ReviewMotion = (typeof REVIEW_MOTIONS)[number]

/** The four choices, and the word each control draws. Read by the strip and by Settings. */
export interface ReviewLook {
  edge: ReviewEdge
  accent: ReviewAccent
  marks: ReviewSwitchValue
  motion: ReviewMotion
}

export const REVIEW_LOOK_KEYS = {
  edge: 'mole-office.review.edge',
  accent: 'mole-office.review.accent',
  marks: 'mole-office.review.marks',
  motion: 'mole-office.review.motion',
} as const

/**
 * WHAT IS STORED AND WHAT IS DEFAULTED, read once at import time so nothing flashes.
 *
 * A value this build has no meaning for is dropped and complained about once — `readChoice` does
 * that — rather than silently becoming the default, because a setting that quietly resets is a
 * setting a person cannot trust.
 */
/**
 * WHY AN ACT FAILED: the caught error's message and its fault, so ErrorNote draws it by its one rule (wave 13k's
 * message cRe7D2NojoAd). The fault is null where the words are the page's own and nothing was caught.
 */
type Failure = { message: string; fault: Fault | null }

const lookFaults: StoreFault[] = []
let look: ReviewLook = {
  edge: readChoice(REVIEW_LOOK_KEYS.edge, REVIEW_EDGES, 'frame', lookFaults),
  accent: readChoice(REVIEW_LOOK_KEYS.accent, REVIEW_ACCENTS, 'neutral', lookFaults),
  marks: readChoice(REVIEW_LOOK_KEYS.marks, REVIEW_SWITCHES, 'on', lookFaults),
  motion: readChoice(REVIEW_LOOK_KEYS.motion, REVIEW_MOTIONS, 'pulse', lookFaults),
}
const lookChanged = makeBroadcast()

/** How the review frame is drawn in this browser. */
export function reviewLook(): ReviewLook {
  return look
}

/** Anything this browser would not remember, for Settings to say in place. */
export function reviewLookFaults(): StoreFault[] {
  return lookFaults
}

/**
 * CHANGE ONE OF THE FOUR. The attributes on the root element are written here and nowhere else, so
 * the stylesheet and the stored choice cannot come to disagree — a stylesheet that reads an
 * attribute somebody else writes is the same fact in two places.
 */
export function setReviewLook(next: Partial<ReviewLook>): void {
  look = { ...look, ...next }
  for (const [name, key] of Object.entries(REVIEW_LOOK_KEYS)) {
    writeStored(key, look[name as keyof ReviewLook])
  }
  paintReviewLook()
  lookChanged.announce()
}

/** Put the four choices on the root element, where the stylesheet reads them. */
export function paintReviewLook(): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-review-edge', look.edge)
  root.setAttribute('data-review-accent', look.accent)
  root.setAttribute('data-review-marks', look.marks)
  root.setAttribute('data-review-motion', look.motion)
}

export function useReviewLook(): ReviewLook {
  return useSyncExternalStore(lookChanged.subscribe, reviewLook, reviewLook)
}

// ---------------------------------------------------------------------------- the frame

/**
 * THE REVIEW THAT IS COLLECTING IN THIS PROJECT, AS MOLE OFFICE SAYS, or null.
 *
 * Null while the answer is out, when the read failed, and when Mole Office said none is collecting.
 * The ring and the dot on the sidebar's Reviews control both draw this one read, so they cannot
 * come to disagree (problem 38r1U3Cu6lxc). It is read again whenever a comment or a review changes
 * in this browser.
 */
function useTheCollectingReview(): ReviewView | null {
  return useTheCollectingList()?.reviews[0] ?? null
}

/**
 * THE REVIEWS COLLECTING IN THIS PROJECT, AS MOLE OFFICE SAYS, with the records they are of named and what each holds
 * counted, or null while the answer is out, when the first read failed, and before the frame has read it.
 *
 * ONE READ FOR EACH CHANGE AND EACH LOOK, whoever asks (`readOnceForThisLook` in lib/review.ts). The frame, the
 * sidebar's Reviews control, the column and the question asked on leaving a page all draw it; each used to make its own
 * read, so a press on a contact read this list three times (wave 13r round 15). It was once read for each change only,
 * and a change is a write made in this tab, so a review started anywhere else was drawn only after a reload (wave 13x
 * round 23). A look is a move inside the app or the window coming back into focus.
 *
 * ONE READ SLOT, HELD BY THE FRAME (wave 13x round 24). Each of the four used to hold a
 * `useAsync` of this read, and each `useAsync` has its own slot on the strip at the foot of the page
 * (src/web/components/ReReadStrip.tsx). So one read that failed drew "A newer read failed." four times, with the same
 * words (wave 13x round 24, measured). Only the frame holds the `useAsync` now, in `useTheCollectingListRead`, because it
 * is mounted once on every page. It puts what it has in `heldList`, and everything else draws from there.
 */
function useTheCollectingList(): ReviewListReply | null {
  return useTheHeldList()?.list ?? null
}

/** What the frame's read of the collecting reviews last answered, the project it was answered in, and the change it was read at. */
interface HeldList {
  workspace: string
  list: ReviewListReply | null
  /** The `useReviewChanges` count the list was read at, so a part can tell a list read before its own last change. */
  changes: number
}
let heldList: HeldList = { workspace: '', list: null, changes: -1 }
const heldListChanged = makeBroadcast()

/**
 * The held list, while it was answered in the project this page is in. Otherwise null, so a list read in the project the
 * page has just left is never drawn under the new one's name, not even in the one render before the frame says so.
 */
function theHeldList(): HeldList | null {
  return heldList.workspace === currentWorkspace() ? heldList : null
}

function useTheHeldList(): HeldList | null {
  return useSyncExternalStore(heldListChanged.subscribe, theHeldList, theHeldList)
}

/**
 * THE ONE READ, made by the frame and nowhere else. What it answers is put in `heldList` in a layout effect, so the
 * sidebar's dot and the column are drawn from it before the page is painted, in the same frame as the ring.
 */
function useTheCollectingListRead(): ReviewListReply | null {
  const changes = useReviewChanges()
  const looks = useLooks()
  const [collecting] = useProjectAsync(async () => ({ list: await readTheCollectingList(), changes }), [changes, looks])
  const read = collecting.status === 'ready' ? collecting.value : null
  useLayoutEffect(() => {
    heldList = { workspace: currentWorkspace(), list: read?.list ?? null, changes: read?.changes ?? -1 }
    heldListChanged.announce()
  }, [read])
  return read?.list ?? null
}

/** The reviews collecting in this project, read once for each change and each look. */
function readTheCollectingList(): Promise<ReviewListReply> {
  return readOnceForThisLook('reviews?state=collecting', () => api.reviews({ state: 'collecting' }))
}

/**
 * One review read, shared by everything drawn for it at this change. `again` is what the list of collecting reviews said
 * of it when that differed from what was drawn (OneReview), and it makes this a read of its own, once for each thing said.
 */
function readTheReview(id: string, again: string | null = null): Promise<ReviewDetail> {
  return readOnceForThisChange(again === null ? `review:${id}` : `review:${id} again, the list said ${again}`, () => api.oneReview(id))
}

/**
 * THE PROJECT'S COMMENTS, AND WHICH HAVE GONE OUT, one read each for each change, shared by everything this file draws.
 * The comments are about 400 KB on an office of their size, and a press of Send read them twice (wave 13r round 15).
 */
function readTheComments(): ReturnType<typeof api.commentRecords> {
  return readOnceForThisChange('messages/comments', () => api.commentRecords())
}

function readTheMarks(): ReturnType<typeof api.agentMarks> {
  return readOnceForThisChange('agent/marks', () => api.agentMarks())
}

/** The records a list of reviews is of, named by the list's own reply, in the shape `subjectOf` reads. */
function namesFrom(named: ReviewListReply['named'] | undefined): ThingNames {
  return new Map(Object.entries(named ?? {}))
}


/**
 * THE REVIEW FRAME: the ring round what is being read while a review is collecting.
 *
 * ---------------------------------------------------------------------------------------
 * THE BAND ABOVE EVERY PAGE IS GONE
 * ---------------------------------------------------------------------------------------
 *
 * This used to be `ReviewStrip`, a sticky band across the top of every page saying Collecting, the
 * subject and how many comments were in it, with a button that opened the column. It went,
 * because the Reviews press in the left sidebar, which opens the column at the right, is enough.
 * Problem `Wa-23qH_zbPx`.
 *
 * WHERE ITS WORDS WENT. Into the head of the review column, which is the thing the sidebar's
 * Reviews control opens — `ReviewList` for the list of reviews and `PaneBody` for one of them. Both
 * now say the state word, the subject and the count. Nothing was dropped; it is read in one place
 * instead of on every page.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS LEFT, AND WHY IT IS NOT FURNITURE
 * ---------------------------------------------------------------------------------------
 *
 * Two things, and neither is a band. The ring, which frames the part of the screen a comment would
 * be about; and the announcement a screen reader hears. The ring is what makes "a review is
 * collecting" visible while somebody is reading rather than only when they open the column, and
 * the sidebar's Reviews control carries a lit dot beside it saying the same thing.
 *
 * ---------------------------------------------------------------------------------------
 * IT ALSO PAINTS THE LOOK, AND IT IS THE ONLY THING THAT DOES
 * ---------------------------------------------------------------------------------------
 *
 * `paintReviewLook` writes the `data-review-*` attributes on the root element, and the stylesheet
 * reads them for the ring's accent and for the edge switch. The strip's effect was its one live
 * call site, so this component carries it: without it those attributes are never written at all and
 * the accent silently falls back for every reader.
 *
 * ---------------------------------------------------------------------------------------
 * THE SERVER SAYS WHETHER A REVIEW IS COLLECTING. THIS BROWSER DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * It asks `GET /api/reviews?state=collecting` and draws what comes back. The browser's own store
 * says only whether the column is open. A frame drawn from local storage would be drawn on a
 * machine whose storage was cleared and not on the one that started the review, and the two would
 * disagree about the one fact this exists to state.
 */
export function ReviewFrame() {
  const look = useReviewLook()
  const list = useTheCollectingListRead()
  const one = list?.reviews[0] ?? null
  // NAMED BY THE LIST'S OWN REPLY, which carries the name of every record its reviews are of. This used to be one more
  // read per record, on every page.
  const names = namesFrom(list?.named)

  useEffect(() => {
    paintReviewLook()
  }, [look])

  // THE WINDOW COMING BACK INTO FOCUS LOOKS AGAIN, because a review may have been started or ended in another tab or
  // by an agent while the person was away (wave 13x round 23). A focus on a field in the page is not this event: it
  // is fired at the field, and a listener on the window that does not capture hears only the window's own.
  useEffect(() => {
    window.addEventListener('focus', lookAgain)
    return () => window.removeEventListener('focus', lookAgain)
  }, [])

  const on = one !== null
  return (
    <>
      <style href="mole-office-agent" precedence="default">
        {AGENT_CSS}
      </style>
      {/* THE ONE ANNOUNCEMENT. It is its own element and it holds nothing a person can press, which
          is why it may be a live region at all: a live region holding a count and two controls
          re-announces every time somebody writes a comment, and this is mounted on every page. */}
      <span className="sr-only" aria-live="polite">
        {on ? t('review.pane.announce', { subject: subjectOf(one.entry, names).whole }) : ''}
      </span>
      {on ? <TheRing /> : null}
      <LeaveQuestion />
    </>
  )
}

/**
 * THE RING ROUND WHAT IS BEING READ.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS FIXED TO THE WINDOW AND MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The document scrolls, and a report in this corpus is seventeen thousand pixels tall. An edge
 * drawn on the box the page is in is therefore an edge a reader sees the top of once and the
 * bottom of once. Fixed to the window, the four edges are all on the screen at every scroll
 * depth, which is what makes this a frame rather than a decoration at the top of a document.
 *
 * THE RAIL IS OUTSIDE IT. Framing the navigation would say the application had changed, and the
 * application has not: what changed is what a comment does to the thing being read.
 *
 * THE FOUR NUMBERS ARE MEASURED BECAUSE NO CSS LENGTH SAYS THEM. The content region's left edge is
 * whatever the flex row gave it after the rail, which is a different number with the rail
 * collapsed, with the drawer shut and with the review column open. It is measured in a layout
 * effect and on every resize of that box, so it is right before the first paint rather than one
 * frame later.
 */
function TheRing() {
  const ring = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const box = document.querySelector('.shell-body')
    const paint = () => {
      const element = ring.current
      if (element === null || box === null) return
      const rect = box.getBoundingClientRect()
      element.style.left = `${String(Math.round(rect.left))}px`
      element.style.width = `${String(Math.round(rect.width))}px`
      element.style.top = '0px'
      element.style.height = `${String(Math.round(window.innerHeight))}px`
    }
    paint()
    if (box === null) return
    const watching = new ResizeObserver(paint)
    watching.observe(box)
    window.addEventListener('resize', paint)
    // A SWAP OF THE CHAT MOVES THE PAGE WITHOUT CHANGING ITS SIZE, so neither the observer nor the window's resize
    // hears it, and the ring was left where the page had been. The split store tells its watchers before the page has
    // moved, so this measures in the next frame, when the page is where it is going.
    let asked = 0
    const soon = () => {
      if (asked !== 0) return
      asked = window.requestAnimationFrame(() => {
        asked = 0
        paint()
      })
    }
    const stopWatchingTheSplit = watchTheSplit(soon)
    return () => {
      watching.disconnect()
      window.removeEventListener('resize', paint)
      stopWatchingTheSplit()
      if (asked !== 0) window.cancelAnimationFrame(asked)
    }
  }, [])
  return <div className="px-strip-ring" ref={ring} aria-hidden="true" data-drawn="1" />
}

// ---------------------------------------------------------------------------- where a comment lives

/**
 * WHERE A PRESS ON A COMMENT GOES: the page that holds the thing, the page it was SEEN on, or why
 * Mole Office cannot open one.
 *
 * ---------------------------------------------------------------------------------------
 * THREE ARMS AND NOT TWO, BECAUSE TWO OF THEM ARE DIFFERENT CLAIMS
 * ---------------------------------------------------------------------------------------
 *
 * `path` is the page that HOLDS the thing this comment is about. Open it and you are looking at the
 * thing.
 *
 * `seenOn` is the page the person WAS ON when they pointed. It is evidence, measured at the moment
 * of writing, and it is not what the comment is about: the rail is on every page, and this one was
 * seen on this one. The two are kept apart in the TYPE rather than in a comment, so a screen cannot
 * draw the second as though it were the first — which is the whole distinction
 * src/shared/targets.ts spends a paragraph on and which a single `path` field would have thrown
 * away at the first call site.
 */
export type WhereToGo = { path: string } | { seenOn: string } | { cannot: string }

/**
 * WHICH PAGE HOLDS EACH OF THE THIRTEEN THINGS A PERSON CAN POINT AT.
 *
 * A TOTAL MAP OVER THE VOCABULARY, the way the server's own scope reader is one. A fourteenth thing
 * a person can point at does not compile until somebody has said which page holds it, so a comment
 * cannot quietly become a row nothing can open.
 *
 * THE ADDRESSES ARE THE BROWSER'S. `GET /api/annotations/:id` hands back ids and never a URL, for
 * exactly this reason: the routes belong here, in one file, and the server does not restate them.
 *
 * IT IS HANDED THE WHOLE CONTEXT AND NOT A BARE TARGET, and that one argument is what makes the
 * `uiSurface` row below able to answer at all. Twelve of the thirteen rows read nothing but the
 * target and are written to take the context anyway, because a row that took a different argument
 * from its neighbours would be a second shape for one question.
 */
type ContextAbout<K extends TargetKind> = Context & { target: Extract<Target, { kind: K }> }

const PAGES: { [K in TargetKind]: (context: ContextAbout<K>) => WhereToGo } = {
  record: ({ target }) => ({ path: recordPath(target.recordId) }),
  reportBlock: ({ target }) => ({ path: recordPath(target.recordId) }),
  // A PART OF A REPORT IS ON THE PAGE THAT HOLDS THE REPORT, as a block of one is. Its own address
  // inside that page is a separate question and is step 3 of this wave, which is not built: until a
  // record has a sub-address, opening the record is the whole of what can honestly be offered.
  region: ({ target }) => ({ path: recordPath(target.recordId) }),
  // A CHANGE IS ON THE PAGE OF THE RECORD IT WAS MADE TO. Its own place on that page is behind the
  // change-log fold, and this product has no sub-address for a record page — the same limit the
  // region row above names.
  change: ({ target }) => ({ path: recordPath(target.recordId) }),
  tableRow: ({ target }) => ({ path: recordPath(target.recordId) }),
  tableCell: ({ target }) => ({ path: recordPath(target.recordId) }),
  graphNode: ({ target }) => ({ path: recordPath(target.recordId) }),
  // A NOTE IS A RECORD, so the page that holds one is the page that holds any record.
  annotation: ({ target }) => ({ path: recordPath(target.annotationId) }),
  plan: ({ target }) => ({ path: planPath(target.planId) }),
  planLine: ({ target }) => ({ path: planPath(target.planId) }),
  planLineFact: ({ target }) => ({ path: planPath(target.planId) }),
  // The schedule draws one week at a time and a window id does not say which week. So this opens
  // the schedule, and when the block is not in the week it opens on, the pane says it is not there
  // rather than scrolling to something that happens to be in the same place.
  scheduleBlock: () => ({ path: pathFor('plan') }),
  agentMessage: () => ({ path: pathFor('agents') }),
  // A SURFACE HAS NO ONE PAGE, and saying otherwise would be a guess. The rail, a badge and a control
  // label are drawn on every page, so the surface name deliberately does not carry a route — putting
  // one in the name would turn one rail into sixteen different things (src/shared/surfaces.ts).
  //
  // THE ROUTE IT WAS SEEN ON IS EVIDENCE AND NOT IDENTITY, and it is now reachable. It is stored on
  // `seen`, this function is handed the whole context, and the answer comes back in its own arm so
  // that no screen can draw "where you were" as "what this is about". That sentence used to end
  // "…and this function is handed a target and nothing else, so it cannot reach it" — a limit that
  // was real, and that had been left standing for three rounds while `Seen.route` sat declared and
  // unwritten.
  //
  // A COMMENT WITH NO `seen` STILL GETS THE REFUSAL, AND IT IS THE SAME SENTENCE. Nothing measured
  // a screen before 25 August 2026, so the owner's three comments of 21 August carry none and
  // nothing can be worked out for them after the fact. Guessing a page for those would be inventing
  // the evidence this arm exists to keep honest.
  uiSurface: ({ target, seen }) =>
    seen === undefined
      ? {
          cannot: t('review.pane.surfaceNoPage', { surface: surfaceLabel(target.surfaceId as SurfaceId) }),
        }
      : { seenOn: seen.route },

  page: ({ target }) => ({ path: target.route }),
  // MOLE OFFICE DOES READ COMMENTS NOW, and this row is still a refusal for a narrower reason. What it
  // keeps is one SENTENCE per comment, on the comment. A single action inside that sentence has no
  // id of anything, so there is no object for this target to name and no page that could hold one.
  // The sentence itself is on the comment's own page, which the `annotation` row above opens.
  proposedAction: () => ({
    cannot: t('review.pane.actionNoPage', { why: WHY_AN_ACTION_INSIDE_A_READING_HAS_NO_IDENTITY }),
  }),
  draft: () => ({
    cannot: t('review.pane.draftNoPage', { why: WHY_A_DRAFT_IS_NOT_ON_THE_SERVER }),
  }),
}

/**
 * WHERE A PRESS ON A COMMENT GOES.
 *
 * ---------------------------------------------------------------------------------------
 * A COMMENT WRITTEN ON A DRAWING OPENS THAT DRAWING
 * ---------------------------------------------------------------------------------------
 *
 * D8's second sentence: *Opening the comment later from the chat or the review column takes the
 * reader to that card at that level.* A comment written on a card stored the drawing it was on and
 * the level the card was at, and nothing read either back: every press landed on the record page,
 * so the reader had to find the card again and set its level again by hand. Recording a thing and
 * never using it is the half that makes the other half worth nothing.
 *
 * `drawnOn` is what says the comment was on a drawing at all. Where it is absent — which is every
 * comment written anywhere else, and every comment written before this — the map below answers as
 * it always has.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS PURE, AND THE REMEMBERING IS A SEPARATE CALL
 * ---------------------------------------------------------------------------------------
 *
 * This is asked while a page is being drawn — RecordPage asks it to decide what a row offers — so
 * it may not write anything. `rememberTheCardACommentWasOn` below is what a press calls, and it is
 * the one place the card and its level are put where the drawing will find them.
 */
export function pageHolding(context: Context): WhereToGo {
  const drawing = theDrawingHolding(context)
  if (drawing !== null) return drawing
  const read = PAGES[context.target.kind] as (c: Context) => WhereToGo
  return read(context)
}

/**
 * THE DRAWING A COMMENT WAS WRITTEN ON, as an address, or null when it was not written on one.
 *
 * The router builds each address, so none is spelled a second time here: `pipelineDrawingPath` is
 * the modules drawing, `#/pipeline/drawing`, and `pipelinePath(<id>)` is one pipeline's drawing.
 */
function theDrawingHolding(context: Context): { path: string } | null {
  const on = context.drawnOn
  if (on === undefined) return null
  if (on.drawing === 'pipeline') {
    // A PIPELINE DRAWING WITH NO PIPELINE NAMED IS NOT AN ADDRESS. Nothing writes one, and
    // answering with the project's drawing instead would take the reader somewhere else and say
    // nothing about it.
    return on.pipelineId === undefined ? null : { path: pipelinePath(on.pipelineId) }
  }
  // THE MODULES DRAWING HAS AN ADDRESS OF ITS OWN. The bare `pipelinePath()` is the list of pipelines, and a press
  // that went there opened no drawing and focused no card.
  if (on.drawing === 'modules') return { path: pipelineDrawingPath() }
  return { path: pipelinePath() }
}

/**
 * PUT THE CARD AND ITS LEVEL WHERE THE DRAWING WILL FIND THEM. Called by a press, before it goes.
 *
 * The address cannot carry either of them: `parseRoute` splits the hash on slashes, there is no
 * query string in this product's routes, and a third segment is refused as a typo. So the card and
 * its level go through `cardhere.ts`, the store that already keeps how a reader is reading one
 * drawing, keyed by the drawing and the record — which is what its own header says it is keyed that
 * way FOR.
 *
 * IT DOES NOTHING FOR A COMMENT THAT WAS NOT ON A DRAWING, and nothing for one whose target names
 * no record, because there is no card to open.
 */
export function rememberTheCardACommentWasOn(context: Context): void {
  const on = context.drawnOn
  if (on === undefined) return
  const recordId = recordNamedByTarget(context.target)
  if (recordId === null) return
  const drawing = on.drawing === 'pipeline' && on.pipelineId !== undefined
    ? scopeKey({ at: 'pipeline', recordId: on.pipelineId })
    : scopeKey({ at: 'modules' })
  // THE LEVEL MAY BE ABSENT and then the card opens at whatever the drawing opens it at. A comment
  // written before views were recorded has none, and inventing one would be a claim about somebody
  // else's reading.
  openTheCardOn(drawing, recordId, context.view?.detail ?? null)
}

/**
 * WHAT A PRESS THAT LANDS ON A `seenOn` MUST SAY BEFORE IT NAVIGATES.
 *
 * The one sentence, in one place, because two surfaces draw it — the review pane and a comment's
 * own page — and the whole point of the third arm is that a reader is never told "this is what the
 * comment is about" when what Mole Office has is "this is where it was written".
 */
export function seenOnWords(route: string): string {
  return t('review.pane.seenOn', { route })
}

// ---------------------------------------------------------------------------- what a row says

/** What a row says about whether the thing it points at still holds. */
export type StaleMark =
  /** Something moved and a person has to look at this comment again. */
  | { kind: 'act'; words: string }
  /** Mole Office could not tell, which is a different fact from the words having gone. */
  | { kind: 'cannot say' }
  | null

/**
 * WHETHER THE THING A COMMENT IS ABOUT HAS MOVED UNDER IT.
 *
 * THE QUOTE IS ASKED ABOUT FIRST, because it is the sharpest of the four answers: words that are
 * not there any more are words this comment may no longer be about. Then the thing itself.
 *
 * "NOBODY HAS LOOKED" IS KEPT APART FROM "SOMETHING MOVED", and it is drawn through `Absence` at
 * the told-apart tier so that the two cannot come to look the same. That is the fifth engineering
 * rule on a list of forty rows.
 *
 * Exported so a test can put every reading without a browser.
 */
export function staleWords(reading: ContextReading): StaleMark {
  if (reading.quote !== undefined && !reading.quote.stillThere) {
    return { kind: 'act', words: t('review.pane.stale.quoteGone') }
  }
  if (reading.state === 'gone') return { kind: 'act', words: t('review.pane.stale.gone') }
  if (reading.state === 'changed') return { kind: 'act', words: t('review.pane.stale.changed') }
  if (reading.state === 'unknown') return { kind: 'cannot say' }
  return null
}

/**
 * WHERE A COMMENT STANDS, said only when it is worth saying.
 *
 * A comment nobody has sent is the ordinary state of everything in a review, and a word repeated on
 * every row is furniture rather than information — design/UX-CONTRACT.md names that failure by
 * hand. The pane's own heading carries how many have been sent; a row says so only when it is one
 * of them.
 *
 * ---------------------------------------------------------------------------------------
 * THE READING COMES FROM THE ONE TABLE, AND AN UNKNOWN WORD IS SAID OUT LOUD
 * ---------------------------------------------------------------------------------------
 *
 * This held three words of its own — `queued`, `sent`, `answered` — and RETURNED THE STORED WORD
 * for anything else. Wave 3 made a comment's state one of six and deleted `answered`, so a row read
 * `handled`, `picked_up` or `failed`: a machine token with an underscore in it, on a screen, in a
 * product whose plain-language rule is an invariant. Measured 25 August 2026 on a claimed run that
 * posted a result.
 *
 * `stateWord` in src/web/lib/words.ts is the one table of readings for every state word this
 * product stores, and it already carried all six. So there is no second list here to fall behind
 * the first, and a word nothing has a reading for comes back as "unknown state: wibble" rather than
 * as itself — rule 3 of that file, and the same refusal `deliveryWordOf` makes on the server.
 *
 * `answered` is not branched on any more and still reads "Answered", because that table keeps it:
 * it is gone from the six but records written before the change hold it.
 *
 * THE CAPITAL IS THIS ROW'S, NOT THE TABLE'S. It is drawn as a chip beside `Changed`, `Gone` and
 * `Not known`, which are capitalised where they are declared; the table's words are lower case
 * because most of its readers put them inside a sentence.
 */
export function standsWords(state: string, mode: Mode = 'normal'): string | null {
  if (state === 'queued') return null
  const said = stateWord(state, mode).text
  return said.charAt(0).toUpperCase() + said.slice(1)
}

/**
 * ONE COMMENT IN A REVIEW, AS THE THING THAT DRAWS IT ON WHAT IT WAS LEFT ON.
 *
 * `sent` MEANS "HAS GONE TO SOMEBODY", NOT "IS EXACTLY THE WORD sent". It asked for the word until
 * 25 August 2026, and a comment's state became one of six: so a comment that had reached
 * `delivered`, `picked_up` or `handled` was carried to the mark layer as still waiting for somebody
 * to send it. `queued` is the one word that means nobody has been given these words, which is the
 * same question `hasGoneOut` answers on the server.
 *
 * Exported so a test can put all six words to it without a browser.
 */
export function noteOfMember(member: FoundMember): WaitingNote {
  return { id: member.id, body: member.body, context: member.context, sent: member.state !== 'queued' }
}

/**
 * How many comments there are and how many have gone, in the sentence a person reads.
 *
 * A COMMENT THE REVIEW CONTAINED AND CANNOT SHOW IS COUNTED SEPARATELY. It used to be counted as
 * one of the comments the review holds, so a frozen review that had lost one read "3 comments,
 * none sent." with a row underneath saying that one of the three is not there. The number a person
 * reads was a count of what was collected drawn as a count of what is present.
 */
/**
 * HOW MANY ARE IN IT, HOW MANY HAVE GONE, AND HOW MANY ARE NOT THERE ANY MORE.
 *
 * THREE COUNTS SEPARATED THE WAY THE REST OF THIS HEADER IS SEPARATED. It used to be three
 * sentences run together — "1 comment, none sent. 2 more are no longer here." — under a state word
 * that is already saying where the review stands. Nothing is dropped: `none sent` and
 * `no longer here` are the same words, and every number is the same number.
 */
export function countWords(members: readonly ReviewMember[]): string {
  const here = members.filter((m) => m.found)
  const lost = members.length - here.length
  const gone = here.filter((m) => m.state !== 'queued').length
  if (here.length === 0 && lost === 0) return t('review.pane.count.nothing')
  const comments = t('review.pane.count.comments', { n: here.length })
  const sent = gone === 0 ? t('review.pane.count.noneSent', { comments }) : t('review.pane.count.sent', { comments, n: gone })
  if (lost === 0) return sent
  return t('review.pane.count.lost', { sent, n: lost })
}

/**
 * A comment a frozen review contained and Mole Office cannot show, without its id.
 *
 * The server's own sentence names the id and is the whole statement; design/UX-CONTRACT.md puts a
 * record id in Developer detail, so that sentence is drawn there and this one is drawn in Normal.
 * It is the same treatment `withoutIds` already gives the sentence on a row.
 */
export function missingWords(member: MissingMember): string {
  return member.source === 'annotation'
    ? t('review.pane.missing.annotation')
    : t('review.pane.missing.conversation')
}

/**
 * WHEN A REVIEW STARTED COLLECTING, TO THE SECOND.
 *
 * WHY NOT THE AGE. The row used to draw the age — "just now", "2h ago" — and the age is what two
 * reviews of one afternoon have in common. Measured in Chromium on 19 August 2026 with two reviews
 * started a second apart: both rows read "Collecting — Record / just now", character for character,
 * and nothing on either row said which was which. design/UX-CONTRACT.md's rule for a list is that a
 * row exists to help somebody find the thing, and two rows nobody can tell apart help nobody.
 *
 * THE START IS THE RIGHT ONE OF THE TWO TIMES A REVIEW HAS, because it is what the review IS: a
 * comment written before it is not in it. `finishedWords` says the other, on the reviews that have
 * one.
 *
 * THE STAMP IS DRAWN AS MOLE OFFICE STORED IT, which is a local wall clock. Nothing is reformatted, so
 * this row and the server's own sentence about the same review read the same.
 */
export function startedWords(started: string): string {
  return t('review.pane.started', { at: started })
}

/** When collecting finished. Absent on a review that is still collecting, and it says nothing then. */
export function finishedWords(collectedAt: string): string {
  return t('review.pane.finished', { at: collectedAt })
}

/** Where a review stands, in the words a person would use. A total map, so a fifth state must say. */
//
// EACH WORD IS READ FROM THE WORD LISTS WHEN IT IS DRAWN, so the page's language is the one asked.
// A getter per state keeps this a total map a test can walk with Object.keys.
export const REVIEW_STATE_WORDS: Readonly<Record<ReviewState, string>> = {
  get collecting() { return t('review.pane.state.collecting') },
  get collected() { return t('review.pane.state.collected') },
  // IT USED TO SAY "Read by Mole Office", AND MOLE OFFICE DID NOT READ THEM. Nothing under src/ may start a
  // process, so the words are read by something outside and Mole Office checks that answer and keeps it.
  // A state word that names the wrong reader is the second engineering rule broken in four words.
  get organised() { return t('review.pane.state.organised') },
  get sent() { return t('review.pane.state.sent') },
  // ENDED, AND NOT FINISHED. The two are different acts with different consequences and this word
  // is the only thing on a list row that tells them apart.
  get abandoned() { return t('review.pane.state.abandoned') },
}

/**
 * WHAT HAPPENS NEXT TO THIS REVIEW USED TO BE FOUR PARAGRAPHS HERE, and then a row of four steps.
 *
 * `WHAT_IS_NEXT` was a total map from the review's state to a paragraph — 96 words over four
 * entries — printed under the list of comments. A row of four steps, Collecting · Organise · Check ·
 * Send, replaced it, and the owner took that row out on 6 October 2026, by answer B of a decision:
 * a review can be sent straight from collecting, so two of the four were not steps a person has to
 * take. A test deleted on 13 November 2026 held it out.
 *
 * ITS SENTENCES WERE DELETED FROM tests/sentence-allowlist.json IN THE SAME COMMIT, which is what
 * the sentence gate enforced until it was deleted on 12 November 2026.
 */

/**
 * THE COMMENTS THIS REVIEW DOES NOT HOLD USED TO BE A SENTENCE WITH A NUMBER IN IT.
 *
 * `outsideWords` wrote "2 other comments in this project are waiting and are not in this review.
 * They are still stored." That is what the page showed when two comments written four
 * minutes earlier fell outside a review: a count, no ids, and no way through to either of them. It
 * also could not say WHY, because the browser had nothing to say it from — so it said the part it
 * knew and left the rest to be guessed at.
 *
 * The `Not in it` group replaces it with rows: the words, where they were written, the reason from
 * the server's closed set of seven, and the same press a member row has. `commentsNotIn` in
 * src/server/lib/reviews.ts is where the reason is worked out, once.
 */

/**
 * WHERE HAVING THE COMMENTS READ HAS GOT TO, in the pane's own words.
 *
 * ---------------------------------------------------------------------------------------
 * THREE STATES, AND THE MIDDLE ONE IS THE WHOLE POINT
 * ---------------------------------------------------------------------------------------
 *
 * Nobody has asked · somebody asked and nothing has answered · an answer is here. The middle one is
 * an ordinary and possibly long state — a run waits for a worker, and the worker may be on another
 * machine or not running at all — and a surface that drew it as a spinner would be promising an
 * answer nobody has.
 *
 * IT IS DECIDED FROM THE CONVERSATION AND NOTHING ELSE, so a test can put the question without a
 * browser. `answer` is the newest thing an agent said in it; a run writes its answer into the
 * conversation as a message, so that is where it is read from.
 */
export type TheReading =
  /**
   * NOBODY HAS ASKED. It carries a WORD and not a sentence, because this is an absence and the pane
   * draws it through `Absence` at the told-apart weight — a mark, with the whole sentence on it. A
   * paragraph here would be a paragraph on every finished review nobody has got to yet, which is
   * design/UX-CONTRACT.md's furniture.
   */
  | { asked: false; word: string }
  | { asked: true; waiting: boolean; says: string; answer: string | null }

export function whereTheReadingHasGot(thread: ThreadDetail | null): TheReading {
  if (thread === null) return { asked: false, word: t('review.pane.read.nobodyAsked') }
  const answers = thread.messages.filter((one) => one.role === 'agent')
  const newest = answers.length === 0 ? null : (answers[answers.length - 1]?.body ?? null)
  if (newest === null) {
    return {
      asked: true,
      waiting: true,
      says: t('review.pane.read.waiting'),
      answer: null,
    }
  }
  return {
    asked: true,
    waiting: false,
    says: t('review.pane.read.answered'),
    answer: newest,
  }
}

/**
 * TURN PASTED TEXT INTO SOMETHING TO SEND, or say plainly why it is not one.
 *
 * IT CHECKS NOTHING ABOUT THE READING ITSELF, and that is deliberate. `checkOrganised` on the server
 * is the one statement of what a reading is, and it is the only check that can compare an answer
 * against the comments that were handed over. A second check here would be the same rule written
 * twice, free to refuse something the server would accept. So this turns text into a value, and the
 * server decides whether the value is a reading of these comments.
 */
export type AnswerRead = { reading: unknown } | { problem: string }

export function readWhatCameBack(text: string): AnswerRead {
  const trimmed = text.trim()
  if (trimmed === '') return { problem: t('review.pane.paste.empty') }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { problem: t('review.pane.paste.unreadable') }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { problem: t('review.pane.paste.notAboutThese') }
  }
  return { reading: parsed }
}

/**
 * THE GIST OF THE THING ONE COMMENT IS ABOUT, or which kind of nothing there is instead.
 *
 * ---------------------------------------------------------------------------------------
 * A LENGTH NOBODY WROTE IS ABSENT AND SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * Nothing here reads a record body, so nothing here can fall back to cutting one. A gist is 20 to
 * 30 words somebody wrote on purpose; the first 30 words of a report are not a gist and drawing
 * them as one would be a claim about writing nobody did.
 *
 * FOUR ANSWERS, BECAUSE THREE OF THEM ARE DIFFERENT KINDS OF NOTHING. A comment on a plan line is
 * about no record at all and there is nothing to ask. A pane that has not asked yet is not the same
 * as one that asked and was told nobody has written one. Both differ again from a gist that exists
 * and whose record has moved on since it was written.
 */
export type GistBeside =
  | { kind: 'nothing-to-ask' }
  | { kind: 'nobody-looked'; says: string }
  | { kind: 'none'; says: string }
  | { kind: 'gist'; text: string; current: boolean; says: string }

export function gistBeside(rows: readonly ShortFormForRow[] | null, target: Target): GistBeside {
  const key = targetSpec(target.kind).recordIdentifier
  if (key === null) return { kind: 'nothing-to-ask' }
  const recordId = (target as unknown as Record<string, string | undefined>)[key] ?? ''
  if (recordId === '') return { kind: 'nothing-to-ask' }
  if (rows === null) {
    return { kind: 'nobody-looked', says: t('review.pane.gist.notAsked') }
  }
  const row = rows.find((one) => one.recordId === recordId)
  if (row === undefined) {
    return {
      kind: 'nobody-looked',
      says: t('review.pane.gist.noAnswer'),
    }
  }
  if (row.text === null) return { kind: 'none', says: row.says }
  return { kind: 'gist', text: row.text, current: row.state === 'current', says: row.says }
}

/** Every record this review's comments are about, so one request can ask about all of them. */
export function recordsBehind(members: readonly ReviewMember[]): string[] {
  const ids = new Set<string>()
  for (const member of members) {
    if (!member.found) continue
    const key = targetSpec(member.context.target.kind).recordIdentifier
    if (key === null) continue
    const id = (member.context.target as unknown as Record<string, string | undefined>)[key] ?? ''
    if (id !== '') ids.add(id)
  }
  return [...ids]
}

/** Who a comment seemed to be for, by note id, from what the person wrote when they wrote it. */
export function hintsFrom(records: readonly RecordListItem[]): Map<string, string> {
  const hints = new Map<string, string>()
  for (const record of records) {
    const hint = record.data['recipientHint']
    if (typeof hint === 'string' && hint.trim() !== '') hints.set(record.id, hint.trim())
  }
  return hints
}

// ---------------------------------------------------------------------------- what a review is about

// THE RULE FOR WHAT A PAGE IS ABOUT LIVES IN this-page.ts, so the comment box's Start review and this column's start
// ask one function (wave 13r round 15). `theOneInside` is exported from here as well, for the tests that read it here.
export { theOneInside } from './this-page.ts'

// ---------------------------------------------------------------------------- the pane

/**
 * THE FRAME'S TOP BAR, found by the name the frame gives it (frameDeclaration('header') in App.tsx)
 * rather than by its class. It is drawn below 1024 wide and held at the window's top over the page.
 */
const THE_FRAME_TOP_BAR = `[${TARGET_ATTRIBUTE}="${targetAttributeValue({ kind: 'uiSurface', surfaceId: 'header' })}"]`

/**
 * THE READER'S OWN WAYS OF MOVING THE WINDOW. A move they make ends the column's own answer to a
 * pressed count at once, so the answer never pulls the window back against them.
 */
const MOVED_BY_THE_READER = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

/**
 * WHERE THE PANE FITS IN THE WINDOW, written on the pane as four lengths that PANE_CSS reads:
 * - --px-pane-stick, the foot of the frame's top bar in the window, or 0 where no bar is drawn.
 *   The pane is held there as the page scrolls, not at the window's top, because the bar is drawn
 *   over anything under it (problem gs69YsWqZih6: at 990 wide the pane's first 54px were under it).
 *   The checklists window's press is fixed at the window's top right too, over the pane's head, so
 *   the pane is held below whichever of the two ends lower (merge entry 0io6sE9wBY0j: the press
 *   took the press meant for the pane's fold button).
 * - --px-pane-past-bar, how much lower than the frame's bar that foot is: the checklists press where
 *   it ends lower, and 0 otherwise. The window keeps the bar's own height clear at its top (App.tsx),
 *   so this is all the band asks for when a pressed count takes the window to it.
 * - --px-pane-top, where the pane's top is in the window: the higher of that bar's foot and the top
 *   of the row the pane sits in, which is where the pane starts before the page is scrolled.
 * - --px-pane-foot, the foot of that row's content in the window. The row keeps room at its foot
 *   for the corner chat button, and a held box never leaves its row, so at the page's end a pane
 *   as tall as the window was pushed 80px above it (problem gs69YsWqZih6).
 * The pane's height then stops at the window's foot or at the row's, whichever is higher, so it is
 * never pushed up and its last line stays above the corner button (problem ouJEpnWO96RD).
 *
 * WHY IT IS MEASURED AND NOT DECLARED IN CSS: CSS cannot ask where a box starts or where another
 * box ends, and these places move as the page scrolls. The pane's top is worked out from its row,
 * not read from the pane itself, because a pane that was pushed up for one frame would otherwise
 * report the pushed place.
 *
 * It reads once before the pane is first painted. After that it reads again, at most once per
 * frame, when the page scrolls (src/web/lib/page-scroll.ts says in which box), when the window
 * changes size and when the page's body changes size, which is what happens when something above
 * the pane grows or shrinks.
 */
function useWhereThePaneFits(pane: RefObject<HTMLElement | null>, open: boolean): void {
  useLayoutEffect(() => {
    const element = pane.current
    if (!open || element === null) return
    const row = element.parentElement
    if (row === null) throw new Error('The review pane is drawn with no row around it, so where it fits cannot be read.')
    const read = () => {
      const bar = document.querySelector(THE_FRAME_TOP_BAR)
      const press = document.querySelector(`.${CHECKLISTS_PRESS}`)
      const barFoot = Math.max(0, bar === null ? 0 : bar.getBoundingClientRect().bottom)
      const stick = Math.max(barFoot, press === null ? 0 : press.getBoundingClientRect().bottom)
      const box = row.getBoundingClientRect()
      const style = getComputedStyle(row)
      const rowTop = box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)
      const rowFoot = box.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom)
      element.style.setProperty('--px-pane-stick', `${String(stick)}px`)
      element.style.setProperty('--px-pane-past-bar', `${String(stick - barFoot)}px`)
      element.style.setProperty('--px-pane-top', `${String(Math.max(stick, rowTop))}px`)
      element.style.setProperty('--px-pane-foot', `${String(rowFoot)}px`)
    }
    let frame = 0
    const readNextFrame = () => {
      if (frame !== 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        read()
      })
    }
    read()
    const stopHearingTheScroll = whenThePageScrolls(readNextFrame)
    window.addEventListener('resize', readNextFrame)
    const body = new ResizeObserver(readNextFrame)
    body.observe(document.body)
    return () => {
      stopHearingTheScroll()
      window.removeEventListener('resize', readNextFrame)
      body.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [pane, open])
}

/**
 * THE REVIEW COLUMN: the reviews of this project, and whichever one is open.
 *
 * It draws nothing at all until somebody opens it, so no page pays for it.
 */
const PaneWidthContext = createContext<{
  folded: boolean
  toggleWidth: () => void
  /** On a phone, whether the review's list is open above its bar. Shape B; see `YourReview`. */
  sheet: boolean
  setSheet: (open: boolean) => void
} | null>(null)

function PaneWidthButton() {
  const width = useContext(PaneWidthContext)
  // The body can be drawn on its own. Only the surrounding pane has a width to change.
  if (width === null) return null
  const label = t(width.folded ? 'review.pane.unfold' : 'review.pane.fold')
  return (
    <button type="button" className="px-btn px-pane-fold-button" data-size="sm" data-variant="ghost"
      onClick={width.toggleWidth} aria-expanded={!width.folded} aria-label={label} title={label}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={width.folded ? 'M14.5 6l-6 6 6 6' : 'M9.5 6l6 6-6 6'} />
      </svg>
    </button>
  )
}

export function ReviewPane() {
  const review = useReview()
  const projects = useProjects()
  const pane = useRef<HTMLElement>(null)
  const [widthChoice] = useState(() => {
    const faults: StoreFault[] = []
    const value = readChoice('mole-office.review.width', ['expanded', 'collapsed'] as const, 'expanded', faults)
    return { value, fault: faults[0] }
  })
  const [folded, setFolded] = useState(widthChoice.value === 'collapsed')
  const [widthFault, setWidthFault] = useState<string | null>(widthChoice.fault?.message ?? null)
  const [sheet, setSheet] = useState(false)
  const changes = useReviewChanges()
  const looks = useLooks()
  const collectingList = useTheCollectingList()
  const collecting = collectingList?.reviews[0] ?? null
  const collectingHolds = collectingList?.collectingHolds
  const countedReview = review.showing ?? collecting?.id ?? null
  const [counted] = useProjectAsync(async () => {
    if (!review.open) return null
    if (review.commentsOn !== null) {
      const [comments, marks] = await Promise.all([readTheComments(), readTheMarks()])
      return notesWaiting(comments.comments, marks.goneOut).notes.filter(note => isDrawnOn(review.commentsOn!, note.context.target)).length
    }
    if (countedReview === null) return (await readTheComments()).comments.length
    if (review.showing !== null && review.showingProjectId !== currentWorkspace()) return null
    const held = collectingHolds?.[countedReview]
    if (held !== undefined) return held
    const detail = await readTheReview(countedReview)
    return detail.members.length + detail.saved.length
  }, [review.open, review.commentsOn, review.showingProjectId, countedReview, changes, looks, collectingHolds])
  const total = counted.status === 'ready' ? counted.value : null
  function toggleWidth(): void {
    const next = !folded
    setFolded(next)
    const saved = writeStored('mole-office.review.width', next ? 'collapsed' : 'expanded')
    setWidthFault(saved.ok ? null : t('review.pane.widthNotSaved'))
  }
  useWhereThePaneFits(pane, review.open)
  // A PRESSED COUNT IS ANSWERED WHERE THE WINDOW SHOWS IT. Below 36rem the column is a band above the
  // page, so a count pressed far down a long page opened it out of sight, and the press seemed to do
  // nothing (round 28's report). Beside the page the column is held in the window, and nothing moves.
  // On a phone this move replaces the mark layer's move to the comment's place, because the place and
  // the band cannot both be on the screen. The column's own rows lead back to the place (wave 13y
  // round 29).
  //
  // ONE FRAME WAS NOT ENOUGH (wave 13y round 42). The same press also sends the marks to the comment's
  // place, and with the window at the page's top that move begins with the column already in the
  // window: the single answer a frame later saw nothing to do, returned, and the mark layer's move
  // then carried the band's heading under the top bar. So where the column is a band, the press is
  // answered on each frame until the window has come home to the column and stayed three frames,
  // bounded at one second; and the reader's own move of the window stops it at once, so it never
  // pulls the window back against them.
  const presses = useCountPresses()
  const answered = useRef(presses)
  useEffect(() => {
    if (presses === answered.current) return
    answered.current = presses
    const element = pane.current
    if (element === null) return
    /** Whether the column is where the window shows it: no higher than the bar's foot and on the screen. */
    const inTheWindow = () => {
      const top = element.getBoundingClientRect().top
      // A pixel of slack: the bar's foot and the held column's top are the same measurement, rounded by layout.
      return top >= parseFloat(element.style.getPropertyValue('--px-pane-stick')) - 1 && top < window.innerHeight
    }
    /** Take the window to the column, and answer whether it had to move. */
    const takeTheWindowToIt = () => {
      if (inTheWindow()) return false
      element.scrollIntoView({ block: 'start', behavior: behaviorForJump() })
      return true
    }
    if (getComputedStyle(element).position === 'sticky') {
      const frame = requestAnimationFrame(() => {
        takeTheWindowToIt()
      })
      return () => cancelAnimationFrame(frame)
    }
    let frame = 0
    let stopped = false
    let away = false
    let asked = false
    let home = 0
    const until = performance.now() + 1000
    const stop = () => {
      stopped = true
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
      for (const movedByTheReader of MOVED_BY_THE_READER) window.removeEventListener(movedByTheReader, stop, true)
    }
    const watch = () => {
      if (stopped) return
      if (inTheWindow()) {
        asked = false
        if (away) home += 1
      } else {
        away = true
        home = 0
        if (!asked) {
          asked = true
          element.scrollIntoView({ block: 'start', behavior: behaviorForJump() })
        }
      }
      if ((away && home >= 3) || performance.now() >= until) stop()
      else frame = requestAnimationFrame(watch)
    }
    for (const movedByTheReader of MOVED_BY_THE_READER) window.addEventListener(movedByTheReader, stop, true)
    frame = requestAnimationFrame(watch)
    return stop
  }, [presses])
  if (!review.open) return null
  return (
    <>
      <style href="mole-office-agent" precedence="default">
        {AGENT_CSS}
      </style>
      <style href="mole-office-review-pane" precedence="default">
        {PANE_CSS}
      </style>
      <PaneWidthContext.Provider value={{ folded, toggleWidth, sheet, setSheet }}>
      <aside className="px-pane" data-folded={folded ? '1' : '0'} data-sheet={sheet ? '1' : '0'} ref={pane} aria-label={t('review.pane.yourReviews')}>
        {folded ? (
          <div className="px-pane-width-control">
            <PaneWidthButton />
            <span className="px-pane-folded-count" aria-label={t('review.pane.count.comments', { n: total ?? '…' })}
              title={t('review.pane.count.comments', { n: total ?? '…' })}>{total ?? '…'}</span>
          </div>
        ) : null}
        {widthFault === null ? null : <p role="status">{widthFault}</p>}
        <div className="px-pane-expanded" hidden={folded}>
        {/* THREE THINGS THIS COLUMN CAN DRAW, and the third is new on 6 September 2026 (D23). It
            used to draw two: the list of reviews, and one review. Pressing the comment count on a
            card opened the list of REVIEWS, and a comment is not a review — so they pressed a "1" on
            a card of one of their pipelines and got "Your reviews" with nothing in it. Pressing a count
            draws what the count counted. */}
        {review.commentsOn !== null ? (
          <CommentsOnOneThing target={review.commentsOn} />
        ) : review.showing === null ? (
          <ReviewList />
        ) : review.showingProjectId === null ? (
          <ReviewProjectNotRecorded />
        ) : review.showingProjectId !== currentWorkspace() ? (
          projects === null ? (
            <Loading what={t('review.pane.loading.yourReviews')} rows={2} />
          ) : (
            <ReviewInAnotherProject
              reviewId={review.showing}
              projectId={review.showingProjectId}
              project={nameOfProject(projects, review.showingProjectId)}
              collecting={review.on && review.reviewId === review.showing}
            />
          )
        ) : (
          <OneReview reviewId={review.showing} />
        )}
        </div>
      </aside>
      </PaneWidthContext.Provider>
    </>
  )
}

/** The saved review has no project id, so this screen makes no request for it. */
function ReviewProjectNotRecorded() {
  return (
    <div className="px-pane-body">
      <div className="px-pane-head">
        <PaneWidthButton />
        <span className="px-pane-title">{t('review.pane.yourReviews')}</span>
      </div>
      <p className="px-pane-note">{t('review.pane.projectNotRecorded')}</p>
      <div className="px-pane-do">
        <Btn variant="ghost" onClick={leaveReview}>{t('review.pane.closePane')}</Btn>
      </div>
    </div>
  )
}

/** A review is read only after the reader has moved to the project saved beside its id. */
function ReviewInAnotherProject({
  reviewId,
  projectId,
  project,
  collecting,
}: {
  reviewId: string
  projectId: string
  project: string
  collecting: boolean
}) {
  return (
    <div className="px-pane-body">
      <div className="px-pane-head">
        <PaneWidthButton />
        <span className="px-pane-title">{t('review.pane.yourReviews')}</span>
      </div>
      <p className="px-pane-note">{t('review.pane.projectIsElsewhere', { project })}</p>
      <div className="px-pane-do">
        <Btn onClick={() => {
          setWorkspace(projectId)
          openReview(reviewId, collecting, projectId)
        }}>
          {t('review.pane.openInProject', { project })}
        </Btn>
        <Btn variant="ghost" onClick={leaveReview}>{t('review.pane.closePane')}</Btn>
      </div>
    </div>
  )
}

/**
 * THE COMMENTS SOMEBODY HAS LEFT ON ONE THING, which is what pressing that thing's count opens.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion D23. After a press on the detail tick on a card of a pipeline,
 * a circle with a "1" appeared; pressing it opened the column
 * on "Your reviews" with nothing in it, and the comment itself could not be seen.
 *
 * TWO THINGS WERE TRUE AT ONCE AND BOTH ARE ANSWERED HERE.
 *
 *   1. The press had nowhere else to go. `CommentCircles` called `openReviewList()` for any circle
 *      with no comment to jump to, and `ReviewList` reads GET /api/reviews — a list of reviews. A
 *      comment cannot appear in it under any circumstances, so the press could only ever draw an
 *      empty pane. That project has no review at all, so that is what they saw.
 *   2. Their "1" was an instruction they had begun writing and had not sent. Those are kept in this
 *      browser under `mole-office.talk.drafts` and never reach the server, so nothing on the server
 *      could have drawn it. Read read-only against their database on 6 September: that project holds no
 *      comment, no open conversation and no review.
 *
 * SO THIS DRAWS BOTH, AND SAYS WHICH IS WHICH. A comment that is on the server, whether it has gone
 * to somebody or not, and an instruction still only in this browser. A press on a comment takes the
 * reader to the words it quoted, the same way the review pane's own rows do.
 *
 * IT READS THE SAME TWO ROUTES THE CIRCLE'S NUMBER IS ADDED UP FROM — GET /api/messages/comments and
 * GET /api/agent/marks — so the count and this list cannot disagree about what is there.
 */
/**
 * IS THIS COMMENT ONE OF THE COMMENTS THE PRESSED CIRCLE COUNTED?
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT JUST `targetKey(...) === target` — PROBLEM `KP-wOkWanqxC`
 * ---------------------------------------------------------------------------------------
 *
 * A drawing draws the whole record on one card, so a comment on a PART of that record has no
 * element of its own on the page. `elementDrawing` in lib/drawnhere.ts answers with the card, and
 * `circlesToDraw` in MarkLayer.tsx therefore gives the circle the CARD's key — which is right,
 * because the circle has to be drawn somewhere a reader can see it, and the count on it counts the
 * part's comment.
 *
 * The press then asks this column for the comments on the card's key, and the part's comment is
 * stored under the part's key. Matching on the key alone showed a reader every comment on the
 * record except the one they had just pressed the count of.
 *
 * SO IT ASKS THE SAME QUESTION THE CIRCLE ASKED, out of the same function. This is not a second
 * copy of the rule: `elementDrawing` is the one place that says which element on this page draws a
 * given target, and both the circle and this reader call it.
 */
function isDrawnOn(target: string, of: Target): boolean {
  if (targetKey(of) === target) return true
  if (typeof document === 'undefined') return false
  // ONLY WHERE THE THING HAS NO ELEMENT OF ITS OWN, which is the same condition `whereEachIsDrawn`
  // applies: a part that IS on the page keeps its own circle and its own column.
  if (document.querySelector(`[${TARGET_ATTRIBUTE}="${CSS.escape(targetKey(of))}"]`) !== null) return false
  return elementDrawing(of)?.getAttribute(TARGET_ATTRIBUTE) === target
}

function CommentsOnOneThing({ target }: { target: string }) {
  const changes = useReviewChanges()
  const [read] = useProjectAsync(async () => {
    const [comments, marks] = await Promise.all([readTheComments(), readTheMarks()])
    return { ...notesWaiting(comments.comments, marks.goneOut), recipientNames: comments.recipientNames }
  }, [changes, target])
  const drafts = keptDrafts().filter((one) => one.key === target)
  const kept = drafts.reduce((sum, one) => sum + one.kept, 0)
  const here = read.status === 'ready' ? read.value.notes.filter((note) => isDrawnOn(target, note.context.target)) : []

  return (
    <>
      <div className="px-pane-head">
        <PaneWidthButton />
        <span className="px-pane-title">{t('review.pane.commentsHere')}</span>
        <Btn size="sm" variant="ghost" onClick={openReviewList}>
          {t('review.pane.yourReviews')}
        </Btn>
        <Btn size="sm" variant="ghost" onClick={leaveReview}>
          {t('review.pane.close')}
        </Btn>
      </div>

      <div className="px-pane-list">
        {read.status === 'loading' ? <Loading what={t('review.pane.loading.commentsHere')} rows={2} /> : null}
        {/* NO LABEL OF ITS OWN, so this adds no sentence to the interface. `ErrorNote` draws the
            server's own message, which is the only thing here that knows what went wrong. */}
        {read.status === 'error' ? <ErrorNote message={read.message} fault={theFaultANoteDraws(read.fault)} /> : null}

        {here.map((note) => (
          <div className="px-rev-item" key={note.id}>
            <button
              type="button"
              className="px-rev-go"
              onClick={() => {
                showMeThat({ key: target, context: note.context, annotationId: note.id })
              }}
            >
              <span className="px-rev-words">{note.body}</span>
              <span className="px-rev-meta">
                <CommentRecipient name={read.status === 'ready' ? read.value.recipientNames?.[note.id] : undefined} />
                {/* BOTH ANSWERS ARE SAID. A comment that has gone used to be dropped from every
                    surface at the moment its result started to matter; neither word is left to the
                    absence of the other. */}
                <span className="px-rev-where">{note.sent ? t('review.pane.note.sent') : t('review.pane.note.waiting')}</span>
              </span>
            </button>
            <WhatASavedCommentCanDo note={note} />
          </div>
        ))}

        {kept === 0 ? null : (
          <div className="px-rev-item" data-in="0">
            {/* A ROW, NOT A SENTENCE. `design/UX-CONTRACT.md` 8.10: a fix that amounts to adding a
                sentence is a failed fix. This row is a count and two short phrases, in the same
                shape as the comment rows above it. The whole sentence is on the circle's own
                accessible name, which `markSaid` in MarkLayer.tsx writes, and that is an exempt
                channel because it is read out rather than drawn. */}
            <span className="px-rev-go" data-go="0">
              <span className="px-rev-words">
                {t('review.pane.drafts', { n: kept })}
              </span>
              <span className="px-rev-meta">
                {/* WHERE IT IS, because this is the thing they pressed and could not find. It is in
                    this browser and nowhere else, so nothing on the server holds it. */}
                <span className="px-rev-where">{t('review.pane.drafts.where')}</span>
              </span>
            </span>
          </div>
        )}

        {read.status === 'ready' && here.length === 0 && kept === 0 ? (
          // MOLE OFFICE LOOKED AND THERE ARE NONE. Said as an absence rather than as an empty pane,
          // which is the thing this whole component exists to stop.
          <Absence tier="told-apart" looked word={t('review.pane.none.here')} />
        ) : null}
      </div>
    </>
  )
}

/**
 * EVERY REVIEW OF THIS PROJECT, AND THE PRESS THAT STARTS ONE.
 *
 * WHY THIS EXISTS. A review used to be reachable only through the id in this browser's own storage,
 * and closing the column dropped it. Nothing in the browser called `GET /api/reviews` and no page
 * drew a review, so a finished review — the collection Phase 4 exists to build — was on the server
 * and on no screen, for good. That is design/UX-CONTRACT.md's *the value works in one view and
 * disappears from the other*, on the value this phase is about.
 */
function ReviewList() {
  const changes = useReviewChanges()
  // READ AGAIN AT EACH LOOK as well as each change, as the collecting list is, so a review started elsewhere is listed
  // by the next move inside the app (wave 13x round 23).
  const looks = useLooks()
  const inspect = useInspect()
  const [list] = useProjectAsync(() => readOnceForThisLook('reviews', () => api.reviews()), [changes, looks])
  const [starting, setStarting] = useState(false)
  const [failed, setFailed] = useState<Failure | null>(null)

  /**
   * WHAT IS COLLECTING, WHICH THE BAND ABOVE EVERY PAGE USED TO SAY.
   *
   * The state word, the subject and the count are all on the list's own reply: `collectingHolds` counts what each
   * collecting review would send, and `named` names the records the reviews are of. Both used to be further reads —
   * one review read for the count, and one read per record for the names, which on an office of their size was
   * thirty-three reads and most of a second and a half on every open (wave 13r round 15).
   */
  const one = list.status === 'ready' ? (list.value.reviews.find((r) => r.state === 'collecting') ?? null) : null
  const count = one === null || list.status !== 'ready' ? null : (list.value.collectingHolds[one.id] ?? null)
  const names = namesFrom(list.status === 'ready' ? list.value.named : undefined)

  /**
   * START COLLECTING HERE — or come back to the review already collecting here. Mole Office decides
   * which of the two happened, and `started` in its reply says so.
   */
  const start = () => {
    setStarting(true)
    setFailed(null)
    // HOW WIDE IT IS IS SAID RATHER THAN ARRIVED AT.
    //
    // This press starts a review about whatever the page is about, and on most routes the outermost
    // marked thing is a part of Mole Office's own screen or the page itself — neither of which names a
    // place in the project. Until 26 August 2026 the server QUIETLY WIDENED both to the whole
    // project, so this press was the widest review there is on most pages and said nothing about it.
    // The arms that widened now refuse, so a review of one place cannot be started from here at all,
    // and this asks for the thing it was always getting: the sentence in the reply says the project,
    // and it says the entry decided nothing.
    startThisPagesReview().then(
      (begun) => {
        setStarting(false)
        openReview(begun.review.id, true)
      },
      (err: unknown) => {
        setStarting(false)
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }

  return (
    <>
      <div className="px-pane-head">
        <PaneWidthButton />
        <span className="px-pane-title">{t('review.pane.yourReviews')}</span>
        {/* THE COUNT IS DRAWN ONLY ONCE IT HAS COME BACK. A zero drawn while the reply is in flight
            is a number nobody measured, and it is the number this line exists to carry.

            IT SAYS WHAT IT COUNTED. In the band this replaced it was once the number alone, so the
            front page had a bare 1 on it with nothing saying what the 1 was (problem `muxtJ4V4HfUj`).
            It is one word longer and it
            is the difference between a count and a number. */}
        {one === null ? null : (
          <span className="px-pane-count" title={subjectOf(one.entry, names).whole}>
            {count === null
              ? t('review.pane.listCount', { state: REVIEW_STATE_WORDS[one.state], subject: subjectOf(one.entry, names).words })
              : t('review.pane.listCountWithComments', {
                  state: REVIEW_STATE_WORDS[one.state],
                  subject: subjectOf(one.entry, names).words,
                  comments: t('review.pane.count.comments', { n: count }),
                })}
          </span>
        )}
        <Btn size="sm" variant="ghost" onClick={leaveReview}>
          {t('review.pane.close')}
        </Btn>
      </div>

      {/* WHAT A REVIEW IS, ON THE PRESS THAT STARTS ONE. It stood under the button as a permanent
          line: a definition, read once and skipped every visit after that, on the first thing a
          person sees when they open the column. It is the same sentence the Reviews switch already
          carries, in the same channel. */}
      <div className="px-pane-do">
        <Btn
          pending={starting}
          pendingFailed={failed !== null}
          onClick={start}
        >
          {t('review.pane.start')}
        </Btn>
      </div>

      {failed === null ? null : <ErrorNote message={failed.message} fault={theFaultANoteDraws(failed.fault)} label={t('review.pane.start.failed')} />}

      <div className="px-pane-list">
        {list.status === 'loading' ? <Loading what={t('review.pane.loading.yourReviews')} rows={2} /> : null}
        {list.status === 'error' ? (
          <ErrorNote message={list.message} fault={theFaultANoteDraws(list.fault)} label={t('review.pane.list.failed')} />
        ) : null}
        {list.status === 'ready' && list.value.reviews.length === 0 ? (
          // MOLE OFFICE LOOKED AND THERE ARE NONE, which is an answer. The press above is the way out of
          // it, so this is the quiet tier and not the loud one.
          <Absence tier="told-apart" looked word={t('review.pane.none.yet')} />
        ) : null}
        {list.status === 'ready'
          ? list.value.reviews.map((one) => (
              <div className="px-rev-item" key={one.id}>
                <button
                  type="button"
                  className="px-rev-go"
                  onClick={() => openReview(one.id, one.state === 'collecting')}
                  title={subjectOf(one.entry, names).whole}
                >
                  <span className="px-rev-words">{t('review.pane.listRow', { state: REVIEW_STATE_WORDS[one.state], subject: subjectOf(one.entry, names).words })}</span>
                  <span className="px-rev-meta">
                    {/* THE EXACT CLOCK TIME, BECAUSE IT IS WHAT TELLS TWO ROWS APART. See
                        `startedWords`: two reviews started the same afternoon both read "just now"
                        and everything else on the row was identical. */}
                    <span className="px-rev-where">{startedWords(one.started)}</span>
                    {one.collectedAt === null ? null : (
                      <span className="px-rev-where">{finishedWords(one.collectedAt)}</span>
                    )}
                    {inspect ? <span className="px-rev-where">{one.id}</span> : null}
                  </span>
                </button>
              </div>
            ))
          : null}
      </div>

      {/* HOW MANY THERE ARE WHEN THE REPLY COULD NOT CARRY THEM ALL. A list that quietly showed the
          newest 200 of 300 would be the fifth engineering rule broken on a screen. The number is
          the server's `leftOut`; counting it here from two others would be a second answer. */}
      {list.status === 'ready' && list.value.leftOut > 0 ? (
        <p className="px-pane-note">
          {t('review.pane.shownOf', { shown: list.value.reviews.length, total: list.value.total })}
        </p>
      ) : null}
      {inspect && list.status === 'ready' ? <p className="px-pane-note">{list.value.says}</p> : null}
    </>
  )
}

/**
 * ONE REVIEW: what counts as inside it, what is in it, and what happens to it next.
 *
 * THE BROWSER'S "COMMENTS ARE COLLECTING" FLAG IS WRITTEN FROM WHAT MOLE OFFICE SAID HERE, and nowhere
 * else. It used to be a flag the switch set, so it stayed true after collecting finished and the
 * composer went on offering to add a comment to a review that could no longer take one.
 */
function OneReview({ reviewId }: { reviewId: string }) {
  const changes = useReviewChanges()
  const showing = useShowing()
  /**
   * READ AGAIN WHEN THE LIST OF COLLECTING REVIEWS SAYS SOMETHING ELSE ABOUT IT (wave 13x round 24,
   * item 1b). This read is made once for each change, and a change is a write made in this tab, so a
   * comment added somewhere else, or the review ended there, was never drawn here: the column went on offering Send for
   * what it had read first. The list is read again at each look (the frame), and it says how many comments each
   * collecting review would send. When that is not what is drawn, the review is read again, once for each thing the
   * list says. A look that finds the list saying what is drawn reads nothing.
   */
  const held = useTheHeldList()
  const [askedFor, setAskedFor] = useState<{ reviewId: string; changes: number; says: string } | null>(null)
  const again = askedFor !== null && askedFor.reviewId === reviewId && askedFor.changes === changes ? askedFor.says : null
  const [detail] = useProjectAsync(async () => ({ value: await readTheReview(reviewId, again), changes }), [reviewId, changes, again])
  // ONLY A LIST AND A REVIEW READ AT THIS SAME CHANGE ARE COMPARED. Each keeps its last answer while it is read again,
  // so just after a write here one of the two is from before it, and they differ with nothing changed elsewhere.
  // Measured in round 24: without this, a press of Send that found a new comment read the review twice, not once.
  const listSays = held !== null && held.changes === changes ? whatTheListSaysOf(held.list, reviewId) : null
  const drawnSays = detail.status === 'ready' && detail.value.changes === changes ? whatTheListWouldSay(detail.value.value) : null
  useEffect(() => {
    if (listSays === null || drawnSays === null || listSays === drawnSays) return
    setAskedFor((now) => (now !== null && now.reviewId === reviewId && now.changes === changes && now.says === listSays ? now : { reviewId, changes, says: listSays }))
  }, [reviewId, changes, listSays, drawnSays])
  /**
   * THE SENTENCE A PRESS OF SEND LEFT WHEN IT SENT NOTHING (item 1c), drawn here and not in YourReview, because the
   * review drawn again may have ended, and then YourReview is not drawn at all. It goes when another review is opened.
   */
  const changed = changedAtSend.has(reviewId)
  useEffect(() => () => {
    changedAtSend.delete(reviewId)
    removedHere.delete(reviewId)
    trayAfterSend.delete(reviewId)
  }, [reviewId])
  /**
   * WHICH ROW IS OPEN, AND WHICH IS BEING EDITED, KEPT ABOVE THE RELOAD.
   *
   * READING THE REVIEW AGAIN TAKES THE LIST DOWN AND BUILDS IT AGAIN — the block below draws
   * `Loading` while it is in flight — so state held inside the list dies with every write. These
   * two were held there, and the first write that happened while a row was open was choosing who a
   * comment is for: the row a person was working in closed under them. They are held here, where
   * nothing takes them down, and a row that has gone from the review simply matches nothing.
   */
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  /**
   * THE NOTES SOMEBODY WROTE, READ FOR TWO THINGS THE REVIEW ITSELF DOES NOT CARRY: who each one
   * seemed to be for, and how many are waiting outside this review.
   *
   * A review collects what was written after it started, inside its scope, by the person who
   * started it. A comment written before that is not in it and is not lost, and a pane that said
   * nothing about them would be telling somebody their comment had gone.
   */
  const [notes] = useProjectAsync(async () => (await readTheComments()).comments, [changes])

  const state = detail.status === 'ready' ? detail.value.value.review.state : null
  useEffect(() => {
    if (state !== null) openReview(reviewId, state === 'collecting')
  }, [reviewId, state])

  if (detail.status === 'loading') {
    return (
      <div className="px-pane-body">
        <Loading what={t('review.pane.loading.review')} rows={2} />
      </div>
    )
  }
  if (detail.status === 'error') {
    return (
      <div className="px-pane-body">
        <ErrorNote message={detail.message} fault={theFaultANoteDraws(detail.fault)} label={t('review.pane.review.failed')} />
        <Btn size="sm" onClick={openReviewList}>
          {t('review.pane.yourReviews')}
        </Btn>
      </div>
    )
  }
  return (
    <>
      {changed ? (
        <p className="px-pane-note" role="status" data-part="changed-at-send">
          {t('review.b.changedNothingSent')}
        </p>
      ) : null}
      <PaneBody
        detail={detail.value.value}
        notes={notes.status === 'ready' ? notes.value : null}
        showing={showing}
        open={open}
        onOpen={setOpen}
        editing={editing}
        onEditing={setEditing}
      />
    </>
  )
}

/**
 * WHAT THE LIST OF COLLECTING REVIEWS SAYS OF ONE REVIEW: its count and comment fingerprint, "not collecting" when the list
 * is whole and it is not in it, and null when the list says nothing either way (not read, or some reviews left out).
 */
function whatTheListSaysOf(list: ReviewListReply | null, reviewId: string): string | null {
  if (list === null) return null
  const holds = list.collectingHolds[reviewId]
  if (holds !== undefined) {
    const stamp = list.collectingStamps?.[reviewId]
    return stamp === undefined ? String(holds) : `${String(holds)}:${stamp}`
  }
  return list.leftOut === 0 ? 'not collecting' : null
}

/**
 * WHAT THAT LIST WOULD SAY OF THIS REVIEW AS DRAWN. The count is the server's own (`collectingHolds` in listReviews,
 * src/server/lib/reviews.ts): the comments found in it, and those saved, that are still waiting to go.
 */
function whatTheListWouldSay(detail: ReviewDetail): string {
  if (detail.review.state !== 'collecting') return 'not collecting'
  const n = commentsIn(detail).filter((one) => one.state === 'queued').length
  return detail.collectingStamp === undefined ? String(n) : `${String(n)}:${detail.collectingStamp}`
}

// ---------------------------------------------------------------------------- shape B: your review, in a column

/**
 * WHO A COLLECTING REVIEW GOES TO, IN ONE LINE, from the server's `goesTo` (src/server/lib/reviews.ts).
 *
 * The owner's second detail: a review goes by default to the agent that wrote the page. When
 * nothing records who wrote it, the line says so and asks for a choice; nothing is guessed. An agent whose record cannot
 * be read is said as that, not drawn with an id.
 */
function goesToWords(goesTo: ReviewDetail['goesTo']): string {
  if (goesTo.recipient === null) return t('review.b.nobodyRecorded')
  // THE WRITER ONLY BECAUSE NOBODY CHOSE, said as that before Send (problem ZuhGWivnX7ug), so a person who meant
  // somebody else sees the fallback rather than a name that reads as their choice.
  if (goesTo.ground === 'wrote-the-page') {
    return goesTo.name === null ? t('review.b.goingToTheWriterUnnamed') : t('review.b.goingToTheWriter', { name: goesTo.name })
  }
  if (goesTo.name === null) return t('review.b.goingToUnnamed')
  return t('review.b.goingTo', { name: goesTo.name })
}

/**
 * SEND A COLLECTING REVIEW IN ONE PRESS: finish collecting, then send.
 *
 * Shape B's Send, in the column, on the phone's bar and in the question asked on leaving a page. Finishing collecting
 * is the boundary the old pane drew as its own press; it is still made, and made first, so what is sent is a written
 * down set. What Mole Office answered is kept in `lastSend`, which the send block of the finished review draws, in the
 * page's language. A send that failed after collecting finished says both halves. A SEND THAT GOES DRAWS ITS SENT ROW
 * FROM THE SEND'S OWN ANSWER, and each caller reads the review again after it. A REFUSED SEND REACHES NO CALLER'S
 * READ, and collecting has finished on the server by then, so the review would go on being drawn as collecting. So the
 * catch reads the review again, once for both callers: the column's Send and the question asked on leaving a page.
 * Answers whether every comment asked for has gone, and the review the send answered with, so the row can show the
 * sent state before the read again.
 */
async function finishAndSend(reviewId: string, only: string[], whenCollected?: (detail: ReviewDetail) => void): Promise<{ everyOneGone: boolean; outcome: SendOutcome }> {
  const frozen = await api.finishCollecting(reviewId)
  whenCollected?.(frozen)
  try {
    // Membership may grow after the fresh read and before finish reaches the server. Only the
    // comments drawn at the press may go; the rest remain queued in the frozen review.
    const { outcome, leftForPerson } = await sendLeavingPersonComments(reviewId, only)
    lastSend.set(reviewId, sayTheSend(outcome.told))
    if (outcome.told.reviewSent) sentHere.add(reviewId)
    return { everyOneGone: !leftForPerson && everyOneHasGone(outcome, only), outcome }
  } catch (err: unknown) {
    lastSend.set(reviewId, `${t('review.b.collectedNotSent')} ${errorMessage(err)}`)
    reviewChanged()
    throw err
  }
}

/**
 * LEAVE OUT OF THIS SEND WHAT PRESSING IT CAN NEVER SEND: the comments the plan says are a person's to answer, and the
 * comments taken out of what the review waits for. `leftForPerson` is true when a comment of the person's was left out
 * and nobody took it out. The review goes on waiting for that one, by the rule on the server (`whatTheReviewWaitsFor`),
 * until it is taken out with "I answer this myself". Naming the comments sent does not keep the review open by itself.
 */
async function sendLeavingPersonComments(reviewId: string, only: readonly string[]): Promise<{ outcome: SendOutcome; leftForPerson: boolean }> {
  const plan = await api.whereTheReviewWouldGo(reviewId)
  const leftOut = new Set(plan.comments.filter((one) => one.yoursToAnswer || one.takenOut !== undefined).map((one) => one.id))
  const selected = only.filter((id) => !leftOut.has(id))
  const leftForPerson = plan.comments.some((one) => one.yoursToAnswer && one.takenOut === undefined && only.includes(one.id))
  if (selected.length === 0) throw new Error(t('review.delivery.noneSent'))
  return { outcome: await api.sendReview(reviewId, [], selected), leftForPerson }
}

/**
 * SEND ONLY WHAT IS DRAWN (wave 13x round 24, item 1c). The column's Send read the review once
 * for each change made in this tab, so it could send comments added somewhere else that it never drew: measured on
 * 839cbaf24, a column drawing "Send 1" sent a review holding 2. The review is read fresh at the press, not from the read
 * shared for this change. When what Send would carry is not what the column drew, nothing is sent: the fresh read is
 * drawn instead, and OneReview says why. Answers what the send came to and the review the send answered with, so the
 * sent row can be drawn before the read again. LeaveQuestion's Send does not come through here.
 */
async function sendWhatIsDrawn(drawn: ReviewDetail): Promise<{ sent: 'not sent' | 'sent' | 'every one gone'; outcome: SendOutcome | null }> {
  const reviewId = drawn.review.id
  const now = await api.oneReview(reviewId)
  if (whatSendCarries(now) !== whatSendCarries(drawn)) {
    changedAtSend.add(reviewId)
    reviewChangedTo(`review:${reviewId}`, now)
    return { sent: 'not sent', outcome: null }
  }
  const finished = await finishAndSend(reviewId, commentsIn(drawn).map((one) => one.id))
  return { sent: finished.everyOneGone ? 'every one gone' : 'sent', outcome: finished.outcome }
}

/**
 * WHETHER EVERY COMMENT A SEND ASKED FOR HAS GONE, read from what the send answered.
 *
 * A send can be answered 200 with part of it not done: a comment held back for an agent that cannot take it, or a
 * comment that is the person's own to answer. So a press of Send lights as done only when this is true.
 *
 * A COMMENT TAKEN OUT OF WHAT THE REVIEW WAITS FOR IS NOT ASKED ABOUT. It never goes, and the review does not wait for
 * it, so it neither lights the press nor keeps it dark.
 *
 * Each other comment asked for that the review still lists must answer the question every row asks,
 * `noteOfMember(...).sent`, so the light and the rows cannot disagree. A held comment stays queued, and so fails it. A
 * saved comment that went is no longer listed, as its row is not; nor is any saved comment once the review is marked
 * sent. A comment that is the person's to answer is read from `yoursToAnswer` as well, so an answer that names one keeps
 * the press dark whatever its row says. That list holds the comments the send asked for and the ones taken out. `held`
 * is not read: it is the whole conversation's, and can name a comment this press did not send.
 */
function everyOneHasGone(outcome: SendOutcome, asked: readonly string[]): boolean {
  const out = new Set((outcome.review.takenOut ?? []).map((one) => one.id))
  const waiting = asked.filter((id) => !out.has(id))
  if (waiting.length === 0 || outcome.yoursToAnswer.some((one) => waiting.includes(one.id))) return false
  return commentsIn(outcome.review).every((one) => !waiting.includes(one.id) || noteOfMember(one).sent)
}

/** What a press of Send would carry, as one string to compare: the review's state, who it goes to, and each comment. */
function whatSendCarries(detail: ReviewDetail): string {
  return JSON.stringify([detail.review.state, detail.goesTo, commentsIn(detail).map((one) => [one.id, one.body, one.recipientName ?? null])])
}

/** How many comments a review's send would carry: its members that are there, and the saved comments it lists. */
function commentsIn(detail: ReviewDetail): FoundMember[] {
  return [...detail.members.filter((one): one is FoundMember => one.found), ...detail.saved]
}

/**
 * Why Send cannot be pressed for this review, or null when it can. Nobody chosen and nobody recorded as the page's
 * writer leaves every comment without its own choice with nowhere to go, and the send would refuse.
 */
function whyNotSendYet(detail: ReviewDetail, n: number): string | null {
  if (n === 0) return t('review.pane.send.nothing')
  if (detail.goesTo.recipient === null && detail.goesTo.elsewhere.length < n) return t('review.b.chooseFirst')
  return null
}

/**
 * YOUR REVIEW, IN SHAPE B: the title, who it goes to with Change, the comments, Send and Fold.
 *
 * Shape B was chosen (wave 13r round 15), and then the tray (wave 13y round 146, item 73a): at every width it
 * is one row at the foot of the window, reading "Your review · 3 comments · going to Kiln Keeper", with Change, Show
 * comments and Send review. Show comments opens the list upward, and each comment there has Edit and Remove. The page
 * keeps its whole width. A desk once drew a column beside the page instead, and the page moved aside for it.
 *
 * The title, the chip and Send with Fold under the list are still drawn, for a pane drawn without the tray around it;
 * PANE_CSS hides the ones the tray's row already offers.
 *
 * Everything the old pane said about the review is still there, under "More about this review" below it.
 *
 * MORE IS DRAWN INSIDE THIS SECTION, as `more`, and not after it. On a phone the bar sticks to the top of the open list,
 * and a sticky thing cannot leave its parent's box: with More after the section, scrolling into More took the section
 * away and the bar with it, so its first line and the tops of its presses were cut off (round 16's pictures at 390).
 */
function YourReview({
  detail,
  names,
  more,
  editing,
  onEditing,
  onSent,
}: {
  detail: ReviewDetail
  names: ThingNames
  more: ReactNode
  /** Which comment is being edited, held in OneReview above the reload; the tray's rows say theirs with `tray:`. */
  editing: string | null
  onEditing?: (id: string | null) => void
  /** The review the send answered with, so the row can show the sent state in the paint that ends its wait. */
  onSent: (detail: ReviewDetail) => void
}) {
  const pane = useContext(PaneWidthContext)
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  /** The comment whose Remove or Undo is waiting for Mole Office's answer. */
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<(Failure & { label: string }) | null>(null)
  // WHAT THE LAST SEND CAME TO, set in the same render that ends its wait: a proven success is named only when every
  // comment was shown to have gone, and a refusal is named so its light can fade. The sent row takes the press's place
  // in that same render, so a proven success draws no frame: the row is the answer a person sees. A send answered with
  // part of it not done ends plainly, as one that sent nothing does. Kept apart from `failed`, which a refused Change
  // sets too.
  const [sendCameTo, setSendCameTo] = useState<'every one gone' | 'refused' | null>(null)
  // WHAT MOLE OFFICE SAID TO SEND, drawn where a send that left something behind says it. A send that sent every
  // comment draws the sent row from its own answer instead, and the read again follows that row.
  const [said, setSaid] = useState<string | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  const comments = commentsIn(detail)
  const changes = useReviewChanges()
  const [deliveryPlan] = useProjectAsync(() => api.whereTheReviewWouldGo(detail.review.id), [detail.review.id, changes])
  const n = comments.length
  const goingTo = goesToWords(detail.goesTo)
  const whyNot = whyNotSendYet(detail, n)
  // THE SEND WAITS FOR AN OPEN EDITOR, as the whole review's Send does: what it would send is changing under it.
  const whyNotNow = whyNot ?? (editing === null ? null : t('review.pane.saveFirst'))
  const reviewId = detail.review.id

  useTheTrayRoom(bar)

  const send = () => {
    if (busy || whyNotNow !== null) return
    setBusy(true)
    setFailed(null)
    setSendCameTo(null)
    changedAtSend.delete(reviewId)
    sendWhatIsDrawn(detail).then(
      ({ sent, outcome }) => {
        setBusy(false)
        setSendCameTo(sent === 'every one gone' ? 'every one gone' : null)
        if (sent !== 'not sent' && outcome !== null) {
          // THE TRAY STAYS AT THE FOOT, SAYING WHAT WAS SENT, until Close (`SentTray`). Its list is shut, so the one row
          // with the sentence is what the person sees. THE SENT ROW IS DRAWN FROM THE SEND'S OWN ANSWER in this same
          // render, so it does not wait for the read again; the read follows. Its arrival replaces the press, so the
          // proven-success frame ends with the press and is never drawn over the sent row's own presses.
          if (sent === 'every one gone') trayAfterSend.add(reviewId)
          else trayAfterSend.delete(reviewId)
          setSaid(lastSend.get(reviewId) ?? null)
          openTheList(sent !== 'every one gone')
          if (sent === 'every one gone' && outcome.told.reviewSent) onSent(outcome.review)
          reviewChanged()
        } else {
          openTheList(true)
          reviewChanged()
        }
      },
      (err: unknown) => {
        setBusy(false)
        setSendCameTo('refused')
        setFailed({ label: t('review.b.notSent'), message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }

  const choose = (choice: AgentContact) => {
    if (busy || rowBusy !== null) return
    setFailed(null)
    api.reviewRecipient(reviewId, { kind: 'agent', agentId: choice.agentRecordId }).then(
      (now) => reviewChangedTo(`review:${reviewId}`, now),
      (err: unknown) => setFailed({ label: t('review.b.notChanged'), message: errorMessage(err), fault: faultOf(err) }),
    )
  }

  /**
   * REMOVE AT ONCE, WITH NO QUESTION, AND UNDO PUTS IT BACK (wave 13y round 146, item 73a). The comment is deleted the
   * way every record is, which keeps it stored and marked deleted, so Undo restores the same comment. Its row stays at
   * its place and says Removed until the review is closed (`removedHere`).
   */
  const remove = (comment: FoundMember, place: number) => {
    if (busy || rowBusy !== null) return
    setRowBusy(comment.id)
    setFailed(null)
    api.deleteRecord(comment.id).then(
      () => {
        setRowBusy(null)
        removedHere.set(reviewId, [...(removedHere.get(reviewId) ?? []), { comment, place }])
        if (editing === `tray:${comment.id}`) onEditing?.(null)
        reviewChanged()
      },
      (err: unknown) => {
        setRowBusy(null)
        setFailed({ label: t('review.pane.note.notMade'), message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }
  const putBack = (comment: FoundMember) => {
    if (busy || rowBusy !== null) return
    setRowBusy(comment.id)
    setFailed(null)
    api.restoreRecord(comment.id).then(
      () => {
        setRowBusy(null)
        removedHere.set(reviewId, (removedHere.get(reviewId) ?? []).filter((gone) => gone.comment.id !== comment.id))
        reviewChanged()
      },
      (err: unknown) => {
        setRowBusy(null)
        setFailed({ label: t('review.pane.note.notMade'), message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }
  // A REMOVED COMMENT KEEPS ITS ROW, AT THE PLACE IT HAD. The review read again no longer holds it.
  const removed = removedHere.get(reviewId) ?? []
  const rows: { comment: FoundMember; removed: boolean }[] = comments
    .filter((one) => !removed.some((gone) => gone.comment.id === one.id))
    .map((comment) => ({ comment, removed: false }))
  for (const gone of [...removed].sort((a, b) => a.place - b.place)) rows.splice(gone.place, 0, { comment: gone.comment, removed: true })

  const openTheList = (open: boolean) => pane?.setSheet(open)
  const sendButton = (words: string, where: 'bar' | 'sheet') => (
    <Btn pending={busy && where === 'bar'} pendingFailed={where === 'bar' && sendCameTo === 'refused'} pendingSucceeded={where === 'bar' && sendCameTo === 'every one gone'} onClick={send} {...(whyNotNow === null ? {} : { disabled: true, reason: whyNotNow })}>
      {words}
    </Btn>
  )

  return (
    <section className="px-b" aria-labelledby="px-b-title" data-part="your-review">
      {/* THE TRAY'S ROW, at the foot of the window at every width (PANE_CSS). */}
      <div className="px-b-bar" ref={bar} data-part="your-review-bar">
        <p className="px-b-bar-says">
          {[t('review.b.yourReview'), t('review.b.comments', { n }), goingTo].join(' · ')}
        </p>
        <span className="px-b-bar-do">
          <Btn size="sm" variant="ghost" onClick={() => {
            openTheList(true)
            setChoosing(true)
          }}>
            {t('review.b.change')}
          </Btn>
          <Btn size="sm" variant="secondary" expanded={pane?.sheet === true} onClick={() => openTheList(pane?.sheet !== true)}>
            {pane?.sheet === true ? t('review.tray.hide') : t('review.tray.show')}
          </Btn>
          {sendButton(t('review.tray.send'), 'bar')}
        </span>
      </div>

      <div className="px-b-head">
        <h2 className="px-b-title" id="px-b-title">{t('review.b.yourReview')}</h2>
        <span className="px-pane-count" title={subjectOf(detail.review.entry, names).whole}>
          {subjectOf(detail.review.entry, names).words}
        </span>
      </div>

      <p className="px-b-chip" data-ground={detail.goesTo.ground} data-part="goes-to">
        <span className="px-b-chip-words">{goingTo}</span>
        <Btn size="sm" variant="ghost" aria-expanded={choosing} onClick={() => setChoosing((v) => !v)}
          {...(busy ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') } : {})}>
          {t('review.b.change')}
        </Btn>
      </p>
      {choosing ? (
        <>
          {/* WHAT CHANGE REACHES, said before the person picks: the comments in the review, not one sent on its own. */}
          <ContactsForAReview
            asked={{ about: detail.review.entry, review: { id: reviewId } }}
            onChoose={choose}
            onClose={() => setChoosing(false)}
          />
        </>
      ) : null}
      {detail.goesTo.elsewhere.length === 0 ? null : (
        <p className="px-pane-note">{t('review.b.elsewhere', { n: detail.goesTo.elsewhere.length })}</p>
      )}

      {deliveryPlan.status === 'error' ? <ErrorNote message={deliveryPlan.message} fault={theFaultANoteDraws(deliveryPlan.fault)} label={t('review.pane.send.cannotWorkOut')} /> : null}
      {rows.length === 0 ? (
        <Absence tier="told-apart" looked />
      ) : (
        <ol className="px-b-list">
          {rows.map(({ comment: one, removed: isRemoved }, place) => {
            if (isRemoved) {
              return (
                <li className="px-b-comment" key={one.id} data-comment={one.id} data-removed="1">
                  <p className="px-b-removed">
                    <span>{t('review.tray.removed')}</span>
                    <Btn size="sm" variant="ghost" pending={rowBusy === one.id} onClick={() => putBack(one)}
                      {...(busy ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') } : {})}>
                      {t('talk.undo')}
                    </Btn>
                  </p>
                </li>
              )
            }
            const named = spanNamedBy(one.context)
            const quote = named === null ? null : shortenToWords(named.quote, 60)
            const body = shortenToWords(one.body, 160)
            // THE SAME RULE AS THE WHOLE REVIEW'S ROWS: words read from a conversation, and a comment that has gone, stay.
            const mayChange = one.source !== 'conversation' && !noteOfMember(one).sent
            const isEditing = mayChange && editing === `tray:${one.id}`
            return (
              <li className="px-b-comment" key={one.id} data-comment={one.id}>
                <p className="px-b-on" title={quote?.whole}>
                  {quote === null
                    ? t('review.b.onThing', { thing: subjectOf(one.context, names).words })
                    : t('review.b.on', { quote: quote.words })}
                </p>
                {isEditing ? (
                  <EditInTheTray comment={one} onDone={() => onEditing?.(null)} />
                ) : (
                  <p className="px-b-body" title={body.shortened ? body.whole : undefined}>
                    {body.words}
                    {body.shortened ? <span className="px-rev-cut">{t('review.pane.shortened')}</span> : null}
                  </p>
                )}
                {deliveryPlan.status === 'ready' && deliveryPlan.value.comments.some((line) => line.id === one.id && !line.willGo && one.state === 'queued') ? null : <CommentRecipient name={one.recipientName} />}
                <DeliveryRecovery detail={detail} member={one} plan={deliveryPlan.status === 'ready' ? deliveryPlan.value.comments : undefined} />
                {mayChange ? (
                  <span className="px-b-acts">
                    <Btn size="sm" variant="ghost" onClick={() => onEditing?.(isEditing ? null : `tray:${one.id}`)}
                      {...(busy ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') } : {})}>
                      {isEditing ? t('review.pane.note.stopEditing') : t('review.pane.note.edit')}
                    </Btn>
                    <Btn size="sm" variant="danger" pending={rowBusy === one.id} onClick={() => remove(one, place)}
                      {...(busy ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') } : {})}>
                      {t('review.pane.note.remove')}
                    </Btn>
                  </span>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}

      {said === null ? null : <p className="px-send-said">{said}</p>}
      {failed === null ? null : <ErrorNote message={failed.message} fault={theFaultANoteDraws(failed.fault)} label={failed.label} />}

      <div className="px-b-do">
        {sendButton(t('review.b.send', { n }), 'sheet')}
        <Btn size="sm" variant="ghost" onClick={() => {
          if (pane?.sheet === true) pane.setSheet(false)
          else pane?.toggleWidth()
        }}>
          {t('review.b.fold')}
        </Btn>
      </div>
      {more}
    </section>
  )
}

/**
 * HOW TALL THE TRAY'S ROW IS, written on the page's row, so the foot of the page is never under the tray (PANE_CSS adds
 * the tray's own padding and edge). It is measured because the row's words wrap differently in each language and at
 * each width.
 *
 * HOW TALL THE WHOLE TRAY IS, written on the document, so a talk box drawn as a sheet from the bottom stands on it rather
 * than over it (wave 13r round 16: the "Written down" note covered the bar at 390). The talk box is drawn in the overlay
 * layer, outside the page's row, so the row's measure does not reach it. Where the row is not drawn, as in a pane drawn
 * without the tray around it, the measure is taken off.
 *
 * ONE MEASURE FOR BOTH TRAYS: the review collecting and the review just sent (`SentTray`).
 */
function useTheTrayRoom(bar: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const element = bar.current
    const row = element?.closest<HTMLElement>('.shell-main') ?? null
    const pane = element?.closest<HTMLElement>('.px-pane') ?? null
    if (element === null || row === null) return
    const root = document.documentElement
    const read = () => {
      row.style.setProperty('--px-b-bar-room', `${String(element.getBoundingClientRect().height)}px`)
      if (pane === null || getComputedStyle(element).display === 'none') root.style.removeProperty('--px-b-pane-room')
      else root.style.setProperty('--px-b-pane-room', `${String(pane.getBoundingClientRect().height)}px`)
    }
    read()
    const watch = new ResizeObserver(read)
    watch.observe(element)
    if (pane !== null) watch.observe(pane)
    return () => {
      watch.disconnect()
      row.style.removeProperty('--px-b-bar-room')
      root.style.removeProperty('--px-b-pane-room')
    }
  }, [bar])
}

/**
 * ONE COMMENT'S WORDS, EDITED IN THE TRAY'S LIST (wave 13y round 146, item 73a): the box and Save. It is the same write
 * as the whole review's Edit (`NoteWaiting`), with the same send key.
 */
function EditInTheTray({ comment, onDone }: { comment: FoundMember; onDone: () => void }) {
  const [body, setBody] = useState(comment.body)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<Failure | null>(null)
  const sendKey = useSendKey()
  const save = () => {
    // ONLY WHEN THE SAVE PRESS WOULD ACT: not while it is pending and not on an empty box.
    if (busy || body.trim() === '') return
    setBusy(true)
    setFailed(null)
    api.rewriteAnnotation(comment.id, body).then(
      () => {
        setBusy(false)
        onDone()
        reviewChanged()
      },
      (err: unknown) => {
        setBusy(false)
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }
  return (
    <div className="px-b-edit">
      <TextArea
        value={body}
        onChange={setBody}
        rows={2}
        growTo={10}
        aria-label={t('review.pane.note.saysLabel')}
        onKeyDown={aSendKeyPress<HTMLTextAreaElement>(sendKey, save)}
      />
      <Btn size="sm" pending={busy} onClick={save} {...(body.trim() === '' ? { disabled: true, reason: t('review.pane.note.mustSay') } : {})}>
        {t('review.pane.note.save')}
      </Btn>
      {failed === null ? null : <ErrorNote message={failed.message} fault={theFaultANoteDraws(failed.fault)} label={t('review.pane.note.notMade')} />}
    </div>
  )
}

/**
 * THE TRAY AFTER SEND REVIEW (wave 13y round 146, item 73a). It stays at the foot of the window as one row saying what
 * Mole Office answered, with Show comments and Close. Show comments opens the whole sent review above the row, with the
 * same sentence where it says what was sent. Close puts the tray away.
 */
function SentTray(props: PaneBodyProps) {
  const pane = useContext(PaneWidthContext)
  const bar = useRef<HTMLDivElement>(null)
  useTheTrayRoom(bar)
  const reviewId = props.detail.review.id
  const open = pane?.sheet === true
  return (
    <section className="px-b" data-part="your-review-sent">
      <div className="px-b-bar" ref={bar} data-part="your-review-bar">
        <p className="px-b-bar-says">{lastSend.get(reviewId) ?? t('review.pane.yourReview')}</p>
        <span className="px-b-bar-do">
          <Btn size="sm" variant="secondary" expanded={open} onClick={() => pane?.setSheet(!open)}>
            {open ? t('review.tray.hide') : t('review.tray.show')}
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => {
            trayAfterSend.delete(reviewId)
            pane?.setSheet(false)
            leaveReview()
          }}>
            {t('review.tray.close')}
          </Btn>
        </span>
      </div>
      {/* NO WIDTH TO CHANGE IN THE TRAY, so the whole review's fold arrow is not drawn. */}
      {open ? (
        <PaneWidthContext.Provider value={null}>
          <PaneWhole {...props} />
        </PaneWidthContext.Provider>
      ) : null}
    </section>
  )
}

/** Where a page address puts the reader: the route in its hash, without the question part. */
function routeIn(url: string): string {
  const hash = new URL(url).hash.replace(/^#/, '')
  return hash.split('?')[0] ?? ''
}

/** The pages whose collecting review holds comments not sent, in one read of the collecting reviews. */
function pagesHolding(list: ReviewListReply | null): { reviewId: string; n: number; path: string }[] {
  return (list?.reviews ?? []).flatMap((one) => {
    const n = list?.collectingHolds[one.id] ?? 0
    if (n === 0) return []
    const where = pageHolding(one.entry)
    return 'path' in where ? [{ reviewId: one.id, n, path: where.path }] : []
  })
}

/**
 * THE QUESTION ASKED ON LEAVING A PAGE WHOSE REVIEW HOLDS COMMENTS NOT SENT: Send, Keep or Discard.
 *
 * The owner's fourth detail. Leaving is the app's own navigation, which is a change of the
 * address's hash; the comments not sent are those of a review collecting on this page, as the list of collecting
 * reviews counts them (`collectingHolds`). The question names how many, and who Send would send them to.
 *
 * Keep goes on, and the review goes on collecting. Discard deletes the comments and says that a deleted comment is
 * still stored and can be restored, because that is what Mole Office does with a deleted record. Send finishes
 * collecting and sends, as the column's Send does. Stay puts nothing anywhere.
 *
 * A reload or a closed tab is asked by the browser's own question, which can only say leave or stay. It is set only
 * while some collecting review holds comments, AS THE LIST WAS LAST READ: the browser asks its question at once, and it
 * cannot wait for a read. So a review started elsewhere since the last look is not asked about on a reload.
 */
function LeaveQuestion() {
  const held = useTheHeldList()
  const list = held?.list ?? null
  const changes = useReviewChanges()
  const [asking, setAsking] = useState<{ reviewId: string; n: number; goTo: string; fromList: ReviewListReply } | null>(null)
  // THE FRESH READ FAILED. Nobody can say whether the page being left holds comments not sent, so the person is kept on
  // it and asked, and is not moved on as if it held none (wave 13x round 23).
  const [unread, setUnread] = useState<{ goTo: string; failure: Failure } | null>(null)
  const [busy, setBusy] = useState<'send' | 'discard' | null>(null)
  const [failed, setFailed] = useState<Failure | null>(null)
  // WHICH PRESS WAS REFUSED, so only that one fades: `failed` is set by the review's read as well as by either press.
  const [refused, setRefused] = useState<'send' | 'discard' | null>(null)
  const [shown, setShown] = useState<ReviewDetail | null>(null)
  const [changed, setChanged] = useState(false)
  const pass = useRef(false)
  const first = useRef<HTMLDivElement>(null)
  const key = pagesHolding(list).map((one) => `${one.reviewId}:${String(one.n)}:${one.path}`).join('|')
  // THE PAGE STILL DRAWN while a fresh read is out, and which read is the newest.
  const waiting = useRef<{ token: number; drawn: string } | null>(null)
  const tokens = useRef(0)

  // THE LISTENER IS ADDED BEFORE THE ROUTER ADDS ITS OWN in `useRoute`. Both listen on the window, and the browser
  // calls listeners on the window in the order they were added, capture or not. Added after the router, it ran after
  // it: the page behind the question was already the next page while the address was put back, so the question asked
  // about a page that was no longer drawn. A layout effect runs before every passive effect of the same commit, and
  // this component mounts with the shell that calls `useRoute`, so it comes first. It is added on mount and not when
  // the file is loaded, so a page or a test that only imports this file adds nothing to the window (merge entry
  // wF-4WYbAftoF bounced on five test files whose stand-in window has no addEventListener).
  //
  // IT DECIDES FROM A READ MADE AT THE MOMENT OF LEAVING, never from the list as last read (wave 13x round 23). That
  // list could be from before a review was started in another tab, by an agent or by a call to the server, and
  // deciding from it moved the person on with their comments held and nothing asked. So the
  // router does not hear a change of page until the read answers: the page drawn is still the one being left, while
  // the address already names the next. If the page being left holds comments, the address is put back and the
  // question asked. If it holds none, the change is handed on to the router and every other listener as the event the
  // browser fired. If the read failed, the address is put back and the question says the read failed.
  //
  // WHAT THIS COSTS: every move to another page waits for one `GET /api/reviews?state=collecting`. The ring, the dot
  // and the column draw that same read at this look, so it is made once. A change within one page, such as the part of
  // the address after `?`, is not held, and only looks again.
  useLayoutEffect(() => {
    const onHash = (event: HashChangeEvent) => {
      if (pass.current) {
        pass.current = false
        return
      }
      // THE PAGE BEING LEFT IS THE ONE STILL DRAWN, also when the address changed again while a read was out.
      const drawn = waiting.current?.drawn ?? event.oldURL
      const from = routeIn(drawn)
      if (from === routeIn(event.newURL)) {
        if (waiting.current === null) {
          lookAgain()
          return
        }
        // BACK TO THE PAGE STILL DRAWN BEFORE THE READ ANSWERED. Nothing is being left, so the read is not waited for.
        // The change is still handed on. The mark that says the page is drawn (src/web/lib/ready.ts) listens on the
        // window from before this, so it heard both changes and took itself off. The router drawing the page again is
        // what puts it back. Stopped here, the mark stayed off and a test waiting for it waited out its time
        // (tests/seven-surfaces.test.ts, wave 13x round 23).
        waiting.current = null
        return
      }
      event.stopImmediatePropagation()
      tokens.current += 1
      const token = tokens.current
      waiting.current = { token, drawn }
      const goTo = new URL(event.newURL).hash
      const stillHere = stillOnThisPage()
      lookAgain()
      readTheCollectingList().then(
        (fresh) => {
          if (waiting.current?.token !== token || !stillHere()) return
          waiting.current = null
          const one = pagesHolding(fresh).find((each) => each.path === from)
          if (one === undefined) {
            pass.current = true
            try {
              window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: drawn, newURL: window.location.href }))
            } finally {
              pass.current = false
            }
            return
          }
          // THE PAGE DOES NOT CHANGE UNTIL THE PERSON ANSWERS.
          history.replaceState(history.state, '', drawn)
          setFailed(null)
          setShown(null)
          setChanged(false)
          setAsking({ reviewId: one.reviewId, n: one.n, goTo, fromList: fresh })
        },
        (err: unknown) => {
          if (waiting.current?.token !== token || !stillHere()) return
          waiting.current = null
          history.replaceState(history.state, '', drawn)
          setUnread({ goTo, failure: { message: errorMessage(err), fault: faultOf(err) } })
        },
      )
    }
    window.addEventListener('hashchange', onHash, true)
    return () => window.removeEventListener('hashchange', onHash, true)
  }, [])

  useEffect(() => {
    if (key === '') return
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [key])

  const [detail] = useProjectAsync(
    // The list was read on leaving. An older detail cached for this change must not supply its recipient.
    async () => (asking === null ? null : api.oneReview(asking.reviewId)),
    [asking?.reviewId],
  )
  const ready = asking === null ? null : shown?.review.id === asking.reviewId ? shown
    : detail.status === 'ready' && detail.value?.review.id === asking.reviewId ? detail.value : null

  useEffect(() => {
    // The opening list predates the fresh initial detail. Only a later list can ask for another
    // read, shared with the column by its changed count or fingerprint. A quiet look reads none.
    if (asking === null || ready === null || busy !== null || held?.changes !== changes || held.list === asking.fromList) return
    const says = whatTheListSaysOf(held.list, asking.reviewId)
    if (says === null || says === whatTheListWouldSay(ready)) return
    let active = true
    readTheReview(asking.reviewId, says).then(
      now => { if (active) setShown(now) },
      (err: unknown) => { if (active) setFailed({ message: errorMessage(err), fault: faultOf(err) }) },
    )
    return () => { active = false }
    // Publishing this answer must not compare it with the same older list again. The next list,
    // initial-detail answer or change is what asks; shown itself is deliberately not a dependency.
  }, [asking, busy, changes, detail, held])

  useEffect(() => {
    if (asking === null && unread === null) return
    first.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
    const stay = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setAsking(null)
      setUnread(null)
    }
    document.addEventListener('keydown', stay)
    return () => document.removeEventListener('keydown', stay)
  }, [asking, unread])

  const goTo = (to: string) => {
    setAsking(null)
    setUnread(null)
    if (to !== window.location.hash) {
      pass.current = true
      window.location.hash = to
    }
  }

  // A READ THAT FAILED IS SAID, with the two answers that do not need it: stay, which keeps whatever is held, or leave
  // anyway. Staying is the primary press because it is the one that cannot lose a comment.
  if (unread !== null) {
    return (
      <Overlay>
        <style href="mole-office-leave-question" precedence="default">
          {LEAVE_CSS}
        </style>
        <div className="px-leave-scrim">
          <div className="px-leave" role="dialog" aria-modal="true" aria-labelledby="px-leave-title" ref={first} data-part="leave-question">
            <h2 className="px-leave-title" id="px-leave-title">{t('review.leave.unread.title')}</h2>
            <ErrorNote message={unread.failure.message} fault={theFaultANoteDraws(unread.failure.fault)} label={t('review.pane.list.failed')} />
            <div className="px-leave-do">
              <Btn variant="primary" onClick={() => setUnread(null)}>
                {t('review.leave.stay')}
              </Btn>
              <Btn variant="secondary" onClick={() => goTo(unread.goTo)}>
                {t('review.leave.anyway')}
              </Btn>
            </div>
          </div>
        </div>
      </Overlay>
    )
  }
  if (asking === null) return null
  const go = () => goTo(asking.goTo)
  const doThen = (which: 'send' | 'discard', act: () => Promise<unknown>) => {
    if (busy !== null) return
    const stillHere = stillOnThisPage()
    setBusy(which)
    setFailed(null)
    setRefused(null)
    act().then(
      (sent) => {
        setBusy(null)
        reviewChanged()
        if (sent !== false && stillHere()) go()
      },
      (err: unknown) => {
        setBusy(null)
        setRefused(which)
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }
  const n = ready === null ? asking.n : commentsIn(ready).length
  const collecting = ready === null || ready.review.state === 'collecting'
  // WHILE SEND OR DISCARD WAITS THE OTHER IS OFF, and says so: only the waiting press draws a light.
  const offWhile = (press: 'send' | 'discard') =>
    busy !== null && busy !== press ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') } : {}
  const send = async (): Promise<boolean> => {
    if (ready === null) return false
    const now = await api.oneReview(asking.reviewId)
    if (whatSendCarries(now) !== whatSendCarries(ready)) {
      setShown(now)
      setChanged(true)
      reviewChangedTo(`review:${asking.reviewId}`, now)
      return false
    }
    await finishAndSend(asking.reviewId, commentsIn(ready).map((one) => one.id), setShown)
    return true
  }
  const whyNot = ready === null ? t('review.leave.reading') : whyNotSendYet(ready, commentsIn(ready).length)

  // IN THE OVERLAY HOST, after anything already open there, so the comment box they were writing in is not drawn over it.
  return (
    <Overlay>
      <style href="mole-office-leave-question" precedence="default">
        {LEAVE_CSS}
      </style>
      <div className="px-leave-scrim">
        <div className="px-leave" role="dialog" aria-modal="true" aria-labelledby="px-leave-title" ref={first} data-part="leave-question">
          <h2 className="px-leave-title" id="px-leave-title">{collecting ? t('review.leave.title') : REVIEW_STATE_WORDS[ready!.review.state]}</h2>
          {changed ? <p className="px-leave-says" role="status">{t('review.b.changedNothingSent')}</p> : null}
          {collecting && ready !== null ? <p className="px-leave-says">{t('review.pane.state.collecting')}</p> : null}
          <p className="px-leave-says">{t('review.leave.count', { n })}</p>
          <p className="px-leave-says">
            {ready === null
              ? t('review.leave.reading')
              : !collecting
                ? ready.goesTo.recipient === null
                  ? t('review.leave.noRecipient')
                  : ready.goesTo.name === null
                    ? t('review.leave.unnamedRecipient')
                    : t('review.leave.recipient', { name: ready.goesTo.name })
              : ready.goesTo.recipient === null
                ? t('review.leave.noRecipient')
                : t('review.leave.recipient', { name: ready.goesTo.name ?? t('review.b.goingToUnnamed') })}
          </p>
          {detail.status === 'error' ? <ErrorNote message={detail.message} fault={theFaultANoteDraws(detail.fault)} label={t('review.pane.review.failed')} /> : null}
          {failed === null ? null : <ErrorNote message={failed.message} fault={theFaultANoteDraws(failed.fault)} label={t('review.leave.failed')} />}
          <div className="px-leave-do">
            {collecting ? <Btn pending={busy === 'send'} pendingFailed={refused === 'send'} onClick={() => doThen('send', send)}
              {...(whyNot === null ? offWhile('send') : { disabled: true, reason: whyNot })}>
              {t('review.b.send', { n })}
            </Btn> : null}
            <Btn variant="secondary" onClick={go}>
              {t('review.leave.keep')}
            </Btn>
            {collecting ? <Btn variant="secondary" pending={busy === 'discard'} pendingFailed={refused === 'discard'} onClick={() => doThen('discard', () => api.discardReview(asking.reviewId))} {...offWhile('discard')}>
              {t('review.leave.discard')}
            </Btn> : null}
            <Btn variant="ghost" onClick={() => setAsking(null)}>
              {t('review.leave.stay')}
            </Btn>
          </div>
        </div>
      </div>
    </Overlay>
  )
}

// ---------------------------------------------------------------------------- the comments it did not take

/**
 * THE COMMENTS THIS REVIEW DID NOT TAKE, from the route that knows why.
 *
 * IT IS A SEPARATE REQUEST BECAUSE IT IS A SEPARATE READING: every comment in the project and
 * every other review's written-down membership. The review itself is read again on every keystroke
 * that changes one of its rows, and this does not need to be.
 */
async function whatIsNotInIt(reviewId: string): Promise<CommentsNotInReview> {
  return moleOfficeRequest<CommentsNotInReview>(`/api/reviews/${encodeURIComponent(reviewId)}/not-in-it`)
}

/** End a review without sending anything. See POST /api/reviews/:id/abandon. */
async function abandonThisReview(reviewId: string): Promise<ReviewDetail> {
  return moleOfficeRequest<ReviewDetail>(`/api/reviews/${encodeURIComponent(reviewId)}/abandon`, { method: 'POST' })
}

/**
 * ONE ENTRY OF THE REVIEW VOCABULARY, IN THE PAGE'S LANGUAGE, read when it is drawn.
 *
 * The English is the vocabulary's own: `review.vocab.*` in src/shared/words/en.ts reads it from
 * `REVIEW_STATES` in src/shared/states.ts, so the two cannot drift. zh.ts holds the Chinese.
 */
type ReviewVocabularyKey =
  | 'earlier'
  | 'later'
  | 'elsewhere'
  | 'otherAuthor'
  | 'sent'
  | 'inAnotherReview'
  | 'whyNotKnown'
  | 'inThisReview'
  | 'notInIt'
  | 'finishCollecting'
  | 'abandon'
  | 'cancel'
function inTheListsOf(entry: ReviewVocabularyKey): { word: string; detail: string } {
  return {
    get word() {
      return t(`review.vocab.${entry}.word` as WordKey)
    },
    get detail() {
      return t(`review.vocab.${entry}.detail` as WordKey)
    },
  }
}

/**
 * WHY ONE COMMENT IS NOT IN THIS REVIEW, in the one word a row draws.
 *
 * A TOTAL MAP OVER THE SERVER'S CLOSED SET, so a seventh reason cannot reach a screen without a
 * word, and an eighth cannot be invented here. The sentence under each word is the vocabulary's
 * own; the row draws the word and carries the sentence on its title, which is contract 8.10's
 * second exemption.
 */
export const WHY_NOT_IN_IT: Readonly<Record<NotInItReason, { word: string; detail: string }>> = {
  earlier: inTheListsOf('earlier'),
  later: inTheListsOf('later'),
  elsewhere: inTheListsOf('elsewhere'),
  'other-author': inTheListsOf('otherAuthor'),
  sent: inTheListsOf('sent'),
  'in-another-review': inTheListsOf('inAnotherReview'),
  'not-known': inTheListsOf('whyNotKnown'),
}

/**
 * ONE COMMENT THAT IS NOT IN THIS REVIEW, drawn as a row of the same shape as one that is.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A ROW AND NOT A NUMBER
 * ---------------------------------------------------------------------------------------
 *
 * Measured on a real screen: two comments written at 18:14 and
 * 18:16 fell outside a review started at 18:18, and the pane said "2 other comments in this project
 * are waiting and are not in this review. They are still stored." A count, no ids, no way through
 * to either of them. Everything a working row needs was on the server and none of it was on the
 * wire. The row is the answer: the words, where they were written, why the review does not hold
 * them, and a press that goes there.
 *
 * THE PRESS IS THE SAME PRESS. It calls the same function a member row calls, so the two groups
 * cannot come to behave differently: position and a heading carry membership, and behaviour does
 * not.
 *
 * A COMMENT MOLE OFFICE CANNOT READ AS A COMMENT HAS NO PRESS AND SAYS SO. There is nowhere to take
 * anybody, and a press that scrolled somewhere would be a claim about where the words are.
 */
function NotInItRow({
  row,
  inspect,
  names,
  lit,
  onGo,
}: {
  row: CommentNotInReview
  inspect: boolean
  /** The records these rows were written on, named, so where each was written is said in the page's language. */
  names: ThingNames
  /**
   * How the last press on this row went, or null when it was not this row. The same value a member
   * row is handed, for the same reason: the press is the same press, so what it did has to be
   * sayable in both groups or the answer depends on which heading a comment happens to sit under.
   */
  lit: Showing | null
  onGo: (() => void) | null
}) {
  const words = shortenToWords(row.body)
  const why = WHY_NOT_IN_IT[row.reason]
  const inside = (
    <>
      <span className="px-rev-words" title={words.shortened ? words.whole : undefined}>
        {words.words}
        {words.shortened ? <span className="px-rev-cut">{t('review.pane.shortened')}</span> : null}
      </span>
      <span className="px-rev-meta">
        <CommentRecipient name={row.recipientName} />
        {/* WHERE IT WAS WRITTEN, in the same sentence a member row draws, from the same field the
            server worked out for both. */}
        {row.about === null ? (
          <Absence tier="told-apart" looked word={t('review.pane.notReadable')} />
        ) : (
          <span className="px-rev-where">
            {whereItWasWritten(row.about, row.context, names, inspect)}
          </span>
        )}
        <span className="px-rev-why">
          {why.word}
        </span>
        {/* WHEN IT WAS WRITTEN, AS MOLE OFFICE STORED IT. The heading above says how many; this is the
            fact a person compares against the review's own start time, which is two stamps in the
            same form rather than one age and one clock. */}
        <span className="px-rev-where">{row.created}</span>
        {inspect ? <span className="px-rev-where">{`${row.id} · ${row.clause}`}</span> : null}
      </span>
    </>
  )
  if (onGo === null) return <span className="px-rev-go" data-go="0">{inside}</span>
  // WHAT THE PRESS DID, IN THE SAME PLACE A MEMBER ROW SAYS IT. The area is drawn only once
  // somebody has pressed this row: an empty one on every row is a gap in a list that says nothing,
  // which design/UX-CONTRACT.md calls furniture.
  const pressed = lit !== null && lit.state !== 'none'
  return (
    <>
      <button type="button" className="px-rev-go" onClick={onGo}>
        {inside}
      </button>
      {pressed ? (
        <span className="px-rev-acts">
          <HowThePressWent lit={lit} />
        </span>
      ) : null}
    </>
  )
}

/**
 * HOW THE LAST PRESS ON A ROW WENT, in the words §8.2 gives each ending.
 *
 * ---------------------------------------------------------------------------------------
 * ONE COMPONENT FOR BOTH GROUPS, BECAUSE IT IS ONE PRESS
 * ---------------------------------------------------------------------------------------
 *
 * This was written out inside the member row and nowhere else, so a comment that is not in the
 * open review could be pressed and had nowhere to say what the press had done. That is not a rare
 * shape: the owner's own two comments are the only comments in the owner's corpus outside their review, and
 * they are the two the person complained about. Measured on their data on 20 August 2026, before this
 * change: they pressed both from 9,000 px down, the page went to the top of a nineteen-screen
 * record, nothing was lit, nothing was drawn, and the row said nothing at 400 ms and still nothing
 * at 6,000 ms.
 *
 * NULL WHEN THIS ROW WAS NOT THE ONE PRESSED. A row says nothing then, which is different from
 * saying that nothing happened.
 */
function HowThePressWent({ lit }: { lit: Showing | null }) {
  if (lit === null || lit.state === 'none') return null
  if (lit.state === 'notHere') {
    return (
      <span className="px-rev-stale" data-act="1">
        {t('review.pane.notOnThatPage')}
      </span>
    )
  }
  // THE PART IS NOT DRAWN AS ITSELF AT THIS READING LENGTH, AND THE PAGE HAS SAID WHAT IT DID.
  //
  // The words are `howItDrawsHere`'s own, because the function that decided which of the five cases
  // this is is the one that may say what it decided. Writing a sentence here from `drawing` would
  // be a second opinion about one fact. It is drawn in the ordinary colour and not the loud one: a
  // comment whose part is inside something larger is not stale and nothing needs acting on.
  if (lit.state === 'notDrawnAsItself') {
    return (
      <span className="px-rev-stands" data-drawn={lit.drawing} data-marked={lit.marked ? '1' : '0'}>
        {lit.says}
      </span>
    )
  }
  if (lit.state === 'looking') return <span className="px-rev-stands">{t('review.pane.looking')}</span>
  return <WhatWasMarked showing={lit} />
}

/**
 * The pane once Mole Office has answered: the heading, the list, and what happens next.
 *
 * EXPORTED SO A TEST CAN DRAW ONE WITHOUT A SERVER, the way `ReviewRow` and `NoteWaiting` are.
 * What this pane offers is decided here — which presses a collecting review shows and which a
 * frozen one shows — and that decision is the one that was wrong.
 */
type PaneBodyProps = Parameters<typeof PaneWhole>[0]

/**
 * ONE REVIEW, DRAWN. A finished review is drawn whole. A collecting one is drawn in shape B: your review, who it goes
 * to and Send, with the whole pane behind More.
 *
 * WHAT IS BEHIND MORE IS NOT READ UNTIL MORE IS OPEN. The whole pane reads which comments the review did not take and
 * the gist of each thing a comment is about; on an office of their size those reads were most of the time between a
 * press and its answer (wave 13r round 15), for rows nobody had asked to see.
 */
export function PaneBody(props: PaneBodyProps) {
  const { detail } = props
  const [more, setMore] = useState(moreOpenHere)
  /**
   * THE REVIEW THIS PANE WAS TOLD THE SEND ANSWERED WITH, drawn as sent before the read again comes back. It is the
   * send's own answer (`SendOutcome.review`), so the row, its sentence and the list it opens are the review the office
   * said was sent, not the collecting one the pane was drawing. The read again replaces it when it comes.
   */
  const [sentAtOnce, setSentAtOnce] = useState<ReviewDetail | null>(null)
  const shown = sentAtOnce !== null && sentAtOnce.review.id === detail.review.id && detail.review.state === 'collecting' ? sentAtOnce : detail
  const names = useThingNames(
    [...shown.members, ...shown.saved].filter((one): one is FoundMember => one.found).map((one) => one.context),
  )
  if (shown.review.state !== 'collecting') return trayAfterSend.has(shown.review.id) ? <SentTray {...props} detail={shown} /> : <PaneWhole {...props} detail={shown} />
  return (
    <>
      <YourReview
        detail={shown}
        names={names}
        editing={props.editing ?? null}
        {...(props.onEditing === undefined ? {} : { onEditing: props.onEditing })}
        onSent={setSentAtOnce}
        more={
          <details
            className="px-b-more"
            open={more}
            onToggle={(event) => {
              moreOpenHere = event.currentTarget.open
              setMore(event.currentTarget.open)
            }}
          >
            <summary>{t('review.b.more')}</summary>
            {/* ONE FOLD. The whole review drawn here has its own fold arrow in its head, and it stood beside the Fold
                under Send, so the column showed two presses for one act (problem Gi19i9HZ20h7, wave 13r round 20).
                Without the pane's width to change, the arrow is not drawn. */}
            <div className="px-b-more-body">
              {more ? (
                <PaneWidthContext.Provider value={null}>
                  <PaneWhole {...props} detail={shown} />
                </PaneWidthContext.Provider>
              ) : null}
            </div>
          </details>
        }
      />
    </>
  )
}

/**
 * GAPS AN ANSWER CARRIED AS SENTENCES ONLY, WITH NO CODES, drawn as the server wrote them (problem W5ixFnJb9VWc). This
 * server always sends the codes, but an answer made before they existed does not, and a page that drew such an answer
 * with no gaps said nothing was missing when something was. The sentences are the server's English in every mode, and
 * Developer mode says under them that they are the office's own words. The review's gaps and the scope's both use it.
 */
function GapsInTheServersWords({ gaps, part, inspect }: { gaps: readonly string[]; part: string; inspect: boolean }) {
  if (gaps.length === 0) return null
  return (
    <>
      {gaps.map((gap) => (
        <p className="px-pane-note" data-part={part} data-said="server" lang="en" key={gap}>
          {gap}
        </p>
      ))}
      {inspect ? (
        <p className="px-pane-note" data-part="gaps-in-servers-words">
          {t('review.pane.gapsInServersWords')}
        </p>
      ) : null}
    </>
  )
}

/** THE WHOLE PANE, which a finished review draws and More opens on a collecting one. Exported so a test can draw it. */
export function PaneWhole({
  detail,
  notes,
  showing,
  open = null,
  onOpen,
  editing = null,
  onEditing,
}: {
  detail: ReviewDetail
  notes: readonly CommentOnThePage[] | null
  showing: Showing
  /**
   * WHICH ROW IS OPEN AND WHICH IS BEING EDITED, HELD ABOVE THIS COMPONENT.
   *
   * They are props rather than state because this component is taken down and built again every
   * time the review is read — see `OneReview`. Defaulted, so a test may draw a pane without them.
   */
  open?: string | null
  onOpen?: (id: string | null) => void
  editing?: string | null
  onEditing?: (id: string | null) => void
}) {
  const inspect = useInspect()
  /** WHICH END OF COLLECTING IS WAITING. Only that press draws the light, and the other is off. */
  const [busy, setBusy] = useState<'finish' | 'abandon' | null>(null)
  const [refused, setRefused] = useState<Failure | null>(null)
  /**
   * WHAT THE LAST PRESS TOOK THE PERSON TO, WHEN IT WAS NOT THE THING ITSELF.
   *
   * A SECOND STATE AND NOT A SECOND USE OF `refused`, because they are not the same event and are
   * not drawn the same way. A refusal is Mole Office declining to do something; this is Mole Office having
   * done something and saying exactly what it did. Putting "seen on the plan page" through
   * `ErrorNote` would tell a person their press failed at the moment it worked.
   */
  const [went, setWent] = useState<string | null>(null)
  /**
   * WHICH IRREVERSIBLE PRESS IS WAITING FOR ITS SECOND PRESS, or null because none is.
   *
   * It is a state and not a timer. See the footer for the whole argument; the short of it is that
   * a three-second window turns an ordinary double-click into an unconfirmed irreversible act, and
   * a window that lapses undoes the person's intent with nothing said.
   */
  const [confirming, setConfirming] = useState<'finish' | 'abandon' | null>(null)
  /**
   * WHO THE PERSON HAS PICKED, PER COMMENT, IS NOT HELD HERE AND IS NOT HELD ANYWHERE IN THIS
   * BROWSER.
   *
   * It was a `Map` in this component until 19 August 2026, and that map was the whole of the
   * product's memory of who each comment was going to. A reload emptied it, and the pane then said
   * nobody had been chosen for comments a person had spent ten minutes addressing. Every choice is
   * written onto the comment now — `annotation.chosenRecipient` — and both this pane and the send
   * read it from there.
   */
  const collecting = detail.review.state === 'collecting'
  const changes = useReviewChanges()
  const [deliveryPlan] = useProjectAsync(() => api.whereTheReviewWouldGo(detail.review.id), [detail.review.id, changes])
  const subject = subjectOf(detail.review.entry, useThingNames([detail.review.entry]))

  /**
   * THE GIST OF EACH THING A COMMENT IS ABOUT, IN ONE REQUEST FOR THE WHOLE PANE.
   *
   * Asking per row is a request per row, and what goes wrong then is not that it is slow: a list
   * that cannot afford to ask stops asking, and every row draws the same thing. That was measured
   * on this very pane on 18 August 2026 with the staleness of a quote.
   *
   * A LENGTH NOBODY WROTE COMES BACK SAYING SO and is drawn as absent. Nothing here shortens a
   * record to fill the gap — see `gistBeside`.
   */
  const behind = recordsBehind([...detail.members, ...detail.saved])
  const [gists] = useProjectAsync(
    async () => (behind.length === 0 ? [] : (await api.shortFormRows(behind, 'gist')).rows),
    [behind.join(',')],
  )
  /**
   * WHICH COMMENTS OF THIS PROJECT THIS REVIEW DID NOT TAKE, AND WHY, from the server.
   *
   * It is asked for on every read of the review, because the answer changes when a comment is
   * written and when collecting finishes. The reply carries at most twenty rows and says how many
   * it left out; nothing here counts anything a second time.
   */
  const [notIn] = useProjectAsync(async () => whatIsNotInIt(detail.review.id), [detail.review.id, detail.members.length])
  // THE RECORDS EVERY ROW WAS WRITTEN ON, named in one read, as the head line's subject is.
  const rowNames = useThingNames([
    ...[...detail.members, ...detail.saved].filter((one): one is FoundMember => one.found).map((one) => one.context),
    ...(notIn.status === 'ready' ? notIn.value.rows.flatMap((row) => (row.context === null ? [] : [row.context])) : []),
  ])

  /**
   * GO TO WHAT A COMMENT IS ABOUT. One function, called by a row in either group, so membership
   * cannot come to change what a press does.
   */
  const goTo = (context: Context, key: string, annotationId: string) => {
    const where = pageHolding(context)
    if ('cannot' in where) {
      setRefused({ message: where.cannot, fault: null })
      setWent(null)
      return
    }
    setRefused(null)
    stopShowing()
    // AND THE CARD IT WAS WRITTEN ON, IF IT WAS WRITTEN ON A DRAWING, before the address changes.
    rememberTheCardACommentWasOn(context)
    // WHERE IT WAS SEEN IS NAVIGATED TO AND SAID, IN THAT ORDER, AND THE SENTENCE STAYS UP. The
    // person asked to go to a comment about a part of the screen that is on every page; they land
    // where they were standing when they wrote it, and the line under the pane says that is what
    // happened. `showMeThat` is not called for one: there is nothing on the new page holding this
    // comment's key, so lighting "the exact words" would be a promise about a thing that is not
    // there.
    navigate('seenOn' in where ? where.seenOn : where.path)
    setWent('seenOn' in where ? seenOnWords(where.seenOn) : null)
    if ('seenOn' in where) return
    // THE WHOLE STORED CONTEXT, AND THE PLACE IS READ OUT OF IT THERE. The place is what the mark
    // is drawn from — a span alone is null for four of the five places a comment can be made, so a
    // comment on one line and a comment on a whole record used to arrive as the same value. The
    // rest of the context is what lets the page tell "this part is not drawn at this reading
    // length" from "nothing on this page is that thing", which are two different sentences.
    showMeThat({ key, context, annotationId })
  }
  const go = (member: FoundMember) => {
    goTo(member.context, member.key, member.id)
  }

  /**
   * ESCAPE LEAVES A CONFIRM WITHOUT DOING IT. The keyboard's way out of the one press in this pane
   * that cannot be undone. It is bound only while a confirm is waiting, so nothing in this pane
   * listens to the whole document at rest.
   */
  useEffect(() => {
    if (confirming === null) return
    const leave = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirming(null)
    }
    document.addEventListener('keydown', leave)
    return () => {
      document.removeEventListener('keydown', leave)
    }
  }, [confirming])

  const act = (end: 'finish' | 'abandon', what: () => Promise<unknown>) => {
    setBusy(end)
    setRefused(null)
    what().then(
      () => {
        setBusy(null)
        reviewChanged()
      },
      (err: unknown) => {
        setBusy(null)
        setRefused({ message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }

  const whole = (
    <>
      <div className="px-pane-head">
        <PaneWidthButton />
        <span className="px-pane-title">{t('review.pane.yourReview')}</span>
        {/* THE SUBJECT SITS BETWEEN THE STATE WORD AND THE COUNT, where the band above every page
            used to draw it. Without it this head said Collecting and a number and never what the
            review was of. */}
        {/* THE STATE WORD IS THE STORED ONE, as it is in the rows of the review list. Whether the
            review still waits is said once, in the head over Send, from the server's answer to what
            a send would leave waiting. */}
        <span className="px-pane-count" title={subject.whole}>
          {t('review.pane.head', {
            state: REVIEW_STATE_WORDS[detail.review.state],
            subject: subject.words,
            count: countWords(detail.members),
          })}
        </span>
        {/* BACK TO THE LIST, NOT AWAY FOR EVER. The press here used to close the column, which was
            the last place a review could be reached from — so a finished review went from the
            screen and there was nowhere left to look for it. Closing the column is the control in
            the frame, which is where closing things belongs. */}
        <Btn size="sm" variant="ghost" onClick={openReviewList}>
          {t('review.pane.yourReviews')}
        </Btn>
      </div>

      {/* WHAT COUNTS AS INSIDE. It is the answer to "why is my comment not here", and it is folded away because a
          person reading their own comments does not need it at first glance. The scope's own sentence is its code in
          the reader's language, and the server's sentence, ids and all, in Developer mode only (decision z_A0xVMbWOzh,
          wave 13r round 19). An answer without the code is drawn with the server's sentence.

          THE SENTENCE AND THE GAPS UNDER IT ARE SPACED AS THE REST OF THE COLUMN IS. They sat with no space between
          them and read as one paragraph. */}
      <details className="px-pane-scope">
        <summary>{t('review.pane.collects')}</summary>
        <div className="px-pane-scope-body">
          <p className="px-pane-note" data-part="scope-says" data-code={detail.rule.saysForm?.code}>
            {inspect || detail.rule.saysForm === undefined
              ? detail.rule.says
              : t(`review.scopeSays.${detail.rule.saysForm.code}`, detail.rule.saysForm.values)}
          </p>
          {/* WHAT THE SCOPE COULD NOT WORK OUT, each gap's code in the reader's language, and the server's own sentence
              in Developer mode only (decision z_A0xVMbWOzh). An answer without the codes is drawn with the server's
              sentences, not with no gaps (see ReviewScope.gapForms). */}
          {detail.rule.gapForms === undefined
            ? <GapsInTheServersWords gaps={detail.rule.gaps} part="scope-gap" inspect={inspect} />
            : detail.rule.gapForms.map((gap) => (
                <p className="px-pane-note" data-part="scope-gap" data-code={gap.code} key={gap.says}>
                  {inspect ? gap.says : t(`review.scopeGap.${gap.code}`, gap.values)}
                </p>
              ))}
        </div>
      </details>

      {refused === null ? null : <ErrorNote message={refused.message} fault={theFaultANoteDraws(refused.fault)} label={t('review.pane.refused')} />}

      {/* WHERE THE LAST PRESS ACTUALLY TOOK THEM, when it was the page a comment was SEEN on rather
          than a page holding the thing. It is an ordinary note and not a banner: nothing went
          wrong, and the only thing a reader has to be told is which of the two claims this is. */}
      {went === null ? null : <p className="px-pane-note">{went}</p>}

      {/* MEMBERSHIP IS CARRIED BY POSITION, AND THE COUNT SITS ON THE HEADING.

          TWO GROUPS, EACH A SECTION NAMED BY ITS OWN HEADING, so a screen reader announces
          "Not in it, 2 items" before it reads a row of it. That is the same fact the eye gets from
          the gap between the groups and the rail down the side of each. Nothing here is carried by
          hue, and nothing here is carried by a sentence. */}
      <section className="px-pane-group" aria-labelledby="px-group-in">
        <h3 className="px-pane-heading" id="px-group-in">
          <span>{inTheListsOf('inThisReview').word}</span>
          <span className="px-pane-heading-n">{String(detail.members.length)}</span>
        </h3>
      <div className="px-pane-list">
        {/* AN EMPTY REVIEW SAYS A DIFFERENT THING ONCE IT IS FINISHED. Telling somebody how to add
            a comment to a review that can no longer take one is an instruction that cannot be
            followed. */}
        {/* TWO ELEMENTS AND NOT ONE WITH A TERNARY IN IT, so each sentence is written where a
            reader can see which channel it is in. Both are the tooltip. */}
        {detail.members.length > 0 ? null : collecting ? (
          <Absence tier="told-apart" looked word={t('review.pane.empty.collecting')} />
        ) : (
          <Absence tier="told-apart" looked word={t('review.pane.empty.finished')} />
        )}

        {detail.members.map((member) =>
          member.found ? (
            <div className="px-rev-item" key={member.id}>
              <ReviewRow
                member={member}
                inspect={inspect}
                names={rowNames}
                lit={showing.state !== 'none' && showing.annotationId === member.id ? showing : null}
                onGo={() => go(member)}
                onOpen={() => onOpen?.(open === member.id ? null : member.id)}
                openNow={open === member.id}
                hideRecipient={member.state === 'queued' && deliveryPlan.status === 'ready' && deliveryPlan.value.comments.some((line) => line.id === member.id && !line.willGo)}
              />
              <DeliveryRecovery detail={detail} member={member} plan={deliveryPlan.status === 'ready' ? deliveryPlan.value.comments : undefined} />
              {open === member.id ? (
                <MemberDetail
                  member={member}
                  inspect={inspect}
                  collecting={collecting}
                  frozen={detail.review.membershipFrozen}
                  editing={editing === member.id}
                  onEditing={(yes) => onEditing?.(yes ? member.id : null)}
                  // WHY NOTHING IS STORED BESIDE THIS ONE, IN THE SERVER'S OWN SENTENCE, and only
                  // where there is something odd to say. A review nothing has read carries no
                  // `organised` at all, and then every row would say "nothing has read this" — a
                  // line on every row that nobody has to act on, which design/UX-CONTRACT.md calls
                  // furniture. This says it on the rows of a review that HAS been read and skipped
                  // this comment, which is the case a person may need to do something about.
                  without={detail.organised?.without.find((one) => one.id === member.id)?.says ?? null}
                  wasRead={detail.organised !== null}
                  // WHAT WAS SAID OF THIS COMMENT AND OTHERS AT ONCE, from the one place it is
                  // stored: the review's own groups. `saidWithOthers` writes the sentence, in the
                  // same file as the sentence beside the words, so the pair reads as one voice.
                  alsoSaid={saidWithOthers(detail.organised?.groups ?? [], member.id)}
                  // WHAT THE THING THIS COMMENT IS ABOUT IS, IN ONE LINE SOMEBODY WROTE. It is here
                  // rather than on the collapsed row because a gist is twenty to thirty words, and
                  // design/UX-CONTRACT.md says a list row locates and a paragraph of summary does
                  // not belong on one. Opening a row is where a person is deciding.
                  gist={gistBeside(gists.status === 'ready' ? gists.value : null, member.context.target)}
                  // WHO EACH COMMENT IS FOR IS NOT PASSED UP FROM HERE ANY MORE. The row writes the
                  // choice onto the comment and the pane reads it back with the review, so there is
                  // nothing to keep in step between the two.
                  reviewId={detail.review.id}
                />
              ) : null}
            </div>
          ) : (
            // A REVIEW THAT CONTAINED A COMMENT THAT IS NOT THERE NOW SAYS SO. Dropping the row
            // would make a review that lost one look like a review that never had it.
            <MissingComment
              key={member.id}
              detail={detail}
              member={member}
              inspect={inspect}
              line={deliveryPlan.status === 'ready' ? deliveryPlan.value.comments.find((line) => line.id === member.id) : undefined}
            />
          ),
        )}
      </div>

      {/* EVERYTHING ABOUT THIS MEMBERSHIP MOLE OFFICE COULD NOT WORK OUT. A remark whose author nothing
          recorded, a conversation somebody may have deleted a comment from: each is a reason the
          list above may be short, and a list that quietly dropped them would be the fifth
          engineering rule broken on the surface Phase 4 is about. */}
      {/* EACH IN THE READER'S LANGUAGE, from its code; the server's own sentence, ids and all, in Developer
          mode only (decision z_A0xVMbWOzh). An answer without the codes is drawn with the server's sentences, not
          with no gaps (problem W5ixFnJb9VWc, see ReviewDetail.gapForms). */}
      {detail.gapForms === undefined
        ? <GapsInTheServersWords gaps={detail.gaps} part="review-gap" inspect={inspect} />
        : detail.gapForms.map((gap) => (
            <p className="px-pane-note" data-part="review-gap" data-code={gap.code} key={gap.says}>
              {inspect ? gap.says : t(`review.gap.${gap.code}`, gap.values)}
            </p>
          ))}

      </section>

      {/* THE COMMENTS THEY SAVED WITHOUT SENDING ON WHAT THIS REVIEW REVIEWS, BEFORE IT STARTED. Problem H031xonpPSqa:
          with the review column open these comments could not be found or sent together. They are not members, and the membership rule is
          unchanged (`savedNotSent` in src/server/lib/reviews.ts says why); the review lists them here and its send
          carries them, each to the agent chosen for it. Each is the same row as a member's, with the same press to
          choose who it is for. The group is drawn only when there is one: an empty heading on every review would
          be a mark on everything. */}
      {detail.saved.length === 0 ? null : (
        <section className="px-pane-group" data-part="saved-not-sent" aria-labelledby="px-group-saved">
          <h3 className="px-pane-heading" id="px-group-saved">
            <span>{t('review.pane.saved.heading')}</span>
            <span className="px-pane-heading-n">{String(detail.saved.length)}</span>
          </h3>
          <div className="px-pane-list">
            {detail.saved.map((member) => (
              <div className="px-rev-item" key={member.id}>
                <ReviewRow
                  member={member}
                  inspect={inspect}
                  names={rowNames}
                  lit={showing.state !== 'none' && showing.annotationId === member.id ? showing : null}
                  onGo={() => go(member)}
                  onOpen={() => onOpen?.(open === member.id ? null : member.id)}
                  openNow={open === member.id}
                  hideRecipient={member.state === 'queued' && deliveryPlan.status === 'ready' && deliveryPlan.value.comments.some((line) => line.id === member.id && !line.willGo)}
                />
                <DeliveryRecovery detail={detail} member={member} plan={deliveryPlan.status === 'ready' ? deliveryPlan.value.comments : undefined} />
                {open === member.id ? (
                  <MemberDetail
                    member={member}
                    inspect={inspect}
                    collecting={collecting}
                    // NOT IN THE WRITTEN-DOWN MEMBERSHIP, so finishing collecting does not fix its words.
                    frozen={false}
                    editing={editing === member.id}
                    onEditing={(yes) => onEditing?.(yes ? member.id : null)}
                    gist={gistBeside(gists.status === 'ready' ? gists.value : null, member.context.target)}
                    reviewId={detail.review.id}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* THE COMMENTS THIS REVIEW DID NOT TAKE. Real rows, with the same press, under a heading
          with the same kind of count. What was here before was one sentence with a number in it:
          "2 other comments in this project are waiting and are not in this review. They are still
          stored." Nobody could get to either of them from it. */}
      <section className="px-pane-group" data-in="0" aria-labelledby="px-group-out">
        <h3 className="px-pane-heading" id="px-group-out">
          <span>{inTheListsOf('notInIt').word}</span>
          <span className="px-pane-heading-n">
            {notIn.status === 'ready' ? String(notIn.value.total) : ''}
          </span>
        </h3>
        {notIn.status === 'loading' ? <Loading what={t('review.pane.loading.notIn')} rows={1} /> : null}
        {notIn.status === 'error' ? (
          <ErrorNote message={notIn.message} fault={theFaultANoteDraws(notIn.fault)} label={t('review.pane.notIn.failed')} />
        ) : null}
        <div className="px-pane-list">
          {notIn.status === 'ready'
            ? notIn.value.rows.map((row) => (
                <div className="px-rev-item" data-in="0" key={row.id}>
                  <NotInItRow
                    row={row}
                    inspect={inspect}
                    names={rowNames}
                    // THE SAME READING THE MEMBER ROWS GET, matched the same way. A comment is
                    // shown or it is not, and which heading its row sits under does not change
                    // that.
                  lit={showing.state !== 'none' && showing.annotationId === row.id ? showing : null}
                    onGo={
                      row.context === null || row.key === null
                        ? null
                        : () => {
                            goTo(row.context as Context, row.key as string, row.id)
                          }
                    }
                  />
                </div>
              ))
            : null}
          {/* HOW MANY ARE NOT ON THIS REPLY. The server counts the population and says how many it
              carried; a list that quietly stopped at twenty would be a number nobody measured. */}
          {notIn.status === 'ready' && notIn.value.leftOut > 0 ? (
            <p className="px-pane-note">{t('review.pane.more', { n: notIn.value.leftOut })}</p>
          ) : null}
          {/* WHAT THIS READING DOES NOT READ, in the page's language from the word lists the server's English comes from
              (shared/review-pane-words.ts). How many were left out is said above, in every mode. */}
          {inspect && notIn.status === 'ready'
            ? WHAT_THE_NOT_IN_READING_LEAVES_OUT.map((key) => (
                <p className="px-pane-note" key={key}>
                  {t(key)}
                </p>
              ))
            : null}
        </div>
      </section>

      {/* THE ACT BETWEEN THE TWO BOUNDARIES. It is offered once the membership is written down and
          not before: a reading of a set that can still change is a reading of something else, and
          the server refuses one on a collecting review by name. A review that has gone to somebody
          is past it. */}
      {detail.review.state === 'collected' || detail.review.state === 'organised' ? (
        <HaveThemRead
          reviewId={detail.review.id}
          alreadyRead={detail.organised !== null}
          organisedSays={detail.organised?.says ?? null}
          wordsOf={new Map([...detail.members, ...detail.saved].filter((one): one is FoundMember => one.found).map((one) => [one.id, shortName(one.body, SHOWN_CHARACTERS)]))}
        />
      ) : null}

      {/* THE ACT AT THE END OF THE CHAIN. It is offered once the membership is written down, for the
          same reason the reading is: what is inside a collecting review is a live question, and
          handing over a set that can still change hands over something nobody collected. A review
          that has gone still draws this block, without the press, because what happened to each
          comment is worth reading afterwards and a receipt does not survive a reload. */}
      {collecting ? null : (
        <SendTheReview reviewId={detail.review.id} review={detail.review} />
      )}

      {/* THE TWO ENDS OF COLLECTING, AND THE WAY OUT OF A CONFIRM.

          FOUR PARAGRAPHS OF 96 WORDS USED TO BE HERE, one per state, saying what would happen next
          and what Mole Office could not do. They became a row of four steps and the owner took that
          row out. Each press below says what it does on its own.

          NOTHING HERE DISPATCHES. Finishing collecting writes down what is in the review and sends
          nothing; abandoning it ends the review and sends nothing. The only act that hands words to
          anybody is the send block above, and it is not drawn while a review collects. */}
      <div className="px-pane-do">
        {collecting && confirming === null ? (
          <div className="px-pane-ends">
            <Btn
              pending={busy === 'finish'}
              onClick={() => setConfirming('finish')}
              {...(editing === null
                ? busy === 'abandon' ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') } : {}
                : {
                    disabled: true,
                    // THE ONE IRREVERSIBLE PRESS IN THE PANE, AND THE SAVE BUTTON OF AN OPEN EDITOR
                    // LANDS ON IT. Measured: with three comments in the pane, the centre of "Save the
                    // change" was 16px below the list's clip line and `elementFromPoint` there
                    // returned this button. Refusing while an editor is open makes that press
                    // harmless, and the words say what to do instead.
                    reason: t('review.pane.saveFirst'),
                  })}
            >
              {inTheListsOf('finishCollecting').word}
            </Btn>
            {/* THE WAY OUT, BESIDE THE WAY ON. A review started by accident used to have neither:
                finishing cannot be undone, no route deleted a review, and every state word was
                refused by name — so the only escape from a frame on every page was to turn the
                frame off in Settings for every future review as well. */}
            <Btn
              size="sm"
              variant="ghost"
              pending={busy === 'abandon'}
              onClick={() => setConfirming('abandon')}
              {...(busy === 'finish' ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') } : {})}
            >
              {inTheListsOf('abandon').word}
            </Btn>
          </div>
        ) : null}

        {/* THE CONFIRM IS A ROW THAT STAYS, AND THE PRESS IS NOT WHERE THE FIRST PRESS WAS.

            NOT A THREE-SECOND WINDOW. An ordinary double-click is two presses inside three seconds,
            so the commonest mis-gesture in the product would have completed an act that cannot be
            undone, unconfirmed; and a window that lapses reverts with nothing said, which is the
            product deciding something quietly.

            CANCEL IS ON THE LEFT, WHERE THE FIRST PRESS WAS. That is the whole defence against a
            double-click: the second press of one lands on the control that does nothing. The press
            that completes the act is at the other end of the row, so it takes a deliberate move.

            HOLD-TO-CONFIRM IS DELIBERATELY NOT USED. It is the governance gesture, reserved for
            recording a Decision, and spending it on an ordinary boundary makes it ordinary. */}
        {confirming === null ? null : (
          <div className="px-pane-confirm" data-doing={confirming}>
            <Btn size="sm" variant="ghost" onClick={() => setConfirming(null)}>
              {inTheListsOf('cancel').word}
            </Btn>
            <Btn
              pending={busy !== null}
              onClick={() => {
                const id = detail.review.id
                setConfirming(null)
                act(confirming, () => (confirming === 'finish' ? api.finishCollecting(id) : abandonThisReview(id)))
              }}
            >
              {t('review.pane.confirm', {
                act: inTheListsOf(confirming === 'finish' ? 'finishCollecting' : 'abandon').word,
                n: detail.members.length,
              })}
            </Btn>
          </div>
        )}
        {inspect ? <span className="px-pane-note">{detail.says}</span> : null}
      </div>
    </>
  )
  return whole
}

/** Whether "More about this review" is open, kept above the pane, which is built again on every read of the review. */
let moreOpenHere = false

/**
 * WHAT MOLE OFFICE SAID THE LAST TIME SOMEBODY PRESSED ONE OF THESE, BY REVIEW.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A RECEIPT HAS TO OUTLIVE THE COMPONENT THAT EARNED IT
 * ---------------------------------------------------------------------------------------
 *
 * Keeping a reading reads the review again, and reading it again puts the pane back into its
 * loading state — so the whole pane, including the panel that pressed the button, is taken down and
 * built again. Measured on 19 August 2026: the sentence Mole Office answered with was on the screen for
 * about a second and then gone.
 *
 * MOST OF THE TIME THAT WOULD NOT MATTER, because what happened is then visible in the review
 * itself. The case it matters in is the one that must not go quiet: a reading Mole Office accepted and
 * had nowhere to keep. Nothing about the review changes then, and without this the person presses a
 * button and the screen answers with nothing at all.
 *
 * IT IS A RECEIPT AND NOT A FACT. It lasts as long as this page is open, it is never read as the
 * state of anything, and the durable statement — the review's own sentence about the readings it
 * holds — is drawn beside it and comes from the server.
 */
const lastPress = new Map<string, string>()

function remember(reviewId: string, says: string): void {
  lastPress.set(reviewId, says)
}

/**
 * HAVING THE COMMENTS READ: the question Mole Office writes, who answers it, and keeping the answer.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS PANEL EXISTS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Both halves of this were built on the server and neither had a way in. Measured on 19 August
 * 2026: nothing in the whole browser tree named `/organise`, so a person could finish collecting a
 * review and then had nowhere to go. The reading a comment carries was drawn — see
 * `ReadingBesideIt` — and nothing anybody could press had ever put one there.
 *
 * ---------------------------------------------------------------------------------------
 * MOLE OFFICE DOES NOT READ THE WORDS, AND THE PANEL SAYS SO IN THE FIRST SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * Nothing under src/ may start a process — tests/os-boundary.test.ts fails the build when one tries
 * — and the thing that reads words is a command. So the shape is the one an agent run already uses:
 * Mole Office writes the question, something outside answers it, and Mole Office checks that answer against
 * the comments it handed over before keeping any of it.
 *
 * ---------------------------------------------------------------------------------------
 * TWO WAYS TO GET AN ANSWER, AND BOTH END AT THE SAME PRESS
 * ---------------------------------------------------------------------------------------
 *
 * Ask an agent, and the run is watched here. Or take the question away, run it yourself, and paste
 * what came back. The second is not a fallback for the first: a machine with no worker running will
 * never answer the run, and a person who is told to wait for something that cannot arrive has been
 * lied to. Both are offered, and the panel says which one has happened.
 *
 * WHAT COMES BACK IS NEVER TRUSTED. It goes to the server, which refuses anything that does not name
 * every comment in this review exactly once, and a refusal stores nothing and touches nobody's
 * words. That sentence is the server's own and it is drawn as it came.
 */
export function HaveThemRead({
  reviewId,
  alreadyRead,
  organisedSays,
  wordsOf = new Map(),
}: {
  reviewId: string
  alreadyRead: boolean
  /** Each comment's own words, by id, so the reason a reading was not stored names the comment as they wrote it. */
  wordsOf?: ReadonlyMap<string, string>
  /**
   * WHAT THE REVIEW ITSELF SAYS ABOUT THE READINGS IT HOLDS, or null because it holds none.
   *
   * The server's sentence, drawn as it came. It is the DURABLE half of what happened: a receipt
   * from one press is gone after a reload and this is not.
   */
  organisedSays: string | null
}) {
  const inspect = useInspect()
  const projects = useProjects()
  const [tries, setTries] = useState(0)
  const [asked] = useProjectAsync(async () => api.askToOrganise(reviewId), [reviewId, tries])
  const [conversation] = useProjectAsync(async () => findTheReadingAsked(reviewId), [reviewId, tries])
  const [picking, setPicking] = useState(false)
  const [chosen, setChosen] = useState<AgentContact | null>(null)
  const [pasted, setPasted] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  /** WHICH PRESS IS WAITING. One press at a time: only that press draws the light, and the others are off. */
  const [busy, setBusy] = useState<'answer' | 'ask' | 'pasted' | null>(null)
  const [failed, setFailed] = useState<Failure | null>(null)
  const [said, setSaid] = useState<string | null>(lastPress.get(reviewId) ?? null)
  const [copied, setCopied] = useState(false)
  // WHAT THE LAST PRESS'S ANSWER CAME TO, set in the render that ends its wait. Only the press that waited has a light
  // to end, so only it is told.
  const [cameTo, setCameTo] = useState<'done' | 'refused' | null>(null)
  const endedAs = { pendingFailed: cameTo === 'refused', pendingSucceeded: cameTo === 'done' }
  const offWhile = (press: 'answer' | 'ask' | 'pasted') =>
    busy !== null && busy !== press ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') } : {}

  if (asked.status === 'loading') {
    return (
      <section className="px-org" data-part="have-them-read">
        <Loading what={t('review.pane.loading.question')} rows={2} />
      </section>
    )
  }
  if (asked.status === 'error') {
    return (
      <section className="px-org" data-part="have-them-read">
        <p className="px-org-head">{t('review.pane.read.head')}</p>
        {/* A CODED REFUSAL SAYS WHAT FAILED IN THE PAGE'S WORDS, and nothing more is drawn: not the route, the status
            or the review's id, which developer mode added under it (the re-review of wave 13n round 32). Any other
            failure keeps that line in developer mode, because then the route and the status are all there is; a
            refusal that says the reader is in the wrong place keeps its own drawing. */}
        {asked.fault?.code === undefined || asked.fault.kind === 'not-here' || asked.fault.kind === 'elsewhere' ? (
          <ErrorNote message={asked.message} fault={asked.fault} label={t('review.pane.read.cannotWrite')} />
        ) : (
          <ErrorNote message={t(`server.${asked.fault.code}`, asked.fault.values)} label={t('review.pane.read.cannotWrite')} />
        )}
      </section>
    )
  }

  const request = asked.value
  const reading = whereTheReadingHasGot(conversation.status === 'ready' ? conversation.value : null)

  /** Send what came back to the server, which is the only thing that decides whether it is a reading. */
  const keep = (text: string, press: 'answer' | 'pasted') => {
    if (busy !== null) return
    const read = readWhatCameBack(text)
    if ('problem' in read) {
      setFailed({ message: read.problem, fault: null })
      setSaid(null)
      return
    }
    setBusy(press)
    setFailed(null)
    setCameTo(null)
    api.keepOrganised(reviewId, read.reading).then(
      (outcome) => {
        setBusy(null)
        // DONE ONLY WHEN EVERY READING WAS STORED. A 200 can store some and not others, and then the sentence below
        // says how many of each; the press ends plainly.
        setCameTo(outcome.told.kept > 0 && outcome.told.notKept === 0 ? 'done' : null)
        // IN THE PAGE'S LANGUAGE, from the facts the server sent beside its English (src/shared/send-plan-words.ts).
        // EACH READING THAT COULD NOT BE STORED, ON A LINE OF ITS OWN WITH ITS REASON, as the sentence says (report
        // cu3k8UH1DiRT: "each row says why" stood over no row that did). The comment is named by its own words.
        const reasons = outcome.kept.readings.flatMap((one) => {
          if (one.why === null) return []
          const words = wordsOf.get(one.id)
          const who = words === undefined ? one.id : `“${words}”`
          // A PROJECT IS NAMED BY ITS NAME, never by its id; when this page has no name for it, it says so (round 15).
          const values: Record<string, string> = { ...one.why.values, who }
          for (const key of ['where', 'here']) {
            const id = values[key]
            // THE MESSAGE CENTRE IS LEFT OFF EVERY LIST OF PROJECTS (isAProjectOnAList), so it is named here.
            if (id !== undefined) values[key] = id === MESSAGE_CENTRE ? t('review.b.messageCentre') : projects?.find((w) => w.id === id)?.title || t('review.b.projectNotKnown')
          }
          return [`  · ${sayWhyNotKept({ ...one.why, values })}`]
        })
        const kept = [sayTheKeptReading(outcome.told), ...reasons].join('\n')
        remember(reviewId, kept)
        setSaid(kept)
        setPasted('')
        // READ THE REVIEW AGAIN, so the rows draw what was just stored beside their words. Without
        // this the panel says a reading was kept over rows that are still drawing none.
        reviewChanged()
      },
      (err: unknown) => {
        setBusy(null)
        setCameTo('refused')
        setSaid(null)
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }

  const ask = () => {
    if (chosen === null || busy !== null) return
    setBusy('ask')
    setFailed(null)
    setCameTo(null)
    askAnAgentToRead({ reviewId, asked: request.asked, recipient: aContactForTheServer(chosen) }).then(
      (handed) => {
        setBusy(null)
        // DONE WHEN NOTHING WAS HELD BACK. The question is one message, and the door refuses when it cannot go at all.
        setCameTo(handed.outcome.held.length === 0 ? 'done' : null)
        remember(reviewId, handed.outcome.note)
        setSaid(handed.outcome.note)
        setTries((n) => n + 1)
      },
      (err: unknown) => {
        setBusy(null)
        setCameTo('refused')
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }

  return (
    <section className="px-org" data-part="have-them-read">
      <p className="px-org-head">{t('review.pane.read.head')}</p>
      {alreadyRead ? (
        <p className="px-pane-note">{t('review.pane.read.readOnce')}</p>
      ) : null}

      {/* WHERE IT HAS GOT TO. Three states, and waiting is one of them rather than a spinner.
          NOBODY HAS ASKED IS AN ABSENCE and is drawn as one: somebody looked, there is none, and the
          press that changes it is two lines below. */}
      {reading.asked ? (
        <p className="px-org-state">{reading.says}</p>
      ) : (
        <Absence
          tier="told-apart"
          looked
          word={reading.word}
        />
      )}
      {/* AND WHAT THE REVIEW ALREADY HOLDS, WHICH IS THE DURABLE HALF. The receipt below is what
          Mole Office said when somebody last pressed a button on this page; this is what is true of the
          review whoever is reading it and whenever. */}
      {organisedSays === null ? null : <p className="px-org-state">{organisedSays}</p>}
      {inspect && conversation.status === 'ready' && conversation.value !== null ? (
        <p className="px-pane-note">{conversation.value.says}</p>
      ) : null}

      {reading.asked && reading.answer !== null ? (
        <>
          <p className="px-org-label">{t('review.pane.read.answer')}</p>
          <MachineText words={reading.answer} name={t('review.pane.read.answer')} />
          <span className="px-org-acts">
            <Btn size="sm" pending={busy === 'answer'} {...endedAs} onClick={() => keep(reading.answer ?? '', 'answer')} {...offWhile('answer')}>
              {t('review.pane.read.keep')}
            </Btn>
          </span>
        </>
      ) : null}

      {/* ASKING SOMEBODY. Offered whether or not one has been asked before, because an answer that
          was no good is an ordinary reason to ask again, and the panel says which conversation it
          is reading from. */}
      <div className="px-org-row">
        {/* With no reader chosen nothing stands here: the press beside it says `Choose a reader`, and the
            line above says no reader has been asked. Round 124, item 61. */}
        <span className="px-org-to">
          {chosen === null ? null : (
            <>
              {t('review.pane.contacts.to')} <TheChosenContact who={chosen.who} />
            </>
          )}
        </span>
        <span className="px-org-acts">
          <Btn size="sm" variant="secondary" onClick={() => setPicking((v) => !v)}>
            {chosen === null ? t('review.pane.read.choose') : t('review.pane.read.change')}
          </Btn>
          <Btn
            size="sm"
            pending={busy === 'ask'}
            {...endedAs}
            onClick={ask}
            {...(chosen === null
              ? { disabled: true, reason: t('review.pane.read.chooseFirst') }
              : offWhile('ask'))}
          >
            {reading.asked ? t('review.pane.read.askAgain') : t('review.pane.read.ask')}
          </Btn>
        </span>
      </div>
      {/* THE CONTACTS ARE ASKED FOR ONLY WHILE THE LIST IS OPEN: `ContactsForAReview` is drawn only while choosing, so
          opening a review asks nothing about contacts. Each comment's own choice opens the same list the same way. */}
      {picking ? (
        <ContactsForAReview
          asked={{ about: null, review: { id: reviewId } }}
          onChoose={(choice) => {
            setChosen(choice)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}

      {/* DOING IT YOURSELF. The question, to take away, and a box for what comes back. */}
      <details className="px-org-self" open={showPaste} onToggle={(e) => setShowPaste(e.currentTarget.open)}>
        <summary>{t('review.pane.read.yourself')}</summary>
        <MachineText words={request.asked} name={t('review.pane.read.question')} />
        <span className="px-org-acts">
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => {
              // COPYING IS A CONVENIENCE AND THE QUESTION IS ON THE SCREEN EITHER WAY. A browser that
              // refuses the clipboard says so here rather than looking as though the press worked.
              navigator.clipboard?.writeText(request.asked).then(
                () => setCopied(true),
                (err: unknown) => setFailed({ message: errorMessage(err), fault: faultOf(err) }),
              )
            }}
          >
            {t('review.pane.read.copy')}
          </Btn>
          {copied ? <span className="px-pane-note">{t('review.pane.read.copied')}</span> : null}
        </span>
        <TextArea
          value={pasted}
          onChange={setPasted}
          rows={3}
          growTo={12}
          aria-label={t('review.pane.read.pasteLabel')}
        />
        <span className="px-org-acts">
          <Btn
            size="sm"
            pending={busy === 'pasted'}
            {...endedAs}
            onClick={() => keep(pasted, 'pasted')}
            {...(pasted.trim() === ''
              ? { disabled: true, reason: t('review.pane.read.pasteFirst') }
              : offWhile('pasted'))}
          >
            {t('review.pane.read.keep')}
          </Btn>
        </span>
      </details>

      {said === null ? null : <p className="px-org-said">{said}</p>}
      {failed === null ? null : <ErrorNote message={failed.message} fault={theFaultANoteDraws(failed.fault)} label={t('review.pane.read.notKept')} />}
    </section>
  )
}

// ---------------------------------------------------------------------------- sending it

/**
 * WHAT MOLE OFFICE SAID THE LAST TIME SOMEBODY SENT THIS REVIEW.
 *
 * The same receipt `lastPress` is for the reading, kept apart because they are two different
 * sentences about two different acts and a screen showing one under the other's heading would be
 * saying something nobody said. Both last as long as the page is open and neither is ever read as
 * the state of anything: the durable statement is the review's own, and it comes from the server.
 */
const lastSend = new Map<string, string>()
/** The reviews a press on this page sent whole, so Send is gone before the review is read again. */
const sentHere = new Set<string>()
/**
 * WHAT EACH PRESS THAT TOOK A COMMENT OUT OF A REVIEW SAID, by review and comment, for the reason `lastSend` is kept:
 * the review is read again after the press, and the pane is built again (`TheWayOut`).
 */
const lastTakeOut = new Map<string, string>()
/** The reviews a press of Send found changed since the column drew them, so it sent nothing (`sendWhatIsDrawn`). */
const changedAtSend = new Set<string>()
/**
 * THE REVIEWS SENT FROM THE TRAY ON THIS PAGE, whose tray stays at the foot saying what was sent until Close (wave 13y
 * round 146, item 73a). A review opened again from the list is drawn whole, as before.
 */
const trayAfterSend = new Set<string>()
/**
 * THE COMMENTS REMOVED IN THE TRAY'S LIST, for each review, with the place each row had (wave 13y round 146, item 73a).
 * The row stays there, saying Removed with Undo, until the review is closed.
 */
const removedHere = new Map<string, { comment: FoundMember; place: number }[]>()
/**
 * The reviews whose result this page has already brought into view once after the send. A send rebuilds the pane, and
 * the result's first line ("This review has gone") could sit above the window or under the top bar while the words
 * below it showed (wave 13r round 16, check LKIg1xz-PjD-). It is brought into view once, so a later visit is not moved.
 */
const shownAfterSend = new Set<string>()

/**
 * THERE IS NO `sendLine` HERE ANY MORE, AND ITS ABSENCE IS THE POINT.
 *
 * It took the server's line for one comment and, when the person had picked somebody in this
 * browser since, replaced it with *"You chose X. Mole Office checks that when you press Send."* — and
 * set `willGo` to true, which is a claim about whether the comment can be delivered that the
 * browser had no way to check. The Send button's own enabled state was worked out from those
 * patched lines.
 *
 * It existed because a choice was not stored, so the server could not know about it. Choices are
 * stored now, on the comment, so `GET /api/reviews/<id>/send` answers about the choice a person
 * actually made and the pane draws the server's sentences unchanged — which is what the block below
 * says it does. One function decides whether a comment can be delivered, and it is on the server.
 */

/**
 * SEND THIS REVIEW: where every comment would go, the press, and what happened.
 *
 * ---------------------------------------------------------------------------------------
 * THE LIST IS NOT DECORATION AND IT COMES BEFORE THE PRESS
 * ---------------------------------------------------------------------------------------
 *
 * Sending is the one act in a review that somebody else finds out about, so a person reads who each
 * comment is going to, and which ones are going nowhere and why, BEFORE they press. Every sentence
 * here is the server's own — the same one the send itself obeys, because both run one function on
 * the server — so this screen cannot come to promise something dispatch then refuses.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT SAYS AFTERWARDS, AND WHY THE RECEIPT OUTLIVES THE COMPONENT
 * ---------------------------------------------------------------------------------------
 *
 * Sending re-reads the review, which takes the whole pane down and builds it again — so the
 * sentence Mole Office answered with would be on screen for about a second and then gone. It is kept in
 * `lastSend` and drawn again, beside the durable facts the review itself now carries.
 *
 * A SENT REVIEW STILL DRAWS THIS BLOCK, with no press in it. What happened is then read from the
 * review rather than from a receipt, so it survives a reload and another browser.
 */
export function SendTheReview({
  reviewId,
  review,
}: {
  reviewId: string
  review: ReviewView
}) {
  const inspect = useInspect()
  const [tries, setTries] = useState(0)
  // READ AGAIN WHENEVER THE REVIEW CHANGES, so a comment's choice stored a moment ago is in the list and in the
  // press below it. Read once, the list went on saying nobody was chosen, and Send stayed off (problem sLyxTMlvze6A).
  const changes = useReviewChanges()
  const [plan] = useProjectAsync(async () => api.whereTheReviewWouldGo(reviewId), [reviewId, tries, changes])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<Failure | null>(null)
  const [said, setSaid] = useState<string | null>(lastSend.get(reviewId) ?? null)

  const gone = review.state === 'sent' && !(plan.status === 'ready' && plan.value.recoveryAvailable)
  // SEND GOES AS SOON AS THE PRESS SENT THE REVIEW, before the review is read again: a live press under "This review is
  // sent" offered to send it twice (report cu3k8UH1DiRT). A press that left something waiting keeps it.
  const done = gone || (sentHere.has(reviewId) && !(plan.status === 'ready' && plan.value.recoveryAvailable))
  // WHETHER THE REVIEW STILL WAITS IS THE SERVER'S ANSWER, `sendLeavesWaiting` in the plan: what it waits for by the one
  // rule (`whatTheReviewWaitsFor`) that pressing Send would not send. A comment taken out is not in it, nor one that will go.
  const hasWaiting = plan.status === 'ready' && (plan.value.sendLeavesWaiting ?? []).length > 0
  const head = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const line = head.current
    if (!gone || line === null || !lastSend.has(reviewId) || shownAfterSend.has(reviewId)) return
    // THE LINE IS KEPT IN VIEW WHILE THE PANE SETTLES. On a phone the send takes the bar away from the window's foot and
    // the pane becomes the band above the page, and what the pane reads after a send is drawn a moment later, above the
    // line: brought into view once, at 72 pixels from the top, it was 20 pixels above the window when the pane had
    // settled. So it is brought into view once a frame has been drawn and again each time what the pane draws changes,
    // for two seconds at most, and never after the person scrolls, types or presses. A copy of the pane taken down
    // before then has shown nothing, so a new one starts again.
    //
    // THE PANE IS SCROLLED FIRST, SO THE LINE IS AT ITS TOP AND WHAT IT HEADS IS UNDER IT. Brought only into the nearest
    // view, the line stopped at the pane's foot whenever the list above it was long, and the sentence saying what was sent
    // was out of sight (wave 13r round 20). The window then moves only as far as the line needs: on a phone that is the
    // band above the page, and at a desk it is nothing, so the page stays where the person was reading.
    const bring = () => {
      const pane = line.closest<HTMLElement>('.px-pane')
      if (pane !== null) {
        pane.scrollTop += line.getBoundingClientRect().top - pane.getBoundingClientRect().top - parseFloat(getComputedStyle(pane).paddingTop)
      }
      line.scrollIntoView({ block: 'nearest' })
    }
    const frame = requestAnimationFrame(bring)
    const drawn = new MutationObserver(bring)
    drawn.observe(line.closest('.px-pane') ?? document.body, { childList: true, subtree: true, characterData: true })
    const PERSON_MOVES = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
    const stop = () => {
      shownAfterSend.add(reviewId)
      end()
    }
    const timer = window.setTimeout(stop, 2000)
    for (const one of PERSON_MOVES) window.addEventListener(one, stop, { passive: true })
    function end() {
      cancelAnimationFrame(frame)
      drawn.disconnect()
      window.clearTimeout(timer)
      for (const one of PERSON_MOVES) window.removeEventListener(one, stop)
    }
    return end
  }, [gone, reviewId])

  const send = () => {
    if (busy || gone) return
    setBusy(true)
    setFailed(null)
    // NO CHOICES ARE CARRIED UP FROM THE PANE. Who each comment is for is stored on the comment,
    // so the send reads the same choices this list was drawn from. The route still takes them —
    // an agent addressing somebody else's comments in one request has nowhere else to say so.
    api.oneReview(reviewId)
      .then((detail) => sendLeavingPersonComments(reviewId, commentsIn(detail).map((one) => one.id)))
      .then(
        ({ outcome }) => {
          setBusy(false)
          // IN THE PAGE'S LANGUAGE, from the facts the server sent beside its English (src/shared/send-plan-words.ts).
          const sent = sayTheSend(outcome.told)
          lastSend.set(reviewId, sent)
          if (outcome.told.reviewSent) sentHere.add(reviewId)
          setSaid(sent)
          setTries((n) => n + 1)
          // READ THE REVIEW AGAIN, so the pane stops offering to send comments that have gone and
          // the state on the heading is the one the server now holds.
          reviewChanged()
        },
        (err: unknown) => {
          setBusy(false)
          setFailed({ message: errorMessage(err), fault: faultOf(err) })
        },
      )
  }

  // THE SERVER'S OWN LINES, UNCHANGED. See the note above `SendTheReview` about the function that
  // used to rewrite them here.
  const lines = plan.status === 'ready' ? plan.value.comments : []
  const going = lines.filter((one) => one.willGo).length
  // A SAVED COMMENT WITH NOBODY CHOSEN, which the server marks on its line. The send refuses while there is one,
  // so the press stays off and says why; the line under each such comment says which (problem H031xonpPSqa).
  const waitingForSomebody = lines.filter((one) => one.needsARecipient === true).length

  return (
    <section className="px-org" data-part="send-the-review">
      <p className="px-org-head" ref={head}>{hasWaiting ? t('review.delivery.waiting') : gone ? t('review.pane.send.gone') : t('review.pane.send.head')}</p>

      {gone && !hasWaiting ? (
        <p className="px-org-state">
          {t('review.pane.send.sentAt', { at: review.sentAt ?? t('review.pane.send.atNothing') })}
        </p>
      ) : null}

      {plan.status === 'loading' ? <Loading what={t('review.pane.loading.whereEach')} rows={2} /> : null}
      {plan.status === 'error' ? (
        <ErrorNote message={plan.message} fault={theFaultANoteDraws(plan.fault)} label={t('review.pane.send.cannotWorkOut')} />
      ) : null}

      {/* ONE MESSAGE FOR EACH AGENT, BEFORE THE PRESS. By a decision, the comments going to one
          agent go as one message, numbered in the order written, each with what it was left on above
          its words. The grouping is the server's, from the same function the
          send writes with. */}
      {plan.status === 'ready' && !done && plan.value.messages.length > 0 ? (
        <>
          <p className="px-org-label">{t('review.send.messagesLabel')}</p>
          <ul className="px-send-messages" data-part="send-messages">
            {plan.value.messages.map((one) => (
              <li className="px-send-message" key={one.comments[0]?.id ?? one.to}>
                <span className="px-send-to">{t('review.send.messageTo', { name: one.toANewAgent === true ? sayANewAgent() : one.to, n: one.comments.length })}</span>
                <ol className="px-send-numbered">
                  {one.comments.map((comment) => (
                    <li className="px-send-carried" key={comment.id} value={comment.number}>
                      {/* THE QUOTE LINE IS THE MESSAGE'S OWN, IN WORDS AND WITH NO ID (problem F6-GRSXrBMtJ).
                          Developer mode adds the ids of what it was left on, beside it. */}
                      <span className="px-send-quote">{comment.quote}</span>
                      {inspect && comment.ids.length > 0 ? (
                        <span className="px-rev-where" data-part="send-quote-ids">
                          {comment.ids.join(' · ')}
                        </span>
                      ) : null}
                      <span className="px-send-body">{comment.words === '' ? comment.id : `“${comment.words}”`}</span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {plan.status === 'ready' ? (
        <>
          {/* ONE LINE PER COMMENT, INCLUDING THE ONES GOING NOWHERE. A list of only the ones that
              would go is the list that loses somebody's comment quietly. */}
          <p className="px-org-label">{gone ? t('review.pane.send.happened') : t('review.pane.send.wouldGo')}</p>
          <ul className="px-send-list">
            {lines.map((one) => (
              <li className={one.willGo ? 'px-send-one' : 'px-send-one px-send-staying'} key={one.id}>
                <span className="px-send-body">{one.quotedBody === '' ? one.id : `“${one.quotedBody}”`}</span>
                {/* IN THE PAGE'S LANGUAGE, from the code the server found (src/shared/send-plan-words.ts). A saved comment
                    nobody is chosen for is one of those codes, said with wave 13n's key (src/shared/review-pane-words.ts). A
                    line with no code is a comment that is not there to read, and its sentence is the membership reader's. */}
                <span className="px-send-says">{one.sentence === undefined ? one.says : sayTheLine(one.sentence)}</span>
              </li>
            ))}
          </ul>
          {plan.value.comments.length === 0 ? (
            <Absence tier="told-apart" looked word={t('review.pane.send.nothing')} />
          ) : null}
          {inspect ? <p className="px-pane-note">{sayThePlan(plan.value.facts)}</p> : null}
        </>
      ) : null}

      {done ? null : (
        <span className="px-org-acts">
          {/* WHY THERE IS NOTHING TO SEND, AS AN ABSENCE AND NOT AS A PARAGRAPH. Mole Office has asked
              the server where every comment would go and been told: none of them. So this is
              "somebody looked and there is none", which is the told-apart weight — a mark with the
              whole sentence on it, drawn beside the press it explains.

              IT IS NOT THE LOUD WEIGHT, and that was a judgement rather than an oversight. The
              must-act-on tier draws a bordered box on a second background at full ink, which is
              the shape round four rejected on Home for giving an emptiness more weight than the
              thing it was about. This is the resting state of every review before anybody has been
              chosen — the ordinary next thing to do, not an alarm — and it sits in a column that is
              already taller than a screen. The list above says the same thing per comment, and the
              press below says it in plain words when it is pressed, so the way to act on it is on
              the screen twice without this shouting. */}
          {plan.status === 'ready' && going === 0 ? (
            <Absence
              tier="told-apart"
              looked
              word={t('review.pane.send.nobody')}
            />
          ) : null}
          <Btn
            pending={busy}
            pendingFailed={failed !== null}
            onClick={send}
            {...(plan.status === 'ready' && going === 0
              ? { disabled: true, reason: t('review.pane.send.chooseFirst') }
              : waitingForSomebody > 0
                ? { disabled: true, reason: t('review.pane.saved.chooseFirst', { n: waitingForSomebody }) }
                : {})}
          >
            {t('review.pane.send.head')}
          </Btn>
        </span>
      )}

      {/* WHAT MOLE OFFICE SAID WHEN IT WAS PRESSED. It carries its own line breaks — one line per comment
          that stayed behind — so it is drawn as written rather than run into one paragraph. */}
      {said === null ? null : <p className="px-send-said">{said}</p>}
      {failed === null ? null : <ErrorNote message={failed.message} fault={theFaultANoteDraws(failed.fault)} label={t('review.pane.send.notSent')} />}
    </section>
  )
}

/**
 * WHETHER WHY THIS COMMENT CANNOT GO IS SAID OVER THE LIST ALREADY, so its row does not say it again. A collecting review
 * that goes to nobody says so in the line over its comments, beside the press that chooses for all of them
 * (`goesToWords`). While no comment of it can go, a comment with nobody of its own adds nothing under itself. A comment
 * that cannot go for a reason of its own, or while others can go, keeps its own line, and so does every comment of a
 * review that is no longer collecting, which has no such line over it.
 */
function saidOverTheList(detail: ReviewDetail, lines: readonly WhereOneCommentGoes[], line: WhereOneCommentGoes): boolean {
  if (detail.review.state !== 'collecting' || detail.goesTo.recipient !== null) return false
  if (line.sentence === undefined || deliveryReasonKey(line.sentence.key) !== 'review.delivery.noRecipient') return false
  return !lines.some((one) => one.willGo)
}

// A queued comment follows the plan's reading, including a message kept by an earlier send.
function DeliveryRecovery({ detail, member, plan }: { detail: ReviewDetail; member: FoundMember; plan: readonly WhereOneCommentGoes[] | undefined }) {
  const [picking, setPicking] = useState(false)
  const [moving, setMoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<Failure | null>(null)
  const [source, setSource] = useState<{ agent: string; project: string } | null>(null)
  const lines = plan ?? []
  const line = lines.find((one) => one.id === member.id)
  const key = line?.sentence === undefined ? null : deliveryReasonKey(line.sentence.key)
  if (member.state !== 'queued' || line === undefined || line.willGo) return null
  // THE REVIEW'S OWN REASON IS SAID ONCE, OVER THE LIST. A press that takes this comment out is still its own.
  if (saidOverTheList(detail, lines, line)) return <TheWayOut reviewId={detail.review.id} line={line} />
  const crossProject = line.sentence?.key === 'agentElsewhere' || line.sentence?.key === 'agentInAnotherProject' ||
    line.sentence?.key === 'runElsewhere' || line.sentence?.key === 'runInAnotherProject'
  const reason = key === null ? (line.sentence === undefined ? line.says : sayTheLine(line.sentence)) : t(key, line.sentence?.values)

  const choose = async (choice: AgentContact) => {
    setBusy(true)
    setFailed(null)
    try {
      const threadId = detail.review.threadId ?? detail.review.fromThreadId
      const thread = threadId === null ? null : await api.agentThread(threadId)
      const message = thread?.messages.find((one) => one.id === member.id || one.carries.includes(member.id))
      if (message !== undefined) {
        await api.changeAgentMessage(message.id, { recipient: { kind: 'agent', agentId: choice.agentRecordId } })
      } else if (member.source === 'annotation') {
        await api.chooseWhoItIsFor(member.id, aContactForTheServer(choice))
      } else {
        throw new Error(t('review.delivery.cannotChange'))
      }
      setPicking(false)
      reviewChanged()
    } catch (err: unknown) {
      setFailed({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  const findAgent = async () => {
    setMoving(true)
    setFailed(null)
    setSource(null)
    try {
      const resolved = line.resolvedAgent
      if (resolved == null) throw new Error(t('review.delivery.notFound'))
      const projects = resolved.projects.filter((project) => project !== detail.review.workspaceId)
      if (projects.length !== 1) throw new Error(t('review.delivery.noSingleProject'))
      setSource({ agent: resolved.agent, project: projects[0]! })
    } catch (err: unknown) {
      setFailed({ message: errorMessage(err), fault: faultOf(err) })
      setMoving(false)
    }
  }

  return (
    <div className="px-delivery-recovery" data-part="delivery-recovery">
      <span className="px-send-says">{reason}</span>
      <span className="px-rev-acts">
        {crossProject ? <Btn size="sm" variant="secondary" pending={moving && source === null} onClick={() => void findAgent()} disabled={busy}>{t('review.delivery.move')}</Btn> : null}
        {line.yoursToAnswer || line.sentence?.key === 'notReadableInConversation' || line.takenOut !== undefined ? null : <Btn size="sm" variant="secondary" pending={busy} onClick={() => setPicking(!picking)}>{t('review.delivery.choose')}</Btn>}
      </span>
      <TheWayOut reviewId={detail.review.id} line={line} />
      {picking ? <>
        <ContactsForAReview asked={{ about: detail.review.entry, review: { id: detail.review.id } }} onChoose={(choice) => void choose(choice)} onClose={() => setPicking(false)} />
      </> : null}
      {source === null ? null : <AgentProjectMove agentId={source.agent} fromProject={source.project} toProject={detail.review.workspaceId} onMoved={() => { setMoving(false); setSource(null); reviewChanged() }} />}
      {failed === null ? null : <ErrorNote message={failed.message} fault={theFaultANoteDraws(failed.fault)} label={t('review.delivery.failed')} />}
    </div>
  )
}

/**
 * ONE SENTENCE AND ONE PRESS UNDER A COMMENT THE REVIEW WOULD OTHERWISE WAIT FOR. "I answer this myself" is under a
 * comment only the person may answer, and "Remove from this review" under one that can no longer be found. Which press
 * a comment takes is the server's, `wayOut` on its line. The press takes the comment out of what the review waits for,
 * and the comment stays. What the press did is said here, from `lastTakeOut`.
 */
function TheWayOut({ reviewId, line }: { reviewId: string; line: WhereOneCommentGoes }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<Failure | null>(null)
  const said = lastTakeOut.get(`${reviewId} ${line.id}`)
  const because = line.wayOut

  const press = async (chosen: TakenOutBecause) => {
    setBusy(true)
    setFailed(null)
    try {
      const reply = await api.takeOutOfTheReview(reviewId, line.id, chosen)
      lastTakeOut.set(`${reviewId} ${line.id}`, sayTheTakeOut(reply.told))
      if (reply.reviewSent) sentHere.add(reviewId)
      reviewChanged()
    } catch (err: unknown) {
      setFailed({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  if (because === undefined && said === undefined && failed === null) return null
  return (
    <div className="px-delivery-recovery" data-part="way-out">
      {/* NOT `px-send-said`, which is what a Send answered: a page reads the first of those as the send's own sentence. */}
      {said === undefined ? null : <p className="px-pane-note" data-part="taken-out">{said}</p>}
      {because === undefined ? null : (
        <>
          <span className="px-rev-acts">
            <Btn size="sm" variant="secondary" pending={busy} onClick={() => void press(because)}>
              {t(because === 'the-person-answers-it' ? 'review.takeOut.answerMyself' : 'review.takeOut.remove')}
            </Btn>
          </span>
        </>
      )}
      {failed === null ? null : <ErrorNote message={failed.message} fault={theFaultANoteDraws(failed.fault)} label={t('review.takeOut.failed')} />}
    </div>
  )
}

/**
 * A COMMENT THE REVIEW CONTAINED THAT IS NOT THERE NOW, with its way out. Once it is taken out, its line says so under
 * the words that say it is missing.
 */
function MissingComment({ detail, member, line, inspect }: { detail: ReviewDetail; member: MissingMember; line: WhereOneCommentGoes | undefined; inspect: boolean }) {
  return (
    <div className="px-rev-item">
      <p className="px-pane-note">{inspect ? member.says : missingWords(member)}</p>
      {line?.takenOut === undefined || line.sentence === undefined ? null : <p className="px-pane-note">{sayTheLine(line.sentence)}</p>}
      {line === undefined ? null : <TheWayOut reviewId={detail.review.id} line={line} />}
    </div>
  )
}

// ---------------------------------------------------------------------------- one row

function CommentRecipient({ name }: { name: string | null | undefined }) {
  return <span className="px-comment-recipient">{name === undefined
    ? t('review.pane.row.recipientNotKnown')
    : name === null ? t('review.pane.read.nobodyChosen')
    : t('review.pane.row.for', { name })}</span>
}

/**
 * ONE COMMENT, AS ONE ROW: what was written, what it was written on, and whether that still holds.
 *
 * PRESSING IT GOES TO THE SOURCE. The whole row is the press, because "take me to it" is what a
 * person wants from a row in a review and a small link inside a row is a target nobody finds.
 *
 * THE QUOTE AND THE STALE MARK ARE DRAWN TOGETHER. The measured failure was a list where every row
 * drew the quote and nothing said which two of the seven no longer matched the text.
 *
 * EXPORTED SO A TEST CAN DRAW ONE WITHOUT A SERVER.
 */
export function ReviewRow({
  member,
  inspect,
  names = new Map(),
  lit,
  onGo,
  onOpen,
  openNow,
  hideRecipient = false,
}: {
  member: FoundMember
  /** Developer detail is on, so the ids in the server's sentence stay in. */
  inspect: boolean
  /** The records the comments were written on, named, so where each was written is said in the page's language. */
  names?: ThingNames
  /** An old typed hint. Kept in the row input for older callers; the resolved destination is drawn. */
  to?: string | null
  /**
   * How the last press on this row went, or null when it was not this row.
   *
   * IT IS THE WHOLE READING AND NOT ITS FIRST WORD. `showing.state` alone says the thing was found
   * and cannot say WHAT was found — the words, one line, the whole thing, or nothing Mole Office has
   * been taught to place. Those are §8.2's five places, and passing one word of the three-state
   * search dropped four of them one component before they were drawn.
   */
  lit: Showing | null
  onGo: () => void
  onOpen: () => void
  openNow: boolean
  hideRecipient?: boolean
}) {
  const stale = staleWords(member.reading)
  // DEVELOPER MODE GETS THE STORED WORD, which is what that switch is for, and everybody else gets
  // the reading. The choice is made once, here, rather than in nine components.
  const stands = standsWords(member.state, inspect ? 'inspect' : 'normal')
  const named = spanNamedBy(member.context)
  const quote = named === null ? null : shortenToWords(named.quote, 40)
  const words = shortenToWords(member.body, 110)

  return (
    <>
      <button type="button" className="px-rev-go" onClick={onGo} title={member.reading.says}>
        {/* THE CUT SAYS IT WAS CUT, in the product's own word for it.
            A comment is what a person wrote and Mole Office never writes a shorter form of it — the
            `annotation` kind deliberately declares none, because a shortened version of somebody's
            own words stored beside them would be read as a replacement. So a row too narrow for the
            whole comment shows its first words and says so.
            IT USED TO SAY NOTHING. Measured on 19 August 2026: a row read "Decide for me: we should
            drop the printed mount and standardise on aluminium. Write that decision down as a" —
            cut mid-sentence, with no ellipsis and no mark of any kind — while the quoted words two
            lines below carried the mark. The row disagreed with itself about the same fact. */}
        <span className="px-rev-words" title={words.shortened ? words.whole : undefined}>
          {words.words}
          {words.shortened ? <span className="px-rev-cut">{t('review.pane.shortened')}</span> : null}
        </span>
        <span className="px-rev-meta">
          {hideRecipient ? null : <CommentRecipient name={member.recipientName} />}
          <span className="px-rev-where">
            {whereItWasWritten(member.reading.about, member.context, names, inspect)}
          </span>
          {/* THE WORDS THAT WERE SELECTED, AND WHETHER THEY WERE CUT. A cut quote read as the
              whole quote is a small lie the reader cannot see, and the mark beside it is the
              product's own word for it everywhere else. */}
          {quote === null ? null : (
            <span className="px-rev-quote" title={quote.whole}>
              {`“${quote.words}”`}
              {quote.shortened ? <span className="px-review-quote-cut">{t('review.pane.quoteShortened')}</span> : null}
            </span>
          )}
          {stale === null ? null : stale.kind === 'act' ? (
            <span className="px-rev-stale" data-act="1">
              {stale.words}
            </span>
          ) : (
            <Absence tier="told-apart" looked={false} word={t('review.pane.row.cannotSay')} title={member.reading.says} />
          )}
          {stands === null ? null : <span className="px-rev-stands">{stands}</span>}
        </span>
      </button>
      <span className="px-rev-acts">
        <Btn size="sm" variant="ghost" onClick={onOpen}>
          {openNow ? t('review.pane.row.less') : t('review.pane.row.more')}
        </Btn>
        <HowThePressWent lit={lit} />
      </span>
    </>
  )
}

/**
 * ONE WORD SAYING WHICH MARK THE PAGE MANAGED TO PUT ON THIS COMMENT'S SOURCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ROW SAYS ANYTHING AT ALL AFTER A PRESS
 * ---------------------------------------------------------------------------------------
 *
 * A press that lit the exact words needs no word: the wash is the answer and the quote is already
 * on the row. Every other press used to say nothing whatever. Measured on 20 August 2026: pressing
 * a comment made on a whole record scrolled the page, drew a 2 px edge down both sides of a
 * nineteen-screen article, and left the row reading exactly what it read before — so the one case
 * where the reader most needs to be told what was attached is the case that told them nothing.
 *
 * Contract §6.16 asks for one end-state word and nothing more, and §8.2 says what the word is for
 * each of the five places. This draws that word and never invents a sixth.
 *
 * IT IS NOT A PROPERTY OF THE ROW, IT IS THE OUTCOME OF THE PRESS, which is why it appears when
 * somebody presses and not before. `wordForPlace` is the one reader of the vocabulary table.
 */
function WhatWasMarked({ showing }: { showing: Showing }) {
  if (showing.state !== 'found') return null
  // NOTHING WAS RECORDED ABOUT WHERE, which is not the same as "the whole thing was". §8.1's word
  // for it is `Not known`: Mole Office has not been taught to look, and no mark was drawn.
  if (showing.place === null) {
    // THE SENTENCE BEHIND THE WORD, from the vocabulary that owns the word. There was none, so a
    // reader who did not already know what `Not known` meant had nowhere to find out — and this is
    // the answer every comment written before Mole Office recorded a place gets, which is both of the
    // owner's own.
    return (
      <span className="px-rev-stands">
        {t('review.vocab.readingNotKnown.word')}
      </span>
    )
  }
  const word = wordForPlace(showing.place)
  // The words themselves were lit, and §8.2 gives that row no word: the quote is the word.
  if (word === null) return null
  return (
    <span className="px-rev-stands">
      {word}
    </span>
  )
}

/**
 * THE REST OF ONE COMMENT: the whole of what was written, what Mole Office makes of where it points,
 * and — when it quoted words that have moved — what the text held when it was written.
 *
 * THAT LAST LINE IS WHAT THE REVISION LEDGER IS FOR. A comment that carries the revision it was
 * written against can show the sentence its words were sitting in, so "these words are gone"
 * becomes something a person can act on.
 */
export function MemberDetail({
  member,
  reviewId,
  inspect,
  collecting,
  frozen,
  editing,
  onEditing,
  without,
  wasRead = false,
  alsoSaid = [],
  gist = { kind: 'nothing-to-ask' },
}: {
  member: FoundMember
  /**
   * The review this comment is being read inside. The press that sends this one comment sends it as
   * part of THIS review, into the one conversation the review has, rather than into one of its own.
   */
  reviewId: string
  /** Developer detail is on, so the server's own sentences and the ids in them stay in. */
  inspect: boolean
  /** The review is still collecting, so nothing here may be handed to anybody yet. */
  collecting: boolean
  /** The membership has been written down, so nothing may be taken out of it. */
  frozen: boolean
  editing: boolean
  onEditing: (yes: boolean) => void
  /**
   * Why this review holds readings and holds none of this comment, in the server's own sentence.
   *
   * Null on a review nothing has read, where there is nothing odd about this row, and null on a row
   * that carries a reading. Never written here: the server is what can tell a comment whose words
   * live in a conversation from one whose reading was taken away.
   */
  without?: string | null
  /**
   * True when something has read this review, which is the server's own answer and not a count.
   *
   * It decides whether the second column is drawn at all. On a review nobody has read there is
   * nothing to draw beside the words and nothing anybody has to do about it, so the words keep the
   * whole width and no row carries a heading saying what is not there.
   */
  wasRead?: boolean
  /**
   * WHAT THE READING SAID ABOUT THIS COMMENT AND OTHERS AT ONCE, one sentence per group naming it.
   *
   * WORKED OUT BY THE PANE FROM THE ONE PLACE IT IS STORED — the review's own groups — and handed
   * down. The row does not read it out of the sentence beside the words, because that sentence is
   * the person's to rewrite and a group is not theirs to remove from other people's comments.
   */
  alsoSaid?: readonly string[]
  /**
   * THE GIST OF THE THING THIS COMMENT IS ABOUT, or which kind of nothing there is instead.
   *
   * A gist is twenty to thirty words somebody wrote on purpose. When nobody has written one this
   * says so; it never draws the opening of the record instead, because the first thirty words of a
   * report are not the useful conclusion and drawing them as one is a claim about writing nobody
   * did. Defaulted, so the two other callers of this component are unchanged.
   */
  gist?: GistBeside
}) {
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState<Failure | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  // WHETHER THE LAST SEND WAS SHOWN TO HAVE SENT THIS COMMENT, set with `sending` going false so the press flashes only
  // then. A 200 that held the comment back ends plainly.
  const [gone, setGone] = useState(false)
  /**
   * WHO THIS COMMENT IS FOR, READ FROM THE COMMENT.
   *
   * IT IS NOT STATE HERE, AND THAT IS THE FIX. It was `useState` until 19 August 2026 — the choice
   * lived in this component and nowhere else, so it died with the row, with the pane and with a
   * reload, on the one screen where everything else survives all three. It is a declared field of
   * the comment now, and this reads what the server answered.
   */
  const chosen = member.chosen
  /**
   * WHY THE LAST CHOICE WAS NOT STORED, kept apart from why the last send failed.
   *
   * TWO ACTS, TWO SENTENCES. One error state under both would print "Nothing was sent" over a
   * refusal about who a comment is for, which is a sentence nobody said.
   */
  const [choiceFailed, setChoiceFailed] = useState<Failure | null>(null)
  const choose = (one: AgentContact | null) => {
    setChoiceFailed(null)
    // WRITTEN, THEN RE-READ. There is no local copy to keep in step, so nothing here can come to
    // disagree with what is stored; the pane reloads the review and the choice comes back with it.
    api.chooseWhoItIsFor(member.id, one === null ? null : aContactForTheServer(one)).then(
      () => reviewChanged(),
      (err: unknown) => setChoiceFailed({ message: errorMessage(err), fault: faultOf(err) }),
    )
  }
  const held = member.reading.writtenAgainst ?? null
  const note = noteOfMember(member)
  /**
   * WHETHER THIS COMMENT HAS GONE TO SOMEBODY, read off the note rather than worked out again.
   *
   * It gates the Send button, the edit and the "Already sent" line, and it is the same fact the
   * note carries to the mark layer. Two expressions for it would be two answers about one comment
   * on one screen, which is the defect this repository keeps finding.
   */
  const carried = note.sent
  const stale = staleWords(member.reading)
  /**
   * WHETHER THE SERVER'S READING ALREADY CARRIES THE REVISION'S SENTENCE.
   *
   * `readContext` appends `writtenAgainst.says` to its own sentence when the words have changed,
   * and leaves it off when they have not. So the two strings are the answer, and this asks THEM
   * rather than restating that rule here — a copy of it in the browser would be free to disagree
   * the day the server stops appending, which is the defect CLAUDE.md names as this project's own.
   */
  const alreadySaid = held !== null && member.reading.says.includes(held.says)

  const send = () => {
    // TWO PRESSES ON ONE COMMENT USED TO MAKE TWO CONVERSATIONS, TWO MESSAGES AND TWO RUNS carrying
    // the same words, because nothing re-read the review after a send and the button stayed. The
    // press refuses while one is in flight, the server refuses a comment it has already stamped
    // sent, and the read below turns the button off.
    if (chosen === null || sending || carried) return
    setSending(true)
    setFailed(null)
    setGone(false)
    /**
     * SENDING ONE COMMENT IS SENDING THAT MUCH OF THE REVIEW.
     *
     * IT USED TO MAKE ITS OWN CONVERSATION. `sendOneComment` opens a fresh `direct` thread through
     * the agent routes, which is the right thing for a comment that belongs to no review — the
     * composer still uses it — and the wrong thing here. A comment sent that way went out in a
     * conversation nothing tied to the review, so the review's own conversation went on listing it
     * as "Not sent yet", addressed to a dead run, while the pane's heading said "4 comments, 3
     * sent". Two authoritative screens, two answers about one comment, found by a first-time user
     * on 19 August 2026.
     *
     * SO IT GOES THROUGH THE REVIEW'S SEND, naming this one comment. Same conversation, same
     * delivery reading, same stamp — and the count and the thread cannot come apart, because there
     * is only one act.
     */
    api.sendReview(reviewId, [], [member.id]).then(
      (outcome) => {
        setSending(false)
        setGone(everyOneHasGone(outcome, [member.id]))
        setSent(outcome.says)
        // READ THE REVIEW AGAIN. Until this ran, the row went on saying the comment was waiting and
        // went on offering to send it, and the pane's own count read "none sent" over a comment
        // that had gone.
        reviewChanged()
      },
      (err: unknown) => {
        setSending(false)
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }

  return (
    <div className="px-rev-more">
      {/* WHAT MOVED UNDER THIS COMMENT, ONCE.
          MEASURED IN CHROMIUM ON 19 AUGUST 2026, in Developer detail, on a comment whose quoted
          words had gone: three paragraphs, one under the other, all saying the same thing. The
          server's reading, then the revision's own sentence, then the text that revision held —
          and the server had already appended the second into the first, and the first already
          quoted the third. So the second and third are drawn only when the first does not carry
          them, which `alreadySaid` reads from the strings themselves. */}
      {inspect ? <p className="px-pane-note">{member.reading.says}</p> : null}
      {inspect && held !== null && !alreadySaid ? <p className="px-pane-note">{held.says}</p> : null}
      {!inspect && stale !== null && stale.kind === 'act' ? (
        <p className="px-pane-note">{stale.words}</p>
      ) : null}
      {/* WHAT THE REVISION HELD WHERE THE WORDS CAME FROM. This is the sentence the Revision Ledger
          was built for: it turns "these words are gone" into something a person can act on, because
          they can see the text their comment was sitting in. It is absent, and says nothing, when
          the comment carries no revision — which is every comment written before this pass. In
          Normal it is the only place that text appears; in Developer detail the server's sentence
          above quotes it already, and then this one is a second printing of it. */}
      {held === null || held.heldThere === null || (inspect && alreadySaid) ? null : (
        <p className="px-rev-held">{t('review.pane.heldThere', { text: held.heldThere })}</p>
      )}
      {/* WHAT THE THING THIS COMMENT IS ABOUT IS, IN ONE LINE. Nothing at all when the comment is
          about a plan line or the page, which name no record and so have no short forms of any
          length: an absence mark on those would be a mark on things where nothing could ever be
          written. */}
      {gist.kind === 'nothing-to-ask' ? null : gist.kind === 'gist' ? (
        <>
          {/* THE HEADING IS DRAWN ONLY WHERE THERE ARE WORDS. Without it a line of somebody else's
              writing sits above the comment with nothing saying whose it is, and a reader takes it
              for part of the comment. With nothing to head, it would be furniture on every row. */}
          <p className="px-org-label">{t('review.pane.gist.head')}</p>
          <p className="px-rev-gist prose-measure">
            {gist.text}
            {gist.current ? null : (
              <Absence tier="told-apart" looked word={t('review.pane.gist.older')} />
            )}
          </p>
        </>
      ) : (
        <Absence
          tier="told-apart"
          looked={gist.kind === 'none'}
          word={gist.kind === 'none' ? t('review.pane.gist.none') : t('review.pane.gist.nobodyLooked')}
        />
      )}
      {member.source === 'conversation' ? (
        // WHERE THIS ONE CAME FROM, AS A LABEL. It is a fact about this row, the same shape as the
        // gist mark above it, and the sentence behind it says the part a reader may want: the words
        // are read from the conversation and are not a copy.
        <p className="px-pane-note">
          {t('review.pane.fromConversation')}
        </p>
      ) : (
        <NoteWaiting
          note={note}
          asked={{
            about: member.context,
            review: { id: reviewId },
          }}
          chosen={chosen}
          carried={carried}
          mayChange={!carried && !frozen}
          mayGo={!collecting}
          editing={editing}
          onEditing={onEditing}
          onChoose={choose}
          choiceFailed={choiceFailed}
          // WHAT MOLE OFFICE MADE OF THESE WORDS, DRAWN BESIDE THEM AND NEVER INSTEAD OF THEM. The
          // words keep their column and their whole text at every width; this is the second one.
          //
          // NOTHING AT ALL ON A REVIEW NOBODY HAS READ. A second column saying "nothing has been
          // read into this" on every comment of every unread review is a mark on everything, which
          // marks nothing, and nobody has to act on it. `wasRead` is the server's answer to whether
          // this review holds any reading, never a count worked out here.
          {...(wasRead
            ? {
                beside: (
                  <ReadingBesideIt
                    noteId={member.id}
                    reading={member.interpretation}
                    without={without ?? null}
                    alsoSaid={alsoSaid}
                  />
                ),
              }
            : {})}
          {...(chosen === null ? {} : { onSend: send, sending, sendFailed: failed !== null, sendSucceeded: gone })}
        />
      )}
      {sent === null ? null : <p className="px-pane-note">{sent}</p>}
      {failed === null ? null : <ErrorNote message={failed.message} fault={theFaultANoteDraws(failed.fault)} label={t('review.pane.send.notSent')} />}
    </div>
  )
}

/**
 * WHAT MOLE OFFICE MADE OF ONE COMMENT, DRAWN BESIDE THE WORDS, WITH THE TWO PRESSES A PERSON HAS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A reading is stored on every comment a read review holds, and no screen in this product drew one.
 * The pane printed "Mole Office has read these comments" over rows showing only the bodies, and the
 * sentence Mole Office had kept was not in the page at all — measured in Chromium on 19 August 2026,
 * before and after opening every row.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE THING THIS SURFACE HAS TO SAY OUT LOUD
 * ---------------------------------------------------------------------------------------
 *
 * `annotation.interpretation` is ONE STRING WITH NO AUTHOR ON IT. So a sentence a person writes here
 * is stored in the same field, in the same shape, as the one Mole Office kept, and afterwards nothing can
 * tell the two apart — and reading the review again writes over it without saying that it did. That
 * is a real consequence of pressing this button, not an explanation of a confusing design, so it is
 * said where the press is. Taking a reading away has no such catch, which is why the two presses are
 * worded differently.
 *
 * NOTHING HERE TOUCHES THE WORDS. `setInterpretation` sends one field, and the words of a comment
 * that has gone out are refused by the server whatever this does.
 */
export function ReadingBesideIt({
  noteId,
  reading,
  without,
  alsoSaid = [],
  onChanged,
}: {
  noteId: string
  /** The sentence stored beside the words, or null when nothing is stored beside them. */
  reading: string | null
  /** Why nothing is stored beside them, in the server's own sentence. Null when it says nothing. */
  without: string | null
  /**
   * WHAT THE SAME READING SAID ABOUT THIS COMMENT AND OTHERS AT ONCE, one sentence per group.
   *
   * DRAWN OUTSIDE THE BOX A PERSON EDITS, and that is the whole reason it is a separate prop. A
   * group is a claim about several comments, stored once on the review; putting it in the editable
   * sentence made it one copy per member, and rewriting one member's reading left the others
   * announcing a group that member had left. Nothing here can be changed from this component,
   * because changing it from one comment would change what Mole Office says about another.
   *
   * Empty on a surface that does not know which review is being read — a comment's own record page
   * — and empty says nothing rather than saying there are no groups.
   */
  alsoSaid?: readonly string[]
  /**
   * What the surface drawing this has to read again after a write. The review pane is told by
   * `reviewChanged`, which every open pane listens to; a record page has its own reload and passes
   * it here. Both happen, because both surfaces can be on screen at once.
   */
  onChanged?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [said, setSaid] = useState(reading ?? '')
  /**
   * WHICH PRESS IS WAITING. Save and Take away are never drawn together, but Keep the old reading and Change move from
   * one to the other while a write waits; so only the press that waits draws the light, and the other is off.
   */
  const [busy, setBusy] = useState<'save' | 'takeAway' | null>(null)
  const [failed, setFailed] = useState<Failure | null>(null)
  // WHETHER THE LAST TAKE AWAY WAS SHOWN TO HAVE REMOVED THE READING, set as its wait ends so its press flashes
  // only then. A 200 that found nothing there to remove wrote nothing, and ends plainly.
  const [tookAway, setTookAway] = useState(false)
  const sendKey = useSendKey()

  const offWhile = (press: 'save' | 'takeAway') =>
    busy !== null && busy !== press ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') } : {}

  const write = (sentence: string | null) => {
    if (busy !== null) return
    setBusy(sentence === null ? 'takeAway' : 'save')
    setFailed(null)
    setTookAway(false)
    api.setInterpretation(noteId, sentence).then(
      (answer) => {
        setBusy(null)
        setTookAway(sentence === null && answer.dataPatch?.deleted.includes('data.interpretation') === true)
        setEditing(false)
        reviewChanged()
        onChanged?.()
      },
      (err: unknown) => {
        setBusy(null)
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }

  return (
    <div className="px-read">
      {/* ITS OWN STYLESHEET, BECAUSE IT IS DRAWN IN TWO PLACES. The review pane emits the pane's
          rules; a record page does not, and a component that borrowed them drew as run-together
          words there. React keeps one copy however many of these are on screen. */}
      <style href="mole-office-reading" precedence="default">
        {READING_CSS}
      </style>
      <p className="px-read-head">{t('review.pane.reading.head')}</p>
      {reading === null ? (
        // NOTHING IS STORED, AND WHICH KIND OF NOTHING IS THE SERVER'S ANSWER. It can tell a comment
        // whose words live in a conversation, and so have nowhere to keep a reading, from one whose
        // reading was taken away; this cannot, and a guess here would be the fifth engineering rule
        // broken on the surface the whole phase is about.
        //
        // NO SENTENCE MEANS THE TWO FIELDS OF ONE REPLY DISAGREE. This is only drawn on a review
        // that HAS been read, and such a review names every comment it kept nothing for. A member
        // in neither list is a fault in Mole Office and is reported as one rather than drawn as an
        // ordinary absence.
        <>
          <Absence
            tier="told-apart"
            looked={false}
            word={t('review.pane.reading.nothing')}
            title={without === null ? t('review.pane.reading.fault') : undefined}
          />
          {without === null ? null : <ServerNote text={without} />}
        </>
      ) : editing ? (
        <>
          <TextArea
            value={said}
            onChange={setSaid}
            rows={3}
            growTo={12}
            aria-label={t('review.pane.reading.label')}
            onKeyDown={aSendKeyPress<HTMLTextAreaElement>(sendKey, () => {
              // ONLY WHEN THE SAVE PRESS WOULD ACT: not while it is pending, not on an empty box, and
              // not when nothing has changed, which are the three times the press below is disabled.
              if (busy === null && said.trim() !== '' && said.trim() !== reading) write(said.trim())
            })}
          />
          {/* WHAT THIS BOX HOLDS, SAID BEFORE THE PRESS THAT REPLACES IT. Everything in it is
              Mole Office's claim about this one comment — including what it made of what the person
              wants and of what could exist afterwards — and saving replaces the lot. A person who
              writes one sentence over three has not lost anything they could not see; a person who
              was not told had no way to know. */}
          <span className="px-read-acts">
            <Btn
              size="sm"
              pending={busy === 'save'}
              pendingFailed={failed !== null}
              onClick={() => write(said.trim())}
              {...(said.trim() === '' || said.trim() === reading
                ? {
                    disabled: true,
                    reason:
                      said.trim() === ''
                        ? t('review.pane.reading.isEmpty')
                        : t('review.pane.reading.unchanged'),
                  }
                : offWhile('save'))}
            >
              {t('review.pane.reading.save')}
            </Btn>
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => {
                setSaid(reading)
                setFailed(null)
                setEditing(false)
              }}
            >
              {t('review.pane.reading.keepOld')}
            </Btn>
          </span>
        </>
      ) : (
        <>
          <p className="px-read-says prose-measure">{reading}</p>
          <span className="px-read-acts">
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => {
                setSaid(reading)
                setEditing(true)
              }}
            >
              {t('review.pane.reading.change')}
            </Btn>
            <Btn size="sm" variant="ghost" pending={busy === 'takeAway'} pendingFailed={failed !== null} pendingSucceeded={tookAway} onClick={() => write(null)} {...offWhile('takeAway')}>
              {t('review.pane.reading.takeAway')}
            </Btn>
          </span>
        </>
      )}
      {/* WHAT WAS SAID OF THIS COMMENT AND OTHERS AT ONCE. It is drawn under the reading and
          outside every press, because it is stored on the review and belongs to more than this
          comment. Every member of a group draws the same sentence from the same row, so two
          comments can no longer disagree about whether they were said together. */}
      {alsoSaid.map((says) => (
        <p className="px-read-with" key={says}>
          {says}
        </p>
      ))}
      {failed === null ? null : <ErrorNote message={failed.message} fault={theFaultANoteDraws(failed.fault)} label={t('review.pane.reading.notChanged')} />}
    </div>
  )
}

/**
 * ONE NOTE, WITH THE THINGS A PERSON CAN DO TO IT: change the words, remove it, say who it is for,
 * and hand it to that agent.
 *
 * SENDING ONE COMMENT IS NOT SENDING THE REVIEW. Mole Office does not send a review yet. What it can do
 * is what it has always been able to do — carry one person's words to one agent — and that is a
 * press on the comment rather than a press on the collection.
 *
 * EXPORTED SO A TEST CAN DRAW ONE WITHOUT A SERVER.
 */
export function NoteWaiting({
  note,
  asked,
  chosen,
  carried,
  mayChange,
  choiceFailed = null,
  mayGo,
  editing,
  onEditing,
  onChoose,
  onSend,
  sending,
  sendFailed = false,
  sendSucceeded = false,
  beside,
}: {
  note: WaitingNote
  /**
   * What a choice of who this comment is for is about, which the list of contacts reads. Left out, it is the
   * comment's own place and no review.
   */
  asked?: WhatThePickIsAbout
  /**
   * WHO THIS COMMENT IS FOR AS IT IS STORED, with the server's own sentence about that choice.
   *
   * IT IS THE SERVER'S SENTENCE AND NOT A LABEL WORKED OUT HERE. `readDelivery` is what the send
   * obeys, so a row saying "it goes to a new agent" and a send list saying the same thing are one
   * answer drawn twice rather than two answers that can part company.
   */
  chosen: { says: string; sentence?: SendPlanSentence } | null
  /** Why the last choice was not stored, or null because it was. Never swallowed. */
  choiceFailed?: Failure | null
  /** True when this comment has already gone to somebody. It is not sent again. */
  carried: boolean
  /**
   * True when the words may still be changed and the comment may still be removed.
   *
   * FALSE ONCE IT HAS GONE, and false once the review it is in has written its membership down.
   * Both were offered before: "Edit" on a comment that had already been sent refused with a
   * five-sentence error carrying a record id and a POST body, and "Remove" on a frozen review's
   * comment emptied a collection the same pane says nothing can change.
   */
  mayChange: boolean
  /** True when a comment may be handed to an agent — which is only after collecting has finished. */
  mayGo: boolean
  editing: boolean
  onEditing: (yes: boolean) => void
  onChoose: (choice: AgentContact) => void
  /** Present only once somebody has been chosen. */
  onSend?: () => void
  sending?: boolean
  /** How the last send ended, given with `sending` going false: refused, or shown to have sent this comment. */
  sendFailed?: boolean
  sendSucceeded?: boolean
  /**
   * WHAT MOLE OFFICE MADE OF THESE WORDS, drawn in a second column beside them.
   *
   * BESIDE AND NEVER INSTEAD. The words keep their own column, whole, at every width — below 700px
   * the two columns stack in the same order, so the words are still read first. Left out where
   * there is no such surface, which is every caller but the review pane.
   */
  beside?: ReactNode
}) {
  const [picking, setPicking] = useState(false)
  const [body, setBody] = useState(note.body)
  /** WHICH PRESS IS WAITING. One press at a time: only that press draws the light, and the others are off. */
  const [busy, setBusy] = useState<'remove' | 'save' | null>(null)
  const [failed, setFailed] = useState<Failure | null>(null)
  // WHAT THE LAST PRESS'S ANSWER CAME TO, set in the render that ends its wait. Only the press that waited has a light
  // to end, so only it is told. Save unmounts when it succeeds, so only Remove can be told it did.
  const [cameTo, setCameTo] = useState<'done' | 'refused' | null>(null)
  const offWhile = (press: 'remove' | 'save') =>
    busy !== null && busy !== press ? { disabled: true, reason: t('sheet.button.waitsForTheLastAnswer') } : {}
  const sendKey = useSendKey()
  /** The words this comment was written on, when it was written on a few words rather than a whole thing. */
  const named = spanNamedBy(note.context)
  const quote = named === null ? null : shortenToWords(named.quote)
  const editor = useRef<HTMLDivElement | null>(null)

  /**
   * THE EDITOR IS BROUGHT INTO VIEW WHEN IT OPENS. The list of comments scrolls, and with three
   * comments above it the editor and its Save button opened below the clip line — invisible, and
   * on top of the one press in this pane that cannot be undone.
   */
  useEffect(() => {
    if (editing) editor.current?.scrollIntoView({ block: 'nearest' })
  }, [editing])

  const done = (press: 'remove' | 'save', act: () => Promise<unknown>, proves?: (answer: unknown) => boolean) => {
    if (busy !== null) return
    setBusy(press)
    setFailed(null)
    setCameTo(null)
    act().then(
      (answer) => {
        setBusy(null)
        setCameTo(proves?.(answer) === true ? 'done' : null)
        onEditing(false)
        reviewChanged()
      },
      (err: unknown) => {
        setBusy(null)
        setCameTo('refused')
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }

  return (
    <div className="px-review-item" data-note-id={note.id} ref={editor}>
      <div className="px-review-item-head">
        {/* WHAT IT WAS WRITTEN AGAINST. The kind of thing, and the words if some were quoted. */}
        <span className="px-review-about">{subjectWord(note.context)}</span>
        {quote === null ? null : (
          <span className="px-review-quote" title={quote.whole}>
            {`“${quote.words}”`}
            {quote.shortened ? <span className="px-review-quote-cut">{t('review.pane.quoteShortened')}</span> : null}
          </span>
        )}
        {mayChange ? (
          <span className="px-review-item-acts">
            <Btn size="sm" variant="ghost" onClick={() => onEditing(!editing)}>
              {editing ? t('review.pane.note.stopEditing') : t('review.pane.note.edit')}
            </Btn>
            <Btn
              size="sm"
              variant="danger"
              pending={busy === 'remove'}
              pendingFailed={cameTo === 'refused'}
              pendingSucceeded={cameTo === 'done'}
              // REMOVED BY THIS PRESS ONLY WHEN THE DOOR SAYS SO. It answers 200 for a comment already removed, with
              // `alreadyDeleted` beside `ok`, which the type of `api.deleteRecord` does not name; that ends plainly.
              onClick={() => done('remove', () => api.deleteRecord(note.id), (answer) => (answer as { alreadyDeleted?: unknown }).alreadyDeleted === false)}
              {...offWhile('remove')}
            >
              {t('review.pane.note.remove')}
            </Btn>
          </span>
        ) : null}
      </div>

      {/* THE WORDS, AND BESIDE THEM WHAT MOLE OFFICE MADE OF THEM. One column when nothing was made of
          them, which is every caller outside the review pane. The headings appear only in the pair,
          because a label over a lone paragraph is furniture.
          IT DOES NOT SAY "what you wrote". Who wrote a comment is read from the revision ledger on
          the server, and this pane is not told; the record's owner is the person this installation
          belongs to whoever wrote the row, so calling it theirs would call an agent's comment one
          of yours. `outsideWords` above makes the same point about the same fact. */}
      <div className="px-two" data-pair={beside === undefined ? undefined : '1'}>
        <div className="px-two-side">
          {beside === undefined ? null : <p className="px-two-head">{t('review.pane.note.saysHead')}</p>}
          {editing && mayChange ? (
            <>
              <TextArea
                value={body}
                onChange={setBody}
                rows={2}
                growTo={10}
                aria-label={t('review.pane.note.saysLabel')}
                onKeyDown={aSendKeyPress<HTMLTextAreaElement>(sendKey, () => {
                  // ONLY WHEN THE SAVE PRESS WOULD ACT: not while it is pending and not on an empty box.
                  if (busy === null && body.trim() !== '') done('save', () => api.rewriteAnnotation(note.id, body))
                })}
              />
              <Btn
                size="sm"
                pending={busy === 'save'}
                pendingFailed={cameTo === 'refused'}
                onClick={() => done('save', () => api.rewriteAnnotation(note.id, body))}
                {...(body.trim() === '' ? { disabled: true, reason: t('review.pane.note.mustSay') } : offWhile('save'))}
              >
                {t('review.pane.note.save')}
              </Btn>
            </>
          ) : (
            // A COMMENT WORTH WRITING IS USUALLY SEVERAL SENTENCES, so it is read at the product's
            // reading column rather than at whatever width this pane happens to have.
            <p className="px-review-body prose-measure">{note.body}</p>
          )}
        </div>
        {beside === undefined ? null : <div className="px-two-side">{beside}</div>}
      </div>

      {carried ? (
        <p className="px-review-note">
          {t('review.pane.note.alreadySent')}
        </p>
      ) : mayGo ? (
        <div className="px-review-item-head">
          {/* WHERE IT WOULD GO, IN THE SERVER'S OWN WORDS, AND STORED. A choice made here is
              written onto the comment before this line changes, so what a person reads is what
              Mole Office holds — not what this browser is remembering until something reloads. */}
          <span className="px-review-to">
            {chosen === null ? t('review.pane.read.nobodyChosen') : chosen.sentence === undefined ? chosen.says : sayTheLine(chosen.sentence)}
          </span>
          <span className="px-review-item-acts">
            <Btn size="sm" variant="secondary" onClick={() => setPicking((v) => !v)}>
              {chosen === null ? t('review.pane.note.choose') : t('review.pane.note.change')}
            </Btn>
            {chosen === null || onSend === undefined ? null : (
              <Btn size="sm" pending={sending === true} pendingFailed={sendFailed} pendingSucceeded={sendSucceeded} onClick={onSend}>
                {t('review.pane.note.send')}
              </Btn>
            )}
          </span>
        </div>
      ) : null}

      {picking ? (
        <ContactsForAReview
          asked={asked ?? { about: note.context, review: null }}
          onChoose={(choice) => {
            onChoose(choice)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}

      {failed === null ? null : <ErrorNote message={failed.message} fault={theFaultANoteDraws(failed.fault)} label={t('review.pane.note.notMade')} />}
      {choiceFailed === null ? null : (
        <ErrorNote message={choiceFailed.message} fault={theFaultANoteDraws(choiceFailed.fault)} label={t('review.pane.note.notStored')} />
      )}
    </div>
  )
}

/**
 * AN AGENT CHOSEN FROM THE CHAT'S CONTACTS, with its record in this project.
 *
 * A contact names an agent by its registry id. A comment's `chosenRecipient` names a durable agent by the id of its
 * record of kind "agent" (GET /api/kinds), which is what the send reads. The two are joined by the `record` field of
 * GET /api/participants, read once through `readParticipantsOnce`, the same read the contact list draws its names from.
 */
type AgentContact = { who: ContactRef; agentRecordId: string }

/** Why a press on a contact chose nobody, or null when it chose somebody or nothing was pressed yet. */
type NotChosen = 'a person' | 'no record here' | null

/**
 * WHO A REVIEW'S COMMENTS GO TO, OR WHO READS THEM: THE CHAT'S CONTACTS.
 *
 * Problem sLyxTMlvze6A. The right-click panel draws the chat's contacts as one short list with a
 * filter box, by option B of a decision, and a review chooses the same way.
 * So this draws the panel's own list, `TheChatContacts` from TalkBox.tsx, which reads the chat's
 * contacts through the one read the chat uses.
 * There is no second list of contacts here.
 *
 * A REVIEW'S COMMENTS GO TO AN AGENT. A press on an agent with a record in this project chooses it and closes the list.
 * The contacts also hold people, and a review cannot be handed to a person; an agent may have no record in this
 * project. Either press chooses nobody, says why in a sentence, and leaves the list open. A press on a writer nobody
 * registered does what the chat does: it opens the chat there.
 */
function ContactsForAReview({
  asked,
  onChoose,
  onClose,
}: {
  /** What the choice is about, which the list's order reads. See `theRowsInOrder` in ContactsInOrder.tsx. */
  asked: WhatThePickIsAbout
  onChoose: (choice: AgentContact) => void
  onClose: () => void
}) {
  const [notChosen, setNotChosen] = useState<NotChosen>(null)
  const [failed, setFailed] = useState<Failure | null>(null)
  // WHETHER THE LIST STAYS OPEN AFTER THIS PRESS. `TheChatContacts` calls `onDecideToLeave` straight after `onChoose`;
  // a press on an agent closes the list only once its record is read, and a press that chose nobody leaves it open.
  const stayOpen = useRef(false)
  return (
    <div className="px-review-contacts">
      <ContactsInOrder
        chosen={null}
        asked={asked}
        onChoose={(who) => {
          stayOpen.current = true
          setFailed(null)
          if (who.kind !== 'agent') {
            setNotChosen('a person')
            return
          }
          readParticipantsOnce().then(
            (registries) => {
              const record = registries.agents?.find((one) => one.id === who.id)?.record ?? null
              if (record === null) {
                setNotChosen('no record here')
                return
              }
              setNotChosen(null)
              onChoose({ who, agentRecordId: record })
              onClose()
            },
            (err: unknown) => setFailed({ message: errorMessage(err), fault: faultOf(err) }),
          )
        }}
        onDecideToLeave={() => {
          if (!stayOpen.current) onClose()
          stayOpen.current = false
        }}
      />
      {notChosen === 'a person' ? <p className="px-pane-note" role="status">{t('savedComment.personRefused')}</p> : null}
      {notChosen === 'no record here' ? (
        <p className="px-pane-note" role="status">{t('savedComment.agentHasNoRecord')}</p>
      ) : null}
      {failed === null ? null : <ErrorNote message={failed.message} fault={theFaultANoteDraws(failed.fault)} />}
    </div>
  )
}

/** An agent chosen from the contacts, in the shape the server takes for who a comment goes to. */
function aContactForTheServer(chosen: AgentContact): { kind: 'agent'; agentId: string; sessionId: null; said: null; why: null } {
  return { kind: 'agent', agentId: chosen.agentRecordId, sessionId: null, said: null, why: null }
}

// ---------------------------------------------------------------------------- the pane's own rules

/**
 * THE RULES FOR WHAT MOLE OFFICE MADE OF A COMMENT, drawn wherever that pair is drawn.
 *
 * It is its own stylesheet rather than part of the pane's because the pair appears on two surfaces:
 * the review pane, which emits the pane's rules, and a comment's own record page, which does not.
 * Every value is a token, so a preset swap re-skins it with everything else.
 */
const READING_CSS = `
.px-read { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

/* THE NAME OF THE COLUMN. Chrome, not content, which is what earns it capitals -- see the type
   rules in design/UX-CONTRACT.md. */
.px-read-head {
  margin: 0;
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-3);
}

/* A READING IS QUIETER THAN THE WORDS IT IS ABOUT, and that is the whole point of the pair: what
   somebody wrote is the record, and this is a claim about it. Same rail and ground as the sentence
   that says what a quoted passage used to hold, because both are Mole Office talking about somebody
   else's text. */
.px-read-says {
  margin: 0;
  padding: 6px;
  border-left: var(--rail) solid var(--border-strong);
  background: var(--panel-2);
  font-size: var(--fs-2);
  color: var(--text-2);
  line-height: var(--lh-body);
  overflow-wrap: break-word;
}

/* WHAT WAS SAID OF THIS COMMENT AND OTHERS AT ONCE. Same rail and ground as the reading above it,
   because it is the same reading talking; a dashed rail because it is not this comment's alone and
   no press on this comment changes it. */
.px-read-with {
  margin: 0;
  padding: 6px;
  border-left: var(--rail) dashed var(--border-strong);
  background: var(--panel-2);
  font-size: var(--fs-2);
  color: var(--text-2);
  line-height: var(--lh-body);
  overflow-wrap: break-word;
}

.px-read-note {
  margin: 0;
  font-size: var(--fs-1);
  color: var(--text-2);
  line-height: var(--lh-body);
  overflow-wrap: break-word;
}

.px-read-acts { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
`

/**
 * THE PANE'S OWN STYLESHEET.
 *
 * It is here rather than in agent-css.ts because the pane is a layout that composes with the page,
 * and the one number that matters — how wide it is — belongs beside the rule that reserves the
 * space. Every value is a token, so a preset swap re-skins it.
 *
 * IT TAKES SPACE FROM THE ROW RATHER THAN FLOATING OVER IT. A pane drawn over the page hides the
 * reading it is about. As a flex item it narrows the page, and the reading measure is a cap on the
 * space an element is given, so the prose narrows with it and nothing scrolls sideways.
 */
/**
 * A QUESTION OR AN ANSWER, AS THE MACHINE TEXT IT IS, WITH ITS EDGES MARKED.
 *
 * The box is capped at 12rem and scrolls both ways. Both were silent: an answer longer than twelve
 * lines simply stopped, and a long line ran off the right with no scrollbar on this platform. The
 * text is left exactly as it arrived — reflowing an agent's answer changes what was said — and the
 * edges say where it goes on. See components/InReach.tsx.
 */
function MachineText({ words, name }: { words: string; name: string }) {
  const reach = useReach(words)
  return (
    <InReachMark reach={reach}>
      <pre className="px-org-text" {...reachBox(reach, name)}>
        {words}
      </pre>
    </InReachMark>
  )
}

const PANE_CSS = `
.shell-body:has(> .shell-main > .px-pane) {
  /* A NARROW COLUMN, AND THE PAGE MOVES ASIDE FOR IT (shape B). It takes a quarter of the
     room beside the rail, between 16rem and 20rem, and it is a flex item of the page's row, so the page is narrowed
     and nothing it shows is under the column. tests/the-page-moves-aside-for-the-review-column.test.ts measures that
     at 1440, 990 and 660. cqi is the shell container's width (App.tsx), read where the length is used. */
  --px-pane-width: clamp(16rem, 26cqi, 20rem);
}

.shell-body:has(> .shell-main > .px-pane[data-folded="1"]) { --px-pane-width: 3rem; }
/* THE TRAY TAKES NO ROOM BESIDE THE PAGE (wave 13y round 146, item 73a): the page keeps its whole width under it. After
   the folded rule, which says the same thing about the same element with the same weight. */
.shell-body:has(> .shell-main > .px-pane:has(.px-b-bar)) { --px-pane-width: 0px; }
.px-pane[data-folded="1"] { padding: 4px; }
.px-pane-width-control { display: flex; align-items: center; gap: 4px; }
.px-pane[data-folded="1"] .px-pane-width-control { flex-direction: column; }
.px-pane-fold-button { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.px-pane-head .px-btn.px-pane-fold-button { margin-left: 0; }
.px-pane-folded-count { font-variant-numeric: tabular-nums; }
.px-pane-expanded[hidden] { display: none; }
.px-pane-expanded { display: flex; flex-direction: column; gap: var(--gut); }

.px-pane {
  flex: 0 0 var(--px-pane-width);
  min-width: 0;
  align-self: flex-start;
  position: sticky;
  /* HELD UNDER THE FRAME'S TOP BAR, not at the window's top. Below 1024 wide
     the bar is held at the window's top and drawn over the page, so a pane held at 0 had its
     heading under the bar. --px-pane-stick is the bar's foot, 0 where no bar is drawn, written by
     useWhereThePaneFits in this file. */
  top: var(--px-pane-stick);
  /* FROM ITS TOP TO THE WINDOW'S FOOT OR ITS ROW'S, WHICHEVER IS HIGHER, and no taller. A pane as
     tall as the whole window ran past the window's foot before the page was scrolled, and at
     the page's end its row, which keeps room for the corner button, pushed it 80px above the
     window. --px-pane-top and --px-pane-foot are written by
     useWhereThePaneFits in this file.
     AND ABOVE THE CORNER CHAT BUTTON. Held to the window's foot, the column ran under the button, which covered its
     last lines whenever the page was not at its end (wave 13r round 17). --fab-room is the button's height with an
     inset above and below it, the same room the row keeps at the page's end. */
  max-height: calc(min(100dvh - var(--fab-room), var(--px-pane-foot)) - var(--px-pane-top));
  /* THE PANE IS THE ONE THING THAT SCROLLS, AT EVERY WIDTH, AND THAT IS THE WHOLE RULE.
     It used to be the comment list inside it, and that put a scrolling box inside a box of a fixed
     height whose other children could grow. The list was the only child allowed to give way, so
     everything the pane gained came out of the list, and once the rest of the pane was taller than
     the screen the list was given a height of nothing. Measured at 1440x1000 on 19 August 2026,
     with the send block drawn: the pane was 1000 tall and wanted 1133, the list was 0 tall with
     271 of comments inside it, and both More presses sat at their laid-out places with the pane
     painted over them -- visible to a person, and dead to a click. The same shape had already been
     found and fixed on a phone, in the band rule at the bottom of this file, and the note there
     says why: two scrolling boxes, one inside the other, leave the inner one no height to be
     given. One scrolling box, and everything in the pane is reachable by dragging it. */
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--gut);
  padding: var(--pad);
  background: var(--panel);
  border-left: var(--border-w) solid var(--border);
}

/* The route tabs sit above the page row. Keep their line inside the same room as the page. */
.shell-body:has(> .shell-main > .px-pane) > .px-where {
  width: calc(100% - var(--px-pane-width));
  margin-left: 0;
  margin-right: var(--px-pane-width);
}

.px-pane-body { display: flex; flex-direction: column; gap: var(--gut); }

/* ---- shape B: your review ----------------------------------------------------------------
   The title, who it goes to with Change, the comments, Send and Fold. In the tray, below, the row
   at the foot says the review in one line and the rest is its list. */
.px-b { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.px-b-head { display: flex; flex-direction: column; gap: 2px; }
.px-b-title { margin: 0; font-size: var(--fs-3); font-weight: 600; color: var(--text); }
.px-b-chip {
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px;
  margin: 0;
  padding: 4px 4px 4px 10px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  font-size: var(--fs-1);
  color: var(--text);
  overflow-wrap: anywhere;
}
/* NOBODY RECORDED WHO WROTE THE PAGE: an absence, drawn as one, with the same press beside it. */
.px-b-chip[data-ground="nobody-recorded"] { border-style: dashed; color: var(--text-2); }
.px-b-chip-words { flex: 1 1 8rem; min-width: 0; }
.px-b-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.px-b-comment {
  display: flex; flex-direction: column; gap: 2px;
  padding: 6px 0;
  border-top: var(--border-w) solid var(--border);
}
.px-b-on { margin: 0; font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; }
.px-b-body { margin: 0; color: var(--text); line-height: var(--lh-body); overflow-wrap: anywhere; }
.px-b-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.px-b-edit { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.px-b-edit > :first-child { align-self: stretch; }
.px-b-removed { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: var(--fs-1); color: var(--text-2); }
.px-b-do { display: flex; align-items: center; flex-wrap: wrap; gap: var(--gut); }
.px-b-more > summary { font-size: var(--fs-1); color: var(--text-2); cursor: pointer; }
.px-b-more-body { display: flex; flex-direction: column; gap: var(--gut); margin-top: var(--gut); }

/* ---- the tray: your review at the foot of the window, at every width (wave 13y round 146, item 73a) ----
   Only a review collecting, or one just sent from the tray, draws the row, and only then is the pane
   held at the foot. Anything else the pane draws (the list of reviews, a finished review opened from
   it) is still the column beside the page, or the band above it on a phone. The tray starts where
   the sidebar ends, as the strip at the page column's foot does (ReReadStrip.tsx), and its list
   opens upward. */
.px-b-bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px var(--gut);
  /* ROOM FOR THE CORNER CHAT BUTTON, which is drawn over the row's right end. */
  padding-right: var(--fab-room);
}
.px-b-bar-says { flex: 1 1 16rem; min-width: 0; margin: 0; font-size: var(--fs-1); color: var(--text); overflow-wrap: anywhere; }
.px-b-bar-do { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.shell-body .shell-main > .px-pane:has(.px-b-bar) {
  position: fixed;
  left: var(--sidebar-w, 0px); right: 0; bottom: 0; top: auto;
  z-index: var(--z-popover);
  max-height: 70dvh;
  padding: var(--pad) var(--fab-room) var(--fab-room) var(--pad);
  order: 0;
  border-left: none;
  border-bottom: none;
  border-top: var(--border-w) solid var(--border-strong);
}
.shell-body .shell-main > .px-pane:has(.px-b-bar)[data-sheet="0"] { padding-bottom: var(--pad); overflow: hidden; }
/* THE TRAY KEEPS CLEAR OF A CHAT SPLIT ON THE RIGHT. The tray is fixed across the foot of the
   window from the rail to the right edge, so where the chat owns that edge the tray ends where the
   chat begins. It reads the width the chat wrote on the root. */
:root[data-chat-split='right'] .shell-body .shell-main > .px-pane:has(.px-b-bar) { right: var(--chat-split-w, 0px); }
/* AND ON THE LEFT it begins where the chat ends. The shell's own column moves right by the chat's
   width, so a fixed tray still pinned to the rail began under the chat (round 154's check finding). */
:root[data-chat-split='left'] .shell-body .shell-main > .px-pane:has(.px-b-bar) { left: calc(var(--sidebar-w, 0px) + var(--chat-split-w, 0px)); }
/* THE TRAY HAS NO WIDTH TO FOLD, so the folded pane's control is not drawn and its list is. */
.px-pane:has(.px-b-bar) > :not(.px-pane-expanded) { display: none; }
.px-pane:has(.px-b-bar) > .px-pane-expanded[hidden] { display: flex; }
.px-pane:has(.px-b-bar)[data-sheet="0"] .px-pane-expanded > :not(.px-b),
.px-pane:has(.px-b-bar)[data-sheet="0"] .px-b > :not(.px-b-bar) { display: none; }
/* THE OPEN LIST SHOWS EACH PRESS ONCE: the row's Change, Hide comments and Send review, held at the top of the list
   while it scrolls. The chip's Change, and Send and Fold at the list's foot, are for a pane drawn without the tray, and
   in the tray they were drawn twice over (wave 13r round 16). */
.px-pane:has(.px-b-bar)[data-sheet="1"] .px-b-chip > button,
.px-pane:has(.px-b-bar)[data-sheet="1"] .px-b-do { display: none; }
.px-pane:has(.px-b-bar)[data-sheet="1"] .px-b-bar {
  position: sticky; top: calc(-1 * var(--pad)); z-index: 1;
  margin: calc(-1 * var(--pad)) calc(-1 * var(--pad)) 0;
  padding: var(--pad) calc(var(--pad) + var(--fab-room)) 6px var(--pad);
  background: var(--panel);
  border-bottom: var(--border-w) solid var(--border);
}
/* THE FOOT OF THE PAGE STAYS ABOVE THE TRAY. --px-b-bar-room is the row's measured height (useTheTrayRoom); the tray
   adds its padding and its top edge, and a third padding is a gap between the page's last line and the tray. With the
   padding and no edge, 2.3 pixels of the page were under the tray at 390 (wave 13y round 146).
   The tray stands in the room the row keeps for the corner button, so the row keeps the larger of the two, once. The
   row's own rule in App.tsx draws it: under the page, or, on a page that scrolls in its own box, the part the tray
   covers under the box and the rest at the box's end. */
.shell-body .shell-main:has(> .px-pane .px-b-bar) {
  --page-foot-covered: calc(var(--px-b-bar-room, 0px) + 3 * var(--pad) + var(--border-w));
  --page-end-room: max(var(--fab-room), var(--page-foot-covered));
}


.px-pane-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.px-pane-title { font-size: var(--fs-3); font-weight: 600; color: var(--text); }
.px-pane-count { font-size: var(--fs-1); color: var(--text-2); }
.px-pane-head .px-btn { margin-left: auto; }
/* THE STATE, THE THING AND THE COUNT TAKE A LINE OF THEIR OWN, under the title and its press. Since
   the line names the thing a review is of, it is longer, and left in the row
   it pushed the press onto a third line: at 390 the band then drew one comment where it had room
   for two (tests/the-review-pane-at-390.test.ts). */
.px-pane-head .px-pane-count { order: 1; flex-basis: 100%; }

.px-pane-scope > summary {
  font-size: var(--fs-1);
  color: var(--text-2);
  cursor: pointer;
}
/* THE SCOPE'S SENTENCE AND ITS GAPS, at the column's own spacing, as the body under More is. */
.px-pane-scope-body { display: flex; flex-direction: column; gap: var(--gut); margin-top: var(--gut); }
.px-pane-note {
  margin: 0;
  font-size: var(--fs-1);
  color: var(--text-2);
  line-height: var(--lh-body);
  overflow-wrap: break-word;
}

/* THE COMMENTS KEEP THEIR OWN HEIGHT AND NEVER GIVE IT UP. This is not a scrolling box and it is
   not the flexible child of one; the pane above it scrolls instead. See the note on .px-pane. */
.px-pane-list {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--gut);
}

.px-pane-do { display: flex; flex-direction: column; gap: 6px; }
.px-pane-ends { display: flex; align-items: center; gap: var(--gut); }
/* THE CONFIRM ROW. It is drawn where the footer was, and the press that completes the act is at the
   OTHER END of it from the press that opened it. That is the defence against a double-click: the
   second press of one lands on Cancel, which does nothing. It stays until one of the two is pressed
   or Escape is used -- no timer, because a window that lapses undoes somebody's intent silently. */
.px-pane-confirm {
  display: flex; align-items: center; justify-content: space-between; gap: var(--gut);
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
}
/* THE WORDS OF THE PRESS THAT COMPLETES THE ACT WRAP (wave 13y round 129). The pane beside the page is narrow, and on
   one line they ran out of it at 1440, 990 and 660, so their end was cut. They go onto a second line inside the press,
   and Cancel stays where the first press was. */
.px-pane-confirm > .px-btn:last-of-type { white-space: normal; text-align: center; }

/* ---- the two groups --------------------------------------------------------------------
   MEMBERSHIP IS POSITION, THE COUNT IS ON THE HEADING, AND THE RAIL TELLS THEM APART WITHOUT HUE.
   A solid rail on the group that is in the review, a dashed one on the group that is not. */
.px-pane-group {
  display: flex; flex-direction: column; gap: 6px;
  padding-left: var(--pad);
  border-left: var(--rail) solid var(--border-strong);
}
.px-pane-group[data-in="0"] { border-left-style: dashed; border-left-color: var(--border); }
.px-pane-heading {
  display: flex; align-items: baseline; gap: 6px;
  margin: 0;
  font-size: var(--fs-1); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--text-2);
}
.px-pane-heading-n { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--text); }
/* WHY A ROW IS NOT IN THE REVIEW, in one word from a closed set of seven, with the whole of it on
   the title. It is not an alarm and not a fault: a comment written before a review started is an
   ordinary thing that happened. */
.px-rev-why {
  align-self: flex-start;
  /* ROOM ABOVE AND BELOW THE WORDS. With none, the dashed edge touched Chinese characters, which fill their whole
     line (wave 13r round 17). */
  padding: 3px 6px;
  border: var(--border-w) dashed var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: var(--fs-1); font-weight: 600; color: var(--text-2);
}
/* A ROW WITH NOWHERE TO GO IS NOT A BUTTON. Mole Office cannot read the record as a comment, so it
   cannot say what the comment is about, and a press that scrolled anywhere would be a guess. */
.px-rev-go[data-go="0"] { cursor: default; }


/* ---- one comment ---- */

.px-rev-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0;
  border-top: var(--border-w) solid var(--border);
}

/* THE WHOLE ROW IS THE PRESS. It is a button so that a keyboard reaches it and a screen reader
   announces it as one; the border and the ground are the row's, not a button's. */
.px-rev-go {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  min-width: 0;
  padding: 4px;
  border: var(--border-w) solid transparent;
  border-radius: var(--radius-sm);
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.px-rev-go:hover { background: var(--hover); }
.px-rev-go:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: var(--focus-offset);
}

.px-rev-words {
  font-size: var(--fs-2);
  color: var(--text);
  line-height: var(--lh-body);
  overflow-wrap: break-word;
}

.px-rev-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: var(--fs-1);
  line-height: 1.3;
}

/* THE MARK SAYING THE FIRST WORDS ARE ALL THERE IS ROOM FOR. It is drawn a size down and a step
   quieter than the words, so it reads as a mark about the sentence rather than as its last word --
   which is what a mark at the reading size after a word with no punctuation in front of it does. */
.px-rev-cut {
  margin-left: 6px;
  font-size: var(--fs-1);
  color: var(--text-3);
  white-space: nowrap;
}

.px-rev-where { color: var(--text-3); overflow-wrap: break-word; }
.px-rev-quote { color: var(--text-2); font-style: italic; overflow-wrap: break-word; }
.px-rev-stands { color: var(--text-3); }
.px-rev-to { color: var(--text-2); }
.px-delivery-recovery { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.px-comment-recipient { display: block; color: var(--text-2); font-size: var(--fs-1); line-height: var(--lh-body); overflow-wrap: anywhere; }

/* THE ONE THING ON A ROW THAT ASKS FOR SOMETHING TO BE DONE. It is drawn a step darker and
   carries its own words -- no hue, because design/UX-CONTRACT.md gives hue to urgency and to
   identity and a comment whose words moved is neither an alarm nor a kind of thing. */
.px-rev-stale { color: var(--text-2); }
.px-rev-stale[data-act="1"] {
  color: var(--text);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: .16em;
}

.px-rev-acts { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

.px-rev-more { display: flex; flex-direction: column; gap: 6px; }

/* ---- the words, and what Mole Office made of them ---- */

/* TWO SIDES THAT TAKE A COLUMN EACH WHERE THERE IS ROOM FOR TWO, and stack where there is not.
   The pane is 22rem, so in the pane they stack and the words come first. The band this becomes
   above the page lets these sides share a row when there is room for both. The floor is a
   reading width rather than a guess: a side narrower than this is a word ladder. */
.px-two { display: flex; flex-wrap: wrap; gap: var(--gut); }
.px-two-side { flex: 1 1 20rem; min-width: 0; display: flex; flex-direction: column; gap: 6px; }

/* THE HEADING OVER EACH SIDE. It is chrome and not content, which is what earns it capitals --
   see the type rules in design/UX-CONTRACT.md. It is drawn only when there are two sides. */
.px-two-head {
  margin: 0;
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--text-3);
}


/* ---- having the comments read ---- */

/* IT IS A BLOCK OF ITS OWN, SEPARATED BY A RULE AND NOT BY A HUE. design/UX-CONTRACT.md spends a
   hue only where it changes what the reader does next, and this is an offer rather than an alarm.
   The rule and the heading are what say a new thing starts here. */
.px-org {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: var(--gut);
  border-top: var(--border-w) solid var(--border);
}
.px-org-head { margin: 0; font-size: var(--fs-3); font-weight: 600; color: var(--text); }

/* WHERE IT HAS GOT TO, READ FIRST. It is the reading size and the ordinary ink, because it is the
   sentence a person came to this block for; everything round it is a step quieter. */
.px-org-state {
  margin: 0;
  font-size: var(--fs-2);
  color: var(--text);
  line-height: var(--lh-body);
  overflow-wrap: break-word;
}

.px-org-label {
  margin: 0;
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--text-3);
}

/* THE QUESTION AND THE ANSWER ARE MACHINE TEXT AND ARE DRAWN AS SUCH. Both are long, so the block
   scrolls inside itself and never widens the pane -- nothing scrolls sideways at 1440 or 390. */
.px-org-text {
  margin: 0;
  max-height: 12rem;
  overflow: auto;
  padding: 6px;
  background: var(--panel-2);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.px-org-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.px-org-to { font-size: var(--fs-1); color: var(--text-2); }
.px-org-acts { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.px-org-self > summary { font-size: var(--fs-1); color: var(--text-2); cursor: pointer; }
.px-org-self { display: flex; flex-direction: column; gap: 6px; }
.px-org-said {
  margin: 0;
  font-size: var(--fs-1);
  color: var(--text);
  line-height: var(--lh-body);
  overflow-wrap: break-word;
  white-space: pre-line;
}

/* ---- sending it ---- */

/* ONE LINE PER COMMENT, INCLUDING THE ONES GOING NOWHERE. No bullets and no numbers: the quoted
   words are what tells one row from the next, and a marker would be a second thing to read first. */
.px-send-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.px-send-one {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-left: 6px;
  border-left: 2px solid var(--border);
}
/* ONE MESSAGE FOR EACH AGENT. Numbered, because the message numbers its comments and the agent
   answers by number; the number here is the number in the message. */
.px-send-messages {
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.px-send-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding-left: 6px;
  border-left: 2px solid var(--border);
}
.px-send-to {
  font-size: var(--fs-1);
  color: var(--text);
  font-weight: 600;
  overflow-wrap: anywhere;
}
/* A LIST, NOT A FLEX BOX: a flex item loses its list marker, and the marker is the number. */
.px-send-numbered {
  margin: 0;
  padding-left: 1.6em;
  list-style: decimal;
}
.px-send-carried { display: list-item; font-size: var(--fs-1); color: var(--text-2); min-width: 0; }
.px-send-carried + .px-send-carried { margin-top: 4px; }
.px-send-carried > span { display: block; }
.px-send-quote {
  font-size: var(--fs-1);
  color: var(--text-2);
  overflow-wrap: anywhere;
}
/* A COMMENT THAT IS NOT GOING IS TOLD APART BY WEIGHT AND NOT BY A HUE. It is not an alarm; it is
   the ordinary case of a comment nobody has chosen an agent for. */
.px-send-staying { border-left-color: var(--text-3); }
.px-send-body {
  font-size: var(--fs-1);
  color: var(--text);
  overflow-wrap: anywhere;
}
.px-send-says {
  font-size: var(--fs-1);
  color: var(--text-2);
  line-height: var(--lh-body);
  overflow-wrap: break-word;
}
/* WHAT MOLE OFFICE ANSWERED, WITH ITS OWN LINE BREAKS KEPT. It names every comment that stayed behind,
   one per line, and running those into a paragraph is how a list of five becomes unreadable. */
.px-send-said {
  margin: 0;
  font-size: var(--fs-1);
  color: var(--text);
  line-height: var(--lh-body);
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

/* THE ONE LINE SOMEBODY WROTE ABOUT THE THING A COMMENT IS ABOUT. Prose, at the product's reading
   size, because it is writing and not a field value. */
.px-rev-gist {
  margin: 0;
  font-size: var(--fs-2);
  color: var(--text-2);
  line-height: var(--lh-body);
  overflow-wrap: break-word;
}

.px-rev-held {
  margin: 0;
  padding: 6px;
  border-left: var(--rail) solid var(--border-strong);
  background: var(--panel-2);
  font-size: var(--fs-1);
  color: var(--text-2);
  line-height: var(--lh-body);
  overflow-wrap: break-word;
}

/* A COLUMN NEEDS A COLUMN'S WIDTH. Below that there is none, so the pane becomes a band above the
   page -- the slot the banner used to have -- and the page keeps the whole width. */
${SHELL_BAND_QUERY} {
  .shell-body:has(> .shell-main > .px-pane) { --px-pane-width: 0px; }

  .shell-body:has(> .shell-main > .px-pane) > .px-where {
    width: 100%;
    margin-right: 0;
  }

  .shell-body:has(> .shell-main > .px-pane[data-folded="1"]) { --px-pane-width: 0px; }
  .px-pane[data-folded="1"] .px-pane-width-control { flex-direction: row; }
  .px-pane[data-folded="1"] { min-height: 44px; }
  .px-pane {
    flex: 0 0 auto;
    width: auto;
    align-self: stretch;
    position: static;
    /* HOW TALL THE BAND IS, AND THE NUMBER IS MEASURED TWICE.
       A third of the screen was the last number, and at 390x844 it made the pane draw NONE of the
       comments it said it held: the band was 279px, the heading and the two presses under it took
       all of it, and the scrolling list was left 19px tall with 501px of comments inside it. The
       count at the top read "4 comments, 1 sent" over an empty column. That is the contract's
       clause by name -- the value works in one view and disappears from the other.
       Half the screen is 422px here. The heading takes the first 128 and the comments have the
       rest, which draws three of them, and the report underneath starts at 491 of 844 -- on the
       screen, not below the fold, which is what the third of a screen was protecting. */
    max-height: 50vh;
    /* THE BAND SCROLLS, NOT THE LIST INSIDE IT, and that rule is now in .px-pane above rather than
       here. It was written here first, because this is where the fault was found; on 19 August 2026
       the same fault was measured at the desk, so the rule moved to the place that governs both
       widths. What is left here is only what a band needs and a column does not. */
    border-left: none;
    border-bottom: var(--border-w) solid var(--border);
    /* A PRESSED COUNT TAKES THE WINDOW TO THE BAND (ReviewPane), and it stops below the frame's top bar,
       which is drawn over the page. The window keeps the bar's height clear at its top
       (App.tsx), so the band asks only for what ends lower than the bar. */
    scroll-margin-top: var(--px-pane-past-bar);
    /* ABOVE THE PAGE, which is the slot the banner had. It comes after the page in the markup so
       that a screen reader and the keyboard reach the reading first at every width; only the
       drawing moves. */
    order: -1;
  }

  /* ---- the tray on a phone: its row's words above its presses ---- */
  .px-b-bar { flex-direction: column; align-items: stretch; }
  .px-b-bar-says { flex: none; }
}

/* A TALK BOX DRAWN AS A SHEET STANDS ON THE REVIEW BAR, NOT OVER IT. --px-b-pane-room is the measured height of the
   pane at the window's foot, and it is set only while the phone's bar is drawn (YourReview). The talk box is in the
   overlay layer, outside the shell's container, so this rule is outside the band's query and reads the measure. */
:root .px-talk[data-sheet] {
  bottom: var(--px-b-pane-room, 0px);
  max-height: calc(100dvh - 2rem - var(--px-b-pane-room, 0px));
}
/* THE QUESTION ON LEAVING IS THE ONLY THING ON THE SCREEN WHILE IT IS ASKED. A talk box still open (the "Written
   down" note after Start review, say) is put out of sight until the question is answered (wave 13r round 16). */
:root:has([data-part="leave-question"]) .px-talk { display: none; }
`

/**
 * THE QUESTION ASKED ON LEAVING A PAGE, in a sheet of its own. It was in PANE_CSS, which is drawn only while the review
 * column is open, so with the column shut the question was drawn with no scrim, in the page's flow, under the page.
 */
const LEAVE_CSS = `
/* ---- the question asked on leaving a page whose review holds comments ---- */
.px-leave-scrim {
  position: fixed; inset: 0;
  z-index: var(--z-overlay);
  display: grid; place-items: center;
  padding: var(--pad);
  background: rgba(0, 0, 0, .35);
}
.px-leave {
  display: flex; flex-direction: column; gap: var(--gut);
  width: min(30rem, 100%);
  max-height: calc(100dvh - 2 * var(--pad));
  overflow-y: auto;
  padding: var(--pad-lg);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
}
.px-leave-title { margin: 0; font-size: var(--fs-3); font-weight: 600; }
.px-leave-says { margin: 0; line-height: var(--lh-body); }
.px-leave-do { display: flex; flex-wrap: wrap; gap: var(--gut); }
`
